// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test, type Page } from "@playwright/test";

const SELECTED_TEAM_KEY = "planning-poker:selected-team";

const DEFAULT_TEST_PASSWORD = "Password123!";
let uniqueEmailCounter = 0;

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function uniqueEmail(prefix: string, domain = "example-company.com") {
  uniqueEmailCounter += 1;
  return `${prefix}-${Date.now()}-${uniqueEmailCounter}@${domain}`;
}

async function openDebugCodeSetup(page: Page, email: string) {
  await page.goto("/");
  await page.getByLabel("Email").fill(email);
  const forgotPasswordButton = page.getByRole("button", { name: "Forgot password" });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await forgotPasswordButton.click();
      const setupBecameVisible = await expect
        .poll(
          async () => {
            if (await page.getByText("Development code:").isVisible().catch(() => false)) {
              return true;
            }
            if (await page.getByLabel("16-digit code").isVisible().catch(() => false)) {
              return true;
            }
            return false;
          },
          { timeout: 5000 }
        )
        .toBe(true)
        .then(() => true)
        .catch(() => false);
      if (setupBecameVisible) {
        break;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isTransientClickRerender =
        message.includes("element is not visible") ||
        message.includes("element was detached from the DOM") ||
        message.includes("Target page, context or browser has been closed");
      if (!isTransientClickRerender || attempt === 2) {
        throw error;
      }
      await expect(forgotPasswordButton).toBeVisible();
    }
  }
  await expect(page.getByText("Development code:")).toBeVisible();
}

async function loginWithDebugCode(page: Page, email: string, displayName: string, password = DEFAULT_TEST_PASSWORD) {
  await openDebugCodeSetup(page, email);
  await expect(page.getByText("remembered automatically for 3 months of activity")).toBeVisible();
  const debugCodeText = await page.getByText("Development code:").textContent();
  const debugCode = debugCodeText?.match(/\d{16}/)?.[0];
  expect(debugCode).toBeTruthy();

  await page.getByLabel("16-digit code").fill(debugCode!);
  await page.getByLabel("Display name").fill(displayName);
  await page.getByPlaceholder("Set or reset your password").fill(password);
  await page.getByPlaceholder("Repeat the password").fill(password);
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page.getByRole("heading", { name: "Choose your team" })).toBeVisible();
}

async function loginWithEnter(page: Page, email: string, displayName: string) {
  await openDebugCodeSetup(page, email);
  await expect(page.getByText("remembered automatically for 3 months of activity")).toBeVisible();
  const debugCodeText = await page.getByText("Development code:").textContent();
  const debugCode = debugCodeText?.match(/\d{16}/)?.[0];
  expect(debugCode).toBeTruthy();

  await page.getByLabel("16-digit code").fill(debugCode!);
  await page.getByLabel("Display name").fill(displayName);
  await page.getByPlaceholder("Set or reset your password").fill(DEFAULT_TEST_PASSWORD);
  await page.getByPlaceholder("Repeat the password").fill(DEFAULT_TEST_PASSWORD);
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page.getByRole("heading", { name: "Choose your team" })).toBeVisible();
}

async function loginWithEnterAfterAvatarSelection(page: Page, email: string, displayName: string) {
  await page.goto("/");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Forgot password" }).click();

  await expect(page.locator(".avatar-option.selected")).toHaveCount(1);
  await expect(page.locator(".color-option.selected")).toHaveCount(1);
  const debugCodeText = await page.getByText("Development code:").textContent();
  const debugCode = debugCodeText?.match(/\d{16}/)?.[0];
  expect(debugCode).toBeTruthy();

  await page.getByLabel("16-digit code").fill(debugCode!);
  await page.getByLabel("Display name").fill(displayName);
  await page.locator(".avatar-option").nth(3).click();
  await page.locator(".color-option").nth(4).click();
  await page.getByPlaceholder("Set or reset your password").fill(DEFAULT_TEST_PASSWORD);
  await page.getByPlaceholder("Repeat the password").fill(DEFAULT_TEST_PASSWORD);
  await page.locator(".color-option").nth(4).press("Enter");
  await expect(page.getByRole("heading", { name: "Choose your team" })).toBeVisible();
}

async function signInWithPassword(page: Page, email: string, password = DEFAULT_TEST_PASSWORD) {
  await page.goto("/");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect
    .poll(
      async () => {
        if (await page.getByRole("heading", { name: "Choose your team" }).isVisible().catch(() => false)) {
          return "chooser";
        }
        if (await page.getByRole("button", { name: "Open main menu" }).isVisible().catch(() => false)) {
          return "board";
        }
        return "";
      },
      { timeout: 15000 }
    )
    .not.toBe("");
}

async function signInAsSuperAdmin(
  page: Page,
  username = process.env.E2E_SUPER_ADMIN_USERNAME ?? process.env.SUPER_ADMIN_USERNAME ?? "platform-admin",
  password = process.env.E2E_SUPER_ADMIN_PASSWORD ?? process.env.SUPER_ADMIN_PASSWORD ?? "PlatformAdmin123!"
) {
  await page.goto("/");
  await page.getByRole("button", { name: "Admin" }).click();
  await page.getByLabel("Admin username").fill(username);
  await page.getByLabel("Admin password").fill(password);
  await page.getByRole("button", { name: "Admin sign in" }).click();
  await expect
    .poll(
      async () => {
        if (await page.getByRole("heading", { name: "Choose your team" }).isVisible().catch(() => false)) {
          return "chooser";
        }
        if (await page.getByRole("button", { name: "Platform settings" }).isVisible().catch(() => false)) {
          return "chooser-actions";
        }
        if (await page.getByRole("button", { name: "Open main menu" }).isVisible().catch(() => false)) {
          return "board";
        }
        return "";
      },
      { timeout: 15000 }
    )
    .not.toBe("");
}

async function switchTeam(page: Page, teamName: string) {
  await page.getByRole("button", { name: /^Switch team$/ }).click();
  await page.getByRole("menu", { name: "Switch team menu" }).waitFor();
  await page.getByRole("menuitem", { name: teamName, exact: true }).click();
}

async function enableRevealDebug(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("planning-poker:debug-reveal", "1");
  });
}

async function createTeam(page: Page, teamName: string) {
  const createTeamButton = page.getByRole("button", { name: "Create a team" });
  if ((await createTeamButton.count()) === 0) {
    const openChooserButton = page.getByRole("button", { name: "Open main menu" });
    if ((await openChooserButton.count()) > 0) {
      await openChooserButton.click();
    }
  }
  await expect(createTeamButton).toBeVisible();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await createTeamButton.click();
      break;
    } catch (error) {
      if (attempt === 2) {
        throw error;
      }
      await expect(createTeamButton).toBeVisible();
    }
  }
  await page.getByLabel("Team title").fill(teamName);
  await page.getByRole("button", { name: "Create and join" }).click({ force: true, noWaitAfter: true });
  try {
    await waitForTeamBoard(page, teamName, 30000);
  } catch {
    const alreadyOpened = await expect
      .poll(
        async () =>
          (await page.locator(".board-shell").isVisible().catch(() => false)) ||
          (await page.locator("h1").filter({ hasText: teamName }).first().isVisible().catch(() => false)),
        { timeout: 5000 }
      )
      .toBe(true)
      .then(
        () => true,
        () => false
      );
    if (alreadyOpened) {
      return;
    }
    const openButton = (await getChooserTeamRow(page, teamName, 30000)).getByRole("button", { name: "Open" });
    await expect(openButton).toBeVisible({ timeout: 30000 });
    await openButton.click();
    await waitForTeamBoard(page, teamName, 30000);
  }
}

async function startRound(page: Page, title: string) {
  const nextTitleInput = page.getByPlaceholder("Type title (min 5 chars)");
  const issueTitleInput = page.getByLabel("Issue title");
  await expect
    .poll(
      async () => {
        if (await nextTitleInput.isVisible().catch(() => false)) {
          return "deal";
        }
        if (await issueTitleInput.isVisible().catch(() => false)) {
          return "start";
        }
        return "";
      },
      { timeout: 5000 }
    )
    .not.toBe("");

  if (await nextTitleInput.isVisible().catch(() => false)) {
    await nextTitleInput.fill(title);
    await page.getByRole("button", { name: "Deal" }).click();
    return;
  }

  await issueTitleInput.fill(title);
  await page.getByRole("button", { name: "Start voting" }).click();
}

async function completeRound(page: Page, title: string, voteValue = "5") {
  await startRound(page, title);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await page.getByRole("button", { name: voteValue, exact: true }).click();
  await expect(page.getByText(`Vote submitted: ${voteValue}.`)).toBeVisible();
  await page.getByRole("button", { name: "Reveal score" }).click();
  await expectRevealedAverage(page, voteValue);
}

async function addCommentToRevealedIssue(page: Page, issueTitle: string, commentBody: string) {
  const issueCard = page.locator(".history-card").filter({
    has: page.locator(".history-card-title", { hasText: issueTitle })
  }).first();
  await expect(issueCard).toBeVisible();
  await issueCard.getByRole("button", { name: /comments \(\d+\)/i }).click();
  await page.getByLabel(`Add comment for ${issueTitle}`).fill(commentBody);
  await page.getByRole("button", { name: "Add comment" }).click();
  await expect(page.locator(".history-comment-body")).toContainText(commentBody);
}

function readTeamIdFromCurrentUrl(page: Page): string {
  const currentUrl = new URL(page.url());
  const teamId = currentUrl.searchParams.get("teamId");
  expect(teamId).toBeTruthy();
  return teamId!;
}

async function expectInsideBox(page: Page, containerSelector: string, childSelector: string) {
  const boxes = await page.evaluate(
    ({ containerSelector: container, childSelector: child }) => {
      const containerElement = document.querySelector(container);
      const childElement = document.querySelector(child);
      if (!containerElement || !childElement) {
        return null;
      }
      const containerBox = containerElement.getBoundingClientRect();
      const childBox = childElement.getBoundingClientRect();
      return {
        container: {
          left: containerBox.left,
          right: containerBox.right,
          top: containerBox.top,
          bottom: containerBox.bottom
        },
        child: {
          left: childBox.left,
          right: childBox.right,
          top: childBox.top,
          bottom: childBox.bottom
        }
      };
    },
    { containerSelector, childSelector }
  );

  expect(boxes).not.toBeNull();
  expect(boxes!.child.left).toBeGreaterThanOrEqual(boxes!.container.left - 1);
  expect(boxes!.child.right).toBeLessThanOrEqual(boxes!.container.right + 1);
  expect(boxes!.child.top).toBeGreaterThanOrEqual(boxes!.container.top - 1);
  expect(boxes!.child.bottom).toBeLessThanOrEqual(boxes!.container.bottom + 1);
}

async function expectNoHorizontalDocumentOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth
  }));
  expect(metrics.documentScrollWidth).toBeLessThanOrEqual(metrics.viewportWidth + 2);
  expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.viewportWidth + 2);
}

async function expectInsideViewport(page: Page, selector: string) {
  const box = await page.evaluate((targetSelector) => {
    const target = document.querySelector(targetSelector);
    if (!target) {
      return null;
    }
    const rect = target.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight
    };
  }, selector);

  expect(box).not.toBeNull();
  expect(box!.left).toBeGreaterThanOrEqual(-1);
  expect(box!.right).toBeLessThanOrEqual(box!.viewportWidth + 1);
  expect(box!.top).toBeGreaterThanOrEqual(-1);
  expect(box!.bottom).toBeLessThanOrEqual(box!.viewportHeight + 1);
}

async function expectElementContentFits(page: Page, selector: string) {
  const metrics = await page.evaluate((targetSelector) => {
    const target = document.querySelector(targetSelector) as HTMLElement | null;
    if (!target) {
      return null;
    }
    const computed = window.getComputedStyle(target);
    return {
      clientWidth: target.clientWidth,
      scrollWidth: target.scrollWidth,
      clientHeight: target.clientHeight,
      scrollHeight: target.scrollHeight,
      lineHeight: Number.parseFloat(computed.lineHeight || "0")
    };
  }, selector);

  expect(metrics).not.toBeNull();
  expect(metrics!.scrollWidth).toBeLessThanOrEqual(metrics!.clientWidth + 2);
  expect(metrics!.scrollHeight).toBeLessThanOrEqual(metrics!.clientHeight + Math.max(2, metrics!.lineHeight * 0.25));
}

async function expectNoOverlappingMatches(page: Page, selector: string) {
  const overlaps = await page.evaluate((targetSelector) => {
    const elements = Array.from(document.querySelectorAll(targetSelector))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          width: rect.width,
          height: rect.height,
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom
        };
      })
      .filter((rect) => rect.width > 1 && rect.height > 1);

    const collisions: Array<[number, number]> = [];
    for (let index = 0; index < elements.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < elements.length; otherIndex += 1) {
        const first = elements[index]!;
        const second = elements[otherIndex]!;
        const horizontalOverlap = Math.min(first.right, second.right) - Math.max(first.left, second.left);
        const verticalOverlap = Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top);
        if (horizontalOverlap > 1 && verticalOverlap > 1) {
          collisions.push([index, otherIndex]);
        }
      }
    }

    return collisions;
  }, selector);

  expect(overlaps).toEqual([]);
}

