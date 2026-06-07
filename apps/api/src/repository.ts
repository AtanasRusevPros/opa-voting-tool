// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { nanoid } from "nanoid";
import {
  BRANDING_MANIFEST,
  DECKS,
  DEFAULT_DECK_KEY,
  DEFAULT_HISTORY_TIME_ZONE_KEYS,
  DEFAULT_HISTORY_TIME_ZONE_POPUP_ENABLED,
  TEAM_TIMER_OPTIONS,
  buildAvatarAssetKey,
  calculateAverage,
  normalizeFibonacciRange,
  normalizeHistoryTimeZoneKeys,
  resolveAvatarSelection,
  type AverageValue,
  type CurrentUserSummary,
  type DeckKey,
  type FibonacciRangeEnd,
  type FibonacciRangeStart,
  type HistoryEntry,
  type HistoryComment,
  type HistoryPage,
  type TeamHistoryExportPackage,
  type TeamHistorySearchFilters,
  type TeamHistorySearchPage,
  type HistoryTimeZoneKey,
  type NotificationKind,
  type NotificationSummary,
  type PendingJoinRequestSummary,
  type RoundState,
  type TeamMemberSummary,
  type TeamJoinRequestStatus,
  type TeamTimerSeconds,
  type TeamMembershipSummary,
  type TeamPendingIssue,
  type TeamStateResponse,
  type TeamSummary,
  type TeamUserRole,
  type UserSummary,
  type VoteRecord
} from "@planning-poker/shared";
import {
  createCode,
  createRandomPassword,
  deriveDisplayNameFromEmail,
  hashPassword,
  normalizeAverageValue,
  normalizeMinimumVotePercent,
  normalizeStoredFibonacciRange,
  nowIso,
  parseHistoryTimeZoneKeys,
  pickRandomAvatarSelection,
  plusDays,
  plusMinutes,
  plusSeconds,
  slugify,
  stringifyHistoryTimeZoneKeys,
  verifyPasswordHash
} from "./repository/helpers.js";
import {
  deleteHistoryCommentById,
  getHistoryEntryById,
  getHistoryPage,
  getHistory,
  getHistoryComment,
  getLatestHistoryEntry,
  getOwnedHistoryComment,
  historyEntryExists,
  insertHistoryComment,
  searchHistoryPage,
  updateHistoryCommentBody
} from "./repository/history.js";
import {
  createActionHistory,
  createNotification,
  getActionHistoryPage,
  getNotificationFeed,
  getPlatformAccessRequests,
  getPlatformUsers,
  markNotificationsSeen,
  type NotificationFeed,
  type PlatformUserSort,
  trimNotifications
} from "./repository/notifications.js";
import { runBaseSchema } from "./repository/schema.js";
import type { AppConfig, HistoryCommentRow, HistoryRow, RoundRow, SessionUser } from "./types.js";
import { perfTracker } from "./perf.js";

interface RequestCodeResult {
  code: string;
  expiresAt: string;
}

interface PlatformAccessRequestSummary {
  id: string;
  email: string;
  createdAt: string;
}

interface PlatformUserSummary {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
  lastActiveAt: string;
}

type EnsureUserInput = {
  email: string;
  displayName: string;
  avatarIconKey: string;
  avatarColorKey: string;
};

type EnsureSimulatorTeamInput = {
  name: string;
  memberUserIds: string[];
};

type EnsureSeededTeamInput = EnsureSimulatorTeamInput & {
  demo: boolean;
  joinOwnerAsAdmin: boolean;
};

const JIRA_PENDING_ISSUE_SOURCE = "jira_cloud" as const;
const DEFAULT_WORKSPACE_ID = "default-workspace";
const DEFAULT_WORKSPACE_NAME = "Default Workspace";
const PUBLIC_TRIAL_TERMS_VERSION = "public-trial-alpha-2026-06-05";
const PUBLIC_TRIAL_WORKSPACE_NAME = "My First Workspace";
const PUBLIC_TRIAL_STARTER_TEAM_NAME = "My First Team";

type TeamPermissionContext = {
  isSuperAdmin: boolean;
  role: TeamUserRole;
};

type ActionHistoryScope = "platform" | "team";
type WorkspaceUserRole = "none" | "member" | "admin" | "owner";
type NotificationFeedOptions = {
  includeSeenHistory?: boolean;
  includeActionHistory?: boolean;
};

type WorkspaceSummary = {
  id: string;
  name: string;
  kind: "default" | "public_trial" | "private";
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
};

type PublicTrialSignupResult = {
  user: SessionUser;
  workspace: WorkspaceSummary;
  team: TeamSummary;
};

export class RoundNotActiveError extends Error {
  constructor(message = "This round has already been revealed. Late votes are not accepted.") {
    super(message);
    this.name = "RoundNotActiveError";
  }
}

export class Repository {
  private db!: DatabaseSync;
  private simulatorHeartbeatAt = 0;

  constructor(private readonly config: AppConfig) {
    this.openDatabase();
  }

  private openDatabase(): void {
    fs.mkdirSync(path.dirname(this.config.databasePath), { recursive: true });
    this.db = new DatabaseSync(this.config.databasePath);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA synchronous = FULL");
    this.db.exec("PRAGMA busy_timeout = 5000");
    this.db.exec("PRAGMA wal_autocheckpoint = 200");
    this.db.exec("PRAGMA foreign_keys = ON");
    this.migrate();
  }

  private closeDatabase(): void {
    this.db.close();
  }

