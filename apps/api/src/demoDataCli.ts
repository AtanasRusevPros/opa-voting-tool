// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { buildDemoScenario } from "./demoMode.js";

type DemoTeamMemberRecord = {
  id: string;
  email: string;
  displayName: string;
};

type DemoTeamReport = {
  id: string;
  name: string;
  demoFlag: boolean;
  expectedMemberCount: number | null;
  actualMemberCount: number;
  canonicalSeedMemberCount: number;
  duplicateDisplayNameCount: number;
  duplicateDisplayNames: Array<{ displayName: string; count: number }>;
  unexpectedMemberCount: number;
  unexpectedMembers: DemoTeamMemberRecord[];
  missingCanonicalMemberCount: number;
  status: "clean" | "mismatch" | "legacy";
};

type DemoUserReport = {
  id: string;
  email: string;
  displayName: string;
  canonicalEmail: boolean;
  demoTeamMembershipCount: number;
  totalTeamMembershipCount: number;
};

export type DemoDataReport = {
  generatedAt: string;
  databasePath: string;
  includedDemoAccounts: boolean;
  demoTeams: DemoTeamReport[];
  demoUsers: DemoUserReport[];
  totals: {
    canonicalScenarioTeams: number;
    canonicalScenarioUsers: number;
    demoTeamsInDatabase: number;
    demoUsersInDatabase: number;
    mismatchedTeams: number;
    unexpectedMembers: number;
  };
};

type DemoDataReportOptions = {
  includeDemoAccounts?: boolean;
};

export type DemoResetPlan = {
  generatedAt: string;
  databasePath: string;
  demoTeamIds: string[];
  demoUserIds: string[];
  demoTeamNames: string[];
  demoUserEmails: string[];
  deleteCounts: {
    teams: number;
    users: number;
  };
};

export type DemoResetResult = DemoResetPlan & {
  applied: boolean;
};

function defaultDatabasePath(): string {
  if (process.env.DATABASE_PATH) {
    return process.env.DATABASE_PATH;
  }
  const dataDir = process.env.DATA_DIR ?? path.join(process.cwd(), "apps/api/data");
  return path.join(dataDir, "planning-poker.db");
}

function loadCanonicalScenario() {
  const scenario = buildDemoScenario();
  return {
    teamsByName: new Map(scenario.teams.map((team) => [team.name, team])),
    canonicalEmails: new Set(scenario.users.map((user) => user.email)),
    teamCount: scenario.teams.length,
    userCount: scenario.users.length
  };
}

function loadDemoTeamMembers(db: DatabaseSync, teamId: string): DemoTeamMemberRecord[] {
  return db
    .prepare(
      `
      SELECT u.id, u.email, u.display_name AS displayName
      FROM team_memberships tm
      JOIN users u ON u.id = tm.user_id
      WHERE tm.team_id = ? AND u.is_super_admin = 0
      ORDER BY u.display_name COLLATE NOCASE ASC, u.email COLLATE NOCASE ASC
    `
    )
    .all(teamId) as DemoTeamMemberRecord[];
}

function loadDemoUserReports(db: DatabaseSync, canonicalEmails: Set<string>): DemoUserReport[] {
  const rows = db
    .prepare(
      `
      SELECT
        u.id,
        u.email,
        u.display_name,
        SUM(CASE WHEN t.id IS NOT NULL AND (t.demo = 1 OR t.name LIKE 'Demo Team %') THEN 1 ELSE 0 END) AS demo_team_membership_count,
        COUNT(tm.team_id) AS total_team_membership_count
      FROM users u
      LEFT JOIN team_memberships tm ON tm.user_id = u.id
      LEFT JOIN teams t ON t.id = tm.team_id
      WHERE u.is_super_admin = 0
        AND (
          u.email GLOB 'demo.bot.*@example-company.com'
          OR u.display_name LIKE 'Demo %'
          OR EXISTS (
            SELECT 1
            FROM team_memberships tm2
            JOIN teams t2 ON t2.id = tm2.team_id
            WHERE tm2.user_id = u.id AND (t2.demo = 1 OR t2.name LIKE 'Demo Team %')
          )
        )
      GROUP BY u.id
      ORDER BY u.display_name COLLATE NOCASE ASC, u.email COLLATE NOCASE ASC
    `
    )
    .all() as Array<{
    id: string;
    email: string;
    display_name: string;
    demo_team_membership_count: number;
    total_team_membership_count: number;
  }>;

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    canonicalEmail: canonicalEmails.has(row.email),
    demoTeamMembershipCount: row.demo_team_membership_count,
    totalTeamMembershipCount: row.total_team_membership_count
  }));
}

