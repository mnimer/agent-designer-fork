/**
 * Common Tool Drawer Shell
 *
 * Provides a standardized slide-over drawer layout with:
 * 1. 8pt grid system spacing (multiples of 8px).
 * 2. Header with tool icon, editable tool name, read-only type badge (no category dropdown),
 *    and agent/global scope badge.
 * 3. Short description field.
 * 4. Slotted children for specialized tool configuration forms.
 * 5. Footer with Save, Delete, and Attach to Agent actions.
 * 6. Full-Height Viewport Drawer: Uses fixed inset-y-0 right-0 z-50 w-[420px] overlay to span full viewport height over bottom panels, matching TriggerDrawer.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import React from 'react';
import { X, Check, Plus } from 'lucide-react';
import { AgentData } from '../../../types';

export interface ToolDrawerShellProps {
  isOpen: boolean;
  onClose: () => void;
  toolName: string;
  onChangeName: (name: string) => void;
  namePlaceholder?: string;
  description: string;
  onChangeDescription: (desc: string) => void;
  typeBadge: {
    label: string;
    subLabel?: string;
    color: string;
    bg: string;
    border: string;
  };
  toolIcon: React.ReactNode;
  scope?: 'global' | 'agent';
  agentName?: string;
  selectedAgent?: AgentData | null;
  isAlreadyAttached?: boolean;
  onAttachToAgent?: () => void;
  onSave?: () => void;
  onDelete?: () => void;
  savedSuccess?: boolean;
  children: React.ReactNode;
}

export const ToolDrawerShell: React.FC<ToolDrawerShellProps> = ({
  isOpen,
  onClose,
  toolName,
  onChangeName,
  namePlaceholder = 'Tool Name',
  description,
  onChangeDescription,
  typeBadge,
  toolIcon,
  scope = 'global',
  agentName,
  selectedAgent,
  isAlreadyAttached,
  onAttachToAgent,
  onDelete,
  children,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-[420px] bg-[#161b22] border-l border-[#30363d] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200 text-[#c9d1d9] font-sans">
      {/* 1. Header Section */}
      <div className="flex items-center justify-between p-4 bg-[#161b22] border-b border-[#30363d] shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`p-2 rounded-lg bg-[#0d1117] border shrink-0 shadow-xs ${typeBadge.border}`}>
            {toolIcon}
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-bold text-white truncate max-w-[200px]">
              {toolName || 'Tool Configuration'}
            </h3>
            {/* Read-Only Type Badge */}
            <div className="flex items-center gap-2 mt-1">
              <span className={`px-2 py-0.5 rounded text-[10px] font-semibold font-mono border ${typeBadge.bg} ${typeBadge.color} ${typeBadge.border}`}>
                {typeBadge.label}
              </span>
            </div>
            {scope === 'agent' ? (
              <div className="mt-1 flex items-center gap-1">
                <span className="px-2 py-0.5 rounded text-[9px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/40">
                  Agent Instance: {agentName || selectedAgent?.label || 'Agent'}
                </span>
              </div>
            ) : (
              <div className="mt-1 flex items-center gap-1">
                <span className="px-2 py-0.5 rounded text-[9px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/40">
                  Global Tool Template
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onClose}
            className="p-1 rounded-md text-gray-400 hover:text-white hover:bg-[#30363d] transition-colors cursor-pointer"
            title="Close Drawer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Scrollable Body Section */}
      <div className="flex-1 p-4 space-y-4 overflow-y-auto text-xs text-gray-300">
        {/* Basic Metadata: Name & Description */}
        <div className="space-y-3 bg-[#0d1117] p-4 rounded-lg border border-[#30363d]">
          <div className="space-y-1">
            <label className="text-[11px] font-bold uppercase tracking-tight text-gray-400">
              Tool Name
            </label>
            <input
              type="text"
              value={toolName}
              onChange={(e) => onChangeName(e.target.value)}
              placeholder={namePlaceholder}
              className="w-full px-3 py-2 bg-[#161b22] border border-[#30363d] focus:border-purple-500 rounded-lg text-xs text-white focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold uppercase tracking-tight text-gray-400">
              Short Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => onChangeDescription(e.target.value)}
              placeholder="Brief summary of what this tool provides to the agent"
              className="w-full px-3 py-2 bg-[#161b22] border border-[#30363d] focus:border-purple-500 rounded-lg text-xs text-gray-200 focus:outline-none"
            />
          </div>
        </div>

        {/* Specialized Tool Configuration Form */}
        {children}
      </div>

      {/* 3. Optional Footer: Attach to Active Agent button */}
      {scope === 'global' && selectedAgent && onAttachToAgent && (
        <div className="p-4 bg-[#161b22] border-t border-[#30363d] shrink-0">
          <button
            onClick={onAttachToAgent}
            disabled={isAlreadyAttached}
            className={`w-full py-2 px-3 rounded-lg font-medium text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              isAlreadyAttached
                ? 'bg-[#21262d] text-gray-400 cursor-not-allowed border border-[#30363d]'
                : 'bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/30 border border-indigo-500/40'
            }`}
          >
            {isAlreadyAttached ? (
              <>
                <Check className="w-3.5 h-3.5" />
                Attached to {selectedAgent.label || 'Agent'}
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5" />
                Attach to {selectedAgent.label || 'Agent'}
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};
