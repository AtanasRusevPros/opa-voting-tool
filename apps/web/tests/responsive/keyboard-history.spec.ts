// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later
import {test,expect} from '@playwright/test';
import {phoneViewports} from './mobileMatrix';
import {user,team,openControls,diagnostics} from './helpers';
for(const [width,height] of phoneViewports) test(`keyboard, collapse and half-screen history ${width}x${height}`,async({browser})=>{
 const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true});
 const page=await context.newPage(); const clean=diagnostics(page); await user(page); await team(page);
 try {
  const title=page.getByLabel('Issue title',{exact:true}); await title.tap(); await title.pressSequentially('First typed mobile issue');
  await page.getByRole('button',{name:'Start voting',exact:true}).tap(); await page.getByRole('button',{name:'5',exact:true}).tap();
  await page.getByRole('button',{name:'Reveal score',exact:true}).tap();
  const next=page.getByLabel('Next issue title',{exact:true}); await next.tap(); await next.fill('');
  await page.setViewportSize({width,height:Math.max(240,Math.floor(height*.55))});
  await next.pressSequentially('Keyboard draft αβ 123');
  // Layout orientation stays stable when the keyboard changes only available height.
  await expect(page.locator('.board-shell')).toHaveClass(width>height?/is-mobile-landscape/:/^(?!.*is-mobile-landscape).*$/);
  const deal=page.getByRole('button',{name:'Deal',exact:true}); await expect(deal).toBeEnabled();
  await deal.tap(); await expect(page.getByRole('heading',{name:/Keyboard draft αβ 123/})).toBeVisible();
  await page.setViewportSize({width,height});
  for(const card of await page.locator('.planning-card').all()) {
   await expect(card).toBeEnabled(); await card.tap(); await expect(card).toHaveClass(/selected/);
  }
  await page.getByRole('button',{name:'5',exact:true}).tap();
  await page.getByRole('button',{name:'Reveal score',exact:true}).tap();
  const grip=page.locator('.history-stack-resize-handle:visible,.history-resize-handle:visible');
  await expect(grip).toHaveAttribute('aria-expanded','false');
  await grip.tap(); await expect(grip).toHaveAttribute('aria-expanded','true');
  const panel=page.locator(width>height?'.history-rail.desktop':'.stacked-history-panel');
  const bounds=(await panel.boundingBox())!;
  expect(width>height?bounds.width+44:bounds.height).toBeCloseTo(Math.floor((width>height?width:height)/2),0);
  await grip.tap(); await expect(page.locator('.history-rail:visible')).toHaveCount(0);
  // Real touch drag from fully collapsed to maximum, and back. No click-toggle on drag release.
  const cdp=await context.newCDPSession(page);
  for(const expand of [true,false]) {
   const box=(await grip.boundingBox())!,x=box.x+box.width/2,y=box.y+box.height/2;
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
   for(let step=1;step<=12;step++) {
    const delta=(expand?-1:1)*step*(width>height?width:height)/30;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:width>height?x+delta:x,y:width>height?y:y+delta}]});
   }
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   await expect(grip).toHaveAttribute('aria-expanded',String(expand));
  }
  await grip.focus(); await page.keyboard.press('Enter'); await expect(grip).toHaveAttribute('aria-expanded','true');
  await page.keyboard.press('Space'); await expect(grip).toHaveAttribute('aria-expanded','false');
  await openControls(page); await page.getByRole('button',{name:'Open team timer settings'}).tap();
  await page.getByRole('button',{name:'Off',exact:true}).tap();
  await page.locator('.screen-header-bar').getByRole('button',{name:'Close board controls',exact:true}).tap();
  clean();
 } finally {await context.close();}
});
