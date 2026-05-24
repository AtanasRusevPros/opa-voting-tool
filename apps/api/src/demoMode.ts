// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import { BRANDING_MANIFEST, getDeckCards, type TeamSummary, type VoteValue } from "@planning-poker/shared";
import { Repository } from "./repository.js";

const DEMO_TEAM_SIZES = [10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 150, 400] as const;
const DEMO_RANDOM_SEED = 20260414;
const DEMO_VOTE_PROBABILITY = 0.8;
const DEMO_TICK_MS = 500;

type DemoSeedUser = {
  email: string;
  displayName: string;
  avatarIconKey: string;
  avatarColorKey: string;
};

type DemoSeedTeam = {
  name: string;
  memberEmails: string[];
};

type DemoScenario = {
  users: DemoSeedUser[];
  teams: DemoSeedTeam[];
};

type DemoBot = {
  userId: string;
  teamId: string;
  random: () => number;
  handledRounds: Set<string>;
};

type DemoModeManagerOptions = {
  repository: Repository;
  isEnabled: () => boolean;
  onChooserChanged: () => void;
  onTeamChanged: (teamId: string, mode?: "full" | "round") => void;
  onVoteChanged: (teamId: string, roundId: string, userId: string, value: string) => void;
};

function buildDemoScenario(): DemoScenario {
  const totalUsers = DEMO_TEAM_SIZES.reduce((sum, size) => sum + size, 0);
  const users: DemoSeedUser[] = Array.from({ length: totalUsers }, (_, index) => ({
    email: `demo.bot.${String(index + 1).padStart(3, "0")}@example-company.com`,
    displayName: `Demo ${String(index + 1).padStart(3, "0")}`,
    avatarIconKey: BRANDING_MANIFEST.avatarIconKeys[index % BRANDING_MANIFEST.avatarIconKeys.length]!,
    avatarColorKey: BRANDING_MANIFEST.avatarColorKeys[index % BRANDING_MANIFEST.avatarColorKeys.length]!
  }));

  const teams: DemoSeedTeam[] = [];
  let offset = 0;
  for (const size of DEMO_TEAM_SIZES) {
    teams.push({
      name: `Demo Team ${size}`,
      memberEmails: users.slice(offset, offset + size).map((user) => user.email)
    });
    offset += size;
  }

  return { users, teams };
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function shouldVote(random: () => number, probability: number): boolean {
  return random() < probability;
}

function chooseVoteCard(cards: VoteValue[], random: () => number): VoteValue {
  return cards[Math.floor(random() * cards.length)]!;
}

export class DemoModeManager {
  private readonly repository: Repository;
  private readonly isEnabled: () => boolean;
  private readonly onChooserChanged: () => void;
  private readonly onTeamChanged: (teamId: string, mode?: "full" | "round") => void;
  private readonly onVoteChanged: (teamId: string, roundId: string, userId: string, value: string) => void;
  private readonly activeUserIdsByTeamId = new Map<string, Set<string>>();
  private readonly botsByTeamId = new Map<string, DemoBot[]>();
  private readonly pendingVoteTimers = new Set<ReturnType<typeof setTimeout>>();
  private readonly knownDemoTeamIds = new Set<string>();
  private tickTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: DemoModeManagerOptions) {
    this.repository = options.repository;
    this.isEnabled = options.isEnabled;
    this.onChooserChanged = options.onChooserChanged;
    this.onTeamChanged = options.onTeamChanged;
    this.onVoteChanged = options.onVoteChanged;
  }

  sync() {
    if (this.isEnabled()) {
      this.enable();
      return;
    }

    this.disable();
  }

  shutdown() {
    this.disable();
  }

  getSyntheticActiveParticipantIds(teamId: string): ReadonlySet<string> {
    return this.activeUserIdsByTeamId.get(teamId) ?? new Set<string>();
  }

  private enable() {
    const superAdmin = this.repository.getSuperAdminUser();
    if (!superAdmin) {
      return;
    }

    const scenario = buildDemoScenario();
    const usersByEmail = new Map<string, { id: string }>();
    for (const user of scenario.users) {
      const ensured = this.repository.ensureUser(user);
      usersByEmail.set(user.email, { id: ensured.id });
    }

    const syncedTeams = this.repository.syncDemoTeams(
      superAdmin.id,
      scenario.teams.map((team) => ({
        name: team.name,
        memberUserIds: team.memberEmails.map((email) => {
          const ensured = usersByEmail.get(email);
          if (!ensured) {
            throw new Error(`Missing demo user for ${email}`);
          }
          return ensured.id;
        })
      }))
    );

    this.botsByTeamId.clear();
    this.activeUserIdsByTeamId.clear();
    let seedOffset = 0;
    const nextKnownTeamIds = new Set<string>();

    for (const syncedTeam of syncedTeams) {
      const teamBots = this.repository
        .getTeamMembers(syncedTeam.id)
        .filter((member) => member.displayName.startsWith("Demo "))
        .map((member, index) => ({
          userId: member.id,
          teamId: syncedTeam.id,
          random: createSeededRandom(DEMO_RANDOM_SEED + seedOffset + index),
          handledRounds: new Set<string>()
        }));
      this.botsByTeamId.set(syncedTeam.id, teamBots);
      this.activeUserIdsByTeamId.set(syncedTeam.id, new Set(teamBots.map((bot) => bot.userId)));
      nextKnownTeamIds.add(syncedTeam.id);
      this.onTeamChanged(syncedTeam.id, "full");
      seedOffset += teamBots.length;
    }

    for (const previousTeamId of this.knownDemoTeamIds) {
      if (!nextKnownTeamIds.has(previousTeamId)) {
        this.onTeamChanged(previousTeamId, "full");
      }
    }

    this.knownDemoTeamIds.clear();
    for (const teamId of nextKnownTeamIds) {
      this.knownDemoTeamIds.add(teamId);
    }

    if (!this.tickTimer) {
      this.tickTimer = setInterval(() => this.tick(), DEMO_TICK_MS);
      this.tickTimer.unref?.();
    }

    this.onChooserChanged();
  }

  private disable() {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }

    for (const timer of this.pendingVoteTimers) {
      clearTimeout(timer);
    }
    this.pendingVoteTimers.clear();

    const affectedTeamIds = new Set<string>(this.knownDemoTeamIds);
    for (const teamId of this.activeUserIdsByTeamId.keys()) {
      affectedTeamIds.add(teamId);
    }

    this.activeUserIdsByTeamId.clear();
    this.botsByTeamId.clear();

    for (const teamId of affectedTeamIds) {
      this.onTeamChanged(teamId, "full");
    }
    if (affectedTeamIds.size) {
      this.onChooserChanged();
    }
  }

  private tick() {
    if (!this.isEnabled()) {
      return;
    }

    for (const [teamId, bots] of this.botsByTeamId.entries()) {
      const activeRound = this.repository.getCurrentRound(teamId);
      if (!activeRound || activeRound.status !== "active") {
        continue;
      }

      const cards = getDeckCards(activeRound.deckKey, {
        fibonacciRangeStart: activeRound.fibonacciRangeStart,
        fibonacciRangeEnd: activeRound.fibonacciRangeEnd
      });

      for (const bot of bots) {
        if (bot.handledRounds.has(activeRound.id)) {
          continue;
        }
        bot.handledRounds.add(activeRound.id);
        if (!shouldVote(bot.random, DEMO_VOTE_PROBABILITY)) {
          continue;
        }

        const delayMs = 150 + Math.floor(bot.random() * 1200);
        const timer = setTimeout(() => {
          this.pendingVoteTimers.delete(timer);
          if (!this.isEnabled()) {
            return;
          }

          const currentRound = this.repository.getCurrentRound(teamId);
          if (!currentRound || currentRound.id !== activeRound.id || currentRound.status !== "active") {
            return;
          }

          try {
            const value = chooseVoteCard(cards, bot.random);
            this.repository.castVote(activeRound.id, bot.userId, value);
            this.onVoteChanged(teamId, activeRound.id, bot.userId, value);
          } catch {
            // Ignore round replacement/reveal races; the next round tick will converge.
          }
        }, delayMs);
        timer.unref?.();
        this.pendingVoteTimers.add(timer);
      }
    }
  }
}
