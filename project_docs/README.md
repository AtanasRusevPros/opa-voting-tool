<!--
SPDX-FileCopyrightText: 2026 Atanas G. Rusev
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# OpaVoting Documentation

[Project home](../README.md) · [Try the free live demo](https://app.opavotingtool.eu) · [Source](https://github.com/AtanasRusevPros/opa-voting-tool)

Choose your role or task. Guides describe the current app; planned product directions belong in the [roadmap](../ROADMAP.md), and historical test results carry their own dates and limits.

| Task | Start here | More detail |
| --- | --- | --- |
| Sign in, recover access, change account settings | [Usage](RnD_docs/USAGE.md#authentication-notes) | [Hosted workspace rules](RnD_docs/TEAM_ADMIN_GUIDE.md#hosted-trial-collaboration-and-limits) |
| Run voting and manage a team | [Team Admin Guide](RnD_docs/TEAM_ADMIN_GUIDE.md) | [Phone controls](RnD_docs/TEAM_ADMIN_GUIDE.md#phone-and-touch-use), [title editing](RnD_docs/TEAM_ADMIN_GUIDE.md#edit-an-issue-title) |
| Understand activity, votes and live counts | [Statistics Guide](RnD_docs/STATISTICS_GUIDE.md) | Separate team, workspace-owner and platform permissions |
| Install on a company network or server | [AI-assisted deployment](../AI_DEPLOYMENT.md) | [VPS runbook](RnD_docs/FIRST_VPS_DEPLOYMENT_RUNBOOK.md), [verified scope](RnD_docs/AI_DEPLOYMENT_VERIFICATION.md) |
| Resolve Podman build/network failures | [Runtime compatibility](RnD_docs/FIRST_VPS_DEPLOYMENT_RUNBOOK.md#podman-6-and-existing-rootless-settings) | Podman 6 networking settings and rebuilding after a failed update |
| Configure HTTPS and trusted proxies | [HTTPS deployment](RnD_docs/HTTPS_DEPLOYMENT.md) | Localhost exception, LAN/public TLS, Podman NAT and upgrade checks |
| Configure users, SMTP, branding or Jira | [Super-Admin Guide](RnD_docs/SUPER_ADMIN_GUIDE.md) | [Configuration files](RnD_docs/USAGE.md#editable-deployment-files) |
| Update, diagnose, back up or restore | [Operator workflow](RnD_docs/USAGE.md#deployed-vps-operator-workflow) | [VPS maintenance](RnD_docs/FIRST_VPS_DEPLOYMENT_RUNBOOK.md#10-operational-checks), [privacy/backups](RnD_docs/PRIVACY_AND_BACKUPS.md) |
| Understand deletion and privacy boundaries | [Privacy And Backups](RnD_docs/PRIVACY_AND_BACKUPS.md) | Deployment-specific public notices are available in the app |
| Develop and test | [Development And Verification](RnD_docs/DEVELOPMENT.md) | [Architecture](RnD_docs/ARCHITECTURE.md), [responsive matrix](RnD_docs/RESPONSIVE_TESTING.md), [React performance](REACT_PERFORMANCE_GUIDELINES.md) |
| Review measured capacity | [Benchmark summary](RnD_docs/PUBLIC_BENCHMARK_SUMMARY.md) | [Raw report](RnD_docs/perf_runs/PHASE3_CAPACITY_VALIDATION_LATEST.md) |
| Contribute or release | [Contributing](../CONTRIBUTING.md) | [Versioning](RnD_docs/VERSIONING_AND_RELEASES.md), [release checklist](RnD_docs/OPEN_SOURCE_RELEASE_CHECKLIST.md), [changelog](../CHANGELOG.md) |

## Project And Maintainer References

- [Security reporting](../SECURITY.md), [Code of Conduct](../CODE_OF_CONDUCT.md), [license](../LICENSE) and [branding](../BRANDING.md).
- [Search/discovery guidance](RnD_docs/SEARCH_DISCOVERABILITY_NOTES.md) and [presentation](RnD_docs/OPA_VOTING_TOOL_PRESENTATION.html).
- [Agent repository instructions](../AGENTS.md), [workflow playbook](RnD_docs/AGENT_WORKFLOW_PLAYBOOK.md) and [deployment skill](../.agents/skills/deploy-opavoting/SKILL.md).

## Finding Authoritative Details

Use `deploy.sh help` for deployed operations and `dev.sh help` for development/tests. Configuration defaults live in `config/deployment.toml` and `config/deploy.toml`; local overrides are private. Permissions are enforced by the API, not by the visibility of a button. The statistics glossary defines report counts; the privacy guide defines deletion/backup exceptions.

Public documentation is self-contained: private plans, credentials and logs are not prerequisites. AI tools should follow the same task links rather than loading every guide. Consult implementation/test sources when a version-specific behavior needs verification, and report uncertainty rather than inferring support from a historical test result.
