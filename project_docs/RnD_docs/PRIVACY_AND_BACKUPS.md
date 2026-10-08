<!--
SPDX-FileCopyrightText: 2026 Atanas G. Rusev
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Trial privacy and app-managed backups

The hosted trial is a free FOSS evaluation service. Use synthetic or non-sensitive
example data. Account emails, names and identifiable votes remain personal data.
These safeguards support common privacy principles reflected in GDPR and US state
privacy laws: transparency, purpose limitation, minimisation, access controls,
retention limits and rights handling. This is not certification, legal advice or a
claim that every applicable GDPR, California or other US requirement is satisfied.
Applicability depends on the operator, users, processing and jurisdiction.


## Hosted demo versus self-hosting

The public hosted demo is one deployment of the complete FOSS application. Its
trial quotas and service policies are not licence restrictions or mandatory
settings for company installations. Self-hosters control their own data, users,
branding, integrations, backups and deployment policies, and may modify the source
under AGPL-3.0-or-later. The same voting features remain available without a paid
upgrade; practical capacity depends on the server and workload.

For a new ordinary self-hosted installation, leave hosted-trial mode disabled:

```toml
[public_trial]
enabled = false
mode = "disabled"
```

The hosted demo's two-workspace, two-team, ten-user and 80-monthly-reveal allowances
do not apply to ordinary self-hosted workspaces. Disabling trial mode is not a
migration of existing trial workspaces: stored trial workspaces can retain their
trial rules. Start with an ordinary self-hosted deployment or plan a migration.

App-managed backups are optional and disabled by default. Weekly snapshots,
three-copy retention and 21-day expiry are the demo's chosen defaults, not a
requirement to run the app. Operators may select another backup approach or change
the configurable schedule/age; changing the built-in three-copy cap requires code.
The demo operator's identity/contact and public-trial notice are not the company's
own privacy policy. Each self-hoster supplies policies appropriate to its service.
Normal authentication/team permissions, AGPL obligations and applicable law still
apply; configuration freedom is not a promise of unlimited hardware capacity.

## Public promises and their boundaries

- No sale of personal data, advertising use or profiling of workspace content.
- No routine inspection of workspace content. Necessary support, maintenance,
  security and legal access remain possible and must be restricted.
- Authorized workspace participants see shared content. Hosting/email providers
  and enabled integrations process necessary data; never promise “no third parties”.
- Owner **account deletion** purges owned trial workspaces, teams, voting history
  and comments from the live database. Collaborators keep their own accounts and
  unrelated workspaces. Archiving or leaving a team does not erase a workspace.
- Shared history elsewhere retains `Name (Deactivated)` and identifiers. This is
  personal data, not anonymisation. Free text and operational records may also
  refer to a person. A valid erasure request needs individual review and handling.
- Backups expire separately; exported/downloaded files are not remotely erased.
  No automatic inactive-workspace deletion deadline is currently implemented.

The instance serves `/public-trial/privacy`, `/public-trial/terms`,
`/public-trial/acceptable-use` and `/public-trial/export-cleanup`. Registration
acknowledges the privacy notice separately from accepting terms; it is not blanket
consent to every processing purpose. The privacy page reflects backup settings.

## Configuration: weekly backups, three copies, three weeks

In ignored `config/deployment.local.toml`, add exactly one section:

```toml
[backups]
enabled = true
interval_hours = 168
max_age_days = 21
```

The shipped template has `enabled = false`: an operator must explicitly opt in.
The other two defaults are 168 hours (one week) and 21 days (three weeks).
At most **three completed snapshots** are retained; this cap is fixed. Self-hosters
can change the interval and maximum age using the same three settings. Values must
be positive whole numbers up to 87600. Restart after editing. Platform
saves preserve these deployment-only settings.

No cron job, extra systemd unit or external scheduler is needed. The running API:

1. Checks on startup and once per minute; creates an initial or overdue snapshot.
2. Runs SQLite `VACUUM INTO` in a worker thread, including committed WAL data,
   then verifies SQLite integrity before publishing by rename.
3. Prevents overlapping jobs within the single application process. One app
   process must own the database/data directory.
4. Preserves up to three unexpired good copies if creating a replacement fails.
   Age expiry still runs before attempted backup creation, even on failure.
5. Removes interrupted `.partial` snapshots and retries failures on the next check.
   Failures emit a generic operator log without data or credentials.

Snapshots live at `DATA_DIR/backups/snapshot-<epoch-ms>-<uuid>.db`. In the packaged
stack this is `/app/apps/api/data/backups`, already inside the persistent Podman
volume. No volume or host scheduling change is required. Backup directories are
created with mode 0700 and completed snapshots with mode 0600. Do not expose this
path through a web server. Snapshots contain the complete database, including
password hashes, sessions and personal data, and are operator-only artifacts.

