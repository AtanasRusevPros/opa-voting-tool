<!--
SPDX-FileCopyrightText: 2026 Atanas G. Rusev
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Super-Admin Guide

Status: Public operator guide
Updated: 2026-04-26 00:30 EEST

## Purpose

This guide describes what the super-admin is responsible for, which controls exist in the product, and what should be checked after important configuration changes.

The separate team-admin guide now lives at:
- [`TEAM_ADMIN_GUIDE.md`](TEAM_ADMIN_GUIDE.md)

## What The Super-Admin Owns

- initial platform setup
- `config/deployment.local.toml` maintenance for real deployments
- `config/allowed-domains.txt` maintenance
- branding uploads and global palette/footer settings
- SMTP configuration when the customer wants integrated email delivery
- Jira Cloud OAuth client setup and site binding when the customer wants backlog import
- demo-mode enable/disable
- optional public-trial mode only when intentionally operating a hosted test server
- whole-database snapshot export/import
- deployed usage/workspace/user reports from `./deploy.sh`
- demotion of team-admins back to regular members
- keeping the platform operational when SMTP is intentionally not used

## Important Files

- First VPS deployment runbook: [`FIRST_VPS_DEPLOYMENT_RUNBOOK.md`](../../project_docs/RnD_docs/FIRST_VPS_DEPLOYMENT_RUNBOOK.md)
- Deployed VPS operator helper: [`deploy.sh`](../../deploy.sh)
- Deployment config override: `config/deployment.local.toml`
- Tracked local-development config: [`config/deployment.toml`](../../config/deployment.toml)
- Deployment config example template: [`config/deployment.sample.toml`](../../config/deployment.sample.toml)
- Allowed domains: [`config/allowed-domains.txt`](../../config/allowed-domains.txt)
- Managed branding uploads: [`config/managed-branding`](../../config/managed-branding)
- Fallback branding assets: [`apps/web/public/branding`](../../apps/web/public/branding)

Deployment security note:
- the current first-server runbook is tested on Ubuntu Server 24.04 LTS
- the deployment architecture should remain portable to common Linux server distributions, with documented differences for package installation, firewall tooling, service management, and Podman/Compose packaging
- production app content should be reachable through HTTPS only
- plain HTTP should be used only for certificate automation and redirect at the reverse proxy
- the app's internal port should not be publicly reachable
- routine deployed-server operations should use `./deploy.sh` from the VPS checkout, including `./deploy.sh update`, `./deploy.sh health`, `./deploy.sh public-health`, `./deploy.sh diagnose`, and `./deploy.sh backup`
- public-trial mode is disabled by default and should remain disabled for normal self-hosted deployments

## Super-Admin Account

- The super-admin account is separate from any normal employee/team-member account.
- It is configured through the deployment TOML and signs in from the same login screen through the dedicated super-admin path.
- The recommended operational practice is to keep the super-admin username distinct from the person’s normal company email account.
- The super-admin is automatically a member of every team, but the product keeps the super-admin on the chooser/admin surface by default until a specific team is opened.
- Even though that universal membership remains real internally, the UI now intentionally hides the super-admin identity from team-facing presence/member/invite/autocomplete surfaces so normal teams do not see `admin.local` as a standard participant row.
- The repository does not ship usable default super-admin credentials. Create `config/deployment.local.toml`, set `[admin].username` and `[admin].password`, then start or restart the app.

## Default Local Testing Configuration

- The repo ships a tracked `config/deployment.toml` template, but super-admin username/password are intentionally blank for safety.
- Ignored `config/deployment.local.toml` takes priority when present and is the right place for real deployment settings.
- The repo also ships `config/deployment.sample.toml` as the example template to keep as a reference when preparing a real deployment.
- The shipped default intentionally leaves SMTP blank, so the local stack starts in the supported no-SMTP/manual-share mode.
- Startup refuses to continue until `[admin].username` and `[admin].password` are configured.
- That makes it possible to test:
  - local super-admin sign-in
  - manual-share onboarding for allowlisted users
  - manual-share password reset for existing team members
  - branding and other platform settings without waiting for real SMTP setup

