// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later
import {test,expect} from '@playwright/test';
import {createRequire} from 'node:module';
import type WebSocketClient from '../../../api/node_modules/@types/ws/index.js';
import type {} from '../../src/app/perf';
import {admin,setDefault,register,createTeam,expectTheme,baseUrl,diagnostics} from './helpers';

const WebSocket: typeof import('../../../api/node_modules/@types/ws/index.js') = createRequire(import.meta.url)('../../../api/node_modules/ws/index.js');

test('40 live participants keep layout and voting efficient across light, dim and dark themes',async({browser},info)=>{
  test.skip(browser.browserType().name() !== 'chromium', 'Deterministic CPU throttling requires Chromium CDP.');
  test.setTimeout(180000);
  const operator=await admin(browser,false);
  const owner=await browser.newContext({baseURL:baseUrl(false),viewport:{width:412,height:915},hasTouch:true});
  const page=await owner.newPage();const errors=diagnostics(page);
  const clients=[];const sockets:WebSocketClient[]=[];
  try{
    await setDefault(operator,'opa-light');await register(page,false);const team=await createTeam(page);
    for(let i=1;i<40;i++){
      const client=await browser.newContext({baseURL:baseUrl(false)});clients.push(client);
      const email=`theme-load-${Date.now()}-${i}@example-company.com`;
      const code=await(await client.request.post('/api/auth/request-code',{data:{email}})).json();
      expect((await client.request.post('/api/auth/verify-code',{data:{email,code:code.debugCode,displayName:`Theme participant ${i}`,password:'Password123!',avatarIconKey:'bear',avatarColorKey:'azure'}})).ok()).toBe(true);
      expect((await page.request.post(`/api/teams/${team}/members`,{data:{email}})).ok()).toBe(true);
      const cookie=(await client.cookies()).map(c=>`${c.name}=${c.value}`).join('; ');
      const socket=new WebSocket(`${baseUrl(false).replace('http','ws')}/ws?teamId=${team}`,{headers:{Cookie:cookie}});sockets.push(socket);
      await new Promise<void>((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
    }
    await expect(page.locator('.participant-ring > .member-tile')).toHaveCount(40);
    const session=await owner.newCDPSession(page);await session.send('Emulation.setCPUThrottlingRate',{rate:4});
    const samples=[];
    for(const id of ['opa-light','nord','opa-midnight-ember'] as const){
      // Membership joins and the previous reveal may still have a queued layout pass.
      await expect.poll(()=>page.evaluate(()=>performance.now()-(window.__PLANNING_POKER_PERF__?.getLastUpdatedAt()??0))).toBeGreaterThan(200);
      await page.evaluate(()=>window.__PLANNING_POKER_PERF__?.reset());
      const start=Date.now();await setDefault(operator,id);await expectTheme(page,id);
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const counters=await page.evaluate(()=>window.__PLANNING_POKER_PERF__?.snapshot());
      expect(counters?.boardLayoutCalcs).toBe(0);
      expect(counters?.memberTileRenders).toBe(0);
      const switchMs=Date.now()-start;expect(switchMs).toBeLessThan(3000);
      const input=page.getByLabel('Next issue title',{exact:true});const later=await input.count()>0;
      await(later?input:page.getByLabel('Issue title',{exact:true})).fill(`Forty people using ${id}`);
      await page.getByRole('button',{name:later?'Deal':'Start voting',exact:true}).click();
      const voteStart=Date.now();await page.getByRole('button',{name:'5',exact:true}).click();
      const state=await(await page.request.get(`/api/teams/${team}/state`)).json();
      await Promise.all(clients.map(c=>c.request.post(`/api/teams/${team}/rounds/${state.activeRound.id}/vote`,{data:{value:'5'},maxRetries:1}).then(r=>expect(r.ok()).toBe(true))));
      await expect(page.locator('.participant-ring > .member-tile .vote-card').filter({hasText:'Voted'})).toHaveCount(39);
      await page.getByRole('button',{name:'Reveal score',exact:true}).click();
      await expect(page.getByText('Average score: 5',{exact:true})).toBeVisible();
      const votingMs=Date.now()-voteStart;expect(votingMs).toBeLessThan(10000);
      samples.push({id,participants:40,cpuSlowdown:4,switchMs,votingMs,counters});
    }
    await info.attach('theme-performance',{body:JSON.stringify(samples,null,2),contentType:'application/json'});
    errors.check();
  }finally{sockets.forEach(s=>s.close());await Promise.all(clients.map(c=>c.close()));await owner.close();await operator.close();}
});
