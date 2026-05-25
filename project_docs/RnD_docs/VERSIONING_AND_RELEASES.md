<!--
SPDX-FileCopyrightText: 2026 Atanas G. Rusev
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Versioning And Releases

Status: Alpha release policy.

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

The first public release was created from the clean public repository, not from the private-history repository.

Completed first-public-alpha sequence:

1. Sanitized public tree copied into the clean `opa-voting-tool` repository.
2. First public commit created.
3. Release checklist verification run.
4. First public alpha tag pushed as `v0.1.0`.
5. Future GitHub release notes should be created from `CHANGELOG.md`.

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

The first public tag is `v0.1.0`, but the current `./deploy.sh update` command still updates from the checked-out Git branch.

Normal operators should eventually prefer tagged releases or explicit release branches. The exact self-update/channel policy is deferred to the later operations phase, especially before adding automatic update checks.
