// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import { randomUUID } from "node:crypto";
import type { AppConfig } from "./types.js";
import type { DeploymentConfigManager, JiraSelectableSite } from "./deploymentConfig.js";

type PendingAuthorization = {
  userId: string;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  sites: JiraSelectableSite[];
  createdAt: number;
};

type JiraTokenExchangeResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
};

type JiraAccessibleResource = {
  id: string;
  url: string;
  name: string;
  scopes?: string[];
};

type JiraProjectResponse = {
  id: string;
  key: string;
  name: string;
};

type JiraSearchResponse = {
  issues?: Array<{
    id: string;
    key: string;
    fields?: {
      summary?: string | null;
    };
  }>;
  errorMessages?: string[];
  errors?: Record<string, string>;
};

export type JiraImportedIssue = {
  externalIssueId: string;
  issueKey: string;
  title: string;
};

function plusSeconds(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function buildIssueDisplayTitle(issueKey: string, title: string): string {
  return `${issueKey} - ${title}`.trim();
}

export class JiraCloudService {
  private readonly pendingAuthorizations = new Map<string, PendingAuthorization>();
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly deploymentConfigManager: DeploymentConfigManager,
    fetchImpl: typeof fetch = fetch
  ) {
    this.fetchImpl = fetchImpl;
  }

  getConnectionStatus(config: AppConfig) {
    return {
      clientId: config.jiraClientId ?? "",
      clientSecretConfigured: Boolean(config.jiraClientSecret),
      connected: Boolean(config.jiraCloudId && config.jiraSiteUrl && config.jiraRefreshToken),
      siteUrl: config.jiraSiteUrl ?? null,
      siteName: config.jiraSiteName ?? null,
      cloudId: config.jiraCloudId ?? null
    };
  }

  startAuthorization(userId: string, config: AppConfig): string {
    if (!config.jiraClientId || !config.jiraClientSecret) {
      throw new Error("Configure the Jira Cloud client ID and client secret first.");
    }

    this.deploymentConfigManager.clearPendingJiraSites();
    const state = randomUUID();
    this.pendingAuthorizations.set(state, {
      userId,
      accessToken: "",
      refreshToken: "",
      accessTokenExpiresAt: "",
      sites: [],
      createdAt: Date.now()
    });

    const params = new URLSearchParams({
      audience: "api.atlassian.com",
      client_id: config.jiraClientId,
      scope: "read:jira-work offline_access",
      redirect_uri: this.getRedirectUri(config),
      state,
      response_type: "code",
      prompt: "consent"
    });
    return `https://auth.atlassian.com/authorize?${params.toString()}`;
  }

  async handleCallback(config: AppConfig, code: string, state: string): Promise<{ connected: boolean; pendingSiteSelection: boolean }> {
    const pending = this.pendingAuthorizations.get(state);
    if (!pending) {
      throw new Error("Jira authorization state is invalid or has expired.");
    }

    const token = await this.exchangeAuthorizationCode(config, code);
    const sites = await this.fetchAccessibleSites(token.access_token);
    if (!sites.length) {
      this.pendingAuthorizations.delete(state);
      throw new Error("The authorized Jira account does not expose any accessible Jira Cloud sites.");
    }

    if (sites.length === 1) {
      await this.connectSite(config, token.access_token, token.refresh_token ?? "", token.expires_in, sites[0]!);
      this.pendingAuthorizations.delete(state);
      return {
        connected: true,
        pendingSiteSelection: false
      };
    }

    this.pendingAuthorizations.set(state, {
      ...pending,
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? "",
      accessTokenExpiresAt: plusSeconds(token.expires_in),
      sites
    });
    this.deploymentConfigManager.setPendingJiraSites(sites);
    return {
      connected: false,
      pendingSiteSelection: true
    };
  }

  async selectPendingSite(userId: string, config: AppConfig, cloudId: string): Promise<void> {
    const pending = [...this.pendingAuthorizations.values()].find((entry) => entry.userId === userId);
    if (!pending) {
      throw new Error("There is no pending Jira site selection.");
    }

    const site = pending.sites.find((candidate) => candidate.cloudId === cloudId);
    if (!site) {
      throw new Error("The selected Jira Cloud site is no longer available.");
    }

    await this.connectSite(
      config,
      pending.accessToken,
      pending.refreshToken,
      Math.max(60, Math.round((new Date(pending.accessTokenExpiresAt).getTime() - Date.now()) / 1000)),
      site
    );

    for (const [state, entry] of this.pendingAuthorizations.entries()) {
      if (entry.userId === userId) {
        this.pendingAuthorizations.delete(state);
      }
    }
  }

  disconnect(): void {
    this.deploymentConfigManager.clearPendingJiraSites();
    this.deploymentConfigManager.updateConfig({
      jira: {
        cloudId: "",
        siteUrl: "",
        siteName: "",
        accessToken: "",
        refreshToken: "",
        accessTokenExpiresAt: ""
      }
    });
  }

  async importIssues(config: AppConfig, source: { projectKey: string; jql: string | null | undefined }): Promise<JiraImportedIssue[]> {
    const connection = await this.ensureConnected(config);
    const project = await this.fetchProject(connection, source.projectKey);
    const jql = source.jql?.trim()
      ? `project = "${project.key}" AND (${source.jql.trim()})`
      : `project = "${project.key}" ORDER BY Rank ASC`;

    const response = await this.fetchJira<JiraSearchResponse>(connection, "/rest/api/3/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        jql,
        maxResults: 50,
        fields: ["summary"]
      })
    });

    if (response.errorMessages?.length) {
      throw new Error(`Jira search failed: ${response.errorMessages.join(" ")}`);
    }

    return (response.issues ?? [])
      .filter((issue) => issue.id && issue.key && issue.fields?.summary)
      .map((issue) => ({
        externalIssueId: issue.id,
        issueKey: issue.key,
        title: String(issue.fields?.summary ?? "").trim()
      }))
      .filter((issue) => issue.title.length > 0);
  }

  getIssueDisplayTitle(issueKey: string, title: string): string {
    return buildIssueDisplayTitle(issueKey, title);
  }

  private getRedirectUri(config: AppConfig): string {
    return `${config.appBaseUrl.replace(/\/$/, "")}/api/admin/jira/oauth/callback`;
  }

  private async connectSite(
    config: AppConfig,
    accessToken: string,
    refreshToken: string,
    expiresInSeconds: number,
    site: JiraSelectableSite
  ): Promise<void> {
    if (!refreshToken) {
      throw new Error("Jira Cloud did not return a refresh token. Make sure offline access is granted.");
    }
    this.deploymentConfigManager.clearPendingJiraSites();
    this.deploymentConfigManager.updateConfig({
      jira: {
        cloudId: site.cloudId,
        siteUrl: site.siteUrl,
        siteName: site.siteName,
        accessToken,
        refreshToken,
        accessTokenExpiresAt: plusSeconds(expiresInSeconds)
      }
    });
  }

  private async ensureConnected(config: AppConfig): Promise<{
    cloudId: string;
    accessToken: string;
    siteUrl: string;
    siteName: string;
  }> {
    if (!config.jiraClientId || !config.jiraClientSecret || !config.jiraCloudId || !config.jiraRefreshToken || !config.jiraSiteUrl) {
      throw new Error("Jira Cloud is not connected yet.");
    }

    let accessToken = config.jiraAccessToken ?? "";
    const expiresAtMs = config.jiraAccessTokenExpiresAt ? new Date(config.jiraAccessTokenExpiresAt).getTime() : 0;
    if (!accessToken || !Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now() + 30_000) {
      const refreshed = await this.refreshAccessToken(config);
      accessToken = refreshed.access_token;
      this.deploymentConfigManager.updateConfig({
        jira: {
          accessToken: refreshed.access_token,
          refreshToken: refreshed.refresh_token ?? config.jiraRefreshToken,
          accessTokenExpiresAt: plusSeconds(refreshed.expires_in)
        }
      });
    }

    return {
      cloudId: config.jiraCloudId,
      accessToken,
      siteUrl: config.jiraSiteUrl,
      siteName: config.jiraSiteName ?? config.jiraSiteUrl
    };
  }

  private async exchangeAuthorizationCode(config: AppConfig, code: string): Promise<JiraTokenExchangeResponse> {
    if (!config.jiraClientId || !config.jiraClientSecret) {
      throw new Error("Configure the Jira Cloud client ID and client secret first.");
    }
    return this.postTokenRequest({
      grant_type: "authorization_code",
      client_id: config.jiraClientId,
      client_secret: config.jiraClientSecret,
      code,
      redirect_uri: this.getRedirectUri(config)
    });
  }

  private async refreshAccessToken(config: AppConfig): Promise<JiraTokenExchangeResponse> {
    if (!config.jiraClientId || !config.jiraClientSecret || !config.jiraRefreshToken) {
      throw new Error("Jira Cloud is not connected yet.");
    }
    return this.postTokenRequest({
      grant_type: "refresh_token",
      client_id: config.jiraClientId,
      client_secret: config.jiraClientSecret,
      refresh_token: config.jiraRefreshToken
    });
  }

  private async postTokenRequest(body: Record<string, string>): Promise<JiraTokenExchangeResponse> {
    const response = await this.fetchImpl("https://auth.atlassian.com/oauth/token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`Jira Cloud token exchange failed (${response.status}).`);
    }

    return (await response.json()) as JiraTokenExchangeResponse;
  }

  private async fetchAccessibleSites(accessToken: string): Promise<JiraSelectableSite[]> {
    const response = await this.fetchImpl("https://api.atlassian.com/oauth/token/accessible-resources", {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      throw new Error(`Could not load Jira Cloud sites (${response.status}).`);
    }

    const resources = (await response.json()) as JiraAccessibleResource[];
    return resources
      .filter((resource) => resource.id && resource.url && resource.name)
      .filter((resource) => !resource.scopes || resource.scopes.some((scope) => scope.includes("jira")))
      .map((resource) => ({
        cloudId: resource.id,
        siteUrl: resource.url,
        siteName: resource.name
      }));
  }

  private async fetchProject(
    connection: { cloudId: string; accessToken: string },
    projectKey: string
  ): Promise<JiraProjectResponse> {
    const normalizedKey = projectKey.trim();
    if (!normalizedKey) {
      throw new Error("A Jira project key is required.");
    }
    return this.fetchJira<JiraProjectResponse>(connection, `/rest/api/3/project/${encodeURIComponent(normalizedKey)}`);
  }

  private async fetchJira<T>(
    connection: { cloudId: string; accessToken: string },
    path: string,
    init?: RequestInit
  ): Promise<T> {
    const response = await this.fetchImpl(`https://api.atlassian.com/ex/jira/${connection.cloudId}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${connection.accessToken}`,
        ...(init?.headers ?? {})
      }
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Jira Cloud request failed (${response.status})${text ? `: ${text}` : "."}`);
    }

    return (await response.json()) as T;
  }
}
