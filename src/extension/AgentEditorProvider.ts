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
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { AgentWorkflowDocument } from '../shared/types';
import { WebviewBridge } from './WebviewBridge';
import {
  WebviewToExtensionMessage,
} from '../shared/rpcProtocol';
import { GeminiCodeGenEngine } from './GeminiCodeGenEngine';
import { AgentRunnerManager } from './AgentRunnerManager';

export class AgentEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'agentFlow.editor';

  private readonly context: vscode.ExtensionContext;
  private readonly codeGenEngine: GeminiCodeGenEngine;
  private readonly runnerManager: AgentRunnerManager;
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
    this.runnerManager = new AgentRunnerManager(context.extensionPath);
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
      console.log(`[AgentEditorProvider] Resolving custom editor for document: ${document.uri.fsPath}`);
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
      bridge.onMessage('BOOTSTRAP_LOADED', (payload) => {
        console.log('[AgentEditorProvider] Webview bootstrap script active');
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
        console.error('[AgentEditorProvider:WEBVIEW_EXCEPTION]', payload);
        this.outputChannel?.appendLine(
          `[AgentEditorProvider:WEBVIEW_EXCEPTION] Error in webview: ${payload.message} (${payload.url}:${payload.line}:${payload.col})\nStack: ${payload.stack || 'none'}`
        );
        vscode.window.showErrorMessage(`Agent Flow Webview Error: ${payload.message}`);
      });

      bridge.onMessage('READY', async () => {
        console.log(`[AgentEditorProvider] Webview sent READY signal for: ${document.uri.fsPath}`);
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

        console.log(`[AgentEditorProvider] Posting LOAD_DOCUMENT (nodes: ${parsedDoc.nodes?.length || 0}, edges: ${parsedDoc.edges?.length || 0})`);
        this.outputChannel?.appendLine(
          `[AgentEditorProvider:Step 5] Posting LOAD_DOCUMENT (nodes: ${parsedDoc.nodes?.length || 0}, edges: ${parsedDoc.edges?.length || 0})`
        );

      await bridge.postMessage({
        type: 'LOAD_DOCUMENT',
        payload: {
          document: parsedDoc,
          docVersion: docVersion,
          readOnly: !vscode.workspace.isTrusted,
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

      const result = await this.codeGenEngine.generateCode({
        document: payload.document,
        framework: payload.targetFramework,
        language: payload.targetLanguage,
        apiKey: apiKey,
      });

      await bridge.postMessage({
        type: 'CODE_GENERATED',
        payload: {
          success: result.success,
          files: result.files,
          modelUsed: result.modelUsed,
          error: result.error,
        },
      });
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
        const workspaceFolders = vscode.workspace.workspaceFolders;
        const targetDir =
          payload.outputDirectory && workspaceFolders
            ? vscode.Uri.joinPath(workspaceFolders[0].uri, payload.outputDirectory)
            : workspaceFolders
            ? workspaceFolders[0].uri
            : vscode.Uri.file(path.dirname(document.uri.fsPath));

        const pathsWritten: string[] = [];
        for (const file of result.files) {
          const fileUri = vscode.Uri.joinPath(targetDir, file.path);
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
            outputDirectory: targetDir.fsPath,
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
      await this.runnerManager.runTests({
        document: payload.document,
        scenarioIds: payload.testScenarioIds,
        bridge,
      });
    });

    bridge.onMessage('CANCEL_TESTS', (payload) => {
      if (!payload?.runId) return;
      this.runnerManager.cancelRun(payload.runId);
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
            bridge.postMessage({
              type: 'LOAD_DOCUMENT',
              payload: {
                document: externalDoc,
                docVersion: docVersion,
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

    // Clean up event listeners on panel disposal
    webviewPanel.onDidDispose(() => {
      themeChangeSub.dispose();
      docChangeSub.dispose();
      docSaveSub.dispose();
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
            description: 'Core LLM agent with Google Search Grounding',
            agentKind: 'standard',
            standardConfig: {
              model: 'gemini-2.5-flash',
              systemInstruction:
                'You are a helpful, expert AI engineering assistant. Provide direct, grounded, and concise answers.',
              temperature: 0.7,
              topP: 0.95,
              maxOutputTokens: 2048,
              tools: [
                {
                  id: 'tool-google-search',
                  name: 'Google Search Grounding',
                  description: 'Ground responses in live Google Web Search results',
                  type: 'builtin',
                },
              ],
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
        },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        author: 'Mike Nimer <mikenimer@google.com>',
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
}
