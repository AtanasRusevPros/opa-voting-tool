// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/transport', timeout: 60000, workers: 1,
  use: { trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }]
});
