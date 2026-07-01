// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import http from "node:http";
import { monitorEventLoopDelay } from "node:perf_hooks";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseCookieHeader } from "cookie";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { WebSocketServer, type WebSocket } from "ws";
import {
  DECKS,
  resolveAvatarSelection,
  type DeckKey,
  type HistoryEntry,
  type RoundState,
  type TeamMemberSummary,
  type TeamRoundUpdatePayload,
  type TeamRoundVoteUpdatePayload,
  type TeamStateResponse,
  type TeamUserRole,
  type UserSummary
} from "@planning-poker/shared";
import {
  computeTeamBroadcastBackpressureMs,
  computeTeamVoteDeltaFlushMs,
  selectNextReadyTeamBroadcast,
  type TeamBroadcastCandidate
} from "./broadcastScheduler.js";
import { loadAllowedDomains } from "./config.js";
import { DemoModeManager } from "./demoMode.js";
import { DeploymentConfigManager } from "./deploymentConfig.js";
import { createEmailSender } from "./email.js";
import { createHttpMiddleware, type AuthedRequest } from "./http/middleware.js";
import { registerRoutes } from "./http/registerRoutes.js";
import { JiraCloudService } from "./jiraCloud.js";
import { createRoomEngineManager } from "./roomEngine.js";
import { perfTracker } from "./perf.js";
import { Repository, RoundNotActiveError } from "./repository.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webDist = path.resolve(__dirname, "../../web/dist");
const webPublic = path.resolve(__dirname, "../../web/public");

const deploymentConfigManager = new DeploymentConfigManager();
const config = deploymentConfigManager.getConfig();
const allowedDomains = loadAllowedDomains(config.allowedDomainsPath);
const repository = new Repository(config);
const roomEngineManager = createRoomEngineManager(repository);
const emailSender = createEmailSender(() => config);
const jiraCloudService = new JiraCloudService(deploymentConfigManager);
const shouldExposeDebugCodes = config.debugCodesEnabled;
const TEAM_BROADCAST_COALESCE_MS = 25;
const CHOOSER_BROADCAST_COALESCE_MS = 25;
const PRESENCE_BROADCAST_COALESCE_MS = 10;
const TEAM_BROADCAST_STARVATION_MS = 120;
const eventLoopDelayMonitor = monitorEventLoopDelay({ resolution: 20 });

eventLoopDelayMonitor.enable();
const {
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
} = createHttpMiddleware({ allowedDomains, config, repository });

function scheduleUnrefTimeout(callback: () => void, delayMs: number) {
  const timer = setTimeout(callback, delayMs);
  timer.unref?.();
  return timer;
}

function scheduleUnrefImmediate(callback: () => void) {
  const immediate = setImmediate(callback);
  immediate.unref?.();
  return immediate;
}

type TeamBroadcastMode = "full" | "round" | "vote";

type PendingTeamBroadcast = {
  timer: ReturnType<typeof setTimeout>;
  queuedAt: number;
  mode: TeamBroadcastMode;
};

type ReadyTeamBroadcast = {
  queuedAt: number;
  mode: TeamBroadcastMode;
};

type BackpressuredTeamBroadcast = {
  timer: ReturnType<typeof setTimeout>;
  queuedAt: number;
  mode: TeamBroadcastMode;
};

function getTeamBroadcastMetricName(mode: TeamBroadcastMode, suffix: string) {
  return mode === "full" ? `broadcast.team.update.${suffix}` : `broadcast.team.${mode}.${suffix}`;
}

function mergeTeamBroadcastMode(left: TeamBroadcastMode, right: TeamBroadcastMode): TeamBroadcastMode {
  if (left === "full" || right === "full") {
    return "full";
  }
  if (left === "round" || right === "round") {
    return "round";
  }
  return "vote";
}

function broadcastSoon(teamId: string) {
  broadcastTeamSoon(teamId, "full");
}

function broadcastTeamSoon(teamId: string, mode: TeamBroadcastMode) {
  if (mode === "full") {
    roomEngineManager.markDirty(teamId);
  }
  const pending = pendingTeamBroadcasts.get(teamId);
  if (pending) {
    if (pending.mode === "full" || pending.mode === mode) {
      perfTracker.incrementCounter(getTeamBroadcastMetricName(mode, "coalesced"));
      return;
    }

    pending.mode = mergeTeamBroadcastMode(pending.mode, mode);
    perfTracker.incrementCounter(getTeamBroadcastMetricName(pending.mode, "promoted"));
    return;
  }

  const ready = readyTeamBroadcasts.get(teamId);
  if (ready) {
    if (ready.mode === "full" || ready.mode === mode) {
      perfTracker.incrementCounter(getTeamBroadcastMetricName(mode, "coalesced"));
      return;
    }

    ready.mode = mergeTeamBroadcastMode(ready.mode, mode);
    perfTracker.incrementCounter(getTeamBroadcastMetricName(ready.mode, "promoted"));
    return;
  }

  const backpressured = pendingBackpressuredTeamBroadcasts.get(teamId);
  if (backpressured) {
    if (backpressured.mode === "full" || backpressured.mode === mode) {
      perfTracker.incrementCounter(getTeamBroadcastMetricName(mode, "coalesced"));
      return;
    }

    backpressured.mode = mergeTeamBroadcastMode(backpressured.mode, mode);
    perfTracker.incrementCounter(getTeamBroadcastMetricName(backpressured.mode, "promoted"));
    return;
  }

  if (activeTeamBroadcastTeamId === teamId) {
    const queuedAt = performance.now();
    const followUp = postDrainTeamBroadcasts.get(teamId);
    postDrainTeamBroadcasts.set(teamId, {
      queuedAt: Math.min(followUp?.queuedAt ?? queuedAt, queuedAt),
      mode: followUp?.mode === "full" || mode === "full" ? "full" : "round"
    });
    perfTracker.incrementCounter(getTeamBroadcastMetricName(mode, "coalesced"));
    updateTeamBroadcastQueueGauges();
    return;
  }

  perfTracker.incrementCounter(getTeamBroadcastMetricName(mode, "queued"));
  const queuedAt = performance.now();
  const timer = scheduleUnrefTimeout(() => {
    const queued = pendingTeamBroadcasts.get(teamId);
    pendingTeamBroadcasts.delete(teamId);
    if (queued) {
      queueReadyTeamBroadcast(teamId, queued);
    }
    updateTeamBroadcastQueueGauges();
  }, TEAM_BROADCAST_COALESCE_MS);
  pendingTeamBroadcasts.set(teamId, { timer, queuedAt, mode });
  updateTeamBroadcastQueueGauges();
}

