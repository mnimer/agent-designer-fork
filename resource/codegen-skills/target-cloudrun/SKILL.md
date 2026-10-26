---
name: target-cloudrun
description: "Google Cloud Run deployment target: complete file manifest, FastAPI server.py (health, direct query, A2A, OpenAI-compatible, Pub/Sub, webhook routes), main.py, requirements.txt, Dockerfile, ignore files, and scaffolded Cloud Run infrastructure notes; load for target cloudrun."
metadata:
  usedBy: [generator, reviewer]
  targets: [cloudrun]
---

# Target: Google Cloud Run

You are an expert Google Cloud and Google Agent Development Kit (ADK) software engineer.
Your task is to generate a complete, production-ready Python repository utilizing the official Google Agent Development Kit (`google-adk`)
and FastAPI, configured for deployment to Google Cloud Run based on the provided react-flow JSON describing the Agent Workflow.

### Deployment Target: Google Cloud Run

## Repository Mandate (Cloud Run)

- Every response MUST include the full project manifest: `agent.py` (with `root_agent`), `session_store.py`, FastAPI server (`server.py`), packaging, CLI runner, test suite, evaluation dataset and script, dependencies (`requirements.txt`), Dockerfile, CI/CD pipeline, Terraform infrastructure, and documentation.
- **CONCISE IGNORE FILES RULE (ANTI-REPETITION MANDATE)**: Keep `.gitignore`, `.dockerignore`, and `.gcloudignore` strictly concise (at most 10–15 lines per file). Use a single wildcard `.env*` line (and `!.env.example` where appropriate) — NEVER enumerate individual `.env.*` suffixes (`.env.backup`, `.env.tmp`, `.env.1`, `.env.old`, etc.).

## Complete Repository File Manifest (Cloud Run)

### MANDATORY COMPLETE REPOSITORY FILE MANIFEST:
Every response MUST create the complete project. Emitting only 1 or 2 files is strictly prohibited.
The complete repository MUST contain EVERY single one of the following files (each as its own object in the returned JSON array):
1. `agent.py`: Complete Google ADK root_agent, sub-agents, and state flow.
2. `session_store.py`: Production session store checkpointer implementations (`get_session_store`).
3. `server.py`: Production FastAPI server mounting ADK endpoints and health checks.
4. `main.py`: Local CLI test runner using ADK Runner.
5. `test_agent.py`: Pytest test suite validating all test scenarios against root_agent. When the workflow specification contains trigger nodes of type `tester` (or `triggerType == 'tester'`), inspect `config.testScenarios`, `config.testPrompts`, and `config.expectedOutput`. For EVERY defined test scenario (e.g. 'Test Case #1' with prompt 'Let\'s play a game.'), generate a dedicated pytest test function in `test_agent.py` that executes the scenario prompt against `root_agent` and asserts the expected output criteria.

   - (Detailed `test_agent.py` rules: see `python-testing`.)

6. `eval_dataset.jsonl`: Golden evaluation dataset matching all workflow test scenarios.
7. `evaluate.py`: Vertex AI Agent Evaluation script using vertexai.evaluation.EvalTask.
8. `requirements.txt`: Complete pinned dependencies (including google-adk[a2a] and a2a-sdk[http-server] if an A2A agent is present).
9. `Makefile`: Self-contained CLI & CI/CD automation Makefile with `install`, `dev`, `test`, `eval`, `infra`, `deploy`, `register-agent`, `setup-gateway`, and `publish-gemini-enterprise` targets.
10. `Dockerfile`: Clean production container definition using python:3.11-slim. Always enforce non-root execution by creating a dedicated non-privileged user (`RUN useradd -u 8888 -m appuser && chown -R appuser:appuser /app` and `USER 8888`).
11. `.dockerignore`: Docker ignore patterns excluding `.git`, `.venv`, `__pycache__`, `*.pyc`, `.env*`, `dist`, and build artifacts.
12. `cloudbuild.yaml`: CI/CD Cloud Build pipeline running tests, building container, and deploying.
13. `main.tf`: Complete Terraform configuration deploying google_cloud_run_v2_service, Artifact Registry, Service Account, IAM roles, and triggers.
14. `variables.tf`: Input variable definitions for Terraform.
15. `outputs.tf`: Output values (service_url, service_id, artifact_repo_id, service_account_email).
16. `terraform.tfvars`: Default variable values for local initialization.
17. `pyproject.toml`: Modern packaging metadata and dependencies.
18. `.gitignore`: Git ignore patterns for Python, venv, and cache.
19. `.gcloudignore`: Cloud Build / gcloud deployment ignore patterns.
20. `README.md`: Architecture overview, local execution (`make install && make dev`), unit testing (`make test`), Terraform provisioning (`make infra`), and standalone CLI / CI/CD deployment (`make deploy`).
21. Auxiliary files as needed:
    - `pydantic_models.py` (when structured output schemas or Pydantic models are used)
    - `tools/*.py` (when custom tools are defined)

