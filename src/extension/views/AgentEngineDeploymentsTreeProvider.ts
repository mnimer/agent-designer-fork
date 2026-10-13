/**
 * AgentEngineDeploymentsTreeProvider
 *
 * TreeDataProvider implementation for the VS Code Activity Bar "Deployments & Runtimes" view.
 * Inspects the workspace for `.agent` workflow documents containing active deployment metadata
 * (and legacy `deployment_metadata.json` files for backward compatibility) and queries active
 * local runner sessions.
 *
 * Job in Application:
 * Provides immediate situational awareness of live agent runtimes, deployment targets,
 * remote endpoints, and active local runner subprocesses directly in the extension sidebar,
 * using the `.agent` file as the single source of truth for deployment state.
 *
 * Architectural Decisions:
 * 1. Single Source of Truth: Reads deployment state directly from the `.agent` file's `deployment` block,
 *    eliminating redundant `deployment_metadata.json` sidecar files in generated code repositories.
 * 2. Dual Telemetry Sources: Aggregates both persisted cloud deployment metadata (.agent files)
 *    and live in-memory local runner subprocesses (`AgentEditorProvider.getAllActiveRunners()`).
 * 3. Reactive Invalidation: FileSystemWatcher watches for both agent files and deployment_metadata.json
 *    lifecycle events so the view updates the moment a deployment completes.
 * 4. Backward Compatibility: Still inspects standalone `deployment_metadata.json` files if present.
 * 5. Helpful Empty State: When neither cloud deployments nor local runners are active, displays a friendly
 *    guidance item directing users to the diagram's Deployment Tab.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { AgentEditorProvider } from '../AgentEditorProvider';

/**
 * Deployment metadata record schema representing cloud runtime configuration.
 */
export interface DeploymentMetadataRecord {
  remote_agent_runtime_id?: string;
  deployment_target?: string;
  is_a2a?: boolean;
  agent_directory?: string;
  deployment_timestamp?: string;
  service_url?: string;
  console_url?: string;
  status?: string;
  [key: string]: any;
}

/**
 * Descriptor for an active local test runner session.
 */
export interface LocalRunnerDescriptor {
  id: string;
  pid?: number;
  port?: number;
  status: string;
}

/**
 * Tree Item representing a deployed runtime, an active local runner, or an empty state placeholder.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */
export class DeploymentTreeItem extends vscode.TreeItem {
  public readonly itemType: 'deployment' | 'runner' | 'empty';
  public readonly deploymentMetadata?: DeploymentMetadataRecord;
  public readonly runnerInfo?: LocalRunnerDescriptor;
  public readonly fileUri?: vscode.Uri;

