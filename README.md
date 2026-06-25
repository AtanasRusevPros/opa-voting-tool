<!--
SPDX-FileCopyrightText: 2026 Atanas G. Rusev
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# OpaVoting - Open Source Realtime Voting Tool And Scrum Planning Poker App

The Ultimate Open Source Voting Tool, including Scrum planning poker.

OpaVoting is an alpha-stage, open-source multi-team realtime voting platform for teams that need fast, self-hosted collaborative voting. It works today as a Scrum planning poker app for agile estimation, and its long-term direction is broader team voting, polling, review, and decision workflows.

If you are looking for an open-source voting tool, a self-hosted voting platform, an agile estimation tool, or a Scrum planning poker alternative that can grow beyond estimation, this is the project.

Highlights:
- low-latency realtime voting with simulated-session benchmark evidence up to 400 concurrent users
- Podman-first self-hosting with a dedicated `deploy.sh` operator workflow
- visible teams and multi-team membership instead of a one-room toy app
- admin-friendly setup, team membership management, and manual/no-SMTP onboarding support
- AGPLv3-or-later, DCO-based contributions, and an OSS-first posture where self-hosted software remains real and useful

The current application includes:
- hybrid sign-in with email code for first access/reset and email + password for returning users
- visible teams and multi-team membership
- one live planning board per team
- configurable numbering systems per team
- Scrum planning poker / agile estimation flow with issue titles, voting cards, reveal, average, and voter history
- realtime collaborative voting for distributed teams, remote teams, and facilitated workshops
- persistent issue history with grouped timestamps, paginated loading, and a dedicated history search tab
- replaceable branding assets and avatar icons
- 200 shipped stylized animal avatar icons for team-visible profiles
- single-container Linux deployment target with Podman-first local/runtime workflow

Important public-release notes:
- Status: alpha / self-hosted preview.
- Current version: `0.1.0`; check a checkout with `./dev.sh version` or `./deploy.sh version`.
- Generic public deployment examples use `vote.example.com`.
- The maintainer test deployment is not a public demo yet.
- SMTP-backed account delivery has been smoke-tested on the alpha VPS through a real transactional mail provider.
- Do not report security vulnerabilities in public issues; see [`SECURITY.md`](SECURITY.md).

## Quick Start

1. Use Node.js `22.22.2`. The pinned local version lives in [`.nvmrc`](.nvmrc), so nvm users can run:
   `source "$HOME/.nvm/nvm.sh" && nvm use`
2. Install dependencies:
   `./dev.sh deps`
3. Review the allowed login domains before deployment:
   [`config/allowed-domains.txt`](config/allowed-domains.txt)
4. Start the frontend and API in development:
   - web: `pnpm --filter @planning-poker/web dev`
   - api: `pnpm --filter @planning-poker/api dev`
5. Open `http://localhost:3000` for the Vite frontend, or `http://localhost:3001` for the API-served build once the web app has been built.

## Self-Hosted Deployment

Clone the public repository on a server:

```bash
git clone https://github.com/AtanasRusevPros/opa-voting-tool.git app
cd app
```

For a deployed server, the recommended operator command is:

```bash
./deploy.sh up
```

The underlying manual Compose equivalent is:

```bash
podman compose -f infra/containers/compose.yaml up -d
```

Use `./deploy.sh update` for new releases on an existing deployment.

The first tested deployment path is Ubuntu Server 24.04 LTS with Podman and Caddy. Other common Linux server distributions should be adaptable, but may need package-manager, firewall, service-management, or Podman/Compose adjustments.

Internet-facing deployments should be HTTPS-only after initial bring-up/testing. HTTP-only use is for temporary local testing or protected internal networks at the operator's own risk.

## Why OpaVoting?

Many planning poker apps stop at a single temporary room. OpaVoting is built as a more serious open-source realtime voting tool:

