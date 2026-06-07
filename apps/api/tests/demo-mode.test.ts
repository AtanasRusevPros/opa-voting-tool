// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BRANDING_MANIFEST, DEFAULT_HISTORY_TIME_ZONE_KEYS } from "@planning-poker/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { DemoModeManager } from "../src/demoMode.js";
import { Repository } from "../src/repository.js";
import type { AppConfig } from "../src/types.js";

const tempDirs: string[] = [];
const loadedManagers: Array<{ shutdown: () => void }> = [];

function createEnvDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "planning-poker-demo-"));
  tempDirs.push(dir);
  fs.writeFileSync(path.join(dir, "allowed-domains.txt"), "example-company.com\nexample-partner.com\n");
  return dir;
}

function createTestConfig(): AppConfig {
  const dir = createEnvDir();
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

async function loadTestServer() {
  const dir = createEnvDir();
  process.env.NODE_ENV = "test";
  process.env.PORT = "0";
  process.env.HOST = "127.0.0.1";
  process.env.DATA_DIR = dir;
  process.env.DATABASE_PATH = path.join(dir, "test.db");
  process.env.ALLOWED_DOMAINS_PATH = path.join(dir, "allowed-domains.txt");
  process.env.DEPLOYMENT_CONFIG_PATH = path.join(dir, "deployment.toml");
  process.env.MANAGED_BRANDING_DIR = path.join(dir, "managed-branding");
  process.env.DEBUG_TOOLS_ENABLED = "1";
  process.env.APP_BASE_URL = "http://localhost:3001";
  process.env.SUPER_ADMIN_USERNAME = "platform-admin";
  process.env.SUPER_ADMIN_PASSWORD = "PlatformAdmin123!";
  process.env.SUPER_ADMIN_DISPLAY_NAME = "Platform Admin";
  vi.resetModules();
  const module = await import("../src/server.js");
  loadedManagers.push(module.demoModeManager);
  return module;
}

async function signInAsSuperAdmin(app: ReturnType<typeof request>) {
  const response = await app.post("/api/auth/signin-admin").send({
    username: "platform-admin",
    password: "PlatformAdmin123!"
  });
  expect(response.status).toBe(200);
  return response.headers["set-cookie"];
}

async function createRegularUser(app: ReturnType<typeof request>, email: string, displayName: string) {
  const codeResponse = await app.post("/api/auth/request-code").send({ email });
  expect(codeResponse.status).toBe(200);
  const debugCode = codeResponse.body.debugCode as string | undefined;
  expect(debugCode).toBeTruthy();
  const verifyResponse = await app.post("/api/auth/verify-code").send({
    email,
    code: debugCode,
    displayName,
    avatarIconKey: "bear",
    avatarColorKey: "azure",
    password: "Password123!"
  });
  expect(verifyResponse.status).toBe(200);
  return verifyResponse.headers["set-cookie"];
}

afterEach(() => {
  vi.useRealTimers();
  for (const manager of loadedManagers.splice(0)) {
    manager.shutdown();
  }
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  delete process.env.PORT;
  delete process.env.HOST;
  delete process.env.DATA_DIR;
  delete process.env.DATABASE_PATH;
  delete process.env.ALLOWED_DOMAINS_PATH;
  delete process.env.DEPLOYMENT_CONFIG_PATH;
  delete process.env.MANAGED_BRANDING_DIR;
  delete process.env.DEBUG_TOOLS_ENABLED;
  delete process.env.APP_BASE_URL;
  delete process.env.SUPER_ADMIN_USERNAME;
  delete process.env.SUPER_ADMIN_PASSWORD;
  delete process.env.SUPER_ADMIN_DISPLAY_NAME;
});

describe("Demo mode integration", () => {
  it("keeps repeated enabled syncs idempotent for active demo rooms", () => {
    vi.useFakeTimers();
    const repository = new Repository(createTestConfig());
    let enabled = true;
    const onChooserChanged = vi.fn();
    const onTeamChanged = vi.fn();
    const manager = new DemoModeManager({
      repository,
      isEnabled: () => enabled,
      onChooserChanged,
      onTeamChanged,
      onVoteChanged: vi.fn()
    });

    manager.sync();
    const firstKnownTeamChangeCount = onTeamChanged.mock.calls.length;
    const firstChooserChangeCount = onChooserChanged.mock.calls.length;
    const demoTeam = repository.getTeamsForUser(repository.getSuperAdminUser()!.id).memberships.find((team) => team.name === "Demo Team 10");

    expect(demoTeam).toBeTruthy();
    expect(manager.getSyntheticActiveParticipantIds(demoTeam!.id).size).toBe(10);

    manager.sync();
    manager.sync();

    expect(onTeamChanged).toHaveBeenCalledTimes(firstKnownTeamChangeCount);
    expect(onChooserChanged).toHaveBeenCalledTimes(firstChooserChangeCount);
    expect(repository.getTeamMembers(demoTeam!.id)).toHaveLength(10);
    expect(manager.getSyntheticActiveParticipantIds(demoTeam!.id).size).toBe(10);

    enabled = false;
    manager.sync();
    expect(manager.getSyntheticActiveParticipantIds(demoTeam!.id).size).toBe(0);
    manager.shutdown();
  });

  it("keeps repeated Demo Team 400 rounds bounded to the seeded demo participants", async () => {
    vi.useFakeTimers();
    const repository = new Repository(createTestConfig());
    const manager = new DemoModeManager({
      repository,
      isEnabled: () => true,
      onChooserChanged: vi.fn(),
      onTeamChanged: vi.fn(),
      onVoteChanged: vi.fn()
    });

    manager.sync();
    const demoTeam = repository.getTeamsForUser(repository.getSuperAdminUser()!.id).memberships.find((team) => team.name === "Demo Team 400");
    expect(demoTeam).toBeTruthy();
    expect(repository.getTeamMembers(demoTeam!.id)).toHaveLength(400);
    expect(manager.getSyntheticActiveParticipantIds(demoTeam!.id).size).toBe(400);

    for (let roundIndex = 0; roundIndex < 4; roundIndex += 1) {
      const round = repository.createRound(demoTeam!.id, `DEMO-400-${roundIndex}`);

      manager.sync();
      await vi.advanceTimersByTimeAsync(2500);
      manager.sync();
      await vi.advanceTimersByTimeAsync(2500);

      const activeRound = repository.getCurrentRound(demoTeam!.id)!;
      expect(activeRound.id).toBe(round.id);
      expect(activeRound.votes.length).toBeLessThanOrEqual(400);

      const revealed = repository.revealRound(round.id, {
        eligibleParticipantIds: [...manager.getSyntheticActiveParticipantIds(demoTeam!.id)]
      });
      const historyEntry = repository.getHistory(demoTeam!.id)[0]!;

      expect(revealed.votes.length).toBeLessThanOrEqual(400);
      expect(historyEntry.participantCount).toBeLessThanOrEqual(400);
      expect(historyEntry.votes).toHaveLength(historyEntry.participantCount);
      expect(new Set(historyEntry.votes.map((vote) => vote.userId)).size).toBe(historyEntry.votes.length);
    }

    manager.shutdown();
  });

  it("shows demo teams only to the super-admin and stops simulated voting when disabled", async () => {
    const { app, repository, demoModeManager } = await loadTestServer();
    const client = request(app);
    const superAdminCookie = await signInAsSuperAdmin(client);

    const enableResponse = await client.patch("/api/admin/config").set("Cookie", superAdminCookie).send({
      demo: {
        enabled: true
      }
    });
    expect(enableResponse.status).toBe(200);
    expect(enableResponse.body.config.demo.enabled).toBe(true);

    const superAdminSession = await client.get("/api/auth/session").set("Cookie", superAdminCookie);
    expect(superAdminSession.status).toBe(200);
    const demoTeam = superAdminSession.body.availableTeams.find((team: { name: string }) => team.name === "Demo Team 10");
    expect(demoTeam).toBeTruthy();
    expect(demoTeam.demo).toBe(true);
    expect(demoModeManager.getSyntheticActiveParticipantIds(demoTeam.id).size).toBe(10);

    const superAdminState = await client.get(`/api/teams/${demoTeam.id}/state?history=0`).set("Cookie", superAdminCookie);
    expect(superAdminState.status).toBe(200);
    expect(superAdminState.body.currentUserRole).toBe("team_admin");
    expect(superAdminState.body.activeParticipants).toHaveLength(10);

    const createRoundResponse = await client.post(`/api/teams/${demoTeam.id}/rounds`).set("Cookie", superAdminCookie).send({
      title: "Demo round"
    });
    expect(createRoundResponse.status).toBe(201);

    await new Promise((resolve) => setTimeout(resolve, 1700));

    const activeRoundState = await client.get(`/api/teams/${demoTeam.id}/state?history=0`).set("Cookie", superAdminCookie);
    expect(activeRoundState.status).toBe(200);
    expect(activeRoundState.body.activeRound.votes.length).toBeGreaterThan(0);

    const normalUserCookie = await createRegularUser(client, "demo-viewer@example-company.com", "Demo Viewer");
    const normalSession = await client.get("/api/auth/session").set("Cookie", normalUserCookie);
    expect(normalSession.status).toBe(200);
    expect(normalSession.body.availableTeams.some((team: { name: string }) => team.name === "Demo Team 10")).toBe(false);

    const normalUserState = await client.get(`/api/teams/${demoTeam.id}/state?history=0`).set("Cookie", normalUserCookie);
    expect(normalUserState.status).toBe(403);

    const currentRound = repository.getCurrentRound(demoTeam.id);
    expect(currentRound).not.toBeNull();
    const voteCountBeforeDisable = currentRound?.votes.length ?? 0;

    const disableResponse = await client.patch("/api/admin/config").set("Cookie", superAdminCookie).send({
      demo: {
        enabled: false
      }
    });
    expect(disableResponse.status).toBe(200);
    expect(disableResponse.body.config.demo.enabled).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 1700));

    const voteCountAfterDisable = repository.getCurrentRound(demoTeam.id)?.votes.length ?? 0;
    expect(voteCountAfterDisable).toBe(voteCountBeforeDisable);

    const hiddenSession = await client.get("/api/auth/session").set("Cookie", superAdminCookie);
    expect(hiddenSession.status).toBe(200);
    expect(hiddenSession.body.availableTeams.some((team: { name: string }) => team.name === "Demo Team 10")).toBe(false);
  });
});
