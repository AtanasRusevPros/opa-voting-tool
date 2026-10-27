<!--
SPDX-FileCopyrightText: 2026 Atanas G. Rusev
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Security Policy

## Supported Versions

Security fixes are provided on the current `main` branch, now version 1.0.0. Operators should keep their deployment current; separate maintenance branches are not currently provided.

Older commits, forks, and unmaintained deployments are not supported by this project.

## Reporting A Vulnerability

Do not report security vulnerabilities in public GitHub issues.

Use GitHub private vulnerability reporting when it is enabled for the public repository. If private vulnerability reporting is not available yet, open a non-sensitive GitHub Discussion or issue asking for a private maintainer contact path without disclosing vulnerability details.

Please include, privately:

- Affected version, commit, or deployment path.
- Clear reproduction steps.
- Expected and observed behavior.
- Potential impact.
- Whether the issue affects authentication, team isolation, deployment secrets, WebSocket behavior, persistence, or public test-server access.

## Security Expectations For Operators

- Configure explicit super-admin credentials in ignored `config/deployment.local.toml` before starting any shared or public deployment. The repository does not ship usable default super-admin credentials.
- Keep the app behind HTTPS for internet-facing deployments.
- Keep the internal app port private to the host or reverse proxy.
- Review `config/allowed-domains.txt` and `config/deployment.local.toml` before first use.
- Keep backups of app data and deployment configuration.
- Do not expose simulator/debug tooling as production functionality.

## Public Issues Are Not For Security Reports

Public issues are welcome for ordinary bugs, documentation, deployment questions, feature requests, and performance regressions. Security vulnerabilities should use the private reporting path above.
