// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later
import {expect, type Page, type TestInfo} from '@playwright/test';
import {boardViewport} from '../../src/app/boardViewport';
export async function user(page: Page) {
  const email = `responsive-${Date.now()}-${Math.random().toString(36).slice(2)}@example-company.com`;
  const code = await (await page.request.post('/api/auth/request-code', {data: {email}})).json();
  expect((await page.request.post('/api/auth/verify-code', {data: {email, code: code.debugCode, displayName: 'Responsive Test User', avatarIconKey: 'bear', avatarColorKey: 'azure', password: 'Password123!'}})).ok()).toBe(true);
  await page.goto('/'); await expect(page.getByRole('button', {name: 'Account', exact: true})).toBeVisible(); return email;
}
export async function team(page: Page) {
  const response = await page.request.post('/api/teams', {data: {name: `Responsive Team ${Date.now()}-${Math.random().toString(36).slice(2,7)}`}});
  expect(response.ok(), await response.text()).toBe(true); const {team} = await response.json();
  await page.goto(`/?teamId=${team.id}`); await expect(page.locator('.board-shell')).toBeVisible(); return team.id as string;
}
export async function audit(page: Page, info: TestInfo, name: string) {
  await page.screenshot({path: info.outputPath(`${name}.png`), fullPage: true});
  const geometry = await page.evaluate(() => {
    const shown = (el: Element) => {const r=el.getBoundingClientRect(); return r.width > 0 && r.height > 0;};
    return {width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
      boardOverflow: [...document.querySelectorAll(".center-control-card, .board-main, .mobile-board-bar")].filter(shown).map(el => ({name:el.className, extra:el.scrollWidth-el.clientWidth})),
      dialogs: [...document.querySelectorAll('[role="dialog"], [role="menu"]')].filter(shown).map(el => {const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};}),
      smallTargets: [...document.querySelectorAll('button,input,select,summary')].filter(shown).map(el => {const r=el.getBoundingClientRect();return {text:el.getAttribute('aria-label') || el.textContent?.slice(0,50),width:r.width,height:r.height};}).filter(r => r.width < 24 || r.height < 24)};
  });
  await info.attach(`${name}-geometry`, {body: JSON.stringify(geometry,null,2), contentType:'application/json'});
  expect.soft(geometry.scrollWidth, `${name}: page horizontal overflow`).toBeLessThanOrEqual(geometry.width+1);
  for (const box of geometry.boardOverflow) expect.soft(box.extra, `${name}: ${box.name} overflow`).toBeLessThanOrEqual(2);
  for (const dialog of geometry.dialogs) {
    expect.soft(dialog.left, `${name}: dialog left`).toBeGreaterThanOrEqual(-1);
    expect.soft(dialog.right, `${name}: dialog right`).toBeLessThanOrEqual(geometry.width+1);
    expect.soft(dialog.top, `${name}: dialog top`).toBeGreaterThanOrEqual(-1);
    expect.soft(dialog.bottom, `${name}: dialog bottom`).toBeLessThanOrEqual(geometry.height+1);
  }
}
export async function closeDialog(page: Page) {
  await page.getByRole('dialog').last().getByRole('button', {name: 'Close', exact:true}).click();
}
export function diagnostics(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => {if (!['error','warning'].includes(m.type())) return;
    if (m.location().url.includes('/api/auth/session') && /401/.test(m.text())) return;
    errors.push(m.text());});
  return () => expect(errors).toEqual([]);
}

export async function openControls(page: Page) {
  if (!await page.locator(".board-shell").count()) return;
  const size=page.viewportSize();
  if(size) await expect(page.locator('.board-shell')).toHaveClass(boardViewport(size.width,size.height).mobile ? /is-mobile-board/ : /^(?!.*is-mobile-board).*$/);
  const toggle=page.getByRole('button',{name:'Open board controls',exact:true});
  if(await toggle.isVisible() && await toggle.getAttribute('aria-expanded')==='false') await toggle.click();
}
export async function showHistory(page: Page) {
  const grip=page.locator('.history-stack-resize-handle:visible, .history-resize-handle:visible');
  if(await grip.getAttribute('aria-expanded')==='false') await grip.click();
}
