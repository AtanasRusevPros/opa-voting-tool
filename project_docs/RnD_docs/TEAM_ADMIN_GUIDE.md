<!--
SPDX-FileCopyrightText: 2026 Atanas G. Rusev
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Team-Admin Guide

Status: Public operator guide
Updated: 2026-04-26 00:30 EEST

## Purpose

This guide describes what a team-admin can do inside a team, what is intentionally outside team-admin scope, and how team-scoped user, history, and Jira workflows should be operated safely.

## What A Team-Admin Can Do

- add or invite an allowlisted user directly into their own team
- manually share the generated first password when SMTP is not configured
- reset the password of any other existing user who is already a member of their current team, including another team-admin
- view the full team member directory
- approve or deny pending join requests for their own team
- promote a regular team member to team-admin
- remove regular team members from their team
- archive or unarchive their own team
- configure the team's minimum participation rule for reveal gating
- configure the team's default Issues List time-popup timezone rows
- export the team's history package
- import a team-history package into their current team
- configure the team's Jira source (`Project key + optional JQL`)
- import/refresh Jira issues into the team's pending estimation queue
- load a pending Jira issue into the board for voting
- view the team-scoped admin/workflow history in the notification bell

## Live People Status

Keep Team Admin → People open while an invited member joins or leaves the board: **Onboard** / **Not online** updates automatically. This works from the board and the team chooser, including after reconnection. Opening People from the chooser does not join the board or affect voting participation thresholds.

Each person can use **Account settings → Open my last team automatically after sign-in** (default on). Turning it off starts them in the chooser; accessible direct team links still take priority. This changes only their navigation, not membership or admin privileges.

## What A Team-Admin Cannot Do

- admit or deny platform access requests
- manage the platform-wide `People` list
- delete another person's platform account; `Remove` only removes a regular member from the current team
- reset passwords for existing users from the platform side
- reveal or edit the dedicated super-admin credentials
- change platform branding, global app settings, or SMTP settings
- import or export the whole database
- demote another team-admin
- manage the global Jira Cloud connection

## Team Member Management

Open the team `People` modal from the board or chooser.

Admin-capable entry buttons now say `Team admin`, but the modal and supporting text stay descriptive rather than renaming every people-related surface.

Current actions:

- `Add to team`
  - use the existing-user lookup first by typing at least `2` characters
  - matching existing platform users are shown as explicit candidates and the add action stays disabled until one is chosen
  - if the user already exists and is selected, they are added to the team
  - if the user is new and SMTP is not configured, a one-time generated password is revealed for manual sharing
  - if SMTP is configured, the same password can also be delivered by email
  - the dedicated super-admin account is intentionally excluded from these candidate/member surfaces
- `Reset password`
  - available only for other users who already belong to the current team
  - team-admins may reset peer team-admins in the same team, but not themselves
  - disabled for members who are currently live on the board, so an active participant is not surprised by a password change during a session
  - if SMTP is not configured, the replacement password is revealed once for manual sharing directly under that member's row
- `Admit` / `Deny`
  - for pending join requests to this team only
- `Promote`
  - makes a regular member a team-admin
- `Remove`
  - removes that member from the team
  - does not delete the person's platform account or their history elsewhere

Important limitation:

- a team-admin cannot demote another team-admin; that remains super-admin-only

## Archived Teams

- Team-admins can archive or unarchive their own team.
- Archived teams stay visible and readable, but the board becomes read-only until unarchived.
- Membership changes and other writable team actions are disabled while archived.

## Minimum Participation Rule

- The team settings pencil menu now includes `Minimum participation`.
- The rule is off by default.
- When enabled, the team-admin sets an integer threshold percent such as `75`.
- Reveal still computes the real average from numeric votes, but if the threshold is not met, the board and history show a gated result with voted vs not-voted counts instead of exposing the final average.
- The threshold denominator is the set of people currently live on the board at reveal/re-evaluation time. Someone who leaves mid-vote stops counting against the threshold, and someone who reconnects or joins before reveal counts again.
- If a blocked round later satisfies the threshold because more active participants vote, presence changes, or the team-admin lowers the threshold, the server reveals the existing round without writing an earlier blocked history entry.

## Team Default Time Popup

- The team settings pencil menu includes `Time popup`.
- Team-admins choose the timezone rows that are shown by default in the Issues List date popup for that team.
- New teams start from the global `[history_popup].timezone_keys` deployment default, then keep their own team default after creation.
- This team setting is the inherited list only. Each user can open `Account settings` and save a personal timezone list for the current team.
- If a user has no personal list, or clicks `Use team default`, that user follows the current team default again.
- Changing the team default does not overwrite users who already saved a personal override.
- Personal overrides are team-scoped. A custom list saved in one team does not affect the same user's popup in another team.

## SMTP And Manual Credential Sharing

Normal self-hosted teams support both SMTP delivery and manual-share fallback.

### If SMTP is configured

