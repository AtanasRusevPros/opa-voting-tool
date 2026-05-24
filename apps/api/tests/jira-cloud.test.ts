// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const tempDirs: string[] = [];

function createEnvDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "planning-poker-jira-"));
  tempDirs.push(dir);
  fs.writeFileSync(path.join(dir, "allowed-domains.txt"), "example-company.com\nexample-partner.com\n");
  return dir;
}

async function loadTestServer(options?: {
  env?: Record<string, string>;
  fetchMock?: typeof fetch;
}) {
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

  for (const [key, value] of Object.entries(options?.env ?? {})) {
    process.env[key] = value;
  }

  if (options?.fetchMock) {
    vi.stubGlobal("fetch", options.fetchMock);
  }

  vi.resetModules();
  return import("../src/server.js");
}

async function createRegularUser(client: ReturnType<typeof request>, email: string, displayName: string) {
  const codeResponse = await client.post("/api/auth/request-code").send({ email });
  expect(codeResponse.status).toBe(200);
  const debugCode = codeResponse.body.debugCode as string | undefined;
  expect(debugCode).toBeTruthy();

  const verifyResponse = await client.post("/api/auth/verify-code").send({
    email,
    code: debugCode,
    displayName,
    avatarIconKey: "bear",
    avatarColorKey: "azure",
    password: "Password123!"
  });
  expect(verifyResponse.status).toBe(200);
  return verifyResponse.headers["set-cookie"];
}

function createJsonFetchResponse(body: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body)
  } as Response);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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
  delete process.env.JIRA_CLIENT_ID;
  delete process.env.JIRA_CLIENT_SECRET;
  delete process.env.JIRA_CLOUD_ID;
  delete process.env.JIRA_SITE_URL;
  delete process.env.JIRA_SITE_NAME;
  delete process.env.JIRA_ACCESS_TOKEN;
  delete process.env.JIRA_REFRESH_TOKEN;
  delete process.env.JIRA_ACCESS_TOKEN_EXPIRES_AT;
});