- Teams can have persistent membership, history, and admin workflows.
- Scrum estimation is useful immediately, but the platform is not limited to Scrum.
- Self-hosting is a first-class goal, not an afterthought.
- Performance and low-latency realtime updates are part of the product identity.
- The AGPLv3-or-later license keeps modified network-deployed versions open.

Common search/use cases this project is intended to serve:

- open-source voting tool
- self-hosted voting app
- realtime collaborative voting platform
- Scrum planning poker
- agile estimation tool
- planning poker for remote teams
- team decision and polling workflows

## Project Docs

- Usage and operator guide: [`project_docs/RnD_docs/USAGE.md`](project_docs/RnD_docs/USAGE.md)
- Architecture: [`project_docs/RnD_docs/ARCHITECTURE.md`](project_docs/RnD_docs/ARCHITECTURE.md)
- First VPS deployment runbook: [`project_docs/RnD_docs/FIRST_VPS_DEPLOYMENT_RUNBOOK.md`](project_docs/RnD_docs/FIRST_VPS_DEPLOYMENT_RUNBOOK.md)
- Super-admin guide: [`project_docs/RnD_docs/SUPER_ADMIN_GUIDE.md`](project_docs/RnD_docs/SUPER_ADMIN_GUIDE.md)
- Team-admin guide: [`project_docs/RnD_docs/TEAM_ADMIN_GUIDE.md`](project_docs/RnD_docs/TEAM_ADMIN_GUIDE.md)
- Public benchmark summary: [`project_docs/RnD_docs/PUBLIC_BENCHMARK_SUMMARY.md`](project_docs/RnD_docs/PUBLIC_BENCHMARK_SUMMARY.md)
- Versioning and releases: [`project_docs/RnD_docs/VERSIONING_AND_RELEASES.md`](project_docs/RnD_docs/VERSIONING_AND_RELEASES.md)
- Search discoverability notes: [`project_docs/RnD_docs/SEARCH_DISCOVERABILITY_NOTES.md`](project_docs/RnD_docs/SEARCH_DISCOVERABILITY_NOTES.md)
- Presentation deck: [`project_docs/RnD_docs/OPA_VOTING_TOOL_PRESENTATION.html`](project_docs/RnD_docs/OPA_VOTING_TOOL_PRESENTATION.html)
- Changelog: [`CHANGELOG.md`](CHANGELOG.md)
- Roadmap: [`ROADMAP.md`](ROADMAP.md)
- Contributing: [`CONTRIBUTING.md`](CONTRIBUTING.md)
- Security: [`SECURITY.md`](SECURITY.md)
- Branding/name usage: [`BRANDING.md`](BRANDING.md)

## License

This project is licensed under the GNU Affero General Public License v3.0 or later (`AGPL-3.0-or-later`). See [`LICENSE`](LICENSE).

The project name, logo, visual identity, screenshots, and official branding are governed by the lightweight brand usage note in [`BRANDING.md`](BRANDING.md).

## Local Node Runtime

Local dependency, build, packaged stack build, test, and simulator commands require Node.js `22.22.2` from [`.nvmrc`](.nvmrc) on both Linux and macOS. The project uses Node's built-in SQLite runtime, so older Node versions are not supported. The workspace packages declare this as `node >=22 <23`.

`./dev.sh` sources nvm when it is available and runs `nvm use` before dependency, build, `stack:up`, test, and simulator commands so the `.nvmrc` version is applied automatically. If nvm is unavailable, the command still verifies that the active local `node` is Node 22 before continuing. `./dev.sh stack:down` and `./dev.sh stack:verify` remain Podman/curl-only helpers.

## Authentication

- First access or password reset: request a 16-digit code, verify it, then set a real password.
- Returning sign-in: enter email and password.
- Signed-in users can change their password from the in-app `Account settings` modal.
- Any normal user can delete their own account from `Account settings`; the confirmation preview explains the deletion impact before commit.
- The super-admin can delete normal accounts from `Platform settings -> People`, but the configured super-admin account can never be deleted.
- Signed-in users can also personalize the history date popup from `Account settings`: the popup starts from the current team's default timezone list, but each user can save a different list for that team or return that team back to its default later.
- The login screen now includes `Forgot password`; when SMTP/debug-code delivery is unavailable, it explicitly directs the user to a team admin or the super-admin for manual reset.
- Team-admins can regenerate or replace manually shared credentials when SMTP is not configured.
- Browser password save/fill is supported through the real email/password sign-in form.
- Session persistence still defaults to 3 months of activity.

