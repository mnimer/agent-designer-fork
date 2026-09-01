/**
 * Layout Utilities - Auto Layout Engine for Visual Agent Designer
 *
 * Purpose:
 * Computes deterministic, non-overlapping node positions for complex multi-agent workflows
 * using connector-aware directional heuristics, sub-agent ordering enforcement, collision relaxation,
 * and strict 8pt grid snapping.
 *
 * Architectural Decisions:
 * - Author: Mike Nimer <mikenimer@google.com>
 * - Sub-Agent Order Enforcement: Child nodes branching from parent nodes are placed along the perpendicular
 *   axis in the exact sequence specified by the parent's `subAgents` list.
 * - 8pt Grid Alignment: All node coordinates and margins strictly conform to multiples of 8px.
 * - Dynamic Node Sizing: Dynamically measures trigger prompt counts, sub-agent lists, and attached tools
 *   to eliminate clipping and overlap.
 */

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

export type HandleSide = 'top' | 'bottom' | 'left' | 'right';

/**
 * Resolves the physical side of a handle ('top', 'bottom', 'left', 'right')
 * from its identifier and role.
 *
 * @param handleId Handle ID string
 * @param isSource Whether this is a source handle (true) or target handle (false)
 * @returns HandleSide
 */
export function getHandleSide(handleId?: string | null, isSource = true): HandleSide {
  if (!handleId) {
    return isSource ? 'bottom' : 'top';
  }

  const lower = handleId.toLowerCase();

  if (lower.includes('top')) return 'top';
  if (lower.includes('bottom')) return 'bottom';
  if (lower.includes('left')) return 'left';
  if (lower.includes('right')) return 'right';

  // Common handle ID conventions
  if (lower === 'input') return 'top';
  if (lower === 'output' || lower === 'subagent' || lower.startsWith('branch_')) return 'bottom';

  return isSource ? 'bottom' : 'top';
}

/**
 * Calculates the relative coordinate delta (dx, dy) from source node to target node
 * based on the source handle side and target handle side combinations.
 *
 * Rules:
 * 1. Top <-> Bottom: pure vertical arrangement
 * 2. Left <-> Right: pure horizontal arrangement
 * 3. Right -> Top: 2nd node placed to the right and down from the 1st node
 * 4. Right -> Bottom: 2nd node placed to the right and up from the 1st node
 * 5. Left -> Top: 2nd node placed to the left and down from the 1st node
 * 6. Left -> Bottom: 2nd node placed to the left and up from the 1st node
 * 7. Bottom -> Left: 2nd node placed down and to the right
 * 8. Bottom -> Right: 2nd node placed down and to the left
 * 9. Top -> Left: 2nd node placed up and to the right
 * 10. Top -> Right: 2nd node placed up and to the left
 * 11. Staggered same-side connections (Right->Right, Left->Left, etc.)
 *
 * @param sourceSide Side of source handle
 * @param targetSide Side of target handle
 * @param sourceDims Bounding box dimensions of source node
 * @param targetDims Bounding box dimensions of target node
 * @param horizontalGap Horizontal spacing (default 96px, 8pt grid)
 * @param verticalGap Vertical spacing (default 96px, 8pt grid)
 */
