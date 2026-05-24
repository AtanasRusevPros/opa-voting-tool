// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { WebSocket } from "ws";
import { DECKS, type AverageValue, type TeamRoundUpdatePayload, type TeamRoundVoteUpdatePayload, type TeamStateResponse, type VoteValue } from "@planning-poker/shared";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, "../../..");

type SeedUser = {
  email: string;
  displayName: string;
  avatarIconKey: string;
  avatarColorKey: string;
};

type SeedTeam = {
  name: string;
  memberEmails: string[];
};

type BootstrapResponse = {
  ok: boolean;
  users: Array<{ id: string; email: string }>;
  teams: Array<{ id: string; name: string; memberCount: number }>;
};

type LoginResponse = {
  token: string;
  user: { id: string; email: string };
};

function applyVoteDeltaToState(state: TeamStateResponse, delta: TeamRoundVoteUpdatePayload): TeamStateResponse {
  if (!state.activeRound || state.activeRound.status !== "active" || state.activeRound.id !== delta.roundId) {
    return state;
  }

  const votesByUserId = new Map(state.activeRound.votes.map((vote) => [vote.userId, vote]));
  for (const memberIndex of delta.changedMemberIndexes) {
    const member = state.teamMembers[memberIndex] ?? state.activeParticipants[memberIndex];
    if (!member) {
      continue;
    }

    const existing = votesByUserId.get(member.id);
    votesByUserId.set(member.id, {
      userId: member.id,
      displayName: member.displayName,
      avatarIconKey: member.avatarIconKey,
      avatarColorKey: member.avatarColorKey,
      value: member.id === state.currentUser.id ? delta.viewerVoteValue ?? existing?.value ?? "hidden" : "hidden"
    });
  }

  return {
    ...state,
    activeRound: {
      ...state.activeRound,
      votes: [...votesByUserId.values()].sort((left, right) => left.displayName.localeCompare(right.displayName)),
      votedCount: delta.votedCount,
      notVotedCount: delta.notVotedCount
    },
    liveSync: delta.liveSync
  };
}

type PerfSnapshot = {
  generatedAt: string;
  counters: Record<string, number>;
  gauges: Record<string, number>;
  timings: Record<
    string,
    {
      count: number;
      minMs: number;
      maxMs: number;
      avgMs: number;
      p50Ms: number;
      p95Ms: number;
    }
  >;
};

type ResourceSample = {
  cpuPercent: number;
  memoryMiB: number;
};

type ResourceSummary = {
  sampleCount: number;
  avgCpuPercent: number;
  maxCpuPercent: number;
  avgMemoryMiB: number;
  maxMemoryMiB: number;
};

export type LatencySummary = {
  count: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
};

type TeamDefinition = {
  name: string;
  size: number;
};

type ScenarioResult = {
  name: string;
  startedAt: string;
  completedAt: string;
  requestLatencies: Record<string, LatencySummary>;
  convergenceMs: Record<string, number>;
  perfSnapshot: PerfSnapshot;
  resources: ResourceSummary | null;
  notes: string[];
};

type BotClient = {
  email: string;
  token: string;
  userId: string;
  teamId: string;
  teamName: string;
  socket: WebSocket;
  latestState: TeamStateResponse | null;
  latestPresenceCount: number;
};

type PreparedScenario = {
  ownerToken: string;
  teams: Array<{ id: string; name: string; size: number }>;
  bots: BotClient[];
  botsByTeamName: Map<string, BotClient[]>;
  cleanup: () => Promise<void>;
};

const mode = process.argv[2] ?? "verify";
const baseUrl = process.env.SIMULATOR_BASE_URL ?? "http://127.0.0.1:3001";
const sharedSecret = process.env.SIMULATOR_SHARED_SECRET ?? "planning-poker-simulator";
const outputDir = path.resolve(repoRoot, "project_docs/RnD_docs/perf_runs");
const reportMarkdownPath = path.join(outputDir, "PHASE3_CAPACITY_VALIDATION_LATEST.md");
const reportJsonPath = path.join(outputDir, "phase3-capacity-validation.latest.json");

function formatArtifactTimestamp(date: Date) {
  return date.toISOString().replaceAll(":", "-").replace(/\.\d{3}Z$/, "Z");
}

function apiUrl(pathname: string) {
  return new URL(pathname, baseUrl).toString();
}

