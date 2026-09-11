/**
 * Unit Tests for Interactive Chat Runner & Streaming Protocol
 *
 * This test suite validates the Chat Runner capabilities introduced in TASK-110:
 * - Interactive turn sessions via AgentRunnerManager.sendChatMessage
 * - Server-Sent Events (SSE) streaming token chunking dispatched to WebviewBridge
 * - Fallback non-streaming OpenAI-compatible completion parsing
 * - In-memory chat session history tracking and resetChatSession lifecycle
 * - Error handling and bridge dispatch on network/runner failures
 *
 * Architectural Decisions:
 * - Uses Node.js built-in test runner ('node:test') and strict assertions ('node:assert/strict').
 * - Spins up mock HTTP servers on ephemeral ports to test realistic network protocol flows.
 * - Mocks WebviewBridge to inspect dispatched CHAT_STREAM_CHUNK messages.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as http from 'node:http';
import { AgentRunnerManager } from '../../src/extension/AgentRunnerManager';
import { WebviewBridge } from '../../src/extension/WebviewBridge';
import { ExtensionToWebviewMessage } from '../../src/shared/rpcProtocol';

/**
 * Creates a mock WebviewBridge for recording messages sent from the extension to the webview.
 */
function createMockBridge() {
  const sentMessages: ExtensionToWebviewMessage[] = [];
  return {
    sentMessages,
    bridge: {
      postMessage: (msg: ExtensionToWebviewMessage) => {
        sentMessages.push(msg);
      },
      onMessage: () => {},
      dispose: () => {},
    } as unknown as WebviewBridge,
  };
}

