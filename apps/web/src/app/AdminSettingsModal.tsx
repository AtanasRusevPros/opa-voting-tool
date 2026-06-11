// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { AccountDeletionPreview, AdminConfigSaveResult, AdminConfigView, AdminSettingsTab, BrandingAssetSlot, PlatformAccessRequestActionResponse, PlatformAccessRequestSummary, PlatformPeopleResponse, PlatformPeopleSort, PlatformUserSummary, TeamMemberPasswordResetResponse } from "./types";
import { EyeIcon } from "./icons";
import { formatHistoryDisplay } from "./utils";
import { AccountDeletionDialog } from "./AccountDeletionDialog";

function normalizeAdminConfigView(config: AdminConfigView): AdminConfigView {
  return {
    ...config,
    jira: {
      clientId: config.jira?.clientId ?? "",
      clientSecretConfigured: config.jira?.clientSecretConfigured ?? false,
      connected: config.jira?.connected ?? false,
      siteUrl: config.jira?.siteUrl ?? null,
      siteName: config.jira?.siteName ?? null,
      cloudId: config.jira?.cloudId ?? null,
      pendingSites: config.jira?.pendingSites ?? []
    }
  };
}

function formatConfigSaveStatus(result: AdminConfigSaveResult): string {
  if (result.restartRequiredFields.length > 0) {
    return `Saved. Applied immediately: ${result.appliedFields.join(", ") || "none"}. Restart required for: ${result.restartRequiredFields.join(", ")}.`;
  }
  return `Saved and applied immediately: ${result.appliedFields.join(", ") || "no field changes were needed"}.`;
}

