/**
 * PanelDivider.tsx - Resizable Horizontal Split-Pane Divider Widget
 *
 * Purpose:
 * Renders the draggable divider bar between the React Flow canvas container and the bottom
 * code generation / deployment panel, offering hover grab-handles and double-click quick toggling.
 *
 * Architectural Decisions:
 * - Author: Mike Nimer <mikenimer@google.com>
 * - Double-Click Reset: Supports double-clicking to toggle between custom height and the canonical
 *   1/3 (33.33%) panel distribution.
 * - Active Drag Feedback: Visual ring indicator and cursor styling during active dragging sessions.
 * - 8pt Grid System Compliance: 8px height (h-2), rounded grab handle, 8px padding.
 */

import React from 'react';

export interface PanelDividerProps {
  isPanelMaximized: boolean;
  isDraggingDivider: boolean;
  bottomPanelHeight: number | null;
  onMouseDown: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
}

/**
 * Resizable horizontal divider bar between canvas and bottom panel.
 */
export const PanelDivider: React.FC<PanelDividerProps> = ({
  isPanelMaximized,
  isDraggingDivider,
  bottomPanelHeight,
  onMouseDown,
  onDoubleClick,
}) => {
  return (
    <div
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      title="Drag to resize panel (up to 100%). Double-click to toggle between tab bar and 2/3 height."
      className={`h-2 relative w-full bg-[#161b22] hover:bg-blue-600 cursor-row-resize flex items-center justify-center transition-all z-30 group select-none shrink-0 border-t border-b border-[#30363d] ${
        isDraggingDivider ? 'bg-blue-500 ring-2 ring-blue-500/50' : ''
      }`}
    >
      {/* Grab Handle Pill */}
      <div className="w-12 h-1 rounded-full bg-[#484f58] group-hover:bg-white group-active:bg-white transition-colors" />

      {/* Floating resize indicator on hover */}
      <div className="hidden group-hover:flex items-center gap-2 absolute right-3 text-[10px] font-mono text-white/90 bg-[#0d1117] px-2 py-0.5 rounded border border-[#30363d] shadow-lg pointer-events-none">
        <span>
          {bottomPanelHeight !== null
            ? `${Math.round(bottomPanelHeight)}px`
            : isPanelMaximized
            ? '66.7% (2/3)'
            : '40px (Tab Bar)'}
        </span>
        <span className="text-gray-400">· Drag or double-click</span>
      </div>
    </div>
  );
};
