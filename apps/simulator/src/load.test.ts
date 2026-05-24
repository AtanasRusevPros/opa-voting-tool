// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { buildPhase3Plans, summarize } from "./load.js";

describe("phase 3 load helpers", () => {
  it("builds the expected team sizes for each validation phase", () => {
    const plans = buildPhase3Plans("demo");

    expect(plans.singleRoom).toEqual([{ name: "Capacity Main demo", size: 200 }]);
    expect(plans.parallel[0]).toEqual({ name: "Capacity Main demo", size: 200 });
    expect(plans.parallel.slice(1)).toHaveLength(20);
    expect(plans.parallel.slice(1).every((team) => team.size === 10)).toBe(true);
    expect(plans.burst).toEqual([{ name: "Capacity Burst demo", size: 80 }]);
  });

  it("summarizes latency samples deterministically", () => {
    expect(summarize([10, 20, 30, 40, 50])).toEqual({
      count: 5,
      avgMs: 30,
      p50Ms: 30,
      p95Ms: 50,
      maxMs: 50
    });
  });
});
