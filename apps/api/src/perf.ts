// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

type CounterMap = Record<string, number>;
type GaugeMap = Record<string, number>;

export type TimingStats = {
  count: number;
  minMs: number;
  maxMs: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
};

export type PerfSnapshot = {
  generatedAt: string;
  counters: CounterMap;
  gauges: GaugeMap;
  timings: Record<string, TimingStats>;
};

function summarizeSamples(samples: number[]): TimingStats {
  const sorted = [...samples].sort((left, right) => left - right);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  const atPercentile = (percentile: number) => {
    if (sorted.length === 0) {
      return 0;
    }
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * percentile) - 1));
    return Number(sorted[index]!.toFixed(2));
  };

  return {
    count: sorted.length,
    minMs: Number(sorted[0]!.toFixed(2)),
    maxMs: Number(sorted.at(-1)!.toFixed(2)),
    avgMs: Number((total / sorted.length).toFixed(2)),
    p50Ms: atPercentile(0.5),
    p95Ms: atPercentile(0.95)
  };
}

class PerfTracker {
  private counters = new Map<string, number>();
  private gauges = new Map<string, number>();
  private samples = new Map<string, number[]>();

  reset() {
    this.counters.clear();
    this.gauges.clear();
    this.samples.clear();
  }

  incrementCounter(name: string, amount = 1) {
    this.counters.set(name, (this.counters.get(name) ?? 0) + amount);
  }

  setGauge(name: string, value: number) {
    this.gauges.set(name, value);
  }

  observe(name: string, value: number) {
    const current = this.samples.get(name) ?? [];
    current.push(value);
    this.samples.set(name, current);
  }

  recordDuration(name: string, startMs: number) {
    this.observe(name, performance.now() - startMs);
  }

  measure<T>(name: string, work: () => T): T {
    const startMs = performance.now();
    try {
      return work();
    } catch (error) {
      if (error instanceof Error && error.message.includes("SQLITE_BUSY")) {
        this.incrementCounter("repository.sqliteBusyErrors");
      }
      this.incrementCounter(`${name}.errors`);
      throw error;
    } finally {
      this.recordDuration(name, startMs);
    }
  }

  snapshot(): PerfSnapshot {
    const counters = Object.fromEntries([...this.counters.entries()].sort(([left], [right]) => left.localeCompare(right)));
    const gauges = Object.fromEntries([...this.gauges.entries()].sort(([left], [right]) => left.localeCompare(right)));
    const timings = Object.fromEntries(
      [...this.samples.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, values]) => [name, summarizeSamples(values)])
    );

    return {
      generatedAt: new Date().toISOString(),
      counters,
      gauges,
      timings
    };
  }
}

export const perfTracker = new PerfTracker();