function hasQueuedTeamBroadcast(teamId: string) {
  return (
    pendingTeamBroadcasts.has(teamId) ||
    readyTeamBroadcasts.has(teamId) ||
    pendingBackpressuredTeamBroadcasts.has(teamId) ||
    postDrainTeamBroadcasts.has(teamId)
  );
}

function clearPendingVoteDeltaFlush(teamId: string) {
  const timer = pendingVoteDeltaFlushes.get(teamId);
  if (!timer) {
    return;
  }
  clearTimeout(timer);
  pendingVoteDeltaFlushes.delete(teamId);
}

function scheduleTeamVoteDeltaFlush(teamId: string) {
  if (pendingVoteDeltaFlushes.has(teamId) || hasQueuedTeamBroadcast(teamId)) {
    return;
  }

  const delayMs = computeTeamVoteDeltaFlushMs({
    recipients: teamClients.get(teamId)?.size ?? 0,
    activeRoomCount: teamClients.size,
    readyDepth: readyTeamBroadcastOrder.length + pendingBackpressuredTeamBroadcasts.size
  });

  const timer = scheduleUnrefTimeout(() => {
    pendingVoteDeltaFlushes.delete(teamId);
    queueReadyTeamBroadcast(teamId, {
      queuedAt: performance.now(),
      mode: "vote"
    });
    updateTeamBroadcastQueueGauges();
  }, delayMs);

  pendingVoteDeltaFlushes.set(teamId, timer);
  perfTracker.incrementCounter("broadcast.team.vote.flushQueued");
  perfTracker.setGauge("broadcast.team.vote.flushPendingCount", pendingVoteDeltaFlushes.size);
}

function noteTeamVoteChanged(teamId: string, roundId: string, userId: string, value: string) {
  roomEngineManager.noteVoteChange(teamId, roundId, userId, value);
  scheduleTeamVoteDeltaFlush(teamId);
}

function noteTeamRoundChanged(teamId: string) {
  clearPendingVoteDeltaFlush(teamId);
  roomEngineManager.noteRoundChanged(teamId);
  broadcastTeamSoon(teamId, "round");
}

function noteTeamRoundStarted(teamId: string, round: RoundState) {
  clearPendingVoteDeltaFlush(teamId);
  roomEngineManager.noteRoundStarted(teamId, round);
  broadcastTeamSoon(teamId, "round");
}

function noteTeamRoundRevealed(teamId: string, round: RoundState, latestHistoryEntry: HistoryEntry | null) {
  clearPendingVoteDeltaFlush(teamId);
  roomEngineManager.noteRoundRevealed(teamId, round, latestHistoryEntry);
  broadcastTeamSoon(teamId, "round");
}

function revealBlockedRoundIfCurrentParticipantsSatisfyRule(teamId: string) {
  const activeRound = repository.getCurrentRound(teamId);
  if (!activeRound || activeRound.status !== "active" || !activeRound.quorumBlocked) {
    return;
  }
  const revealedRound = repository.revealRoundIfPreviouslyQuorumBlocked(activeRound.id, {
    eligibleParticipantIds: getEligibleRevealParticipantIds(teamId)
  });
  if (revealedRound?.status === "revealed") {
    noteTeamRoundRevealed(teamId, revealedRound, repository.getLatestHistoryEntry(teamId));
  } else if (revealedRound?.status === "active") {
    noteTeamRoundStarted(teamId, revealedRound);
  }
}

function getTeamBroadcastBackpressureMs(teamId: string, mode: TeamBroadcastMode) {
  return computeTeamBroadcastBackpressureMs({
    mode,
    recipients: teamClients.get(teamId)?.size ?? 0,
    activeRoomCount: teamClients.size,
    readyDepth: readyTeamBroadcastOrder.length + pendingBackpressuredTeamBroadcasts.size
  });
}

