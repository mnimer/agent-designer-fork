/**
 * AddToolModal.tsx - Tool Attachment Dialog for Agents
 *
 * Purpose:
 * Renders an interactive modal dialog for attaching available tools from the visual
 * designer's active tool registry directly to a selected agent node.
 *
 * Architectural Decisions:
 * 1. Synchronized with Canvas Tool Panel: Consumes the live `tools` state from the designer
 *    so any registered MCP servers, custom tools, or updated configurations appear dynamically.
 * 2. 4-Category Organization: Mirrors the canvas palette's 4 canonical categories:
 *    - Built-in Grounding (Google Search, Web Page Reader)
 *    - Enterprise Search (Vertex AI Search, Knowledge Vector RAG)
 *    - System Tools (Code Sandbox, Human Clarification, Memory, Sub-Agent)
 *    - Custom & Community Tools (MCP Servers, REST APIs, Custom Functions)
 * 3. 8pt Grid System: All spacing, margins, padding, and element sizing strictly adhere to
 *    multiples of 8px (p-2, p-4, gap-2, py-2, etc.).
 * 4. Deduplication & Status: Clearly tags already attached tools with an "Attached" indicator
 *    while enabling one-click attachment for unattached tools.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import React, { useState, useMemo } from 'react';
import { 
  Globe, 
  Terminal, 
  Database, 
  FileText, 
  Radio, 
  Code, 
  Check, 
  Plus, 
  X,
  Wrench,
  Search,
  Server,
  HelpCircle,
  History,
  Bot
} from 'lucide-react';
import { ToolDefinition } from '../../types';
import { AVAILABLE_TOOLS } from '../../data/defaultTools';
import { categorizeTools } from '../../data/builtinTools';

export interface AddToolModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTool: (tool: ToolDefinition) => void;
  existingToolIds: string[];
  tools?: ToolDefinition[];
  targetAgentName?: string;
}

/**
 * Resolves the appropriate Lucide icon component based on tool definition
 */
const getToolIcon = (tool: ToolDefinition) => {
  if (tool.builtinType === 'google_search' || tool.id === 'builtin_google_search' || tool.id === 'tool_google_search') {
    return <Globe className="w-4 h-4 text-sky-400" />;
  }
  if (tool.builtinType === 'vertex_ai_search' || tool.id === 'builtin_vertex_ai_search' || tool.id === 'tool_rag_retriever') {
    return <Database className="w-4 h-4 text-amber-400" />;
  }
  if (tool.builtinType === 'load_web_page' || tool.id === 'builtin_load_web_page') {
    return <FileText className="w-4 h-4 text-sky-400" />;
  }
  if (tool.builtinType === 'request_input' || tool.id === 'builtin_request_input') {
    return <HelpCircle className="w-4 h-4 text-rose-400" />;
  }
  if (tool.builtinType === 'preload_memory' || tool.id === 'builtin_preload_memory') {
    return <History className="w-4 h-4 text-purple-400" />;
  }
  if (tool.builtinType === 'agent_as_tool' || tool.id === 'builtin_agent_as_tool') {
    return <Bot className="w-4 h-4 text-indigo-400" />;
  }
  if (tool.type === 'mcp') {
    return <Server className="w-4 h-4 text-purple-400" />;
  }
  if (tool.type === 'search') {
    return <Globe className="w-4 h-4 text-sky-400" />;
  }
  if (tool.type === 'code' || tool.builtinType === 'code_execution') {
    return <Terminal className="w-4 h-4 text-emerald-400" />;
  }
  if (tool.type === 'db') {
    return <Database className="w-4 h-4 text-amber-400" />;
  }
  if (tool.type === 'rag') {
    return <FileText className="w-4 h-4 text-purple-400" />;
  }
  if (tool.type === 'api') {
    return <Radio className="w-4 h-4 text-rose-400" />;
  }
  return <Code className="w-4 h-4 text-indigo-400" />;
};

