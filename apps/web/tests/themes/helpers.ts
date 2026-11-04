// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later
import {expect, type Browser, type BrowserContext, type Locator, type Page, type TestInfo} from '@playwright/test';
import {resolveTheme, type ThemeId} from '@planning-poker/shared';
export {closeDialog, openControls, showHistory} from '../responsive/helpers';

export const baseUrl = (trial: boolean) => `http://127.0.0.1:${trial ? 3148 : 3147}`;
export async function admin(browser: Browser, trial: boolean) {
  const context = await browser.newContext({baseURL: baseUrl(trial)});
  expect((await context.request.post('/api/auth/signin-admin', {data: {
    username: 'local-test-admin', password: 'LocalOnlyTest123!'
  }})).ok()).toBe(true);
  return context;
}
export async function setDefault(context: BrowserContext, themeId: ThemeId) {
  const response = await context.request.patch('/api/admin/config', {data: {branding: {defaultThemeId: themeId}}});
  expect(response.ok(), await response.text()).toBe(true);
}
export async function register(page: Page, trial: boolean) {
  const email = `theme-${Date.now()}-${Math.random().toString(36).slice(2)}@example-company.com`;
  const prefix = trial ? '/api/auth/public-trial' : '/api/auth';
  const response = await page.request.post(`${prefix}/request-code`, {data: {email}});
  expect(response.ok(), await response.text()).toBe(true);
  const code = await response.json();
  const signup = await page.request.post(trial ? `${prefix}/signup` : `${prefix}/verify-code`, {data: {
    email, code: code.debugCode, displayName: 'Theme Test User', password: 'Password123!',
    avatarIconKey: 'bear', avatarColorKey: 'azure', ...(trial ? {acceptedTerms: true, acceptedTermsVersion: code.termsVersion} : {})
  }});
  expect(signup.ok(), await signup.text()).toBe(true);
  expect((await page.request.patch('/api/auth/preferences', {data: {openLastTeamOnLogin: false}})).ok()).toBe(true);
  await page.goto('/?view=teams');
  await expect(page.getByRole('button', {name: 'Account', exact: true})).toBeVisible();
  return email;
}
export async function createTeam(page: Page) {
  const response = await page.request.post('/api/teams', {data: {name: `Theme team ${Date.now()}`}});
  expect(response.ok(), await response.text()).toBe(true);
  const {team} = await response.json();
  await page.goto(`/?teamId=${team.id}`);
  await expect(page.locator('.board-shell')).toBeVisible();
  return team.id as string;
}
export async function appearance(page: Page, id: ThemeId | '') {
  await page.getByLabel('Theme', {exact: true}).selectOption(id);
  await page.getByRole('button', {name: 'Save appearance', exact: true}).click();
}
export async function expectTheme(page: Page, id: ThemeId) {
  const theme = resolveTheme(id);
  await expect(page.locator('html')).toHaveAttribute('data-theme', id);
  await expect(page.locator('html')).toHaveCSS('color-scheme', theme.colorScheme);
  // Read every resolved variable: catches an ID-only switch leaving old colors behind.
  const actual = await page.evaluate(keys => Object.fromEntries(keys.map(key => [key,
    getComputedStyle(document.documentElement).getPropertyValue(key).trim()])), Object.keys(theme.tokens));
  for (const [key, value] of Object.entries(theme.tokens)) expect(actual[key], `${id} ${key}`).toBe(value);
}
export function diagnostics(page: Page) {
  const errors: string[] = [];
  const expected: Array<{path: string; status: number}> = [{path: '/api/auth/session', status: 401}];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => {
    if (!['error', 'warning'].includes(m.type())) return;
    let path = ''; try {path = new URL(m.location().url).pathname;} catch {}
    if (expected.some(e => e.path === path && new RegExp(`\\b${e.status}\\b`).test(m.text()))) return;
    errors.push(m.text());
  });
  return {allow: (path: string, status: number) => expected.push({path, status}), check: () => expect(errors).toEqual([])};
}

