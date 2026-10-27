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

All Stats reports exclude synthetic demo/simulator identities and teams. Super-admin presence/activity does not count as human adoption. Reports describe usage, not individual productivity.

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


## People And Operator Reports

**Platform → People** lists real, active accounts by default. **Include demo/test accounts** reveals explicitly marked synthetic accounts with a label. The filter applies before search, sorting and pagination; it resets when Platform reopens. Pending access requests are unchanged. Team membership lists, including bots in Demo teams, remain complete.

The operator commands `./deploy.sh usage`, `usage:json`, `users:export` and `workspaces:export` also exclude synthetic data by default. Append `--include-synthetic` for diagnostic inclusion, for example:

```bash
./deploy.sh usage --include-synthetic
./deploy.sh users:export --include-synthetic > users-with-demo.json
```

- Accounts: omit marked synthetic, deleted and super-admin accounts. Included synthetic user-export rows have `synthetic: true`; real rows have `false`.
- Teams/history: omit marked simulator teams and Demo teams, including their archived/history counts. Monthly votes also exclude marked synthetic voters in real teams. Historical anonymized votes remain countable.
- Workspaces: retain all existing workspace records, including empty ones; filter their user/team/monthly counts. Joining a Demo team does not make a real account synthetic.
- Sessions: count unexpired sessions, excluding marked synthetic users by default; this is a session count, not unique people or live board presence. Super-admin sessions remain operational sessions, and super-admin account totals are reported separately.
- Scope: `usage` prints whether demo/test data is included; `usage:json` exposes `includesSynthetic`. User/workspace exports remain JSON arrays; their scope follows the supplied command flag.

Classification uses stored `is_synthetic` markers and the explicit Demo-team flag, never names or email patterns. Older dormant synthetic accounts acquire markers when their seeder next runs. Reporting does not modify the database or infer classifications for unmarked legacy accounts.

CLI monthly totals use surviving history in the current UTC calendar month; Stats uses its own activity/round records and rolling periods. These are different reports and need not match. Synthetic inclusion does not affect Stats, backups, database exports, team history/import exports, quota enforcement or retention.
