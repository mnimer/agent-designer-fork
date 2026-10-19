/**
 * Visual Studio Code Agent Flow Builder — Extension Entry Point
 *
 * Coordinates extension lifecycle, registers custom editor provider for *.agent files,
 * registers workspace commands, and handles clean deactivation.
 *
 * Architectural Decisions:
 * 1. Centralized command registration for workbench integration.
 * 2. Asynchronously registers custom editor provider with lazy webview initialization.
 * 3. Registers process group cleanup hooks on extension deactivation.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

 
import * as vscode from 'vscode';
import { AgentEditorProvider } from './AgentEditorProvider';
import { SecretsProvider } from './security/SecretsProvider';
import {
  WorkflowExplorerTreeProvider,
  WorkflowTreeItem,
} from './views/WorkflowExplorerTreeProvider';
import {
  AgentEngineDeploymentsTreeProvider,
  DeploymentTreeItem,
} from './views/AgentEngineDeploymentsTreeProvider';

export let outputChannel: vscode.OutputChannel;

/**
 * Activates the Agent Flow Builder extension.
 *
 * @param context VS Code Extension Context
 */
export function activate(context: vscode.ExtensionContext): void {
  // 1. Create shared OutputChannel for extension logging & diagnostics
  outputChannel = vscode.window.createOutputChannel('Agent Flow Builder');
  context.subscriptions.push(outputChannel);

  // Initialize secure secrets storage provider
  const secretsProvider = SecretsProvider.init(context.secrets);

  // Perform global configuration-to-SecretStorage migration if needed
  const config = vscode.workspace.getConfiguration('agentFlow');
  secretsProvider.migrateFromSettings(config).then((migrated) => {
    if (migrated) {
      vscode.window.showInformationMessage('Migrated Gemini API key to secure VS Code SecretStorage.');
    }
  }).catch((err) => {
    outputChannel?.appendLine(`[Agent Flow Builder] Error migrating legacy API key configuration: ${err}`);
  });

  // 2. Register Custom Editor Provider for *.agent visual topology files
  const providerRegistration = AgentEditorProvider.register(context, outputChannel);
  context.subscriptions.push(providerRegistration);
  outputChannel?.appendLine('[Agent Flow Builder] Custom editor registered for *.agent files.');

  // 3. Register Sidebar Views & Tree Data Providers
  const workflowExplorerProvider = new WorkflowExplorerTreeProvider();
  const deploymentsProvider = new AgentEngineDeploymentsTreeProvider();

  context.subscriptions.push(
    workflowExplorerProvider,
    deploymentsProvider,
    vscode.window.registerTreeDataProvider('agentFlow.views.workflows', workflowExplorerProvider),
    vscode.window.registerTreeDataProvider('agentFlow.views.deployments', deploymentsProvider)
  );

  // 4. Register Sidebar Commands
  const newWorkflowCmd = vscode.commands.registerCommand(
    'agentFlow.sidebar.newWorkflow',
    async (folderUri?: any) => {
      await workflowExplorerProvider.newWorkflow(folderUri);
    }
  );
  context.subscriptions.push(newWorkflowCmd);

  const refreshWorkflowsCmd = vscode.commands.registerCommand(
    'agentFlow.sidebar.refreshWorkflows',
    () => {
      workflowExplorerProvider.refresh();
    }
  );
  context.subscriptions.push(refreshWorkflowsCmd);

  const duplicateWorkflowCmd = vscode.commands.registerCommand(
    'agentFlow.sidebar.duplicateWorkflow',
    async (item?: any) => {
      await workflowExplorerProvider.duplicateWorkflow(item);
    }
  );
  context.subscriptions.push(duplicateWorkflowCmd);

  const deleteWorkflowCmd = vscode.commands.registerCommand(
    'agentFlow.sidebar.deleteWorkflow',
    async (item?: any) => {
      await workflowExplorerProvider.deleteWorkflow(item);
    }
  );
  context.subscriptions.push(deleteWorkflowCmd);

  const refreshDeploymentsCmd = vscode.commands.registerCommand(
    'agentFlow.sidebar.refreshDeployments',
    () => {
      deploymentsProvider.refresh();
    }
  );
  context.subscriptions.push(refreshDeploymentsCmd);

  // 5. Command: Create New Workflow File (command palette)
  const createWorkflowCmd = vscode.commands.registerCommand(
    'agentFlow.createWorkflow',
    async () => {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      let targetUri: vscode.Uri;

      if (workspaceFolders && workspaceFolders.length > 0) {
        let fileName = 'new_agent_workflow.agent';
        let counter = 1;
        targetUri = vscode.Uri.joinPath(workspaceFolders[0].uri, fileName);

        // Ensure we do not overwrite an existing file
        while (true) {
          try {
            await vscode.workspace.fs.stat(targetUri);
            fileName = `new_agent_workflow_${counter++}.agent`;
            targetUri = vscode.Uri.joinPath(workspaceFolders[0].uri, fileName);
          } catch {
            // File does not exist yet, proceed
            break;
          }
        }

        const baseName = fileName.replace(/\.agent$/, '');
        const defaultDoc = AgentEditorProvider.createDefaultWorkflowDocument(baseName);
        const content = Buffer.from(JSON.stringify(defaultDoc, null, 2), 'utf8');
        await vscode.workspace.fs.writeFile(targetUri, content);
      } else {
        const defaultDoc = AgentEditorProvider.createDefaultWorkflowDocument('new_agent_workflow');
        const doc = await vscode.workspace.openTextDocument({
          language: 'json',
          content: JSON.stringify(defaultDoc, null, 2),
        });
        targetUri = doc.uri;
      }

      // Pre-load the text document model into VS Code's internal registry
      await vscode.workspace.openTextDocument(targetUri);

      // Open with custom editor
      await vscode.commands.executeCommand(
        'vscode.openWith',
        targetUri,
        AgentEditorProvider.viewType
      );
    }
  );
  context.subscriptions.push(createWorkflowCmd);

  // 6. Command: Generate Code
  const generateCodeCmd = vscode.commands.registerCommand(
    'agentFlow.generateCode',
    async () => {
      vscode.window.showInformationMessage(
        'Agent Flow: Triggering Gemini Prompt-Driven Code Generation...'
      );
    }
  );
  context.subscriptions.push(generateCodeCmd);

  // 7. Command: Run Test Suite
  const runTestsCmd = vscode.commands.registerCommand(
    'agentFlow.runTests',
    async () => {
      vscode.window.showInformationMessage(
        'Agent Flow: Executing Agent Test Suite in Managed Subprocess...'
      );
    }
  );
  context.subscriptions.push(runTestsCmd);

  // 8. Command: Deploy to Agent Runtime
  const deployAgentEngineCmd = vscode.commands.registerCommand(
    'agentFlow.deployToAgentEngine',
    async () => {
      vscode.window.showInformationMessage(
        'Agent Flow: Open the Deployment tab in the Agent Designer to configure and deploy to Agent Runtime.'
      );
    }
  );
  context.subscriptions.push(deployAgentEngineCmd);

  // 9. Command: Set Gemini API Key (Command Palette wrapper)
  const setApiKeyCmd = vscode.commands.registerCommand(
    'agentFlow.setGeminiApiKey',
    async () => {
      const input = await vscode.window.showInputBox({
        title: 'Agent Flow: Set Gemini API Key',
        prompt: 'Enter your Gemini API key (stored securely in VS Code SecretStorage)',
        password: true,
        ignoreFocusOut: true,
      });

      if (input !== undefined) {
        if (input.trim() === '') {
          await secretsProvider.deleteGeminiApiKey();
          vscode.window.showInformationMessage('Gemini API key has been cleared.');
        } else {
          await secretsProvider.setGeminiApiKey(input.trim());
          vscode.window.showInformationMessage('Gemini API key has been securely saved.');
        }
      }
    }
  );
  context.subscriptions.push(setApiKeyCmd);

  // 10. Command: Clear Gemini API Key
  const clearApiKeyCmd = vscode.commands.registerCommand(
    'agentFlow.clearGeminiApiKey',
    async () => {
      await secretsProvider.deleteGeminiApiKey();
      vscode.window.showInformationMessage('Gemini API key has been securely cleared from SecretStorage.');
    }
  );
  context.subscriptions.push(clearApiKeyCmd);
}

/**
 * Deactivates the extension and ensures all background subprocesses are cleanly terminated.
 */
export function deactivate(): void {
  AgentEditorProvider.disposeAll();
  SecretsProvider.resetInstance();
}
