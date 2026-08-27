/**
 * AutoLayout Utility
 *
 * Automated graph hierarchy and topology layout engine based on Dagre.
 * Arranges agent workflow topologies across Left-to-Right (LR) or Top-to-Bottom (TB) directions
 * strictly adhering to the 8pt UI grid coordinate alignment.
 *
 * Job in Application:
 * Computes optimal, non-overlapping 2D coordinates for agent nodes and triggers
 * when the user clicks auto-arrange or loads an un-positioned workflow.
 *
 * Architectural Decisions:
 * 1. Coordinates snapped to multiples of 8 (8pt grid system).
 * 2. Node dimension standard: 320px width x 240px height with 64px horizontal and 128px vertical separation.
 * 3. Preserves node metadata, tools, and custom attributes while recalculating positions.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import dagre from 'dagre';
import { WorkflowNode, WorkflowEdge } from '../../../shared/types';

export type LayoutDirection = 'LR' | 'TB';

export interface LayoutOptions {
  direction?: LayoutDirection;
  nodeWidth?: number;
  nodeHeight?: number;
  nodeSeparation?: number;
  rankSeparation?: number;
}

/**
 * Computes layouted node coordinates using Dagre graph algorithm.
 *
 * @param nodes Array of workflow nodes
 * @param edges Array of workflow edges
 * @param options Optional layout configuration (direction, dimensions, separation)
 * @returns Array of workflow nodes with updated (x, y) coordinates
 */
export function calculateDagreLayout(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  options: LayoutOptions = {}
): WorkflowNode[] {
  const {
    direction = 'LR',
    nodeWidth = 320,
    nodeHeight = 240,
    nodeSeparation = 64,
    rankSeparation = 128,
  } = options;

  // Initialize Dagre directed graph
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: direction,
    nodesep: nodeSeparation,
    ranksep: rankSeparation,
    marginx: 48,
    marginy: 48,
  });
  g.setDefaultEdgeLabel(() => ({}));

  // Register nodes in graph
  nodes.forEach((node) => {
    g.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  // Register edges in graph
  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  // Run Dagre layout calculation
  dagre.layout(g);

  // Map calculated coordinates back to nodes, snapping to 8pt grid
  return nodes.map((node) => {
    const nodeWithPos = g.node(node.id);
    if (!nodeWithPos) return node;

    const rawX = nodeWithPos.x - nodeWidth / 2;
    const rawY = nodeWithPos.y - nodeHeight / 2;

    // Snap to 8pt grid
    const snappedX = Math.round(rawX / 8) * 8;
    const snappedY = Math.round(rawY / 8) * 8;

    return {
      ...node,
      position: {
        x: snappedX,
        y: snappedY,
      },
    };
  });
}
