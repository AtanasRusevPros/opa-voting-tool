<!--
SPDX-FileCopyrightText: 2026 Atanas G. Rusev
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Development And Verification

[Documentation index](../README.md) · [Project home](../../README.md)

<details>
<summary>Contents</summary>

- [Local Node Runtime](#local-node-runtime)
- [Container Workflow](#container-workflow)
- [Command Reference](#command-reference)
- [Live Bot Simulator](#live-bot-simulator)
- [Simulator Workflow](#simulator-workflow)
- [Debug Authentication](#debug-authentication)
- [Choosing Verification](#choosing-verification)

</details>

For contributors and local test operators. For deployed services use [AI deployment](../../AI_DEPLOYMENT.md) or the [VPS runbook](FIRST_VPS_DEPLOYMENT_RUNBOOK.md).

## Local Node Runtime

Local dependency, build, packaged stack build, test, and simulator commands require Node.js `22.22.2` from [`.nvmrc`](../../.nvmrc) on both Linux and macOS. The project uses Node's built-in SQLite runtime, so older Node versions are not supported. The workspace packages declare this as `node >=22 <23`.

`./dev.sh` sources nvm when it is available and runs `nvm use` before dependency, build, `stack:up`, test, and simulator commands so the `.nvmrc` version is applied automatically. If nvm is unavailable, the command still verifies that the active local `node` is Node 22 before continuing. `./dev.sh stack:down` and `./dev.sh stack:verify` remain Podman/curl-only helpers.

## Container Workflow

The repository is Podman-first for local stack commands because rootless operation is preferred. On Podman 6, migrate obsolete `slirp4netns` overrides to `pasta` using the [runtime troubleshooting steps](FIRST_VPS_DEPLOYMENT_RUNBOOK.md#podman-6-and-existing-rootless-settings); do not delete persistent volumes to fix a build-network error.

- start the packaged stack: `./dev.sh stack:up`
- stop it: `./dev.sh stack:down`
- smoke-check it: `./dev.sh stack:verify`

`./dev.sh` prefers `podman compose` and falls back to `podman-compose` if needed.
On macOS, packaged stack/e2e commands also check the Podman machine first: if the VM/socket is stale they start or restart the machine, and if no machine exists they initialize and start the default one. Linux Podman remains native and is left unchanged.
On restricted local Linux environments where rootless Podman cannot create a `netavark` bridge, packaged stack/e2e commands start with the normal bridge mode and then retry with host networking. You can force this with `PACKAGED_STACK_NETWORK_MODE=host`; the deployed VPS compose file and its host-local port binding remain unchanged.
`./dev.sh stack:up` now takes the stricter freshness path on every run: it first tears down any existing compose-managed stack for this project without deleting the named data volume, then rebuilds the image with `--no-cache`, and finally starts the stack with `--force-recreate` so stale containers and stale image layers are not reused.
The packaged compose service publishes the app on host-local `127.0.0.1:3001` and uses a container restart policy so local checks and host-level reverse proxies can reach it without exposing the app port to the wider network.

## Command Reference

- `./dev.sh deps` checks the local Node runtime and installs workspace dependencies
- `./dev.sh build` builds all workspace packages
- `./dev.sh lint` runs the repo's non-mutating lint/type checks
- `./dev.sh typecheck` runs TypeScript checks for the whole workspace
- `./dev.sh test:scripts` runs shell helper command contract checks for `dev.sh` and `deploy.sh`
- `./dev.sh test:unit` runs backend unit tests
- `./dev.sh test:int` runs backend integration tests
- `./dev.sh test:web` runs frontend/web tests
- `./dev.sh test:web:perf` runs frontend perf-focused component/render-boundary tests
- `./dev.sh test:e2e` runs the packaged browser e2e flow
- `./dev.sh test:e2e:perf` runs simulator-backed frontend perf checks
- `./dev.sh test:e2e:sim` runs the heavier simulator-backed board layout e2e flow
- `./dev.sh test:e2e:perf`, `./dev.sh test:e2e:sim`, and `./dev.sh test:e2e:sim:matrix21` must be run serially, not in parallel, because they share the same packaged stack, simulator seed state, and container/runtime resources
- `./dev.sh test:full` runs the main verification suite; the targeted simulator e2e flow stays separate
- `./dev.sh stack:up` applies `.nvmrc` with `nvm use` when available, refreshes the macOS Podman machine when needed, tears down any existing compose-managed stack for this project, rebuilds the packaged image with `--no-cache`, and then starts the packaged Podman stack in the foreground with `--force-recreate`
- `./dev.sh stack:down` stops the packaged Podman stack
- `./dev.sh stack:verify` checks packaged stack health on `localhost:3001`
- `./dev.sh sim:seed` seeds the deterministic simulator users and demo teams
- `./dev.sh sim:up` starts the live bot simulator as a long-running helper
- `./dev.sh sim:down` stops all live simulator processes
- `./dev.sh sim:status` shows whether the simulator is running

## Live Bot Simulator

The repo now includes a dev-only live bot simulator in `apps/simulator`.

Default behavior:
- seeds 950 deterministic simulator users
- creates 12 live demo teams with sizes `10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 150, 400`
- keeps bots connected through the real API and WebSocket contracts
- bots vote on active rounds with 80% probability and never reveal
- the packaged local `./dev.sh stack:up` flow opts the stack into simulator mode automatically for developer convenience, while the underlying compose/deployment defaults keep the simulator API disabled unless you intentionally enable it

Commands:
- `./dev.sh sim:seed`
- `./dev.sh sim:up`
- `./dev.sh sim:down`
- `./dev.sh sim:status`

## Simulator Workflow

1. Start the packaged stack with `./dev.sh stack:up`.
2. In another terminal, verify health with `./dev.sh stack:verify`.
3. Seed demo users and teams with `./dev.sh sim:seed`.
4. Start the live bots with `./dev.sh sim:up`.
5. Open `http://localhost:3001`, sign in as a normal human user, and join one of the `Sim Team ...` teams.
6. Check simulator state with `./dev.sh sim:status`.
7. Stop the simulator later with `./dev.sh sim:down`.
8. Run `./dev.sh test:e2e:sim` for the heavier seeded-room geometry sweep.
9. Run `./dev.sh test:e2e:sim:matrix21` for the strict calibrated 21-person viewport matrix.
10. Run `./dev.sh phase:p2:verify` for the full Phase 2 automated correctness/regression batch.
11. Run `./dev.sh phase:p3:verify` for the machine-heavy capacity/stress validation batch and inspect the generated latest report under `project_docs/RnD_docs/perf_runs/`.

Important:
- run `./dev.sh test:e2e:perf`, `./dev.sh test:e2e:sim`, and `./dev.sh test:e2e:sim:matrix21` one after another, never in parallel
- the simulator-backed commands share the same stack, seeded teams, and live simulator process space, so parallel runs can create false failures from container collisions, connection refusals, and contaminated geometry/perf results

Runtime settings:
- `SIMULATOR_MODE_ENABLED`
- `SIMULATOR_SHARED_SECRET`
- `SIMULATOR_BASE_URL`
- `SIMULATOR_VOTE_PROBABILITY`
- `SIMULATOR_RANDOM_SEED`

Production note:
- simulator mode must remain disabled in production
- the shipped compose/deployment defaults now keep `SIMULATOR_MODE_ENABLED=0`
- this does not disable the separate super-admin demo mode used for in-app large-room validation

### Operational Notes

- `./dev.sh stack:up` runs in the foreground.
- Use a second terminal for normal manual testing while the packaged stack is running.
- `./dev.sh phase:p2:verify` is the one-shot machine-heavy validation command for the current Phase 2 automation scope.
- `./dev.sh phase:p3:verify` is the one-shot machine-heavy validation command for the current Phase 3 capacity/stress scope.
- The simulator-backed commands `./dev.sh test:e2e:perf`, `./dev.sh test:e2e:sim`, and `./dev.sh test:e2e:sim:matrix21` must be run separately, not in parallel, because they share the same packaged stack and simulator-backed state.
- Simulator logs are written to `.simulator/simulator.log`.
- `./dev.sh sim:up` uses `setsid` when available and falls back to `nohup` on macOS-style environments where `setsid` is not installed.
- The latest Phase 3 capacity report is written to [`project_docs/RnD_docs/perf_runs/PHASE3_CAPACITY_VALIDATION_LATEST.md`](../../project_docs/RnD_docs/perf_runs/PHASE3_CAPACITY_VALIDATION_LATEST.md), with the public headline summarized in [`project_docs/RnD_docs/PUBLIC_BENCHMARK_SUMMARY.md`](../../project_docs/RnD_docs/PUBLIC_BENCHMARK_SUMMARY.md).
- The simulator is dev-only and should not be enabled in production.
- For deeper operator notes and troubleshooting, see [USAGE.md](../../project_docs/RnD_docs/USAGE.md).

## Debug Authentication

Use disposable data for development. `debugCode` is enabled when `NODE_ENV` is not `production`, or when `E2E_DEBUG_CODES=1` or `DEBUG_TOOLS_ENABLED=1`. The separate debug-tools flag defaults on outside production unless explicitly set to `0`; disabling it alone does not disable development code responses. Production must use `NODE_ENV=production` with both debug environment flags unset or `0`, and simulator mode disabled. Never use these endpoints to onboard real users.

## Choosing Verification

`./dev.sh test:full` runs shell, API unit/integration, web and simulator unit checks; it does not include browser suites. Use `test:e2e` for regular browser coverage and `test:e2e:responsive` for UI/layout/touch changes. The responsive suite is opt-in; see [its matrix](RESPONSIVE_TESTING.md). Run simulator-backed suites serially. Check [Usage verification](USAGE.md#verification-matrix) for a change-based checklist.

For transport changes, run the separate [HTTPS Chromium regression](HTTPS_DEPLOYMENT.md#local-regression-checks). It uses a disposable TLS proxy and database; the ordinary localhost suites remain HTTP.
