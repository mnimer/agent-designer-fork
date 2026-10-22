/**
 * GCP Resource Discovery Manager for Visual Studio Code Agent Flow Builder
 *
 * Provides dynamic discovery of Google Cloud resources (Pub/Sub topics,
 * Pub/Sub subscriptions, and IAM Service Accounts) using the Google Cloud SDK
 * (`gcloud pubsub topics list`, `gcloud pubsub subscriptions list`, and
 * `gcloud iam service-accounts list`).
 * Implements in-memory caching and resilient fallback to built-in presets
 * when offline or when gcloud credentials are unavailable.
 *
 * Architectural Decisions:
 * 1. Multi-Path gcloud Resolution: Scans common Google Cloud SDK installation paths,
 *    macOS Homebrew, Linux packages, and system PATH to discover the `gcloud` CLI.
 * 2. In-Memory Caching: Caches topics, subscriptions, and service accounts per project
 *    for 10 minutes to prevent redundant CLI subprocess invocations.
 * 3. Resilient Fallback: If `gcloud` is not installed, unauthenticated, or the network times out,
 *    it gracefully falls back to static presets without interrupting the UI.
 * 4. Data Transformation: Normalizes raw JSON outputs into strongly typed models
 *    for consumption by webview trigger inspector panels.
 *
 * Author: Mike Nimer <mikenimer@google.com>
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as https from 'https';
import * as os from 'os';
import * as path from 'path';
import { ModelArmorTemplateItem, GeminiEnterpriseAppItem, ModelCatalogItem } from '../shared/types';
import {
  DEFAULT_MODEL_GARDEN_CATALOG,
  deduplicateModelGardenCatalog,
} from '../webview/data/modelCatalog';

export type { ModelArmorTemplateItem, GeminiEnterpriseAppItem, ModelCatalogItem };

export interface ModelGardenModelsResult {
  models: ModelCatalogItem[];
  source: 'gcloud' | 'fallback';
  projectId?: string;
}

export interface ModelGardenEnableResult {
  success: boolean;
  modelId: string;
  publisherModel?: string;
  enabled: boolean;
  verified?: boolean;
  consoleUrl?: string;
  source: 'gcloud' | 'fallback';
  error?: string;
}

export interface PubSubTopicItem {
  name: string;
  shortName: string;
  projectId?: string;
}

export interface PubSubSubscriptionItem {
  name: string;
  shortName: string;
  topic: string;
  pushEndpoint?: string;
  ackDeadlineSeconds?: number;
}

export interface GcpServiceAccountItem {
  email: string;
  displayName: string;
  name?: string;
  disabled?: boolean;
}

export interface PubSubTopicsResult {
  topics: PubSubTopicItem[];
  source: 'gcloud' | 'fallback';
  projectId?: string;
}

export interface PubSubSubscriptionsResult {
  subscriptions: PubSubSubscriptionItem[];
  source: 'gcloud' | 'fallback';
  projectId?: string;
}

export interface ServiceAccountsResult {
  serviceAccounts: GcpServiceAccountItem[];
  source: 'gcloud' | 'fallback';
  projectId?: string;
}

export interface ModelArmorTemplatesResult {
  templates: ModelArmorTemplateItem[];
  source: 'gcloud' | 'fallback';
  projectId?: string;
  location?: string;
}

export interface GeminiEnterpriseAppsResult {
  apps: GeminiEnterpriseAppItem[];
  source: 'gcloud' | 'fallback';
  projectId?: string;
  location?: string;
}

/**
 * Built-in fallback catalog of Model Armor Templates (`modelarmor.googleapis.com`).
 * Only includes "Enterprise Baseline (Managed Default)", which is provisioned automatically by our Terraform/Makefile.
 */
export const DEFAULT_MODEL_ARMOR_TEMPLATES_FALLBACK: ModelArmorTemplateItem[] = [
  {
    id: 'enterprise-baseline',
    templateId: 'enterprise-baseline',
    name: 'projects/my-gcp-project/locations/us-central1/templates/enterprise-baseline',
    displayName: 'Enterprise Baseline (Managed Default)',
    description: 'Prompt Injection, Jailbreak, DLP PII De-identification, Malicious URI & CSAM filters enabled',
    isDefault: true,
  },
];

/**
 * Fallback catalog of Gemini Enterprise Apps (`discoveryengine.googleapis.com`).
 * Empty by default — never populate fake apps when a project has no Gemini Enterprise Apps.
 */
export const DEFAULT_GEMINI_ENTERPRISE_APPS_FALLBACK: GeminiEnterpriseAppItem[] = [];

/**
 * Built-in fallback catalog of Pub/Sub topics.
 */
export const DEFAULT_PUBSUB_TOPICS_FALLBACK: PubSubTopicItem[] = [
  { name: 'projects/my-gcp-project/topics/agent-tasks', shortName: 'agent-tasks', projectId: 'my-gcp-project' },
  { name: 'projects/my-gcp-project/topics/order-events', shortName: 'order-events', projectId: 'my-gcp-project' },
  { name: 'projects/my-gcp-project/topics/data-stream', shortName: 'data-stream', projectId: 'my-gcp-project' },
  { name: 'projects/my-gcp-project/topics/customer-feedback', shortName: 'customer-feedback', projectId: 'my-gcp-project' },
  { name: 'projects/my-gcp-project/topics/document-ocr-intake', shortName: 'document-ocr-intake', projectId: 'my-gcp-project' },
];

