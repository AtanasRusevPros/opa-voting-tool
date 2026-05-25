<!--
SPDX-FileCopyrightText: 2026 Atanas G. Rusev
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Open Source Release Checklist

Status: Reusable release-readiness checklist

Use this as the compact execution checklist for the open-source release pass. Detailed owner decisions and private release-prep notes may exist separately in the local development environment, but this checklist must remain safe to publish.

## 1. Sanitize

- Search for private/proprietary references recorded in the Phase 19 questionnaire, including employer/customer names, private domains, and old private issue-key examples.
- Replace public examples with generic values such as `ISSUE-12345`, `vote.example.com`, and `example-company.com`.
- Inspect logs, generated files, screenshots, SQLite files, simulator outputs, and local deployment artifacts.
- Keep local research/checkout folders untracked unless explicitly adopted.
- Keep owner-private planning folders untracked; they are local owner/agent context, not part of the public release artifact.
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
- Document `./deploy.sh up` as the recommended self-host command.
- Document Podman as the default runtime and Docker only as a possible adaptation.
- Document HTTPS-only expectations for public deployments.
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

## 5. Defer Explicitly

- Public demo/test server access belongs to the future public-test-server workstream.
- Screenshots/GIFs are deferred to Phase 19.1/20 until demo data/media rules and launch branding are ready.
- Repo/package renaming needs a dedicated technical pass.
- Backup/restore has been smoke-tested with `./deploy.sh backup`, `./deploy.sh backup:list`, and `./deploy.sh restore <file>`; re-run the rehearsal before a release if backup behavior changes.
- The first clean public repo tag is `v0.1.0`; future release tags should follow the documented versioning policy.
- Search discoverability should be revisited after launch using real search/referral signals rather than guessed keyword density.