## Container Workflow

The repository is Podman-first for local stack commands because rootless operation is preferred.

- start the packaged stack: `./dev.sh stack:up`
- stop it: `./dev.sh stack:down`
- smoke-check it: `./dev.sh stack:verify`

`./dev.sh` prefers `podman compose` and falls back to `podman-compose` if needed.
On macOS, packaged stack/e2e commands also check the Podman machine first: if the VM/socket is stale they start or restart the machine, and if no machine exists they initialize and start the default one. Linux Podman remains native and is left unchanged.
On restricted local Linux environments where rootless Podman cannot create a `netavark` bridge, packaged stack/e2e commands start with the normal bridge mode and then retry with host networking. You can force this with `PACKAGED_STACK_NETWORK_MODE=host`; the deployed VPS compose file and its host-local port binding remain unchanged.
`./dev.sh stack:up` now takes the stricter freshness path on every run: it first tears down any existing compose-managed stack for this project without deleting the named data volume, then rebuilds the image with `--no-cache`, and finally starts the stack with `--force-recreate` so stale containers and stale image layers are not reused.
The packaged compose service publishes the app on host-local `127.0.0.1:3001` and uses a container restart policy so local checks and host-level reverse proxies can reach it without exposing the app port to the wider network.

For a deployed VPS, use [`deploy.sh`](deploy.sh) instead of typing long compose/Caddy commands. It provides short operator commands such as `./deploy.sh rebuild`, `./deploy.sh health`, `./deploy.sh public-health`, `./deploy.sh startup:status`, `./deploy.sh startup:enable`, `./deploy.sh startup:disable`, `./deploy.sh watchdog:status`, `./deploy.sh watchdog:run`, `./deploy.sh incidents`, `./deploy.sh diagnose`, `./deploy.sh backup`, `./deploy.sh backup:list`, `./deploy.sh backup:prune`, `./deploy.sh restore <file>`, `./deploy.sh usage`, `./deploy.sh usage:json`, `./deploy.sh users:export`, `./deploy.sh workspaces:export`, and `./deploy.sh update`.

## Deployment Edits Before First Use

The first live VPS bootstrap checklist currently lives in:
- [`project_docs/RnD_docs/FIRST_VPS_DEPLOYMENT_RUNBOOK.md`](project_docs/RnD_docs/FIRST_VPS_DEPLOYMENT_RUNBOOK.md)

That path is first tested on Ubuntu Server 24.04 LTS. The deployment architecture is not Ubuntu-specific, but other common Linux server distributions may need package-manager, firewall, service, or Podman/Compose adjustments.

For a real public-facing deployment, the app should be reached through HTTPS only. Plain HTTP may remain open at the reverse proxy for certificate automation and redirect, but app content should not be served over plain HTTP, and the internal app port should not be exposed publicly.
If the public HTTPS endpoint returns `502`, check local app health and container status before changing Caddy: `curl -fsS http://127.0.0.1:3001/health`, `podman ps -a`, `podman logs`, and Caddy journal output usually show whether the reverse proxy is healthy but the upstream app has exited.

New release/update on the VPS:
- SSH to the server as the deploy user
- `cd /opt/opa-voting-tool/app`
- run `./deploy.sh update`
- run `./deploy.sh public-health`
- do a short login/team/vote/reveal browser smoke test

When migrating or replacing an existing deployment checkout, make a backup first and preserve ignored deployment-local files such as `config/deployment.local.toml`, `config/deploy.local.toml`, `config/allowed-domains.txt`, and any `config/managed-branding` uploads.

### Allowed Domains

