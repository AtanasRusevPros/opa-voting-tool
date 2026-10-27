// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import { isIP } from "node:net";
import type { IncomingMessage } from "node:http";
import type { RequestHandler } from "express";

type TransportConfig = { appBaseUrl: string; trustedProxyIps?: string[] };
const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
const normalizedIp = (ip: string) => ip.startsWith("::ffff:") ? ip.slice(7) : ip;

export function validateBaseUrl(value: string): void {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Base URL must be an absolute HTTPS URL (HTTP is allowed only for localhost, 127.0.0.1 or [::1])."); }
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && loopbackHosts.has(url.hostname)))) {
    throw new Error("Base URL must be an HTTPS origin; HTTP is allowed only for localhost, 127.0.0.1 or [::1]. Configure a TLS reverse proxy for LAN/public deployments.");
  }
}

export function parseTrustedProxyIps(value: string): string[] {
  const ips = value.split(",").map(ip => ip.trim()).filter(Boolean);
  if (ips.some(ip => !isIP(ip))) throw new Error("app.trusted_proxy_ips must contain comma-separated literal proxy IP addresses (no wildcards or networks).");
  return ips.map(normalizedIp);
}

function localHost(request: IncomingMessage): boolean {
  // Parse only an authority, never trust forwarded host names for the HTTP exception.
  const host = request.headers.host;
  if (!host || /[\s/@\\?#]/.test(host)) return false;
  try { return loopbackHosts.has(new URL(`http://${host}`).hostname); } catch { return false; }
}

export function isHttpsRequest(request: IncomingMessage, config: TransportConfig): boolean {
  if ((request.socket as typeof request.socket & { encrypted?: boolean }).encrypted) return true;
  const peer = normalizedIp(request.socket.remoteAddress ?? "");
  return (config.trustedProxyIps ?? ["127.0.0.1", "::1"]).includes(peer) &&
    request.headers["x-forwarded-proto"] === "https";
}

// Bounded diagnostics: never log request paths, tokens, cookies or headers.
const warnedProxyPeers = new Set<string>();
export function warnUntrustedHttpsProxy(request: IncomingMessage, config: TransportConfig): void {
  const peer = normalizedIp(request.socket.remoteAddress ?? "unknown");
  if (request.headers["x-forwarded-proto"] !== "https" || isHttpsRequest(request, config) || warnedProxyPeers.has(peer) || warnedProxyPeers.size >= 8) return;
  warnedProxyPeers.add(peer);
  console.warn(`[transport] Rejected HTTPS forwarding from untrusted peer ${peer}. Verify this is your TLS proxy before adding it to app.trusted_proxy_ips; keep the backend port private.`);
}

export function transportAllowed(request: IncomingMessage, config: TransportConfig): boolean {
  if (isHttpsRequest(request, config)) return true;
  const noProxyHeaders = !["forwarded", "x-forwarded-proto", "x-forwarded-for", "x-forwarded-host"].some(key => request.headers[key] !== undefined);
  // Packaged localhost traffic crosses container NAT. The host port MUST remain
  // bound to loopback (compose default); Host alone cannot secure an exposed port.
  if (noProxyHeaders && localHost(request)) {
    if (request.method === "GET" && request.url === "/health") return true;
    const origin = new URL(config.appBaseUrl);
    return origin.protocol === "http:" && loopbackHosts.has(origin.hostname);
  }
  return false;
}

export function enforceHttps(config: TransportConfig): RequestHandler {
  return (req, res, next) => {
    if (transportAllowed(req, config)) {
      if (isHttpsRequest(req, config) && !loopbackHosts.has(new URL(config.appBaseUrl).hostname)) res.setHeader("Strict-Transport-Security", "max-age=31536000");
      next();
      return;
    }
    warnUntrustedHttpsProxy(req, config);
    res.setHeader("Cache-Control", "no-store");
    // Reject rather than replay passwords/tokens to another origin via redirects.
    res.status(426).json({ error: "HTTPS is required. Use the configured HTTPS URL and a trusted TLS reverse proxy." });
  };
}
