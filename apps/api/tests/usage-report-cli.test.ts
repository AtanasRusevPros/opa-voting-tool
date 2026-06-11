// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BRANDING_MANIFEST, DEFAULT_HISTORY_TIME_ZONE_KEYS } from "@planning-poker/shared";
import { Repository } from "../src/repository.js";
import type { AppConfig } from "../src/types.js";
import { buildReport, usersExport } from "../src/usageReportCli.js";

const tempDirs: string[] = [];

function createTestConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "planning-poker-usage-"));
  tempDirs.push(dir);
  const deploymentConfigPath = path.join(dir, "deployment.toml");
  fs.writeFileSync(
    deploymentConfigPath,
    `
[public_trial]
enabled = true
mode = "open_signup"
`
  );
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
    deploymentConfigPath,
    managedBrandingDir: path.join(dir, "managed-branding"),
    appBaseUrl: "http://localhost:3001",
    simulatorModeEnabled: false,
    simulatorSharedSecret: "test-secret",
    demoModeEnabled: false,
    publicTrial: {
      enabled: true,
      mode: "open_signup",
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
    defaultHistoryTimezoneKeys: [...DEFAULT_HISTORY_TIME_ZONE_KEYS],
    ...overrides
  };
}

afterEach(() => {
  delete process.env.DEPLOYMENT_CONFIG_PATH;
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("usage report CLI helpers", () => {
  it("reports default and public-trial workspace usage without counting super-admins as users", () => {
    const config = createTestConfig();
    process.env.DEPLOYMENT_CONFIG_PATH = config.deploymentConfigPath;
    const repo = new Repository(config);
    repo.verifySuperAdminLogin(config.superAdminUsername, config.superAdminPassword);

    const defaultOwner = repo.verifyLoginCode(
      "usage-owner@example-company.com",
      repo.requestLoginCode("usage-owner@example-company.com").code,
      "Usage Owner",
      "bear",
      "azure",
      undefined,
      "Password123!"
    )!;
    const defaultMember = repo.verifyLoginCode(
      "usage-member@example-company.com",
      repo.requestLoginCode("usage-member@example-company.com").code,
      "Usage Member",
      "owl",
      "gold",
      undefined,
      "Password123!"
    )!;
    const defaultTeam = repo.createTeam(defaultOwner.id, "Usage Default Team");
    repo.joinTeam(defaultMember.id, defaultTeam.id);
    const defaultRound = repo.createRound(defaultTeam.id, "Usage Default Round");
    repo.castVote(defaultRound.id, defaultOwner.id, "3");
    repo.castVote(defaultRound.id, defaultMember.id, "5");
    repo.revealRound(defaultRound.id);

    const trialSignup = repo.completePublicTrialSignup({
      email: "usage-trial@gmail.com",
      code: repo.requestLoginCode("usage-trial@gmail.com").code,
      displayName: "Usage Trial",
      avatarIconKey: "fox",
      avatarColorKey: "teal",
      password: "Password123!",
      acceptedTermsVersion: repo.getPublicTrialTermsVersion()
    })!;
    const trialRound = repo.createRound(trialSignup.team.id, "Usage Trial Round");
    repo.castVote(trialRound.id, trialSignup.user.id, "8");
    repo.revealRound(trialRound.id);

    const report = buildReport(config.databasePath);

    expect(report.publicTrial).toEqual({ enabled: "true", mode: "open_signup" });
    expect(report.totals.users).toBe(3);
    expect(report.totals.superAdmins).toBe(1);
    expect(report.totals.workspaces).toBe(2);
    expect(report.totals.publicTrialWorkspaces).toBe(1);
    expect(report.monthly.revealedRounds).toBe(2);
    expect(report.monthly.votes).toBe(3);
    expect(report.workspaces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "default-workspace",
          kind: "default",
          userCount: 2,
          teamCount: 1,
          monthlyReveals: 1,
          monthlyVotes: 2
        }),
        expect.objectContaining({
          kind: "public_trial",
          userCount: 1,
          teamCount: 1,
          monthlyReveals: 1,
          monthlyVotes: 1
        })
      ])
    );

    const deletionPreview = repo.getOwnAccountDeletionPreview(defaultMember.id);
    repo.deleteOwnAccount(defaultMember.id, "Password123!", "DELETE MY ACCOUNT", deletionPreview.impactToken);
    const afterDeletion = buildReport(config.databasePath);
    expect(afterDeletion.totals.users).toBe(2);
    expect(afterDeletion.workspaces.find((workspace) => workspace.id === "default-workspace")?.userCount).toBe(1);
    expect(usersExport(config.databasePath)).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ email: "usage-member@example-company.com" })])
    );
  });

  it("exports user summaries without password, token, session, SMTP, or Jira secret fields", () => {
    const config = createTestConfig();
    const repo = new Repository(config);
    repo.verifySuperAdminLogin(config.superAdminUsername, config.superAdminPassword);
    const user = repo.verifyLoginCode(
      "export-user@example-company.com",
      repo.requestLoginCode("export-user@example-company.com").code,
      "Export User",
      "bear",
      "azure",
      undefined,
      "Password123!"
    )!;
    repo.createTeam(user.id, "Export User Team");

    const exported = usersExport(config.databasePath);

    expect(exported).toHaveLength(1);
    expect(exported[0]).toEqual(
      expect.objectContaining({
        email: "export-user@example-company.com",
        displayName: "Export User",
        workspaceCount: 1
      })
    );
    expect(Object.keys(exported[0] as Record<string, unknown>).sort()).toEqual([
      "createdAt",
      "displayName",
      "email",
      "id",
      "lastActiveAt",
      "teamCount",
      "updatedAt",
      "workspaceCount"
    ]);
  });
});
