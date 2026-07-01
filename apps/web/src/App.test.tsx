// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, describe, vi } from "vitest";
import App, {
  HistoryTimestamp,
  TeamBoard,
  applyOptimisticVoteToTeamState,
  applyTeamRoundUpdateToState,
  applyTeamRoundVoteUpdateToState,
  calculateBoardLayout,
  computeBoardSizingState,
  formatHistoryDisplay,
  formatTimeZoneOffsetLabel,
  getHistoryTooltipRows,
  layoutMembersForBoard,
  pickRandomAvatarSelection,
  shouldApplyTeamState
} from "./App";
import { AdminSettingsModal } from "./app/AdminSettingsModal";
import { TeamChooser } from "./app/TeamChooser";
import { TeamDirectoryModal } from "./app/TeamDirectoryModal";
import { BRANDING_MANIFEST, DECKS, DEFAULT_DECK_KEY, DEFAULT_HISTORY_TIME_ZONE_KEYS, TEAM_TIMER_OPTIONS, type TeamStateResponse, type UserSummary } from "@planning-poker/shared";

const TEST_GEOMETRY = {
  width: 1160,
  height: 1160,
  edgePadding: 24,
  centerPadding: 18,
  centerRect: {
    left: 400,
    top: 435,
    right: 760,
    bottom: 725
  },
  normalTile: { width: 90, height: 126 },
  compactTile: { width: 78, height: 108 },
  overflowSeed: "test-team"
};

