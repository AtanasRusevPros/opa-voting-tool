// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App, { applyTeamRoundVoteUpdateToState } from "./App";
import { BRANDING_MANIFEST, DEFAULT_HISTORY_TIME_ZONE_KEYS, type TeamStateResponse, type UserSummary } from "@planning-poker/shared";

function buildMembers(count: number): UserSummary[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `user-${index}`,
    email: `user-${index}@example-company.com`,
    displayName: `User ${index}`,
    avatarIconKey: BRANDING_MANIFEST.avatarIconKeys[index % BRANDING_MANIFEST.avatarIconKeys.length],
    avatarColorKey: BRANDING_MANIFEST.avatarColorKeys[index % BRANDING_MANIFEST.avatarColorKeys.length]
  }));
}

function buildBoardState(overrides?: Partial<TeamStateResponse>): TeamStateResponse {
  const members = buildMembers(3);
  return {
    team: {
      id: "team-1",
      name: "Delta Team",
      slug: "delta-team",
      demo: false,
      deckKey: "fibonacci-21",
      fibonacciRangeStart: null,
      fibonacciRangeEnd: null,
      timerSeconds: null,
      iconKey: "orbit",
      logoOpacity: 0.18,
      backgroundOpacity: 0.12,
      historyTimezonePopupEnabled: true,
      historyTimezoneKeys: [...DEFAULT_HISTORY_TIME_ZONE_KEYS],
      minimumVotePercentEnabled: false,
      minimumVotePercent: 75,
      archived: false,
      jiraProjectKey: null,
      jiraJql: null,
      lastActivityAt: "2026-04-27T14:00:00.000Z"
    },
    memberships: [
      {
        id: "team-1",
        name: "Delta Team",
        slug: "delta-team",
        demo: false,
        deckKey: "fibonacci-21",
        fibonacciRangeStart: null,
        fibonacciRangeEnd: null,
        timerSeconds: null,
        iconKey: "orbit",
        logoOpacity: 0.18,
        backgroundOpacity: 0.12,
        historyTimezonePopupEnabled: true,
        historyTimezoneKeys: [...DEFAULT_HISTORY_TIME_ZONE_KEYS],
        minimumVotePercentEnabled: false,
        minimumVotePercent: 75,
        archived: false,
        jiraProjectKey: null,
        jiraJql: null,
        lastActivityAt: "2026-04-27T14:00:00.000Z",
        memberCount: 3,
        currentUserRole: "team_admin",
        joinRequestStatus: "none",
        lastOpenedAt: "2026-04-27T14:00:00.000Z"
      }
    ],
    availableTeams: [],
    teamMembers: members.map((member, index) => ({
      ...member,
      role: index === 0 ? "team_admin" : "member",
      joinedAt: "2026-04-27T14:00:00.000Z",
      lastOpenedAt: "2026-04-27T14:00:00.000Z"
    })),
    activeParticipants: members,
    pendingIssues: [],
    activeRound: {
      id: "round-1",
      teamId: "team-1",
      title: "DELTA-101",
      deckKey: "fibonacci-21",
      fibonacciRangeStart: null,
      fibonacciRangeEnd: null,
      status: "active",
      createdAt: "2026-04-27T14:00:00.000Z",
      timerStartedAt: null,
      timerExpiresAt: null,
      revealedAt: null,
      revealAverage: null,
      quorumBlocked: false,
      votedCount: 0,
      notVotedCount: 3,
      votes: [],
      revoteHistoryEntryId: null,
      pendingIssueId: null
    },
    history: [],
    currentUser: {
      ...members[0]!,
      isSuperAdmin: false,
      loginName: null,
      boardShortcutsEnabled: true
    },
    currentUserRole: "team_admin",
    liveSync: {
      teamId: "team-1",
      roundId: "round-1",
      roundVersion: 1,
      voteVersion: 0
    },
    ...overrides
  };
}

function buildJsonResponse(body: unknown, ok = true) {
  return Promise.resolve({
    ok,
    status: ok ? 200 : 400,
    json: async () => body,
    text: async () => JSON.stringify(body),
    blob: async () => new Blob([JSON.stringify(body)]),
    headers: new Headers()
  });
}

class WebSocketMock {
  static instances: WebSocketMock[] = [];
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = 1;

  constructor() {
    WebSocketMock.instances.push(this);
    window.setTimeout(() => this.onopen?.(new Event("open")), 0);
  }

  close() {
    this.onclose?.(new CloseEvent("close"));
  }

  emit(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) } as MessageEvent);
  }
}

