// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later
import {test,expect} from '@playwright/test';
import {audit,user,team} from './helpers';
test('ten participants remain separate and voting is usable on a phone',async({browser},info)=>{
  const contexts=await Promise.all(Array.from({length:10},()=>browser.newContext({viewport:{width:390,height:844}})));
  try {
    const pages=await Promise.all(contexts.map(c=>c.newPage()));
    const emails=[]; for(const page of pages) emails.push(await user(page));
    const id=await team(pages[0]);
    for(let i=1;i<pages.length;i++) {
      expect((await pages[0].request.post(`/api/teams/${id}/members`,{data:{email:emails[i]}})).ok()).toBe(true);
      await pages[i].goto(`/?teamId=${id}`);
    }
    const page=pages[0]; await expect(page.locator('.participant-ring > .member-tile')).toHaveCount(10);
    await page.getByLabel('Issue title').fill('Phone voting with ten participants');
    await page.getByRole('button',{name:'Start voting',exact:true}).click();
    await page.getByRole('button',{name:'5',exact:true}).click();
    const tiles=page.locator('.participant-ring > .member-tile');
    await expect(tiles.locator('.vote-card').filter({hasText:/^5$/})).toHaveCount(1);
    await expect(tiles.locator('.vote-card').filter({hasText:'No vote'})).toHaveCount(9);
    const rectangles=await tiles.evaluateAll(elements=>elements.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};}));
    for(let i=0;i<rectangles.length;i++) for(let j=i+1;j<rectangles.length;j++) {
      const a=rectangles[i],b=rectangles[j]; expect(a.x+a.w<=b.x+1 || b.x+b.w<=a.x+1 || a.y+a.h<=b.y+1 || b.y+b.h<=a.y+1).toBe(true);
    }
    await audit(page,info,'ten-participants');
    await page.getByRole('button',{name:'Reveal score',exact:true}).click(); await expect(page.getByText('Average score: 5',{exact:true})).toBeVisible();
  } finally {await Promise.all(contexts.map(c=>c.close()));}
});
