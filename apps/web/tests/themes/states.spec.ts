// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later
import {test, expect, type Locator, type Page, type TestInfo} from '@playwright/test';
import {THEMES, type ThemeId} from '@planning-poker/shared';
import {appearance, baseUrl, diagnostics, expectTheme, register, renderedContrast} from './helpers';

const rgba = (color: string) => {
  expect(color, 'the probe supports resolved sRGB colors').toMatch(/^rgba?\(/);
  return color.match(/[\d.]+/g)!.map(Number);
};
function ratio(first: string, second: string) {
  const a = rgba(first), b = rgba(second);
  expect(b[3] ?? 1, 'adjacent backing must be opaque').toBe(1);
  // Chromium's forced-color Highlight is translucent. Composite it over the
  // verified opaque backing instead of rejecting a valid native system color.
  const alpha = a[3] ?? 1;
  expect(alpha).toBeGreaterThanOrEqual(0); expect(alpha).toBeLessThanOrEqual(1);
  const painted = a.slice(0, 3).map((channel, index) => channel * alpha + b[index] * (1 - alpha));
  const luminance = (channels: number[]) => channels.slice(0, 3).map(value => {
    const n = value / 255;
    return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4;
  }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
  const [low, high] = [luminance(painted), luminance(b)].sort((x, y) => x - y);
  return (high + .05) / (low + .05);
}

// Boundary probes use real computed paints, rejecting image/nonuniform-gradient
// backings rather than silently treating an unsupported surface as opaque white.
async function boundary(control: Locator, kind: 'border' | 'outline') {
  await control.scrollIntoViewIfNeeded();
  const result = await control.evaluate((element, property) => {
    const style = getComputedStyle(element);
    let backing: string | undefined;
    for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
      const parent = getComputedStyle(ancestor);
      if (parent.backgroundImage !== 'none') {
        const colors = parent.backgroundImage.match(/rgba?\([^)]+\)/g) ?? [];
        if (!parent.backgroundImage.startsWith('linear-gradient(') || colors.length < 2 || !colors.every(color => color === colors[0])) {
          throw new Error(`Unsupported boundary backing: ${parent.backgroundImage}`);
        }
        backing = colors[0]; break;
      }
      const channels = parent.backgroundColor.match(/[\d.]+/g)?.map(Number) ?? [];
      if (channels.length === 3 || channels[3] === 1) { backing = parent.backgroundColor; break; }
      if (channels[3] !== 0) throw new Error(`Unsupported translucent boundary backing: ${parent.backgroundColor}`);
    }
    if (!backing) throw new Error('Boundary has no known opaque backing');
    return {color: property === 'border' ? style.borderTopColor : style.outlineColor, backing,
      width: parseFloat(property === 'border' ? style.borderTopWidth : style.outlineWidth),
      style: property === 'border' ? style.borderTopStyle : style.outlineStyle};
  }, kind);
  expect(result.width, `${kind} is visible`).toBeGreaterThanOrEqual(1);
  expect(result.style).not.toBe('none');
  const minimum = ratio(result.color, result.backing);
  expect(minimum, `${kind} ${result.color} against ${result.backing}`).toBeGreaterThanOrEqual(3);
  return {kind: `computed-${kind}`, ...result, minimum};
}

async function text(control: Locator, label: string) {
  await control.scrollIntoViewIfNeeded();
  const result = await renderedContrast(control);
  expect(result.minimum, `${label}: ${result.color}`).toBeGreaterThanOrEqual(result.threshold);
  return {kind: 'rendered-text', label, ...result};
}

// Preserve the native empty input and hide only placeholder glyph paint while
// sampling its background. The common renderer then measures the pseudo-color.
async function placeholder(control: Locator) {
  await expect(control).toHaveValue('');
  const paint = await control.evaluate(element => {
    const style = getComputedStyle(element, '::placeholder');
    return {color: style.color, opacity: style.opacity};
  });
  expect(paint.opacity).toBe('1');
  const original = await control.getAttribute('style');
  const hide = await control.page().addStyleTag({content: '[data-theme-placeholder-probe]::placeholder { color: transparent !important; }'});
  try {
    await control.evaluate((element, color) => {
      element.setAttribute('data-theme-placeholder-probe', '');
      (element as HTMLElement).style.setProperty('color', color, 'important');
    }, paint.color);
    return {...await text(control, 'empty password placeholder'), kind: 'rendered-placeholder'};
  } finally {
    await hide.evaluate(element => element.parentNode?.removeChild(element));
    await control.evaluate((element, old) => {
      element.removeAttribute('data-theme-placeholder-probe');
      if (old === null) element.removeAttribute('style'); else element.setAttribute('style', old);
    }, original);
  }
}

