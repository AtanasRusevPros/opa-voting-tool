<!--
SPDX-FileCopyrightText: 2026 Atanas G. Rusev
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Contributing

Thank you for considering a contribution to The Ultimate OSS Voting Tool (OpaVoting).

This project is an OSS-first, self-hosted realtime voting platform. Scrum estimation / planning poker is the first killer use case, but the long-term direction is broader collaborative voting and decision workflows.

## Contribution Principles

Contributions should preserve:

- Low-latency realtime behavior and the 200-user session target.
- Simple participant flows for joining, voting, revealing, and understanding results.
- Clear admin workflows for team management, setup, and recovery.
- Easy self-hosted deployment and upgrade paths.
- Safe defaults for authentication, domains, HTTPS, backups, and secrets.
- Clear documentation for any behavior or operator workflow that changes.

New features should not make voting, joining, revealing, team management, setup, or deployment harder without a strong reason.

## DCO Sign-Off

All external contributions must use Developer Certificate of Origin (DCO) sign-off. No separate CLA is required.

Sign commits with:

```bash
git commit -s -m "Your commit message"
```

This adds a `Signed-off-by` line certifying that you have the right to submit the contribution under this project's license.

## Local Setup

Use Node.js `22.22.2` from `.nvmrc`, then install dependencies:

```bash
./dev.sh deps
```

Common local commands:

```bash
./dev.sh typecheck
./dev.sh test:web
./dev.sh test:int
./dev.sh stack:up
./dev.sh stack:verify
./dev.sh stack:down
```

Use `./deploy.sh` only for deployed-server/operator workflows.

## Verification Guidance

Run the nearest meaningful checks for your change:

- Frontend/UI changes: `./dev.sh typecheck` and `./dev.sh test:web`.
- Backend/API/persistence changes: `./dev.sh typecheck` and `./dev.sh test:int`.
- Packaged behavior or deployment changes: `./dev.sh stack:up` and `./dev.sh stack:verify`.
- Realtime/performance-sensitive changes: run the relevant simulator/performance suite serially.

Do not run simulator-backed suites in parallel with each other.

If you cannot run a relevant check, explain that in the pull request.

## Pull Request Expectations

PRs should include:

- What changed and why.
- Tests or checks run.
- Any docs updated.
- Any performance, UX, admin, deployment, or security impact.
- Confirmation that commits are DCO-signed.

## Security

Do not open public issues for security vulnerabilities. Follow `SECURITY.md`.