function luminance(c: number[]) {
  const linear = c.map(v => v / 255 <= .04045 ? v / 255 / 12.92 : ((v / 255 + .055) / 1.055) ** 2.4);
  return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
}
// Hide only the glyph paint, preserving geometry, gradients, image backing and opacity.
// Sample the actual rendered background beneath the label instead of guessing CSS blending.
export async function renderedContrast(locator: Locator) {
  // A prior held-pointer probe can select text. Measure the ordinary text paint,
  // not ::selection's explicit foreground, which overrides transparent glyphs.
  await locator.page().evaluate(()=>window.getSelection()?.removeAllRanges());
  const data = await locator.evaluate(el => {
    const style = getComputedStyle(el);
    let opacity = 1; for (let node: Element | null = el; node; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity);
    const bounds=el.getBoundingClientRect();
    const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);
    let textRect:DOMRect|undefined;
    for(let node=walker.nextNode();node;node=walker.nextNode()) {
      if(!node.textContent?.trim()||getComputedStyle(node.parentElement!).color!==style.color) continue;
      const range=document.createRange();range.selectNodeContents(node);
      const rect=range.getBoundingClientRect();if(rect.width&&rect.height){textRect=rect;break;}
    }
    const rect=textRect??bounds;
    return {color: style.color, opacity, fontSize: Number.parseFloat(style.fontSize), weight: Number.parseInt(style.fontWeight), text: el.textContent?.trim().slice(0,70),
      sample:{x:(rect.x-bounds.x)/bounds.width,y:(rect.y-bounds.y)/bounds.height,width:rect.width/bounds.width,height:rect.height/bounds.height}};
  });
  const old = await locator.getAttribute('style');
  await locator.evaluate(el => { (el as HTMLElement).style.setProperty('color', 'transparent', 'important'); (el as HTMLElement).style.setProperty('text-shadow', 'none', 'important'); });
  let buffer: Buffer;
  try { buffer = await locator.screenshot({animations: 'disabled'}); }
  finally {await locator.evaluate((el, original) => original == null ? el.removeAttribute('style') : el.setAttribute('style', original), old);}
  const pixels = await locator.page().evaluate(async ({base64,sample}) => {
    const img = new Image(); img.src = `data:image/png;base64,${base64}`; await img.decode();
    const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
    const ctx = canvas.getContext('2d',{willReadFrequently:true})!; ctx.drawImage(img, 0, 0);
    const samples: number[][] = [];
    for (const x of [.2,.5,.8]) for (const y of [.3,.5,.7]) samples.push([...ctx.getImageData(Math.max(0,Math.min(img.width-1,Math.floor(img.width*(sample.x+sample.width*x)))),Math.max(0,Math.min(img.height-1,Math.floor(img.height*(sample.y+sample.height*y)))),1,1).data].slice(0,3));
    return samples;
  }, {base64:buffer!.toString('base64'),sample:data.sample});
  const rgba = data.color.match(/[\d.]+/g)!.map(Number);
  const alpha = (rgba[3] ?? 1) * data.opacity;
  const ratios = pixels.map(bg => {
    const fg = rgba.slice(0,3).map((v,i) => v*alpha + bg[i]*(1-alpha));
    const [lo,hi] = [luminance(fg),luminance(bg)].sort((a,b)=>a-b); return (hi+.05)/(lo+.05);
  });
  const threshold = data.fontSize >= 24 || (data.fontSize >= 18.66 && data.weight >= 700) ? 3 : 4.5;
  return {...data, minimum: Math.min(...ratios), threshold};
}
export async function audit(page: Page, info: TestInfo, name: string, probe = '.primary-button:visible:not(:disabled), h1:visible, h2:visible') {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}: horizontal overflow`).toBe(true);
  for (const dialog of await page.locator('dialog[open], [role="dialog"]:visible').all()) {
    const box = (await dialog.boundingBox())!; const size = page.viewportSize()!;
    expect(box.x).toBeGreaterThanOrEqual(-1); expect(box.x + box.width).toBeLessThanOrEqual(size.width + 1);
  }
  const dialogs=page.locator('dialog[open], .modal-panel:visible, [role="dialog"]:visible');
  const surface=await dialogs.count()?dialogs.last():page.locator('body');
  const results=[];
  for (const element of (await surface.locator(probe).all()).slice(0,8)) {
    if (!await element.isVisible()) continue;
    await element.scrollIntoViewIfNeeded();
    const result=await renderedContrast(element);results.push(result);
    expect.soft(result.minimum, `${name}: ${result.text} (${result.color})`).toBeGreaterThanOrEqual(result.threshold);
  }
  await info.attach(`${name}-contrast`, {body: JSON.stringify(results,null,2), contentType:'application/json'});
  const screenshotPath = info.outputPath(`${name}.png`);
  await page.screenshot({path:screenshotPath,fullPage:true});
  await info.attach(name, {path:screenshotPath,contentType:'image/png'});
}
