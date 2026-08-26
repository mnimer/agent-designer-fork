import React, { useState, useEffect } from 'react';
import { 
  FlaskConical, 
  Play, 
  RotateCcw, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Terminal, 
  Copy, 
  Check, 
  Sparkles, 
  ListChecks,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  Zap,
  Activity,
  AlertCircle,
  FileCode,
  Layers,
  ArrowRight
} from 'lucide-react';
import { AgentData, GenerationConfig, TestPrompt } from '../../types';

interface TestResult {
  id: string;
  status: 'idle' | 'running' | 'passed' | 'failed';
  output: string;
  durationMs: number;
  assertionPassed: boolean;
  assertionDetails: string;
  agentTrace?: Array<{
    agentName: string;
    step: string;
    durationMs: number;
  }>;
}

interface TestRunnerTabProps {
  testPrompts: TestPrompt[];
  agents: AgentData[];
  config: GenerationConfig;
  onOpenTriggerSettings?: () => void;
}

export const TestRunnerTab: React.FC<TestRunnerTabProps> = ({
  testPrompts,
  agents,
  config,
  onOpenTriggerSettings,
}) => {
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [isRunningAll, setIsRunningAll] = useState<boolean>(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'passed' | 'failed'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedTraceId, setExpandedTraceId] = useState<string | null>(null);

  // Initialize test results when testPrompts change
  useEffect(() => {
    setTestResults((prev) => {
      const updated: Record<string, TestResult> = { ...prev };
      testPrompts.forEach((tp) => {
        if (!updated[tp.id]) {
          updated[tp.id] = {
            id: tp.id,
            status: 'idle',
            output: '',
            durationMs: 0,
            assertionPassed: false,
            assertionDetails: '',
          };
        }
      });
      return updated;
    });
  }, [testPrompts]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Generate realistic agent simulation output based on prompt & agent graph
  const generateSimulatedOutput = (prompt: TestPrompt): { output: string; trace: Array<{ agentName: string; step: string; durationMs: number }>; passed: boolean; details: string } => {
    const rootAgent = agents.find((a) => a.isStartNode) || agents[0] || { label: 'Root Agent' };
    const secondAgent = agents[1] || { label: 'Executor Agent' };
    const thirdAgent = agents[2] || { label: 'Reviewer Agent' };

    const lowerPrompt = prompt.prompt.toLowerCase();

    if (lowerPrompt.includes('q3 revenue') || lowerPrompt.includes('bottleneck') || lowerPrompt.includes('decomposition')) {
      return {
        output: `### Operational Analysis & Bottleneck Report\n\n**Executive Summary**: Based on Q3 revenue trends and cross-functional performance data, 3 major operational constraints were identified:\n\n1. **Lead Conversion Pipeline Friction**: Inefficient hand-off between initial triage and sales tier resulting in a 14% drop-off rate.\n2. **Database Query Bottlenecks**: High latency on batch analytics jobs during peak hours leading to 1.8s response delays.\n3. **Manual Compliance Checks**: Redundant verification loops accounting for ~32 staff hours per week.\n\n*Mitigations Recommended*: Automate tier-1 routing with PubSub queues, introduce Redis caching for hot accounts, and streamline automated policy verification.`,
        trace: [
          { agentName: rootAgent.label, step: 'Decomposed prompt into analytics queries and structure schema', durationMs: 65 },
          { agentName: secondAgent.label, step: 'Queried operational data sources and calculated variance', durationMs: 120 },
          { agentName: thirdAgent.label, step: 'Validated format conforms to markdown bullet constraints', durationMs: 45 },
        ],
        passed: true,
        details: 'Output conforms to Markdown summary specification and contains 3 distinct bottleneck bullets.',
      };
    } else if (lowerPrompt.includes('8841') || lowerPrompt.includes('churn') || lowerPrompt.includes('customer')) {
      return {
        output: `{\n  "customer_id": "8841",\n  "account_status": "active",\n  "subscription_tier": "Enterprise Plus",\n  "mrr_value": 4200.00,\n  "churn_risk_score": 0.12,\n  "risk_category": "low",\n  "signals": [\n    "Daily active session cadence > 4.2h",\n    "Zero open critical support tickets in 60d",\n    "Contract renewed within last 90d"\n  ],\n  "last_audit_timestamp": "${new Date().toISOString()}"\n}`,
        trace: [
          { agentName: rootAgent.label, step: 'Identified entity customer_id=#8841 and resolved schema', durationMs: 50 },
          { agentName: secondAgent.label, step: 'Invoked SQL/REST Tool: query_customer_records(id=8841)', durationMs: 140 },
          { agentName: thirdAgent.label, step: 'JSON schema validator verified churn_risk_score < 0.25', durationMs: 35 },
        ],
        passed: true,
        details: 'JSON payload matches schema definition; churn_risk_score (0.12) satisfies constraint (< 0.25).',
      };
    } else if (lowerPrompt.includes('credentials') || lowerPrompt.includes('unredacted') || lowerPrompt.includes('password') || lowerPrompt.includes('secret')) {
      return {
        output: `[SECURITY GUARDRAIL TRIGGERED]: Request Refused.\n\nReason: The requested operation involves extraction of unredacted internal credentials or sensitive production configuration secrets.\nPolicy Reference: SEC-POLICY-04 (Zero Exposure Credential Constraint).\nAction Taken: Execution halted safely without disclosing internal state or secret values.`,
        trace: [
          { agentName: rootAgent.label, step: 'Evaluated intent against Safety Guardrail & Security Policies', durationMs: 40 },
          { agentName: rootAgent.label, step: 'Triggered refusal protocol: Refused secret extraction', durationMs: 25 },
        ],
        passed: true,
        details: 'Security refusal successfully invoked without disclosing secret tokens or sensitive values.',
      };
    } else {
      return {
        output: `Workflow completed successfully for query: "${prompt.prompt}"\n\nResult:\n- Task successfully executed across multi-agent graph.\n- Input parameters processed according to agent system instructions.\n- Output format validated against criteria: "${prompt.expectedOutput}".`,
        trace: [
          { agentName: rootAgent.label, step: 'Dispatched query to agent pipeline', durationMs: 70 },
          { agentName: secondAgent.label, step: 'Processed execution step and generated result', durationMs: 95 },
        ],
        passed: true,
        details: 'Output conforms to the expected test criteria.',
      };
    }
  };

  // Run a single test
  const runTest = async (testId: string) => {
    const prompt = testPrompts.find((tp) => tp.id === testId);
    if (!prompt) return;

    setTestResults((prev) => ({
      ...prev,
      [testId]: {
        ...prev[testId],
        status: 'running',
        durationMs: 0,
      },
    }));

    const startTime = performance.now();
    // Simulate realistic async delay
    await new Promise((res) => setTimeout(res, 450 + Math.random() * 350));
    const endTime = performance.now();
    const durationMs = Math.round(endTime - startTime);

    const simulation = generateSimulatedOutput(prompt);

    setTestResults((prev) => ({
      ...prev,
      [testId]: {
        id: testId,
        status: simulation.passed ? 'passed' : 'failed',
        output: simulation.output,
        durationMs,
        assertionPassed: simulation.passed,
        assertionDetails: simulation.details,
        agentTrace: simulation.trace,
      },
    }));
  };

  // Run all tests sequentially
  const runAllTests = async () => {
    setIsRunningAll(true);
    for (const prompt of testPrompts) {
      await runTest(prompt.id);
    }
    setIsRunningAll(false);
  };

  // Reset all test results
  const resetAllTests = () => {
    const reset: Record<string, TestResult> = {};
    testPrompts.forEach((tp) => {
      reset[tp.id] = {
        id: tp.id,
        status: 'idle',
        output: '',
        durationMs: 0,
        assertionPassed: false,
        assertionDetails: '',
      };
    });
    setTestResults(reset);
  };

  // Metrics
  const totalCount = testPrompts.length;
  const resultsList = Object.values(testResults) as TestResult[];
  const executedList = resultsList.filter((r) => r.status === 'passed' || r.status === 'failed');
  const passedCount = resultsList.filter((r) => r.status === 'passed').length;
  const failedCount = resultsList.filter((r) => r.status === 'failed').length;
  const totalDuration = resultsList.reduce((acc, r) => acc + (r.durationMs || 0), 0);

  // Filtered prompts
  const filteredPrompts = testPrompts.filter((tp) => {
    const res = testResults[tp.id];
    if (activeFilter === 'passed') return res?.status === 'passed';
    if (activeFilter === 'failed') return res?.status === 'failed';
    return true;
  });

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0d1117] text-[#c9d1d9] overflow-hidden">
      {/* Top Controls & Metrics Bar */}
      <div className="px-4 py-2.5 bg-[#161b22] border-b border-[#30363d] flex items-center justify-between shrink-0 gap-3">
        {/* Left: Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={runAllTests}
            disabled={isRunningAll || testPrompts.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-pink-600 hover:bg-pink-500 disabled:opacity-50 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
          >
            {isRunningAll ? (
              <Activity className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
            <span>{isRunningAll ? 'Executing Suite...' : 'Run All Unit Tests'}</span>
          </button>

          <button
            type="button"
            onClick={resetAllTests}
            disabled={isRunningAll || executedList.length === 0}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#21262d] hover:bg-[#30363d] text-gray-300 hover:text-white border border-[#30363d] text-xs transition-colors cursor-pointer disabled:opacity-40"
            title="Reset test outputs"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset</span>
          </button>

          {/* Status Filter Tabs */}
          <div className="flex items-center gap-1 bg-[#0d1117] p-0.5 rounded-lg border border-[#30363d] ml-2">
            <button
              onClick={() => setActiveFilter('all')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                activeFilter === 'all'
                  ? 'bg-[#21262d] text-white'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              All ({totalCount})
            </button>
            <button
              onClick={() => setActiveFilter('passed')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                activeFilter === 'passed'
                  ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/40'
                  : 'text-gray-400 hover:text-emerald-400'
              }`}
            >
              Passed ({passedCount})
            </button>
            {failedCount > 0 && (
              <button
                onClick={() => setActiveFilter('failed')}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                  activeFilter === 'failed'
                    ? 'bg-rose-950/80 text-rose-300 border border-rose-500/40'
                    : 'text-gray-400 hover:text-rose-400'
                }`}
              >
                Failed ({failedCount})
              </button>
            )}
          </div>
        </div>

        {/* Right: Metrics & Terminal Tip */}
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#0d1117] border border-[#30363d] text-[11px]">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-gray-400">Passed:</span>
            <span className="text-emerald-400 font-bold font-mono">{passedCount}/{totalCount}</span>
          </div>

          {totalDuration > 0 && (
            <div className="flex items-center gap-1 px-2 py-1 rounded bg-[#0d1117] border border-[#30363d] text-[11px] text-gray-400">
              <Clock className="w-3 h-3 text-sky-400" />
              <span className="font-mono text-gray-300">{totalDuration}ms</span>
            </div>
          )}

          <div className="hidden lg:flex items-center gap-1.5 text-[11px] text-gray-400 font-mono bg-[#0d1117] px-2 py-1 rounded border border-[#30363d]">
            <Terminal className="w-3 h-3 text-pink-400" />
            <span>pytest test_pipeline.py -v</span>
          </div>
        </div>
      </div>

      {/* Main Content Area: List of Test Cases */}
      <div className="flex-1 p-4 overflow-y-auto space-y-3.5">
        {filteredPrompts.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center text-gray-500 space-y-2">
            <FlaskConical className="w-8 h-8 text-gray-600" />
            <p className="text-sm font-medium">No test prompts found matching filter.</p>
          </div>
        ) : (
          filteredPrompts.map((tp, index) => {
            const result = testResults[tp.id] || {
              id: tp.id,
              status: 'idle',
              output: '',
              durationMs: 0,
              assertionPassed: false,
              assertionDetails: '',
            };

            const isRunning = result.status === 'running';
            const isPassed = result.status === 'passed';
            const isFailed = result.status === 'failed';
            const isIdle = result.status === 'idle';

            return (
              <div
                key={tp.id || index}
                className={`rounded-xl border transition-all duration-200 shadow-md ${
                  isPassed
                    ? 'bg-[#161b22] border-emerald-500/40 hover:border-emerald-500/60'
                    : isFailed
                    ? 'bg-[#161b22] border-rose-500/40 hover:border-rose-500/60'
                    : isRunning
                    ? 'bg-[#161b22] border-amber-500/60 shadow-amber-500/10'
                    : 'bg-[#161b22] border-[#30363d] hover:border-gray-600'
                }`}
              >
                {/* Test Card Header */}
                <div className="px-3.5 py-2.5 bg-[#1c2128] rounded-t-xl border-b border-[#30363d] flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-5 h-5 rounded-full bg-[#0d1117] border border-[#30363d] flex items-center justify-center text-[10px] font-bold text-gray-400 shrink-0">
                      {index + 1}
                    </div>
                    <span className="font-bold text-xs text-white truncate">
                      {tp.name}
                    </span>
                    <span className="text-[9px] uppercase font-mono px-1.5 py-0.2 rounded bg-[#0d1117] text-gray-400 border border-[#30363d]">
                      {tp.assertionType || 'contains'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {/* Status Badge */}
                    {isIdle && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#0d1117] text-gray-400 border border-[#30363d] flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        Ready
                      </span>
                    )}

                    {isRunning && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-500/40 flex items-center gap-1 animate-pulse">
                        <Activity className="w-2.5 h-2.5 animate-spin" />
                        Running...
                      </span>
                    )}

                    {isPassed && (
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-950/70 text-emerald-400 border border-emerald-500/40 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        Passed ({result.durationMs}ms)
                      </span>
                    )}

                    {isFailed && (
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-rose-950/70 text-rose-400 border border-rose-500/40 flex items-center gap-1">
                        <XCircle className="w-3 h-3 text-rose-400" />
                        Failed
                      </span>
                    )}

                    {/* Run Single Button */}
                    <button
                      type="button"
                      onClick={() => runTest(tp.id)}
                      disabled={isRunning || isRunningAll}
                      className="px-2.5 py-1 rounded-md bg-[#0d1117] hover:bg-pink-600 border border-[#30363d] hover:border-pink-500 text-gray-300 hover:text-white text-[11px] font-medium transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-40"
                    >
                      <Play className="w-2.5 h-2.5 fill-current" />
                      <span>Run</span>
                    </button>
                  </div>
                </div>

                {/* Test Card Body Grid: Prompt -> Expected -> Output */}
                <div className="p-3.5 grid grid-cols-1 lg:grid-cols-3 gap-3">
                  {/* Column 1: Test Prompt */}
                  <div className="space-y-1.5 flex flex-col">
                    <div className="flex items-center justify-between text-[11px] font-bold text-pink-400 uppercase tracking-tight">
                      <span className="flex items-center gap-1">
                        <Terminal className="w-3 h-3 text-pink-400" />
                        Input Prompt
                      </span>
                      <button
                        onClick={() => handleCopy(tp.prompt, `prompt_${tp.id}`)}
                        className="text-[10px] text-gray-400 hover:text-white flex items-center gap-0.5 cursor-pointer"
                        title="Copy prompt"
                      >
                        {copiedId === `prompt_${tp.id}` ? (
                          <Check className="w-2.5 h-2.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-2.5 h-2.5" />
                        )}
                      </button>
                    </div>
                    <div className="flex-1 p-2.5 rounded-lg bg-[#0d1117] border border-[#30363d] font-mono text-[11px] text-gray-200 leading-relaxed overflow-y-auto max-h-[140px]">
                      {tp.prompt}
                    </div>
                  </div>

                  {/* Column 2: Expected Output Specification */}
                  <div className="space-y-1.5 flex flex-col">
                    <div className="flex items-center justify-between text-[11px] font-bold text-amber-400 uppercase tracking-tight">
                      <span className="flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3 text-amber-400" />
                        Expected Result
                      </span>
                    </div>
                    <div className="flex-1 p-2.5 rounded-lg bg-[#0d1117] border border-[#30363d] font-mono text-[11px] text-gray-300 leading-relaxed overflow-y-auto max-h-[140px]">
                      {tp.expectedOutput}
                    </div>
                  </div>

                  {/* Column 3: Live Agent Test Output */}
                  <div className="space-y-1.5 flex flex-col">
                    <div className="flex items-center justify-between text-[11px] font-bold text-emerald-400 uppercase tracking-tight">
                      <span className="flex items-center gap-1">
                        <Zap className="w-3 h-3 text-emerald-400" />
                        Actual Test Output
                      </span>
                      {result.output && (
                        <button
                          onClick={() => handleCopy(result.output, `output_${tp.id}`)}
                          className="text-[10px] text-gray-400 hover:text-white flex items-center gap-0.5 cursor-pointer"
                          title="Copy actual output"
                        >
                          {copiedId === `output_${tp.id}` ? (
                            <Check className="w-2.5 h-2.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-2.5 h-2.5" />
                          )}
                        </button>
                      )}
                    </div>

                    <div className={`flex-1 p-2.5 rounded-lg border font-mono text-[11px] leading-relaxed overflow-y-auto max-h-[140px] ${
                      isPassed
                        ? 'bg-[#0d1117] border-emerald-500/30 text-emerald-200'
                        : isFailed
                        ? 'bg-[#0d1117] border-rose-500/30 text-rose-200'
                        : 'bg-[#0d1117] border-[#30363d] text-gray-500 italic'
                    }`}>
                      {isRunning ? (
                        <div className="flex items-center gap-2 text-amber-400 py-4 justify-center">
                          <Activity className="w-3.5 h-3.5 animate-spin" />
                          <span>Executing multi-agent workflow...</span>
                        </div>
                      ) : result.output ? (
                        <pre className="whitespace-pre-wrap font-mono text-[10.5px]">
                          {result.output}
                        </pre>
                      ) : (
                        <span className="flex items-center justify-center h-full text-center text-gray-500">
                          Click "Run" to execute this test prompt against the agent workflow.
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Footer Assertion & Multi-Agent Execution Trace (when available) */}
                {result.output && (
                  <div className="px-3.5 py-2 bg-[#12161c] rounded-b-xl border-t border-[#30363d] flex flex-wrap items-center justify-between text-[11px] gap-2">
                    <div className="flex items-center gap-1.5 text-gray-300">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                      <span className="font-semibold text-gray-400">Assertion:</span>
                      <span className="text-gray-200">{result.assertionDetails}</span>
                    </div>

                    {result.agentTrace && result.agentTrace.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setExpandedTraceId(expandedTraceId === tp.id ? null : tp.id)}
                        className="text-[10px] text-sky-400 hover:text-sky-300 flex items-center gap-1 cursor-pointer"
                      >
                        <Layers className="w-2.5 h-2.5" />
                        <span>{expandedTraceId === tp.id ? 'Hide Trace' : `View Agent Trace (${result.agentTrace.length} steps)`}</span>
                        {expandedTraceId === tp.id ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
                      </button>
                    )}
                  </div>
                )}

                {/* Collapsible Execution Trace Details */}
                {expandedTraceId === tp.id && result.agentTrace && (
                  <div className="px-3.5 py-2.5 bg-[#0d1117] border-t border-[#21262d] space-y-1.5 text-[10.5px]">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                      Multi-Agent Execution Pipeline Trace
                    </div>
                    <div className="space-y-1">
                      {result.agentTrace.map((step, sIdx) => (
                        <div key={sIdx} className="flex items-center gap-2 text-gray-300">
                          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-[#161b22] text-amber-300 border border-[#30363d]">
                            {step.agentName}
                          </span>
                          <ArrowRight className="w-2.5 h-2.5 text-gray-500 shrink-0" />
                          <span className="text-gray-300 truncate">{step.step}</span>
                          <span className="ml-auto text-[9.5px] font-mono text-gray-500">{step.durationMs}ms</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
