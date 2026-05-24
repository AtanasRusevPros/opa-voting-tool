# Phase 3 Capacity Validation Report

Generated: 2026-04-29T06:02:06.125Z
Base URL: http://127.0.0.1:3001

## single-room-200

- Started: 2026-04-29T06:01:59.743Z
- Completed: 2026-04-29T06:02:01.932Z

### Request Latencies
- createRound: count=1, avg=3ms, p95=3ms, max=3ms
- castVote: count=200, avg=149.93ms, p95=237.5ms, max=247.58ms
- revealRound: count=1, avg=3.3ms, p95=3.3ms, max=3.3ms

### Resource Summary
- CPU avg/max: 15.36% / 15.36%
- Memory avg/max: 147.89 MiB / 147.89 MiB

### Convergence Timing
- revealedFanoutMs: 154.49ms

### Notes
- No extra notes

### App Metrics Snapshot
| Metric | Count | Avg ms | P95 ms | Max ms |
| --- | ---: | ---: | ---: | ---: |
| broadcast.team.round.duration | 2 | 4.82 | 7.08 | 7.08 |
| broadcast.team.round.payloadBuild | 2 | 0.05 | 0.09 | 0.09 |
| broadcast.team.round.payloadBytes | 2 | 24330.5 | 48024 | 48024 |
| broadcast.team.round.queueWait | 2 | 44.28 | 44.84 | 44.84 |
| broadcast.team.round.recipients | 2 | 200 | 200 | 200 |
| broadcast.team.vote.deltaUsers | 3 | 52.33 | 72 | 72 |
| broadcast.team.vote.duration | 3 | 1.62 | 1.92 | 1.92 |
| broadcast.team.vote.payloadBuild | 39 | 0 | 0.01 | 0.01 |
| broadcast.team.vote.payloadBytes | 39 | 496.28 | 566 | 567 |
| broadcast.team.vote.queueWait | 3 | 0.97 | 1.17 | 1.17 |
| broadcast.team.vote.recipients | 3 | 200 | 200 | 200 |
| broadcast.team.vote.versionSpan | 3 | 52.33 | 72 | 72 |
| http.castVote | 200 | 0.58 | 1.41 | 4.81 |
| http.createRound | 1 | 1.21 | 1.21 | 1.21 |
| http.revealRound | 1 | 2.26 | 2.26 | 2.26 |
| http.teamState | 1 | 1.5 | 1.5 | 1.5 |
| repository.castVote | 200 | 0.29 | 0.83 | 2.38 |
| repository.createRound | 1 | 0.79 | 0.79 | 0.79 |
| repository.revealRound | 1 | 1.69 | 1.69 | 1.69 |
| roomEngine.checkpointRefresh | 2 | 0.01 | 0.01 | 0.01 |
| roomEngine.pendingVoteDeltaUsers | 3 | 52.33 | 72 | 72 |
| roomEngine.voteDeltaUsers | 200 | 29.02 | 62 | 72 |

### Critical Path Breakdown
| Slice | Avg ms | P95 ms | Notes |
| --- | ---: | ---: | --- |
| http.castVote | 0.58 | 1.41 | Full request handling time before the response is sent |
| repository.castVote | 0.29 | 0.83 | Database-backed vote mutation time inside the request |
| castVote handler overhead | 0.29 | 0.58 | Validation/serialization/handler overhead above the repository call |
| broadcast.team.vote.queueWait | 0.97 | 1.17 | Time spent waiting in the routine vote broadcast queue before fanout |
| broadcast.team.vote.duration | 1.62 | 1.92 | Vote-lane websocket send and payload construction time |
| broadcast.team.round.queueWait | 44.28 | 44.84 | Time spent waiting in the reveal / round-transition broadcast queue before fanout |
| broadcast.team.round.duration | 4.82 | 7.08 | Reveal / round-transition websocket send and payload construction time |

### Gauges
| Gauge | Value |
| --- | ---: |
| broadcast.team.backpressureQueueDepth | 0 |
| broadcast.team.pendingQueueDepth | 0 |
| broadcast.team.postDrainQueueDepth | 0 |
| broadcast.team.readyQueueDepth | 0 |
| broadcast.team.vote.flushPendingCount | 0 |

## parallel-200-plus-20x10

- Started: 2026-04-29T06:02:01.965Z
- Completed: 2026-04-29T06:02:04.954Z

