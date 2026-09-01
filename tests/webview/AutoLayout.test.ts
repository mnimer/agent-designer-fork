/**
 * Unit Tests for AutoLayout Dagre calculation
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateDagreLayout } from '../../src/webview/components/Canvas/AutoLayout';
import {
  getLayoutedElements,
  getConnectorRelativeOffset,
  getHandleSide,
} from '../../src/webview/utils/layout';
import { WorkflowNode, WorkflowEdge } from '../../src/shared/types';

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
  });
});

