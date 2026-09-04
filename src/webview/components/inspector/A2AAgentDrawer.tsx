/**
 * A2AAgentDrawer - Inspector Drawer for Agent-to-Agent (A2A) Autonomous Nodes
 * 
 * Purpose:
 * Provides configuration drawer for A2A protocols, communication channels,
 * peer delegation patterns, and handshake configurations.
 * 
 * Architectural Decisions:
 * - Author: Mike Nimer <mikenimer@google.com>
 * - Peer Delegation Section: Conditionally hidden when subAgents.length === 0.
 * - Pattern Options: Unified with Google ADK orchestration patterns (Sequential, Parallel, Loop, Coordinator).
 * - Loop Configuration: Provides numeric Max Iterations bound (defaulting to 3) when Loop pattern is active.
 * - Synchronization: Keeps peer agent list and order strictly identical with the canvas node card.
 */

import React, { useState } from 'react';
import { 
  Share2, 
  X, 
  Globe, 
  Sparkles, 
  ShieldCheck, 
  Layers, 
  GripVertical, 
  ChevronUp, 
  ChevronDown, 
  Plus, 
  Check, 
  Code2, 
  Network,
  Key,
  Lock,
  FileJson,
  RefreshCw,
  Sliders,
  Clock,
  AlertCircle,
  Link,
  Cpu,
  Layers3,
  Play,
  Bot,
  GitBranch,
  Scale
} from 'lucide-react';
import { 
  AgentData, 
  DelegationPattern, 
  SubAgentRef, 
  A2AConfig, 
  A2AAuthType, 
  AgentKind, 
  StructuredOutputSchema, 
  DebateConfig, 
  DebateStyle, 
  TieBreakerStrategy,
  ADK_DELEGATION_PATTERNS 
} from '../../types';
import { StructuredOutputBuilder } from './StructuredOutputBuilder';

interface A2AAgentDrawerProps {
  agent: AgentData;
  allAgents: AgentData[];
  onClose: () => void;
  onUpdateAgent: (updatedData: Partial<AgentData>) => void;
}

const SUPPORTED_MODELS = [
  { id: 'gemini-flash-latest', name: 'Gemini Flash (Latest)', desc: 'Fast, lightweight, sub-second multimodal reasoning' },
];

const PATTERN_OPTIONS = ADK_DELEGATION_PATTERNS;

const PRESET_CAPABILITIES = [
  'schema_negotiation',
  'task_handoff',
  'streaming_artifacts',
  'state_synchronization',
  'evaluation_handshake',
  'rag_vector_query',
  'code_execution_sandbox',
  'human_in_the_loop',
];

const DEFAULT_SAMPLE_PACK = (name: string, endpoint: string) => JSON.stringify({
  "$schema": "https://a2a-protocol.org/schemas/v1/agent-card.json",
  "name": name || "Data Analysis Peer Agent",
  "description": "Specialized A2A agent for statistical computation and data transformations.",
  "version": "1.0.0",
  "endpoint": endpoint || "https://api.agent-network.internal/a2a/v1",
  "protocol": {
    "version": "1.0.0-a2a",
    "transport": "jsonrpc-2.0+http"
  },
  "authentication": {
    "type": "bearer",
    "token_env": "A2A_AGENT_AUTH_TOKEN"
  },
  "capabilities": [
    "schema_negotiation",
    "task_handoff",
    "streaming_artifacts"
  ],
  "interfaces": [
    {
      "method": "execute_task",
      "params": {
        "task_id": "string",
        "input_data": "object",
        "context": "object"
      },
      "returns": "object"
    }
  ]
}, null, 2);

