// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later
import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { privacySections } from "../src/http/privacyNotice.js";
import { BackupManager, snapshotDatabase } from "../src/backups.js";

const dirs: string[] = [];
afterEach(async () => { vi.useRealTimers(); for (const dir of dirs.splice(0)) await fs.rm(dir, { recursive: true, force: true }); });
async function setup(enabled = true) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "opa-backups-")); dirs.push(dataDir);
  const databasePath = path.join(dataDir, "live.db");
  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA journal_mode=WAL; CREATE TABLE records (value TEXT); INSERT INTO records VALUES ('retained');");
  db.close();
  return { dataDir, databasePath, backups: { enabled, intervalHours: 168, maxAgeDays: 21 } };
}
const week = 7 * 86400_000;
const start = 1800000000000;
async function names(manager: BackupManager) { return (await fs.readdir(manager.directory)).filter(n => n.endsWith('.db')); }

describe("app-managed backups", () => {
  it("is opt-in and creates no files when disabled", async () => {
    const config = await setup(false); const manager = new BackupManager(config);
    manager.start(); await manager.tick(start); manager.stop();
    await expect(fs.stat(manager.directory)).rejects.toThrow();
  });
  it("snapshots committed WAL data consistently and restores a readable database", async () => {
    const config = await setup(); const live = new DatabaseSync(config.databasePath);
    live.exec("INSERT INTO records VALUES ('committed in WAL'); BEGIN; INSERT INTO records VALUES ('uncommitted');");
    const manager = new BackupManager(config); await manager.tick(start);
    live.exec('ROLLBACK'); live.close();
    const copy = path.join(manager.directory, (await names(manager))[0]!);
    const restored = new DatabaseSync(copy);
    expect(restored.prepare('SELECT value FROM records').all()).toEqual([{ value: 'retained' }, { value: 'committed in WAL' }]);
    expect(restored.prepare('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' }); restored.close();
    expect((await fs.stat(copy)).mode & 0o777).toBe(0o600);
  });
  it("backs up weekly, uses persisted timestamps after restart, and keeps at most three", async () => {
    const config = await setup(); let manager = new BackupManager(config);
    await manager.tick(start); await manager.tick(start + week - 1); expect(await names(manager)).toHaveLength(1);
    manager = new BackupManager(config); await manager.tick(start + week); await manager.tick(start + 2 * week);
    expect(await names(manager)).toHaveLength(3);
    await manager.tick(start + 3 * week); expect(await names(manager)).toHaveLength(3);
    expect((await names(manager)).some(n => n.includes(String(start)))).toBe(false);
  });
  it("enforces count independently of age", async () => {
    const config = await setup(); config.backups.intervalHours = 1;
    const manager = new BackupManager(config);
    for (let i = 0; i < 5; i++) await manager.tick(start + i * 3600_000);
    expect(await names(manager)).toHaveLength(3);
  });
  it("expires old copies even on failure, preserves unrelated files, and recovers missed schedules", async () => {
    const config = await setup(); const manager = new BackupManager(config); await manager.tick(start);
    await fs.writeFile(path.join(manager.directory, 'operator-notes.txt'), 'keep');
    await fs.writeFile(path.join(manager.directory, `snapshot-${start}-abcd.db.partial`), 'interrupted');
    const report = vi.fn(); const failing = new BackupManager(config, async () => { throw Error('secret'); }, report);
    await failing.tick(start + 3 * week);
    expect(await names(manager)).toHaveLength(0);
    expect(await fs.readdir(manager.directory)).toEqual(['operator-notes.txt']);
    expect(report).toHaveBeenCalledOnce(); expect(report.mock.calls[0]![0]).not.toContain('secret');
    await manager.tick(start + 4 * week); expect(await names(manager)).toHaveLength(1);
  });
  it("does not prune the third valid copy when a replacement fails; cleans partial writes and retries", async () => {
    const config = await setup(); config.backups.intervalHours = 1;
    const manager = new BackupManager(config);
    for (let i = 0; i < 3; i++) await manager.tick(start + i * 3600_000);
    const failing = new BackupManager(config, async (_, file) => { await fs.writeFile(file, 'partial'); throw Error('disk full'); }, vi.fn());
    await failing.tick(start + 4 * 3600_000); expect(await names(manager)).toHaveLength(3);
    expect((await fs.readdir(manager.directory)).some(n => n.endsWith('.partial'))).toBe(false);
    await manager.tick(start + 4 * 3600_000); expect(await names(manager)).toHaveLength(3);
  });
  it("prevents overlapping snapshots", async () => {
    const config = await setup(); let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const snapshot = vi.fn(async (_: string, destination: string) => { await gate; await fs.writeFile(destination, 'test'); });
    const manager = new BackupManager(config, snapshot);
    const first = manager.tick(start); await manager.tick(start); release(); await first;
    expect(snapshot).toHaveBeenCalledOnce();
  });
  it("starts once and stops its internal timer", async () => {
    const manager = new BackupManager(await setup()); vi.useFakeTimers();
    const tick = vi.spyOn(manager, 'tick').mockResolvedValue();
    manager.start(); manager.start(); expect(tick).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000); expect(tick).toHaveBeenCalledTimes(2);
    manager.stop(); await vi.advanceTimersByTimeAsync(60_000); expect(tick).toHaveBeenCalledTimes(2);
  });
  it("rejects corrupt source databases", async () => {
    const config = await setup(); await fs.writeFile(config.databasePath, 'invalid sqlite');
    await expect(snapshotDatabase(config.databasePath, path.join(config.dataDir, 'broken.db'))).rejects.toThrow();
  });
});


