<!--
SPDX-FileCopyrightText: 2026 Atanas G. Rusev
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# ARCHITECTURE

Created: 2026-04-03 10:35 EEST

## System Shape

The system is a structured full-stack repository with:
- React frontend in `apps/web`
- Express + WebSocket API in `apps/api`
- Node-based simulator sidecar in `apps/simulator`
- SQLite persistence embedded into the API runtime
- shared deck definitions and contracts in `packages/shared`
- deployment-editable config/assets in `config`, with fallback public branding assets in `apps/web/public/branding`
- Podman-first container workflow in `infra/containers`

## Code Structure

- The frontend app shell remains in [`apps/web/src/App.tsx`](../../apps/web/src/App.tsx), but the coarse UI surfaces now live under [`apps/web/src/app`](../../apps/web/src/app). That folder holds the login, chooser, bell popup, account settings, platform settings, team directory, history rail, board-support UI, icons, and UI-local helper modules so the app shell can stay focused on orchestration and network/state ownership.
- The API entrypoint remains [`apps/api/src/server.ts`](../../apps/api/src/server.ts), but request schemas, shared auth/access middleware, and the route-registration module now live under [`apps/api/src/http`](../../apps/api/src/http). This keeps runtime composition in the entrypoint while moving validation, reusable request guards, and the full HTTP surface out of the main file.
- The repository facade remains [`apps/api/src/repository.ts`](../../apps/api/src/repository.ts). Pure helpers, base schema bootstrap SQL, notification/action-history queries, and history/comment queries now live under [`apps/api/src/repository`](../../apps/api/src/repository), while permission-sensitive write paths and the public repository API stay in the facade for easier behavior tracing.
- Team history is now page-based at the API boundary: the board loads the newest `20` history entries first, can page older entries incrementally, and can query a separate paginated search surface without forcing a full team-history hydrate on every board open.

## Core Runtime Flow

1. A first-time or recovery user requests a 16-digit code with an allowlisted email domain.
2. The API stores the temporary code and either emails it through SMTP or logs it in development.
3. The user verifies the code, sets a password, and receives a long-lived session cookie.
4. Returning users can later sign in directly with email + password.
5. Signed-in users can later change their password and personal UI preferences from the shared chooser/board `Account settings` modal.
6. If password sign-in fails and SMTP/debug-code delivery is available, the login screen exposes a dedicated `Forgot password` path that reuses the code-verification flow to set a new password.
7. If SMTP is intentionally unavailable, the login screen does not pretend reset delivery exists and instead directs the user to their team admin or the super-admin for a manually generated replacement password.
8. The user creates or joins one or more teams.
9. Each team has one live planning room at a time plus persistent history.
10. Voting and reveal updates fan out through WebSockets to every connected client for the team.
11. Routine successful board actions no longer force a full board-state reload. The acting user now sees an immediate local vote selection, create/reveal/vote-again use authoritative round payloads plus the normal websocket flow, and `GET /api/teams/:teamId/state` remains the recovery/resync path for board entry, websocket reconnect, and explicit error/conflict fallback.
12. Routine active voting now uses a dedicated `team:round-vote` websocket contract built from a lightweight vote-summary snapshot instead of reusing the richer reveal/transition payload for every vote.
13. The reveal hot path still stays on the lighter `team:round` websocket contract rather than forcing a full `team:update` payload for every connected client, and the frontend applies the matching round-only history/pending-issue merge locally so that correctness stays aligned with the leaner broadcast.
14. Active-team live sync now also carries explicit `roundVersion` and `voteVersion` state. Routine votes update an in-memory team live-sync model, mark the team dirty, and flush `team:round-vote` deltas on a short cadence only when something actually changed.
15. Any client that refreshes, reconnects, lacks current board state, or detects a `fromVoteVersion` / `roundVersion` gap does not guess; it immediately repairs through `GET /api/teams/:teamId/state` and resumes websocket-first live sync from the authoritative snapshot.
16. Revealed rounds are written to `history_entries`, stay visible on reload, and are returned through paginated history/search routes.
17. Team history can be exported/imported as JSON packages, with imported comments preserved as immutable historical records.
18. Super-admins can export/import whole SQLite snapshots from the in-app `Platform` surface.
19. Super-admins can edit deployment, branding, SMTP, demo-mode, and Jira Cloud connection settings from the in-app `Platform` surface backed by the deployment TOML file; the People list supports paged search plus recent/oldest and A-Z/Z-A sorting.
20. Team-admins and super-admins can save a team Jira source (`Project key + optional JQL`) from the team `Import/export` tab, import Jira issues into a team-scoped pending queue, and load a pending Jira issue into a round using both the issue key and title.
21. Minimum participation is evaluated against the current live board participants at reveal/re-evaluation time rather than all team members, so offline members do not block active-room decisions.
22. Team-admins and super-admins can also save a minimum-vote-percentage rule per team; reveal still computes the real average, but when the enabled threshold is not met, the live board and history store a gated result with voted vs not-voted counts instead of exposing the final average.