## Platform Settings Responsibilities

The in-app `Platform settings` surface currently controls:

- `People`:
  - pending platform access requests at the top
  - existing platform users below
  - super-admin-only admit/deny for platform access requests
  - super-admin-only generated replacement password for existing users
  - super-admin-only account deletion with an impact preview and exact-email confirmation
- `Branding`:
  - branding uploads for:
  - login logo
  - login background
  - team logo
  - team background
- footer creator/company text
- global background opacity
- semantic palette colors
- `App settings`:
  - base URL
  - demo-mode enable/disable
  - public-trial mode settings if the deployment intentionally exposes a hosted test server
- `SMTP`:
  - SMTP host, port, username, password, and from-address
- `Super-admin`:
  - admin username/display name/password
  - Jira Cloud client id/client secret plus connect/disconnect/site selection
  - whole-database snapshot export/import

Secrets use masked placeholder behavior:

- current values are not shown in plain text by default
- the eye button reveals them explicitly
- unchanged masked values stay unchanged on save
- typing a new value replaces the stored secret

## Team And Membership Responsibilities

### What team-admins can do

- admit or deny join requests
- add existing users to their team
- invite allowlisted new users to their team
- reset passwords for other users who already belong to that current team, including peer team-admins
  - the team-admin reset control is disabled while the target user is currently live on that team's board
- promote members to team-admin
- remove members from the team
- archive or unarchive their own team
- configure the team-level minimum participation rule for reveal gating

### What only the super-admin can do

- demote a team-admin to regular member
- control global branding, SMTP, and demo mode
- manage the dedicated platform-level configuration

## Archived Teams

- Archived teams remain visible to everyone.
- They appear with an `Archived` marker and disabled join/request behavior.
- Existing members can still open them in read-only mode and inspect board/history.
- Team-admin membership actions are disabled while archived.
- Archived teams move to the bottom of members’ team lists.

## SMTP Operating Modes

The platform must support two valid operational modes.

### Mode 1: Customer SMTP enabled

Use this when the customer is willing to provide an SMTP relay or mail service.

Typical sources:

- internal/company SMTP relay
- Microsoft 365 SMTP
- Google Workspace SMTP
- other SMTP-capable providers such as Zoho Mail, Amazon SES SMTP, SendGrid SMTP, Mailgun SMTP, SMTP2GO

Practical operator checklist:

- collect SMTP host
- collect port
- confirm whether STARTTLS/TLS is required
- collect username/password or service-account credentials
- set a valid from-address owned by the customer
- verify the first live test against an internal mailbox before relying on invite/reset delivery

Current alpha validation:

- SMTP-backed account delivery has been smoke-tested on the alpha VPS through a real transactional mail provider, including external Gmail inbox checks.
- Disallowed-domain requests remained blocked as expected.
- Repeat a small SMTP smoke test after any SMTP provider, sender, DNS, or credential change.

Common provider notes:

- Internal/company relay:
  - usually the easiest enterprise deployment path
  - best when the customer wants no extra vendor approval
- Microsoft 365 SMTP:
  - common when the customer already runs M365 mail
  - confirm authenticated SMTP/service-account policy with the mail administrator
- Google Workspace SMTP:
  - common when the customer already runs Google Workspace mail
  - confirm app-password or relay policy with the mail administrator
- Third-party SMTP services:
  - useful when the customer prefers a dedicated app-mail channel
  - common choices include Amazon SES SMTP, SendGrid SMTP, Mailgun SMTP, SMTP2GO, and Zoho Mail SMTP

### Mode 2: SMTP intentionally not used

Use this when the customer wants the product to work without mail integration.

Current supported behavior:

