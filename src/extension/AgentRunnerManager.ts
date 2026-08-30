/**
 * AgentRunnerManager
 *
 * Manages test execution harnesses and server lifecycles for multi-agent workflows.
 * Standardized on an HTTP API client architecture (/v1/chat/completions) that works
 * identically across all current and future frameworks (Google ADK, LangChain,
 * LangGraph, OpenAI, Claude).
 *
 * Job in Application:
 * Handles the backend runtime execution of agent workflows for testing and validation.
 * Interacts with the agent via standard OpenAI-compatible HTTP endpoints and streams
 * real-time progress, logs, and assertion evaluations to the Webview.
 *
 * Architectural Decisions:
 * 1. Single Universal HTTP Harness: Tests are executed strictly against the agent's
 *    standardized HTTP server endpoint (POST /v1/chat/completions) on localhost.
 * 2. Automatic Server Startup: If the local server is offline when tests are initiated,
 *    AgentRunnerManager automatically launches the server process in the background and
 *    polls /health until ready before executing scenarios.
 * 3. Pure Decoupling: The VS Code extension host operates purely as an HTTP client during
 *    test runs, eliminating nested Python interpreters, AST manipulations, and buffer crashes.
 * 4. Multi-Framework Portability: Any agent framework (ADK, LangGraph, OpenAI Swarm, Claude MCP)
 *    that exposes /health and /v1/chat/completions is 100% compatible with the Test Runner.
 * 5. Structured Output & Smart Assertions: Evaluates test assertions against both raw text
 *    and structured JSON payloads (key-value schema matching).
 * 6. Clean Process & Port Management: OS-specific port clearing (killPort) and graceful
 *    process termination on webview disposal.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import * as vscode from 'vscode';
import { ChildProcess, spawn, execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import { WebviewBridge } from './WebviewBridge';
import { PythonEnvResolver } from './PythonEnvResolver';
import {
  AgentWorkflowDocument,
  TriggerTestScenario,
} from '../shared/types';
import { GeminiCodeGenEngine } from './GeminiCodeGenEngine';

export interface RunTestOptions {
  document: AgentWorkflowDocument;
  scenarioIds?: string[];
  targetDirectory?: string;
  port?: number;
  bridge: WebviewBridge;
}

export interface StartLocalRunnerOptions {
  document?: AgentWorkflowDocument;
  targetDirectory?: string;
  port?: number;
  envVars?: Record<string, string>;
  bridge: WebviewBridge;
}

export class AgentRunnerManager {
  private activeProcesses: Map<string, ChildProcess> = new Map();
  private activeLocalRunners: Map<string, ChildProcess> = new Map();
  private lastRunningPort: number = 8000;
  private runnerLogs: string[] = [];
  private runnerStatus: 'idle' | 'starting' | 'running' | 'stopped' | 'error' = 'idle';
  private pythonResolver: PythonEnvResolver;
  private codeGenEngine: GeminiCodeGenEngine;

  /**
   * Constructs the AgentRunnerManager.
   *
   * @param extensionPath Extension root path for template resolution
   * @param workspaceRoot Optional workspace root path
   */
  constructor(extensionPath: string, workspaceRoot?: string) {
    this.pythonResolver = new PythonEnvResolver(workspaceRoot);
    this.codeGenEngine = new GeminiCodeGenEngine(extensionPath);
  }

  /**
   * Appends a log line to the persistent in-memory runner logs buffer.
   *
   * @param text Log text line
   */
  private appendRunnerLog(text: string): void {
    this.runnerLogs.push(text);
    if (this.runnerLogs.length > 1000) {
      this.runnerLogs.shift();
    }
  }

  /**
   * Sends the current runner lifecycle status and logs over the bridge.
   * Probes /health in real-time so that externally started servers are immediately recognized.
   *
   * @param bridge WebviewBridge instance
   * @param targetPort Optional port to check
   */
  public async sendStatus(bridge: WebviewBridge, targetPort?: number): Promise<void> {
    const port = targetPort || this.lastRunningPort || 8000;
    const isAlive = await this.httpGetCheck(port, '/health', 600);
    const isProcessTracked = this.activeLocalRunners.size > 0;
    const isRunning = isAlive || isProcessTracked;

    if (isAlive) {
      this.runnerStatus = 'running';
      this.lastRunningPort = port;
    } else if (this.runnerStatus === 'running' && !isProcessTracked) {
      this.runnerStatus = 'idle';
    }

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

  /**
   * Sanitizes environment variables for agent execution.
   * Auto-configures Vertex AI global location and project ID if not explicitly specified.
   *
   * @param extraVars Additional custom environment variables from the user
   * @returns Cleaned NodeJS.ProcessEnv object
   */
  private sanitizeExecutionEnv(extraVars?: Record<string, string>): NodeJS.ProcessEnv {
    const cleanEnv: NodeJS.ProcessEnv = {
      ...process.env,
      ...extraVars,
      PYTHONUNBUFFERED: '1',
    };

    // If GEMINI_API_KEY is empty or not provided, remove it so google-genai activates Vertex AI / ADC
    if (!cleanEnv.GEMINI_API_KEY || !cleanEnv.GEMINI_API_KEY.trim()) {
      delete cleanEnv.GEMINI_API_KEY;
      cleanEnv.GOOGLE_GENAI_USE_VERTEXAI = 'true';
    }

    // Auto-discover GCP project if missing
    if (!cleanEnv.GOOGLE_CLOUD_PROJECT && !cleanEnv.GCP_PROJECT) {
      try {
        const discovered = execSync('gcloud config get-value project', {
          encoding: 'utf-8',
          timeout: 3000,
        }).trim();
        if (discovered && !discovered.includes('(unset)')) {
          cleanEnv.GOOGLE_CLOUD_PROJECT = discovered;
        }
      } catch {}
    }

    // Default location to 'global' if not specified
    if (!cleanEnv.GOOGLE_CLOUD_LOCATION && !cleanEnv.GOOGLE_CLOUD_REGION && !cleanEnv.CLOUD_ML_REGION) {
      cleanEnv.GOOGLE_CLOUD_LOCATION = 'global';
      cleanEnv.GOOGLE_CLOUD_REGION = 'global';
    }
    if (cleanEnv.GOOGLE_CLOUD_LOCATION) {
      cleanEnv.GOOGLE_GENAI_LOCATION = cleanEnv.GOOGLE_CLOUD_LOCATION;
      cleanEnv.CLOUD_ML_REGION = cleanEnv.GOOGLE_CLOUD_LOCATION;
    }

    return cleanEnv;
  }

  /**
   * Starts a local agent runner process (FastAPI/Uvicorn server) in the target directory.
   *
   * Logic Flow:
   * 1. Resolves target directory and ensures virtualenv dependencies are present.
   * 2. Clears any existing processes holding the target port.
   * 3. Spawns server.py (or main.py) and streams stdout/stderr logs over WebviewBridge.
   * 4. Detects dynamic port binding and notifies the webview of running state.
   *
   * @param options StartLocalRunnerOptions
   * @returns Runner ID string
   */
  public async startLocalRunner(options: StartLocalRunnerOptions): Promise<string> {
    const { targetDirectory, port = 8000, envVars = {}, bridge } = options;
    const runnerId = `local-runner-${Date.now()}`;
    const targetDir = targetDirectory || path.join(process.cwd(), 'src', 'agents');

    this.runnerStatus = 'starting';
    this.lastRunningPort = port;

    const startNotice = `[Local Runner] Preparing environment in ${targetDir}...`;
    this.appendRunnerLog(startNotice);
    await bridge.postMessage({
      type: 'LOCAL_RUNNER_LOG',
      payload: {
        text: startNotice,
        stream: 'system',
        timestamp: new Date().toISOString(),
      },
    });

    await bridge.postMessage({
      type: 'LOCAL_RUNNER_STATUS',
      payload: {
        status: 'starting',
        port,
        logs: this.runnerLogs,
      },
    });

    // Resolve Python runtime and ensure virtualenv is ready
    let pythonEnv: { path: string; isVirtualEnv?: boolean; source?: string; version?: string };
    try {
      pythonEnv = await this.pythonResolver.ensureVirtualEnvironment(targetDir);
      await this.pythonResolver.ensureDependenciesInstalled(
        pythonEnv.path,
        targetDir,
        async (msg, stream = 'system') => {
          this.appendRunnerLog(msg);
          await bridge.postMessage({
            type: 'LOCAL_RUNNER_LOG',
            payload: {
              text: msg,
              stream,
              timestamp: new Date().toISOString(),
            },
          });
        }
      );
    } catch (err: any) {
      this.runnerStatus = 'error';
      const errMsg = `[Local Runner Error] Failed to prepare Python runtime and dependencies: ${err.message}`;
      this.appendRunnerLog(errMsg);
      await bridge.postMessage({
        type: 'LOCAL_RUNNER_STATUS',
        payload: {
          status: 'error',
          error: err.message,
          logs: this.runnerLogs,
        },
      });
      return runnerId;
    }

    // Locate entrypoint server script (server.py or main.py)
    const serverPy = path.join(targetDir, 'server.py');
    const mainPy = path.join(targetDir, 'main.py');
    let runnerScriptPath = serverPy;

    if (!fs.existsSync(serverPy)) {
      if (fs.existsSync(mainPy)) {
        runnerScriptPath = mainPy;
      } else {
        this.runnerStatus = 'error';
        const notFoundMsg = `[Local Runner Error] Entry point script (server.py or main.py) not found in ${targetDir}. Please generate code first.`;
        this.appendRunnerLog(notFoundMsg);
        await bridge.postMessage({
          type: 'LOCAL_RUNNER_STATUS',
          payload: {
            status: 'error',
            error: notFoundMsg,
            logs: this.runnerLogs,
          },
        });
        return runnerId;
      }
    }

    // Free the port if currently occupied
    this.killPort(port);

    const runEnv: NodeJS.ProcessEnv = this.sanitizeExecutionEnv({
      ...envVars,
      PORT: String(port),
    });

    let child: ChildProcess;
    try {
      child = spawn(pythonEnv.path, [runnerScriptPath], {
        cwd: targetDir,
        env: runEnv,
        detached: process.platform !== 'win32',
      });
    } catch (spawnErr: any) {
      this.runnerStatus = 'error';
      const spawnErrMsg = `[Local Runner Error] Failed to launch process: ${spawnErr?.message || spawnErr}`;
      this.appendRunnerLog(spawnErrMsg);
      await bridge.postMessage({
        type: 'LOCAL_RUNNER_STATUS',
        payload: {
          status: 'error',
          error: spawnErrMsg,
          logs: this.runnerLogs,
        },
      });
      return runnerId;
    }

    this.activeLocalRunners.set(runnerId, child);

    const handleOutput = async (chunk: Buffer, stream: 'stdout' | 'stderr') => {
      const text = chunk.toString('utf-8');
      const lines = text.trimEnd().split('\n');
      for (const line of lines) {
        this.appendRunnerLog(line);
      }

      await bridge.postMessage({
        type: 'LOCAL_RUNNER_LOG',
        payload: {
          text: text.trimEnd(),
          stream,
          timestamp: new Date().toISOString(),
        },
      });

      // Detect port from Uvicorn logs (e.g. "Uvicorn running on http://0.0.0.0:8000")
      const portMatch = text.match(/Uvicorn running on http:\/\/[^:]+:(\d+)/i);
      if (portMatch) {
        const detectedPort = parseInt(portMatch[1], 10);
        this.lastRunningPort = detectedPort;
        this.runnerStatus = 'running';
        await bridge.postMessage({
          type: 'LOCAL_RUNNER_STATUS',
          payload: {
            status: 'running',
            port: detectedPort,
            serviceUrl: `http://localhost:${detectedPort}/v1/chat/completions`,
            logs: this.runnerLogs,
          },
        });
      }
    };

    if (child.stdout) {
      child.stdout.on('data', (chunk: Buffer) => handleOutput(chunk, 'stdout'));
    }
    if (child.stderr) {
      child.stderr.on('data', (chunk: Buffer) => handleOutput(chunk, 'stderr'));
    }

    child.on('close', async (code) => {
      this.activeLocalRunners.delete(runnerId);
      this.runnerStatus = 'stopped';
      const closeMsg = `[Local Runner] Process stopped (exit code: ${code})`;
      this.appendRunnerLog(closeMsg);
      await bridge.postMessage({
        type: 'LOCAL_RUNNER_STATUS',
        payload: {
          status: 'stopped',
          port: this.lastRunningPort || port,
          error: code !== 0 && code !== null ? `Process exited with code ${code}` : undefined,
          logs: this.runnerLogs,
        },
      });
      await bridge.postMessage({
        type: 'LOCAL_RUNNER_LOG',
        payload: {
          text: closeMsg,
          stream: 'system',
          timestamp: new Date().toISOString(),
        },
      });
    });

    child.on('error', async (err) => {
      this.activeLocalRunners.delete(runnerId);
      this.runnerStatus = 'error';
      const errText = `[Local Runner Error] ${err.message}`;
      this.appendRunnerLog(errText);
      await bridge.postMessage({
        type: 'LOCAL_RUNNER_STATUS',
        payload: {
          status: 'error',
          error: err.message,
          logs: this.runnerLogs,
        },
      });
      await bridge.postMessage({
        type: 'LOCAL_RUNNER_LOG',
        payload: {
          text: errText,
          stream: 'stderr',
          timestamp: new Date().toISOString(),
        },
      });
    });

    // Notify running status immediately upon spawn
    this.runnerStatus = 'running';
    await bridge.postMessage({
      type: 'LOCAL_RUNNER_STATUS',
      payload: {
        status: 'running',
        port,
        serviceUrl: `http://localhost:${port}/v1/chat/completions`,
        logs: this.runnerLogs,
      },
    });

    // Re-confirm running status after brief startup buffer
    setTimeout(async () => {
      if (this.activeLocalRunners.has(runnerId)) {
        this.runnerStatus = 'running';
        const p = this.lastRunningPort || port;
        await bridge.postMessage({
          type: 'LOCAL_RUNNER_STATUS',
          payload: {
            status: 'running',
            port: p,
            serviceUrl: `http://localhost:${p}/v1/chat/completions`,
            logs: this.runnerLogs,
          },
        });
      }
    }, 1500);

    return runnerId;
  }

  /**
   * Kills any external process currently listening on the specified TCP port across OS platforms.
   * Explicitly protects the current VS Code extension host process and parent process from termination.
   *
   * @param port TCP port to clear
   */
  public killPort(port?: number): void {
    if (!port || isNaN(port) || port <= 0) return;
    const currentPid = process.pid;
    const parentPid = process.ppid;

    try {
      if (process.platform === 'win32') {
        try {
          execSync(
            `powershell -NoProfile -NonInteractive -Command "Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { if ($_ -ne ${currentPid} -and $_ -ne ${parentPid}) { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } }"`,
            { stdio: 'ignore', timeout: 3000 }
          );
        } catch {
          try {
            const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf-8', timeout: 3000 });
            const pids = new Set<number>();
            for (const line of out.split('\n')) {
              if (!line.includes('LISTENING')) continue;
              const parts = line.trim().split(/\s+/);
              const pidStr = parts[parts.length - 1];
              const pid = parseInt(pidStr, 10);
              if (!isNaN(pid) && pid > 0 && pid !== currentPid && pid !== parentPid) {
                pids.add(pid);
              }
            }
            for (const pid of pids) {
              try {
                execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore', timeout: 2000 });
              } catch {}
            }
          } catch {}
        }
      } else {
        try {
          // -sTCP:LISTEN ensures we ONLY target listening server sockets, NEVER client/outbound sockets from VS Code
          const lsofOut = execSync(`lsof -ti -sTCP:LISTEN -P -i :${port}`, { encoding: 'utf-8', timeout: 3000 }).trim();
          if (lsofOut) {
            const pids = lsofOut.split(/\s+/).filter(Boolean);
            for (const pidStr of pids) {
              const pid = parseInt(pidStr, 10);
              if (!isNaN(pid) && pid > 1 && pid !== currentPid && pid !== parentPid) {
                try {
                  process.kill(pid, 'SIGKILL');
                } catch {
                  try {
                    execSync(`kill -9 ${pid} 2>/dev/null`, { stdio: 'ignore', timeout: 2000 });
                  } catch {}
                }
              }
            }
          }
        } catch {
          // No listening process or port is already free
        }
      }
    } catch {}
  }

  /**
   * Stops active local runner subprocesses and releases the port.
   *
   * @param runnerId Optional runner ID to terminate
   * @param targetPort Optional port to force kill listeners on
   * @param bridge Optional WebviewBridge for status notification
   */
  public async stopLocalRunner(runnerId?: string, targetPort?: number, bridge?: WebviewBridge): Promise<void> {
    const portToKill = targetPort || this.lastRunningPort;

    const terminateChild = (proc: ChildProcess) => {
      try {
        if (proc.pid && proc.pid !== process.pid && proc.pid !== process.ppid) {
          if (process.platform !== 'win32') {
            try {
              process.kill(-proc.pid, 'SIGKILL');
            } catch {
              proc.kill('SIGKILL');
            }
          } else {
            proc.kill('SIGKILL');
          }
        }
      } catch {}
    };

    if (runnerId && this.activeLocalRunners.has(runnerId)) {
      const proc = this.activeLocalRunners.get(runnerId);
      if (proc) terminateChild(proc);
      this.activeLocalRunners.delete(runnerId);
    } else {
      for (const [id, proc] of this.activeLocalRunners.entries()) {
        terminateChild(proc);
        this.activeLocalRunners.delete(id);
      }
    }

    if (portToKill) {
      this.killPort(portToKill);
    }

    this.runnerStatus = 'stopped';
    const stopMsg = '[Local Runner] Process stopped.';
    this.appendRunnerLog(stopMsg);

    if (bridge) {
      await bridge.postMessage({
        type: 'LOCAL_RUNNER_STATUS',
        payload: {
          status: 'stopped',
          port: portToKill || 8000,
          logs: this.runnerLogs,
        },
      });
      await bridge.postMessage({
        type: 'LOCAL_RUNNER_LOG',
        payload: {
          text: stopMsg,
          stream: 'system',
          timestamp: new Date().toISOString(),
        },
      });
    }
  }

  /**
   * Fast, reliable HTTP GET check using fetch and Node.js native sockets.
   * Probes localhost and 127.0.0.1 over TCP sockets, strictly verifying HTTP 200 health status.
   *
   * @param port Target server port
   * @param pathStr Path to probe (default /health)
   * @param timeoutMs Timeout in ms (default 500ms)
   * @returns Promise<boolean> True if server returned 200 OK, false otherwise
   */
  public async httpGetCheck(port: number, pathStr = '/health', timeoutMs = 500): Promise<boolean> {
    const urls = [
      `http://localhost:${port}${pathStr}`,
      `http://127.0.0.1:${port}${pathStr}`,
    ];

    for (const url of urls) {
      try {
        if (typeof fetch === 'function') {
          const res = await fetch(url, {
            method: 'GET',
            headers: {
              'Accept': 'application/json, text/plain, */*',
            },
            signal: AbortSignal.timeout(timeoutMs),
          });
          // Strictly verify 200 OK (do not accept 404 as healthy)
          if (res.status === 200) {
            return true;
          }
        }
      } catch {
        // Fall through to low-level socket check
      }
    }

    // Low-level socket fallback
    const hosts = ['localhost', '127.0.0.1'];
    for (const host of hosts) {
      try {
        const ok = await new Promise<boolean>((resolve) => {
          const req = http.request(
            {
              host,
              port,
              path: pathStr,
              method: 'GET',
              agent: false,
              timeout: timeoutMs,
            },
            (res) => {
              const is200 = res.statusCode === 200;
              res.resume();
              resolve(is200);
            }
          );

          req.on('timeout', () => {
            req.destroy();
            resolve(false);
          });

          req.on('error', () => {
            resolve(false);
          });

          req.end();
        });

        if (ok) return true;
      } catch {
        // Continue to next candidate
      }
    }

    return false;
  }

  /**
   * Fast, resilient HTTP POST to agent runner server.
   * Supports both fetch (with automatic decompression, standard headers, and keepalive)
   * and Node native socket fallback. Tries localhost and 127.0.0.1, and discards empty-body
   * false-positives to ensure connection to the active agent process.
   *
   * @param port Target server port
   * @param pathStr Path to post to (e.g. /v1/chat/completions)
   * @param body JSON request payload
   * @param timeoutMs Request timeout in ms (default 60s)
   */
  public async httpPostJson(
    port: number,
    pathStr: string,
    body: any,
    timeoutMs = 60000
  ): Promise<{ ok: boolean; status: number; data: any; text: string }> {
    const jsonBody = JSON.stringify(body);
    const candidateUrls = [
      `http://localhost:${port}${pathStr}`,
      `http://127.0.0.1:${port}${pathStr}`,
    ];

    let lastCandidateResult: { ok: boolean; status: number; data: any; text: string } | null = null;

    // 1. Primary: Use global fetch for standardized HTTP/1.1 parsing and stream decompression
    for (const targetUrl of candidateUrls) {
      try {
        if (typeof fetch === 'function') {
          const response = await fetch(targetUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json, text/plain, */*',
              'Accept-Encoding': 'identity, gzip, deflate, br',
            },
            body: jsonBody,
            signal: AbortSignal.timeout(timeoutMs),
          });

          const resText = await response.text();
          let parsedData: any = null;
          try {
            parsedData = JSON.parse(resText);
          } catch {}

          const currentResult = {
            ok: response.ok,
            status: response.status,
            data: parsedData,
            text: resText,
          };

          // If we received non-empty text or parsed JSON data, return immediately
          if (resText && resText.trim().length > 0) {
            return currentResult;
          }

          // Keep as fallback in case all candidates return empty body
          lastCandidateResult = currentResult;
        }
      } catch {
        // Continue to next candidate URL
      }
    }

    if (lastCandidateResult && lastCandidateResult.ok) {
      return lastCandidateResult;
    }

    // 2. Secondary: Node.js native http.request socket fallback
    const hosts = ['localhost', '127.0.0.1'];
    for (const host of hosts) {
      try {
        const result = await new Promise<{ ok: boolean; status: number; data: any; text: string }>(
          (resolve, reject) => {
            const req = http.request(
              {
                host,
                port,
                path: pathStr,
                method: 'POST',
                agent: false,
                headers: {
                  'Content-Type': 'application/json',
                  'Content-Length': Buffer.byteLength(jsonBody),
                  'Accept': 'application/json, text/plain, */*',
                  'Accept-Encoding': 'identity',
                },
                timeout: timeoutMs,
              },
              (res) => {
                let resData = '';
                res.setEncoding('utf8');
                res.on('data', (chunk) => {
                  resData += chunk;
                });
                res.on('end', () => {
                  let parsed: any = null;
                  try {
                    parsed = JSON.parse(resData);
                  } catch {}
                  const isOk =
                    res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300;
                  resolve({
                    ok: isOk,
                    status: res.statusCode || 200,
                    data: parsed,
                    text: resData,
                  });
                });
              }
            );

            req.on('timeout', () => {
              req.destroy();
              reject(new Error(`HTTP request timed out after ${timeoutMs}ms`));
            });

            req.on('error', (err) => {
              reject(err);
            });

            req.write(jsonBody);
            req.end();
          }
        );

        if (result.text && result.text.trim().length > 0) {
          return result;
        }
        lastCandidateResult = result;
      } catch (err) {
        if (host === hosts[hosts.length - 1] && !lastCandidateResult) {
          throw err;
        }
      }
    }

    if (lastCandidateResult) {
      return lastCandidateResult;
    }

    throw new Error(`Failed to connect to agent server on port ${port}`);
  }

  /**
   * Fast check for an active live agent server on candidate ports.
   *
   * @param preferredPort Optional preferred port from request or configuration
   * @returns Active port number if healthy, or null
   */
  public async detectLiveRunnerPort(preferredPort?: number): Promise<number | null> {
    const candidatePorts = Array.from(
      new Set(
        [preferredPort, this.lastRunningPort, 8000, 8080].filter(
          (p): p is number => typeof p === 'number' && p > 0
        )
      )
    );

    for (const testPort of candidatePorts) {
      const isAlive = await this.httpGetCheck(testPort, '/health', 500);
      if (isAlive) {
        this.lastRunningPort = testPort;
        return testPort;
      }
    }
    return null;
  }

  /**
   * Polls the /health endpoint until the server is ready or timeout occurs.
   *
   * @param port Target port to poll
   * @param maxWaitMs Maximum milliseconds to wait
   * @returns True if server is responsive, false otherwise
   */
  public async waitForServerReady(port: number, maxWaitMs = 12000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      const isAlive = await this.httpGetCheck(port, '/health', 500);
      if (isAlive) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    return false;
  }

  /**
   * Executes test scenarios for the specified workflow document using the universal HTTP API harness.
   * Directly invokes POST /v1/chat/completions against the target runner port without auto-starting logic.
   *
   * @param options RunTestOptions specifying document, scenario IDs, port, and bridge
   * @returns Run ID string
   */
  public async runTests(options: RunTestOptions): Promise<string> {
    const { document, scenarioIds, port, bridge } = options;
    const runId = `run-${Date.now()}`;
    const startTime = Date.now();
    const targetPort = port || this.lastRunningPort || 8000;

    // 1. Extract test scenarios from Trigger nodes or test prompts
    const scenarios = this.extractScenarios(document, scenarioIds);

    await bridge.postMessage({
      type: 'EXECUTION_LOG',
      payload: {
        runId,
        timestamp: new Date().toISOString(),
        level: 'info',
        message: `Starting test execution run '${runId}' with ${scenarios.length} scenario(s) against http://127.0.0.1:${targetPort}...`,
      },
    });

    let passedCount = 0;
    let failedCount = 0;

    // 2. Execute each scenario sequentially directly via HTTP API
    for (const scenario of scenarios) {
      const scenarioStart = Date.now();

      await bridge.postMessage({
        type: 'TEST_RESULT_UPDATE',
        payload: {
          runId,
          scenarioId: scenario.id,
          status: 'running',
          durationMs: 0,
        },
      });

      await bridge.postMessage({
        type: 'EXECUTION_LOG',
        payload: {
          runId,
          scenarioId: scenario.id,
          timestamp: new Date().toISOString(),
          level: 'info',
          message: `[${scenario.name}] Executing input query: "${scenario.inputQuery}"`,
        },
      });

      try {
        const result = await this.executeScenario(document, scenario, bridge, runId, targetPort);
        const duration = Date.now() - scenarioStart;

        if (result.passed) {
          passedCount++;
          await bridge.postMessage({
            type: 'TEST_RESULT_UPDATE',
            payload: {
              runId,
              scenarioId: scenario.id,
              status: 'passed',
              durationMs: duration,
              output: result.output,
            },
          });
          await bridge.postMessage({
            type: 'EXECUTION_LOG',
            payload: {
              runId,
              scenarioId: scenario.id,
              timestamp: new Date().toISOString(),
              level: 'info',
              message: `[${scenario.name}] PASSED in ${duration}ms`,
            },
          });
        } else {
          failedCount++;
          await bridge.postMessage({
            type: 'TEST_RESULT_UPDATE',
            payload: {
              runId,
              scenarioId: scenario.id,
              status: 'failed',
              durationMs: duration,
              output: result.output,
              error: result.error,
            },
          });
          await bridge.postMessage({
            type: 'EXECUTION_LOG',
            payload: {
              runId,
              scenarioId: scenario.id,
              timestamp: new Date().toISOString(),
              level: 'error',
              message: `[${scenario.name}] FAILED: ${result.error || 'Unknown error'}`,
            },
          });
        }
      } catch (err: any) {
        failedCount++;
        const duration = Date.now() - scenarioStart;
        await bridge.postMessage({
          type: 'TEST_RESULT_UPDATE',
          payload: {
            runId,
            scenarioId: scenario.id,
            status: 'failed',
            durationMs: duration,
            output: '',
            error: err.message || 'Execution failed',
          },
        });
      }
    }

    const totalDuration = Date.now() - startTime;
    const summary = `Executed ${scenarios.length} test(s): ${passedCount} passed, ${failedCount} failed (${totalDuration}ms)`;

    await bridge.postMessage({
      type: 'EXECUTION_LOG',
      payload: {
        runId,
        timestamp: new Date().toISOString(),
        level: failedCount === 0 ? 'info' : 'warn',
        message: summary,
      },
    });

    await bridge.postMessage({
      type: 'EXECUTION_COMPLETE',
      payload: {
        runId,
        success: failedCount === 0,
        durationMs: totalDuration,
        summary,
      },
    });

    return runId;
  }

  /**
   * Executes a single test scenario against the OpenAI-compatible HTTP runner.
   * Evaluates assertions using Gemini as an LLM judge for semantic and structured output validation.
   *
   * @param document Workflow document
   * @param scenario Target test scenario
   * @param bridge Webview bridge for streaming logs
   * @param runId Active execution run ID
   * @param port Active server port
   */
  private async executeScenario(
    document: AgentWorkflowDocument,
    scenario: TriggerTestScenario,
    bridge: WebviewBridge,
    runId: string,
    port: number
  ): Promise<{ passed: boolean; output: string; error?: string }> {
    const agentNodes = (document.nodes || []).filter(
      (n) => n.type === 'agent' || (n as any).type === 'agentNode'
    );
    let modelName = (agentNodes[0]?.data as any)?.model || 'gemini-flash-latest';
    if (
      !modelName ||
      modelName.includes('2.5') ||
      modelName.includes('1.5') ||
      modelName.includes('2.0')
    ) {
      modelName = 'gemini-flash-latest';
    }

    const inputQuery = scenario.inputQuery || '';
    if (!inputQuery.trim()) {
      await bridge.postMessage({
        type: 'EXECUTION_LOG',
        payload: {
          runId,
          scenarioId: scenario.id,
          timestamp: new Date().toISOString(),
          level: 'warn',
          message: `[Test Scenario Warning]: Scenario input query is empty. The agent will receive an empty prompt.`,
        },
      });
    }

    const requestPayload = {
      model: modelName,
      messages: [{ role: 'user', content: inputQuery }],
    };

    await bridge.postMessage({
      type: 'EXECUTION_LOG',
      payload: {
        runId,
        scenarioId: scenario.id,
        timestamp: new Date().toISOString(),
        level: 'info',
        message: `[HTTP Request] POST http://127.0.0.1:${port}/v1/chat/completions\nPayload: ${JSON.stringify(requestPayload, null, 2)}`,
      },
    });

    try {
      let httpResult = await this.httpPostJson(
        port,
        '/v1/chat/completions',
        requestPayload,
        30000
      );

      // If rejected due to unsupported model, fallback to gemini-flash-latest
      if (
        !httpResult.ok &&
        httpResult.text &&
        httpResult.text.includes('Unsupported model') &&
        modelName !== 'gemini-flash-latest'
      ) {
        modelName = 'gemini-flash-latest';
        requestPayload.model = modelName;
        httpResult = await this.httpPostJson(
          port,
          '/v1/chat/completions',
          requestPayload,
          30000
        );
      }

      // Fallback 1: If 404 or empty 200, attempt with trailing slash /v1/chat/completions/
      if ((!httpResult.ok && httpResult.status === 404) || (!httpResult.text && httpResult.status === 200)) {
        try {
          const slashResult = await this.httpPostJson(
            port,
            '/v1/chat/completions/',
            requestPayload,
            15000
          );
          if (slashResult.ok && slashResult.text && slashResult.text.trim().length > 0) {
            httpResult = slashResult;
          }
        } catch {}
      }

      // Fallback 2: If still 404, attempt /conversation endpoint
      if (!httpResult.ok && httpResult.status === 404) {
        try {
          const convPayload = {
            prompt: inputQuery,
            message: inputQuery,
            messages: [{ role: 'user', content: inputQuery }],
          };
          const convResult = await this.httpPostJson(
            port,
            '/conversation',
            convPayload,
            15000
          );
          if (convResult.ok && convResult.text && convResult.text.trim().length > 0) {
            httpResult = convResult;
          }
        } catch {}
      }

      // Log full raw HTTP response
      await bridge.postMessage({
        type: 'EXECUTION_LOG',
        payload: {
          runId,
          scenarioId: scenario.id,
          timestamp: new Date().toISOString(),
          level: httpResult.ok ? 'info' : 'error',
          message: `[HTTP Raw Response (Status: ${httpResult.status}, OK: ${httpResult.ok})]:\n${httpResult.text || '(empty body)'}`,
        },
      });

      if (httpResult.ok) {
        const data = httpResult.data;
        let responseText = '';

        if (typeof data?.choices?.[0]?.message?.content === 'string') {
          responseText = data.choices[0].message.content;
        } else if (data?.choices?.[0]?.message?.content !== undefined && data?.choices?.[0]?.message?.content !== null) {
          responseText = typeof data.choices[0].message.content === 'object'
            ? JSON.stringify(data.choices[0].message.content, null, 2)
            : String(data.choices[0].message.content);
        } else if (typeof data?.choices?.[0]?.text === 'string') {
          responseText = data.choices[0].text;
        } else if (typeof data?.response === 'string') {
          responseText = data.response;
        } else if (data?.response !== undefined && data?.response !== null) {
          responseText = typeof data.response === 'object'
            ? JSON.stringify(data.response, null, 2)
            : String(data.response);
        } else if (typeof data?.content === 'string') {
          responseText = data.content;
        } else if (data?.content !== undefined && data?.content !== null) {
          responseText = typeof data.content === 'object'
            ? JSON.stringify(data.content, null, 2)
            : String(data.content);
        } else if (typeof data?.output === 'string') {
          responseText = data.output;
        } else if (data?.output !== undefined && data?.output !== null) {
          responseText = typeof data.output === 'object'
            ? JSON.stringify(data.output, null, 2)
            : String(data.output);
        } else if (typeof data?.result === 'string') {
          responseText = data.result;
        } else if (data?.result !== undefined && data?.result !== null) {
          responseText = typeof data.result === 'object'
            ? JSON.stringify(data.result, null, 2)
            : String(data.result);
        } else if (typeof data === 'string') {
          responseText = data;
        } else if (data !== undefined && data !== null) {
          responseText = JSON.stringify(data, null, 2);
        } else if (httpResult.text && httpResult.text.trim().length > 0) {
          responseText = httpResult.text;
        }

        await bridge.postMessage({
          type: 'EXECUTION_LOG',
          payload: {
            runId,
            scenarioId: scenario.id,
            timestamp: new Date().toISOString(),
            level: 'info',
            message: `[Live Agent Extracted Output]:\n${responseText || '(empty response)'}`,
          },
        });

        // Evaluate assertion using Gemini LLM Judge if expectedOutput is specified
        if (scenario.expectedOutput && scenario.expectedOutput.trim().length > 0) {
          await bridge.postMessage({
            type: 'EXECUTION_LOG',
            payload: {
              runId,
              scenarioId: scenario.id,
              timestamp: new Date().toISOString(),
              level: 'info',
              message: `[Test Evaluator] Evaluating assertion criteria via Gemini Judge: "${scenario.expectedOutput}"...`,
            },
          });

          const evalResult = await this.codeGenEngine.evaluateAssertion({
            inputQuery: inputQuery,
            expectedCriteria: scenario.expectedOutput,
            actualOutput: responseText,
            model: 'gemini-flash-latest',
          });

          await bridge.postMessage({
            type: 'EXECUTION_LOG',
            payload: {
              runId,
              scenarioId: scenario.id,
              timestamp: new Date().toISOString(),
              level: evalResult.passed ? 'info' : 'warn',
              message: `[Test Evaluator Verdict]: ${evalResult.passed ? 'PASSED' : 'FAILED'} - ${evalResult.reason}`,
            },
          });

          if (!evalResult.passed) {
            return {
              passed: false,
              output: responseText,
              error: evalResult.reason,
            };
          }
        }

        return {
          passed: true,
          output: responseText,
        };
      } else {
        const errorMsg =
          httpResult.status === 0
            ? `Agent server is offline on http://127.0.0.1:${port}. Please start the local runner in the Deployment tab.`
            : `Agent server returned HTTP ${httpResult.status}: ${httpResult.text}`;
        return {
          passed: false,
          output: httpResult.text || '',
          error: errorMsg,
        };
      }
    } catch (err: any) {
      return {
        passed: false,
        output: '',
        error: `Agent server is offline on http://127.0.0.1:${port}. Please start the local runner in the Deployment tab. (${err.message})`,
      };
    }
  }

  /**
   * Cancels an active test run if currently executing.
   *
   * @param runId Target run identifier
   */
  public cancelRun(runId: string): void {
    const childProc = this.activeProcesses.get(runId);
    if (childProc && childProc.pid && childProc.pid !== process.pid) {
      try {
        childProc.kill('SIGTERM');
      } catch {}
      this.activeProcesses.delete(runId);
    }
  }

  /**
   * Cancels all currently running test subprocesses and clears active references.
   */
  public cancelAll(): void {
    for (const [runId, child] of this.activeProcesses.entries()) {
      try {
        if (child.pid && child.pid !== process.pid) {
          child.kill('SIGKILL');
        }
      } catch {}
      this.activeProcesses.delete(runId);
    }
  }

  /**
   * Cleans up all runners, active processes, and listening ports on disposal.
   */
  public dispose(): void {
    this.stopLocalRunner();
    this.cancelAll();
  }

  /**
   * Extracts test scenarios from Trigger nodes or generates fallback scenario.
   *
   * @param document Workflow document
   * @param scenarioIds Optional subset of scenario IDs to run
   * @returns Array of TriggerTestScenario
   */
  public extractScenarios(
    document: AgentWorkflowDocument,
    scenarioIds?: string[]
  ): TriggerTestScenario[] {
    const scenarios: TriggerTestScenario[] = [];

    const triggerNodes = (document.nodes || []).filter(
      (n) => n.type === 'trigger' || (n as any).type === 'triggerNode'
    );
    for (const node of triggerNodes) {
      const data = node.data as any;
      if (data?.config?.testScenarios && Array.isArray(data.config.testScenarios) && data.config.testScenarios.length > 0) {
        for (const s of data.config.testScenarios) {
          scenarios.push({
            id: s.id,
            name: s.name || s.id,
            inputQuery: s.inputQuery || s.prompt || '',
            expectedOutput: s.expectedOutput,
          });
        }
      } else if (data?.config?.testPrompts && Array.isArray(data.config.testPrompts) && data.config.testPrompts.length > 0) {
        for (const p of data.config.testPrompts) {
          scenarios.push({
            id: p.id,
            name: p.name || p.id,
            inputQuery: p.prompt || p.inputQuery || '',
            expectedOutput: p.expectedOutput,
          });
        }
      }
    }

    if (scenarios.length === 0) {
      if (scenarioIds && scenarioIds.length > 0) {
        for (const id of scenarioIds) {
          scenarios.push({
            id,
            name: `Test Scenario ${id}`,
            inputQuery: 'Provide a concise overview and execute planned actions.',
            expectedOutput: undefined,
          });
        }
      } else {
        scenarios.push({
          id: 'default-scenario-1',
          name: 'Default Test Run',
          inputQuery: 'Provide a concise overview and execute planned actions.',
          expectedOutput: undefined,
        });
      }
    }

    if (scenarioIds && scenarioIds.length > 0) {
      const filtered = scenarios.filter((s) => scenarioIds.includes(s.id));
      if (filtered.length > 0) {
        return filtered;
      }
    }

    return scenarios;
  }
}

