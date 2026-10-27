// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later
// Disposable real-TLS reverse proxy; never installs certificates or touches user data.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { once } from 'node:events';
import { execFileSync } from 'node:child_process';
import { createHash, X509Certificate } from 'node:crypto';
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'opa-https-'));
const key = path.join(directory, 'key.pem');
const cert = path.join(directory, 'cert.pem');
let backend: http.Server | undefined;
let backendPort = 0;
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore' });
const certificate = fs.readFileSync(cert);
const spki = createHash('sha256').update(new X509Certificate(certificate).publicKey.export({ type: 'spki', format: 'der' })).digest('base64');
const proxy = https.createServer({ key: fs.readFileSync(key), cert: certificate }, (req, res) => {
  const upstream = http.request({ hostname: '127.0.0.1', port: backendPort, path: req.url, method: req.method,
    headers: { ...req.headers, 'x-forwarded-proto': 'https' } }, response => {
    res.writeHead(response.statusCode!, response.headers); response.pipe(res);
  });
  upstream.on('error', () => { res.writeHead(502); res.end(); });
  req.pipe(upstream);
});
proxy.on('upgrade', (req, socket, head) => {
  const upstream = net.connect(backendPort, '127.0.0.1', () => {
    const headers = { ...req.headers, 'x-forwarded-proto': 'https' };
    upstream.write(`${req.method} ${req.url} HTTP/1.1\r\n${Object.entries(headers).map(([name, value]) => `${name}: ${value}`).join('\r\n')}\r\n\r\n`);
    if (head.length) upstream.write(head);
    upstream.pipe(socket); socket.pipe(upstream);
  });
  upstream.on('error', () => socket.destroy()); socket.on('error', () => upstream.destroy());
  socket.on('close', () => upstream.destroy());
});
function cleanup() {
  proxy.close(); backend?.close(); fs.rmSync(directory, { recursive: true, force: true }); process.exit(0);
}
process.on('SIGTERM', cleanup); process.on('SIGINT', cleanup);
process.on('exit', () => fs.rmSync(directory, { recursive: true, force: true }));
proxy.listen(0, '127.0.0.1'); await once(proxy, 'listening');
const origin = `https://localhost:${(proxy.address() as net.AddressInfo).port}`;
fs.writeFileSync(path.join(directory, 'domains.txt'), 'example-company.com\n');
Object.assign(process.env, {
  NODE_ENV: 'test', DATA_DIR: directory, DATABASE_PATH: path.join(directory, 'test.db'),
  DEPLOYMENT_CONFIG_PATH: path.join(directory, 'deployment.toml'), MANAGED_BRANDING_DIR: path.join(directory, 'branding'),
  ALLOWED_DOMAINS_PATH: path.join(directory, 'domains.txt'), APP_BASE_URL: origin,
  SUPER_ADMIN_USERNAME: 'https-test-admin', SUPER_ADMIN_PASSWORD: 'LocalOnlyTest123!',
  DEBUG_TOOLS_ENABLED: '0', E2E_DEBUG_CODES: '0', SIMULATOR_MODE_ENABLED: '0'
});
fs.writeFileSync(process.env.DEPLOYMENT_CONFIG_PATH!, `[app]\nbase_url = "${origin}"\ntrusted_proxy_ips = ""\ntrust_local_container_proxy = true\n`);
({ server: backend } = await import('../../../api/src/server.ts'));
backend.listen(0, '127.0.0.1'); await once(backend, 'listening');
backendPort = (backend.address() as net.AddressInfo).port;
// Exercise the operator script without touching real settings or systemd.
const deployScript = path.join(directory, 'deploy.sh');
fs.copyFileSync('../../deploy.sh', deployScript);
fs.mkdirSync(path.join(directory, 'config'));
fs.writeFileSync(path.join(directory, 'config/deploy.toml'), `[startup]\nbackend = "disabled"\n[watchdog]\nenabled = false\n[incidents]\ndir = "${directory}/incidents"\n`);
console.log('TRANSPORT_FIXTURE ' + JSON.stringify({ origin, backendPort, spki, cert, deployScript }));
