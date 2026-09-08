/**
 * Unit Tests for Workflow Canvas & Node Topologies
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import dagre from 'dagre';
import { AgentWorkflowNode, AgentWorkflowEdge } from '../../src/shared/types';

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
    const { computeTargetFolder } = await import('../../src/webview/App');

    assert.equal(computeTargetFolder('agents/scratch/scratch-agent.agent'), './scratch_agent/');
    assert.equal(computeTargetFolder('test/agents/myagent.agent'), './myagent/');
    assert.equal(computeTargetFolder('myagent.agent'), './myagent/');
    assert.equal(computeTargetFolder('./myagent.agent'), './myagent/');
    assert.equal(computeTargetFolder('src/workflows/customer_service.agent'), './customer_service/');
    assert.equal(computeTargetFolder('prod\\agents\\myagent.agent'), './myagent/');
    assert.equal(computeTargetFolder('agents/my-complex-agent-flow.agent'), './my_complex_agent_flow/');
    assert.equal(computeTargetFolder(''), './workflow/');
  });
});
