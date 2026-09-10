/**
 * MCP Server Tool Drawer Component
 *
 * Dedicated property drawer for Model Context Protocol (MCP) servers:
 * 1. Transport protocol selection (stdio, sse, http) with descriptive tooltips.
 * 2. Language-aware CLI runner presets (uvx, python, npx, docker) + custom path.
 * 3. Working directory (cwd), CLI arguments, and process environment variables.
 * 4. Custom HTTP request headers for remote SSE / HTTP endpoints.
 * 5. Auto-approve tools pattern governance and exposed tools filtering.
 * 6. Live connection testing ("Test MCP Handshake & List Tools") with latency,
 *    server version badge, and interactive tool discovery toggles.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import React, { useState, useEffect } from 'react';
import { 
  Server, 
  Key, 
  Check, 
  Sparkles, 
  AlertTriangle, 
  Clock, 
  Info,
  Loader2,
  ShieldCheck
} from 'lucide-react';
import { ToolDefinition, AgentData, McpToolConfig, McpTransportType } from '../../../types';
import { ToolDrawerShell } from './ToolDrawerShell';

export interface McpHandshakeResult {
  success: boolean;
  tools: ToolDefinition[];
  serverInfo?: {
    name: string;
    version?: string;
  };
  latencyMs?: number;
  error?: string;
}

export const TRANSPORT_DESCRIPTIONS: Record<McpTransportType, { label: string; desc: string; bestFor: string }> = {
  http: {
    label: 'Streamable HTTP',
    desc: 'Communicates with a cloud-hosted MCP HTTP endpoint via POST and streamed JSON-RPC 2.0 responses (MCP Specification 2024-11-05).',
    bestFor: 'Production standard for cloud-deployed agents, serverless runtimes (Cloud Run), and enterprise API gateways.',
  },
  sse: {
    label: 'Server-Sent Events (SSE - Deprecated)',
    desc: 'Deprecated in the MCP Specification in favor of Streamable HTTP.',
    bestFor: 'Legacy streaming servers only.',
  },
  stdio: {
    label: 'Standard I/O (Local Only)',
    desc: 'Spawns a local process communicating over stdin/stdout pipes. Not supported for cloud-deployed agents.',
    bestFor: 'Local machine desktop development only.',
  },
};

export interface McpToolDrawerProps {
  tool: ToolDefinition | null;
  isOpen: boolean;
  onClose: () => void;
  onSaveTool: (updatedTool: ToolDefinition) => void;
  onDeleteTool?: (toolId: string) => void;
  selectedAgent?: AgentData | null;
  onAttachToAgent?: (agentId: string, tool: ToolDefinition) => void;
  scope?: 'global' | 'agent';
  agentName?: string;
  targetLanguage?: string;
  onTestMcpHandshake?: (config: McpToolConfig) => Promise<McpHandshakeResult>;
}

export const McpToolDrawer: React.FC<McpToolDrawerProps> = ({
  tool,
  isOpen,
  onClose,
  onSaveTool,
  onDeleteTool,
  selectedAgent,
  onAttachToAgent,
  scope = 'global',
  agentName,
  targetLanguage = 'python',
  onTestMcpHandshake,
}) => {
  const [formData, setFormData] = useState<ToolDefinition | null>(null);
  const [newHeaderKey, setNewHeaderKey] = useState('');
  const [newHeaderValue, setNewHeaderValue] = useState('');
  const [newAutoApprovePattern, setNewAutoApprovePattern] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);

  // MCP handshake testing state
  const [isTestingMcp, setIsTestingMcp] = useState(false);
  const [mcpTestResult, setMcpTestResult] = useState<McpHandshakeResult | null>(null);

  useEffect(() => {
    if (tool) {
      setFormData({
        ...tool,
        type: 'mcp',
        mcpConfig: {
          serverName: tool.mcpConfig?.serverName || tool.name || 'mcp-server',
          transport: 'http',
          command: tool.mcpConfig?.command || 'uvx',
          args: tool.mcpConfig?.args || [],
          cwd: tool.mcpConfig?.cwd || '',
          serverUrl: tool.mcpConfig?.serverUrl || '',
          envVars: tool.mcpConfig?.envVars || {},
          headers: tool.mcpConfig?.headers || {},
          timeoutSeconds: tool.mcpConfig?.timeoutSeconds || 30,
          exposedTools: tool.mcpConfig?.exposedTools || ['*'],
          autoApproveTools: tool.mcpConfig?.autoApproveTools || [],
          authProviderType: tool.mcpConfig?.authProviderType || 'google_credentials',
          oauthConfig: {
            scopes: tool.mcpConfig?.oauthConfig?.scopes || [
              'https://www.googleapis.com/auth/cloud-platform',
              'https://www.googleapis.com/auth/bigquery',
            ],
            projectId: tool.mcpConfig?.oauthConfig?.projectId || '',
          },
          discoveredTools: tool.mcpConfig?.discoveredTools || [],
        },
      });
      if (tool.mcpConfig?.discoveredTools && tool.mcpConfig.discoveredTools.length > 0) {
        setMcpTestResult({
          success: true,
          tools: tool.mcpConfig.discoveredTools,
        });
      } else {
        setMcpTestResult(null);
      }
    }
  }, [tool]);

  if (!isOpen || !formData) return null;

  const mcpConfig: McpToolConfig = formData.mcpConfig || {
    serverName: formData.name || 'mcp-server',
    transport: 'http',
    serverUrl: '',
    headers: {},
    timeoutSeconds: 30,
    exposedTools: ['*'],
    autoApproveTools: [],
    authProviderType: 'google_credentials',
    oauthConfig: {
      scopes: [
        'https://www.googleapis.com/auth/cloud-platform',
        'https://www.googleapis.com/auth/bigquery',
      ],
      projectId: '',
    },
    discoveredTools: [],
  };

  const handleUpdate = (updates: Partial<ToolDefinition>) => {
    setFormData((prev) => (prev ? { ...prev, ...updates } : null));
  };

  const handleUpdateMcpConfig = (updates: Partial<McpToolConfig>) => {
    setFormData((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        mcpConfig: {
          ...prev.mcpConfig,
          transport: 'http',
          ...updates,
        },
      };
    });
  };

  // Custom HTTP headers handlers
  const handleAddHeader = () => {
    if (!newHeaderKey.trim()) return;
    const current = mcpConfig.headers || {};
    handleUpdateMcpConfig({
      headers: {
        ...current,
        [newHeaderKey.trim()]: newHeaderValue,
      },
    });
    setNewHeaderKey('');
    setNewHeaderValue('');
  };

  const handleRemoveHeader = (key: string) => {
    const current = { ...(mcpConfig.headers || {}) };
    delete current[key];
    handleUpdateMcpConfig({ headers: current });
  };

  // Auto-approve pattern handlers
  const handleAddAutoApprovePattern = () => {
    if (!newAutoApprovePattern.trim()) return;
    const cleanPattern = newAutoApprovePattern.trim();
    const current = mcpConfig.autoApproveTools || [];
    if (!current.includes(cleanPattern)) {
      handleUpdateMcpConfig({
        autoApproveTools: [...current, cleanPattern],
      });
    }
    setNewAutoApprovePattern('');
  };

  const handleRemoveAutoApprovePattern = (pattern: string) => {
    const current = mcpConfig.autoApproveTools || [];
    handleUpdateMcpConfig({
      autoApproveTools: current.filter((p) => p !== pattern),
    });
  };

  // Live Handshake Connection Test
  const handleTestMcpConnection = async () => {
    if (!onTestMcpHandshake) return;
    setIsTestingMcp(true);
    setMcpTestResult(null);

    try {
      const result = await onTestMcpHandshake({
        ...mcpConfig,
        transport: 'http',
      });
      setMcpTestResult(result);
      if (result.success && Array.isArray(result.tools) && result.tools.length > 0) {
        handleUpdateMcpConfig({
          discoveredTools: result.tools,
        });
      }
    } catch (err: any) {
      setMcpTestResult({
        success: false,
        tools: [],
        error: err?.message || 'Handshake failed',
      });
    } finally {
      setIsTestingMcp(false);
    }
  };

  const handleToggleExposeDiscoveredTool = (toolName: string) => {
    const currentExposed = mcpConfig.exposedTools || ['*'];
    let updated: string[];

    if (currentExposed.includes('*')) {
      const allDiscovered = (mcpTestResult?.tools || mcpConfig.discoveredTools || []).map((t) => t.name);
      updated = allDiscovered.filter((name) => name !== toolName);
    } else if (currentExposed.includes(toolName)) {
      updated = currentExposed.filter((name) => name !== toolName);
    } else {
      updated = [...currentExposed, toolName];
    }

    handleUpdateMcpConfig({ exposedTools: updated });
  };

  const handleToggleAutoApproveDiscoveredTool = (toolName: string) => {
    const currentAuto = mcpConfig.autoApproveTools || [];
    let updated: string[];

    if (currentAuto.includes(toolName)) {
      updated = currentAuto.filter((name) => name !== toolName);
    } else {
      updated = [...currentAuto, toolName];
    }

    handleUpdateMcpConfig({ autoApproveTools: updated });
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
      onChangeName={(name) => handleUpdate({ name, mcpConfig: { ...mcpConfig, serverName: name, transport: 'http' } })}
      namePlaceholder="e.g. BigQuery MCP Server"
      description={formData.description || ''}
      onChangeDescription={(description) => handleUpdate({ description })}
      typeBadge={{
        label: 'MCP Server',
        subLabel: 'Streamable HTTP',
        color: 'text-purple-400',
        bg: 'bg-purple-500/20',
        border: 'border-purple-500/40',
      }}
      toolIcon={<Server className="w-4 h-4 text-purple-400" />}
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
      {/* MCP SERVER DEDICATED CONFIGURATION */}
      <div className="space-y-4 bg-[#0d1117] p-4 rounded-lg border border-purple-500/40 shadow-sm">
        {/* Panel Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-purple-300 font-bold text-xs">
            <Server className="w-4 h-4 text-purple-400" />
            <span>MCP Server Specification (2024-11-05)</span>
          </div>
          <span className="text-[9px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-mono font-bold">
            Streamable HTTP
          </span>
        </div>

        {/* 1. Server Identifier */}
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400">
            Server Name / Identifier
          </label>
          <input
            type="text"
            value={mcpConfig.serverName || ''}
            onChange={(e) => handleUpdateMcpConfig({ serverName: e.target.value })}
            placeholder="e.g. bigquery-mcp or sales-analytics-server"
            className="w-full px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-purple-400 rounded text-[11px] font-mono text-purple-200 focus:outline-none"
          />
        </div>

        {/* 2. Endpoint URL */}
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400 flex items-center justify-between">
            <span>Server Endpoint URL (HTTP/HTTPS)</span>
            <span className="text-[9px] text-purple-400 font-mono lowercase">Streamable HTTP</span>
          </label>
          <input
            type="text"
            value={mcpConfig.serverUrl || ''}
            onChange={(e) => handleUpdateMcpConfig({ serverUrl: e.target.value })}
            placeholder="e.g. https://bigquery.googleapis.com/mcp"
            className="w-full px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-purple-400 rounded text-[11px] font-mono text-purple-200 focus:outline-none"
          />
        </div>

        {/* 3. Authentication Provider & Headers */}
        <div className="space-y-2 pt-2 border-t border-[#30363d]">
          <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400 flex items-center justify-between">
            <span>Authentication Provider</span>
            <span className="text-[9px] text-purple-400 font-mono">IAM / OAuth</span>
          </label>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleUpdateMcpConfig({
                authProviderType: 'google_credentials',
                oauthConfig: {
                  scopes: mcpConfig.oauthConfig?.scopes || [
                    'https://www.googleapis.com/auth/cloud-platform',
                    'https://www.googleapis.com/auth/bigquery',
                  ],
                  projectId: mcpConfig.oauthConfig?.projectId || '',
                },
              })}
              className={`py-1.5 px-2 rounded-md text-[11px] font-medium border text-left flex items-center gap-1.5 cursor-pointer transition-colors ${
                (mcpConfig.authProviderType || 'google_credentials') === 'google_credentials'
                  ? 'bg-blue-600/30 text-blue-200 border-blue-500 shadow-xs'
                  : 'bg-[#161b22] text-gray-400 border-[#30363d] hover:bg-[#21262d] hover:text-gray-200'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
              <span>Google Cloud ADC</span>
            </button>

            <button
              type="button"
              onClick={() => handleUpdateMcpConfig({ authProviderType: 'none' })}
              className={`py-1.5 px-2 rounded-md text-[11px] font-medium border text-left flex items-center gap-1.5 cursor-pointer transition-colors ${
                mcpConfig.authProviderType === 'none'
                  ? 'bg-purple-600/30 text-white border-purple-500'
                  : 'bg-[#161b22] text-gray-400 border-[#30363d] hover:bg-[#21262d] hover:text-gray-200'
              }`}
            >
              <Key className="w-3.5 h-3.5 text-gray-400" />
              <span>Custom Headers</span>
            </button>
          </div>

          {/* Custom Headers Config */}
          {(!mcpConfig.authProviderType || mcpConfig.authProviderType === 'none') && (
            <div className="space-y-1.5 pt-1">
              <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400 flex items-center justify-between">
                <span>Request Headers (Authorization, API Keys)</span>
                <span className="text-[9px] text-gray-500 font-mono">
                  {Object.keys(mcpConfig.headers || {}).length} set
                </span>
              </label>

              {/* Table of existing headers */}
              {Object.entries(mcpConfig.headers || {}).length > 0 && (
                <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                  {Object.entries(mcpConfig.headers || {}).map(([key, value]) => (
                    <div
                      key={key}
                      className="flex items-center justify-between px-2 py-1 rounded bg-[#161b22] border border-[#30363d] text-[10px] font-mono"
                    >
                      <span className="text-purple-300 font-bold truncate max-w-[120px]">{key}</span>
                      <span className="text-gray-400 truncate max-w-[140px]">: {value}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveHeader(key)}
                        className="text-gray-400 hover:text-rose-400 cursor-pointer ml-1 text-xs"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add new header */}
              <div className="flex gap-1 pt-0.5">
                <input
                  type="text"
                  value={newHeaderKey}
                  onChange={(e) => setNewHeaderKey(e.target.value)}
                  placeholder="Authorization"
                  className="w-1/3 px-2 py-1 bg-[#161b22] border border-[#30363d] focus:border-purple-400 rounded text-[10px] font-mono text-purple-200 focus:outline-none"
                />
                <input
                  type="text"
                  value={newHeaderValue}
                  onChange={(e) => setNewHeaderValue(e.target.value)}
                  placeholder="Bearer token..."
                  className="flex-1 px-2 py-1 bg-[#161b22] border border-[#30363d] focus:border-purple-400 rounded text-[10px] font-mono text-gray-200 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddHeader}
                  className="px-2 py-1 bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] rounded text-[10px] text-purple-300 font-medium cursor-pointer"
                >
                  Add
                </button>
              </div>
            </div>
          )}

              {mcpConfig.authProviderType === 'google_credentials' && (
                <div className="p-3 bg-blue-950/30 border border-blue-500/30 rounded-lg space-y-2.5">
                  <div className="flex items-start gap-2">
                    <ShieldCheck className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                    <div className="text-[10px] text-blue-200/90 leading-relaxed">
                      <strong className="text-white">Auto-Refreshing Credentials:</strong> Automatically fetches and renews short-lived OAuth 2.0 tokens using local <code className="text-blue-300">gcloud auth</code> during testing and IAM Service Accounts in production. Eliminates 1-hour token expiration timeouts.
                    </div>
                  </div>

                  {/* GCP Project ID */}
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase font-bold tracking-tight text-blue-300 flex items-center justify-between">
                      <span>Google Cloud Project ID (x-goog-user-project)</span>
                      <span className="text-[9px] text-gray-500">optional fallback to env</span>
                    </label>
                    <input
                      type="text"
                      value={mcpConfig.oauthConfig?.projectId || ''}
                      onChange={(e) => handleUpdateMcpConfig({
                        oauthConfig: {
                          ...mcpConfig.oauthConfig,
                          projectId: e.target.value,
                        },
                      })}
                      placeholder="e.g. my-billing-project-id"
                      className="w-full px-2 py-1 bg-[#161b22] border border-blue-500/40 focus:border-blue-400 rounded text-[10px] font-mono text-blue-200 focus:outline-none"
                    />
                  </div>

                  {/* OAuth Scopes */}
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase font-bold tracking-tight text-blue-300">
                      OAuth 2.0 Scopes
                    </label>
                    <div className="flex flex-wrap gap-1">
                      {[
                        'https://www.googleapis.com/auth/cloud-platform',
                        'https://www.googleapis.com/auth/bigquery',
                        'https://www.googleapis.com/auth/spanner.data',
                      ].map((scopeUri) => {
                        const isSelected = (mcpConfig.oauthConfig?.scopes || []).includes(scopeUri);
                        const label = scopeUri.split('/').pop() || scopeUri;
                        return (
                          <button
                            key={scopeUri}
                            type="button"
                            onClick={() => {
                              const currentScopes = mcpConfig.oauthConfig?.scopes || [];
                              const updatedScopes = isSelected
                                ? currentScopes.filter((s) => s !== scopeUri)
                                : [...currentScopes, scopeUri];
                              handleUpdateMcpConfig({
                                oauthConfig: {
                                  ...mcpConfig.oauthConfig,
                                  scopes: updatedScopes,
                                },
                              });
                            }}
                            className={`px-2 py-0.5 rounded text-[9px] font-mono border cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-blue-600/40 text-blue-200 border-blue-400 font-bold'
                                : 'bg-[#161b22] text-gray-400 border-[#30363d] hover:border-gray-500'
                            }`}
                          >
                            {isSelected ? '✓ ' : '+ '}{label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

        {/* 4. Auto-Approve Tools Configuration */}
        <div className="space-y-2 pt-2 border-t border-[#30363d]">
          <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400 flex items-center justify-between">
            <span>Auto-Approve Tool Execution</span>
            <span className="text-[9px] text-purple-400 font-mono">Bypass HITL Confirmation</span>
          </label>
          <div className="text-[10px] text-gray-400">
            Specify glob patterns or tool names that can run without user interruption:
          </div>

          <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
            {(mcpConfig.autoApproveTools || []).map((pattern) => (
              <span
                key={pattern}
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-purple-950 text-purple-200 border border-purple-500/30 text-[10px] font-mono"
              >
                <span>{pattern}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveAutoApprovePattern(pattern)}
                  className="hover:text-rose-400 cursor-pointer ml-1"
                >
                  ×
                </button>
              </span>
            ))}
          </div>

          <div className="flex gap-1 pt-1">
            <input
              type="text"
              value={newAutoApprovePattern}
              onChange={(e) => setNewAutoApprovePattern(e.target.value)}
              placeholder="e.g. read_* or list_files"
              className="flex-1 px-2 py-1 bg-[#161b22] border border-[#30363d] focus:border-purple-400 rounded text-[10px] font-mono text-purple-200 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleAddAutoApprovePattern}
              className="px-2.5 py-1 bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] rounded text-[10px] text-purple-300 font-medium cursor-pointer"
            >
              Add Pattern
            </button>
          </div>
        </div>

        {/* 5. Exposed Tools & Handshake Timeout */}
        <div className="space-y-3 pt-2 border-t border-[#30363d]">
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400 flex items-center justify-between">
              <span>Exposed Tools Scope</span>
              <span className="text-[9px] text-gray-500 lowercase">* for all</span>
            </label>
            <input
              type="text"
              value={Array.isArray(mcpConfig.exposedTools) ? mcpConfig.exposedTools.join(', ') : '*'}
              onChange={(e) =>
                handleUpdateMcpConfig({
                  exposedTools: e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              placeholder="* or read_file, write_file"
              className="w-full px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-purple-400 rounded text-[11px] font-mono text-gray-200 focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-gray-400" />
                <span>Handshake Timeout (seconds)</span>
              </span>
              <span className="text-[9px] text-gray-500 font-mono">
                {mcpConfig.timeoutSeconds || 30}s
              </span>
            </label>
            <input
              type="number"
              min={5}
              max={300}
              value={mcpConfig.timeoutSeconds || 30}
              onChange={(e) =>
                handleUpdateMcpConfig({
                  timeoutSeconds: parseInt(e.target.value, 10) || 30,
                })
              }
              className="w-full px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-purple-400 rounded text-[11px] font-mono text-gray-200 focus:outline-none"
            />
          </div>
        </div>

        {/* 6. Live Handshake Testing & Discovered Tools Discovery */}
        <div className="pt-2 border-t border-[#30363d] space-y-2">
          <button
            type="button"
            disabled={isTestingMcp}
            onClick={handleTestMcpConnection}
            className={`w-full py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 border transition-all cursor-pointer ${
              isTestingMcp
                ? 'bg-[#21262d] text-gray-400 border-[#30363d] cursor-wait'
                : 'bg-purple-600/20 hover:bg-purple-600/30 text-purple-200 border-purple-500/40 hover:border-purple-500'
            }`}
          >
            {isTestingMcp ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
                <span>Handshaking with MCP Server...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                <span>Test MCP Handshake & List Tools</span>
              </>
            )}
          </button>

          {/* Test Result Display */}
          {mcpTestResult && (
            <div
              className={`p-2.5 rounded-lg border text-[11px] space-y-2 ${
                mcpTestResult.success
                  ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                  : 'bg-rose-950/30 border-rose-500/40 text-rose-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-bold">
                  {mcpTestResult.success ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{mcpTestResult.latencyMs !== undefined ? 'Handshake Succeeded' : 'Persisted Discovered Tools'}</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                      <span>Handshake Failed</span>
                    </>
                  )}
                </div>
                {mcpTestResult.latencyMs !== undefined && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#161b22] text-gray-300 border border-[#30363d]">
                    {mcpTestResult.latencyMs}ms
                  </span>
                )}
              </div>

              {mcpTestResult.serverInfo && (
                <div className="text-[10px] text-gray-300 font-mono">
                  Server: {mcpTestResult.serverInfo.name}{' '}
                  {mcpTestResult.serverInfo.version ? `v${mcpTestResult.serverInfo.version}` : ''}
                </div>
              )}

              {mcpTestResult.error && (
                <div className="text-[10px] text-rose-300 font-mono whitespace-pre-wrap">
                  {mcpTestResult.error}
                </div>
              )}

              {/* Discovered Tools List */}
              {mcpTestResult.success && mcpTestResult.tools.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <div className="text-[10px] font-bold uppercase text-gray-300">
                    Discovered Tools ({mcpTestResult.tools.length})
                  </div>
                  <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                    {mcpTestResult.tools.map((discTool) => {
                      const isExposed =
                        (mcpConfig.exposedTools || ['*']).includes('*') ||
                        (mcpConfig.exposedTools || []).includes(discTool.name);
                      const isAutoApprove = (mcpConfig.autoApproveTools || []).includes(discTool.name);

                      return (
                        <div
                          key={discTool.name}
                          className="p-1.5 rounded bg-[#161b22] border border-[#30363d] space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-bold text-purple-300 text-[10px]">
                              {discTool.name}
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleToggleExposeDiscoveredTool(discTool.name)}
                                className={`px-1.5 py-0.5 rounded text-[9px] font-mono border cursor-pointer ${
                                  isExposed
                                    ? 'bg-purple-600/30 text-purple-200 border-purple-500'
                                    : 'bg-[#0d1117] text-gray-500 border-[#30363d]'
                                }`}
                              >
                                {isExposed ? '✓ Exposed' : 'Hidden'}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleAutoApproveDiscoveredTool(discTool.name)}
                                className={`px-1.5 py-0.5 rounded text-[9px] font-mono border cursor-pointer ${
                                  isAutoApprove
                                    ? 'bg-amber-600/30 text-amber-200 border-amber-500'
                                    : 'bg-[#0d1117] text-gray-500 border-[#30363d]'
                                }`}
                              >
                                {isAutoApprove ? '⚡ Auto' : 'Prompt'}
                              </button>
                            </div>
                          </div>
                          {discTool.description && (
                            <p className="text-[9px] text-gray-400 leading-tight">
                              {discTool.description}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </ToolDrawerShell>
  );
};
