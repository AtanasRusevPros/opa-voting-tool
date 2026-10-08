// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later
import {test,expect} from '@playwright/test';
import {user,team} from './helpers';
test('header pull refresh is deliberate, cancellable and restores the team',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage(); await user(page); const id=await team(page);
  const cdp=await context.newCDPSession(page);
  const header=(await page.locator('.screen-header').boundingBox())!;
  const x=header.x+3,y=header.y+3;
  const drag=async(distance:number,cancel=false)=>{
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    for(let step=1;step<=10;step++) await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+distance*step/10}]});
    await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});
  };
  let navigations=0; page.on('request',request=>{if(request.isNavigationRequest() && request.frame()===page.mainFrame()) navigations++;});
  await drag(40); await page.waitForTimeout(100); expect(navigations).toBe(0);
  await drag(120,true); await page.waitForTimeout(100); expect(navigations).toBe(0);
  await Promise.all([page.waitForEvent('framenavigated'),drag(120)]);
  await expect(page.locator('.board-shell')).toBeVisible(); expect(page.url()).toContain(id);
  expect(navigations).toBe(1);
  const handle=page.getByRole('button',{name:'Resize issues list height'});
  const before=(await page.locator('.stacked-history-panel').boundingBox())!.height;
  await handle.focus(); await page.keyboard.press('ArrowUp');
  expect((await page.locator('.stacked-history-panel').boundingBox())!.height).toBeGreaterThan(before);
  expect(navigations).toBe(1); await context.close();
});
