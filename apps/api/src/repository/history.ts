// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { DatabaseSync } from "node:sqlite";
import {
  resolveAvatarSelection,
  type HistoryPage,
  type HistoryPageCursor,
  type HistoryComment,
  type HistoryEntry,
  type TeamHistorySearchFilters,
  type TeamHistorySearchPage,
  type VoteRecord
} from "@planning-poker/shared";
import { normalizeAverageValue, normalizeStoredFibonacciRange } from "./helpers.js";
import type { HistoryCommentRow, HistoryRow } from "../types.js";

const DEFAULT_HISTORY_PAGE_LIMIT = 20;
const MAX_HISTORY_PAGE_LIMIT = 100;

function clampHistoryPageLimit(limit: number | null | undefined) {
  if (!Number.isFinite(limit)) {
    return DEFAULT_HISTORY_PAGE_LIMIT;
  }
  return Math.max(1, Math.min(MAX_HISTORY_PAGE_LIMIT, Math.trunc(limit ?? DEFAULT_HISTORY_PAGE_LIMIT)));
}

function buildAuthorSignature(row: Pick<HistoryCommentRow, "author_signature" | "display_name" | "email">) {
  return row.author_signature || `${row.display_name} (${row.email})`;
}

function inflateHistoryComment(row: HistoryCommentRow): HistoryComment {
  return {
    id: row.id,
    historyEntryId: row.history_entry_id,
    author: {
      id: row.user_id,
      email: row.email,
      displayName: row.display_name,
      ...resolveAvatarSelection({
        avatarIconKey: row.avatar_icon_key,
        avatarColorKey: row.avatar_color_key,
        avatarKey: row.avatar_key
      })
    },
    authorSignature: buildAuthorSignature(row),
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    importedImmutable: row.imported_immutable === 1
  };
}

export function inflateHistoryEntry(row: HistoryRow, comments: HistoryComment[]): HistoryEntry {
  const fibonacciRange = normalizeStoredFibonacciRange(row.fibonacci_range_start, row.fibonacci_range_end);
  return {
    id: row.id,
    teamId: row.team_id,
    title: row.title,
    deckKey: row.deck_key,
    fibonacciRangeStart: fibonacciRange.fibonacciRangeStart,
    fibonacciRangeEnd: fibonacciRange.fibonacciRangeEnd,
    averageScore: normalizeAverageValue(row.average_score),
    participantCount: row.participant_count,
    quorumBlocked: row.quorum_blocked === 1,
    votedCount: row.voted_count,
    notVotedCount: row.not_voted_count,
    completedAt: row.completed_at,
    votes: (JSON.parse(row.votes_json) as Array<VoteRecord & { avatarKey?: string }>).map((vote) => ({
      ...vote,
      ...resolveAvatarSelection(vote)
    })),
    comments
  };
}

export function getHistoryCommentsByEntryId(db: DatabaseSync, historyEntryIds: string[]): Map<string, HistoryComment[]> {
  const commentsByEntryId = new Map<string, HistoryComment[]>();
  if (historyEntryIds.length === 0) {
    return commentsByEntryId;
  }

  const placeholders = historyEntryIds.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `
      SELECT
        hc.id,
        hc.history_entry_id,
        hc.user_id,
        hc.author_signature,
        hc.imported_immutable,
        hc.body,
        hc.created_at,
        hc.updated_at,
        CASE WHEN u.deleted_at IS NULL THEN u.email ELSE '' END AS email,
        u.display_name,
        u.avatar_key,
        u.avatar_icon_key,
        u.avatar_color_key
      FROM history_comments hc
      JOIN users u ON u.id = hc.user_id
      WHERE hc.history_entry_id IN (${placeholders})
      ORDER BY hc.created_at DESC, hc.rowid DESC
    `
    )
    .all(...historyEntryIds) as unknown as HistoryCommentRow[];

  for (const row of rows) {
    const comments = commentsByEntryId.get(row.history_entry_id) ?? [];
    comments.push(inflateHistoryComment(row));
    commentsByEntryId.set(row.history_entry_id, comments);
  }

  return commentsByEntryId;
}

export function getHistory(db: DatabaseSync, teamId: string): HistoryEntry[] {
  const rows = db
    .prepare(
      `
      SELECT id, team_id, title, deck_key, fibonacci_range_start, fibonacci_range_end, average_score, participant_count, quorum_blocked, voted_count, not_voted_count, completed_at, votes_json
      FROM history_entries
      WHERE team_id = ?
      ORDER BY completed_at DESC, id DESC
    `
    )
    .all(teamId) as unknown as HistoryRow[];
  const commentsByEntryId = getHistoryCommentsByEntryId(db, rows.map((row) => row.id));

  return rows.map((row) => inflateHistoryEntry(row, commentsByEntryId.get(row.id) ?? []));
}

