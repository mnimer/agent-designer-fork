import dagre from 'dagre';
import { Node, Edge } from '@xyflow/react';

export interface LayoutOptions {
  direction?: 'TB' | 'LR' | 'BT' | 'RL';
  nodeSep?: number;
  rankSep?: number;
  align?: 'UL' | 'UR' | 'DL' | 'DR';
}

const DEFAULT_OPTIONS: LayoutOptions = {
  direction: 'TB',
  nodeSep: 70,
  rankSep: 100,
};

/**
 * Accurately calculates the rendered bounding box for any node based on its contents
 */
export function getNodeDimensions(node: Node<any>): { width: number; height: number } {
  if (node.type === 'triggerNode') {
    const isTester = (node.data as any)?.triggerType === 'tester';
    if (isTester) {
      const promptCount = (node.data as any)?.config?.testPrompts?.length || 3;
      // Header: ~70px, QA Suite Prompts container: ~50px, each prompt item: ~85px, padding/margin: ~30px
      const height = Math.max(420, 150 + promptCount * 90);
      return { width: 340, height };
    }
    return { width: 280, height: 180 };
  }

  // Agent node
  const data = node.data as any;
  const isOrchestrator = data?.isOrchestrator || (data?.subAgents && data.subAgents.length > 0);
  const subAgentCount = data?.subAgents?.length || 0;
  const toolCount = data?.tools?.length || 0;

  // Base agent height (header, prompt, memory state, footer)
  let height = 360;

  if (isOrchestrator) {
    // Sub-agents section with nested rows
    height += 50 + subAgentCount * 36;
  }

  if (toolCount > 0) {
    height += Math.min(80, toolCount * 30);
  }

  return {
    width: 340,
    height: Math.max(380, height),
  };
}

/**
 * Runs Dagre hierarchical graph layout algorithm on all nodes and edges.
 * Positions Test Suite QA triggers to the left of the root agent (connecting right-to-left),
 * operational triggers above the root agent (connecting bottom-to-top), and sub-agents below.
 */
export function getLayoutedElements<T extends Record<string, unknown> = Record<string, unknown>>(
  nodes: Node<T>[],
  edges: Edge[],
  options: LayoutOptions | 'LR' | 'TB' = {}
): { nodes: Node<T>[]; edges: Edge[] } {
  if (nodes.length === 0) return { nodes, edges };

  const parsedOptions: LayoutOptions =
    typeof options === 'string'
      ? { ...DEFAULT_OPTIONS, direction: options }
      : { ...DEFAULT_OPTIONS, ...options };

  // Separate tester triggers from main workflow graph so dagre doesn't force tester into a vertical TB rank
  const testerNodes = nodes.filter(
    (n) => n.type === 'triggerNode' && (n.data as any)?.triggerType === 'tester'
  );
  const mainNodes = nodes.filter(
    (n) => !(n.type === 'triggerNode' && (n.data as any)?.triggerType === 'tester')
  );

  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  dagreGraph.setGraph({
    rankdir: parsedOptions.direction || 'TB',
    nodesep: parsedOptions.nodeSep || 70,
    ranksep: parsedOptions.rankSep || 100,
    align: parsedOptions.align,
  });

  // Calculate dynamic dimensions for each node
  const nodeDimensionsMap = new Map<string, { width: number; height: number }>();
  nodes.forEach((node) => {
    const dims = getNodeDimensions(node);
    nodeDimensionsMap.set(node.id, dims);
  });

  // Register main nodes in Dagre
  mainNodes.forEach((node) => {
    const dims = nodeDimensionsMap.get(node.id) || { width: 340, height: 380 };
    dagreGraph.setNode(node.id, {
      width: dims.width,
      height: dims.height,
    });
  });

  // Register edges between main nodes
  edges.forEach((edge) => {
    const isTesterEdge = testerNodes.some((tn) => tn.id === edge.source);
    if (!isTesterEdge && mainNodes.some((n) => n.id === edge.source) && mainNodes.some((n) => n.id === edge.target)) {
      dagreGraph.setEdge(edge.source, edge.target);
    }
  });

  // Run Dagre Layout on main graph
  if (mainNodes.length > 0) {
    dagre.layout(dagreGraph);
  }

  // Find root agent or first agent node for positioning tester nodes on its left side
  const rootAgentNode = mainNodes.find(
    (n) => n.type === 'agentNode' && (n.data as any)?.isStartNode
  ) || mainNodes.find((n) => n.type === 'agentNode') || mainNodes[0];

  // Temporary position map
  const positionMap = new Map<string, { x: number; y: number }>();

  mainNodes.forEach((node) => {
    const pos = dagreGraph.node(node.id);
    const dims = nodeDimensionsMap.get(node.id) || { width: 340, height: 380 };
    if (pos) {
      positionMap.set(node.id, {
        x: pos.x - dims.width / 2,
        y: pos.y - dims.height / 2,
      });
    }
  });

  // Place tester nodes to the left of their target root agent
  testerNodes.forEach((tNode, idx) => {
    const dims = nodeDimensionsMap.get(tNode.id) || { width: 340, height: 420 };
    const targetEdge = edges.find((e) => e.source === tNode.id);
    const targetNodeId = targetEdge ? targetEdge.target : rootAgentNode?.id;
    const targetPos = targetNodeId ? positionMap.get(targetNodeId) : null;

    if (targetPos) {
      positionMap.set(tNode.id, {
        x: Math.round(targetPos.x - dims.width - 90 - idx * (dims.width + 50)),
        y: Math.round(targetPos.y),
      });
    } else {
      positionMap.set(tNode.id, {
        x: -dims.width - 90,
        y: 0,
      });
    }
  });

  // Find bounding box minX, minY across all nodes to normalize coordinates to start at (0, 0)
  let minX = Infinity;
  let minY = Infinity;

  nodes.forEach((node) => {
    const pos = positionMap.get(node.id);
    if (pos) {
      if (pos.x < minX) minX = pos.x;
      if (pos.y < minY) minY = pos.y;
    }
  });

  if (minX === Infinity) minX = 0;
  if (minY === Infinity) minY = 0;

  // Apply normalized layout positions
  const layoutedNodes = nodes.map((node) => {
    const pos = positionMap.get(node.id);
    if (!pos) return node;

    return {
      ...node,
      position: {
        x: Math.round(pos.x - minX),
        y: Math.round(pos.y - minY),
      },
    };
  });

  return {
    nodes: layoutedNodes,
    edges,
  };
}