function computeTeamStatus(expectedMemberCount: number | null, unexpectedMembers: DemoTeamMemberRecord[], missingCanonicalMemberCount: number): DemoTeamReport["status"] {
  if (expectedMemberCount === null) {
    return "legacy";
  }
  if (unexpectedMembers.length === 0 && missingCanonicalMemberCount === 0) {
    return "clean";
  }
  return "mismatch";
}

export function buildDemoDataReport(dbPath = defaultDatabasePath(), options: DemoDataReportOptions = {}): DemoDataReport {
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Database not found: ${dbPath}`);
  }

  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const canonical = loadCanonicalScenario();
    const includeDemoAccounts = options.includeDemoAccounts === true;
    const demoTeamRows = db
      .prepare(
        `
        SELECT id, name, demo
        FROM teams
        WHERE demo = 1 OR name LIKE 'Demo Team %'
        ORDER BY name COLLATE NOCASE ASC
      `
      )
      .all() as Array<{ id: string; name: string; demo: number }>;

    const demoTeams = demoTeamRows.map((row) => {
      const canonicalTeam = canonical.teamsByName.get(row.name);
      const members = loadDemoTeamMembers(db, row.id);
      const memberEmails = new Set(members.map((member) => member.email));
      const expectedEmails = canonicalTeam ? new Set(canonicalTeam.memberEmails) : null;
      const duplicateDisplayNames = Array.from(
        members.reduce<Map<string, number>>((counts, member) => {
          counts.set(member.displayName, (counts.get(member.displayName) ?? 0) + 1);
          return counts;
        }, new Map())
      )
        .filter(([, count]) => count > 1)
        .map(([displayName, count]) => ({ displayName, count }))
        .sort((left, right) => left.displayName.localeCompare(right.displayName));
      const unexpectedMembers =
        expectedEmails === null ? [...members] : members.filter((member) => !expectedEmails.has(member.email));
      const canonicalSeedMemberCount = expectedEmails === null ? 0 : [...expectedEmails].filter((email) => memberEmails.has(email)).length;
      const missingCanonicalMemberCount = expectedEmails === null ? 0 : expectedEmails.size - canonicalSeedMemberCount;

      return {
        id: row.id,
        name: row.name,
        demoFlag: row.demo === 1,
        expectedMemberCount: canonicalTeam?.memberEmails.length ?? null,
        actualMemberCount: members.length,
        canonicalSeedMemberCount,
        duplicateDisplayNameCount: duplicateDisplayNames.length,
        duplicateDisplayNames: includeDemoAccounts ? duplicateDisplayNames : [],
        unexpectedMemberCount: unexpectedMembers.length,
        unexpectedMembers: includeDemoAccounts ? unexpectedMembers : [],
        missingCanonicalMemberCount,
        status: computeTeamStatus(canonicalTeam?.memberEmails.length ?? null, unexpectedMembers, missingCanonicalMemberCount)
      } satisfies DemoTeamReport;
    });

    const demoUsers = includeDemoAccounts ? loadDemoUserReports(db, canonical.canonicalEmails) : [];
    const demoUserCount = includeDemoAccounts
      ? demoUsers.length
      : countDemoUsersInDatabase(db);
    return {
      generatedAt: new Date().toISOString(),
      databasePath: dbPath,
      includedDemoAccounts: includeDemoAccounts,
      demoTeams,
      demoUsers,
      totals: {
        canonicalScenarioTeams: canonical.teamCount,
        canonicalScenarioUsers: canonical.userCount,
        demoTeamsInDatabase: demoTeams.length,
        demoUsersInDatabase: demoUserCount,
        mismatchedTeams: demoTeams.filter((team) => team.status !== "clean").length,
        unexpectedMembers: demoTeams.reduce((sum, team) => sum + team.unexpectedMemberCount, 0)
      }
    };
  } finally {
    db.close();
  }
}

function countDemoUsersInDatabase(db: DatabaseSync): number {
  const row = db
    .prepare(
      `
      SELECT COUNT(DISTINCT u.id) AS count
      FROM users u
      WHERE u.is_super_admin = 0
        AND (
          u.email GLOB 'demo.bot.*@example-company.com'
          OR u.display_name LIKE 'Demo %'
          OR EXISTS (
            SELECT 1
            FROM team_memberships tm
            JOIN teams t ON t.id = tm.team_id
            WHERE tm.user_id = u.id AND (t.demo = 1 OR t.name LIKE 'Demo Team %')
          )
        )
    `
    )
    .get() as { count: number } | undefined;
  return row?.count ?? 0;
}

function buildResetPlan(db: DatabaseSync, dbPath: string): DemoResetPlan {
  const demoTeamRows = db
    .prepare(
      `
      SELECT id, name
      FROM teams
      WHERE demo = 1
      ORDER BY name COLLATE NOCASE ASC
    `
    )
    .all() as Array<{ id: string; name: string }>;
  const demoTeamIds = demoTeamRows.map((row) => row.id);
  const demoUserRows = db
    .prepare(
      `
      SELECT DISTINCT u.id, u.email
      FROM users u
      WHERE u.is_super_admin = 0
        AND NOT EXISTS (
          SELECT 1 FROM team_memberships tm
          JOIN teams t ON t.id = tm.team_id
          WHERE tm.user_id = u.id AND t.demo = 0
        )
        AND NOT EXISTS (
          SELECT 1 FROM teams t WHERE t.created_by = u.id AND t.demo = 0
        )
      ORDER BY u.email COLLATE NOCASE ASC
    `
    )
    .all() as Array<{ id: string; email: string }>;
  const canonicalEmails = loadCanonicalScenario().canonicalEmails;
  const safeDemoUsers = demoUserRows.filter((user) => canonicalEmails.has(user.email));

  return {
    generatedAt: new Date().toISOString(),
    databasePath: dbPath,
    demoTeamIds,
    demoUserIds: safeDemoUsers.map((row) => row.id),
    demoTeamNames: demoTeamRows.map((row) => row.name),
    demoUserEmails: safeDemoUsers.map((row) => row.email),
    deleteCounts: {
      teams: demoTeamRows.length,
      users: safeDemoUsers.length
    }
  };
}

export function resetDemoData(dbPath = defaultDatabasePath(), options?: { apply?: boolean }): DemoResetResult {
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Database not found: ${dbPath}`);
  }

  const db = new DatabaseSync(dbPath);
  try {
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("PRAGMA busy_timeout = 5000");
    if (!options?.apply) {
      return { ...buildResetPlan(db, dbPath), applied: false };
    }

    db.exec("BEGIN IMMEDIATE");
    try {
      const plan = buildResetPlan(db, dbPath);
      for (const teamId of plan.demoTeamIds) {
        db.prepare("DELETE FROM teams WHERE id = ?").run(teamId);
      }
      for (const userId of plan.demoUserIds) {
        db.prepare("DELETE FROM users WHERE id = ?").run(userId);
      }
      db.exec("COMMIT");
      return { ...plan, applied: true };
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

  } finally {
    db.close();
  }
}

