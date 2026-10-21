/**
 * PaletteCard Component
 *
 * Purpose:
 * Provides the slide-out catalog drawer for adding Agents, Tools, Workflow Triggers (Conversational Chat,
 * Test Suite QA, and Cloud/Event triggers), and Sample Workflows to the Visual Agent Designer canvas.
 *
 * Architectural Decisions:
 * - Author: Mike Nimer <mikenimer@google.com>
 * - Decision 1: All triggers in the Triggers tab panel are rendered with a unified
 *   orange color scheme (orange-400/orange-500) to distinguish triggers from blue agent nodes.
 * - Decision 2: Supports Conversational Chat and Test Suite QA as active triggers, while PubSub and
 *   Scheduled triggers are explicitly marked as disabled until their backend runtime integrations are implemented.
 * - Decision 3: Spacing and layout follow the strict 8pt grid system.
 * - Decision 4: Categorized tool sections in the Tools catalog are collapsible and default closed.
 * - Decision 5: Basic Agent Types catalog supports Standard Agent (blue), A2A Protocol Agent (cyan), and Router Agent (purple) with drag-and-drop and one-click '+' canvas insertion.
 * - Decision 6: Trigger categories in the Triggers catalog are collapsible: Test Suite QA and Conversational Chat default expanded, while Workflow Triggers defaults collapsed.
 * - Decision 7: Collapsible Sample Categories: Groups sample workflows by domain category (e.g. Retail, SDLC, Finance) into collapsible accordion sections that are collapsed by default.
 * - Decision 8: Collapsible Agent Categories: Core Agents, Flow & Control Agents, and Multi-Agent Patterns in the Agents catalog are collapsible accordion sections with count badges. Core Agents defaults expanded, while Flow & Control Agents and Multi-Agent Patterns default collapsed.
 * - Decision 9: Multi-Agent Patterns in the Agents catalog render with dedicated visual palette badges and theme styles (Debate in pink, Loop in purple, Review & Critique in rose) and quick-add '+' buttons for rapid canvas insertion.
 */

