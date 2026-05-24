// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { DatabaseSync } from "node:sqlite";
import type { NotificationKind, NotificationSummary, PendingJoinRequestSummary } from "@planning-poker/shared";

export type PlatformAccessRequestSummary = {
  id: string;
  email: string;
  createdAt: string;
};

export type PlatformUserSummary = {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
  lastActiveAt: string;
};

export type PlatformUserSort = "recent" | "oldest" | "alpha" | "alpha-desc";

export type PlatformUsersPage = {
  users: PlatformUserSummary[];
  nextOffset: number | null;
};

type ActionHistoryScope = "platform" | "team";

export type NotificationFeedOptions = {
  includeSeenHistory?: boolean;
  includeActionHistory?: boolean;
};

export type NotificationFeed = {
  active: NotificationSummary[];
  history: NotificationSummary[];
  pendingJoinRequests: PendingJoinRequestSummary[];
  platformAccessRequests: PlatformAccessRequestSummary[];
  adminHistory: {
    items: NotificationSummary[];
    nextCursor: string | null;
  } | null;
};

function mapNotificationSummary(row: {
  id: string;
  kind: NotificationKind;
  title: string;
  message: string;
  team_id: string | null;
  team_name: string | null;
  created_at: string;
  seen_at: string | null;
  actor_display_name: string | null;
}): NotificationSummary {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    message: row.message,
    teamId: row.team_id,
    teamName: row.team_name,
    actorDisplayName: row.actor_display_name,
    createdAt: row.created_at,
    seenAt: row.seen_at
  };
}

function parseActionHistoryCursor(cursor: string): { createdAt: string; id: string } | null {
  const [createdAt, id] = cursor.split("|");
  if (!createdAt || !id) {
    return null;
  }
  return { createdAt, id };
}

export function getPlatformAccessRequests(db: DatabaseSync): PlatformAccessRequestSummary[] {
  const rows = db
    .prepare(
      `
      SELECT id, email, created_at
      FROM platform_access_requests
      ORDER BY created_at ASC
    `
    )
    .all() as Array<{ id: string; email: string; created_at: string }>;

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    createdAt: row.created_at
  }));
}

export function getPlatformUsers(
  db: DatabaseSync,
  options?: {
    offset?: number;
    limit?: number;
    query?: string;
    sort?: PlatformUserSort;
  }
): PlatformUsersPage {
  const offset = Math.max(options?.offset ?? 0, 0);
  const limit = Math.max(1, Math.min(options?.limit ?? 30, 100));
  const normalizedQuery = options?.query?.trim().toLowerCase() ?? "";
  const sort = options?.sort ?? "recent";
  const hasSearch = normalizedQuery.length >= 2;
  const searchClause = hasSearch ? "AND (LOWER(display_name) LIKE ? OR LOWER(email) LIKE ?)" : "";
  const orderClause =
    sort === "alpha"
      ? "ORDER BY display_name COLLATE NOCASE ASC, email COLLATE NOCASE ASC, created_at DESC"
      : sort === "alpha-desc"
        ? "ORDER BY display_name COLLATE NOCASE DESC, email COLLATE NOCASE DESC, created_at ASC"
        : sort === "oldest"
          ? "ORDER BY updated_at ASC, created_at ASC, email COLLATE NOCASE ASC"
          : "ORDER BY updated_at DESC, created_at DESC, email COLLATE NOCASE ASC";
  const params: Array<string | number> = [];

  if (hasSearch) {
    const likeValue = `%${normalizedQuery}%`;
    params.push(likeValue, likeValue);
  }
  params.push(limit + 1, offset);

  const rows = db
    .prepare(
      `
      SELECT id, email, display_name, created_at, updated_at, last_active_at
      FROM users
      WHERE is_super_admin = 0
      ${searchClause}
      ${orderClause}
      LIMIT ?
      OFFSET ?
    `
    )
    .all(...params) as Array<{
    id: string;
    email: string;
    display_name: string;
    created_at: string;
    updated_at: string;
    last_active_at: string;
  }>;

  return {
    users: rows.slice(0, limit).map((row) => ({
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastActiveAt: row.last_active_at
    })),
    nextOffset: rows.length > limit ? offset + limit : null
  };
}

export function getActionHistoryPage(
  db: DatabaseSync,
  viewerUserId: string,
  teamId: string | null,
  cursor: string | null | undefined,
  limit: number,
  helpers: {
    isSuperAdmin(userId: string): boolean;
    getTeamUserRole(userId: string, teamId: string): string;
  }
): { items: NotificationSummary[]; nextCursor: string | null } | null {
  const isSuperAdmin = helpers.isSuperAdmin(viewerUserId);
  if (!isSuperAdmin) {
    if (!teamId || helpers.getTeamUserRole(viewerUserId, teamId) !== "team_admin") {
      return null;
    }
  }

  const parsedCursor = cursor ? parseActionHistoryCursor(cursor) : null;
  const cursorClause = parsedCursor ? "AND (ah.created_at < ? OR (ah.created_at = ? AND ah.id < ?))" : "";
  const params: Array<string | number> = [];
  let whereClause = "";

  if (isSuperAdmin) {
    whereClause = "WHERE 1 = 1";
  } else {
    whereClause = "WHERE ah.scope = 'team' AND ah.team_id = ?";
    params.push(teamId!);
  }

  if (parsedCursor) {
    params.push(parsedCursor.createdAt, parsedCursor.createdAt, parsedCursor.id);
  }
  params.push(limit + 1);

  const rows = db
    .prepare(
      `
      SELECT
        ah.id,
        ah.kind,
        ah.title,
        ah.message,
        ah.team_id,
        t.name AS team_name,
        ah.created_at,
        actor.display_name AS actor_display_name
      FROM action_history ah
      LEFT JOIN teams t ON t.id = ah.team_id
      LEFT JOIN users actor ON actor.id = ah.actor_user_id
      ${whereClause}
      ${cursorClause}
      ORDER BY ah.created_at DESC, ah.id DESC
      LIMIT ?
    `
    )
    .all(...params) as Array<{
    id: string;
    kind: string;
    title: string;
    message: string;
    team_id: string | null;
    team_name: string | null;
    created_at: string;
    actor_display_name: string | null;
  }>;

  const page = rows.slice(0, limit).map((row) => ({
    id: row.id,
    kind: row.kind as NotificationSummary["kind"],
    title: row.title,
    message: row.message,
    teamId: row.team_id,
    teamName: row.team_name,
    actorDisplayName: row.actor_display_name,
    createdAt: row.created_at,
    seenAt: row.created_at
  }));
  const nextRow = rows.length > limit ? rows[limit] : null;

  return {
    items: page,
    nextCursor: nextRow ? `${nextRow.created_at}|${nextRow.id}` : null
  };
}

