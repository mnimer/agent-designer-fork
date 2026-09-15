/**
 * Eventarc Discovery Manager for Visual Studio Code Agent Flow Builder
 * 
 * Provides dynamic discovery of Google Cloud Eventarc event providers (services)
 * and CloudEvent schemas using the Google Cloud SDK (`gcloud eventarc providers list`).
 * Implements in-memory caching and resilient fallback to built-in provider catalogs
 * when offline or when gcloud credentials are unavailable.
 *
 * Architectural Decisions:
 * 1. Multi-Path gcloud Resolution: Scans common Google Cloud SDK installation paths,
 *    macOS Homebrew, Linux packages, and system PATH to discover the `gcloud` CLI.
 * 2. In-Memory Regional Caching: Caches provider manifests per GCP location for 10 minutes
 *    to prevent redundant CLI subprocess invocations.
 * 3. Resilient Fallback: If `gcloud` is not installed, unauthenticated, or the network times out,
 *    it gracefully falls back to the static enterprise catalog without interrupting the UI.
 * 4. Data Transformation: Normalizes raw Eventarc provider JSON into strongly typed
 *    `EventArcCategory` and `EventArcEventType` models with sanitized service IDs.
 *
 * Author: Mike Nimer <mikenimer@google.com>
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { EventArcCategory, EventArcEventType } from '../shared/types';

/**
 * Built-in fallback catalog of standard Google Cloud Eventarc services and CloudEvents.
 * Used when gcloud CLI is unavailable or offline.
 */
export const DEFAULT_EVENTARC_FALLBACK: EventArcCategory[] = [
  {
    id: 'bigquery',
    name: 'BigQuery',
    serviceName: 'bigquery.googleapis.com',
    events: [
      {
        id: 'TableCreate',
        name: 'TableCreate (InsertTable)',
        fullEvent: 'google.cloud.bigquery.v2.TableService.InsertTable',
        description: 'Fires when a new table or view is created in a dataset',
      },
      {
        id: 'TableUpdate',
        name: 'TableUpdate (PatchTable)',
        fullEvent: 'google.cloud.bigquery.v2.TableService.PatchTable',
        description: 'Fires when table metadata or schema is modified',
      },
      {
        id: 'JobComplete',
        name: 'JobComplete (InsertJob)',
        fullEvent: 'google.cloud.bigquery.v2.JobService.InsertJob',
        description: 'Fires upon query or data loading job termination',
      },
      {
        id: 'DatasetCreate',
        name: 'DatasetCreate (InsertDataset)',
        fullEvent: 'google.cloud.bigquery.v2.DatasetService.InsertDataset',
        description: 'Fires when a new BigQuery dataset is provisioned',
      },
    ],
  },
  {
    id: 'storage',
    name: 'Cloud Storage (GCS)',
    serviceName: 'storage.googleapis.com',
    events: [
      {
        id: 'ObjectFinalized',
        name: 'ObjectCreated (finalized)',
        fullEvent: 'google.cloud.storage.object.v1.finalized',
        description: 'Fires when a new object or document is uploaded to GCS bucket',
      },
      {
        id: 'ObjectDeleted',
        name: 'ObjectDeleted',
        fullEvent: 'google.cloud.storage.object.v1.deleted',
        description: 'Fires when an object or file is permanently deleted',
      },
      {
        id: 'ObjectArchived',
        name: 'ObjectArchived',
        fullEvent: 'google.cloud.storage.object.v1.archived',
        description: 'Fires when an object is moved to cold/archive storage tier',
      },
    ],
  },
  {
    id: 'firestore',
    name: 'Cloud Firestore',
    serviceName: 'firestore.googleapis.com',
    events: [
      {
        id: 'DocumentCreated',
        name: 'DocumentCreated',
        fullEvent: 'google.cloud.firestore.document.v1.created',
        description: 'Fires when a new document is written to a Firestore collection',
      },
      {
        id: 'DocumentUpdated',
        name: 'DocumentUpdated',
        fullEvent: 'google.cloud.firestore.document.v1.updated',
        description: 'Fires when an existing document undergoes attribute mutations',
      },
      {
        id: 'DocumentDeleted',
        name: 'DocumentDeleted',
        fullEvent: 'google.cloud.firestore.document.v1.deleted',
        description: 'Fires when a document is removed from Firestore database',
      },
    ],
  },
  {
    id: 'pubsub',
    name: 'Cloud Pub/Sub',
    serviceName: 'pubsub.googleapis.com',
    events: [
      {
        id: 'MessagePublished',
        name: 'MessagePublished',
        fullEvent: 'google.cloud.pubsub.topic.v1.messagePublished',
        description: 'Fires when a message is published to any monitored Pub/Sub topic',
      },
    ],
  },
  {
    id: 'securitycenter',
    name: 'Security Command Center (SCC)',
    serviceName: 'securitycenter.googleapis.com',
    events: [
      {
        id: 'FindingNotification',
        name: 'Finding Notification (SecOps Alert)',
        fullEvent: 'google.cloud.securitycenter.v1.NotificationMessage',
        description: 'Fires when an EDR detection, IOC match, or threat finding is raised by SecOps/SCC',
      },
      {
        id: 'MuteStateChanged',
        name: 'Finding Mute State Changed',
        fullEvent: 'google.cloud.securitycenter.v1.MuteStateChanged',
        description: 'Fires when a security finding status or mute state changes',
      },
    ],
  },
  {
    id: 'secretmanager',
    name: 'Secret Manager',
    serviceName: 'secretmanager.googleapis.com',
    events: [
      {
        id: 'SecretVersionAdded',
        name: 'SecretVersionAdded',
        fullEvent: 'google.cloud.secretmanager.v1.SecretVersion.Added',
        description: 'Fires when a new secret version or credential is added',
      },
      {
        id: 'SecretVersionDestroyed',
        name: 'SecretVersionDestroyed',
        fullEvent: 'google.cloud.secretmanager.v1.SecretVersion.Destroyed',
        description: 'Fires when a secret version is deactivated or destroyed',
      },
    ],
  },
  {
    id: 'cloudbuild',
    name: 'Cloud Build',
    serviceName: 'cloudbuild.googleapis.com',
    events: [
      {
        id: 'BuildStateChanged',
        name: 'BuildStateChanged',
        fullEvent: 'google.cloud.build.v1.Build.StateChanged',
        description: 'Fires when CI/CD container build changes status (SUCCESS/FAILURE)',
      },
    ],
  },
  {
    id: 'dataplex',
    name: 'Dataplex',
    serviceName: 'dataplex.googleapis.com',
    events: [
      {
        id: 'created',
        name: 'Entry Created / Resource Created',
        fullEvent: 'google.cloud.dataplex.v1.created',
        description: 'Fires when a new lake, zone, asset, or metadata entry is created',
      },
      {
        id: 'updated',
        name: 'Entry / Asset Updated',
        fullEvent: 'google.cloud.dataplex.v1.updated',
        description: 'Fires when a data lake asset or schema metadata is updated',
      },
      {
        id: 'deleted',
        name: 'Entry / Asset Deleted',
        fullEvent: 'google.cloud.dataplex.v1.deleted',
        description: 'Fires when a data lake asset or entry is deleted',
      },
    ],
  },
  {
    id: 'audit',
    name: 'Cloud Audit Logs',
    serviceName: 'cloudaudit.googleapis.com',
    events: [
      {
        id: 'AuditLogWritten',
        name: 'Audit Log Written',
        fullEvent: 'google.cloud.audit.log.v1.written',
        description: 'Fires upon administrative or data access security audit event logging',
      },
    ],
  },
];