async function expectNoOverlapBetweenSelectorAndMatches(page: Page, fixedSelector: string, matchSelector: string) {
  const overlaps = await page.evaluate(
    ({ targetSelector, candidatesSelector }) => {
      const target = document.querySelector(targetSelector);
      if (!target) {
        return null;
      }
      const targetRect = target.getBoundingClientRect();
      const candidates = Array.from(document.querySelectorAll(candidatesSelector))
        .map((element, index) => {
          const rect = element.getBoundingClientRect();
          return {
            index,
            width: rect.width,
            height: rect.height,
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom
          };
        })
        .filter((rect) => rect.width > 1 && rect.height > 1);

      const collisions = candidates
        .filter((candidate) => {
          const horizontalOverlap = Math.min(targetRect.right, candidate.right) - Math.max(targetRect.left, candidate.left);
          const verticalOverlap = Math.min(targetRect.bottom, candidate.bottom) - Math.max(targetRect.top, candidate.top);
          return horizontalOverlap > 1 && verticalOverlap > 1;
        })
        .map((candidate) => candidate.index);

      return collisions;
    },
    { targetSelector: fixedSelector, candidatesSelector: matchSelector }
  );

  expect(overlaps).not.toBeNull();
  expect(overlaps).toEqual([]);
}

async function expectSelectorsNotOverlapping(page: Page, firstSelector: string, secondSelector: string) {
  const boxes = await page.evaluate(
    ({ firstSelector: first, secondSelector: second }) => {
      const firstElement = document.querySelector(first);
      const secondElement = document.querySelector(second);
      if (!firstElement || !secondElement) {
        return null;
      }
      const firstBox = firstElement.getBoundingClientRect();
      const secondBox = secondElement.getBoundingClientRect();
      return {
        first: {
          left: firstBox.left,
          right: firstBox.right,
          top: firstBox.top,
          bottom: firstBox.bottom
        },
        second: {
          left: secondBox.left,
          right: secondBox.right,
          top: secondBox.top,
          bottom: secondBox.bottom
        }
      };
    },
    { firstSelector, secondSelector }
  );

  expect(boxes).not.toBeNull();
  const horizontalOverlap = Math.min(boxes!.first.right, boxes!.second.right) - Math.max(boxes!.first.left, boxes!.second.left);
  const verticalOverlap = Math.min(boxes!.first.bottom, boxes!.second.bottom) - Math.max(boxes!.first.top, boxes!.second.top);
  expect(horizontalOverlap > 1 && verticalOverlap > 1).toBe(false);
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

function teamBoardHeading(page: Page, teamName: string) {
  return page.locator("h1").filter({ hasText: teamName }).first();
}

async function waitForTeamBoard(page: Page, teamName: string, timeout = 10000) {
  const boardHeading = teamBoardHeading(page, teamName);
  const switchTeamButton = page.getByRole("button", { name: /^Switch team$/ });
  await expect
    .poll(
      async () => {
        if (await boardHeading.isVisible().catch(() => false)) {
          return "heading";
        }
        try {
          const currentUrl = new URL(page.url());
          if (currentUrl.searchParams.get("teamId") && (await switchTeamButton.isVisible().catch(() => false))) {
            return "board-shell";
          }
        } catch {
          return "";
        }
        return "";
      },
      { timeout }
    )
    .not.toBe("");
  await expect(boardHeading).toBeVisible({ timeout });
}

async function openTeamFromChooserOrWaitForAutoOpen(page: Page, teamName: string, timeout = 10000) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await waitForTeamBoard(page, teamName, timeout);
      return;
    } catch (error) {
      if (attempt === 2) {
        throw error;
      }
      const openButton = (await getChooserTeamRow(page, teamName, timeout)).getByRole("button", { name: "Open" });
      await expect(openButton).toBeVisible({ timeout });
      await openButton.click({ force: true, noWaitAfter: true });
      await page.waitForTimeout(200);
    }
  }
}

async function requestAccessToVisibleTeam(page: Page, teamName: string) {
  let teamRow: Locator | null = null;
  try {
    teamRow = page.locator(".team-list-row").filter({ has: page.locator("strong", { hasText: teamName }) }).first();
    await expect(teamRow).toBeVisible();
  } catch {
    const openChooserButton = page.getByRole("button", { name: "Open main menu" });
    if ((await openChooserButton.count()) > 0) {
      await openChooserButton.click();
    }
    teamRow = page.locator(".team-list-row").filter({ has: page.locator("strong", { hasText: teamName }) }).first();
    await expect(teamRow).toBeVisible();
  }
  await expect(teamRow).toBeVisible();
  const requestButton = teamRow.getByRole("button", { name: "Request access" });
  await expect(requestButton).toBeVisible();
  await requestButton.click();
  await expect(teamRow.getByRole("button", { name: "Pending" })).toBeVisible();
}

async function admitJoinRequestFromMembersModal(page: Page, requesterName: string) {
  await page.getByRole("button", { name: "Team admin" }).click();
  const peopleDialog = page.getByRole("dialog", { name: /people$/ });
  await expect(peopleDialog).toBeVisible();
  const requestRow = peopleDialog.locator(".directory-row").filter({ hasText: requesterName }).first();
  await expect(requestRow).toBeVisible();
  await requestRow.getByRole("button", { name: "Admit" }).click();
  await expect(peopleDialog.getByText("No pending requests.")).toBeVisible();
  await peopleDialog.getByRole("button", { name: "Close" }).click();
  await expect(peopleDialog).toHaveCount(0);
}

async function joinVisibleTeam(page: Page, adminPage: Page, teamName: string, requesterName: string) {
  await requestAccessToVisibleTeam(page, teamName);
  await admitJoinRequestFromMembersModal(adminPage, requesterName);
  await openTeamFromChooserOrWaitForAutoOpen(page, teamName);
}

async function expectRevealedAverage(page: Page, score: string) {
  await page.waitForFunction(
    (expected) => {
      const centerPanel = document.querySelector(".center-panel");
      return centerPanel?.textContent?.includes(`Average score: ${expected}`) ?? false;
    },
    score,
    { timeout: 20000 }
  );
}

async function readActiveBoardTimerSeconds(page: Page) {
  const timerText = (await page.locator(".board-timer-active").textContent())?.trim() ?? "";
  const match = timerText.match(/(\d+)s$/);
  return match ? Number.parseInt(match[1]!, 10) : null;
}

function memberVoteCard(page: Page, displayName: string) {
  return page.locator(".member-tile", { has: page.locator("strong", { hasText: displayName }) }).locator(".vote-card");
}

function attachBrowserIssueCapture(page: Page) {
  const issues: string[] = [];

  page.on("pageerror", (error) => {
    issues.push(`pageerror:${error.message}`);
  });

  page.on("console", (message) => {
    const type = message.type();
    if (type !== "error") {
      return;
    }

    const text = message.text();
    if (text.includes("/api/auth/session 401")) {
      return;
    }
    if (text.includes("Failed to load resource: the server responded with a status of 401")) {
      return;
    }

    issues.push(`console:${text}`);
  });

  return () => {
    expect(issues).toEqual([]);
  };
}

async function resetPerf(page: Page) {
  await page.evaluate(() => {
    window.__PLANNING_POKER_PERF__?.reset();
    performance.clearMarks();
    performance.clearMeasures();
  });
}

async function snapshotPerf(page: Page) {
  return page.evaluate(
    () =>
      window.__PLANNING_POKER_PERF__?.snapshot() ?? {
        boardLayoutCalcs: 0,
        participantRingRenders: 0,
        historyRailRenders: 0
      }
  );
}

