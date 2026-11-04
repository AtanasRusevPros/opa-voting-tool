// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later
import {test, expect} from '@playwright/test';
import {admin, setDefault, register, appearance, expectTheme, closeDialog, diagnostics, baseUrl} from './helpers';

test('preview, cancel, failed save, tab sync, sign-out and a different account', async ({browser}) => {
  const operator = await admin(browser, false);
  const context = await browser.newContext({baseURL:baseUrl(false)});
  const page = await context.newPage(); const errors = diagnostics(page);
  try {
    await setDefault(operator,'nord'); const email = await register(page,false);
    const second = await context.newPage(); await second.goto('/?view=teams'); await expectTheme(second,'nord');
    await page.getByRole('button',{name:'Account',exact:true}).click();
    await page.getByLabel('Theme',{exact:true}).selectOption('dracula');
    await expectTheme(page,'nord'); await closeDialog(page);
    await page.getByRole('button',{name:'Account',exact:true}).click();
    await expect(page.getByLabel('Theme',{exact:true})).toHaveValue('');
    errors.allow('/api/auth/preferences',503);
    await page.route('**/api/auth/preferences',route=>route.fulfill({status:503,json:{error:'Appearance service temporarily unavailable.'}}));
    await appearance(page,'dracula');
    await expect(page.getByText('Appearance service temporarily unavailable.',{exact:true})).toBeVisible();
    await expectTheme(page,'nord'); await page.unroute('**/api/auth/preferences');
    await appearance(page,'opa-midnight-ember'); await expectTheme(page,'opa-midnight-ember');
    await expectTheme(second,'opa-midnight-ember');
    await closeDialog(page); await page.getByRole('button',{name:'Sign out',exact:true}).click();
    await expectTheme(page,'nord');
    expect(await page.evaluate(()=>localStorage.getItem('planning-poker:appearance'))).toBeNull();
    await register(page,false); await expectTheme(page,'nord');
    await page.getByRole('button',{name:'Sign out',exact:true}).click();
    const login=await page.request.post('/api/auth/signin-password',{data:{email,password:'Password123!'}});
    expect(login.ok(),await login.text()).toBe(true);
    await page.reload(); await expectTheme(page,'opa-midnight-ember'); errors.check();
  } finally {await context.close();await operator.close();}
});

test('delayed startup retains the server palette; transient refresh and expired session behave differently',async({browser})=>{
  const operator=await admin(browser,false);const context=await browser.newContext({baseURL:baseUrl(false)});
  const page=await context.newPage(); const errors=diagnostics(page);
  try {
    await setDefault(operator,'nord'); await register(page,false);
    expect((await page.request.patch('/api/auth/preferences',{data:{themeId:'opa-midnight-aurora'}})).ok()).toBe(true);
    await page.addInitScript(()=>{
      (window as any).themeTransitions=[];
      new MutationObserver(()=>{const id=document.documentElement?.dataset.theme;if(id)(window as any).themeTransitions.push(id);})
        .observe(document,{subtree:true,attributes:true,attributeFilter:['data-theme']});
    });
    let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
    await page.route('**/api/auth/session',async route=>{await gate;await route.continue();});
    await page.route('**/api/bootstrap',async route=>{await gate;await route.continue();});
    await page.reload({waitUntil:'domcontentloaded'}); await expectTheme(page,'opa-midnight-aurora');
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    expect(await page.evaluate(()=>(window as any).themeTransitions)).not.toContain('opa-light');
    release(); await expect(page.getByRole('button',{name:'Account',exact:true})).toBeVisible();
    await page.unroute('**/api/auth/session');await page.unroute('**/api/bootstrap');
    errors.allow('/api/auth/session',503);errors.allow('/api/bootstrap',503);
    for(const path of ['session','bootstrap']) await page.route(`**/api/${path==='session'?'auth/session':'bootstrap'}`,route=>route.fulfill({status:503,json:{error:'Temporary outage'}}));
    const unavailable=page.waitForResponse(r=>r.url().endsWith('/api/auth/session')&&r.status()===503);
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await unavailable;
    await expectTheme(page,'opa-midnight-aurora');
    await page.unroute('**/api/auth/session');await page.unroute('**/api/bootstrap');
    // The same focus event also refreshes notifications; both protected reads now expire.
    errors.allow('/api/auth/notifications',401);
    expect((await page.request.post('/api/auth/signout')).ok()).toBe(true);
    const expired=page.waitForResponse(r=>r.url().endsWith('/api/auth/session')&&r.status()===401);
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expired;
    await expectTheme(page,'nord');errors.check();
  }finally{await context.close();await operator.close();}
});

test('blocked browser storage keeps cookie-based appearance usable',async({browser})=>{
  const operator=await admin(browser,false);const context=await browser.newContext({baseURL:baseUrl(false)});
  const page=await context.newPage(); const errors=diagnostics(page);
  try {
    await setDefault(operator,'opa-light');await register(page,false);
    await page.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Storage disabled','SecurityError');}}));
    await page.reload();await page.getByRole('button',{name:'Account',exact:true}).click();
    await appearance(page,'nord');await expectTheme(page,'nord');await page.reload();await expectTheme(page,'nord');errors.check();
  }finally{await context.close();await operator.close();}
});