Edit [`config/allowed-domains.txt`](config/allowed-domains.txt).

Rules:
- one domain per line
- no commas
- lines starting with `#` are comments
- blank lines are ignored

Example:

```text
example-company.com
test1.com
```

### Runtime Branding And Deployment Config

Runtime configuration priority:
- ignored local override: `config/deployment.local.toml`
- tracked local-development default: [`config/deployment.toml`](config/deployment.toml)

Deploy/operator keep-alive supervision priority:
- ignored local override: `config/deploy.local.toml`
- tracked default: [`config/deploy.toml`](config/deploy.toml)

The repo-shipped sample/template file is:
- [`config/deployment.sample.toml`](config/deployment.sample.toml)

Managed branding uploads are stored in:
- [`config/managed-branding`](config/managed-branding)

Local default behavior:
- the repo ships `config/deployment.toml` as a safe template, but it does not include usable super-admin credentials
- before starting the packaged stack or a real deployment, create ignored `config/deployment.local.toml` with `./deploy.sh config:migrate` or by copying `config/deployment.sample.toml`
- set `[admin].username` and `[admin].password` in `config/deployment.local.toml`; startup fails with a clear message until those values are configured
- `[history_popup].timezone_keys` defines the global Issues List date-popup timezone rows used when new teams are created; team-admin changes override that team default later
- the shipped default is intentionally `no SMTP`, so you can test the manual-share onboarding and reset flows without extra setup

Super-admins can edit the deployment configuration from the in-app `Platform settings` modal, including:
- admin username/display name/password
- SMTP host, port, user, password, and from-address
- Jira Cloud client id/client secret plus the connected site binding
- global footer text, opacity, and palette values
- the four managed branding slots:
  - login logo
  - login background
  - team logo
  - team background
- the global demo-mode toggle

The default public branding files still ship as fallback assets in:
- [`apps/web/public/branding`](apps/web/public/branding)

Fallback filenames:
- [`apps/web/public/branding/login-logo.svg`](apps/web/public/branding/login-logo.svg)
- [`apps/web/public/branding/login-background.svg`](apps/web/public/branding/login-background.svg)
- [`apps/web/public/branding/team-logo.svg`](apps/web/public/branding/team-logo.svg)
- [`apps/web/public/branding/team-background.svg`](apps/web/public/branding/team-background.svg)

Avatar icons still live in:
- [`apps/web/public/branding/avatars`](apps/web/public/branding/avatars)

The shipped avatar set contains 200 stylized animal SVGs. Existing users keep their chosen avatar by key, and you can refresh the generated set with:
- `node scripts/generate-animal-avatars.mjs`

Production email still requires real SMTP host/port/from/credentials from the target environment. SMTP-backed account delivery has been smoke-tested on the alpha VPS through a real transactional mail provider; until SMTP is configured, development/test continues to use the local logging fallback for code delivery, and team-admin onboarding/reset falls back to manually shared one-time generated passwords.

Local automated SMTP-capable verification is covered without a real mail server by mocked transport tests. For manual local mail validation, point the app at Mailpit or MailHog before doing a safe invite/reset smoke send.

Operator convenience:
- keep `config/deployment.sample.toml` as the untouched example template
- keep `config/deployment.toml` as the tracked local-development default
- use ignored `config/deployment.local.toml` for real deployment values so `git pull` / `./deploy.sh update` does not overwrite or conflict with server-specific settings
- keep `config/deploy.toml` as the tracked default keep-alive policy
- use ignored `config/deploy.local.toml` only when you need a non-default startup/watchdog backend, interval, or incident path
- the deployment config files include a `[jira]` block so Jira Cloud setup is visible and easy to fill in later

Keep-alive defaults:
- on the first real deployed `./deploy.sh up`, `./deploy.sh rebuild`, `./deploy.sh restart`, `./deploy.sh restore`, or `./deploy.sh update`, the helper tries to install automatic startup plus watchdog automatically
- it prefers a user-level `systemd` backend when available and falls back to `cron` otherwise
- in the normal case, no extra post-install command is required
- `./deploy.sh startup:disable` turns the keep-alive layer off completely and persists that choice in `config/deploy.local.toml`
- `./deploy.sh startup:enable` turns the default keep-alive layer back on

