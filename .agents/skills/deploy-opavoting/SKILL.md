---
name: deploy-opavoting
description: Deploy or update OpaVoting on a user-selected Linux host for localhost, company LAN, or public-server use, and verify the installation.
---

<!--
SPDX-FileCopyrightText: 2026 Atanas G. Rusev
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Deploy OpaVoting

Use the OpaVoting checkout's [AI_DEPLOYMENT.md](../../../AI_DEPLOYMENT.md) as the authoritative procedure. If this skill was copied elsewhere, locate the user's checkout or clone https://github.com/AtanasRusevPros/opa-voting-tool into the chosen working directory, then read its root `AI_DEPLOYMENT.md` and `AGENTS.md`. Do not assume relative guide paths still resolve from an installed copy.

Inspect the target and reuse the user's choices. Distinguish localhost-only access, company LAN/proxy and public HTTPS; changing the base URL alone does not expose the localhost-bound app. Ordinary self-hosting uses trial-disabled defaults and supports manual onboarding without SMTP.

Use the existing `deploy.sh` workflow and preserve local configuration, credentials and data. Do not use developer/debug endpoints to provision production users. Complete the guide's health, two-user voting, persistence and backup checks within the authorized environment; rehearse destructive restore on disposable data only unless explicitly requested on another target.

Finish with the working URLs, maintenance/config locations, verified checks and exact gaps. A missing tool or permission is a reported limitation, not evidence of success. Deployment documentation does not authorize unrelated host changes or publication of credentials.
