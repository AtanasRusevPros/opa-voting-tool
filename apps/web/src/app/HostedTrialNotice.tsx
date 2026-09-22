// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import { TRIAL_WELCOME as welcome, trialWelcomeStart } from "@planning-poker/shared";

export function HostedTrialNotice({ prominent = false, monthlyLimit = 80 }: { prominent?: boolean; monthlyLimit?: number }) {
  if (!prominent) return <p className="field-hint">
    <strong>{welcome.headline}</strong> {welcome.introduction} {welcome.hosting}{" "}
    <a href={welcome.repositoryUrl} target="_blank" rel="noreferrer">{welcome.invitation}</a>
  </p>;

  return <section className="trial-welcome" aria-labelledby="trial-welcome-title">
    <p className="trial-welcome-eyebrow">OPAVOTING · HOSTED TRIAL</p>
    <h1 id="trial-welcome-title">{welcome.landingTitle}</h1>
    <p className="trial-welcome-lead">{welcome.landingIntro}</p>
    <ol className="trial-welcome-steps">
      <li><strong>Start voting.</strong> {trialWelcomeStart(monthlyLimit)}</li>
      <li><strong>Know your data.</strong> {welcome.privacy}{" "}
        <a href="/public-trial/privacy">Privacy notice</a> · <a href="/public-trial/terms">Trial terms</a>
      </li>
      <li><strong>Make it yours.</strong> {welcome.selfHost}{" "}
        <a href={welcome.deploymentUrl}>Self-host OpaVoting ↗</a>
      </li>
      <li><strong>Help it grow.</strong> <a href={welcome.repositoryUrl}>{welcome.support}</a></li>
    </ol>
    <details className="trial-welcome-details">
      <summary>About this demo &amp; performance</summary>
      <p>{welcome.funding}</p>
      <p>Load-tested with <a href={welcome.benchmarkUrl}>400 concurrent simulated users across multiple teams</a>.</p>
    </details>
    <nav className="trial-welcome-links" aria-label="OpaVoting project resources">
      <a href={welcome.docsUrl}>Documentation</a>
      <a href={welcome.licenseUrl}>AGPL-3.0-or-later</a>
    </nav>
    <p className="trial-welcome-credit">Created by <strong>{welcome.author}</strong><br />
      <a href={welcome.repositoryUrl}>{welcome.repositoryName}</a>
    </p>
  </section>;
}

export type TrialWorkspaceView = {
  id: string; name: string; isOwner: boolean; revealedRounds: number; monthlyLimit: number;
  resetsAt: string; teams: Array<{ id: string; name: string }>;
};
