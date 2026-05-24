// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import type {
  BrandingManifest,
  CurrentUserSummary,
  DeckKey,
  FibonacciRangeEnd,
  FibonacciRangeStart,
  HistoryTimeZoneKey,
  TeamMembershipSummary,
  TeamStateResponse,
  TeamSummary,
  UserSummary
} from "@planning-poker/shared";

export interface AppConfig {
  port: number;
  host: string;
  allowedDomainsPath: string;
  sessionTtlDays: number;
  loginCodeTtlMinutes: number;
  debugCodesEnabled: boolean;
  debugToolsEnabled: boolean;
  dataDir: string;
  databasePath: string;
  deploymentConfigPath: string;
  managedBrandingDir: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  smtpFrom?: string;
  jiraClientId?: string;
  jiraClientSecret?: string;
  jiraCloudId?: string;
  jiraSiteUrl?: string;
  jiraSiteName?: string;
  jiraAccessToken?: string;
  jiraRefreshToken?: string;
  jiraAccessTokenExpiresAt?: string;
  appBaseUrl: string;
  simulatorModeEnabled: boolean;
  simulatorSharedSecret: string;
  demoModeEnabled: boolean;
  superAdminUsername: string;
  superAdminPassword: string;
  superAdminDisplayName: string;
  branding: BrandingManifest;
  defaultHistoryTimezoneKeys: HistoryTimeZoneKey[];
}

export interface SessionUser extends CurrentUserSummary {
  sessionToken: string;
}

export interface TeamWithCounts extends TeamSummary {
  memberCount: number;
}

export interface UserContext {
  currentUser: UserSummary;
  memberships: TeamMembershipSummary[];
  availableTeams: TeamMembershipSummary[];
}

export interface VerifyCodeResult {
  user: SessionUser;
  isNewUser: boolean;
}

export interface RoundRow {
  id: string;
  team_id: string;
  title: string;
  deck_key: DeckKey;
  fibonacci_range_start: FibonacciRangeStart | null;
  fibonacci_range_end: FibonacciRangeEnd | null;
  status: "active" | "revealed" | "archived";
  created_at: string;
  timer_started_at: string | null;
  timer_expires_at: string | null;
  revealed_at: string | null;
  reveal_average: string | number | null;
  reveal_quorum_blocked: number;
  reveal_voted_count: number;
  reveal_not_voted_count: number;
  revote_history_entry_id: string | null;
  pending_issue_id: string | null;
}

export interface HistoryRow {
  id: string;
  team_id: string;
  title: string;
  deck_key: DeckKey;
  fibonacci_range_start: FibonacciRangeStart | null;
  fibonacci_range_end: FibonacciRangeEnd | null;
  average_score: string | number | null;
  participant_count: number;
  quorum_blocked: number;
  voted_count: number;
  not_voted_count: number;
  completed_at: string;
  votes_json: string;
}

export interface HistoryCommentRow {
  id: string;
  history_entry_id: string;
  user_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  author_signature: string;
  imported_immutable: number;
  email: string;
  display_name: string;
  avatar_key: string;
  avatar_icon_key: string | null;
  avatar_color_key: string | null;
}

export interface StateEnvelope extends TeamStateResponse {}
