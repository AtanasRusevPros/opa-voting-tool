// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  BRANDING_MANIFEST,
  DEFAULT_HISTORY_TIME_ZONE_KEYS,
  normalizeHistoryTimeZoneKeys,
  type BrandingManifest,
  type HistoryTimeZoneKey
} from "@planning-poker/shared";
import { repoRoot, resolveDefaultDeploymentConfigPath } from "./configPaths.js";
import type { AppConfig } from "./types.js";

type RawDeploymentConfig = {
  app: {
    baseUrl: string;
    allowedDomainsPath: string;
  };
  admin: {
    username: string;
    password: string;
    displayName: string;
  };
  smtp: {
    host: string;
    port: number | null;
    user: string;
    pass: string;
    from: string;
  };
  jira: {
    clientId: string;
    clientSecret: string;
    cloudId: string;
    siteUrl: string;
    siteName: string;
    accessToken: string;
    refreshToken: string;
    accessTokenExpiresAt: string;
  };
  branding: {
    loginLogo: string;
    loginBackground: string;
    teamLogo: string;
    teamBackground: string;
    backgroundOpacity: number;
    footerCreatorText: string;
    footerCompanyText: string;
    palette: BrandingManifest["palette"];
  };
  demo: {
    enabled: boolean;
  };
  historyPopup: {
    timezoneKeys: HistoryTimeZoneKey[];
  };
};

export type RevealableSecretField = "admin.password" | "smtp.pass" | "jira.clientSecret";

export type JiraSelectableSite = {
  cloudId: string;
  siteUrl: string;
  siteName: string;
};

export type DeploymentConfigView = {
  app: {
    baseUrl: string;
    allowedDomainsPath: string;
    deploymentConfigPath: string;
    managedBrandingDir: string;
  };
  admin: {
    username: string;
    displayName: string;
    passwordConfigured: boolean;
  };
  smtp: {
    host: string;
    port: number | null;
    user: string;
    from: string;
    passConfigured: boolean;
  };
  jira: {
    clientId: string;
    clientSecretConfigured: boolean;
    connected: boolean;
    siteUrl: string | null;
    siteName: string | null;
    cloudId: string | null;
    pendingSites: JiraSelectableSite[];
  };
  branding: RawDeploymentConfig["branding"];
  demo: {
    enabled: boolean;
  };
  historyPopup: {
    timezoneKeys: HistoryTimeZoneKey[];
  };
};

export type DeploymentConfigPatch = {
  app?: {
    baseUrl?: string;
  };
  admin?: {
    username?: string;
    password?: string;
    displayName?: string;
  };
  smtp?: {
    host?: string;
    port?: number | null;
    user?: string;
    pass?: string;
    from?: string;
  };
  jira?: {
    clientId?: string;
    clientSecret?: string;
    cloudId?: string;
    siteUrl?: string;
    siteName?: string;
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpiresAt?: string;
  };
  branding?: Omit<Partial<RawDeploymentConfig["branding"]>, "palette"> & {
    palette?: Partial<RawDeploymentConfig["branding"]["palette"]>;
  };
  demo?: {
    enabled?: boolean;
  };
  historyPopup?: {
    timezoneKeys?: HistoryTimeZoneKey[];
  };
};

export type BrandingAssetSlot = "loginLogo" | "loginBackground" | "teamLogo" | "teamBackground";

export type BrandingUploadInput = {
  slot: BrandingAssetSlot;
  fileName: string;
  mimeType: string;
  dataBase64: string;
};

export type DeploymentConfigSaveResult = {
  config: DeploymentConfigView;
  appliedFields: string[];
  restartRequiredFields: string[];
};

function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function quoteToml(value: string): string {
  return JSON.stringify(value);
}

function parseTomlValue(raw: string): boolean | number | string {
  const value = raw.trim();
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }
  if (value.startsWith("\"")) {
    return JSON.parse(value);
  }
  return value;
}

function parseTomlSections(raw: string): Record<string, Record<string, boolean | number | string>> {
  const sections: Record<string, Record<string, boolean | number | string>> = {};
  let sectionName = "";

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const sectionMatch = /^\[([a-zA-Z0-9_.-]+)\]$/.exec(line);
    if (sectionMatch) {
      sectionName = sectionMatch[1]!;
      sections[sectionName] = sections[sectionName] ?? {};
      continue;
    }
    const keyMatch = /^([a-zA-Z0-9_.-]+)\s*=\s*(.+)$/.exec(line);
    if (!keyMatch || !sectionName) {
      continue;
    }
    sections[sectionName]![keyMatch[1]!] = parseTomlValue(keyMatch[2]!);
  }

  return sections;
}