- the app can send invitation/reset mail through the configured SMTP service
- the team-admin should still verify the right email was used before sending
- SMTP-backed account delivery has been smoke-tested through a real transactional mail provider
- repeat a small invite/reset smoke test after changing SMTP provider, sender, DNS, or credentials

### If SMTP is not configured

- the app still supports onboarding into the team
- the generated initial password is shown once to the team-admin
- the UI reminds the team-admin to save it somewhere secure before closing
- the team-admin must deliver that password through the approved company channel

Recommended practice:

- copy the generated password immediately
- send it through the customer's approved secure channel
- tell the user to save it somewhere secure and change it later from `Account settings`

## Team History Export And Import

The team `People` modal now includes `History import and export`.

### Export

- `Export team history` downloads a JSON package
- comments are included by default
- comments can be excluded before export by clearing the checkbox

### Import into the current team

- choose a JSON team-history package
- use `Import into this team`
- the app imports revealed issues and their historical comments
- imported comments preserve the stored `Name (email)` signature
- imported comments become immutable historical records

Duplicate behavior:

- importing the same package into the same team again skips duplicates instead of silently duplicating rounds

## Jira Cloud Team Workflow

The team `Team admin -> Import/export` tab now also includes a Jira section.

What a team-admin can do there:

- save the Jira project key for the current team
- optionally save a JQL filter
- run `Import / refresh issues`
- review the pending Jira issue queue
- load a pending Jira issue into the board for the next round

Important behavior:

- the queue item shows both the Jira issue key and the Jira issue title
- loading a Jira issue into the board does not remove it immediately
- the Jira-backed queue item is removed only when that round is fully revealed
- importing again updates existing queue items instead of duplicating the same Jira issue

Official references and expectations:

- Jira Cloud setup and OAuth are documented by Atlassian, but controlled by the super-admin rather than the team-admin:
  - OAuth 3LO implementation:
    - https://developer.atlassian.com/cloud/oauth/getting-started/implementing-oauth-3lo/
  - Jira Cloud 3LO overview:
    - https://developer.atlassian.com/cloud/jira/platform/three-legged-oauth/
  - Jira issue search API:
    - https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/
- Atlassian does not publish a team-admin-specific test checklist for this workflow.
- In this product, the expected behavior is protected instead by the app's own automated tests covering queue visibility, issue key/title rendering, and `Load for voting`.

## Imported Historical Comments

Imported comments are intentionally different from live comments:

- they keep the original stored `Name (email)` signature
- they cannot be edited
- they cannot be deleted
- this is expected and preserves audit/history integrity

## Team Permalinks

- the board share icon copies the current team permalink
- existing members who open the link go directly to the board
- non-members keep the requested team context through sign-in and approval

## Good Operating Checklist

For a normal team-admin workflow:

1. open the correct team
2. check whether the team is archived
3. add/invite or approve the correct person
4. if a password is revealed, save it securely before closing
5. if exporting history, confirm whether comments should be included
6. if importing history, verify the target team before starting
7. if the import completes, spot-check the history rail and comment signatures

## Escalate To The Super-Admin When

- a person needs platform admission rather than only team admission
- a platform access request is pending
- an existing user needs a platform-level password reset
- whole-database export/import is needed
- branding, SMTP, or global app settings must change
- Jira Cloud client credentials, site selection, or disconnect are needed
- a team-admin must be demoted

This guide is intentionally limited to the team-admin surface and stays separate from the super-admin guide.

## Hosted-trial collaboration and limits

