// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { RoundState } from "@planning-poker/shared";

export type TeamLiveSyncSnapshot = {
  teamId: string;
  roundId: string | null;
  roundVersion: number;
  voteVersion: number;
};

export type PendingTeamVoteDelta = {
  sync: TeamLiveSyncSnapshot;
  fromVoteVersion: number;
  changedUserIds: string[];
};

type VoteSummary = {
  roundId: string;
  status: "active" | "revealed";
  votedUserIds: string[];
  voteValuesByUserId: Map<string, string>;
  votedCount: number;
  notVotedCount: number;
} | null;

export type LiveSyncRepositoryLike = {
  getCurrentRound(teamId: string): RoundState | null;
  getCurrentRoundVoteSummary(teamId: string): VoteSummary;
};

type TeamLiveSyncState = TeamLiveSyncSnapshot & {
  dirtyVoteChanges: Map<string, number>;
  pendingVoteDeltaFromVersion: number | null;
};

function initialVoteVersionForRound(round: RoundState | null) {
  return round?.votes.length ?? 0;
}

export function createTeamLiveSyncManager(repository: LiveSyncRepositoryLike) {
  const states = new Map<string, TeamLiveSyncState>();

  function getOrCreateState(teamId: string) {
    const existing = states.get(teamId);
    if (existing) {
      return existing;
    }

    const round = repository.getCurrentRound(teamId);
    const created: TeamLiveSyncState = {
      teamId,
      roundId: round?.id ?? null,
      roundVersion: round ? 1 : 0,
      voteVersion: initialVoteVersionForRound(round),
      dirtyVoteChanges: new Map(),
      pendingVoteDeltaFromVersion: null
    };
    states.set(teamId, created);
    return created;
  }

  function snapshot(state: TeamLiveSyncState): TeamLiveSyncSnapshot {
    return {
      teamId: state.teamId,
      roundId: state.roundId,
      roundVersion: state.roundVersion,
      voteVersion: state.voteVersion
    };
  }

  function clearPendingVoteDelta(teamId: string) {
    const state = states.get(teamId);
    if (!state) {
      return;
    }
    state.dirtyVoteChanges.clear();
    state.pendingVoteDeltaFromVersion = null;
  }

  function syncTeam(teamId: string): TeamLiveSyncSnapshot {
    const state = getOrCreateState(teamId);
    const round = repository.getCurrentRound(teamId);
    const nextRoundId = round?.id ?? null;

    if (state.roundId !== nextRoundId) {
      state.roundId = nextRoundId;
      state.roundVersion += 1;
      state.voteVersion = initialVoteVersionForRound(round);
      state.dirtyVoteChanges.clear();
      state.pendingVoteDeltaFromVersion = null;
    }

    return snapshot(state);
  }

  function noteRoundChange(teamId: string): TeamLiveSyncSnapshot {
    const state = getOrCreateState(teamId);
    const round = repository.getCurrentRound(teamId);
    state.roundId = round?.id ?? null;
    state.roundVersion += 1;
    state.voteVersion = initialVoteVersionForRound(round);
    state.dirtyVoteChanges.clear();
    state.pendingVoteDeltaFromVersion = null;
    return snapshot(state);
  }

  function noteVoteChange(teamId: string, roundId: string, userId: string): TeamLiveSyncSnapshot {
    const state = getOrCreateState(teamId);
    if (state.roundId !== roundId) {
      state.roundId = roundId;
      state.roundVersion += 1;
      state.voteVersion = 0;
      state.dirtyVoteChanges.clear();
      state.pendingVoteDeltaFromVersion = null;
    }

    if (state.pendingVoteDeltaFromVersion == null) {
      state.pendingVoteDeltaFromVersion = state.voteVersion;
    }

    state.voteVersion += 1;
    state.dirtyVoteChanges.set(userId, state.voteVersion);
    return snapshot(state);
  }

  function peekPendingVoteDelta(teamId: string): PendingTeamVoteDelta | null {
    const state = states.get(teamId);
    if (!state || state.pendingVoteDeltaFromVersion == null || state.dirtyVoteChanges.size === 0) {
      return null;
    }

    return {
      sync: snapshot(state),
      fromVoteVersion: state.pendingVoteDeltaFromVersion,
      changedUserIds: [...state.dirtyVoteChanges.entries()]
        .sort((left, right) => left[1] - right[1] || left[0].localeCompare(right[0]))
        .map(([userId]) => userId)
    };
  }

  function acknowledgeVoteDelta(teamId: string, deliveredVoteVersion: number) {
    const state = states.get(teamId);
    if (!state) {
      return;
    }

    for (const [userId, version] of state.dirtyVoteChanges) {
      if (version <= deliveredVoteVersion) {
        state.dirtyVoteChanges.delete(userId);
      }
    }

    if (state.dirtyVoteChanges.size === 0) {
      state.pendingVoteDeltaFromVersion = null;
      return;
    }

    state.pendingVoteDeltaFromVersion = deliveredVoteVersion;
  }

  function inspect(teamId: string) {
    const state = states.get(teamId);
    return state
      ? {
          sync: snapshot(state),
          pendingVoteDeltaFromVersion: state.pendingVoteDeltaFromVersion,
          dirtyVoteChanges: [...state.dirtyVoteChanges.entries()].map(([userId, version]) => ({ userId, version }))
        }
      : null;
  }

  return {
    syncTeam,
    noteRoundChange,
    noteVoteChange,
    peekPendingVoteDelta,
    acknowledgeVoteDelta,
    clearPendingVoteDelta,
    inspect
  };
}
