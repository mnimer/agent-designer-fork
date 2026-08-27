/**
 * TestRunnerDrawer Component
 *
 * Sliding testing and execution panel providing real-time test execution controls,
 * animated status indicators, log stream monitors, and assertion validation reports.
 *
 * Job in Application:
 * Visual interface for launching tests against active agent workflows and inspecting
 * live traces, tool invocations, latencies, and execution outputs.
 *
 * Architectural Decisions:
 * 1. Follows 8pt grid layout system for margins, paddings, and button heights.
 * 2. Real-time log filtering and auto-scrolling log console.
 * 3. Supports scenario filtering and individual scenario re-runs.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Play,
  X,
  CheckCircle2,
  XCircle,
  Loader2,
  Terminal,
  Clock,
  ShieldCheck,
  StopCircle,
  RotateCw,
  Search,
} from 'lucide-react';
import { useBridgeContext } from '../../context/BridgeContext';
import {
  AgentWorkflowDocument,
  TriggerTestScenario,
  TriggerNodeData,
} from '../../../shared/types';

export interface TestRunnerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  document: AgentWorkflowDocument;
}

interface TestResultState {
  status: 'idle' | 'running' | 'passed' | 'failed';
  durationMs: number;
  output?: string;
  error?: string;
}

interface ExecutionLogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  agentId?: string;
}

export const TestRunnerDrawer: React.FC<TestRunnerDrawerProps> = ({
  isOpen,
  onClose,
  document,
}) => {
  const bridge = useBridgeContext();
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, TestResultState>>({});
  const [logs, setLogs] = useState<ExecutionLogEntry[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [logFilter, setLogFilter] = useState<string>('');
  const logEndRef = useRef<HTMLDivElement>(null);

  // Extract all test scenarios from trigger nodes
  const scenarios: TriggerTestScenario[] = useMemo(() => {
    const list: TriggerTestScenario[] = [];
    const triggerNodes = (document.nodes || []).filter((n) => n.type === 'trigger');
    for (const node of triggerNodes) {
      const data = node.data as TriggerNodeData;
      if (data?.config?.testScenarios) {
        list.push(...data.config.testScenarios);
      }
    }
    if (list.length === 0) {
      list.push({
        id: 'default-test-1',
        name: 'Default Test Scenario',
        inputQuery: 'Provide an overview of the workflow capabilities.',
      });
    }
    return list;
  }, [document]);

  // Set default selected scenario
  useEffect(() => {
    if (scenarios.length > 0 && !selectedScenarioId) {
      setSelectedScenarioId(scenarios[0].id);
    }
  }, [scenarios, selectedScenarioId]);

  // Subscribe to RPC testing updates
  useEffect(() => {
    const unsubLog = bridge.subscribe('EXECUTION_LOG', (payload) => {
      if (!payload) return;
      setLogs((prev) => [
        ...prev,
        {
          id: `log-${Date.now()}-${Math.random()}`,
          timestamp: new Date().toLocaleTimeString(),
          level: payload.level,
          message: payload.message,
          agentId: payload.agentId,
        },
      ]);
    });

    const unsubResult = bridge.subscribe('TEST_RESULT_UPDATE', (payload) => {
      if (!payload) return;
      setResults((prev) => ({
        ...prev,
        [payload.scenarioId]: {
          status: payload.status,
          durationMs: payload.durationMs,
          output: payload.output,
          error: payload.error,
        },
      }));
    });

    const unsubComplete = bridge.subscribe('EXECUTION_COMPLETE', (payload) => {
      setIsRunning(false);
      setActiveRunId(null);
      if (payload) {
        setLogs((prev) => [
          ...prev,
          {
            id: `log-summary-${Date.now()}`,
            timestamp: new Date().toLocaleTimeString(),
            level: payload.success ? 'info' : 'error',
            message: `=== ${payload.summary} ===`,
          },
        ]);
      }
    });

    return () => {
      unsubLog();
      unsubResult();
      unsubComplete();
    };
  }, [bridge]);

  // Auto-scroll logs to bottom
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  /**
   * Executes all test scenarios.
   */
  const handleRunAll = () => {
    setIsRunning(true);
    setLogs([]);
    const initialResults: Record<string, TestResultState> = {};
    scenarios.forEach((s) => {
      initialResults[s.id] = { status: 'idle', durationMs: 0 };
    });
    setResults(initialResults);

    bridge.postMessage({
      type: 'RUN_TESTS',
      payload: {
        document,
      },
    });
  };

  /**
   * Executes a single test scenario.
   */
  const handleRunSingle = (scenarioId: string) => {
    setIsRunning(true);
    setResults((prev) => ({
      ...prev,
      [scenarioId]: { status: 'running', durationMs: 0 },
    }));

    bridge.postMessage({
      type: 'RUN_TESTS',
      payload: {
        document,
        testScenarioIds: [scenarioId],
      },
    });
  };

  /**
   * Cancels active test execution run.
   */
  const handleCancelRun = () => {
    if (activeRunId) {
      bridge.postMessage({
        type: 'CANCEL_TESTS',
        payload: { runId: activeRunId },
      });
    }
    setIsRunning(false);
  };

  if (!isOpen) return null;

  const currentScenario = scenarios.find((s) => s.id === selectedScenarioId);
  const currentResult = selectedScenarioId ? results[selectedScenarioId] : undefined;

  const filteredLogs = logs.filter((l) =>
    l.message.toLowerCase().includes(logFilter.toLowerCase())
  );

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-[540px] bg-[#161b22] border-l border-[#30363d] shadow-2xl flex flex-col font-sans select-none animate-in slide-in-from-right duration-200">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#30363d] bg-[#0d1117] text-white">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <h2 className="font-semibold text-sm">Agent Test & Execution Harness</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded hover:bg-[#30363d] text-gray-400 hover:text-white transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Main Execution Controls */}
      <div className="p-4 border-b border-[#30363d] bg-[#161b22] flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isRunning ? (
            <button
              type="button"
              onClick={handleCancelRun}
              className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-md text-xs font-semibold shadow-md transition-all cursor-pointer"
            >
              <StopCircle className="w-4 h-4" />
              <span>Stop Execution</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleRunAll}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md text-xs font-semibold shadow-md transition-all cursor-pointer"
            >
              <Play className="w-4 h-4" />
              <span>Run All Scenarios ({scenarios.length})</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setLogs([]);
              setResults({});
            }}
            className="p-2 text-gray-400 hover:text-white rounded hover:bg-[#21262d] transition-colors cursor-pointer"
            title="Clear Logs"
          >
            <RotateCw className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Clock className="w-3.5 h-3.5" />
          <span>{document.framework} / {document.language}</span>
        </div>
      </div>

      {/* Content Split: Scenarios list & Log Console */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Scenarios Overview */}
        <div className="p-4 border-b border-[#30363d] max-h-48 overflow-y-auto bg-[#0d1117]/50">
          <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-2">
            Test Scenarios ({scenarios.length})
          </h3>
          <div className="space-y-1.5">
            {scenarios.map((scenario) => {
              const res = results[scenario.id];
              const isSelected = scenario.id === selectedScenarioId;

              return (
                <div
                  key={scenario.id}
                  onClick={() => setSelectedScenarioId(scenario.id)}
                  className={`flex items-center justify-between p-2 rounded-md border text-xs cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-[#21262d] border-blue-500/50 text-white'
                      : 'bg-[#161b22] border-[#30363d] text-gray-300 hover:border-gray-500'
                  }`}
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    {res?.status === 'running' && (
                      <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin shrink-0" />
                    )}
                    {res?.status === 'passed' && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    )}
                    {res?.status === 'failed' && (
                      <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    )}
                    {(!res || res.status === 'idle') && (
                      <div className="w-3.5 h-3.5 rounded-full border border-gray-600 shrink-0" />
                    )}
                    <span className="font-medium truncate">{scenario.name}</span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {res && res.durationMs > 0 && (
                      <span className="text-[10px] text-gray-400 font-mono">
                        {res.durationMs}ms
                      </span>
                    )}
                    <button
                      type="button"
                      disabled={isRunning}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRunSingle(scenario.id);
                      }}
                      className="p-1 hover:bg-[#30363d] text-gray-400 hover:text-white rounded disabled:opacity-50 cursor-pointer"
                      title="Run this scenario"
                    >
                      <Play className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected Scenario Details & Output */}
        {currentScenario && (
          <div className="p-4 border-b border-[#30363d] bg-[#161b22]">
            <div className="text-xs font-semibold text-white mb-1">
              Input Query: <span className="font-normal text-gray-300 font-mono">"{currentScenario.inputQuery}"</span>
            </div>
            {currentScenario.expectedOutput && (
              <div className="text-xs text-amber-400 flex items-center gap-1.5 mt-1">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                <span>Assertion: Output must contain "{currentScenario.expectedOutput}"</span>
              </div>
            )}
            {currentResult?.output && (
              <div className="mt-2 p-2 bg-[#0d1117] border border-[#30363d] rounded text-xs font-mono text-gray-200 max-h-24 overflow-y-auto">
                {currentResult.output}
              </div>
            )}
            {currentResult?.error && (
              <div className="mt-2 p-2 bg-rose-950/40 border border-rose-800/50 rounded text-xs text-rose-300">
                {currentResult.error}
              </div>
            )}
          </div>
        )}

        {/* Live Execution Console Logs */}
        <div className="flex-1 flex flex-col bg-[#0d1117] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-[#30363d] bg-[#161b22]/50 text-xs text-gray-400">
            <span className="font-mono uppercase text-[10px] tracking-wider">Live Trace Logs</span>
            <div className="relative w-40">
              <input
                type="text"
                placeholder="Filter logs..."
                value={logFilter}
                onChange={(e) => setLogFilter(e.target.value)}
                className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-0.5 text-[11px] text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
              <Search className="w-3 h-3 text-gray-500 absolute right-2 top-1.5" />
            </div>
          </div>

          <div className="flex-1 p-3 overflow-y-auto font-mono text-xs space-y-1">
            {filteredLogs.length === 0 ? (
              <div className="text-gray-500 italic text-center py-6">
                No execution logs recorded. Click "Run All Scenarios" to start.
              </div>
            ) : (
              filteredLogs.map((log) => (
                <div
                  key={log.id}
                  className={`leading-relaxed break-words ${
                    log.level === 'error'
                      ? 'text-rose-400'
                      : log.level === 'warn'
                      ? 'text-amber-300'
                      : 'text-gray-300'
                  }`}
                >
                  <span className="text-gray-600 select-none mr-2">[{log.timestamp}]</span>
                  <span>{log.message}</span>
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
};