## Runtime File Specifications

- `server.py`: Production FastAPI server wrapping Google ADK's `root_agent` and handling incoming client requests, triggers, and health checks. Follow these implementation instructions:
  * **Core Server Configuration**:
    - Import and use Google ADK's `get_fast_api_app(agents_dir=..., web=True, trigger_sources=[...])` from `google.adk.cli.fast_api` to automatically mount built-in ADK routes (`/run_sse`, `/apps/{app}/trigger/pubsub`, health checks, etc.).
    - Initialize ADK's `InMemorySessionService()` (or configured persistence) and construct `Runner(agent=root_agent, app_name=..., session_service=session_service, auto_create_session=True)` with `auto_create_session=True` to guarantee sessions are automatically provisioned on request.
    - Expose both `GET /health` and `GET /healthz` returning `{"status": "ok", "agent": root_agent.name}` for local runner and Cloud Run health probes.
    - When configuring `CORSMiddleware` on the FastAPI `app`, avoid combining `allow_origins=["*"]` with `allow_credentials=True`. Configure explicit trusted origins (e.g. `allow_origins=os.getenv("ALLOWED_CORS_ORIGINS", "http://localhost:3000,http://localhost:8080").split(",")`) or set `allow_credentials=False` when wildcard origins are permitted.
  * **Direct Query & Test Execution Routes (`POST /` and `POST /api/run`)**:
    - ALWAYS expose `@app.post("/")` and `@app.post("/api/run")` so the Visual Agent Designer Interactive Chat tab, smoke testers, and external HTTP clients can invoke the agent directly via POST.
    - Accept flexible JSON request payloads: `{"input": {"query": "..."}}` (extension runner format), `{"query": "..."}`, `{"prompt": "..."}`, or raw strings.
    - If `root_agent` has `inputSchema` configured, validate incoming payloads against `<AgentName>Input.model_validate(...)` early before executing the agent runner.
    - When resolving sessions, note that `await session_service.get_session(...)` returns `None` (rather than raising an exception) if the session does not exist. Always check `if not session:` and call `await session_service.create_session(...)` before running the agent.
    - Dispatch the query to `root_agent` using ADK's latest asynchronous `Runner` and session service, stream/accumulate the text tokens (filtering out intermediate `getattr(part, "thought", False)` chunks when final answer text is present), and return a standardized JSON response: `{"output": <text>, "response": <text>, "text": <text>, "status": "success"}`.
  * **Agent-to-Agent (A2A) Protocol Endpoints for Gemini Enterprise (`GET /.well-known/agent.json`, `GET /.well-known/agent-card.json`, `POST /v1/message:send`, `POST /message:send`, `POST /v1/message:stream`, `POST /message:stream`, and JSON-RPC 2.0 on `POST /`)**:
    - ALWAYS expose these A2A protocol routes directly on the FastAPI `app` (using standard FastAPI handlers without importing `a2a` or `google.adk.a2a`) so Gemini Enterprise (Discovery Engine) can discover and invoke the Cloud Run service:
      * `GET /.well-known/agent.json` and `GET /.well-known/agent-card.json`: Return a valid A2A v0.3 `AgentCard` JSON object (`name`, `description`, `url` resolved from `x-forwarded-proto` / `x-forwarded-host`, `version: "1.0.0"`, `protocolVersion: "0.3.0"`, `preferredTransport: "JSONRPC"`, `defaultInputModes: ["text/plain", "application/json"]`, `defaultOutputModes: ["text/plain", "application/json"]`, `capabilities: {"streaming": False, "pushNotifications": False, "stateTransitionHistory": False}`, and `skills: [{"id": root_agent.name, "name": root_agent.name, "description": ..., "tags": ["adk", "cloud-run"]}]`). Note: Set `preferredTransport: "JSONRPC"` and `capabilities.streaming: False` because Gemini Enterprise (`_get_cloud_run_headers`) signs `Sec-Authenticated-Request-Headers` against the root `agent_card.url` path (`/`), which requires JSON-RPC 2.0 `POST /` to pass GFE / Cloud Run edge verification.
      * `POST /v1/message:send` and `POST /message:send`: Parse incoming A2A `SendMessageRequest` JSON (`body.get("message") or body.get("request")`, extracting text from `content` or `parts` and `contextId` as the session ID), run the query against `root_agent`, and return the Protobuf-JSON `SendMessageResponse` wire shape expected by `a2a-sdk` `RestTransport` (`ParseDict(response_data, a2a_pb2.SendMessageResponse())`):
        `{"message": {"messageId": str(uuid.uuid4()), "contextId": context_id, "role": "ROLE_AGENT", "content": [{"text": final_text}]}}`.
      * `POST /v1/message:stream` and `POST /message:stream`: Parse incoming A2A `SendMessageRequest` JSON and return a `StreamingResponse(..., media_type="text/event-stream")` emitting `data: {"message": {"messageId": ..., "contextId": context_id, "role": "ROLE_AGENT", "content": [{"text": final_text}]}}\n\n`.
      * On `POST /`: Detect A2A JSON-RPC 2.0 requests (`body.get("jsonrpc") == "2.0"` and `"method" in body` such as `"message/send"` or `"tasks/send"`), extract text from `params.message.parts` or `params.message.content`, execute `root_agent`, and return `{"jsonrpc": "2.0", "id": body.get("id"), "result": {"kind": "message", "messageId": ..., "contextId": context_id, "role": "agent", "parts": [{"kind": "text", "text": final_text}]}}`.
  * **OpenAI-Compatible Chat Endpoints (`GET /v1/models` and `POST /v1/chat/completions`)**:
    - GENERATE WHEN: The workflow includes a trigger node with `triggerType == "chat"` (or `triggerKind == "chat"`).
    - `GET /v1/models`: Returns a standard OpenAI model list object (`{"object": "list", "data": [...]}`) identifying the agent name and underlying LLM model.
    - `POST /v1/chat/completions`: Provides full OpenAI Chat Completions compatibility for drop-in use with OpenAI SDKs, LangChain, and API consumers:
      * Parse standard OpenAI parameters: `messages`, `model`, `stream` (boolean), `temperature`, `user`, etc.
      * Extract the user prompt from the messages conversation history (prioritizing the most recent user role message).
      * Manage user and session lifecycle using ADK's session service, ensuring the session is created if `get_session(...)` returns `None`.
      * If `stream: true`: Stream tokens incrementally using Server-Sent Events (`text/event-stream`), emitting chunks in the standard OpenAI `chat.completion.chunk` delta schema, terminating with `data: [DONE]`.
      * If `stream: false`: Accumulate the full agent response asynchronously and return the standard OpenAI `chat.completion` JSON schema, including unique completion ID, created timestamp, assistant message content, and token usage estimation.
   * **Conditional Pub/Sub Ingestion Route (`POST /pubsub` or `/apps/{app}/trigger/pubsub`)**:
     - GENERATE WHEN: The workflow includes a trigger node with `triggerType == "pubsub"` (or `triggerKind == "pubsub"`).
     - Parse the Google Cloud Pub/Sub push message format: extract `message.data` (decoding from base64), decode JSON or plain text body, extract attributes, and dispatch prompt to `root_agent` via the ADK runner.
     - Return HTTP 200 OK (`{"status": "acknowledged"}`) upon successful agent execution so Pub/Sub does not redeliver the message.
   * **Conditional Webhook Route (`POST /webhook` or configured `webhookPath`)**:
     - GENERATE WHEN: The workflow includes a trigger node with `triggerType == "webhook"` (or `triggerKind == "webhook"`).
     - Validate security headers (e.g. `X-Webhook-Secret` or `Authorization: Bearer <token>`) against environment variables when authentication is configured.
     - Parse incoming payload body and dispatch to `root_agent` via the ADK runner.
   * **Server Entrypoint**:
     - When executed directly (`if __name__ == "__main__":`), run `uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))`.
 - `main.py`: Interactive CLI runner for local terminal testing. Implement as an `asyncio` command-line loop that prompts for console input and uses ADK's `Runner` to dispatch `root_agent` prompts and stream event tokens to stdout.

