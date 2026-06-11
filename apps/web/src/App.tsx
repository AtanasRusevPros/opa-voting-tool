// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import { memo, startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import {
  AVATAR_COLOR_KEYS,
  AVATAR_COLOR_SWATCHES,
  BRANDING_MANIFEST,
  DECKS,
  DEFAULT_HISTORY_TIME_ZONE_KEYS,
  FIBONACCI_RANGE_END_OPTIONS,
  FIBONACCI_RANGE_START_OPTIONS,
  HISTORY_TIME_ZONE_OPTIONS,
  TEAM_TIMER_OPTIONS,
  buildAvatarAssetKey,
  calculateAverage,
  getDeckCards,
  getDeckLabel,
  normalizeFibonacciRange,
  resolveAvatarSelection,
  type BrandingManifest,
  type CurrentUserSummary,
  type DeckDefinition,
  type FibonacciRangeEnd,
  type FibonacciRangeStart,
  type HistoryComment,
  type HistoryEntry,
  type HistoryPage,
  type HistoryPageCursor,
  type TeamHistoryExportPackage,
  type TeamHistorySearchFilters,
  type TeamHistorySearchPage,
  type HistoryTimeZoneKey,
  type NotificationSummary,
  type PendingJoinRequestSummary,
  type RoundState,
  type TeamMemberSummary,
  type TeamTimerSeconds,
  type TeamMembershipSummary,
  type TeamPendingIssue,
  type TeamRoundUpdatePayload,
  type TeamRoundVoteUpdatePayload,
  type TeamStateResponse,
  type TeamUserRole,
  type UserSummary
} from "@planning-poker/shared";
import { DEBUG_LAYOUT_GUIDES_ENABLED, DEBUG_LAYOUT_GUIDES_KEY } from "./debugFlags";
import { AccountSettingsModal } from "./app/AccountSettingsModal";
import { AdminSettingsModal } from "./app/AdminSettingsModal";
import { HistoryRail } from "./app/HistoryRail";
import { BellIcon, ChevronDownIcon, ChevronRightIcon, EditPencilIcon, EyeIcon, LogoutIcon, MenuIcon, ShareNodesIcon, StopwatchIcon } from "./app/icons";
import { LoginScreen } from "./app/LoginScreen";
import { NotificationBell } from "./app/NotificationBell";
import { incrementPerfCounter, usePerfRenderCounter } from "./app/perf";
import { BrandFooter } from "./app/shared";
import { BoardStageContent, ShortcutsHelpContent, ShortcutsHelpModal } from "./app/TeamBoard";
import { TeamChooser } from "./app/TeamChooser";
import { TeamDirectoryModal } from "./app/TeamDirectoryModal";
import {
  CARD_SHORTCUT_KEYS,
  confirmVoteAgain,
  deriveDisplayNameFromEmail,
  formatCommentTimestamp,
  formatHistoryDisplay,
  formatTimeZoneOffsetLabel,
  formatVoteValue,
  getAvatarUrl,
  getCardShortcutLabel,
  getCardStatus,
  getHistorySummaryDeckLabel,
  getHistoryTooltipRows,
  getPlanningCardLabel,
  getVisibleActiveParticipants,
  isTextEntryTarget,
  pickRandomAvatarSelection,
  renderPlanningCardContent,
  renderVoteCardStatus,
  truncateLabel
} from "./app/utils";

export { HistoryTimestamp } from "./app/shared";
export {
  formatHistoryDisplay,
  formatTimeZoneOffsetLabel,
  getHistoryTooltipRows,
  pickRandomAvatarSelection
} from "./app/utils";

type SessionResponse = {
  user: CurrentUserSummary;
  memberships: TeamMembershipSummary[];
  availableTeams: TeamMembershipSummary[];
  token?: string;
};

type BootstrapResponse = {
  debugCodesEnabled?: boolean;
  debugToolsEnabled: boolean;
  smtpConfigured?: boolean;
  branding?: BrandingManifest;
  simulatorModeEnabled?: boolean;
  demoModeEnabled?: boolean;
  publicTrial?: {
    enabled: boolean;
    mode: "disabled" | "open_signup" | "invite_only" | "operator_approved";
    maxTeamsPerWorkspace: number;
    maxUsersPerWorkspace: number;
    maxRevealedRoundsPerWorkspacePerMonth: number;
    maxSignupRequestsPerIpPerHour: number;
    maxCodeRequestsPerEmailPerDay: number;
    maxInvitesPerWorkspacePerDay: number;
    maxWorkspaceCreationsPerIpPerDay: number;
    maxLoginAttemptsPerEmailPerHour: number;
  };
  allowedDomainsFile?: string;
};

type AdminConfigView = {
  app: {
    baseUrl: string;
    allowedDomainsPath: string;
    deploymentConfigPath: string;
    managedBrandingDir: string;
  };
  admin: {
    username: string;
    displayName: string;
    passwordConfigured: boolean;
  };
  smtp: {
    host: string;
    port: number | null;
    user: string;
    from: string;
    passConfigured: boolean;
  };
  jira: {
    clientId: string;
    clientSecretConfigured: boolean;
    connected: boolean;
    siteUrl: string | null;
    siteName: string | null;
    cloudId: string | null;
    pendingSites: Array<{
      cloudId: string;
      siteUrl: string;
      siteName: string;
    }>;
  };
  branding: Pick<
    BrandingManifest,
    "loginLogo" | "loginBackground" | "teamLogo" | "teamBackground" | "backgroundOpacity" | "footerCreatorText" | "footerCompanyText" | "palette"
  >;
  demo: {
    enabled: boolean;
  };
  publicTrial?: {
    enabled: boolean;
    mode: "disabled" | "open_signup" | "invite_only" | "operator_approved";
    maxTeamsPerWorkspace: number;
    maxUsersPerWorkspace: number;
    maxRevealedRoundsPerWorkspacePerMonth: number;
    maxSignupRequestsPerIpPerHour: number;
    maxCodeRequestsPerEmailPerDay: number;
    maxInvitesPerWorkspacePerDay: number;
    maxWorkspaceCreationsPerIpPerDay: number;
    maxLoginAttemptsPerEmailPerHour: number;
  };
};

type AdminConfigSaveResult = {
  config: AdminConfigView;
  appliedFields: string[];
  restartRequiredFields: string[];
};

type RevealSecretResponse = {
  value: string;
};

type BrandingAssetSlot = "loginLogo" | "loginBackground" | "teamLogo" | "teamBackground";

type TeamDirectoryResponse = {
  team: TeamMembershipSummary | TeamStateResponse["team"];
  members: TeamMemberSummary[];
  activeParticipantIds: string[];
  currentUserId: string;
  currentUserRole: TeamUserRole;
  currentUserIsSuperAdmin: boolean;
  pendingIssues: TeamPendingIssue[];
  pendingJoinRequests: PendingJoinRequestSummary[];
};

type TeamHistoryResponse = {
  history: HistoryPage;
};

type TeamHistorySearchResponse = TeamHistorySearchPage;

type TeamHistoryImportResponse = {
  importedCount: number;
  skippedCount: number;
  team: TeamMembershipSummary | TeamStateResponse["team"];
  createdTeam: boolean;
};

type TeamHistoryExportResponse = {
  fileName: string;
  package: TeamHistoryExportPackage;
};

type HistoryCommentMutationResponse = {
  historyEntry: HistoryEntry;
};

type ActionHistoryPage = {
  items: NotificationSummary[];
  nextCursor: string | null;
};

type NotificationFeedResponse = {
  active: NotificationSummary[];
  history: NotificationSummary[];
  pendingJoinRequests: PendingJoinRequestSummary[];
  platformAccessRequests?: PlatformAccessRequestSummary[];
  adminHistory?: ActionHistoryPage | null;
};

type PlatformAccessRequestSummary = {
  id: string;
  email: string;
  createdAt: string;
};

type PlatformUserSummary = {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
  lastActiveAt: string;
};

type PlatformPeopleResponse = {
  requests: PlatformAccessRequestSummary[];
  users: PlatformUserSummary[];
  nextOffset?: number | null;
  sort?: PlatformPeopleSort;
  query?: string;
};

type PlatformPeopleSort = "recent" | "oldest" | "alpha" | "alpha-desc";

type AccountDeletionPreview = {
  targetUserId: string;
  email: string;
  displayName: string;
  mode: "deactivate_account" | "purge_trial_workspaces";
  confirmationPhrase: string;
  impactToken: string;
  ownedPublicTrialWorkspaces: Array<{
    id: string;
    name: string;
    teamCount: number;
    memberCount: number;
    historyEntryCount: number;
    activeSessionCount: number;
  }>;
};

type TeamMemberCandidateResponse = {
  users: UserSummary[];
};

type TeamMemberInviteResponse = {
  user: UserSummary;
  invitedNewUser: boolean;
  invitationDelivery: "smtp" | "manual-share" | "existing-user";
  temporaryPassword: string | null;
  secureSaveReminder: string | null;
};

type PlatformAccessRequestActionResponse = {
  user: UserSummary;
  invitedNewUser: boolean;
  invitationDelivery: "smtp" | "manual-share";
  temporaryPassword: string | null;
  secureSaveReminder: string | null;
};

type TeamMemberPasswordResetResponse = {
  user: UserSummary;
  passwordDelivery: "smtp" | "manual-share";
  temporaryPassword: string | null;
  secureSaveReminder: string | null;
};

type JiraOauthStartResponse = {
  authorizationUrl: string;
};

type JiraIssueImportResponse = {
  importedCount: number;
  pendingIssues: TeamPendingIssue[];
};

type AdminSettingsTab = "people" | "branding" | "app" | "smtp" | "super-admin";

type RouteState = {
  selectedTeamId: string | null;
  showTeamChooser: boolean;
};

type AuthStep = "signin" | "code" | "admin";
type AuthFlow = "standard" | "publicTrial";
type StatusTone = "neutral" | "success" | "error" | "busy";
type StatusState = {
  tone: StatusTone;
  text: string;
};

type PopupPosition = {
  top: number;
  left: number;
  align: "left" | "right";
};

type TimerStateLabel = "off" | "idle" | "active";
type TeamSettingsSection = "none" | "deck" | "rename" | "timezones" | "quorum" | "shortcuts";

type ShortcutDefinition = {
  keyLabel: string;
  description: string;
};

type BoardMemberPlacement = {
  member: UserSummary;
  left: number;
  top: number;
  side: "top" | "right" | "bottom" | "left";
  ring: 1 | 2 | 3;
  layer: number;
  compact: boolean;
  stackOffsetX?: number;
  stackOffsetY?: number;
};

type BoardRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

type TileFootprint = {
  width: number;
  height: number;
};

type BoardSide = "top" | "right" | "bottom" | "left";

type BoardLayoutGeometry = {
  width: number;
  height: number;
  edgePadding: number;
  centerPadding: number;
  centerRect: BoardRect;
  normalTile: TileFootprint;
  compactTile: TileFootprint;
  overflowSeed: string;
};

type BoardLayoutMode = "enough" | "compact" | "overlap" | "overflow";

type BoardLayoutResult = {
  placements: BoardMemberPlacement[];
  mode: BoardLayoutMode;
};

type BoardSizingState = {
  needsScroll: boolean;
  stageHeight: number;
};

type RingPlacementCandidate = {
  placements: BoardMemberPlacement[];
  tile: TileFootprint;
  compact: boolean;
  ratio: number;
};

type BoardSlot = {
  side: BoardSide;
  left: number;
  top: number;
  box: BoardRect;
};

type RingBoardSlot = BoardSlot & {
  ring: 2 | 3;
  compact: boolean;
  order: number;
};

type RoundStateLock = {
  teamId: string;
  roundId: string;
  reason: "reveal";
};

type PendingPresenceState = {
  teamId: string;
  activeParticipants: UserSummary[];
};

const EMPTY_HISTORY_SEARCH_FILTERS: TeamHistorySearchFilters = {
  dateFrom: null,
  dateTo: null,
  titleQuery: "",
  exactTitleMatch: false,
  commentQuery: "",
  personQuery: ""
};

const SELECTED_TEAM_KEY = "planning-poker:selected-team";
const SESSION_TOKEN_KEY = "planning-poker:session-token";
const API_TIMEOUT_MS = 10000;
const DEBUG_REVEAL_KEY = "planning-poker:debug-reveal";
const WIDE_STAGE_MIN_HEIGHT = 540;
const STACKED_STAGE_MIN_HEIGHT = 500;
const MOBILE_STAGE_MIN_HEIGHT = 460;
const DENSE_STACKED_STAGE_MIN_HEIGHT = 720;
const BOARD_STAGE_MAX_HEIGHT = 980;
const BOARD_STAGE_MIN_SHRINK_HEIGHT = 320;
const BOARD_SCROLL_ON_MARGIN = 8;
const BOARD_SCROLL_OFF_MARGIN = 24;
const BOARD_SCROLL_VIEWPORT_THRESHOLD = 800;
const CHOOSER_REFRESH_INTERVAL_MS = 3000;
const TEAM_REFRESH_INTERVAL_MS = 30000;
const ROOM_ENTRY_RESYNC_DELAY_MS = 750;
const HISTORY_RAIL_DEFAULT_WIDTH = 360;
const HISTORY_RAIL_MIN_WIDTH = 180;
const HISTORY_RAIL_MAX_WIDTH = 720;
const HISTORY_RAIL_WIDTH_KEY = "planning-poker:history-rail-width";
const STACKED_HISTORY_DEFAULT_MAX_HEIGHT = 180;
const STACKED_HISTORY_DEFAULT_HEIGHT_RATIO = 0.14;
const STACKED_HISTORY_MIN_HEIGHT = 40;
const STACKED_HISTORY_MIN_HEIGHT_RATIO = 0.1;
const STACKED_HISTORY_BOARD_MIN_HEIGHT = 320;
const STACKED_HISTORY_HEIGHT_KEY = "planning-poker:stacked-history-height";
const DEFAULT_LAYOUT_GEOMETRY: BoardLayoutGeometry = {
  width: 1000,
  height: 760,
  edgePadding: 24,
  centerPadding: 18,
  centerRect: {
    left: 360,
    top: 250,
    right: 640,
    bottom: 510
  },
  normalTile: { width: 90, height: 126 },
  compactTile: { width: 78, height: 108 },
  overflowSeed: "default"
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function isDebugLayoutGuidesEnabled() {
  if (DEBUG_LAYOUT_GUIDES_ENABLED) {
    return true;
  }

  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.localStorage.getItem(DEBUG_LAYOUT_GUIDES_KEY) === "1";
  } catch {
    return false;
  }
}

function nearlyEqual(left: number, right: number, epsilon = 1) {
  return Math.abs(left - right) <= epsilon;
}

function clampHistoryRailWidth(width: number) {
  return clamp(Math.round(width), HISTORY_RAIL_MIN_WIDTH, HISTORY_RAIL_MAX_WIDTH);
}

function getStackedHistoryMinHeight(viewportHeight: number) {
  return Math.max(STACKED_HISTORY_MIN_HEIGHT, Math.round(viewportHeight * STACKED_HISTORY_MIN_HEIGHT_RATIO));
}

function getStackedHistoryDefaultHeight(viewportHeight: number) {
  return clamp(
    Math.round(viewportHeight * STACKED_HISTORY_DEFAULT_HEIGHT_RATIO),
    getStackedHistoryMinHeight(viewportHeight),
    STACKED_HISTORY_DEFAULT_MAX_HEIGHT
  );
}

function clampStackedHistoryHeight(height: number, viewportHeight: number, maxHeight: number) {
  const minimum = getStackedHistoryMinHeight(viewportHeight);
  const maximum = Math.max(minimum, Math.round(maxHeight));
  return clamp(Math.round(height), minimum, maximum);
}

function loadHistoryRailWidthPreference() {
  if (typeof window === "undefined") {
    return HISTORY_RAIL_DEFAULT_WIDTH;
  }

  try {
    const rawValue = window.localStorage.getItem(HISTORY_RAIL_WIDTH_KEY);
    if (!rawValue) {
      return HISTORY_RAIL_DEFAULT_WIDTH;
    }
    const parsed = Number(rawValue);
    return Number.isFinite(parsed) ? clampHistoryRailWidth(parsed) : HISTORY_RAIL_DEFAULT_WIDTH;
  } catch {
    return HISTORY_RAIL_DEFAULT_WIDTH;
  }
}

function loadStackedHistoryHeightPreference() {
  const defaultHeight = getStackedHistoryDefaultHeight(getViewportSize().height);
  if (typeof window === "undefined") {
    return defaultHeight;
  }

  try {
    const rawValue = window.localStorage.getItem(STACKED_HISTORY_HEIGHT_KEY);
    if (!rawValue) {
      return defaultHeight;
    }
    const parsed = Number(rawValue);
    return Number.isFinite(parsed) ? Math.round(parsed) : defaultHeight;
  } catch {
    return defaultHeight;
  }
}

function getViewportSize() {
  if (typeof window === "undefined") {
    return { width: 1280, height: 900 };
  }
  return { width: window.innerWidth, height: window.innerHeight };
}

export function computeBoardSizingState(
  availableHeight: number,
  minimumStageHeight: number,
  viewportHeight: number,
  previous: BoardSizingState | null
): BoardSizingState {
  const roundedAvailableHeight = Math.round(availableHeight);
  if (viewportHeight >= BOARD_SCROLL_VIEWPORT_THRESHOLD) {
    return {
      needsScroll: false,
      stageHeight: clamp(roundedAvailableHeight, BOARD_STAGE_MIN_SHRINK_HEIGHT, BOARD_STAGE_MAX_HEIGHT)
    };
  }
  const nextStageHeight = clamp(roundedAvailableHeight, minimumStageHeight, BOARD_STAGE_MAX_HEIGHT);
  const nextNeedsScroll = previous
    ? previous.needsScroll
      ? roundedAvailableHeight < minimumStageHeight + BOARD_SCROLL_OFF_MARGIN
      : roundedAvailableHeight < minimumStageHeight - BOARD_SCROLL_ON_MARGIN
    : roundedAvailableHeight < minimumStageHeight;

  return {
    needsScroll: nextNeedsScroll,
    stageHeight: nextStageHeight
  };
}

function rectWidth(rect: BoardRect) {
  return Math.max(0, rect.right - rect.left);
}

function rectHeight(rect: BoardRect) {
  return Math.max(0, rect.bottom - rect.top);
}

function expandRect(rect: BoardRect, padding: number): BoardRect {
  return {
    left: rect.left - padding,
    top: rect.top - padding,
    right: rect.right + padding,
    bottom: rect.bottom + padding
  };
}

function clampRectToBounds(rect: BoardRect, width: number, height: number): BoardRect {
  return {
    left: clamp(rect.left, 0, width),
    top: clamp(rect.top, 0, height),
    right: clamp(rect.right, 0, width),
    bottom: clamp(rect.bottom, 0, height)
  };
}

function intersectsRect(a: BoardRect, b: BoardRect) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function containsRect(bounds: BoardRect, rect: BoardRect) {
  return rect.left >= bounds.left && rect.top >= bounds.top && rect.right <= bounds.right && rect.bottom <= bounds.bottom;
}

function hashString(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRandom(seed: string) {
  let state = hashString(seed) || 1;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
let revealDebugEnabled = false;

function readRouteState(): RouteState {
  if (typeof window === "undefined") {
    return { selectedTeamId: null, showTeamChooser: false };
  }

  const params = new URLSearchParams(window.location.search);
  const routeTeamId = params.get("teamId");
  const routeView = params.get("view");
  const storedTeamId = window.localStorage.getItem(SELECTED_TEAM_KEY);

  return {
    selectedTeamId: routeTeamId ?? storedTeamId,
    showTeamChooser: routeView === "teams"
  };
}

function writeRouteState(next: RouteState, historyMode: "push" | "replace" = "push") {
  if (typeof window === "undefined") {
    return;
  }

  const params = new URLSearchParams();
  if (next.showTeamChooser) {
    params.set("view", "teams");
  }
  if (next.selectedTeamId) {
    params.set("teamId", next.selectedTeamId);
  }

  const nextUrl = `${window.location.pathname}${params.size ? `?${params.toString()}` : ""}`;
  const historyMethod = historyMode === "replace" ? "replaceState" : "pushState";
  window.history[historyMethod](null, "", nextUrl);
}

function buildTeamPermalink(teamId: string): string {
  if (typeof window === "undefined") {
    return `/?teamId=${encodeURIComponent(teamId)}`;
  }

  const url = new URL(window.location.href);
  url.searchParams.delete("view");
  url.searchParams.set("teamId", teamId);
  return url.toString();
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return false;
  }

  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "-9999px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    return document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
}

function debugReveal(...args: unknown[]) {
  if (typeof window !== "undefined" && revealDebugEnabled && window.localStorage.getItem(DEBUG_REVEAL_KEY) === "1") {
    console.debug("[reveal-debug]", ...args);
  }
}

function readStoredSessionToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(SESSION_TOKEN_KEY);
}

function storeSessionToken(token: string | null) {
  if (typeof window === "undefined") {
    return;
  }

  if (token) {
    window.localStorage.setItem(SESSION_TOKEN_KEY, token);
    return;
  }

  window.localStorage.removeItem(SESSION_TOKEN_KEY);
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await authorizedFetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  return response.json() as Promise<T>;
}

async function authorizedFetch(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  let response: Response;

  try {
    const sessionToken = readStoredSessionToken();
    const headers = new Headers(init?.headers ?? {});
    if (sessionToken && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${sessionToken}`);
    }
    response = await fetch(url, {
      credentials: "include",
      headers: Object.fromEntries(headers.entries()),
      signal: controller.signal,
      ...init
    });
  } catch (error) {
    window.clearTimeout(timeoutId);
    if ((error as Error).name === "AbortError") {
      throw new Error("The request took too long. The page will refresh team state automatically.");
    }
    throw error;
  }

  window.clearTimeout(timeoutId);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error ?? "Request failed");
  }

  return response;
}

function mergeBrandingManifest(branding: Partial<BrandingManifest> | undefined): BrandingManifest {
  return {
    ...BRANDING_MANIFEST,
    ...branding,
    palette: {
      ...BRANDING_MANIFEST.palette,
      ...branding?.palette
    },
    avatarKeys: [...BRANDING_MANIFEST.avatarKeys],
    avatarIconKeys: [...BRANDING_MANIFEST.avatarIconKeys],
    avatarColorKeys: [...BRANDING_MANIFEST.avatarColorKeys]
  };
}

function getSocketUrl(teamId: string): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const url = new URL(`${protocol}//${window.location.host}/ws`);
  url.searchParams.set("teamId", teamId);
  const token = readStoredSessionToken();
  if (token) {
    url.searchParams.set("token", token);
  }
  return url.toString();
}

function getChooserSocketUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const url = new URL(`${protocol}//${window.location.host}/ws`);
  url.searchParams.set("scope", "chooser");
  const token = readStoredSessionToken();
  if (token) {
    url.searchParams.set("token", token);
  }
  return url.toString();
}

const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  { keyLabel: "1-0 - = [ ]", description: "Select the matching vote card by its visible shortcut badge." },
  { keyLabel: "R", description: "Reveal the current active round." },
  { keyLabel: "V", description: "Reopen the current revealed issue for Vote AGAIN after confirmation." },
  { keyLabel: "?", description: "Open the keyboard shortcuts help modal." },
  { keyLabel: "Enter", description: "Submit the active safe form, such as Deal, create, save, or sign-in." },
  { keyLabel: "Esc", description: "Close the currently open popup or help modal." }
];

export function shouldApplyTeamState(current: TeamStateResponse | null, next: TeamStateResponse): boolean {
  if (!current || current.team.id !== next.team.id) {
    debugReveal("accepting team state: no current state or different team", {
      currentTeam: current?.team.id ?? null,
      nextTeam: next.team.id
    });
    return true;
  }

  if (current.liveSync.roundVersion > next.liveSync.roundVersion) {
    debugReveal("rejecting team state with older round version", {
      currentRoundVersion: current.liveSync.roundVersion,
      nextRoundVersion: next.liveSync.roundVersion
    });
    return false;
  }

  if (current.liveSync.roundVersion === next.liveSync.roundVersion && current.liveSync.voteVersion > next.liveSync.voteVersion) {
    debugReveal("rejecting team state with older vote version", {
      currentVoteVersion: current.liveSync.voteVersion,
      nextVoteVersion: next.liveSync.voteVersion
    });
    return false;
  }

  const currentRound = current.activeRound;
  const nextRound = next.activeRound;

  if (currentRound && nextRound && currentRound.id === nextRound.id) {
    if (currentRound.status === "revealed" && nextRound.status === "active") {
      debugReveal("rejecting stale active round after revealed", {
        roundId: currentRound.id,
        currentStatus: currentRound.status,
        nextStatus: nextRound.status
      });
      return false;
    }

    if (currentRound.votes.length > nextRound.votes.length && nextRound.status !== "revealed") {
      debugReveal("rejecting state with fewer votes than current active round", {
        roundId: currentRound.id,
        currentVotes: currentRound.votes.length,
        nextVotes: nextRound.votes.length
      });
      return false;
    }
  }

  if (current.team.lastActivityAt > next.team.lastActivityAt) {
    debugReveal("rejecting team state with older team activity", {
      currentLastActivityAt: current.team.lastActivityAt,
      nextLastActivityAt: next.team.lastActivityAt
    });
    return false;
  }

  if (current.history.length > next.history.length) {
    debugReveal("rejecting state with shorter history", {
      currentHistory: current.history.length,
      nextHistory: next.history.length
    });
    return false;
  }

  const currentLatestHistory = current.history[0]?.completedAt;
  const nextLatestHistory = next.history[0]?.completedAt;
  if (currentLatestHistory && nextLatestHistory && currentLatestHistory > nextLatestHistory) {
    debugReveal("rejecting older latest-history timestamp", {
      currentLatestHistory,
      nextLatestHistory
    });
    return false;
  }

  debugReveal("accepting team state", {
    teamId: next.team.id,
    round: next.activeRound
      ? {
          id: next.activeRound.id,
          status: next.activeRound.status,
          votes: next.activeRound.votes.length,
          revealAverage: next.activeRound.revealAverage
        }
      : null,
    history: next.history.length
  });
  return true;
}

function sameUserSummary(left: UserSummary, right: UserSummary) {
  return (
    left.id === right.id &&
    left.email === right.email &&
    left.displayName === right.displayName &&
    left.avatarIconKey === right.avatarIconKey &&
    left.avatarColorKey === right.avatarColorKey
  );
}

function sameCurrentUserSummary(left: CurrentUserSummary, right: CurrentUserSummary) {
  return (
    sameUserSummary(left, right) &&
    left.isSuperAdmin === right.isSuperAdmin &&
    left.loginName === right.loginName &&
    left.boardShortcutsEnabled === right.boardShortcutsEnabled &&
    left.historyTimezonePopupEnabled === right.historyTimezonePopupEnabled &&
    sameHistoryTimeZoneKeys(left.historyTimezoneKeys ?? [], right.historyTimezoneKeys ?? [])
  );
}

function sameUserSummaryArray(left: UserSummary[], right: UserSummary[]) {
  return left.length === right.length && left.every((item, index) => sameUserSummary(item, right[index]!));
}

function sameTeamMemberSummary(left: TeamMemberSummary, right: TeamMemberSummary) {
  return (
    sameUserSummary(left, right) &&
    left.role === right.role &&
    left.joinedAt === right.joinedAt &&
    left.lastOpenedAt === right.lastOpenedAt
  );
}

function sameTeamMemberSummaryArray(left: TeamMemberSummary[], right: TeamMemberSummary[]) {
  return left.length === right.length && left.every((item, index) => sameTeamMemberSummary(item, right[index]!));
}

function sameHistoryTimeZoneKeys(left: readonly HistoryTimeZoneKey[], right: readonly HistoryTimeZoneKey[]) {
  return left.length === right.length && left.every((key, index) => key === right[index]);
}

function getSelectedTeamMembership(session: SessionResponse, teamId: string | null) {
  if (!teamId) {
    return null;
  }
  return session.memberships.find((membership) => membership.id === teamId) ?? null;
}

function getAccountTimezoneDefaultKeys(session: SessionResponse, teamId: string | null): readonly HistoryTimeZoneKey[] {
  return getSelectedTeamMembership(session, teamId)?.historyTimezoneKeys ?? session.memberships[0]?.historyTimezoneKeys ?? DEFAULT_HISTORY_TIME_ZONE_KEYS;
}

function getAccountUserForTeam(session: SessionResponse, teamId: string | null): CurrentUserSummary {
  const membership = getSelectedTeamMembership(session, teamId);
  return {
    ...session.user,
    historyTimezonePopupEnabled: membership?.currentUserHistoryTimezonePopupEnabled ?? true,
    historyTimezoneKeys: membership?.currentUserHistoryTimezoneKeys ?? null
  };
}

function getEffectiveHistoryTimezoneKeys(currentUser: CurrentUserSummary, teamKeys: readonly HistoryTimeZoneKey[]): HistoryTimeZoneKey[] {
  return currentUser.historyTimezoneKeys?.length ? [...currentUser.historyTimezoneKeys] : [...teamKeys];
}

type HistoryTimezonePreferenceOverride = {
  historyTimezonePopupEnabled: boolean;
  historyTimezoneKeys: HistoryTimeZoneKey[] | null;
};

function applyHistoryTimezonePreferenceOverride(
  state: TeamStateResponse,
  override: HistoryTimezonePreferenceOverride | undefined
): TeamStateResponse {
  if (!override) {
    return state;
  }

  const patchMembership = (membership: TeamMembershipSummary): TeamMembershipSummary =>
    membership.id === state.team.id
      ? {
          ...membership,
          currentUserHistoryTimezonePopupEnabled: override.historyTimezonePopupEnabled,
          currentUserHistoryTimezoneKeys: override.historyTimezoneKeys
        }
      : membership;

  return {
    ...state,
    currentUser: {
      ...state.currentUser,
      historyTimezonePopupEnabled: override.historyTimezonePopupEnabled,
      historyTimezoneKeys: override.historyTimezoneKeys
    },
    memberships: state.memberships.map(patchMembership),
    availableTeams: state.availableTeams.map(patchMembership)
  };
}

function ensureCurrentMemberVisibleInActiveParticipants(state: TeamStateResponse): TeamStateResponse {
  const activeParticipants = getVisibleActiveParticipants(state);
  if (activeParticipants === state.activeParticipants) {
    return state;
  }

  return {
    ...state,
    activeParticipants
  };
}

function sameTeamMembershipSummary(left: TeamMembershipSummary, right: TeamMembershipSummary) {
  return (
    left.id === right.id &&
    left.name === right.name &&
    left.slug === right.slug &&
    left.demo === right.demo &&
    left.deckKey === right.deckKey &&
    left.fibonacciRangeStart === right.fibonacciRangeStart &&
    left.fibonacciRangeEnd === right.fibonacciRangeEnd &&
    left.timerSeconds === right.timerSeconds &&
    left.iconKey === right.iconKey &&
    left.logoOpacity === right.logoOpacity &&
    left.backgroundOpacity === right.backgroundOpacity &&
    left.historyTimezonePopupEnabled === right.historyTimezonePopupEnabled &&
    sameHistoryTimeZoneKeys(left.historyTimezoneKeys, right.historyTimezoneKeys) &&
    left.currentUserHistoryTimezonePopupEnabled === right.currentUserHistoryTimezonePopupEnabled &&
    sameHistoryTimeZoneKeys(left.currentUserHistoryTimezoneKeys ?? [], right.currentUserHistoryTimezoneKeys ?? []) &&
    left.minimumVotePercentEnabled === right.minimumVotePercentEnabled &&
    left.minimumVotePercent === right.minimumVotePercent &&
    left.archived === right.archived &&
    left.lastActivityAt === right.lastActivityAt &&
    left.memberCount === right.memberCount &&
    left.currentUserRole === right.currentUserRole &&
    left.joinRequestStatus === right.joinRequestStatus &&
    left.lastOpenedAt === right.lastOpenedAt
  );
}

