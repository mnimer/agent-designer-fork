/**
 * Unit Tests for AgentEditorProvider
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { AgentEditorProvider } from '../../src/extension/AgentEditorProvider';
import { AgentWorkflowDocument } from '../../src/shared/types';

describe('AgentEditorProvider', () => {
  beforeEach(() => {
    vscode.resetAllMocks();
  });

  it('should register custom editor provider with VS Code', () => {
    const mockContext: any = {
      extensionPath: '/mock/extension/path',
      subscriptions: [],
    };
    const disposable = AgentEditorProvider.register(mockContext);
    assert.equal(vscode.window.registerCustomEditorProvider.calls.length > 0, true);
    assert.ok(disposable);
  });

  it('should create default workflow with single agent and test trigger', () => {
    const mockContext: any = { extensionPath: '/mock', subscriptions: [] };
    const provider = new AgentEditorProvider(mockContext);
    const mockUri = vscode.Uri.file('/mock/test_workflow.agent');
    const workflow = provider.createDefaultWorkflow(mockUri as any);

    assert.equal(workflow.name, 'test_workflow');
    assert.equal(workflow.framework, 'google-adk');
    assert.equal(workflow.language, 'python');
    assert.equal(workflow.nodes.length, 2);

    const triggerNode = workflow.nodes.find((n) => n.type === 'trigger');
    const agentNode = workflow.nodes.find((n) => n.type === 'agent');

    assert.ok(triggerNode);
    assert.ok(agentNode);
    assert.equal((agentNode?.data as any).agentKind, 'standard');
    assert.equal((agentNode?.data as any).standardConfig.tools.length, 1);
    assert.equal((agentNode?.data as any).standardConfig.tools[0].id, 'tool-google-search');
    assert.equal(workflow.edges.length, 1);
  });

  it('should generate CSP compliant HTML for webview', () => {
    const mockContext: any = { extensionPath: '/mock/extension', subscriptions: [] };
    const provider = new AgentEditorProvider(mockContext);
    const mockWebview: any = {
      cspSource: 'vscode-webview:',
      asWebviewUri: (uri: any) => uri.toString(),
    };

    const html = provider.getHtmlForWebview(mockWebview);
    assert.equal(html.includes('<!DOCTYPE html>'), true);
    assert.equal(html.includes('Content-Security-Policy'), true);
    assert.equal(html.includes('nonce-'), true);
    assert.equal(html.includes('<div id="root"'), true);
  });

  it('should resolve custom text editor, set html, and handle READY message', async () => {
    const mockContext: any = { extensionPath: '/mock/extension', subscriptions: [] };
    const provider = new AgentEditorProvider(mockContext);

    const initialDoc: AgentWorkflowDocument = {
      version: '1.0.0',
      name: 'sample',
      description: 'Sample description',
      framework: 'google-adk',
      language: 'python',
      nodes: [],
      edges: [],
    };

    const mockDoc: any = {
      uri: vscode.Uri.file('/mock/sample.agent'),
      getText: () => JSON.stringify(initialDoc),
      positionAt: () => new vscode.Position(0, 0),
    };

    let messageCallback: ((msg: any) => Promise<void>) | null = null;
    const postedMessages: any[] = [];

    const mockPanel: any = {
      webview: {
        options: {},
        html: '',
        postMessage: async (msg: any) => {
          postedMessages.push(msg);
          return true;
        },
        onDidReceiveMessage: (cb: any) => {
          messageCallback = cb;
          return { dispose: () => {} };
        },
        cspSource: 'vscode-webview:',
        asWebviewUri: (uri: any) => uri.toString(),
      },
      onDidDispose: () => {},
    };

    await provider.resolveCustomTextEditor(mockDoc, mockPanel, {} as any);

    assert.equal(mockPanel.webview.options.enableScripts, true);
    assert.equal(mockPanel.webview.html.includes('<!DOCTYPE html>'), true);

    // Initial theme message posted
    assert.equal(
      postedMessages.some((m) => m.type === 'THEME_CHANGED'),
      true
    );

    // Simulate READY message from webview
    assert.ok(messageCallback);
    if (messageCallback) {
      await (messageCallback as any)({ type: 'READY' });
      const loadDocMsg = postedMessages.find((m) => m.type === 'LOAD_DOCUMENT');
      assert.ok(loadDocMsg);
      assert.equal(loadDocMsg.payload.document.name, 'sample');
    }
  });

  it('should handle DOCUMENT_UPDATED message and apply workspace edit', async () => {
    const mockContext: any = { extensionPath: '/mock/extension', subscriptions: [] };
    const provider = new AgentEditorProvider(mockContext);

    const updatedDoc: AgentWorkflowDocument = {
      version: '1.0.0',
      name: 'updated',
      description: 'Updated description',
      framework: 'google-adk',
      language: 'python',
      nodes: [],
      edges: [],
    };

    const mockDoc: any = {
      uri: vscode.Uri.file('/mock/sample.agent'),
      getText: () => '{}',
      positionAt: () => new vscode.Position(0, 0),
    };

    let messageCallback: ((msg: any) => Promise<void>) | null = null;
    const postedMessages: any[] = [];

    const mockPanel: any = {
      webview: {
        options: {},
        html: '',
        postMessage: async (msg: any) => {
          postedMessages.push(msg);
          return true;
        },
        onDidReceiveMessage: (cb: any) => {
          messageCallback = cb;
          return { dispose: () => {} };
        },
        cspSource: 'vscode-webview:',
        asWebviewUri: (uri: any) => uri.toString(),
      },
      onDidDispose: () => {},
    };

    await provider.resolveCustomTextEditor(mockDoc, mockPanel, {} as any);

    if (messageCallback) {
      await (messageCallback as any)({
        type: 'DOCUMENT_UPDATED',
        payload: {
          document: updatedDoc,
          docVersion: 2,
        },
      });

      const savedMsg = postedMessages.find((m) => m.type === 'DOCUMENT_SAVED');
      assert.ok(savedMsg);
      assert.equal(savedMsg.payload.docVersion, 2);
    }
  });

  it('should delegate custom messages to registered message handlers', async () => {
    const mockContext: any = { extensionPath: '/mock/extension', subscriptions: [] };
    const provider = new AgentEditorProvider(mockContext);

    const mockDoc: any = {
      uri: vscode.Uri.file('/mock/sample.agent'),
      getText: () => '{}',
      positionAt: () => new vscode.Position(0, 0),
    };

    let messageCallback: ((msg: any) => Promise<void>) | null = null;
    const mockPanel: any = {
      webview: {
        options: {},
        html: '',
        postMessage: async () => true,
        onDidReceiveMessage: (cb: any) => {
          messageCallback = cb;
          return { dispose: () => {} };
        },
        cspSource: 'vscode-webview:',
        asWebviewUri: (uri: any) => uri.toString(),
      },
      onDidDispose: () => {},
    };

    let receivedMsg: any = null;
    provider.registerMessageHandler('EXPORT_CODE', (msg) => {
      receivedMsg = msg;
    });

    await provider.resolveCustomTextEditor(mockDoc, mockPanel, {} as any);

    if (messageCallback) {
      const exportMsg = {
        type: 'EXPORT_CODE',
        payload: {
          document: {} as any,
          targetFramework: 'google-adk' as const,
          targetLanguage: 'python' as const,
        },
      };
      await (messageCallback as any)(exportMsg);
      assert.deepEqual(receivedMsg, exportMsg);
    }
  });
});
