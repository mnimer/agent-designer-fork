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
 * 2. User-Managed Runner Lifecycle: The local agent runner process is started and stopped
 *    by the user in the Deployment tab. The Test Runner tab monitors runner readiness via
 *    WebviewBridge and enables suite execution when online.
 * 3. Pure Decoupling: The VS Code extension host operates purely as an HTTP client during
 *    test runs, eliminating nested Python interpreters, AST manipulations, and buffer crashes.
 * 4. Multi-Framework Portability: Any agent framework (ADK, LangGraph, OpenAI Swarm, Claude MCP)
 *    that exposes /health and /v1/chat/completions is 100% compatible with the Test Runner.
 * 5. Structured Output & Smart Assertions: Evaluates test assertions against both raw text
 *    and structured JSON payloads (key-value schema matching).
 * 6. Clean Process & Port Management: OS-specific port clearing (killPort) and graceful
 *    process termination on webview disposal.
 * 7. Interactive Streaming Chat Harness: Streams turn-by-turn conversational tokens
 *    directly to the Webview over RPC with session history retention and SSE/JSON fallback.
 * 8. Model Selection & Global Region Mandate: Gemini 1.x and 2.x models (including gemini-2.5-flash) are deprecated.
 *     gemini-3.7-flash is the primary model for Vertex AI, but requires the global region (location='global' or
 *     GOOGLE_CLOUD_LOCATION='global'). Regional endpoints return 404 NOT_FOUND for gemini-3.7-flash publisher models.
 * 9. Async Execution Lifecycle in Ephemeral Runner: Uses a single unified asyncio event loop with `runner.run_async`
 *     rather than nested `asyncio.run()` calls to ensure background connection pools (like `httpx` in A2A agents)
 *     are not bound to closed event loops.
 * 10. Robust Error Reporting in Adapter: Formats exceptions with traceback and class names in the ephemeral HTTP runner
 *     to prevent single-token AttributeError or Pydantic ValidationError masking.
 * 11. Turn Session Isolation: Every test prompt is executed with a unique sessionId
 *     (session_id, thread_id, and X-Session-ID header) to guarantee complete state isolation
 *     across sequential test executions.
 * 12. In-Flight Request Cancellation: Tracks activeAbortControllers per runId, enabling instantaneous
 *     cancellation of active HTTP scenario requests upon user cancellation.
 * 13. Tool Call & Trace Step Extraction: Inspects completion responses for tool_calls and reasoning
 *     traces, streaming animated agent execution steps with latency breakdowns to the webview.
 * 14. ADK Built-in Tools Import Compatibility Shims: Injects sys.modules aliases in _agent_test_runner.py
 *     to handle LLM-generated import variations (e.g. 'google.adk.tools.google_search' -> 'google.adk.tools.google_search_tool')
 *     so agents run reliably without ModuleNotFoundError.
 * 15. ADK App Extra Parameter Sanitization: Shims App.__init__ to filter out extra forbidden
 *     keyword arguments (such as 'description') so Pydantic extra='forbid' doesn't crash local runs.
 * 14. Robust Local Adapter Event Streaming & Traceback Logging: Provides _extract_text_from_event()
 *     with defensive checks against None content, empty part arrays, and transfer tool events. Employs
 *     AdkApp.async_stream_query() to prevent deprecation warnings and prints full stack traces on test adapter
 *     exceptions to stderr for immediate diagnostic visibility in the runner console.
 * 15. Clean SSE Stream Termination & Telemetry Silencing in Local Runner: Breaks client read loop immediately
 *     upon receiving 'data: [DONE]' or finish_reason 'stop' to prevent indefinite hangs in reader.read(), sends
 *     'Connection: close' and close_connection=True in _agent_test_runner.py, and sets OTEL_SDK_DISABLED='true' to
 *     silence remote telemetry export 400 Bad Request spam in local environments.
>>>>>>> origin/develop
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
import { AgentEngineDeployer } from './AgentEngineDeployer';

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
  bridge: WebviewBridge;
}

export class AgentRunnerManager {
  private activeProcesses: Map<string, ChildProcess> = new Map();
  private activeLocalRunners: Map<string, ChildProcess> = new Map();
  private ephemeralFiles: Set<string> = new Set();
  private lastRunningPort: number = 8000;
  private runnerLogs: string[] = [];
  private runnerStatus: 'idle' | 'starting' | 'running' | 'stopped' | 'error' = 'idle';
  private activeAbortControllers: Map<string, AbortController> = new Map();
  private pythonResolver: PythonEnvResolver;
  private codeGenEngine: GeminiCodeGenEngine;
  private chatSessions: Map<string, Array<{ role: 'user' | 'assistant'; content: string }>> = new Map();
  private agentEngineDeployer?: AgentEngineDeployer;

