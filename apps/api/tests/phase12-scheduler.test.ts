// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  computeTeamBroadcastBackpressureMs,
  computeTeamVoteDeltaFlushMs,
  selectNextReadyTeamBroadcast
} from "../src/broadcastScheduler.js";

describe("Phase 12 scheduler with Phase 11 traffic policy", () => {
  it("uses a fixed Phase 11-style vote flush window", () => {
    expect(computeTeamVoteDeltaFlushMs({ recipients: 12, activeRoomCount: 1, readyDepth: 0 })).toBe(60);
    expect(computeTeamVoteDeltaFlushMs({ recipients: 80, activeRoomCount: 2, readyDepth: 0 })).toBe(60);
    expect(computeTeamVoteDeltaFlushMs({ recipients: 200, activeRoomCount: 5, readyDepth: 6 })).toBe(60);
  });

  it("keeps vote and round lanes unblocked while still slowing heavy full updates", () => {
    expect(computeTeamBroadcastBackpressureMs({ mode: "vote", recipients: 200, activeRoomCount: 1, readyDepth: 0 })).toBe(0);
    expect(computeTeamBroadcastBackpressureMs({ mode: "vote", recipients: 200, activeRoomCount: 4, readyDepth: 8 })).toBe(0);
    expect(computeTeamBroadcastBackpressureMs({ mode: "round", recipients: 200, activeRoomCount: 4, readyDepth: 8 })).toBe(0);
    expect(computeTeamBroadcastBackpressureMs({ mode: "full", recipients: 200, activeRoomCount: 4, readyDepth: 8 })).toBe(60);
  });

  it("gives sufficiently aged round work a higher weighted score than routine vote work", () => {
    const winner = selectNextReadyTeamBroadcast(
      [
        { teamId: "round", mode: "round", queuedAt: 970, recipients: 200 },
        { teamId: "main", mode: "vote", queuedAt: 996, recipients: 200 },
        { teamId: "side", mode: "vote", queuedAt: 996, recipients: 12 }
      ],
      {
        nowMs: 1000,
        starvationMs: 120
      }
    );

    expect(winner).toBe("round");
  });

  it("prefers the highest weighted score, which still favors a small-room vote burst over a large-room one", () => {
    const winner = selectNextReadyTeamBroadcast(
      [
        { teamId: "main", mode: "vote", queuedAt: 996, recipients: 200 },
        { teamId: "side", mode: "vote", queuedAt: 993, recipients: 12 }
      ],
      {
        nowMs: 1000,
        starvationMs: 120
      }
    );

    expect(winner).toBe("side");
  });

  it("still respects starvation bypass for old queued work", () => {
    const winner = selectNextReadyTeamBroadcast(
      [
        { teamId: "main", mode: "round", queuedAt: 950, recipients: 200 },
        { teamId: "side", mode: "vote", queuedAt: 700, recipients: 8 }
      ],
      {
        nowMs: 1000,
        starvationMs: 120
      }
    );

    expect(winner).toBe("side");
  });
});
