import React, { Component, ErrorInfo, ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Acquire or reuse VS Code Webview API singleton
let vscode: any = null;
if (typeof window !== 'undefined') {
  vscode = (window as any).vscode || (window as any).vscodeApiInstance || null;
  if (!vscode && typeof (window as any).acquireVsCodeApi === 'function') {
    try {
      vscode = (window as any).acquireVsCodeApi();
      (window as any).vscode = vscode;
      (window as any).vscodeApiInstance = vscode;
    } catch {
      vscode = (window as any).vscode || null;
    }
  }
}

// Read serialized bootstrap data safely from script tag to prevent inline script variables
if (typeof document !== 'undefined') {
  const bootstrapEl = document.getElementById('bootstrap-data');
  if (bootstrapEl && bootstrapEl.textContent) {
    try {
      const bootstrapData = JSON.parse(bootstrapEl.textContent);
      if (bootstrapData) {
        if (bootstrapData.initialDoc) {
          (window as any).__INITIAL_AGENT_DOCUMENT__ = bootstrapData.initialDoc;
        }
        if (bootstrapData.initialFilePath !== undefined) {
          (window as any).__INITIAL_AGENT_FILE_PATH__ = bootstrapData.initialFilePath;
        }
      }
    } catch (err) {
      console.error('[Webview] Failed to parse bootstrap data:', err);
    }
  }
}

/**
 * Webview React Entry Point & Top-Level Error Boundary
 *
 * Purpose: Initializes React 19 visual canvas and error boundary inside the VS Code Webview.
 *
 * Architectural Decisions:
 * 1. Acquires or reuses acquireVsCodeApi singleton at root module level and stores to window.vscode.
 * 2. Streams all console messages and uncaught exceptions to Extension Host output channel.
 * 3. Provides top-level error boundary to prevent silent white screen failures.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */
interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[Webview React ErrorBoundary]', error, errorInfo);
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <div style={{ padding: '24px', background: '#1e1e1e', color: '#ff6b6b', fontFamily: 'monospace', height: '100vh', boxSizing: 'border-box', overflow: 'auto' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '8px' }}>⚠️ Agent Flow Canvas Error</h2>
          <p style={{ color: '#ffffff', marginBottom: '16px' }}>{this.state.error.message}</p>
          <pre style={{ whiteSpace: 'pre-wrap', background: '#0d1117', padding: '16px', borderRadius: '8px', border: '1px solid #30363d', fontSize: '12px' }}>
            {this.state.error.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById('root');

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
}
