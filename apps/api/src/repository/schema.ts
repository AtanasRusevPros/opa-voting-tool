// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { DatabaseSync } from "node:sqlite";

export function runBaseSchema(db: DatabaseSync): void {
  db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        login_name TEXT UNIQUE,
        is_super_admin INTEGER NOT NULL DEFAULT 0,
        display_name TEXT NOT NULL,
        avatar_key TEXT NOT NULL,
        avatar_icon_key TEXT,
        avatar_color_key TEXT,
        password_hash TEXT,
        terms_version TEXT,
        terms_accepted_at TEXT,
        history_timezone_popup_enabled INTEGER NOT NULL DEFAULT 1,
        history_timezone_keys_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_active_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS login_codes (
        email TEXT PRIMARY KEY,
        code TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        last_active_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'default',
        created_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_activity_at TEXT NOT NULL,
        FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS teams (
        id TEXT PRIMARY KEY,
        workspace_id TEXT,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        demo INTEGER NOT NULL DEFAULT 0,
        deck_key TEXT NOT NULL,
        fibonacci_range_start TEXT,
        fibonacci_range_end TEXT,
        timer_seconds INTEGER,
        icon_key TEXT NOT NULL,
        logo_opacity REAL NOT NULL DEFAULT 0.18,
        background_opacity REAL NOT NULL DEFAULT 0.12,
        history_timezone_popup_enabled INTEGER NOT NULL DEFAULT 1,
        history_timezone_keys_json TEXT NOT NULL DEFAULT '["gmt","usa-davidson","india-pune","bulgaria-sofia"]',
        minimum_vote_percent_enabled INTEGER NOT NULL DEFAULT 0,
        minimum_vote_percent INTEGER NOT NULL DEFAULT 75,
        jira_project_key TEXT,
        jira_jql TEXT,
        archived INTEGER NOT NULL DEFAULT 0,
        archived_at TEXT,
        last_activity_at TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(workspace_id) REFERENCES workspaces(id),
        FOREIGN KEY(created_by) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS workspace_memberships (
        workspace_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member',
        created_at TEXT NOT NULL,
        last_active_at TEXT NOT NULL,
        PRIMARY KEY(workspace_id, user_id),
        FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS team_memberships (
        team_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member',
        created_at TEXT NOT NULL,
        last_opened_at TEXT NOT NULL,
        PRIMARY KEY(team_id, user_id),
        FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS user_team_preferences (
        user_id TEXT NOT NULL,
        team_id TEXT NOT NULL,
        history_timezone_popup_enabled INTEGER NOT NULL DEFAULT 1,
        history_timezone_keys_json TEXT,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(user_id, team_id),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS team_join_requests (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(team_id, user_id),
        FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS platform_access_requests (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        team_id TEXT,
        actor_user_id TEXT,
        created_at TEXT NOT NULL,
        seen_at TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
        FOREIGN KEY(actor_user_id) REFERENCES users(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS action_history (
        id TEXT PRIMARY KEY,
        scope TEXT NOT NULL,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        team_id TEXT,
        actor_user_id TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
        FOREIGN KEY(actor_user_id) REFERENCES users(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS rounds (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL,
        title TEXT NOT NULL,
        deck_key TEXT NOT NULL,
        fibonacci_range_start TEXT,
        fibonacci_range_end TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        timer_started_at TEXT,
        timer_expires_at TEXT,
        revealed_at TEXT,
        reveal_average REAL,
        reveal_quorum_blocked INTEGER NOT NULL DEFAULT 0,
        reveal_voted_count INTEGER NOT NULL DEFAULT 0,
        reveal_not_voted_count INTEGER NOT NULL DEFAULT 0,
        revote_history_entry_id TEXT,
        pending_issue_id TEXT,
        FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS team_pending_issues (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL,
        source TEXT NOT NULL,
        external_issue_id TEXT NOT NULL,
        issue_key TEXT NOT NULL,
        title TEXT NOT NULL,
        imported_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS votes (
        round_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(round_id, user_id),
        FOREIGN KEY(round_id) REFERENCES rounds(id) ON DELETE CASCADE,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS history_entries (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL,
        title TEXT NOT NULL,
        deck_key TEXT NOT NULL,
        fibonacci_range_start TEXT,
        fibonacci_range_end TEXT,
        average_score REAL,
        participant_count INTEGER NOT NULL,
        quorum_blocked INTEGER NOT NULL DEFAULT 0,
        voted_count INTEGER NOT NULL DEFAULT 0,
        not_voted_count INTEGER NOT NULL DEFAULT 0,
        completed_at TEXT NOT NULL,
        votes_json TEXT NOT NULL,
        import_batch_id TEXT,
        import_entry_id TEXT,
        FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS history_comments (
        id TEXT PRIMARY KEY,
        history_entry_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        author_signature TEXT NOT NULL DEFAULT '',
        imported_immutable INTEGER NOT NULL DEFAULT 0,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(history_entry_id) REFERENCES history_entries(id) ON DELETE CASCADE,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_team_memberships_user ON team_memberships(user_id);
      CREATE INDEX IF NOT EXISTS idx_team_memberships_user_role_team ON team_memberships(user_id, role, team_id);
      CREATE INDEX IF NOT EXISTS idx_workspaces_kind ON workspaces(kind);
      CREATE INDEX IF NOT EXISTS idx_workspace_memberships_user ON workspace_memberships(user_id);
      CREATE INDEX IF NOT EXISTS idx_teams_workspace ON teams(workspace_id);
      CREATE INDEX IF NOT EXISTS idx_user_team_preferences_team ON user_team_preferences(team_id);
      CREATE INDEX IF NOT EXISTS idx_team_join_requests_user ON team_join_requests(user_id);
      CREATE INDEX IF NOT EXISTS idx_team_join_requests_team ON team_join_requests(team_id);
      CREATE INDEX IF NOT EXISTS idx_team_join_requests_team_created ON team_join_requests(team_id, created_at ASC);
      CREATE INDEX IF NOT EXISTS idx_platform_access_requests_created ON platform_access_requests(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_notifications_user_seen_created ON notifications(user_id, seen_at, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_action_history_scope_created ON action_history(scope, created_at DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_action_history_team_created ON action_history(team_id, created_at DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_action_history_created ON action_history(created_at DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_rounds_team_status ON rounds(team_id, status);
      CREATE INDEX IF NOT EXISTS idx_rounds_pending_issue ON rounds(pending_issue_id);
      CREATE INDEX IF NOT EXISTS idx_history_team_completed ON history_entries(team_id, completed_at DESC);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_team_pending_issues_external ON team_pending_issues(team_id, source, external_issue_id);
      CREATE INDEX IF NOT EXISTS idx_team_pending_issues_team_position ON team_pending_issues(team_id, position ASC, updated_at DESC);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_history_import_batch_entry ON history_entries(team_id, import_batch_id, import_entry_id)
      WHERE import_batch_id IS NOT NULL AND import_entry_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_history_comments_entry_created ON history_comments(history_entry_id, created_at DESC);
    `);

  ensureColumn(db, "teams", "jira_project_key", "TEXT");
  ensureColumn(db, "teams", "jira_jql", "TEXT");
  ensureColumn(db, "teams", "workspace_id", "TEXT");
  ensureColumn(db, "teams", "minimum_vote_percent_enabled", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "teams", "minimum_vote_percent", "INTEGER NOT NULL DEFAULT 75");
  ensureColumn(db, "rounds", "pending_issue_id", "TEXT");
  ensureColumn(db, "rounds", "reveal_quorum_blocked", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "rounds", "reveal_voted_count", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "rounds", "reveal_not_voted_count", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "history_entries", "quorum_blocked", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "history_entries", "voted_count", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "history_entries", "not_voted_count", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "users", "board_shortcuts_enabled", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, "users", "history_timezone_popup_enabled", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, "users", "history_timezone_keys_json", "TEXT");
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_team_preferences (
      user_id TEXT NOT NULL,
      team_id TEXT NOT NULL,
      history_timezone_popup_enabled INTEGER NOT NULL DEFAULT 1,
      history_timezone_keys_json TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(user_id, team_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_user_team_preferences_team ON user_team_preferences(team_id);
  `);
}

function ensureColumn(db: DatabaseSync, tableName: string, columnName: string, columnDefinition: string) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  if (columns.some((column) => column.name === columnName)) {
    return;
  }
  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
}
