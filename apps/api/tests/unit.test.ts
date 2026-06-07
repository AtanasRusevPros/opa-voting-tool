// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BRANDING_MANIFEST, calculateAverage, getDeckCards, getDeckLabel } from "@planning-poker/shared";
import { resolveDefaultDeploymentConfigPath } from "../src/configPaths.js";
import { getConfig, loadAllowedDomains } from "../src/config.js";
import { DeploymentConfigManager } from "../src/deploymentConfig.js";
import { runBaseSchema } from "../src/repository/schema.js";

const tempPaths: string[] = [];

afterEach(() => {
  for (const target of tempPaths.splice(0)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
  delete process.env.PORT;
  delete process.env.HOST;
  delete process.env.DATA_DIR;
  delete process.env.DATABASE_PATH;
  delete process.env.DEPLOYMENT_CONFIG_PATH;
  delete process.env.MANAGED_BRANDING_DIR;
  delete process.env.ALLOWED_DOMAINS_PATH;
  delete process.env.DEBUG_TOOLS_ENABLED;
  delete process.env.SIMULATOR_MODE_ENABLED;
  delete process.env.SIMULATOR_SHARED_SECRET;
  delete process.env.SUPER_ADMIN_USERNAME;
  delete process.env.SUPER_ADMIN_PASSWORD;
  delete process.env.SUPER_ADMIN_DISPLAY_NAME;
});

describe("loadAllowedDomains", () => {
  it("parses the dedicated allowlist file and ignores comments", () => {
    const file = path.join(os.tmpdir(), `domains-${Date.now()}.txt`);
    tempPaths.push(file);
    fs.writeFileSync(file, "# comment\nexample-company.com\n\nexample-partner.com\n");

    expect(loadAllowedDomains(file)).toEqual(["example-company.com", "example-partner.com"]);
  });
});

describe("runBaseSchema", () => {
  it("upgrades legacy tables before creating indexes for newly added columns", () => {
    const databasePath = path.join(os.tmpdir(), `legacy-schema-${Date.now()}.db`);
    tempPaths.push(databasePath);
    const db = new DatabaseSync(databasePath);

    try {
      db.exec(`
        CREATE TABLE teams (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL
        );
        CREATE TABLE rounds (
          id TEXT PRIMARY KEY,
          team_id TEXT NOT NULL,
          status TEXT NOT NULL
        );
        CREATE TABLE history_entries (
          id TEXT PRIMARY KEY,
          team_id TEXT NOT NULL,
          completed_at TEXT NOT NULL
        );
      `);

      runBaseSchema(db);

      const teamColumns = db.prepare("PRAGMA table_info(teams)").all() as Array<{ name: string }>;
      const roundColumns = db.prepare("PRAGMA table_info(rounds)").all() as Array<{ name: string }>;
      const historyColumns = db.prepare("PRAGMA table_info(history_entries)").all() as Array<{ name: string }>;
      const indexes = new Set((db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all() as Array<{ name: string }>).map((row) => row.name));

      expect(teamColumns.some((column) => column.name === "workspace_id")).toBe(true);
      expect(roundColumns.some((column) => column.name === "pending_issue_id")).toBe(true);
      expect(historyColumns.some((column) => column.name === "import_batch_id")).toBe(true);
      expect(historyColumns.some((column) => column.name === "import_entry_id")).toBe(true);
      expect(indexes).toContain("idx_teams_workspace");
      expect(indexes).toContain("idx_rounds_pending_issue");
      expect(indexes).toContain("idx_history_import_batch_entry");
    } finally {
      db.close();
    }
  });
});

describe("calculateAverage", () => {
  it("excludes non-numeric values from the average", () => {
    expect(calculateAverage(["3", "5", "?", "coffee"])).toBe(4);
  });

  it("returns null when there are no numeric votes", () => {
    expect(calculateAverage(["?", "coffee"])).toBeNull();
  });

  it("returns the nearest T-Shirt size by average deck position", () => {
    expect(calculateAverage(["XS", "S"], "tshirt")).toBe("S");
    expect(calculateAverage(["M", "L"], "tshirt")).toBe("L");
    expect(calculateAverage(["L", "XL", "?", "coffee"], "tshirt")).toBe("XL");
  });

  it("ignores non-scoring T-Shirt votes and returns null when none remain", () => {
    expect(calculateAverage(["XS", "?", "coffee"], "tshirt")).toBe("XS");
    expect(calculateAverage(["?", "coffee"], "tshirt")).toBeNull();
  });

  it("keeps representative numeric deck averages deterministic across all supported numeric decks", () => {
    expect(calculateAverage(["3", "5"], "fibonacci")).toBe(4);
    expect(calculateAverage(["8", "13"], "fibonacci-21")).toBe(10.5);
    expect(calculateAverage(["8", "20"], "modified-fibonacci")).toBe(14);
    expect(calculateAverage(["2", "6"], "linear-1-6")).toBe(4);
    expect(calculateAverage(["2", "8"], "linear-1-8")).toBe(5);
    expect(calculateAverage(["2", "10"], "linear-1-10")).toBe(6);
    expect(calculateAverage(["8", "32"], "powers-of-two")).toBe(20);
  });

  it("covers the full deck/result matrix across room sizes and non-scoring mixes", () => {
    const cases: Array<{
      name: string;
      deckKey: Parameters<typeof calculateAverage>[1];
      values: string[];
      expected: ReturnType<typeof calculateAverage>;
    }> = [
      { name: "fibonacci solo", deckKey: "fibonacci", values: ["8"], expected: 8 },
      { name: "fibonacci pair with non-scoring", deckKey: "fibonacci", values: ["3", "5", "?", "coffee"], expected: 4 },
      { name: "fibonacci four-person decimal", deckKey: "fibonacci", values: ["0.5", "1", "2", "3"], expected: 1.63 },
      { name: "fibonacci-21 solo", deckKey: "fibonacci-21", values: ["13"], expected: 13 },
      { name: "fibonacci-21 trio midpoint", deckKey: "fibonacci-21", values: ["3", "5", "8"], expected: 5.33 },
      { name: "modified fibonacci four-person", deckKey: "modified-fibonacci", values: ["3", "5", "8", "20"], expected: 9 },
      { name: "linear 1-6 trio", deckKey: "linear-1-6", values: ["1", "4", "6"], expected: 3.67 },
      { name: "linear 1-8 four-person", deckKey: "linear-1-8", values: ["2", "4", "6", "8"], expected: 5 },
      { name: "linear 1-10 with non-scoring", deckKey: "linear-1-10", values: ["1", "5", "10", "coffee"], expected: 5.33 },
      { name: "powers of two trio", deckKey: "powers-of-two", values: ["2", "8", "16"], expected: 8.67 },
      { name: "powers of two four-person with question", deckKey: "powers-of-two", values: ["1", "2", "4", "?"], expected: 2.33 },
      { name: "tshirt solo", deckKey: "tshirt", values: ["M"], expected: "M" },
      { name: "tshirt pair midpoint rounds up", deckKey: "tshirt", values: ["S", "M"], expected: "M" },
      { name: "tshirt four-person with non-scoring", deckKey: "tshirt", values: ["XS", "M", "L", "?", "coffee"], expected: "M" },
      { name: "tshirt high-end average", deckKey: "tshirt", values: ["L", "XL", "XL"], expected: "XL" }
    ];

    for (const testCase of cases) {
      expect(calculateAverage(testCase.values, testCase.deckKey), testCase.name).toBe(testCase.expected);
    }
  });

  it("keeps midpoint and nearest-label behavior deterministic at the deck edges", () => {
    expect(calculateAverage(["XS", "S", "M"], "tshirt")).toBe("S");
    expect(calculateAverage(["M", "L", "XL"], "tshirt")).toBe("L");
    expect(calculateAverage(["0", "0.5", "1"], "fibonacci")).toBe(0.5);
    expect(calculateAverage(["34", "55", "89"], "fibonacci")).toBe(59.33);
  });

  it("builds a custom Fibonacci range deck without affecting the preset decks", () => {
    expect(getDeckCards("fibonacci", { fibonacciRangeStart: "1", fibonacciRangeEnd: "13" })).toEqual(["1", "2", "3", "5", "8", "13", "?", "coffee"]);
    expect(getDeckLabel("fibonacci", { fibonacciRangeStart: "1", fibonacciRangeEnd: "13" })).toBe("Fibonacci 1-13");
    expect(getDeckCards("fibonacci-21")).toEqual(["1", "2", "3", "5", "8", "13", "21", "?", "coffee"]);
  });
});

describe("getConfig", () => {
  it("defaults first-time login codes to a 120-minute validity window", () => {
    const previousTtl = process.env.LOGIN_CODE_TTL_MINUTES;

    try {
      delete process.env.LOGIN_CODE_TTL_MINUTES;
      expect(getConfig().loginCodeTtlMinutes).toBe(120);
    } finally {
      if (previousTtl === undefined) {
        delete process.env.LOGIN_CODE_TTL_MINUTES;
      } else {
        process.env.LOGIN_CODE_TTL_MINUTES = previousTtl;
      }
    }
  });

  it("keeps debug codes separate from broader debug tooling in production", () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousDebugTools = process.env.DEBUG_TOOLS_ENABLED;
    const previousE2EDebug = process.env.E2E_DEBUG_CODES;

    try {
      process.env.NODE_ENV = "production";
      process.env.DEBUG_TOOLS_ENABLED = "0";
      process.env.E2E_DEBUG_CODES = "0";
      expect(getConfig().debugToolsEnabled).toBe(false);
      expect(getConfig().debugCodesEnabled).toBe(false);

      process.env.E2E_DEBUG_CODES = "1";
      expect(getConfig().debugCodesEnabled).toBe(true);
      expect(getConfig().debugToolsEnabled).toBe(false);

      process.env.DEBUG_TOOLS_ENABLED = "1";
      expect(getConfig().debugCodesEnabled).toBe(true);
      expect(getConfig().debugToolsEnabled).toBe(true);
    } finally {
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
      if (previousDebugTools === undefined) {
        delete process.env.DEBUG_TOOLS_ENABLED;
      } else {
        process.env.DEBUG_TOOLS_ENABLED = previousDebugTools;
      }
      if (previousE2EDebug === undefined) {
        delete process.env.E2E_DEBUG_CODES;
      } else {
        process.env.E2E_DEBUG_CODES = previousE2EDebug;
      }
    }
  });
});

