// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const avatarDir = path.join(repoRoot, "apps/web/public/branding/avatars");

const palettes = {
  amber: { bg: "#FFF1D6", face: "#F3A93B", ear: "#D47A11", mark: "#7A3F0B", muzzle: "#FFF9EF" },
  azure: { bg: "#DFF3FF", face: "#4EA4F2", ear: "#1E6CC1", mark: "#0E467E", muzzle: "#F6FBFF" },
  coral: { bg: "#FFE7E1", face: "#FF7E68", ear: "#D94841", mark: "#7D2323", muzzle: "#FFF8F5" },
  emerald: { bg: "#E0F8EB", face: "#32B77B", ear: "#178257", mark: "#0B4F34", muzzle: "#F6FFFB" },
  gold: { bg: "#FFF6D8", face: "#E0B636", ear: "#A77A17", mark: "#6D4E0A", muzzle: "#FFFDF3" },
  indigo: { bg: "#E8E7FF", face: "#7468F2", ear: "#4C3CB7", mark: "#2C236C", muzzle: "#FAF9FF" },
  lime: { bg: "#EFFFD9", face: "#91D93A", ear: "#5EA11D", mark: "#3A650E", muzzle: "#FBFFF2" },
  plum: { bg: "#F8E2FF", face: "#B76BE5", ear: "#7D38B1", mark: "#4A1D6D", muzzle: "#FFF8FF" },
  rose: { bg: "#FFE3EE", face: "#E56293", ear: "#B63D6F", mark: "#6F1E42", muzzle: "#FFF7FB" },
  teal: { bg: "#DBFBF8", face: "#22B8B0", ear: "#157E7B", mark: "#0B4F52", muzzle: "#F7FFFF" },
  graphite: { bg: "#EDF1F7", face: "#66738A", ear: "#435064", mark: "#1F2937", muzzle: "#FBFCFE" },
  sunset: { bg: "#FFEAD9", face: "#FF8A42", ear: "#D46320", mark: "#7A3710", muzzle: "#FFF9F3" },
  legacyA: { bg: "#E6F4FF", face: "#4D84D7", ear: "#234D8F", mark: "#162E5A", muzzle: "#FBFDFF" },
  legacyB: { bg: "#FFF0E8", face: "#D8875D", ear: "#A3552D", mark: "#663118", muzzle: "#FFF9F5" },
  legacyC: { bg: "#E6FFF8", face: "#42B8A6", ear: "#1E7D71", mark: "#0D544C", muzzle: "#F6FFFC" },
  legacyD: { bg: "#FFF0FA", face: "#CF72B7", ear: "#943C7F", mark: "#5C214E", muzzle: "#FFF8FD" }
};

const legacyAnimals = [
  "badger",
  "bat",
  "bear",
  "beaver",
  "cat",
  "cow",
  "deer",
  "dog",
  "fox",
  "frog",
  "koala",
  "lion",
  "monkey",
  "mouse",
  "otter",
  "owl",
  "panda",
  "penguin",
  "pig",
  "rabbit",
  "raccoon",
  "tiger",
  "wolf",
  "zebra"
];

const pickerIcons = [
  "bear",
  "fox",
  "owl",
  "frog",
  "tiger",
  "star",
  "confetti",
  "wrench",
  "iron",
  "cog",
  "pizza",
  "cake",
  "biscuit",
  "water",
  "planet",
  "cone",
  "stop",
  "yield",
  "parking",
  "hammer",
  "bolt",
  "cloud",
  "letter-a",
  "letter-b",
  "letter-c",
  "letter-d",
  "letter-e",
  "letter-f",
  "letter-g",
  "letter-h",
  "letter-i",
  "letter-j",
  "letter-k",
  "letter-l",
  "letter-m",
  "letter-n",
  "letter-o",
  "letter-p",
  "letter-q",
  "letter-r",
  "letter-s",
  "letter-t",
  "letter-u",
  "letter-v",
  "letter-w",
  "letter-x",
  "letter-y",
  "letter-z"
];

const supportedIcons = Array.from(new Set([...legacyAnimals, ...pickerIcons]));

