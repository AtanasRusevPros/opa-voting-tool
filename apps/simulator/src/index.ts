// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import { WebSocket } from "ws";
import { type TeamRoundUpdatePayload, type TeamRoundVoteUpdatePayload, type TeamStateResponse } from "@planning-poker/shared";
import { buildSimulatorScenario, chooseVoteCard, createSeededRandom, getDeckCards, shouldVote, type SimulatorSeedTeam } from "./scenario.js";

type SimulatorBootstrapResponse = {
  ok: boolean;
  users: Array<{ id: string; email: string }>;
  teams: Array<{ id: string; name: string; memberCount: number }>;
};

type SimulatorLoginResponse = {
  token: string;
  user: { id: string; email: string };
};

type SimulatorBot = {
  email: string;
  token: string;
  teamId: string;
  teamName: string;
  userId: string;
  random: () => number;
  handledRounds: Set<string>;
  socket: WebSocket | null;
};

const mode = process.argv[2] ?? "run";
const baseUrl = process.env.SIMULATOR_BASE_URL ?? "http://127.0.0.1:3001";
const sharedSecret = process.env.SIMULATOR_SHARED_SECRET ?? "planning-poker-simulator";
const voteProbability = Number(process.env.SIMULATOR_VOTE_PROBABILITY ?? "0.8");
const randomSeed = Number(process.env.SIMULATOR_RANDOM_SEED ?? "20260404");
const reconnectDelayMs = Number(process.env.SIMULATOR_RECONNECT_DELAY_MS ?? "1500");
const skipBootstrapOnRun = process.env.SIMULATOR_SKIP_BOOTSTRAP === "1";

const scenario = buildSimulatorScenario();
const shuttingDown = { value: false };

function apiUrl(path: string) {
  return new URL(path, baseUrl).toString();
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-simulator-secret": sharedSecret,
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    throw new Error(`Simulator API ${path} failed: ${response.status} ${await response.text()}`);
  }

  return (await response.json()) as T;
}

async function seedScenario() {
  return api<SimulatorBootstrapResponse>("/api/simulator/bootstrap", {
    method: "POST",
    body: JSON.stringify(scenario)
  });
}

async function loginBot(email: string) {
  return api<SimulatorLoginResponse>("/api/simulator/login", {
    method: "POST",
    body: JSON.stringify({ email })
  });
}

async function sendHeartbeat() {
  await api<{ ok: boolean }>("/api/simulator/heartbeat", {
    method: "POST"
  });
}

function scheduleVote(bot: SimulatorBot, round: NonNullable<TeamStateResponse["activeRound"]>) {
  if (bot.handledRounds.has(round.id) || round.status !== "active") {
    return;
  }

  bot.handledRounds.add(round.id);
  if (!shouldVote(bot.random, voteProbability)) {
    return;
  }

  const delay = 150 + Math.floor(bot.random() * 1200);
  const card = chooseVoteCard(getDeckCards(round.deckKey), bot.random);
  setTimeout(async () => {
    if (shuttingDown.value) {
      return;
    }
    try {
      await fetch(apiUrl(`/api/teams/${bot.teamId}/rounds/${round.id}/vote`), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${bot.token}`
        },
        body: JSON.stringify({ value: card })
      });
    } catch (error) {
      console.error(`[simulator] vote failed for ${bot.email} in ${bot.teamName}:`, error);
    }
  }, delay);
}

function createSocketUrl(bot: SimulatorBot) {
  const wsUrl = new URL(apiUrl("/ws"));
  wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";
  wsUrl.searchParams.set("teamId", bot.teamId);
  wsUrl.searchParams.set("token", bot.token);
  return wsUrl.toString();
}

function attachBot(bot: SimulatorBot) {
  const socket = new WebSocket(createSocketUrl(bot));
  bot.socket = socket;

  socket.on("message", (payload) => {
    const message = JSON.parse(String(payload)) as
      | { type: "team:update"; payload: TeamStateResponse }
      | { type: "team:round"; payload: TeamRoundUpdatePayload }
      | { type: "team:round-vote"; payload: TeamRoundVoteUpdatePayload };

    if (message.type === "team:update" && message.payload.activeRound) {
      scheduleVote(bot, message.payload.activeRound);
      return;
    }

    if (message.type === "team:round" && message.payload.activeRound) {
      scheduleVote(bot, message.payload.activeRound);
      return;
    }

    if (message.type === "team:round-vote") {
      return;
    }
  });

  socket.on("close", () => {
    bot.socket = null;
    if (!shuttingDown.value) {
      setTimeout(() => attachBot(bot), reconnectDelayMs);
    }
  });

  socket.on("error", () => {
    socket.close();
  });
}

async function runSimulator() {
  await sendHeartbeat();
  const bootstrap = skipBootstrapOnRun
    ? await api<SimulatorBootstrapResponse>("/api/bootstrap-simulator-state", {
        method: "GET"
      })
    : await seedScenario();
  const teamIdsByName = new Map(bootstrap.teams.map((team) => [team.name, team.id]));
  const bots: SimulatorBot[] = [];
  let sequence = 0;

  for (const team of scenario.teams) {
    const teamId = teamIdsByName.get(team.name);
    if (!teamId) {
      throw new Error(`Missing simulator team id for ${team.name}`);
    }

    for (const email of team.memberEmails) {
      const login = await loginBot(email);
      const bot: SimulatorBot = {
        email,
        token: login.token,
        teamId,
        teamName: team.name,
        userId: login.user.id,
        random: createSeededRandom(randomSeed + sequence),
        handledRounds: new Set(),
        socket: null
      };
      bots.push(bot);
      attachBot(bot);
      sequence += 1;
    }
  }

  console.log(`[simulator] connected ${bots.length} bots across ${scenario.teams.length} teams at ${baseUrl}`);
  return bots;
}

async function main() {
  if (mode === "seed") {
    const bootstrap = await seedScenario();
    console.log(`[simulator] seeded ${bootstrap.users.length} users across ${bootstrap.teams.length} teams`);
    return;
  }

  const bots = await runSimulator();
  const heartbeatTimer = setInterval(() => {
    void sendHeartbeat().catch((error) => {
      console.error("[simulator] heartbeat failed:", error);
    });
  }, 5_000);
  const keepAliveTimer = setInterval(() => {
    // Keep the simulator process alive as a long-running sidecar.
  }, 60_000);
  await new Promise<void>((resolve) => {
    const shutdown = () => {
      shuttingDown.value = true;
      clearInterval(heartbeatTimer);
      clearInterval(keepAliveTimer);
      for (const bot of bots) {
        try {
          bot.socket?.close();
        } catch {
          // Ignore socket shutdown noise during simulator teardown.
        }
      }
      resolve();
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  });
}

main().catch((error) => {
  console.error("[simulator] fatal error", error);
  process.exitCode = 1;
});
