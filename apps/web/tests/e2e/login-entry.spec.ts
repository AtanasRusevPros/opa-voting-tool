// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "@playwright/test";

test("trial login separates email actions and the directly reloadable admin entry", async ({ page }) => {
  test.skip(process.env.PLAYWRIGHT_TRIAL !== "1", "Requires trial signup enabled and access requests disabled.");
  const diagnostics: string[] = [];
  page.on("pageerror", error => diagnostics.push(error.message));
  page.on("console", message => {
    // An anonymous session probe intentionally returns 401; retain all other diagnostics.
    const pathname = (() => {
      try { return new URL(message.location().url).pathname; } catch { return ""; }
    })();
    if (pathname === "/api/auth/session" && /\b401\b/.test(message.text())) return;
    if (["error", "warning"].includes(message.type())) diagnostics.push(message.text());
  });
  await page.goto("/");
  const signup = page.getByRole("button", { name: "Start free public trial" });
  const forgot = page.getByRole("button", { name: "Forgot password" });
  await expect(signup).toBeVisible();
  await expect(page.getByRole("button", { name: "Admin", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Request access" })).toHaveCount(0);
  await expect(signup).toBeDisabled();
  await expect(forgot).toBeDisabled();
  await page.getByLabel("Email", { exact: true }).fill("invalid");
  await expect(signup).toBeDisabled();
  await expect(forgot).toBeDisabled();
  await page.getByLabel("Email", { exact: true }).fill("person@example.com");
  await expect(signup).toBeEnabled();
  await expect(forgot).toBeEnabled();
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(signup).toBeVisible();
    await expect(forgot).toBeVisible();
    await page.screenshot({ path: `/tmp/opa-login-${width}.png`, fullPage: true });
  }
  for (const path of ["/admin", "/admin/"]) {
    const response = await page.goto(path);
    expect(response!.headers()["x-robots-tag"]).toBe("noindex");
    await page.reload();
    await expect(page.getByRole("button", { name: "Admin sign in" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Start free public trial" })).toHaveCount(0);
    await page.getByRole("button", { name: "Back to user sign-in" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(signup).toBeVisible();
  }
  expect(diagnostics).toEqual([]);
});

test("trial policies disclose deletion and backup exceptions on desktop and mobile", async ({ page }) => {
  test.skip(process.env.PLAYWRIGHT_TRIAL !== "1", "Requires hosted trial mode.");
  await page.goto('/public-trial/privacy');
  await expect(page.getByRole('heading', { name: 'Your Privacy Requests', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Backup Retention', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'First-Party Usage Statistics', exact: true })).toBeVisible();
  await expect(page.getByText(/Statistics are retained for 31 days/)).toBeVisible();
  await expect(page.getByText(/still personal data, not anonymisation/)).toBeVisible();
  await expect(page.getByText(/We do not sell personal data/)).toBeVisible();
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.goto('/public-trial/export-cleanup');
  await expect(page.getByText(/No automatic inactive-workspace deletion deadline/)).toBeVisible();
  await expect(page.getByText(/Backups expire separately/)).toBeVisible();
});