import React, { useState, useMemo } from 'react';
import { 
  Bot, 
  Workflow, 
  GitFork, 
  Repeat, 
  Plus, 
  Layers, 
  ChevronDown, 
  ChevronUp, 
  ChevronRight,
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
  Folder,
  GitBranch,
  Split,
  Server,
  Plug,
  Webhook,
  TerminalSquare,
  Globe2,
  History,
  Cloud,
  BarChart3,
  Shield,
  ShieldAlert,
  LifeBuoy,
  ShieldCheck,
  ExternalLink,
  Info,
} from 'lucide-react';
import { PATTERN_DEFINITIONS, BASIC_AGENT_TYPES, CORE_AGENT_TYPES, FLOW_CONTROL_AGENT_TYPES } from '../../data/patterns';
import { TRIGGER_CATALOG, TriggerCatalogItem } from '../../data/triggerDefinitions';
import { categorizeTools, isNativeAdkTool } from '../../data/builtinTools';
import { GOOGLE_CLOUD_MCP_DOMAINS, GOOGLE_CLOUD_MCP_SERVERS, GoogleCloudDomainMeta } from '../../data/googleCloudMcpServers';
import { GOOGLE_WORKSPACE_MCP_SERVERS, getGoogleWorkspaceMcpServerById } from '../../data/googleWorkspaceMcpServers';
import { isDatabricksMcpTool } from '../../data/databricksMcpServers';
import { isSnowflakeMcpTool } from '../../data/snowflakeMcpServers';
import { PatternType, AgentKind, ToolDefinition, AgentData, TriggerType, SampleWorkflowDefinition, GoogleCloudLaunchStage } from '../../types';
import { SampleInfoModal } from './SampleInfoModal';

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
  onOpenSampleInfo?: (sample: SampleWorkflowDefinition) => void;
  samples?: SampleWorkflowDefinition[];
  onLoadSampleIntoCurrentFlow?: (sample: SampleWorkflowDefinition) => void;
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
  onOpenSampleInfo,
  samples,
  onLoadSampleIntoCurrentFlow,
}) => {
  const sampleList = useMemo(() => samples || [], [samples]);
  const [activeTab, setActiveTab] = useState<'agents' | 'tools' | 'triggers' | 'samples'>('agents');
  const [activeInfoSample, setActiveInfoSample] = useState<SampleWorkflowDefinition | null>(null);
  // Collapsible accordion state for Agent categories (Core Agents open, Flow & Control Agents and Patterns closed by default)
  const [openAgentCategories, setOpenAgentCategories] = useState<Record<string, boolean>>({
    core: true,
    flow_control: false,
    patterns: false,
  });

  /**
   * Toggles the collapse/expand state of an agent category.
   *
   * @param categoryId ID of the agent category section to toggle ('core' | 'flow_control' | 'patterns')
   */
  const toggleAgentCategory = (categoryId: string) => {
    setOpenAgentCategories((prev) => ({
      ...prev,
      [categoryId]: !prev[categoryId],
    }));
  };
  const [isOpen, setIsOpen] = useState(true);
  const [toolSearch, setToolSearch] = useState('');
  const [toolCategoryFilter, setToolCategoryFilter] = useState<'all' | 'mcp' | 'api' | 'builtin'>('all');
  const [openToolCategories, setOpenToolCategories] = useState<Record<string, boolean>>({
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
    if (toolSearch.trim().length > 0) {
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
   * If the user is actively searching, preserves the search-scoped toggle state
   * without destroying the default closed/open preferences for normal browsing.
   *
   * @param categoryId ID of the category section to toggle
   */
  const toggleToolCategory = (categoryId: string) => {
    if (toolSearch.trim().length > 0) {
      setSearchToggledCategories((prev) => {
        const currentlyExpanded = prev[categoryId] !== undefined ? prev[categoryId] : true;
        return {
          ...prev,
          [categoryId]: !currentlyExpanded,
        };
      });
    } else {
      setOpenToolCategories((prev) => ({
        ...prev,
        [categoryId]: !prev[categoryId],
      }));
    }
  };

  // Collapsible accordion state for Trigger categories (Tester & Chat open, Workflow Triggers collapsed by default)
  const [openTriggerCategories, setOpenTriggerCategories] = useState<Record<string, boolean>>({
    tester: true,
    chat: true,
    workflow: false,
  });

  /**
   * Toggles the collapse/expand state of a trigger category.
   *
   * @param categoryId ID of the trigger category section to toggle
   */
  const toggleTriggerCategory = (categoryId: string) => {
    setOpenTriggerCategories((prev) => ({
      ...prev,
      [categoryId]: !prev[categoryId],
    }));
  };

  // Collapsible accordion state for Sample Workflow categories (collapsed by default)
  const [openSampleCategories, setOpenSampleCategories] = useState<Record<string, boolean>>({});

  /**
   * Toggles the collapse/expand state of a sample category.
   *
   * @param category Name or ID of the sample category section to toggle
   */
  const toggleSampleCategory = (category: string) => {
    setOpenSampleCategories((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  };

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

  const handleDragStartPattern = (e: React.DragEvent, patternType: PatternType) => {
    e.dataTransfer.setData('application/reactflow/type', patternType);
    e.dataTransfer.setData('application/reactflow/isPattern', 'true');
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragStartTool = (e: React.DragEvent, tool: ToolDefinition) => {
    e.dataTransfer.setData('application/reactflow/tool', JSON.stringify(tool));
    e.dataTransfer.setData('application/reactflow/type', 'tool');
    e.dataTransfer.effectAllowed = 'copy';
  };

  /**
   * Initiates drag-and-drop payload for a trigger catalog item.
   */
  const handleDragStartTrigger = (e: React.DragEvent, triggerItem: TriggerCatalogItem) => {
    e.dataTransfer.setData('application/reactflow/type', 'trigger');
    e.dataTransfer.setData('application/reactflow/triggerType', triggerItem.type);
    e.dataTransfer.setData('application/reactflow/triggerItem', JSON.stringify(triggerItem));
    e.dataTransfer.effectAllowed = 'move';
  };

  const getToolIcon = (tool: ToolDefinition) => {
    if (tool.category === 'google_workspace_mcp' || tool.id.startsWith('workspace_mcp_')) {
      return <Globe className="w-3.5 h-3.5 text-emerald-400" />;
    }
    if (tool.category === 'google_cloud_mcp') {
      switch (tool.icon) {
        case 'Database': return <Database className="w-3.5 h-3.5 text-amber-400" />;
        case 'Cpu': return <Cpu className="w-3.5 h-3.5 text-cyan-400" />;
        case 'Bot': return <Bot className="w-3.5 h-3.5 text-blue-400" />;
        case 'BarChart3': return <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />;
        case 'Shield': return <Shield className="w-3.5 h-3.5 text-rose-400" />;
        case 'Code': return <Code className="w-3.5 h-3.5 text-indigo-400" />;
        default: return <Cloud className="w-3.5 h-3.5 text-sky-400" />;
      }
    }
    if (tool.builtinType === 'google_search' || tool.id === 'builtin_google_search' || tool.id === 'tool_google_search') {
      return <Globe className="w-3.5 h-3.5 text-sky-400" />;
    }
    if (tool.builtinType === 'vertex_ai_search' || tool.id === 'builtin_vertex_ai_search' || tool.id === 'tool_rag_retriever') {
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
    if (tool.builtinType === 'code_execution' || tool.id === 'tool_code_interpreter' || tool.type === 'code') {
      return <Terminal className="w-3.5 h-3.5 text-emerald-400" />;
    }
    if (isDatabricksMcpTool(tool)) {
      switch (tool.icon) {
        case 'Sparkles': return <Sparkles className="w-3.5 h-3.5 text-orange-400" />;
        case 'Database': return <Database className="w-3.5 h-3.5 text-orange-400" />;
        case 'Code': return <Code className="w-3.5 h-3.5 text-orange-400" />;
        case 'Terminal': return <Terminal className="w-3.5 h-3.5 text-orange-400" />;
        default: return <Server className="w-3.5 h-3.5 text-orange-400" />;
      }
    }
    if (isSnowflakeMcpTool(tool)) {
      switch (tool.icon) {
        case 'Sparkles': return <Sparkles className="w-3.5 h-3.5 text-cyan-400" />;
        case 'Database': return <Database className="w-3.5 h-3.5 text-cyan-400" />;
        case 'Bot': return <Bot className="w-3.5 h-3.5 text-cyan-400" />;
        case 'Terminal': return <Terminal className="w-3.5 h-3.5 text-cyan-400" />;
        default: return <Server className="w-3.5 h-3.5 text-cyan-400" />;
      }
    }
    switch (tool.type) {
      case 'mcp':
        return <Server className="w-3.5 h-3.5 text-purple-400" />;
      case 'search':
        return <Globe className="w-3.5 h-3.5 text-sky-400" />;
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
      case 'webhook':
        return <Webhook className="w-4 h-4 text-orange-400" />;
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

  const getAgentTypeIcon = (iconName: string) => {
    switch (iconName) {
      case 'Bot':
        return <Bot className="w-4 h-4 text-blue-400" />;
      case 'Globe2':
        return <Globe2 className="w-4 h-4 text-cyan-400" />;
      case 'Split':
        return <Split className="w-4 h-4 text-purple-400" />;
      case 'Layers':
        return <Layers className="w-4 h-4 text-emerald-400" />;
      case 'ShieldAlert':
        return <ShieldAlert className="w-4 h-4 text-amber-400" />;
      case 'LifeBuoy':
        return <LifeBuoy className="w-4 h-4 text-rose-400" />;
      case 'ShieldCheck':
        return <ShieldCheck className="w-4 h-4 text-teal-400" />;
      default:
        return <Bot className="w-4 h-4 text-blue-400" />;
    }
  };

  const getAgentCardStyles = (colorTheme: string) => {
    switch (colorTheme) {
      case 'blue':
        return {
          border: 'border-blue-500/40 hover:border-blue-400 shadow-blue-950/20',
          hoverGrip: 'group-hover:text-blue-400',
          iconBorder: 'border-blue-500/30',
          badge: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
        };
      case 'cyan':
        return {
          border: 'border-cyan-500/40 hover:border-cyan-400 shadow-cyan-950/20',
          hoverGrip: 'group-hover:text-cyan-400',
          iconBorder: 'border-cyan-500/30',
          badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
        };
      case 'purple':
        return {
          border: 'border-purple-500/40 hover:border-purple-400 shadow-purple-950/20',
          hoverGrip: 'group-hover:text-purple-400',
          iconBorder: 'border-purple-500/30',
          badge: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
        };
      case 'emerald':
        return {
          border: 'border-emerald-500/40 hover:border-emerald-400 shadow-emerald-950/20',
          hoverGrip: 'group-hover:text-emerald-400',
          iconBorder: 'border-emerald-500/30',
          badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
        };
      case 'amber':
        return {
          border: 'border-amber-500/40 hover:border-amber-400 shadow-amber-950/20',
          hoverGrip: 'group-hover:text-amber-400',
          iconBorder: 'border-amber-500/30',
          badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
        };
      case 'rose':
        return {
          border: 'border-rose-500/40 hover:border-rose-400 shadow-rose-950/20',
          hoverGrip: 'group-hover:text-rose-400',
          iconBorder: 'border-rose-500/30',
          badge: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
        };
      case 'teal':
        return {
          border: 'border-teal-500/40 hover:border-teal-400 shadow-teal-950/20',
          hoverGrip: 'group-hover:text-teal-400',
          iconBorder: 'border-teal-500/30',
          badge: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
        };
      case 'pink':
        return {
          border: 'border-pink-500/40 hover:border-pink-400 shadow-pink-950/20',
          hoverGrip: 'group-hover:text-pink-400',
          iconBorder: 'border-pink-500/30',
          badge: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
        };
      case 'indigo':
        return {
          border: 'border-indigo-500/40 hover:border-indigo-400 shadow-indigo-950/20',
          hoverGrip: 'group-hover:text-indigo-400',
          iconBorder: 'border-indigo-500/30',
          badge: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
        };
      default:
        return {
          border: 'border-gray-500/40 hover:border-gray-400 shadow-gray-950/20',
          hoverGrip: 'group-hover:text-gray-400',
          iconBorder: 'border-gray-500/30',
          badge: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
        };
    }
  };

  const filteredTools = tools.filter((t) => {
    const matchesSearch = 
      t.name.toLowerCase().includes(toolSearch.toLowerCase()) ||
      t.description.toLowerCase().includes(toolSearch.toLowerCase()) ||
      t.type.toLowerCase().includes(toolSearch.toLowerCase()) ||
      (t.mcpConfig?.serverName && t.mcpConfig.serverName.toLowerCase().includes(toolSearch.toLowerCase()));

    if (!matchesSearch) return false;

    if (toolCategoryFilter === 'mcp') return t.type === 'mcp' || t.mcpConfig !== undefined;
    if (toolCategoryFilter === 'api') return t.type === 'api';
    if (toolCategoryFilter === 'builtin') return isNativeAdkTool(t);
    return true;
  });

  const mcpToolsCount = tools.filter((t) => t.type === 'mcp').length;

  return (
    <div className="absolute top-3 bottom-3 left-0 z-20 flex items-start select-none group/palette pointer-events-none">
      {/* VERTICAL MENU TABS FIXED TO LEFT EDGE (Blender-style) */}
      <div
        className={`pointer-events-auto max-h-full overflow-y-auto flex flex-col gap-0.5 p-0.5 bg-[#161b22]/95 backdrop-blur-xl border border-l-0 border-[#30363d] shadow-2xl transition-all duration-150 z-30 ${
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
            {sampleList.length}
          </span>
        </button>
      </div>

      {/* FLOATING CARD / SIDEBAR BODY (Visible when isOpen) */}
      {isOpen && (
        <div
          data-testid="palette-tab-panel"
          className="pointer-events-auto w-80 h-full max-h-full backdrop-blur-xl bg-[#161b22]/95 rounded-r-xl border border-[#30363d] shadow-2xl overflow-hidden transition-all duration-150 flex flex-col text-[#c9d1d9]"
        >
          {/* Palette Header */}
          <div className="flex items-center justify-between px-3.5 py-2.5 bg-[#161b22] border-b border-[#30363d] shrink-0">
            <div className="flex items-center gap-2">
              {activeTab === 'agents' && <Bot className="w-4 h-4 text-blue-400" />}
              {activeTab === 'tools' && <Wrench className="w-4 h-4 text-emerald-400" />}
              {activeTab === 'triggers' && <Zap className="w-4 h-4 text-orange-400" />}
              {activeTab === 'samples' && <Sparkles className="w-4 h-4 text-purple-400" />}
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-300">
                {activeTab === 'agents' && 'Agents & Patterns'}
                {activeTab === 'tools' && `Tool Registry (${tools.length})`}
                {activeTab === 'triggers' && 'Workflow Triggers & QA'}
                {activeTab === 'samples' && `Workflow Samples (${sampleList.length})`}
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
        <div className="p-3 space-y-2 overflow-y-auto flex-1 min-h-0">
          {/* 1. Core Agent Types Section */}
          <div className="space-y-2 bg-[#0d1117]/40 rounded-lg border border-[#30363d]/60 p-2">
            <button
              type="button"
              onClick={() => toggleAgentCategory('core')}
              className="w-full flex items-center justify-between text-left hover:text-white transition-colors cursor-pointer group select-none"
              data-testid="toggle-agent-category-core"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                {openAgentCategories.core ? (
                  <ChevronDown className="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-200 transition-transform shrink-0" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-200 transition-transform shrink-0" />
                )}
                <Bot className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span className="text-[11px] font-bold text-gray-300 group-hover:text-white tracking-tight">
                  Core Agents
                </span>
              </div>
              <span className="text-[9px] px-1.5 py-0.5 rounded border font-mono font-bold bg-blue-950/50 text-blue-300/90 border-blue-500/40 shrink-0">
                {CORE_AGENT_TYPES.length}
              </span>
            </button>

            {openAgentCategories.core && (
              <div className="pt-1.5 space-y-1.5 border-t border-[#30363d]/40">
                {CORE_AGENT_TYPES.map((agentType) => {
                  const styles = getAgentCardStyles(agentType.colorTheme);
                  return (
                    <div
                      key={agentType.kind}
                      draggable
                      onDragStart={(e) => handleDragStartAgent(e, agentType.kind, false, agentType.kind)}
                      onClick={() => onAddAgent(agentType.kind)}
                      className={`group relative flex items-start justify-between p-2.5 rounded-lg border bg-[#21262d] ${styles.border} cursor-grab active:cursor-grabbing hover:bg-[#30363d] shadow-sm transition-all`}
                      title={`Drag and drop ${agentType.name} onto canvas`}
                      data-testid={`palette-agent-${agentType.kind}`}
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <GripVertical className={`w-3.5 h-3.5 text-gray-400 ${styles.hoverGrip} shrink-0 mt-1`} />
                        <div className={`p-1.5 rounded-md bg-[#0d1117] ${styles.iconBorder} shrink-0 mt-0.5 border shadow-xs`}>
                          {getAgentTypeIcon(agentType.iconName)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-xs text-white truncate max-w-[150px]">
                              {agentType.name}
                            </span>
                            <span className={`text-[8px] uppercase font-mono px-1.5 py-0.2 rounded ${styles.badge}`}>
                              {agentType.badge}
                            </span>
                          </div>
                          <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-2 leading-relaxed">
                            {agentType.description}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 2. Flow & Control Agents Section */}
          <div className="space-y-2 bg-[#0d1117]/40 rounded-lg border border-[#30363d]/60 p-2">
            <button
              type="button"
              onClick={() => toggleAgentCategory('flow_control')}
              className="w-full flex items-center justify-between text-left hover:text-white transition-colors cursor-pointer group select-none"
              data-testid="toggle-agent-category-flow-control"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                {openAgentCategories.flow_control ? (
                  <ChevronDown className="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-200 transition-transform shrink-0" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-200 transition-transform shrink-0" />
                )}
                <Layers className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span className="text-[11px] font-bold text-gray-300 group-hover:text-white tracking-tight">
                  Flow & Control Agents
                </span>
              </div>
              <span className="text-[9px] px-1.5 py-0.5 rounded border font-mono font-bold bg-indigo-950/50 text-indigo-300/90 border-indigo-500/40 shrink-0">
                {FLOW_CONTROL_AGENT_TYPES.length}
              </span>
            </button>

            {openAgentCategories.flow_control && (
              <div className="pt-1.5 space-y-1.5 border-t border-[#30363d]/40">
                {FLOW_CONTROL_AGENT_TYPES.map((agentType) => {
                  const styles = getAgentCardStyles(agentType.colorTheme);
                  return (
                    <div
                      key={agentType.kind}
                      draggable
                      onDragStart={(e) => handleDragStartAgent(e, agentType.kind, false, agentType.kind)}
                      onClick={() => onAddAgent(agentType.kind)}
                      className={`group relative flex items-start justify-between p-2.5 rounded-lg border bg-[#21262d] ${styles.border} cursor-grab active:cursor-grabbing hover:bg-[#30363d] shadow-sm transition-all`}
                      title={`Drag and drop ${agentType.name} onto canvas`}
                      data-testid={`palette-agent-${agentType.kind}`}
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <GripVertical className={`w-3.5 h-3.5 text-gray-400 ${styles.hoverGrip} shrink-0 mt-1`} />
                        <div className={`p-1.5 rounded-md bg-[#0d1117] ${styles.iconBorder} shrink-0 mt-0.5 border shadow-xs`}>
                          {getAgentTypeIcon(agentType.iconName)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-xs text-white truncate max-w-[150px]">
                              {agentType.name}
                            </span>
                            <span className={`text-[8px] uppercase font-mono px-1.5 py-0.2 rounded ${styles.badge}`}>
                              {agentType.badge}
                            </span>
                          </div>
                          <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-2 leading-relaxed">
                            {agentType.description}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 3. Multi-Agent Patterns Section */}
          <div className="space-y-2 bg-[#0d1117]/40 rounded-lg border border-[#30363d]/60 p-2">
            <button
              type="button"
              onClick={() => toggleAgentCategory('patterns')}
              className="w-full flex items-center justify-between text-left hover:text-white transition-colors cursor-pointer group select-none"
              data-testid="toggle-agent-category-patterns"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                {openAgentCategories.patterns ? (
                  <ChevronDown className="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-200 transition-transform shrink-0" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-200 transition-transform shrink-0" />
                )}
                <Cpu className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                <span className="text-[11px] font-bold text-gray-300 group-hover:text-white tracking-tight">
                  Multi-Agent Patterns
                </span>
              </div>
              <span className="text-[9px] px-1.5 py-0.5 rounded border font-mono font-bold bg-purple-950/50 text-purple-300/90 border-purple-500/40 shrink-0">
                {PATTERN_DEFINITIONS.length}
              </span>
            </button>

            {openAgentCategories.patterns && (
              <div className="pt-1.5 space-y-1.5 border-t border-[#30363d]/40">
                {PATTERN_DEFINITIONS.map((pattern) => {
                  const styles = getAgentCardStyles(pattern.colorTheme || 'purple');
                  return (
                    <div
                      key={pattern.id}
                      draggable
                      onDragStart={(e) => handleDragStartPattern(e, pattern.type)}
                      onClick={() => onAddPattern(pattern.type)}
                      className={`group relative flex items-start justify-between p-2.5 rounded-lg border bg-[#21262d] ${styles.border} cursor-grab active:cursor-grabbing hover:bg-[#30363d] shadow-sm transition-all`}
                      title={`Drag and drop ${pattern.name} pattern onto canvas`}
                      data-testid={`palette-pattern-${pattern.type}`}
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <GripVertical className={`w-3.5 h-3.5 text-gray-400 ${styles.hoverGrip} shrink-0 mt-1`} />
                        <div className={`p-1.5 rounded-md bg-[#0d1117] ${styles.iconBorder} shrink-0 mt-0.5 border shadow-xs`}>
                          {getPatternIcon(pattern.iconName)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-xs text-white truncate max-w-[150px]">
                              {pattern.name}
                            </span>
                            <span className={`text-[8px] uppercase font-mono px-1.5 py-0.2 rounded ${styles.badge}`}>
                              {pattern.badge}
                            </span>
                          </div>
                          <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-2 leading-relaxed">
                            {pattern.description}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddPattern(pattern.type);
                        }}
                        className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-[#30363d] text-gray-400 hover:text-white transition-all shrink-0 cursor-pointer"
                        title={`Add ${pattern.name} to canvas`}
                        data-testid={`palette-pattern-add-${pattern.type}`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: TOOLS CATALOG */}
      {activeTab === 'tools' && (
        <div className="p-4 space-y-4 overflow-y-auto flex-1 min-h-0">
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
                onChange={(e) => {
                  setToolSearch(e.target.value);
                  setSearchToggledCategories({});
                  setSearchToggledGcpDomains({});
                }}
                placeholder="Search tools & datastores..."
                className="w-full pl-8 pr-6 py-1.5 bg-[#0d1117] border border-[#30363d] focus:border-purple-500 rounded-md text-[11px] text-gray-200 placeholder-gray-500 focus:outline-none"
              />
              {toolSearch && (
                <button
                  type="button"
                  onClick={() => {
                    setToolSearch('');
                    setSearchToggledCategories({});
                    setSearchToggledGcpDomains({});
                  }}
                  className="absolute right-2 top-2 text-gray-400 hover:text-gray-200 text-xs cursor-pointer"
                >
                  ×
                </button>
              )}
            </div>
          </div>

          {/* Categorized Tool Sections */}
          {(() => {
            // NOTE: Filter tools by name, description, category, builtin type, MCP serverName, command, and ID
            const filtered = tools.filter((t) => {
              if (!toolSearch.trim()) return true;
              const q = toolSearch.toLowerCase().trim();
              return (
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
            });
            const categorized = categorizeTools(filtered);

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
                title: 'Google Workspace MCP',
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
                  const isSearching = toolSearch.trim().length > 0;
                  // NOTE: Auto-expand any category containing matches during search, while allowing manual toggling
                  const isExpanded = isSearching
                    ? (searchToggledCategories[section.id] !== undefined ? searchToggledCategories[section.id] : true)
                    : (openToolCategories[section.id] ?? false);

                  return (
                    <div key={section.id} className="space-y-1.5 bg-[#0d1117]/40 rounded-lg border border-[#30363d]/60 p-2">
                      {/* Collapsible Category Header */}
                      <button
                        type="button"
                        onClick={() => toggleToolCategory(section.id)}
                        className="w-full flex items-center justify-between text-left hover:text-white transition-colors cursor-pointer group select-none"
                        data-testid={section.id === 'google_workspace_mcp' ? 'tool-category-toggle-google_workspace_mcp' : `toggle-tool-section-${section.id}`}
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          {isExpanded ? (
                            <ChevronDown className="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-200 transition-transform shrink-0" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-200 transition-transform shrink-0" />
                          )}
                          {section.icon}
                          <span className="text-[11px] font-bold text-gray-300 group-hover:text-white tracking-tight">
                            {section.title}
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
                                    data-testid={`toggle-gcp-domain-${domain.id}`}
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

                                  {/* Domain Tool Items (Collapsible with 8pt grid indentation: pl-2) */}
                                  {isDomainExpanded && (
                                    <div className="space-y-2 pl-2 pt-1.5 border-l border-[#30363d]/40 mt-1">
                                      {domainTools.map((t) => {
                                        const isAttached = selectedAgent?.tools?.some((at) => at.id === t.id);
                                        return (
                                          <div
                                            key={t.id}
                                            draggable
                                            onDragStart={(e) => handleDragStartTool(e, t)}
                                            title={t.name}
                                            className="group relative flex items-start gap-2 p-2 bg-[#0d1117] hover:bg-[#161b22] border border-[#30363d] hover:border-sky-400 rounded-lg transition-all cursor-grab active:cursor-grabbing shadow-xs hover:shadow-md hover:shadow-sky-950/30"
                                            data-testid={`gcp-mcp-tool-${t.id}`}
                                          >
                                            <div className="mt-0.5 text-gray-500 group-hover:text-sky-400 transition-colors">
                                              <GripVertical className="w-3 h-3" />
                                            </div>

                                            <div className="p-1 rounded bg-[#161b22] border border-[#30363d] group-hover:border-sky-500/40 shrink-0 mt-0.5 transition-colors">
                                              {getToolIcon(t)}
                                            </div>

                                            <div className="min-w-0 flex-1">
                                              <div className="flex items-center justify-between gap-1">
                                                <span
                                                  title={t.name}
                                                  className="text-[11px] font-bold text-gray-200 group-hover:text-sky-300 truncate transition-colors"
                                                >
                                                  {t.name}
                                                </span>
                                                <div className="flex items-center gap-1 shrink-0">
                                                  {renderLaunchStageBadge(t.mcpConfig?.launchStage)}
                                                  {isAttached && (
                                                    <span className="text-[8px] px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold shrink-0">
                                                      Attached
                                                    </span>
                                                  )}
                                                </div>
                                              </div>
                                              {t.mcpConfig?.serverUrl && (
                                                <div className="text-[9px] font-mono text-sky-400/70 truncate mt-0.5">
                                                  {t.mcpConfig.serverUrl}
                                                </div>
                                              )}
                                              <p className="text-[10px] text-gray-400 line-clamp-2 leading-tight mt-0.5">
                                                {t.description}
                                              </p>
                                            </div>

                                            {/* Quick Actions */}
                                            <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 shrink-0">
                                              <button
                                                type="button"
                                                onClick={() => onOpenEditTool(t)}
                                                className="p-1 rounded text-gray-400 hover:text-white hover:bg-[#30363d] transition-colors cursor-pointer"
                                                title="Configure tool properties"
                                              >
                                                <Edit2 className="w-3 h-3" />
                                              </button>
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
                          /* Dedicated list of Google Workspace MCP Servers */
                          <div className="space-y-1.5 pl-1 pt-1 border-t border-[#30363d]/40">
                            {section.tools.map((t) => {
                              const isAttached = selectedAgent?.tools?.some((at) => at.id === t.id);

                              return (
                                <div
                                  key={t.id}
                                  draggable
                                  onDragStart={(e) => handleDragStartTool(e, t)}
                                  onClick={() => onOpenEditTool(t)}
                                  title={t.name}
                                  className="group relative flex items-start gap-2 p-2 bg-[#0d1117] hover:bg-[#161b22] border border-[#30363d] hover:border-emerald-400 rounded-lg transition-all cursor-grab active:cursor-grabbing shadow-xs hover:shadow-md hover:shadow-emerald-950/30"
                                  data-testid={`workspace-mcp-tool-${t.id}`}
                                >
                                  <div className="mt-0.5 text-gray-500 group-hover:text-emerald-400 transition-colors">
                                    <GripVertical className="w-3 h-3" />
                                  </div>

                                  <div className="p-1 rounded bg-[#161b22] border border-[#30363d] group-hover:border-emerald-500/40 shrink-0 mt-0.5 transition-colors">
                                    {getToolIcon(t)}
                                  </div>

                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-1">
                                      <span
                                        title={t.name}
                                        className="text-[11px] font-bold text-gray-200 group-hover:text-emerald-300 truncate transition-colors"
                                      >
                                        {t.name}
                                      </span>
                                      <div className="flex items-center gap-1 shrink-0">
                                        {renderLaunchStageBadge(t.mcpConfig?.launchStage || 'Preview')}
                                        {isAttached && (
                                          <span className="text-[8px] px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold shrink-0">
                                            Attached
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    {t.mcpConfig?.serverUrl && (
                                      <div className="text-[9px] font-mono text-emerald-400/90 truncate mt-0.5">
                                        {t.mcpConfig.serverUrl}
                                      </div>
                                    )}
                                    <p className="text-[10px] text-gray-400 line-clamp-2 leading-tight mt-0.5">
                                      {t.description}
                                    </p>
                                  </div>

                                  {/* Quick Actions */}
                                  <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 shrink-0">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onOpenEditTool(t);
                                      }}
                                      className="p-1 rounded text-gray-400 hover:text-white hover:bg-[#30363d] transition-colors cursor-pointer"
                                      title="Configure tool properties"
                                    >
                                      <Edit2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="space-y-2 pt-1 border-t border-[#30363d]/40">
                            {section.tools.map((t) => {
                              const isAttached = selectedAgent?.tools?.some((at) => at.id === t.id);
                              const isDatabricks = isDatabricksMcpTool(t);
                              const isSnowflake = isSnowflakeMcpTool(t);
                              const hoverBorderClass = isDatabricks
                                ? 'hover:border-orange-500/50'
                                : isSnowflake
                                ? 'hover:border-cyan-500/50'
                                : 'hover:border-purple-500/50';

                              return (
                                <div
                                  key={t.id}
                                  draggable
                                  onDragStart={(e) => handleDragStartTool(e, t)}
                                  title={t.name}
                                  className={`group relative flex items-start gap-2 p-2 bg-[#0d1117] hover:bg-[#161b22] border border-[#30363d] ${hoverBorderClass} rounded-lg transition-all cursor-grab active:cursor-grabbing shadow-xs hover:shadow-md`}
                                  data-testid={`tool-item-${t.id}`}
                                >
                                  <div className="mt-0.5 text-gray-500 group-hover:text-gray-300">
                                    <GripVertical className="w-3 h-3" />
                                  </div>

                                  <div className="p-1 rounded bg-[#161b22] border border-[#30363d] shrink-0 mt-0.5">
                                    {getToolIcon(t)}
                                  </div>

                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-1">
                                      <span
                                        title={t.name}
                                        className="text-[11px] font-bold text-gray-200 group-hover:text-white truncate"
                                      >
                                        {t.name}
                                      </span>
                                      <div className="flex items-center gap-1 shrink-0">
                                        {isDatabricks && (
                                          <span className="text-[8px] px-1 py-0.5 rounded bg-orange-500/20 text-orange-300 border border-orange-500/30 font-semibold shrink-0">
                                            Databricks
                                          </span>
                                        )}
                                        {isSnowflake && (
                                          <span className="text-[8px] px-1 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-semibold shrink-0">
                                            Snowflake
                                          </span>
                                        )}
                                        {isAttached && (
                                          <span className="text-[8px] px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold shrink-0">
                                            Attached
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    {t.mcpConfig?.serverUrl && (
                                      <div className={`text-[9px] font-mono truncate mt-0.5 ${
                                        isDatabricks ? 'text-orange-400/80' : isSnowflake ? 'text-cyan-400/80' : 'text-purple-400/70'
                                      }`}>
                                        {t.mcpConfig.serverUrl}
                                      </div>
                                    )}
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
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )
                      )}
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
        <div className="p-3 space-y-3.5 overflow-y-auto flex-1 min-h-0">
          {(() => {
            const chatTrigger = TRIGGER_CATALOG.find((t) => t.type === 'chat');
            const testSuiteTrigger = TRIGGER_CATALOG.find((t) => t.type === 'tester');
            const workflowTriggers = TRIGGER_CATALOG.filter((t) => t.type !== 'tester' && t.type !== 'chat');

            const triggerSections = [
              {
                id: 'tester',
                title: 'Test Suite & Validation',
                icon: <FlaskConical className="w-3.5 h-3.5 text-orange-400" />,
                badge: 'QA Suite',
                isCount: false,
                trigger: testSuiteTrigger,
                triggers: undefined,
              },
              {
                id: 'chat',
                title: 'Conversational Chat',
                icon: <MessageSquare className="w-3.5 h-3.5 text-orange-400" />,
                badge: 'Interactive',
                isCount: false,
                trigger: chatTrigger,
                triggers: undefined,
              },
              {
                id: 'workflow',
                title: 'Workflow Triggers',
                icon: <Zap className="w-3.5 h-3.5 text-orange-400" />,
                badge: `${workflowTriggers.length}`,
                isCount: true,
                trigger: undefined,
                triggers: workflowTriggers,
              },
            ];

            return (
              <div className="space-y-3">
                {triggerSections.map((section) => {
                  const isExpanded = openTriggerCategories[section.id] ?? false;

                  return (
                    <div
                      key={section.id}
                      className="space-y-2 bg-[#0d1117]/40 rounded-lg border border-[#30363d]/60 p-2"
                    >
                      {/* Collapsible Category Header */}
                      <button
                        type="button"
                        onClick={() => toggleTriggerCategory(section.id)}
                        className="w-full flex items-center justify-between text-left hover:text-white transition-colors cursor-pointer group select-none"
                        data-testid={`toggle-trigger-section-${section.id}`}
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          {isExpanded ? (
                            <ChevronDown className="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-200 transition-transform shrink-0" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-200 transition-transform shrink-0" />
                          )}
                          {section.icon}
                          <span className="text-[11px] font-bold text-gray-300 group-hover:text-white tracking-tight">
                            {section.title}
                          </span>
                        </div>
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded border font-mono ${
                            section.isCount ? 'font-bold' : ''
                          } bg-orange-950/50 text-orange-300/90 border-orange-500/40 shrink-0`}
                        >
                          {section.badge}
                        </span>
                      </button>

                      {/* Expanded Section Items */}
                      {isExpanded && (
                        <div className="pt-1.5 space-y-2 border-t border-[#30363d]/40">
                          {section.trigger && (
                            <div
                              draggable
                              onDragStart={(e) => handleDragStartTrigger(e, section.trigger!)}
                              className="group relative flex items-start justify-between p-2.5 bg-[#21262d] border border-orange-500/40 rounded-lg cursor-grab active:cursor-grabbing hover:bg-[#30363d] hover:border-orange-400 shadow-sm transition-all shadow-orange-950/20"
                              title={`Drag and drop ${section.trigger.name} onto canvas`}
                            >
                              <div className="flex items-start gap-2.5 min-w-0">
                                <GripVertical className="w-3.5 h-3.5 text-gray-400 group-hover:text-orange-400 shrink-0 mt-1" />
                                <div className="p-1.5 rounded-md bg-[#0d1117] border border-orange-500/30 shrink-0 mt-0.5 shadow-xs">
                                  {getTriggerIcon(section.trigger.type)}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-semibold text-xs text-white truncate max-w-[150px]">
                                      {section.trigger.name}
                                    </span>
                                    <span className="text-[8px] uppercase font-mono px-1.5 py-0.2 rounded bg-orange-500/20 text-orange-300 border border-orange-500/30">
                                      {section.trigger.badge}
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-2 leading-relaxed">
                                    {section.trigger.description}
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}

                          {section.triggers && (
                            <div className="space-y-1.5 pr-1">
                              {section.triggers.map((trigger) => (
                                <div
                                  key={trigger.id}
                                  draggable
                                  onDragStart={(e) => handleDragStartTrigger(e, trigger)}
                                  className="group relative flex items-start justify-between p-2.5 rounded-lg border bg-[#21262d] border-orange-500/40 cursor-grab active:cursor-grabbing hover:bg-[#30363d] hover:border-orange-400 shadow-sm transition-all shadow-orange-950/20"
                                  title={`Drag and drop ${trigger.name} onto canvas`}
                                >
                                  <div className="flex items-start gap-2.5 min-w-0">
                                    <GripVertical className="w-3.5 h-3.5 text-gray-400 group-hover:text-orange-400 shrink-0 mt-1" />
                                    <div className="p-1.5 rounded-md bg-[#0d1117] shrink-0 mt-0.5 border border-orange-500/30 shadow-xs">
                                      {getTriggerIcon(trigger.type)}
                                    </div>
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-semibold text-xs text-white truncate max-w-[150px]">
                                          {trigger.name}
                                        </span>
                                        <span className="text-[8px] uppercase font-mono px-1.5 py-0.2 rounded bg-orange-500/20 text-orange-300 border border-orange-500/30">
                                          {trigger.badge}
                                        </span>
                                      </div>
                                      <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-2 leading-relaxed">
                                        {trigger.description}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* TAB 4: SAMPLES & TEMPLATES */}
      {activeTab === 'samples' && (() => {
        const sampleList = samples || [];

        // Section 1: Group samples by domain category
        const sampleGroups: Record<string, SampleWorkflowDefinition[]> = {};
        for (const sample of sampleList) {
          const cat = sample.category?.trim() || 'General';
          if (!sampleGroups[cat]) {
            sampleGroups[cat] = [];
          }
          sampleGroups[cat].push(sample);
        }

        const categoryNames = Object.keys(sampleGroups).sort((a, b) => a.localeCompare(b));

        return (
          <div className="p-3 space-y-3 overflow-y-auto flex-1 min-h-0">
            <div className="text-[11px] font-semibold text-purple-400 uppercase tracking-wide flex items-center justify-between">
              <span>Ready-to-Use Workflows ({sampleList.length})</span>
            </div>

            {sampleList.length === 0 ? (
              <div className="p-4 text-center text-xs text-gray-500 border border-dashed border-[#30363d] rounded-lg">
                No sample workflows available.
              </div>
            ) : (
              <div className="space-y-2">
                {categoryNames.map((category) => {
                  const items = sampleGroups[category];
                  const isExpanded = openSampleCategories[category] ?? false;

                  return (
                    <div
                      key={category}
                      className="space-y-2 bg-[#0d1117]/40 rounded-lg border border-[#30363d]/60 p-2"
                    >
                      {/* Collapsible Category Header - Collapsed by default */}
                      <button
                        type="button"
                        onClick={() => toggleSampleCategory(category)}
                        className="w-full flex items-center justify-between text-left hover:text-white transition-colors cursor-pointer group select-none"
                        data-testid={`toggle-sample-category-${category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          {isExpanded ? (
                            <ChevronDown className="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-200 transition-transform shrink-0" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-200 transition-transform shrink-0" />
                          )}
                          <Folder className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                          <span className="text-[11px] font-bold text-gray-300 group-hover:text-white tracking-tight truncate">
                            {category}
                          </span>
                        </div>
                        <span className="text-[9px] px-1.5 py-0.5 rounded border font-mono font-bold bg-purple-950/50 text-purple-300/90 border-purple-500/40 shrink-0">
                          {items.length}
                        </span>
                      </button>

                      {/* Expanded Section Items */}
                      {isExpanded && (
                        <div className="pt-1.5 space-y-2 border-t border-[#30363d]/40">
                          {items.map((sample) => (
                            <div
                              key={sample.id}
                              draggable={true}
                              title={sample.name}
                              data-testid={`sample-card-${sample.id}`}
                              onDragStart={(e) => {
                                e.dataTransfer.setData('application/reactflow/type', 'sample');
                                e.dataTransfer.setData('application/reactflow/sample', JSON.stringify(sample));
                                e.dataTransfer.setData('application/reactflow/sampleId', sample.id);
                                e.dataTransfer.setData('text/plain', JSON.stringify(sample));
                                e.dataTransfer.effectAllowed = 'all';
                              }}
                              className="group relative flex flex-col p-2.5 bg-[#21262d] border border-purple-500/30 rounded-lg hover:bg-[#30363d] hover:border-purple-400 shadow-sm transition-all shadow-purple-950/20 cursor-grab active:cursor-grabbing"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-start gap-1.5 min-w-0 flex-1">
                                  <GripVertical className="w-3.5 h-3.5 text-gray-500 group-hover:text-purple-400 shrink-0 mt-0.5 opacity-60 group-hover:opacity-100 transition-opacity" />
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span
                                        className="font-semibold text-xs text-white truncate max-w-[150px]"
                                        title={sample.name}
                                      >
                                        {sample.name}
                                      </span>
                                      <span className="text-[8px] uppercase font-mono px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                        {sample.badge}
                                      </span>
                                    </div>
                                    <p className="text-[10px] text-gray-400 mt-1 line-clamp-2 leading-relaxed">
                                      {sample.description}
                                    </p>
                                    <div className="flex items-center gap-2 mt-2 text-[9px] text-gray-400 font-mono">
                                      <span>{sample.nodesCount} nodes</span>
                                      <span>•</span>
                                      <span>{sample.toolsCount} tools</span>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex flex-col gap-1 shrink-0 mt-0.5">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (onOpenSampleInfo) {
                                        onOpenSampleInfo(sample);
                                      } else {
                                        setActiveInfoSample(sample);
                                      }
                                    }}
                                    title={`View "${sample.name}" description & README documentation`}
                                    aria-label={`View ${sample.name} information`}
                                    data-testid={`sample-info-btn-${sample.id}`}
                                    className="px-2 py-1 rounded bg-[#161b22] hover:bg-[#21262d] border border-purple-500/40 text-purple-300 hover:text-white transition-colors cursor-pointer text-[10px] font-medium flex items-center justify-center gap-1"
                                  >
                                    <Info className="w-3 h-3" />
                                    <span>Info</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onOpenSample?.(sample);
                                    }}
                                    title={`Save "${sample.name}" as a new .agent file and open in a new tab`}
                                    className="px-2 py-1 rounded bg-[#161b22] hover:bg-[#21262d] border border-purple-500/40 text-purple-300 hover:text-white transition-colors cursor-pointer text-[10px] font-medium flex items-center justify-center gap-1"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                    <span>New File</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* Floating Card Footer Tip */}
      <div className="px-3.5 py-2 bg-[#0d1117] border-t border-[#30363d] text-[10px] text-gray-400 flex items-center justify-between shrink-0">
        <span>
          💡 {activeTab === 'agents' 
            ? 'Drag onto diagram to insert' 
            : activeTab === 'tools' 
            ? 'Drag onto Agent node to attach'
            : activeTab === 'triggers'
            ? 'Drag onto canvas to auto-link to Root Agent'
            : 'Drag sample onto diagram to insert (or click New Tab)'}
        </span>
      </div>
    </div>
  )}

  {/* Sample Information Modal Dialog (fallback when not mounted at root) */}
  {!onOpenSampleInfo && (
    <SampleInfoModal
      sample={activeInfoSample}
      onClose={() => setActiveInfoSample(null)}
      onOpenSample={onOpenSample}
    />
  )}
</div>
  );
};