describe("DeploymentConfigManager", () => {
  function withConfigEnv() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "planning-poker-config-unit-"));
    tempPaths.push(dir);
    const allowedDomainsPath = path.join(dir, "allowed-domains.txt");
    fs.writeFileSync(allowedDomainsPath, "example-company.com\n");
    process.env.NODE_ENV = "test";
    process.env.DATA_DIR = dir;
    process.env.DEPLOYMENT_CONFIG_PATH = path.join(dir, "deployment.toml");
    process.env.MANAGED_BRANDING_DIR = path.join(dir, "managed-branding");
    process.env.ALLOWED_DOMAINS_PATH = allowedDomainsPath;
    process.env.SUPER_ADMIN_USERNAME = "platform-admin";
    process.env.SUPER_ADMIN_PASSWORD = "PlatformAdmin123!";
    process.env.SUPER_ADMIN_DISPLAY_NAME = "Platform Admin";
    return dir;
  }

  it("creates a writable deployment config with redacted secrets and default branding", () => {
    const dir = withConfigEnv();
    const manager = new DeploymentConfigManager();

    const view = manager.getRedactedConfig();

    expect(view.app.deploymentConfigPath).toBe(path.join(dir, "deployment.toml"));
    expect(view.admin.passwordConfigured).toBe(true);
    expect(view.smtp.passConfigured).toBe(false);
    expect(view.branding.loginLogo).toBe(BRANDING_MANIFEST.loginLogo);
    expect(fs.existsSync(path.join(dir, "deployment.toml"))).toBe(true);
  });

  it("refuses to start without explicit super-admin credentials", () => {
    withConfigEnv();
    delete process.env.SUPER_ADMIN_USERNAME;
    delete process.env.SUPER_ADMIN_PASSWORD;

    expect(() => new DeploymentConfigManager()).toThrowError("Super-admin credentials are not configured.");
  });

  it("preserves secrets when omitted and replaces them when explicitly updated", () => {
    withConfigEnv();
    const manager = new DeploymentConfigManager();

    const originalPassword = manager.revealSecret("admin.password");
    manager.updateConfig({
      admin: {
        displayName: "Updated Admin"
      }
    });
    expect(manager.revealSecret("admin.password")).toBe(originalPassword);

    manager.updateConfig({
      admin: {
        password: "UpdatedAdmin123!"
      },
      smtp: {
        host: "smtp.example.com",
        port: 587,
        user: "mailer",
        pass: "smtp-secret",
        from: "noreply@example.com"
      }
    });

    const view = manager.getRedactedConfig();
    expect(manager.revealSecret("admin.password")).toBe("UpdatedAdmin123!");
    expect(manager.revealSecret("smtp.pass")).toBe("smtp-secret");
    expect(view.smtp.passConfigured).toBe(true);
    expect(view.smtp.host).toBe("smtp.example.com");
  });

  it("stores managed branding assets outside the repo public directory", () => {
    const dir = withConfigEnv();
    const manager = new DeploymentConfigManager();

    const result = manager.storeBrandingAsset({
      slot: "loginLogo",
      fileName: "logo.svg",
      mimeType: "image/svg+xml",
      dataBase64: Buffer.from("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 16 16\"><rect width=\"16\" height=\"16\" fill=\"#3a88ff\"/></svg>").toString("base64")
    });

    expect(result.config.branding.loginLogo.startsWith("/managed-branding/")).toBe(true);
    const storedFile = path.join(dir, "managed-branding", path.basename(result.config.branding.loginLogo));
    expect(fs.existsSync(storedFile)).toBe(true);
  });
});

