/**
 * AgentNode - Canvas Component for AI Agents in Workflow Graph
 * 
 * Purpose:
 * Renders individual Agent nodes on the visual workflow canvas, displaying agent
 * roles, LLM models, configured tools, sub-agent delegations, and router branches.
 * 
 * Architectural Decisions:
 * - Author: Mike Nimer <mikenimer@google.com>
 * - Clean Handle Architecture: In/out floating labels removed for a streamlined canvas visual design.
 * - Triggers Connect Orange to Orange: The Root agent (`isStartNode: true`) features Top (`input`)
 *   and Left (`input_left`) handles styled in the triggers orange/amber palette (!bg-amber-500 ring-2 ring-amber-400/50).
 * - Non-root Agent Nodes: Feature only a Top (`input`) handle in blue (!bg-blue-500).
 * - Right and Left handles are removed on all non-root agent nodes.
 * - Outgoing Flows: Bottom handles (main output, subagent, router branches) connect to child agents.
 */

import React, { memo, useState } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { 
  Bot, 
  Wrench, 
  Users, 
  Plus, 
  X, 
  Sliders, 
  Cpu, 
  Sparkles, 
  Trash2, 
  Globe, 
  Globe2,
  Terminal, 
  Database, 
  FileText, 
  Radio, 
  Code,
  GripVertical,
  ChevronUp,
  ChevronDown,
  Share2,
  GitFork,
  Workflow,
  Network,
  Repeat,
  CheckSquare,
  Layers,
  Compass,
  Brain,
  Zap,
  Cloud,
  HardDrive,
  History,
  Search,
  Ban,
  GitBranch,
  Split,
  CornerDownRight,
  Scale,
  Braces,
  AlertCircle,
  ShieldAlert,
  LifeBuoy,
  ShieldCheck
} from 'lucide-react';
import { 
  AgentData, 
  ToolDefinition, 
  DelegationPattern, 
  SubAgentRef, 
  AgentMemoryConfig, 
  AgentMemoryType,
  ADK_DELEGATION_PATTERNS 
} from '../../../types';
import { getMemoryOption } from '../../../data/memoryOptions';

const getMemoryIcon = (type?: AgentMemoryType) => {
  switch (type) {
    case 'langgraph_in_memory':
      return <Cpu className="w-3 h-3 text-cyan-400" />;
    case 'postgres':
      return <Database className="w-3 h-3 text-blue-400" />;
    case 'redis':
      return <Zap className="w-3 h-3 text-amber-400" />;
    case 'firestore':
      return <Cloud className="w-3 h-3 text-sky-400" />;
    case 'sqlite':
      return <HardDrive className="w-3 h-3 text-emerald-400" />;
    case 'window_buffer':
      return <History className="w-3 h-3 text-purple-400" />;
    case 'summary_buffer':
      return <FileText className="w-3 h-3 text-indigo-400" />;
    case 'vector_rag':
      return <Search className="w-3 h-3 text-emerald-400" />;
    case 'entity_fact':
      return <Brain className="w-3 h-3 text-pink-400" />;
    case 'none':
      return <Ban className="w-3 h-3 text-gray-500" />;
    default:
      return <Brain className="w-3 h-3 text-cyan-400" />;
  }
};

const getMemoryLabel = (type?: AgentMemoryType) => {
  const opt = getMemoryOption(type);
  return opt ? opt.name.split(' (')[0] : 'In-Memory Saver';
};

const getMemorySummaryText = (config?: AgentMemoryConfig) => {
  if (!config || config.type === 'none') return 'Stateless execution';
  switch (config.type) {
    case 'langgraph_in_memory':
      return `MemorySaver (thread: ${config.threadIdKey || 'thread_id'})`;
    case 'postgres':
      return `Postgres (${config.tableName || 'checkpoints'} table)`;
    case 'redis':
      return `Redis (TTL: ${config.ttlSeconds || 86400}s)`;
    case 'firestore':
      return `Firestore (${config.collectionName || 'agent_sessions'})`;
    case 'sqlite':
      return `SQLite (${config.sqlitePath || './agent_memory.sqlite'})`;
    case 'window_buffer':
      return `Sliding Window (${config.windowTurns || 10} turns)`;
    case 'summary_buffer':
      return `Running Summary (${config.summaryModel || 'gemini-flash-latest'})`;
    case 'vector_rag':
      return `Vector RAG (${config.vectorProvider || 'pgvector'}, top ${config.topK || 4})`;
    case 'entity_fact':
      return `Entity Graph (user: ${config.userIdKey || 'user_id'})`;
    default:
      return 'State persistence configured';
  }
};

const getToolIcon = (type: ToolDefinition['type']) => {
  switch (type) {
    case 'search':
      return <Globe className="w-3 h-3 text-sky-400" />;
    case 'code':
      return <Terminal className="w-3 h-3 text-emerald-400" />;
    case 'db':
      return <Database className="w-3 h-3 text-amber-400" />;
    case 'rag':
      return <FileText className="w-3 h-3 text-purple-400" />;
    case 'api':
      return <Radio className="w-3 h-3 text-rose-400" />;
    default:
      return <Code className="w-3 h-3 text-indigo-400" />;
  }
};

const getThemeStyles = (
  colorTheme?: string, 
  isA2A?: boolean, 
  isRouter?: boolean,
  isSynthesizer?: boolean,
  isHITL?: boolean,
  isFallback?: boolean,
  isGuardrail?: boolean
) => {
  // NOTE: A2A nodes use the cyan palette with Globe2 iconography per TASK-116
  if (isA2A) {
    return {
      border: 'border-cyan-500/50 hover:border-cyan-400 shadow-cyan-950/30',
      header: 'bg-[#161b22] text-cyan-300 border-[#30363d]',
      badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
      accent: 'text-cyan-400',
      dot: 'bg-cyan-500',
    };
  }

  // NOTE: Router nodes use the neon purple palette with branching iconography per TASK-117
  if (isRouter) {
    return {
      border: 'border-purple-500/50 hover:border-purple-400 shadow-purple-950/30',
      header: 'bg-[#161b22] text-purple-300 border-[#30363d]',
      badge: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
      accent: 'text-purple-400',
      dot: 'bg-purple-500',
    };
  }

  // NOTE: Synthesizer nodes use the emerald palette with Layers iconography per TASK-187
  if (isSynthesizer) {
    return {
      border: 'border-emerald-500/50 hover:border-emerald-400 shadow-emerald-950/30',
      header: 'bg-[#161b22] text-emerald-300 border-[#30363d]',
      badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      accent: 'text-emerald-400',
      dot: 'bg-emerald-500',
    };
  }

  // NOTE: HITL approval nodes use the amber palette with ShieldAlert iconography per TASK-188
  if (isHITL) {
    return {
      border: 'border-amber-500/50 hover:border-amber-400 shadow-amber-950/30',
      header: 'bg-[#161b22] text-amber-300 border-[#30363d]',
      badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
      accent: 'text-amber-400',
      dot: 'bg-amber-500',
    };
  }

  // NOTE: Fallback circuit breaker nodes use the rose palette with LifeBuoy iconography per TASK-189
  if (isFallback) {
    return {
      border: 'border-rose-500/50 hover:border-rose-400 shadow-rose-950/30',
      header: 'bg-[#161b22] text-rose-300 border-[#30363d]',
      badge: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
      accent: 'text-rose-400',
      dot: 'bg-rose-500',
    };
  }

  // NOTE: Guardrail shield nodes use the teal palette with ShieldCheck iconography per TASK-190
  if (isGuardrail) {
    return {
      border: 'border-teal-500/50 hover:border-teal-400 shadow-teal-950/30',
      header: 'bg-[#161b22] text-teal-300 border-[#30363d]',
      badge: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
      accent: 'text-teal-400',
      dot: 'bg-teal-500',
    };
  }

  switch (colorTheme) {
    case 'teal':
      return {
        border: 'border-teal-500/50 hover:border-teal-400 shadow-teal-950/30',
        header: 'bg-[#161b22] text-teal-300 border-[#30363d]',
        badge: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
        accent: 'text-teal-400',
        dot: 'bg-teal-500',
      };
    case 'purple':
      return {
        border: 'border-purple-500/50 hover:border-purple-400 shadow-purple-950/30',
        header: 'bg-[#161b22] text-purple-300 border-[#30363d]',
        badge: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
        accent: 'text-purple-400',
        dot: 'bg-purple-500',
      };
    case 'green':
      return {
        border: 'border-emerald-500/50 hover:border-emerald-400 shadow-emerald-950/30',
        header: 'bg-[#161b22] text-emerald-300 border-[#30363d]',
        badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
        accent: 'text-emerald-400',
        dot: 'bg-emerald-500',
      };
    case 'amber':
      return {
        border: 'border-amber-500/50 hover:border-amber-400 shadow-amber-950/30',
        header: 'bg-[#161b22] text-amber-300 border-[#30363d]',
        badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
        accent: 'text-amber-400',
        dot: 'bg-amber-500',
      };
    case 'rose':
      return {
        border: 'border-rose-500/50 hover:border-rose-400 shadow-rose-950/30',
        header: 'bg-[#161b22] text-rose-300 border-[#30363d]',
        badge: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
        accent: 'text-rose-400',
        dot: 'bg-rose-500',
      };
    case 'blue':
    default:
      return {
        border: 'border-blue-500/50 hover:border-blue-400 shadow-blue-950/30',
        header: 'bg-[#161b22] text-blue-300 border-[#30363d]',
        badge: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
        accent: 'text-blue-400',
        dot: 'bg-blue-500',
      };
  }
};