/**
 * Built-in fallback catalog of Pub/Sub subscriptions.
 */
export const DEFAULT_PUBSUB_SUBSCRIPTIONS_FALLBACK: PubSubSubscriptionItem[] = [
  {
    name: 'projects/my-gcp-project/subscriptions/agent-tasks-sub',
    shortName: 'agent-tasks-sub',
    topic: 'projects/my-gcp-project/topics/agent-tasks',
    pushEndpoint: 'https://agent-service.run.app/pubsub',
  },
  {
    name: 'projects/my-gcp-project/subscriptions/order-events-sub',
    shortName: 'order-events-sub',
    topic: 'projects/my-gcp-project/topics/order-events',
  },
];

/**
 * Built-in fallback catalog of GCP IAM Service Accounts.
 */
export const DEFAULT_SERVICE_ACCOUNTS_FALLBACK: GcpServiceAccountItem[] = [
  {
    email: 'eventarc-agent-invoker@my-gcp-project.iam.gserviceaccount.com',
    displayName: 'EventArc Agent Invoker (Default)',
  },
  {
    email: 'agent-workflow-runner@my-gcp-project.iam.gserviceaccount.com',
    displayName: 'Agent Workflow Runner SA',
  },
  {
    email: 'cloud-run-agent-sa@my-gcp-project.iam.gserviceaccount.com',
    displayName: 'Cloud Run Agent Compute SA',
  },
  {
    email: 'bigquery-agent-invoker@my-gcp-project.iam.gserviceaccount.com',
    displayName: 'BigQuery Event Ingestion SA',
  },
  {
    email: 'storage-event-handler@my-gcp-project.iam.gserviceaccount.com',
    displayName: 'Cloud Storage Event Handler SA',
  },
  {
    email: 'pubsub-eventarc-bridge@my-gcp-project.iam.gserviceaccount.com',
    displayName: 'Pub/Sub Event Bridge SA',
  },
];

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export class GcpDiscoveryManager {
  private static instance: GcpDiscoveryManager | null = null;
  private cachedGcloudPath: string | null = null;

  private topicsCache: Map<string, { data: PubSubTopicItem[]; timestamp: number }> = new Map();
  private subsCache: Map<string, { data: PubSubSubscriptionItem[]; timestamp: number }> = new Map();
  private saCache: Map<string, { data: GcpServiceAccountItem[]; timestamp: number }> = new Map();
  private modelArmorCache: Map<string, { data: ModelArmorTemplateItem[]; timestamp: number }> = new Map();
  private geminiEnterpriseCache: Map<string, { data: GeminiEnterpriseAppItem[]; timestamp: number }> = new Map();

  private constructor() {}

  /**
   * Returns the singleton instance of GcpDiscoveryManager.
   */
  public static getInstance(): GcpDiscoveryManager {
    if (!GcpDiscoveryManager.instance) {
      GcpDiscoveryManager.instance = new GcpDiscoveryManager();
    }
    return GcpDiscoveryManager.instance;
  }

  /**
   * Resets singleton instance and caches (useful for unit testing).
   */
  public static resetInstance(): void {
    GcpDiscoveryManager.instance = null;
  }

  /**
   * Discovers and resolves the path to the gcloud executable across OS configurations.
   */
  public resolveGcloudPath(): string {
    if (this.cachedGcloudPath) {
      return this.cachedGcloudPath;
    }

    const homeDir = os.homedir();
    const candidatePaths: string[] = [
      // Common macOS Homebrew paths
      '/opt/homebrew/bin/gcloud',
      '/usr/local/bin/gcloud',
      // Common Google Cloud SDK tarball installations
      path.join(homeDir, 'google-cloud-sdk/bin/gcloud'),
      path.join(homeDir, 'Downloads/google-cloud-sdk/bin/gcloud'),
      // Linux distribution package paths
      '/usr/bin/gcloud',
      '/snap/bin/gcloud',
    ];

    for (const candidate of candidatePaths) {
      try {
        if (fs.existsSync(candidate)) {
          this.cachedGcloudPath = candidate;
          return candidate;
        }
      } catch {
        // Continue searching candidate paths
      }
    }

    // Default to PATH resolution
    this.cachedGcloudPath = 'gcloud';
    return 'gcloud';
  }

  /**
   * Fetches the list of Google Cloud Pub/Sub topics for a given project.
   */
  public async getPubSubTopics(projectId?: string, forceRefresh = false): Promise<PubSubTopicsResult> {
    const cacheKey = projectId || 'default';

    if (!forceRefresh) {
      const cached = this.topicsCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return {
          topics: cached.data,
          source: 'gcloud',
          projectId,
        };
      }
    }

    try {
      const gcloudBinary = this.resolveGcloudPath();
      const args = ['pubsub', 'topics', 'list', '--format=json'];
      if (projectId && projectId.trim().length > 0) {
        args.push(`--project=${projectId.trim()}`);
      }

      const stdout = await this.executeProcess(gcloudBinary, args, 10000);
      const rawTopics = JSON.parse(stdout);
      const topics = this.transformRawTopics(rawTopics);

      if (topics.length > 0) {
        this.topicsCache.set(cacheKey, { data: topics, timestamp: Date.now() });
        return {
          topics,
          source: 'gcloud',
          projectId,
        };
      }
    } catch {
      // Gracefully fall back on CLI error, network timeout, or offline environment
      this.topicsCache.set(cacheKey, { data: DEFAULT_PUBSUB_TOPICS_FALLBACK, timestamp: Date.now() });
    }

    return {
      topics: DEFAULT_PUBSUB_TOPICS_FALLBACK,
      source: 'fallback',
      projectId,
    };
  }

  /**
   * Fetches the list of Google Cloud Pub/Sub subscriptions for a given project.
   */
  public async getPubSubSubscriptions(projectId?: string, forceRefresh = false): Promise<PubSubSubscriptionsResult> {
    const cacheKey = projectId || 'default';

    if (!forceRefresh) {
      const cached = this.subsCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return {
          subscriptions: cached.data,
          source: 'gcloud',
          projectId,
        };
      }
    }

    try {
      const gcloudBinary = this.resolveGcloudPath();
      const args = ['pubsub', 'subscriptions', 'list', '--format=json'];
      if (projectId && projectId.trim().length > 0) {
        args.push(`--project=${projectId.trim()}`);
      }

      const stdout = await this.executeProcess(gcloudBinary, args, 10000);
      const rawSubs = JSON.parse(stdout);
      const subscriptions = this.transformRawSubscriptions(rawSubs);

      if (subscriptions.length > 0) {
        this.subsCache.set(cacheKey, { data: subscriptions, timestamp: Date.now() });
        return {
          subscriptions,
          source: 'gcloud',
          projectId,
        };
      }
    } catch {
      // Gracefully fall back on CLI error, network timeout, or offline environment
      this.subsCache.set(cacheKey, { data: DEFAULT_PUBSUB_SUBSCRIPTIONS_FALLBACK, timestamp: Date.now() });
    }

    return {
      subscriptions: DEFAULT_PUBSUB_SUBSCRIPTIONS_FALLBACK,
      source: 'fallback',
      projectId,
    };
  }

  /**
   * Fetches the list of Google Cloud IAM Service Accounts for a given project.
   */
  public async getServiceAccounts(projectId?: string, forceRefresh = false): Promise<ServiceAccountsResult> {
    const cacheKey = projectId || 'default';

    if (!forceRefresh) {
      const cached = this.saCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return {
          serviceAccounts: cached.data,
          source: 'gcloud',
          projectId,
        };
      }
    }

    try {
      const gcloudBinary = this.resolveGcloudPath();
      const args = ['iam', 'service-accounts', 'list', '--format=json'];
      if (projectId && projectId.trim().length > 0) {
        args.push(`--project=${projectId.trim()}`);
      }

      const stdout = await this.executeProcess(gcloudBinary, args, 10000);
      const rawAccounts = JSON.parse(stdout);
      const serviceAccounts = this.transformRawServiceAccounts(rawAccounts);

      if (serviceAccounts.length > 0) {
        this.saCache.set(cacheKey, { data: serviceAccounts, timestamp: Date.now() });
        return {
          serviceAccounts,
          source: 'gcloud',
          projectId,
        };
      }
    } catch {
      // Gracefully fall back on CLI error, network timeout, or offline environment
      this.saCache.set(cacheKey, { data: DEFAULT_SERVICE_ACCOUNTS_FALLBACK, timestamp: Date.now() });
    }

    return {
      serviceAccounts: DEFAULT_SERVICE_ACCOUNTS_FALLBACK,
      source: 'fallback',
      projectId,
    };
  }

  /**
   * Transforms raw Pub/Sub topic items from gcloud JSON into PubSubTopicItem objects.
   */
  public transformRawTopics(rawTopics: unknown): PubSubTopicItem[] {
    if (!Array.isArray(rawTopics)) {
      return [];
    }

    const results: PubSubTopicItem[] = [];
    for (const item of rawTopics) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      const fullName = typeof rec.name === 'string' ? rec.name.trim() : '';
      if (!fullName) continue;

      const segments = fullName.split('/');
      const shortName = segments[segments.length - 1] || fullName;
      const projId = segments.length >= 2 && segments[0] === 'projects' ? segments[1] : undefined;

      results.push({
        name: fullName,
        shortName,
        projectId: projId,
        labels: typeof rec.labels === 'object' && rec.labels ? (rec.labels as Record<string, string>) : undefined,
      });
    }

    return results.sort((a, b) => a.shortName.localeCompare(b.shortName));
  }

  /**
   * Transforms raw Pub/Sub subscription items from gcloud JSON into PubSubSubscriptionItem objects.
   */
  public transformRawSubscriptions(rawSubs: unknown): PubSubSubscriptionItem[] {
    if (!Array.isArray(rawSubs)) {
      return [];
    }

    const results: PubSubSubscriptionItem[] = [];
    for (const item of rawSubs) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      const fullName = typeof rec.name === 'string' ? rec.name.trim() : '';
      if (!fullName) continue;

      const segments = fullName.split('/');
      const shortName = segments[segments.length - 1] || fullName;
      const projId = segments.length >= 2 && segments[0] === 'projects' ? segments[1] : undefined;
      const topic = typeof rec.topic === 'string' ? rec.topic : undefined;
      const ackDeadlineSeconds = typeof rec.ackDeadlineSeconds === 'number' ? rec.ackDeadlineSeconds : undefined;

      results.push({
        name: fullName,
        shortName,
        topic,
        projectId: projId,
        ackDeadlineSeconds,
      });
    }

    return results.sort((a, b) => a.shortName.localeCompare(b.shortName));
  }

  /**
   * Transforms raw IAM service account items from gcloud JSON into GcpServiceAccountItem objects.
   */
  public transformRawServiceAccounts(rawAccounts: unknown): GcpServiceAccountItem[] {
    if (!Array.isArray(rawAccounts)) {
      return [];
    }

    const results: GcpServiceAccountItem[] = [];
    for (const item of rawAccounts) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      if (rec.disabled === true) continue;
      const email = typeof rec.email === 'string' ? rec.email.trim() : '';
      if (!email) continue;

      const displayName = typeof rec.displayName === 'string' && rec.displayName.trim()
        ? rec.displayName.trim()
        : email;

      results.push({
        email,
        displayName,
        name: typeof rec.name === 'string' ? rec.name : undefined,
        disabled: false,
      });
    }

    return results.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  /**
   * Fetches Model Armor templates for a given GCP project and location.
   * Always includes the managed "Enterprise Baseline (Managed Default)" template first.
   */
  public async getModelArmorTemplates(
    projectId?: string,
    location = 'us-central1',
    forceRefresh = false
  ): Promise<ModelArmorTemplatesResult> {
    const resolvedLocation = location && location !== 'global' ? location : 'us-central1';
    const cacheKey = `${projectId || 'default'}:${resolvedLocation}`;

    if (!forceRefresh) {
      const cached = this.modelArmorCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return {
          templates: cached.data,
          source: 'gcloud',
          projectId,
          location: resolvedLocation,
        };
      }
    }

    const baselineItem: ModelArmorTemplateItem = {
      id: 'enterprise-baseline',
      templateId: 'enterprise-baseline',
      name: `projects/${projectId || 'my-gcp-project'}/locations/${resolvedLocation}/templates/enterprise-baseline`,
      displayName: 'Enterprise Baseline (Managed Default)',
      location: resolvedLocation,
      description: 'Prompt Injection, Jailbreak, DLP PII De-identification, Malicious URI & CSAM filters enabled',
      isDefault: true,
    };

    try {
      const gcloudBinary = this.resolveGcloudPath();
      const args = ['model-armor', 'templates', 'list', `--location=${resolvedLocation}`, '--format=json'];
      if (projectId && projectId.trim().length > 0) {
        args.push(`--project=${projectId.trim()}`);
      }

      const stdout = await this.executeProcess(gcloudBinary, args, 10000);
      const rawTemplates = JSON.parse(stdout);
      const discovered = this.transformRawModelArmorTemplates(rawTemplates, resolvedLocation);
      const merged = [
        baselineItem,
        ...discovered.filter((t) => t.templateId !== 'enterprise-baseline'),
      ];

      this.modelArmorCache.set(cacheKey, { data: merged, timestamp: Date.now() });
      return {
        templates: merged,
        source: 'gcloud',
        projectId,
        location: resolvedLocation,
      };
    } catch {
      const fallback = DEFAULT_MODEL_ARMOR_TEMPLATES_FALLBACK.map((t) => ({
        ...t,
        location: resolvedLocation,
        name: `projects/${projectId || 'my-gcp-project'}/locations/${resolvedLocation}/templates/${t.templateId}`,
      }));
      this.modelArmorCache.set(cacheKey, { data: fallback, timestamp: Date.now() });
      return {
        templates: fallback,
        source: 'fallback',
        projectId,
        location: resolvedLocation,
      };
    }
  }

  /**
   * Transforms raw Model Armor template items from gcloud JSON into ModelArmorTemplateItem objects.
   * Always guarantees that `enterprise-baseline` ("Enterprise Baseline (Managed Default)") is included first.
   */
  public transformRawModelArmorTemplates(
    rawTemplates: unknown,
    defaultLocation = 'us-central1'
  ): ModelArmorTemplateItem[] {
    const baselineItem: ModelArmorTemplateItem = {
      id: 'enterprise-baseline',
      templateId: 'enterprise-baseline',
      name: `projects/my-gcp-project/locations/${defaultLocation}/templates/enterprise-baseline`,
      displayName: 'Enterprise Baseline (Managed Default)',
      location: defaultLocation,
      description: 'Prompt Injection, Jailbreak, DLP PII De-identification, Malicious URI & CSAM filters enabled',
      isDefault: true,
    };

    if (!Array.isArray(rawTemplates)) {
      return [baselineItem];
    }

    const results: ModelArmorTemplateItem[] = [];
    for (const item of rawTemplates) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      const fullName = typeof rec.name === 'string' ? rec.name.trim() : '';
      if (!fullName) continue;

      const segments = fullName.split('/');
      const id = segments[segments.length - 1] || fullName;
      if (id === 'enterprise-baseline') continue;
      const locIdx = segments.indexOf('locations');
      const location = locIdx >= 0 && segments[locIdx + 1] ? segments[locIdx + 1] : defaultLocation;
      const displayName =
        typeof rec.displayName === 'string' && rec.displayName.trim()
          ? rec.displayName.trim()
          : id;

      results.push({
        id,
        templateId: id,
        name: fullName,
        displayName,
        location,
        description: typeof rec.description === 'string' ? rec.description : undefined,
      });
    }

    results.sort((a, b) => a.displayName.localeCompare(b.displayName));
    return [baselineItem, ...results];
  }

  /**
   * Fetches Gemini Enterprise Apps (Discovery Engine engines) for a given GCP project and location.
   * Queries `discoveryengine.googleapis.com/v1alpha/projects/{project}/locations/{location}/collections/default_collection/engines`.
   * Returns an empty array `[]` when the project has no Gemini Enterprise Apps.
   */
  public async getGeminiEnterpriseApps(
    projectId?: string,
    location = 'global',
    forceRefresh = false
  ): Promise<GeminiEnterpriseAppsResult> {
    const resolvedLocation = location || 'global';
    const trimmedProject = projectId?.trim() || '';

    if (!trimmedProject) {
      return {
        apps: [],
        source: 'fallback',
        projectId,
        location: resolvedLocation,
      };
    }

    const cacheKey = `${trimmedProject}:${resolvedLocation}`;

    if (!forceRefresh) {
      const cached = this.geminiEnterpriseCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return {
          apps: cached.data,
          source: 'gcloud',
          projectId: trimmedProject,
          location: resolvedLocation,
        };
      }
    }

    try {
      const gcloudBinary = this.resolveGcloudPath();
      const tokenOut = await this.executeProcess(gcloudBinary, ['auth', 'print-access-token'], 6000);
      const accessToken = tokenOut.trim();
      if (!accessToken) {
        throw new Error('Empty access token from gcloud auth print-access-token');
      }

      const hostPrefix = resolvedLocation === 'global' ? '' : `${resolvedLocation}-`;
      const url = `https://${hostPrefix}discoveryengine.googleapis.com/v1alpha/projects/${encodeURIComponent(
        trimmedProject
      )}/locations/${encodeURIComponent(resolvedLocation)}/collections/default_collection/engines`;

      const rawBody = await this.fetchHttpsJson(url, accessToken, trimmedProject, 8000);
      const parsed = rawBody ? JSON.parse(rawBody) : {};
      const apps = this.transformRawGeminiEnterpriseApps(parsed, resolvedLocation);

      this.geminiEnterpriseCache.set(cacheKey, { data: apps, timestamp: Date.now() });
      return {
        apps,
        source: 'gcloud',
        projectId: trimmedProject,
        location: resolvedLocation,
      };
    } catch {
      this.geminiEnterpriseCache.set(cacheKey, { data: [], timestamp: Date.now() });
      return {
        apps: [],
        source: 'fallback',
        projectId: trimmedProject,
        location: resolvedLocation,
      };
    }
  }

  /**
   * Transforms raw Discovery Engine items (array or `{ engines: [...] }` response) into GeminiEnterpriseAppItem objects.
   */
  public transformRawGeminiEnterpriseApps(
    rawApps: unknown,
    defaultLocation = 'global'
  ): GeminiEnterpriseAppItem[] {
    const list: unknown[] = Array.isArray(rawApps)
      ? rawApps
      : rawApps && typeof rawApps === 'object' && Array.isArray((rawApps as Record<string, unknown>).engines)
      ? ((rawApps as Record<string, unknown>).engines as unknown[])
      : [];

    if (list.length === 0) {
      return [];
    }

    const results: GeminiEnterpriseAppItem[] = [];
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      const fullName = typeof rec.name === 'string' ? rec.name.trim() : '';
      if (!fullName) continue;

      const segments = fullName.split('/');
      const engineId = segments[segments.length - 1] || fullName;
      const locIdx = segments.indexOf('locations');
      const location = locIdx >= 0 && segments[locIdx + 1] ? segments[locIdx + 1] : defaultLocation;
      const displayName =
        typeof rec.displayName === 'string' && rec.displayName.trim()
          ? rec.displayName.trim()
          : engineId;

      results.push({
        engineId,
        name: fullName,
        displayName,
        location,
        solutionType: typeof rec.solutionType === 'string' ? rec.solutionType : undefined,
      });
    }

    return results.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  /**
   * Resolves the active GCP project ID from the provided parameter, environment variables,
   * or `gcloud config get-value project`.
   */
  public async resolveEffectiveProjectId(projectId?: string): Promise<string> {
    const trimmed = projectId?.trim();
    if (trimmed && trimmed !== 'my-gcp-ai-agents' && trimmed !== 'my-gcp-project') {
      return trimmed;
    }
    if (process.env.GOOGLE_CLOUD_PROJECT) {
      return process.env.GOOGLE_CLOUD_PROJECT.trim();
    }
    if (process.env.GCLOUD_PROJECT) {
      return process.env.GCLOUD_PROJECT.trim();
    }
    try {
      const gcloudBinary = this.resolveGcloudPath();
      const out = await this.executeProcess(gcloudBinary, ['config', 'get-value', 'project'], 4000);
      const proj = out.trim();
      if (proj && proj !== '(unset)') {
        return proj;
      }
    } catch {
      // Ignore
    }
    return trimmed || '';
  }

  /**
   * Fetches available models from Google Cloud Vertex AI Model Garden, merging live
   * publisher models with the built-in Model Garden catalog (Anthropic Claude, OpenAI,
   * Alibaba/Qwen, Meta Llama, Mistral, DeepSeek).
   * Note: `gcloud ai model-garden models list` requires `--billing-project=<PROJECT_ID>`
   * to satisfy the `aiplatform.googleapis.com` quota project requirement.
   */
  public async getModelGardenModels(
    projectId?: string,
    forceRefresh = false
  ): Promise<ModelGardenModelsResult> {
    const effectiveProject = await this.resolveEffectiveProjectId(projectId);
    try {
      const gcloudBinary = this.resolveGcloudPath();
      const args = ['ai', 'model-garden', 'models', 'list', '--format=json'];
      if (effectiveProject) {
        args.push(`--project=${effectiveProject}`);
        args.push(`--billing-project=${effectiveProject}`);
      }
      const stdout = await this.executeProcess(gcloudBinary, args, 10000);
      const rawList = JSON.parse(stdout);
      const discovered = this.transformRawModelGardenModels(rawList);
      if (discovered.length > 0) {
        const merged = deduplicateModelGardenCatalog([
          ...DEFAULT_MODEL_GARDEN_CATALOG,
          ...discovered,
        ]);
        return {
          models: merged,
          source: 'gcloud',
          projectId: effectiveProject,
        };
      }
    } catch {
      // Gracefully fall back to curated Vertex AI Model Garden catalog
    }

    return {
      models: deduplicateModelGardenCatalog(DEFAULT_MODEL_GARDEN_CATALOG),
      source: 'fallback',
      projectId: effectiveProject || projectId,
    };
  }

  /**
   * Transforms raw `gcloud ai model-garden models list` items into deduplicated ModelCatalogItem entries.
   */
  public transformRawModelGardenModels(rawModels: unknown): ModelCatalogItem[] {
    if (!Array.isArray(rawModels)) {
      return [];
    }

    const results: ModelCatalogItem[] = [];
    for (const item of rawModels) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      const fullName = typeof rec.name === 'string' ? rec.name.trim() : '';
      if (!fullName) continue;

      const segments = fullName.split('/');
      const shortModelId = segments[segments.length - 1] || fullName;
      const pubIdx = segments.indexOf('publishers');
      const rawPublisher = pubIdx >= 0 && segments[pubIdx + 1] ? segments[pubIdx + 1] : 'Vertex AI';
      const companyMap: Record<string, string> = {
        anthropic: 'Anthropic',
        openai: 'OpenAI',
        qwen: 'Alibaba / Qwen',
        meta: 'Meta',
        mistralai: 'Mistral AI',
        'deepseek-ai': 'DeepSeek',
        xai: 'xAI',
        google: 'Google',
      };
      const company = companyMap[rawPublisher.toLowerCase()] || rawPublisher;
      const displayName =
        typeof rec.displayName === 'string' && rec.displayName.trim()
          ? rec.displayName.trim()
          : shortModelId;

      // For MaaS open-weights models (qwen, deepseek-ai, meta, openai), prefix with publisher if needed
      const isMaas = shortModelId.endsWith('-maas');
      const canonicalId =
        isMaas && ['qwen', 'deepseek-ai', 'meta', 'openai'].includes(rawPublisher.toLowerCase())
          ? `${rawPublisher.toLowerCase()}/${shortModelId}`
          : shortModelId;

      results.push({
        id: canonicalId,
        name: displayName,
        company,
        description:
          typeof rec.description === 'string' && rec.description.trim()
            ? rec.description.trim()
            : `Vertex AI Model Garden (${fullName})`,
        source: 'model_garden',
        gardenPublisherModel: fullName,
      });
    }

    return deduplicateModelGardenCatalog(results);
  }

  /**
   * Builds the direct Google Cloud Console Vertex AI Model Garden URL for a specific publisher model
   * so the user can open the model card in their browser to accept the EULA / Partner Terms or enable the model.
   */
  public buildModelGardenConsoleUrl(
    publisherModel: string,
    modelId: string,
    projectId?: string
  ): string {
    const segments = (publisherModel || '').split('/');
    const pubIdx = segments.indexOf('publishers');
    const publisher =
      pubIdx >= 0 && segments[pubIdx + 1]
        ? segments[pubIdx + 1]
        : modelId.startsWith('claude-')
        ? 'anthropic'
        : modelId.includes('/')
        ? modelId.split('/')[0]
        : '';
    const rawSlug = segments[segments.length - 1] || modelId;
    const cleanModelSlug = rawSlug.split('@')[0];
    const query = projectId ? `?project=${encodeURIComponent(projectId)}` : '';

    if (publisher && cleanModelSlug) {
      return `https://console.cloud.google.com/vertex-ai/publishers/${encodeURIComponent(
        publisher
      )}/model-garden/${encodeURIComponent(cleanModelSlug)}${query}`;
    }
    return `https://console.cloud.google.com/vertex-ai/model-garden${query}`;
  }

  /**
   * Enables and verifies a model in GCP Vertex AI Model Garden when toggled ON in the Models Settings page.
   *
   * Two-step verification flow:
   * 1. Calls `POST https://us-central1-aiplatform.googleapis.com/v1beta1/projects/{project}/modelGardenEula:accept`
   *    with `{"publisherModel": "publishers/..."}` to accept the Model Garden EULA.
   * 2. Performs a live endpoint access probe against Vertex AI (`:rawPredict` for Anthropic partner models
   *    or `/endpoints/openapi/chat/completions` for MaaS models) to verify whether the GCP project actually
   *    has `ALLOW_PREDICTION` entitlement for the model.
   *    If a commercial partner model (e.g., Anthropic Claude) has not been procured/enabled in the GCP Console
   *    Model Garden for this project, returns `success: false, enabled: false` along with the Console URL
   *    so the UI toggle immediately reverts to OFF and shows a verification dialog.
   */
  public async enableModelGardenModel(
    modelId: string,
    publisherModel?: string,
    enabled = true,
    projectId?: string
  ): Promise<ModelGardenEnableResult> {
    const resolvedPublisher =
      publisherModel ||
      DEFAULT_MODEL_GARDEN_CATALOG.find((m) => m.id === modelId)?.gardenPublisherModel ||
      (modelId.startsWith('claude-')
        ? `publishers/anthropic/models/${modelId}`
        : modelId.includes('/')
        ? `publishers/${modelId.split('/')[0]}/models/${modelId.split('/')[1]}`
        : `publishers/google/models/${modelId}`);

    if (!enabled) {
      return {
        success: true,
        modelId,
        publisherModel: resolvedPublisher,
        enabled: false,
        source: 'gcloud',
      };
    }

    const effectiveProject = await this.resolveEffectiveProjectId(projectId);
    const consoleUrl = this.buildModelGardenConsoleUrl(
      resolvedPublisher,
      modelId,
      effectiveProject
    );

    try {
      const gcloudBinary = this.resolveGcloudPath();
      const tokenOut = await this.executeProcess(
        gcloudBinary,
        ['auth', 'print-access-token'],
        6000
      );
      const accessToken = tokenOut.trim();
      if (!accessToken || !effectiveProject) {
        return {
          success: false,
          modelId,
          publisherModel: resolvedPublisher,
          enabled: false,
          verified: false,
          consoleUrl,
          source: 'fallback',
          error:
            'Unable to verify Model Garden enablement: no active GCP project or gcloud access token found.',
        };
      }

      // Step 1: Accept Model Garden EULA via Vertex AI ModelGardenService REST API
      try {
        await this.postHttpsJson(
          `https://us-central1-aiplatform.googleapis.com/v1beta1/projects/${encodeURIComponent(
            effectiveProject
          )}/modelGardenEula:accept`,
          accessToken,
          effectiveProject,
          { publisherModel: resolvedPublisher },
          8000
        );
      } catch {
        // Partner models (e.g. Anthropic) may not use self-service EULA; proceed to live access probe
      }

      // Step 2: Verify actual prediction access on Vertex AI for this GCP project
      const verification = await this.verifyModelGardenEndpointAccess(
        modelId,
        resolvedPublisher,
        accessToken,
        effectiveProject
      );

      if (!verification.verified) {
        return {
          success: false,
          modelId,
          publisherModel: resolvedPublisher,
          enabled: false,
          verified: false,
          consoleUrl,
          source: 'gcloud',
          error:
            verification.error ||
            `Model "${modelId}" (${resolvedPublisher}) is not enabled in GCP project "${effectiveProject}". Please enable it in the Google Cloud Console Model Garden first.`,
        };
      }

      return {
        success: true,
        modelId,
        publisherModel: resolvedPublisher,
        enabled: true,
        verified: true,
        source: 'gcloud',
      };
    } catch (err: any) {
      return {
        success: false,
        modelId,
        publisherModel: resolvedPublisher,
        enabled: false,
        verified: false,
        consoleUrl,
        source: 'fallback',
        error:
          err?.message ||
          `Failed to verify or enable "${modelId}" in GCP Vertex AI Model Garden.`,
      };
    }
  }

  /**
   * Probes the live Vertex AI endpoint for a Model Garden model to confirm that the user's
   * GCP project actually has `ALLOW_PREDICTION` entitlement and regional availability.
   */
  public async verifyModelGardenEndpointAccess(
    modelId: string,
    publisherModel: string,
    accessToken: string,
    projectId: string
  ): Promise<{ verified: boolean; error?: string }> {
    const segments = publisherModel.split('/');
    const shortModelName = segments[segments.length - 1] || modelId;
    const pubIdx = segments.indexOf('publishers');
    const publisher = (pubIdx >= 0 && segments[pubIdx + 1] ? segments[pubIdx + 1] : '').toLowerCase();

    // Case 1: Anthropic Claude Partner Models on Vertex AI (:rawPredict)
    if (publisher === 'anthropic' || modelId.startsWith('claude-')) {
      const candidateLocations = ['global', 'us-east5', 'us-central1'];
      for (const loc of candidateLocations) {
        const host = loc === 'global' ? 'aiplatform.googleapis.com' : `${loc}-aiplatform.googleapis.com`;
        const url = `https://${host}/v1/projects/${encodeURIComponent(
          projectId
        )}/locations/${loc}/publishers/anthropic/models/${encodeURIComponent(
          shortModelName
        )}:rawPredict`;
        try {
          await this.postHttpsJson(
            url,
            accessToken,
            projectId,
            {
              anthropic_version: 'vertex-2023-10-16',
              max_tokens: 1,
              messages: [{ role: 'user', content: 'ping' }],
            },
            8000
          );
          return { verified: true };
        } catch {
          // Try next candidate region
        }
      }
      return {
        verified: false,
        error: `Anthropic model "${shortModelName}" (${publisherModel}) is not enabled for GCP project "${projectId}". Commercial partner models require enabling the model and accepting partner terms in the Google Cloud Console Model Garden before use.`,
      };
    }

    // Case 2: Open-Weights MaaS Models (Qwen, DeepSeek, OpenAI OSS, Meta Llama) via OpenAI-compatible endpoint
    const maasModelId = modelId.includes('/')
      ? modelId
      : publisher
      ? `${publisher}/${shortModelName}`
      : shortModelName;
    const candidateLocations =
      shortModelName.includes('deepseek-r1') || publisher === 'meta'
        ? ['us-central1', 'global', 'us-east5']
        : ['global', 'us-central1'];

    for (const loc of candidateLocations) {
      const host = loc === 'global' ? 'aiplatform.googleapis.com' : `${loc}-aiplatform.googleapis.com`;
      const url = `https://${host}/v1beta1/projects/${encodeURIComponent(
        projectId
      )}/locations/${loc}/endpoints/openapi/chat/completions`;
      try {
        await this.postHttpsJson(
          url,
          accessToken,
          projectId,
          {
            model: maasModelId,
            max_tokens: 1,
            messages: [{ role: 'user', content: 'ping' }],
          },
          8000
        );
        return { verified: true };
      } catch {
        // Try next candidate location
      }
    }

    // Case 3: Mistral / Other Partner rawPredict endpoint
    if (publisher === 'mistralai') {
      for (const loc of ['us-central1', 'europe-west4', 'global']) {
        const host = loc === 'global' ? 'aiplatform.googleapis.com' : `${loc}-aiplatform.googleapis.com`;
        const url = `https://${host}/v1/projects/${encodeURIComponent(
          projectId
        )}/locations/${loc}/publishers/mistralai/models/${encodeURIComponent(
          shortModelName
        )}:rawPredict`;
        try {
          await this.postHttpsJson(
            url,
            accessToken,
            projectId,
            {
              model: shortModelName,
              max_tokens: 1,
              messages: [{ role: 'user', content: 'ping' }],
            },
            8000
          );
          return { verified: true };
        } catch {
          // Continue
        }
      }
    }

    return {
      verified: false,
      error: `Model "${modelId}" (${publisherModel}) is not enabled or accessible in GCP project "${projectId}". Enable this model in the Google Cloud Console Model Garden for project "${projectId}" first.`,
    };
  }

  /**
   * Performs an authenticated HTTPS POST request with a JSON payload to a Google Cloud API endpoint.
   */
  private postHttpsJson(
    url: string,
    accessToken: string,
    projectId: string,
    payload: Record<string, unknown>,
    timeoutMs = 8000
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const bodyStr = JSON.stringify(payload);
      const parsedUrl = new URL(url);
      const req = https.request(
        {
          hostname: parsedUrl.hostname,
          path: parsedUrl.pathname + parsedUrl.search,
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'X-Goog-User-Project': projectId,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(bodyStr),
            Accept: 'application/json',
          },
          timeout: timeoutMs,
        },
        (res) => {
          let resBody = '';
          res.on('data', (chunk) => {
            resBody += chunk.toString();
          });
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve(resBody);
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${resBody}`));
            }
          });
        }
      );

      req.on('timeout', () => {
        req.destroy(new Error(`HTTPS POST request timed out after ${timeoutMs}ms: ${url}`));
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.write(bodyStr);
      req.end();
    });
  }

  /**
   * Performs an authenticated HTTPS GET request to a Google Cloud API endpoint.
   */
  private fetchHttpsJson(
    url: string,
    accessToken: string,
    projectId: string,
    timeoutMs = 8000
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const req = https.get(
        url,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'X-Goog-User-Project': projectId,
            Accept: 'application/json',
          },
          timeout: timeoutMs,
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => {
            body += chunk.toString();
          });
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve(body);
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${body}`));
            }
          });
        }
      );

      req.on('timeout', () => {
        req.destroy(new Error(`HTTPS request timed out after ${timeoutMs}ms: ${url}`));
      });

      req.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Executes a subprocess with a strict timeout and captures standard output.
   */
  private executeProcess(command: string, args: string[], timeoutMs = 10000): Promise<string> {
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';

      const child = spawn(command, args, {
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`Process timed out after ${timeoutMs}ms: ${command} ${args.join(' ')}`));
      }, timeoutMs);

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Process exited with code ${code}: ${stderr || stdout}`));
        }
      });
    });
  }
}