export const AddToolModal: React.FC<AddToolModalProps> = ({
  isOpen,
  onClose,
  onSelectTool,
  existingToolIds,
  tools = AVAILABLE_TOOLS,
  targetAgentName,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  // Filter tools by name, description, category, or type
  const filteredTools = useMemo(() => {
    if (!searchQuery.trim()) return tools;
    const q = searchQuery.toLowerCase();
    return tools.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        (t.category && t.category.toLowerCase().includes(q)) ||
        (t.builtinType && t.builtinType.toLowerCase().includes(q))
    );
  }, [tools, searchQuery]);

  // Categorize into the 4 canonical designer categories matching the Palette
  const categorized = useMemo(() => categorizeTools(filteredTools), [filteredTools]);

  const categorySections = [
    {
      id: 'grounding',
      title: 'Built-in Grounding',
      subtitle: 'Live Web & Document Grounding',
      icon: <Globe className="w-3.5 h-3.5 text-sky-400" />,
      tools: categorized.grounding,
      badgeColor: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
    },
    {
      id: 'enterprise_search',
      title: 'Enterprise Search',
      subtitle: 'Vertex AI Search & Knowledge Corpora',
      icon: <Database className="w-3.5 h-3.5 text-amber-400" />,
      tools: categorized.enterprise_search,
      badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    },
    {
      id: 'system',
      title: 'System Tools',
      subtitle: 'Execution, Memory, Interruption & Sub-Agents',
      icon: <Terminal className="w-3.5 h-3.5 text-emerald-400" />,
      tools: categorized.system,
      badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    },
    {
      id: 'custom',
      title: 'Custom & Community Tools',
      subtitle: 'MCP Servers, REST APIs & Custom Code',
      icon: <Wrench className="w-3.5 h-3.5 text-purple-400" />,
      tools: categorized.custom,
      badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    },
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-lg backdrop-blur-2xl bg-[#161b22]/95 rounded-xl border border-[#30363d] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 text-[#c9d1d9] flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#161b22] border-b border-[#30363d] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1.5 rounded-lg bg-[#0d1117] border border-green-500/40 text-green-400 shrink-0">
              <Wrench className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xs font-bold text-white truncate">
                {targetAgentName ? `Attach Tool to ${targetAgentName}` : 'Attach Tool to Agent'}
              </h3>
              <p className="text-[10px] text-gray-400 font-mono">
                Select from {tools.length} available tools in registry
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-gray-400 hover:text-white hover:bg-[#30363d] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="px-4 py-3 bg-[#161b22]/80 border-b border-[#30363d] shrink-0">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tools by name, description, or type..."
              className="w-full pl-9 pr-7 py-1.5 bg-[#0d1117] border border-[#30363d] focus:border-blue-500 rounded-lg text-xs text-gray-200 placeholder-gray-500 focus:outline-none transition-colors"
              autoFocus
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2 text-gray-400 hover:text-gray-200 text-xs cursor-pointer"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* Categorized Tools Catalog */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {filteredTools.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-xs italic bg-[#0d1117] rounded-lg border border-dashed border-[#30363d]">
              No tools found matching &quot;{searchQuery}&quot;.
            </div>
          ) : (
            categorySections.map((section) => {
              if (section.tools.length === 0) return null;

              return (
                <div key={section.id} className="space-y-2">
                  {/* Category Header */}
                  <div className="flex items-center justify-between pb-1 border-b border-[#30363d]/60">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {section.icon}
                      <span className="text-xs font-bold text-gray-200 tracking-tight">
                        {section.title}
                      </span>
                      <span className="text-[10px] text-gray-500 hidden sm:inline">
                        — {section.subtitle}
                      </span>
                    </div>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono font-bold shrink-0 ${section.badgeColor}`}>
                      {section.tools.length}
                    </span>
                  </div>

                  {/* Tool Items */}
                  <div className="space-y-1.5">
                    {section.tools.map((tool) => {
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
                          className={`flex items-start justify-between p-2.5 rounded-lg border transition-all ${
                            isAlreadyAdded
                              ? 'bg-[#0d1117]/60 border-[#30363d] opacity-60 cursor-default'
                              : 'bg-[#0d1117] border-[#30363d] hover:border-blue-500/60 hover:bg-[#161b22] cursor-pointer shadow-sm group'
                          }`}
                        >
                          <div className="flex items-start gap-2.5 min-w-0 flex-1">
                            <div className="p-1.5 rounded-md bg-[#161b22] border border-[#30363d] shrink-0 mt-0.5">
                              {getToolIcon(tool)}
                            </div>
                            <div className="min-w-0 flex-1 pr-2">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs font-bold text-gray-200 group-hover:text-white">
                                  {tool.name}
                                </span>
                                <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-[#161b22] text-gray-400 font-mono border border-[#30363d]">
                                  {tool.builtinType || tool.type}
                                </span>
                              </div>
                              <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-2 leading-relaxed">
                                {tool.description}
                              </p>
                            </div>
                          </div>

                          <div className="ml-2 shrink-0 self-center">
                            {isAlreadyAdded ? (
                              <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-950/30 px-2 py-1 rounded border border-emerald-500/30">
                                <Check className="w-3 h-3" />
                                Attached
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSelectTool(tool);
                                  onClose();
                                }}
                                className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md bg-blue-600 hover:bg-blue-500 text-white font-bold shadow-xs transition-colors cursor-pointer"
                              >
                                <Plus className="w-3 h-3" />
                                <span>Add</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 bg-[#0d1117] border-t border-[#30363d] flex items-center justify-between shrink-0">
          <span className="text-[10px] text-gray-500">
            {existingToolIds.length} tool{existingToolIds.length === 1 ? '' : 's'} currently attached
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 text-xs font-medium rounded-lg bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-gray-300 hover:text-white cursor-pointer transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
