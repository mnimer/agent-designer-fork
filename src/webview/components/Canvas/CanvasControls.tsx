/**
 * CanvasControls Component
 *
 * Floating toolbar providing quick actions for canvas node creation (Agent, Trigger),
 * automated Dagre layout arrangement, viewport centering, and zoom operations.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import React from 'react';
import { useReactFlow } from '@xyflow/react';
import {
  Plus,
  Bot,
  Zap,
  LayoutGrid,
  Maximize2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { calculateDagreLayout } from './AutoLayout';
import { WorkflowNode, WorkflowEdge } from '../../../shared/types';

export interface CanvasControlsProps {
  onAddAgent: () => void;
  onAddTrigger: () => void;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  onLayoutChange: (nodes: WorkflowNode[]) => void;
}

export const CanvasControls: React.FC<CanvasControlsProps> = ({
  onAddAgent,
  onAddTrigger,
  nodes,
  edges,
  onLayoutChange,
}) => {
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  /**
   * Automatically calculates hierarchical positions using Dagre layout algorithm.
   */
  const handleAutoLayout = () => {
    const layoutedNodes = calculateDagreLayout(nodes, edges, { direction: 'LR' });
    onLayoutChange(layoutedNodes);
    setTimeout(() => fitView({ padding: 0.2 }), 50);
  };

  return (
    <div className="absolute top-4 left-4 z-20 flex items-center gap-2 bg-[#161b22]/90 backdrop-blur-md p-1.5 rounded-lg border border-[#30363d] shadow-xl">
      {/* Add Node Actions */}
      <button
        type="button"
        onClick={onAddAgent}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md hover:shadow-blue-500/20 transition-all cursor-pointer"
        title="Add Agent Node"
      >
        <Bot className="w-3.5 h-3.5" />
        <span>Add Agent</span>
      </button>

      <button
        type="button"
        onClick={onAddTrigger}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#21262d] hover:bg-[#30363d] text-amber-300 text-xs font-semibold border border-amber-500/30 transition-all cursor-pointer"
        title="Add Trigger Node"
      >
        <Zap className="w-3.5 h-3.5" />
        <span>Add Trigger</span>
      </button>

      <div className="h-4 w-px bg-[#30363d] mx-1" />

      {/* Auto Arrange Layout */}
      <button
        type="button"
        onClick={handleAutoLayout}
        className="p-1.5 rounded-md hover:bg-[#30363d] text-gray-300 hover:text-white transition-colors cursor-pointer"
        title="Auto-Arrange Layout (Dagre)"
      >
        <LayoutGrid className="w-4 h-4" />
      </button>

      <div className="h-4 w-px bg-[#30363d] mx-1" />

      {/* Viewport Actions */}
      <button
        type="button"
        onClick={() => zoomIn()}
        className="p-1.5 rounded-md hover:bg-[#30363d] text-gray-300 hover:text-white transition-colors cursor-pointer"
        title="Zoom In"
      >
        <ZoomIn className="w-4 h-4" />
      </button>

      <button
        type="button"
        onClick={() => zoomOut()}
        className="p-1.5 rounded-md hover:bg-[#30363d] text-gray-300 hover:text-white transition-colors cursor-pointer"
        title="Zoom Out"
      >
        <ZoomOut className="w-4 h-4" />
      </button>

      <button
        type="button"
        onClick={() => fitView({ padding: 0.2 })}
        className="p-1.5 rounded-md hover:bg-[#30363d] text-gray-300 hover:text-white transition-colors cursor-pointer"
        title="Fit View"
      >
        <Maximize2 className="w-4 h-4" />
      </button>
    </div>
  );
};
