// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later
import {defineConfig} from '@playwright/test';

// Global appearance changes share a disposable installation: never parallelize workers.
export default defineConfig({
  testDir: './tests/themes', workers: 1, fullyParallel: false, timeout: 90000,
  outputDir: 'test-results/themes',
  reporter: [['list'], ['html', {outputFolder: 'playwright-report/themes', open: 'never'}]],
  use: {baseURL: 'http://127.0.0.1:3147', trace: 'retain-on-failure', screenshot: 'only-on-failure'},
  webServer: ['self', 'trial'].map(mode => ({
    command: `../api/node_modules/.bin/tsx tests/themes/server.mts ${mode}`,
    url: `http://127.0.0.1:${mode === 'trial' ? 3148 : 3147}/health`, reuseExistingServer: false
  })),
  projects: [{name: process.env.THEME_BROWSER || 'chromium', use: {
    browserName: (process.env.THEME_BROWSER || 'chromium') as 'chromium' | 'firefox' | 'webkit'
  }}]
});