### Request Latencies
- createRound: count=21, avg=17.49ms, p95=26.77ms, max=27.13ms
- createRoundMainRoom: count=1, avg=5.95ms, p95=5.95ms, max=5.95ms
- createRoundSideRooms: count=20, avg=18.07ms, p95=26.77ms, max=27.13ms
- castVote: count=400, avg=280.22ms, p95=450.41ms, max=464.74ms
- castVoteMainRoom: count=200, avg=176.48ms, p95=273.1ms, max=284.36ms
- castVoteSideRooms: count=200, avg=383.95ms, p95=457.14ms, max=464.74ms
- revealRound: count=21, avg=18.34ms, p95=28.03ms, max=29.25ms
- revealRoundMainRoom: count=1, avg=6.73ms, p95=6.73ms, max=6.73ms
- revealRoundSideRooms: count=20, avg=18.92ms, p95=28.03ms, max=29.25ms

### Resource Summary
- CPU avg/max: 21.76% / 21.76%
- Memory avg/max: 157.92 MiB / 157.92 MiB

### Convergence Timing
- mainRoomRevealedFanoutMs: 335.95ms
- maxSideRoomsRevealedFanoutMs: 335.96ms
- allTeamsRevealedFanoutMs: 335.98ms

### Notes
- No extra notes

### App Metrics Snapshot
| Metric | Count | Avg ms | P95 ms | Max ms |
| --- | ---: | ---: | ---: | ---: |
| broadcast.team.round.duration | 42 | 0.37 | 0.34 | 9.24 |
| broadcast.team.round.payloadBuild | 42 | 0.01 | 0.02 | 0.1 |
| broadcast.team.round.payloadBytes | 42 | 3049.4 | 3336 | 48024 |
| broadcast.team.round.queueWait | 42 | 133.01 | 304.97 | 305.8 |
| broadcast.team.round.recipients | 42 | 19.05 | 10 | 200 |
| broadcast.team.vote.deltaUsers | 25 | 14.52 | 10 | 200 |
| broadcast.team.vote.duration | 25 | 0.2 | 0.49 | 1.44 |
| broadcast.team.vote.payloadBuild | 238 | 0 | 0 | 0.01 |
| broadcast.team.vote.payloadBytes | 238 | 370.54 | 1069 | 1071 |
| broadcast.team.vote.queueWait | 25 | 7.75 | 3.81 | 166.02 |
| broadcast.team.vote.recipients | 25 | 17.6 | 10 | 200 |
| broadcast.team.vote.versionSpan | 25 | 14.52 | 10 | 200 |
| http.castVote | 400 | 0.59 | 1.47 | 3.71 |
| http.createRound | 21 | 0.72 | 1.93 | 2.75 |
| http.revealRound | 21 | 0.82 | 1.63 | 2.3 |
| http.teamState | 21 | 0.85 | 0.89 | 2.1 |
| repository.castVote | 400 | 0.32 | 0.9 | 3.21 |
| repository.createRound | 21 | 0.55 | 1.67 | 2.13 |
| repository.revealRound | 21 | 0.64 | 1.47 | 1.82 |
| roomEngine.checkpointRefresh | 42 | 0 | 0 | 0.01 |
| roomEngine.pendingVoteDeltaUsers | 25 | 14.52 | 10 | 200 |
| roomEngine.voteDeltaUsers | 400 | 52.59 | 180 | 200 |

### Critical Path Breakdown
| Slice | Avg ms | P95 ms | Notes |
| --- | ---: | ---: | --- |
| http.castVote | 0.59 | 1.47 | Full request handling time before the response is sent |
| repository.castVote | 0.32 | 0.9 | Database-backed vote mutation time inside the request |
| castVote handler overhead | 0.27 | 0.57 | Validation/serialization/handler overhead above the repository call |
| broadcast.team.vote.queueWait | 7.75 | 3.81 | Time spent waiting in the routine vote broadcast queue before fanout |
| broadcast.team.vote.duration | 0.2 | 0.49 | Vote-lane websocket send and payload construction time |
| broadcast.team.round.queueWait | 133.01 | 304.97 | Time spent waiting in the reveal / round-transition broadcast queue before fanout |
| broadcast.team.round.duration | 0.37 | 0.34 | Reveal / round-transition websocket send and payload construction time |
| eventLoopDelay | 22.59 | 25.2 | Event-loop pressure gauge sampled during the run |

### Gauges
| Gauge | Value |
| --- | ---: |
| broadcast.team.backpressureQueueDepth | 0 |
| broadcast.team.pendingQueueDepth | 0 |
| broadcast.team.postDrainQueueDepth | 0 |
| broadcast.team.readyQueueDepth | 0 |
| broadcast.team.vote.flushPendingCount | 0 |
| eventLoopDelay.maxMs | 195.04 |
| eventLoopDelay.meanMs | 22.59 |
| eventLoopDelay.p95Ms | 25.2 |

