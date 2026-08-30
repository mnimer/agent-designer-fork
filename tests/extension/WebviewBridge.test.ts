/**
 * Unit Tests for WebviewBridge
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { WebviewBridge } from '../../src/extension/WebviewBridge';
import { ExtensionToWebviewMessage, WebviewToExtensionMessage } from '../../src/shared/rpcProtocol';

describe('WebviewBridge', () => {
  beforeEach(() => {
    vscode.resetAllMocks();
  });

  it('should post typed messages to webview', async () => {
    let postedMsg: any = null;
    const mockPanel: any = {
      webview: {
        postMessage: async (msg: any) => {
          postedMsg = msg;
          return true;
        },
        onDidReceiveMessage: () => ({ dispose: () => {} }),
      },
      onDidDispose: () => ({ dispose: () => {} }),
    };

    const bridge = new WebviewBridge(mockPanel);
    const msg: ExtensionToWebviewMessage = {
      type: 'THEME_CHANGED',
      payload: { theme: 'dark' },
    };

    const result = await bridge.postMessage(msg);
    assert.equal(result, true);
    assert.deepEqual(postedMsg, msg);
  });

  it('should register typed message handlers and dispatch incoming messages', async () => {
    let messageListener: ((msg: any) => Promise<void>) | null = null;
    const mockPanel: any = {
      webview: {
        postMessage: async () => true,
        onDidReceiveMessage: (cb: any) => {
          messageListener = cb;
          return { dispose: () => {} };
        },
      },
      onDidDispose: () => ({ dispose: () => {} }),
    };

    const bridge = new WebviewBridge(mockPanel);

    let receivedPayload: any = null;
    const disposable = bridge.onMessage('DOCUMENT_UPDATED', (payload) => {
      receivedPayload = payload;
    });

    const mockMessage: WebviewToExtensionMessage = {
      type: 'DOCUMENT_UPDATED',
      payload: {
        document: {
          version: '1.0.0',
          name: 'test',
          description: 'desc',
          framework: 'google-adk',
          language: 'python',
          nodes: [],
          edges: [],
        },
        docVersion: 5,
      },
    };

    assert.ok(messageListener);
    if (messageListener) {
      await (messageListener as any)(mockMessage);
      assert.ok(receivedPayload);
      assert.equal(receivedPayload.docVersion, 5);
      assert.equal(receivedPayload.document.name, 'test');
    }

    // Unregister handler
    disposable.dispose();
    receivedPayload = null;

    if (messageListener) {
      await (messageListener as any)(mockMessage);
      assert.equal(receivedPayload, null);
    }
  });

  it('should handle handler exceptions gracefully during dispatch', async () => {
    const mockPanel: any = {
      webview: {
        postMessage: async () => true,
        onDidReceiveMessage: () => ({ dispose: () => {} }),
      },
      onDidDispose: () => ({ dispose: () => {} }),
    };

    const bridge = new WebviewBridge(mockPanel);
    bridge.onMessage('OPEN_SETTINGS', () => {
      throw new Error('Test error in handler');
    });

    await assert.doesNotReject(async () => {
      await bridge.dispatch({ type: 'OPEN_SETTINGS' });
    });
  });

  it('should clean up all subscriptions on dispose', () => {
    let disposeListenerCalled = false;
    const mockPanel: any = {
      webview: {
        postMessage: async () => true,
        onDidReceiveMessage: () => ({
          dispose: () => {
            disposeListenerCalled = true;
          },
        }),
      },
      onDidDispose: () => ({ dispose: () => {} }),
    };

    const bridge = new WebviewBridge(mockPanel);
    bridge.dispose();

    assert.equal(disposeListenerCalled, true);
  });
});