- team-admins can add/invite an allowlisted user without SMTP
- end users without credentials can use `Request access` from the unified login screen so the super-admin can admit the account later
- the app generates an initial password automatically
- the generated password is shown once to the team-admin for manual delivery
- the UI reminds the admin to save that password somewhere secure before closing
- existing-user replacement password generation is available to the super-admin from `Platform settings -> People`, and to team-admins for other current-team members from `Team admin -> People`
- team-admin replacement password generation is intentionally disabled for people currently live on that team's board; wait until the user leaves the board, or use an agreed operational recovery path
- super-admin replacement passwords appear in the Platform People reveal overlay, while team-admin replacement passwords appear inline under the specific member row; in both cases the replacement password is shown once and must be delivered manually

Operational expectation:

- the admin is responsible for delivering those credentials through a secure outside channel such as Slack, Teams, corporate email, ticketing system, or phone
- the admin should keep the revealed credential only as long as needed to deliver it securely and should follow the on-screen reminder to save it somewhere secure before closing

## Current Admin Surfaces

- `Platform settings -> People` keeps pending platform-access requests at the top and the admitted platform user list below.
- The `People` tab now pages existing users in batches of `30`, supports `Recently updated`, `Oldest updated first`, `Alphabetical A-Z`, and `Alphabetical Z-A` sorting, and activates search at `2+` characters so large installations stay usable.
- The notification bell now separates live pending actions from a paginated action history.
- Super-admin action history is platform-wide across all teams.
- Team-admin action history is limited to actions relevant to the current team.
- Automated packaged verification uses isolated test data, so repeated e2e/simulator runs should no longer leave old test teams in the normal local stack.
- `Platform settings -> Super-admin` now also exposes whole-database SQLite snapshot export/import for maintenance and recovery use.
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
2. open `Platform settings -> Super-admin`
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

## Public-Trial Hosted Server Mode

Public-trial mode is for an owner-operated hosted test server, not for the normal self-hosted setup.

Operational expectations:

- `[public_trial]` stays disabled unless the operator intentionally enables hosted public testing.
- Open public-trial signup requires SMTP-backed code delivery and terms acceptance.
- Public-trial signup creates an isolated workspace and starter team for the first user.
- Public-trial users are limited by configured workspace caps such as teams, users, and monthly revealed rounds.
- Public-trial collaborator invites are SMTP-only and stay inside the inviter's workspace.
- Normal self-hosted/no-SMTP teams keep the manual-share invite/reset behavior documented below.
- Policy pages for hosted public trial users live at `/public-trial/terms`, `/public-trial/privacy`, `/public-trial/acceptable-use`, and `/public-trial/export-cleanup`.
- Do not promote a hosted public trial until SMTP, terms, isolation, limits, reporting, and emergency-disable checks have passed on the VPS.

Useful deployed reporting commands:

```bash
./deploy.sh usage
./deploy.sh usage:json
./deploy.sh users:export
./deploy.sh workspaces:export
```

These commands are intended for operator review and must not expose passwords, tokens, SMTP secrets, Jira secrets, or deployment secrets.

## Account Deletion And Trial Workspace Purge

- Any normal user can delete their own account from `Account settings`; self-deletion requires the current password and an explicit typed confirmation.
- The super-admin can delete another normal account from `Platform settings -> People`; the action requires typing the selected account's exact email.
- The configured super-admin account can never be deleted.
- If the account owns no public-trial workspace, access and memberships are removed while retained shared history shows `Name (Deactivated)` and no original email.
- If the account owns one or more public-trial workspaces, the preview warns that those workspaces, teams, history, comments, and workspace data will be permanently purged.
- Account deletion never purges the default/self-hosted workspace.
- Existing backups and previous exports may still contain pre-deletion data and are not rewritten automatically.

After deleting an account, verify `./deploy.sh health`, `./deploy.sh public-health`, `./deploy.sh usage`, `./deploy.sh users:export`, and `./deploy.sh workspaces:export`.

## Simulator Visibility Note

- `Sim Team ...` rooms are now treated as live runtime resources.
- If the simulator sidecar stops heartbeating, those seeded sim rooms disappear from the normal chooser instead of lingering as broken stale teams.
- When the sidecar comes back and resumes heartbeating, the same sim rooms reappear without a manual database reset.

Team-level Jira workflow after global connection:

