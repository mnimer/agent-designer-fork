/**
 * DeployPipeline
 *
 * Coordinates and executes the multi-step deployment pipeline using standard
 * or ADK-specific CLI commands, parses stdout/stderr stream outputs, manages
 * process lifecycle, and supports active background deployment resilience.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import * as path from 'path';
import * as fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import { sanitizeFolderBaseName } from '../../shared/folderValidation';
import { isValidAgentEngineId } from '../../shared/identifierValidation';
import { WebviewBridge } from '../WebviewBridge';
import { GcloudDetector } from './GcloudDetector';
import { ArtifactStager } from './ArtifactStager';
import { ReasoningEngineClient } from './ReasoningEngineClient';
import { UnifiedDeployRunner } from './UnifiedDeployRunner';
import {
  DeploymentMetadataRecord,
  ActiveDeploymentRecord,
  AgentEngineDeployOptions,
  AgentEngineDeployResult,
} from './DeployTypes';

export class DeployPipeline {
  private activeProcesses = new Map<string, ChildProcess>();
  private activeDeployments = new Map<string, ActiveDeploymentRecord>();
  private cancelledDirectories = new Set<string>();
  private unifiedRunner: UnifiedDeployRunner;

  constructor(
    private gcloudDetector: GcloudDetector,
    private artifactStager: ArtifactStager,
    private reasoningEngineClient: ReasoningEngineClient,
    private pythonResolver?: {
      resolvePythonEnvironment(targetDir?: string): Promise<{ path: string } | null>;
      ensureVirtualEnvironment?(targetDir?: string): Promise<{ path: string }>;
      ensureDependenciesInstalled?(
        pythonBin: string,
        targetDir: string,
        onLog?: (msg: string, stream?: 'stdout' | 'stderr' | 'system') => Promise<void> | void
      ): Promise<void>;
    }
  ) {
    this.unifiedRunner = new UnifiedDeployRunner(
      this.gcloudDetector,
      this.activeProcesses,
      this.cancelledDirectories
    );
  }

  /**
   * Constructs the command arguments array for the deployment execution.
   */
  public buildDeployArgs(
    options: AgentEngineDeployOptions,
    existingMetadata?: DeploymentMetadataRecord | null
  ): string[] {
    const args: string[] = ['deploy', '--no-confirm-project'];
    args.push('--project', options.projectId);

    const region = options.region && options.region !== 'global' ? options.region : 'us-central1';
    args.push('--region', region);

    if (options.serviceAccount && options.serviceAccount.trim()) {
      args.push('--service-account', options.serviceAccount.trim());
    }

    if (options.networkAttachment && options.networkAttachment.trim()) {
      args.push('--network-attachment', options.networkAttachment.trim());
    }

    return args;
  }

  /**
   * Constructs the CLI arguments for official ADK deployment (`adk deploy agent_engine`).
   */
  public buildAdkDeployArgs(
    options: AgentEngineDeployOptions,
    existingMetadata?: DeploymentMetadataRecord | null
  ): string[] {
    const rawRegion = options.region || 'us-central1';
    const region = rawRegion.toLowerCase() === 'global' ? 'us-central1' : rawRegion;

    const args: string[] = ['deploy', 'agent_engine'];
    args.push('--project', options.projectId);
    args.push('--region', region);

    const targetEngineId = options.agentEngineId?.trim() || existingMetadata?.remote_agent_runtime_id;
    if (!options.forceNew && targetEngineId && isValidAgentEngineId(targetEngineId)) {
      const parts = targetEngineId.split('/');
      const engineId = parts.pop() || targetEngineId;
      args.push('--agent_engine_id', engineId);
    } else {
      const resolvedDisplayName =
        options.displayName ||
        (options.document as any)?.name ||
        path.basename(options.targetDirectory);
      if (resolvedDisplayName) {
        args.push('--display_name', resolvedDisplayName);
      }
    }

    args.push('--session_service_uri', 'memory://');

    if (options.stagingBucket && options.stagingBucket.trim()) {
      const bucketUri = options.stagingBucket.trim().startsWith('gs://')
        ? options.stagingBucket.trim()
        : `gs://${options.stagingBucket.trim()}`;
      args.push('--artifact_service_uri', bucketUri);
    }

    args.push('.');

    return args;
  }

  /**
   * Formats a human-readable shell command string representing the deployment.
   */
  public getDeployCommandString(options: AgentEngineDeployOptions): string {
    const existingMeta = this.artifactStager.readDeploymentMetadata(options.targetDirectory);
    if (this.unifiedRunner.hasMakefileTarget(options.targetDirectory, 'deploy')) {
      return this.unifiedRunner.buildMakeDeployCommand({
        target: 'agent_engine',
        targetDirectory: options.targetDirectory,
        projectId: options.projectId,
        region: options.region,
        displayName: options.displayName,
        agentEngineId: !options.forceNew
          ? options.agentEngineId || existingMeta?.remote_agent_runtime_id
          : undefined,
        stagingBucket: options.stagingBucket,
        serviceAccount: options.serviceAccount,
        networkAttachment: options.networkAttachment,
      }).commandString;
    }
    if (this.gcloudDetector.hasBinary('adk', options.targetDirectory)) {
      const args = this.buildAdkDeployArgs(options, existingMeta);
      return `adk ${args.join(' ')}`;
    }
    const args = this.buildDeployArgs(options, existingMeta);
    return `agents-cli ${args.join(' ')}`;
  }

  /**
   * Executes the Agent Engine deployment process.
   */
  public async deploy(options: AgentEngineDeployOptions): Promise<AgentEngineDeployResult> {
    const { targetDirectory, projectId, bridge } = options;
    const region = options.region && options.region !== 'global' ? options.region : 'us-central1';

    // 0. Validate GCP Project ID requirement
    if (!projectId || !projectId.trim()) {
      const errMsg = 'Cannot deploy to Agent Engine: GCP Project ID is required. Please specify a valid project ID.';
      this.logToBridge(bridge, `[ERROR] ${errMsg}`, 'stderr');
      this.sendStatusToBridge(bridge, {
        status: 'error',
        error: errMsg,
      });

      return {
        success: false,
        error: errMsg,
      };
    }

    // 1. Validate target directory has valid naming and generated agent code
    const validation = this.artifactStager.validateTargetDirectory(targetDirectory);
    if (!validation.valid) {
      let errMsg = '';
      if (validation.nameError) {
        const folderBase = path.basename(targetDirectory);
        const sanitized = sanitizeFolderBaseName(folderBase);
        errMsg = `Cannot deploy to Agent Engine: ${validation.nameError} Please update the target folder to '${sanitized}' in the Deployment tab.`;
      } else {
        errMsg = `Cannot deploy to Agent Engine: missing required code file (${validation.missingFiles.join(
          ', '
        )}) in '${targetDirectory}'. Please generate code first.`;
      }

      this.logToBridge(bridge, `[ERROR] ${errMsg}`, 'stderr');
      this.sendStatusToBridge(bridge, {
        status: 'error',
        error: errMsg,
      });

      return {
        success: false,
        error: errMsg,
      };
    }

    const executionDir = targetDirectory;

    // 3. Check for existing deployment metadata or configured engine ID (zero procedural file mutation)
    const existingMeta = this.artifactStager.readDeploymentMetadata(targetDirectory);
    let candidateEngineId = options.agentEngineId?.trim() || existingMeta?.remote_agent_runtime_id;

    const docDeployment = options.document?.deployment as any;
    if (!options.forceNew && !candidateEngineId) {
      if (docDeployment?.agentEngine?.deployedResourceId && isValidAgentEngineId(docDeployment.agentEngine.deployedResourceId)) {
        candidateEngineId = docDeployment.agentEngine.deployedResourceId;
      } else {
        const isDocAgentEngine = docDeployment?.target === 'agent_engine' || docDeployment?.deploymentTarget === 'agent_engine';
        if (isDocAgentEngine && docDeployment?.deployedResourceId && isValidAgentEngineId(docDeployment.deployedResourceId)) {
          candidateEngineId = docDeployment.deployedResourceId;
        }
      }
    }

    let resolvedEngineId = isValidAgentEngineId(candidateEngineId) ? candidateEngineId : undefined;

    // Search Vertex AI to prevent accidental duplicates
    if (!options.forceNew && !resolvedEngineId && options.displayName) {
      const existingRemoteId = await this.reasoningEngineClient.findExistingReasoningEngine(projectId, region, options.displayName);
      if (existingRemoteId) {
        resolvedEngineId = existingRemoteId;
        this.logToBridge(
          bridge,
          `[0.3s] Discovered existing Reasoning Engine instance: ${resolvedEngineId}`,
          'system',
          targetDirectory
        );
      }
    }

    const isUpdate = Boolean(!options.forceNew && resolvedEngineId);
    if (isUpdate && resolvedEngineId) {
      options.agentEngineId = resolvedEngineId;
    } else {
      options.agentEngineId = undefined;
    }

    // 5. Initialize active deployment record in memory for background resilience
    const deployStartTime = Date.now();
    this.activeDeployments.set(targetDirectory, {
      targetDirectory,
      status: 'building',
      logs: [],
      startTime: deployStartTime,
      isExistingDeployment: isUpdate,
      remoteRuntimeId: resolvedEngineId || existingMeta?.remote_agent_runtime_id,
    });

    const actionLabel = isUpdate ? 'Updating existing Agent Engine Runtime' : 'Deploying new Agent Engine Runtime';
    this.logToBridge(bridge, `[0.0s] Initializing ${actionLabel}...`, 'system', targetDirectory);
    this.logToBridge(bridge, `[0.1s] Target: Vertex AI Agent Engine (${region})`, 'system', targetDirectory);
    this.logToBridge(bridge, `[0.2s] Project: ${projectId}`, 'system', targetDirectory);

    if (isUpdate && resolvedEngineId) {
      this.logToBridge(
        bridge,
        `[0.3s] In-place container update for: ${resolvedEngineId}`,
        'system',
        targetDirectory
      );
    }

    this.sendStatusToBridge(bridge, {
      status: 'building',
      isExistingDeployment: isUpdate,
      remoteRuntimeId: resolvedEngineId || existingMeta?.remote_agent_runtime_id,
    });

    // 6. Determine deployment tool and build arguments
    let deployTool: 'adk' | 'agents-cli' | 'python';
    let deployArgs: string[];

    if (this.gcloudDetector.hasBinary('adk', targetDirectory)) {
      deployTool = 'adk';
      deployArgs = this.buildAdkDeployArgs(options, existingMeta);
    } else if (this.gcloudDetector.hasBinary('agents-cli', targetDirectory)) {
      deployTool = 'agents-cli';
      deployArgs = this.buildDeployArgs(options, existingMeta);
    } else if (fs.existsSync(path.join(targetDirectory, 'deploy.py'))) {
      deployTool = 'python';
      deployArgs = ['deploy.py'];
    } else {
      // Auto-provision .venv and install requirements.txt (including google-adk) when deploying newly generated agent code
      const hasRequirements = fs.existsSync(path.join(targetDirectory, 'requirements.txt'));
      if (
        hasRequirements &&
        this.pythonResolver?.ensureVirtualEnvironment &&
        this.pythonResolver?.ensureDependenciesInstalled
      ) {
        try {
          this.logToBridge(
            bridge,
            `[0.4s] Provisioning local Python virtual environment (.venv) and installing ADK CLI dependencies from requirements.txt...`,
            'system',
            targetDirectory
          );
          const venvEnv = await this.pythonResolver.ensureVirtualEnvironment(targetDirectory);
          await this.pythonResolver.ensureDependenciesInstalled(
            venvEnv.path,
            targetDirectory,
            (msg, stream = 'system') => {
              this.logToBridge(bridge, msg, stream, targetDirectory);
            }
          );
        } catch (provErr: any) {
          this.logToBridge(
            bridge,
            `[WARNING] Automatic virtual environment provisioning failed: ${provErr?.message || provErr}`,
            'stderr',
            targetDirectory
          );
        }
      }

      if (this.gcloudDetector.hasBinary('adk', targetDirectory)) {
        deployTool = 'adk';
        deployArgs = this.buildAdkDeployArgs(options, existingMeta);
      } else if (this.gcloudDetector.hasBinary('agents-cli', targetDirectory)) {
        deployTool = 'agents-cli';
        deployArgs = this.buildDeployArgs(options, existingMeta);
      } else {
        const errMsg = "Neither 'adk' nor 'agents-cli' CLI tool was found in PATH, and no 'deploy.py' script was found.";
        this.logToBridge(bridge, `[ERROR] ${errMsg}`, 'stderr');
        this.sendStatusToBridge(bridge, {
          status: 'error',
          error: errMsg,
        });
        return {
          success: false,
          error: errMsg,
        };
      }
    }

    const deployCmd = `${deployTool} ${deployArgs.join(' ')}`;
    this.logToBridge(bridge, `[0.5s] Executing: ${deployCmd}`, 'system', targetDirectory);

    const env: NodeJS.ProcessEnv = this.gcloudDetector.getExtendedEnv(
      {
        GOOGLE_CLOUD_PROJECT: projectId,
        CLOUDSDK_CORE_PROJECT: projectId,
        GOOGLE_GENAI_USE_VERTEXAI: '1',
        GOOGLE_CLOUD_LOCATION: 'global',
        ...(options.envVars || {}),
      },
      targetDirectory
    );

    let pythonExecutable = process.platform === 'win32' ? 'python.exe' : 'python3';
    if (deployTool === 'python') {
      try {
        const resolvedEnv = await this.pythonResolver?.resolvePythonEnvironment(targetDirectory);
        if (resolvedEnv?.path) {
          pythonExecutable = resolvedEnv.path;
        }
      } catch {
        pythonExecutable = process.platform === 'win32' ? 'python.exe' : 'python3';
      }
    }

    return new Promise<AgentEngineDeployResult>((resolve) => {
      let remoteRuntimeId: string | undefined =
        !options.forceNew && existingMeta?.remote_agent_runtime_id
          ? existingMeta.remote_agent_runtime_id
          : undefined;
      let detectedConsoleUrl: string | undefined;
      let detectedFailureMessage: string | undefined;
      const buildLogs: string[] = [];

      let child: ChildProcess;

      if (deployTool === 'python') {
        this.logToBridge(
          bridge,
          `[NOTE] Neither 'adk' nor 'agents-cli' found in PATH. Invoking Python deployment script 'deploy.py'...`,
          'system',
          targetDirectory
        );
        child = spawn(pythonExecutable, ['deploy.py'], {
          cwd: executionDir,
          env,
          shell: false,
        });
      } else {
        const resolvedToolPath = this.gcloudDetector.resolveBinaryPath(deployTool, targetDirectory) || deployTool;
        child = spawn(resolvedToolPath, deployArgs, {
          cwd: executionDir,
          env,
          shell: false,
        });
      }

      this.activeProcesses.set(targetDirectory, child);

      const inspectLineForFailures = (line: string) => {
        const isFailure =
          line.match(/^(Deploy failed:|Failed to deploy|Error:\s+)/i) ||
          line.match(/(PERMISSION_DENIED|SERVICE_DISABLED)/i);
        if (isFailure && !detectedFailureMessage) {
          detectedFailureMessage = line.trim();
        }
      };

      child.stdout?.on('data', (data: Buffer | string) => {
        const text = data.toString();
        const lines = text.split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          buildLogs.push(line);
          this.logToBridge(bridge, line, 'stdout', targetDirectory);
          inspectLineForFailures(line);

          const idMatch = line.match(/projects\/[^/\s]+\/locations\/[^/\s]+\/reasoningEngines\/[0-9a-zA-Z_-]+/);
          if (idMatch) {
            remoteRuntimeId = idMatch[0];
          }

          const consoleMatch = line.match(/https:\/\/console\.cloud\.google\.com\/[^\s]+/);
          if (consoleMatch) {
            detectedConsoleUrl = consoleMatch[0];
          }
        }
      });

      child.stderr?.on('data', (data: Buffer | string) => {
        const text = data.toString();
        const lines = text.split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          buildLogs.push(line);
          this.logToBridge(bridge, line, 'stderr', targetDirectory);
          inspectLineForFailures(line);

          const idMatch = line.match(/projects\/[^/\s]+\/locations\/[^/\s]+\/reasoningEngines\/[0-9a-zA-Z_-]+/);
          if (idMatch) {
            remoteRuntimeId = idMatch[0];
          }

          const consoleMatch = line.match(/https:\/\/console\.cloud\.google\.com\/[^\s]+/);
          if (consoleMatch) {
            detectedConsoleUrl = consoleMatch[0];
          }
        }
      });

      child.on('close', (code: number | null, signal: string | null) => {
        this.activeProcesses.delete(targetDirectory);
        this.artifactStager.cleanupAdkTempDirectories(targetDirectory, deployStartTime);

        const wasCancelled = this.cancelledDirectories.has(targetDirectory);
        this.cancelledDirectories.delete(targetDirectory);

        if (wasCancelled) {
          const active = this.activeDeployments.get(targetDirectory);
          if (active) {
            active.status = 'idle';
          }
          this.logToBridge(bridge, `[Agent Engine Deployer] Deployment cancelled by user.`, 'system', targetDirectory);
          this.sendStatusToBridge(bridge, {
            status: 'idle',
          });
          resolve({
            success: false,
            error: 'Deployment cancelled by user.',
          });
          return;
        }

        const isSuccessful = code === 0 && !detectedFailureMessage && Boolean(remoteRuntimeId);

        if (isSuccessful && remoteRuntimeId) {
          const serviceUrl = this.reasoningEngineClient.resolveEndpointUrl(region, projectId, remoteRuntimeId);
          const consoleUrl = detectedConsoleUrl || this.reasoningEngineClient.resolveConsoleUrl(region, projectId, remoteRuntimeId);

          const metadata: DeploymentMetadataRecord = {
            remote_agent_runtime_id: remoteRuntimeId,
            deployment_target: 'agent_runtime',
            is_a2a: true,
            agent_directory: targetDirectory,
            deployment_timestamp: new Date().toISOString(),
            service_url: serviceUrl,
            console_url: consoleUrl,
            project_id: projectId,
            region,
            service_account: options.serviceAccount,
            network_attachment: options.networkAttachment,
            staging_bucket: options.stagingBucket,
            status: 'ACTIVE',
          };

          this.artifactStager.writeDeploymentMetadata(targetDirectory, metadata);

          const active = this.activeDeployments.get(targetDirectory);
          if (active) {
            active.status = 'success';
            active.remoteRuntimeId = remoteRuntimeId;
            active.serviceUrl = serviceUrl;
            active.consoleUrl = consoleUrl;
            active.metadata = metadata;
          }

          this.logToBridge(bridge, `✅ Deployment succeeded!`, 'system', targetDirectory);
          this.logToBridge(bridge, `✨ Resource ID: ${remoteRuntimeId}`, 'system', targetDirectory);
          this.logToBridge(bridge, `🚀 Endpoint: ${serviceUrl}`, 'system', targetDirectory);

          this.sendStatusToBridge(bridge, {
            status: 'success',
            remoteRuntimeId,
            serviceUrl,
            consoleUrl,
            metadata,
          });

          resolve({
            success: true,
            remoteRuntimeId,
            serviceUrl,
            consoleUrl,
            metadata,
          });
        } else {
          let errMsg = detectedFailureMessage;
          if (!errMsg) {
            if (code !== null && code !== 0) {
              errMsg = `Deployment process exited with error code ${code}. Check logs above for details.`;
            } else if (signal) {
              errMsg = `Deployment process was terminated by signal ${signal}. Check logs above for details.`;
            } else if (code === null) {
              errMsg = 'Deployment process was terminated unexpectedly. Check logs above for details.';
            } else {
              errMsg = 'Deployment failed: no Agent Engine resource ID was returned by the deployment process.';
            }
          }

          const isNotFound = this.reasoningEngineClient.isReasoningEngineNotFoundError(errMsg, buildLogs);
          if (isUpdate && isNotFound) {
            const staleId =
              resolvedEngineId || options.agentEngineId || existingMeta?.remote_agent_runtime_id || 'stale instance';
            this.logToBridge(
              bridge,
              `⚠️ Target Reasoning Engine (${staleId}) was deleted in Cloud Console (404 NOT_FOUND).`,
              'system',
              targetDirectory
            );
            this.logToBridge(
              bridge,
              `[Agent Engine Deployer] Clearing stale deployment metadata and automatically deploying a new Reasoning Engine instance...`,
              'system',
              targetDirectory
            );

            const metaPath = path.join(targetDirectory, 'deployment_metadata.json');
            if (fs.existsSync(metaPath)) {
              try {
                fs.unlinkSync(metaPath);
              } catch (err) {
                console.warn(`[DeployPipeline] Warning deleting stale ${metaPath}:`, err);
              }
            }

            this.activeDeployments.delete(targetDirectory);

            const retryOptions: AgentEngineDeployOptions = {
              ...options,
              agentEngineId: undefined,
              forceNew: true,
              displayName: options.displayName || (options.document as any)?.name || path.basename(targetDirectory),
            };
            if (retryOptions.document && (retryOptions.document as any).deployment) {
              retryOptions.document = {
                ...retryOptions.document,
                deployment: {
                  ...(retryOptions.document as any).deployment,
                  deployedResourceId: undefined,
                  serviceUrl: undefined,
                  consoleUrl: undefined,
                },
              };
            }

            this.deploy(retryOptions)
              .then(resolve)
              .catch((retryErr) => {
                resolve({
                  success: false,
                  error: retryErr?.message || String(retryErr),
                });
              });
            return;
          }

          const active = this.activeDeployments.get(targetDirectory);
          if (active) {
            active.status = 'error';
            active.error = errMsg;
          }

          this.logToBridge(bridge, `[ERROR] ${errMsg}`, 'stderr', targetDirectory);

          this.sendStatusToBridge(bridge, {
            status: 'error',
            error: errMsg,
          });

          resolve({
            success: false,
            error: errMsg,
          });
        }
      });

      child.on('error', (err: Error) => {
        this.activeProcesses.delete(targetDirectory);
        this.artifactStager.cleanupAdkTempDirectories(targetDirectory, deployStartTime);
        const errMsg = `Failed to start deployment subprocess: ${err.message}`;

        const active = this.activeDeployments.get(targetDirectory);
        if (active) {
          active.status = 'error';
          active.error = errMsg;
        }

        this.logToBridge(bridge, `[ERROR] ${errMsg}`, 'stderr', targetDirectory);

        this.sendStatusToBridge(bridge, {
          status: 'error',
          error: errMsg,
        });

        resolve({
          success: false,
          error: errMsg,
        });
      });
    });
  }

  /**
   * Cancels any in-flight deployment process for the given target directory.
   */
  public cancelDeployment(targetDir?: string, bridge?: WebviewBridge): boolean {
    let cancelled = false;

    if (targetDir && this.activeProcesses.has(targetDir)) {
      this.cancelledDirectories.add(targetDir);
      const proc = this.activeProcesses.get(targetDir);
      try {
        proc?.kill('SIGTERM');
        cancelled = true;
      } catch (err) {
        console.warn(`[DeployPipeline] Error killing process:`, err);
      }
      this.activeProcesses.delete(targetDir);
      const active = this.activeDeployments.get(targetDir);
      if (active) {
        active.status = 'idle';
      }
    } else if (!targetDir) {
      for (const [dir, proc] of this.activeProcesses.entries()) {
        this.cancelledDirectories.add(dir);
        try {
          proc.kill('SIGTERM');
          cancelled = true;
        } catch {}
      }
      this.activeProcesses.clear();
      for (const active of this.activeDeployments.values()) {
        active.status = 'idle';
      }
    }

    if (cancelled && bridge) {
      this.logToBridge(bridge, '[Agent Engine Deployer] Deployment cancelled by user.', 'system', targetDir);
      this.sendStatusToBridge(bridge, {
        status: 'idle',
      });
    }

    return cancelled;
  }

  /**
   * Retrieves and emits current deployment status from in-memory session or disk metadata.
   */
  public getDeploymentStatus(
    targetDir: string,
    bridge?: WebviewBridge
  ): DeploymentMetadataRecord | null {
    const active = this.activeDeployments.get(targetDir);
    const meta = this.artifactStager.readDeploymentMetadata(targetDir);

    if (bridge) {
      if (
        active &&
        (active.status === 'building' || active.status === 'deploying' || active.status === 'packaging')
      ) {
        this.sendStatusToBridge(bridge, {
          status: active.status,
          inProgress: true,
          logs: active.logs,
          remoteRuntimeId: active.remoteRuntimeId,
          serviceUrl: active.serviceUrl,
          consoleUrl: active.consoleUrl,
          isExistingDeployment: active.isExistingDeployment,
          metadata: active.metadata || meta,
        });
      } else if (active && active.status === 'error') {
        this.sendStatusToBridge(bridge, {
          status: 'error',
          error: active.error,
          logs: active.logs,
          metadata: meta,
        });
      } else if (meta) {
        this.sendStatusToBridge(bridge, {
          status: 'success',
          remoteRuntimeId: meta.remote_agent_runtime_id,
          serviceUrl: meta.service_url,
          consoleUrl: meta.console_url,
          isExistingDeployment: true,
          metadata: meta,
          logs: active?.logs,
        });
      } else {
        this.sendStatusToBridge(bridge, {
          status: 'idle',
        });
      }
    }

    return meta;
  }

  /**
   * Helper to send log messages through WebviewBridge.
   */
  private logToBridge(
    bridge: WebviewBridge | undefined,
    text: string,
    stream: 'stdout' | 'stderr' | 'system',
    targetDirectory?: string
  ): void {
    const entry = {
      text,
      stream,
      timestamp: new Date().toISOString(),
    };

    if (targetDirectory) {
      const active = this.activeDeployments.get(targetDirectory);
      if (active) {
        active.logs.push(entry);
      }
    }

    if (!bridge) return;
    bridge.postMessage({
      type: 'AGENT_ENGINE_DEPLOY_LOG',
      payload: entry,
    });
  }

  /**
   * Helper to send status updates through WebviewBridge.
   */
  private sendStatusToBridge(bridge: WebviewBridge | undefined, payload: any): void {
    if (!bridge) return;
    bridge.postMessage({
      type: 'AGENT_ENGINE_DEPLOY_STATUS',
      payload,
    });
  }
}
