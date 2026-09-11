/**
 * Web Page Reader Tool Drawer
 *
 * Dedicated inspector property panel for configuring the Google ADK Web Page Reader tool:
 * 1. HTTP retrieval & HTML-to-markdown conversion settings.
 * 2. URL parameter specifications.
 * 3. Boilerplate removal & sanitized text content behavior.
 *
 * Author: Mike Nimer <mikenimer@google.com>
 */

import React, { useState, useEffect } from 'react';
import { FileText, Globe, Sliders, Shield } from 'lucide-react';
import { ToolDefinition, AgentData } from '../../../../types';
import { ToolDrawerShell } from './ToolDrawerShell';

export interface WebPageReaderToolDrawerProps {
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

export const WebPageReaderToolDrawer: React.FC<WebPageReaderToolDrawerProps> = ({
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
      setFormData({ ...tool });
    }
  }, [tool]);

  if (!isOpen || !formData) return null;

  const handleUpdate = (patch: Partial<ToolDefinition>) => {
    setFormData((prev) => (prev ? { ...prev, ...patch } : null));
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
      namePlaceholder="Web Page Reader"
      description={formData.description}
      onChangeDescription={(description) => handleUpdate({ description })}
      typeBadge={{
        label: 'WEB SCRAPER / MARKDOWN',
        subLabel: 'Google ADK Built-in',
        color: 'text-sky-400',
        bg: 'bg-sky-500/10',
        border: 'border-sky-500/30',
      }}
      toolIcon={<FileText className="w-5 h-5 text-sky-400" />}
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
      {/* 1. Scraper Settings */}
      <div className="space-y-3 bg-[#0d1117] p-4 rounded-lg border border-sky-500/40 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sky-300 font-bold text-xs">
            <Globe className="w-4 h-4 text-sky-400" />
            <span>Web Scraping &amp; Formatting</span>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30 font-mono font-bold">
            load_web_page
          </span>
        </div>

        <div className="p-3 bg-sky-950/20 border border-sky-500/30 rounded-lg space-y-1">
          <div className="flex items-center gap-1.5 text-sky-300 font-semibold text-[11px]">
            <Shield className="w-3.5 h-3.5 text-sky-400" />
            <span>HTML-to-Markdown Sanitization</span>
          </div>
          <p className="text-[10px] text-gray-300 leading-relaxed">
            Strips JavaScript, external stylesheets, navigation headers, footers, and tracking tags.
            Converts semantic article markup into clean markdown paragraphs to fit comfortably inside the model context window.
          </p>
        </div>
      </div>

      {/* 2. Tool Arguments Schema */}
      <div className="space-y-2 p-4 bg-[#0d1117] rounded-lg border border-[#30363d]">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-bold uppercase tracking-tight text-gray-400 flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-sky-400" />
            Tool Arguments Schema
          </label>
          <span className="text-[10px] text-gray-400 font-mono">Built-in</span>
        </div>

        <div className="p-2.5 rounded bg-[#161b22] border border-[#30363d] space-y-1">
          <div className="flex items-center justify-between text-[11px] font-mono">
            <span className="text-sky-300 font-bold">url</span>
            <span className="text-gray-400 text-[10px]">string (required)</span>
          </div>
          <p className="text-[10px] text-gray-400">
            Fully qualified HTTP or HTTPS web address to fetch and parse.
          </p>
        </div>
      </div>
    </ToolDrawerShell>
  );
};
