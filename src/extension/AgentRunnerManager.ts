/**
 * AgentRunnerManager
 *
 * Manages test execution harnesses and server lifecycles for multi-agent workflows.
 * Exposes a clean facade delegating to specialized services.
 *
 * Job inside Application:
 * Exposes the main unified API entrypoints for VS Code CustomTextEditor lifecycle bindings
 * and webview RPC event-handlers, while internalizing port binding, child processes, python templates,
 * and scenarios runtimes into clean sub-modules.
 *
 * Architectural Decisions:
 * - Sub-service Delegation: Strictly delegates to RunnerEnvironment, HealthCheckClient, ProcessLifecycleManager,
 *   LocalRunnerScriptProvider, and TestAndChatExecutor.
 * - Single Event Loop Safety: Sanitizes process environment with system variables.
 * - Facade Pattern: Keeps the main orchestrator code length low (<= 250 lines).
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import * as vscode from 'vscode';
import { ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { WebviewBridge } from './WebviewBridge';
import { PythonEnvResolver } from './PythonEnvResolver';
import { AgentWorkflowDocument, TriggerTestScenario } from '../shared/types';
import { GeminiCodeGenEngine } from './GeminiCodeGenEngine';
import { AgentEngineDeployer } from './AgentEngineDeployer';

import { RunnerEnvironment } from './runner/RunnerEnvironment';
import { HealthCheckClient } from './runner/HealthCheckClient';
import { ProcessLifecycleManager } from './runner/ProcessLifecycleManager';
import { getLocalRunnerScriptContent } from './runner/LocalRunnerScriptProvider';
import { TestAndChatExecutor } from './runner/TestAndChatExecutor';

export interface RunTestOptions {
  document: AgentWorkflowDocument;
  scenarioIds?: string[];
  targetDirectory?: string;
  port?: number;
  bridge: WebviewBridge;
  executionTarget?: 'local' | 'remote';
  deployedResourceId?: string;
}

export interface StartLocalRunnerOptions {
  document?: AgentWorkflowDocument;
  targetDirectory?: string;
  port?: number;
  envVars?: Record<string, string>;
  bridge: WebviewBridge;
}

export interface SendChatMessageOptions {
  sessionId: string;
  message: string;
  streaming?: boolean;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  document?: AgentWorkflowDocument;
  targetDirectory?: string;
  port?: number;
  executionTarget?: 'local' | 'remote';
  deployedResourceId?: string;
  bridge: WebviewBridge;
}

export class AgentRunnerManager {
  private pythonResolver: PythonEnvResolver;
  private codeGenEngine: GeminiCodeGenEngine;
  private agentEngineDeployer?: AgentEngineDeployer;

  private environment = new RunnerEnvironment();
  private healthCheck = new HealthCheckClient();
  private processManager = new ProcessLifecycleManager();
  private executor = new TestAndChatExecutor();

  private runnerLogs: string[] = [];
  private runnerStatus: 'idle' | 'starting' | 'running' | 'stopped' | 'error' = 'idle';
  private lastRunningPort = 8000;
  private ephemeralFiles = new Set<string>();
  private activeAbortControllers = new Map<string, AbortController>();
  private chatSessions = new Map<string, Array<{ role: 'user' | 'assistant'; content: string }>>();
  private remoteReasoningEngineSessions = new Map<string, string>();

  private inFlightStartPromise: Promise<string> | null = null;
  private inFlightStopPromise: Promise<void> | null = null;
  private startupTimeoutTimer: NodeJS.Timeout | null = null;

  constructor(extensionPath: string, workspaceRoot?: string, agentEngineDeployer?: AgentEngineDeployer) {
    this.pythonResolver = new PythonEnvResolver(workspaceRoot);
    this.codeGenEngine = new GeminiCodeGenEngine(extensionPath);
    this.agentEngineDeployer = agentEngineDeployer;
  }

  public getPythonResolver() { return this.pythonResolver; }
  public getCodeGenEngine() { return this.codeGenEngine; }
  public getAgentEngineDeployer() { return this.agentEngineDeployer; }
  public setAgentEngineDeployer(deployer: AgentEngineDeployer) { this.agentEngineDeployer = deployer; }
  public getActiveAbortControllers() { return this.activeAbortControllers; }
  public getChatSessions() { return this.chatSessions; }
  public getRemoteReasoningEngineSessions() { return this.remoteReasoningEngineSessions; }
  public getLastRunningPort() { return this.lastRunningPort; }
  public getRunnerStatus() { return this.runnerStatus; }
  public getRunnerLogs() { return this.runnerLogs; }
  public clearRunnerLogs() { this.runnerLogs = []; }

  public get activeLocalRunners() { return this.processManager.activeLocalRunners; }

  public get startupPollTimer() { return this.healthCheck.healthCheckPollTimer; }
  public set startupPollTimer(val) { this.healthCheck.healthCheckPollTimer = val; }

  public get healthCheckPollTimer() { return this.healthCheck.healthCheckPollTimer; }
  public set healthCheckPollTimer(val) { this.healthCheck.healthCheckPollTimer = val; }

  public get healthCheckTimeoutTimer() { return this.healthCheck.healthCheckTimeoutTimer; }
  public set healthCheckTimeoutTimer(val) { this.healthCheck.healthCheckTimeoutTimer = val; }

  public appendRunnerLog(text: string) {
    this.runnerLogs.push(text);
    if (this.runnerLogs.length > 1000) this.runnerLogs.shift();
  }

  public async sanitizeExecutionEnv(extraVars?: Record<string, string>): Promise<NodeJS.ProcessEnv> {
    return this.environment.sanitizeExecutionEnv(extraVars);
  }

  public formatErrorMessage(err: any): string {
    return this.executor.formatErrorMessage(err);
  }

  public getActiveRunners() {
    const runners: any[] = [];
    for (const [id, proc] of this.processManager.activeLocalRunners.entries()) {
      runners.push({ id, pid: proc.pid, port: this.lastRunningPort, status: this.runnerStatus });
    }
    return runners;
  }

  public async detectLiveRunnerPort(preferredPort?: number) { return this.environment.detectLiveRunnerPort(preferredPort); }
  public async killPort(port?: number) { await this.environment.killPort(port, (msg) => this.appendRunnerLog(msg)); }

  public async httpGetCheck(port: number, pathStr?: string, timeoutMs?: number) {
    return this.healthCheck.httpGetCheck(port, pathStr, timeoutMs);
  }

  public async httpPostJson(port: number, pathStr: string, body: any, timeoutMs?: number, externalSignal?: AbortSignal, extraHeaders?: Record<string, string>) {
    return this.healthCheck.httpPostJson(port, pathStr, body, timeoutMs, externalSignal, extraHeaders);
  }

  public async waitForServerReady(port: number, maxWaitMs?: number) {
    return this.healthCheck.waitForServerReady(port, maxWaitMs, () => this.processManager.activeLocalRunners.size > 0, (msg) => this.appendRunnerLog(msg));
  }

  public async waitForHealthCheck(port: number, maxWaitMs?: number) { return this.waitForServerReady(port, maxWaitMs); }

  /**
   * Probes runner status and posts the result to the webview bridge.
   * Probes /health in real-time so that externally started servers are immediately recognized.
   *
   * @param bridge WebviewBridge instance
   * @param targetPort Optional port to probe
   * @author Mike Nimer <mikenimer@google.com>
   */
  public async sendStatus(bridge: WebviewBridge, targetPort?: number): Promise<void> {
    // Section 1: Resolve target port and probe health
    const port = targetPort || this.lastRunningPort || 8000;
    const isAlive = await this.healthCheck.httpGetCheck(port, '/health', 600);
    const isProcessTracked = this.processManager.activeLocalRunners.size > 0;
    const isRunning = isAlive || isProcessTracked;

    // Section 2: Synchronize runnerStatus state
    if (isAlive) {
      this.runnerStatus = 'running';
      this.lastRunningPort = port;
    } else if (this.runnerStatus === 'running' && !isProcessTracked) {
      this.runnerStatus = 'idle';
    }

    // Section 3: Post LOCAL_RUNNER_STATUS message to webview
    await bridge.postMessage({
      type: 'LOCAL_RUNNER_STATUS',
      payload: {
        status: isRunning ? 'running' : this.runnerStatus,
        port,
        serviceUrl: isRunning ? `http://127.0.0.1:${port}/v1/chat/completions` : undefined,
        logs: this.runnerLogs,
      },
    });
  }

  public resolveRunnerScript(targetDir: string): string | null {
    const serverPy = path.join(targetDir, 'server.py');
    if (fs.existsSync(serverPy)) return serverPy;
    const agentPy = path.join(targetDir, 'agent.py');
    const mainPy = path.join(targetDir, 'main.py');
    if (fs.existsSync(agentPy)) {
      const runnerScript = path.join(targetDir, '_agent_test_runner.py');
      try {
        fs.writeFileSync(runnerScript, getLocalRunnerScriptContent(), 'utf-8');
        this.ephemeralFiles.add(runnerScript);
      } catch {}
      return runnerScript;
    }
    return fs.existsSync(mainPy) ? mainPy : null;
  }

  public startLocalRunner(options: StartLocalRunnerOptions): Promise<string> {
    if (this.inFlightStopPromise) return Promise.reject(new Error('Operation in progress'));
    if (this.inFlightStartPromise) return this.inFlightStartPromise;
    this.inFlightStartPromise = this.startLocalRunnerInternal(options).finally(() => { this.inFlightStartPromise = null; });
    return this.inFlightStartPromise;
  }

  public startRunner(options: StartLocalRunnerOptions) { return this.startLocalRunner(options); }

  private async startLocalRunnerInternal(options: StartLocalRunnerOptions): Promise<string> {
    const { targetDirectory, port = 8000, envVars = {}, bridge } = options;
    const runnerId = `local-runner-${Date.now()}`;
    const targetDir = targetDirectory || process.cwd();
    this.runnerStatus = 'starting';
    this.lastRunningPort = port;

    const startNotice = `[Local Runner] Preparing environment in ${targetDir}...`;
    this.appendRunnerLog(startNotice);
    await bridge.postMessage({ type: 'LOCAL_RUNNER_LOG', payload: { text: startNotice, stream: 'system', timestamp: new Date().toISOString() } });
    await bridge.postMessage({ type: 'LOCAL_RUNNER_STATUS', payload: { status: 'starting', port, logs: this.runnerLogs } });

    let pythonEnv: { path: string };
    try {
      pythonEnv = await this.pythonResolver.ensureVirtualEnvironment(targetDir);
      await this.pythonResolver.ensureDependenciesInstalled(pythonEnv.path, targetDir, async (msg, stream = 'system') => {
        this.appendRunnerLog(msg);
        await bridge.postMessage({ type: 'LOCAL_RUNNER_LOG', payload: { text: msg, stream, timestamp: new Date().toISOString() } });
      });
    } catch (err: any) {
      this.runnerStatus = 'error';
      const errMsg = `[Local Runner Error] Failed to prepare Python runtime and dependencies: ${err.message}`;
      this.appendRunnerLog(errMsg);
      await bridge.postMessage({ type: 'LOCAL_RUNNER_STATUS', payload: { status: 'error', error: err.message, logs: this.runnerLogs } });
      return runnerId;
    }

    const runnerScriptPath = this.resolveRunnerScript(targetDir);
    if (!runnerScriptPath) {
      this.runnerStatus = 'error';
      const notFoundMsg = `[Local Runner Error] No runnable agent script (server.py, agent.py, or main.py) found in ${targetDir}. Please generate code first.`;
      this.appendRunnerLog(notFoundMsg);
      await bridge.postMessage({ type: 'LOCAL_RUNNER_STATUS', payload: { status: 'error', error: notFoundMsg, logs: this.runnerLogs } });
      return runnerId;
    }

    await this.killPort(port);
    const runEnv = await this.environment.sanitizeExecutionEnv({ ...envVars, PORT: String(port) });

    let child: ChildProcess;
    try {
      child = this.processManager.spawn(pythonEnv.path, [runnerScriptPath], { cwd: targetDir, env: runEnv, detached: process.platform !== 'win32' });
    } catch (spawnErr: any) {
      this.runnerStatus = 'error';
      const spawnErrMsg = `[Local Runner Error] Failed to launch process: ${spawnErr?.message || spawnErr}`;
      this.appendRunnerLog(spawnErrMsg);
      await bridge.postMessage({ type: 'LOCAL_RUNNER_STATUS', payload: { status: 'error', error: spawnErrMsg, logs: this.runnerLogs } });
      return runnerId;
    }

    this.processManager.registerProcess(runnerId, child, port);

    const handleOutput = async (chunk: Buffer, stream: 'stdout' | 'stderr') => {
      const text = chunk.toString('utf-8');
      text.trimEnd().split('\n').forEach(line => this.appendRunnerLog(line));
      await bridge.postMessage({ type: 'LOCAL_RUNNER_LOG', payload: { text: text.trimEnd(), stream, timestamp: new Date().toISOString() } });

      const portMatch = text.match(/Uvicorn running on http:\/\/[^:]+:(\d+)/i);
      if (portMatch) {
        const detectedPort = parseInt(portMatch[1], 10);
        this.lastRunningPort = detectedPort;
        this.runnerStatus = 'running';
        await bridge.postMessage({ type: 'LOCAL_RUNNER_STATUS', payload: { status: 'running', port: detectedPort, serviceUrl: `http://localhost:${detectedPort}/v1/chat/completions`, logs: this.runnerLogs } });
      }
    };

    if (child.stdout) child.stdout.on('data', (chunk: Buffer) => handleOutput(chunk, 'stdout'));
    if (child.stderr) child.stderr.on('data', (chunk: Buffer) => handleOutput(chunk, 'stderr'));

    child.on('close', async (code) => {
      this.processManager.unregisterProcess(runnerId);
      this.runnerStatus = 'stopped';
      const closeMsg = `[Local Runner] Process stopped (exit code: ${code})`;
      this.appendRunnerLog(closeMsg);
      await bridge.postMessage({ type: 'LOCAL_RUNNER_STATUS', payload: { status: 'stopped', port: this.lastRunningPort || port, error: code !== 0 && code !== null ? `Process exited with code ${code}` : undefined, logs: this.runnerLogs } });
      await bridge.postMessage({ type: 'LOCAL_RUNNER_LOG', payload: { text: closeMsg, stream: 'system', timestamp: new Date().toISOString() } });

      if (this.healthCheck.pendingHealthCheckReject) {
        this.healthCheck.pendingHealthCheckReject(new Error(`Process exited during health check with code ${code ?? 'unknown'}`));
      }
    });

    child.on('error', async (err) => {
      this.processManager.unregisterProcess(runnerId);
      this.runnerStatus = 'error';
      const errText = `[Local Runner Error] ${err.message}`;
      this.appendRunnerLog(errText);
      await bridge.postMessage({ type: 'LOCAL_RUNNER_STATUS', payload: { status: 'error', error: err.message, logs: this.runnerLogs } });
      await bridge.postMessage({ type: 'LOCAL_RUNNER_LOG', payload: { text: errText, stream: 'stderr', timestamp: new Date().toISOString() } });

      if (this.healthCheck.pendingHealthCheckReject) {
        this.healthCheck.pendingHealthCheckReject(new Error(`Process error during health check: ${err.message}`));
      }
    });

    this.runnerStatus = 'running';
    await bridge.postMessage({ type: 'LOCAL_RUNNER_STATUS', payload: { status: 'running', port, serviceUrl: `http://localhost:${port}/v1/chat/completions`, logs: this.runnerLogs } });

    this.startupTimeoutTimer = setTimeout(async () => {
      if (this.processManager.activeLocalRunners.has(runnerId)) {
        this.runnerStatus = 'running';
        const p = this.lastRunningPort || port;
        await bridge.postMessage({ type: 'LOCAL_RUNNER_STATUS', payload: { status: 'running', port: p, serviceUrl: `http://localhost:${p}/v1/chat/completions`, logs: this.runnerLogs } });
      }
      this.startupTimeoutTimer = null;
    }, 1500);

    return runnerId;
  }

  public async stopLocalRunner(runnerId?: string, targetPort?: number, bridge?: WebviewBridge): Promise<void> {
    if (this.inFlightStartPromise) throw new Error('Operation in progress');
    if (this.inFlightStopPromise) return this.inFlightStopPromise;
    this.inFlightStopPromise = this.stopLocalRunnerInternal(runnerId, targetPort, bridge).finally(() => { this.inFlightStopPromise = null; });
    return this.inFlightStopPromise;
  }

  public async stopRunner(runnerId?: string, targetPort?: number, bridge?: WebviewBridge) { return this.stopLocalRunner(runnerId, targetPort, bridge); }

  private async stopLocalRunnerInternal(runnerId?: string, targetPort?: number, bridge?: WebviewBridge): Promise<void> {
    const portToKill = targetPort || this.lastRunningPort;
    if (this.startupTimeoutTimer) { clearTimeout(this.startupTimeoutTimer); this.startupTimeoutTimer = null; }

    const terminateChild = async (proc: ChildProcess) => {
      proc.removeAllListeners();
      await this.processManager.killProcessTree(proc);
    };

    if (runnerId && this.processManager.activeLocalRunners.has(runnerId)) {
      const proc = this.processManager.activeLocalRunners.get(runnerId);
      this.processManager.activeLocalRunners.delete(runnerId);
      if (proc) await terminateChild(proc);
    } else {
      const runnersToTerminate = Array.from(this.processManager.activeLocalRunners.entries());
      this.processManager.activeLocalRunners.clear();
      for (const [id, proc] of runnersToTerminate) {
        if (proc) await terminateChild(proc);
      }
    }

    if (portToKill) await this.killPort(portToKill);
    this.cleanupEphemeralFiles();

    this.runnerStatus = 'stopped';
    this.appendRunnerLog('[Local Runner] Process stopped.');

    if (bridge) {
      await bridge.postMessage({ type: 'LOCAL_RUNNER_STATUS', payload: { status: 'stopped', port: portToKill, logs: this.runnerLogs } });
    }
  }

  private cleanupEphemeralFiles() {
    for (const filePath of this.ephemeralFiles) {
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch {}
    }
    this.ephemeralFiles.clear();
  }

  public async runTests(options: RunTestOptions): Promise<string> { return this.executor.runTests(this, options); }
  public async sendChatMessage(options: SendChatMessageOptions): Promise<void> { await this.executor.sendChatMessage(this, options); }

  public resetChatSession(sessionId?: string) {
    if (sessionId) {
      this.chatSessions.delete(sessionId);
      this.remoteReasoningEngineSessions.delete(sessionId);
    } else {
      this.chatSessions.clear();
      this.remoteReasoningEngineSessions.clear();
    }
  }

  public getChatHistory(sessionId: string) { return this.chatSessions.get(sessionId) || []; }

  public cancelRun(runId: string) {
    const controller = this.activeAbortControllers.get(runId);
    if (controller) {
      try { controller.abort(); } catch {}
      this.activeAbortControllers.delete(runId);
    }
    const childProc = this.processManager.activeProcesses.get(runId);
    if (childProc && childProc.pid && childProc.pid !== process.pid) {
      try { childProc.kill('SIGTERM'); } catch {}
      this.processManager.activeProcesses.delete(runId);
    }
  }

  public cancelAll() {
    for (const [runId, controller] of this.activeAbortControllers.entries()) {
      try { controller.abort(); } catch {}
      this.activeAbortControllers.delete(runId);
    }
    for (const [runId, child] of this.processManager.activeProcesses.entries()) {
      try {
        if (child.pid && child.pid !== process.pid) child.kill('SIGKILL');
      } catch {}
      this.processManager.activeProcesses.delete(runId);
    }
  }

  public dispose() {
    this.stopLocalRunner();
    this.cancelAll();
    this.cleanupEphemeralFiles();
  }

  public extractScenarios(document: AgentWorkflowDocument, scenarioIds?: string[]): TriggerTestScenario[] {
    const scenarios: TriggerTestScenario[] = [];
    const triggerNodes = (document.nodes || []).filter(n => n.type === 'trigger' || (n as any).type === 'triggerNode');
    const rootAgent = (document.nodes || []).find(n => n.type === 'agent' || (n as any).type === 'agentNode');
    const fallbackSchema = (rootAgent?.data as any)?.structuredOutput || (rootAgent?.data as any)?.structuredOutputSchema;

    for (const node of triggerNodes) {
      const data = node.data as any;
      if (data?.config?.testScenarios && Array.isArray(data.config.testScenarios) && data.config.testScenarios.length > 0) {
        for (const s of data.config.testScenarios) {
          scenarios.push({
            id: s.id,
            name: s.name || s.id,
            inputQuery: s.inputQuery || s.prompt || '',
            expectedOutput: s.expectedOutput,
            assertionType: s.assertionType || (s as any).assertion_type,
            expectedSchema: s.expectedSchema || (s as any).expected_schema || fallbackSchema,
          });
        }
      } else if (data?.config?.testPrompts && Array.isArray(data.config.testPrompts) && data.config.testPrompts.length > 0) {
        for (const p of data.config.testPrompts) {
          scenarios.push({
            id: p.id,
            name: p.name || p.id,
            inputQuery: p.prompt || p.inputQuery || '',
            expectedOutput: p.expectedOutput,
            assertionType: p.assertionType || (p as any).assertion_type,
            expectedSchema: p.expectedSchema || (p as any).expected_schema || fallbackSchema,
          });
        }
      }
    }

    if (scenarios.length === 0) {
      if (scenarioIds && scenarioIds.length > 0) {
        for (const id of scenarioIds) {
          scenarios.push({ id, name: `Test Scenario ${id}`, inputQuery: 'Provide a concise overview and execute planned actions.', expectedOutput: undefined });
        }
      } else {
        scenarios.push({ id: 'default-scenario-1', name: 'Default Test Run', inputQuery: 'Provide a concise overview and execute planned actions.', expectedOutput: undefined });
      }
    }

    if (scenarioIds && scenarioIds.length > 0) {
      const filtered = scenarios.filter(s => scenarioIds.includes(s.id));
      if (filtered.length > 0) return filtered;
    }
    return scenarios;
  }
}
