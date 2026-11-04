// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { DatabaseSync } from "node:sqlite";
import request from "supertest";
import WebSocket from "ws";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BRANDING_MANIFEST, resolveTheme, type ThemeId } from "@planning-poker/shared";
import { applyInitialTheme } from "../src/http/themeHtml.js";

const directories: string[] = [];
const cleanup: Array<() => void> = [];

async function fixture(configText = "") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "opa-themes-"));
  directories.push(dir);
  fs.writeFileSync(path.join(dir, "allowed-domains.txt"), "example-company.com\n");
  fs.writeFileSync(path.join(dir, "deployment.toml"), configText);
  for (const [key, value] of Object.entries({
    NODE_ENV: "test", PORT: "0", HOST: "127.0.0.1", DATA_DIR: dir,
    DATABASE_PATH: path.join(dir, "test.db"), ALLOWED_DOMAINS_PATH: path.join(dir, "allowed-domains.txt"),
    DEPLOYMENT_CONFIG_PATH: path.join(dir, "deployment.toml"), MANAGED_BRANDING_DIR: path.join(dir, "branding"),
    DEBUG_TOOLS_ENABLED: "0", APP_BASE_URL: "http://localhost:3001", SUPER_ADMIN_USERNAME: "platform-admin",
    SUPER_ADMIN_PASSWORD: "PlatformAdmin123!", SUPER_ADMIN_DISPLAY_NAME: "Platform Admin"
  })) vi.stubEnv(key, value);
  vi.resetModules();
  const api = await import("../src/server.js");
  cleanup.push(() => { clearInterval(api.timerSweepInterval); clearInterval(api.simulatorRuntimeVisibilityInterval); });
  const { DeploymentConfigManager } = await import("../src/deploymentConfig.js");
  const manager = new DeploymentConfigManager();
  const user = api.repository.ensureUser({ email: "theme@example-company.com", displayName: "Theme User", avatarIconKey: "bear", avatarColorKey: "azure" });
  const session = api.repository.createSessionForExistingUser(user.id);
  return { ...api, dir, manager, user, session, cookie: `session_token=${session.sessionToken}`, client: request(api.app) };
}

afterEach(() => {
  cleanup.splice(0).forEach((fn) => fn());
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  directories.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true }));
});

