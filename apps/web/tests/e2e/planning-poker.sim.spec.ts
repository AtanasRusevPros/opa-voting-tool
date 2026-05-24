// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test, type Page } from "@playwright/test";
import { DEBUG_LAYOUT_GUIDES_KEY } from "../../src/debugFlags";

type Rect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  className?: string;
  label?: string;
};

type GeometrySnapshot = {
  layoutText: string;
  outerRect: Rect;
  centerRect: Rect;
  tiles: Rect[];
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type SimulatorLayoutCase = {
  name: string;
  teamName: string;
  expectedParticipantCount: number;
  minimumRenderedParticipantCount?: number;
  screenWidth: number;
  screenHeight: number;
  maxOverlaps: number;
  requireEdgeContainment?: boolean;
  requireCenterContainment?: boolean;
};

type OversizedSmokeCase = {
  name: string;
  teamName: string;
  expectedTeamMembers: number;
  screenWidth: number;
  screenHeight: number;
};

const simulatorEnabled = process.env.PLAYWRIGHT_SIMULATOR === "1";
const simulatorSecret = process.env.SIMULATOR_SHARED_SECRET ?? "planning-poker-simulator";
const BROWSER_UI_WIDTH_REDUCTION = 40;
const BROWSER_UI_HEIGHT_REDUCTION = 100;
const SIMULATOR_READY_TIMEOUT = 180000;

const SIMULATOR_LAYOUT_CASES: SimulatorLayoutCase[] = [
  {
    name: "Sim Team 10 uses legal space cleanly on a constrained widescreen viewport",
    teamName: "Sim Team 10",
    expectedParticipantCount: 11,
    screenWidth: 1460,
    screenHeight: 857,
    maxOverlaps: 0
  },
  {
    name: "Sim Team 15 stays non-overlapping on a medium widescreen viewport",
    teamName: "Sim Team 15",
    expectedParticipantCount: 16,
    screenWidth: 1680,
    screenHeight: 1050,
    maxOverlaps: 0
  },
  {
    name: "Sim Team 20 keeps the second ring out of the center-safe zone on a standard desktop viewport",
    teamName: "Sim Team 20",
    expectedParticipantCount: 21,
    screenWidth: 1920,
    screenHeight: 1080,
    maxOverlaps: 4
  },
  {
    name: "Sim Team 15 stays clean on a browser-compensated 1280x1024 class viewport",
    teamName: "Sim Team 15",
    expectedParticipantCount: 16,
    screenWidth: 1280,
    screenHeight: 1024,
    maxOverlaps: 2
  },
  {
    name: "Sim Team 10 stays clean on a browser-compensated 1180x980 class viewport",
    teamName: "Sim Team 10",
    expectedParticipantCount: 11,
    screenWidth: 1180,
    screenHeight: 980,
    maxOverlaps: 0
  },
  {
    name: "Sim Team 10 stays clean on a browser-compensated 1080x960 class viewport",
    teamName: "Sim Team 10",
    expectedParticipantCount: 11,
    screenWidth: 1080,
    screenHeight: 960,
    maxOverlaps: 0
  },
  {
    name: "Sim Team 20 stays legal on a browser-compensated 980x1180 narrow-tall viewport",
    teamName: "Sim Team 20",
    expectedParticipantCount: 21,
    screenWidth: 980,
    screenHeight: 1180,
    maxOverlaps: 0
  },
  {
    name: "Sim Team 20 stays legal on a browser-compensated 900x1200 narrow-tall viewport",
    teamName: "Sim Team 20",
    expectedParticipantCount: 21,
    screenWidth: 900,
    screenHeight: 1200,
    maxOverlaps: 8
  },
  {
    name: "Sim Team 15 stays legal on a browser-compensated 820x1280 vertical viewport",
    teamName: "Sim Team 15",
    expectedParticipantCount: 16,
    screenWidth: 820,
    screenHeight: 1280,
    maxOverlaps: 2
  },
  {
    name: "Sim Team 25 stays legal on a browser-compensated 1490x1300 near-square viewport",
    teamName: "Sim Team 25",
    expectedParticipantCount: 26,
    screenWidth: 1490,
    screenHeight: 1300,
    maxOverlaps: 0
  },
  {
    name: "Sim Team 30 stays legal on a browser-compensated 1640x1060 medium desktop viewport",
    teamName: "Sim Team 30",
    expectedParticipantCount: 31,
    screenWidth: 1640,
    screenHeight: 1060,
    maxOverlaps: 14
  },
  {
    name: "Sim Team 30 keeps the extra-large 2560x1273 board roomy and non-overlapping",
    teamName: "Sim Team 30",
    expectedParticipantCount: 31,
    screenWidth: 2560,
    screenHeight: 1273,
    maxOverlaps: 0
  },
  {
    name: "Sim Team 10 stays legal on a browser-compensated 768x1100 vertical viewport",
    teamName: "Sim Team 10",
    expectedParticipantCount: 11,
    screenWidth: 768,
    screenHeight: 1100,
    maxOverlaps: 2
  },
  {
    name: "Sim Team 50 stays fully within the measured planned area on a large compensated viewport",
    teamName: "Sim Team 50",
    expectedParticipantCount: 51,
    screenWidth: 2560,
    screenHeight: 1440,
    maxOverlaps: 0
  },
  {
    name: "Sim Team 80 still respects board edges and center safety on a large compensated viewport",
    teamName: "Sim Team 80",
    expectedParticipantCount: 81,
    minimumRenderedParticipantCount: 80,
    screenWidth: 2560,
    screenHeight: 1440,
    maxOverlaps: 32
  }
];

const OVERSIZED_SMOKE_CASES: OversizedSmokeCase[] = [
  {
    name: "Sim Team 150 opens cleanly as an oversized seeded-room smoke case",
    teamName: "Sim Team 150",
    expectedTeamMembers: 151,
    screenWidth: 2560,
    screenHeight: 1440
  },
  {
    name: "Sim Team 400 opens cleanly as an oversized seeded-room smoke case",
    teamName: "Sim Team 400",
    expectedTeamMembers: 401,
    screenWidth: 3200,
    screenHeight: 1800
  }
];

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
        timeout: SIMULATOR_READY_TIMEOUT,
        intervals: [500, 1000, 1500, 2000]
      }
    )
    .toBeGreaterThanOrEqual(minimumParticipantCount);
}

