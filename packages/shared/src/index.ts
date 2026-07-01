// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

export type DeckKey =
  | "fibonacci"
  | "fibonacci-21"
  | "tshirt"
  | "powers-of-two"
  | "modified-fibonacci"
  | "linear-1-6"
  | "linear-1-8"
  | "linear-1-10";

export type VoteValue =
  | "0"
  | "0.5"
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "13"
  | "21"
  | "34"
  | "55"
  | "89"
  | "XS"
  | "S"
  | "M"
  | "L"
  | "XL"
  | "?"
  | "coffee";

export interface DeckDefinition {
  key: DeckKey;
  label: string;
  cards: VoteValue[];
}

export type AverageValue = number | "XS" | "S" | "M" | "L" | "XL";

export type FibonacciRangeStart = "0" | "1";
export type FibonacciRangeEnd = "1" | "2" | "3" | "5" | "8" | "13" | "21" | "34" | "55" | "89";

export const DECKS: DeckDefinition[] = [
  {
    key: "fibonacci",
    label: "Fibonacci",
    cards: ["0", "0.5", "1", "2", "3", "5", "8", "13", "21", "34", "55", "89", "?", "coffee"]
  },
  {
    key: "fibonacci-21",
    label: "Fibonacci 1-21",
    cards: ["1", "2", "3", "5", "8", "13", "21", "?", "coffee"]
  },
  {
    key: "modified-fibonacci",
    label: "Modified Fibonacci",
    cards: ["0", "1", "2", "3", "5", "8", "13", "20", "40", "100", "?", "coffee"] as VoteValue[]
  },
  {
    key: "linear-1-6",
    label: "Linear 1-6",
    cards: ["1", "2", "3", "4", "5", "6", "?", "coffee"] as VoteValue[]
  },
  {
    key: "linear-1-8",
    label: "Linear 1-8",
    cards: ["1", "2", "3", "4", "5", "6", "7", "8", "?", "coffee"] as VoteValue[]
  },
  {
    key: "linear-1-10",
    label: "Linear 1-10",
    cards: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "?", "coffee"] as VoteValue[]
  },
  {
    key: "powers-of-two",
    label: "Powers of Two",
    cards: ["0", "1", "2", "4", "8", "16", "32", "64", "?", "coffee"] as VoteValue[]
  },
  {
    key: "tshirt",
    label: "T-Shirt",
    cards: ["XS", "S", "M", "L", "XL", "?", "coffee"]
  }
];

export const DEFAULT_DECK_KEY: DeckKey = "fibonacci-21";
export const FIBONACCI_RANGE_START_OPTIONS = ["0", "1"] as const satisfies readonly FibonacciRangeStart[];
export const FIBONACCI_RANGE_END_OPTIONS = ["1", "2", "3", "5", "8", "13", "21", "34", "55", "89"] as const satisfies readonly FibonacciRangeEnd[];

const FIBONACCI_NUMERIC_CARDS = ["0", "0.5", "1", "2", "3", "5", "8", "13", "21", "34", "55", "89"] as const satisfies readonly VoteValue[];
const FIBONACCI_RANGE_START_SET = new Set<string>(FIBONACCI_RANGE_START_OPTIONS);
const FIBONACCI_RANGE_END_SET = new Set<string>(FIBONACCI_RANGE_END_OPTIONS);

export function isFibonacciRangeStart(value: string | null | undefined): value is FibonacciRangeStart {
  return Boolean(value && FIBONACCI_RANGE_START_SET.has(value));
}

export function isFibonacciRangeEnd(value: string | null | undefined): value is FibonacciRangeEnd {
  return Boolean(value && FIBONACCI_RANGE_END_SET.has(value));
}

