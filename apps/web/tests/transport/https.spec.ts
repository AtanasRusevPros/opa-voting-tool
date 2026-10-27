// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test, chromium } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
let server: ChildProcess;
let fixture: { origin: string; backendPort: number; spki: string };
test.beforeAll(async () => {
  server = spawn(process.execPath, ['../api/node_modules/tsx/dist/cli.mjs', 'tests/transport/server.mts'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  fixture = await new Promise((resolve, reject) => {
    server.stderr!.on('data', data => { output += data.toString(); });
    server.stdout!.on('data', data => {
      output += data.toString();
      const line = output.split('\n').find(line => line.startsWith('TRANSPORT_FIXTURE '));
      if (line) resolve(JSON.parse(line.slice('TRANSPORT_FIXTURE '.length)));
    });
    server.on('error', reject);
    server.on('exit', code => reject(new Error(`TLS fixture exited ${code}: ${output}`)));
  });
});
test.afterAll(async () => {
  if (server && server.exitCode === null) { const exit = once(server, 'exit'); server.kill('SIGTERM'); await exit; }
});

test('real HTTPS login, secure cookie, session reload and WSS work through a TLS proxy', async () => {
  // Trust only this ephemeral certificate key, not all invalid HTTPS certificates.
  const browser = await chromium.launch({ args: [`--ignore-certificate-errors-spki-list=${fixture.spki}`] });
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const errors: string[] = [];
    const wsUrls: string[] = [];
    let frames = 0;
    page.on('pageerror', error => errors.push(error.message));
    page.on('websocket', socket => {
      wsUrls.push(socket.url());
      socket.on("framereceived", () => frames++);
      socket.on('socketerror', error => errors.push(String(error)));
    });
    await page.goto(fixture.origin + '/admin');
    await page.getByLabel('Admin username', { exact: true }).fill('https-test-admin');
    await page.getByLabel('Admin password', { exact: true }).fill('LocalOnlyTest123!');
    await page.getByRole('button', { name: 'Admin sign in', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Choose your team' })).toBeVisible();
    const cookie = (await context.cookies()).find(cookie => cookie.name === 'session_token');
    expect(cookie).toMatchObject({ secure: true, httpOnly: true, sameSite: 'Lax' });
    // Chooser sockets send changes, not an initial snapshot. Open an authenticated
    // WSS observer, then create a team to prove a real round trip and broadcast.
    const liveMessage = await page.evaluate(async () => {
      const socket = new WebSocket(location.origin.replace('https:', 'wss:') + '/ws?scope=chooser');
      await new Promise<void>((resolve, reject) => {
        socket.onopen = () => resolve(); socket.onerror = () => reject(new Error('WSS failed'));
      });
      const message = new Promise<string>(resolve => { socket.onmessage = event => resolve(event.data); });
      const response = await fetch('/api/teams', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'HTTPS live test' }) });
      if (!response.ok) { socket.close(); throw new Error('Team creation failed'); }
      const result = await message; socket.close(); return JSON.parse(result);
    });
    expect(liveMessage.type).toBe('chooser:update');
    await expect.poll(() => frames).toBeGreaterThan(0);
    expect(wsUrls.every(url => url.startsWith('wss://'))).toBe(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Choose your team' })).toBeVisible();
    const sessionStatus = await page.evaluate(async () => (await fetch('/api/auth/session')).status);
    expect(sessionStatus).toBe(200);
    expect(errors).toEqual([]);
  } finally { await context.close(); await browser.close(); }
});

test('direct HTTP is denied except the local health probe', async ({ request }) => {
  const backend = `http://127.0.0.1:${fixture.backendPort}`;
  expect((await request.get(backend + '/health')).status()).toBe(200);
  expect((await request.get(backend + '/admin')).status()).toBe(426);
  const denied = await request.post(backend + '/api/auth/signin-admin', { data: { username: 'https-test-admin', password: 'LocalOnlyTest123!' } });
  expect(denied.status()).toBe(426);
  expect(denied.headers()['set-cookie']).toBeUndefined();
});
