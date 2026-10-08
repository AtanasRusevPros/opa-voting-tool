// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useRef } from "react";
import { TRIAL_WELCOME as welcome, type BrandingManifest } from "@planning-poker/shared";
import { BrandFooter } from "./shared";

export function AboutDialog(props: { open: boolean; onClose: () => void; branding: BrandingManifest; trialModeEnabled: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (props.open) ref.current?.showModal();
    else ref.current?.close();
  }, [props.open]);
  return <dialog ref={ref} className="about-dialog" aria-labelledby="about-title" onCancel={props.onClose} onClick={event => { if (event.target === event.currentTarget) props.onClose(); }}>
    {props.open ? <><div className="modal-header"><h2 id="about-title">About OpaVoting</h2><button type="button" className="secondary-button" onClick={props.onClose}>Close</button></div>
    <div className="about-body">
      <p><strong>{welcome.headline}</strong></p><p>{welcome.introduction}</p><p>{welcome.statistics}</p><p>First-party activity statistics are shown as scoped aggregates to admins. {props.trialModeEnabled ? "Hosted-trial statistics are retained for 31 days." : "Self-hosted statistics have no automatic expiry; explicit account/workspace deletion still applies."}</p>
      {props.trialModeEnabled ? <><p>{welcome.hosting}</p><p>Hosted-trial quotas apply per workspace. See <a href="/public-trial/terms">Trial terms</a> and <a href="/public-trial/privacy">Privacy notice</a>.</p></> : <p>Self-hosted capacity depends on your server and workload.</p>}
      <nav className="trial-welcome-links" aria-label="Project resources">
        <a href={welcome.repositoryUrl}>Source on GitHub</a><a href={welcome.deploymentUrl}>Self-hosting guide</a>
        <a href={welcome.docsUrl}>Documentation</a><a href={welcome.benchmarkUrl}>Benchmark results</a>
        <a href={welcome.licenseUrl}>AGPL-3.0-or-later</a>
      </nav>
      <p>Created by {welcome.author} · <a href={welcome.repositoryUrl}>{welcome.repositoryName}</a> · Under Development</p>
      <BrandFooter branding={props.branding} />
    </div></> : null}
  </dialog>;
}
