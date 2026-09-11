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
  ShieldCheck,
  Cloud,
  ExternalLink,
  Lock
} from 'lucide-react';
import { ToolDefinition, AgentData, McpToolConfig, McpTransportType } from '../../../types';
import { GOOGLE_CLOUD_MCP_SERVERS } from '../../../data/googleCloudMcpServers';
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
  requiresAuth?: boolean;
  authType?: string;
  authUrl?: string;
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
  onStartOAuthFlow?: (options: {
    authUrl: string;
    tokenUrl?: string;
    clientId?: string;
    clientSecret?: string;
    scopes?: string[];
    secretName?: string;
    envVar?: string;
  }) => Promise<{ success: boolean; bearerToken?: string; tokenPreview?: string; error?: string }>;
  onSaveMcpSecret?: (secretName: string, envVar: string, token: string) => Promise<{ success: boolean; error?: string; tokenPreview?: string }>;
  onGetMcpSecret?: (secretName: string, envVar?: string) => Promise<{ success: boolean; hasToken: boolean; tokenPreview?: string; bearerToken?: string; error?: string }>;
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
  onStartOAuthFlow,
  onSaveMcpSecret,
  onGetMcpSecret,
}) => {
  const [formData, setFormData] = useState<ToolDefinition | null>(null);
  const [newHeaderKey, setNewHeaderKey] = useState('');
  const [newHeaderValue, setNewHeaderValue] = useState('');
  const [newAutoApprovePattern, setNewAutoApprovePattern] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);

  // MCP handshake testing state
  const [isTestingMcp, setIsTestingMcp] = useState(false);
  const [mcpTestResult, setMcpTestResult] = useState<McpHandshakeResult | null>(null);

  // OAuth and Secret management state
  const [manualTokenInput, setManualTokenInput] = useState('');
  const [isAuthorizingOAuth, setIsAuthorizingOAuth] = useState(false);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [isSavingSecret, setIsSavingSecret] = useState(false);
  const [secretSaveMessage, setSecretSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    if (tool) {
      const serverName = tool.mcpConfig?.serverName || tool.name || 'mcp-server';
      const defaultSecretName = serverName.toLowerCase().replace(/[^a-z0-9-]/g, '-') + '-token';
      const defaultEnvVar = serverName.toUpperCase().replace(/[^A-Z0-9_]/g, '_') + '_TOKEN';

      setFormData({
        ...tool,
        type: 'mcp',
        mcpConfig: {
          serverName,
          transport: tool.mcpConfig?.transport || 'http',
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
          secretConfig: {
            secretName: tool.mcpConfig?.secretConfig?.secretName || defaultSecretName,
            envVar: tool.mcpConfig?.secretConfig?.envVar || defaultEnvVar,
            authUrl: tool.mcpConfig?.secretConfig?.authUrl || '',
            tokenUrl: tool.mcpConfig?.secretConfig?.tokenUrl || '',
            clientId: tool.mcpConfig?.secretConfig?.clientId || '',
            clientSecret: tool.mcpConfig?.secretConfig?.clientSecret || '',
            scopes: tool.mcpConfig?.secretConfig?.scopes || [],
            hasToken: tool.mcpConfig?.secretConfig?.hasToken || false,
            tokenPreview: tool.mcpConfig?.secretConfig?.tokenPreview,
            bearerToken: tool.mcpConfig?.secretConfig?.bearerToken,
          },
          discoveredTools: tool.mcpConfig?.discoveredTools || [],
        },
      });

      // Probe existing secret from SecretStorage / .env
      const secretName = tool.mcpConfig?.secretConfig?.secretName || defaultSecretName;
      const envVar = tool.mcpConfig?.secretConfig?.envVar || defaultEnvVar;
      if (onGetMcpSecret && secretName) {
        onGetMcpSecret(secretName, envVar).then((res) => {
          if (res.success && res.hasToken) {
            setFormData((prev) => {
              if (!prev || !prev.mcpConfig) return prev;
              return {
                ...prev,
                mcpConfig: {
                  ...prev.mcpConfig,
                  secretConfig: {
                    ...prev.mcpConfig.secretConfig,
                    secretName,
                    envVar,
                    hasToken: true,
                    tokenPreview: res.tokenPreview,
                    bearerToken: res.bearerToken,
                  },
                },
              };
            });
          }
        });
      }

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
        transport: mcpConfig.transport || 'http',
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

  // OAuth browser flow handler
  const handleStartBrowserOAuth = async () => {
    const rawAuthUrl = (mcpConfig.secretConfig?.authUrl || '').trim();

    if (!rawAuthUrl) {
      setOauthError('Please specify an OAuth Authorization URL before launching browser authentication.');
      return;
    }
    if (!onStartOAuthFlow) {
      setOauthError('OAuth browser flow is not supported in this environment.');
      return;
    }
    setIsAuthorizingOAuth(true);
    setOauthError(null);
    setSecretSaveMessage(null);

    try {
      const defaultSecretName = (mcpConfig.serverName || 'mcp').toLowerCase().replace(/[^a-z0-9-]/g, '-') + '-token';
      const defaultEnvVar = (mcpConfig.serverName || 'mcp').toUpperCase().replace(/[^A-Z0-9_]/g, '_') + '_TOKEN';

      const res = await onStartOAuthFlow({
        authUrl: rawAuthUrl,
        tokenUrl: mcpConfig.secretConfig?.tokenUrl,
        clientId: mcpConfig.secretConfig?.clientId,
        clientSecret: mcpConfig.secretConfig?.clientSecret,
        scopes: mcpConfig.secretConfig?.scopes,
        secretName: mcpConfig.secretConfig?.secretName || defaultSecretName,
        envVar: mcpConfig.secretConfig?.envVar || defaultEnvVar,
      });

      if (res.success && res.bearerToken) {
        handleUpdateMcpConfig({
          secretConfig: {
            ...mcpConfig.secretConfig,
            authUrl: rawAuthUrl,
            secretName: mcpConfig.secretConfig?.secretName || defaultSecretName,
            envVar: mcpConfig.secretConfig?.envVar || defaultEnvVar,
            hasToken: true,
            tokenPreview: res.tokenPreview || '••••••••',
            bearerToken: res.bearerToken,
          },
        });
        setSecretSaveMessage('Token acquired via browser OAuth and securely saved to SecretStorage and .env!');
      } else {
        setOauthError(res.error || 'OAuth authorization flow failed or was cancelled.');
      }
    } catch (err: any) {
      setOauthError(err?.message || 'Error executing OAuth flow');
    } finally {
      setIsAuthorizingOAuth(false);
    }
  };

  // Manual token input handler
  const handleSaveManualToken = async () => {
    if (!manualTokenInput.trim()) return;
    const secretName = mcpConfig.secretConfig?.secretName || (mcpConfig.serverName || 'mcp').toLowerCase() + '-token';
    const envVar = mcpConfig.secretConfig?.envVar || (mcpConfig.serverName || 'mcp').toUpperCase() + '_TOKEN';

    setIsSavingSecret(true);
    setOauthError(null);
    setSecretSaveMessage(null);

    try {
      if (onSaveMcpSecret) {
        const res = await onSaveMcpSecret(secretName, envVar, manualTokenInput.trim());
        if (res.success) {
          handleUpdateMcpConfig({
            secretConfig: {
              ...mcpConfig.secretConfig,
              secretName,
              envVar,
              hasToken: true,
              tokenPreview: res.tokenPreview || '••••••••',
              bearerToken: manualTokenInput.trim(),
            },
          });
          setSecretSaveMessage('Secret token saved to SecretStorage and .env!');
          setManualTokenInput('');
        } else {
          setOauthError(res.error || 'Failed to save secret');
        }
      } else {
        handleUpdateMcpConfig({
          secretConfig: {
            ...mcpConfig.secretConfig,
            secretName,
            envVar,
            hasToken: true,
            tokenPreview: '••••••••',
            bearerToken: manualTokenInput.trim(),
          },
        });
        setSecretSaveMessage('Token saved to configuration');
        setManualTokenInput('');
      }
    } catch (err: any) {
      setOauthError(err?.message || 'Error saving secret token');
    } finally {
      setIsSavingSecret(false);
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
  const gcpServerDef = GOOGLE_CLOUD_MCP_SERVERS.find((s) => s.id === formData.id);
  const isGcpMcp = Boolean(gcpServerDef || formData.category === 'google_cloud_mcp' || formData.id.startsWith('gcp_mcp_'));
  const launchStage = gcpServerDef?.launchStage || mcpConfig.launchStage || 'GA';

  return (
    <ToolDrawerShell
      isOpen={isOpen}
      onClose={onClose}
      toolName={formData.name}
      onChangeName={(name) => handleUpdate({ name, mcpConfig: { ...mcpConfig, serverName: name, transport: 'http' } })}
      namePlaceholder="e.g. BigQuery MCP Server"
      description={formData.description || ''}
      onChangeDescription={(description) => handleUpdate({ description })}
      typeBadge={isGcpMcp ? {
        label: 'Google Cloud MCP',
        subLabel: launchStage,
        color: 'text-sky-400',
        bg: 'bg-sky-500/20',
        border: 'border-sky-500/40',
      } : {
        label: 'MCP Server',
        subLabel: 'Streamable HTTP',
        color: 'text-purple-400',
        bg: 'bg-purple-500/20',
        border: 'border-purple-500/40',
      }}
      toolIcon={isGcpMcp ? <Cloud className="w-4 h-4 text-sky-400" /> : <Server className="w-4 h-4 text-purple-400" />}
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
            {isGcpMcp ? <Cloud className="w-4 h-4 text-sky-400" /> : <Server className="w-4 h-4 text-purple-400" />}
            <span>{isGcpMcp ? 'Google Cloud Remote MCP Server' : 'MCP Server Specification (2024-11-05)'}</span>
          </div>
          <span className={`text-[9px] px-2 py-0.5 rounded border font-mono font-bold ${
            isGcpMcp ? 'bg-sky-500/20 text-sky-300 border-sky-500/30' : 'bg-purple-500/20 text-purple-300 border-purple-500/30'
          }`}>
            {isGcpMcp ? `Remote (${launchStage})` : 'Streamable HTTP'}
          </span>
        </div>

        {/* GCP MCP Info Banner */}
        {isGcpMcp && (
          <div className="bg-sky-950/30 border border-sky-500/30 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cloud className="w-4 h-4 text-sky-400 shrink-0" />
                <span className="text-xs font-semibold text-sky-200">
                  {gcpServerDef?.name || formData.name}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[8.5px] px-1.5 py-0.5 rounded border font-semibold ${
                  launchStage === 'GA' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' :
                  launchStage === 'Preview' ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' :
                  'bg-sky-500/20 text-sky-300 border-sky-500/30'
                }`}>
                  {launchStage}
                </span>
                {(gcpServerDef?.docUrl || formData.docUrl) && (
                  <a
                    href={gcpServerDef?.docUrl || formData.docUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-sky-400 hover:text-sky-200 flex items-center gap-1 hover:underline"
                  >
                    Documentation <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                )}
              </div>
            </div>
            <p className="text-[11px] text-gray-300 leading-relaxed">
              {gcpServerDef?.description || formData.description}
            </p>
          </div>
        )}

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

        {/* 2b. GCP Regional Endpoint Selector */}
        {isGcpMcp && (gcpServerDef?.regionalEndpointPattern || gcpServerDef?.supportedRegions) && (
          <div className="space-y-1.5 pt-2 border-t border-[#30363d]">
            <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400 flex items-center justify-between">
              <span>GCP Regional Endpoint</span>
              <span className="text-[9px] text-sky-400 font-mono">
                {mcpConfig.region || 'global'}
              </span>
            </label>
            <select
              value={mcpConfig.region || ''}
              onChange={(e) => {
                const region = e.target.value;
                let updatedUrl = mcpConfig.serverUrl;
                if (region && gcpServerDef?.regionalEndpointPattern) {
                  updatedUrl = gcpServerDef.regionalEndpointPattern.replace('{region}', region);
                } else if (!region && gcpServerDef) {
                  updatedUrl = gcpServerDef.serverUrl;
                }
                handleUpdateMcpConfig({
                  region: region || undefined,
                  serverUrl: updatedUrl,
                });
              }}
              className="w-full px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-sky-400 rounded text-[11px] text-gray-200 focus:outline-none"
            >
              <option value="">Global / Default ({gcpServerDef?.serverUrl})</option>
              {(gcpServerDef?.supportedRegions || [
                'us-central1',
                'us-east1',
                'us-east4',
                'us-west1',
                'europe-west1',
                'europe-west4',
                'asia-northeast1',
                'asia-southeast1',
              ]).map((reg) => (
                <option key={reg} value={reg}>
                  {reg} {gcpServerDef?.regionalEndpointPattern ? `(${gcpServerDef.regionalEndpointPattern.replace('{region}', reg)})` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* 2c. GCP Toolset Selector */}
        {isGcpMcp && gcpServerDef?.toolsets && gcpServerDef.toolsets.length > 0 && (
          <div className="space-y-1.5 pt-2 border-t border-[#30363d]">
            <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400 flex items-center justify-between">
              <span>Select Preconfigured Toolset</span>
              <span className="text-[9px] text-sky-400 font-mono">
                {mcpConfig.selectedToolset || 'All Tools'}
              </span>
            </label>
            <select
              value={mcpConfig.selectedToolset || ''}
              onChange={(e) => {
                const selectedToolset = e.target.value;
                const toolsetDef = gcpServerDef?.toolsets?.find((ts) => ts.name === selectedToolset);
                handleUpdateMcpConfig({
                  selectedToolset: selectedToolset || undefined,
                  exposedTools: toolsetDef ? toolsetDef.tools : ['*'],
                });
              }}
              className="w-full px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-sky-400 rounded text-[11px] text-gray-200 focus:outline-none"
            >
              <option value="">All Tools (*)</option>
              {gcpServerDef.toolsets.map((ts) => (
                <option key={ts.name} value={ts.name}>
                  {ts.name}: {ts.description}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* 3. Authentication Provider & Headers */}
        <div className="space-y-2 pt-2 border-t border-[#30363d]">
          <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400 flex items-center justify-between">
            <span>Authentication Provider</span>
            <span className="text-[9px] text-purple-400 font-mono">IAM / OAuth</span>
          </label>

          <div className="grid grid-cols-3 gap-2">
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
              <ShieldCheck className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span className="truncate">Google ADC</span>
            </button>

            <button
              type="button"
              onClick={() => handleUpdateMcpConfig({ authProviderType: 'bearer_token' })}
              className={`py-1.5 px-2 rounded-md text-[11px] font-medium border text-left flex items-center gap-1.5 cursor-pointer transition-colors ${
                mcpConfig.authProviderType === 'bearer_token'
                  ? 'bg-amber-600/30 text-amber-200 border-amber-500 shadow-xs'
                  : 'bg-[#161b22] text-gray-400 border-[#30363d] hover:bg-[#21262d] hover:text-gray-200'
              }`}
            >
              <Key className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="truncate">OAuth / Secret</span>
            </button>

            <button
              type="button"
              onClick={() => handleUpdateMcpConfig({ authProviderType: 'none' })}
              className={`py-1.5 px-2 rounded-md text-[11px] font-medium border text-left flex items-center gap-1.5 cursor-pointer transition-colors ${
                mcpConfig.authProviderType === 'none'
                  ? 'bg-purple-600/30 text-white border-purple-500 shadow-xs'
                  : 'bg-[#161b22] text-gray-400 border-[#30363d] hover:bg-[#21262d] hover:text-gray-200'
              }`}
            >
              <Lock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <span className="truncate">None / Headers</span>
            </button>
          </div>

          {/* Custom Headers Config / Public Endpoint note */}
          {(!mcpConfig.authProviderType || mcpConfig.authProviderType === 'none') && (
            <div className="space-y-1.5 pt-1">
              <div className="p-2 bg-[#161b22] border border-[#30363d] rounded text-[10px] text-gray-400 leading-relaxed">
                <strong className="text-gray-200">Public or Custom Auth:</strong> For public MCP servers that require no credentials, leave headers empty and test the connection directly below. For custom API keys or static tokens, add headers below.
              </div>
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

              {mcpConfig.authProviderType === 'bearer_token' && (
                <div className="p-3 bg-amber-950/20 border border-amber-500/30 rounded-lg space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Key className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                      <div>
                        <div className="text-[11px] font-semibold text-amber-200">
                          OAuth 2.0 & Bearer Token Secret
                        </div>
                        <div className="text-[10px] text-gray-400">
                          Tokens are stored locally in SecretStorage & <code className="text-amber-300">.env</code>, and deployed via Google Secret Manager.
                        </div>
                      </div>
                    </div>
                    {mcpConfig.secretConfig?.hasToken ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-mono font-medium bg-emerald-950 text-emerald-300 border border-emerald-500/40 shrink-0">
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span>Saved: {mcpConfig.secretConfig.tokenPreview || '••••••••'}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-mono font-medium bg-amber-950 text-amber-300 border border-amber-500/40 shrink-0">
                        <span>No Token Saved</span>
                      </span>
                    )}
                  </div>

                  {/* Secret Name and Env Var */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase font-bold tracking-tight text-amber-300 flex items-center justify-between">
                        <span>Secret Name</span>
                        <span className="text-[8px] text-gray-500">Secret Manager</span>
                      </label>
                      <input
                        type="text"
                        value={mcpConfig.secretConfig?.secretName || ''}
                        onChange={(e) =>
                          handleUpdateMcpConfig({
                            secretConfig: {
                              ...mcpConfig.secretConfig,
                              secretName: e.target.value,
                            },
                          })
                        }
                        placeholder="e.g. slack-mcp-token"
                        className="w-full px-2 py-1 bg-[#161b22] border border-amber-500/40 focus:border-amber-400 rounded text-[10px] font-mono text-amber-200 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase font-bold tracking-tight text-amber-300 flex items-center justify-between">
                        <span>Env Var Name</span>
                        <span className="text-[8px] text-gray-500">Container</span>
                      </label>
                      <input
                        type="text"
                        value={mcpConfig.secretConfig?.envVar || ''}
                        onChange={(e) =>
                          handleUpdateMcpConfig({
                            secretConfig: {
                              ...mcpConfig.secretConfig,
                              envVar: e.target.value,
                            },
                          })
                        }
                        placeholder="e.g. SLACK_MCP_TOKEN"
                        className="w-full px-2 py-1 bg-[#161b22] border border-amber-500/40 focus:border-amber-400 rounded text-[10px] font-mono text-amber-200 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Browser OAuth Handshake */}
                  <div className="p-2.5 bg-[#161b22] border border-[#30363d] rounded space-y-2">
                    <div className="text-[10px] font-bold text-gray-300 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
                        <span>Option A: Browser OAuth 2.0 Authorization</span>
                      </div>
                    </div>
                    <div className="text-[9px] text-gray-400">
                      Launches your default browser to authorize the MCP server, intercepting the callback on an ephemeral loopback port.
                    </div>
                    <div className="space-y-2">
                      {/* Authorization URL */}
                      <div>
                        <label className="text-[9px] uppercase font-bold tracking-tight text-gray-400 block mb-1">
                          Authorization URL <span className="text-amber-400">*</span>
                        </label>
                        <input
                          type="text"
                          value={mcpConfig.secretConfig?.authUrl || ''}
                          onChange={(e) =>
                            handleUpdateMcpConfig({
                              secretConfig: {
                                ...mcpConfig.secretConfig,
                                authUrl: e.target.value,
                              },
                            })
                          }
                          placeholder="e.g. https://slack.com/oauth/v2/authorize"
                          className="w-full px-2 py-1 bg-[#0d1117] border border-[#30363d] focus:border-amber-400 rounded text-[10px] font-mono text-gray-200 focus:outline-none"
                        />
                      </div>

                      {/* Token Exchange URL */}
                      <div>
                        <label className="text-[9px] uppercase font-bold tracking-tight text-gray-400 block mb-1">
                          Token Exchange URL <span className="text-gray-500 font-normal">(for authorization code exchange)</span>
                        </label>
                        <input
                          type="text"
                          value={mcpConfig.secretConfig?.tokenUrl || ''}
                          onChange={(e) =>
                            handleUpdateMcpConfig({
                              secretConfig: {
                                ...mcpConfig.secretConfig,
                                tokenUrl: e.target.value,
                              },
                            })
                          }
                          placeholder="e.g. https://slack.com/api/oauth.v2.access"
                          className="w-full px-2 py-1 bg-[#0d1117] border border-[#30363d] focus:border-amber-400 rounded text-[10px] font-mono text-gray-200 focus:outline-none"
                        />
                      </div>

                      {/* Client ID & Client Secret in 2-column grid */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[9px] uppercase font-bold tracking-tight text-gray-400 block mb-1">
                            Client ID
                          </label>
                          <input
                            type="text"
                            value={mcpConfig.secretConfig?.clientId || ''}
                            onChange={(e) =>
                              handleUpdateMcpConfig({
                                secretConfig: {
                                  ...mcpConfig.secretConfig,
                                  clientId: e.target.value,
                                },
                              })
                            }
                            placeholder="Client ID"
                            className="w-full px-2 py-1 bg-[#0d1117] border border-[#30363d] focus:border-amber-400 rounded text-[10px] font-mono text-gray-200 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] uppercase font-bold tracking-tight text-gray-400 block mb-1">
                            Client Secret
                          </label>
                          <input
                            type="password"
                            value={mcpConfig.secretConfig?.clientSecret || ''}
                            onChange={(e) =>
                              handleUpdateMcpConfig({
                                secretConfig: {
                                  ...mcpConfig.secretConfig,
                                  clientSecret: e.target.value,
                                },
                              })
                            }
                            placeholder="••••••••••••"
                            className="w-full px-2 py-1 bg-[#0d1117] border border-[#30363d] focus:border-amber-400 rounded text-[10px] font-mono text-gray-200 focus:outline-none"
                          />
                        </div>
                      </div>

                      {/* Optional Scopes */}
                      <div>
                        <label className="text-[9px] uppercase font-bold tracking-tight text-gray-400 block mb-1">
                          Scopes <span className="text-gray-500 font-normal">(optional, comma-separated)</span>
                        </label>
                        <input
                          type="text"
                          value={(mcpConfig.secretConfig?.scopes || []).join(', ')}
                          onChange={(e) => {
                            const raw = e.target.value;
                            const parsedScopes = raw
                              .split(/[,\s]+/)
                              .map((s) => s.trim())
                              .filter(Boolean);
                            handleUpdateMcpConfig({
                              secretConfig: {
                                ...mcpConfig.secretConfig,
                                scopes: parsedScopes,
                              },
                            });
                          }}
                          placeholder="e.g. chat:write, channels:read"
                          className="w-full px-2 py-1 bg-[#0d1117] border border-[#30363d] focus:border-amber-400 rounded text-[10px] font-mono text-gray-200 focus:outline-none"
                        />
                      </div>

                      {/* Authorize in Browser action button */}
                      <div className="pt-1">
                        {(() => {
                          const hasAuthUrl = Boolean(mcpConfig.secretConfig?.authUrl && mcpConfig.secretConfig.authUrl.trim());
                          return (
                            <button
                              type="button"
                              disabled={isAuthorizingOAuth || !hasAuthUrl}
                              onClick={handleStartBrowserOAuth}
                              title={!hasAuthUrl ? 'Enter an Authorization URL above to enable browser authorization' : 'Authorize in Browser'}
                              className={`w-full py-1.5 px-3 rounded text-[10px] font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                                isAuthorizingOAuth
                                  ? 'bg-[#21262d] text-gray-400 cursor-wait border border-[#30363d]'
                                  : !hasAuthUrl
                                  ? 'bg-[#21262d] text-gray-500 border border-[#30363d] cursor-not-allowed opacity-60'
                                  : 'bg-amber-600 hover:bg-amber-500 text-white shadow-xs cursor-pointer'
                              }`}
                            >
                              {isAuthorizingOAuth ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  <span>Waiting for Browser Authorization...</span>
                                </>
                              ) : (
                                <>
                                  <ExternalLink className="w-3.5 h-3.5" />
                                  <span>Authorize in Browser</span>
                                </>
                              )}
                            </button>
                          );
                        })()}
                      </div>

                      {!mcpConfig.secretConfig?.authUrl?.trim() && (
                        <div className="text-[9px] text-amber-400/90 italic flex items-center gap-1">
                          <span>Enter an OAuth 2.0 Authorization URL above to enable browser authorization.</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Manual Token Entry */}
                  <div className="p-2.5 bg-[#161b22] border border-[#30363d] rounded space-y-2">
                    <div className="text-[10px] font-bold text-gray-300 flex items-center gap-1.5">
                      <Key className="w-3.5 h-3.5 text-gray-400" />
                      <span>Option B: Enter Bearer / Bot Token Manually</span>
                    </div>
                    <div className="text-[9px] text-gray-400">
                      Paste a pre-generated Bearer token or API key:
                    </div>
                    <div className="flex gap-1.5">
                      <input
                        type="password"
                        value={manualTokenInput}
                        onChange={(e) => setManualTokenInput(e.target.value)}
                        placeholder="Paste bearer token..."
                        className="flex-1 px-2 py-1 bg-[#0d1117] border border-[#30363d] focus:border-amber-400 rounded text-[10px] font-mono text-gray-200 focus:outline-none"
                      />
                      <button
                        type="button"
                        disabled={isSavingSecret || !manualTokenInput.trim()}
                        onClick={handleSaveManualToken}
                        className={`px-3 py-1 rounded text-[10px] font-medium cursor-pointer transition-colors ${
                          isSavingSecret
                            ? 'bg-[#21262d] text-gray-400 cursor-wait'
                            : 'bg-[#21262d] hover:bg-[#30363d] text-amber-300 border border-amber-500/40'
                        }`}
                      >
                        {isSavingSecret ? 'Saving...' : 'Save Secret'}
                      </button>
                    </div>
                  </div>

                  {/* Feedback Messages */}
                  {secretSaveMessage && (
                    <div className="p-2 bg-emerald-950/40 border border-emerald-500/40 rounded text-[10px] text-emerald-300 flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>{secretSaveMessage}</span>
                    </div>
                  )}
                  {oauthError && (
                    <div className="p-2 bg-rose-950/40 border border-rose-500/40 rounded text-[10px] text-rose-300 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      <span>{oauthError}</span>
                    </div>
                  )}
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

              {mcpTestResult.requiresAuth && (
                <div className="p-2 bg-amber-950/60 border border-amber-500/50 rounded space-y-1.5">
                  <div className="flex items-center gap-1.5 text-amber-300 font-bold">
                    <Key className="w-3.5 h-3.5 text-amber-400" />
                    <span>Authentication Required (HTTP 401/403)</span>
                  </div>
                  <div className="text-[10px] text-amber-200/90 leading-tight">
                    This remote MCP server requires an authenticated Bearer token or OAuth 2.0 handshake before listing tools.
                  </div>
                  {mcpConfig.authProviderType !== 'bearer_token' && (
                    <button
                      type="button"
                      onClick={() =>
                        handleUpdateMcpConfig({
                          authProviderType: 'bearer_token',
                          secretConfig: {
                            ...mcpConfig.secretConfig,
                            authUrl: mcpTestResult.authUrl || mcpConfig.secretConfig?.authUrl || mcpConfig.serverUrl || '',
                            secretName:
                              mcpConfig.secretConfig?.secretName ||
                              (mcpConfig.serverName || 'mcp').toLowerCase().replace(/[^a-z0-9-]/g, '-') + '-token',
                            envVar:
                              mcpConfig.secretConfig?.envVar ||
                              (mcpConfig.serverName || 'mcp').toUpperCase().replace(/[^A-Z0-9_]/g, '_') + '_TOKEN',
                          },
                        })
                      }
                      className="mt-1 px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-[10px] font-semibold cursor-pointer transition-colors"
                    >
                      Configure OAuth / Bearer Secret
                    </button>
                  )}
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
