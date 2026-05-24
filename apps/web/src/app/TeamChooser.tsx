// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useMemo, useRef, useState } from "react";
import { BRANDING_MANIFEST, type BrandingManifest, type CurrentUserSummary, type TeamMembershipSummary } from "@planning-poker/shared";
import { LogoutIcon } from "./icons";
import { NotificationBell } from "./NotificationBell";
import { BrandFooter } from "./shared";
import type { NotificationFeedResponse, PlatformAccessRequestActionResponse, PlatformAccessRequestSummary } from "./types";

export function TeamChooser(props: {
  branding?: BrandingManifest;
  user: CurrentUserSummary;
  memberships: TeamMembershipSummary[];
  availableTeams: TeamMembershipSummary[];
  selectedTeamId: string | null;
  onSelectTeam: (teamId: string) => void;
  onCreateTeam: (name: string) => Promise<void>;
  onImportTeam: (file: File, teamName: string) => Promise<unknown> | void;
  onJoinTeam: (teamId: string) => Promise<void>;
  onLeaveTeam: (teamId: string) => Promise<void>;
  onOpenMemberDirectory: (teamId: string) => void | Promise<void>;
  notificationFeed: NotificationFeedResponse | null;
  onOpenNotifications: () => Promise<void>;
  onLoadMoreHistory?: (cursor: string) => Promise<void>;
  onAdmitJoinRequest: (teamId: string, requestId: string) => Promise<void>;
  onDenyJoinRequest: (teamId: string, requestId: string) => Promise<void>;
  onAdmitPlatformAccessRequest: (request: PlatformAccessRequestSummary) => Promise<PlatformAccessRequestActionResponse>;
  onDenyPlatformAccessRequest: (requestId: string) => Promise<void>;
  onOpenAccountSettings: () => void;
  onSignOut: () => Promise<void>;
  onOpenAdminSettings: () => Promise<void> | void;
  chooserMode?: "standalone" | "switcher";
  pendingTargetTeamId?: string | null;
}) {
  const branding = props.branding ?? BRANDING_MANIFEST;
  const [newTeamName, setNewTeamName] = useState("");
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [importTeamOpen, setImportTeamOpen] = useState(false);
  const [importTeamName, setImportTeamName] = useState("");
  const [importTeamFile, setImportTeamFile] = useState<File | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const createTeamRef = useRef<HTMLFormElement | null>(null);
  const importTeamRef = useRef<HTMLFormElement | null>(null);
  const createTeamInputRef = useRef<HTMLInputElement | null>(null);
  const importTeamInputRef = useRef<HTMLInputElement | null>(null);
  const [createTeamError, setCreateTeamError] = useState<string | null>(null);
  const trimmedTeamName = newTeamName.trim();
  const normalizedNewTeamName = trimmedTeamName.toLowerCase();
  const knownTeamNames = useMemo(
    () => new Set([...props.memberships, ...props.availableTeams].map((team) => team.name.trim().toLowerCase())),
    [props.availableTeams, props.memberships]
  );
  const duplicateTeamName = normalizedNewTeamName.length > 0 && knownTeamNames.has(normalizedNewTeamName);
  const duplicateTeamNameMessage = duplicateTeamName ? "A team with this name already exists." : null;
  const canCreateTeam = trimmedTeamName.length >= 5 && !duplicateTeamName;
  const trimmedImportTeamName = importTeamName.trim();
  const canImportTeam = trimmedImportTeamName.length >= 2 && Boolean(importTeamFile);
  const normalizedSearch = searchTerm.trim().toLowerCase();

  const visibleMemberships = useMemo(
    () => props.memberships.filter((team) => !normalizedSearch || team.name.toLowerCase().includes(normalizedSearch)),
    [normalizedSearch, props.memberships]
  );
  const visibleNonMemberTeams = useMemo(
    () =>
      props.availableTeams.filter(
        (team) => team.currentUserRole === "none" && (!normalizedSearch || team.name.toLowerCase().includes(normalizedSearch))
      ),
    [normalizedSearch, props.availableTeams]
  );
  const pendingTargetTeam = useMemo(
    () => props.availableTeams.find((team) => team.id === props.pendingTargetTeamId) ?? null,
    [props.availableTeams, props.pendingTargetTeamId]
  );

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedCreate = createTeamRef.current?.contains(target) ?? false;
      const clickedImport = importTeamRef.current?.contains(target) ?? false;
      if (!clickedCreate && !clickedImport) {
        setCreateTeamOpen(false);
        setImportTeamOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setCreateTeamOpen(false);
        setImportTeamOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    setCreateTeamError(null);
  }, [newTeamName]);

  useEffect(() => {
    if (!createTeamOpen) {
      return;
    }
    window.requestAnimationFrame(() => createTeamInputRef.current?.focus());
  }, [createTeamOpen]);

  useEffect(() => {
    if (!importTeamOpen) {
      return;
    }
    window.requestAnimationFrame(() => importTeamInputRef.current?.focus());
  }, [importTeamOpen]);

  return (
    <div className="chooser-shell">
      <div className="chooser-panel">
        <div className="chooser-header">
          <div className="chooser-header-side chooser-header-brand">
            <img className="chooser-logo" src={branding.teamLogo} alt="" />
            <div>
              <h2>{props.chooserMode === "switcher" ? "Switch team" : "Choose your team"}</h2>
              <p>
                Signed in as {props.user.displayName}
                {props.user.isSuperAdmin ? " (super-admin)" : ""}
              </p>
            </div>
          </div>
          <div className="chooser-header-side chooser-header-actions">
            {props.user.isSuperAdmin ? (
              <button className="secondary-button" type="button" onClick={() => void props.onOpenAdminSettings()}>
                Platform settings
              </button>
            ) : null}
            <button className="secondary-button" type="button" onClick={props.onOpenAccountSettings}>
              Account
            </button>
            <NotificationBell
              feed={props.notificationFeed}
              isBusy={false}
              onOpen={props.onOpenNotifications}
              onLoadMoreHistory={props.onLoadMoreHistory ?? (async () => undefined)}
              onAdmitTeamJoinRequest={props.onAdmitJoinRequest}
              onDenyTeamJoinRequest={props.onDenyJoinRequest}
              onAdmitPlatformAccessRequest={props.onAdmitPlatformAccessRequest}
              onDenyPlatformAccessRequest={props.onDenyPlatformAccessRequest}
            />
            <button className="secondary-button icon-only chooser-signout" type="button" aria-label="Sign out" onClick={() => void props.onSignOut()}>
              <LogoutIcon />
            </button>
          </div>
        </div>
        <BrandFooter branding={branding} />

        <div className="chooser-columns">
          <section className="chooser-card chooser-actions-card">
              <div className="chooser-action-row">
                <button
                  className="secondary-button chooser-create-trigger"
                  type="button"
                  onClick={() => {
                    setCreateTeamOpen((current) => !current);
                    setImportTeamOpen(false);
                  }}
                >
                  Create a team
                </button>
                <button
                  className="secondary-button chooser-create-trigger"
                  type="button"
                  onClick={() => {
                    setImportTeamOpen((current) => !current);
                    setCreateTeamOpen(false);
                  }}
                >
                  Import a team
                </button>
              </div>
              {createTeamOpen ? (
                <form
                  ref={createTeamRef}
                  className="chooser-create-popup chooser-create-popup-inline"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!canCreateTeam) {
                      return;
                    }
                    void props.onCreateTeam(trimmedTeamName).then(
                      () => {
                        setNewTeamName("");
                        setCreateTeamOpen(false);
                        setCreateTeamError(null);
                      },
                      (error) => setCreateTeamError((error as Error).message)
                    );
                  }}
                >
                  <div className="field-hint">Creating a team opens that board immediately.</div>
                  <label>
                    Team title
                    <input
                      ref={createTeamInputRef}
                      value={newTeamName}
                      onChange={(event) => setNewTeamName(event.target.value)}
                      placeholder="Type title (min 5 chars)"
                    />
                  </label>
                  {duplicateTeamNameMessage || createTeamError ? <div className="inline-field-error">{duplicateTeamNameMessage ?? createTeamError}</div> : null}
                  <button className="primary-button wide" type="submit" disabled={!canCreateTeam}>
                    Create and join
                  </button>
                </form>
              ) : null}
              {importTeamOpen ? (
                <form
                  ref={importTeamRef}
                  className="chooser-create-popup chooser-create-popup-inline chooser-import-popup-inline"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!canImportTeam || !importTeamFile) {
                      return;
                    }
                    void props.onImportTeam(importTeamFile, trimmedImportTeamName);
                    setImportTeamName("");
                    setImportTeamFile(null);
                    setImportTeamOpen(false);
                  }}
                >
                  <label>
                    Imported team title
                    <input
                      ref={importTeamInputRef}
                      value={importTeamName}
                      onChange={(event) => setImportTeamName(event.target.value)}
                      placeholder="Imported team title"
                    />
                  </label>
                  <label>
                    Team history package
                    <input
                      type="file"
                      accept="application/json,.json"
                      onChange={(event) => setImportTeamFile(event.target.files?.[0] ?? null)}
                    />
                  </label>
                  <button className="primary-button wide" type="submit" disabled={!canImportTeam}>
                    Import and join
                  </button>
                </form>
              ) : null}
            {pendingTargetTeam ? (
              <div className="field-hint">
                Shared link target: <strong>{pendingTargetTeam.name}</strong>. Request access or wait for approval and the app will take you straight into that board.
              </div>
            ) : null}
          </section>

          <section className="chooser-card">
            <label className="chooser-search">
              <span>Search teams</span>
              <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search by team name" />
            </label>
          </section>

          <section className="chooser-card">
            <h3>Your teams</h3>
            {visibleMemberships.length === 0 ? <p>No joined teams yet.</p> : null}
            {visibleMemberships.map((team) => (
              <div key={team.id} className={props.selectedTeamId === team.id ? "team-tile selected" : "team-tile"}>
                <div className="team-tile-main">
                  <span>
                    {team.name}
                    {team.archived ? <span className="team-state-chip archived">Archived</span> : null}
                    {team.demo ? <span className="team-state-chip demo">Demo</span> : null}
                    {team.currentUserRole === "team_admin" ? <span className="team-state-chip admin">Admin</span> : null}
                  </span>
                  <span>{team.memberCount} members</span>
                </div>
                <div className="team-row-actions">
                  <button className="ghost-button icon-button" onClick={() => props.onOpenMemberDirectory(team.id)} type="button">
                    {props.user.isSuperAdmin || team.currentUserRole === "team_admin" ? "Team admin" : "People"}
                  </button>
                  <button className="primary-button" type="button" onClick={() => props.onSelectTeam(team.id)}>
                    Open
                  </button>
                  {!props.user.isSuperAdmin ? (
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Leave "${team.name}"? You will lose board and history access until you join again.`)) {
                          void props.onLeaveTeam(team.id);
                        }
                      }}
                    >
                      Leave
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </section>

          <section className="chooser-card">
            <h3>Visible teams</h3>
            {visibleNonMemberTeams.length === 0 ? <p>No matching teams.</p> : null}
            {visibleNonMemberTeams.map((team) => {
              const canOpenAsSuperAdmin = props.user.isSuperAdmin;
              return (
                <div key={team.id} className={props.selectedTeamId === team.id ? "team-list-row selected" : "team-list-row"}>
                  <div>
                    <strong>
                      {team.name}
                      {team.archived ? <span className="team-state-chip archived">Archived</span> : null}
                      {team.demo ? <span className="team-state-chip demo">Demo</span> : null}
                      {props.pendingTargetTeamId === team.id ? <span className="team-state-chip linked">Linked</span> : null}
                      {team.joinRequestStatus === "pending" ? <span className="team-state-chip pending">Pending</span> : null}
                    </strong>
                    <div>{team.memberCount} members</div>
                  </div>
                  <div className="team-row-actions">
                    <button className="ghost-button icon-button" onClick={() => props.onOpenMemberDirectory(team.id)} type="button">
                      {props.user.isSuperAdmin || team.currentUserRole === "team_admin" ? "Team admin" : "People"}
                    </button>
                    {canOpenAsSuperAdmin ? (
                      <button className="primary-button" type="button" onClick={() => props.onSelectTeam(team.id)}>
                        Open
                      </button>
                    ) : team.archived ? (
                      <button className="ghost-button" type="button" disabled>
                        Archived
                      </button>
                    ) : team.joinRequestStatus === "pending" ? (
                      <button className="ghost-button" type="button" disabled>
                        Pending
                      </button>
                    ) : (
                      <button className="secondary-button" type="button" onClick={() => void props.onJoinTeam(team.id)}>
                        Request access
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        </div>
      </div>
    </div>
  );
}
