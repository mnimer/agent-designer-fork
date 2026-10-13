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
import { AgentGovernanceConfig } from '../../shared/types';
import { PostDeployGovernanceResult } from './DeployTypes';
import {
  AgentGovernanceProvisioner,
  HttpJsonRequester,
} from './AgentGovernanceProvisioner';

/**
 * Options for executing the post-deploy Enterprise Governance & Gemini Enterprise pipeline.
 */
export interface PostDeployGovernanceOptions {
  target?: 'agent_engine' | 'cloud_run';
  targetDirectory: string;
  projectId: string;
  region: string;
  agentId: string;
  displayName?: string;
  description?: string;
  deployedResourceUri: string;
  serviceUrl: string;
  serviceAccount?: string;
  stagingBucket?: string;
  document?: any;
  governance?: AgentGovernanceConfig;
  hasChatTrigger?: boolean;
  onLog?: (text: string, stream: 'stdout' | 'stderr' | 'system') => void;
  /** Optional custom evaluator hook (used for deterministic testing or custom runners). */
  customEvalExecutor?: () => Promise<{
    passed: boolean;
    warnings?: string[];
    experimentUrl?: string;
  }>;
  /** Optional custom HTTP requester for deterministic unit testing of OnePlatform REST provisioning. */
  customHttpRequester?: HttpJsonRequester;
}

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
  governance?: AgentGovernanceConfig;
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
  private governanceProvisioner: AgentGovernanceProvisioner;

  /**
   * Constructs a new UnifiedDeployRunner instance.
   */
  constructor(
    gcloudDetector?: GcloudDetector,
    sharedProcesses?: Map<string, ChildProcess>,
    sharedCancelled?: Set<string>,
    governanceProvisioner?: AgentGovernanceProvisioner
  ) {
    this.gcloudDetector = gcloudDetector || new GcloudDetector();
    this.activeProcesses = sharedProcesses || new Map<string, ChildProcess>();
    this.cancelledDirectories = sharedCancelled || new Set<string>();
    this.governanceProvisioner =
      governanceProvisioner || new AgentGovernanceProvisioner(this.gcloudDetector);
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
      // Reject legacy Makefile `deploy` targets that pass a relative
      // `--agent_engine_config_file=.agent_engine_config.json`. Because `adk deploy agent_engine`
      // changes working directory to the parent folder during staging, a relative path looks one
      // folder up (`<parent>/.agent_engine_config.json`) and fails. Returning false causes
      // DeployPipeline to use direct `adk deploy agent_engine` which resolves `<agent_folder>/.agent_engine_config.json`.
      if (
        targetName === 'deploy' &&
        /--agent_engine_config_file=(?!["']?\$|["']?\/)\.agent_engine_config\.json/.test(content)
      ) {
        return false;
      }
      // If `make eval` invokes `.venv/bin/python` directly without bootstrapping `.venv` (`$(MAKE) install`)
      // and `.venv/bin/python` does not exist (e.g. Cloud Run deployments where builds run remotely),
      // return false so `buildCloudEvaluationCommand` can invoke `python3 evaluate.py` directly.
      if (targetName === 'eval') {
        const venvPython = path.join(path.resolve(targetDirectory), '.venv', 'bin', 'python');
        const evalBlockMatch = content.match(/^eval\s*:[^\n]*\n((?:\t[^\n]*\n?)*)/m);
        const evalBlock = evalBlockMatch ? evalBlockMatch[1] : '';
        if (
          evalBlock.includes('.venv/bin/python') &&
          !evalBlock.includes('install') &&
          !fs.existsSync(venvPython)
        ) {
          return false;
        }
      }
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
        args.push(`ENV_VARS=${envPairs}`);
      }
    }

    if (options.governance) {
      const gov = options.governance;
      if (gov.enableAgentGateway !== undefined) {
        args.push(`ENABLE_AGENT_GATEWAY=${gov.enableAgentGateway}`);
      }
      if (gov.modelArmorTemplateId) {
        args.push(`MODEL_ARMOR_TEMPLATE=${gov.modelArmorTemplateId}`);
      }
      if (gov.runCloudEvaluation !== undefined) {
        args.push(`RUN_CLOUD_EVAL=${gov.runCloudEvaluation}`);
      }
      if (gov.publishToGeminiEnterprise !== undefined) {
        args.push(`PUBLISH_GEMINI_ENTERPRISE=${gov.publishToGeminiEnterprise}`);
      }
      if (gov.geminiEnterpriseAppId) {
        args.push(`GEMINI_ENTERPRISE_APP_ID=${gov.geminiEnterpriseAppId}`);
      }
      if (gov.geminiEnterpriseLocation) {
        args.push(`GEMINI_ENTERPRISE_LOCATION=${gov.geminiEnterpriseLocation}`);
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
   * Constructs command to register the deployed agent in Google Cloud Agent Registry (`agentregistry.googleapis.com`).
   */
  public buildRegisterAgentCommand(options: {
    targetDirectory: string;
    projectId: string;
    region: string;
    agentId: string;
    displayName?: string;
    deployedResourceUri: string;
    serviceUrl: string;
  }): { executable: string; args: string[]; commandString: string } {
    const cleanAgentId = options.agentId
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'adk-agent';

    if (
      this.hasMakefileTarget(options.targetDirectory, 'register-agent') &&
      this.gcloudDetector.hasBinary('make', options.targetDirectory)
    ) {
      const args = [
        'register-agent',
        `PROJECT_ID=${options.projectId}`,
        `REGION=${options.region}`,
        `AGENT_NAME=${cleanAgentId}`,
        `AGENT_URI=${options.deployedResourceUri}`,
        `ENDPOINT_URL=${options.serviceUrl}`,
      ];
      return {
        executable: 'make',
        args,
        commandString: `make ${args.join(' ')}`,
      };
    }

    const args = [
      'alpha',
      'agent-registry',
      'agents',
      'register',
      cleanAgentId,
      `--project=${options.projectId}`,
      `--location=${options.region}`,
      `--display-name=${options.displayName || cleanAgentId}`,
      `--framework=google-adk`,
      `--runtime-resource=${options.deployedResourceUri}`,
      `--endpoint-uri=${options.serviceUrl}`,
      '--quiet',
    ];
    return {
      executable: 'gcloud',
      args,
      commandString: `gcloud ${args.join(' ')}`,
    };
  }

  /**
   * Constructs command to bind a Shared Regional Agent Gateway (`networkservices.googleapis.com`)
   * with Model Armor (`modelarmor.googleapis.com`) in front of the deployed agent.
   */
  public buildSetupGatewayCommand(options: {
    targetDirectory: string;
    projectId: string;
    region: string;
    agentId: string;
    deployedResourceUri: string;
    sharedGatewayId?: string;
    modelArmorTemplateId?: string;
  }): { executable: string; args: string[]; commandString: string } {
    const gatewayId = options.sharedGatewayId?.trim() || 'default-shared-agent-gateway';
    const templateId = options.modelArmorTemplateId?.trim() || 'enterprise-baseline';

    if (
      this.hasMakefileTarget(options.targetDirectory, 'setup-gateway') &&
      this.gcloudDetector.hasBinary('make', options.targetDirectory)
    ) {
      const args = [
        'setup-gateway',
        `PROJECT_ID=${options.projectId}`,
        `REGION=${options.region}`,
        `GATEWAY_ID=${gatewayId}`,
        `MODEL_ARMOR_TEMPLATE=${templateId}`,
        `AGENT_URI=${options.deployedResourceUri}`,
      ];
      return {
        executable: 'make',
        args,
        commandString: `make ${args.join(' ')}`,
      };
    }

    const args = [
      'alpha',
      'network-services',
      'agent-gateways',
      'register-target',
      gatewayId,
      `--project=${options.projectId}`,
      `--location=${options.region}`,
      `--target-resource=${options.deployedResourceUri}`,
      `--model-armor-template=${templateId}`,
      '--quiet',
    ];
    return {
      executable: 'gcloud',
      args,
      commandString: `gcloud ${args.join(' ')}`,
    };
  }

  /**
   * Constructs command to run post-deploy Vertex AI Cloud Evaluation (`EvalTask`) using `eval_dataset.jsonl`.
   */
  public buildCloudEvaluationCommand(options: {
    targetDirectory: string;
    projectId: string;
    region: string;
    deployedResourceUri: string;
  }): { executable: string; args: string[]; commandString: string } {
    if (
      this.hasMakefileTarget(options.targetDirectory, 'eval') &&
      this.gcloudDetector.hasBinary('make', options.targetDirectory)
    ) {
      const args = [
        'eval',
        `PROJECT_ID=${options.projectId}`,
        `REGION=${options.region}`,
        `AGENT_URI=${options.deployedResourceUri}`,
      ];
      return {
        executable: 'make',
        args,
        commandString: `make ${args.join(' ')}`,
      };
    }

    const venvPython = path.join(path.resolve(options.targetDirectory), '.venv', 'bin', 'python');
    const executable = fs.existsSync(venvPython) ? venvPython : 'python3';
    const args = [
      'evaluate.py',
      `--project=${options.projectId}`,
      `--location=${options.region}`,
      `--dataset=eval_dataset.jsonl`,
    ];
    return {
      executable,
      args,
      commandString: `${executable} ${args.join(' ')}`,
    };
  }

  /**
   * Constructs command to publish the deployed agent to a Gemini Enterprise App (`discoveryengine.googleapis.com`).
   */
  public buildPublishGeminiEnterpriseCommand(options: {
    targetDirectory: string;
    projectId: string;
    region: string;
    agentId: string;
    displayName?: string;
    description?: string;
    deployedResourceUri: string;
    geminiEnterpriseAppId: string;
    geminiEnterpriseLocation?: string;
    agentGatewayResource?: string;
  }): { executable: string; args: string[]; commandString: string } {
    const location = options.geminiEnterpriseLocation?.trim() || 'global';
    const appId = options.geminiEnterpriseAppId.trim();
    const cleanAgentId = options.agentId
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'adk-agent';

    if (
      this.hasMakefileTarget(options.targetDirectory, 'publish-gemini-enterprise') &&
      this.gcloudDetector.hasBinary('make', options.targetDirectory)
    ) {
      const args = [
        'publish-gemini-enterprise',
        `PROJECT_ID=${options.projectId}`,
        `REGION=${options.region}`,
        `GEMINI_ENTERPRISE_APP_ID=${appId}`,
        `GEMINI_ENTERPRISE_LOCATION=${location}`,
        `AGENT_NAME=${cleanAgentId}`,
        `AGENT_URI=${options.deployedResourceUri}`,
      ];
      if (options.agentGatewayResource) {
        args.push(`AGENT_GATEWAY_RESOURCE=${options.agentGatewayResource}`);
      }
      return {
        executable: 'make',
        args,
        commandString: `make ${args.join(' ')}`,
      };
    }

    const args = [
      'alpha',
      'discovery-engine',
      'assistants',
      'agents',
      'register',
      cleanAgentId,
      `--project=${options.projectId}`,
      `--location=${location}`,
      `--collection=default_collection`,
      `--engine=${appId}`,
      `--assistant=default_assistant`,
      `--display-name=${options.displayName || cleanAgentId}`,
      `--agent-resource=${options.deployedResourceUri}`,
    ];
    if (options.agentGatewayResource) {
      args.push(`--agent-gateway=${options.agentGatewayResource}`);
    }
    args.push('--quiet');

    return {
      executable: 'gcloud',
      args,
      commandString: `gcloud ${args.join(' ')}`,
    };
  }

  /**
   * Executes the Post-Deploy Enterprise Governance (`TASK-217`) and Gemini Enterprise App Publishing (`TASK-218`) pipeline:
   * 1. Always registers the agent in Google Cloud Agent Registry (`agentregistry.googleapis.com`) and applies least-privilege Agent Security Policies.
   * 2. Optionally binds a Shared Regional Agent Gateway + Model Armor guardrails (`enableAgentGateway !== false`, default template `'enterprise-baseline'`).
   * 3. Optionally runs post-deploy Vertex AI Cloud Evaluation (`runCloudEvaluation === true`). If evaluation fails threshold checks, marks deployment as `warning` ("Succeeded with Evaluation Warnings") and blocks publishing to Gemini Enterprise.
   * 4. Optionally publishes the agent to the selected Gemini Enterprise App (`publishToGeminiEnterprise === true` when Chat Trigger exists and not blocked by evaluation warnings).
   */
  public async runPostDeployGovernance(
    options: PostDeployGovernanceOptions
  ): Promise<PostDeployGovernanceResult> {
    const {
      target = 'agent_engine',
      targetDirectory,
      projectId,
      region,
      agentId,
      displayName,
      description,
      deployedResourceUri,
      serviceUrl,
      serviceAccount,
      stagingBucket,
      document,
      governance,
      onLog,
      customEvalExecutor,
      customHttpRequester,
    } = options;

    const cleanAgentId =
      agentId
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'adk-agent';

    const result: PostDeployGovernanceResult = {};

    // 1. Always Automatic: Agent Registry & Agent Security Policies
    const agentRegistryResource = `projects/${projectId}/locations/${region}/agents/${cleanAgentId}`;
    const securityPolicyResource = `projects/${projectId}/locations/${region}/authzPolicies/${cleanAgentId}-least-privilege`;
    const regCmd = this.buildRegisterAgentCommand({
      targetDirectory,
      projectId,
      region,
      agentId: cleanAgentId,
      displayName,
      deployedResourceUri,
      serviceUrl,
    });
    onLog?.(
      `[Governance] Registering agent in Google Cloud Agent Registry (${agentRegistryResource})...`,
      'system'
    );
    onLog?.(`[Governance] Command: ${regCmd.commandString}`, 'system');
    onLog?.(
      `[Governance] Applying least-privilege Agent Security Policy (${securityPolicyResource})...`,
      'system'
    );

    // 2. Shared Regional Agent Gateway + Model Armor (Default: Enabled = true, Template = 'enterprise-baseline')
    const enableGateway = governance?.enableAgentGateway ?? true;
    const modelArmorTemplateId = governance?.modelArmorTemplateId?.trim() || 'enterprise-baseline';
    const sharedGatewayId = governance?.sharedGatewayId?.trim() || 'default-shared-agent-gateway';

    if (enableGateway) {
      const gatewayResource = `projects/${projectId}/locations/${region}/agentGateways/${sharedGatewayId}`;
      const gwCmd = this.buildSetupGatewayCommand({
        targetDirectory,
        projectId,
        region,
        agentId: cleanAgentId,
        deployedResourceUri,
        sharedGatewayId,
        modelArmorTemplateId,
      });
      onLog?.(
        `[Governance] Attaching Shared Regional Agent Gateway (${gatewayResource}) with Model Armor Template '${modelArmorTemplateId}'...`,
        'system'
      );
      onLog?.(`[Governance] Command: ${gwCmd.commandString}`, 'system');
    }

    // Execute live Google Cloud OnePlatform REST provisioning (Agent Engine Telemetry, Agent Registry discovery, IAP + UAP Security Policies, Model Armor Template, Shared Regional Agent Gateway + AuthzExtensions/AuthzPolicies, and Vertex AI Evaluation Dataset & Experiment registration)
    const activeProvisioner = customHttpRequester
      ? new AgentGovernanceProvisioner(this.gcloudDetector, customHttpRequester)
      : this.governanceProvisioner;

    const provisioned = await activeProvisioner.provisionGovernanceResources({
      target,
      targetDirectory,
      projectId,
      region,
      cleanAgentId,
      displayName: displayName || cleanAgentId,
      description,
      deployedResourceUri,
      serviceUrl,
      serviceAccount,
      stagingBucket,
      document,
      enableGateway,
      sharedGatewayId,
      modelArmorTemplateId,
      onLog,
    });

    result.agentRegistryResource = provisioned.agentRegistryResource;
    result.securityPolicyResource = provisioned.securityPolicyResource;
    result.telemetryEnabled = provisioned.telemetryEnabled;
    if (provisioned.evaluationSetResource) {
      result.evaluationSetResource = provisioned.evaluationSetResource;
    }
    if (provisioned.evaluationExperimentResource) {
      result.evaluationExperimentResource = provisioned.evaluationExperimentResource;
    }
    if (provisioned.evaluationRunResource) {
      result.evaluationRunResource = provisioned.evaluationRunResource;
    }
    if (provisioned.evaluationItemsCount !== undefined) {
      result.evaluationItemsCount = provisioned.evaluationItemsCount;
    }
    if (provisioned.evaluationExperimentConsoleUrl) {
      result.evalTaskExperimentUrl = provisioned.evaluationExperimentConsoleUrl;
    }
    if (provisioned.appHubApplicationResource) {
      result.appHubApplicationResource = provisioned.appHubApplicationResource;
    }
    if (provisioned.appHubWorkloadResource) {
      result.appHubWorkloadResource = provisioned.appHubWorkloadResource;
    }
    if (enableGateway) {
      result.agentGatewayResource = provisioned.agentGatewayResource;
      result.modelArmorTemplateId = provisioned.modelArmorTemplateId;
    }

    // 3. Vertex AI Cloud Evaluation Post-Deploy Gate (Default: Unchecked = false)
    const runCloudEval = governance?.runCloudEvaluation ?? false;
    const shouldPublishGemini = Boolean(
      governance?.publishToGeminiEnterprise && governance?.geminiEnterpriseAppId?.trim()
    );

    if (runCloudEval) {
      const evalCmd = this.buildCloudEvaluationCommand({
        targetDirectory,
        projectId,
        region,
        deployedResourceUri,
      });
      onLog?.(
        `[Governance] Running Vertex AI Cloud Evaluation (EvalTask) against eval_dataset.jsonl...`,
        'system'
      );
      onLog?.(`[Governance] Command: ${evalCmd.commandString}`, 'system');

      const defaultExperimentUrl =
        provisioned.evaluationExperimentConsoleUrl ||
        `https://console.cloud.google.com/vertex-ai/experiments?project=${projectId}`;

      if (customEvalExecutor) {
        const evalRes = await customEvalExecutor();
        result.evalTaskExperimentUrl = evalRes.experimentUrl || defaultExperimentUrl;
        if (evalRes.passed) {
          result.evalGateStatus = 'passed';
          onLog?.(`✅ Vertex AI Cloud Evaluation passed all quality & safety thresholds.`, 'system');
        } else {
          result.evalGateStatus = 'warning';
          result.evalWarnings =
            evalRes.warnings && evalRes.warnings.length > 0
              ? evalRes.warnings
              : ['One or more scenarios in eval_dataset.jsonl fell below quality thresholds.'];
          onLog?.(
            `⚠️ Deployment Succeeded with Evaluation Warnings: ${result.evalWarnings.join('; ')}`,
            'stderr'
          );
          if (shouldPublishGemini) {
            result.geminiEnterpriseBlockedByEval = true;
            onLog?.(
              `🛑 Blocking automatic publish to Gemini Enterprise App (${governance?.geminiEnterpriseAppId}) due to Cloud Evaluation gate warnings.`,
              'stderr'
            );
          }
        }
      } else {
        const evaluatePyPath = path.join(path.resolve(targetDirectory), 'evaluate.py');
        const hasEvalTarget = this.hasMakefileTarget(targetDirectory, 'eval');
        if (fs.existsSync(evaluatePyPath) || hasEvalTarget) {
          const execRes = await this.executeCommand({
            targetDirectory,
            executable: evalCmd.executable,
            args: evalCmd.args,
            onLog: (line, stream) => onLog?.(line, stream),
          });
          result.evalTaskExperimentUrl = defaultExperimentUrl;
          const allLines = [...execRes.stdoutLines, ...execRes.stderrLines];
          const warningLines = allLines.filter(
            (l) =>
              /(?:\bFAIL(?:ED|URE)?\b|Threshold not met|AssertionError|EVALUATION_WARNING)/i.test(l) &&
              !/(?:FutureWarning|DeprecationWarning|UserWarning|PendingDeprecationWarning|RuntimeWarning)/i.test(l)
          );
          if (execRes.exitCode === 0 && warningLines.length === 0) {
            result.evalGateStatus = 'passed';
            onLog?.(`✅ Vertex AI Cloud Evaluation passed all quality & safety thresholds.`, 'system');
          } else {
            result.evalGateStatus = 'warning';
            result.evalWarnings =
              warningLines.length > 0
                ? warningLines
                : [`Cloud evaluation exited with code ${execRes.exitCode ?? 1}.`];
            onLog?.(
              `⚠️ Deployment Succeeded with Evaluation Warnings: ${result.evalWarnings.join('; ')}`,
              'stderr'
            );
            if (shouldPublishGemini) {
              result.geminiEnterpriseBlockedByEval = true;
              onLog?.(
                `🛑 Blocking automatic publish to Gemini Enterprise App (${governance?.geminiEnterpriseAppId}) due to Cloud Evaluation gate warnings.`,
                'stderr'
              );
            }
          }
        } else {
          result.evalGateStatus = 'passed';
          result.evalTaskExperimentUrl = defaultExperimentUrl;
          onLog?.(
            `✅ Registered eval_dataset.jsonl scenarios with Vertex AI Evaluation (${defaultExperimentUrl}).`,
            'system'
          );
        }
      }
    } else {
      result.evalGateStatus = 'skipped';
    }

    // 4. Automated Gemini Enterprise App Publishing (TASK-218)
    if (shouldPublishGemini && !result.geminiEnterpriseBlockedByEval) {
      const appId = governance!.geminiEnterpriseAppId!.trim();
      const geminiLocation = governance?.geminiEnterpriseLocation?.trim() || 'global';
      const bindGateway = governance?.bindGatewayToGeminiEnterprise ?? true;
      const gatewayToBind =
        bindGateway && result.agentGatewayResource ? result.agentGatewayResource : undefined;

      const pubCmd = this.buildPublishGeminiEnterpriseCommand({
        targetDirectory,
        projectId,
        region,
        agentId: cleanAgentId,
        displayName,
        description,
        deployedResourceUri,
        geminiEnterpriseAppId: appId,
        geminiEnterpriseLocation: geminiLocation,
        agentGatewayResource: gatewayToBind,
      });

      onLog?.(
        `[Gemini Enterprise] Publishing agent to Gemini Enterprise App '${appId}' (${geminiLocation})...`,
        'system'
      );
      onLog?.(`[Gemini Enterprise] Command: ${pubCmd.commandString}`, 'system');

      const published = await activeProvisioner.publishToGeminiEnterprise({
        projectId,
        region,
        cleanAgentId,
        displayName: displayName || cleanAgentId,
        description,
        deployedResourceUri,
        serviceUrl,
        agentRegistryResource: result.agentRegistryResource,
        geminiEnterpriseAppId: appId,
        geminiEnterpriseLocation: geminiLocation,
        onLog,
      });

      onLog?.(`✨ Published to Gemini Enterprise App: ${published.agentUri}`, 'system');

      result.geminiEnterpriseAgentUri = published.agentUri;
      result.geminiEnterpriseConsoleUrl = published.consoleUrl;
    }

    return result;
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
