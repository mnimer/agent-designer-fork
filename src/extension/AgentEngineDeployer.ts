/**
 * AgentEngineDeployer
 *
 * Facade coordinating compile, packaging, staging, local/remote verification,
 * and HTTP streaming query execution for Vertex AI Agent Engine.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import * as vscode from 'vscode';
import { GcloudDetector } from './deployer/GcloudDetector';
import { ArtifactStager } from './deployer/ArtifactStager';
import { ReasoningEngineClient } from './deployer/ReasoningEngineClient';
import { DeployPipeline } from './deployer/DeployPipeline';
import { PythonEnvResolver } from './PythonEnvResolver';
import { WebviewBridge } from './WebviewBridge';
import {
  DeploymentMetadataRecord,
  ActiveDeploymentRecord,
  AgentEngineDeployOptions,
  AgentEngineDeployResult,
  AgentEngineTestOptions,
  AgentEngineTestResult,
} from './deployer/DeployTypes';

// Re-export types for backwards compatibility with webviews and other components
export {
  DeploymentMetadataRecord,
  ActiveDeploymentRecord,
  AgentEngineDeployOptions,
  AgentEngineDeployResult,
  AgentEngineTestOptions,
  AgentEngineTestResult,
};

export class AgentEngineDeployer implements vscode.Disposable {
  // Shared state properties accessed by tests and sub-services
  public cachedAccessToken: string | null = null;
  public cachedAccessTokenExpiresAt = 0;
  public activeProcesses = new Map<string, any>();
  public activeDeployments = new Map<string, any>();
  public cancelledDirectories = new Set<string>();

  private gcloudDetector: GcloudDetector;
  private artifactStager: ArtifactStager;
  private reasoningEngineClient: ReasoningEngineClient;
  private deployPipeline: DeployPipeline;

  constructor(
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
    this.pythonResolver = pythonResolver || new PythonEnvResolver();
    this.gcloudDetector = new GcloudDetector(this);
    this.artifactStager = new ArtifactStager(this);
    this.reasoningEngineClient = new ReasoningEngineClient(
      this,
      this.gcloudDetector,
      this.artifactStager,
      this.pythonResolver
        ? {
            resolvePythonEnvironment: async () => {
              const res = await this.pythonResolver!.resolvePythonEnvironment();
              return res ? { path: res.path } : null;
            },
          }
        : undefined
    );
    this.deployPipeline = new DeployPipeline(
      this.gcloudDetector,
      this.artifactStager,
      this.reasoningEngineClient,
      this.pythonResolver
    );

    // Override deployPipeline's maps to use the facade's shared map instances
    (this.deployPipeline as any).activeProcesses = this.activeProcesses;
    (this.deployPipeline as any).activeDeployments = this.activeDeployments;
    (this.deployPipeline as any).cancelledDirectories = this.cancelledDirectories;
  }

  // Delegate helper methods
  public ensureIgnoreFiles(targetDirectory: string): void {
    this.artifactStager.ensureIgnoreFiles(targetDirectory);
  }

  public cleanupAdkTempDirectories(targetDirectory: string, deployStartTime?: number): void {
    this.artifactStager.cleanupAdkTempDirectories(targetDirectory, deployStartTime);
  }

  public validateTargetDirectory(targetDir: string) {
    return this.artifactStager.validateTargetDirectory(targetDir);
  }

  public readDeploymentMetadata(targetDir: string): DeploymentMetadataRecord | null {
    return this.artifactStager.readDeploymentMetadata(targetDir);
  }

  public writeDeploymentMetadata(targetDir: string, meta: DeploymentMetadataRecord): void {
    this.artifactStager.writeDeploymentMetadata(targetDir, meta);
  }

  public saveDeploymentMetadata(targetDir: string, meta: DeploymentMetadataRecord): void {
    this.artifactStager.saveDeploymentMetadata(targetDir, meta);
  }

  public ensureManifestFile(targetDirectory: string, options: AgentEngineDeployOptions): void {
    this.artifactStager.ensureManifestFile(targetDirectory, options);
  }

  public ensureAgentEngineConfig(targetDirectory: string): void {
    this.artifactStager.ensureAgentEngineConfig(targetDirectory);
  }

  public ensurePyProjectToml(targetDirectory: string, options: AgentEngineDeployOptions): void {
    this.artifactStager.ensurePyProjectToml(targetDirectory, options);
  }

  public ensureAgentRuntimeApp(targetDirectory: string): void {
    this.artifactStager.ensureAgentRuntimeApp(targetDirectory);
  }

  public ensureAgentImports(targetDirectory: string): void {
    this.artifactStager.ensureAgentImports(targetDirectory);
  }

  public stageAgentDirectory(src: string, dest: string): void {
    this.artifactStager.stageAgentDirectory(src, dest);
  }

  // Delegate CLI argument building and strings
  public buildDeployArgs(options: AgentEngineDeployOptions, existingMetadata?: DeploymentMetadataRecord | null): string[] {
    return this.deployPipeline.buildDeployArgs(options, existingMetadata);
  }

  public buildAdkDeployArgs(options: AgentEngineDeployOptions, existingMetadata?: DeploymentMetadataRecord | null): string[] {
    return this.deployPipeline.buildAdkDeployArgs(options, existingMetadata);
  }

  public getDeployCommandString(options: AgentEngineDeployOptions): string {
    return this.deployPipeline.getDeployCommandString(options);
  }

  // Delegate execution pipeline
  public deploy(options: AgentEngineDeployOptions): Promise<AgentEngineDeployResult> {
    return this.deployPipeline.deploy(options);
  }

  public deployAgentEngine = (options: AgentEngineDeployOptions): Promise<AgentEngineDeployResult> => {
    return this.deploy(options);
  };

  public cancelDeployment(targetDir?: string, bridge?: WebviewBridge): boolean {
    return this.deployPipeline.cancelDeployment(targetDir, bridge);
  }

  public getDeploymentStatus(targetDir: string, bridge?: WebviewBridge): DeploymentMetadataRecord | null {
    return this.deployPipeline.getDeploymentStatus(targetDir, bridge);
  }

  // Delegate gcloud & PATH environment methods
  public getExtendedEnv(extraEnv?: NodeJS.ProcessEnv, targetDirectory?: string): NodeJS.ProcessEnv {
    return this.gcloudDetector.getExtendedEnv(extraEnv, targetDirectory);
  }

  public resolveGcloudPath(): Promise<string> {
    return this.gcloudDetector.resolveGcloudPath();
  }

  public hasBinary(binaryName: string, targetDirectory?: string): boolean {
    return this.gcloudDetector.hasBinary(binaryName, targetDirectory);
  }

  public getAccessTokenHeader(): Promise<string> {
    return this.gcloudDetector.getAccessTokenHeader();
  }

  public getIdentityTokenHeader(): Promise<string> {
    return this.gcloudDetector.getIdentityTokenHeader();
  }

  // Delegate remote engine client methods
  public findExistingReasoningEngine(projectId: string, region: string, displayName: string): Promise<string | null> {
    return this.reasoningEngineClient.findExistingReasoningEngine(projectId, region, displayName);
  }

  public testRemoteAgentRuntime(options: AgentEngineTestOptions): Promise<AgentEngineTestResult> {
    return this.reasoningEngineClient.testRemoteAgentRuntime(options);
  }

  public resolveConsoleUrl(location: string, projectId: string, resourceId: string): string {
    return this.reasoningEngineClient.resolveConsoleUrl(location, projectId, resourceId);
  }

  public resolveEndpointUrl(location: string, projectId: string, resourceId: string): string {
    return this.reasoningEngineClient.resolveEndpointUrl(location, projectId, resourceId);
  }

  public isReasoningEngineNotFoundError(message?: string, logs: string[] = []): boolean {
    return this.reasoningEngineClient.isReasoningEngineNotFoundError(message, logs);
  }

  public formatErrorMessage(err: any): string {
    return this.reasoningEngineClient.formatErrorMessage(err);
  }

  public performHttpQuery(
    serviceUrl: string,
    query: string,
    abortSignal?: AbortSignal,
    onChunk?: (chunkText: string) => void,
    existingSessionId?: string
  ): Promise<{ response: string; remoteSessionId?: string }> {
    return this.reasoningEngineClient.performHttpQueryInternal(serviceUrl, query, abortSignal, onChunk, existingSessionId);
  }

  public dispose(): void {
    this.cancelDeployment();
  }
}
