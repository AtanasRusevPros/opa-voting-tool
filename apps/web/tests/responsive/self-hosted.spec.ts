// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later
import {test, expect} from '@playwright/test';
import {audit, diagnostics, user, team, openControls, closeDialog} from './helpers';

const sizes = [[320,568],[360,800],[390,844],[412,915],[800,360],[768,1024],[1280,800],[1920,1080]];
for (const [width,height] of sizes) test(`self-hosted entry variants ${width}x${height}`, async ({page}, info) => {
  await page.setViewportSize({width,height});
  const clean = diagnostics(page);
  // Only delivery/configuration variants are mocked; the built application renders normally.
  let smtp = true, access = true;
  await page.route('**/api/bootstrap', async route => {
    const response = await route.fetch(); const data = await response.json();
    await route.fulfill({json:{...data, smtpConfigured:smtp, debugCodesEnabled:false, accessRequestsEnabled:access}});
  });
  for (const variant of ['email-access','email-only','manual-access','manual-only']) {
    smtp=variant.startsWith('email'); access=variant.endsWith('-access');
    await page.goto('/');
    await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeDisabled();
    await expect(page.getByRole('button',{name:'Start free public trial'})).toHaveCount(0);
    await expect(page.locator('.trial-welcome')).toHaveCount(0);
    await expect(page.getByText('Under Development',{exact:true})).toHaveCount(0);
    await expect(page.getByRole('button',{name:'Request access',exact:true})).toHaveCount(access ? 1 : 0);
    if (!smtp) await expect(page.getByText('Need a new password? Ask your team admin or platform admin.')).toBeVisible();
    const forgot=page.getByRole('button',{name:'Forgot password',exact:true});
    await expect(forgot).toBeDisabled();
    await page.getByLabel('Email',{exact:true}).fill('member@example-company.com');
    await expect(forgot).toBeEnabled();
    const sign=await page.getByRole('button',{name:'Sign in',exact:true}).boundingBox();
    const assist=await page.locator('.login-assistance-actions').boundingBox();
    expect(assist!.y).toBeGreaterThan(sign!.y+sign!.height);
    expect(Math.abs(assist!.width-sign!.width)).toBeLessThan(2);
    if (!access) expect(Math.abs((await forgot.boundingBox())!.width-sign!.width)).toBeLessThan(2);
    await audit(page,info,variant);
  }
  await page.goto('/admin');
  await expect(page.getByText('Platform administration',{exact:true})).toBeVisible();
  await page.getByLabel('Admin username').fill('local-test-admin');
  await page.getByLabel('Admin password').fill('LocalOnlyTest123!');
  await audit(page,info,'admin-login');
  await page.getByRole('button',{name:'Admin sign in',exact:true}).click();
  await expect(page.getByRole('button',{name:'Platform',exact:true})).toBeVisible();
  clean();
});

test('self-hosted real password login, account and team views omit hosted promotion and workspace controls', async ({page}, info) => {
  const email=await user(page);
  await page.context().clearCookies(); await page.goto('/');
  await page.getByLabel('Email',{exact:true}).fill(email);
  await page.getByLabel('Password',{exact:true}).fill('Password123!');
  await page.getByLabel('Password',{exact:true}).press('Enter');
  await expect(page.getByRole('button',{name:'Account',exact:true})).toBeVisible();
  const clean=diagnostics(page);
  await expect(page.locator('.chooser-project-footer .project-credit')).toContainText('Atanas G. Rusev');
  await expect(page.locator('.chooser-project-footer a')).toHaveCount(3);
  await page.getByRole('button',{name:'Account',exact:true}).click();
  await expect(page.getByText('Workspaces',{exact:true})).toHaveCount(0);
  await audit(page,info,'self-account'); await closeDialog(page);
  await page.getByRole('button',{name:'About',exact:true}).click();
  await expect(page.getByText('Self-hosted capacity depends on your server and workload.')).toBeVisible();
  await expect(page.getByRole('link',{name:'Trial terms'})).toHaveCount(0);
  await closeDialog(page); await team(page);
  await expect(page.locator('.workspace-context')).toHaveCount(0);
  await openControls(page); await page.getByRole('button',{name:'Team admin',exact:true}).click();
  await expect(page.getByRole('dialog').locator('.workspace-context')).toHaveCount(0); clean();
});

