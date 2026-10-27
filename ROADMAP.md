<!--
SPDX-FileCopyrightText: 2026 Atanas G. Rusev
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Roadmap

OpaVoting is an open-source multi-team realtime voting platform. Scrum estimation / planning poker is the first killer use case, and the broader goal is to become a practical self-hosted voting tool for teams, workshops, polling, review, and collaborative decisions.

The roadmap is intentionally conservative: it names the direction without pretending all future workflows already exist.

## Available Today

- Self-hosted v1.0.0 with Podman deployment, startup/watchdog, backups and restore.
- Free hosted demo with workspace quotas; ordinary self-hosting has no demo quotas.
- Team administration, persistent voting history, Jira import and scoped statistics.
- Mobile board controls and responsive test coverage.
- AI-assisted deployment instructions with explicit environment verification limits.
- [Measured simulated-load results](project_docs/RnD_docs/PUBLIC_BENCHMARK_SUMMARY.md), [documentation](project_docs/README.md) and AGPLv3/DCO contribution guidance.

## Near-Term Direction

- Product screenshots and lightweight workflow animations for the repository, guides and landing page.
- Continue deployed feedback and environment verification, including fresh-host AI deployment and network/TLS setup.
- Keep guides concise, navigable and aligned with the implementation as features evolve.

## Future Product Direction

- Broader team voting workflows beyond Scrum estimation.
- Polling and review options around result reveal.
- Collaborative decision workflows.
- Agile workshop and facilitation support.
- Distributed team consensus workflows.
- Evaluate further hosted convenience while keeping the self-hosted AGPLv3 version complete and useful; the current free hosted demo already exists.

## Discoverability Direction

The public project should be easy to find for both main search intents:

- people searching for an open-source voting tool, self-hosted voting app, realtime voting platform, team polling tool, or collaborative decision platform
- people searching for Scrum planning poker, planning poker app, agile estimation tool, or planning poker for remote teams

Docs should keep Scrum planning poker prominent as the first mature use case without narrowing the whole project identity to only planning poker.

## Product Principles

- Performance is a first-class product promise.
- Participant UX and admin UX are review criteria, not afterthoughts.
- Self-hosting should remain easy for small operators.
- Configuration should stay understandable and safe.
- The open-source version should remain real software, not a crippled teaser for a hosted product.
