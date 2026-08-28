/**
 * Unit Tests for AgentRunnerManager
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AgentRunnerManager } from '../../src/extension/AgentRunnerManager';
import { AgentWorkflowDocument } from '../../src/shared/types';

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
          model: 'gemini-2.5-flash',
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

  it('should handle assertion failure when expected output is not met', async () => {
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
      bridge: mockBridge,
    });

    const failedUpdate = postedMessages.find(
      (m) => m.type === 'TEST_RESULT_UPDATE' && m.payload.status === 'failed'
    );
    assert.ok(failedUpdate);
    assert.ok(failedUpdate.payload.error.includes('Expected output to contain'));
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

  it('should cancel running processes without error', () => {
    const manager = new AgentRunnerManager('/mock/extension');
    assert.doesNotThrow(() => {
      manager.cancelRun('nonexistent-run-id');
    });
  });
});
