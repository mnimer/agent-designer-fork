/**
 * AddToolModal Component
 *
 * Modal catalog dialog allowing users to browse, search, and attach tools
 * (Search, Sandbox, Database, MCP, Custom Code) to an agent.
 *
 * Architectural Decisions:
 * 1. Filter out or visually disable tools already attached to the target agent.
 * 2. Search query filtering by name, type, and description.
 * 3. 8pt grid compliant spacing with TailwindCSS.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import React, { useState } from 'react';
import {
  Globe,
  Terminal,
  Database,
  Radio,
  Code,
  Check,
  Plus,
  X,
  Wrench,
  Search,
  Layers,
} from 'lucide-react';
import { ToolDefinition } from '../../../shared/types';
import { AVAILABLE_TOOLS } from '../../data/defaultTools';

export interface AddToolModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTool: (tool: ToolDefinition) => void;
  existingToolIds: string[];
}

const getToolIcon = (type: ToolDefinition['type']) => {
  switch (type) {
    case 'builtin':
      return <Globe className="w-4 h-4 text-sky-400" />;
    case 'code':
      return <Terminal className="w-4 h-4 text-emerald-400" />;
    case 'database':
      return <Database className="w-4 h-4 text-amber-400" />;
    case 'mcp':
      return <Layers className="w-4 h-4 text-purple-400" />;
    case 'rest':
      return <Radio className="w-4 h-4 text-rose-400" />;
    case 'custom':
      return <Code className="w-4 h-4 text-indigo-400" />;
    default:
      return <Wrench className="w-4 h-4 text-gray-400" />;
  }
};

export const AddToolModal: React.FC<AddToolModalProps> = ({
  isOpen,
  onClose,
  onSelectTool,
  existingToolIds,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  if (!isOpen) return null;

  const filteredTools = AVAILABLE_TOOLS.filter((tool) => {
    const q = searchQuery.toLowerCase();
    return (
      tool.name.toLowerCase().includes(q) ||
      tool.description.toLowerCase().includes(q) ||
      tool.type.toLowerCase().includes(q)
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      <div className="w-full max-w-lg backdrop-blur-2xl bg-[#161b22]/95 rounded-xl border border-[#30363d] shadow-2xl overflow-hidden flex flex-col max-h-[85vh] text-[#c9d1d9]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#161b22] border-b border-[#30363d]">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded bg-[#0d1117] border border-[#30363d]">
              <Wrench className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Attach Tool to Agent</h3>
              <p className="text-[11px] text-gray-400">Select a tool to equip your agent with capabilities</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-gray-400 hover:text-white hover:bg-[#30363d] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-3 border-b border-[#30363d] bg-[#0d1117]">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
              placeholder="Search tools by name, category, or protocol..."
              className="w-full pl-9 pr-3 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-blue-500 rounded-lg text-xs text-white focus:outline-none placeholder:text-gray-500"
            />
          </div>
        </div>

        {/* Tool List */}
        <div className="p-4 space-y-2 overflow-y-auto flex-1">
          {filteredTools.map((tool) => {
            const isAlreadyAdded = existingToolIds.includes(tool.id);

            return (
              <div
                key={tool.id}
                onClick={() => {
                  if (!isAlreadyAdded) {
                    onSelectTool(tool);
                    onClose();
                  }
                }}
                className={`flex items-start justify-between p-3 rounded-lg border transition-all ${
                  isAlreadyAdded
                    ? 'bg-[#0d1117]/60 border-[#30363d] opacity-50 cursor-not-allowed'
                    : 'bg-[#21262d] border-[#30363d] hover:border-blue-500/60 hover:bg-[#30363d] cursor-pointer shadow-sm'
                }`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="p-2 rounded-md bg-[#0d1117] border border-[#30363d] shrink-0 mt-0.5">
                    {getToolIcon(tool.type)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white">{tool.name}</span>
                      <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-[#0d1117] text-gray-400 font-mono border border-[#30363d]">
                        {tool.type}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">
                      {tool.description}
                    </p>
                  </div>
                </div>

                <div className="shrink-0 ml-3 self-center">
                  {isAlreadyAdded ? (
                    <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium px-2 py-1 rounded bg-emerald-950/40 border border-emerald-500/30">
                      <Check className="w-3 h-3" /> Attached
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 font-bold px-2.5 py-1 rounded bg-blue-950/40 border border-blue-500/30 hover:bg-blue-900/40 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> Attach
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {filteredTools.length === 0 && (
            <div className="text-center py-8 text-gray-500 text-xs">
              No tools matching &ldquo;{searchQuery}&rdquo; found.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-[#161b22] border-t border-[#30363d] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs rounded-lg bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-gray-300 hover:text-white cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
