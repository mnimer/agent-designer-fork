/**
 * Sample Workflow Utilities Unit Tests
 *
 * Purpose:
 * Validates the core logic of sample workflow instantiation and canvas remapping:
 * 1. Empty sample safety: returns empty arrays without errors.
 * 2. Prefix isolation: scopes node and edge IDs with unique prefixes to prevent collisions.
 * 3. Start node deduplication: enforces single root start node when dropped on existing graphs.
 * 4. Sub-agent reference remapping: keeps sub-agent delegations consistent with new IDs.
 * 5. Router branch remapping: updates conditional routing branch target IDs.
 * 6. Trigger connection remapping: updates targetAgentId and connectedAgentId.
 * 7. Layout compatibility: works seamlessly with layoutPatternAtDropPosition.
 *
 * Architectural Decisions:
 * - Author: Mike Nimer <mikenimer@google.com>
 * - Decision 1: Single Source of Truth on Disk: Samples are loaded dynamically from
 *   disk rather than statically imported TypeScript bundles.
 * - Decision 2: Zero Collision Guarantee: Every drop instantiation produces unique
 *   timestamped prefixes ensuring multiple instances of the same sample can coexist.
 */

import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { createSampleNodesAndEdges } from '../../../src/webview/utils/sampleUtils';
import { layoutPatternAtDropPosition } from '../../../src/webview/utils/layout';
import { SampleWorkflowDefinition, AgentData, TriggerData } from '../../../src/webview/types';
import { Node } from '@xyflow/react';

