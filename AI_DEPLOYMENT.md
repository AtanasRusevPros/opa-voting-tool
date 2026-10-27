<!--
SPDX-FileCopyrightText: 2026 Atanas G. Rusev
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Deploy OpaVoting With An AI Assistant

[Documentation index](project_docs/README.md) · [Project home](README.md)

Use this guide to deploy the complete self-hosted app for your company, without the hosted demo's quotas. A coding/operations agent with terminal access can perform the setup and checks. A chat-only assistant can explain the steps but needs connected execution tools to run them.

Give your assistant this prompt (replace the target):

> Clone https://github.com/AtanasRusevPros/opa-voting-tool and follow AI_DEPLOYMENT.md to deploy OpaVoting on my target Linux server for internal company use. Inspect the environment, ask only for missing choices or access, preserve existing data and configuration, and verify the deployment. Report the working URL and maintenance commands, plus anything you could not verify.

[Choose the target](#1-choose-the-target) · [Prepare](#2-inspect-and-prepare) · [Configure](#3-configure-the-installation) · [Start](#4-start-and-connect) · [Verify](#5-verify-before-handoff) · [Maintain](#6-handoff-and-maintenance) · [Agent support](#agent-entry-points) · [Verification limits](#verification-status)

## 1. Choose The Target

Ask together for missing essentials: target machine/access, intended audience, URL/domain, approved email domains and administrator credential delivery. Use existing answers. Inspect everything else before asking. SMTP is optional; use manual onboarding if the operator has no mail service.

| Target | Access and configuration |
| --- | --- |
| This computer only | Keep `http://localhost:3001` and the shipped loopback port mapping. No DNS, public firewall or proxy setup needed. |
| Company LAN | Use a company-resolvable hostname and a reverse proxy on the app host. Prefer company TLS certificates or an internal CA trusted by every client. Restrict proxy access to the intended LAN/VPN. |
| Public server | Use a public DNS name and HTTPS reverse proxy. Follow the [first VPS runbook](project_docs/RnD_docs/FIRST_VPS_DEPLOYMENT_RUNBOOK.md) for DNS, firewall and host preparation. |

Changing `app.base_url` does **not** change listening interfaces, DNS or firewall rules. The packaged app listens on host `127.0.0.1:3001`; other computers reach the proxy, not that port. Keep this binding. For a remote localhost-only evaluation, an SSH tunnel can expose the server's loopback port on the operator's computer.

Do not apply a public VPS's firewall/SSH changes to an existing company server blindly. Respect existing services and the user's authorized deployment scope. Ask for missing access or a disruptive decision only when it is needed; do not treat these instructions as new permissions.

## 2. Inspect And Prepare

1. Inspect OS, CPU architecture, available RAM/disk, existing containers/listeners, Git checkout and current configuration. Check ports 3001 and, for a proxy, 80/443 for conflicts. Do not start a second instance over existing data.
2. Prefer the tested Ubuntu Server 24.04 LTS route with rootless Podman and a Compose provider. Other Linux distributions need their own package/service setup. For Windows/macOS use a suitable Linux host/VM; native deployment is not established by this guide.
3. Install missing Git, Bash, curl, Podman and a Compose provider using the host's package manager. On Ubuntu the runtime packages are `podman podman-compose`; add `caddy` for the proxy routes. Verify `podman info` and `podman compose version` as the deployment user. Use the runbook for rootless prerequisites and service setup. Node/pnpm are installed **inside the image**; host Node/Vite development servers are unnecessary for deployment.
4. Clone into an operator-owned directory, or inspect and reuse an existing checkout:

   ```bash
   git clone https://github.com/AtanasRusevPros/opa-voting-tool.git app
   cd app
   ./deploy.sh help
   ./deploy.sh version
   ```

Use one installation per deployment user with the current helper: container discovery uses the service label, and default service/volume names and ports are shared. For a rehearsal use a dedicated disposable host/user; do not run restore or backup against an ambiguous set of same-service containers.

Read [AGENTS.md](AGENTS.md) for repository guidance. Source changes are not normally required to deploy. `deploy.sh` and [compose.yaml](infra/containers/compose.yaml) define command/runtime behavior; use the [Usage guide](project_docs/RnD_docs/USAGE.md) and VPS runbook for details as needed.

## 3. Configure The Installation

```bash
./deploy.sh config:migrate
```

This creates ignored `config/deployment.local.toml` from the safe tracked defaults, and preserves an existing local file. Edit this file using a TOML-aware method; merge sections instead of appending duplicate tables. Never replace existing credentials/configuration on a rerun. Avoid the sample template's illustrative SMTP/Jira values unless actually configuring those services.

| Setting | Action |
| --- | --- |
| `[app].base_url` | Set the exact browser origin, including scheme and any nonstandard port. |
| `[admin]` | Set a unique username (at least two characters), strong password (at least eight characters), and display name before first start. Use `/admin` to sign in. |
| `[app].allowed_domains_path` | Keep `config/allowed-domains.txt`; edit that file to the intended login domains. This is an allowlist, not automatic team membership. |
| `[smtp]` | Leave the shipped blank values for supported manual delivery, or configure real SMTP and verify delivery. |
| `[public_trial]` | For a fresh ordinary company installation set `enabled = false`, `mode = "disabled"`. These are the default semantics; existing trial workspaces are not converted by this switch. |
| `[demo]` | Leave `enabled = false` unless the operator asks for synthetic demo teams. |
| `[backups]` | Recommend `enabled = true`, `interval_hours = 168`, `max_age_days = 21` for bounded database snapshots; see backup scope below. |
| `[auth].access_requests_enabled` | Keep `true` if employees should request access; set `false` for invitation/manual provisioning only. |

Keep the simulator/debug environment switches disabled (`SIMULATOR_MODE_ENABLED=0`, `E2E_DEBUG_CODES=0`). Do not enable them to simplify onboarding or verification. Keep optional Jira/branding unchanged unless requested.

Credentials belong in ignored configuration or an operator's secure channel, never in tracked files, shell transcripts or the final report. Restrict config access while allowing the container's mapped user to read it. The build's `.containerignore` excludes local overrides/data; runtime config is mounted from the checkout. Do not publish deployment archives or existing locally built images containing secrets.

`config/deploy.local.toml` is a **different** file: optional startup/watchdog/health overrides. Ordinary deployments use the tracked automatic defaults. Keep private edits to the tracked allowlist during upgrades; do not commit company details just to make `git pull` succeed.

Without SMTP, sign in at `/admin`, create the team and use the manual provisioning/invitation controls. Deliver generated passwords privately; users then use normal email/password sign-in. See [Super Admin Guide — manual onboarding](project_docs/RnD_docs/SUPER_ADMIN_GUIDE.md) and [Team Admin Guide](project_docs/RnD_docs/TEAM_ADMIN_GUIDE.md). Do not tell users to wait for email when SMTP is disabled.

## 4. Start And Connect

From the checkout, as the deployment user:

```bash
./deploy.sh up
./deploy.sh health
./deploy.sh startup:status
./deploy.sh watchdog:status
```

First start builds the image if needed. A local build is not necessarily current when reusing an old image; use `./deploy.sh rebuild` to build/recreate from the current sources. Both commands can install startup/watchdog automatically. Check their reported results rather than assuming installation succeeded. On a disposable local evaluation only, `DEPLOY_AUTO_ENABLE_KEEPALIVE=0 ./deploy.sh up` avoids installing host startup jobs; a persistent server should retain supervision and the appropriate user linger configuration from the runbook.

For localhost, open `http://localhost:3001`, then `/admin`.

For LAN/public access, merge a site into the existing Caddy configuration without replacing other sites. Examples use placeholders; substitute the actual chosen hostname:

```caddyfile
# Public DNS with normal certificate issuance:
vote.example.com {
    reverse_proxy 127.0.0.1:3001
}
```

```caddyfile
# Private DNS with Caddy's internal CA:
vote.company.internal {
    tls internal
    reverse_proxy 127.0.0.1:3001
}
```

For LAN, arrange DNS and distribute the CA's **public root certificate**, never its private key, through company device management. Every browser/device must trust it. Alternatively use the company's existing proxy/certificate arrangement. Do not bypass certificate errors as a successful deployment. See [Caddy local HTTPS](https://caddyserver.com/docs/automatic-https#local-https).

Validate and reload the proxy after configuration, then check the chosen origin:

```bash
./deploy.sh caddy:reload
./deploy.sh public-health
```

The command named `public-health` checks the configured origin, including a LAN origin. Run a browser check from another intended client too: a server-local request does not prove LAN routing, firewall or client certificate trust. Caddy forwards WebSocket upgrades; validate real two-browser voting through the proxy. Use a protected HTTP LAN only if the operator knowingly chooses that tradeoff; public deployment should use HTTPS.

For a failed start, inspect `./deploy.sh logs` and `./deploy.sh health` first. An HTTP 502 can mean the app is down; do not repeatedly change TLS settings or erase the database. Use `./deploy.sh diagnose` if needed and redact secrets before sharing output.

## 5. Verify Before Handoff

Use disposable users and a disposable team. Keep production data intact; do not turn on debug authentication.

- Health and page load succeed at the intended URL. `/admin` loads directly and the configured administrator can sign in. Normal company mode has no public-trial signup/quota UI.
- Provision two allowlisted users using the chosen SMTP/manual route. Confirm a non-allowlisted invitation is rejected. Sign in through separate browser contexts and join the same team.
- Start an issue, vote from both browsers, reveal and inspect history. Check that realtime changes reach both browsers and each vote belongs to its voter.
- Reload both browsers, then run `./deploy.sh restart`; verify users/team/history survive and health recovers. Confirm startup/watchdog status; test an actual reboot only on the disposable target or during an authorized maintenance window.
- Run `./deploy.sh backup` and `./deploy.sh backup:list`; check that the archive contains the SQLite database and intended config. Restrict archive access. Check scheduled snapshots with `./deploy.sh backup:auto:list` when enabled.
- Rehearse `./deploy.sh restore <archive-path>` **only on disposable data or an explicitly authorized restore target**. It stops the app and replaces data/config. Validate the restored login/team/history and health. Follow the [backup/restore runbook](project_docs/RnD_docs/FIRST_VPS_DEPLOYMENT_RUNBOOK.md#backup-and-restore-rehearsal), including correct volume selection if customized.
- Re-run `config:migrate` and `up`; verify local configuration and persisted records remain unchanged. A rerun must not create new credentials, reset data or duplicate proxy sites/jobs.

If no browser tool, SMTP credentials, secondary LAN client or reboot permission is available, complete the independent checks and list the precise unverified steps. Never describe an HTTP 200 alone as a fully verified deployment.

## 6. Handoff And Maintenance

Give the operator a short result: user/admin URLs, source revision, host/runtime, SMTP/manual onboarding choice, config/volume/backup locations, how to retrieve credentials securely, checks passed and remaining limitations.

| Task | Command / behavior |
| --- | --- |
| Update | `./deploy.sh update`: fetch/check sources; newer sources trigger backup/pull/rebuild. Unchanged sources print Already up to date. |
| Apply local config | `./deploy.sh restart`, followed by health and origin checks. |
| Rebuild current sources | `./deploy.sh rebuild`; useful after an interrupted deployment. |
| Diagnose | `./deploy.sh health`, `./deploy.sh public-health`, `./deploy.sh logs`. |
| Backup | `./deploy.sh backup`; default archive directory is `../backups`, latest three retained after successful creation. These contain secrets as well as data. |
| Database snapshots | Opt-in weekly, maximum three completed copies, 21-day default expiry; stored in the app data volume. They exclude config/branding and do not protect against loss of that disk. Arrange off-host backup separately. |
| Restore | `./deploy.sh restore <archive-path>`; destructive replacement, not a routine update step. |

The live database/history and statistics do not expire merely because backups rotate. Explicit account/workspace deletion still has its documented effects. Hardware determines practical capacity; self-hosting removes demo quotas, not resource limits. See [Privacy and Backups](project_docs/RnD_docs/PRIVACY_AND_BACKUPS.md).

## Agent Entry Points

- [AGENTS.md](AGENTS.md) routes deployment requests here; [CLAUDE.md](CLAUDE.md) imports that repository guidance for Claude Code.
- [Deploy OpaVoting skill](.agents/skills/deploy-opavoting/SKILL.md) uses the open [Agent Skills format](https://agentskills.io/home). It points to this guide rather than duplicating the procedure.
- Repository discovery/trust settings vary by tool/version. Codex and Cursor support repository agent instructions; Claude Code has its own instructions/skill locations. OpenClaw and Hermes also support Agent Skills. If automatic discovery is unavailable, explicitly ask the tool to read this guide or the skill file from the checkout; no plugin or paid service is required by OpaVoting.
- A copied skill still needs the OpaVoting checkout. Keep its guide references local to that checkout and review any tool-specific installation/trust requirements. Instructions do not grant server access or execution permissions.

References: [Codex instructions](https://learn.chatgpt.com/docs/agent-configuration/agents-md), [Claude project instructions](https://code.claude.com/docs/en/memory), [Cursor rules](https://prod.cursor.com/help/customization/rules), [OpenClaw skills](https://docs.openclaw.ai/tools/skills), [Hermes skills](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills/).

## Verification Status

The project's established first-server path is Ubuntu Server 24.04 LTS with Podman/Caddy. This guide does not establish support for every OS, agent or company network. Record clean-checkout/container rehearsal separately from fresh-OS installation, LAN client trust, public DNS/TLS, real SMTP and boot recovery; see the current [deployment verification record](project_docs/RnD_docs/AI_DEPLOYMENT_VERIFICATION.md).
