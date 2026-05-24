// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import type {
  CurrentUserSummary,
  HistoryEntry,
  RoundState,
  TeamMemberSummary,
  TeamMembershipSummary,
  TeamPendingIssue,
  TeamRoundVoteUpdatePayload,
  TeamStateResponse,
  TeamSummary,
  TeamUserRole
} from "@planning-poker/shared";
import { perfTracker } from "./perf.js";

type VoteSummaryMap = Map<string, string>;

type TeamStateContext = {
  team: TeamSummary;
  memberships: TeamMembershipSummary[];
  availableTeams: TeamMembershipSummary[];
  currentUser: CurrentUserSummary;
  currentUserRole: TeamUserRole;
};

type RoomCheckpoint = {
  roundId: string | null;
  latestHistoryEntryId: string | null;
  createdAt: string;
};

type RoomState = {
  snapshot: TeamRoomSnapshot;
  dirty: boolean;
  pendingVoteDeltaFromVersion: number | null;
  dirtyVoteChanges: Map<string, number>;
  checkpoint: RoomCheckpoint;
  memberDisplayOrderByUserId: Map<string, number>;
  memberSummaryByUserId: Map<string, TeamMemberSummary>;
};

export type TeamRoomSnapshot = {
  team: TeamSummary;
  teamMembers: TeamMemberSummary[];
  pendingIssues: TeamPendingIssue[];
  history: HistoryEntry[];
  activeRound: RoundState | null;
  revealedOrHiddenVoteValuesByUserId: VoteSummaryMap;
  liveSync: TeamStateResponse["liveSync"];
};

export type PendingTeamVoteDelta = Pick<TeamRoundVoteUpdatePayload, "teamId" | "roundId" | "changedMemberIndexes" | "fromVoteVersion" | "votedCount" | "notVotedCount" | "liveSync"> & {
  voteValuesByUserId: VoteSummaryMap;
};

export type RoomEngineRepositoryLike = {
  getTeam(teamId: string): TeamSummary | null;
  getTeamMembers(teamId: string): TeamMemberSummary[];
  getPendingIssues(teamId: string): TeamPendingIssue[];
  getHistoryPage(teamId: string, options?: { limit?: number; cursorCompletedAt?: string; cursorId?: string }): { items: HistoryEntry[]; nextCursor: unknown | null };
  getCurrentRound(teamId: string): RoundState | null;
  getRoundVoteValues(roundId: string | null): Array<{ userId: string; value: string }>;
  getCurrentUser(userId: string): CurrentUserSummary | null;
  getTeamsForUser(userId: string): { memberships: TeamMembershipSummary[]; availableTeams: TeamMembershipSummary[] };
  getTeamUserRole(userId: string, teamId: string): TeamUserRole;
  getTeamStateContext(teamId: string, userId: string): TeamStateContext;
};

function cloneRound(round: RoundState | null): RoundState | null {
  return round
    ? {
        ...round,
        votes: round.votes.map((vote) => ({ ...vote }))
      }
    : null;
}

function cloneMap(source: VoteSummaryMap): VoteSummaryMap {
  return new Map(source.entries());
}

function buildCheckpoint(snapshot: TeamRoomSnapshot): RoomCheckpoint {
  return {
    roundId: snapshot.activeRound?.id ?? null,
    latestHistoryEntryId: snapshot.history[0]?.id ?? null,
    createdAt: snapshot.history[0]?.completedAt ?? snapshot.team.lastActivityAt
  };
}

function refreshCheckpoint(state: RoomState) {
  return perfTracker.measure("roomEngine.checkpointRefresh", () => {
    state.checkpoint = buildCheckpoint(state.snapshot);
    return state.checkpoint;
  });
}

function buildMemberIndexes(teamMembers: TeamMemberSummary[]) {
  const memberDisplayOrderByUserId = new Map<string, number>();
  const memberSummaryByUserId = new Map<string, TeamMemberSummary>();

  [...teamMembers]
    .sort((left, right) => left.displayName.localeCompare(right.displayName))
    .forEach((member, index) => {
      memberDisplayOrderByUserId.set(member.id, index);
      memberSummaryByUserId.set(member.id, member);
    });

  return {
    memberDisplayOrderByUserId,
    memberSummaryByUserId
  };
}

function sameRoundIdentity(left: RoundState | null, right: RoundState | null) {
  return left?.id === right?.id && left?.status === right?.status && left?.revealedAt === right?.revealedAt;
}

