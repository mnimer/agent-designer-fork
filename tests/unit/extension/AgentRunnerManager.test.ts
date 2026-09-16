/**
 * Unit Tests for AgentRunnerManager
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AgentRunnerManager } from '../../../src/extension/AgentRunnerManager';
import { AgentWorkflowDocument } from '../../../src/shared/types';

describe('AgentRunnerManager', () => {
  const sampleDocument: AgentWorkflowDocument = {
    schemaVersion: '1.0.0',
    name: 'Customer Support Flow',
    description: 'Support automation workflow',
    framework: 'adk',
    language: 'python',
    nodes: [
      {
        id: 'trigger-1',
        type: 'trigger',
        position: { x: 50, y: 100 },
        data: {
          label: 'Customer Inquiry',
          description: 'Inbound message',
          triggerKind: 'test',
          config: {
            testScenarios: [
              {
                id: 'scenario-1',
                name: 'Refund Inquiry',
                inputQuery: 'Can I get a refund for my subscription?',
                expectedOutput: 'refund',
              },
              {
                id: 'scenario-2',
                name: 'Billing Failed Case',
                inputQuery: 'My payment failed yesterday.',
                expectedOutput: 'payment',
              },
            ],
          },
        },
      },
      {
        id: 'agent-1',
        type: 'agent',
        position: { x: 400, y: 100 },
        data: {
          label: 'Support Triage Agent',
          description: 'Handles support requests',
          model: 'gemini-flash-latest',
          systemPrompt: 'You are a helpful customer support agent.',
          temperature: 0.5,
          tools: [
            {
              id: 'tool-db',
              name: 'queryCustomerDb',
              type: 'function',
              description: 'Fetches user details',
            },
          ],
        },
      },
    ],
    edges: [
      {
        id: 'edge-1',
        source: 'trigger-1',
        target: 'agent-1',
      },
    ],
    settings: {},
  };

  it('should extract scenarios correctly from trigger nodes', () => {
    const manager = new AgentRunnerManager('/mock/extension');
    const scenarios = manager.extractScenarios(sampleDocument);

    assert.equal(scenarios.length, 2);
    assert.equal(scenarios[0].id, 'scenario-1');
    assert.equal(scenarios[1].id, 'scenario-2');
  });

  it('should filter scenarios when scenarioIds subset is requested', () => {
    const manager = new AgentRunnerManager('/mock/extension');
    const scenarios = manager.extractScenarios(sampleDocument, ['scenario-2']);

    assert.equal(scenarios.length, 1);
    assert.equal(scenarios[0].id, 'scenario-2');
  });

  it('should generate default fallback scenario when trigger has no scenarios', () => {
    const emptyDoc: AgentWorkflowDocument = {
      schemaVersion: '1.0.0',
      name: 'Empty',
      framework: 'adk',
      language: 'python',
      nodes: [],
      edges: [],
      settings: {},
    };

    const manager = new AgentRunnerManager('/mock/extension');
    const scenarios = manager.extractScenarios(emptyDoc);

    assert.equal(scenarios.length, 1);
    assert.ok(scenarios[0].id);
  });

  it('should execute test scenarios and stream progress over bridge', async () => {
    const manager = new AgentRunnerManager('/mock/extension');
    const postedMessages: any[] = [];

    const mockBridge: any = {
      postMessage: async (msg: any) => {
        postedMessages.push(msg);
      },
    };

    const runId = await manager.runTests({
      document: sampleDocument,
      bridge: mockBridge,
    });

    assert.ok(runId.startsWith('run-'));
    assert.ok(postedMessages.length > 0);

    // Verify presence of EXECUTION_LOG and TEST_RESULT_UPDATE and EXECUTION_COMPLETE
    const hasLog = postedMessages.some((m) => m.type === 'EXECUTION_LOG');
    const hasResultUpdate = postedMessages.some((m) => m.type === 'TEST_RESULT_UPDATE');
    const hasComplete = postedMessages.some((m) => m.type === 'EXECUTION_COMPLETE');

    assert.ok(hasLog);
    assert.ok(hasResultUpdate);
    assert.ok(hasComplete);
  });

  it('should handle offline server gracefully with explicit error message', async () => {
    const docWithFailingAssertion: AgentWorkflowDocument = {
      ...sampleDocument,
      nodes: [
        {
          id: 'trigger-1',
          type: 'trigger',
          position: { x: 50, y: 100 },
          data: {
            label: 'Customer Inquiry',
            description: 'Inbound message',
            triggerKind: 'test',
            config: {
              testScenarios: [
                {
                  id: 'scenario-fail',
                  name: 'Failing Scenario',
                  inputQuery: 'Hello world',
                  expectedOutput: 'EXACT_IMPOSSIBLE_STRING_XYZ_99999',
                },
              ],
            },
          },
        },
      ],
    };

    const manager = new AgentRunnerManager('/mock/extension');
    const postedMessages: any[] = [];
    const mockBridge: any = {
      postMessage: async (msg: any) => {
        postedMessages.push(msg);
      },
    };

    await manager.runTests({
      document: docWithFailingAssertion,
      port: 9999, // Unused port to guarantee offline detection
      targetDirectory: '/mock/nonexistent',
      bridge: mockBridge,
    });

    const failedUpdate = postedMessages.find(
      (m) => m.type === 'TEST_RESULT_UPDATE' && m.payload.status === 'failed'
    );
    assert.ok(failedUpdate);
    assert.ok(failedUpdate.payload.error.includes('Agent server is offline'));
  });

  it('should accept targetDirectory and resolve virtual environment', async () => {
    const manager = new AgentRunnerManager('/mock/extension');
    const postedMessages: any[] = [];
    const mockBridge: any = {
      postMessage: async (msg: any) => {
        postedMessages.push(msg);
      },
    };

    const runId = await manager.runTests({
      document: sampleDocument,
      targetDirectory: '/tmp/agent_test_dir',
      bridge: mockBridge,
    });

    assert.ok(runId.startsWith('run-'));
    const logMessages = postedMessages.filter((m) => m.type === 'EXECUTION_LOG');
    assert.ok(logMessages.length > 0);
  });

  it('should report error status when agent code is not yet generated', async () => {
    const manager = new AgentRunnerManager('/mock/extension');
    const postedMessages: any[] = [];
    const mockBridge: any = {
      postMessage: async (msg: any) => {
        postedMessages.push(msg);
      },
    };

    const emptyTargetDir = `/tmp/empty_agent_${Date.now()}`;
    const runnerId = await manager.startLocalRunner({
      document: sampleDocument,
      targetDirectory: emptyTargetDir,
      port: 8998,
      bridge: mockBridge,
    });

    assert.ok(runnerId.startsWith('local-runner-'));
    assert.ok(postedMessages.some((m) => m.type === 'LOCAL_RUNNER_STATUS' && m.payload.status === 'error'));
  });

  it('should start and stop local runner subprocess when server.py exists', async () => {
    const manager = new AgentRunnerManager('/mock/extension');
    const postedMessages: any[] = [];
    const mockBridge: any = {
      postMessage: async (msg: any) => {
        postedMessages.push(msg);
      },
    };

    const fs = await import('node:fs');
    const path = await import('node:path');
    const tmpDir = `/tmp/test_runner_agent_${Date.now()}`;
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'server.py'),
      'import time\nprint("Server active")\ntime.sleep(2)\n',
      'utf-8'
    );
    fs.writeFileSync(
      path.join(tmpDir, 'requirements.txt'),
      '# Local runner test dependencies\n',
      'utf-8'
    );

    const runnerId = await manager.startLocalRunner({
      document: sampleDocument,
      targetDirectory: tmpDir,
      port: 8999,
      bridge: mockBridge,
    });

    assert.ok(runnerId.startsWith('local-runner-'));
    assert.ok(postedMessages.some((m) => m.type === 'LOCAL_RUNNER_STATUS' && m.payload.status === 'running'));
    assert.ok(postedMessages.some((m) => m.type === 'LOCAL_RUNNER_LOG'));

    assert.doesNotThrow(() => {
      manager.stopLocalRunner(runnerId);
    });

    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('should resolve runner script for server.py, agent.py adapter, and main.py', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const manager = new AgentRunnerManager('/mock/extension');
    const tmpDir = `/tmp/test_runner_resolve_${Date.now()}`;
    fs.mkdirSync(tmpDir, { recursive: true });

    // 1. Initially empty -> null
    assert.equal(manager.resolveRunnerScript(tmpDir), null);

    // 2. Only main.py
    fs.writeFileSync(path.join(tmpDir, 'main.py'), 'print("main")', 'utf-8');
    assert.equal(manager.resolveRunnerScript(tmpDir), path.join(tmpDir, 'main.py'));

    // 3. agent.py (Reasoning Engine / ADK target) -> creates ephemeral adapter
    fs.writeFileSync(path.join(tmpDir, 'agent.py'), 'class AgentReasoningEngine:\n    def query(self, prompt):\n        return "ok"\n', 'utf-8');
    const adapterPath = manager.resolveRunnerScript(tmpDir);
    assert.equal(adapterPath, path.join(tmpDir, '_agent_test_runner.py'));
    assert.ok(fs.existsSync(adapterPath!));
    const adapterContent = fs.readFileSync(adapterPath!, 'utf-8');
    assert.ok(adapterContent.includes("sys.modules.setdefault('google.adk.tools.google_search'"));
    assert.ok(adapterContent.includes("sys.modules.setdefault('google.adk.tools.vertex_ai_search'"));
    assert.ok(adapterContent.includes("from google.adk.apps import App as _AdkApp"));
    assert.ok(adapterContent.includes("def _extract_text_from_event(evt):"));
    assert.ok(adapterContent.includes("async_stream_query"));
    assert.ok(adapterContent.includes("traceback.format_exc()"));
    assert.ok(adapterContent.includes("OTEL_SDK_DISABLED"));
    assert.ok(adapterContent.includes("'Connection', 'close'"));
    assert.ok(adapterContent.includes("close_connection = True"));

    // 4. server.py (Cloud Run FastAPI) -> takes priority
    fs.writeFileSync(path.join(tmpDir, 'server.py'), 'print("server")', 'utf-8');
    assert.equal(manager.resolveRunnerScript(tmpDir), path.join(tmpDir, 'server.py'));

    // 5. Cleanup
    manager.dispose();
    assert.equal(fs.existsSync(adapterPath!), false);

    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('should cancel running processes without error', () => {
    const manager = new AgentRunnerManager('/mock/extension');
    assert.doesNotThrow(() => {
      manager.cancelRun('nonexistent-run-id');
      manager.cancelAll();
      manager.dispose();
    });
  });

  it('should extract scenarios from triggerNode with testPrompts config', () => {
    const manager = new AgentRunnerManager('/mock/extension');
    const docWithPrompts: AgentWorkflowDocument = {
      schemaVersion: '1.0.0',
      name: 'Prompt Test Flow',
      framework: 'adk',
      language: 'python',
      nodes: [
        {
          id: 'trigger-prompt-1',
          type: 'triggerNode' as any,
          position: { x: 50, y: 100 },
          data: {
            label: 'Chat Trigger',
            config: {
              testPrompts: [
                {
                  id: 'tp-1',
                  name: 'Prompt Test 1',
                  prompt: 'Hello agent, what is the status?',
                  expectedOutput: 'status ok',
                },
              ],
            },
          },
        },
      ],
      edges: [],
      settings: {},
    };

    const scenarios = manager.extractScenarios(docWithPrompts);
    assert.equal(scenarios.length, 1);
    assert.equal(scenarios[0].id, 'tp-1');
    assert.equal(scenarios[0].inputQuery, 'Hello agent, what is the status?');
    assert.equal(scenarios[0].expectedOutput, 'status ok');
  });

  it('should run tests and post execution logs and results to bridge', async () => {
    const manager = new AgentRunnerManager('/mock/extension');
    const postedMessages: any[] = [];
    const mockBridge: any = {
      postMessage: async (msg: any) => {
        postedMessages.push(msg);
      },
    };

    const runId = await manager.runTests({
      document: sampleDocument,
      scenarioIds: ['scenario-1'],
      bridge: mockBridge,
    });

    assert.ok(runId.startsWith('run-'));
    assert.ok(postedMessages.some((m) => m.type === 'TEST_RESULT_UPDATE' && m.payload.scenarioId === 'scenario-1'));
    assert.ok(postedMessages.some((m) => m.type === 'EXECUTION_COMPLETE'));
  });

  it('should execute killPort and stopLocalRunner with bridge notification cleanly', async () => {
    const manager = new AgentRunnerManager('/mock/extension');
    const postedMessages: any[] = [];
    const mockBridge: any = {
      postMessage: async (msg: any) => {
        postedMessages.push(msg);
      },
    };

    await assert.doesNotReject(async () => {
      await manager.killPort(8999);
      await manager.killPort(0);
      await manager.killPort(-1);
    });

    await manager.stopLocalRunner(undefined, 8999, mockBridge);
    const stoppedMsg = postedMessages.find((m) => m.type === 'LOCAL_RUNNER_STATUS' && m.payload.status === 'stopped');
    assert.ok(stoppedMsg);
    assert.equal(stoppedMsg.payload.port, 8999);
  });

  it('should sanitize model names and handle structured OpenAI completion responses', async () => {
    const manager = new AgentRunnerManager('/mock/extension');
    const docWithLegacyModel: AgentWorkflowDocument = {
      ...sampleDocument,
      nodes: [
        sampleDocument.nodes[0],
        {
          ...sampleDocument.nodes[1],
          data: {
            ...sampleDocument.nodes[1].data,
            model: 'gemini-2.5-flash',
          },
        },
      ],
    };

    // Override httpPostJson to simulate OpenAI chat completions returning JSON content
    (manager as any).httpPostJson = async (_port: number, _path: string, body: any) => {
      assert.equal(body.model, 'gemini-3.8-flash');
      return {
        ok: true,
        status: 200,
        data: {
          id: 'chatcmpl-test',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: '{"isBusiness":true}',
              },
            },
          ],
        },
        text: '{"id":"chatcmpl-test","choices":[{"message":{"content":"{\\"isBusiness\\":true}"}}]}',
      };
    };

    const postedMessages: any[] = [];
    const mockBridge: any = {
      postMessage: async (msg: any) => {
        postedMessages.push(msg);
      },
    };

    const runId = await manager.runTests({
      document: docWithLegacyModel,
      scenarioIds: ['scenario-1'],
      port: 8000,
      bridge: mockBridge,
    });

    assert.ok(runId.startsWith('run-'));
    const testResult = postedMessages.find(
      (m) => m.type === 'TEST_RESULT_UPDATE' && m.payload.scenarioId === 'scenario-1' && m.payload.status !== 'running'
    );
    assert.ok(testResult);
    assert.equal(testResult.payload.output, '{"isBusiness":true}');
  });

  it('should verify httpGetCheck rejects 404 and accepts 200 status strictly', async () => {
    const manager = new AgentRunnerManager('/mock/extension');
    const http = await import('node:http');

    // Create a dummy HTTP server returning 404 for health
    const server404 = http.createServer((_req, res) => {
      res.writeHead(404);
      res.end('Not Found');
    });

    await new Promise<void>((resolve) => server404.listen(8995, '127.0.0.1', () => resolve()));
    const isHealthy404 = await manager.httpGetCheck(8995, '/health', 300);
    server404.close();

    assert.equal(isHealthy404, false);

    // Create a dummy HTTP server returning 200 for health
    const server200 = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"status":"healthy"}');
    });

    await new Promise<void>((resolve) => server200.listen(8996, '127.0.0.1', () => resolve()));
    const isHealthy200 = await manager.httpGetCheck(8996, '/health', 300);
    server200.close();

    assert.equal(isHealthy200, true);
  });

  it('should skip empty body responses and connect to valid candidate response in httpPostJson', async () => {
    const manager = new AgentRunnerManager('/mock/extension');
    const http = await import('node:http');

    // Server returning valid chat completions JSON
    const agentServer = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id: 'chatcmpl-test-123',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: '{"isBusiness": true}' },
            finish_reason: 'stop',
          },
        ],
      }));
    });

    await new Promise<void>((resolve) => agentServer.listen(8997, '127.0.0.1', () => resolve()));

    const result = await manager.httpPostJson(
      8997,
      '/v1/chat/completions',
      { model: 'gemini-flash-latest', messages: [{ role: 'user', content: '1600 Amphitheatre' }] },
      2000
    );

    agentServer.close();

    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
    assert.ok(result.text.includes('isBusiness'));
    assert.equal(result.data.choices[0].message.content, '{"isBusiness": true}');
  });

  it('should route test execution to remote reasoning engine when executionTarget is remote', async () => {
    let remoteCalledWith: any = null;
    const mockDeployer: any = {
      testRemoteAgentRuntime: async (opts: any) => {
        remoteCalledWith = opts;
        return {
          success: true,
          response: 'We can issue a full refund for your account.',
        };
      },
    };

    const manager = new AgentRunnerManager('/mock/extension', undefined, mockDeployer);
    const postedMessages: any[] = [];
    const mockBridge: any = {
      postMessage: async (msg: any) => {
        postedMessages.push(msg);
      },
    };

    const runId = await manager.runTests({
      document: sampleDocument,
      scenarioIds: ['scenario-1'],
      executionTarget: 'remote',
      deployedResourceId: 'projects/test-proj/locations/us-central1/reasoningEngines/12345678',
      bridge: mockBridge,
    });

    assert.ok(runId.startsWith('run-'));
    assert.ok(remoteCalledWith);
    assert.equal(remoteCalledWith.query, 'Can I get a refund for my subscription?');

    const updateMsg = postedMessages.find((m) => m.type === 'TEST_RESULT_UPDATE' && m.payload.status === 'passed');
    assert.ok(updateMsg, 'Should post passed test result');
    assert.equal(updateMsg.payload.output, 'We can issue a full refund for your account.');
  });

  it('should isolate turn sessions with unique session IDs and headers across scenarios', async () => {
    const http = await import('node:http');
    const receivedRequests: Array<{ url: string; headers: any; body: any }> = [];

    const mockPort = 9812;
    const testServer = http.createServer((req, res) => {
      let bodyStr = '';
      req.on('data', (c) => {
        bodyStr += c;
      });
      req.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(bodyStr);
        } catch {}
        receivedRequests.push({
          url: req.url || '',
          headers: req.headers,
          body: parsed,
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: 'Isolated response content',
                },
              },
            ],
          })
        );
      });
    });

    await new Promise<void>((resolve) => testServer.listen(mockPort, '127.0.0.1', () => resolve()));

    try {
      const manager = new AgentRunnerManager('/mock/extension');
      const postedMessages: any[] = [];
      const mockBridge: any = {
        postMessage: async (msg: any) => {
          postedMessages.push(msg);
        },
      };

      await manager.runTests({
        document: sampleDocument,
        port: mockPort,
        bridge: mockBridge,
      });

      assert.equal(receivedRequests.length, 2, 'Should execute both test scenarios');

      // Verify discrete turn session IDs in payload and headers
      const firstReq = receivedRequests[0];
      const secondReq = receivedRequests[1];

      assert.ok(firstReq.body.session_id.startsWith('test-session-scenario-1'));
      assert.ok(firstReq.body.thread_id.startsWith('test-session-scenario-1'));
      assert.equal(firstReq.headers['x-session-id'], firstReq.body.session_id);

      assert.ok(secondReq.body.session_id.startsWith('test-session-scenario-2'));
      assert.ok(secondReq.body.thread_id.startsWith('test-session-scenario-2'));
      assert.equal(secondReq.headers['x-session-id'], secondReq.body.session_id);

      // Verify sessions are distinct
      assert.notEqual(firstReq.body.session_id, secondReq.body.session_id);

      // Verify session isolation logs sent to bridge
      const sessionLogs = postedMessages.filter(
        (m) => m.type === 'EXECUTION_LOG' && m.payload.message.includes('[Turn Session Isolated]')
      );
      assert.equal(sessionLogs.length, 2);
    } finally {
      await new Promise<void>((resolve) => testServer.close(() => resolve()));
    }
  });

  it('should extract tool_calls from completion response and emit discrete trace steps to bridge', async () => {
    const http = await import('node:http');
    const mockPort = 9813;

    const testServer = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'Found user details.',
                tool_calls: [
                  {
                    id: 'call_lookup_101',
                    type: 'function',
                    function: {
                      name: 'queryCustomerDb',
                      arguments: '{"userId": "usr_99"}',
                    },
                  },
                ],
              },
            },
          ],
        })
      );
    });

    await new Promise<void>((resolve) => testServer.listen(mockPort, '127.0.0.1', () => resolve()));

    try {
      const manager = new AgentRunnerManager('/mock/extension');
      const postedMessages: any[] = [];
      const mockBridge: any = {
        postMessage: async (msg: any) => {
          postedMessages.push(msg);
        },
      };

      await manager.runTests({
        document: sampleDocument,
        scenarioIds: ['scenario-1'],
        port: mockPort,
        bridge: mockBridge,
      });

      const toolCallLog = postedMessages.find(
        (m) =>
          m.type === 'EXECUTION_LOG' &&
          m.payload.message.includes('[Tool Call] queryCustomerDb({"userId": "usr_99"})')
      );

      assert.ok(toolCallLog, 'Should emit discrete tool call log event');
      assert.equal(toolCallLog.payload.stepId, 'call_lookup_101');
      assert.equal(toolCallLog.payload.agentId, 'Support Triage Agent');
    } finally {
      await new Promise<void>((resolve) => testServer.close(() => resolve()));
    }
  });

  it('should extract reasoning_content and custom traces from response and emit them to bridge', async () => {
    const http = await import('node:http');
    const mockPort = 9814;

    const testServer = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'Refunding subscription now.',
                reasoning_content: 'User subscription qualifies for full refund under policy §4.2.',
              },
            },
          ],
          traces: [
            {
              agentId: 'PolicyChecker',
              stepId: 'step_policy_verify',
              message: 'Verified refund policy eligibility',
            },
          ],
        })
      );
    });

    await new Promise<void>((resolve) => testServer.listen(mockPort, '127.0.0.1', () => resolve()));

    try {
      const manager = new AgentRunnerManager('/mock/extension');
      const postedMessages: any[] = [];
      const mockBridge: any = {
        postMessage: async (msg: any) => {
          postedMessages.push(msg);
        },
      };

      await manager.runTests({
        document: sampleDocument,
        scenarioIds: ['scenario-1'],
        port: mockPort,
        bridge: mockBridge,
      });

      const reasoningLog = postedMessages.find(
        (m) =>
          m.type === 'EXECUTION_LOG' &&
          m.payload.message.includes('[Reasoning Step] User subscription qualifies for full refund')
      );
      assert.ok(reasoningLog, 'Should emit reasoning step to bridge');

      const traceLog = postedMessages.find(
        (m) =>
          m.type === 'EXECUTION_LOG' &&
          m.payload.message.includes('[Agent Trace] Verified refund policy eligibility')
      );
      assert.ok(traceLog, 'Should emit custom agent trace to bridge');
      assert.equal(traceLog.payload.agentId, 'PolicyChecker');
    } finally {
      await new Promise<void>((resolve) => testServer.close(() => resolve()));
    }
  });

  it('should cancel in-flight HTTP scenario runs via AbortController when cancelRun is called', async () => {
    const http = await import('node:http');
    const mockPort = 9815;

    let serverClosed = false;
    const testServer = http.createServer((req, res) => {
      // Intentionally hold response open to simulate a slow or hanging LLM execution
      const timer = setTimeout(() => {
        if (!serverClosed) {
          try {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ choices: [{ message: { content: 'Late response' } }] }));
          } catch {}
        }
      }, 5000);

      req.on('close', () => {
        clearTimeout(timer);
      });
    });

    await new Promise<void>((resolve) => testServer.listen(mockPort, '127.0.0.1', () => resolve()));

    try {
      const manager = new AgentRunnerManager('/mock/extension');
      const postedMessages: any[] = [];
      const mockBridge: any = {
        postMessage: async (msg: any) => {
          postedMessages.push(msg);
        },
      };

      // Launch runTests asynchronously
      const runPromise = manager.runTests({
        document: sampleDocument,
        scenarioIds: ['scenario-1'],
        port: mockPort,
        bridge: mockBridge,
      });

      // Allow request to start, then trigger cancellation
      await new Promise((r) => setTimeout(r, 60));

      // Inspect started runId from logs
      const startLog = postedMessages.find((m) => m.type === 'EXECUTION_LOG' && m.payload.runId);
      assert.ok(startLog, 'Run should have started');
      const runId = startLog.payload.runId;

      manager.cancelRun(runId);

      await runPromise;

      const failedResult = postedMessages.find(
        (m) =>
          m.type === 'TEST_RESULT_UPDATE' &&
          m.payload.status === 'failed' &&
          m.payload.error.includes('Execution cancelled by user.')
      );
      assert.ok(failedResult, 'Scenario should be recorded as cancelled by user');
    } finally {
      serverClosed = true;
      await new Promise<void>((resolve) => testServer.close(() => resolve()));
    }
  });

  it('should report granular latency metrics for agent response', async () => {
    const http = await import('node:http');
    const mockPort = 9816;

    const testServer = http.createServer((req, res) => {
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            choices: [{ message: { role: 'assistant', content: 'Here is your refund confirmation.' } }],
          })
        );
      }, 30);
    });

    await new Promise<void>((resolve) => testServer.listen(mockPort, '127.0.0.1', () => resolve()));

    try {
      const manager = new AgentRunnerManager('/mock/extension');
      const postedMessages: any[] = [];
      const mockBridge: any = {
        postMessage: async (msg: any) => {
          postedMessages.push(msg);
        },
      };

      await manager.runTests({
        document: sampleDocument,
        scenarioIds: ['scenario-1'],
        port: mockPort,
        bridge: mockBridge,
      });

      const latencyLog = postedMessages.find(
        (m) => m.type === 'EXECUTION_LOG' && m.payload.message.includes('[Latency Metrics]')
      );
      assert.ok(latencyLog, 'Should emit latency metrics log');
      assert.ok(latencyLog.payload.message.includes('Agent response:'));
    } finally {
      await new Promise<void>((resolve) => testServer.close(() => resolve()));
    }
  });

  it('should unpack AggregateError into readable diagnostic message in formatErrorMessage', () => {
    const manager = new AgentRunnerManager('/mock/extension');
    const err1 = new Error('connect ECONNREFUSED ::1:8000');
    const err2 = new Error('connect ECONNREFUSED 127.0.0.1:8000');
    const agg = new AggregateError([err1, err2], '');

    const formatted = manager.formatErrorMessage(agg);
    assert.ok(formatted.includes('ECONNREFUSED ::1:8000'));
    assert.ok(formatted.includes('ECONNREFUSED 127.0.0.1:8000'));
  });

  it('should sanitize localhost serviceUrl when dispatching remote test execution', async () => {
    const manager = new AgentRunnerManager('/mock/extension');
    let capturedOptions: any = null;

    manager.setAgentEngineDeployer({
      testRemoteAgentRuntime: async (opts: any) => {
        capturedOptions = opts;
        return {
          success: true,
          response: 'Remote reasoning engine response',
        };
      },
    } as any);

    const docWithLocalUrl: any = {
      ...sampleDocument,
      deployment: {
        serviceUrl: 'http://localhost:8000',
        deployedResourceId: 'projects/proj/locations/us-central1/reasoningEngines/1234567890',
      },
    };

    const postedMessages: any[] = [];
    const mockBridge: any = {
      postMessage: async (msg: any) => {
        postedMessages.push(msg);
      },
    };

    await manager.runTests({
      document: docWithLocalUrl,
      scenarioIds: ['scenario-1'],
      executionTarget: 'remote',
      bridge: mockBridge,
    });

    assert.ok(capturedOptions, 'testRemoteAgentRuntime must be called');
    assert.equal(capturedOptions.serviceUrl, undefined, 'Localhost serviceUrl must be filtered out');
    assert.equal(
      capturedOptions.remoteRuntimeId,
      'projects/proj/locations/us-central1/reasoningEngines/1234567890'
    );
    assert.ok(capturedOptions.abortSignal, 'AbortSignal must be provided');
  });

  it('should probe health and post LOCAL_RUNNER_STATUS via sendStatus', async () => {
    const manager = new AgentRunnerManager('/mock/extension/path');
    const postedMessages: any[] = [];
    const mockBridge: any = {
      postMessage: async (msg: any) => {
        postedMessages.push(msg);
      },
    };

    // Case 1: Probes health and finds runner active
    (manager as any).healthCheck.httpGetCheck = async () => true;
    await manager.sendStatus(mockBridge, 9090);

    assert.equal(postedMessages.length, 1);
    assert.equal(postedMessages[0].type, 'LOCAL_RUNNER_STATUS');
    assert.equal(postedMessages[0].payload.status, 'running');
    assert.equal(postedMessages[0].payload.port, 9090);
    assert.equal(postedMessages[0].payload.serviceUrl, 'http://127.0.0.1:9090/v1/chat/completions');

    // Case 2: Probes health and finds runner inactive
    (manager as any).healthCheck.httpGetCheck = async () => false;
    await manager.sendStatus(mockBridge, 9090);

    assert.equal(postedMessages.length, 2);
    assert.equal(postedMessages[1].type, 'LOCAL_RUNNER_STATUS');
    assert.equal(postedMessages[1].payload.status, 'idle');
    assert.equal(postedMessages[1].payload.serviceUrl, undefined);
  });
});





