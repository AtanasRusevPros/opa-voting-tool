// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BRANDING_MANIFEST, DEFAULT_HISTORY_TIME_ZONE_KEYS } from "@planning-poker/shared";
import { afterEach, describe, expect, it } from "vitest";
import { createTeamLiveSyncManager } from "../src/liveSync.js";
import { Repository } from "../src/repository.js";
import type { AppConfig } from "../src/types.js";

const tempDirs: string[] = [];

function createTestConfig(): AppConfig {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "planning-poker-phase11-"));
  tempDirs.push(dir);
  return {
    port: 0,
    host: "127.0.0.1",
    allowedDomainsPath: path.join(dir, "allowed-domains.txt"),
    sessionTtlDays: 90,
    loginCodeTtlMinutes: 120,
    debugCodesEnabled: true,
    debugToolsEnabled: true,
    dataDir: dir,
    databasePath: path.join(dir, "test.db"),
    deploymentConfigPath: path.join(dir, "deployment.toml"),
    managedBrandingDir: path.join(dir, "managed-branding"),
    appBaseUrl: "http://localhost:3001",
    simulatorModeEnabled: false,
    simulatorSharedSecret: "test-secret",
    demoModeEnabled: false,
    superAdminUsername: "platform-admin",
    superAdminPassword: "PlatformAdmin123!",
    superAdminDisplayName: "Platform Admin",
    branding: BRANDING_MANIFEST,
    defaultHistoryTimezoneKeys: [...DEFAULT_HISTORY_TIME_ZONE_KEYS]
  };
}

function createUser(repo: Repository, email: string, displayName: string) {
  return repo.ensureUser({
    email,
    displayName,
    avatarIconKey: "bear",
    avatarColorKey: "azure"
  });
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("Phase 11 live sync manager", () => {
  it("keeps vote deltas ordered and carries forward only later changes after an earlier batch is acknowledged", () => {
    const repo = new Repository(createTestConfig());
    const alice = createUser(repo, "phase11-a@example-company.com", "Alice");
    const bob = createUser(repo, "phase11-b@example-company.com", "Bob");
    const team = repo.createTeam(alice.id, "Phase 11 Team");
    repo.joinTeam(bob.id, team.id);
    const round = repo.createRound(team.id, "SYNC-101");
    const liveSync = createTeamLiveSyncManager(repo);

    liveSync.syncTeam(team.id);

    repo.submitVote(round.id, alice.id, "3");
    const afterAlice = liveSync.noteVoteChange(team.id, round.id, alice.id);
    expect(afterAlice.voteVersion).toBe(1);

    const firstBatch = liveSync.peekPendingVoteDelta(team.id);
    expect(firstBatch).toEqual({
      sync: {
        teamId: team.id,
        roundId: round.id,
        roundVersion: 1,
        voteVersion: 1
      },
      fromVoteVersion: 0,
      changedUserIds: [alice.id]
    });

    repo.submitVote(round.id, bob.id, "5");
    const afterBob = liveSync.noteVoteChange(team.id, round.id, bob.id);
    expect(afterBob.voteVersion).toBe(2);

    liveSync.acknowledgeVoteDelta(team.id, 1);
    expect(liveSync.inspect(team.id)).toEqual({
      sync: {
        teamId: team.id,
        roundId: round.id,
        roundVersion: 1,
        voteVersion: 2
      },
      pendingVoteDeltaFromVersion: 1,
      dirtyVoteChanges: [{ userId: bob.id, version: 2 }]
    });

    const secondBatch = liveSync.peekPendingVoteDelta(team.id);
    expect(secondBatch).toEqual({
      sync: {
        teamId: team.id,
        roundId: round.id,
        roundVersion: 1,
        voteVersion: 2
      },
      fromVoteVersion: 1,
      changedUserIds: [bob.id]
    });

    liveSync.acknowledgeVoteDelta(team.id, 2);
    expect(liveSync.inspect(team.id)).toEqual({
      sync: {
        teamId: team.id,
        roundId: round.id,
        roundVersion: 1,
        voteVersion: 2
      },
      pendingVoteDeltaFromVersion: null,
      dirtyVoteChanges: []
    });
  });

  it("clears pending vote deltas and bumps the round version when the round changes", () => {
    const repo = new Repository(createTestConfig());
    const owner = createUser(repo, "phase11-owner@example-company.com", "Owner");
    const member = createUser(repo, "phase11-member@example-company.com", "Member");
    const team = repo.createTeam(owner.id, "Round Change Team");
    repo.joinTeam(member.id, team.id);
    const firstRound = repo.createRound(team.id, "SYNC-201");
    const liveSync = createTeamLiveSyncManager(repo);

    repo.submitVote(firstRound.id, owner.id, "8");
    liveSync.noteVoteChange(team.id, firstRound.id, owner.id);
    expect(liveSync.peekPendingVoteDelta(team.id)?.changedUserIds).toEqual([owner.id]);

    repo.revealRound(firstRound.id);
    const revealed = liveSync.noteRoundChange(team.id);
    expect(revealed.roundId).toBe(firstRound.id);
    expect(revealed.roundVersion).toBe(2);
    expect(revealed.voteVersion).toBe(1);
    expect(liveSync.peekPendingVoteDelta(team.id)).toBeNull();

    const secondRound = repo.createRound(team.id, "SYNC-202");
    const reopened = liveSync.noteRoundChange(team.id);
    expect(reopened.roundId).toBe(secondRound.id);
    expect(reopened.roundVersion).toBe(3);
    expect(reopened.voteVersion).toBe(0);
  });

  it("stays coherent under mixed-room stress with dozens of active rooms and larger teams", { timeout: 20_000 }, () => {
    const repo = new Repository(createTestConfig());
    const liveSync = createTeamLiveSyncManager(repo);

    const roomSizes = [
      10, 12, 14, 16, 18, 20, 11, 13, 15, 17,
      10, 12, 14, 16, 18, 20, 11, 13, 15, 17,
      10, 12, 14, 16, 18, 20, 11, 13, 15, 17,
      10, 12, 14, 16, 18, 20, 11, 13, 15, 17,
      10, 12, 14, 16, 18, 20,
      50, 80, 150, 200
    ];

    const teams = roomSizes.map((size, index) => {
      const owner = createUser(repo, `phase11-owner-${index}@example-company.com`, `Owner ${index}`);
      const team = repo.createTeam(owner.id, `Stress Team ${index}`);
      const members = [owner];
      for (let memberIndex = 1; memberIndex < size; memberIndex += 1) {
        const member = createUser(repo, `phase11-${index}-${memberIndex}@example-company.com`, `User ${index}-${memberIndex}`);
        repo.joinTeam(member.id, team.id);
        members.push(member);
      }
      const round = repo.createRound(team.id, `SYNC-${index}`);
      return { team, round, members };
    });

    for (const { team, round, members } of teams) {
      liveSync.syncTeam(team.id);
      for (const member of members) {
        repo.submitVote(round.id, member.id, "5");
        liveSync.noteVoteChange(team.id, round.id, member.id);
      }
    }

    for (const { team, round, members } of teams) {
      const pending = liveSync.peekPendingVoteDelta(team.id);
      expect(pending).not.toBeNull();
      expect(pending?.sync.roundId).toBe(round.id);
      expect(pending?.changedUserIds).toHaveLength(members.length);
      expect(pending?.fromVoteVersion).toBe(0);
      expect(pending?.sync.voteVersion).toBe(members.length);

      liveSync.acknowledgeVoteDelta(team.id, pending!.sync.voteVersion);
      expect(liveSync.peekPendingVoteDelta(team.id)).toBeNull();
    }
  });
});
