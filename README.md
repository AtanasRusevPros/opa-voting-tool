<!--
SPDX-FileCopyrightText: 2026 Atanas G. Rusev
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# OpaVoting — Open Source Realtime Voting And Planning Poker

**[Try the free live demo → app.opavotingtool.eu](https://app.opavotingtool.eu)** — sign up and start voting. No installation needed.

OpaVoting is a lightweight, self-hosted tool for team voting and Scrum estimation, created by **Atanas G. Rusev**. It combines realtime voting, persistent team history and administration in a single Linux container. Free and open source under AGPL-3.0-or-later; currently **v1.0.0**.

[Features](#features) · [Self-host](#self-hosted-deployment) · [Deploy with AI](#deploy-with-your-ai-assistant) · [Demo limits](#hosted-trial-collaboration-and-limits) · [Develop](#quick-start) · [Documentation](#project-docs) · [Contribute](#contributing) · [License](#license)

<a id="why-opavoting"></a>
## Features

- One live board per team, configurable voting decks, reveal/average and participation thresholds.
- Persistent history, search, comments, JSON import/export and inline title corrections.
- Team membership, admin permissions, optional SMTP and manual onboarding without email infrastructure.
- Jira Cloud import into a team's pending estimation queue.
- Team, hosted-workspace and platform statistics with live counts and JSON export.
- Phone portrait/landscape controls, collapsible history, keyboard navigation and customizable branding.
- Podman deployment, startup/watchdog supervision, backups and restore.

Built for efficient realtime workloads, with [recorded load tests up to 400 concurrent simulated users](project_docs/RnD_docs/PUBLIC_BENCHMARK_SUMMARY.md). Capacity depends on hardware and workload; benchmarks are not a production SLA.

## Self-Hosted Deployment

The first tested server path is **Ubuntu Server 24.04 LTS, rootless Podman and Caddy**. Install the prerequisites using the [deployment guide](AI_DEPLOYMENT.md), then:

```bash
git clone https://github.com/AtanasRusevPros/opa-voting-tool.git app
cd app
./deploy.sh config:migrate
./deploy.sh config:edit
# Set [admin].username/password and [app].base_url before starting.
# Review config/allowed-domains.txt for your company.
./deploy.sh up
./deploy.sh health
```

The app starts at `http://localhost:3001`; administrator sign-in is `/admin`. Company LAN/public hosting requires HTTPS and an explicitly trusted TLS proxy; see [HTTPS setup and upgrade requirements](project_docs/RnD_docs/HTTPS_DEPLOYMENT.md). It also requires DNS/network/proxy configuration: changing the base URL alone does not expose the loopback-bound port. Use HTTPS for public service. Follow [AI deployment](AI_DEPLOYMENT.md) or the [step-by-step VPS runbook](project_docs/RnD_docs/FIRST_VPS_DEPLOYMENT_RUNBOOK.md).

**SMTP is optional.** Without it, admins provision allowlisted users and securely share generated passwords. Fresh company installations leave hosted-trial mode disabled and have no demo quotas. Authentication, team permissions and hardware limits still apply.

Use `./deploy.sh update` for new source versions, `./deploy.sh rebuild` to rebuild current sources and `./deploy.sh backup` before maintenance. Unchanged-source updates report **Already up to date**. Restore replaces data/config; rehearse on disposable data. See the [operator workflow](project_docs/RnD_docs/USAGE.md#deployed-vps-operator-workflow).

## Deploy With Your AI Assistant

**[AI-assisted deployment instructions](AI_DEPLOYMENT.md)** support localhost, company LAN and public-server setup with an agent that has terminal access. Copy this prompt:

> Clone https://github.com/AtanasRusevPros/opa-voting-tool and follow AI_DEPLOYMENT.md to deploy it for internal company use. Inspect my target environment, ask only for missing choices or access, and verify the setup.

The repository includes AGENTS/Claude entry points and a portable deployment skill. Read the [verification scope and limits](project_docs/RnD_docs/AI_DEPLOYMENT_VERIFICATION.md); fresh-host and network checks are separate from the passing local rehearsal.

<a id="hosted-demo-versus-self-hosting"></a>
## Hosted-trial collaboration and limits

The personally funded [hosted demo](https://app.opavotingtool.eu) is for evaluation and limited use. Defaults per workspace are **two teams, ten people and 80 revealed rounds per UTC calendar month**, shared across its teams. Each person can belong to **two trial workspaces**. Re-vote reveals count again; at the limit new rounds/votes/reveals stop, while history stays available.

Existing users can be invited by complete email. Leaving a team does not release a workspace slot; collaborators use **Account → Workspaces → Leave workspace**. Workspace owners can rename their workspace there and review deletion consequences in Account settings. See [workspace instructions](project_docs/RnD_docs/TEAM_ADMIN_GUIDE.md#hosted-trial-collaboration-and-limits).

For ongoing company use, self-host without these demo quotas. Self-hosted default teams omit the extra workspace label. Disabling trial mode does not migrate existing trial workspace records.

<a id="authentication"></a>
<a id="login-and-optional-access-requests"></a>
## Sign-In And Privacy

Normal users sign in at `/`; platform admins use `/admin`. Account settings controls passwords, deletion and whether to reopen the last team. Email recovery requires SMTP; otherwise an admin supplies a replacement password. See [sign-in and account settings](project_docs/RnD_docs/USAGE.md#authentication-notes).

The app stores necessary account/team/history data. Deletion removes access and applicable workspace data; shared-history attribution, backups and downloaded exports have documented exceptions. Statistics do not automatically expire; only identifier-free platform round/vote totals survive workspace purge. Read the [privacy and backup boundaries](project_docs/RnD_docs/PRIVACY_AND_BACKUPS.md). This is not a claim that no personal data is stored.

<a id="local-node-runtime"></a>
## Quick Start

For **development**, use Node.js **22.22.2** from [`.nvmrc`](.nvmrc):

```bash
./dev.sh deps
./deploy.sh config:migrate
./deploy.sh config:edit
# Set local admin credentials; leave SMTP blank for manual onboarding.
```

Review [`config/allowed-domains.txt`](config/allowed-domains.txt), then run in separate terminals with Node 22 active:

```bash
pnpm --filter @planning-poker/api dev
pnpm --filter @planning-poker/web dev
```

Open `http://localhost:3000`. `dev.sh` selects nvm's pinned version when available; direct pnpm commands need the correct active Node runtime. Deployment uses the container's Node runtime instead. See [development, tests and simulator commands](project_docs/RnD_docs/DEVELOPMENT.md).

<a id="verification"></a>
<a id="command-reference"></a>
<a id="container-workflow"></a>
<a id="live-bot-simulator"></a>
<a id="simulator-workflow"></a>
<a id="operational-notes"></a>
<a id="runtime-debug-tools"></a>
## Development And Testing

`./dev.sh test:full` runs the core non-browser checks. Run `./dev.sh test:e2e` for browser flows and the separate `./dev.sh test:e2e:responsive` suite after UI changes. Simulator-backed suites share resources and must run **serially**. Debug/simulator authentication is for disposable development environments, not production. See the [development guide](project_docs/RnD_docs/DEVELOPMENT.md) and [responsive matrix](project_docs/RnD_docs/RESPONSIVE_TESTING.md).

<a id="deployment-edits-before-first-use"></a>
<a id="allowed-domains"></a>
<a id="runtime-branding-and-deployment-config"></a>
<a id="weekly-app-managed-backups-and-trial-privacy"></a>
<a id="usage-statistics"></a>
<a id="responsive-ui-checks"></a>
## Project Docs

**[Documentation index — choose your role or task](project_docs/README.md)**

| You want to… | Read |
| --- | --- |
| Use the app and understand account settings | [Usage](project_docs/RnD_docs/USAGE.md) |
| Manage members, voting, history and Jira queues | [Team Admin Guide](project_docs/RnD_docs/TEAM_ADMIN_GUIDE.md) |
| Configure the platform, accounts, SMTP and branding | [Super-Admin Guide](project_docs/RnD_docs/SUPER_ADMIN_GUIDE.md) |
| Understand every statistics count | [Statistics Guide](project_docs/RnD_docs/STATISTICS_GUIDE.md) |
| Deploy, update or recover a server | [AI Deployment](AI_DEPLOYMENT.md) · [VPS Runbook](project_docs/RnD_docs/FIRST_VPS_DEPLOYMENT_RUNBOOK.md) |
| Understand privacy, deletion and backups | [Privacy And Backups](project_docs/RnD_docs/PRIVACY_AND_BACKUPS.md) |
| Work on the implementation | [Architecture](project_docs/RnD_docs/ARCHITECTURE.md) · [Development](project_docs/RnD_docs/DEVELOPMENT.md) |
| Review performance and direction | [Benchmarks](project_docs/RnD_docs/PUBLIC_BENCHMARK_SUMMARY.md) · [Roadmap](ROADMAP.md) · [Changelog](CHANGELOG.md) |

Branding supports managed uploads and the shipped fallback files: [`login-logo.svg`](apps/web/public/branding/login-logo.svg), [`login-background.svg`](apps/web/public/branding/login-background.svg), [`team-logo.svg`](apps/web/public/branding/team-logo.svg), [`team-background.svg`](apps/web/public/branding/team-background.svg), plus [avatar icons](apps/web/public/branding/avatars). Configuration and file precedence are documented in [Usage](project_docs/RnD_docs/USAGE.md#editable-deployment-files).

## Contributing

Like OpaVoting? **[Give the project a GitHub star](https://github.com/AtanasRusevPros/opa-voting-tool)**, self-host it, report issues or contribute improvements. Start with [CONTRIBUTING.md](CONTRIBUTING.md). Report vulnerabilities through [SECURITY.md](SECURITY.md), not public issues.

## License

Licensed under **AGPL-3.0-or-later**; see [LICENSE](LICENSE). Project name, logo and official visual identity are covered by [BRANDING.md](BRANDING.md).
