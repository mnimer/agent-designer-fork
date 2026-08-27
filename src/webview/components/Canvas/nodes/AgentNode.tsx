/**
 * AgentNode Component
 *
 * Custom React Flow Node representing an autonomous LLM Agent.
 * Displays assigned model, system prompt preview, attached tools,
 * structured JSON schema outputs, and memory persistence settings.
 *
 * Architectural Decisions:
 * 1. Supports Standard Agent, Supervisor/Routing, and A2A Protocol variants.
 * 2. Provides dedicated connection handles for sequential execution (Emerald)
 *    and Sub-Agent delegation (Purple).
 * 3. Incorporates visual status badge (idle, running, success, error) for test execution.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import {
  Bot,
  Wrench,
  Sliders,
  Cpu,
  Sparkles,
  Trash2,
  Globe,
  Terminal,
  Database,
  Radio,
  Code,
  Brain,
  Braces,
  X,
  Plus,
} from 'lucide-react';
import { AgentNodeData, AgentToolConfig, SchemaField } from '../../../../shared/types';

export interface AgentNodeProps {
  id: string;
  data: AgentNodeData;
  selected?: boolean;
}

const getToolIcon = (type: string) => {
  switch (type) {
    case 'builtin':
      return <Globe className="w-3 h-3 text-sky-400" />;
    case 'custom':
      return <Terminal className="w-3 h-3 text-emerald-400" />;
    case 'mcp':
      return <Radio className="w-3 h-3 text-rose-400" />;
    case 'database':
      return <Database className="w-3 h-3 text-amber-400" />;
    default:
      return <Code className="w-3 h-3 text-indigo-400" />;
  }
};

const AgentNodeComponent: React.FC<AgentNodeProps> = ({ id, data = {} as AgentNodeData, selected }) => {
  const config = data?.standardConfig;
  const tools = config?.tools || (data as any)?.tools || [];
  const structuredOutput =
    config?.structuredOutput ||
    config?.outputSchema ||
    (data as any)?.structuredOutputSchema ||
    (data as any)?.outputSchema;
  const model = config?.model || (data as any)?.model || 'gemini-2.5-flash';
  const systemInstruction =
    config?.systemInstruction ||
    (data as any)?.systemPrompt ||
    (data as any)?.description ||
    'Autonomous reasoning agent prompt.';
  const memory = config?.memory || (data as any)?.memoryType || (data as any)?.memory;

  return (
    <div
      id={`node-agent-${id}`}
      className={`group relative min-w-[304px] max-w-[336px] rounded-xl backdrop-blur-md bg-[#161b22]/95 border transition-all duration-200 shadow-2xl ${
        selected
          ? 'ring-2 ring-blue-500 border-transparent shadow-blue-500/20 scale-[1.02]'
          : 'border-blue-500/50 hover:border-blue-400 shadow-blue-950/30'
      }`}
    >
      {/* Target Connection Handle (Top) */}
      <Handle
        type="target"
        position={Position.Top}
        id="input"
        className="!bg-blue-500 !w-3.5 !h-3.5 !-top-1.5 border-2 border-[#0d1117]"
      />

      {/* Target Connection Handle (Left) */}
      <Handle
        type="target"
        position={Position.Left}
        id="input_left"
        className="!bg-blue-500 !w-3 !h-3 !-left-1.5 border-2 border-[#0d1117]"
      />

      {/* Node Header */}
      <div className="flex items-center justify-between px-4 py-3 rounded-t-xl border-b bg-[#161b22] text-blue-300 border-[#30363d]">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-2 rounded-md bg-[#0d1117] border border-[#30363d] shrink-0">
            <Bot className="w-4 h-4 text-blue-400" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-xs text-white truncate max-w-[140px]">
                {data.label || 'Agent'}
              </span>
              <span className="text-[8px] uppercase tracking-wider px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-bold border border-blue-500/30">
                AGENT
              </span>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-gray-400 truncate">
              <Cpu className="w-2.5 h-2.5 shrink-0 text-gray-400" />
              <span className="truncate">{model}</span>
            </div>
          </div>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-1 shrink-0">
          {data.onEdit && (
            <button
              type="button"
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                data.onEdit?.(id);
              }}
              title="Edit Agent Configuration"
              className="p-1 rounded hover:bg-[#30363d] text-gray-400 hover:text-white transition-colors cursor-pointer"
            >
              <Sliders className="w-3.5 h-3.5" />
            </button>
          )}
          {data.onDelete && (
            <button
              type="button"
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                data.onDelete?.(id);
              }}
              title="Delete Agent"
              className="p-1 rounded hover:bg-rose-500/20 text-gray-400 hover:text-rose-400 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Node Body */}
      <div className="p-3 space-y-2 text-xs text-gray-300">
        {/* System Prompt preview */}
        <div className="bg-[#0d1117] p-2 rounded-lg border border-[#30363d]">
          <div className="text-[10px] uppercase font-bold tracking-wider text-gray-400 mb-1 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Sparkles className="w-2.5 h-2.5 text-amber-400" />
              System Prompt
            </span>
          </div>
          <p className="text-[11px] text-gray-300 line-clamp-2 leading-relaxed">
            {systemInstruction}
          </p>
        </div>

        {/* Structured Output Schema Preview Card */}
        {structuredOutput?.enabled && Array.isArray(structuredOutput.fields) && (
          <div
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              data.onEdit?.(id);
            }}
            className="bg-[#0d1117] p-2 rounded-lg border border-purple-500/30 hover:border-purple-500/60 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between text-[10px]">
              <div className="flex items-center gap-1 text-purple-300 font-bold uppercase tracking-wider">
                <Braces className="w-3 h-3 text-purple-400" />
                <span className="truncate max-w-[160px]">JSON Schema Output</span>
              </div>
              <span className="text-[9px] text-purple-300 font-mono">
                {structuredOutput.fields.length} {structuredOutput.fields.length === 1 ? 'field' : 'fields'}
              </span>
            </div>
            <div className="flex flex-wrap gap-1 mt-1">
              {structuredOutput.fields.slice(0, 3).map((f: SchemaField) => (
                <span
                  key={f.name}
                  className="text-[9px] px-2 py-0.5 rounded bg-[#161b22] border border-purple-500/20 text-purple-200 font-mono truncate max-w-[120px]"
                >
                  {f.name}: {f.type}
                </span>
              ))}
              {structuredOutput.fields.length > 3 && (
                <span className="text-[9px] px-1 py-0.5 text-purple-400/70 font-mono">
                  +{structuredOutput.fields.length - 3} more
                </span>
              )}
            </div>
          </div>
        )}

        {/* Memory Configuration Card */}
        {memory && memory !== 'none' && (
          <div className="bg-[#0d1117] p-2 rounded-lg border border-cyan-500/30 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <Brain className="w-3 h-3 text-cyan-400 shrink-0" />
              <span className="text-[10px] text-gray-300 font-medium truncate capitalize">
                Memory: {memory}
              </span>
            </div>
            <span className="text-[8px] text-cyan-300 font-mono px-2 py-0.5 rounded bg-cyan-500/20 border border-cyan-500/30">
              Active
            </span>
          </div>
        )}

        {/* Tools Section */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 text-[10px] font-bold tracking-wider text-gray-400 uppercase">
              <Wrench className="w-3 h-3 text-green-400" />
              <span>Tools ({tools.length})</span>
            </div>
            {data.onAddTool && (
              <button
                type="button"
                onClick={(e: React.MouseEvent) => {
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

          <div className="flex flex-wrap gap-1 min-h-[24px]">
            {tools.length > 0 ? (
              tools.map((tool: AgentToolConfig) => (
                <div
                  key={tool.id}
                  className="flex items-center gap-1 px-2 py-1 rounded bg-[#0d1117] border border-[#30363d] text-[10px] text-green-400 font-mono"
                >
                  {getToolIcon(tool.type)}
                  <span className="truncate max-w-[100px]">{tool.name}</span>
                  {data.onRemoveTool && (
                    <button
                      type="button"
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        data.onRemoveTool?.(id, tool.id);
                      }}
                      className="hover:text-rose-400 text-gray-400 ml-1 cursor-pointer"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>
              ))
            ) : (
              <div className="text-[10px] text-gray-400 italic py-1">
                No tools attached (Direct reasoning)
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Flow Output Handle (Bottom Center Left) */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="output"
        className="!w-3.5 !h-3.5 !-bottom-1.5 left-1/3 border-2 border-[#0d1117] !bg-emerald-500"
        title="Sequential Next Agent Output"
      />

      {/* Sub-Agent Delegation Handle (Bottom Center Right - Purple) */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="subagent"
        className="!bg-purple-500 !w-3.5 !h-3.5 !-bottom-1.5 left-2/3 border-2 border-[#0d1117] ring-2 ring-purple-500/40"
        title="Sub-Agent Delegation Link (Drag to sub-agent input)"
      />

      {/* Source Connection Handle (Right) */}
      <Handle
        type="source"
        position={Position.Right}
        id="output_right"
        className="!bg-blue-500 !w-3 !h-3 !-right-1.5 border-2 border-[#0d1117]"
      />
    </div>
  );
};

export const AgentNode = memo(AgentNodeComponent);
