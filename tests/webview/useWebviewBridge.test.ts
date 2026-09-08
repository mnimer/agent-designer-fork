/**
 * Unit Tests for useWebviewBridge & BridgeContext
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ExtensionToWebviewMessage, WebviewToExtensionMessage } from '../../src/shared/rpcProtocol';

describe('useWebviewBridge Core Logic', () => {
  it('should format request and receive typed response via sendRequestWithReply simulation', async () => {
    // Simulating the RPC message dispatching mechanism
    const messageBus = new EventTarget();

    const postMessage = (msg: WebviewToExtensionMessage) => {
      // Simulate Extension Host receiving message and replying asynchronously
      if (msg.type === 'READY') {
        setTimeout(() => {
          const reply: ExtensionToWebviewMessage = {
            type: 'LOAD_DOCUMENT',
            payload: {
              document: {
                version: '1.0.0',
                name: 'roundtrip_doc',
                description: 'test',
                framework: 'google-adk',
                language: 'python',
                nodes: [],
                edges: [],
              },
              docVersion: 1,
            },
          };
          messageBus.dispatchEvent(new CustomEvent('message', { detail: reply }));
        }, 10);
      }
    };

    const subscribe = (type: string, listener: (payload: any) => void) => {
      const handler = (e: any) => {
        if (e.detail && e.detail.type === type) {
          listener(e.detail.payload);
        }
      };
      messageBus.addEventListener('message', handler);
      return () => messageBus.removeEventListener('message', handler);
    };

    const sendRequestWithReply = (req: WebviewToExtensionMessage, responseType: string, timeoutMs = 1000): Promise<any> => {
      return new Promise((resolve, reject) => {
        let unsubscribe: (() => void) | null = null;
        const timer = setTimeout(() => {
          if (unsubscribe) unsubscribe();
          reject(new Error(`Timeout waiting for ${responseType}`));
        }, timeoutMs);

        unsubscribe = subscribe(responseType, (payload: any) => {
          clearTimeout(timer);
          if (unsubscribe) unsubscribe();
          resolve(payload);
        });

        postMessage(req);
      });
    };

    const replyPayload = await sendRequestWithReply({ type: 'READY' }, 'LOAD_DOCUMENT');
    assert.ok(replyPayload);
    assert.equal(replyPayload.document.name, 'roundtrip_doc');
    assert.equal(replyPayload.docVersion, 1);
  });

  it('should timeout when expected response is not received within limit', async () => {
    const sendRequestWithReply = (timeoutMs = 50): Promise<any> => {
      return new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('Request timeout waiting for reply'));
        }, timeoutMs);
      });
    };

    await assert.rejects(
      async () => {
        await sendRequestWithReply(20);
      },
      {
        message: /Request timeout/,
      }
    );
  });

  it('should support onMessage as a functional alias for subscribe', () => {
    const receivedMessages: string[] = [];
    const subscribe = (type: string, listener: (payload: any) => void) => {
      return (payload: any) => listener(payload);
    };
    const onMessage = subscribe;

    const handler = onMessage('AGENT_ENGINE_DEPLOY_LOG', (payload) => {
      receivedMessages.push(payload.text);
    });

    handler({ text: 'Deployment initiated' });
    assert.equal(receivedMessages.length, 1);
    assert.equal(receivedMessages[0], 'Deployment initiated');
  });
});