describe("Theme persistence and configuration", () => {
  it("keeps nullable preferences per account through both projections, omission and reset", async () => {
    const { repository: repo, user, session } = await fixture();
    const other = repo.ensureUser({ email: "other@example-company.com", displayName: "Other", avatarIconKey: "bear", avatarColorKey: "azure" });
    expect(repo.getCurrentUser(user.id)?.themeId).toBeNull();
    expect(repo.updateUserPreferences(user.id, { themeId: "nord" }).themeId).toBe("nord");
    expect(repo.getSessionUser(session.sessionToken)?.themeId).toBe("nord");
    expect(repo.getCurrentUser(other.id)?.themeId).toBeNull();
    expect(repo.updateUserPreferences(user.id, { openLastTeamOnLogin: false }).themeId).toBe("nord");
    expect(() => repo.updateUserPreferences(user.id, { themeId: "unknown" as ThemeId })).toThrow("Unknown theme ID");
    expect(repo.getCurrentUser(user.id)?.themeId).toBe("nord");
    expect(() => repo.updateUserPreferences(user.id, { themeId: "github-dark", historyTimezonePopupEnabled: false })).toThrow("Team is required");
    expect(repo.getCurrentUser(user.id)?.themeId).toBe("nord");
    expect(repo.updateUserPreferences(user.id, { themeId: null }).themeId).toBeNull();
  });

  it("preserves preferences in full snapshots, migrates old imports repeatedly, and keeps team history theme-free", async () => {
    const { repository: repo, user, dir } = await fixture('[branding]\ndefault_theme_id = "nord"\n');
    repo.updateUserPreferences(user.id, { themeId: "opa-midnight-ember" });
    const team = repo.createTeam(user.id, "Theme snapshot team");
    const round = repo.createRound(team.id, "Snapshot vote");
    repo.castVote(round.id, user.id, "5");
    repo.revealRound(round.id);
    const history = repo.exportTeamHistory(team.id);
    expect(JSON.stringify(history)).not.toMatch(/"theme(?:Id|_id)?":/);
    const snapshot = repo.exportWholeDatabaseSnapshot();
    repo.updateUserPreferences(user.id, { themeId: null });
    repo.importWholeDatabaseSnapshot(snapshot.bytes);
    expect(repo.getCurrentUser(user.id)?.themeId).toBe("opa-midnight-ember");
    const oldPath = path.join(dir, "old.sqlite");
    fs.writeFileSync(oldPath, snapshot.bytes);
    const old = new DatabaseSync(oldPath);
    old.exec("ALTER TABLE users DROP COLUMN theme_id");
    old.close();
    const oldBytes = fs.readFileSync(oldPath);
    for (let index = 0; index < 2; index++) {
      repo.importWholeDatabaseSnapshot(oldBytes);
      expect(repo.getCurrentUser(user.id)?.themeId).toBeNull();
      expect(repo.exportTeamHistory(team.id)).toMatchObject({ sourceTeam: history.sourceTeam, entries: history.entries });
    }
    expect(fs.readFileSync(path.join(dir, "deployment.toml"), "utf8")).toContain('default_theme_id = "nord"');
  });

  it("treats unknown imported personal IDs as inheritance and clears retained deletion tombstones", async () => {
    const { repository: repo, user, session, dir } = await fixture();
    const db = new DatabaseSync(path.join(dir, "test.db"));
    try {
      db.prepare("UPDATE users SET theme_id = ? WHERE id = ?").run("retired-theme", user.id);
      expect(repo.getCurrentUser(user.id)?.themeId).toBeNull();
      expect(repo.peekSessionUser(session.sessionToken)?.themeId).toBeNull();
      repo.updateUserPreferences(user.id, { themeId: "nord" });
      const admin = repo.getSuperAdminUser()!;
      const preview = repo.getPlatformUserDeletionPreview(admin.id, user.id);
      repo.deletePlatformUser(admin.id, user.id, preview.confirmationPhrase, preview.impactToken);
      expect(db.prepare("SELECT theme_id, deleted_at FROM users WHERE id = ?").get(user.id)).toMatchObject({ theme_id: null, deleted_at: expect.any(String) });
      expect(repo.peekSessionUser(session.sessionToken)).toBeNull();
    } finally { db.close(); }
  });

  it("looks up HTML sessions without renewal, deletion or activity writes and rejects invalid/expired/deleted identities", async () => {
    const { repository: repo, user, session, dir } = await fixture();
    const db = new DatabaseSync(path.join(dir, "test.db"));
    const state = () => ({
      user: db.prepare("SELECT updated_at, last_active_at FROM users WHERE id = ?").get(user.id),
      session: db.prepare("SELECT * FROM sessions WHERE token = ?").get(session.sessionToken)
    });
    try {
      db.prepare("UPDATE sessions SET expires_at = ?, last_active_at = ? WHERE token = ?")
        .run("2099-01-01T00:00:00.000Z", "2000-01-01T00:00:00.000Z", session.sessionToken);
      db.prepare("UPDATE users SET last_active_at = ? WHERE id = ?").run("2000-01-01T00:00:00.000Z", user.id);
      let before = state();
      expect(repo.peekSessionUser(session.sessionToken)?.id).toBe(user.id);
      expect(state()).toEqual(before);
      expect(repo.peekSessionUser(undefined)).toBeNull();
      expect(repo.peekSessionUser("invalid")).toBeNull();
      for (const expiry of ["2000-01-01T00:00:00.000Z", "not-a-date"]) {
        db.prepare("UPDATE sessions SET expires_at = ? WHERE token = ?").run(expiry, session.sessionToken);
        before = state();
        expect(repo.peekSessionUser(session.sessionToken)).toBeNull();
        expect(state()).toEqual(before);
      }
      db.prepare("UPDATE sessions SET expires_at = ? WHERE token = ?").run("2099-01-01T00:00:00.000Z", session.sessionToken);
      db.prepare("UPDATE users SET deleted_at = ? WHERE id = ?").run(new Date().toISOString(), user.id);
      expect(repo.peekSessionUser(session.sessionToken)).toBeNull();
      expect(repo.getSessionUser(session.sessionToken)).toBeNull();
    } finally { db.close(); }
  });

  it("defaults old config to Light and saves a validated default through config, bootstrap and reload", async () => {
    const { manager, client, dir } = await fixture();
    expect(manager.getConfig().branding.defaultThemeId).toBe("opa-light");
    const login = await client.post("/api/auth/signin-admin").send({ username: "platform-admin", password: "PlatformAdmin123!" });
    const cookie = login.headers["set-cookie"];
    const save = await client.patch("/api/admin/config").set("Cookie", cookie).send({ branding: { defaultThemeId: "opa-midnight-ember" } });
    expect(save.status).toBe(200);
    expect(save.body.appliedFields).toContain("branding.defaultThemeId");
    expect(save.body.restartRequiredFields).toEqual([]);
    expect((await client.get("/api/bootstrap")).body.branding.defaultThemeId).toBe("opa-midnight-ember");
    const { DeploymentConfigManager } = await import("../src/deploymentConfig.js");
    expect(new DeploymentConfigManager().getRedactedConfig().branding.defaultThemeId).toBe("opa-midnight-ember");
    expect(fs.readFileSync(path.join(dir, "deployment.toml"), "utf8")).toContain('default_theme_id = "opa-midnight-ember"');
    for (const defaultThemeId of [null, "", "unknown", 3, "nord; color:red"]) {
      expect((await client.patch("/api/admin/config").set("Cookie", cookie).send({ branding: { defaultThemeId } })).status).toBe(400);
    }
    expect(() => manager.updateConfig({ branding: { defaultThemeId: "unknown" as ThemeId } })).toThrow("Unknown theme ID");
  });

  it("normalizes safe legacy colors without rewriting source and rejects CSS injection at API and config boundaries", async () => {
    const original = '[branding]\ndefault_theme_id = "retired"\nprimary_action = "rgb(12, 34, 56)"\ntext_emphasis = "red; background:url(https://example.test)"\n';
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { manager, client, dir } = await fixture(original);
    expect(manager.getConfig().branding.defaultThemeId).toBe("opa-light");
    expect(manager.getConfig().branding.palette.primaryAction).toBe("#0c2238");
    expect(manager.getConfig().branding.palette.textEmphasis.toLowerCase()).toBe(BRANDING_MANIFEST.palette.textEmphasis.toLowerCase());
    expect(fs.readFileSync(path.join(dir, "deployment.toml"), "utf8")).toBe(original);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("default_theme_id"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("textEmphasis"));
    const login = await client.post("/api/auth/signin-admin").send({ username: "platform-admin", password: "PlatformAdmin123!" });
    for (const value of ['red;--x:1', '</style><script>alert(1)</script>', 'url(https://example.test)', 'var(--evil)']) {
      expect((await client.patch("/api/admin/config").set("Cookie", login.headers["set-cookie"]).send({ branding: { palette: { primaryAction: value } } })).status).toBe(400);
      expect(() => manager.updateConfig({ branding: { palette: { primaryAction: value } } })).toThrow("Invalid branding color");
    }
    const html = applyInitialTheme("<html><head></head><body></body></html>", { ...BRANDING_MANIFEST, palette: { ...BRANDING_MANIFEST.palette, primaryAction: '</style><script>alert(1)</script>' } });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("example.test");
  });
});

