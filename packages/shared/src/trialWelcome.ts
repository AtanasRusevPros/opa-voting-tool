// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

/** Public project identity shared by the rendered welcome page and discovery text. */
export const TRIAL_WELCOME = {
  name: "OpaVoting",
  landingTitle: "Team voting, free and open source.",
  landingIntro: "Planning poker, polls, and team decisions. Lightweight realtime collaboration, built for demanding workloads.",
  privacy: "We store account and voting data to run the demo. You can delete your account; shared history and backups have retention exceptions.",
  selfHost: "Self-host without demo limits. Source code and deployment guides are ready for you or your AI assistant to follow.",
  support: "Find it useful? Give it a GitHub ⭐, share it, or contribute.",
  funding: "This demo runs on a small server I personally fund. Limits keep it available for everyone; self-hosted capacity depends on your server.",
  author: "Atanas G. Rusev",
  repositoryName: "AtanasRusevPros/opa-voting-tool",
  repositoryUrl: "https://github.com/AtanasRusevPros/opa-voting-tool",
  deploymentUrl: "https://github.com/AtanasRusevPros/opa-voting-tool/blob/main/project_docs/RnD_docs/FIRST_VPS_DEPLOYMENT_RUNBOOK.md",
  docsUrl: "https://github.com/AtanasRusevPros/opa-voting-tool/blob/main/project_docs/RnD_docs/USAGE.md",
  benchmarkUrl: "https://github.com/AtanasRusevPros/opa-voting-tool/blob/main/project_docs/RnD_docs/PUBLIC_BENCHMARK_SUMMARY.md",
  licenseUrl: "https://github.com/AtanasRusevPros/opa-voting-tool/blob/main/LICENSE",
  headline: "Free, open source, and built for demanding team workloads.",
  introduction: "OpaVoting is designed for lightweight, efficient realtime voting and has been load-tested with 400 concurrent simulated users across multiple teams. Self-hosting is straightforward, with source code and deployment documentation available on GitHub.",
  hosting: "This hosted demo runs on a small server I personally fund. Its usage limits keep it available for everyone. For company-wide or ongoing use, self-host without these demo limits—capacity depends on your server.",
  invitation: "If you find OpaVoting useful, give the project a GitHub ⭐!"
} as const;


export function trialWelcomeStart(monthlyLimit: number): string {
  return `Register, verify your email, create a team, and invite your colleagues. Your workspace includes ${monthlyLimit} voting rounds per calendar month (UTC).`;
}
