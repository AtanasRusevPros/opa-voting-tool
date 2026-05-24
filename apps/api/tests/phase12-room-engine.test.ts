// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BRANDING_MANIFEST, DEFAULT_HISTORY_TIME_ZONE_KEYS } from "@planning-poker/shared";
import { afterEach, describe, expect, it } from "vitest";
import { createRoomEngineManager, type RoomEngineRepositoryLike } from "../src/roomEngine.js";
import { Repository } from "../src/repository.js";
import type { AppConfig } from "../src/types.js";

const tempDirs: string[] = [];

function createTestConfig(): AppConfig {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "planning-poker-phase12-"));
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

function createCountingRoomEngineRepository(repo: Repository) {
  const counters = {
    getCurrentRound: 0,
    getHistoryPage: 0,
    getTeamMembers: 0,
    getPendingIssues: 0,
    getTeamStateContext: 0
  };

  const wrapped: RoomEngineRepositoryLike = {
    getTeam: (...args) => repo.getTeam(...args),
    getTeamMembers: (...args) => {
      counters.getTeamMembers += 1;
      return repo.getTeamMembers(...args);
    },
    getPendingIssues: (...args) => {
      counters.getPendingIssues += 1;
      return repo.getPendingIssues(...args);
    },
    getHistoryPage: (...args) => {
      counters.getHistoryPage += 1;
      return repo.getHistoryPage(...args);
    },
    getCurrentRound: (...args) => {
      counters.getCurrentRound += 1;
      return repo.getCurrentRound(...args);
    },
    getRoundVoteValues: (...args) => repo.getRoundVoteValues(...args),
    getCurrentUser: (...args) => repo.getCurrentUser(...args),
    getTeamsForUser: (...args) => repo.getTeamsForUser(...args),
    getTeamUserRole: (...args) => repo.getTeamUserRole(...args),
    getTeamStateContext: (...args) => {
      counters.getTeamStateContext += 1;
      return repo.getTeamStateContext(...args);
    }
  };

  return { wrapped, counters };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("Phase 12 room engine", () => {
  it("updates the live room vote snapshot incrementally without waiting for a full repository rebuild", () => {
    const repo = new Repository(createTestConfig());
    const owner = createUser(repo, "phase12-owner@example-company.com", "Owner");
    const member = createUser(repo, "phase12-member@example-company.com", "Member");
    const team = repo.createTeam(owner.id, "Phase 12 Team");
    repo.joinTeam(member.id, team.id);
    const round = repo.createRound(team.id, "ROOM-101");
    const rooms = createRoomEngineManager(repo);

    expect(rooms.getSnapshot(team.id).activeRound?.votes).toHaveLength(0);

    repo.submitVote(round.id, owner.id, "3");
    const afterOwner = rooms.noteVoteChange(team.id, round.id, owner.id, "3");
    expect(afterOwner.voteVersion).toBe(1);

    let snapshot = rooms.getSnapshot(team.id);
    expect(snapshot.activeRound?.votes.map((vote) => `${vote.displayName}:${vote.value}`)).toEqual(["Owner:3"]);
    expect(snapshot.activeRound?.votedCount).toBe(1);
    expect(snapshot.activeRound?.notVotedCount).toBe(1);

    repo.submitVote(round.id, member.id, "5");
    rooms.noteVoteChange(team.id, round.id, member.id, "5");

    const delta = rooms.peekPendingVoteDelta(team.id);
    expect(delta).not.toBeNull();
    expect(delta?.changedMemberIndexes).toEqual([1, 0]);
    expect(delta?.votedCount).toBe(2);
    expect(delta?.notVotedCount).toBe(0);

    snapshot = rooms.getSnapshot(team.id);
    expect(snapshot.activeRound?.votes.map((vote) => `${vote.displayName}:${vote.value}`)).toEqual(["Member:5", "Owner:3"]);
  });

  it("reloads a dirty room snapshot after non-vote team changes and keeps the updated team metadata", () => {
    const repo = new Repository(createTestConfig());
    const owner = createUser(repo, "phase12-settings-owner@example-company.com", "Owner");
    const team = repo.createTeam(owner.id, "Original Team");
    const rooms = createRoomEngineManager(repo);

    expect(rooms.getSnapshot(team.id).team.name).toBe("Original Team");

    repo.updateTeamSettings(team.id, {
      name: "Renamed Team",
      deckKey: "fibonacci-21",
      fibonacciRangeStart: null,
      fibonacciRangeEnd: null,
      timerSeconds: 30,
      iconKey: "rocket",
      logoOpacity: 100,
      backgroundOpacity: 100,
      historyTimezonePopupEnabled: false,
      historyTimezoneKeys: [],
      minimumVotePercentEnabled: false,
      minimumVotePercent: 75,
      jiraProjectKey: null,
      jiraJql: null
    });

    rooms.markDirty(team.id);
    const refreshed = rooms.getSnapshot(team.id);
    expect(refreshed.team.name).toBe("Renamed Team");
    expect(refreshed.team.timerSeconds).toBe(30);
    expect(refreshed.team.iconKey).toBe("rocket");
  });

  it("keeps room state isolated across teams and refreshes history checkpoints on reveal", () => {
    const repo = new Repository(createTestConfig());
    const ownerA = createUser(repo, "phase12-owner-a@example-company.com", "Owner A");
    const ownerB = createUser(repo, "phase12-owner-b@example-company.com", "Owner B");
    const teamA = repo.createTeam(ownerA.id, "Team A");
    const teamB = repo.createTeam(ownerB.id, "Team B");
    const roundA = repo.createRound(teamA.id, "ROOM-A");
    const roundB = repo.createRound(teamB.id, "ROOM-B");
    const rooms = createRoomEngineManager(repo);

    repo.submitVote(roundA.id, ownerA.id, "8");
    rooms.noteVoteChange(teamA.id, roundA.id, ownerA.id, "8");

    const teamBSnapshotBefore = rooms.getSnapshot(teamB.id);
    expect(teamBSnapshotBefore.activeRound?.votes).toHaveLength(0);

    repo.revealRound(roundA.id);
    const liveSync = rooms.noteRoundChanged(teamA.id);
    const teamASnapshot = rooms.getSnapshot(teamA.id);
    const teamBSnapshotAfter = rooms.getSnapshot(teamB.id);

    expect(liveSync.roundId).toBe(roundA.id);
    expect(teamASnapshot.activeRound?.status).toBe("revealed");
    expect(teamASnapshot.history[0]?.title).toBe("ROOM-A");
    expect(teamASnapshot.history[0]?.votes[0]?.value).toBe("8");
    expect(teamBSnapshotAfter.activeRound?.id).toBe(roundB.id);
    expect(teamBSnapshotAfter.history).toHaveLength(0);
  });

  it("applies started and revealed rounds incrementally without forcing another repository snapshot rebuild", () => {
    const repo = new Repository(createTestConfig());
    const owner = createUser(repo, "phase12-incremental-owner@example-company.com", "Owner");
    const member = createUser(repo, "phase12-incremental-member@example-company.com", "Member");
    const team = repo.createTeam(owner.id, "Incremental Team");
    repo.joinTeam(member.id, team.id);
    const { wrapped, counters } = createCountingRoomEngineRepository(repo);
    const rooms = createRoomEngineManager(wrapped);

    const firstRound = repo.createRound(team.id, "ROOM-START");
    rooms.noteRoundStarted(team.id, firstRound);
    expect(rooms.getSnapshot(team.id).activeRound?.title).toBe("ROOM-START");
    const countersAfterStart = { ...counters };

    repo.submitVote(firstRound.id, owner.id, "5");
    rooms.noteVoteChange(team.id, firstRound.id, owner.id, "5");
    repo.submitVote(firstRound.id, member.id, "8");
    rooms.noteVoteChange(team.id, firstRound.id, member.id, "8");
    const revealed = repo.revealRound(firstRound.id);
    rooms.noteRoundRevealed(team.id, revealed, repo.getLatestHistoryEntry(team.id));

    const snapshot = rooms.getSnapshot(team.id);
    expect(snapshot.activeRound?.status).toBe("revealed");
    expect(snapshot.history[0]?.title).toBe("ROOM-START");
    expect(snapshot.history[0]?.votes.map((vote) => `${vote.displayName}:${vote.value}`)).toEqual(["Member:8", "Owner:5"]);
    expect(counters.getCurrentRound).toBe(countersAfterStart.getCurrentRound);
    expect(counters.getHistoryPage).toBe(countersAfterStart.getHistoryPage);
    expect(counters.getTeamMembers).toBe(countersAfterStart.getTeamMembers);
    expect(counters.getPendingIssues).toBe(countersAfterStart.getPendingIssues);
  });
});