  /**
   * Resolves or dynamically generates the test server entry point script.
   * Supports:
   * 1. FastAPI server.py (Cloud Run)
   * 2. Reasoning Engine / Agent class agent.py (Vertex AI Agent Engine / ADK / Library)
   * 3. CLI main.py
   *
   * If agent.py exists without server.py, generates an ephemeral _agent_test_runner.py
   * that wraps the agent and exposes standard HTTP endpoints (/health and /v1/chat/completions)
   * for live testing and assertion execution.
   *
   * @param targetDir Target workspace directory
   * @returns Path to runner script or null if no runnable code found
   */
  public resolveRunnerScript(targetDir: string): string | null {
    const serverPy = path.join(targetDir, 'server.py');
    if (fs.existsSync(serverPy)) {
      return serverPy;
    }

    const agentPy = path.join(targetDir, 'agent.py');
    const mainPy = path.join(targetDir, 'main.py');

    if (fs.existsSync(agentPy)) {
      const runnerScript = path.join(targetDir, '_agent_test_runner.py');
      const scriptContent = `import sys
import os
import json
from http.server import HTTPServer, BaseHTTPRequestHandler

# Disable OpenTelemetry exporter loops during local testing to avoid 400 Bad Request export spam
os.environ.setdefault("OTEL_SDK_DISABLED", "true")

# Add current directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Disable OpenTelemetry remote export in local test runner
# Google Cloud telemetry requires deployed Agent Engine / Cloud Run and returns 400 Bad Request locally
os.environ.setdefault("OTEL_SDK_DISABLED", "true")

# Load environment variables (.env) if python-dotenv is installed
try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

# Shim common import discrepancies from LLM code generation for Google ADK built-in tools
try:
    import google.adk.tools.google_search_tool
    sys.modules.setdefault('google.adk.tools.google_search', google.adk.tools.google_search_tool)
except Exception:
    pass
try:
    import google.adk.tools.vertex_ai_search_tool
    sys.modules.setdefault('google.adk.tools.vertex_ai_search', google.adk.tools.vertex_ai_search_tool)
except Exception:
    pass

# Shim google.adk.apps.App.__init__ to filter out extra forbidden keyword arguments (such as description)
try:
    from google.adk.apps import App as _AdkApp
    _orig_app_init = _AdkApp.__init__
    def _safe_app_init(self, *args, **kwargs):
        allowed_fields = {'name', 'root_agent', 'root_node', 'plugins', 'events_compaction_config', 'context_cache_config', 'resumability_config'}
        filtered_kwargs = {k: v for k, v in kwargs.items() if k in allowed_fields}
        _orig_app_init(self, *args, **filtered_kwargs)
    _AdkApp.__init__ = _safe_app_init
except Exception:
    pass

agent_instance = None

def get_agent():
    global agent_instance
    if agent_instance is not None:
        return agent_instance
    try:
        # 1. First inspect agent_runtime_app if present
        try:
            import agent_runtime_app
            if hasattr(agent_runtime_app, 'agent_runtime'):
                inst = getattr(agent_runtime_app, 'agent_runtime')
                if hasattr(inst, 'set_up') and callable(getattr(inst, 'set_up')):
                    try:
                        inst.set_up()
                    except Exception:
                        pass
                agent_instance = inst
                return agent_instance
        except Exception:
            pass

        # 2. Inspect agent.py for root_agent / pipeline instances
        import agent
        for var_name in ['root_agent', 'agent_runtime', 'app', 'workflow', 'pipeline', 'agent_instance', 'agent']:
            if hasattr(agent, var_name):
                val = getattr(agent, var_name)
                # Verify it is an instance, NOT an uninstantiated class or module
                if not isinstance(val, type) and not isinstance(val, type(sys)):
                    if hasattr(val, 'set_up') and callable(getattr(val, 'set_up')):
                        try:
                            val.set_up()
                        except Exception:
                            pass
                    agent_instance = val
                    return agent_instance

        # 3. Check for standalone ReasoningEngine classes that accept default constructor
        for attr_name in ['AgentReasoningEngine', 'ReasoningEngine', 'AgentWorkflow', 'RootAgent', 'Workflow']:
            if hasattr(agent, attr_name):
                cls = getattr(agent, attr_name)
                if isinstance(cls, type):
                    try:
                        inst = cls()
                        if hasattr(inst, 'set_up') and callable(getattr(inst, 'set_up')):
                            inst.set_up()
                        agent_instance = inst
                        return agent_instance
                    except Exception:
                        pass

        if hasattr(agent, 'query') and callable(getattr(agent, 'query')):
            agent_instance = agent
            return agent_instance
    except Exception as e:
        sys.stderr.write(f"[Agent Test Adapter Error] {e}\\n")
        sys.stderr.flush()
        raise e
    return None

class TestHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        sys.stdout.write(f"[Test Server] {format % args}\\n")
        sys.stdout.flush()

    def do_GET(self):
        if self.path in ('/health', '/', '/healthz'):
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"status":"ok"}')
        elif self.path == '/v1/models':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"data":[{"id":"gemini-flash-latest"}]}')
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode('utf-8')
        try:
            data = json.loads(body) if body else {}
        except Exception:
            data = {}

        prompt = ""
        messages = data.get('messages', [])
        if messages and isinstance(messages, list):
            for m in reversed(messages):
                if isinstance(m, dict) and m.get('role') == 'user':
                    prompt = m.get('content', '')
                    break
        if not prompt:
            prompt = data.get('prompt', '') or data.get('input', '') or data.get('query', '') or body

        try:
            ag = get_agent()
            if ag is None:
                raise RuntimeError("Could not find agent instance in agent.py or agent_runtime_app.py")

            res = None

            def _extract_text_from_event(evt):
                if isinstance(evt, dict):
                    content = evt.get('content') or {}
                    parts = content.get('parts') or []
                    texts = []
                    for p in parts:
                        if isinstance(p, dict) and p.get('text'):
                            texts.append(p['text'])
                    return "".join(texts)
                elif hasattr(evt, 'content') and evt.content:
                    parts = getattr(evt.content, 'parts', []) or []
                    texts = []
                    for p in parts:
                        if hasattr(p, 'text') and p.text:
                            texts.append(p.text)
                    return "".join(texts)
                elif hasattr(evt, 'text') and evt.text:
                    return evt.text
                elif isinstance(evt, str):
                    return evt
                return ""

            # 1. AdkApp async_stream_query / stream_query support
            if hasattr(ag, 'async_stream_query') and callable(getattr(ag, 'async_stream_query')):
                try:
                    import asyncio
                    accum = []
                    async def _run_async_stream():
                        async for evt in ag.async_stream_query(message=prompt, user_id="test_user"):
                            txt = _extract_text_from_event(evt)
                            if txt:
                                accum.append(txt)
                    asyncio.run(_run_async_stream())
                    if accum:
                        res = "".join(accum)
                except Exception as stream_err:
                    sys.stderr.write(f"[AdkApp async_stream_query Fallback] {stream_err}\\n")
                    sys.stderr.flush()

            if res is None and hasattr(ag, 'stream_query') and callable(getattr(ag, 'stream_query')):
                try:
                    accum = []
                    for evt in ag.stream_query(message=prompt, user_id="test_user"):
                        txt = _extract_text_from_event(evt)
                        if txt:
                            accum.append(txt)
                    if accum:
                        res = "".join(accum)
                except Exception as stream_err:
                    sys.stderr.write(f"[AdkApp stream_query Fallback] {stream_err}\\n")
                    sys.stderr.flush()

            # 2. ADK Runner execution
            if res is None:
                try:
                    import asyncio
                    from google.adk.runners import Runner
                    from google.adk.sessions import InMemorySessionService
                    from google.genai import types
                    from google.adk.apps import App

                    async def _run_adk_runner():
                        session_service = InMemorySessionService()
                        session = await session_service.create_session(app_name="vad_app", user_id="test_user")
                        if isinstance(ag, App):
                            runner = Runner(app=ag, session_service=session_service)
                        elif hasattr(ag, 'root_agent') and isinstance(getattr(ag, 'root_agent'), App):
                            runner = Runner(app=getattr(ag, 'root_agent'), session_service=session_service)
                        else:
                            runner = Runner(agent=ag, app_name="vad_app", session_service=session_service)

                        final_texts = []
                        accum_texts = []
                        error_messages = []
                        async for evt in runner.run_async(
                            user_id="test_user",
                            session_id=session.id,
                            new_message=types.Content(role="user", parts=[types.Part.from_text(text=prompt)])
                        ):
                            if hasattr(evt, 'error_message') and evt.error_message:
                                error_messages.append(str(evt.error_message))

                            is_final = False
                            if hasattr(evt, 'is_final_response') and callable(getattr(evt, 'is_final_response')):
                                is_final = evt.is_final_response()

                            txt = _extract_text_from_event(evt)
                            if txt:
                                if is_final:
                                    final_texts.append(txt)
                                else:
                                    accum_texts.append(txt)

                        if final_texts:
                            return "".join(final_texts)
                        if accum_texts:
                            return "".join(accum_texts)
                        if error_messages:
                            raise RuntimeError("; ".join(error_messages))
                        return None

                    res = asyncio.run(_run_adk_runner())
                except Exception as runner_err:
                    sys.stderr.write(f"[ADK Runner Fallback] {runner_err}\\n")
                    sys.stderr.flush()

            # 3. Standard fallback invocation methods
            if res is None:
                if hasattr(ag, 'query') and callable(getattr(ag, 'query')):
                    res = ag.query(prompt=prompt)
                elif hasattr(ag, 'generate') and callable(getattr(ag, 'generate')):
                    res = ag.generate(prompt=prompt)
                elif hasattr(ag, 'invoke') and callable(getattr(ag, 'invoke')):
                    res = ag.invoke({"messages": [{"role": "user", "content": prompt}]})
                elif hasattr(ag, 'run') and callable(getattr(ag, 'run')):
                    res = ag.run(prompt)
                elif callable(ag):
                    res = ag(prompt)
                else:
                    raise RuntimeError("Agent instance has no query, generate, invoke, or run method")

            if res is None:
                raise RuntimeError("Agent returned no response. Ensure your model and prompt instructions are valid.")

            if isinstance(res, dict):
                content_str = json.dumps(res)
            else:
                content_str = str(res)

            if data.get('stream'):
                self.send_response(200)
                self.send_header('Content-Type', 'text/event-stream')
                self.send_header('Cache-Control', 'no-cache')
                self.send_header('Connection', 'close')
                self.end_headers()
                chunks = content_str.split(' ')
                for i, c in enumerate(chunks):
                    token = c + (' ' if i < len(chunks) - 1 else '')
                    is_last = (i == len(chunks) - 1)
                    chunk_obj = {
                        "id": "chatcmpl-test",
                        "object": "chat.completion.chunk",
                        "created": 1234567890,
                        "model": data.get("model", "gemini-flash"),
                        "choices": [{"index": 0, "delta": {"content": token}, "finish_reason": "stop" if is_last else None}]
                    }
                    self.wfile.write(f"data: {json.dumps(chunk_obj)}\\n\\n".encode('utf-8'))
                    self.wfile.flush()
                self.wfile.write(b"data: [DONE]\\n\\n")
                self.wfile.flush()
                self.close_connection = True
                return

            resp_payload = {
                "id": "chatcmpl-test",
                "object": "chat.completion",
                "created": 1234567890,
                "model": data.get("model", "gemini-flash"),
                "choices": [
                    {
                        "index": 0,
                        "message": {
                            "role": "assistant",
                            "content": content_str
                        },
                        "finish_reason": "stop"
                    }
                ]
            }
            resp_bytes = json.dumps(resp_payload).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(resp_bytes)))
            self.end_headers()
            self.wfile.write(resp_bytes)
        except Exception as err:
            import traceback
            tb = traceback.format_exc()
            sys.stderr.write(f"[Agent Test Adapter Error] {err}\\n{tb}\\n")
            sys.stderr.flush()
            err_type = type(err).__name__
            err_str = str(err)
            err_msg = err_type + ": " + err_str if err_str else err_type
            err_payload = {
                "error": {
                    "message": err_msg,
                    "type": "agent_execution_error"
                }
            }
            err_bytes = json.dumps(err_payload).encode('utf-8')
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(err_bytes)))
            self.end_headers()
            self.wfile.write(err_bytes)

def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8000)
    args = parser.parse_args()
    port = int(os.environ.get('PORT', args.port))
    server = HTTPServer(('0.0.0.0', port), TestHandler)
    print(f"Uvicorn running on http://0.0.0.0:{port} (Agent Test Adapter)", flush=True)
    server.serve_forever()

if __name__ == '__main__':
    main()
`;
      try {
        fs.writeFileSync(runnerScript, scriptContent, 'utf-8');
        this.ephemeralFiles.add(runnerScript);
      } catch {}
      return runnerScript;
    }

    if (fs.existsSync(mainPy)) {
      return mainPy;
    }

    return null;
  }

