/**
 * A2AAgentDrawer - Inspector Drawer for Agent-to-Agent (A2A) Autonomous Nodes
 * 
 * Purpose:
 * Provides configuration drawer for A2A protocols, communication channels,
 * peer delegation patterns, and handshake configurations structured into tabs:
 * 1. Agent & Card: A2A Agent Display Name (with auto-generated hidden Python ID), Import Agent Card JSON Spec (Required), and Caller Delegation Prompt.
 * 2. Skills & Capabilities: Read-only Published Agent Skills (N) and Detected Capabilities (N) parsed from the Agent Card.
 * 3. Endpoint & Auth: RPC Endpoint URL (Required), Protocol Spec, Discovery URL, Multi-Scheme Auth, Custom Headers (N) & Resilience.
 * 4. Sub-Agents: Multi-agent delegation patterns and peer orchestration (dynamically hidden when no sub-agents connected).
 * 
 * Architectural Decisions:
 * - Full-Height Viewport Drawer: Uses fixed inset-y-0 right-0 z-50 w-[420px] overlay to span full viewport height over bottom panels, matching TriggerDrawer.
 * - Setup-First Flow: A2A Agent Display Name is first, followed immediately by Import Agent Card JSON Spec on Tab 1 so pasting a remote agent-card.json auto-populates Display Name, Delegation Prompt, Endpoint, Skills, and Auth.
 * - Remote Proxy Semantics: Omits local LLM model picker, local attached tools, and local structured output schema since a RemoteA2aAgent executes on its own remote server.
 * - Dynamic Sub-Agents Tab: Automatically hidden when subAgents.length === 0; no badge counts on main tab buttons, with item counts in section headers.
 * - Grid System: Follows 8pt grid system for spacing.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import React, { useState, useEffect } from 'react';
import { Edge } from 'reactflow';
import { 
  Bot,
  Globe2, 
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
  Network,
  Key,
  Lock,
  FileJson,
  RefreshCw,
  Sliders,
  Clock,
  AlertCircle,
  Cpu,
  Layers3,
  Play,
  Scale,
  Wrench,
  Pencil,
  Code2
} from 'lucide-react';
import { 
  AgentData, 
  DelegationPattern, 
  SubAgentRef, 
  A2AConfig, 
  A2AAuthType, 
  A2AAgentSkill,
  StructuredOutputSchema, 
  DebateStyle, 
  TieBreakerStrategy,
  ADK_DELEGATION_PATTERNS,
  ToolDefinition
} from '../../types';
import { AgentSkillsSection } from './AgentSkillsSection';
import { parseA2AAgentCard } from '../../../shared/a2aCardParser';
import { validateAgentIdentifier, sanitizeAgentIdentifier } from '../../../shared/identifierValidation';

interface A2AAgentDrawerProps {
  agent: AgentData;
  allAgents: AgentData[];
  edges?: Edge[];
  onClose: () => void;
  onUpdateAgent: (updatedData: Partial<AgentData>) => void;
  onOpenAddTool?: () => void;
  onRemoveTool?: (toolId: string) => void;
  onEditTool?: (tool: ToolDefinition) => void;
  onSelectAgent?: (agentId: string) => void;
}



const PATTERN_OPTIONS = ADK_DELEGATION_PATTERNS;

export type A2ADrawerTab = 'agent' | 'card_skills' | 'endpoint_auth' | 'sub_agents';
export type ActiveTab = A2ADrawerTab;

export const A2AAgentDrawer: React.FC<A2AAgentDrawerProps> = ({
  agent,
  allAgents,
  edges,
  onClose,
  onUpdateAgent,
  onOpenAddTool,
  onRemoveTool,
  onEditTool,
  onSelectAgent,
}) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('agent');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [jsonSuccess, setJsonSuccess] = useState<boolean>(false);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [newHeaderKey, setNewHeaderKey] = useState('');
  const [newHeaderVal, setNewHeaderVal] = useState('');

  // Fallback safe A2A Configuration
  const a2aConfig: A2AConfig = {
    endpoint: '',
    protocolVersion: '',
    agentCardUrl: '',
    authType: 'bearer',
    authTokenSecret: '',
    headerName: 'X-API-Key',
    timeoutSeconds: 30,
    maxRetries: 3,
    capabilities: [],
    skills: [],
    customHeaders: {},
    rawJsonPack: '',
    oauth2Config: {
      tokenUrl: '',
      clientId: '',
      clientSecretEnv: '',
      scopes: [],
    },
    googleIamConfig: {
      targetAudience: '',
      serviceAccountEmail: '',
    },
    ...agent.a2aConfig,
  };

  const handleUpdateConfig = (partial: Partial<A2AConfig>) => {
    onUpdateAgent({
      a2aConfig: {
        ...a2aConfig,
        ...partial,
      },
    });
  };

  // Sub-agents resolving:
  // Strictly resolves sub-agents connected FROM this node's bottom handle to downstream agent nodes.
  // Never treats an incoming connection (where this node is the target / child) as a sub-agent.
  const currentAgentId = agent.id || (agent as any).name;
  const currentAgentName = agent.name;
  const currentAgentIdentifier = agent.identifier;
  const currentAgentLabel = agent.label;

  const matchesCurrentAgent = (idOrName?: string) => {
    if (!idOrName) return false;
    return (
      idOrName === currentAgentId ||
      (currentAgentName && idOrName === currentAgentName) ||
      (currentAgentIdentifier && idOrName === currentAgentIdentifier) ||
      (currentAgentLabel && idOrName === currentAgentLabel)
    );
  };

  const isBottomHandle = (handleId?: string | null) => {
    if (!handleId) return true;
    if (handleId === 'output' || handleId === 'subagent' || handleId.startsWith('branch_')) return true;
    return handleId !== 'input' && handleId !== 'input_left';
  };

  const connectedOutgoingSubAgentIds = (edges || [])
    .filter((e) => {
      const isFromSelf = matchesCurrentAgent(e.source);
      const isToSelf = matchesCurrentAgent(e.target);
      const fromBottom = isBottomHandle(e.sourceHandle);
      return isFromSelf && !isToSelf && fromBottom;
    })
    .map((e) => e.target)
    .filter((targetId) => {
      if (!targetId || matchesCurrentAgent(targetId)) return false;
      return allAgents.some(
        (a) => a.id === targetId || (a as any).name === targetId || (a as any).identifier === targetId || a.label === targetId
      );
    });

  const connectedTargetSet = new Set(connectedOutgoingSubAgentIds);

  const rawSubAgentRefs = agent.subAgents || [];
  // When edges is provided, filter out any references that are not connected from the bottom handle
  const validSubAgentRefs = edges !== undefined
    ? rawSubAgentRefs.filter((r) => {
        const id = typeof r === 'string' ? r : r.agentId;
        return connectedTargetSet.has(id);
      })
    : rawSubAgentRefs;

  const existingSubIds = new Set(
    validSubAgentRefs.map((r) => (typeof r === 'string' ? r : r.agentId))
  );

  const mergedRefs: (SubAgentRef | string)[] = [...validSubAgentRefs];
  connectedOutgoingSubAgentIds.forEach((targetId) => {
    if (!existingSubIds.has(targetId)) {
      mergedRefs.push(targetId);
      existingSubIds.add(targetId);
    }
  });

  const rawPattern: DelegationPattern =
    agent.subAgentPattern || agent.delegationPattern || (agent.subAgents?.[0] as any)?.delegationType || 'parallel';
  const effectivePattern: DelegationPattern = PATTERN_OPTIONS.some((opt) => opt.id === rawPattern)
    ? rawPattern
    : PATTERN_OPTIONS[0].id;

  const subAgents: SubAgentRef[] = mergedRefs.map((ref) => {
    const id = typeof ref === 'string' ? ref : ref.agentId;
    const found = allAgents.find(
      (a) => a.id === id || (a as any).name === id || (a as any).identifier === id || a.label === id
    );
    if (typeof ref === 'string') {
      return {
        agentId: id,
        name: found?.label || (found as any)?.name || `Agent ${id.substring(0, 5)}`,
        role: found?.role,
        delegationType: effectivePattern,
      };
    }
    return {
      agentId: id,
      name: ref.name || found?.label || (found as any)?.name || `Agent ${id.substring(0, 5)}`,
      role: ref.role || found?.role,
      delegationType: ref.delegationType || effectivePattern,
    };
  });

  // If active tab was sub_agents and subAgents became empty, gracefully fall back to 'agent'
  useEffect(() => {
    if (subAgents.length === 0 && activeTab === 'sub_agents') {
      setActiveTab('agent');
    }
  }, [subAgents.length, activeTab]);

  const handleMoveSubAgent = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= subAgents.length) return;
    const updated = [...subAgents];
    const [moved] = updated.splice(fromIdx, 1);
    updated.splice(toIdx, 0, moved);
    onUpdateAgent({ subAgents: updated });
  };

  const handleRemoveSubAgent = (agentId: string) => {
    const updated = subAgents.filter((s) => s.agentId !== agentId);
    onUpdateAgent({ subAgents: updated });
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIdx(index);
    e.dataTransfer.setData('text/plain', `${index}`);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragOverIdx !== index) {
      setDragOverIdx(index);
    }
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === dropIndex) return;
    handleMoveSubAgent(draggedIdx, dropIndex);
    setDraggedIdx(null);
    setDragOverIdx(null);
  };

  const currentIdentifier = 
    agent.identifier || 
    (agent.name ? sanitizeAgentIdentifier(agent.name) : sanitizeAgentIdentifier(agent.label || agent.id));

  // Auto-populate empty identifier on new cards from name/label converted to a valid Python ID
  useEffect(() => {
    if (!agent.identifier) {
      const autoId = sanitizeAgentIdentifier(agent.name || agent.label || agent.id);
      onUpdateAgent({ identifier: autoId, name: autoId });
    }
  }, [agent.identifier, agent.name, agent.label, agent.id, onUpdateAgent]);

  const handleLabelChange = (newLabel: string) => {
    const newIdentifier = sanitizeAgentIdentifier(newLabel || agent.id);
    onUpdateAgent({ 
      label: newLabel,
      identifier: newIdentifier,
      name: newIdentifier,
    });
  };

  const descriptionValue = agent.systemPrompt || '';

  const handleDescriptionChange = (newDescription: string) => {
    const firstSentence = newDescription.split('\n')[0].trim();
    onUpdateAgent({
      systemPrompt: newDescription,
      role: firstSentence || agent.role || 'A2A Protocol Autonomous Agent',
    });
  };

  const handlePrefillFromSkills = () => {
    if (a2aConfig.rawJsonPack) {
      try {
        const parsed = parseA2AAgentCard(a2aConfig.rawJsonPack);
        if (parsed.suggestedDelegationPrompt) {
          handleDescriptionChange(parsed.suggestedDelegationPrompt);
        }
      } catch (e) {
        // ignore
      }
    }
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
      if (!a2aConfig.rawJsonPack || !a2aConfig.rawJsonPack.trim()) {
        throw new Error('Agent Card JSON specification is required. Please paste an agent-card.json manifest into the box.');
      }
      const parsed = parseA2AAgentCard(a2aConfig.rawJsonPack);
      
      const newLabel = parsed.name || agent.label;
      const newIdentifier = sanitizeAgentIdentifier(newLabel);
      const newEndpoint = parsed.endpoint || a2aConfig.endpoint;
      const newProtocol = parsed.protocolVersion || a2aConfig.protocolVersion;
      const newCaps = parsed.capabilities.length > 0 ? parsed.capabilities : a2aConfig.capabilities;
      const newDescription = parsed.description || descriptionValue;
      const newAuthType: A2AAuthType = parsed.authType || a2aConfig.authType;

      onUpdateAgent({
        label: newLabel,
        identifier: newIdentifier,
        name: newIdentifier,
        systemPrompt: parsed.suggestedDelegationPrompt || newDescription,
        role: (parsed.description ? parsed.description.split('\n')[0] : agent.role) || 'A2A Protocol Autonomous Agent',
        a2aConfig: {
          ...a2aConfig,
          endpoint: newEndpoint,
          protocolVersion: newProtocol,
          capabilities: newCaps,
          skills: parsed.skills,
          iconUrl: parsed.iconUrl || a2aConfig.iconUrl,
          preferredTransport: parsed.transport,
          authType: newAuthType,
          rawJsonPack: a2aConfig.rawJsonPack,
        },
      });

      setJsonSuccess(true);
      setTimeout(() => setJsonSuccess(false), 4000);
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
    <div className="fixed inset-y-0 right-0 z-50 w-[420px] bg-[#161b22] border-l border-[#30363d] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200 text-[#c9d1d9] font-sans">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 bg-[#161b22] border-b border-[#30363d] shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 rounded-lg bg-[#0d1117] border border-cyan-500/40 text-cyan-400 shrink-0 shadow-xs flex items-center justify-center w-8 h-8">
            {a2aConfig.iconUrl ? (
              <img src={a2aConfig.iconUrl} alt="A2A Icon" className="w-5 h-5 object-contain" />
            ) : (
              <Globe2 className="w-4 h-4" />
            )}
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-bold text-white truncate max-w-[200px]">
              {agent.label}
            </h3>
            <span className="text-[10px] text-cyan-400 font-mono flex items-center gap-1">
              {a2aConfig.skills && a2aConfig.skills.length > 0 
                ? `${a2aConfig.skills.length} Published Skill${a2aConfig.skills.length > 1 ? 's' : ''}` 
                : 'A2A Protocol Node Properties'}
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

      {/* 3-Tab (+ Conditional Sub-Agents) Navigation Bar */}
      <div
        className="flex items-center px-3 py-2 bg-[#0d1117] border-b border-[#30363d] gap-1 shrink-0 overflow-x-auto"
        data-testid="a2a-agent-drawer-tabs"
      >
        <button
          type="button"
          onClick={() => setActiveTab('agent')}
          data-testid="a2a-drawer-tab-agent"
          className={`flex-1 px-2 py-1.5 rounded-md text-[11px] font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            activeTab === 'agent'
              ? 'bg-cyan-600 text-white shadow-xs'
              : 'text-gray-400 hover:text-gray-200 hover:bg-[#161b22]'
          }`}
        >
          <Bot className="w-3.5 h-3.5" />
          <span>Agent & Card</span>
          {!a2aConfig.rawJsonPack?.trim() && (
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" title="Agent card JSON spec required" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('card_skills')}
          data-testid="a2a-drawer-tab-card_skills"
          className={`flex-1 px-2 py-1.5 rounded-md text-[11px] font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            activeTab === 'card_skills'
              ? 'bg-cyan-600 text-white shadow-xs'
              : 'text-gray-400 hover:text-gray-200 hover:bg-[#161b22]'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Skills & Capabilities</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('endpoint_auth')}
          data-testid="a2a-drawer-tab-endpoint_auth"
          className={`flex-1 px-2 py-1.5 rounded-md text-[11px] font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            activeTab === 'endpoint_auth'
              ? 'bg-cyan-600 text-white shadow-xs'
              : 'text-gray-400 hover:text-gray-200 hover:bg-[#161b22]'
          }`}
        >
          <Globe className="w-3.5 h-3.5" />
          <span>Endpoint & Auth</span>
          {!a2aConfig.endpoint?.trim() && (
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" title="RPC Endpoint URL required" />
          )}
        </button>

        {subAgents.length > 0 && (
          <button
            type="button"
            onClick={() => setActiveTab('sub_agents')}
            data-testid="a2a-drawer-tab-sub_agents"
            className={`flex-1 px-2 py-1.5 rounded-md text-[11px] font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'sub_agents'
                ? 'bg-cyan-600 text-white shadow-xs'
                : 'text-gray-400 hover:text-gray-200 hover:bg-[#161b22]'
            }`}
          >
            <Network className="w-3.5 h-3.5" />
            <span>Sub-Agents</span>
          </button>
        )}
      </div>

      {/* Form Body */}
      <div className="flex-1 p-4 space-y-4 overflow-y-auto text-xs text-gray-300">

        {/* ========================================================================= */}
        {/* TAB 1: AGENT & CARD (Setup-First Remote A2A Flow)                         */}
        {/* 1. A2A Agent Display Name (with auto-generated hidden Python ID)         */}
        {/* 2. Import Agent Card (JSON Spec)                                         */}
        {/* 3. Caller Delegation Prompt & Task Instructions                          */}
        {/* ========================================================================= */}
        {activeTab === 'agent' && (
          <>
            {/* 1. Display Name & Auto-Generated Hidden Python Identifier */}
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-tight text-gray-400">
                  A2A Agent Display Name
                </label>
                <input
                  type="text"
                  value={agent.label}
                  onChange={(e) => handleLabelChange(e.target.value)}
                  placeholder="e.g. Data Analysis Peer Agent"
                  className="w-full px-3 py-1.5 bg-[#0d1117] border border-[#30363d] focus:border-cyan-400 rounded-lg text-xs text-white focus:outline-none"
                />
                {/* Hidden auto-generated Python identifier field */}
                <input
                  type="hidden"
                  value={currentIdentifier}
                  data-testid="a2a-agent-identifier-hidden"
                />
              </div>
            </div>

            {/* 2. Import Agent Card (JSON Spec) */}
            <div className={`p-3 bg-[#0d1117] rounded-lg border space-y-2.5 shadow-sm ${
              !a2aConfig.rawJsonPack?.trim() ? 'border-rose-500/40' : 'border-cyan-500/40'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-cyan-400 font-bold text-xs">
                  <FileJson className="w-4 h-4 text-cyan-400" />
                  <span>Import Agent Card (JSON Spec)</span>
                  <span className="text-rose-400">*</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {!a2aConfig.rawJsonPack?.trim() && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-950/70 text-rose-300 font-mono border border-rose-500/40 font-semibold">
                      Required
                    </span>
                  )}
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-950/70 text-cyan-300 font-mono border border-cyan-500/30">
                    GDA & A2A v1.0
                  </span>
                </div>
              </div>

              <p className="text-[10px] text-gray-400 leading-normal">
                Paste the published <code className="text-cyan-300">agent-card.json</code> manifest from BigQuery CA, Google Data Analytics, or an A2A peer agent to auto-configure this node.
              </p>

              <textarea
                rows={7}
                value={a2aConfig.rawJsonPack || ''}
                onChange={(e) => {
                  handleUpdateConfig({ rawJsonPack: e.target.value });
                  setJsonError(null);
                }}
                placeholder={`{
  "protocolVersion": "1.0",
  "name": "stock agent",
  "url": "https://geminidataanalytics...",
  "skills": [...]
}`}
                className={`w-full px-2.5 py-2 bg-[#161b22] border rounded font-mono text-[10px] text-cyan-200 focus:outline-none resize-y leading-tight ${
                  !a2aConfig.rawJsonPack?.trim()
                    ? 'border-rose-500/40 focus:border-rose-400'
                    : 'border-[#30363d] focus:border-cyan-400'
                }`}
              />

              {!a2aConfig.rawJsonPack?.trim() && !jsonError && (
                <div className="flex items-start gap-1.5 text-[10px] text-rose-300 bg-rose-950/30 p-2 rounded border border-rose-500/30">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-400 mt-0.5" />
                  <span>Agent Card JSON spec is required. Paste the remote agent's <code className="text-cyan-300 font-mono">agent-card.json</code> to configure this agent's endpoint, skills, and delegation instructions.</span>
                </div>
              )}

              {jsonError && (
                <div className="flex items-center gap-1 text-[10px] text-rose-400 bg-rose-950/40 p-1.5 rounded border border-rose-500/30">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{jsonError}</span>
                </div>
              )}

              {jsonSuccess && (
                <div className="text-[10px] text-emerald-300 bg-emerald-950/40 p-2 rounded border border-emerald-500/30 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-emerald-400">
                    <Check className="w-3.5 h-3.5 shrink-0" />
                    <span>Agent Card Successfully Applied!</span>
                  </div>
                  <div className="text-[9px] text-gray-300 font-mono">
                    • {agent.label} • {a2aConfig.endpoint ? 'Endpoint configured' : 'No endpoint'}
                    {a2aConfig.skills && a2aConfig.skills.length > 0 && ` • ${a2aConfig.skills.length} skills`}
                    {a2aConfig.capabilities && a2aConfig.capabilities.length > 0 && ` • ${a2aConfig.capabilities.length} capabilities`}
                    {a2aConfig.authType === 'google_iam' && ' • Google Cloud IAM active'}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleParseAndApplyJsonPack}
                  className="flex-1 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded font-medium text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                >
                  <FileJson className="w-3.5 h-3.5" />
                  <span>Parse & Apply Agent Card</span>
                </button>
                <button
                  type="button"
                  onClick={handleSyncFromFormToJson}
                  title="Regenerate JSON from current form settings"
                  className="px-2.5 py-1.5 bg-[#161b22] hover:bg-[#21262d] border border-[#30363d] text-gray-300 hover:text-white rounded text-xs flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3 text-cyan-400" />
                  <span>Export</span>
                </button>
              </div>
            </div>

            {/* 3. Caller Delegation Prompt & Task Instructions */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold uppercase tracking-tight text-cyan-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Caller Delegation Prompt & Task Instructions</span>
                </label>
                <span className="text-[10px] text-gray-400 font-mono">
                  {descriptionValue.length} chars • {descriptionValue.split(/\s+/).filter(Boolean).length} words
                </span>
              </div>

              <p className="text-[10px] text-gray-400 leading-normal">
                Instructs orchestrator / caller agents on <strong className="text-gray-200">when and how</strong> to delegate queries to this A2A agent, and provides prompt context sent with requests. <em>(The remote agent runs its own internal model and tools in the cloud).</em>
              </p>

              <div className="relative group">
                <textarea
                  rows={5}
                  value={descriptionValue}
                  onChange={(e) => handleDescriptionChange(e.target.value)}
                  placeholder="e.g. BigQuery CA agent answering questions about attached data. Provides data analysis assistance. Example query: What is the total sales for the last 3 months?"
                  className="w-full min-h-[100px] max-h-[300px] px-3 py-2 bg-[#0d1117] border border-[#30363d] focus:border-cyan-400 rounded-lg text-xs text-gray-200 focus:outline-none resize-y font-mono leading-relaxed selection:bg-cyan-900 selection:text-white"
                />
                <div className="text-[10px] text-gray-400 mt-1 flex items-center justify-between">
                  <span>Delegation guidance used by parent orchestrator / router to invoke this tool</span>
                  <span className="text-[9px] font-mono text-gray-400">↕ Expand</span>
                </div>
              </div>

              {a2aConfig.skills && a2aConfig.skills.length > 0 && (
                <div className="flex items-center justify-between pt-0.5">
                  <span className="text-[9px] text-gray-400 font-mono">Skills detected in agent card</span>
                  <button
                    type="button"
                    onClick={handlePrefillFromSkills}
                    className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-mono cursor-pointer"
                  >
                    <Sparkles className="w-2.5 h-2.5" />
                    Prefill from Skills & Examples
                  </button>
                </div>
              )}

              {!descriptionValue.trim() && (
                <div className="flex items-center gap-1.5 text-[10px] text-gray-500 italic pt-0.5">
                  <Sparkles className="w-3 h-3 text-cyan-400/60 shrink-0" />
                  <span>Tip: Paste and apply an agent card JSON spec above to auto-populate delegation instructions from declared skills.</span>
                </div>
              )}
            </div>
          </>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: SKILLS & CAPABILITIES                                             */}
        {/* 1. Published Agent Skills Overview (N)                                   */}
        {/* 2. Detected Capabilities (N)                                             */}
        {/* ========================================================================= */}
        {activeTab === 'card_skills' && (
          <div className="space-y-4">
            {/* Published Skills Overview (when parsed) */}
            {a2aConfig.skills && a2aConfig.skills.length > 0 ? (
              <div className="p-3 bg-[#0d1117] rounded-lg border border-cyan-500/30 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-cyan-300 font-bold text-xs">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Published Agent Skills ({a2aConfig.skills.length})</span>
                  </div>
                  <span className="text-[9px] font-mono text-cyan-400 bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-500/20">
                    Remote Capabilities
                  </span>
                </div>

                <div className="space-y-2">
                  {a2aConfig.skills.map((skill) => (
                    <div key={skill.id} className="p-2 bg-[#161b22] rounded border border-[#30363d] space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white text-[11px]">{skill.name}</span>
                        <span className="text-[9px] text-cyan-400 font-mono">{skill.id}</span>
                      </div>
                      {skill.description && (
                        <p className="text-[10px] text-gray-300">{skill.description}</p>
                      )}
                      {skill.examples && skill.examples.length > 0 && (
                        <div className="pt-1">
                          <span className="text-[9px] text-gray-400 uppercase font-mono tracking-wider block">Sample Queries:</span>
                          <ul className="list-disc list-inside text-[9.5px] text-cyan-200/90 font-mono space-y-0.5">
                            {skill.examples.map((ex, i) => (
                              <li key={i} className="truncate">{ex}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {skill.tags && skill.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1">
                          {skill.tags.map((tag) => (
                            <span key={tag} className="px-1.5 py-0.2 rounded bg-[#0d1117] text-gray-400 border border-[#30363d] text-[8.5px] font-mono">
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-3 bg-[#0d1117] rounded-lg border border-dashed border-[#30363d] space-y-1 text-center">
                <div className="flex items-center justify-center gap-1.5 text-gray-400 text-xs font-semibold">
                  <Sparkles className="w-3.5 h-3.5 text-gray-500" />
                  <span>Published Agent Skills (0)</span>
                </div>
                <p className="text-[10px] text-gray-500 leading-normal">
                  No skills imported yet. Paste and apply an agent card JSON spec in the Agent & Card tab to inspect advertised skills.
                </p>
              </div>
            )}

            {/* SECTION 2: Detected Capabilities */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold uppercase tracking-tight text-gray-400 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-cyan-400" />
                  <span>Detected Capabilities ({(a2aConfig.capabilities || []).length})</span>
                </label>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#161b22] text-gray-400 font-mono border border-[#30363d]">
                  Read-only • From Agent Card
                </span>
              </div>

              <p className="text-[10px] text-gray-400 leading-normal">
                Capabilities and protocol extensions automatically detected from the remote agent's published <code className="text-cyan-300">agent-card.json</code> manifest.
              </p>

              {/* Read-only Detected Capability Badges */}
              {a2aConfig.capabilities && a2aConfig.capabilities.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {a2aConfig.capabilities.map((cap) => (
                    <span
                      key={cap}
                      className="text-[10px] px-2 py-0.8 rounded-md bg-cyan-950/60 border border-cyan-500/30 text-cyan-300 font-mono flex items-center gap-1"
                    >
                      <Check className="w-2.5 h-2.5 text-cyan-400" />
                      <span>{cap}</span>
                    </span>
                  ))}
                </div>
              ) : (
                <div className="text-[10px] text-gray-500 italic p-2.5 bg-[#0d1117] rounded-lg border border-dashed border-[#30363d] text-center">
                  No capabilities detected yet. Auto-detected from agent-card.json when parsed.
                </div>
              )}
            </div>

            {/* SECTION 3: Attached Agent Skills (Global / Agent-Scoped) */}
            <div className="pt-3 border-t border-[#30363d]">
              <AgentSkillsSection
                skills={agent.skills || []}
                onChangeSkills={(skills) => onUpdateAgent({ skills })}
              />
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: ENDPOINT & AUTH                                                   */}
        {/* 1. A2A Connection Details                                                */}
        {/* 2. Sub-Agent Authentication & Security Configuration                     */}
        {/* 3. Custom Headers Pass-through                                           */}
        {/* 4. Runtime Resilience                                                    */}
        {/* ========================================================================= */}
        {activeTab === 'endpoint_auth' && (
          <div className="space-y-4">
            {/* SECTION 2: A2A Connection Details */}
            <div className="p-3 bg-[#0d1117] rounded-lg border border-cyan-500/30 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-cyan-400 font-bold text-xs">
                  <Globe className="w-3.5 h-3.5" />
                  <span>A2A Connection Details</span>
                </div>
                {a2aConfig.endpoint.includes('googleapis.com') && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-950/70 text-blue-300 font-mono border border-blue-500/30">
                    Google Cloud Service
                  </span>
                )}
              </div>

              <div className="space-y-2.5">
                {/* RPC Endpoint URL */}
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <span>RPC Endpoint URL (Agent Service)</span>
                      <span className="text-rose-400">*</span>
                    </span>
                    <div className="flex items-center gap-1.5">
                      {!a2aConfig.endpoint?.trim() && (
                        <span className="text-[9px] px-1 py-0.2 rounded bg-rose-950/70 text-rose-300 font-mono border border-rose-500/40 font-semibold">
                          Required
                        </span>
                      )}
                      <span className="text-[9px] text-cyan-400 font-mono">POST / JSON-RPC</span>
                    </div>
                  </label>
                  <input
                    type="text"
                    value={a2aConfig.endpoint}
                    onChange={(e) => handleUpdateConfig({ endpoint: e.target.value })}
                    placeholder="https://geminidataanalytics.us.rep.googleapis.com/..."
                    className={`w-full px-2.5 py-1.5 bg-[#161b22] border rounded text-[11px] font-mono text-cyan-300 focus:outline-none ${
                      !a2aConfig.endpoint?.trim()
                        ? 'border-rose-500/40 focus:border-rose-400'
                        : 'border-[#30363d] focus:border-cyan-400'
                    }`}
                  />
                  {!a2aConfig.endpoint?.trim() && (
                    <div className="flex items-center gap-1.5 text-[10px] text-rose-300 bg-rose-950/30 p-1.5 rounded border border-rose-500/30 mt-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
                      <span>RPC Endpoint URL is required. Paste an agent-card.json in the Card & Skills tab or enter the service URL directly.</span>
                    </div>
                  )}
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
                      placeholder="1.0.0-a2a"
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

                {a2aConfig.preferredTransport && (
                  <div className="text-[10px] text-gray-400 flex items-center justify-between pt-0.5">
                    <span className="font-mono">Preferred Transport:</span>
                    <span className="font-mono text-cyan-300">{a2aConfig.preferredTransport}</span>
                  </div>
                )}
              </div>
            </div>

            {/* SECTION 3: Sub-Agent Authentication & Security Configuration */}
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
                    <span className="text-[9.5px] text-gray-500 font-mono">
                      Environment variable containing bearer JWT token passed in Authorization: Bearer &lt;token&gt; header.
                    </span>
                  </div>
                </div>
              )}

              {a2aConfig.authType === 'api_key' && (
                <div className="space-y-2 pt-1 border-t border-[#30363d]/60">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400">
                      API Key Secret Env Var Name
                    </label>
                    <input
                      type="text"
                      value={a2aConfig.authTokenSecret || ''}
                      onChange={(e) => handleUpdateConfig({ authTokenSecret: e.target.value })}
                      placeholder="A2A_API_KEY"
                      className="w-full px-2 py-1 bg-[#161b22] border border-[#30363d] focus:border-cyan-400 rounded text-[11px] font-mono text-cyan-300 focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400">
                      Custom Header Name
                    </label>
                    <input
                      type="text"
                      value={a2aConfig.headerName || 'X-API-Key'}
                      onChange={(e) => handleUpdateConfig({ headerName: e.target.value })}
                      placeholder="X-API-Key"
                      className="w-full px-2 py-1 bg-[#161b22] border border-[#30363d] focus:border-cyan-400 rounded text-[11px] font-mono text-gray-200 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {a2aConfig.authType === 'oauth2' && (
                <div className="space-y-2 pt-1 border-t border-[#30363d]/60">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400">
                      Token Endpoint URL
                    </label>
                    <input
                      type="text"
                      value={a2aConfig.oauth2Config?.tokenUrl || ''}
                      onChange={(e) => handleUpdateConfig({
                        oauth2Config: { ...(a2aConfig.oauth2Config || { clientId: '', clientSecretEnv: '', scopes: [] }), tokenUrl: e.target.value }
                      })}
                      placeholder="https://oauth2.googleapis.com/token"
                      className="w-full px-2 py-1 bg-[#161b22] border border-[#30363d] focus:border-cyan-400 rounded text-[11px] font-mono text-cyan-300 focus:outline-none"
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
                        onChange={(e) => handleUpdateConfig({
                          oauth2Config: { ...(a2aConfig.oauth2Config || { tokenUrl: '', clientSecretEnv: '', scopes: [] }), clientId: e.target.value }
                        })}
                        placeholder="client-id"
                        className="w-full px-2 py-1 bg-[#161b22] border border-[#30363d] focus:border-cyan-400 rounded text-[11px] font-mono text-gray-200 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400">
                        Client Secret Env
                      </label>
                      <input
                        type="text"
                        value={a2aConfig.oauth2Config?.clientSecretEnv || ''}
                        onChange={(e) => handleUpdateConfig({
                          oauth2Config: { ...(a2aConfig.oauth2Config || { tokenUrl: '', clientId: '', scopes: [] }), clientSecretEnv: e.target.value }
                        })}
                        placeholder="OAUTH2_CLIENT_SECRET"
                        className="w-full px-2 py-1 bg-[#161b22] border border-[#30363d] focus:border-cyan-400 rounded text-[11px] font-mono text-cyan-300 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {a2aConfig.authType === 'google_iam' && (
                <div className="space-y-2 pt-1 border-t border-[#30363d]/60">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400">
                      Target Audience / Client Service URI
                    </label>
                    <input
                      type="text"
                      value={a2aConfig.googleIamConfig?.targetAudience || ''}
                      onChange={(e) => handleUpdateConfig({
                        googleIamConfig: { ...(a2aConfig.googleIamConfig || {}), targetAudience: e.target.value }
                      })}
                      placeholder="https://cloud-run-service.a.run.app"
                      className="w-full px-2 py-1 bg-[#161b22] border border-[#30363d] focus:border-cyan-400 rounded text-[11px] font-mono text-cyan-300 focus:outline-none"
                    />
                    <span className="text-[9.5px] text-gray-500 font-mono">
                      Target service audience used by google-auth or Google Compute / Cloud Run IAM token exchange.
                    </span>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400">
                      Impersonate Service Account (Optional)
                    </label>
                    <input
                      type="text"
                      value={a2aConfig.googleIamConfig?.serviceAccountEmail || ''}
                      onChange={(e) => handleUpdateConfig({
                        googleIamConfig: { ...(a2aConfig.googleIamConfig || {}), serviceAccountEmail: e.target.value }
                      })}
                      placeholder="caller-agent@project.iam.gserviceaccount.com"
                      className="w-full px-2 py-1 bg-[#161b22] border border-[#30363d] focus:border-cyan-400 rounded text-[11px] font-mono text-gray-200 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {a2aConfig.authType === 'mutual_tls' && (
                <div className="text-[10px] text-gray-400 bg-[#161b22] p-2 rounded border border-[#30363d] flex items-center gap-2">
                  <Lock className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span>
                    Mutual TLS requires client certificates configured in deployment environment (e.g., Anthos Service Mesh or SPIFFE).
                  </span>
                </div>
              )}

              {a2aConfig.authType === 'none' && (
                <div className="text-[10px] text-amber-300/80 bg-amber-950/30 p-2 rounded border border-amber-500/20 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    No authorization header will be attached. Use only for internal VPCs or localhost development.
                  </span>
                </div>
              )}
            </div>

            {/* SECTION 4: Custom Headers Pass-through */}
            <div className="p-3 bg-[#0d1117] rounded-lg border border-cyan-500/30 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold uppercase tracking-tight text-gray-400 flex items-center gap-1">
                  <Code2 className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Custom HTTP Headers ({Object.keys(a2aConfig.customHeaders || {}).length})</span>
                </label>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#161b22] text-gray-400 font-mono border border-[#30363d]">
                  RPC Interceptors
                </span>
              </div>

              {/* Active Headers List */}
              {a2aConfig.customHeaders && Object.keys(a2aConfig.customHeaders).length > 0 ? (
                <div className="space-y-1.5">
                  {Object.entries(a2aConfig.customHeaders).map(([key, val]) => (
                    <div
                      key={key}
                      className="flex items-center justify-between p-1.5 bg-[#161b22] rounded border border-[#30363d]"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-mono text-cyan-300 text-[10px] font-bold">{key}:</span>
                        <span className="font-mono text-gray-300 text-[10px] truncate max-w-[170px]">{val}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveHeader(key)}
                        className="p-1 text-gray-500 hover:text-rose-400 hover:bg-rose-950/30 rounded transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[10px] text-gray-500 italic">No custom headers configured.</div>
              )}

              {/* Add New Header */}
              <div className="flex items-center gap-1.5 pt-1">
                <input
                  type="text"
                  value={newHeaderKey}
                  onChange={(e) => setNewHeaderKey(e.target.value)}
                  placeholder="Header Name"
                  className="flex-1 px-2 py-1 bg-[#161b22] border border-[#30363d] focus:border-cyan-400 rounded text-[10px] font-mono text-gray-200 focus:outline-none"
                />
                <input
                  type="text"
                  value={newHeaderVal}
                  onChange={(e) => setNewHeaderVal(e.target.value)}
                  placeholder="Value"
                  className="flex-1 px-2 py-1 bg-[#161b22] border border-[#30363d] focus:border-cyan-400 rounded text-[10px] font-mono text-gray-200 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddHeader}
                  disabled={!newHeaderKey.trim()}
                  className="p-1 bg-[#21262d] hover:bg-cyan-600 disabled:opacity-40 text-white rounded transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* SECTION 6: Protocol Version & Runtime Resilience */}
            <div className="p-3 bg-[#0d1117] rounded-lg border border-cyan-500/30 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold uppercase tracking-tight text-gray-400 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Runtime Resilience & Timeouts</span>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400">
                    Timeout (sec)
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={300}
                    value={a2aConfig.timeoutSeconds}
                    onChange={(e) => handleUpdateConfig({ timeoutSeconds: parseInt(e.target.value, 10) || 30 })}
                    className="w-full px-2 py-1 bg-[#161b22] border border-[#30363d] focus:border-cyan-400 rounded text-[11px] font-mono text-gray-200 focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400">
                    Max Retries
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={10}
                    value={a2aConfig.maxRetries}
                    onChange={(e) => handleUpdateConfig({ maxRetries: parseInt(e.target.value, 10) || 0 })}
                    className="w-full px-2 py-1 bg-[#161b22] border border-[#30363d] focus:border-cyan-400 rounded text-[11px] font-mono text-gray-200 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: SUB-AGENTS (Hidden when no sub-agents connected)                  */}
        {/* ========================================================================= */}
        {activeTab === 'sub_agents' && subAgents.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-tight text-gray-400 flex items-center gap-1">
                <Layers className="w-3 h-3 text-cyan-400" />
                <span>Connected Sub-Agents ({subAgents.length})</span>
              </label>
              <span className="text-[10px] text-gray-400 font-mono">
                Order determines execution flow
              </span>
            </div>

            <p className="text-[10px] text-gray-400 leading-normal">
              Organize multi-agent peer delegation patterns and execution sequences. Sub-agents execute tasks under this A2A agent's coordination.
            </p>

            {/* Pattern Dropdown placed directly above the list */}
            <div className="space-y-1 bg-[#0d1117] p-2.5 rounded-lg border border-cyan-500/30">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold uppercase tracking-tight text-cyan-300">
                  Orchestration Pattern
                </label>
              </div>
              <select
                value={effectivePattern}
                onChange={(e) => {
                  const newPattern = e.target.value as DelegationPattern;
                  const updates: Partial<AgentData> = {
                    subAgentPattern: newPattern,
                    delegationPattern: newPattern,
                  };
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
            {effectivePattern === 'loop' && (
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

            {/* Coordinator / Debate Configuration */}
            {(effectivePattern === 'coordinator' || effectivePattern === 'debate' || agent.debateConfig) && (
                <div className="pt-2 border-t border-[#30363d]/60 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] uppercase font-bold tracking-tight text-pink-300 flex items-center gap-1">
                      <Scale className="w-3 h-3 text-pink-400" />
                      <span>Debate Rounds & Consensus</span>
                    </label>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-pink-950/70 text-pink-300 font-mono border border-pink-500/30">
                      Multi-Agent Deliberation
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] font-medium text-gray-400">Max Rounds</label>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={agent.debateConfig?.maxRounds ?? 2}
                        onChange={(e) => onUpdateAgent({
                          debateConfig: {
                            maxRounds: Math.max(1, parseInt(e.target.value, 10) || 1),
                            consensusThreshold: agent.debateConfig?.consensusThreshold ?? 0.85,
                            earlyStoppingEnabled: agent.debateConfig?.earlyStoppingEnabled ?? true,
                            debateStyle: agent.debateConfig?.debateStyle ?? 'structured_rebuttal',
                            tieBreakerStrategy: agent.debateConfig?.tieBreakerStrategy ?? 'conditional_approval',
                            requireEvidenceCitations: agent.debateConfig?.requireEvidenceCitations ?? true,
                            minWordLimitPerBrief: agent.debateConfig?.minWordLimitPerBrief ?? 250,
                          }
                        })}
                        className="w-full px-2 py-1 bg-[#161b22] border border-[#30363d] focus:border-pink-500 rounded text-xs text-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-medium text-gray-400">Agreement (%)</label>
                      <input
                        type="number"
                        min={50}
                        max={100}
                        step={5}
                        value={Math.round((agent.debateConfig?.consensusThreshold ?? 0.85) * 100)}
                        onChange={(e) => onUpdateAgent({
                          debateConfig: {
                            maxRounds: agent.debateConfig?.maxRounds ?? 2,
                            consensusThreshold: Math.min(1.0, Math.max(0.5, (parseInt(e.target.value, 10) || 85) / 100)),
                            earlyStoppingEnabled: agent.debateConfig?.earlyStoppingEnabled ?? true,
                            debateStyle: agent.debateConfig?.debateStyle ?? 'structured_rebuttal',
                            tieBreakerStrategy: agent.debateConfig?.tieBreakerStrategy ?? 'conditional_approval',
                            requireEvidenceCitations: agent.debateConfig?.requireEvidenceCitations ?? true,
                            minWordLimitPerBrief: agent.debateConfig?.minWordLimitPerBrief ?? 250,
                          }
                        })}
                        className="w-full px-2 py-1 bg-[#161b22] border border-[#30363d] focus:border-pink-500 rounded text-xs text-white"
                      />
                    </div>
                  </div>

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
                    {onSelectAgent && (
                      <button
                        type="button"
                        onClick={() => onSelectAgent(sub.agentId)}
                        title={`Configure ${sub.name}`}
                        className="p-1 text-gray-400 hover:text-cyan-400 hover:bg-[#161b22] rounded transition-colors cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleMoveSubAgent(idx, idx - 1)}
                      disabled={idx === 0}
                      title="Move Up"
                      className="p-1 text-gray-400 hover:text-white disabled:opacity-20 cursor-pointer disabled:cursor-default"
                    >
                      <ChevronUp className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMoveSubAgent(idx, idx + 1)}
                      disabled={idx === subAgents.length - 1}
                      title="Move Down"
                      className="p-1 text-gray-400 hover:text-white disabled:opacity-20 cursor-pointer disabled:cursor-default"
                    >
                      <ChevronDown className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
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
