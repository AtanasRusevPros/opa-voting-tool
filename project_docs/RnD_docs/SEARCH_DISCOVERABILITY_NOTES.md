<!--
SPDX-FileCopyrightText: 2026 Atanas G. Rusev
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Search Discoverability Notes

Status: public-release planning note

Purpose: make OpaVoting easier to find without turning the README or docs into keyword-stuffed marketing copy.

## Main Search Intents

OpaVoting should be discoverable for two related audiences:

- People looking for an open-source voting tool, self-hosted voting app, realtime voting platform, team polling tool, or collaborative decision platform.
- People looking for Scrum planning poker, planning poker app, agile estimation tool, or planning poker for remote teams.

The public wording should keep voting-tool positioning primary while making Scrum planning poker clearly visible as the first mature use case.

## Repository-Level Actions

Now that the public repository exists:

- Use a clear GitHub repository description such as: `Open-source realtime voting tool and Scrum planning poker app for self-hosted team decisions.`
- Add GitHub topics such as `voting-tool`, `planning-poker`, `scrum`, `agile-estimation`, `realtime`, `self-hosted`, `open-source`, `collaboration`, `websocket`, `podman`, and `sqlite`.
- Add a clean social preview image after the screenshot/media pass.
- Keep README headings descriptive because search engines and AI assistants both use visible headings to understand the project.
- Keep the first `v0.1.0` tagged release discoverable so external sites have a stable page to link to.

Current status:
- GitHub description and topics above were applied to the public repository on 2026-05-25.
- Social preview remains deferred until screenshot/logo/media polish.

## Content Actions

- Keep the README first screen useful for humans: what it is, who it helps, why it is different, and how to run it.
- Keep the benchmark summary linked from the README so performance claims are evidence-backed.
- Add screenshots/GIFs later with generic demo data and descriptive alt text.
- Consider a short public announcement post explaining the two angles: `open-source realtime voting platform` and `Scrum planning poker as the first use case`.
- If a public demo/test server is added later, publish a clear demo page with terms, privacy notes, and safe example data.

## External Foundability Actions

Search ranking will depend heavily on links, usage, and trust signals outside the repository. Useful launch actions:

- Post the public release to relevant communities such as GitHub, Hacker News, Reddit communities for self-hosted software/agile/Scrum, and open-source directories where appropriate.
- Ask early users to star the repository and link to it from real blog posts, docs, or team tool lists if they find it useful.
- Create a concise project page later if the GitHub README becomes too dense.
- Use the same product name, tagline, and core keywords consistently across GitHub, package metadata, docs, and announcement posts.
- Avoid buying low-quality backlinks or producing thin SEO pages; search engines increasingly reward useful, trustworthy, people-first content.

## Current Public Wording Baseline

Recommended phrase:

> OpaVoting is an open-source realtime voting tool and Scrum planning poker app for self-hosted agile estimation, team polling, and collaborative decisions.

Use this idea consistently, but vary the wording naturally in README, roadmap, release notes, and announcements.

## Hosted-trial welcome and machine-readable discovery

When public-trial mode is enabled, the front page introduces OpaVoting, author
Atanas G. Rusev, and `AtanasRusevPros/opa-voting-tool`, with direct links to the
repository, self-hosting runbook, usage docs, benchmark evidence and GitHub stars.
The responsive welcome distinguishes the personally funded demo's quotas from the
self-hosted software's capacity; the supported claim is 400 concurrent simulated
users, with actual capacity depending on hardware and workload.

The API serves semantic welcome HTML at `/` and `/index.html` before JavaScript
runs, retaining the application bundle so sign-in remains interactive. Author metadata
and SoftwareSourceCode JSON-LD identify the official project and license. `/llms.txt`
is an additional plain-text directory of official source, deployment, usage, benchmark
and license resources, linked from the HTML head. It contains no account or deployment
secrets. It is a discovery aid, not a promise that an AI service will index or use it.
The raw welcome and guide are trial-only; self-hosted mode retains its normal front
page and returns 404 for `/llms.txt`. The local Vite development server renders the
React welcome; raw HTML injection is provided by the deployed API serving the build.

### Trial search metadata and sitemap

The trial welcome HTML includes a descriptive title, description, author, absolute canonical URL, matching Open Graph and Twitter summary metadata, and SoftwareSourceCode JSON-LD. These are delivered in the initial HTTP response to everyone, alongside real project and deployment links; crawlers need no JavaScript to discover them. Both `/` and `/index.html` identify the public root as canonical.

Trial `/robots.txt` allows normal crawling (including assets), discourages API crawling, and advertises `/sitemap.xml`. The XML sitemap lists only the public welcome page; it contains no user/team data or invented modification dates. Robots rules are crawler guidance, not access control. Authentication remains the security boundary.

The existing `[app].base_url` must be the public HTTPS origin, not localhost. The origin is used consistently in canonical, sharing metadata and sitemap URLs; incoming Host headers cannot alter it. Disabled trial mode preserves operator static robots/sitemap files and returns 404 when absent.

After deployment, inspect page source, fetch robots/sitemap, verify domain ownership in Google Search Console (DNS verification needs no app change), submit the sitemap, and inspect the homepage URL. Indexing/ranking and AI crawler adoption are not guaranteed. `/llms.txt` is an optional plain-text guide, not a Google indexing requirement. No tracking tags, SEO package, or invented verification token is needed.

References: [Google supported metadata](https://developers.google.com/search/docs/crawling-indexing/special-tags) and [sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap). Google ignores meta keywords; meaningful visible text and links remain central.

The brief trial welcome uses the same four-step copy in initial HTML and React, including the configured monthly round allowance and honest retention/deletion wording. Privacy and terms are ordinary links. Funding and benchmark evidence use native HTML details/summary, available without JavaScript. Project identity, repository, license and deployment documentation remain direct links; self-hosting instructions can be followed by people or AI assistants without promising a fixed deployment duration.
