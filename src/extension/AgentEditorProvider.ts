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

      webviewPanel.onDidDispose(async () => {
        await this.runnerManager.stopLocalRunner(undefined, undefined, bridge);
        this.runnerManager.cancelAll();
        themeChangeSub.dispose();
        docChangeSub.dispose();
        docSaveSub.dispose();
        fileRenameSub.dispose();
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
    const baseDir = path.dirname(document.uri.fsPath);
    const targetToolsDir = path.join(targetDirPath, 'tools');

    const tools: any[] = [];
    if (agentDoc.tools) tools.push(...agentDoc.tools);
    if (agentDoc.agents) {
      for (const ag of agentDoc.agents) {
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
   * - Recursively discovers .agent files in nested sub-directories.
   *
   * @author Mike Nimer <mikenimer@google.com>
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

        // Determine unique ID and display metadata
        const parentDirName = path.basename(path.dirname(filePath));
        const baseFileName = path.basename(filePath, '.agent');
        const rawSampleId = (parentDirName !== 'samples')
          ? parentDirName
          : baseFileName;
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

        // Determine category from directory structure or metadata
        let subfolderCategory: string | undefined;
        for (const baseDir of candidateDirs) {
          if (filePath.startsWith(baseDir)) {
            const rel = path.relative(baseDir, filePath);
            const segments = rel.split(path.sep);
            // e.g. ["retail", "travel-concierge", "travel-concierge.agent"] (segments.length >= 3)
            if (segments.length >= 3) {
              const rawCat = segments[0];
              subfolderCategory = this.formatSampleCategory(rawCat);
            }
            break;
          }
        }

        const explicitCategory = parsed.metadata?.category;
        const resolvedCategory = 
          explicitCategory && explicitCategory !== 'Ready-to-Use Workflows'
            ? (explicitCategory.toLowerCase().includes('retail') ? 'Retail' : explicitCategory)
            : (subfolderCategory || 'Retail');

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
   * @author Mike Nimer <mikenimer@google.com>
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
   * Normalizes a directory name or raw category string to standard title-case category.
   *
   * @author Mike Nimer <mikenimer@google.com>
   * @param raw Raw category name or subfolder name
   * @returns Formatted category display name
   */
  public formatSampleCategory(raw: string): string {
    const normalized = raw.trim().toLowerCase();
    const knownCategories: Record<string, string> = {
      retail: 'Retail',
      sdlc: 'SDLC',
      finance: 'Finance',
      research: 'Research',
      operations: 'Operations',
      creative: 'Creative',
      data: 'Data',
      patterns: 'Patterns',
      healthcare: 'Healthcare',
    };
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
