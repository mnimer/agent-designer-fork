import React, { useState, useEffect } from 'react';
import { AgentWorkflowDocument } from '../shared/types';
import {
  ExtensionToWebviewMessage,
  WebviewToExtensionMessage,
} from '../shared/rpcProtocol';

/**
 * Visual Agent Flow Builder — Webview Root Application
 *
 * Job: Mounts the main IDE workbench, listens for LOAD_DOCUMENT and THEME_CHANGED
 * messages from the VS Code Extension Host, and sends READY on mount.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */
export default function App(): React.JSX.Element {
  const [doc, setDoc] = useState<AgentWorkflowDocument | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // Establish VS Code API acquireVsCodeApi reference safely
  const vscode = React.useMemo(() => {
    if (typeof window !== 'undefined' && 'acquireVsCodeApi' in window) {
      // @ts-expect-error acquireVsCodeApi is injected by VS Code Webview
      return window.acquireVsCodeApi();
    }
    return {
      postMessage: (msg: WebviewToExtensionMessage) => {
        console.log('[Mock VSCode PostMessage]', msg);
      },
    };
  }, []);

  useEffect(() => {
    // 1. Message listener for Extension Host events
    const handleMessage = (event: MessageEvent<ExtensionToWebviewMessage>) => {
      const msg = event.data;
      if (!msg || !msg.type) return;

      switch (msg.type) {
        case 'LOAD_DOCUMENT':
          setDoc(msg.payload.document);
          break;
        case 'THEME_CHANGED':
          setTheme(msg.payload.theme);
          document.body.className =
            msg.payload.theme === 'light' ? 'vscode-light' : 'vscode-dark';
          break;
        default:
          break;
      }
    };

    window.addEventListener('message', handleMessage);

    // 2. Notify Extension Host that Webview is mounted and ready
    vscode.postMessage({ type: 'READY' });

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [vscode]);

  return (
    <div
      className={`h-screen w-screen flex flex-col font-sans ${
        theme === 'light' ? 'theme-light' : 'theme-dark'
      }`}
    >
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--vscode-border)] bg-[var(--vscode-workbench-bg)]">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-[var(--vscode-text-primary)]">
            Agent Flow Builder
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-[var(--vscode-badge-bg)] text-[var(--vscode-text-muted)]">
            {doc ? doc.name : 'Loading...'}
          </span>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center bg-[var(--vscode-canvas-bg)] text-[var(--vscode-text-secondary)]">
        {doc ? (
          <div className="text-center p-6 bg-[var(--vscode-card-bg)] border border-[var(--vscode-border)] rounded-lg max-w-md shadow-lg">
            <h2 className="text-lg font-bold text-[var(--vscode-text-primary)] mb-2">
              {doc.name}
            </h2>
            <p className="text-sm text-[var(--vscode-text-muted)] mb-4">
              {doc.description}
            </p>
            <div className="text-xs text-left bg-[var(--vscode-subcard-bg)] p-3 rounded border border-[var(--vscode-border-light)]">
              <div>Framework: <span className="font-mono text-cyan-400">{doc.framework}</span></div>
              <div>Language: <span className="font-mono text-emerald-400">{doc.language}</span></div>
              <div>Nodes: <span className="font-mono">{doc.nodes.length}</span></div>
              <div>Edges: <span className="font-mono">{doc.edges.length}</span></div>
            </div>
          </div>
        ) : (
          <div className="text-sm animate-pulse">Initializing Agent Flow Canvas...</div>
        )}
      </div>
    </div>
  );
}