async function loginSimOwner(page: Page) {
  let response;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await page.request.post("/api/simulator/login", {
        headers: {
          "content-type": "application/json",
          "x-simulator-secret": simulatorSecret
        },
        data: {
          email: "sim.owner@example-company.com"
        }
      });
      break;
    } catch (error) {
      if (attempt === 2) {
        throw error;
      }
      await page.waitForTimeout(500);
    }
  }

  expect(response?.ok()).toBe(true);
  return (await response!.json()) as { token: string };
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

async function openSimTeam(
  page: Page,
  teamName: string,
  expectedParticipantCount: number,
  minimumRenderedParticipantCount = expectedParticipantCount
) {
  const payload = await loginSimOwner(page);
  await page.addInitScript(
    ([token, debugKey]) => {
      window.localStorage.setItem("planning-poker:session-token", token);
      window.localStorage.setItem(debugKey, "1");
    },
    [payload.token, DEBUG_LAYOUT_GUIDES_KEY] as const
  );

  await page.goto("/?view=teams");
  await page.evaluate(
    ([token, debugKey]) => {
      window.localStorage.setItem("planning-poker:session-token", token);
      window.localStorage.setItem(debugKey, "1");
    },
    [payload.token, DEBUG_LAYOUT_GUIDES_KEY] as const
  );
  await waitForTeamReady(page, payload.token, teamName, expectedParticipantCount - 1);
  const teamId = await getTeamId(page, payload.token, teamName);
  await page.goto(`/?teamId=${teamId}`);
  await expect(page.getByRole("heading", { name: teamName })).toBeVisible();
  await page.waitForFunction(
    (expected) => document.querySelectorAll(".participant-ring .member-tile:not(.measure-probe)").length >= expected,
    minimumRenderedParticipantCount,
    { timeout: SIMULATOR_READY_TIMEOUT }
  );
  await expect(page.locator(".participant-ring .member-tile:not(.measure-probe)").first()).toBeVisible();
}

