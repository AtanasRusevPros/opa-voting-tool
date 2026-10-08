// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later
import {test, expect} from '@playwright/test';
import {audit,closeDialog} from './helpers';
test('trial welcome, registration, policies and workspace report across phone/tablet/desktop',async ({browser},info)=>{
  test.skip(!process.env.PLAYWRIGHT_TRIAL_BASE_URL,'Requires a separate disposable trial server.');
  const context=await browser.newContext({baseURL:process.env.PLAYWRIGHT_TRIAL_BASE_URL}); const page=await context.newPage();
  await page.route('**/api/auth/public-trial/request-code', route=>route.fulfill({json:{debugCode:'123456',termsVersion:'layout-only'}}));
  for(const [width,height] of [[320,568],[360,800],[384,832],[390,844],[393,852],[412,915],[430,932],[800,360],[768,1024],[1440,900]]) {
    await page.setViewportSize({width,height}); await page.goto('/'); await audit(page,info,`welcome-${width}`);
    await page.getByLabel('Email', {exact:true}).fill('responsive@example.com');
    await page.getByRole('button',{name:'Start free public trial',exact:true}).click(); await audit(page,info,`register-${width}`);
  }
  for(const policy of ['terms','privacy','acceptable-use','export-cleanup']) {
    await page.setViewportSize({width:360,height:800}); await page.goto(`/public-trial/${policy}`); await audit(page,info,policy);
  }
  await page.unroute('**/api/auth/public-trial/request-code');
  const email=`mobile-${Date.now()}@example.com`;
  const response=await page.request.post('/api/auth/public-trial/request-code',{data:{email}}); expect(response.ok()).toBe(true); const code=await response.json();
  expect((await page.request.post('/api/auth/public-trial/signup',{data:{email,code:code.debugCode,displayName:'Mobile Owner',avatarIconKey:'bear',avatarColorKey:'azure',password:'Password123!',acceptedTerms:true,acceptedTermsVersion:code.termsVersion}})).status()).toBe(201);
  expect((await page.request.patch('/api/auth/preferences',{data:{openLastTeamOnLogin:false}})).ok()).toBe(true);
  for(const [width,height] of [[360,800],[390,844],[800,360],[768,1024],[1440,900]]) {
    await page.setViewportSize({width,height}); await page.goto('/?view=teams');
    await page.getByRole('button',{name:'Account',exact:true}).click();
    await page.getByRole('button',{name:/Workspace stats:/}).click(); await expect(page.getByTestId('stats-Completed rounds')).toBeVisible();
    await audit(page,info,`workspace-${width}`); await closeDialog(page);
  }
  await context.close();
});
