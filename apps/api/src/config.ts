// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import fs from "node:fs";
import path from "node:path";
import { BRANDING_MANIFEST, DEFAULT_HISTORY_TIME_ZONE_KEYS } from "@planning-poker/shared";
import { repoRoot, resolveDefaultDeploymentConfigPath } from "./configPaths.js";
import type { AppConfig } from "./types.js";

function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getConfig(): AppConfig {
  const dataDir = process.env.DATA_DIR ?? path.join(repoRoot, "apps/api/data");
  fs.mkdirSync(dataDir, { recursive: true });
  const deploymentConfigPath = process.env.DEPLOYMENT_CONFIG_PATH ?? resolveDefaultDeploymentConfigPath();
  const managedBrandingDir = process.env.MANAGED_BRANDING_DIR ?? path.join(repoRoot, "config/managed-branding");
  const debugCodesEnabled = process.env.E2E_DEBUG_CODES === "1" || process.env.DEBUG_TOOLS_ENABLED === "1" || process.env.NODE_ENV !== "production";
  const debugToolsEnabled = process.env.DEBUG_TOOLS_ENABLED === "1" || (process.env.NODE_ENV !== "production" && process.env.DEBUG_TOOLS_ENABLED !== "0");

  return {
    port: parseNumber(process.env.PORT, 3001),
    host: process.env.HOST ?? "127.0.0.1",
    allowedDomainsPath: process.env.ALLOWED_DOMAINS_PATH ?? path.join(repoRoot, "config/allowed-domains.txt"),
    sessionTtlDays: parseNumber(process.env.SESSION_TTL_DAYS, 90),
    loginCodeTtlMinutes: parseNumber(process.env.LOGIN_CODE_TTL_MINUTES, 120),
    debugCodesEnabled,
    debugToolsEnabled,
    dataDir,
    databasePath: process.env.DATABASE_PATH ?? path.join(dataDir, "planning-poker.db"),
    deploymentConfigPath,
    managedBrandingDir,
    smtpHost: process.env.SMTP_HOST,
    smtpPort: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined,
    smtpUser: process.env.SMTP_USER,
    smtpPass: process.env.SMTP_PASS,
    smtpFrom: process.env.SMTP_FROM,
    jiraClientId: process.env.JIRA_CLIENT_ID,
    jiraClientSecret: process.env.JIRA_CLIENT_SECRET,
    jiraCloudId: process.env.JIRA_CLOUD_ID,
    jiraSiteUrl: process.env.JIRA_SITE_URL,
    jiraSiteName: process.env.JIRA_SITE_NAME,
    jiraAccessToken: process.env.JIRA_ACCESS_TOKEN,
    jiraRefreshToken: process.env.JIRA_REFRESH_TOKEN,
    jiraAccessTokenExpiresAt: process.env.JIRA_ACCESS_TOKEN_EXPIRES_AT,
    appBaseUrl: process.env.APP_BASE_URL ?? "http://localhost:3001",
    simulatorModeEnabled: process.env.SIMULATOR_MODE_ENABLED === "1",
    simulatorSharedSecret: process.env.SIMULATOR_SHARED_SECRET ?? "planning-poker-simulator",
    demoModeEnabled: false,
    superAdminUsername: process.env.SUPER_ADMIN_USERNAME ?? "",
    superAdminPassword: process.env.SUPER_ADMIN_PASSWORD ?? "",
    superAdminDisplayName: process.env.SUPER_ADMIN_DISPLAY_NAME ?? "Super Admin",
    branding: BRANDING_MANIFEST,
    defaultHistoryTimezoneKeys: [...DEFAULT_HISTORY_TIME_ZONE_KEYS]
  };
}

export function loadAllowedDomains(filePath: string): string[] {
  const raw = fs.readFileSync(filePath, "utf8");
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim().toLowerCase())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}
