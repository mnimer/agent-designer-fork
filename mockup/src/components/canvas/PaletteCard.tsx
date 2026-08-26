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
  Globe2
} from 'lucide-react';
import { PATTERN_DEFINITIONS } from '../../data/patterns';
import { TRIGGER_CATALOG, TriggerCatalogItem } from '../../data/triggerDefinitions';
import { SAMPLES_CATALOG } from '../../data/sampleWorkflows';
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

  const handleDragStartTrigger = (e: React.DragEvent, triggerItem: TriggerCatalogItem) => {
    e.dataTransfer.setData('application/reactflow/type', 'trigger');
    e.dataTransfer.setData('application/reactflow/triggerType', triggerItem.type);
    e.dataTransfer.setData('application/reactflow/triggerItem', JSON.stringify(triggerItem));
    e.dataTransfer.effectAllowed = 'move';
  };

  const getToolIcon = (type: ToolDefinition['type']) => {
    switch (type) {
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

  const getTriggerIcon = (type: TriggerType) => {
    switch (type) {
      case 'chat':
        return <MessageSquare className="w-4 h-4 text-emerald-400" />;
      case 'pubsub':
        return <Radio className="w-4 h-4 text-amber-400" />;
      case 'scheduled':
        return <Clock className="w-4 h-4 text-sky-400" />;
      case 'tester':
        return <FlaskConical className="w-4 h-4 text-pink-400" />;
      case 'eventarc':
        return <Zap className="w-4 h-4 text-purple-400" />;
      default:
        return <Zap className="w-4 h-4 text-amber-400" />;
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
              ? 'bg-[#21262d] text-amber-400 border border-amber-500/50 shadow-sm'
              : 'text-gray-400 hover:text-gray-200 hover:bg-[#21262d]/60 border border-transparent'
          }`}
          title="Workflow Triggers & Test Suite (Click to open/close)"
        >
          <Zap
            className={`w-3.5 h-3.5 mb-1 shrink-0 transition-transform group-hover:scale-110 ${
              isOpen && activeTab === 'triggers' ? 'text-amber-400' : 'text-gray-400 group-hover:text-amber-300'
            }`}
          />
          <span className="[writing-mode:vertical-rl] rotate-180 text-[9px] font-bold uppercase tracking-wider py-0.5">
            Triggers
          </span>
          <span className="text-[7.5px] font-mono mt-0.5 px-0.5 rounded bg-pink-500/20 text-pink-300 border border-pink-500/30">
            QA
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
              {activeTab === 'triggers' && <Zap className="w-4 h-4 text-amber-400" />}
              {activeTab === 'samples' && <Sparkles className="w-4 h-4 text-purple-400" />}
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-300">
                {activeTab === 'agents' && 'Agents & Patterns'}
                {activeTab === 'tools' && `Tool Registry (${tools.length})`}
                {activeTab === 'triggers' && 'Workflow Triggers & QA'}
                {activeTab === 'samples' && `Workflow Samples (${SAMPLES_CATALOG.length})`}
              </h3>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={onOpenAdvisor}
                title="Agent Architecture Advisor"
                className="p-1 rounded-md hover:bg-blue-500/20 text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
              >
                <HelpCircle className="w-3.5 h-3.5" />
              </button>
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

              {/* A2A Protocol Agent */}
              <div
                draggable
                onDragStart={(e) => handleDragStartAgent(e, 'single_agent', false, 'a2a')}
                className="group relative flex items-center justify-between p-2.5 bg-[#21262d] border border-[#30363d] rounded-lg cursor-move hover:bg-[#30363d] hover:border-cyan-500/50 transition-all shadow-sm active:cursor-grabbing"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <GripVertical className="w-3.5 h-3.5 text-gray-400 group-hover:text-cyan-400 shrink-0" />
                  <div className="p-1.5 rounded-md bg-[#0d1117] border border-cyan-500/40 shrink-0">
                    <Share2 className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-xs text-[#c9d1d9] flex items-center gap-1.5">
                      <span>A2A Agent</span>
                      <span className="text-[9px] px-1 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-mono">
                        Protocol
                      </span>
                    </div>
                    <div className="text-[10px] text-gray-400 truncate max-w-[140px]">
                      Remote peer agent (A2A JSON-RPC)
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onAddAgent('a2a')}
                  title="Add A2A Protocol Agent"
                  className="p-1.5 rounded bg-[#0d1117] hover:bg-cyan-600 border border-[#30363d] text-gray-300 hover:text-white transition-colors cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>

              {/* Conditional Router (if/else) Node */}
              <div
                draggable
                onDragStart={(e) => handleDragStartAgent(e, 'single_agent', false, 'router')}
                className="group relative flex items-center justify-between p-2.5 bg-[#21262d] border border-[#30363d] rounded-lg cursor-move hover:bg-[#30363d] hover:border-purple-500/50 transition-all shadow-sm active:cursor-grabbing"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <GripVertical className="w-3.5 h-3.5 text-gray-400 group-hover:text-purple-400 shrink-0" />
                  <div className="p-1.5 rounded-md bg-[#0d1117] border border-purple-500/40 shrink-0">
                    <GitBranch className="w-4 h-4 text-purple-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-xs text-[#c9d1d9] flex items-center gap-1.5">
                      <span>Router</span>
                      <span className="text-[9px] px-1 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-mono">
                        If / Else
                      </span>
                    </div>
                    <div className="text-[10px] text-gray-400 truncate max-w-[140px]">
                      Conditional branching logic
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onAddAgent('router')}
                  title="Add Conditional Router (if/else)"
                  className="p-1.5 rounded bg-[#0d1117] hover:bg-purple-600 border border-[#30363d] text-gray-300 hover:text-white transition-colors cursor-pointer"
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
                <span>Multi-Agent Patterns ({PATTERN_DEFINITIONS.length})</span>
              </div>
              {isPatternsOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {isPatternsOpen && (
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {PATTERN_DEFINITIONS.map((p) => (
                  <div
                    key={p.id}
                    draggable
                    onDragStart={(e) => handleDragStartAgent(e, p.type, true)}
                    className="group flex items-center justify-between p-2 bg-[#21262d] border border-[#30363d] rounded-lg cursor-move hover:bg-[#30363d] hover:border-purple-500/50 transition-all shadow-sm active:cursor-grabbing"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <GripVertical className="w-3 h-3 text-gray-400 group-hover:text-purple-400 shrink-0" />
                      <div className="p-1 rounded bg-[#0d1117] border border-[#30363d] shrink-0">
                        {getPatternIcon(p.iconName)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-xs text-[#c9d1d9] flex items-center gap-1.5 truncate">
                          <span className="truncate">{p.name}</span>
                          {p.badge && (
                            <span className="text-[8px] px-1 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-medium shrink-0">
                              {p.badge}
                            </span>
                          )}
                        </div>
                        <div className="text-[9.5px] text-gray-400 truncate max-w-[170px]" title={p.description}>
                          {p.description}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onAddPattern(p.type)}
                      title={`Add ${p.name}`}
                      className="p-1 rounded bg-[#0d1117] hover:bg-purple-600 border border-[#30363d] text-gray-300 hover:text-white transition-colors cursor-pointer shrink-0 ml-1.5"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: TOOLS CATALOG */}
      {activeTab === 'tools' && (
        <div className="p-3 space-y-3 overflow-y-auto flex-1">
          {/* Header & Quick Action Buttons */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-purple-300 uppercase tracking-wide flex items-center gap-1">
                <Wrench className="w-3.5 h-3.5 text-purple-400" />
                <span>Tool Registry ({tools.length})</span>
              </span>
              <div className="flex items-center gap-1.5">
                {onCreateMcpTool && (
                  <button
                    type="button"
                    onClick={onCreateMcpTool}
                    className="flex items-center gap-1 px-2 py-0.5 rounded bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 text-[10px] font-bold cursor-pointer transition-colors shadow-xs"
                    title="Add Model Context Protocol (MCP) Server"
                  >
                    <Plug className="w-3 h-3 text-purple-400" />
                    <span>+ MCP Server</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={onCreateCustomTool}
                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-green-500/20 hover:bg-green-500/30 text-green-300 border border-green-500/40 text-[10px] font-bold cursor-pointer transition-colors"
                  title="Add Custom REST API or Function"
                >
                  <Plus className="w-3 h-3" />
                  <span>+ API Tool</span>
                </button>
              </div>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search tools, MCP servers, or APIs..."
                value={toolSearch}
                onChange={(e) => setToolSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-[#0d1117] border border-[#30363d] rounded-lg text-xs text-[#c9d1d9] focus:outline-none focus:border-purple-500 placeholder-gray-500"
              />
            </div>

            {/* Category Filter Chips */}
            <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none">
              <button
                type="button"
                onClick={() => setToolCategoryFilter('all')}
                className={`px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap cursor-pointer transition-colors ${
                  toolCategoryFilter === 'all'
                    ? 'bg-[#30363d] text-white font-bold'
                    : 'bg-[#161b22] text-gray-400 hover:text-gray-200 border border-[#30363d]'
                }`}
              >
                All ({tools.length})
              </button>
              <button
                type="button"
                onClick={() => setToolCategoryFilter('mcp')}
                className={`px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap cursor-pointer flex items-center gap-1 transition-colors ${
                  toolCategoryFilter === 'mcp'
                    ? 'bg-purple-900/60 text-purple-200 border border-purple-500/60 font-bold'
                    : 'bg-[#161b22] text-purple-400 hover:bg-purple-950/40 border border-[#30363d]'
                }`}
              >
                <Plug className="w-2.5 h-2.5" />
                <span>MCP Servers ({mcpToolsCount})</span>
              </button>
              <button
                type="button"
                onClick={() => setToolCategoryFilter('api')}
                className={`px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap cursor-pointer transition-colors ${
                  toolCategoryFilter === 'api'
                    ? 'bg-green-900/60 text-green-200 border border-green-500/60 font-bold'
                    : 'bg-[#161b22] text-gray-400 hover:text-gray-200 border border-[#30363d]'
                }`}
              >
                REST APIs
              </button>
              <button
                type="button"
                onClick={() => setToolCategoryFilter('builtin')}
                className={`px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap cursor-pointer transition-colors ${
                  toolCategoryFilter === 'builtin'
                    ? 'bg-blue-900/60 text-blue-200 border border-blue-500/60 font-bold'
                    : 'bg-[#161b22] text-gray-400 hover:text-gray-200 border border-[#30363d]'
                }`}
              >
                Built-in & Code
              </button>
            </div>
          </div>

          {/* Tools List */}
          <div className="space-y-2 max-h-[calc(66vh-240px)] overflow-y-auto pr-1">
            {filteredTools.length === 0 ? (
              <div className="text-center py-6 text-gray-500 text-xs italic bg-[#0d1117] rounded-lg border border-dashed border-[#30363d]">
                No tools found matching criteria.
              </div>
            ) : (
              filteredTools.map((tool) => {
                const isMcp = tool.type === 'mcp';
                return (
                  <div
                    key={tool.id}
                    draggable
                    onDragStart={(e) => handleDragStartTool(e, tool)}
                    className={`group relative flex items-start justify-between p-2.5 rounded-lg cursor-grab active:cursor-grabbing transition-all shadow-sm ${
                      isMcp
                        ? 'bg-[#1a162b]/80 border border-purple-500/30 hover:border-purple-400 hover:bg-[#221b38]'
                        : 'bg-[#21262d] border border-[#30363d] hover:bg-[#30363d] hover:border-green-500/60'
                    }`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      <GripVertical className={`w-3.5 h-3.5 shrink-0 mt-1 ${isMcp ? 'text-purple-400/50 group-hover:text-purple-400' : 'text-gray-400 group-hover:text-green-400'}`} />
                      <div className={`p-1.5 rounded-md border shrink-0 mt-0.5 ${isMcp ? 'bg-purple-950 border-purple-500/40 text-purple-300' : 'bg-[#0d1117] border-[#30363d]'}`}>
                        {getToolIcon(tool.type)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-xs text-white truncate max-w-[130px]">
                            {tool.name}
                          </span>
                          {isMcp ? (
                            <span className="text-[8px] uppercase font-mono px-1 py-0.2 rounded bg-purple-950 text-purple-300 border border-purple-500/40 font-bold flex items-center gap-0.5">
                              <Plug className="w-2 h-2" />
                              MCP • {tool.mcpConfig?.transport || 'stdio'}
                            </span>
                          ) : (
                            <span className="text-[8px] uppercase font-mono px-1 py-0.2 rounded bg-[#0d1117] text-green-300 border border-[#30363d]">
                              {tool.type}
                            </span>
                          )}
                        </div>

                        <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-2 leading-relaxed">
                          {tool.description}
                        </p>

                        {/* MCP Specific Details */}
                        {isMcp && tool.mcpConfig && (
                          <div className="mt-1 flex items-center gap-1 flex-wrap">
                            {tool.mcpConfig.command && (
                              <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-[#0d1117] text-purple-300 border border-purple-900/50">
                                {tool.mcpConfig.command} {tool.mcpConfig.args?.[1] || tool.mcpConfig.args?.[0] || ''}
                              </span>
                            )}
                            {tool.mcpConfig.serverUrl && (
                              <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-[#0d1117] text-cyan-300 border border-cyan-900/50 truncate max-w-[130px]">
                                {tool.mcpConfig.serverUrl}
                              </span>
                            )}
                            {tool.mcpConfig.exposedTools && tool.mcpConfig.exposedTools[0] !== '*' && (
                              <span className="text-[8.5px] font-mono text-gray-400">
                                {tool.mcpConfig.exposedTools.length} tools
                              </span>
                            )}
                          </div>
                        )}

                        {!isMcp && tool.codePrompt && (
                          <div className="text-[9px] text-gray-500 font-mono italic truncate max-w-[160px] mt-1">
                            "{tool.codePrompt}"
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Edit & Add Actions */}
                    <div className="flex items-center gap-1 shrink-0 ml-1 mt-0.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenEditTool(tool);
                        }}
                        title={isMcp ? "Edit MCP Server Config & Tools" : "Edit Tool definition & code directive"}
                        className={`p-1.5 rounded border transition-colors cursor-pointer ${
                          isMcp
                            ? 'bg-purple-950/60 hover:bg-purple-800/50 border-purple-500/30 text-purple-300 hover:text-white'
                            : 'bg-[#0d1117] hover:bg-green-600/30 border-[#30363d] text-gray-400 hover:text-green-300'
                        }`}
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddToolToAgent(tool);
                        }}
                        title={selectedAgent ? `Attach to ${selectedAgent.label}` : 'Select an agent or drag to canvas'}
                        className={`p-1.5 rounded border transition-colors cursor-pointer ${
                          isMcp
                            ? 'bg-purple-600 hover:bg-purple-500 border-purple-400 text-white'
                            : 'bg-[#0d1117] hover:bg-green-600 border-[#30363d] text-gray-300 hover:text-white'
                        }`}
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* TAB 3: TRIGGERS CATALOG */}
      {activeTab === 'triggers' && (
        <div className="p-3 space-y-3.5 overflow-y-auto flex-1">
          {/* SECTION 1: Test Suite & QA Triggers (TOP) */}
          {(() => {
            const testSuiteTrigger = TRIGGER_CATALOG.find((t) => t.type === 'tester');
            const otherTriggers = TRIGGER_CATALOG.filter((t) => t.type !== 'tester');

            return (
              <>
                {testSuiteTrigger && (
                  <div>
                    <div className="text-[11px] font-semibold text-pink-400 mb-2 uppercase tracking-wide flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <FlaskConical className="w-3.5 h-3.5 text-pink-400" />
                        Test Suite & Validation
                      </span>
                      <span className="text-[9px] text-pink-300/90 bg-pink-950/50 px-1.5 py-0.2 rounded border border-pink-500/40 font-mono">
                        QA Suite
                      </span>
                    </div>

                    <div
                      draggable
                      onDragStart={(e) => handleDragStartTrigger(e, testSuiteTrigger)}
                      className="group relative flex items-start justify-between p-2.5 bg-[#21262d] border border-pink-500/40 rounded-lg cursor-grab active:cursor-grabbing hover:bg-[#30363d] hover:border-pink-400 shadow-sm transition-all shadow-pink-950/20"
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <GripVertical className="w-3.5 h-3.5 text-gray-400 group-hover:text-pink-400 shrink-0 mt-1" />
                        <div className="p-1.5 rounded-md bg-[#0d1117] border border-pink-500/30 shrink-0 mt-0.5 shadow-xs">
                          <FlaskConical className="w-4 h-4 text-pink-400" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-xs text-white truncate max-w-[130px]">
                              {testSuiteTrigger.name}
                            </span>
                            <span className="text-[8px] uppercase font-mono px-1.5 py-0.2 rounded bg-pink-500/20 text-pink-300 border border-pink-500/30">
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
                        className="p-1.5 rounded bg-[#0d1117] hover:bg-pink-600 border border-[#30363d] text-gray-300 hover:text-white transition-colors cursor-pointer shrink-0 ml-1 mt-0.5"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}

                {/* SECTION 2: Invocation & Event Triggers (BELOW) */}
                <div className="border-t border-[#30363d] pt-3">
                  <div className="text-[11px] font-semibold text-amber-400 mb-2 uppercase tracking-wide flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                      Workflow Triggers
                    </span>
                    <span className="text-[9px] text-amber-300/80 bg-amber-950/40 px-1.5 py-0.2 rounded border border-amber-500/30">
                      Root Only
                    </span>
                  </div>

                  <div className="space-y-1.5 max-h-[calc(66vh-240px)] overflow-y-auto pr-1">
                    {otherTriggers.map((trigger) => (
                      <div
                        key={trigger.id}
                        draggable
                        onDragStart={(e) => handleDragStartTrigger(e, trigger)}
                        className="group relative flex items-start justify-between p-2.5 bg-[#21262d] border border-[#30363d] rounded-lg cursor-grab active:cursor-grabbing hover:bg-[#30363d] hover:border-amber-500/60 transition-all shadow-sm"
                      >
                        <div className="flex items-start gap-2.5 min-w-0">
                          <GripVertical className="w-3.5 h-3.5 text-gray-400 group-hover:text-amber-400 shrink-0 mt-1" />
                          <div className="p-1.5 rounded-md bg-[#0d1117] border border-[#30363d] shrink-0 mt-0.5">
                            {getTriggerIcon(trigger.type)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-xs text-white truncate max-w-[130px]">
                                {trigger.name}
                              </span>
                              <span className="text-[8px] uppercase font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                {trigger.badge}
                              </span>
                            </div>
                            <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-2 leading-relaxed">
                              {trigger.description}
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => onAddTrigger(trigger.type)}
                          title={`Add ${trigger.name} to Root Agent`}
                          className="p-1.5 rounded bg-[#0d1117] hover:bg-amber-600 border border-[#30363d] text-gray-300 hover:text-white transition-colors cursor-pointer shrink-0 ml-1 mt-0.5"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
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
            <span>Ready-to-Use Workflows</span>
            <span className="text-[9px] text-gray-400 font-normal lowercase">opens in new tab</span>
          </div>

          <div className="space-y-2.5">
            {SAMPLES_CATALOG.map((sample) => (
              <div
                key={sample.id}
                onClick={() => onOpenSample?.(sample)}
                className="group relative p-3 rounded-lg bg-[#21262d] border border-[#30363d] hover:border-purple-500/60 hover:bg-[#282e37] transition-all cursor-pointer shadow-sm hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className="p-1 rounded bg-[#0d1117] text-purple-400 border border-[#30363d] shrink-0">
                      {sample.id === 'company_verifier' ? (
                        <Building2 className="w-3.5 h-3.5 text-amber-400" />
                      ) : (
                        <Scale className="w-3.5 h-3.5 text-purple-400" />
                      )}
                    </div>
                    <h4 className="text-xs font-semibold text-gray-200 group-hover:text-white truncate">
                      {sample.name}
                    </h4>
                  </div>
                  <span className="text-[8.5px] font-mono px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30 shrink-0 font-medium">
                    {sample.badge}
                  </span>
                </div>

                <p className="text-[11px] text-gray-400 leading-relaxed group-hover:text-gray-300 line-clamp-3 mb-2.5">
                  {sample.description}
                </p>

                <div className="flex items-center justify-between pt-2 border-t border-[#30363d] text-[10px]">
                  <span className="font-mono text-gray-400 group-hover:text-gray-300 flex items-center gap-1">
                    <FileCode className="w-3 h-3 text-purple-400" />
                    {sample.filename}
                  </span>
                  <span className="text-purple-400 group-hover:text-purple-300 font-medium flex items-center gap-1">
                    Open in new tab <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              </div>
            ))}
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
        <button
          onClick={onOpenAdvisor}
          className="text-blue-400 hover:underline cursor-pointer"
        >
          Advisor
        </button>
      </div>
    </div>
  )}
</div>
  );
};