async function api<T>(pathname: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(pathname), {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-simulator-secret": sharedSecret,
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    throw new Error(`Simulator API ${pathname} failed: ${response.status} ${await response.text()}`);
  }

  return (await response.json()) as T;
}

export function summarize(values: number[]): LatencySummary {
  const sorted = [...values].sort((left, right) => left - right);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  const percentile = (ratio: number) => {
    if (sorted.length === 0) {
      return 0;
    }
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
    return Number(sorted[index]!.toFixed(2));
  };

  return {
    count: sorted.length,
    avgMs: Number((total / Math.max(1, sorted.length)).toFixed(2)),
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    maxMs: Number((sorted.at(-1) ?? 0).toFixed(2))
  };
}

function buildUsers(prefix: string, count: number, offset = 1): SeedUser[] {
  return Array.from({ length: count }, (_, index) => ({
    email: `sim.bot.${prefix}.${String(index + offset).padStart(4, "0")}@example-company.com`,
    displayName: `P3 ${String(index + offset).padStart(4, "0")}`,
    avatarIconKey: "fox",
    avatarColorKey: "teal"
  }));
}

function buildScenario(prefix: string, teamDefinitions: TeamDefinition[]) {
  const users: SeedUser[] = [];
  const teams: SeedTeam[] = [];
  let offset = 1;

  for (const team of teamDefinitions) {
    const teamUsers = buildUsers(prefix, team.size, offset);
    users.push(...teamUsers);
    teams.push({
      name: team.name,
      memberEmails: teamUsers.map((user) => user.email)
    });
    offset += team.size;
  }

  return { users, teams };
}

export function buildPhase3Plans(runKey: string) {
  return {
    singleRoom: [{ name: `Capacity Main ${runKey}`, size: 200 }],
    parallel: [
      { name: `Capacity Main ${runKey}`, size: 200 },
      ...Array.from({ length: 20 }, (_, index) => ({ name: `Capacity Side ${String(index + 1).padStart(2, "0")} ${runKey}`, size: 10 }))
    ],
    burst: [{ name: `Capacity Burst ${runKey}`, size: 80 }]
  };
}

function deckVoteCard(index: number): VoteValue {
  const numericCards = DECKS[0]!.cards.filter((card) => !["?", "coffee"].includes(card));
  return numericCards[index % numericCards.length]!;
}

async function login(email: string) {
  return api<LoginResponse>("/api/simulator/login", {
    method: "POST",
    body: JSON.stringify({ email })
  });
}

async function loginOwner() {
  return login("sim.owner@example-company.com");
}

function createSocket(token: string, teamId: string) {
  const wsUrl = new URL(apiUrl("/ws"));
  wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";
  wsUrl.searchParams.set("teamId", teamId);
  wsUrl.searchParams.set("token", token);
  return new WebSocket(wsUrl.toString());
}

async function waitForCondition(check: () => Promise<boolean> | boolean, timeoutMs: number, label: string) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  throw new Error(`Timed out waiting for ${label}`);
}

async function waitForRoundVotes(teamId: string, ownerToken: string, expectedVotes: number) {
  await waitForCondition(async () => {
    const state = await fetchTeamState(teamId, ownerToken);
    return (state.activeRound?.votes.length ?? 0) >= expectedVotes;
  }, 30_000, `round vote count ${expectedVotes} in ${teamId}`);
}

async function fetchTeamState(teamId: string, token: string, options?: { includeHistory?: boolean }) {
  const historyFlag = options?.includeHistory ? "1" : "0";
  const response = await fetch(apiUrl(`/api/teams/${teamId}/state?history=${historyFlag}`), {
    headers: {
      authorization: `Bearer ${token}`
    }
  });
  if (!response.ok) {
    throw new Error(`Team state fetch failed for ${teamId}: ${response.status} ${await response.text()}`);
  }
  return (await response.json()) as TeamStateResponse;
}

async function resetPerfMetrics() {
  await api("/api/simulator/perf/reset", {
    method: "POST"
  });
}

async function fetchPerfSnapshot() {
  return api<PerfSnapshot>("/api/simulator/perf", {
    method: "GET"
  });
}

async function timedRequest<T>(request: () => Promise<T>) {
  const startMs = performance.now();
  const result = await request();
  return {
    result,
    latencyMs: performance.now() - startMs
  };
}

async function postJson<T>(pathname: string, token: string, body: unknown) {
  const response = await fetch(apiUrl(pathname), {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`POST ${pathname} failed: ${response.status} ${await response.text()}`);
  }

  return (await response.json()) as T;
}