function queueReadyTeamBroadcast(teamId: string, broadcast: ReadyTeamBroadcast) {
  const delayMs = getTeamBroadcastBackpressureMs(teamId, broadcast.mode);
  if (delayMs <= 0) {
    enqueueReadyTeamBroadcast(teamId, broadcast);
    return;
  }

  const existing = pendingBackpressuredTeamBroadcasts.get(teamId);
  if (existing) {
    existing.queuedAt = Math.min(existing.queuedAt, broadcast.queuedAt);
    existing.mode = mergeTeamBroadcastMode(existing.mode, broadcast.mode);
    perfTracker.incrementCounter(getTeamBroadcastMetricName(broadcast.mode, "coalesced"));
    return;
  }

  perfTracker.incrementCounter(getTeamBroadcastMetricName(broadcast.mode, "backpressured"));
  const timer = scheduleUnrefTimeout(() => {
    const backpressured = pendingBackpressuredTeamBroadcasts.get(teamId);
    pendingBackpressuredTeamBroadcasts.delete(teamId);
    if (backpressured) {
      enqueueReadyTeamBroadcast(teamId, backpressured);
    }
    updateTeamBroadcastQueueGauges();
  }, delayMs);

  pendingBackpressuredTeamBroadcasts.set(teamId, {
    timer,
    queuedAt: broadcast.queuedAt,
    mode: broadcast.mode
  });
  updateTeamBroadcastQueueGauges();
}

function enqueueReadyTeamBroadcast(teamId: string, broadcast: ReadyTeamBroadcast) {
  const existing = readyTeamBroadcasts.get(teamId);
  if (existing) {
    readyTeamBroadcasts.set(teamId, {
      queuedAt: Math.min(existing.queuedAt, broadcast.queuedAt),
      mode: mergeTeamBroadcastMode(existing.mode, broadcast.mode)
    });
    perfTracker.incrementCounter(getTeamBroadcastMetricName(broadcast.mode, "coalesced"));
  } else {
    readyTeamBroadcasts.set(teamId, broadcast);
    readyTeamBroadcastOrder.push(teamId);
    perfTracker.incrementCounter(getTeamBroadcastMetricName(broadcast.mode, "ready"));
  }

  updateTeamBroadcastQueueGauges();
  scheduleTeamBroadcastDrain();
}

function updateTeamBroadcastQueueGauges() {
  perfTracker.setGauge("broadcast.team.pendingQueueDepth", pendingTeamBroadcasts.size);
  perfTracker.setGauge("broadcast.team.backpressureQueueDepth", pendingBackpressuredTeamBroadcasts.size);
  perfTracker.setGauge("broadcast.team.readyQueueDepth", readyTeamBroadcastOrder.length);
  perfTracker.setGauge("broadcast.team.postDrainQueueDepth", postDrainTeamBroadcasts.size);
  perfTracker.setGauge("broadcast.team.vote.flushPendingCount", pendingVoteDeltaFlushes.size);
}

function scheduleTeamBroadcastDrain() {
  if (teamBroadcastDrainScheduled || teamBroadcastDrainRunning || readyTeamBroadcastOrder.length === 0) {
    return;
  }

  teamBroadcastDrainScheduled = true;
  teamBroadcastDrainHandle = scheduleUnrefImmediate(() => {
    teamBroadcastDrainHandle = null;
    teamBroadcastDrainScheduled = false;
    drainReadyTeamBroadcasts();
  });
}

function drainReadyTeamBroadcasts() {
  if (teamBroadcastDrainRunning) {
    return;
  }

  const nextTeamId = selectNextReadyTeamBroadcastTeamId();
  if (!nextTeamId) {
    updateTeamBroadcastQueueGauges();
    return;
  }

  const ready = readyTeamBroadcasts.get(nextTeamId);
  readyTeamBroadcasts.delete(nextTeamId);
  updateTeamBroadcastQueueGauges();
  if (!ready) {
    scheduleTeamBroadcastDrain();
    return;
  }

  teamBroadcastDrainRunning = true;
  activeTeamBroadcastTeamId = nextTeamId;
  perfTracker.recordDuration(getTeamBroadcastMetricName(ready.mode, "queueWait"), ready.queuedAt);
  perfTracker.incrementCounter(getTeamBroadcastMetricName(ready.mode, "drained"));
  try {
    broadcastTeam(nextTeamId, ready.mode);
  } finally {
    activeTeamBroadcastTeamId = null;
    teamBroadcastDrainRunning = false;
    const followUp = postDrainTeamBroadcasts.get(nextTeamId);
    if (followUp) {
      postDrainTeamBroadcasts.delete(nextTeamId);
      queueReadyTeamBroadcast(nextTeamId, followUp);
    }
    if (readyTeamBroadcastOrder.length > 0) {
      scheduleTeamBroadcastDrain();
    } else {
      updateTeamBroadcastQueueGauges();
    }
  }
}

