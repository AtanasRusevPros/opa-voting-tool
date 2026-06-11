// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const { sendMailMock, createTransportMock } = vi.hoisted(() => {
  const sendMail = vi.fn(async () => undefined);
  return {
    sendMailMock: sendMail,
    createTransportMock: vi.fn(() => ({
      sendMail
    }))
  };
});

vi.mock("nodemailer", () => ({
  default: {
    createTransport: createTransportMock
  }
}));

const tempDirs: string[] = [];

function createEnvDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "planning-poker-auth-"));
  tempDirs.push(dir);
  fs.writeFileSync(path.join(dir, "allowed-domains.txt"), "example-company.com\nexample-partner.com\n");
  return dir;
}

async function loadTestServer(options?: { debugToolsEnabled?: boolean; nodeEnv?: string; publicTrial?: boolean; smtp?: boolean }) {
  const dir = createEnvDir();
  const deploymentSections: string[] = [];
  if (options?.smtp) {
    deploymentSections.push(`
[smtp]
host = "smtp.example.com"
port = 587
user = "mailer"
pass = "smtp-secret"
from = "opa-voting-tool@example.com"
`);
  }
  if (options?.publicTrial) {
    deploymentSections.push(`
[public_trial]
enabled = true
mode = "open_signup"
`);
  }
  if (deploymentSections.length > 0) {
    fs.writeFileSync(path.join(dir, "deployment.toml"), deploymentSections.join("\n"));
  }
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
  sendMailMock.mockClear();
  createTransportMock.mockClear();
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
  it("keeps public trial signup disabled by default", async () => {
    const { app } = await loadTestServer();
    const client = request(app);

    const response = await client.post("/api/auth/public-trial/request-code").send({
      email: "trial-default@gmail.com"
    });

    expect(response.status).toBe(403);
    expect(response.body.error).toContain("not enabled");
  });

  it("keeps normal request-access allowlist behavior even when public trial mode is enabled", async () => {
    const { app } = await loadTestServer({ publicTrial: true, smtp: true });
    const client = request(app);

    const disallowedNormalRequest = await client.post("/api/auth/request-access").send({
      email: "outside-normal@gmail.com"
    });
    expect(disallowedNormalRequest.status).toBe(403);
    expect(disallowedNormalRequest.body.error).toContain("domain");

    const allowedNormalRequest = await client.post("/api/auth/request-access").send({
      email: "inside-normal@example-company.com"
    });
    expect(allowedNormalRequest.status).toBe(200);
  });

  it("creates isolated public trial workspaces only after terms are accepted", async () => {
    const { app } = await loadTestServer({ publicTrial: true });
    const client = request(app);

    const firstCodeResponse = await client.post("/api/auth/public-trial/request-code").send({
      email: "trial-one@gmail.com"
    });
    expect(firstCodeResponse.status).toBe(200);
    expect(firstCodeResponse.body.termsVersion).toBeTruthy();

    const missingTermsResponse = await client.post("/api/auth/public-trial/signup").send({
      email: "trial-one@gmail.com",
      code: firstCodeResponse.body.debugCode,
      displayName: "Trial One",
      avatarIconKey: "bear",
      avatarColorKey: "azure",
      password: "Password123!",
      acceptedTerms: false,
      acceptedTermsVersion: firstCodeResponse.body.termsVersion
    });
    expect(missingTermsResponse.status).toBe(400);

    const firstSignupResponse = await client.post("/api/auth/public-trial/signup").send({
      email: "trial-one@gmail.com",
      code: firstCodeResponse.body.debugCode,
      displayName: "Trial One",
      avatarIconKey: "bear",
      avatarColorKey: "azure",
      password: "Password123!",
      acceptedTerms: true,
      acceptedTermsVersion: firstCodeResponse.body.termsVersion
    });
    expect(firstSignupResponse.status).toBe(201);
    expect(firstSignupResponse.body.workspace).toMatchObject({
      name: "My First Workspace",
      kind: "public_trial"
    });
    expect(firstSignupResponse.body.team).toMatchObject({ name: "My First Team" });

    const secondCodeResponse = await client.post("/api/auth/public-trial/request-code").send({
      email: "trial-two@gmail.com"
    });
    expect(secondCodeResponse.status).toBe(200);

    const secondSignupResponse = await client.post("/api/auth/public-trial/signup").send({
      email: "trial-two@gmail.com",
      code: secondCodeResponse.body.debugCode,
      displayName: "Trial Two",
      avatarIconKey: "owl",
      avatarColorKey: "gold",
      password: "Password123!",
      acceptedTerms: true,
      acceptedTermsVersion: secondCodeResponse.body.termsVersion
    });
    expect(secondSignupResponse.status).toBe(201);
    expect(secondSignupResponse.body.team).toMatchObject({ name: "My First Team" });
    expect(secondSignupResponse.body.workspace.id).not.toBe(firstSignupResponse.body.workspace.id);
    expect(secondSignupResponse.body.team.id).not.toBe(firstSignupResponse.body.team.id);

    const duplicateCodeResponse = await client.post("/api/auth/public-trial/request-code").send({
      email: "trial-one@gmail.com"
    });
    expect(duplicateCodeResponse.status).toBe(409);
  });

  it("fails closed for public trial collaborator invites when SMTP is unavailable", async () => {
    const { app } = await loadTestServer({ publicTrial: true });
    const client = request(app);

    const codeResponse = await client.post("/api/auth/public-trial/request-code").send({
      email: "trial-invite-owner@gmail.com"
    });
    expect(codeResponse.status).toBe(200);

    const signupResponse = await client.post("/api/auth/public-trial/signup").send({
      email: "trial-invite-owner@gmail.com",
      code: codeResponse.body.debugCode,
      displayName: "Trial Invite Owner",
      avatarIconKey: "bear",
      avatarColorKey: "azure",
      password: "Password123!",
      acceptedTerms: true,
      acceptedTermsVersion: codeResponse.body.termsVersion
    });
    expect(signupResponse.status).toBe(201);
    const ownerCookie = signupResponse.headers["set-cookie"];
    const teamId = signupResponse.body.team.id as string;

    const inviteResponse = await client.post(`/api/teams/${teamId}/members`).set("Cookie", ownerCookie).send({
      email: "trial-collaborator@gmail.com"
    });

    expect(inviteResponse.status).toBe(503);
    expect(inviteResponse.body.error).toContain("require SMTP");
  });

  it("uses SMTP-only public trial invites for external emails without exposing manual-share passwords", async () => {
    const { app } = await loadTestServer({ publicTrial: true, smtp: true });
    const client = request(app);

    const codeResponse = await client.post("/api/auth/public-trial/request-code").send({
      email: "trial-smtp-owner@gmail.com"
    });
    expect(codeResponse.status).toBe(200);

    const signupResponse = await client.post("/api/auth/public-trial/signup").send({
      email: "trial-smtp-owner@gmail.com",
      code: codeResponse.body.debugCode,
      displayName: "Trial SMTP Owner",
      avatarIconKey: "bear",
      avatarColorKey: "azure",
      password: "Password123!",
      acceptedTerms: true,
      acceptedTermsVersion: codeResponse.body.termsVersion
    });
    expect(signupResponse.status).toBe(201);
    const ownerCookie = signupResponse.headers["set-cookie"];
    const teamId = signupResponse.body.team.id as string;

    const inviteResponse = await client.post(`/api/teams/${teamId}/members`).set("Cookie", ownerCookie).send({
      email: "external-collaborator@gmail.com"
    });

    expect(inviteResponse.status).toBe(201);
    expect(inviteResponse.body.invitedNewUser).toBe(true);
    expect(inviteResponse.body.invitationDelivery).toBe("smtp");
    expect(inviteResponse.body.temporaryPassword).toBeNull();
    expect(inviteResponse.body.secureSaveReminder).toBeNull();

    const invitationMail = (sendMailMock.mock.calls as unknown as Array<unknown[]>).find(
      ([message]) => (message as { to?: string }).to === "external-collaborator@gmail.com"
    )?.[0] as { text?: string } | undefined;
    expect(invitationMail?.text).toContain("Your initial password is:");
    const password = invitationMail?.text?.match(/Your initial password is: ([^.]+)\./)?.[1];
    expect(password).toBeTruthy();

    const collaboratorLogin = await client.post("/api/auth/signin-password").send({
      email: "external-collaborator@gmail.com",
      password
    });
    expect(collaboratorLogin.status).toBe(200);
    const collaboratorSession = await client.get("/api/auth/session").set("Cookie", collaboratorLogin.headers["set-cookie"]);
    expect(collaboratorSession.status).toBe(200);
    expect(collaboratorSession.body.memberships.map((team: { id: string }) => team.id)).toEqual([teamId]);
  });

  it("keeps normal self-hosted team invites allowlisted even with SMTP and public trial enabled", async () => {
    const { app } = await loadTestServer({ publicTrial: true, smtp: true });
    const client = request(app);
    const ownerCookie = await createRegularUser(client, "normal-owner@example-company.com", "Normal Owner");

    const teamResponse = await client.post("/api/teams").set("Cookie", ownerCookie).send({ name: "Normal Self Hosted Team" });
    expect(teamResponse.status).toBe(201);
    const teamId = teamResponse.body.team.id as string;

    const disallowedInvite = await client.post(`/api/teams/${teamId}/members`).set("Cookie", ownerCookie).send({
      email: "external-normal@gmail.com"
    });
    expect(disallowedInvite.status).toBe(403);
    expect(disallowedInvite.body.error).toContain("domain");

    const allowedInvite = await client.post(`/api/teams/${teamId}/members`).set("Cookie", ownerCookie).send({
      email: "normal-new@example-company.com"
    });
    expect(allowedInvite.status).toBe(201);
    expect(allowedInvite.body.invitationDelivery).toBe("smtp");
  });

  it("rate-limits public trial signup code requests by client", async () => {
    const { app } = await loadTestServer({ publicTrial: true });
    const client = request(app);

    for (let index = 0; index < 3; index += 1) {
      const response = await client.post("/api/auth/public-trial/request-code").send({
        email: `trial-rate-${index}@gmail.com`
      });
      expect(response.status).toBe(200);
    }

    const limitedResponse = await client.post("/api/auth/public-trial/request-code").send({
      email: "trial-rate-limited@gmail.com"
    });
    expect(limitedResponse.status).toBe(429);
    expect(limitedResponse.body.error).toContain("Too many public trial requests");
    expect(limitedResponse.body.retryAfterSeconds).toBeGreaterThan(0);
  });

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

  it("supports confirmed self-deletion, invalidates the session, and permits fresh registration", async () => {
    const { app } = await loadTestServer();
    const client = request(app);
    const email = "self-delete@example-company.com";
    const cookie = await createRegularUser(client, email, "Self Delete");

    const preview = await client.get("/api/account/deletion-preview").set("Cookie", cookie);
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({ mode: "deactivate_account", confirmationPhrase: "DELETE MY ACCOUNT" });

    const wrongPassword = await client.post("/api/account/delete").set("Cookie", cookie).send({
      currentPassword: "WrongPassword123!",
      confirmation: "DELETE MY ACCOUNT",
      impactToken: preview.body.impactToken
    });
    expect(wrongPassword.status).toBe(400);

    const deleted = await client.post("/api/account/delete").set("Cookie", cookie).send({
      currentPassword: "Password123!",
      confirmation: "DELETE MY ACCOUNT",
      impactToken: preview.body.impactToken
    });
    expect(deleted.status).toBe(200);
    expect(deleted.body).toMatchObject({ mode: "deactivate_account" });

    expect((await client.get("/api/auth/session").set("Cookie", cookie)).status).toBe(401);
    expect((await client.post("/api/auth/signin-password").send({ email, password: "Password123!" })).status).toBe(401);
    const replacementCookie = await createRegularUser(client, email, "Self Delete Fresh");
    expect(replacementCookie).toBeTruthy();
  });

  it("lets only the super-admin delete another account with exact-email confirmation", async () => {
    const { app, repository } = await loadTestServer();
    const client = request(app);
    const actorCookie = await createRegularUser(client, "delete-route-actor@example-company.com", "Delete Route Actor");
    const targetEmail = "delete-route-target@example-company.com";
    await createRegularUser(client, targetEmail, "Delete Route Target");
    const target = repository.getUserByEmail(targetEmail)!;

    const forbidden = await client.get(`/api/admin/users/${target.id}/deletion-preview`).set("Cookie", actorCookie);
    expect(forbidden.status).toBe(403);

    const adminSignIn = await client.post("/api/auth/signin-admin").send({
      username: "platform-admin",
      password: "PlatformAdmin123!"
    });
    const adminCookie = adminSignIn.headers["set-cookie"];
    const preview = await client.get(`/api/admin/users/${target.id}/deletion-preview`).set("Cookie", adminCookie);
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({ confirmationPhrase: targetEmail, mode: "deactivate_account" });

    const wrongConfirmation = await client
      .delete(`/api/admin/users/${target.id}`)
      .set("Cookie", adminCookie)
      .send({ confirmation: "wrong", impactToken: preview.body.impactToken });
    expect(wrongConfirmation.status).toBe(400);
    expect(repository.getUserByEmail(targetEmail)).not.toBeNull();

    const deleted = await client
      .delete(`/api/admin/users/${target.id}`)
      .set("Cookie", adminCookie)
      .send({ confirmation: targetEmail, impactToken: preview.body.impactToken });
    expect(deleted.status).toBe(200);
    expect(repository.getUserByEmail(targetEmail)).toBeNull();
  });
});
