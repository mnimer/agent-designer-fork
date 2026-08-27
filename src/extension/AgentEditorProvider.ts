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
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as crypto from 'crypto';
import { AgentWorkflowDocument } from '../shared/types';
import { WebviewBridge } from './WebviewBridge';
import {
  WebviewToExtensionMessage,
} from '../shared/rpcProtocol';

export class AgentEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'agentFlow.editor';

  private readonly context: vscode.ExtensionContext;
  private readonly messageHandlers: Map<
    string,
    (msg: WebviewToExtensionMessage, bridge: WebviewBridge, doc: vscode.TextDocument) => void
  > = new Map();

  /**
   * Initializes the AgentEditorProvider with extension context.
   *
   * @param context VS Code extension context
   */
  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  /**
   * Registers the custom editor provider with VS Code.
   *
   * @param context VS Code extension context
   * @returns Disposable subscription
   */
  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new AgentEditorProvider(context);
    const providerRegistration = vscode.window.registerCustomEditorProvider(
      AgentEditorProvider.viewType,
      provider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
        supportsMultipleEditorsPerDocument: false,
      }
    );
    return providerRegistration;
  }

  /**
   * Registers an external message delegate for handling specific RPC actions (e.g., CodeGen, Runner).
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
    this.messageHandlers.set(type, handler);
  }

  /**
   * Resolves the custom text editor webview when an *.agent file is opened.
   *
   * @param document Backing text document representing the *.agent file
   * @param webviewPanel The webview panel hosting the React application
   * @param token Cancellation token
   */
  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    token: vscode.CancellationToken
  ): Promise<void> {
    // 1. Configure webview permissions and local resource roots
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(this.context.extensionPath, 'dist')),
        vscode.Uri.file(path.join(this.context.extensionPath, 'src/webview')),
      ],
    };

    // 2. Set the HTML content with CSP and bundle injection
    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

    let docVersion = 1;
    const bridge = new WebviewBridge(webviewPanel);

    // 3. Send initial theme configuration
    const currentTheme =
      vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Light ||
      vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.HighContrastLight
        ? 'light'
        : 'dark';

    await bridge.postMessage({
      type: 'THEME_CHANGED',
      payload: { theme: currentTheme },
    });

    // 4. Synchronize theme changes
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

    // 5. Register core RPC handlers on the bridge
    bridge.onMessage('READY', async () => {
      const docText = document.getText();
      let parsedDoc: AgentWorkflowDocument;
      try {
        parsedDoc =
          docText.trim().length > 0
            ? JSON.parse(docText)
            : this.createDefaultWorkflow(document.uri);
      } catch {
        parsedDoc = this.createDefaultWorkflow(document.uri);
      }

      await bridge.postMessage({
        type: 'LOAD_DOCUMENT',
        payload: {
          document: parsedDoc,
          docVersion: docVersion,
          readOnly: !vscode.workspace.isTrusted,
        },
      });
    });

    bridge.onMessage('DOCUMENT_UPDATED', async (payload) => {
      if (!payload) return;
      docVersion = payload.docVersion;
      const updatedJson = JSON.stringify(payload.document, null, 2);
      await this.updateTextDocument(document, updatedJson);

      await bridge.postMessage({
        type: 'DOCUMENT_SAVED',
        payload: {
          docVersion: docVersion,
          timestamp: new Date().toISOString(),
        },
      });
    });

    bridge.onMessage('OPEN_SETTINGS', () => {
      vscode.commands.executeCommand('workbench.action.openSettings', 'agentFlow');
    });

    // Register external message delegates
    this.messageHandlers.forEach((handler, type) => {
      bridge.onMessage(type as any, async (payload) => {
        handler({ type: type as any, payload } as WebviewToExtensionMessage, bridge, document);
      });
    });

    // 6. Synchronize external document edits from outside webview
    const docChangeSub = vscode.workspace.onDidChangeTextDocument((e: vscode.TextDocumentChangeEvent) => {
      if (e.document.uri.toString() === document.uri.toString()) {
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

    // Clean up event listeners on panel disposal
    webviewPanel.onDidDispose(() => {
      themeChangeSub.dispose();
      docChangeSub.dispose();
      bridge.dispose();
    });
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
    return {
      version: '1.0.0',
      name: baseName,
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
   * Generates CSP-compliant HTML for embedding the React SPA in the Webview panel.
   *
   * @param webview VS Code Webview instance
   * @returns HTML document string
   */
  public getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = crypto.randomBytes(16).toString('base64');
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.file(
        path.join(this.context.extensionPath, 'dist', 'webview', 'assets', 'index.js')
      )
    );

    const styleUri = webview.asWebviewUri(
      vscode.Uri.file(
        path.join(this.context.extensionPath, 'dist', 'webview', 'assets', 'index.css')
      )
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="
    default-src 'none';
    img-src ${webview.cspSource} https: data:;
    script-src 'nonce-${nonce}';
    style-src ${webview.cspSource} 'unsafe-inline';
    font-src ${webview.cspSource};
    connect-src ${webview.cspSource} https:;
  " />
  <title>Agent Flow Builder</title>
  <link rel="stylesheet" href="${styleUri}" />
</head>
<body class="bg-[#1e1e1e] text-[#cccccc] overflow-hidden m-0 p-0 h-screen w-screen">
  <div id="root" class="h-full w-full"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