function buildDefaultDeploymentConfig(allowedDomainsPath: string, appBaseUrl: string): RawDeploymentConfig {
  return {
    app: {
      baseUrl: appBaseUrl,
      allowedDomainsPath
    },
    admin: {
      username: process.env.SUPER_ADMIN_USERNAME?.trim() ?? "",
      password: process.env.SUPER_ADMIN_PASSWORD?.trim() ?? "",
      displayName: process.env.SUPER_ADMIN_DISPLAY_NAME ?? "Super Admin"
    },
    smtp: {
      host: process.env.SMTP_HOST?.trim() ?? "",
      port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : null,
      user: process.env.SMTP_USER?.trim() ?? "",
      pass: process.env.SMTP_PASS?.trim() ?? "",
      from: process.env.SMTP_FROM?.trim() ?? ""
    },
    jira: {
      clientId: process.env.JIRA_CLIENT_ID?.trim() ?? "",
      clientSecret: process.env.JIRA_CLIENT_SECRET?.trim() ?? "",
      cloudId: process.env.JIRA_CLOUD_ID?.trim() ?? "",
      siteUrl: process.env.JIRA_SITE_URL?.trim() ?? "",
      siteName: process.env.JIRA_SITE_NAME?.trim() ?? "",
      accessToken: process.env.JIRA_ACCESS_TOKEN?.trim() ?? "",
      refreshToken: process.env.JIRA_REFRESH_TOKEN?.trim() ?? "",
      accessTokenExpiresAt: process.env.JIRA_ACCESS_TOKEN_EXPIRES_AT?.trim() ?? ""
    },
    branding: {
      loginLogo: BRANDING_MANIFEST.loginLogo,
      loginBackground: BRANDING_MANIFEST.loginBackground,
      teamLogo: BRANDING_MANIFEST.teamLogo,
      teamBackground: BRANDING_MANIFEST.teamBackground,
      backgroundOpacity: BRANDING_MANIFEST.backgroundOpacity,
      footerCreatorText: BRANDING_MANIFEST.footerCreatorText,
      footerCompanyText: BRANDING_MANIFEST.footerCompanyText,
      palette: { ...BRANDING_MANIFEST.palette }
    },
    demo: {
      enabled: false
    },
    historyPopup: {
      timezoneKeys: [...DEFAULT_HISTORY_TIME_ZONE_KEYS]
    }
  };
}

function normalizePathValue(filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.resolve(repoRoot, filePath);
}

function serializeDeploymentConfig(config: RawDeploymentConfig): string {
  return [
    "# Managed by the OPA Voting Tool super-admin settings UI.",
    "# Keep this file in a writable mounted config location in deployed environments.",
    "",
    "[app]",
    `base_url = ${quoteToml(config.app.baseUrl)}`,
    `allowed_domains_path = ${quoteToml(path.relative(repoRoot, normalizePathValue(config.app.allowedDomainsPath)) || config.app.allowedDomainsPath)}`,
    "",
    "[admin]",
    `username = ${quoteToml(config.admin.username)}`,
    `password = ${quoteToml(config.admin.password)}`,
    `display_name = ${quoteToml(config.admin.displayName)}`,
    "",
    "[smtp]",
    `host = ${quoteToml(config.smtp.host)}`,
    `port = ${config.smtp.port ?? 0}`,
    `user = ${quoteToml(config.smtp.user)}`,
    `pass = ${quoteToml(config.smtp.pass)}`,
    `from = ${quoteToml(config.smtp.from)}`,
    "",
    "[jira]",
    `client_id = ${quoteToml(config.jira.clientId)}`,
    `client_secret = ${quoteToml(config.jira.clientSecret)}`,
    `cloud_id = ${quoteToml(config.jira.cloudId)}`,
    `site_url = ${quoteToml(config.jira.siteUrl)}`,
    `site_name = ${quoteToml(config.jira.siteName)}`,
    `access_token = ${quoteToml(config.jira.accessToken)}`,
    `refresh_token = ${quoteToml(config.jira.refreshToken)}`,
    `access_token_expires_at = ${quoteToml(config.jira.accessTokenExpiresAt)}`,
    "",
    "[branding]",
    `login_logo = ${quoteToml(config.branding.loginLogo)}`,
    `login_background = ${quoteToml(config.branding.loginBackground)}`,
    `team_logo = ${quoteToml(config.branding.teamLogo)}`,
    `team_background = ${quoteToml(config.branding.teamBackground)}`,
    `background_opacity = ${config.branding.backgroundOpacity}`,
    `footer_creator_text = ${quoteToml(config.branding.footerCreatorText)}`,
    `footer_company_text = ${quoteToml(config.branding.footerCompanyText)}`,
    `primary_action = ${quoteToml(config.branding.palette.primaryAction)}`,
    `accent_highlight = ${quoteToml(config.branding.palette.accentHighlight)}`,
    `surface_tint = ${quoteToml(config.branding.palette.surfaceTint)}`,
    `text_emphasis = ${quoteToml(config.branding.palette.textEmphasis)}`,
    "",
    "[demo]",
    `enabled = ${config.demo.enabled ? "true" : "false"}`,
    "",
    "[history_popup]",
    `timezone_keys = ${quoteToml(JSON.stringify(config.historyPopup.timezoneKeys))}`,
    ""
  ].join("\n");
}

