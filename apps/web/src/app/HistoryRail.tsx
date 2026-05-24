// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { HistoryEntry, HistoryPageCursor, HistoryTimeZoneKey, TeamHistorySearchFilters } from "@planning-poker/shared";
import { HistoryTimestamp } from "./shared";
import { usePerfRenderCounter } from "./perf";
import { confirmVoteAgain, formatCommentTimestamp, formatVoteValue, getHistorySummaryDeckLabel, getHistoryTooltipRows, groupHistory } from "./utils";

type HistoryTab = "history" | "search";

function sameHistoryEntry(left: HistoryEntry, right: HistoryEntry) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameHistoryEntryArray(left: HistoryEntry[], right: HistoryEntry[]) {
  return left.length === right.length && left.every((item, index) => sameHistoryEntry(item, right[index]!));
}

function sameTooltipRows(left: Array<{ label: string; value: string }>, right: Array<{ label: string; value: string }>) {
  return left.length === right.length && left.every((row, index) => row.label === right[index]?.label && row.value === right[index]?.value);
}

function sameHistoryTimeZoneKeys(left: readonly HistoryTimeZoneKey[], right: readonly HistoryTimeZoneKey[]) {
  return left.length === right.length && left.every((key, index) => key === right[index]);
}

function sameCursor(left: HistoryPageCursor | null | undefined, right: HistoryPageCursor | null | undefined) {
  if (!left && !right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return left.completedAt === right.completedAt && left.id === right.id;
}

export function HistoryCommentsThread(props: {
  entry: HistoryEntry;
  expanded: boolean;
  onToggleExpanded: () => void;
  currentUserId: string;
  isBusy: boolean;
  isReadOnly: boolean;
  onAddComment: (historyId: string, body: string) => Promise<void>;
  onEditComment: (historyId: string, commentId: string, body: string) => Promise<void>;
  onDeleteComment: (historyId: string, commentId: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState("");
  const trimmedDraft = draft.trim();
  const trimmedEditingDraft = editingDraft.trim();

  useEffect(() => {
    if (!editingCommentId) {
      return;
    }
    const currentComment = props.entry.comments.find((comment) => comment.id === editingCommentId);
    if (!currentComment) {
      setEditingCommentId(null);
      setEditingDraft("");
    }
  }, [editingCommentId, props.entry.comments]);

  return (
    <div className="history-comments">
      <div className="history-comments-header">
        <button className="ghost-button history-comments-toggle" type="button" onClick={props.onToggleExpanded}>
          {props.expanded ? "Hide comments" : `Comments (${props.entry.comments.length})`}
        </button>
      </div>
      {props.expanded ? (
        <div className="history-comments-body">
          {!props.isReadOnly ? (
            <form
              className="history-comment-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (!trimmedDraft || props.isBusy) {
                  return;
                }
                void props.onAddComment(props.entry.id, trimmedDraft).then(
                  () => setDraft(""),
                  () => undefined
                );
              }}
            >
              <label className="sr-only-label">
                <span className="sr-only">Add comment for {props.entry.title}</span>
                <textarea
                  aria-label={`Add comment for ${props.entry.title}`}
                  maxLength={4000}
                  placeholder="Add a shared comment..."
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  rows={3}
                />
              </label>
              <div className="history-comment-form-footer">
                <span className="field-hint">{trimmedDraft.length}/4000</span>
                <button className="secondary-button" type="submit" disabled={props.isBusy || trimmedDraft.length === 0}>
                  Add comment
                </button>
              </div>
            </form>
          ) : (
            <div className="field-hint">Comments are read-only in this view.</div>
          )}
          <div className="history-comment-list">
            {props.entry.comments.length === 0 ? <div className="field-hint">No comments yet.</div> : null}
            {props.entry.comments.map((comment) => {
              const canEditOwnComment = !props.isReadOnly && !comment.importedImmutable && comment.author.id === props.currentUserId;
              const isEditing = editingCommentId === comment.id;
              const edited = comment.updatedAt !== comment.createdAt;
              return (
                <div key={comment.id} className="history-comment-card">
                  <div className="history-comment-meta">
                    <strong>{comment.authorSignature}</strong>
                    <span>{edited ? `Edited ${formatCommentTimestamp(comment.updatedAt)}` : formatCommentTimestamp(comment.createdAt)}</span>
                  </div>
                  {isEditing ? (
                    <form
                      className="history-comment-edit-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (!trimmedEditingDraft || props.isBusy) {
                          return;
                        }
                        void props.onEditComment(props.entry.id, comment.id, trimmedEditingDraft).then(
                          () => {
                            setEditingCommentId(null);
                            setEditingDraft("");
                          },
                          () => undefined
                        );
                      }}
                    >
                      <textarea
                        aria-label={`Edit comment from ${comment.authorSignature}`}
                        maxLength={4000}
                        rows={3}
                        value={editingDraft}
                        onChange={(event) => setEditingDraft(event.target.value)}
                      />
                      <div className="history-comment-form-footer">
                        <span className="field-hint">{trimmedEditingDraft.length}/4000</span>
                        <div className="history-comment-actions">
                          <button
                            className="ghost-button"
                            type="button"
                            onClick={() => {
                              setEditingCommentId(null);
                              setEditingDraft("");
                            }}
                          >
                            Cancel
                          </button>
                          <button className="secondary-button" type="submit" disabled={props.isBusy || trimmedEditingDraft.length === 0}>
                            Save
                          </button>
                        </div>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="history-comment-body">{comment.body}</div>
                      {canEditOwnComment ? (
                        <div className="history-comment-actions">
                          <button
                            className="ghost-button"
                            type="button"
                            onClick={() => {
                              setEditingCommentId(comment.id);
                              setEditingDraft(comment.body);
                            }}
                          >
                            Edit
                          </button>
                          <button
                            className="ghost-button"
                            type="button"
                            onClick={() => {
                              if (window.confirm("Delete this comment?")) {
                                void props.onDeleteComment(props.entry.id, comment.id);
                              }
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      ) : comment.importedImmutable ? (
                        <div className="field-hint">Imported comments are historical records and cannot be edited.</div>
                      ) : null}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function renderHistoryEntries(props: {
  entries: HistoryEntry[];
  expandedVoterIds: ReadonlySet<string>;
  expandedCommentIds: ReadonlySet<string>;
  historyTimezonePopupEnabled: boolean;
  historyTimezoneKeys: HistoryTimeZoneKey[];
  currentUserId: string;
  isReadOnly: boolean;
  isBusy: boolean;
  latestRevealedHistoryId: string | null;
  onVoteAgain: (historyId: string) => Promise<void>;
  onAddComment: (historyId: string, body: string) => Promise<void>;
  onEditComment: (historyId: string, commentId: string, body: string) => Promise<void>;
  onDeleteComment: (historyId: string, commentId: string) => Promise<void>;
  onToggleVoters: (historyId: string) => void;
  onToggleComments: (historyId: string) => void;
}) {
  const groupedHistory = groupHistory(props.entries);
  return groupedHistory.map((group) => (
    <div key={group.key} className="history-group">
      <HistoryTimestamp
        key={`${group.key}-${props.historyTimezonePopupEnabled ? "enabled" : "disabled"}`}
        heading={group.heading}
        tooltipRows={getHistoryTooltipRows(group.key, props.historyTimezoneKeys)}
        enabled={props.historyTimezonePopupEnabled}
      />
      {group.items.map((entry) => (
        <div key={entry.id} className="history-card">
          <div className="history-card-section history-card-section-title">
            <div className="history-card-title">{entry.title}</div>
          </div>
          <div className="history-card-section">
            <div className="history-card-meta">
              {entry.quorumBlocked
                ? (
                  <>
                    <strong>{entry.votedCount}</strong> voted • {entry.notVotedCount} not voted • {getHistorySummaryDeckLabel(entry)} • minimum participation not met
                  </>
                )
                : (
                  <>
                    average <strong>{entry.averageScore ?? "N/A"}</strong> • <strong>{entry.participantCount}</strong> people • {getHistorySummaryDeckLabel(entry)}
                  </>
                )}
            </div>
          </div>
          <div className="history-card-section">
            <button className="ghost-button history-voters-toggle" type="button" onClick={() => props.onToggleVoters(entry.id)}>
              {props.expandedVoterIds.has(entry.id) ? "Hide voters" : `Show voters (${entry.votes.length})`}
            </button>
            {props.expandedVoterIds.has(entry.id) ? (
              <div className="history-votes" aria-label={`Votes for ${entry.title}`}>
                {entry.votes.map((vote, index) => (
                  <span key={`${entry.id}-${vote.userId}`} className="history-vote-item">
                    {vote.displayName}: {formatVoteValue(vote.value)}
                    {index < entry.votes.length - 1 ? ",  " : ""}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <div className="history-card-section history-card-section-action">
            <button
              className="history-link-action"
              disabled={props.isBusy}
              onClick={() => {
                if (confirmVoteAgain(entry.title)) {
                  void props.onVoteAgain(entry.id);
                }
              }}
            >
              {props.latestRevealedHistoryId === entry.id ? "Vote AGAIN (V)" : "Vote AGAIN"}
            </button>
          </div>
          <div className="history-card-section">
            <HistoryCommentsThread
              entry={entry}
              expanded={props.expandedCommentIds.has(entry.id)}
              onToggleExpanded={() => props.onToggleComments(entry.id)}
              currentUserId={props.currentUserId}
              isBusy={props.isBusy}
              isReadOnly={props.isReadOnly}
              onAddComment={props.onAddComment}
              onEditComment={props.onEditComment}
              onDeleteComment={props.onDeleteComment}
            />
          </div>
        </div>
      ))}
    </div>
  ));
}

export const HistoryRail = memo(function HistoryRail(props: {
  className?: string;
  teamId: string;
  historyItems: HistoryEntry[];
  historyNextCursor: HistoryPageCursor | null;
  historyLoading: boolean;
  searchItems: HistoryEntry[];
  searchNextCursor: HistoryPageCursor | null;
  searchLoading: boolean;
  searchFilters?: TeamHistorySearchFilters;
  hasSearched: boolean;
  historyTimezonePopupEnabled: boolean;
  historyTimezoneKeys: HistoryTimeZoneKey[];
  currentUserId: string;
  isReadOnly: boolean;
  isBusy: boolean;
  latestRevealedHistoryId: string | null;
  onVoteAgain: (historyId: string) => Promise<void>;
  onAddComment: (historyId: string, body: string) => Promise<void>;
  onEditComment: (historyId: string, commentId: string, body: string) => Promise<void>;
  onDeleteComment: (historyId: string, commentId: string) => Promise<void>;
  onLoadMoreHistory: () => Promise<void>;
  onRunSearch: (filters: TeamHistorySearchFilters) => Promise<void>;
  onLoadMoreSearch: () => Promise<void>;
}) {
  usePerfRenderCounter("historyRailRenders");
  const containerRef = useRef<HTMLElement | null>(null);
  const [activeTab, setActiveTab] = useState<HistoryTab>("history");
  const [expandedVoterIds, setExpandedVoterIds] = useState<Set<string>>(() => new Set());
  const [expandedCommentIds, setExpandedCommentIds] = useState<Set<string>>(() => new Set());
  const searchFilters = props.searchFilters ?? {
    dateFrom: null,
    dateTo: null,
    titleQuery: "",
    exactTitleMatch: false,
    commentQuery: "",
    personQuery: ""
  };
  const [dateFrom, setDateFrom] = useState(searchFilters.dateFrom ?? "");
  const [dateTo, setDateTo] = useState(searchFilters.dateTo ?? "");
  const [titleQuery, setTitleQuery] = useState(searchFilters.titleQuery);
  const [exactTitleMatch, setExactTitleMatch] = useState(searchFilters.exactTitleMatch);
  const [commentQuery, setCommentQuery] = useState(searchFilters.commentQuery);
  const [personQuery, setPersonQuery] = useState(searchFilters.personQuery);

  useEffect(() => {
    setExpandedVoterIds(new Set());
    setExpandedCommentIds(new Set());
  }, [props.teamId]);

  useEffect(() => {
    setDateFrom(searchFilters.dateFrom ?? "");
    setDateTo(searchFilters.dateTo ?? "");
    setTitleQuery(searchFilters.titleQuery);
    setExactTitleMatch(searchFilters.exactTitleMatch);
    setCommentQuery(searchFilters.commentQuery);
    setPersonQuery(searchFilters.personQuery);
  }, [props.teamId]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) {
      return;
    }

    const handleScroll = () => {
      const nearBottom = node.scrollTop + node.clientHeight >= node.scrollHeight - 80;
      if (!nearBottom) {
        return;
      }

      if (activeTab === "history") {
        if (!props.historyLoading && props.historyNextCursor) {
          void props.onLoadMoreHistory();
        }
        return;
      }

      if (!props.searchLoading && props.searchNextCursor) {
        void props.onLoadMoreSearch();
      }
    };

    node.addEventListener("scroll", handleScroll);
    return () => node.removeEventListener("scroll", handleScroll);
  }, [activeTab, props.historyLoading, props.historyNextCursor, props.onLoadMoreHistory, props.onLoadMoreSearch, props.searchLoading, props.searchNextCursor]);

  const currentEntries = activeTab === "history" ? props.historyItems : props.searchItems;

  return (
    <aside ref={containerRef} className={props.className ? `history-rail ${props.className}` : "history-rail"}>
      <div className="history-title-row">
        <div className="history-title">Issues List</div>
        <div className="history-tabs" role="tablist" aria-label="Issues history tabs">
          <button className={activeTab === "history" ? "history-tab active" : "history-tab"} type="button" role="tab" aria-selected={activeTab === "history"} onClick={() => setActiveTab("history")}>
            History
          </button>
          <button className={activeTab === "search" ? "history-tab active" : "history-tab"} type="button" role="tab" aria-selected={activeTab === "search"} onClick={() => setActiveTab("search")}>
            Search
          </button>
        </div>
      </div>

      {activeTab === "search" ? (
        <form
          className="history-search-form"
          onSubmit={(event) => {
            event.preventDefault();
            void props.onRunSearch({
              dateFrom: dateFrom || null,
              dateTo: dateTo || null,
              titleQuery: titleQuery.trim(),
              exactTitleMatch,
              commentQuery: commentQuery.trim(),
              personQuery: personQuery.trim()
            });
          }}
        >
          <div className="history-search-grid">
            <label className="history-search-date-field">
              Date from
              <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            </label>
            <label className="history-search-date-field">
              Date to
              <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </label>
            <label className="history-search-field-wide">
              Title or words
              <input value={titleQuery} onChange={(event) => setTitleQuery(event.target.value)} placeholder="Search issue titles" />
            </label>
            <label className="history-search-toggle">
              <input type="checkbox" checked={exactTitleMatch} onChange={(event) => setExactTitleMatch(event.target.checked)} />
              <span>Exact title match</span>
            </label>
            <label className="history-search-field-wide">
              Word in comments
              <input value={commentQuery} onChange={(event) => setCommentQuery(event.target.value)} placeholder="Search comment text" />
            </label>
            <label className="history-search-field-wide">
              Person who voted or commented
              <input value={personQuery} onChange={(event) => setPersonQuery(event.target.value)} placeholder="Name or email" />
            </label>
          </div>
          <div className="history-search-actions">
            <button className="primary-button" type="submit" disabled={props.searchLoading}>
              Search history
            </button>
            <button
              className="ghost-button"
              type="button"
              disabled={props.searchLoading}
              onClick={() => {
                setDateFrom("");
                setDateTo("");
                setTitleQuery("");
                setExactTitleMatch(false);
                setCommentQuery("");
                setPersonQuery("");
                void props.onRunSearch({
                  dateFrom: null,
                  dateTo: null,
                  titleQuery: "",
                  exactTitleMatch: false,
                  commentQuery: "",
                  personQuery: ""
                });
              }}
            >
              Clear
            </button>
          </div>
        </form>
      ) : null}

      {currentEntries.length === 0 ? (
        <div className="field-hint history-empty-state">
          {activeTab === "history" ? "No issues have been revealed yet." : props.hasSearched ? "No history entries match this search." : "Use the Search tab to filter the issues history."}
        </div>
      ) : (
        renderHistoryEntries({
          entries: currentEntries,
          expandedVoterIds,
          expandedCommentIds,
          historyTimezonePopupEnabled: props.historyTimezonePopupEnabled,
          historyTimezoneKeys: props.historyTimezoneKeys,
          currentUserId: props.currentUserId,
          isReadOnly: props.isReadOnly,
          isBusy: props.isBusy,
          latestRevealedHistoryId: props.latestRevealedHistoryId,
          onVoteAgain: props.onVoteAgain,
          onAddComment: props.onAddComment,
          onEditComment: props.onEditComment,
          onDeleteComment: props.onDeleteComment,
          onToggleVoters: (historyId) =>
            setExpandedVoterIds((current) => {
              const next = new Set(current);
              if (next.has(historyId)) {
                next.delete(historyId);
              } else {
                next.add(historyId);
              }
              return next;
            }),
          onToggleComments: (historyId) =>
            setExpandedCommentIds((current) => {
              const next = new Set(current);
              if (next.has(historyId)) {
                next.delete(historyId);
              } else {
                next.add(historyId);
              }
              return next;
            })
        })
      )}

      <div className="history-load-state" aria-live="polite">
        {activeTab === "history" ? (
          props.historyLoading ? (
            <span>Loading more history...</span>
          ) : props.historyNextCursor ? (
            <button className="ghost-button" type="button" onClick={() => void props.onLoadMoreHistory()}>
              Load more
            </button>
          ) : props.historyItems.length > 0 ? (
            <span>No more history entries.</span>
          ) : null
        ) : props.searchLoading ? (
          <span>Loading search results...</span>
        ) : props.searchNextCursor ? (
          <button className="ghost-button" type="button" onClick={() => void props.onLoadMoreSearch()}>
            Load more results
          </button>
        ) : props.hasSearched && props.searchItems.length > 0 ? (
          <span>No more matching entries.</span>
        ) : null}
      </div>
    </aside>
  );
}, (left, right) =>
  left.className === right.className &&
  left.teamId === right.teamId &&
  sameHistoryEntryArray(left.historyItems, right.historyItems) &&
  sameCursor(left.historyNextCursor, right.historyNextCursor) &&
  left.historyLoading === right.historyLoading &&
  sameHistoryEntryArray(left.searchItems, right.searchItems) &&
  sameCursor(left.searchNextCursor, right.searchNextCursor) &&
  left.searchLoading === right.searchLoading &&
  left.hasSearched === right.hasSearched &&
  (left.searchFilters?.dateFrom ?? null) === (right.searchFilters?.dateFrom ?? null) &&
  (left.searchFilters?.dateTo ?? null) === (right.searchFilters?.dateTo ?? null) &&
  (left.searchFilters?.titleQuery ?? "") === (right.searchFilters?.titleQuery ?? "") &&
  (left.searchFilters?.exactTitleMatch ?? false) === (right.searchFilters?.exactTitleMatch ?? false) &&
  (left.searchFilters?.commentQuery ?? "") === (right.searchFilters?.commentQuery ?? "") &&
  (left.searchFilters?.personQuery ?? "") === (right.searchFilters?.personQuery ?? "") &&
  left.historyTimezonePopupEnabled === right.historyTimezonePopupEnabled &&
  sameHistoryTimeZoneKeys(left.historyTimezoneKeys, right.historyTimezoneKeys) &&
  left.currentUserId === right.currentUserId &&
  left.isReadOnly === right.isReadOnly &&
  left.isBusy === right.isBusy &&
  left.latestRevealedHistoryId === right.latestRevealedHistoryId
);
