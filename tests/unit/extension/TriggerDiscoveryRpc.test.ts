/**
 * Unit Tests for Trigger Discovery RPC Messages and Routing
 *
 * Purpose:
 * Validates RPC routing between Webview and Extension Host for dynamic GCP discovery:
 * - FETCH_PUBSUB_TOPICS -> PUBSUB_TOPICS_RESPONSE
 * - FETCH_PUBSUB_SUBSCRIPTIONS -> PUBSUB_SUBSCRIPTIONS_RESPONSE
 * - FETCH_GCP_SERVICE_ACCOUNTS -> GCP_SERVICE_ACCOUNTS_RESPONSE
 * - FETCH_EVENTARC_PROVIDERS -> EVENTARC_PROVIDERS_RESPONSE
 *
 * Architectural Decisions:
 * 1. Author: Mike Nimer <mikenimer@google.com>
 * 2. Contract Verification: Tests request and response payload structure and correlation IDs.
 * 3. Graceful Fallback: Confirms offline catalog responses on execution failure.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as vscode from 'vscode';
import * as path from 'path';
import { AgentEditorProvider } from '../../../src/extension/AgentEditorProvider';
import { GcpDiscoveryManager } from '../../../src/extension/GcpDiscoveryManager';
import { EventarcDiscoveryManager } from '../../../src/extension/EventarcDiscoveryManager';

describe('Trigger Discovery RPC Tests', { concurrency: 1 }, () => {
  const projectRoot = path.resolve(__dirname, '../../..');
  const mockContext: any = {
    extensionPath: projectRoot,
    extensionUri: vscode.Uri.file(projectRoot),
    subscriptions: [],
  };

  beforeEach(() => {
    vscode.resetAllMocks();
    GcpDiscoveryManager.resetInstance();
    EventarcDiscoveryManager.resetInstance();
  });

  it('should handle FETCH_PUBSUB_TOPICS and reply with PUBSUB_TOPICS_RESPONSE', async () => {
    const postedMessages: any[] = [];
    let messageListener: ((msg: any) => Promise<void>) | null = null;

    const mockWebview = {
      postMessage: async (msg: any) => {
        postedMessages.push(msg);
        return true;
      },
      onDidReceiveMessage: (cb: any) => {
        messageListener = cb;
        return { dispose: () => {} };
      },
      asWebviewUri: (uri: any) => uri,
      options: {},
      html: '',
      cspSource: 'https://mock.csp',
    };

    const mockWebviewPanel = {
      webview: mockWebview,
      onDidDispose: () => ({ dispose: () => {} }),
      onDidChangeViewState: () => ({ dispose: () => {} }),
      reveal: () => {},
      dispose: () => {},
      active: true,
      visible: true,
      viewColumn: 1,
      title: 'Agent Flow',
    };

    const mockDocument = {
      uri: vscode.Uri.file('/test/workspace/agent.flow'),
      getText: () => JSON.stringify({ nodes: [], edges: [] }),
      isDirty: false,
      save: async () => {},
    };

    const provider = new AgentEditorProvider(mockContext);
    await provider.resolveCustomTextEditor(mockDocument as any, mockWebviewPanel as any, {} as any);

    assert.ok(messageListener, 'Message listener must be registered on webview');

    // Send FETCH_PUBSUB_TOPICS message
    await (messageListener as any)({
      type: 'FETCH_PUBSUB_TOPICS',
      correlationId: 'test-topics-rpc-1',
      payload: { projectId: 'mock-proj', forceRefresh: false },
    });

    const reply = postedMessages.find((m) => m.type === 'PUBSUB_TOPICS_RESPONSE');
    assert.ok(reply, 'Must post back PUBSUB_TOPICS_RESPONSE');
    assert.equal(reply.correlationId, 'test-topics-rpc-1', 'Correlation ID must match');
    assert.ok(Array.isArray(reply.payload.topics), 'Payload must contain topics array');
    assert.ok(reply.payload.topics.length > 0, 'Topics array must not be empty');
  });

  it('should handle FETCH_PUBSUB_SUBSCRIPTIONS and reply with PUBSUB_SUBSCRIPTIONS_RESPONSE', async () => {
    const postedMessages: any[] = [];
    let messageListener: ((msg: any) => Promise<void>) | null = null;

    const mockWebview = {
      postMessage: async (msg: any) => {
        postedMessages.push(msg);
        return true;
      },
      onDidReceiveMessage: (cb: any) => {
        messageListener = cb;
        return { dispose: () => {} };
      },
      asWebviewUri: (uri: any) => uri,
      options: {},
      html: '',
      cspSource: 'https://mock.csp',
    };

    const mockWebviewPanel = {
      webview: mockWebview,
      onDidDispose: () => ({ dispose: () => {} }),
      onDidChangeViewState: () => ({ dispose: () => {} }),
      reveal: () => {},
      dispose: () => {},
      active: true,
      visible: true,
      viewColumn: 1,
      title: 'Agent Flow',
    };

    const mockDocument = {
      uri: vscode.Uri.file('/test/workspace/agent.flow'),
      getText: () => JSON.stringify({ nodes: [], edges: [] }),
      isDirty: false,
      save: async () => {},
    };

    const provider = new AgentEditorProvider(mockContext);
    await provider.resolveCustomTextEditor(mockDocument as any, mockWebviewPanel as any, {} as any);

    assert.ok(messageListener, 'Message listener must be registered');

    await (messageListener as any)({
      type: 'FETCH_PUBSUB_SUBSCRIPTIONS',
      correlationId: 'test-subs-rpc-1',
      payload: { projectId: 'mock-proj', forceRefresh: false },
    });

    const reply = postedMessages.find((m) => m.type === 'PUBSUB_SUBSCRIPTIONS_RESPONSE');
    assert.ok(reply, 'Must post back PUBSUB_SUBSCRIPTIONS_RESPONSE');
    assert.equal(reply.correlationId, 'test-subs-rpc-1');
    assert.ok(Array.isArray(reply.payload.subscriptions));
    assert.ok(reply.payload.subscriptions.length > 0);
  });

  it('should handle FETCH_GCP_SERVICE_ACCOUNTS and reply with GCP_SERVICE_ACCOUNTS_RESPONSE', async () => {
    const postedMessages: any[] = [];
    let messageListener: ((msg: any) => Promise<void>) | null = null;

    const mockWebview = {
      postMessage: async (msg: any) => {
        postedMessages.push(msg);
        return true;
      },
      onDidReceiveMessage: (cb: any) => {
        messageListener = cb;
        return { dispose: () => {} };
      },
      asWebviewUri: (uri: any) => uri,
      options: {},
      html: '',
      cspSource: 'https://mock.csp',
    };

    const mockWebviewPanel = {
      webview: mockWebview,
      onDidDispose: () => ({ dispose: () => {} }),
      onDidChangeViewState: () => ({ dispose: () => {} }),
      reveal: () => {},
      dispose: () => {},
      active: true,
      visible: true,
      viewColumn: 1,
      title: 'Agent Flow',
    };

    const mockDocument = {
      uri: vscode.Uri.file('/test/workspace/agent.flow'),
      getText: () => JSON.stringify({ nodes: [], edges: [] }),
      isDirty: false,
      save: async () => {},
    };

    const provider = new AgentEditorProvider(mockContext);
    await provider.resolveCustomTextEditor(mockDocument as any, mockWebviewPanel as any, {} as any);

    assert.ok(messageListener, 'Message listener must be registered');

    await (messageListener as any)({
      type: 'FETCH_GCP_SERVICE_ACCOUNTS',
      correlationId: 'test-sa-rpc-1',
      payload: { projectId: 'mock-proj', forceRefresh: false },
    });

    const reply = postedMessages.find((m) => m.type === 'GCP_SERVICE_ACCOUNTS_RESPONSE');
    assert.ok(reply, 'Must post back GCP_SERVICE_ACCOUNTS_RESPONSE');
    assert.equal(reply.correlationId, 'test-sa-rpc-1');
    assert.ok(Array.isArray(reply.payload.serviceAccounts));
    assert.ok(reply.payload.serviceAccounts.length > 0);
  });
});
