import React from 'react';
import { 
  Sparkles, 
  X, 
  CheckCircle2, 
  Cpu, 
  Layers, 
  Sliders, 
  ShieldCheck, 
  UserCheck, 
  GitBranch, 
  PlayCircle, 
  Database,
  ArrowRight,
  Lightbulb
} from 'lucide-react';

interface MissingFeaturesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const MISSING_CAPABILITIES = [
  {
    title: '1. Shared State & Memory Blackboard',
    category: 'State Management',
    icon: <Database className="w-5 h-5 text-emerald-400" />,
    problem: 'Without explicit state definitions, agents cannot coordinate structured data payloads across hops.',
    solution: 'Add a visual State Schema Editor where you define keys (e.g., `user_query`, `research_notes`, `generated_code`, `evaluation_score`) that all agents read and write into.',
    badge: 'Critical for LangGraph & ADK',
  },
  {
    title: '2. Conditional Router / Decision Branch Nodes',
    category: 'Control Flow',
    icon: <GitBranch className="w-5 h-5 text-purple-400" />,
    problem: 'Real workflows need if/else branching (e.g. "If code passes test -> Proceed, else -> Loop back to Refactor agent").',
    solution: 'Add a Router / Switch node that evaluates boolean expressions, LLM intent classifiers, or threshold scores.',
    badge: 'Dynamic Routing',
  },
  {
    title: '3. Human-in-the-Loop (HITL) & Approval Gates',
    category: 'Safety & Governance',
    icon: <UserCheck className="w-5 h-5 text-amber-400" />,
    problem: 'Autonomous agents can execute dangerous tool calls (e.g., executing code, sending emails, DB mutations) without oversight.',
    solution: 'Add an "Approval Gate" node where graph execution pauses until the developer clicks Approve/Reject in VS Code.',
    badge: 'Production Safety',
  },
  {
    title: '4. Guardrails & Output Validation Filters',
    category: 'Quality Control',
    icon: <ShieldCheck className="w-5 h-5 text-rose-400" />,
    problem: 'LLMs can hallucinate or violate schema constraints, causing downstream agent crashes.',
    solution: 'Provide Pydantic / Zod schema validation nodes and safety filters that sanitize outputs between agent hops.',
    badge: 'Reliability',
  },
  {
    title: '5. In-Editor Test Simulator & Execution Tracer',
    category: 'Developer Experience',
    icon: <PlayCircle className="w-5 h-5 text-sky-400" />,
    problem: 'Developers must write separate test scripts and switch to external terminals to see if their visual graph actually works.',
    solution: 'Add a "Test Run" button in the VS Code tab with step-by-step node highlighting, live token usage counters, and step payload inspection.',
    badge: 'Live Debugging',
  },
  {
    title: '6. Trigger & Webhook Entrypoint Adapters',
    category: 'Integration',
    icon: <Layers className="w-5 h-5 text-indigo-400" />,
    problem: 'How is the workflow triggered? HTTP REST API, Cron schedule, VS Code Command, or WebSocket stream?',
    solution: 'Visual Trigger nodes (Webhook, CLI, Cron, Event Bus) that feed the initial payload into the Root Agent.',
    badge: 'Deployment Ready',
  },
];

export const MissingFeaturesModal: React.FC<MissingFeaturesModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
      <div className="w-full max-w-3xl max-h-[85vh] backdrop-blur-2xl bg-[#161b22]/95 rounded-xl border border-[#30363d] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-150 text-[#c9d1d9]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-[#161b22] border-b border-[#30363d] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-[#0d1117] border border-[#30363d]">
              <Lightbulb className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">
                What Else Is Missing in Visual Agent Builders?
              </h2>
              <p className="text-xs text-gray-400">
                Architectural recommendations to elevate your VS Code Agent Flow Builder to enterprise production
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-gray-400 hover:text-white hover:bg-[#30363d] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-5 overflow-y-auto space-y-4 text-xs text-gray-300">
          <div className="p-3.5 rounded-xl bg-[#0d1117] border border-blue-500/30 text-blue-200">
            <div className="font-bold text-xs text-blue-300 mb-1 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Comprehensive Multi-Agent Builder Roadmap
            </div>
            You have already built a top-tier visual foundation with <strong>React Flow diagramming</strong>, <strong>Agent tool configurations</strong>, <strong>Sub-agent delegation sockets</strong>, <strong>Patterns Groups (Sequential, Parallel, Loop)</strong>, <strong>Auto-layout with Dagre</strong>, and <strong>Google ADK & LangGraph generators</strong>. Here are the 6 highest-impact additions:
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {MISSING_CAPABILITIES.map((item, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-xl bg-[#0d1117] border border-[#30363d] hover:border-blue-500/50 transition-all space-y-2"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-md bg-[#161b22] border border-[#30363d]">
                      {item.icon}
                    </div>
                    <span className="font-bold text-xs text-white">{item.title}</span>
                  </div>
                  <span className="text-[9px] px-2 py-0.5 rounded bg-[#161b22] text-gray-300 font-mono border border-[#30363d]">
                    {item.badge}
                  </span>
                </div>

                <p className="text-[11px] text-rose-300/90 leading-relaxed">
                  <strong className="text-rose-400">Gap:</strong> {item.problem}
                </p>

                <p className="text-[11px] text-emerald-300/90 leading-relaxed">
                  <strong className="text-emerald-400">Solution:</strong> {item.solution}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-[#161b22] border-t border-[#30363d] flex items-center justify-between shrink-0">
          <span className="text-[11px] text-gray-400">
            All 6 recommendations can be modularly added to your generation engine.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-bold rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors cursor-pointer"
          >
            Got It, Thanks!
          </button>
        </div>
      </div>
    </div>
  );
};
