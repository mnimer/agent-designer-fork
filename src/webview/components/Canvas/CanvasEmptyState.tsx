/**
 * CanvasEmptyState.tsx - Empty Diagram State Banner Widget
 *
 * Purpose:
 * Renders an inviting call-to-action overlay when the canvas contains zero nodes,
 * providing the user with guidance and a 1-click action to create a default root engine.
 *
 * Architectural Decisions:
 * - Author: Mike Nimer <mikenimer@google.com>
 * - Non-Blocking Overlay: Uses pointer-events-none on backdrop container and pointer-events-auto
 *   on the card so surrounding canvas drag-and-drop targets remain active.
 * - 8pt Grid System Compliance: Strict 8px multiple spacing (p-6, mb-3, mb-4, gap-1.5, rounded-2xl).
 */

import React from 'react';
import { Bot } from 'lucide-react';

export interface CanvasEmptyStateProps {
  onAddRootEngine: () => void;
}

/**
 * Centered empty state overlay displayed when the canvas has no nodes.
 */
export const CanvasEmptyState: React.FC<CanvasEmptyStateProps> = ({ onAddRootEngine }) => {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
      <div className="text-center p-6 rounded-2xl bg-[#1e1e1e]/80 border border-[#333333] shadow-2xl backdrop-blur-md max-w-sm pointer-events-auto">
        <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center mx-auto mb-3 text-blue-400">
          <Bot className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-semibold text-white mb-1">Blank Agent Canvas</h3>
        <p className="text-xs text-gray-400 mb-4 leading-relaxed">
          Start building by clicking or dragging an agent, pattern, or trigger from the palette on the left.
        </p>
        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={onAddRootEngine}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors shadow-sm cursor-pointer flex items-center gap-1.5"
          >
            <Bot className="w-4 h-4" />
            Add Root Engine
          </button>
        </div>
      </div>
    </div>
  );
};