export function AdminSettingsModal(props: {
  open: boolean;
  onClose: () => void;
  onConfigApplied: (result: AdminConfigSaveResult) => Promise<void> | void;
  loadConfig: () => Promise<AdminConfigView>;
  loadPeople: (options?: { offset?: number; sort?: PlatformPeopleSort; q?: string }) => Promise<PlatformPeopleResponse>;
  admitAccessRequest: (request: PlatformAccessRequestSummary) => Promise<PlatformAccessRequestActionResponse>;
  denyAccessRequest: (requestId: string) => Promise<void>;
  resetPlatformUserPassword: (userId: string) => Promise<TeamMemberPasswordResetResponse>;
  loadPlatformUserDeletionPreview?: (userId: string) => Promise<AccountDeletionPreview>;
  deletePlatformUser?: (userId: string, confirmation: string, impactToken: string) => Promise<void>;
  saveConfig: (patch: Record<string, unknown>) => Promise<AdminConfigSaveResult>;
  revealSecret: (field: "admin.password" | "smtp.pass" | "jira.clientSecret") => Promise<string>;
  uploadBrandingAsset: (slot: BrandingAssetSlot, file: File) => Promise<AdminConfigSaveResult>;
  exportWholeDatabase: () => Promise<void>;
  importWholeDatabase: (file: File) => Promise<void>;
  startJiraOAuth: () => Promise<string>;
  selectJiraSite: (cloudId: string) => Promise<AdminConfigView>;
  disconnectJira: () => Promise<AdminConfigView>;
  peopleRefreshTick: number;
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminSettingsTab>("people");
  const [config, setConfig] = useState<AdminConfigView | null>(null);
  const [draft, setDraft] = useState<AdminConfigView | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [adminPasswordValue, setAdminPasswordValue] = useState("");
  const [adminPasswordDirty, setAdminPasswordDirty] = useState(false);
  const [adminPasswordVisible, setAdminPasswordVisible] = useState(false);
  const [adminPasswordLoading, setAdminPasswordLoading] = useState(false);
  const [smtpPasswordValue, setSmtpPasswordValue] = useState("");
  const [smtpPasswordDirty, setSmtpPasswordDirty] = useState(false);
  const [smtpPasswordVisible, setSmtpPasswordVisible] = useState(false);
  const [smtpPasswordLoading, setSmtpPasswordLoading] = useState(false);
  const [jiraClientSecretValue, setJiraClientSecretValue] = useState("");
  const [jiraClientSecretDirty, setJiraClientSecretDirty] = useState(false);
  const [accessRequests, setAccessRequests] = useState<PlatformAccessRequestSummary[]>([]);
  const [people, setPeople] = useState<PlatformUserSummary[]>([]);
  const [peopleQuery, setPeopleQuery] = useState("");
  const [peopleSort, setPeopleSort] = useState<PlatformPeopleSort>("recent");
  const [peopleNextOffset, setPeopleNextOffset] = useState<number | null>(null);
  const [peopleLoadingMore, setPeopleLoadingMore] = useState(false);
  const [credentialReveal, setCredentialReveal] = useState<{
    heading: string;
    email: string;
    password: string;
    reminder: string;
  } | null>(null);
  const [databaseImportFile, setDatabaseImportFile] = useState<File | null>(null);
  const [deletionPreview, setDeletionPreview] = useState<AccountDeletionPreview | null>(null);
  const [deletionConfirmation, setDeletionConfirmation] = useState("");

  const updateDraft = (updater: (current: AdminConfigView) => AdminConfigView) => {
    setDraft((current) => (current ? updater(current) : current));
  };

  const loadPeopleData = useCallback(async (options?: { reset?: boolean; offset?: number; sort?: PlatformPeopleSort; q?: string }) => {
    const response = await props.loadPeople({
      offset: options?.offset ?? 0,
      sort: options?.sort ?? peopleSort,
      q: options?.q ?? peopleQuery
    });
    setAccessRequests(response.requests);
    setPeople((current) => (options?.reset === false ? [...current, ...response.users] : response.users));
    setPeopleNextOffset(response.nextOffset ?? null);
    return response;
  }, [peopleQuery, peopleSort, props.loadPeople]);

  useEffect(() => {
    if (!props.open) {
      return;
    }

    let cancelled = false;
    setLoading(true);
    setActiveTab("people");
    setErrorText(null);
    setStatusText(null);
    setCredentialReveal(null);
    setDeletionPreview(null);
    setDeletionConfirmation("");
    setPeopleQuery("");
    setPeopleSort("recent");
    setPeopleNextOffset(null);

    void Promise.all([props.loadConfig(), props.loadPeople({ offset: 0, sort: "recent", q: "" })])
      .then(([response, peopleResponse]) => {
        if (cancelled) {
          return;
        }
        const normalizedResponse = normalizeAdminConfigView(response);
        setConfig(normalizedResponse);
        setDraft(normalizedResponse);
        setAccessRequests(peopleResponse.requests);
        setPeople(peopleResponse.users);
        setPeopleNextOffset(peopleResponse.nextOffset ?? null);
        setAdminPasswordValue("");
        setAdminPasswordDirty(false);
        setAdminPasswordVisible(false);
        setSmtpPasswordValue("");
        setSmtpPasswordDirty(false);
        setSmtpPasswordVisible(false);
        setJiraClientSecretValue("");
        setJiraClientSecretDirty(false);
      })
      .catch((error) => {
        if (!cancelled) {
          setErrorText((error as Error).message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [props.loadConfig, props.loadPeople, props.open]);

  useEffect(() => {
    if (!props.open) {
      return;
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== "jira-oauth-complete") {
        return;
      }

      setStatusText(typeof event.data?.message === "string" ? event.data.message : "Jira Cloud authorization completed.");
      setErrorText(null);
      void props
        .loadConfig()
        .then((response) => {
          const normalizedResponse = normalizeAdminConfigView(response);
          setConfig(normalizedResponse);
          setDraft(normalizedResponse);
          setJiraClientSecretValue("");
          setJiraClientSecretDirty(false);
        })
        .catch((error) => {
          setErrorText((error as Error).message);
        });
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [props.loadConfig, props.open]);

  useEffect(() => {
    if (!props.open) {
      return;
    }

    void loadPeopleData({ reset: true }).catch((error) => {
      setErrorText((error as Error).message);
    });
  }, [loadPeopleData, props.open, props.peopleRefreshTick]);

  useEffect(() => {
    if (!props.open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        props.onClose();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [props.onClose, props.open]);

  useEffect(() => {
    if (!props.open || activeTab !== "people") {
      return;
    }
    void loadPeopleData({ reset: true }).catch((error) => {
      setErrorText((error as Error).message);
    });
  }, [activeTab, loadPeopleData, peopleQuery, peopleSort, props.open]);

  if (!props.open) {
    return null;
  }

  const toggleSecretVisibility = async (field: "admin.password" | "smtp.pass") => {
    if (field === "admin.password") {
      if (adminPasswordVisible) {
        setAdminPasswordVisible(false);
        return;
      }
      if (!adminPasswordDirty && !adminPasswordValue && config?.admin.passwordConfigured) {
        setAdminPasswordLoading(true);
        setErrorText(null);
        try {
          const value = await props.revealSecret(field);
          setAdminPasswordValue(value);
        } catch (error) {
          setErrorText((error as Error).message);
          return;
        } finally {
          setAdminPasswordLoading(false);
        }
      }
      setAdminPasswordVisible(true);
      return;
    }

    if (smtpPasswordVisible) {
      setSmtpPasswordVisible(false);
      return;
    }
    if (!smtpPasswordDirty && !smtpPasswordValue && config?.smtp.passConfigured) {
      setSmtpPasswordLoading(true);
      setErrorText(null);
      try {
        const value = await props.revealSecret(field);
        setSmtpPasswordValue(value);
      } catch (error) {
        setErrorText((error as Error).message);
        return;
      } finally {
        setSmtpPasswordLoading(false);
      }
    }
    setSmtpPasswordVisible(true);
  };

  const handleUploadAsset = async (slot: BrandingAssetSlot, file: File | null) => {
    if (!file) {
      return;
    }
    try {
      setSaving(true);
      setErrorText(null);
      setStatusText(`Uploading ${slot}...`);
      const result = await props.uploadBrandingAsset(slot, file);
      const normalizedConfig = normalizeAdminConfigView(result.config);
      setConfig(normalizedConfig);
      setDraft(normalizedConfig);
      setStatusText(formatConfigSaveStatus(result));
      await props.onConfigApplied(result);
    } catch (error) {
      setErrorText((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleAdmitAccessRequest = async (request: PlatformAccessRequestSummary) => {
    try {
      setSaving(true);
      setErrorText(null);
      const response = await props.admitAccessRequest(request);
      await loadPeopleData();
      if (response.temporaryPassword && response.secureSaveReminder) {
        setCredentialReveal({
          heading: "Share this generated password manually",
          email: request.email,
          password: response.temporaryPassword,
          reminder: response.secureSaveReminder
        });
      } else {
        setCredentialReveal(null);
      }
      setStatusText(
        response.invitationDelivery === "smtp"
          ? "Access request admitted. The same generated password was also sent through SMTP."
          : "Access request admitted. Share the generated password manually."
      );
    } catch (error) {
      setErrorText((error as Error).message);
      await loadPeopleData().catch(() => undefined);
    } finally {
      setSaving(false);
    }
  };

  const handleDenyAccessRequest = async (requestId: string) => {
    try {
      setSaving(true);
      setErrorText(null);
      await props.denyAccessRequest(requestId);
      await loadPeopleData();
      setStatusText("Access request denied.");
    } catch (error) {
      setErrorText((error as Error).message);
      await loadPeopleData().catch(() => undefined);
    } finally {
      setSaving(false);
    }
  };

  const handleResetPlatformPassword = async (user: PlatformUserSummary) => {
    try {
      setSaving(true);
      setErrorText(null);
      const response = await props.resetPlatformUserPassword(user.id);
      if (response.temporaryPassword && response.secureSaveReminder) {
        setCredentialReveal({
          heading: "Share this replacement password manually",
          email: user.email,
          password: response.temporaryPassword,
          reminder: response.secureSaveReminder
        });
      } else {
        setCredentialReveal(null);
      }
      setStatusText(
        response.passwordDelivery === "smtp"
          ? "Replacement password generated and sent through SMTP."
          : "Replacement password generated. Save it somewhere secure before sharing it manually."
      );
      await loadPeopleData();
    } catch (error) {
      setErrorText((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleReviewPlatformUserDeletion = async (user: PlatformUserSummary) => {
    if (!props.loadPlatformUserDeletionPreview) {
      return;
    }
    try {
      setSaving(true);
      setErrorText(null);
      setDeletionConfirmation("");
      setDeletionPreview(await props.loadPlatformUserDeletionPreview(user.id));
    } catch (error) {
      setErrorText((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePlatformUser = async () => {
    if (!deletionPreview || !props.deletePlatformUser) {
      return;
    }
    try {
      setSaving(true);
      setErrorText(null);
      await props.deletePlatformUser(deletionPreview.targetUserId, deletionConfirmation, deletionPreview.impactToken);
      const deletedEmail = deletionPreview.email;
      setDeletionPreview(null);
      setDeletionConfirmation("");
      await loadPeopleData();
      setStatusText(`Deleted the account for ${deletedEmail}.`);
    } catch (error) {
      setErrorText((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleLoadMorePeople = async () => {
    if (peopleLoadingMore || peopleNextOffset == null) {
      return;
    }
    try {
      setPeopleLoadingMore(true);
      setErrorText(null);
      await loadPeopleData({ reset: false, offset: peopleNextOffset });
    } catch (error) {
      setErrorText((error as Error).message);
    } finally {
      setPeopleLoadingMore(false);
    }
  };

  const handleSave = async () => {
    if (!draft) {
      return;
    }
    try {
      setSaving(true);
      setErrorText(null);
      const patch: Record<string, unknown> = {
        app: {
          baseUrl: draft.app.baseUrl
        },
        admin: {
          username: draft.admin.username,
          displayName: draft.admin.displayName,
          ...(adminPasswordDirty ? { password: adminPasswordValue } : {})
        },
        smtp: {
          host: draft.smtp.host,
          port: draft.smtp.port,
          user: draft.smtp.user,
          from: draft.smtp.from,
          ...(smtpPasswordDirty ? { pass: smtpPasswordValue } : {})
        },
        jira: {
          clientId: draft.jira.clientId,
          ...(jiraClientSecretDirty ? { clientSecret: jiraClientSecretValue } : {})
        },
        branding: {
          backgroundOpacity: draft.branding.backgroundOpacity,
          footerCreatorText: draft.branding.footerCreatorText,
          footerCompanyText: draft.branding.footerCompanyText,
          palette: {
            primaryAction: draft.branding.palette.primaryAction,
            accentHighlight: draft.branding.palette.accentHighlight,
            surfaceTint: draft.branding.palette.surfaceTint,
            textEmphasis: draft.branding.palette.textEmphasis
          }
        },
        demo: {
          enabled: draft.demo.enabled
        }
      };
      const result = await props.saveConfig(patch);
      const normalizedConfig = normalizeAdminConfigView(result.config);
      setConfig(normalizedConfig);
      setDraft(normalizedConfig);
      setAdminPasswordValue("");
      setAdminPasswordDirty(false);
      setAdminPasswordVisible(false);
      setSmtpPasswordValue("");
      setSmtpPasswordDirty(false);
      setSmtpPasswordVisible(false);
      setJiraClientSecretDirty(false);
      setJiraClientSecretValue("");
      setStatusText(formatConfigSaveStatus(result));
      await props.onConfigApplied(result);
    } catch (error) {
      setErrorText((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const tabs: Array<{ key: AdminSettingsTab; label: string }> = [
    { key: "people", label: "People" },
    { key: "branding", label: "Branding" },
    { key: "app", label: "App settings" },
    { key: "smtp", label: "SMTP" },
    { key: "super-admin", label: "Super-admin" }
  ];

  return createPortal(
    <div className="admin-settings-backdrop" role="presentation" onClick={props.onClose}>
      <div className="admin-settings-modal" role="dialog" aria-modal="true" aria-label="Platform settings" onClick={(event) => event.stopPropagation()}>
        <div className="admin-settings-header">
          <h2>Platform settings</h2>
        </div>

        <div className="admin-settings-tabs" role="tablist" aria-label="Platform settings sections">
          <div className="admin-settings-tab-row">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                className={activeTab === tab.key ? "admin-settings-tab active" : "admin-settings-tab"}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.key}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="admin-settings-top-actions">
            <button className="primary-button" type="button" disabled={loading || saving || !draft} onClick={() => void handleSave()}>
              {saving ? "Saving..." : "Save settings"}
            </button>
            <button className="ghost-button admin-settings-close" type="button" onClick={props.onClose}>
              Close
            </button>
          </div>
        </div>

        <div className="admin-settings-feedback" aria-live="polite">
          {loading || !draft ? <div className="info-banner">Loading settings...</div> : null}
          {errorText ? <div className="error-banner">{errorText}</div> : null}
          {statusText ? <div className="info-banner">{statusText}</div> : null}
        </div>

        {draft ? (
          <div className="admin-settings-grid">
            {activeTab === "people" ? (
              <section className="admin-settings-section admin-settings-section-wide">
                <h3>People</h3>
                {credentialReveal ? (
                  <div className="credential-overlay" role="presentation">
                    <div className="directory-generated-password-card credential-overlay-card" role="status" aria-live="polite">
                      <strong>{credentialReveal.heading}</strong>
                      <div>{credentialReveal.email}</div>
                      <code data-testid="admin-credential-password">{credentialReveal.password}</code>
                      <p>{credentialReveal.reminder}</p>
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={() => {
                          setCredentialReveal(null);
                          setStatusText(null);
                        }}
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                ) : null}
                <div className="directory-pending-requests">
                  <h4>Pending access requests</h4>
                  {accessRequests.length === 0 ? <p>No pending platform access requests.</p> : null}
                  {accessRequests.map((request) => (
                    <div key={request.id} className="directory-row directory-row-wrap">
                      <div className="directory-row-main">
                        <strong>{request.email}</strong>
                        <span>Requested {formatHistoryDisplay(request.createdAt).heading}</span>
                      </div>
                      <div className="team-row-actions">
                        <button className="ghost-button" type="button" disabled={saving} onClick={() => void handleDenyAccessRequest(request.id)}>
                          Deny
                        </button>
                        <button className="primary-button" type="button" disabled={saving} onClick={() => void handleAdmitAccessRequest(request)}>
                          Admit
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="directory-pending-requests">
                  <h4>Existing users</h4>
                  <div className="admin-settings-people-toolbar">
                    <label>
                      Search
                      <input
                        value={peopleQuery}
                        onChange={(event) => setPeopleQuery(event.target.value)}
                        placeholder="2+ letters"
                      />
                    </label>
                    <label>
                      Sort
                      <select value={peopleSort} onChange={(event) => setPeopleSort(event.target.value as PlatformPeopleSort)}>
                        <option value="recent">Recently updated</option>
                        <option value="oldest">Oldest updated first</option>
                        <option value="alpha">Alphabetical A-Z</option>
                        <option value="alpha-desc">Alphabetical Z-A</option>
                      </select>
                    </label>
                  </div>
                  <div
                    className="admin-settings-scroll-list"
                    onScroll={(event) => {
                      const currentTarget = event.currentTarget;
                      if (currentTarget.scrollHeight - currentTarget.scrollTop - currentTarget.clientHeight < 48) {
                        void handleLoadMorePeople();
                      }
                    }}
                  >
                    {people.length === 0 ? <p>No admitted users yet.</p> : null}
                    {people.map((user) => (
                      <div key={user.id} className="directory-row directory-row-wrap">
                        <div className="directory-row-main">
                          <strong>{user.displayName}</strong>
                          <span>{user.email}</span>
                          <span>
                            Updated {formatHistoryDisplay(user.updatedAt).heading} • Created {formatHistoryDisplay(user.createdAt).heading}
                          </span>
                        </div>
                        <div className="team-row-actions">
                          <button className="ghost-button" type="button" disabled={saving} onClick={() => void handleResetPlatformPassword(user)}>
                            Reset password
                          </button>
                          {props.loadPlatformUserDeletionPreview && props.deletePlatformUser ? (
                            <button className="danger-button" type="button" disabled={saving} onClick={() => void handleReviewPlatformUserDeletion(user)}>
                              Delete account
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                    {peopleLoadingMore ? <p>Loading more users...</p> : null}
                    {peopleNextOffset != null ? (
                      <button className="secondary-button wide" type="button" disabled={peopleLoadingMore || saving} onClick={() => void handleLoadMorePeople()}>
                        Load more users
                      </button>
                    ) : null}
                  </div>
                </div>
              </section>
            ) : null}

            {activeTab === "branding" ? (
              <section className="admin-settings-section admin-settings-section-wide">
                <h3>Branding</h3>
                <div className="branding-upload-grid">
                  {([
                    ["loginLogo", "Login logo"],
                    ["loginBackground", "Login background"],
                    ["teamLogo", "Team logo"],
                    ["teamBackground", "Team background"]
                  ] as Array<[BrandingAssetSlot, string]>).map(([slot, label]) => (
                    <label key={slot} className="branding-upload-card">
                      <span>{label}</span>
                      <img src={draft.branding[slot]} alt="" />
                      <input
                        type="file"
                        accept=".svg,.png,.jpg,.jpeg,.webp,image/svg+xml,image/png,image/jpeg,image/webp"
                        disabled={saving}
                        onChange={(event) => {
                          void handleUploadAsset(slot, event.target.files?.[0] ?? null);
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                  ))}
                </div>
                <label>
                  Background opacity
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={draft.branding.backgroundOpacity}
                    onChange={(event) =>
                      updateDraft((current) => ({
                        ...current,
                        branding: {
                          ...current.branding,
                          backgroundOpacity: Number(event.target.value)
                        }
                      }))
                    }
                  />
                </label>
                <label>
                  Footer creator text
                  <input
                    value={draft.branding.footerCreatorText}
                    onChange={(event) =>
                      updateDraft((current) => ({
                        ...current,
                        branding: {
                          ...current.branding,
                          footerCreatorText: event.target.value
                        }
                      }))
                    }
                  />
                </label>
                <label>
                  Footer company text
                  <input
                    value={draft.branding.footerCompanyText}
                    onChange={(event) =>
                      updateDraft((current) => ({
                        ...current,
                        branding: {
                          ...current.branding,
                          footerCompanyText: event.target.value
                        }
                      }))
                    }
                  />
                </label>
                <div className="palette-grid">
                  <label>
                    Primary action
                    <input
                      type="color"
                      value={draft.branding.palette.primaryAction}
                      onChange={(event) =>
                        updateDraft((current) => ({
                          ...current,
                          branding: {
                            ...current.branding,
                            palette: {
                              ...current.branding.palette,
                              primaryAction: event.target.value
                            }
                          }
                        }))
                      }
                    />
                  </label>
                  <label>
                    Accent
                    <input
                      type="color"
                      value={draft.branding.palette.accentHighlight}
                      onChange={(event) =>
                        updateDraft((current) => ({
                          ...current,
                          branding: {
                            ...current.branding,
                            palette: {
                              ...current.branding.palette,
                              accentHighlight: event.target.value
                            }
                          }
                        }))
                      }
                    />
                  </label>
                  <label>
                    Surface tint
                    <input
                      type="color"
                      value={draft.branding.palette.surfaceTint}
                      onChange={(event) =>
                        updateDraft((current) => ({
                          ...current,
                          branding: {
                            ...current.branding,
                            palette: {
                              ...current.branding.palette,
                              surfaceTint: event.target.value
                            }
                          }
                        }))
                      }
                    />
                  </label>
                  <label>
                    Text emphasis
                    <input
                      type="color"
                      value={draft.branding.palette.textEmphasis}
                      onChange={(event) =>
                        updateDraft((current) => ({
                          ...current,
                          branding: {
                            ...current.branding,
                            palette: {
                              ...current.branding.palette,
                              textEmphasis: event.target.value
                            }
                          }
                        }))
                      }
                    />
                  </label>
                </div>
              </section>
            ) : null}

            {activeTab === "app" ? (
              <>
                <section className="admin-settings-section">
                  <h3>App settings</h3>
                  <label>
                    Base URL
                    <input value={draft.app.baseUrl} onChange={(event) => updateDraft((current) => ({ ...current, app: { ...current.app, baseUrl: event.target.value } }))} />
                  </label>
                  <label>
                    Allowed domains file
                    <input value={draft.app.allowedDomainsPath} readOnly />
                  </label>
                  <label>
                    Deployment config path
                    <input value={draft.app.deploymentConfigPath} readOnly />
                  </label>
                  <label>
                    Managed branding directory
                    <input value={draft.app.managedBrandingDir} readOnly />
                  </label>
                </section>

                <section className="admin-settings-section">
                  <h3>Demo mode</h3>
                  <label className="settings-toggle-row">
                    <input
                      type="checkbox"
                      checked={draft.demo.enabled}
                      onChange={(event) => updateDraft((current) => ({ ...current, demo: { enabled: event.target.checked } }))}
                    />
                    <span>Enable super-admin demo mode</span>
                  </label>
                  <div className="field-hint">When enabled, only the super-admin can see the fixed demo teams and their simulated participants.</div>
                </section>
              </>
            ) : null}

            {activeTab === "smtp" ? (
              <section className="admin-settings-section admin-settings-section-wide">
                <h3>SMTP</h3>
                <label>
                  Host
                  <input value={draft.smtp.host} onChange={(event) => updateDraft((current) => ({ ...current, smtp: { ...current.smtp, host: event.target.value } }))} />
                </label>
                <label>
                  Port
                  <input
                    type="number"
                    value={draft.smtp.port ?? ""}
                    onChange={(event) =>
                      updateDraft((current) => ({
                        ...current,
                        smtp: {
                          ...current.smtp,
                          port: event.target.value ? Number(event.target.value) : null
                        }
                      }))
                    }
                  />
                </label>
                <label>
                  User
                  <input value={draft.smtp.user} onChange={(event) => updateDraft((current) => ({ ...current, smtp: { ...current.smtp, user: event.target.value } }))} />
                </label>
                <label>
                  From address
                  <input value={draft.smtp.from} onChange={(event) => updateDraft((current) => ({ ...current, smtp: { ...current.smtp, from: event.target.value } }))} />
                </label>
                <label>
                  Password
                  <div className="secret-input-row">
                    <input
                      type={smtpPasswordVisible ? "text" : "password"}
                      value={smtpPasswordValue}
                      placeholder={draft.smtp.passConfigured ? "********" : "Not configured"}
                      onChange={(event) => {
                        setSmtpPasswordValue(event.target.value);
                        setSmtpPasswordDirty(true);
                      }}
                    />
                    <button className="ghost-button icon-only" type="button" aria-label="Reveal SMTP password" disabled={smtpPasswordLoading} onClick={() => void toggleSecretVisibility("smtp.pass")}>
                      <EyeIcon />
                    </button>
                  </div>
                </label>
                <div className="field-hint">If SMTP is left incomplete, the dev/log delivery fallback remains active.</div>
              </section>
            ) : null}

        {activeTab === "super-admin" ? (
          <section className="admin-settings-section admin-settings-section-wide">
            <h3>Super-admin</h3>
                <label>
                  Username
                  <input
                    value={draft.admin.username}
                    onChange={(event) => updateDraft((current) => ({ ...current, admin: { ...current.admin, username: event.target.value } }))}
                  />
                </label>
                <label>
                  Display name
                  <input
                    value={draft.admin.displayName}
                    onChange={(event) => updateDraft((current) => ({ ...current, admin: { ...current.admin, displayName: event.target.value } }))}
                  />
                </label>
                <label>
                  Password
                  <div className="secret-input-row">
                    <input
                      type={adminPasswordVisible ? "text" : "password"}
                      value={adminPasswordValue}
                      placeholder={draft.admin.passwordConfigured ? "********" : "Not configured"}
                      onChange={(event) => {
                        setAdminPasswordValue(event.target.value);
                        setAdminPasswordDirty(true);
                      }}
                    />
                    <button className="ghost-button icon-only" type="button" aria-label="Reveal admin password" disabled={adminPasswordLoading} onClick={() => void toggleSecretVisibility("admin.password")}>
                      <EyeIcon />
                    </button>
                  </div>
                </label>
                <div className="field-hint">Leave the masked value unchanged to preserve the current secret. Re-enter only when changing it.</div>
                <div className="directory-pending-requests">
                  <h4>Jira Cloud</h4>
                  <label>
                    Client ID
                    <input
                      value={draft.jira.clientId}
                      onChange={(event) => updateDraft((current) => ({ ...current, jira: { ...current.jira, clientId: event.target.value } }))}
                    />
                  </label>
                  <label>
                    Client secret
                    <input
                      type="password"
                      value={jiraClientSecretValue}
                      placeholder={draft.jira.clientSecretConfigured ? "********" : "Not configured"}
                      onChange={(event) => {
                        setJiraClientSecretValue(event.target.value);
                        setJiraClientSecretDirty(true);
                      }}
                    />
                  </label>
                  <div className="field-hint">Leave the masked value unchanged to preserve the current Jira Cloud client secret. Re-enter only when changing it.</div>
                  <div className="field-hint">
                    {draft.jira.connected
                      ? `Connected to ${draft.jira.siteName ?? "Jira Cloud"} (${draft.jira.siteUrl ?? "site URL unavailable"}).`
                      : "No Jira Cloud site connected yet."}
                  </div>
                  {draft.jira.pendingSites.length > 0 ? (
                    <div className="directory-pending-requests">
                      <h4>Select Jira Cloud site</h4>
                      {draft.jira.pendingSites.map((site) => (
                        <div key={site.cloudId} className="directory-row directory-row-wrap">
                          <div className="directory-row-main">
                            <strong>{site.siteName}</strong>
                            <span>{site.siteUrl}</span>
                          </div>
                          <div className="team-row-actions">
                            <button
                              className="primary-button"
                              type="button"
                              disabled={loading || saving}
                              onClick={() => {
                                setSaving(true);
                                setErrorText(null);
                                void props
                                  .selectJiraSite(site.cloudId)
                                  .then((response) => {
                                    const normalizedResponse = normalizeAdminConfigView(response);
                                    setConfig(normalizedResponse);
                                    setDraft(normalizedResponse);
                                    setStatusText(`Connected Jira Cloud site: ${site.siteName}.`);
                                  })
                                  .catch((error) => {
                                    setErrorText((error as Error).message);
                                  })
                                  .finally(() => {
                                    setSaving(false);
                                  });
                              }}
                            >
                              Use this site
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div className="team-row-actions">
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={loading || saving}
                      onClick={() => {
                        setErrorText(null);
                        void props.startJiraOAuth().then((authorizationUrl) => {
                          window.open(authorizationUrl, "jira-cloud-oauth", "popup,width=720,height=780");
                          setStatusText("Continue the Jira Cloud authorization in the popup window.");
                        }).catch((error) => {
                          setErrorText((error as Error).message);
                        });
                      }}
                    >
                      {draft.jira.connected ? "Reconnect Jira Cloud" : "Connect Jira Cloud"}
                    </button>
                    <button
                      className="ghost-button"
                      type="button"
                      disabled={loading || saving || (!draft.jira.connected && draft.jira.pendingSites.length === 0)}
                      onClick={() => {
                        setSaving(true);
                        setErrorText(null);
                        void props
                          .disconnectJira()
                          .then((response) => {
                            const normalizedResponse = normalizeAdminConfigView(response);
                            setConfig(normalizedResponse);
                            setDraft(normalizedResponse);
                            setStatusText("Jira Cloud connection cleared.");
                          })
                          .catch((error) => {
                            setErrorText((error as Error).message);
                          })
                          .finally(() => {
                            setSaving(false);
                          });
                      }}
                    >
                      Disconnect Jira Cloud
                    </button>
                  </div>
                </div>
                <div className="directory-pending-requests">
                  <h4>Database import and export</h4>
                  <div className="field-hint">Whole-database export uses a SQLite snapshot. Import replaces the current runtime database with the selected snapshot.</div>
                  <div className="team-row-actions">
                    <button className="secondary-button" type="button" disabled={loading || saving} onClick={() => void props.exportWholeDatabase()}>
                      Export database snapshot
                    </button>
                  </div>
                  <label>
                    Import SQLite snapshot
                    <input
                      type="file"
                      accept=".sqlite,application/octet-stream"
                      disabled={loading || saving}
                      onChange={(event) => setDatabaseImportFile(event.target.files?.[0] ?? null)}
                    />
                  </label>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={loading || saving || !databaseImportFile}
                    onClick={() => {
                      if (!databaseImportFile) {
                        return;
                      }
                      void props.importWholeDatabase(databaseImportFile).then(() => setDatabaseImportFile(null));
                    }}
                  >
                    Import database snapshot
                  </button>
                </div>
              </section>
            ) : null}
          </div>
        ) : null}
        {deletionPreview ? (
          <AccountDeletionDialog
            preview={deletionPreview}
            busy={saving}
            requirePassword={false}
            password=""
            confirmation={deletionConfirmation}
            errorText={errorText}
            onPasswordChange={() => undefined}
            onConfirmationChange={setDeletionConfirmation}
            onCancel={() => {
              setDeletionPreview(null);
              setDeletionConfirmation("");
              setErrorText(null);
            }}
            onConfirm={() => void handleDeletePlatformUser()}
          />
        ) : null}
      </div>
    </div>,
    document.body
  );
}