- `requirements.txt`: Version-pinned production and test dependencies:
  * Core ADK & Model Frameworks: `google-adk>=2.0.0`, `google-genai>=1.0.0`, `google-cloud-aiplatform[evaluation]>=1.60.0`, `pandas>=2.0.0`.
  * Web Service & Serialization: `fastapi>=0.110.0`, `uvicorn[standard]>=0.28.0`, `pydantic>=2.0.0`.
  * Test & Environment Tooling: `pytest>=8.0.0`, `pytest-asyncio>=0.23.0`, `python-dotenv>=1.0.0`.
  * Conditional Packages: Include `google-adk[a2a]>=2.0.0` and `a2a-sdk[http-server]>=0.3.4` if A2A agent nodes exist; include `anthropic[vertex]>=0.49.0` if any root agent or sub-agent uses a `claude-*` model; include `openai>=1.60.0` if any root agent or sub-agent uses a Vertex AI Model Garden OpenMaaS model (`deepseek-ai/*`, `qwen/*`, `meta/*`, `mistralai/*`, `openai/*-maas`) or OpenAI / xAI Grok model (`openai/*`, `gpt-*`, `o3-*`, `grok-*`); include tool-specific packages (e.g. `google-cloud-secret-manager>=2.16.0`, `httpx>=0.27.0`) when enabled.
