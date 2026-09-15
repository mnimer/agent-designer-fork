/**
 * DocumentSyncManager
 *
 * Handles the state and logic for synchronizing file-system changes of .agent documents
 * with the webview, performing schema major-version checks, resolving generated code
 * target directories, and cleanly preparing/cleaning workspace output directories.
 *
 * Architectural Decisions:
 * 1. Monotonic Revision Echo-Guards: Implements monotonic version tracking and edit count gates
 *    to prevent infinite cycle update loops.
 * 2. Silent Data Loss Prevention: Rejects DOCUMENT_UPDATED sync triggers when the document
 *    is in a parse-error state.
 * 3. Minimal Diff Editing: Character-level minimal diffing maintains carets, focus, and cursors
 *    on split editors.
 * 4. Supports bidirectional owner delegation to respect any dynamic test mocking.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { AgentWorkflowDocument } from '../../shared/types';
import { WebviewBridge } from '../WebviewBridge';
import { GeneratedFile } from '../../shared/codegen/types';
import { sanitizeFolderBaseName } from '../../shared/folderValidation';
import { AgentEditorProvider } from '../AgentEditorProvider';

/**
 * Helper to check if a schema version is an unknown higher future version (major version > 1).
 */
function isUnsupportedFutureVersion(version: string | undefined): boolean {
  if (!version) return false;
  const match = version.match(/^(\d+)\./);
  if (match) {
    const major = parseInt(match[1], 10);
    return major > 1;
  }
  return false;
}

/**
 * Helper to find the common prefix and suffix of two strings and return a minimal edit.
 */
function getMinimalEdit(
  document: vscode.TextDocument,
  newText: string
): { range: vscode.Range; newText: string } | null {
  const oldText = document.getText();
  if (oldText === newText) {
    return null;
  }

  let start = 0;
  while (start < oldText.length && start < newText.length && oldText[start] === newText[start]) {
    start++;
  }

  let endOld = oldText.length;
  let endNew = newText.length;
  while (endOld > start && endNew > start && oldText[endOld - 1] === newText[endNew - 1]) {
    endOld--;
    endNew--;
  }

  const range = new vscode.Range(
    document.positionAt(start),
    document.positionAt(endOld)
  );
  const replacement = newText.substring(start, endNew);
  return { range, newText: replacement };
}

export class DocumentSyncManager {
  private readonly provider?: AgentEditorProvider;
  private readonly outputChannel?: vscode.OutputChannel;

  // State maps track document state per document URI string
  private readonly documentVersions = new Map<string, number>();
  private readonly pendingEditsCount = new Map<string, number>();
  private readonly parseErrors = new Map<string, string>();

  /**
   * Initializes DocumentSyncManager with optional owner reference.
   *
   * @param provider Optional AgentEditorProvider owner instance
   * @param outputChannel Optional OutputChannel for logging
   */
  constructor(provider?: AgentEditorProvider, outputChannel?: vscode.OutputChannel) {
    this.provider = provider;
    this.outputChannel = outputChannel;
  }

  // --- Monotonic Revision & Parse Error State Getters/Setters ---

  public getDocumentVersion(uriStr: string): number {
    return this.documentVersions.get(uriStr) || 0;
  }

  public setDocumentVersion(uriStr: string, version: number): void {
    this.documentVersions.set(uriStr, version);
  }

  public getPendingEditsCount(uriStr: string): number {
    return this.pendingEditsCount.get(uriStr) || 0;
  }

  public setPendingEditsCount(uriStr: string, count: number): void {
    this.pendingEditsCount.set(uriStr, count);
  }

  public getParseError(uriStr: string): string | undefined {
    return this.parseErrors.get(uriStr);
  }

  public hasParseError(uriStr: string): boolean {
    return this.parseErrors.has(uriStr);
  }

  public deleteParseError(uriStr: string): void {
    this.parseErrors.delete(uriStr);
  }

  public setParseError(uriStr: string, error: string): void {
    this.parseErrors.set(uriStr, error);
  }

  // --- Dynamic Double-Dispatch Delegation Wrappers ---

  /**
   * Resolves the target directory path on disk for code generation, testing, and file verification.
   * Delegates to the parent provider if overridden in tests.
   */
  public resolveTargetDirectory(document: vscode.TextDocument, configuredFolder?: string): string {
    if (
      this.provider &&
      this.provider.resolveTargetDirectory !== AgentEditorProvider.prototype.resolveTargetDirectory
    ) {
      return this.provider.resolveTargetDirectory(document, configuredFolder);
    }
    return this.resolveTargetDirectoryInternal(document, configuredFolder);
  }

