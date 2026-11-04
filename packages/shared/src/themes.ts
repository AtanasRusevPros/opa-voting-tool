// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

/** OpaVoting UI adaptations, not upstream syntax themes or endorsed integrations.
 * Palette references (no upstream implementation or runtime dependency is included):
 * Primer: https://github.com/primer/primitives
 * Atom One: https://github.com/atom/one-light-syntax and /one-dark-syntax
 * Solarized, Ethan Schoonover: https://ethanschoonover.com/solarized/
 * Catppuccin: https://catppuccin.com/palette/
 * Gruvbox, Pavel Pertsev: https://github.com/morhetz/gruvbox
 * Nord, Arctic Ice Studio: https://www.nordtheme.com/docs/colors-and-palettes/
 * Dracula, Zeno Rocha and contributors: https://draculatheme.com/spec
 * Monokai: https://github.com/microsoft/vscode/tree/main/extensions/theme-monokai
 * Tokyo Night, folke and contributors: https://github.com/folke/tokyonight.nvim
 * Midnight Aurora / Ember: original OpaVoting color adaptations; no reference artwork ships.
 * Seeds below are pinned here. Semantic roles and contrast corrections are our own.
 */
export const THEME_IDS = [
  "opa-light", "github-light", "one-light", "solarized-light", "catppuccin-latte", "gruvbox-light",
  "nord", "github-dimmed", "catppuccin-frappe", "solarized-dark",
  "github-dark", "one-dark", "dracula", "monokai", "tokyo-night", "catppuccin-mocha",
  "opa-midnight-aurora", "opa-midnight-ember"
] as const;
export type ThemeId = (typeof THEME_IDS)[number];
export const DEFAULT_THEME_ID: ThemeId = "opa-light";
export interface ThemeDefinition {
  readonly id: ThemeId;
  readonly name: string;
  readonly group: "light" | "dim" | "dark";
  readonly colorScheme: "light" | "dark";
  readonly tokens: Readonly<Record<string, string>>;
}
export interface LegacyThemePalette {
  primaryAction: string;
  accentHighlight: string;
  surfaceTint: string;
  textEmphasis: string;
}

const ID_SET = new Set<string>(THEME_IDS);
export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && ID_SET.has(value);
}

