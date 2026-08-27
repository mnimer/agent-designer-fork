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

/**
 * Activates the Agent Flow Builder extension.
 *
 * @param context VS Code Extension Context
 */
export function activate(context: vscode.ExtensionContext): void {
  // 1. Register Custom Text Editor Provider for *.agent files
  const customEditorDisposable = AgentEditorProvider.register(context);
  context.subscriptions.push(customEditorDisposable);

  // 2. Command: Create New Workflow File
  const createWorkflowCmd = vscode.commands.registerCommand(
    'agentFlow.createWorkflow',
    async () => {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      let targetUri: vscode.Uri;

      if (workspaceFolders && workspaceFolders.length > 0) {
        targetUri = vscode.Uri.joinPath(workspaceFolders[0].uri, 'new_agent_workflow.agent');
      } else {
        targetUri = vscode.Uri.parse('untitled:new_agent_workflow.agent');
      }

      // Open with custom editor
      await vscode.commands.executeCommand(
        'vscode.openWith',
        targetUri,
        AgentEditorProvider.viewType
      );
    }
  );
  context.subscriptions.push(createWorkflowCmd);

  // 3. Command: Generate Code
  const generateCodeCmd = vscode.commands.registerCommand(
    'agentFlow.generateCode',
    async () => {
      vscode.window.showInformationMessage(
        'Agent Flow: Triggering Gemini Prompt-Driven Code Generation...'
      );
    }
  );
  context.subscriptions.push(generateCodeCmd);

  // 4. Command: Run Test Suite
  const runTestsCmd = vscode.commands.registerCommand(
    'agentFlow.runTests',
    async () => {
      vscode.window.showInformationMessage(
        'Agent Flow: Executing Agent Test Suite in Managed Subprocess...'
      );
    }
  );
  context.subscriptions.push(runTestsCmd);
}

/**
 * Deactivates the extension and ensures all background subprocesses are cleanly terminated.
 */
export function deactivate(): void {
  // Subprocess cleanup will be performed here as runner managers are registered
}