export function printDemoDataReport(report: DemoDataReport): void {
  console.log(`Generated: ${report.generatedAt}`);
  console.log(`Database: ${report.databasePath}`);
  console.log(`Demo account details included: ${report.includedDemoAccounts ? "yes" : "no"}`);
  console.log("");
  console.log("Totals:");
  console.log(`  canonical demo teams: ${report.totals.canonicalScenarioTeams}`);
  console.log(`  canonical demo users: ${report.totals.canonicalScenarioUsers}`);
  console.log(`  demo teams in database: ${report.totals.demoTeamsInDatabase}`);
  console.log(`  demo users in database: ${report.totals.demoUsersInDatabase}`);
  console.log(`  mismatched teams: ${report.totals.mismatchedTeams}`);
  console.log(`  unexpected team members: ${report.totals.unexpectedMembers}`);
  console.log("");
  console.log("Demo teams:");
  for (const team of report.demoTeams) {
    const expectedText = team.expectedMemberCount == null ? "legacy/unknown" : String(team.expectedMemberCount);
    console.log(
      `  ${team.name}: actual=${team.actualMemberCount} expected=${expectedText} canonical=${team.canonicalSeedMemberCount} status=${team.status}`
    );
    if (team.duplicateDisplayNameCount > 0 && report.includedDemoAccounts) {
      console.log(`    duplicate names: ${team.duplicateDisplayNames.map((item) => `${item.displayName} x${item.count}`).join(", ")}`);
    }
    if (team.duplicateDisplayNameCount > 0 && !report.includedDemoAccounts) {
      console.log(`    duplicate names detected: ${team.duplicateDisplayNameCount} (re-run with --include-demo-accounts for details)`);
    }
    if (team.unexpectedMemberCount > 0 && report.includedDemoAccounts) {
      console.log(`    unexpected members: ${team.unexpectedMembers.slice(0, 10).map((member) => member.email).join(", ")}`);
    }
    if (team.unexpectedMemberCount > 0 && !report.includedDemoAccounts) {
      console.log(`    unexpected members detected: ${team.unexpectedMemberCount} (re-run with --include-demo-accounts for details)`);
    }
  }

  if (report.includedDemoAccounts && report.demoUsers.length > 0) {
    console.log("");
    console.log("Demo users:");
    for (const user of report.demoUsers.slice(0, 20)) {
      console.log(
        `  ${user.displayName} <${user.email}> canonical=${user.canonicalEmail ? "yes" : "no"} demoTeamMemberships=${user.demoTeamMembershipCount} totalTeamMemberships=${user.totalTeamMembershipCount}`
      );
    }
  }
}