  /**
   * Constructs a DeploymentTreeItem.
   *
   * @param itemType Category of deployment tree item
   * @param options Configuration properties for the item
   */
  constructor(
    itemType: 'deployment' | 'runner' | 'empty',
    options?: {
      metadata?: DeploymentMetadataRecord;
      runnerInfo?: LocalRunnerDescriptor;
      fileUri?: vscode.Uri;
    }
  ) {
    if (itemType === 'deployment') {
      const meta = options?.metadata || {};
      const fullId = meta.remote_agent_runtime_id || 'Unknown Engine Runtime';
      const shortId = fullId.split('/').pop() || fullId;
      super(shortId, vscode.TreeItemCollapsibleState.None);

      this.itemType = 'deployment';
      this.deploymentMetadata = meta;
      this.fileUri = options?.fileUri;

      const target = meta.deployment_target || 'agent_engine';
      const formattedTimestamp = meta.deployment_timestamp
        ? new Date(meta.deployment_timestamp).toLocaleDateString()
        : 'recent';

      this.description = `${target} • ${formattedTimestamp}`;

      this.tooltip = new vscode.MarkdownString(
        `**Agent Runtime**\n\n` +
        `- **Runtime ID**: \`${fullId}\`\n` +
        `- **Target**: ${target}\n` +
        `- **Agent Directory**: ${meta.agent_directory || 'app'}\n` +
        `- **A2A Enabled**: ${meta.is_a2a ? 'Yes' : 'No'}\n` +
        `- **Deployed**: ${meta.deployment_timestamp || 'N/A'}\n` +
        `${this.fileUri ? `- **Source File**: ${this.fileUri.fsPath}` : ''}`
      );

      // Cloud icon with status color
      this.iconPath = new vscode.ThemeIcon('cloud', new vscode.ThemeColor('charts.green'));
      this.contextValue = 'deploymentItem';

      // Open source file on click if available
      if (this.fileUri) {
        this.command = {
          command: 'vscode.open',
          title: 'Open Deployment Source',
          arguments: [this.fileUri],
        };
      }
    } else if (itemType === 'runner') {
      const runner = options?.runnerInfo || { id: 'unknown', status: 'running' };
      const port = runner.port || 8000;
      super(`Local Runner (Port ${port})`, vscode.TreeItemCollapsibleState.None);

      this.itemType = 'runner';
      this.runnerInfo = runner;

      const pidLabel = runner.pid ? `PID ${runner.pid}` : 'Active';
      this.description = `${runner.status.toUpperCase()} • ${pidLabel}`;

      this.tooltip = new vscode.MarkdownString(
        `**Local Test Server Subprocess**\n\n` +
        `- **Runner ID**: ${runner.id}\n` +
        `- **Status**: ${runner.status}\n` +
        `- **PID**: ${runner.pid ?? 'N/A'}\n` +
        `- **Port**: ${port}\n` +
        `- **Endpoint**: \`http://localhost:${port}/v1/chat/completions\``
      );

      // Play icon indicating local active process
      this.iconPath = new vscode.ThemeIcon('play-circle', new vscode.ThemeColor('charts.blue'));
      this.contextValue = 'localRunnerItem';
    } else {
      // Empty state placeholder
      super('No active deployments found', vscode.TreeItemCollapsibleState.None);

      this.itemType = 'empty';
      this.description = 'Deploy via Deployment Tab';
      this.tooltip =
        'No active local runner sessions or deployed .agent workflows found. ' +
        'Open a workflow and switch to the Deployment Tab to deploy to Agent Runtime or Cloud Run.';
      this.iconPath = new vscode.ThemeIcon('info');
      this.contextValue = 'emptyDeploymentItem';
    }
  }
}

/**
 * Tree Data Provider for Deployments and Active Runtimes.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */
