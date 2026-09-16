/**
 * GuardrailDrawer Component
 *
 * Inspector drawer for Guardrail & Filter Shield Agent nodes.
 * Configures ingress/egress safety policies (PII, Prompt Injection, Toxicity, Secrets),
 * custom regex blocklists, violation actions, and dual output routing (Pass vs. Block paths).
 *
 * Architectural Decisions:
 * 1. Security Gate: Evaluates input query (ingress) and output responses (egress) against safety policies.
 * 2. Dual Sockets: Routes clean payloads to the Pass branch and policy violations to the Block branch.
 * 3. 8pt Grid & Form Consistency: Adheres to standard drawer architecture and design tokens.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import React, { useState } from 'react';
import { 
  ShieldCheck, 
  X, 
  Cpu, 
  AlertCircle, 
  Sliders, 
  Shield, 
  Plus, 
  ArrowRight,
  Info,
  CheckCircle2,
  Ban,
  Lock,
  Eye,
  AlertTriangle,
  Code
} from 'lucide-react';
import { 
  AgentData, 
  GuardrailConfig, 
  ToolDefinition 
} from '../../types';
import { validateAgentIdentifier, sanitizeAgentIdentifier } from '../../../shared/identifierValidation';
import { ModelSelector } from '../drawers/primitives/ModelSelector';

interface GuardrailDrawerProps {
  agent: AgentData;
  allAgents: AgentData[];
  onClose: () => void;
  onUpdateAgent: (updatedData: Partial<AgentData>) => void;
  onOpenAddTool?: () => void;
  onRemoveTool?: () => void;
  onEditTool?: (tool: ToolDefinition) => void;
  onSelectAgent?: (agentId: string) => void;
}

const POLICY_PRESETS: { id: string; label: string; desc: string; icon: React.ReactNode }[] = [
  {
    id: 'pii_redaction',
    label: 'PII Detection & Masking',
    desc: 'Detects and masks SSNs, credit card numbers, emails, and phone numbers.',
    icon: <Lock className="w-3.5 h-3.5 text-teal-400" />,
  },
  {
    id: 'prompt_injection',
    label: 'Prompt Injection Defense',
    desc: 'Detects jailbreak attempts, system prompt overrides, and adversarial instructions.',
    icon: <Shield className="w-3.5 h-3.5 text-amber-400" />,
  },
  {
    id: 'toxicity_filter',
    label: 'Toxicity & Hate Speech Filter',
    desc: 'Blocks offensive, harassing, or sexually explicit user inputs and outputs.',
    icon: <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />,
  },
  {
    id: 'secret_leakage',
    label: 'Secret & Credential Scanner',
    desc: 'Scans for accidental leaks of GCP API keys, private keys, and OAuth tokens.',
    icon: <Eye className="w-3.5 h-3.5 text-sky-400" />,
  },
];

export const GuardrailDrawer: React.FC<GuardrailDrawerProps> = ({
  agent,
  allAgents,
  onClose,
  onUpdateAgent,
}) => {
  const guardrailConfig: GuardrailConfig = agent.guardrailConfig || {
    direction: 'both',
    safetyPolicies: ['pii_redaction', 'prompt_injection'],
    regexPatterns: ['(?i)password\\s*=\\s*\\S+', 'AIZA[0-9A-Za-z-_]{35}'],
    actionOnViolation: 'block',
    customViolationMessage: 'Your request could not be processed due to safety and security policy restrictions.',
  };

  const [newRegexInput, setNewRegexInput] = useState('');

  const otherAgents = allAgents.filter((a) => a.id !== agent.id);

  const currentIdentifier = agent.identifier || agent.name || sanitizeAgentIdentifier(agent.label || agent.id, 'guardrail');
  const identifierValidation = validateAgentIdentifier(currentIdentifier, 'guardrail');

  const handleLabelChange = (newLabel: string) => {
    const oldSanitized = sanitizeAgentIdentifier(agent.label || agent.id, 'guardrail');
    const updates: Partial<AgentData> = { label: newLabel };
    if (!agent.name || agent.name === oldSanitized || !agent.identifier || agent.identifier === oldSanitized) {
      const newSanitized = sanitizeAgentIdentifier(newLabel, 'guardrail');
      updates.name = newSanitized;
      updates.identifier = newSanitized;
    }
    onUpdateAgent(updates);
  };

  const handleIdentifierChange = (rawName: string) => {
    const noSpaces = rawName.replace(/\s+/g, '_');
    onUpdateAgent({ name: noSpaces, identifier: noSpaces });
  };

  const handleUpdateGuardrailConfig = (updates: Partial<GuardrailConfig>) => {
    const newConfig = { ...guardrailConfig, ...updates };
    onUpdateAgent({ guardrailConfig: newConfig });
  };

  const handleTogglePolicy = (policyId: string) => {
    const current = guardrailConfig.safetyPolicies || [];
    const updated = current.includes(policyId)
      ? current.filter((p) => p !== policyId)
      : [...current, policyId];
    handleUpdateGuardrailConfig({ safetyPolicies: updated });
  };

  const handleAddRegex = () => {
    const trimmed = newRegexInput.trim();
    if (!trimmed) return;
    const current = guardrailConfig.regexPatterns || [];
    if (!current.includes(trimmed)) {
      handleUpdateGuardrailConfig({ regexPatterns: [...current, trimmed] });
    }
    setNewRegexInput('');
  };

  const handleRemoveRegex = (pattern: string) => {
    const current = guardrailConfig.regexPatterns || [];
    handleUpdateGuardrailConfig({
      regexPatterns: current.filter((p) => p !== pattern),
    });
  };

  return (
    <div className="absolute top-0 right-0 bottom-0 z-30 w-96 backdrop-blur-2xl bg-[#161b22]/95 border-l border-[#30363d] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200 text-[#c9d1d9]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 bg-[#161b22] border-b border-[#30363d] shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 rounded-lg bg-[#0d1117] border border-teal-500/40 text-teal-400 shrink-0 shadow-xs">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-bold text-white truncate max-w-[200px]">
              {agent.label}
            </h3>
            <span className="text-[10px] text-teal-400 font-mono flex items-center gap-1">
              Guardrail & Security Shield Node
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
        {/* Guardrail Safety Notice */}
        <div className="p-3 bg-teal-950/20 rounded-lg border border-teal-500/30 flex items-start gap-2.5 text-[11px] leading-relaxed text-teal-200">
          <Info className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-teal-300">Security Shield: </span>
            Inspects and filters user input and agent output streams against PII, prompt injections, and banned regex patterns before routing.
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
              Guardrail Node Label
            </label>
            <input
              type="text"
              value={agent.label}
              onChange={(e) => handleLabelChange(e.target.value)}
              placeholder="e.g. Ingress Safety Guardrail"
              className="w-full px-3 py-1.5 bg-[#0d1117] border border-[#30363d] focus:border-teal-500 rounded-lg text-xs text-white focus:outline-none"
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
              placeholder="e.g. ingress_guardrail"
              className={`w-full px-3 py-1.5 bg-[#0d1117] border rounded-lg text-xs font-mono text-white focus:outline-none ${
                identifierValidation.isValid
                  ? 'border-[#30363d] focus:border-teal-500'
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
            <label className="text-[11px] font-bold uppercase tracking-tight text-teal-400 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-teal-400" />
              <span>Inspection Model Engine</span>
            </label>
          </div>

          <ModelSelector
            selectedModel={agent.model || 'gemini-3.7-flash'}
            onChangeModel={(model) => onUpdateAgent({ model })}
          />

          <div className="space-y-1 bg-[#0d1117] p-3 rounded-lg border border-[#30363d]">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-400 flex items-center gap-1">
                <Sliders className="w-3 h-3 text-teal-400" />
                Temperature
              </span>
              <span className="font-mono text-teal-300 font-bold">{agent.temperature ?? 0.0}</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={agent.temperature ?? 0.0}
              onChange={(e) => onUpdateAgent({ temperature: parseFloat(e.target.value) })}
              className="w-full accent-teal-500 cursor-pointer h-1 bg-[#21262d] rounded-lg"
            />
          </div>
        </div>

        {/* SECTION 3: SAFETY POLICIES & DIRECTION */}
        <div className="space-y-3 pt-1 border-t border-[#30363d]">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold uppercase tracking-tight text-teal-400 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-teal-400" />
              <span>Inspection Direction & Policies</span>
            </label>
          </div>

          {/* Direction Toggle */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-tight text-gray-400">
              Inspection Scope
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {(['ingress', 'egress', 'both'] as const).map((dir) => (
                <button
                  key={dir}
                  type="button"
                  onClick={() => handleUpdateGuardrailConfig({ direction: dir })}
                  className={`py-1.5 rounded-lg border text-xs font-mono capitalize transition-colors cursor-pointer ${
                    (guardrailConfig.direction || 'both') === dir
                      ? 'bg-teal-950/30 border-teal-500 text-teal-200 shadow-xs'
                      : 'bg-[#0d1117] border-[#30363d] text-gray-400 hover:border-gray-500'
                  }`}
                >
                  {dir}
                </button>
              ))}
            </div>
          </div>

          {/* Safety Policy Checkboxes */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-tight text-gray-400">
              Built-in Safety Policy Filters
            </label>
            <div className="space-y-1.5">
              {POLICY_PRESETS.map((policy) => {
                const isChecked = (guardrailConfig.safetyPolicies || []).includes(policy.id);
                return (
                  <div
                    key={policy.id}
                    onClick={() => handleTogglePolicy(policy.id)}
                    className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
                      isChecked
                        ? 'bg-teal-950/30 border-teal-500 text-white shadow-xs'
                        : 'bg-[#0d1117] border-[#30363d] hover:border-teal-500/40 text-gray-400'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="flex items-center gap-2">
                        {policy.icon}
                        <span className="font-bold text-xs text-gray-200">{policy.label}</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        className="accent-teal-500 rounded"
                      />
                    </div>
                    <p className="text-[10px] text-gray-400 pl-5.5 leading-relaxed">{policy.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Custom Regex Patterns */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-tight text-gray-400 flex items-center gap-1">
              <Code className="w-3 h-3 text-teal-400" />
              <span>Custom Regex Patterns / Blocklist</span>
            </label>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newRegexInput}
                onChange={(e) => setNewRegexInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddRegex();
                  }
                }}
                placeholder="e.g. (?i)confidential|internal-only"
                className="flex-1 px-3 py-1.5 bg-[#0d1117] border border-[#30363d] focus:border-teal-500 rounded-lg text-xs font-mono text-white focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAddRegex}
                className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 bg-[#0d1117] rounded-lg border border-[#30363d]">
              {(guardrailConfig.regexPatterns || []).map((pattern) => (
                <span
                  key={pattern}
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-teal-500/20 text-teal-300 border border-teal-500/40 text-xs font-mono"
                >
                  <span>{pattern}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveRegex(pattern)}
                    className="text-teal-400 hover:text-teal-200 transition-colors cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Action on Violation */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-tight text-gray-400">
              Action on Policy Violation
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {(['block', 'redact', 'warn'] as const).map((action) => (
                <button
                  key={action}
                  type="button"
                  onClick={() => handleUpdateGuardrailConfig({ actionOnViolation: action })}
                  className={`py-1.5 rounded-lg border text-xs font-mono capitalize transition-colors cursor-pointer ${
                    (guardrailConfig.actionOnViolation || 'block') === action
                      ? 'bg-teal-950/30 border-teal-500 text-teal-200 shadow-xs'
                      : 'bg-[#0d1117] border-[#30363d] text-gray-400 hover:border-gray-500'
                  }`}
                >
                  {action}
                </button>
              ))}
            </div>
          </div>

          {/* Violation Message */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-tight text-gray-400">
              Custom Violation Message
            </label>
            <textarea
              rows={2}
              value={guardrailConfig.customViolationMessage || ''}
              onChange={(e) => handleUpdateGuardrailConfig({ customViolationMessage: e.target.value })}
              placeholder="Message sent when input is blocked..."
              className="w-full px-3 py-1.5 bg-[#0d1117] border border-[#30363d] focus:border-teal-500 rounded-lg text-xs text-white focus:outline-none resize-y font-mono"
            />
          </div>
        </div>

        {/* SECTION 4: DUAL OUTPUT ROUTING */}
        <div className="space-y-3 pt-1 border-t border-[#30363d]">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold uppercase tracking-tight text-teal-400 flex items-center gap-1.5">
              <ArrowRight className="w-3.5 h-3.5 text-teal-400" />
              <span>Dual Output Routing Targets</span>
            </label>
          </div>

          <div className="space-y-3">
            {/* Pass Path */}
            <div className="p-3 bg-teal-950/20 rounded-lg border border-teal-500/30 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-bold text-teal-300">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-teal-400" />
                  Pass Path (Left Socket)
                </span>
              </div>
              <select
                value={guardrailConfig.passTargetAgentId || ''}
                onChange={(e) => handleUpdateGuardrailConfig({ passTargetAgentId: e.target.value || undefined })}
                className="w-full px-3 py-1.5 bg-[#0d1117] border border-[#30363d] focus:border-teal-500 rounded-lg text-xs text-white focus:outline-none"
              >
                <option value="">-- Connect via canvas edge or select agent --</option>
                {otherAgents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label} ({a.agentKind || 'standard'})
                  </option>
                ))}
              </select>
            </div>

            {/* Block Path */}
            <div className="p-3 bg-rose-950/20 rounded-lg border border-rose-500/30 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-bold text-rose-300">
                <span className="flex items-center gap-1.5">
                  <Ban className="w-3.5 h-3.5 text-rose-400" />
                  Block Path (Right Socket)
                </span>
              </div>
              <select
                value={guardrailConfig.blockTargetAgentId || ''}
                onChange={(e) => handleUpdateGuardrailConfig({ blockTargetAgentId: e.target.value || undefined })}
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
