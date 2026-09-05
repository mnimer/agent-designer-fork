/**
 * AgentEngineDeploymentsTreeProvider
 *
 * TreeDataProvider implementation for the VS Code Activity Bar "Deployments & Runtimes" view.
 * Inspects the workspace for `deployment_metadata.json` records (generated when workflows are
 * deployed to Google Cloud Vertex AI Agent Engine or Cloud Run) and queries active local runner sessions.
 *
 * Job in Application:
 * Provides immediate situational awareness of live agent runtimes, deployment targets,
 * remote endpoints, and active local runner subprocesses directly in the extension sidebar.
 *
 * Architectural Decisions:
 * 1. Dual Telemetry Sources: Aggregates both persisted cloud deployment metadata (`deployment_metadata.json`)
 *    and live in-memory local runner subprocesses (`AgentEditorProvider.getAllActiveRunners()`).
 * 2. Reactive Invalidation: FileSystemWatcher watches for `deployment_metadata.json` lifecycle events so the
 *    view updates the moment `agents-cli deploy` or Cloud Build completes.
 * 3. Helpful Empty State: When neither cloud deployments nor local runners are active, displays a friendly
 *    guidance item directing users to the diagram's Deployment Tab.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { AgentEditorProvider } from '../AgentEditorProvider';

/**
 * Deployment metadata record schema as emitted by `agents-cli deploy`.
 */
export interface DeploymentMetadataRecord {
  remote_agent_runtime_id?: string;
  deployment_target?: string;
  is_a2a?: boolean;
  agent_directory?: string;
  deployment_timestamp?: string;
  service_url?: string;
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

      const target = meta.deployment_target || 'agent_runtime';
      const formattedTimestamp = meta.deployment_timestamp
        ? new Date(meta.deployment_timestamp).toLocaleDateString()
        : 'recent';

      this.description = `${target} • ${formattedTimestamp}`;

      this.tooltip = new vscode.MarkdownString(
        `**Vertex AI Agent Runtime**\n\n` +
        `- **Runtime ID**: \`${fullId}\`\n` +
        `- **Target**: ${target}\n` +
        `- **Agent Directory**: ${meta.agent_directory || 'app'}\n` +
        `- **A2A Enabled**: ${meta.is_a2a ? 'Yes' : 'No'}\n` +
        `- **Deployed**: ${meta.deployment_timestamp || 'N/A'}\n` +
        `${this.fileUri ? `- **Metadata File**: ${this.fileUri.fsPath}` : ''}`
      ).value;

      // Cloud icon with status color
      this.iconPath = new vscode.ThemeIcon('cloud', new vscode.ThemeColor('charts.green'));
      this.contextValue = 'deploymentItem';

      // Open metadata file on click if available
      if (this.fileUri) {
        this.command = {
          command: 'vscode.open',
          title: 'Open Deployment Metadata',
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
      ).value;

      // Play icon indicating local active process
      this.iconPath = new vscode.ThemeIcon('play-circle', new vscode.ThemeColor('charts.blue'));
      this.contextValue = 'localRunnerItem';
    } else {
      // Empty state placeholder
      super('No active deployments found', vscode.TreeItemCollapsibleState.None);

      this.itemType = 'empty';
      this.description = 'Deploy via Deployment Tab';
      this.tooltip =
        'No active local runner sessions or deployment_metadata.json files found. ' +
        'Open a workflow and switch to the Deployment Tab to deploy to Vertex AI Agent Engine or Cloud Run.';
      this.iconPath = new vscode.ThemeIcon('info');
      this.contextValue = 'emptyDeploymentItem';
    }
  }
}

/**
 * Tree Data Provider for Deployments and Active Runtimes.
 */
export class AgentEngineDeploymentsTreeProvider
  implements vscode.TreeDataProvider<DeploymentTreeItem>, vscode.Disposable {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<DeploymentTreeItem | undefined | void>();
  public readonly onDidChangeTreeData: vscode.Event<DeploymentTreeItem | undefined | void> =
    this._onDidChangeTreeData.event;

  private fileWatcher?: vscode.FileSystemWatcher;
  private disposables: vscode.Disposable[] = [];

  /**
   * Initializes the AgentEngineDeploymentsTreeProvider and watches deployment metadata files.
   */
  constructor() {
    this.initializeFileWatcher();
  }

  /**
   * Watches `deployment_metadata.json` files for changes to update deployment status reactively.
   */
  private initializeFileWatcher(): void {
    try {
      this.fileWatcher = vscode.workspace.createFileSystemWatcher('**/deployment_metadata.json');

      this.disposables.push(
        this.fileWatcher.onDidCreate(() => this.refresh()),
        this.fileWatcher.onDidChange(() => this.refresh()),
        this.fileWatcher.onDidDelete(() => this.refresh()),
        this.fileWatcher
      );
    } catch (err) {
      // NOTE: File watcher creation might throw in isolated mock test environments
      console.warn('[AgentEngineDeploymentsTreeProvider] Could not create file watcher:', err);
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

    // 1. Gather active local runner sessions
    try {
      const activeRunners = AgentEditorProvider.getAllActiveRunners();
      for (const runner of activeRunners) {
        items.push(new DeploymentTreeItem('runner', { runnerInfo: runner }));
      }
    } catch {
      // Ignore errors querying runner sessions
    }

    // 2. Discover deployment_metadata.json files in the workspace
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

          items.push(new DeploymentTreeItem('deployment', { metadata: meta, fileUri }));
        } catch {
          // Skip corrupt or unreadable metadata files
        }
      }
    } catch {
      // Workspace file search error handling
    }

    // 3. Fallback to empty state item if no active deployments or runners exist
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
