// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import nodemailer from "nodemailer";
import { DEFAULT_HISTORY_TIME_ZONE_KEYS } from "@planning-poker/shared";
import { createEmailSender } from "../src/email.js";
import type { AppConfig } from "../src/types.js";

const { sendMailMock, createTransportMock } = vi.hoisted(() => {
  const sendMail = vi.fn(async () => undefined);
  return {
    sendMailMock: sendMail,
    createTransportMock: vi.fn(() => ({
      sendMail
    }))
  };
});

vi.mock("nodemailer", () => ({
  default: {
    createTransport: createTransportMock
  }
}));

function buildConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 3001,
    host: "127.0.0.1",
    allowedDomainsPath: "config/allowed-domains.txt",
    sessionTtlDays: 30,
    loginCodeTtlMinutes: 120,
    debugCodesEnabled: true,
    debugToolsEnabled: true,
    dataDir: "/tmp/planning-poker-tests",
    databasePath: "/tmp/planning-poker-tests/test.db",
    deploymentConfigPath: "/tmp/planning-poker-tests/deployment.toml",
    managedBrandingDir: "/tmp/planning-poker-tests/managed-branding",
    appBaseUrl: "http://localhost:3001",
    simulatorModeEnabled: false,
    simulatorSharedSecret: "secret",
    demoModeEnabled: false,
    superAdminUsername: "platform-admin",
    superAdminPassword: "PlatformAdmin123!",
    superAdminDisplayName: "Platform Admin",
    branding: {
      loginLogo: "/branding/login-logo.svg",
      loginBackground: "/branding/login-background.svg",
      teamLogo: "/branding/team-logo.svg",
      teamBackground: "/branding/team-background.svg",
      avatarKeys: ["bear"],
      avatarIconKeys: ["bear"],
      avatarColorKeys: ["azure"],
      backgroundOpacity: 0.18,
      footerCreatorText: "",
      footerCompanyText: "",
      palette: {
        primaryAction: "#3a88ff",
        accentHighlight: "#ffc857",
        surfaceTint: "#f4f7fb",
        textEmphasis: "#223247"
      }
    },
    defaultHistoryTimezoneKeys: [...DEFAULT_HISTORY_TIME_ZONE_KEYS],
    ...overrides
  };
}

describe("Email sender", () => {
  beforeEach(() => {
    sendMailMock.mockClear();
    createTransportMock.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses nodemailer SMTP transport for login-code delivery when SMTP is configured", async () => {
    const config = buildConfig({
      smtpHost: "smtp.example.com",
      smtpPort: 587,
      smtpUser: "mailer",
      smtpPass: "smtp-secret",
      smtpFrom: "planning-poker@example.com"
    });
    const sender = createEmailSender(() => config);

    const result = await sender.sendLoginCode("user@example.com", "1234567890123456");

    expect(result).toEqual({ mode: "smtp" });
    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      host: "smtp.example.com",
      port: 587,
      secure: false,
      auth: {
        user: "mailer",
        pass: "smtp-secret"
      }
    });
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "planning-poker@example.com",
        to: "user@example.com",
        subject: "Your OPA Voting Tool sign-in code"
      })
    );
  });

  it("uses SMTP delivery for replacement passwords when SMTP is configured", async () => {
    const config = buildConfig({
      smtpHost: "smtp.example.com",
      smtpPort: 465,
      smtpFrom: "planning-poker@example.com"
    });
    const sender = createEmailSender(() => config);

    const result = await sender.sendPasswordResetPassword("user@example.com", "TempPass123!");

    expect(result).toEqual({ mode: "smtp" });
    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      host: "smtp.example.com",
      port: 465,
      secure: true,
      auth: undefined
    });
    expect(sendMailMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to manual-share invitation mode when SMTP is not configured", async () => {
    const sender = createEmailSender(() => buildConfig());

    const result = await sender.sendTeamInvitation("user@example.com", "Team Example", "TempPass123!");

    expect(result).toEqual({ mode: "manual-share" });
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
  });
});
