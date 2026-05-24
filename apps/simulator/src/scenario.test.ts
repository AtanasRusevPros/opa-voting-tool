// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { buildSimulatorScenario, chooseVoteCard, createSeededRandom, getDeckCards, shouldVote, SIMULATOR_USER_COUNT, SIM_TEAM_SIZES } from "./scenario.js";

describe("simulator scenario", () => {
  it("creates deterministic users and 12 seeded teams including 150 and 400-room demos", () => {
    const scenario = buildSimulatorScenario();
    expect(scenario.users).toHaveLength(SIMULATOR_USER_COUNT);
    expect(scenario.teams.map((team) => team.memberEmails.length)).toEqual([...SIM_TEAM_SIZES]);
    expect(new Set(scenario.users.map((user) => user.email)).size).toBe(SIMULATOR_USER_COUNT);
  });

  it("uses deterministic random values and vote probability decisions", () => {
    const randomA = createSeededRandom(42);
    const randomB = createSeededRandom(42);
    expect(Array.from({ length: 5 }, () => randomA())).toEqual(Array.from({ length: 5 }, () => randomB()));
    const decisionRandomA = createSeededRandom(7);
    const decisionRandomB = createSeededRandom(7);
    expect(Array.from({ length: 6 }, () => shouldVote(decisionRandomA, 0.8))).toEqual(
      Array.from({ length: 6 }, () => shouldVote(decisionRandomB, 0.8))
    );
  });

  it("chooses cards from the active deck only", () => {
    const cards = getDeckCards("fibonacci-21");
    const random = createSeededRandom(99);
    const chosen = Array.from({ length: 20 }, () => chooseVoteCard(cards, random));
    expect(chosen.every((card) => cards.includes(card))).toBe(true);
  });
});
