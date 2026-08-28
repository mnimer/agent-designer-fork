/**
 * TestRunnerTab
 *
 * Interactive test execution panel for running multi-agent workflow test scenarios
 * against local Python virtual environments or execution harnesses over the WebviewBridge.
 *
 * Architectural Decisions:
 * 1. Dispatches RUN_TESTS and CANCEL_TESTS messages over WebviewBridge.
 * 2. Streams real-time TEST_RESULT_UPDATE and EXECUTION_LOG events to display live execution traces.
 * 3. Supports running the entire test suite or targeting individual test prompts.
 * 4. Fallback mock simulation when running in standalone browser dev preview.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  ArrowRight,
  Square
} from 'lucide-react';
import { AgentData, GenerationConfig, TestPrompt } from '../../types';
import { AgentWorkflowDocument } from '../../../shared/types';
import { useWebviewBridge } from '../../hooks/useWebviewBridge';

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
  document?: AgentWorkflowDocument;
  onOpenTriggerSettings?: () => void;
}

export const TestRunnerTab: React.FC<TestRunnerTabProps> = ({
  testPrompts,
  agents,
  config,
  document: propDocument,
  onOpenTriggerSettings,
}) => {
  const bridge = useWebviewBridge();
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [isRunningAll, setIsRunningAll] = useState<boolean>(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'passed' | 'failed'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedTraceId, setExpandedTraceId] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const activeRunIdRef = useRef<string | null>(null);

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
            agentTrace: [],
          };
        }
      });
      return updated;
    });
  }, [testPrompts]);

  // Subscribe to RPC bridge events from the extension runner
  useEffect(() => {
    const unsubResult = bridge.subscribe('TEST_RESULT_UPDATE', (payload) => {
      if (!payload) return;
      setTestResults((prev) => {
        const current = prev[payload.scenarioId] || {
          id: payload.scenarioId,
          status: 'idle',
          output: '',
          durationMs: 0,
          assertionPassed: false,
          assertionDetails: '',
          agentTrace: [],
        };

        return {
          ...prev,
          [payload.scenarioId]: {
            ...current,
            status: payload.status,
            durationMs: payload.durationMs,
            output: payload.output || current.output,
            assertionPassed: payload.status === 'passed',
            assertionDetails: payload.error
              ? payload.error
              : payload.status === 'passed'
              ? 'Output matched expected criteria and all assertions passed.'
              : current.assertionDetails,
          },
        };
      });
    });

    const unsubLog = bridge.subscribe('EXECUTION_LOG', (payload) => {
      if (!payload) return;
      // If log contains an agent message or step, append to active traces
      if (payload.agentId || payload.stepId || payload.message) {
        setTestResults((prev) => {
          const updated = { ...prev };
          // Find running scenario or append to first running
          const runningKey = Object.keys(updated).find((k) => updated[k].status === 'running');
          if (runningKey && updated[runningKey]) {
            const existingTrace = updated[runningKey].agentTrace || [];
            const agentName = payload.agentId ? `Agent [${payload.agentId}]` : 'Execution Runner';
            updated[runningKey] = {
              ...updated[runningKey],
              agentTrace: [
                ...existingTrace,
                {
                  agentName,
                  step: payload.message,
                  durationMs: 0,
                },
              ],
            };
          }
          return updated;
        });
      }
    });

    const unsubComplete = bridge.subscribe('EXECUTION_COMPLETE', () => {
      setIsRunningAll(false);
      setActiveRunId(null);
      activeRunIdRef.current = null;
    });

    return () => {
      unsubResult();
      unsubLog();
      unsubComplete();
    };
  }, [bridge]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  /**
   * Builds the workflow document payload to send to the test runner.
   */
  const getWorkflowDoc = useCallback((): AgentWorkflowDocument => {
    if (propDocument) return propDocument;

    return {
      version: '1.0.0',
      name: 'agent_workflow',
      description: 'Agent Workflow Test Suite',
      framework: config.framework === 'google_adk' ? 'google-adk' : (config.framework as any) || 'google-adk',
      language: config.language || 'python',
      nodes: [
        {
          id: 'trigger-1',
          type: 'trigger' as any,
          position: { x: 50, y: 150 },
          data: {
            label: 'Test Trigger',
            triggerType: 'chat',
            config: {
              testScenarios: testPrompts.map((tp) => ({
                id: tp.id,
                name: tp.name,
                inputQuery: tp.prompt,
                expectedOutput: tp.expectedOutput,
              })),
            },
          },
        },
        ...agents.map((ag, idx) => ({
          id: `agent-${idx + 1}`,
          type: 'agent' as any,
          position: { x: 250 + idx * 200, y: 150 },
          data: ag,
        })),
      ],
      edges: [],
      metadata: {},
    };
  }, [propDocument, config, testPrompts, agents]);

  // Run a single test
  const runTest = async (testId: string) => {
    setTestResults((prev) => ({
      ...prev,
      [testId]: {
        ...prev[testId],
        status: 'running',
        durationMs: 0,
        agentTrace: [],
      },
    }));

    const workflowDoc = getWorkflowDoc();
    bridge.postMessage({
      type: 'RUN_TESTS',
      payload: {
        document: workflowDoc,
        testScenarioIds: [testId],
        targetDirectory: config.outputFolder,
      },
    });
  };

  // Run all tests sequentially
  const runAllTests = async () => {
    setIsRunningAll(true);
    setTestResults((prev) => {
      const updated: Record<string, TestResult> = {};
      testPrompts.forEach((tp) => {
        updated[tp.id] = {
          id: tp.id,
          status: 'running',
          output: '',
          durationMs: 0,
          assertionPassed: false,
          assertionDetails: '',
          agentTrace: [],
        };
      });
      return updated;
    });

    const workflowDoc = getWorkflowDoc();
    bridge.postMessage({
      type: 'RUN_TESTS',
      payload: {
        document: workflowDoc,
        targetDirectory: config.outputFolder,
      },
    });
  };

  // Cancel active test run
  const handleCancelTests = () => {
    bridge.postMessage({
      type: 'CANCEL_TESTS',
      payload: {
        runId: activeRunId || undefined,
      },
    });
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
        agentTrace: [],
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

          {isRunningAll && (
            <button
              type="button"
              onClick={handleCancelTests}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
            >
              <Square className="w-3 h-3 fill-current" />
              <span>Cancel</span>
            </button>
          )}

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
