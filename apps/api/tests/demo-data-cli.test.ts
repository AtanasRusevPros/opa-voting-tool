// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BRANDING_MANIFEST, DEFAULT_HISTORY_TIME_ZONE_KEYS } from "@planning-poker/shared";
import { buildDemoScenario, DemoModeManager } from "../src/demoMode.js";
import { buildDemoDataReport, cleanupLegacyDemoData, resetDemoData } from "../src/demoDataCli.js";
import { Repository } from "../src/repository.js";
import type { AppConfig } from "../src/types.js";

const tempDirs: string[] = [];

function createTestConfig(): AppConfig {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "planning-poker-demo-data-"));
  tempDirs.push(dir);
  fs.writeFileSync(path.join(dir, "allowed-domains.txt"), "example-company.com\n");
  return {
    port: 0,
    host: "127.0.0.1",
    allowedDomainsPath: path.join(dir, "allowed-domains.txt"),
    sessionTtlDays: 90,
    loginCodeTtlMinutes: 120,
    debugCodesEnabled: true,
    debugToolsEnabled: true,
    dataDir: dir,
    databasePath: path.join(dir, "test.db"),
    deploymentConfigPath: path.join(dir, "deployment.toml"),
    managedBrandingDir: path.join(dir, "managed-branding"),
    appBaseUrl: "http://localhost:3001",
    simulatorModeEnabled: false,
    simulatorSharedSecret: "test-secret",
    demoModeEnabled: true,
    publicTrial: {
      enabled: false,
      mode: "disabled",
      maxTeamsPerWorkspace: 2,
      maxUsersPerWorkspace: 10,
      maxRevealedRoundsPerWorkspacePerMonth: 40,
      maxSignupRequestsPerIpPerHour: 3,
      maxCodeRequestsPerEmailPerDay: 5,
      maxInvitesPerWorkspacePerDay: 10,
      maxWorkspaceCreationsPerIpPerDay: 2,
      maxLoginAttemptsPerEmailPerHour: 10
    },
    superAdminUsername: "platform-admin",
    superAdminPassword: "PlatformAdmin123!",
    superAdminDisplayName: "Platform Admin",
    branding: BRANDING_MANIFEST,
    defaultHistoryTimezoneKeys: [...DEFAULT_HISTORY_TIME_ZONE_KEYS]
  };
}

