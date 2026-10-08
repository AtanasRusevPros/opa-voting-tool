// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later
import {test, expect} from '@playwright/test';
import {audit, closeDialog, diagnostics, team, user} from './helpers';
const matrix = [[320,568],[360,800],[375,667],[375,812],[414,896],[384,832],[390,844],[393,852],[412,915],[430,932],[800,360],[915,412],[768,1024],[1024,768],[1280,800],[1440,900],[1920,1080]];
for (const [width,height] of matrix) test(`views and ordering ${width}x${height}`, async ({browser}, info) => {
  const context = await browser.newContext({viewport:{width,height},isMobile:width<960,hasTouch:width<960,deviceScaleFactor:width<960?3:1});
  const page=await context.newPage(); const clean=diagnostics(page);
  try {
    await page.goto('/'); await audit(page,info,'login');
    await user(page); await audit(page,info,'chooser');
    await page.getByRole('button',{name:'About',exact:true}).click(); await audit(page,info,'about'); await closeDialog(page);
    await page.getByRole('button',{name:'Account',exact:true}).click(); await audit(page,info,'account');
    await page.getByRole('button',{name:'Review account deletion',exact:true}).click(); await audit(page,info,'delete');
    await page.getByRole('button',{name:'Cancel',exact:true}).click(); await closeDialog(page);
    const id=await team(page);
    if(width<=640) expect.soft((await page.locator('.screen-header').boundingBox())!.height).toBeLessThan(250);
    await audit(page,info,'board-idle');
    if(width<=640) {
      const controls=(await page.locator('.center-panel').boundingBox())!;
      const people=(await page.locator('.participant-ring').boundingBox())!;
      expect.soft(controls.y+controls.height).toBeLessThanOrEqual(people.y);
    }
    await page.getByLabel('Issue title').fill('A realistic long issue title for a small display');
    await page.getByRole('button',{name:'Start voting',exact:true}).click();
    await page.getByRole('button',{name:'5',exact:true}).click(); await audit(page,info,'board-active');
    await page.getByRole('button',{name:'Reveal score',exact:true}).click(); await audit(page,info,'board-revealed');
    await page.getByRole('button',{name:'Edit current issue title'}).click(); await audit(page,info,'title-editor');
    await page.getByRole('textbox',{name:'Edit current issue title'}).press('Escape');
    const board=await page.locator('.board-main').boundingBox();
    const history=await page.locator(width<960?'.stacked-history-panel':'.history-rail.desktop').boundingBox();
    if(width<960) expect.soft(board!.y+board!.height).toBeLessThanOrEqual(history!.y+1);
    else expect.soft(board!.x+board!.width).toBeLessThanOrEqual(history!.x+1);
    await page.getByRole('button',{name:'Team admin',exact:true}).click();
    for(const tab of ['People','Stats','Import/export']) {
      await page.getByRole('tab',{name:tab,exact:true}).click();
      if(tab==='Stats') await expect(page.getByTestId('stats-Completed rounds')).toBeVisible();
      await audit(page,info,`team-${tab.replace('/','-')}`);
    }
    await closeDialog(page);
    await page.getByRole('button',{name:'Open main menu'}).click();
    await page.getByRole('button',{name:'Account',exact:true}).click(); await audit(page,info,'account-after-vote'); await closeDialog(page);
    expect((await page.request.get(`/api/teams/${id}/state`)).ok()).toBe(true); clean();
  } finally {await context.close();}
});

test('touch history resize keeps tracking a continuous drag', async ({browser},info) => {
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage(); await user(page); await team(page);
  const handle=page.getByRole('button',{name:'Resize issues list height'});
  await expect(handle).toHaveCSS('touch-action','none');
  await page.screenshot({path:info.outputPath('before-touch.png')});
  const box=(await handle.boundingBox())!;
  const before=(await page.locator('.stacked-history-panel').boundingBox())!.height;
  const session=await context.newCDPSession(page);
  await page.evaluate(() => { (window as any).resizeCancelled=0; addEventListener('pointerdown',e=>{(window as any).resizeTarget=(e.target as Element).closest('button')?.getAttribute('aria-label');},{once:true}); addEventListener('pointercancel',()=>{(window as any).resizeCancelled++;}); });
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2}]});
  for(let step=1;step<=12;step++) {
    await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2-step*10}]});
    await page.waitForTimeout(25);
  }
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await audit(page,info,'touch-resize');
  expect(await page.evaluate(()=>(window as any).resizeTarget)).toBe('Resize issues list height');
  expect(await page.evaluate(()=>(window as any).resizeCancelled)).toBe(0);
  expect((await page.locator('.stacked-history-panel').boundingBox())!.height-before).toBeGreaterThan(80);
  await page.reload(); await expect(handle).toBeVisible();
  expect((await page.locator('.stacked-history-panel').boundingBox())!.height-before).toBeGreaterThan(80);
  await context.close();
});