**[Try the free live demo](https://app.opavotingtool.eu)** with your team, without installing anything. Choose **Start free public trial** after entering your email and follow the email instructions. The allowances below apply to the hosted demo, not ordinary self-hosted installations.

### Joining another hosted-demo workspace

1. Ask an admin of a team in that workspace to add you from **Team admin** using
   your complete account email. Selecting a search suggestion is optional for an
   exact email. Workspace membership is obtained through a team invitation/addition;
   there is no separate public workspace directory to browse.
2. Existing users keep their current login and do not need a new signup or SMTP
   delivery to be added. New trial users need the email invitation/onboarding flow;
   follow the delivered sign-in instructions.
3. Sign in and select the team's card in the chooser. **Account → Workspaces**
   shows your joined workspaces and joined teams; membership in a workspace does
   not automatically add you to every team in it.
4. Each normal user may belong to two trial workspaces in total, including their
   owned workspace. To make room for another, a collaborator uses **Account →
   Workspaces → Leave workspace**. Leaving one team does not free a workspace slot.
   Owners use account deletion to purge their owned trial workspaces; review that
   destructive action carefully.

Each hosted-demo workspace defaults to two teams, ten users across the workspace
and 80 revealed rounds shared by all its teams per UTC calendar month. Invitations
do not reset usage. These allowances do not apply to ordinary self-hosted workspaces.



The hosted demo supports two public-trial workspace memberships per normal user.
Existing users can be invited to a second workspace; a third invitation explains
how to free a slot. Team removal or leaving a team does not remove workspace
membership. Collaborators can use **Leave workspace** in **Account → Workspaces** to leave
all teams in that workspace while retaining their account and saved shared history.
Owners cannot leave: Account settings explains account deletion and permanent purge
of all their owned trial workspaces. The existing signup flow does not create
additional owned workspaces for accounts already in a trial workspace.

Defaults are two teams, ten users and **80 revealed rounds per workspace per UTC
calendar month**. All teams share that allowance; repeat Vote AGAIN reveals count
separately. Invitations and workspace membership changes do not reset it. At the cap,
new rounds, votes, and reveals are blocked with an explanatory message; history stays
available. Team cards show compact workspace identity, role and usage. Account → Workspaces contains joined-team details and the reset date. Enabled hosted-trial deployments upgrade the legacy 40-round allowance to 80 on startup and persist it. Other custom limits and disabled-trial deployments remain unchanged.

Removing a team member revokes their board socket and returns their browser to the
team chooser. Adding an already registered user does not require SMTP; inviting a
new trial user still requires email delivery. Workspace member capacity still applies.

OpaVoting is free, open-source software designed for efficient realtime workloads,
with recorded simulated-load coverage of 400 concurrent users across multiple teams.
The personally funded hosted demo is limited to keep its small server available.
Self-hosting removes hosted-demo quotas; practical capacity depends on your server.
Source, deployment documentation and the GitHub star link are shown in the trial UI.

Hosted-trial workspaces start with the owner's display name, for example **John Doe's Workspace**. The owner can choose **Rename workspace** in **Account → Workspaces**, enter a trimmed name of 1–80 characters, and Save or Cancel. Collaborators and team admins cannot rename another person's workspace. Names need not be unique; workspace IDs, memberships, history and monthly usage do not change. Later profile-name changes do not automatically rename the workspace. This management UI is available only in hosted-trial mode.

If adding someone would exceed their two-workspace allowance, the invitation form keeps their email and displays the server explanation until retry. They can leave a collaborator workspace from Account → Workspaces; deleting an owner account purges its owned trial workspaces and is destructive. Leaving only a team does not release a workspace slot.

## Helping users sign in

Normal team members and team admins use `/`. Enter a valid-looking email to enable Forgot password or, when offered, Start free public trial. Request access is optional per installation; if it is absent, contact an administrator for admission or use the available trial signup. Platform super-admins use the separate `/admin` address with their configured admin credentials.


Team membership safeguards: a team's only team admin cannot leave, even if the platform super-admin also has access. Archive the team from **Team admin**, or arrange for another team admin before leaving. The chooser and board explain this restriction, and the server enforces it. With another team admin remaining, leaving works normally. Team departure does not release a trial workspace slot.

In **Team admin**, enter a complete email to add or re-add an eligible existing user directly; selecting a search suggestion is optional. Name-only searches require selecting a result. Normal invitation permissions and workspace limits still apply. The rename pencil uses the same icon and button styling as the board.


## Privacy and backup retention

The [privacy and backup guide](PRIVACY_AND_BACKUPS.md) defines the current policy.
Owner account deletion purges owned trial workspaces from the live database;
archiving is not erasure. Shared history elsewhere keeps identifiable deactivated
attribution. Downloaded exports and operational records require separate handling.
Opt-in in-app snapshots run weekly (168 hours), retain at most three completed
copies, and expire after 21 days while enabled/running; restart checks missed work.
Deployment archives are separately capped at three after successful creation and
have operator-managed age expiry. There is no external scheduler or daily job.
The public notice reflects configured backup values and `[privacy]` contact/provider
details. No-sale/no-advertising and restricted-access promises do not mean “no
providers process data”. Manual privacy requests and actual operator practices
remain necessary; no blanket GDPR/California/US compliance claim is made.

## Team Statistics

Open **Team Admin → Stats**, between People and Import/export, for your team's activity, completed rounds, distinct issues, participation and live counts. Choose a rolling 24-hour/7-day/30-day period or export the displayed JSON snapshot. Archived teams retain read-only statistics. Regular members cannot access this tab or its API; team admin rights never grant another team's statistics.

Counts start with statistics collection, exclude synthetic/demo and super-admin activity, and are retained for 31 days. See [definitions, coverage and deletion behavior](USAGE.md#usage-statistics). Workspace-wide and platform-wide reports belong to the super-admin's **Platform → Stats** view.


### Edit An Issue Title

Team admins (and the platform super-admin) can click the current board title or a saved title in **Issues List → History/Search** to correct it. A small transparent pencil appears on hover or keyboard focus. The editor keeps the displayed title's outer size; longer text scrolls inside it without extending beyond the rounded edges. Press **Enter** or click outside to save; **Escape** cancels. Titles are trimmed and must contain 1–255 characters. Ordinary members see plain, non-editable titles; archived teams remain read-only.

Saving changes only the local issue title: votes, timer, result timestamp, completed-round statistics and monthly quota usage stay unchanged. A re-vote and its saved history item share the correction. A failed save keeps the draft and shows an error; conflicting edits are rejected rather than silently overwriting another admin's correction. Changes appear for connected viewers and persist after reload. This does not rename the source issue in Jira.
