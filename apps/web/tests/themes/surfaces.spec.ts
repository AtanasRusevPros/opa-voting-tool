// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later
import {test, expect, type Page} from '@playwright/test';
import type {ThemeId} from '@planning-poker/shared';
import {admin, setDefault, register, createTeam, appearance, expectTheme, audit, diagnostics,
  baseUrl, closeDialog, openControls, showHistory} from './helpers';

async function closeControls(page: Page) {
  const close = page.getByRole('button', {name: 'Close board controls', exact: true});
  if (await close.isVisible()) await close.click();
}

// Six deeper journeys complement the catalogue sweep without multiplying every
// interaction across all 18 palettes. Trial runs also exercise the phone layout.
for (const themeId of ['opa-light', 'nord', 'opa-midnight-ember'] as ThemeId[]) for (const trial of [false, true]) {
  test(`${themeId} ${trial ? 'trial phone' : 'self-hosted desktop'} history, personal settings and read-only surfaces`, async ({browser}, info) => {
    test.setTimeout(180000);
    const operator = await admin(browser, trial);
    const options = {baseURL: baseUrl(trial), viewport: trial ? {width: 390, height: 844} : {width: 1440, height: 900}, hasTouch: trial};
    const ownerContext = await browser.newContext(options);
    const memberContext = await browser.newContext(options);
    const owner = await ownerContext.newPage(), member = await memberContext.newPage();
    const ownerErrors = diagnostics(owner), memberErrors = diagnostics(member);
    try {
      await setDefault(operator, themeId);
      await register(owner, trial);
      await owner.getByRole('button', {name: 'Account', exact: true}).click();
      await appearance(owner, themeId); await expectTheme(owner, themeId); await closeDialog(owner);
      const teamId = await createTeam(owner);
      const memberEmail = await register(member, trial);
      expect((await owner.request.post(`/api/teams/${teamId}/members`, {data: {email: memberEmail}})).ok()).toBe(true);

      // Ordinary membership still has personal appearance, with no platform or
      // team-administration controls. The server also enforces the same boundary.
      await member.getByRole('button', {name: 'Account', exact: true}).click();
      await appearance(member, themeId); await expectTheme(member, themeId);
      await expect(member.getByLabel('Platform default theme', {exact: true})).toHaveCount(0);
      await audit(member, info, 'member-appearance', 'h3:visible, .appearance-settings p:visible, .theme-preview strong:visible');
      await closeDialog(member);
      await expect(member.getByRole('button', {name: 'Platform', exact: true})).toHaveCount(0);
      expect((await member.request.get('/api/admin/config')).status()).toBe(403);
      await member.goto(`/?teamId=${teamId}`);
      await expect(member.locator('.board-shell')).toBeVisible();
      const memberState = await (await member.request.get(`/api/teams/${teamId}/state`)).json();
      expect(memberState.currentUserRole).toBe('member');
      await openControls(member);
      await expect(member.getByRole('button', {name: 'Team admin', exact: true})).toHaveCount(0);
      await member.getByRole('button', {name: 'Members', exact: true}).click();
      await expect(member.getByRole('dialog').last().getByRole('tab', {name: 'Stats', exact: true})).toHaveCount(0);
      await closeDialog(member); await closeControls(member);

      await owner.getByLabel('Issue title', {exact: true}).fill('Appearance history issue');
      await owner.getByRole('button', {name: 'Start voting', exact: true}).click();
      await owner.getByRole('button', {name: '5', exact: true}).click();
      await member.getByRole('button', {name: '8', exact: true}).click();
      await expect(member.getByRole('button', {name: 'Edit current issue title', exact: true})).toHaveCount(0);
      await owner.getByRole('button', {name: 'Reveal score', exact: true}).click();
      await expect(owner.getByText('Average score: 6.5', {exact: true})).toBeVisible();
      await owner.getByRole('button', {name: 'Edit current issue title', exact: true}).click();
      const currentTitle = owner.getByRole('textbox', {name: 'Edit current issue title', exact: true});
      await currentTitle.fill('Appearance history revised'); await currentTitle.press('Enter');
      await expect(owner.locator('h2.floating-chip')).toHaveText('Appearance history revised');

      // Advance the current issue so the older history title has its own editor.
      const nextRound = await owner.request.post(`/api/teams/${teamId}/rounds`, {data: {title: 'Another appearance issue'}});
      expect(nextRound.ok(), await nextRound.text()).toBe(true);
      const {round} = await nextRound.json();
      expect((await owner.request.post(`/api/teams/${teamId}/rounds/${round.id}/reveal`)).ok()).toBe(true);
      await expect(owner.locator('h2.floating-chip')).toHaveText('Another appearance issue');
      await showHistory(owner);
      const oldTitle = owner.locator('.history-card-title').filter({hasText: 'Appearance history revised'});
      await oldTitle.getByRole('button').click();
      await oldTitle.getByRole('textbox').fill('Appearance search target');
      await oldTitle.getByRole('textbox').press('Enter');
      const historyCard = owner.locator('.history-card').filter({has: owner.locator('.history-card-title', {hasText: 'Appearance search target'})});
      await expect(historyCard).toBeVisible();
      await historyCard.getByRole('button', {name: /^Comments \(/}).click();
      await historyCard.getByLabel('Add comment for Appearance search target', {exact: true}).fill('A shared appearance note');
      await historyCard.getByRole('button', {name: 'Add comment', exact: true}).click();
      await expect(historyCard.locator('.history-comment-body')).toHaveText('A shared appearance note');
      await historyCard.getByRole('button', {name: 'Edit', exact: true}).click();
      await historyCard.getByRole('textbox', {name: /^Edit comment from /}).fill('An edited appearance note');
      await audit(owner, info, 'history-comment-editor', '.history-comment-meta strong:visible, .history-comment-form-footer .field-hint:visible, .history-comment-actions button:visible');
      await historyCard.getByRole('button', {name: 'Save', exact: true}).click();
      await expect(historyCard.locator('.history-comment-body')).toHaveText('An edited appearance note');

      await owner.locator('.history-group-heading:visible').first().focus();
      const timePopup = owner.getByRole('tooltip');
      await expect(timePopup).toBeVisible();
      await expect(timePopup.getByText('India - Pune', {exact: true})).toBeVisible();
      await audit(owner, info, 'history-time-popup', '.history-tooltip-label:visible, .history-tooltip-value:visible');
      await owner.keyboard.press('Tab');
      await owner.getByRole('tab', {name: 'Search', exact: true}).click();
      await owner.getByLabel('Title or words', {exact: true}).fill('Appearance search');
      await owner.getByLabel('Word in comments', {exact: true}).fill('edited');
      await owner.getByRole('button', {name: 'Search history', exact: true}).click();
      await expect(owner.locator('.history-card-title:visible')).toHaveText('Appearance search target');
      await audit(owner, info, 'history-search-result', '.history-card-title:visible, .history-card-meta:visible, .history-comment-body:visible');
      await owner.getByLabel('Title or words', {exact: true}).fill('No appearance record can match this');
      await owner.getByRole('button', {name: 'Search history', exact: true}).click();
      await expect(owner.getByText('No history entries match this search.', {exact: true})).toBeVisible();

      await openControls(member);
      await member.getByRole('button', {name: 'Open notifications', exact: true}).click();
      await expect(member.getByRole('dialog', {name: 'Notifications', exact: true})).toBeVisible();
      await audit(member, info, 'member-notifications', 'h3:visible, .notification-card-main strong:visible, .notification-card-main span:visible');
      await member.keyboard.press('Escape'); await closeControls(member);

      await openControls(owner);
      await owner.getByRole('button', {name: 'Edit profile', exact: true}).click();
      const account = owner.getByRole('dialog', {name: 'Account settings', exact: true});
      const avatarName = await account.locator('.avatar-option:not(.selected)').first().locator('img').getAttribute('alt');
      const profileSaved = owner.waitForResponse(response => response.url().endsWith('/api/auth/profile') && response.request().method() === 'PATCH');
      await account.getByRole('button', {name: avatarName!, exact: true}).click();
      expect((await profileSaved).ok()).toBe(true);
      await expect(account.getByRole('button', {name: avatarName!, exact: true})).toHaveClass(/selected/);
      await expectTheme(owner, themeId);

      if (trial) {
        const statsResponse = owner.waitForResponse(response => /\/api\/workspaces\/[^/]+\/statistics\?/.test(response.url()));
        await account.getByRole('button', {name: /^Workspace stats:/}).click();
        const response = await statsResponse;
        expect(response.ok()).toBe(true);
        const workspaceId = new URL(response.url()).pathname.split('/')[3];
        const stats = await response.json();
        expect(stats.teams.length).toBeGreaterThan(0);
        expect(stats.teams.every((team: {workspaceId: string}) => team.workspaceId === workspaceId)).toBe(true);
        await expect(account.getByTestId('stats-Completed rounds')).toHaveText('2');
        await expect(account.getByLabel('Workspace', {exact: true})).toHaveCount(0);
        await audit(owner, info, 'owner-workspace-statistics', '.statistics-cards dt:visible, .statistics-cards dd:visible');
        await account.getByRole('button', {name: /^Workspace stats:/}).click();
      }

      await account.getByRole('button', {name: 'Review account deletion', exact: true}).click();
      const deletion = owner.getByRole('dialog', {name: 'Confirm account deletion', exact: true});
      await expect(deletion).toBeVisible();
      await expect(deletion.getByRole('button', {name: trial ? 'Permanently delete account and workspace' : 'Delete account', exact: true})).toBeDisabled();
      await audit(owner, info, 'account-deletion-preview', 'h3:visible, .account-deletion-note:visible, .account-deletion-summary dt:visible');
      await deletion.getByRole('button', {name: 'Cancel', exact: true}).click();
      await closeDialog(owner); await closeControls(owner);

      expect((await owner.request.post(`/api/teams/${teamId}/archive`, {data: {archived: true}})).ok()).toBe(true);
      await member.reload(); await expectTheme(member, themeId);
      await expect(member.getByText('This team is archived. The board is read-only until a team admin or the super-admin unarchives it.', {exact: true})).toBeVisible();
      await expect(member.locator('.center-panel').getByRole('button', {name: 'Vote AGAIN', exact: true})).toBeDisabled();
      await showHistory(member);
      const readOnlyCard = member.locator('.history-card').filter({has: member.locator('.history-card-title', {hasText: 'Appearance search target'})});
      await readOnlyCard.getByRole('button', {name: /^Comments \(/}).click();
      await expect(readOnlyCard.getByText('Comments are read-only in this view.', {exact: true})).toBeVisible();
      await expect(readOnlyCard.getByRole('button', {name: 'Edit', exact: true})).toHaveCount(0);
      await audit(member, info, 'archived-read-only-board', '.board-read-only-banner:visible, .history-comment-body:visible, .history-comments-body .field-hint:visible');
      ownerErrors.check(); memberErrors.check();
    } finally {
      await ownerContext.close(); await memberContext.close(); await operator.close();
    }
  });
}