function parseHistoryPopupTimezoneKeys(value: boolean | number | string | undefined, fallback: readonly HistoryTimeZoneKey[]): HistoryTimeZoneKey[] {
  if (typeof value !== "string") {
    return [...fallback];
  }
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [...fallback];
    }
    const normalized = normalizeHistoryTimeZoneKeys(parsed);
    return normalized.length ? normalized : [...fallback];
  } catch {
    const normalized = normalizeHistoryTimeZoneKeys(
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
    );
    return normalized.length ? normalized : [...fallback];
  }
}

function parseDeploymentConfig(raw: string, defaults: RawDeploymentConfig): RawDeploymentConfig {
  const sections = parseTomlSections(raw);
  return {
    app: {
      baseUrl: String(sections.app?.base_url ?? defaults.app.baseUrl).trim() || defaults.app.baseUrl,
      allowedDomainsPath: normalizePathValue(String(sections.app?.allowed_domains_path ?? defaults.app.allowedDomainsPath))
    },
    admin: {
      username: String(sections.admin?.username ?? defaults.admin.username).trim() || defaults.admin.username,
      password: String(sections.admin?.password ?? defaults.admin.password).trim() || defaults.admin.password,
      displayName: String(sections.admin?.display_name ?? defaults.admin.displayName).trim() || defaults.admin.displayName
    },
    smtp: {
      host: String(sections.smtp?.host ?? defaults.smtp.host).trim(),
      port: Number(sections.smtp?.port ?? defaults.smtp.port ?? 0) > 0 ? Number(sections.smtp?.port ?? defaults.smtp.port) : null,
      user: String(sections.smtp?.user ?? defaults.smtp.user).trim(),
      pass: String(sections.smtp?.pass ?? defaults.smtp.pass).trim(),
      from: String(sections.smtp?.from ?? defaults.smtp.from).trim()
    },
    jira: {
      clientId: String(sections.jira?.client_id ?? defaults.jira.clientId).trim(),
      clientSecret: String(sections.jira?.client_secret ?? defaults.jira.clientSecret).trim(),
      cloudId: String(sections.jira?.cloud_id ?? defaults.jira.cloudId).trim(),
      siteUrl: String(sections.jira?.site_url ?? defaults.jira.siteUrl).trim(),
      siteName: String(sections.jira?.site_name ?? defaults.jira.siteName).trim(),
      accessToken: String(sections.jira?.access_token ?? defaults.jira.accessToken).trim(),
      refreshToken: String(sections.jira?.refresh_token ?? defaults.jira.refreshToken).trim(),
      accessTokenExpiresAt: String(sections.jira?.access_token_expires_at ?? defaults.jira.accessTokenExpiresAt).trim()
    },
    branding: {
      loginLogo: String(sections.branding?.login_logo ?? defaults.branding.loginLogo).trim() || defaults.branding.loginLogo,
      loginBackground: String(sections.branding?.login_background ?? defaults.branding.loginBackground).trim() || defaults.branding.loginBackground,
      teamLogo: String(sections.branding?.team_logo ?? defaults.branding.teamLogo).trim() || defaults.branding.teamLogo,
      teamBackground: String(sections.branding?.team_background ?? defaults.branding.teamBackground).trim() || defaults.branding.teamBackground,
      backgroundOpacity: clampOpacity(Number(sections.branding?.background_opacity ?? defaults.branding.backgroundOpacity)),
      footerCreatorText: String(sections.branding?.footer_creator_text ?? defaults.branding.footerCreatorText).trim(),
      footerCompanyText: String(sections.branding?.footer_company_text ?? defaults.branding.footerCompanyText).trim(),
      palette: {
        primaryAction: String(sections.branding?.primary_action ?? defaults.branding.palette.primaryAction).trim() || defaults.branding.palette.primaryAction,
        accentHighlight: String(sections.branding?.accent_highlight ?? defaults.branding.palette.accentHighlight).trim() || defaults.branding.palette.accentHighlight,
        surfaceTint: String(sections.branding?.surface_tint ?? defaults.branding.palette.surfaceTint).trim() || defaults.branding.palette.surfaceTint,
        textEmphasis: String(sections.branding?.text_emphasis ?? defaults.branding.palette.textEmphasis).trim() || defaults.branding.palette.textEmphasis
      }
    },
    demo: {
      enabled: Boolean(sections.demo?.enabled ?? defaults.demo.enabled)
    },
    historyPopup: {
      timezoneKeys: parseHistoryPopupTimezoneKeys(sections.history_popup?.timezone_keys, defaults.historyPopup.timezoneKeys)
    }
  };
}