export class AgentEngineDeploymentsTreeProvider
  implements vscode.TreeDataProvider<DeploymentTreeItem>, vscode.Disposable {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<DeploymentTreeItem | undefined | void>();
  public readonly onDidChangeTreeData: vscode.Event<DeploymentTreeItem | undefined | void> =
    this._onDidChangeTreeData.event;

  private agentFileWatcher?: vscode.FileSystemWatcher;
  private legacyMetaWatcher?: vscode.FileSystemWatcher;
  private disposables: vscode.Disposable[] = [];

  /**
   * Initializes the AgentEngineDeploymentsTreeProvider and registers file watchers.
   */
  constructor() {
    this.initializeFileWatchers();
  }

  /**
   * Watches `.agent` files and legacy `deployment_metadata.json` files for changes.
   */
  private initializeFileWatchers(): void {
    // Section 1: Watch .agent files (primary single source of truth)
    try {
      this.agentFileWatcher = vscode.workspace.createFileSystemWatcher('**/*.agent');
      this.disposables.push(
        this.agentFileWatcher.onDidCreate(() => this.refresh()),
        this.agentFileWatcher.onDidChange(() => this.refresh()),
        this.agentFileWatcher.onDidDelete(() => this.refresh()),
        this.agentFileWatcher
      );
    } catch (err) {
      // NOTE: File watcher creation might throw in isolated mock test environments
      console.warn('[AgentEngineDeploymentsTreeProvider] Could not create .agent file watcher:', err);
    }

    // Section 2: Watch legacy deployment_metadata.json files for backward compatibility
    try {
      this.legacyMetaWatcher = vscode.workspace.createFileSystemWatcher('**/deployment_metadata.json');
      this.disposables.push(
        this.legacyMetaWatcher.onDidCreate(() => this.refresh()),
        this.legacyMetaWatcher.onDidChange(() => this.refresh()),
        this.legacyMetaWatcher.onDidDelete(() => this.refresh()),
        this.legacyMetaWatcher
      );
    } catch (err) {
      console.warn('[AgentEngineDeploymentsTreeProvider] Could not create metadata file watcher:', err);
    }
  }

  /**
   * Triggers a refresh of the deployments tree view.
   */
  public refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  /**
   * Returns the TreeItem representation of an element.
   *
   * @param element DeploymentTreeItem instance
   * @returns vscode.TreeItem
   */
  public getTreeItem(element: DeploymentTreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * Resolves the children of the deployments tree view.
   *
   * @param element Optional parent tree item (deployments view is flat)
   * @returns Array of DeploymentTreeItem items
   */
  public async getChildren(element?: DeploymentTreeItem): Promise<DeploymentTreeItem[]> {
    if (element) {
      return [];
    }

    const items: DeploymentTreeItem[] = [];
    const discoveredIds = new Set<string>();

    // Section 1: Gather active local runner sessions
    try {
      const activeRunners = AgentEditorProvider.getAllActiveRunners();
      for (const runner of activeRunners) {
        items.push(new DeploymentTreeItem('runner', { runnerInfo: runner }));
      }
    } catch {
      // Ignore errors querying runner sessions
    }

    // Section 2: Discover deployed instances from .agent workflow documents
    try {
      const agentFiles = await vscode.workspace.findFiles('**/*.agent', '**/node_modules/**');

      for (const fileUri of agentFiles) {
        try {
          const fileBytes = await vscode.workspace.fs.readFile(fileUri);
          const rawContent = Buffer.from(fileBytes).toString('utf-8');
          const doc = JSON.parse(rawContent);

          const deploy = doc.deployment;
          if (deploy && (deploy.deployedResourceId || deploy.serviceUrl)) {
            const runtimeId = deploy.deployedResourceId || 'Deployed Agent Runtime';
            discoveredIds.add(runtimeId);

            const meta: DeploymentMetadataRecord = {
              remote_agent_runtime_id: runtimeId,
              deployment_target: deploy.target || deploy.deploymentTarget || 'agent_engine',
              is_a2a: Boolean(deploy.is_a2a || deploy.isA2A),
              agent_directory: deploy.outputFolder || path.basename(fileUri.fsPath, '.agent'),
              deployment_timestamp: deploy.deployedAt || doc.metadata?.updatedAt,
              service_url: deploy.serviceUrl,
              console_url: deploy.consoleUrl,
              status: 'ACTIVE',
            };

            items.push(new DeploymentTreeItem('deployment', { metadata: meta, fileUri }));
          }
        } catch {
          // Skip corrupt or unreadable .agent files
        }
      }
    } catch {
      // Workspace file search error handling
    }

    // Section 3: Fallback discovery from legacy deployment_metadata.json files
    try {
      const metadataFiles = await vscode.workspace.findFiles(
        '**/deployment_metadata.json',
        '**/node_modules/**'
      );

      for (const fileUri of metadataFiles) {
        try {
          const fileBytes = await vscode.workspace.fs.readFile(fileUri);
          const rawContent = Buffer.from(fileBytes).toString('utf-8');
          const meta: DeploymentMetadataRecord = JSON.parse(rawContent);

          if (meta.remote_agent_runtime_id && !discoveredIds.has(meta.remote_agent_runtime_id)) {
            discoveredIds.add(meta.remote_agent_runtime_id);
            items.push(new DeploymentTreeItem('deployment', { metadata: meta, fileUri }));
          }
        } catch {
          // Skip corrupt or unreadable metadata files
        }
      }
    } catch {
      // Workspace file search error handling
    }

    // Section 4: Fallback to empty state item if no active deployments or runners exist
    if (items.length === 0) {
      items.push(new DeploymentTreeItem('empty'));
    }

    return items;
  }

  /**
   * Disposes all registered event listeners and watchers.
   */
  public dispose(): void {
    this._onDidChangeTreeData.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}
