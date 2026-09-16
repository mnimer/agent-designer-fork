/**
 * SynthesizerDrawer Component
 *
 * Inspector drawer for Synthesizer Agent nodes (Leaf / Reducer agents), supporting
 * upstream state key aggregation, reduction strategies, and embedded Pydantic v2
 * structured output schema generation.
 *
 * Architectural Decisions:
 * 1. Schema Reducer Role: Synthesizer agents aggregate upstream state keys into a structured JSON payload.
 * 2. Controlled Generation Constraint: Vertex AI Gemini prohibits combining output_schema with external tools.
 *    Therefore, the synthesizer node is tool-free and serves as the terminal reducer.
 * 3. 8pt Grid & Consistent UX: Follows the exact visual structure, drawer sections, and input elements as Standard and Router drawers.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import React, { useState } from 'react';
import { 
  Layers, 
  X, 
  Cpu, 
  AlertCircle, 
  Sliders, 
  Plus, 
  Braces,
  Check,
  Info,
  Tag
} from 'lucide-react';
import { 
  AgentData, 
  SynthesizerConfig, 
  ToolDefinition 
} from '../../types';
import { validateAgentIdentifier, sanitizeAgentIdentifier } from '../../../shared/identifierValidation';
import { ModelSelector } from '../drawers/primitives/ModelSelector';
import { StructuredOutputBuilder } from './StructuredOutputBuilder';

interface SynthesizerDrawerProps {
  agent: AgentData;
  allAgents: AgentData[];
  onClose: () => void;
  onUpdateAgent: (updatedData: Partial<AgentData>) => void;
  onOpenAddTool?: () => void;
  onRemoveTool?: () => void;
  onEditTool?: (tool: ToolDefinition) => void;
  onSelectAgent?: (agentId: string) => void;
}

const REDUCTION_STRATEGIES: { id: 'summarize' | 'merge_json' | 'concatenate'; label: string; desc: string }[] = [
  {
    id: 'summarize',
    label: 'LLM Synthesis & Summary',
    desc: 'Combines and reasons over state variables to generate a coherent, high-density structured output.',
  },
  {
    id: 'merge_json',
    label: 'Deep JSON Merge',
    desc: 'Merges dictionary keys and nested JSON payloads across upstream agents into a single object.',
  },
  {
    id: 'concatenate',
    label: 'Sequential Concatenation',
    desc: 'Appends raw upstream text streams sequentially into output schema fields.',
  },
];

export const SynthesizerDrawer: React.FC<SynthesizerDrawerProps> = ({
  agent,
  allAgents: _allAgents,
  onClose,
  onUpdateAgent,
}) => {
  const synthesizerConfig: SynthesizerConfig = agent.synthesizerConfig || {
    inputStateKeys: ['research_summary', 'extracted_data'],
    reductionStrategy: 'summarize',
    outputSchemaName: agent.structuredOutput?.name || 'SynthesizedOutput',
  };

  const [newKeyInput, setNewKeyInput] = useState('');

  const currentIdentifier = agent.identifier || agent.name || sanitizeAgentIdentifier(agent.label || agent.id, 'synthesizer');
  const identifierValidation = validateAgentIdentifier(currentIdentifier, 'synthesizer');

  /**
   * Updates agent display label and synchronizes the identifier if untouched.
   */
  const handleLabelChange = (newLabel: string) => {
    const oldSanitized = sanitizeAgentIdentifier(agent.label || agent.id, 'synthesizer');
    const updates: Partial<AgentData> = { label: newLabel };
    if (!agent.name || agent.name === oldSanitized || !agent.identifier || agent.identifier === oldSanitized) {
      const newSanitized = sanitizeAgentIdentifier(newLabel, 'synthesizer');
      updates.name = newSanitized;
      updates.identifier = newSanitized;
    }
    onUpdateAgent(updates);
  };

  /**
   * Updates the agent Python identifier name.
   */
  const handleIdentifierChange = (rawName: string) => {
    const noSpaces = rawName.replace(/\s+/g, '_');
    onUpdateAgent({ name: noSpaces, identifier: noSpaces });
  };

  /**
   * Updates synthesizer-specific configuration fields.
   */
  const handleUpdateSynthesizerConfig = (updates: Partial<SynthesizerConfig>) => {
    const newConfig = { ...synthesizerConfig, ...updates };
    onUpdateAgent({ synthesizerConfig: newConfig });
  };

  /**
   * Adds an upstream state key chip.
   */
  const handleAddStateKey = () => {
    const trimmed = newKeyInput.trim().replace(/^state\./, '');
    if (!trimmed) return;
    const currentKeys = synthesizerConfig.inputStateKeys || [];
    if (!currentKeys.includes(trimmed)) {
      handleUpdateSynthesizerConfig({ inputStateKeys: [...currentKeys, trimmed] });
    }
    setNewKeyInput('');
  };

  /**
   * Removes an upstream state key chip.
   */
  const handleRemoveStateKey = (keyToRemove: string) => {
    const currentKeys = synthesizerConfig.inputStateKeys || [];
    handleUpdateSynthesizerConfig({
      inputStateKeys: currentKeys.filter((k) => k !== keyToRemove),
    });
  };

  return (
    <div className="absolute top-0 right-0 bottom-0 z-30 w-96 backdrop-blur-2xl bg-[#161b22]/95 border-l border-[#30363d] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200 text-[#c9d1d9]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 bg-[#161b22] border-b border-[#30363d] shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 rounded-lg bg-[#0d1117] border border-emerald-500/40 text-emerald-400 shrink-0 shadow-xs">
            <Layers className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-bold text-white truncate max-w-[200px]">
              {agent.label}
            </h3>
            <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
              Synthesizer & Schema Reducer Node
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-gray-400 hover:text-white hover:bg-[#30363d] transition-colors cursor-pointer"
          title="Close drawer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body Form */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar">
        {/* Controlled Generation Architecture Notice */}
        <div className="p-3 bg-emerald-950/20 rounded-lg border border-emerald-500/30 flex items-start gap-2.5 text-[11px] leading-relaxed text-emerald-200">
          <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-emerald-300">Terminal Reducer Node: </span>
            Aggregates upstream state variables and synthesizes them into structured Pydantic / JSON schema. Tools are disabled per Vertex AI controlled generation guidelines.
          </div>
        </div>

        {/* SECTION 1: AGENT IDENTITY */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold uppercase tracking-tight text-gray-400">
              Agent Identity
            </label>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold uppercase tracking-tight text-gray-400">
              Synthesizer Node Label
            </label>
            <input
              type="text"
              value={agent.label}
              onChange={(e) => handleLabelChange(e.target.value)}
              placeholder="e.g. Report Synthesizer, Data Aggregator"
              className="w-full px-3 py-1.5 bg-[#0d1117] border border-[#30363d] focus:border-emerald-500 rounded-lg text-xs text-white focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-tight text-gray-400">
                Identifier (Python ID)
              </label>
              <span className="text-[10px] text-gray-400 font-mono">ADK node name</span>
            </div>
            <input
              type="text"
              value={currentIdentifier}
              onChange={(e) => handleIdentifierChange(e.target.value)}
              placeholder="e.g. report_synthesizer"
              className={`w-full px-3 py-1.5 bg-[#0d1117] border rounded-lg text-xs font-mono text-white focus:outline-none ${
                identifierValidation.isValid
                  ? 'border-[#30363d] focus:border-emerald-500'
                  : 'border-red-500 focus:border-red-500 bg-red-950/20'
              }`}
            />
            {!identifierValidation.isValid && (
              <div className="flex items-center gap-1.5 text-[11px] text-red-400 mt-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{identifierValidation.error}</span>
              </div>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold uppercase tracking-tight text-gray-400">
              Role Description
            </label>
            <input
              type="text"
              value={agent.role || ''}
              onChange={(e) => onUpdateAgent({ role: e.target.value })}
              placeholder="e.g. Aggregates multi-agent research into structured report"
              className="w-full px-3 py-1.5 bg-[#0d1117] border border-[#30363d] focus:border-emerald-500 rounded-lg text-xs text-white focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold uppercase tracking-tight text-gray-400">
              Synthesis Instructions (System Prompt)
            </label>
            <textarea
              rows={4}
              value={agent.systemPrompt || ''}
              onChange={(e) => onUpdateAgent({ systemPrompt: e.target.value })}
              placeholder="Provide instructions on how to synthesize, weigh, and format upstream data..."
              className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] focus:border-emerald-500 rounded-lg text-xs text-white focus:outline-none resize-y leading-relaxed font-mono"
            />
          </div>
        </div>

        {/* SECTION 2: MODEL CONFIGURATION */}
        <div className="space-y-3 pt-1 border-t border-[#30363d]">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold uppercase tracking-tight text-emerald-400 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-emerald-400" />
              <span>Model & Reasoning Engine</span>
            </label>
          </div>

          <ModelSelector
            selectedModel={agent.model || 'gemini-3.7-flash'}
            onChangeModel={(model) => onUpdateAgent({ model })}
          />

          <div className="space-y-1 bg-[#0d1117] p-3 rounded-lg border border-[#30363d]">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-400 flex items-center gap-1">
                <Sliders className="w-3 h-3 text-emerald-400" />
                Temperature
              </span>
              <span className="font-mono text-emerald-300 font-bold">{agent.temperature ?? 0.2}</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={agent.temperature ?? 0.2}
              onChange={(e) => onUpdateAgent({ temperature: parseFloat(e.target.value) })}
              className="w-full accent-emerald-500 cursor-pointer h-1 bg-[#21262d] rounded-lg"
            />
            <div className="flex justify-between text-[9px] text-gray-400">
              <span>0.0 (Deterministic)</span>
              <span>1.0 (Creative)</span>
            </div>
          </div>
        </div>

        {/* SECTION 3: UPSTREAM INPUT STATE KEYS */}
        <div className="space-y-3 pt-1 border-t border-[#30363d]">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold uppercase tracking-tight text-emerald-400 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-emerald-400" />
              <span>Upstream State Keys to Aggregate</span>
            </label>
            <span className="text-[10px] text-gray-400 font-mono">
              {synthesizerConfig.inputStateKeys?.length || 0} keys
            </span>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newKeyInput}
                onChange={(e) => setNewKeyInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddStateKey();
                  }
                }}
                placeholder="e.g. research_summary, market_data"
                className="flex-1 px-3 py-1.5 bg-[#0d1117] border border-[#30363d] focus:border-emerald-500 rounded-lg text-xs font-mono text-white focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAddStateKey}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 bg-[#0d1117] rounded-lg border border-[#30363d]">
              {(synthesizerConfig.inputStateKeys || []).length === 0 ? (
                <span className="text-[11px] text-gray-400 italic">
                  No explicit state keys specified. Synthesizer will receive all session state variables.
                </span>
              ) : (
                (synthesizerConfig.inputStateKeys || []).map((keyName) => (
                  <span
                    key={keyName}
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-mono"
                  >
                    <span>state.{keyName}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveStateKey(keyName)}
                      className="text-emerald-400 hover:text-emerald-200 transition-colors cursor-pointer"
                      title="Remove key"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))
              )}
            </div>
          </div>

          {/* Reduction Strategy */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-tight text-gray-400">
              Reduction Strategy
            </label>
            <div className="grid grid-cols-1 gap-1.5">
              {REDUCTION_STRATEGIES.map((strat) => {
                const isSelected = (synthesizerConfig.reductionStrategy || 'summarize') === strat.id;
                return (
                  <div
                    key={strat.id}
                    onClick={() => handleUpdateSynthesizerConfig({ reductionStrategy: strat.id })}
                    className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-emerald-950/30 border-emerald-500 text-white shadow-xs'
                        : 'bg-[#0d1117] border-[#30363d] hover:border-emerald-500/40 text-gray-400'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="font-bold text-xs text-gray-200">{strat.label}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                    </div>
                    <p className="text-[10px] text-gray-400 leading-relaxed">{strat.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* SECTION 4: STRUCTURED OUTPUT SCHEMA BUILDER */}
        <div className="space-y-3 pt-1 border-t border-[#30363d]">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold uppercase tracking-tight text-emerald-400 flex items-center gap-1.5">
              <Braces className="w-3.5 h-3.5 text-emerald-400" />
              <span>Structured Output Schema (Pydantic v2)</span>
            </label>
          </div>

          <StructuredOutputBuilder
            value={agent.structuredOutput || {
              enabled: true,
              formatType: 'json_schema',
              name: 'SynthesizedOutput',
              fields: [
                { id: 'f1', name: 'summary', type: 'string', required: true, description: 'Comprehensive synthesized summary' },
                { id: 'f2', name: 'key_findings', type: 'array_string', required: true, description: 'List of core findings' },
              ]
            }}
            onChange={(structuredOutput) => onUpdateAgent({ structuredOutput })}
          />
        </div>
      </div>
    </div>
  );
};
