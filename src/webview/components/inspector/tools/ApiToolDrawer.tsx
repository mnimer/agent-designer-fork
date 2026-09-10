/**
 * REST API Tool Drawer
 *
 * Dedicated inspector property panel for REST API client tools:
 * 1. Target endpoint URL configuration.
 * 2. API Key / Secret Environment Variable name.
 * 3. HTTP method selection.
 * 4. Interactive request parameter schema manager.
 *
 * Author: Mike Nimer <mikenimer@google.com>
 */

import React, { useState, useEffect } from 'react';
import { Radio, Link, Key, Sliders, Trash2, Plus } from 'lucide-react';
import { ToolDefinition, AgentData } from '../../../../types';
import { ToolDrawerShell } from './ToolDrawerShell';

export interface ApiToolDrawerProps {
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

export const ApiToolDrawer: React.FC<ApiToolDrawerProps> = ({
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

  return (
    <ToolDrawerShell
      isOpen={isOpen}
      onClose={onClose}
      toolName={formData.name}
      onChangeName={(name) => handleUpdate({ name })}
      namePlaceholder="REST API Tool"
      description={formData.description}
      onChangeDescription={(description) => handleUpdate({ description })}
      typeBadge={{
        label: 'REST API ENDPOINT',
        subLabel: 'HTTP Integration',
        color: 'text-rose-400',
        bg: 'bg-rose-500/10',
        border: 'border-rose-500/30',
      }}
      toolIcon={<Radio className="w-5 h-5 text-rose-400" />}
      scope={scope}
      agentName={agentName}
      selectedAgent={selectedAgent}
      isAlreadyAttached={Boolean(isAlreadyAttached)}
      onAttachToAgent={
        selectedAgent && onAttachToAgent ? () => onAttachToAgent(selectedAgent.id, formData) : undefined
      }
      onSave={handleSave}
      onDelete={
        onDeleteTool && (scope === 'agent' || formData.id.startsWith('tool_custom_') || formData.id.startsWith('tool_api_'))
          ? () => onDeleteTool(formData.id)
          : undefined
      }
      savedSuccess={savedSuccess}
    >
      {/* 1. Endpoint & Secret Configuration */}
      <div className="space-y-3 bg-[#0d1117] p-4 rounded-lg border border-rose-500/40 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-rose-300 font-bold text-xs">
            <Link className="w-4 h-4 text-rose-400" />
            <span>Endpoint &amp; Authentication</span>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 font-mono font-bold">
            HTTPS
          </span>
        </div>

        {/* Target URL */}
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400">
            Target Endpoint URL
          </label>
          <input
            type="text"
            value={formData.endpointUrl || ''}
            onChange={(e) => handleUpdate({ endpointUrl: e.target.value })}
            placeholder="https://api.example.com/v1/resource"
            className="w-full px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-rose-400 rounded text-[11px] font-mono text-rose-200 focus:outline-none"
          />
        </div>

        {/* Environment Variable */}
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400 flex items-center gap-1">
            <Key className="w-3 h-3 text-amber-400" />
            API Key / Secret Environment Variable
          </label>
          <input
            type="text"
            value={formData.authKeyEnv || ''}
            onChange={(e) => handleUpdate({ authKeyEnv: e.target.value })}
            placeholder="API_SECRET_TOKEN"
            className="w-full px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-rose-400 rounded text-[11px] font-mono text-amber-300 focus:outline-none"
          />
          <div className="text-[9px] text-gray-400 font-mono">
            Environment variable resolved at runtime on the target host.
          </div>
        </div>
      </div>

      {/* 2. Parameters Schema Manager */}
      <div className="space-y-3 p-4 bg-[#0d1117] rounded-lg border border-[#30363d]">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-bold uppercase tracking-tight text-gray-400 flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-rose-400" />
            Query / Body Parameters ({Object.keys(formData.parameters || {}).length})
          </label>
        </div>

        <div className="space-y-1.5 max-h-40 overflow-y-auto">
          {Object.entries(formData.parameters || {}).length === 0 ? (
            <div className="text-[11px] text-gray-500 italic p-2 text-center bg-[#161b22] rounded border border-dashed border-[#30363d]">
              No parameters defined yet. Add query parameters below.
            </div>
          ) : (
            Object.entries(formData.parameters || {}).map(([paramName, paramDesc]) => (
              <div
                key={paramName}
                className="flex items-center justify-between bg-[#161b22] px-2.5 py-1.5 rounded border border-[#30363d] text-[11px] font-mono"
              >
                <div className="min-w-0">
                  <span className="text-rose-300 font-bold">{paramName}</span>
                  <span className="text-gray-400 text-[10px] ml-2 truncate">({paramDesc})</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveParam(paramName)}
                  className="text-gray-400 hover:text-rose-400 cursor-pointer p-0.5"
                  title="Remove parameter"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Add Parameter Row */}
        <div className="flex gap-1.5 pt-1">
          <input
            type="text"
            value={newParamKey}
            onChange={(e) => setNewParamKey(e.target.value)}
            placeholder="Param name (e.g. id)"
            className="flex-1 px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-rose-400 rounded text-[10px] font-mono text-gray-200 focus:outline-none"
          />
          <input
            type="text"
            value={newParamVal}
            onChange={(e) => setNewParamVal(e.target.value)}
            placeholder="Type / Description"
            className="flex-1 px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-rose-400 rounded text-[10px] font-mono text-gray-200 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleAddParam}
            className="px-3 py-1.5 bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] rounded text-[10px] text-rose-300 font-medium cursor-pointer flex items-center gap-1"
          >
            <Plus className="w-3 h-3" />
            <span>Add</span>
          </button>
        </div>
      </div>
    </ToolDrawerShell>
  );
};