## Login Destination And Directory Presence

`users.open_last_team_on_login` is an additive SQLite preference, defaulting to 1 for new and existing accounts. Auth/session summaries expose `openLastTeamOnLogin`; authenticated `PATCH /api/auth/preferences` validates and persists the boolean for the current account. On initial session resolution, false opens the chooser unless an accessible explicit team link is present. Routine session refreshes and saving the setting do not interrupt an open board. Existing dedicated super-admin entry behavior is preserved.

A chooser-open member directory uses an authenticated `scope=directory` WebSocket for its team. It sends small `directory:update` invalidations on membership/full-state or board-presence changes; the client refetches the permission-checked REST directory with one request in flight and a trailing refresh if needed. Board-open directories reuse board state. Directory observers are separate from board sockets and never enter active participant/quorum counts. Membership is checked at connection and notification time; revoked observers are closed. Closing the panel cleans up the subscription; reconnect refreshes the directory.

## Account Deletion Flow

1. The API builds a deletion preview before mutation so destructive effects are explicit before confirmation.
2. Self-deletion requires the current password plus `DELETE MY ACCOUNT`; super-admin deletion requires the selected account's exact email.
3. The configured super-admin account is protected from every deletion path.
4. Normal deactivation invalidates sessions, removes active memberships/state, frees the original email, and preserves shared history as `Name (Deactivated)` without the old email.
5. The database keeps an internal tombstone user for retained foreign-key references; user-facing history never exposes the internal tombstone email.
6. Existing backup archives and previous exports remain unchanged and may still contain older account data.

## SMTP-Free Onboarding Flow

1. A team-admin adds a new allowlisted email to a team.
2. If SMTP is configured, the invitation can be delivered by email.
3. If SMTP is not configured, the repository still creates the user with an initial password.
4. The API returns delivery metadata marking that invite as `manual-share`.
5. The frontend reveals the generated password once to the team-admin together with a secure-save reminder so the credentials can be delivered manually through an approved outside channel.

## SMTP-Free Password Recovery Flow

1. A team-admin opens the team member directory and resets a member password.
2. The repository generates a new replacement password and updates the stored password hash immediately.
3. If SMTP is not configured, the API returns delivery metadata marking that reset as `manual-share`.
4. The frontend reveals the replacement password once together with the same secure-save reminder used for onboarding.
5. The admin is responsible for sending that replacement password through the customer-approved outside channel.

## Team Permalink Flow

1. Every board can produce a shareable link based on the existing `teamId` route.
2. If a current member opens that link, the app opens the requested board directly.
3. If an authenticated non-member opens that link, the app preserves the target team while the user requests access.
4. If a logged-out user opens that link, the target team is preserved through sign-in or first-time onboarding.
5. Once approval completes, the app returns the user directly to the originally requested board whenever possible.

## Simulator Runtime Flow