test("login, vote, reveal, session persistence, profile save, and deck switching stay usable", async ({ page }) => {
  const teamName = `Stability Team ${Date.now()}`;
  const secondTeamName = `${teamName} Beta`;
  const email = uniqueEmail("tester");
  page.on("console", (message) => {
    console.log(`[browser:${message.type()}] ${message.text()}`);
  });

  await enableRevealDebug(page);
  await loginWithDebugCode(page, email, "QA Tester");
  await createTeam(page, teamName);

  await page.getByLabel("Issue title").fill("ISSUE-19234");
  await page.getByRole("button", { name: "Start voting" }).click();
  await page.getByRole("button", { name: "5", exact: true }).click();
  await expect(page.getByText("Vote submitted: 5.")).toBeVisible();
  await expect(memberVoteCard(page, "QA Tester")).toHaveText("5");

  await page.getByRole("button", { name: "Reveal score" }).click();
  await expectRevealedAverage(page, "5");
  await expect(page.getByRole("button", { name: "Vote this issue again" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Deal" })).toBeVisible();
  await expect(page.getByPlaceholder("Type title (min 5 chars)")).toBeVisible();
  await expect(page.getByRole("button", { name: "Deal" })).toBeDisabled();
  await page.getByPlaceholder("Type title (min 5 chars)").fill("ABCD");
  await expect(page.getByRole("button", { name: "Deal" })).toBeDisabled();
  await page.getByPlaceholder("Type title (min 5 chars)").fill("ABCDE");
  await expect(page.getByRole("button", { name: "Deal" })).toBeEnabled();

  await expect(page.getByText(/^Voting:/)).toHaveCount(0);
  await expect(page.getByText(/joined to team/i)).toHaveCount(0);
  await page.getByRole("button", { name: "Open team settings" }).click();
  await page.getByRole("button", { name: "Numbering system" }).click();
  await page.getByRole("button", { name: "T-Shirt" }).click();
  await page.getByRole("dialog", { name: "Numbering system menu" }).getByRole("button", { name: "Save numbering" }).click();
  await expect(page.getByText("Team numbering system updated to T-Shirt.")).toBeVisible();
  await expect(page.getByRole("button", { name: "XS" })).toBeVisible();
  await expect(page.getByRole("button", { name: "XL" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Break Pls" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Team admin" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open main menu" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Switch team$/ })).toBeVisible();

  await page.getByRole("button", { name: "Edit profile" }).click();
  const accountSettings = page.getByRole("dialog", { name: "Account settings" });
  await expect(accountSettings).toBeVisible();
  await accountSettings.getByRole("button", { name: "Edit display name" }).click();
  await accountSettings.getByRole("textbox", { name: "Display name" }).fill("QA Lead");
  await accountSettings.getByRole("button", { name: "Save display name" }).click();
  await expect(page.getByText("Your name and avatar are updated for the team.")).toBeVisible();
  await expect(accountSettings).toBeVisible();
  await accountSettings.getByRole("button", { name: "Close" }).click();
  await expect(accountSettings).toBeHidden();

  await page.getByRole("button", { name: "Open main menu" }).click();
  await page.getByRole("button", { name: "Create a team" }).click();
  await page.getByLabel("Team title").fill(secondTeamName);
  await page.getByRole("button", { name: "Create and join" }).click({ force: true, noWaitAfter: true });
  await expect(page.getByRole("heading", { name: secondTeamName })).toBeVisible();
  await page.getByLabel("Issue title").fill("OPS-77");
  await page.getByRole("button", { name: "Start voting" }).click();
  await page.getByRole("button", { name: "2", exact: true }).click();
  await page.getByRole("button", { name: "Reveal score" }).click();
  await expect(page.locator(".history-card-title").getByText("OPS-77")).toBeVisible();

  await switchTeam(page, teamName);
  await expect(page.getByRole("heading", { name: teamName })).toBeVisible();
  await expect(page.locator(".history-card-title").getByText("ISSUE-19234")).toBeVisible();
  await expect(page.locator(".history-card-title").getByText("OPS-77")).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("heading", { name: teamName })).toBeVisible();
  await expectRevealedAverage(page, "5");
  await expect(page.locator(".history-card-title").getByText("ISSUE-19234")).toBeVisible({ timeout: 10000 });
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Vote AGAIN", exact: true }).click();
  await expect(page.getByRole("heading", { name: "ISSUE-19234" })).toBeVisible();
  await page.getByRole("button", { name: "XS", exact: true }).click();
  await expect(page.getByText("Vote submitted: XS.")).toBeVisible();
  await expect(memberVoteCard(page, "QA Lead")).toHaveText("XS");
  await expect(page.locator(".member-tile strong", { hasText: "QA Lead" })).toBeVisible();
});

test("super-admin can open the platform settings modal from the chooser", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 640 });
  await signInAsSuperAdmin(page);

  const settingsDialog = page.getByRole("dialog", { name: "Platform settings" });
  await expect(page.getByRole("button", { name: "Platform settings" })).toBeVisible();
  await page.getByRole("button", { name: "Platform settings" }).click();
  await expect(settingsDialog).toBeVisible();
  await expect(settingsDialog.getByRole("button", { name: "Save settings" })).toHaveCount(1);
  await expect(settingsDialog.getByRole("button", { name: "Close" })).toHaveCount(1);
  await expect(settingsDialog.locator(".admin-settings-actions")).toHaveCount(0);
  await expectInsideBox(page, ".admin-settings-modal", ".admin-settings-top-actions");
  await settingsDialog.getByRole("tab", { name: "Branding" }).click();
  await expect(settingsDialog.getByLabel("Footer creator text")).toBeVisible();
  await expectInsideBox(page, ".admin-settings-modal", ".admin-settings-top-actions");
  await settingsDialog.getByRole("tab", { name: "App settings" }).click();
  await expect(settingsDialog.getByLabel("Base URL")).toBeVisible();
  await expectInsideBox(page, ".admin-settings-modal", ".admin-settings-top-actions");
  await settingsDialog.getByRole("tab", { name: "People" }).click();
  await expect(settingsDialog.getByLabel("Sort")).toBeVisible();
  await expectInsideBox(page, ".admin-settings-modal", ".admin-settings-top-actions");
  await settingsDialog.getByRole("tab", { name: "Super-admin" }).click();
  await expect(settingsDialog.getByRole("button", { name: "Reveal admin password" })).toBeVisible();
  await expectInsideBox(page, ".admin-settings-modal", ".admin-settings-top-actions");
});

test("a normal user can delete their account and register fresh with the same email", async ({ page }) => {
  const email = uniqueEmail("self-delete");

  await loginWithDebugCode(page, email, "Delete Me");
  await page.getByRole("button", { name: "Account" }).click();
  const accountSettings = page.getByRole("dialog", { name: "Account settings" });
  await accountSettings.getByRole("button", { name: "Review account deletion" }).click();

  const deletionDialog = page.getByRole("dialog", { name: "Confirm account deletion" });
  await expect(deletionDialog).toBeVisible();
  await deletionDialog.getByLabel("Current password").fill(DEFAULT_TEST_PASSWORD);
  await deletionDialog.getByLabel(/Type DELETE MY ACCOUNT to confirm/).fill("DELETE MY ACCOUNT");
  const deletionResponsePromise = page.waitForResponse(
    (response) => response.url().endsWith("/api/account/delete") && response.request().method() === "POST"
  );
  await deletionDialog.getByRole("button", { name: "Delete account" }).click();
  const deletionResponse = await deletionResponsePromise;
  expect(deletionResponse.ok()).toBe(true);

  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await loginWithDebugCode(page, email, "Delete Me Fresh");
  await expect(page.getByRole("heading", { name: "Choose your team" })).toBeVisible();
});

test("demo mode is super-admin-only and shows seeded demo teams when enabled", async ({ page }) => {
  const assertNoBrowserIssues = attachBrowserIssueCapture(page);
  const settingsDialog = page.getByRole("dialog", { name: "Platform settings" });

  await signInAsSuperAdmin(page);
  await page.getByRole("button", { name: "Platform settings" }).click();
  await expect(settingsDialog).toBeVisible();
  await settingsDialog.getByRole("tab", { name: "App settings" }).click();
  await page.getByLabel("Enable super-admin demo mode").check();
  await settingsDialog.getByRole("button", { name: "Save settings" }).first().click();
  await settingsDialog.getByRole("button", { name: "Close" }).first().click();

  const demoTeamRow = await getChooserTeamRow(page, "Demo Team 10", 15000);
  await expect(demoTeamRow.getByText("Demo", { exact: true })).toBeVisible();
  await openTeamFromChooserOrWaitForAutoOpen(page, "Demo Team 10", 15000);
  await expect(page.locator(".member-tile:not(.measure-probe)")).toHaveCount(10);
  await expect(page.locator(".member-identity strong", { hasText: "Demo 001" })).toBeVisible();

  await page.getByRole("button", { name: "Open main menu" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await loginWithDebugCode(page, uniqueEmail("demo-visibility"), "Demo Visibility");
  await expect(page.getByText("Demo Team 10")).toHaveCount(0);

  await page.getByRole("button", { name: "Sign out" }).click();
  await signInAsSuperAdmin(page);
  await page.getByRole("button", { name: "Platform settings" }).click();
  await settingsDialog.getByRole("tab", { name: "App settings" }).click();
  await page.getByLabel("Enable super-admin demo mode").uncheck();
  await settingsDialog.getByRole("button", { name: "Save settings" }).first().click();
  await page.getByRole("dialog", { name: "Platform settings" }).getByRole("button", { name: "Close" }).first().click();
  await expect(page.getByText("Demo Team 10")).toHaveCount(0);

  assertNoBrowserIssues();
});

test("the unified login screen still allows requesting the dev code for first-time access", async ({ page }) => {
  await loginWithEnter(page, `enter-login-${Date.now()}@example-company.com`, "Enter Login");
  await expect(page.getByRole("heading", { name: "Choose your team" })).toBeVisible();
});

test("a new user gets a preselected avatar and Enter still signs in after avatar selection", async ({ page }) => {
  await loginWithEnterAfterAvatarSelection(page, `enter-avatar-${Date.now()}@example-company.com`, "Avatar Enter");
  await expect(page.getByRole("heading", { name: "Choose your team" })).toBeVisible();
});

test("pressing Enter creates a team from the chooser", async ({ page }) => {
  const teamName = `Enter Team ${Date.now()}`;

  await loginWithDebugCode(page, uniqueEmail("enter-team"), "Enter Team User");
  const openChooserButton = page.getByRole("button", { name: "Open main menu" });
  if ((await openChooserButton.count()) > 0) {
    await openChooserButton.click();
  }
  await page.getByRole("button", { name: "Create a team" }).click();
  await page.getByLabel("Team title").fill(teamName);
  await page.getByLabel("Team title").press("Enter");

  await expect(page.getByRole("heading", { name: teamName })).toBeVisible();
});

test("custom Fibonacci ranges, keyboard shortcuts, and shared history comments stay usable together", async ({ page }) => {
  const teamName = `Phase4C ${Date.now()}`;
  const assertNoBrowserIssues = attachBrowserIssueCapture(page);

  await loginWithDebugCode(page, uniqueEmail("phase4c"), "Phase 4C User");
  await createTeam(page, teamName);

  await page.getByRole("button", { name: "Open team settings" }).click();
  await page.getByRole("button", { name: "Numbering system" }).click();
  await page.getByRole("button", { name: "Fibonacci", exact: true }).click();
  await page.getByLabel("Use custom Fibonacci range").check();
  await page.getByLabel("Start").selectOption("1");
  await page.getByLabel("End").selectOption("13");
  await page.getByRole("dialog", { name: "Numbering system menu" }).getByRole("button", { name: "Save numbering" }).click();
  await expect(page.getByText("Team numbering system updated to Fibonacci 1-13.")).toBeVisible();
  await expect(page.getByRole("button", { name: "13", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "21", exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Open team settings" }).click();
  await page.getByRole("button", { name: "Keyboard shortcuts" }).click();
  await expect(page.getByText("Open the keyboard shortcuts help modal.")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.keyboard.press("Shift+/");
  await expect(page.locator(".shortcuts-modal")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".shortcuts-modal")).toHaveCount(0);

  await page.getByLabel("Issue title").fill("PHASE4C-101");
  await page.getByLabel("Issue title").press("Enter");
  await expect(page.getByRole("heading", { name: "PHASE4C-101" })).toBeVisible();

  await page.keyboard.press("1");
  await expect(page.getByText("Vote submitted: 1.")).toBeVisible();
  await expect(memberVoteCard(page, "Phase 4C User")).toHaveText("1");

  await page.keyboard.press("r");
  await expectRevealedAverage(page, "1");

  await page.getByRole("button", { name: /comments \(0\)/i }).click();
  await page.getByLabel("Add comment for PHASE4C-101").fill("Shared note from Phase C.");
  await page.getByRole("button", { name: "Add comment" }).click();
  await expect(page.locator(".history-comment-body")).toContainText("Shared note from Phase C.");

  await page.reload();
  await expect(page.getByRole("heading", { name: teamName })).toBeVisible();
  await expectRevealedAverage(page, "1");
  await expect(page.getByRole("button", { name: "13", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "21", exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: /comments \(1\)/i }).click();
  await expect(page.locator(".history-comment-body")).toContainText("Shared note from Phase C.");

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Vote AGAIN", exact: true }).click();
  await expect(page.getByRole("button", { name: "Reveal score" })).toBeVisible();
  await expect(page.getByText("Average score: 1")).toHaveCount(0);

  assertNoBrowserIssues();
});

test("numbering settings stay usable on compact viewport heights", async ({ page }) => {
  const teamName = `Compact Numbering ${Date.now()}`;

  await page.setViewportSize({ width: 1280, height: 640 });
  await loginWithDebugCode(page, uniqueEmail("compact-numbering"), "Compact Numbering User");
  await createTeam(page, teamName);

  await page.getByRole("button", { name: "Open team settings" }).click();
  await page.getByRole("button", { name: "Numbering system" }).click();

  const numberingMenu = page.getByRole("dialog", { name: "Numbering system menu" });
  await expect(numberingMenu).toBeVisible();
  await page.getByRole("button", { name: "Fibonacci", exact: true }).click();
  await page.getByLabel("Use custom Fibonacci range").check();
  await page.getByLabel("End").selectOption("13");
  await expect(numberingMenu.getByRole("button", { name: "Save numbering" })).toBeVisible();
  await numberingMenu.getByRole("button", { name: "Save numbering" }).click();

  await expect(page.getByText("Team numbering system updated to Fibonacci 1-13.")).toBeVisible();
});

test("right-side history resizing persists and is disabled in stacked layout", async ({ page }) => {
  const teamName = `History Resize ${Date.now()}`;

  await page.setViewportSize({ width: 1400, height: 900 });
  await loginWithDebugCode(page, `history-resize-${Date.now()}@example-company.com`, "History Resize User");
  await createTeam(page, teamName);

  const handle = page.getByRole("button", { name: "Resize issues list" });
  await expect(handle).toBeVisible();

  const initialWidth = await page.locator(".board-shell").evaluate((element) => {
    return (element as HTMLElement).style.getPropertyValue("--history-rail-width");
  });

  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x - 160, box!.y + box!.height / 2, { steps: 8 });
  await page.mouse.up();

  await expect
    .poll(async () =>
      page.locator(".board-shell").evaluate((element) => (element as HTMLElement).style.getPropertyValue("--history-rail-width"))
    )
    .not.toBe(initialWidth);

  const resizedWidth = await page.locator(".board-shell").evaluate((element) => {
    return (element as HTMLElement).style.getPropertyValue("--history-rail-width");
  });
  expect(Number.parseInt(resizedWidth, 10)).toBeGreaterThan(Number.parseInt(initialWidth, 10));
  await expect
    .poll(async () => page.evaluate(() => window.localStorage.getItem("planning-poker:history-rail-width")))
    .toBe(String(Number.parseInt(resizedWidth, 10)));

  await page.reload();
  await expect(page.getByRole("heading", { name: teamName })).toBeVisible();
  await expect
    .poll(async () =>
      page.locator(".board-shell").evaluate((element) => (element as HTMLElement).style.getPropertyValue("--history-rail-width"))
    )
    .toBe(resizedWidth);

  await page.setViewportSize({ width: 900, height: 900 });
  await expect(page.locator(".history-resize-handle")).toBeHidden();
});

test("stacked bottom history resizing uses a real bottom row and clamps its height", async ({ page }) => {
  const teamName = `Stacked History ${Date.now()}`;

  await page.setViewportSize({ width: 900, height: 900 });
  await loginWithDebugCode(page, `stacked-history-${Date.now()}@example-company.com`, "Stacked History User");
  await createTeam(page, teamName);

  const handle = page.getByRole("button", { name: "Resize issues list height" });
  await expect(handle).toBeVisible();
  await expect(page.locator(".history-resize-handle")).toBeHidden();

  const initialHeight = await page.locator(".board-shell").evaluate((element) => {
    return (element as HTMLElement).style.getPropertyValue("--stacked-history-height");
  });

  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2, box!.y - 140, { steps: 8 });
  await page.mouse.up();

  await expect
    .poll(async () =>
      page.locator(".board-shell").evaluate((element) => (element as HTMLElement).style.getPropertyValue("--stacked-history-height"))
    )
    .not.toBe(initialHeight);

  const expandedHeight = await page.locator(".board-shell").evaluate((element) => {
    return (element as HTMLElement).style.getPropertyValue("--stacked-history-height");
  });
  expect(Number.parseInt(expandedHeight, 10)).toBeGreaterThan(Number.parseInt(initialHeight, 10));
  await expect
    .poll(async () => page.evaluate(() => window.localStorage.getItem("planning-poker:stacked-history-height")))
    .toBe(String(Number.parseInt(expandedHeight, 10)));

  const expandedBox = await handle.boundingBox();
  expect(expandedBox).not.toBeNull();
  await page.mouse.move(expandedBox!.x + expandedBox!.width / 2, expandedBox!.y + expandedBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(expandedBox!.x + expandedBox!.width / 2, expandedBox!.y + 900, { steps: 12 });
  await page.mouse.up();

  await expect
    .poll(async () =>
      Number.parseInt(
        await page.locator(".board-shell").evaluate((element) => (element as HTMLElement).style.getPropertyValue("--stacked-history-height")),
        10
      )
    )
    .toBeLessThanOrEqual(140);
  const collapsedHeight = Number.parseInt(
    await page.locator(".board-shell").evaluate((element) => (element as HTMLElement).style.getPropertyValue("--stacked-history-height")),
    10
  );
  expect(collapsedHeight).toBeGreaterThanOrEqual(90);

  const boardMainBox = await page.locator(".board-main").boundingBox();
  const historyBox = await page.locator(".stacked-history-panel").boundingBox();
  const statusBox = await page.locator(".status-line").boundingBox();
  expect(boardMainBox).not.toBeNull();
  expect(historyBox).not.toBeNull();
  expect(statusBox).not.toBeNull();
  expect(boardMainBox!.y + boardMainBox!.height).toBeLessThanOrEqual(historyBox!.y + 2);
  expect(statusBox!.y + statusBox!.height).toBeLessThanOrEqual(historyBox!.y + 2);
  expect(Math.abs(historyBox!.y + historyBox!.height - 900)).toBeLessThanOrEqual(2);
});

test("extra-small laptop stacked history never covers the bottom voting cards", async ({ browser }) => {
  test.setTimeout(120000);

  const viewports = [
    { width: 756, height: 713 }
  ];
  const runTag = Date.now();

  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const teamName = `Tiny Laptop ${viewport.width}x${viewport.height} ${runTag}`;

    try {
      await loginWithDebugCode(page, `tiny-${viewport.width}-${viewport.height}-${runTag}@example-company.com`, "Tiny Laptop User");
      await createTeam(page, teamName);
      await startRound(page, `TINY-${viewport.width}`);
      await expect(page.getByRole("button", { name: "5", exact: true })).toBeVisible();
      await page.locator(".card-rail-wrap").scrollIntoViewIfNeeded();

      const cardRailBox = await page.locator(".card-rail-wrap").boundingBox();
      const historyBox = await page.locator(".stacked-history-panel").boundingBox();
      const statusBox = await page.locator(".status-line").boundingBox();
      const boardScrollMetrics = await page.locator(".board-scroll-area").evaluate((element) => ({
        overflowY: getComputedStyle(element).overflowY,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight
      }));

      expect(cardRailBox).not.toBeNull();
      expect(historyBox).not.toBeNull();
      expect(statusBox).not.toBeNull();
      expect(cardRailBox!.y + cardRailBox!.height).toBeLessThanOrEqual(historyBox!.y + 2);
      expect(statusBox!.y + statusBox!.height).toBeLessThanOrEqual(historyBox!.y + 2);
      expect(Math.abs(historyBox!.y + historyBox!.height - viewport.height)).toBeLessThanOrEqual(2);
      expect(["auto", "hidden"]).toContain(boardScrollMetrics.overflowY);
      expect(boardScrollMetrics.clientHeight).toBeGreaterThan(0);
      expect(boardScrollMetrics.scrollHeight).toBeGreaterThanOrEqual(boardScrollMetrics.clientHeight);
    } finally {
      await context.close();
    }
  }
});

test("board and stacked issues list do not clip horizontally at mobile baseline widths", async ({ page }) => {
  const runTag = Date.now();
  await loginWithDebugCode(page, `responsive-baseline-${runTag}@example-company.com`, "Responsive Baseline User");
  await createTeam(page, `Responsive Baseline ${runTag}`);
  await startRound(page, "RESP-375");

  for (const viewport of [
    { width: 959, height: 820 },
    { width: 600, height: 820 },
    { width: 400, height: 740 },
    { width: 390, height: 844 },
    { width: 375, height: 812 }
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.locator(".board-shell")).toBeVisible();
    await expect(page.locator(".stacked-history-panel")).toBeVisible();
    await expectNoHorizontalDocumentOverflow(page);
    await expectInsideBox(page, ".board-shell", ".board-main");
    await expectInsideBox(page, ".board-shell", ".stacked-history-panel");

    await page.getByRole("tab", { name: "Search" }).click();
    await expect(page.getByRole("checkbox", { name: /exact title match/i })).toBeVisible();
    await expectInsideBox(page, ".history-search-form", ".history-search-grid");
    await expectInsideBox(page, ".history-search-form", ".history-search-toggle");
    const exactMatchLayout = await page.evaluate(() => {
      const toggle = document.querySelector(".history-search-toggle");
      const label = document.querySelector(".history-search-toggle span");
      const checkbox = document.querySelector(".history-search-toggle input");
      if (!toggle || !label || !checkbox) {
        return null;
      }
      const toggleBox = toggle.getBoundingClientRect();
      const labelBox = label.getBoundingClientRect();
      const checkboxBox = checkbox.getBoundingClientRect();
      return {
        labelWidth: labelBox.width,
        labelHeight: labelBox.height,
        toggleHeight: toggleBox.height,
        checkboxCenterY: checkboxBox.top + checkboxBox.height / 2,
        toggleCenterY: toggleBox.top + toggleBox.height / 2
      };
    });
    expect(exactMatchLayout).not.toBeNull();
    expect(exactMatchLayout!.labelWidth).toBeGreaterThan(44);
    expect(exactMatchLayout!.labelHeight).toBeLessThanOrEqual(exactMatchLayout!.toggleHeight);
    expect(Math.abs(exactMatchLayout!.checkboxCenterY - exactMatchLayout!.toggleCenterY)).toBeLessThanOrEqual(4);
  }
});

test("phase 16 header stays readable and the bell popup stays inside the viewport across narrow widths", async ({ page }) => {
  const runTag = Date.now();
  const initialTeamName = `Phase 16 Header ${runTag}`;
  const longTeamName = `Phase16 Header ${runTag} Long Team Name Mobile Wrap Check`;

  await loginWithDebugCode(page, `phase16-header-${runTag}@example-company.com`, "Phase 16 Header User");
  await createTeam(page, initialTeamName);
  await page.getByRole("button", { name: "Open team settings" }).click();
  await page.getByRole("button", { name: "Rename team" }).click();
  await page.getByRole("textbox", { name: "Rename team" }).fill(longTeamName);
  await page.getByRole("button", { name: "Save team name" }).click();
  await expect(page.locator(".team-name-row h1")).toContainText(longTeamName);

  for (const viewport of [
    { width: 1279, height: 900 },
    { width: 1100, height: 820 },
    { width: 968, height: 820 },
    { width: 900, height: 820 },
    { width: 820, height: 820 },
    { width: 768, height: 820 },
    { width: 700, height: 820 },
    { width: 640, height: 820 },
    { width: 390, height: 844 },
    { width: 375, height: 812 }
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.locator(".screen-header-bar")).toBeVisible();
    await expectNoHorizontalDocumentOverflow(page);
    await expectInsideBox(page, ".screen-header", ".screen-header-bar");
    await expectSelectorsNotOverlapping(page, ".team-branding", ".header-toolbar");
    await expectNoOverlappingMatches(page, ".header-toolbar > *");
    await expectNoOverlappingMatches(page, ".team-name-row > *");
    await expectElementContentFits(page, ".team-name-row h1");

    await page.getByRole("button", { name: "Open notifications" }).click();
    await expect(page.getByRole("dialog", { name: "Notifications" })).toBeVisible();
    await expectInsideViewport(page, ".notification-panel");
    await expectNoHorizontalDocumentOverflow(page);
    await page.getByRole("button", { name: "Open notifications" }).click();
    await expect(page.locator(".notification-panel")).toHaveCount(0);
  }
});

test("phase 16 center voting controls stay compact and off the participant ring at narrow widths", async ({ browser }) => {
  test.slow();
  const runTag = Date.now();

  for (const viewport of [
    { width: 720, height: 1225 },
    { width: 700, height: 1225 },
    { width: 640, height: 1100 },
    { width: 390, height: 844 },
    { width: 375, height: 812 }
  ]) {
    const context = await browser.newContext({ viewport });
    const ownerPage = await context.newPage();
    const memberContext = await browser.newContext({ viewport });
    const memberPage = await memberContext.newPage();
    const teamName = `Phase 16 center ${viewport.width} ${runTag}`;

    try {
      await loginWithDebugCode(ownerPage, `phase16-center-owner-${viewport.width}-${runTag}@example-company.com`, "Center Owner");
      await createTeam(ownerPage, teamName);
      await loginWithDebugCode(memberPage, `phase16-center-member-${viewport.width}-${runTag}@example-company.com`, "Center Member");
      await joinVisibleTeam(memberPage, ownerPage, teamName, "Center Member");

      await startRound(ownerPage, `CENTER-${viewport.width}`);
      await expect(ownerPage.getByRole("heading", { name: `CENTER-${viewport.width}` })).toBeVisible();
      await expect(ownerPage.locator(".participant-ring .member-tile:not(.measure-probe)")).toHaveCount(2);
      await expectNoHorizontalDocumentOverflow(ownerPage);
      await expectInsideViewport(ownerPage, ".center-panel");
      await expectNoOverlapBetweenSelectorAndMatches(
        ownerPage,
        ".center-panel",
        ".participant-ring .member-tile:not(.measure-probe)"
      );

      const centerMetrics = await ownerPage.locator(".center-panel").evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return {
          width: rect.width,
          viewportWidth: window.innerWidth
        };
      });

      if (viewport.width <= 480) {
        expect(centerMetrics.width).toBeLessThanOrEqual(302);
      } else if (viewport.width <= 720) {
        expect(centerMetrics.width).toBeLessThanOrEqual(336);
      } else {
        expect(centerMetrics.width).toBeLessThanOrEqual(344);
      }
      expect(centerMetrics.width).toBeLessThan(centerMetrics.viewportWidth - 20);
    } finally {
      await memberContext.close();
      await context.close();
    }
  }
});

test("team rename, sign out, and later password sign-in stay usable", async ({ page }) => {
  const email = `password-flow-${Date.now()}@example-company.com`;
  const teamName = `Rename Team ${Date.now()}`;
  const renamedTeam = `${teamName} Prime`;

  await loginWithDebugCode(page, email, "Password Flow User");
  await createTeam(page, teamName);

  await page.getByRole("button", { name: "Open team settings" }).click();
  await page.getByRole("button", { name: "Rename team" }).click();
  await expect(page.getByRole("dialog", { name: "Rename team panel" })).toBeVisible();
  await page.getByRole("textbox", { name: "Rename team" }).fill(renamedTeam);
  await page.getByRole("button", { name: "Save team name" }).click();
  await expect(page.getByRole("heading", { name: renamedTeam })).toBeVisible();

  await page.getByRole("button", { name: "Open main menu" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByText("OPA Voting Tool")).toBeVisible();

  await signInWithPassword(page, email);
  await expect(
    page
      .getByRole("heading", { name: "Choose your team" })
      .or(page.getByRole("heading", { name: renamedTeam }))
  ).toBeVisible();
  await expect(page.getByText(renamedTeam)).toBeVisible();
});

test("two users see live team join, round, vote, reveal, and next-round updates", async ({ browser }) => {
  const aliceContext = await browser.newContext();
  const bobContext = await browser.newContext();
  const alicePage = await aliceContext.newPage();
  const bobPage = await bobContext.newPage();
  const teamName = `Realtime Team ${Date.now()}`;
  const aliceEmail = uniqueEmail("alice");
  const bobEmail = uniqueEmail("bob", "example-partner.com");

  try {
    alicePage.on("console", (message) => {
      console.log(`[alice:${message.type()}] ${message.text()}`);
    });
    bobPage.on("console", (message) => {
      console.log(`[bob:${message.type()}] ${message.text()}`);
    });

    await enableRevealDebug(alicePage);
    await enableRevealDebug(bobPage);
    await loginWithDebugCode(alicePage, aliceEmail, "Alice");
    await createTeam(alicePage, teamName);

    await loginWithDebugCode(bobPage, bobEmail, "Bob");
    await joinVisibleTeam(bobPage, alicePage, teamName, "Bob");

    await expect(alicePage.locator(".member-tile strong", { hasText: "Bob" })).toBeVisible();
    await expect(memberVoteCard(alicePage, "Bob")).toHaveText("Waiting");
    await expect(memberVoteCard(alicePage, "Bob").locator(".vote-card-label-diagonal")).toBeVisible();

    await alicePage.getByRole("button", { name: "Edit profile" }).click();
    const accountSettings = alicePage.getByRole("dialog", { name: "Account settings" });
    await expect(accountSettings).toBeVisible();
    await accountSettings.locator(".color-option").nth(8).click();
    const avatarSrc = await accountSettings.locator(".avatar-option").nth(5).locator("img").getAttribute("src");
    await expect(alicePage.getByText("Your name and avatar are updated for the team.")).toBeVisible();
    const editDisplayNameButton = accountSettings.getByRole("button", { name: "Edit display name" });
    await expect(editDisplayNameButton).toBeEnabled();
    await editDisplayNameButton.click();
    await expect(accountSettings.getByRole("button", { name: "Save display name" })).toBeVisible();
    const displayNameInput = accountSettings.getByRole("textbox", { name: "Display name" });
    await expect(displayNameInput).toBeEditable();
    await displayNameInput.fill("Alice Prime");
    await accountSettings.getByRole("button", { name: "Save display name" }).click();
    await accountSettings.locator(".avatar-option").nth(5).click();
    await expect(alicePage.locator(".profile-preview")).toContainText("Alice Prime");
    await expect(bobPage.locator(".member-tile strong", { hasText: "Alice Prime" })).toBeVisible();
    await expect(bobPage.locator(".member-tile", { has: bobPage.locator("strong", { hasText: "Alice Prime" }) }).locator(".member-avatar-corner")).toHaveAttribute("src", avatarSrc ?? "");
    await accountSettings.getByRole("button", { name: "Close" }).click();
    await expect(accountSettings).toBeHidden();

    await alicePage.getByLabel("Issue title").fill("LIVE-101");
    await alicePage.getByRole("button", { name: "Start voting" }).click();

    await expect(bobPage.getByRole("heading", { name: "LIVE-101" })).toBeVisible();

    await alicePage.getByRole("button", { name: "3", exact: true }).click();
    await expect(alicePage.getByText("Vote submitted: 3.")).toBeVisible();
    await expect(memberVoteCard(bobPage, "Alice Prime")).toHaveText("Voted");

    await bobPage.getByRole("button", { name: "5", exact: true }).click();
    await expect(bobPage.getByText("Vote submitted: 5.")).toBeVisible();
    await expect(memberVoteCard(alicePage, "Bob")).toHaveText("Voted");

    await bobPage.getByRole("button", { name: "Reveal score" }).click();
    await expectRevealedAverage(bobPage, "4");
    await expect(memberVoteCard(alicePage, "Alice Prime")).toHaveText("3");
    await expect(memberVoteCard(alicePage, "Bob")).toHaveText("5");
    await expect(bobPage.locator(".history-card-title").getByText("LIVE-101")).toBeVisible();

    await bobPage.reload();
    await expect(bobPage.getByRole("heading", { name: teamName })).toBeVisible();
    await expectRevealedAverage(bobPage, "4");

    bobPage.once("dialog", (dialog) => dialog.accept());
    await bobPage.getByRole("button", { name: "Vote AGAIN", exact: true }).click();
    await expect(alicePage.getByRole("heading", { name: "LIVE-101" })).toBeVisible();
    await expect(bobPage.getByRole("heading", { name: "LIVE-101" })).toBeVisible();
    await expect(memberVoteCard(alicePage, "Alice Prime")).toHaveText("No vote");
    await expect(memberVoteCard(bobPage, "Bob")).toHaveText("No vote");

    await alicePage.getByRole("button", { name: "2", exact: true }).click();
    await expect(memberVoteCard(bobPage, "Alice Prime")).toHaveText("Voted");
    await bobPage.getByRole("button", { name: "3", exact: true }).click();
    await alicePage.getByRole("button", { name: "Reveal score" }).click();
    await expectRevealedAverage(bobPage, "2.5");
    await expect(memberVoteCard(alicePage, "Alice Prime")).toHaveText("2");
    await expect(memberVoteCard(alicePage, "Bob")).toHaveText("3");

    await expect(alicePage.getByRole("button", { name: "Deal" })).toBeDisabled();
    await alicePage.getByPlaceholder("Type title (min 5 chars)").fill("LIVE-102");
    await expect(alicePage.getByRole("button", { name: "Deal" })).toBeEnabled();
    await alicePage.getByRole("button", { name: "Deal" }).click();
    await expect(bobPage.getByRole("heading", { name: "LIVE-102" })).toBeVisible();
    await expect(memberVoteCard(alicePage, "Alice Prime")).toHaveText("No vote");
    await expect(memberVoteCard(bobPage, "Bob")).toHaveText("No vote");
  } finally {
    await aliceContext.close();
    await bobContext.close();
  }
});

test("reload, team switching, and vote-again keep clients converged across active and revealed rounds", async ({ browser }) => {
  const aliceContext = await browser.newContext();
  const bobContext = await browser.newContext();
  const alicePage = await aliceContext.newPage();
  const bobPage = await bobContext.newPage();
  const sharedTeamName = `Phase2 Shared ${Date.now()}`;
  const bobHomeTeamName = `${sharedTeamName} Home`;

  try {
    await loginWithDebugCode(alicePage, `phase2-alice-${Date.now()}@example-company.com`, "Phase2 Alice");
    await createTeam(alicePage, sharedTeamName);

    await loginWithDebugCode(bobPage, `phase2-bob-${Date.now()}@example-partner.com`, "Phase2 Bob");
    await createTeam(bobPage, bobHomeTeamName);
    await joinVisibleTeam(bobPage, alicePage, sharedTeamName, "Phase2 Bob");

    await alicePage.getByLabel("Issue title").fill("PHASE2-101");
    await alicePage.getByRole("button", { name: "Start voting" }).click();
    await alicePage.getByRole("button", { name: "3", exact: true }).click();

    await bobPage.reload();
    await expect(bobPage.getByRole("heading", { name: sharedTeamName })).toBeVisible();
    await expect(bobPage.getByRole("heading", { name: "PHASE2-101" })).toBeVisible();
    await expect(memberVoteCard(bobPage, "Phase2 Alice")).toHaveText("Voted");

    await bobPage.getByRole("button", { name: "5", exact: true }).click();
    await expect(memberVoteCard(alicePage, "Phase2 Bob")).toHaveText("Voted");

    await switchTeam(bobPage, bobHomeTeamName);
    await expect(bobPage.getByRole("heading", { name: bobHomeTeamName })).toBeVisible();

    await alicePage.getByRole("button", { name: "Reveal score" }).click();
    await expectRevealedAverage(alicePage, "4");

    await switchTeam(bobPage, sharedTeamName);
    await expect(bobPage.getByRole("heading", { name: sharedTeamName })).toBeVisible();
    await expectRevealedAverage(bobPage, "4");
    await expect(memberVoteCard(bobPage, "Phase2 Alice")).toHaveText("3");
    await expect(memberVoteCard(bobPage, "Phase2 Bob")).toHaveText("5");

    alicePage.once("dialog", (dialog) => dialog.accept());
    await alicePage.getByRole("button", { name: "Vote AGAIN", exact: true }).click();
    await expect(bobPage.getByRole("heading", { name: "PHASE2-101" })).toBeVisible();
    await expect(memberVoteCard(alicePage, "Phase2 Alice")).toHaveText("No vote");
    await expect(memberVoteCard(bobPage, "Phase2 Bob")).toHaveText("No vote");

    await bobPage.reload();
    await expect(bobPage.getByRole("heading", { name: sharedTeamName })).toBeVisible();
    await expect(bobPage.getByRole("heading", { name: "PHASE2-101" })).toBeVisible();
    await expect(memberVoteCard(bobPage, "Phase2 Alice")).toHaveText("No vote");
    await expect(memberVoteCard(bobPage, "Phase2 Bob")).toHaveText("No vote");
  } finally {
    await aliceContext.close();
    await bobContext.close();
  }
});

test("offline stale tabs recover on focus and pageshow after live round updates", async ({ browser }) => {
  const ownerContext = await browser.newContext();
  const memberContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  const memberPage = await memberContext.newPage();
  const teamName = `Focus Recovery ${Date.now()}`;

  try {
    await loginWithDebugCode(ownerPage, `focus-owner-${Date.now()}@example-company.com`, "Focus Owner");
    await createTeam(ownerPage, teamName);

    await loginWithDebugCode(memberPage, `focus-member-${Date.now()}@example-partner.com`, "Focus Member");
    await joinVisibleTeam(memberPage, ownerPage, teamName, "Focus Member");

    await memberContext.setOffline(true);

    await ownerPage.getByLabel("Issue title").fill("FOCUS-101");
    await ownerPage.getByRole("button", { name: "Start voting" }).click();
    await ownerPage.getByRole("button", { name: "8", exact: true }).click();
    await ownerPage.getByRole("button", { name: "Reveal score" }).click();
    await expectRevealedAverage(ownerPage, "8");

    await memberContext.setOffline(false);
    await memberPage.evaluate(() => {
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: false }));
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await expect(memberPage.getByRole("heading", { name: teamName })).toBeVisible();
    await expectRevealedAverage(memberPage, "8");
    await expect(memberVoteCard(memberPage, "Focus Owner")).toHaveText("8");
  } finally {
    await ownerContext.close();
    await memberContext.close();
  }
});

test("team timer auto-reveals across reconnects and resets for vote again", async ({ browser }) => {
  const ownerContext = await browser.newContext();
  const memberContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  const memberPage = await memberContext.newPage();
  const teamName = `Timed Room ${Date.now()}`;

  try {
    await loginWithDebugCode(ownerPage, `timer-owner-${Date.now()}@example-company.com`, "Timer Owner");
    await createTeam(ownerPage, teamName);

    await ownerPage.getByRole("button", { name: "Open team timer settings" }).click();
    await ownerPage.getByRole("button", { name: "10s" }).click();
    await expect(ownerPage.locator(".board-timer-idle")).toContainText("Timer 10s");

    await loginWithDebugCode(memberPage, `timer-member-${Date.now()}@example-company.com`, "Timer Member");
    await joinVisibleTeam(memberPage, ownerPage, teamName, "Timer Member");

    await ownerPage.getByLabel("Issue title").fill("TIMER-101");
    await ownerPage.getByRole("button", { name: "Start voting" }).click();
    await ownerPage.getByRole("button", { name: "3", exact: true }).click();
    await memberPage.getByRole("button", { name: "5", exact: true }).click();

    await expect(ownerPage.locator(".board-timer-active")).toBeVisible();
    await expect(memberPage.locator(".board-timer-active")).toBeVisible();
    await expect(ownerPage.locator(".board-timer-active")).not.toContainText("Timer 10s");
    await expect(ownerPage.locator(".board-timer-active")).toContainText(/[1-9]\d*s/);
    await expect(memberPage.locator(".board-timer-active")).toContainText(/[1-9]\d*s/);
    const ownerStartingSeconds = await readActiveBoardTimerSeconds(ownerPage);
    const memberStartingSeconds = await readActiveBoardTimerSeconds(memberPage);
    expect(ownerStartingSeconds).not.toBeNull();
    expect(memberStartingSeconds).not.toBeNull();
    await expect.poll(async () => readActiveBoardTimerSeconds(ownerPage)).toBeLessThan(ownerStartingSeconds!);
    await expect.poll(async () => readActiveBoardTimerSeconds(memberPage)).toBeLessThan(memberStartingSeconds!);

    await memberPage.reload();
    await expect(memberPage.getByRole("heading", { name: teamName })).toBeVisible({ timeout: 15000 });
    await expect(memberPage.locator(".board-timer-active")).toBeVisible();
    await expect(memberPage.locator(".board-timer-active")).toContainText(/[1-9]\d*s/);

    await expectRevealedAverage(ownerPage, "4");
    await expectRevealedAverage(memberPage, "4");
    await expect(ownerPage.getByRole("button", { name: "Reveal score" })).toHaveCount(0);
    await expect(ownerPage.locator(".board-timer-idle")).toContainText("Timer 10s");
    await expect(memberPage.locator(".board-timer-idle")).toContainText("Timer 10s");

    ownerPage.once("dialog", (dialog) => dialog.accept());
    await ownerPage.getByRole("button", { name: "Vote AGAIN", exact: true }).click();
    await expect(ownerPage.getByRole("heading", { name: "TIMER-101" })).toBeVisible();
    await expect(ownerPage.locator(".board-timer-active")).toBeVisible();
    await expect(memberPage.locator(".board-timer-active")).toBeVisible();
    await expect(ownerPage.locator(".board-timer-active")).toContainText(/[1-9]\d*s/);
    await expect(memberPage.locator(".board-timer-active")).toContainText(/[1-9]\d*s/);

    await ownerPage.getByRole("button", { name: "8", exact: true }).click();
    await memberPage.getByRole("button", { name: "8", exact: true }).click();

    await expectRevealedAverage(ownerPage, "8");
    await expectRevealedAverage(memberPage, "8");
    await expect(ownerPage.locator(".board-timer-idle")).toContainText("Timer 10s");
    await expect(memberPage.locator(".board-timer-idle")).toContainText("Timer 10s");
  } finally {
    await ownerContext.close();
    await memberContext.close();
  }
});

test("realistic narrow and widescreen viewport matrix keeps floating controls centered and scroll behavior sane", async ({ browser }) => {
  test.slow();
  const runTag = Date.now();
  const viewports = [
    { width: 1856, height: 940 },
    { width: 1536, height: 760 },
    { width: 1302, height: 628 },
    { width: 960, height: 1140 },
    { width: 836, height: 1300 },
    { width: 704, height: 1225 }
  ];

  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const teamName = `Viewport Matrix ${viewport.width}x${viewport.height} ${Date.now()}`;

    try {
      await loginWithDebugCode(page, `viewport-${viewport.width}-${viewport.height}-${runTag}@example-company.com`, `Viewport ${viewport.width}`);
      await createTeam(page, teamName);

      const stageBox = await page.locator(".board-stage").boundingBox();
      expect(stageBox).not.toBeNull();
      const centerAnchorMetrics = await page.locator(".center-panel").evaluate((element) => {
        const offsetParent = element.offsetParent as HTMLElement | null;
        return {
          offsetLeft: element.offsetLeft,
          offsetTop: element.offsetTop,
          parentWidth: offsetParent?.clientWidth ?? 0,
          parentHeight: offsetParent?.clientHeight ?? 0
        };
      });

      expect(Math.abs(centerAnchorMetrics.offsetLeft - centerAnchorMetrics.parentWidth / 2)).toBeLessThanOrEqual(2);
      expect(Math.abs(centerAnchorMetrics.offsetTop - centerAnchorMetrics.parentHeight / 2)).toBeLessThanOrEqual(2);

      const boardMetrics = await page.locator(".board-scroll-area").evaluate((element) => ({
        overflowY: getComputedStyle(element).overflowY,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight
      }));

      if (boardMetrics.overflowY === "auto") {
        expect(boardMetrics.scrollHeight).toBeGreaterThan(boardMetrics.clientHeight);
      } else {
        expect(boardMetrics.overflowY).toBe("hidden");
        expect(boardMetrics.scrollHeight - boardMetrics.clientHeight).toBeLessThanOrEqual(2);
      }

      const hasGlobalPageScrollbar = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 1);
      expect(hasGlobalPageScrollbar).toBe(false);
    } finally {
      await context.close();
    }
  }
});

test("board stays usable on a compact viewport and keeps the bottom status visible", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 640, height: 480 } });
  const page = await context.newPage();

  try {
    const teamName = `Compact Team ${Date.now()}`;

    await loginWithDebugCode(page, uniqueEmail("compact"), "Compact User");
    await createTeam(page, teamName);

    await expect(page.locator(".status-line")).toBeVisible();
    await page.getByLabel("Issue title").fill("VGA-101");
    await page.getByLabel("Issue title").press("Enter");
    await expect(page.getByRole("button", { name: "5", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Switch team$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reveal score" })).toBeVisible();
    await expect(page.locator(".participant-ring .member-tile:not(.measure-probe)").first()).toBeVisible();

    const boardScrollMetrics = await page.locator(".board-scroll-area").evaluate((element) => ({
      overflowY: getComputedStyle(element).overflowY,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight
    }));
    expect(boardScrollMetrics.overflowY).toBe("auto");
    expect(boardScrollMetrics.scrollHeight).toBeGreaterThanOrEqual(boardScrollMetrics.clientHeight);
  } finally {
    await context.close();
  }
});

test("comfortable side-by-side widescreen layout does not show an unnecessary board scrollbar", async ({ page }) => {
  const teamName = `Widescreen Team ${Date.now()}`;
  const runTag = Date.now();

  await page.setViewportSize({ width: 1440, height: 900 });
  await loginWithDebugCode(page, `widescreen-check-${runTag}@example-company.com`, "Widescreen Check");
  await createTeam(page, teamName);

  const boardScrollMetrics = await page.locator(".board-scroll-area").evaluate((element) => ({
    overflowY: getComputedStyle(element).overflowY,
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight
  }));

  expect(boardScrollMetrics.overflowY).toBe("hidden");
  expect(boardScrollMetrics.scrollHeight - boardScrollMetrics.clientHeight).toBeLessThanOrEqual(2);
});

test("long titles wrap cleanly and the board view does not create a global page scrollbar", async ({ page }) => {
  const teamName = `Viewport Team ${Date.now()}`;
  const longTitle = "ISSUE-19234-this-title-is-intentionally-very-long-to-wrap-cleanly-across-the-ui-and-history-panel";

  await page.setViewportSize({ width: 1440, height: 1325 });
  await loginWithDebugCode(page, uniqueEmail("viewport-check"), "Viewport Check");
  await createTeam(page, teamName);

  await page.getByLabel("Issue title").fill(longTitle);
  await page.getByRole("button", { name: "Start voting" }).click();
  await page.getByRole("button", { name: "8", exact: true }).click();
  await page.getByRole("button", { name: "Reveal score" }).click();
  await expectRevealedAverage(page, "8");

  await expect(page.locator(".center-panel h2")).toContainText(longTitle);
  await expect(page.locator(".history-card-title").getByText(longTitle)).toBeVisible();

  const titleWrapping = await page.locator(".center-panel h2").evaluate((element) => getComputedStyle(element).overflowWrap);
  const historyWrapping = await page.locator(".history-card-title").first().evaluate((element) => getComputedStyle(element).overflowWrap);
  expect(titleWrapping).toBe("anywhere");
  expect(historyWrapping).toBe("anywhere");

  const hasGlobalPageScrollbar = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 1);
  expect(hasGlobalPageScrollbar).toBe(false);
});

