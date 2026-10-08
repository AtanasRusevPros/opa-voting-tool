// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later
import {defineConfig} from '@playwright/test';
// Explicit UI-only suite. Separate from regular E2E and simulator ownership.
process.env.PLAYWRIGHT_TRIAL_BASE_URL ??= 'http://127.0.0.1:3138';
export default defineConfig({
  testDir: './tests/responsive', timeout: 90000, workers: 1,
  use: {baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3137', trace: 'retain-on-failure', screenshot: 'only-on-failure'},
  webServer: [
    ...(!process.env.PLAYWRIGHT_BASE_URL ? [{command:'../api/node_modules/.bin/tsx tests/responsive/server.mts self',url:'http://127.0.0.1:3137/health',reuseExistingServer:false}] : []),
    ...(process.env.PLAYWRIGHT_TRIAL_BASE_URL === 'http://127.0.0.1:3138' ? [{command:'../api/node_modules/.bin/tsx tests/responsive/server.mts trial',url:'http://127.0.0.1:3138/health',reuseExistingServer:false}] : [])
  ],
  projects: [{name:'chromium',use:{browserName:'chromium'}}]
});
