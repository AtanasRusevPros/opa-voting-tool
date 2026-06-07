// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import path from "node:path";
import express from "express";
import { DECKS, resolveAvatarSelection, type HistoryEntry, type RoundState, type TeamStateResponse } from "@planning-poker/shared";
import type { DemoModeManager } from "../demoMode.js";
import type { DeploymentConfigManager } from "../deploymentConfig.js";
import type { EmailSender } from "../email.js";
import type { JiraCloudService } from "../jiraCloud.js";
import {
  adminConfigPatchSchema,
  adminSignInSchema,
  brandingUploadSchema,
  changePasswordSchema,
  createTeamSchema,
  historyPageQuerySchema,
  historySearchQuerySchema,
  historyCommentSchema,
  passwordResetRequestSchema,
  passwordSignInSchema,
  profileSchema,
  publicTrialRequestCodeSchema,
  publicTrialSignupSchema,
  requestAccessSchema,
  requestCodeSchema,
  userPreferencesSchema,
  jiraSiteSelectionSchema,
  revealSecretSchema,
  roundSchema,
  simulatorBootstrapSchema,
  simulatorLoginSchema,
  teamHistoryImportSchema,
  teamArchiveSchema,
  teamMemberEmailSchema,
  teamSettingsSchema,
  verifyCodeSchema,
  voteSchema
} from "./schemas.js";
import type { AuthedRequest } from "./middleware.js";
import { perfTracker } from "../perf.js";
import { Repository, RoundNotActiveError } from "../repository.js";

type TeamBroadcastMode = "full" | "round" | "vote";

type RegisterRoutesDeps = {
  app: express.Express;
  webDist: string;
  config: {
    branding: unknown;
    debugCodesEnabled: boolean;
    debugToolsEnabled: boolean;
    smtpHost?: string;
    smtpPort?: number;
    smtpFrom?: string;
    simulatorModeEnabled: boolean;
    demoModeEnabled: boolean;
    publicTrial: {
      enabled: boolean;
      mode: "disabled" | "open_signup" | "invite_only" | "operator_approved";
      maxTeamsPerWorkspace: number;
      maxUsersPerWorkspace: number;
      maxRevealedRoundsPerWorkspacePerMonth: number;
      maxSignupRequestsPerIpPerHour: number;
      maxCodeRequestsPerEmailPerDay: number;
      maxInvitesPerWorkspacePerDay: number;
      maxWorkspaceCreationsPerIpPerDay: number;
      maxLoginAttemptsPerEmailPerHour: number;
    };
    allowedDomainsPath: string;
  };
  shouldExposeDebugCodes: boolean;
  deploymentConfigManager: DeploymentConfigManager;
  demoModeManager: DemoModeManager;
  repository: Repository;
  emailSender: EmailSender;
  jiraCloudService: JiraCloudService;
  domainAllowed(email: string): boolean;
  attachSessionCookie(res: express.Response, token: string): void;
  clearSessionCookie(res: express.Response): void;
  extractBearerToken(header: string | undefined): string | undefined;
  requireUser(req: express.Request, res: express.Response, next: express.NextFunction): void;
  requireSuperAdmin(req: express.Request, res: express.Response): req is AuthedRequest;
  requireTeamAccess(req: express.Request, res: express.Response): boolean;
  requireTeamAdmin(req: express.Request, res: express.Response, options?: { allowArchived?: boolean }): boolean;
  requireWritableMember(req: express.Request, res: express.Response): boolean;
  requireSimulatorMode(req: express.Request, res: express.Response): boolean;
  buildTeamState(teamId: string, userId: string, options?: { includeHistory?: boolean }): TeamStateResponse;
  getEligibleRevealParticipantIds(teamId: string): string[];
  broadcastSoon(teamId: string): void;
  broadcastChooserSoon(): void;
  broadcastPlatformSettingsSoon(): void;
  broadcastTeamSoon(teamId: string, mode: TeamBroadcastMode): void;
  noteTeamRoundChanged(teamId: string): void;
  noteTeamRoundStarted(teamId: string, round: RoundState): void;
  noteTeamRoundRevealed(teamId: string, round: RoundState, latestHistoryEntry: HistoryEntry | null): void;
  noteTeamVoteChanged(teamId: string, roundId: string, userId: string, value: string): void;
};

type RateBucket = {
  count: number;
  resetAt: number;
};

const rateBuckets = new Map<string, RateBucket>();

function publicTrialRateLimit(key: string, limit: number, windowMs: number, now = Date.now()): { allowed: boolean; remaining: number; resetAt: number } {
  const existing = rateBuckets.get(key);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    rateBuckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: Math.max(0, limit - 1), resetAt };
  }
  if (existing.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }
  existing.count += 1;
  return { allowed: true, remaining: Math.max(0, limit - existing.count), resetAt: existing.resetAt };
}

function getClientRateIdentity(req: express.Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function writeRateLimitResponse(res: express.Response, resetAt: number): void {
  res.status(429).json({
    error: "Too many public trial requests. Please wait and try again.",
    retryAfterSeconds: Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))
  });
}

function renderJiraOauthResultPage(message: string): string {
  const escaped = JSON.stringify(message);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Jira Cloud connection</title>
  </head>
  <body>
    <p id="message"></p>
    <script>
      const message = ${escaped};
      document.getElementById("message").textContent = message;
      if (window.opener && window.location.origin) {
        window.opener.postMessage({ type: "jira-oauth-complete", message }, window.location.origin);
      }
      window.setTimeout(() => window.close(), 200);
    </script>
  </body>
</html>`;
}

function renderPublicTrialInfoPage(title: string, sections: Array<{ heading: string; body: string }>): string {
  const escapedTitle = title.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]!);
  const sectionMarkup = sections
    .map(
      (section) => `
        <section>
          <h2>${section.heading.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]!)}</h2>
          <p>${section.body.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]!)}</p>
        </section>`
    )
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapedTitle}</title>
    <style>
      body { max-width: 780px; margin: 0 auto; padding: 32px 20px; font-family: ui-sans-serif, system-ui, sans-serif; line-height: 1.6; color: #203047; background: #f7fbff; }
      a { color: #1e63c6; }
      h1 { line-height: 1.2; }
      section { margin-top: 24px; padding: 18px 20px; border: 1px solid #dbe8f7; border-radius: 16px; background: white; }
    </style>
  </head>
  <body>
    <p><a href="/">Back to OpaVoting</a></p>
    <h1>${escapedTitle}</h1>
    ${sectionMarkup}
  </body>
</html>`;
}

