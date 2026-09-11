/**
 * RouterAgentDrawer Component
 *
 * Inspector drawer for Router (if/else) nodes, supporting boolean expression
 * evaluation, LLM classification, quality threshold gating, and multi-branch execution.
 * Includes bidirectional agent kind switching across Standard, A2A, and Router nodes.
 *
 * Architectural Decisions:
 * 1. Unified Kind Selector: Enables instant conversion of any node into a Router, Standard, or A2A node.
 * 2. Visual Branch Management: Dynamic rule-based routing with fallback handling.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import React, { useState } from 'react';
import { 
  GitBranch, 
  X, 
  Layers, 
  Plus, 
  Trash2, 
  ArrowRight, 
  HelpCircle, 
  Check, 
  Code2, 
  Scale, 
  AlertTriangle,
  Zap,
  Split,
  CornerDownRight,
  Sparkles,
  Cpu,
  AlertCircle,
  Wrench,
  Pencil,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import { 
  AgentData, 
  RouterConfig, 
  RouterEvaluationMode, 
  RouterBranchCondition,
  ToolDefinition
} from '../../types';
import { validateAgentIdentifier, sanitizeAgentIdentifier } from '../../../shared/identifierValidation';

interface RouterAgentDrawerProps {
  agent: AgentData;
  allAgents: AgentData[];
  onClose: () => void;
  onUpdateAgent: (updatedData: Partial<AgentData>) => void;
  onOpenAddTool?: () => void;
  onRemoveTool?: (toolId: string) => void;
  onEditTool?: (tool: ToolDefinition) => void;
  onSelectAgent?: (agentId: string) => void;
}

const SUPPORTED_MODELS = [
  { id: 'gemini-3.7-flash', name: 'Gemini 3.7 Flash (Recommended - Global Region)', desc: 'Next-gen hybrid reasoning intent classifier and JSON branch decision engine on Vertex AI' },
  { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash', desc: 'Ultra-fast intent classifier and JSON branch decision engine on Vertex AI' },
];

const EVALUATION_MODES: { id: RouterEvaluationMode; label: string; icon: React.ReactNode; desc: string; badge: string }[] = [
  {
    id: 'boolean_expression',
    label: 'Boolean / State Expression',
    icon: <Zap className="w-4 h-4 text-emerald-400" />,
    desc: 'Evaluates Python/JS boolean expressions against state variables (e.g. state.score >= 0.8)',
    badge: 'Fast / Deterministic',
  },
  {
    id: 'llm_classifier',
    label: 'LLM Intent Classifier',
    icon: <Sparkles className="w-4 h-4 text-purple-400" />,
    desc: 'Uses a lightweight reasoning model to classify natural language into branch categories',
    badge: 'Semantic Reasoning',
  },
  {
    id: 'threshold_score',
    label: 'Threshold & Metric Score',
    icon: <Scale className="w-4 h-4 text-amber-400" />,
    desc: 'Numeric comparison against confidence or quality score threshold (e.g. score >= 0.85)',
    badge: 'Quality Gate',
  },
  {
    id: 'pattern_match',
    label: 'Pattern / Regex Match',
    icon: <Code2 className="w-4 h-4 text-sky-400" />,
    desc: 'Matches output string against regex patterns or exact enum tokens',
    badge: 'Token Match',
  },
];

/**
 * Returns user-facing label, placeholder, and helper text for a branch condition
 * tailored to the selected evaluation mode and default fallback status.
 */
export const getConditionFieldMeta = (mode: RouterEvaluationMode, isDefault: boolean) => {
  if (isDefault) {
    return {
      label: 'Fallback Route',
      placeholder: 'default',
      helpText: 'Catch-all branch triggered when no preceding branch conditions match.',
    };
  }
  switch (mode) {
    case 'boolean_expression':
    case 'boolean':
      return {
        label: 'Boolean State Expression',
        placeholder: "e.g. state.status == 'passed' or state.score >= 0.8",
        helpText: 'Evaluates Python/JS boolean expression against session state (e.g. state.status == "passed").',
      };
    case 'llm_classifier':
    case 'intent_classifier':
      return {
        label: 'Intent Category / Keywords',
        placeholder: 'e.g. billing_inquiry, tech_support, refund_request',
        helpText: 'Semantic intent label assigned by the Gemini reasoning model.',
      };
    case 'threshold_score':
    case 'numeric_threshold':
      return {
        label: 'Threshold Expression (Optional)',
        placeholder: 'e.g. score >= 0.85 (leave blank to use default threshold)',
        helpText: 'Custom threshold condition (e.g. score >= 0.85) or leave blank for default gate.',
      };
    case 'pattern_match':
      return {
        label: 'Regular Expression (Regex Pattern)',
        placeholder: 'e.g. ^(cancel|refund|return)|order_[0-9]+',
        helpText: 'Python regex pattern evaluated against user query or target state variable.',
      };
    default:
      return {
        label: 'Condition / Intent Match',
        placeholder: "e.g. state.status == 'passed'",
        helpText: 'Condition evaluated to select this branch.',
      };
  }
};