test('self-hosted reset/setup form and manual recovery remain usable', async ({page},info) => {
  // Isolate delivery from SMTP; test the actual form and back-navigation handlers.
  await page.route('**/api/auth/request-password-reset', route => route.fulfill({json:{ok:true,delivery:'smtp'}}));
  for (const width of [320,800,1280]) {
    await page.setViewportSize({width,height:800}); await page.goto('/');
    await page.getByLabel('Email',{exact:true}).fill('member@example-company.com');
    await page.getByRole('button',{name:'Forgot password'}).click();
    await expect(page.getByLabel('Email',{exact:true})).toHaveAttribute('readonly','');
    await page.getByLabel('16-digit code').fill('1234567890123456');
    await page.getByLabel('Display name',{exact:true}).fill('Team Member');
    await page.getByLabel('Password',{exact:true}).fill('Password123!');
    await page.getByLabel('Confirm password',{exact:true}).fill('Password123!');
    await expect(page.getByRole('button',{name:'Finish setup'})).toBeEnabled();
    await expect(page.locator('.trial-consent-row')).toHaveCount(0);
    await audit(page,info,`setup-${width}`);
    await page.getByRole('button',{name:'Back',exact:true}).click();
    await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeVisible();
  }
  await page.route('**/api/auth/request-password-reset', route=>route.fulfill({json:{ok:true,delivery:'manual-admin'}}));
  await page.getByRole('button',{name:'Forgot password'}).click();
  await expect(page.getByText(/Password reset is handled manually/)).toBeVisible();
  await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeVisible();
});

test('self-hosted configured company attribution wraps without displacing the form', async ({page},info) => {
  await page.route('**/api/bootstrap', async route => {
    const response=await route.fetch(); const data=await response.json();
    await route.fulfill({json:{...data,branding:{...data.branding,
      footerCreatorText:'Internal collaboration and delivery engineering',
      footerCompanyText:'CompanyWithAnUnusuallyLongUnbrokenNameForLayoutVerification'}}});
  });
  for(const width of [320,390,1280]) {
    await page.setViewportSize({width,height:800}); await page.goto('/');
    await expect(page.locator('.brand-footer')).toContainText('Internal collaboration');
    await audit(page,info,`company-${width}`);
    const panel=(await page.locator('.login-panel').boundingBox())!;
    const footer=(await page.locator('.brand-footer').boundingBox())!;
    expect(footer.x+footer.width).toBeLessThanOrEqual(panel.x+panel.width);
  }
});


test('self-hosted user and admin sign-in show quiet project credit at every entry size', async ({page},info) => {
  const clean=diagnostics(page);
  for(const [width,height] of sizes) {
    await page.setViewportSize({width,height});
    for(const route of ['/', '/admin']) {
      await page.goto(route);
      const credit=page.locator('.project-credit');
      await expect(credit).toContainText('OpaVoting · Created by Atanas G. Rusev');
      const resources=credit.getByRole('navigation',{name:'OpaVoting project resources'});
      for(const [name,href] of [
        ['GitHub','https://github.com/AtanasRusevPros/opa-voting-tool'],
        ['Documentation','https://github.com/AtanasRusevPros/opa-voting-tool/blob/main/project_docs/RnD_docs/USAGE.md'],
        ['AGPL-3.0-or-later','https://github.com/AtanasRusevPros/opa-voting-tool/blob/main/LICENSE']
      ]) {
        const link=resources.getByRole('link',{name,exact:true});
        await expect(link).toHaveAttribute('href',href);
        await expect(link).toHaveAttribute('target','_blank');
        await link.focus(); await expect(link).toBeFocused();
        await expect(link).toBeInViewport();
        expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      expect(await credit.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
      await page.evaluate(()=>scrollTo(0,0));
      await audit(page,info,`credit-${route==='/'?'user':'admin'}-${width}`);
    }
  }
  clean();
});