function sameTeamMembershipSummaryArray(left: TeamMembershipSummary[], right: TeamMembershipSummary[]) {
  return left.length === right.length && left.every((item, index) => sameTeamMembershipSummary(item, right[index]!));
}

function sameVoteRecord(left: RoundState["votes"][number], right: RoundState["votes"][number]) {
  return (
    left.userId === right.userId &&
    left.displayName === right.displayName &&
    left.avatarIconKey === right.avatarIconKey &&
    left.avatarColorKey === right.avatarColorKey &&
    left.value === right.value
  );
}

function sameVoteRecordArray(left: RoundState["votes"], right: RoundState["votes"]) {
  return left.length === right.length && left.every((item, index) => sameVoteRecord(item, right[index]!));
}

function samePendingIssue(left: TeamPendingIssue, right: TeamPendingIssue) {
  return (
    left.id === right.id &&
    left.source === right.source &&
    left.externalIssueId === right.externalIssueId &&
    left.issueKey === right.issueKey &&
    left.title === right.title &&
    left.displayTitle === right.displayTitle &&
    left.importedAt === right.importedAt &&
    left.updatedAt === right.updatedAt
  );
}

function samePendingIssueArray(left: TeamPendingIssue[] | null | undefined, right: TeamPendingIssue[] | null | undefined) {
  const normalizedLeft = left ?? [];
  const normalizedRight = right ?? [];
  return (
    normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((item, index) => samePendingIssue(item, normalizedRight[index]!))
  );
}

function sameRoundState(left: RoundState | null, right: RoundState | null) {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return (
    left.id === right.id &&
    left.teamId === right.teamId &&
    left.title === right.title &&
    left.deckKey === right.deckKey &&
    left.fibonacciRangeStart === right.fibonacciRangeStart &&
    left.fibonacciRangeEnd === right.fibonacciRangeEnd &&
    left.status === right.status &&
    left.createdAt === right.createdAt &&
    left.timerStartedAt === right.timerStartedAt &&
    left.timerExpiresAt === right.timerExpiresAt &&
    left.revealedAt === right.revealedAt &&
    left.revealAverage === right.revealAverage &&
    left.quorumBlocked === right.quorumBlocked &&
    left.votedCount === right.votedCount &&
    left.notVotedCount === right.notVotedCount &&
    left.revoteHistoryEntryId === right.revoteHistoryEntryId &&
    sameVoteRecordArray(left.votes, right.votes)
  );
}

function sameLiveSyncState(
  left: TeamStateResponse["liveSync"] | null | undefined,
  right: TeamStateResponse["liveSync"] | null | undefined
) {
  if (!left && !right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return (
    left.teamId === right.teamId &&
    left.roundId === right.roundId &&
    left.roundVersion === right.roundVersion &&
    left.voteVersion === right.voteVersion
  );
}

export function applyOptimisticVoteToTeamState(
  state: TeamStateResponse,
  teamId: string,
  roundId: string,
  user: CurrentUserSummary,
  value: string
): TeamStateResponse {
  const activeRound = state.activeRound;
  if (!activeRound || activeRound.status !== "active" || state.team.id !== teamId || activeRound.id !== roundId) {
    return state;
  }

  const nextVote = {
    userId: user.id,
    displayName: user.displayName,
    avatarIconKey: user.avatarIconKey,
    avatarColorKey: user.avatarColorKey,
    value
  } satisfies RoundState["votes"][number];
  const existingIndex = activeRound.votes.findIndex((vote) => vote.userId === user.id);
  if (existingIndex !== -1 && sameVoteRecord(activeRound.votes[existingIndex]!, nextVote)) {
    return state;
  }

  const nextVotes =
    existingIndex === -1
      ? [...activeRound.votes, nextVote]
      : activeRound.votes.map((vote, index) => (index === existingIndex ? nextVote : vote));
  nextVotes.sort((left, right) => left.displayName.localeCompare(right.displayName));

  const nextActiveRound: RoundState = {
    ...activeRound,
    votes: nextVotes,
    votedCount: nextVotes.length,
    notVotedCount: Math.max(0, state.teamMembers.length - nextVotes.length)
  };
  if (sameRoundState(activeRound, nextActiveRound)) {
    return state;
  }

  return {
    ...state,
    activeRound: nextActiveRound
  };
}

function applyAuthoritativeRoundToTeamState(state: TeamStateResponse, teamId: string, round: RoundState): TeamStateResponse {
  if (state.team.id !== teamId || sameRoundState(state.activeRound, round)) {
    return state;
  }

  return {
    ...state,
    activeRound: round
  };
}

function applyRoundUpdateToPendingIssues(currentPendingIssues: TeamPendingIssue[], nextRound: RoundState | null) {
  if (!nextRound || nextRound.status !== "revealed" || !nextRound.pendingIssueId) {
    return currentPendingIssues;
  }

  const nextPendingIssues = currentPendingIssues.filter((issue) => issue.id !== nextRound.pendingIssueId);
  return samePendingIssueArray(currentPendingIssues, nextPendingIssues) ? currentPendingIssues : nextPendingIssues;
}

export function applyTeamRoundUpdateToState(state: TeamStateResponse, next: TeamRoundUpdatePayload): TeamStateResponse {
  if (state.team.id !== next.teamId) {
    return state;
  }

  const nextPendingIssues = applyRoundUpdateToPendingIssues(state.pendingIssues, next.activeRound);
  const nextState: TeamStateResponse = {
    ...state,
    activeRound: next.activeRound,
    history: mergeLatestHistoryEntry(state.history, next.historyEntry),
    pendingIssues: nextPendingIssues,
    liveSync: next.liveSync
  };

  return sameTeamStateResponse(state, nextState) ? state : nextState;
}

type TeamStateBoardCache = {
  memberByIndex: TeamStateResponse["teamMembers"];
  memberByUserId: Map<string, UserSummary>;
  orderByUserId: Map<string, number>;
  voteIndexByUserId: Map<string, number>;
};

const teamStateBoardCache = new WeakMap<TeamStateResponse, TeamStateBoardCache>();

function indexVotesByUserId(votes: RoundState["votes"]) {
  const voteIndexByUserId = new Map<string, number>();
  votes.forEach((vote, index) => {
    voteIndexByUserId.set(vote.userId, index);
  });
  return voteIndexByUserId;
}

function getTeamStateBoardCache(state: TeamStateResponse): TeamStateBoardCache {
  const existing = teamStateBoardCache.get(state);
  if (existing) {
    return existing;
  }

  const memberByUserId = new Map<string, UserSummary>();
  state.teamMembers.forEach((member, index) => {
    memberByUserId.set(member.id, member);
  });
  state.activeParticipants.forEach((participant) => {
    if (!memberByUserId.has(participant.id)) {
      memberByUserId.set(participant.id, participant);
    }
  });

  const orderByUserId = new Map<string, number>();
  state.teamMembers.forEach((member, index) => {
    orderByUserId.set(member.id, index);
  });

  const created: TeamStateBoardCache = {
    memberByIndex: state.teamMembers,
    memberByUserId,
    orderByUserId,
    voteIndexByUserId: indexVotesByUserId(state.activeRound?.votes ?? [])
  };
  teamStateBoardCache.set(state, created);
  return created;
}

function buildVoteRecordForTeamState(
  state: TeamStateResponse,
  boardCache: TeamStateBoardCache,
  userId: string,
  existing: RoundState["votes"][number] | undefined,
  viewerVoteValue: string | null
): RoundState["votes"][number] | null {
  if (existing) {
    return {
      ...existing,
      value: existing.userId === state.currentUser.id ? viewerVoteValue ?? existing.value : "hidden"
    };
  }

  const member = boardCache.memberByUserId.get(userId);
  if (!member) {
    return null;
  }

  return {
    userId,
    displayName: member.displayName,
    avatarIconKey: member.avatarIconKey,
    avatarColorKey: member.avatarColorKey,
    value: userId === state.currentUser.id ? viewerVoteValue ?? "hidden" : "hidden"
  };
}

export function applyTeamRoundVoteUpdateToState(state: TeamStateResponse, next: TeamRoundVoteUpdatePayload): TeamStateResponse {
  if (state.team.id !== next.teamId || !state.activeRound || state.activeRound.status !== "active" || state.activeRound.id !== next.roundId) {
    return state;
  }

  const boardCache = getTeamStateBoardCache(state);
  const existingVotesByUserId = new Map(state.activeRound.votes.map((vote) => [vote.userId, vote]));
  let nextVoteIndexByUserId = new Map(boardCache.voteIndexByUserId);
  let nextVotes = state.activeRound.votes;
  for (const memberIndex of next.changedMemberIndexes) {
    const member = boardCache.memberByIndex[memberIndex];
    if (!member) {
      continue;
    }
    const vote = buildVoteRecordForTeamState(state, boardCache, member.id, existingVotesByUserId.get(member.id), next.viewerVoteValue);
    if (!vote) {
      continue;
    }

    const existingIndex = nextVoteIndexByUserId.get(member.id) ?? -1;
    if (existingIndex !== -1) {
      if (nextVotes[existingIndex] === vote || sameVoteRecord(nextVotes[existingIndex]!, vote)) {
        continue;
      }
      nextVotes = nextVotes.map((entry, index) => (index === existingIndex ? vote : entry));
      continue;
    }

    const targetOrder = boardCache.orderByUserId.get(member.id) ?? Number.MAX_SAFE_INTEGER;
    const insertAt = nextVotes.findIndex((entry) => (boardCache.orderByUserId.get(entry.userId) ?? Number.MAX_SAFE_INTEGER) > targetOrder);
    if (insertAt === -1) {
      nextVotes = [...nextVotes, vote];
    } else {
      nextVotes = [...nextVotes.slice(0, insertAt), vote, ...nextVotes.slice(insertAt)];
    }
    nextVoteIndexByUserId = indexVotesByUserId(nextVotes);
  }

  const nextActiveRound: RoundState = {
    ...state.activeRound,
    votes: nextVotes,
    votedCount: next.votedCount,
    notVotedCount: next.notVotedCount
  };
  if (sameRoundState(state.activeRound, nextActiveRound)) {
    if (sameLiveSyncState(state.liveSync, next.liveSync)) {
      return state;
    }
    return {
      ...state,
      liveSync: next.liveSync
    };
  }

  const nextState = {
    ...state,
    activeRound: nextActiveRound,
    liveSync: next.liveSync
  };
  teamStateBoardCache.set(nextState, {
    memberByIndex: boardCache.memberByIndex,
    memberByUserId: boardCache.memberByUserId,
    orderByUserId: boardCache.orderByUserId,
    voteIndexByUserId: nextVoteIndexByUserId
  });
  return nextState;
}

function sameHistoryComment(left: HistoryComment, right: HistoryComment) {
  return (
    left.id === right.id &&
    left.historyEntryId === right.historyEntryId &&
    sameUserSummary(left.author, right.author) &&
    left.authorSignature === right.authorSignature &&
    left.body === right.body &&
    left.createdAt === right.createdAt &&
    left.updatedAt === right.updatedAt &&
    left.importedImmutable === right.importedImmutable
  );
}

function sameHistoryCommentArray(left: HistoryComment[], right: HistoryComment[]) {
  return left.length === right.length && left.every((comment, index) => sameHistoryComment(comment, right[index]!));
}

function sameHistoryEntry(left: HistoryEntry, right: HistoryEntry) {
  return (
    left.id === right.id &&
    left.teamId === right.teamId &&
    left.title === right.title &&
    left.deckKey === right.deckKey &&
    left.fibonacciRangeStart === right.fibonacciRangeStart &&
    left.fibonacciRangeEnd === right.fibonacciRangeEnd &&
    left.averageScore === right.averageScore &&
    left.participantCount === right.participantCount &&
    left.quorumBlocked === right.quorumBlocked &&
    left.votedCount === right.votedCount &&
    left.notVotedCount === right.notVotedCount &&
    left.completedAt === right.completedAt &&
    sameVoteRecordArray(left.votes, right.votes) &&
    sameHistoryCommentArray(left.comments, right.comments)
  );
}

function sameHistoryEntryArray(left: HistoryEntry[], right: HistoryEntry[]) {
  return left.length === right.length && left.every((item, index) => sameHistoryEntry(item, right[index]!));
}

function sameNotificationSummary(left: NotificationSummary, right: NotificationSummary) {
  return (
    left.id === right.id &&
    left.kind === right.kind &&
    left.title === right.title &&
    left.message === right.message &&
    left.teamId === right.teamId &&
    left.teamName === right.teamName &&
    left.actorDisplayName === right.actorDisplayName &&
    left.createdAt === right.createdAt &&
    left.seenAt === right.seenAt
  );
}

function sameNotificationSummaryArray(left: NotificationSummary[], right: NotificationSummary[]) {
  return left.length === right.length && left.every((item, index) => sameNotificationSummary(item, right[index]!));
}

function samePendingJoinRequestSummary(left: PendingJoinRequestSummary, right: PendingJoinRequestSummary) {
  return (
    left.id === right.id &&
    left.teamId === right.teamId &&
    left.teamName === right.teamName &&
    left.createdAt === right.createdAt &&
    sameUserSummary(left.requester, right.requester)
  );
}

function samePendingJoinRequestSummaryArray(left: PendingJoinRequestSummary[], right: PendingJoinRequestSummary[]) {
  return left.length === right.length && left.every((item, index) => samePendingJoinRequestSummary(item, right[index]!));
}

function samePlatformAccessRequestSummary(left: PlatformAccessRequestSummary, right: PlatformAccessRequestSummary) {
  return left.id === right.id && left.email === right.email && left.createdAt === right.createdAt;
}

function samePlatformAccessRequestSummaryArray(left: PlatformAccessRequestSummary[], right: PlatformAccessRequestSummary[]) {
  return left.length === right.length && left.every((item, index) => samePlatformAccessRequestSummary(item, right[index]!));
}

function sameActionHistoryPage(left: ActionHistoryPage | null | undefined, right: ActionHistoryPage | null | undefined) {
  if (!left && !right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return sameNotificationSummaryArray(left.items, right.items) && left.nextCursor === right.nextCursor;
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

function mergeLatestHistoryEntry(currentHistory: HistoryEntry[], nextEntry: HistoryEntry | null) {
  if (!nextEntry) {
    return currentHistory;
  }

  const existingIndex = currentHistory.findIndex((entry) => entry.id === nextEntry.id);
  if (existingIndex === -1) {
    return [nextEntry, ...currentHistory];
  }

  if (sameHistoryEntry(currentHistory[existingIndex]!, nextEntry)) {
    return currentHistory;
  }

  const nextHistory = [...currentHistory];
  nextHistory[existingIndex] = nextEntry;
  return nextHistory;
}

function replaceHistoryEntry(currentHistory: HistoryEntry[], nextEntry: HistoryEntry): HistoryEntry[] {
  const existingIndex = currentHistory.findIndex((entry) => entry.id === nextEntry.id);
  if (existingIndex === -1) {
    return currentHistory;
  }

  if (sameHistoryEntry(currentHistory[existingIndex]!, nextEntry)) {
    return currentHistory;
  }

  const nextHistory = [...currentHistory];
  nextHistory[existingIndex] = nextEntry;
  return nextHistory;
}

function shouldApplyTeamRoundUpdate(current: TeamStateResponse | null, next: TeamRoundUpdatePayload): boolean {
  if (!current || current.team.id !== next.teamId) {
    return false;
  }

  if (next.liveSync.roundVersion < current.liveSync.roundVersion) {
    return false;
  }

  const currentRound = current.activeRound;
  const nextRound = next.activeRound;

  if (currentRound && nextRound && currentRound.id === nextRound.id) {
    if (currentRound.status === "revealed" && nextRound.status === "active") {
      return false;
    }

    if (currentRound.votes.length > nextRound.votes.length && nextRound.status !== "revealed") {
      return false;
    }
  }

  if (next.historyEntry && current.history[0] && current.history[0]!.completedAt > next.historyEntry.completedAt) {
    return false;
  }

  return true;
}

function shouldApplyTeamRoundVoteUpdate(current: TeamStateResponse | null, next: TeamRoundVoteUpdatePayload): boolean {
  if (!current || current.team.id !== next.teamId || !current.activeRound || current.activeRound.status !== "active") {
    return false;
  }

  if (current.activeRound.id !== next.roundId) {
    return false;
  }

  if (next.liveSync.roundVersion !== current.liveSync.roundVersion) {
    return false;
  }

  if (next.fromVoteVersion !== current.liveSync.voteVersion) {
    return false;
  }

  return true;
}

function sameTeamSummary(left: TeamStateResponse["team"], right: TeamStateResponse["team"]) {
  return (
    left.id === right.id &&
    left.name === right.name &&
    left.slug === right.slug &&
    left.demo === right.demo &&
    left.deckKey === right.deckKey &&
    left.fibonacciRangeStart === right.fibonacciRangeStart &&
    left.fibonacciRangeEnd === right.fibonacciRangeEnd &&
    left.timerSeconds === right.timerSeconds &&
    left.iconKey === right.iconKey &&
    left.logoOpacity === right.logoOpacity &&
    left.backgroundOpacity === right.backgroundOpacity &&
    left.historyTimezonePopupEnabled === right.historyTimezonePopupEnabled &&
    sameHistoryTimeZoneKeys(left.historyTimezoneKeys, right.historyTimezoneKeys) &&
    left.archived === right.archived &&
    left.lastActivityAt === right.lastActivityAt
  );
}

function sameTeamStateResponse(left: TeamStateResponse | null, right: TeamStateResponse) {
  if (!left) {
    return false;
  }
  return (
    sameTeamSummary(left.team, right.team) &&
    sameTeamMembershipSummaryArray(left.memberships, right.memberships) &&
    sameTeamMembershipSummaryArray(left.availableTeams, right.availableTeams) &&
    sameTeamMemberSummaryArray(left.teamMembers, right.teamMembers) &&
    sameUserSummaryArray(left.activeParticipants, right.activeParticipants) &&
    sameRoundState(left.activeRound, right.activeRound) &&
    samePendingIssueArray(left.pendingIssues, right.pendingIssues) &&
    sameHistoryEntryArray(left.history, right.history) &&
    sameCurrentUserSummary(left.currentUser, right.currentUser) &&
    left.currentUserRole === right.currentUserRole &&
    sameLiveSyncState(left.liveSync, right.liveSync)
  );
}

function sameSessionResponse(left: SessionResponse | null, right: SessionResponse) {
  if (!left) {
    return false;
  }
  return (
    sameCurrentUserSummary(left.user, right.user) &&
    sameTeamMembershipSummaryArray(left.memberships, right.memberships) &&
    sameTeamMembershipSummaryArray(left.availableTeams, right.availableTeams) &&
    left.token === right.token
  );
}

function getEdgeSafeRect(geometry: BoardLayoutGeometry): BoardRect {
  return {
    left: geometry.edgePadding,
    top: geometry.edgePadding,
    right: geometry.width - geometry.edgePadding,
    bottom: geometry.height - geometry.edgePadding
  };
}

function getCenterSafeRect(geometry: BoardLayoutGeometry): BoardRect {
  return clampRectToBounds(expandRect(geometry.centerRect, geometry.centerPadding), geometry.width, geometry.height);
}

function getTimerRemainingSeconds(expiresAt: string | null, nowMs: number): number | null {
  if (!expiresAt) {
    return null;
  }

  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - nowMs) / 1000));
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

function buildAnchorRect(edgeSafeRect: BoardRect, centerSafeRect: BoardRect, tile: TileFootprint, ratio: number): BoardRect {
  const anchorEdgeRect = {
    left: edgeSafeRect.left + tile.width,
    top: edgeSafeRect.top + tile.height,
    right: edgeSafeRect.right - tile.width,
    bottom: edgeSafeRect.bottom - tile.height
  };
  return {
    left: centerSafeRect.left + (anchorEdgeRect.left - centerSafeRect.left) * ratio,
    top: centerSafeRect.top + (anchorEdgeRect.top - centerSafeRect.top) * ratio,
    right: centerSafeRect.right + (anchorEdgeRect.right - centerSafeRect.right) * ratio,
    bottom: centerSafeRect.bottom + (anchorEdgeRect.bottom - centerSafeRect.bottom) * ratio
  };
}

function interpolateRect(innerRect: BoardRect, outerRect: BoardRect, ratio: number): BoardRect {
  return {
    left: innerRect.left + (outerRect.left - innerRect.left) * ratio,
    top: innerRect.top + (outerRect.top - innerRect.top) * ratio,
    right: innerRect.right + (outerRect.right - innerRect.right) * ratio,
    bottom: innerRect.bottom + (outerRect.bottom - innerRect.bottom) * ratio
  };
}

function distributeEvenly(start: number, end: number, count: number) {
  if (count <= 0) {
    return [] as number[];
  }
  if (count === 1) {
    return [(start + end) / 2];
  }
  const step = (end - start) / (count - 1);
  return Array.from({ length: count }, (_, index) => start + step * index);
}

function getSideSpan(rect: BoardRect, side: BoardSide) {
  return side === "top" || side === "bottom" ? rectWidth(rect) : rectHeight(rect);
}

function getSideCapacity(rect: BoardRect, tile: TileFootprint, side: BoardSide) {
  const span = getSideSpan(rect, side);
  const axis = side === "top" || side === "bottom" ? tile.width : tile.height;
  if (span <= 0 || axis <= 0) {
    return 0;
  }
  return Math.max(1, Math.floor(span / axis));
}

function allocateSideCounts(total: number, rect: BoardRect, tile: TileFootprint): Record<BoardSide, number> {
  const sideOrder: BoardSide[] = ["top", "bottom", "right", "left"];
  const counts: Record<BoardSide, number> = { top: 0, right: 0, bottom: 0, left: 0 };
  const capacities: Record<BoardSide, number> = {
    top: getSideCapacity(rect, tile, "top"),
    right: getSideCapacity(rect, tile, "right"),
    bottom: getSideCapacity(rect, tile, "bottom"),
    left: getSideCapacity(rect, tile, "left")
  };
  const spans: Record<BoardSide, number> = {
    top: getSideSpan(rect, "top"),
    right: getSideSpan(rect, "right"),
    bottom: getSideSpan(rect, "bottom"),
    left: getSideSpan(rect, "left")
  };
  const totalSpan = sideOrder.reduce((sum, side) => sum + spans[side], 0);

  if (total <= 0 || totalSpan <= 0) {
    return counts;
  }

  if (total <= 16) {
    if (total % 4 === 0 && sideOrder.every((side) => capacities[side] >= total / 4)) {
      sideOrder.forEach((side) => {
        counts[side] = total / 4;
      });
      return counts;
    }

    let remaining = total;
    const balancedOrder: BoardSide[] = ["top", "right", "bottom", "left"];
    while (remaining > 0) {
      const nextSide = balancedOrder
        .filter((side) => counts[side] < capacities[side])
        .sort((left, right) => {
          if (counts[left] !== counts[right]) {
            return counts[left] - counts[right];
          }
          if (capacities[right] !== capacities[left]) {
            return capacities[right] - capacities[left];
          }
          return balancedOrder.indexOf(left) - balancedOrder.indexOf(right);
        })[0];
      if (!nextSide) {
        break;
      }
      counts[nextSide] += 1;
      remaining -= 1;
    }
    return counts;
  }

  if (total >= 4 && sideOrder.every((side) => capacities[side] > 0)) {
    sideOrder.forEach((side) => {
      counts[side] = 1;
    });
  }

  let remaining = total - sideOrder.reduce((sum, side) => sum + counts[side], 0);

  while (remaining > 0) {
    const next = sideOrder
      .filter((side) => counts[side] < capacities[side])
      .sort((left, right) => {
        const leftLoad = counts[left] / Math.max(1, capacities[left]);
        const rightLoad = counts[right] / Math.max(1, capacities[right]);
        if (leftLoad !== rightLoad) {
          return leftLoad - rightLoad;
        }
        const leftRemaining = capacities[left] - counts[left];
        const rightRemaining = capacities[right] - counts[right];
        if (rightRemaining !== leftRemaining) {
          return rightRemaining - leftRemaining;
        }
        if (spans[right] !== spans[left]) {
          return spans[right] - spans[left];
        }
        return sideOrder.indexOf(left) - sideOrder.indexOf(right);
      })[0];
    if (!next) {
      break;
    }
    counts[next] += 1;
    remaining -= 1;
  }

  return counts;
}

function scoreSideCounts(
  total: number,
  counts: Record<BoardSide, number>,
  capacities: Record<BoardSide, number>,
  spans: Record<BoardSide, number>
) {
  const sideOrder: BoardSide[] = ["top", "bottom", "right", "left"];
  const usedSides = sideOrder.filter((side) => counts[side] > 0);
  const loads = usedSides.map((side) => counts[side] / Math.max(1, capacities[side]));
  const maxLoad = loads.length ? Math.max(...loads) : 1;
  const minLoad = loads.length ? Math.min(...loads) : 0;
  const loadSpread = maxLoad - minLoad;
  const pairBalance = Math.abs(counts.top - counts.bottom) + Math.abs(counts.left - counts.right);
  const totalHorizontal = counts.top + counts.bottom;
  const totalVertical = counts.left + counts.right;
  const axisImbalance = Math.abs(totalHorizontal - totalVertical);
  const spanWeightedUse = sideOrder.reduce((sum, side) => sum + counts[side] * spans[side], 0);
  const targetPerSide = total / sideOrder.length;
  const targetImbalance = sideOrder.reduce((sum, side) => sum + Math.abs(counts[side] - targetPerSide), 0);
  const countSpread = Math.max(...sideOrder.map((side) => counts[side])) - Math.min(...sideOrder.map((side) => counts[side]));
  const prefersHorizontalAxis = spans.top + spans.bottom >= spans.left + spans.right;
  const primaryAxisAdvantage = prefersHorizontalAxis ? totalHorizontal - totalVertical : totalVertical - totalHorizontal;

  return {
    usedSides: usedSides.length,
    maxLoad,
    loadSpread,
    targetImbalance,
    countSpread,
    primaryAxisAdvantage,
    pairBalance,
    axisImbalance,
    totalHorizontal,
    spanWeightedUse
  };
}

function buildSideCountCandidates(total: number, rect: BoardRect, tile: TileFootprint) {
  const heuristic = allocateSideCounts(total, rect, tile);
  if (total <= 0) {
    return [heuristic];
  }

  const capacities: Record<BoardSide, number> = {
    top: getSideCapacity(rect, tile, "top"),
    right: getSideCapacity(rect, tile, "right"),
    bottom: getSideCapacity(rect, tile, "bottom"),
    left: getSideCapacity(rect, tile, "left")
  };
  const spans: Record<BoardSide, number> = {
    top: getSideSpan(rect, "top"),
    right: getSideSpan(rect, "right"),
    bottom: getSideSpan(rect, "bottom"),
    left: getSideSpan(rect, "left")
  };

  if (total > 32) {
    return [heuristic];
  }

  const candidates: Record<BoardSide, number>[] = [];
  for (let top = 0; top <= Math.min(capacities.top, total); top += 1) {
    const remainingAfterTop = total - top;
    for (let bottom = 0; bottom <= Math.min(capacities.bottom, remainingAfterTop); bottom += 1) {
      const remainingAfterBottom = remainingAfterTop - bottom;
      for (let right = 0; right <= Math.min(capacities.right, remainingAfterBottom); right += 1) {
        const left = remainingAfterBottom - right;
        if (left < 0 || left > capacities.left) {
          continue;
        }
        candidates.push({ top, right, bottom, left });
      }
    }
  }

  if (!candidates.length) {
    return [heuristic];
  }

  const uniqueCandidates = new Map<string, Record<BoardSide, number>>();
  uniqueCandidates.set(JSON.stringify(heuristic), heuristic);
  for (const candidate of candidates) {
    uniqueCandidates.set(JSON.stringify(candidate), candidate);
  }

  return [...uniqueCandidates.values()].sort((left, right) => {
    const leftScore = scoreSideCounts(total, left, capacities, spans);
    const rightScore = scoreSideCounts(total, right, capacities, spans);
    if (rightScore.usedSides !== leftScore.usedSides) {
      return rightScore.usedSides - leftScore.usedSides;
    }
    if (leftScore.targetImbalance !== rightScore.targetImbalance) {
      return leftScore.targetImbalance - rightScore.targetImbalance;
    }
    if (leftScore.countSpread !== rightScore.countSpread) {
      return leftScore.countSpread - rightScore.countSpread;
    }
    if (rightScore.primaryAxisAdvantage !== leftScore.primaryAxisAdvantage) {
      return rightScore.primaryAxisAdvantage - leftScore.primaryAxisAdvantage;
    }
    if (leftScore.maxLoad !== rightScore.maxLoad) {
      return leftScore.maxLoad - rightScore.maxLoad;
    }
    if (leftScore.loadSpread !== rightScore.loadSpread) {
      return leftScore.loadSpread - rightScore.loadSpread;
    }
    if (leftScore.pairBalance !== rightScore.pairBalance) {
      return leftScore.pairBalance - rightScore.pairBalance;
    }
    if (leftScore.axisImbalance !== rightScore.axisImbalance) {
      return leftScore.axisImbalance - rightScore.axisImbalance;
    }
    if (rightScore.totalHorizontal !== leftScore.totalHorizontal) {
      return rightScore.totalHorizontal - leftScore.totalHorizontal;
    }
    return rightScore.spanWeightedUse - leftScore.spanWeightedUse;
  });
}

function getTileBox(left: number, top: number, side: BoardMemberPlacement["side"], tile: TileFootprint): BoardRect {
  switch (side) {
    case "top":
      return { left: left - tile.width / 2, top: top - tile.height, right: left + tile.width / 2, bottom: top };
    case "right":
      return { left, top: top - tile.height / 2, right: left + tile.width, bottom: top + tile.height / 2 };
    case "bottom":
      return { left: left - tile.width / 2, top, right: left + tile.width / 2, bottom: top + tile.height };
    case "left":
      return { left: left - tile.width, top: top - tile.height / 2, right: left, bottom: top + tile.height / 2 };
  }
}

function createRectPlacements(
  members: UserSummary[],
  rect: BoardRect,
  ring: 1 | 2 | 3,
  tile: TileFootprint,
  compact: boolean,
  sideCounts = allocateSideCounts(members.length, rect, tile)
): BoardMemberPlacement[] {
  const width = rectWidth(rect);
  const height = rectHeight(rect);
  if (!members.length || width <= 0 || height <= 0) {
    return [];
  }
  const placements: BoardMemberPlacement[] = [];
  let memberIndex = 0;

  const pushSidePlacements = (side: BoardSide, coordinates: number[]) => {
    for (const coordinate of coordinates) {
      const member = members[memberIndex++];
      if (!member) {
        break;
      }
      const box =
        side === "top"
          ? getTileBox(coordinate, rect.top, side, tile)
          : side === "right"
            ? getTileBox(rect.right, coordinate, side, tile)
            : side === "bottom"
              ? getTileBox(coordinate, rect.bottom, side, tile)
              : getTileBox(rect.left, coordinate, side, tile);
      placements.push({
        member,
        left: box.left,
        top: box.top,
        side,
        ring,
        layer: 0,
        compact
      });
    }
  };

  // Corners are legal placement points in the measured rectangular layout system.
  // Do not trim side spans just because adjacent sides are populated; that would
  // reintroduce artificial corner dead-zones and underuse the available perimeter.
  const topStart = rect.left + tile.width / 2;
  const topEnd = rect.right - tile.width / 2;
  const bottomStart = rect.left + tile.width / 2;
  const bottomEnd = rect.right - tile.width / 2;
  const rightStart = rect.top + tile.height / 2;
  const rightEnd = rect.bottom - tile.height / 2;
  const leftStart = rect.top + tile.height / 2;
  const leftEnd = rect.bottom - tile.height / 2;

  pushSidePlacements("top", distributeEvenly(topStart, topEnd, sideCounts.top));
  pushSidePlacements("right", distributeEvenly(rightStart, rightEnd, sideCounts.right));
  pushSidePlacements("bottom", distributeEvenly(bottomEnd, bottomStart, sideCounts.bottom));
  pushSidePlacements("left", distributeEvenly(leftEnd, leftStart, sideCounts.left));

  while (memberIndex < members.length) {
    const member = members[memberIndex]!;
    const box = getTileBox((rect.left + rect.right) / 2, rect.top, "top", tile);
    placements.push({
      member,
      left: box.left,
      top: box.top,
      side: "top",
      ring,
      layer: 0,
      compact
    });
    memberIndex += 1;
  }

  return placements;
}

function getPlacementBoxes(placements: BoardMemberPlacement[], tile: TileFootprint) {
  return placements.map((placement) => getVisualPlacementBox(placement, tile));
}

function getVisualPlacementBox(placement: BoardMemberPlacement, tile: TileFootprint): BoardRect {
  const offsetX = placement.layer * (placement.stackOffsetX ?? 0);
  const offsetY = placement.layer * (placement.stackOffsetY ?? 0);
  return {
    left: placement.left + offsetX,
    top: placement.top + offsetY,
    right: placement.left + offsetX + tile.width,
    bottom: placement.top + offsetY + tile.height
  };
}

function getVisibleCardBox(placement: BoardMemberPlacement, tile: TileFootprint): BoardRect {
  const offsetX = placement.layer * (placement.stackOffsetX ?? 0);
  const offsetY = placement.layer * (placement.stackOffsetY ?? 0);
  const cardWidth = Math.min(tile.width, placement.compact ? 48 : 58);
  const cardHeight = Math.min(tile.height, placement.compact ? 64 : 76);
  const left = placement.left + offsetX + Math.max(0, (tile.width - cardWidth) / 2);
  const top = placement.top + offsetY;
  return {
    left,
    top,
    right: left + cardWidth,
    bottom: top + cardHeight
  };
}

function getVisibleCardBoxes(placements: BoardMemberPlacement[], geometry: BoardLayoutGeometry) {
  return placements.map((placement) => getVisibleCardBox(placement, placement.compact ? geometry.compactTile : geometry.normalTile));
}

function getOverlapArea(a: BoardRect, b: BoardRect) {
  const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return width * height;
}

function getLayerOffsetCandidates(side: BoardSide, tile: TileFootprint) {
  const xStep = Math.round(tile.width * 0.45);
  const yStep = Math.round(tile.height * 0.45);
  const directions: Record<BoardSide, Array<[number, number]>> = {
    top: [
      [0, -yStep],
      [xStep, -yStep],
      [-xStep, -yStep],
      [xStep, yStep],
      [-xStep, yStep],
      [0, yStep],
      [xStep, 0],
      [-xStep, 0],
      [0, 0]
    ],
    right: [
      [xStep, 0],
      [xStep, yStep],
      [xStep, -yStep],
      [-xStep, yStep],
      [-xStep, -yStep],
      [-xStep, 0],
      [0, yStep],
      [0, -yStep],
      [0, 0]
    ],
    bottom: [
      [0, yStep],
      [xStep, yStep],
      [-xStep, yStep],
      [xStep, -yStep],
      [-xStep, -yStep],
      [0, -yStep],
      [xStep, 0],
      [-xStep, 0],
      [0, 0]
    ],
    left: [
      [-xStep, 0],
      [-xStep, yStep],
      [-xStep, -yStep],
      [xStep, yStep],
      [xStep, -yStep],
      [xStep, 0],
      [0, yStep],
      [0, -yStep],
      [0, 0]
    ]
  };

  return directions[side];
}

function applyLayerOffsets(
  placements: BoardMemberPlacement[],
  tile: TileFootprint,
  edgeSafeRect: BoardRect,
  centerSafeRect: BoardRect,
  existingCardBoxes: BoardRect[]
) {
  const occupiedBoxes = existingCardBoxes.slice();
  return placements.map((placement) => {
    if (placement.layer <= 0) {
      occupiedBoxes.push(getVisibleCardBox(placement, tile));
      return placement;
    }

    const bestOffset = getLayerOffsetCandidates(placement.side, tile)
      .map(([stackOffsetX, stackOffsetY]) => {
        const candidatePlacement = { ...placement, stackOffsetX, stackOffsetY };
        const box = getVisibleCardBox(candidatePlacement, tile);
        const invalid = !containsRect(edgeSafeRect, box) || intersectsRect(box, centerSafeRect);
        const overlapCount = occupiedBoxes.reduce((sum, occupiedBox) => sum + (intersectsRect(box, occupiedBox) ? 1 : 0), 0);
        const overlapArea = occupiedBoxes.reduce((sum, occupiedBox) => sum + getOverlapArea(box, occupiedBox), 0);
        return {
          stackOffsetX,
          stackOffsetY,
          invalid,
          overlapCount,
          overlapArea,
          movement: Math.abs(stackOffsetX) + Math.abs(stackOffsetY)
        };
      })
      .sort((left, right) => {
        if (Number(left.invalid) !== Number(right.invalid)) {
          return Number(left.invalid) - Number(right.invalid);
        }
        if (left.overlapCount !== right.overlapCount) {
          return left.overlapCount - right.overlapCount;
        }
        if (left.overlapArea !== right.overlapArea) {
          return left.overlapArea - right.overlapArea;
        }
        return right.movement - left.movement;
      })[0];

    const shiftedPlacement = {
      ...placement,
      stackOffsetX: bestOffset?.invalid ? 0 : (bestOffset?.stackOffsetX ?? 0),
      stackOffsetY: bestOffset?.invalid ? 0 : (bestOffset?.stackOffsetY ?? 0)
    };
    occupiedBoxes.push(getVisibleCardBox(shiftedPlacement, tile));
    return shiftedPlacement;
  });
}

function placementsFit(
  placements: BoardMemberPlacement[],
  tile: TileFootprint,
  edgeSafeRect: BoardRect,
  centerSafeRect: BoardRect,
  existingBoxes: BoardRect[] = [],
  allowExistingOverlap = false
) {
  const boxes = getPlacementBoxes(placements, tile);
  for (let index = 0; index < boxes.length; index += 1) {
    const box = boxes[index]!;
    if (!containsRect(edgeSafeRect, box)) {
      return false;
    }
    if (intersectsRect(box, centerSafeRect)) {
      return false;
    }
    for (let compareIndex = index + 1; compareIndex < boxes.length; compareIndex += 1) {
      if (intersectsRect(box, boxes[compareIndex]!)) {
        return false;
      }
    }
    if (!allowExistingOverlap && existingBoxes.some((existingBox) => intersectsRect(box, existingBox))) {
      return false;
    }
  }
  return true;
}

function findMaxFittingPlacements(
  members: UserSummary[],
  rect: BoardRect,
  ring: 1 | 2 | 3,
  tile: TileFootprint,
  compact: boolean,
  edgeSafeRect: BoardRect,
  centerSafeRect: BoardRect,
  existingBoxes: BoardRect[] = [],
  allowExistingOverlap = false
) {
  for (let count = members.length; count >= 1; count -= 1) {
    const sideCountCandidates = buildSideCountCandidates(count, rect, tile);
    for (const sideCounts of sideCountCandidates) {
      const placements = createRectPlacements(members.slice(0, count), rect, ring, tile, compact, sideCounts);
      if (
        placements.length === count &&
        placementsFit(placements, tile, edgeSafeRect, centerSafeRect, existingBoxes, allowExistingOverlap)
      ) {
        return placements;
      }
    }
  }
  return [] as BoardMemberPlacement[];
}

function findBestRingCandidate(
  members: UserSummary[],
  geometry: BoardLayoutGeometry,
  ring: 1 | 2 | 3,
  options: {
    ratios: number[];
    includeNormal: boolean;
    includeCompact: boolean;
    edgeSafeRect: BoardRect;
    centerSafeRect: BoardRect;
    existingBoxes?: BoardRect[];
    allowExistingOverlap?: boolean;
  }
): RingPlacementCandidate | null {
  const tileCandidates = [
    ...(options.includeNormal ? [{ tile: geometry.normalTile, compact: false }] : []),
    ...(options.includeCompact ? [{ tile: geometry.compactTile, compact: true }] : [])
  ];
  let best: RingPlacementCandidate | null = null;

  for (const ratio of options.ratios) {
    for (const tileCandidate of tileCandidates) {
      const rect = buildAnchorRect(options.edgeSafeRect, options.centerSafeRect, tileCandidate.tile, ratio);
      const placements = findMaxFittingPlacements(
        members,
        rect,
        ring,
        tileCandidate.tile,
        tileCandidate.compact,
        options.edgeSafeRect,
        options.centerSafeRect,
        options.existingBoxes ?? [],
        options.allowExistingOverlap ?? false
      );
      if (!best || placements.length > best.placements.length) {
        best = {
          placements,
          tile: tileCandidate.tile,
          compact: tileCandidate.compact,
          ratio
        };
        continue;
      }
      if (placements.length === best.placements.length) {
        if (best.compact && !tileCandidate.compact) {
          best = {
            placements,
            tile: tileCandidate.tile,
            compact: tileCandidate.compact,
            ratio
          };
          continue;
        }
        if (best.compact === tileCandidate.compact && Math.abs(ratio - 0.25) < Math.abs(best.ratio - 0.25)) {
          best = {
            placements,
            tile: tileCandidate.tile,
            compact: tileCandidate.compact,
            ratio
          };
        }
      }
    }
  }

  return best;
}

function buildRingCandidates(
  members: UserSummary[],
  geometry: BoardLayoutGeometry,
  ring: 1 | 2 | 3,
  options: {
    ratios: number[];
    includeNormal: boolean;
    includeCompact: boolean;
    edgeSafeRect: BoardRect;
    centerSafeRect: BoardRect;
    existingBoxes?: BoardRect[];
    allowExistingOverlap?: boolean;
  }
) {
  const tileCandidates = [
    ...(options.includeNormal ? [{ tile: geometry.normalTile, compact: false }] : []),
    ...(options.includeCompact ? [{ tile: geometry.compactTile, compact: true }] : [])
  ];
  const candidates: RingPlacementCandidate[] = [];

  for (const ratio of options.ratios) {
    for (const tileCandidate of tileCandidates) {
      const rect = buildAnchorRect(options.edgeSafeRect, options.centerSafeRect, tileCandidate.tile, ratio);
      const placements = findMaxFittingPlacements(
        members,
        rect,
        ring,
        tileCandidate.tile,
        tileCandidate.compact,
        options.edgeSafeRect,
        options.centerSafeRect,
        options.existingBoxes ?? [],
        options.allowExistingOverlap ?? false
      );
      candidates.push({
        placements,
        tile: tileCandidate.tile,
        compact: tileCandidate.compact,
        ratio
      });
    }
  }

  return candidates.sort((left, right) => {
    if (right.placements.length !== left.placements.length) {
      return right.placements.length - left.placements.length;
    }
    if (left.compact !== right.compact) {
      return Number(left.compact) - Number(right.compact);
    }
    return Math.abs(left.ratio - 0.25) - Math.abs(right.ratio - 0.25);
  });
}

function createOverflowPlacements(
  members: UserSummary[],
  geometry: BoardLayoutGeometry,
  edgeSafeRect: BoardRect,
  centerSafeRect: BoardRect,
  existingCardBoxes: BoardRect[] = []
) {
  const tile = geometry.compactTile;
  const occupiedCardBoxes = existingCardBoxes.slice();
  return members.map((member) => {
    const random = createSeededRandom(`${geometry.overflowSeed}:${member.id}`);
    let bestPlacement: BoardMemberPlacement | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (let attempt = 0; attempt < 96; attempt += 1) {
      const left = edgeSafeRect.left + random() * Math.max(1, rectWidth(edgeSafeRect) - tile.width);
      const top = edgeSafeRect.top + random() * Math.max(1, rectHeight(edgeSafeRect) - tile.height);
      const box = { left, top, right: left + tile.width, bottom: top + tile.height };
      if (intersectsRect(box, centerSafeRect) || !containsRect(edgeSafeRect, box)) {
        continue;
      }

      const candidatePlacement: BoardMemberPlacement = {
        member,
        left,
        top,
        side: "top" as const,
        ring: 3 as const,
        layer: 0,
        compact: true
      };
      const cardBox = getVisibleCardBox(candidatePlacement, tile);
      const overlapCount = occupiedCardBoxes.reduce((sum, occupiedBox) => sum + (intersectsRect(cardBox, occupiedBox) ? 1 : 0), 0);
      const overlapArea = occupiedCardBoxes.reduce((sum, occupiedBox) => sum + getOverlapArea(cardBox, occupiedBox), 0);
      const score = overlapCount * 100_000 + overlapArea;
      if (score < bestScore) {
        bestScore = score;
        bestPlacement = candidatePlacement;
        if (score === 0) {
          break;
        }
      }
    }

    const placement =
      bestPlacement ?? {
      member,
      left: edgeSafeRect.left,
      top: edgeSafeRect.top,
      side: "top" as const,
      ring: 3 as const,
      layer: 0,
      compact: true
    };

    occupiedCardBoxes.push(getVisibleCardBox(placement, tile));
    return placement;
  });
}

function rotateSlotsToTopCenter(slots: BoardSlot[], rect: BoardRect) {
  if (slots.length <= 1) {
    return slots;
  }

  const centerX = (rect.left + rect.right) / 2;
  let startIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < slots.length; index += 1) {
    const slot = slots[index]!;
    if (slot.side !== "top") {
      continue;
    }
    const distance = Math.abs(slot.left + (slot.box.right - slot.box.left) / 2 - centerX);
    if (distance < bestDistance) {
      bestDistance = distance;
      startIndex = index;
    }
  }

  return [...slots.slice(startIndex), ...slots.slice(0, startIndex)];
}