const standardTones = ["amber", "azure", "coral", "emerald", "gold", "indigo", "lime", "plum", "rose", "teal", "graphite", "sunset"];

const legacyDefinitions = [
  { key: "andromeda", animal: "fox", tone: "legacyA" },
  { key: "aurora", animal: "owl", tone: "legacyB" },
  { key: "comet", animal: "rabbit", tone: "legacyC" },
  { key: "nova", animal: "cat", tone: "legacyD" },
  { key: "orbit", animal: "bear", tone: "legacyA" },
  { key: "pulse", animal: "frog", tone: "legacyB" },
  { key: "quasar", animal: "lion", tone: "legacyC" },
  { key: "rocket", animal: "wolf", tone: "legacyD" }
];

function ears(type, color) {
  switch (type) {
    case "cat":
    case "fox":
    case "wolf":
    case "tiger":
      return `
        <path d="M25 31 L34 13 L43 33 Z" fill="${color}"/>
        <path d="M53 33 L62 13 L71 31 Z" fill="${color}"/>
      `;
    case "rabbit":
      return `
        <rect x="28" y="8" width="11" height="30" rx="6" fill="${color}"/>
        <rect x="57" y="8" width="11" height="30" rx="6" fill="${color}"/>
      `;
    case "mouse":
    case "bear":
    case "koala":
    case "monkey":
    case "panda":
      return `
        <circle cx="29" cy="26" r="11" fill="${color}"/>
        <circle cx="67" cy="26" r="11" fill="${color}"/>
      `;
    case "dog":
    case "beaver":
    case "otter":
      return `
        <ellipse cx="29" cy="31" rx="10" ry="14" fill="${color}"/>
        <ellipse cx="67" cy="31" rx="10" ry="14" fill="${color}"/>
      `;
    case "cow":
    case "deer":
      return `
        <ellipse cx="31" cy="26" rx="9" ry="12" fill="${color}"/>
        <ellipse cx="65" cy="26" rx="9" ry="12" fill="${color}"/>
      `;
    case "pig":
      return `
        <path d="M27 33 L35 18 L42 34 Z" fill="${color}"/>
        <path d="M54 34 L61 18 L69 33 Z" fill="${color}"/>
      `;
    case "owl":
      return `
        <path d="M29 28 L34 17 L39 28 Z" fill="${color}"/>
        <path d="M57 28 L62 17 L67 28 Z" fill="${color}"/>
      `;
    case "bat":
      return `
        <path d="M27 30 L34 15 L41 31 Z" fill="${color}"/>
        <path d="M55 31 L62 15 L69 30 Z" fill="${color}"/>
      `;
    case "frog":
      return `
        <circle cx="30" cy="25" r="10" fill="${color}"/>
        <circle cx="66" cy="25" r="10" fill="${color}"/>
      `;
    case "penguin":
    case "zebra":
    case "badger":
    case "raccoon":
      return `
        <ellipse cx="31" cy="27" rx="9" ry="10" fill="${color}"/>
        <ellipse cx="65" cy="27" rx="9" ry="10" fill="${color}"/>
      `;
    default:
      return `
        <circle cx="31" cy="27" r="9" fill="${color}"/>
        <circle cx="65" cy="27" r="9" fill="${color}"/>
      `;
  }
}