/**
 * Checks if a box intersects with any box in an existing set
 */
function isBoxColliding(
  box: { x: number; y: number; w: number; h: number },
  existingBoxes: { x: number; y: number; w: number; h: number }[],
  padding = 30
): boolean {
  return existingBoxes.some((existing) => {
    return (
      box.x < existing.x + existing.w + padding &&
      box.x + box.w + padding > existing.x &&
      box.y < existing.y + existing.h + padding &&
      box.y + box.h + padding > existing.y
    );
  });
}

/**
 * Positions a multi-node pattern at the target drop coordinates,
 * executing auto-layout and collision avoidance so the nodes do not overlap
 * with each other or existing nodes on the canvas.
 */
export function layoutPatternAtDropPosition<T extends Record<string, unknown> = Record<string, unknown>>(
  patternNodes: Node<T>[],
  patternEdges: Edge[],
  dropX: number,
  dropY: number,
  existingNodes: Node<any>[] = []
): { nodes: Node<T>[]; edges: Edge[] } {
  if (patternNodes.length === 0) {
    return { nodes: patternNodes, edges: patternEdges };
  }

  // 1. Run Dagre Auto Layout on the full pattern graph (including Test Suite)
  const { nodes: layouted } = getLayoutedElements(patternNodes, patternEdges, {
    direction: 'TB',
    nodeSep: 70,
    rankSep: 110,
  });

  // 2. Prepare existing nodes bounding boxes
  const existingBoxes = existingNodes.map((n) => {
    const dims = getNodeDimensions(n);
    return {
      x: n.position.x,
      y: n.position.y,
      w: dims.width,
      h: dims.height,
    };
  });

  // 3. Find non-overlapping position
  let targetX = dropX;
  let targetY = dropY;

  if (existingBoxes.length > 0) {
    let hasCollision = true;
    let attempts = 0;
    const maxAttempts = 30;
    const stepOffset = 80;

    while (hasCollision && attempts < maxAttempts) {
      hasCollision = false;

      for (const node of layouted) {
        const dims = getNodeDimensions(node);
        const box = {
          x: targetX + node.position.x,
          y: targetY + node.position.y,
          w: dims.width,
          h: dims.height,
        };

        if (isBoxColliding(box, existingBoxes, 30)) {
          hasCollision = true;
          break;
        }
      }

      if (hasCollision) {
        if (attempts % 2 === 0) {
          targetY += stepOffset;
        } else {
          targetX += stepOffset;
        }
        attempts++;
      }
    }
  }

  // 4. Translate all pattern nodes to the resolved target position
  const resolvedNodes = layouted.map((node) => ({
    ...node,
    position: {
      x: Math.round(targetX + node.position.x),
      y: Math.round(targetY + node.position.y),
    },
  }));

  return { nodes: resolvedNodes, edges: patternEdges };
}