function buildRingSlots(rect: BoardRect, tile: TileFootprint): BoardSlot[] {
  const topCount = getSideCapacity(rect, tile, "top");
  const rightCount = getSideCapacity(rect, tile, "right");
  const bottomCount = getSideCapacity(rect, tile, "bottom");
  const leftCount = getSideCapacity(rect, tile, "left");
  const slots: BoardSlot[] = [];

  const pushSideSlots = (side: BoardSide, coordinates: number[]) => {
    for (const coordinate of coordinates) {
      const box =
        side === "top"
          ? getTileBox(coordinate, rect.top, side, tile)
          : side === "right"
            ? getTileBox(rect.right, coordinate, side, tile)
            : side === "bottom"
              ? getTileBox(coordinate, rect.bottom, side, tile)
              : getTileBox(rect.left, coordinate, side, tile);
      slots.push({
        side,
        left: box.left,
        top: box.top,
        box
      });
    }
  };

  pushSideSlots("top", distributeEvenly(rect.left + tile.width / 2, rect.right - tile.width / 2, topCount));
  pushSideSlots("right", distributeEvenly(rect.top + tile.height / 2, rect.bottom - tile.height / 2, rightCount));
  pushSideSlots("bottom", distributeEvenly(rect.right - tile.width / 2, rect.left + tile.width / 2, bottomCount));
  pushSideSlots("left", distributeEvenly(rect.bottom - tile.height / 2, rect.top + tile.height / 2, leftCount));

  return rotateSlotsToTopCenter(slots, rect);
}

function filterLegalSlots(
  slots: BoardSlot[],
  edgeSafeRect: BoardRect,
  centerSafeRect: BoardRect,
  existingBoxes: BoardRect[] = [],
  allowExistingOverlap = false
) {
  return slots.filter((slot) => {
    if (!containsRect(edgeSafeRect, slot.box)) {
      return false;
    }
    if (intersectsRect(slot.box, centerSafeRect)) {
      return false;
    }
    if (!allowExistingOverlap && existingBoxes.some((existingBox) => intersectsRect(slot.box, existingBox))) {
      return false;
    }
    return true;
  });
}

function selectEvenlyDistributedSlots(slots: BoardSlot[], count: number) {
  if (count <= 0) {
    return [] as BoardSlot[];
  }
  if (count >= slots.length) {
    return slots.slice();
  }

  const selected: BoardSlot[] = [];
  const used = new Set<number>();
  const stride = slots.length / count;

  for (let index = 0; index < count; index += 1) {
    let targetIndex = Math.floor((index + 0.5) * stride);
    targetIndex = clamp(targetIndex, 0, slots.length - 1);
    if (used.has(targetIndex)) {
      let offset = 1;
      while (offset < slots.length) {
        const forwardIndex = targetIndex + offset;
        if (forwardIndex < slots.length && !used.has(forwardIndex)) {
          targetIndex = forwardIndex;
          break;
        }
        const backwardIndex = targetIndex - offset;
        if (backwardIndex >= 0 && !used.has(backwardIndex)) {
          targetIndex = backwardIndex;
          break;
        }
        offset += 1;
      }
    }
    used.add(targetIndex);
    selected.push(slots[targetIndex]!);
  }

  return selected;
}

function allocateSlotSideCounts(
  total: number,
  rect: BoardRect,
  capacities: Record<BoardSide, number>
): Record<BoardSide, number> {
  const sideOrder: BoardSide[] = ["top", "bottom", "right", "left"];
  const counts: Record<BoardSide, number> = { top: 0, right: 0, bottom: 0, left: 0 };
  const spans: Record<BoardSide, number> = {
    top: getSideSpan(rect, "top"),
    right: getSideSpan(rect, "right"),
    bottom: getSideSpan(rect, "bottom"),
    left: getSideSpan(rect, "left")
  };
  const totalSpan = sideOrder.reduce((sum, side) => sum + spans[side], 0);

  if (total <= 0 || totalSpan <= 0) {
    return counts;
  }

  if (total <= 16) {
    if (total % 4 === 0 && sideOrder.every((side) => capacities[side] >= total / 4)) {
      sideOrder.forEach((side) => {
        counts[side] = total / 4;
      });
      return counts;
    }

    let remaining = total;
    const balancedOrder: BoardSide[] = ["top", "right", "bottom", "left"];
    while (remaining > 0) {
      const nextSide = balancedOrder
        .filter((side) => counts[side] < capacities[side])
        .sort((left, right) => {
          if (counts[left] !== counts[right]) {
            return counts[left] - counts[right];
          }
          if (capacities[right] !== capacities[left]) {
            return capacities[right] - capacities[left];
          }
          return balancedOrder.indexOf(left) - balancedOrder.indexOf(right);
        })[0];
      if (!nextSide) {
        break;
      }
      counts[nextSide] += 1;
      remaining -= 1;
    }
    return counts;
  }

  if (total >= 4 && sideOrder.every((side) => capacities[side] > 0)) {
    sideOrder.forEach((side) => {
      counts[side] = 1;
    });
  }

  let remaining = total - sideOrder.reduce((sum, side) => sum + counts[side], 0);

  while (remaining > 0) {
    const next = sideOrder
      .filter((side) => counts[side] < capacities[side])
      .sort((left, right) => {
        const leftLoad = counts[left] / Math.max(1, capacities[left]);
        const rightLoad = counts[right] / Math.max(1, capacities[right]);
        if (leftLoad !== rightLoad) {
          return leftLoad - rightLoad;
        }
        const leftRemaining = capacities[left] - counts[left];
        const rightRemaining = capacities[right] - counts[right];
        if (rightRemaining !== leftRemaining) {
          return rightRemaining - leftRemaining;
        }
        if (spans[right] !== spans[left]) {
          return spans[right] - spans[left];
        }
        return sideOrder.indexOf(left) - sideOrder.indexOf(right);
      })[0];
    if (!next) {
      break;
    }
    counts[next] += 1;
    remaining -= 1;
  }

  return counts;
}

function chooseRingSlotsFromLegalSlots(slots: BoardSlot[], rect: BoardRect, count: number) {
  if (!slots.length || count <= 0) {
    return [] as BoardSlot[];
  }

  const sideSlots: Record<BoardSide, BoardSlot[]> = {
    top: slots.filter((slot) => slot.side === "top"),
    right: slots.filter((slot) => slot.side === "right"),
    bottom: slots.filter((slot) => slot.side === "bottom"),
    left: slots.filter((slot) => slot.side === "left")
  };
  const sideCounts = allocateSlotSideCounts(
    Math.min(count, slots.length),
    rect,
    {
      top: sideSlots.top.length,
      right: sideSlots.right.length,
      bottom: sideSlots.bottom.length,
      left: sideSlots.left.length
    }
  );

  const sideAllocated = [
    ...selectEvenlyDistributedSlots(sideSlots.top, sideCounts.top),
    ...selectEvenlyDistributedSlots(sideSlots.right, sideCounts.right),
    ...selectEvenlyDistributedSlots(sideSlots.bottom, sideCounts.bottom),
    ...selectEvenlyDistributedSlots(sideSlots.left, sideCounts.left)
  ];
  const perimeterAllocated = selectEvenlyDistributedSlots(slots, Math.min(count, slots.length));
  const candidates = [sideAllocated, perimeterAllocated].filter((candidate) => candidate.length > 0);

  return candidates
    .map((candidate) => ({
      candidate,
      score: scoreSlotSelection(candidate, slots, rect)
    }))
    .sort((left, right) => right.score - left.score)[0]?.candidate ?? [];
}

function scoreSlotSelection(selected: BoardSlot[], legalSlots: BoardSlot[], rect: BoardRect) {
  if (!selected.length) {
    return Number.NEGATIVE_INFINITY;
  }

  const sideOrder: BoardSide[] = ["top", "right", "bottom", "left"];
  const selectedCounts: Record<BoardSide, number> = { top: 0, right: 0, bottom: 0, left: 0 };
  const legalCounts: Record<BoardSide, number> = { top: 0, right: 0, bottom: 0, left: 0 };
  for (const slot of selected) {
    selectedCounts[slot.side] += 1;
  }
  for (const slot of legalSlots) {
    legalCounts[slot.side] += 1;
  }

  const usedSides = sideOrder.filter((side) => selectedCounts[side] > 0).length;
  const totalLegal = Math.max(1, legalSlots.length);
  const expectedDeviation = sideOrder.reduce((sum, side) => {
    const expected = selected.length * (legalCounts[side] / totalLegal);
    return sum + Math.abs(selectedCounts[side] - expected);
  }, 0);
  const pairBalance =
    Math.abs(selectedCounts.top - selectedCounts.bottom) + Math.abs(selectedCounts.left - selectedCounts.right);
  const spanUse = sideOrder.reduce((sum, side) => {
    if (!selectedCounts[side]) {
      return sum;
    }
    return sum + getSideSpan(rect, side);
  }, 0);

  return usedSides * 240 + spanUse * 0.05 - expectedDeviation * 28 - pairBalance * 18;
}

function createPlacementsFromSlots(
  members: UserSummary[],
  slots: BoardSlot[],
  ring: 1 | 2 | 3,
  compact: boolean,
  layer: number
) {
  return slots.map((slot, index) => ({
    member: members[index]!,
    left: slot.left,
    top: slot.top,
    side: slot.side,
    ring,
    layer,
    compact
  }));
}

function chooseNonOverlappingRingSlots(candidates: RingBoardSlot[], count: number) {
  if (count <= 0 || !candidates.length) {
    return [] as RingBoardSlot[];
  }

  const chosen: RingBoardSlot[] = [];
  let available = candidates.slice();

  while (available.length && chosen.length < count) {
    const best = available
      .map((slot) => ({
        slot,
        conflicts: available.reduce(
          (sum, other) => sum + (other !== slot && intersectsRect(slot.box, other.box) ? 1 : 0),
          0
        )
      }))
      .sort((left, right) => {
        if (left.conflicts !== right.conflicts) {
          return left.conflicts - right.conflicts;
        }
        if (left.slot.ring !== right.slot.ring) {
          return left.slot.ring - right.slot.ring;
        }
        const sideOrder: BoardSide[] = ["top", "right", "bottom", "left"];
        if (left.slot.side !== right.slot.side) {
          return sideOrder.indexOf(left.slot.side) - sideOrder.indexOf(right.slot.side);
        }
        return left.slot.order - right.slot.order;
      })[0]?.slot;

    if (!best) {
      break;
    }

    chosen.push(best);
    available = available.filter((slot) => slot !== best && !intersectsRect(slot.box, best.box));
  }

  return chosen;
}

function buildDeterministicRingPlacements(
  members: UserSummary[],
  geometry: BoardLayoutGeometry,
  ringOneTile: TileFootprint,
  ringOneCompact: boolean,
  options: {
    optimizeConstrainedOuterRings?: boolean;
  } = {}
): BoardLayoutResult {
  const edgeSafeRect = getEdgeSafeRect(geometry);
  const centerSafeRect = getCenterSafeRect(geometry);
  const canUseNormalOuterRings = !ringOneCompact;
  const ringOneRect = buildAnchorRect(edgeSafeRect, centerSafeRect, ringOneTile, 0.25);
  const ringTwoNormalRect = buildAnchorRect(edgeSafeRect, centerSafeRect, geometry.normalTile, 0.75);
  const ringThreeNormalRect = buildAnchorRect(edgeSafeRect, centerSafeRect, geometry.normalTile, 0.5);
  let useNormalOuterRings = false;

  if (canUseNormalOuterRings) {
    const ringOneSafeSlots = filterLegalSlots(buildRingSlots(ringOneRect, ringOneTile), edgeSafeRect, centerSafeRect);
    const ringOneBoxes = ringOneSafeSlots.map((slot) => slot.box);
    const ringTwoSafeSlots = filterLegalSlots(
      buildRingSlots(ringTwoNormalRect, geometry.normalTile),
      edgeSafeRect,
      centerSafeRect,
      ringOneBoxes
    );
    const ringThreeSafeSlots = filterLegalSlots(
      buildRingSlots(ringThreeNormalRect, geometry.normalTile),
      edgeSafeRect,
      centerSafeRect,
      [...ringOneBoxes, ...ringTwoSafeSlots.map((slot) => slot.box)]
    );
    useNormalOuterRings = ringOneSafeSlots.length + ringTwoSafeSlots.length + ringThreeSafeSlots.length >= members.length;
  }

  const outerRingTile = useNormalOuterRings ? geometry.normalTile : geometry.compactTile;
  const ringRects = {
    1: ringOneRect,
    2: buildAnchorRect(edgeSafeRect, centerSafeRect, outerRingTile, 0.75),
    3: buildAnchorRect(edgeSafeRect, centerSafeRect, outerRingTile, 0.5)
  } as const;
  const ringTiles = {
    1: ringOneTile,
    2: outerRingTile,
    3: outerRingTile
  } as const;
  const compactByRing = {
    1: ringOneCompact,
    2: !useNormalOuterRings,
    3: !useNormalOuterRings
  } as const;
  const placements: BoardMemberPlacement[] = [];
  let remainingMembers = members;
  const usedBoxes: BoardRect[] = [];

  if (options.optimizeConstrainedOuterRings) {
    const ringOneLegalSlots = filterLegalSlots(buildRingSlots(ringRects[1], ringTiles[1]), edgeSafeRect, centerSafeRect);
    const maxRingOneCount = Math.min(members.length, ringOneLegalSlots.length);
    const preferredRingOneCount = clamp(Math.ceil(members.length * 0.55), 4, Math.max(4, maxRingOneCount));
    let bestSafeRingOneSlots: BoardSlot[] = [];
    let bestSafeOuterSlots: RingBoardSlot[] = [];

    for (let ringOneCount = maxRingOneCount; ringOneCount >= 0; ringOneCount -= 1) {
      const ringOneChosenSlots = chooseRingSlotsFromLegalSlots(ringOneLegalSlots, ringRects[1], ringOneCount);
      const ringOneBoxes = ringOneChosenSlots.map((slot) => slot.box);
      const outerRingCandidates: RingBoardSlot[] = ([2, 3] as const).flatMap((ring) =>
        filterLegalSlots(buildRingSlots(ringRects[ring], ringTiles[ring]), edgeSafeRect, centerSafeRect, ringOneBoxes).map((slot, index) => ({
          ...slot,
          ring,
          compact: compactByRing[ring],
          order: index
        }))
      );
      const chosenOuterSlots = chooseNonOverlappingRingSlots(outerRingCandidates, members.length - ringOneChosenSlots.length);
      const safeTotal = ringOneChosenSlots.length + chosenOuterSlots.length;
      const bestSafeTotal = bestSafeRingOneSlots.length + bestSafeOuterSlots.length;

      if (safeTotal > bestSafeTotal) {
        bestSafeRingOneSlots = ringOneChosenSlots;
        bestSafeOuterSlots = chosenOuterSlots;
        continue;
      }
      if (safeTotal === bestSafeTotal) {
        const currentDistance = Math.abs(ringOneChosenSlots.length - preferredRingOneCount);
        const bestDistance = Math.abs(bestSafeRingOneSlots.length - preferredRingOneCount);
        const currentOuterCount = chosenOuterSlots.length;
        const bestOuterCount = bestSafeOuterSlots.length;
        if (
          currentDistance < bestDistance ||
          (currentDistance === bestDistance && currentOuterCount > bestOuterCount) ||
          (currentDistance === bestDistance &&
            currentOuterCount === bestOuterCount &&
            ringOneChosenSlots.length > bestSafeRingOneSlots.length)
        ) {
          bestSafeRingOneSlots = ringOneChosenSlots;
          bestSafeOuterSlots = chosenOuterSlots;
        }
      }
    }

    const ringOnePlacements = createPlacementsFromSlots(
      remainingMembers.slice(0, bestSafeRingOneSlots.length),
      bestSafeRingOneSlots,
      1,
      compactByRing[1],
      0
    );
    placements.push(...ringOnePlacements);
    remainingMembers = remainingMembers.slice(ringOnePlacements.length);
    usedBoxes.push(...bestSafeRingOneSlots.map((slot) => slot.box), ...bestSafeOuterSlots.map((slot) => slot.box));

    const chosenOuterSlots = bestSafeOuterSlots.sort((left, right) => {
      if (left.ring !== right.ring) {
        return left.ring - right.ring;
      }
      const sideOrder: BoardSide[] = ["top", "right", "bottom", "left"];
      if (left.side !== right.side) {
        return sideOrder.indexOf(left.side) - sideOrder.indexOf(right.side);
      }
      return left.order - right.order;
    });

    if (chosenOuterSlots.length) {
      placements.push(
        ...chosenOuterSlots.map((slot, index) => ({
          member: remainingMembers[index]!,
          left: slot.left,
          top: slot.top,
          side: slot.side,
          ring: slot.ring,
          layer: 0,
          compact: slot.compact
        }))
      );
      remainingMembers = remainingMembers.slice(chosenOuterSlots.length);
    }
  } else {
    const ringOneSlots = chooseRingSlotsFromLegalSlots(
      filterLegalSlots(buildRingSlots(ringRects[1], ringTiles[1]), edgeSafeRect, centerSafeRect),
      ringRects[1],
      remainingMembers.length
    );
    placements.push(...createPlacementsFromSlots(remainingMembers.slice(0, ringOneSlots.length), ringOneSlots, 1, compactByRing[1], 0));
    remainingMembers = remainingMembers.slice(ringOneSlots.length);
    usedBoxes.push(...ringOneSlots.map((slot) => slot.box));

    for (const ring of [2, 3] as const) {
      if (!remainingMembers.length) {
        break;
      }
      const ringSlots = chooseRingSlotsFromLegalSlots(
        filterLegalSlots(buildRingSlots(ringRects[ring], ringTiles[ring]), edgeSafeRect, centerSafeRect, usedBoxes),
        ringRects[ring],
        remainingMembers.length
      );
      placements.push(
        ...createPlacementsFromSlots(remainingMembers.slice(0, ringSlots.length), ringSlots, ring, compactByRing[ring], 0)
      );
      remainingMembers = remainingMembers.slice(ringSlots.length);
      usedBoxes.push(...ringSlots.map((slot) => slot.box));
    }
  }

  let mode: BoardLayoutMode =
    remainingMembers.length === 0 && !placements.some((placement) => placement.compact) ? "enough" : "compact";

  if (remainingMembers.length) {
    mode = "overlap";
    const ringThreeOverlapSlots = chooseRingSlotsFromLegalSlots(
      filterLegalSlots(buildRingSlots(ringRects[3], ringTiles[3]), edgeSafeRect, centerSafeRect, usedBoxes, true),
      ringRects[3],
      remainingMembers.length
    );
    const ringThreeOverlapPlacements = applyLayerOffsets(
      createPlacementsFromSlots(remainingMembers.slice(0, ringThreeOverlapSlots.length), ringThreeOverlapSlots, 3, compactByRing[3], 1),
      ringTiles[3],
      edgeSafeRect,
      centerSafeRect,
      getVisibleCardBoxes(placements, geometry)
    );
    placements.push(...ringThreeOverlapPlacements);
    usedBoxes.push(...getPlacementBoxes(ringThreeOverlapPlacements, ringTiles[3]));
    remainingMembers = remainingMembers.slice(ringThreeOverlapPlacements.length);
  }

  if (remainingMembers.length) {
    mode = "overflow";
    const overflowPlacements = createOverflowPlacements(
      remainingMembers,
      geometry,
      edgeSafeRect,
      centerSafeRect,
      getVisibleCardBoxes(placements, geometry)
    );
    placements.push(...overflowPlacements);
    usedBoxes.push(...getPlacementBoxes(overflowPlacements, geometry.compactTile));
  }

  return { placements, mode };
}

