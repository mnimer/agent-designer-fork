/**
 * StandardAgentDrawer Component
 *
 * Inspector sidebar drawer for editing Standard Agent properties:
 * - Agent Label & Subtitle Description
 * - Gemini Foundation Model Selection
 * - System Instructions & Prompt Template
 * - Creativity Temperature Slider
 * - Memory & State Checkpointing Provider Selection
 * - Structured Output Schema Builder Integration
 * - Attached Tools Management & Add Tool Modal
 *
 * Architectural Decisions:
 * 1. Implements bidirectional sync with the canvas state via onUpdateNode callback.
 * 2. Adheres to the 8pt grid system with TailwindCSS classes.
 * 3. Class documentation and method comments per .gemini/GEMINI.md.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  Bot,
  Sliders,
  Sparkles,
  Wrench,
  Trash2,
  Plus,
  Save,
  Check,
  Brain,
  FileText,
} from 'lucide-react';
import {
  AgentNodeData,
  MemoryType,
  StructuredOutputSchema,
  ToolDefinition,
} from '../../../shared/types';
import { MEMORY_OPTIONS, getMemoryOption } from '../../data/memoryOptions';
import { StructuredOutputBuilder } from './StructuredOutputBuilder';
import { AddToolModal } from './AddToolModal';

export interface StandardAgentDrawerProps {
  nodeId: string | null;
  agentData: AgentNodeData | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateAgent: (nodeId: string, updatedData: Partial<AgentNodeData>) => void;
  onDeleteAgent?: (nodeId: string) => void;
}

const GEMINI_MODELS = [
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (Complex Reasoning)', badge: 'Reasoning' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Fast & Capable)', badge: 'Speed/Cost' },
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (General Purpose)', badge: 'General' },
  { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro (Long Context)', badge: '1M Context' },
  { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash (Lightweight)', badge: 'Fast' },
];

export const StandardAgentDrawer: React.FC<StandardAgentDrawerProps> = ({
  nodeId,
  agentData,
  isOpen,
  onClose,
  onUpdateAgent,
  onDeleteAgent,
}) => {
  const [formData, setFormData] = useState<AgentNodeData | null>(null);
  const [isAddToolModalOpen, setIsAddToolModalOpen] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Sync formData whenever agentData changes or drawer opens
  useEffect(() => {
    if (agentData) {
      setFormData({
        ...agentData,
        model: agentData.model || agentData.standardConfig?.model || 'gemini-2.5-pro',
        systemPrompt: agentData.systemPrompt || agentData.standardConfig?.systemInstruction || '',
        temperature: agentData.temperature ?? agentData.standardConfig?.temperature ?? 0.7,
        memoryType: agentData.memoryType || agentData.standardConfig?.memory || 'none',
        tools: agentData.tools || agentData.standardConfig?.tools || [],
      });
    }
  }, [agentData]);

  if (!isOpen || !formData || !nodeId) return null;

  /**
   * Handles immediate local state updates for agent configuration fields.
   */
  const handleFieldChange = <K extends keyof AgentNodeData>(key: K, value: AgentNodeData[K]) => {
    setFormData((prev) => (prev ? { ...prev, [key]: value } : null));
  };

  /**
   * Persists agent changes back to workflow state and displays feedback.
   */
  const handleSave = () => {
    if (!formData || !nodeId) return;
    onUpdateAgent(nodeId, formData);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
    }, 1500);
  };

  /**
   * Attaches a selected tool from the catalog to this agent.
   */
  const handleAddTool = (tool: ToolDefinition) => {
    const existing = formData.tools || [];
    if (!existing.some((t) => t.id === tool.id)) {
      const updated = [...existing, tool];
      handleFieldChange('tools', updated);
    }
  };

  /**
   * Removes an attached tool from this agent.
   */
  const handleRemoveTool = (toolId: string) => {
    const existing = formData.tools || [];
    const updated = existing.filter((t) => t.id !== toolId);
    handleFieldChange('tools', updated);
  };

  /**
   * Updates the structured output schema for this agent.
   */
  const handleSchemaChange = (schema: StructuredOutputSchema) => {
    handleFieldChange('structuredOutputSchema', schema);
  };

  const currentMemoryOption = getMemoryOption(formData.memoryType);

  return (
    <>
      <div className="absolute top-0 right-0 bottom-0 z-40 w-96 backdrop-blur-2xl bg-[#161b22]/95 border-l border-[#30363d] shadow-2xl flex flex-col overflow-hidden text-[#c9d1d9] animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#161b22] border-b border-[#30363d] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-1.5 rounded-lg bg-[#0d1117] border border-[#30363d] shrink-0">
              <Bot className="w-4 h-4 text-blue-400" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xs font-bold text-white truncate">
                {formData.label || 'Standard Agent'}
              </h3>
              <span className="text-[10px] text-blue-400 font-mono">
                {formData.model || 'gemini-2.5-pro'}
              </span>
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

        {/* Scrollable Content Body */}
        <div className="flex-1 p-4 space-y-4 overflow-y-auto text-xs text-gray-300">
          {/* 1. Basic Agent Metadata */}
          <div className="space-y-3 bg-[#0d1117] p-3 rounded-lg border border-[#30363d]">
            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-tight text-gray-400">
                Agent Name
              </label>
              <input
                type="text"
                value={formData.label || ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFieldChange('label', e.target.value)}
                placeholder="e.g., Code Reviewer Agent"
                className="w-full px-3 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-blue-500 rounded-lg text-xs text-white focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-tight text-gray-400">
                Description & Purpose
              </label>
              <input
                type="text"
                value={formData.description || ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFieldChange('description', e.target.value)}
                placeholder="Brief summary of agent responsibilities"
                className="w-full px-3 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-blue-500 rounded-lg text-xs text-gray-300 focus:outline-none"
              />
            </div>
          </div>

          {/* 2. Model Selection */}
          <div className="space-y-2 bg-[#0d1117] p-3 rounded-lg border border-[#30363d]">
            <div className="flex items-center gap-1.5 text-blue-400 font-bold text-xs">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Foundation Model</span>
            </div>

            <select
              value={formData.model || 'gemini-2.5-pro'}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => handleFieldChange('model', e.target.value)}
              className="w-full px-3 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-blue-500 rounded-lg text-xs text-white focus:outline-none cursor-pointer"
            >
              {GEMINI_MODELS.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </select>
          </div>

          {/* 3. System Instructions */}
          <div className="space-y-2 bg-[#0d1117] p-3 rounded-lg border border-[#30363d]">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-tight text-gray-400 flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-blue-400" />
                <span>System Instructions</span>
              </label>
              <span className="text-[10px] text-gray-500 font-mono">
                {(formData.systemPrompt || '').length} chars
              </span>
            </div>
            <textarea
              rows={5}
              value={formData.systemPrompt || ''}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleFieldChange('systemPrompt', e.target.value)}
              placeholder="You are an expert software engineer specialized in code quality..."
              className="w-full px-3 py-2 bg-[#161b22] border border-[#30363d] focus:border-blue-500 rounded-lg text-xs font-mono text-gray-200 focus:outline-none leading-relaxed resize-y"
            />
          </div>

          {/* 4. Creativity Temperature */}
          <div className="space-y-2 bg-[#0d1117] p-3 rounded-lg border border-[#30363d]">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-tight text-gray-400 flex items-center gap-1">
                <Sliders className="w-3.5 h-3.5 text-amber-400" />
                <span>Creativity & Temperature</span>
              </label>
              <span className="text-xs font-mono font-bold text-amber-400">
                {(formData.temperature ?? 0.7).toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min="0.0"
              max="1.0"
              step="0.05"
              value={formData.temperature ?? 0.7}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFieldChange('temperature', parseFloat(e.target.value))}
              className="w-full accent-amber-500 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-gray-500">
              <span>0.0 (Deterministic)</span>
              <span>1.0 (Creative)</span>
            </div>
          </div>

          {/* 5. Memory & Checkpointing Provider */}
          <div className="space-y-2.5 bg-[#0d1117] p-3 rounded-lg border border-[#30363d]">
            <div className="flex items-center gap-1.5 text-indigo-400 font-bold text-xs">
              <Brain className="w-3.5 h-3.5" />
              <span>Memory & Checkpointing</span>
            </div>

            <select
              value={formData.memoryType || 'none'}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => handleFieldChange('memoryType', e.target.value as MemoryType)}
              className="w-full px-3 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-indigo-500 rounded-lg text-xs text-white focus:outline-none cursor-pointer"
            >
              {MEMORY_OPTIONS.map((mem) => (
                <option key={mem.type} value={mem.type}>
                  {mem.name} ({mem.badge})
                </option>
              ))}
            </select>

            <div className="p-2.5 rounded-lg bg-[#161b22] border border-[#30363d] text-[11px] space-y-1">
              <p className="text-gray-300 leading-relaxed">
                {currentMemoryOption.description}
              </p>
              <p className="text-indigo-300/80 text-[10px]">
                <strong className="text-indigo-200">Best for:</strong> {currentMemoryOption.bestFor}
              </p>
            </div>
          </div>

          {/* 6. Attached Tools */}
          <div className="space-y-2.5 bg-[#0d1117] p-3 rounded-lg border border-[#30363d]">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-tight text-gray-400 flex items-center gap-1">
                <Wrench className="w-3.5 h-3.5 text-emerald-400" />
                <span>Attached Tools ({formData.tools?.length || 0})</span>
              </label>
              <button
                type="button"
                onClick={() => setIsAddToolModalOpen(true)}
                className="flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 font-bold px-2 py-0.5 rounded bg-emerald-950/40 border border-emerald-500/30 hover:bg-emerald-900/40 transition-colors cursor-pointer"
              >
                <Plus className="w-3 h-3" /> Add Tool
              </button>
            </div>

            {formData.tools && formData.tools.length > 0 ? (
              <div className="space-y-1.5">
                {formData.tools.map((tool: ToolDefinition) => (
                  <div
                    key={tool.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-[#161b22] border border-[#30363d]"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-[#0d1117] text-gray-400 border border-[#30363d]">
                        {tool.type}
                      </span>
                      <span className="text-xs text-white font-medium truncate">{tool.name}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveTool(tool.id)}
                      className="p-1 rounded text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                      title="Remove tool"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-gray-500 italic py-1">
                No tools attached yet. Equip your agent with Google Search, code sandboxes, or database query tools.
              </p>
            )}
          </div>

          {/* 7. Structured Output Builder */}
          <StructuredOutputBuilder
            schema={formData.structuredOutputSchema}
            agentLabel={formData.label || 'Agent'}
            onChange={handleSchemaChange}
          />
        </div>

        {/* Footer Actions */}
        <div className="px-4 py-3 bg-[#161b22] border-t border-[#30363d] shrink-0 flex items-center justify-between">
          {onDeleteAgent ? (
            <button
              type="button"
              onClick={() => {
                if (confirm(`Are you sure you want to delete agent "${formData.label}"?`)) {
                  onDeleteAgent(nodeId);
                  onClose();
                }
              }}
              className="p-2 text-gray-400 hover:text-rose-400 rounded-lg hover:bg-rose-950/40 transition-colors cursor-pointer"
              title="Delete Agent"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs rounded-lg bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-gray-300 hover:text-white cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-1.5 text-xs font-bold rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
            >
              {savedSuccess ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
              <span>{savedSuccess ? 'Saved!' : 'Save Agent'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Add Tool Modal */}
      <AddToolModal
        isOpen={isAddToolModalOpen}
        onClose={() => setIsAddToolModalOpen(false)}
        onSelectTool={handleAddTool}
        existingToolIds={(formData.tools || []).map((t: ToolDefinition) => t.id)}
      />
    </>
  );
};
