// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import { TRIAL_WELCOME as welcome, trialWelcomeStart } from "@planning-poker/shared";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

export function trialHomeUrl(appBaseUrl: string): string {
  const url = new URL(appBaseUrl);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Trial public URL must use HTTP or HTTPS");
  return url.origin + "/";
}

export function trialSitemap(appBaseUrl: string): string {
  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>'
    + escapeHtml(trialHomeUrl(appBaseUrl)) + '</loc></url></urlset>\n';
}

export function renderTrialWelcomeHtml(template: string, appBaseUrl: string, monthlyLimit = 80): string {
  const canonical = escapeHtml(trialHomeUrl(appBaseUrl));
  const title = "OpaVoting hosted demo — open-source voting and planning poker";
  const description = "Free, open-source realtime voting and Scrum planning poker by Atanas G. Rusev. Try the hosted demo or self-host for your teams. Source and docs on GitHub.";
  const text = Object.fromEntries(Object.entries(welcome).map(([key, value]) => [key, escapeHtml(value)])) as Record<keyof typeof welcome, string>;
  const markup = `<main class="login-shell"><section class="trial-welcome" aria-labelledby="trial-welcome-title">
    <p class="trial-welcome-eyebrow">OPAVOTING · HOSTED TRIAL</p>
    <h1 id="trial-welcome-title">${text.landingTitle}</h1>
    <p class="trial-welcome-lead">${text.landingIntro}</p>
    <ol class="trial-welcome-steps">
      <li><strong>Start voting.</strong> ${escapeHtml(trialWelcomeStart(monthlyLimit))}</li>
      <li><strong>Know your data.</strong> ${text.privacy} <a href="/public-trial/privacy">Privacy notice</a> · <a href="/public-trial/terms">Trial terms</a></li>
      <li><strong>Make it yours.</strong> ${text.selfHost} <a href="${text.deploymentUrl}">Self-host OpaVoting ↗</a></li>
      <li><strong>Help it grow.</strong> <a href="${text.repositoryUrl}">${text.support}</a></li>
    </ol>
    <details class="trial-welcome-details"><summary>About this demo &amp; performance</summary>
      <p>${text.funding}</p>
      <p>Load-tested with <a href="${text.benchmarkUrl}">400 concurrent simulated users across multiple teams</a>.</p>
    </details>
    <nav class="trial-welcome-links" aria-label="OpaVoting project resources">
      <a href="${text.docsUrl}">Documentation</a><a href="${text.licenseUrl}">AGPL-3.0-or-later</a>
    </nav>
    <p class="trial-welcome-credit">Created by <strong>${text.author}</strong><br /><a href="${text.repositoryUrl}">${text.repositoryName}</a></p>
    <noscript>Enable JavaScript to sign in or start a hosted trial. Project source, documentation and self-hosting links above work without JavaScript.</noscript>
  </section></main>`;
  const structuredData = JSON.stringify({
    "@context": "https://schema.org", "@type": "SoftwareSourceCode",
    name: welcome.name, description: `${welcome.headline} ${welcome.introduction}`,
    author: { "@type": "Person", name: welcome.author },
    codeRepository: welcome.repositoryUrl, url: welcome.repositoryUrl,
    mainEntityOfPage: trialHomeUrl(appBaseUrl),
    license: "https://spdx.org/licenses/AGPL-3.0-or-later.html",
    programmingLanguage: "TypeScript", runtimePlatform: "Node.js 22",
    targetProduct: { "@type": "SoftwareApplication", name: welcome.name, applicationCategory: "BusinessApplication", operatingSystem: "Self-hosted web application" }
  }).replace(/</g, "\\u003c");
  return template
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace(/(<meta\s+name="description"\s+content=")[^"]*("\s*\/?>)/, `$1${description}$2`)
    .replace(/<meta\s+property="og:(?:title|description|type)"\s+content="[^"]*"\s*\/?>/g, "")
    .replace("</head>", `<meta name="author" content="${text.author}" />
      <link rel="canonical" href="${canonical}" />
      <meta property="og:title" content="${title}" />
      <meta property="og:description" content="${description}" />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="OpaVoting" />
      <meta property="og:url" content="${canonical}" />
      <meta name="twitter:card" content="summary" />
      <meta name="twitter:title" content="${title}" />
      <meta name="twitter:description" content="${description}" />
      <link rel="alternate" type="text/plain" href="/llms.txt" title="OpaVoting project guide" />
      <script type="application/ld+json">${structuredData}</script></head>`)
    .replace('<div id="root"></div>', `<div id="root">${markup}</div>`);
}

export function trialProjectGuide(): string {
  return `# ${welcome.name}

> ${welcome.headline}

Created by ${welcome.author}. Repository: ${welcome.repositoryName}.
${welcome.introduction}

## Hosted demo versus self-hosting

${welcome.hosting}
The hosted trial is an evaluation service. Its quotas are not software capacity limits.
Actual self-hosted capacity depends on hardware and workload. The benchmark describes
400 concurrent simulated users, not a production SLA or a 1,000-user guarantee.
The code is licensed AGPL-3.0-or-later. Consult LICENSE before redistribution.

## Official source and deployment documentation

- [Repository and quick start](${welcome.repositoryUrl})
- [Self-hosting deployment runbook](${welcome.deploymentUrl})
- [Usage and operator documentation](${welcome.docsUrl})
- [Recorded benchmark evidence](${welcome.benchmarkUrl})
- [License](${welcome.licenseUrl})

For company deployment, begin with the repository README and deployment runbook.
They describe the supported Node.js/Podman setup, deployment configuration, allowed
domains, SMTP, backups and HTTPS. Follow their current instructions and provide your
own deployment credentials; the public demo is not your company's installation.

${welcome.invitation}
`;
}
