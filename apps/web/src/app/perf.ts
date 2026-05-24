// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect } from "react";
import type { PerfCounterName, PerfStore } from "./types";

declare global {
  interface Window {
    __PLANNING_POKER_PERF__?: PerfStore & {
      snapshot: () => Record<PerfCounterName, number>;
      getLastUpdatedAt: () => number;
      markUpdatedAt: () => void;
    };
  }
}

function getPerfStore() {
  if (typeof window === "undefined") {
    return null;
  }

  if (!window.__PLANNING_POKER_PERF__) {
    const counters: Record<PerfCounterName, number> = {
      boardLayoutCalcs: 0,
      participantRingRenders: 0,
      memberTileRenders: 0,
      historyRailRenders: 0
    };
    let lastUpdatedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    window.__PLANNING_POKER_PERF__ = {
      counters,
      reset: () => {
        counters.boardLayoutCalcs = 0;
        counters.participantRingRenders = 0;
        counters.memberTileRenders = 0;
        counters.historyRailRenders = 0;
        lastUpdatedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
      },
      snapshot: () => ({ ...counters }),
      getLastUpdatedAt: () => lastUpdatedAt,
      markUpdatedAt: () => {
        lastUpdatedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
      },
      increment: (name: PerfCounterName) => {
        counters[name] += 1;
        lastUpdatedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
      }
    };
  }

  return window.__PLANNING_POKER_PERF__;
}

export function incrementPerfCounter(name: PerfCounterName) {
  const store = getPerfStore();
  if (!store) {
    return;
  }
  store.counters[name] += 1;
  store.markUpdatedAt();
}

export function usePerfRenderCounter(name: PerfCounterName) {
  useEffect(() => {
    incrementPerfCounter(name);
  });
}
