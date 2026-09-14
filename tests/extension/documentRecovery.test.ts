/**
 * Unit Tests for TASK-136 Document Recovery and Guardrails
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { AgentEditorProvider } from '../../src/extension/AgentEditorProvider';
import { AgentWorkflowDocument } from '../../src/shared/types';
import { SecretsProvider } from '../../src/extension/security/SecretsProvider';

describe('Document Recovery and Guardrails (TASK-136)', { concurrency: 1 }, () => {
  beforeEach(() => {
    vscode.resetAllMocks();
    (SecretsProvider as any).instance = undefined;
    SecretsProvider.init({
      get: async () => undefined,
      store: async () => {},
      delete: async () => {},
      onDidChange: () => ({ dispose: () => {} }),
    } as any);
  });

  it('should prevent silent overwrites and emit PARSE_ERROR on malformed .agent documents', async () => {
    const mockContext: any = {
      extensionPath: '/mock/extension',
      extensionUri: vscode.Uri.file('/mock/extension'),
      subscriptions: [],
    };
    const provider = new AgentEditorProvider(mockContext);

    // Corrupted/malformed JSON document
    const malformedText = '{ "version": "1.0.0", "name": "corrupt", "nodes": [';

    const mockDoc: any = {
      uri: vscode.Uri.file('/mock/corrupt.agent'),
      getText: () => malformedText,
      positionAt: (idx: number) => new vscode.Position(0, idx),
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

    // Simulate READY signal from webview
    assert.ok(messageCallback);
    await (messageCallback as any)({ type: 'READY' });

    // Assert a PARSE_ERROR is emitted to the webview
    const parseErrorMsg = postedMessages.find((m) => m.type === 'PARSE_ERROR');
    assert.ok(parseErrorMsg);
    assert.ok(parseErrorMsg.payload.error.includes('Unexpected end of JSON input') || parseErrorMsg.payload.error.includes('Expected'));
    assert.equal(parseErrorMsg.payload.rawText, malformedText);

    // Ensure state map tracks the parse error
    const parseErrors: Map<string, string> = (provider as any).parseErrors;
    assert.equal(parseErrors.has(mockDoc.uri.toString()), true);

    // Try to send a DOCUMENT_UPDATED from the webview while in error state
    const updatedDoc: AgentWorkflowDocument = {
      version: '1.0.0',
      name: 'corrupt',
      description: 'Attempt overwrite',
      framework: 'google-adk',
      language: 'python',
      nodes: [],
      edges: [],
    };

    postedMessages.length = 0; // Clear
    vscode.resetAllMocks(); // Clear calls count to verify applyEdit is NOT called

    await (messageCallback as any)({
      type: 'DOCUMENT_UPDATED',
      payload: {
        document: updatedDoc,
        docVersion: 2,
      },
    });

    // Assert workspace edits were NOT applied and DOCUMENT_SAVED was NOT posted
    assert.equal(vscode.workspace.applyEdit.calls.length, 0);
    assert.equal(postedMessages.some((m) => m.type === 'DOCUMENT_SAVED'), false);
  });

  it('should reject loading incompatible future major schema versions', async () => {
    const mockContext: any = {
      extensionPath: '/mock/extension',
      extensionUri: vscode.Uri.file('/mock/extension'),
      subscriptions: [],
    };
    const provider = new AgentEditorProvider(mockContext);

    // Unsupported version 2.0.0
    const futureDoc: AgentWorkflowDocument = {
      version: '2.0.0',
      name: 'future_feature',
      description: 'Next gen workflow',
      framework: 'google-adk',
      language: 'python',
      nodes: [],
      edges: [],
    };

    const mockDoc: any = {
      uri: vscode.Uri.file('/mock/future.agent'),
      getText: () => JSON.stringify(futureDoc),
      positionAt: (idx: number) => new vscode.Position(0, idx),
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

    // Simulate READY signal
    assert.ok(messageCallback);
    await (messageCallback as any)({ type: 'READY' });

    // Assert incompatible schema triggers a PARSE_ERROR
    const parseErrorMsg = postedMessages.find((m) => m.type === 'PARSE_ERROR');
    assert.ok(parseErrorMsg);
    assert.ok(parseErrorMsg.payload.error.includes('Unsupported future schema version: 2.0.0'));

    // Assert it registers in parseErrors state map
    const parseErrors: Map<string, string> = (provider as any).parseErrors;
    assert.equal(parseErrors.has(mockDoc.uri.toString()), true);
  });

  it('should skip applying workspace edits if serialized JSON is byte-for-byte identical', async () => {
    const mockContext: any = {
      extensionPath: '/mock/extension',
      extensionUri: vscode.Uri.file('/mock/extension'),
      subscriptions: [],
    };
    const provider = new AgentEditorProvider(mockContext);

    const docContent: AgentWorkflowDocument = {
      version: '1.0.0',
      name: 'stable',
      description: 'No changes',
      framework: 'google-adk',
      language: 'python',
      nodes: [],
      edges: [],
    };
    const jsonString = JSON.stringify(docContent, null, 2);

    const mockDoc: any = {
      uri: vscode.Uri.file('/mock/stable.agent'),
      getText: () => jsonString,
      positionAt: (idx: number) => new vscode.Position(0, idx),
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

    // Simulate DOCUMENT_UPDATED with the exact same content
    assert.ok(messageCallback);
    vscode.resetAllMocks();

    await (messageCallback as any)({
      type: 'DOCUMENT_UPDATED',
      payload: {
        document: docContent,
        docVersion: 2,
      },
    });

    // Assert applyEdit is NOT called because content is identical
    assert.equal(vscode.workspace.applyEdit.calls.length, 0);
  });

  it('should generate minimal range edits instead of full replacement', async () => {
    const mockContext: any = {
      extensionPath: '/mock/extension',
      extensionUri: vscode.Uri.file('/mock/extension'),
      subscriptions: [],
    };
    const provider = new AgentEditorProvider(mockContext);

    const oldText = '{\n  "name": "original",\n  "framework": "google-adk"\n}';
    const newText = '{\n  "name": "changed",\n  "framework": "google-adk"\n}';

    const mockDoc: any = {
      uri: vscode.Uri.file('/mock/diff.agent'),
      getText: () => oldText,
      positionAt: (idx: number) => {
        // Line indices helper for mock position
        const upTo = oldText.substring(0, idx);
        const lines = upTo.split('\n');
        return new vscode.Position(lines.length - 1, lines[lines.length - 1].length);
      },
    };

    vscode.resetAllMocks();

    // Directly call the private updateTextDocument to capture WorkspaceEdit
    await (provider as any).updateTextDocument(mockDoc, newText);

    assert.equal(vscode.workspace.applyEdit.calls.length, 1);
    const appliedEdit = vscode.workspace.applyEdit.calls[0][0];
    assert.ok(appliedEdit);
    assert.equal(appliedEdit.edits.length, 1);

    const edit = appliedEdit.edits[0];
    assert.equal(edit.newText, 'changed');
    assert.equal(edit.range.start.line, 1);
    assert.equal(edit.range.start.character, 11);
    assert.equal(edit.range.end.line, 1);
    assert.equal(edit.range.end.character, 19);
  });
});