The super-admin guide lives at:
- [`project_docs/RnD_docs/SUPER_ADMIN_GUIDE.md`](project_docs/RnD_docs/SUPER_ADMIN_GUIDE.md)

### Runtime Debug Tools

Environment setting:
- `DEBUG_TOOLS_ENABLED=1`

Behavior:
- when enabled, development-only debug helpers such as visible `debugCode` responses and reveal-debug browser logging can be used
- when disabled, those debug helpers are fully suppressed
- production should keep this disabled unless you intentionally need temporary diagnostics

Supported asset formats:
- prefer `SVG` for logos, icons, and scalable illustrations
- `PNG` is also supported for raster replacements
- `PNG` is not vector, so use `SVG` whenever you want infinite clean scaling

If you use `PNG`, keep the same filename stem and update the source code reference only if you intentionally want the app to point to a different extension.

## Verification

Use `./dev.sh help` for the short command list. Node-dependent commands and `stack:up` run `nvm use` when available and require Node.js `22.22.2` from [`.nvmrc`](.nvmrc).

Board links:
- every team board now exposes an icon-only share action that copies the current board permalink, using the browser Clipboard API when available and a capability-based fallback otherwise
- the generated permalink preserves the requested team through sign-in and approval flows

Teams:
- team names are unique case-insensitively after trimming whitespace, including archived teams
- repeated issue titles are allowed; history identity is based on stable ids, team/round context, timestamps, and import metadata rather than title text

History and portability:
- each team board now loads the latest `20` revealed issues first and can progressively load older history
- the history rail includes a `Search` tab that filters by date range, title text, comment text, and voter/commenter identity
- history voters are collapsed by default and can be expanded per issue while staying on the same board
- minimum-participation reveal attempts use the people currently live on the board as the denominator; attempts that do not meet the configured threshold keep the round active and do not write a history entry, and the server reveals automatically if later votes, reconnects/leaves, or a lowered threshold satisfy the rule
- the history date popup uses the global deployment default for newly created teams, then any team-admin timezone default for that team, and finally a per-team personal list saved in `Account settings`; personal lists do not leak across teams and can be reset back to the current team default
- imported team-history comments preserve a signed `Name (email)` snapshot and stay immutable after import
- super-admins can export/import the whole SQLite database from `Platform settings -> Super-admin`
- team-admins and super-admins can export/import team history packages in JSON, with comments included by default
- team-admin password reset is available for other current-team members, including peer team-admins, but the reset button is disabled while that member is currently live on the board; generated replacement credentials appear inline under the selected member row

Jira Cloud:
- super-admins can connect one global Jira Cloud integration from `Platform settings -> Super-admin`
- team-admins and super-admins can save `Project key + optional JQL` in the team `Team admin -> Import/export` tab
- importing Jira issues creates or refreshes a pending estimation queue
- queue items show both the Jira key and the Jira title
- loading a Jira issue into the board keeps it pending until the round is fully revealed
- the implementation follows Atlassian's official Jira Cloud OAuth 2.0 3LO and issue-search documentation:
  - OAuth 3LO auth code flow: https://developer.atlassian.com/cloud/oauth/getting-started/implementing-oauth-3lo/
  - Enabling/managing 3LO apps: https://developer.atlassian.com/cloud/oauth/getting-started/enabling-oauth-3lo/
  - Jira Cloud 3LO overview and security expectations: https://developer.atlassian.com/cloud/jira/platform/three-legged-oauth/
  - Jira issue search REST APIs: https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/
- Atlassian does not publish a ready-made automated test checklist for this exact product integration shape, so the repo verification suite covers the documented OAuth, site-selection, import, queue, and round-loading behaviors directly

## Command Reference