describe("privacy notice matches configuration", () => {
  it("does not promise enabled backup retention when disabled", () => {
    const text = privacySections({}).map(s => s.body).join(" ");
    expect(text).toContain("scheduled backups are disabled");
    expect(text).toContain("not configured a public privacy contact");
    expect(text).toContain("still personal data, not anonymisation");
  });
  it("reports configured intervals, expiry and operator information", () => {
    const text = privacySections({ backups: { enabled: true, intervalHours: 168, maxAgeDays: 21 },
      privacy: { operatorName: "Test Operator", contactEmail: "privacy@example.com", providerDetails: "Test hosting in EU" } }).map(s => s.body).join(" ");
    expect(text).toContain("every 168 hours"); expect(text).toContain("after 21 days");
    expect(text).toContain("at most 3"); expect(text).toContain("privacy@example.com"); expect(text).toContain("Test hosting in EU");
    expect(text).toContain("shutdowns, disabled backups or storage failures");
    expect(text).toContain("Separate deployment archives");
    const custom = privacySections({ backups: { enabled: true, intervalHours: 48, maxAgeDays: 9 } }).map(s => s.body).join(" ");
    expect(custom).toContain("every 48 hours"); expect(custom).toContain("after 9 days");
  });
});


describe("deployment archive command", () => {
  it("creates consistent non-recursive archives, prunes only after success and preserves good archives on copy failure", async () => {
    const config = await setup();
    const script = path.join(config.dataDir, "deploy.sh");
    await fs.copyFile(new URL("../../../deploy.sh", import.meta.url), script);
    const bin = path.join(config.dataDir, "bin"); await fs.mkdir(bin);
    await fs.mkdir(path.join(config.dataDir, "config"));
    await fs.writeFile(path.join(config.dataDir, "config/deployment.local.toml"), '[app]\nbase_url = "http://localhost"\n');
    await fs.writeFile(path.join(bin, "podman"), `#!/usr/bin/env bash
set -euo pipefail
case "$1" in
 ps) echo disposable-test ;;
 exec) shift 2; "$@" ;;
 cp) [[ "\${FAIL_BACKUP_COPY:-0}" != 1 ]] || exit 1; cp "\${2#*:}" "$3" ;;
 *) exit 1 ;;
esac
`, { mode: 0o700 });
    const archives = path.join(config.dataDir, "archives");
    const env: NodeJS.ProcessEnv = { ...process.env, PATH: `${bin}:${path.dirname(process.execPath)}:${process.env.PATH}`, DATABASE_PATH: config.databasePath, BACKUP_DIR: archives };
    delete env.BACKUP_PRUNE_KEEP;
    const live = new DatabaseSync(config.databasePath);
    try {
      live.exec("INSERT INTO records VALUES ('committed WAL archive');");
      for (let i = 0; i < 4; i++) execFileSync("bash", [script, "backup"], { env, stdio: 'pipe' });
      const files = await fs.readdir(archives); expect(files).toHaveLength(3);
      const archive = path.join(archives, files[0]!);
      const entries = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' });
      expect(entries).toContain('./api-data/planning-poker.db');
      expect(entries).not.toContain('/backups/'); expect(entries).not.toContain('-wal');
      const restored = path.join(config.dataDir, 'restore'); await fs.mkdir(restored);
      execFileSync('tar', ['-xzf', archive, '-C', restored]);
      const db = new DatabaseSync(path.join(restored, 'api-data/planning-poker.db'));
      expect(db.prepare('SELECT value FROM records').all()).toContainEqual({ value: 'committed WAL archive' });
      expect(db.prepare('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' }); db.close();
      expect((await fs.stat(archive)).mode & 0o777).toBe(0o600);
      expect(() => execFileSync('bash', [script, 'backup'], { env: { ...env, FAIL_BACKUP_COPY: '1' }, stdio: 'pipe' })).toThrow();
      expect(await fs.readdir(archives)).toEqual(files);
    } finally { live.close(); }
  });
});
