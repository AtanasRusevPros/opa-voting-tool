<!--
SPDX-FileCopyrightText: 2026 Atanas G. Rusev
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Agent Workflow Playbook

Created: 2026-05-19 EEST

Purpose: reusable, project-specific workflows for agents working on this repository.

This playbook distills useful ideas from local agent-workflow research without importing a full external prompt/tooling library. Use it when a task benefits from a structured workflow, not as mandatory reading for every tiny edit.

This playbook and the root `AGENTS.md` should evolve with the project. If an agent notices that either file should be updated because workflows, commands, risks, or project priorities changed, the agent should ask the user before making that process update unless the current user request explicitly asks for it.

## When To Use This

Consult this playbook when the task involves:

- Open-source release readiness, repo cleanup, public packaging, licensing, DCO, security policy, or public docs.
- Security-sensitive work: auth, team isolation, public test-server access, secrets, deployment, Caddy, Podman, or VPS operations.
- Larger implementation work where planning, tests, docs, and verification need to stay aligned.
- Code review, regression review, or release-blocker hunting.
- Documentation synchronization across README, USAGE, runbooks, phase docs, and scripts.
- Debugging build/type/test failures that should be fixed with minimal scope.
- Handoff/checkpoint work before a commit, phase closeout, or context switch.

Do not load this playbook for a tiny typo fix, a one-line doc correction, or a simple command answer unless one of the situations above applies.

## Core Operating Loop

Use this default loop for substantial work:

1. Understand the request and identify the current phase or doc owner.
2. Read only the files needed for the next decision.
3. Make a small plan if the work has risk, multiple files, or unclear acceptance criteria.
4. Implement in focused batches.
5. Run the nearest meaningful verification.
6. Update user-facing docs and the private worklog when behavior, operations, UX, or project process changes.
7. Close with changed behavior, verification, and any known gap.

The goal is speed with guardrails: avoid both blind editing and ceremony theater.

## Workflow Modes

### Planner Mode

Use when the task is broad, risky, or under-specified.

What to produce:

- Restated goal in project terms.
- Files and surfaces likely affected.
- Risks and owner decisions.
- Implementation batches.
- Verification plan.
- Clear acceptance criteria.

Keep plans actionable. If a plan cannot point to likely files, commands, or docs, it is probably still too vague.

### Implementation Mode

Use when the direction is clear and code/docs should change.

Rules:

- Prefer targeted reads over broad scans.
- Keep changes scoped to the current task.
- Preserve user changes and unrelated dirty work.
- Align code, docs, tests, and phase trackers when the task touches behavior or operations.
- For frontend changes, preserve the established visual language unless the task explicitly asks for redesign.
- For backend/realtime/persistence changes, remember the 200-user session target and single-live-room-per-team constraint.

### Code Review Mode

Use for review requests or pre-commit self-review.

Review priorities:

- Security, auth, team isolation, data loss, and deployment safety.
- Realtime correctness, WebSocket lifecycle, and recovery behavior.
- SQLite persistence, migrations, backup/restore, and config defaults.
- Frontend state consistency, responsive regressions, and accessibility.
- Tests, docs, and operator guidance matching the actual behavior.

Review discipline:

- Findings first, ordered by severity.
- Cite exact files and lines for important findings.
- Require a plausible failure path for high-severity claims.
- Say "no findings" when that is true.
- Report failed or skipped verification before claiming confidence.
- Do not invent low-confidence issues just to fill a review.

### TypeScript And React Review Mode

Use when changes touch `apps/web`, shared contracts, or frontend-facing API shapes.

Check:

- Type safety across API contracts and UI assumptions.
- Async race conditions, reload/reconnect behavior, and stale state.
- Responsive behavior across desktop, tablet, and mobile baseline widths.
- Avoided unnecessary rerender/performance regressions in active board flows.
- Tests updated near the changed component or hook.

For UI behavior changes, prefer a focused web test plus typecheck. For packaged/browser behavior, use the nearest Playwright slice when practical.

### API, Realtime, And Persistence Review Mode

Use when changes touch `apps/api`, WebSocket behavior, repository persistence, auth, deployment config, or migrations.

Check:

- Authorization and role checks at every server boundary.
- Team/workspace isolation and no accidental cross-team leakage.
- Input validation before persistence or state mutation.
- WebSocket errors handled without crashing the process.
- SQLite write/read consistency and backup/restore expectations.
- Nearest API unit/integration test, plus packaged stack checks when behavior is externally visible.

### Security Review Mode

Use for auth, public access, deployment, secrets, public repo release, or public test-server work.

Check:

- Secrets are not committed, logged, shown in docs, or embedded in screenshots.
- Public docs do not expose private credentials, private host details, or unsafe defaults.
- Domain restrictions, HTTPS-only behavior, firewall expectations, and local-only app ports are documented correctly.
- Public test users cannot see or operate each other's rooms/workspaces.
- Abuse/contact/legal/terms/privacy expectations are captured before opening access to random users.
- AGPLv3, DCO, contribution, and attribution docs are consistent for open-source release.

### Documentation Sync Mode

Use whenever scripts, commands, deployment behavior, auth flows, or public positioning change.

Source-of-truth discipline:

- `dev.sh` and `deploy.sh` define command reality.
- `infra/containers/compose.yaml` defines packaged runtime behavior.
- ignored `config/deployment.local.toml` owns real deployment settings, while tracked `config/deployment.toml` and `config/deployment.sample.toml` define safe defaults/templates.
- README should be concise public entry guidance.
- `project_docs/RnD_docs/USAGE.md` should be deeper operator/user guidance.
- `FIRST_VPS_DEPLOYMENT_RUNBOOK.md` should stay practical for real server deployment.
- Phase docs should explain why work exists and what remains.

When one source changes, scan for the smallest set of docs that must match it.

### Open-Source Release Mode

Use during Phase 19 and related public-release cleanup.

Pipeline:

1. Sanitize: search for secrets, private notes, unsafe credentials, private logs, and accidental personal data.
2. Verify: confirm public docs, examples, configs, and demo data are safe to share.
3. Package: add or update AGPLv3 license, DCO contribution flow, SECURITY, CODE_OF_CONDUCT, issue/PR templates, public README, and setup docs.
4. Review: run release-blocker review with security and docs lenses.
5. Publish decision: leave final public push/repo visibility changes to explicit owner approval.

Do not invent owner identity, copyright holder, public org/repo URL, donation wording, or legal policy details. Ask or leave placeholders.

### Deployment Operator Mode

Use for VPS, Caddy, Podman, HTTPS, backups, or deployed release updates.

Rules:

- Prefer `./deploy.sh` commands in deployed-state docs and operator guidance.
- Keep `./dev.sh` scoped to local development and packaged verification.
- If Caddy returns `502`, diagnose upstream app/container health first because that usually means the proxy cannot reach a healthy app process.
- Verify container health before blaming Caddy configuration.
- Keep the app bound to localhost behind Caddy for deployed mode.
- Keep README, USAGE, the first VPS runbook, and any private phase docs aligned when deployment behavior changes.

### Build-Fix Mode

Use when build, typecheck, lint, or tests fail.

Approach:

- Identify the first real root cause, not every downstream symptom.
- Make the smallest safe fix.
- Avoid opportunistic refactors.
- Rerun the failing command or nearest narrower command.
- If a failure is unrelated to the current task, report it without hiding it.

### Handoff And Checkpoint Mode

Use before commits, phase closeout, major context switches, or after a risky fix.

Record:

- What changed.
- Why it changed.
- What was verified.
- What was not verified.
- What remains risky or owner-dependent.
- Which docs or phase trackers were updated.

When a private current worklog is present locally, it is the durable owner/agent memory for non-trivial changes. Keep it updated during development, but do not commit private planning contents or make public user-facing docs depend on them.

## Sub-Agent Guidance

Sub-agents can help when independent work can run in parallel, such as one agent reviewing security while another checks docs. However, in this Codex environment, sub-agents may only be spawned when the user explicitly asks for agent delegation or parallel agent work.

When sub-agents are allowed:

- Give each agent a narrow, self-contained task.
- Avoid duplicate exploration.
- Assign disjoint write scopes for coding work.
- Keep blocking critical-path work local.
- Review returned changes before integrating.

When sub-agents are not explicitly requested, use the same role concepts locally as mental workflow modes.

## Context Budget Rules

The playbook exists so `AGENTS.md` can stay light.

Use these rules:

- Do not bulk-load this file unless the task matches the "When To Use This" section.
- Do not import full external prompt/tooling repositories into project instructions.
- Prefer small project-specific checklists over giant generic prompts.
- Add new workflow sections only after repeated need.
- Remove or compress workflow guidance that no longer helps decisions.

## Useful Source Ideas

Distilled from local agent-workflow research:

- Agent roles are useful when they are small, specialized, and evidence-driven.
- Code review improves when it accepts "no findings" and requires proof for serious claims.
- Open-source release work is safer as sanitize -> verify -> package -> review.
- Documentation should follow source-of-truth files, not memory.
- Build fixes should be minimal and verified against the failing command.
- Session memory is valuable when it records decisions, verification, and unresolved risks.
