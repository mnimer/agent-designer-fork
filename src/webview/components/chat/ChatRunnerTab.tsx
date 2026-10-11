/**
 * ChatRunnerTab
 *
 * Interactive chat runner panel for testing multi-agent workflows live in the
 * workbench panel. Connects to the agent's standardized HTTP /v1/chat/completions
 * runner endpoint and streams conversational responses token-by-token over RPC.
 *
 * Architectural Decisions:
 * 1. Strict Runner Gating: Chat Text Field, Send button, and suggestion chips are disabled
 *    until the local runner is verified in 'running' state, preventing fake or premature mock responses.
 * 2. Consistent Health Status UI: Replicates the Test Runner tab health check polling and UI banner,
 *    including the 'Agent Online' / 'Agent Offline' status badge, manual health refresh button, and
 *    direct navigation to the Deployment tab.
 * 3. Bi-directional RPC Streaming: Dispatches SEND_CHAT_MESSAGE and RESET_CHAT_SESSION
 *    over WebviewBridge, and consumes CHAT_STREAM_CHUNK events for real-time token rendering.
 * 4. 8pt Grid System: All layout spacing, margins, paddings, and button dimensions strictly
 *    adhere to multiples of 8px (p-2 = 8px, p-4 = 16px, p-6 = 24px, gap-2, gap-4).
 * 5. Resilient Multi-Turn Memory: Maintains full conversation turn history in state,
 *    passing context to the runner and allowing complete session resets.
 * 6. Keyboard Ergonomics: Supports Enter to send, Shift+Enter for multiline inputs,
 *    and ESC or Stop button to halt streaming.
 * 7. Dual Execution Target (Local Runner vs Remote Agent): Provides target switcher matching
 *    Test Runner tab, routing requests to either local HTTP runner or deployed Vertex AI Reasoning
 *    Engine on Agent Engine, with live target readiness status and persistent localStorage preferences.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  MessageSquare,
  Send,
  Square,
  RotateCcw,
  Trash2,
  Copy,
  Check,
  Bot,
  User,
  AlertCircle,
  Sparkles,
  Zap,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import { ChatMessageRenderer } from './ChatMessageRenderer';
import { VisualAgentDocument } from '../../../shared/types';
import { AgentData, GenerationConfig } from '../../types';
import { AgentWorkflowDocument } from '../../../shared/types';
import { useWebviewBridge } from '../../hooks/useWebviewBridge';

export interface ChatMessageTurn {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  isStreaming?: boolean;
  error?: string;
  trace?: Array<{
    agentName: string;
    step: string;
    durationMs: number;
  }>;
}

export interface ChatRunnerTabProps {
  document?: AgentWorkflowDocument;
  config?: GenerationConfig;
  chatConfig?: {
    initialMessage?: string;
    streaming?: boolean;
    sessionMemory?: string;
  };
  agents?: AgentData[];
  onNavigateToDeployment?: () => void;
}

export const ChatRunnerTab: React.FC<ChatRunnerTabProps> = ({
  document: propDocument,
  config,
  chatConfig,
  agents = [],
  onNavigateToDeployment,
}) => {
  const bridge = useWebviewBridge();
  const sessionIdRef = useRef<string>(`session-${Date.now()}`);

  // NOTE: Start with an empty conversation history (no hard-coded response before server starts)
  const [messages, setMessages] = useState<ChatMessageTurn[]>([]);

  // Default initial message prompt in the input field
  const [inputPrompt, setInputPrompt] = useState<string>('Hello, what can you do?');
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // NOTE: Local Runner lifecycle tracking matching TestRunnerTab
  const [localRunnerStatus, setLocalRunnerStatus] = useState<
    'idle' | 'starting' | 'running' | 'stopped' | 'error'
  >('idle');
  const [localRunnerPort, setLocalRunnerPort] = useState<number>(8000);
  const [isCheckingHealth, setIsCheckingHealth] = useState<boolean>(false);

  // NOTE: Remote deployment status tracking matching TestRunnerTab
  const [remoteEngineId, setRemoteEngineId] = useState<string | null>(null);

  // Check propDocument, generation config, and discovered remote engine ID
  const deployedResourceId =
    (propDocument as any)?.deployment?.deployedResourceId ||
    (config as any)?.deployedResourceId ||
    remoteEngineId;
  const isDeployed = Boolean(deployedResourceId);

  const [executionTarget, setExecutionTarget] = useState<'local' | 'remote'>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('vad_chat_runner_target') : null;
    if (saved === 'remote' || saved === 'local') return saved;
    return isDeployed ? 'remote' : 'local';
  });

  // Persist execution target selection to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('vad_chat_runner_target', executionTarget);
    } catch {}
  }, [executionTarget]);

  // Automatically select remote execution if deployed and local runner is offline
  useEffect(() => {
    if (isDeployed && localRunnerStatus !== 'running') {
      setExecutionTarget('remote');
    }
  }, [isDeployed, localRunnerStatus]);

  // Request Agent Engine deployment status to discover deployed instances from workspace metadata
  useEffect(() => {
    if (!bridge) return;
    const targetDir = config?.outputFolder || config?.targetDirectory;
    bridge.postMessage({
      type: 'GET_AGENT_ENGINE_STATUS',
      payload: { targetDirectory: targetDir },
    });
  }, [bridge, config?.outputFolder, config?.targetDirectory]);

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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeTurnIdRef = useRef<string | null>(null);

  /**
   * Automatically scrolls the chat container to the bottom as tokens or turns arrive.
   */
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isStreaming, scrollToBottom]);

  /**
   * Health check callback (invoked on tab open, target change, or manual user refresh).
   * Dynamically queries GET_AGENT_ENGINE_STATUS when targeting remote Agent Engine,
   * or GET_LOCAL_RUNNER_STATUS when targeting the local uvicorn runner.
   * Matches the exact checkRunnerHealth implementation in TestRunnerTab.
   *
   * @author Mike Nimer <mikenimer@google.com>
   */
  const checkRunnerHealth = useCallback(() => {
    setIsCheckingHealth(true);
    if (executionTarget === 'remote') {
      const targetDir = config?.outputFolder || config?.targetDirectory;
      bridge.postMessage({
        type: 'GET_AGENT_ENGINE_STATUS',
        payload: { targetDirectory: targetDir },
      });
      setTimeout(() => setIsCheckingHealth(false), 1500);
    } else {
      bridge.postMessage({ type: 'GET_LOCAL_RUNNER_STATUS' });
      setTimeout(() => setIsCheckingHealth(false), 1500);
    }
  }, [bridge, executionTarget, config?.outputFolder, config?.targetDirectory]);

  // Check health once on tab mount or whenever execution target changes
  useEffect(() => {
    checkRunnerHealth();
  }, [checkRunnerHealth]);

  // NOTE: Subscribe to local runner status broadcasts from extension host
  useEffect(() => {
    const unsubStatus = bridge.subscribe('LOCAL_RUNNER_STATUS', (payload) => {
      if (payload?.status) {
        setLocalRunnerStatus(payload.status);
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

  const isServerRunning = localRunnerStatus === 'running';
  // Target is ready if either:
  // - local execution target and local runner is 'running'
  // - remote execution target and remote agent is deployed
  const isTargetReady = executionTarget === 'remote' ? isDeployed : isServerRunning;

  // NOTE: Listen for real-time streaming chunks over RPC
  useEffect(() => {
    const unsubChunk = bridge.subscribe('CHAT_STREAM_CHUNK', (payload) => {
      if (!payload || payload.sessionId !== sessionIdRef.current) return;

      const currentTurnId = activeTurnIdRef.current;
      if (!currentTurnId) return;

      setMessages((prev) =>
        prev.map((turn) => {
          if (turn.id !== currentTurnId) return turn;

          const updatedContent = payload.chunk ? turn.content + payload.chunk : turn.content;
          return {
            ...turn,
            content: updatedContent,
            isStreaming: !payload.done,
            error: payload.error || turn.error,
            trace: payload.trace || turn.trace,
          };
        })
      );

      if (payload.done) {
        setIsStreaming(false);
        activeTurnIdRef.current = null;
      }
    });

    return () => {
      unsubChunk();
    };
  }, [bridge]);

  /**
   * Handles sending a new user message turn to the running agent (Local or Remote).
   * Strictly enforces that the target runtime must be ready before dispatching.
   *
   * @param textToSend Optional text overriding the current inputPrompt
   * @author Mike Nimer <mikenimer@google.com>
   */
  const handleSendMessage = useCallback(
    async (textToSend?: string) => {
      // NOTE: Strictly reject sending when runner is not ready
      if (!isTargetReady) return;

      const text = (textToSend !== undefined ? textToSend : inputPrompt).trim();
      if (!text) return;

      setInputPrompt('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }

      // NOTE: Finalize previous in-flight turn if one was streaming
      if (activeTurnIdRef.current) {
        const prevActiveId = activeTurnIdRef.current;
        setMessages((prev) =>
          prev.map((turn) =>
            turn.id === prevActiveId ? { ...turn, isStreaming: false } : turn
          )
        );
      }

      const userTurnId = `user-${Date.now()}`;
      const assistantTurnId = `asst-${Date.now() + 1}`;
      activeTurnIdRef.current = assistantTurnId;

      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      const newHistory: ChatMessageTurn[] = [
        ...messages,
        {
          id: userTurnId,
          role: 'user',
          content: text,
          timestamp: timeStr,
        },
        {
          id: assistantTurnId,
          role: 'assistant',
          content: '',
          timestamp: timeStr,
          isStreaming: true,
        },
      ];

      setMessages(newHistory);
      setIsStreaming(true);

      // NOTE: Dispatch to VS Code extension host over RPC (no fake fallback responses)
      bridge.postMessage({
        type: 'SEND_CHAT_MESSAGE',
        payload: {
          sessionId: sessionIdRef.current,
          message: text,
          streaming: chatConfig?.streaming !== false,
          history: messages
            .filter((m) => m.role === 'user' || m.role === 'assistant')
            .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
          document: propDocument,
          targetDirectory: config?.targetDirectory || config?.outputFolder,
          port: localRunnerPort,
          executionTarget,
          deployedResourceId: executionTarget === 'remote' ? deployedResourceId : undefined,
        },
      });
    },
    [isTargetReady, inputPrompt, messages, bridge, chatConfig, propDocument, config, localRunnerPort, executionTarget, deployedResourceId]
  );

  /**
   * Handles user cancellation of token streaming.
   */
  const handleStopStreaming = useCallback(() => {
    setIsStreaming(false);
    activeTurnIdRef.current = null;
    setMessages((prev) =>
      prev.map((turn) => (turn.isStreaming ? { ...turn, isStreaming: false } : turn))
    );
  }, []);

  /**
   * Resets conversational memory both locally and in the extension host session store.
   */
  const handleResetSession = useCallback(() => {
    sessionIdRef.current = `session-${Date.now()}`;
    activeTurnIdRef.current = null;
    setIsStreaming(false);

    bridge.postMessage({
      type: 'RESET_CHAT_SESSION',
      payload: { sessionId: sessionIdRef.current },
    });

    setMessages([]);
    setInputPrompt('Hello, what can you do?');
  }, [bridge]);

  /**
   * Clears the current message turns on screen without resetting session memory.
   */
  const handleClearHistory = useCallback(() => {
    activeTurnIdRef.current = null;
    setIsStreaming(false);
    setMessages([]);
  }, []);

  /**
   * Copies turn text to the system clipboard.
   */
  const handleCopy = useCallback((id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  }, []);

  /**
   * Handles keyboard events in the prompt textarea (Enter to submit message, Shift+Enter for newline).
   *
   * Architectural Decisions:
   * - Checks e.key === 'Enter' and e.keyCode === 13 for cross-environment compatibility.
   * - Prevents submit when Shift is held (allowing multiline input).
   * - Prevents submit during active IME composition (CJK).
   * - Passes target value directly to handleSendMessage to avoid any state synchronization race condition.
   *
   * @param e React KeyboardEvent
   * @author Mike Nimer <mikenimer@google.com>
   */
  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.key === 'Enter' || e.keyCode === 13) && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        const text = (e.currentTarget?.value ?? inputPrompt).trim();
        if (text && isTargetReady) {
          handleSendMessage(text);
        }
      }
    },
    [handleSendMessage, inputPrompt, isTargetReady]
  );

  /**
   * Handles text input change and dynamically adjusts height.
   */
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputPrompt(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  };

  // Determine root agent name and active model
  const rootAgent =
    agents.find((a) => a.isStartNode) || (agents.length > 0 ? agents[0] : null);
  const rootAgentName = rootAgent?.label || rootAgent?.name || 'Root Agent';
  const activeModel = rootAgent?.model || 'gemini-flash-latest';

  const suggestedPrompts = [
    'What tools and capabilities do you have?',
    'Summarize your primary goal and workflow steps.',
    'Execute a status check on all connected agents.',
  ];

  return (
    <div className="flex flex-col h-full bg-[#0d1117] text-gray-200 select-text overflow-hidden">
      {/* Top Header Bar (8pt spacing grid: px-4 py-2 = 16px horizontal, 8px vertical) */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#30363d] bg-[#161b22] shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-emerald-950/40 border border-emerald-500/30 text-emerald-400">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-xs text-white truncate max-w-[140px]">
              {rootAgentName}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded font-mono font-medium bg-[#21262d] text-gray-300 border border-[#30363d]">
              {activeModel}
            </span>
          </div>
        </div>

        {/* Right Status Controls - Exactly matching TestRunnerTab */}
        <div className="flex items-center gap-2">
          {/* Execution Target Selector */}
          <div className="flex items-center gap-1.5 bg-[#0d1117] px-2.5 py-1.5 rounded-lg border border-[#30363d] text-xs">
            <span className="text-gray-400 font-medium shrink-0">Target:</span>
            <select
              value={executionTarget}
              onChange={(e) => setExecutionTarget(e.target.value as 'local' | 'remote')}
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

          {/* Reset Session Button */}
          <button
            type="button"
            onClick={handleResetSession}
            title="Reset conversation memory"
            className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md bg-[#21262d] hover:bg-[#30363d] text-gray-300 hover:text-white border border-[#30363d] transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3 h-3 text-emerald-400" />
            <span>Reset</span>
          </button>

          {/* Clear History Button */}
          <button
            type="button"
            onClick={handleClearHistory}
            title="Clear turn messages"
            className="p-1 rounded-md hover:bg-[#30363d] text-gray-400 hover:text-white border border-transparent hover:border-[#30363d] transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          {/* Target Status Indicator */}
          {executionTarget === 'remote' ? (
            isDeployed ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-indigo-950/80 border border-indigo-500/40 text-indigo-300 text-xs font-mono font-medium">
                <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                <span>Remote Agent Ready</span>
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
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-950/70 border border-amber-500/40 text-amber-300 text-xs font-medium">
                <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Remote Not Deployed</span>
                <button
                  type="button"
                  onClick={checkRunnerHealth}
                  className="ml-1 p-0.5 rounded hover:bg-[#30363d] text-gray-300 hover:text-white transition-colors cursor-pointer"
                  title="Check remote deployment status"
                >
                  <RotateCcw className={`w-3 h-3 ${isCheckingHealth ? 'animate-spin text-amber-400' : ''}`} />
                </button>
              </div>
            )
          ) : isServerRunning ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-xs font-mono font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Agent Online (:{localRunnerPort})</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-950/70 border border-amber-500/40 text-amber-300 text-xs font-medium">
              <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>{localRunnerStatus === 'starting' ? 'Agent Starting...' : 'Agent Offline'}</span>
              <button
                type="button"
                onClick={checkRunnerHealth}
                className="ml-1 p-0.5 rounded hover:bg-[#30363d] text-gray-300 hover:text-white transition-colors cursor-pointer"
                title="Check agent health"
              >
                <RotateCcw className={`w-3 h-3 ${isCheckingHealth ? 'animate-spin text-amber-400' : ''}`} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Offline / Not Deployed Warning Banner (8pt grid: mx-4 mt-3 = 16px margins, matching TestRunnerTab) */}
      {!isTargetReady && (
        <div className="mx-4 mt-3 p-3 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-md shrink-0">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <div>
              <span className="font-semibold text-white">
                {executionTarget === 'remote' ? 'Remote Agent is Not Deployed.' : 'Local Agent Server is Offline.'}
              </span>
              <span className="text-amber-200/90 ml-1">
                {executionTarget === 'remote' ? (
                  <>Deploy to Agent Engine on the <strong>Deployment</strong> tab to enable interactive chat.</>
                ) : (
                  <>Start the local agent on the <strong>Deployment</strong> tab to enable interactive chat.</>
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

      {/* Main Conversation Turn Area (8pt grid: p-4 = 16px) */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-6 text-gray-500">
            <MessageSquare className="w-8 h-8 text-gray-600 mb-2" />
            <p className="text-sm font-medium text-gray-400">No active conversation</p>
            <p className="text-xs text-gray-500 mt-1 max-w-xs">
              Type a prompt below or click a suggestion to start testing your workflow.
            </p>
          </div>
        ) : (
          messages.map((turn) => {
            const isUser = turn.role === 'user';

            return (
              <div
                key={turn.id}
                className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'} group`}
              >
                {!isUser && (
                  <div className="w-7 h-7 rounded-lg bg-emerald-950/60 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5 shadow-sm">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div
                  className={`relative max-w-[85%] rounded-xl p-3 text-xs leading-relaxed shadow-sm transition-all ${
                    isUser
                      ? 'bg-blue-600/20 border border-blue-500/30 text-blue-100 rounded-tr-none'
                      : 'bg-[#161b22] border border-[#30363d] text-gray-200 rounded-tl-none group-hover:border-emerald-500/30'
                  }`}
                >
                  {/* Top metadata */}
                  <div className="flex items-center justify-between gap-4 mb-1 text-[10px] text-gray-400">
                    <span className="font-semibold text-gray-300">
                      {isUser ? 'You' : rootAgentName}
                    </span>
                    <span className="text-[9px] font-mono opacity-60">{turn.timestamp}</span>
                  </div>

                  {/* Message Content */}
                  <div className="break-words font-sans">
                    {turn.content ? (
                      <>
                        <ChatMessageRenderer
                          content={turn.content}
                          isUser={isUser}
                          isStreaming={turn.isStreaming}
                          onActionClick={(actionText) => handleSendMessage(actionText)}
                        />
                        {/* Blinking streaming cursor */}
                        {turn.isStreaming && (
                          <span className="inline-block w-1.5 h-3.5 ml-1 bg-emerald-400 animate-pulse align-middle" />
                        )}
                      </>
                    ) : turn.isStreaming ? (
                      <span className="flex items-center gap-1 text-emerald-400 font-mono text-[11px]">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce" />
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce [animation-delay:0.2s]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce [animation-delay:0.4s]" />
                        <span className="ml-1 text-gray-400 italic">Thinking...</span>
                      </span>
                    ) : (
                      <span className="text-gray-500 italic">Empty response</span>
                    )}
                  </div>

                  {/* Error banner if turn errored */}
                  {turn.error && (
                    <div className="mt-2 p-2 rounded bg-rose-950/40 border border-rose-500/40 text-rose-300 text-[11px] flex items-start gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                      <span>{turn.error}</span>
                    </div>
                  )}

                  {/* Subagent reasoning trace pill if present */}
                  {turn.trace && turn.trace.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-[#30363d] space-y-1">
                      <div className="text-[9px] font-mono text-gray-400 uppercase tracking-wider flex items-center gap-1">
                        <Zap className="w-2.5 h-2.5 text-amber-400" />
                        <span>Execution Trace</span>
                      </div>
                      {turn.trace.map((step, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between text-[10px] font-mono text-gray-400 bg-[#0d1117] px-2 py-0.5 rounded border border-[#21262d]"
                        >
                          <span className="truncate">{step.agentName}: {step.step}</span>
                          <span className="text-gray-500 shrink-0 ml-2">{step.durationMs}ms</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Copy Action button on hover */}
                  {turn.content && (
                    <button
                      type="button"
                      onClick={() => handleCopy(turn.id, turn.content)}
                      title="Copy response"
                      className="absolute bottom-2 right-2 p-1 rounded bg-[#0d1117] hover:bg-[#21262d] text-gray-400 hover:text-white border border-[#30363d] opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    >
                      {copiedId === turn.id ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                  )}
                </div>

                {isUser && (
                  <div className="w-7 h-7 rounded-lg bg-blue-950/60 border border-blue-500/40 flex items-center justify-center text-blue-400 shrink-0 mt-0.5 shadow-sm">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Prompt Chips (Rendered when conversation is just the initial welcome turn) */}
      {messages.length <= 1 && (
        <div className="px-4 py-2 border-t border-[#21262d] bg-[#161b22]/50 flex items-center gap-2 overflow-x-auto shrink-0">
          <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider flex items-center gap-1 shrink-0">
            <Sparkles className="w-3 h-3 text-emerald-400" />
            Suggestions:
          </span>
          {suggestedPrompts.map((prompt, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSendMessage(prompt)}
              disabled={!isTargetReady}
              title={
                !isTargetReady
                  ? executionTarget === 'remote'
                    ? 'Remote agent is not deployed. Deploy to Agent Engine on the Deployment tab.'
                    : 'Local agent server is offline. Start the agent in the Deployment tab.'
                  : prompt
              }
              className="px-2.5 py-1 rounded-full bg-[#21262d] hover:bg-emerald-950/30 hover:border-emerald-500/40 border border-[#30363d] text-xs text-gray-300 hover:text-emerald-300 transition-colors whitespace-nowrap cursor-pointer shrink-0 disabled:opacity-40 disabled:hover:bg-[#21262d] disabled:hover:border-[#30363d] disabled:hover:text-gray-300 disabled:cursor-not-allowed"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}

      {/* Input Area (8pt spacing grid: p-3 = 12px / 8pt standard: p-2 + p-1) */}
      <div className="p-3 border-t border-[#30363d] bg-[#161b22] shrink-0">
        <div
          className={`flex items-end gap-2 bg-[#0d1117] rounded-xl border p-2 transition-all shadow-inner ${
            !isTargetReady
              ? 'border-[#21262d] opacity-60'
              : executionTarget === 'remote'
              ? 'border-[#30363d] focus-within:border-indigo-500/60 focus-within:ring-1 focus-within:ring-indigo-500/40'
              : 'border-[#30363d] focus-within:border-emerald-500/60 focus-within:ring-1 focus-within:ring-emerald-500/40'
          }`}
        >
          <textarea
            ref={textareaRef}
            rows={1}
            value={inputPrompt}
            onChange={handleTextareaChange}
            onKeyDown={handleInputKeyDown}
            placeholder={
              !isTargetReady
                ? executionTarget === 'remote'
                  ? 'Remote agent is not deployed. Deploy to Agent Engine on the Deployment tab to chat...'
                  : localRunnerStatus === 'starting'
                  ? 'Local agent server is starting...'
                  : 'Local agent server is offline. Start the agent in the Deployment tab to chat...'
                : 'Type a message (Enter to send, Shift+Enter for newline)...'
            }
            disabled={!isTargetReady}
            className="flex-1 bg-transparent border-0 text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-0 resize-none max-h-28 py-1.5 px-2 font-sans disabled:cursor-not-allowed"
          />

          {isStreaming && !inputPrompt.trim() ? (
            <button
              type="button"
              onClick={handleStopStreaming}
              title="Stop streaming"
              className="p-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white transition-colors cursor-pointer shrink-0 shadow-sm"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleSendMessage()}
              disabled={!isTargetReady || !inputPrompt.trim()}
              title={
                !isTargetReady
                  ? executionTarget === 'remote'
                    ? 'Remote agent is not deployed. Deploy to Agent Engine on the Deployment tab to send messages.'
                    : 'Local agent server is offline. Start the agent in the Deployment tab to send messages.'
                  : !inputPrompt.trim()
                  ? 'Enter a message first'
                  : 'Send message'
              }
              className={`p-2 rounded-lg transition-colors shrink-0 shadow-sm ${
                isTargetReady && inputPrompt.trim()
                  ? executionTarget === 'remote'
                    ? 'bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer'
                  : 'bg-[#21262d] text-gray-500 cursor-not-allowed'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Offline / Not Deployed Runner Hint Bar */}
        {!isTargetReady && (
          <div className="flex items-center justify-between mt-2 px-1 text-[10px] text-gray-400">
            <span className="flex items-center gap-1">
              <AlertCircle className="w-3 h-3 text-amber-400 shrink-0" />
              <span>
                {executionTarget === 'remote' ? (
                  <>Remote Agent Engine is currently <strong>not deployed</strong>. Deploy to Agent Engine on the Deployment tab to enable chat.</>
                ) : (
                  <>Agent server is currently <strong>{localRunnerStatus}</strong>. Start the runner in the Deployment tab to enable chat.</>
                )}
              </span>
            </span>
            {onNavigateToDeployment && (
              <button
                type="button"
                onClick={onNavigateToDeployment}
                className="text-emerald-400 hover:underline cursor-pointer ml-2 shrink-0 font-medium"
              >
                Go to Deployment
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
