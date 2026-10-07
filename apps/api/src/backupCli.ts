// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later
import fs from "node:fs/promises";
import path from "node:path";
import { DeploymentConfigManager } from "./deploymentConfig.js";
const config = new DeploymentConfigManager().getConfig();
const directory = path.join(config.dataDir, "backups");
const names = await fs.readdir(directory).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return []; throw error; });
console.log(JSON.stringify({ enabled: config.backups?.enabled ?? false, intervalHours: config.backups?.intervalHours ?? 168,
  maxAgeDays: config.backups?.maxAgeDays ?? 21, maxCopies: 3, directory,
  snapshots: names.filter(name => /^snapshot-\d{13}-[a-f0-9-]+\.db$/.test(name)).sort().reverse().map(name => ({ name, createdAt: new Date(Number(name.split('-')[1])).toISOString() })) }, null, 2));
