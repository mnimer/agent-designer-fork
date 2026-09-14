/**
 * AgentEditorProvider
 *
 * Custom Text Editor Provider for Visual Studio Code Agent Flow Builder (*.agent).
 * Manages the lifecycle of webview panels associated with .agent workflow documents,
 * establishes CSP-compliant webview HTML, synchronizes disk document edits via
 * vscode.workspace.applyEdit, and coordinates bi-directional RPC communications via WebviewBridge.
 *
 * Architectural Decisions:
 * 1. Implements vscode.CustomTextEditorProvider instead of CustomReadonlyEditorProvider
 *    to leverage native VS Code undo/redo stacks and dirty document tracking.
 * 2. Uses retainContextWhenHidden: true to maintain React Flow canvas zoom, viewport,
 *    and running subprocess test state when switching between editor tabs.
 * 3. Enforces strict Content Security Policy (CSP) with cryptographic nonce generation
 *    for script and style execution.
 * 4. Optimistic document updates: Changes from webview update the backing TextDocument
 *    via a single TextEdit replacing full content when docVersion increments.
 * 5. Uses WebviewBridge for typed RPC message dispatching and handler registration.
 * 6. Integrates GeminiCodeGenEngine to synthesize full Python/LangGraph/TypeScript codebases.
 * 7. Provider and panel lifecycle integration: Shuts down local runner subprocesses and releases local ports on panel disposal or extension deactivation, while background cloud deployments (e.g. Vertex AI Agent Engine) persist across tab navigation until completion or explicit cancellation.
 * 8. Interactive Chat Session Dispatching: Routes interactive chat messages and reset commands to AgentRunnerManager.
 * 9. Model Selection & Global Region Mandate: Gemini 1.x and 2.x models (including gemini-2.5-flash) are deprecated.
 *    gemini-3.7-flash is the primary model for Vertex AI, but requires the global region (location='global' or
 *    GOOGLE_CLOUD_LOCATION='global'). Regional endpoints return 404 NOT_FOUND for gemini-3.7-flash publisher models.
 * 10. Pre-Generation Cleanup: Immediately cleans prior generated source files and stale virtual environments from
 *     the target output directory when GENERATE_CODE is received, before initiating LLM synthesis, preserving .agent, .git, and IDE configurations.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as crypto from 'crypto';
import { AgentWorkflowDocument, SampleWorkflowDefinition } from '../shared/types';
import { WebviewBridge } from './WebviewBridge';
import {
  WebviewToExtensionMessage,
} from '../shared/rpcProtocol';
import { GeneratedFile } from '../shared/codegen/types';
import { sanitizeFolderBaseName } from '../shared/folderValidation';
import { GeminiCodeGenEngine } from './GeminiCodeGenEngine';
import { AgentRunnerManager } from './AgentRunnerManager';
import { AgentEngineDeployer } from './AgentEngineDeployer';
import { McpSubprocessManager } from './McpSubprocessManager';
import { McpOAuthManager } from './McpOAuthManager';
import { EventarcDiscoveryManager, DEFAULT_EVENTARC_FALLBACK } from './EventarcDiscoveryManager';

export class AgentEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'agentFlow.editor';

  private readonly context: vscode.ExtensionContext;
  private readonly codeGenEngine: GeminiCodeGenEngine;
  private readonly runnerManager: AgentRunnerManager;
  private readonly agentEngineDeployer: AgentEngineDeployer;
  private readonly mcpManager: McpSubprocessManager;
  private readonly mcpOAuthManager: McpOAuthManager;
  private readonly outputChannel?: vscode.OutputChannel;
  private readonly messageHandlers: Map<
    string,
    (msg: WebviewToExtensionMessage, bridge: WebviewBridge, doc: vscode.TextDocument) => void
  > = new Map();

  /**
   * Initializes the AgentEditorProvider with extension context.
   *
   * @param context VS Code extension context
   * @param outputChannel Optional OutputChannel for logging
   */
  constructor(context: vscode.ExtensionContext, outputChannel?: vscode.OutputChannel) {
    this.context = context;
    this.outputChannel = outputChannel;
    this.codeGenEngine = new GeminiCodeGenEngine(context.extensionPath);
    this.agentEngineDeployer = new AgentEngineDeployer();
    this.runnerManager = new AgentRunnerManager(context.extensionPath, undefined, this.agentEngineDeployer);
    this.mcpManager = new McpSubprocessManager();
    this.mcpOAuthManager = new McpOAuthManager(context);
  }

  /**
   * Registers the custom editor provider with VS Code.
   *
   * @param context VS Code extension context
   * @param outputChannel Optional OutputChannel for logging
   * @returns Disposable subscription
   */
  public static register(context: vscode.ExtensionContext, outputChannel?: vscode.OutputChannel): vscode.Disposable {
    const provider = new AgentEditorProvider(context, outputChannel);
    AgentEditorProvider.activeProviders.add(provider);
    const providerRegistration = vscode.window.registerCustomEditorProvider(
      AgentEditorProvider.viewType,
      provider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
          enableScripts: true,
        },
        supportsMultipleEditorsPerDocument: true,
      }
    );
    return providerRegistration;
  }

  public static activeProviders = new Set<AgentEditorProvider>();

  /**
   * Disposes all active provider instances and shuts down runner subprocesses.
   */
  public static disposeAll(): void {
    for (const provider of AgentEditorProvider.activeProviders) {
      provider.dispose();
    }
    AgentEditorProvider.activeProviders.clear();
  }

  /**
   * Retrieves all active local runner sessions across active editor providers.
   *
   * @returns Array of runner descriptors
   */
  public static getAllActiveRunners(): Array<{ id: string; pid?: number; port?: number; status: string }> {
    const all: Array<{ id: string; pid?: number; port?: number; status: string }> = [];
    for (const provider of AgentEditorProvider.activeProviders) {
      all.push(...provider.runnerManager.getActiveRunners());
    }
    return all;
  }

  /**
   * Returns the AgentEngineDeployer instance.
   */
  public getAgentEngineDeployer(): AgentEngineDeployer {
    return this.agentEngineDeployer;
  }

  /**
   * Disposes this provider and terminates its runner manager and deployer processes.
   */
  public dispose(): void {
    this.runnerManager.dispose();
    this.agentEngineDeployer.dispose();
  }

  /**
   * Registers an external message delegate for handling specific RPC actions.
   *
   * @param type Action message type string
   * @param handler Message handler callback
   */
  public registerMessageHandler(
    type: string,
    handler: (
      msg: WebviewToExtensionMessage,
      bridge: WebviewBridge,
      doc: vscode.TextDocument
    ) => void
  ): void {
    this.messageHandlers.set(type, handler as any);
  }

  /**
   * Resolves a custom text editor for an agent workflow document.
   *
   * @param document Backing VS Code TextDocument
   * @param webviewPanel Target webview panel
   * @param token Cancellation token
   */
  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    token: vscode.CancellationToken
  ): Promise<void> {
    if (!document || !webviewPanel || !webviewPanel.webview) {
      return;
    }
    if (token && token.isCancellationRequested) {
      return;
    }

    try {
      this.outputChannel?.appendLine(
        `[AgentEditorProvider] Resolving custom editor for document: ${document.uri.fsPath}`
      );

      let docVersion = 1;
      const bridge = new WebviewBridge(webviewPanel, this.outputChannel);

      // 1. Configure webview permissions and local resource roots
      const extensionUri = this.context.extensionUri || vscode.Uri.file(this.context.extensionPath || '');
      let realExtensionPath = this.context.extensionPath || extensionUri.fsPath;
      try {
        if (fs.existsSync(realExtensionPath)) {
          realExtensionPath = fs.realpathSync(realExtensionPath);
        }
      } catch {
        // fallback
      }
      const realExtensionUri = vscode.Uri.file(realExtensionPath);
      const distUri = vscode.Uri.joinPath(realExtensionUri, 'dist', 'webview');
      this.outputChannel?.appendLine(`[AgentEditorProvider:Step 1] Configuring localResourceRoots for: ${distUri.fsPath}`);
      webviewPanel.webview.options = {
        enableScripts: true,
        localResourceRoots: [
          distUri,
          realExtensionUri,
          extensionUri,
          vscode.Uri.joinPath(extensionUri, 'dist', 'webview'),
        ],
      };

      // 2. Synchronize theme changes
      const themeChangeSub = vscode.window.onDidChangeActiveColorTheme((e: { kind: vscode.ColorThemeKind }) => {
        const theme =
          e.kind === vscode.ColorThemeKind.Light ||
          e.kind === vscode.ColorThemeKind.HighContrastLight
            ? 'light'
            : 'dark';
        bridge.postMessage({
          type: 'THEME_CHANGED',
          payload: { theme },
        });
      });

      // 3. Register diagnostic and core RPC handlers on the bridge
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

      bridge.onMessage('READY', async () => {
        try {
          this.outputChannel?.appendLine(
            `[AgentEditorProvider:Step 4] Webview sent READY signal for: ${document.uri.fsPath}`
          );
          const docText = document.getText();
          let parsedDoc: AgentWorkflowDocument;
          try {
            parsedDoc =
              docText.trim().length > 0
                ? JSON.parse(docText)
                : this.createEmptyWorkflow(document.uri);
          } catch {
            parsedDoc = this.createEmptyWorkflow(document.uri);
          }

          this.outputChannel?.appendLine(
            `[AgentEditorProvider:Step 5] Posting LOAD_DOCUMENT (nodes: ${parsedDoc.nodes?.length || 0}, edges: ${parsedDoc.edges?.length || 0})`
          );

          const relativeFilePath = vscode.workspace.asRelativePath(document.uri);
          
          // Resolve target directory to check for pre-existing generated files
          const configuredFolder = parsedDoc.deployment?.outputFolder || (parsedDoc.metadata as any)?.outputFolder;
          const targetDir = this.resolveTargetDirectory(document, configuredFolder);
          const existingGeneratedFiles = this.loadGeneratedFilesFromDisk(targetDir);

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

          const apiKey = vscode.workspace.getConfiguration('agentFlow').get<string>('geminiApiKey') || '';
          await bridge.postMessage({
            type: 'SETTINGS_SYNC',
            payload: {
              geminiApiKeySet: Boolean(apiKey || process.env.GEMINI_API_KEY),
              targetFramework: parsedDoc.framework || 'google-adk',
              targetLanguage: parsedDoc.language || 'python',
            },
          });

          const discoveredSamples = this.discoverResourceSamples();
          if (discoveredSamples.length > 0) {
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

    let isUpdatingFromWebview = false;

    bridge.onMessage('DOCUMENT_UPDATED', async (payload) => {
      if (!payload) return;
      docVersion = payload.docVersion;
      const updatedJson = JSON.stringify(payload.document, null, 2);

      if (document.getText() === updatedJson) {
        return;
      }

      isUpdatingFromWebview = true;
      try {
        await this.updateTextDocument(document, updatedJson);
      } finally {
        isUpdatingFromWebview = false;
      }

      await bridge.postMessage({
        type: 'DOCUMENT_SAVED',
        payload: {
          docVersion: docVersion,
          timestamp: new Date().toISOString(),
        },
      });
    });

    bridge.onMessage('GENERATE_CODE', async (payload) => {
      if (!payload) return;
      const config = vscode.workspace.getConfiguration('agentFlow');
      const apiKey = config.get<string>('geminiApiKey') || process.env.GEMINI_API_KEY || '';

      // 1. Resolve target directory and immediately clean existing files BEFORE generation
      const targetDirPath = this.resolveTargetDirectory(document, payload.outputFolder);
      const targetDir = vscode.Uri.file(targetDirPath);

      // Clean old generated source files immediately (preserving active .agent document, .git, and config files)
      await this.cleanTargetDirectory(targetDirPath, document);

      // 2. Synthesize new codebase with Gemini LLM
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
          // Write all generated files to disk
          for (const file of result.files) {
            const fileUri = vscode.Uri.joinPath(targetDir, file.path);
            const parentDir = vscode.Uri.file(path.dirname(fileUri.fsPath));
            await vscode.workspace.fs.createDirectory(parentDir);
            const buffer = Buffer.from(file.content, 'utf-8');
            await vscode.workspace.fs.writeFile(fileUri, buffer);
          }

          // Copy referenced local python tool files into target tools/ directory
          await this.copyLocalToolFiles(payload.document, document, targetDir.fsPath);

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
      if (!payload || !payload.files) return;

      try {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        const targetDir =
          payload.targetDirectory && workspaceFolders
            ? vscode.Uri.joinPath(workspaceFolders[0].uri, payload.targetDirectory)
            : workspaceFolders
            ? workspaceFolders[0].uri
            : vscode.Uri.file(path.dirname(document.uri.fsPath));

        const pathsWritten: string[] = [];

        for (const file of payload.files) {
          const fileUri = vscode.Uri.joinPath(targetDir, file.path);
          const dirUri = vscode.Uri.file(path.dirname(fileUri.fsPath));
          await vscode.workspace.fs.createDirectory(dirUri);
          const buffer = Buffer.from(file.content, 'utf-8');
          await vscode.workspace.fs.writeFile(fileUri, buffer);
          pathsWritten.push(file.path);
        }

        // Also copy referenced local python tool files into target tools/ directory if available
        if (document) {
          try {
            const rawText = document.getText();
            if (rawText) {
              const currentDoc = JSON.parse(rawText) as AgentWorkflowDocument;
              await this.copyLocalToolFiles(currentDoc, document, targetDir.fsPath);
            }
          } catch {}
        }

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
      const config = vscode.workspace.getConfiguration('agentFlow');
      const apiKey = config.get<string>('geminiApiKey') || process.env.GEMINI_API_KEY || '';

      const result = await this.codeGenEngine.generateCode({
        document: payload.document,
        framework: payload.targetFramework,
        language: payload.targetLanguage,
        apiKey: apiKey,
      });

      if (result.success && result.files.length > 0) {
        const targetDir = this.resolveTargetDirectory(document, payload.outputDirectory);

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

    bridge.onMessage('OPEN_SETTINGS', () => {
      vscode.commands.executeCommand('workbench.action.openSettings', 'agentFlow');
    });

    bridge.onMessage('RUN_TESTS', async (payload) => {
      if (!payload?.document) return;

      try {
        const targetDir = this.resolveTargetDirectory(document, payload.targetDirectory);

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
      const targetDir = this.resolveTargetDirectory(document, payload?.targetDirectory);

      await this.runnerManager.startLocalRunner({
        document: payload?.document,
        targetDirectory: targetDir,
        port: payload?.port || 8000,
        envVars: payload?.envVars,
        bridge,
      });
    });

    bridge.onMessage('STOP_LOCAL_RUNNER', async (payload: any) => {
      await this.runnerManager.stopLocalRunner(payload?.runnerId, payload?.port, bridge);
    });

    bridge.onMessage('GET_LOCAL_RUNNER_STATUS', async () => {
      await this.runnerManager.sendStatus(bridge);
    });

    bridge.onMessage('CHECK_FILES_EXIST', async (payload: any) => {
      const targetDir = this.resolveTargetDirectory(document, payload?.targetDirectory);

      const existingGeneratedFiles = this.loadGeneratedFilesFromDisk(targetDir);
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

    bridge.onMessage('DISCOVER_MCP_TOOLS', async (payload: any) => {
      try {
        this.outputChannel?.appendLine(
          `[AgentEditorProvider] Discovering MCP tools via ${payload?.transport || 'stdio'} transport (cmd: ${payload?.command || 'N/A'}, url: ${payload?.url || 'N/A'})`
        );
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
        const workspaceDir = this.resolveTargetDirectory(document, payload?.targetDirectory);
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
        const workspaceDir = this.resolveTargetDirectory(document, payload?.targetDirectory);
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
        const workspaceDir = this.resolveTargetDirectory(document, payload?.targetDirectory);
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

    bridge.onMessage('SEND_CHAT_MESSAGE', async (payload) => {
      if (!payload?.message) return;
      const targetDir = this.resolveTargetDirectory(document, payload.targetDirectory);
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

    // Native Agent Engine deployment and lifecycle handlers
    bridge.onMessage('DEPLOY_TO_AGENT_ENGINE', async (payload: any) => {
      const targetDir = this.resolveTargetDirectory(document, payload?.targetDirectory);
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
            await this.updateTextDocument(document, newJson);
            try {
              await document.save();
            } catch (saveErr) {
              console.warn('[AgentEditorProvider] Warning saving document with deployment state:', saveErr);
            }
            await bridge.postMessage({
              type: 'LOAD_DOCUMENT',
              payload: {
                document: docData,
                docVersion: ++docVersion,
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
        ? this.resolveTargetDirectory(document, payload.targetDirectory)
        : undefined;
      this.agentEngineDeployer.cancelDeployment(targetDir, bridge);
    });

    bridge.onMessage('GET_AGENT_ENGINE_STATUS', async (payload: any) => {
      const targetDir = this.resolveTargetDirectory(document, payload?.targetDirectory);
      this.agentEngineDeployer.getDeploymentStatus(targetDir, bridge);
    });

    bridge.onMessage('TEST_REMOTE_AGENT_ENGINE', async (payload: any) => {
      const targetDir = this.resolveTargetDirectory(document, payload?.targetDirectory);
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

    bridge.onMessage('RESET_CHAT_SESSION', async (payload) => {
      this.runnerManager.resetChatSession(payload?.sessionId);
    });

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
        const functions = this.parsePythonFunctions(content);

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
          const functions = this.parsePythonFunctions(content);
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

    bridge.onMessage('GET_SAMPLES', async () => {
      const discoveredSamples = this.discoverResourceSamples();
      await bridge.postMessage({
        type: 'SAMPLES_LOADED',
        payload: {
          samples: discoveredSamples,
        },
      });
    });

    bridge.onMessage('FETCH_EVENTARC_PROVIDERS', async (payload) => {
      try {
        const location = payload?.location || 'global';
        const forceRefresh = payload?.forceRefresh || false;
        const result = await EventarcDiscoveryManager.getInstance().getEventarcProviders(location, forceRefresh);
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

    bridge.onMessage('CREATE_FILE_FROM_SAMPLE', async (payload) => {
      try {
        const sampleId = payload?.sampleId;
        const sampleName = payload?.sampleName || sampleId || 'workflow_sample';

        // 1. Locate sample definition or file content
        let sampleDoc: any = null;

        // Try to find physical sample file
        const discovered = this.discoverResourceSamples();
        const found = discovered.find((s) => s.id === sampleId);
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
          // User canceled the save dialog
          return;
        }

        // 3. Write formatted JSON to the selected targetUri
        const contentToWrite = JSON.stringify(sampleDoc, null, 2);
        await vscode.workspace.fs.writeFile(targetUri, Buffer.from(contentToWrite, 'utf-8'));

        // 4. Open the new file in VS Code in a new editor tab using our custom editor
        await vscode.commands.executeCommand('vscode.openWith', targetUri, AgentEditorProvider.viewType);

        vscode.window.showInformationMessage(
          `Created "${path.basename(targetUri.fsPath)}" from "${sampleName}" sample and opened in a new tab.`
        );
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create sample file: ${err?.message || String(err)}`);
      }
    });

    // Register external message delegates
    this.messageHandlers.forEach((handler, type) => {
      bridge.onMessage(type as any, async (payload) => {
        handler({ type: type as any, payload } as WebviewToExtensionMessage, bridge, document);
      });
    });

    // 4. Set HTML content on webview panel
    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview, document);

    // 5. Fire non-blocking initial theme sync
    const currentTheme =
      vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Light ||
      vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.HighContrastLight
        ? 'light'
        : 'dark';

    bridge.postMessage({
      type: 'THEME_CHANGED',
      payload: { theme: currentTheme },
    });

    this.outputChannel?.appendLine(
      `[AgentEditorProvider] resolveCustomTextEditor completed successfully for: ${document.uri.fsPath}`
    );

    // 6. Synchronize external document edits from outside webview
    const docChangeSub = vscode.workspace.onDidChangeTextDocument((e: vscode.TextDocumentChangeEvent) => {
      if (e.document.uri.toString() === document.uri.toString()) {
        // Skip updates initiated by webview sync
        if (isUpdatingFromWebview) return;

        if (e.contentChanges.length > 0 && e.reason === undefined) {
          try {
            const externalDoc = JSON.parse(document.getText()) as AgentWorkflowDocument;
            docVersion++;
            const relativeFilePath = vscode.workspace.asRelativePath(document.uri);
            bridge.postMessage({
              type: 'LOAD_DOCUMENT',
              payload: {
                document: externalDoc,
                docVersion: docVersion,
                filePath: relativeFilePath,
              },
            });
          } catch {
            // Ignore partial parse errors while user is actively typing externally
          }
        }
      }
    });

    // Notify webview when file is saved to disk by user (Cmd+S / File > Save)
    const docSaveSub = typeof vscode.workspace.onDidSaveTextDocument === 'function'
      ? vscode.workspace.onDidSaveTextDocument((savedDoc) => {
          if (savedDoc.uri.toString() === document.uri.toString()) {
            bridge.postMessage({
              type: 'DOCUMENT_SAVED',
              payload: {
                docVersion: docVersion,
                timestamp: new Date().toISOString(),
              },
            });
          }
        })
      : { dispose: () => {} };

    // Notify webview when file is renamed or moved on disk
    const fileRenameSub = typeof vscode.workspace.onDidRenameFiles === 'function'
      ? vscode.workspace.onDidRenameFiles((e) => {
          for (const file of e.files) {
            if (
              file.oldUri.toString() === document.uri.toString() ||
              file.newUri.toString() === document.uri.toString()
            ) {
              const relativeFilePath = vscode.workspace.asRelativePath(document.uri);
              let parsedDoc: AgentWorkflowDocument;
              try {
                parsedDoc = JSON.parse(document.getText());
              } catch {
                parsedDoc = this.createEmptyWorkflow(document.uri);
              }
              bridge.postMessage({
                type: 'LOAD_DOCUMENT',
                payload: {
                  document: parsedDoc,
                  docVersion: docVersion,
                  filePath: relativeFilePath,
                },
              });
            }
          }
        })
      : { dispose: () => {} };

    // Clean up event listeners and background runners on panel disposal
    webviewPanel.onDidDispose(async () => {
      await this.runnerManager.stopLocalRunner(undefined, undefined, bridge);
      this.runnerManager.cancelAll();
      // NOTE: Background cloud deployments to Vertex AI Agent Engine must persist across panel disposal and tab switches.
      // They are only cancelled if explicitly requested by the user via CANCEL_AGENT_ENGINE_DEPLOY.
      themeChangeSub.dispose();
      docChangeSub.dispose();
      docSaveSub.dispose();
      fileRenameSub.dispose();
      bridge.dispose();
    });
    } catch (err: any) {
      console.error('[AgentEditorProvider] Exception in resolveCustomTextEditor:', err);
      this.outputChannel?.appendLine(
        `[AgentEditorProvider] Exception in resolveCustomTextEditor: ${err?.stack || err?.message || err}`
      );
      vscode.window.showErrorMessage(`Agent Flow Error: ${err?.message || err}`);
    }
  }

  /**
   * Applies full content replacement on the underlying text document.
   *
   * @param document Target vscode.TextDocument
   * @param newContent Formatted JSON text string
   */
  private async updateTextDocument(
    document: vscode.TextDocument,
    newContent: string
  ): Promise<boolean> {
    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(
      document.positionAt(0),
      document.positionAt(document.getText().length)
    );
    edit.replace(document.uri, fullRange, newContent);
    return vscode.workspace.applyEdit(edit);
  }

  /**
   * Generates a default single-agent workflow document if opened on an empty file.
   *
   * @param uri URI of the opened document
   * @returns Default AgentWorkflowDocument
   */
  public createDefaultWorkflow(uri: vscode.Uri): AgentWorkflowDocument {
    const baseName = path.basename(uri.fsPath, '.agent') || 'default_workflow';
    return AgentEditorProvider.createDefaultWorkflowDocument(baseName);
  }

  public createEmptyWorkflow(uri: vscode.Uri): AgentWorkflowDocument {
    const baseName = path.basename(uri.fsPath, '.agent') || 'empty_workflow';
    return AgentEditorProvider.createEmptyWorkflowDocument(baseName);
  }

  public static createEmptyWorkflowDocument(workflowName: string = 'new_workflow'): AgentWorkflowDocument {
    return {
      version: '1.0.0',
      name: workflowName,
      description: 'Agent Workflow Document',
      framework: 'google-adk',
      language: 'python',
      nodes: [],
      edges: [],
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      deployment: {
        target: 'agent_engine',
        deploymentTarget: 'agent_engine',
        outputFolder: `./${sanitizeFolderBaseName(workflowName || 'workflow')}/`,
        framework: 'google-adk',
        language: 'python',
      },
    };
  }

  /**
   * Generates a standard default single-agent workflow document.
   *
   * @param workflowName Optional custom workflow name
   * @returns Initialized AgentWorkflowDocument
   */
  public static createDefaultWorkflowDocument(workflowName: string = 'new_workflow'): AgentWorkflowDocument {
    return {
      version: '1.0.0',
      name: workflowName,
      description: 'Single Agent workflow created with Visual Agent Flow Builder',
      framework: 'google-adk',
      language: 'python',
      nodes: [
        {
          id: 'node-trigger-1',
          type: 'trigger',
          position: { x: 80, y: 160 },
          data: {
            label: 'Test Suite Trigger',
            description: 'Automated test query runner',
            triggerKind: 'test',
            testConfig: {
              testScenarios: [
                {
                  id: 'test-1',
                  name: 'General Query Verification',
                  inputQuery: 'What are the key capabilities of Google ADK?',
                  expectedOutputPattern: 'agent',
                },
              ],
            },
          },
        },
        {
          id: 'node-agent-1',
          type: 'agent',
          position: { x: 440, y: 160 },
          data: {
            label: 'Primary Assistant',
            description: 'Core LLM agent',
            agentKind: 'standard',
            standardConfig: {
              model: 'gemini-3.7-flash',
              systemInstruction:
                'You are a helpful, expert AI engineering assistant. Provide direct, grounded, and concise answers.',
              temperature: 0.7,
              topP: 0.95,
              maxOutputTokens: 2048,
              tools: [],
              memory: 'none',
            },
          },
        },
      ],
      edges: [
        {
          id: 'edge-trigger-to-agent',
          source: 'node-trigger-1',
          target: 'node-agent-1',
          sourceHandle: 'trigger_out_right',
          targetHandle: 'input_left',
        },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        author: 'Mike Nimer <mikenimer@google.com>',
      },
      deployment: {
        target: 'agent_engine',
        deploymentTarget: 'agent_engine',
        outputFolder: `./${sanitizeFolderBaseName(workflowName || 'workflow')}/`,
        framework: 'google-adk',
        language: 'python',
      },
    };
  }

  /**
   * Generates HTML for embedding the full React SPA in the Webview panel.
   * Enforces strict CSP with cryptographic nonces, attaches global error listeners,
   * initializes the VS Code API singleton, embeds initial document state for zero-latency
   * rendering, and directly embeds compiled assets with fallback to Webview URIs.
   *
   * Architectural Decisions:
   * 1. Resolves canonical filesystem paths using fs.realpathSync to support symlinked extensions.
   * 2. Inlines compiled CSS and JavaScript bundle directly with cryptographic nonce authorization,
   *    guaranteeing 100% execution reliability without external resource-root or CORS blocking.
   * 3. Generates a cryptographic nonce for Content-Security-Policy (CSP) enforcement.
   * 4. Executes an inline bootstrap script that acquires acquireVsCodeApi() once and
   *    attaches window.vscode and window.addEventListener error diagnostics.
   * 5. Pre-injects window.__INITIAL_AGENT_DOCUMENT__ for immediate synchronous hydration.
   *
   * @param webview VS Code Webview instance
   * @param document Optional backing vscode.TextDocument for initial hydration
   * @returns HTML document string
   */
  public getHtmlForWebview(webview: vscode.Webview, document?: vscode.TextDocument): string {
    const extensionUri = this.context.extensionUri || vscode.Uri.file(this.context.extensionPath || '');
    let realExtensionPath = this.context.extensionPath || extensionUri.fsPath;
    try {
      if (fs.existsSync(realExtensionPath)) {
        realExtensionPath = fs.realpathSync(realExtensionPath);
      }
    } catch {
      // fallback
    }

    const realExtensionUri = vscode.Uri.file(realExtensionPath);
    const distUri = vscode.Uri.joinPath(realExtensionUri, 'dist', 'webview');
    const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(distUri, 'assets', 'index.js'));
    const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(distUri, 'assets', 'index.css'));

    // Read compiled CSS and JS directly for guaranteed inline execution
    const cssPath = path.join(realExtensionPath, 'dist', 'webview', 'assets', 'index.css');
    const jsPath = path.join(realExtensionPath, 'dist', 'webview', 'assets', 'index.js');
    let inlineCss = '';
    let inlineJs = '';
    try {
      if (fs.existsSync(cssPath)) {
        inlineCss = fs.readFileSync(cssPath, 'utf-8');
      }
      if (fs.existsSync(jsPath)) {
        inlineJs = fs.readFileSync(jsPath, 'utf-8');
      }
    } catch (err) {
      this.outputChannel?.appendLine(`[AgentEditorProvider] Warning reading asset files from disk: ${err}`);
    }

    // Parse initial document for instant client-side hydration
    let initialDoc: AgentWorkflowDocument | null = null;
    if (document) {
      const docText = document.getText();
      try {
        initialDoc = docText.trim().length > 0 ? JSON.parse(docText) : this.createEmptyWorkflow(document.uri);
      } catch {
        initialDoc = this.createEmptyWorkflow(document.uri);
      }
    }

    // Generate cryptographic nonce for strict Content Security Policy
    const nonce = crypto.randomBytes(16).toString('base64');
    const cspSource = webview.cspSource;

    this.outputChannel?.appendLine(
      `[AgentEditorProvider:Step 2] Prepared webview HTML with assets (inlineJs: ${inlineJs.length > 0 ? `${inlineJs.length} bytes` : 'fallback URI'}, inlineCss: ${inlineCss.length > 0 ? `${inlineCss.length} bytes` : 'fallback URI'})`
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' 'unsafe-eval' ${cspSource}; font-src ${cspSource}; img-src ${cspSource} https: data:; connect-src ${cspSource};" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Agent Flow Builder</title>
  <style nonce="${nonce}">
    html, body, #root {
      height: 100%;
      width: 100%;
      margin: 0;
      padding: 0;
      overflow: hidden;
      background-color: #1e1e1e;
      color: #cccccc;
      box-sizing: border-box;
    }
    ${inlineCss}
  </style>
  ${!inlineCss ? `<link rel="stylesheet" href="${cssUri.toString()}">` : ''}
</head>
<body class="bg-[#1e1e1e] text-[#cccccc] overflow-hidden m-0 p-0 h-full w-full">
  <div id="root" class="h-full w-full"></div>
  <script nonce="${nonce}">
    (function() {
      try {
        const vscode = acquireVsCodeApi();
        window.vscode = vscode;
        window.vscodeApiInstance = vscode;
        ${initialDoc ? `window.__INITIAL_AGENT_DOCUMENT__ = ${JSON.stringify(initialDoc)};` : ''}
        ${document ? `window.__INITIAL_AGENT_FILE_PATH__ = ${JSON.stringify(vscode.workspace.asRelativePath(document.uri))};` : ''}

        // Global diagnostic hooks for unhandled errors
        window.addEventListener('error', function(e) {
          var msg = e.message || String(e);
          if (msg.indexOf('ResizeObserver') !== -1) {
            return;
          }
          vscode.postMessage({
            type: 'DIAGNOSTIC_ERROR',
            payload: {
              message: msg,
              url: e.filename || '',
              line: e.lineno || 0,
              col: e.colno || 0,
              stack: (e.error && e.error.stack) ? e.error.stack : ''
            }
          });
        });

        window.addEventListener('unhandledrejection', function(e) {
          vscode.postMessage({
            type: 'DIAGNOSTIC_ERROR',
            payload: {
              message: 'Unhandled Promise Rejection: ' + (e.reason ? (e.reason.message || String(e.reason)) : 'unknown'),
              stack: (e.reason && e.reason.stack) ? e.reason.stack : ''
            }
          });
        });

        vscode.postMessage({
          type: 'BOOTSTRAP_LOADED',
          payload: { timestamp: new Date().toISOString() }
        });
      } catch (err) {
        console.error('Failed to initialize webview bootstrap:', err);
      }
    })();
  </script>
  ${inlineJs ? `<script nonce="${nonce}">\n${inlineJs}\n</script>` : `<script nonce="${nonce}" src="${jsUri.toString()}"></script>`}
</body>
</html>`;
  }

  /**
   * Resolves the target directory path on disk for code generation, testing, and file verification.
   * By default, resolves a relative folder to the active .agent file where the folder name matches the file name.
   *
   * Logic Flow:
   * 1. If explicit configuredFolder is absolute, return it.
   * 2. If configuredFolder is provided (e.g., './scratch-agent/' or 'scratch-agent'):
   *    - Resolve relative to the file's parent directory: path.resolve(path.dirname(document.uri.fsPath), configuredFolder).
   * 3. If no configuredFolder is provided:
   *    - Derive folder name from document basename without .agent (e.g., 'scratch-agent').
   *    - Resolve into path.join(path.dirname(document.uri.fsPath), folderName).
   *
   * @param document VS Code text document for the active .agent file
   * @param configuredFolder Optional explicit outputFolder from payload or metadata
   * @returns Absolute filesystem path string
   */
  public resolveTargetDirectory(document: vscode.TextDocument, configuredFolder?: string): string {
    const docDir = path.dirname(document.uri.fsPath);
    let folder = configuredFolder?.trim();

    if (!folder) {
      try {
        const text = document.getText();
        if (text && text.trim().length > 0) {
          const parsed = JSON.parse(text) as AgentWorkflowDocument;
          folder = parsed.deployment?.outputFolder?.trim() || parsed.metadata?.outputFolder?.trim();
        }
      } catch {
        // Fall back to filename
      }
    }

    const baseName = path.basename(document.uri.fsPath, '.agent');
    const sanitized = sanitizeFolderBaseName(baseName || 'workflow');

    if (!folder) {
      return path.join(docDir, sanitized);
    }

    // If folder is a generic root agents collection or relative root, append sanitized agent subfolder
    if (
      folder === './' ||
      folder === '.' ||
      folder === './src/agents/' ||
      folder === './src/agents' ||
      folder === 'src/agents/' ||
      folder === 'src/agents' ||
      folder === './agents/' ||
      folder === './agents' ||
      folder === 'agents/' ||
      folder === 'agents'
    ) {
      folder = path.join('./', sanitized);
    }

    // Strip legacy src/ or src/agents/ prefix if present
    if (folder.startsWith('./src/agents/')) {
      folder = `./${folder.slice('./src/agents/'.length)}`;
    } else if (folder.startsWith('src/agents/')) {
      folder = `./${folder.slice('src/agents/'.length)}`;
    } else if (folder.startsWith('./src/')) {
      folder = `./${folder.slice('./src/'.length)}`;
    } else if (folder.startsWith('src/')) {
      folder = `./${folder.slice('src/'.length)}`;
    }

    if (path.isAbsolute(folder)) {
      return folder;
    }

    return path.resolve(docDir, folder);
  }

  /**
   * Scans a target directory on disk and loads any pre-existing generated code files.
   *
   * Logic Flow:
   * 1. Validates directory existence.
   * 2. Reads all directory entries, ignoring virtual environments and build cache directories.
   * 3. Maps file extensions to syntax languages (python, typescript, json, markdown).
   * 4. Extracts file text and assigns human-readable file descriptions.
   * 5. Sorts files with entrypoints and dependency manifests first.
   *
   * @param targetDir Target directory path on filesystem
   * @returns Array of GeneratedFile objects
   */
  public loadGeneratedFilesFromDisk(targetDir: string): GeneratedFile[] {
    if (!fs.existsSync(targetDir)) return [];
    const files: GeneratedFile[] = [];
    const ignoredNames = new Set([
      '.venv',
      'venv',
      'env',
      '__pycache__',
      '.git',
      '.DS_Store',
      'node_modules',
      '.pytest_cache',
    ]);

    try {
      const entries = fs.readdirSync(targetDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && !ignoredNames.has(entry.name)) {
          const ext = path.extname(entry.name).toLowerCase();
          let language: 'python' | 'typescript' | 'markdown' | 'json' = 'markdown';
          if (ext === '.py') language = 'python';
          else if (ext === '.ts' || ext === '.js') language = 'typescript';
          else if (ext === '.json') language = 'json';
          else if (
            ext === '.md' ||
            ext === '.txt' ||
            ext === '.yaml' ||
            ext === '.yml' ||
            ext === '.sh' ||
            entry.name === 'Dockerfile'
          )
            language = 'markdown';

          let description = `${entry.name} file`;
          if (entry.name === 'server.py') description = 'FastAPI agent execution server';
          else if (entry.name === 'agent.py' || entry.name === 'main.py')
            description = 'Main agent workflow implementation';
          else if (entry.name === 'requirements.txt') description = 'Python runtime dependencies';
          else if (entry.name === 'README.md') description = 'Agent documentation & deployment guide';
          else if (entry.name === 'Dockerfile') description = 'Container build specification';

          try {
            const content = fs.readFileSync(path.join(targetDir, entry.name), 'utf-8');
            files.push({
              path: entry.name,
              name: entry.name,
              language,
              content,
              description,
            });
          } catch {}
        }
      }
    } catch {}

    files.sort((a, b) => {
      const priorityOrder: Record<string, number> = {
        'server.py': 1,
        'agent.py': 2,
        'main.py': 3,
        'requirements.txt': 4,
        'README.md': 5,
        'Dockerfile': 6,
      };
      const pA = priorityOrder[a.name || a.path] || 10;
      const pB = priorityOrder[b.name || b.path] || 10;
      return pA - pB;
    });

    return files;
  }

  /**
   * Resiliently cleans target directory before writing new generated code files.
   * Deletes all old generated source files, subdirectories, and virtual environments
   * (.venv, venv, node_modules) to prevent cross-framework or cross-language dependency conflicts,
   * while preserving the active .agent workflow document, git metadata (.git),
   * and IDE configuration files.
   *
   * Logic Flow:
   * 1. Resolves target directory and ensures folder exists.
   * 2. Iterates over directory entries using both VS Code fs and Node fs.
   * 3. Protects preserved paths (.agent, .git, .vscode, .idea, .DS_Store).
   * 4. Deletes each target file/subdirectory/venv with isolated try/catch and Node fs fallback.
   *
   * @param targetDirPath Target folder path on disk
   * @param document Active VS Code TextDocument to preserve
   * @returns Object detailing deleted files and preserved entries
   */
  public async cleanTargetDirectory(
    targetDirPath: string,
    document?: vscode.TextDocument
  ): Promise<{ cleaned: string[]; preserved: string[]; errors: string[] }> {
    const cleaned: string[] = [];
    const preserved: string[] = [];
    const errors: string[] = [];

    const preservedNames = new Set([
      '.git',
      '.vscode',
      '.idea',
      '.DS_Store',
    ]);

    const targetDirUri = vscode.Uri.file(targetDirPath);

    try {
      // Ensure target directory exists
      try {
        await vscode.workspace.fs.createDirectory(targetDirUri);
      } catch {}

      // Discover entries via VS Code filesystem API or Node fs
      let entryNames: string[] = [];
      try {
        const vsEntries = await vscode.workspace.fs.readDirectory(targetDirUri);
        entryNames = vsEntries.map(([name]) => name);
      } catch {
        if (fs.existsSync(targetDirPath)) {
          entryNames = fs.readdirSync(targetDirPath);
        }
      }

      if (entryNames.length === 0 && fs.existsSync(targetDirPath)) {
        entryNames = fs.readdirSync(targetDirPath);
      }

      for (const entryName of entryNames) {
        const fullEntryPath = path.join(targetDirPath, entryName);
        const entryUri = vscode.Uri.joinPath(targetDirUri, entryName);

        // 1. Preserve active workflow document (.agent)
        if (
          document &&
          document.uri &&
          (entryUri.fsPath === document.uri.fsPath || fullEntryPath === document.uri.fsPath)
        ) {
          preserved.push(entryName);
          continue;
        }

        // 2. Preserve virtual environments, git repository, tools directory in document root, and system files
        if (
          preservedNames.has(entryName) ||
          entryName.endsWith('.agent') ||
          (entryName === 'tools' && document && targetDirPath === path.dirname(document.uri.fsPath))
        ) {
          preserved.push(entryName);
          continue;
        }

        // 3. Delete stale file or directory
        let deleted = false;
        try {
          await vscode.workspace.fs.delete(entryUri, { recursive: true, useTrash: false });
          deleted = true;
        } catch (vscodeFsErr) {
          // VS Code fs provider error, fallback to node fs
        }

        try {
          if (fs.existsSync(fullEntryPath)) {
            fs.rmSync(fullEntryPath, { recursive: true, force: true });
            deleted = true;
          }
        } catch (nodeFsErr: any) {
          errors.push(`Failed to delete ${entryName}: ${nodeFsErr?.message || nodeFsErr}`);
          this.outputChannel?.appendLine(
            `[AgentEditorProvider] Failed to delete entry ${entryName}: ${nodeFsErr?.message || nodeFsErr}`
          );
        }

        if (deleted || !fs.existsSync(fullEntryPath)) {
          cleaned.push(entryName);
        }
      }
    } catch (err: any) {
      errors.push(`Directory cleanup error: ${err?.message || err}`);
      this.outputChannel?.appendLine(
        `[AgentEditorProvider] Directory cleanup error: ${err?.message || err}`
      );
    }

    return { cleaned, preserved, errors };
  }

  /**
   * Parses top-level Python function definitions from a script file,
   * extracting function names, docstrings, and parameter signatures.
   */
  public parsePythonFunctions(fileContent: string): Array<{
    name: string;
    docstring?: string;
    parameters?: Record<string, string>;
  }> {
    const functions: Array<{ name: string; docstring?: string; parameters?: Record<string, string> }> = [];
    const defRegex = /^def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)\s*(?:->\s*[^:]+)?\s*:/gm;
    let match: RegExpExecArray | null;

    while ((match = defRegex.exec(fileContent)) !== null) {
      const funcName = match[1];
      const rawParams = match[2];
      if (funcName.startsWith('_')) continue;

      const parameters: Record<string, string> = {};
      if (rawParams.trim()) {
        const paramList = rawParams.split(',');
        for (const p of paramList) {
          const trimmed = p.trim();
          if (!trimmed || trimmed === 'self' || trimmed === 'cls') continue;
          const parts = trimmed.split(':').map((s) => s.trim());
          const pName = parts[0].split('=')[0].trim();
          let pType = parts[1] ? parts[1].split('=')[0].trim() : 'string';
          parameters[pName] = pType || 'str';
        }
      }

      const afterDef = fileContent.slice(match.index + match[0].length);
      const docMatch = afterDef.match(/^\s*(?:"""([\s\S]*?)"""|'''([\s\S]*?)'''|"([^"\n]*)"|'([^'\n]*)')/);
      const docstring = docMatch ? (docMatch[1] || docMatch[2] || docMatch[3] || docMatch[4]).trim() : undefined;

      functions.push({
        name: funcName,
        docstring,
        parameters,
      });
    }

    return functions;
  }

  /**
   * Copies local Python tool files referenced by workflow nodes into
   * the output target's `./tools/` directory.
   */
  public async copyLocalToolFiles(
    agentDoc: AgentWorkflowDocument | undefined,
    document: vscode.TextDocument,
    targetDirPath: string
  ): Promise<string[]> {
    if (!agentDoc) return [];
    const copiedFiles: string[] = [];
    const baseDir = path.dirname(document.uri.fsPath);
    const targetToolsDir = path.join(targetDirPath, 'tools');

    const tools: any[] = [];
    if (agentDoc.tools) tools.push(...agentDoc.tools);
    if (agentDoc.agents) {
      for (const ag of agentDoc.agents) {
        if (ag.tools) tools.push(...ag.tools);
      }
    }

    const uniqueSources = new Set<string>();
    for (const t of tools) {
      if (t && t.sourceFile) {
        uniqueSources.add(t.sourceFile);
      }
    }

    if (uniqueSources.size > 0) {
      if (!fs.existsSync(targetToolsDir)) {
        fs.mkdirSync(targetToolsDir, { recursive: true });
      }
      const initPy = path.join(targetToolsDir, '__init__.py');
      if (!fs.existsSync(initPy)) {
        fs.writeFileSync(initPy, '"""Tools package for agent pipeline."""\n', 'utf-8');
      }

      for (const relSource of uniqueSources) {
        const sourcePath = path.isAbsolute(relSource) ? relSource : path.resolve(baseDir, relSource);
        if (fs.existsSync(sourcePath)) {
          const destPath = path.join(targetToolsDir, path.basename(sourcePath));
          if (path.resolve(sourcePath) !== path.resolve(destPath)) {
            fs.copyFileSync(sourcePath, destPath);
            copiedFiles.push(path.join('tools', path.basename(sourcePath)));
          }
        }
      }
    }
    return copiedFiles;
  }

  /**
   * Discovers and parses pre-configured .agent workflow samples located in resource/sample/
   * or resource/samples/ within the extension bundle and open workspace folders.
   *
   * Architectural Decisions:
   * - Scans both extension installation root and open workspaces to support both bundled
   *   blueprints and user-defined workspace sample repositories.
   * - Normalizes file paths and generates rich SampleWorkflowDefinition payloads for the webview.
   * - Recursively discovers .agent files in nested sub-directories (e.g. resource/sample/cyber_guardian/cyber_guardian.agent).
   *
   * @author Mike Nimer <mikenimer@google.com>
   * @returns Array of loaded SampleWorkflowDefinition objects
   */
  public discoverResourceSamples(): SampleWorkflowDefinition[] {
    // Section 1: Candidate search directories
    const candidateDirs: string[] = [];
    if (this.context?.extensionPath) {
      candidateDirs.push(path.join(this.context.extensionPath, 'resource', 'sample'));
      candidateDirs.push(path.join(this.context.extensionPath, 'resource', 'samples'));
    }
    if (vscode.workspace.workspaceFolders) {
      for (const wf of vscode.workspace.workspaceFolders) {
        candidateDirs.push(path.join(wf.uri.fsPath, 'resource', 'sample'));
        candidateDirs.push(path.join(wf.uri.fsPath, 'resource', 'samples'));
      }
    }

    // Section 2: Recursive file discovery
    const discoveredFiles: string[] = [];
    for (const dir of candidateDirs) {
      if (fs.existsSync(dir)) {
        discoveredFiles.push(...this.scanDirectoryForAgentFiles(dir));
      }
    }

    // Section 3: Parse and deduplicate samples
    const samples: SampleWorkflowDefinition[] = [];
    const seenIds = new Set<string>();

    for (const filePath of discoveredFiles) {
      try {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(fileContent);
        if (!parsed || !Array.isArray(parsed.nodes)) continue;

        // Determine unique ID and display metadata
        const parentDirName = path.basename(path.dirname(filePath));
        const baseFileName = path.basename(filePath, '.agent');
        const sampleId = (parentDirName !== 'sample' && parentDirName !== 'samples')
          ? parentDirName
          : baseFileName;

        if (seenIds.has(sampleId)) continue;
        seenIds.add(sampleId);

        // Count tools across all nodes
        let toolsCount = 0;
        let triggerType = 'chat';
        const testPrompts: any[] = [];

        for (const n of parsed.nodes) {
          if (n.type === 'trigger') {
            triggerType = n.data?.triggerKind || n.data?.triggerType || triggerType;
            if (n.data?.config?.testScenarios) {
              testPrompts.push(...n.data.config.testScenarios);
            } else if (n.data?.config?.testPrompts) {
              testPrompts.push(...n.data.config.testPrompts);
            }
          }
          if (n.data?.tools && Array.isArray(n.data.tools)) {
            toolsCount += n.data.tools.length;
          }
        }

        const sampleDef: SampleWorkflowDefinition = {
          id: sampleId,
          name: parsed.name || baseFileName,
          filename: path.basename(filePath),
          category: parsed.metadata?.category || 'Ready-to-Use Workflows',
          badge: parsed.metadata?.badge || (parsed.framework === 'langgraph' ? 'LangGraph' : 'Google ADK'),
          description: parsed.description || 'Enterprise agent workflow blueprint.',
          features: parsed.metadata?.features || ['Multi-Agent', 'Grounding', 'Automated Tests'],
          nodesCount: parsed.nodes.length,
          toolsCount: toolsCount,
          triggerType: triggerType,
          iconName: 'Workflow',
          color: 'purple',
          nodes: parsed.nodes,
          edges: parsed.edges || [],
          config: {
            framework: parsed.framework || 'google-adk',
            language: parsed.language || 'python',
            outputFolder: (parsed.deployment?.outputFolder || `./${sampleId}_agent/`).replace(/^(\.\/)?src\//, './'),
            includeTests: parsed.deployment?.includeTests ?? true,
            includeDocker: parsed.deployment?.includeDocker ?? true,
            useStreaming: parsed.deployment?.useStreaming ?? true,
          },
          deploymentConfig: parsed.deployment,
          testPrompts: testPrompts.length > 0 ? testPrompts : undefined,
          sourceFilePath: filePath,
        };

        samples.push(sampleDef);
      } catch (err) {
        this.outputChannel?.appendLine(`[AgentEditorProvider] Failed to parse sample at ${filePath}: ${err}`);
      }
    }

    return samples;
  }

  /**
   * Recursively scans a directory for files ending in .agent
   *
   * @author Mike Nimer <mikenimer@google.com>
   * @param dirPath Directory to scan
   * @returns Array of absolute file paths to .agent documents
   */
  private scanDirectoryForAgentFiles(dirPath: string): string[] {
    const results: string[] = [];
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          results.push(...this.scanDirectoryForAgentFiles(fullPath));
        } else if (entry.isFile() && entry.name.endsWith('.agent')) {
          results.push(fullPath);
        }
      }
    } catch {
      // Ignore read errors
    }
    return results;
  }
}
