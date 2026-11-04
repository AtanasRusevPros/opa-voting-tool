// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { resolveTheme, type BrandingManifest, type ThemeId } from '@planning-poker/shared';
import { admin, baseUrl, diagnostics, expectTheme, register, setDefault } from './helpers';

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

async function paintedCorner(page: Page, info: TestInfo, name: string) {
  // Playwright screenshots wait for document.fonts.ready, which can wait for
  // DOMContentLoaded while our production module is deliberately held back.
  // Capture the Chromium compositor directly without changing that load state.
  const session = await page.context().newCDPSession(page);
  let screenshot: Buffer;
  try {
    const { data } = await session.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    screenshot = Buffer.from(data, 'base64');
  } finally { await session.detach(); }
  await info.attach(name, { body: screenshot, contentType: 'image/png' });
  return page.evaluate(async encoded => {
    const image = new Image();
    image.src = `data:image/png;base64,${encoded}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    // Outside centered entry content and the top-left decorative gradient.
    return [...context.getImageData(Math.floor(image.width * .98), Math.floor(image.height * .98), 1, 1).data].slice(0, 3);
  }, screenshot.toString('base64'));
}

async function expectResolvedPalette(page: Page, id: ThemeId, palette: BrandingManifest['palette']) {
  const theme = resolveTheme(id, palette);
  await expect(page.locator('html')).toHaveAttribute('data-theme', id);
  await expect.poll(() => page.evaluate(keys => Object.fromEntries(keys.map(key => [
    key, getComputedStyle(document.documentElement).getPropertyValue(key).trim()
  ])), Object.keys(theme.tokens))).toEqual(theme.tokens);
}

for (const trial of [false, true]) {
  test(`personal dark first paint precedes JavaScript and survives delayed bootstrap (${trial ? 'trial' : 'self-hosted'})`, async ({ browser }, info) => {
    test.skip(browser.browserType().name() !== 'chromium', 'Capturing the compositor before DOMContentLoaded requires Chromium CDP.');
    const operator = await admin(browser, trial);
    const context = await browser.newContext({ baseURL: baseUrl(trial), viewport: { width: 1440, height: 900 } });
    const scripts = deferred();
    const bootstrap = deferred();
    try {
      await setDefault(operator, 'nord');
      const setup = await context.newPage();
      await register(setup, trial);
      const saved = await context.request.patch('/api/auth/preferences', { data: { themeId: 'opa-midnight-ember' } });
      expect(saved.status()).toBe(200);
      const { user } = await saved.json();
      expect(user.themeId).toBe('opa-midnight-ember');
      await setup.close();

      const expectedPage = resolveTheme('opa-midnight-ember').tokens['--theme-page'];
      const expectedPixel = [1, 3, 5].map(offset => Number.parseInt(expectedPage.slice(offset, offset + 2), 16));
      const noJavaScript = await browser.newContext({
        baseURL: baseUrl(trial), viewport: { width: 1440, height: 900 },
        javaScriptEnabled: false, storageState: await context.storageState()
      });
      try {
        const initial = await noJavaScript.newPage();
        const response = await initial.goto('/?view=teams');
        expect(response?.headers()['cache-control']).toBe('private, no-store');
        expect(await response!.text()).not.toContain(user.id);
        await expectTheme(initial, 'opa-midnight-ember');
        expect(await paintedCorner(initial, info, 'personal-no-javascript')).toEqual(expectedPixel);
      } finally { await noJavaScript.close(); }

      const page = await context.newPage();
      const errors = diagnostics(page);
      let blockedScripts = 0;
      let blockedSession = 0;
      let blockedBootstrap = 0;
      await page.addInitScript(() => {
        const observations: Array<{ id: string | undefined; previous: string | null }> = [];
        (window as typeof window & { initialThemeObservations: typeof observations }).initialThemeObservations = observations;
        new MutationObserver(records => {
          for (const record of records) observations.push({ id: document.documentElement?.dataset.theme, previous: record.oldValue });
        }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-theme'], attributeOldValue: true });
      });
      await page.route('**/assets/*.js', async route => {
        ++blockedScripts;
        await scripts.promise;
        await route.continue();
      });
      await page.route('**/api/auth/session', async route => {
        ++blockedSession;
        await bootstrap.promise;
        await route.continue();
      });
      await page.route('**/api/bootstrap', async route => {
        ++blockedBootstrap;
        await bootstrap.promise;
        await route.continue();
      });

      // A blocked module delays DOMContentLoaded; commit lets us inspect genuine
      // pre-application HTML while its production CSS is already available.
      await page.goto('/?view=teams', { waitUntil: 'commit' });
      await expect.poll(() => blockedScripts).toBeGreaterThan(0);
      await expect(page.locator('body')).toHaveCSS('margin-top', '0px');
      await expectTheme(page, 'opa-midnight-ember');
      expect(blockedSession).toBe(0);
      expect(blockedBootstrap).toBe(0);
      expect(await paintedCorner(page, info, 'personal-before-application-javascript')).toEqual(expectedPixel);

      scripts.release();
      await expect.poll(() => blockedSession).toBeGreaterThan(0);
      await expect.poll(() => blockedBootstrap).toBeGreaterThan(0);
      await expectTheme(page, 'opa-midnight-ember');
      const pendingPixel = await paintedCorner(page, info, 'personal-during-bootstrap');
      // React's branded background can tint this pixel; it must remain dark.
      expect(Math.max(...pendingPixel)).toBeLessThan(100);
      bootstrap.release();
      await expect(page.getByRole('button', { name: 'Account', exact: true })).toBeVisible();
      await expectTheme(page, 'opa-midnight-ember');
      const observations = await page.evaluate(() => (window as typeof window & {
        initialThemeObservations: Array<{ id?: string; previous: string | null }>
      }).initialThemeObservations);
      expect(observations.flatMap(item => [item.id, item.previous]).filter(Boolean)).not.toContain('opa-light');
      errors.check();
    } finally {
      scripts.release();
      bootstrap.release();
      await context.close();
      await operator.close();
    }
  });
}

test('custom legacy Light colours are validated, survive dark selection and preserve artwork', async ({ browser }, info) => {
  const operator = await admin(browser, false);
  const entry = await browser.newContext({ baseURL: baseUrl(false), viewport: { width: 1440, height: 900 } });
  const account = await browser.newContext({ baseURL: baseUrl(false), viewport: { width: 1440, height: 900 } });
  const beforeResponse = await operator.request.get('/api/admin/config');
  expect(beforeResponse.status()).toBe(200);
  const before = await beforeResponse.json();
  try {
    const invalid = await operator.request.patch('/api/admin/config', { data: {
      branding: { palette: { primaryAction: 'red; background-image:url(https://invalid.test)' } }
    } });
    expect(invalid.status()).toBe(400);
    expect((await (await operator.request.get('/api/admin/config')).json()).branding.palette).toEqual(before.branding.palette);

    const custom = await operator.request.patch('/api/admin/config', { data: { branding: {
      defaultThemeId: 'opa-light',
      palette: { primaryAction: 'rgb(34, 68, 102)', accentHighlight: '#579dff', surfaceTint: 'ivory', textEmphasis: '#203047' }
    } } });
    expect(custom.status()).toBe(200);
    const result = await custom.json();
    const branding = result.config.branding;
    expect(result.appliedFields).toContain('branding.defaultThemeId');
    expect(branding.palette).toEqual({ primaryAction: '#224466', accentHighlight: '#579dff', surfaceTint: '#fffff0', textEmphasis: '#203047' });

    const artwork = await Promise.all(['loginLogo', 'loginBackground', 'teamLogo', 'teamBackground'].map(async slot => {
      const response = await operator.request.get(branding[slot]);
      expect(response.status()).toBe(200);
      return { slot, url: branding[slot], bytes: await response.body() };
    }));
    const login = await entry.newPage();
    const loginErrors = diagnostics(login);
    await login.goto('/admin');
    await expectResolvedPalette(login, 'opa-light', branding.palette);
    await expect(login.locator('.brand-logo')).toHaveAttribute('src', branding.loginLogo);
    await expect(login.locator('.brand-logo')).toHaveCSS('filter', 'none');
    expect(await login.locator('.login-backdrop').evaluate(element => getComputedStyle(element).backgroundImage)).toContain(branding.loginBackground);
    await info.attach('custom-light-entry', { body: await login.screenshot(), contentType: 'image/png' });

    const person = await account.newPage();
    const accountErrors = diagnostics(person);
    await register(person, false);
    await expectResolvedPalette(person, 'opa-light', branding.palette);
    await person.getByRole('button', { name: 'Account', exact: true }).click();
    const selectedAvatar = person.locator('.avatar-picker .selected img');
    const avatarUrl = await selectedAvatar.getAttribute('src');
    expect(avatarUrl).toBeTruthy();

    await setDefault(operator, 'opa-midnight-ember');
    await expectTheme(person, 'opa-midnight-ember');
    await expect(selectedAvatar).toHaveAttribute('src', avatarUrl!);
    await expect(selectedAvatar).toHaveCSS('filter', 'none');
    await expect(person.locator('.chooser-logo')).toHaveAttribute('src', branding.teamLogo);
    await login.reload();
    await expectTheme(login, 'opa-midnight-ember');
    await expect(login.locator('.brand-logo')).toHaveAttribute('src', branding.loginLogo);
    await expect(login.locator('.brand-logo')).toHaveCSS('filter', 'none');
    expect(await login.locator('.login-backdrop').evaluate(element => getComputedStyle(element).backgroundImage)).toContain(branding.loginBackground);
    await info.attach('custom-branding-dark-entry', { body: await login.screenshot(), contentType: 'image/png' });
    for (const asset of artwork) {
      expect((await (await operator.request.get('/api/admin/config')).json()).branding[asset.slot]).toBe(asset.url);
      expect(await (await operator.request.get(asset.url)).body()).toEqual(asset.bytes);
    }

    await setDefault(operator, 'opa-light');
    await expectResolvedPalette(person, 'opa-light', branding.palette);
    expect((await (await operator.request.get('/api/admin/config')).json()).branding.palette).toEqual(branding.palette);
    loginErrors.check();
    accountErrors.check();
  } finally {
    await entry.close();
    await account.close();
    const restored = await operator.request.patch('/api/admin/config', { data: { branding: {
      defaultThemeId: before.branding.defaultThemeId, palette: before.branding.palette
    } } });
    expect(restored.status()).toBe(200);
    await operator.close();
  }
});