- open a team's `People` modal
- save the Jira project key
- optionally save a JQL filter
- use `Import / refresh issues`
- confirm the pending queue shows both issue key and issue title
- load an issue into the board only when the team is ready to estimate it

Behavioral rules:

- importing Jira issues is additive and deduplicated
- refresh updates existing pending Jira items instead of duplicating them
- loading a Jira issue into the board does not remove it from the queue immediately
- the pending Jira issue is removed only when the round created from it is fully revealed
- later write-back into Jira is not part of the current phase

Official Atlassian references:

- OAuth 3LO implementation guide:
  - https://developer.atlassian.com/cloud/oauth/getting-started/implementing-oauth-3lo/
- Enabling OAuth 3LO in the Atlassian developer console:
  - https://developer.atlassian.com/cloud/oauth/getting-started/enabling-oauth-3lo/
- Jira Cloud 3LO overview and security expectations:
  - https://developer.atlassian.com/cloud/jira/platform/three-legged-oauth/
- Jira issue search REST APIs:
  - https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/

Important verification note:

- Atlassian provides the protocol and API documentation for this integration, but does not publish a ready-made automated test checklist for an app like this one.
- The project therefore verifies the Jira Cloud integration by testing the documented behaviors directly:
  - OAuth start/callback and code exchange shape
  - accessible-site selection
  - connect/disconnect behavior
  - team Jira source settings
  - Jira issue search/import
  - pending queue behavior
  - preserving both issue key and issue title in the queue and board

## Manual Credential Delivery

Current production-safe rule:

- if SMTP is not configured, the product must still remain usable
- onboarding should not be blocked by missing mail infrastructure
- whenever the UI shows a generated password, the admin should copy it immediately into the customer’s approved secure communication/workflow

Current manual-delivery cases:

- onboarding a brand-new user when SMTP is not configured
- resetting an existing team member password when SMTP is not configured

Operational note:

- the login screen now tells end users to contact a team-admin or the super-admin for password reset when SMTP-based reset delivery is unavailable

## Demo Mode

- Demo mode is super-admin-only.
- When disabled, demo teams remain hidden and the synthetic activity remains dormant.
- When enabled, demo teams appear only for the super-admin.
- This mode is intended for demos, validation, and pre-deployment confidence checks, not for normal user operation.

## After-Change Verification Discipline

After any visible configuration or branding change, check:

- the browser UI still loads correctly
- the browser console has no unexpected errors
- the login screen still renders correctly
- the chooser still renders correctly
- the board still opens correctly
- the branding looks correct in both login and board contexts

After SMTP-related changes, also verify:

- the settings save correctly
- a safe test delivery path behaves as expected
- platform admission delivers a working generated password when SMTP is configured
- if SMTP is intentionally disabled, manual-share onboarding still works
- if SMTP is intentionally disabled, manual-share reset for an existing user still works
- if SMTP is enabled, a test password-reset or invite reaches the intended mailbox

After demo-mode changes, also verify:

- demo teams are hidden when disabled
- demo teams appear only for the super-admin when enabled

After Jira Cloud changes, also verify:

- the Jira connection status shows the intended site name/url
- the team `People` modal accepts the project key and optional JQL
- `Import / refresh issues` succeeds for a known-safe project/query
- the pending queue shows both Jira issue key and title
- loading a pending Jira issue places both key and title into the round title
- revealing that Jira-backed round removes only the completed pending issue from the queue
- if a broader regression sweep is needed, rerun the repo's packaged browser and backend integration lanes because those are the project's substitute for a non-existent Atlassian-provided integration checklist

## Local SMTP Verification Options

The automated project test lane now verifies SMTP-capable behavior through mocked nodemailer transport, so CI/local automation does not require a real mail server.

For manual operator verification, recommended local capture tools are:

- Mailpit
- MailHog

Suggested local verification flow:

1. point the deployment SMTP host/port to the local Mailpit or MailHog instance
2. save the SMTP settings from `Platform settings`
3. trigger a safe password-reset or invite test
4. confirm the message appears in the local capture UI
5. disable or replace the local capture settings before real deployment handoff

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