export function calculateBoardLayout(
  members: UserSummary[],
  geometry: BoardLayoutGeometry = DEFAULT_LAYOUT_GEOMETRY
): BoardLayoutResult {
  if (!members.length) {
    return { placements: [], mode: "enough" };
  }

  const constrainedDenseRoom = members.length >= 21 && (geometry.width <= 1120 || geometry.height <= 780);
  const normalScenario = constrainedDenseRoom
    ? null
    : buildDeterministicRingPlacements(members, geometry, geometry.normalTile, false);
  const compactScenario = buildDeterministicRingPlacements(members, geometry, geometry.compactTile, true, {
    optimizeConstrainedOuterRings: constrainedDenseRoom
  });

  if (!normalScenario) {
    return compactScenario;
  }

  const modeWeight: Record<BoardLayoutMode, number> = {
    enough: 4,
    compact: 3,
    overlap: 2,
    overflow: 1
  };
  const scoreLayout = (layout: BoardLayoutResult) => {
    const compactPlacements = layout.placements.filter((placement) => placement.compact).length;
    const overlapPlacements = layout.placements.filter((placement) => placement.layer > 0).length;
    return {
      modeWeight: modeWeight[layout.mode],
      overlapPlacements,
      compactPlacements
    };
  };

  const normalScore = scoreLayout(normalScenario);
  const compactScore = scoreLayout(compactScenario);

  if (compactScore.modeWeight > normalScore.modeWeight) {
    return compactScenario;
  }
  if (compactScore.modeWeight < normalScore.modeWeight) {
    return normalScenario;
  }
  if (compactScore.overlapPlacements < normalScore.overlapPlacements) {
    return compactScenario;
  }
  if (compactScore.overlapPlacements > normalScore.overlapPlacements) {
    return normalScenario;
  }
  if (compactScore.compactPlacements < normalScore.compactPlacements) {
    return compactScenario;
  }

  return normalScenario;
}

export function layoutMembersForBoard(members: UserSummary[], geometry: BoardLayoutGeometry = DEFAULT_LAYOUT_GEOMETRY): BoardMemberPlacement[] {
  return calculateBoardLayout(members, geometry).placements;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Failed to read the selected file."));
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Failed to read the selected file."));
    reader.readAsText(file);
  });
}

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error("Failed to read the selected file."));
    reader.readAsArrayBuffer(file);
  });
}

function downloadBlob(fileName: string, blob: Blob) {
  const objectUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(objectUrl);
}

function getDownloadFileName(response: Response, fallback: string) {
  const disposition = response.headers.get("Content-Disposition") ?? response.headers.get("content-disposition");
  const match = disposition?.match(/filename="([^"]+)"/i);
  return match?.[1] ?? fallback;
}