test("viewport resize sweep from extra-large to extra-small stays stable and console-clean", async ({ page }) => {
  const teamName = `Resize Sweep ${Date.now()}`;
  const assertNoBrowserIssues = attachBrowserIssueCapture(page);

  await page.setViewportSize({ width: 2560, height: 1273 });
  await loginWithDebugCode(page, uniqueEmail("resize-sweep"), "Resize Sweep");
  await createTeam(page, teamName);
  await page.getByLabel("Issue title").fill("RESIZE-101");
  await resetPerf(page);

  const viewports = [
    { width: 2560, height: 1273 },
    { width: 1920, height: 1080 },
    { width: 1280, height: 900 },
    { width: 960, height: 800 },
    { width: 800, height: 713 },
    { width: 756, height: 713 },
    { width: 704, height: 640 },
    { width: 2560, height: 1273 }
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await expect(page.locator(".board-shell")).toBeVisible();
    await expect(page.locator(".card-rail-wrap")).toBeVisible();
    await expect(page.locator(".status-line")).toBeVisible();
    await page.waitForTimeout(100);
  }

  const snapshot = await snapshotPerf(page);
  expect(snapshot.boardLayoutCalcs).toBeLessThanOrEqual(40);
  expect(snapshot.participantRingRenders).toBeLessThanOrEqual(45);
  assertNoBrowserIssues();
});