  private validateDatabaseSnapshot(databasePath: string): void {
    const candidate = new DatabaseSync(databasePath);
    try {
      const requiredTables = new Set(
        (candidate.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map((row) => row.name)
      );
      for (const tableName of ["users", "teams", "team_memberships", "rounds", "history_entries", "history_comments"]) {
        if (!requiredTables.has(tableName)) {
          throw new Error(`Imported database is missing the required table "${tableName}".`);
        }
      }
    } finally {
      candidate.close();
    }
  }

  private migrate(): void {
    runBaseSchema(this.db);

    this.ensureUserUpdatedAtColumn();
    this.ensureUserAvatarColumns();
    this.ensureUserPasswordColumn();
    this.ensureUserTermsColumns();
    this.ensureUserAdminColumns();
    this.ensureUserShortcutPreferenceColumn();
    this.ensureTeamTimerColumn();
    this.ensureTeamHistoryTimezoneColumns();
    this.ensureTeamFibonacciRangeColumns();
    this.ensureTeamQuorumColumns();
    this.ensureTeamAdminColumns();
    this.ensureTeamDemoColumn();
    this.ensureTeamMembershipRoleColumn();
    this.ensureTeamWorkspaceColumn();
    this.ensureRoundTimerColumns();
    this.ensureRoundFibonacciRangeColumns();
    this.ensureRoundRevealMetadataColumns();
    this.ensureHistoryEntryFibonacciRangeColumns();
    this.ensureHistoryEntryRevealMetadataColumns();
    this.ensureHistoryImportColumns();
    this.ensureHistoryCommentMetadataColumns();
    this.ensureTeamActivityBackfill();
    this.ensureDefaultWorkspaceBackfill();
    this.ensureSuperAdminAccount();
    this.ensureDefaultWorkspaceBackfill();
    this.ensureSuperAdminMemberships();
    this.ensureDefaultWorkspaceBackfill();
  }

  getBrandingManifest() {
    return BRANDING_MANIFEST;
  }

  syncSuperAdminAccount(): void {
    this.ensureSuperAdminAccount();
  }

  getDecks() {
    return DECKS;
  }

  requestLoginCode(email: string): RequestCodeResult {
    const code = createCode();
    const expiresAt = plusMinutes(this.config.loginCodeTtlMinutes);
    this.db
      .prepare(
        `
        INSERT INTO login_codes(email, code, expires_at, created_at)
        VALUES(@email, @code, @expiresAt, @createdAt)
        ON CONFLICT(email) DO UPDATE SET code = excluded.code, expires_at = excluded.expires_at, created_at = excluded.created_at
      `
      )
      .run({ email, code, expiresAt, createdAt: nowIso() });

    return { code, expiresAt };
  }

  verifyLoginCode(
    email: string,
    code: string,
    displayName?: string,
    avatarIconKey?: string,
    avatarColorKey?: string,
    avatarKey?: string,
    password?: string
  ): SessionUser | null {
    const loginCode = this.db
      .prepare("SELECT email, code, expires_at FROM login_codes WHERE email = ?")
      .get(email) as { email: string; code: string; expires_at: string } | undefined;

    if (!loginCode || loginCode.code !== code || loginCode.expires_at < nowIso()) {
      return null;
    }

    this.db.prepare("DELETE FROM login_codes WHERE email = ?").run(email);

    const existingUser = this.db
      .prepare("SELECT id, email, display_name, avatar_key, avatar_icon_key, avatar_color_key, password_hash FROM users WHERE email = ?")
      .get(email) as
      | {
          id: string;
          email: string;
          display_name: string;
          avatar_key: string;
          avatar_icon_key: string | null;
          avatar_color_key: string | null;
          password_hash: string | null;
        }
      | undefined;

    if (!password || password.trim().length < 8) {
      return null;
    }

    const passwordHash = hashPassword(password.trim());

    const user =
      existingUser ??
      (() => {
        const id = nanoid();
        const createdAt = nowIso();
        const safeDisplayName = displayName?.trim() || deriveDisplayNameFromEmail(email);
        const avatarSelection = resolveAvatarSelection({ avatarIconKey, avatarColorKey, avatarKey });
        const safeAvatar = buildAvatarAssetKey(avatarSelection.avatarIconKey, avatarSelection.avatarColorKey);

        this.db
          .prepare(
            "INSERT INTO users(id, email, display_name, avatar_key, avatar_icon_key, avatar_color_key, password_hash, created_at, updated_at, last_active_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
          )
          .run(
            id,
            email,
            safeDisplayName,
            safeAvatar,
            avatarSelection.avatarIconKey,
            avatarSelection.avatarColorKey,
            passwordHash,
            createdAt,
            createdAt,
            createdAt
          );

        return {
          id,
          email,
          display_name: safeDisplayName,
          avatar_key: safeAvatar,
          avatar_icon_key: avatarSelection.avatarIconKey,
          avatar_color_key: avatarSelection.avatarColorKey,
          password_hash: passwordHash
        };
      })();

    if (existingUser) {
      this.db
        .prepare(
          "UPDATE users SET display_name = ?, avatar_key = ?, avatar_icon_key = ?, avatar_color_key = ?, password_hash = ?, updated_at = ?, last_active_at = ? WHERE id = ?"
        )
        .run(
          (displayName?.trim() || existingUser.display_name),
          buildAvatarAssetKey(
            resolveAvatarSelection({ avatarIconKey, avatarColorKey, avatarKey }).avatarIconKey,
            resolveAvatarSelection({ avatarIconKey, avatarColorKey, avatarKey }).avatarColorKey
          ),
          resolveAvatarSelection({ avatarIconKey, avatarColorKey, avatarKey }).avatarIconKey,
          resolveAvatarSelection({ avatarIconKey, avatarColorKey, avatarKey }).avatarColorKey,
          passwordHash,
          nowIso(),
          nowIso(),
          existingUser.id
        );
    }
    return this.createSessionForExistingUser(user.id);
  }

  verifyPasswordLogin(email: string, password: string): SessionUser | null {
    const row = this.db
      .prepare(
        "SELECT id, password_hash FROM users WHERE email = ? AND is_super_admin = 0"
      )
      .get(email.toLowerCase()) as { id: string; password_hash: string | null } | undefined;

    if (!row || !verifyPasswordHash(password, row.password_hash)) {
      return null;
    }

    return this.createSessionForExistingUser(row.id);
  }

  verifySuperAdminLogin(loginName: string, password: string): SessionUser | null {
    const row = this.db
      .prepare("SELECT id, password_hash FROM users WHERE login_name = ? AND is_super_admin = 1")
      .get(loginName.trim()) as { id: string; password_hash: string | null } | undefined;

    if (!row || !verifyPasswordHash(password, row.password_hash)) {
      return null;
    }

    return this.createSessionForExistingUser(row.id);
  }

  changeUserPassword(userId: string, currentPassword: string, nextPassword: string): void {
    const row = this.db
      .prepare("SELECT password_hash FROM users WHERE id = ?")
      .get(userId) as { password_hash: string | null } | undefined;

    if (!row || !verifyPasswordHash(currentPassword, row.password_hash)) {
      throw new Error("Current password is incorrect.");
    }

    if (nextPassword.trim().length < 8) {
      throw new Error("New password must be at least 8 characters.");
    }

    this.db
      .prepare("UPDATE users SET password_hash = ?, last_active_at = ? WHERE id = ?")
      .run(hashPassword(nextPassword.trim()), nowIso(), userId);
  }

  resetTeamMemberPassword(actorUserId: string, teamId: string, memberUserId: string): { user: UserSummary; temporaryPassword: string } {
    this.requireActiveTeam(teamId);
    this.assertCanManageTeam(actorUserId, teamId);
    if (!this.isTeamMember(memberUserId, teamId)) {
      throw new Error("That user is not a member of this team.");
    }

    const user = this.getUser(memberUserId);
    if (!user) {
      throw new Error("User not found");
    }

    const temporaryPassword = createRandomPassword();
    this.db
      .prepare("UPDATE users SET password_hash = ?, last_active_at = ? WHERE id = ?")
      .run(hashPassword(temporaryPassword), nowIso(), memberUserId);
    const team = this.getTeam(teamId);
    const actor = this.getUser(actorUserId);
    this.createActionHistory({
      scope: "team",
      kind: "team_member_password_reset",
      title: "Team member password reset",
      message:
        actor && team
          ? `${actor.displayName} reset the password for ${user.displayName} in ${team.name}.`
          : `Password reset for ${user.displayName}.`,
      teamId,
      actorUserId
    });

    return { user, temporaryPassword };
  }

  resetPlatformUserPassword(actorUserId: string, memberUserId: string): { user: UserSummary; temporaryPassword: string } {
    this.assertSuperAdmin(actorUserId);
    if (this.isSuperAdmin(memberUserId)) {
      throw new Error("Use your own Account settings to change the super-admin password.");
    }

    const user = this.getUser(memberUserId);
    if (!user) {
      throw new Error("User not found");
    }

    const temporaryPassword = createRandomPassword();
    this.db
      .prepare("UPDATE users SET password_hash = ?, last_active_at = ? WHERE id = ?")
      .run(hashPassword(temporaryPassword), nowIso(), memberUserId);
    const actor = this.getUser(actorUserId);
    this.createActionHistory({
      scope: "platform",
      kind: "platform_user_password_reset",
      title: "Platform user password reset",
      message: actor ? `${actor.displayName} reset the password for ${user.email}.` : `Password reset for ${user.email}.`,
      teamId: null,
      actorUserId
    });

    return { user, temporaryPassword };
  }

  getSessionUser(token: string | undefined): SessionUser | null {
    if (!token) {
      return null;
    }

    const row = this.db
      .prepare(
        `
        SELECT
          s.token,
          s.expires_at,
          u.id,
          u.email,
          u.login_name,
          u.is_super_admin,
          u.display_name,
          u.avatar_key,
          u.avatar_icon_key,
          u.avatar_color_key,
          u.board_shortcuts_enabled,
          u.history_timezone_popup_enabled,
          u.history_timezone_keys_json
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token = ?
      `
      )
      .get(token) as
      | {
          token: string;
          expires_at: string;
          id: string;
          email: string;
          login_name: string | null;
          is_super_admin: number;
          display_name: string;
          avatar_key: string;
          avatar_icon_key: string | null;
          avatar_color_key: string | null;
          board_shortcuts_enabled: number;
          history_timezone_popup_enabled: number;
          history_timezone_keys_json: string | null;
        }
      | undefined;

    if (!row || row.expires_at < nowIso()) {
      if (row) {
        this.db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
      }
      return null;
    }

    const expiresAt = plusDays(this.config.sessionTtlDays);
    const currentTime = nowIso();
    this.db
      .prepare("UPDATE sessions SET expires_at = ?, last_active_at = ? WHERE token = ?")
      .run(expiresAt, currentTime, token);
    this.touchUser(row.id);

    const avatarSelection = resolveAvatarSelection({
      avatarIconKey: row.avatar_icon_key,
      avatarColorKey: row.avatar_color_key,
      avatarKey: row.avatar_key
    });

    return {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      avatarIconKey: avatarSelection.avatarIconKey,
      avatarColorKey: avatarSelection.avatarColorKey,
      sessionToken: row.token,
      isSuperAdmin: row.is_super_admin === 1,
      loginName: row.login_name,
      boardShortcutsEnabled: row.board_shortcuts_enabled !== 0,
      historyTimezonePopupEnabled: row.history_timezone_popup_enabled !== 0,
      historyTimezoneKeys: row.history_timezone_keys_json ? parseHistoryTimeZoneKeys(row.history_timezone_keys_json) : null
    };
  }

  createSessionForExistingUser(userId: string): SessionUser {
    const user = this.getCurrentUser(userId);
    if (!user) {
      throw new Error("User not found");
    }

    const token = nanoid(32);
    const sessionId = nanoid();
    const expiresAt = plusDays(this.config.sessionTtlDays);
    const currentTime = nowIso();
    this.db
      .prepare("INSERT INTO sessions(id, user_id, token, expires_at, last_active_at, created_at) VALUES(?, ?, ?, ?, ?, ?)")
      .run(sessionId, userId, token, expiresAt, currentTime, currentTime);
    this.touchUser(userId);

    return {
      ...user,
      sessionToken: token
    };
  }

  deleteSession(token: string | undefined): void {
    if (!token) {
      return;
    }
    this.db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  }

  updateProfile(userId: string, displayName: string, avatarIconKey: string, avatarColorKey: string): UserSummary {
    const avatarSelection = resolveAvatarSelection({ avatarIconKey, avatarColorKey });
    const safeAvatar = buildAvatarAssetKey(avatarSelection.avatarIconKey, avatarSelection.avatarColorKey);
    const updatedAt = nowIso();
    this.db.prepare("UPDATE users SET display_name = ?, avatar_key = ?, avatar_icon_key = ?, avatar_color_key = ?, updated_at = ?, last_active_at = ? WHERE id = ?").run(
      displayName.trim(),
      safeAvatar,
      avatarSelection.avatarIconKey,
      avatarSelection.avatarColorKey,
      updatedAt,
      updatedAt,
      userId
    );

    return this.getUser(userId)!;
  }

  updateBoardShortcutPreference(userId: string, boardShortcutsEnabled: boolean): CurrentUserSummary {
    const updatedAt = nowIso();
    this.db
      .prepare("UPDATE users SET board_shortcuts_enabled = ?, updated_at = ?, last_active_at = ? WHERE id = ?")
      .run(boardShortcutsEnabled ? 1 : 0, updatedAt, updatedAt, userId);
    return this.getCurrentUser(userId)!;
  }

  updateUserPreferences(
    userId: string,
    preferences: {
      teamId?: string | null;
      boardShortcutsEnabled?: boolean;
      historyTimezonePopupEnabled?: boolean;
      historyTimezoneKeys?: readonly HistoryTimeZoneKey[] | null;
    }
  ): CurrentUserSummary {
    const current = this.getCurrentUser(userId);
    if (!current) {
      throw new Error("User not found");
    }

    const updatedAt = nowIso();
    if (preferences.boardShortcutsEnabled !== undefined) {
      this.db
        .prepare("UPDATE users SET board_shortcuts_enabled = ?, updated_at = ?, last_active_at = ? WHERE id = ?")
        .run(preferences.boardShortcutsEnabled ? 1 : 0, updatedAt, updatedAt, userId);
    } else {
      this.touchUser(userId);
    }

    const hasTeamScopedTimezonePreference =
      preferences.historyTimezonePopupEnabled !== undefined || preferences.historyTimezoneKeys !== undefined;
    if (hasTeamScopedTimezonePreference) {
      const teamId = preferences.teamId?.trim();
      if (!teamId) {
        throw new Error("Team is required for history time zone preferences.");
      }
      if (this.getTeamUserRole(userId, teamId) === "none" && !this.isSuperAdmin(userId)) {
        throw new Error("Forbidden");
      }
      const existing = this.getUserTeamHistoryTimezonePreference(userId, teamId);
      const nextPopupEnabled = preferences.historyTimezonePopupEnabled ?? existing?.historyTimezonePopupEnabled ?? true;
      const nextKeysJson =
        preferences.historyTimezoneKeys === undefined
          ? existing?.historyTimezoneKeys
            ? stringifyHistoryTimeZoneKeys(existing.historyTimezoneKeys)
            : null
          : preferences.historyTimezoneKeys === null
            ? null
            : stringifyHistoryTimeZoneKeys(normalizeHistoryTimeZoneKeys(preferences.historyTimezoneKeys));
      this.db
        .prepare(
          `
          INSERT INTO user_team_preferences(user_id, team_id, history_timezone_popup_enabled, history_timezone_keys_json, updated_at)
          VALUES(?, ?, ?, ?, ?)
          ON CONFLICT(user_id, team_id) DO UPDATE SET
            history_timezone_popup_enabled = excluded.history_timezone_popup_enabled,
            history_timezone_keys_json = excluded.history_timezone_keys_json,
            updated_at = excluded.updated_at
        `
        )
        .run(userId, teamId, nextPopupEnabled ? 1 : 0, nextKeysJson, updatedAt);
      return this.getCurrentUserForTeam(userId, teamId)!;
    }

    return this.getCurrentUser(userId)!;
  }

  getUser(userId: string): UserSummary | null {
    const row = this.db
      .prepare("SELECT id, email, display_name, avatar_key, avatar_icon_key, avatar_color_key FROM users WHERE id = ?")
      .get(userId) as
      | { id: string; email: string; display_name: string; avatar_key: string; avatar_icon_key: string | null; avatar_color_key: string | null }
      | undefined;

    if (!row) {
      return null;
    }

    const avatarSelection = resolveAvatarSelection({
      avatarIconKey: row.avatar_icon_key,
      avatarColorKey: row.avatar_color_key,
      avatarKey: row.avatar_key
    });

    return {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      avatarIconKey: avatarSelection.avatarIconKey,
      avatarColorKey: avatarSelection.avatarColorKey
    };
  }

  getUsersByIds(userIds: readonly string[]): UserSummary[] {
    if (userIds.length === 0) {
      return [];
    }

    const placeholders = userIds.map(() => "?").join(", ");
    const rows = this.db
      .prepare(
        `
        SELECT id, email, display_name, avatar_key, avatar_icon_key, avatar_color_key
        FROM users
        WHERE id IN (${placeholders})
      `
      )
      .all(...userIds) as Array<{
      id: string;
      email: string;
      display_name: string;
      avatar_key: string;
      avatar_icon_key: string | null;
      avatar_color_key: string | null;
    }>;

    const usersById = new Map(
      rows.map((row) => {
        const avatarSelection = resolveAvatarSelection({
          avatarIconKey: row.avatar_icon_key,
          avatarColorKey: row.avatar_color_key,
          avatarKey: row.avatar_key
        });

        return [
          row.id,
          {
            id: row.id,
            email: row.email,
            displayName: row.display_name,
            avatarIconKey: avatarSelection.avatarIconKey,
            avatarColorKey: avatarSelection.avatarColorKey
          } satisfies UserSummary
        ];
      })
    );

    const orderedUsers: UserSummary[] = [];
    for (const userId of userIds) {
      const user = usersById.get(userId);
      if (user) {
        orderedUsers.push(user);
      }
    }

    return orderedUsers;
  }

  getCurrentUser(userId: string): CurrentUserSummary | null {
    const row = this.db
      .prepare(
        "SELECT id, email, login_name, is_super_admin, display_name, avatar_key, avatar_icon_key, avatar_color_key, board_shortcuts_enabled, history_timezone_popup_enabled, history_timezone_keys_json FROM users WHERE id = ?"
      )
      .get(userId) as
      | {
          id: string;
          email: string;
          login_name: string | null;
          is_super_admin: number;
          display_name: string;
          avatar_key: string;
          avatar_icon_key: string | null;
          avatar_color_key: string | null;
          board_shortcuts_enabled: number;
          history_timezone_popup_enabled: number;
          history_timezone_keys_json: string | null;
        }
      | undefined;

    if (!row) {
      return null;
    }

    const avatarSelection = resolveAvatarSelection({
      avatarIconKey: row.avatar_icon_key,
      avatarColorKey: row.avatar_color_key,
      avatarKey: row.avatar_key
    });

    return {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      avatarIconKey: avatarSelection.avatarIconKey,
      avatarColorKey: avatarSelection.avatarColorKey,
      isSuperAdmin: row.is_super_admin === 1,
      loginName: row.login_name,
      boardShortcutsEnabled: row.board_shortcuts_enabled !== 0,
      historyTimezonePopupEnabled: row.history_timezone_popup_enabled !== 0,
      historyTimezoneKeys: row.history_timezone_keys_json ? parseHistoryTimeZoneKeys(row.history_timezone_keys_json) : null
    };
  }

  getCurrentUserForTeam(userId: string, teamId: string): CurrentUserSummary | null {
    const current = this.getCurrentUser(userId);
    if (!current) {
      return null;
    }
    const preference = this.getUserTeamHistoryTimezonePreference(userId, teamId);
    return {
      ...current,
      historyTimezonePopupEnabled: preference?.historyTimezonePopupEnabled ?? true,
      historyTimezoneKeys: preference?.historyTimezoneKeys ?? null
    };
  }

  getUserByEmail(email: string): UserSummary | null {
    const row = this.db
      .prepare("SELECT id FROM users WHERE email = ?")
      .get(email.toLowerCase()) as { id: string } | undefined;

    return row ? this.getUser(row.id) : null;
  }

  ensureUser(input: EnsureUserInput): UserSummary {
    const existingUser = this.getUserByEmail(input.email.toLowerCase());
    const avatarSelection = resolveAvatarSelection({
      avatarIconKey: input.avatarIconKey,
      avatarColorKey: input.avatarColorKey
    });
    const safeAvatar = buildAvatarAssetKey(avatarSelection.avatarIconKey, avatarSelection.avatarColorKey);

    if (existingUser) {
      this.db
        .prepare("UPDATE users SET display_name = ?, avatar_key = ?, avatar_icon_key = ?, avatar_color_key = ?, updated_at = ?, last_active_at = ? WHERE id = ?")
        .run(input.displayName.trim(), safeAvatar, avatarSelection.avatarIconKey, avatarSelection.avatarColorKey, nowIso(), nowIso(), existingUser.id);
      return this.getUser(existingUser.id)!;
    }

    const createdAt = nowIso();
    const id = nanoid();
    this.db
      .prepare(
        "INSERT INTO users(id, email, display_name, avatar_key, avatar_icon_key, avatar_color_key, created_at, updated_at, last_active_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        id,
        input.email.toLowerCase(),
        input.displayName.trim(),
        safeAvatar,
        avatarSelection.avatarIconKey,
        avatarSelection.avatarColorKey,
        createdAt,
        createdAt,
        createdAt
      );

    return this.getUser(id)!;
  }

  getTeamsForUser(userId: string): { memberships: TeamMembershipSummary[]; availableTeams: TeamMembershipSummary[] } {
    if (this.isSuperAdmin(userId)) {
      this.ensureSuperAdminMemberships(userId);
    }
    const viewerIsSuperAdmin = this.isSuperAdmin(userId);
    const rows = this.db
      .prepare(
        `
        SELECT
          t.id,
          t.name,
          t.slug,
          t.demo,
          t.deck_key,
          t.fibonacci_range_start,
          t.fibonacci_range_end,
          t.timer_seconds,
          t.icon_key,
          t.logo_opacity,
          t.background_opacity,
          t.history_timezone_popup_enabled,
          t.history_timezone_keys_json,
          t.minimum_vote_percent_enabled,
          t.minimum_vote_percent,
          t.jira_project_key,
          t.jira_jql,
          t.archived,
          t.last_activity_at,
          COALESCE(SUM(CASE WHEN member_user.is_super_admin = 0 THEN 1 ELSE 0 END), 0) AS member_count,
          tm.role AS membership_role,
          tm.last_opened_at AS membership_last_opened_at,
          utp.user_id AS preference_user_id,
          utp.history_timezone_popup_enabled AS preference_history_timezone_popup_enabled,
          utp.history_timezone_keys_json AS preference_history_timezone_keys_json,
          EXISTS(SELECT 1 FROM team_join_requests tjr WHERE tjr.team_id = t.id AND tjr.user_id = @userId) AS has_pending_request
        FROM teams t
        LEFT JOIN team_memberships tm2 ON tm2.team_id = t.id
        LEFT JOIN users member_user ON member_user.id = tm2.user_id
        LEFT JOIN team_memberships tm ON tm.team_id = t.id AND tm.user_id = @userId
        LEFT JOIN user_team_preferences utp ON utp.team_id = t.id AND utp.user_id = @userId
        GROUP BY t.id
        ORDER BY t.archived ASC, t.last_activity_at DESC, t.name COLLATE NOCASE ASC
      `
      )
      .all({ userId }) as Array<{
      id: string;
      name: string;
      slug: string;
      demo: number;
      deck_key: DeckKey;
      fibonacci_range_start: FibonacciRangeStart | null;
      fibonacci_range_end: FibonacciRangeEnd | null;
      timer_seconds: number | null;
      icon_key: string;
      logo_opacity: number;
      background_opacity: number;
      history_timezone_popup_enabled: number;
      history_timezone_keys_json: string | null;
      minimum_vote_percent_enabled: number;
      minimum_vote_percent: number;
      jira_project_key: string | null;
      jira_jql: string | null;
      archived: number;
      last_activity_at: string;
      member_count: number;
      membership_role: TeamUserRole | null;
      membership_last_opened_at: string | null;
      preference_user_id: string | null;
      preference_history_timezone_popup_enabled: number | null;
      preference_history_timezone_keys_json: string | null;
      has_pending_request: number;
    }>;

    const mapped = rows.map((row) => {
      const fibonacciRange = normalizeStoredFibonacciRange(row.fibonacci_range_start, row.fibonacci_range_end);
      return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        demo: row.demo === 1,
        deckKey: row.deck_key,
        fibonacciRangeStart: fibonacciRange.fibonacciRangeStart,
        fibonacciRangeEnd: fibonacciRange.fibonacciRangeEnd,
        timerSeconds: parseTimerSeconds(row.timer_seconds),
        iconKey: row.icon_key,
        logoOpacity: row.logo_opacity,
        backgroundOpacity: row.background_opacity,
        historyTimezonePopupEnabled: row.history_timezone_popup_enabled === 1,
        historyTimezoneKeys: parseHistoryTimeZoneKeys(row.history_timezone_keys_json),
        minimumVotePercentEnabled: row.minimum_vote_percent_enabled === 1,
        minimumVotePercent: normalizeMinimumVotePercent(row.minimum_vote_percent),
        jiraProjectKey: row.jira_project_key,
        jiraJql: row.jira_jql,
        archived: row.archived === 1,
        lastActivityAt: row.last_activity_at,
        memberCount: row.member_count,
        currentUserRole: row.membership_role ?? "none",
        currentUserHistoryTimezonePopupEnabled:
          row.preference_user_id === null ? undefined : row.preference_history_timezone_popup_enabled !== 0,
        currentUserHistoryTimezoneKeys:
          row.preference_user_id === null
            ? null
            : row.preference_history_timezone_keys_json
              ? parseHistoryTimeZoneKeys(row.preference_history_timezone_keys_json)
              : null,
        joinRequestStatus: (row.has_pending_request ? "pending" : "none") as TeamJoinRequestStatus,
        lastOpenedAt: row.membership_last_opened_at
      };
    });

    const viewerHasPublicTrialWorkspace = !viewerIsSuperAdmin && this.userHasPublicTrialWorkspace(userId);
    const visibleTeams = mapped.filter(
      (row) =>
        this.isTeamVisibleToUser(row.demo, viewerIsSuperAdmin) &&
        this.isTeamVisibleByRuntime(row.name) &&
        (!viewerHasPublicTrialWorkspace || row.currentUserRole !== "none")
    );

    const memberships = visibleTeams
      .filter((row) => row.currentUserRole !== "none")
      .sort((left, right) => {
        if (left.archived !== right.archived) {
          return Number(left.archived) - Number(right.archived);
        }
        const leftOpened = left.lastOpenedAt ?? "";
        const rightOpened = right.lastOpenedAt ?? "";
        if (leftOpened !== rightOpened) {
          return rightOpened.localeCompare(leftOpened);
        }
        if (left.lastActivityAt !== right.lastActivityAt) {
          return right.lastActivityAt.localeCompare(left.lastActivityAt);
        }
        return left.name.localeCompare(right.name);
      });

    return {
      memberships,
      availableTeams: visibleTeams
    };
  }

