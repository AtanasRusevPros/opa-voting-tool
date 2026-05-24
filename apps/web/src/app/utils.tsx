// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import { BRANDING_MANIFEST, DEFAULT_HISTORY_TIME_ZONE_KEYS, HISTORY_TIME_ZONE_OPTIONS, buildAvatarAssetKey, getDeckLabel, type HistoryEntry, type HistoryTimeZoneKey, type RoundState, type TeamStateResponse, type UserSummary } from "@planning-poker/shared";
import type { HistoryGroup, HistoryTooltipRow } from "./types";

export function getAvatarUrl(avatarIconKey: string, avatarColorKey: string): string {
  return `/branding/avatars/${buildAvatarAssetKey(avatarIconKey, avatarColorKey)}.svg`;
}

export function pickRandomAvatarSelection(): { avatarIconKey: string; avatarColorKey: string } {
  const iconIndex = Math.floor(Math.random() * BRANDING_MANIFEST.avatarIconKeys.length);
  const colorIndex = Math.floor(Math.random() * BRANDING_MANIFEST.avatarColorKeys.length);
  return {
    avatarIconKey: BRANDING_MANIFEST.avatarIconKeys[iconIndex] ?? BRANDING_MANIFEST.avatarIconKeys[0],
    avatarColorKey: BRANDING_MANIFEST.avatarColorKeys[colorIndex] ?? BRANDING_MANIFEST.avatarColorKeys[0]
  };
}

export function deriveDisplayNameFromEmail(email: string): string {
  const localPart = email.split("@")[0] ?? "";
  const baseName = localPart.split(/[._+-]/)[0]?.trim() || localPart.trim();
  const cleaned = baseName.replace(/[^a-zA-Z0-9]/g, "");
  const normalized = cleaned || "User";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase();
}

export function truncateLabel(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}...`;
}

export function formatHistoryDisplay(dateIso: string): { heading: string; tooltip: string } {
  const date = new Date(dateIso);
  const heading = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
  const rows = getHistoryTooltipRows(dateIso, DEFAULT_HISTORY_TIME_ZONE_KEYS);
  return {
    heading,
    tooltip: rows.map((row) => `${row.label}: ${row.value}`).join("\n")
  };
}

export function formatTimeZoneOffsetLabel(timeZone: string, date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const partValue = (type: string) => parts.find((part) => part.type === type)?.value ?? "0";
  const zonedAsUtc = Date.UTC(
    Number(partValue("year")),
    Number(partValue("month")) - 1,
    Number(partValue("day")),
    Number(partValue("hour")),
    Number(partValue("minute")),
    Number(partValue("second"))
  );
  const offsetMinutes = Math.round((zonedAsUtc - date.getTime()) / 60000);
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteMinutes = Math.abs(offsetMinutes);
  const hours = Math.floor(absoluteMinutes / 60);
  const minutes = absoluteMinutes % 60;
  const hourText = String(hours).padStart(2, "0");
  const minuteText = minutes === 0 ? "" : `:${String(minutes).padStart(2, "0")}`;
  return `GMT ${sign}${hourText}${minuteText}`;
}

export function getHistoryTooltipRows(
  dateIso: string,
  timeZoneKeys: readonly HistoryTimeZoneKey[] = DEFAULT_HISTORY_TIME_ZONE_KEYS
): HistoryTooltipRow[] {
  const date = new Date(dateIso);
  return timeZoneKeys
    .map((key) => HISTORY_TIME_ZONE_OPTIONS.find((option) => option.key === key))
    .filter((option): option is (typeof HISTORY_TIME_ZONE_OPTIONS)[number] => Boolean(option))
    .map((option) => ({
      label: option.label,
      value: new Intl.DateTimeFormat(option.locale, {
        timeZone: option.timeZone,
        weekday: option.key === "gmt" ? "long" : undefined,
        year: "numeric",
        month: option.key === "gmt" ? "long" : "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      }).format(date)
    }));
}

export function groupHistory(history: HistoryEntry[]): HistoryGroup[] {
  const map = new Map<string, HistoryGroup>();
  for (const entry of history) {
    const existing = map.get(entry.completedAt);
    if (existing) {
      existing.items.push(entry);
      continue;
    }

    const display = formatHistoryDisplay(entry.completedAt);
    map.set(entry.completedAt, {
      key: entry.completedAt,
      heading: display.heading,
      tooltipRows: getHistoryTooltipRows(entry.completedAt),
      items: [entry]
    });
  }
  return [...map.values()];
}

export function renderVoteCardStatus(status: string) {
  if (status === "Waiting") {
    return (
      <span className="vote-card-label vote-card-label-diagonal" aria-hidden="true">
        Waiting
      </span>
    );
  }

  if (status === "No vote") {
    return (
      <span className="vote-card-label vote-card-label-compact" aria-hidden="true">
        No vote
      </span>
    );
  }

  if (status === "Break Pls") {
    return (
      <span className="vote-card-label vote-card-label-break" aria-hidden="true">
        Break
        <br />
        Pls
      </span>
    );
  }

  return status;
}

export function getPlanningCardLabel(card: string): string {
  return card === "coffee" ? "Break Pls" : card;
}

export function formatVoteValue(value: string): string {
  return value === "coffee" ? "Break Pls" : value;
}

export function renderPlanningCardContent(card: string) {
  if (card === "coffee") {
    return (
      <span className="card-break-label" aria-hidden="true">
        Break
        <br />
        Pls
      </span>
    );
  }

  return card;
}

export const CARD_SHORTCUT_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "=", "[", "]"] as const;

export function confirmVoteAgain(title: string): boolean {
  return window.confirm(`Start voting again for "${title}"?`);
}

export function getCardShortcutLabel(index: number): string | null {
  return CARD_SHORTCUT_KEYS[index] ?? null;
}

export function isTextEntryTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) {
    return false;
  }
  if (element.isContentEditable) {
    return true;
  }
  const tagName = element.tagName;
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
}

export function formatCommentTimestamp(dateIso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(dateIso));
}

export function getVisibleActiveParticipants(state: Pick<TeamStateResponse, "activeParticipants" | "currentUserRole" | "currentUser" | "teamMembers">) {
  if (state.currentUserRole === "none") {
    return state.activeParticipants;
  }

  if (state.activeParticipants.some((participant) => participant.id === state.currentUser.id)) {
    return state.activeParticipants;
  }

  const currentMember = state.teamMembers.find((member) => member.id === state.currentUser.id);
  if (!currentMember) {
    return state.activeParticipants;
  }

  return [currentMember, ...state.activeParticipants];
}

export function getHistorySummaryDeckLabel(entry: Pick<HistoryEntry, "deckKey" | "fibonacciRangeStart" | "fibonacciRangeEnd">): string {
  return getDeckLabel(entry.deckKey, {
    fibonacciRangeStart: entry.fibonacciRangeStart,
    fibonacciRangeEnd: entry.fibonacciRangeEnd
  });
}

export function getCardStatus(member: UserSummary, activeRound: RoundState | null, currentUserId: string) {
  if (!activeRound) {
    return "Waiting";
  }
  const vote = activeRound.votes.find((item) => item.userId === member.id);
  if (!vote) {
    return "No vote";
  }
  if (member.id === currentUserId) {
    return formatVoteValue(vote.value);
  }
  return activeRound.status === "revealed" ? formatVoteValue(vote.value) : "Voted";
}
