/**
 * Google Search Grounding Tool Drawer Component
 *
 * Dedicated property drawer for Google Search Grounding:
 * 1. Allowed Domain Filters (chips with add/remove).
 * 2. Dynamic Retrieval Threshold slider (0.0 to 1.0).
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import React, { useState, useEffect } from 'react';
import { Globe } from 'lucide-react';
import { ToolDefinition, AgentData, GoogleSearchConfig } from '../../../types';
import { ToolDrawerShell } from './ToolDrawerShell';
import { TagListInput } from '../../drawers/primitives/TagListInput';

export interface GoogleSearchToolDrawerProps {
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

export const GoogleSearchToolDrawer: React.FC<GoogleSearchToolDrawerProps> = ({
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
        googleSearchConfig: {
          domainFilters: tool.googleSearchConfig?.domainFilters || [],
          dynamicThreshold: tool.googleSearchConfig?.dynamicThreshold ?? 0.3,
        },
      });
    }
  }, [tool]);

  if (!isOpen || !formData) return null;

  const handleUpdate = (updates: Partial<ToolDefinition>) => {
    setFormData((prev) => (prev ? { ...prev, ...updates } : null));
  };

  const handleUpdateGoogleSearchConfig = (updates: Partial<GoogleSearchConfig>) => {
    setFormData((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        googleSearchConfig: {
          ...prev.googleSearchConfig,
          ...updates,
        },
      };
    });
  };

  const handleAddDomainFilter = (domain: string) => {
    if (!formData) return;
    const cleanDomain = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!cleanDomain) return;
    const currentFilters = formData.googleSearchConfig?.domainFilters || [];
    if (!currentFilters.includes(cleanDomain)) {
      handleUpdateGoogleSearchConfig({
        domainFilters: [...currentFilters, cleanDomain],
      });
    }
  };

  const handleRemoveDomainFilter = (domainToRemove: string) => {
    if (!formData) return;
    const currentFilters = formData.googleSearchConfig?.domainFilters || [];
    handleUpdateGoogleSearchConfig({
      domainFilters: currentFilters.filter((d) => d !== domainToRemove),
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
      namePlaceholder="e.g. Google Search Grounding"
      description={formData.description || ''}
      onChangeDescription={(description) => handleUpdate({ description })}
      typeBadge={{
        label: 'Google Search',
        subLabel: 'Live Web Grounding',
        color: 'text-sky-400',
        bg: 'bg-sky-500/20',
        border: 'border-sky-500/40',
      }}
      toolIcon={<Globe className="w-4 h-4 text-sky-400" />}
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
      {/* Google Search Grounding Settings Form */}
      <div className="space-y-4 bg-[#0d1117] p-4 rounded-lg border border-sky-500/40 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-sky-300 font-bold text-xs">
            <Globe className="w-4 h-4 text-sky-400" />
            <span>Google Search Grounding Settings</span>
          </div>
          <span className="text-[9px] px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30 font-mono font-bold">
            Live Web
          </span>
        </div>

        {/* Allowed Domain Filters */}
        <div className="space-y-2">
          <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400 flex items-center justify-between">
            <span>Domain Filters ({(formData.googleSearchConfig?.domainFilters || []).length})</span>
            <span className="text-[9px] text-gray-500 lowercase">e.g. docs.python.org</span>
          </label>
          <TagListInput
            tags={formData.googleSearchConfig?.domainFilters || []}
            onAddTag={handleAddDomainFilter}
            onRemoveTag={handleRemoveDomainFilter}
            placeholder="cloud.google.com"
            buttonText="Add Domain"
          />
        </div>

        {/* Dynamic Retrieval Threshold */}
        <div className="space-y-1">
          <div className="flex justify-between items-center">
            <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400">
              Dynamic Retrieval Threshold
            </label>
            <span className="text-[10px] font-mono text-sky-300">
              {formData.googleSearchConfig?.dynamicThreshold ?? 0.3}
            </span>
          </div>
          <input
            type="range"
            min="0.0"
            max="1.0"
            step="0.05"
            value={formData.googleSearchConfig?.dynamicThreshold ?? 0.3}
            onChange={(e) => handleUpdateGoogleSearchConfig({ dynamicThreshold: parseFloat(e.target.value) })}
            className="w-full accent-sky-500 cursor-pointer"
          />
          <div className="flex justify-between text-[9px] text-gray-500 font-mono">
            <span>0.0 (Always Ground)</span>
            <span>1.0 (Only when uncertain)</span>
          </div>
        </div>
      </div>
    </ToolDrawerShell>
  );
};
