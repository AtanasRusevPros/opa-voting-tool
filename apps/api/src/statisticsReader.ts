// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later
import { Worker } from 'node:worker_threads';
import type { StatisticsResponse } from '@planning-poker/shared';
import type { LiveStatistics } from './repository/statistics.js';

/** Bounded, coalesced reads keep SQLite/aggregation work off the voting event loop. */
export class StatisticsReader {
  private pending = new Map<string, Promise<StatisticsResponse>>();
  private cache = new Map<string, {until: number; data: StatisticsResponse}>();
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private databasePath: string) {}
  read(live: LiveStatistics, teamId?: string, days: 1 | 7 | 30 = 30, workspaceId?: string) {
    const requestedAt = Date.now();
    const key = JSON.stringify([teamId, days, workspaceId]);
    for (const [key, value] of this.cache) if (value.until <= Date.now()) this.cache.delete(key);
    const cached = this.cache.get(key);
    if (cached) return Promise.resolve(cached.data);
    const pending = this.pending.get(key);
    if (pending) return pending;
    if (this.pending.size >= 32) return Promise.reject(new Error('Statistics are busy. Please retry.'));
    const result = this.tail.then(() => new Promise<StatisticsResponse>((resolve, reject) => {
      // Node 22 strips the type-only syntax in this standalone, dependency-free module.
      const moduleUrl = new URL(import.meta.url.endsWith('.ts') ? './repository/statistics.ts' : './repository/statistics.js', import.meta.url).href;
      const worker = new Worker(`
        const {parentPort, workerData} = require('node:worker_threads');
        const {DatabaseSync} = require('node:sqlite');
        (async () => {
          const {readStatistics} = await import(workerData.moduleUrl);
          const db = new DatabaseSync(workerData.path, {readOnly: true});
          try {
            db.exec('PRAGMA busy_timeout = 5000; BEGIN');
            const result = readStatistics(db, workerData.live, workerData.teamId, workerData.days, Date.now(), workerData.workspaceId, false);
            db.exec('COMMIT');
            parentPort.postMessage(result);
          } finally { db.close(); }
        })().catch(error => { throw error; });
      `, {eval: true, execArgv: ['--experimental-strip-types'], workerData: {moduleUrl, path: this.databasePath, live, teamId, days, workspaceId}});
      const timeout = setTimeout(() => { void worker.terminate(); reject(new Error('Statistics request timed out. Please retry.')); }, 10000);
      worker.once('message', data => { clearTimeout(timeout); resolve(data); });
      worker.once('error', error => { clearTimeout(timeout); reject(error); });
      worker.once('exit', code => { clearTimeout(timeout); if (code !== 0) reject(new Error('Statistics worker failed. Please retry.')); });
    })).then(data => { this.cache.set(key, {until: requestedAt + 1000, data}); return data; }).finally(() => this.pending.delete(key));
    this.pending.set(key, result);
    this.tail = result.catch(() => {});
    return result;
  }
}
