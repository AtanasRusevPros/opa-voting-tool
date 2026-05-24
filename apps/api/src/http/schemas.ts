// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import { FIBONACCI_RANGE_END_OPTIONS, FIBONACCI_RANGE_START_OPTIONS, HISTORY_TIME_ZONE_KEYS } from "@planning-poker/shared";
import { z } from "zod";

export const requestCodeSchema = z.object({
  email: z.string().email()
});

export const verifyCodeSchema = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{16}$/),
  displayName: z.string().trim().min(2).max(40).optional(),
  password: z.string().trim().min(8).max(128),
  avatarIconKey: z.string().optional(),
  avatarColorKey: z.string().optional(),
  avatarKey: z.string().optional()
});

export const passwordSignInSchema = z.object({
  email: z.string().email(),
  password: z.string().trim().min(8).max(128)
});

export const adminSignInSchema = z.object({
  username: z.string().trim().min(2).max(64),
  password: z.string().trim().min(8).max(128)
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().trim().min(8).max(128),
  newPassword: z.string().trim().min(8).max(128),
  confirmPassword: z.string().trim().min(8).max(128)
});

export const passwordResetRequestSchema = z.object({
  email: z.string().email()
});

export const requestAccessSchema = z.object({
  email: z.string().email()
});

export const createTeamSchema = z.object({
  name: z.string().trim().min(2).max(64)
});

export const teamSettingsSchema = z.object({
  name: z.string().trim().min(2).max(64).optional(),
  deckKey: z
    .enum([
      "fibonacci",
      "fibonacci-21",
      "modified-fibonacci",
      "powers-of-two",
      "tshirt",
      "linear-1-6",
      "linear-1-8",
      "linear-1-10"
    ])
    .optional(),
  fibonacciRangeStart: z.enum(FIBONACCI_RANGE_START_OPTIONS).nullable().optional(),
  fibonacciRangeEnd: z.enum(FIBONACCI_RANGE_END_OPTIONS).nullable().optional(),
  timerSeconds: z.union([z.literal(10), z.literal(20), z.literal(30), z.literal(40), z.literal(50), z.literal(60), z.literal(90), z.literal(120), z.literal(150), z.literal(180), z.null()]).optional(),
  iconKey: z.string().optional(),
  logoOpacity: z.number().min(0).max(1).optional(),
  backgroundOpacity: z.number().min(0).max(1).optional(),
  historyTimezonePopupEnabled: z.boolean().optional(),
  historyTimezoneKeys: z.array(z.enum(HISTORY_TIME_ZONE_KEYS)).max(HISTORY_TIME_ZONE_KEYS.length).optional(),
  minimumVotePercentEnabled: z.boolean().optional(),
  minimumVotePercent: z.number().int().min(1).max(100).optional(),
  jiraProjectKey: z.string().trim().min(1).max(32).nullable().optional(),
  jiraJql: z.string().trim().max(500).nullable().optional()
});

export const roundSchema = z.object({
  title: z.string().trim().min(1).max(255)
});

export const voteSchema = z.object({
  value: z.string().min(1).max(16)
});

export const historyCommentSchema = z.object({
  body: z.string().trim().min(1).max(4000)
});

export const historyPageQuerySchema = z.object({
  cursorCompletedAt: z.string().datetime().optional(),
  cursorId: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional()
});

export const historySearchQuerySchema = historyPageQuerySchema.extend({
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  titleQuery: z.string().trim().max(255).optional(),
  exactTitleMatch: z
    .union([z.literal("1"), z.literal("0"), z.literal("true"), z.literal("false")])
    .optional(),
  commentQuery: z.string().trim().max(200).optional(),
  personQuery: z.string().trim().max(120).optional()
});

const teamHistoryExportVoteSchema = z.object({
  userId: z.string().trim().min(1),
  displayName: z.string().trim().min(1).max(120),
  avatarIconKey: z.string().trim().min(1).max(64),
  avatarColorKey: z.string().trim().min(1).max(64),
  value: z.string().trim().min(1).max(16)
});

