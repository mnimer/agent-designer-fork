/**
 * WorkflowEdge Component
 *
 * Custom React Flow Edge connecting triggers, primary agents, and sub-agents.
 * Dynamically changes stroke color, dash patterns, and animation pulses based
 * on edge type (sequential vs delegation) and test execution activity.
 *
 * Architectural Decisions:
 * 1. Sub-agent delegation edges rendered with purple dash array.
 * 2. Animated stroke progression during live test execution.
 * 3. Smooth bezier curve path calculation for forward connections.
 * 4. Smart feedback / backward loop routing that sweeps around the node body
 *    instead of passing underneath cards when connecting a child back to a parent.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import React, { memo } from 'react';
import { BaseEdge, getBezierPath, EdgeProps, Position } from '@xyflow/react';

/**
 * Calculates a rounded orthogonal path that routes around the node body
 * when an edge connects upwards or backwards (e.g. child back to parent).
 */
function getBackwardEdgePath({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  r = 16,
}: {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: Position;
  targetPosition: Position;
  r?: number;
}): string | null {
  // Only apply custom loop routing if source is Bottom and target is above/level with source
  if (sourcePosition === Position.Bottom && targetY < sourceY + 40) {
    const bottomY = sourceY + 36;
    const isRight =
      targetPosition === Position.Right ||
      (targetX > sourceX + 60 && targetPosition !== Position.Left);
    const sideX = isRight
      ? Math.max(sourceX + 175, targetX + 45)
      : Math.min(sourceX - 175, targetX - 45);

    if (targetPosition === Position.Left) {
      const effectiveSideX = Math.min(sideX, targetX - 36);
      return (
        `M ${sourceX} ${sourceY} ` +
        `L ${sourceX} ${bottomY - r} ` +
        `Q ${sourceX} ${bottomY} ${sourceX - r} ${bottomY} ` +
        `L ${effectiveSideX + r} ${bottomY} ` +
        `Q ${effectiveSideX} ${bottomY} ${effectiveSideX} ${bottomY - r} ` +
        `L ${effectiveSideX} ${targetY + r} ` +
        `Q ${effectiveSideX} ${targetY} ${effectiveSideX + r} ${targetY} ` +
        `L ${targetX} ${targetY}`
      );
    } else if (targetPosition === Position.Right) {
      const effectiveSideX = Math.max(sideX, targetX + 36);
      return (
        `M ${sourceX} ${sourceY} ` +
        `L ${sourceX} ${bottomY - r} ` +
        `Q ${sourceX} ${bottomY} ${sourceX + r} ${bottomY} ` +
        `L ${effectiveSideX - r} ${bottomY} ` +
        `Q ${effectiveSideX} ${bottomY} ${effectiveSideX} ${bottomY - r} ` +
        `L ${effectiveSideX} ${targetY + r} ` +
        `Q ${effectiveSideX} ${targetY} ${effectiveSideX - r} ${targetY} ` +
        `L ${targetX} ${targetY}`
      );
    } else {
      // Connecting to Top handle from below (loop around and enter from above)
      const topY = targetY - 32;
      const toRight = targetX > sideX;
      return (
        `M ${sourceX} ${sourceY} ` +
        `L ${sourceX} ${bottomY - r} ` +
        `Q ${sourceX} ${bottomY} ${sourceX + (sideX < sourceX ? -r : r)} ${bottomY} ` +
        `L ${sideX + (sideX < sourceX ? r : -r)} ${bottomY} ` +
        `Q ${sideX} ${bottomY} ${sideX} ${bottomY - r} ` +
        `L ${sideX} ${topY + r} ` +
        `Q ${sideX} ${topY} ${sideX + (toRight ? r : -r)} ${topY} ` +
        `L ${targetX + (toRight ? -r : r)} ${topY} ` +
        `Q ${targetX} ${topY} ${targetX} ${topY + r} ` +
        `L ${targetX} ${targetY}`
      );
    }
  }

  return null;
}

const WorkflowEdgeComponent: React.FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  sourceHandleId,
  animated,
}) => {
  // Check if this is a backward/feedback loop edge requiring node-bypass routing
  const backwardPath = getBackwardEdgePath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const [defaultPath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const edgePath = backwardPath || defaultPath;
  const isTriggerEdge =
    sourceHandleId === 'trigger_out_right' || sourceHandleId === 'trigger_out_bottom';

  const resolvedStroke = (style?.stroke as string) || (isTriggerEdge ? '#f59e0b' : '#3b82f6');

  const edgeStyle: React.CSSProperties = {
    strokeWidth: 2,
    strokeDasharray: isTriggerEdge ? '5 5' : undefined,
    ...style,
    stroke: resolvedStroke,
  };

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      style={edgeStyle}
      markerEnd={markerEnd}
      className={animated ? 'animate-pulse' : undefined}
    />
  );
};

export const WorkflowEdge = memo(WorkflowEdgeComponent);
