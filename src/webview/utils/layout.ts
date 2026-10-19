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
  if (node.type === 'triggerNode' || node.type === 'trigger') {
    const triggerType = (node.data as any)?.triggerType || (node.data as any)?.triggerKind;
    const isTester = triggerType === 'tester' || triggerType === 'test';
    if (isTester) {
      const rawPromptCount =
        (node.data as any)?.config?.testPrompts?.length ||
        (node.data as any)?.config?.testScenarios?.length ||
        3;
      // TriggerNode.tsx renders at most 3 preview prompts (testPrompts.slice(0, 3))
      const promptCount = Math.min(3, rawPromptCount);
      // Header: ~70px, QA Suite Prompts container: ~50px, each prompt item: ~85px, padding/margin: ~30px
      const height = Math.max(420, 150 + promptCount * 90);
      return { width: 340, height };
    }
    const isEventArc = triggerType === 'eventarc';
    if (isEventArc) {
      return { width: 290, height: 220 };
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

  // 3. Classify node categories
  const testerNodes = nodes.filter(
    (n) => n.type === 'triggerNode' && ((n.data as any)?.triggerType === 'tester' || (n.data as any)?.triggerType === 'test')
  );
  const operationalTriggers = nodes.filter(
    (n) => (n.type === 'triggerNode' || n.type === 'trigger') && !testerNodes.some((tn) => tn.id === n.id)
  );

  // Position map for resolved node coordinates
  const positionMap = new Map<string, { x: number; y: number }>();
  const visited = new Set<string>();

  // 4. Identify Left-Inbound incoming nodes (connecting to target's left handle or tester triggers)
  const leftIncomingNodesByTarget = new Map<string, Node<T>[]>();
  const leftInboundNodeIds = new Set<string>();

  nodes.forEach((node) => {
    const outEdges = outgoingEdgesMap.get(node.id) || [];
    const leftEdge = outEdges.find((e) => getHandleSide(e.targetHandle, false) === 'left');
    const isTester = testerNodes.some((tn) => tn.id === node.id);

    if (leftEdge) {
      const targetId = leftEdge.target;
      if (!leftIncomingNodesByTarget.has(targetId)) {
        leftIncomingNodesByTarget.set(targetId, []);
      }
      leftIncomingNodesByTarget.get(targetId)!.push(node);
      leftInboundNodeIds.add(node.id);
    } else if (isTester) {
      const targetId = outEdges[0]?.target;
      if (targetId) {
        if (!leftIncomingNodesByTarget.has(targetId)) {
          leftIncomingNodesByTarget.set(targetId, []);
        }
        leftIncomingNodesByTarget.get(targetId)!.push(node);
        leftInboundNodeIds.add(node.id);
      }
    }
  });

  // 5. Identify Top-Inbound triggers (operational triggers connecting to target's top handle)
  const topIncomingNodesByTarget = new Map<string, Node<T>[]>();
  const topInboundNodeIds = new Set<string>();

  nodes.forEach((node) => {
    if (leftInboundNodeIds.has(node.id)) return;
    const isOperational = operationalTriggers.some((ot) => ot.id === node.id);
    const outEdges = outgoingEdgesMap.get(node.id) || [];
    const topEdge = outEdges.find((e) => getHandleSide(e.targetHandle, false) === 'top');

    if (topEdge && isOperational) {
      const targetId = topEdge.target;
      if (!topIncomingNodesByTarget.has(targetId)) {
        topIncomingNodesByTarget.set(targetId, []);
      }
      topIncomingNodesByTarget.get(targetId)!.push(node);
      topInboundNodeIds.add(node.id);
    } else if (isOperational && outEdges.length > 0) {
      const targetId = outEdges[0].target;
      if (!topIncomingNodesByTarget.has(targetId)) {
        topIncomingNodesByTarget.set(targetId, []);
      }
      topIncomingNodesByTarget.get(targetId)!.push(node);
      topInboundNodeIds.add(node.id);
    }
  });

  // 6. Identify main structural graph nodes (excluding inbound left triggers and top triggers)
  const structuralNodes = nodes.filter(
    (n) => !leftInboundNodeIds.has(n.id) && !topInboundNodeIds.has(n.id)
  );

  // In-degree among structural nodes only
  const structuralInDegreeMap = new Map<string, number>();
  structuralNodes.forEach((n) => structuralInDegreeMap.set(n.id, 0));
  edges.forEach((edge) => {
    if (structuralNodes.some((sn) => sn.id === edge.source) && structuralInDegreeMap.has(edge.target)) {
      structuralInDegreeMap.set(edge.target, (structuralInDegreeMap.get(edge.target) || 0) + 1);
    }
  });

  // Root candidates for structural layout
  const rootCandidates = structuralNodes.filter(
    (n) => (n.data as any)?.isStartNode || (structuralInDegreeMap.get(n.id) || 0) === 0
  );
  if (rootCandidates.length === 0 && structuralNodes.length > 0) {
    rootCandidates.push(structuralNodes[0]);
  }

  // 7. Recursive placement for structural graph elements
  const placeStructuralNodeAndChildren = (nodeId: string, currentX: number, currentY: number) => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    positionMap.set(nodeId, { x: currentX, y: currentY });

    const parentDims = nodeDimensionsMap.get(nodeId) || { width: 340, height: 380 };
    const outEdges = (outgoingEdgesMap.get(nodeId) || []).filter(
      (e) => !leftInboundNodeIds.has(e.target) && !topInboundNodeIds.has(e.target)
    );

    if (outEdges.length === 0) return;

    // Group outgoing edges by source handle side
    const edgesBySide = new Map<HandleSide, Edge[]>();
    outEdges.forEach((edge) => {
      const side = getHandleSide(edge.sourceHandle, true) || 'bottom';
      if (!edgesBySide.has(side)) {
        edgesBySide.set(side, []);
      }
      edgesBySide.get(side)!.push(edge);
    });

    edgesBySide.forEach((groupEdges, sourceSide) => {
      let unplacedEdges = groupEdges.filter((e) => !visited.has(e.target));
      if (unplacedEdges.length === 0) return;

      // Sort unplaced child edges by parent's subAgents list
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

        unplacedEdges = [...unplacedEdges].sort((a, b) => {
          const orderA = subAgentOrderMap.has(a.target) ? subAgentOrderMap.get(a.target)! : 9999;
          const orderB = subAgentOrderMap.has(b.target) ? subAgentOrderMap.get(b.target)! : 9999;
          return orderA - orderB;
        });
      }

      if (sourceSide === 'bottom' || sourceSide === 'top') {
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

          placeStructuralNodeAndChildren(edge.target, childX, childY);
          startX += targetDims.width + HORIZONTAL_GAP;
        });
      } else {
        // Horizontal primary direction (Right or Left)
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

          placeStructuralNodeAndChildren(edge.target, childX, childY);
          startY += targetDims.height + VERTICAL_GAP;
        });
      }
    });
  };

  // 8. Place each root candidate and traverse subtrees
  let currentRootX = 0;
  rootCandidates.forEach((rootNode) => {
    if (!visited.has(rootNode.id)) {
      placeStructuralNodeAndChildren(rootNode.id, currentRootX, 0);
      const rootDims = nodeDimensionsMap.get(rootNode.id) || { width: 340, height: 380 };
      currentRootX += rootDims.width + HORIZONTAL_GAP * 2;
    }
  });

  // Place any remaining unvisited structural nodes
  structuralNodes.forEach((node) => {
    if (!visited.has(node.id)) {
      placeStructuralNodeAndChildren(node.id, currentRootX, 0);
      const dims = nodeDimensionsMap.get(node.id) || { width: 340, height: 380 };
      currentRootX += dims.width + HORIZONTAL_GAP;
    }
  });

  // 9. Place Left-Inbound Nodes strictly to the LEFT of their target nodes
  leftIncomingNodesByTarget.forEach((incomingList, targetId) => {
    const targetPos = positionMap.get(targetId) || { x: 0, y: 0 };
    const targetDims = nodeDimensionsMap.get(targetId) || { width: 340, height: 380 };

    const totalHeight =
      incomingList.reduce((acc, n) => acc + (nodeDimensionsMap.get(n.id)?.height || 380), 0) +
      (incomingList.length - 1) * VERTICAL_GAP;

    let startY = targetPos.y + (targetDims.height - totalHeight) / 2;

    incomingList.forEach((incomingNode) => {
      const dims = nodeDimensionsMap.get(incomingNode.id) || { width: 340, height: 380 };
      const x = targetPos.x - dims.width - HORIZONTAL_GAP;
      const y = startY;

      positionMap.set(incomingNode.id, { x, y });
      visited.add(incomingNode.id);
      startY += dims.height + VERTICAL_GAP;
    });
  });

  // 10. Place Top-Inbound Triggers strictly ABOVE their target nodes
  topIncomingNodesByTarget.forEach((incomingList, targetId) => {
    const targetPos = positionMap.get(targetId) || { x: 0, y: 0 };
    const targetDims = nodeDimensionsMap.get(targetId) || { width: 340, height: 380 };

    const totalWidth =
      incomingList.reduce((acc, n) => acc + (nodeDimensionsMap.get(n.id)?.width || 280), 0) +
      (incomingList.length - 1) * HORIZONTAL_GAP;

    let startX = targetPos.x + (targetDims.width - totalWidth) / 2;

    incomingList.forEach((incomingNode) => {
      const dims = nodeDimensionsMap.get(incomingNode.id) || { width: 280, height: 180 };
      const x = startX;
      const y = targetPos.y - dims.height - VERTICAL_GAP;

      positionMap.set(incomingNode.id, { x, y });
      visited.add(incomingNode.id);
      startX += dims.width + HORIZONTAL_GAP;
    });
  });

  // 11. Place any remaining unvisited nodes
  nodes.forEach((node) => {
    if (!visited.has(node.id)) {
      const dims = nodeDimensionsMap.get(node.id) || { width: 340, height: 380 };
      positionMap.set(node.id, { x: currentRootX, y: 0 });
      visited.add(node.id);
      currentRootX += dims.width + HORIZONTAL_GAP;
    }
  });

  // 12. Anchor-preserving collision relaxation pass
  const placedList = Array.from(positionMap.entries()).map(([id, pos]) => ({
    id,
    x: pos.x,
    y: pos.y,
    ...nodeDimensionsMap.get(id)!,
  }));

  for (let iter = 0; iter < 8; iter++) {
    let hadOverlap = false;
    for (let i = 0; i < placedList.length; i++) {
      for (let j = i + 1; j < placedList.length; j++) {
        const a = placedList[i];
        const b = placedList[j];

        const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
        const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);

        // Only shift if bounding boxes actually intersect
        if (overlapX > 0 && overlapY > 0) {
          hadOverlap = true;
          if (overlapX <= overlapY) {
            if (b.x < a.x) {
              b.x -= Math.max(24, overlapX + 16);
            } else {
              b.x += Math.max(24, overlapX + 16);
            }
          } else {
            if (b.y < a.y) {
              b.y -= Math.max(24, overlapY + 16);
            } else {
              b.y += Math.max(24, overlapY + 16);
            }
          }
        }
      }
    }
    if (!hadOverlap) break;
  }

  // Update position map
  placedList.forEach((item) => {
    positionMap.set(item.id, { x: item.x, y: item.y });
  });

  // 13. Normalize coordinates to canvas origin margin and snap strictly to 8pt grid
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

  const CANVAS_ORIGIN_MARGIN = 48; // 8pt grid aligned margin (multiple of 8)

  const layoutedNodes = nodes.map((node) => {
    const pos = positionMap.get(node.id);
    if (!pos) return node;

    const rawX = pos.x - minX + CANVAS_ORIGIN_MARGIN;
    const rawY = pos.y - minY + CANVAS_ORIGIN_MARGIN;

    // Strict 8pt grid snapping
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
