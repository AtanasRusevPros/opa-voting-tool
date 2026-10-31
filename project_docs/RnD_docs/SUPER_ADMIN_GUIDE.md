<!--
SPDX-FileCopyrightText: 2026 Atanas G. Rusev
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Super-Admin Guide

[Documentation index](../README.md) · [Project home](../../README.md)

<details>
<summary>Contents</summary>

- [Purpose](#purpose)
- [What The Super-Admin Owns](#what-the-super-admin-owns)
- [Important Files](#important-files)
- [Super-Admin Account](#super-admin-account)
- [Default Local Testing Configuration](#default-local-testing-configuration)
- [Platform Settings Responsibilities](#platform-settings-responsibilities)
- [Team And Membership Responsibilities](#team-and-membership-responsibilities)
- [Archived Teams](#archived-teams)
- [SMTP Operating Modes](#smtp-operating-modes)
- [Current Admin Surfaces](#current-admin-surfaces)
- [Jira Cloud Setup And Operations](#jira-cloud-setup-and-operations)
- [Personal Sign-In Destination And Live People](#personal-sign-in-destination-and-live-people)
- [Account Deletion](#account-deletion)
- [Simulator Visibility Note](#simulator-visibility-note)
- [Manual Credential Delivery](#manual-credential-delivery)
- [Demo Mode](#demo-mode)
- [After-Change Verification Discipline](#after-change-verification-discipline)
- [Local SMTP Verification Options](#local-smtp-verification-options)
- [Team Permalink Behavior](#team-permalink-behavior)
- [History Portability And Search](#history-portability-and-search)
- [Whole-Database Snapshot Reminder](#whole-database-snapshot-reminder)
- [Hosted-trial collaboration and limits](#hosted-trial-collaboration-and-limits)
- [Privacy and backup retention](#privacy-and-backup-retention)
- [Platform Statistics](#platform-statistics)

</details>

Status: Public operator guide
Reviewed: 2026-10-27

## Purpose

This guide describes what the super-admin is responsible for, which controls exist in the product, and what should be checked after important configuration changes.

The separate team-admin guide now lives at:
- [`TEAM_ADMIN_GUIDE.md`](TEAM_ADMIN_GUIDE.md)

## What The Super-Admin Owns

- initial platform setup
- `config/deployment.local.toml` maintenance for real deployments
- `config/deploy.local.toml` maintenance only when a non-default keep-alive mode is needed
- `config/allowed-domains.txt` maintenance
- branding uploads and global palette/footer settings
- SMTP configuration when the customer wants integrated email delivery
- Jira Cloud OAuth client setup and site binding when the customer wants backlog import
- demo-mode enable/disable
- whole-database snapshot export/import
- deployed usage/workspace/user reports from `./deploy.sh`
- demotion of team-admins back to regular members
- keeping the platform operational when SMTP is intentionally not used

## Important Files

- First VPS deployment runbook: [`FIRST_VPS_DEPLOYMENT_RUNBOOK.md`](FIRST_VPS_DEPLOYMENT_RUNBOOK.md)
- Deployed VPS operator helper: [`deploy.sh`](../../deploy.sh)
- Deployment config override: `config/deployment.local.toml`
- Keep-alive override: `config/deploy.local.toml`
- Tracked local-development config: [`config/deployment.toml`](../../config/deployment.toml)
- Tracked keep-alive defaults: [`config/deploy.toml`](../../config/deploy.toml)
- Deployment config example template: [`config/deployment.sample.toml`](../../config/deployment.sample.toml)
- Allowed domains: [`config/allowed-domains.txt`](../../config/allowed-domains.txt)
- Managed branding uploads: [`config/managed-branding`](../../config/managed-branding)
- Fallback branding assets: [`apps/web/public/branding`](../../apps/web/public/branding)

Deployment security note:
- the current first-server runbook is tested on Ubuntu Server 24.04 LTS
- the deployment architecture should remain portable to common Linux server distributions, with documented differences for package installation, firewall tooling, service management, and Podman/Compose packaging
- production app content should be reachable through HTTPS only
- external plain HTTP should only redirect to HTTPS or support certificate automation; localhost testing and protected proxy-to-app traffic may use HTTP
- the app's internal port should not be publicly reachable
- routine deployed-server operations should use `./deploy.sh` from the VPS checkout, including `./deploy.sh update`, `./deploy.sh health`, `./deploy.sh public-health`, `./deploy.sh startup:status`, `./deploy.sh watchdog:status`, `./deploy.sh incidents`, `./deploy.sh diagnose`, `./deploy.sh diagnose:demo-counts`, and `./deploy.sh backup`

## Super-Admin Account

- The super-admin account is separate from any normal employee/team-member account.
- It is configured through the deployment TOML and signs in at `/admin` on your deployment origin. Bookmark this separate page; the public login has no Admin button. Back to user sign-in returns to `/`.
- The recommended operational practice is to keep the super-admin username distinct from the person’s normal company email account.
- The super-admin is automatically a member of every team, but the product keeps the super-admin on the chooser/admin surface by default until a specific team is opened.
- Even though that universal membership remains real internally, the UI now intentionally hides the super-admin identity from team-facing presence/member/invite/autocomplete surfaces so normal teams do not see `admin.local` as a standard participant row.
- The repository does not ship usable default super-admin credentials. Create `config/deployment.local.toml`, set `[admin].username` and `[admin].password`, then start or restart the app.

## Default Local Testing Configuration

- The repo ships a tracked `config/deployment.toml` template, but super-admin username/password are intentionally blank for safety.
- Ignored `config/deployment.local.toml` takes priority when present and is the right place for real deployment settings.
- Tracked `config/deploy.toml` holds the default keep-alive policy, and ignored `config/deploy.local.toml` is only needed when you want a non-default startup backend, watchdog interval, or incident path.
- The repo also ships `config/deployment.sample.toml` as the example template to keep as a reference when preparing a real deployment.
- The shipped default intentionally leaves SMTP blank, so the local stack starts in the supported no-SMTP/manual-share mode.
- Startup refuses to continue until `[admin].username` and `[admin].password` are configured.
- That makes it possible to test:
  - local super-admin sign-in
  - manual-share onboarding for allowlisted users
  - manual-share password reset for existing team members
  - branding and other platform settings without waiting for real SMTP setup

## Platform Settings Responsibilities

HTTPS is enforced outside localhost testing: [transport policy, proxy trust and upgrade steps](HTTPS_DEPLOYMENT.md). Session cookies are Secure in HTTPS mode, and WebSocket upgrades enforce the same transport boundary.

The host operator configures `app.trusted_proxy_ips` and, for a verified loopback-published Podman self-NAT setup, `app.trust_local_container_proxy` in `config/deployment.local.toml`, then restarts the app. These are not team settings or Platform UI toggles. Follow the linked guide rather than copying a changing container IP. For build failures on Podman 6, see [runtime recovery](FIRST_VPS_DEPLOYMENT_RUNBOOK.md#podman-6-and-existing-rootless-settings).

Open **Platform** from the chooser. Its tabs are:

| Tab | Controls |
| --- | --- |
| People | Pending platform access requests; admit/deny; existing users, password reset and account deletion with preview/confirmation. |
| Stats | Read-only installation/workspace/team usage reports and JSON export; no settings save on this tab. |
| Branding | Login/team logos and backgrounds, company footer text, opacity and palette. The default self-hosted project credit (author, GitHub, documentation and license) is separate from these editable company fields. |
| App settings | Base URL and Demo mode. |
| SMTP | Host, port, username, password and from-address. |
| Super-admin | Admin credentials, Jira Cloud connection/site selection and whole-database snapshot import/export. |

Secret fields are masked. Use the eye button for an explicit reveal; leaving the masked value unchanged preserves the secret, while entering a new value replaces it. See [configuration files and precedence](USAGE.md#editable-deployment-files).

## Team And Membership Responsibilities

Team admins manage their own members, join requests, promotions, archive state and voting settings. They can reset other current-team members' passwords, including peer admins, but not while the target is live on that board. They cannot demote another admin or change global settings. See the [team guide](TEAM_ADMIN_GUIDE.md) for exact controls.

The super-admin can demote team admins, manage platform access and operate global configuration. A team's last ordinary admin cannot leave; your implicit membership does not replace that admin.

## Archived Teams

- Archived teams remain visible within the viewer's permitted team scope.
- They appear with an `Archived` marker and disabled join/request behavior.
- Existing members can still open them in read-only mode and inspect board/history.
- Team-admin membership actions are disabled while archived.
- Archived teams move to the bottom of members’ team lists.

## SMTP Operating Modes

### Mode 1: Customer SMTP enabled

Configure host, port, credentials and from-address in **Platform → SMTP**, using the mail administrator's approved relay settings. Check TLS/relay requirements with that administrator. Send an invitation/reset to a controlled mailbox before relying on delivery; repeat after provider, sender or credential changes. Prior alpha SMTP testing does not verify a new customer's mail service.

### Mode 2: SMTP intentionally not used

Ordinary self-hosted deployments remain usable without SMTP. Team admins can invite allowlisted users; platform admins can admit requests when access requests are enabled. Generated initial passwords are shown for manual delivery. Password recovery generates a replacement through **Platform → People** or **Team admin → People**. Team-admin resets are disabled while the target is live on that board.

The login page directs users to an admin for recovery when delivery is unavailable. Copy each displayed password before closing, deliver it privately and retain it only as needed. Disabling `[auth].access_requests_enabled` removes Request access and rejects new submissions; existing requests and invitations are independent. New hosted-trial users still require SMTP.

## Current Admin Surfaces

- `Platform -> People` keeps pending platform-access requests at the top and the admitted platform user list below.
- Existing users exclude marked demo/test accounts by default, even when Demo mode is off. Select **Include demo/test accounts** to inspect them; synthetic rows show **Demo/test account**. Search, sort and pagination respect the filter. Closing/reopening Platform resets it to real users. Real people are never hidden merely because they joined a Demo team.
- Operator usage/export commands use the same default. Add `--include-synthetic` for diagnostics; see [reporting scope and count definitions](STATISTICS_GUIDE.md#people-and-operator-reports).
- The `People` tab now pages existing users in batches of `30`, supports `Recently updated`, `Oldest updated first`, `Alphabetical A-Z`, and `Alphabetical Z-A` sorting, and activates search at `2+` characters so large installations stay usable.
- The notification bell now separates live pending actions from a paginated action history.
- Super-admin action history is platform-wide across all teams.
- Team-admin action history is limited to actions relevant to the current team.
- `Platform -> Super-admin` now also exposes whole-database SQLite snapshot export/import for maintenance and recovery use.
- Team member management now supports JSON team-history export/import, with comments included by default and imported comments preserved as immutable historical records.

## Jira Cloud Setup And Operations

Current integration scope:

- Jira Cloud only
- one global Jira Cloud connection for the whole platform
- team-level source settings of `Project key + optional JQL`
- read-only import into the team's pending estimation queue
- the app stores and displays both the Jira issue key and the Jira issue title

Operator setup flow:

1. create an Atlassian OAuth 2.0 3LO app and obtain the Jira Cloud client id and client secret
2. open `Platform -> Super-admin`
3. enter the Jira client id and client secret
4. start the Jira Cloud connection flow
5. complete Atlassian sign-in/consent in the popup
6. if Atlassian returns multiple accessible sites, select the intended site
7. confirm the connected site name/url now appears in the Jira section

What is stored in deployment config:

- Jira client id
- Jira client secret
- connected cloud id
- connected site url
- connected site name
- Jira OAuth token metadata needed for future refresh/use

Operational expectations:

- the current deployment TOML now includes a `[jira]` section
- local defaults intentionally leave Jira disconnected
- the sample deployment TOML includes example Jira fields so operators know what to fill in
- disconnecting Jira removes the active platform-wide Jira Cloud binding and stops team imports until reconnected

Team admins then use **Team admin → Import/export** to save a project key/optional JQL and import issues. Refresh deduplicates pending items; loading keeps the item queued until the round is revealed. No Jira write-back is implemented. See [team Jira workflow](TEAM_ADMIN_GUIDE.md#jira-cloud-team-workflow).

Protocol references: [Atlassian OAuth 3LO](https://developer.atlassian.com/cloud/oauth/getting-started/implementing-oauth-3lo/), [app setup](https://developer.atlassian.com/cloud/oauth/getting-started/enabling-oauth-3lo/), [Jira issue search](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/).

## Personal Sign-In Destination And Live People

Account settings includes **Open my last team automatically after sign-in**, enabled by default. Normal users can turn it off to start in the team chooser; deliberate accessible team links take priority. The dedicated super-admin sign-in keeps its existing chooser-first default. This is an account preference in both deployment modes, not an operator setting or permission change.

Team Admin / People refreshes while open, including from the chooser. Its read-only subscription does not count as board presence or affect voting quorum. No additional service or configuration is required.

## Account Deletion

- Any normal user can delete their own account from `Account settings`; self-deletion requires the current password and an explicit typed confirmation.
- The super-admin can delete another normal account from `Platform -> People`; the action requires typing the selected account's exact email.
- The configured super-admin account can never be deleted.
- Shared history is retained as `Name (Deactivated)` and the original email is no longer exposed through normal product surfaces.
- The deletion preview explains the destructive impact before confirmation.
- Existing backups and previous exports may still contain pre-deletion data and are not rewritten automatically.

After deleting an account, verify `./deploy.sh health`, `./deploy.sh public-health`, `./deploy.sh usage`, `./deploy.sh users:export`, and `./deploy.sh workspaces:export`.

## Simulator Visibility Note

- `Sim Team ...` rooms are now treated as live runtime resources.
- If the simulator sidecar stops heartbeating, those seeded sim rooms disappear from the normal chooser instead of lingering as broken stale teams.
- When the sidecar comes back and resumes heartbeating, the same sim rooms reappear without a manual database reset.

## Manual Credential Delivery

See [SMTP operating modes](#smtp-operating-modes). The same secure manual-delivery procedure applies to new-user invitations and password resets; do not copy credentials into issue reports or public logs.

## Demo Mode

- Demo mode is super-admin-only.
- When disabled, demo teams remain hidden and the synthetic activity remains dormant.
- When enabled, demo teams appear only for the super-admin. Wait for the settings save to finish before opening a demo team; initial seeding is committed atomically.
- A temporary connection failure preserves your session and unsaved settings while the app retries. A rejected/expired session still requires signing in again.
- Demo mode is separate from the dev-only `SIMULATOR_MODE_ENABLED` API paths; keeping the simulator API disabled in production does not remove this in-app demo capability.
- This mode is intended for demos, validation, and pre-deployment confidence checks, not for normal user operation.

## After-Change Verification Discipline

After changes, verify the relevant flow:

| Change | Check |
| --- | --- |
| Configuration/branding | Save, reload login/chooser/board, inspect appearance and unexpected console errors. |
| SMTP | Admit/invite/reset a controlled account; verify actual delivery or the intended manual fallback. |
| Demo | Hidden when off; visible only to super-admin when on; wait for save completion. |
| Jira | Correct site; save team source in Import/export; refresh a safe query, load an issue, reveal and confirm queue removal. |
| Database restore | Reauthenticate; check users, teams and history; verify external configuration separately. |

For source changes, use [development verification](DEVELOPMENT.md#choosing-verification); routine operator changes do not require every simulator suite.

## Local SMTP Verification Options

Automated tests mock mail transport; they do not establish delivery through your provider. For local capture, use a test SMTP inbox such as Mailpit/MailHog, point the app to it and inspect invite/reset messages. Replace the test settings before production handoff. Never use real user credentials in captures.

## Team Permalink Behavior

The board now supports explicit team-link sharing.

Operational expectations:

- the board header share icon copies a board permalink using the team route
- existing members who open the link enter the board directly
- non-members keep the target team context through sign-in and join-request flow
- approved users are returned directly to the originally requested board whenever possible

## History Portability And Search

- Team history now loads in pages of `20` most recent revealed issues by default instead of hydrating the full team history at once.
- The history rail includes a dedicated `Search` tab with filters for:
  - completion date range
  - title text
  - exact title match
  - comment text
  - voter/comment-author identity
- Team-history exports use JSON packages.
- Exported comments preserve a signed `Name (email)` snapshot so imported history remains readable even if the original live user row no longer exists.
- Imported comments are intentionally immutable and display their stored signature instead of relying on future user lookup.

## Whole-Database Snapshot Reminder

- Whole-database import replaces the live database state.
- Use it only as a maintenance/recovery operation.
- Take or keep a safe export before importing another snapshot.
- After import, sign back in and spot-check teams, people, history, and Jira connection status before declaring the environment healthy.

Use this guide as the super-admin/operator reference for setup, configuration, and operational smoke checks.

Legacy demo-account duplicates can be removed with the dry-run-first `cleanup-legacy` API maintenance command; see the [offline cleanup procedure](FIRST_VPS_DEPLOYMENT_RUNBOOK.md#targeted-legacy-demo-account-cleanup). Demo voting activates only canonical seed accounts assigned to the team.

## Hosted-trial collaboration and limits

See the [hosted-workspace rules](TEAM_ADMIN_GUIDE.md#hosted-trial-collaboration-and-limits) for the two-workspace membership limit, two-team/ten-user defaults and shared 80-reveal UTC monthly allowance. Team removal does not release a workspace slot; owner deletion is destructive.

Use `./deploy.sh config:edit` for `[public_trial].max_revealed_rounds_per_workspace_per_month` and `[app].base_url`; [restart and verify](FIRST_VPS_DEPLOYMENT_RUNBOOK.md#updating-hosted-trial-collaboration-policy). Enabled hosted-trial deployments migrate the legacy 40-round allowance to 80 without resetting usage; other custom limits and disabled-trial configurations are preserved.

Workspace names default to the owner's display name. Legacy `My First Workspace` names migrate once; custom/non-trial names are preserved. Owner-only rename accepts 1–80 characters. IDs, not names, identify workspaces; renaming does not reset quota or grant access. Platform/team admin rights do not grant another owner's rename endpoint permission.

For fresh company hosting, leave trial mode disabled. Disabling it does not convert existing trial workspace records. See [self-hosting policy](USAGE.md#hosted-demo-versus-self-hosting).

## Privacy and backup retention

Use the [privacy and backup guide](PRIVACY_AND_BACKUPS.md) for deletion scope, operator requests and restore procedures. Owner deletion purges owned trial workspaces; shared history, exports and backups have separate boundaries. Archiving is not erasure.

Opt-in database snapshots default to weekly, three copies and 21-day expiry while enabled/running. Deployment archives are separate, retaining three after successful creation with operator-managed age handling. Publish accurate operator/contact/provider details for hosted signup. These controls do not establish legal certification.

## Platform Statistics

Use **Platform → Stats** for installation-wide usage, workspace filtering and team breakdowns. Stats is read-only and Save settings is disabled on that tab. JSON export uses the displayed aggregate snapshot and selected scope. No public endpoint exposes usage totals.

See [Platform statistics and every count](STATISTICS_GUIDE.md#platform-admin), including the difference between rolling reports and permanent totals.

Statistics are enabled for both deployment modes with no automatic statistics expiry in either mode. Unfiltered Platform reports also show permanent round/vote counters, including deleted workspaces, without identifying details; team/workspace-filtered reports never expose these global totals. No additional service or statistics TOML key is needed. Reporting periods only filter the view; explicit deletion still applies. Review [definitions and operating boundaries](USAGE.md#usage-statistics) and [privacy disclosure](PRIVACY_AND_BACKUPS.md#first-party-usage-statistics). Collection starts on installation of this version; old usage is not reconstructed. This is adoption/usage reporting, not employee performance ranking. The separate operator usage CLI remains a legacy report with different calendar-month definitions, not a matching Stats export.


Team admins and the super-admin can correct board and saved history titles inline. A member who proposed the current round can also edit its board title. See [editing issue titles](TEAM_ADMIN_GUIDE.md#edit-an-issue-title) for controls, validation and read-only boundaries.
