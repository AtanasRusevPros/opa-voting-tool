<!--
SPDX-FileCopyrightText: 2026 Atanas G. Rusev
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Team-Admin Guide

[Documentation index](../README.md) · [Project home](../../README.md)

<details>
<summary>Contents</summary>

- [Purpose](#purpose)
- [What A Team-Admin Can Do](#what-a-team-admin-can-do)
- [Live People Status](#live-people-status)
- [What A Team-Admin Cannot Do](#what-a-team-admin-cannot-do)
- [Team Member Management](#team-member-management)
- [Archived Teams](#archived-teams)
- [Minimum Participation Rule](#minimum-participation-rule)
- [Team Default Time Popup](#team-default-time-popup)
- [SMTP And Manual Credential Sharing](#smtp-and-manual-credential-sharing)
- [Team History Export And Import](#team-history-export-and-import)
- [Jira Cloud Team Workflow](#jira-cloud-team-workflow)
- [Imported Historical Comments](#imported-historical-comments)
- [Team Permalinks](#team-permalinks)
- [Good Operating Checklist](#good-operating-checklist)
- [Escalate To The Super-Admin When](#escalate-to-the-super-admin-when)
- [Hosted-trial collaboration and limits](#hosted-trial-collaboration-and-limits)
- [Helping users sign in](#helping-users-sign-in)
- [Privacy and backup retention](#privacy-and-backup-retention)
- [Team Statistics](#team-statistics)
- [Edit An Issue Title](#edit-an-issue-title)
- [Phone and touch use](#phone-and-touch-use)
- [Workspace identity on a team](#workspace-identity-on-a-team)

</details>

Status: Public operator guide
Reviewed: 2026-10-27

## Purpose

Manage your team from **Team admin**, available on its board and chooser card. The panel has **People**, **Stats** and **Import/export** tabs. The title pencil opens team rename. Use the board settings pencil for voting/time-popup settings. On phones, open board controls first. Platform-wide settings belong to the [super-admin](SUPER_ADMIN_GUIDE.md).

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

Open **Team admin → People** from the board or chooser.

| Action | Behavior |
| --- | --- |
| Add to team | Enter a complete email to add/re-add an eligible user directly. For a name or partial email, type at least two characters and select a suggestion. Selection is optional for an exact email. New-user invitations follow the SMTP/manual rules below. |
| Reset password | Available for other current-team members, including peer team admins. Disabled while that person is live on the board. Without SMTP, copy the replacement password shown once below their row and deliver it securely. |
| Admit / Deny | Resolve a pending join request for this team. |
| Promote | Give a regular member team-admin rights. Only the super-admin can demote an admin. |
| Remove | Revoke a regular member's team access; an open board immediately returns to the chooser. Their platform account and history elsewhere are not deleted. |

The configured super-admin is hidden from ordinary member/search lists. A sole ordinary team admin cannot leave: archive the team or assign another team admin first. The platform super-admin's implicit membership does not count as a replacement. Leaving a team does not release a hosted-workspace membership slot.

## Archived Teams

- Team-admins can archive or unarchive their own team.
- Archived teams stay visible and readable, but the board becomes read-only until unarchived.
- Membership changes and other writable team actions are disabled while archived.

## Minimum Participation Rule

- The team settings pencil menu now includes `Minimum participation`.
- The rule is off by default.
- When enabled, the team-admin sets an integer threshold percent such as `75`.
- If the threshold is not met, the round remains active and shows voted/not-voted counts; no new history entry or final average is published until the threshold is satisfied.
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

For ordinary self-hosted teams, SMTP is optional. With SMTP configured, invitations/resets use email; verify the recipient and repeat a small delivery check after mail settings change. Without SMTP, copy the one-time displayed generated password before closing, deliver it through your approved secure channel, and ask the user to change it in **Account settings**.

Existing users can join another team using their current credentials. New hosted-trial users require email delivery; the manual fallback is for ordinary self-hosted onboarding.

## Team History Export And Import

Open **Team admin → Import/export → History import and export**.

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

The super-admin must first connect Jira Cloud; see [platform Jira setup](SUPER_ADMIN_GUIDE.md#jira-cloud-setup-and-operations). This integration imports issues read-only; voting and local title corrections do not write back to Jira.

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


Re-vote reveals consume another round. At the cap, new rounds/votes/reveals are blocked with an explanation; history remains available. Account → Workspaces shows joined teams and the reset date. Workspace capacity still applies when adding existing users. The signup flow does not create another owned workspace for an account already in a trial workspace.

Hosted-trial workspaces start with the owner's display name, for example **John Doe's Workspace**. The owner can choose **Rename workspace** in **Account → Workspaces**, enter a trimmed name of 1–80 characters, and Save or Cancel. Collaborators and team admins cannot rename another person's workspace. Names need not be unique; workspace IDs, memberships, history and monthly usage do not change. Later profile-name changes do not automatically rename the workspace. This management UI is available only in hosted-trial mode.

If adding someone would exceed their two-workspace allowance, the invitation form keeps their email and displays the server explanation until retry. They can leave a collaborator workspace from Account → Workspaces; deleting an owner account purges its owned trial workspaces and is destructive. Leaving only a team does not release a workspace slot.

## Helping users sign in

Normal team members and team admins use `/`. Enter a valid-looking email to enable Forgot password or, when offered, Start free public trial. Request access is optional per installation; if it is absent, contact an administrator for admission or use the available trial signup. Platform super-admins use the separate `/admin` address with their configured admin credentials.


## Privacy and backup retention

Account deletion and team removal are different. Deleting an owner account purges its owned trial workspaces; archiving does not erase data. Shared history elsewhere can retain identifiable deactivated attribution, and backups/downloaded exports have separate handling. Review the confirmation preview and [privacy and backup guide](PRIVACY_AND_BACKUPS.md) before destructive actions.

## Team Statistics

Open **Team Admin → Stats**, between People and Import/export, for your team's activity, completed rounds, distinct issues, participation and live counts. Choose a rolling 24-hour/7-day/30-day period or export the displayed JSON snapshot. Archived teams retain read-only statistics. Regular members cannot access this tab or its API; team admin rights never grant another team's statistics.

Counts start with statistics collection, exclude synthetic/demo and super-admin activity, and have no automatic expiry in either deployment mode. The selected reporting period only filters the view; explicit account/team/workspace deletion still applies. See [definitions, coverage and deletion behavior](USAGE.md#usage-statistics). Workspace owners have **Account → Workspaces → Workspace stats** for their own workspace. Platform reports remain super-admin-only. See the [count glossary](STATISTICS_GUIDE.md#count-definitions) and [workspace owner guide](STATISTICS_GUIDE.md#workspace-owner).


## Edit An Issue Title

Team admins (and the platform super-admin) can click the current board title or a saved title in **Issues List → History/Search** to correct it. A small transparent pencil appears on hover or keyboard focus. The editor keeps the displayed title's outer size; longer text scrolls inside it without extending beyond the rounded edges. Press **Enter** or click outside to save; **Escape** cancels. Titles are trimmed and must contain 1–255 characters. The member who started the current round can also edit its board title, including after reveal and when starting a re-vote. Other ordinary members cannot edit it; saved History/Search titles remain admin-only. The server records the proposer, preserves it through timer restarts/reload, and clears the link on account deletion. Legacy rounds without a recorded proposer remain admin-editable. Archived teams and former members remain read-only.

Saving changes only the local issue title: votes, timer, result timestamp, completed-round statistics and monthly quota usage stay unchanged. A re-vote and its saved history item share the correction. A failed save keeps the draft and shows an error; conflicting edits are rejected rather than silently overwriting another person's correction. Changes appear for connected viewers and persist after reload. This does not rename the source issue in Jira.

## Phone and touch use

On phones, use the **top-right board-controls button** for team settings, Team Admin, profile, notifications and switching teams. These controls open over the board and can scroll; close the panel to resume voting. Voting controls stay ahead of the scrollable participant list.

History is below the board in portrait and on the right in landscape. It starts hidden except for its labelled grip: tap “Show history” to show half the screen, tap again to hide it, or hold the grip briefly (a quarter-second), then drag to choose an intermediate size. Quick swipes do not resize it. Keyboard users can use Up/Down in portrait and Left/Right in landscape. Each orientation remembers its size. Rotating keeps your issue draft; enter a title of at least five characters to enable Start voting or Deal.

Pull downward on unused board-header space and release after “Release to refresh” to reload the current team. This does not submit a vote.

On desktop and tablet, the small circular arrow at the history edge hides or restores the panel without losing its previous size. Drag elsewhere on the divider to resize immediately.

Phone board controls open as a compact panel; the X at its top right closes it. Submenus have a distinct border and lightly blur the controls behind them. Thin blue borders identify enabled actions; neutral status chips such as the board timer are informational. A disabled timer-settings control is unavailable to regular members.


## Workspace identity on a team

In hosted workspaces, the board and Team Admin/People show **Workspace: name** beneath the team title. On phones it appears inside board controls, keeping the compact header clear. Long names are shortened on one line; hover to read the tooltip, or tap/click the line (Enter on a keyboard) to expand the full name. Workspace renames update connected boards and open People panels. Ordinary self-hosted teams omit this label; workspace renaming stays in **Account → Workspaces**.