export const RouterAgentDrawer: React.FC<RouterAgentDrawerProps> = ({
  agent,
  allAgents,
  onClose,
  onUpdateAgent,
  onOpenAddTool,
  onRemoveTool,
  onEditTool,
  onSelectAgent,
}) => {
  // Ensure default routerConfig exists
  const routerConfig: RouterConfig = agent.routerConfig || {
    evaluationMode: 'boolean_expression',
    routingPrompt: 'Analyze the incoming state payload or evaluation score to select the appropriate branch.',
    expressionVariable: 'status',
    thresholdValue: 0.8,
    fallbackBranch: 'else_branch',
    branches: [
      {
        id: 'branch_pass',
        label: 'If: Test Passed / Approved',
        conditionExpression: "state.status == 'passed' or state.score >= 0.8",
        isDefault: false,
        description: 'Proceeds to the next phase when criteria are satisfied',
      },
      {
        id: 'branch_fail',
        label: 'Else: Needs Refactor / Loop',
        conditionExpression: "state.status == 'failed' or state.score < 0.8",
        isDefault: false,
        description: 'Loops back to refactoring or repair agent',
      },
      {
        id: 'branch_default',
        label: 'Default / Else Fallback',
        conditionExpression: 'default',
        isDefault: true,
        description: 'Default fallback route if no conditions match',
      },
    ],
  };

  const otherAgents = allAgents.filter((a) => a.id !== agent.id);

  const currentIdentifier = agent.identifier || agent.name || sanitizeAgentIdentifier(agent.label || agent.id, 'router');
  const identifierValidation = validateAgentIdentifier(currentIdentifier, 'router');

  const handleLabelChange = (newLabel: string) => {
    const oldSanitized = sanitizeAgentIdentifier(agent.label || agent.id, 'router');
    const updates: Partial<AgentData> = { label: newLabel };
    if (!agent.name || agent.name === oldSanitized || !agent.identifier || agent.identifier === oldSanitized) {
      const newSanitized = sanitizeAgentIdentifier(newLabel, 'router');
      updates.name = newSanitized;
      updates.identifier = newSanitized;
    }
    onUpdateAgent(updates);
  };

  const handleIdentifierChange = (rawName: string) => {
    const noSpaces = rawName.replace(/\s+/g, '_');
    onUpdateAgent({ name: noSpaces, identifier: noSpaces });
  };

  const handleUpdateRouterConfig = (updates: Partial<RouterConfig>) => {
    const newConfig = { ...routerConfig, ...updates };
    onUpdateAgent({ routerConfig: newConfig });
  };

  const handleUpdateBranch = (branchId: string, updates: Partial<RouterBranchCondition>) => {
    const updatedBranches = routerConfig.branches.map((b) =>
      b.id === branchId ? { ...b, ...updates } : b
    );
    handleUpdateRouterConfig({ branches: updatedBranches });
  };

  const handleAddBranch = () => {
    const branchCount = routerConfig.branches.length + 1;
    const newBranch: RouterBranchCondition = {
      id: `branch_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 3)}`,
      label: `Branch ${branchCount} (Condition)`,
      conditionExpression: `state.score >= 0.${branchCount * 2}`,
      isDefault: false,
      description: 'Conditional workflow destination',
    };
    handleUpdateRouterConfig({ branches: [...routerConfig.branches, newBranch] });
  };

  const handleDeleteBranch = (branchId: string) => {
    if (routerConfig.branches.length <= 1) return;
    const filtered = routerConfig.branches.filter((b) => b.id !== branchId);
    handleUpdateRouterConfig({ branches: filtered });
  };

  /**
   * Reorders a branch up or down in the branches list.
   *
   * @param index - Current index of the branch
   * @param direction - -1 to move up, 1 to move down
   */
  const handleMoveBranch = (index: number, direction: number) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= routerConfig.branches.length) return;
    const newBranches = [...routerConfig.branches];
    const [moved] = newBranches.splice(index, 1);
    newBranches.splice(targetIndex, 0, moved);
    handleUpdateRouterConfig({ branches: newBranches });
  };

  return (
    <div className="absolute top-0 right-0 bottom-0 z-30 w-96 backdrop-blur-2xl bg-[#161b22]/95 border-l border-[#30363d] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200 text-[#c9d1d9]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 bg-[#161b22] border-b border-[#30363d] shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 rounded-lg bg-[#0d1117] border border-purple-500/40 text-purple-400 shrink-0 shadow-xs">
            <GitBranch className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-bold text-white truncate max-w-[200px]">
              {agent.label}
            </h3>
            <span className="text-[10px] text-purple-400 font-mono flex items-center gap-1">
              {agent.isStartNode ? 'Router Root Node Properties' : 'Router Sub-Agent Properties'}
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

      {/* Body Form */}
      <div className="flex-1 p-4 space-y-4 overflow-y-auto text-xs text-gray-300">
        {/* Router Display Name & Python Identifier */}
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-[11px] font-bold uppercase tracking-tight text-gray-400">Router Node Label</label>
            <input
              type="text"
              value={agent.label}
              onChange={(e) => handleLabelChange(e.target.value)}
              placeholder="e.g. Quality Gate Router, Intent Classifier"
              className="w-full px-3 py-1.5 bg-[#0d1117] border border-[#30363d] focus:border-purple-500 rounded-lg text-xs text-white focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-tight text-gray-400">
                Router Identifier (Python ID)
              </label>
              <span className="text-[10px] text-gray-400 font-mono">ADK node name</span>
            </div>
            <input
              type="text"
              value={currentIdentifier}
              onChange={(e) => handleIdentifierChange(e.target.value)}
              placeholder="e.g. quality_gate_router"
              className={`w-full px-3 py-1.5 bg-[#0d1117] border rounded-lg text-xs font-mono text-white focus:outline-none ${
                identifierValidation.isValid
                  ? 'border-[#30363d] focus:border-purple-500'
                  : 'border-red-500 focus:border-red-500 bg-red-950/20'
              }`}
            />
            {!identifierValidation.isValid && (
              <div className="flex items-center gap-1.5 text-[11px] text-red-400 mt-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{identifierValidation.error}</span>
              </div>
            )}
            <div className="text-[10px] text-gray-400">
              Must be a valid Python identifier (letters, digits, underscores; no spaces or hyphens).
            </div>
          </div>
        </div>

        {/* DECISION & EVALUATION STRATEGY */}
        <div className="space-y-2 pt-1 border-t border-[#30363d]">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold uppercase tracking-tight text-purple-400 flex items-center gap-1.5">
              <Split className="w-3.5 h-3.5 text-purple-400" />
              <span>Decision / Evaluation Strategy</span>
            </label>
          </div>

          <div className="space-y-1.5">
            {EVALUATION_MODES.map((mode) => {
              const isSelected = routerConfig.evaluationMode === mode.id;
              return (
                <div
                  key={mode.id}
                  onClick={() => handleUpdateRouterConfig({ evaluationMode: mode.id })}
                  className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-purple-950/30 border-purple-500 text-white shadow-xs'
                      : 'bg-[#0d1117] border-[#30363d] hover:border-purple-500/40 text-gray-400'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="p-1 rounded bg-[#161b22] border border-[#30363d]">
                        {mode.icon}
                      </div>
                      <span className="font-bold text-xs text-gray-200">
                        {mode.label}
                      </span>
                    </div>
                    <span className={`text-[9px] px-1.5 py-0.2 rounded font-mono border ${
                      isSelected 
                        ? 'bg-purple-500/30 text-purple-200 border-purple-500/50' 
                        : 'bg-[#161b22] text-gray-400 border-[#30363d]'
                    }`}>
                      {mode.badge}
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-400 pl-7 leading-relaxed">
                    {mode.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* MODE SPECIFIC PARAMETERS */}
        {routerConfig.evaluationMode === 'boolean_expression' && (
          <div className="space-y-2 bg-[#0d1117] p-3 rounded-lg border border-emerald-500/30">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-tight text-emerald-400 flex items-center gap-1">
                <Zap className="w-3.5 h-3.5" />
                <span>State Variable & Expression Logic</span>
              </label>
              <span className="text-[9px] text-emerald-400/80 font-mono">Python/JS Eval</span>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-gray-400">Target State Variable Key</label>
              <input
                type="text"
                value={routerConfig.expressionVariable || 'status'}
                onChange={(e) => handleUpdateRouterConfig({ expressionVariable: e.target.value })}
                placeholder="e.g. test_passed, quality_score, status"
                className="w-full px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] rounded text-xs text-emerald-300 font-mono focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div className="text-[10px] text-gray-400 leading-relaxed">
              Conditions are evaluated in order. The first branch whose expression evaluates to <code className="text-emerald-300 font-mono">True</code> will be chosen.
            </div>
          </div>
        )}

        {routerConfig.evaluationMode === 'llm_classifier' && (
          <div className="space-y-3 bg-[#0d1117] p-3 rounded-lg border border-purple-500/30">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-tight text-purple-400 flex items-center gap-1">
                <Cpu className="w-3.5 h-3.5" />
                <span>Classification Model & Instructions</span>
              </label>
              <span className="text-[9px] text-purple-300 font-mono">Zero-Shot Router</span>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-gray-400">Router Decision Model</label>
              <select
                value={agent.model || 'gemini-3.7-flash'}
                onChange={(e) => onUpdateAgent({ model: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-purple-500 rounded text-xs text-white focus:outline-none cursor-pointer"
              >
                {SUPPORTED_MODELS.map((m) => (
                  <option key={m.id} value={m.id} className="bg-[#161b22]">
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-gray-400">Classification Prompt Directives</label>
              <textarea
                rows={3}
                value={routerConfig.routingPrompt || ''}
                onChange={(e) => handleUpdateRouterConfig({ routingPrompt: e.target.value, classifierPrompt: e.target.value })}
                placeholder="Add agent instructions"
                className="w-full px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-purple-500 rounded text-xs text-gray-200 font-mono focus:outline-none resize-y"
              />
            </div>
          </div>
        )}

        {routerConfig.evaluationMode === 'threshold_score' && (
          <div className="space-y-3 bg-[#0d1117] p-3 rounded-lg border border-amber-500/30">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-tight text-amber-400 flex items-center gap-1">
                <Scale className="w-3.5 h-3.5" />
                <span>Score Threshold Gate</span>
              </label>
              <span className="text-[10px] text-amber-400 font-mono font-bold">
                ≥ {routerConfig.thresholdValue ?? 0.8}
              </span>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-gray-400">Score Metric Key</label>
              <input
                type="text"
                value={routerConfig.expressionVariable || 'score'}
                onChange={(e) => handleUpdateRouterConfig({ expressionVariable: e.target.value })}
                placeholder="e.g. score, confidence, test_coverage"
                className="w-full px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] rounded text-xs text-amber-300 font-mono focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-gray-400">
                <span>Passing Threshold</span>
                <span className="font-mono text-amber-300 font-bold">{routerConfig.thresholdValue ?? 0.8}</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={routerConfig.thresholdValue ?? 0.8}
                onChange={(e) => handleUpdateRouterConfig({ thresholdValue: parseFloat(e.target.value) })}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>
          </div>
        )}

        {routerConfig.evaluationMode === 'pattern_match' && (
          <div className="space-y-3 bg-[#0d1117] p-3 rounded-lg border border-sky-500/30">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-tight text-sky-400 flex items-center gap-1">
                <Code2 className="w-3.5 h-3.5" />
                <span>Pattern & Regex Matching Settings</span>
              </label>
              <span className="text-[9px] text-sky-400 font-mono">Regex Matcher</span>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-gray-400">Target Text / Variable Key</label>
              <input
                type="text"
                value={routerConfig.expressionVariable || 'query'}
                onChange={(e) => handleUpdateRouterConfig({ expressionVariable: e.target.value })}
                placeholder="e.g. query, input, raw_output"
                className="w-full px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] rounded text-xs text-sky-300 font-mono focus:border-sky-500 focus:outline-none"
              />
            </div>
            <div className="text-[10px] text-gray-400 leading-relaxed">
              Branches are evaluated sequentially using Python <code className="text-sky-300 font-mono">re.search(pattern, text, re.IGNORECASE)</code>. The first matching pattern is selected.
            </div>
          </div>
        )}

        {/* DECISION BRANCHES LIST (if / elif / else) */}
        <div className="space-y-3 pt-2 border-t border-[#30363d]">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold uppercase tracking-tight text-white flex items-center gap-1.5">
              <GitBranch className="w-3.5 h-3.5 text-purple-400" />
              <span>Decision Branches ({routerConfig.branches.length})</span>
            </label>
            <button
              type="button"
              onClick={handleAddBranch}
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 text-[10px] font-bold cursor-pointer transition-colors"
            >
              <Plus className="w-3 h-3" />
              <span>Add Branch</span>
            </button>
          </div>

          <div className="space-y-2.5">
            {routerConfig.branches.map((branch, index) => {
              const isFallback = !!branch.isDefault || !!branch.isDefaultFallback;
              const fieldMeta = getConditionFieldMeta(routerConfig.evaluationMode, isFallback);

              return (
                <div
                  key={branch.id}
                  className="p-3 bg-[#0d1117] rounded-lg border border-[#30363d] hover:border-purple-500/50 space-y-2 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                        Branch #{index + 1}
                      </span>
                      <input
                        type="text"
                        value={branch.label}
                        onChange={(e) => handleUpdateBranch(branch.id, { label: e.target.value })}
                        className="bg-transparent text-xs font-bold text-white border-b border-transparent hover:border-gray-600 focus:border-purple-500 focus:outline-none max-w-[140px] truncate"
                        placeholder="Branch Label"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => handleMoveBranch(index, -1)}
                        className="p-1 rounded text-gray-400 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer hover:bg-[#161b22] transition-colors"
                        title="Move Up"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={index === routerConfig.branches.length - 1}
                        onClick={() => handleMoveBranch(index, 1)}
                        className="p-1 rounded text-gray-400 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer hover:bg-[#161b22] transition-colors"
                        title="Move Down"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                      {routerConfig.branches.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleDeleteBranch(branch.id)}
                          className="p-1 rounded text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                          title="Delete Branch"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Condition Expression */}
                  <div className="space-y-1">
                    <label className="text-[10px] text-gray-400 flex items-center justify-between">
                      <span className="font-semibold text-gray-300">{fieldMeta.label}</span>
                      {isFallback && (
                        <span className="text-[9px] text-amber-400 font-mono">Else / Fallback Route</span>
                      )}
                    </label>
                    <input
                      type="text"
                      value={branch.conditionExpression || branch.condition || ''}
                      onChange={(e) => handleUpdateBranch(branch.id, { 
                        conditionExpression: e.target.value,
                        condition: e.target.value 
                      })}
                      placeholder={fieldMeta.placeholder}
                      className="w-full px-2.5 py-1 bg-[#161b22] border border-[#30363d] rounded text-xs text-purple-200 font-mono focus:border-purple-500 focus:outline-none"
                    />
                    <div className="text-[9px] text-gray-400">
                      {fieldMeta.helpText}
                    </div>
                  </div>

                  {/* Fallback Route Checkbox */}
                  <label className="flex items-center gap-2 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={!!branch.isDefault || !!branch.isDefaultFallback}
                      onChange={(e) => {
                        const isChecked = e.target.checked;
                        const updatedBranches = routerConfig.branches.map((b) => ({
                          ...b,
                          isDefault: b.id === branch.id ? isChecked : (isChecked ? false : b.isDefault),
                          isDefaultFallback: b.id === branch.id ? isChecked : (isChecked ? false : b.isDefaultFallback),
                        }));
                        handleUpdateRouterConfig({
                          branches: updatedBranches,
                          fallbackBranch: isChecked ? branch.id : (routerConfig.fallbackBranch === branch.id ? undefined : routerConfig.fallbackBranch),
                        });
                      }}
                      className="w-3.5 h-3.5 rounded border-[#30363d] bg-[#161b22] text-purple-600 focus:ring-purple-500 cursor-pointer accent-purple-500"
                    />
                    <span className="text-[10px] text-gray-300">
                      Default Fallback Route (<span className="text-amber-400 font-mono">Else</span>)
                    </span>
                  </label>

                  {/* Target Node Destination Dropdown */}
                  <div className="space-y-1">
                    <label className="text-[10px] text-gray-400 flex items-center gap-1">
                      <CornerDownRight className="w-3 h-3 text-purple-400" />
                      <span>Target Agent Node</span>
                    </label>
                    <select
                      value={branch.targetAgentId || ''}
                      onChange={(e) => handleUpdateBranch(branch.id, { targetAgentId: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-purple-500 rounded text-xs text-gray-200 focus:outline-none cursor-pointer"
                    >
                      <option value="" className="bg-[#161b22] text-gray-400">
                        -- Connect to Node / Agent --
                      </option>
                      {otherAgents.map((a) => (
                        <option key={a.id} value={a.id} className="bg-[#161b22]">
                          {a.label} ({a.agentKind === 'a2a' ? 'A2A' : a.agentKind === 'router' ? 'Router' : 'Agent'})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Attached Tools Section */}
        <div className="space-y-2 pt-2 border-t border-[#30363d]">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold uppercase tracking-tight text-gray-400 flex items-center gap-1">
              <Wrench className="w-3 h-3 text-purple-400" />
              Attached Tools ({agent.tools?.length || 0})
            </label>
            {onOpenAddTool && (
              <button
                type="button"
                onClick={onOpenAddTool}
                className="flex items-center gap-1 text-[11px] text-purple-400 hover:text-purple-300 font-medium cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                Add Tool
              </button>
            )}
          </div>

          <div className="space-y-1.5">
            {agent.tools && agent.tools.length > 0 ? (
              agent.tools.map((tool: ToolDefinition) => (
                <div
                  key={tool.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-[#0d1117] border border-[#30363d]"
                >
                  <div className="min-w-0 pr-2">
                    <div className="font-semibold text-gray-200 text-xs truncate">{tool.name}</div>
                    <div className="text-[10px] text-gray-400 truncate max-w-[190px]">{tool.description}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {onEditTool && (
                      <button
                        type="button"
                        onClick={() => onEditTool(tool)}
                        title={`Configure ${tool.name} for this agent`}
                        className="p-1 text-gray-400 hover:text-purple-400 hover:bg-[#161b22] rounded transition-colors cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {onRemoveTool && (
                      <button
                        type="button"
                        onClick={() => onRemoveTool(tool.id)}
                        title={`Remove ${tool.name}`}
                        className="p-1 text-gray-400 hover:text-rose-400 hover:bg-[#161b22] rounded transition-colors cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-[11px] text-gray-400 italic p-2 bg-[#0d1117] rounded-lg border border-dashed border-[#30363d]">
                No tools attached yet. Click &quot;Add Tool&quot; to attach tools to this router node.
              </div>
            )}
          </div>
        </div>

        {/* Visual Architecture Summary / Live Routing Diagram */}
        <div className="p-3 bg-[#0d1117] rounded-lg border border-purple-500/20 space-y-2">
          <div className="text-[10px] uppercase font-bold tracking-wider text-purple-400 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5" />
            <span>Execution Flow Simulation</span>
          </div>
          <div className="space-y-1 text-[11px] font-mono">
            <div className="flex items-center gap-1.5 text-gray-400">
              <span className="text-gray-500">1.</span>
              <span>Input State</span>
              <ArrowRight className="w-3 h-3 text-gray-600" />
              <span className="text-purple-300 font-bold">[{agent.label}]</span>
            </div>
            {routerConfig.branches.map((b, i) => {
              const targetAgent = otherAgents.find((a) => a.id === b.targetAgentId);
              return (
                <div key={b.id} className="flex items-center gap-1.5 pl-4 text-[10px]">
                  <span className="text-purple-400 font-bold">↳ Branch {i + 1}:</span>
                  <span className="text-gray-300 truncate max-w-[100px]">{b.label}</span>
                  <ArrowRight className="w-2.5 h-2.5 text-purple-500 shrink-0" />
                  <span className="text-emerald-400 font-semibold truncate">
                    {targetAgent ? targetAgent.label : '(Output Handle)'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
