// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useState } from "react";
import {
  AVATAR_COLOR_KEYS,
  AVATAR_COLOR_SWATCHES,
  BRANDING_MANIFEST,
  HISTORY_TIME_ZONE_OPTIONS,
  type CurrentUserSummary,
  type HistoryTimeZoneKey
} from "@planning-poker/shared";
import { CheckIcon, EditPencilIcon, EyeIcon, XIcon } from "./icons";
import { formatTimeZoneOffsetLabel, getAvatarUrl } from "./utils";

export function AccountSettingsModal(props: {
  open: boolean;
  user: CurrentUserSummary;
  historyTimezoneDefaultKeys: readonly HistoryTimeZoneKey[];
  isBusy: boolean;
  onClose: () => void;
  onSaveProfile: (displayName: string, avatarIconKey: string, avatarColorKey: string) => Promise<void>;
  onSaveBoardShortcutsPreference: (enabled: boolean) => Promise<void>;
  onSaveHistoryTimezonePreference: (enabled: boolean, keys?: readonly HistoryTimeZoneKey[] | null) => Promise<void>;
  onChangePassword: (currentPassword: string, newPassword: string, confirmPassword: string) => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState(props.user.displayName);
  const [avatarIconKey, setAvatarIconKey] = useState(props.user.avatarIconKey);
  const [avatarColorKey, setAvatarColorKey] = useState(props.user.avatarColorKey);
  const [boardShortcutsEnabled, setBoardShortcutsEnabled] = useState(props.user.boardShortcutsEnabled ?? true);
  const [historyTimezonePopupEnabled, setHistoryTimezonePopupEnabled] = useState(props.user.historyTimezonePopupEnabled ?? true);
  const [historyTimezoneKeys, setHistoryTimezoneKeys] = useState<HistoryTimeZoneKey[]>(props.user.historyTimezoneKeys ?? [...props.historyTimezoneDefaultKeys]);
  const [historyTimezoneUsesTeamDefault, setHistoryTimezoneUsesTeamDefault] = useState(!props.user.historyTimezoneKeys);
  const [editingDisplayName, setEditingDisplayName] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [currentPasswordVisible, setCurrentPasswordVisible] = useState(false);
  const [newPasswordVisible, setNewPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);

  useEffect(() => {
    if (!props.open) {
      return;
    }
    setDisplayName(props.user.displayName);
    setAvatarIconKey(props.user.avatarIconKey);
    setAvatarColorKey(props.user.avatarColorKey);
    setBoardShortcutsEnabled(props.user.boardShortcutsEnabled ?? true);
    setHistoryTimezonePopupEnabled(props.user.historyTimezonePopupEnabled ?? true);
    setHistoryTimezoneKeys(props.user.historyTimezoneKeys ?? [...props.historyTimezoneDefaultKeys]);
    setHistoryTimezoneUsesTeamDefault(!props.user.historyTimezoneKeys);
    setEditingDisplayName(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setCurrentPasswordVisible(false);
    setNewPasswordVisible(false);
    setConfirmPasswordVisible(false);
  }, [
    props.open,
    props.user.avatarColorKey,
    props.user.avatarIconKey,
    props.user.boardShortcutsEnabled,
    props.user.displayName,
    props.user.historyTimezoneKeys,
    props.user.historyTimezonePopupEnabled,
    props.historyTimezoneDefaultKeys
  ]);

  useEffect(() => {
    if (!props.open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        props.onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [props.onClose, props.open]);

  if (!props.open) {
    return null;
  }

  const canSaveDisplayName = !props.isBusy && displayName.trim().length >= 2 && displayName.trim() !== props.user.displayName;
  const canSaveHistoryTimezoneKeys = !props.isBusy && historyTimezoneKeys.length > 0;
  const canChangePassword =
    !props.isBusy &&
    currentPassword.trim().length >= 8 &&
    newPassword.trim().length >= 8 &&
    confirmPassword.trim().length >= 8 &&
    newPassword === confirmPassword;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={props.onClose}>
      <div className="modal-panel account-settings-modal" role="dialog" aria-modal="true" aria-label="Account settings" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>Account settings</h2>
            <p>Update your visible profile and change your password.</p>
          </div>
          <button className="secondary-button" type="button" onClick={props.onClose}>
            Close
          </button>
        </div>

        <div className="account-settings-grid">
          <form
            className="account-settings-section"
            onSubmit={(event) => {
              event.preventDefault();
              if (!canSaveDisplayName) {
                return;
              }
              void props.onSaveProfile(displayName, avatarIconKey, avatarColorKey).then(() => setEditingDisplayName(false), () => undefined);
            }}
          >
            <h3>Profile</h3>
            <div className="profile-name-edit-row">
              <label>
                Display name
                <input readOnly={!editingDisplayName} value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
              </label>
              {editingDisplayName ? (
                <div className="profile-icon-actions">
                  <button className="secondary-button icon-only" type="submit" aria-label="Save display name" disabled={!canSaveDisplayName}>
                    <CheckIcon />
                  </button>
                  <button
                    className="ghost-button icon-only"
                    type="button"
                    aria-label="Cancel display name edit"
                    disabled={props.isBusy}
                    onClick={() => {
                      setDisplayName(props.user.displayName);
                      setEditingDisplayName(false);
                    }}
                  >
                    <XIcon />
                  </button>
                </div>
              ) : (
                <button className="secondary-button icon-only" type="button" aria-label="Edit display name" disabled={props.isBusy} onClick={() => setEditingDisplayName(true)}>
                  <EditPencilIcon />
                </button>
              )}
            </div>
            <div>
              <span className="label">Avatar icon</span>
              <div className="avatar-picker compact">
                {BRANDING_MANIFEST.avatarIconKeys.map((avatar) => (
                  <button
                    key={avatar}
                    type="button"
                    className={avatar === avatarIconKey ? "avatar-option selected" : "avatar-option"}
                    disabled={props.isBusy}
                    onClick={() => {
                      setAvatarIconKey(avatar);
                      void props.onSaveProfile(displayName.trim(), avatar, avatarColorKey);
                    }}
                  >
                    <img src={getAvatarUrl(avatar, avatarColorKey)} alt={avatar} />
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="label">Avatar color</span>
              <div className="color-picker compact">
                {AVATAR_COLOR_KEYS.map((colorKey) => (
                  <button
                    key={colorKey}
                    type="button"
                    className={colorKey === avatarColorKey ? "color-option selected" : "color-option"}
                    style={{ backgroundColor: AVATAR_COLOR_SWATCHES[colorKey] }}
                    aria-label={colorKey}
                    disabled={props.isBusy}
                    onClick={() => {
                      setAvatarColorKey(colorKey);
                      void props.onSaveProfile(displayName.trim(), avatarIconKey, colorKey);
                    }}
                  />
                ))}
              </div>
            </div>
            <div className="account-settings-inline-toggle">
              <label className="settings-toggle-row">
                <input
                  type="checkbox"
                  checked={boardShortcutsEnabled}
                  disabled={props.isBusy}
                  onChange={(event) => {
                    const nextEnabled = event.target.checked;
                    setBoardShortcutsEnabled(nextEnabled);
                    void props.onSaveBoardShortcutsPreference(nextEnabled);
                  }}
                />
                <span>Enable board action keyboard shortcuts</span>
              </label>
              <label className="settings-toggle-row">
                <input
                  type="checkbox"
                  checked={historyTimezonePopupEnabled}
                  disabled={props.isBusy}
                  onChange={(event) => {
                    const nextEnabled = event.target.checked;
                    setHistoryTimezonePopupEnabled(nextEnabled);
                    void props.onSaveHistoryTimezonePreference(nextEnabled);
                  }}
                />
                <span>Show history time popup</span>
              </label>
            </div>
            <div className="timezone-settings-form account-timezone-settings">
              <div className="timezone-settings-help">
                {historyTimezoneUsesTeamDefault
                  ? "Using the team default time zones until you save a personal list for this team."
                  : "Using your personal time zone list for this team."}
              </div>
              <div className="timezone-settings-options" aria-label="Personal time zones to display">
                {HISTORY_TIME_ZONE_OPTIONS.map((option) => {
                  const checked = historyTimezoneKeys.includes(option.key);
                  return (
                    <label key={option.key} className="timezone-option">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={props.isBusy || (checked && historyTimezoneKeys.length === 1)}
                        onChange={(event) => {
                          const nextKeys = event.target.checked
                            ? Array.from(new Set([...historyTimezoneKeys, option.key]))
                            : historyTimezoneKeys.filter((key) => key !== option.key);
                          setHistoryTimezoneKeys(nextKeys);
                          setHistoryTimezoneUsesTeamDefault(false);
                        }}
                      />
                      <span className="timezone-option-label">{option.label}</span>
                      <span className="timezone-option-offset">{formatTimeZoneOffsetLabel(option.timeZone)}</span>
                    </label>
                  );
                })}
              </div>
              <div className="modal-actions inline-actions">
                <button
                  className="secondary-button"
                  type="button"
                  disabled={!canSaveHistoryTimezoneKeys}
                  onClick={() => {
                    setHistoryTimezoneUsesTeamDefault(false);
                    void props.onSaveHistoryTimezonePreference(historyTimezonePopupEnabled, historyTimezoneKeys);
                  }}
                >
                  Save personal time zones
                </button>
                <button
                  className="ghost-button"
                  type="button"
                  disabled={props.isBusy}
                  onClick={() => {
                    setHistoryTimezoneKeys([...props.historyTimezoneDefaultKeys]);
                    setHistoryTimezoneUsesTeamDefault(true);
                    void props.onSaveHistoryTimezonePreference(historyTimezonePopupEnabled, null);
                  }}
                >
                  Use team default
                </button>
              </div>
            </div>
          </form>

          <form
            className="account-settings-section"
            onSubmit={(event) => {
              event.preventDefault();
              if (!canChangePassword) {
                return;
              }
              void props.onChangePassword(currentPassword, newPassword, confirmPassword).then(
                () => {
                  setCurrentPassword("");
                  setNewPassword("");
                  setConfirmPassword("");
                },
                () => undefined
              );
            }}
          >
            <h3>Password</h3>
            <label>
              Current password
              <div className="secret-input-row">
                <input
                  type={currentPasswordVisible ? "text" : "password"}
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  autoComplete="current-password"
                  placeholder="Current password"
                />
                <button className="ghost-button icon-only" type="button" aria-label="Reveal current password" onClick={() => setCurrentPasswordVisible((current) => !current)}>
                  <EyeIcon />
                </button>
              </div>
            </label>
            <label>
              New password
              <div className="secret-input-row">
                <input
                  type={newPasswordVisible ? "text" : "password"}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  autoComplete="new-password"
                  placeholder="New password"
                />
                <button className="ghost-button icon-only" type="button" aria-label="Reveal new password" onClick={() => setNewPasswordVisible((current) => !current)}>
                  <EyeIcon />
                </button>
              </div>
            </label>
            <label>
              Confirm new password
              <div className="secret-input-row">
                <input
                  type={confirmPasswordVisible ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  placeholder="Confirm new password"
                />
                <button className="ghost-button icon-only" type="button" aria-label="Reveal confirmation password" onClick={() => setConfirmPasswordVisible((current) => !current)}>
                  <EyeIcon />
                </button>
              </div>
            </label>
            <button className="primary-button" type="submit" disabled={!canChangePassword}>
              Change password
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