/**
 * Custom comparison function for React.memo to prevent unnecessary AgentNode re-renders.
 * Ensures the node only re-renders when its identity, selection state, dragging state,
 * or data values change, ignoring stable helper function reference updates.
 */
export function areEqual(prevProps: any, nextProps: any): boolean {
  if (prevProps.id !== nextProps.id) return false;
  if (prevProps.selected !== nextProps.selected) return false;
  if (prevProps.dragging !== nextProps.dragging) return false;

  const prevData = prevProps.data || {};
  const nextData = nextProps.data || {};

  const prevKeys = Object.keys(prevData);
  const nextKeys = Object.keys(nextData);

  if (prevKeys.length !== nextKeys.length) return false;

  for (const key of prevKeys) {
    // Skip functions
    if (typeof prevData[key] === 'function') continue;

    const valPrev = prevData[key];
    const valNext = nextData[key];

    if (valPrev === valNext) continue;

    // Deep comparison of objects/arrays
    if (typeof valPrev === 'object' && typeof valNext === 'object' && valPrev !== null && valNext !== null) {
      if (JSON.stringify(valPrev) !== JSON.stringify(valNext)) {
        return false;
      }
    } else {
      return false;
    }
  }

  return true;
}

const PATTERN_OPTIONS = ADK_DELEGATION_PATTERNS;

