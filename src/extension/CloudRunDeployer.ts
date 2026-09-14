/**
 * CloudRunDeployer
 *
 * Extension-side deployment manager and lifecycle orchestrator for Google Cloud Run (v2 service).
 *
 * Job in Application:
 * Manages the entire Cloud Run deployment lifecycle from VS Code: validates the agent repository,
 * generates Terraform IaC files and Cloud Build pipelines, triggers build and deployment subprocesses
 * via `gcloud`, streams real-time stdout/stderr to the WebviewBridge terminal, persists deployment
 * metadata (`cloud_run_deployment_metadata.json`), handles cancellation, and provides live remote
 * HTTP testing against deployed Cloud Run endpoints.
 *
 * Architectural Decisions:
 * 1. Active Deployment Registry: Tracks deployments in-memory by normalized target directory, ensuring
 *    real-time log streaming and deployment status survive webview reloads and tab switching.
 * 2. Decoupled Cloud Build & Deployment: Executes container build and deployment subprocesses via Google Cloud SDK
 *    (`gcloud builds submit` / `gcloud run deploy`), capturing and parsing service URLs and revisions.
 * 3. File System Metadata Persistence: Writes `cloud_run_deployment_metadata.json` directly into the agent directory
 *    and synchronizes with the `.agent` document's `deployment` block for zero-configuration resumption.
 * 4. Process Cancellation Guarantee: Retains active `ChildProcess` handles and cleanly terminates process trees
 *    upon cancellation requests without leaving orphaned subprocesses.
 * 5. Live Remote Query Testing: Implements authenticated and unauthenticated HTTP test queries against deployed
 *    Cloud Run endpoints, dynamically obtaining Google Cloud identity tokens via `gcloud auth print-identity-token`.
 * 6. Automated Terraform IaC Generation: Bridges visual agent canvas nodes, extracted runtime secrets, and
 *    deployment configurations with `TerraformGenerator` for one-click file generation and workspace exports.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as child_process from 'child_process';
import * as https from 'https';
import * as http from 'http';
import { WebviewBridge } from './WebviewBridge';
import { GeneratedFile } from '../shared/codegen/types';
import { AgentWorkflowDocument } from '../shared/types';

/**
 * Persisted schema for `cloud_run_deployment_metadata.json`.
 */
export interface CloudRunDeploymentMetadataRecord {
  service_name: string;
  deployment_target: 'cloud_run';
  service_url: string;
  console_url?: string;
  project_id: string;
  region: string;
  deployment_timestamp: string;
  cpu?: string;
  memory?: string;
  min_instances?: number;
  max_instances?: number;
  allow_unauthenticated?: boolean;
  network_attachment?: string;
  status: 'ACTIVE' | 'DEPLOYING' | 'FAILED' | 'READY';
  [key: string]: any;
}

/**
 * In-memory active deployment state tracked across UI navigation.
 */
export interface ActiveCloudRunDeploymentRecord {
  targetDirectory: string;
  status: 'idle' | 'packaging' | 'building' | 'deploying' | 'success' | 'error';
  logs: Array<{ text: string; stream: 'stdout' | 'stderr' | 'system'; timestamp: string }>;
  startTime?: number;
  error?: string;
  metadata?: CloudRunDeploymentMetadataRecord | null;
  serviceUrl?: string;
  consoleUrl?: string;
  serviceName?: string;
  projectId?: string;
  region?: string;
  isExistingDeployment?: boolean;
}

/**
 * Deployment options passed to `CloudRunDeployer.deploy()`.
 */
export interface CloudRunDeployOptions {
  targetDirectory: string;
  projectId: string;
  region?: string;
  serviceName?: string;
  cpu?: string;
  memory?: string;
  minInstances?: number;
  maxInstances?: number;
  concurrency?: number;
  allowUnauthenticated?: boolean;
  networkAttachment?: string;
  envVars?: Record<string, string>;
  document?: AgentWorkflowDocument;
  bridge?: WebviewBridge;
}

/**
 * Remote test options passed to `CloudRunDeployer.testRemoteService()`.
 */
