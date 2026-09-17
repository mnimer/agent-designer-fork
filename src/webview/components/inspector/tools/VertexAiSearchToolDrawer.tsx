/**
 * Vertex AI Search Tool Drawer Component
 *
 * Dedicated property drawer for Vertex AI Search Datastore configuration:
 * 1. Data Store ID / Engine ID.
 * 2. Google Cloud Region / Location (defaulting to "global").
 * 3. GCP Project ID (optional fallback to env var).
 * 4. Max Retrieved Chunks / Results.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import React, { useState, useEffect } from 'react';
import { Database } from 'lucide-react';
import { ToolDefinition, AgentData, VertexAiSearchConfig } from '../../../types';
import { ToolDrawerShell } from './ToolDrawerShell';

export interface VertexAiSearchToolDrawerProps {
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

export const VertexAiSearchToolDrawer: React.FC<VertexAiSearchToolDrawerProps> = ({
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
        vertexAiSearchConfig: {
          dataStoreId: tool.vertexAiSearchConfig?.dataStoreId || '',
          location: tool.vertexAiSearchConfig?.location || 'global',
          project: tool.vertexAiSearchConfig?.project || '',
          maxResults: tool.vertexAiSearchConfig?.maxResults ?? 5,
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

  const handleUpdateVertexConfig = (updates: Partial<VertexAiSearchConfig>) => {
    setFormData((prev) => {
      if (!prev) return null;
      const next: ToolDefinition = {
        ...prev,
        vertexAiSearchConfig: {
          ...prev.vertexAiSearchConfig,
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
      namePlaceholder="e.g. Enterprise Knowledge Base"
      description={formData.description || ''}
      onChangeDescription={(description) => handleUpdate({ description })}
      typeBadge={{
        label: 'Vertex AI Search',
        subLabel: 'Enterprise Datastore',
        color: 'text-amber-400',
        bg: 'bg-amber-500/20',
        border: 'border-amber-500/40',
      }}
      toolIcon={<Database className="w-4 h-4 text-amber-400" />}
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
      {/* Vertex AI Search Datastore Configuration Form */}
      <div className="space-y-3 bg-[#0d1117] p-4 rounded-lg border border-amber-500/40 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-amber-300 font-bold text-xs">
            <Database className="w-4 h-4 text-amber-400" />
            <span>Vertex AI Search Datastore</span>
          </div>
          <span className="text-[9px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono font-bold">
            Enterprise Grounding
          </span>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400">
            Data Store ID / Engine ID
          </label>
          <input
            type="text"
            value={formData.vertexAiSearchConfig?.dataStoreId || ''}
            onChange={(e) => handleUpdateVertexConfig({ dataStoreId: e.target.value })}
            placeholder="e.g. enterprise-knowledge-base-v1"
            className="w-full px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-amber-400 rounded text-[11px] font-mono text-amber-200 focus:outline-none"
          />
          <div className="text-[9px] text-gray-400 font-mono">
            Identifier of the Vertex AI Search datastore in Google Cloud
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400">
            Google Cloud Region / Location
          </label>
          <input
            type="text"
            value={formData.vertexAiSearchConfig?.location || 'global'}
            onChange={(e) => handleUpdateVertexConfig({ location: e.target.value })}
            placeholder="global"
            className="w-full px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-amber-400 rounded text-[11px] font-mono text-gray-200 focus:outline-none"
          />
          <div className="text-[9px] text-amber-400/80 font-mono">
            Default: &quot;global&quot; (or us-central1, europe-west1)
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400">
            Google Cloud Project ID
          </label>
          <input
            type="text"
            value={formData.vertexAiSearchConfig?.project || ''}
            onChange={(e) => handleUpdateVertexConfig({ project: e.target.value })}
            placeholder="Leave blank to use GOOGLE_CLOUD_PROJECT env var"
            className="w-full px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-amber-400 rounded text-[11px] font-mono text-gray-200 focus:outline-none"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400">
            Max Retrieved Chunks / Results
          </label>
          <input
            type="number"
            min={1}
            max={20}
            value={formData.vertexAiSearchConfig?.maxResults ?? 5}
            onChange={(e) => handleUpdateVertexConfig({ maxResults: parseInt(e.target.value, 10) || 5 })}
            className="w-full px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-amber-400 rounded text-[11px] font-mono text-gray-200 focus:outline-none"
          />
        </div>
      </div>
    </ToolDrawerShell>
  );
};
