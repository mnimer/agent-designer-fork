/**
 * ApprovalDrawer Component
 *
 * Inspector drawer for Human-in-the-Loop (HITL) Approval Gate nodes.
 * Configures human authorization triggers, timeout policies, notification payloads,
 * and dual output routing (Approved vs. Rejected paths).
 *
 * Architectural Decisions:
 * 1. Resumable Agent Execution: Bridges autonomous agent execution with human oversight.
 * 2. Dual Output Routing: Features explicit Approved and Rejected branching targets.
 * 3. 8pt Grid & Form Consistency: Adheres to the established layout, styling, and spacing standards.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import React, { useState } from 'react';
import { 
  ShieldAlert, 
  X, 
  Cpu, 
  AlertCircle, 
  Sliders, 
  Clock, 
  Plus, 
  Users, 
  ArrowRight,
  Info,
  CheckCircle2,
  XCircle,
  Bell
} from 'lucide-react';
import { 
  AgentData, 
  HitlConfig, 
  ToolDefinition 
} from '../../types';
import { validateAgentIdentifier, sanitizeAgentIdentifier } from '../../../shared/identifierValidation';
import { ModelSelector } from '../drawers/primitives/ModelSelector';

interface ApprovalDrawerProps {
  agent: AgentData;
  allAgents: AgentData[];
  onClose: () => void;
  onUpdateAgent: (updatedData: Partial<AgentData>) => void;
  onOpenAddTool?: () => void;
  onRemoveTool?: () => void;
  onEditTool?: (tool: ToolDefinition) => void;
  onSelectAgent?: (agentId: string) => void;
}

export const ApprovalDrawer: React.FC<ApprovalDrawerProps> = ({
  agent,
  allAgents,
  onClose,
  onUpdateAgent,
}) => {
  const hitlConfig: HitlConfig = agent.hitlConfig || {
    approvalCondition: "action_type == 'destructive' or amount > 1000",
    timeoutHours: 24,
    autoRejectOnTimeout: true,
    notificationPayload: 'Please review and approve this automated agent operation.',
    requestPrompt: 'Do you authorize this transaction / system action?',
    reviewerRoles: ['admin', 'security_team'],
  };

  const [newRoleInput, setNewRoleInput] = useState('');

  const otherAgents = allAgents.filter((a) => a.id !== agent.id);

  const currentIdentifier = agent.identifier || agent.name || sanitizeAgentIdentifier(agent.label || agent.id, 'hitl');
  const identifierValidation = validateAgentIdentifier(currentIdentifier, 'hitl');

  const handleLabelChange = (newLabel: string) => {
    const oldSanitized = sanitizeAgentIdentifier(agent.label || agent.id, 'hitl');
    const updates: Partial<AgentData> = { label: newLabel };
    if (!agent.name || agent.name === oldSanitized || !agent.identifier || agent.identifier === oldSanitized) {
      const newSanitized = sanitizeAgentIdentifier(newLabel, 'hitl');
      updates.name = newSanitized;
      updates.identifier = newSanitized;
    }
    onUpdateAgent(updates);
  };

  const handleIdentifierChange = (rawName: string) => {
    const noSpaces = rawName.replace(/\s+/g, '_');
    onUpdateAgent({ name: noSpaces, identifier: noSpaces });
  };

  const handleUpdateHitlConfig = (updates: Partial<HitlConfig>) => {
    const newConfig = { ...hitlConfig, ...updates };
    onUpdateAgent({ hitlConfig: newConfig });
  };

  const handleAddRole = () => {
    const trimmed = newRoleInput.trim();
    if (!trimmed) return;
    const currentRoles = hitlConfig.reviewerRoles || [];
    if (!currentRoles.includes(trimmed)) {
      handleUpdateHitlConfig({ reviewerRoles: [...currentRoles, trimmed] });
    }
    setNewRoleInput('');
  };

  const handleRemoveRole = (roleToRemove: string) => {
    const currentRoles = hitlConfig.reviewerRoles || [];
    handleUpdateHitlConfig({
      reviewerRoles: currentRoles.filter((r) => r !== roleToRemove),
    });
  };

  return (
    <div className="absolute top-0 right-0 bottom-0 z-30 w-96 backdrop-blur-2xl bg-[#161b22]/95 border-l border-[#30363d] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200 text-[#c9d1d9]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 bg-[#161b22] border-b border-[#30363d] shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 rounded-lg bg-[#0d1117] border border-amber-500/40 text-amber-400 shrink-0 shadow-xs">
            <ShieldAlert className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-bold text-white truncate max-w-[200px]">
              {agent.label}
            </h3>
            <span className="text-[10px] text-amber-400 font-mono flex items-center gap-1">
              Human-in-the-Loop Approval Gate
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
        {/* HITL Resumability Notice */}
        <div className="p-3 bg-amber-950/20 rounded-lg border border-amber-500/30 flex items-start gap-2.5 text-[11px] leading-relaxed text-amber-200">
          <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-amber-300">Approval Gate: </span>
            Suspends automated execution until human authorization is received. Configures Python ADK ResumabilityConfig for state checkpointing.
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
              Approval Gate Label
            </label>
            <input
              type="text"
              value={agent.label}
              onChange={(e) => handleLabelChange(e.target.value)}
              placeholder="e.g. Production Deployment Approval"
              className="w-full px-3 py-1.5 bg-[#0d1117] border border-[#30363d] focus:border-amber-500 rounded-lg text-xs text-white focus:outline-none"
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
              placeholder="e.g. approval_gate"
              className={`w-full px-3 py-1.5 bg-[#0d1117] border rounded-lg text-xs font-mono text-white focus:outline-none ${
                identifierValidation.isValid
                  ? 'border-[#30363d] focus:border-amber-500'
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

          <div className="space-y-1">
            <label className="text-[11px] font-bold uppercase tracking-tight text-gray-400">
              Request Prompt for Human Reviewer
            </label>
            <textarea
              rows={2}
              value={hitlConfig.requestPrompt || ''}
              onChange={(e) => handleUpdateHitlConfig({ requestPrompt: e.target.value })}
              placeholder="e.g. Do you authorize this transaction / system action?"
              className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] focus:border-amber-500 rounded-lg text-xs text-white focus:outline-none resize-y leading-relaxed font-mono"
            />
          </div>
        </div>

        {/* SECTION 2: MODEL CONFIGURATION */}
        <div className="space-y-3 pt-1 border-t border-[#30363d]">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold uppercase tracking-tight text-amber-400 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-amber-400" />
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
                <Sliders className="w-3 h-3 text-amber-400" />
                Temperature
              </span>
              <span className="font-mono text-amber-300 font-bold">{agent.temperature ?? 0.0}</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={agent.temperature ?? 0.0}
              onChange={(e) => onUpdateAgent({ temperature: parseFloat(e.target.value) })}
              className="w-full accent-amber-500 cursor-pointer h-1 bg-[#21262d] rounded-lg"
            />
            <div className="flex justify-between text-[9px] text-gray-400">
              <span>0.0 (Deterministic)</span>
              <span>1.0 (Creative)</span>
            </div>
          </div>
        </div>

        {/* SECTION 3: APPROVAL POLICIES & TIMEOUT */}
        <div className="space-y-3 pt-1 border-t border-[#30363d]">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold uppercase tracking-tight text-amber-400 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>Gate Conditions & Timeouts</span>
            </label>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-tight text-gray-400">
              Approval Condition Expression
            </label>
            <input
              type="text"
              value={hitlConfig.approvalCondition || ''}
              onChange={(e) => handleUpdateHitlConfig({ approvalCondition: e.target.value })}
              placeholder="e.g. action_type == 'destructive' or amount > 1000"
              className="w-full px-3 py-1.5 bg-[#0d1117] border border-[#30363d] focus:border-amber-500 rounded-lg text-xs font-mono text-white focus:outline-none"
            />
            <span className="text-[10px] text-gray-400">
              Evaluates against state. If true, the gate suspends for human review.
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-tight text-gray-400">
                Timeout (Hours)
              </label>
              <input
                type="number"
                min="1"
                max="168"
                value={hitlConfig.timeoutHours ?? 24}
                onChange={(e) => handleUpdateHitlConfig({ timeoutHours: parseInt(e.target.value, 10) || 24 })}
                className="w-full px-3 py-1.5 bg-[#0d1117] border border-[#30363d] focus:border-amber-500 rounded-lg text-xs font-mono text-white focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-tight text-gray-400">
                On Timeout Action
              </label>
              <button
                type="button"
                onClick={() => handleUpdateHitlConfig({ autoRejectOnTimeout: !hitlConfig.autoRejectOnTimeout })}
                className={`w-full px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center justify-between cursor-pointer transition-colors ${
                  hitlConfig.autoRejectOnTimeout
                    ? 'bg-rose-950/30 border-rose-500 text-rose-300'
                    : 'bg-emerald-950/30 border-emerald-500 text-emerald-300'
                }`}
              >
                <span>{hitlConfig.autoRejectOnTimeout ? 'Auto-Reject' : 'Auto-Approve'}</span>
                {hitlConfig.autoRejectOnTimeout ? (
                  <XCircle className="w-3.5 h-3.5 text-rose-400" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                )}
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-tight text-gray-400 flex items-center gap-1">
              <Bell className="w-3 h-3 text-amber-400" />
              <span>Notification Payload</span>
            </label>
            <input
              type="text"
              value={hitlConfig.notificationPayload || ''}
              onChange={(e) => handleUpdateHitlConfig({ notificationPayload: e.target.value })}
              placeholder="e.g. Agent operation requires human authorization"
              className="w-full px-3 py-1.5 bg-[#0d1117] border border-[#30363d] focus:border-amber-500 rounded-lg text-xs text-white focus:outline-none"
            />
          </div>

          {/* Reviewer Roles */}
          <div className="space-y-2 pt-1">
            <label className="text-[10px] font-bold uppercase tracking-tight text-gray-400 flex items-center gap-1">
              <Users className="w-3 h-3 text-amber-400" />
              <span>Authorized Reviewer Roles</span>
            </label>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newRoleInput}
                onChange={(e) => setNewRoleInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddRole();
                  }
                }}
                placeholder="e.g. security_admin, manager"
                className="flex-1 px-3 py-1.5 bg-[#0d1117] border border-[#30363d] focus:border-amber-500 rounded-lg text-xs font-mono text-white focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAddRole}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 bg-[#0d1117] rounded-lg border border-[#30363d]">
              {(hitlConfig.reviewerRoles || []).map((role) => (
                <span
                  key={role}
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-mono"
                >
                  <span>{role}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveRole(role)}
                    className="text-amber-400 hover:text-amber-200 transition-colors cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* SECTION 4: DUAL OUTPUT ROUTING */}
        <div className="space-y-3 pt-1 border-t border-[#30363d]">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold uppercase tracking-tight text-amber-400 flex items-center gap-1.5">
              <ArrowRight className="w-3.5 h-3.5 text-amber-400" />
              <span>Dual Output Routing Targets</span>
            </label>
          </div>

          <div className="space-y-3">
            {/* Approved Destination */}
            <div className="p-3 bg-emerald-950/20 rounded-lg border border-emerald-500/30 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-bold text-emerald-300">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  Approved Path (Left Socket)
                </span>
              </div>
              <select
                value={hitlConfig.approvedTargetAgentId || ''}
                onChange={(e) => handleUpdateHitlConfig({ approvedTargetAgentId: e.target.value || undefined })}
                className="w-full px-3 py-1.5 bg-[#0d1117] border border-[#30363d] focus:border-emerald-500 rounded-lg text-xs text-white focus:outline-none"
              >
                <option value="">-- Connect via canvas edge or select agent --</option>
                {otherAgents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label} ({a.agentKind || 'standard'})
                  </option>
                ))}
              </select>
            </div>

            {/* Rejected Destination */}
            <div className="p-3 bg-rose-950/20 rounded-lg border border-rose-500/30 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-bold text-rose-300">
                <span className="flex items-center gap-1.5">
                  <XCircle className="w-3.5 h-3.5 text-rose-400" />
                  Rejected Path (Right Socket)
                </span>
              </div>
              <select
                value={hitlConfig.rejectedTargetAgentId || ''}
                onChange={(e) => handleUpdateHitlConfig({ rejectedTargetAgentId: e.target.value || undefined })}
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
