<!--
SPDX-FileCopyrightText: 2026 Atanas G. Rusev
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Versioning And Releases

Status: Alpha policy for the first public repository.

## Current Version

The current project version is `0.1.0`.

The root `package.json` version is the source of truth for the repository. Workspace package versions should stay aligned unless a future package-publishing strategy intentionally changes that rule.

Operators and developers can check the checked-out version with:

```bash
./dev.sh version
./deploy.sh version
```

Both commands print the project version and current Git commit. This keeps deployed operators from guessing which checkout is running.

## Public Release Strategy

The first public release should be created from the clean public repository, not from the private-history repository.

Recommended launch sequence:

1. Copy the sanitized public tree into the new clean `opa-voting-tool` repository.
2. Create the first public commit.
3. Run the release checklist verification.
4. Tag the first public alpha release as `v0.1.0`.
5. Create GitHub release notes from `CHANGELOG.md`.

Do not create public release tags in the private-history repository.

## Version Format

Use semantic versioning:

```text
MAJOR.MINOR.PATCH
```

During alpha, use `0.x.y`:

- `0.MINOR.0` for meaningful alpha feature/release milestones.
- `0.MINOR.PATCH` for bug fixes, documentation fixes, deployment fixes, and security fixes on that alpha line.
- `1.0.0` only when the project has a stable public support policy and the maintainer is ready to treat behavior, deployment expectations, and upgrade notes as stable enough for normal users.

Git tags should use a `v` prefix, for example:

```text
v0.1.0
v0.1.1
v0.2.0
```

## Changelog And Release Notes

Keep `CHANGELOG.md` as the human-readable summary.

Before each public tag:

1. Move relevant `Unreleased` entries under the release version and date.
2. Confirm README, USAGE, deployment runbook, SECURITY, and benchmark claims still match the tagged behavior.
3. Confirm `./dev.sh version` and `./deploy.sh version` print the intended version.
4. Create GitHub release notes from the changelog summary.

## Deployment Updates

Before public release tags exist, `./deploy.sh update` updates from the current Git branch.

After public releases exist, normal operators should prefer tagged releases or explicit release branches. The exact self-update/channel policy is deferred to the later operations phase, especially before adding automatic update checks.