function buildTestGeometry(width: number, height: number) {
  return {
    width,
    height,
    edgePadding: 12,
    centerPadding: 18,
    centerRect: {
      left: Math.round(width * 0.38),
      top: Math.round(height * 0.34),
      right: Math.round(width * 0.62),
      bottom: Math.round(height * 0.66)
    },
    normalTile: { width: 90, height: 126 },
    compactTile: { width: 78, height: 108 },
    overflowSeed: `${width}x${height}`
  };
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

function buildBoardState(overrides?: Partial<TeamStateResponse>): TeamStateResponse {
  const members = buildMembers(3);
  return {
    team: {
      id: "team-1",
      name: "Keyboard Team",
      slug: "keyboard-team",
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
      lastActivityAt: "2026-04-13T08:00:00.000Z"
    },
    memberships: [
      {
        id: "team-1",
        name: "Keyboard Team",
        slug: "keyboard-team",
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
        lastActivityAt: "2026-04-13T08:00:00.000Z",
        memberCount: 3,
        currentUserRole: "team_admin",
        joinRequestStatus: "none",
        lastOpenedAt: "2026-04-13T08:05:00.000Z"
      }
    ],
    availableTeams: [],
    teamMembers: members.map((member, index) => ({
      ...member,
      role: index === 0 ? "team_admin" : "member",
      joinedAt: "2026-04-13T08:00:00.000Z",
      lastOpenedAt: "2026-04-13T08:05:00.000Z"
    })),
    activeParticipants: members,
    pendingIssues: [],
    activeRound: {
      id: "round-1",
      teamId: "team-1",
      title: "ISSUE-5000",
      deckKey: "fibonacci-21",
      fibonacciRangeStart: null,
      fibonacciRangeEnd: null,
      status: "active",
      createdAt: "2026-04-13T08:10:00.000Z",
      timerStartedAt: null,
      timerExpiresAt: null,
      revealedAt: null,
      revealAverage: null,
      quorumBlocked: false,
      votedCount: 0,
      notVotedCount: 0,
      pendingIssueId: null,
      revoteHistoryEntryId: null,
      votes: []
    },
    history: [
      {
        id: "history-1",
        teamId: "team-1",
        title: "Previous issue",
        deckKey: "fibonacci-21",
        fibonacciRangeStart: null,
        fibonacciRangeEnd: null,
        averageScore: 5,
        participantCount: 3,
        quorumBlocked: false,
        votedCount: 3,
        notVotedCount: 0,
        completedAt: "2026-04-12T08:00:00.000Z",
        votes: [
          {
            userId: members[0]!.id,
            displayName: members[0]!.displayName,
            avatarIconKey: members[0]!.avatarIconKey,
            avatarColorKey: members[0]!.avatarColorKey,
            value: "5"
          }
        ],
        comments: []
      }
    ],
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
    serverTime: "2026-04-13T08:10:00.000Z",
    ...overrides
  };
}

function isNotificationsGetUrl(url: string) {
  return url.startsWith("/api/auth/notifications") && !url.startsWith("/api/auth/notifications/seen");
}

function isNotificationsSeenUrl(url: string) {
  return url.startsWith("/api/auth/notifications/seen");
}

function buildPlatformAccessActionResponse(user?: UserSummary) {
  return {
    user: user ?? buildBoardState().currentUser,
    invitedNewUser: true as const,
    invitationDelivery: "manual-share" as const,
    temporaryPassword: "temp-password",
    secureSaveReminder: "Save this password."
  };
}

function placementRect(placement: { left: number; top: number; compact: boolean }) {
  const tile = placement.compact ? TEST_GEOMETRY.compactTile : TEST_GEOMETRY.normalTile;
  return {
    left: placement.left,
    top: placement.top,
    right: placement.left + tile.width,
    bottom: placement.top + tile.height
  };
}

function intersects(a: ReturnType<typeof placementRect>, b: ReturnType<typeof placementRect>) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function countOverlapsForGeometry(
  placements: Array<{ left: number; top: number; compact: boolean }>,
  geometry: { normalTile: { width: number; height: number }; compactTile: { width: number; height: number } }
) {
  const rects = placements.map((placement) => {
    const tile = placement.compact ? geometry.compactTile : geometry.normalTile;
    return {
      left: placement.left,
      top: placement.top,
      right: placement.left + tile.width,
      bottom: placement.top + tile.height
    };
  });
  let count = 0;
  for (let index = 0; index < rects.length; index += 1) {
    for (let compareIndex = index + 1; compareIndex < rects.length; compareIndex += 1) {
      if (intersects(rects[index]!, rects[compareIndex]!)) {
        count += 1;
      }
    }
  }
  return count;
}

function buildJsonResponse(body: unknown, ok = true) {
  return Promise.resolve({
    ok,
    json: async () => body
  } as Response);
}

function buildHistoryPage(items: TeamStateResponse["history"] = []) {
  return {
    history: {
      items,
      nextCursor: null
    }
  };
}

describe("App", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows the login screen by default", () => {
    render(<App />);
    expect(screen.getByText("OPA Voting Tool")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Admin" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue with password" })).not.toBeInTheDocument();
  });

  it("formats history timestamps without mixing incompatible Intl options", () => {
    const display = formatHistoryDisplay("2026-04-03T12:34:00.000Z");

    expect(display.heading).toContain("2026");
    expect(display.tooltip).toContain("GMT:");
    expect(display.tooltip).toContain("USA - Davidson:");
    expect(display.tooltip).toContain("India - Pune:");
    expect(display.tooltip).toContain("Bulgaria - Sofia:");
  });

  it("formats only the selected history timestamp time zones", () => {
    const rows = getHistoryTooltipRows("2026-04-03T12:34:00.000Z", ["gmt", "japan-tokyo"]);

    expect(rows.map((row) => row.label)).toEqual(["GMT", "Japan - Tokyo"]);
  });

  it("formats GMT offsets for whole-hour and half-hour time zones", () => {
    const summerDate = new Date("2026-07-01T12:00:00.000Z");

    expect(formatTimeZoneOffsetLabel("Etc/GMT", summerDate)).toBe("GMT +00");
    expect(formatTimeZoneOffsetLabel("Europe/Sofia", summerDate)).toBe("GMT +03");
    expect(formatTimeZoneOffsetLabel("America/New_York", summerDate)).toBe("GMT -04");
    expect(formatTimeZoneOffsetLabel("Asia/Kolkata", summerDate)).toBe("GMT +05:30");
  });

  it("hides the old profile title and keeps the login hint intact", () => {
    render(<App />);
    expect(screen.queryByText("Profile shown to your team")).not.toBeInTheDocument();
    expect(screen.getByText(/remembered automatically for 3 months of activity/i)).toBeInTheDocument();
  });

  it("does not render the old board subtitle copy on the login screen", () => {
    render(<App />);
    expect(screen.queryByText(/^Voting:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/joined to team/i)).not.toBeInTheDocument();
  });

  it("exposes the refreshed mixed avatar picker set through the branding manifest", () => {
    expect(BRANDING_MANIFEST.avatarIconKeys.length).toBeGreaterThan(40);
    expect(BRANDING_MANIFEST.avatarColorKeys.length).toBeGreaterThan(8);
  });

  it("keeps both Fibonacci variants and the new linear decks available", () => {
    expect(DECKS.some((deck) => deck.key === "fibonacci")).toBe(true);
    expect(DECKS.some((deck) => deck.key === "fibonacci-21")).toBe(true);
    expect(DECKS.some((deck) => deck.key === "linear-1-6")).toBe(true);
    expect(DECKS.some((deck) => deck.key === "linear-1-8")).toBe(true);
    expect(DECKS.some((deck) => deck.key === "linear-1-10")).toBe(true);
  });

  it("uses Fibonacci 1-21 as the default numbering system", () => {
    expect(DEFAULT_DECK_KEY).toBe("fibonacci-21");
  });

  it("exposes the supported team timer options for persisted countdown settings", () => {
    expect(TEAM_TIMER_OPTIONS).toEqual([10, 20, 30, 40, 50, 60, 90, 120, 150, 180]);
  });

  it("picks a valid random default avatar selection for first-time sign-in", () => {
    const avatar = pickRandomAvatarSelection();
    expect(BRANDING_MANIFEST.avatarIconKeys).toContain(avatar.avatarIconKey);
    expect(BRANDING_MANIFEST.avatarColorKeys).toContain(avatar.avatarColorKey);
  });

  it("uses layered perimeter placement when the room gets very large", () => {
    const members = buildMembers(200);

    const placements = layoutMembersForBoard(members, TEST_GEOMETRY);
    expect(placements).toHaveLength(200);
    expect(new Set(placements.map((placement) => placement.member.id)).size).toBe(200);
    expect(placements.some((placement) => placement.layer > 0)).toBe(true);
    expect(placements.some((placement) => placement.ring === 2)).toBe(true);
  });

  it("keeps the first ring evenly distributed around the perimeter", () => {
    const members = buildMembers(8);

    const placements = layoutMembersForBoard(members, TEST_GEOMETRY);
    const counts = placements.reduce<Record<string, number>>((accumulator, placement) => {
      accumulator[placement.side] = (accumulator[placement.side] ?? 0) + 1;
      return accumulator;
    }, {});

    expect(counts).toEqual({
      top: 2,
      right: 2,
      bottom: 2,
      left: 2
    });
  });

  it("keeps a partially filled second ring evenly distributed and outside the center-safe zone", () => {
    const members = buildMembers(23);

    const placements = layoutMembersForBoard(members, TEST_GEOMETRY);
    const ringTwoPlacements = placements.filter((placement) => placement.ring === 2);
    const ringTwoSides = new Set(ringTwoPlacements.map((placement) => placement.side));
    const centerSafe = {
      left: TEST_GEOMETRY.centerRect.left - TEST_GEOMETRY.centerPadding,
      top: TEST_GEOMETRY.centerRect.top - TEST_GEOMETRY.centerPadding,
      right: TEST_GEOMETRY.centerRect.right + TEST_GEOMETRY.centerPadding,
      bottom: TEST_GEOMETRY.centerRect.bottom + TEST_GEOMETRY.centerPadding
    };

    expect(ringTwoPlacements.length).toBeGreaterThan(0);
    expect(ringTwoSides.size).toBeGreaterThanOrEqual(3);
    expect(
      placements.every((placement) => {
        const box = placementRect(placement);
        return !intersects(box, centerSafe);
      })
    ).toBe(true);
  });

  it("keeps an 11-person room spread across the perimeter before overlap starts", () => {
    const members = buildMembers(11);

    const placements = layoutMembersForBoard(members, TEST_GEOMETRY);
    const sideCounts = placements.reduce<Record<string, number>>((accumulator, placement) => {
      accumulator[placement.side] = (accumulator[placement.side] ?? 0) + 1;
      return accumulator;
    }, {});

    const counts = Object.values(sideCounts);
    expect(placements.every((placement) => placement.layer === 0)).toBe(true);
    expect(Object.keys(sideCounts)).toHaveLength(4);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(2);
  });

  it("keeps a 16-person room on ring 1 only and balanced within side capacities", () => {
    const members = buildMembers(16);

    const placements = layoutMembersForBoard(members, TEST_GEOMETRY);
    const sideCounts = placements.reduce<Record<string, number>>((accumulator, placement) => {
      accumulator[placement.side] = (accumulator[placement.side] ?? 0) + 1;
      return accumulator;
    }, {});

    expect(placements.every((placement) => placement.ring === 1)).toBe(true);
    expect(sideCounts).toEqual({
      top: 5,
      right: 3,
      bottom: 5,
      left: 3
    });
  });

  it("keeps a 25-person room split across two rings before overlap starts", () => {
    const members = buildMembers(25);

    const placements = layoutMembersForBoard(members, TEST_GEOMETRY);
    const ringOne = placements.filter((placement) => placement.ring === 1);
    const ringTwo = placements.filter((placement) => placement.ring === 2);
    const ringOneBoxes = ringOne.map(placementRect);
    const ringTwoBoxes = ringTwo.map(placementRect);

    expect(placements.every((placement) => placement.layer === 0)).toBe(true);
    expect(ringOne.length).toBeGreaterThan(0);
    expect(ringTwo.length).toBeGreaterThan(0);
    expect(ringTwoBoxes.some((ringTwoBox) => ringOneBoxes.every((ringOneBox) => !intersects(ringOneBox, ringTwoBox)))).toBe(true);
    expect(ringOneBoxes.every((ringOneBox) => ringTwoBoxes.every((ringTwoBox) => !intersects(ringOneBox, ringTwoBox)))).toBe(true);
  });

  it("keeps a 21-person room non-overlapping before introducing overlap", () => {
    const members = buildMembers(21);

    const layout = calculateBoardLayout(members, TEST_GEOMETRY);

    expect(layout.mode === "enough" || layout.mode === "compact").toBe(true);
    expect(layout.placements.every((placement) => placement.layer === 0)).toBe(true);
  });

  it("only introduces ring 3 before overflow and keeps overflow stable", () => {
    const members = buildMembers(80);

    const first = calculateBoardLayout(members, TEST_GEOMETRY);
    const second = calculateBoardLayout(members, TEST_GEOMETRY);

    expect(first.placements.some((placement) => placement.ring === 3)).toBe(true);
    expect(first.mode === "overlap" || first.mode === "overflow").toBe(true);
    expect(second.placements.filter((placement) => placement.layer > 0)).toEqual(first.placements.filter((placement) => placement.layer > 0));
  });

  it("keeps 16 users non-overlapping on a compensated 1240x924-style geometry", () => {
    const geometry = buildTestGeometry(1240, 924);
    const layout = calculateBoardLayout(buildMembers(16), geometry);

    expect(countOverlapsForGeometry(layout.placements, geometry)).toBe(0);
  });

  it("keeps 21 users non-overlapping on a compensated 1880x980-style geometry", () => {
    const geometry = buildTestGeometry(1880, 980);
    const layout = calculateBoardLayout(buildMembers(21), geometry);

    expect(countOverlapsForGeometry(layout.placements, geometry)).toBe(0);
  });

  it("keeps 31 users on normal-size cards when a super-wide board has enough space", () => {
    const geometry = buildTestGeometry(2440, 960);
    const layout = calculateBoardLayout(buildMembers(31), geometry);

    expect(layout.mode).toBe("enough");
    expect(layout.placements).toHaveLength(31);
    expect(layout.placements.every((placement) => !placement.compact)).toBe(true);
    expect(countOverlapsForGeometry(layout.placements, geometry)).toBe(0);
  });

  it("keeps 80 users on normal-size cards when a very large super-wide board has enough perimeter space", () => {
    const geometry = buildTestGeometry(2558, 1322);
    const layout = calculateBoardLayout(buildMembers(80), geometry);

    expect(layout.mode).toBe("enough");
    expect(layout.placements).toHaveLength(80);
    expect(layout.placements.every((placement) => !placement.compact)).toBe(true);
    expect(countOverlapsForGeometry(layout.placements, geometry)).toBe(0);
  });

  it("keeps 21 users non-overlapping on a compensated 940x1080 narrow-tall geometry", () => {
    const geometry = buildTestGeometry(940, 1080);
    const layout = calculateBoardLayout(buildMembers(21), geometry);

    expect(countOverlapsForGeometry(layout.placements, geometry)).toBe(0);
  });

  it("uses top and bottom capacity before overlap on a constrained widescreen geometry", () => {
    const geometry = buildTestGeometry(1420, 757);
    const layout = calculateBoardLayout(buildMembers(11), geometry);
    const sideCounts = layout.placements.reduce<Record<string, number>>((accumulator, placement) => {
      accumulator[placement.side] = (accumulator[placement.side] ?? 0) + 1;
      return accumulator;
    }, {});

    expect(countOverlapsForGeometry(layout.placements, geometry)).toBe(0);
    expect((sideCounts.top ?? 0) + (sideCounts.bottom ?? 0)).toBeGreaterThanOrEqual(6);
  });

  it("keeps extra-small laptop geometry bounded and uses multiple sides before overflow", () => {
    const geometry = buildTestGeometry(756, 430);
    const layout = calculateBoardLayout(buildMembers(21), geometry);
    const sideCounts = layout.placements.reduce<Record<string, number>>((accumulator, placement) => {
      accumulator[placement.side] = (accumulator[placement.side] ?? 0) + 1;
      return accumulator;
    }, {});

    expect(layout.placements).toHaveLength(21);
    expect(layout.mode).not.toBe("overflow");
    expect(Object.keys(sideCounts).length).toBeGreaterThanOrEqual(3);
  });

  it("keeps medium and large rooms deterministic while spreading across rings", () => {
    for (const count of [30, 50, 80]) {
      const layout = calculateBoardLayout(buildMembers(count), buildTestGeometry(1320, 760));
      const secondLayout = calculateBoardLayout(buildMembers(count), buildTestGeometry(1320, 760));
      const usedRings = new Set(layout.placements.map((placement) => placement.ring));

      expect(layout.placements).toHaveLength(count);
      expect(usedRings.size).toBeGreaterThanOrEqual(2);
      expect(secondLayout.placements.map((placement) => `${placement.left}:${placement.top}:${placement.ring}:${placement.side}`)).toEqual(
        layout.placements.map((placement) => `${placement.left}:${placement.top}:${placement.ring}:${placement.side}`)
      );
    }
  });

  it("uses hysteresis to avoid board scroll oscillation near the height threshold", () => {
    const initial = computeBoardSizingState(535, 540, 799, null);
    const nearThreshold = computeBoardSizingState(548, 540, 799, initial);
    const comfortablyClear = computeBoardSizingState(565, 540, 799, nearThreshold);

    expect(initial).toEqual({
      needsScroll: true,
      stageHeight: 540
    });
    expect(nearThreshold).toEqual({
      needsScroll: true,
      stageHeight: 548
    });
    expect(comfortablyClear).toEqual({
      needsScroll: false,
      stageHeight: 565
    });
  });

  it("disables board scroll entirely once the viewport height reaches 800px", () => {
    const sizing = computeBoardSizingState(430, 540, 800, null);

    expect(sizing).toEqual({
      needsScroll: false,
      stageHeight: 430
    });
  });

  it("shows the history timestamp tooltip only when the date text is hovered", () => {
    const { container } = render(
      <HistoryTimestamp
        heading="Apr 8, 2026"
        tooltipRows={[
          { label: "GMT", value: "10:00" },
          { label: "Sofia", value: "13:00" }
        ]}
      />
    );

    fireEvent.mouseEnter(container.querySelector(".history-timestamp")!);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.mouseEnter(screen.getByRole("button", { name: /apr 8, 2026/i }));

    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    expect(screen.getByText("GMT")).toBeInTheDocument();
    expect(screen.getByText("Sofia")).toBeInTheDocument();
  });

  it("does not show the history timestamp tooltip when the team setting disables it", () => {
    render(
      <HistoryTimestamp
        heading="Apr 8, 2026"
        enabled={false}
        tooltipRows={[
          { label: "GMT", value: "10:00" },
          { label: "Sofia", value: "13:00" }
        ]}
      />
    );

    expect(screen.queryByRole("button", { name: /apr 8, 2026/i })).not.toBeInTheDocument();
    fireEvent.mouseEnter(screen.getByText("Apr 8, 2026"));

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("locks the email on the code step and re-enables editing after going back", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url === "/api/bootstrap") {
        return buildJsonResponse({ debugToolsEnabled: false, smtpConfigured: true });
      }
      if (url === "/api/auth/session") {
        return buildJsonResponse({ error: "Unauthorized" }, false);
      }
      if (url === "/api/auth/request-code") {
        return buildJsonResponse({
          ok: true,
          delivery: "smtp",
          suggestedDisplayName: "John",
          suggestedAvatarIconKey: BRANDING_MANIFEST.avatarIconKeys[0],
          suggestedAvatarColorKey: BRANDING_MANIFEST.avatarColorKeys[0]
        });
      }
      if (url === "/api/auth/request-password-reset" && init?.method === "POST") {
        return buildJsonResponse({
          ok: true,
          manualAdminReset: false,
          debugCode: "654321",
          suggestedDisplayName: "John",
          suggestedAvatarIconKey: BRANDING_MANIFEST.avatarIconKeys[0],
          suggestedAvatarColorKey: BRANDING_MANIFEST.avatarColorKeys[0]
        });
      }
      return buildJsonResponse({ error: `Unhandled test request: ${url}` }, false);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    const emailInput = screen.getByLabelText("Email") as HTMLInputElement;
    fireEvent.change(emailInput, { target: { value: "john.smith@example.com" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Forgot password" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Forgot password" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Finish setup" })).toBeInTheDocument());
    expect(screen.getByLabelText("Email")).toHaveAttribute("readonly");
    expect(emailInput).toHaveValue("john.smith@example.com");

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Forgot password" })).toBeInTheDocument());
    const editableEmailInput = screen.getByLabelText("Email") as HTMLInputElement;
    expect(editableEmailInput).not.toHaveAttribute("readonly");

    fireEvent.change(editableEmailInput, { target: { value: "jane@example.com" } });
    expect(editableEmailInput).toHaveValue("jane@example.com");
  });

  it("shows the dedicated super-admin sign-in entry on the login screen", () => {
    render(<App />);

    expect(screen.getByRole("button", { name: "Admin" })).toBeInTheDocument();
  });

  it("switches into the dedicated super-admin login mode from the main sign-in screen", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Admin" }));

    expect(screen.getByLabelText("Admin username")).toBeInTheDocument();
    expect(screen.getByLabelText("Admin password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Admin sign in" })).toBeDisabled();
  });

  it("renders approval-based chooser states for joined, pending, archived, and requestable teams", async () => {
    window.history.replaceState({}, "", "/?view=teams");

    class WebSocketMock {
      close() {}
    }

    const memberships = [
      {
        id: "team-joined",
        name: "Joined Team",
        slug: "joined-team",
        deckKey: "fibonacci-21",
        fibonacciRangeStart: null,
        fibonacciRangeEnd: null,
        timerSeconds: null,
        iconKey: "orbit",
        logoOpacity: 0.18,
        backgroundOpacity: 0.12,
        historyTimezonePopupEnabled: true,
        historyTimezoneKeys: [...DEFAULT_HISTORY_TIME_ZONE_KEYS],
        archived: false,
        lastActivityAt: "2026-04-12T18:00:00.000Z",
        memberCount: 7,
        currentUserRole: "team_admin" as const,
        joinRequestStatus: "none" as const,
        lastOpenedAt: "2026-04-12T18:05:00.000Z"
      }
    ];
    const availableTeams = [
      memberships[0]!,
      {
        id: "team-pending",
        name: "Pending Team",
        slug: "pending-team",
        deckKey: "fibonacci-21",
        fibonacciRangeStart: null,
        fibonacciRangeEnd: null,
        timerSeconds: null,
        iconKey: "orbit",
        logoOpacity: 0.18,
        backgroundOpacity: 0.12,
        historyTimezonePopupEnabled: true,
        historyTimezoneKeys: [...DEFAULT_HISTORY_TIME_ZONE_KEYS],
        archived: false,
        lastActivityAt: "2026-04-12T17:00:00.000Z",
        memberCount: 5,
        currentUserRole: "none" as const,
        joinRequestStatus: "pending" as const,
        lastOpenedAt: null
      },
      {
        id: "team-archived",
        name: "Archived Team",
        slug: "archived-team",
        deckKey: "fibonacci-21",
        fibonacciRangeStart: null,
        fibonacciRangeEnd: null,
        timerSeconds: null,
        iconKey: "orbit",
        logoOpacity: 0.18,
        backgroundOpacity: 0.12,
        historyTimezonePopupEnabled: true,
        historyTimezoneKeys: [...DEFAULT_HISTORY_TIME_ZONE_KEYS],
        archived: true,
        lastActivityAt: "2026-04-12T16:00:00.000Z",
        memberCount: 12,
        currentUserRole: "none" as const,
        joinRequestStatus: "none" as const,
        lastOpenedAt: null
      },
      {
        id: "team-request",
        name: "Request Team",
        slug: "request-team",
        deckKey: "fibonacci-21",
        fibonacciRangeStart: null,
        fibonacciRangeEnd: null,
        timerSeconds: null,
        iconKey: "orbit",
        logoOpacity: 0.18,
        backgroundOpacity: 0.12,
        historyTimezonePopupEnabled: true,
        historyTimezoneKeys: [...DEFAULT_HISTORY_TIME_ZONE_KEYS],
        archived: false,
        lastActivityAt: "2026-04-12T15:00:00.000Z",
        memberCount: 9,
        currentUserRole: "none" as const,
        joinRequestStatus: "none" as const,
        lastOpenedAt: null
      }
    ];

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url === "/api/bootstrap") {
        return buildJsonResponse({ debugToolsEnabled: false });
      }
      if (url === "/api/auth/session") {
        return buildJsonResponse({
          user: {
            id: "user-1",
            email: "owner@example-company.com",
            displayName: "Owner",
            avatarIconKey: BRANDING_MANIFEST.avatarIconKeys[0],
            avatarColorKey: BRANDING_MANIFEST.avatarColorKeys[0],
            boardShortcutsEnabled: true,
            isSuperAdmin: false,
            loginName: null
          },
          memberships,
          availableTeams,
          token: "session-token"
        });
      }
      if (isNotificationsGetUrl(url)) {
        return buildJsonResponse({
          active: [],
          history: [],
          pendingJoinRequests: []
        });
      }
      return buildJsonResponse({ error: `Unhandled test request: ${url}` }, false);
    });

    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("WebSocket", WebSocketMock as unknown as typeof WebSocket);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Your teams")).toBeInTheDocument());

    expect(screen.getAllByText("Open")[0]).toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pending" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Archived" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Request access" })).toBeInTheDocument();
  });

  it("lets the super-admin open visible teams without requesting access", async () => {
    window.history.replaceState({}, "", "/?view=teams");

    class WebSocketMock {
      close() {}
    }

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url === "/api/bootstrap") {
        return buildJsonResponse({ debugToolsEnabled: false });
      }
      if (url === "/api/auth/session") {
        return buildJsonResponse({
          user: {
            id: "super-admin",
            email: "platform-admin@admin.local",
            displayName: "Platform Admin",
            avatarIconKey: BRANDING_MANIFEST.avatarIconKeys[0],
            avatarColorKey: BRANDING_MANIFEST.avatarColorKeys[0],
            isSuperAdmin: true,
            loginName: "platform-admin"
          },
          memberships: [],
          availableTeams: [
            {
              id: "visible-team",
              name: "Visible Team",
              slug: "visible-team",
              deckKey: "fibonacci-21",
              fibonacciRangeStart: null,
              fibonacciRangeEnd: null,
              timerSeconds: null,
              iconKey: "orbit",
              logoOpacity: 0.18,
              backgroundOpacity: 0.12,
              historyTimezonePopupEnabled: true,
              historyTimezoneKeys: [...DEFAULT_HISTORY_TIME_ZONE_KEYS],
              archived: false,
              lastActivityAt: "2026-04-12T19:00:00.000Z",
              memberCount: 14,
              currentUserRole: "none" as const,
              joinRequestStatus: "none" as const,
              lastOpenedAt: null
            }
          ],
          token: "session-token"
        });
      }
      if (isNotificationsGetUrl(url)) {
        return buildJsonResponse({
          active: [],
          history: [],
          pendingJoinRequests: []
        });
      }
      return buildJsonResponse({ error: `Unhandled test request: ${url}` }, false);
    });

    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("WebSocket", WebSocketMock as unknown as typeof WebSocket);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Visible Team")).toBeInTheDocument());

    expect(screen.getByText(/super-admin/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Request access" })).not.toBeInTheDocument();
  });

  it("keeps the super-admin on the chooser by default even when already a member of teams", async () => {
    class WebSocketMock {
      close() {}
    }

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url === "/api/bootstrap") {
        return buildJsonResponse({ debugToolsEnabled: false, branding: BRANDING_MANIFEST });
      }
      if (url === "/api/auth/session") {
        return buildJsonResponse({
          user: {
            id: "super-admin",
            email: "platform-admin@admin.local",
            displayName: "Platform Admin",
            avatarIconKey: BRANDING_MANIFEST.avatarIconKeys[0],
            avatarColorKey: BRANDING_MANIFEST.avatarColorKeys[0],
            isSuperAdmin: true,
            loginName: "platform-admin"
          },
          memberships: [
            {
              id: "team-a",
              name: "Alpha Team",
              slug: "alpha-team",
              deckKey: "fibonacci-21",
              fibonacciRangeStart: null,
              fibonacciRangeEnd: null,
              timerSeconds: null,
              iconKey: "orbit",
              logoOpacity: 0.18,
              backgroundOpacity: 0.12,
              historyTimezonePopupEnabled: true,
              historyTimezoneKeys: [...DEFAULT_HISTORY_TIME_ZONE_KEYS],
              archived: false,
              lastActivityAt: "2026-04-15T19:00:00.000Z",
              memberCount: 8,
              currentUserRole: "team_admin" as const,
              joinRequestStatus: "none" as const,
              lastOpenedAt: null
            }
          ],
          availableTeams: [
            {
              id: "team-a",
              name: "Alpha Team",
              slug: "alpha-team",
              deckKey: "fibonacci-21",
              fibonacciRangeStart: null,
              fibonacciRangeEnd: null,
              timerSeconds: null,
              iconKey: "orbit",
              logoOpacity: 0.18,
              backgroundOpacity: 0.12,
              historyTimezonePopupEnabled: true,
              historyTimezoneKeys: [...DEFAULT_HISTORY_TIME_ZONE_KEYS],
              archived: false,
              lastActivityAt: "2026-04-15T19:00:00.000Z",
              memberCount: 8,
              currentUserRole: "team_admin" as const,
              joinRequestStatus: "none" as const,
              lastOpenedAt: null
            }
          ],
          token: "session-token"
        });
      }
      if (isNotificationsGetUrl(url)) {
        return buildJsonResponse({
          active: [],
          history: [],
          pendingJoinRequests: []
        });
      }
      return buildJsonResponse({ error: `Unhandled test request: ${url}` }, false);
    });

    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("WebSocket", WebSocketMock as unknown as typeof WebSocket);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Your teams")).toBeInTheDocument());

    expect(screen.getByRole("button", { name: "Platform settings" })).toBeInTheDocument();
    expect(screen.getByText("Alpha Team")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Alpha Team" })).not.toBeInTheDocument();
  });

  it("opens the super-admin platform settings modal and saves branding text through the chooser", async () => {
    window.history.replaceState({}, "", "/?view=teams");

    class WebSocketMock {
      close() {}
    }

    const baseSessionResponse = {
      user: {
        id: "super-admin",
        email: "platform-admin@admin.local",
        displayName: "Platform Admin",
        avatarIconKey: BRANDING_MANIFEST.avatarIconKeys[0],
        avatarColorKey: BRANDING_MANIFEST.avatarColorKeys[0],
        isSuperAdmin: true,
        loginName: "platform-admin"
      },
      memberships: [],
      availableTeams: [],
      token: "session-token"
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url === "/api/bootstrap") {
        return buildJsonResponse({ debugToolsEnabled: false, branding: BRANDING_MANIFEST });
      }
      if (url === "/api/auth/session") {
        return buildJsonResponse(baseSessionResponse);
      }
      if (isNotificationsGetUrl(url)) {
        return buildJsonResponse({
          active: [],
          history: [],
          pendingJoinRequests: []
        });
      }
      if (url.startsWith("/api/admin/people")) {
        return buildJsonResponse({ requests: [], users: [], nextOffset: null });
      }
      if (url === "/api/admin/config" && (!init?.method || init.method === "GET")) {
        return buildJsonResponse({
          app: {
            baseUrl: "http://localhost:3001",
            allowedDomainsPath: "config/allowed-domains.txt",
            deploymentConfigPath: "config/deployment.toml",
            managedBrandingDir: "config/managed-branding"
          },
          admin: {
            username: "platform-admin",
            displayName: "Platform Admin",
            passwordConfigured: true
          },
          smtp: {
            host: "",
            port: null,
            user: "",
            from: "",
            passConfigured: false
          },
          branding: {
            loginLogo: BRANDING_MANIFEST.loginLogo,
            loginBackground: BRANDING_MANIFEST.loginBackground,
            teamLogo: BRANDING_MANIFEST.teamLogo,
            teamBackground: BRANDING_MANIFEST.teamBackground,
            backgroundOpacity: BRANDING_MANIFEST.backgroundOpacity,
            footerCreatorText: "",
            footerCompanyText: "",
            palette: { ...BRANDING_MANIFEST.palette }
          },
          demo: {
            enabled: false
          }
        });
      }
      if (url === "/api/admin/config" && init?.method === "PATCH") {
        const payload = JSON.parse(String(init.body));
        expect(payload.branding.footerCreatorText).toBe("Created by Luke");
        return buildJsonResponse({
          config: {
            app: {
              baseUrl: "http://localhost:3001",
              allowedDomainsPath: "config/allowed-domains.txt",
              deploymentConfigPath: "config/deployment.toml",
              managedBrandingDir: "config/managed-branding"
            },
            admin: {
              username: "platform-admin",
              displayName: "Platform Admin",
              passwordConfigured: true
            },
            smtp: {
              host: "",
              port: null,
              user: "",
              from: "",
              passConfigured: false
            },
            branding: {
              loginLogo: BRANDING_MANIFEST.loginLogo,
              loginBackground: BRANDING_MANIFEST.loginBackground,
              teamLogo: BRANDING_MANIFEST.teamLogo,
              teamBackground: BRANDING_MANIFEST.teamBackground,
              backgroundOpacity: BRANDING_MANIFEST.backgroundOpacity,
              footerCreatorText: "Created by Luke",
              footerCompanyText: "Example Company",
              palette: { ...BRANDING_MANIFEST.palette }
            },
            demo: {
              enabled: false
            }
          },
          appliedFields: ["branding.footerCreatorText", "branding.footerCompanyText"],
          restartRequiredFields: []
        });
      }
      return buildJsonResponse({ error: `Unhandled test request: ${url}` }, false);
    });

    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("WebSocket", WebSocketMock as unknown as typeof WebSocket);

    render(<App />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Platform settings" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Platform settings" }));

    await waitFor(() => expect(screen.getByRole("dialog", { name: "Platform settings" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("tab", { name: "Branding" }));
    fireEvent.change(screen.getByLabelText("Footer creator text"), { target: { value: "Created by Luke" } });
    fireEvent.change(screen.getByLabelText("Footer company text"), { target: { value: "Example Company" } });
    fireEvent.click(within(screen.getByRole("dialog", { name: "Platform settings" })).getAllByRole("button", { name: "Save settings" })[0]!);

    await waitFor(() => expect(screen.getByText("Created by Luke")).toBeInTheDocument());
    expect(screen.getByText("Example Company")).toBeInTheDocument();
  });

  it("reveals the stored super-admin password only through the explicit eye control", async () => {
    window.history.replaceState({}, "", "/?view=teams");

    class WebSocketMock {
      close() {}
    }

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url === "/api/bootstrap") {
        return buildJsonResponse({ debugToolsEnabled: false, branding: BRANDING_MANIFEST });
      }
      if (url === "/api/auth/session") {
        return buildJsonResponse({
          user: {
            id: "super-admin",
            email: "platform-admin@admin.local",
            displayName: "Platform Admin",
            avatarIconKey: BRANDING_MANIFEST.avatarIconKeys[0],
            avatarColorKey: BRANDING_MANIFEST.avatarColorKeys[0],
            isSuperAdmin: true,
            loginName: "platform-admin"
          },
          memberships: [],
          availableTeams: [],
          token: "session-token"
        });
      }
      if (isNotificationsGetUrl(url)) {
        return buildJsonResponse({
          active: [],
          history: [],
          pendingJoinRequests: []
        });
      }
      if (url.startsWith("/api/admin/people")) {
        return buildJsonResponse({ requests: [], users: [], nextOffset: null });
      }
      if (url === "/api/admin/config" && (!init?.method || init.method === "GET")) {
        return buildJsonResponse({
          app: {
            baseUrl: "http://localhost:3001",
            allowedDomainsPath: "config/allowed-domains.txt",
            deploymentConfigPath: "config/deployment.toml",
            managedBrandingDir: "config/managed-branding"
          },
          admin: {
            username: "platform-admin",
            displayName: "Platform Admin",
            passwordConfigured: true
          },
          smtp: {
            host: "",
            port: null,
            user: "",
            from: "",
            passConfigured: false
          },
          branding: {
            loginLogo: BRANDING_MANIFEST.loginLogo,
            loginBackground: BRANDING_MANIFEST.loginBackground,
            teamLogo: BRANDING_MANIFEST.teamLogo,
            teamBackground: BRANDING_MANIFEST.teamBackground,
            backgroundOpacity: BRANDING_MANIFEST.backgroundOpacity,
            footerCreatorText: "",
            footerCompanyText: "",
            palette: { ...BRANDING_MANIFEST.palette }
          },
          demo: {
            enabled: false
          }
        });
      }
      if (url === "/api/admin/config/reveal-secret") {
        return buildJsonResponse({ value: "PlatformAdmin123!" });
      }
      return buildJsonResponse({ error: `Unhandled test request: ${url}` }, false);
    });

    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("WebSocket", WebSocketMock as unknown as typeof WebSocket);

    render(<App />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Platform settings" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Platform settings" }));
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Platform settings" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("tab", { name: "Super-admin" }));
    fireEvent.click(screen.getByRole("button", { name: "Reveal admin password" }));

    await waitFor(() => expect(screen.getByDisplayValue("PlatformAdmin123!")).toBeInTheDocument());
  });

  it("shows pending platform access requests in platform settings and admits them with a manual-share password", async () => {
    class WebSocketMock {
      close() {}
    }

    let pendingRequests = [
      {
        id: "request-1",
        email: "pending.user@example-company.com",
        createdAt: "2026-04-15T10:00:00.000Z"
      }
    ];
    let existingUsers: Array<{ id: string; email: string; displayName: string; createdAt: string; updatedAt: string; lastActiveAt: string }> = [];

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url === "/api/bootstrap") {
        return buildJsonResponse({ debugToolsEnabled: false, branding: BRANDING_MANIFEST });
      }
      if (url === "/api/auth/session") {
        return buildJsonResponse({
          user: {
            id: "super-admin",
            email: "platform-admin@admin.local",
            displayName: "Platform Admin",
            avatarIconKey: BRANDING_MANIFEST.avatarIconKeys[0],
            avatarColorKey: BRANDING_MANIFEST.avatarColorKeys[0],
            isSuperAdmin: true,
            loginName: "platform-admin"
          },
          memberships: [],
          availableTeams: [],
          token: "session-token"
        });
      }
      if (isNotificationsGetUrl(url)) {
        return buildJsonResponse({ active: [], history: [], pendingJoinRequests: [] });
      }
      if (url === "/api/admin/config" && (!init?.method || init.method === "GET")) {
        return buildJsonResponse({
          app: {
            baseUrl: "http://localhost:3001",
            allowedDomainsPath: "config/allowed-domains.txt",
            deploymentConfigPath: "config/deployment.toml",
            managedBrandingDir: "config/managed-branding"
          },
          admin: {
            username: "platform-admin",
            displayName: "Platform Admin",
            passwordConfigured: true
          },
          smtp: {
            host: "",
            port: null,
            user: "",
            from: "",
            passConfigured: false
          },
          branding: {
            loginLogo: BRANDING_MANIFEST.loginLogo,
            loginBackground: BRANDING_MANIFEST.loginBackground,
            teamLogo: BRANDING_MANIFEST.teamLogo,
            teamBackground: BRANDING_MANIFEST.teamBackground,
            backgroundOpacity: BRANDING_MANIFEST.backgroundOpacity,
            footerCreatorText: "",
            footerCompanyText: "",
            palette: { ...BRANDING_MANIFEST.palette }
          },
          demo: {
            enabled: false
          }
        });
      }
      if (url.startsWith("/api/admin/people") && (!init?.method || init.method === "GET")) {
        return buildJsonResponse({
          requests: pendingRequests,
          users: existingUsers,
          nextOffset: null
        });
      }
      if (url === "/api/admin/access-requests/request-1/admit" && init?.method === "POST") {
        pendingRequests = [];
        existingUsers = [
          {
            id: "pending-user",
            email: "pending.user@example-company.com",
            displayName: "Pending",
            createdAt: "2026-04-15T10:05:00.000Z",
            updatedAt: "2026-04-15T10:05:00.000Z",
            lastActiveAt: "2026-04-15T10:05:00.000Z"
          }
        ];
        return buildJsonResponse({
          user: {
            id: "pending-user",
            email: "pending.user@example-company.com",
            displayName: "Pending",
            avatarIconKey: BRANDING_MANIFEST.avatarIconKeys[1],
            avatarColorKey: BRANDING_MANIFEST.avatarColorKeys[1]
          },
          invitedNewUser: true,
          invitationDelivery: "manual-share" as const,
          temporaryPassword: "ManualPass123!",
          secureSaveReminder: "Save this generated password somewhere secure before closing this message."
        });
      }
      if (url === "/api/auth/session") {
        return buildJsonResponse({
          user: {
            id: "super-admin",
            email: "platform-admin@admin.local",
            displayName: "Platform Admin",
            avatarIconKey: BRANDING_MANIFEST.avatarIconKeys[0],
            avatarColorKey: BRANDING_MANIFEST.avatarColorKeys[0],
            isSuperAdmin: true,
            loginName: "platform-admin"
          },
          memberships: [],
          availableTeams: [],
          token: "session-token"
        });
      }
      return buildJsonResponse({ error: `Unhandled test request: ${url}` }, false);
    });

    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("WebSocket", WebSocketMock as unknown as typeof WebSocket);

    render(<App />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Platform settings" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Platform settings" }));
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Platform settings" })).toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText("Loading settings...")).not.toBeInTheDocument());

    expect(screen.getByText("pending.user@example-company.com")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Admit" }));

    await waitFor(() => expect(screen.getByText("Share this generated password manually")).toBeInTheDocument());
    expect(screen.getByTestId("admin-credential-password")).toHaveTextContent("ManualPass123!");
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("shows demo teams in the chooser after the super-admin enables demo mode", async () => {
    window.history.replaceState({}, "", "/?view=teams");

    class WebSocketMock {
      close() {}
    }

    let demoEnabled = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url === "/api/bootstrap") {
        return buildJsonResponse({ debugToolsEnabled: false, branding: BRANDING_MANIFEST });
      }
      if (url === "/api/auth/session") {
        return buildJsonResponse({
          user: {
            id: "super-admin",
            email: "platform-admin@admin.local",
            displayName: "Platform Admin",
            avatarIconKey: BRANDING_MANIFEST.avatarIconKeys[0],
            avatarColorKey: BRANDING_MANIFEST.avatarColorKeys[0],
            isSuperAdmin: true,
            loginName: "platform-admin"
          },
          memberships: [],
          availableTeams: demoEnabled
            ? [
                {
                  id: "demo-team-10",
                  name: "Demo Team 10",
                  slug: "demo-team-10",
                  demo: true,
                  deckKey: "fibonacci-21",
                  fibonacciRangeStart: null,
                  fibonacciRangeEnd: null,
                  timerSeconds: null,
                  iconKey: "orbit",
                  logoOpacity: 0.18,
                  backgroundOpacity: 0.12,
                  historyTimezonePopupEnabled: true,
                  historyTimezoneKeys: [...DEFAULT_HISTORY_TIME_ZONE_KEYS],
                  archived: false,
                  lastActivityAt: "2026-04-14T07:00:00.000Z",
                  memberCount: 10,
                  currentUserRole: "none",
                  joinRequestStatus: "none",
                  lastOpenedAt: null
                }
              ]
            : [],
          token: "session-token"
        });
      }
      if (isNotificationsGetUrl(url)) {
        return buildJsonResponse({
          active: [],
          history: [],
          pendingJoinRequests: []
        });
      }
      if (url.startsWith("/api/admin/people")) {
        return buildJsonResponse({ requests: [], users: [], nextOffset: null });
      }
      if (url === "/api/admin/config" && (!init?.method || init.method === "GET")) {
        return buildJsonResponse({
          app: {
            baseUrl: "http://localhost:3001",
            allowedDomainsPath: "config/allowed-domains.txt",
            deploymentConfigPath: "config/deployment.toml",
            managedBrandingDir: "config/managed-branding"
          },
          admin: {
            username: "platform-admin",
            displayName: "Platform Admin",
            passwordConfigured: true
          },
          smtp: {
            host: "",
            port: null,
            user: "",
            from: "",
            passConfigured: false
          },
          branding: {
            loginLogo: BRANDING_MANIFEST.loginLogo,
            loginBackground: BRANDING_MANIFEST.loginBackground,
            teamLogo: BRANDING_MANIFEST.teamLogo,
            teamBackground: BRANDING_MANIFEST.teamBackground,
            backgroundOpacity: BRANDING_MANIFEST.backgroundOpacity,
            footerCreatorText: "",
            footerCompanyText: "",
            palette: { ...BRANDING_MANIFEST.palette }
          },
          demo: {
            enabled: demoEnabled
          }
        });
      }
      if (url === "/api/admin/config" && init?.method === "PATCH") {
        const payload = JSON.parse(String(init.body));
        expect(payload.demo.enabled).toBe(true);
        demoEnabled = true;
        return buildJsonResponse({
          config: {
            app: {
              baseUrl: "http://localhost:3001",
              allowedDomainsPath: "config/allowed-domains.txt",
              deploymentConfigPath: "config/deployment.toml",
              managedBrandingDir: "config/managed-branding"
            },
            admin: {
              username: "platform-admin",
              displayName: "Platform Admin",
              passwordConfigured: true
            },
            smtp: {
              host: "",
              port: null,
              user: "",
              from: "",
              passConfigured: false
            },
            branding: {
              loginLogo: BRANDING_MANIFEST.loginLogo,
              loginBackground: BRANDING_MANIFEST.loginBackground,
              teamLogo: BRANDING_MANIFEST.teamLogo,
              teamBackground: BRANDING_MANIFEST.teamBackground,
              backgroundOpacity: BRANDING_MANIFEST.backgroundOpacity,
              footerCreatorText: "",
              footerCompanyText: "",
              palette: { ...BRANDING_MANIFEST.palette }
            },
            demo: {
              enabled: true
            }
          },
          appliedFields: ["demo.enabled"],
          restartRequiredFields: []
        });
      }
      return buildJsonResponse({ error: `Unhandled test request: ${url}` }, false);
    });

    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("WebSocket", WebSocketMock as unknown as typeof WebSocket);

    render(<App />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Platform settings" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Platform settings" }));
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Platform settings" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("tab", { name: "App settings" }));
    fireEvent.click(screen.getByLabelText("Enable super-admin demo mode"));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Platform settings" })).getAllByRole("button", { name: "Save settings" })[0]!);
    fireEvent.click(within(screen.getByRole("dialog", { name: "Platform settings" })).getByRole("button", { name: "Close" }));

    await waitFor(() => expect(screen.getByText("Demo Team 10")).toBeInTheDocument());
    expect(screen.getAllByText("Demo")[0]).toBeInTheDocument();
  });

  it("keeps the current member visible on the board when the server presence list is temporarily empty", async () => {
    window.history.replaceState({}, "", "/?teamId=team-joined");

    class WebSocketMock {
      onopen: ((event: Event) => void) | null = null;

      constructor() {
        window.setTimeout(() => this.onopen?.(new Event("open")), 0);
      }

      close() {}
    }

    const membership = {
      id: "team-joined",
      name: "Joined Team",
      slug: "joined-team",
      deckKey: "fibonacci-21" as const,
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
      lastActivityAt: "2026-04-12T19:00:00.000Z",
      memberCount: 1,
      currentUserRole: "member" as const,
      joinRequestStatus: "none" as const,
      lastOpenedAt: "2026-04-12T19:05:00.000Z"
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url === "/api/bootstrap") {
        return buildJsonResponse({ debugToolsEnabled: false });
      }
      if (url === "/api/auth/session") {
        return buildJsonResponse({
          user: {
            id: "member-1",
            email: "member@example-company.com",
            displayName: "Member User",
            avatarIconKey: BRANDING_MANIFEST.avatarIconKeys[0],
            avatarColorKey: BRANDING_MANIFEST.avatarColorKeys[0],
            isSuperAdmin: false,
            loginName: null,
            boardShortcutsEnabled: true
          },
          memberships: [membership],
          availableTeams: [membership],
          token: "session-token"
        });
      }
      if (isNotificationsGetUrl(url)) {
        return buildJsonResponse({
          active: [],
          history: [],
          pendingJoinRequests: []
        });
      }
      if (url === "/api/teams/team-joined/state?history=0") {
        return buildJsonResponse({
          team: {
            id: "team-joined",
            name: "Joined Team",
            slug: "joined-team",
            deckKey: "tshirt",
            fibonacciRangeStart: null,
            fibonacciRangeEnd: null,
            timerSeconds: null,
            iconKey: "orbit",
            logoOpacity: 0.18,
            backgroundOpacity: 0.12,
            historyTimezonePopupEnabled: true,
            historyTimezoneKeys: [...DEFAULT_HISTORY_TIME_ZONE_KEYS],
            archived: false,
            lastActivityAt: "2026-04-12T19:00:00.000Z"
          },
          memberships: [membership],
          availableTeams: [membership],
          teamMembers: [
            {
              id: "member-1",
              email: "member@example-company.com",
              displayName: "Member User",
              avatarIconKey: BRANDING_MANIFEST.avatarIconKeys[0],
              avatarColorKey: BRANDING_MANIFEST.avatarColorKeys[0],
              role: "member",
              joinedAt: "2026-04-12T18:50:00.000Z",
              lastOpenedAt: "2026-04-12T19:05:00.000Z"
            }
          ],
          activeParticipants: [],
          activeRound: {
            id: "round-1",
            title: "ISSUE-19234",
            deckKey: "tshirt",
            fibonacciRangeStart: null,
            fibonacciRangeEnd: null,
            status: "active",
            createdAt: "2026-04-12T19:00:00.000Z",
            timerStartedAt: null,
            timerExpiresAt: null,
            revealedAt: null,
            revealAverage: null,
            votes: []
          },
          history: [],
          currentUser: {
            id: "member-1",
            email: "member@example-company.com",
            displayName: "Member User",
            avatarIconKey: BRANDING_MANIFEST.avatarIconKeys[0],
            avatarColorKey: BRANDING_MANIFEST.avatarColorKeys[0],
            isSuperAdmin: false,
            loginName: null
          },
          currentUserRole: "member"
        });
      }
      if (url === "/api/teams/team-joined/history") {
        return buildJsonResponse(buildHistoryPage());
      }
      return buildJsonResponse({ error: `Unhandled test request: ${url}` }, false);
    });

    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("WebSocket", WebSocketMock as unknown as typeof WebSocket);

    const { container } = render(<App />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Joined Team" })).toBeInTheDocument());
    await waitFor(() =>
      expect(container.querySelectorAll(".member-tile:not(.measure-probe) strong")).toHaveLength(1)
    );

    expect(container.querySelector(".member-tile:not(.measure-probe) strong")?.textContent).toBe("Member User");
  });

  it("rejects stale team snapshots when the current state has newer activity", () => {
    const current = buildBoardState({
      team: {
        ...buildBoardState().team,
        lastActivityAt: "2026-04-13T08:20:00.000Z"
      }
    });
    const next = buildBoardState({
      team: {
        ...buildBoardState().team,
        lastActivityAt: "2026-04-13T08:10:00.000Z"
      },
      activeRound: null
    });

    expect(shouldApplyTeamState(current, next)).toBe(false);
  });

  it("applies a round-only reveal update to history and removes the consumed pending Jira issue", () => {
    const current = buildBoardState({
      pendingIssues: [
        {
          id: "pending-1",
          source: "jira_cloud",
          externalIssueId: "jira-1",
          issueKey: "ISSUE-5000",
          title: "ISSUE-5000 Improve scoring",
          displayTitle: "ISSUE-5000 Improve scoring",
          importedAt: "2026-04-13T08:00:00.000Z",
          updatedAt: "2026-04-13T08:00:00.000Z"
        }
      ]
    });

    const next = applyTeamRoundUpdateToState(current, {
      teamId: "team-1",
      activeRound: {
        ...current.activeRound!,
        status: "revealed",
        revealedAt: "2026-04-13T08:20:00.000Z",
        revealAverage: 5,
        votedCount: 3,
        notVotedCount: 0,
        pendingIssueId: "pending-1",
        votes: [
          {
            userId: current.teamMembers[0]!.id,
            displayName: current.teamMembers[0]!.displayName,
            avatarIconKey: current.teamMembers[0]!.avatarIconKey,
            avatarColorKey: current.teamMembers[0]!.avatarColorKey,
            value: "5"
          }
        ]
      },
      liveSync: {
        teamId: "team-1",
        roundId: current.activeRound!.id,
        roundVersion: 2,
        voteVersion: 3
      },
      serverTime: "2026-04-13T08:20:00.000Z",
      historyEntry: {
        id: "history-2",
        teamId: "team-1",
        title: "ISSUE-5000 Improve scoring",
        deckKey: "fibonacci-21",
        fibonacciRangeStart: null,
        fibonacciRangeEnd: null,
        averageScore: 5,
        participantCount: 3,
        quorumBlocked: false,
        votedCount: 3,
        notVotedCount: 0,
        completedAt: "2026-04-13T08:20:00.000Z",
        votes: [
          {
            userId: current.teamMembers[0]!.id,
            displayName: current.teamMembers[0]!.displayName,
            avatarIconKey: current.teamMembers[0]!.avatarIconKey,
            avatarColorKey: current.teamMembers[0]!.avatarColorKey,
            value: "5"
          }
        ],
        comments: []
      }
    });

    expect(next.pendingIssues).toEqual([]);
    expect(next.history[0]?.id).toBe("history-2");
    expect(next.activeRound?.status).toBe("revealed");
    expect(next.serverTime).toBe("2026-04-13T08:20:00.000Z");
  });

  it("applies a vote-only round update without touching history", () => {
    const current = buildBoardState();
    const next = applyTeamRoundVoteUpdateToState(current, {
      teamId: "team-1",
      roundId: current.activeRound!.id,
      changedMemberIndexes: [0, 1],
      fromVoteVersion: 0,
      votedCount: 2,
      notVotedCount: current.teamMembers.length - 2,
      viewerVoteValue: "5",
      liveSync: {
        teamId: "team-1",
        roundId: current.activeRound!.id,
        roundVersion: 1,
        voteVersion: 2
      },
      serverTime: "2026-04-13T08:10:02.000Z"
    });

    expect(next.history).toEqual(current.history);
    expect(next.activeRound?.votes).toHaveLength(2);
    expect(next.activeRound?.votes[0]?.value).toBe("5");
    expect(next.activeRound?.votes[1]?.value).toBe("hidden");
    expect(next.serverTime).toBe("2026-04-13T08:10:02.000Z");
  });

  it("lets authoritative vote deltas reduce stale inflated voted counts", () => {
    const current = buildBoardState({
      activeRound: {
        ...buildBoardState().activeRound!,
        votedCount: 9,
        notVotedCount: 0,
        votes: []
      }
    });
    const next = applyTeamRoundVoteUpdateToState(current, {
      teamId: "team-1",
      roundId: current.activeRound!.id,
      changedMemberIndexes: [0, 1],
      fromVoteVersion: 0,
      votedCount: 2,
      notVotedCount: 1,
      viewerVoteValue: "5",
      liveSync: {
        teamId: "team-1",
        roundId: current.activeRound!.id,
        roundVersion: 1,
        voteVersion: 2
      },
      serverTime: "2026-04-13T08:10:02.000Z"
    });

    expect(next.activeRound?.votes).toHaveLength(2);
    expect(next.activeRound?.votedCount).toBe(2);
    expect(next.activeRound?.notVotedCount).toBe(1);
  });

  it("keeps optimistic voted counts aligned with the actual visible vote records", () => {
    const current = buildBoardState({
      activeRound: {
        ...buildBoardState().activeRound!,
        votedCount: 9,
        notVotedCount: 0,
        votes: []
      }
    });

    const next = applyOptimisticVoteToTeamState(current, "team-1", current.activeRound!.id, current.currentUser, "8");

    expect(next.activeRound?.votes).toHaveLength(1);
    expect(next.activeRound?.votedCount).toBe(1);
    expect(next.activeRound?.notVotedCount).toBe(2);
  });

  it("runs a one-shot room-entry resync so a stale first board snapshot can converge to the latest round", async () => {
    window.history.replaceState({}, "", "/?teamId=team-joined");

    class WebSocketMock {
      onopen: ((event: Event) => void) | null = null;

      constructor() {
        window.setTimeout(() => this.onopen?.(new Event("open")), 0);
      }

      close() {}
    }

    const membership = {
      id: "team-joined",
      name: "Joined Team",
      slug: "joined-team",
      deckKey: "fibonacci-21" as const,
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
      lastActivityAt: "2026-04-12T19:00:00.000Z",
      memberCount: 2,
      currentUserRole: "member" as const,
      joinRequestStatus: "none" as const,
      lastOpenedAt: "2026-04-12T19:05:00.000Z"
    };

    let teamStateRequests = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url === "/api/bootstrap") {
        return buildJsonResponse({ debugToolsEnabled: false });
      }
      if (url === "/api/auth/session") {
        return buildJsonResponse({
          user: {
            id: "member-1",
            email: "member@example-company.com",
            displayName: "Member User",
            avatarIconKey: BRANDING_MANIFEST.avatarIconKeys[0],
            avatarColorKey: BRANDING_MANIFEST.avatarColorKeys[0],
            isSuperAdmin: false,
            loginName: null
          },
          memberships: [membership],
          availableTeams: [membership],
          token: "session-token"
        });
      }
      if (isNotificationsGetUrl(url)) {
        return buildJsonResponse({
          active: [],
          history: [],
          pendingJoinRequests: []
        });
      }
      if (url === "/api/teams/team-joined/state?history=0") {
        teamStateRequests += 1;
        if (teamStateRequests === 1) {
          return buildJsonResponse({
            team: {
              id: "team-joined",
              name: "Joined Team",
              slug: "joined-team",
              deckKey: "fibonacci-21",
              fibonacciRangeStart: null,
              fibonacciRangeEnd: null,
              timerSeconds: null,
              iconKey: "orbit",
              logoOpacity: 0.18,
              backgroundOpacity: 0.12,
              historyTimezonePopupEnabled: true,
              historyTimezoneKeys: [...DEFAULT_HISTORY_TIME_ZONE_KEYS],
              archived: false,
              lastActivityAt: "2026-04-12T19:00:00.000Z"
            },
            memberships: [membership],
            availableTeams: [membership],
            teamMembers: [
              {
                id: "member-1",
                email: "member@example-company.com",
                displayName: "Member User",
                avatarIconKey: BRANDING_MANIFEST.avatarIconKeys[0],
                avatarColorKey: BRANDING_MANIFEST.avatarColorKeys[0],
                role: "member",
                joinedAt: "2026-04-12T18:50:00.000Z",
                lastOpenedAt: "2026-04-12T19:05:00.000Z"
              }
            ],
            activeParticipants: [],
            activeRound: null,
            history: [],
            currentUser: {
              id: "member-1",
              email: "member@example-company.com",
              displayName: "Member User",
              avatarIconKey: BRANDING_MANIFEST.avatarIconKeys[0],
              avatarColorKey: BRANDING_MANIFEST.avatarColorKeys[0],
              isSuperAdmin: false,
              loginName: null
            },
            currentUserRole: "member"
          });
        }

        return buildJsonResponse({
          team: {
            id: "team-joined",
            name: "Joined Team",
            slug: "joined-team",
            deckKey: "fibonacci-21",
            fibonacciRangeStart: null,
            fibonacciRangeEnd: null,
            timerSeconds: null,
            iconKey: "orbit",
            logoOpacity: 0.18,
            backgroundOpacity: 0.12,
            historyTimezonePopupEnabled: true,
            historyTimezoneKeys: [...DEFAULT_HISTORY_TIME_ZONE_KEYS],
            archived: false,
            lastActivityAt: "2026-04-12T19:01:00.000Z"
          },
          memberships: [
            {
              ...membership,
              lastActivityAt: "2026-04-12T19:01:00.000Z"
            }
          ],
          availableTeams: [
            {
              ...membership,
              lastActivityAt: "2026-04-12T19:01:00.000Z"
            }
          ],
          teamMembers: [
            {
              id: "member-1",
              email: "member@example-company.com",
              displayName: "Member User",
              avatarIconKey: BRANDING_MANIFEST.avatarIconKeys[0],
              avatarColorKey: BRANDING_MANIFEST.avatarColorKeys[0],
              role: "member",
              joinedAt: "2026-04-12T18:50:00.000Z",
              lastOpenedAt: "2026-04-12T19:05:00.000Z"
            }
          ],
          activeParticipants: [],
          activeRound: {
            id: "round-2",
            teamId: "team-joined",
            title: "ISSUE-2200",
            deckKey: "fibonacci-21",
            fibonacciRangeStart: null,
            fibonacciRangeEnd: null,
            status: "active",
            createdAt: "2026-04-12T19:01:00.000Z",
            timerStartedAt: null,
            timerExpiresAt: null,
            revealedAt: null,
            revealAverage: null,
            revoteHistoryEntryId: null,
            votes: []
          },
          history: [],
          currentUser: {
            id: "member-1",
            email: "member@example-company.com",
            displayName: "Member User",
            avatarIconKey: BRANDING_MANIFEST.avatarIconKeys[0],
            avatarColorKey: BRANDING_MANIFEST.avatarColorKeys[0],
            isSuperAdmin: false,
            loginName: null
          },
          currentUserRole: "member"
        });
      }
      if (url === "/api/teams/team-joined/history") {
        return buildJsonResponse(buildHistoryPage());
      }
      return buildJsonResponse({ error: `Unhandled test request: ${url}` }, false);
    });

    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("WebSocket", WebSocketMock as unknown as typeof WebSocket);

    render(<App />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Joined Team" })).toBeInTheDocument());

    await waitFor(() => expect(screen.getByRole("heading", { name: "ISSUE-2200" })).toBeInTheDocument(), {
      timeout: 2500
    });
    expect(teamStateRequests).toBe(2);
  });

  it("submitting a vote avoids a redundant happy-path board reload and updates the selected card immediately", async () => {
    window.history.replaceState({}, "", "/?teamId=team-vote");

    class WebSocketMock {
      close() {}
    }

    const membership = {
      id: "team-vote",
      name: "Vote Team",
      slug: "vote-team",
      demo: false,
      deckKey: "fibonacci-21" as const,
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
      lastActivityAt: "2026-04-14T22:00:00.000Z",
      memberCount: 3,
      currentUserRole: "team_admin" as const,
      joinRequestStatus: "none" as const,
      lastOpenedAt: "2026-04-14T22:05:00.000Z"
    };

    const boardState = buildBoardState({
      team: {
        ...buildBoardState().team,
        id: "team-vote",
        name: "Vote Team",
        slug: "vote-team",
        lastActivityAt: "2026-04-14T22:00:00.000Z"
      },
      memberships: [membership],
      availableTeams: [membership]
    });

    let teamStateRequests = 0;
    let voteRequests = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url === "/api/bootstrap") {
        return buildJsonResponse({ debugToolsEnabled: false, branding: BRANDING_MANIFEST });
      }
      if (url === "/api/auth/session") {
        return buildJsonResponse({
          user: {
            ...boardState.currentUser
          },
          memberships: [membership],
          availableTeams: [membership],
          token: "session-token"
        });
      }
      if (isNotificationsGetUrl(url)) {
        return buildJsonResponse({ active: [], history: [], pendingJoinRequests: [] });
      }
      if (url === "/api/teams/team-vote/state?history=0") {
        teamStateRequests += 1;
        return buildJsonResponse(boardState);
      }
      if (url === "/api/teams/team-vote/history") {
        return buildJsonResponse(buildHistoryPage());
      }
      if (url === "/api/teams/team-vote/rounds/round-1/vote" && init?.method === "POST") {
        voteRequests += 1;
        return buildJsonResponse({ ok: true });
      }
      return buildJsonResponse({ error: `Unhandled test request: ${url}` }, false);
    });

    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("WebSocket", WebSocketMock as unknown as typeof WebSocket);

    render(<App />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Vote Team" })).toBeInTheDocument());
    const teamStateRequestsBeforeVote = teamStateRequests;

    const voteButton = screen.getByRole("button", { name: "5" });
    fireEvent.click(voteButton);

    await waitFor(() => expect(voteRequests).toBe(1));
    expect(voteRequests).toBe(1);
    expect(teamStateRequests).toBe(teamStateRequestsBeforeVote);
    expect(screen.getByRole("button", { name: "5" }).className).toContain("selected");
  });

  it("preserves a shared-link target for a visible non-member team instead of clearing it", async () => {
    window.history.replaceState({}, "", "/?teamId=team-visible");

    class WebSocketMock {
      close() {}
    }

    const visibleTeam = {
      id: "team-visible",
      name: "Linked Team",
      slug: "linked-team",
      demo: false,
      deckKey: "fibonacci-21" as const,
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
      lastActivityAt: "2026-04-14T21:00:00.000Z",
      memberCount: 4,
      currentUserRole: "none" as const,
      joinRequestStatus: "none" as const,
      lastOpenedAt: null
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url === "/api/bootstrap") {
        return buildJsonResponse({ debugToolsEnabled: false, branding: BRANDING_MANIFEST });
      }
      if (url === "/api/auth/session") {
        return buildJsonResponse({
          user: {
            id: "linked-user",
            email: "linked@example-company.com",
            displayName: "Linked User",
            avatarIconKey: BRANDING_MANIFEST.avatarIconKeys[0],
            avatarColorKey: BRANDING_MANIFEST.avatarColorKeys[0],
            isSuperAdmin: false,
            loginName: null
          },
          memberships: [],
          availableTeams: [visibleTeam],
          token: "session-token"
        });
      }
      if (isNotificationsGetUrl(url)) {
        return buildJsonResponse({ active: [], history: [], pendingJoinRequests: [] });
      }
      if (url === "/api/teams/team-visible/state?history=0") {
        return buildJsonResponse({ error: "Forbidden" }, false);
      }
      return buildJsonResponse({ error: `Unhandled test request: ${url}` }, false);
    });

    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("WebSocket", WebSocketMock as unknown as typeof WebSocket);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Visible teams")).toBeInTheDocument());
    expect(screen.getByText(/Shared link target:/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request access" })).toBeInTheDocument();
    expect(window.location.search).toContain("teamId=team-visible");
  });

  it("auto-opens the shared-link target after approval makes it a joined team", async () => {
    window.history.replaceState({}, "", "/?teamId=team-linked");

    class WebSocketMock {
      close() {}
    }

    const pendingTeam = {
      id: "team-linked",
      name: "Linked Team",
      slug: "linked-team",
      demo: false,
      deckKey: "fibonacci-21" as const,
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
      lastActivityAt: "2026-04-14T21:30:00.000Z",
      memberCount: 5,
      currentUserRole: "none" as const,
      joinRequestStatus: "pending" as const,
      lastOpenedAt: null
    };

    const joinedTeam = {
      ...pendingTeam,
      currentUserRole: "member" as const,
      joinRequestStatus: "none" as const,
      lastOpenedAt: "2026-04-14T21:35:00.000Z"
    };

    let sessionRequests = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url === "/api/bootstrap") {
        return buildJsonResponse({ debugToolsEnabled: false, branding: BRANDING_MANIFEST });
      }
      if (url === "/api/auth/session") {
        sessionRequests += 1;
        return buildJsonResponse({
          user: {
            id: "linked-user",
            email: "linked@example-company.com",
            displayName: "Linked User",
            avatarIconKey: BRANDING_MANIFEST.avatarIconKeys[0],
            avatarColorKey: BRANDING_MANIFEST.avatarColorKeys[0],
            isSuperAdmin: false,
            loginName: null
          },
          memberships: sessionRequests >= 2 ? [joinedTeam] : [],
          availableTeams: [sessionRequests >= 2 ? joinedTeam : pendingTeam],
          token: "session-token"
        });
      }
      if (isNotificationsGetUrl(url)) {
        return buildJsonResponse({ active: [], history: [], pendingJoinRequests: [] });
      }
      if (url.startsWith("/api/teams/team-linked/state?history=0")) {
        if (sessionRequests < 2) {
          return buildJsonResponse({ error: "Forbidden" }, false);
        }
        return buildJsonResponse(buildBoardState({
          team: {
            ...buildBoardState().team,
            id: "team-linked",
            name: "Linked Team",
            slug: "linked-team",
            lastActivityAt: "2026-04-14T21:40:00.000Z"
          },
          memberships: [joinedTeam],
          availableTeams: [joinedTeam]
        }));
      }
      if (url === "/api/teams/team-linked/history") {
        return buildJsonResponse(buildHistoryPage());
      }
      return buildJsonResponse({ error: `Unhandled test request: ${url}` }, false);
    });

    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("WebSocket", WebSocketMock as unknown as typeof WebSocket);

    render(<App />);

    await waitFor(() => expect(screen.getByText(/Shared link target:/i)).toBeInTheDocument());
    window.dispatchEvent(new Event("focus"));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Linked Team" })).toBeInTheDocument());
  });

  it("supports keyboard shortcuts for vote selection and reveal while ignoring typing fields", async () => {
    HTMLElement.prototype.scrollTo = vi.fn();
    const onVote = vi.fn(async () => {});
    const onReveal = vi.fn(async () => {});

    render(
      <TeamBoard
        state={buildBoardState()}
        onSelectTeam={vi.fn()}
        onOpenTeamChooser={vi.fn()}
        onOpenMemberDirectory={vi.fn()}
        notificationFeed={null}
        onOpenNotifications={vi.fn(async () => {})}
        onAdmitJoinRequest={vi.fn(async () => {})}
        onDenyJoinRequest={vi.fn(async () => {})}
        onAdmitPlatformAccessRequest={vi.fn(async () => buildPlatformAccessActionResponse())}
        onDenyPlatformAccessRequest={vi.fn(async () => {})}
        onCreateRound={vi.fn(async () => {})}
        onVote={onVote}
        onReveal={onReveal}
        onVoteAgain={vi.fn(async () => {})}
        onAddHistoryComment={vi.fn(async () => {})}
        onEditHistoryComment={vi.fn(async () => {})}
        onDeleteHistoryComment={vi.fn(async () => {})}
        onUpdateDeckSettings={vi.fn(async () => {})}
        onUpdateTimer={vi.fn(async () => {})}
        onUpdateHistoryTimezoneSettings={vi.fn(async () => {})}
        onRenameTeam={vi.fn(async () => {})}
        onLeaveCurrentTeam={vi.fn(async () => {})}
        onOpenAccountSettings={vi.fn()}
        status={{ tone: "neutral", text: "Ready." }}
        isBusy={false}
      />
    );

    fireEvent.keyDown(window, { key: "1" });
    await waitFor(() => expect(onVote).toHaveBeenCalledWith("1"));

    fireEvent.keyDown(window, { key: "r" });
    await waitFor(() => expect(onReveal).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: /comments \(0\)/i }));
    const commentField = screen.getByLabelText("Add comment for Previous issue");
    fireEvent.change(commentField, { target: { value: "Typing safely" } });
    fireEvent.keyDown(commentField, { key: "r" });

    expect(onReveal).toHaveBeenCalledTimes(1);
  });

  it("renders an active team countdown from server time even when the browser clock is ahead", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-13T08:10:30.000Z"));
    HTMLElement.prototype.scrollTo = vi.fn();

    const rendered = render(
      <TeamBoard
        state={buildBoardState({
          team: {
            ...buildBoardState().team,
            timerSeconds: 10
          },
          activeRound: {
            ...buildBoardState().activeRound!,
            timerStartedAt: "2026-04-13T08:10:00.000Z",
            timerExpiresAt: "2026-04-13T08:10:10.000Z"
          },
          serverTime: "2026-04-13T08:10:00.000Z"
        })}
        onSelectTeam={vi.fn()}
        onOpenTeamChooser={vi.fn()}
        onOpenMemberDirectory={vi.fn()}
        notificationFeed={null}
        onOpenNotifications={vi.fn(async () => {})}
        onAdmitJoinRequest={vi.fn(async () => {})}
        onDenyJoinRequest={vi.fn(async () => {})}
        onAdmitPlatformAccessRequest={vi.fn(async () => buildPlatformAccessActionResponse())}
        onDenyPlatformAccessRequest={vi.fn(async () => {})}
        onCreateRound={vi.fn(async () => {})}
        onVote={vi.fn(async () => {})}
        onReveal={vi.fn(async () => {})}
        onVoteAgain={vi.fn(async () => {})}
        onAddHistoryComment={vi.fn(async () => {})}
        onEditHistoryComment={vi.fn(async () => {})}
        onDeleteHistoryComment={vi.fn(async () => {})}
        onUpdateDeckSettings={vi.fn(async () => {})}
        onUpdateTimer={vi.fn(async () => {})}
        onUpdateHistoryTimezoneSettings={vi.fn(async () => {})}
        onRenameTeam={vi.fn(async () => {})}
        onLeaveCurrentTeam={vi.fn(async () => {})}
        onOpenAccountSettings={vi.fn()}
        status={{ tone: "neutral", text: "Ready." }}
        isBusy={false}
      />
    );

    try {
      expect(document.querySelector(".board-timer-active")).toHaveTextContent("10s");

      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      expect(document.querySelector(".board-timer-active")).toHaveTextContent("9s");
    } finally {
      rendered.unmount();
      act(() => {
        vi.runOnlyPendingTimers();
      });
      vi.useRealTimers();
    }
  });

  it("supports revealed-round shortcuts and exposes shortcut help in both menu and modal", async () => {
    HTMLElement.prototype.scrollTo = vi.fn();
    const onCreateRound = vi.fn(async () => {});
    const onVoteAgain = vi.fn(async () => {});
    vi.stubGlobal("confirm", vi.fn(() => true));

    render(
      <TeamBoard
        state={buildBoardState({
          activeRound: {
            ...buildBoardState().activeRound!,
            status: "revealed",
            revealedAt: "2026-04-13T08:15:00.000Z",
            revealAverage: 5,
            votes: [
              {
                userId: "user-0",
                displayName: "User 0",
                avatarIconKey: BRANDING_MANIFEST.avatarIconKeys[0],
                avatarColorKey: BRANDING_MANIFEST.avatarColorKeys[0],
                value: "5"
              }
            ]
          }
        })}
        onSelectTeam={vi.fn()}
        onOpenTeamChooser={vi.fn()}
        onOpenMemberDirectory={vi.fn()}
        notificationFeed={null}
        onOpenNotifications={vi.fn(async () => {})}
        onAdmitJoinRequest={vi.fn(async () => {})}
        onDenyJoinRequest={vi.fn(async () => {})}
        onAdmitPlatformAccessRequest={vi.fn(async () => buildPlatformAccessActionResponse())}
        onDenyPlatformAccessRequest={vi.fn(async () => {})}
        onCreateRound={onCreateRound}
        onVote={vi.fn(async () => {})}
        onReveal={vi.fn(async () => {})}
        onVoteAgain={onVoteAgain}
        onAddHistoryComment={vi.fn(async () => {})}
        onEditHistoryComment={vi.fn(async () => {})}
        onDeleteHistoryComment={vi.fn(async () => {})}
        onUpdateDeckSettings={vi.fn(async () => {})}
        onUpdateTimer={vi.fn(async () => {})}
        onUpdateHistoryTimezoneSettings={vi.fn(async () => {})}
        onRenameTeam={vi.fn(async () => {})}
        onLeaveCurrentTeam={vi.fn(async () => {})}
        onOpenAccountSettings={vi.fn()}
        status={{ tone: "neutral", text: "Ready." }}
        isBusy={false}
      />
    );

    fireEvent.change(screen.getByLabelText("Next issue title"), { target: { value: "NEXT-12345" } });

    fireEvent.keyDown(window, { key: "v" });
    await waitFor(() => expect(onVoteAgain).toHaveBeenCalledWith("history-1"));

    fireEvent.submit(screen.getByLabelText("Next issue title").closest("form")!);
    await waitFor(() => expect(onCreateRound).toHaveBeenCalledWith("NEXT-12345"));

    fireEvent.click(screen.getByRole("button", { name: "Open team settings" }));
    fireEvent.click(screen.getByRole("button", { name: /keyboard shortcuts/i }));
    expect(screen.getByText("Open the keyboard shortcuts help modal.")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "?" });
    await waitFor(() => expect(document.querySelectorAll(".shortcuts-modal")).toHaveLength(1));
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(document.querySelectorAll(".shortcuts-modal")).toHaveLength(0));

    fireEvent.keyDown(window, { key: "/", shiftKey: true });
    await waitFor(() => expect(document.querySelectorAll(".shortcuts-modal")).toHaveLength(1));
  });

  it("disables board action shortcuts for a user while keeping normal form submission available", async () => {
    HTMLElement.prototype.scrollTo = vi.fn();
    const onVote = vi.fn(async () => {});
    const onReveal = vi.fn(async () => {});
    const onCreateRound = vi.fn(async () => {});

    const firstRender = render(
      <TeamBoard
        state={buildBoardState({
          currentUser: {
            ...buildBoardState().currentUser,
            boardShortcutsEnabled: false
          }
        })}
        onSelectTeam={vi.fn()}
        onOpenTeamChooser={vi.fn()}
        onOpenMemberDirectory={vi.fn()}
        notificationFeed={null}
        onOpenNotifications={vi.fn(async () => {})}
        onAdmitJoinRequest={vi.fn(async () => {})}
        onDenyJoinRequest={vi.fn(async () => {})}
        onAdmitPlatformAccessRequest={vi.fn(async () => buildPlatformAccessActionResponse())}
        onDenyPlatformAccessRequest={vi.fn(async () => {})}
        onCreateRound={onCreateRound}
        onVote={onVote}
        onReveal={onReveal}
        onVoteAgain={vi.fn(async () => {})}
        onAddHistoryComment={vi.fn(async () => {})}
        onEditHistoryComment={vi.fn(async () => {})}
        onDeleteHistoryComment={vi.fn(async () => {})}
        onUpdateDeckSettings={vi.fn(async () => {})}
        onUpdateTimer={vi.fn(async () => {})}
        onUpdateHistoryTimezoneSettings={vi.fn(async () => {})}
        onRenameTeam={vi.fn(async () => {})}
        onLeaveCurrentTeam={vi.fn(async () => {})}
        onOpenAccountSettings={vi.fn()}
        status={{ tone: "neutral", text: "Ready." }}
        isBusy={false}
      />
    );

    fireEvent.keyDown(window, { key: "1" });
    fireEvent.keyDown(window, { key: "r" });
    fireEvent.keyDown(window, { key: "/", shiftKey: true });

    expect(onVote).not.toHaveBeenCalled();
    expect(onReveal).not.toHaveBeenCalled();
    expect(document.querySelectorAll(".shortcuts-modal")).toHaveLength(0);
    expect(document.querySelectorAll(".button-shortcut-hint")).toHaveLength(0);
    expect(document.querySelectorAll(".planning-card-shortcut")).toHaveLength(0);

    firstRender.unmount();

    render(
      <TeamBoard
        state={buildBoardState({
          currentUser: {
            ...buildBoardState().currentUser,
            boardShortcutsEnabled: false
          },
          activeRound: {
            ...buildBoardState().activeRound!,
            status: "revealed",
            revealedAt: "2026-04-13T08:15:00.000Z",
            revealAverage: 5
          }
        })}
        onSelectTeam={vi.fn()}
        onOpenTeamChooser={vi.fn()}
        onOpenMemberDirectory={vi.fn()}
        notificationFeed={null}
        onOpenNotifications={vi.fn(async () => {})}
        onAdmitJoinRequest={vi.fn(async () => {})}
        onDenyJoinRequest={vi.fn(async () => {})}
        onAdmitPlatformAccessRequest={vi.fn(async () => buildPlatformAccessActionResponse())}
        onDenyPlatformAccessRequest={vi.fn(async () => {})}
        onCreateRound={onCreateRound}
        onVote={vi.fn(async () => {})}
        onReveal={vi.fn(async () => {})}
        onCancelActiveRound={vi.fn(async () => {})}
        onVoteAgainActiveRound={vi.fn(async () => {})}
        onVoteAgain={vi.fn(async () => {})}
        onAddHistoryComment={vi.fn(async () => {})}
        onEditHistoryComment={vi.fn(async () => {})}
        onDeleteHistoryComment={vi.fn(async () => {})}
        onUpdateDeckSettings={vi.fn(async () => {})}
        onUpdateTimer={vi.fn(async () => {})}
        onUpdateHistoryTimezoneSettings={vi.fn(async () => {})}
        onRenameTeam={vi.fn(async () => {})}
        onLeaveCurrentTeam={vi.fn(async () => {})}
        onOpenAccountSettings={vi.fn()}
        status={{ tone: "neutral", text: "Ready." }}
        isBusy={false}
      />
    );

    fireEvent.change(screen.getByLabelText("Next issue title"), { target: { value: "NEXT-55555" } });
    fireEvent.submit(screen.getByLabelText("Next issue title").closest("form")!);

    await waitFor(() => expect(onCreateRound).toHaveBeenCalledWith("NEXT-55555"));
  });

  it("shows the gated reveal message when the minimum participation rule is not met", async () => {
    HTMLElement.prototype.scrollTo = vi.fn();

    render(
      <TeamBoard
        state={buildBoardState({
          activeRound: {
            ...buildBoardState().activeRound!,
            status: "revealed",
            revealAverage: null,
            quorumBlocked: true,
            votedCount: 2,
            notVotedCount: 1,
            revealedAt: "2026-04-13T08:15:00.000Z"
          }
        })}
        onSelectTeam={vi.fn()}
        onOpenTeamChooser={vi.fn()}
        onOpenMemberDirectory={vi.fn()}
        notificationFeed={null}
        onOpenNotifications={vi.fn(async () => {})}
        onAdmitJoinRequest={vi.fn(async () => {})}
        onDenyJoinRequest={vi.fn(async () => {})}
        onAdmitPlatformAccessRequest={vi.fn(async () => buildPlatformAccessActionResponse())}
        onDenyPlatformAccessRequest={vi.fn(async () => {})}
        onCreateRound={vi.fn(async () => {})}
        onVote={vi.fn(async () => {})}
        onReveal={vi.fn(async () => {})}
        onCancelActiveRound={vi.fn(async () => {})}
        onVoteAgainActiveRound={vi.fn(async () => {})}
        onVoteAgain={vi.fn(async () => {})}
        onAddHistoryComment={vi.fn(async () => {})}
        onEditHistoryComment={vi.fn(async () => {})}
        onDeleteHistoryComment={vi.fn(async () => {})}
        onUpdateDeckSettings={vi.fn(async () => {})}
        onUpdateTimer={vi.fn(async () => {})}
        onUpdateHistoryTimezoneSettings={vi.fn(async () => {})}
        onRenameTeam={vi.fn(async () => {})}
        onLeaveCurrentTeam={vi.fn(async () => {})}
        onOpenAccountSettings={vi.fn()}
        status={{ tone: "neutral", text: "Ready." }}
        isBusy={false}
      />
    );

    expect(screen.getByText("Minimum participation not met: 2 voted, 1 not voted")).toBeInTheDocument();
  });

  it("shows the gated reveal message while the round remains active after a blocked reveal", async () => {
    HTMLElement.prototype.scrollTo = vi.fn();

    render(
      <TeamBoard
        state={buildBoardState({
          activeRound: {
            ...buildBoardState().activeRound!,
            status: "active",
            revealAverage: null,
            quorumBlocked: true,
            votedCount: 2,
            notVotedCount: 1
          }
        })}
        onSelectTeam={vi.fn()}
        onOpenTeamChooser={vi.fn()}
        onOpenMemberDirectory={vi.fn()}
        notificationFeed={null}
        onOpenNotifications={vi.fn(async () => {})}
        onAdmitJoinRequest={vi.fn(async () => {})}
        onDenyJoinRequest={vi.fn(async () => {})}
        onAdmitPlatformAccessRequest={vi.fn(async () => buildPlatformAccessActionResponse())}
        onDenyPlatformAccessRequest={vi.fn(async () => {})}
        onCreateRound={vi.fn(async () => {})}
        onVote={vi.fn(async () => {})}
        onReveal={vi.fn(async () => {})}
        onCancelActiveRound={vi.fn(async () => {})}
        onVoteAgainActiveRound={vi.fn(async () => {})}
        onVoteAgain={vi.fn(async () => {})}
        onAddHistoryComment={vi.fn(async () => {})}
        onEditHistoryComment={vi.fn(async () => {})}
        onDeleteHistoryComment={vi.fn(async () => {})}
        onUpdateDeckSettings={vi.fn(async () => {})}
        onUpdateTimer={vi.fn(async () => {})}
        onUpdateHistoryTimezoneSettings={vi.fn(async () => {})}
        onRenameTeam={vi.fn(async () => {})}
        onLeaveCurrentTeam={vi.fn(async () => {})}
        onOpenAccountSettings={vi.fn()}
        status={{ tone: "neutral", text: "Ready." }}
        isBusy={false}
      />
    );

    expect(screen.getByText("Minimum participation not met: 2 voted, 1 not voted")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reveal score/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^Cancel$/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Vote again for active round/i })).toBeEnabled();
  });

  it("shows threaded history comments newest first and limits edit/delete controls to the current user", async () => {
    HTMLElement.prototype.scrollTo = vi.fn();
    const onAddHistoryComment = vi.fn(async () => {});
    const onEditHistoryComment = vi.fn(async () => {});
    const onDeleteHistoryComment = vi.fn(async () => {});
    const state = buildBoardState({
      history: [
        {
          id: "history-1",
          teamId: "team-1",
          title: "Previous issue",
          deckKey: "fibonacci-21",
          fibonacciRangeStart: null,
          fibonacciRangeEnd: null,
          averageScore: 5,
          participantCount: 3,
          quorumBlocked: false,
          votedCount: 3,
          notVotedCount: 0,
          completedAt: "2026-04-12T08:00:00.000Z",
          votes: [
            {
              userId: "user-0",
              displayName: "User 0",
              avatarIconKey: BRANDING_MANIFEST.avatarIconKeys[0],
              avatarColorKey: BRANDING_MANIFEST.avatarColorKeys[0],
              value: "5"
            }
          ],
          comments: [
            {
              id: "comment-newest",
              historyEntryId: "history-1",
              author: {
                id: "user-1",
                email: "user-1@example-company.com",
                displayName: "User 1",
                avatarIconKey: BRANDING_MANIFEST.avatarIconKeys[1],
                avatarColorKey: BRANDING_MANIFEST.avatarColorKeys[1]
              },
              authorSignature: "User 1 (user-1@example-company.com)",
              importedImmutable: false,
              body: "Newest comment",
              createdAt: "2026-04-13T09:00:00.000Z",
              updatedAt: "2026-04-13T09:00:00.000Z"
            },
            {
              id: "comment-own",
              historyEntryId: "history-1",
              author: {
                id: "user-0",
                email: "user-0@example-company.com",
                displayName: "User 0",
                avatarIconKey: BRANDING_MANIFEST.avatarIconKeys[0],
                avatarColorKey: BRANDING_MANIFEST.avatarColorKeys[0]
              },
              authorSignature: "User 0 (user-0@example-company.com)",
              importedImmutable: false,
              body: "My earlier comment",
              createdAt: "2026-04-13T08:00:00.000Z",
              updatedAt: "2026-04-13T08:10:00.000Z"
            }
          ]
        }
      ]
    });

    const { container } = render(
      <TeamBoard
        state={state}
        onSelectTeam={vi.fn()}
        onOpenTeamChooser={vi.fn()}
        onOpenMemberDirectory={vi.fn()}
        notificationFeed={null}
        onOpenNotifications={vi.fn(async () => {})}
        onAdmitJoinRequest={vi.fn(async () => {})}
        onDenyJoinRequest={vi.fn(async () => {})}
        onAdmitPlatformAccessRequest={vi.fn(async () => buildPlatformAccessActionResponse(state.currentUser))}
        onDenyPlatformAccessRequest={vi.fn(async () => {})}
        onCreateRound={vi.fn(async () => {})}
        onVote={vi.fn(async () => {})}
        onReveal={vi.fn(async () => {})}
        onVoteAgain={vi.fn(async () => {})}
        onAddHistoryComment={onAddHistoryComment}
        onEditHistoryComment={onEditHistoryComment}
        onDeleteHistoryComment={onDeleteHistoryComment}
        onUpdateDeckSettings={vi.fn(async () => {})}
        onUpdateTimer={vi.fn(async () => {})}
        onUpdateHistoryTimezoneSettings={vi.fn(async () => {})}
        onRenameTeam={vi.fn(async () => {})}
        onLeaveCurrentTeam={vi.fn(async () => {})}
        onOpenAccountSettings={vi.fn()}
        status={{ tone: "neutral", text: "Ready." }}
        isBusy={false}
      />
    );

    expect(screen.getByText(/average/).textContent).toContain("average 5");
    expect(screen.getByRole("button", { name: "Show voters (1)" })).toBeInTheDocument();
    expect(screen.queryByText("User 0: 5")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show voters (1)" }));
    expect(screen.getByText("User 0: 5")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /comments \(2\)/i }));

    const commentCards = container.querySelectorAll(".history-comment-card");
    expect(commentCards[0]?.textContent).toContain("Newest comment");
    expect(commentCards[1]?.textContent).toContain("My earlier comment");
    expect(screen.getAllByRole("button", { name: "Edit" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Delete" })).toHaveLength(1);

    const addField = screen.getByLabelText("Add comment for Previous issue");
    expect(addField).toHaveAttribute("maxLength", "4000");
    fireEvent.change(addField, { target: { value: "Another note" } });
    fireEvent.click(screen.getByRole("button", { name: "Add comment" }));
    await waitFor(() => expect(onAddHistoryComment).toHaveBeenCalledWith("history-1", "Another note"));

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const editField = screen.getByLabelText("Edit comment from User 0 (user-0@example-company.com)");
    fireEvent.change(editField, { target: { value: "Edited note" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onEditHistoryComment).toHaveBeenCalledWith("history-1", "comment-own", "Edited note"));
  });

  it("keeps imported historical comments read-only while preserving their signed author identity", async () => {
    HTMLElement.prototype.scrollTo = vi.fn();
    const state = buildBoardState({
      history: [
        {
          id: "history-imported",
          teamId: "team-1",
          title: "Imported issue",
          deckKey: "fibonacci-21",
          fibonacciRangeStart: null,
          fibonacciRangeEnd: null,
          averageScore: 8,
          participantCount: 2,
          quorumBlocked: false,
          votedCount: 2,
          notVotedCount: 0,
          completedAt: "2026-04-14T08:00:00.000Z",
          votes: [],
          comments: [
            {
              id: "comment-imported",
              historyEntryId: "history-imported",
              author: {
                id: "importer-user",
                email: "importer@example-company.com",
                displayName: "Importer User",
                avatarIconKey: BRANDING_MANIFEST.avatarIconKeys[0],
                avatarColorKey: BRANDING_MANIFEST.avatarColorKeys[0]
              },
              authorSignature: "Legacy User (legacy.user@example-company.com)",
              importedImmutable: true,
              body: "Imported historical note",
              createdAt: "2026-04-14T08:00:00.000Z",
              updatedAt: "2026-04-14T08:00:00.000Z"
            }
          ]
        }
      ]
    });

    render(
      <TeamBoard
        state={state}
        onSelectTeam={vi.fn()}
        onOpenTeamChooser={vi.fn()}
        onOpenMemberDirectory={vi.fn()}
        notificationFeed={null}
        onOpenNotifications={vi.fn(async () => {})}
        onAdmitJoinRequest={vi.fn(async () => {})}
        onDenyJoinRequest={vi.fn(async () => {})}
        onAdmitPlatformAccessRequest={vi.fn(async () => buildPlatformAccessActionResponse(state.currentUser))}
        onDenyPlatformAccessRequest={vi.fn(async () => {})}
        onCreateRound={vi.fn(async () => {})}
        onVote={vi.fn(async () => {})}
        onReveal={vi.fn(async () => {})}
        onVoteAgain={vi.fn(async () => {})}
        onAddHistoryComment={vi.fn(async () => {})}
        onEditHistoryComment={vi.fn(async () => {})}
        onDeleteHistoryComment={vi.fn(async () => {})}
        onUpdateDeckSettings={vi.fn(async () => {})}
        onUpdateTimer={vi.fn(async () => {})}
        onUpdateHistoryTimezoneSettings={vi.fn(async () => {})}
        onRenameTeam={vi.fn(async () => {})}
        onLeaveCurrentTeam={vi.fn(async () => {})}
        onOpenAccountSettings={vi.fn()}
        status={{ tone: "neutral", text: "Ready." }}
        isBusy={false}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /comments \(1\)/i }));

    expect(screen.getByText("Legacy User (legacy.user@example-company.com)")).toBeInTheDocument();
    expect(screen.getByText("Imported comments are historical records and cannot be edited.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("submits history search filters and can request more search results from the search tab", async () => {
    HTMLElement.prototype.scrollTo = vi.fn();
    const onRunIssueHistorySearch = vi.fn(async () => {});
    const onLoadMoreIssueSearch = vi.fn(async () => {});

    render(
      <TeamBoard
        state={buildBoardState()}
        onSelectTeam={vi.fn()}
        onOpenTeamChooser={vi.fn()}
        onOpenMemberDirectory={vi.fn()}
        notificationFeed={null}
        onOpenNotifications={vi.fn(async () => {})}
        onAdmitJoinRequest={vi.fn(async () => {})}
        onDenyJoinRequest={vi.fn(async () => {})}
        onAdmitPlatformAccessRequest={vi.fn(async () => buildPlatformAccessActionResponse())}
        onDenyPlatformAccessRequest={vi.fn(async () => {})}
        onCreateRound={vi.fn(async () => {})}
        onVote={vi.fn(async () => {})}
        onReveal={vi.fn(async () => {})}
        onVoteAgain={vi.fn(async () => {})}
        onAddHistoryComment={vi.fn(async () => {})}
        onEditHistoryComment={vi.fn(async () => {})}
        onDeleteHistoryComment={vi.fn(async () => {})}
        searchItems={buildBoardState().history}
        searchNextCursor={{ completedAt: "2026-04-12T07:00:00.000Z", id: "history-search-next" }}
        searchLoading={false}
        searchFilters={{
          dateFrom: null,
          dateTo: null,
          titleQuery: "",
          exactTitleMatch: false,
          commentQuery: "",
          personQuery: ""
        }}
        hasSearchedHistory
        onRunIssueHistorySearch={onRunIssueHistorySearch}
        onLoadMoreIssueSearch={onLoadMoreIssueSearch}
        onUpdateDeckSettings={vi.fn(async () => {})}
        onUpdateTimer={vi.fn(async () => {})}
        onUpdateHistoryTimezoneSettings={vi.fn(async () => {})}
        onRenameTeam={vi.fn(async () => {})}
        onLeaveCurrentTeam={vi.fn(async () => {})}
        onOpenAccountSettings={vi.fn()}
        status={{ tone: "neutral", text: "Ready." }}
        isBusy={false}
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: "Search" }));
    fireEvent.change(screen.getByLabelText("Date from"), { target: { value: "2026-04-10" } });
    fireEvent.change(screen.getByLabelText("Date to"), { target: { value: "2026-04-14" } });
    fireEvent.change(screen.getByLabelText("Title or words"), { target: { value: "Imported issue" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /exact title match/i }));
    fireEvent.change(screen.getByLabelText("Word in comments"), { target: { value: "note" } });
    fireEvent.change(screen.getByLabelText("Person who voted or commented"), { target: { value: "Legacy User" } });
    fireEvent.click(screen.getByRole("button", { name: "Search history" }));

    await waitFor(() =>
      expect(onRunIssueHistorySearch).toHaveBeenCalledWith({
        dateFrom: "2026-04-10",
        dateTo: "2026-04-14",
        titleQuery: "Imported issue",
        exactTitleMatch: true,
        commentQuery: "note",
        personQuery: "Legacy User"
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "Load more results" }));
    await waitFor(() => expect(onLoadMoreIssueSearch).toHaveBeenCalledTimes(1));
  });

  it("clears history search filters and reruns the empty search", async () => {
    HTMLElement.prototype.scrollTo = vi.fn();
    const onRunIssueHistorySearch = vi.fn(async () => {});

    render(
      <TeamBoard
        state={buildBoardState()}
        onSelectTeam={vi.fn()}
        onOpenTeamChooser={vi.fn()}
        onOpenMemberDirectory={vi.fn()}
        notificationFeed={null}
        onOpenNotifications={vi.fn(async () => {})}
        onAdmitJoinRequest={vi.fn(async () => {})}
        onDenyJoinRequest={vi.fn(async () => {})}
        onAdmitPlatformAccessRequest={vi.fn(async () => buildPlatformAccessActionResponse())}
        onDenyPlatformAccessRequest={vi.fn(async () => {})}
        onCreateRound={vi.fn(async () => {})}
        onVote={vi.fn(async () => {})}
        onReveal={vi.fn(async () => {})}
        onVoteAgain={vi.fn(async () => {})}
        onAddHistoryComment={vi.fn(async () => {})}
        onEditHistoryComment={vi.fn(async () => {})}
        onDeleteHistoryComment={vi.fn(async () => {})}
        searchItems={buildBoardState().history}
        searchNextCursor={null}
        searchLoading={false}
        searchFilters={{
          dateFrom: "2026-04-10",
          dateTo: "2026-04-14",
          titleQuery: "Imported issue",
          exactTitleMatch: true,
          commentQuery: "note",
          personQuery: "Legacy User"
        }}
        hasSearchedHistory
        onRunIssueHistorySearch={onRunIssueHistorySearch}
        onLoadMoreIssueSearch={vi.fn(async () => {})}
        onUpdateDeckSettings={vi.fn(async () => {})}
        onUpdateTimer={vi.fn(async () => {})}
        onUpdateHistoryTimezoneSettings={vi.fn(async () => {})}
        onRenameTeam={vi.fn(async () => {})}
        onLeaveCurrentTeam={vi.fn(async () => {})}
        onOpenAccountSettings={vi.fn()}
        status={{ tone: "neutral", text: "Ready." }}
        isBusy={false}
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: "Search" }));
    expect(screen.getByLabelText("Date from")).toHaveValue("2026-04-10");
    expect(screen.getByLabelText("Date to")).toHaveValue("2026-04-14");
    expect(screen.getByLabelText("Title or words")).toHaveValue("Imported issue");
    expect(screen.getByRole("checkbox", { name: /exact title match/i })).toBeChecked();
    expect(screen.getByLabelText("Word in comments")).toHaveValue("note");
    expect(screen.getByLabelText("Person who voted or commented")).toHaveValue("Legacy User");

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    await waitFor(() =>
      expect(onRunIssueHistorySearch).toHaveBeenCalledWith({
        dateFrom: null,
        dateTo: null,
        titleQuery: "",
        exactTitleMatch: false,
        commentQuery: "",
        personQuery: ""
      })
    );

    expect(screen.getByLabelText("Date from")).toHaveValue("");
    expect(screen.getByLabelText("Date to")).toHaveValue("");
    expect(screen.getByLabelText("Title or words")).toHaveValue("");
    expect(screen.getByRole("checkbox", { name: /exact title match/i })).not.toBeChecked();
    expect(screen.getByLabelText("Word in comments")).toHaveValue("");
    expect(screen.getByLabelText("Person who voted or commented")).toHaveValue("");
  });

  it("keeps the comment draft when saving fails", async () => {
    HTMLElement.prototype.scrollTo = vi.fn();
    const onAddHistoryComment = vi.fn(async () => {
      throw new Error("Save failed");
    });

    render(
      <TeamBoard
        state={buildBoardState()}
        onSelectTeam={vi.fn()}
        onOpenTeamChooser={vi.fn()}
        onOpenMemberDirectory={vi.fn()}
        notificationFeed={null}
        onOpenNotifications={vi.fn(async () => {})}
        onAdmitJoinRequest={vi.fn(async () => {})}
        onDenyJoinRequest={vi.fn(async () => {})}
        onAdmitPlatformAccessRequest={vi.fn(async () => buildPlatformAccessActionResponse())}
        onDenyPlatformAccessRequest={vi.fn(async () => {})}
        onCreateRound={vi.fn(async () => {})}
        onVote={vi.fn(async () => {})}
        onReveal={vi.fn(async () => {})}
        onVoteAgain={vi.fn(async () => {})}
        onAddHistoryComment={onAddHistoryComment}
        onEditHistoryComment={vi.fn(async () => {})}
        onDeleteHistoryComment={vi.fn(async () => {})}
        onUpdateDeckSettings={vi.fn(async () => {})}
        onUpdateTimer={vi.fn(async () => {})}
        onUpdateHistoryTimezoneSettings={vi.fn(async () => {})}
        onRenameTeam={vi.fn(async () => {})}
        onLeaveCurrentTeam={vi.fn(async () => {})}
        onOpenAccountSettings={vi.fn()}
        status={{ tone: "neutral", text: "Ready." }}
        isBusy={false}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /comments \(0\)/i }));
    const addField = screen.getByLabelText("Add comment for Previous issue");
    fireEvent.change(addField, { target: { value: "Do not lose me" } });
    fireEvent.click(screen.getByRole("button", { name: "Add comment" }));

    await waitFor(() => expect(onAddHistoryComment).toHaveBeenCalledWith("history-1", "Do not lose me"));
    expect(screen.getByLabelText("Add comment for Previous issue")).toHaveValue("Do not lose me");
  });

  it("saves a custom Fibonacci range from the team settings menu", async () => {
    HTMLElement.prototype.scrollTo = vi.fn();
    const onUpdateDeckSettings = vi.fn(async () => {});

    render(
      <TeamBoard
        state={buildBoardState()}
        onSelectTeam={vi.fn()}
        onOpenTeamChooser={vi.fn()}
        onOpenMemberDirectory={vi.fn()}
        notificationFeed={null}
        onOpenNotifications={vi.fn(async () => {})}
        onAdmitJoinRequest={vi.fn(async () => {})}
        onDenyJoinRequest={vi.fn(async () => {})}
        onAdmitPlatformAccessRequest={vi.fn(async () => buildPlatformAccessActionResponse())}
        onDenyPlatformAccessRequest={vi.fn(async () => {})}
        onCreateRound={vi.fn(async () => {})}
        onVote={vi.fn(async () => {})}
        onReveal={vi.fn(async () => {})}
        onVoteAgain={vi.fn(async () => {})}
        onAddHistoryComment={vi.fn(async () => {})}
        onEditHistoryComment={vi.fn(async () => {})}
        onDeleteHistoryComment={vi.fn(async () => {})}
        onUpdateDeckSettings={onUpdateDeckSettings}
        onUpdateTimer={vi.fn(async () => {})}
        onUpdateHistoryTimezoneSettings={vi.fn(async () => {})}
        onRenameTeam={vi.fn(async () => {})}
        onLeaveCurrentTeam={vi.fn(async () => {})}
        onOpenAccountSettings={vi.fn()}
        status={{ tone: "neutral", text: "Ready." }}
        isBusy={false}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open team settings" }));
    fireEvent.click(screen.getByRole("button", { name: /numbering system/i }));
    fireEvent.click(screen.getByRole("button", { name: "Fibonacci" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /use custom fibonacci range/i }));
    fireEvent.change(screen.getByLabelText("Start"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("End"), { target: { value: "13" } });
    fireEvent.click(screen.getByRole("button", { name: "Save numbering" }));

    await waitFor(() =>
      expect(onUpdateDeckSettings).toHaveBeenCalledWith({
        deckKey: "fibonacci",
        fibonacciRangeStart: "1",
        fibonacciRangeEnd: "13"
      })
    );
  });

  it("shows pending join requests plus active and historical notifications in the bell panel", async () => {
    window.history.replaceState({}, "", "/?view=teams");

    class WebSocketMock {
      close() {}
    }

    const notificationFeed = {
      active: [
        {
          id: "notification-active",
          kind: "team_added_to_team",
          title: "Added to Joined Team",
          message: "Owner added you to Joined Team.",
          teamId: "team-joined",
          teamName: "Joined Team",
          actorDisplayName: "Owner",
          createdAt: "2026-04-12T18:06:00.000Z",
          seenAt: null
        }
      ],
      history: [
        {
          id: "notification-history",
          kind: "team_join_request_denied",
          title: "Request denied for Joined Team",
          message: "Owner denied your request.",
          teamId: "team-joined",
          teamName: "Joined Team",
          actorDisplayName: "Owner",
          createdAt: "2026-04-12T18:01:00.000Z",
          seenAt: "2026-04-12T18:02:00.000Z"
        }
      ],
      pendingJoinRequests: [
        {
          id: "request-1",
          teamId: "team-joined",
          teamName: "Joined Team",
          requester: {
            id: "requester-1",
            email: "requester@example-company.com",
            displayName: "Requester",
            avatarIconKey: BRANDING_MANIFEST.avatarIconKeys[1],
            avatarColorKey: BRANDING_MANIFEST.avatarColorKeys[1]
          },
          createdAt: "2026-04-12T18:07:00.000Z"
        }
      ]
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url === "/api/bootstrap") {
        return buildJsonResponse({ debugToolsEnabled: false });
      }
      if (url === "/api/auth/session") {
        return buildJsonResponse({
          user: {
            id: "team-admin",
            email: "owner@example-company.com",
            displayName: "Owner",
            avatarIconKey: BRANDING_MANIFEST.avatarIconKeys[0],
            avatarColorKey: BRANDING_MANIFEST.avatarColorKeys[0],
            isSuperAdmin: false,
            loginName: null
          },
          memberships: [
            {
              id: "team-joined",
              name: "Joined Team",
              slug: "joined-team",
              deckKey: "fibonacci-21",
              fibonacciRangeStart: null,
              fibonacciRangeEnd: null,
              timerSeconds: null,
              iconKey: "orbit",
              logoOpacity: 0.18,
              backgroundOpacity: 0.12,
              historyTimezonePopupEnabled: true,
              historyTimezoneKeys: [...DEFAULT_HISTORY_TIME_ZONE_KEYS],
              archived: false,
              lastActivityAt: "2026-04-12T18:00:00.000Z",
              memberCount: 7,
              currentUserRole: "team_admin" as const,
              joinRequestStatus: "none" as const,
              lastOpenedAt: "2026-04-12T18:05:00.000Z"
            }
          ],
          availableTeams: [
            {
              id: "team-joined",
              name: "Joined Team",
              slug: "joined-team",
              deckKey: "fibonacci-21",
              fibonacciRangeStart: null,
              fibonacciRangeEnd: null,
              timerSeconds: null,
              iconKey: "orbit",
              logoOpacity: 0.18,
              backgroundOpacity: 0.12,
              historyTimezonePopupEnabled: true,
              historyTimezoneKeys: [...DEFAULT_HISTORY_TIME_ZONE_KEYS],
              archived: false,
              lastActivityAt: "2026-04-12T18:00:00.000Z",
              memberCount: 7,
              currentUserRole: "team_admin" as const,
              joinRequestStatus: "none" as const,
              lastOpenedAt: "2026-04-12T18:05:00.000Z"
            }
          ],
          token: "session-token"
        });
      }
      if (isNotificationsGetUrl(url) && (!init?.method || init.method === "GET")) {
        return buildJsonResponse(notificationFeed);
      }
      if (isNotificationsSeenUrl(url) && init?.method === "POST") {
        return buildJsonResponse(notificationFeed);
      }
      return buildJsonResponse({ error: `Unhandled test request: ${url}` }, false);
    });

    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("WebSocket", WebSocketMock as unknown as typeof WebSocket);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Your teams")).toBeInTheDocument());
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([input, init]) => {
          const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
          return isNotificationsGetUrl(url) && url.includes("includeHistory=0") && url.includes("includeAdminHistory=0") && (!init?.method || init.method === "GET");
        })
      ).toBe(true)
    );

    fireEvent.click(screen.getByRole("button", { name: "Open notifications" }));

    await waitFor(() => expect(screen.getByRole("dialog", { name: "Notifications" })).toBeInTheDocument());

    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("History")).toBeInTheDocument();
    expect(screen.getByText("Requester")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Admit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deny" })).toBeInTheDocument();
    expect(screen.getByText("Added to Joined Team")).toBeInTheDocument();
    expect(screen.getByText("Request denied for Joined Team")).toBeInTheDocument();

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([input, init]) => {
          const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
          return isNotificationsSeenUrl(url) && init?.method === "POST";
        })
      ).toBe(true)
    );
  });

  it("opens account settings from the chooser and submits a password change", async () => {
    window.history.replaceState({}, "", "/?view=teams");

    class WebSocketMock {
      close() {}
    }

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url === "/api/bootstrap") {
        return buildJsonResponse({ debugToolsEnabled: false, branding: BRANDING_MANIFEST });
      }
      if (url === "/api/auth/session") {
        return buildJsonResponse({
          user: {
            id: "account-user",
            email: "account-user@example-company.com",
            displayName: "Account User",
            avatarIconKey: BRANDING_MANIFEST.avatarIconKeys[0],
            avatarColorKey: BRANDING_MANIFEST.avatarColorKeys[0],
            isSuperAdmin: false,
            loginName: null
          },
          memberships: [],
          availableTeams: [],
          token: "session-token"
        });
      }
      if (isNotificationsGetUrl(url)) {
        return buildJsonResponse({
          active: [],
          history: [],
          pendingJoinRequests: []
        });
      }
      if (url === "/api/auth/change-password" && init?.method === "POST") {
        const payload = JSON.parse(String(init.body));
        expect(payload).toEqual({
          currentPassword: "Password123!",
          newPassword: "BetterPass456!",
          confirmPassword: "BetterPass456!"
        });
        return buildJsonResponse({ ok: true });
      }
      if (url === "/api/account/deletion-preview") {
        return buildJsonResponse({
          targetUserId: "account-user",
          email: "account-user@example-company.com",
          displayName: "Account User",
          mode: "deactivate_account",
          confirmationPhrase: "DELETE MY ACCOUNT",
          impactToken: "self-delete-impact",
          ownedPublicTrialWorkspaces: []
        });
      }
      if (url === "/api/account/delete" && init?.method === "POST") {
        expect(JSON.parse(String(init.body))).toEqual({
          currentPassword: "Password123!",
          confirmation: "DELETE MY ACCOUNT",
          impactToken: "self-delete-impact"
        });
        return buildJsonResponse({
          deletedUserId: "account-user",
          mode: "deactivate_account",
          purgedWorkspaceIds: [],
          purgedTeamIds: [],
          affectedTeamIds: []
        });
      }
      if (url === "/api/auth/profile" && init?.method === "PATCH") {
        const payload = JSON.parse(String(init.body));
        return buildJsonResponse({
          user: {
            id: "account-user",
            email: "account-user@example-company.com",
            displayName: payload.displayName,
            avatarIconKey: payload.avatarIconKey,
            avatarColorKey: payload.avatarColorKey,
            boardShortcutsEnabled: true,
            isSuperAdmin: false,
            loginName: null
          }
        });
      }
      if (url === "/api/auth/preferences" && init?.method === "PATCH") {
        const payload = JSON.parse(String(init.body));
        return buildJsonResponse({
          user: {
            id: "account-user",
            email: "account-user@example-company.com",
            displayName: "Account User",
            avatarIconKey: BRANDING_MANIFEST.avatarIconKeys[0],
            avatarColorKey: BRANDING_MANIFEST.avatarColorKeys[0],
            boardShortcutsEnabled: payload.boardShortcutsEnabled,
            isSuperAdmin: false,
            loginName: null
          }
        });
      }
      return buildJsonResponse({ error: `Unhandled test request: ${url}` }, false);
    });

    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("WebSocket", WebSocketMock as unknown as typeof WebSocket);

    render(<App />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Account" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Account" }));
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Account settings" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Edit display name" }));
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Account Prime" } });
    fireEvent.click(screen.getByRole("button", { name: "Save display name" }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([input, init]) => {
          const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
          return url === "/api/auth/profile" && init?.method === "PATCH";
        })
      ).toBe(true)
    );

    fireEvent.click(screen.getByLabelText(BRANDING_MANIFEST.avatarColorKeys[1]!));
    fireEvent.click(screen.getByLabelText("Enable board action keyboard shortcuts"));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([input, init]) => {
          const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
          return url === "/api/auth/preferences" && init?.method === "PATCH";
        })
      ).toBe(true)
    );

    fireEvent.click(screen.getByRole("button", { name: "Reveal current password" }));
    expect(screen.getByPlaceholderText("Current password")).toHaveAttribute("type", "text");

    fireEvent.change(screen.getByPlaceholderText("Current password"), { target: { value: "Password123!" } });
    fireEvent.change(screen.getByPlaceholderText("New password"), { target: { value: "BetterPass456!" } });
    fireEvent.change(screen.getByPlaceholderText("Confirm new password"), { target: { value: "BetterPass456!" } });
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([input, init]) => {
          const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
          return url === "/api/auth/change-password" && init?.method === "POST";
        })
      ).toBe(true)
    );
    await waitFor(() => expect(screen.getByPlaceholderText("Current password")).toHaveValue(""));
    expect(screen.getByPlaceholderText("New password")).toHaveValue("");
    expect(screen.getByPlaceholderText("Confirm new password")).toHaveValue("");

    fireEvent.click(screen.getByRole("button", { name: "Review account deletion" }));
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Confirm account deletion" })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Current password", { selector: ".account-deletion-card input" }), { target: { value: "Password123!" } });
    fireEvent.change(screen.getByLabelText(/Type DELETE MY ACCOUNT to confirm/), { target: { value: "DELETE MY ACCOUNT" } });
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Confirm account deletion" })).getByRole("button", {
        name: "Delete account"
      })
    );
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([input, init]) => {
          const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
          return url === "/api/account/delete" && init?.method === "POST";
        })
      ).toBe(true)
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument());
  });

  it("shows manual-admin guidance when forgot password is used without SMTP or debug code delivery", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url === "/api/bootstrap") {
        return buildJsonResponse({ debugToolsEnabled: false, smtpConfigured: false, branding: BRANDING_MANIFEST });
      }
      if (url === "/api/auth/request-password-reset" && init?.method === "POST") {
        return buildJsonResponse({ ok: true, delivery: "manual-admin" });
      }
      return buildJsonResponse({ error: `Unhandled test request: ${url}` }, false);
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "reset@example-company.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Forgot password" }));

    await waitFor(() =>
      expect(screen.getByText(/Password reset is handled manually in this deployment/i)).toBeInTheDocument()
    );
  });

  it("shows request access instead of email code when SMTP and debug-code delivery are unavailable", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url === "/api/bootstrap") {
        return buildJsonResponse({ debugToolsEnabled: false, smtpConfigured: false, branding: BRANDING_MANIFEST });
      }
      if (url === "/api/auth/request-access" && init?.method === "POST") {
        return buildJsonResponse({ ok: true });
      }
      return buildJsonResponse({ error: `Unhandled test request: ${url}` }, false);
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(screen.queryByRole("button", { name: "Use email code" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "new.user@example-company.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Request access" }));

    await waitFor(() =>
      expect(screen.getByText(/Access request sent\./i)).toBeInTheDocument()
    );
  });

  it("shows a generated password for manual sharing when SMTP-backed invitation mail is unavailable", async () => {
    window.history.replaceState({}, "", "/?view=teams");

    class WebSocketMock {
      close() {}
    }

    const membership = {
      id: "team-joined",
      name: "Joined Team",
      slug: "joined-team",
      demo: false,
      deckKey: "fibonacci-21" as const,
      fibonacciRangeStart: null,
      fibonacciRangeEnd: null,
      timerSeconds: null,
      iconKey: "orbit",
      logoOpacity: 0.18,
      backgroundOpacity: 0.12,
      historyTimezonePopupEnabled: true,
      historyTimezoneKeys: [...DEFAULT_HISTORY_TIME_ZONE_KEYS],
      archived: false,
      jiraProjectKey: null,
      jiraJql: null,
      lastActivityAt: "2026-04-14T09:00:00.000Z",
      memberCount: 3,
      currentUserRole: "team_admin" as const,
      joinRequestStatus: "none" as const,
      lastOpenedAt: "2026-04-14T09:05:00.000Z"
    };

    const directoryPayload = {
      team: membership,
      members: [
        {
          id: "account-user",
          email: "owner@example-company.com",
          displayName: "Owner",
          avatarIconKey: BRANDING_MANIFEST.avatarIconKeys[0],
          avatarColorKey: BRANDING_MANIFEST.avatarColorKeys[0],
          role: "team_admin" as const,
          joinedAt: "2026-04-14T09:00:00.000Z",
          lastOpenedAt: "2026-04-14T09:05:00.000Z"
        }
      ],
      activeParticipantIds: [],
      currentUserId: "account-user",
      currentUserRole: "team_admin" as const,
      currentUserIsSuperAdmin: false,
      pendingIssues: [],
      pendingJoinRequests: []
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url === "/api/bootstrap") {
        return buildJsonResponse({ debugToolsEnabled: false, branding: BRANDING_MANIFEST });
      }
      if (url === "/api/auth/session") {
        return buildJsonResponse({
          user: {
            id: "account-user",
            email: "owner@example-company.com",
            displayName: "Owner",
            avatarIconKey: BRANDING_MANIFEST.avatarIconKeys[0],
            avatarColorKey: BRANDING_MANIFEST.avatarColorKeys[0],
            isSuperAdmin: false,
            loginName: null
          },
          memberships: [membership],
          availableTeams: [membership],
          token: "session-token"
        });
      }
      if (isNotificationsGetUrl(url)) {
        return buildJsonResponse({
          active: [],
          history: [],
          pendingJoinRequests: []
        });
      }
      if (url === "/api/teams/team-joined/directory") {
        return buildJsonResponse(directoryPayload);
      }
      if (url.startsWith("/api/teams/team-joined/member-candidates")) {
        return buildJsonResponse({ users: [] });
      }
      if (url === "/api/teams/team-joined/members" && init?.method === "POST") {
        const payload = JSON.parse(String(init.body));
        expect(payload).toEqual({ email: "new.person@example-company.com" });
        return buildJsonResponse({
          user: {
            id: "new-user",
            email: "new.person@example-company.com",
            displayName: "New",
            avatarIconKey: BRANDING_MANIFEST.avatarIconKeys[1],
            avatarColorKey: BRANDING_MANIFEST.avatarColorKeys[1]
          },
          invitedNewUser: true,
          invitationDelivery: "manual-share" as const,
          temporaryPassword: "TempPass456!",
          secureSaveReminder: "Save this password somewhere secure before closing."
        });
      }
      return buildJsonResponse({ error: `Unhandled test request: ${url}` }, false);
    });

    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("WebSocket", WebSocketMock as unknown as typeof WebSocket);

    render(<App />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Team admin" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Team admin" }));
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Joined Team people" })).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText("person@company.com"), { target: { value: "new.person@example-company.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Add to team" }));

    await waitFor(() => expect(screen.getByText("Share this generated password manually")).toBeInTheDocument());
    expect(screen.getByText("new.person@example-company.com")).toBeInTheDocument();
    expect(screen.getByText("Save this password somewhere secure before closing.")).toBeInTheDocument();
  });

  it("shows Jira Cloud controls in platform settings and opens the OAuth popup for the super-admin", async () => {
    const loadConfig = vi.fn(async () => ({
      app: {
        baseUrl: "http://localhost:3001",
        allowedDomainsPath: "config/allowed-domains.txt",
        deploymentConfigPath: "config/deployment.toml",
        managedBrandingDir: "config/managed-branding"
      },
      admin: {
        username: "platform-admin",
        displayName: "Platform Admin",
        passwordConfigured: true
      },
      smtp: {
        host: "",
        port: null,
        user: "",
        from: "",
        passConfigured: false
      },
      jira: {
        clientId: "jira-client-id",
        clientSecretConfigured: true,
        connected: false,
        siteUrl: null,
        siteName: null,
        cloudId: null,
        pendingSites: []
      },
      branding: {
        loginLogo: BRANDING_MANIFEST.loginLogo,
        loginBackground: BRANDING_MANIFEST.loginBackground,
        teamLogo: BRANDING_MANIFEST.teamLogo,
        teamBackground: BRANDING_MANIFEST.teamBackground,
        backgroundOpacity: BRANDING_MANIFEST.backgroundOpacity,
        footerCreatorText: "",
        footerCompanyText: "",
        palette: { ...BRANDING_MANIFEST.palette }
      },
      demo: {
        enabled: false
      }
    }));

    const startJiraOAuth = vi.fn(async () => "https://auth.atlassian.com/authorize?client_id=jira-client-id");
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    render(
      <AdminSettingsModal
        open
        onClose={vi.fn()}
        onConfigApplied={vi.fn()}
        loadConfig={loadConfig}
        loadPeople={vi.fn(async () => ({ requests: [], users: [] }))}
        admitAccessRequest={vi.fn(async () => buildPlatformAccessActionResponse())}
        denyAccessRequest={vi.fn(async () => {})}
        resetPlatformUserPassword={vi.fn(async () => ({
          user: buildBoardState().currentUser,
          passwordDelivery: "manual-share" as const,
          temporaryPassword: "Replacement123!",
          secureSaveReminder: "Save this password."
        }))}
        saveConfig={vi.fn(async () => {
          throw new Error("Save not expected");
        })}
        revealSecret={vi.fn(async () => "secret")}
        uploadBrandingAsset={vi.fn(async () => {
          throw new Error("Upload not expected");
        })}
        exportWholeDatabase={vi.fn(async () => {})}
        importWholeDatabase={vi.fn(async () => {})}
        startJiraOAuth={startJiraOAuth}
        selectJiraSite={vi.fn(async () => loadConfig())}
        disconnectJira={vi.fn(async () => loadConfig())}
        peopleRefreshTick={0}
      />
    );

    await waitFor(() => expect(screen.getByRole("dialog", { name: "Platform settings" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("tab", { name: "Super-admin" }));
    await waitFor(() => expect(screen.getByLabelText("Client ID")).toHaveValue("jira-client-id"));

    fireEvent.click(screen.getByRole("button", { name: "Connect Jira Cloud" }));

    await waitFor(() => expect(startJiraOAuth).toHaveBeenCalledTimes(1));
    expect(openSpy).toHaveBeenCalledWith(
      "https://auth.atlassian.com/authorize?client_id=jira-client-id",
      "jira-cloud-oauth",
      expect.stringContaining("popup")
    );
    expect(screen.getByText("Continue the Jira Cloud authorization in the popup window.")).toBeInTheDocument();
  });

  it("keeps platform people search and sort edits stable while loading results", async () => {
    const baseConfig = {
      app: {
        baseUrl: "http://localhost:3001",
        allowedDomainsPath: "config/allowed-domains.txt",
        deploymentConfigPath: "config/deployment.toml",
        managedBrandingDir: "config/managed-branding"
      },
      admin: {
        username: "platform-admin",
        displayName: "Platform Admin",
        passwordConfigured: true
      },
      smtp: {
        host: "",
        port: null,
        user: "",
        from: "",
        passConfigured: false
      },
      jira: {
        clientId: "",
        clientSecretConfigured: false,
        connected: false,
        siteUrl: null,
        siteName: null,
        cloudId: null,
        pendingSites: []
      },
      branding: {
        loginLogo: BRANDING_MANIFEST.loginLogo,
        loginBackground: BRANDING_MANIFEST.loginBackground,
        teamLogo: BRANDING_MANIFEST.teamLogo,
        teamBackground: BRANDING_MANIFEST.teamBackground,
        backgroundOpacity: BRANDING_MANIFEST.backgroundOpacity,
        footerCreatorText: "",
        footerCompanyText: "",
        palette: { ...BRANDING_MANIFEST.palette }
      },
      demo: {
        enabled: false
      }
    };
    const loadPeople = vi.fn(async () => ({
      requests: [],
      users: [
        {
          id: "ada",
          email: "ada@example.com",
          displayName: "Ada Lovelace",
          createdAt: "2026-04-29T06:00:00.000Z",
          updatedAt: "2026-04-29T06:00:00.000Z",
          lastActiveAt: "2026-04-29T06:00:00.000Z"
        }
      ],
      nextOffset: null
    }));

    render(
      <AdminSettingsModal
        open
        onClose={vi.fn()}
        onConfigApplied={vi.fn()}
        loadConfig={vi.fn(async () => baseConfig)}
        loadPeople={loadPeople}
        admitAccessRequest={vi.fn(async () => buildPlatformAccessActionResponse())}
        denyAccessRequest={vi.fn(async () => {})}
        resetPlatformUserPassword={vi.fn(async () => ({
          user: buildBoardState().currentUser,
          passwordDelivery: "manual-share" as const,
          temporaryPassword: "Replacement123!",
          secureSaveReminder: "Save this password."
        }))}
        saveConfig={vi.fn(async () => {
          throw new Error("Save not expected");
        })}
        revealSecret={vi.fn(async () => "secret")}
        uploadBrandingAsset={vi.fn(async () => {
          throw new Error("Upload not expected");
        })}
        exportWholeDatabase={vi.fn(async () => {})}
        importWholeDatabase={vi.fn(async () => {})}
        startJiraOAuth={vi.fn(async () => "")}
        selectJiraSite={vi.fn(async () => baseConfig)}
        disconnectJira={vi.fn(async () => baseConfig)}
        peopleRefreshTick={0}
      />
    );

    await waitFor(() => expect(screen.getByRole("dialog", { name: "Platform settings" })).toBeInTheDocument());
    const searchInput = screen.getByLabelText("Search");
    fireEvent.change(searchInput, { target: { value: "Ada" } });

    await waitFor(() => expect(loadPeople).toHaveBeenCalledWith(expect.objectContaining({ q: "Ada", sort: "recent" })));
    expect(searchInput).toHaveValue("Ada");

    fireEvent.change(screen.getByLabelText("Sort"), { target: { value: "alpha" } });

    await waitFor(() => expect(loadPeople).toHaveBeenCalledWith(expect.objectContaining({ q: "Ada", sort: "alpha" })));
    expect(searchInput).toHaveValue("Ada");
    expect(screen.getByLabelText("Sort")).toHaveValue("alpha");

    fireEvent.change(screen.getByLabelText("Sort"), { target: { value: "oldest" } });
    await waitFor(() => expect(loadPeople).toHaveBeenCalledWith(expect.objectContaining({ q: "Ada", sort: "oldest" })));
    expect(screen.getByLabelText("Sort")).toHaveValue("oldest");

    fireEvent.change(screen.getByLabelText("Sort"), { target: { value: "alpha-desc" } });
    await waitFor(() => expect(loadPeople).toHaveBeenCalledWith(expect.objectContaining({ q: "Ada", sort: "alpha-desc" })));
    expect(screen.getByLabelText("Sort")).toHaveValue("alpha-desc");
  });

  it("appends loaded platform people pages without a background reset", async () => {
    const baseConfig = {
      app: {
        baseUrl: "http://localhost:3001",
        allowedDomainsPath: "config/allowed-domains.txt",
        deploymentConfigPath: "config/deployment.toml",
        managedBrandingDir: "config/managed-branding"
      },
      admin: {
        username: "platform-admin",
        displayName: "Platform Admin",
        passwordConfigured: true
      },
      smtp: {
        host: "",
        port: null,
        user: "",
        from: "",
        passConfigured: false
      },
      jira: {
        clientId: "",
        clientSecretConfigured: false,
        connected: false,
        siteUrl: null,
        siteName: null,
        cloudId: null,
        pendingSites: []
      },
      branding: {
        loginLogo: BRANDING_MANIFEST.loginLogo,
        loginBackground: BRANDING_MANIFEST.loginBackground,
        teamLogo: BRANDING_MANIFEST.teamLogo,
        teamBackground: BRANDING_MANIFEST.teamBackground,
        backgroundOpacity: BRANDING_MANIFEST.backgroundOpacity,
        footerCreatorText: "",
        footerCompanyText: "",
        palette: { ...BRANDING_MANIFEST.palette }
      },
      demo: {
        enabled: false
      }
    };
    const loadPeople = vi.fn(async ({ offset = 0 }: { offset?: number } = {}) => ({
      requests: [],
      users:
        offset === 0
          ? [
              {
                id: "ada",
                email: "ada@example.com",
                displayName: "Ada Lovelace",
                createdAt: "2026-04-29T06:00:00.000Z",
                updatedAt: "2026-04-29T06:00:00.000Z",
                lastActiveAt: "2026-04-29T06:00:00.000Z"
              }
            ]
          : [
              {
                id: "grace",
                email: "grace@example.com",
                displayName: "Grace Hopper",
                createdAt: "2026-04-29T07:00:00.000Z",
                updatedAt: "2026-04-29T07:00:00.000Z",
                lastActiveAt: "2026-04-29T07:00:00.000Z"
              }
            ],
      nextOffset: offset === 0 ? 1 : null
    }));

    render(
      <AdminSettingsModal
        open
        onClose={vi.fn()}
        onConfigApplied={vi.fn()}
        loadConfig={vi.fn(async () => baseConfig)}
        loadPeople={loadPeople}
        admitAccessRequest={vi.fn(async () => buildPlatformAccessActionResponse())}
        denyAccessRequest={vi.fn(async () => {})}
        resetPlatformUserPassword={vi.fn(async () => ({
          user: buildBoardState().currentUser,
          passwordDelivery: "manual-share" as const,
          temporaryPassword: "Replacement123!",
          secureSaveReminder: "Save this password."
        }))}
        saveConfig={vi.fn(async () => {
          throw new Error("Save not expected");
        })}
        revealSecret={vi.fn(async () => "secret")}
        uploadBrandingAsset={vi.fn(async () => {
          throw new Error("Upload not expected");
        })}
        exportWholeDatabase={vi.fn(async () => {})}
        importWholeDatabase={vi.fn(async () => {})}
        startJiraOAuth={vi.fn(async () => "")}
        selectJiraSite={vi.fn(async () => baseConfig)}
        disconnectJira={vi.fn(async () => baseConfig)}
        peopleRefreshTick={0}
      />
    );

    await waitFor(() => expect(screen.getByText("Ada Lovelace")).toBeInTheDocument());
    const callsBeforeLoadMore = loadPeople.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Load more users" }));
    await waitFor(() => expect(screen.getByText("Grace Hopper")).toBeInTheDocument());
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(loadPeople).toHaveBeenCalledTimes(callsBeforeLoadMore + 1);
    expect(loadPeople.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({ offset: 1 }));
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
  });

  it("shows Jira team settings and pending imported issues in the team directory modal", async () => {
    const state = buildBoardState();
    const onSaveJiraSettings = vi.fn(async () => {});
    const onImportJiraIssues = vi.fn(async () => {});
    const onLoadPendingIssue = vi.fn(async () => {});

    render(
      <TeamDirectoryModal
        directory={{
          team: {
            ...state.team,
            jiraProjectKey: "SFM",
            jiraJql: 'statusCategory != Done ORDER BY Rank ASC'
          },
          members: state.teamMembers,
          activeParticipantIds: state.activeParticipants.map((member) => member.id),
          currentUserId: state.currentUser.id,
          currentUserRole: "team_admin",
          currentUserIsSuperAdmin: false,
          pendingIssues: [
            {
              id: "pending-jira-1",
              source: "jira_cloud",
              externalIssueId: "jira-101",
              issueKey: "ISSUE-101",
              title: "Import the pending queue",
              displayTitle: "ISSUE-101 - Import the pending queue",
              importedAt: "2026-04-16T10:00:00.000Z",
              updatedAt: "2026-04-16T10:00:00.000Z"
            }
          ],
          pendingJoinRequests: []
        }}
        isBusy={false}
        onClose={vi.fn()}
        onToggleArchive={vi.fn(async () => {})}
        onAddMember={vi.fn(async () => ({
          user: state.currentUser,
          invitedNewUser: false,
          invitationDelivery: "existing-user" as const,
          temporaryPassword: null,
          secureSaveReminder: null
        }))}
        searchMemberCandidates={vi.fn(async () => ({ users: [] }))}
        onSaveJiraSettings={onSaveJiraSettings}
        onImportJiraIssues={onImportJiraIssues}
        onLoadPendingIssue={onLoadPendingIssue}
        onExportTeamHistory={vi.fn(async () => {})}
        onImportTeamHistory={vi.fn(async () => ({
          importedCount: 0,
          skippedCount: 0,
          team: state.team,
          createdTeam: false
        }))}
        onResetMemberPassword={vi.fn(async () => ({
          user: state.currentUser,
          passwordDelivery: "manual-share" as const,
          temporaryPassword: "Replacement123!",
          secureSaveReminder: "Save this password."
        }))}
        onDismissCredentialReveal={vi.fn()}
        onPromoteMember={vi.fn(async () => {})}
        onDemoteMember={vi.fn(async () => {})}
        onRemoveMember={vi.fn(async () => {})}
        onAdmitJoinRequest={vi.fn(async () => {})}
        onDenyJoinRequest={vi.fn(async () => {})}
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: "Import/export" }));
    expect(screen.getByText("Jira Cloud issue import")).toBeInTheDocument();
    expect(screen.getByText("ISSUE-101")).toBeInTheDocument();
    expect(screen.getByText("Import the pending queue")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save Jira settings" }));
    await waitFor(() => expect(onSaveJiraSettings).toHaveBeenCalledWith("team-1", "SFM", 'statusCategory != Done ORDER BY Rank ASC'));

    fireEvent.click(screen.getByRole("button", { name: "Import or refresh Jira issues" }));
    await waitFor(() => expect(onImportJiraIssues).toHaveBeenCalledWith("team-1"));

    fireEvent.click(screen.getByRole("button", { name: "Load for voting" }));
    await waitFor(() => expect(onLoadPendingIssue).toHaveBeenCalledWith("team-1", "pending-jira-1"));
  });

  it("lets team-admins reset passwords for other members from the team directory", async () => {
    const state = buildBoardState();
    const onResetMemberPassword = vi.fn(async () => ({
      user: state.teamMembers[1]!,
      passwordDelivery: "manual-share" as const,
      temporaryPassword: "Replacement123!",
      secureSaveReminder: "Save this password."
    }));

    render(
      <TeamDirectoryModal
        directory={{
          team: state.team,
          members: state.teamMembers,
          activeParticipantIds: [],
          currentUserId: state.currentUser.id,
          currentUserRole: "team_admin",
          currentUserIsSuperAdmin: false,
          pendingIssues: [],
          pendingJoinRequests: []
        }}
        isBusy={false}
        onClose={vi.fn()}
        onToggleArchive={vi.fn(async () => {})}
        onAddMember={vi.fn(async () => ({
          user: state.currentUser,
          invitedNewUser: false,
          invitationDelivery: "existing-user" as const,
          temporaryPassword: null,
          secureSaveReminder: null
        }))}
        searchMemberCandidates={vi.fn(async () => ({ users: [] }))}
        onSaveJiraSettings={vi.fn(async () => {})}
        onImportJiraIssues={vi.fn(async () => {})}
        onLoadPendingIssue={vi.fn(async () => {})}
        onExportTeamHistory={vi.fn(async () => {})}
        onImportTeamHistory={vi.fn(async () => ({
          importedCount: 0,
          skippedCount: 0,
          team: state.team,
          createdTeam: false
        }))}
        onResetMemberPassword={onResetMemberPassword}
        onDismissCredentialReveal={vi.fn()}
        onPromoteMember={vi.fn(async () => {})}
        onDemoteMember={vi.fn(async () => {})}
        onRemoveMember={vi.fn(async () => {})}
        onAdmitJoinRequest={vi.fn(async () => {})}
        onDenyJoinRequest={vi.fn(async () => {})}
      />
    );

    expect(screen.getAllByRole("button", { name: "Reset password" })).toHaveLength(2);
    fireEvent.click(screen.getAllByRole("button", { name: "Reset password" })[0]!);

    await waitFor(() => expect(onResetMemberPassword).toHaveBeenCalledWith("team-1", "user-1"));
    const resetPasswordHeading = screen.getByText("Share this replacement password manually");
    expect(resetPasswordHeading).toBeInTheDocument();
    expect(resetPasswordHeading.closest(".directory-row")).toHaveTextContent(state.teamMembers[1]!.email);
    expect(screen.getByTestId("credential-password")).toHaveTextContent("Replacement123!");
  });

  it("disables team-admin password reset for members currently active on the board", async () => {
    const state = buildBoardState();
    const onResetMemberPassword = vi.fn(async () => ({
      user: state.teamMembers[1]!,
      passwordDelivery: "manual-share" as const,
      temporaryPassword: "Replacement123!",
      secureSaveReminder: "Save this password."
    }));

    render(
      <TeamDirectoryModal
        directory={{
          team: state.team,
          members: state.teamMembers,
          activeParticipantIds: ["user-1"],
          currentUserId: state.currentUser.id,
          currentUserRole: "team_admin",
          currentUserIsSuperAdmin: false,
          pendingIssues: [],
          pendingJoinRequests: []
        }}
        isBusy={false}
        onClose={vi.fn()}
        onToggleArchive={vi.fn(async () => {})}
        onAddMember={vi.fn(async () => ({
          user: state.currentUser,
          invitedNewUser: false,
          invitationDelivery: "existing-user" as const,
          temporaryPassword: null,
          secureSaveReminder: null
        }))}
        searchMemberCandidates={vi.fn(async () => ({ users: [] }))}
        onSaveJiraSettings={vi.fn(async () => {})}
        onImportJiraIssues={vi.fn(async () => {})}
        onLoadPendingIssue={vi.fn(async () => {})}
        onExportTeamHistory={vi.fn(async () => {})}
        onImportTeamHistory={vi.fn(async () => ({
          importedCount: 0,
          skippedCount: 0,
          team: state.team,
          createdTeam: false
        }))}
        onResetMemberPassword={onResetMemberPassword}
        onDismissCredentialReveal={vi.fn()}
        onPromoteMember={vi.fn(async () => {})}
        onDemoteMember={vi.fn(async () => {})}
        onRemoveMember={vi.fn(async () => {})}
        onAdmitJoinRequest={vi.fn(async () => {})}
        onDenyJoinRequest={vi.fn(async () => {})}
      />
    );

    const resetButtons = screen.getAllByRole("button", { name: "Reset password" });
    expect(resetButtons[0]).toBeDisabled();
    expect(resetButtons[1]).toBeEnabled();

    fireEvent.click(resetButtons[0]!);
    expect(onResetMemberPassword).not.toHaveBeenCalled();
  });

  it("uploads a branding asset through platform settings and applies the returned manifest", async () => {
    const baseConfig = {
      app: {
        baseUrl: "http://localhost:3001",
        allowedDomainsPath: "config/allowed-domains.txt",
        deploymentConfigPath: "config/deployment.toml",
        managedBrandingDir: "config/managed-branding"
      },
      admin: {
        username: "platform-admin",
        displayName: "Platform Admin",
        passwordConfigured: true
      },
      smtp: {
        host: "",
        port: null,
        user: "",
        from: "",
        passConfigured: false
      },
      jira: {
        clientId: "",
        clientSecretConfigured: false,
        connected: false,
        siteUrl: null,
        siteName: null,
        cloudId: null,
        pendingSites: []
      },
      branding: {
        loginLogo: BRANDING_MANIFEST.loginLogo,
        loginBackground: BRANDING_MANIFEST.loginBackground,
        teamLogo: BRANDING_MANIFEST.teamLogo,
        teamBackground: BRANDING_MANIFEST.teamBackground,
        backgroundOpacity: BRANDING_MANIFEST.backgroundOpacity,
        footerCreatorText: "",
        footerCompanyText: "",
        palette: { ...BRANDING_MANIFEST.palette }
      },
      demo: {
        enabled: false
      }
    };
    const onConfigApplied = vi.fn();
    const uploadBrandingAsset = vi.fn(async (slot: string, file: File) => {
      expect(slot).toBe("teamLogo");
      expect(file.name).toBe("team-logo.svg");
      return {
        config: {
          ...baseConfig,
          branding: {
            ...baseConfig.branding,
            teamLogo: "/managed-branding/team-logo.svg"
          }
        },
        appliedFields: ["branding.teamLogo"],
        restartRequiredFields: []
      };
    });

    render(
      <AdminSettingsModal
        open
        onClose={vi.fn()}
        onConfigApplied={onConfigApplied}
        loadConfig={vi.fn(async () => baseConfig)}
        loadPeople={vi.fn(async () => ({ requests: [], users: [] }))}
        admitAccessRequest={vi.fn(async () => buildPlatformAccessActionResponse())}
        denyAccessRequest={vi.fn(async () => {})}
        resetPlatformUserPassword={vi.fn(async () => ({
          user: buildBoardState().currentUser,
          passwordDelivery: "manual-share" as const,
          temporaryPassword: "Replacement123!",
          secureSaveReminder: "Save this password."
        }))}
        saveConfig={vi.fn(async () => {
          throw new Error("Save not expected");
        })}
        revealSecret={vi.fn(async () => "secret")}
        uploadBrandingAsset={uploadBrandingAsset}
        exportWholeDatabase={vi.fn(async () => {})}
        importWholeDatabase={vi.fn(async () => {})}
        startJiraOAuth={vi.fn(async () => "")}
        selectJiraSite={vi.fn(async () => baseConfig)}
        disconnectJira={vi.fn(async () => baseConfig)}
        peopleRefreshTick={0}
      />
    );

    await waitFor(() => expect(screen.getByRole("dialog", { name: "Platform settings" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("tab", { name: "Branding" }));

    fireEvent.change(screen.getByLabelText("Team logo"), {
      target: {
        files: [new File(["<svg xmlns=\"http://www.w3.org/2000/svg\"/>"], "team-logo.svg", { type: "image/svg+xml" })]
      }
    });

    await waitFor(() => expect(uploadBrandingAsset).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onConfigApplied).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Saved and applied immediately: branding.teamLogo.")).toBeInTheDocument();
  });

  it("shows a generated replacement password from the super-admin People tab when SMTP is not configured", async () => {
    window.history.replaceState({}, "", "/?view=teams");

    class WebSocketMock {
      close() {}
    }

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url === "/api/bootstrap") {
        return buildJsonResponse({ debugToolsEnabled: false, smtpConfigured: false, branding: BRANDING_MANIFEST });
      }
      if (url === "/api/auth/session") {
        return buildJsonResponse({
          user: {
            id: "super-admin",
            email: "platform-admin@admin.local",
            displayName: "Platform Admin",
            avatarIconKey: BRANDING_MANIFEST.avatarIconKeys[0],
            avatarColorKey: BRANDING_MANIFEST.avatarColorKeys[0],
            isSuperAdmin: true,
            loginName: "platform-admin"
          },
          memberships: [],
          availableTeams: [],
          token: "session-token"
        });
      }
      if (isNotificationsGetUrl(url)) {
        return buildJsonResponse({
          active: [],
          history: [],
          pendingJoinRequests: [],
          platformAccessRequests: []
        });
      }
      if (url === "/api/admin/config" && (!init?.method || init.method === "GET")) {
        return buildJsonResponse({
          app: {
            baseUrl: "http://localhost:3001",
            allowedDomainsPath: "config/allowed-domains.txt",
            deploymentConfigPath: "config/deployment.toml",
            managedBrandingDir: "config/managed-branding"
          },
          admin: {
            username: "platform-admin",
            displayName: "Platform Admin",
            passwordConfigured: true
          },
          smtp: {
            host: "",
            port: null,
            user: "",
            from: "",
            passConfigured: false
          },
          branding: {
            loginLogo: BRANDING_MANIFEST.loginLogo,
            loginBackground: BRANDING_MANIFEST.loginBackground,
            teamLogo: BRANDING_MANIFEST.teamLogo,
            teamBackground: BRANDING_MANIFEST.teamBackground,
            backgroundOpacity: BRANDING_MANIFEST.backgroundOpacity,
            footerCreatorText: "",
            footerCompanyText: "",
            palette: { ...BRANDING_MANIFEST.palette }
          },
          demo: {
            enabled: false
          }
        });
      }
      if (url.startsWith("/api/admin/people")) {
        return buildJsonResponse({
          requests: [],
          users: [
            {
              id: "member-user",
              email: "member@example-company.com",
              displayName: "Member",
              createdAt: "2026-04-14T09:00:00.000Z",
              updatedAt: "2026-04-14T09:06:00.000Z",
              lastActiveAt: "2026-04-14T09:05:00.000Z"
            }
          ],
          nextOffset: null
        });
      }
      if (url === "/api/admin/users/member-user/reset-password" && init?.method === "POST") {
        return buildJsonResponse({
          user: {
            id: "member-user",
            email: "member@example-company.com",
            displayName: "Member",
            avatarIconKey: BRANDING_MANIFEST.avatarIconKeys[1],
            avatarColorKey: BRANDING_MANIFEST.avatarColorKeys[1]
          },
          passwordDelivery: "manual-share",
          temporaryPassword: "ResetPass789!",
          secureSaveReminder: "Save this password somewhere secure before closing."
        });
      }
      if (url === "/api/admin/users/member-user/deletion-preview") {
        return buildJsonResponse({
          targetUserId: "member-user",
          email: "member@example-company.com",
          displayName: "Member",
          mode: "deactivate_account",
          confirmationPhrase: "member@example-company.com",
          impactToken: "admin-delete-impact",
          ownedPublicTrialWorkspaces: []
        });
      }
      if (url === "/api/admin/users/member-user" && init?.method === "DELETE") {
        expect(JSON.parse(String(init.body))).toEqual({
          confirmation: "member@example-company.com",
          impactToken: "admin-delete-impact"
        });
        return buildJsonResponse({
          deletedUserId: "member-user",
          mode: "deactivate_account",
          purgedWorkspaceIds: [],
          purgedTeamIds: [],
          affectedTeamIds: []
        });
      }
      return buildJsonResponse({ error: `Unhandled test request: ${url}` }, false);
    });

    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("WebSocket", WebSocketMock as unknown as typeof WebSocket);

    render(<App />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Platform settings" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Platform settings" }));
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Platform settings" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));

    await waitFor(() => expect(screen.getByText("Share this replacement password manually")).toBeInTheDocument());
    expect(within(screen.getByRole("status")).getByText("member@example-company.com")).toBeInTheDocument();
    expect(screen.getByText("Save this password somewhere secure before closing.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Confirm account deletion" })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/Type member@example-company.com to confirm/), { target: { value: "member@example-company.com" } });
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Confirm account deletion" })).getByRole("button", {
        name: "Delete account"
      })
    );
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([input, init]) => {
          const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
          return url === "/api/admin/users/member-user" && init?.method === "DELETE";
        })
      ).toBe(true)
    );
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Confirm account deletion" })).not.toBeInTheDocument());
    expect(screen.getByText("Deleted the account for member@example-company.com.")).toBeInTheDocument();
  });

  it("keeps Create and Import team popups mutually exclusive and focuses the active popup input", async () => {
    const user = {
      id: "chooser-user",
      email: "chooser@example-company.com",
      displayName: "Chooser User",
      avatarIconKey: BRANDING_MANIFEST.avatarIconKeys[0],
      avatarColorKey: BRANDING_MANIFEST.avatarColorKeys[0],
      isSuperAdmin: false,
      loginName: null,
      boardShortcutsEnabled: true,
      historyTimezonePopupEnabled: true,
      historyTimezoneKeys: null
    };

    render(
      <TeamChooser
        user={user}
        memberships={[]}
        availableTeams={[]}
        selectedTeamId={null}
        onSelectTeam={vi.fn()}
        onCreateTeam={vi.fn(async () => undefined)}
        onImportTeam={vi.fn()}
        onJoinTeam={vi.fn(async () => undefined)}
        onLeaveTeam={vi.fn(async () => undefined)}
        onOpenMemberDirectory={vi.fn()}
        notificationFeed={null}
        onOpenNotifications={vi.fn(async () => undefined)}
        onAdmitJoinRequest={vi.fn(async () => undefined)}
        onDenyJoinRequest={vi.fn(async () => undefined)}
        onAdmitPlatformAccessRequest={vi.fn(async () => ({
          user: {
            id: "request-user",
            email: "request@example-company.com",
            displayName: "Request User",
            avatarIconKey: BRANDING_MANIFEST.avatarIconKeys[1],
            avatarColorKey: BRANDING_MANIFEST.avatarColorKeys[1]
          },
          invitedNewUser: true,
          invitationDelivery: "manual-share" as const,
          temporaryPassword: "TempPass123!",
          secureSaveReminder: "Save it."
        }))}
        onDenyPlatformAccessRequest={vi.fn(async () => undefined)}
        onOpenAccountSettings={vi.fn()}
        onSignOut={vi.fn(async () => undefined)}
        onOpenAdminSettings={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Create a team" }));
    await waitFor(() => expect(screen.getByPlaceholderText("Type title (min 5 chars)")).toHaveFocus());
    expect(screen.getByText("Creating a team opens that board immediately.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Import a team" }));
    await waitFor(() => expect(screen.getByPlaceholderText("Imported team title")).toHaveFocus());
    expect(screen.queryByText("Creating a team opens that board immediately.")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Team history package")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create a team" }));
    await waitFor(() => expect(screen.getByPlaceholderText("Type title (min 5 chars)")).toHaveFocus());
    expect(screen.queryByPlaceholderText("Imported team title")).not.toBeInTheDocument();
  });

});
