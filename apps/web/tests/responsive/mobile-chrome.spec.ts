// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later
import {test,expect} from '@playwright/test';
import {user,team} from './helpers';

for (const [width,height] of [[412,915],[384,832],[360,800],[915,412],[832,384],[800,360]]) {
 test(`phone header survives document pan ${width}x${height}`,async({browser})=>{
  const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,deviceScaleFactor:3});
  const page=await context.newPage();
  try {
   await user(page); await team(page);
   // Model mobile large/layout viewport exceeding the visible area while browser
   // chrome or keyboard changes. Root scrolling must not take board controls away.
   await page.addStyleTag({content:`html,body,#root { min-height:${height+240}px !important; }`});
   await page.evaluate(()=>window.scrollTo(0,180));
   const menu=page.getByRole('button',{name:'Open board controls',exact:true});
   const box=(await menu.boundingBox())!;
   expect(box.y).toBeGreaterThanOrEqual(0);
   expect(box.y+box.height).toBeLessThanOrEqual(height);
   await menu.tap();
   await expect(page.getByRole('dialog',{name:'Board controls'})).toBeVisible();
   await page.getByRole('button',{name:'Close board controls',exact:true}).tap();
   await expect(menu).toBeInViewport({ratio:1});
  } finally { await context.close(); }
 });
 test(`history finger jitter still toggles exactly once ${width}x${height}`,async({browser})=>{
  const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,deviceScaleFactor:3});
  const page=await context.newPage();
  try {
   await user(page); await team(page);
   const grip=page.locator('.history-stack-resize-handle:visible,.history-resize-handle:visible');
   const cdp=await context.newCDPSession(page);
   for(const expanded of [true,false,true]) {
    const box=(await grip.boundingBox())!,x=box.x+box.width/2,y=box.y+box.height/2;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-(width>height?2:0),y:y-(width>height?0:2)}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await expect(grip).toHaveAttribute('aria-expanded',String(expanded));
   }
   await expect(grip.locator('svg')).toBeVisible();
  } finally { await context.close(); }
 });
}

test('phone controls follow visual viewport pan and recover when browser chrome closes',async({browser})=>{
 const context=await browser.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true,deviceScaleFactor:3});
 const page=await context.newPage();
 try {
  await page.addInitScript(()=>{
   const viewport=Object.assign(new EventTarget(),{width:412,height:600,offsetTop:72,offsetLeft:0,scale:1});
   Object.defineProperty(window,'visualViewport',{configurable:true,value:viewport});
  });
  await user(page); await team(page);
  const header=page.locator('.mobile-board-bar');
  await expect.poll(async()=>(await header.boundingBox())!.y).toBeGreaterThanOrEqual(72);
  await page.getByRole('button',{name:'Open board controls',exact:true}).tap();
  const dialog=page.getByRole('dialog',{name:'Board controls'});
  const box=(await dialog.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(72);
  expect(box.y+box.height).toBeLessThanOrEqual(672);
  await page.getByRole('button',{name:'Close board controls',exact:true}).tap();
  await page.evaluate(()=>{
   Object.assign(window.visualViewport!,{height:915,offsetTop:0});
   window.visualViewport!.dispatchEvent(new Event('scroll'));
  });
  await expect.poll(async()=>(await header.boundingBox())!.y).toBeLessThan(10);
 } finally { await context.close(); }
});
