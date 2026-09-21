/**
 * Unit Tests for AutoLayout Dagre calculation
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateDagreLayout } from '../../../src/webview/components/Canvas/AutoLayout';
import {
  getLayoutedElements,
  getConnectorRelativeOffset,
  getHandleSide,
} from '../../../src/webview/utils/layout';
import { WorkflowNode, WorkflowEdge } from '../../../src/shared/types';

describe('AutoLayout', () => {
  const nodes: WorkflowNode[] = [
    {
      id: 'node-1',
      type: 'trigger',
      position: { x: 0, y: 0 },
      data: { label: 'Start Trigger' },
    },
    {
      id: 'node-2',
      type: 'agent',
      position: { x: 0, y: 0 },
      data: { label: 'Worker Agent' },
    },
  ];

  const edges: WorkflowEdge[] = [
    {
      id: 'edge-1',
      source: 'node-1',
      target: 'node-2',
    },
  ];

  it('should calculate non-overlapping node positions in LR direction', () => {
    const layouted = calculateDagreLayout(nodes, edges, { direction: 'LR' });

    assert.equal(layouted.length, 2);
    assert.ok(layouted[1].position.x > layouted[0].position.x);

    // Verify 8pt grid alignment (coordinates are multiples of 8)
    assert.equal(layouted[0].position.x % 8, 0);
    assert.equal(layouted[0].position.y % 8, 0);
    assert.equal(layouted[1].position.x % 8, 0);
    assert.equal(layouted[1].position.y % 8, 0);
  });

  it('should calculate non-overlapping node positions in TB direction', () => {
    const layouted = calculateDagreLayout(nodes, edges, { direction: 'TB' });

    assert.equal(layouted.length, 2);
    assert.ok(layouted[1].position.y > layouted[0].position.y);
  });

  it('should preserve existing node data and properties during layout', () => {
    const layouted = calculateDagreLayout(nodes, edges);
    assert.equal(layouted[0].data.label, 'Start Trigger');
    assert.equal(layouted[1].data.label, 'Worker Agent');
  });

  describe('Connector-Aware Direction Engine', () => {
    const baseDims = { width: 340, height: 380 };

    it('should resolve handle side names accurately', () => {
      assert.equal(getHandleSide('input'), 'top');
      assert.equal(getHandleSide('input_left'), 'left');
      assert.equal(getHandleSide('output_right'), 'right');
      assert.equal(getHandleSide('output'), 'bottom');
      assert.equal(getHandleSide('subagent'), 'bottom');
      assert.equal(getHandleSide('branch_0'), 'bottom');
      assert.equal(getHandleSide('trigger_out_right'), 'right');
      assert.equal(getHandleSide('trigger_out_bottom'), 'bottom');
    });

    it('should lay out vertically for Top <-> Bottom connections', () => {
      const offset = getConnectorRelativeOffset('bottom', 'top', baseDims, baseDims);
      assert.equal(offset.dx, 0);
      assert.ok(offset.dy > 0); // Target positioned below source
    });

    it('should lay out horizontally for Right <-> Left connections', () => {
      const offset = getConnectorRelativeOffset('right', 'left', baseDims, baseDims);
      assert.ok(offset.dx > 0); // Target positioned right of source
      assert.equal(offset.dy, 0);
    });

    it('should position target right and down for Right -> Top connections', () => {
      const offset = getConnectorRelativeOffset('right', 'top', baseDims, baseDims);
      assert.ok(offset.dx > 0, 'Must be positioned to the right (dx > 0)');
      assert.ok(offset.dy > 0, 'Must be positioned downwards (dy > 0)');
    });

    it('should position target right and up for Right -> Bottom connections', () => {
      const offset = getConnectorRelativeOffset('right', 'bottom', baseDims, baseDims);
      assert.ok(offset.dx > 0, 'Must be positioned to the right (dx > 0)');
      assert.ok(offset.dy < 0, 'Must be positioned upwards (dy < 0)');
    });

    it('should position target left and down for Left -> Top connections', () => {
      const offset = getConnectorRelativeOffset('left', 'top', baseDims, baseDims);
      assert.ok(offset.dx < 0, 'Must be positioned to the left (dx < 0)');
      assert.ok(offset.dy > 0, 'Must be positioned downwards (dy > 0)');
    });

    it('should position target left and up for Left -> Bottom connections', () => {
      const offset = getConnectorRelativeOffset('left', 'bottom', baseDims, baseDims);
      assert.ok(offset.dx < 0, 'Must be positioned to the left (dx < 0)');
      assert.ok(offset.dy < 0, 'Must be positioned upwards (dy < 0)');
    });

    it('should position target down and right for Bottom -> Left connections', () => {
      const offset = getConnectorRelativeOffset('bottom', 'left', baseDims, baseDims);
      assert.ok(offset.dx > 0, 'Must be positioned to the right (dx > 0)');
      assert.ok(offset.dy > 0, 'Must be positioned downwards (dy > 0)');
    });

    it('should position target down and left for Bottom -> Right connections', () => {
      const offset = getConnectorRelativeOffset('bottom', 'right', baseDims, baseDims);
      assert.ok(offset.dx < 0, 'Must be positioned to the left (dx < 0)');
      assert.ok(offset.dy > 0, 'Must be positioned downwards (dy > 0)');
    });

    it('should calculate full graph layout with Right->Top connections and 8pt grid', () => {
      const testNodes: WorkflowNode[] = [
        {
          id: 'agent-1',
          type: 'agentNode',
          position: { x: 0, y: 0 },
          data: { label: 'Primary Agent', isStartNode: true },
        },
        {
          id: 'agent-2',
          type: 'agentNode',
          position: { x: 0, y: 0 },
          data: { label: 'Branch Agent' },
        },
      ];

      const testEdges: WorkflowEdge[] = [
        {
          id: 'e1',
          source: 'agent-1',
          sourceHandle: 'output_right',
          target: 'agent-2',
          targetHandle: 'input',
        },
      ];

      const { nodes: layouted } = getLayoutedElements(testNodes, testEdges);
      assert.equal(layouted.length, 2);

      const a1 = layouted.find((n) => n.id === 'agent-1')!;
      const a2 = layouted.find((n) => n.id === 'agent-2')!;

      // Agent 2 should be to the right and down from Agent 1
      assert.ok(a2.position.x > a1.position.x, 'Agent 2 should be to the right');
      assert.ok(a2.position.y > a1.position.y, 'Agent 2 should be down');

      // Verify strict 8pt grid alignment
      assert.equal(a1.position.x % 8, 0);
      assert.equal(a1.position.y % 8, 0);
      assert.equal(a2.position.x % 8, 0);
      assert.equal(a2.position.y % 8, 0);
    });

    it('should fan out multiple subagent children on bottom connectors horizontally', () => {
      const testNodes: WorkflowNode[] = [
        {
          id: 'orch',
          type: 'agentNode',
          position: { x: 0, y: 0 },
          data: { label: 'Orchestrator', isStartNode: true },
        },
        {
          id: 'sub-1',
          type: 'agentNode',
          position: { x: 0, y: 0 },
          data: { label: 'Subagent 1' },
        },
        {
          id: 'sub-2',
          type: 'agentNode',
          position: { x: 0, y: 0 },
          data: { label: 'Subagent 2' },
        },
      ];

      const testEdges: WorkflowEdge[] = [
        {
          id: 'e1',
          source: 'orch',
          sourceHandle: 'output',
          target: 'sub-1',
          targetHandle: 'input',
        },
        {
          id: 'e2',
          source: 'orch',
          sourceHandle: 'subagent',
          target: 'sub-2',
          targetHandle: 'input',
        },
      ];

      const { nodes: layouted } = getLayoutedElements(testNodes, testEdges);
      const s1 = layouted.find((n) => n.id === 'sub-1')!;
      const s2 = layouted.find((n) => n.id === 'sub-2')!;

      // Both subagents are below the orchestrator and do not overlap horizontally
      assert.notEqual(s1.position.x, s2.position.x);
      assert.ok(Math.abs(s1.position.x - s2.position.x) >= 340);
    });

    it('should place child agents horizontally in the exact order defined in parent subAgents', () => {
      const orchestratorNode: WorkflowNode = {
        id: 'parent-agent',
        type: 'agentNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Parent Coordinator',
          isStartNode: true,
          subAgents: [
            { agentId: 'child-c', name: 'Child Charlie', role: 'Support' },
            { agentId: 'child-a', name: 'Child Alice', role: 'Worker' },
            { agentId: 'child-b', name: 'Child Bob', role: 'Analyst' },
          ],
        },
      };

      const childA: WorkflowNode = {
        id: 'child-a',
        type: 'agentNode',
        position: { x: 0, y: 0 },
        data: { label: 'Child Alice', role: 'Worker' },
      };
      const childB: WorkflowNode = {
        id: 'child-b',
        type: 'agentNode',
        position: { x: 0, y: 0 },
        data: { label: 'Child Bob', role: 'Analyst' },
      };
      const childC: WorkflowNode = {
        id: 'child-c',
        type: 'agentNode',
        position: { x: 0, y: 0 },
        data: { label: 'Child Charlie', role: 'Support' },
      };

      const edges: WorkflowEdge[] = [
        { id: 'e1', source: 'parent-agent', sourceHandle: 'subagent', target: 'child-a', targetHandle: 'input' },
        { id: 'e2', source: 'parent-agent', sourceHandle: 'subagent', target: 'child-b', targetHandle: 'input' },
        { id: 'e3', source: 'parent-agent', sourceHandle: 'subagent', target: 'child-c', targetHandle: 'input' },
      ];

      // Layout with order [child-c, child-a, child-b]
      const layout1 = getLayoutedElements([orchestratorNode, childA, childB, childC], edges);
      const res1_C = layout1.nodes.find((n) => n.id === 'child-c')!;
      const res1_A = layout1.nodes.find((n) => n.id === 'child-a')!;
      const res1_B = layout1.nodes.find((n) => n.id === 'child-b')!;

      // C should be leftmost, then A, then B
      assert.ok(res1_C.position.x < res1_A.position.x, 'Child C should be to the left of Child A');
      assert.ok(res1_A.position.x < res1_B.position.x, 'Child A should be to the left of Child B');

      // Now reverse order in parent subAgents: [child-b, child-a, child-c]
      const reversedParent: WorkflowNode = {
        ...orchestratorNode,
        data: {
          ...orchestratorNode.data,
          subAgents: [
            { agentId: 'child-b', name: 'Child Bob', role: 'Analyst' },
            { agentId: 'child-a', name: 'Child Alice', role: 'Worker' },
            { agentId: 'child-c', name: 'Child Charlie', role: 'Support' },
          ],
        },
      };

      const layout2 = getLayoutedElements([reversedParent, childA, childB, childC], edges);
      const res2_B = layout2.nodes.find((n) => n.id === 'child-b')!;
      const res2_A = layout2.nodes.find((n) => n.id === 'child-a')!;
      const res2_C = layout2.nodes.find((n) => n.id === 'child-c')!;

      // B should now be leftmost, then A, then C
      assert.ok(res2_B.position.x < res2_A.position.x, 'Child B should be to the left of Child A');
      assert.ok(res2_A.position.x < res2_C.position.x, 'Child A should be to the left of Child C');
    });

    it('should position Test Suite node strictly to the left of the Root Agent when connected to left handle', () => {
      const rootAgent: WorkflowNode = {
        id: 'root-agent',
        type: 'agentNode',
        position: { x: 0, y: 0 },
        data: { label: 'Root Coordinator', isStartNode: true },
      };

      const testSuiteNode: WorkflowNode = {
        id: 'test-suite-1',
        type: 'triggerNode',
        position: { x: 0, y: 0 },
        data: { label: 'Test Suite', triggerType: 'tester' },
      };

      const edges: WorkflowEdge[] = [
        {
          id: 'test-edge',
          source: 'test-suite-1',
          sourceHandle: 'trigger_out_right',
          target: 'root-agent',
          targetHandle: 'input_left',
        },
      ];

      const { nodes: layouted } = getLayoutedElements([rootAgent, testSuiteNode], edges);
      const resTester = layouted.find((n) => n.id === 'test-suite-1')!;
      const resRoot = layouted.find((n) => n.id === 'root-agent')!;

      assert.ok(
        resTester.position.x < resRoot.position.x,
        `Test Suite (x: ${resTester.position.x}) must be positioned to the left of Root Agent (x: ${resRoot.position.x})`
      );
      // Both should be 8pt aligned
      assert.equal(resTester.position.x % 8, 0);
      assert.equal(resTester.position.y % 8, 0);
      assert.equal(resRoot.position.x % 8, 0);
      assert.equal(resRoot.position.y % 8, 0);
    });

    it('should position Inbound Triggers above Root Agent and Test Suite to the left with Subagents below', () => {
      const rootAgent: WorkflowNode = {
        id: 'root-agent',
        type: 'agentNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Root Coordinator',
          isStartNode: true,
          subAgents: [{ agentId: 'sub-agent-1', name: 'Sub 1' }],
        },
      };

      const chatTrigger: WorkflowNode = {
        id: 'chat-trigger',
        type: 'triggerNode',
        position: { x: 0, y: 0 },
        data: { label: 'Chat Trigger', triggerType: 'chat' },
      };

      const testSuite: WorkflowNode = {
        id: 'test-suite',
        type: 'triggerNode',
        position: { x: 0, y: 0 },
        data: { label: 'Test Suite', triggerType: 'tester' },
      };

      const subAgent: WorkflowNode = {
        id: 'sub-agent-1',
        type: 'agentNode',
        position: { x: 0, y: 0 },
        data: { label: 'Subagent Worker' },
      };

      const edges: WorkflowEdge[] = [
        // Chat trigger connects bottom -> top
        {
          id: 'e-chat',
          source: 'chat-trigger',
          sourceHandle: 'trigger_out_bottom',
          target: 'root-agent',
          targetHandle: 'input',
        },
        // Test suite connects right -> left
        {
          id: 'e-test',
          source: 'test-suite',
          sourceHandle: 'trigger_out_right',
          target: 'root-agent',
          targetHandle: 'input_left',
        },
        // Root agent delegates down to subagent
        {
          id: 'e-sub',
          source: 'root-agent',
          sourceHandle: 'subagent',
          target: 'sub-agent-1',
          targetHandle: 'input',
        },
      ];

      const { nodes: layouted } = getLayoutedElements([rootAgent, chatTrigger, testSuite, subAgent], edges);
      const resChat = layouted.find((n) => n.id === 'chat-trigger')!;
      const resTest = layouted.find((n) => n.id === 'test-suite')!;
      const resRoot = layouted.find((n) => n.id === 'root-agent')!;
      const resSub = layouted.find((n) => n.id === 'sub-agent-1')!;

      // Chat Trigger must be positioned above Root Agent
      assert.ok(
        resChat.position.y < resRoot.position.y,
        `Chat trigger (y: ${resChat.position.y}) must be above Root Agent (y: ${resRoot.position.y})`
      );

      // Test Suite must be positioned to the left of Root Agent
      assert.ok(
        resTest.position.x < resRoot.position.x,
        `Test Suite (x: ${resTest.position.x}) must be to the left of Root Agent (x: ${resRoot.position.x})`
      );

      // Subagent must be positioned below Root Agent
      assert.ok(
        resSub.position.y > resRoot.position.y,
        `Subagent (y: ${resSub.position.y}) must be below Root Agent (y: ${resRoot.position.y})`
      );
    });

    it('should position any node connected to an agent left handle to the left of that agent', () => {
      const targetAgent: WorkflowNode = {
        id: 'target-agent',
        type: 'agentNode',
        position: { x: 0, y: 0 },
        data: { label: 'Target Agent', isStartNode: true },
      };

      const customLeftNode: WorkflowNode = {
        id: 'custom-left-node',
        type: 'agentNode',
        position: { x: 0, y: 0 },
        data: { label: 'Custom Upstream' },
      };

      const edges: WorkflowEdge[] = [
        {
          id: 'e-custom',
          source: 'custom-left-node',
          sourceHandle: 'output_right',
          target: 'target-agent',
          targetHandle: 'input_left',
        },
      ];

      const { nodes: layouted } = getLayoutedElements([targetAgent, customLeftNode], edges);
      const resCustom = layouted.find((n) => n.id === 'custom-left-node')!;
      const resTarget = layouted.find((n) => n.id === 'target-agent')!;

      assert.ok(
        resCustom.position.x < resTarget.position.x,
        `Custom node connected to left handle (x: ${resCustom.position.x}) must be to the left of Target Agent (x: ${resTarget.position.x})`
      );
    });
  });
});