export function getNotificationFeed(
  db: DatabaseSync,
  userId: string,
  teamId: string | null | undefined,
  options: NotificationFeedOptions | undefined,
  helpers: {
    isSuperAdmin(userId: string): boolean;
    getPendingJoinRequestsForViewer(userId: string): PendingJoinRequestSummary[];
    getPlatformAccessRequests(): PlatformAccessRequestSummary[];
    getActionHistoryPage(
      viewerUserId: string,
      historyTeamId: string | null,
      cursor?: string | null,
      limit?: number
    ): { items: NotificationSummary[]; nextCursor: string | null } | null;
  }
): NotificationFeed {
  const includeSeenHistory = options?.includeSeenHistory ?? true;
  const includeActionHistory = options?.includeActionHistory ?? true;
  const active = db
    .prepare(
      `
      SELECT
        n.id,
        n.kind,
        n.title,
        n.message,
        n.team_id,
        t.name AS team_name,
        n.created_at,
        n.seen_at,
        actor.display_name AS actor_display_name
      FROM notifications n
      LEFT JOIN teams t ON t.id = n.team_id
      LEFT JOIN users actor ON actor.id = n.actor_user_id
      WHERE n.user_id = ? AND n.seen_at IS NULL
      ORDER BY n.created_at DESC
    `
    )
    .all(userId) as Array<{
    id: string;
    kind: NotificationKind;
    title: string;
    message: string;
    team_id: string | null;
    team_name: string | null;
    created_at: string;
    seen_at: string | null;
    actor_display_name: string | null;
  }>;

  const history = includeSeenHistory
    ? ((db
        .prepare(
          `
          SELECT
            n.id,
            n.kind,
            n.title,
            n.message,
            n.team_id,
            t.name AS team_name,
            n.created_at,
            n.seen_at,
            actor.display_name AS actor_display_name
          FROM notifications n
          LEFT JOIN teams t ON t.id = n.team_id
          LEFT JOIN users actor ON actor.id = n.actor_user_id
          WHERE n.user_id = ? AND n.seen_at IS NOT NULL
          ORDER BY n.created_at DESC
          LIMIT 80
        `
        )
        .all(userId) as Array<{
        id: string;
        kind: NotificationKind;
        title: string;
        message: string;
        team_id: string | null;
        team_name: string | null;
        created_at: string;
        seen_at: string | null;
        actor_display_name: string | null;
      }>))
    : [];

  return {
    active: active.map(mapNotificationSummary),
    history: history.map(mapNotificationSummary),
    pendingJoinRequests: helpers.getPendingJoinRequestsForViewer(userId),
    platformAccessRequests: helpers.isSuperAdmin(userId) ? helpers.getPlatformAccessRequests() : [],
    adminHistory: includeActionHistory ? helpers.getActionHistoryPage(userId, teamId ?? null) : null
  };
}

export function markNotificationsSeen(db: DatabaseSync, userId: string, seenAt: string): void {
  db.prepare("UPDATE notifications SET seen_at = ? WHERE user_id = ? AND seen_at IS NULL").run(seenAt, userId);
}

export function createNotification(
  db: DatabaseSync,
  input: {
    id: string;
    userId: string;
    kind: NotificationKind;
    title: string;
    message: string;
    teamId: string | null;
    actorUserId: string | null;
    createdAt: string;
  }
): void {
  db.prepare(
    `
    INSERT INTO notifications(id, user_id, kind, title, message, team_id, actor_user_id, created_at, seen_at)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, NULL)
  `
  ).run(input.id, input.userId, input.kind, input.title, input.message, input.teamId, input.actorUserId, input.createdAt);
}

export function createActionHistory(
  db: DatabaseSync,
  input: {
    id: string;
    scope: ActionHistoryScope;
    kind: string;
    title: string;
    message: string;
    teamId: string | null;
    actorUserId: string | null;
    createdAt: string;
  }
): void {
  db.prepare(
    `
    INSERT INTO action_history(id, scope, kind, title, message, team_id, actor_user_id, created_at)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(input.id, input.scope, input.kind, input.title, input.message, input.teamId, input.actorUserId, input.createdAt);
}

export function trimNotifications(db: DatabaseSync, userId: string): void {
  db.prepare(
    `
    DELETE FROM notifications
    WHERE user_id = ?
      AND id NOT IN (
        SELECT id
        FROM notifications
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 80
      )
  `
  ).run(userId, userId);
}