function selectNextReadyTeamBroadcastTeamId() {
  if (readyTeamBroadcastOrder.length === 0) {
    return null;
  }

  const now = performance.now();
  const candidates: TeamBroadcastCandidate[] = [];
  for (const teamId of readyTeamBroadcastOrder) {
    const ready = readyTeamBroadcasts.get(teamId);
    if (!ready) {
      continue;
    }
    candidates.push({
      teamId,
      mode: ready.mode,
      queuedAt: ready.queuedAt,
      recipients: Math.max(1, teamClients.get(teamId)?.size ?? 0)
    });
  }

  const nextTeamId = selectNextReadyTeamBroadcast(candidates, {
    nowMs: now,
    starvationMs: TEAM_BROADCAST_STARVATION_MS
  });
  if (!nextTeamId) {
    return null;
  }

  const selectedIndex = readyTeamBroadcastOrder.indexOf(nextTeamId);
  if (selectedIndex === -1) {
    return null;
  }

  const [removedTeamId] = readyTeamBroadcastOrder.splice(selectedIndex, 1);
  const ready = removedTeamId ? readyTeamBroadcasts.get(removedTeamId) : null;
  if (ready && now - ready.queuedAt >= TEAM_BROADCAST_STARVATION_MS) {
    perfTracker.incrementCounter(getTeamBroadcastMetricName(ready.mode, "starvationBypass"));
  }
  return removedTeamId ?? null;
}

function broadcastChooserSoon() {
  if (pendingChooserBroadcast) {
    perfTracker.incrementCounter("broadcast.chooser.coalesced");
    return;
  }

  perfTracker.incrementCounter("broadcast.chooser.queued");
  const queuedAt = performance.now();
  pendingChooserBroadcast = scheduleUnrefTimeout(() => {
    if (pendingChooserBroadcastQueuedAt !== null) {
      perfTracker.recordDuration("broadcast.chooser.queueWait", pendingChooserBroadcastQueuedAt);
    }
    pendingChooserBroadcast = null;
    pendingChooserBroadcastQueuedAt = null;
    broadcastChooser();
  }, CHOOSER_BROADCAST_COALESCE_MS);
  pendingChooserBroadcastQueuedAt = queuedAt;
}

function broadcastPlatformSettingsSoon() {
  if (pendingPlatformSettingsBroadcast) {
    perfTracker.incrementCounter("broadcast.platformSettings.coalesced");
    return;
  }

  perfTracker.incrementCounter("broadcast.platformSettings.queued");
  pendingPlatformSettingsBroadcast = scheduleUnrefTimeout(() => {
    pendingPlatformSettingsBroadcast = null;
    broadcastPlatformSettings();
  }, CHOOSER_BROADCAST_COALESCE_MS);
}

function broadcastPresenceSoon(teamId: string) {
  if (pendingPresenceBroadcasts.has(teamId)) {
    perfTracker.incrementCounter("broadcast.team.presence.coalesced");
    return;
  }

  perfTracker.incrementCounter("broadcast.team.presence.queued");
  const queuedAt = performance.now();
  const timer = scheduleUnrefTimeout(() => {
    const queued = pendingPresenceBroadcasts.get(teamId);
    pendingPresenceBroadcasts.delete(teamId);
    if (queued) {
      perfTracker.recordDuration("broadcast.team.presence.queueWait", queued.queuedAt);
    }
    broadcastPresence(teamId);
  }, PRESENCE_BROADCAST_COALESCE_MS);
  pendingPresenceBroadcasts.set(teamId, { timer, queuedAt });
}

function updateSocketMetrics() {
  const activeTeamSockets = [...teamClients.values()].reduce((sum, sockets) => sum + sockets.size, 0);
  perfTracker.setGauge("ws.activeTeamSockets", activeTeamSockets);
  perfTracker.setGauge("ws.activeChooserSockets", chooserClients.size);
  perfTracker.setGauge("ws.activeSockets", activeTeamSockets + chooserClients.size);
}

function getActiveParticipantIds(teamId: string): Set<string> {
  const sockets = teamClients.get(teamId);
  const activeUserIds = new Set<string>();

  if (sockets) {
    for (const socket of sockets) {
      if (socket.readyState !== 1) {
        continue;
      }

      const session = socketSessions.get(socket);
      if (session?.userId) {
        activeUserIds.add(session.userId);
      }
    }
  }

  for (const userId of demoModeManager?.getSyntheticActiveParticipantIds(teamId) ?? []) {
    activeUserIds.add(userId);
  }

  return activeUserIds;
}

function buildActiveParticipants(teamId: string, teamMembers?: UserSummary[]): UserSummary[] {
  const activeUserIds = getActiveParticipantIds(teamId);
  const members = teamMembers ?? repository.getTeamMembers(teamId);
  const matchedMembers = members.filter((member) => activeUserIds.has(member.id));
  if (matchedMembers.length === activeUserIds.size) {
    return matchedMembers.filter((member) => !repository.isSuperAdmin(member.id));
  }

  const knownMemberIds = new Set(matchedMembers.map((member) => member.id));
  const missingUserIds = [...activeUserIds].filter((userId) => !knownMemberIds.has(userId));
  if (missingUserIds.length === 0) {
    return matchedMembers.filter((member) => !repository.isSuperAdmin(member.id));
  }

  return [...matchedMembers, ...repository.getUsersByIds(missingUserIds)].filter((member) => !repository.isSuperAdmin(member.id));
}

function getEligibleRevealParticipantIds(teamId: string): string[] {
  return buildActiveParticipants(teamId).map((participant) => participant.id);
}

function withActiveParticipants(state: TeamStateResponse, teamId: string): TeamStateResponse {
  return {
    ...state,
    activeParticipants: buildActiveParticipants(teamId, state.teamMembers)
  };
}

