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
import * as os from 'os';
import * as path from 'path';

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