1. A dev-only simulator bootstrap call ensures deterministic simulator users and demo teams exist.
2. A simulator-only login path issues sessions for seeded `sim.bot.*` users when simulator mode is enabled.
3. The simulator keeps those bot users connected to their assigned teams through the same WebSocket channel the real app uses.
4. When a round becomes active, each bot independently decides whether to vote and then submits a random card from the current team deck.
5. Bots never reveal, create rounds, or change teams; they only provide live occupancy and voting behavior for observation and later load-style validation.
6. Normal product team discovery now treats the simulator as a live runtime dependency rather than a static seed source: `Sim Team ...` rooms are visible only while the simulator sidecar is actively heartbeating, they disappear again when that runtime signal goes stale, and the server now reconciles those online/offline edges by refreshing chooser state and closing no-longer-valid simulator room sockets so connected clients converge without a manual reset.

## Demo Mode Runtime Flow

1. The super-admin can enable demo mode from the in-app `Platform` surface.
2. Enabling demo mode synchronizes seeded `Demo Team` rooms and `Demo ###` synthetic participants through the existing simulator-sidecar model rather than heavyweight browser workers.
3. Demo rooms are visible only to the super-admin and remain hidden from regular users.
4. While enabled, the sidecar provides synthetic occupancy and voting activity inside those demo rooms using the normal team/round/vote pipeline.
5. When disabled, demo mode becomes dormant: demo rooms disappear from the normal UI and the simulation workload stops instead of idling in the background.

Operator workflow and command usage for the simulator live in [USAGE.md](../../project_docs/RnD_docs/USAGE.md) and [README.md](../../README.md).

## Persistence Model

SQLite tables:
- `users`
- `login_codes`
- `sessions`
- `workspaces`
- `workspace_memberships`
- `teams`
- `team_memberships`
- `user_team_preferences`
- `team_join_requests`
- `platform_access_requests`
- `notifications`
- `action_history`
- `rounds`
- `votes`
- `history_entries`
- `history_comments`
- `team_pending_issues`

Behavior choices:
- session TTL is rolling and refreshed on activity
- users now persist a global `boardShortcutsEnabled` preference that disables only board-action shortcuts
- `user_team_preferences` stores personal history-time-popup settings per user and team. A missing row or nullable `historyTimezoneKeys` means the user follows that team's default timezone list, while a stored list overrides only that team.
- users persist a password hash for returning email + password sign-in
- team deck selection is stored at team level
- new teams receive their default history-time-popup timezone list from `[history_popup].timezone_keys` in the deployment config, and teams persist that default so team-admin changes are inherited by users without a personal override
- team names are treated as unique within their workspace after trim/case normalization, including archived teams, while public slugs remain unique enough for direct board links
- self-hosted/default deployments use a default workspace
- teams now persist `minimumVotePercentEnabled` and `minimumVotePercent` as part of their settings
- a new round archives the previous live round for the same team
- history comments store a persistent `author_signature` in `Name (email)` format so exported/imported history does not depend on the original live user row
- imported comments are marked immutable at storage level and stay read-only in the UI/API
- duplicate issue titles are valid; history identity is the database/history id plus team, round, timestamp, and import metadata rather than the title string
- “vote again” creates a replacement live round and overwrites that history entry only when the replacement round is fully revealed
- team pending issues currently support Jira Cloud as an external source, keyed by the upstream Jira issue id so refreshes update instead of duplicating
- minimum-participation-blocked reveal attempts keep the active round open, update quorum-gating metadata on that round, and do not create history. When enough additional votes arrive, the same round is revealed and history is written once.
- revealed history entries persist quorum-gating metadata (`quorum_blocked`, voted count, not-voted count) for imported or historical records that need to render a gated state

## Branding And Config