test("history timestamp popup is hover-scoped and configurable from account settings", async ({ page }) => {
  const teamName = `Timezone Popup ${Date.now()}`;
  const assertNoBrowserIssues = attachBrowserIssueCapture(page);

  await loginWithDebugCode(page, uniqueEmail("timezone-popup"), "Timezone Popup");
  await createTeam(page, teamName);

  await page.getByLabel("Issue title").fill("TZPOP-101");
  await page.getByRole("button", { name: "Start voting" }).click();
  await page.getByRole("button", { name: "8", exact: true }).click();
  await page.getByRole("button", { name: "Reveal score" }).click();
  await expect(page.locator(".history-group-heading").first()).toBeVisible();

  await page.locator(".history-card-title").first().hover();
  await expect(page.getByRole("tooltip")).toHaveCount(0);

  await page.locator(".history-group-heading").first().hover();
  await expect(page.getByRole("tooltip")).toContainText("GMT");
  await page.mouse.move(10, 10);
  await expect(page.getByRole("tooltip")).toHaveCount(0);

  await page.getByLabel("Open team settings").click();
  await page.getByRole("button", { name: "Time popup" }).click();
  await expect(page.locator(".team-settings-secondary-wide")).toBeVisible();
  await expect(page.getByText("Default date popup zones")).toBeVisible();
  await expectInsideBox(page, ".team-settings-secondary-wide", ".team-settings-secondary-wide .timezone-settings-options");
  await expectInsideBox(page, ".team-settings-secondary-wide", ".team-settings-secondary-wide button[type='submit']");
  await expect(page.locator(".timezone-option", { hasText: "Japan - Tokyo" }).locator(".timezone-option-offset")).toHaveText("GMT +09");
  await expect(page.locator(".timezone-option", { hasText: "India - Pune" }).locator(".timezone-option-offset")).toHaveText("GMT +05:30");
  await page.getByLabel("Japan - Tokyo").check();
  await page.getByLabel("Bulgaria - Sofia").uncheck();
  await page.getByRole("button", { name: "Save default zones" }).click();
  await expect(page.getByText("Team default history time zones saved.")).toBeVisible();

  await page.getByRole("button", { name: "Edit profile" }).click();
  const accountSettings = page.getByRole("dialog", { name: "Account settings" });
  await expect(accountSettings).toBeVisible();
  await expect(accountSettings.getByText("Using the team default time zones until you save a personal list for this team.")).toBeVisible();
  await expect(accountSettings.locator(".timezone-option", { hasText: "Japan - Tokyo" }).locator("input")).toBeChecked();
  await expect(accountSettings.locator(".timezone-option", { hasText: "Bulgaria - Sofia" }).locator("input")).not.toBeChecked();
  const popupEnabledCheckbox = accountSettings.getByLabel("Show history time popup");
  await popupEnabledCheckbox.uncheck();
  await expect(popupEnabledCheckbox).not.toBeChecked();
  await expect(page.getByText("History time popup disabled for this team.")).toBeVisible();
  await accountSettings.getByRole("button", { name: "Close" }).click();

  await page.locator(".history-group-heading").first().hover();
  await expect(page.getByRole("tooltip")).toHaveCount(0);

  await page.getByRole("button", { name: "Edit profile" }).click();
  await expect(accountSettings).toBeVisible();
  await expect(accountSettings.getByLabel("Show history time popup")).not.toBeChecked();
  await accountSettings.getByLabel("Show history time popup").check();
  await expect(accountSettings.getByLabel("Show history time popup")).toBeChecked();
  await expect(page.getByText("History time popup enabled for this team.")).toBeVisible();
  await accountSettings.locator(".timezone-option", { hasText: "Japan - Tokyo" }).locator("input").uncheck();
  await accountSettings.locator(".timezone-option", { hasText: "Bulgaria - Sofia" }).locator("input").check();
  await accountSettings.getByRole("button", { name: "Save personal time zones" }).click();
  await expect(page.getByText("Personal history time zones saved for this team.")).toBeVisible();
  await accountSettings.getByRole("button", { name: "Close" }).click();

  await page.locator(".history-group-heading").first().hover();
  await expect(page.getByRole("tooltip")).toContainText("Bulgaria - Sofia");
  await expect(page.getByRole("tooltip")).not.toContainText("Japan - Tokyo");
  await page.mouse.move(10, 10);
  await expect(page.getByRole("tooltip")).toHaveCount(0);

  const secondTeamName = `Timezone Team Scope ${Date.now()}`;
  await createTeam(page, secondTeamName);
  await page.getByLabel("Issue title").fill("TZPOP-TEAM-2");
  await page.getByRole("button", { name: "Start voting" }).click();
  await page.getByRole("button", { name: "8", exact: true }).click();
  await page.getByRole("button", { name: "Reveal score" }).click();
  await expect(page.locator(".history-group-heading").first()).toBeVisible();
  await page.locator(".history-group-heading").first().hover();
  await expect(page.getByRole("tooltip")).toContainText("India - Pune");
  await page.mouse.move(10, 10);
  await expect(page.getByRole("tooltip")).toHaveCount(0);

  await switchTeam(page, teamName);

  await page.getByRole("button", { name: "Edit profile" }).click();
  await expect(accountSettings).toBeVisible();
  await expect(accountSettings.getByText("Using your personal time zone list for this team.")).toBeVisible();
  await accountSettings.getByRole("button", { name: "Use team default" }).click();
  await expect(page.getByText("History time zones now use the team default.")).toBeVisible();
  await accountSettings.getByRole("button", { name: "Close" }).click();

  await page.locator(".history-group-heading").first().hover();
  await expect(page.getByRole("tooltip")).toContainText("Japan - Tokyo");
  await expect(page.getByRole("tooltip")).not.toContainText("Bulgaria - Sofia");

  assertNoBrowserIssues();
});