afterEach(() => {
  vi.useRealTimers();
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("demo data CLI helpers", () => {
  it("cleans a doubled seed, preserves protected accounts and history, and is idempotent", () => {
    vi.useFakeTimers();
    const config = createTestConfig();
    const repository = new Repository(config);
    const manager = new DemoModeManager({ repository, isEnabled: () => true,
      onChooserChanged: vi.fn(), onTeamChanged: vi.fn(), onVoteChanged: vi.fn() });
    manager.sync();
    const teams = repository.getTeamsForUser(repository.getSuperAdminUser()!.id).memberships;
    const scenario = buildDemoScenario();
    const legacyIds: string[] = [];
    for (const seed of scenario.users) {
      const legacy = repository.ensureUser({ ...seed, email: seed.email.replace("example-company.com", "legacy.example.org") });
      legacyIds.push(legacy.id);
      const team = scenario.teams.find((item) => item.memberEmails.includes(seed.email))!;
      repository.joinTeam(legacy.id, teams.find((item) => item.name === team.name)!.id);
    }
    manager.shutdown();
    expect(buildDemoDataReport(config.databasePath).totals.unexpectedMembers).toBe(950);
    const team = teams.find((item) => item.name === "Demo Team 10")!;
    const round = repository.createRound(team.id, "Preserved historical demo round");
    repository.revealRound(round.id);
    const historyBefore = repository.getHistory(team.id);
    const db = new DatabaseSync(config.databasePath);
    try {
      // A legacy-looking account with ordinary-team access must survive.
      const regular = repository.createTeam(repository.getSuperAdminUser()!.id, "Ordinary team");
      repository.joinTeam(legacyIds[0]!, regular.id);
      db.prepare("UPDATE users SET password_hash = 'protected' WHERE id = ?").run(legacyIds[1]!);
      db.prepare("UPDATE users SET display_name = 'Ordinary person' WHERE id = ?").run(legacyIds[2]!);
      const preview = cleanupLegacyDemoData(config.databasePath, "legacy.example.org");
      expect(preview.applied).toBe(false);
      expect(preview.deleteCount).toBe(947);
      expect(preview.skipped).toHaveLength(3);
      expect(buildDemoDataReport(config.databasePath).totals.unexpectedMembers).toBe(950);
      expect(() => cleanupLegacyDemoData(config.databasePath, "example-company.com", { apply: true })).toThrow();
      // Prove the whole deletion rolls back on a database error.
      db.exec(`CREATE TRIGGER fail_cleanup BEFORE DELETE ON users WHEN OLD.id = '${legacyIds[20]}' BEGIN SELECT RAISE(ABORT, 'test rollback'); END`);
      expect(() => cleanupLegacyDemoData(config.databasePath, "legacy.example.org", { apply: true })).toThrow("test rollback");
      expect(buildDemoDataReport(config.databasePath).totals.unexpectedMembers).toBe(950);
      db.exec("DROP TRIGGER fail_cleanup");
      const result = cleanupLegacyDemoData(config.databasePath, "legacy.example.org", { apply: true });
      expect(result.deleteCount).toBe(947);
      expect(result.applied).toBe(true);
      expect(repository.getHistory(team.id)).toEqual(historyBefore);
      expect(buildDemoDataReport(config.databasePath).totals.unexpectedMembers).toBe(3);
      expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
      expect(cleanupLegacyDemoData(config.databasePath, "legacy.example.org", { apply: true }).deleteCount).toBe(0);
    } finally { db.close(); }
  });

  it("reports polluted demo teams and resets them without touching regular data", () => {
    vi.useFakeTimers();
    const config = createTestConfig();
    const repository = new Repository(config);
    const manager = new DemoModeManager({
      repository,
      isEnabled: () => true,
      onChooserChanged: vi.fn(),
      onTeamChanged: vi.fn(),
      onVoteChanged: vi.fn()
    });

    manager.sync();
    const superAdmin = repository.getSuperAdminUser();
    expect(superAdmin).toBeTruthy();
    const demoTeam = repository.getTeamsForUser(superAdmin!.id).memberships.find((team) => team.name === "Demo Team 10");
    expect(demoTeam).toBeTruthy();

    const rogueDemoUser = repository.ensureUser({
      email: "rogue-demo-user@example-company.com",
      displayName: "Demo Rogue",
      avatarIconKey: "bear",
      avatarColorKey: "azure"
    });
    repository.joinTeam(rogueDemoUser.id, demoTeam!.id);

    const preservedUser = repository.verifyLoginCode(
      "preserved-owner@example-company.com",
      repository.requestLoginCode("preserved-owner@example-company.com").code,
      "Demo Ordinary Owner",
      "fox",
      "teal",
      undefined,
      "Password123!"
    )!;
    repository.createTeam(preservedUser.id, "Preserved Team");
    repository.createTeam(preservedUser.id, "Demo Team Ordinary");
    const canonicalUser = repository.ensureUser({
      email: "demo.bot.001@example-company.com",
      displayName: "Demo 001", avatarIconKey: "bear", avatarColorKey: "azure"
    });
    const regularTeam = repository.createTeam(preservedUser.id, "Regular Membership");
    repository.joinTeam(canonicalUser.id, regularTeam.id);

    const report = buildDemoDataReport(config.databasePath);
    const pollutedTeam = report.demoTeams.find((team) => team.name === "Demo Team 10");
    expect(pollutedTeam).toBeTruthy();
    expect(report.includedDemoAccounts).toBe(false);
    expect(pollutedTeam!.actualMemberCount).toBe(11);
    expect(pollutedTeam!.expectedMemberCount).toBe(10);
    expect(pollutedTeam!.unexpectedMemberCount).toBe(1);
    expect(pollutedTeam!.unexpectedMembers).toEqual([]);
    expect(report.totals.mismatchedTeams).toBeGreaterThan(0);

    const detailedReport = buildDemoDataReport(config.databasePath, { includeDemoAccounts: true });
    const detailedPollutedTeam = detailedReport.demoTeams.find((team) => team.name === "Demo Team 10");
    expect(detailedReport.includedDemoAccounts).toBe(true);
    expect(detailedPollutedTeam!.unexpectedMembers).toEqual(
      expect.arrayContaining([expect.objectContaining({ email: "rogue-demo-user@example-company.com" })])
    );
    expect(detailedReport.demoUsers).toEqual(
      expect.arrayContaining([expect.objectContaining({ email: "rogue-demo-user@example-company.com" })])
    );

    const ordinaryDemoName = repository.ensureUser({
      email: "ordinary-demo-name@example-company.com", displayName: "Demo Ordinary",
      avatarIconKey: "bear", avatarColorKey: "azure"
    });
    const dryRun = resetDemoData(config.databasePath);
    expect(dryRun.applied).toBe(false);
    expect(dryRun.demoUserEmails).not.toContain(ordinaryDemoName.email);
    expect(buildDemoDataReport(config.databasePath).demoTeams.find((team) => team.name === "Demo Team 10")!.actualMemberCount).toBe(11);
    expect(dryRun.demoTeamNames).toContain("Demo Team 10");
    expect(dryRun.demoUserEmails).not.toContain("rogue-demo-user@example-company.com");
    expect(dryRun.demoUserEmails).not.toContain(canonicalUser.email);
    expect(dryRun.demoUserEmails).not.toContain(preservedUser.email);
    expect(dryRun.demoTeamNames).not.toContain("Demo Team Ordinary");

    const applied = resetDemoData(config.databasePath, { apply: true });
    expect(applied.applied).toBe(true);
    expect(buildDemoDataReport(config.databasePath).demoTeams.map((team) => team.name)).toEqual(["Demo Team Ordinary"]);

    const db = new DatabaseSync(config.databasePath, { readOnly: true });
    try {
      const remainingTeamNames = (
        db.prepare("SELECT name FROM teams ORDER BY name COLLATE NOCASE ASC").all() as Array<{ name: string }>
      ).map((row) => row.name);
      const remainingUserEmails = (
        db.prepare("SELECT email FROM users WHERE is_super_admin = 0 ORDER BY email COLLATE NOCASE ASC").all() as Array<{ email: string }>
      ).map((row) => row.email);

      expect(remainingTeamNames).toContain("Preserved Team");
      expect(remainingTeamNames).not.toContain("Demo Team 10");
      expect(remainingUserEmails).toContain("preserved-owner@example-company.com");
      expect(remainingUserEmails).toContain("rogue-demo-user@example-company.com");
      expect(remainingUserEmails).toContain(canonicalUser.email);
      expect(remainingUserEmails).toContain(ordinaryDemoName.email);
      expect(remainingTeamNames).toContain("Demo Team Ordinary");
      expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally {
      db.close();
    }
  });
});
