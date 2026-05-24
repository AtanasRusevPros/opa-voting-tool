// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import crypto from "node:crypto";
import {
  BRANDING_MANIFEST,
  DEFAULT_HISTORY_TIME_ZONE_KEYS,
  normalizeFibonacciRange,
  normalizeHistoryTimeZoneKeys,
  resolveAvatarSelection,
  type AverageValue,
  type FibonacciRangeEnd,
  type FibonacciRangeStart,
  type HistoryTimeZoneKey
} from "@planning-poker/shared";

export function nowIso(): string {
  return new Date().toISOString();
}

export function plusMinutes(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

export function plusDays(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60_000).toISOString();
}

export function plusSeconds(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

export function deriveDisplayNameFromEmail(email: string): string {
  const localPart = email.split("@")[0] ?? "";
  const baseName = localPart.split(/[._+-]/)[0]?.trim() || localPart.trim();
  const cleaned = baseName.replace(/[^a-zA-Z0-9]/g, "");
  const normalized = cleaned || "User";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase();
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function createCode(): string {
  return Array.from({ length: 16 }, () => Math.floor(Math.random() * 10)).join("");
}

export function normalizeAverageValue(value: string | number | null): AverageValue | null {
  if (value == null || typeof value === "number") {
    return value;
  }

  return value === "XS" || value === "S" || value === "M" || value === "L" || value === "XL" ? value : null;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const digest = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${digest}`;
}

export function verifyPasswordHash(password: string, storedHash: string | null | undefined): boolean {
  if (!storedHash) {
    return false;
  }

  const [salt, digest] = storedHash.split(":");
  if (!salt || !digest) {
    return false;
  }

  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(digest, "hex");
  if (candidate.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(candidate, expected);
}

export function stringifyHistoryTimeZoneKeys(keys: readonly HistoryTimeZoneKey[]) {
  return JSON.stringify(normalizeHistoryTimeZoneKeys(keys));
}

export function parseHistoryTimeZoneKeys(value: string | null | undefined): HistoryTimeZoneKey[] {
  if (!value) {
    return [...DEFAULT_HISTORY_TIME_ZONE_KEYS];
  }

  try {
    const parsed = JSON.parse(value);
    return normalizeHistoryTimeZoneKeys(Array.isArray(parsed) ? parsed : null);
  } catch {
    return [...DEFAULT_HISTORY_TIME_ZONE_KEYS];
  }
}

export function normalizeStoredFibonacciRange(start: string | null | undefined, end: string | null | undefined): {
  fibonacciRangeStart: FibonacciRangeStart | null;
  fibonacciRangeEnd: FibonacciRangeEnd | null;
} {
  return normalizeFibonacciRange(start, end);
}

export function normalizeMinimumVotePercent(value: number | null | undefined): number {
  if (!Number.isFinite(value)) {
    return 75;
  }
  return Math.max(1, Math.min(100, Math.round(value ?? 75)));
}

export function createRandomPassword(length = 18) {
  return crypto
    .randomBytes(length)
    .toString("base64url")
    .slice(0, length);
}

export function pickRandomAvatarSelection() {
  const avatarIconKey = BRANDING_MANIFEST.avatarIconKeys[Math.floor(Math.random() * BRANDING_MANIFEST.avatarIconKeys.length)] ?? "bear";
  const avatarColorKey = BRANDING_MANIFEST.avatarColorKeys[Math.floor(Math.random() * BRANDING_MANIFEST.avatarColorKeys.length)] ?? "azure";
  return resolveAvatarSelection({ avatarIconKey, avatarColorKey });
}