test("reveal and reload do not blank the page or throw browser-side errors", async ({ page }) => {
  const teamName = `Crash Guard ${Date.now()}`;

  await loginWithDebugCode(page, uniqueEmail("crashguard"), "Crash Guard");
  await createTeam(page, teamName);
  const assertNoBrowserIssues = attachBrowserIssueCapture(page);

  await page.getByLabel("Issue title").fill("CRASH-101");
  await page.getByRole("button", { name: "Start voting" }).click();
  await page.getByRole("button", { name: "8", exact: true }).click();
  await page.getByRole("button", { name: "Reveal score" }).click();

  await expectRevealedAverage(page, "8");
  await expect(page.locator(".history-card-title").getByText("CRASH-101")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: teamName })).toBeVisible();
  await expectRevealedAverage(page, "8");
  await expect(page.locator(".history-card-title").getByText("CRASH-101")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: teamName })).toBeVisible();
  await expectRevealedAverage(page, "8");

  assertNoBrowserIssues();
});

test("stale saved team selection recovers to a valid team instead of blanking the app", async ({ page }) => {
  const teamName = `Recovery Team ${Date.now()}`;

  await loginWithDebugCode(page, uniqueEmail("recovery"), "Recovery User");
  await createTeam(page, teamName);
  const assertNoBrowserIssues = attachBrowserIssueCapture(page);

  await page.evaluate((key) => {
    window.localStorage.setItem(key, "missing-team-id");
  }, SELECTED_TEAM_KEY);

  await page.reload();

  await expect(page.getByRole("heading", { name: teamName })).toBeVisible();
  await expect(page.getByText("The previously opened team is no longer available. Please choose a team again.")).toHaveCount(0);

  assertNoBrowserIssues();
});

test("team chooser refreshes live and active participants leave the old board when they switch teams", async ({ browser }) => {
  const aliceContext = await browser.newContext();
  const bobContext = await browser.newContext();
  const alicePage = await aliceContext.newPage();
  const bobPage = await bobContext.newPage();
  const firstTeamName = `Presence Team ${Date.now()}`;
  const secondTeamName = `${firstTeamName} Two`;
  const aliceEmail = uniqueEmail("presence-alice");
  const bobEmail = uniqueEmail("presence-bob", "example-partner.com");

  try {
    await loginWithDebugCode(alicePage, aliceEmail, "Presence Alice");
    await createTeam(alicePage, firstTeamName);

    await loginWithDebugCode(bobPage, bobEmail, "Presence Bob");
    await joinVisibleTeam(bobPage, alicePage, firstTeamName, "Presence Bob");

    await expect(alicePage.locator(".member-tile strong", { hasText: "Presence Bob" })).toBeVisible();

    await alicePage.getByRole("button", { name: "Open main menu" }).click();
    await expect(alicePage.getByRole("heading", { name: "Switch team" })).toBeVisible();

    await bobPage.getByRole("button", { name: "Open main menu" }).click();
    await bobPage.getByRole("button", { name: "Create a team" }).click();
    await bobPage.getByLabel("Team title").fill(secondTeamName);
    await bobPage.getByRole("button", { name: "Create and join" }).click({ force: true, noWaitAfter: true });
    await expect(bobPage.getByRole("heading", { name: secondTeamName })).toBeVisible();

    await expect(alicePage.getByText(secondTeamName)).toBeVisible({ timeout: 6000 });

    await alicePage.locator(".team-tile", { hasText: firstTeamName }).getByRole("button", { name: "Open" }).click();
    await expect(alicePage.getByRole("heading", { name: firstTeamName })).toBeVisible();
    await expect(alicePage.locator(".member-tile strong", { hasText: "Presence Bob" })).toHaveCount(0, { timeout: 6000 });
  } finally {
    await aliceContext.close();
    await bobContext.close();
  }
});

