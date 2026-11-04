// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { DEFAULT_THEME_ID, THEME_IDS, THEMES, isThemeId, normalizeThemeColor, resolveTheme, themeStyle, type ThemeDefinition } from "@planning-poker/shared";
import stylesheet from "./styles.css?raw";

function channels(color: string): number[] {
  expect(color).toMatch(/^#[\da-f]{6}$/i);
  return [1, 3, 5].map((start) => Number.parseInt(color.slice(start, start + 2), 16));
}
function contrast(first: string, second: string): number {
  const luminance = (color: string) => channels(color).map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  const a = luminance(first), b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
function interpolate(first: string, second: string, amount: number): string {
  const a = channels(first), b = channels(second);
  return `#${a.map((value, index) => Math.round(value + (b[index] - value) * amount).toString(16).padStart(2, "0")).join("")}`;
}
function assertContrast(theme: ThemeDefinition): void {
  const t = (key: string) => theme.tokens[`--theme-${key}`];
  const surfaces = ["page", "page-top", "page-bottom", "page-glow", "panel", "raised", "input", "muted-surface", "selected", "row-hover", "readonly", "board", "success-surface", "warning-surface", "danger-surface", "info-surface"];
  for (const surface of surfaces) {
    for (const foreground of ["text", "muted", "placeholder", "link"]) {
      expect(contrast(t(foreground), t(surface)), `${theme.id}: ${foreground} on ${surface}`).toBeGreaterThanOrEqual(4.5);
    }
  }
  for (const surface of ["page", "panel", "raised", "input", "muted-surface", "selected", "row-hover"]) {
    for (const boundary of ["border", "action-outline", "focus", "selected-border"]) {
      expect(contrast(t(boundary), t(surface)), `${theme.id}: ${boundary} against ${surface}`).toBeGreaterThanOrEqual(3);
    }
  }
  for (const state of ["success", "warning", "danger", "info"]) {
    for (const surface of ["page", "panel", "raised", "muted-surface", `${state}-surface`]) {
      expect(contrast(t(state), t(surface)), `${theme.id}: ${state} on ${surface}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t(`${state}-border`), t(surface)), `${theme.id}: ${state} boundary against ${surface}`).toBeGreaterThanOrEqual(3);
    }
  }
  for (const state of ["action", "action-end", "action-hover", "action-pressed"]) {
    expect(contrast(t("on-action"), t(state)), `${theme.id}: label on ${state}`).toBeGreaterThanOrEqual(4.5);
  }
  for (let step = 0; step <= 100; step++) {
    expect(contrast(t("on-action"), interpolate(t("action"), t("action-end"), step / 100)), `${theme.id}: primary gradient at ${step}%`).toBeGreaterThanOrEqual(4.5);
  }
  expect(contrast(t("on-danger"), t("danger-fill")), `${theme.id}: notification badge`).toBeGreaterThanOrEqual(4.5);
  expect(contrast(t("tooltip-text"), t("tooltip")), `${theme.id}: tooltip`).toBeGreaterThanOrEqual(4.5);
  expect(contrast(t("tooltip-muted"), t("tooltip")), `${theme.id}: tooltip label`).toBeGreaterThanOrEqual(4.5);
}

describe("complete theme registry", () => {
  it("ships the stable 6 light, 4 dim and 8 dark choices with one token contract", () => {
    expect(THEMES.map((theme) => theme.id)).toEqual(THEME_IDS);
    expect(new Set(THEME_IDS).size).toBe(18);
    expect(["light", "dim", "dark"].map((group) => THEMES.filter((theme) => theme.group === group).length)).toEqual([6, 4, 8]);
    const keys = Object.keys(THEMES[0].tokens).sort();
    for (const theme of THEMES) {
      expect(theme.colorScheme).toBe(theme.group === "light" ? "light" : "dark");
      expect(Object.keys(theme.tokens).sort()).toEqual(keys);
      expect(Object.isFrozen(theme.tokens)).toBe(true);
      expect(resolveTheme(theme.id)).toBe(theme);
      expect(Object.values(theme.tokens).every((color) => /^#[\da-f]{6}(?:[\da-f]{2})?$/.test(color))).toBe(true);
    }
    const cssTokens = [...stylesheet.matchAll(/var\((--theme-[a-z-]+)/g)].map((match) => match[1]);
    expect(cssTokens.filter((token) => !keys.includes(token))).toEqual([]);
    expect(stylesheet.split("@media print")[0]).not.toMatch(/#[\da-f]{3,8}\b|rgba?\(/i);
  });

  it.each(THEMES)("$name has readable opaque roles, controls and action gradients", assertContrast);

  it("defaults defensively and never accepts selectors or prototype keys as IDs", () => {
    for (const value of [null, undefined, "", "constructor", "__proto__", "dark", "opa-light; color:red", 3, {}]) {
      expect(isThemeId(value)).toBe(false);
      expect(resolveTheme(value)).toBe(resolveTheme(DEFAULT_THEME_ID));
    }
  });

  it("preserves the configured artwork opacity in the original Light appearance", () => {
    expect(resolveTheme("opa-light").tokens["--theme-board-overlay"]).toBe("#ffffff00");
    expect(resolveTheme("opa-light", { primaryAction: "red", accentHighlight: "blue", surfaceTint: "ivory", textEmphasis: "black" }).tokens["--theme-board-overlay"]).toBe("#ffffff00");
    expect(resolveTheme("nord").tokens["--theme-board-overlay"].slice(-2)).not.toBe("00");
  });

  it("keeps legacy branding only in Light, with stable cached resolution and accessible colors", () => {
    const branding = { primaryAction: "#990000", accentHighlight: "#ffffff", surfaceTint: "#001122", textEmphasis: "#eeeeee" };
    const branded = resolveTheme("opa-light", branding);
    expect(branded).toBe(resolveTheme("opa-light", { ...branding }));
    expect(branded.tokens["--theme-action"]).toBe("#990000");
    expect(resolveTheme("nord", branding)).toBe(resolveTheme("nord"));
    assertContrast(branded);
    const invalid = resolveTheme("opa-light", { primaryAction: "</style>", accentHighlight: "url(https://invalid.test)", surfaceTint: "var(--outside)", textEmphasis: "expression(bad)" });
    assertContrast(invalid);
    expect(themeStyle(invalid)).not.toMatch(/<|>|url|expression|outside/);
  });

  it("serializes only safe theme token names and canonical color literals", () => {
    const unsafe = { ...THEMES[0], tokens: { ...THEMES[0].tokens, "--theme-text": "</style><script>bad</script>", "color": "#ffffff", "--theme-evil;": "#ffffff" } };
    expect(themeStyle(unsafe)).not.toMatch(/<|>|script|evil|(?:^|;)color:/);
    expect(themeStyle(THEMES[0]).split(";").length).toBe(Object.keys(THEMES[0].tokens).length);
  });
});

describe("safe legacy brand color normalization", () => {
  it.each([
    [" #ABC ", "#aabbcc"], ["#123456", "#123456"], ["#0000", "#ffffff"], ["#00000080", "#7f7f7f"],
    ["rebeccapurple", "#663399"], ["LightGoldenrodYellow", "#fafad2"], ["transparent", "#ffffff"],
    ["rgb(10, 20, 30)", "#0a141e"], ["rgb(100% 0% 0%)", "#ff0000"], ["rgba(0, 0, 0, .5)", "#808080"],
    ["rgb(0 0 0 / 50%)", "#808080"], ["hsl(120, 100%, 25%)", "#008000"], ["hsl(.5turn 100% 50%)", "#00ffff"],
    ["hsla(240, 100%, 50%, .5)", "#8080ff"]
  ])("normalizes %s without a DOM parser", (input, expected) => {
    expect(normalizeThemeColor(input, "")).toBe(expected);
  });

  it.each([null, undefined, {}, 42, "", "__proto__", "constructor", "var(--text)", "currentColor", "inherit", "#12345", "#112233;background:red", "</style><script>alert(1)</script>", "url(https://invalid.test)", "rgb(1 2 3 / 4 / 5)", "rgb(1 2 / 3 0.5)", "rgb(-1 0 0)", "rgba(0,0,0,2)", "rgb(1e309 0 0)", "hsl(0 200% 50%)"])("rejects arbitrary CSS or invalid colors: %s", (input) => {
    expect(normalizeThemeColor(input, "")).toBe("");
    expect(normalizeThemeColor(input, "#123456")).toBe("#123456");
  });
});
