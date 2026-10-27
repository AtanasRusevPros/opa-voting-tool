// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later
import type { TeamSummary } from "@planning-poker/shared";

/** Native disclosure keeps long workspace names readable on touch and keyboard. */
export function WorkspaceContext({workspace}: {workspace: TeamSummary["workspace"]}) {
  if (!workspace) return null;
  return <details className="workspace-context" key={workspace.id}>
    <summary title={`Workspace: ${workspace.name}`}><span>Workspace: {workspace.name}</span></summary>
    <div className="workspace-context-full">{workspace.name}</div>
  </details>;
}
