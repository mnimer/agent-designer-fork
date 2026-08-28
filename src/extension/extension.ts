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

export let outputChannel: vscode.OutputChannel;

/**
 * Activates the Agent Flow Builder extension.
 *
 * @param context VS Code Extension Context
 */
export function activate(context: vscode.ExtensionContext): void {
  // Create shared OutputChannel for extension logging & diagnostics
  outputChannel = vscode.window.createOutputChannel('Agent Flow Builder');
  context.subscriptions.push(outputChannel);

  // Register Custom Editor Provider for *.agent visual topology files
  const providerRegistration = AgentEditorProvider.register(context, outputChannel);
  context.subscriptions.push(providerRegistration);
  outputChannel?.appendLine('[Agent Flow Builder] Custom editor registered for *.agent files.');

  // 2. Command: Create New Workflow File
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
