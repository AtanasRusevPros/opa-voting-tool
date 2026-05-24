// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BRANDING_MANIFEST,
  DEFAULT_HISTORY_TIME_ZONE_KEYS,
  DEFAULT_HISTORY_TIME_ZONE_POPUP_ENABLED,
  type TeamMemberSummary,
  type TeamMembershipSummary,
  type TeamStateResponse,
  type UserSummary
} from "@planning-poker/shared";
import { TeamBoard } from "./App";

class ResizeObserverMock {
  observe() {}
  disconnect() {}
  unobserve() {}
}

function buildMembers(count: number): UserSummary[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `user-${index}`,
    email: `user-${index}@example-company.com`,
    displayName: `User ${index}`,
    avatarIconKey: BRANDING_MANIFEST.avatarIconKeys[index % BRANDING_MANIFEST.avatarIconKeys.length],
    avatarColorKey: BRANDING_MANIFEST.avatarColorKeys[index % BRANDING_MANIFEST.avatarColorKeys.length]
  }));
}

function buildMemberships(count: number): TeamMembershipSummary[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `team-${index}`,
    name: `Perf Team ${index}`,
    slug: `perf-team-${index}`,
    demo: false,
    deckKey: "fibonacci",
    fibonacciRangeStart: null,
    fibonacciRangeEnd: null,
    timerSeconds: 60,
    iconKey: "spark",
    logoOpacity: 0.9,
    backgroundOpacity: 0.18,
    historyTimezonePopupEnabled: DEFAULT_HISTORY_TIME_ZONE_POPUP_ENABLED,
    historyTimezoneKeys: [...DEFAULT_HISTORY_TIME_ZONE_KEYS],
    minimumVotePercentEnabled: false,
    minimumVotePercent: 75,
    archived: false,
    jiraProjectKey: null,
    jiraJql: null,
    lastActivityAt: "2026-04-06T12:00:00.000Z",
    memberCount: 80 + index,
    currentUserRole: "team_admin",
    joinRequestStatus: "none",
    lastOpenedAt: "2026-04-06T12:00:00.000Z"
  }));
}

function buildTeamMembers(count: number): TeamMemberSummary[] {
  return buildMembers(count).map((member, index) => ({
    ...member,
    role: index === 0 ? "team_admin" : "member",
    joinedAt: "2026-04-06T12:00:00.000Z",
    lastOpenedAt: "2026-04-06T12:00:00.000Z"
  }));
}

function buildTeamState(activeParticipantCount: number): TeamStateResponse {
  const team = buildMemberships(10)[0]!;
  const currentUser = buildMembers(1)[0]!;
  const activeParticipants = buildMembers(activeParticipantCount);
  const teamMembers = buildTeamMembers(activeParticipantCount);
  return {
    team,
    memberships: buildMemberships(10),
    availableTeams: buildMemberships(10),
    teamMembers,
    activeParticipants,
    pendingIssues: [],
    activeRound: null,
    history: [
      {
        id: "history-1",
        teamId: team.id,
        title: "Perf issue",
        deckKey: "fibonacci",
        fibonacciRangeStart: null,
        fibonacciRangeEnd: null,
        averageScore: 5,
        participantCount: activeParticipantCount,
        quorumBlocked: false,
        votedCount: activeParticipantCount,
        notVotedCount: 0,
        completedAt: "2026-04-06T12:00:00.000Z",
        votes: activeParticipants.slice(0, 3).map((member, index) => ({
          userId: member.id,
          displayName: member.displayName,
          avatarIconKey: member.avatarIconKey,
          avatarColorKey: member.avatarColorKey,
          value: ["3", "5", "8"][index] ?? "5"
        })),
        comments: []
      }
    ],
    currentUser: {
      ...currentUser,
      id: activeParticipants[0]!.id,
      displayName: "Current User",
      email: "current@example-company.com",
      isSuperAdmin: false,
      loginName: null,
      boardShortcutsEnabled: true
    },
    currentUserRole: "team_admin",
    liveSync: {
      teamId: team.id,
      roundId: null,
      roundVersion: 0,
      voteVersion: 0
    }
  };
}

function getPerfSnapshot() {
  return window.__PLANNING_POKER_PERF__?.snapshot() ?? {
    boardLayoutCalcs: 0,
    participantRingRenders: 0,
    memberTileRenders: 0,
    historyRailRenders: 0
  };
}

