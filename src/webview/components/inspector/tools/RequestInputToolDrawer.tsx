/**
 * Human-in-the-Loop Clarification Tool Drawer Component
 *
 * Dedicated property drawer for HITL request_input tool:
 * 1. Operator Prompt / Message.
 * 2. Timeout in seconds (min 10s, max 3600s).
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import React, { useState, useEffect } from 'react';
import { HelpCircle } from 'lucide-react';
import { ToolDefinition, AgentData, RequestInputConfig } from '../../../types';
import { ToolDrawerShell } from './ToolDrawerShell';

export interface RequestInputToolDrawerProps {
  tool: ToolDefinition | null;
  isOpen: boolean;
  onClose: () => void;
  onSaveTool?: (updatedTool: ToolDefinition) => void;
  onUpdateTool?: (updatedTool: ToolDefinition) => void;
  onDeleteTool?: (toolId: string) => void;
  selectedAgent?: AgentData | null;
  onAttachToAgent?: (agentId: string, tool: ToolDefinition) => void;
  scope?: 'global' | 'agent';
  agentName?: string;
}

export const RequestInputToolDrawer: React.FC<RequestInputToolDrawerProps> = ({
  tool,
  isOpen,
  onClose,
  onSaveTool,
  onUpdateTool,
  onDeleteTool,
  selectedAgent,
  onAttachToAgent,
  scope = 'global',
  agentName,
}) => {
  const [formData, setFormData] = useState<ToolDefinition | null>(null);

  useEffect(() => {
    if (tool) {
      setFormData({
        ...tool,
        requestInputConfig: {
          prompt: tool.requestInputConfig?.prompt || '',
          timeoutSeconds: tool.requestInputConfig?.timeoutSeconds ?? 300,
        },
      });
    }
  }, [tool]);

  if (!isOpen || !formData) return null;

  const handleUpdate = (updates: Partial<ToolDefinition>) => {
    setFormData((prev) => {
      if (!prev) return null;
      const next = { ...prev, ...updates };
      (onUpdateTool || onSaveTool)?.(next);
      return next;
    });
  };

  const handleUpdateRequestInputConfig = (updates: Partial<RequestInputConfig>) => {
    setFormData((prev) => {
      if (!prev) return null;
      const next: ToolDefinition = {
        ...prev,
        requestInputConfig: {
          ...prev.requestInputConfig,
          ...updates,
        },
      };
      (onUpdateTool || onSaveTool)?.(next);
      return next;
    });
  };

  const isAlreadyAttached = selectedAgent?.tools?.some((t) => t.id === formData.id);

  return (
    <ToolDrawerShell
      isOpen={isOpen}
      onClose={onClose}
      toolName={formData.name}
      onChangeName={(name) => handleUpdate({ name })}
      namePlaceholder="e.g. Human Clarification"
      description={formData.description || ''}
      onChangeDescription={(description) => handleUpdate({ description })}
      typeBadge={{
        label: 'Human-in-the-Loop',
        subLabel: 'Interruption & Clarification',
        color: 'text-rose-400',
        bg: 'bg-rose-500/20',
        border: 'border-rose-500/40',
      }}
      toolIcon={<HelpCircle className="w-4 h-4 text-rose-400" />}
      scope={scope}
      agentName={agentName}
      selectedAgent={selectedAgent}
      isAlreadyAttached={isAlreadyAttached}
      onAttachToAgent={() => {
        if (selectedAgent && onAttachToAgent && formData) {
          onAttachToAgent(selectedAgent.id || '', formData);
        }
      }}
      onDelete={onDeleteTool ? () => onDeleteTool(formData.id) : undefined}
    >
      {/* Human-in-the-Loop Clarification Form */}
      <div className="space-y-4 bg-[#0d1117] p-4 rounded-lg border border-rose-500/40 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-rose-300 font-bold text-xs">
            <HelpCircle className="w-4 h-4 text-rose-400" />
            <span>Human-in-the-Loop Interruption Settings</span>
          </div>
          <span className="text-[9px] px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 font-mono font-bold">
            HITL
          </span>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400">
            Operator Prompt / Message
          </label>
          <input
            type="text"
            value={formData.requestInputConfig?.prompt || ''}
            onChange={(e) => handleUpdateRequestInputConfig({ prompt: e.target.value })}
            placeholder="Please clarify or confirm this action:"
            className="w-full px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-rose-400 rounded text-[11px] font-mono text-rose-200 focus:outline-none"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400">
            Timeout (seconds)
          </label>
          <input
            type="number"
            min={10}
            max={3600}
            value={formData.requestInputConfig?.timeoutSeconds ?? 300}
            onChange={(e) => handleUpdateRequestInputConfig({ timeoutSeconds: parseInt(e.target.value, 10) || 300 })}
            className="w-full px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-rose-400 rounded text-[11px] font-mono text-gray-200 focus:outline-none"
          />
        </div>
      </div>
    </ToolDrawerShell>
  );
};