async function pressWithoutActivating(page: Page, control: Locator, read: () => Promise<unknown>) {
  await control.hover();
  await page.mouse.down();
  try { return await read(); }
  finally {
    await page.mouse.move(0, 0); await page.mouse.up();
    // Releasing outside avoids activating the control. On preview spans that
    // movement can select document text; clear it before measuring normal paint.
    await page.evaluate(() => window.getSelection()?.removeAllRanges());
  }
}
async function attachScreenshot(info: TestInfo, name: string, locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  await info.attach(name, {body: await locator.screenshot({animations: 'disabled'}), contentType: 'image/png'});
}

async function accountFits(modal: Locator) {
  const containers = modal.locator('.modal-header, .account-settings-grid, .account-settings-section, .appearance-settings, .theme-preview, .timezone-settings-options');
  const overflow = await containers.evaluateAll(elements => elements
    .filter(element => element.scrollWidth > element.clientWidth + 1)
    .map(element => ({class: element.className, width: element.clientWidth, scroll: element.scrollWidth})));
  // Native fields may scroll their values internally; their containing grids must fit.
  expect(overflow, 'Account sections and preview fit without horizontal clipping').toEqual([]);
  expect(await modal.evaluate(element => element.scrollWidth <= element.clientWidth + 1), 'Account fits the dialog').toBe(true);
}

test('all 18 saved palettes cover text, control states and essential boundaries', async ({browser}, info) => {
  test.setTimeout(360000);
  const context = await browser.newContext({baseURL: baseUrl(false), viewport: {width: 1440, height: 900}});
  const page = await context.newPage(), errors = diagnostics(page);
  try {
    await register(page, false);
    await page.getByRole('button', {name: 'Account', exact: true}).click();
    const modal = page.getByRole('dialog', {name: 'Account settings', exact: true});
    const preview = page.getByRole('group', {name: 'Theme preview', exact: true});
    const select = page.getByLabel('Theme', {exact: true});
    for (const theme of THEMES) {
      await test.step(theme.name, async () => {
        await appearance(page, theme.id); await expectTheme(page, theme.id);
        await expect(page.getByRole('button', {name: 'Save appearance', exact: true})).toBeDisabled();
        await page.setViewportSize({width: 390, height: 844});
        await accountFits(modal);
        await attachScreenshot(info, `${theme.id}-390px-appearance`, preview);
        await page.setViewportSize({width: 1440, height: 900});
        const results: unknown[] = [];
        const controls = [
          ['secondary', modal.getByRole('button', {name: 'Close', exact: true})],
          ['danger', modal.getByRole('button', {name: 'Review account deletion', exact: true})],
          ['primary preview', preview.locator('.primary-button')]
        ] as const;
        for (const [name, control] of controls) {
          await page.mouse.move(0, 0);
          results.push(await text(control, `${name} normal`));
          await control.hover(); results.push(await text(control, `${name} hover`));
          results.push(await pressWithoutActivating(page, control, () => text(control, `${name} pressed`)));
        }
        // These buttons were only held, never clicked; no deletion dialog or account mutation.
        await expect(page.getByRole('dialog')).toHaveCount(1);
        for (const state of ['success', 'warning', 'error']) results.push(await text(preview.locator(`.${state}-banner`), state));
        results.push(await text(modal.locator('.timezone-settings-help'), 'small help text'));
        const disabled = modal.getByRole('button', {name: 'Change password', exact: true});
        await expect(disabled).toBeDisabled(); results.push(await text(disabled, 'disabled label'));
        const password = modal.getByPlaceholder('Current password', {exact: true});
        results.push(await placeholder(password));
        results.push(await boundary(password, 'border'));
        await select.focus(); await expect(select).toBeFocused();
        results.push(await boundary(select, 'outline'));
        results.push(await boundary(select, 'border'));
        const selected = modal.locator('.avatar-option.selected');
        await expect(selected).toHaveCount(1); results.push(await boundary(selected, 'border'));
        const selectedBorder = await selected.evaluate(element => getComputedStyle(element).borderTopColor);
        await selected.hover(); await expect(selected).toHaveCSS('border-top-color', selectedBorder);
        results.push(await pressWithoutActivating(page, selected, async () => {
          await expect(selected).toHaveCSS('border-top-color', selectedBorder);
          return boundary(selected, 'border');
        }));
        await info.attach(`${theme.id}-state-probes`, {body: JSON.stringify(results, null, 2), contentType: 'application/json'});
        await attachScreenshot(info, `${theme.id}-status-and-controls`, preview);
      });
    }
  } finally { try { errors.check(); } finally { await context.close(); } }
});