- `./dev.sh deps` checks the local Node runtime and installs workspace dependencies
- `./dev.sh build` builds all workspace packages
- `./dev.sh lint` runs the repo's non-mutating lint/type checks
- `./dev.sh typecheck` runs TypeScript checks for the whole workspace
- `./dev.sh test:scripts` runs shell helper command contract checks for `dev.sh` and `deploy.sh`
- `./dev.sh test:unit` runs backend unit tests
- `./dev.sh test:int` runs backend integration tests
- `./dev.sh test:web` runs frontend/web tests
- `./dev.sh test:web:perf` runs frontend perf-focused component/render-boundary tests
- `./dev.sh test:e2e` runs the packaged browser e2e flow
- `./dev.sh test:e2e:perf` runs simulator-backed frontend perf checks
- `./dev.sh test:e2e:sim` runs the heavier simulator-backed board layout e2e flow
- `./dev.sh test:e2e:perf`, `./dev.sh test:e2e:sim`, and `./dev.sh test:e2e:sim:matrix21` must be run serially, not in parallel, because they share the same packaged stack, simulator seed state, and container/runtime resources
- `./dev.sh test:full` runs the main verification suite; the targeted simulator e2e flow stays separate
- `./dev.sh stack:up` applies `.nvmrc` with `nvm use` when available, refreshes the macOS Podman machine when needed, tears down any existing compose-managed stack for this project, rebuilds the packaged image with `--no-cache`, and then starts the packaged Podman stack in the foreground with `--force-recreate`
- `./dev.sh stack:down` stops the packaged Podman stack
- `./dev.sh stack:verify` checks packaged stack health on `localhost:3001`
- `./deploy.sh help` shows the deployed VPS operator command list
- `./deploy.sh rebuild` builds the deployed image with `--no-cache`, recreates the service, and waits for local health
- `./deploy.sh update` backs up the current deployment, pulls the latest Git commit with `--ff-only`, rebuilds, recreates, and waits for local health
- `./deploy.sh config:migrate` creates ignored `config/deployment.local.toml` from the tracked config so live deployment settings survive future pulls
- `./deploy.sh health` prints local API/web health plus startup/watchdog/incident summary
- `./deploy.sh public-health` checks the public HTTPS health endpoint through Caddy and prints the same keep-alive summary
- `./deploy.sh startup:status` shows the selected/effective autostart backend, install state, and watchdog state
- `./deploy.sh startup:enable` enables default keep-alive with `systemd` or `cron`
- `./deploy.sh startup:disable` disables autostart plus the scheduled watchdog and persists that non-default choice
- `./deploy.sh watchdog:status` shows the watchdog cadence and last run summary
- `./deploy.sh watchdog:run` runs one watchdog cycle immediately
- `./deploy.sh incidents` prints the retained incident summary, counters, and log paths
- `./deploy.sh incidents:ack` clears the current unacknowledged incident marker without deleting the retained evidence
- `./deploy.sh diagnose` prints local/public health, keep-alive state, incident summary, compose status, app logs, Caddy status/logs, disk, and firewall details
- `./deploy.sh caddy:reload` validates and reloads the Caddyfile
- `./deploy.sh backup` creates a timestamped archive of app data plus deployment config and branding files
- `./deploy.sh backup:list` lists recent backup archives
- `./deploy.sh backup:prune` deletes older backup archives beyond `BACKUP_PRUNE_KEEP`, which defaults to `20`; set `BACKUP_PRUNE_DRY_RUN=1` to preview first
- `./deploy.sh restore <file>` stops the app, restores app data plus deployment config/branding from a backup archive, restarts, and waits for local health
- `./dev.sh sim:seed` seeds the deterministic simulator users and demo teams
- `./dev.sh sim:up` starts the live bot simulator as a long-running helper
- `./dev.sh sim:down` stops all live simulator processes
- `./dev.sh sim:status` shows whether the simulator is running

## Live Bot Simulator

The repo now includes a dev-only live bot simulator in `apps/simulator`.