const teamHistoryExportCommentSchema = z.object({
  id: z.string().trim().min(1),
  authorSignature: z.string().trim().min(1).max(255),
  body: z.string().trim().min(1).max(4000),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

const teamHistoryExportEntrySchema = z.object({
  entryId: z.string().trim().min(1),
  title: z.string().trim().min(1).max(255),
  deckKey: z.enum([
    "fibonacci",
    "fibonacci-21",
    "modified-fibonacci",
    "powers-of-two",
    "tshirt",
    "linear-1-6",
    "linear-1-8",
    "linear-1-10"
  ]),
  fibonacciRangeStart: z.enum(FIBONACCI_RANGE_START_OPTIONS).nullable(),
  fibonacciRangeEnd: z.enum(FIBONACCI_RANGE_END_OPTIONS).nullable(),
  averageScore: z.union([z.number(), z.enum(["XS", "S", "M", "L", "XL"]), z.null()]),
  participantCount: z.number().int().min(0),
  completedAt: z.string().datetime(),
  votes: z.array(teamHistoryExportVoteSchema),
  comments: z.array(teamHistoryExportCommentSchema)
});

export const teamHistoryExportPackageSchema = z.object({
  version: z.literal(1),
  exportId: z.string().trim().min(1),
  exportedAt: z.string().datetime(),
  includeComments: z.boolean(),
  sourceTeam: z.object({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1).max(120),
    slug: z.string().trim().min(1).max(160),
    deckKey: z.enum([
      "fibonacci",
      "fibonacci-21",
      "modified-fibonacci",
      "powers-of-two",
      "tshirt",
      "linear-1-6",
      "linear-1-8",
      "linear-1-10"
    ]),
    fibonacciRangeStart: z.enum(FIBONACCI_RANGE_START_OPTIONS).nullable(),
    fibonacciRangeEnd: z.enum(FIBONACCI_RANGE_END_OPTIONS).nullable()
  }),
  entries: z.array(teamHistoryExportEntrySchema)
});

export const teamHistoryImportSchema = z.object({
  package: teamHistoryExportPackageSchema,
  teamName: z.string().trim().min(2).max(64).optional()
});

export const profileSchema = z.object({
  displayName: z.string().trim().min(2).max(40),
  avatarIconKey: z.string().min(1).max(32).optional(),
  avatarColorKey: z.string().min(1).max(32).optional(),
  avatarKey: z.string().min(1).max(32).optional()
});

export const userPreferencesSchema = z.object({
  teamId: z.string().min(1).optional(),
  boardShortcutsEnabled: z.boolean().optional(),
  historyTimezonePopupEnabled: z.boolean().optional(),
  historyTimezoneKeys: z.array(z.enum(HISTORY_TIME_ZONE_KEYS)).max(HISTORY_TIME_ZONE_KEYS.length).nullable().optional()
});

export const teamMemberEmailSchema = z.object({
  email: z.string().email()
});

export const teamArchiveSchema = z.object({
  archived: z.boolean()
});

export const adminConfigPatchSchema = z.object({
  app: z
    .object({
      baseUrl: z.string().trim().min(1).max(512).optional()
    })
    .optional(),
  admin: z
    .object({
      username: z.string().trim().min(2).max(64).optional(),
      password: z.string().trim().min(8).max(128).optional(),
      displayName: z.string().trim().min(2).max(64).optional()
    })
    .optional(),
  smtp: z
    .object({
      host: z.string().trim().max(255).optional(),
      port: z.number().int().min(1).max(65535).nullable().optional(),
      user: z.string().trim().max(255).optional(),
      pass: z.string().trim().max(255).optional(),
      from: z.string().trim().email().or(z.literal("")).optional()
    })
    .optional(),
  jira: z
    .object({
      clientId: z.string().trim().max(255).optional(),
      clientSecret: z.string().trim().max(255).optional()
    })
    .optional(),
  branding: z
    .object({
      backgroundOpacity: z.number().min(0).max(1).optional(),
      footerCreatorText: z.string().trim().max(120).optional(),
      footerCompanyText: z.string().trim().max(120).optional(),
      palette: z
        .object({
          primaryAction: z.string().trim().min(4).max(32).optional(),
          accentHighlight: z.string().trim().min(4).max(32).optional(),
          surfaceTint: z.string().trim().min(4).max(32).optional(),
          textEmphasis: z.string().trim().min(4).max(32).optional()
        })
        .optional()
    })
    .optional(),
  demo: z
    .object({
      enabled: z.boolean().optional()
    })
    .optional()
});

export const revealSecretSchema = z.object({
  field: z.enum(["admin.password", "smtp.pass", "jira.clientSecret"])
});

export const brandingUploadSchema = z.object({
  slot: z.enum(["loginLogo", "loginBackground", "teamLogo", "teamBackground"]),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum(["image/svg+xml", "image/png", "image/jpeg", "image/webp"]),
  dataBase64: z.string().min(1).max(8_000_000)
});

export const jiraSiteSelectionSchema = z.object({
  cloudId: z.string().trim().min(1).max(255)
});

export const simulatorLoginSchema = z.object({
  email: z.string().email()
});

export const simulatorBootstrapSchema = z.object({
  users: z.array(
    z.object({
      email: z.string().email(),
      displayName: z.string().trim().min(2).max(40),
      avatarIconKey: z.string().min(1).max(64),
      avatarColorKey: z.string().min(1).max(64)
    })
  ),
  teams: z.array(
    z.object({
      name: z.string().trim().min(2).max(64),
      memberEmails: z.array(z.string().email()).min(1)
    })
  )
});
