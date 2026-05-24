// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

export type TeamBroadcastMode = "full" | "round" | "vote";

export type TeamBroadcastCandidate = {
  teamId: string;
  mode: TeamBroadcastMode;
  queuedAt: number;
  recipients: number;
};

type SchedulerOptions = {
  nowMs: number;
  starvationMs: number;
};

function getRecipientCost(mode: TeamBroadcastMode, recipients: number) {
  const normalizedRecipients = Math.max(1, recipients);
  if (mode === "round") {
    return Math.max(1, Math.ceil(normalizedRecipients / 20));
  }
  if (mode === "vote") {
    return Math.max(1, Math.ceil(normalizedRecipients / 12));
  }
  return Math.max(1, Math.ceil(normalizedRecipients / 10));
}

function getModeUrgency(mode: TeamBroadcastMode) {
  if (mode === "round") {
    return 3.2;
  }
  if (mode === "vote") {
    return 2.2;
  }
  return 1;
}

export function computeTeamVoteDeltaFlushMs(options: { recipients: number; activeRoomCount: number; readyDepth: number }) {
  void options;
  return 60;
}

export function computeTeamBroadcastBackpressureMs(options: {
  mode: TeamBroadcastMode;
  recipients: number;
  activeRoomCount: number;
  readyDepth: number;
}) {
  if (options.mode === "round") {
    return 0;
  }

  if (options.mode === "vote") {
    return 0;
  }

  if (options.activeRoomCount <= 1) {
    if (options.recipients >= 80) {
      return 6;
    }
    if (options.recipients >= 20) {
      return 2;
    }
    return 0;
  }

  if (options.recipients >= 150) {
    return 60;
  }
  if (options.recipients >= 80) {
    return 24;
  }
  if (options.recipients >= 20) {
    return 10;
  }
  return 4;
}

export function selectNextReadyTeamBroadcast(candidates: TeamBroadcastCandidate[], options: SchedulerOptions) {
  if (candidates.length === 0) {
    return null;
  }

  let oldestStarved: TeamBroadcastCandidate | null = null;
  for (const candidate of candidates) {
    if (options.nowMs - candidate.queuedAt < options.starvationMs) {
      continue;
    }
    if (!oldestStarved || candidate.queuedAt < oldestStarved.queuedAt) {
      oldestStarved = candidate;
    }
  }
  if (oldestStarved) {
    return oldestStarved.teamId;
  }

  let bestCandidate = candidates[0]!;
  for (const candidate of candidates) {
    const candidateAgeMs = Math.max(1, options.nowMs - candidate.queuedAt);
    const bestAgeMs = Math.max(1, options.nowMs - bestCandidate.queuedAt);
    const candidateScore = (candidateAgeMs * getModeUrgency(candidate.mode)) / getRecipientCost(candidate.mode, candidate.recipients);
    const bestScore = (bestAgeMs * getModeUrgency(bestCandidate.mode)) / getRecipientCost(bestCandidate.mode, bestCandidate.recipients);
    if (candidateScore > bestScore) {
      bestCandidate = candidate;
      continue;
    }

    if (candidateScore === bestScore && candidate.queuedAt < bestCandidate.queuedAt) {
      bestCandidate = candidate;
    }
  }
  return bestCandidate.teamId;
}
