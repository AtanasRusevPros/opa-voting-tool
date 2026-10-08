<!--
SPDX-FileCopyrightText: 2026 Atanas G. Rusev
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Statistics guide

[Team](#team-admin) · [Workspace](#workspace-owner) · [Platform](#platform-admin) · [Count definitions](#count-definitions) · [Exports and retention](#exports-and-retention)

## Team admin

Open **Team Admin → Stats**. You see only that team's activity, voting, membership and live board counts. Archived teams remain readable. Ordinary team members cannot access this report. Team admin rights do not grant workspace or platform access.

## Workspace owner

In the hosted trial, open **Account → Workspaces → Workspace stats: [name]**. The owner sees all teams in that workspace, even teams they have not joined. Collaborators do not see this control and cannot request the report. Ownership of one workspace never grants another workspace's statistics. Self-hosted installations use Team Admin or Platform reports instead of the hosted-workspace Account controls.

The report has its own Period, Refresh and Export controls. It excludes installation-wide registrations and permanent platform totals. Workspace monthly quota usage remains separately displayed in Account: quota uses a **calendar month in UTC**, not the rolling statistics period.

## Platform admin

Open **Platform → Stats**. With **All workspaces**, the super-admin sees installation totals, new registrations and permanent round/vote counts. Choose a workspace to narrow the report to that workspace; installation-only counts disappear. Workspace owners use their separate Account view, not Platform access.

## Count definitions

All reports exclude synthetic demo/simulator identities and teams. Super-admin presence/activity does not count as human adoption. Reports describe usage, not individual productivity.

| Count | Meaning |
| --- | --- |
| Active people · 24 hours / 7 days / 30 days | Distinct people who entered a board or successfully changed team data during that rolling window. Login, idle heartbeats and reading reports do not count. Multiple tabs/teams do not double-count a person within the selected scope. |
| People / Members online now | Distinct connected people, including the team chooser. Scoped reports restrict this to members in the report's teams. |
| On boards now | Distinct people with board connections. Chooser and statistics observers do not count as board participants. |
| Completed rounds | Revealed rounds completed within the selected period. Re-voting adds a round; title edits do not. |
| Distinct issue records | Distinct saved issue identities among those rounds. Re-votes share an issue; separate issues with identical titles do not. |
| Votes in completed rounds | Submitted votes in those completed rounds, including non-numeric choices. This is not the sum of card values. |
| Unique voters | Distinct recorded voters in those completed rounds. Repeated votes across rounds count once here. |
| Participation | Eligible participants who voted, divided by eligible participants across completed rounds. Weighted across rounds; not the average of per-round percentages. No eligible participants shows a label instead of a percentage. |
| Active rounds started in period | Still-active rounds started within the selected period. |
| Abandoned rounds started in period | Unrevealed cancelled/replaced rounds started within the selected period. |
| Active teams / Active workspaces | Teams/workspaces with qualifying human activity in the selected period. Not the number that merely exist. |
| New registrations | Human accounts registered during the selected period and since collection began. Only the unfiltered platform report includes this. Deleted accounts are excluded. |
| Retained platform totals | Completed-round and vote counters retained across workspace deletion, with no attached identifying details. Only the unfiltered platform report includes these, independent of Period. Coverage starts from available statistics at upgrade; expired/deleted past usage cannot be reconstructed. |

The **Teams** table shows current Members and On board counts alongside period-specific Active people, Rounds, Issues and Votes. A person belonging to multiple teams can appear in multiple rows, so summing rows is not a unique-person total. Workspace labels distinguish teams with matching names. Archived teams are labelled.

**Daily trend** groups active people and completed rounds by UTC date; boundary dates can be partial. Periods are rolling 24 hours, 7 days or 30 days. Coverage starts when statistics collection began; a partial-coverage notice means some requested history was never collected. Zero recorded activity is not proof that nobody used the app before collection started.

## Exports and retention

Reports update through a read-only live connection and provide Refresh/retry if disconnected. Snapshot time shows when the displayed data was generated. **Export stats JSON** downloads that same authorized snapshot, including team/workspace labels, coverage, period, trends and totals; no individual account list, issue text or vote values.

Statistics do not expire automatically. Account deletion removes activity/voter links; workspace deletion removes its detailed statistics. Only platform-wide completed-round/vote counters survive that purge without identifiers or content. Shared history and backups have separate exceptions. See [privacy and backups](PRIVACY_AND_BACKUPS.md#first-party-usage-statistics). Downloaded exports remain the operator's responsibility.
