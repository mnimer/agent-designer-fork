/**
 * Custom Function Tool Drawer
 *
 * Dedicated inspector property panel for user-defined Python / TypeScript tools:
 * 1. Function identifier & python-safe name.
 * 2. Docstring / tool-calling description (`codePrompt`) used by Gemini for tool selection.
 * 3. Interactive parameter schema manager (add, inspect, remove arguments).
 * 4. Code compilation preview.
 *
 * Author: Mike Nimer <mikenimer@google.com>
 */

import React, { useState, useEffect } from 'react';
import { Code, Sliders, Trash2, Plus, Sparkles, FileCode } from 'lucide-react';
import { ToolDefinition, AgentData } from '../../../../types';
import { ToolDrawerShell } from './ToolDrawerShell';

export interface CustomFunctionToolDrawerProps {
  tool: ToolDefinition | null;
  isOpen: boolean;
  onClose: () => void;
  onSaveTool: (updatedTool: ToolDefinition) => void;
  onDeleteTool?: (toolId: string) => void;
  selectedAgent?: AgentData | null;
  onAttachToAgent?: (agentId: string, tool: ToolDefinition) => void;
  scope?: 'global' | 'agent';
  agentName?: string;
}

export const CustomFunctionToolDrawer: React.FC<CustomFunctionToolDrawerProps> = ({
  tool,
  isOpen,
  onClose,
  onSaveTool,
  onDeleteTool,
  selectedAgent,
  onAttachToAgent,
  scope = 'global',
  agentName,
}) => {
  const [formData, setFormData] = useState<ToolDefinition | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // New parameter state
  const [newParamKey, setNewParamKey] = useState('');
  const [newParamVal, setNewParamVal] = useState('');

  useEffect(() => {
    if (tool) {
      setFormData({ ...tool });
    }
  }, [tool]);

  if (!isOpen || !formData) return null;

  const handleUpdate = (patch: Partial<ToolDefinition>) => {
    setFormData((prev) => (prev ? { ...prev, ...patch } : null));
  };

  const handleAddParam = () => {
    if (!newParamKey.trim()) return;
    const currentParams = formData.parameters || {};
    handleUpdate({
      parameters: {
        ...currentParams,
        [newParamKey.trim()]: newParamVal.trim() || 'string',
      },
    });
    setNewParamKey('');
    setNewParamVal('');
  };

  const handleRemoveParam = (paramName: string) => {
    const currentParams = { ...(formData.parameters || {}) };
    delete currentParams[paramName];
    handleUpdate({ parameters: currentParams });
  };

  const handleSave = () => {
    if (!formData) return;
    onSaveTool(formData);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const isAlreadyAttached =
    selectedAgent &&
    (selectedAgent.tools || []).some(
      (t) => t.id === formData.id || t.name.toLowerCase() === formData.name.toLowerCase()
    );

  const functionIdentifier = (formData.name || 'custom_tool')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/^([0-9])/, '_$1');

  return (
    <ToolDrawerShell
      isOpen={isOpen}
      onClose={onClose}
      toolName={formData.name}
      onChangeName={(name) => handleUpdate({ name })}
      namePlaceholder="Custom Function Tool"
      description={formData.description}
      onChangeDescription={(description) => handleUpdate({ description })}
      typeBadge={{
        label: 'CUSTOM FUNCTION',
        subLabel: 'Python / TypeScript',
        color: 'text-indigo-400',
        bg: 'bg-indigo-500/10',
        border: 'border-indigo-500/30',
      }}
      toolIcon={<Code className="w-5 h-5 text-indigo-400" />}
      scope={scope}
      agentName={agentName}
      selectedAgent={selectedAgent}
      isAlreadyAttached={Boolean(isAlreadyAttached)}
      onAttachToAgent={
        selectedAgent && onAttachToAgent ? () => onAttachToAgent(selectedAgent.id, formData) : undefined
      }
      onSave={handleSave}
      onDelete={
        onDeleteTool && (formData.id.startsWith('tool_custom_') || formData.id === 'tool_custom_function')
          ? () => onDeleteTool(formData.id)
          : undefined
      }
      savedSuccess={savedSuccess}
    >
      {/* 1. Python Signature Identifier */}
      <div className="space-y-3 bg-[#0d1117] p-4 rounded-lg border border-indigo-500/40 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-indigo-300 font-bold text-xs">
            <FileCode className="w-4 h-4 text-indigo-400" />
            <span>Function Signature</span>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-mono font-bold">
            def {functionIdentifier}()
          </span>
        </div>

        <div className="p-2.5 rounded bg-[#161b22] border border-[#30363d] font-mono text-[11px] text-gray-300 overflow-x-auto">
          <span className="text-purple-400">def </span>
          <span className="text-indigo-300 font-bold">{functionIdentifier}</span>(
          {Object.entries(formData.parameters || {}).map(([key, val], idx, arr) => (
            <span key={key}>
              <span className="text-emerald-300">{key}</span>: <span className="text-amber-300">str</span>
              {idx < arr.length - 1 ? ', ' : ''}
            </span>
          ))}
          ) -&gt; <span className="text-amber-300">dict</span>:
        </div>
      </div>

      {/* 2. Tool Prompt & Docstring Instructions */}
      <div className="space-y-2 p-4 bg-[#0d1117] rounded-lg border border-[#30363d]">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-bold uppercase tracking-tight text-gray-400 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            Tool Docstring &amp; Execution Prompt
          </label>
        </div>
        <textarea
          rows={3}
          value={formData.codePrompt || ''}
          onChange={(e) => handleUpdate({ codePrompt: e.target.value })}
          placeholder="Detailed instructions explaining to the LLM when to invoke this tool and what parameters to pass..."
          className="w-full min-h-[90px] max-h-[220px] px-3 py-2 bg-[#161b22] border border-[#30363d] focus:border-indigo-500 rounded-lg text-xs text-gray-200 focus:outline-none resize-y font-mono leading-relaxed"
        />
        <div className="text-[10px] text-gray-400 flex items-center justify-between">
          <span>Injected into the tool declaration docstring during code generation</span>
          <span className="text-[9px] font-mono text-gray-400">↕ Drag to resize</span>
        </div>
      </div>

      {/* 3. Parameter Schema Manager */}
      <div className="space-y-3 p-4 bg-[#0d1117] rounded-lg border border-[#30363d]">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-bold uppercase tracking-tight text-gray-400 flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-indigo-400" />
            Function Parameters ({Object.keys(formData.parameters || {}).length})
          </label>
        </div>

        <div className="space-y-1.5 max-h-40 overflow-y-auto">
          {Object.entries(formData.parameters || {}).length === 0 ? (
            <div className="text-[11px] text-gray-500 italic p-2 text-center bg-[#161b22] rounded border border-dashed border-[#30363d]">
              No parameters defined yet. Add arguments below.
            </div>
          ) : (
            Object.entries(formData.parameters || {}).map(([paramName, paramDesc]) => (
              <div
                key={paramName}
                className="flex items-center justify-between bg-[#161b22] px-2.5 py-1.5 rounded border border-[#30363d] text-[11px] font-mono"
              >
                <div className="min-w-0">
                  <span className="text-emerald-300 font-bold">{paramName}</span>
                  <span className="text-gray-400 text-[10px] ml-2 truncate">({paramDesc})</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveParam(paramName)}
                  className="text-gray-400 hover:text-rose-400 cursor-pointer p-0.5"
                  title="Remove parameter"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Add Parameter Input Row */}
        <div className="flex gap-1.5 pt-1">
          <input
            type="text"
            value={newParamKey}
            onChange={(e) => setNewParamKey(e.target.value)}
            placeholder="Argument name (e.g. query)"
            className="flex-1 px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-indigo-500 rounded text-[10px] font-mono text-gray-200 focus:outline-none"
          />
          <input
            type="text"
            value={newParamVal}
            onChange={(e) => setNewParamVal(e.target.value)}
            placeholder="Type / Description"
            className="flex-1 px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-indigo-500 rounded text-[10px] font-mono text-gray-200 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleAddParam}
            className="px-3 py-1.5 bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] rounded text-[10px] text-indigo-300 font-medium cursor-pointer flex items-center gap-1"
          >
            <Plus className="w-3 h-3" />
            <span>Add</span>
          </button>
        </div>
      </div>
    </ToolDrawerShell>
  );
};
