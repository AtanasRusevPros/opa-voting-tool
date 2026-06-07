// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

type WorkspaceReport = {
  id: string;
  name: string;
  kind: string;
  createdAt: string;
  lastActivityAt: string;
  userCount: number;
  teamCount: number;
  monthlyReveals: number;
  monthlyVotes: number;
};

type UsageReport = {
  generatedAt: string;
  databasePath: string;
  databaseBytes: number;
  publicTrial: {
    enabled: string | null;
    mode: string | null;
  };
  totals: {
    users: number;
    superAdmins: number;
    workspaces: number;
    publicTrialWorkspaces: number;
    teams: number;
    archivedTeams: number;
    historyEntries: number;
    currentSessions: number;
  };
  monthly: {
    periodStart: string;
    periodEnd: string;
    revealedRounds: number;
    votes: number;
  };
  workspaces: WorkspaceReport[];
};

function databasePath(): string {
  if (process.env.DATABASE_PATH) {
    return process.env.DATABASE_PATH;
  }
  const dataDir = process.env.DATA_DIR ?? path.join(process.cwd(), "apps/api/data");
  return path.join(dataDir, "planning-poker.db");
}

function monthWindow(now = new Date()): { start: string; end: string } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  return { start: start.toISOString(), end: end.toISOString() };
}

function count(db: DatabaseSync, sql: string, ...params: Array<string | number>): number {
  const row = db.prepare(sql).get(...params) as { count: number } | undefined;
  return row?.count ?? 0;
}