describe("Phase 11 delta correctness", () => {
  beforeEach(() => {
    window.localStorage.clear();
    WebSocketMock.instances = [];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("applies an exact vote delta and advances live sync without replacing history", () => {
    const current = buildBoardState();
    const next = applyTeamRoundVoteUpdateToState(current, {
      teamId: "team-1",
      roundId: "round-1",
      changedMemberIndexes: [1],
      fromVoteVersion: 0,
      votedCount: 1,
      notVotedCount: 2,
      viewerVoteValue: null,
      liveSync: {
        teamId: "team-1",
        roundId: "round-1",
        roundVersion: 1,
        voteVersion: 1
      }
    });

    expect(next.history).toEqual(current.history);
    expect(next.activeRound?.votes).toHaveLength(1);
    expect(next.activeRound?.votes[0]?.userId).toBe(current.teamMembers[1]!.id);
    expect(next.activeRound?.votes[0]?.value).toBe("hidden");
    expect(next.liveSync.voteVersion).toBe(1);
  });

  it("applies indexed vote deltas in display order without touching untouched history", () => {
    const current = buildBoardState();
    const afterSecondMember = applyTeamRoundVoteUpdateToState(current, {
      teamId: "team-1",
      roundId: "round-1",
      changedMemberIndexes: [2],
      fromVoteVersion: 0,
      votedCount: 1,
      notVotedCount: 2,
      viewerVoteValue: null,
      liveSync: {
        teamId: "team-1",
        roundId: "round-1",
        roundVersion: 1,
        voteVersion: 1
      }
    });
    const afterCurrentUser = applyTeamRoundVoteUpdateToState(afterSecondMember, {
      teamId: "team-1",
      roundId: "round-1",
      changedMemberIndexes: [0],
      fromVoteVersion: 1,
      votedCount: 2,
      notVotedCount: 1,
      viewerVoteValue: "3",
      liveSync: {
        teamId: "team-1",
        roundId: "round-1",
        roundVersion: 1,
        voteVersion: 2
      }
    });

    expect(afterCurrentUser.history).toEqual(current.history);
    expect(afterCurrentUser.activeRound?.votes.map((vote) => vote.userId)).toEqual([current.teamMembers[0]!.id, current.teamMembers[2]!.id]);
    expect(afterCurrentUser.activeRound?.votes[0]?.value).toBe("3");
    expect(afterCurrentUser.activeRound?.votes[1]?.value).toBe("hidden");
  });

  it("requests a full repair GET when a vote delta version gap is detected", async () => {
    window.history.replaceState({}, "", "/?teamId=team-1");
    const boardState = buildBoardState();
    const requestedUrls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url === "/api/bootstrap") {
        return buildJsonResponse({ debugToolsEnabled: false, smtpConfigured: true, branding: BRANDING_MANIFEST });
      }
      if (url === "/api/auth/session") {
        return buildJsonResponse({
          user: boardState.currentUser,
          memberships: boardState.memberships,
          availableTeams: boardState.memberships
        });
      }
      if (url.startsWith("/api/auth/notifications")) {
        return buildJsonResponse({ active: [], history: [], pendingJoinRequests: [] });
      }
      if (url.startsWith("/api/teams/team-1/state?history=0")) {
        return buildJsonResponse(boardState);
      }
      if (url.startsWith("/api/teams/team-1/history")) {
        return buildJsonResponse({ history: { items: [], nextCursor: null } });
      }
      return buildJsonResponse({ error: `Unhandled request: ${url}` }, false);
    });

    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("WebSocket", WebSocketMock as unknown as typeof WebSocket);

    render(<App />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Delta Team" })).toBeInTheDocument());

    const teamSocket = WebSocketMock.instances.at(-1);
    expect(teamSocket).toBeTruthy();
    teamSocket!.emit({
      type: "team:round-vote",
      payload: {
        teamId: "team-1",
        roundId: "round-1",
        changedMemberIndexes: [1],
        fromVoteVersion: 4,
        votedCount: 1,
        notVotedCount: 2,
        viewerVoteValue: null,
        liveSync: {
          teamId: "team-1",
          roundId: "round-1",
          roundVersion: 1,
          voteVersion: 5
        }
      }
    });

    await waitFor(() =>
      expect(requestedUrls.some((url) => url.includes("/api/teams/team-1/state?history=0&reason=delta-version-gap"))).toBe(true)
    );
  });

  it("requests a full repair GET when a delta arrives before the board has current team state", async () => {
    window.history.replaceState({}, "", "/?teamId=team-1");
    const boardState = buildBoardState();
    const requestedUrls: string[] = [];
    let stateRequests = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url === "/api/bootstrap") {
        return buildJsonResponse({ debugToolsEnabled: false, smtpConfigured: true, branding: BRANDING_MANIFEST });
      }
      if (url === "/api/auth/session") {
        return buildJsonResponse({
          user: boardState.currentUser,
          memberships: boardState.memberships,
          availableTeams: boardState.memberships
        });
      }
      if (url.startsWith("/api/auth/notifications")) {
        return buildJsonResponse({ active: [], history: [], pendingJoinRequests: [] });
      }
      if (url.startsWith("/api/teams/team-1/state?history=0")) {
        stateRequests += 1;
        if (stateRequests === 1) {
          return new Promise((resolve) => {
            window.setTimeout(() => resolve(buildJsonResponse(boardState)), 80);
          });
        }
        return buildJsonResponse(boardState);
      }
      if (url.startsWith("/api/teams/team-1/history")) {
        return buildJsonResponse({ history: { items: [], nextCursor: null } });
      }
      return buildJsonResponse({ error: `Unhandled request: ${url}` }, false);
    });

    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("WebSocket", WebSocketMock as unknown as typeof WebSocket);

    render(<App />);

    await waitFor(() => expect(WebSocketMock.instances.length).toBeGreaterThan(0));
    const teamSocket = WebSocketMock.instances.at(-1);
    expect(teamSocket).toBeTruthy();
    teamSocket!.emit({
      type: "team:round-vote",
      payload: {
        teamId: "team-1",
        roundId: "round-1",
        changedMemberIndexes: [1],
        fromVoteVersion: 0,
        votedCount: 1,
        notVotedCount: 2,
        viewerVoteValue: null,
        liveSync: {
          teamId: "team-1",
          roundId: "round-1",
          roundVersion: 1,
          voteVersion: 1
        }
      }
    });

    await waitFor(() =>
      expect(requestedUrls.some((url) => url.includes("/api/teams/team-1/state?history=0&reason=delta-missing-current-state"))).toBe(true)
    );
  });
});
