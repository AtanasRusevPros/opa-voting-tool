<!--
SPDX-FileCopyrightText: 2026 Atanas G. Rusev
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Usage And Operations

[Documentation index](../README.md) · [Project home](../../README.md)

<details>
<summary>Contents</summary>

- [Try It Online](#try-it-online)
- [First Voting Session](#first-voting-session)
- [Local Development](#local-development)
- [Podman Stack Workflow](#podman-stack-workflow)
- [Deployed VPS Operator Workflow](#deployed-vps-operator-workflow)
- [Command Use Guide](#command-use-guide)
- [Command Behavior Notes](#command-behavior-notes)
- [Live Bot Simulator](#live-bot-simulator)
- [Operator Guides](#operator-guides)
- [Default Runtime Ports](#default-runtime-ports)
- [Authentication Notes](#authentication-notes)
- [Editable Deployment Files](#editable-deployment-files)
- [Main Board Notes](#main-board-notes)
- [Import And Export Notes](#import-and-export-notes)
- [Jira Cloud Notes](#jira-cloud-notes)
- [Verification Matrix](#verification-matrix)
- [Hosted-trial collaboration and limits](#hosted-trial-collaboration-and-limits)
- [Hosted demo versus self-hosting](#hosted-demo-versus-self-hosting)
- [Weekly app-managed backups and trial privacy](#weekly-app-managed-backups-and-trial-privacy)
- [Usage Statistics](#usage-statistics)
- [Edit An Issue Title](#edit-an-issue-title)
- [Responsive UI checks](#responsive-ui-checks)
- [Workspace identity on a team](#workspace-identity-on-a-team)

</details>

Created: 2026-04-03 10:35 EEST

For an agent-led setup from scratch, start with the [AI-assisted deployment guide](../../AI_DEPLOYMENT.md), including localhost/LAN/public-server choices and verification.

## Try It Online

**[Try the free live demo](https://app.opavotingtool.eu)** — no installation needed. Enter your email, choose **Start free public trial**, and follow the email instructions to start voting with your team. The hosted demo has [usage limits](#hosted-trial-collaboration-and-limits); self-host for ongoing or company-wide use.

## First Voting Session

1. Sign in with your email/password or follow the invitation instructions. Without SMTP, get the generated password from your admin.
2. Open a team you belong to, or create one if your deployment permits it. A visible team is not necessarily a joined team; request access when offered.
3. Enter an issue title (at least five characters in the start/deal form), start voting, and choose your card. Participants see voting status until reveal.
4. Reveal when ready; a team's minimum-participation rule may keep the round open. Results appear in history after successful reveal.
5. Use History/Search for earlier results, Deal for a new issue, and Account for personal settings. See [phone controls](TEAM_ADMIN_GUIDE.md#phone-and-touch-use) and [team administration](TEAM_ADMIN_GUIDE.md).

## Local Development

1. Use Node.js `22.22.2`. The pinned local version is in [`.nvmrc`](../../.nvmrc), so nvm users can run `source "$HOME/.nvm/nvm.sh" && nvm use`.
2. Install dependencies with `./dev.sh deps`.
3. Run `./deploy.sh config:migrate`, set `[admin].username/password` in ignored `config/deployment.local.toml`, and review [`config/allowed-domains.txt`](../../config/allowed-domains.txt). Leave SMTP blank for manual onboarding.
4. Start the API:
   `pnpm --filter @planning-poker/api dev`
5. Start the web app:
   `pnpm --filter @planning-poker/web dev`
6. Open `http://localhost:3000`.

## Podman Stack Workflow

The local packaged stack is Podman-first.

Commands:
- `./dev.sh version`
- `./dev.sh stack:up`
- `./dev.sh stack:down`
- `./dev.sh stack:verify`

Behavior:
- `./dev.sh` prefers `podman compose`
- otherwise it falls back to `podman-compose`
- on macOS only, packaged stack/e2e commands auto-check the Podman machine, initialize it if missing, start it if stopped, and restart it once when the connection socket is stale
- `./dev.sh stack:up` always tears down the existing compose-managed stack for this project, rebuilds the image with `--no-cache`, and starts with `--force-recreate`; this keeps the named data volume unless you explicitly remove it yourself
- stack verification checks `http://localhost:3001/health`

## Deployed VPS Operator Workflow

HTTPS is enforced for LAN/public deployments. Before upgrading, follow [HTTPS configuration and trusted proxy setup](HTTPS_DEPLOYMENT.md), including the container NAT peer address if applicable. HTTP remains available for localhost testing and the direct local health probe.

Use [`deploy.sh`](../../deploy.sh) on the server after the repo is cloned to `/opt/opa-voting-tool/app` or another deployment directory. This script is for deployed operations; keep using `./dev.sh` for local development and automated verification.

Public clone command for a fresh deployed checkout:

```bash
git clone https://github.com/AtanasRusevPros/opa-voting-tool.git app
cd app
```

Common commands:
- `./deploy.sh help`
- `./deploy.sh version`
- `./deploy.sh rebuild`
- `./deploy.sh up`
- `./deploy.sh down`
- `./deploy.sh restart`
- `./deploy.sh health`
- `./deploy.sh public-health`
- `./deploy.sh startup:status`
- `./deploy.sh startup:enable`
- `./deploy.sh startup:disable`
- `./deploy.sh watchdog:status`
- `./deploy.sh watchdog:run`
- `./deploy.sh incidents`
- `./deploy.sh incidents:ack` optionally clears a still-unacknowledged retained incident marker
- `./deploy.sh diagnose:demo-counts`
- `./deploy.sh ps`
- `./deploy.sh logs`
- `./deploy.sh logs:follow`
- `./deploy.sh diagnose`
- `./deploy.sh caddy:reload`
- `./deploy.sh backup`
- `./deploy.sh backup:list`
- `./deploy.sh backup:prune`
- `./deploy.sh restore <file>`
- `./deploy.sh usage`
- `./deploy.sh usage:json`
- `./deploy.sh users:export`
- `./deploy.sh workspaces:export`
- `./deploy.sh update`
- `./deploy.sh config:migrate`

The helper reads the public URL from `APP_URL` first, then ignored `config/deploy.local.toml`, then ignored `config/deployment.local.toml`, and finally tracked `config/deployment.toml`. Override with `APP_URL=https://your-host ./deploy.sh public-health` if needed.

Keep-alive defaults:
- the first real deployed `./deploy.sh up`, `./deploy.sh rebuild`, `./deploy.sh restart`, `./deploy.sh restore`, or `./deploy.sh update` tries to install automatic startup plus watchdog without requiring an extra post-install command
- the default backend selection is `systemd` when available, otherwise `cron`
- the tracked keep-alive defaults live in `config/deploy.toml`
- use ignored `config/deploy.local.toml` only for non-default backend, watchdog interval, health URL, or incident-directory overrides
- `./deploy.sh startup:disable` turns keep-alive off completely and persists that choice
- `./deploy.sh startup:enable` turns the default keep-alive layer back on

Use `./dev.sh version` locally or `./deploy.sh version` on a deployed checkout to print the project version and current Git commit. See [`VERSIONING_AND_RELEASES.md`](VERSIONING_AND_RELEASES.md) for the release policy.

New release/update flow on the VPS:
1. SSH to the server as the deploy user.
2. Run `cd /opt/opa-voting-tool/app`.
3. Run `./deploy.sh update`.
4. Run `./deploy.sh public-health`.
5. Open the HTTPS app and do a short login/team/vote/reveal smoke test.
6. If anything looks wrong, run `./deploy.sh diagnose` before editing Caddy or firewall settings.

`./deploy.sh restore <archive>` replaces data/config and checks health. It returns exit status 0 on success and nonzero on failure, and cleans up temporary extraction files. Rehearse on disposable data before production use.

`./deploy.sh update` first fetches the tracked Git branch. If its commit matches the downloaded sources, it reports **Already up to date** and skips backup, rebuild and restart. This checks source versions, not running-container health; use `./deploy.sh rebuild` to redeploy existing sources (including retrying a failed deployment). Fetch errors stop the update.

Migration note for replacing or moving an existing deployment checkout:
- take a backup before changing the checkout
- preserve ignored local overrides `config/deployment.local.toml` / `config/deploy.local.toml`, edits to tracked `config/allowed-domains.txt`, and uploaded `config/managed-branding` assets
- do not copy historical untracked compose/config scratch folders into the replacement checkout

Backup/restore rehearsal on a test deployment:
1. Create a clearly named baseline team in the browser, for example `BACKUP_BASELINE_KEEP_ME`.
2. Run `./deploy.sh backup`.
3. Run `./deploy.sh backup:list` and copy the newest archive path.
4. Create a second clearly named team, for example `RESTORE_TEST_SHOULD_DISAPPEAR`.
5. Run `./deploy.sh restore ../backups/<backup-file>.tar.gz`.
6. Verify the baseline team still exists and the post-backup test team disappeared.

`./deploy.sh restore` is destructive by design: it stops the app, overwrites the configured Podman data volume, restores deployment config/branding files included in the archive, starts the app again, and waits for local health. It asks for `RESTORE` confirmation unless `DEPLOY_RESTORE_CONFIRM=1` is set for an automated rehearsal.

Backup retention:
- `./deploy.sh backup:prune` removes older `planning-poker-backup-*.tar.gz` archives from `BACKUP_DIR`.
- It keeps the newest `3` backups by default; set `BACKUP_PRUNE_KEEP=3` or another positive number to change the retention count.
- Set `BACKUP_PRUNE_DRY_RUN=1 ./deploy.sh backup:prune` to preview which archives would be deleted.

Operator reporting:
- `./deploy.sh usage` prints a human-readable summary of users, workspaces, teams, active sessions, current-month reveals/votes, and database size.
- `./deploy.sh usage:json`, `./deploy.sh users:export`, and `./deploy.sh workspaces:export` print machine-readable JSON for operator review; exports intentionally avoid passwords, tokens, sessions, SMTP secrets, Jira secrets, and deployment secrets.
- Reporting commands exclude marked synthetic accounts and demo/simulator teams by default. Add `--include-synthetic` to any of the four usage/export commands to include them for diagnostics. This filter never changes stored data, backups or team-history exports.
- `./deploy.sh diagnose:demo-counts` prints the focused demo-team/count troubleshooting report in one command; by default it hides demo identities and only shows counts/status, while `./deploy.sh diagnose:demo-counts --include-demo-accounts` reveals the demo-account details for deeper cleanup/debugging

Keep-alive operator checks:
- `./deploy.sh health` now prints the local API/web result plus startup backend, watchdog state, and latest retained incident summary
- `./deploy.sh public-health` prints the same keep-alive summary while checking the public HTTPS `/health` path through Caddy
- `./deploy.sh startup:status` shows whether automatic startup is installed and which backend is active
- `./deploy.sh watchdog:status` shows the configured cadence and the last watchdog run summary
- `./deploy.sh incidents` shows the retained incident summary, failure counters, and current/previous bounded runtime logs
- `./deploy.sh incidents:ack` optionally clears the current unacknowledged retained incident marker without deleting the stored evidence

## Command Use Guide

- Local dev: `pnpm --filter @planning-poker/api dev` and `pnpm --filter @planning-poker/web dev`
- Local Node runtime: Node.js `22.22.2` from [`.nvmrc`](../../.nvmrc) is required for dependency, build, packaged stack build, test, and simulator commands on Linux and macOS
- Packaged local stack: `./dev.sh stack:up`, `./dev.sh stack:verify`, `./dev.sh stack:down`
- Deployed VPS operations: `./deploy.sh help`, then use the short deployed-state commands instead of raw `podman compose` and Caddy commands
- Simulator demo: `./dev.sh sim:seed`, `./dev.sh sim:up`, `./dev.sh sim:status`, `./dev.sh sim:down`
- Milestone verification: `./dev.sh test:full` and `./dev.sh test:e2e`
- Shell helper command-contract verification: `./dev.sh test:scripts`
- Heavy seeded-room layout validation: `./dev.sh test:e2e:sim`
- Broad Phase 2 automated verification: `./dev.sh phase:p2:verify`
- Capacity and load-balance verification: `./dev.sh phase:p3:verify`

## Command Behavior Notes

If an update downloads sources but fails during image building, correct the reported cause and run `./deploy.sh rebuild`; another update can skip unchanged sources. For Podman 6 rejecting `slirp4netns`, follow [runtime recovery](FIRST_VPS_DEPLOYMENT_RUNBOOK.md#podman-6-and-existing-rootless-settings).

- `./dev.sh deps`, build, `stack:up`, test, and simulator-start commands source nvm when it is available and run `nvm use` before continuing, so the pinned version from [`.nvmrc`](../../.nvmrc) is applied automatically.
- If nvm is unavailable, those commands stop early unless the active local `node` executable is already Node 22. The workspace packages also declare `node >=22 <23`.
- `./dev.sh stack:down` and `./dev.sh stack:verify` do not require local Node 22 because they only stop or inspect the packaged Podman workflow.
- `./dev.sh stack:up` runs in the foreground, keeps printing stack logs until stopped, and uses the strict refresh path (`down --remove-orphans`, `build --no-cache`, `up --force-recreate`) on every run so stale containers or cached image layers are not reused.
- On macOS, `./dev.sh stack:up` and packaged e2e commands self-heal the common `unable to connect to Podman socket` case by managing the local Podman machine before compose runs. This is intentionally macOS-only because Linux Podman runs natively without the VM/socket layer.
- On restricted local Linux environments, rootless Podman may fail bridge creation with a `netavark` error. Packaged stack/e2e commands default to `PACKAGED_STACK_NETWORK_MODE=auto`, which tries the normal bridge first and retries with host networking only when needed. Use `PACKAGED_STACK_NETWORK_MODE=bridge` or `PACKAGED_STACK_NETWORK_MODE=host` to force one mode for debugging. This is local verification behavior; VPS deployment still uses the normal deployed compose port binding.
- `./dev.sh sim:up` starts the live bot simulator as a long-running helper and returns control to the shell; it uses `setsid` when available and falls back to `nohup` on macOS-style environments where `setsid` is not installed.
- `./dev.sh test:e2e` runs the packaged browser flow and may take ownership of the local stack during the test window.
- `./dev.sh test:e2e:sim` seeds/starts the simulator, runs the dedicated seeded-room layout matrix, and then stops the simulator again.
- `./dev.sh test:e2e:perf`, `./dev.sh test:e2e:sim`, and `./dev.sh test:e2e:sim:matrix21` must be run serially, never in parallel, because they reuse the same packaged stack, seeded simulator teams, and live simulator/runtime resources.
- `./dev.sh phase:p2:verify` runs the full automated Phase 2 batch in sequence, including packaged and simulator-backed suites.
- `./dev.sh phase:p3:verify` refreshes the latest Phase 3 capacity artifacts in `project_docs/RnD_docs/perf_runs`, and those artifacts now show separate `broadcast.team.vote.*` and `broadcast.team.round.*` slices so routine vote pressure and reveal/transition pressure can be evaluated independently.
- The latest Phase 11 artifacts also expose vote-delta batch behavior directly through `broadcast.team.vote.deltaUsers`, `broadcast.team.vote.versionSpan`, and the `http.teamState.reason.*` repair counters, so version-gap recovery and batch size can be judged from the saved JSON instead of guessed from aggregate latency alone.

## Live Bot Simulator

The local stack now supports a separate dev-only simulator workflow.

Commands:
- `./dev.sh sim:seed`
- `./dev.sh sim:up`
- `./dev.sh sim:down`
- `./dev.sh sim:status`

Behavior:
- simulator users are deterministic seeded accounts such as `sim.bot.001@example-company.com`
- demo teams are created as `Sim Team 10`, `Sim Team 15`, `Sim Team 20`, `Sim Team 25`, `Sim Team 30`, `Sim Team 40`, `Sim Team 50`, `Sim Team 60`, `Sim Team 70`, and `Sim Team 80`
- bots stay connected through the real WebSocket team channel
- when a round becomes active, each bot votes with 80% probability using a random card from the team deck
- bots never reveal; the human observer reveals manually
- `Sim Team ...` rooms are now shown only while the simulator sidecar is alive and sending heartbeats; if the sidecar is stopped, those rooms disappear from the normal product UI until it comes back, and the chooser/board flows now converge automatically instead of needing a manual app reset to notice that runtime change
- the raw compose/deployed stack defaults now keep simulator mode off, while `./dev.sh stack:up` intentionally enables it for local simulator workflows unless you explicitly override `SIMULATOR_MODE_ENABLED=0`

Required runtime settings:
- `SIMULATOR_MODE_ENABLED=1`
- `SIMULATOR_SHARED_SECRET`

Optional runtime settings:
- `SIMULATOR_BASE_URL`
- `SIMULATOR_VOTE_PROBABILITY`
- `SIMULATOR_RANDOM_SEED`

Typical local flow:
1. start the packaged stack with `./dev.sh stack:up`
2. in another terminal, verify health with `./dev.sh stack:verify`
3. seed demo users and teams with `./dev.sh sim:seed`
4. start the live bots with `./dev.sh sim:up`
5. sign in normally as a human user and join one of the `Sim Team ...` teams
6. confirm the simulator is still running with `./dev.sh sim:status`
7. stop the simulator later with `./dev.sh sim:down`

Troubleshooting:
- if `sim:status` says the simulator is not running, check [`.simulator/simulator.log`](../../.simulator/simulator.log)
- if you want a quiet manual login flow first, run `./dev.sh sim:down` and test without bots
- simulator mode is dev-only and must remain disabled in production
- disabling simulator mode does not affect the separate super-admin demo mode used for in-app large-user testing

## Operator Guides

- First VPS deployment runbook: [`FIRST_VPS_DEPLOYMENT_RUNBOOK.md`](FIRST_VPS_DEPLOYMENT_RUNBOOK.md)
- Super-admin guide: [`SUPER_ADMIN_GUIDE.md`](SUPER_ADMIN_GUIDE.md)
- Team-admin guide: [`TEAM_ADMIN_GUIDE.md`](TEAM_ADMIN_GUIDE.md)

Production deployment note:
- the first VPS runbook is tested on Ubuntu Server 24.04 LTS
- the architecture should apply to common Linux server distributions with expected package-manager, firewall, service, and Podman/Compose differences
- app content should be served through HTTPS only
- plain HTTP may be used by the reverse proxy for certificate automation and redirect, but it should not serve the app itself
- the packaged compose service publishes the app on host-local `127.0.0.1:3001`, and the internal app port should remain private to the VPS/reverse proxy
- if HTTPS returns `502`, diagnose the upstream app first with local `/health`, `podman ps -a`, app logs, and Caddy journal output before changing the proxy config

## Default Runtime Ports

- Web dev server: `3000`
- API server: `3001`
- Health endpoint: `GET /health`

## Authentication Notes

- Normal users can open `Account settings -> Delete account` to review and confirm account deletion.
- Deleting a non-owner account removes access, sessions, memberships, and the original email while preserving shared voting/comment history as `Name (Deactivated)`.
- The deletion preview explains the destructive impact before the action is confirmed.
- The original email can register again as a completely fresh account. Existing backups and previously exported files are not rewritten automatically.
- The configured super-admin account cannot be deleted.

- First access or password reset starts with a 16-digit code request for an allowlisted company email.
- After code verification, set a real password for later sign-in.
- Returning users normally sign in with email + password.
- The normal user sign-in flow is now one unified screen instead of separate initial and password pages.
- The login screen now also includes `Forgot password`.
- `Request access` appears only when `[auth].access_requests_enabled` is true (the default). Set it to false in `config/deployment.local.toml` and restart to hide the button and reject new API submissions; trial signup and invitations are independent.
- Normal sign-in is at `/`; super-admin sign-in is at `/admin`, with the existing separate admin credentials. There is no public Admin button.
- Enter a valid-looking email to enable the secondary Forgot password and Start free public trial actions; trial signup is shown only in open-signup mode.
- If SMTP or debug-code delivery is available, `Forgot password` sends the user into the code-based password reset flow.
- If SMTP is not configured for that deployment, `Forgot password` tells the user to contact a team admin or the super-admin for a manually generated replacement password.
- In development without SMTP configured, the API logs login codes to stdout.
- Code responses are enabled outside production or by `E2E_DEBUG_CODES=1` / `DEBUG_TOOLS_ENABLED=1`; see [debug authentication](DEVELOPMENT.md#debug-authentication). Keep these disabled in production.
- Session expiry defaults to 90 days since last activity.
- Override the TTL with `SESSION_TTL_DAYS`.
- Super-admins are always members of every team, but by default they stay on the chooser/Platform surface unless they explicitly open a team.
- Signed-in users can now change their password from the `Account settings` modal available from both the chooser and the board header profile area.
- In **Account settings**, **Open my last team automatically after sign-in** is on by default. Turn it off to start at the chooser after sign-in or a fresh app entry. Saving does not move you away from the current board. A deliberate team URL still takes priority when accessible; unavailable teams fall back to the chooser. The setting is saved per account, across browsers, for both deployment modes. The dedicated super-admin entry retains its existing chooser-first default.
- Team Admin / People stays live while open from either the board or chooser: membership and Onboard/Not online status refresh without reopening it. Merely viewing People from the chooser does not count as board participation or affect reveal thresholds.
- Signed-in users can now also disable board action keyboard shortcuts globally from `Account settings` without affecting normal Enter/Escape form behavior.
- Signed-in users can personalize the Issues List history time popup from `Account settings`. The first list shown is the current team default, but saving a personal list stores it only for the current team; `Use team default` removes that team's personal override.
- Team-admins can regenerate lost manually shared credentials for users who are already members of their current team when SMTP is not configured.
- Admin-capable chooser/board entry buttons are now labeled `Team admin`, but the rest of the member-management surface keeps its descriptive wording.

## Editable Deployment Files

### Allowed Domains

File:
- [`config/allowed-domains.txt`](../../config/allowed-domains.txt)

Format:
- one domain per line
- comments begin with `#`

Local verification:
1. edit the file
2. restart the API
3. request a code for one allowed email and one disallowed email
4. confirm the allowed email succeeds and the disallowed one gets `403`

### Deployment Config And Branding

Runtime config priority:
- ignored deployment/local override: `config/deployment.local.toml`
- tracked local-development default: [`config/deployment.toml`](../../config/deployment.toml)

Deploy/operator keep-alive config priority:
- ignored override: `config/deploy.local.toml`
- tracked default: [`config/deploy.toml`](../../config/deploy.toml)

Example template:
- [`config/deployment.sample.toml`](../../config/deployment.sample.toml)

Managed branding uploads:
- [`config/managed-branding`](../../config/managed-branding)

Fallback public branding assets:
- [`apps/web/public/branding`](../../apps/web/public/branding)
- [`apps/web/public/branding/login-logo.svg`](../../apps/web/public/branding/login-logo.svg)
- [`apps/web/public/branding/login-background.svg`](../../apps/web/public/branding/login-background.svg)
- [`apps/web/public/branding/team-logo.svg`](../../apps/web/public/branding/team-logo.svg)
- [`apps/web/public/branding/team-background.svg`](../../apps/web/public/branding/team-background.svg)
- [`apps/web/public/branding/avatars`](../../apps/web/public/branding/avatars)
- [`scripts/generate-animal-avatars.mjs`](../../scripts/generate-animal-avatars.mjs)

Operational notes:
1. super-admins can open `Platform` in the app to edit the tabbed platform surface:
   `People`, `Stats`, `Branding`, `App settings`, `SMTP`, and `Super-admin`
2. the `People` tab owns pending platform access requests, admitted platform users, and super-admin-only existing-user password reset
3. the `Super-admin` tab owns admin credentials plus Jira Cloud client credentials, site connection, and disconnect/site-selection actions
4. branding uploads from that UI are written into `config/managed-branding`
5. the repo ships both a tracked safe template `config/deployment.toml` and an example `config/deployment.sample.toml`
6. local packaged-stack and deployed runs use ignored `config/deployment.local.toml` when present, otherwise the tracked template
7. the tracked default leaves SMTP blank; the sample template contains illustrative SMTP values, so remove/replace those before use
8. the tracked templates intentionally leave super-admin username/password blank for safety
9. create `config/deployment.local.toml` with `./deploy.sh config:migrate` or by copying `config/deployment.sample.toml`, then set `[admin].username` and `[admin].password` before starting the app
10. if credentials are missing, `./dev.sh stack:up`, `./deploy.sh up`, `./deploy.sh rebuild`, `./deploy.sh restart`, and `./deploy.sh update` stop with a clear setup message
11. the public branding files remain the fallback defaults when no managed override is configured
12. if you want to regenerate the shipped 200-avatar animal set, run `node scripts/generate-animal-avatars.mjs`
13. if SMTP is not configured, team-admin add/invite still works for new allowlisted users by revealing a one-time generated password for manual sharing
14. if SMTP is not configured, existing-user password reset is done from the super-admin `Platform -> People` tab for platform-wide recovery, or from a team's `Team admin -> People` tab when the requester is already a member of that team; team-admin reset is disabled while the target user is currently live on that team's board, and replacement credentials appear inline under the selected member row
15. automated SMTP-capable verification uses mocked transport tests and does not require a real external mail server
16. managed branding upload/application is now covered in both the backend admin-config suite and the web settings suite so asset-regression checks are not left to manual testing alone
17. for manual local SMTP validation, point the app to Mailpit or MailHog and confirm invite/reset mail appears there
18. real production mail still requires valid SMTP settings in the deployment config; SMTP-backed account delivery has been smoke-tested on the alpha VPS through a real transactional mail provider
19. otherwise development/test uses the log fallback for codes and the manual-share onboarding/reset paths for team-admin recovery
20. automated packaged e2e/perf/simulator runs now use isolated packaged-stack data so old test teams should not leak back into the normal local stack after verification runs
21. both deployment TOML files now include a `[jira]` section; local defaults leave Jira disconnected, while the sample file shows the fields a real Jira Cloud setup needs
22. `[history_popup].timezone_keys` in the deployment TOML is the global date-popup timezone default used when new teams are created; team-admin defaults and per-team personal overrides take precedence later

## Main Board Notes

- Team switching is available directly from the board header through a one-click `Switch team` dropdown menu plus the main-menu button.
- The board exposes an icon-only share action that copies a permalink for the current team board.
- Share copy first uses the browser Clipboard API when the current context supports it, then falls back to a hidden text selection copy path so macOS/Linux and Chrome/Edge-style browsers have the same behavior surface.
- Shared team links preserve the requested board through sign-in and join approval instead of dropping the user into a generic chooser state with no target context.
- Normal successful vote/create/reveal/vote-again flows now reconcile through local optimistic state, authoritative round payloads, and websocket updates; full board-state reloads are reserved for board entry, reconnect, and explicit recovery/error paths.
- Routine active voting now uses a dedicated lightweight `team:round-vote` live message, while reveal/create/vote-again still use the richer `team:round` message. This keeps the UI behavior unchanged while lowering payload and browser work on heavy boards.
- The normal happy path is now explicitly delta-first: routine votes are coalesced into short bulk flushes, clients apply only the changed vote/user slice plus live-sync version metadata, and any refresh, reconnect, missing board state, round mismatch, or version gap forces an authoritative full `GET /api/teams/:teamId/state` repair before live updates resume.
- The team `Team admin` modal is now the main team-management workspace for team-admins and super-admins. Its `People` tab owns member management, add/invite flows, and current-team password resets; reset is disabled for members currently live on the board, and the replacement password appears inline under the selected member row. Its `Import/export` tab owns team-history import/export and team-level Jira source configuration.
- Team names are unique case-insensitively after trimming whitespace, including archived teams. Create/import actions live outside the team search field so searching and creating are separate workflows.
- The issues/history rail now loads the latest `20` revealed issues first and progressively loads older pages as the user scrolls or clicks `Load more`.
- The issues/history rail now includes a `Search` tab with filters for date range, title text, exact-title match, comment text, and voter/comment-author identity.
- The Issues List date popup uses the global deployment timezone rows when a team is created, then the timezone rows chosen by the team-admin as that team's default. Each user can override that list from `Account settings` for the current team only, or reset back to the team default later.
- Revealed history cards show the result first, the voter count second, and the numbering system third. Voter details and comments are collapsed by default, persist while the user stays on the same board, and reset when switching teams.
- Duplicate issue titles are allowed; history entries are identified by stable ids, team/round context, timestamps, and import metadata.
- If minimum participation blocks a reveal, no history entry is created. The denominator is the set of people currently live on the board at reveal/re-evaluation time, so people who leave stop blocking the round and people who rejoin before reveal count again. The same round remains active with the existing votes, and the server auto-reveals it once enough additional participants vote, presence changes make the current board population satisfy the threshold, or a team-admin lowers the threshold enough.
- Imported historical comments keep their stored `Name (email)` signature and are intentionally read-only after import.
- The profile editor is closed by default and opens from the compact profile chip in the top header. Avatar icon/color and board shortcut preference changes save immediately; display-name editing uses a pencil button followed by explicit checkmark save or `X` cancel.
- Avatar selection is stored in the database by avatar key, so users keep their chosen icon across reloads and sessions.
- The bell panel keeps live pending actions separate from paginated action history. Super-admins see platform-wide admin/workflow history there; team-admins see team-scoped action history only.
- The bottom status bar stays mounted during state changes so action feedback remains visible instead of blinking out between updates.
- Phone boards use a compact top-right controls menu. History sits below in portrait and on the right in landscape; tap its grip to toggle, or hold briefly then drag to show up to half the screen, or hide it completely. Voting controls and participant lists scroll independently of the header. See [phone operation](TEAM_ADMIN_GUIDE.md#phone-and-touch-use) and the [mobile test matrix](RESPONSIVE_TESTING.md); real-device acceptance remains separate from local emulation.

## Import And Export Notes

- Super-admins can open `Platform -> Super-admin` to export the full SQLite database as a snapshot and import a previously exported snapshot back into the app.
- Whole-database import is a maintenance operation: it replaces the current live database contents with the imported snapshot.
- Team-admins and super-admins can open the team `People` modal to export that team's revealed-history package as JSON.
- Team-history export includes comments by default, and comments can be excluded explicitly before export.
- Team-history packages can be imported either into the current team or as a brand-new team from the chooser's `Import a team` action.
- Reimporting the same team-history package into the same team skips duplicates instead of silently duplicating old rounds.

## Jira Cloud Notes

- This app supports Jira Cloud only in the current integration pass.
- Super-admins configure the global Jira Cloud connection from `Platform -> Super-admin`.
- The supported Jira Cloud auth model is Atlassian OAuth 2.0 3LO.
- If Atlassian returns more than one accessible site, the super-admin must choose which site to bind globally.
- Team-admins and super-admins can save team-level Jira source settings:
  - required project key
  - optional JQL
- `Import / refresh issues` reads Jira issue key plus title and stores them in the team's pending estimation queue.
- Loading a pending Jira issue into the board does not remove it immediately.
- The pending Jira item leaves the queue only when the round created from it is fully revealed.

Official Atlassian references:
- OAuth 3LO implementation: https://developer.atlassian.com/cloud/oauth/getting-started/implementing-oauth-3lo/
- Enabling OAuth 3LO: https://developer.atlassian.com/cloud/oauth/getting-started/enabling-oauth-3lo/
- Jira Cloud 3LO overview: https://developer.atlassian.com/cloud/jira/platform/three-legged-oauth/
- Jira issue search API: https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/

Testing note:
- Atlassian documents the OAuth flow, site/resource model, and issue-search APIs, but does not publish an official automated regression checklist for this exact integration pattern.
- The repo therefore verifies the Jira integration against those documented behaviors through backend integration tests, web/component tests, and packaged Playwright flows for super-admin setup and team-admin queue usage.

## Verification Matrix

- Shared contract or deck change: `./dev.sh typecheck`
- Backend logic change: `./dev.sh test:unit` and `./dev.sh test:int`
- Frontend behavior change: `./dev.sh test:web`
- Frontend perf-sensitive board-path change: `pnpm --filter @planning-poker/web exec vitest run src/App.test.tsx src/App.perf.test.tsx`
  Covers redundant board-reload avoidance on vote submission plus the participant-tile rerender isolation guards added in Phase 8.
- Phase 11 delta/recovery change: `pnpm --filter @planning-poker/web test:web`
  Includes the dedicated delta-correctness suite that proves vote deltas apply incrementally, version gaps force repair GETs, and missing-current-state cases recover safely.
- Wider milestone check: `./dev.sh test:full`
- Real packaged browser flow: `./dev.sh test:e2e`
  Covers single-user stability, reload and revote behavior, multi-user realtime synchronization, and compact-screen usability on the packaged Podman stack.
- Broad Phase 2 automated verification: `./dev.sh phase:p2:verify`
  Runs the complete Phase 2 automated batch: typecheck, API unit/integration coverage, frontend web/perf coverage, packaged browser e2e, simulator-backed perf, simulator-backed legality, and the strict `matrix21` viewport sweep.
- Broad Phase 3 capacity/stress verification: `./dev.sh phase:p3:verify`
  Runs the machine-heavy capacity batch against the packaged stack, covering the `200`-user single-room scenario, the `200 + 20x10` parallel-room scenario, and the `80`-user burst scenario while capturing API/repository timings, broadcast fanout timings, broadcast queue wait, websocket payload build/size metrics, vote-delta batch metrics, repair-reason counters, and Podman CPU/memory metrics. The latest public report is written to [`perf_runs/PHASE3_CAPACITY_VALIDATION_LATEST.md`](perf_runs/PHASE3_CAPACITY_VALIDATION_LATEST.md) plus its JSON companion, with the public headline summarized in [`PUBLIC_BENCHMARK_SUMMARY.md`](PUBLIC_BENCHMARK_SUMMARY.md).
- Backend live-sync stress verification: `./dev.sh test:unit`
  Now includes `tests/phase11-live-sync.test.ts`, which validates live-state ordering, invalidation, and mixed-room stress behavior for the in-memory delta path.
- Seeded-room simulator layout flow: `./dev.sh test:e2e:sim`
  Covers `Sim Team 10/15/20/25/30/50/80` geometry checks plus oversized smoke coverage for `Sim Team 150/400` against the live simulator-backed board with real viewport scenarios.
- Strict 21-person simulator matrix: `./dev.sh test:e2e:sim:matrix21`
  Covers the calibrated no-scroll `21`-person viewport sweep for `Sim Team 20` across the full constrained width/height matrix.
- Simulator-backed sequencing rule:
  Run `./dev.sh test:e2e:perf`, `./dev.sh test:e2e:sim`, and `./dev.sh test:e2e:sim:matrix21` one after another, not in parallel. Parallel execution can create false failures through shared stack/container collisions, simulator connection refusals, and contaminated perf/geometry measurements.
- Simulator logic change: `pnpm --filter @planning-poker/simulator test`
- Container/runtime change: `./dev.sh stack:up` and `./dev.sh stack:verify`
- Manual Opera-on-Linux QA remains a separate owner step after the automated Phase 2 batch is green.

For demo-count evidence capture and offline reset limits, see the [deployment runbook](FIRST_VPS_DEPLOYMENT_RUNBOOK.md#demo-participant-count-investigation). Reset only removes flagged demo teams and eligible canonical seed accounts; unknown legacy accounts remain for investigation.

Legacy demo-account duplicates can be removed with the dry-run-first `cleanup-legacy` API maintenance command; see the [offline cleanup procedure](FIRST_VPS_DEPLOYMENT_RUNBOOK.md#targeted-legacy-demo-account-cleanup). Demo voting activates only canonical seed accounts assigned to the team.

## Hosted-trial collaboration and limits

The [hosted demo](https://app.opavotingtool.eu) defaults to two workspaces per person; each workspace allows two teams, ten people and 80 revealed rounds per UTC calendar month, shared across its teams. Re-vote reveals count again. At the cap, new rounds/votes/reveals are blocked; history remains readable. Ordinary self-hosted workspaces have no demo quotas.

### Joining another hosted-demo workspace

Ask a team admin in that workspace to add your complete email. An existing account retains its login; a new trial account needs email onboarding. See the [complete join/leave/rename instructions](TEAM_ADMIN_GUIDE.md#hosted-trial-collaboration-and-limits). Leaving a team does not free a workspace slot. Owner account deletion purges owned workspaces; review its preview.

Team cards show workspace identity, role and usage; Account → Workspaces shows joined teams and reset dates. Owners rename there; long board/directory labels can expand. Names are not unique IDs and renaming changes neither access nor usage. This workspace-management UI is specific to hosted-trial mode.

Use `./deploy.sh config:edit` to change `[public_trial].max_revealed_rounds_per_workspace_per_month` or `[app].base_url`; [restart and verify](FIRST_VPS_DEPLOYMENT_RUNBOOK.md#updating-hosted-trial-collaboration-policy). Enabled trial deployments upgrade the legacy 40-round allowance to 80 without resetting usage. Other custom quotas and disabled-trial configurations are preserved.

## Hosted demo versus self-hosting

The public hosted demo is one deployment of the complete FOSS application. Its
trial quotas and service policies are not licence restrictions or mandatory
settings for company installations. Self-hosters control their own data, users,
branding, integrations, backups and deployment policies, and may modify the source
under AGPL-3.0-or-later. The same voting features remain available without a paid
upgrade; practical capacity depends on the server and workload.

For a new ordinary self-hosted installation, leave hosted-trial mode disabled:

```toml
[public_trial]
enabled = false
mode = "disabled"
```

The hosted demo's two-workspace, two-team, ten-user and 80-monthly-reveal allowances
do not apply to ordinary self-hosted workspaces. Disabling trial mode is not a
migration of existing trial workspaces: stored trial workspaces can retain their
trial rules. Start with an ordinary self-hosted deployment or plan a migration.

App-managed backups are optional and disabled by default. Weekly snapshots,
three-copy retention and 21-day expiry are the demo's chosen defaults, not a
requirement to run the app. Operators may select another backup approach or change
the configurable schedule/age; changing the built-in three-copy cap requires code.
The demo operator's identity/contact and public-trial notice are not the company's
own privacy policy. Each self-hoster supplies policies appropriate to its service.
Normal authentication/team permissions, AGPL obligations and applicable law still
apply; configuration freedom is not a promise of unlimited hardware capacity.

## Weekly app-managed backups and trial privacy

Backups are optional. Set `[backups] enabled = true`, `interval_hours = 168`, `max_age_days = 21` in ignored deployment config (as TOML key/value lines under one table), then restart. Database snapshots keep at most three completed copies and expire after 21 days while enabled/running; startup catches overdue work. There is no external scheduler. They exclude config/branding and remain on the same disk.

`./deploy.sh backup` separately archives the live database plus config/branding, excludes snapshot history and prunes to three archives after successful creation. Archive age is operator-managed. Neither backup policy expires the live database or statistics.

See [configuration and verification](PRIVACY_AND_BACKUPS.md#configuration-weekly-backups-three-copies-three-weeks), [restore procedures](PRIVACY_AND_BACKUPS.md#restore-an-automatic-snapshot) and deletion/retention boundaries. Set actual `[privacy]` operator/contact/provider details before hosted signup. Do not promise that no personal data is stored.

## Usage Statistics

See the [statistics guide](STATISTICS_GUIDE.md) for separate team-admin, workspace-owner and platform instructions and a complete count glossary. Hosted-workspace owners open **Account → Workspaces → Workspace stats**; collaborators do not have this access.

- **Team Admin → People / Stats / Import/export:** Stats is available to that team's admins, including for archived teams. Ordinary members do not gain analytics access.
- **Platform → Stats:** super-admins see installation totals and team/workspace breakdowns; select a workspace to narrow the totals. The former “Platform settings” menu is now **Platform**; configuration tabs remain available.
- Select **Last 24 hours**, **Last 7 days** or **Last 30 days**. These are rolling windows, not the hosted trial's UTC calendar-month quota. Active-person cards always show all three windows. Tables, other cards, trend and JSON export use the selected period.
- Activity means opening a board or a successful team action such as voting or managing membership. Heartbeats, idle sockets and reading Stats do not create activity. Each human counts once within the selected scope/window, across tabs/teams. “Online” includes authenticated chooser connections; “On boards” includes only board connections. Team-scoped online counts refer to current team members online in the app, not necessarily on that board.
- Completed rounds count each reveal, including re-votes. Distinct issue records use the saved history identifier; re-votes share that identifier and identical titles alone never merge issues. Old history/imported results are not backfilled; a new re-vote of an old issue is counted from this version onward. Unfinished and abandoned counters cover rounds started within the selected period.
- Votes include valid non-numeric selections. Participation is the sum of votes by eligible board participants divided by the sum of eligible board participants at reveal, not total team membership. A missing denominator is shown explicitly. Unique-voter counts exclude deleted users; aggregate votes/participation in retained teams persist until statistics expiry.
- Active teams/workspaces have qualifying activity in the period. New registrations are installation-wide surviving real accounts created within both the period and collection coverage. Daily trends use UTC dates; the first and last day may be partial. Coverage starts when the statistics schema is installed, and partial coverage is labelled rather than presented as complete historic totals.
- Marked synthetic accounts/teams, demo teams, deleted accounts and super-admin operational activity are excluded. Classification is assigned by the demo/simulator seeding paths, never guessed from names or email prefixes. Existing dormant synthetic records acquire their marker when their seeder next runs; there is no historical activity backfill. Stats always applies these exclusions. Platform → People and operator usage reports also exclude marked demo/test accounts by default; their diagnostic inclusion options are described in the [statistics guide](STATISTICS_GUIDE.md#people-and-operator-reports).
- Live changes use a read-only subscription, coalesced to about one update per second, with a periodic one-minute refresh. Disconnected clients are expired after a missed 30-second heartbeat (normally within 60 seconds). Stats viewers do not join board presence or voting quorum. The snapshot timestamp identifies the displayed results; **Refresh stats** is available after inactivity or errors.
- **Export stats JSON** downloads exactly the displayed snapshot, period and scope. It contains team/workspace names and aggregates, not individual account lists, issue text or vote values. Anyone receiving that file can read it; downloaded files are not remotely erased.

Statistics are built in and enabled in both deployment modes, with no automatic statistics expiry in either hosted-trial or self-hosted mode. There is no separate statistics TOML switch. The 1/7/30-day reports filter the view without deleting older records. Account deletion removes activity and voter identifiers; retained shared round aggregates follow the deployment retention policy. Workspace purge cascades its statistics. Leaving a team does not rewrite its historical aggregates; membership/live counts reflect current access. Backups follow their own retention rules and restores must reapply privacy deletions. See [privacy and backups](PRIVACY_AND_BACKUPS.md).


Unfiltered **Platform → Stats** also shows permanently retained completed-round and vote counts. These global counters survive workspace deletion without attached identifiers or content; filtered workspace/team reports do not include them. They start with surviving statistics at upgrade and do not reconstruct already deleted/expired usage. Detailed account statistics and shared history follow the separate deletion rules in the privacy notice.

## Edit An Issue Title

See [inline title editing](TEAM_ADMIN_GUIDE.md#edit-an-issue-title) for admin/proposer permissions, Enter/blur save, Escape cancellation and conflicts. Editing does not change votes, timers, quota or round totals; it does not rename the source Jira issue.

## Responsive UI checks

Run `./dev.sh test:e2e:responsive` after UI changes. This separate local suite covers phone/tablet/desktop layouts and touch gestures using disposable databases. See the [viewport matrix and verification guide](RESPONSIVE_TESTING.md). It is not part of routine backend-only verification.

### Board history controls

- Phone: tap the history grip to show/hide; hold briefly, then drag to resize up to half the screen. Arrow keys also resize.
- Desktop/tablet: click the circular arrow on the history edge to collapse/restore, or drag the divider to resize.
- Phone board controls fit their contents and close with the top-right X. Blue outlines indicate enabled actions; ordinary status chips retain neutral borders.


## Workspace identity on a team

See [workspace labels and long-name expansion](TEAM_ADMIN_GUIDE.md#workspace-identity-on-a-team). Default self-hosted teams omit this label; hosted workspace renaming is in Account → Workspaces.

Local health supervision uses `/health` for API/database readiness and `/health/web` for frontend-build readiness, preserving HTTPS-only browser access. See [proxy configuration recovery](HTTPS_DEPLOYMENT.md#recover-from-invalid-proxy-configuration) if startup fails after editing trusted proxy IPs.
