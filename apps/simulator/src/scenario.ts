// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import { BRANDING_MANIFEST, DECKS, type VoteValue } from "@planning-poker/shared";

export const SIM_TEAM_SIZES = [10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 150, 400] as const;
export const SIMULATOR_USER_COUNT = SIM_TEAM_SIZES.reduce((sum, size) => sum + size, 0);

export type SimulatorSeedUser = {
  email: string;
  displayName: string;
  avatarIconKey: string;
  avatarColorKey: string;
};

export type SimulatorSeedTeam = {
  name: string;
  memberEmails: string[];
};

export type SimulatorScenario = {
  users: SimulatorSeedUser[];
  teams: SimulatorSeedTeam[];
};

export function buildSimulatorScenario(): SimulatorScenario {
  const users: SimulatorSeedUser[] = Array.from({ length: SIMULATOR_USER_COUNT }, (_, index) => ({
    email: `sim.bot.${String(index + 1).padStart(3, "0")}@example-company.com`,
    displayName: `Sim ${String(index + 1).padStart(3, "0")}`,
    avatarIconKey: BRANDING_MANIFEST.avatarIconKeys[index % BRANDING_MANIFEST.avatarIconKeys.length]!,
    avatarColorKey: BRANDING_MANIFEST.avatarColorKeys[index % BRANDING_MANIFEST.avatarColorKeys.length]!
  }));

  const teams: SimulatorSeedTeam[] = [];
  let offset = 0;
  for (const size of SIM_TEAM_SIZES) {
    teams.push({
      name: `Sim Team ${size}`,
      memberEmails: users.slice(offset, offset + size).map((user) => user.email)
    });
    offset += size;
  }

  return { users, teams };
}

export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function shouldVote(random: () => number, probability: number): boolean {
  return random() < probability;
}

export function chooseVoteCard(cards: VoteValue[], random: () => number): VoteValue {
  return cards[Math.floor(random() * cards.length)]!;
}

export function getDeckCards(deckKey: string): VoteValue[] {
  return DECKS.find((deck) => deck.key === deckKey)?.cards ?? DECKS[0]!.cards;
}
