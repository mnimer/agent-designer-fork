/**
 * VS Code Mock Implementations for Node.js Test Runner
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

export function createSpy(implementation?: Function) {
  const calls: any[][] = [];
  const fn: any = function (...args: any[]) {
    calls.push(args);
    if (implementation) {
      return implementation(...args);
    }
    return undefined;
  };
  fn.calls = calls;
  fn.mockResolvedValue = function (val: any) {
    return createSpy(async () => val);
  };
  fn.mockReturnValue = function (val: any) {
    return createSpy(() => val);
  };
  return fn;
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
  showInformationMessage: createSpy(),
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
  applyEdit: createSpy(async () => true),
  onDidChangeTextDocument: createSpy((callback: Function) => ({
    dispose: createSpy(),
  })),
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
