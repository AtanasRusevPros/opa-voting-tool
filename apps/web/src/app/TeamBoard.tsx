// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import { memo, useEffect, useMemo, useState, type CSSProperties, type RefObject } from "react";
import { createPortal } from "react-dom";
import { BRANDING_MANIFEST, type BrandingManifest, type CurrentUserSummary, type RoundState, type TeamTimerSeconds } from "@planning-poker/shared";
import { usePerfRenderCounter } from "./perf";
import type { BoardMemberPlacement, BoardRect, ShortcutDefinition, StatusState } from "./types";
import {
  confirmVoteAgain,
  formatVoteValue,
  getAvatarUrl,
  getCardShortcutLabel,
  getPlanningCardLabel,
  renderPlanningCardContent,
  renderVoteCardStatus
} from "./utils";

const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  { keyLabel: "1-0 - = [ ]", description: "Cast a vote with the matching card shortcut." },
  { keyLabel: "R", description: "Reveal the score for the active round." },
  { keyLabel: "V", description: "Start the latest revealed issue again when Vote AGAIN is available." },
  { keyLabel: "Shift + /", description: "Open or close this shortcuts dialog." },
  { keyLabel: "Esc", description: "Close open menus or the shortcuts dialog." }
];

function getTimerRemainingSeconds(expiresAt: string | null, nowMs: number): number | null {
  if (!expiresAt) {
    return null;
  }
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - nowMs) / 1000));
}

function getServerClockOffsetMs(serverTime: string | null | undefined): number {
  if (!serverTime) {
    return 0;
  }
  const serverTimeMs = new Date(serverTime).getTime();
  return Number.isFinite(serverTimeMs) ? serverTimeMs - Date.now() : 0;
}