export function normalizeFibonacciRange(start: string | null | undefined, end: string | null | undefined): {
  fibonacciRangeStart: FibonacciRangeStart | null;
  fibonacciRangeEnd: FibonacciRangeEnd | null;
} {
  if (!isFibonacciRangeStart(start) || !isFibonacciRangeEnd(end)) {
    return {
      fibonacciRangeStart: null,
      fibonacciRangeEnd: null
    };
  }

  const startIndex = FIBONACCI_NUMERIC_CARDS.indexOf(start);
  const endIndex = FIBONACCI_NUMERIC_CARDS.indexOf(end);
  if (startIndex === -1 || endIndex === -1 || startIndex > endIndex) {
    return {
      fibonacciRangeStart: null,
      fibonacciRangeEnd: null
    };
  }

  return {
    fibonacciRangeStart: start,
    fibonacciRangeEnd: end
  };
}

export function resolveDeckDefinition(
  deckKey: DeckKey,
  options?: {
    fibonacciRangeStart?: string | null;
    fibonacciRangeEnd?: string | null;
  }
): DeckDefinition {
  if (deckKey === "fibonacci") {
    const normalizedRange = normalizeFibonacciRange(options?.fibonacciRangeStart, options?.fibonacciRangeEnd);
    if (normalizedRange.fibonacciRangeStart && normalizedRange.fibonacciRangeEnd) {
      const startIndex = FIBONACCI_NUMERIC_CARDS.indexOf(normalizedRange.fibonacciRangeStart);
      const endIndex = FIBONACCI_NUMERIC_CARDS.indexOf(normalizedRange.fibonacciRangeEnd);
      const cards = [...FIBONACCI_NUMERIC_CARDS.slice(startIndex, endIndex + 1), "?", "coffee"] as VoteValue[];
      return {
        key: deckKey,
        label: `Fibonacci ${normalizedRange.fibonacciRangeStart}-${normalizedRange.fibonacciRangeEnd}`,
        cards
      };
    }
  }

  return DECKS.find((deck) => deck.key === deckKey) ?? DECKS[0]!;
}

export function getDeckLabel(
  deckKey: DeckKey,
  options?: {
    fibonacciRangeStart?: string | null;
    fibonacciRangeEnd?: string | null;
  }
): string {
  return resolveDeckDefinition(deckKey, options).label;
}

export function getDeckCards(
  deckKey: DeckKey,
  options?: {
    fibonacciRangeStart?: string | null;
    fibonacciRangeEnd?: string | null;
  }
): VoteValue[] {
  return resolveDeckDefinition(deckKey, options).cards;
}

export const HISTORY_TIME_ZONE_KEYS = [
  "gmt",
  "utc",
  "usa-pacific",
  "usa-mountain",
  "usa-central",
  "usa-eastern",
  "usa-davidson",
  "canada-toronto",
  "mexico-city",
  "brazil-sao-paulo",
  "argentina-buenos-aires",
  "uk-london",
  "ireland-dublin",
  "portugal-lisbon",
  "germany-berlin",
  "france-paris",
  "netherlands-amsterdam",
  "bulgaria-sofia",
  "romania-bucharest",
  "ukraine-kyiv",
  "turkey-istanbul",
  "israel-tel-aviv",
  "egypt-cairo",
  "south-africa-johannesburg",
  "uae-dubai",
  "india-pune",
  "singapore",
  "china-shanghai",
  "japan-tokyo",
  "australia-sydney",
  "new-zealand-auckland"
] as const;

export type HistoryTimeZoneKey = (typeof HISTORY_TIME_ZONE_KEYS)[number];