export function getHistoryPage(
  db: DatabaseSync,
  teamId: string,
  options?: { cursor?: HistoryPageCursor | null; limit?: number | null }
): HistoryPage {
  const limit = clampHistoryPageLimit(options?.limit);
  const whereClauses = ["team_id = ?"];
  const params: Array<string | number> = [teamId];
  if (options?.cursor) {
    whereClauses.push("(completed_at < ? OR (completed_at = ? AND id < ?))");
    params.push(options.cursor.completedAt, options.cursor.completedAt, options.cursor.id);
  }

  const rows = db
    .prepare(
      `
      SELECT id, team_id, title, deck_key, fibonacci_range_start, fibonacci_range_end, average_score, participant_count, quorum_blocked, voted_count, not_voted_count, completed_at, votes_json
      FROM history_entries
      WHERE ${whereClauses.join(" AND ")}
      ORDER BY completed_at DESC, id DESC
      LIMIT ?
    `
    )
    .all(...params, limit + 1) as unknown as HistoryRow[];

  const pageRows = rows.slice(0, limit);
  const commentsByEntryId = getHistoryCommentsByEntryId(db, pageRows.map((row) => row.id));
  const items = pageRows.map((row) => inflateHistoryEntry(row, commentsByEntryId.get(row.id) ?? []));
  const hasMore = rows.length > limit;
  const cursorSource = hasMore ? pageRows[pageRows.length - 1] : null;

  return {
    items,
    nextCursor: cursorSource
      ? {
          completedAt: cursorSource.completed_at,
          id: cursorSource.id
        }
      : null
  };
}

export function getHistoryEntryById(db: DatabaseSync, teamId: string, historyEntryId: string): HistoryEntry | null {
  const row = db
    .prepare(
      `
      SELECT id, team_id, title, deck_key, fibonacci_range_start, fibonacci_range_end, average_score, participant_count, quorum_blocked, voted_count, not_voted_count, completed_at, votes_json
      FROM history_entries
      WHERE team_id = ? AND id = ?
      LIMIT 1
    `
    )
    .get(teamId, historyEntryId) as HistoryRow | undefined;

  if (!row) {
    return null;
  }

  return inflateHistoryEntry(row, getHistoryCommentsByEntryId(db, [row.id]).get(row.id) ?? []);
}

export function searchHistoryPage(
  db: DatabaseSync,
  teamId: string,
  filters: TeamHistorySearchFilters,
  options?: { cursor?: HistoryPageCursor | null; limit?: number | null }
): TeamHistorySearchPage {
  const limit = clampHistoryPageLimit(options?.limit);
  const whereClauses = ["he.team_id = ?"];
  const params: Array<string | number> = [teamId];

  if (filters.dateFrom) {
    whereClauses.push("substr(he.completed_at, 1, 10) >= ?");
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    whereClauses.push("substr(he.completed_at, 1, 10) <= ?");
    params.push(filters.dateTo);
  }
  if (filters.titleQuery) {
    if (filters.exactTitleMatch) {
      whereClauses.push("lower(he.title) = ?");
      params.push(filters.titleQuery.trim().toLowerCase());
    } else {
      whereClauses.push("lower(he.title) LIKE ?");
      params.push(`%${filters.titleQuery.trim().toLowerCase()}%`);
    }
  }
  if (filters.commentQuery) {
    whereClauses.push(
      `
      EXISTS (
        SELECT 1
        FROM history_comments hc
        WHERE hc.history_entry_id = he.id
          AND lower(hc.body) LIKE ?
      )
    `
    );
    params.push(`%${filters.commentQuery.trim().toLowerCase()}%`);
  }
  if (filters.personQuery) {
    const likeValue = `%${filters.personQuery.trim().toLowerCase()}%`;
    whereClauses.push(
      `
      (
        EXISTS (
          SELECT 1
          FROM json_each(he.votes_json) vote
          LEFT JOIN users vu ON vu.id = json_extract(vote.value, '$.userId')
          WHERE lower(COALESCE(json_extract(vote.value, '$.displayName'), '')) LIKE ?
             OR lower(COALESCE(vu.display_name, '')) LIKE ?
             OR lower(CASE WHEN vu.deleted_at IS NULL THEN COALESCE(vu.email, '') ELSE '' END) LIKE ?
        )
        OR EXISTS (
          SELECT 1
          FROM history_comments hc
          LEFT JOIN users cu ON cu.id = hc.user_id
          WHERE hc.history_entry_id = he.id
            AND (
              lower(COALESCE(hc.author_signature, '')) LIKE ?
              OR lower(COALESCE(cu.display_name, '')) LIKE ?
              OR lower(CASE WHEN cu.deleted_at IS NULL THEN COALESCE(cu.email, '') ELSE '' END) LIKE ?
            )
        )
      )
    `
    );
    params.push(likeValue, likeValue, likeValue, likeValue, likeValue, likeValue);
  }
  if (options?.cursor) {
    whereClauses.push("(he.completed_at < ? OR (he.completed_at = ? AND he.id < ?))");
    params.push(options.cursor.completedAt, options.cursor.completedAt, options.cursor.id);
  }

  const rows = db
    .prepare(
      `
      SELECT he.id, he.team_id, he.title, he.deck_key, he.fibonacci_range_start, he.fibonacci_range_end, he.average_score, he.participant_count, he.quorum_blocked, he.voted_count, he.not_voted_count, he.completed_at, he.votes_json
      FROM history_entries he
      WHERE ${whereClauses.join(" AND ")}
      ORDER BY he.completed_at DESC, he.id DESC
      LIMIT ?
    `
    )
    .all(...params, limit + 1) as unknown as HistoryRow[];

  const pageRows = rows.slice(0, limit);
  const commentsByEntryId = getHistoryCommentsByEntryId(db, pageRows.map((row) => row.id));
  const items = pageRows.map((row) => inflateHistoryEntry(row, commentsByEntryId.get(row.id) ?? []));
  const hasMore = rows.length > limit;
  const cursorSource = hasMore ? pageRows[pageRows.length - 1] : null;

  return {
    items,
    nextCursor: cursorSource
      ? {
          completedAt: cursorSource.completed_at,
          id: cursorSource.id
        }
      : null,
    filters
  };
}

