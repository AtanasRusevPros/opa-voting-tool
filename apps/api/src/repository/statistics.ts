// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later
import type { DatabaseSync } from 'node:sqlite';
import type { StatisticsResponse, StatisticsMetrics } from '@planning-poker/shared';

const DAY = 86400000;
export type LiveStatistics = { online: string[]; boards: Record<string, string[]> };
const human = 'is_super_admin = 0 AND is_synthetic = 0 AND deleted_at IS NULL';

export function initializeStatistics(db: DatabaseSync) {
  for (const table of ['users', 'teams']) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as {name: string}[];
    if (!columns.some(c => c.name === 'is_synthetic')) db.exec(`ALTER TABLE ${table} ADD COLUMN is_synthetic INTEGER NOT NULL DEFAULT 0`);
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS statistics_metadata (id INTEGER PRIMARY KEY, started_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS statistics_activity (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      day TEXT NOT NULL, last_at TEXT NOT NULL, PRIMARY KEY(user_id, team_id, day));
    CREATE INDEX IF NOT EXISTS statistics_activity_time ON statistics_activity(last_at, team_id);
    CREATE INDEX IF NOT EXISTS statistics_activity_team ON statistics_activity(team_id, last_at);
    CREATE TABLE IF NOT EXISTS statistics_rounds (
      round_id TEXT PRIMARY KEY REFERENCES rounds(id) ON DELETE CASCADE,
      team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      issue_id TEXT NOT NULL, completed_at TEXT NOT NULL,
      votes INTEGER NOT NULL, eligible INTEGER NOT NULL, participating INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS statistics_rounds_time ON statistics_rounds(completed_at, team_id);
    CREATE INDEX IF NOT EXISTS statistics_rounds_team ON statistics_rounds(team_id, completed_at);
    CREATE TABLE IF NOT EXISTS statistics_voters (
      round_id TEXT NOT NULL REFERENCES statistics_rounds(round_id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, PRIMARY KEY(round_id, user_id));
    CREATE TRIGGER IF NOT EXISTS statistics_user_deletion AFTER UPDATE OF deleted_at ON users
      WHEN NEW.deleted_at IS NOT NULL BEGIN
        DELETE FROM statistics_activity WHERE user_id = NEW.id;
        DELETE FROM statistics_voters WHERE user_id = NEW.id;
      END;
  `);
  db.prepare('INSERT OR IGNORE INTO statistics_metadata VALUES (1, ?)').run(new Date().toISOString());
  // Global counters contain no person/team/workspace/issue identifiers or event timestamps.
  // Seed once from surviving statistics; deleted/previously expired records cannot be reconstructed.
  db.exec(`CREATE TABLE IF NOT EXISTS statistics_totals (
    id INTEGER PRIMARY KEY CHECK (id = 1), completed_rounds INTEGER NOT NULL, votes INTEGER NOT NULL);
    INSERT OR IGNORE INTO statistics_totals SELECT 1, COUNT(*), COALESCE(SUM(votes), 0) FROM statistics_rounds;
    CREATE TRIGGER IF NOT EXISTS statistics_count_round AFTER INSERT ON statistics_rounds BEGIN
      UPDATE statistics_totals SET completed_rounds = completed_rounds + 1, votes = votes + NEW.votes WHERE id = 1;
    END;`);
}

export function recordActivity(db: DatabaseSync, userId: string, teamId: string, now = Date.now()) {
  // One row per person/team/day; heartbeats and statistics reads do not record activity.
  db.prepare(`INSERT INTO statistics_activity(user_id, team_id, day, last_at)
    SELECT u.id, t.id, ?, ? FROM users u, teams t WHERE u.id = ? AND t.id = ?
    AND u.is_super_admin = 0 AND u.is_synthetic = 0 AND u.deleted_at IS NULL AND t.demo = 0 AND t.is_synthetic = 0
    AND EXISTS (SELECT 1 FROM team_memberships m WHERE m.user_id = u.id AND m.team_id = t.id)
    ON CONFLICT(user_id, team_id, day) DO UPDATE SET last_at = excluded.last_at
    WHERE statistics_activity.last_at < ?`).run(new Date(now).toISOString().slice(0, 10), new Date(now).toISOString(), userId, teamId, new Date(now).toISOString());
}

export function recordCompletedRound(db: DatabaseSync, roundId: string, teamId: string, issueId: string, voters: string[], eligible: string[]) {
  if (!db.prepare('SELECT 1 FROM teams WHERE id = ? AND demo = 0 AND is_synthetic = 0').get(teamId)) return;
  const allowed = new Set((db.prepare(`SELECT id FROM users WHERE ${human}`).all() as {id: string}[]).map(u => u.id));
  const realVoters = [...new Set(voters)].filter(id => allowed.has(id));
  const realEligible = new Set(eligible.filter(id => allowed.has(id)));
  db.prepare('INSERT OR IGNORE INTO statistics_rounds VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(roundId, teamId, issueId, new Date().toISOString(), realVoters.length, realEligible.size, realVoters.filter(id => realEligible.has(id)).length);
  for (const id of realVoters) db.prepare('INSERT OR IGNORE INTO statistics_voters VALUES (?, ?)').run(roundId, id);
}

type Activity = {user_id: string; team_id: string; day: string; last_at: string};
type Completed = {round_id: string; team_id: string; issue_id: string; completed_at: string; votes: number; eligible: number; participating: number};
export function readStatistics(db: DatabaseSync, live: LiveStatistics, scopeTeam?: string, days: 1 | 7 | 30 = 30, now = Date.now(), workspaceId?: string): StatisticsResponse {
  const generatedAt = new Date(now).toISOString();
  const startedAt = (db.prepare('SELECT started_at FROM statistics_metadata WHERE id = 1').get() as {started_at: string}).started_at;
  const from30 = new Date(now - 30 * DAY).toISOString();
  const teams = db.prepare(`SELECT t.id, t.name, t.workspace_id, t.archived, w.name AS workspace_name FROM teams t
    JOIN workspaces w ON w.id = t.workspace_id WHERE t.demo = 0 AND t.is_synthetic = 0 ${scopeTeam ? 'AND t.id = ?' : ''} ${workspaceId ? 'AND w.id = ?' : ''} ORDER BY t.name`).all(...(scopeTeam ? [scopeTeam] : []), ...(workspaceId ? [workspaceId] : [])) as {id: string; name: string; workspace_id: string; workspace_name: string; archived: number}[];
  const ids = new Set(teams.map(t => t.id));
  const users = db.prepare(`SELECT id, created_at FROM users WHERE ${human}`).all() as {id: string; created_at: string}[];
  const humans = new Set(users.map(u => u.id));
  const activity = (db.prepare(`SELECT * FROM statistics_activity WHERE last_at >= ? AND last_at <= ? ${scopeTeam ? 'AND team_id = ?' : ''}`).all(from30, generatedAt, ...(scopeTeam ? [scopeTeam] : [])) as Activity[]).filter(a => ids.has(a.team_id) && humans.has(a.user_id));
  const rounds = (db.prepare(`SELECT * FROM statistics_rounds WHERE completed_at >= ? AND completed_at <= ? ${scopeTeam ? 'AND team_id = ?' : ''}`).all(from30, generatedAt, ...(scopeTeam ? [scopeTeam] : [])) as Completed[]).filter(r => ids.has(r.team_id));
  const roundIds = new Set(rounds.map(r => r.round_id));
  const voters = (db.prepare(`SELECT v.round_id, v.user_id FROM statistics_voters v JOIN statistics_rounds r ON r.round_id = v.round_id WHERE r.completed_at >= ? AND r.completed_at <= ? ${scopeTeam ? 'AND r.team_id = ?' : ''}`).all(from30, generatedAt, ...(scopeTeam ? [scopeTeam] : [])) as {round_id: string; user_id: string}[]).filter(v => roundIds.has(v.round_id) && humans.has(v.user_id));
  const memberships = (db.prepare('SELECT team_id, user_id FROM team_memberships').all() as {team_id: string; user_id: string}[]).filter(m => ids.has(m.team_id) && humans.has(m.user_id));
  const unfinished = (db.prepare("SELECT team_id, status, created_at FROM rounds WHERE revealed_at IS NULL AND created_at >= ? AND created_at <= ?").all(from30, generatedAt) as {team_id: string; status: string; created_at: string}[]).filter(r => ids.has(r.team_id));
  const cutoffs = new Map([1, 7, 30].map(p => [p, new Date(now - p * DAY).toISOString()]));
  const selectedFrom = cutoffs.get(days)!;
  const accumulator = () => ({people: new Set<string>(), issues: new Set<string>(), voters: new Set<string>(), completedRounds: 0, votes: 0, eligible: 0, participating: 0, activeRounds: 0, abandonedRounds: 0});
  const windows = new Map([1, 7, 30].map(p => [p, accumulator()]));
  const perTeam = new Map(teams.map(t => [t.id, accumulator()]));
  const daily = new Map<string, {people: Set<string>; rounds: number}>();
  for (let i = days; i >= 0; i--) daily.set(new Date(now - i * DAY).toISOString().slice(0, 10), {people: new Set(), rounds: 0});
  for (const a of activity) {
    for (const [period, acc] of windows) if (a.last_at >= cutoffs.get(period)!) acc.people.add(a.user_id);
    if (a.last_at >= selectedFrom) { perTeam.get(a.team_id)!.people.add(a.user_id); daily.get(a.day)?.people.add(a.user_id); }
  }
  const addRound = (acc: ReturnType<typeof accumulator>, r: Completed) => {
    acc.completedRounds++; acc.issues.add(r.issue_id); acc.votes += r.votes; acc.eligible += r.eligible; acc.participating += r.participating;
  };
  const roundMap = new Map(rounds.map(r => [r.round_id, r]));
  for (const r of rounds) {
    for (const [period, acc] of windows) if (r.completed_at >= cutoffs.get(period)!) addRound(acc, r);
    if (r.completed_at >= selectedFrom) { addRound(perTeam.get(r.team_id)!, r); const day = daily.get(r.completed_at.slice(0, 10)); if (day) day.rounds++; }
  }
  for (const v of voters) {
    const r = roundMap.get(v.round_id)!;
    for (const [period, acc] of windows) if (r.completed_at >= cutoffs.get(period)!) acc.voters.add(v.user_id);
    if (r.completed_at >= selectedFrom) perTeam.get(r.team_id)!.voters.add(v.user_id);
  }
  for (const r of unfinished) {
    const key = r.status === 'active' ? 'activeRounds' : 'abandonedRounds';
    for (const [period, acc] of windows) if (r.created_at >= cutoffs.get(period)!) acc[key]++;
    if (r.created_at >= selectedFrom) perTeam.get(r.team_id)![key]++;
  }
  const metrics = (acc: ReturnType<typeof accumulator>): StatisticsMetrics => ({activePeople: acc.people.size, completedRounds: acc.completedRounds,
    distinctIssues: acc.issues.size, votes: acc.votes, uniqueVoters: acc.voters.size,
    participationPercent: acc.eligible ? Math.round(1000 * acc.participating / acc.eligible) / 10 : null,
    activeRounds: acc.activeRounds, abandonedRounds: acc.abandonedRounds});
  const online = new Set(live.online.filter(id => humans.has(id)));
  const boardIds = (id: string) => new Set((live.boards[id] ?? []).filter(user => humans.has(user) && memberships.some(m => m.team_id === id && m.user_id === user)));
  const activeTeams = new Set(activity.filter(a => a.last_at >= selectedFrom).map(a => a.team_id));
  const teamRows = teams.map(t => ({ id: t.id, name: t.name, workspaceId: t.workspace_id, workspaceName: t.workspace_name, archived: !!t.archived,
    members: memberships.filter(m => m.team_id === t.id).length, onBoard: boardIds(t.id).size, ...metrics(perTeam.get(t.id)!) }));
  const trend = [...daily].map(([date, value]) => ({date, activePeople: value.people.size, completedRounds: value.rounds}));
  const totals = scopeTeam || workspaceId ? null : db.prepare('SELECT completed_rounds, votes FROM statistics_totals WHERE id = 1').get() as {completed_rounds: number; votes: number} | null;
  const lifetimeTotals = totals ? {completedRounds: totals.completed_rounds, votes: totals.votes} : null;
  return { generatedAt, startedAt, retentionDays: null, lifetimeTotals, days, periodStart: selectedFrom, partialCoverage: startedAt > selectedFrom,
    windows: {day: metrics(windows.get(1)!), week: metrics(windows.get(7)!), month: metrics(windows.get(30)!)}, selected: metrics(windows.get(days)!), teams: teamRows, trend,
    onlinePeople: scopeTeam || workspaceId ? new Set(memberships.filter(m => online.has(m.user_id)).map(m => m.user_id)).size : online.size,
    onBoards: new Set(teams.flatMap(t => [...boardIds(t.id)])).size,
    activeTeams: activeTeams.size, activeWorkspaces: new Set(teams.filter(t => activeTeams.has(t.id)).map(t => t.workspace_id)).size,
    newRegistrations: scopeTeam || workspaceId ? null : users.filter(u => u.created_at >= selectedFrom && u.created_at >= startedAt && u.created_at <= generatedAt).length };
}