function clampOpacity(value: number): number {
  if (!Number.isFinite(value)) {
    return BRANDING_MANIFEST.backgroundOpacity;
  }
  return Math.max(0, Math.min(1, Math.round(value * 100) / 100));
}

function validateRequiredAdminCredentials(config: RawDeploymentConfig, deploymentConfigPath: string) {
  if (config.admin.username.trim().length < 2 || config.admin.password.trim().length < 8) {
    throw new Error(
      [
        "Super-admin credentials are not configured.",
        `Create or edit ${deploymentConfigPath}, set [admin].username and [admin].password, save the file, then restart the app.`,
        "For deployed servers, run: ./deploy.sh config:migrate && ./deploy.sh config:edit",
        "The password must be at least 8 characters."
      ].join("\n")
    );
  }
}

function writeFileAtomic(filePath: string, contents: string) {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
  const tempPath = path.join(directory, `${path.basename(filePath)}.tmp`);
  fs.writeFileSync(tempPath, contents, "utf8");
  fs.renameSync(tempPath, filePath);
}

function inferUploadExtension(mimeType: string, fileName: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized === "image/svg+xml") {
    return ".svg";
  }
  if (normalized === "image/png") {
    return ".png";
  }
  if (normalized === "image/jpeg") {
    return ".jpg";
  }
  if (normalized === "image/webp") {
    return ".webp";
  }
  const extension = path.extname(fileName).toLowerCase();
  if ([".svg", ".png", ".jpg", ".jpeg", ".webp"].includes(extension)) {
    return extension === ".jpeg" ? ".jpg" : extension;
  }
  throw new Error("Unsupported branding asset type.");
}

function sanitizeFileStem(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "branding";
}

export class DeploymentConfigManager {
  private readonly defaults: RawDeploymentConfig;
  private readonly currentConfig: AppConfig;
  private rawConfig: RawDeploymentConfig;
  private pendingJiraSites: JiraSelectableSite[] = [];

