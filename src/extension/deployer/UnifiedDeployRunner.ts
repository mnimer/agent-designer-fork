/**
 * UnifiedDeployRunner
 *
 * Target-agnostic deployment command builder and subprocess execution engine
 * shared across Vertex AI Agent Engine and Google Cloud Run deployments.
 *
 * Job in Application:
 * Centralizes detection and execution of self-contained repository deployment
 * artifacts (`Makefile`, `cloudbuild.yaml`, `main.tf`, and native CLI tools `adk` / `gcloud`),
 * ensuring 100% parity between in-IDE deployments, developer terminal workflows (`make deploy`),
 * and automated CI/CD pipelines without any procedural source code mutation.
 *
 * Architectural Decisions:
 * 1. Zero Procedural Post-Processing: Never rewrites or patches generated `.py` or `.yaml`
 *    files on disk during deployment. All repository files originate from the Gemini code
 *    generation prompts.
 * 2. Self-Contained CLI & CI/CD Parity: Provides standardized command builders for `Makefile`
 *    (`make deploy`, `make infra`), Google Cloud Build (`gcloud builds submit --config=cloudbuild.yaml`),
 *    Terraform (`terraform apply`), and direct CLI (`adk deploy agent_engine`, `gcloud run deploy`).
 * 3. Shared Process Lifecycle Management: Manages active child processes, line-by-line
 *    stdout/stderr streaming, and clean SIGTERM/SIGKILL cancellation across deployment targets.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { GcloudDetector } from './GcloudDetector';

/**
 * Unified deployment command configuration across Agent Engine and Cloud Run targets.
 */
export interface UnifiedDeployCommandOptions {
  target: 'agent_engine' | 'cloud_run';
  targetDirectory: string;
  projectId: string;
  region?: string;
  agentName?: string;
  serviceName?: string;
  displayName?: string;
  agentEngineId?: string;
  stagingBucket?: string;
  serviceAccount?: string;
  networkAttachment?: string;
  cpu?: string;
  memory?: string;
  minInstances?: number;
  maxInstances?: number;
  allowUnauthenticated?: boolean;
  envVars?: Record<string, string>;
}

/**
 * Subprocess execution options for `UnifiedDeployRunner.executeCommand()`.
 */
export interface UnifiedExecuteOptions {
  targetDirectory: string;
  executable: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
  onLog?: (line: string, stream: 'stdout' | 'stderr') => void;
  onRawChunk?: (chunkText: string, stream: 'stdout' | 'stderr') => void;
}

/**
 * Result returned by `UnifiedDeployRunner.executeCommand()`.
 */
export interface UnifiedExecuteResult {
  exitCode: number | null;
  signal: NodeJS.Signals | string | null;
  cancelled: boolean;
  stdoutLines: string[];
  stderrLines: string[];
  error?: Error;
}

export class UnifiedDeployRunner {
  private activeProcesses: Map<string, ChildProcess>;
  private cancelledDirectories: Set<string>;
  private gcloudDetector: GcloudDetector;

  /**
   * Constructs a new UnifiedDeployRunner instance.
   */
  constructor(
    gcloudDetector?: GcloudDetector,
    sharedProcesses?: Map<string, ChildProcess>,
    sharedCancelled?: Set<string>
  ) {
    this.gcloudDetector = gcloudDetector || new GcloudDetector();
    this.activeProcesses = sharedProcesses || new Map<string, ChildProcess>();
    this.cancelledDirectories = sharedCancelled || new Set<string>();
  }

  /**
   * Checks whether a `Makefile` exists in `targetDirectory` and defines the given `targetName` rule.
   */
  public hasMakefileTarget(targetDirectory: string, targetName: string): boolean {
    if (!targetDirectory) return false;
    const makefilePath = path.join(path.resolve(targetDirectory), 'Makefile');
    if (!fs.existsSync(makefilePath)) {
      return false;
    }

    try {
      const content = fs.readFileSync(makefilePath, 'utf8');
      // Match `targetName:` at the start of a line
      const targetRegex = new RegExp(`^${targetName}\\s*:`, 'm');
      return targetRegex.test(content);
    } catch {
      return false;
    }
  }

  /**
   * Checks whether `cloudbuild.yaml` exists in the target directory.
   */
  public hasCloudBuildConfig(targetDirectory: string): boolean {
    if (!targetDirectory) return false;
    return fs.existsSync(path.join(path.resolve(targetDirectory), 'cloudbuild.yaml'));
  }

  /**
   * Checks whether `main.tf` exists in the target directory.
   */
  public hasTerraformConfig(targetDirectory: string): boolean {
    if (!targetDirectory) return false;
    return fs.existsSync(path.join(path.resolve(targetDirectory), 'main.tf'));
  }