export function getConnectorRelativeOffset(
  sourceSide: HandleSide,
  targetSide: HandleSide,
  sourceDims: { width: number; height: number },
  targetDims: { width: number; height: number },
  horizontalGap = 96,
  verticalGap = 96
): { dx: number; dy: number } {
  // Pure Vertical connections
  if (sourceSide === 'bottom' && targetSide === 'top') {
    // Vertical Downwards (source bottom to target top)
    return { dx: 0, dy: sourceDims.height + verticalGap };
  }
  if (sourceSide === 'top' && targetSide === 'bottom') {
    // Vertical Upwards (source top to target bottom)
    return { dx: 0, dy: -(targetDims.height + verticalGap) };
  }

  // Pure Horizontal connections
  if (sourceSide === 'right' && targetSide === 'left') {
    // Horizontal Rightwards (source right to target left)
    return { dx: sourceDims.width + horizontalGap, dy: 0 };
  }
  if (sourceSide === 'left' && targetSide === 'right') {
    // Horizontal Leftwards (source left to target right)
    return { dx: -(targetDims.width + horizontalGap), dy: 0 };
  }

  // Right source combinations
  if (sourceSide === 'right' && targetSide === 'top') {
    // Right and Down
    return {
      dx: sourceDims.width + horizontalGap,
      dy: Math.round((sourceDims.height * 0.75 + verticalGap) / 8) * 8,
    };
  }
  if (sourceSide === 'right' && targetSide === 'bottom') {
    // Right and Up
    return {
      dx: sourceDims.width + horizontalGap,
      dy: -Math.round((targetDims.height * 0.75 + verticalGap) / 8) * 8,
    };
  }
  if (sourceSide === 'right' && targetSide === 'right') {
    // Right and staggered down
    return {
      dx: sourceDims.width + horizontalGap,
      dy: Math.round((sourceDims.height * 0.5 + verticalGap) / 8) * 8,
    };
  }

  // Left source combinations
  if (sourceSide === 'left' && targetSide === 'top') {
    // Left and Down
    return {
      dx: -(targetDims.width + horizontalGap),
      dy: Math.round((sourceDims.height * 0.75 + verticalGap) / 8) * 8,
    };
  }
  if (sourceSide === 'left' && targetSide === 'bottom') {
    // Left and Up
    return {
      dx: -(targetDims.width + horizontalGap),
      dy: -Math.round((targetDims.height * 0.75 + verticalGap) / 8) * 8,
    };
  }
  if (sourceSide === 'left' && targetSide === 'left') {
    // Left and staggered down
    return {
      dx: -(targetDims.width + horizontalGap),
      dy: Math.round((sourceDims.height * 0.5 + verticalGap) / 8) * 8,
    };
  }

  // Bottom source combinations
  if (sourceSide === 'bottom' && targetSide === 'left') {
    // Down and to the right
    return {
      dx: Math.round((sourceDims.width * 0.75 + horizontalGap) / 8) * 8,
      dy: sourceDims.height + verticalGap,
    };
  }
  if (sourceSide === 'bottom' && targetSide === 'right') {
    // Down and to the left
    return {
      dx: -Math.round((targetDims.width * 0.75 + horizontalGap) / 8) * 8,
      dy: sourceDims.height + verticalGap,
    };
  }
  if (sourceSide === 'bottom' && targetSide === 'bottom') {
    // Down and staggered right
    return {
      dx: Math.round((sourceDims.width * 0.5 + horizontalGap) / 8) * 8,
      dy: sourceDims.height + verticalGap,
    };
  }

  // Top source combinations
  if (sourceSide === 'top' && targetSide === 'left') {
    // Up and to the right
    return {
      dx: Math.round((sourceDims.width * 0.75 + horizontalGap) / 8) * 8,
      dy: -(targetDims.height + verticalGap),
    };
  }
  if (sourceSide === 'top' && targetSide === 'right') {
    // Up and to the left
    return {
      dx: -Math.round((targetDims.width * 0.75 + horizontalGap) / 8) * 8,
      dy: -(targetDims.height + verticalGap),
    };
  }
  if (sourceSide === 'top' && targetSide === 'top') {
    // Up and staggered right
    return {
      dx: Math.round((sourceDims.width * 0.5 + horizontalGap) / 8) * 8,
      dy: -(targetDims.height + verticalGap),
    };
  }

  return { dx: sourceDims.width + horizontalGap, dy: 0 };
}