export const HISTORY_TIME_ZONE_OPTIONS: ReadonlyArray<{
  key: HistoryTimeZoneKey;
  label: string;
  timeZone: string;
  locale: string;
}> = [
  { key: "gmt", label: "GMT", timeZone: "Etc/GMT", locale: "en-GB" },
  { key: "utc", label: "UTC", timeZone: "Etc/UTC", locale: "en-GB" },
  { key: "usa-pacific", label: "USA - Pacific", timeZone: "America/Los_Angeles", locale: "en-US" },
  { key: "usa-mountain", label: "USA - Mountain", timeZone: "America/Denver", locale: "en-US" },
  { key: "usa-central", label: "USA - Central", timeZone: "America/Chicago", locale: "en-US" },
  { key: "usa-eastern", label: "USA - Eastern", timeZone: "America/New_York", locale: "en-US" },
  { key: "usa-davidson", label: "USA - Davidson", timeZone: "America/New_York", locale: "en-US" },
  { key: "canada-toronto", label: "Canada - Toronto", timeZone: "America/Toronto", locale: "en-CA" },
  { key: "mexico-city", label: "Mexico - Mexico City", timeZone: "America/Mexico_City", locale: "en-US" },
  { key: "brazil-sao-paulo", label: "Brazil - Sao Paulo", timeZone: "America/Sao_Paulo", locale: "en-US" },
  { key: "argentina-buenos-aires", label: "Argentina - Buenos Aires", timeZone: "America/Argentina/Buenos_Aires", locale: "en-US" },
  { key: "uk-london", label: "UK - London", timeZone: "Europe/London", locale: "en-GB" },
  { key: "ireland-dublin", label: "Ireland - Dublin", timeZone: "Europe/Dublin", locale: "en-IE" },
  { key: "portugal-lisbon", label: "Portugal - Lisbon", timeZone: "Europe/Lisbon", locale: "en-GB" },
  { key: "germany-berlin", label: "Germany - Berlin", timeZone: "Europe/Berlin", locale: "en-GB" },
  { key: "france-paris", label: "France - Paris", timeZone: "Europe/Paris", locale: "en-GB" },
  { key: "netherlands-amsterdam", label: "Netherlands - Amsterdam", timeZone: "Europe/Amsterdam", locale: "en-GB" },
  { key: "bulgaria-sofia", label: "Bulgaria - Sofia", timeZone: "Europe/Sofia", locale: "en-GB" },
  { key: "romania-bucharest", label: "Romania - Bucharest", timeZone: "Europe/Bucharest", locale: "en-GB" },
  { key: "ukraine-kyiv", label: "Ukraine - Kyiv", timeZone: "Europe/Kyiv", locale: "en-GB" },
  { key: "turkey-istanbul", label: "Turkey - Istanbul", timeZone: "Europe/Istanbul", locale: "en-GB" },
  { key: "israel-tel-aviv", label: "Israel - Tel Aviv", timeZone: "Asia/Jerusalem", locale: "en-GB" },
  { key: "egypt-cairo", label: "Egypt - Cairo", timeZone: "Africa/Cairo", locale: "en-GB" },
  { key: "south-africa-johannesburg", label: "South Africa - Johannesburg", timeZone: "Africa/Johannesburg", locale: "en-GB" },
  { key: "uae-dubai", label: "UAE - Dubai", timeZone: "Asia/Dubai", locale: "en-GB" },
  { key: "india-pune", label: "India - Pune", timeZone: "Asia/Kolkata", locale: "en-GB" },
  { key: "singapore", label: "Singapore", timeZone: "Asia/Singapore", locale: "en-GB" },
  { key: "china-shanghai", label: "China - Shanghai", timeZone: "Asia/Shanghai", locale: "en-GB" },
  { key: "japan-tokyo", label: "Japan - Tokyo", timeZone: "Asia/Tokyo", locale: "en-GB" },
  { key: "australia-sydney", label: "Australia - Sydney", timeZone: "Australia/Sydney", locale: "en-AU" },
  { key: "new-zealand-auckland", label: "New Zealand - Auckland", timeZone: "Pacific/Auckland", locale: "en-NZ" }
];

export const DEFAULT_HISTORY_TIME_ZONE_KEYS = ["gmt", "usa-davidson", "india-pune", "bulgaria-sofia"] as const satisfies readonly HistoryTimeZoneKey[];
export const DEFAULT_HISTORY_TIME_ZONE_POPUP_ENABLED = true;

const HISTORY_TIME_ZONE_KEY_SET = new Set<string>(HISTORY_TIME_ZONE_KEYS);

export function normalizeHistoryTimeZoneKeys(keys: readonly string[] | null | undefined): HistoryTimeZoneKey[] {
  const normalized = Array.from(new Set(keys ?? [])).filter((key): key is HistoryTimeZoneKey => HISTORY_TIME_ZONE_KEY_SET.has(key));
  return normalized.length ? normalized : [...DEFAULT_HISTORY_TIME_ZONE_KEYS];
}

