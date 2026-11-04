// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BRANDING_MANIFEST, DEFAULT_HISTORY_TIME_ZONE_KEYS, resolveTheme, type CurrentUserSummary } from "@planning-poker/shared";
import App from "./App";
import { AccountSettingsModal } from "./app/AccountSettingsModal";
import { AdminSettingsModal } from "./app/AdminSettingsModal";
import { APPEARANCE_HINT_KEY, createThemeController } from "./app/themeController";
import type { AdminConfigView } from "./app/types";

const user: CurrentUserSummary = {
  id: "appearance-user", email: "appearance@example.com", displayName: "Appearance User", avatarIconKey: "orbit", avatarColorKey: "azure",
  isSuperAdmin: false, loginName: null, boardShortcutsEnabled: true, themeId: null
};
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
const platform = (defaultThemeId: "opa-light" | "nord" | "opa-midnight-ember") => ({ ...BRANDING_MANIFEST, defaultThemeId });

class SocketMock {
  static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
  readyState = 1;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  close() { this.readyState = 3; }
  addEventListener() {}
  removeEventListener() {}
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("style");
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.themeDefault;
  delete document.documentElement.dataset.themeSource;
  window.history.replaceState({}, "", "/");
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("document appearance lifecycle", () => {
  it("seeds usable Light tokens for a bare Vite entry before the API resolves", () => {
    createThemeController(document.documentElement);
    expect(document.documentElement.dataset.theme).toBe("opa-light");
    expect(document.documentElement.style.colorScheme).toBe("light");
    expect(document.documentElement.style.getPropertyValue("--theme-page")).toBe(resolveTheme("opa-light").tokens["--theme-page"]);
  });

  it("keeps the server's personal first paint until session resolution, even when bootstrap arrives first", () => {
    const root = document.documentElement;
    root.dataset.theme = "opa-midnight-ember";
    root.dataset.themeDefault = "nord";
    root.style.setProperty("--theme-page", "#090e1d");
    const controller = createThemeController(root);
    controller.setBranding(platform("nord"));
    expect(root.dataset.theme).toBe("opa-midnight-ember");
    expect(root.style.getPropertyValue("--theme-page")).toBe("#090e1d");
    controller.setUser({ ...user, themeId: "opa-midnight-ember" });
    expect(root.dataset.theme).toBe("opa-midnight-ember");
  });

  it("keeps server-normalized legacy colors until branding resolves", () => {
    const root = document.documentElement;
    root.dataset.theme = "opa-light";
    root.dataset.themeDefault = "opa-light";
    root.style.setProperty("--theme-action", "#123456");
    const controller = createThemeController(root);
    controller.setUser(user);
    expect(root.style.getPropertyValue("--theme-action")).toBe("#123456");
    controller.setBranding(platform("opa-light"));
    expect(root.style.getPropertyValue("--theme-action")).toBe(resolveTheme("opa-light", BRANDING_MANIFEST.palette).tokens["--theme-action"]);
  });

  it("applies live defaults to inheriting accounts and keeps explicit choices across late default updates", () => {
    const root = document.documentElement;
    const controller = createThemeController(root);
    controller.setUser(user);
    controller.setBranding(platform("nord"));
    expect(root.dataset.theme).toBe("nord");
    controller.setUser({ ...user, themeId: "opa-midnight-ember" });
    controller.setBranding(platform("opa-light"));
    expect(root.dataset.theme).toBe("opa-midnight-ember");
    controller.setUser(user);
    expect(root.dataset.theme).toBe("opa-light");
  });

  it("discards personal state and hints on sign-out or identity replacement", () => {
    const root = document.documentElement;
    const controller = createThemeController(root, localStorage);
    controller.setBranding(platform("nord"));
    controller.publishPreference({ ...user, themeId: "opa-midnight-ember" });
    expect(localStorage.getItem(APPEARANCE_HINT_KEY)).toContain(user.id);
    controller.setUser({ ...user, id: "different-user", themeId: null });
    expect(root.dataset.theme).toBe("nord");
    expect(localStorage.getItem(APPEARANCE_HINT_KEY)).toBeNull();
    controller.publishPreference({ ...user, themeId: "opa-midnight-ember" });
    controller.setUser(null);
    expect(root.dataset.theme).toBe("nord");
    expect(localStorage.getItem(APPEARANCE_HINT_KEY)).toBeNull();
  });

  it("treats valid same-account hints as refresh requests, never as authority", () => {
    const root = document.documentElement;
    const controller = createThemeController(root);
    controller.setBranding(platform("nord"));
    controller.setUser(user);
    const event = (userId: string, themeId: unknown) => ({ key: APPEARANCE_HINT_KEY, newValue: JSON.stringify({ userId, themeId }) });
    expect(controller.shouldRefresh(event(user.id, "opa-midnight-ember"))).toBe(true);
    expect(root.dataset.theme).toBe("nord");
    expect(controller.shouldRefresh(event("other-user", "opa-midnight-ember"))).toBe(false);
    expect(controller.shouldRefresh(event(user.id, "url(evil)"))).toBe(false);
    expect(controller.shouldRefresh({ key: APPEARANCE_HINT_KEY, newValue: "bad json" })).toBe(false);
  });

  it("survives blocked storage and rejects unknown imported theme IDs", () => {
    const root = document.documentElement;
    const storage = { setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } };
    const controller = createThemeController(root, storage);
    controller.setBranding({ ...BRANDING_MANIFEST, defaultThemeId: "unknown" as never });
    controller.publishPreference({ ...user, themeId: "unknown" as never });
    expect(root.dataset.theme).toBe("opa-light");
    controller.setUser(null);
    expect(root.dataset.theme).toBe("opa-light");
  });
});

