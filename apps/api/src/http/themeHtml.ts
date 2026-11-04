// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import { isThemeId, resolveTheme, themeStyle, type BrandingManifest } from "@planning-poker/shared";

// Only the catalogue resolver may produce CSS. Saved branding strings and
// account/session details must never be interpolated into delivered markup.
export function applyInitialTheme(template: string, branding: BrandingManifest, personalThemeId?: unknown): string {
  const platform = resolveTheme(branding.defaultThemeId, branding.palette);
  const personal = isThemeId(personalThemeId);
  const theme = personal ? resolveTheme(personalThemeId, branding.palette) : platform;
  const attributes = `data-theme="${theme.id}" data-theme-default="${platform.id}" data-theme-source="${personal ? "personal" : "platform"}" style="color-scheme:${theme.colorScheme};${themeStyle(theme)}"`;
  return template
    .replace(/<html([^>]*)>/i, `<html$1 ${attributes}>`)
    .replace(/<\/head>/i, `<style id="initial-theme">
      html, body { background-color: var(--theme-page); color: var(--theme-text); }
      @media print { html, body { color-scheme: light !important; color: #111 !important; background: white !important; } }
    </style></head>`);
}