  constructor() {
    const dataDir =
      process.env.DATA_DIR ??
      (process.env.NODE_ENV === "test" ? fs.mkdtempSync(path.join(os.tmpdir(), "planning-poker-config-")) : path.join(repoRoot, "apps/api/data"));
    fs.mkdirSync(dataDir, { recursive: true });

    const deploymentConfigPath =
      process.env.DEPLOYMENT_CONFIG_PATH ??
      (process.env.NODE_ENV === "test" ? path.join(dataDir, "deployment.toml") : resolveDefaultDeploymentConfigPath());
    const managedBrandingDir =
      process.env.MANAGED_BRANDING_DIR ??
      (process.env.NODE_ENV === "test" ? path.join(dataDir, "branding") : path.join(repoRoot, "config/managed-branding"));
    fs.mkdirSync(path.dirname(deploymentConfigPath), { recursive: true });
    fs.mkdirSync(managedBrandingDir, { recursive: true });

    const allowedDomainsPath = normalizePathValue(process.env.ALLOWED_DOMAINS_PATH ?? path.join(repoRoot, "config/allowed-domains.txt"));
    this.defaults = buildDefaultDeploymentConfig(allowedDomainsPath, process.env.APP_BASE_URL ?? "http://localhost:3001");

    if (!fs.existsSync(deploymentConfigPath)) {
      writeFileAtomic(deploymentConfigPath, serializeDeploymentConfig(this.defaults));
    }

    const rawFile = fs.readFileSync(deploymentConfigPath, "utf8");
    this.rawConfig = parseDeploymentConfig(rawFile, this.defaults);
    validateRequiredAdminCredentials(this.rawConfig, deploymentConfigPath);
    this.currentConfig = {
      port: parseNumber(process.env.PORT, 3001),
      host: process.env.HOST ?? "127.0.0.1",
      allowedDomainsPath: this.rawConfig.app.allowedDomainsPath,
      sessionTtlDays: parseNumber(process.env.SESSION_TTL_DAYS, 90),
      loginCodeTtlMinutes: parseNumber(process.env.LOGIN_CODE_TTL_MINUTES, 120),
      debugCodesEnabled: process.env.E2E_DEBUG_CODES === "1" || process.env.DEBUG_TOOLS_ENABLED === "1" || process.env.NODE_ENV !== "production",
      debugToolsEnabled: process.env.DEBUG_TOOLS_ENABLED === "1" || (process.env.NODE_ENV !== "production" && process.env.DEBUG_TOOLS_ENABLED !== "0"),
      dataDir,
      databasePath: process.env.DATABASE_PATH ?? path.join(dataDir, "planning-poker.db"),
      deploymentConfigPath,
      managedBrandingDir,
      smtpHost: undefined,
      smtpPort: undefined,
      smtpUser: undefined,
      smtpPass: undefined,
      smtpFrom: undefined,
      jiraClientId: undefined,
      jiraClientSecret: undefined,
      jiraCloudId: undefined,
      jiraSiteUrl: undefined,
      jiraSiteName: undefined,
      jiraAccessToken: undefined,
      jiraRefreshToken: undefined,
      jiraAccessTokenExpiresAt: undefined,
      appBaseUrl: this.rawConfig.app.baseUrl,
      simulatorModeEnabled: process.env.SIMULATOR_MODE_ENABLED === "1",
      simulatorSharedSecret: process.env.SIMULATOR_SHARED_SECRET ?? "planning-poker-simulator",
      demoModeEnabled: this.rawConfig.demo.enabled,
      defaultHistoryTimezoneKeys: [...this.rawConfig.historyPopup.timezoneKeys],
      superAdminUsername: this.rawConfig.admin.username,
      superAdminPassword: this.rawConfig.admin.password,
      superAdminDisplayName: this.rawConfig.admin.displayName,
      branding: {
        ...BRANDING_MANIFEST,
        ...this.rawConfig.branding,
        palette: { ...this.rawConfig.branding.palette },
        avatarKeys: [...BRANDING_MANIFEST.avatarKeys],
        avatarIconKeys: [...BRANDING_MANIFEST.avatarIconKeys],
        avatarColorKeys: [...BRANDING_MANIFEST.avatarColorKeys]
      }
    };
    this.applyRawConfig();
  }

  getConfig(): AppConfig {
    return this.currentConfig;
  }

  getRedactedConfig(): DeploymentConfigView {
    return {
      app: {
        baseUrl: this.currentConfig.appBaseUrl,
        allowedDomainsPath: this.currentConfig.allowedDomainsPath,
        deploymentConfigPath: this.currentConfig.deploymentConfigPath,
        managedBrandingDir: this.currentConfig.managedBrandingDir
      },
      admin: {
        username: this.currentConfig.superAdminUsername,
        displayName: this.currentConfig.superAdminDisplayName,
        passwordConfigured: this.currentConfig.superAdminPassword.trim().length > 0
      },
      smtp: {
        host: this.currentConfig.smtpHost ?? "",
        port: this.currentConfig.smtpPort ?? null,
        user: this.currentConfig.smtpUser ?? "",
        from: this.currentConfig.smtpFrom ?? "",
        passConfigured: (this.currentConfig.smtpPass ?? "").trim().length > 0
      },
      jira: {
        clientId: this.currentConfig.jiraClientId ?? "",
        clientSecretConfigured: (this.currentConfig.jiraClientSecret ?? "").trim().length > 0,
        connected: Boolean(this.currentConfig.jiraCloudId && this.currentConfig.jiraSiteUrl && this.currentConfig.jiraRefreshToken),
        siteUrl: this.currentConfig.jiraSiteUrl ?? null,
        siteName: this.currentConfig.jiraSiteName ?? null,
        cloudId: this.currentConfig.jiraCloudId ?? null,
        pendingSites: [...this.pendingJiraSites]
      },
      branding: {
        loginLogo: this.currentConfig.branding.loginLogo,
        loginBackground: this.currentConfig.branding.loginBackground,
        teamLogo: this.currentConfig.branding.teamLogo,
        teamBackground: this.currentConfig.branding.teamBackground,
        backgroundOpacity: this.currentConfig.branding.backgroundOpacity,
        footerCreatorText: this.currentConfig.branding.footerCreatorText,
        footerCompanyText: this.currentConfig.branding.footerCompanyText,
        palette: { ...this.currentConfig.branding.palette }
      },
      demo: {
        enabled: this.currentConfig.demoModeEnabled
      },
      historyPopup: {
        timezoneKeys: [...this.currentConfig.defaultHistoryTimezoneKeys]
      }
    };
  }