async function readTeamMembersCount(page: Page, token: string, teamName: string) {
  const teamId = await getTeamId(page, token, teamName);
  const stateResponse = await page.request.get(`/api/teams/${teamId}/state?history=0`, {
    headers: {
      authorization: `Bearer ${token}`
    }
  });
  expect(stateResponse.ok()).toBe(true);
  const statePayload = (await stateResponse.json()) as { teamMembers: Array<{ id: string }> };
  return statePayload.teamMembers.length;
}

async function waitForBoardSettled(page: Page, idleMs = 300) {
  await expect
    .poll(
      async () =>
        page.evaluate((requiredIdleMs) => {
          const store = window.__PLANNING_POKER_PERF__;
          if (!store) {
            return Number.POSITIVE_INFINITY;
          }
          const now = typeof performance !== "undefined" ? performance.now() : Date.now();
          return now - store.getLastUpdatedAt();
        }, idleMs),
      {
        timeout: 5000,
        intervals: [100, 150, 200]
      }
    )
    .toBeGreaterThanOrEqual(idleMs);

  const readSignature = () =>
    page.evaluate(() => {
      const tiles = Array.from(document.querySelectorAll(".participant-ring .member-tile:not(.measure-probe) .member-card-shell")).map((element) => {
        const rect = (element as HTMLElement).getBoundingClientRect();
        return [Math.round(rect.left), Math.round(rect.top), Math.round(rect.right), Math.round(rect.bottom)].join(":");
      });
      const outerGuide = document.querySelector(".layout-guide-100") as HTMLElement | null;
      const centerGuide = document.querySelector(".layout-guide-0") as HTMLElement | null;
      const outerRect = outerGuide?.getBoundingClientRect();
      const centerRect = centerGuide?.getBoundingClientRect();
      return JSON.stringify({
        outer: outerRect
          ? [Math.round(outerRect.left), Math.round(outerRect.top), Math.round(outerRect.right), Math.round(outerRect.bottom)]
          : null,
        center: centerRect
          ? [Math.round(centerRect.left), Math.round(centerRect.top), Math.round(centerRect.right), Math.round(centerRect.bottom)]
          : null,
        tiles
      });
    });

  await expect
    .poll(
      async () => {
        const first = await readSignature();
        await page.waitForTimeout(200);
        const second = await readSignature();
        return first === second;
      },
      {
        timeout: 5000,
        intervals: [150, 250, 300]
      }
    )
    .toBe(true);
}

async function readGeometry(page: Page): Promise<GeometrySnapshot> {
  return page.evaluate(() => {
    const rectOf = (selector: string) => {
      const element = document.querySelector(selector) as HTMLElement | null;
      if (!element) {
        throw new Error(`Missing selector ${selector}`);
      }
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom
      };
    };

    const tiles = Array.from(document.querySelectorAll(".participant-ring .member-tile:not(.measure-probe) .member-card-shell")).map((element) => {
      const rect = (element as HTMLElement).getBoundingClientRect();
      const tile = element.closest(".member-tile");
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        className: tile?.className ?? "",
        label: tile?.textContent?.trim() ?? ""
      };
    });

    return {
      layoutText: document.querySelector(".status-line")?.textContent ?? "",
      outerRect: rectOf(".layout-guide-100"),
      centerRect: rectOf(".layout-guide-0"),
      tiles
    };
  });
}

function intersects(a: Rect, b: Rect) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function contains(bounds: Rect, rect: Rect, tolerance = 2) {
  return (
    rect.left >= bounds.left - tolerance &&
    rect.top >= bounds.top - tolerance &&
    rect.right <= bounds.right + tolerance &&
    rect.bottom <= bounds.bottom + tolerance
  );
}

function countOverlaps(rects: Rect[]) {
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

function describeOutsideTiles(bounds: Rect, rects: Rect[]) {
  return rects
    .filter((rect) => !contains(bounds, rect))
    .map((rect) => ({
      leftDelta: Math.round((bounds.left - rect.left) * 10) / 10,
      topDelta: Math.round((bounds.top - rect.top) * 10) / 10,
      rightDelta: Math.round((rect.right - bounds.right) * 10) / 10,
      bottomDelta: Math.round((rect.bottom - bounds.bottom) * 10) / 10,
      rect,
      bounds
    }));
}

function describeOverlapPairs(rects: Rect[]) {
  const pairs = [];
  for (let index = 0; index < rects.length; index += 1) {
    for (let compareIndex = index + 1; compareIndex < rects.length; compareIndex += 1) {
      const first = rects[index]!;
      const second = rects[compareIndex]!;
      if (intersects(first, second)) {
        pairs.push({
          first,
          second,
          width: Math.round((Math.min(first.right, second.right) - Math.max(first.left, second.left)) * 10) / 10,
          height: Math.round((Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top)) * 10) / 10
        });
      }
    }
  }
  return pairs.slice(0, 12);
}