export const TeamBoard = memo(function TeamBoard(props: {
  branding?: BrandingManifest;
  state: TeamStateResponse;
  onSelectTeam: (teamId: string) => void;
  onOpenTeamChooser: () => void;
  onOpenMemberDirectory: (teamId: string) => void | Promise<void>;
  notificationFeed: NotificationFeedResponse | null;
  onOpenNotifications: () => Promise<void>;
  onLoadMoreHistory?: (cursor: string) => Promise<void>;
  onAdmitJoinRequest: (teamId: string, requestId: string) => Promise<void>;
  onDenyJoinRequest: (teamId: string, requestId: string) => Promise<void>;
  onAdmitPlatformAccessRequest: (request: PlatformAccessRequestSummary) => Promise<PlatformAccessRequestActionResponse>;
  onDenyPlatformAccessRequest: (requestId: string) => Promise<void>;
  onCreateRound: (title: string) => Promise<void>;
  onVote: (value: string) => Promise<void>;
  onReveal: () => Promise<void>;
  onCancelActiveRound?: () => Promise<void>;
  onVoteAgainActiveRound?: () => Promise<void>;
  onVoteAgain: (historyId: string) => Promise<void>;
  onAddHistoryComment: (historyId: string, body: string) => Promise<void>;
  onEditHistoryComment: (historyId: string, commentId: string, body: string) => Promise<void>;
  onDeleteHistoryComment: (historyId: string, commentId: string) => Promise<void>;
  historyItems?: HistoryEntry[];
  historyNextCursor?: HistoryPageCursor | null;
  historyLoading?: boolean;
  searchItems?: HistoryEntry[];
  searchNextCursor?: HistoryPageCursor | null;
  searchLoading?: boolean;
  searchFilters?: TeamHistorySearchFilters;
  hasSearchedHistory?: boolean;
  onLoadMoreIssueHistory?: () => Promise<void>;
  onRunIssueHistorySearch?: (filters: TeamHistorySearchFilters) => Promise<void>;
  onLoadMoreIssueSearch?: () => Promise<void>;
  onUpdateDeckSettings: (settings: {
    deckKey: DeckDefinition["key"];
    fibonacciRangeStart: FibonacciRangeStart | null;
    fibonacciRangeEnd: FibonacciRangeEnd | null;
  }) => Promise<void>;
  onUpdateTimer: (timerSeconds: TeamTimerSeconds | null) => Promise<void>;
  onUpdateHistoryTimezoneSettings: (enabled: boolean, keys: HistoryTimeZoneKey[]) => Promise<void>;
  onUpdateQuorumSettings?: (enabled: boolean, minimumVotePercent: number) => Promise<void>;
  onRenameTeam: (name: string) => Promise<void>;
  onLeaveCurrentTeam: () => Promise<void>;
  onShareTeamLink?: () => Promise<void>;
  onOpenAccountSettings: () => void;
  onLoadPendingIssue?: (issueId: string) => Promise<void>;
  status: StatusState;
  isBusy: boolean;
}) {
  const branding = props.branding ?? BRANDING_MANIFEST;
  const activeRound = props.state.activeRound;
  const cardRailDeckKey = activeRound?.status === "active" ? activeRound.deckKey : props.state.team.deckKey;
  const cardRailFibonacciRangeStart = activeRound?.status === "active" ? activeRound.fibonacciRangeStart : props.state.team.fibonacciRangeStart;
  const cardRailFibonacciRangeEnd = activeRound?.status === "active" ? activeRound.fibonacciRangeEnd : props.state.team.fibonacciRangeEnd;
  const currentDeck = useMemo(
    () =>
      ({
        key: cardRailDeckKey,
        label: getDeckLabel(cardRailDeckKey, {
          fibonacciRangeStart: cardRailFibonacciRangeStart,
          fibonacciRangeEnd: cardRailFibonacciRangeEnd
        }),
        cards: getDeckCards(cardRailDeckKey, {
          fibonacciRangeStart: cardRailFibonacciRangeStart,
          fibonacciRangeEnd: cardRailFibonacciRangeEnd
        })
      }) satisfies DeckDefinition,
    [cardRailDeckKey, cardRailFibonacciRangeEnd, cardRailFibonacciRangeStart]
  );
  const [titleDraft, setTitleDraft] = useState("");
  const [teamSelectDraft, setTeamSelectDraft] = useState(props.state.team.id);
  const [switchTeamOpen, setSwitchTeamOpen] = useState(false);
  const [teamSettingsOpen, setTeamSettingsOpen] = useState(false);
  const [teamSettingsSection, setTeamSettingsSection] = useState<TeamSettingsSection>("none");
  const [timerMenuOpen, setTimerMenuOpen] = useState(false);
  const [teamSettingsSubmenuAlign, setTeamSettingsSubmenuAlign] = useState<"right" | "left">("right");
  const [teamNameDraft, setTeamNameDraft] = useState(props.state.team.name);
  const [deckDraftKey, setDeckDraftKey] = useState<DeckDefinition["key"]>(props.state.team.deckKey);
  const [fibonacciRangeEnabledDraft, setFibonacciRangeEnabledDraft] = useState(
    () => props.state.team.deckKey === "fibonacci" && props.state.team.fibonacciRangeStart != null && props.state.team.fibonacciRangeEnd != null
  );
  const [fibonacciRangeStartDraft, setFibonacciRangeStartDraft] = useState<FibonacciRangeStart>(props.state.team.fibonacciRangeStart ?? "1");
  const [fibonacciRangeEndDraft, setFibonacciRangeEndDraft] = useState<FibonacciRangeEnd>(props.state.team.fibonacciRangeEnd ?? "21");
  const [historyTimeZoneKeysDraft, setHistoryTimeZoneKeysDraft] = useState<HistoryTimeZoneKey[]>(props.state.team.historyTimezoneKeys);
  const [minimumVotePercentEnabledDraft, setMinimumVotePercentEnabledDraft] = useState(props.state.team.minimumVotePercentEnabled);
  const [minimumVotePercentDraft, setMinimumVotePercentDraft] = useState(String(props.state.team.minimumVotePercent));
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);
  const [boardNeedsScroll, setBoardNeedsScroll] = useState(false);
  const [boardStageHeight, setBoardStageHeight] = useState<number | null>(null);
  const [boardLayoutGeometry, setBoardLayoutGeometry] = useState<BoardLayoutGeometry | null>(null);
  const [viewportSize, setViewportSize] = useState(() => getViewportSize());
  const [historyRailWidth, setHistoryRailWidth] = useState(() => loadHistoryRailWidthPreference());
  const [historyRailResizing, setHistoryRailResizing] = useState(false);
  const [stackedHistoryHeight, setStackedHistoryHeight] = useState(() => loadStackedHistoryHeightPreference());
  const [stackedHistoryResizing, setStackedHistoryResizing] = useState(false);
  const [showLayoutGuides] = useState(() => isDebugLayoutGuidesEnabled());
  const boardSizingRef = useRef<BoardSizingState | null>(null);
  const centerPanelRef = useRef<HTMLDivElement | null>(null);
  const boardScrollAreaRef = useRef<HTMLDivElement | null>(null);
  const boardStageRef = useRef<HTMLDivElement | null>(null);
  const participantRingRef = useRef<HTMLDivElement | null>(null);
  const cardRailRef = useRef<HTMLDivElement | null>(null);
  const normalTileProbeRef = useRef<HTMLDivElement | null>(null);
  const compactTileProbeRef = useRef<HTMLDivElement | null>(null);
  const boardShellRef = useRef<HTMLDivElement | null>(null);
  const boardMainRef = useRef<HTMLDivElement | null>(null);
  const boardHeaderRef = useRef<HTMLElement | null>(null);
  const switchTeamMenuRef = useRef<HTMLDivElement | null>(null);
  const teamSettingsRef = useRef<HTMLDivElement | null>(null);
  const timerSettingsRef = useRef<HTMLDivElement | null>(null);
  const viewportWidth = viewportSize.width;
  const viewportHeight = viewportSize.height;
  const isStackedHistoryLayout = viewportWidth <= 959;
  const trimmedTitleDraft = titleDraft.trim();
  const canManageTeam = props.state.currentUser.isSuperAdmin || props.state.currentUserRole === "team_admin";
  const canEditTeamSettings = canManageTeam && !props.state.team.archived;
  const isReadOnlyBoard = props.state.team.archived || props.state.currentUserRole === "none";
  const readOnlyMessage = props.state.team.archived
    ? "This team is archived. The board is read-only until a team admin or the super-admin unarchives it."
    : props.state.currentUserRole === "none"
      ? "Super-admin viewer mode: this board is read-only until you join the team as a normal member."
      : null;
  const canCreateRound = !props.isBusy && !isReadOnlyBoard && trimmedTitleDraft.length >= 5;
  const latestHistoryEntryId = activeRound?.status === "revealed" ? props.state.history[0]?.id ?? null : null;
  const historyItems = props.historyItems ?? props.state.history;
  const historyNextCursor = props.historyNextCursor ?? null;
  const historyLoading = props.historyLoading ?? false;
  const searchItems = props.searchItems ?? [];
  const searchNextCursor = props.searchNextCursor ?? null;
  const searchLoading = props.searchLoading ?? false;
  const searchFilters = props.searchFilters ?? EMPTY_HISTORY_SEARCH_FILTERS;
  const hasSearchedHistory = props.hasSearchedHistory ?? false;
  const handleLoadMoreIssueHistory = props.onLoadMoreIssueHistory ?? (async () => undefined);
  const handleRunIssueHistorySearch = props.onRunIssueHistorySearch ?? (async () => undefined);
  const handleLoadMoreIssueSearch = props.onLoadMoreIssueSearch ?? (async () => undefined);
  const handleLoadPendingIssue = props.onLoadPendingIssue ?? (async () => undefined);
  const handleUpdateQuorumSettings = props.onUpdateQuorumSettings ?? (async () => undefined);
  const pendingIssues = props.state.pendingIssues ?? [];
  const parsedMinimumVotePercentDraft = Math.max(1, Math.min(100, Number.parseInt(minimumVotePercentDraft, 10) || 75));
  const normalizedDraftFibonacciRange = useMemo(
    () => normalizeFibonacciRange(fibonacciRangeEnabledDraft ? fibonacciRangeStartDraft : null, fibonacciRangeEnabledDraft ? fibonacciRangeEndDraft : null),
    [fibonacciRangeEnabledDraft, fibonacciRangeEndDraft, fibonacciRangeStartDraft]
  );
  const availableFibonacciEndOptions = useMemo(
    () =>
      FIBONACCI_RANGE_END_OPTIONS.filter(
        (option) => normalizeFibonacciRange(fibonacciRangeStartDraft, option).fibonacciRangeStart !== null
      ),
    [fibonacciRangeStartDraft]
  );
  const switchableTeams = useMemo(() => {
    const teams = props.state.currentUser.isSuperAdmin ? props.state.availableTeams : props.state.memberships;
    return [...teams].sort((left, right) => {
      const leftOpened = left.lastOpenedAt ?? "";
      const rightOpened = right.lastOpenedAt ?? "";
      if (leftOpened !== rightOpened) {
        return rightOpened.localeCompare(leftOpened);
      }
      return left.name.localeCompare(right.name);
    });
  }, [props.state.availableTeams, props.state.currentUser.isSuperAdmin, props.state.memberships]);

  useEffect(() => {
    setTeamSelectDraft(props.state.team.id);
    setSwitchTeamOpen(false);
  }, [props.state.team.id]);

  useEffect(() => {
    setTeamNameDraft(props.state.team.name);
  }, [props.state.team.name]);

  useEffect(() => {
    setDeckDraftKey(props.state.team.deckKey);
    setFibonacciRangeEnabledDraft(props.state.team.deckKey === "fibonacci" && props.state.team.fibonacciRangeStart != null && props.state.team.fibonacciRangeEnd != null);
    setFibonacciRangeStartDraft(props.state.team.fibonacciRangeStart ?? "1");
    setFibonacciRangeEndDraft(props.state.team.fibonacciRangeEnd ?? "21");
  }, [props.state.team.deckKey, props.state.team.fibonacciRangeEnd, props.state.team.fibonacciRangeStart]);

  useEffect(() => {
    setHistoryTimeZoneKeysDraft(props.state.team.historyTimezoneKeys);
  }, [props.state.team.historyTimezoneKeys]);

  useEffect(() => {
    setMinimumVotePercentEnabledDraft(props.state.team.minimumVotePercentEnabled);
    setMinimumVotePercentDraft(String(props.state.team.minimumVotePercent));
  }, [props.state.team.minimumVotePercent, props.state.team.minimumVotePercentEnabled]);

  useEffect(() => {
    if (!fibonacciRangeEnabledDraft) {
      return;
    }

    if (normalizeFibonacciRange(fibonacciRangeStartDraft, fibonacciRangeEndDraft).fibonacciRangeStart !== null) {
      return;
    }

    setFibonacciRangeEndDraft(availableFibonacciEndOptions[0] ?? "21");
  }, [availableFibonacciEndOptions, fibonacciRangeEnabledDraft, fibonacciRangeEndDraft, fibonacciRangeStartDraft]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }

      const opensShortcutsModal = event.key === "?" || (event.key === "/" && event.shiftKey);
      if (opensShortcutsModal && props.state.currentUser.boardShortcutsEnabled) {
        if (isTextEntryTarget(event.target)) {
          return;
        }
        event.preventDefault();
        setShortcutsModalOpen((current) => !current);
        return;
      }

      if (event.key === "Escape" && shortcutsModalOpen) {
        setShortcutsModalOpen(false);
        return;
      }

      if (isTextEntryTarget(event.target) || switchTeamOpen || timerMenuOpen || teamSettingsOpen || shortcutsModalOpen) {
        return;
      }

      if (props.state.currentUser.boardShortcutsEnabled) {
        const shortcutCardIndex = CARD_SHORTCUT_KEYS.indexOf(event.key as (typeof CARD_SHORTCUT_KEYS)[number]);
        if (shortcutCardIndex !== -1) {
          const card = currentDeck.cards[shortcutCardIndex];
          if (card && activeRound?.status === "active" && !props.isBusy && !isReadOnlyBoard) {
            event.preventDefault();
            void props.onVote(card);
          }
          return;
        }

        if (event.shiftKey) {
          return;
        }

        if (event.key === "r" || event.key === "R") {
          if (activeRound?.status === "active" && !props.isBusy && !isReadOnlyBoard) {
            event.preventDefault();
            void props.onReveal();
          }
          return;
        }

        if (event.key === "v" || event.key === "V") {
          if (latestHistoryEntryId && activeRound?.status === "revealed" && !props.isBusy && !isReadOnlyBoard) {
            event.preventDefault();
            if (confirmVoteAgain(activeRound.title)) {
              void props.onVoteAgain(latestHistoryEntryId);
            }
          }
          return;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    activeRound?.status,
    currentDeck.cards,
    isReadOnlyBoard,
    latestHistoryEntryId,
    props.isBusy,
    props.onReveal,
    props.onVote,
    props.onVoteAgain,
    props.state.currentUser.boardShortcutsEnabled,
    shortcutsModalOpen,
    switchTeamOpen,
    teamSettingsOpen,
    timerMenuOpen,
    activeRound?.title
  ]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem(HISTORY_RAIL_WIDTH_KEY, String(clampHistoryRailWidth(historyRailWidth)));
    } catch {
      // ignore storage failures
    }
  }, [historyRailWidth]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem(STACKED_HISTORY_HEIGHT_KEY, String(Math.round(stackedHistoryHeight)));
    } catch {
      // ignore storage failures
    }
  }, [stackedHistoryHeight]);

  useEffect(() => {
    const handleResize = () => setViewportSize(getViewportSize());
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!teamSettingsOpen) {
      setTeamSettingsSection("none");
      return;
    }

    const updateSubmenuAlign = () => {
      const wrap = teamSettingsRef.current;
      if (!wrap) {
        return;
      }
      const rect = wrap.getBoundingClientRect();
      const estimatedSubmenuWidth =
        teamSettingsSection === "timezones" ? 400 : teamSettingsSection === "quorum" ? 340 : teamSettingsSection === "shortcuts" ? 360 : 320;
      const rightSpace = window.innerWidth - rect.right;
      setTeamSettingsSubmenuAlign(rightSpace >= estimatedSubmenuWidth + 24 ? "right" : "left");
    };

    updateSubmenuAlign();
    window.addEventListener("resize", updateSubmenuAlign);
    return () => window.removeEventListener("resize", updateSubmenuAlign);
  }, [teamSettingsOpen, teamSettingsSection]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (switchTeamMenuRef.current && !switchTeamMenuRef.current.contains(event.target as Node)) {
        setSwitchTeamOpen(false);
      }
      if (teamSettingsRef.current && !teamSettingsRef.current.contains(event.target as Node)) {
        setTeamSettingsOpen(false);
      }
      if (timerSettingsRef.current && !timerSettingsRef.current.contains(event.target as Node)) {
        setTimerMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSwitchTeamOpen(false);
        setTeamSettingsOpen(false);
        setTimerMenuOpen(false);
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
    if (activeRound?.status === "revealed") {
      setTitleDraft("");
      centerPanelRef.current?.scrollTo({ top: 0 });
    }
  }, [activeRound?.id, activeRound?.status]);

  const visibleActiveParticipants = useMemo(
    () => getVisibleActiveParticipants(props.state),
    [props.state.activeParticipants, props.state.currentUser.id, props.state.currentUserRole, props.state.teamMembers]
  );

  useLayoutEffect(() => {
    const scrollArea = boardScrollAreaRef.current;
    const stage = boardStageRef.current;
    const cardRail = cardRailRef.current;
    if (!scrollArea || !stage) {
      return;
    }

    let frameId = 0;
    const updateBoardSizing = () => {
      const denseParticipantCount = Math.max(visibleActiveParticipants.length, props.state.teamMembers.length);
      const scrollStyles = window.getComputedStyle(scrollArea);
      const stageStyles = window.getComputedStyle(stage);
      const cardRailStyles = cardRail ? window.getComputedStyle(cardRail) : null;
      const availableHeight =
        scrollArea.clientHeight -
        parseFloat(scrollStyles.paddingTop || "0") -
        parseFloat(scrollStyles.paddingBottom || "0") -
        parseFloat(stageStyles.marginTop || "0") -
        ((cardRail?.offsetHeight ?? 0) + parseFloat(cardRailStyles?.marginTop || "0"));
      const minimumStageHeight =
        viewportWidth <= 720
          ? MOBILE_STAGE_MIN_HEIGHT
          : viewportWidth <= 1080
            ? denseParticipantCount >= 21
              ? DENSE_STACKED_STAGE_MIN_HEIGHT
              : STACKED_STAGE_MIN_HEIGHT
            : WIDE_STAGE_MIN_HEIGHT;
      const nextSizing = computeBoardSizingState(availableHeight, minimumStageHeight, viewportHeight, boardSizingRef.current);
      if (
        boardSizingRef.current &&
        boardSizingRef.current.needsScroll === nextSizing.needsScroll &&
        boardSizingRef.current.stageHeight === nextSizing.stageHeight
      ) {
        return;
      }
      boardSizingRef.current = nextSizing;
      setBoardNeedsScroll((current) => (current === nextSizing.needsScroll ? current : nextSizing.needsScroll));
      setBoardStageHeight((current) => (current === nextSizing.stageHeight ? current : nextSizing.stageHeight));
    };

    boardSizingRef.current = null;
    frameId = window.requestAnimationFrame(updateBoardSizing);
    const handleResize = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(updateBoardSizing);
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", handleResize);
    };
  }, [activeRound?.id, activeRound?.status, currentDeck.cards.length, historyRailWidth, props.state.teamMembers.length, viewportHeight, viewportWidth, visibleActiveParticipants.length]);

  useLayoutEffect(() => {
    const ring = participantRingRef.current;
    const centerPanel = centerPanelRef.current;
    const normalProbe = normalTileProbeRef.current;
    const compactProbe = compactTileProbeRef.current;
    if (!ring || !centerPanel || !normalProbe || !compactProbe) {
      return;
    }

    let frameId = 0;
    const updateLayoutGeometry = () => {
      const ringRect = ring.getBoundingClientRect();
      const centerRect = centerPanel.getBoundingClientRect();
      if (!ringRect.width || !ringRect.height) {
        return;
      }

      const shortStage = ring.clientHeight <= 560;
      const edgePadding = shortStage ? 8 : 12;
      const centerPadding = shortStage ? 14 : 18;

      const nextGeometry: BoardLayoutGeometry = {
        width: ring.clientWidth,
        height: ring.clientHeight,
        edgePadding,
        centerPadding,
        centerRect: {
          left: centerRect.left - ringRect.left,
          top: centerRect.top - ringRect.top,
          right: centerRect.right - ringRect.left,
          bottom: centerRect.bottom - ringRect.top
        },
        normalTile: {
          width: Math.ceil(normalProbe.getBoundingClientRect().width),
          height: Math.ceil(normalProbe.getBoundingClientRect().height)
        },
        compactTile: {
          width: Math.ceil(compactProbe.getBoundingClientRect().width),
          height: Math.ceil(compactProbe.getBoundingClientRect().height)
        },
        overflowSeed: props.state.team.id
      };

      setBoardLayoutGeometry((current) => {
        if (
          current &&
          nearlyEqual(current.width, nextGeometry.width) &&
          nearlyEqual(current.height, nextGeometry.height) &&
          current.edgePadding === nextGeometry.edgePadding &&
          current.centerPadding === nextGeometry.centerPadding &&
          nearlyEqual(current.centerRect.left, nextGeometry.centerRect.left) &&
          nearlyEqual(current.centerRect.top, nextGeometry.centerRect.top) &&
          nearlyEqual(current.centerRect.right, nextGeometry.centerRect.right) &&
          nearlyEqual(current.centerRect.bottom, nextGeometry.centerRect.bottom) &&
          nearlyEqual(current.normalTile.width, nextGeometry.normalTile.width) &&
          nearlyEqual(current.normalTile.height, nextGeometry.normalTile.height) &&
          nearlyEqual(current.compactTile.width, nextGeometry.compactTile.width) &&
          nearlyEqual(current.compactTile.height, nextGeometry.compactTile.height) &&
          current.overflowSeed === nextGeometry.overflowSeed
        ) {
          return current;
        }
        return nextGeometry;
      });
    };

    frameId = window.requestAnimationFrame(updateLayoutGeometry);
    const handleResize = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(updateLayoutGeometry);
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", handleResize);
    };
  }, [activeRound?.id, activeRound?.status, activeRound?.revealedAt, boardStageHeight, historyRailWidth, props.state.team.id, visibleActiveParticipants.length]);

  const getStackedHistoryMaxHeight = useCallback(() => {
    const minimum = getStackedHistoryMinHeight(viewportHeight);
    const shellHeight = boardShellRef.current?.clientHeight ?? viewportHeight;
    const headerHeight = boardHeaderRef.current?.offsetHeight ?? 0;
    return Math.max(minimum, shellHeight - headerHeight - STACKED_HISTORY_BOARD_MIN_HEIGHT);
  }, [viewportHeight]);

  useLayoutEffect(() => {
    if (!isStackedHistoryLayout) {
      return;
    }
    const maxHeight = getStackedHistoryMaxHeight();
    setStackedHistoryHeight((current) => clampStackedHistoryHeight(current, viewportHeight, maxHeight));
  }, [getStackedHistoryMaxHeight, isStackedHistoryLayout, viewportHeight]);

  const startHistoryRailResize = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (isStackedHistoryLayout) {
      return;
    }
    event.preventDefault();
    const shell = boardShellRef.current;
    if (!shell) {
      return;
    }

    setHistoryRailResizing(true);
    const shellRect = shell.getBoundingClientRect();
    const initialWidth = historyRailWidth;
    const startX = event.clientX;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const delta = startX - moveEvent.clientX;
      const nextWidth = clampHistoryRailWidth(initialWidth + delta);
      const maxReasonableWidth = Math.min(HISTORY_RAIL_MAX_WIDTH, Math.max(HISTORY_RAIL_MIN_WIDTH, Math.floor(shellRect.width * 0.6)));
      setHistoryRailWidth(clamp(nextWidth, HISTORY_RAIL_MIN_WIDTH, maxReasonableWidth));
    };

    const stopResize = () => {
      setHistoryRailResizing(false);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
  }, [historyRailWidth, isStackedHistoryLayout]);

  const startStackedHistoryResize = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!isStackedHistoryLayout) {
      return;
    }
    event.preventDefault();
    const initialHeight = stackedHistoryHeight;
    const startY = event.clientY;

    setStackedHistoryResizing(true);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const delta = startY - moveEvent.clientY;
      const nextHeight = initialHeight + delta;
      setStackedHistoryHeight(clampStackedHistoryHeight(nextHeight, viewportHeight, getStackedHistoryMaxHeight()));
    };

    const stopResize = () => {
      setStackedHistoryResizing(false);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
  }, [getStackedHistoryMaxHeight, isStackedHistoryLayout, stackedHistoryHeight, viewportHeight]);

  const toggleHistoryTimeZoneDraft = useCallback((key: HistoryTimeZoneKey) => {
    setHistoryTimeZoneKeysDraft((current) =>
      current.includes(key) ? current.filter((currentKey) => currentKey !== key) : [...current, key]
    );
  }, []);

  useEffect(() => {
    if (!revealDebugEnabled || typeof window === "undefined" || window.localStorage.getItem(DEBUG_REVEAL_KEY) !== "1") {
      return;
    }

    debugReveal("TeamBoard:render", {
      teamId: props.state.team.id,
      round: activeRound
        ? {
            id: activeRound.id,
            status: activeRound.status,
            votes: activeRound.votes.length,
            revealAverage: activeRound.revealAverage,
            revealedAt: activeRound.revealedAt
          }
        : null,
      history: props.state.history.length
    });

    if (centerPanelRef.current) {
      window.requestAnimationFrame(() => {
        debugReveal("TeamBoard:center-text", centerPanelRef.current?.innerText ?? "");
      });
    }
  }, [
    activeRound?.id,
    activeRound?.status,
    activeRound?.votes.length,
    activeRound?.revealAverage,
    activeRound?.revealedAt,
    props.state.history.length,
    props.state.team.id
  ]);

  const boardLayout = useMemo(() => {
    incrementPerfCounter("boardLayoutCalcs");
    if (typeof performance !== "undefined") {
      performance.mark("planning-poker:board-layout:start");
    }
    const nextLayout = calculateBoardLayout(visibleActiveParticipants, boardLayoutGeometry ?? DEFAULT_LAYOUT_GEOMETRY);
    if (typeof performance !== "undefined") {
      performance.mark("planning-poker:board-layout:end");
      performance.measure("planning-poker:board-layout", "planning-poker:board-layout:start", "planning-poker:board-layout:end");
    }
    return nextLayout;
  }, [boardLayoutGeometry, visibleActiveParticipants]);
  const memberPlacements = boardLayout.placements;
  const selectedVoteValue =
    activeRound?.votes.find((vote) => vote.userId === props.state.currentUser.id)?.value ?? null;
  const layoutGuideRects = useMemo(() => {
    if (!showLayoutGuides) {
      return [];
    }
    const geometry = boardLayoutGeometry ?? DEFAULT_LAYOUT_GEOMETRY;
    const centerSafeRect = getCenterSafeRect(geometry);
    const edgeSafeRect = getEdgeSafeRect(geometry);
    return [
      { key: "0", rect: centerSafeRect },
      { key: "25", rect: interpolateRect(centerSafeRect, edgeSafeRect, 0.25) },
      { key: "50", rect: interpolateRect(centerSafeRect, edgeSafeRect, 0.5) },
      { key: "75", rect: interpolateRect(centerSafeRect, edgeSafeRect, 0.75) },
      { key: "100", rect: edgeSafeRect }
    ];
  }, [boardLayoutGeometry, showLayoutGuides]);
  const layoutModeLabel =
    boardLayout.mode === "enough"
      ? "Layout: enough space"
      : boardLayout.mode === "compact"
        ? "Layout: compact mode"
        : boardLayout.mode === "overlap"
          ? "Layout: overlap mode"
          : "Layout: overflow mode";

  return (
    <div
      ref={boardShellRef}
      className={`board-shell${historyRailResizing ? " is-resizing-history" : ""}${stackedHistoryResizing ? " is-resizing-stacked-history" : ""}${isStackedHistoryLayout ? " is-stacked-history" : ""}`}
      style={
        {
          ["--history-rail-width" as string]: `${historyRailWidth}px`,
          ["--stacked-history-height" as string]: `${stackedHistoryHeight}px`
        } as CSSProperties
      }
    >
      <header ref={boardHeaderRef} className="screen-header">
        <div className="screen-header-bar">
          <div className="team-branding">
            <img className="team-icon" src={branding.teamLogo} alt="" />
            <div className="team-name-row">
              <h1>
                {props.state.team.name}
                {props.state.team.demo ? <span className="team-state-chip demo">Demo</span> : null}
                {props.state.team.archived ? <span className="team-state-chip archived">Archived</span> : null}
              </h1>
              <div className="timer-settings-wrap" ref={timerSettingsRef}>
                <button
                  className={timerMenuOpen ? "header-chip active" : "header-chip"}
                  type="button"
                  aria-label="Open team timer settings"
                  disabled={!canEditTeamSettings}
                  onClick={() => setTimerMenuOpen((current) => !current)}
                >
                  <StopwatchIcon />
                  <span>{props.state.team.timerSeconds == null ? "Off" : `${props.state.team.timerSeconds}s`}</span>
                </button>
                {timerMenuOpen ? (
                  <div className="timer-settings-popup" role="dialog" aria-label="Team timer settings">
                    <div className="team-settings-title">Countdown timer</div>
                    <div className="timer-settings-options">
                      <button
                        type="button"
                        className={props.state.team.timerSeconds == null ? "settings-option selected" : "settings-option"}
                        disabled={props.isBusy || !canEditTeamSettings}
                        onClick={() => {
                          void props.onUpdateTimer(null);
                          setTimerMenuOpen(false);
                        }}
                      >
                        Off
                      </button>
                      {TEAM_TIMER_OPTIONS.map((seconds) => (
                        <button
                          key={seconds}
                          type="button"
                          className={props.state.team.timerSeconds === seconds ? "settings-option selected" : "settings-option"}
                          disabled={props.isBusy || !canEditTeamSettings}
                          onClick={() => {
                            void props.onUpdateTimer(seconds);
                            setTimerMenuOpen(false);
                          }}
                        >
                          {seconds}s
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="team-settings-wrap" ref={teamSettingsRef}>
                <button
                  className={teamSettingsOpen ? "header-chip icon-only active" : "header-chip icon-only"}
                  type="button"
                  aria-label="Open team settings"
                  onClick={() => {
                    setTeamSettingsOpen((current) => !current);
                    setTeamSettingsSection("none");
                  }}
                >
                  <EditPencilIcon />
                </button>
                {teamSettingsOpen ? (
                  <div className="team-settings-popup" role="dialog" aria-label="Team settings">
                    <div className="team-settings-actions">
                      {canEditTeamSettings ? (
                        <button
                          type="button"
                          className={teamSettingsSection === "deck" ? "settings-option selected has-submenu" : "settings-option has-submenu"}
                          onClick={() => setTeamSettingsSection("deck")}
                        >
                          <span>Numbering system</span>
                          <span className="submenu-arrow">
                            <ChevronRightIcon />
                          </span>
                        </button>
                      ) : null}
                      {canEditTeamSettings ? (
                        <button
                          type="button"
                          className={teamSettingsSection === "rename" ? "settings-option selected has-submenu" : "settings-option has-submenu"}
                          onClick={() => setTeamSettingsSection("rename")}
                        >
                          <span>Rename team</span>
                          <span className="submenu-arrow">
                            <ChevronRightIcon />
                          </span>
                        </button>
                      ) : null}
                      {canEditTeamSettings ? (
                        <button
                          type="button"
                          className={teamSettingsSection === "timezones" ? "settings-option selected has-submenu" : "settings-option has-submenu"}
                          onClick={() => setTeamSettingsSection("timezones")}
                        >
                          <span>Time popup</span>
                          <span className="submenu-arrow">
                            <ChevronRightIcon />
                          </span>
                        </button>
                      ) : null}
                      {canEditTeamSettings ? (
                        <button
                          type="button"
                          className={teamSettingsSection === "quorum" ? "settings-option selected has-submenu" : "settings-option has-submenu"}
                          onClick={() => setTeamSettingsSection("quorum")}
                        >
                          <span>Minimum participation</span>
                          <span className="submenu-arrow">
                            <ChevronRightIcon />
                          </span>
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className={teamSettingsSection === "shortcuts" ? "settings-option selected has-submenu" : "settings-option has-submenu"}
                        onClick={() => setTeamSettingsSection("shortcuts")}
                      >
                        <span>Keyboard shortcuts</span>
                        <span className="submenu-arrow">
                          <ChevronRightIcon />
                        </span>
                      </button>
                      {props.state.currentUserRole !== "none" && !props.state.currentUser.isSuperAdmin ? (
                        <button
                          type="button"
                          className="settings-option"
                          onClick={() => {
                            if (window.confirm(`Leave "${props.state.team.name}"? You will lose board and history access until you join again.`)) {
                              void props.onLeaveCurrentTeam();
                              setTeamSettingsOpen(false);
                            }
                          }}
                        >
                          Leave team
                        </button>
                      ) : null}
                    </div>
                    {teamSettingsSection !== "none" ? (
                      <div
                        className={`team-settings-secondary team-settings-secondary-${teamSettingsSubmenuAlign}${
                          teamSettingsSection === "timezones" ? " team-settings-secondary-wide" : ""
                        }`}
                        role="dialog"
                        aria-label={
                          teamSettingsSection === "deck"
                            ? "Numbering system menu"
                            : teamSettingsSection === "timezones"
                              ? "Time popup settings"
                              : teamSettingsSection === "quorum"
                                ? "Minimum participation settings"
                              : teamSettingsSection === "rename"
                                ? "Rename team panel"
                                : "Keyboard shortcuts"
                        }
                      >
                        {teamSettingsSection === "deck" ? (
                          <form
                            className="team-deck-form"
                            onSubmit={(event) => {
                              event.preventDefault();
                              void props.onUpdateDeckSettings({
                                deckKey: deckDraftKey,
                                fibonacciRangeStart: deckDraftKey === "fibonacci" && fibonacciRangeEnabledDraft ? normalizedDraftFibonacciRange.fibonacciRangeStart : null,
                                fibonacciRangeEnd: deckDraftKey === "fibonacci" && fibonacciRangeEnabledDraft ? normalizedDraftFibonacciRange.fibonacciRangeEnd : null
                              });
                              setTeamSettingsOpen(false);
                            }}
                          >
                            <div className="team-settings-title">Numbering system</div>
                            <div className="team-settings-options">
                              {DECKS.map((deck) => (
                                <button
                                  key={deck.key}
                                  type="button"
                                  className={deckDraftKey === deck.key ? "settings-option selected" : "settings-option"}
                                  disabled={props.isBusy}
                                  onClick={() => {
                                    setDeckDraftKey(deck.key);
                                    if (deck.key !== "fibonacci") {
                                      setFibonacciRangeEnabledDraft(false);
                                    }
                                  }}
                                >
                                  {deck.label}
                                </button>
                              ))}
                            </div>
                            {deckDraftKey === "fibonacci" ? (
                              <>
                                <label className="settings-toggle-row">
                                  <input
                                    type="checkbox"
                                    checked={fibonacciRangeEnabledDraft}
                                    disabled={props.isBusy}
                                    onChange={(event) => setFibonacciRangeEnabledDraft(event.target.checked)}
                                  />
                                  <span>Use custom Fibonacci range</span>
                                </label>
                                {fibonacciRangeEnabledDraft ? (
                                  <div className="fibonacci-range-settings">
                                    <label>
                                      Start
                                      <select
                                        value={fibonacciRangeStartDraft}
                                        onChange={(event) => setFibonacciRangeStartDraft(event.target.value as FibonacciRangeStart)}
                                      >
                                        {FIBONACCI_RANGE_START_OPTIONS.map((option) => (
                                          <option key={option} value={option}>
                                            {option}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    <label>
                                      End
                                      <select
                                        value={fibonacciRangeEndDraft}
                                        onChange={(event) => setFibonacciRangeEndDraft(event.target.value as FibonacciRangeEnd)}
                                      >
                                        {availableFibonacciEndOptions.map((option) => (
                                          <option key={option} value={option}>
                                            {option}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                  </div>
                                ) : null}
                                <div className="timezone-settings-help">Ready-made presets stay available. This only narrows the full Fibonacci deck for this team.</div>
                              </>
                            ) : null}
                            <button
                              className="secondary-button"
                              type="submit"
                              disabled={props.isBusy || (deckDraftKey === "fibonacci" && fibonacciRangeEnabledDraft && normalizedDraftFibonacciRange.fibonacciRangeStart == null)}
                            >
                              Save numbering
                            </button>
                          </form>
                        ) : teamSettingsSection === "timezones" ? (
                          <form
                            className="timezone-settings-form"
                            onSubmit={(event) => {
                              event.preventDefault();
                              if (historyTimeZoneKeysDraft.length > 0) {
                                void props.onUpdateHistoryTimezoneSettings(props.state.team.historyTimezonePopupEnabled, historyTimeZoneKeysDraft);
                                setTeamSettingsOpen(false);
                              }
                            }}
                          >
                            <div className="team-settings-title">Default date popup zones</div>
                            <div className="timezone-settings-help">
                              Choose the default Issues List popup zones for users who have not saved a personal time zone list.
                            </div>
                            <div className="timezone-settings-options" aria-label="Time zones to display">
                              {HISTORY_TIME_ZONE_OPTIONS.map((option) => (
                                <label key={option.key} className="timezone-option">
                                  <input
                                    type="checkbox"
                                    aria-label={option.label}
                                    checked={historyTimeZoneKeysDraft.includes(option.key)}
                                    disabled={props.isBusy}
                                    onChange={() => toggleHistoryTimeZoneDraft(option.key)}
                                  />
                                  <span className="timezone-option-label">{option.label}</span>
                                  <span className="timezone-option-offset">{formatTimeZoneOffsetLabel(option.timeZone)}</span>
                                </label>
                              ))}
                            </div>
                            <button
                              className="secondary-button"
                              type="submit"
                              disabled={props.isBusy || historyTimeZoneKeysDraft.length === 0}
                            >
                              Save default zones
                            </button>
                          </form>
                        ) : teamSettingsSection === "quorum" ? (
                          <form
                            className="team-rename-form"
                            onSubmit={(event) => {
                              event.preventDefault();
                              void handleUpdateQuorumSettings(minimumVotePercentEnabledDraft, parsedMinimumVotePercentDraft);
                              setTeamSettingsOpen(false);
                            }}
                          >
                            <div className="team-settings-title">Minimum participation</div>
                            <label className="settings-toggle-row">
                              <input
                                type="checkbox"
                                checked={minimumVotePercentEnabledDraft}
                                disabled={props.isBusy}
                                onChange={(event) => setMinimumVotePercentEnabledDraft(event.target.checked)}
                              />
                              <span>Require a minimum percentage of votes before showing the final average</span>
                            </label>
                            <label>
                              Minimum vote percentage
                              <input
                                type="number"
                                min={1}
                                max={100}
                                step={1}
                                value={minimumVotePercentDraft}
                                disabled={props.isBusy || !minimumVotePercentEnabledDraft}
                                onChange={(event) => setMinimumVotePercentDraft(event.target.value)}
                              />
                            </label>
                            <div className="timezone-settings-help">
                              If the threshold is not met, the reveal stays gated and shows voted vs not-voted counts instead of the final average.
                            </div>
                            <button className="secondary-button" type="submit" disabled={props.isBusy}>
                              Save participation rule
                            </button>
                          </form>
                        ) : teamSettingsSection === "rename" ? (
                          <form
                            className="team-rename-form"
                            onSubmit={(event) => {
                              event.preventDefault();
                              if (teamNameDraft.trim().length >= 2) {
                                void props.onRenameTeam(teamNameDraft);
                                setTeamSettingsOpen(false);
                              }
                            }}
                          >
                            <div className="team-settings-title">Rename team</div>
                            <input value={teamNameDraft} onChange={(event) => setTeamNameDraft(event.target.value)} aria-label="Rename team" />
                            <button className="secondary-button" type="submit" disabled={props.isBusy || teamNameDraft.trim().length < 2}>
                              Save team name
                            </button>
                          </form>
                        ) : (
                          <>
                            <div className="team-settings-title">Keyboard shortcuts</div>
                            <ShortcutsHelpContent />
                            <button className="secondary-button" type="button" onClick={() => setShortcutsModalOpen(true)}>
                              Open the keyboard shortcuts help modal.
                            </button>
                          </>
                        )}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          <div className="header-toolbar">
            <NotificationBell
              feed={props.notificationFeed}
              isBusy={props.isBusy}
              onOpen={props.onOpenNotifications}
              onLoadMoreHistory={props.onLoadMoreHistory ?? (async () => undefined)}
              onAdmitTeamJoinRequest={props.onAdmitJoinRequest}
              onDenyTeamJoinRequest={props.onDenyJoinRequest}
              onAdmitPlatformAccessRequest={props.onAdmitPlatformAccessRequest}
              onDenyPlatformAccessRequest={props.onDenyPlatformAccessRequest}
            />
            <button className="header-chip" type="button" onClick={() => props.onOpenMemberDirectory(props.state.team.id)}>
              {props.state.currentUser.isSuperAdmin || props.state.currentUserRole === "team_admin" ? "Team admin" : "Members"}
            </button>
            <button className="header-chip icon-only header-action-fixed" type="button" aria-label="Copy team link" onClick={() => void props.onShareTeamLink?.()}>
              <ShareNodesIcon />
            </button>
            <button className="header-chip icon-only header-action-fixed" type="button" aria-label="Open main menu" onClick={props.onOpenTeamChooser}>
              <MenuIcon />
            </button>
            <div className="switch-team-wrap" ref={switchTeamMenuRef}>
              <button className={switchTeamOpen ? "header-chip switch-team-trigger active" : "header-chip switch-team-trigger"} type="button" aria-label="Switch team" onClick={() => setSwitchTeamOpen((current) => !current)}>
                <span>Switch team</span>
                <span className="header-chip-icon">
                  <ChevronDownIcon />
                </span>
              </button>
              {switchTeamOpen ? (
                <div className="switch-team-menu" role="menu" aria-label="Switch team menu">
                  {switchableTeams.map((team) => (
                    <button
                      key={team.id}
                      className={team.id === props.state.team.id ? "switch-team-option current" : "switch-team-option"}
                      type="button"
                      role="menuitem"
                      aria-label={team.name}
                      onClick={() => {
                        setTeamSelectDraft(team.id);
                        setSwitchTeamOpen(false);
                        if (team.id !== props.state.team.id) {
                          props.onSelectTeam(team.id);
                        }
                      }}
                    >
                      <span className="switch-team-option-label">{truncateLabel(team.name, 30)}</span>
                      {team.id === props.state.team.id ? <span className="switch-team-option-current">Current</span> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <button className="profile-toggle header-chip" type="button" aria-label="Edit profile" onClick={props.onOpenAccountSettings} title={props.state.currentUser.displayName}>
              <img src={getAvatarUrl(props.state.currentUser.avatarIconKey, props.state.currentUser.avatarColorKey)} alt={props.state.currentUser.displayName} />
              <div className="profile-preview">{truncateLabel(props.state.currentUser.displayName, 14)}</div>
              <span className="profile-edit-icon">
                <EditPencilIcon />
              </span>
            </button>
          </div>
        </div>
        <BrandFooter branding={branding} />
      </header>

      <BoardStageContent
        branding={branding}
        teamBackgroundOpacity={Math.max(0, Math.min(1, props.state.team.backgroundOpacity * (0.6 + branding.backgroundOpacity)))}
        boardNeedsScroll={boardNeedsScroll}
        boardStageHeight={boardStageHeight}
        boardMainRef={boardMainRef}
        participantRingRef={participantRingRef}
        normalTileProbeRef={normalTileProbeRef}
        compactTileProbeRef={compactTileProbeRef}
        boardScrollAreaRef={boardScrollAreaRef}
        boardStageRef={boardStageRef}
        cardRailRef={cardRailRef}
        centerPanelRef={centerPanelRef}
        activeRound={activeRound}
        currentUser={props.state.currentUser}
        layoutGuideRects={layoutGuideRects}
        memberPlacements={memberPlacements}
        titleDraft={titleDraft}
        onTitleDraftChange={setTitleDraft}
        canCreateRound={canCreateRound}
        isBusy={props.isBusy}
        onCreateRound={props.onCreateRound}
        onReveal={props.onReveal}
        onCancelActiveRound={props.onCancelActiveRound}
        onVoteAgainActiveRound={props.onVoteAgainActiveRound}
        onVoteAgain={props.onVoteAgain}
        latestHistoryEntryId={latestHistoryEntryId}
        currentDeckCards={currentDeck.cards}
        selectedVoteValue={selectedVoteValue}
        onVote={props.onVote}
        teamTimerSeconds={props.state.team.timerSeconds}
        pendingIssues={pendingIssues.map((issue) => ({
          id: issue.id,
          issueKey: issue.issueKey,
          title: issue.title,
          displayTitle: issue.displayTitle
        }))}
        onLoadPendingIssue={handleLoadPendingIssue}
        layoutModeLabel={layoutModeLabel}
        status={props.status}
        isReadOnly={isReadOnlyBoard}
        readOnlyMessage={readOnlyMessage}
      />

      <ShortcutsHelpModal open={shortcutsModalOpen} onClose={() => setShortcutsModalOpen(false)} />

      {isStackedHistoryLayout ? (
        <div className="stacked-history-panel">
          <button
            type="button"
            className="history-stack-resize-handle"
            aria-label="Resize issues list height"
            onPointerDown={startStackedHistoryResize}
          >
            <span className="history-stack-resize-line" />
            <span className="history-stack-resize-symbol" aria-hidden="true">
              ↕
            </span>
          </button>
          <HistoryRail
            className="stacked"
            teamId={props.state.team.id}
            historyItems={historyItems}
            historyNextCursor={historyNextCursor}
            historyLoading={historyLoading}
            searchItems={searchItems}
            searchNextCursor={searchNextCursor}
            searchLoading={searchLoading}
            searchFilters={searchFilters}
            hasSearched={hasSearchedHistory}
            historyTimezonePopupEnabled={props.state.currentUser.historyTimezonePopupEnabled ?? true}
            historyTimezoneKeys={getEffectiveHistoryTimezoneKeys(props.state.currentUser, props.state.team.historyTimezoneKeys)}
            currentUserId={props.state.currentUser.id}
            isReadOnly={isReadOnlyBoard}
            isBusy={props.isBusy}
            latestRevealedHistoryId={latestHistoryEntryId}
            onVoteAgain={props.onVoteAgain}
            onAddComment={props.onAddHistoryComment}
            onEditComment={props.onEditHistoryComment}
            onDeleteComment={props.onDeleteHistoryComment}
            onLoadMoreHistory={handleLoadMoreIssueHistory}
            onRunSearch={handleRunIssueHistorySearch}
            onLoadMoreSearch={handleLoadMoreIssueSearch}
          />
        </div>
      ) : null}

      {!isStackedHistoryLayout ? (
        <button
          type="button"
          className="history-resize-handle"
          aria-label="Resize issues list"
          onPointerDown={startHistoryRailResize}
        >
          <span className="history-resize-grip" />
        </button>
      ) : null}

      {!isStackedHistoryLayout ? (
        <HistoryRail
          className="desktop"
          teamId={props.state.team.id}
          historyItems={historyItems}
          historyNextCursor={historyNextCursor}
          historyLoading={historyLoading}
          searchItems={searchItems}
          searchNextCursor={searchNextCursor}
          searchLoading={searchLoading}
          searchFilters={searchFilters}
          hasSearched={hasSearchedHistory}
          historyTimezonePopupEnabled={props.state.currentUser.historyTimezonePopupEnabled ?? true}
          historyTimezoneKeys={getEffectiveHistoryTimezoneKeys(props.state.currentUser, props.state.team.historyTimezoneKeys)}
          currentUserId={props.state.currentUser.id}
          isReadOnly={isReadOnlyBoard}
          isBusy={props.isBusy}
          latestRevealedHistoryId={latestHistoryEntryId}
          onVoteAgain={props.onVoteAgain}
          onAddComment={props.onAddHistoryComment}
          onEditComment={props.onEditHistoryComment}
          onDeleteComment={props.onDeleteHistoryComment}
          onLoadMoreHistory={handleLoadMoreIssueHistory}
          onRunSearch={handleRunIssueHistorySearch}
          onLoadMoreSearch={handleLoadMoreIssueSearch}
        />
      ) : null}
    </div>
  );
});

export default function App() {
  const initialRoute = readRouteState();
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [branding, setBranding] = useState<BrandingManifest>(() => mergeBrandingManifest(BRANDING_MANIFEST));
  const [teamState, setTeamState] = useState<TeamStateResponse | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(initialRoute.selectedTeamId);
  const [pendingTargetTeamId, setPendingTargetTeamId] = useState<string | null>(initialRoute.selectedTeamId);
  const [showTeamChooser, setShowTeamChooser] = useState(initialRoute.showTeamChooser);
  const [authStep, setAuthStep] = useState<AuthStep>("signin");
  const [authFlow, setAuthFlow] = useState<AuthFlow>("standard");
  const [email, setEmail] = useState("");
  const [adminUsername, setAdminUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [avatarSelection, setAvatarSelection] = useState(() => pickRandomAvatarSelection());
  const [code, setCode] = useState("");
  const [debugCode, setDebugCode] = useState<string | null>(null);
  const [debugToolsEnabled, setDebugToolsEnabled] = useState(false);
  const [debugCodesEnabled, setDebugCodesEnabled] = useState(false);
  const [smtpConfigured, setSmtpConfigured] = useState(false);
  const [publicTrial, setPublicTrial] = useState<NonNullable<BootstrapResponse["publicTrial"]>>({
    enabled: false,
    mode: "disabled",
    maxTeamsPerWorkspace: 2,
    maxUsersPerWorkspace: 10,
    maxRevealedRoundsPerWorkspacePerMonth: 40,
    maxSignupRequestsPerIpPerHour: 3,
    maxCodeRequestsPerEmailPerDay: 5,
    maxInvitesPerWorkspacePerDay: 10,
    maxWorkspaceCreationsPerIpPerDay: 2,
    maxLoginAttemptsPerEmailPerHour: 10
  });
  const [trialTermsAccepted, setTrialTermsAccepted] = useState(false);
  const [trialTermsVersion, setTrialTermsVersion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusState>({
    tone: "neutral",
    text: "Ready. You will return to your last team automatically after sign-in, and you can switch teams from the header."
  });
  const [isBusy, setIsBusy] = useState(false);
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);
  const [adminSettingsOpen, setAdminSettingsOpen] = useState(false);
  const [adminPeopleRefreshTick, setAdminPeopleRefreshTick] = useState(0);
  const [memberDirectory, setMemberDirectory] = useState<TeamDirectoryResponse | null>(null);
  const [notificationFeed, setNotificationFeed] = useState<NotificationFeedResponse | null>(null);
  const [historyNextCursor, setHistoryNextCursor] = useState<HistoryPageCursor | null>(null);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const [historySearchFilters, setHistorySearchFilters] = useState<TeamHistorySearchFilters>(EMPTY_HISTORY_SEARCH_FILTERS);
  const [historySearchItems, setHistorySearchItems] = useState<HistoryEntry[]>([]);
  const [historySearchNextCursor, setHistorySearchNextCursor] = useState<HistoryPageCursor | null>(null);
  const [historySearchLoading, setHistorySearchLoading] = useState(false);
  const [historySearchRequested, setHistorySearchRequested] = useState(false);
  const [historyTimezonePreferenceOverrides, setHistoryTimezonePreferenceOverrides] = useState<
    Record<string, HistoryTimezonePreferenceOverride>
  >({});
  const latestLoadRef = useRef(0);
  const roundStateLockRef = useRef<RoundStateLock | null>(null);
  const teamStateRef = useRef<TeamStateResponse | null>(null);
  const membershipsRef = useRef<TeamMembershipSummary[]>([]);
  const pendingPresenceRef = useRef<PendingPresenceState | null>(null);
  const chooserVisible = Boolean(session?.user.id) && (showTeamChooser || !selectedTeamId || !teamState);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--brand-primary-action", branding.palette.primaryAction);
    root.style.setProperty("--brand-accent-highlight", branding.palette.accentHighlight);
    root.style.setProperty("--brand-surface-tint", branding.palette.surfaceTint);
    root.style.setProperty("--brand-text-emphasis", branding.palette.textEmphasis);
    root.style.setProperty("--brand-background-opacity", String(branding.backgroundOpacity));
  }, [branding]);

  useEffect(() => {
    teamStateRef.current = teamState;
  }, [teamState]);

  useEffect(() => {
    membershipsRef.current = session?.memberships ?? [];
  }, [session?.memberships]);

  useEffect(() => {
    if (!selectedTeamId || showTeamChooser) {
      pendingPresenceRef.current = null;
      return;
    }

    if (pendingPresenceRef.current && pendingPresenceRef.current.teamId !== selectedTeamId) {
      pendingPresenceRef.current = null;
    }
  }, [selectedTeamId, showTeamChooser]);

  useEffect(() => {
    setHistoryNextCursor(null);
    setHistoryLoadingMore(false);
    setHistorySearchFilters(EMPTY_HISTORY_SEARCH_FILTERS);
    setHistorySearchItems([]);
    setHistorySearchNextCursor(null);
    setHistorySearchLoading(false);
    setHistorySearchRequested(false);
  }, [selectedTeamId, showTeamChooser]);

  const setBusyStatus = useCallback((text: string) => {
    setStatus({ tone: "busy", text });
  }, []);

  const setSuccessStatus = useCallback((text: string) => {
    setStatus({ tone: "success", text });
  }, []);

  const setErrorStatus = useCallback((text: string) => {
    setStatus({ tone: "error", text });
  }, []);

  const clearStatus = useCallback(() => {
    setStatus({ tone: "neutral", text: "Ready." });
  }, []);

  const loadNotifications = useCallback(async (markSeen = false, detail: "summary" | "full" = "summary") => {
    try {
      const scopedTeamId = showTeamChooser ? null : selectedTeamId;
      const query = new URLSearchParams();
      if (scopedTeamId) {
        query.set("teamId", scopedTeamId);
      }
      if (detail === "summary") {
        query.set("includeHistory", "0");
        query.set("includeAdminHistory", "0");
      }
      const url = `${markSeen ? "/api/auth/notifications/seen" : "/api/auth/notifications"}${query.size ? `?${query.toString()}` : ""}`;
      const response = await api<NotificationFeedResponse>(url, {
        method: markSeen ? "POST" : "GET"
      });
      startTransition(() => {
        setNotificationFeed((current) => {
          const nextFeed =
            detail === "full"
              ? response
              : {
                  ...response,
                  history: current?.history ?? response.history,
                  adminHistory: current?.adminHistory ?? response.adminHistory ?? null
                };
          if (
            current &&
            sameNotificationSummaryArray(current.active, nextFeed.active) &&
            sameNotificationSummaryArray(current.history, nextFeed.history) &&
            samePendingJoinRequestSummaryArray(current.pendingJoinRequests, nextFeed.pendingJoinRequests) &&
            samePlatformAccessRequestSummaryArray(current.platformAccessRequests ?? [], nextFeed.platformAccessRequests ?? []) &&
            sameActionHistoryPage(current.adminHistory, nextFeed.adminHistory)
          ) {
            return current;
          }
          return nextFeed;
        });
      });
      return response;
    } catch {
      if (detail === "full") {
        startTransition(() => {
          setNotificationFeed(null);
        });
      }
      return null;
    }
  }, [selectedTeamId, showTeamChooser]);

  const loadMoreNotificationHistory = useCallback(async (cursor: string) => {
    try {
      const query = new URLSearchParams({ cursor });
      const scopedTeamId = showTeamChooser ? null : selectedTeamId;
      if (scopedTeamId) {
        query.set("teamId", scopedTeamId);
      }
      const response = await api<ActionHistoryPage>(`/api/auth/action-history?${query.toString()}`);
      startTransition(() => {
        setNotificationFeed((current) => {
          if (!current?.adminHistory) {
            return current;
          }
          const nextAdminHistory = {
            items: [...current.adminHistory.items, ...response.items],
            nextCursor: response.nextCursor
          };
          if (sameActionHistoryPage(current.adminHistory, nextAdminHistory)) {
            return current;
          }
          return {
            ...current,
            adminHistory: nextAdminHistory
          };
        });
      });
    } catch {
      // leave the already loaded history slice intact
    }
  }, [selectedTeamId, showTeamChooser]);

  const loadSession = useCallback(async () => {
    try {
      const response = await api<SessionResponse>("/api/auth/session");
      storeSessionToken(response.token ?? null);
      startTransition(() => {
        setSession((current) => (sameSessionResponse(current, response) ? current : response));
      });
      const selectedTeamIsMembership = selectedTeamId ? response.memberships.some((membership) => membership.id === selectedTeamId) : false;
      const selectedTeamIsVisible = selectedTeamId ? response.availableTeams.some((team) => team.id === selectedTeamId) : false;

      if (selectedTeamIsMembership) {
        return;
      }

      if (selectedTeamIsVisible) {
        setPendingTargetTeamId(selectedTeamId);
        return;
      }

      if (!response.memberships.length) {
        localStorage.removeItem(SELECTED_TEAM_KEY);
        setSelectedTeamId(null);
        setPendingTargetTeamId(null);
        return;
      }

      if (response.user.isSuperAdmin && !selectedTeamId) {
        localStorage.removeItem(SELECTED_TEAM_KEY);
        setPendingTargetTeamId(null);
        setSelectedTeamId(null);
        return;
      }

      setPendingTargetTeamId(null);
      setSelectedTeamId(response.memberships[0].id);
    } catch {
      storeSessionToken(null);
      setSession(null);
      setTeamState(null);
      setNotificationFeed(null);
      setAccountSettingsOpen(false);
      setAdminSettingsOpen(false);
      setAuthStep("signin");
      setAuthFlow("standard");
      setCode("");
      setPassword("");
      setConfirmPassword("");
      setDebugCode(null);
      setTrialTermsAccepted(false);
      setTrialTermsVersion(null);
    }
  }, [selectedTeamId]);

  const loadAdminConfig = useCallback(async () => {
    return api<AdminConfigView>("/api/admin/config");
  }, []);

  const loadAdminPeople = useCallback(async (options?: { offset?: number; sort?: PlatformPeopleSort; q?: string }) => {
    const params = new URLSearchParams();
    if (typeof options?.offset === "number" && options.offset > 0) {
      params.set("offset", String(options.offset));
    }
    if (options?.sort && options.sort !== "recent") {
      params.set("sort", options.sort);
    }
    if (options?.q?.trim()) {
      params.set("q", options.q.trim());
    }
    const query = params.toString();
    return api<PlatformPeopleResponse>(`/api/admin/people${query ? `?${query}` : ""}`);
  }, []);

  const saveAdminConfig = useCallback(async (patch: Record<string, unknown>) => {
    return api<AdminConfigSaveResult>("/api/admin/config", {
      method: "PATCH",
      body: JSON.stringify(patch)
    });
  }, []);

  const admitAccessRequest = useCallback(async (requestId: string) => {
    return api<PlatformAccessRequestActionResponse>(`/api/admin/access-requests/${requestId}/admit`, {
      method: "POST"
    });
  }, []);

  const denyAccessRequest = useCallback(async (requestId: string) => {
    await api<{ ok: boolean }>(`/api/admin/access-requests/${requestId}/deny`, {
      method: "POST"
    });
  }, []);

  const resetPlatformUserPassword = useCallback(async (userId: string) => {
    return api<TeamMemberPasswordResetResponse>(`/api/admin/users/${userId}/reset-password`, {
      method: "POST"
    });
  }, []);

  const loadAccountDeletionPreview = useCallback(async () => {
    return api<AccountDeletionPreview>("/api/account/deletion-preview");
  }, []);

  const deleteOwnAccount = useCallback(async (currentPassword: string, confirmation: string, impactToken: string) => {
    setIsBusy(true);
    try {
      await api("/api/account/delete", {
        method: "POST",
        body: JSON.stringify({ currentPassword, confirmation, impactToken })
      });
      storeSessionToken(null);
      localStorage.removeItem(SELECTED_TEAM_KEY);
      setAccountSettingsOpen(false);
      setAdminSettingsOpen(false);
      setSelectedTeamId(null);
      setPendingTargetTeamId(null);
      setShowTeamChooser(false);
      setMemberDirectory(null);
      setTeamState(null);
      setNotificationFeed(null);
      setSession(null);
      setAuthStep("signin");
      setAuthFlow("standard");
      setCode("");
      setPassword("");
      setConfirmPassword("");
      setDisplayName("");
      setDebugCode(null);
      setTrialTermsAccepted(false);
      setTrialTermsVersion(null);
      setInfo("Your account was deleted.");
      setSuccessStatus("Account deleted successfully.");
      writeRouteState({ selectedTeamId: null, showTeamChooser: false }, "replace");
      // A destructive account operation must not retain stale auth, chooser, or websocket state.
      window.location.replace("/");
    } finally {
      setIsBusy(false);
    }
  }, [setSuccessStatus]);

  const loadPlatformUserDeletionPreview = useCallback(async (userId: string) => {
    return api<AccountDeletionPreview>(`/api/admin/users/${userId}/deletion-preview`);
  }, []);

  const deletePlatformUser = useCallback(async (userId: string, confirmation: string, impactToken: string) => {
    await api(`/api/admin/users/${userId}`, {
      method: "DELETE",
      body: JSON.stringify({ confirmation, impactToken })
    });
    setAdminPeopleRefreshTick((current) => current + 1);
    await loadSession();
  }, [loadSession]);

  const revealAdminSecret = useCallback(async (field: "admin.password" | "smtp.pass" | "jira.clientSecret") => {
    const response = await api<RevealSecretResponse>("/api/admin/config/reveal-secret", {
      method: "POST",
      body: JSON.stringify({ field })
    });
    return response.value;
  }, []);

  const startJiraOAuth = useCallback(async () => {
    const response = await api<JiraOauthStartResponse>("/api/admin/jira/oauth/start", {
      method: "POST"
    });
    return response.authorizationUrl;
  }, []);

  const selectJiraSite = useCallback(async (cloudId: string) => {
    return api<AdminConfigView>("/api/admin/jira/oauth/select-site", {
      method: "POST",
      body: JSON.stringify({ cloudId })
    });
  }, []);

  const disconnectJira = useCallback(async () => {
    return api<AdminConfigView>("/api/admin/jira/disconnect", {
      method: "POST"
    });
  }, []);

  const uploadBrandingAsset = useCallback(async (slot: BrandingAssetSlot, file: File) => {
    const dataUrl = await readFileAsDataUrl(file);
    const dataBase64 = dataUrl.includes(",") ? dataUrl.slice(dataUrl.indexOf(",") + 1) : dataUrl;
    return api<AdminConfigSaveResult>("/api/admin/branding/upload", {
      method: "POST",
      body: JSON.stringify({
        slot,
        fileName: file.name,
        mimeType: file.type || "image/svg+xml",
        dataBase64
      })
    });
  }, []);

  const exportWholeDatabase = useCallback(async () => {
    try {
      setBusyStatus("Exporting the full platform database...");
      setIsBusy(true);
      const response = await authorizedFetch("/api/admin/database/export");
      const blob = await response.blob();
      downloadBlob(getDownloadFileName(response, "planning-poker.sqlite"), blob);
      setSuccessStatus("Database snapshot exported.");
    } catch (requestError) {
      setErrorStatus((requestError as Error).message);
      throw requestError;
    } finally {
      setIsBusy(false);
    }
  }, [setBusyStatus, setErrorStatus, setSuccessStatus]);

  const importWholeDatabase = useCallback(async (file: File) => {
    try {
      setBusyStatus("Importing the full platform database snapshot...");
      setIsBusy(true);
      const bytes = await readFileAsArrayBuffer(file);
      const response = await authorizedFetch("/api/admin/database/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream"
        },
        body: bytes
      });
      const result = (await response.json()) as { ok: boolean; token?: string };
      storeSessionToken(result.token ?? null);
      await loadSession();
      setAdminPeopleRefreshTick((current) => current + 1);
      setSelectedTeamId(null);
      setShowTeamChooser(true);
      writeRouteState({ selectedTeamId: null, showTeamChooser: true });
      setSuccessStatus("Database snapshot imported successfully.");
    } catch (requestError) {
      setErrorStatus((requestError as Error).message);
      throw requestError;
    } finally {
      setIsBusy(false);
    }
  }, [loadSession, setBusyStatus, setErrorStatus, setSuccessStatus]);

  const exportTeamHistory = useCallback(async (teamId: string, includeComments: boolean) => {
    try {
      setBusyStatus("Exporting the selected team history...");
      setIsBusy(true);
      const query = new URLSearchParams();
      if (!includeComments) {
        query.set("includeComments", "0");
      }
      const response = await api<TeamHistoryExportResponse>(`/api/teams/${teamId}/export${query.size ? `?${query.toString()}` : ""}`);
      const blob = new Blob([JSON.stringify(response.package, null, 2)], { type: "application/json" });
      downloadBlob(response.fileName, blob);
      setSuccessStatus("Team history exported.");
    } catch (requestError) {
      setErrorStatus((requestError as Error).message);
      throw requestError;
    } finally {
      setIsBusy(false);
    }
  }, [setBusyStatus, setErrorStatus, setSuccessStatus]);

  const handleAdminConfigApplied = useCallback(async (result: AdminConfigSaveResult) => {
    setBranding(mergeBrandingManifest(result.config.branding));
    await loadSession().catch(() => undefined);
  }, [loadSession]);

  useEffect(() => {
    const handlePopState = () => {
      const nextRoute = readRouteState();
      setSelectedTeamId(nextRoute.selectedTeamId);
      setShowTeamChooser(nextRoute.showTeamChooser);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const loadTeamHistory = useCallback(async (teamId: string) => {
    try {
      const response = await api<TeamHistoryResponse>(`/api/teams/${teamId}/history?limit=20`);
      startTransition(() => {
        setTeamState((current) => {
          if (!current || current.team.id !== teamId || sameHistoryEntryArray(current.history, response.history.items)) {
            return current;
          }
          return {
            ...current,
            history: response.history.items
          };
        });
        setHistoryNextCursor((current) =>
          current && response.history.nextCursor && current.completedAt === response.history.nextCursor.completedAt && current.id === response.history.nextCursor.id
            ? current
            : response.history.nextCursor
        );
      });
    } catch {
      // Preserve the already loaded board state; history will retry on the next full refresh or team update.
    }
  }, []);

  const loadMoreTeamHistory = useCallback(async () => {
    if (!selectedTeamId || !historyNextCursor || historyLoadingMore) {
      return;
    }

    try {
      setHistoryLoadingMore(true);
      const query = new URLSearchParams({
        limit: "20",
        cursorCompletedAt: historyNextCursor.completedAt,
        cursorId: historyNextCursor.id
      });
      const response = await api<TeamHistoryResponse>(`/api/teams/${selectedTeamId}/history?${query.toString()}`);
      startTransition(() => {
        setTeamState((current) => {
          if (!current || current.team.id !== selectedTeamId) {
            return current;
          }
          const existingIds = new Set(current.history.map((entry) => entry.id));
          const appendedEntries = response.history.items.filter((entry) => !existingIds.has(entry.id));
          if (appendedEntries.length === 0 && sameCursor(historyNextCursor, response.history.nextCursor)) {
            return current;
          }
          return {
            ...current,
            history: [...current.history, ...appendedEntries]
          };
        });
        setHistoryNextCursor(response.history.nextCursor);
      });
    } catch (requestError) {
      setErrorStatus((requestError as Error).message);
    } finally {
      setHistoryLoadingMore(false);
    }
  }, [historyLoadingMore, historyNextCursor, selectedTeamId, setErrorStatus]);

  const runHistorySearch = useCallback(async (filters: TeamHistorySearchFilters) => {
    if (!selectedTeamId) {
      return;
    }

    try {
      setHistorySearchLoading(true);
      const query = new URLSearchParams({ limit: "20" });
      if (filters.dateFrom) {
        query.set("dateFrom", filters.dateFrom);
      }
      if (filters.dateTo) {
        query.set("dateTo", filters.dateTo);
      }
      if (filters.titleQuery) {
        query.set("titleQuery", filters.titleQuery);
      }
      if (filters.exactTitleMatch) {
        query.set("exactTitleMatch", "1");
      }
      if (filters.commentQuery) {
        query.set("commentQuery", filters.commentQuery);
      }
      if (filters.personQuery) {
        query.set("personQuery", filters.personQuery);
      }
      const response = await api<TeamHistorySearchResponse>(`/api/teams/${selectedTeamId}/history/search?${query.toString()}`);
      startTransition(() => {
        setHistorySearchFilters(response.filters);
        setHistorySearchItems(response.items);
        setHistorySearchNextCursor(response.nextCursor);
        setHistorySearchRequested(true);
      });
    } catch (requestError) {
      setErrorStatus((requestError as Error).message);
    } finally {
      setHistorySearchLoading(false);
    }
  }, [selectedTeamId, setErrorStatus]);

  const loadMoreHistorySearch = useCallback(async () => {
    if (!selectedTeamId || !historySearchNextCursor || historySearchLoading) {
      return;
    }

    try {
      setHistorySearchLoading(true);
      const query = new URLSearchParams({
        limit: "20",
        cursorCompletedAt: historySearchNextCursor.completedAt,
        cursorId: historySearchNextCursor.id
      });
      if (historySearchFilters.dateFrom) {
        query.set("dateFrom", historySearchFilters.dateFrom);
      }
      if (historySearchFilters.dateTo) {
        query.set("dateTo", historySearchFilters.dateTo);
      }
      if (historySearchFilters.titleQuery) {
        query.set("titleQuery", historySearchFilters.titleQuery);
      }
      if (historySearchFilters.exactTitleMatch) {
        query.set("exactTitleMatch", "1");
      }
      if (historySearchFilters.commentQuery) {
        query.set("commentQuery", historySearchFilters.commentQuery);
      }
      if (historySearchFilters.personQuery) {
        query.set("personQuery", historySearchFilters.personQuery);
      }
      const response = await api<TeamHistorySearchResponse>(`/api/teams/${selectedTeamId}/history/search?${query.toString()}`);
      startTransition(() => {
        setHistorySearchItems((current) => {
          const existingIds = new Set(current.map((entry) => entry.id));
          return [...current, ...response.items.filter((entry) => !existingIds.has(entry.id))];
        });
        setHistorySearchNextCursor(response.nextCursor);
      });
    } catch (requestError) {
      setErrorStatus((requestError as Error).message);
    } finally {
      setHistorySearchLoading(false);
    }
  }, [historySearchFilters.commentQuery, historySearchFilters.dateFrom, historySearchFilters.dateTo, historySearchFilters.exactTitleMatch, historySearchFilters.personQuery, historySearchFilters.titleQuery, historySearchLoading, historySearchNextCursor, selectedTeamId, setErrorStatus]);

  const loadTeamState = useCallback(async (teamId: string, options?: { preserveStateOnError?: boolean; reason?: string }) => {
    const requestId = latestLoadRef.current + 1;
    latestLoadRef.current = requestId;
    debugReveal("loadTeamState:start", {
      teamId,
      requestId,
      preserveStateOnError: options?.preserveStateOnError ?? false,
      reason: options?.reason ?? "default"
    });
    try {
      const query = new URLSearchParams({ history: "0" });
      if (options?.reason) {
        query.set("reason", options.reason);
      }
      const response = await api<TeamStateResponse>(`/api/teams/${teamId}/state?${query.toString()}`);
      debugReveal("loadTeamState:response", {
        teamId,
        requestId,
        round: response.activeRound
          ? {
              id: response.activeRound.id,
              status: response.activeRound.status,
              votes: response.activeRound.votes.length,
              revealAverage: response.activeRound.revealAverage
            }
          : null,
        history: response.history.length
      });
      if (latestLoadRef.current !== requestId) {
        debugReveal("loadTeamState:ignored newer request exists", { teamId, requestId, latest: latestLoadRef.current });
        return;
      }
      const roundStateLock = roundStateLockRef.current;
      if (
        roundStateLock &&
        roundStateLock.teamId === teamId &&
        response.activeRound?.id === roundStateLock.roundId &&
        response.activeRound.status === "active"
      ) {
        debugReveal("loadTeamState:rejected by round-state lock", {
          teamId,
          requestId,
          roundId: response.activeRound.id,
          lockReason: roundStateLock.reason
        });
        return;
      }

      if (
        roundStateLock &&
        roundStateLock.teamId === teamId &&
        response.activeRound?.id === roundStateLock.roundId &&
        response.activeRound.status === "revealed"
      ) {
        debugReveal("loadTeamState:clearing round-state lock", {
          teamId,
          requestId,
          roundId: response.activeRound.id
        });
        roundStateLockRef.current = null;
      }

      const pendingPresence = pendingPresenceRef.current;
      const nextResponse =
        pendingPresence && pendingPresence.teamId === teamId
          ? {
              ...response,
              activeParticipants: pendingPresence.activeParticipants
            }
          : response;

      if (pendingPresence?.teamId === teamId) {
        pendingPresenceRef.current = null;
      }

      const currentTeamState = teamStateRef.current;
      const nextResponseWithPreservedHistory =
        currentTeamState?.team.id === teamId && nextResponse.history.length === 0 && currentTeamState.history.length > 0
          ? {
              ...nextResponse,
              history: currentTeamState.history
            }
          : nextResponse;
      const normalizedResponse = ensureCurrentMemberVisibleInActiveParticipants(nextResponseWithPreservedHistory);

      if (!shouldApplyTeamState(currentTeamState, normalizedResponse)) {
        return;
      }

      startTransition(() => {
        setSession((current) => {
          if (!current) {
            return current;
          }
          const nextSession = {
            ...current,
            user: normalizedResponse.currentUser,
            memberships: normalizedResponse.memberships,
            availableTeams: normalizedResponse.availableTeams
          };
          return sameSessionResponse(current, nextSession) ? current : nextSession;
        });
        setTeamState((current) => (sameTeamStateResponse(current, normalizedResponse) ? current : normalizedResponse));
      });
    } catch (requestError) {
      const message = (requestError as Error).message;
      debugReveal("loadTeamState:error", {
        teamId,
        requestId,
        error: message
      });
      if (latestLoadRef.current !== requestId) {
        return;
      }
      if (message === "Team not found") {
        localStorage.removeItem(SELECTED_TEAM_KEY);
        if (pendingTargetTeamId === teamId) {
          setPendingTargetTeamId(null);
        }
        const fallbackTeamId = membershipsRef.current.find((membership) => membership.id !== teamId)?.id ?? null;
        setSelectedTeamId(fallbackTeamId);
        setTeamState(null);
        setShowTeamChooser(true);
        setErrorStatus("The previously opened team is no longer available. Please choose a team again.");
        return;
      }
      if (message === "Forbidden" && pendingTargetTeamId === teamId) {
        setTeamState(null);
        setShowTeamChooser(true);
        setStatus({
          tone: "neutral",
          text: "This shared team link is preserved. Request access or wait for approval and the app will open the board directly."
        });
        return;
      }
      if (message === "Forbidden" && selectedTeamId === teamId) {
        setTeamState(null);
        setShowTeamChooser(true);
        void loadSession().catch(() => undefined);
        setErrorStatus("The previously opened team is no longer available. Please choose a team again.");
        return;
      }
      if (!options?.preserveStateOnError) {
        setTeamState(null);
        setShowTeamChooser(true);
      }
      setErrorStatus(message);
    }
  }, [loadSession, pendingTargetTeamId, selectedTeamId, setErrorStatus]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await api<BootstrapResponse>("/api/bootstrap");
        revealDebugEnabled = response.debugToolsEnabled;
        setDebugCodesEnabled(Boolean(response.debugCodesEnabled));
        setDebugToolsEnabled(response.debugToolsEnabled);
        setSmtpConfigured(Boolean(response.smtpConfigured));
        setPublicTrial(
          response.publicTrial ?? {
            enabled: false,
            mode: "disabled",
            maxTeamsPerWorkspace: 2,
            maxUsersPerWorkspace: 10,
            maxRevealedRoundsPerWorkspacePerMonth: 40,
            maxSignupRequestsPerIpPerHour: 3,
            maxCodeRequestsPerEmailPerDay: 5,
            maxInvitesPerWorkspacePerDay: 10,
            maxWorkspaceCreationsPerIpPerDay: 2,
            maxLoginAttemptsPerEmailPerHour: 10
          }
        );
        setBranding(mergeBrandingManifest(response.branding));
      } catch {
        revealDebugEnabled = false;
        setDebugToolsEnabled(false);
        setSmtpConfigured(false);
        setPublicTrial({
          enabled: false,
          mode: "disabled",
          maxTeamsPerWorkspace: 2,
          maxUsersPerWorkspace: 10,
          maxRevealedRoundsPerWorkspacePerMonth: 40,
          maxSignupRequestsPerIpPerHour: 3,
          maxCodeRequestsPerEmailPerDay: 5,
          maxInvitesPerWorkspacePerDay: 10,
          maxWorkspaceCreationsPerIpPerDay: 2,
          maxLoginAttemptsPerEmailPerHour: 10
        });
        setBranding(mergeBrandingManifest(BRANDING_MANIFEST));
      }
    })();
  }, []);

  useEffect(() => {
    void loadSession();
  }, []);

  useEffect(() => {
    if (!session?.user.id) {
      setNotificationFeed(null);
      return;
    }

    const refreshNotifications = () => {
      void loadNotifications(false, "summary");
    };

    refreshNotifications();
    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== "hidden") {
        refreshNotifications();
      }
    }, 12000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshNotifications();
      }
    };

    window.addEventListener("focus", refreshNotifications);
    window.addEventListener("pageshow", refreshNotifications);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshNotifications);
      window.removeEventListener("pageshow", refreshNotifications);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loadNotifications, session?.user.id]);

  useEffect(() => {
    if (!adminSettingsOpen || !session?.user.isSuperAdmin) {
      return;
    }
    setAdminPeopleRefreshTick((current) => current + 1);
  }, [adminSettingsOpen, notificationFeed?.platformAccessRequests, session?.user.isSuperAdmin]);

  useEffect(() => {
    if (!session?.user.id || !pendingTargetTeamId) {
      return;
    }

    const targetMembership = session.memberships.find((membership) => membership.id === pendingTargetTeamId);
    if (targetMembership) {
      setSelectedTeamId(targetMembership.id);
      setShowTeamChooser(false);
      setPendingTargetTeamId(null);
      setSuccessStatus(`Access is ready. Opening "${targetMembership.name}" directly.`);
      return;
    }

    const targetStillVisible = session.availableTeams.some((team) => team.id === pendingTargetTeamId);
    if (!targetStillVisible) {
      setPendingTargetTeamId(null);
    }
  }, [pendingTargetTeamId, session?.availableTeams, session?.memberships, session?.user.id, setSuccessStatus]);

  useEffect(() => {
    writeRouteState({ selectedTeamId, showTeamChooser }, "replace");
  }, [selectedTeamId, showTeamChooser]);

  useEffect(() => {
    if (!session?.user.id || !selectedTeamId) {
      return;
    }
    localStorage.setItem(SELECTED_TEAM_KEY, selectedTeamId);
    roundStateLockRef.current = null;
    void loadTeamState(selectedTeamId);
  }, [loadTeamState, selectedTeamId, session?.user.id]);

  useEffect(() => {
    if (!selectedTeamId || showTeamChooser || !teamState || teamState.team.id !== selectedTeamId || teamState.history.length > 0) {
      return;
    }

    let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;
    let idleCallbackId: number | null = null;

    const scheduleLoad = () => {
      void loadTeamHistory(selectedTeamId);
    };

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      idleCallbackId = window.requestIdleCallback(() => scheduleLoad(), { timeout: 1200 });
    } else {
      timeoutId = globalThis.setTimeout(scheduleLoad, 180);
    }

    return () => {
      if (idleCallbackId != null && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleCallbackId);
      }
      if (timeoutId != null) {
        globalThis.clearTimeout(timeoutId);
      }
    };
  }, [loadTeamHistory, selectedTeamId, showTeamChooser, teamState]);

  useEffect(() => {
    const boardMode = Boolean(session && selectedTeamId && teamState && !showTeamChooser);
    document.body.classList.toggle("app-board-mode", boardMode);
    return () => {
      document.body.classList.remove("app-board-mode");
    };
  }, [selectedTeamId, session, showTeamChooser, teamState]);

  useEffect(() => {
    if (!chooserVisible) {
      return;
    }

    void loadSession();
    const intervalId = window.setInterval(() => {
      void loadSession();
    }, CHOOSER_REFRESH_INTERVAL_MS);

    const refreshSession = () => {
      void loadSession();
    };

    window.addEventListener("focus", refreshSession);
    window.addEventListener("pageshow", refreshSession);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshSession);
      window.removeEventListener("pageshow", refreshSession);
    };
  }, [chooserVisible, loadSession]);

  useEffect(() => {
    if (!teamState) {
      return;
    }

    startTransition(() => {
      setMemberDirectory((current) => {
        if (!current || current.team.id !== teamState.team.id) {
          return current;
        }

        const sameMembers =
          current.members.length === teamState.teamMembers.length &&
          current.members.every((member, index) => {
            const next = teamState.teamMembers[index];
            return (
              next &&
              member.id === next.id &&
              member.displayName === next.displayName &&
              member.avatarIconKey === next.avatarIconKey &&
              member.avatarColorKey === next.avatarColorKey
            );
          });

        if (
          sameMembers &&
          current.team.id === teamState.team.id &&
          current.team.name === teamState.team.name &&
          current.team.deckKey === teamState.team.deckKey &&
          current.currentUserId === teamState.currentUser.id &&
          current.currentUserRole === teamState.currentUserRole &&
          current.currentUserIsSuperAdmin === teamState.currentUser.isSuperAdmin &&
          current.pendingIssues.length === teamState.pendingIssues.length &&
          current.pendingIssues.every((issue, index) => {
            const next = teamState.pendingIssues[index];
            return (
              next &&
              issue.id === next.id &&
              issue.issueKey === next.issueKey &&
              issue.title === next.title &&
              issue.displayTitle === next.displayTitle
            );
          }) &&
          current.activeParticipantIds.length === teamState.activeParticipants.length &&
          current.activeParticipantIds.every((id, index) => id === teamState.activeParticipants[index]?.id)
        ) {
          return current;
        }

        return {
          team: teamState.team,
          members: teamState.teamMembers,
          activeParticipantIds: teamState.activeParticipants.map((member) => member.id),
          currentUserId: teamState.currentUser.id,
          currentUserRole: teamState.currentUserRole,
          currentUserIsSuperAdmin: teamState.currentUser.isSuperAdmin,
          pendingIssues: teamState.pendingIssues,
          pendingJoinRequests: current?.pendingJoinRequests ?? []
        };
      });
    });
  }, [teamState]);

  useEffect(() => {
    if (!chooserVisible) {
      return;
    }

    let ws: WebSocket | null = null;
    let reconnectTimeoutId: number | null = null;
    let closedByCleanup = false;

    const clearReconnectTimeout = () => {
      if (reconnectTimeoutId != null) {
        window.clearTimeout(reconnectTimeoutId);
        reconnectTimeoutId = null;
      }
    };

    const connect = () => {
      if (closedByCleanup) {
        return;
      }

      ws = new WebSocket(getChooserSocketUrl());
      ws.onmessage = (event) => {
        const message = JSON.parse(event.data) as { type: string; payload?: Partial<BrandingManifest> };
        if (message.type === "chooser:update") {
          void loadSession();
          return;
        }
        if (message.type === "platform:branding") {
          setBranding(mergeBrandingManifest(message.payload));
        }
      };
      ws.onclose = () => {
        if (closedByCleanup) {
          return;
        }
        void loadSession();
        clearReconnectTimeout();
        reconnectTimeoutId = window.setTimeout(connect, 500);
      };
    };

    connect();

    return () => {
      closedByCleanup = true;
      clearReconnectTimeout();
      ws?.close();
    };
  }, [chooserVisible, loadSession]);

  useEffect(() => {
    if (!selectedTeamId || !session?.user.id || showTeamChooser) {
      return;
    }

    const ws = new WebSocket(getSocketUrl(selectedTeamId));
    let closedByCleanup = false;
    let repairInFlight = false;
    let presenceRescueTimeoutId: number | null = null;
    let roomEntryResyncTimeoutId: number | null = null;
    const clearRoomEntryResyncTimeout = () => {
      if (roomEntryResyncTimeoutId != null) {
        window.clearTimeout(roomEntryResyncTimeoutId);
        roomEntryResyncTimeoutId = null;
      }
    };
    const requestTeamStateRepair = (reason: string) => {
      if (closedByCleanup || repairInFlight) {
        return;
      }
      repairInFlight = true;
      debugReveal("ws:repair-request", { teamId: selectedTeamId, reason });
      void loadTeamState(selectedTeamId, {
        preserveStateOnError: true,
        reason
      }).finally(() => {
        repairInFlight = false;
      });
    };
    debugReveal("ws:open:start", { teamId: selectedTeamId });
    ws.onopen = () => {
      debugReveal("ws:open:connected", { teamId: selectedTeamId });
      clearRoomEntryResyncTimeout();
      roomEntryResyncTimeoutId = window.setTimeout(() => {
        if (closedByCleanup) {
          return;
        }
        debugReveal("ws:room-entry-resync", { teamId: selectedTeamId });
        void loadTeamState(selectedTeamId, { preserveStateOnError: true }).catch(() => undefined);
      }, ROOM_ENTRY_RESYNC_DELAY_MS);
      presenceRescueTimeoutId = window.setTimeout(() => {
        if (closedByCleanup) {
          return;
        }
        const currentState = teamStateRef.current;
        if (!currentState || currentState.team.id !== selectedTeamId) {
          return;
        }
        if (currentState.activeParticipants.some((participant) => participant.id === session.user.id)) {
          return;
        }
        void loadTeamState(selectedTeamId, { preserveStateOnError: true }).catch(() => undefined);
      }, 1200);
    };
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data) as
        | { type: "team:update"; payload: TeamStateResponse }
        | { type: "team:round"; payload: TeamRoundUpdatePayload }
        | { type: "team:round-vote"; payload: TeamRoundVoteUpdatePayload }
        | { type: "team:presence"; payload: { teamId: string; activeParticipants: UserSummary[] } }
        | { type: "platform:branding"; payload: Partial<BrandingManifest> };
      if (message.type === "platform:branding") {
        setBranding(mergeBrandingManifest(message.payload));
        return;
      }
      if (message.type === "team:presence") {
        if (message.payload.teamId !== selectedTeamId) {
          return;
        }

        const currentState = teamStateRef.current;
        if (!currentState || currentState.team.id !== message.payload.teamId) {
          pendingPresenceRef.current = {
            teamId: message.payload.teamId,
            activeParticipants: message.payload.activeParticipants
          };
          return;
        }

        pendingPresenceRef.current = {
          teamId: message.payload.teamId,
          activeParticipants: message.payload.activeParticipants
        };

        startTransition(() => {
          setTeamState((current) => {
            if (!current || current.team.id !== message.payload.teamId) {
              return current;
            }

            const nextState = ensureCurrentMemberVisibleInActiveParticipants({
              ...current,
              activeParticipants: message.payload.activeParticipants
            });
            if (sameUserSummaryArray(current.activeParticipants, nextState.activeParticipants)) {
              return current;
            }
            return nextState;
          });
          setMemberDirectory((current) => {
            if (!current || current.team.id !== message.payload.teamId) {
              return current;
            }

            const nextActiveParticipantIds = message.payload.activeParticipants.map((member) => member.id);
            const normalizedActiveParticipantIds =
              current.currentUserRole !== "none" && !nextActiveParticipantIds.includes(current.currentUserId)
                ? [current.currentUserId, ...nextActiveParticipantIds]
                : nextActiveParticipantIds;
            if (
              current.activeParticipantIds.length === normalizedActiveParticipantIds.length &&
              current.activeParticipantIds.every((id, index) => id === normalizedActiveParticipantIds[index])
            ) {
              return current;
            }
            return {
              ...current,
              activeParticipantIds: normalizedActiveParticipantIds
            };
          });
        });
        return;
      }

      if (message.type === "team:round") {
        if (message.payload.teamId !== selectedTeamId) {
          return;
        }
        clearRoomEntryResyncTimeout();

        const roundStateLock = roundStateLockRef.current;
        if (
          roundStateLock &&
          roundStateLock.teamId === selectedTeamId &&
          message.payload.activeRound?.id === roundStateLock.roundId &&
          message.payload.activeRound.status === "active"
        ) {
          debugReveal("ws:round rejected by round-state lock", {
            teamId: selectedTeamId,
            roundId: message.payload.activeRound.id,
            lockReason: roundStateLock.reason
          });
          return;
        }

        if (
          roundStateLock &&
          roundStateLock.teamId === selectedTeamId &&
          message.payload.activeRound?.id === roundStateLock.roundId &&
          message.payload.activeRound.status === "revealed"
        ) {
          debugReveal("ws:round clearing round-state lock", {
            teamId: selectedTeamId,
            roundId: message.payload.activeRound.id
          });
          roundStateLockRef.current = null;
        }

        if (!shouldApplyTeamRoundUpdate(teamStateRef.current, message.payload)) {
          return;
        }

        startTransition(() => {
          setTeamState((current) => {
            if (!current || current.team.id !== message.payload.teamId) {
              return current;
            }

            return applyTeamRoundUpdateToState(current, message.payload);
          });
          setMemberDirectory((current) => {
            if (!current || current.team.id !== message.payload.teamId) {
              return current;
            }

            const nextPendingIssues = applyRoundUpdateToPendingIssues(current.pendingIssues, message.payload.activeRound);
            if (samePendingIssueArray(current.pendingIssues, nextPendingIssues)) {
              return current;
            }

            return {
              ...current,
              pendingIssues: nextPendingIssues
            };
          });
        });
        return;
      }

      if (message.type === "team:round-vote") {
        if (message.payload.teamId !== selectedTeamId) {
          return;
        }
        clearRoomEntryResyncTimeout();

        const currentState = teamStateRef.current;
        if (
          !currentState ||
          currentState.team.id !== message.payload.teamId ||
          !currentState.activeRound ||
          currentState.activeRound.status !== "active"
        ) {
          requestTeamStateRepair("delta-missing-current-state");
          return;
        }

        if (
          currentState.activeRound.id !== message.payload.roundId ||
          currentState.liveSync.roundId !== message.payload.liveSync.roundId ||
          currentState.liveSync.roundVersion !== message.payload.liveSync.roundVersion ||
          currentState.liveSync.voteVersion !== message.payload.fromVoteVersion
        ) {
          requestTeamStateRepair("delta-version-gap");
          return;
        }

        if (!shouldApplyTeamRoundVoteUpdate(currentState, message.payload)) {
          requestTeamStateRepair("delta-apply-rejected");
          return;
        }

        startTransition(() => {
          setTeamState((current) => {
            if (!current || current.team.id !== message.payload.teamId) {
              return current;
            }

            return applyTeamRoundVoteUpdateToState(current, message.payload);
          });
        });
        return;
      }

      if (message.type === "team:update") {
        clearRoomEntryResyncTimeout();
        const normalizedPayload = ensureCurrentMemberVisibleInActiveParticipants(message.payload);
        const roundStateLock = roundStateLockRef.current;
        if (
          roundStateLock &&
          roundStateLock.teamId === selectedTeamId &&
          normalizedPayload.activeRound?.id === roundStateLock.roundId &&
          normalizedPayload.activeRound.status === "active"
        ) {
          debugReveal("ws:rejected by round-state lock", {
            teamId: selectedTeamId,
            roundId: normalizedPayload.activeRound.id,
            lockReason: roundStateLock.reason
          });
          return;
        }

        if (
          roundStateLock &&
          roundStateLock.teamId === selectedTeamId &&
          normalizedPayload.activeRound?.id === roundStateLock.roundId &&
          normalizedPayload.activeRound.status === "revealed"
        ) {
          debugReveal("ws:clearing round-state lock", {
            teamId: selectedTeamId,
            roundId: normalizedPayload.activeRound.id
          });
          roundStateLockRef.current = null;
        }

        debugReveal("ws:message", {
          teamId: selectedTeamId,
          round: normalizedPayload.activeRound
            ? {
                id: normalizedPayload.activeRound.id,
                status: normalizedPayload.activeRound.status,
                votes: normalizedPayload.activeRound.votes.length,
                revealAverage: normalizedPayload.activeRound.revealAverage
              }
            : null,
          history: normalizedPayload.history.length
        });
        if (!shouldApplyTeamState(teamStateRef.current, normalizedPayload)) {
          return;
        }

        startTransition(() => {
          setTeamState((current) => (sameTeamStateResponse(current, normalizedPayload) ? current : normalizedPayload));
          setMemberDirectory((current) => {
            if (!current || current.team.id !== normalizedPayload.team.id) {
              return current;
            }

            const samePendingIssues =
              current.pendingIssues.length === normalizedPayload.pendingIssues.length &&
              current.pendingIssues.every((issue, index) => {
                const next = normalizedPayload.pendingIssues[index];
                return (
                  next &&
                  issue.id === next.id &&
                  issue.issueKey === next.issueKey &&
                  issue.title === next.title &&
                  issue.displayTitle === next.displayTitle
                );
              });

            if (
              samePendingIssues &&
              current.team.id === normalizedPayload.team.id &&
              current.team.name === normalizedPayload.team.name &&
              current.team.archived === normalizedPayload.team.archived &&
              current.team.jiraProjectKey === normalizedPayload.team.jiraProjectKey &&
              current.team.jiraJql === normalizedPayload.team.jiraJql
            ) {
              return current;
            }

            return {
              ...current,
              team: normalizedPayload.team,
              pendingIssues: normalizedPayload.pendingIssues
            };
          });
        });
      }
    };
    ws.onerror = () => {
      debugReveal("ws:error", { teamId: selectedTeamId });
    };
    ws.onclose = () => {
      debugReveal("ws:close", { teamId: selectedTeamId, closedByCleanup });
      clearRoomEntryResyncTimeout();
      if (!closedByCleanup) {
        void loadTeamState(selectedTeamId, { preserveStateOnError: true });
      }
    };
    return () => {
      closedByCleanup = true;
      clearRoomEntryResyncTimeout();
      if (presenceRescueTimeoutId != null) {
        window.clearTimeout(presenceRescueTimeoutId);
      }
      ws.close();
    };
  }, [loadTeamState, selectedTeamId, session?.user.id, showTeamChooser]);

  useEffect(() => {
    if (!selectedTeamId || !session?.user.id || showTeamChooser) {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== "hidden") {
        void loadTeamState(selectedTeamId, { preserveStateOnError: true });
      }
    }, TEAM_REFRESH_INTERVAL_MS);

    const refreshCurrentTeam = () => {
      void loadTeamState(selectedTeamId, { preserveStateOnError: true });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshCurrentTeam();
      }
    };

    window.addEventListener("focus", refreshCurrentTeam);
    window.addEventListener("pageshow", refreshCurrentTeam);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshCurrentTeam);
      window.removeEventListener("pageshow", refreshCurrentTeam);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loadTeamState, selectedTeamId, session?.user.id, showTeamChooser]);

  const handleRequestCode = useCallback(async () => {
    try {
      setError(null);
      setInfo(null);
      const response = await api<{
        ok: boolean;
        delivery: "smtp" | "fallback-log";
        debugCode?: string;
        suggestedDisplayName?: string;
        suggestedAvatarIconKey?: string;
        suggestedAvatarColorKey?: string;
      }>("/api/auth/request-code", {
        method: "POST",
        body: JSON.stringify({ email })
      });
      setAuthStep("code");
      setAuthFlow("standard");
      setTrialTermsAccepted(false);
      setTrialTermsVersion(null);
      setDebugCode(response.debugCode ?? null);
      setInfo(
        response.delivery === "fallback-log"
          ? "A one-time access code has been generated. In the current dev setup, you can use the code shown below."
          : "A one-time access code has been generated and sent through the configured delivery channel."
      );
      setDisplayName((current) => current || response.suggestedDisplayName || deriveDisplayNameFromEmail(email));
      setAvatarSelection((current) => {
        if (response.suggestedAvatarIconKey && response.suggestedAvatarColorKey) {
          return {
            avatarIconKey: response.suggestedAvatarIconKey,
            avatarColorKey: response.suggestedAvatarColorKey
          };
        }
        return current.avatarIconKey && current.avatarColorKey ? current : pickRandomAvatarSelection();
      });
    } catch (requestError) {
      setError((requestError as Error).message);
    }
  }, [avatarSelection, email]);

  const handleStartPublicTrial = useCallback(async () => {
    try {
      setError(null);
      setInfo(null);
      if (!email.trim()) {
        setError("Enter your email first.");
        return;
      }

      const response = await api<{
        ok: boolean;
        delivery: "smtp" | "fallback-log";
        debugCode?: string;
        termsVersion: string;
      }>("/api/auth/public-trial/request-code", {
        method: "POST",
        body: JSON.stringify({ email })
      });
      setAuthStep("code");
      setAuthFlow("publicTrial");
      setTrialTermsAccepted(false);
      setTrialTermsVersion(response.termsVersion);
      setDebugCode(response.debugCode ?? null);
      setDisplayName((current) => current || deriveDisplayNameFromEmail(email));
      setInfo(
        response.delivery === "fallback-log"
          ? "A public-trial code has been generated. In the current dev setup, you can use the code shown below."
          : "A public-trial code has been sent by email. Accept the terms, then finish setup to create your private trial workspace."
      );
    } catch (requestError) {
      setError((requestError as Error).message);
    }
  }, [email]);

  const handleRequestAccess = useCallback(async () => {
    try {
      setError(null);
      setInfo(null);
      if (!email.trim()) {
        setError("Enter your company email first.");
        return;
      }

      await api<{ ok: boolean }>("/api/auth/request-access", {
        method: "POST",
        body: JSON.stringify({ email })
      });
      setInfo("Access request sent. The super-admin can now admit your account, and a team admin can still add you directly to a team when needed.");
    } catch (requestError) {
      setError((requestError as Error).message);
    }
  }, [email]);

  const handleForgotPassword = useCallback(async () => {
    try {
      setError(null);
      setInfo(null);
      if (!email.trim()) {
        setError("Enter your company email first.");
        return;
      }

      const response = await api<{
        ok: boolean;
        delivery: "smtp" | "fallback-log" | "manual-admin";
        debugCode?: string;
      }>("/api/auth/request-password-reset", {
        method: "POST",
        body: JSON.stringify({ email })
      });

      if (response.delivery === "manual-admin") {
        setInfo("Password reset is handled manually in this deployment. Ask your team admin or the super-admin to generate a new password for you, and save it somewhere secure once they share it.");
        return;
      }

      setAuthStep("code");
      setAuthFlow("standard");
      setTrialTermsAccepted(false);
      setTrialTermsVersion(null);
      setDebugCode(response.debugCode ?? null);
      setDisplayName((current) => current || deriveDisplayNameFromEmail(email));
      setInfo(
        response.delivery === "fallback-log"
          ? "A password reset code has been generated. In the current dev setup, you can use the code shown below."
          : "If that account exists, a password reset code has been sent through the configured delivery channel."
      );
    } catch (requestError) {
      setError((requestError as Error).message);
    }
  }, [email]);

  const handlePasswordSignIn = useCallback(async () => {
    try {
      setError(null);
      setInfo(null);
      await api("/api/auth/signin-password", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      await loadSession();
      setPassword("");
      setConfirmPassword("");
      setInfo("Signed in with password.");
      setSuccessStatus("Signed in successfully. Returning you to your last team when available.");
    } catch (requestError) {
      setError((requestError as Error).message);
    }
  }, [email, loadSession, password, setSuccessStatus]);

  const handleAdminSignIn = useCallback(async () => {
    try {
      setError(null);
      setInfo(null);
      await api("/api/auth/signin-admin", {
        method: "POST",
        body: JSON.stringify({ username: adminUsername, password })
      });
      await loadSession();
      setConfirmPassword("");
      setInfo("Super-admin session opened.");
      setSuccessStatus("Signed in as super-admin.");
    } catch (requestError) {
      setError((requestError as Error).message);
    }
  }, [adminUsername, loadSession, password, setSuccessStatus]);

  const handleVerify = useCallback(async () => {
    try {
      setError(null);
      setInfo(null);
      if (authFlow === "publicTrial") {
        await api("/api/auth/public-trial/signup", {
          method: "POST",
          body: JSON.stringify({
            email,
            code,
            displayName,
            password,
            ...avatarSelection,
            acceptedTerms: trialTermsAccepted,
            acceptedTermsVersion: trialTermsVersion
          })
        });
      } else {
        await api("/api/auth/verify-code", {
          method: "POST",
          body: JSON.stringify({ email, code, displayName, password, ...avatarSelection })
        });
      }
      await loadSession();
      setPassword("");
      setConfirmPassword("");
      setTrialTermsAccepted(false);
      setTrialTermsVersion(null);
      setInfo(authFlow === "publicTrial" ? "Public trial workspace created. This browser will stay remembered automatically." : "Access finished. This browser will stay remembered automatically.");
      setSuccessStatus(authFlow === "publicTrial" ? "Public trial ready. Opening your starter team." : "Access finished successfully. Returning you to your last team when available.");
    } catch (requestError) {
      setError((requestError as Error).message);
    }
  }, [authFlow, avatarSelection, code, displayName, email, loadSession, password, setSuccessStatus, trialTermsAccepted, trialTermsVersion]);

  const handleCreateTeam = useCallback(async (name: string) => {
    if (!name.trim()) {
      return;
    }
    try {
      setBusyStatus("Creating the team and joining it...");
      setIsBusy(true);
      const response = await api<{ team: TeamStateResponse["team"] }>("/api/teams", {
        method: "POST",
        body: JSON.stringify({ name })
      });
      await loadSession();
      setPendingTargetTeamId(null);
      setSelectedTeamId(response.team.id);
      setShowTeamChooser(false);
      writeRouteState({ selectedTeamId: response.team.id, showTeamChooser: false });
      setSuccessStatus(`Created team "${response.team.name}" and joined it.`);
    } catch (requestError) {
      setErrorStatus((requestError as Error).message);
      throw requestError;
    } finally {
      setIsBusy(false);
    }
  }, [loadSession, setBusyStatus, setErrorStatus, setSuccessStatus]);

  const handleJoinTeam = useCallback(async (teamId: string) => {
    try {
      setBusyStatus("Requesting access to the selected team...");
      setIsBusy(true);
      await api(`/api/teams/${teamId}/join`, { method: "POST" });
      await loadSession();
      await loadNotifications(false, "full");
      setPendingTargetTeamId(teamId);
      setSelectedTeamId(teamId);
      setShowTeamChooser(true);
      setSuccessStatus("Access request sent to the team admins.");
    } catch (requestError) {
      setErrorStatus((requestError as Error).message);
    } finally {
      setIsBusy(false);
    }
  }, [loadNotifications, loadSession, setBusyStatus, setErrorStatus, setSuccessStatus]);

  const handleSignOut = useCallback(async () => {
    try {
      setBusyStatus("Signing out...");
      setIsBusy(true);
      await api("/api/auth/signout", { method: "POST" });
      storeSessionToken(null);
      localStorage.removeItem(SELECTED_TEAM_KEY);
      setSession(null);
      setTeamState(null);
      setNotificationFeed(null);
      setAccountSettingsOpen(false);
      setAdminSettingsOpen(false);
      setSelectedTeamId(null);
      setPendingTargetTeamId(null);
      setShowTeamChooser(false);
      setMemberDirectory(null);
      setAuthStep("signin");
      setAdminUsername("");
      setCode("");
      setPassword("");
      setConfirmPassword("");
      setDebugCode(null);
      setInfo("Signed out.");
      setSuccessStatus("Signed out successfully.");
      writeRouteState({ selectedTeamId: null, showTeamChooser: false }, "replace");
    } catch (requestError) {
      setErrorStatus((requestError as Error).message);
    } finally {
      setIsBusy(false);
    }
  }, [setBusyStatus, setErrorStatus, setSuccessStatus]);

  const handleShareTeamLink = useCallback(async () => {
    if (!selectedTeamId) {
      return;
    }

    const link = buildTeamPermalink(selectedTeamId);
    try {
      const copied = await copyTextToClipboard(link);
      if (copied) {
        setSuccessStatus("Team link copied. Opening it will return people to this board after sign-in and approval.");
      } else {
        setInfo(`Copy this team link: ${link}`);
        setSuccessStatus("Team link prepared. Copy it from the message above.");
      }
    } catch {
      setInfo(`Copy this team link: ${link}`);
      setSuccessStatus("Team link prepared. Copy it from the message above.");
    }
  }, [selectedTeamId, setSuccessStatus]);

  const handleCreateRound = useCallback(async (title: string) => {
    const trimmedTitle = title.trim();
    if (!selectedTeamId || trimmedTitle.length < 5) {
      if (trimmedTitle.length > 0 && trimmedTitle.length < 5) {
        setErrorStatus("Round title must be at least 5 characters.");
      }
      return;
    }
    try {
      setBusyStatus(`Starting round "${trimmedTitle}"...`);
      setIsBusy(true);
      const response = await api<{ round: RoundState }>(`/api/teams/${selectedTeamId}/rounds`, {
        method: "POST",
        body: JSON.stringify({ title: trimmedTitle })
      });
      startTransition(() => {
        setTeamState((current) => {
          if (!current) {
            return current;
          }
          return applyAuthoritativeRoundToTeamState(current, selectedTeamId, response.round);
        });
      });
      setSuccessStatus(`Round "${trimmedTitle}" is ready for voting.`);
    } catch (requestError) {
      setErrorStatus((requestError as Error).message);
    } finally {
      setIsBusy(false);
    }
  }, [selectedTeamId, setBusyStatus, setErrorStatus, setSuccessStatus]);

  const handleVote = useCallback(async (value: string) => {
    if (!selectedTeamId || !teamState?.activeRound) {
      return;
    }
    const roundId = teamState.activeRound.id;
    try {
      setBusyStatus(`Submitting vote ${value}...`);
      startTransition(() => {
        setTeamState((current) => {
          if (!current) {
            return current;
          }
          return applyOptimisticVoteToTeamState(current, selectedTeamId, roundId, current.currentUser, value);
        });
      });
      await api<{ ok: true }>(`/api/teams/${selectedTeamId}/rounds/${roundId}/vote`, {
        method: "POST",
        body: JSON.stringify({ value })
      });
      setSuccessStatus(`Vote submitted: ${value}.`);
    } catch (requestError) {
      await loadTeamState(selectedTeamId, { preserveStateOnError: true }).catch(() => undefined);
      setErrorStatus((requestError as Error).message);
    }
  }, [selectedTeamId, setBusyStatus, setErrorStatus, setSuccessStatus, teamState?.activeRound]);

  const handleReveal = useCallback(async () => {
    if (!selectedTeamId || !teamState?.activeRound) {
      return;
    }
    const roundId = teamState.activeRound.id;
    try {
      roundStateLockRef.current = {
        teamId: selectedTeamId,
        roundId,
        reason: "reveal"
      };
      debugReveal("handleReveal:start", {
        teamId: selectedTeamId,
        roundId,
        currentStatus: teamState.activeRound.status,
        votes: teamState.activeRound.votes.length
      });
      setBusyStatus("Revealing cards and saving the round...");
      setIsBusy(true);
      const response = await api<{ round: RoundState }>(`/api/teams/${selectedTeamId}/rounds/${roundId}/reveal`, {
        method: "POST"
      });
      debugReveal("handleReveal:response", {
        teamId: selectedTeamId,
        round: {
          id: response.round.id,
          status: response.round.status,
          votes: response.round.votes.length,
          revealAverage: response.round.revealAverage,
          revealedAt: response.round.revealedAt
        }
      });
      startTransition(() => {
        setTeamState((current) => {
          if (!current) {
            return current;
          }
          return applyAuthoritativeRoundToTeamState(current, selectedTeamId, response.round);
        });
      });
      debugReveal("handleReveal:done", { teamId: selectedTeamId });
      setSuccessStatus("Cards revealed and round saved to history.");
    } catch (requestError) {
      roundStateLockRef.current = null;
      debugReveal("handleReveal:error", {
        teamId: selectedTeamId,
        error: (requestError as Error).message
      });
      setErrorStatus((requestError as Error).message);
    } finally {
      setIsBusy(false);
    }
  }, [loadTeamState, selectedTeamId, setBusyStatus, setErrorStatus, setSuccessStatus, teamState?.activeRound]);

  const handleCancelActiveRound = useCallback(async () => {
    if (!selectedTeamId || !teamState?.activeRound) {
      return;
    }
    const roundId = teamState.activeRound.id;
    try {
      roundStateLockRef.current = null;
      setBusyStatus("Canceling the blocked round...");
      setIsBusy(true);
      await api<{ ok: true }>(`/api/teams/${selectedTeamId}/rounds/${roundId}/cancel`, {
        method: "POST"
      });
      await loadTeamState(selectedTeamId, { preserveStateOnError: true });
      setSuccessStatus("Round canceled without writing history.");
    } catch (requestError) {
      setErrorStatus((requestError as Error).message);
    } finally {
      setIsBusy(false);
    }
  }, [loadTeamState, selectedTeamId, setBusyStatus, setErrorStatus, setSuccessStatus, teamState?.activeRound]);

  const handleVoteAgainActiveRound = useCallback(async () => {
    if (!selectedTeamId || !teamState?.activeRound) {
      return;
    }
    const roundId = teamState.activeRound.id;
    try {
      roundStateLockRef.current = null;
      setBusyStatus("Starting a fresh vote for this issue...");
      setIsBusy(true);
      const response = await api<{ round: RoundState }>(`/api/teams/${selectedTeamId}/rounds/${roundId}/vote-again`, {
        method: "POST"
      });
      startTransition(() => {
        setTeamState((current) => {
          if (!current) {
            return current;
          }
          return applyAuthoritativeRoundToTeamState(current, selectedTeamId, response.round);
        });
      });
      setSuccessStatus("Fresh voting round started for this issue.");
    } catch (requestError) {
      setErrorStatus((requestError as Error).message);
    } finally {
      setIsBusy(false);
    }
  }, [selectedTeamId, setBusyStatus, setErrorStatus, setSuccessStatus, teamState?.activeRound]);

  const handleVoteAgain = useCallback(async (historyId: string) => {
    if (!selectedTeamId) {
      return;
    }
    try {
      roundStateLockRef.current = null;
      setBusyStatus("Reopening that issue for another vote...");
      setIsBusy(true);
      const response = await api<{ round: RoundState }>(`/api/teams/${selectedTeamId}/history/${historyId}/vote-again`, {
        method: "POST"
      });
      startTransition(() => {
        setTeamState((current) => {
          if (!current) {
            return current;
          }
          return applyAuthoritativeRoundToTeamState(current, selectedTeamId, response.round);
        });
      });
      setSuccessStatus("Voting reopened for the selected history item.");
    } catch (requestError) {
      setErrorStatus((requestError as Error).message);
    } finally {
      setIsBusy(false);
    }
  }, [selectedTeamId, setBusyStatus, setErrorStatus, setSuccessStatus]);

  const handleAddHistoryComment = useCallback(async (historyId: string, body: string) => {
    if (!selectedTeamId) {
      return;
    }
    try {
      setBusyStatus("Saving the shared history comment...");
      setIsBusy(true);
      const response = await api<HistoryCommentMutationResponse>(`/api/teams/${selectedTeamId}/history/${historyId}/comments`, {
        method: "POST",
        body: JSON.stringify({ body })
      });
      setTeamState((current) => {
        if (!current || current.team.id !== selectedTeamId) {
          return current;
        }
        return {
          ...current,
          history: replaceHistoryEntry(current.history, response.historyEntry)
        };
      });
      setSuccessStatus("History comment added.");
    } catch (requestError) {
      setErrorStatus((requestError as Error).message);
      throw requestError;
    } finally {
      setIsBusy(false);
    }
  }, [selectedTeamId, setBusyStatus, setErrorStatus, setSuccessStatus]);

  const handleEditHistoryComment = useCallback(async (historyId: string, commentId: string, body: string) => {
    if (!selectedTeamId) {
      return;
    }
    try {
      setBusyStatus("Updating the shared history comment...");
      setIsBusy(true);
      const response = await api<HistoryCommentMutationResponse>(`/api/teams/${selectedTeamId}/history/${historyId}/comments/${commentId}`, {
        method: "PATCH",
        body: JSON.stringify({ body })
      });
      setTeamState((current) => {
        if (!current || current.team.id !== selectedTeamId) {
          return current;
        }
        return {
          ...current,
          history: replaceHistoryEntry(current.history, response.historyEntry)
        };
      });
      setSuccessStatus("History comment updated.");
    } catch (requestError) {
      setErrorStatus((requestError as Error).message);
      throw requestError;
    } finally {
      setIsBusy(false);
    }
  }, [selectedTeamId, setBusyStatus, setErrorStatus, setSuccessStatus]);

  const handleDeleteHistoryComment = useCallback(async (historyId: string, commentId: string) => {
    if (!selectedTeamId) {
      return;
    }
    try {
      setBusyStatus("Removing the shared history comment...");
      setIsBusy(true);
      const response = await api<HistoryCommentMutationResponse>(`/api/teams/${selectedTeamId}/history/${historyId}/comments/${commentId}`, {
        method: "DELETE"
      });
      setTeamState((current) => {
        if (!current || current.team.id !== selectedTeamId) {
          return current;
        }
        return {
          ...current,
          history: replaceHistoryEntry(current.history, response.historyEntry)
        };
      });
      setSuccessStatus("History comment removed.");
    } catch (requestError) {
      setErrorStatus((requestError as Error).message);
      throw requestError;
    } finally {
      setIsBusy(false);
    }
  }, [selectedTeamId, setBusyStatus, setErrorStatus, setSuccessStatus]);

  const handleUpdateDeckSettings = useCallback(async (settings: {
    deckKey: DeckDefinition["key"];
    fibonacciRangeStart: FibonacciRangeStart | null;
    fibonacciRangeEnd: FibonacciRangeEnd | null;
  }) => {
    if (!selectedTeamId) {
      return;
    }
    try {
      setBusyStatus("Updating the team numbering system...");
      setIsBusy(true);
      await api(`/api/teams/${selectedTeamId}/settings`, {
        method: "PATCH",
        body: JSON.stringify(settings)
      });
      await loadTeamState(selectedTeamId);
      const selectedDeck = getDeckLabel(settings.deckKey, {
        fibonacciRangeStart: settings.fibonacciRangeStart,
        fibonacciRangeEnd: settings.fibonacciRangeEnd
      });
      setSuccessStatus(`Team numbering system updated to ${selectedDeck}.`);
    } catch (requestError) {
      setErrorStatus((requestError as Error).message);
    } finally {
      setIsBusy(false);
    }
  }, [loadTeamState, selectedTeamId, setBusyStatus, setErrorStatus, setSuccessStatus]);

  const handleUpdateTimer = useCallback(async (timerSeconds: TeamTimerSeconds | null) => {
    if (!selectedTeamId) {
      return;
    }
    try {
      setBusyStatus(timerSeconds == null ? "Disabling the team countdown timer..." : `Setting the team countdown timer to ${timerSeconds}s...`);
      setIsBusy(true);
      await api(`/api/teams/${selectedTeamId}/settings`, {
        method: "PATCH",
        body: JSON.stringify({ timerSeconds })
      });
      await loadTeamState(selectedTeamId, { preserveStateOnError: true });
      setSuccessStatus(timerSeconds == null ? "Team countdown timer disabled." : `Team countdown timer set to ${timerSeconds}s.`);
    } catch (requestError) {
      setErrorStatus((requestError as Error).message);
    } finally {
      setIsBusy(false);
    }
  }, [loadTeamState, selectedTeamId, setBusyStatus, setErrorStatus, setSuccessStatus]);

  const handleUpdateHistoryTimezoneSettings = useCallback(async (enabled: boolean, keys: HistoryTimeZoneKey[]) => {
    if (!selectedTeamId) {
      return;
    }
    try {
      setBusyStatus("Updating the history time popup...");
      setIsBusy(true);
      await api(`/api/teams/${selectedTeamId}/settings`, {
        method: "PATCH",
        body: JSON.stringify({
          historyTimezonePopupEnabled: enabled,
          historyTimezoneKeys: keys
        })
      });
      await loadTeamState(selectedTeamId, { preserveStateOnError: true });
      setSuccessStatus("Team default history time zones saved.");
    } catch (requestError) {
      setErrorStatus((requestError as Error).message);
    } finally {
      setIsBusy(false);
    }
  }, [loadTeamState, selectedTeamId, setBusyStatus, setErrorStatus, setSuccessStatus]);

  const handleUpdateQuorumSettings = useCallback(async (enabled: boolean, minimumVotePercent: number) => {
    if (!selectedTeamId) {
      return;
    }
    try {
      setBusyStatus(enabled ? "Saving the minimum participation rule..." : "Disabling the minimum participation rule...");
      setIsBusy(true);
      await api(`/api/teams/${selectedTeamId}/settings`, {
        method: "PATCH",
        body: JSON.stringify({
          minimumVotePercentEnabled: enabled,
          minimumVotePercent
        })
      });
      await loadTeamState(selectedTeamId, { preserveStateOnError: true });
      setSuccessStatus(
        enabled ? `Minimum participation rule saved at ${minimumVotePercent}%.` : "Minimum participation rule disabled."
      );
    } catch (requestError) {
      setErrorStatus((requestError as Error).message);
    } finally {
      setIsBusy(false);
    }
  }, [loadTeamState, selectedTeamId, setBusyStatus, setErrorStatus, setSuccessStatus]);

  const handleRenameTeam = useCallback(async (nextName: string) => {
    if (!selectedTeamId || nextName.trim().length < 2) {
      return;
    }
    try {
      setBusyStatus(`Renaming the team to "${nextName.trim()}"...`);
      setIsBusy(true);
      await api(`/api/teams/${selectedTeamId}/settings`, {
        method: "PATCH",
        body: JSON.stringify({ name: nextName.trim() })
      });
      await loadSession();
      await loadTeamState(selectedTeamId, { preserveStateOnError: true });
      setSuccessStatus(`Team renamed to "${nextName.trim()}".`);
    } catch (requestError) {
      setErrorStatus((requestError as Error).message);
    } finally {
      setIsBusy(false);
    }
  }, [loadSession, loadTeamState, selectedTeamId, session, setBusyStatus, setErrorStatus, setSuccessStatus]);

  const handleUpdateProfile = useCallback(async (nextDisplayName: string, nextAvatarIconKey: string, nextAvatarColorKey: string) => {
    try {
      setBusyStatus("Saving your team-visible profile...");
      setIsBusy(true);
      await api("/api/auth/profile", {
        method: "PATCH",
        body: JSON.stringify({
          displayName: nextDisplayName,
          avatarIconKey: nextAvatarIconKey,
          avatarColorKey: nextAvatarColorKey
        })
      });
      await loadSession();
      if (selectedTeamId) {
        await loadTeamState(selectedTeamId);
      }
      setSuccessStatus("Your name and avatar are updated for the team.");
    } catch (requestError) {
      setErrorStatus((requestError as Error).message);
    } finally {
      setIsBusy(false);
    }
  }, [loadSession, loadTeamState, selectedTeamId, setBusyStatus, setErrorStatus, setSuccessStatus]);

  const handleSaveBoardShortcutsPreference = useCallback(async (boardShortcutsEnabled: boolean) => {
    try {
      setBusyStatus("Saving your keyboard shortcut preference...");
      setIsBusy(true);
      await api("/api/auth/preferences", {
        method: "PATCH",
        body: JSON.stringify({ boardShortcutsEnabled })
      });
      await loadSession();
      if (selectedTeamId) {
        await loadTeamState(selectedTeamId, { preserveStateOnError: true });
      }
      setSuccessStatus(boardShortcutsEnabled ? "Board action shortcuts enabled for your account." : "Board action shortcuts disabled for your account.");
    } catch (requestError) {
      setErrorStatus((requestError as Error).message);
    } finally {
      setIsBusy(false);
    }
  }, [loadSession, loadTeamState, selectedTeamId, setBusyStatus, setErrorStatus, setSuccessStatus]);

  const handleSaveHistoryTimezonePreference = useCallback(async (historyTimezonePopupEnabled: boolean, historyTimezoneKeys?: readonly HistoryTimeZoneKey[] | null) => {
    try {
      if (!selectedTeamId) {
        setErrorStatus("Open a team before changing personal history time settings.");
        return;
      }
      setBusyStatus("Saving your history time settings...");
      setIsBusy(true);
      await api("/api/auth/preferences", {
        method: "PATCH",
        body: JSON.stringify({
          teamId: selectedTeamId,
          historyTimezonePopupEnabled,
          ...(historyTimezoneKeys !== undefined ? { historyTimezoneKeys } : {})
        })
      });
      const savedHistoryTimezoneKeys =
        historyTimezoneKeys === undefined ? undefined : historyTimezoneKeys === null ? null : [...historyTimezoneKeys];
      const nextOverrideKeys =
        savedHistoryTimezoneKeys === undefined
          ? teamStateRef.current?.team.id === selectedTeamId
            ? teamStateRef.current.currentUser.historyTimezoneKeys ?? null
            : session
              ? getSelectedTeamMembership(session, selectedTeamId)?.currentUserHistoryTimezoneKeys ?? null
              : null
          : savedHistoryTimezoneKeys;
      setHistoryTimezonePreferenceOverrides((current) => ({
        ...current,
        [selectedTeamId]: {
          historyTimezonePopupEnabled,
          historyTimezoneKeys: nextOverrideKeys
        }
      }));
      setTeamState((current) => {
        if (!current || current.team.id !== selectedTeamId) {
          return current;
        }
        const nextHistoryTimezoneKeys = savedHistoryTimezoneKeys === undefined ? current.currentUser.historyTimezoneKeys ?? null : savedHistoryTimezoneKeys;
        return {
          ...current,
          currentUser: {
            ...current.currentUser,
            historyTimezonePopupEnabled,
            historyTimezoneKeys: nextHistoryTimezoneKeys
          },
          memberships: current.memberships.map((membership) =>
            membership.id === selectedTeamId
              ? {
                  ...membership,
                  currentUserHistoryTimezonePopupEnabled: historyTimezonePopupEnabled,
                  currentUserHistoryTimezoneKeys: nextHistoryTimezoneKeys
                }
              : membership
          ),
          availableTeams: current.availableTeams.map((membership) =>
            membership.id === selectedTeamId
              ? {
                  ...membership,
                  currentUserHistoryTimezonePopupEnabled: historyTimezonePopupEnabled,
                  currentUserHistoryTimezoneKeys: nextHistoryTimezoneKeys
                }
              : membership
          )
        };
      });
      setSession((current) => {
        if (!current) {
          return current;
        }
        const nextHistoryTimezoneKeys =
          savedHistoryTimezoneKeys === undefined ? getSelectedTeamMembership(current, selectedTeamId)?.currentUserHistoryTimezoneKeys ?? null : savedHistoryTimezoneKeys;
        return {
          ...current,
          user: {
            ...current.user,
            historyTimezonePopupEnabled,
            historyTimezoneKeys: nextHistoryTimezoneKeys
          },
          memberships: current.memberships.map((membership) =>
            membership.id === selectedTeamId
              ? {
                  ...membership,
                  currentUserHistoryTimezonePopupEnabled: historyTimezonePopupEnabled,
                  currentUserHistoryTimezoneKeys: nextHistoryTimezoneKeys
                }
              : membership
          ),
          availableTeams: current.availableTeams.map((membership) =>
            membership.id === selectedTeamId
              ? {
                  ...membership,
                  currentUserHistoryTimezonePopupEnabled: historyTimezonePopupEnabled,
                  currentUserHistoryTimezoneKeys: nextHistoryTimezoneKeys
                }
              : membership
          )
        };
      });
      await loadSession();
      if (selectedTeamId) {
        await loadTeamState(selectedTeamId, { preserveStateOnError: true });
      }
      if (historyTimezoneKeys === null) {
        setSuccessStatus("History time zones now use the team default.");
      } else if (historyTimezoneKeys !== undefined) {
        setSuccessStatus("Personal history time zones saved for this team.");
      } else {
        setSuccessStatus(historyTimezonePopupEnabled ? "History time popup enabled for this team." : "History time popup disabled for this team.");
      }
    } catch (requestError) {
      setErrorStatus((requestError as Error).message);
    } finally {
      setIsBusy(false);
    }
  }, [loadSession, loadTeamState, selectedTeamId, setBusyStatus, setErrorStatus, setSuccessStatus]);

  const handleChangePassword = useCallback(async (currentPassword: string, newPassword: string, confirmNextPassword: string) => {
    try {
      setBusyStatus("Changing your password...");
      setIsBusy(true);
      await api("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword: confirmNextPassword
        })
      });
      setSuccessStatus("Password changed successfully.");
    } catch (requestError) {
      setErrorStatus((requestError as Error).message);
      throw requestError;
    } finally {
      setIsBusy(false);
    }
  }, [setBusyStatus, setErrorStatus, setSuccessStatus]);

  const loadMemberDirectory = useCallback(async (teamId: string) => {
    const response = await api<TeamDirectoryResponse>(`/api/teams/${teamId}/directory`);
    setMemberDirectory(response);
    return response;
  }, []);

  const searchMemberCandidates = useCallback(async (teamId: string, query: string) => {
    const params = new URLSearchParams({ q: query });
    return api<TeamMemberCandidateResponse>(`/api/teams/${teamId}/member-candidates?${params.toString()}`);
  }, []);

  const handleSaveTeamJiraSettings = useCallback(async (teamId: string, projectKey: string, jql: string) => {
    try {
      setBusyStatus("Saving Jira Cloud team settings...");
      setIsBusy(true);
      await api(`/api/teams/${teamId}/settings`, {
        method: "PATCH",
        body: JSON.stringify({
          jiraProjectKey: projectKey,
          jiraJql: jql.trim() || null
        })
      });
      await loadSession();
      await loadMemberDirectory(teamId);
      if (selectedTeamId === teamId) {
        await loadTeamState(teamId, { preserveStateOnError: true });
      }
      setSuccessStatus("Jira Cloud team settings saved.");
    } catch (requestError) {
      setErrorStatus((requestError as Error).message);
      throw requestError;
    } finally {
      setIsBusy(false);
    }
  }, [loadMemberDirectory, loadSession, loadTeamState, selectedTeamId, setBusyStatus, setErrorStatus, setSuccessStatus]);

  const handleImportJiraIssues = useCallback(async (teamId: string) => {
    try {
      setBusyStatus("Importing Jira Cloud issues into the team queue...");
      setIsBusy(true);
      const response = await api<JiraIssueImportResponse>(`/api/teams/${teamId}/jira/import`, {
        method: "POST"
      });
      await loadMemberDirectory(teamId);
      if (selectedTeamId === teamId) {
        await loadTeamState(teamId, { preserveStateOnError: true });
      }
      setSuccessStatus(`Imported or refreshed ${response.importedCount} Jira issue${response.importedCount === 1 ? "" : "s"} for this team.`);
    } catch (requestError) {
      setErrorStatus((requestError as Error).message);
      throw requestError;
    } finally {
      setIsBusy(false);
    }
  }, [loadMemberDirectory, loadTeamState, selectedTeamId, setBusyStatus, setErrorStatus, setSuccessStatus]);

  const handleLoadPendingIssue = useCallback(async (teamId: string, issueId: string) => {
    try {
      const activeRound = teamStateRef.current?.team.id === teamId ? teamStateRef.current.activeRound : null;
      if (activeRound?.status === "active") {
        const confirmed = window.confirm(
          "Load another pending Jira issue for voting? The current active round will be replaced, and its Jira issue will remain pending until a round is fully revealed."
        );
        if (!confirmed) {
          return;
        }
      }

      setBusyStatus("Loading the selected Jira issue for voting...");
      setIsBusy(true);
      await api(`/api/teams/${teamId}/pending-issues/${issueId}/load`, {
        method: "POST"
      });
      await loadTeamState(teamId);
      setSuccessStatus("Jira issue loaded for voting.");
    } catch (requestError) {
      setErrorStatus((requestError as Error).message);
      throw requestError;
    } finally {
      setIsBusy(false);
    }
  }, [loadTeamState, setBusyStatus, setErrorStatus, setSuccessStatus]);

  const handleOpenMemberDirectory = useCallback(async (teamId: string) => {
    try {
      await loadMemberDirectory(teamId);
    } catch (requestError) {
      setErrorStatus((requestError as Error).message);
    }
  }, [loadMemberDirectory, setErrorStatus]);

  const importTeamHistoryToExistingTeam = useCallback(async (teamId: string, file: File) => {
    try {
      setBusyStatus("Importing team history into the selected team...");
      setIsBusy(true);
      const packageText = await readFileAsText(file);
      const packagePayload = JSON.parse(packageText) as TeamHistoryExportPackage;
      const response = await api<TeamHistoryImportResponse>(`/api/teams/${teamId}/import`, {
        method: "POST",
        body: JSON.stringify({ package: packagePayload })
      });
      await loadSession();
      await loadMemberDirectory(teamId);
      if (selectedTeamId === teamId) {
        await loadTeamHistory(teamId);
        await loadTeamState(teamId, { preserveStateOnError: true });
      }
      setSuccessStatus(`Imported ${response.importedCount} history entries and skipped ${response.skippedCount} duplicates.`);
      return response;
    } catch (requestError) {
      setErrorStatus((requestError as Error).message);
      throw requestError;
    } finally {
      setIsBusy(false);
    }
  }, [loadMemberDirectory, loadSession, loadTeamHistory, loadTeamState, selectedTeamId, setBusyStatus, setErrorStatus, setSuccessStatus]);

  const importTeamHistoryAsNewTeam = useCallback(async (file: File, teamName: string) => {
    try {
      setBusyStatus("Importing a new team from the selected history package...");
      setIsBusy(true);
      const packageText = await readFileAsText(file);
      const packagePayload = JSON.parse(packageText) as TeamHistoryExportPackage;
      const response = await api<TeamHistoryImportResponse>("/api/teams/import", {
        method: "POST",
        body: JSON.stringify({
          package: packagePayload,
          teamName
        })
      });
      await loadSession();
      setSelectedTeamId(response.team.id);
      setShowTeamChooser(false);
      writeRouteState({ selectedTeamId: response.team.id, showTeamChooser: false });
      setSuccessStatus(`Imported ${response.importedCount} history entries into "${response.team.name}".`);
      return response;
    } catch (requestError) {
      setErrorStatus((requestError as Error).message);
      throw requestError;
    } finally {
      setIsBusy(false);
    }
  }, [loadSession, setBusyStatus, setErrorStatus, setSuccessStatus]);

  const handleOpenNotifications = useCallback(async () => {
    await loadNotifications(true, "full");
  }, [loadNotifications]);

  const handleAdmitPlatformAccessRequest = useCallback(async (request: PlatformAccessRequestSummary) => {
    try {
      setBusyStatus(`Admitting ${request.email} to the platform...`);
      setIsBusy(true);
      const response = await admitAccessRequest(request.id);
      await loadNotifications(false, "full");
      await loadSession().catch(() => undefined);
      setAdminPeopleRefreshTick((current) => current + 1);
      setSuccessStatus(
        response.invitationDelivery === "smtp"
          ? "Access request admitted. The generated password was also sent through SMTP."
          : "Access request admitted. Share the generated password manually."
      );
      return response;
    } catch (requestError) {
      setErrorStatus((requestError as Error).message);
      throw requestError;
    } finally {
      setIsBusy(false);
    }
  }, [admitAccessRequest, loadNotifications, loadSession, setBusyStatus, setErrorStatus, setSuccessStatus]);

  const handleDenyPlatformAccessRequest = useCallback(async (requestId: string) => {
    try {
      setBusyStatus("Denying the pending platform access request...");
      setIsBusy(true);
      await denyAccessRequest(requestId);
      await loadNotifications(false, "full");
      setAdminPeopleRefreshTick((current) => current + 1);
      setSuccessStatus("Platform access request denied.");
    } catch (requestError) {
      setErrorStatus((requestError as Error).message);
      throw requestError;
    } finally {
      setIsBusy(false);
    }
  }, [denyAccessRequest, loadNotifications, setBusyStatus, setErrorStatus, setSuccessStatus]);

  const handleAdmitJoinRequest = useCallback(async (teamId: string, requestId: string) => {
    try {
      setBusyStatus("Admitting the pending join request...");
      setIsBusy(true);
      await api(`/api/teams/${teamId}/join-requests/${requestId}/admit`, { method: "POST" });
      await loadSession();
      await loadNotifications(false, "full");
      if (memberDirectory?.team.id === teamId) {
        await loadMemberDirectory(teamId);
      }
      if (selectedTeamId === teamId) {
        await loadTeamState(teamId, { preserveStateOnError: true });
      }
      setSuccessStatus("Join request admitted.");
    } catch (requestError) {
      setErrorStatus((requestError as Error).message);
    } finally {
      setIsBusy(false);
    }
  }, [loadMemberDirectory, loadNotifications, loadSession, loadTeamState, memberDirectory?.team.id, selectedTeamId, setBusyStatus, setErrorStatus, setSuccessStatus]);

  const handleDenyJoinRequest = useCallback(async (teamId: string, requestId: string) => {
    try {
      setBusyStatus("Denying the pending join request...");
      setIsBusy(true);
      await api(`/api/teams/${teamId}/join-requests/${requestId}/deny`, { method: "POST" });
      await loadNotifications(false, "full");
      if (memberDirectory?.team.id === teamId) {
        await loadMemberDirectory(teamId);
      }
      setSuccessStatus("Join request denied.");
    } catch (requestError) {
      setErrorStatus((requestError as Error).message);
    } finally {
      setIsBusy(false);
    }
  }, [loadMemberDirectory, loadNotifications, memberDirectory?.team.id, setBusyStatus, setErrorStatus, setSuccessStatus]);

  const handleAddMemberToTeam = useCallback(async (teamId: string, inviteEmail: string) => {
    try {
      setBusyStatus(`Adding ${inviteEmail.trim()} to the team...`);
      setIsBusy(true);
      const response = await api<TeamMemberInviteResponse>(`/api/teams/${teamId}/members`, {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail.trim() })
      });
      await loadSession();
      await loadNotifications(false, "full");
      await loadMemberDirectory(teamId);
      if (selectedTeamId === teamId) {
        await loadTeamState(teamId, { preserveStateOnError: true });
      }
      setAdminPeopleRefreshTick((current) => current + 1);
      setSuccessStatus(
        response.invitedNewUser
          ? response.invitationDelivery === "smtp"
            ? "Team membership updated. Share the generated password manually and the same password was also sent through SMTP."
            : "Team membership updated. Share the generated password manually."
          : "Team membership updated."
      );
      return response;
    } catch (requestError) {
      setErrorStatus((requestError as Error).message);
      throw requestError;
    } finally {
      setIsBusy(false);
    }
  }, [loadMemberDirectory, loadNotifications, loadSession, loadTeamState, selectedTeamId, setBusyStatus, setErrorStatus, setSuccessStatus]);

  const handleResetMemberPassword = useCallback(async (teamId: string, userId: string) => {
    try {
      setBusyStatus("Generating a replacement password...");
      setIsBusy(true);
      const response = await api<TeamMemberPasswordResetResponse>(`/api/teams/${teamId}/members/${userId}/reset-password`, {
        method: "POST"
      });
      await loadNotifications(false, "full");
      if (memberDirectory?.team.id === teamId) {
        await loadMemberDirectory(teamId);
      }
      setSuccessStatus(
        response.passwordDelivery === "smtp"
          ? "Password reset sent through the configured email delivery."
          : "Replacement password generated. Share it manually and save it somewhere secure first."
      );
      return response;
    } catch (requestError) {
      setErrorStatus((requestError as Error).message);
      throw requestError;
    } finally {
      setIsBusy(false);
    }
  }, [loadMemberDirectory, loadNotifications, memberDirectory?.team.id, setBusyStatus, setErrorStatus, setSuccessStatus]);

  const handlePromoteMember = useCallback(async (teamId: string, userId: string) => {
    try {
      setBusyStatus("Promoting the selected member to team-admin...");
      setIsBusy(true);
      await api(`/api/teams/${teamId}/members/${userId}/promote`, { method: "POST" });
      await loadSession();
      await loadMemberDirectory(teamId);
      if (selectedTeamId === teamId) {
        await loadTeamState(teamId, { preserveStateOnError: true });
      }
      setSuccessStatus("Member promoted to team-admin.");
    } catch (requestError) {
      setErrorStatus((requestError as Error).message);
    } finally {
      setIsBusy(false);
    }
  }, [loadMemberDirectory, loadSession, loadTeamState, selectedTeamId, setBusyStatus, setErrorStatus, setSuccessStatus]);

  const handleDemoteMember = useCallback(async (teamId: string, userId: string) => {
    try {
      setBusyStatus("Demoting the selected team-admin...");
      setIsBusy(true);
      await api(`/api/teams/${teamId}/members/${userId}/demote`, { method: "POST" });
      await loadSession();
      await loadMemberDirectory(teamId);
      if (selectedTeamId === teamId) {
        await loadTeamState(teamId, { preserveStateOnError: true });
      }
      setSuccessStatus("Team-admin demoted to regular member.");
    } catch (requestError) {
      setErrorStatus((requestError as Error).message);
    } finally {
      setIsBusy(false);
    }
  }, [loadMemberDirectory, loadSession, loadTeamState, selectedTeamId, setBusyStatus, setErrorStatus, setSuccessStatus]);

  const handleRemoveMember = useCallback(async (teamId: string, userId: string) => {
    try {
      setBusyStatus("Removing the selected member from the team...");
      setIsBusy(true);
      await api(`/api/teams/${teamId}/members/${userId}/remove`, { method: "POST" });
      await loadSession();
      await loadNotifications(false, "full");
      await loadMemberDirectory(teamId);
      if (selectedTeamId === teamId) {
        await loadTeamState(teamId, { preserveStateOnError: true });
      }
      setSuccessStatus("Member removed from the team.");
    } catch (requestError) {
      setErrorStatus((requestError as Error).message);
    } finally {
      setIsBusy(false);
    }
  }, [loadMemberDirectory, loadNotifications, loadSession, loadTeamState, selectedTeamId, setBusyStatus, setErrorStatus, setSuccessStatus]);

  const handleToggleArchiveTeam = useCallback(async (teamId: string, archived: boolean) => {
    try {
      setBusyStatus(archived ? "Archiving the selected team..." : "Unarchiving the selected team...");
      setIsBusy(true);
      await api(`/api/teams/${teamId}/archive`, {
        method: "POST",
        body: JSON.stringify({ archived })
      });
      await loadSession();
      await loadNotifications(false, "full");
      if (memberDirectory?.team.id === teamId) {
        await loadMemberDirectory(teamId);
      }
      if (selectedTeamId === teamId) {
        await loadTeamState(teamId, { preserveStateOnError: true });
      }
      setSuccessStatus(archived ? "Team archived." : "Team unarchived.");
    } catch (requestError) {
      setErrorStatus((requestError as Error).message);
    } finally {
      setIsBusy(false);
    }
  }, [loadMemberDirectory, loadNotifications, loadSession, loadTeamState, memberDirectory?.team.id, selectedTeamId, setBusyStatus, setErrorStatus, setSuccessStatus]);

  const handleLeaveTeam = useCallback(async (teamId: string) => {
    try {
      setBusyStatus("Leaving the selected team...");
      setIsBusy(true);
      await api(`/api/teams/${teamId}/leave`, { method: "POST" });
      const response = await api<SessionResponse>("/api/auth/session");
      storeSessionToken(response.token ?? null);
      setSession(response);
      const nextSelectedTeamId = response.memberships[0]?.id ?? null;
      setSelectedTeamId((current) => (current === teamId ? nextSelectedTeamId : current));
      setPendingTargetTeamId(null);
      if (selectedTeamId === teamId) {
        setTeamState(null);
      }
      setShowTeamChooser(true);
      writeRouteState({ selectedTeamId: nextSelectedTeamId, showTeamChooser: true });
      setMemberDirectory(null);
      setSuccessStatus("You left the selected team.");
    } catch (requestError) {
      setErrorStatus((requestError as Error).message);
    } finally {
      setIsBusy(false);
    }
  }, [selectedTeamId, setBusyStatus, setErrorStatus, setSuccessStatus]);

  const handleSelectTeamFromChooser = useCallback((teamId: string) => {
    setPendingTargetTeamId(null);
    setSelectedTeamId(teamId);
    setShowTeamChooser(false);
    writeRouteState({ selectedTeamId: teamId, showTeamChooser: false });
    setSuccessStatus("Opened the selected team.");
  }, [setSuccessStatus]);

  const handleSelectTeamFromBoard = useCallback((teamId: string) => {
    setPendingTargetTeamId(null);
    setSelectedTeamId(teamId);
    setShowTeamChooser(false);
    writeRouteState({ selectedTeamId: teamId, showTeamChooser: false });
    setSuccessStatus("Switching to the selected team...");
  }, [setSuccessStatus]);

  const handleOpenTeamChooserFromBoard = useCallback(() => {
    setShowTeamChooser(true);
    writeRouteState({ selectedTeamId, showTeamChooser: true });
  }, [selectedTeamId]);

  if (!session) {
    return (
      <LoginScreen
        branding={branding}
        email={email}
        setEmail={setEmail}
        adminUsername={adminUsername}
        setAdminUsername={setAdminUsername}
        password={password}
        setPassword={setPassword}
        confirmPassword={confirmPassword}
        setConfirmPassword={setConfirmPassword}
        displayName={displayName}
        setDisplayName={setDisplayName}
        avatarIconKey={avatarSelection.avatarIconKey}
        setAvatarIconKey={(value) => setAvatarSelection((current) => ({ ...current, avatarIconKey: value }))}
        avatarColorKey={avatarSelection.avatarColorKey}
        setAvatarColorKey={(value) => setAvatarSelection((current) => ({ ...current, avatarColorKey: value }))}
        authStep={authStep}
        canUseEmailCode={smtpConfigured || debugCodesEnabled}
        publicTrialOpenSignup={publicTrial.enabled && publicTrial.mode === "open_signup"}
        isPublicTrialCodeStep={authFlow === "publicTrial"}
        trialTermsAccepted={trialTermsAccepted}
        setTrialTermsAccepted={setTrialTermsAccepted}
        code={code}
        setCode={setCode}
        onRequestCode={handleRequestCode}
        onStartPublicTrial={handleStartPublicTrial}
        onRequestAccess={handleRequestAccess}
        onForgotPassword={handleForgotPassword}
        onOpenAdminSignIn={() => {
          setAuthFlow("standard");
          setAuthStep("admin");
        }}
        onPasswordSignIn={handlePasswordSignIn}
        onAdminSignIn={handleAdminSignIn}
        onBackToSignIn={() => {
          setAuthStep("signin");
          setAuthFlow("standard");
          setTrialTermsAccepted(false);
          setTrialTermsVersion(null);
        }}
        onVerify={handleVerify}
        debugCode={debugCode}
        error={error}
        info={info}
      />
    );
  }

  if (!selectedTeamId || !teamState || showTeamChooser) {
    return (
      <>
        <TeamChooser
          branding={branding}
          user={session.user}
          memberships={session.memberships}
          availableTeams={session.availableTeams}
          selectedTeamId={selectedTeamId}
          onSelectTeam={handleSelectTeamFromChooser}
          onCreateTeam={handleCreateTeam}
          onJoinTeam={handleJoinTeam}
          onLeaveTeam={handleLeaveTeam}
          notificationFeed={notificationFeed}
          onOpenNotifications={handleOpenNotifications}
          onLoadMoreHistory={loadMoreNotificationHistory}
          onAdmitJoinRequest={handleAdmitJoinRequest}
          onDenyJoinRequest={handleDenyJoinRequest}
          onAdmitPlatformAccessRequest={handleAdmitPlatformAccessRequest}
          onDenyPlatformAccessRequest={handleDenyPlatformAccessRequest}
          onOpenAccountSettings={() => setAccountSettingsOpen(true)}
          onSignOut={handleSignOut}
          onOpenAdminSettings={() => setAdminSettingsOpen(true)}
          onOpenMemberDirectory={handleOpenMemberDirectory}
          pendingTargetTeamId={pendingTargetTeamId}
          chooserMode={showTeamChooser && Boolean(selectedTeamId) ? "switcher" : "standalone"}
          onImportTeam={importTeamHistoryAsNewTeam}
        />
        <AccountSettingsModal
          open={accountSettingsOpen}
          user={getAccountUserForTeam(session, selectedTeamId)}
          historyTimezoneDefaultKeys={getAccountTimezoneDefaultKeys(session, selectedTeamId)}
          isBusy={isBusy}
          onClose={() => setAccountSettingsOpen(false)}
          onSaveProfile={handleUpdateProfile}
          onSaveBoardShortcutsPreference={handleSaveBoardShortcutsPreference}
          onSaveHistoryTimezonePreference={handleSaveHistoryTimezonePreference}
          onChangePassword={handleChangePassword}
          loadAccountDeletionPreview={loadAccountDeletionPreview}
          onDeleteAccount={deleteOwnAccount}
        />
        <AdminSettingsModal
          open={adminSettingsOpen}
          onClose={() => setAdminSettingsOpen(false)}
          onConfigApplied={handleAdminConfigApplied}
          loadConfig={loadAdminConfig}
          loadPeople={loadAdminPeople}
          admitAccessRequest={handleAdmitPlatformAccessRequest}
          denyAccessRequest={handleDenyPlatformAccessRequest}
          resetPlatformUserPassword={resetPlatformUserPassword}
          loadPlatformUserDeletionPreview={loadPlatformUserDeletionPreview}
          deletePlatformUser={deletePlatformUser}
          saveConfig={saveAdminConfig}
          revealSecret={revealAdminSecret}
          uploadBrandingAsset={uploadBrandingAsset}
          exportWholeDatabase={exportWholeDatabase}
          importWholeDatabase={importWholeDatabase}
          startJiraOAuth={startJiraOAuth}
          selectJiraSite={selectJiraSite}
          disconnectJira={disconnectJira}
          peopleRefreshTick={adminPeopleRefreshTick}
        />
        {memberDirectory ? (
          <TeamDirectoryModal
            directory={memberDirectory}
            isBusy={isBusy}
            onClose={() => setMemberDirectory(null)}
            onToggleArchive={handleToggleArchiveTeam}
            onAddMember={handleAddMemberToTeam}
            searchMemberCandidates={searchMemberCandidates}
            onSaveJiraSettings={handleSaveTeamJiraSettings}
            onImportJiraIssues={handleImportJiraIssues}
            onLoadPendingIssue={handleLoadPendingIssue}
            onExportTeamHistory={exportTeamHistory}
            onImportTeamHistory={importTeamHistoryToExistingTeam}
            onResetMemberPassword={handleResetMemberPassword}
            onDismissCredentialReveal={clearStatus}
            onPromoteMember={handlePromoteMember}
            onDemoteMember={handleDemoteMember}
            onRemoveMember={handleRemoveMember}
            onAdmitJoinRequest={handleAdmitJoinRequest}
            onDenyJoinRequest={handleDenyJoinRequest}
          />
        ) : null}
      </>
    );
  }

  const renderedTeamState = applyHistoryTimezonePreferenceOverride(
    teamState,
    historyTimezonePreferenceOverrides[teamState.team.id]
  );

  return (
    <>
      <TeamBoard
        branding={branding}
        state={renderedTeamState}
        onSelectTeam={handleSelectTeamFromBoard}
        onOpenTeamChooser={handleOpenTeamChooserFromBoard}
        onOpenMemberDirectory={handleOpenMemberDirectory}
        notificationFeed={notificationFeed}
        onOpenNotifications={handleOpenNotifications}
        onLoadMoreHistory={loadMoreNotificationHistory}
        onAdmitJoinRequest={handleAdmitJoinRequest}
        onDenyJoinRequest={handleDenyJoinRequest}
        onAdmitPlatformAccessRequest={handleAdmitPlatformAccessRequest}
        onDenyPlatformAccessRequest={handleDenyPlatformAccessRequest}
        onCreateRound={handleCreateRound}
        onVote={handleVote}
        onReveal={handleReveal}
        onCancelActiveRound={handleCancelActiveRound}
        onVoteAgainActiveRound={handleVoteAgainActiveRound}
        onVoteAgain={handleVoteAgain}
        onAddHistoryComment={handleAddHistoryComment}
        onEditHistoryComment={handleEditHistoryComment}
        onDeleteHistoryComment={handleDeleteHistoryComment}
        historyItems={renderedTeamState.history}
        historyNextCursor={historyNextCursor}
        historyLoading={historyLoadingMore}
        searchItems={historySearchItems}
        searchNextCursor={historySearchNextCursor}
        searchLoading={historySearchLoading}
        searchFilters={historySearchFilters}
        hasSearchedHistory={historySearchRequested}
        onLoadMoreIssueHistory={loadMoreTeamHistory}
        onRunIssueHistorySearch={runHistorySearch}
        onLoadMoreIssueSearch={loadMoreHistorySearch}
        onUpdateDeckSettings={handleUpdateDeckSettings}
        onUpdateTimer={handleUpdateTimer}
        onUpdateHistoryTimezoneSettings={handleUpdateHistoryTimezoneSettings}
        onUpdateQuorumSettings={handleUpdateQuorumSettings}
        onRenameTeam={handleRenameTeam}
        onLeaveCurrentTeam={() => handleLeaveTeam(selectedTeamId!)}
        onShareTeamLink={handleShareTeamLink}
        onOpenAccountSettings={() => setAccountSettingsOpen(true)}
        onLoadPendingIssue={(issueId) => handleLoadPendingIssue(selectedTeamId, issueId)}
        status={status}
        isBusy={isBusy}
      />
      <AccountSettingsModal
        open={accountSettingsOpen}
        user={renderedTeamState.currentUser}
        historyTimezoneDefaultKeys={renderedTeamState.team.historyTimezoneKeys}
        isBusy={isBusy}
        onClose={() => setAccountSettingsOpen(false)}
        onSaveProfile={handleUpdateProfile}
        onSaveBoardShortcutsPreference={handleSaveBoardShortcutsPreference}
        onSaveHistoryTimezonePreference={handleSaveHistoryTimezonePreference}
        onChangePassword={handleChangePassword}
        loadAccountDeletionPreview={loadAccountDeletionPreview}
        onDeleteAccount={deleteOwnAccount}
      />
      <AdminSettingsModal
        open={adminSettingsOpen}
        onClose={() => setAdminSettingsOpen(false)}
        onConfigApplied={handleAdminConfigApplied}
        loadConfig={loadAdminConfig}
        loadPeople={loadAdminPeople}
        admitAccessRequest={handleAdmitPlatformAccessRequest}
        denyAccessRequest={handleDenyPlatformAccessRequest}
        resetPlatformUserPassword={resetPlatformUserPassword}
        loadPlatformUserDeletionPreview={loadPlatformUserDeletionPreview}
        deletePlatformUser={deletePlatformUser}
        saveConfig={saveAdminConfig}
        revealSecret={revealAdminSecret}
        uploadBrandingAsset={uploadBrandingAsset}
        exportWholeDatabase={exportWholeDatabase}
        importWholeDatabase={importWholeDatabase}
        startJiraOAuth={startJiraOAuth}
        selectJiraSite={selectJiraSite}
        disconnectJira={disconnectJira}
        peopleRefreshTick={adminPeopleRefreshTick}
      />
      {memberDirectory ? (
        <TeamDirectoryModal
          directory={memberDirectory}
          isBusy={isBusy}
          onClose={() => setMemberDirectory(null)}
          onToggleArchive={handleToggleArchiveTeam}
          onAddMember={handleAddMemberToTeam}
          searchMemberCandidates={searchMemberCandidates}
          onSaveJiraSettings={handleSaveTeamJiraSettings}
          onImportJiraIssues={handleImportJiraIssues}
          onLoadPendingIssue={handleLoadPendingIssue}
          onExportTeamHistory={exportTeamHistory}
          onImportTeamHistory={importTeamHistoryToExistingTeam}
          onResetMemberPassword={handleResetMemberPassword}
          onDismissCredentialReveal={clearStatus}
          onPromoteMember={handlePromoteMember}
          onDemoteMember={handleDemoteMember}
          onRemoveMember={handleRemoveMember}
          onAdmitJoinRequest={handleAdmitJoinRequest}
          onDenyJoinRequest={handleDenyJoinRequest}
        />
      ) : null}
    </>
  );
}