test("leaving a team removes access until approval-based rejoin, then restores history", async ({ browser }) => {
  const ownerContext = await browser.newContext();
  const adminContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  const adminPage = await adminContext.newPage();
  const teamName = `Leave Flow ${Date.now()}`;
  const ownerEmail = uniqueEmail("leave-flow");
  const adminEmail = uniqueEmail("leave-admin", "example-partner.com");

  try {
    await loginWithDebugCode(ownerPage, ownerEmail, "Leave Flow User");
    await createTeam(ownerPage, teamName);

    await loginWithDebugCode(adminPage, adminEmail, "Leave Admin");

    await ownerPage.getByRole("button", { name: "Team admin" }).click();
    await ownerPage.getByLabel("Add or invite by email").fill(adminEmail);
    await ownerPage.getByRole("button", { name: new RegExp(`Leave Admin\\s+${escapeRegExp(adminEmail)}`) }).click();
    await ownerPage.getByRole("button", { name: "Add to team" }).click();
    await expect(ownerPage.getByText("Team membership updated.")).toBeVisible();
    const adminRow = ownerPage.locator(".directory-row").filter({ hasText: "Leave Admin" }).first();
    await expect(adminRow).toBeVisible();
    await adminRow.getByRole("button", { name: "Promote" }).click();
    await expect(ownerPage.getByText("Member promoted to team-admin.")).toBeVisible();
    await ownerPage.getByRole("button", { name: "Close" }).click();

    await adminPage.reload();
    await openTeamFromChooserOrWaitForAutoOpen(adminPage, teamName, 15000);

    await ownerPage.getByLabel("Issue title").fill("LEAVE-500");
    await ownerPage.getByRole("button", { name: "Start voting" }).click();
    await ownerPage.getByRole("button", { name: "5", exact: true }).click();
    await ownerPage.getByRole("button", { name: "Reveal score" }).click();
    await expectRevealedAverage(ownerPage, "5");
    await expect(ownerPage.locator(".history-card-title").getByText("LEAVE-500")).toBeVisible();

    await ownerPage.getByRole("button", { name: "Open main menu" }).click();
    ownerPage.once("dialog", (dialog) => dialog.accept());
    await ownerPage.locator(".team-tile", { hasText: teamName }).locator(".team-row-actions").getByRole("button", { name: "Leave" }).click();
    await expect(ownerPage.getByRole("heading", { name: "Choose your team" })).toBeVisible();
    await expect(ownerPage.getByText(teamName)).toBeVisible();

    await joinVisibleTeam(ownerPage, adminPage, teamName, "Leave Flow User");
    await expect(ownerPage.locator(".history-card-title").getByText("LEAVE-500")).toBeVisible();
  } finally {
    await ownerContext.close();
    await adminContext.close();
  }
});

test("team chooser receives newly created teams without manual reload", async ({ browser }) => {
  const creatorContext = await browser.newContext();
  const watcherContext = await browser.newContext();
  const creatorPage = await creatorContext.newPage();
  const watcherPage = await watcherContext.newPage();
  const teamName = `Chooser Push ${Date.now()}`;
  const watcherEmail = uniqueEmail("chooser-watcher", "example-partner.com");
  const creatorEmail = uniqueEmail("chooser-creator");

  try {
    await loginWithDebugCode(watcherPage, watcherEmail, "Chooser Watcher");
    await expect(watcherPage.getByRole("heading", { name: "Choose your team" })).toBeVisible();

    await loginWithDebugCode(creatorPage, creatorEmail, "Chooser Creator");
    await creatorPage.getByRole("button", { name: "Create a team" }).click();
    await creatorPage.getByLabel("Team title").fill(teamName);
    await creatorPage.getByRole("button", { name: "Create and join" }).click({ force: true, noWaitAfter: true });
    await expect(creatorPage.getByRole("heading", { name: teamName })).toBeVisible();

    await expect(watcherPage.getByText(teamName)).toBeVisible({ timeout: 2000 });
  } finally {
    await creatorContext.close();
    await watcherContext.close();
  }
});

test("team directory modal shows names and emails from board and chooser", async ({ browser }) => {
  const ownerContext = await browser.newContext();
  const memberContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  const memberPage = await memberContext.newPage();
  const teamName = `Directory Team ${Date.now()}`;
  const ownerEmail = uniqueEmail("directory-owner");
  const memberEmail = uniqueEmail("directory-member", "example-partner.com");

  try {
    await loginWithDebugCode(ownerPage, ownerEmail, "Directory Owner");
    await createTeam(ownerPage, teamName);

    await loginWithDebugCode(memberPage, memberEmail, "Directory Member");
    await joinVisibleTeam(memberPage, ownerPage, teamName, "Directory Member");

    await ownerPage.getByRole("button", { name: "Team admin" }).click();
    const boardDialog = ownerPage.getByRole("dialog", { name: `${teamName} people` });
    await expect(boardDialog).toBeVisible();
    await expect(boardDialog.getByText("Directory Owner")).toBeVisible();
    await expect(boardDialog.getByText(ownerEmail)).toBeVisible();
    await expect(boardDialog.getByText("Directory Member")).toBeVisible();
    await expect(boardDialog.getByText(memberEmail)).toBeVisible();
    await expect(boardDialog.getByText("Onboard")).toHaveCount(2);
    await ownerPage.keyboard.press("Escape");
    await expect(boardDialog).toHaveCount(0);

    await memberPage.getByRole("button", { name: "Open main menu" }).click();
    await expect(memberPage.getByRole("heading", { name: "Switch team" })).toBeVisible();

    await ownerPage.getByRole("button", { name: "Open main menu" }).click();
    const teamRow = await getChooserTeamRow(ownerPage, teamName);
    await teamRow.getByRole("button", { name: "Team admin" }).click();
    const chooserDialog = ownerPage.getByRole("dialog", { name: `${teamName} people` });
    const memberRow = chooserDialog.locator(".directory-row", { hasText: memberEmail });
    await expect(chooserDialog).toBeVisible();
    await expect(chooserDialog.getByText(memberEmail)).toBeVisible();
    await expect(memberRow.getByText("Not online")).toBeVisible();
    await ownerPage.keyboard.press("Escape");
    await expect(chooserDialog).toHaveCount(0);
  } finally {
    await ownerContext.close();
    await memberContext.close();
  }
});

test("shared team permalinks preserve the requested board through sign-in, approval, and direct open", async ({ browser }) => {
  const ownerContext = await browser.newContext();
  const visitorContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  const visitorPage = await visitorContext.newPage();
  const teamName = `Permalink Team ${Date.now()}`;
  const helperTeamName = `${teamName} Bootstrap`;
  const visitorEmail = uniqueEmail("permalink-visitor", "example-partner.com");

  try {
    await signInAsSuperAdmin(ownerPage);
    await createTeam(ownerPage, teamName);
    const teamId = readTeamIdFromCurrentUrl(ownerPage);
    await ownerPage.getByRole("button", { name: "Open main menu" }).click();
    await createTeam(ownerPage, helperTeamName);
    await ownerPage.getByRole("button", { name: "Team admin" }).click();
    const helperDirectory = ownerPage.getByRole("dialog", { name: `${helperTeamName} people` });
    await helperDirectory.getByPlaceholder("person@company.com").fill(visitorEmail);
    await helperDirectory.getByRole("button", { name: "Add to team" }).click();
    await expect(helperDirectory.getByText("Share this generated password manually")).toBeVisible();
    const visitorPassword = (await helperDirectory.getByTestId("credential-password").textContent())?.trim();
    expect(visitorPassword).toBeTruthy();
    await ownerPage.keyboard.press("Escape");
    await ownerPage.getByRole("button", { name: "Open main menu" }).click();
    const targetTeamRow = await getChooserTeamRow(ownerPage, teamName);
    await targetTeamRow.getByRole("button", { name: "Open" }).click();
    await expect(ownerPage.getByRole("heading", { name: teamName })).toBeVisible();

    await visitorPage.goto(`/?teamId=${teamId}`);
    await visitorPage.getByLabel("Email").fill(visitorEmail);
    await visitorPage.getByLabel("Password").fill(visitorPassword!);
    await visitorPage.getByRole("button", { name: "Sign in" }).click();

    await expect(visitorPage.getByText(new RegExp(`Shared link target:\\s*${escapeRegExp(teamName)}`))).toBeVisible();
    const linkedTeamRow = await getChooserTeamRow(visitorPage, teamName);
    await linkedTeamRow.getByRole("button", { name: "Request access" }).click();
    await expect(linkedTeamRow.getByRole("button", { name: "Pending" })).toBeVisible();

    await ownerPage.getByRole("button", { name: "Open notifications" }).click();
    const notifications = ownerPage.getByRole("dialog", { name: "Notifications" });
    await expect(notifications).toBeVisible();
    await notifications.getByRole("button", { name: "Admit" }).click();

    await expect(visitorPage.getByRole("heading", { name: teamName })).toBeVisible({ timeout: 5000 });
    await expect(visitorPage).toHaveURL(new RegExp(`teamId=${teamId}`));

    const directOpenContext = await browser.newContext();
    const directOpenPage = await directOpenContext.newPage();
    try {
      await directOpenPage.goto(`/?teamId=${teamId}`);
      await directOpenPage.getByLabel("Email").fill(visitorEmail);
      await directOpenPage.getByLabel("Password").fill(visitorPassword!);
      await directOpenPage.getByRole("button", { name: "Sign in" }).click();
      await expect(directOpenPage.getByRole("heading", { name: teamName })).toBeVisible();
    } finally {
      await directOpenContext.close();
    }
  } finally {
    await ownerContext.close();
    await visitorContext.close();
  }
});

test("smtp-free manual-share onboarding lets an invited user sign in with the generated password", async ({ browser }) => {
  const ownerContext = await browser.newContext();
  const memberContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  const memberPage = await memberContext.newPage();
  const teamName = `Manual Share ${Date.now()}`;
  const memberEmail = uniqueEmail("manual-share-member", "example-partner.com");

  try {
    await signInAsSuperAdmin(ownerPage);
    await createTeam(ownerPage, teamName);

    await ownerPage.getByRole("button", { name: "Team admin" }).click();
    const directory = ownerPage.getByRole("dialog", { name: `${teamName} people` });
    await directory.getByPlaceholder("person@company.com").fill(memberEmail);
    await directory.getByRole("button", { name: "Add to team" }).click();
    await expect(directory.getByText("Share this generated password manually")).toBeVisible();
    await expect(directory.getByText("Save this generated password somewhere secure before closing this message")).toBeVisible();
    const generatedPassword = (await directory.getByTestId("credential-password").textContent())?.trim();
    expect(generatedPassword).toBeTruthy();

    await signInWithPassword(memberPage, memberEmail, generatedPassword!);
    await expect
      .poll(
        async () => {
          if (await memberPage.getByRole("heading", { name: teamName }).isVisible().catch(() => false)) {
            return "board";
          }
          if (await memberPage.getByRole("heading", { name: "Choose your team" }).isVisible().catch(() => false)) {
            return "chooser";
          }
          return "";
        },
        { timeout: 15000 }
      )
      .not.toBe("");
  } finally {
    await ownerContext.close();
    await memberContext.close();
  }
});

