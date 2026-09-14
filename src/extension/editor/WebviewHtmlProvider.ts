/**
 * WebviewHtmlProvider
 *
 * Compiles the CSP-compliant HTML container for the Webview SPA.
 * Inlines CSS and JS assets if available on disk for guaranteed, zero-latency rendering,
 * and falls back to Webview URIs with a strict cryptographic nonce.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { AgentWorkflowDocument } from '../../shared/types';
import { sanitizeFolderBaseName } from '../../shared/folderValidation';
import { AgentEditorProvider } from '../AgentEditorProvider';

/**
 * Generates HTML for embedding the full React SPA in the Webview panel.
 *
 * @param webview VS Code Webview instance
 * @param context VS Code ExtensionContext
 * @param outputChannel Optional logger
 * @param document Optional backing TextDocument for instant client hydration
 */
export function getHtmlForWebview(
  webview: vscode.Webview,
  context: vscode.ExtensionContext,
  outputChannel?: vscode.OutputChannel,
  document?: vscode.TextDocument
): string {
  const extensionUri = context.extensionUri || vscode.Uri.file(context.extensionPath || '');
  let realExtensionPath = context.extensionPath || extensionUri.fsPath;
  try {
    if (fs.existsSync(realExtensionPath)) {
      realExtensionPath = fs.realpathSync(realExtensionPath);
    }
  } catch {
    // fallback
  }

  const realExtensionUri = vscode.Uri.file(realExtensionPath);
  const distUri = vscode.Uri.joinPath(realExtensionUri, 'dist', 'webview');

  // Defensively resolve Webview URIs to support incomplete test mocks
  const jsUri = typeof webview.asWebviewUri === 'function'
    ? webview.asWebviewUri(vscode.Uri.joinPath(distUri, 'assets', 'index.js'))
    : '';
  const cssUri = typeof webview.asWebviewUri === 'function'
    ? webview.asWebviewUri(vscode.Uri.joinPath(distUri, 'assets', 'index.css'))
    : '';

  // Read compiled CSS and JS directly for guaranteed inline execution
  const cssPath = path.join(realExtensionPath, 'dist', 'webview', 'assets', 'index.css');
  const jsPath = path.join(realExtensionPath, 'dist', 'webview', 'assets', 'index.js');
  let inlineCss = '';
  let inlineJs = '';
  try {
    if (fs.existsSync(cssPath)) {
      inlineCss = fs.readFileSync(cssPath, 'utf-8');
    }
    if (fs.existsSync(jsPath)) {
      inlineJs = fs.readFileSync(jsPath, 'utf-8');
    }
  } catch (err) {
    outputChannel?.appendLine(`[AgentEditorProvider] Warning reading asset files from disk: ${err}`);
  }

  // Parse initial document for instant client-side hydration
  let initialDoc: AgentWorkflowDocument | null = null;
  if (document) {
    const docText = document.getText();
    try {
      initialDoc = docText.trim().length > 0 
        ? JSON.parse(docText) 
        : AgentEditorProvider.createEmptyWorkflowDocument(path.basename(document.uri.fsPath, '.agent'));
    } catch {
      initialDoc = AgentEditorProvider.createEmptyWorkflowDocument(path.basename(document.uri.fsPath, '.agent'));
    }
  }

  // Generate cryptographic nonce for strict Content Security Policy
  const nonce = crypto.randomBytes(16).toString('base64');
  const cspSource = webview.cspSource || 'vscode-webview:';

  // Serialize and escape bootstrap data securely to prevent injection/payload breakout
  const bootstrapData = {
    initialDoc,
    initialFilePath: document ? vscode.workspace.asRelativePath(document.uri) : ''
  };
  const bootstrapJson = JSON.stringify(bootstrapData)
    .replace(/<\/script/gi, '<\\/script')
    .replace(/</g, '\\u003c');

  outputChannel?.appendLine(
    `[AgentEditorProvider:Step 2] Prepared webview HTML with assets (inlineJs: ${inlineJs.length > 0 ? `${inlineJs.length} bytes` : 'fallback URI'}, inlineCss: ${inlineCss.length > 0 ? `${inlineCss.length} bytes` : 'fallback URI'})`
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' ${cspSource}; font-src ${cspSource}; img-src ${cspSource} https: data:; connect-src ${cspSource};" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Agent Flow Builder</title>
  <style nonce="${nonce}">
    html, body, #root {
      height: 100%;
      width: 100%;
      margin: 0;
      padding: 0;
      overflow: hidden;
      background-color: #1e1e1e;
      color: #cccccc;
      box-sizing: border-box;
    }
    ${inlineCss}
  </style>
  ${!inlineCss && cssUri ? `<link rel="stylesheet" href="${cssUri.toString()}">` : ''}
</head>
<body class="bg-[#1e1e1e] text-[#cccccc] overflow-hidden m-0 p-0 h-full w-full">
  <script type="application/json" id="bootstrap-data" nonce="${nonce}">${bootstrapJson}</script>
  <div id="root" class="h-full w-full"></div>
  <script nonce="${nonce}">
    (function() {
      try {
        const vscode = acquireVsCodeApi();
        window.vscode = vscode;
        window.vscodeApiInstance = vscode;

        // Global diagnostic hooks for unhandled errors
        window.addEventListener('error', function(e) {
          var msg = e.message || String(e);
          if (msg.indexOf('ResizeObserver') !== -1) {
            return;
          }
          vscode.postMessage({
            type: 'DIAGNOSTIC_ERROR',
            payload: {
              message: msg,
              url: e.filename || '',
              line: e.lineno || 0,
              col: e.colno || 0,
              stack: (e.error && e.error.stack) ? e.error.stack : ''
            }
          });
        });

        window.addEventListener('unhandledrejection', function(e) {
          vscode.postMessage({
            type: 'DIAGNOSTIC_ERROR',
            payload: {
              message: 'Unhandled Promise Rejection: ' + (e.reason ? (e.reason.message || String(e.reason)) : 'unknown'),
              stack: (e.reason && e.reason.stack) ? e.reason.stack : ''
            }
          });
        });

        vscode.postMessage({
          type: 'BOOTSTRAP_LOADED',
          payload: { timestamp: new Date().toISOString() }
        });
      } catch (err) {
        console.error('Failed to initialize webview bootstrap:', err);
      }
    })();
  </script>
  ${inlineJs ? `<script nonce="${nonce}">\n${inlineJs}\n</script>` : (jsUri ? `<script nonce="${nonce}" src="${jsUri.toString()}"></script>` : '')}
</body>
</html>`;
}
