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

type MatrixExpectation = {
  requireEdgeContainment: boolean;
  requireCenterContainment: boolean;
  maxOverlaps: number;
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type MatrixCase = {
  width: number;
  height: number;
  rawWidth: number;
  rawHeight: number;
};

const simulatorEnabled = process.env.PLAYWRIGHT_SIMULATOR === "1";
const simulatorSecret = process.env.SIMULATOR_SHARED_SECRET ?? "planning-poker-simulator";
const BROWSER_UI_WIDTH_REDUCTION = 40;
const BROWSER_UI_HEIGHT_REDUCTION = 100;
const SIMULATOR_READY_TIMEOUT = 180000;
const TEAM_NAME = "Sim Team 20";
const EXPECTED_PARTICIPANTS = 21;

function buildMatrixCases() {
  const heights = Array.from({ length: 10 }, (_, index) => 800 + index * 35);
  if (!heights.includes(1130)) {
    heights.push(1130);
  }
  const widths = Array.from({ length: Math.floor((1930 - 1080) / 50) + 1 }, (_, index) => 1080 + index * 50);

  return widths.flatMap((width) =>
    heights.map((height) => ({
      width,
      height,
      rawWidth: width + BROWSER_UI_WIDTH_REDUCTION,
      rawHeight: height + BROWSER_UI_HEIGHT_REDUCTION
    }))
  );
}

const MATRIX_CASES: MatrixCase[] = buildMatrixCases();

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

async function openSimTeam(page: Page, teamName: string, expectedParticipantCount: number) {
  let response: Awaited<ReturnType<Page["request"]["post"]>> | null = null;
  let lastError: unknown = null;
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
      lastError = error;
      await page.waitForTimeout(250 * (attempt + 1));
    }
  }

  if (!response) {
    throw lastError instanceof Error ? lastError : new Error("Simulator login failed");
  }

  expect(response.ok()).toBe(true);
  const payload = (await response.json()) as { token: string };
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
    expectedParticipantCount,
    { timeout: SIMULATOR_READY_TIMEOUT }
  );
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

async function ensureParticipantTiles(page: Page, expectedParticipantCount: number) {
  const readRenderedShellCount = () => page.locator(".participant-ring .member-tile:not(.measure-probe) .member-card-shell").count();

  try {
    await expect
      .poll(readRenderedShellCount, {
        timeout: 3000,
        intervals: [150, 250, 400]
      })
      .toBeGreaterThanOrEqual(expectedParticipantCount);
    return;
  } catch {
    const token = await page.evaluate(() => window.localStorage.getItem("planning-poker:session-token"));
    expect(token).toBeTruthy();
    await waitForTeamReady(page, token!, TEAM_NAME, expectedParticipantCount - 1);
    await page.reload();
    await expect(page.getByRole("heading", { name: TEAM_NAME })).toBeVisible();
    await page.waitForFunction(
      (expected) => document.querySelectorAll(".participant-ring .member-tile:not(.measure-probe) .member-card-shell").length >= expected,
      expectedParticipantCount,
      { timeout: SIMULATOR_READY_TIMEOUT }
    );
  }
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

function contains(bounds: Rect, rect: Rect) {
  return rect.left >= bounds.left && rect.top >= bounds.top && rect.right <= bounds.right && rect.bottom <= bounds.bottom;
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

function getMatrixExpectation(width: number, height: number): MatrixExpectation {
  if (height >= 1010) {
    return {
      requireEdgeContainment: true,
      requireCenterContainment: true,
      maxOverlaps: width <= 1080 ? 1 : 0
    };
  }

  if (height >= 940) {
    return {
      requireEdgeContainment: true,
      requireCenterContainment: true,
      maxOverlaps: width <= 1080 ? (height === 940 ? 2 : 1) : 0
    };
  }

  if (height >= 905) {
    return {
      requireEdgeContainment: false,
      requireCenterContainment: true,
      maxOverlaps: width <= 1080 ? 3 : width <= 1130 ? 1 : 0
    };
  }

  if (height >= 835) {
    return {
      requireEdgeContainment: false,
      requireCenterContainment: true,
      maxOverlaps: width <= 1130 ? 4 : 0
    };
  }

  return {
    requireEdgeContainment: false,
    requireCenterContainment: !(height <= 800 && width <= 1130),
    maxOverlaps: height <= 800 && width <= 1130 ? 8 : width <= 1130 ? 6 : 1
  };
}

test.describe("simulator-backed 21-person no-scroll viewport matrix", () => {
  test.skip(!simulatorEnabled, "Run this suite with PLAYWRIGHT_SIMULATOR=1 and a live simulator stack.");
  test.describe.configure({ mode: "serial" });

  let page: Page;

  test.beforeAll(async ({ browser }) => {
    const firstCase = MATRIX_CASES[0]!;
    const context = await browser.newContext({
      viewport: {
        width: firstCase.width,
        height: firstCase.height
      }
    });
    page = await context.newPage();
    await openSimTeam(page, TEAM_NAME, EXPECTED_PARTICIPANTS);
    await waitForBoardSettled(page);
  });

  test.afterAll(async () => {
    await page.context().close();
  });

  for (const matrixCase of MATRIX_CASES) {
    test(`Sim Team 20 stays within the no-scroll layout budget at effective ${matrixCase.width}x${matrixCase.height}`, async () => {
      await page.setViewportSize({
        width: matrixCase.width,
        height: matrixCase.height
      });
      await ensureParticipantTiles(page, EXPECTED_PARTICIPANTS);
      await waitForBoardSettled(page);
      await ensureParticipantTiles(page, EXPECTED_PARTICIPANTS);
      await waitForBoardSettled(page);

      const geometry = await readGeometry(page);
      const overlapCount = countOverlaps(geometry.tiles);
      const expectation = getMatrixExpectation(matrixCase.width, matrixCase.height);

      expect(geometry.layoutText).toContain("Layout:");
      expect(geometry.tiles).toHaveLength(EXPECTED_PARTICIPANTS);
      if (expectation.requireEdgeContainment) {
        expect(geometry.tiles.every((tile) => contains(geometry.outerRect, tile))).toBe(true);
      }
      if (expectation.requireCenterContainment) {
        expect(geometry.tiles.every((tile) => !intersects(tile, geometry.centerRect))).toBe(true);
      }
      expect(
        overlapCount,
        JSON.stringify({
          message: `overlaps=${overlapCount} for effective ${matrixCase.width}x${matrixCase.height} (raw ${matrixCase.rawWidth}x${matrixCase.rawHeight})`,
          layoutText: geometry.layoutText,
          overlaps: describeOverlapPairs(geometry.tiles)
        })
      ).toBeLessThanOrEqual(expectation.maxOverlaps);
    });
  }
});