function buildTeamState(teamId: string, userId: string, options?: { includeHistory?: boolean }): TeamStateResponse {
  const context = roomEngineManager.getViewerContext(teamId, userId);
  const snapshot = roomEngineManager.getSnapshotRef(teamId);
  const serverTime = new Date().toISOString();
  const state = withActiveParticipants(
    {
      team: snapshot.team,
      memberships: context.memberships,
      availableTeams: context.availableTeams,
      teamMembers: snapshot.teamMembers,
      activeParticipants: [],
      activeRound: personalizeRoundForBroadcast(snapshot.activeRound, snapshot.revealedOrHiddenVoteValuesByUserId, userId),
      pendingIssues: snapshot.pendingIssues,
      history: options?.includeHistory === false ? [] : snapshot.history,
      currentUser: context.currentUser,
      currentUserRole: context.currentUserRole,
      liveSync: snapshot.liveSync,
      serverTime
    },
    teamId
  );
  return {
    ...state,
    liveSync: snapshot.liveSync,
    serverTime
  };
}

type TeamBroadcastSnapshot = {
  team: TeamStateResponse["team"];
  teamMembers: TeamStateResponse["teamMembers"];
  activeParticipants: TeamStateResponse["activeParticipants"];
  pendingIssues: TeamStateResponse["pendingIssues"];
  history: TeamStateResponse["history"];
  activeRound: RoundState | null;
  revealedOrHiddenVoteValuesByUserId: Map<string, string>;
  liveSync: TeamStateResponse["liveSync"];
};

type TeamRoundBroadcastSnapshot = {
  teamId: string;
  activeRound: RoundState | null;
  latestHistoryEntry: HistoryEntry | null;
  revealedOrHiddenVoteValuesByUserId: Map<string, string>;
  liveSync: TeamStateResponse["liveSync"];
};

type TeamVoteBroadcastSnapshot = {
  teamId: string;
  roundId: string;
  changedMemberIndexes: number[];
  fromVoteVersion: number;
  voteValuesByUserId: Map<string, string>;
  votedCount: number;
  notVotedCount: number;
  liveSync: TeamStateResponse["liveSync"];
};

function buildTeamBroadcastSnapshot(teamId: string): TeamBroadcastSnapshot {
  const snapshot = roomEngineManager.getSnapshotRef(teamId);

  return {
    ...snapshot,
    activeParticipants: buildActiveParticipants(teamId, snapshot.teamMembers)
  };
}

function buildTeamRoundBroadcastSnapshot(teamId: string): TeamRoundBroadcastSnapshot {
  const snapshot = roomEngineManager.getSnapshotRef(teamId);
  const latestHistoryEntry = snapshot.activeRound?.status === "revealed" ? snapshot.history[0] ?? null : null;

  return {
    teamId,
    activeRound: snapshot.activeRound,
    latestHistoryEntry,
    revealedOrHiddenVoteValuesByUserId: snapshot.revealedOrHiddenVoteValuesByUserId,
    liveSync: snapshot.liveSync
  };
}

function buildTeamVoteBroadcastSnapshot(teamId: string): TeamVoteBroadcastSnapshot | null {
  const pendingDelta = roomEngineManager.peekPendingVoteDeltaRef(teamId);
  if (!pendingDelta) {
    return null;
  }
  const eligibleParticipantIds = getEligibleRevealParticipantIds(teamId);
  const eligibleParticipantIdSet = new Set(eligibleParticipantIds);
  const votedCount = [...pendingDelta.voteValuesByUserId.keys()].filter((userId) => eligibleParticipantIdSet.has(userId)).length;

  perfTracker.observe("broadcast.team.vote.deltaUsers", pendingDelta.changedMemberIndexes.length);
  perfTracker.observe("broadcast.team.vote.versionSpan", Math.max(1, pendingDelta.liveSync.voteVersion - pendingDelta.fromVoteVersion));
  return {
    teamId,
    roundId: pendingDelta.roundId,
    changedMemberIndexes: pendingDelta.changedMemberIndexes,
    fromVoteVersion: pendingDelta.fromVoteVersion,
    voteValuesByUserId: pendingDelta.voteValuesByUserId,
    votedCount,
    notVotedCount: Math.max(0, eligibleParticipantIds.length - votedCount),
    liveSync: pendingDelta.liveSync
  };
}

function personalizeRoundForBroadcast(round: RoundState | null, voteValuesByUserId: Map<string, string>, userId: string) {
  if (!round || round.status === "revealed") {
    return round;
  }

  const userVoteValue = voteValuesByUserId.get(userId);
  if (!userVoteValue) {
    return round;
  }

  return {
    ...round,
    votes: round.votes.map((vote) => (vote.userId === userId ? { ...vote, value: userVoteValue } : vote))
  };
}

function buildTeamStateFromBroadcastSnapshot(snapshot: TeamBroadcastSnapshot, userId: string): TeamStateResponse {
  const memberships = repository.getTeamsForUser(userId);
  const currentUser = repository.getCurrentUser(userId);
  if (!currentUser) {
    throw new Error("Not found");
  }

  const currentUserRole = repository.getTeamUserRole(userId, snapshot.team.id);
  if (currentUserRole === "none" && !currentUser.isSuperAdmin) {
    throw new Error("Forbidden");
  }
  const effectiveRole: TeamUserRole =
    currentUserRole !== "none"
      ? currentUserRole
      : snapshot.team.demo && currentUser.isSuperAdmin && config.demoModeEnabled
        ? "team_admin"
        : "none";
  const serverTime = new Date().toISOString();

  return {
    team: snapshot.team,
    memberships: memberships.memberships,
    availableTeams: memberships.availableTeams,
    teamMembers: snapshot.teamMembers,
    activeParticipants: snapshot.activeParticipants,
    activeRound: personalizeRoundForBroadcast(snapshot.activeRound, snapshot.revealedOrHiddenVoteValuesByUserId, userId),
    pendingIssues: snapshot.pendingIssues,
    history: snapshot.history,
    currentUser,
    currentUserRole: effectiveRole,
    liveSync: snapshot.liveSync,
    serverTime
  };
}

