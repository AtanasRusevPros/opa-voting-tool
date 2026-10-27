<!--
SPDX-FileCopyrightText: 2026 Atanas G. Rusev
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# HTTPS For Self-Hosted Deployments

[Documentation index](../README.md) · [Operator guide](USAGE.md) · [VPS runbook](FIRST_VPS_DEPLOYMENT_RUNBOOK.md)

OpaVoting requires HTTPS for company LAN and public deployments, including the hosted trial. Plain HTTP remains available for localhost testing. TLS terminates at the reverse proxy; the proxy-to-app connection can use HTTP on the protected local backend.

## Configure Before Upgrading Or Starting

1. Provide a working TLS proxy and a certificate trusted by every intended browser. Caddy can manage public certificates; a company CA or Caddy internal CA requires client trust installation.
2. Keep the packaged port mapping `127.0.0.1:3001:3001`. Never expose port 3001 to the LAN/internet. For a remote proxy, restrict backend access to that proxy through firewall/network controls.
3. In ignored `config/deployment.local.toml`, configure:

   ```toml
   [app]
   base_url = "https://vote.example.com"
   trusted_proxy_ips = "127.0.0.1,::1"
   ```

   Replace the hostname. The proxy list contains comma-separated **literal immediate proxy IP addresses**, not hostnames, CIDRs, wildcard ranges or client addresses. It defaults to loopback. An empty string trusts no forwarding proxy. Changes to this list require an app restart/rebuild; normal Platform edits preserve it.

4. Configure Caddy to terminate TLS and overwrite the upstream protocol header:

   ```caddyfile
   vote.example.com {
       reverse_proxy 127.0.0.1:3001 {
           header_up X-Forwarded-Proto {scheme}
       }
   }
   ```

   For a private company hostname, add `tls internal` inside the site block, or use company-managed certificates. Install the CA's public root certificate on clients; never distribute its private key. Caddy redirects external HTTP to HTTPS. Other proxies must overwrite, not append or pass through, `X-Forwarded-Proto` with the actual client-facing protocol. Never hard-code `https` on a proxy that also forwards plaintext HTTP.

5. With Podman NAT, the app may see the proxy connection as a gateway address instead of loopback. Determine the actual peer using your container/network configuration. If HTTPS requests receive 426, inspect `./deploy.sh logs`: a bounded `[transport]` warning reports the untrusted peer IP without URLs, credentials or tokens. **Verify that IP belongs to your proxy/NAT path before adding it** to `trusted_proxy_ips`, then run `./deploy.sh rebuild`. Do not trust arbitrary rejected clients or an entire private subnet.
6. Run `./deploy.sh health` and `./deploy.sh public-health`, then sign in and vote with two browser sessions through the HTTPS origin. Reconnect/reload and confirm live updates work. Check both the regular and `/admin` sign-in paths.

Existing non-local `http://` base URLs now fail startup with an explanation. Fix the proxy and base URL before updating; changing the URL alone does not create a certificate or network listener. Existing HTTPS deployments may need the explicit NAT/proxy IP configured before their browser/API access works. The local health probe remains available for diagnosis.

## What The App Enforces

- Startup and Platform configuration reject non-local HTTP origins, credentials in URLs, query strings and base paths. Use an HTTPS origin such as `https://vote.example.com`.
- The API accepts HTTPS forwarded by an explicitly trusted immediate peer. Client-supplied forwarding headers from other peers do not prove HTTPS. Comma-separated protocol chains are rejected.
- Insecure requests are rejected with HTTP 426 before login, body parsing or application changes. The API does not redirect password/token-bearing requests; the proxy handles browser redirects.
- WebSocket handshakes follow the same policy, before session processing. Browsers connect through `wss://` on the HTTPS origin.
- HTTPS-configured sessions use `Secure`, `HttpOnly`, `SameSite=Lax` cookies. Non-local HTTPS responses include HSTS for one year, without subdomain/preload directives.
- A direct, unforwarded `GET /health` with a loopback Host remains available to local operators and container probes. Other paths are not exempt in HTTPS mode.

This is defense in depth, not encryption inside the Node HTTP server. A proxy that falsely reports HTTPS or an exposed backend defeats the intended network boundary. Do not expose the backend port or add untrusted proxy addresses.

## Localhost Testing

Leave `base_url = "http://localhost:3001"` and the shipped loopback-only port binding. `127.0.0.1` and `[::1]` HTTP origins also work. Local HTTP requires an unforwarded request with a loopback Host; the container NAT peer can differ, so the host port binding is essential. This mode is for one-machine testing, not LAN hosting with a forged localhost Host.

Optional `https://localhost` uses the same proxy setup and a locally trusted CA, with an HTTPS base URL. HSTS is omitted for loopback origins to avoid forcing unrelated localhost services onto HTTPS. After switching to HTTPS, use the HTTPS URL for sign-in; existing HTTP sessions may need a fresh login.

## Local Regression Checks

Run `./dev.sh test:full` for the core tests. The API integration suite includes unsafe origin/proxy validation, HTTP login rejection, cookie flags, local health and actual WebSocket handshake checks.

For an actual TLS browser regression, build first, then run:

```bash
./dev.sh build
pnpm --filter @planning-poker/web exec playwright test --config=playwright.transport.config.ts
```

This dedicated Chromium suite requires OpenSSL and installed Playwright Chromium. It creates a disposable database and real local TLS reverse proxy on ephemeral ports, verifies login/session reload, Secure cookies and WSS, and rejects direct HTTP. It pins trust to its ephemeral certificate key for the test browser only; it does not install a system CA, disable certificate validation globally, or change real deployment settings. Real company DNS/CA distribution, Caddy and Podman NAT configuration still require operator verification.
