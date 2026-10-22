/**
 * AddToolModal.tsx - Tool Attachment Dialog for Agents
 *
 * Purpose:
 * Renders an interactive modal dialog for attaching available tools from the visual
 * designer's active tool registry directly to a selected agent node.
 *
 * Architectural Decisions:
 * 1. Synchronized with Canvas Tool Panel: Consumes the live `tools` state from the designer
 *    so any registered MCP servers, custom tools, or Google Cloud MCP servers appear dynamically.
 * 2. 4-Category Organization: Mirrors the canvas palette's 4 canonical categories:
 *    - Native ADK Tools (Google Search, Web Page Reader, Vertex AI Search, Code Sandbox, HITL, Memory, Sub-Agent, Custom Function)
 *    - Google Cloud MCP Servers (Official Remote MCP servers partitioned across 6 GCP domains)
 *    - MCP Servers (Custom/configured Model Context Protocol integrations)
 *    - Custom & External Tools (REST APIs & external integrations)
 * 3. 8pt Grid System: All spacing, margins, padding, and element sizing strictly adhere to
 *    multiples of 8px (p-2, p-4, gap-2, py-2, etc.).
 * 4. Deduplication & Status: Clearly tags already attached tools with an "Attached" indicator
 *    while enabling one-click attachment for unattached tools.
 * 5. Collapsible Category Sections: Tool sections are collapsible and default closed to streamline scanning,
 *    auto-expanding when the user types a search query.
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
  Bot,
  ChevronDown,
  ChevronRight,
  Cloud,
  Cpu,
  BarChart3,
  Shield
} from 'lucide-react';
import { ToolDefinition, GoogleCloudLaunchStage } from '../../types';
import { AVAILABLE_TOOLS } from '../../data/defaultTools';
import { categorizeTools, isNativeAdkTool } from '../../data/builtinTools';
import { GOOGLE_CLOUD_MCP_DOMAINS, GOOGLE_CLOUD_MCP_SERVERS } from '../../data/googleCloudMcpServers';

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
  if (tool.category === 'google_workspace_mcp' || tool.id.startsWith('workspace_mcp_')) {
    return <Globe className="w-4 h-4 text-emerald-400" />;
  }
  if (tool.category === 'google_cloud_mcp') {
    switch (tool.icon) {
      case 'Database': return <Database className="w-4 h-4 text-amber-400" />;
      case 'Cpu': return <Cpu className="w-4 h-4 text-cyan-400" />;
      case 'Bot': return <Bot className="w-4 h-4 text-blue-400" />;
      case 'BarChart3': return <BarChart3 className="w-4 h-4 text-emerald-400" />;
      case 'Shield': return <Shield className="w-4 h-4 text-rose-400" />;
      case 'Code': return <Code className="w-4 h-4 text-indigo-400" />;
      default: return <Cloud className="w-4 h-4 text-sky-400" />;
    }
  }
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

const getGcpDomainIcon = (iconName: string) => {
  switch (iconName) {
    case 'Database': return <Database className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
    case 'Cpu': return <Cpu className="w-3.5 h-3.5 text-cyan-400 shrink-0" />;
    case 'Bot': return <Bot className="w-3.5 h-3.5 text-blue-400 shrink-0" />;
    case 'BarChart3': return <BarChart3 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
    case 'Shield': return <Shield className="w-3.5 h-3.5 text-rose-400 shrink-0" />;
    case 'Code': return <Code className="w-3.5 h-3.5 text-indigo-400 shrink-0" />;
    default: return <Cloud className="w-3.5 h-3.5 text-sky-400 shrink-0" />;
  }
};

const renderLaunchStageBadge = (stage?: GoogleCloudLaunchStage) => {
  if (!stage) return null;
  const badgeColors: Record<GoogleCloudLaunchStage, string> = {
    GA: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    Preview: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    Beta: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  };
  return (
    <span className={`text-[8px] px-1 py-0.2 rounded border font-semibold shrink-0 ${badgeColors[stage] || badgeColors.GA}`}>
      {stage}
    </span>
  );
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
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({
    native_adk: false,
    google_cloud_mcp: false,
    google_workspace_mcp: false,
    mcp: false,
    custom: false,
    grounding: false,
    enterprise_search: false,
    system: false,
  });
  // NOTE: Track explicit manual user toggles during an active search query
  const [searchToggledCategories, setSearchToggledCategories] = useState<Record<string, boolean>>({});

  // Sub-accordions state for the 6 Google Cloud MCP domains
  const [openGcpDomains, setOpenGcpDomains] = useState<Record<string, boolean>>({
    databases_storage: false,
    compute_containers: false,
    ai_search_agent: false,
    analytics_etl_governance: false,
    management_observability_security: false,
    developer_workspace: false,
  });
  const [searchToggledGcpDomains, setSearchToggledGcpDomains] = useState<Record<string, boolean>>({});

  /**
   * Toggles the collapse/expand state of a GCP domain sub-accordion.
   */
  const toggleGcpDomain = (domainId: string) => {
    if (searchQuery.trim().length > 0) {
      setSearchToggledGcpDomains((prev) => {
        const currentlyExpanded = prev[domainId] !== undefined ? prev[domainId] : true;
        return {
          ...prev,
          [domainId]: !currentlyExpanded,
        };
      });
    } else {
      setOpenGcpDomains((prev) => ({
        ...prev,
        [domainId]: !prev[domainId],
      }));
    }
  };

  /**
   * Toggles the collapse/expand state of a tool category.
   * If user is currently searching, preserves the search-scoped toggle state
   * without destroying base collapsed/expanded defaults.
   *
   * @param categoryId ID of the category section to toggle
   */
  const toggleCategory = (categoryId: string) => {
    if (searchQuery.trim().length > 0) {
      setSearchToggledCategories((prev) => {
        const currentlyExpanded = prev[categoryId] !== undefined ? prev[categoryId] : true;
        return {
          ...prev,
          [categoryId]: !currentlyExpanded,
        };
      });
    } else {
      setOpenCategories((prev) => ({
        ...prev,
        [categoryId]: !prev[categoryId],
      }));
    }
  };

  // Filter tools by name, description, category, builtin type, MCP serverName, endpoint URL, command, and ID
  const filteredTools = useMemo(() => {
    if (!searchQuery.trim()) return tools;
    const q = searchQuery.toLowerCase().trim();
    return tools.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        (t.type && t.type.toLowerCase().includes(q)) ||
        (t.category && t.category.toLowerCase().includes(q)) ||
        (t.builtinType && t.builtinType.toLowerCase().includes(q)) ||
        (t.mcpConfig?.serverName && t.mcpConfig.serverName.toLowerCase().includes(q)) ||
        (t.mcpConfig?.serverUrl && t.mcpConfig.serverUrl.toLowerCase().includes(q)) ||
        (t.mcpConfig?.command && t.mcpConfig.command.toLowerCase().includes(q)) ||
        (t.id && t.id.toLowerCase().includes(q))
    );
  }, [tools, searchQuery]);

  // Categorize into Native ADK Tools, Google Cloud MCP Servers, MCP Servers, and Custom & External Tools
  const categorized = useMemo(() => categorizeTools(filteredTools), [filteredTools]);

  const categorySections = [
    {
      id: 'native_adk',
      title: 'Native ADK Tools',
      subtitle: 'Google ADK Built-in Tools & Function Tools',
      icon: <Wrench className="w-3.5 h-3.5 text-blue-400" />,
      tools: categorized.native_adk,
      badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
      isGcpGroup: false,
      isWorkspaceGroup: false,
    },
    {
      id: 'google_cloud_mcp',
      title: 'Google Cloud MCP Servers',
      subtitle: 'Official Remote Google Cloud MCP Servers',
      icon: <Cloud className="w-3.5 h-3.5 text-sky-400" />,
      tools: categorized.google_cloud_mcp,
      badgeColor: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
      isGcpGroup: true,
      isWorkspaceGroup: false,
    },
    {
      id: 'google_workspace_mcp',
      title: 'Google Workspace MCP Servers',
      subtitle: 'Official Remote Google Workspace MCP Servers (HTTP + OAuth)',
      icon: <Globe className="w-3.5 h-3.5 text-emerald-400" />,
      tools: categorized.google_workspace_mcp,
      badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      isGcpGroup: false,
      isWorkspaceGroup: true,
    },
    {
      id: 'mcp',
      title: 'MCP Servers',
      subtitle: 'Model Context Protocol Integrations',
      icon: <Server className="w-3.5 h-3.5 text-purple-400" />,
      tools: categorized.mcp,
      badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
      isGcpGroup: false,
      isWorkspaceGroup: false,
    },
    {
      id: 'custom',
      title: 'Custom & External Tools',
      subtitle: 'REST APIs & External Integrations',
      icon: <Radio className="w-3.5 h-3.5 text-amber-400" />,
      tools: categorized.custom.filter((t) => !isNativeAdkTool(t) && t.type !== 'mcp' && !t.mcpConfig && !t.id.startsWith('tool_mcp_') && t.category !== 'google_cloud_mcp' && t.category !== 'google_workspace_mcp'),
      badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
      isGcpGroup: false,
      isWorkspaceGroup: false,
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
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSearchToggledCategories({});
                setSearchToggledGcpDomains({});
              }}
              placeholder="Search tools by name, description, or type..."
              className="w-full pl-9 pr-7 py-1.5 bg-[#0d1117] border border-[#30363d] focus:border-blue-500 rounded-lg text-xs text-gray-200 placeholder-gray-500 focus:outline-none transition-colors"
              autoFocus
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSearchToggledCategories({});
                  setSearchToggledGcpDomains({});
                }}
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
              const isSearching = searchQuery.trim().length > 0;
              // NOTE: Auto-expand any category containing matches during search, while allowing manual toggling
              const isExpanded = isSearching
                ? (searchToggledCategories[section.id] !== undefined ? searchToggledCategories[section.id] : true)
                : (openCategories[section.id] ?? false);

              return (
                <div key={section.id} className="space-y-1.5 bg-[#0d1117]/40 rounded-lg border border-[#30363d]/60 p-2.5">
                  {/* Collapsible Category Header */}
                  <button
                    type="button"
                    onClick={() => toggleCategory(section.id)}
                    className="w-full flex items-center justify-between text-left hover:text-white transition-colors cursor-pointer group select-none"
                    data-testid={section.id === 'google_workspace_mcp' ? 'modal-category-google_workspace_mcp' : `toggle-modal-tool-section-${section.id}`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-200 transition-transform shrink-0" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-200 transition-transform shrink-0" />
                      )}
                      {section.icon}
                      <span className="text-xs font-bold text-gray-200 group-hover:text-white tracking-tight">
                        {section.title}
                      </span>
                      <span className="text-[10px] text-gray-500 hidden sm:inline">
                        — {section.subtitle}
                      </span>
                    </div>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono font-bold shrink-0 ${section.badgeColor}`}>
                      {section.tools.length}
                    </span>
                  </button>

                  {/* Tool Items (Collapsible) */}
                  {isExpanded && (
                    section.isGcpGroup ? (
                      /* Sub-accordions for Google Cloud MCP Domains */
                      <div className="space-y-2 pt-1 border-t border-[#30363d]/40">
                        {GOOGLE_CLOUD_MCP_DOMAINS.map((domain) => {
                          const domainTools = section.tools.filter((t) => {
                            const sDef = GOOGLE_CLOUD_MCP_SERVERS.find((s) => s.id === t.id);
                            return sDef?.domain === domain.id;
                          });

                          if (domainTools.length === 0) return null;

                          const isDomainExpanded = isSearching
                            ? (searchToggledGcpDomains[domain.id] !== undefined ? searchToggledGcpDomains[domain.id] : true)
                            : (openGcpDomains[domain.id] ?? false);

                          return (
                            <div key={domain.id} className="space-y-1 bg-[#161b22]/40 rounded-md border border-[#30363d]/40 p-1.5">
                              {/* Collapsible Domain Header */}
                              <button
                                type="button"
                                onClick={() => toggleGcpDomain(domain.id)}
                                className="w-full flex items-center justify-between text-left hover:text-white transition-colors cursor-pointer group select-none py-0.5 px-1 rounded hover:bg-[#161b22]"
                                data-testid={`toggle-modal-gcp-domain-${domain.id}`}
                              >
                                <div className="flex items-center gap-1.5 min-w-0">
                                  {isDomainExpanded ? (
                                    <ChevronDown className="w-3 h-3 text-gray-400 group-hover:text-gray-200 transition-transform shrink-0" />
                                  ) : (
                                    <ChevronRight className="w-3 h-3 text-gray-400 group-hover:text-gray-200 transition-transform shrink-0" />
                                  )}
                                  {getGcpDomainIcon(domain.icon)}
                                  <span className="text-[10.5px] font-semibold text-gray-300 group-hover:text-white truncate">
                                    {domain.label}
                                  </span>
                                </div>
                                <span className="text-[8.5px] px-1 py-0.2 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 font-mono font-medium shrink-0">
                                  {domainTools.length}
                                </span>
                              </button>

                              {/* Domain Tool Items */}
                              {isDomainExpanded && (
                                <div className="space-y-1.5 pl-2 pt-1 border-l border-[#30363d]/40 mt-1">
                                  {domainTools.map((tool) => {
                                    const isAlreadyAdded = existingToolIds.includes(tool.id);

                                    return (
                                      <div
                                        key={tool.id}
                                        title={tool.name}
                                        onClick={() => {
                                          if (!isAlreadyAdded) {
                                            onSelectTool(tool);
                                            onClose();
                                          }
                                        }}
                                        className={`flex items-start justify-between p-2 rounded-lg border transition-all ${
                                          isAlreadyAdded
                                            ? 'bg-[#0d1117]/60 border-[#30363d] opacity-60 cursor-default'
                                            : 'bg-[#0d1117] border-[#30363d] hover:border-sky-400 hover:bg-[#161b22] cursor-pointer shadow-sm hover:shadow-md hover:shadow-sky-950/30 group'
                                        }`}
                                        data-testid={`modal-gcp-mcp-tool-${tool.id}`}
                                      >
                                        <div className="flex items-start gap-2 min-w-0 flex-1">
                                          <div className="p-1.5 rounded-md bg-[#161b22] border border-[#30363d] group-hover:border-sky-500/40 shrink-0 mt-0.5 transition-colors">
                                            {getToolIcon(tool)}
                                          </div>
                                          <div className="min-w-0 flex-1 pr-2">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                              <span
                                                title={tool.name}
                                                className="text-xs font-bold text-gray-200 group-hover:text-sky-300 transition-colors"
                                              >
                                                {tool.name}
                                              </span>
                                              {renderLaunchStageBadge(tool.mcpConfig?.launchStage)}
                                            </div>
                                            {tool.mcpConfig?.serverUrl && (
                                              <div className="text-[9px] font-mono text-sky-400/70 truncate mt-0.5">
                                                {tool.mcpConfig.serverUrl}
                                              </div>
                                            )}
                                            <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-2 leading-relaxed">
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
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : section.isWorkspaceGroup ? (
                      /* Google Workspace Remote MCP Servers */
                      <div className="space-y-1.5 pt-1 border-t border-[#30363d]/40">
                        {section.tools.map((tool) => {
                          const isAlreadyAdded = existingToolIds.includes(tool.id);

                          return (
                            <div
                              key={tool.id}
                              title={tool.name}
                              onClick={() => {
                                if (!isAlreadyAdded) {
                                  onSelectTool(tool);
                                  onClose();
                                }
                              }}
                              className={`flex items-start justify-between p-2 rounded-lg border transition-all ${
                                isAlreadyAdded
                                  ? 'bg-[#0d1117]/60 border-[#30363d] opacity-60 cursor-default'
                                  : 'bg-[#0d1117] border-[#30363d] hover:border-emerald-400 hover:bg-[#161b22] cursor-pointer shadow-sm hover:shadow-md hover:shadow-emerald-950/30 group'
                              }`}
                              data-testid={`modal-workspace-mcp-tool-${tool.id}`}
                            >
                              <div className="flex items-start gap-2 min-w-0 flex-1">
                                <div className="p-1.5 rounded-md bg-[#161b22] border border-[#30363d] group-hover:border-emerald-500/40 shrink-0 mt-0.5 transition-colors">
                                  {getToolIcon(tool)}
                                </div>
                                <div className="min-w-0 flex-1 pr-2">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span
                                      title={tool.name}
                                      className="text-xs font-bold text-gray-200 group-hover:text-emerald-300 transition-colors"
                                    >
                                      {tool.name}
                                    </span>
                                    {renderLaunchStageBadge(tool.mcpConfig?.launchStage || 'Preview')}
                                  </div>
                                  {tool.mcpConfig?.serverUrl && (
                                    <div className="text-[9px] font-mono text-emerald-400/80 truncate mt-0.5">
                                      {tool.mcpConfig.serverUrl}
                                    </div>
                                  )}
                                  <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-2 leading-relaxed">
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
                                    className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-xs transition-colors cursor-pointer"
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
                    ) : (
                      /* Standard Tool Items */
                      <div className="space-y-1.5 pt-1 border-t border-[#30363d]/40">
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
                    )
                  )}
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