describe("appearance settings", () => {
  const props = {
    open: true, user, branding: platform("nord"), historyTimezoneDefaultKeys: DEFAULT_HISTORY_TIME_ZONE_KEYS, isBusy: false,
    onClose: vi.fn(), onSaveProfile: vi.fn(), onSaveBoardShortcutsPreference: vi.fn(), onSaveHistoryTimezonePreference: vi.fn(), onChangePassword: vi.fn()
  };
  it("previews locally, saves explicitly, and discards an unsaved selection when reopened", async () => {
    const save = vi.fn(async () => {});
    const { rerender } = render(<AccountSettingsModal {...props} onSaveThemePreference={save} />);
    expect(screen.getByRole("option", { name: "Use platform default — Nord" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Theme" }), { target: { value: "opa-midnight-ember" } });
    expect(screen.getByText("Preview: Midnight Ember")).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
    expect(document.documentElement.dataset.theme).toBeUndefined();
    rerender(<AccountSettingsModal {...props} open={false} onSaveThemePreference={save} />);
    rerender(<AccountSettingsModal {...props} onSaveThemePreference={save} />);
    expect(screen.getByRole("combobox", { name: "Theme" })).toHaveValue("");
    fireEvent.change(screen.getByRole("combobox", { name: "Theme" }), { target: { value: "nord" } });
    fireEvent.click(screen.getByRole("button", { name: "Save appearance" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith("nord"));
    expect(await screen.findByText("Appearance saved.")).toBeInTheDocument();
  });

  it("reports failed saves inline without changing the active theme", async () => {
    document.documentElement.dataset.theme = "nord";
    render(<AccountSettingsModal {...props} user={{ ...user, themeId: "nord" }} onSaveThemePreference={async () => { throw new Error("Saving appearance is unavailable."); }} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Theme" }), { target: { value: "opa-midnight-ember" } });
    fireEvent.click(screen.getByRole("button", { name: "Save appearance" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Saving appearance is unavailable.");
    expect(document.documentElement.dataset.theme).toBe("nord");
    expect(screen.queryByText("Appearance saved.")).not.toBeInTheDocument();
  });

  it("sends null when an explicit personal theme is reset to inheritance", async () => {
    const save = vi.fn(async () => {});
    render(<AccountSettingsModal {...props} user={{ ...user, themeId: "nord" }} onSaveThemePreference={save} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Theme" }), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save appearance" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(null));
  });

  it("previews platform appearance without changing the administrator's active personal theme", async () => {
    const config: AdminConfigView = {
      app: { baseUrl: "http://localhost", allowedDomainsPath: "domains", deploymentConfigPath: "config", managedBrandingDir: "branding" },
      admin: { username: "admin", displayName: "Admin", passwordConfigured: true },
      smtp: { host: "", port: null, user: "", from: "", passConfigured: false },
      jira: { clientId: "", clientSecretConfigured: false, connected: false, siteUrl: null, siteName: null, cloudId: null, pendingSites: [] },
      branding: platform("opa-light"), demo: { enabled: false }
    };
    const save = vi.fn(async () => ({ config: { ...config, branding: platform("nord") }, appliedFields: ["branding.defaultThemeId"], restartRequiredFields: [] }));
    document.documentElement.dataset.theme = "opa-midnight-ember";
    render(<AdminSettingsModal open onClose={vi.fn()} onConfigApplied={vi.fn()} loadConfig={async () => config} loadPeople={async () => ({ requests: [], users: [] })} admitAccessRequest={vi.fn()} denyAccessRequest={vi.fn()} resetPlatformUserPassword={vi.fn()} saveConfig={save} revealSecret={vi.fn()} uploadBrandingAsset={vi.fn()} exportWholeDatabase={vi.fn()} importWholeDatabase={vi.fn()} startJiraOAuth={vi.fn()} selectJiraSite={vi.fn()} disconnectJira={vi.fn()} peopleRefreshTick={0} />);
    fireEvent.click(await screen.findByRole("tab", { name: "Branding" }));
    fireEvent.change(await screen.findByRole("combobox", { name: "Platform default theme" }), { target: { value: "nord" } });
    expect(screen.getByText("Preview: Nord")).toBeInTheDocument();
    expect(document.documentElement.dataset.theme).toBe("opa-midnight-ember");
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ branding: expect.objectContaining({ defaultThemeId: "nord" }) })));
  });
});

describe("App authoritative appearance refresh", () => {
  it.each(["password", "admin", "code", "trial"] as const)("ignores a pre-login 401 after successful %s authentication", async (kind) => {
    let releaseExpired!: () => void;
    let releaseSignedIn!: () => void;
    const expired = new Promise<void>(resolve => { releaseExpired = resolve; });
    const signedIn = new Promise<void>(resolve => { releaseSignedIn = resolve; });
    let sessionRequests = 0;
    if (kind === "admin") window.history.replaceState({}, "", "/admin");
    vi.stubGlobal("WebSocket", SocketMock);
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/bootstrap") return json({ debugToolsEnabled: false, smtpConfigured: true, branding: platform("nord"), publicTrial: kind === "trial" ? { enabled: true, mode: "open_signup" } : undefined });
      if (String(input) === "/api/auth/session") {
        if (++sessionRequests === 1) { await expired; return json({ error: "Expired" }, 401); }
        await signedIn;
        return json({ user: { ...user, isSuperAdmin: kind === "admin", themeId: "opa-midnight-ember" }, memberships: [], availableTeams: [] });
      }
      if (String(input) === "/api/auth/request-password-reset" || String(input) === "/api/auth/public-trial/request-code") return json({ delivery: "fallback-log", debugCode: "1234567890123456", termsVersion: "test-terms" });
      return json({ active: [], history: [], pendingJoinRequests: [] });
    }));
    render(<App />);
    fireEvent.change(screen.getByLabelText(kind === "admin" ? "Admin username" : "Email", { exact: true }), { target: { value: kind === "admin" ? "admin" : user.email } });
    if (kind === "code" || kind === "trial") {
      fireEvent.click(await screen.findByRole("button", { name: kind === "trial" ? "Start free public trial" : "Forgot password" }));
      fireEvent.change(await screen.findByLabelText("16-digit code", { exact: true }), { target: { value: "1234567890123456" } });
      fireEvent.change(screen.getByLabelText("Display name", { exact: true }), { target: { value: "Appearance User" } });
      fireEvent.change(screen.getByLabelText("Confirm password", { exact: true }), { target: { value: "Password123!" } });
      if (kind === "trial") fireEvent.click(screen.getByRole("checkbox", { name: /I accept the/ }));
    }
    fireEvent.change(screen.getByLabelText(kind === "admin" ? "Admin password" : "Password", { exact: true }), { target: { value: "Password123!" } });
    fireEvent.click(screen.getByRole("button", { name: kind === "admin" ? "Admin sign in" : kind === "password" ? "Sign in" : "Finish setup" }));
    await waitFor(() => expect(sessionRequests).toBeGreaterThan(1));
    await act(async () => releaseExpired());
    await act(async () => releaseSignedIn());
    expect(await screen.findByRole("button", { name: "Account" })).toBeInTheDocument();
    expect(document.documentElement.dataset.theme).toBe("opa-midnight-ember");
  });

  it("accepts a delayed expiry response even while the chooser starts newer polls", async () => {
    vi.useFakeTimers();
    let expired = false;
    let expiredRequests = 0;
    vi.stubGlobal("WebSocket", SocketMock);
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/bootstrap") return json({ debugToolsEnabled: false, branding: platform("nord") });
      if (String(input) === "/api/auth/session") {
        if (expired) {
          ++expiredRequests;
          await new Promise(resolve => setTimeout(resolve, 4000));
          return json({ error: "Expired" }, 401);
        }
        return json({ user: { ...user, themeId: "opa-midnight-ember" }, memberships: [], availableTeams: [] });
      }
      return json({ active: [], history: [], pendingJoinRequests: [] });
    }));
    try {
      await act(async () => { render(<App />); });
      expect(screen.getByRole("button", { name: "Account" })).toBeInTheDocument();
      expect(document.documentElement.dataset.theme).toBe("opa-midnight-ember");
      expired = true;
      await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
      expect(expiredRequests).toBeGreaterThanOrEqual(2);
      await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
      expect(document.documentElement.dataset.theme).toBe("nord");
      expect(screen.queryByRole("button", { name: "Account" })).not.toBeInTheDocument();
    } finally {
      cleanup();
      vi.useRealTimers();
    }
  });

  it("does not restore a personal theme when an unrelated preference response arrives after logout", async () => {
    let releasePreference!: () => void;
    const pendingPreference = new Promise<void>(resolve => { releasePreference = resolve; });
    let signedIn = true;
    vi.stubGlobal("WebSocket", SocketMock);
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/bootstrap") return json({ debugToolsEnabled: false, branding: platform("nord") });
      if (url === "/api/auth/session") return signedIn ? json({ user: { ...user, themeId: "opa-midnight-ember" }, memberships: [], availableTeams: [] }) : json({ error: "Signed out" }, 401);
      if (url === "/api/auth/preferences") {
        await pendingPreference;
        return json({ user: { ...user, themeId: "opa-midnight-ember", openLastTeamOnLogin: false } });
      }
      if (url === "/api/auth/signout") { signedIn = false; return json({ ok: true }); }
      return json({ active: [], history: [], pendingJoinRequests: [] });
    }));
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Account" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Open my last team automatically after sign-in" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("nord"));
    await act(async () => releasePreference());
    expect(document.documentElement.dataset.theme).toBe("nord");
    expect(document.documentElement.dataset.themeSource).toBe("platform");
  });

  it("restores a slow session while a newer refresh is still pending", async () => {
    let resolveFirst!: (value: CurrentUserSummary) => void;
    let resolveLater!: (value: CurrentUserSummary) => void;
    const first = new Promise<CurrentUserSummary>(resolve => { resolveFirst = resolve; });
    const later = new Promise<CurrentUserSummary>(resolve => { resolveLater = resolve; });
    let sessionRequests = 0;
    vi.stubGlobal("WebSocket", SocketMock);
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/bootstrap") return json({ debugToolsEnabled: false, branding: platform("opa-light") });
      if (String(input) === "/api/auth/session") return json({ user: await (++sessionRequests === 1 ? first : later), memberships: [], availableTeams: [] });
      return json({ active: [], history: [], pendingJoinRequests: [] });
    }));
    render(<App />);
    fireEvent.focus(window);
    await act(async () => resolveFirst({ ...user, themeId: "nord" }));
    expect(await screen.findByRole("button", { name: "Account" })).toBeInTheDocument();
    expect(document.documentElement.dataset.theme).toBe("nord");
    await act(async () => resolveLater({ ...user, themeId: "opa-midnight-ember" }));
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("opa-midnight-ember"));
  });

  it("does not let a session request started before Save undo the saved choice", async () => {
    let releaseRefresh!: () => void;
    const pendingRefresh = new Promise<void>(resolve => { releaseRefresh = resolve; });
    let sessionRequests = 0;
    vi.stubGlobal("WebSocket", SocketMock);
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/bootstrap") return json({ debugToolsEnabled: false, branding: platform("nord") });
      if (url === "/api/auth/session") {
        if (++sessionRequests > 1) await pendingRefresh;
        return json({ user, memberships: [], availableTeams: [] });
      }
      if (url === "/api/auth/preferences") return json({ user: { ...user, themeId: "opa-midnight-ember" } });
      return json({ active: [], history: [], pendingJoinRequests: [] });
    }));
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Account" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Theme" }), { target: { value: "opa-midnight-ember" } });
    fireEvent.click(screen.getByRole("button", { name: "Save appearance" }));
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("opa-midnight-ember"));
    await act(async () => releaseRefresh());
    expect(document.documentElement.dataset.theme).toBe("opa-midnight-ember");
    expect(screen.getByRole("combobox", { name: "Theme" })).toHaveValue("opa-midnight-ember");
  });

  it("restores cookie sessions and saves appearance when browser storage is blocked", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.stubGlobal("WebSocket", SocketMock);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/bootstrap") return json({ debugToolsEnabled: false, branding: platform("nord") });
      if (url === "/api/auth/session") return json({ user, memberships: [], availableTeams: [] });
      if (url === "/api/auth/preferences") {
        expect(JSON.parse(String(init?.body))).toEqual({ themeId: "opa-midnight-ember" });
        return json({ user: { ...user, themeId: "opa-midnight-ember", boardShortcutsEnabled: false } });
      }
      return json({ active: [], history: [], pendingJoinRequests: [] });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Account" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Theme" }), { target: { value: "opa-midnight-ember" } });
    fireEvent.click(screen.getByRole("button", { name: "Save appearance" }));
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("opa-midnight-ember"));
    // The theme-only save does not replace existing account/team preference fields.
    expect(screen.getByRole("checkbox", { name: "Enable board action keyboard shortcuts" })).toBeChecked();
    expect(await screen.findByText("Appearance saved.")).toBeInTheDocument();
  });

  it("retains the injected personal appearance through a delayed bootstrap and clears it only on a confirmed 401", async () => {
    document.documentElement.dataset.theme = "opa-midnight-ember";
    document.documentElement.dataset.themeDefault = "nord";
    let bootstrapResolve!: (response: Response) => void;
    const bootstrap = new Promise<Response>(resolve => { bootstrapResolve = resolve; });
    let sessionStatus = 200;
    vi.stubGlobal("WebSocket", SocketMock);
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/bootstrap") return bootstrap;
      if (url === "/api/auth/session") return sessionStatus === 200 ? json({ user: { ...user, themeId: "opa-midnight-ember" }, memberships: [], availableTeams: [] }) : json({ error: "Session unavailable" }, sessionStatus);
      return json({ active: [], history: [], pendingJoinRequests: [] });
    }));
    render(<App />);
    await waitFor(() => expect(document.documentElement.dataset.themeSource).toBe("personal"));
    await act(async () => bootstrapResolve(json({ debugToolsEnabled: false, branding: platform("nord") })));
    expect(document.documentElement.dataset.theme).toBe("opa-midnight-ember");
    sessionStatus = 503;
    fireEvent.focus(window);
    await screen.findByText("Connection interrupted. Your session is preserved; retrying automatically.");
    expect(document.documentElement.dataset.theme).toBe("opa-midnight-ember");
    sessionStatus = 401;
    fireEvent.focus(window);
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("nord"));
  });

  it("fetches the current server preference for same-account tab hints and ignores other identities", async () => {
    let currentUser = { ...user, themeId: "nord" as CurrentUserSummary["themeId"] };
    vi.stubGlobal("WebSocket", SocketMock);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/bootstrap") return json({ debugToolsEnabled: false, branding: platform("opa-light") });
      if (url === "/api/auth/session") return json({ user: currentUser, memberships: [], availableTeams: [] });
      return json({ active: [], history: [], pendingJoinRequests: [] });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("nord"));
    const count = fetchMock.mock.calls.filter(([url]) => url === "/api/auth/session").length;
    fireEvent(window, new StorageEvent("storage", { key: APPEARANCE_HINT_KEY, newValue: JSON.stringify({ userId: "different", themeId: "opa-midnight-ember" }) }));
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/auth/session")).toHaveLength(count);
    currentUser = { ...currentUser, themeId: "github-dark" };
    fireEvent(window, new StorageEvent("storage", { key: APPEARANCE_HINT_KEY, newValue: JSON.stringify({ userId: user.id, themeId: "opa-midnight-ember" }) }));
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("github-dark"));
  });
});