function face(animal, palette) {
  const dark = palette.mark;
  const muzzle = palette.muzzle;
  const faceFill = palette.face;
  const commonFace = `<circle cx="48" cy="52" r="26" fill="${faceFill}"/>`;
  const commonEyes = `<circle cx="39" cy="49" r="3.1" fill="${dark}"/><circle cx="57" cy="49" r="3.1" fill="${dark}"/>`;

  switch (animal) {
    case "badger":
      return `${commonFace}<path d="M34 31 C40 24 56 24 62 31 L56 67 H40 Z" fill="${muzzle}"/><rect x="44" y="27" width="8" height="41" rx="4" fill="${dark}"/>${commonEyes}<circle cx="48" cy="59" r="4.5" fill="${dark}"/>`;
    case "bat":
      return `${commonFace}<path d="M24 51 Q32 43 38 51" fill="none" stroke="${dark}" stroke-width="4" stroke-linecap="round"/><path d="M58 51 Q64 43 72 51" fill="none" stroke="${dark}" stroke-width="4" stroke-linecap="round"/>${commonEyes}<path d="M43 61 Q48 66 53 61" fill="${dark}"/>`;
    case "bear":
      return `${commonFace}${commonEyes}<ellipse cx="48" cy="60" rx="10" ry="8" fill="${muzzle}"/><circle cx="48" cy="57" r="4" fill="${dark}"/>`;
    case "beaver":
      return `${commonFace}${commonEyes}<ellipse cx="48" cy="60" rx="11" ry="8" fill="${muzzle}"/><rect x="43" y="61" width="4" height="9" rx="1.5" fill="#ffffff"/><rect x="49" y="61" width="4" height="9" rx="1.5" fill="#ffffff"/><circle cx="48" cy="56" r="4" fill="${dark}"/>`;
    case "cat":
      return `${commonFace}${commonEyes}<path d="M39 58 Q48 68 57 58" fill="${muzzle}"/><circle cx="48" cy="56" r="3.5" fill="${dark}"/><path d="M31 58 H20 M31 63 H18 M65 58 H76 M65 63 H78" stroke="${dark}" stroke-width="2.5" stroke-linecap="round"/>`;
    case "cow":
      return `${commonFace}${commonEyes}<ellipse cx="48" cy="61" rx="12" ry="9" fill="${muzzle}"/><circle cx="43" cy="61" r="2.2" fill="${dark}"/><circle cx="53" cy="61" r="2.2" fill="${dark}"/><path d="M24 23 Q28 17 33 23" fill="none" stroke="${dark}" stroke-width="3" stroke-linecap="round"/><path d="M63 23 Q68 17 72 23" fill="none" stroke="${dark}" stroke-width="3" stroke-linecap="round"/>`;
    case "deer":
      return `${commonFace}${commonEyes}<ellipse cx="48" cy="60" rx="10" ry="8" fill="${muzzle}"/><circle cx="48" cy="56" r="3.5" fill="${dark}"/><path d="M30 21 L26 9 M30 18 L22 14 M30 18 L36 13" stroke="${dark}" stroke-width="3" stroke-linecap="round"/><path d="M66 21 L70 9 M66 18 L74 14 M66 18 L60 13" stroke="${dark}" stroke-width="3" stroke-linecap="round"/>`;
    case "dog":
      return `${commonFace}${commonEyes}<ellipse cx="48" cy="60" rx="11" ry="8" fill="${muzzle}"/><circle cx="48" cy="56" r="4" fill="${dark}"/>`;
    case "fox":
      return `${commonFace}${commonEyes}<path d="M36 57 L48 69 L60 57 Q48 62 36 57 Z" fill="${muzzle}"/><circle cx="48" cy="55" r="3.8" fill="${dark}"/>`;
    case "frog":
      return `${commonFace}<circle cx="39" cy="42" r="4" fill="${muzzle}"/><circle cx="57" cy="42" r="4" fill="${muzzle}"/><circle cx="39" cy="42" r="2.2" fill="${dark}"/><circle cx="57" cy="42" r="2.2" fill="${dark}"/><path d="M39 61 Q48 68 57 61" fill="none" stroke="${dark}" stroke-width="3" stroke-linecap="round"/>`;
    case "koala":
      return `${commonFace}${commonEyes}<ellipse cx="48" cy="58" rx="8" ry="10" fill="${dark}"/><ellipse cx="31" cy="49" rx="6" ry="7" fill="${muzzle}"/><ellipse cx="65" cy="49" rx="6" ry="7" fill="${muzzle}"/>`;
    case "lion":
      return `<circle cx="48" cy="52" r="32" fill="${palette.ear}"/>${commonFace}${commonEyes}<ellipse cx="48" cy="60" rx="10" ry="8" fill="${muzzle}"/><circle cx="48" cy="56" r="4" fill="${dark}"/>`;
    case "monkey":
      return `${commonFace}${commonEyes}<ellipse cx="48" cy="60" rx="12" ry="9" fill="${muzzle}"/><circle cx="48" cy="56" r="3.5" fill="${dark}"/><ellipse cx="32" cy="58" rx="6" ry="8" fill="${muzzle}"/><ellipse cx="64" cy="58" rx="6" ry="8" fill="${muzzle}"/>`;
    case "mouse":
      return `${commonFace}${commonEyes}<ellipse cx="48" cy="60" rx="11" ry="8" fill="${muzzle}"/><circle cx="48" cy="58" r="3.2" fill="${dark}"/><path d="M31 60 H20 M65 60 H76" stroke="${dark}" stroke-width="2.4" stroke-linecap="round"/>`;
    case "otter":
      return `${commonFace}${commonEyes}<ellipse cx="48" cy="61" rx="12" ry="9" fill="${muzzle}"/><circle cx="48" cy="56" r="3.6" fill="${dark}"/><path d="M33 60 H22 M33 65 H20 M63 60 H74 M63 65 H76" stroke="${dark}" stroke-width="2.3" stroke-linecap="round"/>`;
    case "owl":
      return `${commonFace}<circle cx="39" cy="49" r="7.5" fill="${muzzle}"/><circle cx="57" cy="49" r="7.5" fill="${muzzle}"/><circle cx="39" cy="49" r="2.7" fill="${dark}"/><circle cx="57" cy="49" r="2.7" fill="${dark}"/><path d="M48 55 L43 61 H53 Z" fill="${dark}"/>`;
    case "panda":
      return `${commonFace}<ellipse cx="38" cy="49" rx="7" ry="9" fill="${dark}"/><ellipse cx="58" cy="49" rx="7" ry="9" fill="${dark}"/><circle cx="39" cy="49" r="2.2" fill="${muzzle}"/><circle cx="57" cy="49" r="2.2" fill="${muzzle}"/><ellipse cx="48" cy="60" rx="10" ry="8" fill="${muzzle}"/><circle cx="48" cy="56" r="3.8" fill="${dark}"/>`;
    case "penguin":
      return `<path d="M48 22 C65 22 75 35 75 56 C75 74 62 83 48 83 C34 83 21 74 21 56 C21 35 31 22 48 22 Z" fill="${dark}"/><ellipse cx="48" cy="56" rx="20" ry="24" fill="${muzzle}"/><circle cx="39" cy="49" r="3" fill="${dark}"/><circle cx="57" cy="49" r="3" fill="${dark}"/><path d="M48 56 L43 61 H53 Z" fill="${palette.face}"/>`;
    case "pig":
      return `${commonFace}${commonEyes}<ellipse cx="48" cy="60" rx="12" ry="9" fill="${muzzle}"/><circle cx="43" cy="60" r="2.2" fill="${dark}"/><circle cx="53" cy="60" r="2.2" fill="${dark}"/>`;
    case "rabbit":
      return `${commonFace}${commonEyes}<ellipse cx="48" cy="60" rx="10" ry="8" fill="${muzzle}"/><circle cx="48" cy="56" r="3.4" fill="${dark}"/>`;
    case "raccoon":
      return `${commonFace}<rect x="30" y="42" width="36" height="14" rx="7" fill="${dark}"/><circle cx="39" cy="49" r="2.5" fill="${muzzle}"/><circle cx="57" cy="49" r="2.5" fill="${muzzle}"/><ellipse cx="48" cy="60" rx="10" ry="8" fill="${muzzle}"/><circle cx="48" cy="56" r="3.4" fill="${dark}"/>`;
    case "tiger":
      return `${commonFace}${commonEyes}<path d="M34 41 L30 48 M39 38 L36 46 M62 41 L66 48 M57 38 L60 46 M48 34 L48 43" stroke="${dark}" stroke-width="2.8" stroke-linecap="round"/><ellipse cx="48" cy="60" rx="11" ry="8" fill="${muzzle}"/><circle cx="48" cy="56" r="3.8" fill="${dark}"/>`;
    case "wolf":
      return `${commonFace}${commonEyes}<path d="M37 56 Q48 68 59 56 L55 65 H41 Z" fill="${muzzle}"/><circle cx="48" cy="55" r="3.8" fill="${dark}"/>`;
    case "zebra":
      return `${commonFace}${commonEyes}<path d="M35 32 L31 42 M42 29 L39 40 M49 28 L48 40 M56 29 L57 40 M62 32 L65 42" stroke="${dark}" stroke-width="2.6" stroke-linecap="round"/><ellipse cx="48" cy="60" rx="10" ry="8" fill="${muzzle}"/><circle cx="48" cy="56" r="3.4" fill="${dark}"/>`;
    default:
      return `${commonFace}${commonEyes}<ellipse cx="48" cy="60" rx="10" ry="8" fill="${muzzle}"/><circle cx="48" cy="56" r="3.4" fill="${dark}"/>`;
  }
}

