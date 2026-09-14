/**
 * WebviewMessageRouter
 *
 * Registers and routes RPC messages from the webview panel to their respective
 * extension services (Runner, Deployer, Codegen, MCP, Settings, etc.).
 *
 * Architectural Decisions:
 * 1. Unified Message Routing: Centralizes message handlers in a single router, isolating
 *    complex RPC mechanics from the main CustomTextEditorProvider class.
 * 2. Dynamic Mock-Compatibility: Uses real-time property getters on the parent provider
 *    instance. This guarantees that any dynamic test mocks (e.g. provider.codeGenEngine = mock)
 *    are dynamically resolved in real-time, preserving test-suite fidelity.
 * 3. Shared State Sync: Uses DocumentSyncManager to read/write monotonically increasing revision
 *    numbers, preventing mutable variable captures across asynchronous callbacks.
 * 4. Strict Parameter Validation: Runs runtime type-guards on critical RPC inputs before
 *    dispatching to sub-services.
 * 5. Document-Relative Target Directory Resolution: Resolves target folders relative to the backing
 *    .agent document (via DocumentSyncManager), then validates workspace containment and blocks traversal
 *    attacks, ensuring nested workflows find dependencies like requirements.txt reliably.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { WebviewBridge } from '../WebviewBridge';
import { DocumentSyncManager } from './DocumentSyncManager';
import { GeminiCodeGenEngine } from '../GeminiCodeGenEngine';
import { AgentRunnerManager } from '../AgentRunnerManager';
import { AgentEngineDeployer } from '../AgentEngineDeployer';
import { McpSubprocessManager } from '../McpSubprocessManager';
import { McpOAuthManager } from '../McpOAuthManager';
import { SecretsProvider } from '../security/SecretsProvider';
import { assertInsideWorkspace, isPathInside } from '../security/pathGuard';
import { AgentEditorProvider } from '../AgentEditorProvider';
import { DEFAULT_EVENTARC_FALLBACK } from '../EventarcDiscoveryManager';
import {
  WebviewToExtensionMessage,
  isWriteFilesPayload,
  isStartRunnerPayload,
  isDiscoverMcpPayload,
} from '../../shared/rpcProtocol';

export class WebviewMessageRouter {
  private readonly provider: any;
  private readonly context: vscode.ExtensionContext;
  private readonly outputChannel?: vscode.OutputChannel;

  constructor(
    provider: any,
    context: vscode.ExtensionContext,
    outputChannel?: vscode.OutputChannel
  ) {
    this.provider = provider;
    this.context = context;
    this.outputChannel = outputChannel;
  }

  // --- Dynamic Mock-Compatible Property Getters ---

  private get codeGenEngine(): GeminiCodeGenEngine {
    return this.provider.codeGenEngine;
  }

  private get runnerManager(): AgentRunnerManager {
    return this.provider.runnerManager;
  }

  private get agentEngineDeployer(): AgentEngineDeployer {
    return this.provider.agentEngineDeployer;
  }

  private get mcpManager(): McpSubprocessManager {
    return this.provider.mcpManager;
  }

  private get mcpOAuthManager(): McpOAuthManager {
    return this.provider.mcpOAuthManager;
  }

  private get documentSyncManager(): DocumentSyncManager {
    return this.provider.documentSyncManager;
  }

  /**
   * Registers all webview message handlers on the provided WebviewBridge.
   *
   * @param bridge WebviewBridge instance to receive messages on
   * @param document Associated backing vscode.TextDocument
   * @param messageHandlers Custom external message handlers Map registered on the provider
   */
  public registerRoutes(
    bridge: WebviewBridge,
    document: vscode.TextDocument,
    messageHandlers: Map<
      string,
      (msg: WebviewToExtensionMessage, bridge: WebviewBridge, doc: vscode.TextDocument) => void
    >
  ): void {
    const uriStr = document.uri.toString();

    // 1. Diagnostics and Lifecycle Handlers
    bridge.onMessage('BOOTSTRAP_LOADED', (payload: any) => {
      this.outputChannel?.appendLine(`[AgentEditorProvider:Step 3a] Webview HTML container bootstrap loaded at ${payload?.timestamp}`);
    });

    bridge.onMessage('WEBVIEW_LOG', (payload) => {
      const level = payload?.level?.toUpperCase() || 'INFO';
      const msg = payload?.message || '';
      this.outputChannel?.appendLine(`[Webview:${level}] ${msg}`);
      if (payload?.stack) {
        this.outputChannel?.appendLine(`[Webview:${level}:Stack] ${payload.stack}`);
      }
    });

    bridge.onMessage('WEBVIEW_STATUS', (payload) => {
      this.outputChannel?.appendLine(`[Webview:STATUS] ${payload?.status || ''} ${JSON.stringify(payload?.details || '')}`);
    });

    bridge.onMessage('DIAGNOSTIC_ERROR', (payload) => {
      this.outputChannel?.appendLine(
        `[AgentEditorProvider:WEBVIEW_EXCEPTION] Error in webview: ${payload.message} (${payload.url}:${payload.line}:${payload.col})\nStack: ${payload.stack || 'none'}`
      );
      vscode.window.showErrorMessage(`Agent Flow Webview Error: ${payload.message}`);
    });

    // 2. Webview READY Hydration Handler
    bridge.onMessage('READY', async () => {
      try {
        this.outputChannel?.appendLine(
          `[AgentEditorProvider:Step 4] Webview sent READY signal for: ${document.uri.fsPath}`
        );

        if (this.documentSyncManager.checkAndHandleParseError(document, bridge)) {
          return;
        }

        const docText = document.getText();
        let parsedDoc: any;
        if (docText.trim().length > 0) {
          parsedDoc = JSON.parse(docText);
        } else {
          parsedDoc = this.documentSyncManager.createEmptyWorkflow(document.uri);
        }

        this.outputChannel?.appendLine(
          `[AgentEditorProvider:Step 5] Posting LOAD_DOCUMENT (nodes: ${parsedDoc.nodes?.length || 0}, edges: ${parsedDoc.edges?.length || 0})`
        );

        const relativeFilePath = vscode.workspace.asRelativePath(document.uri);
        const configuredFolder = parsedDoc.deployment?.outputFolder || parsedDoc.metadata?.outputFolder;
        const targetDir = this.documentSyncManager.resolveTargetDirectory(document, configuredFolder);
        const existingGeneratedFiles = this.documentSyncManager.loadGeneratedFilesFromDisk(targetDir);

        let docVersion = this.documentSyncManager.getDocumentVersion(uriStr);
        if (docVersion === 0) {
          docVersion = 1;
          this.documentSyncManager.setDocumentVersion(uriStr, 1);
        }

        await bridge.postMessage({
          type: 'LOAD_DOCUMENT',
          payload: {
            document: parsedDoc,
            docVersion: docVersion,
            filePath: relativeFilePath,
            readOnly: !vscode.workspace.isTrusted,
            generatedFiles: existingGeneratedFiles,
          },
        });

        const secretsProvider = SecretsProvider.getInstance();
        const hasApiKey = await secretsProvider.hasGeminiApiKey();
        await bridge.postMessage({
          type: 'SETTINGS_SYNC',
          payload: {
            geminiApiKeySet: hasApiKey || Boolean(process.env.GEMINI_API_KEY),
            targetFramework: parsedDoc.framework || 'google-adk',
            targetLanguage: parsedDoc.language || 'python',
          },
        });

        const discoveredSamples = this.provider.discoverResourceSamples();
        if (discoveredSamples && discoveredSamples.length > 0) {
          await bridge.postMessage({
            type: 'SAMPLES_LOADED',
            payload: {
              samples: discoveredSamples,
            },
          });
        }
      } catch (err) {
        console.error('[AgentEditorProvider] Error in READY handler:', err);
      }
    });

    // 3. Document Persistence & Sync Handler
    bridge.onMessage('DOCUMENT_UPDATED', async (payload) => {
      if (!payload) return;

      if (this.documentSyncManager.hasParseError(uriStr)) {
        this.outputChannel?.appendLine(
          `[AgentEditorProvider] Refused DOCUMENT_UPDATED on ${uriStr} because it is in a parse-error state.`
        );
        return;
      }

      const lastProcessed = this.documentSyncManager.getDocumentVersion(uriStr);
      if (payload.docVersion <= lastProcessed) {
        this.outputChannel?.appendLine(
          `[AgentEditorProvider] Discarded overlapping/stale DOCUMENT_UPDATED version ${payload.docVersion} (last handled: ${lastProcessed})`
        );
        return;
      }
      this.documentSyncManager.setDocumentVersion(uriStr, payload.docVersion);

      const updatedJson = JSON.stringify(payload.document, null, 2);

      if (document.getText() === updatedJson) {
        return;
      }

      const currentPending = this.documentSyncManager.getPendingEditsCount(uriStr);
      this.documentSyncManager.setPendingEditsCount(uriStr, currentPending + 1);

      try {
        const success = await this.documentSyncManager.updateTextDocument(document, updatedJson);
        if (!success) {
          const val = this.documentSyncManager.getPendingEditsCount(uriStr);
          if (val > 0) {
            this.documentSyncManager.setPendingEditsCount(uriStr, val - 1);
          }
        }
      } catch (err) {
        const val = this.documentSyncManager.getPendingEditsCount(uriStr);
        if (val > 0) {
          this.documentSyncManager.setPendingEditsCount(uriStr, val - 1);
        }
        throw err;
      }

      await bridge.postMessage({
        type: 'DOCUMENT_SAVED',
        payload: {
          docVersion: payload.docVersion,
          timestamp: new Date().toISOString(),
        },
      });
    });

    // 4. Code Generation & Export Handlers
    bridge.onMessage('GENERATE_CODE', async (payload) => {
      if (!payload) return;
      const secretsProvider = SecretsProvider.getInstance();
      const apiKey = (await secretsProvider.getGeminiApiKey()) || process.env.GEMINI_API_KEY || '';

      const targetDirPath = this.documentSyncManager.resolveTargetDirectory(document, payload.outputFolder);
      const targetDir = vscode.Uri.file(targetDirPath);

      await this.documentSyncManager.cleanTargetDirectory(targetDirPath, document);

      const deploymentTarget =
        payload.deploymentTarget ||
        payload.document?.metadata?.deploymentTarget ||
        'agent-engine';

      const result = await this.codeGenEngine.generateCode({
        document: payload.document,
        framework: payload.targetFramework,
        language: payload.targetLanguage,
        deploymentTarget: deploymentTarget,
        apiKey: apiKey,
        model: 'gemini-3.7-flash',
      });

      if (result.success && result.files.length > 0) {
        try {
          for (const file of result.files) {
            const fileUri = vscode.Uri.joinPath(targetDir, file.path);
            const parentDir = vscode.Uri.file(path.dirname(fileUri.fsPath));
            await vscode.workspace.fs.createDirectory(parentDir);
            const buffer = Buffer.from(file.content, 'utf-8');
            await vscode.workspace.fs.writeFile(fileUri, buffer);
          }

          // Copy any local Python tool files referenced in the workflow
          await this.provider.copyLocalToolFiles(payload.document, document, targetDirPath);

          vscode.window.showInformationMessage(
            `Agent Flow: Generated and saved ${result.files.length} files in ${path.basename(targetDir.fsPath)}`
          );

          await bridge.postMessage({
            type: 'CODE_GENERATED',
            payload: {
              success: true,
              files: result.files,
              targetDirectory: targetDir.fsPath,
              modelUsed: result.modelUsed,
            },
          });
        } catch (writeErr: any) {
          vscode.window.showErrorMessage(`Agent Flow: Failed to save generated files: ${writeErr.message}`);
          await bridge.postMessage({
            type: 'CODE_GENERATED',
            payload: {
              success: false,
              files: [],
              error: `Failed to write generated files to disk: ${writeErr.message}`,
              modelUsed: result.modelUsed,
            },
          });
        }
      } else {
        vscode.window.showErrorMessage(`Agent Flow Code Generation Failed: ${result.error || 'Unknown error'}`);
        await bridge.postMessage({
          type: 'CODE_GENERATED',
          payload: {
            success: false,
            files: [],
            error: result.error,
            modelUsed: result.modelUsed,
          },
        });
      }
    });

    bridge.onMessage('WRITE_FILES_TO_WORKSPACE', async (payload) => {
      if (!isWriteFilesPayload(payload)) {
        this.outputChannel?.appendLine(`[AgentEditorProvider] Rejected malformed WRITE_FILES_TO_WORKSPACE payload`);
        return;
      }

      try {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
          throw new Error('No workspace folder is currently open.');
        }
        const baseUri = workspaceFolders[0].uri;
        let targetDir: vscode.Uri;
        if (payload.targetDirectory) {
          // Reject directory traversal and sensitive directory access
          if (payload.targetDirectory.includes('..')) {
            throw new Error(`Path contains directory traversal ('..') segments: ${payload.targetDirectory}`);
          }
          const normalizedRel = payload.targetDirectory.replace(/\\/g, '/');
          if (normalizedRel.split('/').includes('.git')) {
            throw new Error(`Access to .git folder or its subdirectories is prohibited: ${payload.targetDirectory}`);
          }

          // Resolve relative to document path
          const targetDirPath = this.documentSyncManager.resolveTargetDirectory(document, payload.targetDirectory);
          const isInsideAnyWorkspace = workspaceFolders.some((wf) => isPathInside(wf.uri.fsPath, targetDirPath));
          if (!isInsideAnyWorkspace) {
            throw new Error(`Access Denied: Target directory '${targetDirPath}' resolves outside open workspace folders.`);
          }
          targetDir = vscode.Uri.file(targetDirPath);
        } else {
          targetDir = baseUri;
        }

        const targetDirPath = targetDir.fsPath;

        const filesToWrite: { fileUri: vscode.Uri; path: string; content: string }[] = [];
        const filesToOverwrite: string[] = [];

        for (const file of payload.files) {
          const fileUri = assertInsideWorkspace(targetDir, file.path);
          filesToWrite.push({ fileUri, path: file.path, content: file.content });

          try {
            await vscode.workspace.fs.stat(fileUri);
            filesToOverwrite.push(file.path);
          } catch {}
        }

        if (filesToOverwrite.length > 0) {
          const fileCount = filesToOverwrite.length;
          const displayNames = filesToOverwrite.slice(0, 5).join(', ') + (fileCount > 5 ? `, and ${fileCount - 5} more` : '');
          const message = `Agent Flow: Overwrite ${fileCount} existing file(s) in workspace? (${displayNames})`;
          const confirmation = await vscode.window.showWarningMessage(
            message,
            { modal: true },
            'Overwrite',
            'Cancel'
          );
          if (confirmation !== 'Overwrite') {
            this.outputChannel?.appendLine(`[AgentEditorProvider] File write operation canceled by user.`);
            await bridge.postMessage({
              type: 'FILES_WRITTEN',
              payload: {
                success: false,
                paths: [],
                error: 'Write operation canceled by user: file overwrite confirmation declined.',
              },
            });
            return;
          }
        }

        const pathsWritten: string[] = [];
        for (const writeItem of filesToWrite) {
          const dirUri = vscode.Uri.file(path.dirname(writeItem.fileUri.fsPath));
          await vscode.workspace.fs.createDirectory(dirUri);
          const buffer = Buffer.from(writeItem.content, 'utf-8');
          await vscode.workspace.fs.writeFile(writeItem.fileUri, buffer);
          pathsWritten.push(writeItem.path);
        }

        // Copy any local Python tool files referenced in the workflow
        await this.provider.copyLocalToolFiles(payload.document, document, targetDirPath);

        vscode.window.showInformationMessage(
          `Agent Flow: Generated ${pathsWritten.length} files in ${path.basename(targetDir.fsPath)}`
        );

        await bridge.postMessage({
          type: 'FILES_WRITTEN',
          payload: {
            success: true,
            paths: pathsWritten,
          },
        });
      } catch (err: any) {
        vscode.window.showErrorMessage(`Agent Flow file export failed: ${err.message}`);
        await bridge.postMessage({
          type: 'FILES_WRITTEN',
          payload: {
            success: false,
            paths: [],
            error: err.message,
          },
        });
      }
    });

    bridge.onMessage('EXPORT_CODE', async (payload) => {
      if (!payload) return;
      const secretsProvider = SecretsProvider.getInstance();
      const apiKey = (await secretsProvider.getGeminiApiKey()) || process.env.GEMINI_API_KEY || '';

      const result = await this.codeGenEngine.generateCode({
        document: payload.document,
        framework: payload.targetFramework,
        language: payload.targetLanguage,
        apiKey: apiKey,
      });

      if (result.success && result.files.length > 0) {
        const targetDir = this.documentSyncManager.resolveTargetDirectory(document, payload.outputDirectory);

        const pathsWritten: string[] = [];
        for (const file of result.files) {
          const fileUri = vscode.Uri.joinPath(vscode.Uri.file(targetDir), file.path);
          const dirUri = vscode.Uri.file(path.dirname(fileUri.fsPath));
          await vscode.workspace.fs.createDirectory(dirUri);
          const buffer = Buffer.from(file.content, 'utf-8');
          await vscode.workspace.fs.writeFile(fileUri, buffer);
          pathsWritten.push(file.path);
        }

        await bridge.postMessage({
          type: 'EXPORT_COMPLETE',
          payload: {
            success: true,
            outputDirectory: targetDir,
            filesWritten: pathsWritten,
          },
        });
      } else {
        await bridge.postMessage({
          type: 'EXPORT_COMPLETE',
          payload: {
            success: false,
            error: result.error || 'Code generation failed',
            filesWritten: [],
          },
        });
      }
    });

    // 5. Settings Synchronization Handlers
    bridge.onMessage('OPEN_SETTINGS', () => {
      vscode.commands.executeCommand('workbench.action.openSettings', 'agentFlow');
    });

    bridge.onMessage('REQUEST_SETTINGS', async () => {
      try {
        const secretsProvider = SecretsProvider.getInstance();
        const apiKeySet = await secretsProvider.hasGeminiApiKey();
        let parsedDoc: any = {};
        try {
          parsedDoc = JSON.parse(document.getText() || '{}');
        } catch {}

        await bridge.postMessage({
          type: 'SETTINGS_SYNC',
          payload: {
            geminiApiKeySet: apiKeySet || Boolean(process.env.GEMINI_API_KEY),
            targetFramework: parsedDoc.framework || 'google-adk',
            targetLanguage: parsedDoc.language || 'python',
          },
        });
      } catch (err) {
        console.error('[AgentEditorProvider] Error in REQUEST_SETTINGS handler:', err);
      }
    });

    bridge.onMessage('UPDATE_SETTINGS', async (payload) => {
      if (!payload) return;
      try {
        const secretsProvider = SecretsProvider.getInstance();
        if (payload.geminiApiKey !== undefined) {
          if (payload.geminiApiKey === '') {
            await secretsProvider.deleteGeminiApiKey();
          } else {
            await secretsProvider.setGeminiApiKey(payload.geminiApiKey);
          }

          const apiKeySet = await secretsProvider.hasGeminiApiKey();
          await bridge.postMessage({
            type: 'SETTINGS_SYNC',
            payload: {
              geminiApiKeySet: apiKeySet || Boolean(process.env.GEMINI_API_KEY),
              targetFramework: payload.targetFramework || 'google-adk',
              targetLanguage: payload.targetLanguage || 'python',
            },
          });
        }
      } catch (err) {
        console.error('[AgentEditorProvider] Error in UPDATE_SETTINGS handler:', err);
      }
    });

    // 6. Test Suite Execution & Local Runner Handlers
    bridge.onMessage('RUN_TESTS', async (payload) => {
      if (!payload?.document) return;

      try {
        const targetDir = this.documentSyncManager.resolveTargetDirectory(document, payload.targetDirectory);

        await this.runnerManager.runTests({
          document: payload.document,
          scenarioIds: payload.testScenarioIds,
          targetDirectory: targetDir,
          port: payload.port,
          executionTarget: payload.executionTarget,
          deployedResourceId: payload.deployedResourceId,
          bridge,
        });
      } catch (err: any) {
        bridge.postMessage({
          type: 'EXECUTION_LOG',
          payload: {
            runId: `run-${Date.now()}`,
            timestamp: new Date().toISOString(),
            level: 'error',
            message: `[Test Runner Error]: ${err?.message || String(err)}`,
          },
        });
      }
    });

    bridge.onMessage('START_LOCAL_RUNNER', async (payload) => {
      if (!isStartRunnerPayload(payload)) {
        this.outputChannel?.appendLine(`[AgentEditorProvider] Rejected malformed START_LOCAL_RUNNER payload`);
        return;
      }

      try {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
          throw new Error('No workspace folder is currently open.');
        }

        // Reject traversal and sensitive folder access in candidate relative path
        if (payload?.targetDirectory) {
          if (payload.targetDirectory.includes('..')) {
            throw new Error(`Path contains directory traversal ('..') segments: ${payload.targetDirectory}`);
          }
          const normalizedRel = payload.targetDirectory.replace(/\\/g, '/');
          if (normalizedRel.split('/').includes('.git')) {
            throw new Error(`Access to .git folder or its subdirectories is prohibited: ${payload.targetDirectory}`);
          }
        }

        // Resolve target directory relative to the backing .agent document
        const targetDir = this.documentSyncManager.resolveTargetDirectory(document, payload?.targetDirectory);

        // Verify resolved target directory is strictly contained within an open workspace folder
        const isInsideAnyWorkspace = workspaceFolders.some((wf) => isPathInside(wf.uri.fsPath, targetDir));
        if (!isInsideAnyWorkspace) {
          throw new Error(`Access Denied: Target directory '${targetDir}' resolves outside open workspace folders.`);
        }

        await this.runnerManager.startLocalRunner({
          document: payload?.document,
          targetDirectory: targetDir,
          port: payload?.port || 8000,
          envVars: payload?.envVars,
          bridge,
        });
      } catch (err: any) {
        const errMsg = err?.message || String(err);
        this.outputChannel?.appendLine(`[AgentEditorProvider] Failed to start local runner: ${errMsg}`);
        await bridge.postMessage({
          type: 'LOCAL_RUNNER_STATUS',
          payload: {
            status: 'error',
            error: errMsg,
            logs: [`[Validation Error] ${errMsg}`],
          },
        });
      }
    });

    bridge.onMessage('STOP_LOCAL_RUNNER', async (payload: any) => {
      await this.runnerManager.stopLocalRunner(payload?.runnerId, payload?.port, bridge);
    });

    bridge.onMessage('GET_LOCAL_RUNNER_STATUS', async () => {
      await this.runnerManager.sendStatus(bridge);
    });

    bridge.onMessage('CHECK_FILES_EXIST', async (payload: any) => {
      const targetDir = this.documentSyncManager.resolveTargetDirectory(document, payload?.targetDirectory);

      const existingGeneratedFiles = this.documentSyncManager.loadGeneratedFilesFromDisk(targetDir);
      const serverPy = path.join(targetDir, 'server.py');
      const mainPy = path.join(targetDir, 'main.py');
      const exists = fs.existsSync(serverPy) || fs.existsSync(mainPy) || existingGeneratedFiles.length > 0;

      let foundFiles: string[] = [];
      if (fs.existsSync(targetDir)) {
        try {
          foundFiles = fs.readdirSync(targetDir);
        } catch {}
      }

      await bridge.postMessage({
        type: 'FILES_EXIST_RESPONSE',
        payload: {
          targetDirectory: targetDir,
          exists,
          files: foundFiles,
          generatedFiles: existingGeneratedFiles,
        },
      });
    });

    // 7. MCP Server Tools Discovery & Secret Management Handlers
    bridge.onMessage('DISCOVER_MCP_TOOLS', async (payload: any) => {
      if (!isDiscoverMcpPayload(payload)) {
        this.outputChannel?.appendLine(`[AgentEditorProvider] Rejected malformed DISCOVER_MCP_TOOLS payload`);
        await bridge.postMessage({
          type: 'MCP_TOOLS_DISCOVERED',
          payload: {
            success: false,
            tools: [],
            error: 'Invalid or malformed payload structure.',
          },
        });
        return;
      }

      try {
        this.outputChannel?.appendLine(
          `[AgentEditorProvider] Discovering MCP tools via ${payload?.transport || 'stdio'} transport (cmd: ${payload?.command || 'N/A'}, url: ${payload?.url || 'N/A'})`
        );

        if (payload.transport === 'stdio') {
          if (!payload.command) {
            throw new Error('Stdio transport requires a valid command.');
          }
          const allowlist = ['npx', 'uvx', 'python', 'python3', 'node', 'docker'];
          if (!allowlist.includes(payload.command)) {
            const confirmation = await vscode.window.showWarningMessage(
              `Agent Flow: The MCP server is requesting to execute an unallowlisted stdio command: '${payload.command}'. Do you trust this command?`,
              { modal: true },
              'Allow',
              'Deny'
            );
            if (confirmation !== 'Allow') {
              throw new Error(`Execution of unallowlisted MCP command '${payload.command}' was denied.`);
            }
          }
        }

        const result = await this.mcpManager.discoverTools(payload);
        await bridge.postMessage({
          type: 'MCP_TOOLS_DISCOVERED',
          payload: {
            success: result.success,
            tools: result.tools,
            serverInfo: result.serverInfo,
            latencyMs: result.latencyMs,
            error: result.error,
            requiresAuth: result.requiresAuth,
            authType: result.authType,
            authUrl: result.authUrl,
          },
        });
      } catch (err: any) {
        await bridge.postMessage({
          type: 'MCP_TOOLS_DISCOVERED',
          payload: {
            success: false,
            tools: [],
            error: err?.message || String(err),
          },
        });
      }
    });

    bridge.onMessage('START_MCP_OAUTH_FLOW', async (payload: any) => {
      try {
        const workspaceDir = this.documentSyncManager.resolveTargetDirectory(document, payload?.targetDirectory);
        this.outputChannel?.appendLine(
          `[AgentEditorProvider] Starting browser OAuth flow for ${payload?.secretName || 'MCP'} (authUrl: ${payload?.authUrl})`
        );
        const result = await this.mcpOAuthManager.startOAuthFlow({
          authUrl: payload?.authUrl,
          tokenUrl: payload?.tokenUrl,
          clientId: payload?.clientId,
          clientSecret: payload?.clientSecret,
          scopes: payload?.scopes,
          secretName: payload?.secretName,
          envVar: payload?.envVar,
          workspaceDir,
          timeoutMs: payload?.timeoutMs,
        });
        await bridge.postMessage({
          type: 'MCP_OAUTH_COMPLETED',
          payload: result,
        });
      } catch (err: any) {
        await bridge.postMessage({
          type: 'MCP_OAUTH_COMPLETED',
          payload: {
            success: false,
            error: err?.message || String(err),
          },
        });
      }
    });

    bridge.onMessage('SAVE_MCP_SECRET', async (payload: any) => {
      try {
        const workspaceDir = this.documentSyncManager.resolveTargetDirectory(document, payload?.targetDirectory);
        if (!payload?.secretName || !payload?.token) {
          throw new Error('Secret name and token are required');
        }
        const envVar = payload.envVar || payload.secretName.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
        await this.mcpOAuthManager.saveSecret(
          payload.secretName,
          envVar,
          payload.token,
          workspaceDir
        );
        await bridge.postMessage({
          type: 'MCP_SECRET_SAVED',
          payload: {
            success: true,
            secretName: payload.secretName,
            envVar,
            tokenPreview: this.mcpOAuthManager.getRedactedPreview(payload.token),
          },
        });
      } catch (err: any) {
        await bridge.postMessage({
          type: 'MCP_SECRET_SAVED',
          payload: {
            success: false,
            error: err?.message || String(err),
          },
        });
      }
    });

    bridge.onMessage('GET_MCP_SECRET', async (payload: any) => {
      try {
        const workspaceDir = this.documentSyncManager.resolveTargetDirectory(document, payload?.targetDirectory);
        const token = await this.mcpOAuthManager.getSecret(payload?.secretName, payload?.envVar, workspaceDir);
        await bridge.postMessage({
          type: 'MCP_SECRET_RETRIEVED',
          payload: {
            success: true,
            hasToken: !!token,
            tokenPreview: token ? this.mcpOAuthManager.getRedactedPreview(token) : undefined,
            bearerToken: token,
          },
        });
      } catch (err: any) {
        await bridge.postMessage({
          type: 'MCP_SECRET_RETRIEVED',
          payload: {
            success: false,
            hasToken: false,
            error: err?.message || String(err),
          },
        });
      }
    });

    bridge.onMessage('CANCEL_TESTS', (payload) => {
      if (!payload?.runId) return;
      this.runnerManager.cancelRun(payload.runId);
    });

    // 8. Interactive Chat Session Handlers
    bridge.onMessage('SEND_CHAT_MESSAGE', async (payload) => {
      if (!payload?.message) return;
      const targetDir = this.documentSyncManager.resolveTargetDirectory(document, payload.targetDirectory);
      await this.runnerManager.sendChatMessage({
        sessionId: payload.sessionId || 'default-session',
        message: payload.message,
        document: payload.document,
        targetDirectory: targetDir,
        port: payload.port,
        streaming: payload.streaming ?? true,
        history: payload.history,
        executionTarget: payload.executionTarget || 'local',
        deployedResourceId: payload.deployedResourceId,
        bridge,
      });
    });

    bridge.onMessage('RESET_CHAT_SESSION', async (payload) => {
      this.runnerManager.resetChatSession(payload?.sessionId);
    });

    // 9. Vertex AI Agent Engine Deployment & Remote Testing Handlers
    bridge.onMessage('DEPLOY_TO_AGENT_ENGINE', async (payload: any) => {
      const targetDir = this.documentSyncManager.resolveTargetDirectory(document, payload?.targetDirectory);
      let parsedDoc: any = undefined;
      try {
        parsedDoc = JSON.parse(document.getText());
      } catch {
        parsedDoc = payload?.document;
      }

      const res = await this.agentEngineDeployer.deploy({
        document: parsedDoc,
        targetDirectory: targetDir,
        projectId: payload.projectId,
        region: payload.region,
        serviceAccount: payload.serviceAccount,
        networkAttachment: payload.networkAttachment,
        stagingBucket: payload.stagingBucket,
        forceNew: payload.forceNew,
        agentEngineId: payload.agentEngineId,
        displayName: payload.displayName || parsedDoc?.name,
        envVars: payload.envVars,
        bridge,
      });

      if (res.success && res.remoteRuntimeId) {
        try {
          const currentText = document.getText();
          const docData = JSON.parse(currentText);
          const currentDeploy = docData.deployment || {};
          docData.deployment = {
            ...currentDeploy,
            target: 'agent_engine',
            deployedResourceId: res.remoteRuntimeId,
            serviceUrl: res.serviceUrl,
            consoleUrl: res.consoleUrl,
            deployedAt: new Date().toISOString(),
          };
          const newJson = JSON.stringify(docData, null, 2);
          if (newJson !== currentText) {
            await this.documentSyncManager.updateTextDocument(document, newJson);
            try {
              await document.save();
            } catch (saveErr) {
              console.warn('[AgentEditorProvider] Warning saving document with deployment state:', saveErr);
            }
            let docVersion = this.documentSyncManager.getDocumentVersion(uriStr);
            docVersion++;
            this.documentSyncManager.setDocumentVersion(uriStr, docVersion);
            await bridge.postMessage({
              type: 'LOAD_DOCUMENT',
              payload: {
                document: docData,
                docVersion: docVersion,
                filePath: document.uri.fsPath,
              },
            });
          }
        } catch (err) {
          console.error('[AgentEditorProvider] Error updating document with deployment state:', err);
        }
      }
    });

    bridge.onMessage('CANCEL_AGENT_ENGINE_DEPLOY', async (payload: any) => {
      const targetDir = payload?.targetDirectory
        ? this.documentSyncManager.resolveTargetDirectory(document, payload.targetDirectory)
        : undefined;
      this.agentEngineDeployer.cancelDeployment(targetDir, bridge);
    });

    bridge.onMessage('GET_AGENT_ENGINE_STATUS', async (payload: any) => {
      const targetDir = this.documentSyncManager.resolveTargetDirectory(document, payload?.targetDirectory);
      this.agentEngineDeployer.getDeploymentStatus(targetDir, bridge);
    });

    bridge.onMessage('TEST_REMOTE_AGENT_ENGINE', async (payload: any) => {
      const targetDir = this.documentSyncManager.resolveTargetDirectory(document, payload?.targetDirectory);
      await this.agentEngineDeployer.testRemoteAgentRuntime({
        targetDirectory: targetDir,
        query: payload.query,
        remoteRuntimeId: payload.remoteRuntimeId,
        serviceUrl: payload.serviceUrl,
        location: payload.location,
        projectId: payload.projectId,
        bridge,
      });
    });

    // 10. Local Python Tool Handlers
    bridge.onMessage('PICK_LOCAL_PYTHON_TOOL', async () => {
      try {
        const defaultUri = document ? vscode.Uri.file(path.dirname(document.uri.fsPath)) : vscode.workspace.workspaceFolders?.[0]?.uri;
        const uris = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: false,
          defaultUri,
          filters: { 'Python Files': ['py'] },
          openLabel: 'Select Python Tool File',
        });

        if (!uris || uris.length === 0) return;
        const pickedUri = uris[0];
        const pickedPath = pickedUri.fsPath;
        const baseDir = document ? path.dirname(document.uri.fsPath) : vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
        let relPath = path.relative(baseDir, pickedPath);
        if (!relPath.startsWith('.')) relPath = `./${relPath}`;

        const content = fs.readFileSync(pickedPath, 'utf-8');
        const functions = this.provider.parsePythonFunctions(content);

        await bridge.postMessage({
          type: 'LOCAL_PYTHON_TOOL_PICKED',
          payload: {
            success: true,
            filePath: pickedPath,
            relativePath: relPath,
            functions,
          },
        });
      } catch (err: any) {
        await bridge.postMessage({
          type: 'LOCAL_PYTHON_TOOL_PICKED',
          payload: {
            success: false,
            error: err.message || String(err),
          },
        });
      }
    });

    bridge.onMessage('PARSE_PYTHON_TOOL_FILE', async (payload: any) => {
      try {
        const filePath = payload.filePath;
        const baseDir = document ? path.dirname(document.uri.fsPath) : vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
        const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(baseDir, filePath);
        if (fs.existsSync(resolvedPath)) {
          const content = fs.readFileSync(resolvedPath, 'utf-8');
          const functions = this.provider.parsePythonFunctions(content);
          let relPath = path.relative(baseDir, resolvedPath);
          if (!relPath.startsWith('.')) relPath = `./${relPath}`;
          await bridge.postMessage({
            type: 'PYTHON_TOOL_FILE_PARSED',
            payload: {
              success: true,
              filePath: resolvedPath,
              relativePath: relPath,
              functions,
            },
          });
        } else {
          await bridge.postMessage({
            type: 'PYTHON_TOOL_FILE_PARSED',
            payload: {
              success: false,
              filePath,
              functions: [],
              error: `File not found: ${resolvedPath}`,
            },
          });
        }
      } catch (err: any) {
        await bridge.postMessage({
          type: 'PYTHON_TOOL_FILE_PARSED',
          payload: {
            success: false,
            filePath: payload?.filePath || '',
            functions: [],
            error: err.message || String(err),
          },
        });
      }
    });

    bridge.onMessage('OPEN_LOCAL_TOOL_FILE', async (payload: any) => {
      try {
        const filePath = payload.filePath;
        const baseDir = document ? path.dirname(document.uri.fsPath) : vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
        const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(baseDir, filePath);
        if (fs.existsSync(resolvedPath)) {
          const doc = await vscode.workspace.openTextDocument(resolvedPath);
          await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside });
        } else {
          vscode.window.showErrorMessage(`File not found: ${resolvedPath}`);
        }
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to open file: ${err.message}`);
      }
    });

    // 11. Sample Blueprint & Eventarc Handlers
    bridge.onMessage('GET_SAMPLES', async () => {
      const discoveredSamples = this.provider.discoverResourceSamples();
      await bridge.postMessage({
        type: 'SAMPLES_LOADED',
        payload: {
          samples: discoveredSamples,
        },
      });
    });

    bridge.onMessage('FETCH_EVENTARC_PROVIDERS', async (payload: any) => {
      try {
        const location = payload?.location || 'global';
        const forceRefresh = payload?.forceRefresh || false;
        const result = await this.provider.eventarcManager.getEventarcProviders(location, forceRefresh);
        await bridge.postMessage({
          type: 'EVENTARC_PROVIDERS_RESPONSE',
          payload: {
            categories: result.categories,
            source: result.source,
            location: result.location,
            error: result.error,
          },
        });
      } catch (err: any) {
        await bridge.postMessage({
          type: 'EVENTARC_PROVIDERS_RESPONSE',
          payload: {
            categories: DEFAULT_EVENTARC_FALLBACK,
            source: 'fallback',
            location: payload?.location || 'global',
            error: err?.message || String(err),
          },
        });
      }
    });

    bridge.onMessage('CREATE_FILE_FROM_SAMPLE', async (payload: any) => {
      try {
        const sampleId = payload?.sampleId;
        const sampleName = payload?.sampleName || sampleId || 'workflow_sample';

        // 1. Locate sample definition or file content
        let sampleDoc: any = null;

        // Try to find physical sample file
        const discovered = this.provider.discoverResourceSamples();
        const found = discovered.find((s: any) => s.id === sampleId);
        if (found?.sourceFilePath && fs.existsSync(found.sourceFilePath)) {
          const sampleContent = fs.readFileSync(found.sourceFilePath, 'utf-8');
          try {
            sampleDoc = JSON.parse(sampleContent);
          } catch {
            sampleDoc = null;
          }
        }

        if (!sampleDoc && payload?.sample) {
          const sample = payload.sample;
          sampleDoc = {
            schemaVersion: '1.0.0',
            name: sample.name || sampleName,
            description: sample.description || '',
            framework: sample.config?.framework || 'google-adk',
            language: sample.config?.language || 'python',
            metadata: {
              category: sample.category,
              badge: sample.badge,
              features: sample.features,
            },
            deployment: sample.deploymentConfig || {
              framework: sample.config?.framework || 'google-adk',
              language: sample.config?.language || 'python',
              outputFolder: (sample.config?.outputFolder || `./${sampleId}_agent/`).replace(/^(\.\/)?src\//, './'),
              includeTests: sample.config?.includeTests ?? true,
              includeDocker: sample.config?.includeDocker ?? true,
              useStreaming: sample.config?.useStreaming ?? true,
            },
            nodes: sample.nodes,
            edges: sample.edges,
          };
        }

        if (!sampleDoc) {
          vscode.window.showErrorMessage(`Unable to locate sample blueprint for "${sampleId}".`);
          return;
        }

        // 2. Prompt user with Save As Dialog
        const defaultFileName = `${(sampleId || 'sample').replace(/[^a-zA-Z0-9_-]/g, '_')}.agent`;
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
        const defaultUri = workspaceFolder
          ? vscode.Uri.joinPath(workspaceFolder, defaultFileName)
          : vscode.Uri.file(path.join(os.homedir(), defaultFileName));

        const targetUri = await vscode.window.showSaveDialog({
          defaultUri,
          filters: {
            'Agent Workflow Blueprint': ['agent'],
            'JSON Files': ['json'],
            'All Files': ['*'],
          },
          saveLabel: 'Create Agent Workflow',
          title: `Save "${sampleName}" Sample Workflow As...`,
        });

        if (!targetUri) {
          return;
        }

        // 3. Write formatted JSON to the selected targetUri
        const contentToWrite = JSON.stringify(sampleDoc, null, 2);
        await vscode.workspace.fs.writeFile(targetUri, Buffer.from(contentToWrite, 'utf-8'));

        // 4. Open the new file in VS Code in a new editor tab using our custom editor
        await vscode.commands.executeCommand('vscode.openWith', targetUri, AgentEditorProvider.viewType);
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create sample agent workflow: ${err.message}`);
      }
    });

    // 12. Route any Registered External Message Delegates
    messageHandlers.forEach((handler, type) => {
      bridge.onMessage(type as any, async (payload) => {
        if (type === 'WRITE_FILES_TO_WORKSPACE' && !isWriteFilesPayload(payload)) {
          this.outputChannel?.appendLine(`[AgentEditorProvider] Rejected invalid WRITE_FILES_TO_WORKSPACE payload in external delegate`);
          return;
        }
        if (type === 'START_LOCAL_RUNNER' && !isStartRunnerPayload(payload)) {
          this.outputChannel?.appendLine(`[AgentEditorProvider] Rejected invalid START_LOCAL_RUNNER payload in external delegate`);
          return;
        }
        if (type === 'DISCOVER_MCP_TOOLS' && !isDiscoverMcpPayload(payload)) {
          this.outputChannel?.appendLine(`[AgentEditorProvider] Rejected invalid DISCOVER_MCP_TOOLS payload in external delegate`);
          return;
        }
        handler({ type: type as any, payload } as WebviewToExtensionMessage, bridge, document);
      });
    });
  }
}
