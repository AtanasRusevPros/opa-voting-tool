// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from "@playwright/test";

// Run against an isolated trial-enabled API; never enable trial mode on a shared test server.
test("trial chooser prioritizes teams and keeps management in responsive Account and About dialogs", async ({ page }) => {
  test.skip(process.env.PLAYWRIGHT_TRIAL !== "1", "Requires an isolated trial-enabled API.");
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (["error", "warning"].includes(message.type())) errors.push(message.text());
  });
  const email = `chooser-${Date.now()}@example.com`;
  const codeResponse = await page.request.post("/api/auth/public-trial/request-code", { data: { email } });
  expect(codeResponse.ok()).toBeTruthy();
  const code = await codeResponse.json();
  const signup = await page.request.post("/api/auth/public-trial/signup", { data: {
    email, code: code.debugCode, displayName: "Trial Layout", avatarIconKey: "bear", avatarColorKey: "azure",
    password: "Password123!", acceptedTerms: true, acceptedTermsVersion: code.termsVersion
  } });
  expect(signup.status()).toBe(201);
  await page.goto("/?view=teams");
  await expect(page.getByRole("button", { name: "Create a team", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Rename workspace", exact: true })).toHaveCount(0);
  await expect(page.getByText(/small server I personally fund/)).toHaveCount(0);
  await expect(page.getByText("Under Development", { exact: true })).toBeVisible();

  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole("button", { name: "About", exact: true })).toBeVisible();
    const top = await page.getByRole("button", { name: "Create a team", exact: true }).boundingBox();
    expect(top!.y).toBeLessThan(500);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("button", { name: "About", exact: true }).click();
    const about = page.getByRole("dialog", { name: "About OpaVoting" });
    await expect(about).toBeVisible();
    await expect(about.getByText(/small server I personally fund/)).toBeVisible();
    expect(await about.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    await page.keyboard.press("Escape");
    await expect(about).not.toBeVisible();
    await expect(page.getByRole("button", { name: "About", exact: true })).toBeFocused();

    await page.getByRole("button", { name: "Account", exact: true }).click();
    const account = page.getByRole("dialog", { name: "Account settings", exact: true });
    await expect(account.getByRole("button", { name: "Rename workspace", exact: true })).toBeVisible();
    await account.getByRole("button", { name: "Rename workspace", exact: true }).click();
    await account.getByLabel("Workspace name", { exact: true }).fill(`Workspace ${width}`);
    await account.getByRole("button", { name: "Save workspace name" }).click();
    await expect(account.getByText("Workspace name saved.")).toBeVisible();
    expect(await account.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    await account.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.getByText(`Workspace ${width} · Owner · 0/80 rounds`)).toBeVisible();
    await page.screenshot({ path: `/tmp/opa-chooser-${width}.png`, fullPage: true });
  }
  await page.getByRole("button", { name: "Team admin", exact: true }).click();
  await page.getByRole("button", { name: "Rename team", exact: true }).click();
  await page.getByLabel("Team name", { exact: true }).fill("Responsive Team");
  await page.getByRole("button", { name: "Save team name" }).click();
  await expect(page.getByRole("heading", { name: "Responsive Team", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator(".team-tile-main").filter({hasText: "Responsive Team"})).toBeVisible();
  await page.waitForTimeout(300);
  expect(errors).toEqual([]);
});