- Allowed login domains come from [`config/allowed-domains.txt`](../../config/allowed-domains.txt).
- Runtime deployment config prefers ignored `config/deployment.local.toml` when present, then falls back to tracked [`config/deployment.toml`](../../config/deployment.toml).
- Deploy/operator keep-alive config prefers ignored `config/deploy.local.toml` when present, then falls back to tracked [`config/deploy.toml`](../../config/deploy.toml).
- `[history_popup].timezone_keys` in that config is parsed as the global default timezone list for newly created teams.
- Super-admin-managed branding uploads live in [`config/managed-branding`](../../config/managed-branding).
- The shipped fallback branding assets still live under [`apps/web/public/branding`](../../apps/web/public/branding).
- The in-app `Platform` surface edits admin, SMTP, branding, palette, footer, and demo-mode settings against that deployment config.
- The same deployment config now also stores Jira Cloud OAuth client credentials plus the currently connected site/token metadata for the single global Jira Cloud binding.
- SVG is preferred for crisp scaling; PNG is supported for raster replacements.
- Production email uses generic SMTP settings from the deployment config when present, and otherwise falls back to development logging.
- Simulator mode is still controlled separately by `SIMULATOR_MODE_ENABLED` for dev-only seeded simulator users and must remain disabled in production unless intentionally needed for local simulator workflows.
- The shipped compose/deployment defaults keep `SIMULATOR_MODE_ENABLED=0`; this does not affect the separate super-admin demo mode, which is implemented server-side through `DemoModeManager`.

## Runtime And Container Decisions

- The packaged stack is aligned to Podman-first operation for rootless-friendly local deployment.
- `infra/containers/compose.yaml` is intended to be run through `podman-compose` or `podman compose`.
- `deploy.sh` is the deployed/self-hosted server operator wrapper around the compose stack, Caddy reload/status commands, health checks, logs, diagnostics, backups, and release updates.
- The same deployed helper now also owns automatic startup/watchdog installation, bounded incident evidence, and keep-alive status reporting while intentionally staying outside the in-app product UI.
- Local dependency, build, packaged stack build, test, and simulator commands require Node.js `22.22.2`, pinned in [`.nvmrc`](../../.nvmrc), on both Linux and macOS. Workspace packages declare the supported range as `node >=22 <23`.
- `dev.sh` sources nvm when available and runs `nvm use` before dependency, build, `stack:up`, test, and simulator commands, then verifies that the resulting active local Node runtime is Node 22 before continuing.
- The packaged container image is based on the Node 22 Alpine line so local and container runtime expectations stay aligned.
- V1 keeps Node's built-in SQLite runtime to avoid native dependency builds in the bootstrap phase; this is the main reason the local Node floor is Node 22.

## Performance Notes

- The design target is up to 200 concurrent users in one planning session.
- The API keeps the live state simple and team-scoped to reduce fanout cost.
- SQLite is appropriate for the requested v1 single-container deployment and modest write volume.
- The normal vote path is now intentionally lighter than the older Phase 7 shape: the vote endpoint returns a minimal acknowledgement instead of a full reread round snapshot, and the frontend relies on local optimistic selection plus websocket/authoritative-round reconciliation before falling back to `GET /state` only for entry, reconnect, or recovery.
- The realtime scheduler now separates routine voting from reveal/transition work instead of treating all round traffic as one class. `team:round-vote` and `team:round` each use their own ready-queue selection with age/recipient-cost weighting, while starvation escape still wins first so no room can wait forever behind others.
- Routine vote fanout now uses a lightweight repository vote-summary snapshot and reuses serialized payloads per viewer-vote bucket instead of rebuilding a fully personalized message body for every socket. That lowers steady-state CPU and payload cost without exposing hidden votes.
- Phase 11 adds a higher-leverage step on top of that lane split: active teams now keep a hot in-memory live-sync model, routine votes batch into short dirty-team flushes, and the vote lane emits only versioned deltas (`changedUserIds` plus live-sync versions) instead of broader repeated vote snapshots. Clients that miss a version or reconnect repair through a full GET rather than trying to infer missing state.
- The active-room engine introduced during Phase 12 now pushes that further: live board reads come from a per-team room snapshot manager, routine vote deltas use indexes into the exact transmitted `teamMembers` array instead of repeated user ids, and round start/reveal transitions can update the in-memory room snapshot and checkpoint state incrementally instead of always forcing a full repository hydrate first.
- Reveal convergence is still intentionally optimized by keeping reveal traffic on the round channel. That substantially improves many-room reveal fanout, but it also means the round payload remains richer than the routine vote lane because history/reveal context stays with the transition message.
- Capacity reporting now distinguishes `broadcast.team.vote.*` from `broadcast.team.round.*`, including separate critical-path slices for vote-lane queue wait, reveal-lane queue wait, payload bytes, payload-build time, delta-user count, and version-span size. This makes later tuning decisions auditable instead of mixing routine voting and reveal behavior into one number.
- Frontend board rendering is now guarded with targeted perf tests so a peer vote changes only the affected participant tile subtree rather than forcing a whole-board rerender.
- The highest-risk area for scale is realtime broadcast fanout, so websocket/session changes should be evaluated carefully.

