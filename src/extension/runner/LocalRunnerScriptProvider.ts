/**
 * LocalRunnerScriptProvider
 *
 * Job inside Application:
 * Provides the raw multi-framework python test adapter script content that wraps a user-designed
 * agent (agent.py or agent_runtime_app.py) and exposes standard HTTP /health and OpenAI-compatible
 * /v1/chat/completions endpoints.
 *
 * Architectural Decisions:
 * - Built-in import shims: Auto-aliases google.adk.tools import discrepancies to prevent ModuleNotFoundError.
 * - AdkApp parameter filtering: Dynamically shims __init__ to intercept and filter out extra forbidden properties.
 * - Turn session isolation: Feeds the sessionId down to the ADK session manager.
 * - Clean event-stream reader: Pulls text parts, tool calls, and error messages securely out of ADK event loops.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

export function getLocalRunnerScriptContent(): string {
  return `import sys
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

_shared_session_service = None

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

        # 2. Inspect agent.py for root_agent / pipeline instances (prefer app if present)
        import agent
        for var_name in ['app', 'root_agent', 'agent_runtime', 'workflow', 'pipeline', 'agent_instance', 'agent']:
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
            return
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

        session_id = data.get('sessionId') or data.get('session_id') or 'default_user_session'

        try:
            ag = get_agent()
            if ag is None:
                raise RuntimeError("Could not find agent instance in agent.py or agent_runtime_app.py")

            res = None

            def _extract_text_from_event(evt):
                texts = []
                if hasattr(evt, 'text') and evt.text:
                    texts.append(str(evt.text))
                elif isinstance(evt, str):
                    return evt

                content = getattr(evt, 'content', None) if not isinstance(evt, dict) else evt.get('content')
                if content:
                    parts = getattr(content, 'parts', []) if not isinstance(content, dict) else content.get('parts', [])
                    for p in (parts or []):
                        if isinstance(p, dict):
                            if p.get('text'):
                                texts.append(str(p['text']))
                            fc = p.get('function_call')
                            if fc:
                                fc_name = fc.get('name', '') if isinstance(fc, dict) else getattr(fc, 'name', '')
                                fc_args = fc.get('args', {}) if isinstance(fc, dict) else getattr(fc, 'args', {})
                                if 'request_input' in fc_name:
                                    msg = fc_args.get('message') or fc_args.get('prompt') or fc_args.get('text')
                                    if msg:
                                        texts.append(str(msg))
                        else:
                            if hasattr(p, 'text') and p.text:
                                texts.append(str(p.text))
                            if hasattr(p, 'function_call') and p.function_call:
                                fc = p.function_call
                                fc_name = getattr(fc, 'name', '')
                                fc_args = getattr(fc, 'args', {}) or {}
                                if 'request_input' in fc_name:
                                    msg = None
                                    if isinstance(fc_args, dict):
                                        msg = fc_args.get('message') or fc_args.get('prompt') or fc_args.get('text')
                                    elif hasattr(fc_args, 'get'):
                                        msg = fc_args.get('message') or fc_args.get('prompt') or fc_args.get('text')
                                    if msg:
                                        texts.append(str(msg))

                if hasattr(evt, 'get_function_calls') and callable(getattr(evt, 'get_function_calls')):
                    try:
                        for fc in evt.get_function_calls():
                            fc_name = getattr(fc, 'name', '')
                            if 'request_input' in fc_name:
                                fc_args = getattr(fc, 'args', {}) or {}
                                msg = None
                                if isinstance(fc_args, dict):
                                    msg = fc_args.get('message') or fc_args.get('prompt') or fc_args.get('text')
                                elif hasattr(fc_args, 'get'):
                                    msg = fc_args.get('message') or fc_args.get('prompt') or fc_args.get('text')
                                if msg and str(msg) not in texts:
                                    texts.append(str(msg))
                    except Exception:
                        pass

                return "".join(texts)

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

                    global _shared_session_service
                    if _shared_session_service is None:
                        _shared_session_service = InMemorySessionService()

                    async def _run_adk_runner():
                        app_to_run = ag
                        if isinstance(ag, App):
                            app_name = getattr(ag, 'name', 'vad_app') or 'vad_app'
                            runner = Runner(app=ag, session_service=_shared_session_service)
                        elif hasattr(ag, 'root_agent') and isinstance(getattr(ag, 'root_agent'), App):
                            app_to_run = getattr(ag, 'root_agent')
                            app_name = getattr(app_to_run, 'name', 'vad_app') or 'vad_app'
                            runner = Runner(app=app_to_run, session_service=_shared_session_service)
                        else:
                            try:
                                import agent
                                if hasattr(agent, 'app') and isinstance(getattr(agent, 'app'), App):
                                    app_to_run = agent.app
                                    app_name = getattr(app_to_run, 'name', 'vad_app') or 'vad_app'
                                    runner = Runner(app=app_to_run, session_service=_shared_session_service)
                                else:
                                    app_name = getattr(ag, 'name', 'vad_app') or 'vad_app'
                                    runner = Runner(agent=ag, app_name=app_name, session_service=_shared_session_service)
                            except Exception:
                                app_name = getattr(ag, 'name', 'vad_app') or 'vad_app'
                                runner = Runner(agent=ag, app_name=app_name, session_service=_shared_session_service)

                        session = await _shared_session_service.get_session(app_name=app_name, user_id="test_user", session_id=session_id)
                        if session is None:
                            session = await _shared_session_service.create_session(app_name=app_name, user_id="test_user", session_id=session_id)

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
                    try:
                        import inspect
                        sig = inspect.signature(ag.run)
                        if len(sig.parameters) > 0:
                            res = ag.run(prompt)
                    except Exception as run_err:
                        sys.stderr.write(f"[ag.run fallback ignored] {run_err}\\n")
                elif callable(ag):
                    try:
                        res = ag(prompt)
                    except Exception as call_err:
                        sys.stderr.write(f"[ag(prompt) fallback ignored] {call_err}\\n")
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
}