export function printResetPlan(result: DemoResetResult): void {
  console.log(`Generated: ${result.generatedAt}`);
  console.log(`Database: ${result.databasePath}`);
  console.log("");
  console.log(`Demo teams matched: ${result.deleteCounts.teams}`);
  console.log(`Demo users matched: ${result.deleteCounts.users}`);
  if (result.demoTeamNames.length > 0) {
    console.log(`Teams: ${result.demoTeamNames.join(", ")}`);
  }
  if (result.demoUserEmails.length > 0) {
    const preview = result.demoUserEmails.slice(0, 12).join(", ");
    const suffix = result.demoUserEmails.length > 12 ? ` ... (+${result.demoUserEmails.length - 12} more)` : "";
    console.log(`Users: ${preview}${suffix}`);
  }
  console.log("");
  console.log(
    result.applied
      ? "Reset applied. Restart the app or toggle demo mode off/on so the current demo seeding can recreate clean demo teams."
      : "Dry run only. Re-run with --apply after taking a backup and stopping the app stack."
  );
}

function parseArgs(argv: string[]) {
  const [command = "inspect", ...rest] = argv;
  let dbPath = defaultDatabasePath();
  let json = false;
  let apply = false;
  let includeDemoAccounts = false;

  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (!argument) {
      continue;
    }
    if (argument === "--json") {
      json = true;
      continue;
    }
    if (argument === "--apply") {
      apply = true;
      continue;
    }
    if (argument === "--include-demo-accounts") {
      includeDemoAccounts = true;
      continue;
    }
    if (argument === "--db") {
      const next = rest[index + 1];
      if (!next) {
        throw new Error("Missing value for --db");
      }
      dbPath = path.resolve(next);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  return { command, dbPath, json, apply, includeDemoAccounts };
}

export function runDemoDataCommand(argv = process.argv.slice(2)): void {
  const { command, dbPath, json, apply, includeDemoAccounts } = parseArgs(argv);

  if (command === "inspect") {
    const report = buildDemoDataReport(dbPath, { includeDemoAccounts });
    if (json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    printDemoDataReport(report);
    return;
  }

  if (command === "reset") {
    if (includeDemoAccounts) {
      throw new Error("--include-demo-accounts is not valid with reset");
    }
    const result = resetDemoData(dbPath, { apply });
    if (json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    printResetPlan(result);
    return;
  }

  console.error("Usage: tsx src/demoDataCli.ts <inspect|reset> [--db <path>] [--json] [--apply] [--include-demo-accounts]");
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runDemoDataCommand();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
