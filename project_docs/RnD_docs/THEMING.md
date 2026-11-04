<!--
SPDX-FileCopyrightText: 2026 Atanas G. Rusev
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Appearance And Themes

[Documentation index](../README.md) · [User guide](USAGE.md) · [Super-admin guide](SUPER_ADMIN_GUIDE.md)

## Choose your appearance

Open **Account → Appearance**, choose a theme, inspect the preview and press **Save appearance**. The choice follows your account across teams, workspaces and devices. Closing without saving leaves your current appearance unchanged. Select **Use platform default** and save to follow the administrator's choice again.

This works in self-hosted installations and the hosted trial, for regular users, team admins and the super-admin. It changes colours, not permissions or board layout. A team admin cannot choose a theme for other members.

## Set the platform default

The super-admin uses **Platform → Branding → Platform default theme**, then presses **Save settings**. Visitors and users following the platform default receive this theme. Personal choices take precedence. A platform change is delivered to connected clients; returning to the tab or reconnecting refreshes settings too.

For file-based setup, use the existing `[branding]` table in `config/deployment.local.toml`:

```toml
[branding]
default_theme_id = "opa-light"
```

Restart after editing the file. No setting is required to keep OpaVoting Light. An unknown stored platform ID falls back to `opa-light` with a configuration diagnostic; an unknown personal ID follows the current platform default. API saves reject unsupported IDs; a personal preference can also be `null` to inherit.

## Included palettes

| Group | Theme IDs |
| --- | --- |
| Light | `opa-light`, `github-light`, `one-light`, `solarized-light`, `catppuccin-latte`, `gruvbox-light` |
| Moderate / dim | `nord`, `github-dimmed`, `catppuccin-frappe`, `solarized-dark` |
| Dark | `github-dark`, `one-dark`, `dracula`, `monokai`, `tokyo-night`, `catppuccin-mocha`, `opa-midnight-aurora`, `opa-midnight-ember` |

These are OpaVoting UI adaptations of familiar developer palettes, with semantic colours adjusted for readability. They are not official integrations or endorsements. Source references are recorded in the [palette registry](../../packages/shared/src/themes.ts). Midnight Aurora and Midnight Ember are original OpaVoting adaptations; third-party reference graphics are not distributed.

OpaVoting Light retains its blue gradient and layout. Primary labels now use dark ink (`#07172b`) instead of white to improve contrast on that gradient; essential control boundaries and opaque text surfaces are clearer. Its configured background-art opacity is preserved.

Existing primary/accent/surface/text branding colours customize **OpaVoting Light** only; other themes use their coordinated palettes. Stored branding choices remain available when returning to OpaVoting Light. Logos, uploaded images and avatar identity colours retain their original artwork. Extreme custom branding colours and images should be reviewed for readability.

Brand colours accept hexadecimal, RGB/HSL and CSS named colours. Legacy transparency is normalized against the original white background, and foreground/gradient colours are adjusted for readability. Invalid legacy colour strings use safe defaults with a startup diagnostic; loading them does not rewrite the stored configuration.

## Storage and startup

The platform default lives in deployment configuration. A nullable account preference lives in SQLite: `null` means inherit. Account deletion clears that preference. Whole-database snapshots preserve personal preferences; older databases receive the column automatically. The platform default is restored with the deployment configuration, not a database-only import. Team-history exports do not contain theme preferences.

With a valid session cookie, the server includes the account's selected palette in the initial application HTML using a read-only session lookup. Anonymous or invalid-cookie entries use the platform default. Application HTML is served `private, no-store`. Public policy pages and Jira result pages always use the platform default. Appearance-related browser storage carries an account-scoped update hint for other tabs; it is not authoritative and is cleared on sign-out. Existing authentication and other interface storage continue to serve their separate purposes.

## Implementation and verification

One shared TypeScript registry defines all palette data and semantic tokens. A document-level controller sets CSS custom properties on `<html>` only when appearance changes. React components, portals and native inputs inherit them; voting and room-state WebSocket updates do not compute colours. No theme library or additional runtime dependency is required.

Run the separate browser suite after appearance/UI changes:

```bash
./dev.sh test:e2e:themes
```

It uses disposable local databases, serialized platform-default changes, all 18 palettes in both modes at phone/desktop sizes, and deeper Light/Nord/Midnight Ember checks. It checks real workflows, first paint, native controls, console errors, overflow and rendered contrast. See [responsive testing](RESPONSIVE_TESTING.md) for the wider viewport and input matrix. Ordinary unit and API tests cover persistence, migration, validation, preference lifecycle and avoiding unnecessary team broadcasts. Browser emulation does not replace physical-device acceptance.