function buildTeamRoundUpdatePayload(snapshot: TeamRoundBroadcastSnapshot, userId: string): TeamRoundUpdatePayload {
  return {
    teamId: snapshot.teamId,
    activeRound: personalizeRoundForBroadcast(snapshot.activeRound, snapshot.revealedOrHiddenVoteValuesByUserId, userId),
    historyEntry: snapshot.latestHistoryEntry,
    liveSync: snapshot.liveSync,
    serverTime: new Date().toISOString()
  };
}

function buildTeamRoundVoteUpdatePayload(snapshot: TeamVoteBroadcastSnapshot, userId: string): TeamRoundVoteUpdatePayload {
  return {
    teamId: snapshot.teamId,
    roundId: snapshot.roundId,
    changedMemberIndexes: snapshot.changedMemberIndexes,
    fromVoteVersion: snapshot.fromVoteVersion,
    votedCount: snapshot.votedCount,
    notVotedCount: snapshot.notVotedCount,
    viewerVoteValue: snapshot.voteValuesByUserId.get(userId) ?? null,
    liveSync: snapshot.liveSync,
    serverTime: new Date().toISOString()
  };
}

function serializeBroadcastMessage(
  type: "team:round" | "team:round-vote" | "team:update",
  payload: TeamRoundUpdatePayload | TeamRoundVoteUpdatePayload | TeamStateResponse
) {
  const startMs = performance.now();
  const message = JSON.stringify({ type, payload });
  const metricPrefix = type === "team:update" ? "broadcast.team.update" : type === "team:round-vote" ? "broadcast.team.vote" : "broadcast.team.round";
  perfTracker.recordDuration(`${metricPrefix}.payloadBuild`, startMs);
  perfTracker.observe(`${metricPrefix}.payloadBytes`, message.length);
  return message;
}

function createApp(currentDemoModeManager: DemoModeManager) {
  const app = express();
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: "4mb" }));
  app.use(cookieParser());
  app.use("/branding", express.static(path.join(webPublic, "branding")));
  app.use("/managed-branding", express.static(config.managedBrandingDir));
  registerRoutes({
    app,
    webDist,
    config,
    shouldExposeDebugCodes,
    deploymentConfigManager,
    demoModeManager: currentDemoModeManager,
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
  });

  return app;
}

const teamClients = new Map<string, Set<import("ws").WebSocket>>();
const chooserClients = new Set<import("ws").WebSocket>();
const socketSessions = new WeakMap<import("ws").WebSocket, { teamId: string; userId: string }>();
const pendingTeamBroadcasts = new Map<string, PendingTeamBroadcast>();
const pendingBackpressuredTeamBroadcasts = new Map<string, BackpressuredTeamBroadcast>();
const readyTeamBroadcasts = new Map<string, ReadyTeamBroadcast>();
const readyTeamBroadcastOrder: string[] = [];
const postDrainTeamBroadcasts = new Map<string, ReadyTeamBroadcast>();
const pendingVoteDeltaFlushes = new Map<string, ReturnType<typeof setTimeout>>();
const pendingPresenceBroadcasts = new Map<string, { timer: ReturnType<typeof setTimeout>; queuedAt: number }>();
let pendingChooserBroadcast: ReturnType<typeof setTimeout> | null = null;
let pendingChooserBroadcastQueuedAt: number | null = null;
let pendingPlatformSettingsBroadcast: ReturnType<typeof setTimeout> | null = null;
let teamBroadcastDrainHandle: ReturnType<typeof setImmediate> | null = null;
let teamBroadcastDrainScheduled = false;
let teamBroadcastDrainRunning = false;
let activeTeamBroadcastTeamId: string | null = null;
const demoModeManager = new DemoModeManager({
  repository,
  isEnabled: () => config.demoModeEnabled,
  onChooserChanged: () => broadcastChooserSoon(),
  onTeamChanged: (teamId, mode = "full") => broadcastTeamSoon(teamId, mode),
  onVoteChanged: noteTeamVoteChanged
});
const app = createApp(demoModeManager);
const server = http.createServer(app);
const wsServer = new WebSocketServer({ server, path: "/ws" });

const eventLoopGaugeInterval = setInterval(() => {
  perfTracker.setGauge("eventLoopDelay.meanMs", Number((eventLoopDelayMonitor.mean / 1_000_000).toFixed(2)));
  perfTracker.setGauge("eventLoopDelay.maxMs", Number((eventLoopDelayMonitor.max / 1_000_000).toFixed(2)));
  perfTracker.setGauge("eventLoopDelay.p95Ms", Number((eventLoopDelayMonitor.percentile(95) / 1_000_000).toFixed(2)));
}, 1000);

eventLoopGaugeInterval.unref?.();