## burst-80

- Started: 2026-04-29T06:02:05.022Z
- Completed: 2026-04-29T06:02:06.111Z

### Request Latencies
- createRound: count=1, avg=3.38ms, p95=3.38ms, max=3.38ms
- burstVotes: count=80, avg=53.14ms, p95=74.97ms, max=77.39ms
- revealRound: count=1, avg=5.29ms, p95=5.29ms, max=5.29ms
- voteAgain: count=1, avg=2.65ms, p95=2.65ms, max=2.65ms
- secondBurstVotes: count=80, avg=49.87ms, p95=70.23ms, max=72.47ms

### Resource Summary
- CPU avg/max: 23.19% / 23.19%
- Memory avg/max: 178.91 MiB / 178.91 MiB

### Convergence Timing
- revealedFanoutMs: 156.26ms
- voteAgainFanoutMs: 153.36ms

### Notes
- Late vote rejections after reveal: 20/20

### App Metrics Snapshot
| Metric | Count | Avg ms | P95 ms | Max ms |
| --- | ---: | ---: | ---: | ---: |
| broadcast.team.round.duration | 3 | 1.5 | 2.12 | 2.12 |
| broadcast.team.round.payloadBuild | 3 | 0.02 | 0.04 | 0.04 |
| broadcast.team.round.payloadBytes | 3 | 7031 | 19800 | 19800 |
| broadcast.team.round.queueWait | 3 | 35.55 | 36.91 | 36.91 |
| broadcast.team.round.recipients | 3 | 80 | 80 | 80 |
| broadcast.team.vote.deltaUsers | 2 | 80 | 80 | 80 |
| broadcast.team.vote.duration | 2 | 0.5 | 0.51 | 0.51 |
| broadcast.team.vote.payloadBuild | 24 | 0 | 0 | 0 |
| broadcast.team.vote.payloadBytes | 24 | 550.58 | 552 | 552 |
| broadcast.team.vote.queueWait | 2 | 1.87 | 1.96 | 1.96 |
| broadcast.team.vote.recipients | 2 | 80 | 80 | 80 |
| broadcast.team.vote.versionSpan | 2 | 80 | 80 | 80 |
| http.castVote | 180 | 0.44 | 1.01 | 2.68 |
| http.createRound | 1 | 1.25 | 1.25 | 1.25 |
| http.revealRound | 1 | 1.17 | 1.17 | 1.17 |
| http.teamState | 3 | 1.2 | 1.23 | 1.23 |
| http.voteAgain | 1 | 1.57 | 1.57 | 1.57 |
| repository.castVote | 180 | 0.24 | 0.69 | 1.96 |
| repository.createRound | 2 | 0.63 | 0.78 | 0.78 |
| repository.revealRound | 1 | 0.96 | 0.96 | 0.96 |
| roomEngine.checkpointRefresh | 3 | 0 | 0 | 0 |
| roomEngine.pendingVoteDeltaUsers | 2 | 80 | 80 | 80 |
| roomEngine.voteDeltaUsers | 160 | 40.5 | 76 | 80 |

### Critical Path Breakdown
| Slice | Avg ms | P95 ms | Notes |
| --- | ---: | ---: | --- |
| http.castVote | 0.44 | 1.01 | Full request handling time before the response is sent |
| repository.castVote | 0.24 | 0.69 | Database-backed vote mutation time inside the request |
| castVote handler overhead | 0.2 | 0.32 | Validation/serialization/handler overhead above the repository call |
| broadcast.team.vote.queueWait | 1.87 | 1.96 | Time spent waiting in the routine vote broadcast queue before fanout |
| broadcast.team.vote.duration | 0.5 | 0.51 | Vote-lane websocket send and payload construction time |
| broadcast.team.round.queueWait | 35.55 | 36.91 | Time spent waiting in the reveal / round-transition broadcast queue before fanout |
| broadcast.team.round.duration | 1.5 | 2.12 | Reveal / round-transition websocket send and payload construction time |

### Gauges
| Gauge | Value |
| --- | ---: |
| broadcast.team.backpressureQueueDepth | 0 |
| broadcast.team.pendingQueueDepth | 0 |
| broadcast.team.postDrainQueueDepth | 0 |
| broadcast.team.readyQueueDepth | 0 |
| broadcast.team.vote.flushPendingCount | 0 |

