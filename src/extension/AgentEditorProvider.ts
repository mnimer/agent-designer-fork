/**
 * AgentEditorProvider
 *
 * Custom Text Editor Provider for Visual Studio Code Agent Flow Builder (*.agent).
 * Manages the lifecycle of webview panels associated with .agent workflow documents,
 * establishes CSP-compliant webview HTML, synchronizes disk document edits via
 * vscode.workspace.applyEdit, and coordinates bi-directional RPC communications via WebviewBridge.
 *
 * Architectural Decisions:
 * 1. Facade Pattern: Shrinks the main provider to a lightweight facade, delegating
 *    file persistence to DocumentSyncManager and webview IPC events to WebviewMessageRouter.
 * 2. Implements vscode.CustomTextEditorProvider instead of CustomReadonlyEditorProvider
 *    to leverage native VS Code undo/redo stacks and dirty document tracking.
 * 3. Uses retainContextWhenHidden: true to maintain React Flow canvas zoom, viewport,
 *    and running subprocess test state when switching between editor tabs.
 * 4. Model Selection & Global Region Mandate: Gemini 3.7-flash is configured exclusively
 *    with Vertex AI global region location.
 * 5. Sample Discovery & Category Resolution: Recursively scans candidate sample folders and
 *    determines domain categories from either category subfolders (e.g. resource/samples/retail/<sample>/)
 *    or .agent metadata.category, normalizing categories to standard title-case domains.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { AgentWorkflowDocument, SampleWorkflowDefinition } from '../shared/types';
import { WebviewBridge } from './WebviewBridge';
import { GeminiCodeGenEngine } from './GeminiCodeGenEngine';
import { AgentRunnerManager } from './AgentRunnerManager';
import { AgentEngineDeployer } from './AgentEngineDeployer';
import { CloudRunDeployer } from './CloudRunDeployer';
import { McpSubprocessManager } from './McpSubprocessManager';
import { McpOAuthManager } from './McpOAuthManager';
import { EventarcDiscoveryManager } from './EventarcDiscoveryManager';
import { GcpDiscoveryManager } from './GcpDiscoveryManager';
import { DocumentSyncManager } from './editor/DocumentSyncManager';
import { WebviewMessageRouter } from './editor/WebviewMessageRouter';
import { getHtmlForWebview } from './editor/WebviewHtmlProvider';
import { GeneratedFile } from '../shared/codegen/types';
import { sanitizeFolderBaseName } from '../shared/folderValidation';

export class AgentEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'agentFlow.editor';
  public static activeProviders = new Set<AgentEditorProvider>();
  public static activeBridges = new Set<WebviewBridge>();
  public static pendingOpenSettingsMenu: 'models' | 'skills' | null = null;

  public readonly context: vscode.ExtensionContext;
  public readonly codeGenEngine: GeminiCodeGenEngine;
  public readonly runnerManager: AgentRunnerManager;
  public readonly agentEngineDeployer: AgentEngineDeployer;
  public readonly cloudRunDeployer: CloudRunDeployer;
  public readonly mcpManager: McpSubprocessManager;
  public readonly mcpOAuthManager: McpOAuthManager;
  public readonly eventarcManager: EventarcDiscoveryManager;
  public readonly gcpDiscoveryManager: GcpDiscoveryManager;
  public readonly outputChannel?: vscode.OutputChannel;

  public readonly documentSyncManager: DocumentSyncManager;
  public readonly messageRouter: WebviewMessageRouter;

  // Delegated getters and methods for backward compatibility with testing suites
  public get parseErrors() {
    return (this.documentSyncManager as any).parseErrors;
  }

  public async updateTextDocument(document: vscode.TextDocument, newContent: string): Promise<boolean> {
    return this.documentSyncManager.updateTextDocument(document, newContent);
  }
  private readonly messageHandlers: Map<
    string,
    (msg: any, bridge: WebviewBridge, doc: vscode.TextDocument) => void
  > = new Map();

  constructor(context: vscode.ExtensionContext, outputChannel?: vscode.OutputChannel) {
    this.context = context;
    this.outputChannel = outputChannel;
    this.codeGenEngine = new GeminiCodeGenEngine(context.extensionPath);
    this.agentEngineDeployer = new AgentEngineDeployer();
    this.cloudRunDeployer = new CloudRunDeployer();
    this.runnerManager = new AgentRunnerManager(context.extensionPath, undefined, this.agentEngineDeployer);
    this.mcpManager = new McpSubprocessManager();
    this.mcpOAuthManager = new McpOAuthManager(context);
    this.eventarcManager = new EventarcDiscoveryManager(outputChannel);
    this.gcpDiscoveryManager = GcpDiscoveryManager.getInstance();

    // Instantiate sub-managers, passing "this" to support double-dispatch mocks in tests
    this.documentSyncManager = new DocumentSyncManager(this, outputChannel);
    this.messageRouter = new WebviewMessageRouter(
      this,
      context,
      outputChannel
    );
  }

  public static register(context: vscode.ExtensionContext, outputChannel?: vscode.OutputChannel): vscode.Disposable {
    const provider = new AgentEditorProvider(context, outputChannel);
    AgentEditorProvider.activeProviders.add(provider);
    return vscode.window.registerCustomEditorProvider(
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
  }

  public static disposeAll(): void {
    for (const provider of AgentEditorProvider.activeProviders) {
      provider.dispose();
    }
    AgentEditorProvider.activeProviders.clear();
    AgentEditorProvider.activeBridges.clear();
    AgentEditorProvider.pendingOpenSettingsMenu = null;
  }

  /**
   * Broadcasts an OPEN_PLUGIN_SETTINGS message to all active webview bridges.
   * Returns true if at least one active webview bridge received the message.
   */
  public static openPluginSettingsInActiveWebview(menu: 'models' | 'skills' = 'models'): boolean {
    if (AgentEditorProvider.activeBridges.size === 0) {
      return false;
    }
    for (const bridge of AgentEditorProvider.activeBridges) {
      bridge.postMessage({
        type: 'OPEN_PLUGIN_SETTINGS',
        payload: { menu },
      });
    }
    return true;
  }

  public static getAllActiveRunners(): Array<{ id: string; pid?: number; port?: number; status: string }> {
    const all: Array<{ id: string; pid?: number; port?: number; status: string }> = [];
    for (const provider of AgentEditorProvider.activeProviders) {
      all.push(...provider.runnerManager.getActiveRunners());
    }
    return all;
  }

  public getAgentEngineDeployer(): AgentEngineDeployer {
    return this.agentEngineDeployer;
  }

  /**
   * Returns the CloudRunDeployer instance.
   */
  public getCloudRunDeployer(): CloudRunDeployer {
    return this.cloudRunDeployer;
  }

  /**
   * Disposes this provider and terminates its runner manager and deployer processes.
   */
  public dispose(): void {
    this.runnerManager.dispose();
    this.agentEngineDeployer.dispose();
    this.cloudRunDeployer.dispose();
    this.mcpManager.dispose();
  }

  public registerMessageHandler(
    type: string,
    handler: (msg: any, bridge: WebviewBridge, doc: vscode.TextDocument) => void
  ): void {
    this.messageHandlers.set(type, handler);
  }

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

      const bridge = new WebviewBridge(webviewPanel, this.outputChannel);
      AgentEditorProvider.activeBridges.add(bridge);

      // 1. Configure webview permissions and local resource roots
      const extensionUri = this.context.extensionUri || vscode.Uri.file(this.context.extensionPath || '');
      let realExtensionPath = this.context.extensionPath || extensionUri.fsPath;
      try {
        if (fs.existsSync(realExtensionPath)) {
          realExtensionPath = fs.realpathSync(realExtensionPath);
        }
      } catch {}
      const realExtensionUri = vscode.Uri.file(realExtensionPath);
      const distUri = vscode.Uri.joinPath(realExtensionUri, 'dist', 'webview');

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

      // 3. Register message routes
      this.messageRouter.registerRoutes(bridge, document, this.messageHandlers);

      // 4. Set HTML content on webview panel
      webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview, document);

      // 5. Fire initial theme sync
      const currentTheme =
        vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Light ||
        vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.HighContrastLight
          ? 'light'
          : 'dark';

      bridge.postMessage({
        type: 'THEME_CHANGED',
        payload: { theme: currentTheme },
      });

      const uriStr = document.uri.toString();

      // 6. Synchronize external document edits from outside webview
      const docChangeSub = vscode.workspace.onDidChangeTextDocument((e: vscode.TextDocumentChangeEvent) => {
        if (e.document.uri.toString() === document.uri.toString()) {
          const currentText = document.getText();
          if (this.documentSyncManager.isWebviewGeneratedChange(uriStr, currentText)) {
            const pending = this.documentSyncManager.getPendingEditsCount(uriStr);
            if (pending > 0) {
              this.documentSyncManager.setPendingEditsCount(uriStr, pending - 1);
            }
            return;
          }

          const pending = this.documentSyncManager.getPendingEditsCount(uriStr);
          if (pending > 0) {
            this.documentSyncManager.setPendingEditsCount(uriStr, pending - 1);
            return;
          }

          if (e.contentChanges.length > 0 && e.reason === undefined) {
            if (this.documentSyncManager.checkAndHandleParseError(document, bridge)) {
              return;
            }

            try {
              const externalDoc = JSON.parse(document.getText()) as AgentWorkflowDocument;
              let docVersion = this.documentSyncManager.getDocumentVersion(uriStr);
              docVersion++;
              this.documentSyncManager.setDocumentVersion(uriStr, docVersion);
              const relativeFilePath = vscode.workspace.asRelativePath(document.uri);
              bridge.postMessage({
                type: 'LOAD_DOCUMENT',
                payload: {
                  document: externalDoc,
                  docVersion: docVersion,
                  filePath: relativeFilePath,
                },
              });
            } catch {}
          }
        }
      });

      const docSaveSub = typeof vscode.workspace.onDidSaveTextDocument === 'function'
        ? vscode.workspace.onDidSaveTextDocument((savedDoc) => {
            if (savedDoc.uri.toString() === document.uri.toString()) {
              const docVersion = this.documentSyncManager.getDocumentVersion(uriStr);
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
                  parsedDoc = this.documentSyncManager.createEmptyWorkflow(document.uri);
                }
                const docVersion = this.documentSyncManager.getDocumentVersion(uriStr);
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

      const stopRunnerForClosedDocument = async (reason: string) => {
        this.outputChannel?.appendLine(
          `[AgentEditorProvider] ${reason} (${document.uri.fsPath}); stopping active local runner.`
        );
        try {
          await this.runnerManager.stopLocalRunner(undefined, undefined, bridge);
        } catch {}
        this.runnerManager.cancelAll();
        this.runnerManager.resetChatSession();
        this.runnerManager.clearRunnerLogs();
      };

      const docCloseSub = typeof vscode.workspace.onDidCloseTextDocument === 'function'
        ? vscode.workspace.onDidCloseTextDocument(async (closedDoc) => {
            if (closedDoc.uri.toString() === document.uri.toString()) {
              await stopRunnerForClosedDocument('Document closed');
            }
          })
        : { dispose: () => {} };

      const tabCloseSub =
        typeof (vscode.window as any).tabGroups?.onDidChangeTabs === 'function'
          ? (vscode.window as any).tabGroups.onDidChangeTabs(async (e: any) => {
              const closedTabs = Array.isArray(e?.closed) ? e.closed : [];
              for (const tab of closedTabs) {
                const tabUri = tab?.input?.uri?.toString?.();
                if (tabUri && tabUri === document.uri.toString()) {
                  await stopRunnerForClosedDocument('Editor tab closed');
                  break;
                }
              }
            })
          : { dispose: () => {} };

      webviewPanel.onDidDispose(async () => {
        AgentEditorProvider.activeBridges.delete(bridge);
        await stopRunnerForClosedDocument('Webview panel disposed');
        themeChangeSub.dispose();
        docChangeSub.dispose();
        docSaveSub.dispose();
        fileRenameSub.dispose();
        docCloseSub.dispose();
        tabCloseSub.dispose();
        bridge.dispose();
      });
    } catch (err: any) {
      console.error('[AgentEditorProvider] Exception in resolveCustomTextEditor:', err);
      vscode.window.showErrorMessage(`Agent Flow Error: ${err?.message || err}`);
    }
  }

  // --- Delegation methods forwarding to DocumentSyncManager ---

  public resolveTargetDirectory(document: vscode.TextDocument, configuredFolder?: string): string {
    return this.documentSyncManager.resolveTargetDirectory(document, configuredFolder);
  }

  public loadGeneratedFilesFromDisk(targetDir: string): GeneratedFile[] {
    return this.documentSyncManager.loadGeneratedFilesFromDisk(targetDir);
  }

  public async cleanTargetDirectory(
    targetDirPath: string,
    document?: vscode.TextDocument
  ): Promise<{ cleaned: string[]; preserved: string[]; errors: string[] }> {
    return this.documentSyncManager.cleanTargetDirectory(targetDirPath, document);
  }

  public createDefaultWorkflow(uri: vscode.Uri): AgentWorkflowDocument {
    const baseName = path.basename(uri.fsPath, '.agent') || 'default_workflow';
    return AgentEditorProvider.createDefaultWorkflowDocument(baseName);
  }

  public createEmptyWorkflow(uri: vscode.Uri): AgentWorkflowDocument {
    const baseName = path.basename(uri.fsPath, '.agent') || 'empty_workflow';
    return AgentEditorProvider.createEmptyWorkflowDocument(baseName);
  }

  public getHtmlForWebview(webview: vscode.Webview, document?: vscode.TextDocument): string {
    return getHtmlForWebview(webview, this.context, this.outputChannel, document);
  }

  /**
   * Helper parsing Python source files for standard function definitions,
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
    const targetToolsDir = path.join(targetDirPath, 'tools');

    const tools: any[] = [];
    const rawDoc = agentDoc as any;
    if (rawDoc.tools) tools.push(...rawDoc.tools);
    if (rawDoc.agents) {
      for (const ag of rawDoc.agents) {
        if (ag.tools) tools.push(...ag.tools);
      }
    }

    // Also inspect nodes for tools array in React Flow format
    if (Array.isArray(agentDoc.nodes)) {
      for (const node of agentDoc.nodes) {
        if (node.data?.tools && Array.isArray(node.data.tools)) {
          tools.push(...node.data.tools);
        }
      }
    }

    const requiredFunctionsBySource = new Map<string, Set<string>>();
    const uniqueSources = new Set<string>();
    for (const t of tools) {
      if (t && t.sourceFile) {
        uniqueSources.add(t.sourceFile);
        const fnName = t.functionName || t.name;
        if (fnName) {
          if (!requiredFunctionsBySource.has(t.sourceFile)) {
            requiredFunctionsBySource.set(t.sourceFile, new Set());
          }
          requiredFunctionsBySource.get(t.sourceFile)!.add(fnName);
        }
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

      const canonicalSampleDir = this.resolveCanonicalSampleDir(agentDoc, document);

      for (const relSource of uniqueSources) {
        let sourcePath: string | undefined;

        // 1. Always prefer the canonical bundled sample tool file from resource/samples/*
        if (canonicalSampleDir) {
          const canonicalCandidate = path.resolve(canonicalSampleDir, relSource);
          if (fs.existsSync(canonicalCandidate)) {
            sourcePath = canonicalCandidate;
          }
        }

        // 2. If not matched by canonical sample name, locate a bundled sample in resource/samples/*
        //    that defines the required tool function(s) for this sourceFile.
        if (!sourcePath || !fs.existsSync(sourcePath)) {
          const samples = this.discoverResourceSamples();
          const requiredFns = Array.from(requiredFunctionsBySource.get(relSource) || []);
          let fallbackCandidate: string | undefined;

          for (const s of samples) {
            if (!s.sourceFilePath) continue;
            const candidate = path.resolve(path.dirname(s.sourceFilePath), relSource);
            if (!fs.existsSync(candidate)) continue;

            if (!fallbackCandidate) {
              fallbackCandidate = candidate;
            }

            if (requiredFns.length > 0) {
              try {
                const candidateContent = fs.readFileSync(candidate, 'utf-8');
                const definesAllRequired = requiredFns.every((fn) =>
                  new RegExp(`\\bdef\\s+${fn}\\b`).test(candidateContent)
                );
                if (definesAllRequired) {
                  sourcePath = candidate;
                  break;
                }
              } catch {
                // Ignore read error
              }
            }
          }

          if ((!sourcePath || !fs.existsSync(sourcePath)) && fallbackCandidate) {
            sourcePath = fallbackCandidate;
          }
        }

        // 3. For non-sample custom tools, only resolve inside the generated target directory (or explicit absolute path).
        //    Never look outside the generated target folder in path.dirname(document.uri.fsPath).
        if (!sourcePath || !fs.existsSync(sourcePath)) {
          sourcePath = path.isAbsolute(relSource)
            ? relSource
            : path.resolve(targetDirPath, relSource);
        }

        if (sourcePath && fs.existsSync(sourcePath)) {
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
   * Resolves the canonical bundled sample directory if `workflowDoc` or `sourceDocument`
   * matches a sample in `resource/samples/`. Prevents shared workspace parent folders
   * (where multiple `.agent` files are saved side-by-side) from cross-contaminating
   * companion `tools/`, `data/`, `skills/`, or `callbacks/` directories across samples.
   */
  public resolveCanonicalSampleDir(
    workflowDoc: AgentWorkflowDocument | undefined,
    sourceDocument: vscode.TextDocument | undefined
  ): string | undefined {
    const samples = this.discoverResourceSamples();
    const docBaseName = sourceDocument?.uri?.fsPath
      ? path.basename(sourceDocument.uri.fsPath, '.agent').toLowerCase().replace(/[^a-z0-9]/g, '')
      : '';
    const normName = (workflowDoc?.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const rawOutputFolder =
      (workflowDoc as any)?.deployment?.outputFolder ||
      (workflowDoc as any)?.deploymentConfig?.outputFolder ||
      workflowDoc?.metadata?.outputFolder ||
      '';
    const normOutputFolder = path
      .basename(String(rawOutputFolder).replace(/\/+$/, ''))
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');

    for (const s of samples) {
      if (!s.sourceFilePath) continue;
      const sNormId = s.id.toLowerCase().replace(/[^a-z0-9]/g, '');
      const sNormName = s.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const sFileBase = path
        .basename(s.sourceFilePath, '.agent')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
      if (
        (normName && (sNormId === normName || sNormName === normName || sFileBase === normName)) ||
        (docBaseName && (sNormId === docBaseName || sNormName === docBaseName || sFileBase === docBaseName)) ||
        (normOutputFolder &&
          (sNormId === normOutputFolder || sNormName === normOutputFolder || sFileBase === normOutputFolder))
      ) {
        return path.dirname(s.sourceFilePath);
      }
    }
    return undefined;
  }

  /**
   * Recursively copies sample dataset files (under `data/`) and any optional
   * companion directories (such as `skills/`, `callbacks/`) from the workflow's
   * source location into the output target directory.
   *
   * Architectural Decisions:
   * - Prefers canonical bundled sample directory when workflow matches a discovered sample so
   *   saving multiple `.agent` files in one folder never cross-contaminates `data/`.
   * - Traverses target-scoped directories (e.g. data/bigquery/, data/alloydb/, data/spanner/) recursively.
   * - Preserves directory structure while skipping Python compilation artifacts (__pycache__, .pyc, .pyo).
   */
  public async copySampleDataFiles(
    workflowDoc: AgentWorkflowDocument | undefined,
    sourceDocument: vscode.TextDocument | undefined,
    targetDirPath: string
  ): Promise<string[]> {
    // Section 1: Resolve candidate source data directory (preferring canonical bundled sample first)
    const copiedFiles: string[] = [];
    let candidateDataDir: string | undefined;

    const canonicalSampleDir = this.resolveCanonicalSampleDir(workflowDoc, sourceDocument);
    if (canonicalSampleDir) {
      const canonicalData = path.join(canonicalSampleDir, 'data');
      if (fs.existsSync(canonicalData) && fs.statSync(canonicalData).isDirectory()) {
        candidateDataDir = canonicalData;
      }
    } else if (sourceDocument?.uri?.fsPath) {
      const siblingData = path.join(path.dirname(sourceDocument.uri.fsPath), 'data');
      if (fs.existsSync(siblingData) && fs.statSync(siblingData).isDirectory()) {
        candidateDataDir = siblingData;
      }
    }

    // NOTE: If no data directory exists, return early with empty copied files array
    if (!candidateDataDir || !fs.existsSync(candidateDataDir)) {
      return [];
    }

    // Section 2: Recursive copy preserving nested subfolders and skipping cache artifacts
    if (candidateDataDir && fs.existsSync(candidateDataDir)) {
      const targetDataDir = path.join(targetDirPath, 'data');

      const copyDirRecursive = (srcDir: string, destDir: string, relPrefix: string) => {
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }

        const entries = fs.readdirSync(srcDir, { withFileTypes: true });
        for (const entry of entries) {
          // Skip Python bytecode cache directories and compiled files
          if (entry.name === '__pycache__' || entry.name.endsWith('.pyc') || entry.name.endsWith('.pyo')) {
            continue;
          }

          const srcPath = path.join(srcDir, entry.name);
          const destPath = path.join(destDir, entry.name);
          const relPath = path.join(relPrefix, entry.name);

          if (entry.isDirectory()) {
            copyDirRecursive(srcPath, destPath, relPath);
          } else if (entry.isFile()) {
            fs.copyFileSync(srcPath, destPath);
            copiedFiles.push(relPath);
          }
        }
      };

      copyDirRecursive(candidateDataDir, targetDataDir, 'data');
    }

    // Section 3: Also sync companion skills and callbacks folders and inline skills
    const skillsFiles = await this.copySampleSkillsFiles(workflowDoc, sourceDocument, targetDirPath);
    const callbacksFiles = await this.copySampleCallbacksFiles(workflowDoc, sourceDocument, targetDirPath);
    copiedFiles.push(...skillsFiles, ...callbacksFiles);

    return copiedFiles;
  }

  /**
   * Recursively copies sample skills files (under `skills/`) from the workflow's
   * source location into the output target directory, and synthesizes SKILL.md for inline skills.
   *
   * Architectural Decisions:
   * - Preserves directory structure while skipping Python compilation artifacts (__pycache__, .pyc, .pyo).
   * - Generates inline `skills/<skill.name>/SKILL.md` when workflow nodes have inline skills.
   *
   * @param workflowDoc Parsed workflow document
   * @param sourceDocument Active editor text document
   * @param targetDirPath Target directory path for file output
   * @returns Array of relative file paths copied or created
   */
  public async copySampleSkillsFiles(
    workflowDoc: AgentWorkflowDocument | undefined,
    sourceDocument: vscode.TextDocument | undefined,
    targetDirPath: string
  ): Promise<string[]> {
    const copiedFiles: string[] = [];
    let candidateSkillsDir: string | undefined;

    const canonicalSampleDir = this.resolveCanonicalSampleDir(workflowDoc, sourceDocument);
    if (canonicalSampleDir) {
      const canonicalSkills = path.join(canonicalSampleDir, 'skills');
      if (fs.existsSync(canonicalSkills) && fs.statSync(canonicalSkills).isDirectory()) {
        candidateSkillsDir = canonicalSkills;
      }
    } else if (sourceDocument?.uri?.fsPath) {
      const siblingSkills = path.join(path.dirname(sourceDocument.uri.fsPath), 'skills');
      if (fs.existsSync(siblingSkills) && fs.statSync(siblingSkills).isDirectory()) {
        candidateSkillsDir = siblingSkills;
      }
    }

    const targetSkillsDir = path.join(targetDirPath, 'skills');

    // Section 1: Copy existing skills folder if present
    if (candidateSkillsDir && fs.existsSync(candidateSkillsDir)) {
      const copyDirRecursive = (srcDir: string, destDir: string, relPrefix: string) => {
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }

        const entries = fs.readdirSync(srcDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name === '__pycache__' || entry.name.endsWith('.pyc') || entry.name.endsWith('.pyo')) {
            continue;
          }

          const srcPath = path.join(srcDir, entry.name);
          const destPath = path.join(destDir, entry.name);
          const relPath = path.join(relPrefix, entry.name);

          if (entry.isDirectory()) {
            copyDirRecursive(srcPath, destPath, relPath);
          } else if (entry.isFile()) {
            fs.copyFileSync(srcPath, destPath);
            copiedFiles.push(relPath);
          }
        }
      };

      copyDirRecursive(candidateSkillsDir, targetSkillsDir, 'skills');
    }

    // Section 2: Synthesize inline skills into skills/<skill.name>/SKILL.md
    if (workflowDoc && Array.isArray(workflowDoc.nodes)) {
      for (const node of workflowDoc.nodes) {
        const nodeData = (node.data || {}) as any;
        const skills: any[] = nodeData.skills || [];
        for (const skill of skills) {
          if (skill && skill.sourceType === 'inline' && skill.name) {
            const skillDir = path.join(targetSkillsDir, skill.name);
            const skillMdPath = path.join(skillDir, 'SKILL.md');
            if (!fs.existsSync(skillDir)) {
              fs.mkdirSync(skillDir, { recursive: true });
            }
            if (!fs.existsSync(skillMdPath)) {
              const name = skill.name.trim();
              const desc = (skill.description || '').trim();
              const instructions = (skill.instructionsMarkdown || '').trim();
              const skillMdContent = `---
name: ${name}
description: ${desc}
---

${instructions}`.trim();
              fs.writeFileSync(skillMdPath, skillMdContent, 'utf-8');
              copiedFiles.push(path.join('skills', skill.name, 'SKILL.md'));
            }
          }
        }
      }
    }

    return copiedFiles;
  }

  /**
   * Recursively copies sample callbacks files (under `callbacks/`) from the workflow's
   * source location into the output target directory.
   *
   * Architectural Decisions:
   * - Preserves directory structure while skipping Python compilation artifacts (__pycache__, .pyc, .pyo).
   *
   * @param workflowDoc Parsed workflow document
   * @param sourceDocument Active editor text document
   * @param targetDirPath Target directory path for file output
   * @returns Array of relative file paths copied
   */
  public async copySampleCallbacksFiles(
    workflowDoc: AgentWorkflowDocument | undefined,
    sourceDocument: vscode.TextDocument | undefined,
    targetDirPath: string
  ): Promise<string[]> {
    const copiedFiles: string[] = [];
    let candidateCallbacksDir: string | undefined;

    const canonicalSampleDir = this.resolveCanonicalSampleDir(workflowDoc, sourceDocument);
    if (canonicalSampleDir) {
      const canonicalCallbacks = path.join(canonicalSampleDir, 'callbacks');
      if (fs.existsSync(canonicalCallbacks) && fs.statSync(canonicalCallbacks).isDirectory()) {
        candidateCallbacksDir = canonicalCallbacks;
      }
    } else if (sourceDocument?.uri?.fsPath) {
      const siblingCallbacks = path.join(path.dirname(sourceDocument.uri.fsPath), 'callbacks');
      if (fs.existsSync(siblingCallbacks) && fs.statSync(siblingCallbacks).isDirectory()) {
        candidateCallbacksDir = siblingCallbacks;
      }
    }

    if (!candidateCallbacksDir || !fs.existsSync(candidateCallbacksDir)) {
      return [];
    }

    const targetCallbacksDir = path.join(targetDirPath, 'callbacks');

    const copyDirRecursive = (srcDir: string, destDir: string, relPrefix: string) => {
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      const entries = fs.readdirSync(srcDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === '__pycache__' || entry.name.endsWith('.pyc') || entry.name.endsWith('.pyo')) {
          continue;
        }

        const srcPath = path.join(srcDir, entry.name);
        const destPath = path.join(destDir, entry.name);
        const relPath = path.join(relPrefix, entry.name);

        if (entry.isDirectory()) {
          copyDirRecursive(srcPath, destPath, relPath);
        } else if (entry.isFile()) {
          fs.copyFileSync(srcPath, destPath);
          copiedFiles.push(relPath);
        }
      }
    };

    copyDirRecursive(candidateCallbacksDir, targetCallbacksDir, 'callbacks');
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
   * - Recursively discovers .agent files in nested category sub-directories
   *   (e.g. resource/samples/retail/<sample>/<sample>.agent, resource/samples/dataanalytics/<sample>/<sample>.agent).
   *
   * @returns Array of loaded SampleWorkflowDefinition objects
   */
  public discoverResourceSamples(): SampleWorkflowDefinition[] {
    // Section 1: Candidate search directories
    const candidateDirs: string[] = [];
    if (this.context?.extensionPath) {
      candidateDirs.push(path.join(this.context.extensionPath, 'resource', 'samples'));
    }
    if (vscode.workspace.workspaceFolders) {
      for (const wf of vscode.workspace.workspaceFolders) {
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

        // Determine category and unique sample ID from directory structure
        const parentDirName = path.basename(path.dirname(filePath));
        const baseFileName = path.basename(filePath, '.agent');
        let subfolderCategory: string | undefined;
        let rawSampleId = parentDirName !== 'samples' ? parentDirName : baseFileName;

        for (const baseDir of candidateDirs) {
          if (filePath.startsWith(baseDir)) {
            const rel = path.relative(baseDir, filePath);
            const segments = rel.split(path.sep);
            // e.g. ["retail", "travel-concierge", "travel-concierge.agent"] (segments.length >= 3)
            if (segments.length >= 3) {
              const rawCat = segments[0];
              subfolderCategory = this.formatSampleCategory(rawCat);
              rawSampleId = segments[segments.length - 2] || baseFileName;
            } else if (segments.length === 2 && this.isKnownCategoryFolder(segments[0])) {
              // e.g. ["retail", "travel-concierge.agent"] directly inside category folder
              subfolderCategory = this.formatSampleCategory(segments[0]);
              rawSampleId = baseFileName;
            }
            break;
          }
        }

        // NOTE: Normalize hyphens to underscores so folder names like travel-concierge match catalog IDs
        const sampleId = rawSampleId.replace(/-/g, '_');

        if (seenIds.has(sampleId)) continue;
        seenIds.add(sampleId);

        // Attempt to read README.md in the sample directory for the Information dialog
        let readmeContent: string | undefined = parsed.readmeContent;
        const readmePath = path.join(path.dirname(filePath), 'README.md');
        if (!readmeContent && fs.existsSync(readmePath)) {
          try {
            readmeContent = fs.readFileSync(readmePath, 'utf-8');
          } catch {
            // NOTE: Ignore read errors and fall back to sample description
          }
        }

        // Count tools across all nodes
        let toolsCount = 0;
        let triggerType = 'chat';
        const testPrompts: any[] = [];

        for (const n of parsed.nodes) {
          if (n.type === 'trigger' || n.type === 'triggerNode') {
            const tKind = n.data?.triggerKind || n.data?.triggerType;
            if (tKind && tKind !== 'tester' && tKind !== 'test') {
              triggerType = tKind;
            }
            const scenariosToAdd = n.data?.config?.testScenarios || n.data?.config?.testPrompts;
            if (Array.isArray(scenariosToAdd)) {
              for (const s of scenariosToAdd) {
                if (s?.id && !testPrompts.some((tp) => tp.id === s.id)) {
                  testPrompts.push(s);
                }
              }
            }
          }
          if (n.data?.tools && Array.isArray(n.data.tools)) {
            toolsCount += n.data.tools.length;
          }
        }

        // Subfolder category takes precedence so physical directory organization under resource/samples/<category>/
        // directly drives the category groups displayed in the Samples panel.
        const explicitCategory = parsed.metadata?.category;
        const resolvedCategory = subfolderCategory
          ? subfolderCategory
          : explicitCategory && explicitCategory !== 'Ready-to-Use Workflows'
            ? (explicitCategory.toLowerCase().includes('retail') ? 'Retail' : explicitCategory)
            : 'Retail';

        const sampleDef: SampleWorkflowDefinition = {
          id: sampleId,
          name: parsed.name || baseFileName,
          filename: path.basename(filePath),
          category: resolvedCategory,
          badge: parsed.metadata?.badge || (parsed.framework === 'langgraph' ? 'LangGraph' : 'Google ADK'),
          description: parsed.description || 'Enterprise agent workflow blueprint.',
          features: parsed.metadata?.features || ['Multi-Agent', 'Grounding', 'Automated Tests'],
          nodesCount: parsed.nodes.length,
          toolsCount: toolsCount,
          triggerType: triggerType,
          iconName: parsed.metadata?.iconName || 'Workflow',
          color: parsed.metadata?.color || 'purple',
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
          readmeContent: readmeContent,
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
   * @param dirPath Directory to scan
   * @returns Array of absolute file paths to .agent documents
   */
  public scanDirectoryForAgentFiles(dirPath: string): string[] {
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

  /**
   * Checks whether a directory segment corresponds to a known sample category folder.
   *
   * @param raw Raw folder name
   * @returns True if the folder is a known category container
   */
  private isKnownCategoryFolder(raw: string): boolean {
    const normalized = raw.trim().toLowerCase();
    return Boolean(this.getKnownCategoriesMap()[normalized]);
  }

  /**
   * Returns the canonical mapping of lowercase category folder slugs to display group labels.
   */
  private getKnownCategoriesMap(): Record<string, string> {
    return {
      retail: 'Retail',
      sdlc: 'SDLC',
      devtools: 'Developer Tools',
      'developer-tools': 'Developer Tools',
      developer_tools: 'Developer Tools',
      finance: 'Finance',
      research: 'Research',
      operations: 'Operations',
      creative: 'Creative',
      data: 'Data',
      dataanalytics: 'Data Analytics',
      'data-analytics': 'Data Analytics',
      data_analytics: 'Data Analytics',
      patterns: 'Patterns',
      healthcare: 'Healthcare',
    };
  }

  /**
   * Normalizes a directory name or raw category string to standard title-case category.
   *
   * @param raw Raw category name or subfolder name
   * @returns Formatted category display name
   */
  public formatSampleCategory(raw: string): string {
    const normalized = raw.trim().toLowerCase();
    const knownCategories = this.getKnownCategoriesMap();
    if (knownCategories[normalized]) {
      return knownCategories[normalized];
    }
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }

  // --- Static Workflow Template Constructors ---

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
              model: 'gemini-3.8-flash',
              systemInstruction:
                'You are a helpful, expert AI engineering assistant. Provide direct, grounded, and concise answers.',
              temperature: 0.7,
              topP: 0.95,
              maxOutputTokens: 2048,
              tools: [],
              memory: 'in_memory',
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
}
