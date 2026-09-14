/**
 * WorkflowExplorerTreeProvider
 *
 * TreeDataProvider implementation for the VS Code Activity Bar "Workflows" sidebar view.
 * Scans the workspace for all `*.agent` files, parses high-level metadata (workflow name,
 * node count, target framework), and provides direct interaction commands (New, Duplicate, Delete, Open).
 *
 * Job in Application:
 * Serves as the primary navigation anchor inside the VS Code sidebar for multi-agent workflows,
 * giving developers instant visibility into workspace workflows without digging through the generic file explorer.
 *
 * Architectural Decisions:
 * 1. Reactive FileSystemWatcher: Uses `vscode.workspace.createFileSystemWatcher('**\/*.agent')` to automatically
 *    update the view on file creation, modification, and deletion without requiring manual refresh.
 * 2. Resilient Metadata Parsing: Safely reads and parses JSON files with fallback handling for unparsed or dirty files.
 * 3. Deep Editor Integration: Each tree item binds directly to `vscode.openWith(uri, 'agentFlow.editor')` for 1-click launch.
 * 4. Safe Mutation Commands: Duplicate and Delete workflows include user prompts, non-colliding filename generation,
 *    and system trash disposal for safety.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { AgentEditorProvider } from '../AgentEditorProvider';
import { AgentWorkflowDocument } from '../../shared/types';

/**
 * Tree Item representing an individual `*.agent` workflow file.
 */
export class WorkflowTreeItem extends vscode.TreeItem {
  public readonly uri: vscode.Uri;
  public readonly fileName: string;
  public readonly workflowName: string;
  public readonly nodeCount: number;
  public readonly framework: string;
  public readonly descriptionText?: string;

  /**
   * Constructs a WorkflowTreeItem representing an individual `.agent` workflow file.
   *
   * @param uri URI of the .agent file
   * @param workflowName Human-readable name of the agent workflow
   * @param nodeCount Number of nodes in the workflow topology
   * @param framework Target framework (e.g. google-adk, langgraph)
   * @param descriptionText Optional workflow summary description
   */
  constructor(
    uri: vscode.Uri,
    workflowName: string,
    nodeCount: number,
    framework: string,
    descriptionText?: string
  ) {
    const fileName = path.basename(uri.fsPath);
    super(fileName, vscode.TreeItemCollapsibleState.None);

    this.uri = uri;
    this.resourceUri = uri;
    this.fileName = fileName;
    this.workflowName = workflowName;
    this.nodeCount = nodeCount;
    this.framework = framework;
    this.descriptionText = descriptionText;

    // Format display description: e.g. "4 nodes • google-adk"
    const nodeLabel = nodeCount === 1 ? '1 node' : `${nodeCount} nodes`;
    this.description = `${nodeLabel} • ${framework}`;

    // Tooltip with detailed file path, title, and description
    this.tooltip = new vscode.MarkdownString(
      `**${fileName}**\n\n` +
      `${workflowName && workflowName !== fileName && workflowName !== path.basename(uri.fsPath, '.agent') ? `*${workflowName}*\n\n` : ''}` +
      `${descriptionText ? descriptionText + '\n\n' : ''}` +
      `- **Nodes**: ${nodeCount}\n` +
      `- **Framework**: ${framework}\n` +
      `- **Path**: ${uri.fsPath}`
    );

    // Icon representing agent topology / workflow graph
    this.iconPath = new vscode.ThemeIcon('symbol-structure');

    // Context value for contributing item-level actions (duplicate, delete)
    this.contextValue = 'workflowItem';

    // Click command: Open in Agent Flow Builder custom editor
    this.command = {
      command: 'vscode.openWith',
      title: 'Open Agent Flow',
      arguments: [uri, AgentEditorProvider.viewType],
    };
  }
}

