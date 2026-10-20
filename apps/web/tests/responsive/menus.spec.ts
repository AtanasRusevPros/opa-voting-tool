// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later
import {test,expect} from '@playwright/test';
import {audit,user,team,openControls,showHistory,diagnostics} from './helpers';
import {phoneViewports} from './mobileMatrix';
for(const [width,height] of [...phoneViewports,[1440,900]]) test(`board menus ${width}x${height}`,async({browser},info)=>{
  const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:width<960});
  const page=await context.newPage(); const clean=diagnostics(page);
  try { await user(page); await team(page);
  await openControls(page);
  await page.getByRole('button',{name:'Open team timer settings'}).tap(); await audit(page,info,'timer'); await page.keyboard.press('Escape');
  for(const section of ['Numbering system','Rename team','Time popup','Minimum participation','Keyboard shortcuts']) {
    await openControls(page);
    await page.getByRole('button',{name:'Open team settings'}).tap();
    await page.getByRole('button',{name:section,exact:true}).tap(); await audit(page,info,section.replaceAll(' ','-'));
    if(section==='Rename team') {
      await page.getByRole('textbox',{name:'Rename team',exact:true}).fill(`Renamed ${Date.now()}`);
      await page.getByRole('button',{name:'Save team name',exact:true}).tap();
    } else if(section==='Numbering system') await page.getByRole('button',{name:'Save numbering',exact:true}).tap();
    else if(section==='Time popup') await page.getByRole('button',{name:'Save default zones',exact:true}).tap();
    else if(section==='Minimum participation') await page.getByRole('button',{name:'Save participation rule',exact:true}).tap();
    await page.keyboard.press('Escape');
  }
  await openControls(page);
  await page.getByRole('button',{name:'Open notifications'}).tap(); await audit(page,info,'notifications'); await page.keyboard.press('Escape');
  await openControls(page);
  await page.getByRole('button',{name:'Edit profile'}).tap(); await audit(page,info,'profile');
  await page.getByRole('button',{name:'Edit display name',exact:true}).tap();
  await page.getByLabel('Display name',{exact:true}).fill('Updated mobile profile');
  await page.getByRole('button',{name:'Save display name',exact:true}).tap();
  await expect(page.getByLabel('Display name',{exact:true})).toHaveValue('Updated mobile profile');
  await expect(page.getByRole('button',{name:'Edit display name',exact:true})).toBeVisible();
  await page.getByRole('dialog',{name:'Account settings',exact:true}).getByRole('button',{name:'Close',exact:true}).tap();
  await openControls(page);
  await page.getByRole('button',{name:'Switch team',exact:true}).tap(); await audit(page,info,'switch-team'); await page.keyboard.press('Escape');
  await showHistory(page);
  await page.getByRole('tab',{name:'Search',exact:true}).tap(); await audit(page,info,'history-search');
  await page.getByLabel('Title or words',{exact:true}).fill('Mobile search');
  await page.getByRole('button',{name:'Search history',exact:true}).tap();
  await expect(page.getByRole('button',{name:'Search history',exact:true})).toBeEnabled();
  const shell=page.locator('.board-shell');
  for(const w of (width===1440?[479,480,481,639,640,641,719,720,721,959,960,961,1079,1080,1081,1279,1280,1281]:[])) {
    await page.setViewportSize({width:w,height:900});
    await expect(shell).toHaveClass(w<=959?/is-stacked-history/:/^((?!is-stacked-history).)*$/);
    expect.soft(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`boundary ${w}`).toBe(true);
  }
  clean();
  } finally { await context.close(); }
});