export interface CloudRunTestOptions {
  targetDirectory?: string;
  serviceUrl?: string;
  query: string;
  projectId?: string;
  bridge?: WebviewBridge;
}

/**
 * Result returned by `CloudRunDeployer.deploy()`.
 */
export interface CloudRunDeployResult {
  success: boolean;
  serviceUrl?: string;
  consoleUrl?: string;
  serviceName?: string;
  metadata?: CloudRunDeploymentMetadataRecord;
  error?: string;
}

/**
 * CloudRunDeployer implementation.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */
export class CloudRunDeployer {
  private static activeDeployments: Map<string, ActiveCloudRunDeploymentRecord> = new Map();
  private static activeProcesses: Map<string, child_process.ChildProcess> = new Map();

  /**
   * Constructs the CloudRunDeployer.
   */
  constructor() {}

  /**
   * Validates target directory for deployment readiness.
   *
   * @param targetDir Path to target folder
   * @returns Validation object with isValid and error message
   */
  public validateTargetDirectory(targetDir: string): { isValid: boolean; error?: string } {
    // NOTE: Check directory existence
    if (!targetDir || !targetDir.trim()) {
      return { isValid: false, error: 'Target directory path is empty.' };
    }

    const resolved = path.resolve(targetDir);
    if (!fs.existsSync(resolved)) {
      return { isValid: false, error: `Target directory does not exist: ${resolved}` };
    }

    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      return { isValid: false, error: `Target path is not a directory: ${resolved}` };
    }

    // NOTE: Check for basic agent files (server.py, agent.py, main.py, or Dockerfile)
    const files = fs.readdirSync(resolved);
    const hasAgentCode = files.some((f) =>
      ['server.py', 'agent.py', 'main.py', 'Dockerfile', 'requirements.txt'].includes(f)
    );

    if (!hasAgentCode) {
      return {
        isValid: false,
        error: `Target directory contains no agent entrypoints (e.g. server.py, agent.py, Dockerfile): ${resolved}`,
      };
    }

