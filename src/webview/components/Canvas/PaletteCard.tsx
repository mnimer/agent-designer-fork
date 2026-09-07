/**
 * PaletteCard Component
 *
 * Purpose:
 * Provides the slide-out catalog drawer for adding Agents, Tools, Workflow Triggers,
 * and Sample Workflows to the Visual Agent Designer canvas.
 *
 * Architectural Decisions:
 * - Author: Mike Nimer <mikenimer@google.com>
 * - Decision 1: All triggers in the Triggers tab panel are rendered with a unified
 *   orange color scheme (orange-400/orange-500) to distinguish triggers from blue agent nodes.
 * - Decision 2: PubSub and Scheduled triggers are explicitly disabled with visual
 *   dimming, disabled badges, and non-draggable cards until their backend runtime integrations
 *   are implemented.
 * - Decision 3: Spacing and layout follow the strict 8pt grid system.
 */

import React, { useState } from 'react';
import { 
  Bot, 
  Workflow, 
  GitFork, 
  Repeat, 
  Plus, 
  Layers, 
  ChevronDown, 
  ChevronUp, 
  GripVertical, 
  HelpCircle, 
  Network, 
  CheckSquare, 
  Sparkles, 
  Compass, 
  Share2, 
  Cpu,
  Wrench,
  Globe,
  Terminal,
  Database,
  FileText,
  Radio,
  Code,
  Edit2,
  Search,
  Zap,
  MessageSquare,
  Clock,
  FlaskConical,
  Play,
  Building2,
  Scale,
  FileCode,
  ArrowRight,
  FolderOpen,
  GitBranch,
  Split,
  Server,
  Plug,
  TerminalSquare,
  Globe2,
  History
} from 'lucide-react';
import { PATTERN_DEFINITIONS } from '../../data/patterns';
import { TRIGGER_CATALOG, TriggerCatalogItem } from '../../data/triggerDefinitions';
import { SAMPLES_CATALOG } from '../../data/sampleWorkflows';
import { categorizeTools } from '../../data/builtinTools';
import { PatternType, AgentKind, ToolDefinition, AgentData, TriggerType, SampleWorkflowDefinition } from '../../types';

interface PaletteCardProps {
  tools: ToolDefinition[];
  selectedAgent?: AgentData | null;
  onAddAgent: (kind?: AgentKind) => void;
  onAddPattern: (type: PatternType) => void;
  onAddTrigger: (type: TriggerType) => void;
  onOpenAdvisor: () => void;
  onOpenEditTool: (tool: ToolDefinition) => void;
  onCreateCustomTool: () => void;
  onCreateMcpTool?: () => void;
  onAddToolToAgent: (tool: ToolDefinition) => void;
  onOpenSample?: (sample: SampleWorkflowDefinition) => void;
}

