// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useState } from 'react';
import type { StatisticsResponse } from '@planning-poker/shared';
import { closeSocket } from './closeSocket';

export function StatsPanel({teamId, workspaceId}: {teamId?: string; workspaceId?: string}) {
  const [days, setDays] = useState<1 | 7 | 30>(30);
  const [workspace, setWorkspace] = useState('');
  const [workspaces, setWorkspaces] = useState<Array<{id: string; name: string}>>([]);
  const [data, setData] = useState<StatisticsResponse | null>(null);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    let disposed = false, loading = false, dirty = false;
    let socket: WebSocket | undefined;
    let reconnect: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const token = localStorage.getItem('planning-poker:session-token');
    const headers: HeadersInit = token ? {Authorization: `Bearer ${token}`} : {};
    setData(null); setError(''); setConnected(false);
    const load = async () => {
      if (disposed) return;
      if (loading) { dirty = true; return; }
      loading = true;
      try {
        const path = teamId ? `/api/teams/${encodeURIComponent(teamId)}/statistics` : workspaceId ? `/api/workspaces/${encodeURIComponent(workspaceId)}/statistics` : '/api/admin/statistics';
        const query = new URLSearchParams({days: String(days)});
        if (!teamId && !workspaceId && workspace) query.set('workspaceId', workspace);
        const response = await fetch(`${path}?${query}`, {headers, credentials: 'include', signal: controller.signal});
        if (!response.ok) throw new Error('Statistics could not be loaded. Check your access and retry.');
        const result: StatisticsResponse = await response.json();
        if (!disposed) {
          setData(result); setError('');
          if (!workspace) setWorkspaces([...new Map(result.teams.map(t => [t.workspaceId, {id: t.workspaceId, name: t.workspaceName}])).values()]);
        }
      } catch (err) { if (!disposed) { setData(null); setError((err as Error).message); } }
      finally { loading = false; if (dirty && !disposed) { dirty = false; void load(); } }
    };
    const connect = () => {
      if (disposed) return;
      const url = new URL('/ws', location.href); url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      url.searchParams.set('scope', 'statistics');
      if (teamId) url.searchParams.set('teamId', teamId);
      if (workspaceId) url.searchParams.set('workspaceId', workspaceId);
      if (token) url.searchParams.set('token', token);
      socket = new WebSocket(url);
      socket.onopen = () => { if (!disposed) setConnected(true); };
      socket.onmessage = event => { if (JSON.parse(event.data).type === 'statistics:update') void load(); };
      socket.onclose = event => {
        if (disposed) return;
        setConnected(false);
        if (event.code === 1008) { setData(null); setError('Statistics access is no longer available.'); return; }
        reconnect = setTimeout(connect, 1000);
      };
    };
    void load(); connect();
    return () => { disposed = true; controller.abort(); clearTimeout(reconnect); if (socket) closeSocket(socket); };
  }, [teamId, workspaceId, days, workspace, refresh]);
  const download = () => {
    if (!data) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'}));
    const link = document.createElement('a'); link.href = url; link.download = 'opavoting-statistics.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="statistics-panel" aria-label="Usage statistics">
    <h3>{workspaceId ? 'Workspace stats' : 'Stats'}</h3>
    <p>Human activity and voting usage. Demo/simulator data and super-admin activity are excluded.</p>
    <div className="statistics-controls">
      <label>Period<select value={days} onChange={e => setDays(Number(e.target.value) as 1 | 7 | 30)}>
        <option value={1}>Last 24 hours</option><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option>
      </select></label>
      {!teamId && !workspaceId ? <label>Workspace<select value={workspace} onChange={e => setWorkspace(e.target.value)}><option value="">All workspaces</option>{workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label> : null}
      <button type="button" className="secondary-button" onClick={() => setRefresh(v => v + 1)}>Refresh stats</button>
      <button type="button" className="secondary-button" disabled={!data} onClick={download}>Export stats JSON</button>
    </div>
    {error ? <p role="alert">{error}</p> : !data ? <p role="status">Loading statistics…</p> : null}
    {data ? <>
      <p className="field-hint">{connected ? 'Live updates connected.' : 'Reconnecting; displayed counts may be stale.'} Snapshot: {data.generatedAt}. Coverage starts {data.startedAt}. {data.partialCoverage ? 'Partial coverage: older activity was not collected.' : ''} Rolling periods; dates use UTC, not trial quota calendar months.</p>
      {data.lifetimeTotals ? <p data-testid="stats-lifetime">Retained platform totals: {data.lifetimeTotals.completedRounds} completed rounds · {data.lifetimeTotals.votes} votes. Includes deleted workspaces; no identifying details. Coverage begins with available statistics, not necessarily the installation date.</p> : null}
      <dl className="statistics-cards">
        {([
          ['Active people · 24 hours', data.windows.day.activePeople], ['Active people · 7 days', data.windows.week.activePeople], ['Active people · 30 days', data.windows.month.activePeople],
          [teamId || workspaceId || workspace ? 'Members online now' : 'People online now', data.onlinePeople], ['On boards now', data.onBoards], ['Completed rounds', data.selected.completedRounds],
          ['Distinct issue records', data.selected.distinctIssues], ['Votes in completed rounds', data.selected.votes], ['Unique voters', data.selected.uniqueVoters],
          ['Participation', data.selected.participationPercent === null ? 'No eligible participants' : `${data.selected.participationPercent}%`],
          ['Active rounds started in period', data.selected.activeRounds], ['Abandoned rounds started in period', data.selected.abandonedRounds],
          ['Active teams', data.activeTeams], ...(!teamId ? [['Active workspaces', data.activeWorkspaces]] : []), ...(data.newRegistrations !== null ? [['New registrations', data.newRegistrations]] : [])
        ] as Array<[string, string | number]>).map(([label, value]) => <div key={label}><dt>{label}</dt><dd data-testid={`stats-${label}`}>{value}</dd></div>)}
      </dl>
      <p className="field-hint">Activity means opening a board or successfully changing team data. Repeated tabs count once. Online includes the chooser; On boards counts board connections only. Participation is votes by eligible board participants divided by eligible participants across completed rounds; non-numeric votes count. Re-votes add rounds, not issue records. Separate issues with identical titles remain separate.</p>
      {!data.selected.activePeople && !data.selected.completedRounds ? <p>No recorded activity in this period yet.</p> : null}
      <div className="statistics-table-scroll" tabIndex={0} aria-label="Team statistics table"><table><caption>Teams · selected period</caption><thead><tr>{['Team', 'Workspace', 'Members', 'On board', 'Active people', 'Rounds', 'Issues', 'Votes'].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{data.teams.map(t => <tr key={t.id}><th scope="row">{t.name}{t.archived ? ' (archived)' : ''}</th><td>{t.workspaceName}</td><td>{t.members}</td><td>{t.onBoard}</td><td>{t.activePeople}</td><td>{t.completedRounds}</td><td>{t.distinctIssues}</td><td>{t.votes}</td></tr>)}</tbody></table></div>
      <details><summary>Daily trend (UTC; boundary days may be partial)</summary><div className="statistics-table-scroll"><table><thead><tr><th>Date</th><th>Active people</th><th>Completed rounds</th></tr></thead><tbody>{data.trend.map(t => <tr key={t.date}><td>{t.date}</td><td>{t.activePeople}</td><td>{t.completedRounds}</td></tr>)}</tbody></table></div></details>
      <p className="field-hint">Statistics have no automatic expiry. Reporting periods filter the view without deleting older records. Account deletion removes statistics activity and voter identifiers; workspace purge removes its detailed statistics. Only platform-wide round and vote counts survive workspace deletion, with no user, team, workspace or issue identifiers. Shared history and backups have separate deletion rules. Exports contain scoped team/workspace names and aggregate counts, not individual account lists or vote content.</p>
    </> : null}
  </section>;
}
