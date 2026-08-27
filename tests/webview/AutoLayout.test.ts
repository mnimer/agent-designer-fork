/**
 * Unit Tests for AutoLayout Dagre calculation
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateDagreLayout } from '../../src/webview/components/Canvas/AutoLayout';
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
    // Node 2 should be positioned to the right of Node 1 in LR mode
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
    // Node 2 should be positioned below Node 1 in TB mode
    assert.ok(layouted[1].position.y > layouted[0].position.y);
  });

  it('should preserve existing node data and properties during layout', () => {
    const layouted = calculateDagreLayout(nodes, edges);
    assert.equal(layouted[0].data.label, 'Start Trigger');
    assert.equal(layouted[1].data.label, 'Worker Agent');
  });
});
