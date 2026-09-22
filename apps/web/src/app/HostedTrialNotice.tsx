// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

export function HostedTrialNotice() {
  return <p className="field-hint">
    <strong>Free, open source, and built for demanding team workloads.</strong>{" "}
    OpaVoting is designed for lightweight, efficient realtime voting and has been load-tested
    with 400 concurrent simulated users across multiple teams. This hosted demo runs on a small
    server I personally fund; limits keep it available for everyone. For company-wide or ongoing
    use, self-host without hosted-demo limits—capacity depends on your server.{" "}
    <a href="https://github.com/AtanasRusevPros/opa-voting-tool#readme" target="_blank" rel="noreferrer">Source and easy self-hosting guide</a>.{" "}
    If you find OpaVoting useful, give the project a GitHub ⭐!
  </p>;
}

export type TrialWorkspaceView = {
  id: string; name: string; isOwner: boolean; revealedRounds: number; monthlyLimit: number;
  resetsAt: string; teams: Array<{ id: string; name: string }>;
};