export const A2AAgentDrawer: React.FC<A2AAgentDrawerProps> = ({
  agent,
  allAgents,
  onClose,
  onUpdateAgent,
}) => {
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [newCapInput, setNewCapInput] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [jsonSuccess, setJsonSuccess] = useState(false);
  const [newHeaderKey, setNewHeaderKey] = useState('');
  const [newHeaderVal, setNewHeaderVal] = useState('');

  const subAgents = agent.subAgents || [];
  const currentPattern: DelegationPattern = agent.subAgentPattern || 'parallel';
  
  const a2aConfig: A2AConfig = {
    connectionMode: agent.a2aConfig?.connectionMode || 'url',
    endpoint: agent.a2aConfig?.endpoint || 'https://api.agent-network.internal/a2a/v1',
    protocolVersion: agent.a2aConfig?.protocolVersion || '1.0.0-a2a',
    agentCardUrl: agent.a2aConfig?.agentCardUrl || '/.well-known/agent-card.json',
    rawJsonPack: agent.a2aConfig?.rawJsonPack || DEFAULT_SAMPLE_PACK(agent.label, agent.a2aConfig?.endpoint || 'https://api.agent-network.internal/a2a/v1'),
    authType: agent.a2aConfig?.authType || 'bearer',
    authTokenSecret: agent.a2aConfig?.authTokenSecret || 'A2A_AGENT_AUTH_TOKEN',
    headerName: agent.a2aConfig?.headerName || 'Authorization',
    oauth2Config: agent.a2aConfig?.oauth2Config || {
      tokenUrl: 'https://auth.company.internal/oauth/v2/token',
      clientId: 'agent-service-client',
      clientSecretEnv: 'A2A_OAUTH_CLIENT_SECRET',
      scope: 'agent.invoke agent.artifacts',
      audience: 'https://api.agent-network.internal/a2a',
    },
    googleIamConfig: agent.a2aConfig?.googleIamConfig || {
      targetAudience: 'https://agent-service-731465797158.us-central1.run.app',
      serviceAccountEnv: 'GOOGLE_APPLICATION_CREDENTIALS',
    },
    customHeaders: agent.a2aConfig?.customHeaders || {
      'X-Agent-Protocol': 'a2a-v1',
      'X-Target-Schema': 'application/vnd.a2a.v1+json',
    },
    timeoutSeconds: agent.a2aConfig?.timeoutSeconds || 30,
    maxRetries: agent.a2aConfig?.maxRetries || 3,
    capabilities: agent.a2aConfig?.capabilities || ['schema_negotiation', 'task_handoff', 'streaming_artifacts'],
  };

  const descriptionValue = agent.systemPrompt ?? '';

  const handleUpdateConfig = (partial: Partial<A2AConfig>) => {
    onUpdateAgent({
      a2aConfig: {
        ...a2aConfig,
        ...partial,
      },
    });
  };

  const handleMoveSubAgent = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= subAgents.length) return;
    const reordered = [...subAgents];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    onUpdateAgent({ subAgents: reordered });
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIdx(index);
    e.dataTransfer.setData('text/plain', index.toString());
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIdx !== null && draggedIdx !== index) {
      setDragOverIdx(index);
    }
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIdx !== null && draggedIdx !== dropIndex) {
      handleMoveSubAgent(draggedIdx, dropIndex);
    }
    setDraggedIdx(null);
    setDragOverIdx(null);
  };

  const handleRemoveSubAgent = (agentId: string) => {
    const updated = subAgents.filter((s) => s.agentId !== agentId);
    onUpdateAgent({ subAgents: updated });
  };

  const handleDescriptionChange = (newDescription: string) => {
    const firstSentence = newDescription.split('\n')[0].trim();
    onUpdateAgent({
      systemPrompt: newDescription,
      role: firstSentence || agent.role || 'A2A Protocol Autonomous Agent',
    });
  };

  const handleToggleCapability = (cap: string) => {
    const currentCaps = a2aConfig.capabilities || [];
    const updated = currentCaps.includes(cap)
      ? currentCaps.filter((c) => c !== cap)
      : [...currentCaps, cap];
    handleUpdateConfig({ capabilities: updated });
  };

  const handleAddCustomCapability = () => {
    if (!newCapInput.trim()) return;
    const cap = newCapInput.trim().toLowerCase().replace(/\s+/g, '_');
    const currentCaps = a2aConfig.capabilities || [];
    if (!currentCaps.includes(cap)) {
      handleUpdateConfig({ capabilities: [...currentCaps, cap] });
    }
    setNewCapInput('');
  };

  const handleAddHeader = () => {
    if (!newHeaderKey.trim()) return;
    const headers = { ...(a2aConfig.customHeaders || {}) };
    headers[newHeaderKey.trim()] = newHeaderVal.trim();
    handleUpdateConfig({ customHeaders: headers });
    setNewHeaderKey('');
    setNewHeaderVal('');
  };

  const handleRemoveHeader = (key: string) => {
    const headers = { ...(a2aConfig.customHeaders || {}) };
    delete headers[key];
    handleUpdateConfig({ customHeaders: headers });
  };

  const handleParseAndApplyJsonPack = () => {
    setJsonError(null);
    setJsonSuccess(false);
    try {
      const parsed = JSON.parse(a2aConfig.rawJsonPack || '{}');
      
      const newLabel = parsed.name || agent.label;
      const newEndpoint = parsed.endpoint || a2aConfig.endpoint;
      const newProtocol = parsed.protocol?.version || a2aConfig.protocolVersion;
      const newCaps = Array.isArray(parsed.capabilities) ? parsed.capabilities : a2aConfig.capabilities;
      const newDescription = parsed.description || descriptionValue;
      const newAuthType: A2AAuthType = parsed.authentication?.type || a2aConfig.authType;
      const newSecret = parsed.authentication?.token_env || a2aConfig.authTokenSecret;

      onUpdateAgent({
        label: newLabel,
        systemPrompt: newDescription,
        role: newDescription.split('\n')[0],
        a2aConfig: {
          ...a2aConfig,
          endpoint: newEndpoint,
          protocolVersion: newProtocol,
          capabilities: newCaps,
          authType: newAuthType,
          authTokenSecret: newSecret,
        },
      });

      setJsonSuccess(true);
      setTimeout(() => setJsonSuccess(false), 3000);
    } catch (err: any) {
      setJsonError(err?.message || 'Invalid JSON syntax. Please check formatting.');
    }
  };

  const handleSyncFromFormToJson = () => {
    const pack = {
      "$schema": "https://a2a-protocol.org/schemas/v1/agent-card.json",
      "name": agent.label,
      "description": descriptionValue || "Specialized A2A agent for task delegation and capability execution.",
      "version": "1.0.0",
      "endpoint": a2aConfig.endpoint,
      "protocol": {
        "version": a2aConfig.protocolVersion,
        "transport": "jsonrpc-2.0+http"
      },
      "agent_card_url": a2aConfig.agentCardUrl,
      "authentication": {
        "type": a2aConfig.authType,
        "token_env": a2aConfig.authTokenSecret,
        "header_name": a2aConfig.headerName,
        ...(a2aConfig.authType === 'oauth2' ? { oauth2: a2aConfig.oauth2Config } : {}),
        ...(a2aConfig.authType === 'google_iam' ? { google_iam: a2aConfig.googleIamConfig } : {}),
      },
      "capabilities": a2aConfig.capabilities,
      "runtime": {
        "timeout_seconds": a2aConfig.timeoutSeconds,
        "max_retries": a2aConfig.maxRetries,
        "headers": a2aConfig.customHeaders,
      }
    };
    handleUpdateConfig({ rawJsonPack: JSON.stringify(pack, null, 2) });
  };

  return (
    <div className="absolute top-0 right-0 bottom-0 z-30 w-96 backdrop-blur-2xl bg-[#161b22]/95 border-l border-[#30363d] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200 text-[#c9d1d9]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 bg-[#161b22] border-b border-[#30363d] shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 rounded-lg bg-[#0d1117] border border-cyan-500/40 text-cyan-400 shrink-0 shadow-xs">
            <Share2 className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-bold text-white truncate max-w-[200px]">
              {agent.label}
            </h3>
            <span className="text-[10px] text-cyan-400 font-mono flex items-center gap-1">
              A2A Protocol Node Properties
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-gray-400 hover:text-white hover:bg-[#30363d] transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Form Body */}
      <div className="flex-1 p-4 space-y-4 overflow-y-auto text-xs text-gray-300">
        {/* Node Label / Identifier */}
        <div className="space-y-1">
          <label className="text-[11px] font-bold uppercase tracking-tight text-gray-400">
            A2A Agent Display Name
          </label>
          <input
            type="text"
            value={agent.label}
            onChange={(e) => onUpdateAgent({ label: e.target.value })}
            className="w-full px-3 py-1.5 bg-[#0d1117] border border-[#30363d] focus:border-cyan-400 rounded-lg text-xs text-white focus:outline-none"
          />
        </div>

        {/* Agent Description (Published Capability / Intent Description for Parent Agent) */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold uppercase tracking-tight text-cyan-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>Agent Description</span>
            </label>
            <span className="text-[10px] text-gray-400 font-mono">
              {descriptionValue.length} chars • {descriptionValue.split(/\s+/).filter(Boolean).length} words
            </span>
          </div>

          <div className="relative group">
            <textarea
              rows={5}
              value={descriptionValue}
              onChange={(e) => handleDescriptionChange(e.target.value)}
              placeholder="Add agent instructions"
              className="w-full min-h-[120px] max-h-[380px] px-3 py-2 bg-[#0d1117] border border-[#30363d] focus:border-cyan-400 rounded-lg text-xs text-gray-200 focus:outline-none resize-y font-mono leading-relaxed selection:bg-cyan-900 selection:text-white"
            />
            <div className="text-[10px] text-gray-400 mt-1 flex items-center justify-between">
              <span>Published capability description used by parent agent / router to invoke this agent</span>
              <span className="text-[9px] font-mono text-gray-400">↕ Drag corner to expand</span>
            </div>
          </div>
        </div>

        {/* STRUCTURED OUTPUT SCHEMA BUILDER */}
        <StructuredOutputBuilder
          schema={agent.structuredOutput}
          agentLabel={agent.label}
          onChange={(newSchema: StructuredOutputSchema) => {
            onUpdateAgent({
              structuredOutput: newSchema,
              outputFormat: newSchema.enabled ? 'structured' : 'text',
            });
          }}
        />

        {/* Underlying LLM Engine */}
        <div className="space-y-1">
          <label className="text-[11px] font-bold uppercase tracking-tight text-gray-400 flex items-center gap-1">
            <Cpu className="w-3 h-3 text-cyan-400" />
            Underlying LLM Engine
          </label>
          <select
            value={agent.model || 'gemini-flash-latest'}
            onChange={(e) => onUpdateAgent({ model: e.target.value })}
            className="w-full px-3 py-1.5 bg-[#0d1117] border border-[#30363d] focus:border-cyan-400 rounded-lg text-xs text-white focus:outline-none cursor-pointer"
          >
            {SUPPORTED_MODELS.map((m) => (
              <option key={m.id} value={m.id} className="bg-[#161b22]">
                {m.name} ({m.id})
              </option>
            ))}
          </select>
        </div>

        {/* SECTION 1: A2A Connection Method (URL vs. JSON Agent Card Pack) */}
        <div className="p-3 bg-[#0d1117] rounded-lg border border-cyan-500/30 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-cyan-400 font-bold text-xs">
              <Globe className="w-3.5 h-3.5" />
              <span>A2A Connection Details</span>
            </div>
            <div className="flex items-center bg-[#161b22] p-0.5 rounded-md border border-[#30363d] text-[10px]">
              <button
                type="button"
                onClick={() => handleUpdateConfig({ connectionMode: 'url' })}
                className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
                  a2aConfig.connectionMode === 'url'
                    ? 'bg-cyan-600 text-white font-bold'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                Endpoint URL
              </button>
              <button
                type="button"
                onClick={() => {
                  handleSyncFromFormToJson();
                  handleUpdateConfig({ connectionMode: 'json_pack' });
                }}
                className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
                  a2aConfig.connectionMode === 'json_pack'
                    ? 'bg-cyan-600 text-white font-bold'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                JSON Card Pack
              </button>
            </div>
          </div>

          {/* Mode A: Direct URL Connection Mode */}
          {a2aConfig.connectionMode === 'url' ? (
            <div className="space-y-2.5">
              {/* RPC Endpoint URL */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400 flex items-center justify-between">
                  <span>RPC Endpoint URL (Agent Service)</span>
                  <span className="text-[9px] text-cyan-400 font-mono">POST / JSON-RPC</span>
                </label>
                <input
                  type="text"
                  value={a2aConfig.endpoint}
                  onChange={(e) => handleUpdateConfig({ endpoint: e.target.value })}
                  placeholder="https://api.agent-network.internal/a2a/v1"
                  className="w-full px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-cyan-400 rounded text-[11px] font-mono text-cyan-300 focus:outline-none"
                />
              </div>

              {/* Protocol Version & Agent Card Discovery URL */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400">
                    Protocol Spec
                  </label>
                  <input
                    type="text"
                    value={a2aConfig.protocolVersion}
                    onChange={(e) => handleUpdateConfig({ protocolVersion: e.target.value })}
                    className="w-full px-2 py-1 bg-[#161b22] border border-[#30363d] focus:border-cyan-400 rounded text-[11px] font-mono text-gray-200 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400">
                    Discovery URL
                  </label>
                  <input
                    type="text"
                    value={a2aConfig.agentCardUrl}
                    onChange={(e) => handleUpdateConfig({ agentCardUrl: e.target.value })}
                    placeholder="/.well-known/agent-card.json"
                    className="w-full px-2 py-1 bg-[#161b22] border border-[#30363d] focus:border-cyan-400 rounded text-[11px] font-mono text-gray-200 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          ) : (
            /* Mode B: Paste / Import Raw JSON Pack Mode */
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[10px] text-gray-400">
                <span>Paste A2A Agent Card Pack (JSON)</span>
                <button
                  type="button"
                  onClick={handleSyncFromFormToJson}
                  className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-mono cursor-pointer"
                >
                  <RefreshCw className="w-2.5 h-2.5" />
                  Regenerate from current form
                </button>
              </div>

              <textarea
                rows={8}
                value={a2aConfig.rawJsonPack || ''}
                onChange={(e) => {
                  handleUpdateConfig({ rawJsonPack: e.target.value });
                  setJsonError(null);
                }}
                placeholder="Paste agent-card.json pack..."
                className="w-full px-2.5 py-2 bg-[#161b22] border border-[#30363d] focus:border-cyan-400 rounded font-mono text-[10px] text-cyan-200 focus:outline-none resize-y leading-tight"
              />

              {jsonError && (
                <div className="flex items-center gap-1 text-[10px] text-rose-400 bg-rose-950/40 p-1.5 rounded border border-rose-500/30">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  <span>{jsonError}</span>
                </div>
              )}

              {jsonSuccess && (
                <div className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-950/40 p-1.5 rounded border border-emerald-500/30">
                  <Check className="w-3 h-3 shrink-0" />
                  <span>Agent properties successfully parsed and applied!</span>
                </div>
              )}

              <button
                type="button"
                onClick={handleParseAndApplyJsonPack}
                className="w-full py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded font-medium text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              >
                <FileJson className="w-3.5 h-3.5" />
                <span>Parse & Apply JSON Card Pack</span>
              </button>
            </div>
          )}
        </div>

        {/* SECTION 2: Sub-Agent Authentication & Security Configuration */}
        <div className="p-3 bg-[#0d1117] rounded-lg border border-cyan-500/30 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-cyan-400 font-bold text-xs">
              <Key className="w-3.5 h-3.5" />
              <span>Sub-Agent Invocation Authentication</span>
            </div>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-950/70 text-cyan-300 font-mono border border-cyan-500/30">
              Parent-to-Sub Auth
            </span>
          </div>

          <p className="text-[10px] text-gray-400 leading-normal">
            Specifies how the orchestrator or parent agent authorizes requests when invoking this A2A agent as a sub-agent.
          </p>

          {/* Authentication Mechanism Selector */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400">
              Authentication Method
            </label>
            <select
              value={a2aConfig.authType}
              onChange={(e) => handleUpdateConfig({ authType: e.target.value as A2AAuthType })}
              className="w-full px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-cyan-400 rounded text-xs text-gray-200 focus:outline-none cursor-pointer"
            >
              <option value="bearer">Bearer Token (JWT / API Secret)</option>
              <option value="oauth2">OAuth2 Client Credentials (OIDC)</option>
              <option value="google_iam">Google Cloud IAM / Workload Identity</option>
              <option value="api_key">Custom API Key Header</option>
              <option value="mutual_tls">Mutual TLS (mTLS)</option>
              <option value="none">Open Schema / No Auth (Internal VPC)</option>
            </select>
          </div>

          {/* Conditional Auth Fields based on selected Auth Type */}
          {a2aConfig.authType === 'bearer' && (
            <div className="space-y-2 pt-1 border-t border-[#30363d]/60">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400">
                  Token Secret Env Var Name
                </label>
                <input
                  type="text"
                  value={a2aConfig.authTokenSecret || ''}
                  onChange={(e) => handleUpdateConfig({ authTokenSecret: e.target.value })}
                  placeholder="A2A_AGENT_AUTH_TOKEN"
                  className="w-full px-2 py-1 bg-[#161b22] border border-[#30363d] focus:border-cyan-400 rounded text-[11px] font-mono text-cyan-300 focus:outline-none"
                />
              </div>
              <div className="text-[10px] text-gray-400 font-mono bg-[#161b22] p-1.5 rounded border border-[#30363d]">
                Header: <span className="text-cyan-300">Authorization: Bearer ${'{'}{a2aConfig.authTokenSecret || 'TOKEN'}{'}'}</span>
              </div>
            </div>
          )}

          {a2aConfig.authType === 'oauth2' && (
            <div className="space-y-2 pt-1 border-t border-[#30363d]/60">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400">
                  OAuth2 Token Endpoint URL
                </label>
                <input
                  type="text"
                  value={a2aConfig.oauth2Config?.tokenUrl || ''}
                  onChange={(e) =>
                    handleUpdateConfig({
                      oauth2Config: { ...a2aConfig.oauth2Config, tokenUrl: e.target.value },
                    })
                  }
                  placeholder="https://auth.example.com/oauth/v2/token"
                  className="w-full px-2 py-1 bg-[#161b22] border border-[#30363d] focus:border-cyan-400 rounded text-[10px] font-mono text-cyan-300 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400">
                    Client ID
                  </label>
                  <input
                    type="text"
                    value={a2aConfig.oauth2Config?.clientId || ''}
                    onChange={(e) =>
                      handleUpdateConfig({
                        oauth2Config: { ...a2aConfig.oauth2Config, clientId: e.target.value },
                      })
                    }
                    placeholder="agent-client-id"
                    className="w-full px-2 py-1 bg-[#161b22] border border-[#30363d] focus:border-cyan-400 rounded text-[10px] font-mono text-gray-200 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400">
                    Secret Env Var
                  </label>
                  <input
                    type="text"
                    value={a2aConfig.oauth2Config?.clientSecretEnv || ''}
                    onChange={(e) =>
                      handleUpdateConfig({
                        oauth2Config: { ...a2aConfig.oauth2Config, clientSecretEnv: e.target.value },
                      })
                    }
                    placeholder="A2A_CLIENT_SECRET"
                    className="w-full px-2 py-1 bg-[#161b22] border border-[#30363d] focus:border-cyan-400 rounded text-[10px] font-mono text-cyan-300 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400">
                    Scopes
                  </label>
                  <input
                    type="text"
                    value={a2aConfig.oauth2Config?.scope || ''}
                    onChange={(e) =>
                      handleUpdateConfig({
                        oauth2Config: { ...a2aConfig.oauth2Config, scope: e.target.value },
                      })
                    }
                    placeholder="agent.invoke"
                    className="w-full px-2 py-1 bg-[#161b22] border border-[#30363d] focus:border-cyan-400 rounded text-[10px] font-mono text-gray-200 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400">
                    Audience
                  </label>
                  <input
                    type="text"
                    value={a2aConfig.oauth2Config?.audience || ''}
                    onChange={(e) =>
                      handleUpdateConfig({
                        oauth2Config: { ...a2aConfig.oauth2Config, audience: e.target.value },
                      })
                    }
                    placeholder="https://agent.internal"
                    className="w-full px-2 py-1 bg-[#161b22] border border-[#30363d] focus:border-cyan-400 rounded text-[10px] font-mono text-gray-200 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {a2aConfig.authType === 'google_iam' && (
            <div className="space-y-2 pt-1 border-t border-[#30363d]/60">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400">
                  Target Cloud Service Audience URL
                </label>
                <input
                  type="text"
                  value={a2aConfig.googleIamConfig?.targetAudience || ''}
                  onChange={(e) =>
                    handleUpdateConfig({
                      googleIamConfig: { ...a2aConfig.googleIamConfig, targetAudience: e.target.value },
                    })
                  }
                  placeholder="https://agent-service.us-central1.run.app"
                  className="w-full px-2 py-1 bg-[#161b22] border border-[#30363d] focus:border-cyan-400 rounded text-[10px] font-mono text-cyan-300 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400">
                  Service Account / Credentials Env
                </label>
                <input
                  type="text"
                  value={a2aConfig.googleIamConfig?.serviceAccountEnv || ''}
                  onChange={(e) =>
                    handleUpdateConfig({
                      googleIamConfig: { ...a2aConfig.googleIamConfig, serviceAccountEnv: e.target.value },
                    })
                  }
                  placeholder="GOOGLE_APPLICATION_CREDENTIALS"
                  className="w-full px-2 py-1 bg-[#161b22] border border-[#30363d] focus:border-cyan-400 rounded text-[10px] font-mono text-gray-200 focus:outline-none"
                />
              </div>
            </div>
          )}

          {a2aConfig.authType === 'api_key' && (
            <div className="space-y-2 pt-1 border-t border-[#30363d]/60">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400">
                    Header Name
                  </label>
                  <input
                    type="text"
                    value={a2aConfig.headerName || 'x-api-key'}
                    onChange={(e) => handleUpdateConfig({ headerName: e.target.value })}
                    placeholder="x-api-key"
                    className="w-full px-2 py-1 bg-[#161b22] border border-[#30363d] focus:border-cyan-400 rounded text-[10px] font-mono text-gray-200 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400">
                    Key Secret Env Var
                  </label>
                  <input
                    type="text"
                    value={a2aConfig.authTokenSecret || ''}
                    onChange={(e) => handleUpdateConfig({ authTokenSecret: e.target.value })}
                    placeholder="A2A_API_KEY"
                    className="w-full px-2 py-1 bg-[#161b22] border border-[#30363d] focus:border-cyan-400 rounded text-[10px] font-mono text-cyan-300 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Invocation SLA & Retries */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#30363d]/60">
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400 flex items-center gap-1">
                <Clock className="w-2.5 h-2.5 text-cyan-400" />
                Timeout (Seconds)
              </label>
              <input
                type="number"
                min="1"
                max="300"
                value={a2aConfig.timeoutSeconds || 30}
                onChange={(e) => handleUpdateConfig({ timeoutSeconds: parseInt(e.target.value) || 30 })}
                className="w-full px-2 py-1 bg-[#161b22] border border-[#30363d] focus:border-cyan-400 rounded text-[11px] font-mono text-gray-200 focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400 flex items-center gap-1">
                <RefreshCw className="w-2.5 h-2.5 text-cyan-400" />
                Max Retries
              </label>
              <input
                type="number"
                min="0"
                max="10"
                value={a2aConfig.maxRetries ?? 3}
                onChange={(e) => handleUpdateConfig({ maxRetries: parseInt(e.target.value) || 0 })}
                className="w-full px-2 py-1 bg-[#161b22] border border-[#30363d] focus:border-cyan-400 rounded text-[11px] font-mono text-gray-200 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* SECTION 3: Custom Headers Pass-through */}
        <div className="space-y-2 p-3 bg-[#0d1117] rounded-lg border border-[#30363d]">
          <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400 flex items-center justify-between">
            <span>Custom HTTP Headers</span>
            <span className="text-[9px] text-gray-400 font-mono">{Object.keys(a2aConfig.customHeaders || {}).length} configured</span>
          </label>

          <div className="space-y-1 max-h-24 overflow-y-auto">
            {Object.entries(a2aConfig.customHeaders || {}).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between bg-[#161b22] px-2 py-1 rounded border border-[#30363d] text-[10px] font-mono">
                <span className="text-cyan-300">{k}:</span>
                <span className="text-gray-300 truncate max-w-[120px] mx-1">{v}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveHeader(k)}
                  className="text-gray-400 hover:text-rose-400 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-1 pt-1">
            <input
              type="text"
              value={newHeaderKey}
              onChange={(e) => setNewHeaderKey(e.target.value)}
              placeholder="Header (e.g. X-Trace-ID)"
              className="flex-1 px-1.5 py-1 bg-[#161b22] border border-[#30363d] focus:border-cyan-400 rounded text-[10px] font-mono text-gray-200 focus:outline-none"
            />
            <input
              type="text"
              value={newHeaderVal}
              onChange={(e) => setNewHeaderVal(e.target.value)}
              placeholder="Value"
              className="flex-1 px-1.5 py-1 bg-[#161b22] border border-[#30363d] focus:border-cyan-400 rounded text-[10px] font-mono text-gray-200 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleAddHeader}
              className="px-2 py-1 bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] rounded text-[10px] text-cyan-300 font-medium cursor-pointer"
            >
              Add
            </button>
          </div>
        </div>

        {/* SECTION 4: Advertised Capabilities */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold uppercase tracking-tight text-gray-400 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-cyan-400" />
              Advertised A2A Capabilities ({(a2aConfig.capabilities || []).length})
            </label>
          </div>

          {/* Preset Capability Chips */}
          <div className="flex flex-wrap gap-1.5">
            {PRESET_CAPABILITIES.map((cap) => {
              const isSelected = (a2aConfig.capabilities || []).includes(cap);
              return (
                <button
                  key={cap}
                  type="button"
                  onClick={() => handleToggleCapability(cap)}
                  className={`text-[10px] px-2 py-0.8 rounded-md border font-mono transition-colors cursor-pointer flex items-center gap-1 ${
                    isSelected
                      ? 'bg-cyan-950/60 border-cyan-400 text-cyan-300 font-semibold'
                      : 'bg-[#0d1117] border-[#30363d] text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {isSelected && <Check className="w-2.5 h-2.5 text-cyan-400" />}
                  <span>{cap}</span>
                </button>
              );
            })}
          </div>

          {/* Add custom capability input */}
          <div className="flex gap-1.5 pt-1">
            <input
              type="text"
              value={newCapInput}
              onChange={(e) => setNewCapInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddCustomCapability()}
              placeholder="Add custom capability..."
              className="flex-1 px-2 py-1 bg-[#0d1117] border border-[#30363d] focus:border-cyan-400 rounded text-[10px] font-mono text-gray-200 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleAddCustomCapability}
              className="px-2 py-1 bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] rounded text-[10px] text-cyan-300 font-medium cursor-pointer"
            >
              Add
            </button>
          </div>
        </div>

        {/* SECTION 5: Sub-Agent / Peer Delegation (only rendered when peer agents are connected) */}
        {subAgents.length > 0 && (
          <div className="space-y-2.5 pt-2 border-t border-[#30363d]">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-tight text-gray-400 flex items-center gap-1">
                <Network className="w-3 h-3 text-cyan-400" />
                Connected Peer Agents ({subAgents.length})
              </label>
              <span className="text-[10px] text-gray-500 font-normal">drag to reorder</span>
            </div>

            {/* Pattern Dropdown placed directly above the list */}
            <div className="space-y-1 bg-[#0d1117] p-2.5 rounded-lg border border-cyan-500/30">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold uppercase tracking-tight text-cyan-300">
                  A2A Coordination Topology
                </label>
              </div>
              <select
                value={currentPattern}
                onChange={(e) => {
                  const newPattern = e.target.value as DelegationPattern;
                  const updates: Partial<AgentData> = { subAgentPattern: newPattern };
                  if (newPattern === 'loop' && agent.maxIterations === undefined) {
                    updates.maxIterations = 3;
                  }
                  if (newPattern === 'debate' && !agent.debateConfig) {
                    updates.debateConfig = {
                      maxRounds: 2,
                      consensusThreshold: 0.85,
                      earlyStoppingEnabled: true,
                      debateStyle: 'structured_rebuttal',
                      tieBreakerStrategy: 'conditional_approval',
                      minWordLimitPerBrief: 250,
                      requireEvidenceCitations: true,
                    };
                  }
                  onUpdateAgent(updates);
                }}
                className="w-full px-2.5 py-1.5 bg-[#161b22] border border-cyan-500/40 focus:border-cyan-400 rounded text-xs text-cyan-200 font-medium focus:outline-none cursor-pointer"
              >
                {PATTERN_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id} className="bg-[#161b22] text-gray-200">
                    {opt.label} — {opt.desc}
                  </option>
                ))}
              </select>
            </div>

            {/* Loop Pattern Max Iterations Configuration */}
            {currentPattern === 'loop' && (
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#0d1117] border border-cyan-500/30">
                <div>
                  <label className="text-xs font-semibold text-cyan-200">Max Iterations</label>
                  <p className="text-[10px] text-gray-400">Maximum loop cycles before terminating (default 3)</p>
                </div>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={agent.maxIterations ?? 3}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    onUpdateAgent({ maxIterations: isNaN(val) ? 3 : Math.max(1, val) });
                  }}
                  className="w-16 bg-[#161b22] text-cyan-200 text-xs font-mono font-bold px-2 py-1 rounded border border-cyan-500/40 focus:border-cyan-400 focus:outline-none text-right cursor-text"
                />
              </div>
            )}

          {/* Debate & Consensus Pattern Configuration Panel */}
          {(currentPattern === 'debate' || agent.debateConfig) && (
            <div className="space-y-3 bg-[#0d1117] p-3 rounded-lg border border-pink-500/40 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-pink-300">
                  <Scale className="w-3.5 h-3.5 text-pink-400" />
                  A2A Peer Debate & Consensus Settings
                </div>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-pink-500/20 text-pink-300 border border-pink-500/30 font-mono">
                  Multi-Peer Arbitration
                </span>
              </div>

              {/* Max Rounds / Turn Bound */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label className="text-[11px] text-gray-300 font-medium">Max Debate Rounds</label>
                  <span className="font-mono text-xs text-pink-400 font-bold">
                    {agent.debateConfig?.maxRounds ?? 2} {agent.debateConfig?.maxRounds === 1 ? 'Round' : 'Rounds'}
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="6"
                  step="1"
                  value={agent.debateConfig?.maxRounds ?? 2}
                  onChange={(e) => onUpdateAgent({
                    debateConfig: {
                      maxRounds: parseInt(e.target.value) || 2,
                      consensusThreshold: agent.debateConfig?.consensusThreshold ?? 0.85,
                      earlyStoppingEnabled: agent.debateConfig?.earlyStoppingEnabled ?? true,
                      debateStyle: agent.debateConfig?.debateStyle ?? 'structured_rebuttal',
                      tieBreakerStrategy: agent.debateConfig?.tieBreakerStrategy ?? 'conditional_approval',
                      requireEvidenceCitations: agent.debateConfig?.requireEvidenceCitations ?? true,
                      minWordLimitPerBrief: agent.debateConfig?.minWordLimitPerBrief ?? 250,
                    }
                  })}
                  className="w-full h-1.5 bg-[#21262d] rounded-lg appearance-none cursor-pointer accent-pink-500"
                />
              </div>

              {/* Consensus Confidence Threshold */}
              <div className="space-y-1.5 pt-2 border-t border-[#21262d]">
                <div className="flex items-center justify-between text-xs">
                  <label className="text-[11px] text-gray-300 font-medium">Consensus Threshold</label>
                  <span className="font-mono text-xs text-emerald-400 font-bold">
                    {Math.round((agent.debateConfig?.consensusThreshold ?? 0.85) * 100)}% Agreement
                  </span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="99"
                  step="1"
                  value={Math.round((agent.debateConfig?.consensusThreshold ?? 0.85) * 100)}
                  onChange={(e) => onUpdateAgent({
                    debateConfig: {
                      maxRounds: agent.debateConfig?.maxRounds ?? 2,
                      consensusThreshold: (parseInt(e.target.value) || 85) / 100,
                      earlyStoppingEnabled: agent.debateConfig?.earlyStoppingEnabled ?? true,
                      debateStyle: agent.debateConfig?.debateStyle ?? 'structured_rebuttal',
                      tieBreakerStrategy: agent.debateConfig?.tieBreakerStrategy ?? 'conditional_approval',
                      requireEvidenceCitations: agent.debateConfig?.requireEvidenceCitations ?? true,
                      minWordLimitPerBrief: agent.debateConfig?.minWordLimitPerBrief ?? 250,
                    }
                  })}
                  className="w-full h-1.5 bg-[#21262d] rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
              </div>

              {/* Early Stopping Toggle */}
              <div className="flex items-start gap-2 pt-2 border-t border-[#21262d]">
                <input
                  type="checkbox"
                  id="a2aEarlyStoppingCheckbox"
                  checked={agent.debateConfig?.earlyStoppingEnabled !== false}
                  onChange={(e) => onUpdateAgent({
                    debateConfig: {
                      maxRounds: agent.debateConfig?.maxRounds ?? 2,
                      consensusThreshold: agent.debateConfig?.consensusThreshold ?? 0.85,
                      earlyStoppingEnabled: e.target.checked,
                      debateStyle: agent.debateConfig?.debateStyle ?? 'structured_rebuttal',
                      tieBreakerStrategy: agent.debateConfig?.tieBreakerStrategy ?? 'conditional_approval',
                      requireEvidenceCitations: agent.debateConfig?.requireEvidenceCitations ?? true,
                      minWordLimitPerBrief: agent.debateConfig?.minWordLimitPerBrief ?? 250,
                    }
                  })}
                  className="w-3.5 h-3.5 mt-0.5 accent-pink-500 rounded cursor-pointer shrink-0"
                />
                <label htmlFor="a2aEarlyStoppingCheckbox" className="text-[11px] text-gray-300 cursor-pointer">
                  <span className="font-semibold text-pink-300">Early Termination:</span> Exit peer debate early if agreement threshold is satisfied.
                </label>
              </div>

              {/* Debate Style & Tie-Breaker Strategy */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#21262d]">
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-gray-400">Interaction Style</label>
                  <select
                    value={agent.debateConfig?.debateStyle ?? 'structured_rebuttal'}
                    onChange={(e) => onUpdateAgent({
                      debateConfig: {
                        maxRounds: agent.debateConfig?.maxRounds ?? 2,
                        consensusThreshold: agent.debateConfig?.consensusThreshold ?? 0.85,
                        earlyStoppingEnabled: agent.debateConfig?.earlyStoppingEnabled ?? true,
                        debateStyle: e.target.value as DebateStyle,
                        tieBreakerStrategy: agent.debateConfig?.tieBreakerStrategy ?? 'conditional_approval',
                        requireEvidenceCitations: agent.debateConfig?.requireEvidenceCitations ?? true,
                        minWordLimitPerBrief: agent.debateConfig?.minWordLimitPerBrief ?? 250,
                      }
                    })}
                    className="w-full px-2 py-1 bg-[#161b22] border border-[#30363d] focus:border-pink-500 rounded text-xs text-white cursor-pointer"
                  >
                    <option value="structured_rebuttal">Structured Rebuttal</option>
                    <option value="socratic">Socratic Dialectic</option>
                    <option value="free_form">Free-Form Exchange</option>
                    <option value="panel_scoring">Panel Scoring</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-gray-400">Stalemate Policy</label>
                  <select
                    value={agent.debateConfig?.tieBreakerStrategy ?? 'conditional_approval'}
                    onChange={(e) => onUpdateAgent({
                      debateConfig: {
                        maxRounds: agent.debateConfig?.maxRounds ?? 2,
                        consensusThreshold: agent.debateConfig?.consensusThreshold ?? 0.85,
                        earlyStoppingEnabled: agent.debateConfig?.earlyStoppingEnabled ?? true,
                        debateStyle: agent.debateConfig?.debateStyle ?? 'structured_rebuttal',
                        tieBreakerStrategy: e.target.value as TieBreakerStrategy,
                        requireEvidenceCitations: agent.debateConfig?.requireEvidenceCitations ?? true,
                        minWordLimitPerBrief: agent.debateConfig?.minWordLimitPerBrief ?? 250,
                      }
                    })}
                    className="w-full px-2 py-1 bg-[#161b22] border border-[#30363d] focus:border-pink-500 rounded text-xs text-white cursor-pointer"
                  >
                    <option value="conditional_approval">Conditional Approval</option>
                    <option value="conservative_veto">Conservative Veto</option>
                    <option value="moderator_vote">Moderator Decides</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Orderable Peer Agents List */}
          <div className="space-y-1.5">
            {subAgents.map((sub: SubAgentRef, idx: number) => (
                <div
                  key={sub.agentId || idx}
                  draggable
                  onDragStart={(e) => handleDragStart(e, idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDrop={(e) => handleDrop(e, idx)}
                  onDragEnd={() => {
                    setDraggedIdx(null);
                    setDragOverIdx(null);
                  }}
                  className={`flex items-center justify-between p-2 rounded-lg bg-[#0d1117] border transition-all ${
                    dragOverIdx === idx
                      ? 'border-cyan-400 bg-cyan-950/40'
                      : draggedIdx === idx
                      ? 'opacity-40 border-dashed border-gray-500'
                      : 'border-[#30363d] hover:border-cyan-500/40'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="cursor-grab active:cursor-grabbing p-0.5 text-gray-500 hover:text-cyan-400">
                      <GripVertical className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-[10px] font-mono text-cyan-400 font-bold bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-500/20">
                      #{idx + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-200 text-xs truncate max-w-[150px]">
                        {sub.name}
                      </div>
                      <div className="text-[10px] text-gray-400 truncate max-w-[150px]">
                        {sub.role || 'Peer agent node'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleMoveSubAgent(idx, idx - 1)}
                      disabled={idx === 0}
                      title="Move Up"
                      className="p-1 text-gray-400 hover:text-white disabled:opacity-20 cursor-pointer disabled:cursor-default"
                    >
                      <ChevronUp className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => handleMoveSubAgent(idx, idx + 1)}
                      disabled={idx === subAgents.length - 1}
                      title="Move Down"
                      className="p-1 text-gray-400 hover:text-white disabled:opacity-20 cursor-pointer disabled:cursor-default"
                    >
                      <ChevronDown className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => handleRemoveSubAgent(sub.agentId)}
                      title="Remove Peer Link"
                      className="p-1 text-gray-400 hover:text-rose-400 transition-colors cursor-pointer ml-1"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
