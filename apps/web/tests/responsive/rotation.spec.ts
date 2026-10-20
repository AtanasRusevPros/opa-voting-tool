// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later
import {test,expect} from '@playwright/test';
import {user,team,showHistory} from './helpers';
test('rotation preserves editable next issue and Deal submits the entered title',async({page})=>{
 await page.setViewportSize({width:390,height:844}); await user(page); await team(page);
 await page.getByLabel('Issue title',{exact:true}).fill('First mobile round');
 await page.getByRole('button',{name:'Start voting',exact:true}).click();
 await page.getByRole('button',{name:'5',exact:true}).click();
 await page.getByRole('button',{name:'Reveal score',exact:true}).click();
 await page.setViewportSize({width:844,height:390});
 await page.getByLabel('Next issue title',{exact:true}).fill('Draft before rotating');
 await page.setViewportSize({width:390,height:844});
 await expect(page.getByLabel('Next issue title',{exact:true})).toHaveValue('Draft before rotating');
 await page.getByLabel('Next issue title',{exact:true}).fill('Second round after rotating');
 await page.getByRole('button',{name:'Deal',exact:true}).click();
 await expect(page.getByRole('heading',{name:/Second round after rotating/})).toBeVisible();
 await page.setViewportSize({width:844,height:390});
 await showHistory(page);
 const history=page.locator('.history-rail.desktop');
 await expect(history).toBeVisible();
});
