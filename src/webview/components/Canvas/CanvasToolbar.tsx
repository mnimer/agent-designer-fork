/**
 * CanvasToolbar.tsx - Floating Canvas Viewport & Action Controls Widget
 *
 * Purpose:
 * Renders the top-right floating canvas controls strip providing quick access to
 * multi-level Undo/Redo, automated Dagre graph layout, zoom adjustments, fit-to-view,
 * and an optional interactive MiniMap overlay.
 *
 * Architectural Decisions:
 * - Author: Mike Nimer <mikenimer@google.com>
 * - Decoupled React Flow Hooks: Consumes `useReactFlow()` directly for zoom and fit actions,
 *   while delegating domain layout and history mutations up to the parent component.
 * - 8pt Grid System Compliance: Employs 8px-based padding, rounded borders, and margins.
 * - MiniMap Integration: Positioned directly beneath the toolbar with custom node category colors.
 */

import React from 'react';
import { useReactFlow, MiniMap } from '@xyflow/react';
import {
  Undo2,
  Redo2,
  LayoutGrid,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from 'lucide-react';
import { AgentData } from '../../types';

export interface CanvasToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onAutoLayout: () => void;
  showMiniMap?: boolean;
}

/**
 * Floating toolbar rendered inside the React Flow canvas container.
 */
export const CanvasToolbar: React.FC<CanvasToolbarProps> = ({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onAutoLayout,
  showMiniMap = true,
}) => {
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  return (
    <div className="absolute top-3 right-3 z-20 flex flex-col items-end gap-2 pointer-events-auto">
      {/* Control Button Toolbar Strip */}
      <div className="flex items-center gap-1 p-1 bg-[#161b22]/95 backdrop-blur-md border border-[#30363d] rounded-lg shadow-xl text-xs text-[#c9d1d9]">
        {/* Undo Action */}
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Cmd+Z / Ctrl+Z)"
          className="p-1.5 rounded hover:bg-[#21262d] disabled:opacity-30 disabled:cursor-not-allowed text-gray-300 hover:text-white transition-colors cursor-pointer"
        >
          <Undo2 className="w-3.5 h-3.5" />
        </button>

        {/* Redo Action */}
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (Cmd+Shift+Z / Ctrl+Y)"
          className="p-1.5 rounded hover:bg-[#21262d] disabled:opacity-30 disabled:cursor-not-allowed text-gray-300 hover:text-white transition-colors cursor-pointer"
        >
          <Redo2 className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-4 bg-[#30363d] my-auto" />

        {/* Auto Layout Action */}
        <button
          type="button"
          onClick={onAutoLayout}
          title="Auto Layout Diagram"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded hover:bg-[#21262d] text-gray-300 hover:text-white font-medium text-[11px] transition-colors cursor-pointer"
        >
          <LayoutGrid className="w-3.5 h-3.5 text-blue-400" />
          <span>Auto Layout</span>
        </button>

        <div className="w-px h-4 bg-[#30363d] my-auto" />

        {/* Zoom In Action */}
        <button
          type="button"
          onClick={() => zoomIn()}
          title="Zoom In"
          className="p-1.5 rounded hover:bg-[#21262d] text-gray-300 hover:text-white transition-colors cursor-pointer"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>

        {/* Zoom Out Action */}
        <button
          type="button"
          onClick={() => zoomOut()}
          title="Zoom Out"
          className="p-1.5 rounded hover:bg-[#21262d] text-gray-300 hover:text-white transition-colors cursor-pointer"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>

        {/* Zoom to Fit Action */}
        <button
          type="button"
          onClick={() => fitView({ padding: 0.2 })}
          title="Zoom to Fit"
          className="flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-[#21262d] text-gray-300 hover:text-white font-medium text-[11px] transition-colors cursor-pointer"
        >
          <Maximize2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>Zoom to Fit</span>
        </button>
      </div>

      {/* MiniMap Positioned Directly Under Controls */}
      {showMiniMap && (
        <MiniMap
          nodeColor={(n) => {
            if (n.type === 'triggerNode' || n.type === 'trigger') return '#f59e0b';
            const data = n.data as AgentData;
            if (data?.isStartNode) return '#3b82f6';
            if (data?.isEvaluator) return '#a855f7';
            if (data?.agentKind === 'a2a') return '#06b6d4';
            return '#10b981';
          }}
          nodeStrokeWidth={2}
          className="!static !m-0 !h-[110px] !w-[170px] border border-[#30363d] rounded-lg shadow-xl overflow-hidden"
          maskColor="rgba(0, 0, 0, 0.65)"
        />
      )}
    </div>
  );
};
