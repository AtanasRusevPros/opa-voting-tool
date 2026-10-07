// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later
import fs from "node:fs/promises";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { randomUUID } from "node:crypto";
import type { AppConfig } from "./types.js";

/** VACUUM INTO uses SQLite's consistent snapshot, including committed WAL data.
 * A separate thread keeps database copying/integrity checks off the realtime loop. */
export async function snapshotDatabase(source: string, destination: string): Promise<void> {
  await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  await new Promise<void>((resolve, reject) => {
    const worker = new Worker(`
      const { workerData } = require('node:worker_threads');
      const { DatabaseSync } = require('node:sqlite');
      const fs = require('node:fs');
      let db;
      try {
        db = new DatabaseSync(workerData.source, { readOnly: true });
        db.exec('PRAGMA busy_timeout = 5000');
        db.prepare('VACUUM INTO ?').run(workerData.destination);
        db.close(); db = undefined;
        fs.chmodSync(workerData.destination, 0o600);
        db = new DatabaseSync(workerData.destination, { readOnly: true });
        const result = db.prepare('PRAGMA integrity_check').all();
        if (result.length !== 1 || result[0].integrity_check !== 'ok') throw new Error('Backup integrity check failed');
      } finally { if (db) db.close(); }
    `, { eval: true, workerData: { source, destination } });
    worker.once("error", reject);
    worker.once("exit", code => code === 0 ? resolve() : reject(new Error(`Backup worker exited ${code}`)));
  });
}

const completedPattern = /^snapshot-(\d{13})-[a-f0-9-]+\.db$/;
const temporaryPattern = /^snapshot-\d{13}-[a-f0-9-]+\.db\.partial$/;
export class BackupManager {
  private running = false;
  private timer?: ReturnType<typeof setInterval>;
  readonly directory: string;
  constructor(private config: Pick<AppConfig, "dataDir" | "databasePath" | "backups">,
    private snapshot = snapshotDatabase,
    private report: (message: string) => void = message => console.error(message)) {
    this.directory = path.join(config.dataDir, "backups");
  }
  start(): void {
    if (this.timer || !this.config.backups?.enabled) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), 60_000);
    this.timer.unref();
  }
  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = undefined; }
  async tick(now = Date.now()): Promise<void> {
    if (!this.config.backups?.enabled || this.running) return;
    this.running = true;
    let temporary: string | undefined;
    try {
      await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
      const entries = await fs.readdir(this.directory, { withFileTypes: true });
      const completed: { name: string; created: number }[] = [];
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        // One app process owns the data directory. Remove interrupted unpublished copies.
        if (temporaryPattern.test(entry.name)) { await fs.unlink(path.join(this.directory, entry.name)); continue; }
        const match = completedPattern.exec(entry.name);
        if (match) completed.push({ name: entry.name, created: Number(match[1]) });
      }
      completed.sort((a, b) => b.created - a.created || b.name.localeCompare(a.name));
      const retained = [];
      for (const entry of completed) {
        if (now - entry.created >= this.config.backups.maxAgeDays * 86400_000 || retained.length >= 3) {
          await fs.unlink(path.join(this.directory, entry.name));
        } else retained.push(entry);
      }
      if (retained[0] && now - retained[0].created < this.config.backups.intervalHours * 3600_000) return;
      const name = `snapshot-${now}-${randomUUID()}.db`;
      temporary = path.join(this.directory, `${name}.partial`);
      await this.snapshot(this.config.databasePath, temporary);
      await fs.rename(temporary, path.join(this.directory, name));
      temporary = undefined;
      for (const entry of retained.slice(2)) await fs.unlink(path.join(this.directory, entry.name));
    } catch {
      // No credentials, database contents or provider errors in the log.
      this.report("Automatic backup/retention failed; check storage permissions, free space and database health. Retry in one minute.");
    } finally {
      if (temporary) await fs.rm(temporary, { force: true }).catch(() => {});
      this.running = false;
    }
  }
}
