import React from 'react';
import { AlertCircle, HelpCircle } from 'lucide-react';

/**
 * DrawerFieldProps - Properties for the DrawerField primitive component
 *
 * @author Mike Nimer <mikenimer@google.com>
 */
export interface DrawerFieldProps {
  label: string;
  subLabel?: string;
  tooltip?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

/**
 * DrawerField - Standard, styled form field wrapper following the 8pt grid standard.
 *
 * This component standardizes form layout spacing, labels, inline descriptions, 
 * tooltip hints, and contextual error state banners across all properties drawers.
 *
 * Architectural Decisions:
 * 1. Semantic Form Elements: Use clean flex/grid alignments.
 * 2. 8pt Grid Compliant: Field elements, descriptions, and inputs utilize space-y-1.5, space-y-1, and gap-1.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */
export const DrawerField: React.FC<DrawerFieldProps> = ({
  label,
  subLabel,
  tooltip,
  error,
  required = false,
  children,
  className = '',
}) => {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {/* Header Label Row */}
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider text-gray-400">
          <span>{label}</span>
          
          {/* Required Red Asterisk indicator */}
          {required && (
            <span className="text-red-500 font-bold" data-testid="field-required">
              *
            </span>
          )}

          {/* Interactive Help Tooltip */}
          {tooltip && (
            <div className="relative group cursor-help" data-testid="field-tooltip">
              <HelpCircle className="w-3.5 h-3.5 text-gray-500 hover:text-gray-300 transition-colors" />
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-48 hidden group-hover:block bg-[#161b22] text-gray-200 text-[10px] p-2 rounded border border-[#30363d] shadow-xl z-50 pointer-events-none leading-relaxed">
                {tooltip}
              </div>
            </div>
          )}
        </label>
      </div>

      {/* Sub-label Help Text (if provided) */}
      {subLabel && (
        <p className="text-[10px] text-gray-400 leading-relaxed" data-testid="field-sublabel">
          {subLabel}
        </p>
      )}

      {/* Primary Input Control Wrapper */}
      <div className="relative">
        {children}
      </div>

      {/* Error Context Alert */}
      {error && (
        <div 
          className="flex items-start gap-1.5 p-2 bg-red-950/20 border border-red-500/30 rounded text-red-400 text-[10px] leading-relaxed animate-fade-in"
          data-testid="field-error"
        >
          <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};
