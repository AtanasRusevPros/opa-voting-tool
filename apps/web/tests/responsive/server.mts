// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later
// Disposable local data only. Never point this fixture at a deployed database.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const trial = process.argv[2] === 'trial';
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'opa-responsive-'));
Object.assign(process.env, {
  NODE_ENV: 'test', DATA_DIR: directory, DATABASE_PATH: path.join(directory,'test.db'),
  DEPLOYMENT_CONFIG_PATH: path.join(directory,'deployment.toml'), MANAGED_BRANDING_DIR: path.join(directory,'branding'),
  SUPER_ADMIN_USERNAME: 'local-test-admin', SUPER_ADMIN_PASSWORD: 'LocalOnlyTest123!'
});
fs.writeFileSync(process.env.DEPLOYMENT_CONFIG_PATH!, trial ? '[public_trial]\nenabled = true\nmode = "open_signup"\n[auth]\naccess_requests_enabled = false\n' : '');
const {server} = await import('../../../api/src/server.ts');
server.listen(trial ? 3138 : 3137, '127.0.0.1');
process.on('SIGTERM', () => { server.close(); fs.rmSync(directory,{recursive:true,force:true}); process.exit(0); });
