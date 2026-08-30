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
 * 3. Smooth bezier curve path calculation.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import React, { memo } from 'react';
import { BaseEdge, getBezierPath, EdgeProps } from '@xyflow/react';

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
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const isSubAgent = sourceHandleId === 'subagent';

  const edgeStyle: React.CSSProperties = {
    ...style,
    stroke: isSubAgent ? '#a855f7' : '#3b82f6',
    strokeWidth: 2,
    strokeDasharray: isSubAgent ? '5,5' : undefined,
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