export interface EventarcDiscoveryResult {
  categories: EventArcCategory[];
  source: 'gcloud' | 'fallback';
  location: string;
  error?: string;
}

export class EventarcDiscoveryManager {
  private static instance: EventarcDiscoveryManager | null = null;
  private cache: Map<string, { timestamp: number; data: EventArcCategory[] }> = new Map();
  private readonly CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache
  private resolvedGcloudPath: string | null = null;

  /**
   * Retrieves singleton instance of EventarcDiscoveryManager.
   */
  public static getInstance(): EventarcDiscoveryManager {
    if (!EventarcDiscoveryManager.instance) {
      EventarcDiscoveryManager.instance = new EventarcDiscoveryManager();
    }
    return EventarcDiscoveryManager.instance;
  }

  /**
   * Resets singleton instance (useful for unit testing).
   */
  public static resetInstance(): void {
    EventarcDiscoveryManager.instance = null;
  }

  /**
   * Resolves the executable path to the `gcloud` binary across standard SDK directories and PATH.
   */
  public resolveGcloudPath(): string {
    if (this.resolvedGcloudPath && (this.resolvedGcloudPath === 'gcloud' || fs.existsSync(this.resolvedGcloudPath))) {
      return this.resolvedGcloudPath;
    }

    const home = os.homedir();
    const candidatePaths = [
      path.join(home, 'Development', 'libraries', 'google-cloud-sdk', 'bin', 'gcloud'),
      path.join(home, 'google-cloud-sdk', 'bin', 'gcloud'),
      path.join(home, '.google-cloud-sdk', 'bin', 'gcloud'),
      path.join(home, 'Applications', 'google-cloud-sdk', 'bin', 'gcloud'),
      '/opt/homebrew/Caskroom/google-cloud-sdk/latest/google-cloud-sdk/bin/gcloud',
      '/opt/homebrew/bin/gcloud',
      '/usr/local/Caskroom/google-cloud-sdk/latest/google-cloud-sdk/bin/gcloud',
      '/usr/local/bin/gcloud',
      'C:\\Program Files (x86)\\Google\\Cloud SDK\\google-cloud-sdk\\bin\\gcloud.cmd',
      'C:\\Program Files\\Google\\Cloud SDK\\google-cloud-sdk\\bin\\gcloud.cmd',
    ];

    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        this.resolvedGcloudPath = p;
        return p;
      }
    }

    // Default to 'gcloud' in system PATH
    this.resolvedGcloudPath = 'gcloud';
    return 'gcloud';
  }

  /**
   * Queries Google Cloud Eventarc providers via gcloud CLI, with regional caching and fallback.
   *
   * @param location Target Google Cloud location (e.g. 'global', 'us-central1')
   * @param forceRefresh Set to true to bypass in-memory cache
   */
  public async getEventarcProviders(
    location: string = 'global',
    forceRefresh: boolean = false
  ): Promise<EventarcDiscoveryResult> {
    const loc = location || 'global';

    // 1. Check in-memory cache if not forcing refresh
    if (!forceRefresh) {
      const cached = this.cache.get(loc);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
        return {
          categories: cached.data,
          source: 'gcloud',
          location: loc,
        };
      }
    }

    // 2. Attempt to query gcloud CLI
    try {
      const gcloudBinary = this.resolveGcloudPath();
      const rawJson = await this.executeGcloudCommand(gcloudBinary, [
        'eventarc',
        'providers',
        'list',
        `--location=${loc}`,
        '--format=json',
      ]);

      const parsed = JSON.parse(rawJson);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const categories = this.transformRawProviders(parsed);
        if (categories.length > 0) {
          // Store in cache
          this.cache.set(loc, { timestamp: Date.now(), data: categories });
          return {
            categories,
            source: 'gcloud',
            location: loc,
          };
        }
      }

      // If output was empty, fallback
      return {
        categories: DEFAULT_EVENTARC_FALLBACK,
        source: 'fallback',
        location: loc,
      };
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      // Fallback cleanly to static definitions
      return {
        categories: DEFAULT_EVENTARC_FALLBACK,
        source: 'fallback',
        location: loc,
        error: errMsg,
      };
    }
  }

  /**
   * Transforms raw gcloud JSON provider array into strongly typed EventArcCategory[] objects.
   *
   * @param raw Array of raw provider objects from `gcloud eventarc providers list --format=json`
   */
  public transformRawProviders(raw: any[]): EventArcCategory[] {
    const categories: EventArcCategory[] = [];

    for (const item of raw) {
      if (!item) continue;

      // Extract service name from provider name (e.g. "projects/.../providers/storage.googleapis.com" -> "storage.googleapis.com")
      const rawName: string = item.name || '';
      const parts = rawName.split('/');
      const serviceName = parts[parts.length - 1] || item.displayName || 'unknown.googleapis.com';

      // Generate a short ID (e.g. "storage.googleapis.com" -> "storage", "bigquery.googleapis.com" -> "bigquery")
      const shortId = serviceName.replace(/\.googleapis\.com$/, '').replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
      const displayName = item.displayName || shortId;

      const rawEventTypes = Array.isArray(item.eventTypes) ? item.eventTypes : [];
      const events: EventArcEventType[] = [];

      for (const ev of rawEventTypes) {
        if (!ev || !ev.type) continue;
        const fullType: string = ev.type;
        // Extract concise readable event ID (e.g. "google.cloud.storage.object.v1.finalized" -> "finalized")
        const typeSegments = fullType.split('.');
        const eventId = typeSegments[typeSegments.length - 1] || fullType;
        const eventName = `${eventId} (${typeSegments.slice(-2).join('.')})`;

        events.push({
          id: eventId,
          name: eventName,
          fullEvent: fullType,
          description: ev.description || `CloudEvent for ${displayName}`,
        });
      }

      // Only add categories that have events or valid provider definitions
      if (events.length > 0) {
        categories.push({
          id: shortId,
          name: displayName,
          serviceName,
          events,
        });
      }
    }

    // Sort alphabetically by category display name
    categories.sort((a, b) => a.name.localeCompare(b.name));
    return categories;
  }

  /**
   * Executes gcloud command with timeout and returns standard output string.
   */
  private executeGcloudCommand(binary: string, args: string[], timeoutMs: number = 10000): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(binary, args, {
        shell: true,
        env: { ...process.env },
      });

      let stdout = '';
      let stderr = '';

      const timer = setTimeout(() => {
        try {
          child.kill('SIGTERM');
        } catch {}
        reject(new Error(`Command '${binary} ${args.join(' ')}' timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(`Command exited with code ${code}: ${stderr || stdout}`));
        }
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }
}
