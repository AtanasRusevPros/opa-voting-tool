// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import { DEFAULT_THEME_ID, isThemeId, resolveTheme, type BrandingManifest, type ThemeId } from "@planning-poker/shared";

export const APPEARANCE_HINT_KEY = "planning-poker:appearance";

type ThemeUser = { id: string; themeId?: ThemeId | null };
type HintStorage = Pick<Storage, "setItem" | "removeItem">;

/** One document-level owner. Storage events request a server refresh; hints never select a theme. */
export function createThemeController(root: HTMLElement, storage?: HintStorage) {
  let platformId: ThemeId = isThemeId(root.dataset.themeDefault) ? root.dataset.themeDefault : DEFAULT_THEME_ID;
  let branding: BrandingManifest | undefined;
  let user: ThemeUser | null | undefined;
  let lastApplied: ReturnType<typeof resolveTheme> | undefined;

  const clearHint = () => {
    try { storage?.removeItem(APPEARANCE_HINT_KEY); } catch { /* Storage is optional. */ }
  };
  const writeTheme = (theme: ReturnType<typeof resolveTheme>) => {
    lastApplied = theme;
    root.dataset.theme = theme.id;
    root.style.colorScheme = theme.colorScheme;
    for (const [name, value] of Object.entries(theme.tokens)) root.style.setProperty(name, value);
    root.style.setProperty("--brand-primary-action", theme.tokens["--theme-action"]);
    root.style.setProperty("--brand-accent-highlight", theme.tokens["--theme-accent"] ?? theme.tokens["--theme-action"]);
    root.style.setProperty("--brand-surface-tint", theme.tokens["--theme-panel"]);
    root.style.setProperty("--brand-text-emphasis", theme.tokens["--theme-text"]);
  };
  // Vite has no injected HTML tokens. Its entry must remain usable if the API is offline.
  if (!isThemeId(root.dataset.theme)) writeTheme(resolveTheme(platformId));
  const apply = () => {
    // The HTML may contain a cookie-selected theme. Initial null React state is not a sign-out.
    if (user === undefined) return;
    const id = isThemeId(user?.themeId) ? user.themeId : platformId;
    root.dataset.themeDefault = platformId;
    root.dataset.themeSource = isThemeId(user?.themeId) ? "personal" : "platform";
    // Keep server-normalized legacy colors until bootstrap supplies the branding palette.
    if (!branding && root.dataset.theme === id) return;
    const theme = resolveTheme(id, branding?.palette);
    if (lastApplied === theme) return;
    writeTheme(theme);
  };

  return {
    setBranding(next: BrandingManifest) {
      branding = next;
      platformId = isThemeId(next.defaultThemeId) ? next.defaultThemeId : DEFAULT_THEME_ID;
      root.style.setProperty("--brand-background-opacity", String(Math.max(0, Math.min(1, next.backgroundOpacity))));
      apply();
    },
    setUser(next: ThemeUser | null) {
      if (next === null || user?.id !== next.id) clearHint();
      user = next;
      apply();
    },
    publishPreference(next: ThemeUser) {
      this.setUser(next);
      try {
        storage?.setItem(APPEARANCE_HINT_KEY, JSON.stringify({ userId: next.id, themeId: isThemeId(next.themeId) ? next.themeId : null, changedAt: Date.now() }));
      } catch { /* Saving the server preference must work without localStorage. */ }
    },
    shouldRefresh(event: Pick<StorageEvent, "key" | "newValue">): boolean {
      if (event.key !== APPEARANCE_HINT_KEY || !event.newValue || !user) return false;
      try {
        const hint = JSON.parse(event.newValue) as { userId?: unknown; themeId?: unknown };
        return hint.userId === user.id && (hint.themeId === null || isThemeId(hint.themeId));
      } catch { return false; }
    }
  };
}