test("history pagination and search work end to end for large team histories", async ({ page }) => {
  test.setTimeout(180000);
  const teamName = `History Search ${Date.now()}`;
  const issueCount = 21;
  const today = new Date().toISOString().slice(0, 10);
  const exactTitle = "PH6-17 exact anchor";
  const commentNeedle = "phase6-search-comment";
  const displayName = "Phase 6 History User";

  await loginWithDebugCode(page, uniqueEmail("phase6-history"), displayName);
  await createTeam(page, teamName);

  for (let index = 1; index <= issueCount; index += 1) {
    const title = index === 17 ? exactTitle : `PH6-${String(index).padStart(2, "0")}`;
    await completeRound(page, title, "5");
    if (index === 17) {
      await addCommentToRevealedIssue(page, title, commentNeedle);
    }
  }

  await page.reload();
  await expect(page.getByRole("heading", { name: teamName })).toBeVisible();
  await expect(page.locator(".history-card-title").getByText(exactTitle)).toBeVisible();
  await expect(page.locator(".history-card-title").getByText("PH6-01")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Load more" })).toBeVisible();
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.locator(".history-card-title").getByText("PH6-01")).toBeVisible();
  await expect(page.getByText("No more history entries.")).toBeVisible();

  await page.getByRole("tab", { name: "Search" }).click();
  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 940, height: 900 },
    { width: 760, height: 900 }
  ]) {
    await page.setViewportSize(viewport);
    await page.getByRole("tab", { name: "Search" }).click();
    await expect(page.getByLabel("Date from")).toBeVisible();
    await expect(page.getByLabel("Date to")).toBeVisible();
    await expectInsideBox(page, ".history-search-form", ".history-search-grid");
    await expectInsideBox(page, ".history-search-form", ".history-search-actions");
    await expectSelectorsNotOverlapping(
      page,
      ".history-search-date-field:first-child input",
      ".history-search-date-field:nth-child(2) input"
    );
  }

  await page.getByLabel("Date from").fill(today);
  await page.getByLabel("Date to").fill(today);
  await page.getByLabel("Title or words").fill(exactTitle);
  await page.getByRole("checkbox", { name: /exact title match/i }).check();
  await page.getByLabel("Word in comments").fill(commentNeedle);
  await page.getByLabel("Person who voted or commented").fill(displayName);
  await page.getByRole("button", { name: "Search history" }).click();

  const searchResultCard = page.locator(".history-card").filter({
    has: page.locator(".history-card-title", { hasText: exactTitle })
  }).first();
  await expect(searchResultCard).toBeVisible();
  await searchResultCard.getByRole("button", { name: /comments \(\d+\)/i }).click();
  await expect(page.locator(".history-comment-body")).toContainText(commentNeedle);
  await expect(page.locator(".history-card-title").getByText("PH6-01")).toHaveCount(0);

  await page.getByRole("button", { name: "Clear" }).click();
  await expect(page.getByLabel("Date from")).toHaveValue("");
  await expect(page.getByLabel("Date to")).toHaveValue("");
  await expect(page.getByLabel("Title or words")).toHaveValue("");
  await expect(page.getByRole("checkbox", { name: /exact title match/i })).not.toBeChecked();
  await expect(page.getByLabel("Word in comments")).toHaveValue("");
  await expect(page.getByLabel("Person who voted or commented")).toHaveValue("");
  await expect(page.locator(".history-card-title").getByText(exactTitle)).toBeVisible();
  await expect(page.locator(".history-card-title").getByText("PH6-21")).toBeVisible();
  await expect(page.getByRole("button", { name: "Load more results" })).toBeVisible();

  await page.getByLabel("Title or words").fill("PH6-");
  await page.getByRole("button", { name: "Search history" }).click();
  await expect(page.locator(".history-card-title").getByText("PH6-21")).toBeVisible();
  await expect(page.locator(".history-card-title").getByText(exactTitle)).toBeVisible();

  await page.getByRole("button", { name: "Clear" }).click();
  await page.getByLabel("Word in comments").fill("no-such-history-comment");
  await page.getByRole("button", { name: "Search history" }).click();
  await expect(page.getByText("No history entries match this search.")).toBeVisible();
});

test("team history export and import preserve comments and reject duplicate reimports", async ({ page }) => {
  test.setTimeout(180000);
  const sourceTeamName = `Export Source ${Date.now()}`;
  const importedTeamName = `Imported Team ${Date.now()}`;
  const issueTitle = "IMPORT-101";
  const commentBody = "Imported through JSON package.";

  await loginWithDebugCode(page, uniqueEmail("phase6-team-export"), "Phase 6 Export User");
  await createTeam(page, sourceTeamName);
  await completeRound(page, issueTitle, "8");
  await addCommentToRevealedIssue(page, issueTitle, commentBody);

  await page.getByRole("button", { name: "Team admin" }).click();
  const sourceDirectory = page.getByRole("dialog", { name: `${sourceTeamName} people` });
  await expect(sourceDirectory).toBeVisible();
  await sourceDirectory.getByRole("tab", { name: "Import/export" }).click();
  const exportDownloadPromise = page.waitForEvent("download");
  await sourceDirectory.getByRole("button", { name: "Export team history" }).click();
  const exportDownload = await exportDownloadPromise;
  const exportPath = await exportDownload.path();
  expect(exportPath).toBeTruthy();
  await sourceDirectory.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Open main menu" }).click();
  await page.getByRole("button", { name: "Import a team" }).click();
  await page.getByLabel("Imported team title").fill(importedTeamName);
  await page.getByLabel("Team history package").setInputFiles(exportPath!);
  await page.getByRole("button", { name: "Import and join" }).click();
  await expect(page.getByRole("heading", { name: importedTeamName })).toBeVisible();
  await expect(page.locator(".history-card-title").getByText(issueTitle)).toBeVisible();

  await page.getByRole("button", { name: /comments \(1\)/i }).click();
  await expect(page.locator(".history-comment-body")).toContainText(commentBody);
  await expect(page.getByText("Imported comments are historical records and cannot be edited.")).toBeVisible();
  await expect(page.locator(".history-comment-card").getByRole("button", { name: "Edit" })).toHaveCount(0);
  await expect(page.locator(".history-comment-card").getByRole("button", { name: "Delete" })).toHaveCount(0);

  await page.getByRole("button", { name: "Team admin" }).click();
  const importedDirectory = page.getByRole("dialog", { name: `${importedTeamName} people` });
  await expect(importedDirectory).toBeVisible();
  await importedDirectory.getByRole("tab", { name: "Import/export" }).click();
  await importedDirectory.getByLabel("Import team history package").setInputFiles(exportPath!);
  await importedDirectory.getByRole("button", { name: "Import into this team" }).click();
  await expect(page.getByText("Imported 0 history entries and skipped 1 duplicates.")).toBeVisible();
});

test("super-admin database snapshot export and import restore the previous SQLite state", async ({ page }) => {
  test.setTimeout(180000);
  const restoredAwayTeam = `Snapshot Temp ${Date.now()}`;

  await signInAsSuperAdmin(page);

  await page.getByRole("button", { name: "Platform settings" }).click();
  const settingsDialog = page.getByRole("dialog", { name: "Platform settings" });
  await expect(settingsDialog).toBeVisible();
  await settingsDialog.getByRole("tab", { name: "Super-admin" }).click();

  const snapshotDownloadPromise = page.waitForEvent("download");
  await settingsDialog.getByRole("button", { name: "Export database snapshot" }).click();
  const snapshotDownload = await snapshotDownloadPromise;
  const snapshotPath = await snapshotDownload.path();
  expect(snapshotPath).toBeTruthy();
  await settingsDialog.getByRole("button", { name: "Close" }).first().click();

  await createTeam(page, restoredAwayTeam);

  await page.getByRole("button", { name: "Open main menu" }).click();
  await expect(getChooserTeamRow(page, restoredAwayTeam)).resolves.toBeTruthy();
  await page.getByRole("button", { name: "Platform settings" }).click();
  await expect(settingsDialog).toBeVisible();
  await settingsDialog.getByRole("tab", { name: "Super-admin" }).click();
  await settingsDialog.getByLabel("Import SQLite snapshot").setInputFiles(snapshotPath!);
  await settingsDialog.getByRole("button", { name: "Import database snapshot" }).click();
  if (await settingsDialog.isVisible().catch(() => false)) {
    await settingsDialog.getByRole("button", { name: "Close" }).first().click();
  }
  await expect(page.getByText(restoredAwayTeam)).toHaveCount(0, { timeout: 15000 });
});

test("super-admin can open Jira Cloud controls and start the OAuth popup", async ({ page }) => {
  await page.addInitScript(() => {
    (window as Window & { __jiraOpenedUrls?: string[] }).__jiraOpenedUrls = [];
    window.open = ((url?: string | URL | undefined) => {
      window.__jiraOpenedUrls?.push(String(url ?? ""));
      return null;
    }) as typeof window.open;
  });

  await page.route("**/api/admin/jira/oauth/start", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        authorizationUrl: "https://auth.atlassian.com/authorize?client_id=e2e-jira-client"
      })
    });
  });

  await signInAsSuperAdmin(page);

  await page.getByRole("button", { name: "Platform settings" }).click();
  const settingsDialog = page.getByRole("dialog", { name: "Platform settings" });
  await expect(settingsDialog).toBeVisible();
  await settingsDialog.getByRole("tab", { name: "Super-admin" }).click();
  await expect(settingsDialog.getByRole("heading", { name: "Jira Cloud" })).toBeVisible();
  await expect(settingsDialog.getByLabel("Client ID")).toBeVisible();

  await settingsDialog.getByRole("button", { name: /Connect Jira Cloud|Reconnect Jira Cloud/ }).click();

  await expect(settingsDialog.getByText("Continue the Jira Cloud authorization in the popup window.")).toBeVisible();
  const openedUrls = await page.evaluate(() => (window as Window & { __jiraOpenedUrls?: string[] }).__jiraOpenedUrls ?? []);
  expect(openedUrls[0]).toContain("https://auth.atlassian.com/authorize?client_id=e2e-jira-client");
});

test("team admins can see imported Jira issues and load one for voting with its title", async ({ page }) => {
  const teamName = `Jira Queue ${Date.now()}`;

  await loginWithDebugCode(page, uniqueEmail("jira-queue"), "Jira Queue User");
  await createTeam(page, teamName);
  const teamId = readTeamIdFromCurrentUrl(page);

  let pendingIssueLoaded = false;
  const pendingIssues = [
    {
      id: "pending-jira-1",
      source: "jira_cloud",
      externalIssueId: "jira-101",
      issueKey: "ISSUE-101",
      title: "Import the pending queue",
      displayTitle: "ISSUE-101 - Import the pending queue",
      importedAt: "2026-04-16T10:00:00.000Z",
      updatedAt: "2026-04-16T10:00:00.000Z",
      position: 0
    }
  ];

  await page.route(`**/api/teams/${teamId}/directory`, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.team.jiraProjectKey = "SFM";
    body.team.jiraJql = "statusCategory != Done ORDER BY Rank ASC";
    body.pendingIssues = pendingIssues;
    await route.fulfill({ response, json: body });
  });

  await page.route(`**/api/teams/${teamId}/state?history=0`, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.team.jiraProjectKey = "SFM";
    body.team.jiraJql = "statusCategory != Done ORDER BY Rank ASC";
    body.pendingIssues = pendingIssues;
    if (pendingIssueLoaded) {
      body.activeRound = {
        id: "round-jira-1",
        teamId,
        title: "ISSUE-101 - Import the pending queue",
        deckKey: "fibonacci-21",
        fibonacciRangeStart: null,
        fibonacciRangeEnd: null,
        status: "active",
        createdAt: "2026-04-16T10:05:00.000Z",
        timerStartedAt: null,
        timerExpiresAt: null,
        revealedAt: null,
        revealAverage: null,
        pendingIssueId: "pending-jira-1",
        revoteHistoryEntryId: null,
        votes: []
      };
    }
    await route.fulfill({ response, json: body });
  });

  await page.route(`**/api/teams/${teamId}/pending-issues/pending-jira-1/load`, async (route) => {
    pendingIssueLoaded = true;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        round: {
          id: "round-jira-1",
          teamId,
          title: "ISSUE-101 - Import the pending queue",
          deckKey: "fibonacci-21",
          fibonacciRangeStart: null,
          fibonacciRangeEnd: null,
          status: "active",
          createdAt: "2026-04-16T10:05:00.000Z",
          timerStartedAt: null,
          timerExpiresAt: null,
          revealedAt: null,
          revealAverage: null,
          pendingIssueId: "pending-jira-1",
          revoteHistoryEntryId: null,
          votes: []
        }
      })
    });
  });

  await page.getByRole("button", { name: "Team admin" }).click();
  const directoryDialog = page.getByRole("dialog", { name: `${teamName} people` });
  await expect(directoryDialog).toBeVisible();
  await directoryDialog.getByRole("tab", { name: "Import/export" }).click();
  await expect(directoryDialog.getByRole("heading", { name: "Jira Cloud issue import" })).toBeVisible();
  await expect(directoryDialog.getByText("ISSUE-101")).toBeVisible();
  await expect(directoryDialog.getByText("Import the pending queue")).toBeVisible();

  await directoryDialog.getByRole("button", { name: "Load for voting" }).click();
  await directoryDialog.getByRole("button", { name: "Close" }).click();

  await expect(page.getByRole("heading", { name: "ISSUE-101 - Import the pending queue" })).toBeVisible();
});

test("custom history popup stays visible near the right rail and next-round action stays single-purpose", async ({ page }) => {
  const teamName = `History Popup ${Date.now()}`;

  await loginWithDebugCode(page, uniqueEmail("history-popup"), "History Popup User");
  await createTeam(page, teamName);

  await page.getByLabel("Issue title").fill("HIST-500");
  await page.getByRole("button", { name: "Start voting" }).click();
  await page.getByRole("button", { name: "8", exact: true }).click();
  await page.getByRole("button", { name: "Reveal score" }).click();
  await expectRevealedAverage(page, "8");

  await expect(page.getByRole("button", { name: "Vote this issue again" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Vote AGAIN", exact: true })).toBeVisible();

  const timestampTrigger = page.locator(".history-group-heading").first();
  await timestampTrigger.evaluate((element) => {
    element.scrollIntoView({ block: "center", inline: "nearest" });
  });
  await page.mouse.move(0, 0);
  await timestampTrigger.dispatchEvent("mouseenter");
  await timestampTrigger.dispatchEvent("mouseover");
  const popup = page.getByRole("tooltip");
  await expect(popup).toBeVisible();
  await expect(popup.getByText("USA - Davidson")).toBeVisible();
  await expect(popup.getByText("India - Pune")).toBeVisible();

  const popupBox = await popup.boundingBox();
  expect(popupBox).not.toBeNull();
  expect((popupBox?.x ?? 0) + (popupBox?.width ?? 0)).toBeLessThanOrEqual(1280);

  await page.setViewportSize({ width: 1180, height: 900 });
  await expect(page.locator(".screen-header-bar")).toBeVisible();
  await expectNoHorizontalDocumentOverflow(page);
  await expectSelectorsNotOverlapping(page, ".team-branding", ".header-toolbar");
  await expectNoOverlappingMatches(page, ".header-toolbar > *");
  await expectNoOverlappingMatches(page, ".team-name-row > *");
  await expectElementContentFits(page, ".team-name-row h1");
});
