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
    <div className="absolute top-3 right-3 z-20 flex flex-col items-end gap-2.5 pointer-events-auto select-none">
      {/* Control Button Toolbar Strip */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#161b22]/95 backdrop-blur-md border border-[#30363d] rounded-xl shadow-xl text-xs text-[#c9d1d9]">
        {/* Undo Action */}
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Cmd+Z / Ctrl+Z)"
          data-testid="canvas-undo-button"
          className="p-1.5 rounded-lg hover:bg-[#21262d] disabled:opacity-30 disabled:cursor-not-allowed text-gray-200 hover:text-white transition-colors cursor-pointer"
        >
          <Undo2 className="w-4 h-4" />
        </button>

        {/* Redo Action */}
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (Cmd+Shift+Z / Ctrl+Y)"
          data-testid="canvas-redo-button"
          className="p-1.5 rounded-lg hover:bg-[#21262d] disabled:opacity-30 disabled:cursor-not-allowed text-gray-200 hover:text-white transition-colors cursor-pointer"
        >
          <Redo2 className="w-4 h-4" />
        </button>

        <div className="w-px h-5 bg-[#30363d] mx-1" />

        {/* Auto Layout Action */}
        <button
          type="button"
          onClick={onAutoLayout}
          title="Auto Layout Diagram"
          data-testid="canvas-autolayout-button"
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[#21262d] text-gray-100 hover:text-white font-semibold text-xs transition-colors cursor-pointer"
        >
          <LayoutGrid className="w-4 h-4 text-[#38bdf8]" />
          <span>Auto Layout</span>
        </button>

        <div className="w-px h-5 bg-[#30363d] mx-1" />

        {/* Zoom In Action */}
        <button
          type="button"
          onClick={() => zoomIn()}
          title="Zoom In"
          data-testid="canvas-zoomin-button"
          className="p-1.5 rounded-lg hover:bg-[#21262d] text-gray-300 hover:text-white transition-colors cursor-pointer"
        >
          <ZoomIn className="w-4 h-4" />
        </button>

        {/* Zoom Out Action */}
        <button
          type="button"
          onClick={() => zoomOut()}
          title="Zoom Out"
          data-testid="canvas-zoomout-button"
          className="p-1.5 rounded-lg hover:bg-[#21262d] text-gray-300 hover:text-white transition-colors cursor-pointer"
        >
          <ZoomOut className="w-4 h-4" />
        </button>

        {/* Zoom to Fit Action */}
        <button
          type="button"
          onClick={() => fitView({ padding: 0.2 })}
          title="Zoom to Fit"
          data-testid="canvas-fitview-button"
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[#21262d] text-gray-100 hover:text-white font-semibold text-xs transition-colors cursor-pointer"
        >
          <Maximize2 className="w-4 h-4 text-[#10b981]" />
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
          className="!static !m-0 !h-[120px] !w-[180px] border border-[#30363d] rounded-xl shadow-xl overflow-hidden !bg-[#161b22]"
          maskColor="rgba(13, 17, 23, 0.75)"
        />
      )}
    </div>
  );
};