export const TEAM_TIMER_OPTIONS = [10, 20, 30, 40, 50, 60, 90, 120, 150, 180] as const;
export type TeamTimerSeconds = (typeof TEAM_TIMER_OPTIONS)[number];

function clampAverageIndex(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export const NUMERIC_VOTE_VALUES = new Set<string>([
  "0",
  "0.5",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "13",
  "16",
  "20",
  "21",
  "32",
  "34",
  "40",
  "55",
  "64",
  "89",
  "100"
]);

export function isNumericVote(value: string): boolean {
  return NUMERIC_VOTE_VALUES.has(value);
}

const TSHIRT_SCALE = ["XS", "S", "M", "L", "XL"] as const;

export function calculateAverage(values: string[], deckKey?: DeckKey): AverageValue | null {
  if (deckKey === "tshirt") {
    const tshirtValues = values
      .map((value) => TSHIRT_SCALE.indexOf(value as (typeof TSHIRT_SCALE)[number]))
      .filter((value) => value >= 0)
      .map((value) => value + 1);
    if (tshirtValues.length === 0) {
      return null;
    }

    const average = tshirtValues.reduce((sum, value) => sum + value, 0) / tshirtValues.length;
    const nearestIndex = clampAverageIndex(Math.round(average), 1, TSHIRT_SCALE.length) - 1;
    return TSHIRT_SCALE[nearestIndex]!;
  }

  const numericValues = values.filter(isNumericVote).map(Number);
  if (numericValues.length === 0) {
    return null;
  }

  const average = numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
  return Math.round(average * 100) / 100;
}

export interface UserSummary {
  id: string;
  email: string;
  displayName: string;
  avatarIconKey: string;
  avatarColorKey: string;
}

export type TeamUserRole = "none" | "member" | "team_admin";
export type TeamJoinRequestStatus = "none" | "pending";
export type NotificationKind =
  | "platform_access_requested"
  | "platform_access_admitted"
  | "platform_access_denied"
  | "platform_user_password_reset"
  | "team_join_request_admitted"
  | "team_join_request_denied"
  | "team_added_to_team"
  | "team_removed_from_team"
  | "team_admin_promoted"
  | "team_member_password_reset"
  | "team_archived"
  | "team_unarchived";

export interface CurrentUserSummary extends UserSummary {
  isSuperAdmin: boolean;
  loginName: string | null;
  boardShortcutsEnabled: boolean;
  historyTimezonePopupEnabled?: boolean;
  historyTimezoneKeys?: HistoryTimeZoneKey[] | null;
}

export interface TeamSummary {
  id: string;
  name: string;
  slug: string;
  demo: boolean;
  deckKey: DeckKey;
  fibonacciRangeStart: FibonacciRangeStart | null;
  fibonacciRangeEnd: FibonacciRangeEnd | null;
  timerSeconds: TeamTimerSeconds | null;
  iconKey: string;
  logoOpacity: number;
  backgroundOpacity: number;
  historyTimezonePopupEnabled: boolean;
  historyTimezoneKeys: HistoryTimeZoneKey[];
  minimumVotePercentEnabled: boolean;
  minimumVotePercent: number;
  jiraProjectKey: string | null;
  jiraJql: string | null;
  archived: boolean;
  lastActivityAt: string;
}

export interface TeamMembershipSummary extends TeamSummary {
  memberCount: number;
  currentUserRole: TeamUserRole;
  joinRequestStatus: TeamJoinRequestStatus;
  lastOpenedAt: string | null;
  currentUserHistoryTimezonePopupEnabled?: boolean;
  currentUserHistoryTimezoneKeys?: HistoryTimeZoneKey[] | null;
}

export interface TeamMemberSummary extends UserSummary {
  role: TeamUserRole;
  joinedAt: string;
  lastOpenedAt: string | null;
}

export interface PendingJoinRequestSummary {
  id: string;
  teamId: string;
  teamName: string;
  requester: UserSummary;
  createdAt: string;
}

export interface NotificationSummary {
  id: string;
  kind: NotificationKind;
  title: string;
  message: string;
  teamId: string | null;
  teamName: string | null;
  actorDisplayName: string | null;
  createdAt: string;
  seenAt: string | null;
}

export interface HistoryComment {
  id: string;
  historyEntryId: string;
  author: UserSummary;
  authorSignature: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  importedImmutable: boolean;
}

export interface VoteRecord {
  userId: string;
  displayName: string;
  avatarIconKey: string;
  avatarColorKey: string;
  value: string;
}

export interface HistoryEntry {
  id: string;
  teamId: string;
  title: string;
  deckKey: DeckKey;
  fibonacciRangeStart: FibonacciRangeStart | null;
  fibonacciRangeEnd: FibonacciRangeEnd | null;
  averageScore: AverageValue | null;
  participantCount: number;
  quorumBlocked: boolean;
  votedCount: number;
  notVotedCount: number;
  completedAt: string;
  votes: VoteRecord[];
  comments: HistoryComment[];
}

export interface TeamPendingIssue {
  id: string;
  source: "jira_cloud";
  externalIssueId: string;
  issueKey: string;
  title: string;
  displayTitle: string;
  importedAt: string;
  updatedAt: string;
}

export interface HistoryPageCursor {
  completedAt: string;
  id: string;
}

export interface HistoryPage {
  items: HistoryEntry[];
  nextCursor: HistoryPageCursor | null;
}

export interface TeamHistorySearchFilters {
  dateFrom: string | null;
  dateTo: string | null;
  titleQuery: string;
  exactTitleMatch: boolean;
  commentQuery: string;
  personQuery: string;
}

export interface TeamHistorySearchPage extends HistoryPage {
  filters: TeamHistorySearchFilters;
}

export interface TeamHistoryExportComment {
  id: string;
  authorSignature: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface TeamHistoryExportEntry {
  entryId: string;
  title: string;
  deckKey: DeckKey;
  fibonacciRangeStart: FibonacciRangeStart | null;
  fibonacciRangeEnd: FibonacciRangeEnd | null;
  averageScore: AverageValue | null;
  participantCount: number;
  completedAt: string;
  votes: VoteRecord[];
  comments: TeamHistoryExportComment[];
}

export interface TeamHistoryExportPackage {
  version: 1;
  exportId: string;
  exportedAt: string;
  includeComments: boolean;
  sourceTeam: {
    id: string;
    name: string;
    slug: string;
    deckKey: DeckKey;
    fibonacciRangeStart: FibonacciRangeStart | null;
    fibonacciRangeEnd: FibonacciRangeEnd | null;
  };
  entries: TeamHistoryExportEntry[];
}

export interface RoundState {
  id: string;
  teamId: string;
  title: string;
  deckKey: DeckKey;
  fibonacciRangeStart: FibonacciRangeStart | null;
  fibonacciRangeEnd: FibonacciRangeEnd | null;
  status: "active" | "revealed";
  createdAt: string;
  timerStartedAt: string | null;
  timerExpiresAt: string | null;
  revealedAt: string | null;
  revealAverage: AverageValue | null;
  quorumBlocked: boolean;
  votedCount: number;
  notVotedCount: number;
  votes: VoteRecord[];
  revoteHistoryEntryId: string | null;
  pendingIssueId: string | null;
}

export interface TeamStateResponse {
  team: TeamSummary;
  memberships: TeamMembershipSummary[];
  availableTeams: TeamMembershipSummary[];
  teamMembers: TeamMemberSummary[];
  activeParticipants: UserSummary[];
  activeRound: RoundState | null;
  pendingIssues: TeamPendingIssue[];
  history: HistoryEntry[];
  currentUser: CurrentUserSummary;
  currentUserRole: TeamUserRole;
  liveSync: TeamLiveSyncState;
  serverTime?: string | null;
}

export interface TeamLiveSyncState {
  teamId: string;
  roundId: string | null;
  roundVersion: number;
  voteVersion: number;
}

export interface TeamRoundUpdatePayload {
  teamId: string;
  activeRound: RoundState | null;
  historyEntry: HistoryEntry | null;
  liveSync: TeamLiveSyncState;
  serverTime?: string | null;
}

export interface TeamRoundVoteUpdatePayload {
  teamId: string;
  roundId: string;
  changedMemberIndexes: number[];
  fromVoteVersion: number;
  votedCount: number;
  notVotedCount: number;
  viewerVoteValue: string | null;
  liveSync: TeamLiveSyncState;
  serverTime?: string | null;
}

export interface BrandingManifest {
  loginLogo: string;
  loginBackground: string;
  teamLogo: string;
  teamBackground: string;
  backgroundOpacity: number;
  footerCreatorText: string;
  footerCompanyText: string;
  palette: BrandingPalette;
  avatarKeys: string[];
  avatarIconKeys: string[];
  avatarColorKeys: string[];
}

export interface BrandingPalette {
  primaryAction: string;
  accentHighlight: string;
  surfaceTint: string;
  textEmphasis: string;
}

const LEGACY_AVATAR_KEYS = ["andromeda", "aurora", "comet", "nova", "orbit", "pulse", "quasar", "rocket"] as const;

export const AVATAR_COLOR_KEYS = [
  "amber",
  "azure",
  "coral",
  "emerald",
  "gold",
  "indigo",
  "lime",
  "plum",
  "rose",
  "teal",
  "graphite",
  "sunset"
] as const;

export type AvatarColorKey = (typeof AVATAR_COLOR_KEYS)[number];

export const AVATAR_COLOR_SWATCHES: Record<AvatarColorKey, string> = {
  amber: "#F3A93B",
  azure: "#4EA4F2",
  coral: "#FF7E68",
  emerald: "#32B77B",
  gold: "#E0B636",
  indigo: "#7468F2",
  lime: "#91D93A",
  plum: "#B76BE5",
  rose: "#E56293",
  teal: "#22B8B0",
  graphite: "#66738A",
  sunset: "#FF8A42"
};

const ANIMAL_AVATAR_KEYS = [
  "amber-badger",
  "amber-bat",
  "amber-bear",
  "amber-beaver",
  "amber-cat",
  "amber-cow",
  "amber-deer",
  "amber-dog",
  "amber-fox",
  "amber-frog",
  "amber-koala",
  "amber-lion",
  "amber-monkey",
  "amber-mouse",
  "amber-otter",
  "amber-owl",
  "amber-panda",
  "amber-penguin",
  "amber-pig",
  "amber-rabbit",
  "amber-raccoon",
  "amber-tiger",
  "amber-wolf",
  "amber-zebra",
  "azure-badger",
  "azure-bat",
  "azure-bear",
  "azure-beaver",
  "azure-cat",
  "azure-cow",
  "azure-deer",
  "azure-dog",
  "azure-fox",
  "azure-frog",
  "azure-koala",
  "azure-lion",
  "azure-monkey",
  "azure-mouse",
  "azure-otter",
  "azure-owl",
  "azure-panda",
  "azure-penguin",
  "azure-pig",
  "azure-rabbit",
  "azure-raccoon",
  "azure-tiger",
  "azure-wolf",
  "azure-zebra",
  "coral-badger",
  "coral-bat",
  "coral-bear",
  "coral-beaver",
  "coral-cat",
  "coral-cow",
  "coral-deer",
  "coral-dog",
  "coral-fox",
  "coral-frog",
  "coral-koala",
  "coral-lion",
  "coral-monkey",
  "coral-mouse",
  "coral-otter",
  "coral-owl",
  "coral-panda",
  "coral-penguin",
  "coral-pig",
  "coral-rabbit",
  "coral-raccoon",
  "coral-tiger",
  "coral-wolf",
  "coral-zebra",
  "emerald-badger",
  "emerald-bat",
  "emerald-bear",
  "emerald-beaver",
  "emerald-cat",
  "emerald-cow",
  "emerald-deer",
  "emerald-dog",
  "emerald-fox",
  "emerald-frog",
  "emerald-koala",
  "emerald-lion",
  "emerald-monkey",
  "emerald-mouse",
  "emerald-otter",
  "emerald-owl",
  "emerald-panda",
  "emerald-penguin",
  "emerald-pig",
  "emerald-rabbit",
  "emerald-raccoon",
  "emerald-tiger",
  "emerald-wolf",
  "emerald-zebra",
  "gold-badger",
  "gold-bat",
  "gold-bear",
  "gold-beaver",
  "gold-cat",
  "gold-cow",
  "gold-deer",
  "gold-dog",
  "gold-fox",
  "gold-frog",
  "gold-koala",
  "gold-lion",
  "gold-monkey",
  "gold-mouse",
  "gold-otter",
  "gold-owl",
  "gold-panda",
  "gold-penguin",
  "gold-pig",
  "gold-rabbit",
  "gold-raccoon",
  "gold-tiger",
  "gold-wolf",
  "gold-zebra",
  "indigo-badger",
  "indigo-bat",
  "indigo-bear",
  "indigo-beaver",
  "indigo-cat",
  "indigo-cow",
  "indigo-deer",
  "indigo-dog",
  "indigo-fox",
  "indigo-frog",
  "indigo-koala",
  "indigo-lion",
  "indigo-monkey",
  "indigo-mouse",
  "indigo-otter",
  "indigo-owl",
  "indigo-panda",
  "indigo-penguin",
  "indigo-pig",
  "indigo-rabbit",
  "indigo-raccoon",
  "indigo-tiger",
  "indigo-wolf",
  "indigo-zebra",
  "lime-badger",
  "lime-bat",
  "lime-bear",
  "lime-beaver",
  "lime-cat",
  "lime-cow",
  "lime-deer",
  "lime-dog",
  "lime-fox",
  "lime-frog",
  "lime-koala",
  "lime-lion",
  "lime-monkey",
  "lime-mouse",
  "lime-otter",
  "lime-owl",
  "lime-panda",
  "lime-penguin",
  "lime-pig",
  "lime-rabbit",
  "lime-raccoon",
  "lime-tiger",
  "lime-wolf",
  "lime-zebra",
  "plum-badger",
  "plum-bat",
  "plum-bear",
  "plum-beaver",
  "plum-cat",
  "plum-cow",
  "plum-deer",
  "plum-dog",
  "plum-fox",
  "plum-frog",
  "plum-koala",
  "plum-lion",
  "plum-monkey",
  "plum-mouse",
  "plum-otter",
  "plum-owl",
  "plum-panda",
  "plum-penguin",
  "plum-pig",
  "plum-rabbit",
  "plum-raccoon",
  "plum-tiger",
  "plum-wolf",
  "plum-zebra"
] as const;

const LEGACY_ANIMAL_ICON_KEYS = [
  "badger",
  "bat",
  "bear",
  "beaver",
  "cat",
  "cow",
  "deer",
  "dog",
  "fox",
  "frog",
  "koala",
  "lion",
  "monkey",
  "mouse",
  "otter",
  "owl",
  "panda",
  "penguin",
  "pig",
  "rabbit",
  "raccoon",
  "tiger",
  "wolf",
  "zebra"
] as const;

export const AVATAR_ICON_KEYS = [
  "bear",
  "fox",
  "owl",
  "frog",
  "tiger",
  "star",
  "confetti",
  "wrench",
  "iron",
  "cog",
  "pizza",
  "cake",
  "biscuit",
  "water",
  "planet",
  "cone",
  "stop",
  "yield",
  "parking",
  "hammer",
  "bolt",
  "cloud",
  "letter-a",
  "letter-b",
  "letter-c",
  "letter-d",
  "letter-e",
  "letter-f",
  "letter-g",
  "letter-h",
  "letter-i",
  "letter-j",
  "letter-k",
  "letter-l",
  "letter-m",
  "letter-n",
  "letter-o",
  "letter-p",
  "letter-q",
  "letter-r",
  "letter-s",
  "letter-t",
  "letter-u",
  "letter-v",
  "letter-w",
  "letter-x",
  "letter-y",
  "letter-z"
] as const;

const SUPPORTED_AVATAR_ICON_KEYS = [...LEGACY_ANIMAL_ICON_KEYS, ...AVATAR_ICON_KEYS] as const;

export type AvatarIconKey = (typeof SUPPORTED_AVATAR_ICON_KEYS)[number];

const LEGACY_AVATAR_MAP: Record<(typeof LEGACY_AVATAR_KEYS)[number], { iconKey: AvatarIconKey; colorKey: AvatarColorKey }> = {
  andromeda: { iconKey: "fox", colorKey: "azure" },
  aurora: { iconKey: "owl", colorKey: "sunset" },
  comet: { iconKey: "rabbit", colorKey: "teal" },
  nova: { iconKey: "cat", colorKey: "rose" },
  orbit: { iconKey: "bear", colorKey: "azure" },
  pulse: { iconKey: "frog", colorKey: "sunset" },
  quasar: { iconKey: "lion", colorKey: "teal" },
  rocket: { iconKey: "wolf", colorKey: "plum" }
};

export const AVATAR_KEYS = [
  ...LEGACY_AVATAR_KEYS,
  ...AVATAR_COLOR_KEYS.flatMap((colorKey) => SUPPORTED_AVATAR_ICON_KEYS.map((iconKey) => `${colorKey}-${iconKey}`))
] as string[];

export function isAvatarIconKey(value: string): value is AvatarIconKey {
  return (SUPPORTED_AVATAR_ICON_KEYS as readonly string[]).includes(value);
}

export function isAvatarColorKey(value: string): value is AvatarColorKey {
  return (AVATAR_COLOR_KEYS as readonly string[]).includes(value);
}

export function buildAvatarAssetKey(iconKey: string, colorKey: string): string {
  return `${colorKey}-${iconKey}`;
}

export function resolveAvatarSelection(input: {
  avatarIconKey?: string | null;
  avatarColorKey?: string | null;
  avatarKey?: string | null;
}): { avatarIconKey: AvatarIconKey; avatarColorKey: AvatarColorKey } {
  const avatarIconCandidate = input.avatarIconKey ?? "";
  const avatarColorCandidate = input.avatarColorKey ?? "";

  if (isAvatarIconKey(avatarIconCandidate) && isAvatarColorKey(avatarColorCandidate)) {
    return {
      avatarIconKey: avatarIconCandidate,
      avatarColorKey: avatarColorCandidate
    };
  }

  const legacyMapped = input.avatarKey ? LEGACY_AVATAR_MAP[input.avatarKey as keyof typeof LEGACY_AVATAR_MAP] : undefined;
  if (legacyMapped) {
    return {
      avatarIconKey: legacyMapped.iconKey,
      avatarColorKey: legacyMapped.colorKey
    };
  }

  if (input.avatarKey && input.avatarKey.includes("-")) {
    const [colorKey, iconKey] = input.avatarKey.split("-", 2);
    if (isAvatarColorKey(colorKey) && isAvatarIconKey(iconKey)) {
      return {
        avatarIconKey: iconKey,
        avatarColorKey: colorKey
      };
    }
  }

  return {
    avatarIconKey: "bear",
    avatarColorKey: "azure"
  };
}

export const BRANDING_MANIFEST: BrandingManifest = {
  loginLogo: "/branding/login-logo.svg",
  loginBackground: "/branding/login-background.svg",
  teamLogo: "/branding/team-logo.svg",
  teamBackground: "/branding/team-background.svg",
  backgroundOpacity: 0.12,
  footerCreatorText: "",
  footerCompanyText: "",
  palette: {
    primaryAction: "#3a88ff",
    accentHighlight: "#579dff",
    surfaceTint: "#eff5fd",
    textEmphasis: "#203047"
  },
  avatarKeys: AVATAR_KEYS,
  avatarIconKeys: [...AVATAR_ICON_KEYS],
  avatarColorKeys: [...AVATAR_COLOR_KEYS]
};
