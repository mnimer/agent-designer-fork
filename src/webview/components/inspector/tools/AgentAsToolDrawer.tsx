/**
 * Sub-Agent as a Tool Drawer Component
 *
 * Dedicated property drawer for Sub-Agent as a Tool wrapper (builtin_agent_as_tool):
 * 1. Target Sub-Agent Name identifier.
 * 2. Delegated Sub-Agent Description (used by parent agent router/orchestrator).
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import React, { useState, useEffect } from 'react';
import { Bot } from 'lucide-react';
import { ToolDefinition, AgentData, AgentAsToolConfig } from '../../../types';
import { ToolDrawerShell } from './ToolDrawerShell';

export interface AgentAsToolDrawerProps {
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

export const AgentAsToolDrawer: React.FC<AgentAsToolDrawerProps> = ({
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

  useEffect(() => {
    if (tool) {
      setFormData({
        ...tool,
        agentAsToolConfig: {
          subAgentName: tool.agentAsToolConfig?.subAgentName || '',
          subAgentDescription: tool.agentAsToolConfig?.subAgentDescription || '',
          subAgentId: tool.agentAsToolConfig?.subAgentId || '',
        },
      });
    }
  }, [tool]);

  if (!isOpen || !formData) return null;

  const handleUpdate = (updates: Partial<ToolDefinition>) => {
    setFormData((prev) => (prev ? { ...prev, ...updates } : null));
  };

  const handleUpdateAgentAsToolConfig = (updates: Partial<AgentAsToolConfig>) => {
    setFormData((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        agentAsToolConfig: {
          ...prev.agentAsToolConfig,
          ...updates,
        },
      };
    });
  };

  const handleSave = () => {
    if (!formData) return;
    onSaveTool(formData);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 800);
  };

  const isAlreadyAttached = selectedAgent?.tools?.some((t) => t.id === formData.id);

  return (
    <ToolDrawerShell
      isOpen={isOpen}
      onClose={onClose}
      toolName={formData.name}
      onChangeName={(name) => handleUpdate({ name })}
      namePlaceholder="e.g. Financial Analyst Sub-Agent Tool"
      description={formData.description || ''}
      onChangeDescription={(description) => handleUpdate({ description })}
      typeBadge={{
        label: 'Sub-Agent Tool',
        subLabel: 'AgentTool Wrapper',
        color: 'text-indigo-400',
        bg: 'bg-indigo-500/20',
        border: 'border-indigo-500/40',
      }}
      toolIcon={<Bot className="w-4 h-4 text-indigo-400" />}
      scope={scope}
      agentName={agentName}
      selectedAgent={selectedAgent}
      isAlreadyAttached={isAlreadyAttached}
      onAttachToAgent={() => {
        if (selectedAgent && onAttachToAgent && formData) {
          onAttachToAgent(selectedAgent.id || '', formData);
        }
      }}
      onSave={handleSave}
      onDelete={onDeleteTool ? () => onDeleteTool(formData.id) : undefined}
      savedSuccess={savedSuccess}
    >
      {/* Sub-Agent as a Tool Form */}
      <div className="space-y-4 bg-[#0d1117] p-4 rounded-lg border border-indigo-500/40 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-indigo-300 font-bold text-xs">
            <Bot className="w-4 h-4 text-indigo-400" />
            <span>Sub-Agent Tool Wrapper Settings</span>
          </div>
          <span className="text-[9px] px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-mono font-bold">
            AgentTool
          </span>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400">
            Target Sub-Agent Name
          </label>
          <input
            type="text"
            value={formData.agentAsToolConfig?.subAgentName || ''}
            onChange={(e) => handleUpdateAgentAsToolConfig({ subAgentName: e.target.value })}
            placeholder="e.g. researcher_agent or compliance_auditor"
            className="w-full px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-indigo-400 rounded text-[11px] font-mono text-indigo-200 focus:outline-none"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400">
            Delegated Sub-Agent Description
          </label>
          <input
            type="text"
            value={formData.agentAsToolConfig?.subAgentDescription || ''}
            onChange={(e) => handleUpdateAgentAsToolConfig({ subAgentDescription: e.target.value })}
            placeholder="Specialized sub-agent that verifies financial figures"
            className="w-full px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-indigo-400 rounded text-[11px] text-gray-200 focus:outline-none"
          />
        </div>
      </div>
    </ToolDrawerShell>
  );
};
