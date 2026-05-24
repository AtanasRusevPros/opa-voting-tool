// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const tempDirs: string[] = [];
const startedServers: import("node:http").Server[] = [];

function createEnvDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "planning-poker-sim-"));
  tempDirs.push(dir);
  fs.writeFileSync(path.join(dir, "allowed-domains.txt"), "example-company.com\nexample-partner.com\n");
  return dir;
}

async function loadTestServer(options: { simulatorModeEnabled: boolean }) {
  const dir = createEnvDir();
  process.env.NODE_ENV = "test";
  process.env.PORT = "0";
  process.env.HOST = "127.0.0.1";
  process.env.DATA_DIR = dir;
  process.env.DATABASE_PATH = path.join(dir, "test.db");
  process.env.ALLOWED_DOMAINS_PATH = path.join(dir, "allowed-domains.txt");
  process.env.DEBUG_TOOLS_ENABLED = "1";
  process.env.SIMULATOR_MODE_ENABLED = options.simulatorModeEnabled ? "1" : "0";
  process.env.SIMULATOR_SHARED_SECRET = "test-secret";
  vi.resetModules();
  return import("../src/server.js");
}

async function listenTestServer(server: import("node:http").Server) {
  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", (error?: Error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
  startedServers.push(server);
}

afterEach(() => {
  for (const server of startedServers.splice(0)) {
    server.close();
  }
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  delete process.env.PORT;
  delete process.env.HOST;
  delete process.env.DATA_DIR;
  delete process.env.DATABASE_PATH;
  delete process.env.ALLOWED_DOMAINS_PATH;
  delete process.env.DEBUG_TOOLS_ENABLED;
  delete process.env.SIMULATOR_MODE_ENABLED;
  delete process.env.SIMULATOR_SHARED_SECRET;
});

describe("Simulator API", () => {
  it("rejects simulator login when simulator mode is disabled", async () => {
    const { server } = await loadTestServer({ simulatorModeEnabled: false });
    await listenTestServer(server);
    const response = await request(server)
      .post("/api/simulator/login")
      .set("x-simulator-secret", "test-secret")
      .send({ email: "sim.bot.001@example-company.com" });

    expect(response.status).toBe(404);
  });

  it("seeds simulator users and allows simulator login when enabled", async () => {
    const { server } = await loadTestServer({ simulatorModeEnabled: true });
    await listenTestServer(server);

    const bootstrapResponse = await request(server)
      .post("/api/simulator/bootstrap")
      .set("x-simulator-secret", "test-secret")
      .send({
        users: [
          {
            email: "sim.bot.001@example-company.com",
            displayName: "Sim 001",
            avatarIconKey: "letter-a",
            avatarColorKey: "teal"
          }
        ],
        teams: [
          {
            name: "Sim Team 10",
            memberEmails: ["sim.bot.001@example-company.com"]
          }
        ]
      });

    expect(bootstrapResponse.status).toBe(200);
    expect(bootstrapResponse.body.teams[0].memberCount).toBe(1);

    const loginResponse = await request(server)
      .post("/api/simulator/login")
      .set("x-simulator-secret", "test-secret")
      .send({ email: "sim.bot.001@example-company.com" });

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.token).toBeTruthy();
    expect(loginResponse.body.user.email).toBe("sim.bot.001@example-company.com");
  });

  it("reconciles simulator visibility transitions by broadcasting chooser updates and closing offline sim rooms", async () => {
    const { repository, reconcileSimulatorRuntimeVisibilityTransition } = await loadTestServer({ simulatorModeEnabled: true });
    const nowSpy = vi.spyOn(Date, "now");
    let simulatedNow = 1_700_000_000_000;
    nowSpy.mockImplementation(() => simulatedNow);

    try {
      repository.recordSimulatorHeartbeat();
      const closeUnavailableTeamSockets = vi.fn();
      const broadcastChooserUpdate = vi.fn();

      const onlineState = reconcileSimulatorRuntimeVisibilityTransition(false, {
        closeUnavailableTeamSockets,
        broadcastChooserUpdate
      });
      expect(onlineState).toBe(true);
      expect(closeUnavailableTeamSockets).not.toHaveBeenCalled();
      expect(broadcastChooserUpdate).toHaveBeenCalledTimes(1);

      simulatedNow += 13_000;
      const offlineState = reconcileSimulatorRuntimeVisibilityTransition(true, {
        closeUnavailableTeamSockets,
        broadcastChooserUpdate
      });
      expect(offlineState).toBe(false);
      expect(closeUnavailableTeamSockets).toHaveBeenCalledTimes(1);
      expect(broadcastChooserUpdate).toHaveBeenCalledTimes(2);

      repository.recordSimulatorHeartbeat();
      const restoredState = reconcileSimulatorRuntimeVisibilityTransition(false, {
        closeUnavailableTeamSockets,
        broadcastChooserUpdate
      });
      expect(restoredState).toBe(true);
      expect(closeUnavailableTeamSockets).toHaveBeenCalledTimes(1);
      expect(broadcastChooserUpdate).toHaveBeenCalledTimes(3);
    } finally {
      nowSpy.mockRestore();
    }
  });
});