  getDefaultWorkspace(): WorkspaceSummary {
    this.ensureDefaultWorkspaceBackfill();
    const workspace = this.getWorkspace(DEFAULT_WORKSPACE_ID);
    if (!workspace) {
      throw new Error("Default workspace could not be created.");
    }
    return workspace;
  }

  getWorkspaceForTeam(teamId: string): WorkspaceSummary | null {
    const workspaceId = this.getWorkspaceIdForTeam(teamId);
    return workspaceId ? this.getWorkspace(workspaceId) : null;
  }

  getWorkspaceMembershipRole(userId: string, workspaceId: string): WorkspaceUserRole {
    const row = this.db
      .prepare("SELECT role FROM workspace_memberships WHERE workspace_id = ? AND user_id = ?")
      .get(workspaceId, userId) as { role: WorkspaceUserRole } | undefined;

    return row?.role ?? "none";
  }

  recordPlatformAudit(kind: string, title: string, message: string, actorUserId: string | null = null): void {
    this.createActionHistory({
      scope: "platform",
      kind,
      title,
      message,
      teamId: null,
      actorUserId
    });
  }

  getPublicTrialTermsVersion(): string {
    return PUBLIC_TRIAL_TERMS_VERSION;
  }

  userHasPublicTrialWorkspace(userId: string): boolean {
    return Boolean(
      this.db
        .prepare(
          `
          SELECT 1
          FROM workspace_memberships wm
          JOIN workspaces w ON w.id = wm.workspace_id
          WHERE wm.user_id = ? AND w.kind = 'public_trial'
          LIMIT 1
        `
        )
        .get(userId)
    );
  }

  completePublicTrialSignup(input: {
    email: string;
    code: string;
    displayName?: string;
    avatarIconKey?: string;
    avatarColorKey?: string;
    avatarKey?: string;
    password: string;
    acceptedTermsVersion: string;
  }): PublicTrialSignupResult | null {
    const normalizedEmail = input.email.trim().toLowerCase();
    const existingUser = this.getUserByEmail(normalizedEmail);
    if (existingUser && this.userHasPublicTrialWorkspace(existingUser.id)) {
      throw new Error("This email already belongs to a public trial workspace.");
    }

    if (input.acceptedTermsVersion !== PUBLIC_TRIAL_TERMS_VERSION) {
      throw new Error("The current public trial terms must be accepted before signup.");
    }

    const user = this.verifyLoginCode(
      normalizedEmail,
      input.code,
      input.displayName,
      input.avatarIconKey,
      input.avatarColorKey,
      input.avatarKey,
      input.password
    );

    if (!user) {
      return null;
    }

    if (this.userHasPublicTrialWorkspace(user.id)) {
      throw new Error("This email already belongs to a public trial workspace.");
    }

    const createdAt = nowIso();
    const workspaceId = nanoid();
    this.db
      .prepare(
        `
        INSERT INTO workspaces(id, name, kind, created_by, created_at, updated_at, last_activity_at)
        VALUES(?, ?, 'public_trial', ?, ?, ?, ?)
      `
      )
      .run(workspaceId, PUBLIC_TRIAL_WORKSPACE_NAME, user.id, createdAt, createdAt, createdAt);
    this.ensureWorkspaceMembership(workspaceId, user.id, "owner", createdAt);
    this.db
      .prepare("UPDATE users SET terms_version = ?, terms_accepted_at = ?, updated_at = ?, last_active_at = ? WHERE id = ?")
      .run(input.acceptedTermsVersion, createdAt, createdAt, createdAt, user.id);
    this.createActionHistory({
      scope: "platform",
      kind: "public_trial_workspace_created",
      title: "Public trial workspace created",
      message: `${normalizedEmail} created a public trial workspace.`,
      teamId: null,
      actorUserId: user.id,
      createdAt
    });

    const team = this.createTeam(user.id, PUBLIC_TRIAL_STARTER_TEAM_NAME);
    const workspace = this.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error("Public trial workspace could not be created.");
    }

