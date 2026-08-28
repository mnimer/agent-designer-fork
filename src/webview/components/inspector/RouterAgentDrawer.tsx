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
  Cpu
} from 'lucide-react';
import { 
  AgentData, 
  RouterConfig, 
  RouterEvaluationMode, 
  RouterBranchCondition 
} from '../../types';

interface RouterAgentDrawerProps {
  agent: AgentData;
  allAgents: AgentData[];
  onClose: () => void;
  onUpdateAgent: (updatedData: Partial<AgentData>) => void;
}

const SUPPORTED_MODELS = [
  { id: 'gemini-flash-latest', name: 'Gemini Flash (Latest)', desc: 'Ultra-fast intent classifier and JSON branch decision engine' },
  { id: 'gemini-3.7-flash', name: 'Gemini 3.7 Flash', desc: 'Hybrid reasoning and high-throughput routing' },
  { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash', desc: 'High-speed generative tasks & condition checks' },
  { id: 'gemini-3.1-pro', name: 'Gemini 3.1 Pro', desc: 'Complex multi-variable condition logic & deep classification' },
  { id: 'claude-sonnet-latest', name: 'Claude Sonnet (Latest)', desc: 'Nuanced semantic reasoning & routing' },
  { id: 'openai-latest', name: 'OpenAI (Latest)', desc: 'High-accuracy function calling & structured routing' },
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

export const RouterAgentDrawer: React.FC<RouterAgentDrawerProps> = ({
  agent,
  allAgents,
  onClose,
  onUpdateAgent,
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
              Router Properties & Branching Logic
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
        {/* Router Display Name */}
        <div className="space-y-1">
          <label className="text-[11px] font-bold uppercase tracking-tight text-gray-400">Router Node Label</label>
          <input
            type="text"
            value={agent.label}
            onChange={(e) => onUpdateAgent({ label: e.target.value })}
            placeholder="e.g. Quality Gate Router, Intent Classifier"
            className="w-full px-3 py-1.5 bg-[#0d1117] border border-[#30363d] focus:border-purple-500 rounded-lg text-xs text-white focus:outline-none"
          />
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
                value={agent.model || 'gemini-flash-latest'}
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
                onChange={(e) => handleUpdateRouterConfig({ routingPrompt: e.target.value })}
                placeholder="Analyze the incoming request or code review output and select the most appropriate destination branch key..."
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
                        className="bg-transparent text-xs font-bold text-white border-b border-transparent hover:border-gray-600 focus:border-purple-500 focus:outline-none max-w-[150px] truncate"
                        placeholder="Branch Label"
                      />
                    </div>
                    {routerConfig.branches.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleDeleteBranch(branch.id)}
                        className="p-1 rounded text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                        title="Delete Branch"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {/* Condition Expression */}
                  <div className="space-y-1">
                    <label className="text-[10px] text-gray-400 flex items-center justify-between">
                      <span>Condition / Intent Match</span>
                      {branch.isDefault && (
                        <span className="text-[9px] text-amber-400 font-mono">Else / Fallback Route</span>
                      )}
                    </label>
                    <input
                      type="text"
                      value={branch.conditionExpression || ''}
                      onChange={(e) => handleUpdateBranch(branch.id, { conditionExpression: e.target.value })}
                      placeholder={branch.isDefault ? 'default' : "e.g. state.status == 'passed'"}
                      className="w-full px-2.5 py-1 bg-[#161b22] border border-[#30363d] rounded text-xs text-purple-200 font-mono focus:border-purple-500 focus:outline-none"
                    />
                  </div>

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