function logWsDebug(message: string, payload: Record<string, unknown>) {
  if (!config.debugToolsEnabled) {
    return;
  }
  console.debug(message, payload);
}

function describeSocketError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function attachSocketErrorHandler(socket: WebSocket, context: () => Record<string, unknown>) {
  socket.on("error", (error) => {
    perfTracker.incrementCounter("ws.socketErrors");
    logWsDebug("[ws-debug] socket error", {
      ...context(),
      error: describeSocketError(error)
    });
    socket.terminate();
  });
}

wsServer.on("error", (error) => {
  perfTracker.incrementCounter("ws.serverErrors");
  logWsDebug("[ws-debug] server error", {
    error: describeSocketError(error)
  });
});

wsServer.on("connection", (socket, request) => {
  const url = new URL(request.url ?? "/ws", config.appBaseUrl);
  const cookies = parseCookieHeader(request.headers.cookie ?? "");
  const token = url.searchParams.get("token") ?? cookies.session_token ?? undefined;
  const teamId = url.searchParams.get("teamId");
  const scope = url.searchParams.get("scope");
  attachSocketErrorHandler(socket, () => ({
    path: request.url ?? null,
    teamId,
    scope
  }));
  const user = repository.getSessionUser(token);
  if (!user || (!teamId && scope !== "chooser")) {
    perfTracker.incrementCounter("ws.rejectedConnections");
    logWsDebug("[ws-debug] rejected connection", {
      path: request.url ?? null,
      hasToken: Boolean(token),
      teamId,
      scope,
      hasUser: Boolean(user)
    });
    socket.terminate();
    return;
  }

  logWsDebug("[ws-debug] accepted connection", {
    path: request.url ?? null,
    teamId,
    scope,
    userId: user.id
  });

  if (scope === "chooser") {
    perfTracker.incrementCounter("ws.acceptedChooserConnections");
    chooserClients.add(socket);
    updateSocketMetrics();
    socket.on("close", () => {
      chooserClients.delete(socket);
      updateSocketMetrics();
    });
    return;
  }

  const resolvedTeamId = teamId;
  if (!resolvedTeamId) {
    socket.terminate();
    return;
  }

  if (!teamClients.has(resolvedTeamId)) {
    teamClients.set(resolvedTeamId, new Set());
  }
  teamClients.get(resolvedTeamId)!.add(socket);
  perfTracker.incrementCounter("ws.acceptedTeamConnections");
  socketSessions.set(socket, { teamId: resolvedTeamId, userId: user.id });
  updateSocketMetrics();
  broadcastPresenceSoon(resolvedTeamId);

  socket.on("close", () => {
    teamClients.get(resolvedTeamId)?.delete(socket);
    if (teamClients.get(resolvedTeamId)?.size === 0) {
      teamClients.delete(resolvedTeamId);
    }
    updateSocketMetrics();
    broadcastPresenceSoon(resolvedTeamId);
  });
});

function broadcastTeam(teamId: string, mode: TeamBroadcastMode = "full") {
  const sockets = teamClients.get(teamId);
  if (!sockets || sockets.size === 0) {
    return;
  }
  const startMs = performance.now();
  let sentCount = 0;
  let fullSnapshot: TeamBroadcastSnapshot | null = null;
  let roundSnapshot: TeamRoundBroadcastSnapshot | null = null;
  let voteSnapshot: TeamVoteBroadcastSnapshot | null = null;
  const roundMessageCache = new Map<string, string>();
  const voteMessageCache = new Map<string, string>();

  for (const socket of sockets) {
    if (socket.readyState !== 1) {
      continue;
    }

    const session = socketSessions.get(socket);
    if (!session) {
      continue;
    }

    try {
      if (mode === "round") {
        roundSnapshot ??= buildTeamRoundBroadcastSnapshot(teamId);
        const viewerVoteValue =
          roundSnapshot.activeRound?.status === "active" ? roundSnapshot.revealedOrHiddenVoteValuesByUserId.get(session.userId) ?? null : "__revealed__";
        const cacheKey = viewerVoteValue ?? "__none__";
        let message = roundMessageCache.get(cacheKey);
        if (!message) {
          message = serializeBroadcastMessage("team:round", buildTeamRoundUpdatePayload(roundSnapshot, session.userId));
          roundMessageCache.set(cacheKey, message);
        }
        socket.send(message);
      } else if (mode === "vote") {
        voteSnapshot ??= buildTeamVoteBroadcastSnapshot(teamId);
        if (!voteSnapshot) {
          continue;
        }
        const viewerVoteValue = voteSnapshot.voteValuesByUserId.get(session.userId) ?? null;
        const cacheKey = viewerVoteValue ?? "__none__";
        let message = voteMessageCache.get(cacheKey);
        if (!message) {
          message = serializeBroadcastMessage("team:round-vote", buildTeamRoundVoteUpdatePayload(voteSnapshot, session.userId));
          voteMessageCache.set(cacheKey, message);
        }
        socket.send(message);
      } else {
        fullSnapshot ??= buildTeamBroadcastSnapshot(teamId);
        socket.send(serializeBroadcastMessage("team:update", buildTeamStateFromBroadcastSnapshot(fullSnapshot, session.userId)));
      }
      sentCount += 1;
    } catch {
      socket.close();
    }
  }

  if (mode === "vote" && voteSnapshot) {
    roomEngineManager.acknowledgeVoteDelta(teamId, voteSnapshot.liveSync.voteVersion);
  }
  if (mode === "full" || mode === "round") {
    clearPendingVoteDeltaFlush(teamId);
    roomEngineManager.clearPendingVoteDelta(teamId);
  }

  perfTracker.incrementCounter(getTeamBroadcastMetricName(mode, "sent"));
  perfTracker.observe(getTeamBroadcastMetricName(mode, "recipients"), sentCount);
  perfTracker.recordDuration(getTeamBroadcastMetricName(mode, "duration"), startMs);
}

