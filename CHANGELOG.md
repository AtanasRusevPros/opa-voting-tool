<!--
SPDX-FileCopyrightText: 2026 Atanas G. Rusev
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Changelog

All notable public-facing changes should be summarized here.

This project is still in alpha. The first public alpha tag is `v0.1.0`.

Until a fuller release-note process exists, use this changelog together with GitHub releases and repository history for detailed change tracking.

## Unreleased

- Fixed existing enabled hosted-trial deployments retaining the retired 40-round quota: startup now persists the upgrade to 80, aligning enforcement and displayed allowances. Other custom limits and disabled-trial configurations remain unchanged.

- Added a responsive hosted-trial welcome with brief signup instructions, configured monthly allowance, accurate privacy/deletion guidance, author attribution, and GitHub/self-hosting links.
- Added initial-response trial project HTML, canonical and sharing metadata, structured project information, robots.txt, sitemap.xml, and a plain-text AI-readable project guide, without analytics or extra frontend dependencies.
- Expanded hosted-trial participation to two workspaces and the default allowance to 80 revealed rounds per workspace per UTC month; legacy enabled-trial 40-round settings upgrade automatically; other custom limits remain unchanged. Collaborators can leave workspaces, and removed team members lose live board access.

- Fixed upgrades from older persisted SQLite databases failing during startup when indexes were created before newly introduced workspace and import columns.
- Added optional, default-disabled public-trial workspaces with SMTP-backed signup, workspace isolation, configurable hosted limits, public policy pages, and operator usage/export reports.
- Hardened timer/reconnect behavior and repeated large-demo voting counts with new regression coverage.
- Added deployed backup pruning and portable packaged-stack test fallback behavior.
- Future public README polish should improve wording, length, section links, and links into sub-documents without turning the README into an overloaded manual.

## 0.1.0 - 2026-05-24

- First public alpha release.
- Public docs now favor concise user, operator, contributor, security, roadmap, benchmark, and deployment guidance.
- README, package metadata, and web metadata now describe the project for both open-source realtime voting and Scrum planning poker / agile estimation discovery.
- Version policy now uses root `package.json` as the version source of truth, with `./dev.sh version` and `./deploy.sh version` for checkout/operator visibility.
