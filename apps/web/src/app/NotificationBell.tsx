// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { NotificationFeedResponse, PlatformAccessRequestActionResponse, PlatformAccessRequestSummary } from "./types";
import { BellIcon } from "./icons";

export function NotificationBell(props: {
  feed: NotificationFeedResponse | null;
  isBusy: boolean;
  onOpen: () => Promise<void>;
  onLoadMoreHistory: (cursor: string) => Promise<void>;
  onAdmitTeamJoinRequest: (teamId: string, requestId: string) => Promise<void>;
  onDenyTeamJoinRequest: (teamId: string, requestId: string) => Promise<void>;
  onAdmitPlatformAccessRequest: (request: PlatformAccessRequestSummary) => Promise<PlatformAccessRequestActionResponse>;
  onDenyPlatformAccessRequest: (requestId: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [credentialReveal, setCredentialReveal] = useState<{
    email: string;
    password: string;
    reminder: string;
  } | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [panelStyle, setPanelStyle] = useState<CSSProperties | null>(null);
  const platformAccessRequests = props.feed?.platformAccessRequests ?? [];
  const pendingJoinRequests = props.feed?.pendingJoinRequests ?? [];
  const activeNotifications = props.feed?.active ?? [];
  const historyNotifications = props.feed?.history ?? [];
  const adminHistory = props.feed?.adminHistory ?? null;
  const historyItems = adminHistory?.items ?? historyNotifications;
  const historyCursor = adminHistory?.nextCursor ?? null;
  const activeCount = activeNotifications.length + pendingJoinRequests.length + platformAccessRequests.length;

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      setPanelStyle(null);
      return;
    }

    const updatePanelStyle = () => {
      const trigger = triggerRef.current;
      if (!trigger) {
        return;
      }

      const triggerRect = trigger.getBoundingClientRect();
      const horizontalInset = 16;
      const panelWidth = Math.min(380, Math.max(280, window.innerWidth - horizontalInset * 2));
      const preferredLeft = triggerRect.right - panelWidth;
      const maxLeft = Math.max(horizontalInset, window.innerWidth - panelWidth - horizontalInset);
      const clampedLeft = Math.min(Math.max(horizontalInset, preferredLeft), maxLeft);
      const top = Math.min(
        Math.max(horizontalInset, triggerRect.bottom + 12),
        Math.max(horizontalInset, window.innerHeight - horizontalInset * 2 - 220)
      );
      const maxHeight = Math.min(640, Math.max(220, Math.floor(window.innerHeight * 0.7)));

      setPanelStyle({
        left: `${clampedLeft}px`,
        top: `${top}px`,
        width: `${panelWidth}px`,
        maxHeight: `${maxHeight}px`
      });
    };

    updatePanelStyle();
    window.addEventListener("resize", updatePanelStyle);
    return () => {
      window.removeEventListener("resize", updatePanelStyle);
    };
  }, [open]);

  return (
    <div ref={panelRef} className={`notification-bell${open ? " open" : ""}`}>
      <button
        ref={triggerRef}
        className={open ? "header-chip icon-only active" : "header-chip icon-only"}
        type="button"
        aria-label="Open notifications"
        onClick={() => {
          const nextOpen = !open;
          setOpen(nextOpen);
          if (nextOpen) {
            void props.onOpen();
          }
        }}
      >
        <BellIcon />
        {activeCount > 0 ? <span className="notification-badge">{activeCount > 99 ? "99+" : activeCount}</span> : null}
      </button>
      {open ? (
        <div className="notification-panel" role="dialog" aria-label="Notifications" style={panelStyle ?? undefined}>
          <div className="notification-section">
            <h3>Active</h3>
            {credentialReveal ? (
              <div className="directory-generated-password-card notification-credential-card" role="status" aria-live="polite">
                <strong>Share this generated password manually</strong>
                <div>{credentialReveal.email}</div>
                <code>{credentialReveal.password}</code>
                <p>{credentialReveal.reminder}</p>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => {
                    setCredentialReveal(null);
                    void props.onOpen();
                  }}
                >
                  Dismiss
                </button>
              </div>
            ) : null}
            {platformAccessRequests.length
              ? platformAccessRequests.map((request) => (
                  <div key={request.id} className="notification-card actionable">
                    <div className="notification-card-main">
                      <strong>{request.email}</strong>
                      <span>requested platform access</span>
                      <small>{new Date(request.createdAt).toLocaleString()}</small>
                    </div>
                    <div className="notification-card-actions">
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={props.isBusy}
                        onClick={() => void props.onDenyPlatformAccessRequest(request.id)}
                      >
                        Deny
                      </button>
                      <button
                        className="primary-button"
                        type="button"
                        disabled={props.isBusy}
                        onClick={() =>
                          void props.onAdmitPlatformAccessRequest(request).then((response) => {
                            if (response.temporaryPassword && response.secureSaveReminder) {
                              setCredentialReveal({
                                email: request.email,
                                password: response.temporaryPassword,
                                reminder: response.secureSaveReminder
                              });
                            } else {
                              setCredentialReveal(null);
                            }
                          })
                        }
                      >
                        Admit
                      </button>
                    </div>
                  </div>
                ))
              : null}
            {pendingJoinRequests.length
              ? pendingJoinRequests.map((request) => (
                  <div key={request.id} className="notification-card actionable">
                    <div className="notification-card-main">
                      <strong>{request.requester.displayName}</strong>
                      <span>requested to join {request.teamName}</span>
                      <small>{new Date(request.createdAt).toLocaleString()}</small>
                    </div>
                    <div className="notification-card-actions">
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={props.isBusy}
                        onClick={() => void props.onDenyTeamJoinRequest(request.teamId, request.id)}
                      >
                        Deny
                      </button>
                      <button
                        className="primary-button"
                        type="button"
                        disabled={props.isBusy}
                        onClick={() => void props.onAdmitTeamJoinRequest(request.teamId, request.id)}
                      >
                        Admit
                      </button>
                    </div>
                  </div>
                ))
              : null}
            {activeNotifications.length
              ? activeNotifications.map((notification) => (
                  <div key={notification.id} className="notification-card">
                    <div className="notification-card-main">
                      <strong>{notification.title}</strong>
                      <span>{notification.message}</span>
                      <small>{new Date(notification.createdAt).toLocaleString()}</small>
                    </div>
                  </div>
                ))
              : null}
            {!platformAccessRequests.length && !pendingJoinRequests.length && !activeNotifications.length ? <p>No active notifications.</p> : null}
          </div>
          <div className="notification-section">
            <h3>History</h3>
            {historyItems.length ? (
              historyItems.map((notification) => (
                <div key={notification.id} className="notification-card history">
                  <div className="notification-card-main">
                    <strong>{notification.title}</strong>
                    <span>{notification.message}</span>
                    <small>{new Date(notification.createdAt).toLocaleString()}</small>
                  </div>
                </div>
              ))
            ) : (
              <p>No history yet.</p>
            )}
            {historyCursor ? (
              <button className="secondary-button" type="button" disabled={props.isBusy} onClick={() => void props.onLoadMoreHistory(historyCursor)}>
                Load more
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
