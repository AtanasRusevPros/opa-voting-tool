// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useState } from "react";
import { StatsPanel } from "./StatsPanel";
import type { TrialWorkspaceView } from "./HostedTrialNotice";

export type TrialWorkspaceSettingsProps = {
  loadTrialWorkspaces?: () => Promise<TrialWorkspaceView[]>;
  onRenameWorkspace?: (id: string, name: string) => Promise<void>;
  onLeaveWorkspace?: (id: string) => Promise<void>;
};
export function TrialWorkspaceSettings(props: TrialWorkspaceSettingsProps) {
  const [trialWorkspaces, setTrialWorkspaces] = useState<TrialWorkspaceView[]>([]);
  const [statsWorkspace, setStatsWorkspace] = useState<string | null>(null);
  const [editingWorkspace, setEditingWorkspace] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState("");
  const [savingWorkspace, setSavingWorkspace] = useState(false);
  const [workspaceNotice, setWorkspaceNotice] = useState("");
  const [workspaceError, setWorkspaceError] = useState("");
  const [leavingWorkspace, setLeavingWorkspace] = useState(false);
  useEffect(() => {
    let active = true;
    props.loadTrialWorkspaces?.().then((items) => { if (active) setTrialWorkspaces(items); })
      .catch(() => { if (active) setWorkspaceError("Could not load workspace usage. Reopen Account settings to retry."); });
    return () => { active = false; };
  }, [props.loadTrialWorkspaces]);

  return <>
        {workspaceError ? <p role="alert">{workspaceError}</p> : null}
        {trialWorkspaces.length > 0 ? <section className="chooser-card">
          {workspaceNotice ? <p role="status">{workspaceNotice}</p> : null}
          <h3>Your hosted-trial workspaces ({trialWorkspaces.length}/2)</h3>
          <p>You can participate in two trial workspaces. Invitations do not reset usage. Leaving a team does not free a workspace slot.</p>
          {trialWorkspaces.map((workspace) => <div key={workspace.id}>
            <h4>{workspace.name} — {workspace.isOwner ? "Owner" : "Collaborator"}</h4>
            {workspace.isOwner && props.onRenameWorkspace ? editingWorkspace === workspace.id ? <form className="workspace-rename-form" onSubmit={async (event) => {
              event.preventDefault();
              if (savingWorkspace) return;
              if (!workspaceName.trim() || workspaceName.trim().length > 80) { setWorkspaceError("Use a workspace name between 1 and 80 characters."); return; }
              setSavingWorkspace(true); setWorkspaceError(""); setWorkspaceNotice("");
              try {
                await props.onRenameWorkspace!(workspace.id, workspaceName.trim());
                setTrialWorkspaces(await props.loadTrialWorkspaces?.() ?? []);
                setEditingWorkspace(null); setWorkspaceNotice("Workspace name saved.");
              } catch (error) { setWorkspaceError((error as Error).message); }
              finally { setSavingWorkspace(false); }
            }}>
              <label>Workspace name<input value={workspaceName} maxLength={80} disabled={savingWorkspace} onChange={(event) => setWorkspaceName(event.target.value)} /></label>
              <div className="workspace-rename-actions"><button className="primary-button" type="submit" disabled={savingWorkspace}>Save workspace name</button>
              <button className="secondary-button" type="button" disabled={savingWorkspace} onClick={() => { setEditingWorkspace(null); setWorkspaceError(""); }}>Cancel</button></div>
            </form> : <button className="secondary-button" type="button" onClick={() => { setEditingWorkspace(workspace.id); setWorkspaceName(workspace.name); setWorkspaceError(""); setWorkspaceNotice(""); }}>Rename workspace</button> : null}

            {workspace.isOwner ? <>
              <button className="secondary-button" type="button" aria-expanded={statsWorkspace === workspace.id} onClick={() => setStatsWorkspace(statsWorkspace === workspace.id ? null : workspace.id)}>Workspace stats: {workspace.name}</button>
              {statsWorkspace === workspace.id ? <section aria-label={`Statistics for ${workspace.name}`}><StatsPanel workspaceId={workspace.id} /></section> : null}
            </> : null}
            <p>Teams: {workspace.teams.map((team) => team.name).join(", ") || "No joined teams"}</p>
            <p>{workspace.revealedRounds} of {workspace.monthlyLimit} revealed rounds used this month. Resets {workspace.resetsAt.slice(0, 10)} (UTC).</p>
            {workspace.isOwner ? <p>For deletion details, use Delete account below.</p> :
              <button type="button" className="secondary-button" disabled={leavingWorkspace} onClick={async () => {
                if (!window.confirm(`Leave ${workspace.name}? You will lose access to all its teams. Saved history stays with the workspace. Your account and other workspace remain.`)) return;
                setLeavingWorkspace(true); setWorkspaceError("");
                try {
                  await props.onLeaveWorkspace?.(workspace.id);
                  setTrialWorkspaces(await props.loadTrialWorkspaces?.() ?? []);
                } catch (error) { setWorkspaceError((error as Error).message); }
                finally { setLeavingWorkspace(false); }
              }}>Leave workspace: {workspace.name}</button>}
          </div>)}
  
        </section> : null}

  </>;
}