  /**
   * Constructs a `make deploy` command invocation with standardized target variables.
   */
  public buildMakeDeployCommand(options: UnifiedDeployCommandOptions): {
    executable: string;
    args: string[];
    commandString: string;
  } {
    const rawRegion = options.region?.trim() || 'us-central1';
    const region = rawRegion.toLowerCase() === 'global' ? 'us-central1' : rawRegion;
    const args: string[] = ['deploy', `PROJECT_ID=${options.projectId}`, `REGION=${region}`];

    if (options.target === 'agent_engine') {
      const agentName =
        options.agentName ||
        options.displayName ||
        path.basename(options.targetDirectory);
      if (agentName) {
        args.push(`AGENT_NAME=${agentName}`);
      }
      if (options.displayName) {
        args.push(`DISPLAY_NAME=${options.displayName}`);
      }
      if (options.agentEngineId) {
        const engineId = options.agentEngineId.split('/').pop() || options.agentEngineId;
        args.push(`AGENT_ENGINE_ID=${engineId}`);
      }
      if (options.stagingBucket) {
        const bucketUri = options.stagingBucket.startsWith('gs://')
          ? options.stagingBucket
          : `gs://${options.stagingBucket}`;
        args.push(`STAGING_BUCKET=${bucketUri}`);
      }
      if (options.serviceAccount) {
        args.push(`SERVICE_ACCOUNT=${options.serviceAccount}`);
      }
      if (options.networkAttachment) {
        args.push(`NETWORK_ATTACHMENT=${options.networkAttachment}`);
      }
    } else {
      const serviceName = options.serviceName?.trim() || 'agent-service';
      args.push(`SERVICE_NAME=${serviceName}`);
      if (options.cpu) {
        args.push(`CPU=${options.cpu}`);
      }
      if (options.memory) {
        args.push(`MEMORY=${options.memory}`);
      }
      if (options.minInstances !== undefined) {
        args.push(`MIN_INSTANCES=${options.minInstances}`);
      }
      if (options.maxInstances !== undefined) {
        args.push(`MAX_INSTANCES=${options.maxInstances}`);
      }
      if (options.allowUnauthenticated !== undefined) {
        args.push(`ALLOW_UNAUTHENTICATED=${options.allowUnauthenticated}`);
      }
      if (options.networkAttachment) {
        args.push(`NETWORK_ATTACHMENT=${options.networkAttachment}`);
      }
    }

    return {
      executable: 'make',
      args,
      commandString: `make ${args.join(' ')}`,
    };
  }

  /**
   * Constructs a `gcloud builds submit --config=cloudbuild.yaml` command for CI/CD parity.
   */
  public buildCloudBuildCommand(options: UnifiedDeployCommandOptions): {
    executable: string;
    args: string[];
    commandString: string;
  } {
    const rawRegion = options.region?.trim() || 'us-central1';
    const region = rawRegion.toLowerCase() === 'global' ? 'us-central1' : rawRegion;
    const substitutions: string[] = [
      `_PROJECT_ID=${options.projectId}`,
      `_REGION=${region}`,
    ];

    const name =
      options.agentName ||
      options.serviceName ||
      options.displayName ||
      path.basename(options.targetDirectory);
    if (name) {
      substitutions.push(`_AGENT_NAME=${name}`);
    }

    if (options.agentEngineId) {
      const engineId = options.agentEngineId.split('/').pop() || options.agentEngineId;
      substitutions.push(`_REASONING_ENGINE_ID=${engineId}`);
    }

    const args = [
      'builds',
      'submit',
      '--config=cloudbuild.yaml',
      `--project=${options.projectId}`,
      `--substitutions=${substitutions.join(',')}`,
      '.',
    ];

    return {
      executable: 'gcloud',
      args,
      commandString: `gcloud ${args.join(' ')}`,
    };
  }

  /**
   * Constructs a `terraform apply` command for Day 0 / infrastructure provisioning.
   */
  public buildTerraformApplyCommand(options: UnifiedDeployCommandOptions): {
    executable: string;
    args: string[];
    commandString: string;
  } {
    const rawRegion = options.region?.trim() || 'us-central1';
    const region = rawRegion.toLowerCase() === 'global' ? 'us-central1' : rawRegion;
    const args: string[] = [
      'apply',
      '-auto-approve',
      `-var=project_id=${options.projectId}`,
      `-var=region=${region}`,
    ];

    if (options.target === 'cloud_run') {
      const serviceName = options.serviceName?.trim() || 'agent-service';
      args.push(`-var=service_name=${serviceName}`);
    } else {
      const agentName =
        options.agentName ||
        options.displayName ||
        path.basename(options.targetDirectory);
      if (agentName) {
        args.push(`-var=agent_name=${agentName}`);
      }
    }

    return {
      executable: 'terraform',
      args,
      commandString: `terraform ${args.join(' ')}`,
    };
  }

