// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const tempDirs: string[] = [];

function createEnvDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "planning-poker-admin-"));
  tempDirs.push(dir);
  fs.writeFileSync(path.join(dir, "allowed-domains.txt"), "example-company.com\nexample-partner.com\n");
  return dir;
}

async function loadTestServer() {
  const dir = createEnvDir();
  process.env.NODE_ENV = "test";
  process.env.PORT = "0";
  process.env.HOST = "127.0.0.1";
  process.env.DATA_DIR = dir;
  process.env.DATABASE_PATH = path.join(dir, "test.db");
  process.env.ALLOWED_DOMAINS_PATH = path.join(dir, "allowed-domains.txt");
  process.env.DEPLOYMENT_CONFIG_PATH = path.join(dir, "deployment.toml");
  process.env.MANAGED_BRANDING_DIR = path.join(dir, "managed-branding");
  process.env.DEBUG_TOOLS_ENABLED = "1";
  process.env.APP_BASE_URL = "http://localhost:3001";
  process.env.SUPER_ADMIN_USERNAME = "platform-admin";
  process.env.SUPER_ADMIN_PASSWORD = "PlatformAdmin123!";
  process.env.SUPER_ADMIN_DISPLAY_NAME = "Platform Admin";
  vi.resetModules();
  return import("../src/server.js");
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  delete process.env.PORT;
  delete process.env.HOST;
  delete process.env.DATA_DIR;
  delete process.env.DATABASE_PATH;
  delete process.env.ALLOWED_DOMAINS_PATH;
  delete process.env.DEPLOYMENT_CONFIG_PATH;
  delete process.env.MANAGED_BRANDING_DIR;
  delete process.env.DEBUG_TOOLS_ENABLED;
  delete process.env.APP_BASE_URL;
  delete process.env.SUPER_ADMIN_USERNAME;
  delete process.env.SUPER_ADMIN_PASSWORD;
  delete process.env.SUPER_ADMIN_DISPLAY_NAME;
});

describe("Admin config API", () => {
  it("returns a redacted config view and can reveal a secret explicitly", async () => {
    const { app } = await loadTestServer();
    const signInResponse = await request(app).post("/api/auth/signin-admin").send({
      username: "platform-admin",
      password: "PlatformAdmin123!"
    });

    expect(signInResponse.status).toBe(200);
    const cookie = signInResponse.headers["set-cookie"];

    const configResponse = await request(app).get("/api/admin/config").set("Cookie", cookie);
    expect(configResponse.status).toBe(200);
    expect(configResponse.body.admin.passwordConfigured).toBe(true);
    expect(configResponse.body.admin.password).toBeUndefined();
    expect(configResponse.body.smtp.pass).toBeUndefined();

    const revealResponse = await request(app)
      .post("/api/admin/config/reveal-secret")
      .set("Cookie", cookie)
      .send({
        field: "admin.password"
      });
    expect(revealResponse.status).toBe(200);
    expect(revealResponse.body.value).toBe("PlatformAdmin123!");
  });

  it("persists config edits and managed branding uploads through the API", async () => {
    const { app } = await loadTestServer();
    const signInResponse = await request(app).post("/api/auth/signin-admin").send({
      username: "platform-admin",
      password: "PlatformAdmin123!"
    });
    const cookie = signInResponse.headers["set-cookie"];

    const patchResponse = await request(app).patch("/api/admin/config").set("Cookie", cookie).send({
      admin: {
        displayName: "Updated Platform Admin"
      },
      branding: {
        footerCreatorText: "Created by Luke",
        footerCompanyText: "Example Company"
      },
      smtp: {
        host: "smtp.example.com",
        port: 587,
        user: "mailer",
        pass: "smtp-secret",
        from: "noreply@example.com"
      }
    });

    expect(patchResponse.status).toBe(200);
    expect(patchResponse.body.config.admin.displayName).toBe("Updated Platform Admin");
    expect(patchResponse.body.config.branding.footerCreatorText).toBe("Created by Luke");
    expect(patchResponse.body.config.smtp.passConfigured).toBe(true);

    const uploadResponse = await request(app).post("/api/admin/branding/upload").set("Cookie", cookie).send({
      slot: "teamLogo",
      fileName: "team-logo.svg",
      mimeType: "image/svg+xml",
      dataBase64: Buffer.from("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 16 16\"><circle cx=\"8\" cy=\"8\" r=\"8\" fill=\"#579dff\"/></svg>").toString("base64")
    });

    expect(uploadResponse.status).toBe(200);
    expect(uploadResponse.body.config.branding.teamLogo.startsWith("/managed-branding/")).toBe(true);

    const bootstrapResponse = await request(app).get("/api/bootstrap");
    expect(bootstrapResponse.status).toBe(200);
    expect(bootstrapResponse.body.branding.footerCompanyText).toBe("Example Company");
    expect(bootstrapResponse.body.branding.teamLogo.startsWith("/managed-branding/")).toBe(true);
  });
});
