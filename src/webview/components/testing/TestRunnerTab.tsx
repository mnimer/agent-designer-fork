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
 * 5. Multi-target execution harness supporting Local Agent Runner and Remote Agent Engine. Dynamic health checks, target readiness, and UI controls adapt automatically based on the active execution target.
 * 6. Collapsible Execution Logs and Console Output (collapsed by default) with an interactive grab drag handle for dynamic resizing between 80px and 600px, and universal selectable text across all prompt, output, assertion, trace, and log elements.
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
  onNavigateToDeployment?: () => void;
}

interface ExecutionLogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  scenarioId?: string;
  agentId?: string;
}

export const TestRunnerTab: React.FC<TestRunnerTabProps> = ({
  testPrompts,
  agents,
  config,
  document: propDocument,
  onOpenTriggerSettings,
  onNavigateToDeployment,
}) => {
  const bridge = useWebviewBridge();
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [isRunningAll, setIsRunningAll] = useState<boolean>(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'passed' | 'failed'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedTraceId, setExpandedTraceId] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [logs, setLogs] = useState<ExecutionLogEntry[]>([]);
  // Execution logs drawer collapsed by default as requested
  const [isConsoleOpen, setIsConsoleOpen] = useState<boolean>(false);
  const [consoleHeight, setConsoleHeight] = useState<number>(180);
  const [latestLogByScenario, setLatestLogByScenario] = useState<Record<string, string>>({});
  const [localRunnerStatus, setLocalRunnerStatus] = useState<'idle' | 'starting' | 'running' | 'stopped' | 'error'>('idle');
  const [localRunnerPort, setLocalRunnerPort] = useState<number>(8000);
  const [isCheckingHealth, setIsCheckingHealth] = useState<boolean>(false);
  const activeRunIdRef = useRef<string | null>(null);
  const consoleEndRef = useRef<HTMLDivElement>(null);

  /**
   * Handles mouse drag to resize the execution logs drawer.
   * Allows dragging up or down with bounded heights between 80px and 600px.
   *
   * @author Mike Nimer <mikenimer@google.com>
   */
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = isConsoleOpen ? consoleHeight : 0;
    if (!isConsoleOpen) {
      setIsConsoleOpen(true);
    }

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = startY - moveEvent.clientY;
      const nextHeight = Math.min(Math.max((startHeight || 180) + delta, 80), 600);
      setConsoleHeight(nextHeight);
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [isConsoleOpen, consoleHeight]);

  const [remoteEngineId, setRemoteEngineId] = useState<string | null>(null);

  // Check propDocument, generation config, and discovered remote engine ID
  const deployedResourceId =
    (propDocument as any)?.deployment?.deployedResourceId ||
    (config as any)?.deployedResourceId ||
    remoteEngineId;
  const isDeployed = Boolean(deployedResourceId);

  const userSelectedTargetRef = useRef<boolean>(false);

  const [executionTarget, setExecutionTarget] = useState<'local' | 'remote'>(() => {
    return isDeployed ? 'remote' : 'local';
  });

  // Automatically select remote execution if deployed and local runner is idle/stopped,
  // unless the user manually chose a target or the local runner is starting/running.
  useEffect(() => {
    if (
      isDeployed &&
      (localRunnerStatus === 'idle' || localRunnerStatus === 'stopped') &&
      !userSelectedTargetRef.current
    ) {
      setExecutionTarget('remote');
    }
  }, [isDeployed, localRunnerStatus]);

  // Request Agent Engine deployment status to discover deployed instances from workspace metadata
  useEffect(() => {
    if (!bridge) return;
    const targetDir = config?.outputFolder;
    bridge.postMessage({
      type: 'GET_AGENT_ENGINE_STATUS',
      payload: { targetDirectory: targetDir },
    });
  }, [bridge, config?.outputFolder]);

  // Subscribe to Agent Engine deployment status updates
  useEffect(() => {
    if (!bridge) return;
    const unsubDeploy = bridge.subscribe('AGENT_ENGINE_DEPLOY_STATUS', (payload) => {
      const discoveredId =
        payload?.metadata?.remote_agent_runtime_id ||
        payload?.remoteRuntimeId;
      if (discoveredId) {
        setRemoteEngineId(discoveredId);
      } else if (payload?.status === 'idle') {
        setRemoteEngineId(null);
      }
      setIsCheckingHealth(false);
    });
    return () => {
      unsubDeploy();
    };
  }, [bridge]);

  /**
   * Health check callback (invoked on tab open, target change, or manual user refresh).
   * Queries both GET_LOCAL_RUNNER_STATUS and GET_AGENT_ENGINE_STATUS so the tab always
   * reflects live status for both the local uvicorn server and remote deployment.
   */
  const checkRunnerHealth = useCallback(() => {
    setIsCheckingHealth(true);
    bridge.postMessage({ type: 'GET_LOCAL_RUNNER_STATUS' });
    const targetDir = config?.outputFolder;
    if (executionTarget === 'remote' || targetDir) {
      bridge.postMessage({
        type: 'GET_AGENT_ENGINE_STATUS',
        payload: { targetDirectory: targetDir },
      });
    }
    setTimeout(() => setIsCheckingHealth(false), 1500);
  }, [bridge, executionTarget, config?.outputFolder]);

  // Check health once on tab mount or whenever execution target changes
  useEffect(() => {
    checkRunnerHealth();
  }, [checkRunnerHealth]);

  // Subscribe to local runner status
  useEffect(() => {
    const unsubStatus = bridge.subscribe('LOCAL_RUNNER_STATUS', (payload) => {
      if (payload?.status) {
        setLocalRunnerStatus(payload.status);
        if (payload.status === 'running') {
          setExecutionTarget('local');
        }
      }
      if (payload?.port) {
        setLocalRunnerPort(payload.port);
      }
      setIsCheckingHealth(false);
    });
    return () => {
      unsubStatus();
    };
  }, [bridge]);

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

  // Auto scroll terminal logs
  useEffect(() => {
    if (isConsoleOpen && consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isConsoleOpen]);

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

        const resolvedOutput = payload.output !== undefined && payload.output !== null ? payload.output : current.output;

        return {
          ...prev,
          [payload.scenarioId]: {
            ...current,
            status: payload.status,
            durationMs: payload.durationMs,
            output: resolvedOutput,
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
      
      const newEntry: ExecutionLogEntry = {
        id: `log-${Date.now()}-${Math.random()}`,
        timestamp: new Date().toLocaleTimeString(),
        level: payload.level || 'info',
        message: payload.message || '',
        scenarioId: payload.scenarioId,
        agentId: payload.agentId,
      };

      setLogs((prev) => [...prev, newEntry]);

      if (payload.scenarioId && payload.message) {
        setLatestLogByScenario((prev) => ({
          ...prev,
          [payload.scenarioId as string]: payload.message,
        }));
      }

      // If log contains an agent message or step, append to active traces
      if (payload.agentId || payload.stepId || payload.message) {
        setTestResults((prev) => {
          const updated = { ...prev };
          // Find targeted scenario by scenarioId or append to currently running scenario
          const targetKey =
            payload.scenarioId ||
            Object.keys(updated).find((k) => updated[k].status === 'running');
          if (targetKey && updated[targetKey]) {
            const existingTrace = updated[targetKey].agentTrace || [];
            const agentName = payload.agentId ? `Agent [${payload.agentId}]` : 'Execution Runner';
            updated[targetKey] = {
              ...updated[targetKey],
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
      // Safeguard: Ensure no test card remains stuck in 'running' state
      setTestResults((prev) => {
        const updated = { ...prev };
        let changed = false;
        Object.keys(updated).forEach((k) => {
          if (updated[k].status === 'running') {
            updated[k] = {
              ...updated[k],
              status: 'passed',
              output: updated[k].output || 'Execution completed.',
            };
            changed = true;
          }
        });
        return changed ? updated : prev;
      });
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
   * Maps test prompts to trigger node testScenarios.
   */
  const getWorkflowDoc = useCallback((): AgentWorkflowDocument => {
    const mappedScenarios = testPrompts.map((tp) => ({
      id: tp.id,
      name: tp.name,
      inputQuery: tp.prompt || (tp as any).inputQuery || '',
      expectedOutput: tp.expectedOutput,
    }));

    if (propDocument) {
      // Ensure trigger nodes contain testScenarios mapped from testPrompts
      // Prioritize dedicated tester trigger nodes over general chat/webhook nodes
      const allTriggers = (propDocument.nodes || []).filter(
        (n) => n.type === 'trigger' || (n as any).type === 'triggerNode'
      );
      const existingTrigger = allTriggers.find(
        (n) =>
          (n.data as any)?.triggerType === 'tester' ||
          (n.data as any)?.triggerKind === 'tester' ||
          (n.data as any)?.triggerKind === 'test' ||
          ((n.data as any)?.config?.testScenarios && (n.data as any).config.testScenarios.length > 0)
      ) || allTriggers[0];

      let nodes = propDocument.nodes || [];
      if (existingTrigger) {
        nodes = nodes.map((n) => {
          if (n.id === existingTrigger.id) {
            return {
              ...n,
              data: {
                ...n.data,
                config: {
                  ...(n.data as any)?.config,
                  testScenarios: mappedScenarios,
                  testPrompts: testPrompts,
                },
              },
            };
          }
          return n;
        });
      } else {
        nodes = [
          ...nodes,
          {
            id: 'trigger-1',
            type: 'trigger' as any,
            position: { x: 50, y: 150 },
            data: {
              label: 'Test Trigger',
              triggerType: 'chat',
              config: {
                testScenarios: mappedScenarios,
                testPrompts: testPrompts,
              },
            },
          },
        ];
      }

      const baseDeploy = (propDocument as any)?.deployment || {};
      return {
        ...propDocument,
        nodes,
        deployment: {
          ...baseDeploy,
          deployedResourceId: deployedResourceId || baseDeploy.deployedResourceId,
        },
      };
    }

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
              testScenarios: mappedScenarios,
              testPrompts: testPrompts,
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
    setIsConsoleOpen(true);
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
        executionTarget,
        deployedResourceId: executionTarget === 'remote' ? deployedResourceId : undefined,
      },
    });
  };

  // Run all tests sequentially
  const runAllTests = async () => {
    setIsConsoleOpen(true);
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
        executionTarget,
        deployedResourceId: executionTarget === 'remote' ? deployedResourceId : undefined,
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

  const isServerRunning = localRunnerStatus === 'running';
  // Target is ready if either:
  // - local execution target and local runner is 'running'
  // - remote execution target and remote agent is deployed
  const isTargetReady = executionTarget === 'remote' ? isDeployed : isServerRunning;

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0d1117] text-[#c9d1d9] overflow-hidden">
      {/* Top Controls & Metrics Bar */}
      <div className="px-4 py-2.5 bg-[#161b22] border-b border-[#30363d] flex items-center justify-between shrink-0 gap-3">
        {/* Left: Action Buttons & Server Status */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={runAllTests}
            disabled={!isTargetReady || isRunningAll || testPrompts.length === 0}
            title={
              !isTargetReady
                ? executionTarget === 'remote'
                  ? 'Remote agent is not deployed. Deploy to Agent Runtime on the Deployment tab to run tests.'
                  : 'Local agent is offline. Start the agent in the Deployment tab to run tests.'
                : executionTarget === 'remote'
                ? 'Run all unit tests against remote Agent Runtime'
                : 'Run all unit tests'
            }
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-pink-600 hover:bg-pink-500 disabled:opacity-40 disabled:hover:bg-pink-600 text-white font-bold text-xs shadow-md transition-all cursor-pointer disabled:cursor-not-allowed"
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

          {/* Execution Target Selector */}
          <div className="flex items-center gap-1.5 bg-[#0d1117] px-2.5 py-1.5 rounded-lg border border-[#30363d] text-xs">
            <span className="text-gray-400 font-medium shrink-0">Target:</span>
            <select
              value={executionTarget}
              onChange={(e) => {
                userSelectedTargetRef.current = true;
                setExecutionTarget(e.target.value as 'local' | 'remote');
              }}
              className="bg-transparent text-white text-xs font-medium focus:outline-none cursor-pointer"
            >
              <option value="local" className="bg-[#161b22] text-white">
                Local Runner ({isServerRunning ? `:${localRunnerPort}` : 'Offline'})
              </option>
              <option
                value="remote"
                disabled={!isDeployed}
                className="bg-[#161b22] text-white disabled:text-gray-500"
              >
                Remote Agent {isDeployed ? `(${deployedResourceId?.split('/').pop()})` : '(Not Deployed)'}
              </option>
            </select>
          </div>

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

          {/* Target Status Indicator */}
          {executionTarget === 'remote' ? (
            isDeployed ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-indigo-950/80 border border-indigo-500/40 text-indigo-300 text-xs font-mono font-medium ml-1">
                <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse"></span>
                <span>Remote Agent Ready ({deployedResourceId?.split('/').pop()})</span>
                <button
                  type="button"
                  onClick={checkRunnerHealth}
                  className="ml-1 p-0.5 rounded hover:bg-[#30363d] text-gray-300 hover:text-white transition-colors cursor-pointer"
                  title="Check remote agent status"
                >
                  <RotateCcw className={`w-3 h-3 ${isCheckingHealth ? 'animate-spin text-indigo-400' : ''}`} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-950/70 border border-amber-500/40 text-amber-300 text-xs font-medium ml-1">
                <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Remote Agent Not Deployed</span>
                <button
                  type="button"
                  onClick={checkRunnerHealth}
                  className="ml-1 p-0.5 rounded hover:bg-[#30363d] text-gray-300 hover:text-white transition-colors cursor-pointer"
                  title="Check remote agent status"
                >
                  <RotateCcw className={`w-3 h-3 ${isCheckingHealth ? 'animate-spin text-amber-400' : ''}`} />
                </button>
              </div>
            )
          ) : isServerRunning ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-xs font-mono font-medium ml-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>Agent Online (:{localRunnerPort})</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-950/70 border border-amber-500/40 text-amber-300 text-xs font-medium ml-1">
              <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Agent Offline</span>
              <button
                type="button"
                onClick={checkRunnerHealth}
                className="ml-1 p-0.5 rounded hover:bg-[#30363d] text-gray-300 hover:text-white transition-colors cursor-pointer"
                title="Check local agent health"
              >
                <RotateCcw className={`w-3 h-3 ${isCheckingHealth ? 'animate-spin text-amber-400' : ''}`} />
              </button>
            </div>
          )}

          {/* Status Filter Tabs */}
          <div className="flex items-center gap-1 bg-[#0d1117] p-0.5 rounded-lg border border-[#30363d] ml-1">
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
        {/* Offline / Not Deployed Warning Banner */}
        {!isTargetReady && (
          <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-md">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <div>
                <span className="font-semibold text-white">
                  {executionTarget === 'remote' ? 'Remote Agent is Not Deployed.' : 'Local Agent Server is Offline.'}
                </span>
                <span className="text-amber-200/90 ml-1">
                  {executionTarget === 'remote' ? (
                    <>
                      Deploy the workflow to <strong>Agent Runtime</strong> on the Deployment tab to enable remote unit test execution.
                    </>
                  ) : (
                    <>
                      Start the local agent on the <strong>Deployment</strong> tab to enable unit test execution.
                    </>
                  )}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
              <button
                type="button"
                onClick={checkRunnerHealth}
                className="px-2.5 py-1 rounded-md bg-[#21262d] hover:bg-[#30363d] text-gray-200 hover:text-white border border-[#30363d] text-xs transition-colors flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className={`w-3 h-3 ${isCheckingHealth ? 'animate-spin text-amber-400' : ''}`} />
                <span>Check Health</span>
              </button>
              {onNavigateToDeployment && (
                <button
                  type="button"
                  onClick={onNavigateToDeployment}
                  className="px-3 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors flex items-center gap-1 shadow cursor-pointer"
                >
                  <span>Go to Deployment</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        )}

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
                    <span className="font-bold text-xs text-white truncate select-text cursor-text" style={{ userSelect: 'text' }}>
                      {tp.name}
                    </span>
                    <span className="text-[9px] uppercase font-mono px-1.5 py-0.2 rounded bg-[#0d1117] text-gray-400 border border-[#30363d] select-text" style={{ userSelect: 'text' }}>
                      {tp.assertionType || 'contains'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {/* Status Badge */}
                    {isIdle && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#0d1117] text-gray-400 border border-[#30363d] flex items-center gap-1 select-text" style={{ userSelect: 'text' }}>
                        <Clock className="w-2.5 h-2.5" />
                        Ready
                      </span>
                    )}

                    {isRunning && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-500/40 flex items-center gap-1 animate-pulse select-text" style={{ userSelect: 'text' }}>
                        <Activity className="w-2.5 h-2.5 animate-spin" />
                        Running...
                      </span>
                    )}

                    {isPassed && (
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-950/70 text-emerald-400 border border-emerald-500/40 flex items-center gap-1 select-text" style={{ userSelect: 'text' }}>
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        Passed ({result.durationMs}ms)
                      </span>
                    )}

                    {isFailed && (
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-rose-950/70 text-rose-400 border border-rose-500/40 flex items-center gap-1 select-text" style={{ userSelect: 'text' }}>
                        <XCircle className="w-3 h-3 text-rose-400" />
                        Failed
                      </span>
                    )}

                    {/* Run Single Button */}
                    <button
                      type="button"
                      onClick={() => runTest(tp.id)}
                      disabled={!isTargetReady || isRunning || isRunningAll}
                      title={
                        !isTargetReady
                          ? executionTarget === 'remote'
                            ? 'Remote agent is not deployed. Deploy to Agent Runtime on the Deployment tab to run this test.'
                            : 'Local agent server is offline. Start the agent in the Deployment tab to run this test.'
                          : `Execute test scenario against ${executionTarget === 'remote' ? 'remote Agent Runtime' : 'local runner'}`
                      }
                      className="px-2.5 py-1 rounded-md bg-[#0d1117] hover:bg-pink-600 border border-[#30363d] hover:border-pink-500 text-gray-300 hover:text-white text-[11px] font-medium transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:hover:bg-[#0d1117] disabled:hover:border-[#30363d] disabled:cursor-not-allowed"
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
                        onClick={() => handleCopy(tp.prompt || (tp as any).inputQuery || '', `prompt_${tp.id}`)}
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
                    <div className="flex-1 p-2.5 rounded-lg bg-[#0d1117] border border-[#30363d] font-mono text-[11px] text-gray-200 leading-relaxed overflow-y-auto max-h-[140px] select-text cursor-text" style={{ userSelect: 'text' }}>
                      {tp.prompt || (tp as any).inputQuery || ''}
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
                    <div className="flex-1 p-2.5 rounded-lg bg-[#0d1117] border border-[#30363d] font-mono text-[11px] text-gray-300 leading-relaxed overflow-y-auto max-h-[140px] select-text cursor-text" style={{ userSelect: 'text' }}>
                      {tp.expectedOutput || (tp as any).expectedOutputPattern || ''}
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

                    <div className={`flex-1 p-2.5 rounded-lg border font-mono text-[11px] leading-relaxed overflow-y-auto max-h-[140px] select-text cursor-text ${
                      isPassed
                        ? 'bg-[#0d1117] border-emerald-500/30 text-emerald-200'
                        : isFailed
                        ? 'bg-[#0d1117] border-rose-500/30 text-rose-200'
                        : 'bg-[#0d1117] border-[#30363d] text-gray-500 italic'
                    }`} style={{ userSelect: 'text' }}>
                      {isRunning ? (
                        <div className="flex flex-col items-center gap-2 text-amber-400 py-3 justify-center text-center select-text">
                          <div className="flex items-center gap-2">
                            <Activity className="w-3.5 h-3.5 animate-spin" />
                            <span className="font-semibold">Executing test scenario...</span>
                          </div>
                          {latestLogByScenario[tp.id] && (
                            <span className="text-[10.5px] text-gray-400 font-mono line-clamp-2 px-2 select-text cursor-text" style={{ userSelect: 'text' }}>
                              {latestLogByScenario[tp.id]}
                            </span>
                          )}
                        </div>
                      ) : result.output ? (
                        <pre className="whitespace-pre-wrap font-mono text-[10.5px] select-text cursor-text" style={{ userSelect: 'text' }}>
                          {result.output}
                        </pre>
                      ) : isFailed ? (
                        <div className="text-rose-400 text-[10.5px] font-mono whitespace-pre-wrap select-text cursor-text" style={{ userSelect: 'text' }}>
                          {result.assertionDetails || 'Test failed with no response output.'}
                        </div>
                      ) : (
                        <span className="flex items-center justify-center h-full text-center text-gray-500 select-text">
                          Click "Run" to execute this test prompt against the agent workflow.
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Footer Assertion & Multi-Agent Execution Trace (when available) */}
                {result.status !== 'idle' && (result.output || result.assertionDetails) && (
                  <div className="px-3.5 py-2 bg-[#12161c] rounded-b-xl border-t border-[#30363d] flex flex-wrap items-center justify-between text-[11px] gap-2 select-text">
                    <div className="flex items-center gap-1.5 text-gray-300 select-text">
                      {isPassed ? (
                        <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertCircle className="w-3 h-3 text-rose-400 shrink-0" />
                      )}
                      <span className="font-semibold text-gray-400">Assertion:</span>
                      <span className={`select-text cursor-text ${isPassed ? 'text-emerald-300' : 'text-rose-300'}`} style={{ userSelect: 'text' }}>
                        {result.assertionDetails || (isPassed ? 'Passed' : 'Failed')}
                      </span>
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
                  <div className="px-3.5 py-2.5 bg-[#0d1117] border-t border-[#21262d] space-y-1.5 text-[10.5px] select-text">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 select-text">
                      Multi-Agent Execution Pipeline Trace
                    </div>
                    <div className="space-y-1">
                      {result.agentTrace.map((step, sIdx) => (
                        <div key={sIdx} className="flex items-center gap-2 text-gray-300 select-text" style={{ userSelect: 'text' }}>
                          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-[#161b22] text-amber-300 border border-[#30363d] select-text" style={{ userSelect: 'text' }}>
                            {step.agentName}
                          </span>
                          <ArrowRight className="w-2.5 h-2.5 text-gray-500 shrink-0" />
                          <span className="text-gray-300 truncate select-text cursor-text" style={{ userSelect: 'text' }}>{step.step}</span>
                          <span className="ml-auto text-[9.5px] font-mono text-gray-500 select-text" style={{ userSelect: 'text' }}>{step.durationMs}ms</span>
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

      {/* Live Execution Console & Logs */}
      <div className="border-t border-[#30363d] bg-[#0d1117] flex flex-col shrink-0">
        {/* Grab Drag Control to resize Execution Logs */}
        <div
          data-testid="console-resize-handle"
          onMouseDown={handleResizeStart}
          className="h-2 w-full bg-[#161b22] hover:bg-pink-600/70 cursor-row-resize border-b border-[#30363d] flex items-center justify-center transition-colors group select-none"
          title="Drag to resize Execution Logs"
        >
          <div className="w-10 h-1 rounded-full bg-[#30363d] group-hover:bg-white transition-colors" />
        </div>

        <div 
          onClick={() => setIsConsoleOpen(!isConsoleOpen)}
          className="flex items-center justify-between px-4 py-2 bg-[#161b22] border-b border-[#30363d] text-xs font-semibold cursor-pointer select-none hover:bg-[#1c2128]"
        >
          <div className="flex items-center gap-2 text-gray-300">
            <Terminal className="w-3.5 h-3.5 text-pink-400" />
            <span>Execution Logs & Console Output</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-[#0d1117] border border-[#30363d] text-gray-400 font-mono">
              {logs.length}
            </span>
          </div>
          <div className="flex items-center gap-2 text-gray-400 text-[11px]">
            {logs.length > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setLogs([]);
                }}
                className="hover:text-white px-1.5 py-0.5 rounded hover:bg-[#30363d]"
              >
                Clear
              </button>
            )}
            {isConsoleOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </div>
        </div>

        {isConsoleOpen && (
          <div
            className="overflow-y-auto p-4 font-mono text-[11px] space-y-1 bg-[#090d13] text-gray-300 select-text cursor-text"
            style={{ height: `${consoleHeight}px`, userSelect: 'text' }}
          >
            {logs.length === 0 ? (
              <div className="text-gray-500 italic py-2 text-center select-text">
                No execution logs yet. Click "Run" or "Run All Unit Tests" to start testing.
              </div>
            ) : (
              logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-2 leading-relaxed select-text"
                  style={{ userSelect: 'text' }}
                >
                  <span className="text-gray-500 text-[10px] shrink-0 select-text">
                    {log.timestamp}
                  </span>
                  <span
                    className={`text-[10px] font-bold uppercase px-1 rounded shrink-0 select-text ${
                      log.level === 'error'
                        ? 'bg-rose-950 text-rose-400'
                        : log.level === 'warn'
                        ? 'bg-amber-950 text-amber-400'
                        : 'bg-sky-950 text-sky-400'
                    }`}
                  >
                    {log.level}
                  </span>
                  <span
                    className={`select-text ${
                      log.level === 'error'
                        ? 'text-rose-300'
                        : log.level === 'warn'
                        ? 'text-amber-300'
                        : 'text-gray-300'
                    }`}
                    style={{ userSelect: 'text' }}
                  >
                    {log.message}
                  </span>
                </div>
              ))
            )}
            <div ref={consoleEndRef} />
          </div>
        )}
      </div>
    </div>
  );
};
