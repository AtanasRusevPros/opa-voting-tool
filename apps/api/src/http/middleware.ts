// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import express from "express";
import { Repository } from "../repository.js";
import type { SessionUser } from "../types.js";

export type AuthedRequest = express.Request & { user: SessionUser };

type MiddlewareDeps = {
  allowedDomains: string[];
  config: {
    demoModeEnabled: boolean;
    simulatorModeEnabled: boolean;
    simulatorSharedSecret: string;
    sessionTtlDays: number;
  };
  repository: Repository;
};

export function createHttpMiddleware(deps: MiddlewareDeps) {
  const { allowedDomains, config, repository } = deps;

  function domainAllowed(email: string): boolean {
    const domain = email.split("@")[1]?.toLowerCase();
    return Boolean(domain && allowedDomains.includes(domain));
  }

  function extractBearerToken(header: string | undefined): string | undefined {
    if (!header?.startsWith("Bearer ")) {
      return undefined;
    }
    return header.slice("Bearer ".length);
  }

  function requireUser(req: express.Request, res: express.Response, next: express.NextFunction) {
    const token = req.cookies.session_token || extractBearerToken(req.headers.authorization);
    const user = repository.getSessionUser(token);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    (req as AuthedRequest).user = user;
    next();
  }

  function requireSuperAdmin(req: express.Request, res: express.Response): req is AuthedRequest {
    const authedReq = req as AuthedRequest;
    if (!authedReq.user?.isSuperAdmin) {
      res.status(403).json({ error: "Only the super-admin can perform this action." });
      return false;
    }
    return true;
  }

  function attachSessionCookie(res: express.Response, token: string) {
    res.cookie("session_token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: config.sessionTtlDays * 24 * 60 * 60 * 1000
    });
  }

  function clearSessionCookie(res: express.Response) {
    res.clearCookie("session_token");
  }

  function requireMembership(req: express.Request, res: express.Response): boolean {
    const authedReq = req as AuthedRequest;
    const teamId = String(req.params.teamId);
    if (!repository.isTeamMember(authedReq.user.id, teamId)) {
      res.status(403).json({ error: "You are no longer a member of this team" });
      return false;
    }

    return true;
  }

  function requireTeamAccess(req: express.Request, res: express.Response): boolean {
    const authedReq = req as AuthedRequest;
    const teamId = String(req.params.teamId);
    const team = repository.getTeam(teamId);
    if (!team) {
      res.status(404).json({ error: "Team not found" });
      return false;
    }
    if (team.demo) {
      if (!config.demoModeEnabled || !authedReq.user.isSuperAdmin) {
        res.status(403).json({ error: "Demo teams are only available to the super-admin while demo mode is enabled." });
        return false;
      }
      return true;
    }
    const role = repository.getTeamUserRole(authedReq.user.id, teamId);
    if (role === "none" && !authedReq.user.isSuperAdmin) {
      res.status(403).json({ error: "You are no longer a member of this team" });
      return false;
    }
    return true;
  }

  function requireWritableMember(req: express.Request, res: express.Response): boolean {
    const authedReq = req as AuthedRequest;
    const teamId = String(req.params.teamId);
    const team = repository.getTeam(teamId);
    if (!team) {
      res.status(404).json({ error: "Team not found" });
      return false;
    }
    if (team.demo) {
      if (!config.demoModeEnabled || !authedReq.user.isSuperAdmin) {
        res.status(403).json({ error: "Demo teams are only available to the super-admin while demo mode is enabled." });
        return false;
      }
      return true;
    }
    if (team.archived) {
      res.status(403).json({ error: "Archived teams are read-only until a team admin or the super-admin unarchives them." });
      return false;
    }
    if (!repository.isTeamMember(authedReq.user.id, teamId)) {
      res.status(403).json({ error: "Only team members can modify this team." });
      return false;
    }
    return true;
  }

  function requireTeamAdmin(req: express.Request, res: express.Response, options?: { allowArchived?: boolean }): boolean {
    const authedReq = req as AuthedRequest;
    const teamId = String(req.params.teamId);
    const team = repository.getTeam(teamId);
    if (!team) {
      res.status(404).json({ error: "Team not found" });
      return false;
    }
    if (team.demo) {
      if (!config.demoModeEnabled || !authedReq.user.isSuperAdmin) {
        res.status(403).json({ error: "Demo teams are only available to the super-admin while demo mode is enabled." });
        return false;
      }
      return true;
    }
    if (team.archived && !options?.allowArchived) {
      res.status(403).json({ error: "Archived teams are read-only until a team admin or the super-admin unarchives them." });
      return false;
    }
    if (!authedReq.user.isSuperAdmin && repository.getTeamUserRole(authedReq.user.id, teamId) !== "team_admin") {
      res.status(403).json({ error: "Only team admins can manage this team." });
      return false;
    }
    return true;
  }

  function requireSimulatorMode(req: express.Request, res: express.Response): boolean {
    if (!config.simulatorModeEnabled) {
      res.status(404).json({ error: "Simulator mode is disabled" });
      return false;
    }

    if (req.headers["x-simulator-secret"] !== config.simulatorSharedSecret) {
      res.status(403).json({ error: "Invalid simulator secret" });
      return false;
    }

    return true;
  }

  return {
    attachSessionCookie,
    clearSessionCookie,
    domainAllowed,
    extractBearerToken,
    requireMembership,
    requireSimulatorMode,
    requireSuperAdmin,
    requireTeamAccess,
    requireTeamAdmin,
    requireUser,
    requireWritableMember
  };
}
