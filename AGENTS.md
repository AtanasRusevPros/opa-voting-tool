<!--
SPDX-FileCopyrightText: 2026 Atanas G. Rusev
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# AGENTS.md

Created: 2026-04-03 10:35 EEST

Guidance for agents working in this repository.

## Goal

Make safe, minimal, well-verified changes with as little context as necessary while preserving the documentation-first bootstrap discipline from the root project guides.

## Repo Shape

- `apps/web`: React + Vite client
- `apps/api`: Express + WebSocket + SQLite API
- `packages/shared`: shared decks, contracts, and UI/runtime types
- `config`: deployment-editable config files such as allowed domains
- `infra/containers`: container build and compose files
- `project_docs`: public architecture, usage, operator, benchmark, and release-readiness docs

## Working Rules

- Prefer targeted reads over broad scans.
- Keep user-facing behavior, docs, and tests aligned in the same task.
- Do not remove or silently rename the branding asset filenames or the allowed-domains file without updating the README and usage docs.
- Preserve the single-live-room-per-team behavior unless the user explicitly asks to expand scope.
- Treat the 200-user session target as a real constraint when changing realtime or persistence behavior.

## Workflow Playbook

For substantial planning, implementation, review, security, deployment, open-source release, documentation-sync, build-fix, or phase-handoff work, consult [AGENT_WORKFLOW_PLAYBOOK.md](project_docs/RnD_docs/AGENT_WORKFLOW_PLAYBOOK.md).

Use the playbook when the task involves Phase 19/open-source readiness, public test-server access, auth/team isolation, VPS/Caddy/Podman operations, broad code review, cross-doc updates, failing verification, or a commit/phase closeout. Do not load it for tiny typo fixes or simple command answers.

Keep this file and the playbook aligned with the project as it evolves. If an agent believes either file needs a process/workflow update, it should ask the user before changing them unless the user explicitly requested that update in the current task.

## Private Planning Context

If owner-private planning history, worklogs, phase trackers, or release-prep notes are provided separately in the local development environment, agents may use them as context. They must not be committed, linked from public user-facing docs as required context, or treated as part of the public release artifact.

## Verification Rules

- Before changing backend behavior, run the nearest API unit or integration test.
- Before changing frontend behavior, run the nearest web test and typecheck.
- After changing shared contracts, rerun root typecheck.
- Do not run the simulator-backed suites in parallel with each other. `./dev.sh test:e2e:perf`, `./dev.sh test:e2e:sim`, and `./dev.sh test:e2e:sim:matrix21` all take ownership of the same packaged stack and simulator resources, so they must be rerun serially to keep the results trustworthy.
- Before closing a task, report any verification gaps explicitly.

## Commands

Local development and verification:
- `./dev.sh help`
- `./dev.sh build`
- `./dev.sh typecheck`
- `./dev.sh test:unit`
- `./dev.sh test:int`
- `./dev.sh test:web`
- `./dev.sh test:full`
- `./dev.sh stack:up`
- `./dev.sh stack:down`

Deployed VPS operations:
- `./deploy.sh help`
- `./deploy.sh health`
- `./deploy.sh public-health`
- `./deploy.sh logs`
- `./deploy.sh diagnose`
- `./deploy.sh caddy:reload`
- `./deploy.sh backup`
- `./deploy.sh update`

Use `./deploy.sh` for deployed-server/runbook work and `./dev.sh` for local development, test, and packaged-stack verification. When changing deployed-operator behavior, keep `README.md`, `project_docs/RnD_docs/USAGE.md`, and `project_docs/RnD_docs/FIRST_VPS_DEPLOYMENT_RUNBOOK.md` aligned.

## Commit And Cleanup

- Keep commits scoped to one milestone when practical.
- Each major rework or bug-fix pass should be committed separately rather than bundled with later unrelated work.
- The current major milestone commit should use a detailed explanatory commit message.
- Each following dedicated commit should also be detailed, but shorter and focused on that single change.
- Update the relevant worklog/tracker before wrapping a milestone.
- If a private current worklog exists locally, update it after each non-trivial project change, even if no commit is made.
- Worklog entries should be a bit more detailed than a one-line label and should describe what changed in behavior, architecture, UX, verification, or operational expectations.
- Only skip worklog updates for truly tiny changes such as a minor cosmetic UI tweak with no meaningful behavior or workflow impact.
- Any change that affects how the app works, how users interact with it, how it is verified, or any non-minor UI change must be recorded in the current worklog.
- If verification cannot be fully run, state exactly what remains unverified.
