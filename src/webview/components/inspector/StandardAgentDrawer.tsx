/**
 * StandardAgentDrawer - Inspector Drawer for Standard AI Agents
 * 
 * Purpose:
 * Provides a slide-out configuration panel to inspect and edit standard agent
 * properties including LLM model, prompt, memory, tools, and sub-agent delegation.
 * 
 * Architectural Decisions:
 * - Author: Mike Nimer <mikenimer@google.com>
 * - Sub-Agent Delegation Section: Conditionally hidden when subAgents.length === 0 to maintain clean UI.
 * - Pattern Options: Strictly limited to valid Google ADK orchestration patterns (Sequential, Parallel, Loop, Coordinator).
 * - Loop Configuration: Provides numeric Max Iterations bound (defaulting to 3) when Loop pattern is active.
 * - Synchronization: Keeps sub-agent list and order strictly identical with the canvas node card.
 */

import React, { useState } from 'react';
import { 
  Bot, 
  X, 
  Sliders, 
  Wrench, 
  Plus, 
  Cpu, 
  Sparkles, 
  Layers,
  GripVertical,
  ChevronUp,
  ChevronDown,
  Maximize2,
  Play,
  Brain,
  Database,
  Zap,
  Cloud,
  HardDrive,
  History,
  FileText,
  Search,
  Ban,
  Info,
  GitBranch,
  Share2,
  Scale,
  ShieldAlert,
  Flame,
  CheckCircle2,
  Pencil,
  AlertCircle
} from 'lucide-react';
import { 
  AgentData, 
  ToolDefinition, 
  DelegationPattern, 
  SubAgentRef, 
  AgentMemoryConfig, 
  AgentMemoryType, 
  AgentKind, 
  StructuredOutputSchema, 
  DebateConfig, 
  DebateStyle, 
  TieBreakerStrategy,
  ADK_DELEGATION_PATTERNS 
} from '../../types';
import { StructuredOutputBuilder } from './StructuredOutputBuilder';
import { MemoryDrawer } from './MemoryDrawer';
import { DrawerSection } from '../drawers/primitives/DrawerSection';
import { DrawerField } from '../drawers/primitives/DrawerField';
import { ModelSelector } from '../drawers/primitives/ModelSelector';
import { validateAgentIdentifier, sanitizeAgentIdentifier } from '../../../shared/identifierValidation';

interface StandardAgentDrawerProps {
  agent: AgentData;
  allAgents: AgentData[];
  onClose: () => void;
  onUpdateAgent: (updatedData: Partial<AgentData>) => void;
  onOpenAddTool: () => void;
  onRemoveTool: (toolId: string) => void;
  onEditTool?: (tool: ToolDefinition) => void;
  onSelectAgent?: (agentId: string) => void;
}



const PATTERN_OPTIONS = ADK_DELEGATION_PATTERNS;