The scheduler does not run while the app is stopped or the feature is disabled.
Age expiry is therefore enforced at the next successful running check, not as an
unconditional wall-clock guarantee. Permissions/disk failures can also delay
cleanup. Check logs and snapshot status. Disabling the feature does not erase
existing copies. Backups on the same disk protect against some logical errors,
not disk loss; any off-server copies need their own documented retention.

## Enable and verify on the VPS

Run commands as the existing deployment user from the repository directory:

```bash
./deploy.sh update
./deploy.sh config:edit
# Set the [backups] values shown above; also fill [privacy] below.
./deploy.sh restart
./deploy.sh health
./deploy.sh public-health
./deploy.sh backup:auto:list
./deploy.sh logs
```

`backup:auto:list` reports the configured schedule, directory, snapshot names and
creation times. The first snapshot is asynchronous: repeat after it finishes.
Confirm one snapshot appears, survives restart and is not unnecessarily duplicated.
An already configured external backup job is independent; remove/adjust that job
if it duplicates the intended schedule. The app installs no external job.

Publish real instance details in the same TOML, then restart:

```toml
[privacy]
operator_name = "YOUR ACTUAL OPERATOR NAME"
contact_email = "YOUR PRIVATE PRIVACY REQUEST MAILBOX"
provider_details = "Actual hosting/email providers, processing countries and applicable transfer safeguards."
```

These example values must be replaced. Do not publish credentials or private
infrastructure addresses. Missing values produce an explicit incomplete-contact
notice; they do not silently invent an operator. Review the public privacy page
and test the mailbox before opening signup. Set `[app].base_url` to the actual
HTTPS URL. Keep production debug tools/codes disabled.

## Deployment archives are separate

`./deploy.sh backup` and pre-update backups create an integrity-checked SQLite
snapshot plus deployment configuration, allowed domains and managed branding.
They exclude app-managed snapshot history to avoid recursive growth. No running
app container means the command refuses an incomplete backup. Archives are
published after tar validation; after success older archives are automatically
pruned to the latest **three** (`BACKUP_PRUNE_KEEP` overrides this count).
This is a count limit, not a 21-day time guarantee. There is no daily archive job.

Existing archives can be reduced immediately:

```bash
BACKUP_PRUNE_KEEP=3 BACKUP_PRUNE_DRY_RUN=1 ./deploy.sh backup:prune
BACKUP_PRUNE_KEEP=3 ./deploy.sh backup:prune
./deploy.sh backup:list
```

Set a separate age policy for deployment archives, exported files, provider logs
and off-server copies; remove them when that deadline expires. The in-app scheduler
cannot erase host archives outside its volume. Do not advertise universal 21-day
erasure until those copies also have an enforced expiry procedure.

## Restore an automatic snapshot

Snapshots contain the SQLite database only, not config, allowed domains or branding.
Keep those deployment files separately. For the standard packaged database path,
export the chosen snapshot and wrap it in the existing restore archive format:

```bash
./deploy.sh backup:auto:list
# Replace the following filename with a name from that output.
snapshot_name='snapshot-REPLACE-WITH-ACTUAL-NAME.db'
app_container=$(podman ps --filter label=io.podman.compose.service=planning-poker --format '{{.ID}}')
# Ensure this identifies exactly the intended single container before proceeding.
restore_stage=$(mktemp -d)
chmod 700 "$restore_stage"
mkdir "$restore_stage/api-data"
podman cp "$app_container:/app/apps/api/data/backups/$snapshot_name" "$restore_stage/api-data/planning-poker.db"
chmod 600 "$restore_stage/api-data/planning-poker.db"
# With sqlite3 installed, this must report ok:
sqlite3 "$restore_stage/api-data/planning-poker.db" 'PRAGMA integrity_check;'
(umask 077; tar -C "$restore_stage" -czf "$restore_stage/restore.tar.gz" api-data)
./deploy.sh restore "$restore_stage/restore.tar.gz"
# After successful verification, remove this extra exported copy:
rm -rf "$restore_stage"
```

Use the actual data path/container for customized deployments. Do not delete the
persistent volume before copying out the chosen snapshot. Restore replaces the
app data volume, including current snapshot history; it leaves config unchanged
when the archive contains only `api-data`. Old sessions and old personal data may
return. Keep public access blocked during recovery, revoke restored sessions and
reapply all intervening erasures/restrictions from the private request register
before reopening service. The restore command restarts the app automatically;
there is no automatic deletion-replay feature. Rehearse with disposable data first.

## Contact channels