export function createRoomEngineManager(repository: RoomEngineRepositoryLike) {
  const rooms = new Map<string, RoomState>();

  function updateRoomEngineGauges() {
    perfTracker.setGauge("roomEngine.activeRooms", rooms.size);
    perfTracker.setGauge(
      "roomEngine.dirtyRooms",
      [...rooms.values()].reduce((count, room) => count + (room.dirty ? 1 : 0), 0)
    );
  }

  function buildSnapshot(teamId: string, previous?: RoomState): TeamRoomSnapshot {
    const team = repository.getTeam(teamId);
    if (!team) {
      throw new Error("Team not found");
    }

    const teamMembers = repository.getTeamMembers(teamId);
    const activeRound = repository.getCurrentRound(teamId);
    const revealedOrHiddenVoteValuesByUserId =
      activeRound?.status === "revealed"
        ? new Map(activeRound.votes.map((vote) => [vote.userId, vote.value]))
        : new Map(repository.getRoundVoteValues(activeRound?.id ?? null).map((vote) => [vote.userId, vote.value]));
    const history = repository.getHistoryPage(teamId, { limit: 20 }).items;
    const priorSync = previous?.snapshot.liveSync;
    const currentRoundId = activeRound?.id ?? null;
    const roundChanged =
      !previous ||
      previous.snapshot.liveSync.roundId !== currentRoundId ||
      !sameRoundIdentity(previous.snapshot.activeRound, activeRound);
    const roundVersion = roundChanged ? (priorSync?.roundVersion ?? 0) + 1 : (priorSync?.roundVersion ?? 1);

    return {
      team,
      teamMembers,
      pendingIssues: repository.getPendingIssues(teamId),
      history,
      activeRound: cloneRound(activeRound),
      revealedOrHiddenVoteValuesByUserId,
      liveSync: {
        teamId,
        roundId: currentRoundId,
        roundVersion,
        voteVersion: activeRound?.votes.length ?? 0
      }
    };
  }

  function hydrate(teamId: string) {
    return perfTracker.measure("roomEngine.hydrate", () => {
      const previous = rooms.get(teamId);
      const snapshot = buildSnapshot(teamId, previous);
      const { memberDisplayOrderByUserId, memberSummaryByUserId } = buildMemberIndexes(snapshot.teamMembers);
      const next: RoomState = {
        snapshot,
        dirty: false,
        pendingVoteDeltaFromVersion: null,
        dirtyVoteChanges: new Map(),
        checkpoint: buildCheckpoint(snapshot),
        memberDisplayOrderByUserId,
        memberSummaryByUserId
      };
      rooms.set(teamId, next);
      perfTracker.observe("roomEngine.snapshot.memberCount", snapshot.teamMembers.length);
      perfTracker.observe("roomEngine.snapshot.historyCount", snapshot.history.length);
      updateRoomEngineGauges();
      return next;
    });
  }

  function ensure(teamId: string) {
    const existing = rooms.get(teamId);
    if (!existing) {
      perfTracker.incrementCounter("roomEngine.cacheMiss");
      return hydrate(teamId);
    }
    if (existing.dirty) {
      perfTracker.incrementCounter("roomEngine.dirtyHydrate");
      return hydrate(teamId);
    }
    perfTracker.incrementCounter("roomEngine.cacheHit");
    return existing;
  }

  function markDirty(teamId: string) {
    const state = rooms.get(teamId);
    if (state) {
      state.dirty = true;
      perfTracker.incrementCounter("roomEngine.markDirty");
      updateRoomEngineGauges();
    }
  }

  function getSnapshot(teamId: string): TeamRoomSnapshot {
    const state = ensure(teamId);
    return {
      ...state.snapshot,
      teamMembers: state.snapshot.teamMembers.map((member) => ({ ...member })),
      pendingIssues: state.snapshot.pendingIssues.map((issue) => ({ ...issue })),
      history: state.snapshot.history.map((entry) => ({
        ...entry,
        votes: entry.votes.map((vote) => ({ ...vote })),
        comments: entry.comments.map((comment) => ({ ...comment, author: { ...comment.author } }))
      })),
      activeRound: cloneRound(state.snapshot.activeRound),
      revealedOrHiddenVoteValuesByUserId: cloneMap(state.snapshot.revealedOrHiddenVoteValuesByUserId),
      liveSync: { ...state.snapshot.liveSync }
    };
  }

  function getSnapshotRef(teamId: string): TeamRoomSnapshot {
    return ensure(teamId).snapshot;
  }

  function getViewerContext(teamId: string, userId: string): TeamStateContext {
    return repository.getTeamStateContext(teamId, userId);
  }

  function resetRoundSync(state: RoomState, nextRoundId: string | null, nextVoteVersion: number) {
    state.snapshot.liveSync.roundId = nextRoundId;
    state.snapshot.liveSync.roundVersion += 1;
    state.snapshot.liveSync.voteVersion = nextVoteVersion;
    state.pendingVoteDeltaFromVersion = null;
    state.dirtyVoteChanges.clear();
  }

  function buildVoteRecord(teamId: string, userId: string, value: string) {
    const state = ensure(teamId);
    const member = state.memberSummaryByUserId.get(userId) ?? repository.getCurrentUser(userId);
    if (!member) {
      throw new Error("User not found");
    }
    return {
      userId,
      displayName: member.displayName,
      avatarIconKey: member.avatarIconKey,
      avatarColorKey: member.avatarColorKey,
      value
    };
  }

  function noteVoteChange(teamId: string, roundId: string, userId: string, value: string) {
    let state = ensure(teamId);
    if (!state.snapshot.activeRound || state.snapshot.activeRound.id !== roundId || state.snapshot.activeRound.status !== "active") {
      state = hydrate(teamId);
    }
    if (!state.snapshot.activeRound || state.snapshot.activeRound.id !== roundId || state.snapshot.activeRound.status !== "active") {
      throw new Error("Room snapshot out of sync with active round");
    }

    if (state.pendingVoteDeltaFromVersion == null) {
      state.pendingVoteDeltaFromVersion = state.snapshot.liveSync.voteVersion;
    }

    const existingValue = state.snapshot.revealedOrHiddenVoteValuesByUserId.get(userId) ?? null;
    state.snapshot.liveSync.voteVersion += 1;
    state.dirtyVoteChanges.set(userId, state.snapshot.liveSync.voteVersion);
    state.snapshot.revealedOrHiddenVoteValuesByUserId.set(userId, value);

    const nextVote = buildVoteRecord(teamId, userId, value);
    const existingIndex = state.snapshot.activeRound.votes.findIndex((vote) => vote.userId === userId);
    if (existingIndex === -1) {
      const targetOrder = state.memberDisplayOrderByUserId.get(userId) ?? Number.MAX_SAFE_INTEGER;
      const insertAt = state.snapshot.activeRound.votes.findIndex(
        (vote) => (state.memberDisplayOrderByUserId.get(vote.userId) ?? Number.MAX_SAFE_INTEGER) > targetOrder
      );
      if (insertAt === -1) {
        state.snapshot.activeRound.votes = [...state.snapshot.activeRound.votes, nextVote];
      } else {
        state.snapshot.activeRound.votes = [
          ...state.snapshot.activeRound.votes.slice(0, insertAt),
          nextVote,
          ...state.snapshot.activeRound.votes.slice(insertAt)
        ];
      }
    } else {
      state.snapshot.activeRound.votes = state.snapshot.activeRound.votes.map((vote, index) => (index === existingIndex ? nextVote : vote));
    }

    if (!existingValue) {
      state.snapshot.activeRound.votedCount += 1;
      state.snapshot.activeRound.notVotedCount = Math.max(0, state.snapshot.teamMembers.length - state.snapshot.activeRound.votedCount);
    }

    perfTracker.observe("roomEngine.voteDeltaUsers", state.dirtyVoteChanges.size);

    return { ...state.snapshot.liveSync };
  }

  function noteRoundChanged(teamId: string) {
    const state = hydrate(teamId);
    return { ...state.snapshot.liveSync };
  }

  function noteRoundStarted(teamId: string, round: RoundState) {
    const state = ensure(teamId);
    state.snapshot.activeRound = cloneRound(round);
    state.snapshot.revealedOrHiddenVoteValuesByUserId = new Map();
    resetRoundSync(state, round.id, 0);
    state.dirty = false;
    refreshCheckpoint(state);
    perfTracker.incrementCounter("roomEngine.roundStarted");
    return { ...state.snapshot.liveSync };
  }

  function noteRoundRevealed(teamId: string, round: RoundState, latestHistoryEntry: HistoryEntry | null) {
    const state = ensure(teamId);
    state.snapshot.activeRound = cloneRound(round);
    state.snapshot.revealedOrHiddenVoteValuesByUserId = new Map(round.votes.map((vote) => [vote.userId, vote.value]));
    resetRoundSync(state, round.id, round.votes.length);
    if (latestHistoryEntry) {
      const remainingHistory = state.snapshot.history.filter((entry) => entry.id !== latestHistoryEntry.id);
      state.snapshot.history = [latestHistoryEntry, ...remainingHistory].slice(0, Math.max(state.snapshot.history.length, 20));
    }
    if (round.pendingIssueId) {
      state.snapshot.pendingIssues = state.snapshot.pendingIssues.filter((issue) => issue.id !== round.pendingIssueId);
    }
    state.dirty = false;
    refreshCheckpoint(state);
    perfTracker.incrementCounter("roomEngine.roundRevealed");
    return { ...state.snapshot.liveSync };
  }

  function peekPendingVoteDelta(teamId: string): PendingTeamVoteDelta | null {
    const state = ensure(teamId);
    if (
      !state.snapshot.activeRound ||
      state.snapshot.activeRound.status !== "active" ||
      state.pendingVoteDeltaFromVersion == null ||
      state.dirtyVoteChanges.size === 0
    ) {
      return null;
    }

    return {
      teamId,
      roundId: state.snapshot.activeRound.id,
      changedMemberIndexes: [...state.dirtyVoteChanges.entries()]
        .sort((left, right) => left[1] - right[1] || left[0].localeCompare(right[0]))
        .map(([userId]) => state.memberDisplayOrderByUserId.get(userId))
        .filter((index): index is number => typeof index === "number"),
      fromVoteVersion: state.pendingVoteDeltaFromVersion,
      votedCount: state.snapshot.activeRound.votedCount,
      notVotedCount: state.snapshot.activeRound.notVotedCount,
      voteValuesByUserId: cloneMap(state.snapshot.revealedOrHiddenVoteValuesByUserId),
      liveSync: { ...state.snapshot.liveSync }
    };
  }

  function peekPendingVoteDeltaRef(teamId: string): PendingTeamVoteDelta | null {
    const state = ensure(teamId);
    if (
      !state.snapshot.activeRound ||
      state.snapshot.activeRound.status !== "active" ||
      state.pendingVoteDeltaFromVersion == null ||
      state.dirtyVoteChanges.size === 0
    ) {
      return null;
    }

    perfTracker.observe("roomEngine.pendingVoteDeltaUsers", state.dirtyVoteChanges.size);

    return {
      teamId,
      roundId: state.snapshot.activeRound.id,
      changedMemberIndexes: [...state.dirtyVoteChanges.entries()]
        .sort((left, right) => left[1] - right[1] || left[0].localeCompare(right[0]))
        .map(([userId]) => state.memberDisplayOrderByUserId.get(userId))
        .filter((index): index is number => typeof index === "number"),
      fromVoteVersion: state.pendingVoteDeltaFromVersion,
      votedCount: state.snapshot.activeRound.votedCount,
      notVotedCount: state.snapshot.activeRound.notVotedCount,
      voteValuesByUserId: state.snapshot.revealedOrHiddenVoteValuesByUserId,
      liveSync: state.snapshot.liveSync
    };
  }

  function acknowledgeVoteDelta(teamId: string, deliveredVoteVersion: number) {
    const state = rooms.get(teamId);
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

  function clearPendingVoteDelta(teamId: string) {
    const state = rooms.get(teamId);
    if (!state) {
      return;
    }
    state.dirtyVoteChanges.clear();
    state.pendingVoteDeltaFromVersion = null;
  }

  function inspect(teamId: string) {
    const state = rooms.get(teamId);
    return state
      ? {
          liveSync: { ...state.snapshot.liveSync },
          dirty: state.dirty,
          pendingVoteDeltaFromVersion: state.pendingVoteDeltaFromVersion,
          checkpoint: { ...state.checkpoint },
          dirtyVoteChanges: [...state.dirtyVoteChanges.entries()].map(([userId, version]) => ({ userId, version }))
        }
      : null;
  }

  return {
    getSnapshot,
    getSnapshotRef,
    getViewerContext,
    markDirty,
    noteVoteChange,
    noteRoundChanged,
    noteRoundStarted,
    noteRoundRevealed,
    peekPendingVoteDelta,
    peekPendingVoteDeltaRef,
    acknowledgeVoteDelta,
    clearPendingVoteDelta,
    inspect
  };
}
