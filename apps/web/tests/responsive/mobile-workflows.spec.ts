// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later
import {test,expect} from '@playwright/test';
import WebSocket from '../../../api/node_modules/ws/index.js';
import {user,team,openControls,showHistory,audit,closeDialog,diagnostics} from './helpers';
import {phonePortraits as phones} from './mobileMatrix';
for(const count of [20,40]) test(`${count} live participants: every phone rotates, types, deals, votes and reaches all controls`,async({browser,baseURL},info)=>{
 test.setTimeout(240000);
 const owner=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const page=await owner.newPage(); const clean=diagnostics(page);
 if(count===40) await (await owner.newCDPSession(page)).send('Emulation.setCPUThrottlingRate',{rate:4});
 await user(page); const id=await team(page);
 const navigation=await page.evaluate(()=>{const entry=performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;return {domContentLoadedMs:entry.domContentLoadedEventEnd,loadMs:entry.loadEventEnd};});
 await info.attach('board-navigation-ms',{body:JSON.stringify(navigation),contentType:'application/json'});
 expect(navigation.loadMs).toBeLessThan(10000);
 await page.evaluate(()=>{
   (window as any).mobileLongTasks=[];
   new PerformanceObserver(list=>{(window as any).mobileLongTasks.push(...list.getEntries().map(e=>e.duration));}).observe({type:'longtask',buffered:false});
 });
 const clients=[]; const sockets:WebSocket[]=[]; const timings:number[]=[];
 try {
  for(let i=1;i<count;i++) {
   const client=await browser.newContext(); clients.push(client);
   const email=`dense-${count}-${Date.now()}-${i}@example-company.com`;
   const code=await (await client.request.post(`${baseURL}/api/auth/request-code`,{data:{email}})).json();
   expect((await client.request.post(`${baseURL}/api/auth/verify-code`,{data:{email,code:code.debugCode,displayName:`Mobile participant ${i}`,avatarIconKey:'bear',avatarColorKey:'azure',password:'Password123!'}})).ok()).toBe(true);
   expect((await page.request.post(`/api/teams/${id}/members`,{data:{email}})).ok()).toBe(true);
   const cookies=(await client.cookies(baseURL)).map(c=>`${c.name}=${c.value}`).join('; ');
   const socket=new WebSocket(`${baseURL!.replace('http','ws')}/ws?teamId=${id}`,{headers:{Cookie:cookies}}); sockets.push(socket);
   await new Promise<void>((resolve,reject)=>{socket.once('open',()=>resolve());socket.once('error',reject);});
  }
  await expect(page.locator('.participant-ring > .member-tile')).toHaveCount(count);
  for(const [width,height] of phones) {
   for(const [w,h] of [[width,height],[height,width]]) {
    await page.setViewportSize({width:w,height:h});
    await expect(page.locator('.screen-header')).toHaveJSProperty('offsetHeight',56);
    const lastMember=page.locator('.participant-ring > .member-tile').last();
    await lastMember.scrollIntoViewIfNeeded();
    // Allow subpixel clipping at the rounded scrolling container edge.
    await expect(lastMember).toBeInViewport({ratio:0.99});
    const next=page.getByLabel('Next issue title',{exact:true});
    const title=`Mobile ${count} ${w}x${h}`;
    const input=await next.count()?next:page.getByLabel('Issue title',{exact:true});
    await input.scrollIntoViewIfNeeded(); await input.tap(); await input.fill('bad');
    await expect(page.getByRole('button',{name:await next.count()?'Deal':'Start voting',exact:true})).toBeDisabled();
    await input.fill(''); await input.pressSequentially(title,{delay:2});
    // Leave and return to the same orientation while a draft is pending.
    await page.setViewportSize({width:h,height:w});
    await expect(page.locator('.board-shell')).toHaveClass(h>w?/is-mobile-landscape/:/^(?!.*is-mobile-landscape).*$/);
    await page.setViewportSize({width:w,height:h});
    await expect(page.locator('.board-shell')).toHaveClass(w>h?/is-mobile-landscape/:/^(?!.*is-mobile-landscape).*$/);
    await expect(input).toHaveValue(title);
    const start=Date.now();
    await page.getByRole('button',{name:await next.count()?'Deal':'Start voting',exact:true}).tap();
    await expect(page.getByRole('heading',{name:new RegExp(title)})).toBeInViewport({ratio:1});
    await page.getByRole('button',{name:'5',exact:true}).tap();
    await expect(page.locator('.participant-ring > .member-tile .vote-card').filter({hasText:/^5$/})).toHaveCount(1);
    const state=await (await page.request.get(`/api/teams/${id}/state`)).json();
    // Concurrent real voters/WS observers; retry only transport resets on idle keep-alive sockets.
    // Repeating the same vote is idempotent; HTTP failures still fail the test.
    await Promise.all(clients.map(c=>c.request.post(`${baseURL}/api/teams/${id}/rounds/${state.activeRound.id}/vote`,{data:{value:'5'},maxRetries:1}).then(r=>expect(r.ok()).toBe(true))));
    await expect(page.locator('.participant-ring > .member-tile .vote-card').filter({hasText:'Voted'})).toHaveCount(count-1);
    await page.getByRole('button',{name:'Reveal score',exact:true}).tap();
    await expect(page.getByText('Average score: 5',{exact:true})).toBeVisible(); timings.push(Date.now()-start);
    await showHistory(page);
    const rail=page.locator(w>h?'.history-rail.desktop':'.history-rail.stacked');
    await expect(rail).toBeVisible();
    const grip=page.locator('.history-stack-resize-handle:visible,.history-resize-handle:visible');
    const panel=w>h?await rail.boundingBox():await page.locator('.stacked-history-panel').boundingBox();
    expect(w>h?panel!.width+44:panel!.height).toBeLessThanOrEqual((w>h?w:h)/2+1);
    await grip.tap(); await expect(rail).toBeHidden();
    await openControls(page);
    await page.getByRole('button',{name:'Team admin',exact:true}).tap();
    for(const tab of ['People','Stats','Import/export']) {
     await page.getByRole('tab',{name:tab,exact:true}).tap();
     if(tab==='Stats') await expect(page.getByTestId('stats-Completed rounds')).toBeVisible();
    }
    await closeDialog(page);
    await page.locator('.screen-header-bar').getByRole('button',{name:'Close board controls',exact:true}).tap();
    await audit(page,info,`${count}-${w}x${h}`);
   }
  }
  await info.attach('round-action-latency-ms',{body:JSON.stringify({participants:count,rounds:timings.length,maximum:Math.max(...timings),samples:timings}),contentType:'application/json'});
  const longTasks=await page.evaluate(()=>(window as any).mobileLongTasks as number[]);
  await info.attach('main-thread-long-tasks-ms',{body:JSON.stringify({cpuSlowdown:count===40?4:1,samples:longTasks}),contentType:'application/json'});
  expect(Math.max(0,...longTasks)).toBeLessThan(1000);
  expect(Math.max(...timings)).toBeLessThan(10000); clean();
 } finally { sockets.forEach(s=>s.close()); await Promise.all(clients.map(c=>c.close())); await owner.close(); }
});
