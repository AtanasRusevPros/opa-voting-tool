// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later
import {test,expect} from '@playwright/test';
import {audit,user,team,closeDialog,diagnostics} from './helpers';
test('enlarged text and reduced height keep forms and voting reachable',async({page},info)=>{
  await page.setViewportSize({width:360,height:800}); const clean=diagnostics(page);
  await user(page); await team(page);
  await page.addStyleTag({content:'html {font-size: 20px;}'});
  await page.getByLabel('Issue title').fill('Text scaling and reduced viewport check');
  await page.setViewportSize({width:360,height:450});
  await page.getByRole('button',{name:'Start voting',exact:true}).click();
  await page.getByRole('button',{name:'5',exact:true}).click();
  await audit(page,info,'reduced-height');
  await page.getByRole('button',{name:'Edit profile'}).click(); await audit(page,info,'scaled-account'); await closeDialog(page);
  await page.setViewportSize({width:800,height:360}); await page.getByRole('button',{name:'Reveal score',exact:true}).click();
  await expect(page.getByText('Average score: 5',{exact:true})).toBeVisible(); await audit(page,info,'rotated'); clean();
});