export const AgentNode = memo(({ id, data, selected }: NodeProps & { data: AgentData }) => {
  const isA2A = data.agentKind === 'a2a';
  const isRouter = data.agentKind === 'router';
  const isSynthesizer = data.agentKind === 'synthesizer';
  const isHITL = data.agentKind === 'hitl';
  const isFallback = data.agentKind === 'fallback';
  const isGuardrail = data.agentKind === 'guardrail';

  const theme = getThemeStyles(data?.colorTheme, isA2A, isRouter, isSynthesizer, isHITL, isFallback, isGuardrail);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [isToolDragOver, setIsToolDragOver] = useState(false);

  const subAgents = data.subAgents || [];
  const rawPattern: DelegationPattern = data.subAgentPattern || data.delegationPattern || subAgents[0]?.delegationType || 'parallel';
  const currentPattern: DelegationPattern = PATTERN_OPTIONS.some((opt) => opt.id === rawPattern)
    ? rawPattern
    : PATTERN_OPTIONS[0].id;

  const handleNodeDragOver = (e: React.DragEvent) => {
    // Check if dragging a tool
    if (e.dataTransfer.types.includes('application/reactflow/tool')) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
      setIsToolDragOver(true);
    }
  };

  const handleNodeDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsToolDragOver(false);
  };

  const handleNodeDrop = (e: React.DragEvent) => {
    const toolDataStr = e.dataTransfer.getData('application/reactflow/tool');
    if (toolDataStr) {
      e.preventDefault();
      e.stopPropagation();
      try {
        const tool = JSON.parse(toolDataStr) as ToolDefinition;
        if (tool && tool.id) {
          data.onAddSpecificTool?.(id, tool);
        }
      } catch (err) {
        console.error('Failed to parse dropped tool:', err);
      }
    }
    setIsToolDragOver(false);
  };

  const handleDragStartSub = (e: React.DragEvent, index: number) => {
    e.stopPropagation();
    setDraggedIdx(index);
    e.dataTransfer.setData('text/plain', index.toString());
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOverSub = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedIdx !== null && draggedIdx !== index) {
      setDragOverIdx(index);
    }
  };

  const handleDropSub = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedIdx !== null && draggedIdx !== dropIndex) {
      data.onReorderSubAgents?.(id, draggedIdx, dropIndex);
    }
    setDraggedIdx(null);
    setDragOverIdx(null);
  };

  const handleDragEndSub = () => {
    setDraggedIdx(null);
    setDragOverIdx(null);
  };

  const handleMoveSub = (e: React.MouseEvent, fromIdx: number, toIdx: number) => {
    e.stopPropagation();
    if (toIdx < 0 || toIdx >= subAgents.length) return;
    data.onReorderSubAgents?.(id, fromIdx, toIdx);
  };

  return (
    <div
      id={`node-agent-${id}`}
      onDragOver={handleNodeDragOver}
      onDragLeave={handleNodeDragLeave}
      onDrop={handleNodeDrop}
      className={`group relative min-w-[290px] max-w-[330px] rounded-xl backdrop-blur-md bg-[#161b22]/95 border transition-all duration-200 shadow-2xl ${
        isToolDragOver
          ? 'ring-2 ring-green-400 border-green-400 shadow-green-500/30 scale-[1.02]'
          : selected
          ? 'ring-2 ring-blue-500 border-transparent shadow-blue-500/20'
          : theme.border
      }`}
    >
      {/* Tool Drag-Over Overlay */}
      {isToolDragOver && (
        <div className="absolute inset-0 z-30 rounded-xl bg-green-950/85 backdrop-blur-xs border-2 border-dashed border-green-400 flex flex-col items-center justify-center pointer-events-none animate-in fade-in duration-100">
          <Wrench className="w-6 h-6 text-green-400 animate-bounce mb-1" />
          <span className="text-xs font-bold text-white">Attach Tool to {data.label}</span>
          <span className="text-[10px] text-green-300">Release to add</span>
        </div>
      )}
      {/* Target Connection Handle (Top - In) */}
      <Handle
        type="target"
        position={Position.Top}
        id="input"
        className={`!w-3.5 !h-3.5 !-top-1.5 border-2 border-[#0d1117] hover:scale-125 transition-transform z-20 cursor-crosshair ${
          data.isStartNode
            ? '!bg-amber-500 ring-2 ring-amber-400/50'
            : '!bg-blue-500'
        }`}
        title={data.isStartNode ? 'Root Agent Inbound (Top Handle - Triggers)' : 'Agent Input (Top Handle)'}
      />

      {/* Target Connection Handle (Left - In) - Root Agent Only (Triggers connect Orange to Orange) */}
      {data.isStartNode && (
        <Handle
          type="target"
          position={Position.Left}
          id="input_left"
          style={{ top: '50%' }}
          className="!bg-amber-500 ring-2 ring-amber-400/50 !w-3.5 !h-3.5 !-left-1.5 border-2 border-[#0d1117] hover:scale-125 transition-transform z-20 cursor-crosshair"
          title="Root Agent Inbound (Left Handle - Triggers)"
        />
      )}

      {/* Node Header */}
      <div className={`flex items-center justify-between px-3.5 py-2.5 rounded-t-xl border-b ${theme.header}`}>
        <div className="flex items-center gap-2 min-w-0">
          <div className={`p-1.5 rounded-md bg-[#0d1117] border shrink-0 ${
            isRouter 
              ? 'border-purple-500/40' 
              : isA2A 
              ? 'border-cyan-500/40' 
              : isSynthesizer 
              ? 'border-emerald-500/40' 
              : isHITL 
              ? 'border-amber-500/40' 
              : isFallback 
              ? 'border-rose-500/40' 
              : isGuardrail 
              ? 'border-teal-500/40' 
              : 'border-[#30363d]'
          }`}>
            {isRouter ? (
              <GitBranch className="w-4 h-4 text-purple-400" />
            ) : isA2A ? (
              data.a2aConfig?.iconUrl ? (
                <img src={data.a2aConfig.iconUrl} alt="A2A Icon" className="w-4 h-4 object-contain" />
              ) : (
                <Globe2 className="w-4 h-4 text-cyan-400" />
              )
            ) : isSynthesizer ? (
              <Layers className="w-4 h-4 text-emerald-400" />
            ) : isHITL ? (
              <ShieldAlert className="w-4 h-4 text-amber-400" />
            ) : isFallback ? (
              <LifeBuoy className="w-4 h-4 text-rose-400" />
            ) : isGuardrail ? (
              <ShieldCheck className="w-4 h-4 text-teal-400" />
            ) : (
              <Bot className={`w-4 h-4 ${theme.accent}`} />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-xs text-white truncate max-w-[130px]">
                {data.label}
              </span>
              {data.isStartNode ? (
                <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40 shadow-xs flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                  ROOT
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-1 text-[10px] text-gray-400 truncate">
              {isRouter ? (
                <>
                  <Split className="w-2.5 h-2.5 shrink-0 text-purple-400" />
                  <span className="truncate">
                    {data.routerConfig?.evaluationMode === 'boolean_expression'
                      ? `state.${data.routerConfig?.expressionVariable || 'status'}`
                      : data.routerConfig?.evaluationMode === 'llm_classifier'
                      ? 'LLM Classifier'
                      : data.routerConfig?.evaluationMode === 'threshold_score'
                      ? `Score ≥ ${data.routerConfig?.thresholdValue ?? 0.8}`
                      : 'Conditional Router'}
                  </span>
                </>
              ) : isA2A ? (
                <>
                  <Cpu className="w-2.5 h-2.5 shrink-0 text-cyan-400" />
                  <span className="truncate">{data.model || 'gemini-3.7-flash'} • A2A Client</span>
                </>
              ) : isSynthesizer ? (
                <>
                  <Layers className="w-2.5 h-2.5 shrink-0 text-emerald-400" />
                  <span className="truncate">{data.model || 'gemini-3.7-flash'} • Schema Reducer</span>
                </>
              ) : isHITL ? (
                <>
                  <ShieldAlert className="w-2.5 h-2.5 shrink-0 text-amber-400" />
                  <span className="truncate">{data.model || 'gemini-3.7-flash'} • Gatekeeper ({data.hitlConfig?.timeoutHours || 24}h)</span>
                </>
              ) : isFallback ? (
                <>
                  <LifeBuoy className="w-2.5 h-2.5 shrink-0 text-rose-400" />
                  <span className="truncate">{data.model || 'gemini-3.7-flash'} • Circuit Breaker ({data.fallbackConfig?.maxRetries || 3}x)</span>
                </>
              ) : isGuardrail ? (
                <>
                  <ShieldCheck className="w-2.5 h-2.5 shrink-0 text-teal-400" />
                  <span className="truncate">{data.model || 'gemini-3.7-flash'} • Shield ({data.guardrailConfig?.direction || 'ingress'})</span>
                </>
              ) : (
                <>
                  <Cpu className="w-2.5 h-2.5 shrink-0 text-gray-400" />
                  <span className="truncate">{data.model}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-1 shrink-0">
          {data.onEdit && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                data.onEdit?.(id);
              }}
              title="Edit Node Configuration"
              className="p-1 rounded hover:bg-[#30363d] text-gray-400 hover:text-white transition-colors cursor-pointer"
            >
              <Sliders className="w-3.5 h-3.5" />
            </button>
          )}
          {data.onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                data.onDelete?.(id);
              }}
              title="Delete Node"
              className="p-1 rounded hover:bg-rose-500/20 text-gray-400 hover:text-rose-400 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Node Body */}
      <div className="p-3 space-y-2.5 text-xs text-gray-300">
        {/* Capability Badges: A2UI, Skills, Planner, Callbacks, Plugins */}
        {(data.a2uiConfig?.enabled ||
          (Array.isArray(data.skills) && data.skills.length > 0) ||
          (data.plannerConfig?.type && data.plannerConfig.type !== 'none') ||
          (Array.isArray(data.callbacks) && data.callbacks.length > 0) ||
          (Array.isArray(data.plugins) && data.plugins.some((p) => p.enabled !== false))) && (
          <div className="flex flex-wrap items-center gap-1 pb-1" data-testid="agent-capabilities-badges">
            {data.a2uiConfig?.enabled && (
              <span
                data-testid="agent-a2ui-badge"
                className="px-1.5 py-0.5 rounded text-[9px] font-mono font-medium bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1"
              >
                A2UI
              </span>
            )}
            {Array.isArray(data.skills) && data.skills.length > 0 && (
              <span
                data-testid="agent-skills-badge"
                className="px-1.5 py-0.5 rounded text-[9px] font-mono font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1"
              >
                Skills ({data.skills.length})
              </span>
            )}
            {data.plannerConfig?.type && data.plannerConfig.type !== 'none' && (
              <span
                data-testid="agent-planner-badge"
                className="px-1.5 py-0.5 rounded text-[9px] font-mono font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1"
              >
                {data.plannerConfig.type === 'built_in' ? 'BuiltInPlanner' : 'PlanReAct'}
              </span>
            )}
            {Array.isArray(data.callbacks) && data.callbacks.length > 0 && (
              <span
                data-testid="agent-callbacks-badge"
                className="px-1.5 py-0.5 rounded text-[9px] font-mono font-medium bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1"
              >
                Callbacks ({data.callbacks.length})
              </span>
            )}
            {Array.isArray(data.plugins) && data.plugins.some((p) => p.enabled !== false) && (
              <span
                data-testid="agent-plugins-badge"
                className="px-1.5 py-0.5 rounded text-[9px] font-mono font-medium bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 flex items-center gap-1"
              >
                Plugins ({data.plugins.filter((p) => p.enabled !== false).length})
              </span>
            )}
          </div>
        )}

        {isRouter ? (
          /* Router-Specific Visual Body */
          <div className="space-y-2.5">
            {/* Strategy / Instruction Card */}
            <div className="bg-[#0d1117] p-2.5 rounded-lg border border-purple-500/30">
              <div className="text-[10px] uppercase font-bold tracking-wider text-purple-400 mb-0.5 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Split className="w-2.5 h-2.5 text-purple-400" />
                  <span>Evaluation Logic</span>
                </span>
                <span className="text-[9px] text-purple-300 font-mono px-1 py-0.2 rounded bg-purple-500/20">
                  {data.routerConfig?.evaluationMode === 'boolean_expression' || data.routerConfig?.evaluationMode === 'boolean'
                    ? 'Boolean Expression'
                    : data.routerConfig?.evaluationMode === 'llm_classifier' || data.routerConfig?.evaluationMode === 'intent_classifier'
                    ? 'LLM Intent Classifier'
                    : data.routerConfig?.evaluationMode === 'threshold_score' || data.routerConfig?.evaluationMode === 'numeric_threshold'
                    ? 'Numeric Threshold'
                    : 'Pattern Match'}
                </span>
              </div>
              <p className="text-[11px] text-gray-300 line-clamp-2 leading-relaxed">
                {data.systemPrompt || data.role || 'Evaluates condition to direct execution flow.'}
              </p>
            </div>

            {/* Branches Card */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 text-[10px] font-bold tracking-wider text-gray-400 uppercase">
                  <GitBranch className="w-3 h-3 text-purple-400" />
                  <span>Branches ({data.routerConfig?.branches?.length || 2})</span>
                </div>
                {data.onEdit && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      data.onEdit?.(id);
                    }}
                    className="flex items-center gap-0.5 text-[10px] text-purple-400 hover:text-purple-300 hover:underline cursor-pointer font-medium"
                  >
                    Configure →
                  </button>
                )}
              </div>

              <div className="space-y-1">
                {(data.routerConfig?.branches || [
                  { id: 'branch_if_1', label: 'If: Condition Met', conditionExpression: "state.status == 'passed'" },
                  { id: 'branch_else_2', label: 'Else: Fallback', conditionExpression: "default", isDefault: true }
                ]).map((branch, idx) => {
                  const targetSub = data.subAgents?.find((s) => s.agentId === branch.targetAgentId);
                  return (
                    <div
                      key={branch.id || idx}
                      onClick={(e) => {
                        e.stopPropagation();
                        data.onEdit?.(id);
                      }}
                      className={`flex items-center justify-between p-1.5 rounded bg-[#0d1117] border cursor-pointer transition-colors ${
                        branch.targetAgentId 
                          ? 'border-purple-500/60 bg-purple-950/20 hover:border-purple-400' 
                          : 'border-[#30363d] hover:border-purple-500/40'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-purple-500/20 text-purple-300 font-bold">
                          #{idx + 1}
                        </span>
                        <span className="text-[10px] font-bold text-gray-200 truncate max-w-[110px]">
                          {branch.label}
                        </span>
                        {(branch.isDefault || branch.isDefaultFallback) && (
                          <span className="text-[8px] font-mono px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            Else
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {branch.targetAgentId ? (
                          <span className="text-[9px] font-mono text-purple-200 bg-purple-900/40 px-1.5 py-0.2 rounded border border-purple-500/40 truncate max-w-[100px]">
                            → {targetSub?.name || 'Agent'}
                          </span>
                        ) : (
                          <span className="text-[9px] font-mono text-purple-300 truncate max-w-[90px] bg-[#161b22] px-1 py-0.2 rounded border border-[#30363d]">
                            {branch.conditionExpression || branch.condition || (branch.isDefault ? 'default' : 'unassigned')}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Connector count hint */}
              <div className="pt-1 text-[9px] text-purple-400/80 font-mono flex items-center justify-between border-t border-purple-500/20">
                <span className="flex items-center gap-1">
                  <CornerDownRight className="w-2.5 h-2.5 text-purple-400" />
                  <span>{data.routerConfig?.branches?.length || 2} bottom connectors</span>
                </span>
                <span className="text-gray-400">1 handle per branch</span>
              </div>
            </div>
          </div>
        ) : isHITL ? (
          /* Human-in-the-Loop (Approval Gate) Visual Body */
          <div className="space-y-2.5">
            {/* Review Policy Card */}
            <div className="bg-[#0d1117] p-2.5 rounded-lg border border-amber-500/30">
              <div className="text-[10px] uppercase font-bold tracking-wider text-amber-400 mb-0.5 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <ShieldAlert className="w-2.5 h-2.5 text-amber-400" />
                  <span>Review Policy</span>
                </span>
                <span className="text-[9px] text-amber-300 font-mono px-1 py-0.2 rounded bg-amber-500/20">
                  {data.hitlConfig?.approvalType === 'multi_approver'
                    ? `Multi-Sig (${data.hitlConfig?.minApprovers || 2})`
                    : 'Single Approver'}
                </span>
              </div>
              <p className="text-[11px] text-gray-300 line-clamp-2 leading-relaxed">
                {data.systemPrompt || data.role || 'Requires explicit human authorization to continue.'}
              </p>
            </div>

            {/* Outbound Decision Paths */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 text-[10px] font-bold tracking-wider text-gray-400 uppercase">
                  <GitBranch className="w-3 h-3 text-amber-400" />
                  <span>Outbound Decision Paths (2)</span>
                </div>
                {data.onEdit && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      data.onEdit?.(id);
                    }}
                    className="flex items-center gap-0.5 text-[10px] text-amber-400 hover:text-amber-300 hover:underline cursor-pointer font-medium"
                  >
                    Configure →
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                {/* Approved Path Card */}
                {(() => {
                  const approvedSub = data.subAgents?.find((s) => s.agentId === data.hitlConfig?.approvedTargetAgentId);
                  return (
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        data.onEdit?.(id);
                      }}
                      className={`p-2 rounded bg-[#0d1117] border cursor-pointer transition-colors ${
                        data.hitlConfig?.approvedTargetAgentId
                          ? 'border-emerald-500/60 bg-emerald-950/20 hover:border-emerald-400'
                          : 'border-[#30363d] hover:border-emerald-500/40'
                      }`}
                    >
                      <div className="flex items-center gap-1 text-[9px] font-bold text-emerald-300 uppercase tracking-wider mb-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                        <span>Approved</span>
                      </div>
                      <div className="text-[10px] font-mono text-gray-200 truncate">
                        {approvedSub ? `→ ${approvedSub.name}` : <span className="text-gray-500 italic">Drag to connect</span>}
                      </div>
                    </div>
                  );
                })()}

                {/* Rejected Path Card */}
                {(() => {
                  const rejectedSub = data.subAgents?.find((s) => s.agentId === data.hitlConfig?.rejectedTargetAgentId);
                  return (
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        data.onEdit?.(id);
                      }}
                      className={`p-2 rounded bg-[#0d1117] border cursor-pointer transition-colors ${
                        data.hitlConfig?.rejectedTargetAgentId
                          ? 'border-rose-500/60 bg-rose-950/20 hover:border-rose-400'
                          : 'border-[#30363d] hover:border-rose-500/40'
                      }`}
                    >
                      <div className="flex items-center gap-1 text-[9px] font-bold text-rose-300 uppercase tracking-wider mb-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                        <span>Rejected</span>
                      </div>
                      <div className="text-[10px] font-mono text-gray-200 truncate">
                        {rejectedSub ? `→ ${rejectedSub.name}` : <span className="text-gray-500 italic">Drag to connect</span>}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Connector hint */}
              <div className="pt-1 text-[9px] text-amber-400/80 font-mono flex items-center justify-between border-t border-amber-500/20">
                <span className="flex items-center gap-1">
                  <CornerDownRight className="w-2.5 h-2.5 text-amber-400" />
                  <span>2 bottom connectors</span>
                </span>
                <span className="text-gray-400">Left: Approved • Right: Rejected</span>
              </div>
            </div>
          </div>
        ) : isFallback ? (
          /* Fallback Circuit Breaker Visual Body */
          <div className="space-y-2.5">
            {/* Resilience Policy Card */}
            <div className="bg-[#0d1117] p-2.5 rounded-lg border border-rose-500/30">
              <div className="text-[10px] uppercase font-bold tracking-wider text-rose-400 mb-0.5 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <LifeBuoy className="w-2.5 h-2.5 text-rose-400" />
                  <span>Circuit Breaker</span>
                </span>
                <span className="text-[9px] text-rose-300 font-mono px-1 py-0.2 rounded bg-rose-500/20">
                  {data.fallbackConfig?.failureThreshold || 3} max fails
                </span>
              </div>
              <p className="text-[11px] text-gray-300 line-clamp-2 leading-relaxed">
                {data.systemPrompt || data.role || 'Routes to secondary fallback upon execution error or timeout.'}
              </p>
            </div>

            {/* Outbound Paths */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 text-[10px] font-bold tracking-wider text-gray-400 uppercase">
                  <GitBranch className="w-3 h-3 text-rose-400" />
                  <span>Execution Paths (2)</span>
                </div>
                {data.onEdit && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      data.onEdit?.(id);
                    }}
                    className="flex items-center gap-0.5 text-[10px] text-rose-400 hover:text-rose-300 hover:underline cursor-pointer font-medium"
                  >
                    Configure →
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                {/* Primary Path Card */}
                {(() => {
                  const primarySub = data.subAgents?.find((s) => s.agentId === data.fallbackConfig?.primaryTargetAgentId);
                  return (
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        data.onEdit?.(id);
                      }}
                      className={`p-2 rounded bg-[#0d1117] border cursor-pointer transition-colors ${
                        data.fallbackConfig?.primaryTargetAgentId
                          ? 'border-blue-500/60 bg-blue-950/20 hover:border-blue-400'
                          : 'border-[#30363d] hover:border-blue-500/40'
                      }`}
                    >
                      <div className="flex items-center gap-1 text-[9px] font-bold text-blue-300 uppercase tracking-wider mb-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                        <span>Primary Path</span>
                      </div>
                      <div className="text-[10px] font-mono text-gray-200 truncate">
                        {primarySub ? `→ ${primarySub.name}` : <span className="text-gray-500 italic">Drag to connect</span>}
                      </div>
                    </div>
                  );
                })()}

                {/* Fallback Path Card */}
                {(() => {
                  const fallbackSub = data.subAgents?.find((s) => s.agentId === data.fallbackConfig?.fallbackTargetAgentId);
                  return (
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        data.onEdit?.(id);
                      }}
                      className={`p-2 rounded bg-[#0d1117] border cursor-pointer transition-colors ${
                        data.fallbackConfig?.fallbackTargetAgentId
                          ? 'border-rose-500/60 bg-rose-950/20 hover:border-rose-400'
                          : 'border-[#30363d] hover:border-rose-500/40'
                      }`}
                    >
                      <div className="flex items-center gap-1 text-[9px] font-bold text-rose-300 uppercase tracking-wider mb-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                        <span>Fallback / Catch</span>
                      </div>
                      <div className="text-[10px] font-mono text-gray-200 truncate">
                        {fallbackSub ? `→ ${fallbackSub.name}` : <span className="text-gray-500 italic">Drag to connect</span>}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Connector hint */}
              <div className="pt-1 text-[9px] text-rose-400/80 font-mono flex items-center justify-between border-t border-rose-500/20">
                <span className="flex items-center gap-1">
                  <CornerDownRight className="w-2.5 h-2.5 text-rose-400" />
                  <span>2 bottom connectors</span>
                </span>
                <span className="text-gray-400">Left: Primary • Right: Fallback</span>
              </div>
            </div>
          </div>
        ) : isGuardrail ? (
          /* Guardrail Shield Visual Body */
          <div className="space-y-2.5">
            {/* Policy Moderation Card */}
            <div className="bg-[#0d1117] p-2.5 rounded-lg border border-teal-500/30">
              <div className="text-[10px] uppercase font-bold tracking-wider text-teal-400 mb-0.5 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <ShieldCheck className="w-2.5 h-2.5 text-teal-400" />
                  <span>Safety Policy</span>
                </span>
                <span className="text-[9px] text-teal-300 font-mono px-1 py-0.2 rounded bg-teal-500/20">
                  {data.guardrailConfig?.strictness ? `${data.guardrailConfig.strictness} strictness` : 'Standard'}
                </span>
              </div>
              <p className="text-[11px] text-gray-300 line-clamp-2 leading-relaxed">
                {data.systemPrompt || data.role || 'Evaluates content against safety policies and compliance checks.'}
              </p>
            </div>

            {/* Outbound Paths */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 text-[10px] font-bold tracking-wider text-gray-400 uppercase">
                  <GitBranch className="w-3 h-3 text-teal-400" />
                  <span>Safety Paths (2)</span>
                </div>
                {data.onEdit && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      data.onEdit?.(id);
                    }}
                    className="flex items-center gap-0.5 text-[10px] text-teal-400 hover:text-teal-300 hover:underline cursor-pointer font-medium"
                  >
                    Configure →
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                {/* Pass Path Card */}
                {(() => {
                  const passSub = data.subAgents?.find((s) => s.agentId === data.guardrailConfig?.passTargetAgentId);
                  return (
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        data.onEdit?.(id);
                      }}
                      className={`p-2 rounded bg-[#0d1117] border cursor-pointer transition-colors ${
                        data.guardrailConfig?.passTargetAgentId
                          ? 'border-teal-500/60 bg-teal-950/20 hover:border-teal-400'
                          : 'border-[#30363d] hover:border-teal-500/40'
                      }`}
                    >
                      <div className="flex items-center gap-1 text-[9px] font-bold text-teal-300 uppercase tracking-wider mb-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-teal-400"></span>
                        <span>Pass / Safe</span>
                      </div>
                      <div className="text-[10px] font-mono text-gray-200 truncate">
                        {passSub ? `→ ${passSub.name}` : <span className="text-gray-500 italic">Drag to connect</span>}
                      </div>
                    </div>
                  );
                })()}

                {/* Block Path Card */}
                {(() => {
                  const blockSub = data.subAgents?.find((s) => s.agentId === data.guardrailConfig?.blockTargetAgentId);
                  return (
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        data.onEdit?.(id);
                      }}
                      className={`p-2 rounded bg-[#0d1117] border cursor-pointer transition-colors ${
                        data.guardrailConfig?.blockTargetAgentId
                          ? 'border-rose-500/60 bg-rose-950/20 hover:border-rose-400'
                          : 'border-[#30363d] hover:border-rose-500/40'
                      }`}
                    >
                      <div className="flex items-center gap-1 text-[9px] font-bold text-rose-300 uppercase tracking-wider mb-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                        <span>Block / Flagged</span>
                      </div>
                      <div className="text-[10px] font-mono text-gray-200 truncate">
                        {blockSub ? `→ ${blockSub.name}` : <span className="text-gray-500 italic">Drag to connect</span>}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Connector hint */}
              <div className="pt-1 text-[9px] text-teal-400/80 font-mono flex items-center justify-between border-t border-teal-500/20">
                <span className="flex items-center gap-1">
                  <CornerDownRight className="w-2.5 h-2.5 text-teal-400" />
                  <span>2 bottom connectors</span>
                </span>
                <span className="text-gray-400">Left: Pass • Right: Block</span>
              </div>
            </div>
          </div>
        ) : (
          /* Standard / A2A Agent Body */
          <>
            {/* Agent Prompt / Description preview */}
            <div className="bg-[#0d1117] p-2.5 rounded-lg border border-[#30363d]">
              <div className="text-[10px] uppercase font-bold tracking-wider text-gray-400 mb-0.5 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Sparkles className={`w-2.5 h-2.5 ${isA2A ? 'text-cyan-400' : 'text-amber-400'}`} />
                  {isA2A ? 'Published Capability' : 'Agent Prompt'}
                </span>
                {isA2A && (
                  <span className="text-[9px] text-cyan-400 font-mono">Peer Intent</span>
                )}
              </div>
              <p className={`text-[11px] line-clamp-2 leading-relaxed ${data.systemPrompt ? 'text-gray-300' : 'text-gray-500 italic'}`}>
                {data.systemPrompt || 'Add agent instructions'}
              </p>
            </div>

            {/* A2A Dedicated Endpoint Status Badge & Protocol Card (2nd field on A2A card, above tools) */}
            {isA2A && (
              <div 
                onClick={(e) => {
                  e.stopPropagation();
                  data.onEdit?.(id);
                }}
                className="bg-[#0d1117] p-2.5 rounded-lg border border-cyan-500/40 hover:border-cyan-400/70 transition-all cursor-pointer group/a2a space-y-2"
                title="Click to configure A2A endpoint parameters"
              >
                {/* Endpoint Status Badge Header */}
                <div className="flex items-center justify-between text-[10px]">
                  <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-cyan-300">
                    {data.a2aConfig?.endpoint ? (
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-sm shadow-emerald-500/50" />
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-amber-400 shadow-sm shadow-amber-500/50" />
                    )}
                    <span>A2A Endpoint</span>
                  </span>
                  <span className="px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-mono text-[9px] font-semibold">
                    {data.a2aConfig?.protocolVersion || '1.0.0-a2a'}
                  </span>
                </div>

                {/* Endpoint URL Pill */}
                <div className="font-mono text-[10px] text-gray-200 bg-[#161b22] px-2 py-1 rounded border border-[#30363d] group-hover/a2a:border-cyan-500/40 truncate flex items-center gap-1.5 transition-colors">
                  <Globe2 className={`w-3 h-3 shrink-0 ${data.a2aConfig?.endpoint ? 'text-cyan-400' : 'text-amber-400'}`} />
                  {data.a2aConfig?.endpoint ? (
                    <span className="truncate">{data.a2aConfig.endpoint}</span>
                  ) : (
                    <span className="truncate text-gray-500 italic">No endpoint configured (Import card)</span>
                  )}
                </div>

                {/* Agent Card Discovery Path & Auth Type Badge */}
                <div className="flex items-center justify-between text-[9px] text-gray-400 pt-0.5">
                  <span className="flex items-center gap-1 truncate max-w-[170px]">
                    <span className="text-gray-500 font-mono">Card:</span>
                    <span className="font-mono text-cyan-300 truncate">
                      {data.a2aConfig?.agentCardUrl || (data.a2aConfig?.rawJsonPack ? 'Inline JSON spec' : 'Not specified')}
                    </span>
                  </span>
                  <span className="px-1.5 py-0.2 rounded bg-[#161b22] border border-[#30363d] uppercase font-mono text-[8px] text-cyan-400 font-bold">
                    {data.a2aConfig?.authType || 'bearer'}
                  </span>
                </div>

                {/* Empty State Banner if neither skills nor capabilities configured */}
                {(!data.a2aConfig?.skills || data.a2aConfig.skills.length === 0) && (!data.a2aConfig?.capabilities || data.a2aConfig.capabilities.length === 0) && (
                  <div className="text-[9px] text-amber-400/90 bg-amber-950/20 px-2 py-0.5 rounded border border-amber-500/20 flex items-center gap-1">
                    <AlertCircle className="w-2.5 h-2.5 text-amber-400 shrink-0" />
                    <span>Agent card required</span>
                  </div>
                )}

                {/* Published Skills Preview */}
                {data.a2aConfig?.skills && data.a2aConfig.skills.length > 0 && (
                  <div className="flex items-center gap-1 text-[9px] text-cyan-300 font-mono bg-cyan-950/40 px-1.5 py-0.5 rounded border border-cyan-500/20 truncate">
                    <span className="text-cyan-400 font-bold">★ Skill:</span>
                    <span className="truncate">{data.a2aConfig.skills.map((s: any) => s.name || s.id).join(', ')}</span>
                  </div>
                )}

                {/* Capability Negotiation Chips */}
                {data.a2aConfig?.capabilities && data.a2aConfig.capabilities.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {data.a2aConfig.capabilities.slice(0, 3).map((cap) => (
                      <span key={cap} className="px-1.5 py-0.2 rounded bg-cyan-950/40 text-cyan-300 border border-cyan-500/20 text-[8.5px] font-mono">
                        {cap}
                      </span>
                    ))}
                    {data.a2aConfig.capabilities.length > 3 && (
                      <span className="text-[8.5px] text-cyan-400/80 font-mono self-center">
                        +{data.a2aConfig.capabilities.length - 3} more
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Structured Output Schema Preview (if enabled) */}
            {data.structuredOutput?.enabled && (
              <div 
                onClick={(e) => {
                  e.stopPropagation();
                  data.onEdit?.(id);
                }}
                className="bg-[#0d1117] p-2 rounded-lg border border-purple-500/30 hover:border-purple-500/60 transition-colors cursor-pointer group/struct"
              >
                <div className="flex items-center justify-between text-[10px]">
                  <div className="flex items-center gap-1 text-purple-300 font-bold uppercase tracking-wider">
                    <Braces className="w-3 h-3 text-purple-400" />
                    <span className="truncate max-w-[170px]">JSON Schema Output</span>
                  </div>
                  <span className="text-[9px] text-purple-300 font-mono">
                    {data.structuredOutput.fields.length} {data.structuredOutput.fields.length === 1 ? 'field' : 'fields'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {data.structuredOutput.fields.slice(0, 3).map((f) => (
                    <span key={f.id} className="text-[9px] px-1.5 py-0.2 rounded bg-[#161b22] border border-purple-500/20 text-purple-200 font-mono truncate max-w-[120px]">
                      {f.name}: {f.type}
                    </span>
                  ))}
                  {data.structuredOutput.fields.length > 3 && (
                    <span className="text-[9px] px-1 py-0.2 text-purple-400/70 font-mono">
                      +{data.structuredOutput.fields.length - 3} more
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Memory & Checkpoint Section (Only set on Root node) */}
            {data.isStartNode && (
              <div className="space-y-1.5 bg-[#0d1117] p-2 rounded-lg border border-cyan-500/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 text-[10px] font-bold tracking-wider text-cyan-400 uppercase">
                    <Brain className="w-3 h-3 text-cyan-400" />
                    <span>Memory & State</span>
                  </div>
                  {data.onEdit && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        data.onEdit?.(id);
                      }}
                      className="flex items-center gap-0.5 text-[10px] text-cyan-300 hover:text-cyan-200 hover:underline cursor-pointer font-medium"
                      title="Configure memory options in inspector"
                    >
                      <Sliders className="w-2.5 h-2.5" />
                      Edit
                    </button>
                  )}
                </div>

                {/* Memory Card info */}
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    data.onEdit?.(id);
                  }}
                  className="flex items-center justify-between p-1.5 rounded bg-[#161b22] border border-[#30363d] hover:border-cyan-500/50 cursor-pointer transition-colors group/mem"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className="p-1 rounded bg-[#0d1117] border border-cyan-500/30 shrink-0">
                      {getMemoryIcon(data.memoryConfig?.type || 'none')}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold text-white truncate">
                        {getMemoryLabel(data.memoryConfig?.type || 'none')}
                      </div>
                      <div className="text-[9px] text-gray-400 font-mono truncate">
                        {getMemorySummaryText(data.memoryConfig || { type: 'none' })}
                      </div>
                    </div>
                  </div>
                  <span className="text-[9px] text-cyan-400 opacity-60 group-hover/mem:opacity-100 font-medium shrink-0 ml-1">
                    Edit →
                  </span>
                </div>
              </div>
            )}

            {/* Tools Section */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 text-[10px] font-bold tracking-wider text-gray-400 uppercase">
                  <Wrench className="w-3 h-3 text-green-400" />
                  <span>Tools ({data.tools?.length || 0})</span>
                </div>
                {data.onAddTool && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      data.onAddTool?.(id);
                    }}
                    className="flex items-center gap-0.5 text-[10px] text-blue-400 hover:text-blue-300 hover:underline cursor-pointer font-medium"
                  >
                    <Plus className="w-2.5 h-2.5" />
                    Add Tool
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-1 min-h-[22px]">
                {data.tools && data.tools.length > 0 ? (
                  data.tools.map((tool) => (
                    <div
                      key={tool.id}
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#0d1117] border border-[#30363d] text-[10px] text-green-400 font-mono"
                    >
                      {getToolIcon(tool.type)}
                      <span className="truncate max-w-[90px]">{tool.name}</span>
                      {data.onRemoveTool && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            data.onRemoveTool?.(id, tool.id);
                          }}
                          className="hover:text-rose-400 text-gray-400 ml-0.5"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-[10px] text-gray-400 italic py-0.5">
                    No tools attached (LLM direct reasoning)
                  </div>
                )}
              </div>
            </div>

            {/* Attached Skills Section on Node Card */}
            {data.skills && data.skills.length > 0 && (
              <div className="space-y-1 pt-1 border-t border-[#30363d]" data-testid="agent-node-skills-section">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 text-[10px] font-bold tracking-wider text-purple-400 uppercase">
                    <FileText className="w-3 h-3 text-purple-400" />
                    <span>Skills ({data.skills.length})</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {data.skills.map((skill) => (
                    <span
                      key={skill.id || skill.name}
                      className="px-1.5 py-0.5 rounded bg-purple-950/40 border border-purple-500/30 text-[9px] text-purple-300 font-mono truncate max-w-[130px]"
                      title={`${skill.title || skill.name} (${skill.scope === 'agent' ? 'Agent Only' : 'Global'})`}
                    >
                      {skill.title || skill.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Sub-Agents Section with Pattern Dropdown Above the Orderable List (only rendered if child agents are connected) */}
            {subAgents.length > 0 && (
              <div className="space-y-2 pt-1 border-t border-[#30363d]">
                {/* Header & Pattern Dropdown above the sub-agent list */}
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1 text-[10px] font-bold tracking-wider text-gray-400 uppercase shrink-0">
                    <Users className="w-3 h-3 text-purple-400" />
                    <span>Sub-Agents ({subAgents.length})</span>
                  </div>

                  {/* Pattern dropdown directly in header to the right of the Sub-Agents label */}
                  <div className="relative group/pat shrink-0 nodrag">
                    <select
                      data-testid={`subagent-pattern-select-${id}`}
                      value={currentPattern}
                      onChange={(e) => {
                        e.stopPropagation();
                        const nextPattern = e.target.value as DelegationPattern;
                        if (data.onUpdateSubAgentPattern) {
                          data.onUpdateSubAgentPattern(id, nextPattern);
                        } else if (data.onPatternChange) {
                          data.onPatternChange(id, nextPattern);
                        }
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      className="nodrag text-[9px] bg-[#0d1117] text-purple-300 hover:text-purple-200 border border-purple-500/30 hover:border-purple-500/60 rounded px-1.5 py-0.5 pr-4 appearance-none cursor-pointer focus:outline-hidden font-mono"
                      title="Change multi-agent coordination pattern"
                    >
                      {PATTERN_OPTIONS.map((opt) => (
                        <option key={opt.id} value={opt.id} className="bg-[#161b22] text-gray-200 text-xs">
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-2.5 h-2.5 text-purple-400 absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                {/* When Loop pattern is selected, show Max Iterations number input (default 3) */}
                {currentPattern === 'loop' && (
                  <div 
                    className="flex items-center justify-between px-2 py-1 rounded bg-[#0d1117] border border-purple-500/30 text-[10px]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="text-purple-300 font-medium">Max Iterations:</span>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={data.maxIterations ?? 3}
                      onChange={(e) => {
                        e.stopPropagation();
                        const val = parseInt(e.target.value, 10);
                        data.onUpdateMaxIterations?.(id, isNaN(val) ? 3 : Math.max(1, val));
                      }}
                      className="w-12 text-center bg-[#161b22] text-purple-200 font-mono font-bold rounded border border-purple-500/40 px-1 py-0.5 focus:outline-none focus:border-purple-400 cursor-text"
                      title="Maximum number of loop iterations"
                    />
                  </div>
                )}

                {/* Sub-Agent List Items */}
                <div className="space-y-1 max-h-[140px] overflow-y-auto pr-0.5">
                  {subAgents.map((sub, index) => (
                    <div
                      key={sub.agentId || index}
                      draggable
                      onDragStart={(e) => handleDragStartSub(e, index)}
                      onDragOver={(e) => handleDragOverSub(e, index)}
                      onDrop={(e) => handleDropSub(e, index)}
                      onDragEnd={handleDragEndSub}
                      className={`flex items-center justify-between p-1 rounded bg-[#0d1117] border border-[#30363d] group/item text-[10px] transition-all cursor-grab active:cursor-grabbing ${
                        dragOverIdx === index ? 'border-purple-500 bg-purple-950/30' : ''
                      } ${draggedIdx === index ? 'opacity-40' : ''}`}
                    >
                      <div className="flex items-center gap-1 min-w-0">
                        <GripVertical className="w-2.5 h-2.5 text-gray-400 group-hover/item:text-gray-200 shrink-0" />
                        <span className="text-[9px] text-gray-400 font-mono shrink-0">#{index + 1}</span>
                        <div className="truncate min-w-0">
                          <span className="font-bold text-gray-200 truncate">{sub.name}</span>
                          {sub.role && (
                            <span className="text-gray-400 text-[9px] ml-1 truncate">({sub.role})</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-0.5 shrink-0 ml-1">
                        {/* Quick Up/Down Sort buttons */}
                        <button
                          disabled={index === 0}
                          onClick={(e) => handleMoveSub(e, index, index - 1)}
                          className="p-0.5 hover:text-purple-300 disabled:opacity-20 disabled:hover:text-gray-400 text-gray-400"
                          title="Move up"
                        >
                          <ChevronUp className="w-2.5 h-2.5" />
                        </button>
                        <button
                          disabled={index === subAgents.length - 1}
                          onClick={(e) => handleMoveSub(e, index, index + 1)}
                          className="p-0.5 hover:text-purple-300 disabled:opacity-20 disabled:hover:text-gray-400 text-gray-400"
                          title="Move down"
                        >
                          <ChevronDown className="w-2.5 h-2.5" />
                        </button>
                        {/* Disconnect button */}
                        {data.onRemoveSubAgent && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              data.onRemoveSubAgent?.(id, sub.agentId);
                            }}
                            className="hover:text-rose-400 text-gray-400 ml-0.5"
                            title="Disconnect sub-agent"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </>
        )}
      </div>

      {/* Handles: Dynamic multiple bottom connector circles for router, hitl, fallback, guardrail */}
      {isRouter ? (
        (data.routerConfig?.branches || [
          { id: 'branch_if_1', label: 'If: Condition Met', conditionExpression: "state.status == 'passed'" },
          { id: 'branch_else_2', label: 'Else: Fallback', conditionExpression: "default", isDefault: true }
        ]).map((branch, idx, arr) => {
          const count = arr.length;
          const leftPercent = count === 1 ? 50 : ((idx + 1) / (count + 1)) * 100;
          const isConnected = !!branch.targetAgentId;
          const handleId = branch.id || `branch_${idx}`;

          return (
            <React.Fragment key={handleId}>
              <Handle
                type="source"
                position={Position.Bottom}
                id={handleId}
                style={{ left: `${leftPercent}%` }}
                className={`!w-3.5 !h-3.5 !-bottom-1.5 border-2 border-[#0d1117] transition-all cursor-crosshair z-30 hover:scale-125 ${
                  isConnected
                    ? '!bg-purple-500 ring-2 ring-purple-400/80 shadow-md shadow-purple-500/50'
                    : '!bg-[#21262d] !border-purple-400 hover:!bg-purple-500'
                }`}
                title={`Branch #${idx + 1}: ${branch.label} (${branch.conditionExpression || branch.condition || 'default'})${
                  branch.targetAgentId ? ' (Connected)' : ' → Drag to connect target agent'
                }`}
              />
            </React.Fragment>
          );
        })
      ) : isHITL ? (
        <>
          {/* Approved Path Handle (Left: 25%) */}
          <Handle
            type="source"
            position={Position.Bottom}
            id="approved"
            style={{ left: '25%' }}
            className={`!w-3.5 !h-3.5 !-bottom-1.5 border-2 border-[#0d1117] transition-all cursor-crosshair z-30 hover:scale-125 ${
              data.hitlConfig?.approvedTargetAgentId
                ? '!bg-emerald-500 ring-2 ring-emerald-400/80 shadow-md shadow-emerald-500/50'
                : '!bg-[#21262d] !border-emerald-400 hover:!bg-emerald-500'
            }`}
            title={`Approved Path (Human Authorized)${
              data.hitlConfig?.approvedTargetAgentId ? ' (Connected)' : ' → Drag to connect agent'
            }`}
          />
          {/* Rejected Path Handle (Right: 75%) */}
          <Handle
            type="source"
            position={Position.Bottom}
            id="rejected"
            style={{ left: '75%' }}
            className={`!w-3.5 !h-3.5 !-bottom-1.5 border-2 border-[#0d1117] transition-all cursor-crosshair z-30 hover:scale-125 ${
              data.hitlConfig?.rejectedTargetAgentId
                ? '!bg-rose-500 ring-2 ring-rose-400/80 shadow-md shadow-rose-500/50'
                : '!bg-[#21262d] !border-rose-400 hover:!bg-rose-500'
            }`}
            title={`Rejected Path (Human Denied / Timeout)${
              data.hitlConfig?.rejectedTargetAgentId ? ' (Connected)' : ' → Drag to connect agent'
            }`}
          />
        </>
      ) : isFallback ? (
        <>
          {/* Primary Path Handle (Left: 25%) */}
          <Handle
            type="source"
            position={Position.Bottom}
            id="primary"
            style={{ left: '25%' }}
            className={`!w-3.5 !h-3.5 !-bottom-1.5 border-2 border-[#0d1117] transition-all cursor-crosshair z-30 hover:scale-125 ${
              data.fallbackConfig?.primaryTargetAgentId
                ? '!bg-blue-500 ring-2 ring-blue-400/80 shadow-md shadow-blue-500/50'
                : '!bg-[#21262d] !border-blue-400 hover:!bg-blue-500'
            }`}
            title={`Primary Execution Path${
              data.fallbackConfig?.primaryTargetAgentId ? ' (Connected)' : ' → Drag to connect agent'
            }`}
          />
          {/* Fallback Path Handle (Right: 75%) */}
          <Handle
            type="source"
            position={Position.Bottom}
            id="fallback"
            style={{ left: '75%' }}
            className={`!w-3.5 !h-3.5 !-bottom-1.5 border-2 border-[#0d1117] transition-all cursor-crosshair z-30 hover:scale-125 ${
              data.fallbackConfig?.fallbackTargetAgentId
                ? '!bg-rose-500 ring-2 ring-rose-400/80 shadow-md shadow-rose-500/50'
                : '!bg-[#21262d] !border-rose-400 hover:!bg-rose-500'
            }`}
            title={`Fallback / Error Recovery Path${
              data.fallbackConfig?.fallbackTargetAgentId ? ' (Connected)' : ' → Drag to connect agent'
            }`}
          />
        </>
      ) : isGuardrail ? (
        <>
          {/* Pass Path Handle (Left: 25%) */}
          <Handle
            type="source"
            position={Position.Bottom}
            id="pass"
            style={{ left: '25%' }}
            className={`!w-3.5 !h-3.5 !-bottom-1.5 border-2 border-[#0d1117] transition-all cursor-crosshair z-30 hover:scale-125 ${
              data.guardrailConfig?.passTargetAgentId
                ? '!bg-teal-500 ring-2 ring-teal-400/80 shadow-md shadow-teal-500/50'
                : '!bg-[#21262d] !border-teal-400 hover:!bg-teal-500'
            }`}
            title={`Pass Path (Policy Compliant)${
              data.guardrailConfig?.passTargetAgentId ? ' (Connected)' : ' → Drag to connect agent'
            }`}
          />
          {/* Block Path Handle (Right: 75%) */}
          <Handle
            type="source"
            position={Position.Bottom}
            id="block"
            style={{ left: '75%' }}
            className={`!w-3.5 !h-3.5 !-bottom-1.5 border-2 border-[#0d1117] transition-all cursor-crosshair z-30 hover:scale-125 ${
              data.guardrailConfig?.blockTargetAgentId
                ? '!bg-rose-500 ring-2 ring-rose-400/80 shadow-md shadow-rose-500/50'
                : '!bg-[#21262d] !border-rose-400 hover:!bg-rose-500'
            }`}
            title={`Block Path (Policy Violation Detected)${
              data.guardrailConfig?.blockTargetAgentId ? ' (Connected)' : ' → Drag to connect agent'
            }`}
          />
        </>
      ) : (
        <>
          {/* Main Flow Output Handle (Bottom Center) */}
          <Handle
            type="source"
            position={Position.Bottom}
            id="output"
            style={{ left: '50%' }}
            className="!w-3.5 !h-3.5 !-bottom-1.5 border-2 border-[#0d1117] !bg-blue-500 hover:scale-125 transition-transform z-30 cursor-crosshair"
            title="Agent Output"
          />
          {/* Fallback Subagent Handle (Stacked transparently for backward compatibility) */}
          <Handle
            type="source"
            position={Position.Bottom}
            id="subagent"
            style={{ left: '50%', opacity: 0, pointerEvents: 'none' }}
            className="!w-3.5 !h-3.5 !-bottom-1.5"
            title="Subagent Handle"
          />
        </>
      )}
    </div>
  );
});

AgentNode.displayName = 'AgentNode';