### Hosted-trial membership and usage

Normal users may belong to two public-trial workspaces; the existing signup flow
continues to reject an additional signup for an account already in a trial workspace.
Workspace-scoped reads remain isolated. Collaborator workspace leave atomically
removes team memberships, join requests, preferences and active votes, followed by
workspace membership removal and live-access revocation. Owners must use the existing
account deletion/purge flow. Saved shared history is preserved by collaborator leave.

The default monthly quota is 80 actual revealed rounds, counted from persisted round
reveal timestamps in the UTC calendar month. Vote-again reveals count independently
of the history snapshot they replace. Creation, vote submission and reveal enforce
the quota, returning actionable quota errors. WebSocket connection and broadcast paths
check membership, and a revoked socket closes with policy code 1008 so the client
clears the board and returns to the chooser.

Enabled hosted-trial configuration migrates the legacy persisted monthly allowance of 40 to 80 at startup. This changes the allowed total without resetting stored usage. Other custom quotas and disabled-trial configurations are preserved.


### Hosted-trial workspace names

Trial signup derives the initial workspace label from the owner's display name.
A transactional startup migration, recorded in `workspace_name_migrations`, updates
only public-trial workspaces still named `My First Workspace`; a later intentional
reuse of that label is preserved. IDs remain authoritative and labels need not be unique.

The authenticated `PATCH /api/workspaces/:workspaceId` route accepts a trimmed
1–80-character name only when trial mode is enabled. The repository update requires
a public-trial workspace whose creator is the requesting user; team-admin privileges
and collaborator membership do not grant rename access. The update changes only name
and updated-at fields and triggers chooser refresh. Account → Workspaces provides owner-only
Save/Cancel and feedback; self-hosted mode does not expose this management UI.

## Login entry and access-request policy

The public login is `/`; the separate super-admin form is served at `/admin` (also `/admin/`) with `X-Robots-Tag: noindex`. Successful authentication uses the existing session flow and returns to the normal app route. The dedicated URL changes presentation, not authorization boundaries.

Deployment TOML `[auth].access_requests_enabled` defaults to true. Bootstrap exposes the effective boolean; false hides Request access and makes the API reject new requests with 403 before storing anything. It does not gate trial signup or invitations. The setting survives unrelated platform configuration saves. Email-based recovery and trial actions require a valid-looking email in the UI; server-side validation remains authoritative.


Team membership summaries expose the server-computed `canLeave` capability. The existing team aggregate counts active, non-super-admin team admins; chooser/board controls use this capability for leave guidance. The leave operation independently rechecks for a replacement team admin before deleting membership, so a stale client cannot bypass sole-admin protection.


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

## Scoped Usage Statistics

`statistics_metadata` records coverage start; `statistics_activity` stores the latest qualifying timestamp per user/team/UTC day; `statistics_rounds` stores immutable reveal aggregates keyed by round ID and linked to the history issue ID; `statistics_voters` supports unique voters. Re-votes retain the history ID but create another round. No issue text, email or vote values are duplicated. New explicit `is_synthetic` markers are set by demo/simulator seed paths. No name-prefix classifier or activity backfill is used.

