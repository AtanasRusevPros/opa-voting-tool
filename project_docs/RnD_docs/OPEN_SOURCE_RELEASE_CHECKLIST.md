<!--
SPDX-FileCopyrightText: 2026 Atanas G. Rusev
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Open Source Release Checklist

[Documentation index](../README.md) · [Project home](../../README.md)

<details>
<summary>Contents</summary>

- [1. Sanitize](#1-sanitize)
- [2. Package](#2-package)
- [3. Document](#3-document)
- [4. Verify](#4-verify)
- [5. Defer Explicitly](#5-defer-explicitly)

</details>

Status: Reusable release-readiness checklist

Use this as the compact execution checklist for an open-source release pass.

## 1. Sanitize

- Search for private/proprietary references, including employer/customer names, private domains, and old private issue-key examples.
- Replace public examples with generic values such as `ISSUE-12345`, `vote.example.com`, and `example-company.com`.
- Inspect logs, generated files, screenshots, SQLite files, simulator outputs, and local deployment artifacts.
- Keep local research/checkout folders untracked unless explicitly adopted.
- Keep local planning folders, worklogs, and release-preparation artifacts untracked unless they are intentionally reviewed for publication.
- Review remaining `project_docs/` content for publication value and remove public-doc bloat before launch. Presentation drafts should be consolidated; if a presentation is kept, prefer one updated HTML version rather than multiple stale draft formats.
- Keep real deployment settings in ignored `config/deployment.local.toml`; tracked templates must not contain usable super-admin credentials.

## 2. Package

- Add AGPLv3-or-later `LICENSE`.
- Add `SECURITY.md`.
- Add `CONTRIBUTING.md` with DCO sign-off.
- Add `CODE_OF_CONDUCT.md`.
- Add `ROADMAP.md`.
- Add brand usage guidance.
- Add GitHub issue templates and PR template.
- Keep `package.json` private and set license metadata.
- Keep root `package.json` as the version source of truth.

## 3. Document

- Reshape README as a public front door.
- Make the README discoverable for both major search intents: open-source/self-hosted realtime voting tool and Scrum planning poker/agile estimation tool.
- Keep SEO wording people-first and accurate; do not keyword-stuff or promise features that do not exist.
- Link deployment, usage, architecture, benchmark, security, contribution, and roadmap docs.
- Document credential/domain setup before `./deploy.sh up`; link the AI deployment guide and its actual verification scope.
- Document Podman as the default runtime and Docker only as a possible adaptation.
- Document HTTPS requirements for company LAN and public deployments, the localhost exception and verified proxy trust using the [HTTPS guide](HTTPS_DEPLOYMENT.md).
- Keep [runtime compatibility guidance](FIRST_VPS_DEPLOYMENT_RUNBOOK.md#podman-6-and-existing-rootless-settings) current; explain rebuilding after a failed source update without resetting data.
- Document both no-SMTP/manual-share and SMTP onboarding modes.
- Document versioning/release policy and expose `./dev.sh version` / `./deploy.sh version`.
- Add or review repository topics, description, social preview, and public launch announcements outside the repo when the project becomes public.

## 4. Verify

- Check links and examples.
- Confirm public docs do not mention the private VPS details.
- Confirm benchmark claims match raw artifacts.
- Run `./dev.sh test:scripts` so documented `dev.sh` / `deploy.sh` command surfaces stay aligned with implemented commands.
- Confirm `./dev.sh version` and `./deploy.sh version` report the intended public version.
- Run nearest documentation/metadata checks.
- Run technical checks only where the release pass changes executable behavior.
- For docs-only patch releases, do not move old tags; create a new patch tag only when the changelog/release note value justifies it.
- For transport changes, verify API/frontend local probes and public HTTPS health separately; document proxy recovery and restoring startup/watchdog supervision.
- For deployed update guidance, verify that ignored local deployment config is preserved and that operator docs do not instruct users to overwrite `config/deployment.local.toml`.

## 5. Defer Explicitly

- The hosted demo is live; verify its entry links and deployment-specific notices before promotion.
- Screenshots and lightweight workflow animations remain a separate media task; use synthetic data, accessible static alternatives and accurate captions.
- Repo/package renaming needs a dedicated technical pass.
- Backup/restore has been smoke-tested with `./deploy.sh backup`, `./deploy.sh backup:list`, and `./deploy.sh restore <file>`; re-run the rehearsal before a release if backup behavior changes.
- The first public tag is `v0.1.0`; future release tags should follow the documented versioning policy.
- Search discoverability should be revisited after launch using real search/referral signals rather than guessed keyword density.
- Automatic update checks, release-channel selection, and major/minor/patch update policy belong to the later post-launch operations phase. Backup pruning and opt-in weekly app-managed snapshots are implemented; see [privacy and backups](PRIVACY_AND_BACKUPS.md) for retention and release verification.
