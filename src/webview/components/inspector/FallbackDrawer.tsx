/**
 * FallbackDrawer Component
 *
 * Inspector drawer for Fallback & Circuit Breaker Agent nodes.
 * Configures automatic exception catching (HTTP 429, 503, Resource Exhausted),
 * retry intervals, static responses, and dual output routing (Primary vs. Fallback paths).
 *
 * Architectural Decisions:
 * 1. Resilience Pattern: Wraps primary agent execution in try/except blocks in Python ADK.
 * 2. Dual Sockets: Dispatches execution to the primary candidate or routes to the fallback agent upon failure.
 * 3. 8pt Grid & Consistency: Uses unified styling, badges, inputs, and typography.
 * 4. Full-Height Viewport Drawer: Uses fixed inset-y-0 right-0 z-50 w-[420px] overlay to span full viewport height over bottom panels, matching TriggerDrawer.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import React, { useState } from 'react';
import { 
  LifeBuoy, 
  X, 
  Cpu, 
  AlertCircle, 
  Sliders, 
  RefreshCw, 
  Plus, 
  ArrowRight,
  Info,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Shield,
  Check
} from 'lucide-react';
import { 
  AgentData, 
  FallbackConfig, 
  ToolDefinition 
} from '../../types';
import { validateAgentIdentifier, sanitizeAgentIdentifier } from '../../../shared/identifierValidation';
import { ModelSelector } from '../drawers/primitives/ModelSelector';

interface FallbackDrawerProps {
  agent: AgentData;
  allAgents: AgentData[];
  onClose: () => void;
  onUpdateAgent: (updatedData: Partial<AgentData>) => void;
  onOpenAddTool?: () => void;
  onRemoveTool?: () => void;
  onEditTool?: (tool: ToolDefinition) => void;
  onSelectAgent?: (agentId: string) => void;
}

const COMMON_ERROR_CODES = ['429', '500', '503', 'RESOURCE_EXHAUSTED', 'DEADLINE_EXCEEDED', 'QUOTA_EXCEEDED'];

const STRATEGY_OPTIONS: { id: 'static_response' | 'alternative_model' | 'escalate_agent'; label: string; desc: string }[] = [
  {
    id: 'escalate_agent',
    label: 'Escalate to Fallback Agent',
    desc: 'Routes the request and context payload to a secondary agent node when primary fails.',
  },
  {
    id: 'static_response',
    label: 'Static Fallback Response',
    desc: 'Returns a predefined, graceful fallback message immediately without escalating.',
  },
  {
    id: 'alternative_model',
    label: 'Alternative Model Degradation',
    desc: 'Retries execution using a smaller, higher-availability model tier.',
  },
];

export const FallbackDrawer: React.FC<FallbackDrawerProps> = ({
  agent,
  allAgents,
  onClose,
  onUpdateAgent,
}) => {
  const fallbackConfig: FallbackConfig = agent.fallbackConfig || {
    maxRetries: 3,
    retryDelayMs: 1000,
    caughtErrorCodes: ['429', '500', '503', 'RESOURCE_EXHAUSTED'],
    fallbackStrategy: 'escalate_agent',
    staticFallbackMessage: 'The primary service is currently experiencing high load. Please retry in a few moments.',
  };

  const [newErrorCodeInput, setNewErrorCodeInput] = useState('');

  const otherAgents = allAgents.filter((a) => a.id !== agent.id);

  const currentIdentifier = agent.identifier || agent.name || sanitizeAgentIdentifier(agent.label || agent.id, 'fallback');
  const identifierValidation = validateAgentIdentifier(currentIdentifier, 'fallback');

  const handleLabelChange = (newLabel: string) => {
    const oldSanitized = sanitizeAgentIdentifier(agent.label || agent.id, 'fallback');
    const updates: Partial<AgentData> = { label: newLabel };
    if (!agent.name || agent.name === oldSanitized || !agent.identifier || agent.identifier === oldSanitized) {
      const newSanitized = sanitizeAgentIdentifier(newLabel, 'fallback');
      updates.name = newSanitized;
      updates.identifier = newSanitized;
    }
    onUpdateAgent(updates);
  };

  const handleIdentifierChange = (rawName: string) => {
    const noSpaces = rawName.replace(/\s+/g, '_');
    onUpdateAgent({ name: noSpaces, identifier: noSpaces });
  };

  const handleUpdateFallbackConfig = (updates: Partial<FallbackConfig>) => {
    const newConfig = { ...fallbackConfig, ...updates };
    onUpdateAgent({ fallbackConfig: newConfig });
  };

  const handleAddErrorCode = (codeToAdd: string) => {
    const trimmed = codeToAdd.trim();
    if (!trimmed) return;
    const currentCodes = fallbackConfig.caughtErrorCodes || [];
    if (!currentCodes.includes(trimmed)) {
      handleUpdateFallbackConfig({ caughtErrorCodes: [...currentCodes, trimmed] });
    }
    setNewErrorCodeInput('');
  };

  const handleRemoveErrorCode = (codeToRemove: string) => {
    const currentCodes = fallbackConfig.caughtErrorCodes || [];
    handleUpdateFallbackConfig({
      caughtErrorCodes: currentCodes.filter((c) => c !== codeToRemove),
    });
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-[420px] bg-[#161b22] border-l border-[#30363d] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200 text-[#c9d1d9] font-sans">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 bg-[#161b22] border-b border-[#30363d] shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 rounded-lg bg-[#0d1117] border border-rose-500/40 text-rose-400 shrink-0 shadow-xs">
            <LifeBuoy className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-bold text-white truncate max-w-[200px]">
              {agent.label}
            </h3>
            <span className="text-[10px] text-rose-400 font-mono flex items-center gap-1">
              Fallback & Circuit Breaker Node
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-gray-400 hover:text-white hover:bg-[#30363d] transition-colors cursor-pointer"
          title="Close drawer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body Form */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar">
        {/* Resilience Architecture Notice */}
        <div className="p-3 bg-rose-950/20 rounded-lg border border-rose-500/30 flex items-start gap-2.5 text-[11px] leading-relaxed text-rose-200">
          <Info className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-rose-300">Circuit Breaker: </span>
            Protects workflows against API rate limits (429), timeouts, and service outages by automatically routing failures to a recovery fallback agent.
          </div>
        </div>

        {/* SECTION 1: AGENT IDENTITY */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold uppercase tracking-tight text-gray-400">
              Agent Identity
            </label>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold uppercase tracking-tight text-gray-400">
              Circuit Breaker Label
            </label>
            <input
              type="text"
              value={agent.label}
              onChange={(e) => handleLabelChange(e.target.value)}
              placeholder="e.g. Model Fallback Guard"
              className="w-full px-3 py-1.5 bg-[#0d1117] border border-[#30363d] focus:border-rose-500 rounded-lg text-xs text-white focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-tight text-gray-400">
                Identifier (Python ID)
              </label>
              <span className="text-[10px] text-gray-400 font-mono">ADK node name</span>
            </div>
            <input
              type="text"
              value={currentIdentifier}
              onChange={(e) => handleIdentifierChange(e.target.value)}
              placeholder="e.g. model_fallback_guard"
              className={`w-full px-3 py-1.5 bg-[#0d1117] border rounded-lg text-xs font-mono text-white focus:outline-none ${
                identifierValidation.isValid
                  ? 'border-[#30363d] focus:border-rose-500'
                  : 'border-red-500 focus:border-red-500 bg-red-950/20'
              }`}
            />
            {!identifierValidation.isValid && (
              <div className="flex items-center gap-1.5 text-[11px] text-red-400 mt-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{identifierValidation.error}</span>
              </div>
            )}
          </div>
        </div>

        {/* SECTION 2: MODEL CONFIGURATION */}
        <div className="space-y-3 pt-1 border-t border-[#30363d]">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold uppercase tracking-tight text-rose-400 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-rose-400" />
              <span>Model & Reasoning Engine</span>
            </label>
          </div>

          <ModelSelector
            selectedModel={agent.model || 'gemini-3.7-flash'}
            onChangeModel={(model) => onUpdateAgent({ model })}
          />

          <div className="space-y-1 bg-[#0d1117] p-3 rounded-lg border border-[#30363d]">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-400 flex items-center gap-1">
                <Sliders className="w-3 h-3 text-rose-400" />
                Temperature
              </span>
              <span className="font-mono text-rose-300 font-bold">{agent.temperature ?? 0.0}</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={agent.temperature ?? 0.0}
              onChange={(e) => onUpdateAgent({ temperature: parseFloat(e.target.value) })}
              className="w-full accent-rose-500 cursor-pointer h-1 bg-[#21262d] rounded-lg"
            />
          </div>
        </div>

        {/* SECTION 3: CIRCUIT BREAKER & RETRY POLICIES */}
        <div className="space-y-3 pt-1 border-t border-[#30363d]">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold uppercase tracking-tight text-rose-400 flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5 text-rose-400" />
              <span>Retry Policy & Caught Error Codes</span>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-tight text-gray-400">
                Max Retries
              </label>
              <input
                type="number"
                min="1"
                max="10"
                value={fallbackConfig.maxRetries ?? 3}
                onChange={(e) => handleUpdateFallbackConfig({ maxRetries: parseInt(e.target.value, 10) || 3 })}
                className="w-full px-3 py-1.5 bg-[#0d1117] border border-[#30363d] focus:border-rose-500 rounded-lg text-xs font-mono text-white focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-tight text-gray-400">
                Retry Delay (ms)
              </label>
              <input
                type="number"
                min="100"
                step="100"
                value={fallbackConfig.retryDelayMs ?? 1000}
                onChange={(e) => handleUpdateFallbackConfig({ retryDelayMs: parseInt(e.target.value, 10) || 1000 })}
                className="w-full px-3 py-1.5 bg-[#0d1117] border border-[#30363d] focus:border-rose-500 rounded-lg text-xs font-mono text-white focus:outline-none"
              />
            </div>
          </div>

          {/* Caught Error Codes */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-tight text-gray-400">
              Caught Error Exceptions
            </label>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newErrorCodeInput}
                onChange={(e) => setNewErrorCodeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddErrorCode(newErrorCodeInput);
                  }
                }}
                placeholder="e.g. 429, 503, TIMEOUT"
                className="flex-1 px-3 py-1.5 bg-[#0d1117] border border-[#30363d] focus:border-rose-500 rounded-lg text-xs font-mono text-white focus:outline-none"
              />
              <button
                type="button"
                onClick={() => handleAddErrorCode(newErrorCodeInput)}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add
              </button>
            </div>

            {/* Quick Preset Buttons */}
            <div className="flex flex-wrap gap-1">
              {COMMON_ERROR_CODES.map((code) => {
                const isIncluded = (fallbackConfig.caughtErrorCodes || []).includes(code);
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => isIncluded ? handleRemoveErrorCode(code) : handleAddErrorCode(code)}
                    className={`text-[9px] font-mono px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${
                      isIncluded
                        ? 'bg-rose-500/30 text-rose-200 border-rose-500/50'
                        : 'bg-[#161b22] text-gray-400 border-[#30363d] hover:border-gray-500'
                    }`}
                  >
                    {isIncluded ? `✓ ${code}` : `+ ${code}`}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 bg-[#0d1117] rounded-lg border border-[#30363d]">
              {(fallbackConfig.caughtErrorCodes || []).map((code) => (
                <span
                  key={code}
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/40 text-xs font-mono"
                >
                  <span>{code}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveErrorCode(code)}
                    className="text-rose-400 hover:text-rose-200 transition-colors cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Strategy Options */}
          <div className="space-y-1.5 pt-1">
            <label className="text-[10px] font-bold uppercase tracking-tight text-gray-400">
              Fallback Recovery Strategy
            </label>
            <div className="grid grid-cols-1 gap-1.5">
              {STRATEGY_OPTIONS.map((strat) => {
                const isSelected = (fallbackConfig.fallbackStrategy || 'escalate_agent') === strat.id;
                return (
                  <div
                    key={strat.id}
                    onClick={() => handleUpdateFallbackConfig({ fallbackStrategy: strat.id })}
                    className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-rose-950/30 border-rose-500 text-white shadow-xs'
                        : 'bg-[#0d1117] border-[#30363d] hover:border-rose-500/40 text-gray-400'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="font-bold text-xs text-gray-200">{strat.label}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-rose-400" />}
                    </div>
                    <p className="text-[10px] text-gray-400 leading-relaxed">{strat.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Static message if strategy is static_response */}
          {fallbackConfig.fallbackStrategy === 'static_response' && (
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-tight text-gray-400">
                Static Fallback Message
              </label>
              <textarea
                rows={2}
                value={fallbackConfig.staticFallbackMessage || ''}
                onChange={(e) => handleUpdateFallbackConfig({ staticFallbackMessage: e.target.value })}
                placeholder="Message returned to user on failure..."
                className="w-full px-3 py-1.5 bg-[#0d1117] border border-[#30363d] focus:border-rose-500 rounded-lg text-xs text-white focus:outline-none resize-y font-mono"
              />
            </div>
          )}
        </div>

        {/* SECTION 4: DUAL OUTPUT ROUTING */}
        <div className="space-y-3 pt-1 border-t border-[#30363d]">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold uppercase tracking-tight text-rose-400 flex items-center gap-1.5">
              <ArrowRight className="w-3.5 h-3.5 text-rose-400" />
              <span>Dual Output Routing Targets</span>
            </label>
          </div>

          <div className="space-y-3">
            {/* Primary Path */}
            <div className="p-3 bg-blue-950/20 rounded-lg border border-blue-500/30 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-bold text-blue-300">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
                  Primary Path (Left Socket)
                </span>
              </div>
              <select
                value={fallbackConfig.primaryTargetAgentId || ''}
                onChange={(e) => handleUpdateFallbackConfig({ primaryTargetAgentId: e.target.value || undefined })}
                className="w-full px-3 py-1.5 bg-[#0d1117] border border-[#30363d] focus:border-blue-500 rounded-lg text-xs text-white focus:outline-none"
              >
                <option value="">-- Connect via canvas edge or select agent --</option>
                {otherAgents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label} ({a.agentKind || 'standard'})
                  </option>
                ))}
              </select>
            </div>

            {/* Fallback Recovery Path */}
            <div className="p-3 bg-rose-950/20 rounded-lg border border-rose-500/30 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-bold text-rose-300">
                <span className="flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                  Fallback Recovery Path (Right Socket)
                </span>
              </div>
              <select
                value={fallbackConfig.fallbackTargetAgentId || ''}
                onChange={(e) => handleUpdateFallbackConfig({ fallbackTargetAgentId: e.target.value || undefined })}
                className="w-full px-3 py-1.5 bg-[#0d1117] border border-[#30363d] focus:border-rose-500 rounded-lg text-xs text-white focus:outline-none"
              >
                <option value="">-- Connect via canvas edge or select agent --</option>
                {otherAgents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label} ({a.agentKind || 'standard'})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
