<!--
SPDX-FileCopyrightText: 2026 Atanas G. Rusev
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Changelog

All notable public-facing changes should be summarized here.

This project is still in alpha. The first public alpha tag is `v0.1.0`.

Until a fuller release-note process exists, use this changelog together with GitHub releases and repository history for detailed change tracking.

## Unreleased

- Added optional, default-disabled public-trial workspaces with SMTP-backed signup, workspace isolation, configurable hosted limits, public policy pages, and operator usage/export reports.
- Hardened timer/reconnect behavior and repeated large-demo voting counts with new regression coverage.
- Added deployed backup pruning and portable packaged-stack test fallback behavior.
- Future public README polish should improve wording, length, section links, and links into sub-documents without turning the README into an overloaded manual.

## 0.1.0 - 2026-05-24

- First public alpha release.
- Public docs now favor concise user, operator, contributor, security, roadmap, benchmark, and deployment guidance.
- README, package metadata, and web metadata now describe the project for both open-source realtime voting and Scrum planning poker / agile estimation discovery.
- Version policy now uses root `package.json` as the version source of truth, with `./dev.sh version` and `./deploy.sh version` for checkout/operator visibility.