    return { user, workspace, team };
  }

  createTeam(userId: string, name: string): TeamSummary {
    const trimmedName = name.trim();
    const workspaceId = this.getPrimaryWorkspaceIdForUser(userId) ?? DEFAULT_WORKSPACE_ID;
    if (this.findTeamByName(trimmedName, workspaceId)) {
      throw new Error("A team with this name already exists in this workspace.");
    }
    if (this.getWorkspaceKind(workspaceId) === "public_trial" && this.countWorkspaceTeams(workspaceId) >= this.config.publicTrial.maxTeamsPerWorkspace) {
      throw new Error(`Public trial workspaces can have at most ${this.config.publicTrial.maxTeamsPerWorkspace} teams.`);
    }
    this.ensureWorkspaceMembership(workspaceId, userId, "admin");

    const baseSlug = slugify(name);
    let slug = baseSlug || `team-${nanoid(6).toLowerCase()}`;
    let suffix = 1;

    while (this.db.prepare("SELECT 1 FROM teams WHERE slug = ?").get(slug)) {
      slug = `${baseSlug}-${suffix++}`;
    }

    const id = nanoid();
    const createdAt = nowIso();
    this.db
      .prepare(
        `
        INSERT INTO teams(
          id,
          workspace_id,
          name,
          slug,
          demo,
          deck_key,
          fibonacci_range_start,
          fibonacci_range_end,
          timer_seconds,
          icon_key,
          logo_opacity,
          background_opacity,
          history_timezone_popup_enabled,
          history_timezone_keys_json,
          archived,
          archived_at,
          last_activity_at,
          created_by,
          created_at
        )
        VALUES(?, ?, ?, ?, 0, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?, ?)
      `
      )
      .run(
        id,
        workspaceId,
        trimmedName,
        slug,
        DEFAULT_DECK_KEY,
        null,
        "orbit",
        0.18,
        0.12,
        DEFAULT_HISTORY_TIME_ZONE_POPUP_ENABLED ? 1 : 0,
        stringifyHistoryTimeZoneKeys(this.config.defaultHistoryTimezoneKeys),
        createdAt,
        userId,
        createdAt
      );
    this.joinTeam(userId, id, "team_admin");
    this.ensureSuperAdminMemberships();
    return this.getTeam(id)!;
  }

  ensureTeam(userId: string, name: string, options?: { demo?: boolean }): TeamSummary {
    const workspaceId = this.getPrimaryWorkspaceIdForUser(userId) ?? DEFAULT_WORKSPACE_ID;
    const existing = this.findTeamByName(name.trim(), workspaceId);

    if (existing) {
      if (options?.demo !== undefined) {
        this.db.prepare("UPDATE teams SET demo = ? WHERE id = ?").run(options.demo ? 1 : 0, existing.id);
      }
      return this.getTeam(existing.id)!;
    }

    const createdTeam = this.createTeam(userId, name);
    if (options?.demo) {
      this.db.prepare("UPDATE teams SET demo = 1 WHERE id = ?").run(createdTeam.id);
      return this.getTeam(createdTeam.id)!;
    }
    return createdTeam;
  }

  joinTeam(userId: string, teamId: string, role: Exclude<TeamUserRole, "none"> = "member"): void {
    const currentTime = nowIso();
    const workspaceId = this.getWorkspaceIdForTeam(teamId);
    if (workspaceId) {
      this.ensureWorkspaceMembership(workspaceId, userId, role === "team_admin" ? "admin" : "member", currentTime);
    }
    this.db
      .prepare(
        `
        INSERT INTO team_memberships(team_id, user_id, role, created_at, last_opened_at)
        VALUES(?, ?, ?, ?, ?)
        ON CONFLICT(team_id, user_id) DO UPDATE SET role = excluded.role, last_opened_at = excluded.last_opened_at
      `
      )
      .run(teamId, userId, role, currentTime, currentTime);
    this.db.prepare("DELETE FROM team_join_requests WHERE team_id = ? AND user_id = ?").run(teamId, userId);
    this.touchTeamActivity(teamId, currentTime);
  }

  syncSimulatorTeams(ownerUserId: string, teams: EnsureSimulatorTeamInput[]): Array<TeamSummary & { memberCount: number }> {
    const seededTeams: EnsureSeededTeamInput[] = teams.map((team) => ({ ...team, demo: false, joinOwnerAsAdmin: true }));
    return this.syncSeededTeams(ownerUserId, seededTeams);
  }

  syncDemoTeams(ownerUserId: string, teams: EnsureSimulatorTeamInput[]): Array<TeamSummary & { memberCount: number }> {
    const seededTeams: EnsureSeededTeamInput[] = teams.map((team) => ({ ...team, demo: true, joinOwnerAsAdmin: false }));
    return this.syncSeededTeams(ownerUserId, seededTeams);
  }

  private syncSeededTeams(ownerUserId: string, teams: EnsureSeededTeamInput[]): Array<TeamSummary & { memberCount: number }> {
    const teamIds: string[] = [];
    const simulatorUserIds = new Set<string>();

    for (const teamInput of teams) {
      const team = this.ensureTeam(ownerUserId, teamInput.name, { demo: teamInput.demo });
      teamIds.push(team.id);
      for (const userId of teamInput.memberUserIds) {
        simulatorUserIds.add(userId);
      }
    }

    if (teamIds.length && simulatorUserIds.size) {
      const teamPlaceholders = teamIds.map(() => "?").join(", ");
      const userPlaceholders = Array.from(simulatorUserIds).map(() => "?").join(", ");
      this.db
        .prepare(`DELETE FROM team_memberships WHERE team_id IN (${teamPlaceholders}) AND user_id IN (${userPlaceholders})`)
        .run(...teamIds, ...Array.from(simulatorUserIds));
    }

    const currentTime = nowIso();
    for (const teamInput of teams) {
      const team = this.ensureTeam(ownerUserId, teamInput.name, { demo: teamInput.demo });
      if (teamInput.joinOwnerAsAdmin) {
        this.joinTeam(ownerUserId, team.id, "team_admin");
      } else {
        this.db.prepare("DELETE FROM team_memberships WHERE team_id = ? AND user_id = ?").run(team.id, ownerUserId);
      }
      this.db.prepare("UPDATE teams SET demo = ? WHERE id = ?").run(teamInput.demo ? 1 : 0, team.id);
      for (const userId of teamInput.memberUserIds) {
        this.db
          .prepare(
            `
            INSERT INTO team_memberships(team_id, user_id, role, created_at, last_opened_at)
            VALUES(?, ?, 'member', ?, ?)
            ON CONFLICT(team_id, user_id) DO UPDATE SET role = 'member', last_opened_at = excluded.last_opened_at
          `
          )
          .run(team.id, userId, currentTime, currentTime);
      }
      this.touchTeamActivity(team.id, currentTime);
    }

    this.ensureSuperAdminMemberships();

    return teams.map((teamInput) => {
      const team = this.ensureTeam(ownerUserId, teamInput.name, { demo: teamInput.demo });
      return {
        ...team,
        memberCount: teamInput.memberUserIds.length
      };
    });
  }

  leaveTeam(userId: string, teamId: string): void {
    if (this.isSuperAdmin(userId)) {
      throw new Error("The super-admin always remains a member of every team.");
    }
    this.db.prepare("DELETE FROM team_memberships WHERE team_id = ? AND user_id = ?").run(teamId, userId);
  }

  isTeamMember(userId: string, teamId: string): boolean {
    const row = this.db
      .prepare("SELECT 1 FROM team_memberships WHERE team_id = ? AND user_id = ?")
      .get(teamId, userId) as { 1: number } | undefined;

    return Boolean(row);
  }

  isSuperAdmin(userId: string): boolean {
    const row = this.db.prepare("SELECT is_super_admin FROM users WHERE id = ?").get(userId) as { is_super_admin: number } | undefined;
    return row?.is_super_admin === 1;
  }

  getTeamUserRole(userId: string, teamId: string): TeamUserRole {
    const row = this.db
      .prepare("SELECT role FROM team_memberships WHERE team_id = ? AND user_id = ?")
      .get(teamId, userId) as { role: TeamUserRole } | undefined;

    return row?.role ?? "none";
  }

  getNotificationFeed(userId: string, teamId?: string | null, options?: NotificationFeedOptions): NotificationFeed {
    return getNotificationFeed(this.db, userId, teamId, options, {
      isSuperAdmin: (viewerId) => this.isSuperAdmin(viewerId),
      getPendingJoinRequestsForViewer: (viewerId) => this.getPendingJoinRequestsForViewer(viewerId),
      getPlatformAccessRequests: () => this.getPlatformAccessRequests(),
      getActionHistoryPage: (viewerId, historyTeamId, cursor, limit) => this.getActionHistoryPage(viewerId, historyTeamId, cursor, limit)
    });
  }

  getActionHistoryPage(
    viewerUserId: string,
    teamId: string | null,
    cursor?: string | null,
    limit = 20
  ): { items: NotificationSummary[]; nextCursor: string | null } | null {
    return getActionHistoryPage(this.db, viewerUserId, teamId, cursor, limit, {
      isSuperAdmin: (viewerId) => this.isSuperAdmin(viewerId),
      getTeamUserRole: (viewerId, targetTeamId) => this.getTeamUserRole(viewerId, targetTeamId)
    });
  }

  markNotificationsSeen(userId: string): void {
    markNotificationsSeen(this.db, userId, nowIso());
  }

  requestTeamJoin(userId: string, teamId: string): PendingJoinRequestSummary {
    const team = this.getTeam(teamId);
    if (!team) {
      throw new Error("Team not found");
    }
    if (team.demo) {
      throw new Error("Demo teams are super-admin-only.");
    }
    if (team.archived) {
      throw new Error("Archived teams are read-only and cannot accept new join requests.");
    }
    if (this.isTeamMember(userId, teamId)) {
      throw new Error("You already belong to this team.");
    }

    const existing = this.db
      .prepare(
        `
        SELECT id, created_at
        FROM team_join_requests
        WHERE team_id = ? AND user_id = ?
      `
      )
      .get(teamId, userId) as { id: string; created_at: string } | undefined;

    if (existing) {
      const requester = this.getUser(userId);
      if (!requester) {
        throw new Error("User not found");
      }
      return {
        id: existing.id,
        teamId,
        teamName: team.name,
        requester,
        createdAt: existing.created_at
      };
    }

    const createdAt = nowIso();
    const requestId = nanoid();
    this.db
      .prepare(
        `
        INSERT INTO team_join_requests(id, team_id, user_id, created_at, updated_at)
        VALUES(?, ?, ?, ?, ?)
      `
      )
      .run(requestId, teamId, userId, createdAt, createdAt);

    const requester = this.getUser(userId);
    if (!requester) {
      throw new Error("User not found");
    }

    return {
      id: requestId,
      teamId,
      teamName: team.name,
      requester,
      createdAt
    };
  }

  requestPlatformAccess(email: string): PlatformAccessRequestSummary {
    const normalizedEmail = email.trim().toLowerCase();
    if (this.getUserByEmail(normalizedEmail)) {
      throw new Error("That email already has an account. Sign in with password or ask the super-admin, or a team-admin from your current team, to reset it.");
    }

    const existing = this.db
      .prepare("SELECT id, email, created_at FROM platform_access_requests WHERE email = ?")
      .get(normalizedEmail) as { id: string; email: string; created_at: string } | undefined;
    if (existing) {
      return {
        id: existing.id,
        email: existing.email,
        createdAt: existing.created_at
      };
    }

    const createdAt = nowIso();
    const id = nanoid();
    this.db
      .prepare(
        `
        INSERT INTO platform_access_requests(id, email, created_at, updated_at)
        VALUES(?, ?, ?, ?)
      `
      )
      .run(id, normalizedEmail, createdAt, createdAt);
    this.createActionHistory({
      scope: "platform",
      kind: "platform_access_requested",
      title: `Platform access requested`,
      message: `${normalizedEmail} requested platform access.`,
      teamId: null,
      actorUserId: null,
      createdAt
    });

    return {
      id,
      email: normalizedEmail,
      createdAt
    };
  }

  getPlatformAccessRequests(): PlatformAccessRequestSummary[] {
    return getPlatformAccessRequests(this.db);
  }

  getPlatformUsers(): PlatformUserSummary[] {
    return getPlatformUsers(this.db, { limit: 10000 }).users;
  }

  getPlatformUsersPage(options?: { offset?: number; limit?: number; query?: string; sort?: PlatformUserSort }): { users: PlatformUserSummary[]; nextOffset: number | null } {
    return getPlatformUsers(this.db, options);
  }

  searchTeamMemberCandidates(teamId: string, query: string): UserSummary[] {
    const normalizedQuery = query.trim().toLowerCase();
    if (normalizedQuery.length < 2) {
      return [];
    }
    const workspaceId = this.getWorkspaceIdForTeam(teamId);
    const restrictToWorkspace = Boolean(workspaceId && this.getWorkspaceKind(workspaceId) === "public_trial");

    const rows = this.db
      .prepare(
        `
        SELECT
          u.id,
          u.email,
          u.display_name,
          u.avatar_key,
          u.avatar_icon_key,
          u.avatar_color_key
        FROM users u
        ${restrictToWorkspace ? "JOIN workspace_memberships wm ON wm.user_id = u.id AND wm.workspace_id = ?" : ""}
        WHERE u.is_super_admin = 0
          AND u.id NOT IN (SELECT tm.user_id FROM team_memberships tm WHERE tm.team_id = ?)
          AND (LOWER(u.display_name) LIKE ? OR LOWER(u.email) LIKE ?)
        ORDER BY
          CASE WHEN LOWER(u.email) = ? THEN 0 ELSE 1 END,
          CASE WHEN LOWER(u.display_name) = ? THEN 0 ELSE 1 END,
          u.display_name COLLATE NOCASE ASC,
          u.email COLLATE NOCASE ASC
        LIMIT 12
      `
      )
      .all(
        ...(restrictToWorkspace && workspaceId ? [workspaceId] : []),
        teamId,
        `%${normalizedQuery}%`,
        `%${normalizedQuery}%`,
        normalizedQuery,
        normalizedQuery
      ) as Array<{
      id: string;
      email: string;
      display_name: string;
      avatar_key: string;
      avatar_icon_key: string | null;
      avatar_color_key: string | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      ...resolveAvatarSelection({
        avatarIconKey: row.avatar_icon_key,
        avatarColorKey: row.avatar_color_key,
        avatarKey: row.avatar_key
      })
    }));
  }

  recordSimulatorHeartbeat(): void {
    this.simulatorHeartbeatAt = Date.now();
  }

  isSimulatorOnline(referenceTime = Date.now()): boolean {
    return this.simulatorHeartbeatAt > 0 && referenceTime - this.simulatorHeartbeatAt <= 12_000;
  }

  isTeamVisibleForRuntimeById(teamId: string): boolean {
    const row = this.db.prepare("SELECT name FROM teams WHERE id = ?").get(teamId) as { name: string } | undefined;
    if (!row) {
      return false;
    }
    return this.isTeamVisibleByRuntime(row.name);
  }

  admitPlatformAccessRequest(actorUserId: string, requestId: string): { user: UserSummary; temporaryPassword: string; invitedNewUser: true } {
    this.assertSuperAdmin(actorUserId);
    const request = this.getPlatformAccessRequestRecord(requestId);
    const result = this.createInvitedUser(request.email);
    const actor = this.getUser(actorUserId);
    this.db.prepare("DELETE FROM platform_access_requests WHERE id = ?").run(requestId);
    this.createActionHistory({
      scope: "platform",
      kind: "platform_access_admitted",
      title: "Platform access admitted",
      message: actor ? `${actor.displayName} admitted ${request.email} to the platform.` : `${request.email} was admitted to the platform.`,
      teamId: null,
      actorUserId
    });
    return result;
  }

  denyPlatformAccessRequest(actorUserId: string, requestId: string): void {
    this.assertSuperAdmin(actorUserId);
    const request = this.getPlatformAccessRequestRecord(requestId);
    const actor = this.getUser(actorUserId);
    this.db.prepare("DELETE FROM platform_access_requests WHERE id = ?").run(request.id);
    this.createActionHistory({
      scope: "platform",
      kind: "platform_access_denied",
      title: "Platform access denied",
      message: actor ? `${actor.displayName} denied platform access for ${request.email}.` : `Platform access was denied for ${request.email}.`,
      teamId: null,
      actorUserId
    });
  }

  getPendingJoinRequestsForTeam(teamId: string): PendingJoinRequestSummary[] {
    return this.queryPendingJoinRequests("WHERE tjr.team_id = ?", [teamId]);
  }

  private queryPendingJoinRequests(whereClause: string, params: string[]): PendingJoinRequestSummary[] {
    const rows = this.db
      .prepare(
        `
        SELECT
          tjr.id,
          tjr.team_id,
          tjr.created_at,
          t.name AS team_name,
          u.id AS user_id,
          u.email,
          u.display_name,
          u.avatar_key,
          u.avatar_icon_key,
          u.avatar_color_key
        FROM team_join_requests tjr
        JOIN teams t ON t.id = tjr.team_id
        JOIN users u ON u.id = tjr.user_id
        ${whereClause}
        ORDER BY tjr.created_at ASC
      `
      )
      .all(...params) as Array<{
      id: string;
      team_id: string;
      created_at: string;
      team_name: string;
      user_id: string;
      email: string;
      display_name: string;
      avatar_key: string;
      avatar_icon_key: string | null;
      avatar_color_key: string | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      teamId: row.team_id,
      teamName: row.team_name,
      requester: {
        id: row.user_id,
        email: row.email,
        displayName: row.display_name,
        ...resolveAvatarSelection({
          avatarIconKey: row.avatar_icon_key,
          avatarColorKey: row.avatar_color_key,
          avatarKey: row.avatar_key
        })
      },
      createdAt: row.created_at
    }));
  }

  approveJoinRequest(actorUserId: string, teamId: string, requestId: string): UserSummary {
    const team = this.requireActiveTeam(teamId);
    this.assertCanManageTeam(actorUserId, teamId);
    const request = this.getJoinRequestRecord(teamId, requestId);
    const admittedUser = this.getUser(request.userId);
    const actor = this.getUser(actorUserId);
    if (!admittedUser || !actor) {
      throw new Error("User not found");
    }

    this.joinTeam(admittedUser.id, teamId, "member");
    this.createNotification(admittedUser.id, {
      kind: "team_join_request_admitted",
      teamId,
      actorUserId,
      title: `Request approved for ${team.name}`,
      message: `${actor.displayName} approved your request to join ${team.name}.`
    });
    this.createActionHistory({
      scope: "team",
      kind: "team_join_request_admitted",
      title: `Join request admitted`,
      message: `${actor.displayName} admitted ${admittedUser.displayName} to ${team.name}.`,
      teamId,
      actorUserId
    });

    return admittedUser;
  }

  denyJoinRequest(actorUserId: string, teamId: string, requestId: string): UserSummary {
    const team = this.requireActiveTeam(teamId);
    this.assertCanManageTeam(actorUserId, teamId);
    const request = this.getJoinRequestRecord(teamId, requestId);
    const deniedUser = this.getUser(request.userId);
    const actor = this.getUser(actorUserId);
    if (!deniedUser || !actor) {
      throw new Error("User not found");
    }

    this.db.prepare("DELETE FROM team_join_requests WHERE id = ?").run(requestId);
    this.createNotification(deniedUser.id, {
      kind: "team_join_request_denied",
      teamId,
      actorUserId,
      title: `Request denied for ${team.name}`,
      message: `${actor.displayName} denied your request to join ${team.name}.`
    });
    this.createActionHistory({
      scope: "team",
      kind: "team_join_request_denied",
      title: `Join request denied`,
      message: `${actor.displayName} denied ${deniedUser.displayName} for ${team.name}.`,
      teamId,
      actorUserId
    });

    return deniedUser;
  }

  addTeamMemberByEmail(actorUserId: string, teamId: string, email: string): { user: UserSummary; temporaryPassword: string | null; invitedNewUser: boolean } {
    const normalizedEmail = email.trim().toLowerCase();
    const team = this.requireActiveTeam(teamId);
    this.assertCanManageTeam(actorUserId, teamId);

    const existingUser = this.getUserByEmail(normalizedEmail);
    if (existingUser && this.isTeamMember(existingUser.id, teamId)) {
      throw new Error("That user already belongs to this team.");
    }

    const workspaceId = this.getWorkspaceIdForTeam(teamId);
    if (!existingUser && workspaceId && this.getWorkspaceKind(workspaceId) === "public_trial") {
      if (this.countWorkspaceMembers(workspaceId) >= this.config.publicTrial.maxUsersPerWorkspace) {
        throw new Error(`Public trial workspaces can have at most ${this.config.publicTrial.maxUsersPerWorkspace} users.`);
      }
    }

    const result =
      existingUser
        ? { user: existingUser, temporaryPassword: null, invitedNewUser: false }
        : this.createInvitedUser(normalizedEmail);

    this.deletePlatformAccessRequestByEmail(normalizedEmail);

    this.joinTeam(result.user.id, teamId, "member");
    const actor = this.getUser(actorUserId);
    this.createNotification(result.user.id, {
      kind: "team_added_to_team",
      teamId,
      actorUserId,
      title: `Added to ${team.name}`,
      message: actor ? `${actor.displayName} added you to ${team.name}.` : `You were added to ${team.name}.`
    });
    this.createActionHistory({
      scope: "team",
      kind: "team_added_to_team",
      title: "Person added to team",
      message: actor ? `${actor.displayName} added ${result.user.email} to ${team.name}.` : `${result.user.email} was added to ${team.name}.`,
      teamId,
      actorUserId
    });

    return result;
  }

  promoteTeamMember(actorUserId: string, teamId: string, memberUserId: string): void {
    const team = this.requireActiveTeam(teamId);
    this.assertCanManageTeam(actorUserId, teamId);
    if (!this.isTeamMember(memberUserId, teamId)) {
      throw new Error("That user is not a member of this team.");
    }
    this.db.prepare("UPDATE team_memberships SET role = 'team_admin' WHERE team_id = ? AND user_id = ?").run(teamId, memberUserId);
    const actor = this.getUser(actorUserId);
    const promotedUser = this.getUser(memberUserId);
    this.createNotification(memberUserId, {
      kind: "team_admin_promoted",
      teamId,
      actorUserId,
      title: `Promoted in ${team.name}`,
      message: actor ? `${actor.displayName} promoted you to team-admin in ${team.name}.` : `You were promoted to team-admin in ${team.name}.`
    });
    this.createActionHistory({
      scope: "team",
      kind: "team_admin_promoted",
      title: "Team-admin promoted",
      message:
        actor && promotedUser
          ? `${actor.displayName} promoted ${promotedUser.displayName} to team-admin in ${team.name}.`
          : `A team member was promoted to team-admin in ${team.name}.`,
      teamId,
      actorUserId
    });
  }

  demoteTeamAdmin(actorUserId: string, teamId: string, memberUserId: string): void {
    this.requireActiveTeam(teamId);
    this.assertSuperAdmin(actorUserId);
    if (this.getTeamUserRole(memberUserId, teamId) !== "team_admin") {
      throw new Error("That user is not a team admin.");
    }
    this.db.prepare("UPDATE team_memberships SET role = 'member' WHERE team_id = ? AND user_id = ?").run(teamId, memberUserId);
  }

  removeTeamMember(actorUserId: string, teamId: string, memberUserId: string): void {
    const team = this.requireActiveTeam(teamId);
    if (this.isSuperAdmin(memberUserId)) {
      throw new Error("The super-admin always remains a member of every team.");
    }
    const targetRole = this.getTeamUserRole(memberUserId, teamId);
    if (targetRole === "none") {
      throw new Error("That user is not a member of this team.");
    }

    if (targetRole === "team_admin") {
      this.assertSuperAdmin(actorUserId);
    } else {
      this.assertCanManageTeam(actorUserId, teamId);
    }

    this.db.prepare("DELETE FROM team_memberships WHERE team_id = ? AND user_id = ?").run(teamId, memberUserId);
    this.db.prepare("DELETE FROM team_join_requests WHERE team_id = ? AND user_id = ?").run(teamId, memberUserId);
    this.touchTeamActivity(teamId);

    const actor = this.getUser(actorUserId);
    this.createNotification(memberUserId, {
      kind: "team_removed_from_team",
      teamId,
      actorUserId,
      title: `Removed from ${team.name}`,
      message: actor ? `${actor.displayName} removed you from ${team.name}.` : `You were removed from ${team.name}.`
    });
    const removedUser = this.getUser(memberUserId);
    this.createActionHistory({
      scope: "team",
      kind: "team_removed_from_team",
      title: "Person removed from team",
      message:
        actor && removedUser
          ? `${actor.displayName} removed ${removedUser.displayName} from ${team.name}.`
          : `A person was removed from ${team.name}.`,
      teamId,
      actorUserId
    });
  }

  setTeamArchived(actorUserId: string, teamId: string, archived: boolean): TeamSummary {
    this.assertCanManageTeam(actorUserId, teamId);
    const team = this.getTeam(teamId);
    if (!team) {
      throw new Error("Team not found");
    }

    const changedAt = nowIso();
    this.db
      .prepare("UPDATE teams SET archived = ?, archived_at = ?, last_activity_at = ? WHERE id = ?")
      .run(archived ? 1 : 0, archived ? changedAt : null, changedAt, teamId);
    const actor = this.getUser(actorUserId);
    this.createActionHistory({
      scope: "team",
      kind: archived ? "team_archived" : "team_unarchived",
      title: archived ? "Team archived" : "Team unarchived",
      message: actor ? `${actor.displayName} ${archived ? "archived" : "unarchived"} ${team.name}.` : `${team.name} ${archived ? "archived" : "unarchived"}.`,
      teamId,
      actorUserId,
      createdAt: changedAt
    });

    return this.getTeam(teamId)!;
  }

  updateTeamSettings(
    teamId: string,
    patch: {
      name?: string;
      deckKey?: DeckKey;
      fibonacciRangeStart?: FibonacciRangeStart | null;
      fibonacciRangeEnd?: FibonacciRangeEnd | null;
      timerSeconds?: TeamTimerSeconds | null;
      iconKey?: string;
      logoOpacity?: number;
      backgroundOpacity?: number;
      historyTimezonePopupEnabled?: boolean;
      historyTimezoneKeys?: HistoryTimeZoneKey[];
      minimumVotePercentEnabled?: boolean;
      minimumVotePercent?: number;
      jiraProjectKey?: string | null;
      jiraJql?: string | null;
    }
  ): TeamSummary {
    const current = this.getTeam(teamId);
    if (!current) {
      throw new Error("Team not found");
    }

    let nextSlug = current.slug;
    const nextName = patch.name?.trim() || current.name;
    if (nextName !== current.name) {
      const baseSlug = slugify(nextName) || `team-${teamId.slice(0, 6).toLowerCase()}`;
      nextSlug = baseSlug;
      let suffix = 1;
      const workspaceId = this.getWorkspaceIdForTeam(teamId) ?? DEFAULT_WORKSPACE_ID;
      const existingTeamWithName = this.findTeamByName(nextName, workspaceId);
      if (existingTeamWithName && existingTeamWithName.id !== teamId) {
        throw new Error("A team with this name already exists in this workspace.");
      }

      while (this.db.prepare("SELECT 1 FROM teams WHERE slug = ? AND id != ?").get(nextSlug, teamId)) {
        nextSlug = `${baseSlug}-${suffix++}`;
      }
    }

    const nextDeckKey = patch.deckKey ?? current.deckKey;
    const nextFibonacciRange =
      nextDeckKey === "fibonacci"
        ? patch.fibonacciRangeStart !== undefined || patch.fibonacciRangeEnd !== undefined
          ? normalizeStoredFibonacciRange(patch.fibonacciRangeStart ?? null, patch.fibonacciRangeEnd ?? null)
          : normalizeStoredFibonacciRange(current.fibonacciRangeStart, current.fibonacciRangeEnd)
        : { fibonacciRangeStart: null, fibonacciRangeEnd: null };

    const next = {
      name: nextName,
      slug: nextSlug,
      deckKey: nextDeckKey,
      fibonacciRangeStart: nextFibonacciRange.fibonacciRangeStart,
      fibonacciRangeEnd: nextFibonacciRange.fibonacciRangeEnd,
      timerSeconds: patch.timerSeconds === undefined ? current.timerSeconds : patch.timerSeconds,
      iconKey: patch.iconKey ?? current.iconKey,
      logoOpacity: patch.logoOpacity ?? current.logoOpacity,
      backgroundOpacity: patch.backgroundOpacity ?? current.backgroundOpacity,
      historyTimezonePopupEnabled: patch.historyTimezonePopupEnabled ?? current.historyTimezonePopupEnabled,
      historyTimezoneKeys: patch.historyTimezoneKeys === undefined ? current.historyTimezoneKeys : normalizeHistoryTimeZoneKeys(patch.historyTimezoneKeys),
      minimumVotePercentEnabled: patch.minimumVotePercentEnabled ?? current.minimumVotePercentEnabled,
      minimumVotePercent:
        patch.minimumVotePercent === undefined ? current.minimumVotePercent : normalizeMinimumVotePercent(patch.minimumVotePercent),
      jiraProjectKey: patch.jiraProjectKey === undefined ? current.jiraProjectKey : patch.jiraProjectKey?.trim() || null,
      jiraJql: patch.jiraJql === undefined ? current.jiraJql : patch.jiraJql?.trim() || null
    };

    this.db
      .prepare(
        "UPDATE teams SET name = ?, slug = ?, deck_key = ?, fibonacci_range_start = ?, fibonacci_range_end = ?, timer_seconds = ?, icon_key = ?, logo_opacity = ?, background_opacity = ?, history_timezone_popup_enabled = ?, history_timezone_keys_json = ?, minimum_vote_percent_enabled = ?, minimum_vote_percent = ?, jira_project_key = ?, jira_jql = ?, last_activity_at = ? WHERE id = ?"
      )
      .run(
        next.name,
        next.slug,
        next.deckKey,
        next.fibonacciRangeStart,
        next.fibonacciRangeEnd,
        next.timerSeconds,
        next.iconKey,
        next.logoOpacity,
        next.backgroundOpacity,
        next.historyTimezonePopupEnabled ? 1 : 0,
        stringifyHistoryTimeZoneKeys(next.historyTimezoneKeys),
        next.minimumVotePercentEnabled ? 1 : 0,
        next.minimumVotePercent,
        next.jiraProjectKey,
        next.jiraJql,
        nowIso(),
        teamId
      );

    const activeRound = this.getCurrentRound(teamId);
    if (activeRound && activeRound.status === "active") {
      this.db
        .prepare("UPDATE rounds SET deck_key = ?, fibonacci_range_start = ?, fibonacci_range_end = ? WHERE id = ?")
        .run(next.deckKey, next.fibonacciRangeStart, next.fibonacciRangeEnd, activeRound.id);
    }

    return this.getTeam(teamId)!;
  }

  getTeam(teamId: string): TeamSummary | null {
    const row = this.db
      .prepare(
        "SELECT id, name, slug, demo, deck_key, fibonacci_range_start, fibonacci_range_end, timer_seconds, icon_key, logo_opacity, background_opacity, history_timezone_popup_enabled, history_timezone_keys_json, minimum_vote_percent_enabled, minimum_vote_percent, jira_project_key, jira_jql, archived, last_activity_at FROM teams WHERE id = ?"
      )
      .get(teamId) as
      | {
          id: string;
          name: string;
          slug: string;
          demo: number;
          deck_key: DeckKey;
          fibonacci_range_start: FibonacciRangeStart | null;
          fibonacci_range_end: FibonacciRangeEnd | null;
          timer_seconds: number | null;
          icon_key: string;
          logo_opacity: number;
          background_opacity: number;
          history_timezone_popup_enabled: number;
          history_timezone_keys_json: string | null;
          minimum_vote_percent_enabled: number;
          minimum_vote_percent: number;
          jira_project_key: string | null;
          jira_jql: string | null;
          archived: number;
          last_activity_at: string;
        }
      | undefined;

    const fibonacciRange = row ? normalizeStoredFibonacciRange(row.fibonacci_range_start, row.fibonacci_range_end) : null;

    return row
      ? {
        id: row.id,
        name: row.name,
        slug: row.slug,
        demo: row.demo === 1,
        deckKey: row.deck_key,
          fibonacciRangeStart: fibonacciRange?.fibonacciRangeStart ?? null,
          fibonacciRangeEnd: fibonacciRange?.fibonacciRangeEnd ?? null,
          timerSeconds: parseTimerSeconds(row.timer_seconds),
          iconKey: row.icon_key,
          logoOpacity: row.logo_opacity,
          backgroundOpacity: row.background_opacity,
          historyTimezonePopupEnabled: row.history_timezone_popup_enabled === 1,
          historyTimezoneKeys: parseHistoryTimeZoneKeys(row.history_timezone_keys_json),
          minimumVotePercentEnabled: row.minimum_vote_percent_enabled === 1,
          minimumVotePercent: normalizeMinimumVotePercent(row.minimum_vote_percent),
          jiraProjectKey: row.jira_project_key,
          jiraJql: row.jira_jql,
          archived: row.archived === 1,
          lastActivityAt: row.last_activity_at
        }
      : null;
  }

  private findTeamByName(name: string, workspaceId: string): { id: string } | undefined {
    return this.db
      .prepare("SELECT id FROM teams WHERE workspace_id = ? AND name = ? COLLATE NOCASE")
      .get(workspaceId, name.trim()) as { id: string } | undefined;
  }

  getPendingIssues(teamId: string): TeamPendingIssue[] {
    const rows = this.db
      .prepare(
        `
        SELECT id, source, external_issue_id, issue_key, title, imported_at, updated_at
        FROM team_pending_issues
        WHERE team_id = ?
        ORDER BY position ASC, updated_at DESC, id ASC
      `
      )
      .all(teamId) as Array<{
      id: string;
      source: string;
      external_issue_id: string;
      issue_key: string;
      title: string;
      imported_at: string;
      updated_at: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      source: row.source as TeamPendingIssue["source"],
      externalIssueId: row.external_issue_id,
      issueKey: row.issue_key,
      title: row.title,
      displayTitle: `${row.issue_key} - ${row.title}`.trim(),
      importedAt: row.imported_at,
      updatedAt: row.updated_at
    }));
  }

  importPendingJiraIssues(teamId: string, issues: Array<{ externalIssueId: string; issueKey: string; title: string }>): TeamPendingIssue[] {
    const importedAt = nowIso();
    const upsertStatement = this.db.prepare(
      `
      INSERT INTO team_pending_issues(id, team_id, source, external_issue_id, issue_key, title, imported_at, updated_at, position)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(team_id, source, external_issue_id)
      DO UPDATE SET issue_key = excluded.issue_key, title = excluded.title, updated_at = excluded.updated_at, position = excluded.position
    `
    );
    const existingIdStatement = this.db.prepare(
      `
      SELECT id
      FROM team_pending_issues
      WHERE team_id = ? AND source = ? AND external_issue_id = ?
      LIMIT 1
    `
    );

    this.db.exec("BEGIN");
    try {
      issues.forEach((issue, index) => {
        const existing = existingIdStatement.get(teamId, JIRA_PENDING_ISSUE_SOURCE, issue.externalIssueId) as { id: string } | undefined;
        upsertStatement.run(
          existing?.id ?? nanoid(),
          teamId,
          JIRA_PENDING_ISSUE_SOURCE,
          issue.externalIssueId,
          issue.issueKey,
          issue.title,
          importedAt,
          importedAt,
          index
        );
      });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    this.touchTeamActivity(teamId, importedAt);
    return this.getPendingIssues(teamId);
  }

  loadPendingIssueIntoRound(teamId: string, pendingIssueId: string): RoundState {
    const row = this.db
      .prepare(
        `
        SELECT id, issue_key, title
        FROM team_pending_issues
        WHERE team_id = ? AND id = ?
        LIMIT 1
      `
      )
      .get(teamId, pendingIssueId) as { id: string; issue_key: string; title: string } | undefined;

    if (!row) {
      throw new Error("Pending issue not found.");
    }

    return this.createRound(teamId, `${row.issue_key} - ${row.title}`.trim(), null, row.id);
  }

  createRound(teamId: string, title: string, revoteHistoryEntryId: string | null = null, pendingIssueId: string | null = null): RoundState {
    return perfTracker.measure("repository.createRound", () => {
      this.db.prepare("UPDATE rounds SET status = 'archived' WHERE team_id = ? AND status IN ('active', 'revealed')").run(teamId);

      const team = this.getTeam(teamId);
      if (!team) {
        throw new Error("Team not found");
      }

      const roundId = nanoid();
      const createdAt = nowIso();
      const timerStartedAt = team.timerSeconds ? createdAt : null;
      const timerExpiresAt = team.timerSeconds ? plusSeconds(team.timerSeconds) : null;
      this.db
        .prepare(
          `
          INSERT INTO rounds(id, team_id, title, deck_key, fibonacci_range_start, fibonacci_range_end, status, created_at, timer_started_at, timer_expires_at, revealed_at, reveal_average, revote_history_entry_id, pending_issue_id)
          VALUES(?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, NULL, NULL, ?, ?)
        `
        )
        .run(
          roundId,
          teamId,
          title.trim(),
          team.deckKey,
          team.fibonacciRangeStart,
          team.fibonacciRangeEnd,
          createdAt,
          timerStartedAt,
          timerExpiresAt,
          revoteHistoryEntryId,
          pendingIssueId
        );
      this.touchTeamActivity(teamId, createdAt);

      return this.getCurrentRound(teamId)!;
    });
  }

  cancelRound(roundId: string): { teamId: string } {
    return perfTracker.measure("repository.cancelRound", () => {
      const round = this.getRoundState(roundId);
      if (!round) {
        throw new Error("Round not found");
      }
      if (round.status !== "active") {
        throw new RoundNotActiveError();
      }
      this.db.prepare("UPDATE rounds SET status = 'archived', timer_expires_at = NULL WHERE id = ? AND status = 'active'").run(roundId);
      this.touchTeamActivity(round.teamId);
      return { teamId: round.teamId };
    });
  }

  restartActiveRound(roundId: string): RoundState {
    return perfTracker.measure("repository.restartActiveRound", () => {
      const round = this.getRoundState(roundId);
      if (!round) {
        throw new Error("Round not found");
      }
      if (round.status !== "active") {
        throw new RoundNotActiveError();
      }
      return this.createRound(round.teamId, round.title, round.revoteHistoryEntryId, round.pendingIssueId);
    });
  }

  castVote(roundId: string, userId: string, value: string): RoundState {
    return perfTracker.measure("repository.castVote", () => {
      const round = this.getRoundState(roundId);
      if (!round) {
        throw new Error("Round not found");
      }

      if (round.status !== "active") {
        throw new RoundNotActiveError();
      }

      this.db
        .prepare(
          `
          INSERT INTO votes(round_id, user_id, value, updated_at)
          VALUES(?, ?, ?, ?)
          ON CONFLICT(round_id, user_id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
        `
        )
        .run(roundId, userId, value, nowIso());
      this.touchTeamActivity(round.teamId);

      return this.getRoundState(roundId)!;
    });
  }

  submitVote(roundId: string, userId: string, value: string): { teamId: string; roundId: string } {
    return perfTracker.measure("repository.castVote", () => {
      const round = this.db
        .prepare(
          `
          SELECT id, team_id, status
          FROM rounds
          WHERE id = ?
        `
        )
        .get(roundId) as
        | {
            id: string;
            team_id: string;
            status: "active" | "revealed";
          }
        | undefined;
      if (!round) {
        throw new Error("Round not found");
      }

      if (round.status !== "active") {
        throw new RoundNotActiveError();
      }

      this.db
        .prepare(
          `
          INSERT INTO votes(round_id, user_id, value, updated_at)
          VALUES(?, ?, ?, ?)
          ON CONFLICT(round_id, user_id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
        `
        )
        .run(roundId, userId, value, nowIso());
      this.touchTeamActivity(round.team_id);

      return {
        teamId: round.team_id,
        roundId
      };
    });
  }

  revealRound(roundId: string, options?: { eligibleParticipantIds?: readonly string[] }): RoundState {
    return perfTracker.measure("repository.revealRound", () => {
      const round = this.getRoundState(roundId);
      if (!round) {
        throw new Error("Round not found");
      }

      const team = this.getTeam(round.teamId);
      if (!team) {
        throw new Error("Team not found");
      }
      const rawVotes = this.getVoteSnapshot(roundId, true);
      const average = calculateAverage(rawVotes.map((vote) => vote.value), round.deckKey);
      const eligibleParticipantIds = options?.eligibleParticipantIds ? new Set(options.eligibleParticipantIds) : null;
      const totalEligibleParticipants = eligibleParticipantIds ? eligibleParticipantIds.size : this.getTeamMembers(round.teamId).length;
      const votedCount = eligibleParticipantIds ? rawVotes.filter((vote) => eligibleParticipantIds.has(vote.userId)).length : rawVotes.length;
      const notVotedCount = Math.max(0, totalEligibleParticipants - votedCount);
      const quorumBlocked =
        team.minimumVotePercentEnabled &&
        totalEligibleParticipants > 0 &&
        (votedCount / totalEligibleParticipants) * 100 < normalizeMinimumVotePercent(team.minimumVotePercent);
      const revealedAt = nowIso();
      if (quorumBlocked) {
        this.db
          .prepare(
            "UPDATE rounds SET reveal_quorum_blocked = 1, reveal_voted_count = ?, reveal_not_voted_count = ?, timer_expires_at = NULL WHERE id = ? AND status = 'active'"
          )
          .run(votedCount, notVotedCount, roundId);
        return this.getRoundState(roundId)!;
      }

      const workspaceId = this.getWorkspaceIdForTeam(round.teamId);
      if (
        workspaceId &&
        this.getWorkspaceKind(workspaceId) === "public_trial" &&
        this.countWorkspaceMonthlyReveals(workspaceId, revealedAt) >= this.config.publicTrial.maxRevealedRoundsPerWorkspacePerMonth
      ) {
        throw new Error(
          `Public trial workspaces can reveal at most ${this.config.publicTrial.maxRevealedRoundsPerWorkspacePerMonth} rounds per month.`
        );
      }

      const result = this.db
        .prepare(
          "UPDATE rounds SET status = 'revealed', revealed_at = ?, reveal_average = ?, reveal_quorum_blocked = ?, reveal_voted_count = ?, reveal_not_voted_count = ?, timer_expires_at = NULL WHERE id = ? AND status = 'active'"
        )
        .run(revealedAt, average, 0, votedCount, notVotedCount, roundId);
      if (!result.changes) {
        const refreshed = this.getRoundState(roundId);
        if (!refreshed) {
          throw new Error("Round not found");
        }
        return refreshed;
      }

      const voteSnapshot = JSON.stringify(rawVotes);
      const participantCount = rawVotes.length;

      if (round.revoteHistoryEntryId) {
        this.db
          .prepare(
            `
            UPDATE history_entries
            SET title = ?, deck_key = ?, fibonacci_range_start = ?, fibonacci_range_end = ?, average_score = ?, participant_count = ?, quorum_blocked = ?, voted_count = ?, not_voted_count = ?, completed_at = ?, votes_json = ?
            WHERE id = ?
          `
          )
          .run(
            round.title,
            round.deckKey,
            round.fibonacciRangeStart,
            round.fibonacciRangeEnd,
            average,
            participantCount,
            0,
            votedCount,
            notVotedCount,
            revealedAt,
            voteSnapshot,
            round.revoteHistoryEntryId
          );
      } else {
        this.db
          .prepare(
            `
            INSERT INTO history_entries(id, team_id, title, deck_key, fibonacci_range_start, fibonacci_range_end, average_score, participant_count, quorum_blocked, voted_count, not_voted_count, completed_at, votes_json)
            VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
          )
          .run(
            nanoid(),
            round.teamId,
            round.title,
            round.deckKey,
            round.fibonacciRangeStart,
            round.fibonacciRangeEnd,
            average,
            participantCount,
            0,
            votedCount,
            notVotedCount,
            revealedAt,
            voteSnapshot
          );
      }
      if (round.pendingIssueId) {
        this.db.prepare("DELETE FROM team_pending_issues WHERE id = ?").run(round.pendingIssueId);
      }
      this.touchTeamActivity(round.teamId, revealedAt);

      return this.getRoundState(roundId)!;
    });
  }

  revealRoundIfPreviouslyQuorumBlocked(roundId: string, options?: { eligibleParticipantIds?: readonly string[] }): RoundState | null {
    const round = this.getRoundState(roundId);
    if (!round || round.status !== "active" || !round.quorumBlocked) {
      return null;
    }

    const team = this.getTeam(round.teamId);
    if (!team || !team.minimumVotePercentEnabled) {
      return null;
    }

    const eligibleParticipantIds = options?.eligibleParticipantIds ? new Set(options.eligibleParticipantIds) : null;
    const totalEligibleParticipants = eligibleParticipantIds ? eligibleParticipantIds.size : this.getTeamMembers(round.teamId).length;
    if (totalEligibleParticipants === 0) {
      return null;
    }

    const rawVotes = this.getVoteSnapshot(roundId, true);
    const votedCount = eligibleParticipantIds ? rawVotes.filter((vote) => eligibleParticipantIds.has(vote.userId)).length : rawVotes.length;
    if ((votedCount / totalEligibleParticipants) * 100 < normalizeMinimumVotePercent(team.minimumVotePercent)) {
      this.db
        .prepare("UPDATE rounds SET reveal_voted_count = ?, reveal_not_voted_count = ? WHERE id = ? AND status = 'active'")
        .run(votedCount, Math.max(0, totalEligibleParticipants - votedCount), roundId);
      return this.getRoundState(roundId);
    }

    return this.revealRound(roundId, options);
  }

  getCurrentRound(teamId: string): RoundState | null {
    const row = this.db
      .prepare(
        `
        SELECT id, team_id, title, deck_key, fibonacci_range_start, fibonacci_range_end, status, created_at, revealed_at, reveal_average, reveal_quorum_blocked, reveal_voted_count, reveal_not_voted_count, revote_history_entry_id, pending_issue_id
             , timer_started_at, timer_expires_at
        FROM rounds
        WHERE team_id = ? AND status IN ('active', 'revealed')
        ORDER BY created_at DESC
        LIMIT 1
      `
      )
      .get(teamId) as RoundRow | undefined;

    return row ? this.inflateRound(row) : null;
  }

  getRoundState(roundId: string): RoundState | null {
    const row = this.db
      .prepare(
        `
        SELECT id, team_id, title, deck_key, fibonacci_range_start, fibonacci_range_end, status, created_at, timer_started_at, timer_expires_at, revealed_at, reveal_average, reveal_quorum_blocked, reveal_voted_count, reveal_not_voted_count, revote_history_entry_id, pending_issue_id
        FROM rounds
        WHERE id = ?
      `
      )
      .get(roundId) as RoundRow | undefined;

    return row ? this.inflateRound(row) : null;
  }

  getHistory(teamId: string): HistoryEntry[] {
    return getHistory(this.db, teamId);
  }

  getHistoryPage(teamId: string, options?: { cursor?: { completedAt: string; id: string } | null; limit?: number | null }): HistoryPage {
    return getHistoryPage(this.db, teamId, options);
  }

  searchHistory(
    teamId: string,
    filters: TeamHistorySearchFilters,
    options?: { cursor?: { completedAt: string; id: string } | null; limit?: number | null }
  ): TeamHistorySearchPage {
    return searchHistoryPage(this.db, teamId, filters, options);
  }

  getLatestHistoryEntry(teamId: string): HistoryEntry | null {
    return getLatestHistoryEntry(this.db, teamId);
  }

  getHistoryEntry(teamId: string, historyEntryId: string): HistoryEntry | null {
    return getHistoryEntryById(this.db, teamId, historyEntryId);
  }

  addHistoryComment(teamId: string, historyEntryId: string, userId: string, body: string): HistoryComment {
    const trimmedBody = body.trim();
    if (!historyEntryExists(this.db, teamId, historyEntryId)) {
      throw new Error("History entry not found");
    }
    const author = this.getCurrentUser(userId);
    if (!author) {
      throw new Error("User not found");
    }

    const createdAt = nowIso();
    const id = nanoid();
    insertHistoryComment(this.db, {
      id,
      historyEntryId,
      userId,
      authorSignature: `${author.displayName} (${author.email})`,
      body: trimmedBody,
      createdAt
    });
    this.touchTeamActivity(teamId, createdAt);
    return getHistoryComment(this.db, historyEntryId, id)!;
  }

  updateHistoryComment(teamId: string, historyEntryId: string, commentId: string, userId: string, body: string): HistoryComment {
    const trimmedBody = body.trim();
    const existing = getOwnedHistoryComment(this.db, teamId, historyEntryId, commentId, userId);
    const existingUpdatedAtMs = new Date(existing.updatedAt).getTime();
    const updatedAt = new Date(Math.max(Date.now(), existingUpdatedAtMs + 1)).toISOString();
    updateHistoryCommentBody(this.db, existing.id, trimmedBody, updatedAt);
    this.touchTeamActivity(teamId, updatedAt);
    return getHistoryComment(this.db, historyEntryId, existing.id)!;
  }

  deleteHistoryComment(teamId: string, historyEntryId: string, commentId: string, userId: string): void {
    const existing = getOwnedHistoryComment(this.db, teamId, historyEntryId, commentId, userId);
    deleteHistoryCommentById(this.db, existing.id);
    this.touchTeamActivity(teamId);
  }

  exportWholeDatabaseSnapshot(): { fileName: string; bytes: Buffer } {
    const tempDir = fs.mkdtempSync(path.join(this.config.dataDir, "db-export-"));
    const fileName = `planning-poker-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`;
    const snapshotPath = path.join(tempDir, fileName);
    try {
      this.db.exec("PRAGMA wal_checkpoint(FULL)");
      this.db.exec(`VACUUM INTO '${snapshotPath.replaceAll("'", "''")}'`);
      return {
        fileName,
        bytes: fs.readFileSync(snapshotPath)
      };
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  importWholeDatabaseSnapshot(bytes: Buffer): CurrentUserSummary {
    const tempDir = fs.mkdtempSync(path.join(this.config.dataDir, "db-import-"));
    const candidatePath = path.join(tempDir, "import.sqlite");
    const backupPath = path.join(tempDir, "backup.sqlite");
    fs.writeFileSync(candidatePath, bytes);
    this.validateDatabaseSnapshot(candidatePath);

    this.db.exec("PRAGMA wal_checkpoint(FULL)");
    fs.copyFileSync(this.config.databasePath, backupPath);

    this.closeDatabase();
    try {
      fs.rmSync(this.config.databasePath, { force: true });
      fs.rmSync(`${this.config.databasePath}-wal`, { force: true });
      fs.rmSync(`${this.config.databasePath}-shm`, { force: true });
      fs.copyFileSync(candidatePath, this.config.databasePath);
      this.openDatabase();
      const importedSuperAdmin = this.getSuperAdminUser();
      if (!importedSuperAdmin) {
        throw new Error("Imported database does not contain a usable super-admin account.");
      }
      return importedSuperAdmin;
    } catch (error) {
      fs.copyFileSync(backupPath, this.config.databasePath);
      this.openDatabase();
      throw error;
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  exportTeamHistory(teamId: string, includeComments = true): TeamHistoryExportPackage {
    const team = this.getTeam(teamId);
    if (!team) {
      throw new Error("Team not found");
    }
    const entries = this.getHistory(teamId).map((entry) => ({
      entryId: entry.id,
      title: entry.title,
      deckKey: entry.deckKey,
      fibonacciRangeStart: entry.fibonacciRangeStart,
      fibonacciRangeEnd: entry.fibonacciRangeEnd,
      averageScore: entry.averageScore,
      participantCount: entry.participantCount,
      completedAt: entry.completedAt,
      votes: entry.votes,
      comments: includeComments
        ? entry.comments.map((comment) => ({
            id: comment.id,
            authorSignature: comment.authorSignature,
            body: comment.body,
            createdAt: comment.createdAt,
            updatedAt: comment.updatedAt
          }))
        : []
    }));

    return {
      version: 1,
      exportId: nanoid(),
      exportedAt: nowIso(),
      includeComments,
      sourceTeam: {
        id: team.id,
        name: team.name,
        slug: team.slug,
        deckKey: team.deckKey,
        fibonacciRangeStart: team.fibonacciRangeStart,
        fibonacciRangeEnd: team.fibonacciRangeEnd
      },
      entries
    };
  }

  importTeamHistory(
    importerUserId: string,
    input: {
      package: TeamHistoryExportPackage;
      targetTeamId?: string | null;
      teamName?: string | null;
    }
  ): { importedCount: number; skippedCount: number; team: TeamSummary; createdTeam: boolean } {
    if (input.package.version !== 1) {
      throw new Error("Unsupported team history package version.");
    }

    const importer = this.getCurrentUser(importerUserId);
    if (!importer) {
      throw new Error("User not found");
    }

    let targetTeam: TeamSummary | null = null;
    let createdTeam = false;

    if (input.targetTeamId) {
      targetTeam = this.getTeam(input.targetTeamId);
      if (!targetTeam) {
        throw new Error("Team not found");
      }
      const permission = this.getTeamPermissionContext(importerUserId, targetTeam.id);
      if (!permission.isSuperAdmin && permission.role !== "team_admin") {
        throw new Error("Only team admins can import into this team.");
      }
      if (targetTeam.archived) {
        throw new Error("Archived teams are read-only until a team admin or the super-admin unarchives them.");
      }
    } else {
      const nextTeamName = input.teamName?.trim();
      if (!nextTeamName || nextTeamName.length < 2) {
        throw new Error("A team name is required when importing into a new team.");
      }
      targetTeam = this.createTeam(importerUserId, nextTeamName);
      createdTeam = true;
      targetTeam = this.updateTeamSettings(targetTeam.id, {
        deckKey: input.package.sourceTeam.deckKey,
        fibonacciRangeStart: input.package.sourceTeam.fibonacciRangeStart,
        fibonacciRangeEnd: input.package.sourceTeam.fibonacciRangeEnd
      });
    }

    const duplicateStatement = this.db.prepare(
      `
      SELECT id
      FROM history_entries
      WHERE team_id = ?
        AND import_batch_id = ?
        AND import_entry_id = ?
      LIMIT 1
    `
    );
    const insertHistoryEntryStatement = this.db.prepare(
      `
      INSERT INTO history_entries(
        id,
        team_id,
        title,
        deck_key,
        fibonacci_range_start,
        fibonacci_range_end,
        average_score,
        participant_count,
        completed_at,
        votes_json,
        import_batch_id,
        import_entry_id
      )
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    );
    const updateImportedCommentTimestampStatement = this.db.prepare("UPDATE history_comments SET updated_at = ? WHERE id = ?");

    let importedCount = 0;
    let skippedCount = 0;
    const importedAt = nowIso();
    this.db.exec("BEGIN");
    try {
      for (const entry of input.package.entries) {
        const existingImport = duplicateStatement.get(targetTeam.id, input.package.exportId, entry.entryId) as { id: string } | undefined;
        if (existingImport) {
          skippedCount += 1;
          continue;
        }

        const historyEntryId = nanoid();
        insertHistoryEntryStatement.run(
          historyEntryId,
          targetTeam.id,
          entry.title,
          entry.deckKey,
          entry.fibonacciRangeStart,
          entry.fibonacciRangeEnd,
          entry.averageScore,
          entry.participantCount,
          entry.completedAt,
          JSON.stringify(entry.votes),
          input.package.exportId,
          entry.entryId
        );

        for (const comment of entry.comments) {
          const commentId = nanoid();
          insertHistoryComment(this.db, {
            id: commentId,
            historyEntryId,
            userId: importerUserId,
            authorSignature: comment.authorSignature,
            importedImmutable: true,
            body: comment.body,
            createdAt: comment.createdAt
          });
          updateImportedCommentTimestampStatement.run(comment.updatedAt, commentId);
        }

        importedCount += 1;
      }

      this.touchTeamActivity(targetTeam.id, importedAt);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return {
      importedCount,
      skippedCount,
      team: this.getTeam(targetTeam.id)!,
      createdTeam
    };
  }

  getRoundVoteValues(roundId: string | null): Array<{ userId: string; value: string }> {
    if (!roundId) {
      return [];
    }

    const rows = this.db
      .prepare(
        `
        SELECT user_id, value
        FROM votes
        WHERE round_id = ?
      `
      )
      .all(roundId) as Array<{ user_id: string; value: string }>;

    return rows.map((row) => ({
      userId: row.user_id,
      value: row.value
    }));
  }

  getCurrentRoundVoteSummary(teamId: string): {
    roundId: string;
    status: "active" | "revealed";
    votedUserIds: string[];
    voteValuesByUserId: Map<string, string>;
    votedCount: number;
    notVotedCount: number;
  } | null {
    const row = this.db
      .prepare(
        `
        SELECT id, status
        FROM rounds
        WHERE team_id = ? AND status IN ('active', 'revealed')
        ORDER BY created_at DESC
        LIMIT 1
      `
      )
      .get(teamId) as { id: string; status: "active" | "revealed" } | undefined;

    if (!row) {
      return null;
    }

    const voteRows = this.getRoundVoteValues(row.id);
    const votedUserIds = voteRows.map((vote) => vote.userId);
    const totalEligibleParticipants = this.db
      .prepare(
        `
        SELECT COUNT(*) AS count
        FROM team_memberships tm
        JOIN users u ON u.id = tm.user_id
        WHERE tm.team_id = ?
          AND u.is_super_admin = 0
      `
      )
      .get(teamId) as { count: number };

    return {
      roundId: row.id,
      status: row.status,
      votedUserIds,
      voteValuesByUserId: new Map(voteRows.map((vote) => [vote.userId, vote.value])),
      votedCount: votedUserIds.length,
      notVotedCount: Math.max(0, totalEligibleParticipants.count - votedUserIds.length)
    };
  }

  getTeamStateContext(teamId: string, userId: string): {
    team: TeamSummary;
    memberships: TeamMembershipSummary[];
    availableTeams: TeamMembershipSummary[];
    currentUser: CurrentUserSummary;
    currentUserRole: TeamUserRole;
  } {
    const team = this.getTeam(teamId);
    const currentUser = this.getCurrentUserForTeam(userId, teamId);
    if (!team || !currentUser) {
      throw new Error("Not found");
    }
    if (!this.isTeamVisibleByRuntime(team.name)) {
      throw new Error("Forbidden");
    }
    if (!this.isTeamVisibleToUser(team.demo, currentUser.isSuperAdmin)) {
      throw new Error("Forbidden");
    }

    const permission = this.getTeamPermissionContext(userId, teamId);
    if (permission.role === "none" && !permission.isSuperAdmin) {
      throw new Error("Forbidden");
    }
    if (permission.role !== "none") {
      this.touchTeamMembershipOpen(teamId, userId);
    }
    const { memberships, availableTeams } = this.getTeamsForUser(userId);
    const effectiveRole: TeamUserRole =
      permission.role !== "none" ? permission.role : team.demo && currentUser.isSuperAdmin && this.config.demoModeEnabled ? "team_admin" : "none";

    return {
      team,
      memberships,
      availableTeams,
      currentUser,
      currentUserRole: effectiveRole
    };
  }

  getTeamState(teamId: string, userId: string, options?: { includeHistory?: boolean }): TeamStateResponse {
    return perfTracker.measure("repository.getTeamState", () => {
      const context = this.getTeamStateContext(teamId, userId);
      const activeRound = this.getCurrentRound(teamId);
      return {
        team: context.team,
        memberships: context.memberships,
        availableTeams: context.availableTeams,
        teamMembers: this.getTeamMembers(teamId),
        activeParticipants: [],
        activeRound: activeRound ? this.personalizeRound(activeRound, userId) : null,
        pendingIssues: this.getPendingIssues(teamId),
        history: options?.includeHistory === false ? [] : this.getHistory(teamId),
        currentUser: context.currentUser,
        currentUserRole: context.currentUserRole,
        liveSync: {
          teamId,
          roundId: activeRound?.id ?? null,
          roundVersion: 0,
          voteVersion: activeRound?.votes.length ?? 0
        }
      };
    });
  }

  getExpiredTimedRounds(referenceTime = nowIso()): Array<{ id: string; teamId: string }> {
    const rows = this.db
      .prepare(
        `
        SELECT id, team_id
        FROM rounds
        WHERE status = 'active'
          AND timer_expires_at IS NOT NULL
          AND timer_expires_at <= ?
      `
      )
      .all(referenceTime) as Array<{ id: string; team_id: string }>;

    return rows.map((row) => ({
      id: row.id,
      teamId: row.team_id
    }));
  }

  private inflateRound(row: RoundRow): RoundState {
    const fibonacciRange = normalizeStoredFibonacciRange(row.fibonacci_range_start, row.fibonacci_range_end);
    return {
      id: row.id,
      teamId: row.team_id,
      title: row.title,
      deckKey: row.deck_key,
      fibonacciRangeStart: fibonacciRange.fibonacciRangeStart,
      fibonacciRangeEnd: fibonacciRange.fibonacciRangeEnd,
      status: row.status === "archived" ? "active" : row.status,
      createdAt: row.created_at,
      timerStartedAt: row.timer_started_at,
      timerExpiresAt: row.timer_expires_at,
      revealedAt: row.revealed_at,
      revealAverage: normalizeAverageValue(row.reveal_average),
      quorumBlocked: row.reveal_quorum_blocked === 1,
      votedCount: row.reveal_voted_count,
      notVotedCount: row.reveal_not_voted_count,
      revoteHistoryEntryId: row.revote_history_entry_id,
      pendingIssueId: row.pending_issue_id,
      votes: this.getVoteSnapshot(row.id, row.status === "revealed")
    };
  }

  getTeamMembers(teamId: string): TeamMemberSummary[] {
    const rows = this.db
      .prepare(
        `
        SELECT
          u.id,
          u.email,
          u.display_name,
          u.avatar_key,
          u.avatar_icon_key,
          u.avatar_color_key,
          tm.role,
          tm.created_at,
          tm.last_opened_at
        FROM team_memberships tm
        JOIN users u ON u.id = tm.user_id
        WHERE tm.team_id = ?
          AND u.is_super_admin = 0
        ORDER BY CASE tm.role WHEN 'team_admin' THEN 0 ELSE 1 END ASC, u.display_name COLLATE NOCASE ASC
      `
      )
      .all(teamId) as Array<{
      id: string;
      email: string;
      display_name: string;
      avatar_key: string;
      avatar_icon_key: string | null;
      avatar_color_key: string | null;
      role: TeamUserRole;
      created_at: string;
      last_opened_at: string | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      role: row.role,
      joinedAt: row.created_at,
      lastOpenedAt: row.last_opened_at,
      ...resolveAvatarSelection({
        avatarIconKey: row.avatar_icon_key,
        avatarColorKey: row.avatar_color_key,
        avatarKey: row.avatar_key
      })
    }));
  }

  private getVoteSnapshot(roundId: string, revealValues: boolean): VoteRecord[] {
    const votes = this.db
      .prepare(
        `
        SELECT v.user_id, v.value, u.display_name, u.avatar_key, u.avatar_icon_key, u.avatar_color_key
        FROM votes v
        JOIN users u ON u.id = v.user_id
        WHERE v.round_id = ?
        ORDER BY u.display_name COLLATE NOCASE ASC
      `
      )
      .all(roundId) as Array<{
      user_id: string;
      value: string;
      display_name: string;
      avatar_key: string;
      avatar_icon_key: string | null;
      avatar_color_key: string | null;
    }>;

    return votes.map((vote) => ({
      userId: vote.user_id,
      displayName: vote.display_name,
      ...resolveAvatarSelection({
        avatarIconKey: vote.avatar_icon_key,
        avatarColorKey: vote.avatar_color_key,
        avatarKey: vote.avatar_key
      }),
      value: revealValues ? vote.value : "hidden"
    }));
  }

  private personalizeRound(round: RoundState, currentUserId: string): RoundState {
    if (round.status === "revealed") {
      return round;
    }

    return {
      ...round,
      votes: round.votes.map((vote) => ({
        ...vote,
        value: vote.userId === currentUserId ? this.getUserVoteValue(round.id, currentUserId) ?? vote.value : vote.value
      }))
    };
  }

  private getUserVoteValue(roundId: string, userId: string): string | null {
    const row = this.db
      .prepare("SELECT value FROM votes WHERE round_id = ? AND user_id = ?")
      .get(roundId, userId) as { value: string } | undefined;

    return row?.value ?? null;
  }

  private getJoinRequestRecord(teamId: string, requestId: string): { id: string; userId: string } {
    const row = this.db
      .prepare("SELECT id, user_id FROM team_join_requests WHERE id = ? AND team_id = ?")
      .get(requestId, teamId) as { id: string; user_id: string } | undefined;

    if (!row) {
      throw new Error("Join request not found");
    }

    return {
      id: row.id,
      userId: row.user_id
    };
  }

  private getPlatformAccessRequestRecord(requestId: string): { id: string; email: string } {
    const row = this.db
      .prepare("SELECT id, email FROM platform_access_requests WHERE id = ?")
      .get(requestId) as { id: string; email: string } | undefined;

    if (!row) {
      throw new Error("Access request not found");
    }

    return {
      id: row.id,
      email: row.email
    };
  }

  private getWorkspace(workspaceId: string): WorkspaceSummary | null {
    const row = this.db
      .prepare("SELECT id, name, kind, created_at, updated_at, last_activity_at FROM workspaces WHERE id = ?")
      .get(workspaceId) as
      | {
          id: string;
          name: string;
          kind: WorkspaceSummary["kind"];
          created_at: string;
          updated_at: string;
          last_activity_at: string;
        }
      | undefined;

    return row
      ? {
          id: row.id,
          name: row.name,
          kind: row.kind,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          lastActivityAt: row.last_activity_at
        }
      : null;
  }

  private getWorkspaceIdForTeam(teamId: string): string | null {
    const row = this.db.prepare("SELECT workspace_id FROM teams WHERE id = ?").get(teamId) as { workspace_id: string | null } | undefined;
    return row?.workspace_id ?? null;
  }

  private getWorkspaceKind(workspaceId: string): WorkspaceSummary["kind"] | null {
    const row = this.db.prepare("SELECT kind FROM workspaces WHERE id = ?").get(workspaceId) as { kind: WorkspaceSummary["kind"] } | undefined;
    return row?.kind ?? null;
  }

  private countWorkspaceTeams(workspaceId: string): number {
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM teams WHERE workspace_id = ?").get(workspaceId) as { count: number };
    return row.count;
  }

  private countWorkspaceMembers(workspaceId: string): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS count FROM workspace_memberships WHERE workspace_id = ?")
      .get(workspaceId) as { count: number };
    return row.count;
  }

  private countWorkspaceMonthlyReveals(workspaceId: string, referenceTime: string): number {
    const reference = new Date(referenceTime);
    const monthStart = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1)).toISOString();
    const nextMonthStart = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() + 1, 1)).toISOString();
    const row = this.db
      .prepare(
        `
        SELECT COUNT(*) AS count
        FROM history_entries he
        JOIN teams t ON t.id = he.team_id
        WHERE t.workspace_id = ? AND he.completed_at >= ? AND he.completed_at < ?
      `
      )
      .get(workspaceId, monthStart, nextMonthStart) as { count: number };
    return row.count;
  }

  private getPrimaryWorkspaceIdForUser(userId: string): string | null {
    const row = this.db
      .prepare(
        `
        SELECT workspace_id
        FROM workspace_memberships
        WHERE user_id = ?
        ORDER BY
          CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END ASC,
          created_at ASC
        LIMIT 1
      `
      )
      .get(userId) as { workspace_id: string } | undefined;

    return row?.workspace_id ?? null;
  }

  private ensureWorkspaceMembership(workspaceId: string, userId: string, role: Exclude<WorkspaceUserRole, "none">, at = nowIso()): void {
    const existingMembership = this.db
      .prepare("SELECT role FROM workspace_memberships WHERE workspace_id = ? AND user_id = ?")
      .get(workspaceId, userId) as { role: WorkspaceUserRole } | undefined;
    if (!existingMembership && this.getWorkspaceKind(workspaceId) === "public_trial" && !this.isSuperAdmin(userId)) {
      if (this.userHasPublicTrialWorkspace(userId)) {
        throw new Error("Free public trial users can belong to only one public trial workspace.");
      }
      if (this.countWorkspaceMembers(workspaceId) >= this.config.publicTrial.maxUsersPerWorkspace) {
        throw new Error(`Public trial workspaces can have at most ${this.config.publicTrial.maxUsersPerWorkspace} users.`);
      }
    }
    this.db
      .prepare(
        `
        INSERT INTO workspace_memberships(workspace_id, user_id, role, created_at, last_active_at)
        VALUES(?, ?, ?, ?, ?)
        ON CONFLICT(workspace_id, user_id) DO UPDATE SET
          role = CASE
            WHEN workspace_memberships.role = 'owner' OR excluded.role = 'owner' THEN 'owner'
            WHEN workspace_memberships.role = 'admin' OR excluded.role = 'admin' THEN 'admin'
            ELSE 'member'
          END,
          last_active_at = excluded.last_active_at
      `
      )
      .run(workspaceId, userId, role, at, at);
  }

  private deletePlatformAccessRequestByEmail(email: string): void {
    this.db.prepare("DELETE FROM platform_access_requests WHERE email = ?").run(email.trim().toLowerCase());
  }

  private getPendingJoinRequestsForViewer(userId: string): PendingJoinRequestSummary[] {
    if (this.isSuperAdmin(userId)) {
      return this.queryPendingJoinRequests("", []);
    }

    return this.queryPendingJoinRequests(
      "JOIN team_memberships tm_admin ON tm_admin.team_id = tjr.team_id AND tm_admin.user_id = ? AND tm_admin.role = 'team_admin'",
      [userId]
    );
  }

  private getTeamPermissionContext(userId: string, teamId: string): TeamPermissionContext {
    return {
      isSuperAdmin: this.isSuperAdmin(userId),
      role: this.getTeamUserRole(userId, teamId)
    };
  }

  private getUserTeamHistoryTimezonePreference(
    userId: string,
    teamId: string
  ): { historyTimezonePopupEnabled: boolean; historyTimezoneKeys: HistoryTimeZoneKey[] | null } | null {
    const row = this.db
      .prepare(
        "SELECT history_timezone_popup_enabled, history_timezone_keys_json FROM user_team_preferences WHERE user_id = ? AND team_id = ?"
      )
      .get(userId, teamId) as { history_timezone_popup_enabled: number; history_timezone_keys_json: string | null } | undefined;
    if (!row) {
      return null;
    }
    return {
      historyTimezonePopupEnabled: row.history_timezone_popup_enabled !== 0,
      historyTimezoneKeys: row.history_timezone_keys_json ? parseHistoryTimeZoneKeys(row.history_timezone_keys_json) : null
    };
  }

  private touchTeamActivity(teamId: string, at = nowIso()): void {
    this.db.prepare("UPDATE teams SET last_activity_at = ? WHERE id = ?").run(at, teamId);
  }

  private touchTeamMembershipOpen(teamId: string, userId: string, at = nowIso()): void {
    this.db.prepare("UPDATE team_memberships SET last_opened_at = ? WHERE team_id = ? AND user_id = ?").run(at, teamId, userId);
  }

  private requireActiveTeam(teamId: string): TeamSummary {
    const team = this.getTeam(teamId);
    if (!team) {
      throw new Error("Team not found");
    }
    if (team.archived) {
      throw new Error("Archived teams are read-only until a team admin or the super-admin unarchives them.");
    }
    return team;
  }

  private assertCanManageTeam(userId: string, teamId: string): void {
    const permission = this.getTeamPermissionContext(userId, teamId);
    if (!permission.isSuperAdmin && permission.role !== "team_admin") {
      throw new Error("Only team admins can manage membership for this team.");
    }
  }

  private assertSuperAdmin(userId: string): void {
    if (!this.isSuperAdmin(userId)) {
      throw new Error("Only the super-admin can perform this action.");
    }
  }

  private createInvitedUser(email: string): { user: UserSummary; temporaryPassword: string; invitedNewUser: true } {
    const createdAt = nowIso();
    const id = nanoid();
    const password = createRandomPassword();
    const avatarSelection = pickRandomAvatarSelection();
    const displayName = deriveDisplayNameFromEmail(email);

    this.db
      .prepare(
        `
        INSERT INTO users(
          id,
          email,
          login_name,
          is_super_admin,
          display_name,
          avatar_key,
          avatar_icon_key,
          avatar_color_key,
          password_hash,
          created_at,
          updated_at,
          last_active_at
        )
        VALUES(?, ?, NULL, 0, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        id,
        email,
        displayName,
        buildAvatarAssetKey(avatarSelection.avatarIconKey, avatarSelection.avatarColorKey),
        avatarSelection.avatarIconKey,
        avatarSelection.avatarColorKey,
        hashPassword(password),
        createdAt,
        createdAt,
        createdAt
      );

    return {
      user: this.getUser(id)!,
      temporaryPassword: password,
      invitedNewUser: true
    };
  }

  private createNotification(
    userId: string,
    input: {
      kind: NotificationKind;
      title: string;
      message: string;
      teamId: string | null;
      actorUserId: string | null;
    }
  ): void {
    createNotification(this.db, {
      id: nanoid(),
      userId,
      kind: input.kind,
      title: input.title,
      message: input.message,
      teamId: input.teamId,
      actorUserId: input.actorUserId,
      createdAt: nowIso()
    });
    this.trimNotifications(userId);
  }

  private createActionHistory(
    input: {
      scope: ActionHistoryScope;
      kind: string;
      title: string;
      message: string;
      teamId: string | null;
      actorUserId: string | null;
      createdAt?: string;
    }
  ): void {
    createActionHistory(this.db, {
      id: nanoid(),
      scope: input.scope,
      kind: input.kind,
      title: input.title,
      message: input.message,
      teamId: input.teamId,
      actorUserId: input.actorUserId,
      createdAt: input.createdAt ?? nowIso()
    });
  }

  private trimNotifications(userId: string): void {
    trimNotifications(this.db, userId);
  }

  private touchUser(userId: string): void {
    this.db.prepare("UPDATE users SET last_active_at = ? WHERE id = ?").run(nowIso(), userId);
  }

  private ensureUserUpdatedAtColumn(): void {
    const columns = this.db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
    const hasUpdatedAt = columns.some((column) => column.name === "updated_at");

    if (!hasUpdatedAt) {
      this.db.exec("ALTER TABLE users ADD COLUMN updated_at TEXT");
      this.db.exec("UPDATE users SET updated_at = created_at WHERE updated_at IS NULL");
    }
  }

  private ensureUserAvatarColumns(): void {
    const columns = this.db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
    const columnNames = new Set(columns.map((column) => column.name));

    if (!columnNames.has("avatar_icon_key")) {
      this.db.exec("ALTER TABLE users ADD COLUMN avatar_icon_key TEXT");
    }

    if (!columnNames.has("avatar_color_key")) {
      this.db.exec("ALTER TABLE users ADD COLUMN avatar_color_key TEXT");
    }

    const rows = this.db
      .prepare("SELECT id, avatar_key, avatar_icon_key, avatar_color_key FROM users")
      .all() as Array<{ id: string; avatar_key: string; avatar_icon_key: string | null; avatar_color_key: string | null }>;

    for (const row of rows) {
      const avatarSelection = resolveAvatarSelection({
        avatarIconKey: row.avatar_icon_key,
        avatarColorKey: row.avatar_color_key,
        avatarKey: row.avatar_key
      });

      this.db
        .prepare("UPDATE users SET avatar_key = ?, avatar_icon_key = ?, avatar_color_key = ? WHERE id = ?")
        .run(
          buildAvatarAssetKey(avatarSelection.avatarIconKey, avatarSelection.avatarColorKey),
          avatarSelection.avatarIconKey,
          avatarSelection.avatarColorKey,
          row.id
        );
    }
  }

  private ensureUserPasswordColumn(): void {
    const columns = this.db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
    const hasPasswordHash = columns.some((column) => column.name === "password_hash");

    if (!hasPasswordHash) {
      this.db.exec("ALTER TABLE users ADD COLUMN password_hash TEXT");
    }
  }

  private ensureUserTermsColumns(): void {
    const columns = this.db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
    const columnNames = new Set(columns.map((column) => column.name));

    if (!columnNames.has("terms_version")) {
      this.db.exec("ALTER TABLE users ADD COLUMN terms_version TEXT");
    }

    if (!columnNames.has("terms_accepted_at")) {
      this.db.exec("ALTER TABLE users ADD COLUMN terms_accepted_at TEXT");
    }
  }

  private ensureUserAdminColumns(): void {
    const columns = this.db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
    const columnNames = new Set(columns.map((column) => column.name));

    if (!columnNames.has("login_name")) {
      this.db.exec("ALTER TABLE users ADD COLUMN login_name TEXT");
      this.db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_login_name ON users(login_name)");
    }

    if (!columnNames.has("is_super_admin")) {
      this.db.exec("ALTER TABLE users ADD COLUMN is_super_admin INTEGER NOT NULL DEFAULT 0");
    }
  }

  private ensureUserShortcutPreferenceColumn(): void {
    const columns = this.db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
    const columnNames = new Set(columns.map((column) => column.name));
    if (!columnNames.has("board_shortcuts_enabled")) {
      this.db.exec("ALTER TABLE users ADD COLUMN board_shortcuts_enabled INTEGER NOT NULL DEFAULT 1");
    }
    if (!columnNames.has("history_timezone_popup_enabled")) {
      this.db.exec("ALTER TABLE users ADD COLUMN history_timezone_popup_enabled INTEGER NOT NULL DEFAULT 1");
    }
    if (!columnNames.has("history_timezone_keys_json")) {
      this.db.exec("ALTER TABLE users ADD COLUMN history_timezone_keys_json TEXT");
    }
  }

  private ensureTeamTimerColumn(): void {
    const columns = this.db.prepare("PRAGMA table_info(teams)").all() as Array<{ name: string }>;
    const hasTimerSeconds = columns.some((column) => column.name === "timer_seconds");

    if (!hasTimerSeconds) {
      this.db.exec("ALTER TABLE teams ADD COLUMN timer_seconds INTEGER");
    }
  }

  private ensureTeamHistoryTimezoneColumns(): void {
    const columns = this.db.prepare("PRAGMA table_info(teams)").all() as Array<{ name: string }>;
    const columnNames = new Set(columns.map((column) => column.name));

    if (!columnNames.has("history_timezone_popup_enabled")) {
      this.db.exec("ALTER TABLE teams ADD COLUMN history_timezone_popup_enabled INTEGER NOT NULL DEFAULT 1");
    }

    if (!columnNames.has("history_timezone_keys_json")) {
      this.db.exec(
        `ALTER TABLE teams ADD COLUMN history_timezone_keys_json TEXT NOT NULL DEFAULT '${stringifyHistoryTimeZoneKeys(DEFAULT_HISTORY_TIME_ZONE_KEYS)}'`
      );
    }
  }

  private ensureTeamFibonacciRangeColumns(): void {
    const columns = this.db.prepare("PRAGMA table_info(teams)").all() as Array<{ name: string }>;
    const columnNames = new Set(columns.map((column) => column.name));

    if (!columnNames.has("fibonacci_range_start")) {
      this.db.exec("ALTER TABLE teams ADD COLUMN fibonacci_range_start TEXT");
    }

    if (!columnNames.has("fibonacci_range_end")) {
      this.db.exec("ALTER TABLE teams ADD COLUMN fibonacci_range_end TEXT");
    }
  }

  private ensureTeamQuorumColumns(): void {
    const columns = this.db.prepare("PRAGMA table_info(teams)").all() as Array<{ name: string }>;
    const columnNames = new Set(columns.map((column) => column.name));

    if (!columnNames.has("minimum_vote_percent_enabled")) {
      this.db.exec("ALTER TABLE teams ADD COLUMN minimum_vote_percent_enabled INTEGER NOT NULL DEFAULT 0");
    }

    if (!columnNames.has("minimum_vote_percent")) {
      this.db.exec("ALTER TABLE teams ADD COLUMN minimum_vote_percent INTEGER NOT NULL DEFAULT 75");
    }

    this.db.exec("UPDATE teams SET minimum_vote_percent = 75 WHERE minimum_vote_percent IS NULL");
  }

  private ensureTeamAdminColumns(): void {
    const columns = this.db.prepare("PRAGMA table_info(teams)").all() as Array<{ name: string }>;
    const columnNames = new Set(columns.map((column) => column.name));

    if (!columnNames.has("archived")) {
      this.db.exec("ALTER TABLE teams ADD COLUMN archived INTEGER NOT NULL DEFAULT 0");
    }

    if (!columnNames.has("archived_at")) {
      this.db.exec("ALTER TABLE teams ADD COLUMN archived_at TEXT");
    }

    if (!columnNames.has("last_activity_at")) {
      this.db.exec("ALTER TABLE teams ADD COLUMN last_activity_at TEXT");
    }
  }

  private ensureTeamDemoColumn(): void {
    const columns = this.db.prepare("PRAGMA table_info(teams)").all() as Array<{ name: string }>;
    const columnNames = new Set(columns.map((column) => column.name));

    if (!columnNames.has("demo")) {
      this.db.exec("ALTER TABLE teams ADD COLUMN demo INTEGER NOT NULL DEFAULT 0");
    }
  }

  private ensureTeamMembershipRoleColumn(): void {
    const columns = this.db.prepare("PRAGMA table_info(team_memberships)").all() as Array<{ name: string }>;
    const columnNames = new Set(columns.map((column) => column.name));

    if (!columnNames.has("role")) {
      this.db.exec("ALTER TABLE team_memberships ADD COLUMN role TEXT NOT NULL DEFAULT 'member'");
      this.db.exec("UPDATE team_memberships SET role = 'member' WHERE role IS NULL OR role = ''");
    }
  }

  private ensureTeamWorkspaceColumn(): void {
    const columns = this.db.prepare("PRAGMA table_info(teams)").all() as Array<{ name: string }>;
    const columnNames = new Set(columns.map((column) => column.name));

    if (!columnNames.has("workspace_id")) {
      this.db.exec("ALTER TABLE teams ADD COLUMN workspace_id TEXT");
    }
  }

  private ensureDefaultWorkspaceBackfill(): void {
    const currentTime = nowIso();
    this.db
      .prepare(
        `
        INSERT INTO workspaces(id, name, kind, created_by, created_at, updated_at, last_activity_at)
        VALUES(?, ?, 'default', NULL, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          updated_at = workspaces.updated_at,
          last_activity_at = COALESCE(workspaces.last_activity_at, excluded.last_activity_at)
      `
      )
      .run(DEFAULT_WORKSPACE_ID, DEFAULT_WORKSPACE_NAME, currentTime, currentTime, currentTime);

    this.db.prepare("UPDATE teams SET workspace_id = ? WHERE workspace_id IS NULL OR workspace_id = ''").run(DEFAULT_WORKSPACE_ID);

    const users = this.db.prepare("SELECT id, is_super_admin FROM users").all() as Array<{ id: string; is_super_admin: number }>;
    for (const user of users) {
      this.ensureWorkspaceMembership(DEFAULT_WORKSPACE_ID, user.id, user.is_super_admin === 1 ? "owner" : "member", currentTime);
    }

    const teamMemberships = this.db
      .prepare(
        `
        SELECT DISTINCT
          COALESCE(t.workspace_id, ?) AS workspace_id,
          tm.user_id,
          tm.role
        FROM team_memberships tm
        JOIN teams t ON t.id = tm.team_id
      `
      )
      .all(DEFAULT_WORKSPACE_ID) as Array<{ workspace_id: string; user_id: string; role: TeamUserRole }>;

    for (const membership of teamMemberships) {
      this.ensureWorkspaceMembership(
        membership.workspace_id,
        membership.user_id,
        membership.role === "team_admin" ? "admin" : "member",
        currentTime
      );
    }
  }

  private ensureRoundTimerColumns(): void {
    const columns = this.db.prepare("PRAGMA table_info(rounds)").all() as Array<{ name: string }>;
    const columnNames = new Set(columns.map((column) => column.name));

    if (!columnNames.has("timer_started_at")) {
      this.db.exec("ALTER TABLE rounds ADD COLUMN timer_started_at TEXT");
    }

    if (!columnNames.has("timer_expires_at")) {
      this.db.exec("ALTER TABLE rounds ADD COLUMN timer_expires_at TEXT");
    }
  }

  private ensureRoundFibonacciRangeColumns(): void {
    const columns = this.db.prepare("PRAGMA table_info(rounds)").all() as Array<{ name: string }>;
    const columnNames = new Set(columns.map((column) => column.name));

    if (!columnNames.has("fibonacci_range_start")) {
      this.db.exec("ALTER TABLE rounds ADD COLUMN fibonacci_range_start TEXT");
    }

    if (!columnNames.has("fibonacci_range_end")) {
      this.db.exec("ALTER TABLE rounds ADD COLUMN fibonacci_range_end TEXT");
    }
  }

  private ensureRoundRevealMetadataColumns(): void {
    const columns = this.db.prepare("PRAGMA table_info(rounds)").all() as Array<{ name: string }>;
    const columnNames = new Set(columns.map((column) => column.name));

    if (!columnNames.has("reveal_quorum_blocked")) {
      this.db.exec("ALTER TABLE rounds ADD COLUMN reveal_quorum_blocked INTEGER NOT NULL DEFAULT 0");
    }

    if (!columnNames.has("reveal_voted_count")) {
      this.db.exec("ALTER TABLE rounds ADD COLUMN reveal_voted_count INTEGER NOT NULL DEFAULT 0");
    }

    if (!columnNames.has("reveal_not_voted_count")) {
      this.db.exec("ALTER TABLE rounds ADD COLUMN reveal_not_voted_count INTEGER NOT NULL DEFAULT 0");
    }
  }

  private ensureHistoryEntryFibonacciRangeColumns(): void {
    const columns = this.db.prepare("PRAGMA table_info(history_entries)").all() as Array<{ name: string }>;
    const columnNames = new Set(columns.map((column) => column.name));

    if (!columnNames.has("fibonacci_range_start")) {
      this.db.exec("ALTER TABLE history_entries ADD COLUMN fibonacci_range_start TEXT");
    }

    if (!columnNames.has("fibonacci_range_end")) {
      this.db.exec("ALTER TABLE history_entries ADD COLUMN fibonacci_range_end TEXT");
    }
  }

  private ensureHistoryEntryRevealMetadataColumns(): void {
    const columns = this.db.prepare("PRAGMA table_info(history_entries)").all() as Array<{ name: string }>;
    const columnNames = new Set(columns.map((column) => column.name));

    if (!columnNames.has("quorum_blocked")) {
      this.db.exec("ALTER TABLE history_entries ADD COLUMN quorum_blocked INTEGER NOT NULL DEFAULT 0");
    }

    if (!columnNames.has("voted_count")) {
      this.db.exec("ALTER TABLE history_entries ADD COLUMN voted_count INTEGER NOT NULL DEFAULT 0");
    }

    if (!columnNames.has("not_voted_count")) {
      this.db.exec("ALTER TABLE history_entries ADD COLUMN not_voted_count INTEGER NOT NULL DEFAULT 0");
    }

    this.db.exec("UPDATE history_entries SET voted_count = participant_count WHERE voted_count IS NULL OR voted_count = 0");
    this.db.exec("UPDATE history_entries SET not_voted_count = COALESCE(not_voted_count, 0)");
  }

  private ensureHistoryImportColumns(): void {
    const columns = this.db.prepare("PRAGMA table_info(history_entries)").all() as Array<{ name: string }>;
    const columnNames = new Set(columns.map((column) => column.name));

    if (!columnNames.has("import_batch_id")) {
      this.db.exec("ALTER TABLE history_entries ADD COLUMN import_batch_id TEXT");
    }

    if (!columnNames.has("import_entry_id")) {
      this.db.exec("ALTER TABLE history_entries ADD COLUMN import_entry_id TEXT");
    }

    this.db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_history_import_batch_entry ON history_entries(team_id, import_batch_id, import_entry_id)
      WHERE import_batch_id IS NOT NULL AND import_entry_id IS NOT NULL
    `);
  }

  private ensureHistoryCommentMetadataColumns(): void {
    const columns = this.db.prepare("PRAGMA table_info(history_comments)").all() as Array<{ name: string }>;
    const columnNames = new Set(columns.map((column) => column.name));

    if (!columnNames.has("author_signature")) {
      this.db.exec("ALTER TABLE history_comments ADD COLUMN author_signature TEXT NOT NULL DEFAULT ''");
    }

    if (!columnNames.has("imported_immutable")) {
      this.db.exec("ALTER TABLE history_comments ADD COLUMN imported_immutable INTEGER NOT NULL DEFAULT 0");
    }

    this.db.exec(`
      UPDATE history_comments
      SET author_signature = (
        SELECT users.display_name || ' (' || users.email || ')'
        FROM users
        WHERE users.id = history_comments.user_id
      )
      WHERE author_signature = ''
    `);
  }

  private ensureTeamActivityBackfill(): void {
    this.db.exec("UPDATE teams SET last_activity_at = COALESCE(last_activity_at, created_at)");
    this.db.exec("UPDATE team_memberships SET role = COALESCE(NULLIF(role, ''), 'member')");
  }

  private ensureSuperAdminAccount(): void {
    const loginName = this.config.superAdminUsername.trim();
    const displayName = this.config.superAdminDisplayName.trim();
    const pseudoEmail = `${loginName}@admin.local`;
    const existing = this.db
      .prepare("SELECT id, password_hash FROM users WHERE login_name = ? OR is_super_admin = 1")
      .get(loginName) as { id: string; password_hash: string | null } | undefined;
    const avatarSelection = pickRandomAvatarSelection();
    const currentTime = nowIso();

    if (existing) {
      this.db
        .prepare(
          `
          UPDATE users
          SET email = ?,
              login_name = ?,
              is_super_admin = 1,
              display_name = ?,
              avatar_key = ?,
              avatar_icon_key = ?,
              avatar_color_key = ?,
              password_hash = ?,
              updated_at = ?,
              last_active_at = ?
          WHERE id = ?
        `
        )
        .run(
          pseudoEmail,
          loginName,
          displayName,
          buildAvatarAssetKey(avatarSelection.avatarIconKey, avatarSelection.avatarColorKey),
          avatarSelection.avatarIconKey,
          avatarSelection.avatarColorKey,
          hashPassword(this.config.superAdminPassword),
          currentTime,
          currentTime,
          existing.id
        );
      return;
    }

    const id = nanoid();
    this.db
      .prepare(
        `
        INSERT INTO users(
          id,
          email,
          login_name,
          is_super_admin,
          display_name,
          avatar_key,
          avatar_icon_key,
          avatar_color_key,
          password_hash,
          created_at,
          updated_at,
          last_active_at
        )
        VALUES(?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        id,
        pseudoEmail,
        loginName,
        displayName,
        buildAvatarAssetKey(avatarSelection.avatarIconKey, avatarSelection.avatarColorKey),
        avatarSelection.avatarIconKey,
        avatarSelection.avatarColorKey,
        hashPassword(this.config.superAdminPassword),
        currentTime,
        currentTime,
        currentTime
      );
  }

  private ensureSuperAdminMemberships(superAdminId?: string): void {
    const userId =
      superAdminId ??
      ((this.db.prepare("SELECT id FROM users WHERE is_super_admin = 1 LIMIT 1").get() as { id: string } | undefined)?.id ?? null);
    if (!userId) {
      return;
    }

    const teamIds = this.db.prepare("SELECT id FROM teams").all() as Array<{ id: string }>;
    const currentTime = nowIso();
    const joinStatement = this.db.prepare(
      `
      INSERT INTO team_memberships(team_id, user_id, role, created_at, last_opened_at)
      VALUES(?, ?, 'team_admin', ?, ?)
      ON CONFLICT(team_id, user_id) DO UPDATE SET role = 'team_admin'
    `
    );

    for (const team of teamIds) {
      joinStatement.run(team.id, userId, currentTime, currentTime);
    }
  }

  getSuperAdminUser(): CurrentUserSummary | null {
    const row = this.db.prepare("SELECT id FROM users WHERE is_super_admin = 1 LIMIT 1").get() as { id: string } | undefined;
    return row ? this.getCurrentUser(row.id) : null;
  }

  private isTeamVisibleToUser(teamIsDemo: boolean, viewerIsSuperAdmin: boolean): boolean {
    if (!teamIsDemo) {
      return true;
    }
    return viewerIsSuperAdmin && this.config.demoModeEnabled;
  }

  private isTeamVisibleByRuntime(teamName: string): boolean {
    if (!teamName.startsWith("Sim Team ")) {
      return true;
    }
    return this.isSimulatorOnline();
  }
}

function parseTimerSeconds(value: number | null | undefined): TeamTimerSeconds | null {
  if (value == null) {
    return null;
  }
  return TEAM_TIMER_OPTIONS.includes(value as TeamTimerSeconds) ? (value as TeamTimerSeconds) : null;
}