  /**
   * Cleans up all generated ephemeral test adapter files.
   */
  private cleanupEphemeralFiles(): void {
    for (const filePath of this.ephemeralFiles) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch {}
    }
    this.ephemeralFiles.clear();
  }

  /**
   * Constructs the AgentRunnerManager.
   *
   * @param extensionPath Extension root path for template resolution
   * @param workspaceRoot Optional workspace root path
   * @param agentEngineDeployer Optional AgentEngineDeployer for remote execution testing
   */
  constructor(
    extensionPath: string,
    workspaceRoot?: string,
    agentEngineDeployer?: AgentEngineDeployer
  ) {
    this.pythonResolver = new PythonEnvResolver(workspaceRoot);
    this.codeGenEngine = new GeminiCodeGenEngine(extensionPath);
    this.agentEngineDeployer = agentEngineDeployer;
  }

  /**
   * Sets the AgentEngineDeployer reference for remote agent testing.
   *
   * @param deployer AgentEngineDeployer instance
   */
  public setAgentEngineDeployer(deployer: AgentEngineDeployer): void {
    this.agentEngineDeployer = deployer;
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
   * Returns active local runner sessions with their IDs, process IDs, ports, and lifecycle states.
   *
   * @returns Array of active runner descriptors
   */
  public getActiveRunners(): Array<{ id: string; pid?: number; port?: number; status: string }> {
    const runners: Array<{ id: string; pid?: number; port?: number; status: string }> = [];
    for (const [id, proc] of this.activeLocalRunners.entries()) {
      runners.push({
        id,
        pid: proc.pid,
        port: this.lastRunningPort,
        status: this.runnerStatus,
      });
    }
    return runners;
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
      OTEL_SDK_DISABLED: 'true',
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

    // Locate entrypoint server script (server.py, agent.py adapter, or main.py)
    const runnerScriptPath = this.resolveRunnerScript(targetDir);

    if (!runnerScriptPath) {
      this.runnerStatus = 'error';
      const notFoundMsg = `[Local Runner Error] No runnable agent script (server.py, agent.py, or main.py) found in ${targetDir}. Please generate code first.`;
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

    this.cleanupEphemeralFiles();

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
   * @param externalSignal Optional abort signal to cancel in-flight requests immediately
   * @param extraHeaders Optional custom headers (e.g. turn session IDs)
   * @returns Promise resolving to response status, parsed JSON data, and raw text
   * @author Mike Nimer <mikenimer@google.com>
   */
  public async httpPostJson(
    port: number,
    pathStr: string,
    body: any,
    timeoutMs = 60000,
    externalSignal?: AbortSignal,
    extraHeaders?: Record<string, string>
  ): Promise<{ ok: boolean; status: number; data: any; text: string }> {
    const jsonBody = JSON.stringify(body);
    const candidateUrls = [
      `http://localhost:${port}${pathStr}`,
      `http://127.0.0.1:${port}${pathStr}`,
    ];

    let lastCandidateResult: { ok: boolean; status: number; data: any; text: string } | null = null;

    // NOTE: Check if external abort signal was already triggered before starting
    if (externalSignal?.aborted) {
      throw new Error('HTTP request was aborted by user.');
    }

    // 1. Primary: Use global fetch for standardized HTTP/1.1 parsing and stream decompression
    for (const targetUrl of candidateUrls) {
      try {
        if (typeof fetch === 'function') {
          // Combine timeout signal with external cancellation signal if available
          const timeoutSignal = AbortSignal.timeout(timeoutMs);
          const activeSignal =
            typeof (AbortSignal as any).any === 'function' && externalSignal
              ? (AbortSignal as any).any([timeoutSignal, externalSignal])
              : (externalSignal || timeoutSignal);

          const response = await fetch(targetUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json, text/plain, */*',
              'Accept-Encoding': 'identity, gzip, deflate, br',
              ...(extraHeaders || {}),
            },
            body: jsonBody,
            signal: activeSignal,
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
      } catch (err: any) {
        // If aborted by user, rethrow immediately to prevent unnecessary retries
        if (externalSignal?.aborted || err?.name === 'AbortError') {
          throw new Error('HTTP request was aborted by user.');
        }
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
                  ...(extraHeaders || {}),
                },
                timeout: timeoutMs,
              },
              (res) => {
                res.on('error', (resErr) => {
                  reject(resErr);
                });
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

            // Wire external abort signal to socket destruction
            if (externalSignal) {
              const onAbort = () => {
                req.destroy();
                reject(new Error('HTTP request was aborted by user.'));
              };
              if (externalSignal.aborted) {
                onAbort();
                return;
              }
              externalSignal.addEventListener('abort', onAbort, { once: true });
            }

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
   * Tracks in-flight AbortController so runs can be immediately cancelled upon user request.
   *
   * @param options RunTestOptions specifying document, scenario IDs, port, and bridge
   * @returns Run ID string
   * @author Mike Nimer <mikenimer@google.com>
   */
  public async runTests(options: RunTestOptions): Promise<string> {
    const { document, scenarioIds, port, bridge, executionTarget = 'local', deployedResourceId } = options;
    const runId = `run-${Date.now()}`;
    const startTime = Date.now();
    const targetPort = port || this.lastRunningPort || 8000;

    // NOTE: Register in-flight AbortController for instantaneous cancellation
    const abortController = new AbortController();
    this.activeAbortControllers.set(runId, abortController);

    // 1. Extract test scenarios from Trigger nodes or test prompts
    const scenarios = this.extractScenarios(document, scenarioIds);

    const activeResourceId =
      deployedResourceId ||
      (document as any)?.deployment?.deployedResourceId;

    const targetDescription =
      executionTarget === 'remote'
        ? `Remote Reasoning Engine (${activeResourceId || 'deployed instance'})`
        : `http://127.0.0.1:${targetPort}`;

    await bridge.postMessage({
      type: 'EXECUTION_LOG',
      payload: {
        runId,
        timestamp: new Date().toISOString(),
        level: 'info',
        message: `Starting test execution run '${runId}' with ${scenarios.length} scenario(s) against ${targetDescription}...`,
      },
    });

    let passedCount = 0;
    let failedCount = 0;

    try {
      // 2. Execute each scenario sequentially directly via HTTP API or remote Reasoning Engine
      for (const scenario of scenarios) {
        // NOTE: Check if user cancelled run before initiating next scenario
        if (abortController.signal.aborted) {
          await bridge.postMessage({
            type: 'EXECUTION_LOG',
            payload: {
              runId,
              scenarioId: scenario.id,
              timestamp: new Date().toISOString(),
              level: 'warn',
              message: `[${scenario.name}] Execution skipped due to user cancellation.`,
            },
          });
          break;
        }

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
          const result = await this.executeScenario(
            document,
            scenario,
            bridge,
            runId,
            targetPort,
            executionTarget,
            activeResourceId,
            options.targetDirectory,
            abortController.signal
          );
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
    } finally {
      // NOTE: Always clean up active AbortController on completion
      this.activeAbortControllers.delete(runId);
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
   * Formats an error into a human-readable diagnostic string, unpacking inner errors
   * for Node.js `AggregateError` instances (such as network or connect failures).
   *
   * @param err Error or exception value
   * @returns Formatted error string
   * @author Mike Nimer <mikenimer@google.com>
   */
  public formatErrorMessage(err: any): string {
    if (!err) return 'Unknown error';
    if (Array.isArray(err.errors) && err.errors.length > 0) {
      const details = err.errors.map((e: any) => e?.message || String(e)).filter(Boolean).join('; ');
      return err.message && err.message.trim().length > 0 ? `${err.message}: ${details}` : details;
    }
    return err.message || String(err);
  }

  /**
   * Executes a single test scenario against either the OpenAI-compatible HTTP runner or the deployed remote Reasoning Engine.
   * Evaluates assertions using Gemini as an LLM judge for semantic and structured output validation.
   *
   * @param document Workflow document
   * @param scenario Target test scenario
   * @param bridge Webview bridge for streaming logs
   * @param runId Active execution run ID
   * @param port Active server port
   * @param executionTarget 'local' or 'remote'
   * @param deployedResourceId Remote Reasoning Engine ID
   * @param targetDirectory Local workspace target directory
   * @param abortSignal Optional AbortSignal for user-initiated cancellation
   * @author Mike Nimer <mikenimer@google.com>
   */
  private async executeScenario(
    document: AgentWorkflowDocument,
    scenario: TriggerTestScenario,
    bridge: WebviewBridge,
    runId: string,
    port: number,
    executionTarget: 'local' | 'remote' = 'local',
    deployedResourceId?: string,
    targetDirectory?: string,
    abortSignal?: AbortSignal
  ): Promise<{ passed: boolean; output: string; error?: string; durationMs?: number }> {
    // NOTE: Check if user cancelled run before initiating scenario
    if (abortSignal?.aborted) {
      return {
        passed: false,
        output: '',
        error: 'Execution cancelled by user.',
      };
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

    // Branch 1: Remote Reasoning Engine execution
    if (executionTarget === 'remote') {
      await bridge.postMessage({
        type: 'EXECUTION_LOG',
        payload: {
          runId,
          scenarioId: scenario.id,
          timestamp: new Date().toISOString(),
          level: 'info',
          message: `[Remote Execution] Invoking Reasoning Engine: ${deployedResourceId || 'active instance'}...\nInput: "${inputQuery}"`,
        },
      });

      let responseText = '';
      const remoteStartTime = Date.now();
      try {
        if (!this.agentEngineDeployer) {
          throw new Error('Agent Engine deployer is not configured for remote test execution.');
        }

        // Sanitize serviceUrl: do not pass localhost / 127.0.0.1 URLs when executing remotely
        const rawServiceUrl = (document as any)?.deployment?.serviceUrl;
        const sanitizedServiceUrl =
          rawServiceUrl && !rawServiceUrl.includes('localhost') && !rawServiceUrl.includes('127.0.0.1')
            ? rawServiceUrl
            : undefined;

        const remoteResult = await this.agentEngineDeployer.testRemoteAgentRuntime({
          targetDirectory: targetDirectory || (document as any)?._targetDirectory || '',
          remoteRuntimeId: deployedResourceId || (document as any)?.deployment?.deployedResourceId,
          serviceUrl: sanitizedServiceUrl,
          query: inputQuery,
          bridge,
          abortSignal,
        });

        if (!remoteResult.success || !remoteResult.response) {
          throw new Error(remoteResult.error || 'Remote agent returned an empty response.');
        }

        responseText = remoteResult.response;
      } catch (err: any) {
        const errMsg = this.formatErrorMessage(err);
        await bridge.postMessage({
          type: 'EXECUTION_LOG',
          payload: {
            runId,
            scenarioId: scenario.id,
            timestamp: new Date().toISOString(),
            level: 'error',
            message: `[Remote Execution Error]: ${errMsg}`,
          },
        });
        return {
          passed: false,
          output: '',
          error: errMsg,
        };
      }
      const remoteLatencyMs = Date.now() - remoteStartTime;

      await bridge.postMessage({
        type: 'EXECUTION_LOG',
        payload: {
          runId,
          scenarioId: scenario.id,
          timestamp: new Date().toISOString(),
          level: 'info',
          message: `[Remote Agent Response]:\n${responseText}`,
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

        const evalStartTime = Date.now();
        const evalResult = await this.codeGenEngine.evaluateAssertion({
          inputQuery: inputQuery,
          expectedCriteria: scenario.expectedOutput,
          actualOutput: responseText,
          model: 'gemini-3.7-flash',
        });
        const evalLatencyMs = Date.now() - evalStartTime;

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

        await bridge.postMessage({
          type: 'EXECUTION_LOG',
          payload: {
            runId,
            scenarioId: scenario.id,
            timestamp: new Date().toISOString(),
            level: 'info',
            message: `[Latency Metrics] Remote invocation: ${remoteLatencyMs}ms, Assertion evaluation: ${evalLatencyMs}ms (Total: ${remoteLatencyMs + evalLatencyMs}ms)`,
          },
        });

        return {
          passed: evalResult.passed,
          output: responseText,
          error: evalResult.passed ? undefined : evalResult.reason,
          durationMs: remoteLatencyMs + evalLatencyMs,
        };
      }

      return {
        passed: true,
        output: responseText,
        durationMs: remoteLatencyMs,
      };
    }

    // Branch 2: Local HTTP server execution
    const agentNodes = (document.nodes || []).filter(
      (n) => n.type === 'agent' || (n as any).type === 'agentNode'
    );
    let modelName = (agentNodes[0]?.data as any)?.model || 'gemini-3.7-flash';
    if (
      !modelName ||
      modelName.includes('2.5') ||
      modelName.includes('1.5') ||
      modelName.includes('2.0')
    ) {
      modelName = 'gemini-3.7-flash';
    }

    // NOTE: Generate fresh unique session ID for complete turn session isolation
    // across sequential test executions and conversational agents.
    const sessionId = `test-session-${scenario.id}-${Date.now()}`;
    const sessionHeaders: Record<string, string> = {
      'X-Session-ID': sessionId,
      'X-Thread-ID': sessionId,
    };

    const requestPayload: any = {
      model: modelName,
      messages: [{ role: 'user', content: inputQuery }],
      session_id: sessionId,
      thread_id: sessionId,
      user_id: 'test-runner',
    };

    await bridge.postMessage({
      type: 'EXECUTION_LOG',
      payload: {
        runId,
        scenarioId: scenario.id,
        timestamp: new Date().toISOString(),
        level: 'info',
        message: `[Turn Session Isolated] Initialized fresh test session: ${sessionId}`,
      },
    });

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
      const networkStartTime = Date.now();
      let httpResult = await this.httpPostJson(
        port,
        '/v1/chat/completions',
        requestPayload,
        30000,
        abortSignal,
        sessionHeaders
      );
      let networkLatencyMs = Date.now() - networkStartTime;

      // If rejected due to unsupported model, fallback to gemini-flash-latest
      if (
        !httpResult.ok &&
        httpResult.text &&
        httpResult.text.includes('Unsupported model') &&
        modelName !== 'gemini-flash-latest'
      ) {
        modelName = 'gemini-flash-latest';
        requestPayload.model = modelName;
        const retryStart = Date.now();
        httpResult = await this.httpPostJson(
          port,
          '/v1/chat/completions',
          requestPayload,
          30000,
          abortSignal,
          sessionHeaders
        );
        networkLatencyMs += Date.now() - retryStart;
      }

      // Fallback 1: If 404 or empty 200, attempt with trailing slash /v1/chat/completions/
      if ((!httpResult.ok && httpResult.status === 404) || (!httpResult.text && httpResult.status === 200)) {
        try {
          const slashResult = await this.httpPostJson(
            port,
            '/v1/chat/completions/',
            requestPayload,
            15000,
            abortSignal,
            sessionHeaders
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
            session_id: sessionId,
            thread_id: sessionId,
          };
          const convResult = await this.httpPostJson(
            port,
            '/conversation',
            convPayload,
            15000,
            abortSignal,
            sessionHeaders
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

        // NOTE: Extract tool calls or reasoning traces to populate animated trace accordion in TestRunnerTab
        const choices = data?.choices;
        const messageObj = choices?.[0]?.message;
        const toolCalls = messageObj?.tool_calls;
        const defaultAgentLabel = (agentNodes[0]?.data as any)?.label || agentNodes[0]?.id || 'Agent';

        if (Array.isArray(toolCalls) && toolCalls.length > 0) {
          for (const tc of toolCalls) {
            const fnName = tc.function?.name || tc.name || 'tool';
            const fnArgs = tc.function?.arguments || tc.arguments || '';
            await bridge.postMessage({
              type: 'EXECUTION_LOG',
              payload: {
                runId,
                scenarioId: scenario.id,
                timestamp: new Date().toISOString(),
                level: 'info',
                message: `[Tool Call] ${fnName}(${typeof fnArgs === 'object' ? JSON.stringify(fnArgs) : fnArgs})`,
                agentId: defaultAgentLabel,
                stepId: tc.id || `step-${Date.now()}`,
              },
            });
          }
        }

        if (messageObj?.reasoning_content) {
          await bridge.postMessage({
            type: 'EXECUTION_LOG',
            payload: {
              runId,
              scenarioId: scenario.id,
              timestamp: new Date().toISOString(),
              level: 'info',
              message: `[Reasoning Step] ${messageObj.reasoning_content}`,
              agentId: defaultAgentLabel,
            },
          });
        }

        if (Array.isArray(data?.traces)) {
          for (const tr of data.traces) {
            const traceMsg = typeof tr === 'string' ? tr : tr.message || JSON.stringify(tr);
            await bridge.postMessage({
              type: 'EXECUTION_LOG',
              payload: {
                runId,
                scenarioId: scenario.id,
                timestamp: new Date().toISOString(),
                level: 'info',
                message: `[Agent Trace] ${traceMsg}`,
                agentId: tr.agentId || defaultAgentLabel,
                stepId: tr.stepId,
              },
            });
          }
        }

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
        let evalLatencyMs = 0;
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

          const evalStartTime = Date.now();
          const evalResult = await this.codeGenEngine.evaluateAssertion({
            inputQuery: inputQuery,
            expectedCriteria: scenario.expectedOutput,
            actualOutput: responseText,
            model: 'gemini-flash-latest',
          });
          evalLatencyMs = Date.now() - evalStartTime;

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

          await bridge.postMessage({
            type: 'EXECUTION_LOG',
            payload: {
              runId,
              scenarioId: scenario.id,
              timestamp: new Date().toISOString(),
              level: 'info',
              message: `[Latency Metrics] Agent response: ${networkLatencyMs}ms, Assertion evaluation: ${evalLatencyMs}ms (Total: ${networkLatencyMs + evalLatencyMs}ms)`,
            },
          });

          if (!evalResult.passed) {
            return {
              passed: false,
              output: responseText,
              error: evalResult.reason,
              durationMs: networkLatencyMs + evalLatencyMs,
            };
          }
        } else {
          await bridge.postMessage({
            type: 'EXECUTION_LOG',
            payload: {
              runId,
              scenarioId: scenario.id,
              timestamp: new Date().toISOString(),
              level: 'info',
              message: `[Latency Metrics] Agent response: ${networkLatencyMs}ms`,
            },
          });
        }

        return {
          passed: true,
          output: responseText,
          durationMs: networkLatencyMs + evalLatencyMs,
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
          durationMs: networkLatencyMs,
        };
      }
    } catch (err: any) {
      if (abortSignal?.aborted || err.message?.includes('aborted')) {
        return {
          passed: false,
          output: '',
          error: 'Execution cancelled by user.',
        };
      }
      return {
        passed: false,
        output: '',
        error: `Agent server is offline on http://127.0.0.1:${port}. Please start the local runner in the Deployment tab. (${err.message})`,
      };
    }
  }

  /**
   * Sends an interactive conversational turn to the agent runtime and streams tokens
   * back to the Webview over the WebviewBridge in real time.
   *
   * Flow:
   * 1. Resolves session turn history and appends the user prompt.
   * 2. Detects or auto-starts the local server runner on localhost if offline.
   * 3. Dispatches HTTP POST to /v1/chat/completions with stream=true.
   * 4. Consumes SSE chunks or JSON payloads and posts CHAT_STREAM_CHUNK to Webview.
   * 5. Saves assistant response to session history and signals turn completion.
   *
   * @param options Execution parameters for the chat turn
   */
  public async sendChatMessage(options: SendChatMessageOptions): Promise<void> {
    const { sessionId, message, bridge, document, targetDirectory } = options;
    const streaming = options.streaming !== false;

    // NOTE: Maintain in-memory turn history for the active session
    let history = this.chatSessions.get(sessionId) || [];
    if (options.history && options.history.length > 0) {
      history = [...options.history];
    }
    history.push({ role: 'user', content: message });
    this.chatSessions.set(sessionId, history);

    // NOTE: Step 1 - Check if local runner is active or attempt auto-start
    let port = options.port || (await this.detectLiveRunnerPort());
    if (!port && targetDirectory) {
      try {
        await bridge.postMessage({
          type: 'LOCAL_RUNNER_LOG',
          payload: {
            text: `[Chat Runner] Local server offline. Starting agent runner on port 8000...`,
            stream: 'system',
            timestamp: new Date().toISOString(),
          },
        });
        await this.startLocalRunner({
          document,
          targetDirectory,
          port: 8000,
          bridge,
        });
        const ready = await this.waitForServerReady(8000, 12000);
        if (ready) {
          port = 8000;
        }
      } catch (err: any) {
        // NOTE: Continue and allow error reporting below if port remains unresolved
      }
    }

    if (!port) {
      await bridge.postMessage({
        type: 'CHAT_STREAM_CHUNK',
        payload: {
          sessionId,
          chunk: '',
          done: true,
          error: 'Agent server is offline. Please generate code and click "Start Local Runner" in the bottom panel.',
        },
      });
      return;
    }

    // NOTE: Step 2 - Extract agent configuration and model
    const agentNodes = (document?.nodes || []).filter(
      (n) => n.type === 'agent' || (n as any).type === 'agentNode'
    );
    let modelName = (agentNodes[0]?.data as any)?.model || 'gemini-flash-latest';
    if (!modelName || modelName.includes('2.5') || modelName.includes('1.5') || modelName.includes('2.0')) {
      modelName = 'gemini-flash-latest';
    }

    const payload = {
      model: modelName,
      messages: history.map((h) => ({ role: h.role, content: h.content })),
      stream: streaming,
    };

    // NOTE: Step 3 - Send request to runner endpoint (/v1/chat/completions)
    let assistantReply = '';
    const candidateUrls = [
      `http://localhost:${port}/v1/chat/completions`,
      `http://127.0.0.1:${port}/v1/chat/completions`,
    ];

    try {
      let response: any = null;
      let lastErr: any = null;

      for (const targetUrl of candidateUrls) {
        try {
          if (typeof fetch === 'function') {
            response = await fetch(targetUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream, application/json, text/plain, */*',
              },
              body: JSON.stringify(payload),
            });
            if (response.ok) break;
          }
        } catch (e) {
          lastErr = e;
        }
      }

      if (!response || !response.ok) {
        // Fallback: If 404 or connection error, check secondary paths
        const fallbackRes = await this.httpPostJson(port, '/v1/chat/completions', payload, 30000);
        if (fallbackRes.ok && fallbackRes.data) {
          const content = fallbackRes.data?.choices?.[0]?.message?.content || fallbackRes.text;
          assistantReply = content;
          await bridge.postMessage({
            type: 'CHAT_STREAM_CHUNK',
            payload: {
              sessionId,
              chunk: content,
              done: false,
            },
          });
        } else {
          throw new Error(lastErr ? lastErr.message : `Runner endpoint returned status ${response?.status || fallbackRes.status}`);
        }
      } else {
        const contentType = response.headers.get('content-type') || '';
        if (streaming && contentType.includes('text/event-stream') && response.body) {
          // SSE streaming parser
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let isStreamDone = false;

          try {
            while (!isStreamDone) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith(':')) continue;
                // NOTE: Standard OpenAI-compatible SSE completion marker
                if (trimmed === 'data: [DONE]') {
                  isStreamDone = true;
                  break;
                }
                if (trimmed.startsWith('data: ')) {
                  const dataStr = trimmed.slice(6);
                  try {
                    const parsed = JSON.parse(dataStr);
                    const delta = parsed.choices?.[0]?.delta?.content || parsed.content || '';
                    if (delta) {
                      assistantReply += delta;
                      await bridge.postMessage({
                        type: 'CHAT_STREAM_CHUNK',
                        payload: {
                          sessionId,
                          chunk: delta,
                          done: false,
                        },
                      });
                    }
                    if (parsed.choices?.[0]?.finish_reason === 'stop') {
                      isStreamDone = true;
                      break;
                    }
                  } catch {
                    if (dataStr) {
                      assistantReply += dataStr;
                      await bridge.postMessage({
                        type: 'CHAT_STREAM_CHUNK',
                        payload: {
                          sessionId,
                          chunk: dataStr,
                          done: false,
                        },
                      });
                    }
                  }
                }
              }
            }
          } finally {
            try {
              await reader.cancel();
            } catch {}
          }
        } else {
          // Plain JSON or non-SSE response
          const text = await response.text();
          let replyContent = text;
          try {
            const json = JSON.parse(text);
            replyContent = json.choices?.[0]?.message?.content || json.response || json.output || text;
          } catch {}

          assistantReply = replyContent;

          // NOTE: Emit simulated smooth chunking if streaming was requested
          if (streaming && replyContent.length > 50) {
            const words = replyContent.split(' ');
            for (let i = 0; i < words.length; i++) {
              const token = words[i] + (i < words.length - 1 ? ' ' : '');
              await bridge.postMessage({
                type: 'CHAT_STREAM_CHUNK',
                payload: {
                  sessionId,
                  chunk: token,
                  done: false,
                },
              });
              await new Promise((r) => setTimeout(r, 12));
            }
          } else {
            await bridge.postMessage({
              type: 'CHAT_STREAM_CHUNK',
              payload: {
                sessionId,
                chunk: replyContent,
                done: false,
              },
            });
          }
        }
      }

      // NOTE: Step 4 - Commit turn into session memory and send final done packet
      history.push({ role: 'assistant', content: assistantReply });
      this.chatSessions.set(sessionId, history);

      await bridge.postMessage({
        type: 'CHAT_STREAM_CHUNK',
        payload: {
          sessionId,
          chunk: '',
          done: true,
        },
      });
    } catch (err: any) {
      await bridge.postMessage({
        type: 'CHAT_STREAM_CHUNK',
        payload: {
          sessionId,
          chunk: '',
          done: true,
          error: `Chat execution failed: ${err.message || 'Unknown error'}`,
        },
      });
    }
  }

  /**
   * Resets conversational memory for a given session.
   *
   * @param sessionId Session identifier or all sessions if omitted
   */
  public resetChatSession(sessionId?: string): void {
    if (sessionId) {
      this.chatSessions.delete(sessionId);
    } else {
      this.chatSessions.clear();
    }
  }

  /**
   * Retrieves current conversation turn history for a session.
   *
   * @param sessionId Target session ID
   * @returns Array of chat turns
   */
  public getChatHistory(sessionId: string): Array<{ role: 'user' | 'assistant'; content: string }> {
    return this.chatSessions.get(sessionId) || [];
  }

  /**
   * Cancels an active test run if currently executing.
   * Aborts any in-flight HTTP scenario requests and terminates any active child processes.
   *
   * @param runId Target run identifier
   * @author Mike Nimer <mikenimer@google.com>
   */
  public cancelRun(runId: string): void {
    // Abort active in-flight HTTP request
    const controller = this.activeAbortControllers.get(runId);
    if (controller) {
      try {
        controller.abort();
      } catch {}
      this.activeAbortControllers.delete(runId);
    }

    const childProc = this.activeProcesses.get(runId);
    if (childProc && childProc.pid && childProc.pid !== process.pid) {
      try {
        childProc.kill('SIGTERM');
      } catch {}
      this.activeProcesses.delete(runId);
    }
  }

  /**
   * Cancels all currently running test subprocesses and aborts in-flight HTTP requests.
   *
   * @author Mike Nimer <mikenimer@google.com>
   */
  public cancelAll(): void {
    for (const [runId, controller] of this.activeAbortControllers.entries()) {
      try {
        controller.abort();
      } catch {}
      this.activeAbortControllers.delete(runId);
    }

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
    this.cleanupEphemeralFiles();
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