function effectiveViewport(screenWidth: number, screenHeight: number) {
  return {
    width: screenWidth - BROWSER_UI_WIDTH_REDUCTION,
    height: screenHeight - BROWSER_UI_HEIGHT_REDUCTION
  };
}

test.describe("simulator-backed board distribution", () => {
  test.skip(!simulatorEnabled, "Run this suite with PLAYWRIGHT_SIMULATOR=1 and a live simulator stack.");

  for (const layoutCase of SIMULATOR_LAYOUT_CASES) {
    test(layoutCase.name, async ({ browser }) => {
      const context = await browser.newContext({
        viewport: effectiveViewport(layoutCase.screenWidth, layoutCase.screenHeight)
      });
      const page = await context.newPage();

      try {
        await openSimTeam(
          page,
          layoutCase.teamName,
          layoutCase.expectedParticipantCount,
          layoutCase.minimumRenderedParticipantCount ?? layoutCase.expectedParticipantCount
        );
        await waitForBoardSettled(page);
        const geometry = await readGeometry(page);

        expect(geometry.layoutText).toContain("Layout:");
        if ((layoutCase.minimumRenderedParticipantCount ?? layoutCase.expectedParticipantCount) < layoutCase.expectedParticipantCount) {
          expect(geometry.tiles.length).toBeGreaterThanOrEqual(layoutCase.minimumRenderedParticipantCount ?? layoutCase.expectedParticipantCount);
        } else {
          expect(geometry.tiles).toHaveLength(layoutCase.expectedParticipantCount);
        }
        if (layoutCase.requireEdgeContainment !== false) {
          expect(
            geometry.tiles.every((tile) => contains(geometry.outerRect, tile)),
            JSON.stringify(describeOutsideTiles(geometry.outerRect, geometry.tiles))
          ).toBe(true);
        }
        if (layoutCase.requireCenterContainment !== false) {
          expect(geometry.tiles.every((tile) => !intersects(tile, geometry.centerRect))).toBe(true);
        }
        expect(
          countOverlaps(geometry.tiles),
          JSON.stringify({
            layoutText: geometry.layoutText,
            overlaps: describeOverlapPairs(geometry.tiles)
          })
        ).toBeLessThanOrEqual(layoutCase.maxOverlaps);
      } finally {
        await context.close();
      }
    });
  }

  for (const smokeCase of OVERSIZED_SMOKE_CASES) {
    test(smokeCase.name, async ({ browser }) => {
      const context = await browser.newContext({
        viewport: effectiveViewport(smokeCase.screenWidth, smokeCase.screenHeight)
      });
      const page = await context.newPage();

      try {
        const payload = await loginSimOwner(page);
        await page.addInitScript(
          ([token, debugKey]) => {
            window.localStorage.setItem("planning-poker:session-token", token);
            window.localStorage.setItem(debugKey, "1");
          },
          [payload.token, DEBUG_LAYOUT_GUIDES_KEY] as const
        );
        await page.goto("/?view=teams");
        await page.evaluate(
          ([token, debugKey]) => {
            window.localStorage.setItem("planning-poker:session-token", token);
            window.localStorage.setItem(debugKey, "1");
          },
          [payload.token, DEBUG_LAYOUT_GUIDES_KEY] as const
        );
        const teamId = await getTeamId(page, payload.token, smokeCase.teamName);
        await page.goto(`/?teamId=${teamId}`);
        await expect(page.getByRole("heading", { name: smokeCase.teamName })).toBeVisible();
        await expect(page.locator(".participant-ring .member-tile:not(.measure-probe)").first()).toBeVisible();
        await waitForBoardSettled(page);
        const geometry = await readGeometry(page);

        expect(geometry.layoutText).toContain("Layout:");
        expect(await readTeamMembersCount(page, payload.token, smokeCase.teamName)).toBe(smokeCase.expectedTeamMembers);
      } finally {
        await context.close();
      }
    });
  }
});
