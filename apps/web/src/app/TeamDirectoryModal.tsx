// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useMemo, useState } from "react";
import type { TeamDirectoryResponse, TeamHistoryImportResponse, TeamMemberCandidateResponse, TeamMemberInviteResponse, TeamMemberPasswordResetResponse } from "./types";

export function TeamDirectoryModal(props: {
  directory: TeamDirectoryResponse;
  isBusy: boolean;
  onClose: () => void;
  onToggleArchive: (teamId: string, archived: boolean) => Promise<void>;
  onAddMember: (teamId: string, email: string) => Promise<TeamMemberInviteResponse>;
  searchMemberCandidates: (teamId: string, query: string) => Promise<TeamMemberCandidateResponse>;
  onSaveJiraSettings: (teamId: string, projectKey: string, jql: string) => Promise<void>;
  onImportJiraIssues: (teamId: string) => Promise<void>;
  onLoadPendingIssue: (teamId: string, issueId: string) => Promise<void>;
  onExportTeamHistory: (teamId: string, includeComments: boolean) => Promise<void>;
  onImportTeamHistory: (teamId: string, file: File) => Promise<TeamHistoryImportResponse>;
  onResetMemberPassword: (teamId: string, userId: string) => Promise<TeamMemberPasswordResetResponse>;
  onDismissCredentialReveal?: () => void;
  onPromoteMember: (teamId: string, userId: string) => Promise<void>;
  onDemoteMember: (teamId: string, userId: string) => Promise<void>;
  onRemoveMember: (teamId: string, userId: string) => Promise<void>;
  onAdmitJoinRequest: (teamId: string, requestId: string) => Promise<void>;
  onDenyJoinRequest: (teamId: string, requestId: string) => Promise<void>;
}) {
  const activeParticipantIds = useMemo(() => new Set(props.directory.activeParticipantIds), [props.directory.activeParticipantIds]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [latestCredentialReveal, setLatestCredentialReveal] = useState<{
    heading: string;
    email: string;
    password: string;
    reminder: string;
  } | null>(null);
  const [memberCredentialReveal, setMemberCredentialReveal] = useState<{
    userId: string;
    heading: string;
    email: string;
    password: string;
    reminder: string;
  } | null>(null);
  const [memberCandidates, setMemberCandidates] = useState<TeamMemberCandidateResponse["users"]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [includeCommentsOnExport, setIncludeCommentsOnExport] = useState(true);
  const [teamImportFile, setTeamImportFile] = useState<File | null>(null);
  const [jiraProjectKey, setJiraProjectKey] = useState(props.directory.team.jiraProjectKey ?? "");
  const [jiraJql, setJiraJql] = useState(props.directory.team.jiraJql ?? "");
  const [activeAdminTab, setActiveAdminTab] = useState<"people" | "import-export">("people");
  const pendingIssues = props.directory.pendingIssues ?? [];
  const canManageMembers = props.directory.currentUserIsSuperAdmin || props.directory.currentUserRole === "team_admin";
  const canEditMembership = canManageMembers && !props.directory.team.archived;
  const trimmedInviteEmail = inviteEmail.trim();
  const normalizedInviteEmail = trimmedInviteEmail.toLowerCase();
  const selectedCandidate = memberCandidates.find((candidate) => candidate.id === selectedCandidateId) ?? null;
  const validInviteEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedInviteEmail);
  const canSubmitInvite = selectedCandidate ? normalizedInviteEmail === selectedCandidate.email.toLowerCase() : validInviteEmail && memberCandidates.length === 0;

  useEffect(() => {
    setJiraProjectKey(props.directory.team.jiraProjectKey ?? "");
    setJiraJql(props.directory.team.jiraJql ?? "");
  }, [props.directory.team.id, props.directory.team.jiraJql, props.directory.team.jiraProjectKey]);

  useEffect(() => {
    if (!canEditMembership || trimmedInviteEmail.length < 2) {
      setMemberCandidates([]);
      setSelectedCandidateId((current) => (current && normalizedInviteEmail.length === 0 ? null : current));
      return;
    }

    let cancelled = false;
    void props.searchMemberCandidates(props.directory.team.id, trimmedInviteEmail).then((response) => {
      if (cancelled) {
        return;
      }
      setMemberCandidates(response.users);
      setSelectedCandidateId((current) => (response.users.some((candidate) => candidate.id === current) ? current : null));
    });

    return () => {
      cancelled = true;
    };
  }, [canEditMembership, normalizedInviteEmail, props.directory.team.id, props.searchMemberCandidates, trimmedInviteEmail]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        props.onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [props.onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={props.onClose}>
      <div className="modal-panel team-directory-modal" role="dialog" aria-modal="true" aria-label={`${props.directory.team.name} people`} onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>{props.directory.team.name}</h2>
            <p>
              Everyone who has joined this team so far.
              {props.directory.team.archived ? " Archived teams are read-only." : ""}
            </p>
          </div>
          <div className="team-row-actions">
            {canManageMembers ? (
              <button
                className="secondary-button"
                type="button"
                disabled={props.isBusy}
                onClick={() => {
                  const nextArchived = !props.directory.team.archived;
                  const confirmed = window.confirm(
                    nextArchived
                      ? `Archive "${props.directory.team.name}"? This will move the team to the bottom of every list, keep the full board and history readable, and make the team read-only until it is unarchived.`
                      : `Unarchive "${props.directory.team.name}"? This will make the team active and editable again.`
                  );
                  if (confirmed) {
                    void props.onToggleArchive(props.directory.team.id, nextArchived);
                  }
                }}
              >
                {props.directory.team.archived ? "Unarchive team" : "Archive team"}
              </button>
            ) : null}
            <button className="secondary-button" type="button" onClick={props.onClose}>
              Close
            </button>
          </div>
        </div>
        {canManageMembers ? (
          <div className="directory-admin-tabs" role="tablist" aria-label="Team admin sections">
            <button className={activeAdminTab === "people" ? "history-tab active" : "history-tab"} type="button" role="tab" aria-selected={activeAdminTab === "people"} onClick={() => setActiveAdminTab("people")}>
              People
            </button>
            <button className={activeAdminTab === "import-export" ? "history-tab active" : "history-tab"} type="button" role="tab" aria-selected={activeAdminTab === "import-export"} onClick={() => setActiveAdminTab("import-export")}>
              Import/export
            </button>
          </div>
        ) : null}
        <div className="modal-scroll-body">
        {canManageMembers && activeAdminTab === "people" ? (
          <div className="directory-admin-panel">
            {canEditMembership ? (
              <form
                className="directory-invite-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!canSubmitInvite) {
                    return;
                  }
                  const inviteTargetEmail = selectedCandidate?.email ?? trimmedInviteEmail;
                  void props.onAddMember(props.directory.team.id, inviteTargetEmail).then((result) => {
                    setInviteEmail("");
                    setSelectedCandidateId(null);
                    setMemberCandidates([]);
                    setMemberCredentialReveal(null);
                    if (result.invitationDelivery === "manual-share" && result.temporaryPassword && result.secureSaveReminder) {
                      setLatestCredentialReveal({
                        heading: "Share this generated password manually",
                        email: inviteTargetEmail,
                        password: result.temporaryPassword,
                        reminder: result.secureSaveReminder
                      });
                      return;
                    }
                    setLatestCredentialReveal(null);
                  });
                }}
              >
                <label>
                  Add or invite by email
                  <input
                    value={inviteEmail}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setInviteEmail(nextValue);
                      if (selectedCandidate && nextValue.trim().toLowerCase() !== selectedCandidate.email.toLowerCase()) {
                        setSelectedCandidateId(null);
                      }
                    }}
                    placeholder="person@company.com"
                  />
                </label>
                <button className="primary-button" type="submit" disabled={props.isBusy || !canSubmitInvite}>
                  Add to team
                </button>
              </form>
            ) : (
              <div className="directory-readonly-note">Membership actions are disabled while this team is archived.</div>
            )}
            {memberCandidates.length > 0 ? (
              <div className="directory-member-candidates">
                <strong>Existing platform users</strong>
                {memberCandidates.map((candidate) => (
                  <button
                    key={candidate.id}
                    className={selectedCandidateId === candidate.id ? "directory-candidate-button active" : "directory-candidate-button"}
                    type="button"
                    disabled={props.isBusy}
                    onClick={() => {
                      setSelectedCandidateId(candidate.id);
                      setInviteEmail(candidate.email);
                    }}
                  >
                    <span>{candidate.displayName}</span>
                    <small>{candidate.email}</small>
                  </button>
                ))}
              </div>
            ) : null}
            {latestCredentialReveal ? (
              <div className="directory-generated-password-card" role="status" aria-live="polite">
                <strong>{latestCredentialReveal.heading}</strong>
                <div>{latestCredentialReveal.email}</div>
                <code data-testid="credential-password">{latestCredentialReveal.password}</code>
                <p>{latestCredentialReveal.reminder}</p>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => {
                    setLatestCredentialReveal(null);
                    props.onDismissCredentialReveal?.();
                  }}
                >
                  Dismiss
                </button>
              </div>
            ) : null}
            <div className="directory-pending-requests">
              <h3>Pending join requests</h3>
              {props.directory.pendingJoinRequests.length === 0 ? <p>No pending requests.</p> : null}
              {props.directory.pendingJoinRequests.map((request) => (
                <div key={request.id} className="directory-row">
                  <div className="directory-row-main">
                    <strong>{request.requester.displayName}</strong>
                    <span>{request.requester.email}</span>
                  </div>
                  <div className="team-row-actions">
                    <button
                      className="ghost-button"
                      type="button"
                      disabled={!canEditMembership || props.isBusy}
                      onClick={() => void props.onDenyJoinRequest(props.directory.team.id, request.id)}
                    >
                      Deny
                    </button>
                    <button
                      className="primary-button"
                      type="button"
                      disabled={!canEditMembership || props.isBusy}
                      onClick={() => void props.onAdmitJoinRequest(props.directory.team.id, request.id)}
                    >
                      Admit
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {canManageMembers && activeAdminTab === "import-export" ? (
          <div className="directory-admin-panel">
            <div className="directory-pending-requests">
              <h3>Jira Cloud issue import</h3>
              <label>
                Jira project key
                <input value={jiraProjectKey} disabled={!canEditMembership || props.isBusy} onChange={(event) => setJiraProjectKey(event.target.value)} placeholder="SFM" />
              </label>
              <label>
                Optional JQL
                <textarea
                  value={jiraJql}
                  disabled={!canEditMembership || props.isBusy}
                  onChange={(event) => setJiraJql(event.target.value)}
                  placeholder='statusCategory != Done ORDER BY Rank ASC'
                  rows={3}
                />
              </label>
              <div className="team-row-actions">
                <button
                  className="secondary-button"
                  type="button"
                  disabled={!canEditMembership || props.isBusy || !jiraProjectKey.trim()}
                  onClick={() => void props.onSaveJiraSettings(props.directory.team.id, jiraProjectKey.trim(), jiraJql)}
                >
                  Save Jira settings
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={!canEditMembership || props.isBusy || !jiraProjectKey.trim()}
                  onClick={() => void props.onImportJiraIssues(props.directory.team.id)}
                >
                  Import or refresh Jira issues
                </button>
              </div>
              {pendingIssues.length === 0 ? <p>No imported Jira issues are pending in this team.</p> : null}
              {pendingIssues.map((issue) => (
                <div key={issue.id} className="directory-row directory-row-wrap">
                  <div className="directory-row-main">
                    <strong>{issue.issueKey}</strong>
                    <span>{issue.title}</span>
                  </div>
                  <div className="team-row-actions">
                    <button
                      className="primary-button"
                      type="button"
                      disabled={props.isBusy || props.directory.team.archived}
                      onClick={() => void props.onLoadPendingIssue(props.directory.team.id, issue.id)}
                    >
                      Load for voting
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="directory-pending-requests">
              <h3>History import and export</h3>
              <label className="settings-toggle-row">
                <input type="checkbox" checked={includeCommentsOnExport} onChange={(event) => setIncludeCommentsOnExport(event.target.checked)} />
                <span>Include comments when exporting this team</span>
              </label>
              <div className="team-row-actions">
                <button className="secondary-button" type="button" disabled={props.isBusy} onClick={() => void props.onExportTeamHistory(props.directory.team.id, includeCommentsOnExport)}>
                  Export team history
                </button>
              </div>
              <label>
                Import team history package
                <input type="file" accept="application/json,.json" disabled={!canEditMembership || props.isBusy} onChange={(event) => setTeamImportFile(event.target.files?.[0] ?? null)} />
              </label>
              <button
                className="secondary-button"
                type="button"
                disabled={!canEditMembership || props.isBusy || !teamImportFile}
                onClick={() => {
                  if (!teamImportFile) {
                    return;
                  }
                  void props.onImportTeamHistory(props.directory.team.id, teamImportFile).then(() => setTeamImportFile(null));
                }}
              >
                Import into this team
              </button>
            </div>
          </div>
        ) : null}
        {!canManageMembers || activeAdminTab === "people" ? (
          <div className="directory-list">
            {props.directory.members.map((member) => {
              const memberIsActiveOnBoard = activeParticipantIds.has(member.id);
              return (
                <div key={member.id} className="directory-row">
                  <div className="directory-row-main">
                    <strong>
                      {member.displayName}
                      {member.role === "team_admin" ? <span className="team-state-chip admin">Admin</span> : null}
                    </strong>
                    <span>{member.email}</span>
                  </div>
                  <div className="team-row-actions">
                    <span className={memberIsActiveOnBoard ? "presence-chip onboard" : "presence-chip offline"}>
                      {memberIsActiveOnBoard ? "Onboard" : "Not online"}
                    </span>
                    {canManageMembers && member.id !== props.directory.currentUserId && member.role !== "team_admin" ? (
                      <button
                        className="ghost-button"
                        type="button"
                        disabled={!canEditMembership || props.isBusy}
                        onClick={() => void props.onPromoteMember(props.directory.team.id, member.id)}
                      >
                        Promote
                      </button>
                    ) : null}
                    {props.directory.currentUserIsSuperAdmin && member.role === "team_admin" && member.id !== props.directory.currentUserId ? (
                      <button
                        className="ghost-button"
                        type="button"
                        disabled={!canEditMembership || props.isBusy}
                        onClick={() => void props.onDemoteMember(props.directory.team.id, member.id)}
                      >
                        Demote
                      </button>
                    ) : null}
                    {canManageMembers && member.id !== props.directory.currentUserId ? (
                      <button
                        className="ghost-button"
                        type="button"
                        title={memberIsActiveOnBoard ? "Reset is disabled while this member is currently on the board." : undefined}
                        disabled={!canEditMembership || props.isBusy || memberIsActiveOnBoard}
                        onClick={() =>
                          void props.onResetMemberPassword(props.directory.team.id, member.id).then((result) => {
                            if (result.temporaryPassword && result.secureSaveReminder) {
                              setLatestCredentialReveal(null);
                              setMemberCredentialReveal({
                                userId: member.id,
                                heading: "Share this replacement password manually",
                                email: member.email,
                                password: result.temporaryPassword,
                                reminder: result.secureSaveReminder
                              });
                            } else {
                              setMemberCredentialReveal(null);
                            }
                          })
                        }
                      >
                        Reset password
                      </button>
                    ) : null}
                    {canManageMembers &&
                    member.id !== props.directory.currentUserId &&
                    (props.directory.currentUserIsSuperAdmin || member.role !== "team_admin") ? (
                      <button
                        className="ghost-button"
                        type="button"
                        disabled={!canEditMembership || props.isBusy}
                        onClick={() => void props.onRemoveMember(props.directory.team.id, member.id)}
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                  {memberCredentialReveal?.userId === member.id ? (
                    <div className="directory-generated-password-card directory-member-password-card" role="status" aria-live="polite">
                      <strong>{memberCredentialReveal.heading}</strong>
                      <div>{memberCredentialReveal.email}</div>
                      <code data-testid="credential-password">{memberCredentialReveal.password}</code>
                      <p>{memberCredentialReveal.reminder}</p>
                      <button className="ghost-button" type="button" onClick={() => setMemberCredentialReveal(null)}>
                        Dismiss
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
        </div>
      </div>
    </div>
  );
}