export const PaletteCard: React.FC<PaletteCardProps> = ({
  tools,
  selectedAgent,
  onAddAgent,
  onAddPattern,
  onAddTrigger,
  onOpenAdvisor,
  onOpenEditTool,
  onCreateCustomTool,
  onCreateMcpTool,
  onAddToolToAgent,
  onOpenSample,
}) => {
  const [activeTab, setActiveTab] = useState<'agents' | 'tools' | 'triggers' | 'samples'>('agents');
  const [isPatternsOpen, setIsPatternsOpen] = useState(true);
  const [isOpen, setIsOpen] = useState(true);
  const [toolSearch, setToolSearch] = useState('');
  const [toolCategoryFilter, setToolCategoryFilter] = useState<'all' | 'mcp' | 'api' | 'builtin'>('all');

  const handleTabClick = (tab: 'agents' | 'tools' | 'triggers' | 'samples') => {
    if (!isOpen) {
      setActiveTab(tab);
      setIsOpen(true);
    } else if (activeTab === tab) {
      setIsOpen(false);
    } else {
      setActiveTab(tab);
    }
  };

  const handleDragStartAgent = (e: React.DragEvent, type: string, isPattern = false, agentKind?: string) => {
    e.dataTransfer.setData('application/reactflow/type', type);
    e.dataTransfer.setData('application/reactflow/isPattern', isPattern ? 'true' : 'false');
    if (agentKind) {
      e.dataTransfer.setData('application/reactflow/agentKind', agentKind);
    }
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragStartTool = (e: React.DragEvent, tool: ToolDefinition) => {
    e.dataTransfer.setData('application/reactflow/tool', JSON.stringify(tool));
    e.dataTransfer.setData('application/reactflow/type', 'tool');
    e.dataTransfer.effectAllowed = 'copy';
  };

  /**
   * Initiates drag-and-drop payload for a trigger catalog item.
   * NOTE: Blocks drag-and-drop for disabled triggers (pubsub and scheduled).
   */
  const handleDragStartTrigger = (e: React.DragEvent, triggerItem: TriggerCatalogItem) => {
    // Prevent drag action for unimplemented triggers
    if (triggerItem.type === 'pubsub' || triggerItem.type === 'scheduled') {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('application/reactflow/type', 'trigger');
    e.dataTransfer.setData('application/reactflow/triggerType', triggerItem.type);
    e.dataTransfer.setData('application/reactflow/triggerItem', JSON.stringify(triggerItem));
    e.dataTransfer.effectAllowed = 'move';
  };

  const getToolIcon = (tool: ToolDefinition) => {
    if (tool.builtinType === 'google_search' || tool.id === 'builtin_google_search') {
      return <Globe className="w-3.5 h-3.5 text-sky-400" />;
    }
    if (tool.builtinType === 'vertex_ai_search' || tool.id === 'builtin_vertex_ai_search') {
      return <Database className="w-3.5 h-3.5 text-amber-400" />;
    }
    if (tool.builtinType === 'load_web_page' || tool.id === 'builtin_load_web_page') {
      return <FileText className="w-3.5 h-3.5 text-sky-400" />;
    }
    if (tool.builtinType === 'request_input' || tool.id === 'builtin_request_input') {
      return <HelpCircle className="w-3.5 h-3.5 text-rose-400" />;
    }
    if (tool.builtinType === 'preload_memory' || tool.id === 'builtin_preload_memory') {
      return <History className="w-3.5 h-3.5 text-purple-400" />;
    }
    if (tool.builtinType === 'agent_as_tool' || tool.id === 'builtin_agent_as_tool') {
      return <Bot className="w-3.5 h-3.5 text-indigo-400" />;
    }
    switch (tool.type) {
      case 'mcp':
        return <Server className="w-3.5 h-3.5 text-purple-400" />;
      case 'search':
        return <Globe className="w-3.5 h-3.5 text-sky-400" />;
      case 'code':
        return <Terminal className="w-3.5 h-3.5 text-emerald-400" />;
      case 'db':
        return <Database className="w-3.5 h-3.5 text-amber-400" />;
      case 'rag':
        return <FileText className="w-3.5 h-3.5 text-purple-400" />;
      case 'api':
        return <Radio className="w-3.5 h-3.5 text-rose-400" />;
      default:
        return <Code className="w-3.5 h-3.5 text-indigo-400" />;
    }
  };

  /**
   * Resolves the icon for a trigger type.
   * NOTE: All triggers in the triggers panel are uniformly styled in orange (text-orange-400).
   */
  const getTriggerIcon = (type: TriggerType) => {
    switch (type) {
      case 'chat':
        return <MessageSquare className="w-4 h-4 text-orange-400" />;
      case 'pubsub':
        return <Radio className="w-4 h-4 text-orange-400" />;
      case 'scheduled':
        return <Clock className="w-4 h-4 text-orange-400" />;
      case 'tester':
        return <FlaskConical className="w-4 h-4 text-orange-400" />;
      case 'eventarc':
        return <Zap className="w-4 h-4 text-orange-400" />;
      default:
        return <Zap className="w-4 h-4 text-orange-400" />;
    }
  };

  const getPatternIcon = (iconName: string) => {
    switch (iconName) {
      case 'Workflow':
        return <Workflow className="w-4 h-4 text-sky-400" />;
      case 'GitFork':
        return <GitFork className="w-4 h-4 text-emerald-400" />;
      case 'Network':
        return <Network className="w-4 h-4 text-amber-400" />;
      case 'Repeat':
        return <Repeat className="w-4 h-4 text-purple-400" />;
      case 'CheckSquare':
        return <CheckSquare className="w-4 h-4 text-rose-400" />;
      case 'Sparkles':
        return <Sparkles className="w-4 h-4 text-yellow-400" />;
      case 'Compass':
        return <Compass className="w-4 h-4 text-blue-400" />;
      case 'Scale':
        return <Scale className="w-4 h-4 text-pink-400" />;
      case 'Layers':
      default:
        return <Layers className="w-4 h-4 text-indigo-400" />;
    }
  };

  const filteredTools = tools.filter((t) => {
    const matchesSearch = 
      t.name.toLowerCase().includes(toolSearch.toLowerCase()) ||
      t.description.toLowerCase().includes(toolSearch.toLowerCase()) ||
      t.type.toLowerCase().includes(toolSearch.toLowerCase()) ||
      (t.mcpConfig?.serverName && t.mcpConfig.serverName.toLowerCase().includes(toolSearch.toLowerCase()));

    if (!matchesSearch) return false;

    if (toolCategoryFilter === 'mcp') return t.type === 'mcp';
    if (toolCategoryFilter === 'api') return t.type === 'api' || t.type === 'custom';
    if (toolCategoryFilter === 'builtin') return t.type === 'search' || t.type === 'code' || t.type === 'db' || t.type === 'rag';
    return true;
  });

  const mcpToolsCount = tools.filter((t) => t.type === 'mcp').length;

  return (
    <div className="absolute top-3 left-0 z-20 flex items-start select-none group/palette">
      {/* VERTICAL MENU TABS FIXED TO LEFT EDGE (Blender-style) */}
      <div
        className={`flex flex-col gap-0.5 p-0.5 bg-[#161b22]/95 backdrop-blur-xl border border-l-0 border-[#30363d] shadow-2xl transition-all duration-150 z-30 ${
          isOpen ? 'rounded-none border-r-0' : 'rounded-r-lg hover:border-gray-500'
        }`}
      >
        {/* Tab 1: Agents */}
        <button
          type="button"
          onClick={() => handleTabClick('agents')}
          className={`group relative flex flex-col items-center justify-center w-7 py-2 px-0.5 rounded-r-md transition-all cursor-pointer ${
            isOpen && activeTab === 'agents'
              ? 'bg-[#21262d] text-blue-400 border border-blue-500/50 shadow-sm'
              : 'text-gray-400 hover:text-gray-200 hover:bg-[#21262d]/60 border border-transparent'
          }`}
          title="Agents & Patterns (Click to open/close)"
        >
          <Bot
            className={`w-3.5 h-3.5 mb-1 shrink-0 transition-transform group-hover:scale-110 ${
              isOpen && activeTab === 'agents' ? 'text-blue-400' : 'text-gray-400 group-hover:text-blue-300'
            }`}
          />
          <span className="[writing-mode:vertical-rl] rotate-180 text-[9px] font-bold uppercase tracking-wider py-0.5">
            Agents
          </span>
        </button>

        {/* Tab 2: Tools */}
        <button
          type="button"
          onClick={() => handleTabClick('tools')}
          className={`group relative flex flex-col items-center justify-center w-7 py-2 px-0.5 rounded-r-md transition-all cursor-pointer ${
            isOpen && activeTab === 'tools'
              ? 'bg-[#21262d] text-emerald-400 border border-emerald-500/50 shadow-sm'
              : 'text-gray-400 hover:text-gray-200 hover:bg-[#21262d]/60 border border-transparent'
          }`}
          title="Tools Registry (Click to open/close)"
        >
          <Wrench
            className={`w-3.5 h-3.5 mb-1 shrink-0 transition-transform group-hover:scale-110 ${
              isOpen && activeTab === 'tools' ? 'text-emerald-400' : 'text-gray-400 group-hover:text-emerald-300'
            }`}
          />
          <span className="[writing-mode:vertical-rl] rotate-180 text-[9px] font-bold uppercase tracking-wider py-0.5">
            Tools
          </span>
          <span className="text-[7.5px] font-mono mt-0.5 px-0.5 rounded bg-[#0d1117] text-gray-400 border border-[#30363d]">
            {tools.length}
          </span>
        </button>

        {/* Tab 3: Triggers */}
        <button
          type="button"
          onClick={() => handleTabClick('triggers')}
          className={`group relative flex flex-col items-center justify-center w-7 py-2 px-0.5 rounded-r-md transition-all cursor-pointer ${
            isOpen && activeTab === 'triggers'
              ? 'bg-[#21262d] text-orange-400 border border-orange-500/50 shadow-sm'
              : 'text-gray-400 hover:text-gray-200 hover:bg-[#21262d]/60 border border-transparent'
          }`}
          title="Workflow Triggers & Test Suite (Click to open/close)"
        >
          <Zap
            className={`w-3.5 h-3.5 mb-1 shrink-0 transition-transform group-hover:scale-110 ${
              isOpen && activeTab === 'triggers' ? 'text-orange-400' : 'text-gray-400 group-hover:text-orange-300'
            }`}
          />
          <span className="[writing-mode:vertical-rl] rotate-180 text-[9px] font-bold uppercase tracking-wider py-0.5">
            Triggers
          </span>
          <span className="text-[7.5px] font-mono mt-0.5 px-0.5 rounded bg-orange-500/20 text-orange-300 border border-orange-500/30">
            {TRIGGER_CATALOG.length}
          </span>
        </button>

        {/* Tab 4: Samples */}
        <button
          type="button"
          onClick={() => handleTabClick('samples')}
          className={`group relative flex flex-col items-center justify-center w-7 py-2 px-0.5 rounded-r-md transition-all cursor-pointer ${
            isOpen && activeTab === 'samples'
              ? 'bg-[#21262d] text-purple-400 border border-purple-500/50 shadow-sm'
              : 'text-gray-400 hover:text-gray-200 hover:bg-[#21262d]/60 border border-transparent'
          }`}
          title="Samples & Blueprints (Click to open/close)"
        >
          <Sparkles
            className={`w-3.5 h-3.5 mb-1 shrink-0 transition-transform group-hover:scale-110 ${
              isOpen && activeTab === 'samples' ? 'text-purple-400' : 'text-gray-400 group-hover:text-purple-300'
            }`}
          />
          <span className="[writing-mode:vertical-rl] rotate-180 text-[9px] font-bold uppercase tracking-wider py-0.5">
            Samples
          </span>
          <span className="text-[7.5px] font-mono mt-0.5 px-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
            {SAMPLES_CATALOG.length}
          </span>
        </button>
      </div>

      {/* FLOATING CARD / SIDEBAR BODY (Visible when isOpen) */}
      {isOpen && (
        <div className="w-80 backdrop-blur-xl bg-[#161b22]/95 rounded-r-xl border border-[#30363d] shadow-2xl overflow-hidden transition-all duration-150 flex flex-col max-h-[calc(66vh-24px)] text-[#c9d1d9]">
          {/* Palette Header */}
          <div className="flex items-center justify-between px-3.5 py-2.5 bg-[#161b22] border-b border-[#30363d] shrink-0">
            <div className="flex items-center gap-2">
              {activeTab === 'agents' && <Bot className="w-4 h-4 text-blue-400" />}
              {activeTab === 'tools' && <Wrench className="w-4 h-4 text-emerald-400" />}
              {activeTab === 'triggers' && <Zap className="w-4 h-4 text-orange-400" />}
              {activeTab === 'samples' && <Sparkles className="w-4 h-4 text-purple-400" />}
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-300">
                {activeTab === 'agents' && 'Agents & Patterns'}
                {activeTab === 'tools' && 'Tool Registry (0)'}
                {activeTab === 'triggers' && 'Workflow Triggers & QA'}
                {activeTab === 'samples' && 'Workflow Samples (0)'}
              </h3>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setIsOpen(false)}
                title="Close Palette"
                className="p-1 rounded-md hover:bg-[#21262d] text-gray-400 hover:text-white transition-colors cursor-pointer text-xs"
              >
                ✕
              </button>
            </div>
          </div>

      {/* TAB 1: AGENTS & PATTERNS */}
      {activeTab === 'agents' && (
        <div className="p-3 space-y-4 overflow-y-auto flex-1">
          {/* Basic Agent Types Section */}
          <div>
            <div className="text-[11px] font-semibold text-blue-400 mb-2 uppercase tracking-wide flex items-center justify-between">
              <span>Basic Agent Types</span>
              <span className="text-[9px] text-gray-400 font-normal lowercase">drag to canvas</span>
            </div>

            <div className="space-y-1.5">
              {/* Standard Agent */}
              <div
                draggable
                onDragStart={(e) => handleDragStartAgent(e, 'single_agent', false, 'standard')}
                className="group relative flex items-center justify-between p-2.5 bg-[#21262d] border border-[#30363d] rounded-lg cursor-move hover:bg-[#30363d] hover:border-blue-500/50 transition-all shadow-sm active:cursor-grabbing"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <GripVertical className="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-300 shrink-0" />
                  <div className="p-1.5 rounded-md bg-[#0d1117] border border-[#30363d] shrink-0">
                    <Bot className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-xs text-[#c9d1d9] flex items-center gap-1.5">
                      <span>Agent</span>
                      <span className="text-[9px] px-1 py-0.2 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                        Standard
                      </span>
                    </div>
                    <div className="text-[10px] text-gray-400 truncate max-w-[140px]">
                      LLM agent with tools & prompt
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onAddAgent('standard')}
                  title="Add Standard Agent"
                  className="p-1.5 rounded bg-[#0d1117] hover:bg-blue-600 border border-[#30363d] text-gray-300 hover:text-white transition-colors cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>

          {/* Multi-Agent Patterns Section */}
          <div className="border-t border-[#30363d] pt-3">
            <button
              onClick={() => setIsPatternsOpen(!isPatternsOpen)}
              className="w-full flex items-center justify-between text-[11px] font-semibold text-purple-400 mb-2 uppercase tracking-wide cursor-pointer hover:text-purple-300"
            >
              <div className="flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5" />
                <span>Multi-Agent Patterns (0)</span>
              </div>
              {isPatternsOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {isPatternsOpen && (
              <div className="text-[11px] text-gray-500 italic p-3 text-center bg-[#0d1117] rounded-lg border border-dashed border-[#30363d]">
                No multi-agent patterns available in this release.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: TOOLS CATALOG */}
      {activeTab === 'tools' && (
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {/* Header & Quick Action Buttons */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-purple-300 uppercase tracking-wide flex items-center gap-1.5">
                <Wrench className="w-3.5 h-3.5 text-purple-400" />
                <span>Tool Registry ({tools.length})</span>
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onCreateMcpTool || onCreateCustomTool}
                  className="flex items-center gap-1 px-2 py-1 rounded bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 border border-purple-500/40 text-[10px] font-bold cursor-pointer transition-colors"
                  title="Register new MCP server tool"
                >
                  <Plug className="w-3 h-3 text-purple-400" />
                  <span>+ MCP</span>
                </button>
                <button
                  type="button"
                  onClick={onCreateCustomTool}
                  className="flex items-center gap-1 px-2 py-1 rounded bg-green-500/20 text-green-300 hover:bg-green-500/30 border border-green-500/40 text-[10px] font-bold cursor-pointer transition-colors"
                  title="Create custom function or API tool"
                >
                  <Plus className="w-3 h-3" />
                  <span>+ Tool</span>
                </button>
              </div>
            </div>

            {/* Tool Search Bar */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-500 absolute left-2.5 top-2" />
              <input
                type="text"
                value={toolSearch}
                onChange={(e) => setToolSearch(e.target.value)}
                placeholder="Search tools & datastores..."
                className="w-full pl-8 pr-6 py-1.5 bg-[#0d1117] border border-[#30363d] focus:border-purple-500 rounded-md text-[11px] text-gray-200 placeholder-gray-500 focus:outline-none"
              />
              {toolSearch && (
                <button
                  type="button"
                  onClick={() => setToolSearch('')}
                  className="absolute right-2 top-2 text-gray-400 hover:text-gray-200 text-xs cursor-pointer"
                >
                  ×
                </button>
              )}
            </div>
          </div>

          {/* Categorized Tool Sections */}
          {(() => {
            // NOTE: Filter tools by name, description, category, or builtin type
            const filtered = tools.filter((t) => {
              if (!toolSearch.trim()) return true;
              const q = toolSearch.toLowerCase();
              return (
                t.name.toLowerCase().includes(q) ||
                t.description.toLowerCase().includes(q) ||
                (t.category && t.category.toLowerCase().includes(q)) ||
                (t.builtinType && t.builtinType.toLowerCase().includes(q))
              );
            });
            const categorized = categorizeTools(filtered);

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

            const totalMatches = filtered.length;

            if (totalMatches === 0) {
              return (
                <div className="text-center py-8 text-gray-500 text-xs italic bg-[#0d1117] rounded-lg border border-dashed border-[#30363d]">
                  No tools found matching &quot;{toolSearch}&quot;.
                </div>
              );
            }

            return (
              <div className="space-y-4">
                {categorySections.map((section) => {
                  if (section.tools.length === 0) return null;

                  return (
                    <div key={section.id} className="space-y-2">
                      <div className="flex items-center justify-between pb-1 border-b border-[#30363d]/60">
                        <div className="flex items-center gap-1.5">
                          {section.icon}
                          <span className="text-[11px] font-bold text-gray-300 tracking-tight">
                            {section.title}
                          </span>
                        </div>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono font-bold ${section.badgeColor}`}>
                          {section.tools.length}
                        </span>
                      </div>

                      <div className="space-y-2">
                        {section.tools.map((t) => {
                          const isAttached = selectedAgent?.tools?.some((at) => at.id === t.id);

                          return (
                            <div
                              key={t.id}
                              draggable
                              onDragStart={(e) => handleDragStartTool(e, t)}
                              className="group relative flex items-start gap-2 p-2 bg-[#0d1117] hover:bg-[#161b22] border border-[#30363d] hover:border-purple-500/50 rounded-lg transition-all cursor-grab active:cursor-grabbing shadow-xs"
                            >
                              <div className="mt-0.5 text-gray-500 group-hover:text-gray-300">
                                <GripVertical className="w-3 h-3" />
                              </div>

                              <div className="p-1 rounded bg-[#161b22] border border-[#30363d] shrink-0 mt-0.5">
                                {getToolIcon(t)}
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-1">
                                  <span className="text-[11px] font-bold text-gray-200 group-hover:text-white truncate">
                                    {t.name}
                                  </span>
                                  {isAttached && (
                                    <span className="text-[8px] px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold shrink-0">
                                      Attached
                                    </span>
                                  )}
                                </div>
                                <p className="text-[10px] text-gray-400 line-clamp-2 leading-tight mt-0.5">
                                  {t.description}
                                </p>
                              </div>

                              {/* Hover / Quick Actions */}
                              <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => onOpenEditTool(t)}
                                  className="p-1 rounded text-gray-400 hover:text-white hover:bg-[#30363d] transition-colors cursor-pointer"
                                  title="Configure tool properties"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onAddToolToAgent(t)}
                                  className="p-1 rounded text-purple-400 hover:text-purple-200 hover:bg-purple-900/40 transition-colors cursor-pointer"
                                  title="Add to selected Agent"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* TAB 3: TRIGGERS CATALOG */}
      {activeTab === 'triggers' && (
        <div className="p-3 space-y-3.5 overflow-y-auto flex-1">
          {(() => {
            const testSuiteTrigger = TRIGGER_CATALOG.find((t) => t.type === 'tester');
            const otherTriggers = TRIGGER_CATALOG.filter((t) => t.type !== 'tester');

            return (
              <>
                {/* SECTION 1: Test Suite & QA Triggers */}
                {testSuiteTrigger && (
                  <div>
                    <div className="text-[11px] font-semibold text-orange-400 mb-2 uppercase tracking-wide flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <FlaskConical className="w-3.5 h-3.5 text-orange-400" />
                        Test Suite & Validation
                      </span>
                      <span className="text-[9px] text-orange-300/90 bg-orange-950/50 px-1.5 py-0.2 rounded border border-orange-500/40 font-mono">
                        QA Suite
                      </span>
                    </div>

                    <div
                      draggable
                      onDragStart={(e) => handleDragStartTrigger(e, testSuiteTrigger)}
                      className="group relative flex items-start justify-between p-2.5 bg-[#21262d] border border-orange-500/40 rounded-lg cursor-grab active:cursor-grabbing hover:bg-[#30363d] hover:border-orange-400 shadow-sm transition-all shadow-orange-950/20"
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <GripVertical className="w-3.5 h-3.5 text-gray-400 group-hover:text-orange-400 shrink-0 mt-1" />
                        <div className="p-1.5 rounded-md bg-[#0d1117] border border-orange-500/30 shrink-0 mt-0.5 shadow-xs">
                          <FlaskConical className="w-4 h-4 text-orange-400" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-xs text-white truncate max-w-[130px]">
                              {testSuiteTrigger.name}
                            </span>
                            <span className="text-[8px] uppercase font-mono px-1.5 py-0.2 rounded bg-orange-500/20 text-orange-300 border border-orange-500/30">
                              {testSuiteTrigger.badge}
                            </span>
                          </div>
                          <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-2 leading-relaxed">
                            {testSuiteTrigger.description}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => onAddTrigger(testSuiteTrigger.type)}
                        title="Add Test Suite Trigger to Root Agent"
                        className="p-1.5 rounded bg-[#0d1117] hover:bg-orange-600 border border-[#30363d] text-gray-300 hover:text-white transition-colors cursor-pointer shrink-0 ml-1 mt-0.5"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}

                {/* SECTION 2: Workflow Triggers */}
                <div className="border-t border-[#30363d] pt-3">
                  <div className="text-[11px] font-semibold text-orange-400 mb-2 uppercase tracking-wide flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-orange-400" />
                      Workflow Triggers
                    </span>
                    <span className="text-[9px] text-orange-300/80 bg-orange-950/40 px-1.5 py-0.2 rounded border border-orange-500/30">
                      Root Only
                    </span>
                  </div>

                  <div className="space-y-1.5 max-h-[calc(66vh-240px)] overflow-y-auto pr-1">
                    {otherTriggers.map((trigger) => {
                      const isDisabled = trigger.type === 'pubsub' || trigger.type === 'scheduled';

                      return (
                        <div
                          key={trigger.id}
                          draggable={!isDisabled}
                          onDragStart={(e) => {
                            if (isDisabled) {
                              e.preventDefault();
                              return;
                            }
                            handleDragStartTrigger(e, trigger);
                          }}
                          className={`group relative flex items-start justify-between p-2.5 rounded-lg border transition-all shadow-sm ${
                            isDisabled
                              ? 'bg-[#161b22] border-orange-500/20 opacity-50 cursor-not-allowed select-none'
                              : 'bg-[#21262d] border-orange-500/40 cursor-grab active:cursor-grabbing hover:bg-[#30363d] hover:border-orange-400 shadow-orange-950/20'
                          }`}
                          title={isDisabled ? `${trigger.name} (Disabled until implemented)` : trigger.name}
                        >
                          <div className="flex items-start gap-2.5 min-w-0">
                            <GripVertical
                              className={`w-3.5 h-3.5 shrink-0 mt-1 ${
                                isDisabled
                                  ? 'text-gray-600 cursor-not-allowed'
                                  : 'text-gray-400 group-hover:text-orange-400'
                              }`}
                            />
                            <div
                              className={`p-1.5 rounded-md bg-[#0d1117] shrink-0 mt-0.5 border ${
                                isDisabled ? 'border-orange-500/10' : 'border-orange-500/30 shadow-xs'
                              }`}
                            >
                              {getTriggerIcon(trigger.type)}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-xs text-white truncate max-w-[130px]">
                                  {trigger.name}
                                </span>
                                {isDisabled ? (
                                  <span className="text-[8px] uppercase font-mono px-1.5 py-0.2 rounded bg-orange-950/60 text-orange-300/70 border border-orange-500/20">
                                    Disabled
                                  </span>
                                ) : (
                                  <span className="text-[8px] uppercase font-mono px-1.5 py-0.2 rounded bg-orange-500/20 text-orange-300 border border-orange-500/30">
                                    {trigger.badge}
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-2 leading-relaxed">
                                {trigger.description}
                              </p>
                              {isDisabled && (
                                <p className="text-[9px] text-orange-400/70 font-mono mt-1 italic">
                                  Disabled until implemented
                                </p>
                              )}
                            </div>
                          </div>

                          <button
                            type="button"
                            disabled={isDisabled}
                            onClick={() => {
                              if (!isDisabled) {
                                onAddTrigger(trigger.type);
                              }
                            }}
                            title={
                              isDisabled
                                ? `${trigger.name} is disabled until implemented`
                                : `Add ${trigger.name} to Root Agent`
                            }
                            className={`p-1.5 rounded border text-gray-300 shrink-0 ml-1 mt-0.5 transition-colors ${
                              isDisabled
                                ? 'bg-[#0d1117] border-gray-700/40 text-gray-600 cursor-not-allowed opacity-40'
                                : 'bg-[#0d1117] hover:bg-orange-600 border-[#30363d] hover:text-white cursor-pointer'
                            }`}
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* TAB 4: SAMPLES & TEMPLATES */}
      {activeTab === 'samples' && (
        <div className="p-3 space-y-3 overflow-y-auto flex-1">
          <div className="text-[11px] font-semibold text-purple-400 uppercase tracking-wide flex items-center justify-between">
            <span>Ready-to-Use Workflows (0)</span>
          </div>

          <div className="text-center py-6 text-gray-500 text-xs italic bg-[#0d1117] rounded-lg border border-dashed border-[#30363d]">
            No sample workflows available in this release.
          </div>
        </div>
      )}

      {/* Floating Card Footer Tip */}
      <div className="px-3.5 py-2 bg-[#0d1117] border-t border-[#30363d] text-[10px] text-gray-400 flex items-center justify-between shrink-0">
        <span>
          💡 {activeTab === 'agents' 
            ? 'Drag onto diagram to insert' 
            : activeTab === 'tools' 
            ? 'Drag onto Agent node to attach'
            : activeTab === 'triggers'
            ? 'Drag onto canvas to auto-link to Root Agent'
            : 'Click any sample to open in a new .agent tab'}
        </span>
      </div>
    </div>
  )}
</div>
  );
};