async function renderPerfBoard() {
  const noop = vi.fn(async () => {});
  const onOpenAccountSettings = vi.fn();
  const onOpenMemberDirectory = vi.fn();
  render(
    <TeamBoard
      state={buildTeamState(80)}
      onSelectTeam={vi.fn()}
      onOpenTeamChooser={vi.fn()}
      onOpenMemberDirectory={onOpenMemberDirectory}
      notificationFeed={null}
      onOpenNotifications={noop}
      onAdmitJoinRequest={noop}
      onDenyJoinRequest={noop}
      onAdmitPlatformAccessRequest={vi.fn(async () => ({
        user: buildTeamState(80).currentUser,
        invitedNewUser: true as const,
        invitationDelivery: "manual-share" as const,
        temporaryPassword: "temp-password",
        secureSaveReminder: "Save this password."
      }))}
      onDenyPlatformAccessRequest={noop}
      onCreateRound={noop}
      onVote={noop}
      onReveal={noop}
      onVoteAgain={noop}
      onAddHistoryComment={noop}
      onEditHistoryComment={noop}
      onDeleteHistoryComment={noop}
      onUpdateDeckSettings={noop}
      onUpdateTimer={noop}
      onUpdateHistoryTimezoneSettings={noop}
      onRenameTeam={noop}
      onLeaveCurrentTeam={noop}
      onOpenAccountSettings={onOpenAccountSettings}
      status={{ tone: "neutral", text: "Ready." }}
      isBusy={false}
    />
  );

  await waitFor(() => {
    const snapshot = getPerfSnapshot();
    expect(snapshot.boardLayoutCalcs).toBeGreaterThan(0);
    expect(snapshot.participantRingRenders).toBeGreaterThan(0);
    expect(snapshot.memberTileRenders).toBeGreaterThan(0);
    expect(snapshot.historyRailRenders).toBeGreaterThan(0);
  });

  window.__PLANNING_POKER_PERF__?.reset();
  return { onOpenAccountSettings, onOpenMemberDirectory };
}

function mockBoardShellWidth(width: number) {
  const shell = document.querySelector(".board-shell") as HTMLElement | null;
  expect(shell).not.toBeNull();
  Object.defineProperty(shell!, "getBoundingClientRect", {
    configurable: true,
    value: () =>
      ({
        width,
        height: 900,
        top: 0,
        left: 0,
        right: width,
        bottom: 900,
        x: 0,
        y: 0,
        toJSON: () => ({})
      }) satisfies DOMRect
  });
  return shell!;
}

function dispatchPointerLikeEvent(target: EventTarget, type: string, coords: { clientX?: number; clientY?: number }) {
  target.dispatchEvent(
    new MouseEvent(type, {
      bubbles: true,
      clientX: coords.clientX ?? 0,
      clientY: coords.clientY ?? 0
    })
  );
}