function renderLetterIcon(iconKey, palette) {
  const letter = iconKey.replace("letter-", "").toUpperCase();
  return `
  <circle cx="48" cy="48" r="26" fill="${palette.face}" opacity="0.16"/>
  <text x="48" y="64" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="44" font-weight="800" fill="${palette.mark}">${letter}</text>
`;
}

function renderSymbolIcon(iconKey, palette) {
  const dark = palette.mark;
  const accent = palette.ear;
  const soft = palette.muzzle;

  switch (iconKey) {
    case "star":
      return `<path d="M48 18 L55 38 L76 38 L59 50 L65 72 L48 58 L31 72 L37 50 L20 38 L41 38 Z" fill="${dark}"/>`;
    case "confetti":
      return `
        <path d="M26 62 L42 34 L50 38 L34 66 Z" fill="${dark}"/>
        <circle cx="58" cy="33" r="5" fill="${accent}"/>
        <rect x="60" y="52" width="12" height="12" rx="3" fill="${dark}" transform="rotate(18 66 58)"/>
        <path d="M25 30 C30 24 34 24 38 30" stroke="${accent}" stroke-width="4" fill="none" stroke-linecap="round"/>
        <path d="M54 74 C61 66 67 66 73 73" stroke="${accent}" stroke-width="4" fill="none" stroke-linecap="round"/>
      `;
    case "wrench":
      return `
        <path d="M60 23 A10 10 0 0 1 49 35 L33 51 L27 45 L43 29 A10 10 0 0 1 55 18 L50 24 L54 30 Z" fill="${dark}"/>
        <circle cx="28" cy="68" r="9" fill="none" stroke="${dark}" stroke-width="6"/>
      `;
    case "iron":
      return `
        <path d="M23 60 C24 42 33 30 50 30 C61 30 69 36 73 48 L78 60 Z" fill="${dark}"/>
        <path d="M34 36 C35 28 41 23 49 23 C57 23 63 27 65 35" fill="none" stroke="${accent}" stroke-width="5" stroke-linecap="round"/>
        <path d="M29 54 H68" stroke="${soft}" stroke-width="4" stroke-linecap="round"/>
      `;
    case "cog":
      return `
        <circle cx="48" cy="48" r="20" fill="${dark}"/>
        <circle cx="48" cy="48" r="9" fill="${soft}"/>
        <path d="M48 15 V25 M48 71 V81 M15 48 H25 M71 48 H81 M25 25 L32 32 M64 64 L71 71 M25 71 L32 64 M64 32 L71 25" stroke="${accent}" stroke-width="6" stroke-linecap="round"/>
      `;
    case "pizza":
      return `
        <path d="M24 28 C40 22 56 22 72 28 L48 74 Z" fill="${accent}"/>
        <path d="M24 28 C40 22 56 22 72 28" stroke="${dark}" stroke-width="6" stroke-linecap="round" fill="none"/>
        <circle cx="45" cy="45" r="4" fill="${dark}"/>
        <circle cx="57" cy="50" r="4" fill="${dark}"/>
        <circle cx="48" cy="58" r="4" fill="${dark}"/>
      `;
    case "cake":
      return `
        <rect x="24" y="42" width="48" height="25" rx="8" fill="${dark}"/>
        <path d="M24 48 C31 42 37 54 44 48 C51 42 57 54 64 48 C68 45 70 46 72 48 V42 H24 Z" fill="${soft}"/>
        <rect x="44" y="24" width="8" height="15" rx="3" fill="${accent}"/>
        <path d="M48 18 C52 22 52 27 48 30 C44 27 44 22 48 18 Z" fill="${accent}"/>
      `;
    case "biscuit":
      return `
        <circle cx="48" cy="48" r="25" fill="${accent}"/>
        <circle cx="38" cy="40" r="3" fill="${dark}"/>
        <circle cx="57" cy="37" r="3" fill="${dark}"/>
        <circle cx="53" cy="51" r="3" fill="${dark}"/>
        <circle cx="39" cy="56" r="3" fill="${dark}"/>
        <circle cx="61" cy="60" r="3" fill="${dark}"/>
      `;
    case "water":
      return `<path d="M48 20 C60 34 68 44 68 56 C68 68 59 76 48 76 C37 76 28 68 28 56 C28 44 36 34 48 20 Z" fill="${dark}"/>`;
    case "planet":
      return `
        <circle cx="48" cy="47" r="18" fill="${dark}"/>
        <ellipse cx="48" cy="50" rx="31" ry="11" fill="none" stroke="${accent}" stroke-width="5"/>
        <circle cx="62" cy="34" r="3" fill="${soft}"/>
      `;
    case "cone":
      return `
        <path d="M48 20 L72 72 H24 Z" fill="${accent}"/>
        <path d="M41 40 H55 M36 53 H60 M31 66 H65" stroke="${soft}" stroke-width="5" stroke-linecap="round"/>
      `;
    case "stop":
      return `
        <path d="M36 19 H60 L77 36 V60 L60 77 H36 L19 60 V36 Z" fill="${dark}"/>
        <text x="48" y="54" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="800" fill="${soft}">STOP</text>
      `;
    case "yield":
      return `
        <path d="M48 20 L76 70 H20 Z" fill="${dark}"/>
        <path d="M48 33 L63 61 H33 Z" fill="${soft}"/>
        <rect x="45" y="43" width="6" height="11" rx="3" fill="${dark}"/>
        <circle cx="48" cy="58" r="3" fill="${dark}"/>
      `;
    case "parking":
      return `
        <rect x="24" y="20" width="48" height="56" rx="10" fill="${dark}"/>
        <text x="48" y="59" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="36" font-weight="800" fill="${soft}">P</text>
      `;
    case "hammer":
      return `
        <path d="M29 29 H54 V41 H45 L63 59 L56 66 L38 48 V57 H29 Z" fill="${dark}"/>
        <rect x="52" y="48" width="10" height="24" rx="5" fill="${accent}" transform="rotate(45 57 60)"/>
      `;
    case "bolt":
      return `<path d="M54 18 L33 49 H47 L42 78 L64 43 H50 Z" fill="${dark}"/>`;
    case "cloud":
      return `
        <path d="M31 63 C24 63 19 58 19 51 C19 45 24 40 30 40 C32 31 40 25 49 25 C59 25 67 32 68 42 C74 43 78 48 78 54 C78 60 73 65 66 65 Z" fill="${dark}"/>
      `;
    default:
      return `<circle cx="48" cy="48" r="22" fill="${dark}"/>`;
  }
}

function buildSvg({ animal, tone }) {
  const palette = palettes[tone];
  const iconMarkup = legacyAnimals.includes(animal) ? `${ears(animal, palette.ear)}${face(animal, palette)}` : animal.startsWith("letter-") ? renderLetterIcon(animal, palette) : renderSymbolIcon(animal, palette);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" role="img" aria-hidden="true">
  <rect width="96" height="96" rx="26" fill="${palette.bg}"/>
  <g transform="translate(48 48) scale(1.2) translate(-48 -48)">
    ${iconMarkup}
  </g>
</svg>
`;
}

fs.mkdirSync(avatarDir, { recursive: true });

for (const item of legacyDefinitions) {
  fs.writeFileSync(path.join(avatarDir, `${item.key}.svg`), buildSvg(item), "utf8");
}

for (const tone of standardTones) {
  for (const icon of supportedIcons) {
    const key = `${tone}-${icon}`;
    fs.writeFileSync(path.join(avatarDir, `${key}.svg`), buildSvg({ animal: icon, tone }), "utf8");
  }
}

console.log(`Generated ${legacyDefinitions.length + standardTones.length * supportedIcons.length} avatar SVGs in ${avatarDir}`);
