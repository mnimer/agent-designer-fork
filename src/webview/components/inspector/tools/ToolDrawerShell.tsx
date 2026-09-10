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
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import React from 'react';
import { X, Check, Trash2, Plus, Sparkles } from 'lucide-react';
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
  onSave: () => void;
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
  onSave,
  onDelete,
  savedSuccess,
  children,
}) => {
  if (!isOpen) return null;

  return (
    <div className="absolute top-0 right-0 bottom-0 z-40 w-96 backdrop-blur-2xl bg-[#161b22]/95 border-l border-[#30363d] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200 text-[#c9d1d9]">
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
        <button
          onClick={onClose}
          className="p-1 rounded-md text-gray-400 hover:text-white hover:bg-[#30363d] transition-colors cursor-pointer"
          title="Close Drawer"
        >
          <X className="w-4 h-4" />
        </button>
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

      {/* 3. Footer Action Buttons */}
      <div className="p-4 bg-[#161b22] border-t border-[#30363d] flex flex-col gap-2 shrink-0">
        {/* Attach to Active Agent button (if global template and agent selected) */}
        {scope === 'global' && selectedAgent && onAttachToAgent && (
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
        )}

        <div className="flex items-center gap-2">
          {onDelete && (
            <button
              onClick={onDelete}
              className="p-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg border border-rose-500/30 transition-colors cursor-pointer"
              title={scope === 'agent' ? 'Remove Tool from Agent' : 'Delete Tool from Catalog'}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onSave}
            className={`flex-1 py-2 px-4 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer ${
              savedSuccess
                ? 'bg-emerald-600 text-white'
                : 'bg-purple-600 hover:bg-purple-500 text-white hover:shadow-purple-500/20'
            }`}
          >
            {savedSuccess ? (
              <>
                <Check className="w-3.5 h-3.5" />
                Saved!
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                Save Tool Configuration
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