function formatTimerSeconds(seconds: number | null): string {
  if (seconds == null) {
    return "Off";
  }

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function rectWidth(rect: BoardRect) {
  return Math.max(0, rect.right - rect.left);
}

function rectHeight(rect: BoardRect) {
  return Math.max(0, rect.bottom - rect.top);
}

export const ParticipantRing = memo(function ParticipantRing(props: {
  placements: BoardMemberPlacement[];
  activeRound: RoundState | null;
  currentUserId: string;
  currentUserAvatarUrl: string;
  layoutGuideRects: Array<{ key: string; rect: BoardRect }>;
  ringRef: RefObject<HTMLDivElement | null>;
  normalTileProbeRef: RefObject<HTMLDivElement | null>;
  compactTileProbeRef: RefObject<HTMLDivElement | null>;
}) {
  usePerfRenderCounter("participantRingRenders");
  const votesByUserId = useMemo(() => {
    const map = new Map<string, string>();
    if (!props.activeRound) {
      return map;
    }
    for (const vote of props.activeRound.votes) {
      map.set(vote.userId, vote.value);
    }
    return map;
  }, [props.activeRound]);

  return (
    <div ref={props.ringRef} className="participant-ring">
      <div className="layout-guide-overlay" aria-hidden="true">
        {props.layoutGuideRects.map((guide) => (
          <div
            key={guide.key}
            className={`layout-guide-rect layout-guide-${guide.key}`}
            style={
              {
                left: `${guide.rect.left}px`,
                top: `${guide.rect.top}px`,
                width: `${Math.max(0, rectWidth(guide.rect))}px`,
                height: `${Math.max(0, rectHeight(guide.rect))}px`
              } as CSSProperties
            }
          />
        ))}
      </div>
      {props.placements.map((placement) => {
        const voteValue = votesByUserId.get(placement.member.id);
        const status =
          !props.activeRound
            ? "Waiting"
            : !voteValue
              ? "No vote"
              : placement.member.id === props.currentUserId || props.activeRound.status === "revealed"
                ? formatVoteValue(voteValue)
                : "Voted";
        return (
          <ParticipantTile
            key={placement.member.id}
            placement={placement}
            status={status}
          />
        );
      })}
      <div className="measure-probe-layer" aria-hidden="true">
        <div ref={props.normalTileProbeRef} className="member-tile measure-probe">
          <div className="member-card-shell">
            <div className="vote-card">5</div>
            <img className="member-avatar-corner" src={props.currentUserAvatarUrl} alt="" />
          </div>
          <div className="member-identity">
            <strong>Participant</strong>
          </div>
        </div>
        <div ref={props.compactTileProbeRef} className="member-tile is-compact measure-probe">
          <div className="member-card-shell">
            <div className="vote-card">5</div>
            <img className="member-avatar-corner" src={props.currentUserAvatarUrl} alt="" />
          </div>
          <div className="member-identity">
            <strong>Participant</strong>
          </div>
        </div>
      </div>
    </div>
  );
});

const ParticipantTile = memo(function ParticipantTile(props: {
  placement: BoardMemberPlacement;
  status: string;
}) {
  usePerfRenderCounter("memberTileRenders");

  return (
    <div
      className={`member-tile ring-${props.placement.ring} side-${props.placement.side}${props.placement.compact ? " is-compact" : ""}${props.placement.layer > 0 ? " is-layered is-overflow" : ""}`}
      style={
        {
          left: `${props.placement.left}px`,
          top: `${props.placement.top}px`,
          ["--stack-layer" as string]: `${props.placement.layer}`,
          ["--stack-x-step" as string]: `${props.placement.stackOffsetX ?? 0}px`,
          ["--stack-y-step" as string]: `${props.placement.stackOffsetY ?? 0}px`
        } as CSSProperties
      }
    >
      <div className="member-card-shell">
        <div className="vote-card">{renderVoteCardStatus(props.status)}</div>
        <img
          className="member-avatar-corner"
          src={getAvatarUrl(props.placement.member.avatarIconKey, props.placement.member.avatarColorKey)}
          alt={props.placement.member.displayName}
        />
      </div>
      <div className="member-identity">
        <strong>{props.placement.member.displayName}</strong>
      </div>
    </div>
  );
}, (left, right) => left.placement === right.placement && left.status === right.status);

export const BoardTimerDisplay = memo(function BoardTimerDisplay(props: {
  teamTimerSeconds: TeamTimerSeconds | null;
  activeRound: RoundState | null;
  serverTime?: string | null;
}) {
  const activeTimerExpiresAt = props.activeRound?.status === "active" ? props.activeRound.timerExpiresAt : null;
  const [serverClockOffsetMs, setServerClockOffsetMs] = useState(() => getServerClockOffsetMs(props.serverTime));
  const [nowMs, setNowMs] = useState(() => Date.now() + getServerClockOffsetMs(props.serverTime));
  const timerRemainingSeconds = getTimerRemainingSeconds(activeTimerExpiresAt, nowMs);
  const timerState = props.teamTimerSeconds == null ? "off" : activeTimerExpiresAt && timerRemainingSeconds != null ? "active" : "idle";
  const timerDisplayText =
    timerState === "active"
      ? formatTimerSeconds(timerRemainingSeconds)
      : props.teamTimerSeconds == null
        ? "Timer off"
        : `Timer ${formatTimerSeconds(props.teamTimerSeconds)}`;

  useEffect(() => {
    const nextServerClockOffsetMs = getServerClockOffsetMs(props.serverTime);
    setServerClockOffsetMs(nextServerClockOffsetMs);
    setNowMs(Date.now() + nextServerClockOffsetMs);
  }, [activeTimerExpiresAt, props.serverTime, props.teamTimerSeconds]);

  useEffect(() => {
    if (!activeTimerExpiresAt) {
      return;
    }
    let timeoutId = 0;
    const tick = () => {
      const nextNowMs = Date.now() + serverClockOffsetMs;
      setNowMs(nextNowMs);
      const currentSecondRemainder = ((nextNowMs % 1000) + 1000) % 1000;
      const delay = Math.max(200, 1000 - currentSecondRemainder);
      timeoutId = window.setTimeout(tick, delay);
    };
    tick();
    return () => window.clearTimeout(timeoutId);
  }, [activeTimerExpiresAt, serverClockOffsetMs]);

  return (
    <div className={`board-timer board-timer-${timerState}`} aria-live="polite">
      {timerDisplayText}
    </div>
  );
});

export const CardRail = memo(function CardRail(props: {
  cards: string[];
  selectedValue: string | null;
  disabled: boolean;
  showShortcuts: boolean;
  onVote: (value: string) => Promise<void>;
}) {
  return (
    <div className="card-rail">
      {props.cards.map((card, index) => (
        <button
          key={card}
          className={props.selectedValue === card ? "planning-card selected" : "planning-card"}
          aria-label={getPlanningCardLabel(card)}
          disabled={props.disabled}
          onClick={() => void props.onVote(card)}
        >
          {props.showShortcuts && getCardShortcutLabel(index) ? (
            <span className="planning-card-shortcut" aria-hidden="true">
              {getCardShortcutLabel(index)}
            </span>
          ) : null}
          {renderPlanningCardContent(card)}
        </button>
      ))}
    </div>
  );
});

export const BoardStageContent = memo(function BoardStageContent(props: {
  branding?: BrandingManifest;
  teamBackgroundOpacity: number;
  boardNeedsScroll: boolean;
  boardStageHeight: number | null;
  boardMainRef: RefObject<HTMLDivElement | null>;
  participantRingRef: RefObject<HTMLDivElement | null>;
  normalTileProbeRef: RefObject<HTMLDivElement | null>;
  compactTileProbeRef: RefObject<HTMLDivElement | null>;
  boardScrollAreaRef: RefObject<HTMLDivElement | null>;
  boardStageRef: RefObject<HTMLDivElement | null>;
  cardRailRef: RefObject<HTMLDivElement | null>;
  centerPanelRef: RefObject<HTMLDivElement | null>;
  activeRound: RoundState | null;
  currentUser: CurrentUserSummary;
  layoutGuideRects: Array<{ key: string; rect: BoardRect }>;
  memberPlacements: BoardMemberPlacement[];
  titleDraft: string;
  onTitleDraftChange: (value: string) => void;
  canCreateRound: boolean;
  isBusy: boolean;
  onCreateRound: (title: string) => Promise<void>;
  onReveal: () => Promise<void>;
  onCancelActiveRound?: () => Promise<void>;
  onVoteAgainActiveRound?: () => Promise<void>;
  onVoteAgain: (historyId: string) => Promise<void>;
  latestHistoryEntryId: string | null;
  currentDeckCards: string[];
  selectedVoteValue: string | null;
  onVote: (value: string) => Promise<void>;
  teamTimerSeconds: TeamTimerSeconds | null;
  serverTime?: string | null;
  pendingIssues: Array<{
    id: string;
    issueKey: string;
    title: string;
    displayTitle: string;
  }>;
  onLoadPendingIssue: (issueId: string) => Promise<void>;
  layoutModeLabel: string;
  status: StatusState;
  isReadOnly: boolean;
  readOnlyMessage: string | null;
}) {
  const branding = props.branding ?? BRANDING_MANIFEST;
  const currentUserAvatarUrl = useMemo(
    () => getAvatarUrl(props.currentUser.avatarIconKey, props.currentUser.avatarColorKey),
    [props.currentUser.avatarColorKey, props.currentUser.avatarIconKey]
  );

  return (
    <div
      ref={props.boardMainRef}
      className="board-main"
      style={
        {
          ["--team-background-opacity" as string]: props.teamBackgroundOpacity
        } as CSSProperties
      }
    >
      <div ref={props.boardScrollAreaRef} className={`board-scroll-area${props.boardNeedsScroll ? " needs-scroll" : ""}`}>
        <div ref={props.boardStageRef} className="board-stage" style={props.boardStageHeight ? { minHeight: `${props.boardStageHeight}px` } : undefined}>
          <img className="team-background-art" src={branding.teamBackground} alt="" />
          <div className="stage-layout" style={props.boardStageHeight ? { minHeight: `${props.boardStageHeight}px` } : undefined}>
            <ParticipantRing
              placements={props.memberPlacements}
              activeRound={props.activeRound}
              currentUserId={props.currentUser.id}
              currentUserAvatarUrl={currentUserAvatarUrl}
              layoutGuideRects={props.layoutGuideRects}
              ringRef={props.participantRingRef}
              normalTileProbeRef={props.normalTileProbeRef}
              compactTileProbeRef={props.compactTileProbeRef}
            />

            <BoardTimerDisplay teamTimerSeconds={props.teamTimerSeconds} activeRound={props.activeRound} serverTime={props.serverTime} />

            <div ref={props.centerPanelRef} className="center-panel">
              <div className="center-control-card">
                {props.readOnlyMessage ? <div className="board-readonly-banner">{props.readOnlyMessage}</div> : null}
                {props.activeRound ? (
                  <>
                    <h2 className="floating-chip">{props.activeRound.title}</h2>
                    {props.activeRound.status === "revealed" ? (
                      <form
                        className="revealed-actions"
                        onSubmit={(event) => {
                          event.preventDefault();
                          if (props.canCreateRound) {
                            void props.onCreateRound(props.titleDraft);
                          }
                        }}
                      >
                        <div className="revealed-score floating-chip">
                          {props.activeRound.quorumBlocked
                            ? `Minimum participation not met: ${props.activeRound.votedCount} voted, ${props.activeRound.notVotedCount} not voted`
                            : `Average score: ${props.activeRound.revealAverage ?? "N/A"}`}
                        </div>
                        <label className="new-round-box sr-only-label">
                          <span className="sr-only">Next issue title</span>
                          <input
                            aria-label="Next issue title"
                            value={props.titleDraft}
                            onChange={(event) => props.onTitleDraftChange(event.target.value)}
                            placeholder="Type title (min 5 chars)"
                            readOnly={props.isReadOnly}
                          />
                        </label>
                        <button className="primary-button deal-button" type="submit" disabled={!props.canCreateRound}>
                          {props.isBusy ? "Working..." : "Deal"}
                          {props.currentUser.boardShortcutsEnabled ? <span className="button-shortcut-hint" aria-hidden="true">↵</span> : null}
                        </button>
                        <button
                          className="ghost-button"
                          type="button"
                          disabled={props.isBusy || props.isReadOnly || !props.latestHistoryEntryId}
                          onClick={() => {
                            if (props.latestHistoryEntryId && props.activeRound && confirmVoteAgain(props.activeRound.title)) {
                              void props.onVoteAgain(props.latestHistoryEntryId);
                            }
                          }}
                        >
                          Vote AGAIN
                          {props.currentUser.boardShortcutsEnabled ? <span className="button-shortcut-hint" aria-hidden="true">V</span> : null}
                        </button>
                      </form>
                    ) : (
                      <div className="active-reveal-actions">
                        {props.activeRound.quorumBlocked ? (
                          <div className="revealed-score floating-chip" role="status" aria-live="polite">
                            Minimum participation not met: {props.activeRound.votedCount} voted, {props.activeRound.notVotedCount} not voted
                          </div>
                        ) : null}
                        <button className="primary-button" disabled={props.isBusy || props.isReadOnly || props.activeRound.quorumBlocked} onClick={() => void props.onReveal()}>
                          Reveal score
                          {props.currentUser.boardShortcutsEnabled ? <span className="button-shortcut-hint" aria-hidden="true">R</span> : null}
                        </button>
                        {props.activeRound.quorumBlocked ? (
                          <div className="active-reveal-escape-row">
                            <button className="secondary-button" type="button" disabled={props.isBusy || props.isReadOnly || !props.onCancelActiveRound} onClick={() => void props.onCancelActiveRound?.()}>
                              Cancel
                            </button>
                            <button className="ghost-button" type="button" aria-label="Vote again for active round" disabled={props.isBusy || props.isReadOnly || !props.onVoteAgainActiveRound} onClick={() => void props.onVoteAgainActiveRound?.()}>
                              Vote again
                            </button>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </>
                ) : (
                  <form
                    className="start-round-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (props.canCreateRound) {
                        void props.onCreateRound(props.titleDraft);
                      }
                    }}
                  >
                    <h2 className="floating-chip">Start a planning poker round</h2>
                    <label className="new-round-box sr-only-label">
                      <span className="sr-only">Issue title</span>
                      <input
                        aria-label="Issue title"
                        value={props.titleDraft}
                        onChange={(event) => props.onTitleDraftChange(event.target.value)}
                        placeholder="ISSUE-12345 or short title"
                        readOnly={props.isReadOnly}
                      />
                    </label>
                    <button className="primary-button start-button" type="submit" disabled={!props.canCreateRound}>
                      {props.isBusy ? "Working..." : "Start voting"}
                      {props.currentUser.boardShortcutsEnabled ? <span className="button-shortcut-hint" aria-hidden="true">↵</span> : null}
                    </button>
                  </form>
                )}
                {props.pendingIssues.length > 0 ? (
                  <div className="pending-issue-queue" aria-label="Pending Jira issues">
                    <h3>Pending Jira issues</h3>
                    <div className="pending-issue-list">
                      {props.pendingIssues.map((issue) => (
                        <div key={issue.id} className="pending-issue-row">
                          <div className="pending-issue-copy">
                            <strong>{issue.issueKey}</strong>
                            <span>{issue.title}</span>
                          </div>
                          <button
                            className="ghost-button"
                            type="button"
                            disabled={props.isBusy || props.isReadOnly}
                            onClick={() => void props.onLoadPendingIssue(issue.id)}
                          >
                            Load for voting
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div ref={props.cardRailRef} className="card-rail-wrap">
          <CardRail
            cards={props.currentDeckCards}
            selectedValue={props.selectedVoteValue}
            disabled={!props.activeRound || props.activeRound.status === "revealed" || props.isBusy || props.isReadOnly}
            showShortcuts={props.currentUser.boardShortcutsEnabled}
            onVote={props.onVote}
          />
        </div>
      </div>

      <div className={`status-line ${props.status.tone}`}>{props.status.text ? `${props.layoutModeLabel} · ${props.status.text}` : props.layoutModeLabel}</div>
    </div>
  );
});

export const ShortcutsHelpContent = memo(function ShortcutsHelpContent() {
  return (
    <div className="shortcuts-help-content">
      {SHORTCUT_DEFINITIONS.map((shortcut) => (
        <div key={shortcut.keyLabel} className="shortcut-row">
          <span className="shortcut-key">{shortcut.keyLabel}</span>
          <span>{shortcut.description}</span>
        </div>
      ))}
    </div>
  );
});

export const ShortcutsHelpModal = memo(function ShortcutsHelpModal(props: {
  open: boolean;
  onClose: () => void;
}) {
  if (!props.open) {
    return null;
  }

  return createPortal(
    <div className="shortcuts-modal-backdrop" role="presentation" onClick={props.onClose}>
      <div
        className="shortcuts-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shortcuts-modal-header">
          <h3>Keyboard shortcuts</h3>
          <button className="ghost-button" type="button" onClick={props.onClose}>
            Close
          </button>
        </div>
        <ShortcutsHelpContent />
      </div>
    </div>,
    document.body
  );
});
