/**
 * ValidationToast.tsx - Diagram Validation Alert Banner Widget
 *
 * Purpose:
 * Displays actionable toast notifications when the user attempts an invalid graph wiring
 * operation (such as attempting to connect multiple root engines to test triggers).
 *
 * Architectural Decisions:
 * - Author: Mike Nimer <mikenimer@google.com>
 * - High-Contrast Warning Theme: Styled with Amber/Gold hues (amber-500/60) to clearly distinguish
 *   validation notices from runtime or build errors.
 * - 8pt Grid System Compliance: Strict 8px spacing (p-3.5, gap-3, top-4, right-4).
 */

import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

export interface ValidationToastProps {
  warning: string | null;
  onDismiss: () => void;
}

/**
 * Top-right floating toast banner for workflow validation feedback.
 */
export const ValidationToast: React.FC<ValidationToastProps> = ({ warning, onDismiss }) => {
  if (!warning) return null;

  return (
    <div className="absolute top-4 right-4 z-50 max-w-md bg-[#161b22]/95 border border-amber-500/60 text-amber-200 rounded-xl p-3.5 shadow-2xl backdrop-blur-md flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="p-1 rounded bg-amber-500/20 text-amber-400 shrink-0 mt-0.5">
        <AlertTriangle className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-bold text-white mb-0.5">Diagram Validation</div>
        <div className="text-xs text-amber-200/90 leading-relaxed">{warning}</div>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="text-gray-400 hover:text-white p-1 rounded-md transition-colors shrink-0 cursor-pointer"
        title="Dismiss warning"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
