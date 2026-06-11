// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BRANDING_MANIFEST, DEFAULT_HISTORY_TIME_ZONE_KEYS } from "@planning-poker/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Repository } from "../src/repository.js";
import type { AppConfig } from "../src/types.js";

const tempDirs: string[] = [];

function createTestConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "planning-poker-"));
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
    publicTrial: {
      enabled: false,
      mode: "disabled",
      maxTeamsPerWorkspace: 2,
      maxUsersPerWorkspace: 10,
      maxRevealedRoundsPerWorkspacePerMonth: 40,
      maxSignupRequestsPerIpPerHour: 3,
      maxCodeRequestsPerEmailPerDay: 5,
      maxInvitesPerWorkspacePerDay: 10,
      maxWorkspaceCreationsPerIpPerDay: 2,
      maxLoginAttemptsPerEmailPerHour: 10
    },
    superAdminUsername: "platform-admin",
    superAdminPassword: "PlatformAdmin123!",
    superAdminDisplayName: "Platform Admin",
    branding: BRANDING_MANIFEST,
    defaultHistoryTimezoneKeys: [...DEFAULT_HISTORY_TIME_ZONE_KEYS],
    ...overrides
  };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("Repository integration", () => {
  it("creates a team, runs a round, and stores reveal history", () => {
    const repo = new Repository(createTestConfig());

    repo.requestLoginCode("alice@example-company.com");
    const alice = repo.verifyLoginCode("alice@example-company.com", repo.requestLoginCode("alice@example-company.com").code, "Alice", "bear", "azure", undefined, "Password123!");
    expect(alice).not.toBeNull();

    repo.requestLoginCode("bob@example-partner.com");
    const bob = repo.verifyLoginCode("bob@example-partner.com", repo.requestLoginCode("bob@example-partner.com").code, "Bob", "cat", "rose", undefined, "Password123!");
    expect(bob).not.toBeNull();

    const team = repo.createTeam(alice!.id, "Death Star Team");
    repo.joinTeam(bob!.id, team.id);

    const round = repo.createRound(team.id, "ISSUE-19234");
    repo.castVote(round.id, alice!.id, "3");
    repo.castVote(round.id, bob!.id, "5");
    const revealed = repo.revealRound(round.id);

    expect(revealed.status).toBe("revealed");
    expect(revealed.revealAverage).toBe(4);

    const state = repo.getTeamState(team.id, alice!.id);
    expect(state.teamMembers).toHaveLength(2);
    expect(state.history).toHaveLength(1);
    expect(state.history[0]?.averageScore).toBe(4);
    expect(state.history[0]?.votes.map((vote) => vote.value)).toEqual(["3", "5"]);
  });

  it("stores reveal history correctly for a single participant round", () => {
    const repo = new Repository(createTestConfig());
    const code = repo.requestLoginCode("solo@example-company.com").code;
    const user = repo.verifyLoginCode("solo@example-company.com", code, "Solo", "bear", "azure", undefined, "Password123!")!;
    const team = repo.createTeam(user.id, "Solo Team");

    const round = repo.createRound(team.id, "SOLO-1");
    repo.castVote(round.id, user.id, "8");
    const revealed = repo.revealRound(round.id);

    expect(revealed.status).toBe("revealed");
    expect(revealed.revealAverage).toBe(8);

    const state = repo.getTeamState(team.id, user.id);
    expect(state.history).toHaveLength(1);
    expect(state.history[0]?.title).toBe("SOLO-1");
    expect(state.history[0]?.participantCount).toBe(1);
    expect(state.history[0]?.votes).toEqual([
      expect.objectContaining({
        displayName: "Solo",
        value: "8"
      })
    ]);
  });

  it("derives a cleaner default display name from the email local-part", () => {
    const repo = new Repository(createTestConfig());
    const code = repo.requestLoginCode("john.smith@example-company.com").code;
    const user = repo.verifyLoginCode("john.smith@example-company.com", code, undefined, "bear", "azure", undefined, "Password123!")!;

    expect(user.displayName).toBe("John");
  });

  it("replaces the history entry contents when vote again completes", () => {
    const repo = new Repository(createTestConfig());
    const firstCode = repo.requestLoginCode("alice@example-company.com").code;
    const alice = repo.verifyLoginCode("alice@example-company.com", firstCode, "Alice", "bear", "azure", undefined, "Password123!")!;
    const team = repo.createTeam(alice.id, "Platform");
    const firstRound = repo.createRound(team.id, "VSSB feature");
    repo.castVote(firstRound.id, alice.id, "8");
    repo.revealRound(firstRound.id);

    const originalHistory = repo.getHistory(team.id)[0]!;
    const redoRound = repo.createRound(team.id, originalHistory.title, originalHistory.id);
    repo.castVote(redoRound.id, alice.id, "13");
    repo.revealRound(redoRound.id);

    const history = repo.getHistory(team.id);
    expect(history).toHaveLength(1);
    expect(history[0]?.averageScore).toBe(13);
  });

  it("keeps revealed history on its original deck but uses the new team deck for the next round", () => {
    const repo = new Repository(createTestConfig());
    const code = repo.requestLoginCode("alice@example-company.com").code;
    const alice = repo.verifyLoginCode("alice@example-company.com", code, "Alice", "bear", "azure", undefined, "Password123!")!;
    const team = repo.createTeam(alice.id, "Deck Team");

    const firstRound = repo.createRound(team.id, "API-101");
    repo.castVote(firstRound.id, alice.id, "3");
    repo.revealRound(firstRound.id);

    repo.updateTeamSettings(team.id, { deckKey: "tshirt" });

    const history = repo.getHistory(team.id);
    expect(history[0]?.deckKey).toBe("fibonacci-21");

    const nextRound = repo.createRound(team.id, "API-102");
    expect(nextRound.deckKey).toBe("tshirt");
  });

  it("persists team history time popup settings", () => {
    const repo = new Repository(createTestConfig());
    const code = repo.requestLoginCode("tz-owner@example-company.com").code;
    const owner = repo.verifyLoginCode("tz-owner@example-company.com", code, "Time Owner", "bear", "azure", undefined, "Password123!")!;
    const team = repo.createTeam(owner.id, "Time Zone Team");

    const updated = repo.updateTeamSettings(team.id, {
      historyTimezonePopupEnabled: false,
      historyTimezoneKeys: ["gmt", "japan-tokyo"]
    });

    expect(updated.historyTimezonePopupEnabled).toBe(false);
    expect(updated.historyTimezoneKeys).toEqual(["gmt", "japan-tokyo"]);
    expect(repo.getTeamState(team.id, owner.id).team.historyTimezoneKeys).toEqual(["gmt", "japan-tokyo"]);
  });

  it("applies configured history time zones to new teams and keeps personal overrides scoped per team", () => {
    const config = createTestConfig();
    config.defaultHistoryTimezoneKeys = ["gmt", "japan-tokyo"];
    const repo = new Repository(config);
    const owner = repo.verifyLoginCode(
      "scoped-tz-owner@example-company.com",
      repo.requestLoginCode("scoped-tz-owner@example-company.com").code,
      "Scoped TZ Owner",
      "bear",
      "azure",
      undefined,
      "Password123!"
    )!;
    const firstTeam = repo.createTeam(owner.id, "Scoped Time Team One");
    const secondTeam = repo.createTeam(owner.id, "Scoped Time Team Two");

    expect(firstTeam.historyTimezoneKeys).toEqual(["gmt", "japan-tokyo"]);
    expect(secondTeam.historyTimezoneKeys).toEqual(["gmt", "japan-tokyo"]);
    repo.updateTeamSettings(secondTeam.id, { historyTimezoneKeys: ["gmt", "india-pune"] });

    expect(repo.getTeamState(firstTeam.id, owner.id).currentUser.historyTimezoneKeys).toBeNull();
    expect(repo.getTeamState(secondTeam.id, owner.id).team.historyTimezoneKeys).toEqual(["gmt", "india-pune"]);

    const firstPreference = repo.updateUserPreferences(owner.id, {
      teamId: firstTeam.id,
      historyTimezonePopupEnabled: false,
      historyTimezoneKeys: ["bulgaria-sofia"]
    });

    expect(firstPreference.historyTimezonePopupEnabled).toBe(false);
    expect(firstPreference.historyTimezoneKeys).toEqual(["bulgaria-sofia"]);
    expect(repo.getTeamState(firstTeam.id, owner.id).currentUser.historyTimezoneKeys).toEqual(["bulgaria-sofia"]);
    expect(repo.getTeamState(firstTeam.id, owner.id).memberships.find((team) => team.id === firstTeam.id)?.currentUserHistoryTimezoneKeys).toEqual([
      "bulgaria-sofia"
    ]);
    expect(repo.getTeamState(secondTeam.id, owner.id).currentUser.historyTimezoneKeys).toBeNull();
    expect(repo.getTeamState(secondTeam.id, owner.id).team.historyTimezoneKeys).toEqual(["gmt", "india-pune"]);

    repo.updateUserPreferences(owner.id, { teamId: firstTeam.id, historyTimezonePopupEnabled: true, historyTimezoneKeys: null });
    expect(repo.getTeamState(firstTeam.id, owner.id).currentUser.historyTimezoneKeys).toBeNull();
  });

  it("computes and stores a T-Shirt reveal average from the nearest average size", () => {
    const repo = new Repository(createTestConfig());
    const alice = repo.verifyLoginCode("alice-shirt@example-company.com", repo.requestLoginCode("alice-shirt@example-company.com").code, "Alice", "bear", "azure", undefined, "Password123!")!;
    const bob = repo.verifyLoginCode("bob-shirt@example-company.com", repo.requestLoginCode("bob-shirt@example-company.com").code, "Bob", "cat", "rose", undefined, "Password123!")!;
    const team = repo.createTeam(alice.id, "T-Shirt Team");
    repo.joinTeam(bob.id, team.id);
    repo.updateTeamSettings(team.id, { deckKey: "tshirt" });

    const round = repo.createRound(team.id, "TSHIRT-101");
    repo.castVote(round.id, alice.id, "M");
    repo.castVote(round.id, bob.id, "L");
    const revealed = repo.revealRound(round.id);

    expect(revealed.revealAverage).toBe("L");

    const history = repo.getHistory(team.id);
    expect(history[0]?.averageScore).toBe("L");
  });

  it("removes access when a user leaves a team and restores it on rejoin", () => {
    const repo = new Repository(createTestConfig());
    const ownerCode = repo.requestLoginCode("owner@example-company.com").code;
    const owner = repo.verifyLoginCode("owner@example-company.com", ownerCode, "Owner", "fox", "teal", undefined, "Password123!")!;
    const memberCode = repo.requestLoginCode("member@example-company.com").code;
    const member = repo.verifyLoginCode("member@example-company.com", memberCode, "Member", "owl", "gold", undefined, "Password123!")!;
    const team = repo.createTeam(owner.id, "Leave Team");

    repo.joinTeam(member.id, team.id);
    const round = repo.createRound(team.id, "LEAVE-101");
    repo.castVote(round.id, owner.id, "3");
    repo.revealRound(round.id);

    expect(repo.getTeamState(team.id, member.id).history).toHaveLength(1);

    repo.leaveTeam(member.id, team.id);
    expect(() => repo.getTeamState(team.id, member.id)).toThrowError("Forbidden");

    repo.joinTeam(member.id, team.id);
    expect(repo.getTeamState(team.id, member.id).history).toHaveLength(1);
  });

  it("supports password sign-in after initial code verification", () => {
    const repo = new Repository(createTestConfig());
    const code = repo.requestLoginCode("password-user@example-company.com").code;
    const verified = repo.verifyLoginCode("password-user@example-company.com", code, "Password User", "fox", "teal", undefined, "Password123!");

    expect(verified).not.toBeNull();
    expect(repo.verifyPasswordLogin("password-user@example-company.com", "Password123!")).not.toBeNull();
    expect(repo.verifyPasswordLogin("password-user@example-company.com", "WrongPass123!")).toBeNull();
  });

  it("lets an existing user change password only when the current password matches", () => {
    const repo = new Repository(createTestConfig());
    const code = repo.requestLoginCode("password-change@example-company.com").code;
    const verified = repo.verifyLoginCode("password-change@example-company.com", code, "Password Change", "fox", "teal", undefined, "Password123!")!;

    expect(() => repo.changeUserPassword(verified.id, "WrongPass123!", "BetterPass456!")).toThrowError("Current password is incorrect.");

    repo.changeUserPassword(verified.id, "Password123!", "BetterPass456!");

    expect(repo.verifyPasswordLogin("password-change@example-company.com", "Password123!")).toBeNull();
    expect(repo.verifyPasswordLogin("password-change@example-company.com", "BetterPass456!")).not.toBeNull();
  });

  it("issues first-time login codes with a 120-minute expiry window", () => {
    const repo = new Repository(createTestConfig());
    const beforeRequest = Date.now();
    const requested = repo.requestLoginCode("expiry-user@example-company.com");
    const afterRequest = Date.now();
    const expiresAt = new Date(requested.expiresAt).getTime();

    expect(expiresAt - beforeRequest).toBeGreaterThanOrEqual(119 * 60 * 1000);
    expect(expiresAt - afterRequest).toBeLessThanOrEqual(120 * 60 * 1000 + 5_000);
  });

  it("persists threaded history comments newest first and restricts edit/delete to the author", () => {
    const repo = new Repository(createTestConfig());
    const owner = repo.verifyLoginCode("comments-owner@example-company.com", repo.requestLoginCode("comments-owner@example-company.com").code, "Owner", "fox", "teal", undefined, "Password123!")!;
    const member = repo.verifyLoginCode("comments-member@example-company.com", repo.requestLoginCode("comments-member@example-company.com").code, "Member", "owl", "gold", undefined, "Password123!")!;
    const outsider = repo.verifyLoginCode("comments-outsider@example-company.com", repo.requestLoginCode("comments-outsider@example-company.com").code, "Outsider", "bear", "azure", undefined, "Password123!")!;
    const team = repo.createTeam(owner.id, "Comment Team");

    repo.joinTeam(member.id, team.id);
    const round = repo.createRound(team.id, "COMMENT-101");
    repo.castVote(round.id, owner.id, "5");
    repo.revealRound(round.id);
    const historyEntry = repo.getHistory(team.id)[0]!;

    const first = repo.addHistoryComment(team.id, historyEntry.id, owner.id, "Initial shared note");
    const second = repo.addHistoryComment(team.id, historyEntry.id, member.id, "Latest shared note");
    const updatedComment = repo.updateHistoryComment(team.id, historyEntry.id, first.id, owner.id, "Edited shared note");

    const updatedHistory = repo.getHistory(team.id)[0]!;
    expect(updatedHistory.comments.map((comment) => comment.body)).toEqual(["Latest shared note", "Edited shared note"]);
    expect(updatedComment.updatedAt).not.toBe(updatedComment.createdAt);
    expect(updatedHistory.comments.find((comment) => comment.id === first.id)?.body).toBe("Edited shared note");

    expect(() => repo.updateHistoryComment(team.id, historyEntry.id, second.id, outsider.id, "Nope")).toThrowError(
      "You can only edit or delete your own comments."
    );
    expect(() => repo.deleteHistoryComment(team.id, historyEntry.id, second.id, owner.id)).toThrowError(
      "You can only edit or delete your own comments."
    );

    repo.deleteHistoryComment(team.id, historyEntry.id, second.id, member.id);
    expect(repo.getHistory(team.id)[0]?.comments).toHaveLength(1);
  });

  it("persists a custom Fibonacci range on the team and stamps new rounds/history with that range", () => {
    const repo = new Repository(createTestConfig());
    const owner = repo.verifyLoginCode("range-owner@example-company.com", repo.requestLoginCode("range-owner@example-company.com").code, "Owner", "fox", "teal", undefined, "Password123!")!;
    const team = repo.createTeam(owner.id, "Range Team");

    const updated = repo.updateTeamSettings(team.id, {
      deckKey: "fibonacci",
      fibonacciRangeStart: "1",
      fibonacciRangeEnd: "13"
    });
    expect(updated.deckKey).toBe("fibonacci");
    expect(updated.fibonacciRangeStart).toBe("1");
    expect(updated.fibonacciRangeEnd).toBe("13");

    const round = repo.createRound(team.id, "RANGE-101");
    repo.castVote(round.id, owner.id, "13");
    repo.revealRound(round.id);

    const currentRound = repo.getRoundState(round.id)!;
    expect(currentRound.fibonacciRangeStart).toBe("1");
    expect(currentRound.fibonacciRangeEnd).toBe("13");

    const historyEntry = repo.getHistory(team.id)[0]!;
    expect(historyEntry.deckKey).toBe("fibonacci");
    expect(historyEntry.fibonacciRangeStart).toBe("1");
    expect(historyEntry.fibonacciRangeEnd).toBe("13");
  });

  it("allows any member to rename a team", () => {
    const repo = new Repository(createTestConfig());
    const owner = repo.verifyLoginCode("owner2@example-company.com", repo.requestLoginCode("owner2@example-company.com").code, "Owner", "fox", "teal", undefined, "Password123!")!;
    const member = repo.verifyLoginCode("member2@example-company.com", repo.requestLoginCode("member2@example-company.com").code, "Member", "owl", "gold", undefined, "Password123!")!;
    const team = repo.createTeam(owner.id, "Original Team");

    repo.joinTeam(member.id, team.id);
    const renamed = repo.updateTeamSettings(team.id, { name: "Renamed Team" });

    expect(renamed.name).toBe("Renamed Team");
    expect(renamed.slug).toContain("renamed-team");
  });

  it("persists team timer settings and stamps new rounds with timer metadata", () => {
    const repo = new Repository(createTestConfig());
    const owner = repo.verifyLoginCode("timer-owner@example-company.com", repo.requestLoginCode("timer-owner@example-company.com").code, "Timer Owner", "fox", "teal", undefined, "Password123!")!;
    const team = repo.createTeam(owner.id, "Timed Team");

    const updated = repo.updateTeamSettings(team.id, { timerSeconds: 30 });
    const round = repo.createRound(team.id, "TIMER-101");

    expect(updated.timerSeconds).toBe(30);
    expect(round.timerStartedAt).not.toBeNull();
    expect(round.timerExpiresAt).not.toBeNull();
    expect(new Date(round.timerExpiresAt!).getTime()).toBeGreaterThan(new Date(round.timerStartedAt!).getTime());
  });

  it("finds expired timed rounds and reveals them through the normal reveal path", () => {
    const repo = new Repository(createTestConfig());
    const owner = repo.verifyLoginCode("expired-owner@example-company.com", repo.requestLoginCode("expired-owner@example-company.com").code, "Expired Owner", "fox", "teal", undefined, "Password123!")!;
    const team = repo.createTeam(owner.id, "Expiry Team");
    repo.updateTeamSettings(team.id, { timerSeconds: 10 });

    const round = repo.createRound(team.id, "EXP-101");
    repo.castVote(round.id, owner.id, "5");

    const expired = repo.getExpiredTimedRounds("2999-01-01T00:00:00.000Z");
    expect(expired).toEqual([{ id: round.id, teamId: team.id }]);

    const revealed = repo.revealRound(round.id);
    expect(revealed.status).toBe("revealed");
    expect(revealed.timerExpiresAt).toBeNull();
    expect(repo.getHistory(team.id)[0]?.title).toBe("EXP-101");
  });

  it("starts a fresh timer when voting again from revealed timed history", () => {
    const repo = new Repository(createTestConfig());
    const owner = repo.verifyLoginCode("timed-again-owner@example-company.com", repo.requestLoginCode("timed-again-owner@example-company.com").code, "Timed Again Owner", "fox", "teal", undefined, "Password123!")!;
    const team = repo.createTeam(owner.id, "Timed Again Team");
    repo.updateTeamSettings(team.id, { timerSeconds: 30 });

    const round = repo.createRound(team.id, "TIMER-AGAIN");
    repo.castVote(round.id, owner.id, "5");
    const revealed = repo.revealRound(round.id);
    const historyEntry = repo.getHistory(team.id)[0]!;

    expect(revealed.timerStartedAt).not.toBeNull();
    expect(revealed.timerExpiresAt).toBeNull();

    const again = repo.createRound(team.id, historyEntry.title, historyEntry.id);

    expect(again.id).not.toBe(round.id);
    expect(again.status).toBe("active");
    expect(again.revoteHistoryEntryId).toBe(historyEntry.id);
    expect(again.timerStartedAt).not.toBeNull();
    expect(again.timerExpiresAt).not.toBeNull();
    expect(new Date(again.timerExpiresAt!).getTime()).toBeGreaterThan(new Date(again.timerStartedAt!).getTime());
    expect(again.votes).toHaveLength(0);
  });

  it("rejects late votes after reveal and keeps the revealed round plus history immutable", () => {
    const repo = new Repository(createTestConfig());
    const alice = repo.verifyLoginCode("late-alice@example-company.com", repo.requestLoginCode("late-alice@example-company.com").code, "Late Alice", "bear", "azure", undefined, "Password123!")!;
    const bob = repo.verifyLoginCode("late-bob@example-company.com", repo.requestLoginCode("late-bob@example-company.com").code, "Late Bob", "fox", "teal", undefined, "Password123!")!;
    const team = repo.createTeam(alice.id, "Reveal Lock Team");
    repo.joinTeam(bob.id, team.id);

    const round = repo.createRound(team.id, "LOCK-101");
    repo.castVote(round.id, alice.id, "3");
    repo.castVote(round.id, bob.id, "5");
    const revealed = repo.revealRound(round.id);
    const historyBeforeLateVote = repo.getHistory(team.id)[0]!;

    expect(revealed.revealAverage).toBe(4);
    expect(historyBeforeLateVote.averageScore).toBe(4);
    expect(historyBeforeLateVote.votes.map((vote) => vote.value)).toEqual(["3", "5"]);

    expect(() => repo.castVote(round.id, bob.id, "8")).toThrowError("Late votes are not accepted");

    const lockedRound = repo.getRoundState(round.id)!;
    const historyAfterLateVote = repo.getHistory(team.id)[0]!;

    expect(lockedRound.status).toBe("revealed");
    expect(lockedRound.revealAverage).toBe(4);
    expect(lockedRound.votes.map((vote) => vote.value)).toEqual(["3", "5"]);
    expect(historyAfterLateVote.averageScore).toBe(4);
    expect(historyAfterLateVote.votes.map((vote) => vote.value)).toEqual(["3", "5"]);
  });

  it("persists the expected revealed result across the full supported deck matrix", () => {
    const deckCases = [
      { deckKey: "fibonacci", votes: ["3", "5", "?", "coffee"], expectedAverage: 4, participantCount: 4 },
      { deckKey: "fibonacci-21", votes: ["3", "5", "8"], expectedAverage: 5.33, participantCount: 3 },
      { deckKey: "modified-fibonacci", votes: ["3", "8", "20"], expectedAverage: 10.33, participantCount: 3 },
      { deckKey: "linear-1-6", votes: ["1", "4", "6"], expectedAverage: 3.67, participantCount: 3 },
      { deckKey: "linear-1-8", votes: ["2", "4", "6", "8"], expectedAverage: 5, participantCount: 4 },
      { deckKey: "linear-1-10", votes: ["1", "5", "10", "coffee"], expectedAverage: 5.33, participantCount: 4 },
      { deckKey: "powers-of-two", votes: ["2", "8", "16", "?"], expectedAverage: 8.67, participantCount: 4 },
      { deckKey: "tshirt", votes: ["XS", "M", "L", "?", "coffee"], expectedAverage: "M", participantCount: 5 }
    ] as const;

    deckCases.forEach(({ deckKey, votes, expectedAverage, participantCount }, index) => {
      const repo = new Repository(createTestConfig());
      const users = Array.from({ length: votes.length }, (_, userIndex) =>
        repo.verifyLoginCode(
          `matrix-${deckKey}-${index}-${userIndex}@example-company.com`,
          repo.requestLoginCode(`matrix-${deckKey}-${index}-${userIndex}@example-company.com`).code,
          `User ${userIndex + 1}`,
          "bear",
          "azure",
          undefined,
          "Password123!"
        )!
      );
      const owner = users[0]!;
      const team = repo.createTeam(owner.id, `Deck Matrix ${deckKey} ${index}`);
      for (const user of users.slice(1)) {
        repo.joinTeam(user.id, team.id);
      }
      repo.updateTeamSettings(team.id, { deckKey });

      const round = repo.createRound(team.id, `MATRIX-${deckKey.toUpperCase()}-${index}`);
      votes.forEach((value, voteIndex) => {
        repo.castVote(round.id, users[voteIndex]!.id, value);
      });

      const revealed = repo.revealRound(round.id);
      const historyEntry = repo.getHistory(team.id)[0]!;

      expect(revealed.revealAverage, `revealed average for ${deckKey}`).toBe(expectedAverage);
      expect(historyEntry.averageScore, `stored average for ${deckKey}`).toBe(expectedAverage);
      expect(historyEntry.deckKey, `stored deck for ${deckKey}`).toBe(deckKey);
      expect(historyEntry.participantCount, `participant count for ${deckKey}`).toBe(participantCount);
      expect(historyEntry.votes.map((vote) => vote.value), `stored votes for ${deckKey}`).toEqual(votes);
    });
  });

  it("creates approval-based join requests and promotes the creator to team-admin", () => {
    const repo = new Repository(createTestConfig());
    const owner = repo.verifyLoginCode("owner-admin@example-company.com", repo.requestLoginCode("owner-admin@example-company.com").code, "Owner", "fox", "teal", undefined, "Password123!")!;
    const requester = repo.verifyLoginCode("requester@example-company.com", repo.requestLoginCode("requester@example-company.com").code, "Requester", "owl", "gold", undefined, "Password123!")!;
    const team = repo.createTeam(owner.id, "Approval Team");

    expect(repo.getTeamUserRole(owner.id, team.id)).toBe("team_admin");

    const request = repo.requestTeamJoin(requester.id, team.id);
    const requesterTeams = repo.getTeamsForUser(requester.id);

    expect(request.teamId).toBe(team.id);
    expect(requesterTeams.availableTeams.find((entry) => entry.id === team.id)?.joinRequestStatus).toBe("pending");
    expect(repo.getNotificationFeed(owner.id).pendingJoinRequests).toHaveLength(1);

    repo.approveJoinRequest(owner.id, team.id, request.id);

    expect(repo.getTeamUserRole(requester.id, team.id)).toBe("member");
    expect(repo.getNotificationFeed(requester.id).active.map((item) => item.kind)).toContain("team_join_request_admitted");
  });

  it("allows denied users to request again and records the denial in notifications", () => {
    const repo = new Repository(createTestConfig());
    const owner = repo.verifyLoginCode("deny-owner@example-company.com", repo.requestLoginCode("deny-owner@example-company.com").code, "Owner", "fox", "teal", undefined, "Password123!")!;
    const requester = repo.verifyLoginCode("deny-user@example-company.com", repo.requestLoginCode("deny-user@example-company.com").code, "Denied", "owl", "gold", undefined, "Password123!")!;
    const team = repo.createTeam(owner.id, "Denial Team");

    const firstRequest = repo.requestTeamJoin(requester.id, team.id);
    repo.denyJoinRequest(owner.id, team.id, firstRequest.id);

    expect(repo.getNotificationFeed(requester.id).active.map((item) => item.kind)).toContain("team_join_request_denied");
    expect(repo.getTeamsForUser(requester.id).availableTeams.find((entry) => entry.id === team.id)?.joinRequestStatus).toBe("none");

    const secondRequest = repo.requestTeamJoin(requester.id, team.id);

    expect(secondRequest.id).not.toBe(firstRequest.id);
    expect(repo.getNotificationFeed(owner.id).pendingJoinRequests).toHaveLength(1);
  });

  it("supports super-admin archive control and keeps archived teams visible but read-only for new access", () => {
    const config = createTestConfig();
    const repo = new Repository(config);
    const superAdmin = repo.verifySuperAdminLogin(config.superAdminUsername, config.superAdminPassword)!;
    const owner = repo.verifyLoginCode("archive-owner@example-company.com", repo.requestLoginCode("archive-owner@example-company.com").code, "Owner", "fox", "teal", undefined, "Password123!")!;
    const member = repo.verifyLoginCode("archive-member@example-company.com", repo.requestLoginCode("archive-member@example-company.com").code, "Member", "owl", "gold", undefined, "Password123!")!;
    const outsider = repo.verifyLoginCode("archive-outsider@example-company.com", repo.requestLoginCode("archive-outsider@example-company.com").code, "Outsider", "bear", "azure", undefined, "Password123!")!;
    const team = repo.createTeam(owner.id, "Archived Team");
    repo.joinTeam(member.id, team.id);

    repo.setTeamArchived(superAdmin.id, team.id, true);

    expect(repo.getTeam(team.id)?.archived).toBe(true);
    expect(repo.getTeamState(team.id, member.id).team.archived).toBe(true);
    expect(() => repo.requestTeamJoin(outsider.id, team.id)).toThrowError("Archived teams are read-only");

    repo.setTeamArchived(superAdmin.id, team.id, false);
    expect(repo.getTeam(team.id)?.archived).toBe(false);
  });

  it("blocks duplicate team names even when the existing team is archived", () => {
    const repo = new Repository(createTestConfig());
    const owner = repo.verifyLoginCode("unique-owner@example-company.com", repo.requestLoginCode("unique-owner@example-company.com").code, "Owner", "fox", "teal", undefined, "Password123!")!;
    const firstTeam = repo.createTeam(owner.id, "Unique Team");
    repo.setTeamArchived(owner.id, firstTeam.id, true);

    expect(() => repo.createTeam(owner.id, " unique team ")).toThrowError("A team with this name already exists in this workspace.");
  });


  it("keeps the super-admin as a real member of every existing and newly created team", () => {
    const config = createTestConfig();
    const repo = new Repository(config);
    const superAdmin = repo.verifySuperAdminLogin(config.superAdminUsername, config.superAdminPassword)!;
    const owner = repo.verifyLoginCode("owner-universal@example-company.com", repo.requestLoginCode("owner-universal@example-company.com").code, "Owner", "fox", "teal", undefined, "Password123!")!;
    const firstTeam = repo.createTeam(owner.id, "Universal Team");
    const secondTeam = repo.createTeam(owner.id, "Universal Team Two");

    expect(repo.isTeamMember(superAdmin.id, firstTeam.id)).toBe(true);
    expect(repo.getTeamUserRole(superAdmin.id, firstTeam.id)).toBe("team_admin");
    expect(repo.isTeamMember(superAdmin.id, secondTeam.id)).toBe(true);
    expect(repo.getTeamsForUser(superAdmin.id).memberships.map((team) => team.id).sort()).toEqual([firstTeam.id, secondTeam.id].sort());
    expect(() => repo.leaveTeam(superAdmin.id, firstTeam.id)).toThrowError("The super-admin always remains a member of every team.");
    expect(() => repo.removeTeamMember(owner.id, firstTeam.id, superAdmin.id)).toThrowError("The super-admin always remains a member of every team.");
  });

  it("creates a default workspace and assigns newly created teams to it without changing current team behavior", () => {
    const config = createTestConfig();
    const repo = new Repository(config);
    const superAdmin = repo.verifySuperAdminLogin(config.superAdminUsername, config.superAdminPassword)!;
    const owner = repo.verifyLoginCode("workspace-owner@example-company.com", repo.requestLoginCode("workspace-owner@example-company.com").code, "Owner", "fox", "teal", undefined, "Password123!")!;

    const defaultWorkspace = repo.getDefaultWorkspace();
    const team = repo.createTeam(owner.id, "Workspace Team");

    expect(defaultWorkspace.id).toBe("default-workspace");
    expect(defaultWorkspace.name).toBe("Default Workspace");
    expect(repo.getWorkspaceForTeam(team.id)).toEqual(expect.objectContaining({ id: defaultWorkspace.id }));
    expect(repo.getWorkspaceMembershipRole(owner.id, defaultWorkspace.id)).toBe("admin");
    expect(repo.getWorkspaceMembershipRole(superAdmin.id, defaultWorkspace.id)).toBe("owner");
    expect(repo.getTeamsForUser(owner.id).memberships.map((membership) => membership.id)).toContain(team.id);
  });

  it("enforces public trial workspace team, user, and monthly reveal limits", () => {
    const repo = new Repository(
      createTestConfig({
        publicTrial: {
          enabled: true,
          mode: "open_signup",
          maxTeamsPerWorkspace: 2,
          maxUsersPerWorkspace: 2,
          maxRevealedRoundsPerWorkspacePerMonth: 1,
          maxSignupRequestsPerIpPerHour: 3,
          maxCodeRequestsPerEmailPerDay: 5,
          maxInvitesPerWorkspacePerDay: 10,
          maxWorkspaceCreationsPerIpPerDay: 2,
          maxLoginAttemptsPerEmailPerHour: 10
        }
      })
    );
    const email = "trial-limits@gmail.com";
    const signup = repo.completePublicTrialSignup({
      email,
      code: repo.requestLoginCode(email).code,
      displayName: "Trial Limits",
      avatarIconKey: "bear",
      avatarColorKey: "azure",
      password: "Password123!",
      acceptedTermsVersion: repo.getPublicTrialTermsVersion()
    })!;

    expect(repo.createTeam(signup.user.id, "Second Trial Team").name).toBe("Second Trial Team");
    expect(() => repo.createTeam(signup.user.id, "Third Trial Team")).toThrowError("Public trial workspaces can have at most 2 teams.");

    const inviteResult = repo.addTeamMemberByEmail(signup.user.id, signup.team.id, "trial-member@gmail.com");
    expect(inviteResult.invitedNewUser).toBe(true);
    expect(() => repo.addTeamMemberByEmail(signup.user.id, signup.team.id, "trial-member-two@gmail.com")).toThrowError(
      "Public trial workspaces can have at most 2 users."
    );

    const firstRound = repo.createRound(signup.team.id, "Monthly Cap 1");
    repo.castVote(firstRound.id, signup.user.id, "5");
    expect(repo.revealRound(firstRound.id).status).toBe("revealed");

    const secondRound = repo.createRound(signup.team.id, "Monthly Cap 2");
    repo.castVote(secondRound.id, signup.user.id, "8");
    expect(() => repo.revealRound(secondRound.id)).toThrowError("Public trial workspaces can reveal at most 1 rounds per month.");
  });

  it("deactivates a retained-workspace account, preserves attributed history, and frees the email", () => {
    const repo = new Repository(createTestConfig());
    const owner = repo.verifyLoginCode(
      "delete-owner@example-company.com",
      repo.requestLoginCode("delete-owner@example-company.com").code,
      "Delete Owner",
      "fox",
      "teal",
      undefined,
      "Password123!"
    )!;
    const memberEmail = "delete-member@example-company.com";
    const member = repo.verifyLoginCode(
      memberEmail,
      repo.requestLoginCode(memberEmail).code,
      "John Doe",
      "owl",
      "gold",
      undefined,
      "Password123!"
    )!;
    const team = repo.createTeam(owner.id, "Retained Delete Team");
    repo.joinTeam(member.id, team.id);
    const round = repo.createRound(team.id, "DELETE-RETAINED-001");
    repo.castVote(round.id, member.id, "8");
    repo.revealRound(round.id);
    const historyEntry = repo.getHistory(team.id)[0]!;
    repo.addHistoryComment(team.id, historyEntry.id, member.id, "Retained comment");

    const preview = repo.getOwnAccountDeletionPreview(member.id);
    expect(preview).toMatchObject({
      mode: "deactivate_account",
      confirmationPhrase: "DELETE MY ACCOUNT",
      ownedPublicTrialWorkspaces: []
    });
    expect(() => repo.deleteOwnAccount(member.id, "Password123!", "wrong", preview.impactToken)).toThrowError('Type "DELETE MY ACCOUNT"');
    expect(repo.verifyPasswordLogin(memberEmail, "Password123!")).not.toBeNull();

    const result = repo.deleteOwnAccount(member.id, "Password123!", "DELETE MY ACCOUNT", preview.impactToken);
    expect(result).toMatchObject({ mode: "deactivate_account", purgedWorkspaceIds: [], purgedTeamIds: [] });
    expect(repo.verifyPasswordLogin(memberEmail, "Password123!")).toBeNull();
    expect(repo.getUserByEmail(memberEmail)).toBeNull();
    expect(repo.getPlatformUsers().map((user) => user.id)).not.toContain(member.id);
    expect(repo.getTeamsForUser(member.id).memberships).toHaveLength(0);

    const retainedHistory = repo.getHistory(team.id)[0]!;
    expect(retainedHistory.votes).toEqual([expect.objectContaining({ userId: member.id, displayName: "John Doe (Deactivated)", value: "8" })]);
    expect(retainedHistory.comments[0]).toMatchObject({
      author: expect.objectContaining({ id: member.id, email: "", displayName: "John Doe (Deactivated)" }),
      authorSignature: "John Doe (Deactivated)",
      body: "Retained comment"
    });
    expect(retainedHistory.comments[0]?.author.email).not.toBe(memberEmail);

    const replacement = repo.verifyLoginCode(
      memberEmail,
      repo.requestLoginCode(memberEmail).code,
      "John Doe Fresh",
      "bear",
      "azure",
      undefined,
      "FreshPassword123!"
    )!;
    expect(replacement.id).not.toBe(member.id);
    expect(repo.getTeamsForUser(replacement.id).memberships.map((membership) => membership.id)).not.toContain(team.id);
  });

  it("purges only owned public-trial workspaces before deactivating their owner", () => {
    const publicTrial = {
      enabled: true,
      mode: "open_signup" as const,
      maxTeamsPerWorkspace: 2,
      maxUsersPerWorkspace: 10,
      maxRevealedRoundsPerWorkspacePerMonth: 40,
      maxSignupRequestsPerIpPerHour: 3,
      maxCodeRequestsPerEmailPerDay: 5,
      maxInvitesPerWorkspacePerDay: 10,
      maxWorkspaceCreationsPerIpPerDay: 2,
      maxLoginAttemptsPerEmailPerHour: 10
    };
    const repo = new Repository(createTestConfig({ publicTrial }));
    const ownerEmail = "delete-trial-owner@gmail.com";
    const owner = repo.completePublicTrialSignup({
      email: ownerEmail,
      code: repo.requestLoginCode(ownerEmail).code,
      displayName: "Trial Delete Owner",
      avatarIconKey: "bear",
      avatarColorKey: "azure",
      password: "Password123!",
      acceptedTermsVersion: repo.getPublicTrialTermsVersion()
    })!;
    const stalePreview = repo.getOwnAccountDeletionPreview(owner.user.id);
    const collaboratorInvite = repo.addTeamMemberByEmail(owner.user.id, owner.team.id, "delete-trial-collaborator@gmail.com");
    const collaborator = collaboratorInvite.user;
    const secondTeam = repo.createTeam(owner.user.id, "Second Trial Team");
    const round = repo.createRound(secondTeam.id, "DELETE-PURGE-001");
    repo.castVote(round.id, owner.user.id, "5");
    repo.revealRound(round.id);

    const unrelatedEmail = "delete-unrelated-owner@gmail.com";
    const unrelated = repo.completePublicTrialSignup({
      email: unrelatedEmail,
      code: repo.requestLoginCode(unrelatedEmail).code,
      displayName: "Unrelated Owner",
      avatarIconKey: "owl",
      avatarColorKey: "gold",
      password: "Password123!",
      acceptedTermsVersion: repo.getPublicTrialTermsVersion()
    })!;

    const preview = repo.getOwnAccountDeletionPreview(owner.user.id);
    expect(preview).toMatchObject({
      mode: "purge_trial_workspaces",
      confirmationPhrase: "DELETE MY WORKSPACE",
      ownedPublicTrialWorkspaces: [expect.objectContaining({ id: owner.workspace.id, teamCount: 2, memberCount: 2, historyEntryCount: 1 })]
    });

    expect(() => repo.deleteOwnAccount(owner.user.id, "Password123!", "DELETE MY WORKSPACE", stalePreview.impactToken)).toThrowError(
      "Account deletion impact changed."
    );
    expect(repo.getWorkspaceForTeam(owner.team.id)?.id).toBe(owner.workspace.id);

    const result = repo.deleteOwnAccount(owner.user.id, "Password123!", "DELETE MY WORKSPACE", preview.impactToken);
    expect(result.mode).toBe("purge_trial_workspaces");
    expect(result.purgedWorkspaceIds).toEqual([owner.workspace.id]);
    expect(result.purgedTeamIds.sort()).toEqual([owner.team.id, secondTeam.id].sort());
    expect(repo.getWorkspaceForTeam(owner.team.id)).toBeNull();
    expect(repo.getTeamsForUser(collaborator.id).memberships).toHaveLength(0);
    expect(repo.getUserByEmail(collaborator.email)?.id).toBe(collaborator.id);
    expect(repo.verifyPasswordLogin(collaborator.email, collaboratorInvite.temporaryPassword!)).not.toBeNull();
    expect(repo.getWorkspaceForTeam(unrelated.team.id)?.id).toBe(unrelated.workspace.id);
    expect(repo.getTeamsForUser(unrelated.user.id).memberships.map((team) => team.id)).toContain(unrelated.team.id);

    const fresh = repo.completePublicTrialSignup({
      email: ownerEmail,
      code: repo.requestLoginCode(ownerEmail).code,
      displayName: "Fresh Trial Owner",
      avatarIconKey: "bear",
      avatarColorKey: "azure",
      password: "FreshPassword123!",
      acceptedTermsVersion: repo.getPublicTrialTermsVersion()
    })!;
    expect(fresh.user.id).not.toBe(owner.user.id);
    expect(fresh.workspace.id).not.toBe(owner.workspace.id);
  });

  it("allows only the super-admin to delete another account and never allows deleting the super-admin", () => {
    const config = createTestConfig();
    const repo = new Repository(config);
    const superAdmin = repo.verifySuperAdminLogin(config.superAdminUsername, config.superAdminPassword)!;
    const actor = repo.verifyLoginCode(
      "delete-actor@example-company.com",
      repo.requestLoginCode("delete-actor@example-company.com").code,
      "Delete Actor",
      "fox",
      "teal",
      undefined,
      "Password123!"
    )!;
    const targetEmail = "delete-target@example-company.com";
    const target = repo.verifyLoginCode(
      targetEmail,
      repo.requestLoginCode(targetEmail).code,
      "Delete Target",
      "owl",
      "gold",
      undefined,
      "Password123!"
    )!;

    expect(() => repo.deletePlatformUser(actor.id, target.id, targetEmail, "")).toThrowError("Only the super-admin can perform this action.");
    expect(() => repo.deleteOwnAccount(superAdmin.id, config.superAdminPassword, "DELETE MY ACCOUNT", "")).toThrowError(
      "The super-admin account cannot be deleted."
    );
    expect(() => repo.deletePlatformUser(superAdmin.id, superAdmin.id, superAdmin.email, "")).toThrowError("The super-admin account cannot be deleted.");
    const preview = repo.getPlatformUserDeletionPreview(superAdmin.id, target.id);
    expect(preview).toMatchObject({
      confirmationPhrase: targetEmail,
      mode: "deactivate_account"
    });
    expect(() => repo.deletePlatformUser(superAdmin.id, target.id, "wrong", preview.impactToken)).toThrowError(`Type "${targetEmail}"`);

    expect(repo.deletePlatformUser(superAdmin.id, target.id, targetEmail, preview.impactToken)).toMatchObject({
      deletedUserId: target.id,
      mode: "deactivate_account"
    });
    expect(repo.getUserByEmail(targetEmail)).toBeNull();
  });

  it("keeps unrelated public trial workspaces out of team lists and member search", () => {
    const repo = new Repository(
      createTestConfig({
        publicTrial: {
          enabled: true,
          mode: "open_signup",
          maxTeamsPerWorkspace: 2,
          maxUsersPerWorkspace: 10,
          maxRevealedRoundsPerWorkspacePerMonth: 40,
          maxSignupRequestsPerIpPerHour: 3,
          maxCodeRequestsPerEmailPerDay: 5,
          maxInvitesPerWorkspacePerDay: 10,
          maxWorkspaceCreationsPerIpPerDay: 2,
          maxLoginAttemptsPerEmailPerHour: 10
        }
      })
    );
    const firstEmail = "trial-private-a@gmail.com";
    const first = repo.completePublicTrialSignup({
      email: firstEmail,
      code: repo.requestLoginCode(firstEmail).code,
      displayName: "Trial Private A",
      avatarIconKey: "bear",
      avatarColorKey: "azure",
      password: "Password123!",
      acceptedTermsVersion: repo.getPublicTrialTermsVersion()
    })!;
    const secondEmail = "trial-private-b@gmail.com";
    const second = repo.completePublicTrialSignup({
      email: secondEmail,
      code: repo.requestLoginCode(secondEmail).code,
      displayName: "Trial Private B",
      avatarIconKey: "owl",
      avatarColorKey: "gold",
      password: "Password123!",
      acceptedTermsVersion: repo.getPublicTrialTermsVersion()
    })!;

    expect(repo.getTeamsForUser(first.user.id).availableTeams.map((team) => team.id)).toEqual([first.team.id]);
    expect(repo.getTeamsForUser(second.user.id).availableTeams.map((team) => team.id)).toEqual([second.team.id]);
    expect(repo.searchTeamMemberCandidates(first.team.id, "trial-private-b")).toEqual([]);
    expect(repo.searchTeamMemberCandidates(second.team.id, "trial-private-a")).toEqual([]);
  });

  it("stores pending platform access requests and lets the super-admin admit them into real accounts", () => {
    const config = createTestConfig();
    const repo = new Repository(config);
    const superAdmin = repo.verifySuperAdminLogin(config.superAdminUsername, config.superAdminPassword)!;

    const request = repo.requestPlatformAccess("waiting.user@example-company.com");
    expect(repo.getPlatformAccessRequests()).toEqual([
      expect.objectContaining({
        id: request.id,
        email: "waiting.user@example-company.com"
      })
    ]);
    expect(repo.getNotificationFeed(superAdmin.id).platformAccessRequests).toEqual([
      expect.objectContaining({
        id: request.id,
        email: "waiting.user@example-company.com"
      })
    ]);

    const admitted = repo.admitPlatformAccessRequest(superAdmin.id, request.id);
    expect(admitted.invitedNewUser).toBe(true);
    expect(admitted.temporaryPassword).toBeTruthy();
    expect(repo.verifyPasswordLogin("waiting.user@example-company.com", admitted.temporaryPassword)).not.toBeNull();
    expect(repo.getPlatformAccessRequests()).toHaveLength(0);
    expect(repo.getPlatformUsers().map((user) => user.email)).toContain("waiting.user@example-company.com");
  });

  it("can invite a new allowlisted email directly into a team and lets them sign in with the generated password", () => {
    const repo = new Repository(createTestConfig());
    const owner = repo.verifyLoginCode("invite-owner@example-company.com", repo.requestLoginCode("invite-owner@example-company.com").code, "Owner", "fox", "teal", undefined, "Password123!")!;
    const team = repo.createTeam(owner.id, "Invite Team");

    const invited = repo.addTeamMemberByEmail(owner.id, team.id, "brand.new@example-company.com");

    expect(invited.invitedNewUser).toBe(true);
    expect(invited.temporaryPassword).toBeTruthy();
    expect(repo.verifyPasswordLogin("brand.new@example-company.com", invited.temporaryPassword!)).not.toBeNull();
    expect(repo.getTeamUserRole(invited.user.id, team.id)).toBe("member");
    expect(repo.getWorkspaceMembershipRole(invited.user.id, repo.getWorkspaceForTeam(team.id)!.id)).toBe("member");
  });

  it("auto-resolves a matching pending platform access request when a team admin directly adds the same email to a team", () => {
    const config = createTestConfig();
    const repo = new Repository(config);
    const owner = repo.verifyLoginCode("owner-auto-resolve@example-company.com", repo.requestLoginCode("owner-auto-resolve@example-company.com").code, "Owner", "fox", "teal", undefined, "Password123!")!;
    const superAdmin = repo.verifySuperAdminLogin(config.superAdminUsername, config.superAdminPassword)!;
    const team = repo.createTeam(owner.id, "Auto Resolve Team");

    const request = repo.requestPlatformAccess("pending.resolve@example-company.com");
    expect(repo.getNotificationFeed(superAdmin.id).platformAccessRequests.map((item) => item.id)).toContain(request.id);

    const invited = repo.addTeamMemberByEmail(owner.id, team.id, "pending.resolve@example-company.com");

    expect(invited.invitedNewUser).toBe(true);
    expect(repo.getPlatformAccessRequests()).toHaveLength(0);
    expect(repo.getNotificationFeed(superAdmin.id).platformAccessRequests).toHaveLength(0);
    expect(repo.getPlatformUsers().map((user) => user.email)).toContain("pending.resolve@example-company.com");
  });

  it("lets a team admin add existing users, promote members, and remove regular members with notifications", () => {
    const repo = new Repository(createTestConfig());
    const owner = repo.verifyLoginCode("team-admin-owner@example-company.com", repo.requestLoginCode("team-admin-owner@example-company.com").code, "Owner", "fox", "teal", undefined, "Password123!")!;
    const promotedUser = repo.verifyLoginCode("promoted-user@example-company.com", repo.requestLoginCode("promoted-user@example-company.com").code, "Promoted", "owl", "gold", undefined, "Password123!")!;
    const removedUser = repo.verifyLoginCode("removed-user@example-company.com", repo.requestLoginCode("removed-user@example-company.com").code, "Removed", "bear", "azure", undefined, "Password123!")!;
    const team = repo.createTeam(owner.id, "Managed Team");

    repo.addTeamMemberByEmail(owner.id, team.id, promotedUser.email);
    expect(repo.getTeamUserRole(promotedUser.id, team.id)).toBe("member");
    expect(repo.getNotificationFeed(promotedUser.id).active.map((item) => item.kind)).toContain("team_added_to_team");

    repo.promoteTeamMember(owner.id, team.id, promotedUser.id);
    expect(repo.getTeamUserRole(promotedUser.id, team.id)).toBe("team_admin");

    repo.addTeamMemberByEmail(owner.id, team.id, removedUser.email);
    expect(repo.getTeamUserRole(removedUser.id, team.id)).toBe("member");

    repo.removeTeamMember(owner.id, team.id, removedUser.id);
    expect(repo.getTeamUserRole(removedUser.id, team.id)).toBe("none");
    expect(repo.getNotificationFeed(removedUser.id).active.map((item) => item.kind)).toContain("team_removed_from_team");
  });

  it("prevents team admins from demoting or removing other team admins while allowing the super-admin to do both", () => {
    const config = createTestConfig();
    const repo = new Repository(config);
    const superAdmin = repo.verifySuperAdminLogin(config.superAdminUsername, config.superAdminPassword)!;
    const owner = repo.verifyLoginCode("owner-demote@example-company.com", repo.requestLoginCode("owner-demote@example-company.com").code, "Owner", "fox", "teal", undefined, "Password123!")!;
    const otherAdmin = repo.verifyLoginCode("other-admin@example-company.com", repo.requestLoginCode("other-admin@example-company.com").code, "Other Admin", "owl", "gold", undefined, "Password123!")!;
    const team = repo.createTeam(owner.id, "Admin Ladder");

    repo.joinTeam(otherAdmin.id, team.id);
    repo.promoteTeamMember(owner.id, team.id, otherAdmin.id);
    expect(repo.getTeamUserRole(otherAdmin.id, team.id)).toBe("team_admin");

    expect(() => repo.demoteTeamAdmin(owner.id, team.id, otherAdmin.id)).toThrowError("Only the super-admin can perform this action.");
    expect(() => repo.removeTeamMember(owner.id, team.id, otherAdmin.id)).toThrowError("Only the super-admin can perform this action.");

    repo.demoteTeamAdmin(superAdmin.id, team.id, otherAdmin.id);
    expect(repo.getTeamUserRole(otherAdmin.id, team.id)).toBe("member");

    repo.removeTeamMember(superAdmin.id, team.id, otherAdmin.id);
    expect(repo.getTeamUserRole(otherAdmin.id, team.id)).toBe("none");
  });

  it("prevents regular members from using team-admin membership controls", () => {
    const repo = new Repository(createTestConfig());
    const owner = repo.verifyLoginCode("owner-controls@example-company.com", repo.requestLoginCode("owner-controls@example-company.com").code, "Owner", "fox", "teal", undefined, "Password123!")!;
    const regularMember = repo.verifyLoginCode("regular-controls@example-company.com", repo.requestLoginCode("regular-controls@example-company.com").code, "Regular", "owl", "gold", undefined, "Password123!")!;
    const requester = repo.verifyLoginCode("request-controls@example-company.com", repo.requestLoginCode("request-controls@example-company.com").code, "Requester", "bear", "azure", undefined, "Password123!")!;
    const team = repo.createTeam(owner.id, "Permissions Team");

    repo.joinTeam(regularMember.id, team.id);
    const request = repo.requestTeamJoin(requester.id, team.id);

    expect(() => repo.approveJoinRequest(regularMember.id, team.id, request.id)).toThrowError("Only team admins can manage membership for this team.");
    expect(() => repo.addTeamMemberByEmail(regularMember.id, team.id, "someone@example-company.com")).toThrowError("Only team admins can manage membership for this team.");
    expect(() => repo.promoteTeamMember(regularMember.id, team.id, owner.id)).toThrowError("Only team admins can manage membership for this team.");
  });

  it("shows all pending join requests to the super-admin and moves seen notifications into history", () => {
    const config = createTestConfig();
    const repo = new Repository(config);
    const superAdmin = repo.verifySuperAdminLogin(config.superAdminUsername, config.superAdminPassword)!;
    const ownerA = repo.verifyLoginCode("owner-a@example-company.com", repo.requestLoginCode("owner-a@example-company.com").code, "Owner A", "fox", "teal", undefined, "Password123!")!;
    const ownerB = repo.verifyLoginCode("owner-b@example-company.com", repo.requestLoginCode("owner-b@example-company.com").code, "Owner B", "owl", "gold", undefined, "Password123!")!;
    const requesterA = repo.verifyLoginCode("requester-a@example-company.com", repo.requestLoginCode("requester-a@example-company.com").code, "Requester A", "bear", "azure", undefined, "Password123!")!;
    const requesterB = repo.verifyLoginCode("requester-b@example-company.com", repo.requestLoginCode("requester-b@example-company.com").code, "Requester B", "cat", "rose", undefined, "Password123!")!;
    const teamA = repo.createTeam(ownerA.id, "Team A");
    const teamB = repo.createTeam(ownerB.id, "Team B");

    repo.requestTeamJoin(requesterA.id, teamA.id);
    const requestB = repo.requestTeamJoin(requesterB.id, teamB.id);

    const superAdminFeed = repo.getNotificationFeed(superAdmin.id);
    expect(superAdminFeed.pendingJoinRequests).toHaveLength(2);
    expect(superAdminFeed.pendingJoinRequests.map((request) => request.teamId).sort()).toEqual([teamA.id, teamB.id].sort());

    repo.approveJoinRequest(ownerB.id, teamB.id, requestB.id);
    expect(repo.getNotificationFeed(requesterB.id).active.map((item) => item.kind)).toContain("team_join_request_admitted");

    repo.markNotificationsSeen(requesterB.id);
    const requesterFeed = repo.getNotificationFeed(requesterB.id);
    expect(requesterFeed.active).toHaveLength(0);
    expect(requesterFeed.history.map((item) => item.kind)).toContain("team_join_request_admitted");
    expect(requesterFeed.history[0]?.seenAt).toBeTruthy();
  });

  it("supports a lighter notification feed without seen-history and admin-history payloads", () => {
    const config = createTestConfig();
    const repo = new Repository(config);
    const superAdmin = repo.verifySuperAdminLogin(config.superAdminUsername, config.superAdminPassword)!;
    const owner = repo.verifyLoginCode("feed-owner@example-company.com", repo.requestLoginCode("feed-owner@example-company.com").code, "Owner", "fox", "teal", undefined, "Password123!")!;
    const requester = repo.verifyLoginCode("feed-requester@example-company.com", repo.requestLoginCode("feed-requester@example-company.com").code, "Requester", "owl", "gold", undefined, "Password123!")!;
    const team = repo.createTeam(owner.id, "Feed Team");
    const request = repo.requestTeamJoin(requester.id, team.id);

    repo.approveJoinRequest(owner.id, team.id, request.id);
    repo.markNotificationsSeen(requester.id);

    const fullFeed = repo.getNotificationFeed(superAdmin.id, team.id);
    const summaryFeed = repo.getNotificationFeed(superAdmin.id, team.id, {
      includeSeenHistory: false,
      includeActionHistory: false
    });

    expect(fullFeed.pendingJoinRequests).toHaveLength(0);
    expect(fullFeed.adminHistory?.items.length ?? 0).toBeGreaterThan(0);
    expect(summaryFeed.history).toEqual([]);
    expect(summaryFeed.adminHistory).toBeNull();
    expect(summaryFeed.platformAccessRequests).toEqual(fullFeed.platformAccessRequests);
    expect(summaryFeed.active).toEqual(fullFeed.active);
  });

  it("keeps archived teams readable for members but blocks all write-style team-admin actions until unarchived", () => {
    const config = createTestConfig();
    const repo = new Repository(config);
    const superAdmin = repo.verifySuperAdminLogin(config.superAdminUsername, config.superAdminPassword)!;
    const owner = repo.verifyLoginCode("archived-owner-2@example-company.com", repo.requestLoginCode("archived-owner-2@example-company.com").code, "Owner", "fox", "teal", undefined, "Password123!")!;
    const member = repo.verifyLoginCode("archived-member-2@example-company.com", repo.requestLoginCode("archived-member-2@example-company.com").code, "Member", "owl", "gold", undefined, "Password123!")!;
    const newcomer = repo.verifyLoginCode("archived-newcomer@example-company.com", repo.requestLoginCode("archived-newcomer@example-company.com").code, "Newcomer", "bear", "azure", undefined, "Password123!")!;
    const team = repo.createTeam(owner.id, "Frozen Team");

    repo.joinTeam(member.id, team.id);
    const round = repo.createRound(team.id, "ARCH-101");
    repo.castVote(round.id, owner.id, "5");
    repo.revealRound(round.id);

    repo.setTeamArchived(superAdmin.id, team.id, true);
    const memberState = repo.getTeamState(team.id, member.id);
    expect(memberState.team.archived).toBe(true);
    expect(memberState.history).toHaveLength(1);

    expect(() => repo.addTeamMemberByEmail(owner.id, team.id, newcomer.email)).toThrowError(
      "Archived teams are read-only until a team admin or the super-admin unarchives them."
    );
    expect(() => repo.requestTeamJoin(newcomer.id, team.id)).toThrowError("Archived teams are read-only");
    expect(() => repo.promoteTeamMember(owner.id, team.id, member.id)).toThrowError(
      "Archived teams are read-only until a team admin or the super-admin unarchives them."
    );
  });

  it("lets a team-admin archive and unarchive the same team", () => {
    const repo = new Repository(createTestConfig());
    const owner = repo.verifyLoginCode("archive-admin@example-company.com", repo.requestLoginCode("archive-admin@example-company.com").code, "Owner", "fox", "teal", undefined, "Password123!")!;
    const team = repo.createTeam(owner.id, "Archive Loop");

    const archivedTeam = repo.setTeamArchived(owner.id, team.id, true);
    expect(archivedTeam.archived).toBe(true);

    const unarchivedTeam = repo.setTeamArchived(owner.id, team.id, false);
    expect(unarchivedTeam.archived).toBe(false);
  });

  it("gates the revealed result when the minimum participation rule is enabled and not enough members voted", () => {
    const repo = new Repository(createTestConfig());
    const owner = repo.verifyLoginCode("quorum-owner@example-company.com", repo.requestLoginCode("quorum-owner@example-company.com").code, "Owner", "fox", "teal", undefined, "Password123!")!;
    const memberA = repo.verifyLoginCode("quorum-a@example-company.com", repo.requestLoginCode("quorum-a@example-company.com").code, "Member A", "owl", "gold", undefined, "Password123!")!;
    const memberB = repo.verifyLoginCode("quorum-b@example-company.com", repo.requestLoginCode("quorum-b@example-company.com").code, "Member B", "bear", "azure", undefined, "Password123!")!;
    const memberC = repo.verifyLoginCode("quorum-c@example-company.com", repo.requestLoginCode("quorum-c@example-company.com").code, "Member C", "cat", "rose", undefined, "Password123!")!;
    const team = repo.createTeam(owner.id, "Quorum Team");
    repo.joinTeam(memberA.id, team.id);
    repo.joinTeam(memberB.id, team.id);
    repo.joinTeam(memberC.id, team.id);
    repo.updateTeamSettings(team.id, {
      minimumVotePercentEnabled: true,
      minimumVotePercent: 75
    });

    const round = repo.createRound(team.id, "QUORUM-101");
    repo.castVote(round.id, owner.id, "3");
    repo.castVote(round.id, memberA.id, "5");
    const blockedRound = repo.revealRound(round.id);

    expect(blockedRound.status).toBe("active");
    expect(blockedRound.quorumBlocked).toBe(true);
    expect(blockedRound.revealAverage).toBeNull();
    expect(blockedRound.votedCount).toBe(2);
    expect(blockedRound.notVotedCount).toBe(2);
    expect(repo.getHistory(team.id)).toHaveLength(0);

    repo.castVote(round.id, memberB.id, "8");
    const revealed = repo.revealRoundIfPreviouslyQuorumBlocked(round.id);
    expect(revealed?.status).toBe("revealed");
    expect(revealed?.quorumBlocked).toBe(false);
    expect(revealed?.votedCount).toBe(3);
    expect(revealed?.notVotedCount).toBe(1);

    const historyEntry = repo.getHistory(team.id)[0]!;
    expect(historyEntry.quorumBlocked).toBe(false);
    expect(historyEntry.averageScore).not.toBeNull();
    expect(historyEntry.votedCount).toBe(3);
    expect(historyEntry.notVotedCount).toBe(1);
  });

  it("uses current active board participants for minimum participation reveal decisions", () => {
    const repo = new Repository(createTestConfig());
    const owner = repo.verifyLoginCode("quorum-live-owner@example-company.com", repo.requestLoginCode("quorum-live-owner@example-company.com").code, "Owner", "fox", "teal", undefined, "Password123!")!;
    const memberA = repo.verifyLoginCode("quorum-live-a@example-company.com", repo.requestLoginCode("quorum-live-a@example-company.com").code, "Member A", "owl", "gold", undefined, "Password123!")!;
    const memberB = repo.verifyLoginCode("quorum-live-b@example-company.com", repo.requestLoginCode("quorum-live-b@example-company.com").code, "Member B", "bear", "azure", undefined, "Password123!")!;
    const memberC = repo.verifyLoginCode("quorum-live-c@example-company.com", repo.requestLoginCode("quorum-live-c@example-company.com").code, "Member C", "cat", "rose", undefined, "Password123!")!;
    const memberD = repo.verifyLoginCode("quorum-live-d@example-company.com", repo.requestLoginCode("quorum-live-d@example-company.com").code, "Member D", "dog", "mint", undefined, "Password123!")!;
    const memberE = repo.verifyLoginCode("quorum-live-e@example-company.com", repo.requestLoginCode("quorum-live-e@example-company.com").code, "Member E", "fox", "violet", undefined, "Password123!")!;
    const team = repo.createTeam(owner.id, "Live Quorum Team");
    [memberA, memberB, memberC, memberD, memberE].forEach((member) => repo.joinTeam(member.id, team.id));
    repo.updateTeamSettings(team.id, {
      minimumVotePercentEnabled: true,
      minimumVotePercent: 75
    });

    const round = repo.createRound(team.id, "QUORUM-LIVE");
    repo.castVote(round.id, owner.id, "3");
    repo.castVote(round.id, memberA.id, "5");
    repo.castVote(round.id, memberB.id, "8");

    const revealed = repo.revealRound(round.id, { eligibleParticipantIds: [owner.id, memberA.id, memberB.id] });
    expect(revealed.status).toBe("revealed");
    expect(revealed.quorumBlocked).toBe(false);
    expect(revealed.votedCount).toBe(3);
    expect(revealed.notVotedCount).toBe(0);
    expect(repo.getHistory(team.id)[0]?.averageScore).not.toBeNull();
  });

  it("reveals a blocked round when a lowered threshold satisfies current board participation", () => {
    const repo = new Repository(createTestConfig());
    const owner = repo.verifyLoginCode("quorum-lower-owner@example-company.com", repo.requestLoginCode("quorum-lower-owner@example-company.com").code, "Owner", "fox", "teal", undefined, "Password123!")!;
    const memberA = repo.verifyLoginCode("quorum-lower-a@example-company.com", repo.requestLoginCode("quorum-lower-a@example-company.com").code, "Member A", "owl", "gold", undefined, "Password123!")!;
    const memberB = repo.verifyLoginCode("quorum-lower-b@example-company.com", repo.requestLoginCode("quorum-lower-b@example-company.com").code, "Member B", "bear", "azure", undefined, "Password123!")!;
    const memberC = repo.verifyLoginCode("quorum-lower-c@example-company.com", repo.requestLoginCode("quorum-lower-c@example-company.com").code, "Member C", "cat", "rose", undefined, "Password123!")!;
    const team = repo.createTeam(owner.id, "Lower Quorum Team");
    [memberA, memberB, memberC].forEach((member) => repo.joinTeam(member.id, team.id));
    repo.updateTeamSettings(team.id, {
      minimumVotePercentEnabled: true,
      minimumVotePercent: 75
    });

    const round = repo.createRound(team.id, "QUORUM-LOWER");
    repo.castVote(round.id, owner.id, "3");
    repo.castVote(round.id, memberA.id, "5");
    const blocked = repo.revealRound(round.id, { eligibleParticipantIds: [owner.id, memberA.id, memberB.id, memberC.id] });
    expect(blocked.status).toBe("active");
    expect(blocked.quorumBlocked).toBe(true);
    expect(blocked.votedCount).toBe(2);
    expect(blocked.notVotedCount).toBe(2);

    repo.updateTeamSettings(team.id, { minimumVotePercent: 40 });
    const revealed = repo.revealRoundIfPreviouslyQuorumBlocked(round.id, {
      eligibleParticipantIds: [owner.id, memberA.id, memberB.id, memberC.id]
    });
    expect(revealed?.status).toBe("revealed");
    expect(revealed?.quorumBlocked).toBe(false);
    expect(revealed?.votedCount).toBe(2);
    expect(revealed?.notVotedCount).toBe(2);
    expect(repo.getHistory(team.id)).toHaveLength(1);
  });

  it("lets a blocked minimum-participation round be canceled or restarted without writing history", () => {
    const repo = new Repository(createTestConfig());
    const owner = repo.verifyLoginCode("quorum-escape-owner@example-company.com", repo.requestLoginCode("quorum-escape-owner@example-company.com").code, "Owner", "fox", "teal", undefined, "Password123!")!;
    const memberA = repo.verifyLoginCode("quorum-escape-a@example-company.com", repo.requestLoginCode("quorum-escape-a@example-company.com").code, "Member A", "owl", "gold", undefined, "Password123!")!;
    const memberB = repo.verifyLoginCode("quorum-escape-b@example-company.com", repo.requestLoginCode("quorum-escape-b@example-company.com").code, "Member B", "bear", "azure", undefined, "Password123!")!;
    const team = repo.createTeam(owner.id, "Quorum Escape Team");
    repo.joinTeam(memberA.id, team.id);
    repo.joinTeam(memberB.id, team.id);
    repo.updateTeamSettings(team.id, {
      minimumVotePercentEnabled: true,
      minimumVotePercent: 100
    });

    const canceledRound = repo.createRound(team.id, "QUORUM-CANCEL");
    repo.castVote(canceledRound.id, owner.id, "3");
    expect(repo.revealRound(canceledRound.id).quorumBlocked).toBe(true);

    const cancelResult = repo.cancelRound(canceledRound.id);
    expect(cancelResult.teamId).toBe(team.id);
    expect(repo.getTeamState(team.id, owner.id).activeRound).toBeNull();
    expect(repo.getHistory(team.id)).toHaveLength(0);

    const blockedRound = repo.createRound(team.id, "QUORUM-RESTART");
    repo.castVote(blockedRound.id, owner.id, "5");
    expect(repo.revealRound(blockedRound.id).quorumBlocked).toBe(true);

    const restartedRound = repo.restartActiveRound(blockedRound.id);
    expect(restartedRound.id).not.toBe(blockedRound.id);
    expect(restartedRound.title).toBe("QUORUM-RESTART");
    expect(restartedRound.status).toBe("active");
    expect(restartedRound.quorumBlocked).toBe(false);
    expect(restartedRound.votes).toHaveLength(0);
    expect(repo.getTeamState(team.id, owner.id).activeRound?.id).toBe(restartedRound.id);
    expect(repo.getHistory(team.id)).toHaveLength(0);
  });

  it("hides simulator teams until a recent heartbeat is recorded and hides them again after the heartbeat becomes stale", () => {
    const config = createTestConfig();
    const repo = new Repository(config);
    const owner = repo.verifyLoginCode("sim-owner@example-company.com", repo.requestLoginCode("sim-owner@example-company.com").code, "Sim Owner", "fox", "teal", undefined, "Password123!")!;
    const simTeam = repo.createTeam(owner.id, "Sim Team 42");

    expect(repo.getTeamsForUser(owner.id).memberships.map((team) => team.id)).not.toContain(simTeam.id);

    repo.recordSimulatorHeartbeat();
    expect(repo.isSimulatorOnline()).toBe(true);
    expect(repo.getTeamsForUser(owner.id).memberships.map((team) => team.id)).toContain(simTeam.id);

    vi.useFakeTimers();
    vi.advanceTimersByTime(20_000);
    expect(repo.isSimulatorOnline()).toBe(false);
    expect(repo.getTeamsForUser(owner.id).memberships.map((team) => team.id)).not.toContain(simTeam.id);
    expect(() => repo.getTeamState(simTeam.id, owner.id)).toThrowError("Forbidden");
    vi.useRealTimers();
  });

  it("creates an immediate notification when a member is promoted to team-admin", () => {
    const repo = new Repository(createTestConfig());
    const owner = repo.verifyLoginCode("promote-owner@example-company.com", repo.requestLoginCode("promote-owner@example-company.com").code, "Owner", "fox", "teal", undefined, "Password123!")!;
    const member = repo.verifyLoginCode("promote-member@example-company.com", repo.requestLoginCode("promote-member@example-company.com").code, "Member", "owl", "gold", undefined, "Password123!")!;
    const team = repo.createTeam(owner.id, "Promotion Team");

    repo.joinTeam(member.id, team.id);
    repo.promoteTeamMember(owner.id, team.id, member.id);

    const notifications = repo.getNotificationFeed(member.id, team.id);
    expect(notifications.active.some((item) => item.kind === "team_admin_promoted" && item.teamId === team.id)).toBe(true);
  });
});