async function postJsonAllowConflict(pathname: string, token: string, body: unknown) {
  const response = await fetch(apiUrl(pathname), {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const text = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    bodyText: text
  };
}

async function discoverAppContainerName() {
  try {
    const { stdout } = await execFileAsync("podman", ["ps", "--format", "json"]);
    const containers = JSON.parse(stdout) as Array<{ Names?: string[]; Namespaces?: unknown; Image?: string }>;
    const match = containers.find((container) => (container.Names ?? []).some((name) => name.includes("planning-poker_1")));
    return match?.Names?.[0] ?? "containers_planning-poker_1";
  } catch {
    return "containers_planning-poker_1";
  }
}

function parsePodmanPercent(value: number | string | undefined) {
  if (typeof value === "number") {
    return Number(value.toFixed(2));
  }
  return Number((value ?? "0").replace("%", "").trim()) || 0;
}

function parsePodmanMemoryMiB(value: number | string | undefined) {
  if (typeof value === "number") {
    return Number((value / (1024 * 1024)).toFixed(2));
  }
  const used = value?.split("/")[0]?.trim() ?? "0";
  const match = used.match(/^([\d.]+)([KMG]i)?B?$/i);
  if (!match) {
    return 0;
  }
  const amount = Number(match[1]);
  const unit = match[2]?.toLowerCase() ?? "b";
  if (unit === "ki") {
    return Number((amount / 1024).toFixed(2));
  }
  if (unit === "gi") {
    return Number((amount * 1024).toFixed(2));
  }
  if (unit === "mi") {
    return Number(amount.toFixed(2));
  }
  return Number((amount / (1024 * 1024)).toFixed(2));
}

async function createResourceSampler() {
  const containerName = await discoverAppContainerName();
  const samples: ResourceSample[] = [];
  let stopped = false;

  const tick = async () => {
    if (stopped) {
      return;
    }
    try {
      const { stdout } = await execFileAsync("podman", ["stats", "--no-stream", "--format", "{{ json . }}", containerName]);
      const parsed = JSON.parse(stdout.trim()) as { CPUPerc?: string; CPU?: number; MemPerc?: number; MemUsage?: number | string };
      samples.push({
        cpuPercent: parsePodmanPercent(parsed.CPU ?? parsed.CPUPerc),
        memoryMiB: parsePodmanMemoryMiB(parsed.MemUsage)
      });
    } catch {
      // Resource stats are best-effort; keep the validation run usable even if podman stats is unavailable.
    }
  };

  const interval = setInterval(() => {
    void tick();
  }, 1000);

  await tick();

  return {
    async stop(): Promise<ResourceSummary | null> {
      stopped = true;
      clearInterval(interval);
      if (samples.length === 0) {
        return null;
      }
      const cpuValues = samples.map((sample) => sample.cpuPercent);
      const memoryValues = samples.map((sample) => sample.memoryMiB);
      return {
        sampleCount: samples.length,
        avgCpuPercent: summarize(cpuValues).avgMs,
        maxCpuPercent: summarize(cpuValues).maxMs,
        avgMemoryMiB: summarize(memoryValues).avgMs,
        maxMemoryMiB: summarize(memoryValues).maxMs
      };
    }
  };
}

async function prepareScenario(prefix: string, teamDefinitions: TeamDefinition[]): Promise<PreparedScenario> {
  const payload = buildScenario(prefix, teamDefinitions);
  const bootstrap = await api<BootstrapResponse>("/api/simulator/bootstrap", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  const owner = await loginOwner();
  const teamIdByName = new Map(bootstrap.teams.map((team) => [team.name, team.id]));
  const bots: BotClient[] = [];

  for (const team of payload.teams) {
    const teamId = teamIdByName.get(team.name);
    if (!teamId) {
      throw new Error(`Missing team id for ${team.name}`);
    }

    for (const email of team.memberEmails) {
      const auth = await login(email);
      const socket = createSocket(auth.token, teamId);
      const bot: BotClient = {
        email,
        token: auth.token,
        userId: auth.user.id,
        teamId,
        teamName: team.name,
        socket,
        latestState: null,
        latestPresenceCount: 0
      };

      socket.on("message", (payload) => {
        const message = JSON.parse(String(payload)) as
          | { type: "team:update"; payload: TeamStateResponse }
          | { type: "team:round"; payload: TeamRoundUpdatePayload }
          | { type: "team:round-vote"; payload: TeamRoundVoteUpdatePayload }
          | { type: "team:presence"; payload: { activeParticipants: Array<{ id: string }> } };
        if (message.type === "team:update") {
          bot.latestState = message.payload;
        } else if (message.type === "team:round") {
          if (bot.latestState) {
            const existingIndex = message.payload.historyEntry ? bot.latestState.history.findIndex((entry) => entry.id === message.payload.historyEntry?.id) : -1;
            const nextHistory =
              !message.payload.historyEntry
                ? bot.latestState.history
                : existingIndex === -1
                  ? [message.payload.historyEntry, ...bot.latestState.history]
                  : bot.latestState.history.map((entry, index) => (index === existingIndex ? message.payload.historyEntry! : entry));
            bot.latestState = {
              ...bot.latestState,
              activeRound: message.payload.activeRound,
              history: nextHistory,
              liveSync: message.payload.liveSync
            };
          }
        } else if (message.type === "team:round-vote") {
          if (bot.latestState) {
            bot.latestState = applyVoteDeltaToState(bot.latestState, message.payload);
          }
        } else if (message.type === "team:presence") {
          bot.latestPresenceCount = message.payload.activeParticipants.length;
        }
      });

      bots.push(bot);
    }
  }

  await waitForCondition(
    () => bots.every((bot) => bot.socket.readyState === WebSocket.OPEN),
    30_000,
    `all scenario sockets to open (${prefix})`
  );

  const teams = teamDefinitions.map((team) => ({
    id: teamIdByName.get(team.name)!,
    name: team.name,
    size: team.size
  }));
  const botsByTeamName = new Map<string, BotClient[]>();
  for (const team of teams) {
    botsByTeamName.set(
      team.name,
      bots.filter((bot) => bot.teamName === team.name)
    );
  }

  for (const team of teams) {
    await waitForCondition(async () => {
      const state = await fetchTeamState(team.id, owner.token);
      return state.activeParticipants.length >= team.size;
    }, 30_000, `active participants for ${team.name}`);

    const initialState = await fetchTeamState(team.id, owner.token, { includeHistory: true });
    for (const bot of botsByTeamName.get(team.name) ?? []) {
      bot.latestState = initialState;
    }
  }

  return {
    ownerToken: owner.token,
    teams,
    bots,
    botsByTeamName,
    cleanup: async () => {
      await Promise.all(
        bots.map(
          (bot) =>
            new Promise<void>((resolve) => {
              if (bot.socket.readyState === WebSocket.CLOSED) {
                resolve();
                return;
              }
              bot.socket.once("close", () => resolve());
              bot.socket.close();
            })
        )
      );
    }
  };
}

async function waitForTeamConvergence(teamBots: BotClient[], expectedStatus: "active" | "revealed", expectedAverage: AverageValue | null) {
  await waitForCondition(
    () =>
      teamBots.every((bot) => {
        const round = bot.latestState?.activeRound;
        if (!round) {
          return false;
        }
        if (round.status !== expectedStatus) {
          return false;
        }
        if (expectedStatus === "revealed") {
          return round.revealAverage === expectedAverage;
        }
        return true;
      }),
    30_000,
    `${teamBots[0]?.teamName ?? "team"} convergence`
  );
}

async function runSingleRoomScenario(runKey: string): Promise<ScenarioResult> {
  const startedAt = new Date().toISOString();
  const prepared = await prepareScenario(`phase3-single-${runKey}`, buildPhase3Plans(runKey).singleRoom);
  const sampler = await createResourceSampler();
  const notes: string[] = [];

  try {
    await resetPerfMetrics();
    const team = prepared.teams[0]!;
    const teamBots = prepared.botsByTeamName.get(team.name)!;
    const title = `CAP-200-${runKey}`;
    const createRound = await timedRequest(() => postJson<{ round: { id: string } }>(`/api/teams/${team.id}/rounds`, prepared.ownerToken, { title }));
    const roundId = createRound.result.round.id;
    await waitForTeamConvergence(teamBots, "active", null);

    const voteLatencies = (
      await Promise.all(
        teamBots.map((bot, index) => timedRequest(() => postJson(`/api/teams/${team.id}/rounds/${roundId}/vote`, bot.token, { value: deckVoteCard(index) })))
      )
    ).map((result) => result.latencyMs);

    await waitForRoundVotes(team.id, prepared.ownerToken, team.size);

    const revealStartedMs = performance.now();
    const reveal = await timedRequest(() => postJson<{ round: { revealAverage: AverageValue | null } }>(`/api/teams/${team.id}/rounds/${roundId}/reveal`, prepared.ownerToken, {}));
    await waitForTeamConvergence(teamBots, "revealed", reveal.result.round.revealAverage);
    const revealedFanoutMs = performance.now() - revealStartedMs;

    return {
      name: "single-room-200",
      startedAt,
      completedAt: new Date().toISOString(),
      requestLatencies: {
        createRound: summarize([createRound.latencyMs]),
        castVote: summarize(voteLatencies),
        revealRound: summarize([reveal.latencyMs])
      },
      convergenceMs: {
        revealedFanoutMs: Number(revealedFanoutMs.toFixed(2))
      },
      perfSnapshot: await fetchPerfSnapshot(),
      resources: await sampler.stop(),
      notes
    };
  } finally {
    await prepared.cleanup();
  }
}

async function runParallelScenario(runKey: string): Promise<ScenarioResult> {
  const startedAt = new Date().toISOString();
  const prepared = await prepareScenario(`phase3-parallel-${runKey}`, buildPhase3Plans(runKey).parallel);
  const sampler = await createResourceSampler();
  const notes: string[] = [];

  try {
    await resetPerfMetrics();
    const mainTeam = prepared.teams.find((team) => team.size === 200)!;

    const createRoundResults = await Promise.all(
      prepared.teams.map((team, index) =>
        timedRequest(() =>
          postJson<{ round: { id: string } }>(`/api/teams/${team.id}/rounds`, prepared.ownerToken, { title: `PAR-${index + 1}-${runKey}` })
        ).then((result) => ({ team, ...result }))
      )
    );

    const votePromises: Array<Promise<{ latencyMs: number }>> = [];
    const mainVotePromises: Array<Promise<{ latencyMs: number }>> = [];
    const sideVotePromises: Array<Promise<{ latencyMs: number }>> = [];
    for (const team of prepared.teams) {
      const teamBots = prepared.botsByTeamName.get(team.name)!;
      const roundId = createRoundResults.find((result) => result.team.id === team.id)!.result.round.id;
      for (const [index, bot] of teamBots.entries()) {
        const votePromise = timedRequest(() => postJson(`/api/teams/${team.id}/rounds/${roundId}/vote`, bot.token, { value: deckVoteCard(index) }));
        votePromises.push(votePromise);
        if (team.id === mainTeam.id) {
          mainVotePromises.push(votePromise);
        } else {
          sideVotePromises.push(votePromise);
        }
      }
    }

    const voteLatencies = (await Promise.all(votePromises)).map((result) => result.latencyMs);
    const mainVoteLatencies = (await Promise.all(mainVotePromises)).map((result) => result.latencyMs);
    const sideVoteLatencies = (await Promise.all(sideVotePromises)).map((result) => result.latencyMs);

    await Promise.all(prepared.teams.map((team) => waitForRoundVotes(team.id, prepared.ownerToken, team.size)));

    const revealStartedMs = performance.now();
    const revealResults = await Promise.all(
      prepared.teams.map((team) => {
        const roundId = createRoundResults.find((result) => result.team.id === team.id)!.result.round.id;
        return timedRequest(() => postJson<{ round: { revealAverage: AverageValue | null } }>(`/api/teams/${team.id}/rounds/${roundId}/reveal`, prepared.ownerToken, {})).then((result) => ({
          team,
          ...result
        }));
      })
    );

    const mainRevealResult = revealResults.find((result) => result.team.id === mainTeam.id)!;
    const mainRevealConvergence = waitForTeamConvergence(
      prepared.botsByTeamName.get(mainTeam.name)!,
      "revealed",
      mainRevealResult.result.round.revealAverage
    ).then(() => performance.now() - revealStartedMs);
    const sideRevealConvergences = revealResults
      .filter((result) => result.team.id !== mainTeam.id)
      .map((result) =>
        waitForTeamConvergence(prepared.botsByTeamName.get(result.team.name)!, "revealed", result.result.round.revealAverage).then(
          () => performance.now() - revealStartedMs
        )
      );
    const [mainRoomRevealedFanoutMs, ...sideRoomRevealFanouts] = await Promise.all([mainRevealConvergence, ...sideRevealConvergences]);
    const revealedFanoutMs = performance.now() - revealStartedMs;
    const maxSideRoomsRevealedFanoutMs = sideRoomRevealFanouts.length > 0 ? Math.max(...sideRoomRevealFanouts) : 0;

    return {
      name: "parallel-200-plus-20x10",
      startedAt,
      completedAt: new Date().toISOString(),
      requestLatencies: {
        createRound: summarize(createRoundResults.map((result) => result.latencyMs)),
        createRoundMainRoom: summarize([createRoundResults.find((result) => result.team.id === mainTeam.id)!.latencyMs]),
        createRoundSideRooms: summarize(createRoundResults.filter((result) => result.team.id !== mainTeam.id).map((result) => result.latencyMs)),
        castVote: summarize(voteLatencies),
        castVoteMainRoom: summarize(mainVoteLatencies),
        castVoteSideRooms: summarize(sideVoteLatencies),
        revealRound: summarize(revealResults.map((result) => result.latencyMs)),
        revealRoundMainRoom: summarize([mainRevealResult.latencyMs]),
        revealRoundSideRooms: summarize(revealResults.filter((result) => result.team.id !== mainTeam.id).map((result) => result.latencyMs))
      },
      convergenceMs: {
        mainRoomRevealedFanoutMs: Number(mainRoomRevealedFanoutMs.toFixed(2)),
        maxSideRoomsRevealedFanoutMs: Number(maxSideRoomsRevealedFanoutMs.toFixed(2)),
        allTeamsRevealedFanoutMs: Number(revealedFanoutMs.toFixed(2))
      },
      perfSnapshot: await fetchPerfSnapshot(),
      resources: await sampler.stop(),
      notes
    };
  } finally {
    await prepared.cleanup();
  }
}

async function runBurstScenario(runKey: string): Promise<ScenarioResult> {
  const startedAt = new Date().toISOString();
  const prepared = await prepareScenario(`phase3-burst-${runKey}`, buildPhase3Plans(runKey).burst);
  const sampler = await createResourceSampler();
  const notes: string[] = [];

  try {
    await resetPerfMetrics();
    const team = prepared.teams[0]!;
    const teamBots = prepared.botsByTeamName.get(team.name)!;

    const round = await timedRequest(() => postJson<{ round: { id: string } }>(`/api/teams/${team.id}/rounds`, prepared.ownerToken, { title: `BURST-1-${runKey}` }));
    const roundId = round.result.round.id;
    await waitForTeamConvergence(teamBots, "active", null);

    const burstVoteLatencies = (
      await Promise.all(
        teamBots.map((bot, index) => timedRequest(() => postJson(`/api/teams/${team.id}/rounds/${roundId}/vote`, bot.token, { value: deckVoteCard(index) })))
      )
    ).map((result) => result.latencyMs);

    await waitForRoundVotes(team.id, prepared.ownerToken, team.size);

    const revealStartedMs = performance.now();
    const reveal = await timedRequest(() => postJson<{ round: { revealAverage: AverageValue | null } }>(`/api/teams/${team.id}/rounds/${roundId}/reveal`, prepared.ownerToken, {}));
    await waitForTeamConvergence(teamBots, "revealed", reveal.result.round.revealAverage);
    const revealedFanoutMs = performance.now() - revealStartedMs;

    const lateVotes = await Promise.all(
      teamBots.slice(0, 20).map((bot, index) =>
        postJsonAllowConflict(`/api/teams/${team.id}/rounds/${roundId}/vote`, bot.token, { value: deckVoteCard(index + 2) })
      )
    );
    const rejectedLateVotes = lateVotes.filter((vote) => vote.status === 409).length;
    notes.push(`Late vote rejections after reveal: ${rejectedLateVotes}/${lateVotes.length}`);

    const revealedState = await fetchTeamState(team.id, prepared.ownerToken, { includeHistory: true });
    const historyEntryId = revealedState.history[0]?.id;
    if (!historyEntryId) {
      throw new Error("Burst scenario did not persist a history entry after reveal");
    }

    const voteAgainStartedMs = performance.now();
    const voteAgain = await timedRequest(() =>
      postJson<{ round: { id: string } }>(`/api/teams/${team.id}/history/${historyEntryId}/vote-again`, prepared.ownerToken, {})
    );
    await waitForTeamConvergence(teamBots, "active", null);
    const voteAgainFanoutMs = performance.now() - voteAgainStartedMs;
    const nextRoundId = voteAgain.result.round.id;

    const secondBurstLatencies = (
      await Promise.all(
        teamBots.map((bot, index) => timedRequest(() => postJson(`/api/teams/${team.id}/rounds/${nextRoundId}/vote`, bot.token, { value: deckVoteCard(index + 3) })))
      )
    ).map((result) => result.latencyMs);

    await waitForRoundVotes(team.id, prepared.ownerToken, team.size);

    return {
      name: "burst-80",
      startedAt,
      completedAt: new Date().toISOString(),
      requestLatencies: {
        createRound: summarize([round.latencyMs]),
        burstVotes: summarize(burstVoteLatencies),
        revealRound: summarize([reveal.latencyMs]),
        voteAgain: summarize([voteAgain.latencyMs]),
        secondBurstVotes: summarize(secondBurstLatencies)
      },
      convergenceMs: {
        revealedFanoutMs: Number(revealedFanoutMs.toFixed(2)),
        voteAgainFanoutMs: Number(voteAgainFanoutMs.toFixed(2))
      },
      perfSnapshot: await fetchPerfSnapshot(),
      resources: await sampler.stop(),
      notes
    };
  } finally {
    await prepared.cleanup();
  }
}

function renderTimingTable(snapshot: PerfSnapshot) {
  const lines = ["| Metric | Count | Avg ms | P95 ms | Max ms |", "| --- | ---: | ---: | ---: | ---: |"];
  for (const [name, timing] of Object.entries(snapshot.timings)) {
    lines.push(`| ${name} | ${timing.count} | ${timing.avgMs} | ${timing.p95Ms} | ${timing.maxMs} |`);
  }
  return lines.join("\n");
}

function renderGaugeTable(snapshot: PerfSnapshot) {
  const gauges = Object.entries(snapshot.gauges);
  if (gauges.length === 0) {
    return "- No gauges captured";
  }

  const lines = ["| Gauge | Value |", "| --- | ---: |"];
  for (const [name, value] of gauges) {
    lines.push(`| ${name} | ${value} |`);
  }
  return lines.join("\n");
}

function renderCriticalPathBreakdown(snapshot: PerfSnapshot) {
  const httpCastVote = snapshot.timings["http.castVote"];
  const repositoryCastVote = snapshot.timings["repository.castVote"];
  const voteQueueWait = snapshot.timings["broadcast.team.vote.queueWait"];
  const voteDuration = snapshot.timings["broadcast.team.vote.duration"];
  const roundQueueWait = snapshot.timings["broadcast.team.round.queueWait"] ?? snapshot.timings["broadcast.team.update.queueWait"];
  const roundDuration = snapshot.timings["broadcast.team.round.duration"] ?? snapshot.timings["broadcast.team.update.duration"];
  const eventLoopMean = snapshot.gauges["eventLoopDelay.meanMs"];
  const eventLoopP95 = snapshot.gauges["eventLoopDelay.p95Ms"];

  const lines = ["| Slice | Avg ms | P95 ms | Notes |", "| --- | ---: | ---: | --- |"];
  if (httpCastVote) {
    lines.push(`| http.castVote | ${httpCastVote.avgMs} | ${httpCastVote.p95Ms} | Full request handling time before the response is sent |`);
  }
  if (repositoryCastVote) {
    lines.push(`| repository.castVote | ${repositoryCastVote.avgMs} | ${repositoryCastVote.p95Ms} | Database-backed vote mutation time inside the request |`);
  }
  if (httpCastVote && repositoryCastVote) {
    lines.push(
      `| castVote handler overhead | ${Number((httpCastVote.avgMs - repositoryCastVote.avgMs).toFixed(2))} | ${Number(
        (httpCastVote.p95Ms - repositoryCastVote.p95Ms).toFixed(2)
      )} | Validation/serialization/handler overhead above the repository call |`
    );
  }
  if (voteQueueWait) {
    lines.push(`| broadcast.team.vote.queueWait | ${voteQueueWait.avgMs} | ${voteQueueWait.p95Ms} | Time spent waiting in the routine vote broadcast queue before fanout |`);
  }
  if (voteDuration) {
    lines.push(`| broadcast.team.vote.duration | ${voteDuration.avgMs} | ${voteDuration.p95Ms} | Vote-lane websocket send and payload construction time |`);
  }
  if (roundQueueWait) {
    lines.push(`| broadcast.team.round.queueWait | ${roundQueueWait.avgMs} | ${roundQueueWait.p95Ms} | Time spent waiting in the reveal / round-transition broadcast queue before fanout |`);
  }
  if (roundDuration) {
    lines.push(`| broadcast.team.round.duration | ${roundDuration.avgMs} | ${roundDuration.p95Ms} | Reveal / round-transition websocket send and payload construction time |`);
  }
  if (eventLoopMean !== undefined || eventLoopP95 !== undefined) {
    lines.push(`| eventLoopDelay | ${eventLoopMean ?? "-"} | ${eventLoopP95 ?? "-"} | Event-loop pressure gauge sampled during the run |`);
  }

  return lines.join("\n");
}

function renderScenarioMarkdown(result: ScenarioResult) {
  const requestLines = Object.entries(result.requestLatencies)
    .map(([name, summary]) => `- ${name}: count=${summary.count}, avg=${summary.avgMs}ms, p95=${summary.p95Ms}ms, max=${summary.maxMs}ms`)
    .join("\n");
  const resourceLines = result.resources
    ? `- CPU avg/max: ${result.resources.avgCpuPercent}% / ${result.resources.maxCpuPercent}%\n- Memory avg/max: ${result.resources.avgMemoryMiB} MiB / ${result.resources.maxMemoryMiB} MiB`
    : "- Resource stats unavailable from podman in this run";
  const convergenceLines = Object.entries(result.convergenceMs).length
    ? Object.entries(result.convergenceMs)
        .map(([name, value]) => `- ${name}: ${value}ms`)
        .join("\n")
    : "- No convergence measurements recorded";
  const notes = result.notes.length ? result.notes.map((note) => `- ${note}`).join("\n") : "- No extra notes";

  return `## ${result.name}

- Started: ${result.startedAt}
- Completed: ${result.completedAt}

### Request Latencies
${requestLines}

### Resource Summary
${resourceLines}

### Convergence Timing
${convergenceLines}

### Notes
${notes}

### App Metrics Snapshot
${renderTimingTable(result.perfSnapshot)}

### Critical Path Breakdown
${renderCriticalPathBreakdown(result.perfSnapshot)}

### Gauges
${renderGaugeTable(result.perfSnapshot)}
`;
}

function writeReport(results: ScenarioResult[]) {
  fs.mkdirSync(outputDir, { recursive: true });
  const generatedAt = new Date();
  const generatedAtIso = generatedAt.toISOString();
  const timestamp = formatArtifactTimestamp(generatedAt);
  const timestampedMarkdownPath = path.join(outputDir, `PHASE3_CAPACITY_VALIDATION_${timestamp}.md`);
  const timestampedJsonPath = path.join(outputDir, `phase3-capacity-validation.${timestamp}.json`);
  const markdown = `# Phase 3 Capacity Validation Report

Generated: ${generatedAtIso}
Base URL: ${baseUrl}

${results.map((result) => renderScenarioMarkdown(result)).join("\n")}
`;

  fs.writeFileSync(reportMarkdownPath, markdown, "utf8");
  fs.writeFileSync(timestampedMarkdownPath, markdown, "utf8");

  const jsonPayload = JSON.stringify({ generatedAt: generatedAtIso, baseUrl, results }, null, 2);
  fs.writeFileSync(reportJsonPath, jsonPayload, "utf8");
  fs.writeFileSync(timestampedJsonPath, jsonPayload, "utf8");

  return {
    latestMarkdownPath: reportMarkdownPath,
    latestJsonPath: reportJsonPath,
    timestampedMarkdownPath,
    timestampedJsonPath
  };
}

async function verifyPhase3() {
  const runKey = Date.now().toString(36);
  const results = [await runSingleRoomScenario(runKey), await runParallelScenario(runKey), await runBurstScenario(runKey)];
  const artifactPaths = writeReport(results);
  console.log(`[phase3] wrote latest report to ${artifactPaths.latestMarkdownPath}`);
  console.log(`[phase3] wrote latest raw json to ${artifactPaths.latestJsonPath}`);
  console.log(`[phase3] wrote timestamped report to ${artifactPaths.timestampedMarkdownPath}`);
  console.log(`[phase3] wrote timestamped raw json to ${artifactPaths.timestampedJsonPath}`);
}

export async function main() {
  if (mode !== "verify") {
    throw new Error(`Unsupported load mode: ${mode}`);
  }
  await verifyPhase3();
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  main().catch((error) => {
    console.error("[phase3] fatal error", error);
    process.exitCode = 1;
  });
}