/**
 * Safely extracts a valid vscode.Uri from various VS Code context arguments.
 * Handles vscode.Uri instances, WorkflowTreeItem instances, or plain URI objects.
 *
 * @param target Input argument from commands or tree views
 * @returns vscode.Uri if valid, or undefined
 */
export function extractValidUri(target: unknown): vscode.Uri | undefined {
  if (!target) {
    return undefined;
  }
  if (target instanceof vscode.Uri) {
    return target;
  }
  if (typeof target === 'object' && target !== null) {
    const candidate = target as Record<string, any>;
    if (candidate.uri instanceof vscode.Uri) {
      return candidate.uri;
    }
    if (typeof candidate.fsPath === 'string' && candidate.fsPath.length > 0) {
      return vscode.Uri.file(candidate.fsPath);
    }
    if (typeof candidate.path === 'string' && candidate.path.length > 0 && typeof candidate.scheme === 'string') {
      try {
        return vscode.Uri.file(candidate.fsPath || candidate.path);
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

/**
 * Tree Data Provider for Workspace Workflows Explorer.
 */
export class WorkflowExplorerTreeProvider
  implements vscode.TreeDataProvider<WorkflowTreeItem>, vscode.Disposable {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<WorkflowTreeItem | undefined | void>();
  public readonly onDidChangeTreeData: vscode.Event<WorkflowTreeItem | undefined | void> =
    this._onDidChangeTreeData.event;

  private fileWatcher?: vscode.FileSystemWatcher;
  private disposables: vscode.Disposable[] = [];

  /**
   * Initializes the WorkflowExplorerTreeProvider and establishes workspace file system watchers.
   */
  constructor() {
    this.initializeFileWatcher();
  }

  /**
   * Sets up a FileSystemWatcher targeting all `*.agent` files in the workspace.
   */
  private initializeFileWatcher(): void {
    try {
      this.fileWatcher = vscode.workspace.createFileSystemWatcher('**/*.agent');

      // Auto-refresh when files are created, modified, or deleted
      this.disposables.push(
        this.fileWatcher.onDidCreate(() => this.refresh()),
        this.fileWatcher.onDidChange(() => this.refresh()),
        this.fileWatcher.onDidDelete(() => this.refresh()),
        this.fileWatcher
      );
    } catch (err) {
      // NOTE: File watcher creation might throw in non-standard test environments
      console.warn('[WorkflowExplorerTreeProvider] Could not create file watcher:', err);
    }
  }

  /**
   * Triggers a refresh of the workflows tree view.
   */
  public refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  /**
   * Returns the TreeItem representation of an element.
   *
   * @param element WorkflowTreeItem instance
   * @returns vscode.TreeItem
   */
  public getTreeItem(element: WorkflowTreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * Resolves the children of the tree view.
   *
   * @param element Optional parent tree item (workflows are a flat workspace list)
   * @returns Array of WorkflowTreeItem items
   */
  public async getChildren(element?: WorkflowTreeItem): Promise<WorkflowTreeItem[]> {
    // Topologies are presented as a flat list under the explorer root
    if (element) {
      return [];
    }

    // Find all *.agent files in the current workspace, ignoring node_modules
    const files = await vscode.workspace.findFiles('**/*.agent', '**/node_modules/**');
    if (!files || files.length === 0) {
      return [];
    }

    // Sort files alphabetically by basename
    const sortedFiles = [...files].sort((a, b) =>
      path.basename(a.fsPath).localeCompare(path.basename(b.fsPath))
    );

    const items: WorkflowTreeItem[] = [];

    // Parse each workflow file to extract display metadata
    for (const uri of sortedFiles) {
      try {
        const fileBytes = await vscode.workspace.fs.readFile(uri);
        const rawContent = Buffer.from(fileBytes).toString('utf-8');
        const parsed: Partial<AgentWorkflowDocument> = JSON.parse(rawContent);

        const workflowName = parsed.name || path.basename(uri.fsPath, '.agent');
        const nodeCount = Array.isArray(parsed.nodes) ? parsed.nodes.length : 0;
        const framework = parsed.framework || 'google-adk';
        const description = parsed.description || '';

        items.push(new WorkflowTreeItem(uri, workflowName, nodeCount, framework, description));
      } catch (err) {
        // Fallback for empty or corrupt files
        const fallbackName = path.basename(uri.fsPath);
        items.push(new WorkflowTreeItem(uri, fallbackName, 0, 'google-adk', 'Unparsed workflow'));
      }
    }

    return items;
  }

  /**
   * Creates a new `.agent` workflow file in the workspace, populates default scaffolding,
   * and opens it in the custom editor.
   *
   * @param targetFolder Optional folder URI, TreeItem, or view context where the new file should be located
   * @returns URI of the newly created workflow file, or undefined if cancelled
   */
  public async newWorkflow(targetFolder?: unknown): Promise<vscode.Uri | undefined> {
    // 1. Determine destination directory from argument or active workspace
    let folder = extractValidUri(targetFolder);

    // If folder points to an existing file, resolve to its containing directory
    if (folder) {
      try {
        const stat = await vscode.workspace.fs.stat(folder);
        if ((stat.type & vscode.FileType.Directory) === 0) {
          folder = vscode.Uri.file(path.dirname(folder.fsPath));
        }
      } catch {
        if (folder.fsPath.endsWith('.agent') || path.extname(folder.fsPath)) {
          folder = vscode.Uri.file(path.dirname(folder.fsPath));
        }
      }
    }

    // Default to workspace folder if no valid folder was provided
    if (!folder) {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (workspaceFolders && workspaceFolders.length > 0) {
        folder = workspaceFolders[0].uri;
      }
    }

    // 2. Prompt user for workflow name
    const inputName = await vscode.window.showInputBox({
      title: 'New Agent Designer Workflow',
      prompt: 'Enter workflow name (without extension)',
      value: 'new_agent_workflow',
      validateInput: (val) => {
        if (!val || val.trim().length === 0) {
          return 'Workflow name cannot be empty';
        }
        if (/[/\\?%*:|"<>]/g.test(val)) {
          return 'Invalid characters in file name';
        }
        return null;
      },
    });

    if (!inputName) {
      return undefined;
    }

    const cleanBaseName = inputName.trim().replace(/\.agent$/i, '');
    let targetUri: vscode.Uri;

    // 3. Resolve target URI and ensure unique non-colliding file name
    if (folder) {
      let fileName = `${cleanBaseName}.agent`;
      targetUri = vscode.Uri.joinPath(folder, fileName);
      let counter = 1;
      while (true) {
        try {
          await vscode.workspace.fs.stat(targetUri);
          fileName = `${cleanBaseName}_${counter++}.agent`;
          targetUri = vscode.Uri.joinPath(folder, fileName);
        } catch {
          // File does not exist yet; safe to proceed
          break;
        }
      }

      // Write default scaffolded document
      const defaultDoc = AgentEditorProvider.createDefaultWorkflowDocument(
        fileName.replace(/\.agent$/, '')
      );
      const content = Buffer.from(JSON.stringify(defaultDoc, null, 2), 'utf-8');
      await vscode.workspace.fs.writeFile(targetUri, content);
    } else {
      // If no workspace folder is open, ask the user where to save the file
      const chosenUri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(`${cleanBaseName}.agent`),
        filters: {
          'Agent Workflows': ['agent'],
        },
        title: 'Save New Agent Designer Workflow',
        saveLabel: 'Create Workflow',
      });

      if (!chosenUri) {
        return undefined;
      }

      targetUri = chosenUri;
      const defaultDoc = AgentEditorProvider.createDefaultWorkflowDocument(
        path.basename(targetUri.fsPath, '.agent')
      );
      const content = Buffer.from(JSON.stringify(defaultDoc, null, 2), 'utf-8');
      await vscode.workspace.fs.writeFile(targetUri, content);
    }

    // 4. Preload and open in custom visual editor
    await vscode.commands.executeCommand(
      'vscode.openWith',
      targetUri,
      AgentEditorProvider.viewType
    );

    // Refresh tree
    this.refresh();
    return targetUri;
  }

  /**
   * Duplicates an existing workflow file, giving it a unique copy name, and opens it.
   *
   * @param item Selected WorkflowTreeItem or URI to duplicate
   * @returns URI of the duplicated file, or undefined if cancelled
   */
  public async duplicateWorkflow(item?: unknown): Promise<vscode.Uri | undefined> {
    const sourceUri = extractValidUri(item);
    if (!sourceUri) {
      vscode.window.showInformationMessage('Please select a workflow to duplicate.');
      return undefined;
    }

    // Read source document content
    let sourceContent: Uint8Array;
    try {
      sourceContent = await vscode.workspace.fs.readFile(sourceUri);
    } catch (err: any) {
      vscode.window.showErrorMessage(`Failed to read source workflow: ${err?.message || err}`);
      return undefined;
    }

    const sourceBaseName = path.basename(sourceUri.fsPath, '.agent');
    const defaultCopyName = `${sourceBaseName}_copy`;

    // Prompt user for duplicate workflow name
    const copyName = await vscode.window.showInputBox({
      title: 'Duplicate Agent Designer Workflow',
      prompt: 'Enter name for the duplicated workflow',
      value: defaultCopyName,
      validateInput: (val) => {
        if (!val || val.trim().length === 0) {
          return 'Workflow name cannot be empty';
        }
        return null;
      },
    });

    if (!copyName) {
      return undefined;
    }

    const cleanCopyName = copyName.trim().replace(/\.agent$/i, '');
    const parentDir = vscode.Uri.file(path.dirname(sourceUri.fsPath));
    let targetUri = vscode.Uri.joinPath(parentDir, `${cleanCopyName}.agent`);

    // Ensure non-colliding filename if destination already exists
    let counter = 1;
    while (true) {
      try {
        await vscode.workspace.fs.stat(targetUri);
        targetUri = vscode.Uri.joinPath(parentDir, `${cleanCopyName}_${counter++}.agent`);
      } catch {
        break;
      }
    }

    // Update the internal name attribute inside the duplicated JSON
    try {
      const parsed = JSON.parse(Buffer.from(sourceContent).toString('utf-8'));
      parsed.name = path.basename(targetUri.fsPath, '.agent');
      const updatedBytes = Buffer.from(JSON.stringify(parsed, null, 2), 'utf-8');
      await vscode.workspace.fs.writeFile(targetUri, updatedBytes);
    } catch {
      await vscode.workspace.fs.writeFile(targetUri, sourceContent);
    }

    // Open duplicate in custom editor
    await vscode.workspace.openTextDocument(targetUri);
    await vscode.commands.executeCommand(
      'vscode.openWith',
      targetUri,
      AgentEditorProvider.viewType
    );

    this.refresh();
    return targetUri;
  }

  /**
   * Prompts user confirmation and deletes the specified workflow file.
   *
   * @param item Selected WorkflowTreeItem or URI to delete
   * @returns true if deleted, false if cancelled or failed
   */
  public async deleteWorkflow(item?: unknown): Promise<boolean> {
    const targetUri = extractValidUri(item);
    if (!targetUri) {
      return false;
    }

    const fileName = path.basename(targetUri.fsPath);
    const confirm = await vscode.window.showWarningMessage(
      `Are you sure you want to delete "${fileName}"?`,
      { modal: true },
      'Delete'
    );

    if (confirm !== 'Delete') {
      return false;
    }

    try {
      await vscode.workspace.fs.delete(targetUri, { recursive: false, useTrash: true });
      this.refresh();
      return true;
    } catch (err: any) {
      vscode.window.showErrorMessage(`Failed to delete workflow: ${err?.message || err}`);
      return false;
    }
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
