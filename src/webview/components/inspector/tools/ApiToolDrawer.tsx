/**
 * REST API Tool Drawer
 *
 * Dedicated inspector property panel for REST API client tools:
 * 1. Target endpoint URL configuration.
 * 2. HTTP method selection (GET, POST, PUT, DELETE, PATCH).
 * 3. API Key / Secret Environment Variable name & Google Secret Manager resource key.
 * 4. Custom HTTP Headers key-value manager.
 * 5. Request timeout configuration.
 * 6. Interactive request parameter schema manager with query vs payload body distinction.
 *
 * Author: Mike Nimer <mikenimer@google.com>
 */

import React, { useState, useEffect } from 'react';
import { Radio, Link, Key, Sliders, Trash2, Plus, Clock, ShieldCheck, Tag } from 'lucide-react';
import { ToolDefinition, AgentData } from '../../../../types';
import { ToolDrawerShell } from './ToolDrawerShell';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export interface ApiToolDrawerProps {
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

const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

export const ApiToolDrawer: React.FC<ApiToolDrawerProps> = ({
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

  // New parameter state
  const [newParamKey, setNewParamKey] = useState('');
  const [newParamVal, setNewParamVal] = useState('');

  // New header state
  const [newHeaderKey, setNewHeaderKey] = useState('');
  const [newHeaderVal, setNewHeaderVal] = useState('');

  useEffect(() => {
    if (tool) {
      setFormData({
        ...tool,
        httpMethod: (tool.httpMethod as HttpMethod) || 'GET',
        headers: tool.headers || {},
        timeoutSeconds: tool.timeoutSeconds ?? 30,
      });
    }
  }, [tool]);

  if (!isOpen || !formData) return null;

  const currentMethod: HttpMethod = (formData.httpMethod as HttpMethod) || 'GET';

  const handleUpdate = (patch: Partial<ToolDefinition>) => {
    setFormData((prev) => {
      if (!prev) return null;
      const next = { ...prev, ...patch };
      (onUpdateTool || onSaveTool)?.(next);
      return next;
    });
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

  const handleAddHeader = () => {
    if (!newHeaderKey.trim()) return;
    const currentHeaders = formData.headers || {};
    handleUpdate({
      headers: {
        ...currentHeaders,
        [newHeaderKey.trim()]: newHeaderVal.trim(),
      },
    });
    setNewHeaderKey('');
    setNewHeaderVal('');
  };

  const handleRemoveHeader = (headerName: string) => {
    const currentHeaders = { ...(formData.headers || {}) };
    delete currentHeaders[headerName];
    handleUpdate({ headers: currentHeaders });
  };

  const isAlreadyAttached =
    selectedAgent &&
    (selectedAgent.tools || []).some(
      (t) => t.id === formData.id || t.name.toLowerCase() === formData.name.toLowerCase()
    );

  const getMethodBadgeClass = (method: HttpMethod) => {
    switch (method) {
      case 'GET':
        return currentMethod === 'GET'
          ? 'bg-sky-500/20 text-sky-300 border-sky-500/50'
          : 'bg-[#161b22] text-gray-400 border-[#30363d] hover:border-sky-500/40 hover:text-sky-300';
      case 'POST':
        return currentMethod === 'POST'
          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
          : 'bg-[#161b22] text-gray-400 border-[#30363d] hover:border-emerald-500/40 hover:text-emerald-300';
      case 'PUT':
        return currentMethod === 'PUT'
          ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
          : 'bg-[#161b22] text-gray-400 border-[#30363d] hover:border-amber-500/40 hover:text-amber-300';
      case 'DELETE':
        return currentMethod === 'DELETE'
          ? 'bg-rose-500/20 text-rose-300 border-rose-500/50'
          : 'bg-[#161b22] text-gray-400 border-[#30363d] hover:border-rose-500/40 hover:text-rose-300';
      case 'PATCH':
        return currentMethod === 'PATCH'
          ? 'bg-purple-500/20 text-purple-300 border-purple-500/50'
          : 'bg-[#161b22] text-gray-400 border-[#30363d] hover:border-purple-500/40 hover:text-purple-300';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/40';
    }
  };

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
        subLabel: `${currentMethod} HTTP Integration`,
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
      onDelete={
        onDeleteTool && (scope === 'agent' || formData.id.startsWith('tool_custom_') || formData.id.startsWith('tool_api_'))
          ? () => onDeleteTool(formData.id)
          : undefined
      }
    >
      {/* 1. Endpoint & HTTP Method Configuration */}
      <div className="space-y-3 bg-[#0d1117] p-4 rounded-lg border border-rose-500/40 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-rose-300 font-bold text-xs">
            <Link className="w-4 h-4 text-rose-400" />
            <span>Endpoint &amp; HTTP Method</span>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 font-mono font-bold">
            {currentMethod}
          </span>
        </div>

        {/* HTTP Method Selector */}
        <div className="space-y-1.5">
          <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400">
            HTTP Method
          </label>
          <div className="flex gap-2">
            {HTTP_METHODS.map((method) => (
              <button
                key={method}
                type="button"
                onClick={() => handleUpdate({ httpMethod: method })}
                className={`flex-1 py-1.5 text-[11px] font-mono font-bold rounded border transition-colors cursor-pointer ${getMethodBadgeClass(
                  method
                )}`}
              >
                {method}
              </button>
            ))}
          </div>
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

        {/* Timeout in Seconds */}
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400 flex items-center gap-1">
            <Clock className="w-3 h-3 text-sky-400" />
            Request Timeout (seconds)
          </label>
          <input
            type="number"
            min={1}
            max={300}
            value={formData.timeoutSeconds ?? 30}
            onChange={(e) => handleUpdate({ timeoutSeconds: parseInt(e.target.value, 10) || 30 })}
            className="w-full px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-rose-400 rounded text-[11px] font-mono text-gray-200 focus:outline-none"
          />
        </div>
      </div>

      {/* 2. Authentication & Secrets */}
      <div className="space-y-3 bg-[#0d1117] p-4 rounded-lg border border-[#30363d]">
        <div className="flex items-center gap-2 text-amber-300 font-bold text-xs">
          <Key className="w-4 h-4 text-amber-400" />
          <span>Authentication &amp; Secret Manager</span>
        </div>

        {/* Environment Variable */}
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400 flex items-center gap-1">
            API Key / Secret Environment Variable
          </label>
          <input
            type="text"
            value={formData.authKeyEnv || ''}
            onChange={(e) => handleUpdate({ authKeyEnv: e.target.value })}
            placeholder="API_SECRET_TOKEN"
            className="w-full px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-amber-400 rounded text-[11px] font-mono text-amber-300 focus:outline-none"
          />
          <div className="text-[9px] text-gray-400 font-mono">
            Resolved at runtime on the host via Authorization: Bearer &lt;token&gt;.
          </div>
        </div>

        {/* Secret Manager Key */}
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400 flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-indigo-400" />
            Google Cloud Secret Manager Resource / Secret Name (Optional)
          </label>
          <input
            type="text"
            value={formData.secretManagerKey || ''}
            onChange={(e) => handleUpdate({ secretManagerKey: e.target.value })}
            placeholder="projects/PROJECT_ID/secrets/MY_SECRET/versions/latest"
            className="w-full px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-indigo-400 rounded text-[11px] font-mono text-indigo-300 focus:outline-none"
          />
          <div className="text-[9px] text-gray-400 font-mono">
            Optional: Fetches secret from Secret Manager if environment variable is not present.
          </div>
        </div>
      </div>

      {/* 3. Custom Request Headers */}
      <div className="space-y-3 bg-[#0d1117] p-4 rounded-lg border border-[#30363d]">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-bold uppercase tracking-tight text-gray-400 flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5 text-purple-400" />
            Custom Headers ({Object.keys(formData.headers || {}).length})
          </label>
        </div>

        <div className="space-y-1.5 max-h-36 overflow-y-auto">
          {Object.entries(formData.headers || {}).length === 0 ? (
            <div className="text-[11px] text-gray-500 italic p-2 text-center bg-[#161b22] rounded border border-dashed border-[#30363d]">
              No custom headers defined. Add headers below.
            </div>
          ) : (
            Object.entries(formData.headers || {}).map(([hdrKey, hdrVal]) => (
              <div
                key={hdrKey}
                className="flex items-center justify-between bg-[#161b22] px-2.5 py-1.5 rounded border border-[#30363d] text-[11px] font-mono"
              >
                <div className="min-w-0">
                  <span className="text-purple-300 font-bold">{hdrKey}</span>:
                  <span className="text-gray-300 ml-1 truncate">{hdrVal}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveHeader(hdrKey)}
                  className="text-gray-400 hover:text-rose-400 cursor-pointer p-0.5"
                  title="Remove header"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Add Header Row */}
        <div className="flex gap-1.5 pt-1">
          <input
            type="text"
            value={newHeaderKey}
            onChange={(e) => setNewHeaderKey(e.target.value)}
            placeholder="Header (e.g. Accept)"
            className="flex-1 px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-purple-400 rounded text-[10px] font-mono text-gray-200 focus:outline-none"
          />
          <input
            type="text"
            value={newHeaderVal}
            onChange={(e) => setNewHeaderVal(e.target.value)}
            placeholder="Value (e.g. application/json)"
            className="flex-1 px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-purple-400 rounded text-[10px] font-mono text-gray-200 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleAddHeader}
            className="px-3 py-1.5 bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] rounded text-[10px] text-purple-300 font-medium cursor-pointer flex items-center gap-1"
          >
            <Plus className="w-3 h-3" />
            <span>Add</span>
          </button>
        </div>
      </div>

      {/* 4. Parameters Schema Manager */}
      <div className="space-y-3 p-4 bg-[#0d1117] rounded-lg border border-[#30363d]">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-bold uppercase tracking-tight text-gray-400 flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-rose-400" />
            {currentMethod === 'GET' || currentMethod === 'DELETE' ? 'Query Parameters' : 'Request Body Parameters'} ({Object.keys(formData.parameters || {}).length})
          </label>
          <span className="text-[9px] px-1.5 py-0.5 rounded font-mono font-medium text-gray-400 bg-[#161b22] border border-[#30363d]">
            {currentMethod === 'GET' || currentMethod === 'DELETE' ? 'params={...}' : 'json={...}'}
          </span>
        </div>

        <div className="space-y-1.5 max-h-40 overflow-y-auto">
          {Object.entries(formData.parameters || {}).length === 0 ? (
            <div className="text-[11px] text-gray-500 italic p-2 text-center bg-[#161b22] rounded border border-dashed border-[#30363d]">
              No parameters defined yet. Add parameters below.
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