describe('Sample Workflow Utilities Suite (sampleUtils.ts)', () => {
  const createMockSample = (): SampleWorkflowDefinition => ({
    id: 'mock_enterprise_flow',
    name: 'Mock Enterprise Workflow',
    filename: 'mock_enterprise_flow.agent',
    category: 'Enterprise',
    badge: 'Router + Multi-Agent',
    description: 'Test sample workflow with router, sub-agent, and trigger',
    nodes: [
      {
        id: 'node-trigger-1',
        type: 'triggerNode',
        position: { x: 50, y: 100 },
        data: {
          id: 'node-trigger-1',
          type: 'webhook',
          targetAgentId: 'node-agent-router',
          connectedAgentId: 'node-agent-router',
          targetRootAgentId: 'node-agent-router',
        } as TriggerData,
      },
      {
        id: 'node-agent-router',
        type: 'agentNode',
        position: { x: 250, y: 100 },
        data: {
          id: 'node-agent-router',
          label: 'Router Agent',
          role: 'Triage and dispatch requests',
          model: 'gemini-3.7-flash',
          isStartNode: true,
          tools: [],
          subAgents: [
            { agentId: 'node-agent-specialist', role: 'Domain Specialist' },
          ],
          routerConfig: {
            mode: 'intent',
            branches: [
              {
                id: 'b-1',
                condition: 'technical',
                targetAgentId: 'node-agent-specialist',
              },
            ],
          },
        } as AgentData,
      },
      {
        id: 'node-agent-specialist',
        type: 'agentNode',
        position: { x: 500, y: 100 },
        data: {
          id: 'node-agent-specialist',
          label: 'Specialist Agent',
          role: 'Process specialized requests',
          model: 'gemini-3.7-flash',
          isStartNode: false,
          tools: [],
          subAgents: [],
        } as AgentData,
      },
    ],
    edges: [
      {
        id: 'edge-trigger-router',
        source: 'node-trigger-1',
        target: 'node-agent-router',
        sourceHandle: 'trigger_out_right',
        targetHandle: 'input_left',
      },
      {
        id: 'edge-router-specialist',
        source: 'node-agent-router',
        target: 'node-agent-specialist',
        sourceHandle: 'output',
        targetHandle: 'input',
      },
    ],
  });

  it('should return empty nodes and edges when sample has no nodes or is empty', () => {
    const emptySample: SampleWorkflowDefinition = {
      id: 'empty_sample',
      name: 'Empty',
      filename: 'empty.agent',
      category: 'Test',
      nodes: [],
      edges: [],
    };

    const result = createSampleNodesAndEdges(emptySample, 100, 100, []);
    assert.strictEqual(result.nodes.length, 0);
    assert.strictEqual(result.edges.length, 0);

    const nullNodesSample = { ...emptySample, nodes: undefined as any };
    const nullResult = createSampleNodesAndEdges(nullNodesSample, 100, 100, []);
    assert.strictEqual(nullResult.nodes.length, 0);
    assert.strictEqual(nullResult.edges.length, 0);
  });

  it('should remap all node and edge IDs with unique prefix on empty canvas', () => {
    const sample = createMockSample();
    const { nodes, edges } = createSampleNodesAndEdges(sample, 200, 150, []);

    assert.strictEqual(nodes.length, sample.nodes.length);
    assert.strictEqual(edges.length, sample.edges.length);

    const nodeIds = new Set(nodes.map((n) => n.id));
    assert.strictEqual(nodeIds.size, nodes.length, 'Remapped node IDs must be distinct');

    for (const node of nodes) {
      assert.ok(node.id.startsWith('s_mock_enterprise_flow_'), `Node ID ${node.id} missing prefix`);
      assert.strictEqual((node.data as any).id, node.id, 'Node data.id must match node.id');
    }

    for (const edge of edges) {
      assert.ok(edge.id.startsWith('s_mock_enterprise_flow_'), `Edge ID ${edge.id} missing prefix`);
      assert.ok(nodeIds.has(edge.source), `Edge source ${edge.source} not in remapped nodes`);
      assert.ok(nodeIds.has(edge.target), `Edge target ${edge.target} not in remapped nodes`);
    }
  });

  it('should preserve isStartNode when dropping sample onto empty canvas', () => {
    const sample = createMockSample();
    const { nodes } = createSampleNodesAndEdges(sample, 100, 100, []);

    const routerNode = nodes.find((n) => (n.data as AgentData).label === 'Router Agent');
    assert.ok(routerNode);
    assert.strictEqual((routerNode.data as AgentData).isStartNode, true);

    const specialistNode = nodes.find((n) => (n.data as AgentData).label === 'Specialist Agent');
    assert.ok(specialistNode);
    assert.strictEqual((specialistNode.data as AgentData).isStartNode, false);
  });

  it('should prevent duplicate start nodes when dropping sample onto populated canvas with existing start node', () => {
    const sample = createMockSample();
    const existingCanvasNodes: Node<AgentData>[] = [
      {
        id: 'existing-root-agent',
        type: 'agentNode',
        position: { x: 50, y: 50 },
        data: {
          id: 'existing-root-agent',
          label: 'Canvas Start Agent',
          role: 'Existing primary agent',
          model: 'gemini-3.7-flash',
          isStartNode: true,
          tools: [],
          subAgents: [],
        },
      },
    ];

    const { nodes } = createSampleNodesAndEdges(sample, 300, 300, existingCanvasNodes);
    const agentNodes = nodes.filter((n) => n.type === 'agentNode');

    for (const agent of agentNodes) {
      assert.strictEqual(
        (agent.data as AgentData).isStartNode,
        false,
        `Node ${agent.id} should not be marked as start node when canvas already has one`
      );
    }
  });

  it('should remap sub-agent references and router branch target IDs', () => {
    const sample = createMockSample();
    const { nodes } = createSampleNodesAndEdges(sample, 100, 100, []);

    const routerNode = nodes.find((n) => (n.data as AgentData).label === 'Router Agent')!;
    const specialistNode = nodes.find((n) => (n.data as AgentData).label === 'Specialist Agent')!;
    const routerData = routerNode.data as AgentData;

    assert.ok(routerData.subAgents && routerData.subAgents.length === 1);
    assert.strictEqual(routerData.subAgents[0].agentId, specialistNode.id);

    assert.ok(routerData.routerConfig?.branches && routerData.routerConfig.branches.length === 1);
    assert.strictEqual(routerData.routerConfig.branches[0].targetAgentId, specialistNode.id);
  });

  it('should remap trigger targetAgentId, connectedAgentId, and targetRootAgentId', () => {
    const sample = createMockSample();
    const { nodes } = createSampleNodesAndEdges(sample, 100, 100, []);

    const triggerNode = nodes.find((n) => n.type === 'triggerNode')!;
    const routerNode = nodes.find((n) => (n.data as AgentData).label === 'Router Agent')!;
    const triggerData = triggerNode.data as TriggerData;

    assert.strictEqual(triggerData.targetAgentId, routerNode.id);
    assert.strictEqual(triggerData.connectedAgentId, routerNode.id);
    assert.strictEqual(triggerData.targetRootAgentId, routerNode.id);
  });

  it('should generate distinct prefixes across multiple sequential drops', async () => {
    const sample = createMockSample();
    const drop1 = createSampleNodesAndEdges(sample, 100, 100, []);
    // Ensure timestamp advances slightly or unique string differs
    await new Promise((r) => setTimeout(r, 2));
    const drop2 = createSampleNodesAndEdges(sample, 100, 100, []);

    const drop1NodeIds = new Set(drop1.nodes.map((n) => n.id));
    for (const node of drop2.nodes) {
      assert.ok(!drop1NodeIds.has(node.id), `ID collision between drops: ${node.id}`);
    }
  });

  it('should integrate seamlessly with layoutPatternAtDropPosition', () => {
    const sample = createMockSample();
    const { nodes, edges } = createSampleNodesAndEdges(sample, 400, 250, []);

    const { nodes: layoutedNodes, edges: layoutedEdges } = layoutPatternAtDropPosition(
      nodes,
      edges,
      400,
      250,
      []
    );

    assert.strictEqual(layoutedNodes.length, sample.nodes.length);
    assert.strictEqual(layoutedEdges.length, sample.edges.length);

    for (const node of layoutedNodes) {
      assert.ok(!isNaN(node.position.x), `Node ${node.id} X must be a valid number`);
      assert.ok(!isNaN(node.position.y), `Node ${node.id} Y must be a valid number`);
      assert.ok(node.position.x >= 0, `Node ${node.id} X must be non-negative`);
      assert.ok(node.position.y >= 0, `Node ${node.id} Y must be non-negative`);
    }
  });
});
