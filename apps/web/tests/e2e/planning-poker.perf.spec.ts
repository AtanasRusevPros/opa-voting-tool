// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test, type Locator, type Page } from "@playwright/test";

const simulatorEnabled = process.env.PLAYWRIGHT_SIMULATOR === "1";
const simulatorSecret = process.env.SIMULATOR_SHARED_SECRET ?? "planning-poker-simulator";

type PerfSnapshot = {
  boardLayoutCalcs: number;
  participantRingRenders: number;
  historyRailRenders: number;
};

async function loginAsSimulatorOwner(page: Page) {
  const response = await page.request.post("/api/simulator/login", {
    headers: {
      "content-type": "application/json",
      "x-simulator-secret": simulatorSecret
    },
    data: {
      email: "sim.owner@example-company.com"
    }
  });
  expect(response.ok()).toBe(true);
  const payload = (await response.json()) as { token: string };
  await page.addInitScript(
    ([token]) => {
      window.localStorage.setItem("planning-poker:session-token", token);
    },
    [payload.token]
  );
  return payload.token;
}

async function waitForTeamReady(page: Page, token: string, teamName: string, minimumParticipantCount: number) {
  const sessionResponse = await page.request.get("/api/auth/session", {
    headers: {
      authorization: `Bearer ${token}`
    }
  });
  expect(sessionResponse.ok()).toBe(true);
  const sessionPayload = (await sessionResponse.json()) as { memberships: Array<{ id: string; name: string }> };
  const teamId = sessionPayload.memberships.find((membership) => membership.name === teamName)?.id;
  expect(teamId).toBeTruthy();

  await expect
    .poll(
      async () => {
        try {
          const stateResponse = await page.request.get(`/api/teams/${teamId}/state?history=0`, {
            headers: {
              authorization: `Bearer ${token}`
            }
          });
          if (!stateResponse.ok()) {
            return -1;
          }
          const statePayload = (await stateResponse.json()) as { activeParticipants: Array<{ id: string }> };
          return statePayload.activeParticipants.length;
        } catch {
          return -1;
        }
      },
      {
        timeout: 30000,
        intervals: [500, 1000, 1000]
      }
    )
    .toBeGreaterThanOrEqual(minimumParticipantCount);
}

async function getTeamId(page: Page, token: string, teamName: string) {
  const sessionResponse = await page.request.get("/api/auth/session", {
    headers: {
      authorization: `Bearer ${token}`
    }
  });
  expect(sessionResponse.ok()).toBe(true);
  const sessionPayload = (await sessionResponse.json()) as { memberships: Array<{ id: string; name: string }> };
  const teamId = sessionPayload.memberships.find((membership) => membership.name === teamName)?.id;
  expect(teamId).toBeTruthy();
  return teamId!;
}

async function getChooserTeamRow(page: Page, teamName: string, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const rows = page.locator(".team-list-row, .team-tile");
    const count = await rows.count();
    for (let index = 0; index < count; index += 1) {
      const row = rows.nth(index);
      const label = await row.evaluate((element) => {
        const titleElement = element.querySelector(".team-tile-main > span, strong");
        if (!titleElement) {
          return null;
        }
        const leadingTextNode = Array.from(titleElement.childNodes).find(
          (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()
        );
        return leadingTextNode?.textContent?.trim() ?? titleElement.textContent?.trim() ?? null;
      });
      if (label === teamName) {
        return row;
      }
    }

    await page.waitForTimeout(100);
  }

  throw new Error(`Chooser row not found for team "${teamName}"`);
}

async function readTeamState(page: Page, token: string, teamId: string, includeHistory = false) {
  const stateResponse = await page.request.get(`/api/teams/${teamId}/state?history=${includeHistory ? 1 : 0}`, {
    headers: {
      authorization: `Bearer ${token}`
    }
  });
  expect(stateResponse.ok()).toBe(true);
  return (await stateResponse.json()) as {
    activeRound: {
      id: string;
      title: string;
      status: "active" | "revealed";
      revealAverage: string | number | null;
      votes: Array<{ userId: string; value: string }>;
      votedCount: number;
      notVotedCount: number;
    } | null;
    history: Array<{
      title: string;
      averageScore: string | number | null;
      participantCount: number;
      votes: Array<{ userId: string; value: string }>;
    }>;
  };
}

