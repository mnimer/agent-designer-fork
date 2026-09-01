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
  window.createOutputChannel.calls = [];
  window.showInformationMessage.calls = [];
  window.showErrorMessage.calls = [];
  workspace.applyEdit.calls = [];
  workspace.asRelativePath.calls = [];
  workspace.openTextDocument.calls = [];
  workspace.onDidChangeTextDocument.calls = [];
  workspace.getConfiguration.calls = [];
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

export const window = {
  activeColorTheme: { kind: ColorThemeKind.Dark },
  onDidChangeActiveColorTheme: createSpy((callback: Function) => ({
    dispose: createSpy(),
  })),
  registerCustomEditorProvider: createSpy((viewType: string, provider: any, options: any) => ({
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
  showErrorMessage: createSpy(),
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
