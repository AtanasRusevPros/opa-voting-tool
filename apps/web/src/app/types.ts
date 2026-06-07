// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import type {
  BrandingManifest,
  CurrentUserSummary,
  HistoryPage,
  HistoryEntry,
  TeamPendingIssue,
  TeamHistoryExportPackage,
  TeamHistorySearchFilters,
  TeamHistorySearchPage,
  NotificationSummary,
  PendingJoinRequestSummary,
  TeamMembershipSummary,
  TeamStateResponse,
  TeamTimerSeconds,
  TeamUserRole,
  UserSummary
} from "@planning-poker/shared";

export type SessionResponse = {
  user: CurrentUserSummary;
  memberships: TeamMembershipSummary[];
  availableTeams: TeamMembershipSummary[];
  token?: string;
};

export type BootstrapResponse = {
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

export type AdminConfigView = {
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

export type AdminConfigSaveResult = {
  config: AdminConfigView;
  appliedFields: string[];
  restartRequiredFields: string[];
};

export type RevealSecretResponse = {
  value: string;
};

export type BrandingAssetSlot = "loginLogo" | "loginBackground" | "teamLogo" | "teamBackground";

export type TeamDirectoryResponse = {
  team: TeamMembershipSummary | TeamStateResponse["team"];
  members: TeamMemberSummary[];
  activeParticipantIds: string[];
  currentUserId: string;
  currentUserRole: TeamUserRole;
  currentUserIsSuperAdmin: boolean;
  pendingIssues: TeamPendingIssue[];
  pendingJoinRequests: PendingJoinRequestSummary[];
};

export type TeamMemberSummary = TeamStateResponse["teamMembers"][number];

export type TeamHistoryResponse = {
  history: HistoryPage;
};

export type TeamHistorySearchResponse = TeamHistorySearchPage;

export type TeamHistorySearchRequest = TeamHistorySearchFilters & {
  cursor?: string | null;
  limit?: number;
};

export type HistoryCommentMutationResponse = {
  historyEntry: HistoryEntry;
};

export type WholeDatabaseExportResponse = {
  fileName: string;
};

export type TeamHistoryExportResponse = {
  fileName: string;
  package: TeamHistoryExportPackage;
};

export type TeamHistoryImportResponse = {
  importedCount: number;
  skippedCount: number;
  team: TeamMembershipSummary | TeamStateResponse["team"];
  createdTeam: boolean;
};

export type ActionHistoryPage = {
  items: NotificationSummary[];
  nextCursor: string | null;
};

export type PlatformAccessRequestSummary = {
  id: string;
  email: string;
  createdAt: string;
};

export type PlatformUserSummary = {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
  lastActiveAt: string;
};

export type PlatformPeopleResponse = {
  requests: PlatformAccessRequestSummary[];
  users: PlatformUserSummary[];
  nextOffset?: number | null;
  sort?: PlatformPeopleSort;
  query?: string;
};

export type PlatformPeopleSort = "recent" | "oldest" | "alpha" | "alpha-desc";

export type TeamMemberCandidateResponse = {
  users: UserSummary[];
};

export type NotificationFeedResponse = {
  active: NotificationSummary[];
  history: NotificationSummary[];
  pendingJoinRequests: PendingJoinRequestSummary[];
  platformAccessRequests?: PlatformAccessRequestSummary[];
  adminHistory?: ActionHistoryPage | null;
};

export type TeamMemberInviteResponse = {
  user: UserSummary;
  invitedNewUser: boolean;
  invitationDelivery: "smtp" | "manual-share" | "existing-user";
  temporaryPassword: string | null;
  secureSaveReminder: string | null;
};

export type PlatformAccessRequestActionResponse = {
  user: UserSummary;
  invitedNewUser: boolean;
  invitationDelivery: "smtp" | "manual-share";
  temporaryPassword: string | null;
  secureSaveReminder: string | null;
};

export type TeamMemberPasswordResetResponse = {
  user: UserSummary;
  passwordDelivery: "smtp" | "manual-share";
  temporaryPassword: string | null;
  secureSaveReminder: string | null;
};

export type AdminSettingsTab = "people" | "branding" | "app" | "smtp" | "super-admin";

export type RouteState = {
  selectedTeamId: string | null;
  showTeamChooser: boolean;
};

export type AuthStep = "signin" | "code" | "admin";
export type StatusTone = "neutral" | "success" | "error" | "busy";
export type StatusState = {
  tone: StatusTone;
  text: string;
};

export type HistoryTooltipRow = { label: string; value: string };

export type HistoryGroup = {
  key: string;
  heading: string;
  tooltipRows: HistoryTooltipRow[];
  items: HistoryEntry[];
};

export type PopupPosition = {
  top: number;
  left: number;
  align: "left" | "right";
};

export type TimerStateLabel = "off" | "idle" | "active";

export type TeamSettingsSection = "none" | "deck" | "rename" | "timezones" | "quorum" | "shortcuts";

export type ShortcutDefinition = {
  keyLabel: string;
  description: string;
};

export type BoardMemberPlacement = {
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

export type BoardRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type TileFootprint = {
  width: number;
  height: number;
};

export type BoardSide = "top" | "right" | "bottom" | "left";

export type BoardLayoutGeometry = {
  width: number;
  height: number;
  edgePadding: number;
  centerPadding: number;
  centerRect: BoardRect;
  normalTile: TileFootprint;
  compactTile: TileFootprint;
  overflowSeed: string;
};

export type BoardLayoutMode = "enough" | "compact" | "overlap" | "overflow";

export type BoardLayoutResult = {
  placements: BoardMemberPlacement[];
  mode: BoardLayoutMode;
};

export type BoardSizingState = {
  stageHeight: number;
  needsScroll: boolean;
};

export type RingPlacementCandidate = {
  placements: BoardMemberPlacement[];
  tile: TileFootprint;
  compact: boolean;
  ratio: number;
};

export type BoardSlot = {
  side: BoardSide;
  left: number;
  top: number;
  box: BoardRect;
};

export type RingBoardSlot = BoardSlot & {
  ring: 2 | 3;
  compact: boolean;
  order: number;
};

export type RoundStateLock = {
  teamId: string;
  roundId: string;
  reason: "reveal";
};

export type PendingPresenceState = {
  teamId: string;
  activeParticipants: UserSummary[];
};

export type PerfCounterName = "boardLayoutCalcs" | "participantRingRenders" | "memberTileRenders" | "historyRailRenders";

export type PerfStore = {
  counters: Record<PerfCounterName, number>;
  reset: () => void;
  increment: (name: PerfCounterName) => void;
};
