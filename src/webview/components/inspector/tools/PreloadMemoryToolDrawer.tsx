/**
 * Preload Memory Tool Drawer
 *
 * Dedicated inspector property panel for configuring the Google ADK Preload Memory tool:
 * 1. Conversational session memory limits and turn thresholds.
 * 2. Multi-turn coherence parameter schema (session_id, limit).
 * 3. Scope and storage description.
 *
 * Author: Mike Nimer <mikenimer@google.com>
 */

import React, { useState, useEffect } from 'react';
import { History, Sliders, Database, Clock } from 'lucide-react';
import { ToolDefinition, AgentData } from '../../../../types';
import { ToolDrawerShell } from './ToolDrawerShell';

export interface PreloadMemoryToolDrawerProps {
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

export const PreloadMemoryToolDrawer: React.FC<PreloadMemoryToolDrawerProps> = ({
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
  const [historyLimit, setHistoryLimit] = useState(10);

  useEffect(() => {
    if (tool) {
      setFormData({ ...tool });
      const limitParam = tool.parameters?.limit;
      if (typeof limitParam === 'string') {
        const match = limitParam.match(/default\s*(\d+)/i);
        if (match && match[1]) {
          setHistoryLimit(parseInt(match[1], 10));
        }
      }
    }
  }, [tool]);

  if (!isOpen || !formData) return null;

  const handleUpdate = (patch: Partial<ToolDefinition>) => {
    setFormData((prev) => (prev ? { ...prev, ...patch } : null));
  };

  const handleSave = () => {
    if (!formData) return;
    const updated: ToolDefinition = {
      ...formData,
      parameters: {
        session_id: 'string - Unique conversation session identifier',
        limit: `number - Maximum history turns to retrieve (default ${historyLimit})`,
      },
    };
    onSaveTool(updated);
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
      namePlaceholder="Preload Memory Tool"
      description={formData.description}
      onChangeDescription={(description) => handleUpdate({ description })}
      typeBadge={{
        label: 'CONVERSATIONAL MEMORY',
        subLabel: 'Google ADK Built-in',
        color: 'text-purple-400',
        bg: 'bg-purple-500/10',
        border: 'border-purple-500/30',
      }}
      toolIcon={<History className="w-5 h-5 text-purple-400" />}
      scope={scope}
      agentName={agentName}
      selectedAgent={selectedAgent}
      isAlreadyAttached={Boolean(isAlreadyAttached)}
      onAttachToAgent={
        selectedAgent && onAttachToAgent ? () => onAttachToAgent(selectedAgent.id, formData) : undefined
      }
      onSave={handleSave}
      onDelete={
        onDeleteTool && (scope === 'agent' || formData.id.startsWith('tool_custom_'))
          ? () => onDeleteTool(formData.id)
          : undefined
      }
      savedSuccess={savedSuccess}
    >
      {/* 1. Memory Configuration */}
      <div className="space-y-3 bg-[#0d1117] p-4 rounded-lg border border-purple-500/40 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-purple-300 font-bold text-xs">
            <Database className="w-4 h-4 text-purple-400" />
            <span>Memory Retrieval Parameters</span>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-mono font-bold">
            PreloadMemory
          </span>
        </div>

        {/* Max History Turns Slider */}
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-purple-400" />
              Max History Turns Retrieved
            </span>
            <span className="text-[10px] font-mono text-purple-300">{historyLimit} turns</span>
          </label>
          <input
            type="range"
            min={1}
            max={50}
            step={1}
            value={historyLimit}
            onChange={(e) => setHistoryLimit(parseInt(e.target.value, 10))}
            className="w-full accent-purple-500 cursor-pointer"
          />
          <div className="flex justify-between text-[9px] text-gray-400 font-mono">
            <span>1 turn</span>
            <span>50 turns</span>
          </div>
        </div>

        <div className="p-3 bg-purple-950/20 border border-purple-500/30 rounded-lg space-y-1">
          <p className="text-[10px] text-gray-300 leading-relaxed">
            Loads historical session facts, prior agent conclusions, and user preferences into the active conversational context before model reasoning begins.
          </p>
        </div>
      </div>

      {/* 2. Tool Arguments Schema */}
      <div className="space-y-2 p-4 bg-[#0d1117] rounded-lg border border-[#30363d]">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-bold uppercase tracking-tight text-gray-400 flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-purple-400" />
            Tool Arguments Schema
          </label>
          <span className="text-[10px] text-gray-400 font-mono">Built-in</span>
        </div>

        <div className="space-y-2">
          <div className="p-2.5 rounded bg-[#161b22] border border-[#30363d] space-y-1">
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="text-purple-300 font-bold">session_id</span>
              <span className="text-gray-400 text-[10px]">string (required)</span>
            </div>
            <p className="text-[10px] text-gray-400">Unique conversation session identifier.</p>
          </div>

          <div className="p-2.5 rounded bg-[#161b22] border border-[#30363d] space-y-1">
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="text-purple-300 font-bold">limit</span>
              <span className="text-gray-400 text-[10px]">number (optional)</span>
            </div>
            <p className="text-[10px] text-gray-400">Maximum history turns to retrieve (default {historyLimit}).</p>
          </div>
        </div>
      </div>
    </ToolDrawerShell>
  );
};