  /**
   * Constructs arguments for `gcloud run deploy` when deploying a Cloud Run service directly.
   */
  public buildCloudRunGcloudArgs(options: UnifiedDeployCommandOptions): string[] {
    const region = options.region?.trim() || 'us-central1';
    const serviceName = options.serviceName?.trim() || 'agent-service';
    const cpu = options.cpu || '1';
    const memory = options.memory || '2Gi';
    const minInstances = options.minInstances ?? 0;
    const maxInstances = options.maxInstances ?? 10;
    const allowUnauthenticated = options.allowUnauthenticated ?? false;
    const networkAttachment = options.networkAttachment?.trim() || '';

    const args = [
      'run',
      'deploy',
      serviceName,
      '--source',
      '.',
      '--project',
      options.projectId,
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

    const envVars: Record<string, string> = {
      GOOGLE_GENAI_USE_VERTEXAI: 'true',
      GOOGLE_CLOUD_LOCATION: 'global',
      GOOGLE_CLOUD_PROJECT: options.projectId,
      ...(options.envVars || {}),
    };

    const envPairs = Object.entries(envVars)
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    if (envPairs) {
      args.push(`--set-env-vars=${envPairs}`);
    }

    args.push('--quiet');
    return args;
  }

  /**
   * Executes a deployment command subprocess with extended PATH, line-by-line log streaming,
   * and cancellation tracking. Performs zero file mutation on the target workspace.
   */
  public executeCommand(options: UnifiedExecuteOptions): Promise<UnifiedExecuteResult> {
    const targetDir = path.resolve(options.targetDirectory);
    const env = this.gcloudDetector.getExtendedEnv(options.env, targetDir);

    return new Promise<UnifiedExecuteResult>((resolve) => {
      const stdoutLines: string[] = [];
      const stderrLines: string[] = [];

      const child = spawn(options.executable, options.args, {
        cwd: targetDir,
        env,
        shell: false,
      });

      this.activeProcesses.set(targetDir, child);

      child.stdout?.on('data', (data: Buffer | string) => {
        const text = data.toString();
        options.onRawChunk?.(text, 'stdout');
        const lines = text.split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          stdoutLines.push(line);
          options.onLog?.(line, 'stdout');
        }
      });

      child.stderr?.on('data', (data: Buffer | string) => {
        const text = data.toString();
        options.onRawChunk?.(text, 'stderr');
        const lines = text.split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          stderrLines.push(line);
          options.onLog?.(line, 'stderr');
        }
      });

      child.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
        this.activeProcesses.delete(targetDir);
        const wasCancelled = this.cancelledDirectories.has(targetDir);
        this.cancelledDirectories.delete(targetDir);

        resolve({
          exitCode: code,
          signal,
          cancelled: wasCancelled,
          stdoutLines,
          stderrLines,
        });
      });

      child.on('error', (err: Error) => {
        this.activeProcesses.delete(targetDir);
        const wasCancelled = this.cancelledDirectories.has(targetDir);
        this.cancelledDirectories.delete(targetDir);

        resolve({
          exitCode: null,
          signal: null,
          cancelled: wasCancelled,
          stdoutLines,
          stderrLines,
          error: err,
        });
      });
    });
  }

  /**
   * Cancels an active deployment subprocess for the given target directory.
   */
  public cancel(targetDirectory: string): boolean {
    const targetDir = path.resolve(targetDirectory);
    const rawKey = this.activeProcesses.has(targetDirectory)
      ? targetDirectory
      : this.activeProcesses.has(targetDir)
        ? targetDir
        : undefined;

    if (!rawKey) {
      return false;
    }

    this.cancelledDirectories.add(rawKey);
    this.cancelledDirectories.add(targetDir);
    const proc = this.activeProcesses.get(rawKey);
    this.activeProcesses.delete(rawKey);

    try {
      proc?.kill('SIGTERM');
      return true;
    } catch {
      try {
        proc?.kill('SIGKILL');
        return true;
      } catch {
        return false;
      }
    }
  }

  /**
   * Cancels all active deployment subprocesses across all directories.
   */
  public cancelAll(): boolean {
    let anyCancelled = false;
    for (const [dir, proc] of this.activeProcesses.entries()) {
      this.cancelledDirectories.add(dir);
      try {
        proc.kill('SIGTERM');
        anyCancelled = true;
      } catch {}
    }
    this.activeProcesses.clear();
    return anyCancelled;
  }
}