`[privacy].contact_email` is the current instance's privacy-request address. It is
shown in that instance's privacy notice, not used as a global project-support
address. Hosted-demo contact details are deployment-local; self-hosters supply
their own operator details. A dedicated Gmail/project mailbox is an option; identify
the correspondence provider separately from hosting and transactional SMTP.

The project's repository links to GitHub Discussions for general questions (when
enabled) and GitHub private vulnerability reporting for security issues (when
enabled). Public issues/discussions must not collect account data or privacy
requests. Private security advisories are for vulnerabilities, not a general
privacy inbox. A GitHub profile/repository link alone does not provide a confidential
request channel.

A dedicated project mailbox or alias can keep the operator's personal inbox out
of the public notice. A private contact form is another possible approach, but is
not currently implemented: the notice configuration presently uses `contact_email`.
A functioning contact route and accurate controller identity are needed; publishing
a name and city alone does not supply a way to exercise privacy rights. Identify
the legal entity actually operating the instance separately from its maintainer;
do not hard-code the demo owner's identity into company deployments.

## Lightweight operator procedure

Maintain a private processing/retention inventory covering accounts, memberships,
votes/comments/history, invitations, sessions/codes, IP and application/security
logs, cookies/localStorage, SMTP, enabled Jira, exports, backups and providers.
Record each purpose, legal basis, minimum fields, access, location, recipients and
retention. Review provider agreements and applicable transfer safeguards. Do not
assume a small/free service is automatically exempt from privacy requirements.

Use the configured private mailbox and a restricted request register: received
date, proportionate identity verification, scope, deadline, action/exception and
response. Handle access/copy, correction, erasure, restriction, objection and
portability where applicable; do not release other users' data or authentication
secrets. Team-history exports are not a complete personal-data access export.
GDPR requests normally require action within one month, with conditional extensions;
apply relevant state deadlines/appeals when applicable. Do not demand identity
documents by default or ask requesters to post publicly.

Investigate and contain incidents, preserve limited evidence, record risk and
notification decisions, and assess applicable authority/user notification duties
(including GDPR's applicable 72-hour authority deadline). Assign an operator owner,
review quarterly and whenever providers, data collection, integrations, retention
or jurisdictions change. Assess processing records, DPIA/DPO needs proportionately.

Before treating the baseline as operationally complete, verify the actual provider
facts, mailbox, deployed settings, retention/restore behavior and manual request
handling. Remaining technical review includes browser-readable session tokens,
HTTPS cookie configuration, debug/email logging and privacy-preserving erasure of
retained shared history. Public wording alone does not resolve these issues.

Authoritative references for operator assessment:

- [GDPR text, including rights, security and accountability](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng)
- [EDPB small-business guidance](https://www.edpb.europa.eu/sme_en)
- [California AG CCPA applicability and rights](https://www.oag.ca.gov/privacy/ccpa)
- [Texas AG privacy-law applicability](https://oag.state.tx.us/consumer-protection/file-consumer-complaint/consumer-privacy-rights/texas-data-privacy-and-security-act)
- [FTC privacy and security guidance](https://www.ftc.gov/business-guidance/privacy-security)
- [EU guidance on necessary cookies and consent](https://europa.eu/youreurope/business/growing/digitalising/online-privacy/index_en.htm)

## Implementation versus continuing operations

The implemented backup and notice features provide a practical baseline. Operators
continue to monitor privacy requests, verify mailbox delivery, inspect backup
health, enforce retention for separate archives/exports/logs, review provider
arrangements and rehearse restores with deletion replay. Completing a software
release does not mark those recurring duties finished or establish legal compliance.
Self-hosters choose their own deployment policies and contacts; the hosted demo's
settings are not mandatory for ordinary self-hosted installations.

## First-Party Usage Statistics

The application now collects limited activity and completed-round statistics for adoption and usage reporting in both hosted and self-hosted installations. It stores user/team identifiers with the last qualifying activity timestamp per UTC day, round/history issue identifiers, aggregate vote/eligible counts and voter identifiers. These are personal or potentially identifying records, not a claim of anonymous collection. No third-party analytics service or advertising tracker is added.

The built-in retention window is 31 days, with startup/minute cleanup while the app runs. Team admins receive only their team's aggregates; super-admins can view installation/workspace/team aggregates. Downloads contain team/workspace names and totals but no individual account list or vote content. Account deletion removes activity/voter identifiers, workspace purge removes its statistics, and retained shared round aggregates expire normally. Backups and downloaded exports require their separate retention handling. There is no separate statistics configuration switch in this release.

The rendered privacy notice and About text explain this processing. Operators must review their own notice and applicable privacy basis before deployment, including employee-use expectations; this functionality does not establish legal compliance or justify employee scoring.