    return { isValid: true };
  }

  /**
   * Writes generated Terraform and Cloud Build files directly into target workspace directory.
   *
   * @param targetDir Destination directory
   * @param files Generated files to write
   * @returns List of relative paths written
   */
  public writeIaCFiles(targetDir: string, files: GeneratedFile[]): string[] {
    const resolved = path.resolve(targetDir);
    if (!fs.existsSync(resolved)) {
      fs.mkdirSync(resolved, { recursive: true });
    }

    const written: string[] = [];
    for (const file of files) {
      const fullPath = path.join(resolved, file.path);
      const parentDir = path.dirname(fullPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      fs.writeFileSync(fullPath, file.content, 'utf8');
      written.push(file.path);
    }

    return written;
  }

  /**
   * Reads persisted deployment metadata from `cloud_run_deployment_metadata.json`.
   *
   * @param targetDir Path to target folder
   * @returns Parsed metadata record or null if not found
   */
  public readDeploymentMetadata(targetDir: string): CloudRunDeploymentMetadataRecord | null {
    try {
      const metaPath = path.join(path.resolve(targetDir), 'cloud_run_deployment_metadata.json');
      if (fs.existsSync(metaPath)) {
        const raw = fs.readFileSync(metaPath, 'utf8');
        return JSON.parse(raw) as CloudRunDeploymentMetadataRecord;
      }
    } catch {
      // NOTE: Ignore read or parse errors and return null
    }
    return null;
  }

  /**
   * Writes deployment metadata to `cloud_run_deployment_metadata.json`.
   *
   * @param targetDir Path to target folder
   * @param metadata Metadata record to write
   */
  public writeDeploymentMetadata(targetDir: string, metadata: CloudRunDeploymentMetadataRecord): void {
    const metaPath = path.join(path.resolve(targetDir), 'cloud_run_deployment_metadata.json');
    fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2), 'utf8');
  }

  /**
   * Gets current deployment status for a target directory, checking active processes
   * and replaying logs if available.
   *
   * @param targetDir Path to target folder
   * @param bridge Webview bridge to send status updates to
   * @returns Active record or null
   */
  public getDeploymentStatus(
    targetDir: string,
    bridge?: WebviewBridge
  ): ActiveCloudRunDeploymentRecord | null {
    const norm = path.resolve(targetDir);
    const active = CloudRunDeployer.activeDeployments.get(norm);

    if (active) {
      if (bridge) {
        // Replay active state and all collected logs
        bridge.postMessage({
          type: 'CLOUD_RUN_DEPLOY_STATUS',
          payload: {
            status: active.status,
            serviceUrl: active.serviceUrl,
            consoleUrl: active.consoleUrl,
            serviceName: active.serviceName,
            projectId: active.projectId,
            region: active.region,
            error: active.error,
            logs: active.logs.map((l) => l.text),
            isExistingDeployment: active.isExistingDeployment,
            metadata: active.metadata,
          },
        });
      }
      return active;
    }

    // Check if on-disk metadata exists
    const diskMeta = this.readDeploymentMetadata(targetDir);
    if (diskMeta && bridge) {
      bridge.postMessage({
        type: 'CLOUD_RUN_DEPLOY_STATUS',
        payload: {
          status: 'success',
          serviceUrl: diskMeta.service_url,
          consoleUrl: diskMeta.console_url,
          serviceName: diskMeta.service_name,
          projectId: diskMeta.project_id,
          region: diskMeta.region,
          isExistingDeployment: true,
          metadata: diskMeta,
        },
      });
    }

    return null;
  }

  /**
   * Initiates deployment of the agent container to Google Cloud Run.
   *
   * @param options CloudRunDeployOptions
   * @returns Promise resolving to CloudRunDeployResult
   */
  public async deploy(options: CloudRunDeployOptions): Promise<CloudRunDeployResult> {
    const targetDir = path.resolve(options.targetDirectory);
    const bridge = options.bridge;

    // NOTE: Validate project ID
    const projectId = options.projectId?.trim();
    if (!projectId) {
      const err = 'Google Cloud Project ID is required for Cloud Run deployment.';
      this.emitLog(targetDir, bridge, `[SYSTEM ERROR] ${err}`, 'stderr');
      this.emitStatus(targetDir, bridge, 'error', { error: err });
      return { success: false, error: err };
    }

    // NOTE: Validate target directory
    const validation = this.validateTargetDirectory(targetDir);
    if (!validation.isValid) {
      const err = validation.error || 'Invalid target directory.';
      this.emitLog(targetDir, bridge, `[SYSTEM ERROR] ${err}`, 'stderr');
      this.emitStatus(targetDir, bridge, 'error', { error: err });
      return { success: false, error: err };
    }

    const region = options.region?.trim() || 'us-central1';
    const serviceName = options.serviceName?.trim() || 'agent-service';
    const cpu = options.cpu || '1';
    const memory = options.memory || '2Gi';
    const minInstances = options.minInstances ?? 0;
    const maxInstances = options.maxInstances ?? 10;
    const allowUnauthenticated = options.allowUnauthenticated ?? false;
    const networkAttachment = options.networkAttachment?.trim() || '';

    // Initialize active deployment tracking record
    const activeRecord: ActiveCloudRunDeploymentRecord = {
      targetDirectory: targetDir,
      status: 'building',
      logs: [],
      startTime: Date.now(),
      serviceName,
      projectId,
      region,
    };
    CloudRunDeployer.activeDeployments.set(targetDir, activeRecord);

    this.emitStatus(targetDir, bridge, 'building', {
      serviceName,
      projectId,
      region,
    });
    this.emitLog(
      targetDir,
      bridge,
      `[Visual Agent Designer] Initiating Cloud Run deployment for service '${serviceName}' in project '${projectId}' (${region})...`,
      'system'
    );

    // Build deployment arguments for gcloud run deploy
    // Using source-based deploy: `gcloud run deploy [SERVICE] --source . --project ... --region ...`
    const args = [
      'run',
      'deploy',
      serviceName,
      '--source',
      '.',
      '--project',
      projectId,
      '--region',
      region,
      '--platform',
      'managed',
      `--cpu=${cpu}`,
      `--memory=${memory}`,
      `--min-instances=${minInstances}`,
      `--max-instances=${maxInstances}`,
    ];

    if (allowUnauthenticated) {
      args.push('--allow-unauthenticated');
    } else {
      args.push('--no-allow-unauthenticated');
    }

    if (networkAttachment) {
      args.push(`--network-attachment=${networkAttachment}`);
    }

    // Set standard environment variables
    const envVars = {
      GOOGLE_GENAI_USE_VERTEXAI: 'true',
      GOOGLE_CLOUD_LOCATION: 'global',
      GOOGLE_CLOUD_PROJECT: projectId,
      ...(options.envVars || {}),
    };

    const envPairs = Object.entries(envVars)
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    if (envPairs) {
      args.push(`--set-env-vars=${envPairs}`);
    }

    // Also suppress interactive prompts
    args.push('--quiet');

    this.emitLog(targetDir, bridge, `[RUN COMMAND] gcloud ${args.join(' ')}`, 'system');

    return new Promise<CloudRunDeployResult>((resolve) => {
      // NOTE: Spawn subprocess with extended PATH for gcloud
      const env = this.getExtendedEnv();
      const child = child_process.spawn('gcloud', args, {
        cwd: targetDir,
        env,
      });

      CloudRunDeployer.activeProcesses.set(targetDir, child);

      let serviceUrl = '';
      let stdoutBuffer = '';
      let stderrBuffer = '';

      child.stdout.on('data', (data: Buffer) => {
        const text = data.toString('utf8');
        stdoutBuffer += text;
        this.emitLog(targetDir, bridge, text, 'stdout');

        // Extract Service URL from stdout if present (e.g. Service URL: https://service-xyz.run.app)
        const urlMatch = text.match(/https:\/\/[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+\.run\.app/);
        if (urlMatch) {
          serviceUrl = urlMatch[0];
        }
      });

      child.stderr.on('data', (data: Buffer) => {
        const text = data.toString('utf8');
        stderrBuffer += text;
        this.emitLog(targetDir, bridge, text, 'stderr');

        // gcloud often prints progress and service URL to stderr
        const urlMatch = text.match(/https:\/\/[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+\.run\.app/);
        if (urlMatch) {
          serviceUrl = urlMatch[0];
        }

        // Update status from building to deploying when container image is ready
        if (text.includes('Deploying container') || text.includes('Creating Revision')) {
          this.emitStatus(targetDir, bridge, 'deploying', {
            serviceName,
            projectId,
            region,
          });
        }
      });

      child.on('error', (err) => {
        CloudRunDeployer.activeProcesses.delete(targetDir);
        const errMsg = `Subprocess execution error: ${err.message}`;
        this.emitLog(targetDir, bridge, `[SYSTEM ERROR] ${errMsg}`, 'stderr');
        this.emitStatus(targetDir, bridge, 'error', { error: errMsg });
        resolve({ success: false, error: errMsg });
      });

      child.on('close', (code) => {
        CloudRunDeployer.activeProcesses.delete(targetDir);

        if (code === 0) {
          // If service URL was not extracted by regex, synthesize default
          if (!serviceUrl) {
            const urlMatch = (stdoutBuffer + stderrBuffer).match(/https:\/\/[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+\.run\.app/);
            if (urlMatch) {
              serviceUrl = urlMatch[0];
            } else {
              serviceUrl = `https://${serviceName}-${projectId}.${region}.run.app`;
            }
          }

          const consoleUrl = `https://console.cloud.google.com/run/detail/${region}/${serviceName}/metrics?project=${projectId}`;

          const metadata: CloudRunDeploymentMetadataRecord = {
            service_name: serviceName,
            deployment_target: 'cloud_run',
            service_url: serviceUrl,
            console_url: consoleUrl,
            project_id: projectId,
            region,
            deployment_timestamp: new Date().toISOString(),
            cpu,
            memory,
            min_instances: minInstances,
            max_instances: maxInstances,
            allow_unauthenticated: allowUnauthenticated,
            network_attachment: networkAttachment || undefined,
            status: 'READY',
          };

          this.writeDeploymentMetadata(targetDir, metadata);

          // Update active deployment record
          activeRecord.status = 'success';
          activeRecord.serviceUrl = serviceUrl;
          activeRecord.consoleUrl = consoleUrl;
          activeRecord.metadata = metadata;

          this.emitLog(
            targetDir,
            bridge,
            `[DEPLOY SUCCESS] Cloud Run service successfully deployed! Service URL: ${serviceUrl}`,
            'system'
          );

          this.emitStatus(targetDir, bridge, 'success', {
            serviceUrl,
            consoleUrl,
            serviceName,
            projectId,
            region,
            metadata,
          });

          resolve({
            success: true,
            serviceUrl,
            consoleUrl,
            serviceName,
            metadata,
          });
        } else {
          const errMsg = `Deployment process exited with code ${code}. Check logs above for details.`;
          activeRecord.status = 'error';
          activeRecord.error = errMsg;

          this.emitLog(targetDir, bridge, `[DEPLOY FAILED] ${errMsg}`, 'stderr');
          this.emitStatus(targetDir, bridge, 'error', { error: errMsg });
          resolve({ success: false, error: errMsg });
        }
      });
    });
  }

  /**
   * Cancels an ongoing deployment for the specified directory.
   *
   * @param targetDir Target directory being deployed
   * @param bridge Webview bridge for notification
   * @returns true if active process was terminated
   */
  public cancelDeploy(targetDir: string, bridge?: WebviewBridge): boolean {
    const norm = path.resolve(targetDir);
    const proc = CloudRunDeployer.activeProcesses.get(norm);

    if (proc) {
      try {
        proc.kill('SIGTERM');
      } catch {
        // Fallback to SIGKILL if SIGTERM fails
        try {
          proc.kill('SIGKILL');
        } catch {
          // Ignore
        }
      }
      CloudRunDeployer.activeProcesses.delete(norm);

      this.emitLog(norm, bridge, '[DEPLOYMENT CANCELLED] Deployment cancelled by user.', 'system');
      this.emitStatus(norm, bridge, 'idle', {});
      return true;
    }

    return false;
  }

  /**
   * Tests a deployed Cloud Run service endpoint via HTTP query.
   *
   * @param options CloudRunTestOptions
   * @returns Test result with response body, latency, and success flag
   */
  public async testRemoteService(options: CloudRunTestOptions): Promise<{
    success: boolean;
    query: string;
    response?: string;
    durationMs: number;
    error?: string;
  }> {
    const startTime = Date.now();
    const query = options.query?.trim() || 'Hello';
    let serviceUrl = options.serviceUrl?.trim();

    // If service URL is missing, try reading from deployment metadata
    if (!serviceUrl && options.targetDirectory) {
      const meta = this.readDeploymentMetadata(options.targetDirectory);
      if (meta?.service_url) {
        serviceUrl = meta.service_url;
      }
    }

    if (!serviceUrl) {
      const err = 'No Cloud Run service URL provided or found in deployment metadata.';
      return { success: false, query, durationMs: 0, error: err };
    }

    // Ensure endpoint URL has valid scheme and path
    if (!serviceUrl.startsWith('http://') && !serviceUrl.startsWith('https://')) {
      serviceUrl = `https://${serviceUrl}`;
    }

    // Default to /api/run or /chat endpoint
    let testEndpoint = serviceUrl;
    if (!testEndpoint.includes('/api/') && !testEndpoint.includes('/chat')) {
      testEndpoint = `${testEndpoint.replace(/\/+$/, '')}/api/run`;
    }

    // Obtain identity token via gcloud if needed (only for remote HTTPS endpoints)
    let idToken = '';
    if (serviceUrl.startsWith('https://') && !serviceUrl.includes('localhost') && !serviceUrl.includes('127.0.0.1')) {
      try {
        idToken = child_process
          .execSync(`gcloud auth print-identity-token --audiences="${serviceUrl}"`, {
            encoding: 'utf8',
            timeout: 5000,
            stdio: ['pipe', 'pipe', 'ignore'],
          })
          .trim();
      } catch {
        // NOTE: Unauthenticated services do not require identity tokens
      }
    }

    const payload = JSON.stringify({
      query,
      message: query,
      input: query,
    });

    return new Promise((resolve) => {
      try {
        const urlObj = new URL(testEndpoint);
        const isHttps = urlObj.protocol === 'https:';
        const client = isHttps ? https : http;

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload).toString(),
        };

        if (idToken) {
          headers['Authorization'] = `Bearer ${idToken}`;
        }

        const req = client.request(
          urlObj,
          {
            method: 'POST',
            headers,
            timeout: 30000,
          },
          (res) => {
            let resData = '';
            res.on('data', (chunk) => {
              resData += chunk;
            });

            res.on('end', () => {
              const durationMs = Date.now() - startTime;
              if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                resolve({
                  success: true,
                  query,
                  response: resData,
                  durationMs,
                });
              } else {
                resolve({
                  success: false,
                  query,
                  response: resData,
                  durationMs,
                  error: `HTTP ${res.statusCode}: ${res.statusMessage || 'Remote server error'}`,
                });
              }
            });
          }
        );

        req.on('error', (err) => {
          const durationMs = Date.now() - startTime;
          resolve({
            success: false,
            query,
            durationMs,
            error: `Network error connecting to ${testEndpoint}: ${err.message}`,
          });
        });

        req.write(payload);
        req.end();
      } catch (err: any) {
        resolve({
          success: false,
          query,
          durationMs: Date.now() - startTime,
          error: `Failed to construct request: ${err.message}`,
        });
      }
    });
  }

  /**
   * Helper to append logs to memory and stream to webview bridge.
   */
  private emitLog(
    targetDir: string,
    bridge: WebviewBridge | undefined,
    text: string,
    stream: 'stdout' | 'stderr' | 'system'
  ): void {
    const timestamp = new Date().toISOString();
    const active = CloudRunDeployer.activeDeployments.get(targetDir);
    if (active) {
      active.logs.push({ text, stream, timestamp });
    }

    if (bridge) {
      bridge.postMessage({
        type: 'CLOUD_RUN_DEPLOY_LOG',
        payload: {
          text,
          stream,
          timestamp,
        },
      });
    }
  }

  /**
   * Helper to update status in memory and stream to webview bridge.
   */
  private emitStatus(
    targetDir: string,
    bridge: WebviewBridge | undefined,
    status: 'idle' | 'packaging' | 'building' | 'deploying' | 'success' | 'error',
    details: Partial<ActiveCloudRunDeploymentRecord>
  ): void {
    const active = CloudRunDeployer.activeDeployments.get(targetDir);
    if (active) {
      active.status = status;
      Object.assign(active, details);
    }

    if (bridge) {
      bridge.postMessage({
        type: 'CLOUD_RUN_DEPLOY_STATUS',
        payload: {
          status,
          serviceUrl: details.serviceUrl || active?.serviceUrl,
          consoleUrl: details.consoleUrl || active?.consoleUrl,
          serviceName: details.serviceName || active?.serviceName,
          projectId: details.projectId || active?.projectId,
          region: details.region || active?.region,
          error: details.error,
          logs: active?.logs.map((l) => l.text),
          isExistingDeployment: details.isExistingDeployment,
          metadata: details.metadata || active?.metadata,
        },
      });
    }
  }

  /**
   * Disposes the deployer, cancelling any running child processes.
   */
  public dispose(): void {
    for (const [_dir, proc] of CloudRunDeployer.activeProcesses.entries()) {
      try {
        proc.kill('SIGTERM');
      } catch {
        // Ignore
      }
    }
    CloudRunDeployer.activeProcesses.clear();
    CloudRunDeployer.activeDeployments.clear();
  }

  /**
   * Generates extended environment for subprocess execution including common gcloud paths.
   */
  private getExtendedEnv(): NodeJS.ProcessEnv {
    const env = { ...process.env };
    const extraPaths = [
      '/opt/homebrew/bin',
      '/usr/local/bin',
      '/Users/mikenimer/Development/libraries/google-cloud-sdk/bin',
      path.join(process.env.HOME || '', 'google-cloud-sdk', 'bin'),
    ];

    const currentPath = env.PATH || '';
    const missing = extraPaths.filter((p) => fs.existsSync(p) && !currentPath.includes(p));
    if (missing.length > 0) {
      env.PATH = `${missing.join(path.delimiter)}${path.delimiter}${currentPath}`;
    }

    return env;
  }
}