function broadcastPresence(teamId: string) {
  const sockets = teamClients.get(teamId);
  if (!sockets || sockets.size === 0) {
    return;
  }
  revealBlockedRoundIfCurrentParticipantsSatisfyRule(teamId);
  const startMs = performance.now();
  let sentCount = 0;

  const payload = JSON.stringify({
    type: "team:presence",
    payload: {
      teamId,
      activeParticipants: buildActiveParticipants(teamId)
    }
  });

  for (const socket of sockets) {
    if (socket.readyState !== 1) {
      continue;
    }

    try {
      socket.send(payload);
      sentCount += 1;
    } catch {
      socket.close();
    }
  }

  perfTracker.incrementCounter("broadcast.team.presence.sent");
  perfTracker.observe("broadcast.team.presence.recipients", sentCount);
  perfTracker.recordDuration("broadcast.team.presence.duration", startMs);
}

function broadcastChooser() {
  if (chooserClients.size === 0) {
    return;
  }
  const startMs = performance.now();
  let sentCount = 0;

  for (const socket of chooserClients) {
    if (socket.readyState !== 1) {
      continue;
    }

    try {
      socket.send(
        JSON.stringify({
          type: "chooser:update"
        })
      );
      sentCount += 1;
    } catch {
      socket.close();
    }
  }

  perfTracker.incrementCounter("broadcast.chooser.sent");
  perfTracker.observe("broadcast.chooser.recipients", sentCount);
  perfTracker.recordDuration("broadcast.chooser.duration", startMs);
}

function broadcastPlatformSettings() {
  const sockets = new Set<import("ws").WebSocket>();
  for (const socket of chooserClients) {
    sockets.add(socket);
  }
  for (const teamSockets of teamClients.values()) {
    for (const socket of teamSockets) {
      sockets.add(socket);
    }
  }
  if (sockets.size === 0) {
    return;
  }

  const payload = JSON.stringify({
    type: "platform:branding",
    payload: deploymentConfigManager.getRedactedConfig().branding
  });
  const startMs = performance.now();
  let sentCount = 0;
  for (const socket of sockets) {
    if (socket.readyState !== 1) {
      continue;
    }

    try {
      socket.send(payload);
      sentCount += 1;
    } catch {
      socket.close();
    }
  }

  perfTracker.incrementCounter("broadcast.platformSettings.sent");
  perfTracker.observe("broadcast.platformSettings.recipients", sentCount);
  perfTracker.recordDuration("broadcast.platformSettings.duration", startMs);
}

function closeUnavailableSimulatorTeamSockets() {
  for (const [teamId, sockets] of teamClients) {
    if (repository.isTeamVisibleForRuntimeById(teamId)) {
      continue;
    }
    for (const socket of sockets) {
      try {
        socket.close();
      } catch {
        socket.terminate();
      }
    }
  }
}

function reconcileSimulatorRuntimeVisibilityTransition(
  previousOnline: boolean,
  callbacks: {
    closeUnavailableTeamSockets(): void;
    broadcastChooserUpdate(): void;
  } = {
    closeUnavailableTeamSockets: closeUnavailableSimulatorTeamSockets,
    broadcastChooserUpdate: broadcastChooserSoon
  }
) {
  const simulatorOnline = repository.isSimulatorOnline();
  if (simulatorOnline === previousOnline) {
    return previousOnline;
  }

  if (!simulatorOnline) {
    callbacks.closeUnavailableTeamSockets();
  }
  callbacks.broadcastChooserUpdate();
  return simulatorOnline;
}

const timerSweepInterval = setInterval(() => {
  for (const round of repository.getExpiredTimedRounds()) {
    try {
      const revealedRound = repository.revealRound(round.id, { eligibleParticipantIds: getEligibleRevealParticipantIds(round.teamId) });
      noteTeamRoundRevealed(round.teamId, revealedRound, repository.getLatestHistoryEntry(round.teamId));
    } catch {
      // Ignore races with manual reveal or round replacement; next state broadcast will converge.
    }
  }
}, 1000);

timerSweepInterval.unref?.();

let lastSimulatorOnline = repository.isSimulatorOnline();
const simulatorRuntimeVisibilityInterval = setInterval(() => {
  lastSimulatorOnline = reconcileSimulatorRuntimeVisibilityTransition(lastSimulatorOnline);
}, 1000);

simulatorRuntimeVisibilityInterval.unref?.();

if (process.env.NODE_ENV !== "test") {
  server.listen(config.port, config.host, () => {
    console.log(`API listening on http://${config.host}:${config.port}`);
  });
}

demoModeManager.sync();

export {
  app,
  server,
  repository,
  allowedDomains,
  createApp,
  timerSweepInterval,
  simulatorRuntimeVisibilityInterval,
  reconcileSimulatorRuntimeVisibilityTransition,
  demoModeManager
};
