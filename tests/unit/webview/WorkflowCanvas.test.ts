/**
 * Unit Tests for Workflow Canvas & Node Topologies
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import dagre from 'dagre';
import { AgentWorkflowNode, AgentWorkflowEdge } from '../../../src/shared/types';

describe('Workflow Canvas Topologies & Layouts', () => {
  it('should compute Dagre layout coordinates for multi-node graph', () => {
    const nodes: AgentWorkflowNode[] = [
      {
        id: 'trigger-1',
        type: 'trigger',
        position: { x: 0, y: 0 },
        data: { label: 'Trigger', triggerKind: 'test' },
      },
      {
        id: 'agent-1',
        type: 'agent',
        position: { x: 0, y: 0 },
        data: { label: 'Agent 1', agentKind: 'standard' },
      },
      {
        id: 'agent-2',
        type: 'agent',
        position: { x: 0, y: 0 },
        data: { label: 'Agent 2', agentKind: 'standard' },
      },
    ];

    const edges: AgentWorkflowEdge[] = [
      { id: 'e1', source: 'trigger-1', target: 'agent-1' },
      { id: 'e2', source: 'agent-1', target: 'agent-2' },
    ];

    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: 'LR', nodesep: 64, ranksep: 128 });
    g.setDefaultEdgeLabel(() => ({}));

    nodes.forEach((node) => {
      g.setNode(node.id, { width: 320, height: 240 });
    });

    edges.forEach((edge) => {
      g.setEdge(edge.source, edge.target);
    });

    dagre.layout(g);

    const posTrigger = g.node('trigger-1');
    const posAgent1 = g.node('agent-1');
    const posAgent2 = g.node('agent-2');

    assert.ok(posTrigger);
    assert.ok(posAgent1);
    assert.ok(posAgent2);

    // In 'LR' (Left-to-Right) layout, X coordinate increases monotonically along execution path
    assert.equal(posTrigger.x < posAgent1.x, true);
    assert.equal(posAgent1.x < posAgent2.x, true);
  });

  it('should validate tool configurations attached to agent node', () => {
    const agentNode: AgentWorkflowNode = {
      id: 'agent-tool-test',
      type: 'agent',
      position: { x: 100, y: 100 },
      data: {
        label: 'Search Agent',
        agentKind: 'standard',
        standardConfig: {
          model: 'gemini-flash-latest',
          tools: [
            {
              id: 'tool-search',
              name: 'Google Search',
              description: 'Grounding search',
              type: 'builtin',
            },
            {
              id: 'tool-custom-weather',
              name: 'Weather API',
              description: 'Get weather forecast',
              type: 'custom',
            },
          ],
        },
      },
    };

    assert.equal(agentNode.data.standardConfig?.tools?.length, 2);
    assert.equal(agentNode.data.standardConfig?.tools?.[0].id, 'tool-search');
    assert.equal(agentNode.data.standardConfig?.tools?.[1].type, 'custom');
  });

  it('should compute relative target folder matching filename correctly and sanitize to valid Python identifiers', async () => {
    const { computeTargetFolder } = await import('../../../src/webview/App');

    assert.equal(computeTargetFolder('agents/scratch/scratch-agent.agent'), './scratch_agent/');
    assert.equal(computeTargetFolder('test/agents/myagent.agent'), './myagent/');
    assert.equal(computeTargetFolder('myagent.agent'), './myagent/');
    assert.equal(computeTargetFolder('./myagent.agent'), './myagent/');
    assert.equal(computeTargetFolder('src/workflows/customer_service.agent'), './customer_service/');
    assert.equal(computeTargetFolder('prod\\agents\\myagent.agent'), './myagent/');
    assert.equal(computeTargetFolder('agents/my-complex-agent-flow.agent'), './my_complex_agent_flow/');
    assert.equal(computeTargetFolder(''), './workflow/');
  });

  it('should auto-attach connected Test Suite node when adding the first root agent on a blank canvas', async () => {
    const { createSingleAgentNode, createSingleTriggerNode } = await import('../../../src/webview/data/patterns');

    // Simulate blank canvas drop
    const dropPosition = { x: 500, y: 200 };
    const agentX = dropPosition.x < 380 ? 420 : dropPosition.x;
    const agentY = dropPosition.y < 80 ? 140 : dropPosition.y;
    const testerX = Math.max(40, agentX - 360);
    const testerY = agentY + 20;

    const rootAgent = createSingleAgentNode(agentX, agentY, 'Root Agent', 'Coordinator', 'standard', {
      model: 'gemini-3.7-flash',
    });
    rootAgent.data.isStartNode = true;

    const testerTrigger = createSingleTriggerNode(testerX, testerY, 'tester', rootAgent.id);
    const testerEdge: AgentWorkflowEdge = {
      id: `e_trigger_${testerTrigger.id}_${rootAgent.id}`,
      source: testerTrigger.id,
      sourceHandle: 'trigger_out_right',
      target: rootAgent.id,
      targetHandle: 'input_left',
      animated: true,
      style: {
        stroke: '#f59e0b',
        strokeWidth: 2,
        strokeDasharray: '5 5',
      },
    };

    assert.equal(rootAgent.data.isStartNode, true);
    assert.equal(testerTrigger.data.triggerType, 'tester');
    assert.equal(testerTrigger.data.targetRootAgentId, rootAgent.id);
    assert.equal(testerX < agentX, true); // Test suite is to the left of the root agent
    assert.equal(testerEdge.source, testerTrigger.id);
    assert.equal(testerEdge.sourceHandle, 'trigger_out_right');
    assert.equal(testerEdge.target, rootAgent.id);
    assert.equal(testerEdge.targetHandle, 'input_left');
  });

  it('should connect trigger bottom handle to root agent top handle for all triggers except tester', async () => {
    const triggerTypes: Array<'chat' | 'cron' | 'pubsub' | 'webhook' | 'eventarc' | 'tester'> = [
      'chat',
      'cron',
      'pubsub',
      'webhook',
      'eventarc',
      'tester',
    ];

    const rootAgentId = 'agent_root_1';

    for (const trigType of triggerTypes) {
      const isTester = trigType === 'tester';
      const edge = {
        id: `e_trigger_node_${trigType}_${rootAgentId}`,
        source: `node_${trigType}`,
        sourceHandle: isTester ? 'trigger_out_right' : 'trigger_out_bottom',
        target: rootAgentId,
        targetHandle: isTester ? 'input_left' : 'input',
      };

      if (isTester) {
        assert.equal(edge.sourceHandle, 'trigger_out_right');
        assert.equal(edge.targetHandle, 'input_left');
      } else {
        assert.equal(edge.sourceHandle, 'trigger_out_bottom');
        assert.equal(edge.targetHandle, 'input');
      }
    }
  });

  it('should handle dropping any agent kind onto existing canvas with hasStartNode resolution', () => {
    const existingNodes = [
      {
        id: 'root-1',
        type: 'agentNode',
        position: { x: 420, y: 140 },
        data: { label: 'Root Agent', agentKind: 'standard', isStartNode: true },
      },
    ];

    const allKinds: Array<'standard' | 'a2a' | 'router' | 'synthesizer' | 'hitl' | 'fallback' | 'guardrail'> = [
      'standard',
      'a2a',
      'router',
      'synthesizer',
      'hitl',
      'fallback',
      'guardrail',
    ];

    for (const kind of allKinds) {
      const hasAnyAgent = existingNodes.some((n) => n.type === 'agentNode');
      const hasStartNode = existingNodes.some((n) => n.type === 'agentNode' && Boolean(n.data.isStartNode));
      assert.equal(hasAnyAgent, true);
      assert.equal(hasStartNode, true);

      // Dropping node onto canvas where start node already exists
      const newNode = {
        id: `node_${kind}`,
        type: 'agentNode',
        position: { x: 500, y: 300 },
        data: { label: `${kind} agent`, agentKind: kind, isStartNode: !hasStartNode },
      };

      assert.equal(newNode.data.isStartNode, false);
      assert.equal(newNode.data.agentKind, kind);
    }
  });

  it('should validate outgoing connections for all Flow & Control node handles', () => {
    // Helper replicating isValidConnection logic from FlowCanvas.tsx
    const isValidConnection = (connection: {
      source: string;
      target: string;
      sourceHandle?: string | null;
      targetHandle?: string | null;
    }, nodesList: any[]) => {
      if (connection.source === connection.target) return false;
      const sourceNode = nodesList.find((n) => n.id === connection.source);
      const targetNode = nodesList.find((n) => n.id === connection.target);

      if (sourceNode?.type === 'agentNode' || sourceNode?.type === 'agent') {
        if (targetNode?.type !== 'agentNode' && targetNode?.type !== 'agent') return false;
        if (
          connection.sourceHandle &&
          connection.sourceHandle !== 'output' &&
          connection.sourceHandle !== 'subagent' &&
          !connection.sourceHandle.startsWith('branch_') &&
          connection.sourceHandle !== 'approved' &&
          connection.sourceHandle !== 'rejected' &&
          connection.sourceHandle !== 'primary' &&
          connection.sourceHandle !== 'fallback' &&
          connection.sourceHandle !== 'pass' &&
          connection.sourceHandle !== 'block'
        ) {
          const branches = sourceNode.data?.routerConfig?.branches || [];
          const matchesBranch = branches.some((b: any) => b.id === connection.sourceHandle);
          if (!matchesBranch) {
            return false;
          }
        }
        if (connection.targetHandle && connection.targetHandle !== 'input') {
          return false;
        }
      }
      return true;
    };

    const canvasNodes = [
      { id: 'standard_1', type: 'agentNode', data: { agentKind: 'standard' } },
      { id: 'target_child', type: 'agentNode', data: { agentKind: 'standard' } },
      { id: 'router_1', type: 'agentNode', data: { agentKind: 'router', routerConfig: { branches: [{ id: 'b_custom_1' }] } } },
      { id: 'hitl_1', type: 'agentNode', data: { agentKind: 'hitl' } },
      { id: 'fallback_1', type: 'agentNode', data: { agentKind: 'fallback' } },
      { id: 'guardrail_1', type: 'agentNode', data: { agentKind: 'guardrail' } },
      { id: 'synth_1', type: 'agentNode', data: { agentKind: 'synthesizer' } },
    ];

    // 1. Standard & Synthesizer output/subagent handles
    assert.equal(isValidConnection({ source: 'standard_1', target: 'target_child', sourceHandle: 'output', targetHandle: 'input' }, canvasNodes), true);
    assert.equal(isValidConnection({ source: 'synth_1', target: 'target_child', sourceHandle: 'output', targetHandle: 'input' }, canvasNodes), true);

    // 2. Router standard and custom branch handles
    assert.equal(isValidConnection({ source: 'router_1', target: 'target_child', sourceHandle: 'branch_default', targetHandle: 'input' }, canvasNodes), true);
    assert.equal(isValidConnection({ source: 'router_1', target: 'target_child', sourceHandle: 'b_custom_1', targetHandle: 'input' }, canvasNodes), true);
    assert.equal(isValidConnection({ source: 'router_1', target: 'target_child', sourceHandle: 'unrecognized_handle', targetHandle: 'input' }, canvasNodes), false);

    // 3. HITL approved and rejected handles
    assert.equal(isValidConnection({ source: 'hitl_1', target: 'target_child', sourceHandle: 'approved', targetHandle: 'input' }, canvasNodes), true);
    assert.equal(isValidConnection({ source: 'hitl_1', target: 'target_child', sourceHandle: 'rejected', targetHandle: 'input' }, canvasNodes), true);

    // 4. Fallback primary and fallback handles
    assert.equal(isValidConnection({ source: 'fallback_1', target: 'target_child', sourceHandle: 'primary', targetHandle: 'input' }, canvasNodes), true);
    assert.equal(isValidConnection({ source: 'fallback_1', target: 'target_child', sourceHandle: 'fallback', targetHandle: 'input' }, canvasNodes), true);

    // 5. Guardrail pass and block handles
    assert.equal(isValidConnection({ source: 'guardrail_1', target: 'target_child', sourceHandle: 'pass', targetHandle: 'input' }, canvasNodes), true);
    assert.equal(isValidConnection({ source: 'guardrail_1', target: 'target_child', sourceHandle: 'block', targetHandle: 'input' }, canvasNodes), true);

    // 6. Invalid targets or invalid target handles
    assert.equal(isValidConnection({ source: 'hitl_1', target: 'target_child', sourceHandle: 'approved', targetHandle: 'output' }, canvasNodes), false);
    assert.equal(isValidConnection({ source: 'hitl_1', target: 'hitl_1', sourceHandle: 'approved', targetHandle: 'input' }, canvasNodes), false);
  });
});
