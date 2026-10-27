<!--
SPDX-FileCopyrightText: 2026 Atanas G. Rusev
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Public Benchmark Summary

[Documentation index](../README.md) · [Project home](../../README.md)

Status: Public alpha benchmark summary

The latest saved capacity validation shows low-latency application-level request handling and realtime broadcast slices under simulated load. Application processing and broadcast timings are distinct from end-to-end client request latency; the latter includes network and load-generator overhead.

Source artifact:

- [Full capacity report](perf_runs/PHASE3_CAPACITY_VALIDATION_LATEST.md)
- [Machine-readable results](perf_runs/phase3-capacity-validation.latest.json)

## Headline

Low-latency realtime voting tested with simulated sessions up to 400 concurrent users.

## Latest Scenarios

| Scenario | Shape | Key result |
| --- | --- | --- |
| `single-room-200` | One 200-user room | App-level `http.castVote` average `0.58ms`, p95 `1.41ms`; reveal fanout `154.49ms`. |
| `parallel-200-plus-20x10` | One 200-user room plus 20 side rooms with 10 users each | App-level `http.castVote` average `0.59ms`, p95 `1.47ms`; all-teams reveal fanout `335.98ms`. |
| `burst-80` | 80-user burst voting and vote-again flow | App-level `http.castVote` average `0.44ms`, p95 `1.01ms`; reveal fanout `156.26ms`; vote-again fanout `153.36ms`. |

## Caveats

- These are simulated sessions, not a production SLA.
- Scripted client request latencies include load-generator/client-side effects and are higher in the mixed 400-vote scenario.
- These results do not establish a guaranteed response time for every browser, network or production workload.
- The full raw report remains the source of truth.
