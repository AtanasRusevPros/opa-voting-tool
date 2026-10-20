// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later
import {test, expect} from '@playwright/test';
import {user, team, openControls, diagnostics, audit} from './helpers';

for (const [width,height] of [[1440,900],[768,1024]]) test(`desktop history toggle preserves size ${width}x${height}`, async ({page}, info) => {
 await page.setViewportSize({width,height}); const clean=diagnostics(page); await user(page); await team(page);
 const rail=page.locator('.history-rail:visible'); const before=(await rail.boundingBox())!;
 const hide=page.getByRole('button',{name:'Hide history',exact:true}); await hide.click();
 await expect(page.locator('.history-rail:visible')).toHaveCount(0);
 const show=page.getByRole('button',{name:'Show history',exact:true}); await show.focus(); await page.keyboard.press('Enter');
 await expect(rail).toBeVisible(); const after=(await rail.boundingBox())!;
 expect(after.width).toBeCloseTo(before.width,0); expect(after.height).toBeCloseTo(before.height,0);
 await audit(page,info,'desktop-history'); clean();
});

for (const [width,height] of [[360,800],[412,915],[915,412]]) test(`mobile history hold and compact layered controls ${width}x${height}`, async ({browser}, info) => {
 const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true});
 const page=await context.newPage(); const clean=diagnostics(page);
 try {
  await user(page); await team(page);
  const grip=page.locator('.history-stack-resize-handle:visible,.history-resize-handle:visible');
  await grip.tap(); await expect(grip).toHaveAttribute('aria-expanded','true');
  await grip.tap(); await expect(grip).toHaveAttribute('aria-expanded','false');
  const cdp=await context.newCDPSession(page);
  const drag=async (hold: boolean) => {
   const box=(await grip.boundingBox())!, x=box.x+box.width/2, y=box.y+box.height/2;
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
   if(hold) await page.waitForTimeout(300);
   for(let n=1;n<=6;n++) await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:width>height?x-n*15:x,y:width>height?y:y-n*15}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  };
  await drag(false); await expect(grip).toHaveAttribute('aria-expanded','false');
  await drag(true); await expect(grip).toHaveAttribute('aria-expanded','true');
  await openControls(page);
  const panel=page.getByRole('dialog',{name:'Board controls',exact:true});
  const close=panel.getByRole('button',{name:'Close board controls',exact:true});
  await expect(close).toHaveText(''); await expect(close.locator('svg')).toBeVisible();
  const rect=(await panel.boundingBox())!, cross=(await close.boundingBox())!;
  expect(rect.height).toBeLessThan(height-80);
  expect(cross.x+cross.width).toBeGreaterThan(rect.x+rect.width-24);
  expect(cross.y).toBeLessThan(rect.y+20);
  await expect(page.locator('.board-controls-backdrop')).toHaveCSS('backdrop-filter','blur(2px)');
  const timer=page.getByRole('button',{name:'Open team timer settings'});
  const actionBorder=await timer.evaluate(el=>getComputedStyle(el).borderTopColor);
  const statusBorder=await page.locator('.board-timer').evaluate(el=>getComputedStyle(el).borderTopColor);
  expect(actionBorder).not.toEqual(statusBorder);
  await timer.tap(); await expect(page.locator('.board-submenu-backdrop')).toBeVisible();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(()=>!!document.activeElement?.closest('.timer-settings-popup'))).toBe(true);
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(()=>!!document.activeElement?.closest('.timer-settings-popup'))).toBe(true);
  await page.getByRole('button',{name:'Off',exact:true}).tap();
  await expect(page.locator('.board-submenu-backdrop')).toBeHidden();
  await audit(page,info,'compact-controls');
  await close.tap(); await expect(panel).toBeHidden();
  await expect(page.getByLabel('Issue title',{exact:true})).toBeEditable(); clean();
 } finally {await context.close();}
});

for (const role of ['member','team_admin','super_admin']) for (const [width,height] of [[1440,900],[412,915]]) test(`action borders respect ${role} permissions ${width}`, async ({page}) => {
 await page.setViewportSize({width,height}); await user(page); const id=await team(page);
 // Render each permission state; authorization itself remains covered by API tests.
 await page.route(`**/api/teams/${id}/state?*`, async route => {
  const response=await route.fetch(); const state=await response.json();
  state.currentUserRole=role==='super_admin'?'team_admin':role;
  state.currentUser.isSuperAdmin=role==='super_admin';
  await route.fulfill({response,json:state});
 });
 await page.reload(); await expect(page.locator(".board-shell")).toBeVisible(); await openControls(page);
 const timer=page.getByRole('button',{name:'Open team timer settings'});
 if(role==='member') await expect(timer).toBeDisabled(); else await expect(timer).toBeEnabled();
 const action=page.getByRole('button',{name:'Copy team link'});
 const border=await action.evaluate(el=>getComputedStyle(el).borderTopColor);
 const timerBorder=await timer.evaluate(el=>getComputedStyle(el).borderTopColor);
 if(role==='member') expect(timerBorder).not.toEqual(border); else expect(timerBorder).toEqual(border);
 expect(await page.locator('.board-timer').evaluate(el=>getComputedStyle(el).borderTopColor)).not.toEqual(border);
});
