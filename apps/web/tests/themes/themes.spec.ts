// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later
import {test, expect} from '@playwright/test';
import {THEMES, type ThemeId} from '@planning-poker/shared';
import {admin, setDefault, register, createTeam, appearance, expectTheme, audit, diagnostics,
  baseUrl, closeDialog, openControls, showHistory} from './helpers';

for (const theme of THEMES) for (const trial of [false,true]) for (const mobile of [false,true]) {
  test(`${theme.id} ${trial?'trial':'self-hosted'} ${mobile?'phone':'desktop'} palette journey`, async ({browser},info) => {
    const operator = await admin(browser,trial);
    const context = await browser.newContext({baseURL:baseUrl(trial), viewport:mobile?{width:360,height:800}:{width:1440,height:900},hasTouch:mobile});
    const page = await context.newPage(); const errors = diagnostics(page);
    try {
      await setDefault(operator,theme.id);
      const noJs = await browser.newContext({baseURL:baseUrl(trial),javaScriptEnabled:false});
      try {
        const initial=await noJs.newPage(); const response=await initial.goto('/');
        expect(response?.headers()['cache-control']).toContain('no-store');
        await expectTheme(initial,theme.id);
        if(trial) {
          await expect(initial.getByRole('heading',{level:1})).toBeVisible();
          await initial.goto('/public-trial/privacy'); await expectTheme(initial,theme.id);
          await expect(initial.getByRole('heading',{name:'Your Privacy Requests',exact:true})).toBeVisible();
        }
      } finally {await noJs.close();}
      await page.goto('/'); await expectTheme(page,theme.id);
      await audit(page,info,'entry');
      await register(page,trial); await expectTheme(page,theme.id);
      await page.getByRole('button',{name:'Account',exact:true}).click();
      await appearance(page,theme.id); await expectTheme(page,theme.id);
      await audit(page,info,'appearance'); await closeDialog(page);
      await setDefault(operator,theme.id==='opa-light'?'nord':'opa-light');
      await page.reload(); await expectTheme(page,theme.id);
      const teamId=await createTeam(page); await expectTheme(page,theme.id);
      await page.getByLabel('Issue title',{exact:true}).fill('Theme preserves a real vote');
      await page.getByRole('button',{name:'Start voting',exact:true}).click();
      await page.getByRole('button',{name:'5',exact:true}).click();
      await audit(page,info,'active-board');
      await page.getByRole('button',{name:'Reveal score',exact:true}).click();
      await expect(page.getByText('Average score: 5',{exact:true})).toBeVisible();
      await showHistory(page); await audit(page,info,'revealed-history');
      if(mobile) {
        await page.setViewportSize({width:800,height:360}); await showHistory(page);
        await audit(page,info,'landscape');
      }
      await openControls(page); await page.getByRole('button',{name:'Team admin',exact:true}).click();
      for(const tab of ['People','Stats','Import/export']) {
        await page.getByRole('tab',{name:tab,exact:true}).click();
        if(tab==='Stats') await expect(page.getByTestId('stats-Completed rounds')).toBeVisible();
        await audit(page,info,`team-${tab.replace('/','-')}`);
      }
      await closeDialog(page);
      expect((await page.request.get(`/api/teams/${teamId}/state`)).ok()).toBe(true);
      await page.goto('/?view=teams'); await page.getByRole('button',{name:'About',exact:true}).click();
      await audit(page,info,'about'); await closeDialog(page);
      await page.getByRole('button',{name:'Account',exact:true}).click();
      await appearance(page,''); await expectTheme(page,theme.id==='opa-light'?'nord':'opa-light');
      errors.check();
    }finally{await context.close();await operator.close();}
  });
}

for(const themeId of ['opa-light','nord','opa-midnight-ember'] as ThemeId[]) for(const trial of [false,true]) {
  test(`${themeId} ${trial?'trial':'self-hosted'} full administration and layers`,async({browser},info)=>{
    test.setTimeout(180000);
    const context=await admin(browser,trial);const page=await context.newPage();const errors=diagnostics(page);
    try {
      await setDefault(context,themeId); await page.goto('/'); await expectTheme(page,themeId);
      await page.getByRole('button',{name:'Platform',exact:true}).click();
      for(const size of [{width:1440,height:900},{width:320,height:568},{width:412,height:915},{width:915,height:412},{width:768,height:1024}]) {
        await page.setViewportSize(size);
        for(const tab of ['People','Stats','Branding','App settings','SMTP','Super-admin']) {
          await page.getByRole('tab',{name:tab,exact:true}).click();
          if(tab==='Stats') await expect(page.getByTestId('stats-Completed rounds')).toBeVisible();
          await audit(page,info,`${tab.replaceAll(' ','-')}-${size.width}`);
        }
      }
      await closeDialog(page); await page.getByRole('button',{name:'Account',exact:true}).click();
      await audit(page,info,'admin-account'); await closeDialog(page);
      await page.emulateMedia({forcedColors:'active'}); await page.getByRole('button',{name:'Account',exact:true}).click();
      await expect(page.getByLabel('Theme',{exact:true})).toBeVisible();
      await page.getByLabel('Theme',{exact:true}).focus(); await expect(page.getByLabel('Theme',{exact:true})).toBeFocused();
      await page.emulateMedia({forcedColors:'none'});errors.check();
    }finally{await context.close();}
  });
}

test('native controls and first-paint across every palette',async({browser},info)=>{
  test.setTimeout(180000);
  const operator=await admin(browser,false);
  const context=await browser.newContext({baseURL:baseUrl(false)});const page=await context.newPage();const errors=diagnostics(page);
  try {
    await register(page,false);
    for(const theme of THEMES) {
      await setDefault(operator,theme.id);
      // Reload just after the chooser's 3-second refresh has completed. WebKit
      // reports a fetch started during document unload as an access-control error.
      const session=await page.waitForResponse(response=>new URL(response.url()).pathname==='/api/auth/session',{timeout:10000});
      expect(session.status()).toBe(200);
      expect(await session.finished()).toBeNull();
      await page.reload(); await expectTheme(page,theme.id);
      await page.getByRole('button',{name:'Account',exact:true}).click();
      const select=page.getByLabel('Theme',{exact:true});await select.focus();await expect(select).toBeFocused();
      await expect(select).toHaveCSS('color-scheme',theme.colorScheme);
      await audit(page,info,theme.id,'.theme-preview strong, .theme-preview p, .theme-preview input, .theme-preview .primary-button, .theme-preview .secondary-button, .theme-preview .danger-button, .theme-preview .success-banner, .theme-preview .error-banner');
      await page.emulateMedia({reducedMotion:'reduce'});
      await expect(page.locator('.theme-preview')).toBeVisible();
      await page.emulateMedia({media:'print'});
      await expect(page.locator('body')).toHaveCSS('background-color','rgb(255, 255, 255)');
      await page.emulateMedia({media:'screen',reducedMotion:'no-preference'});await closeDialog(page);
    }
    errors.check();
  }finally{await context.close();await operator.close();}
});
