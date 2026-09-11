/**
 * WorkflowCanvas Component
 *
 * Core interactive graph canvas using @xyflow/react.
 * Integrates custom nodes (AgentNode, TriggerNode) and custom edges (WorkflowEdge),
 * visual dot-grid background, MiniMap, interactive controls, and snap-to-grid alignment.
 *
 * Architectural Decisions:
 * 1. Memoized nodeTypes and edgeTypes to prevent React Flow re-mounting thrash.
 * 2. 8px snap-to-grid spacing conforming to the project UI grid standard.
 * 3. Bridges node selection and interaction to parent state and property inspector drawer.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import React, { useMemo, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  ReactFlowProvider,
  Node,
  Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { TriggerNode } from './nodes/TriggerNode';
import { AgentNode } from './nodes/AgentNode';
import { WorkflowEdge } from './edges/WorkflowEdge';
import { CanvasControls } from './CanvasControls';
import { CanvasToolbar } from './CanvasToolbar';
import { getLayoutedElements } from '../../utils/layout';
import {
  WorkflowNode,
  WorkflowEdge as AgentWorkflowEdge,
} from '../../../shared/types';

export interface WorkflowCanvasProps {
  nodes: WorkflowNode[];
  edges: AgentWorkflowEdge[];
  selectedNodeId: string | null;
  onNodesChange: (changes: any[]) => void;
  onEdgesChange: (changes: any[]) => void;
  onConnect: (connection: any) => void;
  onSelectNode: (nodeId: string | null) => void;
  onAddAgent: () => void;
  onAddTrigger: () => void;
  onEditNode?: (nodeId: string) => void;
  onDeleteNode?: (nodeId: string) => void;
  onAddTool?: (agentId: string) => void;
  onRemoveTool?: (agentId: string, toolId: string) => void;
  onLayoutChange: (nodes: WorkflowNode[]) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  showMiniMap?: boolean;
}

// Static custom node and edge types defined outside component to preserve React Flow store
const NODE_TYPES = {
  trigger: TriggerNode,
  agent: AgentNode,
};

const EDGE_TYPES = {
  default: WorkflowEdge,
  workflow: WorkflowEdge,
};

export const WorkflowCanvas: React.FC<WorkflowCanvasProps> = ({
  nodes,
  edges,
  selectedNodeId,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onSelectNode,
  onAddAgent,
  onAddTrigger,
  onEditNode,
  onDeleteNode,
  onAddTool,
  onRemoveTool,
  onLayoutChange,
}) => {
  // Augment nodes with interactive event handlers
  const augmentedNodes = useMemo(() => {
    return nodes.map((node) => ({
      ...node,
      selected: node.id === selectedNodeId,
      data: {
        ...node.data,
        onEdit: onEditNode,
        onDelete: onDeleteNode,
        onAddTool: onAddTool,
        onRemoveTool: onRemoveTool,
      },
    })) as Node[];
  }, [nodes, selectedNodeId, onEditNode, onDeleteNode, onAddTool, onRemoveTool]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onSelectNode(node.id);
    },
    [onSelectNode]
  );

  const handlePaneClick = useCallback(() => {
    onSelectNode(null);
  }, [onSelectNode]);

  return (
    <div
      style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      className="bg-[#1e1e1e] overflow-hidden select-none"
    >
      <ReactFlow
        nodes={augmentedNodes}
        edges={edges as Edge[]}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        snapToGrid={true}
        snapGrid={[8, 8]}
        minZoom={0.2}
        maxZoom={2.0}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        className="bg-[#1e1e1e]"
        style={{ width: '100%', height: '100%' }}
      >
        {/* Background grid */}
        <Background
          variant={BackgroundVariant.Dots}
          gap={16}
          size={1.5}
          color="#30363d"
        />

        {/* Floating Canvas Action Toolbar */}
        <CanvasControls
          onAddAgent={onAddAgent}
          onAddTrigger={onAddTrigger}
          nodes={nodes}
          edges={edges}
          onLayoutChange={onLayoutChange}
        />

        {/* Floating Canvas Action Toolbar (Top-Right) */}
        <CanvasToolbar
          canUndo={canUndo || false}
          canRedo={canRedo || false}
          onUndo={onUndo || (() => {})}
          onRedo={onRedo || (() => {})}
          onAutoLayout={() => {
            const layouted = getLayoutedElements(nodes, edges);
            onLayoutChange(layouted.nodes as WorkflowNode[]);
          }}
          showMiniMap={showMiniMap !== false}
        />
      </ReactFlow>
    </div>
  );
};