describe("TeamBoard performance boundaries", () => {
  beforeAll(() => {
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    HTMLElement.prototype.scrollTo = vi.fn();
  });

  beforeEach(() => {
    window.localStorage.clear();
    window.__PLANNING_POKER_PERF__?.reset();
  });

  it("applies and persists the remembered right-side history width", async () => {
    window.localStorage.setItem("planning-poker:history-rail-width", "640");
    await renderPerfBoard();

    const shell = document.querySelector(".board-shell") as HTMLElement | null;
    expect(shell).not.toBeNull();
    expect(shell?.style.getPropertyValue("--history-rail-width")).toBe("640px");
    expect(screen.getByRole("button", { name: "Resize issues list" })).toBeInTheDocument();
  });

  it("drags the right-side history width, clamps it, and persists the result", async () => {
    await renderPerfBoard();
    const shell = mockBoardShellWidth(1200);
    const handle = screen.getByRole("button", { name: "Resize issues list" });

    await act(async () => {
      dispatchPointerLikeEvent(handle, "pointerdown", { clientX: 600 });
      dispatchPointerLikeEvent(window, "pointermove", { clientX: 400 });
      dispatchPointerLikeEvent(window, "pointerup", { clientX: 400 });
    });

    await waitFor(() => expect(shell.style.getPropertyValue("--history-rail-width")).toBe("560px"));
    expect(window.localStorage.getItem("planning-poker:history-rail-width")).toBe("560");

    await act(async () => {
      dispatchPointerLikeEvent(handle, "pointerdown", { clientX: 600 });
      dispatchPointerLikeEvent(window, "pointermove", { clientX: -400 });
      dispatchPointerLikeEvent(window, "pointerup", { clientX: -400 });
    });

    await waitFor(() => expect(shell.style.getPropertyValue("--history-rail-width")).toBe("720px"));
    expect(window.localStorage.getItem("planning-poker:history-rail-width")).toBe("720");

    await act(async () => {
      dispatchPointerLikeEvent(handle, "pointerdown", { clientX: 600 });
      dispatchPointerLikeEvent(window, "pointermove", { clientX: 1200 });
      dispatchPointerLikeEvent(window, "pointerup", { clientX: 1200 });
    });

    await waitFor(() => expect(shell.style.getPropertyValue("--history-rail-width")).toBe("180px"));
    expect(window.localStorage.getItem("planning-poker:history-rail-width")).toBe("180");
  });

  it("hides the right-side divider once the stacked history layout breakpoint is active", async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 900
    });

    await renderPerfBoard();
    const shell = mockBoardShellWidth(900);
    const initialWidth = shell.style.getPropertyValue("--history-rail-width");

    expect(screen.queryByRole("button", { name: "Resize issues list" })).not.toBeInTheDocument();
    expect(shell.style.getPropertyValue("--history-rail-width")).toBe(initialWidth);
    expect(window.localStorage.getItem("planning-poker:history-rail-width")).toBe(initialWidth.replace("px", ""));

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: originalWidth
    });
  });

  it("shows a stacked history resize handle and clamps the bottom-row height in narrow layout", async () => {
    const originalWidth = window.innerWidth;
    const originalHeight = window.innerHeight;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 900
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 900
    });

    await renderPerfBoard();
    const shell = document.querySelector(".board-shell") as HTMLElement | null;
    const header = document.querySelector(".screen-header") as HTMLElement | null;
    expect(shell).not.toBeNull();
    expect(header).not.toBeNull();
    Object.defineProperty(shell!, "clientHeight", {
      configurable: true,
      value: 900
    });
    Object.defineProperty(header!, "offsetHeight", {
      configurable: true,
      value: 110
    });

    const handle = screen.getByRole("button", { name: "Resize issues list height" });
    expect(screen.queryByRole("button", { name: "Resize issues list" })).not.toBeInTheDocument();
    const initialHeight = Number.parseInt(shell!.style.getPropertyValue("--stacked-history-height"), 10);

    await act(async () => {
      dispatchPointerLikeEvent(handle, "pointerdown", { clientY: 500 });
      dispatchPointerLikeEvent(window, "pointermove", { clientY: 260 });
      dispatchPointerLikeEvent(window, "pointerup", { clientY: 260 });
    });

    await waitFor(() =>
      expect(Number.parseInt(shell!.style.getPropertyValue("--stacked-history-height"), 10)).toBeGreaterThan(initialHeight)
    );
    expect(Number.parseInt(window.localStorage.getItem("planning-poker:stacked-history-height") ?? "0", 10)).toBeGreaterThan(initialHeight);

    await act(async () => {
      dispatchPointerLikeEvent(handle, "pointerdown", { clientY: 500 });
      dispatchPointerLikeEvent(window, "pointermove", { clientY: 1000 });
      dispatchPointerLikeEvent(window, "pointerup", { clientY: 1000 });
    });

    await waitFor(() => expect(shell?.style.getPropertyValue("--stacked-history-height")).toBe("90px"));
    expect(window.localStorage.getItem("planning-poker:stacked-history-height")).toBe("90");

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: originalWidth
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: originalHeight
    });
  });

  it("opening Switch team does not rerender the participant ring or recalculate layout", async () => {
    await renderPerfBoard();

    fireEvent.click(screen.getByRole("button", { name: "Switch team" }));
    await waitFor(() => expect(screen.getByRole("menu", { name: "Switch team menu" })).toBeInTheDocument());

    expect(getPerfSnapshot()).toEqual({
      boardLayoutCalcs: 0,
      participantRingRenders: 0,
      memberTileRenders: 0,
      historyRailRenders: 0
    });
  });

  it("opening timer settings stays off the participant ring and history rail", async () => {
    await renderPerfBoard();

    fireEvent.click(screen.getByRole("button", { name: "Open team timer settings" }));
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Team timer settings" })).toBeInTheDocument());

    expect(getPerfSnapshot()).toEqual({
      boardLayoutCalcs: 0,
      participantRingRenders: 0,
      memberTileRenders: 0,
      historyRailRenders: 0
    });
  });

  it("opening team settings and profile editor avoids heavy board rerenders", async () => {
    const { onOpenAccountSettings } = await renderPerfBoard();

    fireEvent.click(screen.getByRole("button", { name: "Open team settings" }));
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Team settings" })).toBeInTheDocument());
    expect(getPerfSnapshot()).toEqual({
      boardLayoutCalcs: 0,
      participantRingRenders: 0,
      memberTileRenders: 0,
      historyRailRenders: 0
    });

    window.__PLANNING_POKER_PERF__?.reset();
    fireEvent.click(screen.getByRole("button", { name: "Edit profile" }));
    await waitFor(() => expect(onOpenAccountSettings).toHaveBeenCalledTimes(1));
    expect(getPerfSnapshot()).toEqual({
      boardLayoutCalcs: 0,
      participantRingRenders: 0,
      memberTileRenders: 0,
      historyRailRenders: 0
    });
  });

  it("opening members stays off the participant ring and history rail", async () => {
    const { onOpenMemberDirectory } = await renderPerfBoard();

    fireEvent.click(screen.getByRole("button", { name: "Team admin" }));
    await waitFor(() => expect(onOpenMemberDirectory).toHaveBeenCalledTimes(1));

    expect(getPerfSnapshot()).toEqual({
      boardLayoutCalcs: 0,
      participantRingRenders: 0,
      memberTileRenders: 0,
      historyRailRenders: 0
    });
  });

  it("another participant voting rerenders only the participant ring and the changed member tile", async () => {
    const noop = vi.fn(async () => {});
    const state: TeamStateResponse = {
      ...buildTeamState(80),
      activeRound: {
        id: "round-1",
        teamId: "team-0",
        title: "Perf active round",
        deckKey: "fibonacci",
        fibonacciRangeStart: null,
        fibonacciRangeEnd: null,
        status: "active",
        createdAt: "2026-04-06T12:05:00.000Z",
        timerStartedAt: null,
        timerExpiresAt: null,
        revealedAt: null,
        revealAverage: null,
        quorumBlocked: false,
        votedCount: 0,
        notVotedCount: 80,
        pendingIssueId: null,
        revoteHistoryEntryId: null,
        votes: []
      }
    };
    const nextState: TeamStateResponse = {
      ...state,
      activeRound: {
        ...state.activeRound!,
        votes: [
          {
            userId: "user-7",
            displayName: "User 7",
            avatarIconKey: BRANDING_MANIFEST.avatarIconKeys[7 % BRANDING_MANIFEST.avatarIconKeys.length],
            avatarColorKey: BRANDING_MANIFEST.avatarColorKeys[7 % BRANDING_MANIFEST.avatarColorKeys.length],
            value: "5"
          }
        ]
      }
    };

    const view = render(
      <TeamBoard
        state={state}
        onSelectTeam={vi.fn()}
        onOpenTeamChooser={vi.fn()}
        onOpenMemberDirectory={vi.fn()}
        notificationFeed={null}
        onOpenNotifications={noop}
        onAdmitJoinRequest={noop}
        onDenyJoinRequest={noop}
        onAdmitPlatformAccessRequest={vi.fn(async () => ({
          user: state.currentUser,
          invitedNewUser: true as const,
          invitationDelivery: "manual-share" as const,
          temporaryPassword: "temp-password",
          secureSaveReminder: "Save this password."
        }))}
        onDenyPlatformAccessRequest={noop}
        onCreateRound={noop}
        onVote={noop}
        onReveal={noop}
        onVoteAgain={noop}
        onAddHistoryComment={noop}
        onEditHistoryComment={noop}
        onDeleteHistoryComment={noop}
        onUpdateDeckSettings={noop}
        onUpdateTimer={noop}
        onUpdateHistoryTimezoneSettings={noop}
        onRenameTeam={noop}
        onLeaveCurrentTeam={noop}
        onOpenAccountSettings={vi.fn()}
        status={{ tone: "neutral", text: "Ready." }}
        isBusy={false}
      />
    );

    await waitFor(() => expect(getPerfSnapshot().memberTileRenders).toBeGreaterThan(0));

    window.__PLANNING_POKER_PERF__?.reset();
    view.rerender(
      <TeamBoard
        state={nextState}
        onSelectTeam={vi.fn()}
        onOpenTeamChooser={vi.fn()}
        onOpenMemberDirectory={vi.fn()}
        notificationFeed={null}
        onOpenNotifications={noop}
        onAdmitJoinRequest={noop}
        onDenyJoinRequest={noop}
        onAdmitPlatformAccessRequest={vi.fn(async () => ({
          user: state.currentUser,
          invitedNewUser: true as const,
          invitationDelivery: "manual-share" as const,
          temporaryPassword: "temp-password",
          secureSaveReminder: "Save this password."
        }))}
        onDenyPlatformAccessRequest={noop}
        onCreateRound={noop}
        onVote={noop}
        onReveal={noop}
        onVoteAgain={noop}
        onAddHistoryComment={noop}
        onEditHistoryComment={noop}
        onDeleteHistoryComment={noop}
        onUpdateDeckSettings={noop}
        onUpdateTimer={noop}
        onUpdateHistoryTimezoneSettings={noop}
        onRenameTeam={noop}
        onLeaveCurrentTeam={noop}
        onOpenAccountSettings={vi.fn()}
        status={{ tone: "neutral", text: "Ready." }}
        isBusy={false}
      />
    );

    await waitFor(() =>
      expect(getPerfSnapshot()).toEqual({
        boardLayoutCalcs: 0,
        participantRingRenders: 1,
        memberTileRenders: 1,
        historyRailRenders: 0
      })
    );
  });
});