function parseVotesCount(votesJson: string): number {
  try {
    const parsed = JSON.parse(votesJson);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

function readPublicTrialConfig(): UsageReport["publicTrial"] {
  const configPath = process.env.DEPLOYMENT_CONFIG_PATH ?? path.join(process.cwd(), "config/deployment.toml");
  if (!fs.existsSync(configPath)) {
    return { enabled: null, mode: null };
  }
  const raw = fs.readFileSync(configPath, "utf8");
  const section = /\[public_trial\]([\s\S]*?)(?:\n\[|$)/.exec(raw)?.[1] ?? "";
  const enabled = /^enabled\s*=\s*(.+)$/m.exec(section)?.[1]?.trim() ?? null;
  const mode = /^mode\s*=\s*"?(.*?)"?$/m.exec(section)?.[1]?.trim() ?? null;
  return { enabled, mode };
}

export function buildReport(dbPath: string): UsageReport {
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Database not found: ${dbPath}`);
  }
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const period = monthWindow();
    const monthlyRows = db
      .prepare(
        `
        SELECT t.workspace_id, he.team_id, he.votes_json
        FROM history_entries he
        JOIN teams t ON t.id = he.team_id
        WHERE he.completed_at >= ? AND he.completed_at < ?
      `
      )
      .all(period.start, period.end) as Array<{ workspace_id: string | null; team_id: string; votes_json: string }>;

    const votesByWorkspace = new Map<string, number>();
    for (const row of monthlyRows) {
      if (!row.workspace_id) {
        continue;
      }
      votesByWorkspace.set(row.workspace_id, (votesByWorkspace.get(row.workspace_id) ?? 0) + parseVotesCount(row.votes_json));
    }

    const workspaceRows = db
      .prepare(
        `
        SELECT id, name, kind, created_at, last_activity_at
        FROM workspaces
        ORDER BY kind ASC, last_activity_at DESC, created_at DESC
      `
      )
      .all() as Array<{ id: string; name: string; kind: string; created_at: string; last_activity_at: string }>;

    const workspaces = workspaceRows.map((workspace) => ({
      id: workspace.id,
      name: workspace.name,
      kind: workspace.kind,
      createdAt: workspace.created_at,
      lastActivityAt: workspace.last_activity_at,
      userCount: count(
        db,
        `
        SELECT COUNT(*) AS count
        FROM workspace_memberships wm
        JOIN users u ON u.id = wm.user_id
        WHERE wm.workspace_id = ? AND u.is_super_admin = 0
      `,
        workspace.id
      ),
      teamCount: count(db, "SELECT COUNT(*) AS count FROM teams WHERE workspace_id = ?", workspace.id),
      monthlyReveals: count(
        db,
        `
        SELECT COUNT(*) AS count
        FROM history_entries he
        JOIN teams t ON t.id = he.team_id
        WHERE t.workspace_id = ? AND he.completed_at >= ? AND he.completed_at < ?
      `,
        workspace.id,
        period.start,
        period.end
      ),
      monthlyVotes: votesByWorkspace.get(workspace.id) ?? 0
    }));

    return {
      generatedAt: new Date().toISOString(),
      databasePath: dbPath,
      databaseBytes: fs.statSync(dbPath).size,
      publicTrial: readPublicTrialConfig(),
      totals: {
        users: count(db, "SELECT COUNT(*) AS count FROM users WHERE is_super_admin = 0"),
        superAdmins: count(db, "SELECT COUNT(*) AS count FROM users WHERE is_super_admin = 1"),
        workspaces: workspaces.length,
        publicTrialWorkspaces: workspaces.filter((workspace) => workspace.kind === "public_trial").length,
        teams: count(db, "SELECT COUNT(*) AS count FROM teams"),
        archivedTeams: count(db, "SELECT COUNT(*) AS count FROM teams WHERE archived = 1"),
        historyEntries: count(db, "SELECT COUNT(*) AS count FROM history_entries"),
        currentSessions: count(db, "SELECT COUNT(*) AS count FROM sessions WHERE expires_at > ?", new Date().toISOString())
      },
      monthly: {
        periodStart: period.start,
        periodEnd: period.end,
        revealedRounds: monthlyRows.length,
        votes: monthlyRows.reduce((sum, row) => sum + parseVotesCount(row.votes_json), 0)
      },
      workspaces
    };
  } finally {
    db.close();
  }
}

export function usersExport(dbPath: string): unknown[] {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    return (
      db
        .prepare(
          `
          SELECT
            u.id,
            u.email,
            u.display_name,
            u.created_at,
            u.updated_at,
            u.last_active_at,
            COUNT(DISTINCT wm.workspace_id) AS workspace_count,
            COUNT(DISTINCT tm.team_id) AS team_count
          FROM users u
          LEFT JOIN workspace_memberships wm ON wm.user_id = u.id
          LEFT JOIN team_memberships tm ON tm.user_id = u.id
          WHERE u.is_super_admin = 0
          GROUP BY u.id
          ORDER BY u.created_at DESC
        `
        )
        .all() as Array<{
        id: string;
        email: string;
        display_name: string;
        created_at: string;
        updated_at: string;
        last_active_at: string;
        workspace_count: number;
        team_count: number;
      }>
    ).map((user) => ({
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
      lastActiveAt: user.last_active_at,
      workspaceCount: user.workspace_count,
      teamCount: user.team_count
    }));
  } finally {
    db.close();
  }
}

export function printSummary(report: UsageReport): void {
  const averageUsersPerWorkspace = report.totals.workspaces
    ? (report.workspaces.reduce((sum, workspace) => sum + workspace.userCount, 0) / report.totals.workspaces).toFixed(2)
    : "0.00";

  console.log(`Generated: ${report.generatedAt}`);
  console.log(`Public trial: enabled=${report.publicTrial.enabled ?? "unknown"} mode=${report.publicTrial.mode ?? "unknown"}`);
  console.log(`Database: ${report.databasePath} (${report.databaseBytes} bytes)`);
  console.log("");
  console.log("Totals:");
  console.log(`  users: ${report.totals.users}`);
  console.log(`  workspaces: ${report.totals.workspaces} (${report.totals.publicTrialWorkspaces} public trial)`);
  console.log(`  average users/workspace: ${averageUsersPerWorkspace}`);
  console.log(`  teams: ${report.totals.teams} (${report.totals.archivedTeams} archived)`);
  console.log(`  history entries: ${report.totals.historyEntries}`);
  console.log(`  active sessions: ${report.totals.currentSessions}`);
  console.log("");
  console.log(`Current month (${report.monthly.periodStart.slice(0, 10)} to ${report.monthly.periodEnd.slice(0, 10)}):`);
  console.log(`  revealed rounds: ${report.monthly.revealedRounds}`);
  console.log(`  votes: ${report.monthly.votes}`);
  console.log("");
  console.log("Workspaces:");
  for (const workspace of report.workspaces.slice(0, 25)) {
    console.log(
      `  ${workspace.name} [${workspace.kind}] users=${workspace.userCount} teams=${workspace.teamCount} monthly_reveals=${workspace.monthlyReveals} monthly_votes=${workspace.monthlyVotes}`
    );
  }
}

export function runUsageReportCommand(command = "usage", dbPath = databasePath()): void {
  if (command === "usage") {
    printSummary(buildReport(dbPath));
  } else if (command === "usage:json") {
    console.log(JSON.stringify(buildReport(dbPath), null, 2));
  } else if (command === "users:export") {
    console.log(JSON.stringify(usersExport(dbPath), null, 2));
  } else if (command === "workspaces:export") {
    console.log(JSON.stringify(buildReport(dbPath).workspaces, null, 2));
  } else {
    console.error("Usage: tsx src/usageReportCli.ts <usage|usage:json|users:export|workspaces:export>");
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runUsageReportCommand(process.argv[2] ?? "usage");
}
