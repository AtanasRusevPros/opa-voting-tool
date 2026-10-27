// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later
import {test, expect} from '@playwright/test';
import {phoneViewports} from './mobileMatrix';
import {audit, openControls, closeDialog, diagnostics, user, team} from './helpers';

const sizes = [...phoneViewports, [640,900], [768,1024], [1024,768], [1280,800], [1440,900], [1920,1080]];
const names = ['QA', "John Doe’s Workspace", 'International research and development '.repeat(2).slice(0,80), 'W'.repeat(80)];
for (const [width,height] of sizes) test(`workspace identity and controls at ${width}x${height}`, async ({browser}, info) => {
  const context = await browser.newContext({baseURL:process.env.PLAYWRIGHT_TRIAL_BASE_URL, viewport:{width,height}, hasTouch:width < 640 || height < 500});
  const page = await context.newPage();
  try {
    const email = `context-${width}-${height}-${Date.now()}@example.com`;
    const code = await (await page.request.post('/api/auth/public-trial/request-code',{data:{email}})).json();
    const signup = await page.request.post('/api/auth/public-trial/signup',{data:{email,code:code.debugCode,displayName:'Workspace Owner',avatarIconKey:'bear',avatarColorKey:'azure',password:'Password123!',acceptedTerms:true,acceptedTermsVersion:code.termsVersion}});
    expect(signup.status()).toBe(201);
    const data = await signup.json(); const teamId = data.team.id;
    await page.goto(`/?teamId=${teamId}`); await expect(page.locator('.board-shell')).toBeVisible();
    const clean = diagnostics(page);
    for (const name of names) {
      expect((await page.request.patch(`/api/workspaces/${data.workspace.id}`, {data:{name}})).ok()).toBe(true);
      await openControls(page);
      const identity = page.locator('.screen-header .workspace-context');
      await expect(identity.locator('summary')).toHaveText(`Workspace: ${name}`);
      const mobile = await page.locator('.board-shell').evaluate(el=>el.classList.contains('is-mobile-board'));
      if (mobile) await expect(page.locator('.mobile-board-bar .workspace-context')).toHaveCount(0);
      await identity.locator('summary').click();
      await expect(identity.locator('.workspace-context-full')).toBeVisible();
      await expect(identity.locator('.workspace-context-full')).toHaveText(name);
      await audit(page,info,`board-name-${name.length}-${name.startsWith('W')}`);
      await identity.locator('summary').click();
      await page.getByRole('button',{name:'Team admin',exact:true}).click();
      const dialog = page.getByRole('dialog', {name:/people$/});
      await expect(dialog.locator('.workspace-context summary')).toHaveText(`Workspace: ${name}`);
      await dialog.locator('.workspace-context summary').press('Enter');
      await expect(dialog.locator('.workspace-context-full')).toBeVisible();
      await audit(page,info,`admin-name-${name.length}-${name.startsWith('W')}`);
      expect(await dialog.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
      const bounds = await dialog.boundingBox();
      const labelBounds = await dialog.locator('.workspace-context').boundingBox();
      expect(labelBounds!.x + labelBounds!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width);
      await dialog.getByRole('button',{name:'Rename team',exact:true}).click();
      await expect(dialog.getByLabel('Team name',{exact:true})).toBeVisible();
      await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
      await closeDialog(page);
    }
    await openControls(page);
    const close = page.getByRole('button',{name:'Close board controls'});
    if (await close.isVisible()) await close.click();
    await page.getByPlaceholder('ISSUE-12345 or short title').fill('Workspace layout voting');
    await page.getByRole('button',{name:/Start voting/}).click();
    await expect(page.locator('.issue-title-text').filter({hasText:'Workspace layout voting'})).toBeVisible();
    clean();
  } finally {await context.close();}
});

test('ordinary self-hosted board and Team Admin omit workspace context',async ({page})=>{
  await user(page); await team(page);
  await expect(page.locator('.workspace-context')).toHaveCount(0);
  await openControls(page); await page.getByRole('button',{name:'Team admin',exact:true}).click();
  await expect(page.getByRole('dialog').locator('.workspace-context')).toHaveCount(0);
});


test('collaborator sees the selected workspace and receives renames in an open directory', async ({browser}) => {
  const owner = await browser.newContext({baseURL:process.env.PLAYWRIGHT_TRIAL_BASE_URL});
  const member = await browser.newContext({baseURL:process.env.PLAYWRIGHT_TRIAL_BASE_URL});
  try {
    const signup = async (context: typeof owner, label: string) => {
      const email = `${label}-${Date.now()}@example.com`;
      const code = await (await context.request.post('/api/auth/public-trial/request-code',{data:{email}})).json();
      const response = await context.request.post('/api/auth/public-trial/signup',{data:{email,code:code.debugCode,displayName:label,avatarIconKey:'bear',avatarColorKey:'azure',password:'Password123!',acceptedTerms:true,acceptedTermsVersion:code.termsVersion}});
      expect(response.status()).toBe(201); return {...await response.json(), email};
    };
    const a = await signup(owner, 'Owner'), b = await signup(member, 'Member');
    expect((await owner.request.post(`/api/teams/${a.team.id}/members`,{data:{email:b.email}})).status()).toBe(201);
    const page = await member.newPage();
    await page.goto(`/?teamId=${a.team.id}`);
    await expect(page.locator('.screen-header .workspace-context summary')).toHaveText(`Workspace: ${a.workspace.name}`);
    await page.getByRole('button',{name:'Members',exact:true}).click();
    expect((await owner.request.patch(`/api/workspaces/${a.workspace.id}`,{data:{name:'Renamed shared workspace'}})).ok()).toBe(true);
    await expect(page.getByRole('dialog').locator('.workspace-context summary')).toHaveText('Workspace: Renamed shared workspace');
    await expect(page.getByRole('dialog').getByRole('button',{name:'Rename team',exact:true})).toHaveCount(0);
    await closeDialog(page);
    await expect(page.locator('.screen-header .workspace-context summary')).toHaveText('Workspace: Renamed shared workspace');
    await page.goto(`/?teamId=${b.team.id}`);
    await expect(page.locator('.screen-header .workspace-context summary')).toHaveText(`Workspace: ${b.workspace.name}`);
    expect((await page.request.patch('/api/auth/preferences',{data:{openLastTeamOnLogin:false}})).ok()).toBe(true);
    await page.goto('/?view=teams');
    const row = page.locator('.team-tile').filter({hasText:'Renamed shared workspace'});
    await row.getByRole('button',{name:'People',exact:true}).click();
    await expect(page.getByRole('dialog').locator('.workspace-context summary')).toHaveText('Workspace: Renamed shared workspace');
  } finally {await owner.close(); await member.close();}
});
