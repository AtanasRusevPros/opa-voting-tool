// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { CSSProperties } from "react";
import { AVATAR_COLOR_KEYS, AVATAR_COLOR_SWATCHES, BRANDING_MANIFEST, type BrandingManifest } from "@planning-poker/shared";
import type { AuthStep } from "./types";
import { BrandFooter } from "./shared";
import { getAvatarUrl } from "./utils";

export function LoginScreen(props: {
  branding?: BrandingManifest;
  email: string;
  setEmail: (value: string) => void;
  adminUsername: string;
  setAdminUsername: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  confirmPassword: string;
  setConfirmPassword: (value: string) => void;
  displayName: string;
  setDisplayName: (value: string) => void;
  avatarIconKey: string;
  setAvatarIconKey: (value: string) => void;
  avatarColorKey: string;
  setAvatarColorKey: (value: string) => void;
  authStep: AuthStep;
  canUseEmailCode: boolean;
  code: string;
  setCode: (value: string) => void;
  onRequestCode: () => Promise<void>;
  onRequestAccess: () => Promise<void>;
  onForgotPassword: () => Promise<void>;
  onOpenAdminSignIn: () => void;
  onPasswordSignIn: () => Promise<void>;
  onAdminSignIn: () => Promise<void>;
  onBackToSignIn: () => void;
  onVerify: () => Promise<void>;
  debugCode: string | null;
  error: string | null;
  info: string | null;
}) {
  const branding = props.branding ?? BRANDING_MANIFEST;
  const canSubmitEmail = props.email.trim().length > 0;
  const canSubmitPassword = props.email.trim().length > 0 && props.password.trim().length >= 8;
  const canSubmitAdmin = props.adminUsername.trim().length >= 2 && props.password.trim().length >= 8;
  const canSubmitCode =
    props.code.trim().length === 16 &&
    props.displayName.trim().length >= 2 &&
    props.password.trim().length >= 8 &&
    props.password === props.confirmPassword;

  return (
    <div className="login-shell">
      <div
        className="login-backdrop"
        style={
          {
            ["--login-background-image" as string]: `url("${branding.loginBackground}")`,
            ["--brand-background-opacity" as string]: String(branding.backgroundOpacity),
            opacity: Math.max(0.55, Math.min(1, 0.55 + branding.backgroundOpacity))
          } as CSSProperties
        }
      />
      <form
        className="login-panel"
        onSubmit={(event) => {
          event.preventDefault();
          if (props.authStep === "signin") {
            if (canSubmitPassword) {
              void props.onPasswordSignIn();
            }
            return;
          }

          if (props.authStep === "admin") {
            if (canSubmitAdmin) {
              void props.onAdminSignIn();
            }
            return;
          }

          if (canSubmitCode) {
            void props.onVerify();
          }
        }}
        onKeyDownCapture={(event) => {
          const target = event.target as HTMLElement;
          if (props.authStep !== "code" || event.key !== "Enter") {
            return;
          }

          if (!target.closest(".avatar-picker") && !target.closest(".color-picker")) {
            return;
          }

          event.preventDefault();
          if (canSubmitCode) {
            void props.onVerify();
          }
        }}
      >
        <img className="brand-logo" src={branding.loginLogo} alt="OPA Voting Tool logo" />
        <h1>OPA Voting Tool</h1>
        <p>Realtime collaborative voting with team history, live reveal, and configurable decks.</p>
        <p className="login-note">This browser is remembered automatically for 3 months of activity.</p>

        <div className="field-stack">
          {props.authStep === "admin" ? (
            <label>
              Admin username
              <input
                value={props.adminUsername}
                onChange={(event) => props.setAdminUsername(event.target.value)}
                placeholder="platform-admin"
                autoComplete="username"
              />
            </label>
          ) : (
            <label>
              Email
              <input
                value={props.email}
                onChange={(event) => props.setEmail(event.target.value)}
                placeholder="name@company.com"
                autoComplete="email"
                readOnly={props.authStep === "code"}
              />
            </label>
          )}

          {props.authStep === "signin" ? (
            <label>
              Password
              <input
                type="password"
                value={props.password}
                onChange={(event) => props.setPassword(event.target.value)}
                placeholder="Your password"
                autoComplete="current-password"
              />
            </label>
          ) : null}

          {props.authStep === "admin" ? (
            <label>
              Admin password
              <input
                type="password"
                value={props.password}
                onChange={(event) => props.setPassword(event.target.value)}
                placeholder="Super-admin password"
                autoComplete="current-password"
              />
            </label>
          ) : null}

          {props.authStep === "code" ? (
            <>
              <label>
                16-digit code
                <input value={props.code} onChange={(event) => props.setCode(event.target.value)} placeholder="0000000000000000" autoComplete="one-time-code" />
              </label>
              <label>
                Display name
                <input
                  value={props.displayName}
                  onChange={(event) => props.setDisplayName(event.target.value)}
                  placeholder="How others see you"
                  autoComplete="nickname"
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={props.password}
                  onChange={(event) => props.setPassword(event.target.value)}
                  placeholder="Set or reset your password"
                  autoComplete="new-password"
                />
              </label>
              <label>
                Confirm password
                <input
                  type="password"
                  value={props.confirmPassword}
                  onChange={(event) => props.setConfirmPassword(event.target.value)}
                  placeholder="Repeat the password"
                  autoComplete="new-password"
                />
              </label>
              <div>
                <span className="label">Avatar icon</span>
                <div className="avatar-picker">
                  {branding.avatarIconKeys.map((avatar) => (
                    <button
                      key={avatar}
                      className={avatar === props.avatarIconKey ? "avatar-option selected" : "avatar-option"}
                      onClick={() => props.setAvatarIconKey(avatar)}
                      type="button"
                    >
                      <img src={getAvatarUrl(avatar, props.avatarColorKey)} alt={avatar} />
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="label">Avatar color</span>
                <div className="color-picker">
                  {AVATAR_COLOR_KEYS.map((colorKey) => (
                    <button
                      key={colorKey}
                      type="button"
                      className={colorKey === props.avatarColorKey ? "color-option selected" : "color-option"}
                      style={{ backgroundColor: AVATAR_COLOR_SWATCHES[colorKey] }}
                      aria-label={colorKey}
                      onClick={() => props.setAvatarColorKey(colorKey)}
                    />
                  ))}
                </div>
              </div>
            </>
          ) : null}
        </div>

        {props.error ? <div className="error-banner">{props.error}</div> : null}
        {props.info ? <div className="info-banner">{props.info}</div> : null}
        {props.debugCode ? <div className="debug-banner">Development code: {props.debugCode}</div> : null}

        {props.authStep === "admin" ? (
          <div className="login-actions-stack">
            <div className="button-row login-secondary-actions">
              <button className="secondary-button" type="button" onClick={props.onBackToSignIn}>
                Back
              </button>
            </div>
            <div className="button-row login-primary-actions">
              <button className="primary-button" type="submit" disabled={!canSubmitAdmin}>
                Admin sign in
              </button>
            </div>
          </div>
        ) : null}

        {props.authStep === "code" ? (
          <div className="login-actions-stack">
            <div className="button-row login-secondary-actions">
              <button className="secondary-button" type="button" onClick={props.onBackToSignIn}>
                Back
              </button>
              <button className="secondary-button" type="button" onClick={() => void props.onRequestCode()}>
                Resend code
              </button>
            </div>
            <div className="button-row login-primary-actions">
              <button className="primary-button" type="submit" disabled={!canSubmitCode}>
                Finish setup
              </button>
            </div>
          </div>
        ) : null}

        {props.authStep === "signin" ? (
          <div className="login-actions-stack">
            {!props.canUseEmailCode ? (
              <div className="field-hint">
                Email-code delivery is not configured here. Ask a team admin to add you and share your initial password, or request access below so the super-admin can prepare your account.
              </div>
            ) : null}
            <div className="button-row login-secondary-actions login-signin-actions">
              <button className="primary-button" type="submit" disabled={!canSubmitPassword}>
                Sign in
              </button>
              <button className="secondary-button" type="button" disabled={!canSubmitEmail} onClick={() => void props.onForgotPassword()}>
                Forgot password
              </button>
              <button className="secondary-button" type="button" disabled={!canSubmitEmail} onClick={() => void props.onRequestAccess()}>
                Request access
              </button>
              <button className="secondary-button" type="button" onClick={props.onOpenAdminSignIn}>
                Admin
              </button>
            </div>
          </div>
        ) : null}
        <BrandFooter branding={branding} />
      </form>
    </div>
  );
}
