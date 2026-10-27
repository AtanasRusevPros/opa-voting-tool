<!--
SPDX-FileCopyrightText: 2026 Atanas G. Rusev
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# AI Deployment Verification

[Documentation index](../README.md) · [Project home](../../README.md)

[Deployment guide](../../AI_DEPLOYMENT.md) · [First VPS runbook](FIRST_VPS_DEPLOYMENT_RUNBOOK.md)

## Scope — 2026-10-27

The AI deployment instructions were exercised locally using a fresh checkout of the application sources, the new container exclusions, a separately named Podman Compose project and an empty data volume. The host was Manjaro Linux with an existing rootless Podman installation; the Node 22 Alpine application image installed dependencies and built the production web app. This was **not a fresh Ubuntu VM**, and cached base-image layers were available.

Synthetic accounts/configuration only; no live deployment or private company data was used. Debug-code authentication and simulator mode stayed disabled. Startup jobs were disabled for the disposable rehearsal. A temporary host-only Podman configuration accommodated the developer host's network settings; it did not change the repository's Compose configuration or the user's saved container settings.

## Checks Passed

| Area | Evidence |
| --- | --- |
| Agent entry points | Skill frontmatter validated; repository links checked. AGENTS/Claude/skill route to one guide. No cross-agent execution certification claimed. |
| Image build | Production web build passed. Inspection of the image without config mounts confirmed local deployment/operator overrides and the synthetic data marker were absent; tracked defaults and built web assets remained. |
| Startup | `deploy.sh up` built/started the isolated service; local API, web and configured-origin health returned HTTP 200. |
| Normal onboarding | Chromium signed into `/admin`, created a team, and two separately provisioned users signed in using manually delivered passwords. An out-of-domain invitation returned HTTP 403. No hosted-trial signup UI appeared. |
| Voting | Both normal browser users voted; persisted vote counts, reveal, shared history and browser reload passed. No uncaught page errors were observed in the successful run. |
| Restart | `deploy.sh restart` recovered health; administrator/user login, team and saved history remained available. |
| Backup/restore | The archive contained database and local config. Restore replaced post-backup synthetic database/config markers; subsequent normal login/history checks passed. The fixed command returned success. |
| Rerun | Repeated `config:migrate` preserved the local config byte-for-byte; repeated `up` retained the users/team/history. |
| Script regression | `./dev.sh test:scripts` passed, including real-Git update preflight and the new restore success/failure/invalid-archive cleanup regression. |

The first restore rehearsal exposed an EXIT trap referencing a function-local temporary directory after that function returned. A focused regression reproduced the failure; restore now runs in a subshell, as backup already does, so cleanup executes while its local variables are in scope. The successful packaged restore was repeated after the fix. Failed health and invalid archives retain nonzero exit status and clean extraction directories in the isolated regression.

Initial browser rehearsal assertions used a transient success message and a reused team name; the final run used durable vote state and unique test identities. These were rehearsal corrections, not changes to application voting or onboarding behavior.

## Owner-Reported Follow-Up — 2026-10-28

The owner confirmed successful localhost use after resolving a Podman 6.1.1 host's obsolete `slirp4netns` override in favor of installed `pasta` and rebuilding. Separately, supplied VPS logs verified API/frontend/public HTTPS health, enabled systemd autostart/linger and repeated successful manual watchdog runs after the HTTPS proxy and readiness fixes. These are owner-reported results on existing installations, not a fresh-host or cross-agent certification. They do not establish reboot recovery, new certificate issuance, or a full browser voting regression on that VPS.

## Remaining Environment Checks

Before claiming full support for an installation, verify its actual environment:

- Fresh Ubuntu package/rootless-user setup, systemd/cron watchdog installation and reboot recovery.
- Company DNS, LAN/VPN firewall reachability and certificate trust from another client.
- Public DNS and HTTPS certificate issuance/renewal where applicable.
- Real SMTP invitation/reset delivery when SMTP is enabled.
- Automatic skill discovery and the execution workflow in each advertised agent/version. A portable instruction format alone does not prove every agent will deploy successfully.

No unrelated API/UI/simulator suite was rerun for this documentation/operator cleanup task. The production image build, existing deployment shell suite and disposable browser/restore rehearsal cover the changed surfaces. Fresh-machine and network acceptance remain explicit follow-ups rather than inferred passes.