type RGB = [number, number, number];
const hex = (rgb: RGB): string => `#${rgb.map((channel) => Math.round(Math.max(0, Math.min(255, channel))).toString(16).padStart(2, "0")).join("")}`;
const rgb = (value: string): RGB => [1, 3, 5].map((start) => Number.parseInt(value.slice(start, start + 2), 16)) as RGB;
const mix = (first: string, second: string, amount: number): string => {
  const a = rgb(first), b = rgb(second);
  return hex(a.map((channel, i) => channel + (b[i] - channel) * amount) as RGB);
};
const luminance = (color: string): number => rgb(color).map((channel) => {
  const n = channel / 255;
  return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
}).reduce((sum, channel, i) => sum + channel * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a: string, b: string): number => {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

// Canonical CSS named colors are data, not evaluated CSS. Context-dependent keywords
// (currentColor, inherit, var(), system colors) deliberately cannot enter saved branding.
const namedColors: Record<string, string> = Object.fromEntries((
  "aliceblue:f0f8ff antiquewhite:faebd7 aqua:00ffff aquamarine:7fffd4 azure:f0ffff beige:f5f5dc bisque:ffe4c4 black:000000 blanchedalmond:ffebcd blue:0000ff blueviolet:8a2be2 brown:a52a2a burlywood:deb887 cadetblue:5f9ea0 chartreuse:7fff00 chocolate:d2691e coral:ff7f50 cornflowerblue:6495ed cornsilk:fff8dc crimson:dc143c cyan:00ffff darkblue:00008b darkcyan:008b8b darkgoldenrod:b8860b darkgray:a9a9a9 darkgreen:006400 darkgrey:a9a9a9 darkkhaki:bdb76b darkmagenta:8b008b darkolivegreen:556b2f darkorange:ff8c00 darkorchid:9932cc darkred:8b0000 darksalmon:e9967a darkseagreen:8fbc8f darkslateblue:483d8b darkslategray:2f4f4f darkslategrey:2f4f4f darkturquoise:00ced1 darkviolet:9400d3 deeppink:ff1493 deepskyblue:00bfff dimgray:696969 dimgrey:696969 dodgerblue:1e90ff firebrick:b22222 floralwhite:fffaf0 forestgreen:228b22 fuchsia:ff00ff gainsboro:dcdcdc ghostwhite:f8f8ff gold:ffd700 goldenrod:daa520 gray:808080 green:008000 greenyellow:adff2f grey:808080 honeydew:f0fff0 hotpink:ff69b4 indianred:cd5c5c indigo:4b0082 ivory:fffff0 khaki:f0e68c lavender:e6e6fa lavenderblush:fff0f5 lawnGreen:7cfc00 lemonchiffon:fffacd lightblue:add8e6 lightcoral:f08080 lightcyan:e0ffff lightgoldenrodyellow:fafad2 lightgray:d3d3d3 lightgreen:90ee90 lightgrey:d3d3d3 lightpink:ffb6c1 lightsalmon:ffa07a lightseagreen:20b2aa lightskyblue:87cefa lightslategray:778899 lightslategrey:778899 lightsteelblue:b0c4de lightyellow:ffffe0 lime:00ff00 limegreen:32cd32 linen:faf0e6 magenta:ff00ff maroon:800000 mediumaquamarine:66cdaa mediumblue:0000cd mediumorchid:ba55d3 mediumpurple:9370db mediumseagreen:3cb371 mediumslateblue:7b68ee mediumspringgreen:00fa9a mediumturquoise:48d1cc mediumvioletred:c71585 midnightblue:191970 mintcream:f5fffa mistyrose:ffe4e1 moccasin:ffe4b5 navajowhite:ffdead navy:000080 oldlace:fdf5e6 olive:808000 olivedrab:6b8e23 orange:ffa500 orangered:ff4500 orchid:da70d6 palegoldenrod:eee8aa palegreen:98fb98 paleturquoise:afeeee palevioletred:db7093 papayawhip:ffefd5 peachpuff:ffdab9 peru:cd853f pink:ffc0cb plum:dda0dd powderblue:b0e0e6 purple:800080 rebeccapurple:663399 red:ff0000 rosybrown:bc8f8f royalblue:4169e1 saddlebrown:8b4513 salmon:fa8072 sandybrown:f4a460 seagreen:2e8b57 seashell:fff5ee sienna:a0522d silver:c0c0c0 skyblue:87ceeb slateblue:6a5acd slategray:708090 slategrey:708090 snow:fffafa springgreen:00ff7f steelblue:4682b4 tan:d2b48c teal:008080 thistle:d8bfd8 tomato:ff6347 turquoise:40e0d0 violet:ee82ee wheat:f5deb3 white:ffffff whitesmoke:f5f5f5 yellow:ffff00 yellowgreen:9acd32"
).toLowerCase().split(" ").map((entry) => {
  const [name, value] = entry.split(":");
  return [name, `#${value}`];
}));

/** Normalize standalone sRGB colors to opaque hex. Legacy alpha is composited over
 * white (the original branding canvas). Invalid input returns fallback unchanged;
 * callers validating new writes can use an empty fallback as their invalid sentinel. */
export function normalizeThemeColor(value: unknown, fallback: string): string {
  if (typeof value !== "string" || value.length > 128) return fallback;
  const input = value.trim().toLowerCase();
  if (Object.hasOwn(namedColors, input)) return namedColors[input];
  if (input === "transparent") return "#ffffff";
  const hexadecimal = /^#([\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/.exec(input);
  if (hexadecimal) {
    let digits = hexadecimal[1];
    if (digits.length <= 4) digits = digits.split("").map((n) => n + n).join("");
    const color = `#${digits.slice(0, 6)}`;
    return digits.length === 8 ? mix("#ffffff", color, parseInt(digits.slice(6), 16) / 255) : color;
  }
  const functional = /^(rgba?|hsla?)\(([^()]*)\)$/.exec(input);
  if (!functional) return fallback;
  const comma = functional[2].includes(",");
  if (comma && functional[2].includes("/")) return fallback;
  if (!comma && functional[2].includes("/")) {
    const sections = functional[2].split("/");
    if (sections.length !== 2 || sections[0].trim().split(/\s+/).length !== 3 || sections[1].trim().split(/\s+/).length !== 1) return fallback;
  }
  const pieces = functional[2].trim().split(comma ? /\s*,\s*/ : /\s*\/\s*|\s+/);
  if (pieces.length < 3 || pieces.length > 4) return fallback;
  const number = /^[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?(%|deg|rad|grad|turn)?$/;
  if (!pieces.every((piece) => number.test(piece))) return fallback;
  const values = pieces.map(parseFloat);
  if (!values.every(Number.isFinite)) return fallback;
  let alpha = 1;
  if (pieces.length === 4) {
    if (/deg|rad|turn/.test(pieces[3])) return fallback;
    alpha = pieces[3].endsWith("%") ? values[3] / 100 : values[3];
    if (alpha < 0 || alpha > 1) return fallback;
  }
  let channels: RGB;
  if (functional[1].startsWith("rgb")) {
    if (pieces.slice(0, 3).some((piece) => /deg|rad|turn/.test(piece))) return fallback;
    channels = values.slice(0, 3).map((n, i) => pieces[i].endsWith("%") ? n * 255 / 100 : n) as RGB;
    if (channels.some((n) => n < 0 || n > 255)) return fallback;
  } else {
    if (pieces[0].endsWith("%") || !pieces[1].endsWith("%") || !pieces[2].endsWith("%")) return fallback;
    let hue = values[0];
    if (pieces[0].endsWith("turn")) hue *= 360;
    else if (pieces[0].endsWith("grad")) hue *= 0.9;
    else if (pieces[0].endsWith("rad")) hue *= 180 / Math.PI;
    hue = ((hue % 360) + 360) % 360;
    const saturation = values[1] / 100, lightness = values[2] / 100;
    if (saturation < 0 || saturation > 1 || lightness < 0 || lightness > 1) return fallback;
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const x = chroma * (1 - Math.abs((hue / 60) % 2 - 1));
    const segment: RGB = hue < 60 ? [chroma, x, 0] : hue < 120 ? [x, chroma, 0] : hue < 180 ? [0, chroma, x] : hue < 240 ? [0, x, chroma] : hue < 300 ? [x, 0, chroma] : [chroma, 0, x];
    channels = segment.map((n) => (n + lightness - chroma / 2) * 255) as RGB;
  }
  return hex(channels.map((n) => 255 + (n - 255) * alpha) as RGB);
}

interface PaletteSeed {
  id: ThemeId;
  name: string;
  group: ThemeDefinition["group"];
  page: string;
  panel: string;
  raised: string;
  text: string;
  muted: string;
  action: string;
  actionEnd?: string;
  link: string;
  accent: string;
  focus: string;
  border: string;
  success: string;
  warning: string;
  danger: string;
  tint?: string;
}

// Surface brightness deliberately stays within one mode. The bounded adjustment
// preserves each seed's hue while ensuring readable UI roles (including help text).
function readable(color: string, backgrounds: readonly string[], minimum: number): string {
  if (backgrounds.every((background) => contrast(color, background) >= minimum)) return color;
  const minimumContrast = (candidate: string) => Math.min(...backgrounds.map((background) => contrast(candidate, background)));
  const target = minimumContrast("#000000") > minimumContrast("#ffffff") ? "#000000" : "#ffffff";
  for (let step = 1; step <= 100; step++) {
    const candidate = mix(color, target, step / 100);
    if (minimumContrast(candidate) >= minimum) return candidate;
  }
  return target;
}

function defineTheme(seed: PaletteSeed): ThemeDefinition {
  const dark = seed.group !== "light";
  const mutedSurface = seed.tint ?? mix(seed.panel, seed.page, 0.55);
  const selected = mix(seed.panel, seed.action, dark ? 0.13 : 0.09);
  const hovered = mix(seed.panel, seed.action, dark ? 0.08 : 0.05);
  const pageTop = seed.id === "opa-light" ? "#fbfdff" : seed.page;
  const pageBottom = seed.id === "opa-light" ? "#edf3fb" : seed.page;
  const pageGlow = mix(seed.page, seed.accent, 0.1);
  const statuses = { success: seed.success, warning: seed.warning, danger: seed.danger, info: seed.link };
  const statusSurface = (color: string) => mix(seed.panel, color, dark ? 0.1 : 0.07);
  const backgrounds = [seed.page, seed.panel, seed.raised, mutedSurface, selected, hovered, pageTop, pageBottom, pageGlow, ...Object.values(statuses).map(statusSurface)];
  const foreground = (value: string) => readable(value, backgrounds, 4.5);
  const onAction = readable(dark ? seed.page : "#07172b", [seed.action], 4.5);
  // A saved legacy gradient may cross from black to white. Correct its second
  // endpoint before displaying it so one label color works across the gradient.
  let actionEnd = readable(seed.actionEnd ?? seed.action, [onAction], 4.5);
  // RGB interpolation can dip below both endpoints when hues differ strongly.
  // Unsafe imported gradients become a solid primary, preserving that brand hue.
  if (Array.from({ length: 21 }, (_, i) => mix(seed.action, actionEnd, i / 20)).some((color) => contrast(onAction, color) < 4.5)) actionEnd = seed.action;
  const actionTarget = luminance(onAction) < 0.2 ? "#ffffff" : "#000000";
  const actionHover = mix(seed.action, actionTarget, 0.08);
  const actionPressed = mix(seed.action, actionTarget, 0.15);
  const tooltip = dark ? seed.raised : "#1d2a43";
  const border = readable(seed.border, backgrounds, 3);
  const tokens: Record<string, string> = {
    "--theme-page": seed.page,
    "--theme-page-top": pageTop,
    "--theme-page-bottom": pageBottom,
    "--theme-page-glow": pageGlow,
    "--theme-panel": seed.panel,
    "--theme-raised": seed.raised,
    "--theme-input": seed.raised,
    "--theme-muted-surface": mutedSurface,
    "--theme-table-row": seed.panel,
    "--theme-row-hover": hovered,
    "--theme-board": seed.panel,
    "--theme-board-overlay": seed.id === DEFAULT_THEME_ID ? `${seed.panel}00` : dark ? `${seed.panel}cc` : `${seed.panel}66`,
    "--theme-selected": selected,
    "--theme-tooltip": tooltip,
    "--theme-tooltip-text": readable("#f4f8ff", [tooltip], 4.5),
    "--theme-tooltip-muted": readable(dark ? seed.muted : "#c5d7fb", [tooltip], 4.5),
    "--theme-overlay": dark ? "#030711b8" : "#141f3057",
    "--theme-mobile-overlay": dark ? "#0307118c" : "#1e304824",
    "--theme-backdrop-start": `${seed.page}${dark ? "f2" : "c2"}`,
    "--theme-backdrop-end": `${seed.page}${dark ? "fa" : "e6"}`,
    "--theme-text": foreground(seed.text),
    "--theme-muted": foreground(seed.muted),
    "--theme-placeholder": foreground(seed.muted),
    "--theme-link": foreground(seed.link),
    "--theme-link-hover": foreground(mix(seed.link, seed.text, 0.22)),
    "--theme-accent": foreground(seed.accent),
    "--theme-action": seed.action,
    "--theme-action-end": actionEnd,
    "--theme-action-hover": actionHover,
    "--theme-action-pressed": actionPressed,
    "--theme-on-action": onAction,
    "--theme-secondary": seed.panel,
    "--theme-secondary-hover": hovered,
    "--theme-secondary-pressed": selected,
    "--theme-action-outline": readable(dark ? "#82b5f1" : "#3974b8", backgrounds, 3),
    "--theme-focus": readable(seed.focus, backgrounds, 3),
    "--theme-disabled": mutedSurface,
    "--theme-disabled-text": foreground(seed.muted),
    "--theme-border": border,
    "--theme-separator": mix(seed.panel, seed.muted, 0.25),
    "--theme-selected-border": readable(seed.link, backgrounds, 3),
    "--theme-dialog-border": border,
    "--theme-shadow": dark ? "#00000040" : "#3456911f",
    "--theme-shadow-strong": dark ? "#00000073" : "#21375f3d",
    "--theme-shadow-action": `${seed.action}38`,
    "--theme-shadow-danger": `${seed.danger}38`,
    "--theme-selection": selected,
    "--theme-selection-text": foreground(seed.text),
    "--theme-scrollbar": border,
    "--theme-scrollbar-hover": foreground(seed.muted),
    "--theme-scrollbar-track": mutedSurface,
    "--theme-skeleton": mix(seed.panel, seed.muted, 0.16),
    "--theme-readonly": mutedSurface,
    "--theme-native-accent": readable(seed.link, backgrounds, 3)
  };
  for (const [role, color] of Object.entries(statuses)) {
    const surface = statusSurface(color);
    tokens[`--theme-${role}`] = readable(color, [...backgrounds, surface], 4.5);
    tokens[`--theme-${role}-surface`] = surface;
    tokens[`--theme-${role}-border`] = readable(color, [...backgrounds, surface], 3);
  }
  tokens["--theme-danger-fill"] = tokens["--theme-danger"];
  tokens["--theme-on-danger"] = readable(seed.panel, [tokens["--theme-danger-fill"]], 4.5);
  return Object.freeze({ id: seed.id, name: seed.name, group: seed.group, colorScheme: dark ? "dark" : "light", tokens: Object.freeze(tokens) });
}

// Compact seed tuples keep the complete registry small; semantic tokens are created
// once at module initialization, never recalculated on each React render.
type SeedTuple = readonly [ThemeId, string, PaletteSeed["group"], string, string, string, string, string, string, string, string, string, string, string, string, string];
const seeds: readonly SeedTuple[] = [
  ["opa-light", "OpaVoting Light", "light", "#f4f7fb", "#ffffff", "#ffffff", "#203047", "#52647e", "#3a88ff", "#185797", "#579dff", "#2677d8", "#76869b", "#23553a", "#795100", "#9c2525"],
  ["github-light", "GitHub Light", "light", "#f6f8fa", "#ffffff", "#ffffff", "#1f2328", "#59636e", "#0969da", "#0969da", "#8250df", "#0969da", "#737c85", "#1a7f37", "#7d4e00", "#b4232c"],
  ["one-light", "One Light", "light", "#fafafa", "#ffffff", "#f5f5f5", "#383a42", "#696a77", "#4078f2", "#315ca9", "#a626a4", "#4078f2", "#85868c", "#397300", "#8a5900", "#b52a3c"],
  ["solarized-light", "Solarized Light", "light", "#fdf6e3", "#fffaf0", "#eee8d5", "#073642", "#52676d", "#1678aa", "#006b93", "#6c71c4", "#006b93", "#758080", "#526700", "#806000", "#b8322e"],
  ["catppuccin-latte", "Catppuccin Latte", "light", "#eff1f5", "#ffffff", "#e6e9ef", "#4c4f69", "#5c5f77", "#1e66f5", "#1e66f5", "#8839ef", "#1e66f5", "#7c7f93", "#357c23", "#8a5600", "#d20f39"],
  ["gruvbox-light", "Gruvbox Light", "light", "#fbf1c7", "#fff8dc", "#ebdbb2", "#3c3836", "#665c54", "#076678", "#076678", "#8f3f71", "#076678", "#877866", "#596200", "#825b00", "#9d0006"],
  ["nord", "Nord", "dim", "#2e3440", "#3b4252", "#434c5e", "#eceff4", "#d0d8e5", "#88c0d0", "#8fbcdf", "#b48ead", "#ebcb8b", "#929fb5", "#a3be8c", "#ebcb8b", "#e8a1a8"],
  ["github-dimmed", "GitHub Dimmed", "dim", "#22272e", "#2d333b", "#373e47", "#e6edf3", "#adbac7", "#539bf5", "#79b8ff", "#b083f0", "#c690f5", "#7e8996", "#75c990", "#eac55f", "#f28b82"],
  ["catppuccin-frappe", "Catppuccin Frappé", "dim", "#303446", "#373c50", "#414559", "#c6d0f5", "#b5bfe2", "#8caaee", "#99b5f5", "#ca9ee6", "#e5c890", "#8b95b6", "#a6d189", "#e5c890", "#e78284"],
  ["solarized-dark", "Solarized Dark", "dim", "#002b36", "#073642", "#114451", "#eee8d5", "#b7c6c5", "#70b9dd", "#70b9dd", "#aaa8e8", "#d9bf68", "#78999d", "#b0c868", "#e0c56b", "#f28b82"],
  ["github-dark", "GitHub Dark", "dark", "#0d1117", "#161b22", "#21262d", "#e6edf3", "#aab6c4", "#79b8ff", "#79b8ff", "#bc8cff", "#d2a8ff", "#6e7e90", "#7ee787", "#e3b341", "#ff8e89"],
  ["one-dark", "One Dark", "dark", "#21252b", "#282c34", "#323842", "#e2e6ed", "#abb2bf", "#61afef", "#61afef", "#c678dd", "#e5c07b", "#7e899b", "#98c379", "#e5c07b", "#e69a9e"],
  ["dracula", "Dracula", "dark", "#21222c", "#282a36", "#343746", "#f8f8f2", "#c0bfda", "#bd93f9", "#8be9fd", "#ff79c6", "#f1fa8c", "#8c8daa", "#50fa7b", "#f1fa8c", "#ff9292"],
  ["monokai", "Monokai", "dark", "#1e1f1c", "#272822", "#34352f", "#f8f8f2", "#c3c2b7", "#a6e22e", "#66d9ef", "#ae81ff", "#e6db74", "#8b8b7e", "#a6e22e", "#e6db74", "#ff80ac"],
  ["tokyo-night", "Tokyo Night", "dark", "#16161e", "#1a1b26", "#24283b", "#c0caf5", "#a9b6e1", "#7aa2f7", "#7dcfff", "#bb9af7", "#e0af68", "#7381ac", "#9ece6a", "#e0af68", "#f7768e"],
  ["catppuccin-mocha", "Catppuccin Mocha", "dark", "#181825", "#1e1e2e", "#313244", "#cdd6f4", "#bac2de", "#89b4fa", "#89dceb", "#cba6f7", "#f9e2af", "#7f849c", "#a6e3a1", "#f9e2af", "#f38ba8"],
  ["opa-midnight-aurora", "Midnight Aurora", "dark", "#060d1b", "#0c1326", "#161d2f", "#f6fbfb", "#b2c6dd", "#71ade9", "#71ade9", "#978aeb", "#feca7e", "#607490", "#67d48f", "#feca7e", "#ef8a8d"],
  ["opa-midnight-ember", "Midnight Ember", "dark", "#090e1d", "#121a31", "#192841", "#fcfdfc", "#abc4df", "#fab048", "#7ed0f9", "#f48f3d", "#7ed0f9", "#6c7d98", "#3bd399", "#fab048", "#ff8a8a"]
];
const seedDefinitions = seeds.map(([id, name, group, page, panel, raised, text, muted, action, link, accent, focus, border, success, warning, danger]): PaletteSeed => ({ id, name, group, page, panel, raised, text, muted, action, link, accent, focus, border, success, warning, danger, ...(id === DEFAULT_THEME_ID ? { actionEnd: "#579dff", tint: "#eff5fd" } : {}) }));
export const THEMES: readonly ThemeDefinition[] = Object.freeze(seedDefinitions.map(defineTheme));
const themeById = new Map(THEMES.map((theme) => [theme.id, theme]));
const legacyCache = new Map<string, ThemeDefinition>();

export function resolveTheme(id: unknown, legacyPalette?: LegacyThemePalette): ThemeDefinition {
  const theme = themeById.get(isThemeId(id) ? id : DEFAULT_THEME_ID)!;
  if (theme.id !== DEFAULT_THEME_ID || !legacyPalette) return theme;
  const { primaryAction, accentHighlight, surfaceTint, textEmphasis } = legacyPalette;
  const key = JSON.stringify([primaryAction, accentHighlight, surfaceTint, textEmphasis]);
  const cached = legacyCache.get(key);
  if (cached) return cached;
  const base = seedDefinitions[0];
  if (primaryAction === base.action && accentHighlight === base.actionEnd && surfaceTint === base.tint && textEmphasis === base.text) return theme;
  const surface = normalizeThemeColor(surfaceTint, "#eff5fd");
  // The legacy palette belongs to Light. Very dark tints must not make its light
  // controls unreadable; preserve their hue in a pale, opaque surface instead.
  const panel = luminance(surface) < 0.7 ? mix(surface, "#ffffff", 0.9) : surface;
  const customized = defineTheme({ ...base,
    action: normalizeThemeColor(primaryAction, base.action),
    actionEnd: normalizeThemeColor(accentHighlight, base.actionEnd!),
    raised: "#ffffff",
    tint: panel,
    text: normalizeThemeColor(textEmphasis, base.text),
    accent: normalizeThemeColor(accentHighlight, base.accent)
  });
  // Bounded cache: platform palettes are normally singular but imported configs
  // must not cause unbounded memory growth on a long-running server.
  if (legacyCache.size >= 32) legacyCache.delete(legacyCache.keys().next().value!);
  legacyCache.set(key, customized);
  return customized;
}

/** Only our generated token grammar may enter an HTML style attribute/element. */
export function themeStyle(theme: ThemeDefinition): string {
  return Object.entries(theme.tokens).filter(([name, value]) => /^--theme-[a-z-]+$/.test(name) && /^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(value))
    .map(([name, value]) => `${name}:${value}`).join(";");
}