async function openSimTeam(page: Page, teamName: string, minimumParticipantCount: number) {
  const token = await loginAsSimulatorOwner(page);
  await waitForTeamReady(page, token, teamName, minimumParticipantCount);
  const teamId = await getTeamId(page, token, teamName);
  await page.goto(`/?teamId=${teamId}`);
  await expect(page.getByRole("heading", { name: teamName })).toBeVisible({ timeout: 30000 });
  await page.waitForFunction(
    (expected) => document.querySelectorAll(".participant-ring .member-tile:not(.measure-probe)").length >= expected,
    minimumParticipantCount,
    { timeout: 30000 }
  );
}

async function waitForBoardParticipants(page: Page, minimumParticipantCount: number) {
  await page.waitForFunction(
    (expected) => document.querySelectorAll(".participant-ring .member-tile:not(.measure-probe)").length >= expected,
    minimumParticipantCount,
    { timeout: 30000 }
  );
}

async function openSwitchTeamControl(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: /^Switch team$/ }).click();
  const menu = page.getByRole("menu", { name: "Switch team menu" });
  await expect(menu).toBeVisible();
  return menu;
}

async function switchToSimTeam(page: Page, teamName: string, minimumParticipantCount: number) {
  const menu = await openSwitchTeamControl(page);
  await menu.getByRole("menuitem", { name: new RegExp(teamName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).click();
  await expect(page.getByRole("heading", { name: teamName })).toBeVisible({ timeout: 30000 });
  await waitForBoardParticipants(page, minimumParticipantCount);
}

async function resetPerf(page: Page) {
  await page.evaluate(() => {
    window.__PLANNING_POKER_PERF__?.reset();
    performance.clearMarks();
    performance.clearMeasures();
  });
}

async function snapshotPerf(page: Page): Promise<PerfSnapshot> {
  return page.evaluate(
    () =>
      window.__PLANNING_POKER_PERF__?.snapshot() ?? {
        boardLayoutCalcs: 0,
        participantRingRenders: 0,
        historyRailRenders: 0
      }
  );
}

async function waitForPerfIdle(page: Page, idleMs = 300) {
  await expect
    .poll(
      async () =>
        page.evaluate((requiredIdleMs) => {
          const store = window.__PLANNING_POKER_PERF__;
          if (!store) {
            return 0;
          }
          return performance.now() - store.getLastUpdatedAt();
        }, idleMs),
      {
        timeout: 5000,
        intervals: [100, 150, 200]
      }
    )
    .toBeGreaterThanOrEqual(idleMs);
}

async function measureInteraction<T>(page: Page, name: string, action: () => Promise<T>) {
  await page.evaluate((label) => performance.mark(`${label}:start`), name);
  const result = await action();
  return {
    result,
    duration: await page.evaluate((label) => {
      performance.mark(`${label}:end`);
      performance.measure(label, `${label}:start`, `${label}:end`);
      return performance.getEntriesByName(label).at(-1)?.duration ?? 0;
    }, name)
  };
}

test.describe("simulator-backed frontend performance", () => {
  test.skip(!simulatorEnabled, "Run this suite with PLAYWRIGHT_SIMULATOR=1 and a live simulator stack.");

  test("header and menu interactions stay isolated from heavy board rerenders in Sim Team 80", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 1880, height: 980 }
    });
    const page = await context.newPage();

    await openSimTeam(page, "Sim Team 80", 72);
    await waitForPerfIdle(page, 1000);

    await resetPerf(page);
    const switchTeam = await measureInteraction(page, "perf:switch-team", async () => {
      await page.getByRole("button", { name: "Switch team" }).click();
      await expect(page.getByRole("menu", { name: "Switch team menu" })).toBeVisible();
    });
    expect(switchTeam.duration).toBeLessThan(600);
    const switchTeamSnapshot = await snapshotPerf(page);
    expect(switchTeamSnapshot.boardLayoutCalcs).toBeLessThanOrEqual(1);
    expect(switchTeamSnapshot.participantRingRenders).toBeLessThanOrEqual(1);
    expect(switchTeamSnapshot.memberTileRenders).toBeLessThanOrEqual(81);
    expect(switchTeamSnapshot.historyRailRenders).toBe(0);

    await page.keyboard.press("Escape");
    await resetPerf(page);
    const teamSettings = await measureInteraction(page, "perf:team-settings", async () => {
      await page.getByRole("button", { name: "Open team settings" }).click();
      await expect(page.getByRole("dialog", { name: "Team settings" })).toBeVisible();
    });
    expect(teamSettings.duration).toBeLessThan(500);
    const teamSettingsSnapshot = await snapshotPerf(page);
    expect(teamSettingsSnapshot.boardLayoutCalcs).toBeLessThanOrEqual(1);
    expect(teamSettingsSnapshot.participantRingRenders).toBeLessThanOrEqual(1);
    expect(teamSettingsSnapshot.memberTileRenders).toBeLessThanOrEqual(81);
    expect(teamSettingsSnapshot.historyRailRenders).toBe(0);

    await page.keyboard.press("Escape");
    await resetPerf(page);
    const timerSettings = await measureInteraction(page, "perf:timer-settings", async () => {
      await page.getByRole("button", { name: "Open team timer settings" }).click();
      await expect(page.getByRole("dialog", { name: "Team timer settings" })).toBeVisible();
    });
    expect(timerSettings.duration).toBeLessThan(500);
    const timerSettingsSnapshot = await snapshotPerf(page);
    expect(timerSettingsSnapshot.boardLayoutCalcs).toBeLessThanOrEqual(1);
    expect(timerSettingsSnapshot.participantRingRenders).toBeLessThanOrEqual(1);
    expect(timerSettingsSnapshot.memberTileRenders).toBeLessThanOrEqual(81);
    expect(timerSettingsSnapshot.historyRailRenders).toBe(0);

    await page.keyboard.press("Escape");
    await resetPerf(page);
    const members = await measureInteraction(page, "perf:members", async () => {
      await page.getByRole("button", { name: "Team admin" }).click();
      await expect(page.getByRole("dialog", { name: /people$/ })).toBeVisible();
    });
    expect(members.duration).toBeLessThan(900);
    const membersSnapshot = await snapshotPerf(page);
    expect(membersSnapshot.boardLayoutCalcs).toBeLessThanOrEqual(1);
    expect(membersSnapshot.participantRingRenders).toBeLessThanOrEqual(1);
    expect(membersSnapshot.memberTileRenders).toBeLessThanOrEqual(81);
    expect(membersSnapshot.historyRailRenders).toBeLessThanOrEqual(2);
  });

  for (const entryCase of [
    { teamName: "Sim Team 20", readyCount: 20, maxMs: 1800 },
    { teamName: "Sim Team 50", readyCount: 50, maxMs: 2200 },
    { teamName: "Sim Team 80", readyCount: 80, maxMs: 2600 }
  ]) {
    test(`board entry for ${entryCase.teamName} stays within a local latency budget`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport: { width: 1880, height: 980 }
      });
      const page = await context.newPage();

      const token = await loginAsSimulatorOwner(page);
      await waitForTeamReady(page, token, entryCase.teamName, entryCase.readyCount);
      const teamId = await getTeamId(page, token, entryCase.teamName);

      const startedAt = Date.now();
      await (async () => {
        await page.goto(`/?teamId=${teamId}`);
        await expect(page.getByRole("heading", { name: entryCase.teamName })).toBeVisible({ timeout: 30000 });
        await expect(page.locator(".participant-ring .member-tile:not(.measure-probe)").first()).toBeVisible();
      })();
      const entryDuration = Date.now() - startedAt;

      expect(entryDuration).toBeLessThan(entryCase.maxMs);
    });
  }

  test("switching between loaded simulator rooms stays within local latency budgets", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 1880, height: 980 }
    });
    const page = await context.newPage();

    const token = await loginAsSimulatorOwner(page);
    await waitForTeamReady(page, token, "Sim Team 80", 80);
    await waitForTeamReady(page, token, "Sim Team 20", 20);
    await openSimTeam(page, "Sim Team 80", 72);
    await waitForPerfIdle(page, 1000);

    const switchTo20 = await measureInteraction(page, "perf:switch-room:80-to-20", async () => {
      await switchToSimTeam(page, "Sim Team 20", 20);
    });
    expect(switchTo20.duration).toBeLessThan(2200);

    const switchBackTo80 = await measureInteraction(page, "perf:switch-room:20-to-80", async () => {
      await switchToSimTeam(page, "Sim Team 80", 72);
    });
    expect(switchBackTo80.duration).toBeLessThan(3000);
  });

  test("late votes after reveal are rejected and cannot mutate the result in Sim Team 80", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 1880, height: 980 }
    });
    const page = await context.newPage();

    const token = await loginAsSimulatorOwner(page);
    const teamName = "Sim Team 80";
    await waitForTeamReady(page, token, teamName, 72);
    const teamId = await getTeamId(page, token, teamName);
    await openSimTeam(page, teamName, 72);

    const title = `LOCK-${Date.now()}`;
    const createRoundResponse = await page.request.post(`/api/teams/${teamId}/rounds`, {
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      data: { title }
    });
    expect(createRoundResponse.ok()).toBe(true);

    await expect(page.getByRole("heading", { name: title })).toBeVisible({ timeout: 30000 });
    await page.getByRole("button", { name: "5", exact: true }).click();

    await expect
      .poll(async () => {
        const state = await readTeamState(page, token, teamId);
        return state.activeRound?.votes.length ?? 0;
      }, { timeout: 30000, intervals: [500, 750, 1000] })
      .toBeGreaterThanOrEqual(20);

    const activeState = await readTeamState(page, token, teamId);
    expect(activeState.activeRound).not.toBeNull();
    const roundId = activeState.activeRound!.id;

    const revealResponse = await page.request.post(`/api/teams/${teamId}/rounds/${roundId}/reveal`, {
      headers: {
        authorization: `Bearer ${token}`
      }
    });
    expect(revealResponse.ok()).toBe(true);
    const revealPayload = (await revealResponse.json()) as {
      round: {
        status: "active" | "revealed";
        revealAverage: string | number | null;
      };
    };
    expect(revealPayload.round.status).toBe("revealed");

    await expect(page.getByText(/Average score:/)).toContainText(String(revealPayload.round.revealAverage), { timeout: 15000 });

    const lateVoteResponse = await page.request.post(`/api/teams/${teamId}/rounds/${roundId}/vote`, {
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      data: { value: "8" }
    });
    expect(lateVoteResponse.status()).toBe(409);
    await expect(lateVoteResponse.json()).resolves.toEqual({
      error: "This round has already been revealed. Late votes are not accepted."
    });

    const revealedState = await readTeamState(page, token, teamId, true);
    expect(revealedState.activeRound?.status).toBe("revealed");
    expect(revealedState.activeRound?.revealAverage).toBe(revealPayload.round.revealAverage);
    expect(revealedState.history[0]?.title).toBe(title);
    expect(revealedState.history[0]?.averageScore).toBe(revealPayload.round.revealAverage);
  });

  test("repeated Sim Team 400 reveals keep history voter counts bounded to seeded participants", async ({ browser }) => {
    test.slow();

    const context = await browser.newContext({
      viewport: { width: 1880, height: 980 }
    });
    const page = await context.newPage();

    const token = await loginAsSimulatorOwner(page);
    const teamName = "Sim Team 400";
    const seededParticipantCount = 400;
    await waitForTeamReady(page, token, teamName, 360);
    const teamId = await getTeamId(page, token, teamName);
    await openSimTeam(page, teamName, 360);

    for (let roundIndex = 0; roundIndex < 3; roundIndex += 1) {
      const title = `BOUND-400-${Date.now()}-${roundIndex}`;
      const createRoundResponse = await page.request.post(`/api/teams/${teamId}/rounds`, {
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json"
        },
        data: { title }
      });
      expect(createRoundResponse.ok()).toBe(true);
      await expect(page.getByRole("heading", { name: title })).toBeVisible({ timeout: 30000 });

      await expect
        .poll(
          async () => {
            const state = await readTeamState(page, token, teamId);
            return state.activeRound?.votes.length ?? 0;
          },
          { timeout: 45000, intervals: [500, 750, 1000] }
        )
        .toBeGreaterThanOrEqual(120);

      const activeState = await readTeamState(page, token, teamId);
      expect(activeState.activeRound).not.toBeNull();
      expect(activeState.activeRound!.votes.length).toBeLessThanOrEqual(seededParticipantCount);
      expect(activeState.activeRound!.votedCount).toBeLessThanOrEqual(seededParticipantCount);
      expect(
        new Set(activeState.activeRound!.votes.map((vote) => vote.userId)).size,
        "active round should contain at most one vote per simulator participant"
      ).toBe(activeState.activeRound!.votes.length);

      const roundId = activeState.activeRound!.id;
      const revealResponse = await page.request.post(`/api/teams/${teamId}/rounds/${roundId}/reveal`, {
        headers: {
          authorization: `Bearer ${token}`
        }
      });
      expect(revealResponse.ok()).toBe(true);

      const revealedState = await readTeamState(page, token, teamId, true);
      const historyEntry = revealedState.history.find((entry) => entry.title === title);
      expect(historyEntry).toBeTruthy();
      expect(historyEntry!.participantCount).toBeLessThanOrEqual(seededParticipantCount);
      expect(historyEntry!.votes.length).toBe(historyEntry!.participantCount);
      expect(
        new Set(historyEntry!.votes.map((vote) => vote.userId)).size,
        "revealed history should contain at most one vote per simulator participant"
      ).toBe(historyEntry!.votes.length);
    }
  });
});