export const StandardAgentDrawer: React.FC<StandardAgentDrawerProps> = ({
  agent,
  allAgents,
  onClose,
  onUpdateAgent,
  onOpenAddTool,
  onRemoveTool,
  onEditTool,
  onSelectAgent,
}) => {
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const subAgents = agent.subAgents || [];
  const currentPattern: DelegationPattern = agent.subAgentPattern || 'parallel';
  const promptValue = agent.systemPrompt ?? '';

  const currentIdentifier = agent.identifier || agent.name || sanitizeAgentIdentifier(agent.label || agent.id);
  const identifierValidation = validateAgentIdentifier(currentIdentifier);

  const handleLabelChange = (newLabel: string) => {
    const oldSanitized = sanitizeAgentIdentifier(agent.label || agent.id);
    const updates: Partial<AgentData> = { label: newLabel };
    if (!agent.name || agent.name === oldSanitized || !agent.identifier || agent.identifier === oldSanitized) {
      const newSanitized = sanitizeAgentIdentifier(newLabel);
      updates.name = newSanitized;
      updates.identifier = newSanitized;
    }
    onUpdateAgent(updates);
  };

  const handleIdentifierChange = (rawName: string) => {
    // Disallow spaces immediately by replacing with underscores
    const noSpaces = rawName.replace(/\s+/g, '_');
    onUpdateAgent({ name: noSpaces, identifier: noSpaces });
  };

  const handleMoveSubAgent = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= subAgents.length) return;
    const reordered = [...subAgents];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    onUpdateAgent({ subAgents: reordered });
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIdx(index);
    e.dataTransfer.setData('text/plain', index.toString());
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIdx !== null && draggedIdx !== index) {
      setDragOverIdx(index);
    }
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIdx !== null && draggedIdx !== dropIndex) {
      handleMoveSubAgent(draggedIdx, dropIndex);
    }
    setDraggedIdx(null);
    setDragOverIdx(null);
  };

  const handleRemoveSubAgent = (agentId: string) => {
    const updated = subAgents.filter((s) => s.agentId !== agentId);
    onUpdateAgent({ subAgents: updated });
  };

  const handlePromptChange = (newPrompt: string) => {
    onUpdateAgent({
      systemPrompt: newPrompt,
    });
  };

  return (
    <div className="absolute top-0 right-0 bottom-0 z-30 w-96 backdrop-blur-2xl bg-[#161b22]/95 border-l border-[#30363d] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200 text-[#c9d1d9]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 bg-[#161b22] border-b border-[#30363d] shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 rounded-lg bg-[#0d1117] border border-blue-500/30 text-blue-400 shrink-0 shadow-xs">
            <Bot className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-bold text-white truncate max-w-[200px]">
              {agent.label}
            </h3>
            <span className="text-[10px] text-blue-400 font-mono flex items-center gap-1">
              {agent.isStartNode ? 'Root Agent Properties' : 'Sub-Agent Properties'}
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-gray-400 hover:text-white hover:bg-[#30363d] transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Form Body */}
      <div className="flex-1 p-4 space-y-4 overflow-y-auto text-xs text-gray-300">
        {/* Agent Display Name & Python Identifier */}
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-[11px] font-bold uppercase tracking-tight text-gray-400">Agent Display Name</label>
            <input
              type="text"
              value={agent.label}
              onChange={(e) => handleLabelChange(e.target.value)}
              placeholder="e.g. Cat Agent, Triage Specialist"
              className="w-full px-3 py-1.5 bg-[#0d1117] border border-[#30363d] focus:border-blue-500 rounded-lg text-xs text-white focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-tight text-gray-400">
                Agent Identifier (Python ID)
              </label>
              <span className="text-[10px] text-gray-400 font-mono">ADK LlmAgent name</span>
            </div>
            <input
              type="text"
              value={currentIdentifier}
              onChange={(e) => handleIdentifierChange(e.target.value)}
              placeholder="e.g. cat_agent"
              className={`w-full px-3 py-1.5 bg-[#0d1117] border rounded-lg text-xs font-mono text-white focus:outline-none ${
                identifierValidation.isValid
                  ? 'border-[#30363d] focus:border-blue-500'
                  : 'border-red-500 focus:border-red-500 bg-red-950/20'
              }`}
            />
            {!identifierValidation.isValid && (
              <div className="flex items-center gap-1.5 text-[11px] text-red-400 mt-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{identifierValidation.error}</span>
              </div>
            )}
            <div className="text-[10px] text-gray-400">
              Must be a valid Python identifier (letters, digits, underscores; no spaces or hyphens).
            </div>
          </div>
        </div>

        {/* Agent Prompt (Adjustable TextArea for Large Prompts) */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold uppercase tracking-tight text-gray-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Agent Prompt</span>
            </label>
            <span className="text-[10px] text-gray-400 font-mono">
              {promptValue.length} chars • {promptValue.split(/\s+/).filter(Boolean).length} words
            </span>
          </div>
          
          <div className="relative group">
            <textarea
              rows={8}
              value={promptValue}
              onChange={(e) => handlePromptChange(e.target.value)}
              placeholder="Add agent instructions"
              className="w-full min-h-[160px] max-h-[480px] px-3 py-2 bg-[#0d1117] border border-[#30363d] focus:border-blue-500 rounded-lg text-xs text-gray-200 focus:outline-none resize-y font-mono leading-relaxed selection:bg-blue-900 selection:text-white"
            />
            <div className="text-[10px] text-gray-400 mt-1 flex items-center justify-between">
              <span>Supports large system prompts, persona directives & few-shot instructions</span>
              <span className="text-[9px] font-mono text-gray-400">↕ Drag corner to expand</span>
            </div>
          </div>
        </div>

        {/* STRUCTURED OUTPUT SCHEMA BUILDER */}
        <StructuredOutputBuilder
          schema={agent.structuredOutput}
          agentLabel={agent.label}
          onChange={(newSchema: StructuredOutputSchema) => {
            onUpdateAgent({
              structuredOutput: newSchema,
              outputFormat: newSchema.enabled ? 'structured' : 'text',
            });
          }}
        />

        {/* Modular AI Model & Hyperparameter Settings */}
        <ModelSelector
          selectedModel={agent.model || 'gemini-3.8-flash'}
          onChangeModel={(model) => onUpdateAgent({ model })}
          temperature={agent.temperature ?? 1.0}
          onChangeTemperature={(temperature) => onUpdateAgent({ temperature })}
          thinkingBudget={agent.thinkingBudget}
          onChangeThinkingBudget={(thinkingBudget) => onUpdateAgent({ thinkingBudget })}
        />

        {/* AGENT MEMORY & CHECKPOINTING SECTION (Root node only) */}
        {agent.isStartNode && (
          <MemoryDrawer
            memoryConfig={agent.memoryConfig}
            isRootNode={agent.isStartNode}
            onUpdateMemoryConfig={(newConfig) => {
              onUpdateAgent({
                memoryConfig: newConfig,
                memoryType: newConfig.type,
              });
            }}
          />
        )}

        {/* Attached Tools Section */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold uppercase tracking-tight text-gray-400 flex items-center gap-1">
              <Wrench className="w-3 h-3 text-green-400" />
              Attached Tools ({agent.tools?.length || 0})
            </label>
            <button
              onClick={onOpenAddTool}
              className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 font-medium cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              Add Tool
            </button>
          </div>

          <div className="space-y-1.5">
            {agent.tools && agent.tools.length > 0 ? (
              agent.tools.map((tool: ToolDefinition) => (
                <div
                  key={tool.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-[#0d1117] border border-[#30363d]"
                >
                  <div className="min-w-0 pr-2">
                    <div className="font-semibold text-gray-200 text-xs truncate">{tool.name}</div>
                    <div className="text-[10px] text-gray-400 truncate max-w-[190px]">{tool.description}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {onEditTool && (
                      <button
                        type="button"
                        onClick={() => onEditTool(tool)}
                        title={`Configure ${tool.name} for this agent`}
                        className="p-1 text-gray-400 hover:text-blue-400 hover:bg-[#161b22] rounded transition-colors cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onRemoveTool(tool.id)}
                      title={`Remove ${tool.name}`}
                      className="p-1 text-gray-400 hover:text-rose-400 hover:bg-[#161b22] rounded transition-colors cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-[11px] text-gray-400 italic p-2 bg-[#0d1117] rounded-lg border border-dashed border-[#30363d]">
                No tools attached yet. Click "Add Tool" to attach web search, code interpreter, or custom APIs.
              </div>
            )}
          </div>
        </div>

        {/* Sub-Agent Delegation Section: Only rendered when child agents are connected */}
        {subAgents.length > 0 && (
          <div className="space-y-2.5 pt-2 border-t border-[#30363d]">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-tight text-gray-400 flex items-center gap-1">
                <Layers className="w-3 h-3 text-purple-400" />
                Sub-Agent Delegation ({subAgents.length})
              </label>
              <span className="text-[10px] text-gray-500 font-normal">drag handle to reorder</span>
            </div>

            {/* Pattern Dropdown placed directly above the list */}
            <div className="space-y-1 bg-[#0d1117] p-2.5 rounded-lg border border-purple-500/30">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold uppercase tracking-tight text-purple-300">
                  Orchestration Pattern
                </label>
              </div>
              <select
                value={currentPattern}
                onChange={(e) => {
                  const newPattern = e.target.value as DelegationPattern;
                  const updates: Partial<AgentData> = { subAgentPattern: newPattern };
                  if (newPattern === 'loop' && agent.maxIterations === undefined) {
                    updates.maxIterations = 3;
                  }
                  if (newPattern === 'debate' && !agent.debateConfig) {
                    updates.debateConfig = {
                      maxRounds: 2,
                      consensusThreshold: 0.85,
                      earlyStoppingEnabled: true,
                      debateStyle: 'structured_rebuttal',
                      tieBreakerStrategy: 'conditional_approval',
                      minWordLimitPerBrief: 250,
                      requireEvidenceCitations: true,
                    };
                  }
                  onUpdateAgent(updates);
                }}
                className="w-full px-2.5 py-1.5 bg-[#161b22] border border-purple-500/40 focus:border-purple-400 rounded text-xs text-purple-200 font-medium focus:outline-none cursor-pointer"
              >
                {PATTERN_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id} className="bg-[#161b22] text-gray-200">
                    {opt.label} — {opt.desc}
                  </option>
                ))}
              </select>
            </div>

            {/* Loop Pattern Max Iterations Configuration */}
            {currentPattern === 'loop' && (
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#0d1117] border border-purple-500/30">
                <div>
                  <label className="text-xs font-semibold text-purple-200">Max Iterations</label>
                  <p className="text-[10px] text-gray-400">Maximum loop cycles before terminating (default 3)</p>
                </div>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={agent.maxIterations ?? 3}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    onUpdateAgent({ maxIterations: isNaN(val) ? 3 : Math.max(1, val) });
                  }}
                  className="w-16 bg-[#161b22] text-purple-200 text-xs font-mono font-bold px-2 py-1 rounded border border-purple-500/40 focus:border-purple-400 focus:outline-none text-right cursor-text"
                />
              </div>
            )}

          {/* Debate & Consensus Pattern Configuration Panel */}
          {(currentPattern === 'debate' || agent.debateConfig) && (
            <div className="space-y-3 bg-[#0d1117] p-3 rounded-lg border border-pink-500/40 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-pink-300">
                  <Scale className="w-3.5 h-3.5 text-pink-400" />
                  Debate & Consensus Settings
                </div>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-pink-500/20 text-pink-300 border border-pink-500/30 font-mono">
                  Convergence Loop
                </span>
              </div>

              {/* Max Rounds / Turn Bound */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label className="text-[11px] text-gray-300 font-medium">Max Debate Rounds</label>
                  <span className="font-mono text-xs text-pink-400 font-bold">
                    {agent.debateConfig?.maxRounds ?? 2} {agent.debateConfig?.maxRounds === 1 ? 'Round' : 'Rounds'}
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="6"
                  step="1"
                  value={agent.debateConfig?.maxRounds ?? 2}
                  onChange={(e) => onUpdateAgent({
                    debateConfig: {
                      maxRounds: parseInt(e.target.value) || 2,
                      consensusThreshold: agent.debateConfig?.consensusThreshold ?? 0.85,
                      earlyStoppingEnabled: agent.debateConfig?.earlyStoppingEnabled ?? true,
                      debateStyle: agent.debateConfig?.debateStyle ?? 'structured_rebuttal',
                      tieBreakerStrategy: agent.debateConfig?.tieBreakerStrategy ?? 'conditional_approval',
                      requireEvidenceCitations: agent.debateConfig?.requireEvidenceCitations ?? true,
                      minWordLimitPerBrief: agent.debateConfig?.minWordLimitPerBrief ?? 250,
                    }
                  })}
                  className="w-full h-1.5 bg-[#21262d] rounded-lg appearance-none cursor-pointer accent-pink-500"
                />
                <div className="flex justify-between text-[9px] text-gray-500 font-mono">
                  <span>1 (Opening Only)</span>
                  <span>2 (1 Rebuttal)</span>
                  <span>3 (2 Rebuttals)</span>
                  <span>6 (Deep Panel)</span>
                </div>
              </div>

              {/* Consensus Confidence Threshold */}
              <div className="space-y-1.5 pt-2 border-t border-[#21262d]">
                <div className="flex items-center justify-between text-xs">
                  <label className="text-[11px] text-gray-300 font-medium">Consensus Threshold</label>
                  <span className="font-mono text-xs text-emerald-400 font-bold">
                    {Math.round((agent.debateConfig?.consensusThreshold ?? 0.85) * 100)}% Agreement
                  </span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="99"
                  step="1"
                  value={Math.round((agent.debateConfig?.consensusThreshold ?? 0.85) * 100)}
                  onChange={(e) => onUpdateAgent({
                    debateConfig: {
                      maxRounds: agent.debateConfig?.maxRounds ?? 2,
                      consensusThreshold: (parseInt(e.target.value) || 85) / 100,
                      earlyStoppingEnabled: agent.debateConfig?.earlyStoppingEnabled ?? true,
                      debateStyle: agent.debateConfig?.debateStyle ?? 'structured_rebuttal',
                      tieBreakerStrategy: agent.debateConfig?.tieBreakerStrategy ?? 'conditional_approval',
                      requireEvidenceCitations: agent.debateConfig?.requireEvidenceCitations ?? true,
                      minWordLimitPerBrief: agent.debateConfig?.minWordLimitPerBrief ?? 250,
                    }
                  })}
                  className="w-full h-1.5 bg-[#21262d] rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
                <p className="text-[10px] text-gray-400">
                  Minimum semantic agreement score required for the Judge to approve consensus.
                </p>
              </div>

              {/* Early Stopping Toggle */}
              <div className="flex items-start gap-2 pt-2 border-t border-[#21262d]">
                <input
                  type="checkbox"
                  id="earlyStoppingCheckbox"
                  checked={agent.debateConfig?.earlyStoppingEnabled !== false}
                  onChange={(e) => onUpdateAgent({
                    debateConfig: {
                      maxRounds: agent.debateConfig?.maxRounds ?? 2,
                      consensusThreshold: agent.debateConfig?.consensusThreshold ?? 0.85,
                      earlyStoppingEnabled: e.target.checked,
                      debateStyle: agent.debateConfig?.debateStyle ?? 'structured_rebuttal',
                      tieBreakerStrategy: agent.debateConfig?.tieBreakerStrategy ?? 'conditional_approval',
                      requireEvidenceCitations: agent.debateConfig?.requireEvidenceCitations ?? true,
                      minWordLimitPerBrief: agent.debateConfig?.minWordLimitPerBrief ?? 250,
                    }
                  })}
                  className="w-3.5 h-3.5 mt-0.5 accent-pink-500 rounded cursor-pointer shrink-0"
                />
                <label htmlFor="earlyStoppingCheckbox" className="text-[11px] text-gray-300 cursor-pointer">
                  <span className="font-semibold text-pink-300">Early Termination:</span> Exit debate early if consensus threshold is reached before max rounds.
                </label>
              </div>

              {/* Debate Style & Tie-Breaker Strategy */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#21262d]">
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-gray-400">Debate Style</label>
                  <select
                    value={agent.debateConfig?.debateStyle ?? 'structured_rebuttal'}
                    onChange={(e) => onUpdateAgent({
                      debateConfig: {
                        maxRounds: agent.debateConfig?.maxRounds ?? 2,
                        consensusThreshold: agent.debateConfig?.consensusThreshold ?? 0.85,
                        earlyStoppingEnabled: agent.debateConfig?.earlyStoppingEnabled ?? true,
                        debateStyle: e.target.value as DebateStyle,
                        tieBreakerStrategy: agent.debateConfig?.tieBreakerStrategy ?? 'conditional_approval',
                        requireEvidenceCitations: agent.debateConfig?.requireEvidenceCitations ?? true,
                        minWordLimitPerBrief: agent.debateConfig?.minWordLimitPerBrief ?? 250,
                      }
                    })}
                    className="w-full px-2 py-1 bg-[#161b22] border border-[#30363d] focus:border-pink-500 rounded text-xs text-white cursor-pointer"
                  >
                    <option value="structured_rebuttal">Structured Rebuttal</option>
                    <option value="socratic">Socratic Dialectic</option>
                    <option value="free_form">Free-Form Exchange</option>
                    <option value="panel_scoring">Panel Scoring</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-gray-400">Stalemate Policy</label>
                  <select
                    value={agent.debateConfig?.tieBreakerStrategy ?? 'conditional_approval'}
                    onChange={(e) => onUpdateAgent({
                      debateConfig: {
                        maxRounds: agent.debateConfig?.maxRounds ?? 2,
                        consensusThreshold: agent.debateConfig?.consensusThreshold ?? 0.85,
                        earlyStoppingEnabled: agent.debateConfig?.earlyStoppingEnabled ?? true,
                        debateStyle: agent.debateConfig?.debateStyle ?? 'structured_rebuttal',
                        tieBreakerStrategy: e.target.value as TieBreakerStrategy,
                        requireEvidenceCitations: agent.debateConfig?.requireEvidenceCitations ?? true,
                        minWordLimitPerBrief: agent.debateConfig?.minWordLimitPerBrief ?? 250,
                      }
                    })}
                    className="w-full px-2 py-1 bg-[#161b22] border border-[#30363d] focus:border-pink-500 rounded text-xs text-white cursor-pointer"
                  >
                    <option value="conditional_approval">Conditional Approval</option>
                    <option value="conservative_veto">Conservative Veto</option>
                    <option value="moderator_vote">Moderator Decides</option>
                  </select>
                </div>
              </div>

              {/* Evidence Citations Enforcement */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="evidenceCitationsCheckbox"
                  checked={agent.debateConfig?.requireEvidenceCitations !== false}
                  onChange={(e) => onUpdateAgent({
                    debateConfig: {
                      maxRounds: agent.debateConfig?.maxRounds ?? 2,
                      consensusThreshold: agent.debateConfig?.consensusThreshold ?? 0.85,
                      earlyStoppingEnabled: agent.debateConfig?.earlyStoppingEnabled ?? true,
                      debateStyle: agent.debateConfig?.debateStyle ?? 'structured_rebuttal',
                      tieBreakerStrategy: agent.debateConfig?.tieBreakerStrategy ?? 'conditional_approval',
                      requireEvidenceCitations: e.target.checked,
                      minWordLimitPerBrief: agent.debateConfig?.minWordLimitPerBrief ?? 250,
                    }
                  })}
                  className="w-3.5 h-3.5 accent-pink-500 rounded cursor-pointer"
                />
                <label htmlFor="evidenceCitationsCheckbox" className="text-[10px] text-gray-300 cursor-pointer">
                  Require empirical evidence citations & source links in each brief
                </label>
              </div>
            </div>
          )}

          {/* Orderable Sub-Agents List */}
          <div className="space-y-1.5">
            {subAgents.map((sub: SubAgentRef, idx: number) => (
                <div
                  key={sub.agentId || idx}
                  draggable
                  onDragStart={(e) => handleDragStart(e, idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDrop={(e) => handleDrop(e, idx)}
                  onDragEnd={() => {
                    setDraggedIdx(null);
                    setDragOverIdx(null);
                  }}
                  className={`flex items-center justify-between p-2 rounded-lg bg-[#0d1117] border transition-all ${
                    dragOverIdx === idx
                      ? 'border-purple-400 bg-purple-950/40'
                      : draggedIdx === idx
                      ? 'opacity-40 border-dashed border-gray-500'
                      : 'border-[#30363d] hover:border-purple-500/40'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="cursor-grab active:cursor-grabbing p-0.5 text-gray-500 hover:text-purple-400">
                      <GripVertical className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-[10px] font-mono text-purple-400 font-bold bg-purple-950/60 px-1.5 py-0.5 rounded border border-purple-500/20">
                      #{idx + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-200 text-xs truncate max-w-[150px]">
                        {sub.name}
                      </div>
                      <div className="text-[10px] text-gray-400 truncate max-w-[150px]">
                        {sub.role || 'Sub-agent worker'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {onSelectAgent && (
                      <button
                        type="button"
                        onClick={() => onSelectAgent(sub.agentId)}
                        title={`Configure ${sub.name}`}
                        className="p-1 text-gray-400 hover:text-blue-400 hover:bg-[#161b22] rounded transition-colors cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => handleMoveSubAgent(idx, idx - 1)}
                      disabled={idx === 0}
                      title="Move Up"
                      className="p-1 text-gray-400 hover:text-white disabled:opacity-20 cursor-pointer disabled:cursor-default"
                    >
                      <ChevronUp className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => handleMoveSubAgent(idx, idx + 1)}
                      disabled={idx === subAgents.length - 1}
                      title="Move Down"
                      className="p-1 text-gray-400 hover:text-white disabled:opacity-20 cursor-pointer disabled:cursor-default"
                    >
                      <ChevronDown className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => handleRemoveSubAgent(sub.agentId)}
                      title="Remove Sub-Agent Link"
                      className="p-1 text-gray-400 hover:text-rose-400 transition-colors cursor-pointer ml-1"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
