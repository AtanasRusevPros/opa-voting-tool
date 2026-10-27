// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from "vitest";
import type { IncomingMessage } from "node:http";
import express from "express";
import request from "supertest";
import { enforceHttps, isHttpsRequest, parseTrustedProxyIps, transportAllowed, validateBaseUrl } from "../src/transportSecurity.js";

function incoming(host: string, peer = "127.0.0.1", proto?: string): IncomingMessage {
  return { headers: { host, ...(proto === undefined ? {} : { "x-forwarded-proto": proto }) }, socket: { remoteAddress: peer }, method: "GET", url: "/api/auth/session" } as IncomingMessage;
}
const deployed = { appBaseUrl: "https://vote.example.com", trustedProxyIps: ["127.0.0.1", "::1", "10.89.0.1"] };
const local = { appBaseUrl: "http://localhost:3001" };

describe("HTTPS transport policy", () => {
  it.each(["http://localhost:3001", "http://127.0.0.1:3001", "http://[::1]:3001", "https://vote.example.com", "https://voting.company.internal"]) ("accepts origin %s", value => expect(() => validateBaseUrl(value)).not.toThrow());
  it.each(["http://vote.example.com", "http://192.168.1.2", "http://localhost.attacker.test", "ftp://localhost", "https://user:pass@vote.example.com", "https://vote.example.com/path", "https://vote.example.com?x=1", "not a URL"]) ("rejects unsafe origin %s", value => expect(() => validateBaseUrl(value)).toThrow());
  it("requires explicit literal proxy addresses", () => {
    expect(parseTrustedProxyIps("127.0.0.1, ::1, ::ffff:10.89.0.1")).toEqual(["127.0.0.1", "::1", "10.89.0.1"]);
    for (const invalid of ["*", "10.0.0.0/8", "proxy.local", "127.0.0.1,::1,VERIFIED_PROXY_IP"]) expect(() => parseTrustedProxyIps(invalid)).toThrow();
  });
  it("accepts HTTPS only from the immediate trusted peer", () => {
    for (const peer of ["127.0.0.1", "::1", "::ffff:127.0.0.1", "10.89.0.1"]) expect(transportAllowed(incoming("vote.example.com", peer, "https"), deployed)).toBe(true);
    for (const proto of [undefined, "http", "https,http", "http,https", "HTTPS"]) expect(transportAllowed(incoming("vote.example.com", "127.0.0.1", proto), deployed)).toBe(false);
    expect(transportAllowed(incoming("vote.example.com", "192.0.2.10", "https"), deployed)).toBe(false);
  });
  it("opts into the exact current container address, surviving recreation without trusting neighboring peers", () => {
    const config = { ...deployed, trustedProxyIps: [], trustLocalContainerProxy: true };
    for (const ip of ["10.89.0.47", "10.89.0.48", "fd00::48"]) {
      const req = incoming("vote.example.com", ip, "https");
      Object.assign(req.socket, { localAddress: ip });
      expect(transportAllowed(req, config)).toBe(true);
      expect(transportAllowed(req, { ...config, trustLocalContainerProxy: false })).toBe(false);
      req.headers["x-forwarded-proto"] = "http";
      expect(transportAllowed(req, config)).toBe(false);
      req.headers["x-forwarded-proto"] = "https";
      Object.assign(req.socket, { remoteAddress: "10.89.0.49" });
      expect(transportAllowed(req, config)).toBe(false);
    }
    expect(transportAllowed(incoming("vote.example.com", "10.89.0.48", "https"), config)).toBe(false);
    const mapped = incoming("vote.example.com", "::ffff:10.89.0.48", "https");
    Object.assign(mapped.socket, { localAddress: "10.89.0.48" });
    expect(transportAllowed(mapped, config)).toBe(true);
  });
  it("does not allow a spoofed localhost Host to bypass deployed HTTPS", () => {
    expect(transportAllowed(incoming("localhost:3001"), deployed)).toBe(false);
    expect(transportAllowed(incoming("localhost:3001", "127.0.0.1", "http"), deployed)).toBe(false);
  });
  it("preserves container-NAT localhost testing but rejects forwarded HTTP and nonlocal hosts", () => {
    for (const host of ["localhost:3001", "127.0.0.1:3001", "[::1]:3001"]) expect(transportAllowed(incoming(host, "10.89.0.1"), local)).toBe(true);
    for (const host of ["voting.company.internal", "localhost.attacker.test", "localhost@evil.test", "localhost/path"]) expect(transportAllowed(incoming(host), local)).toBe(false);
    expect(transportAllowed(incoming("localhost", "127.0.0.1", "http"), local)).toBe(false);
    const forwarded = incoming("localhost"); forwarded.headers.forwarded = "proto=http";
    expect(transportAllowed(forwarded, local)).toBe(false);
  });
  it("limits the plaintext health exception to GET /health with a local host and no forwarding", () => {
    const req = incoming("127.0.0.1:3001"); req.url = "/health";
    expect(transportAllowed(req, deployed)).toBe(true);
    req.url = "/health/web"; expect(transportAllowed(req, deployed)).toBe(true);
    req.method = "POST"; expect(transportAllowed(req, deployed)).toBe(false);
    req.method = "GET"; req.url = "/health?token=x"; expect(transportAllowed(req, deployed)).toBe(false);
    req.url = "/health"; req.headers["x-forwarded-proto"] = "http"; expect(transportAllowed(req, deployed)).toBe(false);
  });
  it("recognizes a genuinely encrypted socket", () => {
    const req = incoming("vote.example.com", "192.0.2.10"); Object.assign(req.socket, { encrypted: true });
    expect(isHttpsRequest(req, deployed)).toBe(true);
  });
  it("rejects HTTP before body parsing or route side effects, without redirecting secrets", async () => {
    const app = express(); let writes = 0;
    app.use(enforceHttps(deployed)); app.use(express.json());
    app.post("/api/change", (_req, res) => { writes++; res.json({ ok: true }); });
    const denied = await request(app).post("/api/change").set("Host", "evil.test").set("Content-Type", "application/json").send("invalid-json");
    expect(denied.status).toBe(426); expect(denied.headers.location).toBeUndefined(); expect(writes).toBe(0);
    const allowed = await request(app).post("/api/change").set("X-Forwarded-Proto", "https").send({});
    expect(allowed.status).toBe(200); expect(writes).toBe(1);
    expect(allowed.headers["strict-transport-security"]).toContain("max-age=");
  });
});
