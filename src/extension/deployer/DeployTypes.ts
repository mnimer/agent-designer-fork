/**
 * DeployTypes
 *
 * Shared interfaces and type definitions for the Agent Engine deployer subsystem.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { WebviewBridge } from '../WebviewBridge';

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
  status: 'ACTIVE' | 'DEPLOYING' | 'FAILED' | 'READY';
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
