/**
 * WebviewBridge
 *
 * Extension Host Communication Bus for Visual Studio Code Agent Flow Builder.
 * Wraps vscode.WebviewPanel with type-safe message posting, strongly-typed handler
 * registration, and lifecycle disposal.
 *
 * Architectural Decisions:
 * 1. Strongly typed payload mapping using TypeScript discriminated unions from rpcProtocol.
 * 2. Manages an internal registry of listener subscriptions and automatically disposes them
 *    when the webview panel or bridge is destroyed.
 * 3. Supports asynchronous message handlers with structured error logging.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import * as vscode from 'vscode';
import {
  WebviewToExtensionMessage,
  ExtensionToWebviewMessage,
} from '../shared/rpcProtocol';

export type MessageHandler<T = any> = (payload: T) => void | Promise<void>;

export class WebviewBridge implements vscode.Disposable {
  private readonly panel: vscode.WebviewPanel;
  private readonly handlers: Map<string, Set<MessageHandler>> = new Map();
  private readonly disposables: vscode.Disposable[] = [];
  private readonly outputChannel?: vscode.OutputChannel;

  private isDisposed: boolean = false;

  /**
   * Initializes the WebviewBridge wrapping an active VS Code WebviewPanel.
   *
   * @param panel Active vscode.WebviewPanel instance
   * @param outputChannel Optional OutputChannel for telemetry
   */
  constructor(panel: vscode.WebviewPanel, outputChannel?: vscode.OutputChannel) {
    this.panel = panel;
    this.outputChannel = outputChannel;

    // Listen to messages emitted by the webview
    const messageListener = this.panel.webview.onDidReceiveMessage(
      async (message: WebviewToExtensionMessage) => {
        this.outputChannel?.appendLine(`[WebviewBridge:RECV] Received from webview: ${JSON.stringify(message)}`);
        await this.dispatch(message);
      }
    );
    this.disposables.push(messageListener);

    // Clean up all handlers when the panel is disposed
    const disposeListener = this.panel.onDidDispose(() => {
      this.isDisposed = true;
      this.dispose();
    });
    this.disposables.push(disposeListener);
  }

  /**
   * Posts a type-safe message to the Webview React SPA.
   *
   * @param message Strongly typed ExtensionToWebviewMessage
   * @returns Promise resolving to true if message was posted successfully
   */
  public async postMessage(message: ExtensionToWebviewMessage): Promise<boolean> {
    if (this.isDisposed) {
      return false;
    }
    try {
      this.outputChannel?.appendLine(`[WebviewBridge:SEND] Sending to webview: ${JSON.stringify(message.type)}`);
      // Sanitize payload to guarantee plain JSON over VS Code's internal ExtensionHost IPC
      const safeMessage = JSON.parse(JSON.stringify(message));
      return await this.panel.webview.postMessage(safeMessage);
    } catch {
      // Panel was disposed or unavailable during async post
      return false;
    }
  }

  /**
   * Registers a type-safe listener for a specific webview command type.
   *
   * @param type Command action type string from WebviewToExtensionMessage
   * @param handler Asynchronous or synchronous callback handler
   * @returns Disposable to unregister the handler
   */
  public onMessage<T extends WebviewToExtensionMessage['type']>(
    type: T,
    handler: (
      payload: Extract<WebviewToExtensionMessage, { type: T }> extends { payload: infer P }
        ? P
        : undefined
    ) => void | Promise<void>
  ): vscode.Disposable {
    let handlerSet = this.handlers.get(type);
    if (!handlerSet) {
      handlerSet = new Set<MessageHandler>();
      this.handlers.set(type, handlerSet);
    }
    handlerSet.add(handler as MessageHandler);

    return {
      dispose: () => {
        const set = this.handlers.get(type);
        if (set) {
          set.delete(handler as MessageHandler);
          if (set.size === 0) {
            this.handlers.delete(type);
          }
        }
      },
    };
  }

  /**
   * Dispatches an incoming webview message to all registered handlers.
   *
   * @param message Incoming WebviewToExtensionMessage
   */
  public async dispatch(message: WebviewToExtensionMessage): Promise<void> {
    if (!message || !message.type) return;

    const handlerSet = this.handlers.get(message.type);
    if (!handlerSet || handlerSet.size === 0) return;

    const payload = 'payload' in message ? message.payload : undefined;
    for (const handler of Array.from(handlerSet)) {
      try {
        await handler(payload);
      } catch (err) {
        console.error(`[WebviewBridge] Error handling message ${message.type}:`, err);
      }
    }
  }

  /**
   * Disposes the bridge and unregisters all event listeners.
   */
  public dispose(): void {
    this.handlers.clear();
    while (this.disposables.length > 0) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