for (const id of ['opa-light', 'nord', 'opa-midnight-ember'] as ThemeId[]) {
  test(`${id} text zoom, reduced motion, print and forced-color controls`, async ({browser}, info) => {
    test.setTimeout(120000);
    const context = await browser.newContext({baseURL: baseUrl(false), viewport: {width: 360, height: 800}});
    const page = await context.newPage(), errors = diagnostics(page);
    try {
      await register(page, false);
      await page.getByRole('button', {name: 'Account', exact: true}).click();
      await appearance(page, id); await expectTheme(page, id);
      const modal = page.getByRole('dialog', {name: 'Account settings', exact: true});
      const select = page.getByLabel('Theme', {exact: true});
      const preview = page.getByRole('group', {name: 'Theme preview', exact: true});
      const before = await modal.locator('h2').evaluate(element => parseFloat(getComputedStyle(element).fontSize));
      const originalSize = await page.evaluate(() => {
        const root = document.documentElement, original = root.style.fontSize;
        root.style.fontSize = `${parseFloat(getComputedStyle(root).fontSize) * 2}px`;
        return original;
      });
      expect(await modal.locator('h2').evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(before * 1.99);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '200% text has no page overflow').toBe(true);
      await accountFits(modal);
      await select.focus(); await expect(select).toBeFocused(); await boundary(select, 'outline');
      await select.press('Tab');
      const focused = page.locator(':focus');
      await expect(focused).not.toBeDisabled(); await expect(focused).toBeInViewport();
      await attachScreenshot(info, `${id}-200-percent-text`, modal);
      await page.evaluate(value => { document.documentElement.style.fontSize = value; }, originalSize);

      await page.emulateMedia({reducedMotion: 'reduce'});
      for (const control of await preview.locator('.primary-button, .secondary-button, .danger-button').all()) {
        await expect(control).toHaveCSS('transition-duration', '0s');
        await expect(control).toHaveCSS('animation-name', 'none');
      }
      await select.focus(); await expectTheme(page, id);
      await attachScreenshot(info, `${id}-reduced-motion`, preview);

      await page.emulateMedia({media: 'print'});
      await expect(page.locator('html')).toHaveCSS('color-scheme', 'light');
      await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
      for (const control of await preview.locator('strong, p, .primary-button, .danger-button').all()) {
        await expect(control).toHaveCSS('color', 'rgb(0, 0, 0)');
        await text(control, 'printed text');
      }
      await attachScreenshot(info, `${id}-print-colors`, preview);

      await page.emulateMedia({media: 'screen', reducedMotion: 'no-preference', forcedColors: 'active'});
      await expect(page.locator('html')).toHaveCSS('forced-color-adjust', 'auto');
      await expect(select).toHaveCSS('forced-color-adjust', 'auto');
      await select.focus(); await expect(select).toBeFocused(); await boundary(select, 'outline');
      const native = await select.evaluate(element => {
        const style = getComputedStyle(element);
        return {text: style.color, background: style.backgroundColor};
      });
      expect(ratio(native.text, native.background), 'forced-color native text').toBeGreaterThanOrEqual(4.5);
      await boundary(modal.locator('.avatar-option.selected'), 'outline');
      await attachScreenshot(info, `${id}-forced-colors`, modal);
      await page.emulateMedia({forcedColors: 'none'}); await expectTheme(page, id);
    } finally { try { errors.check(); } finally { await context.close(); } }
  });
}
