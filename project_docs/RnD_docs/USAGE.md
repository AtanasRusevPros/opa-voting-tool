<!--
SPDX-FileCopyrightText: 2026 Atanas G. Rusev
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# USAGE

Created: 2026-04-03 10:35 EEST

## Local Development

1. Use Node.js `22.22.2`. The pinned local version is in [`.nvmrc`](../../.nvmrc), so nvm users can run `source "$HOME/.nvm/nvm.sh" && nvm use`.
2. Install dependencies with `./dev.sh deps`.
3. Review [`config/allowed-domains.txt`](../../config/allowed-domains.txt).
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
- `./deploy.sh incidents:ack`
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

Use `./dev.sh version` locally or `./deploy.sh version` on a deployed checkout to print the project version and current Git commit. See [`VERSIONING_AND_RELEASES.md`](VERSIONING_AND_RELEASES.md) for the alpha release policy.

New release/update flow on the VPS:
1. SSH to the server as the deploy user.
2. Run `cd /opt/opa-voting-tool/app`.
3. Run `./deploy.sh update`.
4. Run `./deploy.sh public-health`.
5. Open the HTTPS app and do a short login/team/vote/reveal smoke test.
6. If anything looks wrong, run `./deploy.sh diagnose` before editing Caddy or firewall settings.

Migration note for replacing or moving an existing deployment checkout:
- take a backup before changing the checkout
- preserve ignored deployment-local files such as `config/deployment.local.toml`, `config/deploy.local.toml`, `config/allowed-domains.txt`, and `config/managed-branding`
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
- It keeps the newest `20` backups by default; set `BACKUP_PRUNE_KEEP=10` or another positive number to change the retention count.
- Set `BACKUP_PRUNE_DRY_RUN=1 ./deploy.sh backup:prune` to preview which archives would be deleted.

Operator reporting:
- `./deploy.sh usage` prints a human-readable summary of users, workspaces, teams, active sessions, current-month reveals/votes, and database size.
- `./deploy.sh usage:json`, `./deploy.sh users:export`, and `./deploy.sh workspaces:export` print machine-readable JSON for operator review; exports intentionally avoid passwords, tokens, sessions, SMTP secrets, Jira secrets, and deployment secrets.

Keep-alive operator checks:
- `./deploy.sh health` now prints the local API/web result plus startup backend, watchdog state, and latest retained incident summary
- `./deploy.sh public-health` prints the same keep-alive summary while checking the public HTTPS `/health` path through Caddy
- `./deploy.sh startup:status` shows whether automatic startup is installed and which backend is active
- `./deploy.sh watchdog:status` shows the configured cadence and the last watchdog run summary
- `./deploy.sh incidents` shows the retained incident summary, failure counters, and current/previous bounded runtime logs
- `./deploy.sh incidents:ack` acknowledges the current retained incident marker without deleting the stored evidence

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
- When SMTP/debug-code delivery is not available, the unified login screen shows `Request access` instead of a non-working email-code path.
- If SMTP or debug-code delivery is available, `Forgot password` sends the user into the code-based password reset flow.
- If SMTP is not configured for that deployment, `Forgot password` tells the user to contact a team admin or the super-admin for a manually generated replacement password.
- In development without SMTP configured, the API logs login codes to stdout.
- The API returns `debugCode` only when `DEBUG_TOOLS_ENABLED=1`.
- Session expiry defaults to 90 days since last activity.
- Override the TTL with `SESSION_TTL_DAYS`.
- After sign-in, the app returns directly to the last opened team when possible.
- Super-admins are always members of every team, but by default they stay on the chooser/platform-settings surface unless they explicitly open a team.
- Signed-in users can now change their password from the `Account settings` modal available from both the chooser and the board header profile area.
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
1. super-admins can open `Platform settings` in the app to edit the tabbed platform surface:
   `People`, `Branding`, `App settings`, `SMTP`, and `Super-admin`
2. the `People` tab owns pending platform access requests, admitted platform users, and super-admin-only existing-user password reset
3. the `Super-admin` tab owns admin credentials plus Jira Cloud client credentials, site connection, and disconnect/site-selection actions
4. branding uploads from that UI are written into `config/managed-branding`
5. the repo ships both a tracked safe template `config/deployment.toml` and an example `config/deployment.sample.toml`
6. local packaged-stack and deployed runs use ignored `config/deployment.local.toml` when present, otherwise the tracked template
7. the tracked templates intentionally leave SMTP blank so manual-share onboarding/reset can be tested without SMTP setup
8. the tracked templates intentionally leave super-admin username/password blank for safety
9. create `config/deployment.local.toml` with `./deploy.sh config:migrate` or by copying `config/deployment.sample.toml`, then set `[admin].username` and `[admin].password` before starting the app
10. if credentials are missing, `./dev.sh stack:up`, `./deploy.sh up`, `./deploy.sh rebuild`, `./deploy.sh restart`, and `./deploy.sh update` stop with a clear setup message
11. the public branding files remain the fallback defaults when no managed override is configured
12. if you want to regenerate the shipped 200-avatar animal set, run `node scripts/generate-animal-avatars.mjs`
13. if SMTP is not configured, team-admin add/invite still works for new allowlisted users by revealing a one-time generated password for manual sharing
14. if SMTP is not configured, existing-user password reset is done from the super-admin `Platform settings -> People` tab for platform-wide recovery, or from a team's `Team admin -> People` tab when the requester is already a member of that team; team-admin reset is disabled while the target user is currently live on that team's board, and replacement credentials appear inline under the selected member row
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
- The current UI has packaged e2e coverage for a compact `640x480` viewport; it is usable on small screens, but phone-specific layout polish is still a follow-up hardening area rather than a fully completed responsive milestone.

## Import And Export Notes

- Super-admins can open `Platform settings -> Super-admin` to export the full SQLite database as a snapshot and import a previously exported snapshot back into the app.
- Whole-database import is a maintenance operation: it replaces the current live database contents with the imported snapshot.
- Team-admins and super-admins can open the team `People` modal to export that team's revealed-history package as JSON.
- Team-history export includes comments by default, and comments can be excluded explicitly before export.
- Team-history packages can be imported either into the current team or as a brand-new team from the chooser's `Import a team` action.
- Reimporting the same team-history package into the same team skips duplicates instead of silently duplicating old rounds.

## Jira Cloud Notes

- This app supports Jira Cloud only in the current integration pass.
- Super-admins configure the global Jira Cloud connection from `Platform settings -> Super-admin`.
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