/**
 * Runs smart connector-aware hierarchical layout on all nodes and edges.
 *
 * Algorithm Workflow:
 * 1. Accurately measures dynamic bounding box dimensions for all nodes.
 * 2. Identifies root / entry nodes (Triggers, Root Agents, in-degree 0 nodes).
 * 3. Recursively positions connected nodes based on the physical connector orientations:
 *    - Top-to-Bottom connections -> vertical stacking.
 *    - Left-to-Right connections -> horizontal flow.
 *    - Right-to-Top connections -> rightwards and downwards step.
 *    - Other handle combinations mapped cleanly.
 * 4. Multi-sibling spread: Distributes multiple child nodes branching from the same handle
 *    across the perpendicular axis to prevent overlaps.
 * 5. Collision relaxation pass: Shifts overlapping subtrees to ensure clear margins.
 * 6. 8pt grid snapping: Snaps all (x, y) coordinates to multiples of 8.
 * 7. Normalization: Offsets coordinates to start at standard canvas margin (48, 48).
 *
 * @param nodes Array of workflow nodes
 * @param edges Array of workflow edges
 * @param options Optional layout options
 * @returns Object with repositioned nodes and edges
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

  const HORIZONTAL_GAP = Math.round((parsedOptions.nodeSep || 80) / 8) * 8;
  const VERTICAL_GAP = Math.round((parsedOptions.rankSep || 96) / 8) * 8;

  // 1. Calculate dynamic bounding box dimensions for each node
  const nodeDimensionsMap = new Map<string, { width: number; height: number }>();
  nodes.forEach((node) => {
    nodeDimensionsMap.set(node.id, getNodeDimensions(node));
  });

  // 2. Build adjacency graph and calculate in-degrees
  const inDegreeMap = new Map<string, number>();
  const outgoingEdgesMap = new Map<string, Edge[]>();

  nodes.forEach((node) => {
    inDegreeMap.set(node.id, 0);
    outgoingEdgesMap.set(node.id, []);
  });

  edges.forEach((edge) => {
    if (inDegreeMap.has(edge.target)) {
      inDegreeMap.set(edge.target, (inDegreeMap.get(edge.target) || 0) + 1);
    }
    if (outgoingEdgesMap.has(edge.source)) {
      outgoingEdgesMap.get(edge.source)!.push(edge);
    }
  });

  // 3. Identify root nodes
  // Priority: Tester triggers -> Operational triggers -> Start Agents -> In-degree 0 -> First node
  const testerNodes = nodes.filter(
    (n) => n.type === 'triggerNode' && (n.data as any)?.triggerType === 'tester'
  );
  const operationalTriggers = nodes.filter(
    (n) => n.type === 'triggerNode' && (n.data as any)?.triggerType !== 'tester'
  );
  const startAgents = nodes.filter(
    (n) => (n.data as any)?.isStartNode || (n.type === 'agentNode' && (inDegreeMap.get(n.id) || 0) === 0)
  );

  const rootCandidates: Node<T>[] = [
    ...operationalTriggers,
    ...startAgents,
    ...nodes.filter(
      (n) =>
        (inDegreeMap.get(n.id) || 0) === 0 &&
        !testerNodes.some((tn) => tn.id === n.id) &&
        !operationalTriggers.some((ot) => ot.id === n.id) &&
        !startAgents.some((sa) => sa.id === n.id)
    ),
  ];

  if (rootCandidates.length === 0 && nodes.length > 0) {
    rootCandidates.push(nodes[0]);
  }

  // 4. Position map for resolved node coordinates
  const positionMap = new Map<string, { x: number; y: number }>();
  const visited = new Set<string>();

  // Helper to place a subtree starting at node u with coordinate (x, y)
  const placeNodeAndChildren = (nodeId: string, currentX: number, currentY: number) => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    positionMap.set(nodeId, { x: currentX, y: currentY });

    const parentDims = nodeDimensionsMap.get(nodeId) || { width: 340, height: 380 };
    const outEdges = outgoingEdgesMap.get(nodeId) || [];

    // Group outgoing edges by source handle side
    const edgesBySide = new Map<HandleSide, Edge[]>();
    outEdges.forEach((edge) => {
      const isTesterEdge = testerNodes.some((tn) => tn.id === edge.source);
      const defaultSourceSide = isTesterEdge ? 'right' : 'bottom';
      const side = getHandleSide(edge.sourceHandle, true) || defaultSourceSide;
      if (!edgesBySide.has(side)) {
        edgesBySide.set(side, []);
      }
      edgesBySide.get(side)!.push(edge);
    });

    // Process each group of children
    edgesBySide.forEach((groupEdges, sourceSide) => {
      let unplacedEdges = groupEdges.filter((e) => !visited.has(e.target));
      if (unplacedEdges.length === 0) return;

      // Section: Sort unplaced child edges according to the parent's ordered subAgents list
      // This ensures that Auto Layout strictly reflects the user's configured sub-agent sequence.
      const parentNode = nodes.find((n) => n.id === nodeId);
      const subAgentsList = (parentNode?.data as any)?.subAgents;
      if (Array.isArray(subAgentsList) && subAgentsList.length > 0) {
        const subAgentOrderMap = new Map<string, number>();
        subAgentsList.forEach((sub: any, idx: number) => {
          if (sub && typeof sub === 'object' && sub.agentId) {
            subAgentOrderMap.set(sub.agentId, idx);
          } else if (typeof sub === 'string') {
            subAgentOrderMap.set(sub, idx);
          }
        });

        // Stable sort: targets in subAgents come first ordered by their index, followed by unlisted targets
        unplacedEdges = [...unplacedEdges].sort((a, b) => {
          const orderA = subAgentOrderMap.has(a.target) ? subAgentOrderMap.get(a.target)! : 9999;
          const orderB = subAgentOrderMap.has(b.target) ? subAgentOrderMap.get(b.target)! : 9999;
          return orderA - orderB;
        });
      }

      if (sourceSide === 'bottom' || sourceSide === 'top') {
        // Vertical primary direction -> distribute siblings horizontally across X axis in subagent order
        const childDims = unplacedEdges.map(
          (e) => nodeDimensionsMap.get(e.target) || { width: 340, height: 380 }
        );
        const totalChildrenWidth =
          childDims.reduce((acc, d) => acc + d.width, 0) +
          (unplacedEdges.length - 1) * HORIZONTAL_GAP;

        let startX = currentX + (parentDims.width - totalChildrenWidth) / 2;

        unplacedEdges.forEach((edge, idx) => {
          const targetDims = childDims[idx];
          const targetSide = getHandleSide(edge.targetHandle, false);
          const offset = getConnectorRelativeOffset(
            sourceSide,
            targetSide,
            parentDims,
            targetDims,
            HORIZONTAL_GAP,
            VERTICAL_GAP
          );

          const childX = unplacedEdges.length === 1 && offset.dx !== 0 ? currentX + offset.dx : startX;
          const childY = currentY + offset.dy;

          placeNodeAndChildren(edge.target, childX, childY);
          startX += targetDims.width + HORIZONTAL_GAP;
        });
      } else {
        // Horizontal primary direction (Right or Left) -> distribute siblings vertically across Y axis in subagent order
        const childDims = unplacedEdges.map(
          (e) => nodeDimensionsMap.get(e.target) || { width: 340, height: 380 }
        );
        const totalChildrenHeight =
          childDims.reduce((acc, d) => acc + d.height, 0) +
          (unplacedEdges.length - 1) * VERTICAL_GAP;

        let startY = currentY + (parentDims.height - totalChildrenHeight) / 2;

        unplacedEdges.forEach((edge, idx) => {
          const targetDims = childDims[idx];
          const targetSide = getHandleSide(edge.targetHandle, false);
          const offset = getConnectorRelativeOffset(
            sourceSide,
            targetSide,
            parentDims,
            targetDims,
            HORIZONTAL_GAP,
            VERTICAL_GAP
          );

          const childX = currentX + offset.dx;
          const childY = unplacedEdges.length === 1 && offset.dy !== 0 ? currentY + offset.dy : startY;

          placeNodeAndChildren(edge.target, childX, childY);
          startY += targetDims.height + VERTICAL_GAP;
        });
      }
    });
  };

  // 5. Place each root candidate and traverse subtrees
  let currentRootX = 0;
  let currentRootY = 0;

  rootCandidates.forEach((rootNode) => {
    if (!visited.has(rootNode.id)) {
      placeNodeAndChildren(rootNode.id, currentRootX, currentRootY);
      const rootDims = nodeDimensionsMap.get(rootNode.id) || { width: 340, height: 380 };
      currentRootX += rootDims.width + HORIZONTAL_GAP * 2;
    }
  });

  // Place any remaining unvisited nodes
  nodes.forEach((node) => {
    if (!visited.has(node.id) && !testerNodes.some((tn) => tn.id === node.id)) {
      placeNodeAndChildren(node.id, currentRootX, currentRootY);
      const dims = nodeDimensionsMap.get(node.id) || { width: 340, height: 380 };
      currentRootX += dims.width + HORIZONTAL_GAP;
    }
  });

  // 6. Position QA Tester Trigger nodes cleanly to the left of their target nodes
  testerNodes.forEach((tNode, idx) => {
    const dims = nodeDimensionsMap.get(tNode.id) || { width: 340, height: 420 };
    const targetEdge = edges.find((e) => e.source === tNode.id);
    const targetPos = targetEdge ? positionMap.get(targetEdge.target) : null;

    if (targetPos) {
      positionMap.set(tNode.id, {
        x: targetPos.x - dims.width - HORIZONTAL_GAP - idx * (dims.width + 48),
        y: targetPos.y,
      });
    } else {
      positionMap.set(tNode.id, {
        x: -dims.width - HORIZONTAL_GAP,
        y: idx * (dims.height + VERTICAL_GAP),
      });
    }
    visited.add(tNode.id);
  });

  // 7. Collision relaxation pass (Push overlapping bounding boxes)
  const placedNodesList = Array.from(positionMap.entries()).map(([id, pos]) => ({
    id,
    x: pos.x,
    y: pos.y,
    ...nodeDimensionsMap.get(id)!,
  }));

  for (let iter = 0; iter < 10; iter++) {
    let hadOverlap = false;
    for (let i = 0; i < placedNodesList.length; i++) {
      for (let j = i + 1; j < placedNodesList.length; j++) {
        const a = placedNodesList[i];
        const b = placedNodesList[j];

        const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
        const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);

        if (overlapX > -32 && overlapY > -32) {
          hadOverlap = true;
          // Shift b downwards or rightwards to resolve collision
          if (overlapX > overlapY) {
            b.y += Math.max(48, overlapY + 32);
          } else {
            b.x += Math.max(48, overlapX + 32);
          }
        }
      }
    }
    if (!hadOverlap) break;
  }

  // Write back relaxed positions
  placedNodesList.forEach((item) => {
    positionMap.set(item.id, { x: item.x, y: item.y });
  });

  // 8. Find bounding box minX, minY across all nodes to normalize coordinates
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

  const CANVAS_ORIGIN_MARGIN = 48; // 8pt grid aligned margin

  // 9. Apply normalized and 8pt-grid-snapped layout positions
  const layoutedNodes = nodes.map((node) => {
    const pos = positionMap.get(node.id);
    if (!pos) return node;

    const rawX = pos.x - minX + CANVAS_ORIGIN_MARGIN;
    const rawY = pos.y - minY + CANVAS_ORIGIN_MARGIN;

    // Snap strictly to 8pt grid
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
