// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import { createPortal } from "react-dom";
import type { AccountDeletionPreview } from "./types";

export function AccountDeletionDialog(props: {
  preview: AccountDeletionPreview;
  busy: boolean;
  requirePassword: boolean;
  password: string;
  confirmation: string;
  errorText: string | null;
  onPasswordChange: (value: string) => void;
  onConfirmationChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const purge = props.preview.mode === "purge_trial_workspaces";
  const canConfirm =
    !props.busy &&
    (!props.requirePassword || props.password.trim().length >= 8) &&
    props.confirmation.trim() === props.preview.confirmationPhrase;

  return createPortal(
    <div className="credential-overlay" role="presentation">
      <div className="directory-generated-password-card credential-overlay-card account-deletion-card" role="dialog" aria-modal="true" aria-label="Confirm account deletion">
        <h3>{purge ? "Delete account and public-trial workspace" : "Delete account"}</h3>
        <p>
          {purge
            ? "This permanently deletes every public-trial workspace owned by this account and all teams, voting history, comments, and workspace data inside them."
            : "This removes account access and memberships. Retained voting history and comments remain attributed to the display name with “(Deactivated)” added."}
        </p>
        <dl className="account-deletion-summary">
          <div><dt>Account</dt><dd>{props.preview.displayName} ({props.preview.email})</dd></div>
          <div><dt>Owned public-trial workspaces</dt><dd>{props.preview.ownedPublicTrialWorkspaces.length}</dd></div>
        </dl>
        {props.preview.ownedPublicTrialWorkspaces.map((workspace) => (
          <div key={workspace.id} className="account-deletion-workspace">
            <strong>{workspace.name}</strong>
            <span>{workspace.teamCount} teams • {workspace.memberCount} members • {workspace.historyEntryCount} history entries • {workspace.activeSessionCount} active sessions</span>
          </div>
        ))}
        <p className="account-deletion-note">Existing backups and previously exported files are not rewritten automatically.</p>
        {props.requirePassword ? (
          <label>
            Current password
            <input type="password" autoComplete="current-password" value={props.password} onChange={(event) => props.onPasswordChange(event.target.value)} />
          </label>
        ) : null}
        <label>
          Type <code>{props.preview.confirmationPhrase}</code> to confirm
          <input value={props.confirmation} onChange={(event) => props.onConfirmationChange(event.target.value)} />
        </label>
        {props.errorText ? <div className="error-banner">{props.errorText}</div> : null}
        <div className="modal-actions">
          <button className="ghost-button" type="button" disabled={props.busy} onClick={props.onCancel}>Cancel</button>
          <button className="danger-button" type="button" disabled={!canConfirm} onClick={props.onConfirm}>
            {props.busy ? "Deleting..." : purge ? "Permanently delete account and workspace" : "Delete account"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