describe('Interactive Chat Runner & Streaming Protocol', () => {
  it('should stream chunks via SSE and send CHAT_STREAM_CHUNK messages to bridge', async () => {
    // 1. Create a mock SSE server streaming 3 chunks then [DONE]
    const serverPort = 9871;
    const sseServer = http.createServer((req, res) => {
      if (req.url === '/v1/chat/completions' && req.method === 'POST') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });

        // Write first token
        res.write('data: {"choices":[{"delta":{"content":"Hello "}}]}\n\n');

        // Write second token
        setTimeout(() => {
          res.write('data: {"choices":[{"delta":{"content":"world! "}}]}\n\n');
        }, 10);

        // Write third token and [DONE]
        setTimeout(() => {
          res.write('data: {"choices":[{"delta":{"content":"How can I help you?"}}]}\n\n');
          res.write('data: [DONE]\n\n');
          res.end();
        }, 20);
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise<void>((resolve) => sseServer.listen(serverPort, '127.0.0.1', () => resolve()));

    try {
      const manager = new AgentRunnerManager('/mock/extension');
      const { bridge, sentMessages } = createMockBridge();

      // Send chat message targeting port 9871
      await manager.sendChatMessage({
        bridge,
        sessionId: 'test-session-1',
        message: 'Hi there',
        port: serverPort,
        streaming: true,
      });

      // Filter for CHAT_STREAM_CHUNK messages
      const chatChunks = sentMessages.filter((m) => m.type === 'CHAT_STREAM_CHUNK');
      assert.ok(chatChunks.length >= 3, `Expected at least 3 chunks, got ${chatChunks.length}`);

      // Verify chunks content
      const concatenatedContent = chatChunks.map((c) => (c as any).payload.chunk).join('');
      assert.ok(concatenatedContent.includes('Hello world! How can I help you?'));

      // Verify that the final chunk has done: true
      const lastPayload = (chatChunks[chatChunks.length - 1] as any).payload;
      assert.equal(lastPayload.done, true);
      assert.equal(lastPayload.sessionId, 'test-session-1');

      // Verify chat history in session manager
      const history = manager.getChatHistory('test-session-1');
      assert.equal(history.length, 2);
      assert.equal(history[0].role, 'user');
      assert.equal(history[0].content, 'Hi there');
      assert.equal(history[1].role, 'assistant');
      assert.ok(history[1].content.includes('Hello world! How can I help you?'));
    } finally {
      sseServer.close();
    }
  });

  it('should handle non-streaming JSON responses and chunk them smoothly to bridge', async () => {
    const serverPort = 9872;
    const jsonServer = http.createServer((req, res) => {
      if (req.url === '/v1/chat/completions' && req.method === 'POST') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            id: 'chatcmpl-mock-1',
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: 'This is a complete mock assistant response for testing.',
                },
              },
            ],
          })
        );
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise<void>((resolve) => jsonServer.listen(serverPort, '127.0.0.1', () => resolve()));

    try {
      const manager = new AgentRunnerManager('/mock/extension');
      const { bridge, sentMessages } = createMockBridge();

      await manager.sendChatMessage({
        bridge,
        sessionId: 'test-session-2',
        message: 'Calculate balance',
        port: serverPort,
        streaming: false,
      });

      const chatChunks = sentMessages.filter((m) => m.type === 'CHAT_STREAM_CHUNK');
      assert.ok(chatChunks.length > 0);

      const concatenatedContent = chatChunks.map((c) => (c as any).payload.chunk).join('');
      assert.ok(concatenatedContent.includes('This is a complete mock assistant response for testing.'));

      const lastPayload = (chatChunks[chatChunks.length - 1] as any).payload;
      assert.equal(lastPayload.done, true);
    } finally {
      jsonServer.close();
    }
  });

  it('should reset session memory when resetChatSession is invoked', async () => {
    const manager = new AgentRunnerManager('/mock/extension');
    const { bridge } = createMockBridge();

    // Manually populate session
    (manager as any).chatSessions.set('session-to-clear', [
      { role: 'user', content: 'Turn 1' },
      { role: 'assistant', content: 'Response 1' },
    ]);

    assert.equal(manager.getChatHistory('session-to-clear').length, 2);

    // Reset this specific session
    manager.resetChatSession('session-to-clear');
    assert.equal(manager.getChatHistory('session-to-clear').length, 0);

    // Populate multiple sessions and reset all
    (manager as any).chatSessions.set('s1', [{ role: 'user', content: 'A' }]);
    (manager as any).chatSessions.set('s2', [{ role: 'user', content: 'B' }]);
    assert.equal((manager as any).chatSessions.size, 2);

    manager.resetChatSession();
    assert.equal((manager as any).chatSessions.size, 0);
  });

  it('should dispatch error chunk and done: true when endpoint is unreachable', async () => {
    const manager = new AgentRunnerManager('/mock/extension');
    const { bridge, sentMessages } = createMockBridge();

    // Unused port that will fail connection immediately
    const unusedPort = 59999;

    await manager.sendChatMessage({
      bridge,
      sessionId: 'error-session',
      message: 'Hello into the void',
      port: unusedPort,
    });

    const errorChunks = sentMessages.filter(
      (m) => m.type === 'CHAT_STREAM_CHUNK' && (m as any).payload?.error
    );

    assert.ok(errorChunks.length >= 1, 'Expected at least one error chunk dispatched');
    const errPayload = (errorChunks[0] as any).payload;
    assert.equal(errPayload.done, true);
    assert.equal(errPayload.sessionId, 'error-session');
    assert.ok(errPayload.error.length > 0);
  });

  it('should return error chunk when executionTarget is remote but deployer is not configured', async () => {
    const manager = new AgentRunnerManager('/mock/extension');
    const { bridge, sentMessages } = createMockBridge();

    await manager.sendChatMessage({
      bridge,
      sessionId: 'remote-no-deployer',
      message: 'Hello remote',
      executionTarget: 'remote',
    });

    const errorChunks = sentMessages.filter(
      (m) => m.type === 'CHAT_STREAM_CHUNK' && (m as any).payload?.error
    );

    assert.ok(errorChunks.length >= 1);
    const errPayload = (errorChunks[0] as any).payload;
    assert.equal(errPayload.done, true);
    assert.equal(errPayload.sessionId, 'remote-no-deployer');
    assert.ok(errPayload.error.includes('deployer is not configured'));
  });

  it('should stream chunks and track remote reasoning engine sessions for executionTarget === remote', async () => {
    const manager = new AgentRunnerManager('/mock/extension');
    const { bridge, sentMessages } = createMockBridge();

    let capturedQuery = '';
    let capturedRemoteSessionId: string | undefined = undefined;

    const mockDeployer: any = {
      testRemoteAgentRuntime: async (options: any) => {
        capturedQuery = options.query;
        capturedRemoteSessionId = options.remoteSessionId;

        // Simulate streaming chunks
        if (options.onChunk) {
          options.onChunk('Hello ');
          options.onChunk('from ');
          options.onChunk('Vertex AI Agent Engine!');
        }

        return {
          success: true,
          response: 'Hello from Vertex AI Agent Engine!',
          remoteSessionId: 'remote-sess-xyz-123',
        };
      },
    };

    manager.setAgentEngineDeployer(mockDeployer);

    // First turn
    await manager.sendChatMessage({
      bridge,
      sessionId: 'remote-session-1',
      message: 'What is your status?',
      executionTarget: 'remote',
      deployedResourceId: 'projects/123/locations/global/reasoningEngines/456',
    });

    assert.equal(capturedQuery, 'What is your status?');
    assert.equal(capturedRemoteSessionId, undefined);

    const streamChunks = sentMessages.filter(
      (m) => m.type === 'CHAT_STREAM_CHUNK' && (m as any).payload?.sessionId === 'remote-session-1'
    );
    assert.ok(streamChunks.length >= 4, `Expected at least 4 chunks, got ${streamChunks.length}`);

    const lastChunk = (streamChunks[streamChunks.length - 1] as any).payload;
    assert.equal(lastChunk.done, true);
    assert.equal(lastChunk.sessionId, 'remote-session-1');

    // History should be stored
    const history = manager.getChatHistory('remote-session-1');
    assert.equal(history.length, 2);
    assert.equal(history[0].role, 'user');
    assert.equal(history[0].content, 'What is your status?');
    assert.equal(history[1].role, 'assistant');
    assert.ok(history[1].content.includes('Vertex AI Agent Engine'));

    // Second turn: should reuse remoteSessionId
    await manager.sendChatMessage({
      bridge,
      sessionId: 'remote-session-1',
      message: 'Follow up question',
      executionTarget: 'remote',
    });

    assert.equal(capturedQuery, 'Follow up question');
    assert.equal(capturedRemoteSessionId, 'remote-sess-xyz-123');

    // Resetting session should clear both memory and remote session
    manager.resetChatSession('remote-session-1');
    assert.equal(manager.getChatHistory('remote-session-1').length, 0);

    // Third turn after reset: remoteSessionId should be undefined again
    await manager.sendChatMessage({
      bridge,
      sessionId: 'remote-session-1',
      message: 'New fresh start',
      executionTarget: 'remote',
    });

    assert.equal(capturedRemoteSessionId, undefined);
  });

  it('should handle remote execution failure gracefully with error chunk', async () => {
    const manager = new AgentRunnerManager('/mock/extension');
    const { bridge, sentMessages } = createMockBridge();

    const mockDeployer: any = {
      testRemoteAgentRuntime: async () => {
        return {
          success: false,
          error: 'Remote reasoning engine 404: Not Found',
        };
      },
    };

    manager.setAgentEngineDeployer(mockDeployer);

    await manager.sendChatMessage({
      bridge,
      sessionId: 'remote-err-session',
      message: 'Hello',
      executionTarget: 'remote',
    });

    const errorChunks = sentMessages.filter(
      (m) => m.type === 'CHAT_STREAM_CHUNK' && (m as any).payload?.error
    );

    assert.ok(errorChunks.length >= 1);
    const errPayload = (errorChunks[0] as any).payload;
    assert.equal(errPayload.done, true);
    assert.ok(errPayload.error.includes('Remote reasoning engine 404: Not Found'));
  });
});
