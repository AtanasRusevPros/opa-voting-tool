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

## What A Team-Admin Cannot Do

- admit or deny platform access requests
- manage the platform-wide `People` list
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

### If SMTP is configured

- the app can send invitation/reset mail through the configured SMTP service
- the team-admin should still verify the right email was used before sending

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