describe("deployment config path resolution", () => {
  it("prefers ignored local deployment config when present", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "planning-poker-config-path-"));
    tempPaths.push(dir);
    const configDir = path.join(dir, "config");
    fs.mkdirSync(configDir);
    fs.writeFileSync(path.join(configDir, "deployment.toml"), "base = \"tracked\"\n");

    expect(resolveDefaultDeploymentConfigPath(dir)).toBe(path.join(configDir, "deployment.toml"));

    fs.writeFileSync(path.join(configDir, "deployment.local.toml"), "base = \"local\"\n");
    expect(resolveDefaultDeploymentConfigPath(dir)).toBe(path.join(configDir, "deployment.local.toml"));
  });
});

describe("simulator runtime visibility reconciliation", () => {
  it("broadcasts chooser updates only when heartbeat visibility flips and closes sim rooms on the offline edge", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "planning-poker-sim-unit-"));
    tempPaths.push(dir);
    const allowedDomainsPath = path.join(dir, "allowed-domains.txt");
    fs.writeFileSync(allowedDomainsPath, "example-company.com\nexample-partner.com\n");
    process.env.NODE_ENV = "test";
    process.env.PORT = "0";
    process.env.HOST = "127.0.0.1";
    process.env.DATA_DIR = dir;
    process.env.DATABASE_PATH = path.join(dir, "test.db");
    process.env.ALLOWED_DOMAINS_PATH = allowedDomainsPath;
    process.env.DEPLOYMENT_CONFIG_PATH = path.join(dir, "deployment.toml");
    process.env.MANAGED_BRANDING_DIR = path.join(dir, "managed-branding");
    process.env.DEBUG_TOOLS_ENABLED = "1";
    process.env.SIMULATOR_MODE_ENABLED = "1";
    process.env.SIMULATOR_SHARED_SECRET = "test-secret";
    process.env.SUPER_ADMIN_USERNAME = "platform-admin";
    process.env.SUPER_ADMIN_PASSWORD = "PlatformAdmin123!";
    process.env.SUPER_ADMIN_DISPLAY_NAME = "Platform Admin";

    vi.resetModules();
    const { repository, reconcileSimulatorRuntimeVisibilityTransition } = await import("../src/server.js");

    const nowSpy = vi.spyOn(Date, "now");
    let simulatedNow = 1_700_000_000_000;
    nowSpy.mockImplementation(() => simulatedNow);

    try {
      repository.recordSimulatorHeartbeat();
      const closeUnavailableTeamSockets = vi.fn();
      const broadcastChooserUpdate = vi.fn();

      const onlineState = reconcileSimulatorRuntimeVisibilityTransition(false, {
        closeUnavailableTeamSockets,
        broadcastChooserUpdate
      });
      expect(onlineState).toBe(true);
      expect(closeUnavailableTeamSockets).not.toHaveBeenCalled();
      expect(broadcastChooserUpdate).toHaveBeenCalledTimes(1);

      simulatedNow += 13_000;
      const offlineState = reconcileSimulatorRuntimeVisibilityTransition(true, {
        closeUnavailableTeamSockets,
        broadcastChooserUpdate
      });
      expect(offlineState).toBe(false);
      expect(closeUnavailableTeamSockets).toHaveBeenCalledTimes(1);
      expect(broadcastChooserUpdate).toHaveBeenCalledTimes(2);

      repository.recordSimulatorHeartbeat();
      const restoredState = reconcileSimulatorRuntimeVisibilityTransition(false, {
        closeUnavailableTeamSockets,
        broadcastChooserUpdate
      });
      expect(restoredState).toBe(true);
      expect(closeUnavailableTeamSockets).toHaveBeenCalledTimes(1);
      expect(broadcastChooserUpdate).toHaveBeenCalledTimes(3);
    } finally {
      nowSpy.mockRestore();
    }
  });
});
