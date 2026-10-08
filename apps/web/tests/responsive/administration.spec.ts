// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later
import {test, expect} from '@playwright/test';
import {audit, diagnostics} from './helpers';
for (const [width,height] of [[360,800],[390,844],[412,915],[800,360],[768,1024],[1440,900]]) {
  test(`platform sections ${width}x${height}`,async ({page},info)=>{
    await page.setViewportSize({width,height}); const clean=diagnostics(page);
    const result=await page.request.post('/api/auth/signin-admin',{data:{username:process.env.PLAYWRIGHT_ADMIN_USERNAME || 'local-test-admin',password:process.env.PLAYWRIGHT_ADMIN_PASSWORD || 'LocalOnlyTest123!'}});
    expect(result.ok()).toBe(true); await page.goto('/');
    await page.getByRole('button',{name:'Platform',exact:true}).click();
    for(const tab of ['People','Stats','Branding','App settings','SMTP','Super-admin']) {
      await page.getByRole('tab',{name:tab,exact:true}).click();
      if(tab==='Stats') {
        const count=page.getByTestId('stats-Completed rounds');
        await count.scrollIntoViewIfNeeded(); await expect(count).toBeInViewport({ratio:1});
      }
      await audit(page,info,tab.replaceAll(' ','-'));
    }
    clean();
  });
}