- `Dockerfile`: Production container definition for Google Cloud Run:
  * Base Image: Use an official slim Python runtime (e.g., `python:3.11-slim`).
  * Environment Settings: Configure `PYTHONUNBUFFERED=1`, `GOOGLE_GENAI_USE_VERTEXAI=true`, and `GOOGLE_CLOUD_LOCATION=global`, and establish an application working directory (e.g., `/app`).
  * Dependency Layer Caching: Copy `requirements.txt` and execute `pip install --no-cache-dir -r requirements.txt` prior to copying application source code to maximize Docker build layer caching.
  * Container Execution: Expose port `8080` and configure the entrypoint to serve the FastAPI app using Uvicorn (`python -m uvicorn server:app --host 0.0.0.0 --port 8080`).
  * Ensure a .dockerignore file is provided to prevent copying sensitive local files (.env, .git) into build layers.

---

# Cloud Run Infrastructure

> **Assumes /google-agents-cli-scaffold scaffolding.** If your project isn't scaffolded yet, see /google-agents-cli-scaffold first.

## Scaling & Resource Defaults

Agents CLI scaffolds Cloud Run infrastructure in `deployment/terraform/single-project/service.tf` (and the `cicd/` variant). Check that file for current resource limits, scaling configuration, concurrency, and session affinity settings.

Key settings to be aware of: `cpu_idle` (CPU allocation strategy), `min_instance_count` (cold start avoidance), `max_instance_request_concurrency` (concurrency per instance), and `session_affinity` (sticky routing).

For how to size cpu/memory/workers/concurrency together (and avoid OOM), see **Sizing a deployment** in the /google-agents-cli-deploy skill.

## Dockerfile

Scaffolded projects include a `Dockerfile` using single-stage build with `uv` for dependency management. Check the project root `Dockerfile` for the exact configuration.

## FastAPI Endpoints

Scaffolded apps serve the ADK HTTP surface (`/run_sse`, `/apps/...`), A2A routes under `/a2a/{app_name}` (JSON-RPC + agent card — A2A is built into every ADK agent). Exact routes vary by template; check `app/fast_api_app.py`.

## Session Types

| Type | Configuration | Use Case |
|------|--------------|----------|
| **In-memory** | Default (`shared://session` resolved by `app_utils/services.py` (in-memory)) | Local dev only; lost on instance restart |
| **Cloud SQL** | `--session-type cloud_sql` at scaffold time | Production persistent sessions (Postgres 15, IAM auth) |
| **Agent Runtime** | Managed Agent Engine sessions (`agentengine://{resource_name}`) | When using Agent Runtime as session backend |

The concrete session URI for `cloud_sql` / `agent_platform_sessions` is now built inside `app_utils/services.py`, not `fast_api_app.py`.

Cloud SQL session infrastructure (instance, database, Cloud SQL Unix socket volume mount) is configured in `deployment/terraform/single-project/service.tf`.

> **Manual Deployment Warning:** When using Cloud SQL without Terraform (e.g., direct `gcloud run deploy` with `--add-cloudsql-instances`), you MUST manually grant `roles/cloudsql.client` to the runtime service account, otherwise the connection will fail with authorization errors.

## Network & Ingress

Default ingress is `INGRESS_TRAFFIC_ALL` (public). To restrict, change the `ingress` setting in `service.tf` to `INGRESS_TRAFFIC_INTERNAL_ONLY` (VPC only) or `INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER` (internal + GCLB).

IAP (Identity-Aware Proxy) can be enabled by running `agents-cli deploy --iap` (Cloud Run only), which adds Google identity authentication without code changes. IAP is configured by the deploy flag, not by a generated Terraform variable.

VPC connectors are not configured by default. Add them in custom Terraform if needed for private resource access (see `references/terraform-patterns.md`).
