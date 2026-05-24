// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const tempDirs: string[] = [];

function createEnvDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "planning-poker-auth-"));
  tempDirs.push(dir);
  fs.writeFileSync(path.join(dir, "allowed-domains.txt"), "example-company.com\nexample-partner.com\n");
  return dir;
}

async function loadTestServer(options?: { debugToolsEnabled?: boolean; nodeEnv?: string }) {
  const dir = createEnvDir();
  process.env.NODE_ENV = options?.nodeEnv ?? "test";
  process.env.PORT = "0";
  process.env.HOST = "127.0.0.1";
  process.env.DATA_DIR = dir;
  process.env.DATABASE_PATH = path.join(dir, "test.db");
  process.env.ALLOWED_DOMAINS_PATH = path.join(dir, "allowed-domains.txt");
  process.env.DEPLOYMENT_CONFIG_PATH = path.join(dir, "deployment.toml");
  process.env.MANAGED_BRANDING_DIR = path.join(dir, "managed-branding");
  process.env.DEBUG_TOOLS_ENABLED = options?.debugToolsEnabled === false ? "0" : "1";
  process.env.APP_BASE_URL = "http://localhost:3001";
  process.env.SUPER_ADMIN_USERNAME = "platform-admin";
  process.env.SUPER_ADMIN_PASSWORD = "PlatformAdmin123!";
  process.env.SUPER_ADMIN_DISPLAY_NAME = "Platform Admin";
  vi.resetModules();
  return import("../src/server.js");
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

describe("Password and invite HTTP flows", () => {
  it("changes the current user's password and accepts only the new password afterwards", async () => {
    const { app } = await loadTestServer();
    const client = request(app);
    const cookie = await createRegularUser(client, "password-change@example-company.com", "Password Change");

    const changeResponse = await client.post("/api/auth/change-password").set("Cookie", cookie).send({
      currentPassword: "Password123!",
      newPassword: "BetterPass456!",
      confirmPassword: "BetterPass456!"
    });
    expect(changeResponse.status).toBe(200);

    const oldLogin = await client.post("/api/auth/signin-password").send({
      email: "password-change@example-company.com",
      password: "Password123!"
    });
    expect(oldLogin.status).toBe(401);

    const newLogin = await client.post("/api/auth/signin-password").send({
      email: "password-change@example-company.com",
      password: "BetterPass456!"
    });
    expect(newLogin.status).toBe(200);
  });

  it("persists personal UI preferences for the current user account", async () => {
    const { app } = await loadTestServer();
    const client = request(app);
    const cookie = await createRegularUser(client, "shortcut-pref@example-company.com", "Shortcut Pref");
    const teamResponse = await client.post("/api/teams").set("Cookie", cookie).send({ name: "Preference Team" });
    expect(teamResponse.status).toBe(201);
    const teamId = teamResponse.body.team.id as string;

    const missingTeamResponse = await client.patch("/api/auth/preferences").set("Cookie", cookie).send({
      historyTimezonePopupEnabled: false,
      historyTimezoneKeys: ["gmt", "japan-tokyo"]
    });
    expect(missingTeamResponse.status).toBe(400);

    const saveResponse = await client.patch("/api/auth/preferences").set("Cookie", cookie).send({
      teamId,
      boardShortcutsEnabled: false,
      historyTimezonePopupEnabled: false,
      historyTimezoneKeys: ["gmt", "japan-tokyo"]
    });
    expect(saveResponse.status).toBe(200);
    expect(saveResponse.body.user.boardShortcutsEnabled).toBe(false);
    expect(saveResponse.body.user.historyTimezonePopupEnabled).toBe(false);
    expect(saveResponse.body.user.historyTimezoneKeys).toEqual(["gmt", "japan-tokyo"]);

    const sessionResponse = await client.get("/api/auth/session").set("Cookie", cookie);
    expect(sessionResponse.status).toBe(200);
    expect(sessionResponse.body.user.boardShortcutsEnabled).toBe(false);
    expect(sessionResponse.body.memberships.find((team: { id: string }) => team.id === teamId).currentUserHistoryTimezonePopupEnabled).toBe(false);
    expect(sessionResponse.body.memberships.find((team: { id: string }) => team.id === teamId).currentUserHistoryTimezoneKeys).toEqual([
      "gmt",
      "japan-tokyo"
    ]);

    const resetResponse = await client.patch("/api/auth/preferences").set("Cookie", cookie).send({
      teamId,
      historyTimezoneKeys: null
    });
    expect(resetResponse.status).toBe(200);
    expect(resetResponse.body.user.historyTimezoneKeys).toBeNull();
  });

  it("returns a manual-share temporary password for new team members when SMTP is not configured", async () => {
    const { app } = await loadTestServer();
    const client = request(app);
    const ownerCookie = await createRegularUser(client, "owner@example-company.com", "Owner");

    const teamResponse = await client.post("/api/teams").set("Cookie", ownerCookie).send({ name: "Invite Team" });
    expect(teamResponse.status).toBe(201);
    const teamId = teamResponse.body.team.id as string;

    const inviteResponse = await client.post(`/api/teams/${teamId}/members`).set("Cookie", ownerCookie).send({
      email: "new.person@example-company.com"
    });
    expect(inviteResponse.status).toBe(201);
    expect(inviteResponse.body.invitedNewUser).toBe(true);
    expect(inviteResponse.body.invitationDelivery).toBe("manual-share");
    expect(inviteResponse.body.temporaryPassword).toBeTruthy();
    expect(inviteResponse.body.secureSaveReminder).toContain("secure");

    const invitedLogin = await client.post("/api/auth/signin-password").send({
      email: "new.person@example-company.com",
      password: inviteResponse.body.temporaryPassword
    });
    expect(invitedLogin.status).toBe(200);
  });

  it("returns a manual-admin password reset response when SMTP and debug-code delivery are both unavailable", async () => {
    const { app, repository } = await loadTestServer({ debugToolsEnabled: false, nodeEnv: "production" });
    const client = request(app);
    repository.ensureUser({
      email: "reset-manual@example-company.com",
      displayName: "Reset Manual",
      avatarIconKey: "bear",
      avatarColorKey: "azure"
    });

    const resetResponse = await client.post("/api/auth/request-password-reset").send({
      email: "reset-manual@example-company.com"
    });

    expect(resetResponse.status).toBe(200);
    expect(resetResponse.body.delivery).toBe("manual-admin");
    expect(resetResponse.body.debugCode).toBeUndefined();
  });

  it("lets a team-admin generate a replacement password for an existing team member when SMTP is not configured", async () => {
    const { app } = await loadTestServer();
    const client = request(app);
    const ownerCookie = await createRegularUser(client, "reset-owner@example-company.com", "Owner");

    const teamResponse = await client.post("/api/teams").set("Cookie", ownerCookie).send({ name: "Reset Team" });
    expect(teamResponse.status).toBe(201);
    const teamId = teamResponse.body.team.id as string;

    const inviteResponse = await client.post(`/api/teams/${teamId}/members`).set("Cookie", ownerCookie).send({
      email: "member.reset@example-company.com"
    });
    expect(inviteResponse.status).toBe(201);

    const teamAdminResetResponse = await client.post(`/api/teams/${teamId}/members/${inviteResponse.body.user.id}/reset-password`).set("Cookie", ownerCookie).send({});
    expect(teamAdminResetResponse.status).toBe(200);
    expect(teamAdminResetResponse.body.passwordDelivery).toBe("manual-share");
    expect(teamAdminResetResponse.body.temporaryPassword).toBeTruthy();
    expect(teamAdminResetResponse.body.secureSaveReminder).toContain("secure");

    const updatedLogin = await client.post("/api/auth/signin-password").send({
      email: "member.reset@example-company.com",
      password: teamAdminResetResponse.body.temporaryPassword
    });
    expect(updatedLogin.status).toBe(200);
  });

  it("blocks a team-admin from resetting a user outside the current team", async () => {
    const { app } = await loadTestServer();
    const client = request(app);
    const ownerCookie = await createRegularUser(client, "reset-scope-owner@example-company.com", "Owner");
    const outsiderCookie = await createRegularUser(client, "outsider.reset@example-company.com", "Outsider");

    const teamResponse = await client.post("/api/teams").set("Cookie", ownerCookie).send({ name: "Scoped Team" });
    expect(teamResponse.status).toBe(201);
    const teamId = teamResponse.body.team.id as string;

    const outsiderSession = await client.get("/api/auth/session").set("Cookie", outsiderCookie);
    expect(outsiderSession.status).toBe(200);
    const outsiderUserId = outsiderSession.body.user.id as string;

    const resetResponse = await client.post(`/api/teams/${teamId}/members/${outsiderUserId}/reset-password`).set("Cookie", ownerCookie).send({});
    expect(resetResponse.status).toBe(400);
    expect(resetResponse.body.error).toContain("not a member");
  });

  it("creates a platform access request and lets the super-admin admit it with a manual-share password", async () => {
    const { app } = await loadTestServer();
    const client = request(app);

    const requestResponse = await client.post("/api/auth/request-access").send({
      email: "waiting.access@example-company.com"
    });
    expect(requestResponse.status).toBe(200);

    const adminSignIn = await client.post("/api/auth/signin-admin").send({
      username: "platform-admin",
      password: "PlatformAdmin123!"
    });
    expect(adminSignIn.status).toBe(200);
    const adminCookie = adminSignIn.headers["set-cookie"];

    const listResponse = await client.get("/api/admin/access-requests").set("Cookie", adminCookie);
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.requests).toHaveLength(1);

    const admitResponse = await client
      .post(`/api/admin/access-requests/${listResponse.body.requests[0].id}/admit`)
      .set("Cookie", adminCookie)
      .send({});
    expect(admitResponse.status).toBe(200);
    expect(admitResponse.body.invitationDelivery).toBe("manual-share");
    expect(admitResponse.body.temporaryPassword).toBeTruthy();
    expect(admitResponse.body.secureSaveReminder).toContain("secure");

    const peopleResponse = await client.get("/api/admin/people").set("Cookie", adminCookie);
    expect(peopleResponse.status).toBe(200);
    expect(peopleResponse.body.requests).toHaveLength(0);
    expect(peopleResponse.body.users.map((user: { email: string }) => user.email)).toContain("waiting.access@example-company.com");

    const invitedLogin = await client.post("/api/auth/signin-password").send({
      email: "waiting.access@example-company.com",
      password: admitResponse.body.temporaryPassword
    });
    expect(invitedLogin.status).toBe(200);
  });

  it("explains the current-team reset rule when request access is attempted for an existing account", async () => {
    const { app } = await loadTestServer();
    const client = request(app);
    await createRegularUser(client, "existing.access@example-company.com", "Existing Access");

    const requestResponse = await client.post("/api/auth/request-access").send({
      email: "existing.access@example-company.com"
    });

    expect(requestResponse.status).toBe(400);
    expect(requestResponse.body.error).toContain("team-admin from your current team");
    expect(requestResponse.body.error).toContain("super-admin");
  });

  it("can regenerate a lost manual password and invalidates the previous generated password", async () => {
    const { app } = await loadTestServer();
    const client = request(app);
    const ownerCookie = await createRegularUser(client, "regen-owner@example-company.com", "Owner");

    const teamResponse = await client.post("/api/teams").set("Cookie", ownerCookie).send({ name: "Regen Team" });
    expect(teamResponse.status).toBe(201);
    const teamId = teamResponse.body.team.id as string;

    const inviteResponse = await client.post(`/api/teams/${teamId}/members`).set("Cookie", ownerCookie).send({
      email: "member.regen@example-company.com"
    });
    expect(inviteResponse.status).toBe(201);

    const adminSignIn = await client.post("/api/auth/signin-admin").send({
      username: "platform-admin",
      password: "PlatformAdmin123!"
    });
    expect(adminSignIn.status).toBe(200);
    const adminCookie = adminSignIn.headers["set-cookie"];

    const firstReset = await client.post(`/api/admin/users/${inviteResponse.body.user.id}/reset-password`).set("Cookie", adminCookie).send({});
    expect(firstReset.status).toBe(200);
    const secondReset = await client.post(`/api/admin/users/${inviteResponse.body.user.id}/reset-password`).set("Cookie", adminCookie).send({});
    expect(secondReset.status).toBe(200);

    expect(secondReset.body.passwordDelivery).toBe("manual-share");
    expect(secondReset.body.temporaryPassword).toBeTruthy();
    expect(secondReset.body.temporaryPassword).not.toBe(firstReset.body.temporaryPassword);

    const staleLogin = await client.post("/api/auth/signin-password").send({
      email: "member.regen@example-company.com",
      password: firstReset.body.temporaryPassword
    });
    expect(staleLogin.status).toBe(401);

    const updatedLogin = await client.post("/api/auth/signin-password").send({
      email: "member.regen@example-company.com",
      password: secondReset.body.temporaryPassword
    });
    expect(updatedLogin.status).toBe(200);
  });
});
