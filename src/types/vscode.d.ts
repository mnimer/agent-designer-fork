/**
 * VS Code Type Declarations for Agent Flow Builder Extension
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

declare module 'vscode' {
  export namespace window {
    export let activeColorTheme: ColorTheme;
    export function onDidChangeActiveColorTheme(
      listener: (e: ColorTheme) => any,
      thisArgs?: any,
      disposables?: Disposable[]
    ): Disposable;
    export function registerCustomEditorProvider(
      viewType: string,
      provider: CustomTextEditorProvider | CustomReadonlyEditorProvider,
      options?: {
        readonly webviewOptions?: {
          readonly retainContextWhenHidden?: boolean;
          readonly enableFindWidget?: boolean;
          readonly enableScripts?: boolean;
        };
        readonly supportsMultipleEditorsPerDocument?: boolean;
      }
    ): Disposable;
    export function showInformationMessage<T extends string>(
      message: string,
      ...items: T[]
    ): Promise<T | undefined>;
    export function showErrorMessage<T extends string>(
      message: string,
      ...items: T[]
    ): Promise<T | undefined>;
    export function createOutputChannel(name: string): OutputChannel;
  }

  export interface OutputChannel {
    name: string;
    append(value: string): void;
    appendLine(value: string): void;
    clear(): void;
    show(preserveFocus?: boolean): void;
    hide(): void;
    dispose(): void;
  }

  export namespace workspace {
    export let isTrusted: boolean;
    export let workspaceFolders: readonly WorkspaceFolder[] | undefined;
    export function applyEdit(edit: WorkspaceEdit): Promise<boolean>;
    export function onDidChangeTextDocument(
      listener: (e: TextDocumentChangeEvent) => any,
      thisArgs?: any,
      disposables?: Disposable[]
    ): Disposable;
    export function getConfiguration(
      section?: string,
      scope?: ConfigurationScope | null
    ): WorkspaceConfiguration;
    export const fs: FileSystem;
  }

  export interface FileSystem {
    createDirectory(uri: Uri): Promise<void>;
    writeFile(uri: Uri, content: Uint8Array): Promise<void>;
    readFile(uri: Uri): Promise<Uint8Array>;
    delete(uri: Uri, options?: { recursive?: boolean; useTrash?: boolean }): Promise<void>;
  }

  export interface WorkspaceConfiguration {
    get<T>(section: string): T | undefined;
    get<T>(section: string, defaultValue: T): T;
    has(section: string): boolean;
    update(
      section: string,
      value: any,
      configurationTarget?: ConfigurationTarget | boolean | null,
      overrideInLanguage?: boolean
    ): Promise<void>;
  }

  export type ConfigurationScope = Uri | TextDocument | WorkspaceFolder | { uri?: Uri; languageId: string };

  export enum ConfigurationTarget {
    Global = 1,
    Workspace = 2,
    WorkspaceFolder = 3,
  }

  export interface WorkspaceFolder {
    readonly uri: Uri;
    readonly name: string;
    readonly index: number;
  }

  export namespace commands {
    export function registerCommand(
      command: string,
      callback: (...args: any[]) => any,
      thisArgs?: any
    ): Disposable;
    export function executeCommand<T = unknown>(
      command: string,
      ...rest: any[]
    ): Promise<T | undefined>;
  }

  export enum ColorThemeKind {
    Dark = 1,
    Light = 2,
    HighContrast = 3,
    HighContrastLight = 4,
  }

  export interface ColorTheme {
    readonly kind: ColorThemeKind;
  }

  export class Uri {
    readonly scheme: string;
    readonly authority: string;
    readonly path: string;
    readonly query: string;
    readonly fragment: string;
    readonly fsPath: string;
    static file(path: string): Uri;
    static parse(value: string, strict?: boolean): Uri;
    static joinPath(base: Uri, ...pathSegments: string[]): Uri;
    toString(skipEncoding?: boolean): string;
    toJSON(): any;
    private constructor(scheme: string, authority: string, path: string, query: string, fragment: string);
  }

  export class Position {
    readonly line: number;
    readonly character: number;
    constructor(line: number, character: number);
  }

  export class Range {
    readonly start: Position;
    readonly end: Position;
    constructor(start: Position, end: Position);
    constructor(startLine: number, startCharacter: number, endLine: number, endCharacter: number);
  }

  export class WorkspaceEdit {
    readonly size: number;
    replace(uri: Uri, range: Range, newText: string): void;
    insert(uri: Uri, position: Position, newText: string): void;
    delete(uri: Uri, range: Range): void;
  }

  export interface TextDocument {
    readonly uri: Uri;
    readonly fileName: string;
    readonly isUntitled: boolean;
    readonly languageId: string;
    readonly version: number;
    readonly isDirty: boolean;
    readonly isClosed: boolean;
    readonly lineCount: number;
    getText(range?: Range): string;
    positionAt(offset: number): Position;
    offsetAt(position: Position): number;
  }

  export interface TextDocumentChangeEvent {
    readonly document: TextDocument;
    readonly contentChanges: readonly TextDocumentContentChangeEvent[];
    readonly reason?: TextDocumentChangeReason;
  }

  export interface TextDocumentContentChangeEvent {
    readonly range: Range;
    readonly rangeOffset: number;
    readonly rangeLength: number;
    readonly text: string;
  }

  export enum TextDocumentChangeReason {
    Undo = 1,
    Redo = 2,
  }

  export interface CancellationToken {
    readonly isCancellationRequested: boolean;
    readonly onCancellationRequested: (listener: (e: any) => any) => Disposable;
  }

  export interface Disposable {
    dispose(): any;
  }

  export interface ExtensionContext {
    readonly subscriptions: { push(...items: Disposable[]): void };
    readonly extensionPath: string;
    readonly globalState: Memento;
    readonly workspaceState: Memento;
  }

  export interface Memento {
    get<T>(key: string): T | undefined;
    get<T>(key: string, defaultValue: T): T;
    update(key: string, value: any): Promise<void>;
  }

  export interface WebviewPanel {
    readonly viewType: string;
    title: string;
    readonly webview: Webview;
    readonly onDidDispose: (listener: () => any) => Disposable;
    readonly onDidChangeViewState: (listener: (e: any) => any) => Disposable;
    readonly visible: boolean;
    readonly active: boolean;
    reveal(viewColumn?: any, preserveFocus?: boolean): void;
    dispose(): any;
  }

  export interface Webview {
    options: WebviewOptions;
    html: string;
    readonly cspSource: string;
    postMessage(message: any): Promise<boolean>;
    onDidReceiveMessage: (listener: (e: any) => any) => Disposable;
    asWebviewUri(localResource: Uri): Uri;
  }

  export interface WebviewOptions {
    readonly enableScripts?: boolean;
    readonly enableForms?: boolean;
    readonly enableCommandUris?: boolean;
    readonly localResourceRoots?: readonly Uri[];
    readonly portMapping?: readonly any[];
  }

  export interface CustomTextEditorProvider {
    resolveCustomTextEditor(
      document: TextDocument,
      webviewPanel: WebviewPanel,
      token: CancellationToken
    ): Promise<void> | void;
  }

  export interface CustomReadonlyEditorProvider {
    resolveCustomEditor(
      document: any,
      webviewPanel: WebviewPanel,
      token: CancellationToken
    ): Promise<void> | void;
  }
}