export function registerRoutes({
  app,
  webDist,
  config,
  shouldExposeDebugCodes,
  deploymentConfigManager,
  demoModeManager,
  repository,
  emailSender,
  jiraCloudService,
  domainAllowed,
  attachSessionCookie,
  clearSessionCookie,
  extractBearerToken,
  requireUser,
  requireSuperAdmin,
  requireTeamAccess,
  requireTeamAdmin,
  requireWritableMember,
  requireSimulatorMode,
  buildTeamState,
  getEligibleRevealParticipantIds,
  broadcastSoon,
  broadcastChooserSoon,
  broadcastPlatformSettingsSoon,
  broadcastTeamSoon,
  noteTeamRoundChanged,
  noteTeamRoundStarted,
  noteTeamRoundRevealed,
  noteTeamVoteChanged
}: RegisterRoutesDeps): void {
  app.get("/health", (_req, res) => {
    res.json({ ok: true, time: new Date().toISOString() });
  });

  app.get("/public-trial/terms", (_req, res) => {
    res
      .type("html")
      .send(
        renderPublicTrialInfoPage("OpaVoting Public Trial Terms", [
          {
            heading: "Limited Free Public Trial",
            body:
              "The hosted OpaVoting public trial is an alpha evaluation service for trying the app before deciding whether to self-host it. Access may be limited, paused, or discontinued if abuse, maintenance, or hosting constraints require it."
          },
          {
            heading: "Use Limits",
            body:
              "Trial workspaces are limited by deployment configuration, initially two teams, ten users, and a monthly revealed-round cap. Bigger or long-term usage should use self-hosting or a future hosted-service arrangement."
          },
          {
            heading: "No Confidential Data",
            body:
              "The operator intends to keep trial data private and not sell or misuse email addresses, but this is still a public alpha test service. Do not enter confidential, regulated, or sensitive production data."
          }
        ])
      );
  });

  app.get("/public-trial/privacy", (_req, res) => {
    res
      .type("html")
      .send(
        renderPublicTrialInfoPage("OpaVoting Public Trial Privacy Notice", [
          {
            heading: "Data Collected",
            body:
              "The app stores account email, display name, workspace/team membership, votes, comments, history, sessions, and operational timestamps needed to run the service."
          },
          {
            heading: "Operational Use",
            body:
              "Data is used to provide the public trial, prevent abuse, diagnose reliability issues, and decide whether the test server is useful enough to keep online."
          },
          {
            heading: "Email And Third Parties",
            body:
              "Email delivery may use a transactional SMTP provider. Public-trial emails are for access, reset, invite, cleanup, and important service notices."
          }
        ])
      );
  });

  app.get("/public-trial/acceptable-use", (_req, res) => {
    res
      .type("html")
      .send(
        renderPublicTrialInfoPage("OpaVoting Public Trial Acceptable Use", [
          {
            heading: "Respectful Evaluation",
            body:
              "Use the public trial to evaluate realtime voting and planning workflows. Do not harass others, attempt unauthorized access, spam invitations, overload the server, or bypass workspace limits."
          },
          {
            heading: "Abuse Controls",
            body:
              "The operator may rate-limit, block, remove, archive, or disable trial access to protect the service, other testers, and infrastructure."
          }
        ])
      );
  });

  app.get("/public-trial/export-cleanup", (_req, res) => {
    res
      .type("html")
      .send(
        renderPublicTrialInfoPage("OpaVoting Public Trial Export And Cleanup", [
          {
            heading: "Trial Lifecycle",
            body:
              "Inactive trial workspaces may be cleaned up after the configured inactivity window. The intended first policy is sixty inactive days with warning emails roughly fourteen and seven days before cleanup."
          },
          {
            heading: "Export",
            body:
              "Before cleanup or shutdown, the operator should provide a practical export path when feasible. Public-trial exports must avoid passwords, tokens, SMTP secrets, Jira secrets, and other operational credentials."
          }
        ])
      );
  });

  app.get("/api/bootstrap", (_req, res) => {
    res.json({
      decks: DECKS,
      branding: config.branding,
      debugCodesEnabled: config.debugCodesEnabled,
      debugToolsEnabled: config.debugToolsEnabled,
      smtpConfigured: Boolean(config.smtpHost && config.smtpPort && config.smtpFrom),
      simulatorModeEnabled: config.simulatorModeEnabled,
      demoModeEnabled: config.demoModeEnabled,
      publicTrial: config.publicTrial,
      allowedDomainsFile: path.relative(process.cwd(), config.allowedDomainsPath)
    });
  });

  app.post("/api/simulator/bootstrap", (req, res) => {
    if (!requireSimulatorMode(req, res)) {
      return;
    }
    repository.recordSimulatorHeartbeat();

    const payload = simulatorBootstrapSchema.safeParse(req.body);
    if (!payload.success) {
      res.status(400).json({ error: "Invalid simulator bootstrap payload" });
      return;
    }

    const ensuredUsers = payload.data.users.map((user) =>
      repository.ensureUser({
        email: user.email.toLowerCase(),
        displayName: user.displayName,
        avatarIconKey: user.avatarIconKey,
        avatarColorKey: user.avatarColorKey
      })
    );
    const owner = repository.ensureUser({
      email: "sim.owner@example-company.com",
      displayName: "Simulator Owner",
      avatarIconKey: "cog",
      avatarColorKey: "slate"
    });
    const usersByEmail = new Map(ensuredUsers.map((user) => [user.email, user]));
    const teams = repository.syncSimulatorTeams(
      owner.id,
      payload.data.teams.map((team) => ({
        name: team.name,
        memberUserIds: team.memberEmails.map((email) => {
          const user = usersByEmail.get(email.toLowerCase());
          if (!user) {
            throw new Error(`Missing seeded simulator user: ${email}`);
          }
          return user.id;
        })
      }))
    );

    res.json({
      ok: true,
      users: ensuredUsers,
      teams
    });
    broadcastChooserSoon();
    for (const team of teams) {
      broadcastSoon(team.id);
    }
  });

  app.get("/api/simulator/perf", (req, res) => {
    if (!requireSimulatorMode(req, res)) {
      return;
    }

    res.json(perfTracker.snapshot());
  });

  app.post("/api/simulator/perf/reset", (req, res) => {
    if (!requireSimulatorMode(req, res)) {
      return;
    }

    perfTracker.reset();
    res.json({ ok: true });
  });

  app.get("/api/bootstrap-simulator-state", (req, res) => {
    if (!requireSimulatorMode(req, res)) {
      return;
    }
    repository.recordSimulatorHeartbeat();

    const owner = repository.getUserByEmail("sim.owner@example-company.com");
    if (!owner) {
      res.status(404).json({ error: "Simulator owner not found" });
      return;
    }

    const teams = repository
      .getTeamsForUser(owner.id)
      .memberships.filter((team) => team.name.startsWith("Sim Team "))
      .map((team) => ({
        id: team.id,
        name: team.name,
        memberCount: team.memberCount
      }));

    res.json({
      ok: true,
      users: [],
      teams
    });
  });

  app.post("/api/simulator/login", (req, res) => {
    if (!requireSimulatorMode(req, res)) {
      return;
    }
    repository.recordSimulatorHeartbeat();

    const payload = simulatorLoginSchema.safeParse(req.body);
    if (!payload.success) {
      res.status(400).json({ error: "Invalid simulator login payload" });
      return;
    }

    const email = payload.data.email.toLowerCase();
    if (!email.startsWith("sim.bot.") && email !== "sim.owner@example-company.com") {
      res.status(403).json({ error: "Only seeded simulator users may use simulator login" });
      return;
    }

    const user = repository.getUserByEmail(email);
    if (!user) {
      res.status(404).json({ error: "Simulator user not found" });
      return;
    }

    const session = repository.createSessionForExistingUser(user.id);
    attachSessionCookie(res, session.sessionToken);
    res.json({
      user: {
        id: session.id,
        email: session.email,
        displayName: session.displayName,
        avatarIconKey: session.avatarIconKey,
        avatarColorKey: session.avatarColorKey
      },
      token: session.sessionToken
    });
  });

  app.post("/api/simulator/heartbeat", (req, res) => {
    if (!requireSimulatorMode(req, res)) {
      return;
    }
    repository.recordSimulatorHeartbeat();
    res.json({ ok: true });
  });

  app.post("/api/auth/request-code", async (req, res) => {
    const payload = requestCodeSchema.safeParse(req.body);
    if (!payload.success) {
      res.status(400).json({ error: "Invalid email" });
      return;
    }

    const email = payload.data.email.toLowerCase();
    if (!domainAllowed(email)) {
      res.status(403).json({ error: "Email domain is not allowed" });
      return;
    }

    const { code } = repository.requestLoginCode(email);
    const existingUser = repository.getUserByEmail(email);
    const delivery = await emailSender.sendLoginCode(email, code);
    res.json({
      ok: true,
      delivery: delivery.mode,
      debugCode: shouldExposeDebugCodes ? code : undefined,
      suggestedDisplayName: existingUser?.displayName,
      suggestedAvatarIconKey: existingUser?.avatarIconKey,
      suggestedAvatarColorKey: existingUser?.avatarColorKey
    });
  });

  app.post("/api/auth/request-password-reset", async (req, res) => {
    const payload = passwordResetRequestSchema.safeParse(req.body);
    if (!payload.success) {
      res.status(400).json({ error: "Invalid email" });
      return;
    }

    const email = payload.data.email.toLowerCase();
    if (!domainAllowed(email)) {
      res.status(403).json({ error: "Email domain is not allowed" });
      return;
    }

    const smtpConfigured = Boolean(config.smtpHost && config.smtpPort && config.smtpFrom);
    const existingUser = repository.getUserByEmail(email);
    if (!existingUser) {
      if (shouldExposeDebugCodes) {
        const { code } = repository.requestLoginCode(email);
        res.json({
          ok: true,
          delivery: "fallback-log",
          debugCode: code
        });
        return;
      }
      res.json({
        ok: true,
        delivery: smtpConfigured ? "smtp" : "manual-admin",
        debugCode: undefined
      });
      return;
    }

    if (!smtpConfigured && !shouldExposeDebugCodes) {
      res.json({
        ok: true,
        delivery: "manual-admin"
      });
      return;
    }

    const { code } = repository.requestLoginCode(email);
    const delivery = await emailSender.sendLoginCode(email, code);
    res.json({
      ok: true,
      delivery: delivery.mode,
      debugCode: shouldExposeDebugCodes ? code : undefined
    });
  });

  app.post("/api/auth/request-access", (req, res) => {
    const payload = requestAccessSchema.safeParse(req.body);
    if (!payload.success) {
      res.status(400).json({ error: "Invalid email" });
      return;
    }

    const email = payload.data.email.toLowerCase();
    if (!domainAllowed(email)) {
      res.status(403).json({ error: "Email domain is not allowed" });
      return;
    }

    try {
      repository.requestPlatformAccess(email);
      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.post("/api/auth/public-trial/request-code", async (req, res) => {
    if (!config.publicTrial.enabled || config.publicTrial.mode !== "open_signup") {
      res.status(403).json({ error: "Public trial signup is not enabled." });
      return;
    }

    const smtpConfigured = Boolean(config.smtpHost && config.smtpPort && config.smtpFrom);
    if (!smtpConfigured && !shouldExposeDebugCodes) {
      res.status(503).json({ error: "Public trial signup requires SMTP email delivery." });
      return;
    }

    const payload = publicTrialRequestCodeSchema.safeParse(req.body);
    if (!payload.success) {
      res.status(400).json({ error: "Invalid email" });
      return;
    }

    const email = payload.data.email.toLowerCase();
    const clientIdentity = getClientRateIdentity(req);
    const ipLimit = publicTrialRateLimit(
      `public-trial:signup-ip:${clientIdentity}`,
      config.publicTrial.maxSignupRequestsPerIpPerHour,
      60 * 60 * 1000
    );
    if (!ipLimit.allowed) {
      repository.recordPlatformAudit(
        "public_trial_rate_limited",
        "Public trial signup rate limit",
        `Public trial signup request-code rate limit hit for IP ${clientIdentity}.`
      );
      writeRateLimitResponse(res, ipLimit.resetAt);
      return;
    }
    const emailLimit = publicTrialRateLimit(
      `public-trial:code-email:${email}`,
      config.publicTrial.maxCodeRequestsPerEmailPerDay,
      24 * 60 * 60 * 1000
    );
    if (!emailLimit.allowed) {
      repository.recordPlatformAudit(
        "public_trial_rate_limited",
        "Public trial email-code rate limit",
        `Public trial email-code rate limit hit for ${email}.`
      );
      writeRateLimitResponse(res, emailLimit.resetAt);
      return;
    }

    const existingUser = repository.getUserByEmail(email);
    if (existingUser && repository.userHasPublicTrialWorkspace(existingUser.id)) {
      res.status(409).json({ error: "This email already belongs to a public trial workspace." });
      return;
    }

    const { code } = repository.requestLoginCode(email);
    const delivery = await emailSender.sendLoginCode(email, code);
    res.json({
      ok: true,
      delivery: delivery.mode,
      termsVersion: repository.getPublicTrialTermsVersion(),
      debugCode: shouldExposeDebugCodes ? code : undefined
    });
  });

  app.post("/api/auth/public-trial/signup", (req, res) => {
    if (!config.publicTrial.enabled || config.publicTrial.mode !== "open_signup") {
      res.status(403).json({ error: "Public trial signup is not enabled." });
      return;
    }

    const payload = publicTrialSignupSchema.safeParse(req.body);
    if (!payload.success) {
      res.status(400).json({ error: "Invalid public trial signup payload" });
      return;
    }

    const clientIdentity = getClientRateIdentity(req);
    const workspaceLimit = publicTrialRateLimit(
      `public-trial:workspace-ip:${clientIdentity}`,
      config.publicTrial.maxWorkspaceCreationsPerIpPerDay,
      24 * 60 * 60 * 1000
    );
    if (!workspaceLimit.allowed) {
      repository.recordPlatformAudit(
        "public_trial_rate_limited",
        "Public trial workspace creation rate limit",
        `Public trial workspace creation rate limit hit for IP ${clientIdentity}.`
      );
      writeRateLimitResponse(res, workspaceLimit.resetAt);
      return;
    }

    try {
      const result = repository.completePublicTrialSignup({
        email: payload.data.email.toLowerCase(),
        code: payload.data.code,
        displayName: payload.data.displayName,
        avatarIconKey: payload.data.avatarIconKey,
        avatarColorKey: payload.data.avatarColorKey,
        avatarKey: payload.data.avatarKey,
        password: payload.data.password,
        acceptedTermsVersion: payload.data.acceptedTermsVersion
      });
      if (!result) {
        res.status(401).json({ error: "Invalid or expired code, or password does not meet requirements" });
        return;
      }

      attachSessionCookie(res, result.user.sessionToken);
      res.status(201).json({
        user: {
          id: result.user.id,
          email: result.user.email,
          displayName: result.user.displayName,
          avatarIconKey: result.user.avatarIconKey,
          avatarColorKey: result.user.avatarColorKey,
          isSuperAdmin: result.user.isSuperAdmin,
          loginName: result.user.loginName,
          boardShortcutsEnabled: result.user.boardShortcutsEnabled,
          historyTimezonePopupEnabled: result.user.historyTimezonePopupEnabled,
          historyTimezoneKeys: result.user.historyTimezoneKeys ?? null
        },
        token: result.user.sessionToken,
        workspace: result.workspace,
        team: result.team,
        termsVersion: repository.getPublicTrialTermsVersion()
      });
      broadcastSoon(result.team.id);
      broadcastChooserSoon();
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.post("/api/auth/verify-code", (req, res) => {
    const payload = verifyCodeSchema.safeParse(req.body);
    if (!payload.success) {
      res.status(400).json({ error: "Invalid verification payload" });
      return;
    }

    const user = repository.verifyLoginCode(
      payload.data.email.toLowerCase(),
      payload.data.code,
      payload.data.displayName,
      payload.data.avatarIconKey,
      payload.data.avatarColorKey,
      payload.data.avatarKey,
      payload.data.password
    );

    if (!user) {
      res.status(401).json({ error: "Invalid or expired code, or password does not meet requirements" });
      return;
    }

    attachSessionCookie(res, user.sessionToken);
    res.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarIconKey: user.avatarIconKey,
        avatarColorKey: user.avatarColorKey,
        isSuperAdmin: user.isSuperAdmin,
        loginName: user.loginName,
        boardShortcutsEnabled: user.boardShortcutsEnabled,
        historyTimezonePopupEnabled: user.historyTimezonePopupEnabled,
        historyTimezoneKeys: user.historyTimezoneKeys ?? null
      },
      token: user.sessionToken
    });
  });

  app.post("/api/auth/signin-password", (req, res) => {
    const payload = passwordSignInSchema.safeParse(req.body);
    if (!payload.success) {
      res.status(400).json({ error: "Invalid sign-in payload" });
      return;
    }

    const email = payload.data.email.toLowerCase();
    const existingUser = repository.getUserByEmail(email);
    if (existingUser && repository.userHasPublicTrialWorkspace(existingUser.id)) {
      const loginLimit = publicTrialRateLimit(
        `public-trial:login-email:${email}`,
        config.publicTrial.maxLoginAttemptsPerEmailPerHour,
        60 * 60 * 1000
      );
      if (!loginLimit.allowed) {
        repository.recordPlatformAudit("public_trial_rate_limited", "Public trial login rate limit", `Public trial login rate limit hit for ${email}.`);
        writeRateLimitResponse(res, loginLimit.resetAt);
        return;
      }
    }

    const user = repository.verifyPasswordLogin(email, payload.data.password);
    if (!user) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    attachSessionCookie(res, user.sessionToken);
    res.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarIconKey: user.avatarIconKey,
        avatarColorKey: user.avatarColorKey,
        isSuperAdmin: user.isSuperAdmin,
        loginName: user.loginName,
        boardShortcutsEnabled: user.boardShortcutsEnabled,
        historyTimezonePopupEnabled: user.historyTimezonePopupEnabled,
        historyTimezoneKeys: user.historyTimezoneKeys ?? null
      },
      token: user.sessionToken
    });
  });

  app.post("/api/auth/signin-admin", (req, res) => {
    const payload = adminSignInSchema.safeParse(req.body);
    if (!payload.success) {
      res.status(400).json({ error: "Invalid super-admin sign-in payload" });
      return;
    }

    const user = repository.verifySuperAdminLogin(payload.data.username, payload.data.password);
    if (!user) {
      res.status(401).json({ error: "Invalid admin username or password" });
      return;
    }

    attachSessionCookie(res, user.sessionToken);
    res.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarIconKey: user.avatarIconKey,
        avatarColorKey: user.avatarColorKey,
        isSuperAdmin: user.isSuperAdmin,
        loginName: user.loginName,
        boardShortcutsEnabled: user.boardShortcutsEnabled,
        historyTimezonePopupEnabled: user.historyTimezonePopupEnabled,
        historyTimezoneKeys: user.historyTimezoneKeys ?? null
      },
      token: user.sessionToken
    });
  });

  app.post("/api/auth/signout", (req, res) => {
    const token = req.cookies.session_token || extractBearerToken(req.headers.authorization);
    repository.deleteSession(token);
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  app.post("/api/auth/change-password", requireUser, (req, res) => {
    const payload = changePasswordSchema.safeParse(req.body);
    if (!payload.success) {
      res.status(400).json({ error: "Invalid password change request" });
      return;
    }

    if (payload.data.newPassword !== payload.data.confirmPassword) {
      res.status(400).json({ error: "New password and confirmation must match." });
      return;
    }

    try {
      repository.changeUserPassword((req as AuthedRequest).user.id, payload.data.currentPassword, payload.data.newPassword);
      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.get("/api/auth/session", requireUser, (req, res) => {
    const authedReq = req as AuthedRequest;
    const teams = repository.getTeamsForUser(authedReq.user.id);
    res.json({
      user: {
        id: authedReq.user.id,
        email: authedReq.user.email,
        displayName: authedReq.user.displayName,
        avatarIconKey: authedReq.user.avatarIconKey,
        avatarColorKey: authedReq.user.avatarColorKey,
        isSuperAdmin: authedReq.user.isSuperAdmin,
        loginName: authedReq.user.loginName,
        boardShortcutsEnabled: authedReq.user.boardShortcutsEnabled,
        historyTimezonePopupEnabled: authedReq.user.historyTimezonePopupEnabled,
        historyTimezoneKeys: authedReq.user.historyTimezoneKeys ?? null
      },
      token: authedReq.user.sessionToken,
      ...teams
    });
  });

  app.get("/api/admin/config", requireUser, (req, res) => {
    if (!requireSuperAdmin(req, res)) {
      return;
    }
    res.json(deploymentConfigManager.getRedactedConfig());
  });

  app.post("/api/admin/jira/oauth/start", requireUser, (req, res) => {
    if (!requireSuperAdmin(req, res)) {
      return;
    }
    try {
      res.json({
        authorizationUrl: jiraCloudService.startAuthorization((req as AuthedRequest).user.id, deploymentConfigManager.getConfig())
      });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.get("/api/admin/jira/oauth/callback", async (req, res) => {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";

    if (!code || !state) {
      res.status(400).send(renderJiraOauthResultPage("Jira Cloud authorization did not return a usable code or state."));
      return;
    }

    try {
      await jiraCloudService.handleCallback(deploymentConfigManager.getConfig(), code, state);
      res.send(renderJiraOauthResultPage("Jira Cloud authorization completed. You can return to the app."));
    } catch (error) {
      res.status(400).send(renderJiraOauthResultPage((error as Error).message));
    }
  });

  app.post("/api/admin/jira/oauth/select-site", requireUser, async (req, res) => {
    if (!requireSuperAdmin(req, res)) {
      return;
    }

    const payload = jiraSiteSelectionSchema.safeParse(req.body);
    if (!payload.success) {
      res.status(400).json({ error: "Invalid Jira Cloud site selection." });
      return;
    }

    try {
      await jiraCloudService.selectPendingSite((req as AuthedRequest).user.id, deploymentConfigManager.getConfig(), payload.data.cloudId);
      res.json(deploymentConfigManager.getRedactedConfig());
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.post("/api/admin/jira/disconnect", requireUser, (req, res) => {
    if (!requireSuperAdmin(req, res)) {
      return;
    }
    jiraCloudService.disconnect();
    res.json(deploymentConfigManager.getRedactedConfig());
  });

  app.get("/api/admin/access-requests", requireUser, (req, res) => {
    if (!requireSuperAdmin(req, res)) {
      return;
    }
    res.json({
      requests: repository.getPlatformAccessRequests()
    });
  });

  app.get("/api/admin/people", requireUser, (req, res) => {
    if (!requireSuperAdmin(req, res)) {
      return;
    }
    const rawOffset = Number.parseInt(String(req.query.offset ?? "0"), 10);
    const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0;
    const sort =
      req.query.sort === "alpha" || req.query.sort === "alpha-desc" || req.query.sort === "oldest"
        ? req.query.sort
        : "recent";
    const query = typeof req.query.q === "string" ? req.query.q : "";
    const peoplePage = repository.getPlatformUsersPage({
      offset,
      limit: 30,
      query,
      sort
    });
    res.json({
      requests: repository.getPlatformAccessRequests(),
      users: peoplePage.users,
      nextOffset: peoplePage.nextOffset,
      sort,
      query: query.trim()
    });
  });

  app.post("/api/admin/access-requests/:requestId/admit", requireUser, async (req, res) => {
    if (!requireSuperAdmin(req, res)) {
      return;
    }

    try {
      const result = repository.admitPlatformAccessRequest((req as AuthedRequest).user.id, String(req.params.requestId));
      const delivery = await emailSender.sendPlatformAccessAdmission(result.user.email, result.temporaryPassword);
      res.json({
        user: result.user,
        invitedNewUser: true,
        invitationDelivery: delivery.mode === "smtp" ? "smtp" : "manual-share",
        temporaryPassword: result.temporaryPassword,
        secureSaveReminder: "Save this generated password somewhere secure before closing this message, then send it to the admitted person through your preferred channel."
      });
    } catch (error) {
      res.status((error as Error).message === "Access request not found" ? 404 : 400).json({ error: (error as Error).message });
    }
  });

  app.post("/api/admin/access-requests/:requestId/deny", requireUser, (req, res) => {
    if (!requireSuperAdmin(req, res)) {
      return;
    }

    try {
      repository.denyPlatformAccessRequest((req as AuthedRequest).user.id, String(req.params.requestId));
      res.json({ ok: true });
    } catch (error) {
      res.status((error as Error).message === "Access request not found" ? 404 : 400).json({ error: (error as Error).message });
    }
  });

  app.post("/api/admin/users/:userId/reset-password", requireUser, async (req, res) => {
    if (!requireSuperAdmin(req, res)) {
      return;
    }

    try {
      const result = repository.resetPlatformUserPassword((req as AuthedRequest).user.id, String(req.params.userId));
      const delivery = await emailSender.sendPasswordResetPassword(result.user.email, result.temporaryPassword);
      res.json({
        user: result.user,
        passwordDelivery: delivery.mode,
        temporaryPassword: delivery.mode === "smtp" ? null : result.temporaryPassword,
        secureSaveReminder: delivery.mode === "smtp" ? null : "Save this password somewhere secure before closing."
      });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.patch("/api/admin/config", requireUser, (req, res) => {
    if (!requireSuperAdmin(req, res)) {
      return;
    }

    const payload = adminConfigPatchSchema.safeParse(req.body);
    if (!payload.success) {
      res.status(400).json({ error: "Invalid admin config payload" });
      return;
    }

    try {
      const result = deploymentConfigManager.updateConfig({
        app: payload.data.app,
        admin: payload.data.admin,
        smtp: payload.data.smtp,
        jira: payload.data.jira,
        branding: payload.data.branding
          ? {
              backgroundOpacity: payload.data.branding.backgroundOpacity,
              footerCreatorText: payload.data.branding.footerCreatorText,
              footerCompanyText: payload.data.branding.footerCompanyText,
              palette: payload.data.branding.palette
            }
          : undefined,
        demo: payload.data.demo,
        publicTrial: payload.data.publicTrial
      });
      if (payload.data.admin) {
        repository.syncSuperAdminAccount();
      }
      demoModeManager.sync();
      res.json(result);
      if (payload.data.branding) {
        broadcastPlatformSettingsSoon();
      }
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.post("/api/admin/config/reveal-secret", requireUser, (req, res) => {
    if (!requireSuperAdmin(req, res)) {
      return;
    }

    const payload = revealSecretSchema.safeParse(req.body);
    if (!payload.success) {
      res.status(400).json({ error: "Invalid secret field." });
      return;
    }

    try {
      res.json({ value: deploymentConfigManager.revealSecret(payload.data.field) });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.post("/api/admin/branding/upload", requireUser, (req, res) => {
    if (!requireSuperAdmin(req, res)) {
      return;
    }

    const payload = brandingUploadSchema.safeParse(req.body);
    if (!payload.success) {
      res.status(400).json({ error: "Invalid branding upload payload" });
      return;
    }

    try {
      const result = deploymentConfigManager.storeBrandingAsset(payload.data);
      res.json(result);
      broadcastPlatformSettingsSoon();
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.get("/api/admin/database/export", requireUser, (req, res) => {
    if (!requireSuperAdmin(req, res)) {
      return;
    }
    const snapshot = repository.exportWholeDatabaseSnapshot();
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${snapshot.fileName}"`);
    res.send(snapshot.bytes);
  });

  app.post("/api/admin/database/import", requireUser, express.raw({ type: "application/octet-stream", limit: "128mb" }), (req, res) => {
    if (!requireSuperAdmin(req, res)) {
      return;
    }
    const bytes =
      Buffer.isBuffer(req.body) ? req.body : req.body instanceof Uint8Array ? Buffer.from(req.body) : Buffer.from([]);
    if (bytes.length === 0) {
      res.status(400).json({ error: "A SQLite snapshot file is required." });
      return;
    }
    try {
      const superAdmin = repository.importWholeDatabaseSnapshot(bytes);
      const session = repository.createSessionForExistingUser(superAdmin.id);
      attachSessionCookie(res, session.sessionToken);
      res.json({ ok: true, token: session.sessionToken });
      broadcastChooserSoon();
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.get("/api/auth/notifications", requireUser, (req, res) => {
    const teamId = typeof req.query.teamId === "string" ? req.query.teamId : null;
    const includeSeenHistory = req.query.includeHistory !== "0";
    const includeActionHistory = req.query.includeAdminHistory !== "0";
    res.json(
      repository.getNotificationFeed((req as AuthedRequest).user.id, teamId, {
        includeSeenHistory,
        includeActionHistory
      })
    );
  });

  app.post("/api/auth/notifications/seen", requireUser, (req, res) => {
    repository.markNotificationsSeen((req as AuthedRequest).user.id);
    const teamId = typeof req.query.teamId === "string" ? req.query.teamId : null;
    const includeSeenHistory = req.query.includeHistory !== "0";
    const includeActionHistory = req.query.includeAdminHistory !== "0";
    res.json(
      repository.getNotificationFeed((req as AuthedRequest).user.id, teamId, {
        includeSeenHistory,
        includeActionHistory
      })
    );
  });

  app.get("/api/auth/action-history", requireUser, (req, res) => {
    const teamId = typeof req.query.teamId === "string" ? req.query.teamId : null;
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : null;
    const page = repository.getActionHistoryPage((req as AuthedRequest).user.id, teamId, cursor);
    res.json(page ?? { items: [], nextCursor: null });
  });

  app.patch("/api/auth/profile", requireUser, (req, res) => {
    const payload = profileSchema.safeParse(req.body);
    if (!payload.success) {
      res.status(400).json({ error: "Invalid profile data" });
      return;
    }
    const userId = (req as AuthedRequest).user.id;
    const avatarSelection = resolveAvatarSelection(payload.data);
    const user = repository.updateProfile(userId, payload.data.displayName, avatarSelection.avatarIconKey, avatarSelection.avatarColorKey);
    const teams = repository.getTeamsForUser(userId);
    res.json({ user });
    for (const membership of teams.memberships) {
      broadcastSoon(membership.id);
    }
    broadcastChooserSoon();
  });

  app.patch("/api/auth/preferences", requireUser, (req, res) => {
    const payload = userPreferencesSchema.safeParse(req.body);
    if (!payload.success) {
      res.status(400).json({ error: "Invalid preference data" });
      return;
    }
    const userId = (req as AuthedRequest).user.id;
    let user;
    try {
      user = repository.updateUserPreferences(userId, {
        teamId: payload.data.teamId,
        boardShortcutsEnabled: payload.data.boardShortcutsEnabled,
        historyTimezonePopupEnabled: payload.data.historyTimezonePopupEnabled,
        historyTimezoneKeys: payload.data.historyTimezoneKeys
      });
    } catch (error) {
      res.status((error as Error).message === "Forbidden" ? 403 : 400).json({ error: (error as Error).message });
      return;
    }
    res.json({ user });
    if (payload.data.teamId) {
      broadcastSoon(payload.data.teamId);
    } else {
      const teams = repository.getTeamsForUser(userId);
      for (const membership of teams.memberships) {
        broadcastSoon(membership.id);
      }
    }
    broadcastChooserSoon();
  });

  app.post("/api/teams", requireUser, (req, res) => {
    const payload = createTeamSchema.safeParse(req.body);
    if (!payload.success) {
      res.status(400).json({ error: "Invalid team name" });
      return;
    }

    try {
      const team = repository.createTeam((req as AuthedRequest).user.id, payload.data.name);
      res.status(201).json({ team });
      broadcastSoon(team.id);
      broadcastChooserSoon();
    } catch (error) {
      res.status(409).json({ error: error instanceof Error ? error.message : "A team with this name already exists." });
    }
  });

  app.post("/api/teams/:teamId/join", requireUser, (req, res) => {
    const teamId = String(req.params.teamId);
    try {
      const request = repository.requestTeamJoin((req as AuthedRequest).user.id, teamId);
      res.json({ request });
    } catch (error) {
      res.status((error as Error).message === "Team not found" ? 404 : 400).json({ error: (error as Error).message });
      return;
    }
    broadcastChooserSoon();
  });

  app.post("/api/teams/:teamId/leave", requireUser, (req, res) => {
    const teamId = String(req.params.teamId);
    const userId = (req as AuthedRequest).user.id;
    try {
      repository.leaveTeam(userId, teamId);
      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
      return;
    }
    broadcastSoon(teamId);
    broadcastChooserSoon();
  });

  app.get("/api/teams/:teamId/state", requireUser, (req, res) => {
    const startMs = performance.now();
    if (!requireTeamAccess(req, res)) {
      perfTracker.recordDuration("http.teamState", startMs);
      return;
    }
    try {
      const includeHistory = req.query.history !== "0";
      const reason = typeof req.query.reason === "string" && req.query.reason.trim() ? req.query.reason.trim() : "default";
      perfTracker.incrementCounter(`http.teamState.reason.${reason}`);
      const state = buildTeamState(String(req.params.teamId), (req as AuthedRequest).user.id, { includeHistory });
      res.json(state);
    } catch (error) {
      res.status((error as Error).message === "Forbidden" ? 403 : 404).json({ error: (error as Error).message === "Forbidden" ? "You are no longer a member of this team" : "Team not found" });
    } finally {
      perfTracker.recordDuration("http.teamState", startMs);
    }
  });

  app.get("/api/teams/:teamId/history", requireUser, (req, res) => {
    if (!requireTeamAccess(req, res)) {
      return;
    }
    const payload = historyPageQuerySchema.safeParse(req.query);
    if (!payload.success) {
      res.status(400).json({ error: "Invalid history page query." });
      return;
    }
    try {
      const cursor =
        payload.data.cursorCompletedAt && payload.data.cursorId
          ? {
              completedAt: payload.data.cursorCompletedAt,
              id: payload.data.cursorId
            }
          : null;
      res.json({
        history: repository.getHistoryPage(String(req.params.teamId), {
          cursor,
          limit: payload.data.limit
        })
      });
    } catch (error) {
      res.status((error as Error).message === "Forbidden" ? 403 : 404).json({ error: (error as Error).message === "Forbidden" ? "You are no longer a member of this team" : "Team not found" });
    }
  });

  app.get("/api/teams/:teamId/history/search", requireUser, (req, res) => {
    if (!requireTeamAccess(req, res)) {
      return;
    }
    const payload = historySearchQuerySchema.safeParse(req.query);
    if (!payload.success) {
      res.status(400).json({ error: "Invalid history search query." });
      return;
    }
    try {
      const cursor =
        payload.data.cursorCompletedAt && payload.data.cursorId
          ? {
              completedAt: payload.data.cursorCompletedAt,
              id: payload.data.cursorId
            }
          : null;
      res.json(
        repository.searchHistory(
          String(req.params.teamId),
          {
            dateFrom: payload.data.dateFrom ?? null,
            dateTo: payload.data.dateTo ?? null,
            titleQuery: payload.data.titleQuery ?? "",
            exactTitleMatch: payload.data.exactTitleMatch === "1" || payload.data.exactTitleMatch === "true",
            commentQuery: payload.data.commentQuery ?? "",
            personQuery: payload.data.personQuery ?? ""
          },
          {
            cursor,
            limit: payload.data.limit
          }
        )
      );
    } catch (error) {
      res.status((error as Error).message === "Forbidden" ? 403 : 404).json({ error: (error as Error).message === "Forbidden" ? "You are no longer a member of this team" : "Team not found" });
    }
  });

  app.post("/api/teams/:teamId/history/:historyEntryId/comments", requireUser, (req, res) => {
    if (!requireWritableMember(req, res)) {
      return;
    }

    const payload = historyCommentSchema.safeParse(req.body);
    if (!payload.success) {
      res.status(400).json({ error: "Comment must be between 1 and 4000 characters." });
      return;
    }

    try {
      const teamId = String(req.params.teamId);
      const historyEntryId = String(req.params.historyEntryId);
      repository.addHistoryComment(teamId, historyEntryId, (req as AuthedRequest).user.id, payload.data.body);
      const historyEntry = repository.getHistoryEntry(teamId, historyEntryId);
      if (!historyEntry) {
        res.status(404).json({ error: "History entry not found" });
        return;
      }
      res.status(201).json({ historyEntry });
      broadcastSoon(teamId);
    } catch (error) {
      res.status((error as Error).message === "History entry not found" ? 404 : 400).json({ error: (error as Error).message });
    }
  });

  app.patch("/api/teams/:teamId/history/:historyEntryId/comments/:commentId", requireUser, (req, res) => {
    if (!requireWritableMember(req, res)) {
      return;
    }

    const payload = historyCommentSchema.safeParse(req.body);
    if (!payload.success) {
      res.status(400).json({ error: "Comment must be between 1 and 4000 characters." });
      return;
    }

    try {
      const teamId = String(req.params.teamId);
      const historyEntryId = String(req.params.historyEntryId);
      repository.updateHistoryComment(teamId, historyEntryId, String(req.params.commentId), (req as AuthedRequest).user.id, payload.data.body);
      const historyEntry = repository.getHistoryEntry(teamId, historyEntryId);
      if (!historyEntry) {
        res.status(404).json({ error: "History entry not found" });
        return;
      }
      res.json({ historyEntry });
      broadcastSoon(teamId);
    } catch (error) {
      const message = (error as Error).message;
      res.status(message === "You can only edit or delete your own comments." ? 403 : message === "History entry not found" ? 404 : 400).json({ error: message });
    }
  });

  app.delete("/api/teams/:teamId/history/:historyEntryId/comments/:commentId", requireUser, (req, res) => {
    if (!requireWritableMember(req, res)) {
      return;
    }

    try {
      const teamId = String(req.params.teamId);
      const historyEntryId = String(req.params.historyEntryId);
      repository.deleteHistoryComment(teamId, historyEntryId, String(req.params.commentId), (req as AuthedRequest).user.id);
      const historyEntry = repository.getHistoryEntry(teamId, historyEntryId);
      if (!historyEntry) {
        res.status(404).json({ error: "History entry not found" });
        return;
      }
      res.json({ historyEntry });
      broadcastSoon(teamId);
    } catch (error) {
      const message = (error as Error).message;
      res.status(message === "You can only edit or delete your own comments." ? 403 : message === "History entry not found" ? 404 : 400).json({ error: message });
    }
  });

  app.get("/api/teams/:teamId/directory", requireUser, (req, res) => {
    if (!requireTeamAccess(req, res)) {
      return;
    }
    try {
      const state = buildTeamState(String(req.params.teamId), (req as AuthedRequest).user.id);
      res.json({
        team: state.team,
        members: state.teamMembers,
        activeParticipantIds: state.activeParticipants.map((member) => member.id),
        currentUserId: state.currentUser.id,
        currentUserRole: state.currentUserRole,
        currentUserIsSuperAdmin: state.currentUser.isSuperAdmin,
        pendingIssues: state.pendingIssues,
        pendingJoinRequests:
          state.currentUser.isSuperAdmin || state.currentUserRole === "team_admin"
            ? repository.getPendingJoinRequestsForTeam(String(req.params.teamId))
            : []
      });
    } catch (error) {
      res.status((error as Error).message === "Forbidden" ? 403 : 404).json({ error: (error as Error).message === "Forbidden" ? "You are no longer a member of this team" : "Team not found" });
    }
  });

  app.get("/api/teams/:teamId/member-candidates", requireUser, (req, res) => {
    if (!requireTeamAdmin(req, res)) {
      return;
    }
    const query = typeof req.query.q === "string" ? req.query.q : "";
    res.json({
      users: repository.searchTeamMemberCandidates(String(req.params.teamId), query)
    });
  });

  app.get("/api/teams/:teamId/export", requireUser, (req, res) => {
    if (!requireTeamAdmin(req, res)) {
      return;
    }
    try {
      const includeComments = req.query.includeComments !== "0";
      const packagePayload = repository.exportTeamHistory(String(req.params.teamId), includeComments);
      res.json({
        fileName: `${packagePayload.sourceTeam.slug}-history-export.json`,
        package: packagePayload
      });
    } catch (error) {
      res.status((error as Error).message === "Team not found" ? 404 : 400).json({ error: (error as Error).message });
    }
  });

  app.post("/api/teams/:teamId/import", requireUser, (req, res) => {
    if (!requireTeamAdmin(req, res)) {
      return;
    }
    const payload = teamHistoryImportSchema.safeParse(req.body);
    if (!payload.success) {
      res.status(400).json({ error: "Invalid team history package." });
      return;
    }
    try {
      const result = repository.importTeamHistory((req as AuthedRequest).user.id, {
        package: payload.data.package,
        targetTeamId: String(req.params.teamId)
      });
      res.json(result);
      broadcastSoon(result.team.id);
      broadcastChooserSoon();
    } catch (error) {
      res.status((error as Error).message === "Team not found" ? 404 : 400).json({ error: (error as Error).message });
    }
  });

  app.post("/api/teams/import", requireUser, (req, res) => {
    const payload = teamHistoryImportSchema.safeParse(req.body);
    if (!payload.success) {
      res.status(400).json({ error: "Invalid team history package." });
      return;
    }
    try {
      const result = repository.importTeamHistory((req as AuthedRequest).user.id, {
        package: payload.data.package,
        teamName: payload.data.teamName
      });
      res.status(201).json(result);
      broadcastSoon(result.team.id);
      broadcastChooserSoon();
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.patch("/api/teams/:teamId/settings", requireUser, (req, res) => {
    const startMs = performance.now();
    if (!requireTeamAdmin(req, res)) {
      perfTracker.recordDuration("http.teamSettings", startMs);
      return;
    }
    const payload = teamSettingsSchema.safeParse(req.body);
    if (!payload.success) {
      res.status(400).json({ error: "Invalid team settings" });
      return;
    }

    const teamId = String(req.params.teamId);
    const team = repository.updateTeamSettings(teamId, payload.data);
    let revealedAfterSettingsChange: RoundState | null = null;
    const activeRound = repository.getCurrentRound(teamId);
    if (activeRound?.status === "active" && activeRound.quorumBlocked) {
      if (payload.data.minimumVotePercentEnabled === false) {
        revealedAfterSettingsChange = repository.revealRound(activeRound.id, { eligibleParticipantIds: getEligibleRevealParticipantIds(teamId) });
      } else if (payload.data.minimumVotePercent !== undefined || payload.data.minimumVotePercentEnabled === true) {
        revealedAfterSettingsChange = repository.revealRoundIfPreviouslyQuorumBlocked(activeRound.id, {
          eligibleParticipantIds: getEligibleRevealParticipantIds(teamId)
        });
      }
    }
    res.json({ team });
    if (revealedAfterSettingsChange?.status === "revealed") {
      noteTeamRoundRevealed(team.id, revealedAfterSettingsChange, repository.getLatestHistoryEntry(team.id));
    } else {
      broadcastSoon(team.id);
    }
    perfTracker.recordDuration("http.teamSettings", startMs);
  });

  app.post("/api/teams/:teamId/jira/import", requireUser, async (req, res) => {
    if (!requireTeamAdmin(req, res)) {
      return;
    }

    try {
      const team = repository.getTeam(String(req.params.teamId));
      if (!team) {
        res.status(404).json({ error: "Team not found" });
        return;
      }
      const imported = await jiraCloudService.importIssues(deploymentConfigManager.getConfig(), {
        projectKey: team.jiraProjectKey ?? "",
        jql: team.jiraJql
      });
      const pendingIssues = repository.importPendingJiraIssues(team.id, imported);
      res.json({ importedCount: imported.length, pendingIssues });
      broadcastSoon(team.id);
      broadcastChooserSoon();
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.post("/api/teams/:teamId/pending-issues/:issueId/load", requireUser, (req, res) => {
    if (!requireWritableMember(req, res)) {
      return;
    }

    try {
      const round = repository.loadPendingIssueIntoRound(String(req.params.teamId), String(req.params.issueId));
      res.status(201).json({ round });
      noteTeamRoundStarted(String(req.params.teamId), round);
    } catch (error) {
      res.status((error as Error).message === "Pending issue not found." ? 404 : 400).json({ error: (error as Error).message });
    }
  });

  app.post("/api/teams/:teamId/join-requests/:requestId/admit", requireUser, (req, res) => {
    if (!requireTeamAdmin(req, res)) {
      return;
    }
    try {
      const admittedUser = repository.approveJoinRequest((req as AuthedRequest).user.id, String(req.params.teamId), String(req.params.requestId));
      res.json({ user: admittedUser, notifications: repository.getNotificationFeed((req as AuthedRequest).user.id) });
      broadcastSoon(String(req.params.teamId));
      broadcastChooserSoon();
    } catch (error) {
      res.status((error as Error).message === "Join request not found" ? 404 : 400).json({ error: (error as Error).message });
    }
  });

  app.post("/api/teams/:teamId/join-requests/:requestId/deny", requireUser, (req, res) => {
    if (!requireTeamAdmin(req, res)) {
      return;
    }
    try {
      const deniedUser = repository.denyJoinRequest((req as AuthedRequest).user.id, String(req.params.teamId), String(req.params.requestId));
      res.json({ user: deniedUser, notifications: repository.getNotificationFeed((req as AuthedRequest).user.id) });
      broadcastChooserSoon();
    } catch (error) {
      res.status((error as Error).message === "Join request not found" ? 404 : 400).json({ error: (error as Error).message });
    }
  });

  app.post("/api/teams/:teamId/members", requireUser, async (req, res) => {
    if (!requireTeamAdmin(req, res)) {
      return;
    }
    const teamId = String(req.params.teamId);
    const payload = teamMemberEmailSchema.safeParse(req.body);
    if (!payload.success) {
      res.status(400).json({ error: "Invalid team member email" });
      return;
    }
    const email = payload.data.email.toLowerCase();
    const workspace = repository.getWorkspaceForTeam(teamId);
    const isPublicTrialTeam = workspace?.kind === "public_trial";
    if (!isPublicTrialTeam && !domainAllowed(email)) {
      res.status(403).json({ error: "Email domain is not allowed" });
      return;
    }
    const smtpConfigured = Boolean(config.smtpHost && config.smtpPort && config.smtpFrom);
    if (isPublicTrialTeam && !smtpConfigured) {
      res.status(503).json({ error: "Public trial collaborator invites require SMTP email delivery." });
      return;
    }
    if (isPublicTrialTeam && workspace) {
      const inviteLimit = publicTrialRateLimit(
        `public-trial:invite-workspace:${workspace.id}`,
        config.publicTrial.maxInvitesPerWorkspacePerDay,
        24 * 60 * 60 * 1000
      );
      if (!inviteLimit.allowed) {
        repository.recordPlatformAudit(
          "public_trial_rate_limited",
          "Public trial invite rate limit",
          `Public trial invite rate limit hit for workspace ${workspace.id} (${workspace.name}).`,
          (req as AuthedRequest).user.id
        );
        writeRateLimitResponse(res, inviteLimit.resetAt);
        return;
      }
    }
    try {
      const result = repository.addTeamMemberByEmail((req as AuthedRequest).user.id, teamId, email);
      if (result.invitedNewUser) {
        const delivery = await emailSender.sendTeamInvitation(email, repository.getTeam(teamId)!.name, result.temporaryPassword!);
        res.status(201).json({
          user: result.user,
          invitedNewUser: true,
          invitationDelivery: delivery.mode === "smtp" ? "smtp" : "manual-share",
          temporaryPassword: isPublicTrialTeam ? null : result.temporaryPassword,
          secureSaveReminder: isPublicTrialTeam
            ? null
            : "Save this generated password somewhere secure before closing this message, then send it to the invited person through your preferred channel."
        });
      } else {
        res.status(201).json({
          user: result.user,
          invitedNewUser: false,
          invitationDelivery: "existing-user",
          temporaryPassword: null,
          secureSaveReminder: null
        });
      }
      broadcastSoon(teamId);
      broadcastChooserSoon();
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.post("/api/teams/:teamId/members/:userId/reset-password", requireUser, async (req, res) => {
    if (!requireTeamAdmin(req, res)) {
      return;
    }

    try {
      const result = repository.resetTeamMemberPassword((req as AuthedRequest).user.id, String(req.params.teamId), String(req.params.userId));
      const delivery = await emailSender.sendPasswordResetPassword(result.user.email, result.temporaryPassword);
      res.json({
        user: result.user,
        passwordDelivery: delivery.mode,
        temporaryPassword: delivery.mode === "smtp" ? null : result.temporaryPassword,
        secureSaveReminder: delivery.mode === "smtp" ? null : "Save this password somewhere secure before closing."
      });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.post("/api/teams/:teamId/members/:memberUserId/promote", requireUser, (req, res) => {
    if (!requireTeamAdmin(req, res)) {
      return;
    }
    try {
      repository.promoteTeamMember((req as AuthedRequest).user.id, String(req.params.teamId), String(req.params.memberUserId));
      res.json({ ok: true });
      broadcastSoon(String(req.params.teamId));
      broadcastChooserSoon();
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.post("/api/teams/:teamId/members/:memberUserId/demote", requireUser, (req, res) => {
    try {
      repository.demoteTeamAdmin((req as AuthedRequest).user.id, String(req.params.teamId), String(req.params.memberUserId));
      res.json({ ok: true });
      broadcastSoon(String(req.params.teamId));
      broadcastChooserSoon();
    } catch (error) {
      res.status((error as Error).message === "Only the super-admin can perform this action." ? 403 : 400).json({ error: (error as Error).message });
    }
  });

  app.post("/api/teams/:teamId/members/:memberUserId/remove", requireUser, async (req, res) => {
    try {
      const teamId = String(req.params.teamId);
      const memberUserId = String(req.params.memberUserId);
      const member = repository.getUser(memberUserId);
      const team = repository.getTeam(teamId);
      repository.removeTeamMember((req as AuthedRequest).user.id, teamId, memberUserId);
      if (member && team) {
        await emailSender.sendTeamRemovalNotification(member.email, team.name);
      }
      res.json({ ok: true });
      broadcastSoon(teamId);
      broadcastChooserSoon();
    } catch (error) {
      res.status((error as Error).message === "Only the super-admin can perform this action." ? 403 : 400).json({ error: (error as Error).message });
    }
  });

  app.post("/api/teams/:teamId/archive", requireUser, (req, res) => {
    if (!requireTeamAdmin(req, res, { allowArchived: true })) {
      return;
    }
    const payload = teamArchiveSchema.safeParse(req.body);
    if (!payload.success) {
      res.status(400).json({ error: "Invalid archive payload" });
      return;
    }
    try {
      const team = repository.setTeamArchived((req as AuthedRequest).user.id, String(req.params.teamId), payload.data.archived);
      res.json({ team });
      broadcastSoon(team.id);
      broadcastChooserSoon();
    } catch (error) {
      res.status((error as Error).message === "Only the super-admin can perform this action." ? 403 : 400).json({ error: (error as Error).message });
    }
  });

  app.post("/api/teams/:teamId/rounds", requireUser, (req, res) => {
    const startMs = performance.now();
    if (!requireWritableMember(req, res)) {
      perfTracker.recordDuration("http.createRound", startMs);
      return;
    }
    const payload = roundSchema.safeParse(req.body);
    if (!payload.success) {
      res.status(400).json({ error: "Title is required" });
      return;
    }

    const teamId = String(req.params.teamId);
    const round = repository.createRound(teamId, payload.data.title);
    res.status(201).json({ round });
    noteTeamRoundStarted(teamId, round);
    perfTracker.recordDuration("http.createRound", startMs);
  });

  app.post("/api/teams/:teamId/history/:historyEntryId/vote-again", requireUser, (_req, res) => {
    const startMs = performance.now();
    if (!requireWritableMember(_req, res)) {
      perfTracker.recordDuration("http.voteAgain", startMs);
      return;
    }
    const teamId = String(_req.params.teamId);
    const historyId = String(_req.params.historyEntryId);
    const state = buildTeamState(teamId, (_req as AuthedRequest).user.id);
    const entry = state.history.find((item) => item.id === historyId);
    if (!entry) {
      res.status(404).json({ error: "History entry not found" });
      return;
    }

    const round = repository.createRound(teamId, entry.title, entry.id);
    res.status(201).json({ round });
    noteTeamRoundStarted(teamId, round);
    perfTracker.recordDuration("http.voteAgain", startMs);
  });

  app.post("/api/teams/:teamId/rounds/:roundId/vote", requireUser, (req, res) => {
    const startMs = performance.now();
    if (!requireWritableMember(req, res)) {
      perfTracker.recordDuration("http.castVote", startMs);
      return;
    }
    const payload = voteSchema.safeParse(req.body);
    if (!payload.success) {
      res.status(400).json({ error: "Invalid vote" });
      return;
    }
    try {
      const result = repository.submitVote(String(req.params.roundId), (req as AuthedRequest).user.id, payload.data.value);
      res.json({ ok: true });
      noteTeamVoteChanged(result.teamId, result.roundId, (req as AuthedRequest).user.id, payload.data.value);
      const autoRevealedRound = repository.revealRoundIfPreviouslyQuorumBlocked(result.roundId, {
        eligibleParticipantIds: getEligibleRevealParticipantIds(result.teamId)
      });
      if (autoRevealedRound?.status === "revealed") {
        noteTeamRoundRevealed(result.teamId, autoRevealedRound, repository.getLatestHistoryEntry(result.teamId));
      } else if (autoRevealedRound?.status === "active") {
        noteTeamRoundStarted(result.teamId, autoRevealedRound);
      }
    } catch (error) {
      if (error instanceof RoundNotActiveError) {
        perfTracker.incrementCounter("http.castVote.roundNotActiveConflicts");
        res.status(409).json({ error: error.message });
        return;
      }
      res.status(404).json({ error: "Round not found" });
    } finally {
      perfTracker.recordDuration("http.castVote", startMs);
    }
  });

  app.post("/api/teams/:teamId/rounds/:roundId/reveal", requireUser, (req, res) => {
    const startMs = performance.now();
    if (!requireWritableMember(req, res)) {
      perfTracker.recordDuration("http.revealRound", startMs);
      return;
    }
    try {
      const teamId = String(req.params.teamId);
      const round = repository.revealRound(String(req.params.roundId), { eligibleParticipantIds: getEligibleRevealParticipantIds(teamId) });
      res.json({ round });
      if (round.status === "revealed") {
        noteTeamRoundRevealed(teamId, round, repository.getLatestHistoryEntry(teamId));
      } else {
        noteTeamRoundStarted(teamId, round);
      }
    } catch {
      res.status(404).json({ error: "Round not found" });
    } finally {
      perfTracker.recordDuration("http.revealRound", startMs);
    }
  });

  app.post("/api/teams/:teamId/rounds/:roundId/cancel", requireUser, (req, res) => {
    const startMs = performance.now();
    if (!requireWritableMember(req, res)) {
      perfTracker.recordDuration("http.cancelRound", startMs);
      return;
    }
    const teamId = String(req.params.teamId);
    try {
      repository.cancelRound(String(req.params.roundId));
      res.json({ ok: true });
      noteTeamRoundChanged(teamId);
    } catch (error) {
      if (error instanceof RoundNotActiveError) {
        res.status(409).json({ error: error.message });
        return;
      }
      res.status(404).json({ error: "Round not found" });
    } finally {
      perfTracker.recordDuration("http.cancelRound", startMs);
    }
  });

  app.post("/api/teams/:teamId/rounds/:roundId/vote-again", requireUser, (req, res) => {
    const startMs = performance.now();
    if (!requireWritableMember(req, res)) {
      perfTracker.recordDuration("http.voteAgainActiveRound", startMs);
      return;
    }
    const teamId = String(req.params.teamId);
    try {
      const round = repository.restartActiveRound(String(req.params.roundId));
      res.status(201).json({ round });
      noteTeamRoundStarted(teamId, round);
    } catch (error) {
      if (error instanceof RoundNotActiveError) {
        res.status(409).json({ error: error.message });
        return;
      }
      res.status(404).json({ error: "Round not found" });
    } finally {
      perfTracker.recordDuration("http.voteAgainActiveRound", startMs);
    }
  });

  app.use(express.static(webDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) {
      next();
      return;
    }
    res.sendFile(path.join(webDist, "index.html"));
  });
}