Default behavior:
- seeds 950 deterministic simulator users
- creates 12 live demo teams with sizes `10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 150, 400`
- keeps bots connected through the real API and WebSocket contracts
- bots vote on active rounds with 80% probability and never reveal
- the packaged local `./dev.sh stack:up` flow opts the stack into simulator mode automatically for developer convenience, while the underlying compose/deployment defaults keep the simulator API disabled unless you intentionally enable it

Commands:
- `./dev.sh sim:seed`
- `./dev.sh sim:up`
- `./dev.sh sim:down`
- `./dev.sh sim:status`

## Simulator Workflow

1. Start the packaged stack with `./dev.sh stack:up`.
2. In another terminal, verify health with `./dev.sh stack:verify`.
3. Seed demo users and teams with `./dev.sh sim:seed`.
4. Start the live bots with `./dev.sh sim:up`.
5. Open `http://localhost:3001`, sign in as a normal human user, and join one of the `Sim Team ...` teams.
6. Check simulator state with `./dev.sh sim:status`.
7. Stop the simulator later with `./dev.sh sim:down`.
8. Run `./dev.sh test:e2e:sim` for the heavier seeded-room geometry sweep.
9. Run `./dev.sh test:e2e:sim:matrix21` for the strict calibrated 21-person viewport matrix.
10. Run `./dev.sh phase:p2:verify` for the full Phase 2 automated correctness/regression batch.
11. Run `./dev.sh phase:p3:verify` for the machine-heavy capacity/stress validation batch and inspect the generated latest report under `project_docs/RnD_docs/perf_runs/`.

Important:
- run `./dev.sh test:e2e:perf`, `./dev.sh test:e2e:sim`, and `./dev.sh test:e2e:sim:matrix21` one after another, never in parallel
- the simulator-backed commands share the same stack, seeded teams, and live simulator process space, so parallel runs can create false failures from container collisions, connection refusals, and contaminated geometry/perf results

Runtime settings:
- `SIMULATOR_MODE_ENABLED`
- `SIMULATOR_SHARED_SECRET`
- `SIMULATOR_BASE_URL`
- `SIMULATOR_VOTE_PROBABILITY`
- `SIMULATOR_RANDOM_SEED`

Production note:
- simulator mode must remain disabled in production
- the shipped compose/deployment defaults now keep `SIMULATOR_MODE_ENABLED=0`
- this does not disable the separate super-admin demo mode used for in-app large-room validation

### Operational Notes

- `./dev.sh stack:up` runs in the foreground.
- Use a second terminal for normal manual testing while the packaged stack is running.
- `./dev.sh phase:p2:verify` is the one-shot machine-heavy validation command for the current Phase 2 automation scope.
- `./dev.sh phase:p3:verify` is the one-shot machine-heavy validation command for the current Phase 3 capacity/stress scope.
- The simulator-backed commands `./dev.sh test:e2e:perf`, `./dev.sh test:e2e:sim`, and `./dev.sh test:e2e:sim:matrix21` must be run separately, not in parallel, because they share the same packaged stack and simulator-backed state.
- Simulator logs are written to [`.simulator/simulator.log`](.simulator/simulator.log).
- `./dev.sh sim:up` uses `setsid` when available and falls back to `nohup` on macOS-style environments where `setsid` is not installed.
- The latest Phase 3 capacity report is written to [`project_docs/RnD_docs/perf_runs/PHASE3_CAPACITY_VALIDATION_LATEST.md`](project_docs/RnD_docs/perf_runs/PHASE3_CAPACITY_VALIDATION_LATEST.md), with the public headline summarized in [`project_docs/RnD_docs/PUBLIC_BENCHMARK_SUMMARY.md`](project_docs/RnD_docs/PUBLIC_BENCHMARK_SUMMARY.md).
- The simulator is dev-only and should not be enabled in production.
- For deeper operator notes and troubleshooting, see [USAGE.md](project_docs/RnD_docs/USAGE.md).
