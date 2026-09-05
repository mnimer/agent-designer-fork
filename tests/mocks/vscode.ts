/**
 * VS Code Mock Implementations for Node.js Test Runner
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

export function createSpy(implementation?: Function) {
  const fn: any = function (...args: any[]) {
    if (!Array.isArray(fn.calls)) {
      fn.calls = [];
    }
    fn.calls.push(args);
    if (implementation) {
      return implementation(...args);
    }
    return undefined;
  };
  fn.calls = [];
  fn.mockResolvedValue = function (val: any) {
    return createSpy(async () => val);
  };
  fn.mockReturnValue = function (val: any) {
    return createSpy(() => val);
  };
  return fn;
}

export function resetAllMocks() {
  window.onDidChangeActiveColorTheme.calls = [];
  window.registerCustomEditorProvider.calls = [];
  window.registerTreeDataProvider.calls = [];
  window.createOutputChannel.calls = [];
  window.showInformationMessage.calls = [];
  window.showWarningMessage.calls = [];
  window.showErrorMessage.calls = [];
  window.showInputBox.calls = [];
  workspace.applyEdit.calls = [];
  workspace.asRelativePath.calls = [];
  workspace.openTextDocument.calls = [];
  workspace.onDidChangeTextDocument.calls = [];
  workspace.getConfiguration.calls = [];
  workspace.findFiles.calls = [];
  workspace.createFileSystemWatcher.calls = [];
  workspace.fs.stat.calls = [];
  workspace.fs.createDirectory.calls = [];
  workspace.fs.writeFile.calls = [];
  workspace.fs.readFile.calls = [];
  workspace.fs.readDirectory.calls = [];
  workspace.fs.delete.calls = [];
  commands.registerCommand.calls = [];
  commands.executeCommand.calls = [];
}

export enum ColorThemeKind {
  Dark = 1,
  Light = 2,
  HighContrast = 3,
  HighContrastLight = 4,
}

export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2,
}

export const window = {
  activeColorTheme: { kind: ColorThemeKind.Dark },
  onDidChangeActiveColorTheme: createSpy((callback: Function) => ({
    dispose: createSpy(),
  })),
  registerCustomEditorProvider: createSpy((viewType: string, provider: any, options: any) => ({
    dispose: createSpy(),
  })),
  registerTreeDataProvider: createSpy((viewId: string, treeDataProvider: any) => ({
    dispose: createSpy(),
  })),
  createOutputChannel: createSpy((name: string) => ({
    appendLine: createSpy(),
    append: createSpy(),
    show: createSpy(),
    hide: createSpy(),
    clear: createSpy(),
    dispose: createSpy(),
  })),
  showInformationMessage: createSpy(),
  showWarningMessage: createSpy(async (...args: any[]) => args[args.length - 1]),
  showErrorMessage: createSpy(),
  showInputBox: createSpy(async (options?: any) => options?.value || 'new_agent_workflow'),
};

export const workspace = {
  isTrusted: true,
  workspaceFolders: [
    {
      uri: {
        fsPath: '/mock/workspace',
        toString: () => 'file:///mock/workspace',
      },
    },
  ],
  asRelativePath: createSpy((pathOrUri: any) => {
    const p = typeof pathOrUri === 'string' ? pathOrUri : (pathOrUri?.fsPath || pathOrUri?.path || String(pathOrUri));
    return p.replace(/^\/mock\/workspace\/?/, '').replace(/^\//, '');
  }),
  applyEdit: createSpy(async () => true),
  openTextDocument: createSpy(async (uriOrOptions: any) => ({
    uri: uriOrOptions?.uri || (typeof uriOrOptions === 'object' && uriOrOptions?.fsPath ? uriOrOptions : { fsPath: '/mock/doc.agent' }),
    getText: () => '{}',
    isDirty: false,
    version: 1,
  })),
  onDidChangeTextDocument: createSpy((callback: Function) => ({
    dispose: createSpy(),
  })),
  getConfiguration: createSpy((section?: string) => ({
    get: createSpy((key: string, defaultValue?: any) => defaultValue || ''),
  })),
  findFiles: createSpy(async (include: any, exclude: any) => []),
  createFileSystemWatcher: createSpy((pattern: any) => ({
    onDidCreate: createSpy((cb: Function) => ({ dispose: createSpy() })),
    onDidChange: createSpy((cb: Function) => ({ dispose: createSpy() })),
    onDidDelete: createSpy((cb: Function) => ({ dispose: createSpy() })),
    dispose: createSpy(),
  })),
  fs: {
    stat: createSpy(async () => {
      throw new Error('File not found');
    }),
    createDirectory: createSpy(async () => undefined),
    writeFile: createSpy(async () => undefined),
    readFile: createSpy(async () => Buffer.from('')),
    readDirectory: createSpy(async () => []),
    delete: createSpy(async () => undefined),
  },
};

export const commands = {
  registerCommand: createSpy((command: string, callback: Function) => ({
    dispose: createSpy(),
  })),
  executeCommand: createSpy(async () => undefined),
};

export class Uri {
  public fsPath: string;
  constructor(fsPath: string) {
    this.fsPath = fsPath;
  }
  public static file(path: string): Uri {
    return new Uri(path);
  }
  public static parse(uriString: string): Uri {
    return new Uri(uriString.replace('file://', ''));
  }
  public static joinPath(base: Uri, ...paths: string[]): Uri {
    return new Uri([base.fsPath, ...paths].join('/'));
  }
  public toString(): string {
    return `file://${this.fsPath}`;
  }
}

export class Range {
  public start: Position;
  public end: Position;
  constructor(start: Position, end: Position) {
    this.start = start;
    this.end = end;
  }
}

export class Position {
  public line: number;
  public character: number;
  constructor(line: number, character: number) {
    this.line = line;
    this.character = character;
  }
}

export class WorkspaceEdit {
  public edits: any[] = [];
  public replace(uri: Uri, range: Range, newText: string) {
    this.edits.push({ uri, range, newText });
  }
}

export class MarkdownString {
  public value: string;
  public isTrusted?: boolean;
  public supportThemeIcons?: boolean;
  constructor(value: string = '', isTrusted: boolean = false) {
    this.value = value;
    this.isTrusted = isTrusted;
  }
  public appendMarkdown(value: string): MarkdownString {
    this.value += value;
    return this;
  }
  public appendText(value: string): MarkdownString {
    this.value += value;
    return this;
  }
  public appendCodeblock(value: string, language?: string): MarkdownString {
    this.value += `\n\`\`\`${language || ''}\n${value}\n\`\`\`\n`;
    return this;
  }
}

export class ThemeColor {
  public id: string;
  constructor(id: string) {
    this.id = id;
  }
}

export class ThemeIcon {
  public id: string;
  public color?: ThemeColor;
  constructor(id: string, color?: ThemeColor) {
    this.id = id;
    this.color = color;
  }
}

export class TreeItem {
  public label?: string | { label: string; highlights?: any[] };
  public collapsibleState?: TreeItemCollapsibleState;
  public resourceUri?: Uri;
  public iconPath?: any;
  public description?: string | boolean;
  public tooltip?: string;
  public contextValue?: string;
  public command?: any;

  constructor(labelOrUri: string | Uri, collapsibleState?: TreeItemCollapsibleState) {
    if (typeof labelOrUri === 'string') {
      this.label = labelOrUri;
    } else if (labelOrUri instanceof Uri || (labelOrUri && 'fsPath' in labelOrUri)) {
      this.resourceUri = labelOrUri;
    }
    this.collapsibleState = collapsibleState ?? TreeItemCollapsibleState.None;
  }
}

export class EventEmitter<T = any> {
  private listeners: Array<(e: T) => any> = [];
  public event = (listener: (e: T) => any) => {
    this.listeners.push(listener);
    return {
      dispose: () => {
        const idx = this.listeners.indexOf(listener);
        if (idx >= 0) this.listeners.splice(idx, 1);
      },
    };
  };
  public fire(data?: T): void {
    for (const listener of [...this.listeners]) {
      listener(data as T);
    }
  }
  public dispose(): void {
    this.listeners = [];
  }
}

export class Disposable {
  private callOnDispose: Function;
  constructor(callOnDispose: Function) {
    this.callOnDispose = callOnDispose;
  }
  public dispose(): any {
    return this.callOnDispose?.();
  }
  public static from(...disposables: { dispose(): any }[]): Disposable {
    return new Disposable(() => {
      for (const d of disposables) {
        d.dispose?.();
      }
    });
  }
}
