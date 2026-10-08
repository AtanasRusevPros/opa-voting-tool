<!--
SPDX-FileCopyrightText: 2026 Atanas G. Rusev
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Changelog

All notable public-facing changes should be summarized here.

This project is still in alpha. The first public alpha tag is `v0.1.0`.

Until a fuller release-note process exists, use this changelog together with GitHub releases and repository history for detailed change tracking.

## Unreleased

- Kept long account-deletion confirmations scrollable within short viewports so the confirmation button remains reachable.

- Fixed stale Onboard/Not online status in a People panel left open in the team chooser, using a read-only live subscription that does not affect board participation. Added two-browser and authorization regressions. Owner-verified on 2026-10-08.
- Added a persisted Account setting to open the chooser instead of the last team after sign-in; automatic entry remains the default and accessible direct links take priority. Added migration, API and browser coverage. Owner-verified on 2026-10-08.

- Added opt-in app-managed SQLite snapshots: weekly by default, at most three copies, 21-day expiry, restart catch-up, worker-thread copying and integrity verification; no external scheduler.
- Deployment archives now use consistent SQLite snapshots, exclude nested snapshot history and automatically retain three after successful creation. Added `backup:auto:list` and restore/setup guidance.
- Rewrote trial privacy/terms/cleanup and deletion guidance around actual live-data deletion, retained identifiable history, providers and backup exceptions. Added configurable public operator/contact/provider details and a lightweight manual privacy-rights procedure without certification/compliance claims.


- Make trial registration policy acceptance easier to read and select with form-sized text and a larger checkbox.

- Prevent the sole team admin from leaving, with archive guidance in the chooser and board and server-side enforcement. Allow full-email member re-add without selecting a suggestion, and match the Team Admin rename pencil to the board.

- Added deployment-configurable access requests, enforced in both login UI and API. Moved super-admin sign-in to `/admin` with noindex and removed its public login button. Grouped email recovery/trial actions beneath Sign in and enable them only after a valid-looking email is entered.

- Simplified the signed-in chooser: workspace management now lives in Account, project details in About, and team cards retain compact workspace usage. Added an Under Development attribution and kept a small GitHub-star link.
- Added team rename beside the Team Admin title with existing permissions and validation; cleaned editorial recommendations out of the public benchmark summary.

- Styled trial workspace rename controls consistently and avoided aborting WebSocket handshakes during chooser/board cleanup, reducing unnecessary browser connection warnings.

- Name new trial workspaces after their owner, migrate legacy generic names once, and allow owners to rename their trial workspace from the chooser.
- Keep failed team invitations visible with an inline explanation and preserved email, fixing unhandled rejections when a user already belongs to two trial workspaces.

- Added demo-count diagnostic exports and conservative offline maintenance, including dry-run-first cleanup of eligible legacy duplicate demo accounts. Simulated voting now uses only canonical seed identities assigned to each demo team; saved historical snapshots are preserved.

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