  revealSecret(field: RevealableSecretField): string {
    if (field === "admin.password") {
      return this.currentConfig.superAdminPassword;
    }
    if (field === "smtp.pass") {
      return this.currentConfig.smtpPass ?? "";
    }
    if (field === "jira.clientSecret") {
      return this.currentConfig.jiraClientSecret ?? "";
    }
    throw new Error("Unsupported secret field.");
  }

  updateConfig(patch: DeploymentConfigPatch): DeploymentConfigSaveResult {
    if (patch.app?.baseUrl !== undefined) {
      const nextBaseUrl = patch.app.baseUrl.trim();
      if (!nextBaseUrl) {
        throw new Error("Base URL is required.");
      }
      this.rawConfig.app.baseUrl = nextBaseUrl;
    }
    if (patch.admin?.username !== undefined) {
      const nextUsername = patch.admin.username.trim();
      if (nextUsername.length < 2) {
        throw new Error("Super-admin username must be at least 2 characters.");
      }
      this.rawConfig.admin.username = nextUsername;
    }
    if (patch.admin?.displayName !== undefined) {
      const nextDisplayName = patch.admin.displayName.trim();
      if (nextDisplayName.length < 2) {
        throw new Error("Super-admin display name must be at least 2 characters.");
      }
      this.rawConfig.admin.displayName = nextDisplayName;
    }
    if (patch.admin?.password !== undefined) {
      const nextPassword = patch.admin.password.trim();
      if (nextPassword.length < 8) {
        throw new Error("Super-admin password must be at least 8 characters.");
      }
      this.rawConfig.admin.password = nextPassword;
    }
    if (patch.smtp?.host !== undefined) {
      this.rawConfig.smtp.host = patch.smtp.host.trim();
    }
    if (patch.smtp?.port !== undefined) {
      this.rawConfig.smtp.port = patch.smtp.port;
    }
    if (patch.smtp?.user !== undefined) {
      this.rawConfig.smtp.user = patch.smtp.user.trim();
    }
    if (patch.smtp?.pass !== undefined) {
      this.rawConfig.smtp.pass = patch.smtp.pass.trim();
    }
    if (patch.smtp?.from !== undefined) {
      this.rawConfig.smtp.from = patch.smtp.from.trim();
    }
    if (patch.jira?.clientId !== undefined) {
      this.rawConfig.jira.clientId = patch.jira.clientId.trim();
    }
    if (patch.jira?.clientSecret !== undefined) {
      this.rawConfig.jira.clientSecret = patch.jira.clientSecret.trim();
    }
    if (patch.jira?.cloudId !== undefined) {
      this.rawConfig.jira.cloudId = patch.jira.cloudId.trim();
    }
    if (patch.jira?.siteUrl !== undefined) {
      this.rawConfig.jira.siteUrl = patch.jira.siteUrl.trim();
    }
    if (patch.jira?.siteName !== undefined) {
      this.rawConfig.jira.siteName = patch.jira.siteName.trim();
    }
    if (patch.jira?.accessToken !== undefined) {
      this.rawConfig.jira.accessToken = patch.jira.accessToken.trim();
    }
    if (patch.jira?.refreshToken !== undefined) {
      this.rawConfig.jira.refreshToken = patch.jira.refreshToken.trim();
    }
    if (patch.jira?.accessTokenExpiresAt !== undefined) {
      this.rawConfig.jira.accessTokenExpiresAt = patch.jira.accessTokenExpiresAt.trim();
    }
    if (patch.branding?.backgroundOpacity !== undefined) {
      this.rawConfig.branding.backgroundOpacity = clampOpacity(patch.branding.backgroundOpacity);
    }
    if (patch.branding?.footerCreatorText !== undefined) {
      this.rawConfig.branding.footerCreatorText = patch.branding.footerCreatorText.trim();
    }
    if (patch.branding?.footerCompanyText !== undefined) {
      this.rawConfig.branding.footerCompanyText = patch.branding.footerCompanyText.trim();
    }
    if (patch.branding?.palette?.primaryAction !== undefined) {
      this.rawConfig.branding.palette.primaryAction = patch.branding.palette.primaryAction.trim();
    }
    if (patch.branding?.palette?.accentHighlight !== undefined) {
      this.rawConfig.branding.palette.accentHighlight = patch.branding.palette.accentHighlight.trim();
    }
    if (patch.branding?.palette?.surfaceTint !== undefined) {
      this.rawConfig.branding.palette.surfaceTint = patch.branding.palette.surfaceTint.trim();
    }
    if (patch.branding?.palette?.textEmphasis !== undefined) {
      this.rawConfig.branding.palette.textEmphasis = patch.branding.palette.textEmphasis.trim();
    }
    if (patch.demo?.enabled !== undefined) {
      this.rawConfig.demo.enabled = patch.demo.enabled;
    }
    if (patch.historyPopup?.timezoneKeys !== undefined) {
      const normalized = normalizeHistoryTimeZoneKeys(patch.historyPopup.timezoneKeys);
      this.rawConfig.historyPopup.timezoneKeys = normalized.length ? normalized : [...DEFAULT_HISTORY_TIME_ZONE_KEYS];
    }

    this.persist();
    return {
      config: this.getRedactedConfig(),
      appliedFields: collectPatchFields(patch),
      restartRequiredFields: []
    };
  }