describe("Theme HTTP and first paint", () => {
  it.each([false, true])("isolates anonymous/personal HTML for every SPA route without touching sessions (trial=%s)", async (trial) => {
    const { client, repository: repo, user, session, cookie, dir } = await fixture(`[branding]\ndefault_theme_id = "nord"\n[public_trial]\nenabled = ${trial}\n`);
    repo.updateUserPreferences(user.id, { themeId: "opa-midnight-ember" });
    const other = repo.ensureUser({ email: "second@example-company.com", displayName: "Second", avatarIconKey: "bear", avatarColorKey: "azure" });
    repo.updateUserPreferences(other.id, { themeId: "github-light" });
    const otherSession = repo.createSessionForExistingUser(other.id);
    const db = new DatabaseSync(path.join(dir, "test.db"));
    const before = db.prepare("SELECT * FROM sessions WHERE token = ?").get(session.sessionToken);
    try {
      const entryRoutes = ["/", "/index.html", "/%69ndex.html", "/index%2ehtml", "//index.html"];
      const adminRoutes = ["/admin", "/admin/", "/%61dmin", "/admin%2f"];
      for (const route of [...entryRoutes, ...adminRoutes, "/teams/restored-room", "/teams/%72estored-room"]) {
        for (const [header, expected] of [[undefined, "nord"], [cookie, "opa-midnight-ember"], [`session_token=${otherSession.sessionToken}`, "github-light"], ["session_token=invalid", "nord"]] as const) {
          const req = client.get(route);
          if (header) req.set("Cookie", header);
          const response = await req;
          expect(response.status).toBe(200);
          expect(response.headers["cache-control"]).toBe("private, no-store");
          expect(response.text).toContain(`data-theme="${expected}"`);
          expect(response.text).toContain('data-theme-default="nord"');
          const theme = resolveTheme(expected);
          expect(response.text).toContain(`color-scheme:${theme.colorScheme}`);
          expect(response.text).toContain(`--theme-page:${theme.tokens["--theme-page"]}`);
          for (const secret of [user.id, user.email, session.sessionToken, otherSession.sessionToken]) expect(response.text).not.toContain(secret);
          if (adminRoutes.includes(route)) expect(response.headers["x-robots-tag"]).toBe("noindex");
          if (trial && entryRoutes.includes(route)) expect(response.text).toContain("Enable JavaScript to sign in");
        }
      }
      expect(db.prepare("SELECT * FROM sessions WHERE token = ?").get(session.sessionToken)).toEqual(before);
      repo.deleteSession(session.sessionToken);
      expect((await client.get("/").set("Cookie", cookie)).text).toContain('data-theme="nord"');
      const asset = await client.get("/branding/login-logo.svg").set("Cookie", cookie);
      expect(asset.status).toBe(200);
      expect(asset.headers["cache-control"]).not.toBe("private, no-store");
      expect((await client.get("/health/web")).status).toBe(200);
    } finally { db.close(); }
  });

  it("uses the platform theme for public policies and Jira connection results even with a personal cookie", async () => {
    const { client, repository: repo, user, cookie } = await fixture('[branding]\ndefault_theme_id = "nord"\n[public_trial]\nenabled = true\n');
    repo.updateUserPreferences(user.id, { themeId: "opa-midnight-ember" });
    for (const route of ["/public-trial/terms", "/public-trial/privacy", "/public-trial/acceptable-use", "/public-trial/export-cleanup", "/api/admin/jira/oauth/callback"]) {
      const response = await client.get(route).set("Cookie", cookie);
      expect(response.text).toContain('data-theme="nord"');
      expect(response.text).not.toContain('data-theme="opa-midnight-ember"');
      expect(response.text).toContain("var(--theme-page)");
    }
  });

  it("authorizes and validates personal saves while preserving omitted fields and other accounts", async () => {
    const { client, repository: repo, user, cookie } = await fixture();
    expect((await client.patch("/api/auth/preferences").send({ themeId: "nord" })).status).toBe(401);
    expect((await client.patch("/api/admin/config").set("Cookie", cookie).send({ branding: { defaultThemeId: "nord" } })).status).toBe(403);
    for (const themeId of ["", "unknown", false, 1, {}, ["nord"]]) {
      expect((await client.patch("/api/auth/preferences").set("Cookie", cookie).send({ themeId })).status).toBe(400);
    }
    expect((await client.patch("/api/auth/preferences").set("Cookie", cookie).send({ themeId: "nord" })).body.user.themeId).toBe("nord");
    expect((await client.patch("/api/auth/preferences").set("Cookie", cookie).send({ boardShortcutsEnabled: false })).body.user.themeId).toBe("nord");
    expect((await client.get("/api/auth/session").set("Cookie", cookie)).body.user.themeId).toBe("nord");
    const credentials = repo.resetPlatformUserPassword(repo.getSuperAdminUser()!.id, user.id);
    const signIn = await client.post("/api/auth/signin-password").send({ email: user.email, password: credentials.temporaryPassword });
    expect(signIn.status).toBe(200);
    expect(signIn.body.user.themeId).toBe("nord");
    expect(repo.getSuperAdminUser()?.themeId).toBeNull();
    expect((await client.patch("/api/auth/preferences").set("Cookie", cookie).send({ themeId: null })).body.user.themeId).toBeNull();
    expect(repo.getCurrentUser(user.id)?.themeId).toBeNull();
  });

  it("broadcasts platform defaults live but never fans theme-only preferences out to rooms or the chooser", async () => {
    const { client, repository: repo, user, cookie, server } = await fixture();
    const team = repo.createTeam(user.id, "Quiet appearance");
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address() as { port: number };
    const messages: Array<{ type: string; payload?: { defaultThemeId?: string } }> = [];
    const sockets = ["scope=chooser", `teamId=${team.id}`].map((query) => {
      const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws?${query}`, { headers: { Cookie: cookie } });
      socket.on("message", (raw) => messages.push(JSON.parse(String(raw))));
      return socket;
    });
    try {
      await Promise.all(sockets.map((socket) => once(socket, "open")));
      await new Promise((resolve) => setTimeout(resolve, 80));
      messages.length = 0;
      const lookup = vi.spyOn(repo, "getTeamsForUser");
      for (const payload of [{ themeId: "nord" }, { themeId: "opa-midnight-ember", teamId: team.id }, { themeId: null }]) {
        expect((await client.patch("/api/auth/preferences").set("Cookie", cookie).send(payload)).status).toBe(200);
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(lookup).not.toHaveBeenCalled();
      expect(messages.filter((message) => ["team:update", "chooser:update"].includes(message.type))).toEqual([]);
      await client.patch("/api/auth/preferences").set("Cookie", cookie).send({ boardShortcutsEnabled: false });
      await vi.waitFor(() => expect(messages.some((message) => message.type === "team:update")).toBe(true));
      const login = await client.post("/api/auth/signin-admin").send({ username: "platform-admin", password: "PlatformAdmin123!" });
      await client.patch("/api/admin/config").set("Cookie", login.headers["set-cookie"]).send({ branding: { defaultThemeId: "nord" } });
      await vi.waitFor(() => expect(messages.some((message) => message.type === "platform:branding" && message.payload?.defaultThemeId === "nord")).toBe(true));
    } finally {
      await Promise.all(sockets.map(async (socket) => { const closed = once(socket, "close"); socket.close(); await closed; }));
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
