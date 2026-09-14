import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

/**
 * DrawerSectionProps - Properties for the DrawerSection primitive component
 *
 * @author Mike Nimer <mikenimer@google.com>
 */
export interface DrawerSectionProps {
  title: string;
  icon?: React.ReactNode;
  badge?: string | number | React.ReactNode;
  badgeColorClass?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
}

/**
 * DrawerSection - Reusable, collapsible visual panel with 8pt grid-aligned spacing.
 *
 * This class handles displaying structured option groupings within property drawers, 
 * maintaining its own expand/collapse state while supporting custom badges and leading icons.
 *
 * Architectural Decisions:
 * 1. Collapsible Container: Built-in local state simplifies parenting.
 * 2. 8pt Grid Compliant: Spacings use padding, margins, and gaps in multiples of 4/8px (e.g., p-4, mb-4, gap-2).
 *
 * @author Mike Nimer <mikenimer@google.com>
 */
export const DrawerSection: React.FC<DrawerSectionProps> = ({
  title,
  icon,
  badge,
  badgeColorClass = 'bg-emerald-950/40 text-emerald-400 border border-emerald-500/25',
  defaultOpen = true,
  children,
  className = '',
}) => {
  // Local state to track whether the section is expanded or collapsed
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={`border-b border-[#30363d] last:border-b-0 ${className}`}>
      {/* Clickable Header Area */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 hover:bg-[#161b22]/50 transition-colors duration-150 group"
      >
        <div className="flex items-center gap-2.5">
          {/* Left Icon (if provided) */}
          {icon && (
            <span className="text-gray-400 group-hover:text-emerald-400 transition-colors">
              {icon}
            </span>
          )}
          
          {/* Section Title */}
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-300">
            {title}
          </span>

          {/* Optional Badge */}
          {badge !== undefined && (
            <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-semibold ${badgeColorClass}`}>
              {badge}
            </span>
          )}
        </div>

        {/* Right Chevron Toggle Indicator */}
        <div className="text-gray-500 group-hover:text-gray-300 transition-colors">
          {isOpen ? (
            <ChevronUp className="w-3.5 h-3.5" data-testid="chevron-up" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" data-testid="chevron-down" />
          )}
        </div>
      </button>

      {/* Collapsible Content Area */}
      {isOpen && (
        <div className="px-4 pb-4 space-y-4" data-testid="section-content">
          {children}
        </div>
      )}
    </div>
  );
};