  setPendingJiraSites(sites: JiraSelectableSite[]): void {
    this.pendingJiraSites = [...sites];
  }

  clearPendingJiraSites(): void {
    this.pendingJiraSites = [];
  }

  storeBrandingAsset(input: BrandingUploadInput): DeploymentConfigSaveResult {
    const extension = inferUploadExtension(input.mimeType, input.fileName);
    const stem = sanitizeFileStem(input.slot);
    const fileName = `${stem}-${Date.now()}${extension}`;
    const outputPath = path.join(this.currentConfig.managedBrandingDir, fileName);
    const previousUrl = this.rawConfig.branding[input.slot];
    const buffer = Buffer.from(input.dataBase64, "base64");
    if (!buffer.length) {
      throw new Error("Uploaded branding file is empty.");
    }
    fs.writeFileSync(outputPath, buffer);
    this.rawConfig.branding[input.slot] = `/managed-branding/${fileName}`;

    if (previousUrl.startsWith("/managed-branding/")) {
      const previousPath = path.join(this.currentConfig.managedBrandingDir, path.basename(previousUrl));
      if (fs.existsSync(previousPath)) {
        fs.rmSync(previousPath, { force: true });
      }
    }

    this.persist();
    return {
      config: this.getRedactedConfig(),
      appliedFields: [`branding.${input.slot}`],
      restartRequiredFields: []
    };
  }

  private persist() {
    writeFileAtomic(this.currentConfig.deploymentConfigPath, serializeDeploymentConfig(this.rawConfig));
    this.applyRawConfig();
  }

