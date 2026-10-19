/**
 * DeployTypes
 *
 * Shared interfaces and type definitions for the Agent Engine deployer subsystem.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { WebviewBridge } from '../WebviewBridge';
import { AgentGovernanceConfig } from '../../shared/types';

/**
 * Post-deploy governance & Gemini Enterprise publishing execution result.
 */
export interface PostDeployGovernanceResult {
  agentRegistryResource?: string;
  securityPolicyResource?: string;
  agentGatewayResource?: string;
  modelArmorTemplateId?: string;
  telemetryEnabled?: boolean;
  evaluationSetResource?: string;
  evaluationExperimentResource?: string;
  evaluationRunResource?: string;
  evaluationItemsCount?: number;
  appHubApplicationResource?: string;
  appHubWorkloadResource?: string;
  evalGateStatus?: 'passed' | 'warning' | 'skipped';
  evalWarnings?: string[];
  evalTaskExperimentUrl?: string;
  geminiEnterpriseAgentUri?: string;
  geminiEnterpriseConsoleUrl?: string;
  geminiEnterpriseBlockedByEval?: boolean;
}

/**
 * Persisted schema for `deployment_metadata.json`.
 */
export interface DeploymentMetadataRecord {
  remote_agent_runtime_id: string;
  deployment_target: 'agent_runtime';
  is_a2a: boolean;
  agent_directory: string;
  deployment_timestamp: string;
  service_url: string;
  console_url?: string;
  project_id: string;
  region: string;
  service_account?: string;
  network_account?: string; // Backwards compatible check
  network_attachment?: string;
  staging_bucket?: string;
  status: 'ACTIVE' | 'DEPLOYING' | 'FAILED' | 'READY' | 'ACTIVE_WITH_EVAL_WARNINGS';
  agent_registry_resource?: string;
  security_policy_resource?: string;
  agent_gateway_resource?: string;
  model_armor_template_id?: string;
  telemetry_enabled?: boolean;
  evaluation_set_resource?: string;
  evaluation_experiment_resource?: string;
  evaluation_run_resource?: string;
  evaluation_items_count?: number;
  apphub_application_resource?: string;
  apphub_workload_resource?: string;
  eval_gate_status?: 'passed' | 'warning' | 'skipped';
  eval_warnings?: string[];
  eval_task_experiment_url?: string;
  gemini_enterprise_agent_uri?: string;
  gemini_enterprise_console_url?: string;
  gemini_enterprise_blocked_by_eval?: boolean;
}

/**
 * In-memory active deployment state tracked across UI navigation.
 */
export interface ActiveDeploymentRecord {
  targetDirectory: string;
  status: 'idle' | 'packaging' | 'building' | 'deploying' | 'success' | 'error';
  logs: Array<{ text: string; stream: 'stdout' | 'stderr' | 'system'; timestamp: string }>;
  startTime?: number;
  error?: string;
  metadata?: DeploymentMetadataRecord | null;
  remoteRuntimeId?: string;
  serviceUrl?: string;
  consoleUrl?: string;
  isExistingDeployment?: boolean;
}

/**
 * Options passed to `AgentEngineDeployer.deploy()`.
 */
export interface AgentEngineDeployOptions {
  targetDirectory: string;
  projectId: string;
  region?: string;
  serviceAccount?: string;
  networkAttachment?: string;
  stagingBucket?: string;
  forceNew?: boolean;
  displayName?: string;
  agentEngineId?: string;
  document?: any;
  envVars?: Record<string, string>;
  governance?: AgentGovernanceConfig;
  bridge?: WebviewBridge;
}

/**
 * Result returned by `AgentEngineDeployer.deploy()`.
 */
export interface AgentEngineDeployResult {
  success: boolean;
  remoteRuntimeId?: string;
  serviceUrl?: string;
  consoleUrl?: string;
  metadata?: DeploymentMetadataRecord;
  governanceResult?: PostDeployGovernanceResult;
  error?: string;
}

/**
 * Options for `AgentEngineDeployer.testRemoteAgentRuntime()`.
 */
export interface AgentEngineTestOptions {
  targetDirectory?: string;
  query: string;
  serviceUrl?: string;
  remoteRuntimeId?: string;
  bridge?: WebviewBridge;
  abortSignal?: AbortSignal;
  onChunk?: (chunkText: string) => void;
  remoteSessionId?: string;
}

/**
 * Result returned by `AgentEngineTestOptions`.
 */
export interface AgentEngineTestResult {
  success: boolean;
  query: string;
  response?: string;
  durationMs: number;
  remoteSessionId?: string;
  error?: string;
}