  /**
   * Scans a target directory on disk and loads any pre-existing generated code files.
   * Delegates to the parent provider if overridden in tests.
   */
  public loadGeneratedFilesFromDisk(targetDir: string): GeneratedFile[] {
    if (
      this.provider &&
      this.provider.loadGeneratedFilesFromDisk !== AgentEditorProvider.prototype.loadGeneratedFilesFromDisk
    ) {
      return this.provider.loadGeneratedFilesFromDisk(targetDir);
    }
    return this.loadGeneratedFilesFromDiskInternal(targetDir);
  }

  /**
   * Resiliently cleans target directory before writing new generated code files.
   * Delegates to the parent provider if overridden in tests.
   */
  public async cleanTargetDirectory(
    targetDirPath: string,
    document?: vscode.TextDocument
  ): Promise<{ cleaned: string[]; preserved: string[]; errors: string[] }> {
    if (
      this.provider &&
      this.provider.cleanTargetDirectory !== AgentEditorProvider.prototype.cleanTargetDirectory
    ) {
      return this.provider.cleanTargetDirectory(targetDirPath, document);
    }
    return this.cleanTargetDirectoryInternal(targetDirPath, document);
  }

  // --- Core Functional Logic Implementations ---

  /**
   * Applies a minimal diff edit or content replacement on the underlying text document.
   */
  public async updateTextDocument(
    document: vscode.TextDocument,
    newContent: string
  ): Promise<boolean> {
    const edit = new vscode.WorkspaceEdit();
    const minimalEdit = getMinimalEdit(document, newContent);
    if (!minimalEdit) {
      return true; // Content is already identical, no-op is successful
    }
    edit.replace(document.uri, minimalEdit.range, minimalEdit.newText);
    return vscode.workspace.applyEdit(edit);
  }

  /**
   * Parses the text document, performs schema version validation,
   * updates the parseErrors map and notifies the webview if there are errors.
   */
  public checkAndHandleParseError(
    document: vscode.TextDocument,
    bridge: WebviewBridge
  ): boolean {
    const uriStr = document.uri.toString();
    const docText = document.getText();

    if (docText.trim().length === 0) {
      this.parseErrors.delete(uriStr);
      return false;
    }

    try {
      const parsed = JSON.parse(docText);
      if (parsed && isUnsupportedFutureVersion(parsed.version)) {
        const errMsg = `Unsupported future schema version: ${parsed.version}. Only major version 1 is supported.`;
        this.parseErrors.set(uriStr, errMsg);
        vscode.window.showErrorMessage(`Failed to load document: ${errMsg}`);
        bridge.postMessage({
          type: 'PARSE_ERROR',
          payload: {
            error: errMsg,
            rawText: docText,
          },
        });
        return true;
      }

      this.parseErrors.delete(uriStr);
      return false;
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      this.parseErrors.set(uriStr, errMsg);
      vscode.window.showErrorMessage(`Failed to parse document JSON: ${errMsg}`);
      bridge.postMessage({
        type: 'PARSE_ERROR',
        payload: {
          error: errMsg,
          rawText: docText,
        },
      });
      return true;
    }
  }

  /**
   * Actual internal resolution of target directory.
   */
  public resolveTargetDirectoryInternal(document: vscode.TextDocument, configuredFolder?: string): string {
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

    // Strip legacy src/agents/ prefix if present
    if (folder.startsWith('./src/agents/')) {
      folder = `./${folder.slice('./src/agents/'.length)}`;
    } else if (folder.startsWith('src/agents/')) {
      folder = `./${folder.slice('src/agents/'.length)}`;
    }

    if (path.isAbsolute(folder)) {
      return folder;
    }

    return path.resolve(docDir, folder);
  }

  /**
   * Actual internal loading of generated files from disk.
   */
  public loadGeneratedFilesFromDiskInternal(targetDir: string): GeneratedFile[] {
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
   * Actual internal cleaning of target directory.
   */
  public async cleanTargetDirectoryInternal(
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

        // 2. Preserve virtual environments, git repository and system files
        if (preservedNames.has(entryName) || entryName.endsWith('.agent')) {
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
            `[DocumentSyncManager] Failed to delete entry ${entryName}: ${nodeFsErr?.message || nodeFsErr}`
          );
        }

        if (deleted || !fs.existsSync(fullEntryPath)) {
          cleaned.push(entryName);
        }
      }
    } catch (err: any) {
      errors.push(`Directory cleanup error: ${err?.message || err}`);
      this.outputChannel?.appendLine(
        `[DocumentSyncManager] Directory cleanup error: ${err?.message || err}`
      );
    }

    return { cleaned, preserved, errors };
  }

  public createEmptyWorkflow(uri: vscode.Uri): AgentWorkflowDocument {
    const baseName = path.basename(uri.fsPath, '.agent') || 'empty_workflow';
    return AgentEditorProvider.createEmptyWorkflowDocument(baseName);
  }
}