  private applyRawConfig() {
    this.currentConfig.allowedDomainsPath = this.rawConfig.app.allowedDomainsPath;
    this.currentConfig.appBaseUrl = this.rawConfig.app.baseUrl;
    this.currentConfig.superAdminUsername = this.rawConfig.admin.username;
    this.currentConfig.superAdminPassword = this.rawConfig.admin.password;
    this.currentConfig.superAdminDisplayName = this.rawConfig.admin.displayName;
    this.currentConfig.smtpHost = this.rawConfig.smtp.host || undefined;
    this.currentConfig.smtpPort = this.rawConfig.smtp.port ?? undefined;
    this.currentConfig.smtpUser = this.rawConfig.smtp.user || undefined;
    this.currentConfig.smtpPass = this.rawConfig.smtp.pass || undefined;
    this.currentConfig.smtpFrom = this.rawConfig.smtp.from || undefined;
    this.currentConfig.jiraClientId = this.rawConfig.jira.clientId || undefined;
    this.currentConfig.jiraClientSecret = this.rawConfig.jira.clientSecret || undefined;
    this.currentConfig.jiraCloudId = this.rawConfig.jira.cloudId || undefined;
    this.currentConfig.jiraSiteUrl = this.rawConfig.jira.siteUrl || undefined;
    this.currentConfig.jiraSiteName = this.rawConfig.jira.siteName || undefined;
    this.currentConfig.jiraAccessToken = this.rawConfig.jira.accessToken || undefined;
    this.currentConfig.jiraRefreshToken = this.rawConfig.jira.refreshToken || undefined;
    this.currentConfig.jiraAccessTokenExpiresAt = this.rawConfig.jira.accessTokenExpiresAt || undefined;
    this.currentConfig.demoModeEnabled = this.rawConfig.demo.enabled;
    this.currentConfig.defaultHistoryTimezoneKeys = [...this.rawConfig.historyPopup.timezoneKeys];
    this.currentConfig.branding = {
      ...this.currentConfig.branding,
      ...this.rawConfig.branding,
      palette: { ...this.rawConfig.branding.palette },
      avatarKeys: [...BRANDING_MANIFEST.avatarKeys],
      avatarIconKeys: [...BRANDING_MANIFEST.avatarIconKeys],
      avatarColorKeys: [...BRANDING_MANIFEST.avatarColorKeys]
    };
  }
}

function collectPatchFields(patch: DeploymentConfigPatch): string[] {
  const fields: string[] = [];
  if (patch.app?.baseUrl !== undefined) {
    fields.push("app.baseUrl");
  }
  if (patch.admin?.username !== undefined) {
    fields.push("admin.username");
  }
  if (patch.admin?.displayName !== undefined) {
    fields.push("admin.displayName");
  }
  if (patch.admin?.password !== undefined) {
    fields.push("admin.password");
  }
  if (patch.smtp?.host !== undefined) {
    fields.push("smtp.host");
  }
  if (patch.smtp?.port !== undefined) {
    fields.push("smtp.port");
  }
  if (patch.smtp?.user !== undefined) {
    fields.push("smtp.user");
  }
  if (patch.smtp?.pass !== undefined) {
    fields.push("smtp.pass");
  }
  if (patch.smtp?.from !== undefined) {
    fields.push("smtp.from");
  }
  if (patch.jira?.clientId !== undefined) {
    fields.push("jira.clientId");
  }
  if (patch.jira?.clientSecret !== undefined) {
    fields.push("jira.clientSecret");
  }
  if (patch.jira?.cloudId !== undefined) {
    fields.push("jira.cloudId");
  }
  if (patch.jira?.siteUrl !== undefined) {
    fields.push("jira.siteUrl");
  }
  if (patch.jira?.siteName !== undefined) {
    fields.push("jira.siteName");
  }
  if (patch.jira?.accessToken !== undefined) {
    fields.push("jira.accessToken");
  }
  if (patch.jira?.refreshToken !== undefined) {
    fields.push("jira.refreshToken");
  }
  if (patch.jira?.accessTokenExpiresAt !== undefined) {
    fields.push("jira.accessTokenExpiresAt");
  }
  if (patch.branding?.backgroundOpacity !== undefined) {
    fields.push("branding.backgroundOpacity");
  }
  if (patch.branding?.footerCreatorText !== undefined) {
    fields.push("branding.footerCreatorText");
  }
  if (patch.branding?.footerCompanyText !== undefined) {
    fields.push("branding.footerCompanyText");
  }
  if (patch.branding?.palette?.primaryAction !== undefined) {
    fields.push("branding.palette.primaryAction");
  }
  if (patch.branding?.palette?.accentHighlight !== undefined) {
    fields.push("branding.palette.accentHighlight");
  }
  if (patch.branding?.palette?.surfaceTint !== undefined) {
    fields.push("branding.palette.surfaceTint");
  }
  if (patch.branding?.palette?.textEmphasis !== undefined) {
    fields.push("branding.palette.textEmphasis");
  }
  if (patch.demo?.enabled !== undefined) {
    fields.push("demo.enabled");
  }
  if (patch.historyPopup?.timezoneKeys !== undefined) {
    fields.push("historyPopup.timezoneKeys");
  }
  return fields;
}