export function getLatestHistoryEntry(db: DatabaseSync, teamId: string): HistoryEntry | null {
  const row = db
    .prepare(
      `
      SELECT id, team_id, title, deck_key, fibonacci_range_start, fibonacci_range_end, average_score, participant_count, quorum_blocked, voted_count, not_voted_count, completed_at, votes_json
      FROM history_entries
      WHERE team_id = ?
      ORDER BY completed_at DESC
      LIMIT 1
    `
    )
    .get(teamId) as HistoryRow | undefined;

  if (!row) {
    return null;
  }

  return inflateHistoryEntry(row, getHistoryCommentsByEntryId(db, [row.id]).get(row.id) ?? []);
}

export function historyEntryExists(db: DatabaseSync, teamId: string, historyEntryId: string): boolean {
  const historyEntry = db
    .prepare("SELECT id FROM history_entries WHERE id = ? AND team_id = ?")
    .get(historyEntryId, teamId) as { id: string } | undefined;
  return Boolean(historyEntry);
}

export function insertHistoryComment(
  db: DatabaseSync,
  input: {
    id: string;
    historyEntryId: string;
    userId: string;
    authorSignature: string;
    importedImmutable?: boolean;
    body: string;
    createdAt: string;
  }
): void {
  db.prepare(
    `
    INSERT INTO history_comments(id, history_entry_id, user_id, author_signature, imported_immutable, body, created_at, updated_at)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    input.id,
    input.historyEntryId,
    input.userId,
    input.authorSignature,
    input.importedImmutable ? 1 : 0,
    input.body,
    input.createdAt,
    input.createdAt
  );
}

export function updateHistoryCommentBody(db: DatabaseSync, commentId: string, body: string, updatedAt: string): void {
  db.prepare("UPDATE history_comments SET body = ?, updated_at = ? WHERE id = ?").run(body, updatedAt, commentId);
}

export function deleteHistoryCommentById(db: DatabaseSync, commentId: string): void {
  db.prepare("DELETE FROM history_comments WHERE id = ?").run(commentId);
}

export function getHistoryComment(db: DatabaseSync, historyEntryId: string, commentId: string): HistoryComment | null {
  return getHistoryCommentsByEntryId(db, [historyEntryId]).get(historyEntryId)?.find((comment) => comment.id === commentId) ?? null;
}

export function getOwnedHistoryComment(
  db: DatabaseSync,
  teamId: string,
  historyEntryId: string,
  commentId: string,
  userId: string
): { id: string; createdAt: string; updatedAt: string } {
  const row = db
    .prepare(
      `
      SELECT hc.id, hc.created_at, hc.updated_at, hc.imported_immutable
      FROM history_comments hc
      JOIN history_entries he ON he.id = hc.history_entry_id
      WHERE hc.id = ?
        AND hc.history_entry_id = ?
        AND hc.user_id = ?
        AND he.team_id = ?
    `
    )
    .get(commentId, historyEntryId, userId, teamId) as { id: string; created_at: string; updated_at: string; imported_immutable: number } | undefined;

  if (!row) {
    throw new Error("You can only edit or delete your own comments.");
  }
  if (row.imported_immutable === 1) {
    throw new Error("Imported historical comments are read-only.");
  }

  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
