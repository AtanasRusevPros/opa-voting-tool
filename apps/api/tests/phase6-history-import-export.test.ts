// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const tempDirs: string[] = [];

function createEnvDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "planning-poker-phase6-"));
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

describe("Phase 6 history and import/export HTTP flows", () => {
  it("paginates team history and searches by title, comment, date, and person", async () => {
    const { app, repository } = await loadTestServer();
    const client = request(app);
    const ownerCookie = await createRegularUser(client, "history-owner@example-company.com", "History Owner");
    const owner = repository.getUserByEmail("history-owner@example-company.com")!;

    const teamResponse = await client.post("/api/teams").set("Cookie", ownerCookie).send({ name: "History Search Team" });
    expect(teamResponse.status).toBe(201);
    const teamId = teamResponse.body.team.id as string;

    for (let index = 1; index <= 25; index += 1) {
      const round = repository.createRound(teamId, `SEARCH-${String(index).padStart(3, "0")}`);
      repository.castVote(round.id, owner.id, index % 2 === 0 ? "3" : "5");
      repository.revealRound(round.id);
    }

    const historyEntry = repository.getHistory(teamId).find((entry) => entry.title === "SEARCH-005")!;
    repository.addHistoryComment(teamId, historyEntry.id, owner.id, "Imported search note marker");

    const firstPageResponse = await client.get(`/api/teams/${teamId}/history`).set("Cookie", ownerCookie);
    expect(firstPageResponse.status).toBe(200);
    expect(firstPageResponse.body.history.items).toHaveLength(20);
    expect(firstPageResponse.body.history.nextCursor).toBeTruthy();

    const secondPageResponse = await client
      .get(`/api/teams/${teamId}/history`)
      .set("Cookie", ownerCookie)
      .query({
        cursorCompletedAt: firstPageResponse.body.history.nextCursor.completedAt,
        cursorId: firstPageResponse.body.history.nextCursor.id
      });
    expect(secondPageResponse.status).toBe(200);
    expect(secondPageResponse.body.history.items).toHaveLength(5);

    const partialTitleSearch = await client
      .get(`/api/teams/${teamId}/history/search`)
      .set("Cookie", ownerCookie)
      .query({ titleQuery: "SEARCH-00" });
    expect(partialTitleSearch.status).toBe(200);
    expect(partialTitleSearch.body.items.length).toBeGreaterThan(1);

    const exactTitleSearch = await client
      .get(`/api/teams/${teamId}/history/search`)
      .set("Cookie", ownerCookie)
      .query({ titleQuery: "SEARCH-005", exactTitleMatch: "1" });
    expect(exactTitleSearch.status).toBe(200);
    expect(exactTitleSearch.body.items).toHaveLength(1);
    expect(exactTitleSearch.body.items[0].title).toBe("SEARCH-005");

    const commentSearch = await client
      .get(`/api/teams/${teamId}/history/search`)
      .set("Cookie", ownerCookie)
      .query({ commentQuery: "marker" });
    expect(commentSearch.status).toBe(200);
    expect(commentSearch.body.items.map((entry: { title: string }) => entry.title)).toContain("SEARCH-005");

    const personSearch = await client
      .get(`/api/teams/${teamId}/history/search`)
      .set("Cookie", ownerCookie)
      .query({ personQuery: "history-owner@example-company.com" });
    expect(personSearch.status).toBe(200);
    expect(personSearch.body.items.length).toBeGreaterThan(0);

    const dateKey = historyEntry.completedAt.slice(0, 10);
    const dateSearch = await client
      .get(`/api/teams/${teamId}/history/search`)
      .set("Cookie", ownerCookie)
      .query({ dateFrom: dateKey, dateTo: dateKey, titleQuery: "SEARCH-005", exactTitleMatch: "1" });
    expect(dateSearch.status).toBe(200);
    expect(dateSearch.body.items).toHaveLength(1);
  });

  it("exports and reimports team history packages with signed immutable comments and duplicate protection", async () => {
    const { app, repository } = await loadTestServer();
    const client = request(app);
    const ownerCookie = await createRegularUser(client, "export-owner@example-company.com", "Export Owner");
    const owner = repository.getUserByEmail("export-owner@example-company.com")!;

    const teamResponse = await client.post("/api/teams").set("Cookie", ownerCookie).send({ name: "Export Source Team" });
    expect(teamResponse.status).toBe(201);
    const sourceTeamId = teamResponse.body.team.id as string;

    const round = repository.createRound(sourceTeamId, "EXPORT-101");
    repository.castVote(round.id, owner.id, "8");
    repository.revealRound(round.id);
    const sourceHistoryEntry = repository.getHistory(sourceTeamId)[0]!;
    repository.addHistoryComment(sourceTeamId, sourceHistoryEntry.id, owner.id, "Signed historical note");

    const exportResponse = await client.get(`/api/teams/${sourceTeamId}/export`).set("Cookie", ownerCookie);
    expect(exportResponse.status).toBe(200);
    expect(exportResponse.body.package.entries).toHaveLength(1);
    expect(exportResponse.body.package.entries[0].comments[0].authorSignature).toContain("export-owner@example-company.com");

    const importResponse = await client.post("/api/teams/import").set("Cookie", ownerCookie).send({
      package: exportResponse.body.package,
      teamName: "Imported History Team"
    });
    expect(importResponse.status).toBe(201);
    expect(importResponse.body.importedCount).toBe(1);
    expect(importResponse.body.skippedCount).toBe(0);
    expect(importResponse.body.createdTeam).toBe(true);

    const importedTeamId = importResponse.body.team.id as string;
    const importedHistoryEntry = repository.getHistory(importedTeamId)[0]!;
    expect(importedHistoryEntry.title).toBe("EXPORT-101");
    expect(importedHistoryEntry.comments[0]?.authorSignature).toContain("export-owner@example-company.com");
    expect(importedHistoryEntry.comments[0]?.importedImmutable).toBe(true);

    expect(() =>
      repository.updateHistoryComment(importedTeamId, importedHistoryEntry.id, importedHistoryEntry.comments[0]!.id, owner.id, "Should fail")
    ).toThrowError("Imported historical comments are read-only.");

    const secondImportResponse = await client.post(`/api/teams/${importedTeamId}/import`).set("Cookie", ownerCookie).send({
      package: exportResponse.body.package
    });
    expect(secondImportResponse.status).toBe(200);
    expect(secondImportResponse.body.importedCount).toBe(0);
    expect(secondImportResponse.body.skippedCount).toBe(1);
  });

  it("exports and imports full SQLite snapshots for the super-admin", async () => {
    const { app, repository } = await loadTestServer();
    const client = request(app);
    const ownerCookie = await createRegularUser(client, "snapshot-owner@example-company.com", "Snapshot Owner");
    const owner = repository.getUserByEmail("snapshot-owner@example-company.com")!;

    const teamResponse = await client.post("/api/teams").set("Cookie", ownerCookie).send({ name: "Snapshot Team" });
    expect(teamResponse.status).toBe(201);
    const originalTeamId = teamResponse.body.team.id as string;

    const round = repository.createRound(originalTeamId, "SNAP-101");
    repository.castVote(round.id, owner.id, "5");
    repository.revealRound(round.id);

    const adminSignIn = await client.post("/api/auth/signin-admin").send({
      username: "platform-admin",
      password: "PlatformAdmin123!"
    });
    expect(adminSignIn.status).toBe(200);
    const adminCookie = adminSignIn.headers["set-cookie"];

    const exportResponse = await client.get("/api/admin/database/export").set("Cookie", adminCookie);
    expect(exportResponse.status).toBe(200);
    expect(exportResponse.headers["content-type"]).toContain("application/octet-stream");
    const snapshotBytes = exportResponse.body as Buffer;
    expect(Buffer.isBuffer(snapshotBytes)).toBe(true);
    expect(snapshotBytes.byteLength).toBeGreaterThan(0);

    repository.createTeam(owner.id, "Mutation Team");
    expect(repository.getTeamsForUser(owner.id).memberships.map((team) => team.name)).toContain("Mutation Team");

    const importResponse = await client
      .post("/api/admin/database/import")
      .set("Cookie", adminCookie)
      .set("Content-Type", "application/octet-stream")
      .send(snapshotBytes);
    expect(importResponse.status).toBe(200);
    expect(importResponse.body.ok).toBe(true);

    const membershipsAfterImport = repository.getTeamsForUser(owner.id).memberships.map((team) => team.name);
    expect(membershipsAfterImport).toContain("Snapshot Team");
    expect(membershipsAfterImport).not.toContain("Mutation Team");
    expect(repository.getHistory(originalTeamId)[0]?.title).toBe("SNAP-101");
  });
});