describe("Jira Cloud integration API", () => {
  it("persists Jira client credentials and completes multi-site OAuth selection for the super-admin", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url === "https://auth.atlassian.com/oauth/token") {
        return createJsonFetchResponse({
          access_token: "jira-access-token",
          refresh_token: "jira-refresh-token",
          expires_in: 3600
        });
      }
      if (url === "https://api.atlassian.com/oauth/token/accessible-resources") {
        return createJsonFetchResponse([
          {
            id: "cloud-1",
            url: "https://alpha.atlassian.net",
            name: "Alpha Site"
          },
          {
            id: "cloud-2",
            url: "https://beta.atlassian.net",
            name: "Beta Site"
          }
        ]);
      }
      throw new Error(`Unexpected Jira fetch: ${url}`);
    }) as unknown as typeof fetch;

    const { app } = await loadTestServer({ fetchMock });
    const client = request(app);

    const adminSignIn = await client.post("/api/auth/signin-admin").send({
      username: "platform-admin",
      password: "PlatformAdmin123!"
    });
    expect(adminSignIn.status).toBe(200);
    const adminCookie = adminSignIn.headers["set-cookie"];

    const patchResponse = await client.patch("/api/admin/config").set("Cookie", adminCookie).send({
      jira: {
        clientId: "jira-client-id",
        clientSecret: "jira-client-secret"
      }
    });
    expect(patchResponse.status).toBe(200);
    expect(patchResponse.body.config.jira.clientId).toBe("jira-client-id");
    expect(patchResponse.body.config.jira.clientSecretConfigured).toBe(true);
    expect(patchResponse.body.config.jira.connected).toBe(false);

    const revealResponse = await client.post("/api/admin/config/reveal-secret").set("Cookie", adminCookie).send({
      field: "jira.clientSecret"
    });
    expect(revealResponse.status).toBe(200);
    expect(revealResponse.body.value).toBe("jira-client-secret");

    const startResponse = await client.post("/api/admin/jira/oauth/start").set("Cookie", adminCookie).send({});
    expect(startResponse.status).toBe(200);
    expect(startResponse.body.authorizationUrl).toContain("auth.atlassian.com/authorize");
    const authUrl = new URL(startResponse.body.authorizationUrl);
    const oauthState = authUrl.searchParams.get("state");
    expect(oauthState).toBeTruthy();

    const callbackResponse = await client.get(`/api/admin/jira/oauth/callback?code=test-oauth-code&state=${oauthState}`).set("Cookie", adminCookie);
    expect(callbackResponse.status).toBe(200);
    expect(callbackResponse.text).toContain("Jira Cloud authorization completed");

    const pendingConfigResponse = await client.get("/api/admin/config").set("Cookie", adminCookie);
    expect(pendingConfigResponse.status).toBe(200);
    expect(pendingConfigResponse.body.jira.connected).toBe(false);
    expect(pendingConfigResponse.body.jira.pendingSites).toHaveLength(2);

    const selectSiteResponse = await client.post("/api/admin/jira/oauth/select-site").set("Cookie", adminCookie).send({
      cloudId: "cloud-2"
    });
    expect(selectSiteResponse.status).toBe(200);
    expect(selectSiteResponse.body.jira.connected).toBe(true);
    expect(selectSiteResponse.body.jira.siteUrl).toBe("https://beta.atlassian.net");
    expect(selectSiteResponse.body.jira.siteName).toBe("Beta Site");
    expect(selectSiteResponse.body.jira.cloudId).toBe("cloud-2");
    expect(selectSiteResponse.body.jira.pendingSites).toHaveLength(0);

    const disconnectResponse = await client.post("/api/admin/jira/disconnect").set("Cookie", adminCookie).send({});
    expect(disconnectResponse.status).toBe(200);
    expect(disconnectResponse.body.jira.connected).toBe(false);
    expect(disconnectResponse.body.jira.siteUrl).toBeNull();
  });

  it("imports Jira issues into the team queue, loads one for voting, and removes it after reveal", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url === "https://api.atlassian.com/ex/jira/cloud-queue/rest/api/3/project/SFM") {
        return createJsonFetchResponse({
          id: "1001",
          key: "SFM",
          name: "Scrum Feature Management"
        });
      }
      if (url === "https://api.atlassian.com/ex/jira/cloud-queue/rest/api/3/search") {
        return createJsonFetchResponse({
          issues: [
            {
              id: "jira-issue-101",
              key: "ISSUE-101",
              fields: {
                summary: "Import the pending queue"
              }
            },
            {
              id: "jira-issue-102",
              key: "ISSUE-102",
              fields: {
                summary: "Keep the issue title visible"
              }
            }
          ]
        });
      }
      throw new Error(`Unexpected Jira fetch: ${url}`);
    }) as unknown as typeof fetch;

    const { app, repository } = await loadTestServer({
      fetchMock,
      env: {
        JIRA_CLIENT_ID: "jira-client-id",
        JIRA_CLIENT_SECRET: "jira-client-secret",
        JIRA_CLOUD_ID: "cloud-queue",
        JIRA_SITE_URL: "https://queue.atlassian.net",
        JIRA_SITE_NAME: "Queue Site",
        JIRA_ACCESS_TOKEN: "jira-access-token",
        JIRA_REFRESH_TOKEN: "jira-refresh-token",
        JIRA_ACCESS_TOKEN_EXPIRES_AT: "2099-01-01T00:00:00.000Z"
      }
    });

    const client = request(app);
    const ownerCookie = await createRegularUser(client, "jira-owner@example-company.com", "Jira Owner");
    const owner = repository.getUserByEmail("jira-owner@example-company.com")!;

    const teamResponse = await client.post("/api/teams").set("Cookie", ownerCookie).send({ name: "Jira Queue Team" });
    expect(teamResponse.status).toBe(201);
    const teamId = teamResponse.body.team.id as string;

    const settingsResponse = await client.patch(`/api/teams/${teamId}/settings`).set("Cookie", ownerCookie).send({
      jiraProjectKey: "SFM",
      jiraJql: 'statusCategory != Done ORDER BY Rank ASC'
    });
    expect(settingsResponse.status).toBe(200);
    expect(settingsResponse.body.team.jiraProjectKey).toBe("SFM");

    const importResponse = await client.post(`/api/teams/${teamId}/jira/import`).set("Cookie", ownerCookie).send({});
    expect(importResponse.status).toBe(200);
    expect(importResponse.body.importedCount).toBe(2);
    expect(importResponse.body.pendingIssues).toHaveLength(2);
    expect(importResponse.body.pendingIssues[0].issueKey).toBe("ISSUE-101");
    expect(importResponse.body.pendingIssues[0].title).toBe("Import the pending queue");

    const directoryResponse = await client.get(`/api/teams/${teamId}/directory`).set("Cookie", ownerCookie);
    expect(directoryResponse.status).toBe(200);
    expect(directoryResponse.body.pendingIssues).toHaveLength(2);

    const pendingIssueId = importResponse.body.pendingIssues[0].id as string;
    const loadResponse = await client.post(`/api/teams/${teamId}/pending-issues/${pendingIssueId}/load`).set("Cookie", ownerCookie).send({});
    expect(loadResponse.status).toBe(201);
    expect(loadResponse.body.round.title).toBe("ISSUE-101 - Import the pending queue");
    expect(loadResponse.body.round.pendingIssueId).toBe(pendingIssueId);

    const stateResponse = await client.get(`/api/teams/${teamId}/state?history=0`).set("Cookie", ownerCookie);
    expect(stateResponse.status).toBe(200);
    expect(stateResponse.body.activeRound.title).toBe("ISSUE-101 - Import the pending queue");
    expect(stateResponse.body.activeRound.pendingIssueId).toBe(pendingIssueId);
    expect(stateResponse.body.pendingIssues).toHaveLength(2);

    await client
      .post(`/api/teams/${teamId}/rounds/${loadResponse.body.round.id}/vote`)
      .set("Cookie", ownerCookie)
      .send({ value: "5" });
    const revealResponse = await client.post(`/api/teams/${teamId}/rounds/${loadResponse.body.round.id}/reveal`).set("Cookie", ownerCookie).send({});
    expect(revealResponse.status).toBe(200);

    const pendingAfterReveal = repository.getPendingIssues(teamId);
    expect(pendingAfterReveal).toHaveLength(1);
    expect(pendingAfterReveal[0]?.issueKey).toBe("ISSUE-102");
  });
});
