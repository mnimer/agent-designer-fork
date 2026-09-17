/**
 * Python Code Sandbox Tool Drawer
 *
 * Dedicated inspector property panel for configuring sandboxed Python code execution:
 * 1. Execution timeout in seconds.
 * 2. Sandboxing runtime environment guarantees (isolated container, read-only FS).
 * 3. Pre-installed scientific packages information (pandas, numpy, matplotlib, etc.).
 * 4. Input parameter specifications (code, timeout).
 *
 * Author: Mike Nimer <mikenimer@google.com>
 */

import React, { useState, useEffect } from 'react';
import { Terminal, Shield, Cpu, Sliders, Check, Clock } from 'lucide-react';
import { ToolDefinition, AgentData } from '../../../../types';
import { ToolDrawerShell } from './ToolDrawerShell';

export interface CodeExecutionToolDrawerProps {
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

export const CodeExecutionToolDrawer: React.FC<CodeExecutionToolDrawerProps> = ({
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
  const [timeoutSeconds, setTimeoutSeconds] = useState(30);

  useEffect(() => {
    if (tool) {
      setFormData({ ...tool });
      const timeoutParam = tool.parameters?.timeout;
      if (typeof timeoutParam === 'string') {
        const match = timeoutParam.match(/default\s*(\d+)/i);
        if (match && match[1]) {
          setTimeoutSeconds(parseInt(match[1], 10));
        }
      }
    }
  }, [tool]);

  if (!isOpen || !formData) return null;

  const handleUpdate = (patch: Partial<ToolDefinition>) => {
    setFormData((prev) => {
      if (!prev) return null;
      const next: ToolDefinition = {
        ...prev,
        ...patch,
        parameters: {
          code: 'string - Python code block to execute in sandbox',
          timeout: `number - Execution timeout in seconds (default ${timeoutSeconds})`,
        },
      };
      (onUpdateTool || onSaveTool)?.(next);
      return next;
    });
  };

  const handleTimeoutChange = (newTimeout: number) => {
    setTimeoutSeconds(newTimeout);
    setFormData((prev) => {
      if (!prev) return null;
      const next: ToolDefinition = {
        ...prev,
        parameters: {
          code: 'string - Python code block to execute in sandbox',
          timeout: `number - Execution timeout in seconds (default ${newTimeout})`,
        },
      };
      (onUpdateTool || onSaveTool)?.(next);
      return next;
    });
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
      namePlaceholder="Python Code Sandbox"
      description={formData.description}
      onChangeDescription={(description) => handleUpdate({ description })}
      typeBadge={{
        label: 'CODE EXECUTION / SANDBOX',
        subLabel: 'Google ADK Built-in',
        color: 'text-emerald-400',
        bg: 'bg-emerald-500/20',
        border: 'border-emerald-500/40',
      }}
      toolIcon={<Terminal className="w-4 h-4 text-emerald-400" />}
      scope={scope}
      agentName={agentName}
      selectedAgent={selectedAgent}
      isAlreadyAttached={isAlreadyAttached}
      onAttachToAgent={
        selectedAgent && onAttachToAgent ? () => onAttachToAgent(selectedAgent.id, formData) : undefined
      }
      onDelete={
        onDeleteTool && (scope === 'agent' || formData.id.startsWith('tool_custom_'))
          ? () => onDeleteTool(formData.id)
          : undefined
      }
    >
      {/* 1. Sandbox Execution Settings */}
      <div className="space-y-3 bg-[#0d1117] p-4 rounded-lg border border-emerald-500/40 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-emerald-300 font-bold text-xs">
            <Cpu className="w-4 h-4 text-emerald-400" />
            <span>Sandbox Runtime Settings</span>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono font-bold">
            Python 3.11
          </span>
        </div>

        {/* Execution Timeout */}
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-emerald-400" />
              Maximum Execution Timeout
            </span>
            <span className="text-[10px] font-mono text-emerald-300">{timeoutSeconds}s</span>
          </label>
          <input
            type="range"
            min={5}
            max={120}
            step={5}
            value={timeoutSeconds}
            onChange={(e) => handleTimeoutChange(parseInt(e.target.value, 10))}
            className="w-full accent-emerald-500 cursor-pointer"
          />
          <div className="flex justify-between text-[9px] text-gray-400 font-mono">
            <span>5s (Fast script)</span>
            <span>120s (Data processing)</span>
          </div>
        </div>

        {/* Security & Isolation Callout */}
        <div className="p-3 bg-emerald-950/20 border border-emerald-500/30 rounded-lg space-y-1">
          <div className="flex items-center gap-1.5 text-emerald-300 font-semibold text-[11px]">
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
            <span>Isolated Container Sandbox</span>
          </div>
          <p className="text-[10px] text-gray-300 leading-relaxed">
            Code executes in an ephemeral container with strict CPU/memory quotas. Network ingress is restricted,
            and file outputs (charts, CSVs) are staged in a transient workspace directory.
          </p>
        </div>

        {/* Pre-installed Libraries */}
        <div className="space-y-1.5 pt-1">
          <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400">
            Pre-installed Scientific Libraries
          </label>
          <div className="flex flex-wrap gap-1.5">
            {['pandas', 'numpy', 'matplotlib', 'scipy', 'sympy', 'requests', 'tabulate'].map((pkg) => (
              <span
                key={pkg}
                className="px-2 py-0.5 rounded bg-[#161b22] text-gray-300 border border-[#30363d] text-[10px] font-mono"
              >
                {pkg}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* 2. Tool Parameter Schemas */}
      <div className="space-y-2 p-4 bg-[#0d1117] rounded-lg border border-[#30363d]">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-bold uppercase tracking-tight text-gray-400 flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-emerald-400" />
            Tool Arguments Schema
          </label>
          <span className="text-[10px] text-gray-400 font-mono">Auto-generated</span>
        </div>

        <div className="space-y-2">
          <div className="p-2.5 rounded bg-[#161b22] border border-[#30363d] space-y-1">
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="text-emerald-300 font-bold">code</span>
              <span className="text-gray-400 text-[10px]">string (required)</span>
            </div>
            <p className="text-[10px] text-gray-400">The executable Python script block submitted by the agent.</p>
          </div>

          <div className="p-2.5 rounded bg-[#161b22] border border-[#30363d] space-y-1">
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="text-emerald-300 font-bold">timeout</span>
              <span className="text-gray-400 text-[10px]">number (optional)</span>
            </div>
            <p className="text-[10px] text-gray-400">Max execution threshold in seconds (default {timeoutSeconds}s).</p>
          </div>
        </div>
      </div>
    </ToolDrawerShell>
  );
};