Board entry posts a membership-checked activity event; successful team mutations record activity without counting session refreshes, sockets or heartbeats as usage. Statistics have no automatic age-based expiry in either deployment mode; startup, report reads and minute notifications do not prune them. Responses and exports include `retentionDays: null`. The singleton `statistics_totals` stores only completed-round and vote counters, seeded once from surviving statistics and incremented transactionally by an INSERT trigger. It has no person/team/workspace/issue identifiers or event timestamps and survives workspace purge. `lifetimeTotals` appears only on unfiltered platform reports; filtered/team reports return null. Previously expired/deleted usage cannot be reconstructed. Foreign-key cascades handle team/workspace deletion; a user-deactivation trigger deletes activity/voter identifiers while retained round aggregates follow the deployment retention policy. Indexed time/team reads and one-pass aggregation bound the working set to 30 days.

Authenticated GET `/api/admin/statistics` is super-admin-only; GET `/api/teams/:teamId/statistics` requires that team's admin permission (archived teams allowed). `days` accepts 1, 7 or 30; platform `workspaceId` narrows the scope. Responses are no-store. Reads use a bounded serial worker queue, coalesce matching requests and cache a snapshot for at most one second from request start. SQLite aggregation runs in a separate read-only worker transaction so large reports do not block realtime voting; permission is checked again after the queued read. The UI exports the same snapshot locally as JSON.

Authenticated `scope=statistics` WebSockets are read-only, authorized at connection and before notifications. Changes invalidate views at about one-second cadence; minute maintenance also refreshes rolling windows. Board/chooser sockets provide deduplicated live presence; observer sockets never count as board participants. A ping/pong heartbeat expires unresponsive connections within approximately 60 seconds. Aggregate API data contains no individual-user drill-down; team and workspace names remain potentially identifying. Statistics add no third-party trackers. Current policies and About text disclose collection; operator notices remain deployment-specific.


## Inline Issue Title Corrections

`PATCH /api/teams/:teamId/rounds/:itemId/title` permits the current round proposer (still a member), team admin or super-admin. `PATCH /api/teams/:teamId/history/:itemId/title` remains admin-only. Both require a non-archived team. Nullable `rounds.proposed_by` is set from the authenticated user for new rounds, pending issues and re-votes, preserved on timer restart and cleared by account deletion; legacy rows have no inferred owner. Payloads contain `title` (trimmed, 1–255 characters) and `expectedTitle`; stale edits receive HTTP 409. Current-round IDs and saved-entry IDs are checked within the requested team. Title mutations use one SQLite transaction, preserve voting/timer/result fields, and do not reveal vote values in their response.

First reveal retains the saved issue ID in the round's existing `revote_history_entry_id` field so subsequent title corrections synchronize the current board and saved item without matching titles. Legacy revealed rounds can resolve their saved item using the team, exact completion timestamp and original title. Imported history remains editable without a live round. Corrections do not write to Jira or change quota/completed-round totals; successful team edits still qualify as user activity for usage statistics.

Normal room invalidation updates current viewers; the permission-checked `team:history-title` event also patches already loaded older/search results by ID. Completed searches refresh when the board socket opens, repairing corrections missed during the initial handshake or reconnection. The frontend updates title fields without replacing newer vote state. The shared inline editor retains the displayed text as its size placeholder and overlays a contained, scrollable textarea. It handles Enter/blur save, Escape, IME composition, duplicate-submit prevention, validation and visible failure/conflict recovery.


Vote-status index invariant: `changedMemberIndexes` must address the room snapshot's original membership order (currently admins first, then repository name ordering). The server maintains a separate wire-index map; alphabetically sorted vote display order is never used to encode those positions. Both copied and reference delta paths use that same map, rebuilt on room hydration. Clients apply indexes to their matching roster and retain existing round/version-gap repair. Tests include reversed admin/name ordering, case/Unicode/duplicate names, batched votes, optimistic self-votes, replacement votes, two-browser reveal and reload. The correction changes no persisted vote ownership or protocol shape.

Workspace owners can read GET `/api/workspaces/:workspaceId/statistics` and observe `scope=statistics&workspaceId=...`. Ownership is checked before and after worker reads and on notifications; mixed team/workspace socket scopes are rejected. The route forces its path scope regardless of query overrides, excludes platform-only counts, and reuses the bounded statistics reader. Account renders an owner-only Workspace stats section with independent period/export controls. See [metric definitions](STATISTICS_GUIDE.md).
