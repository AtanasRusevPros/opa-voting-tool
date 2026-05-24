// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import nodemailer from "nodemailer";
import type { AppConfig } from "./types.js";

export interface EmailSender {
  sendLoginCode(email: string, code: string): Promise<{ mode: "smtp" | "fallback-log" }>;
  sendTeamInvitation(email: string, teamName: string, temporaryPassword: string): Promise<{ mode: "smtp" | "manual-share" }>;
  sendPlatformAccessAdmission(email: string, temporaryPassword: string): Promise<{ mode: "smtp" | "manual-share" }>;
  sendPasswordResetPassword(email: string, temporaryPassword: string): Promise<{ mode: "smtp" | "manual-share" }>;
  sendTeamRemovalNotification(email: string, teamName: string): Promise<{ mode: "smtp" | "fallback-log" }>;
}

export function createEmailSender(getConfig: () => AppConfig): EmailSender {
  async function sendMailOrLog(input: {
    to: string;
    subject: string;
    text: string;
    fallbackLog: string;
  }): Promise<{ mode: "smtp" | "fallback-log" }> {
    const config = getConfig();
    if (config.smtpHost && config.smtpPort && config.smtpFrom) {
      const transport = nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpPort === 465,
        auth: config.smtpUser && config.smtpPass ? { user: config.smtpUser, pass: config.smtpPass } : undefined
      });
      await transport.sendMail({
        from: config.smtpFrom,
        to: input.to,
        subject: input.subject,
        text: input.text
      });
      return { mode: "smtp" };
    }

    console.log(input.fallbackLog);
    return { mode: "fallback-log" };
  }

  return {
    async sendLoginCode(email, code) {
      const config = getConfig();
      return sendMailOrLog({
        to: email,
        subject: "Your OPA Voting Tool sign-in code",
        text: `Your one-time 16-digit code is ${code}. It expires in ${config.loginCodeTtlMinutes} minutes.`,
        fallbackLog: `[dev-email] Login code for ${email}: ${code}`
      });
    },
    async sendTeamInvitation(email, teamName, temporaryPassword) {
      const config = getConfig();
      if (!config.smtpHost || !config.smtpPort || !config.smtpFrom) {
        return { mode: "manual-share" };
      }

      await sendMailOrLog({
        to: email,
        subject: `You were added to ${teamName}`,
        text: `You were added to ${teamName}. Your initial password is: ${temporaryPassword}. You can sign in at ${config.appBaseUrl}.`,
        fallbackLog: `[dev-email] Team invitation for ${email}: team=${teamName} password=${temporaryPassword}`
      });
      return { mode: "smtp" };
    },
    async sendPlatformAccessAdmission(email, temporaryPassword) {
      const config = getConfig();
      if (!config.smtpHost || !config.smtpPort || !config.smtpFrom) {
        return { mode: "manual-share" };
      }

      await sendMailOrLog({
        to: email,
        subject: "Your OPA Voting Tool account is ready",
        text: `Your OPA Voting Tool account is now ready. Your initial password is: ${temporaryPassword}. You can sign in at ${config.appBaseUrl}. Please save the password somewhere secure and change it from Account settings afterwards.`,
        fallbackLog: `[dev-email] Platform access admitted for ${email}: password=${temporaryPassword}`
      });
      return { mode: "smtp" };
    },
    async sendPasswordResetPassword(email, temporaryPassword) {
      const config = getConfig();
      if (!config.smtpHost || !config.smtpPort || !config.smtpFrom) {
        return { mode: "manual-share" };
      }

      await sendMailOrLog({
        to: email,
        subject: "Your OPA Voting Tool password was reset",
        text: `A new password has been generated for your OPA Voting Tool account: ${temporaryPassword}. You can sign in at ${config.appBaseUrl} and change it from Account settings afterwards.`,
        fallbackLog: `[dev-email] Password reset for ${email}: password=${temporaryPassword}`
      });
      return { mode: "smtp" };
    },
    async sendTeamRemovalNotification(email, teamName) {
      return sendMailOrLog({
        to: email,
        subject: `Removed from ${teamName}`,
        text: `You were removed from ${teamName}.`,
        fallbackLog: `[dev-email] Team removal notice for ${email}: team=${teamName}`
      });
    }
  };
}
