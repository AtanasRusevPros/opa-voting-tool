// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later
import {test,expect} from '@playwright/test';
import {audit,user,team} from './helpers';
for(const [width,height] of [[320,568],[390,844],[800,360],[1440,900]]) test(`board menus ${width}x${height}`,async({page},info)=>{
  await page.setViewportSize({width,height}); await user(page); await team(page);
  await page.getByRole('button',{name:'Open team timer settings'}).click(); await audit(page,info,'timer'); await page.keyboard.press('Escape');
  for(const section of ['Numbering system','Rename team','Time popup','Minimum participation','Keyboard shortcuts']) {
    await page.getByRole('button',{name:'Open team settings'}).click();
    await page.getByRole('button',{name:section,exact:true}).click(); await audit(page,info,section.replaceAll(' ','-')); await page.keyboard.press('Escape');
  }
  await page.getByRole('button',{name:'Edit profile'}).click(); await audit(page,info,'profile'); await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Switch team',exact:true}).click(); await audit(page,info,'switch-team'); await page.keyboard.press('Escape');
  await page.getByRole('tab',{name:'Search',exact:true}).click(); await audit(page,info,'history-search');
  const shell=page.locator('.board-shell');
  for(const w of [479,480,481,639,640,641,719,720,721,959,960,961,1079,1080,1081,1279,1280,1281]) {
    await page.setViewportSize({width:w,height:900});
    await expect(shell).toHaveClass(w<=959?/is-stacked-history/:/^((?!is-stacked-history).)*$/);
    expect.soft(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`boundary ${w}`).toBe(true);
  }
});
