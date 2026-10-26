---
name: target-agent-engine
description: "Google Agent Runtime (Vertex AI Agent Engine) deployment target: complete file manifest, agent.py container import rules, requirements.txt, Dockerfile with adk api_server, .agent_engine_config.json, pyproject.toml, ignore files, sessions, playground, and PSC networking; load for target agent-engine."
metadata:
  usedBy: [generator, reviewer]
  targets: [agent-engine]
---

# Target: Google Agent Runtime (Vertex AI Agent Engine)

You are an expert Google Cloud and Vertex AI Agent Engine software engineer.

Your task is to generate a complete, production-ready AI Agent repository. Configured for native deployment to Google Cloud Vertex AI Agent Engine / Agent Runtime based on the provided react-flow JSON describing the Agent Workflow Specification.

### Deployment Target: Google Vertex Agent Engine

## Repository Mandate (Agent Runtime)

- Emitting only a partial project or omitting core files like `agent.py` or `session_store.py` is strictly forbidden and breaks testing and deployment.
- Every response MUST include the standard project manifest: `agent.py` (with `root_agent`), `session_store.py`, `requirements.txt`, `pyproject.toml`, `Makefile`, `Dockerfile`, `.dockerignore`, `main.tf`, `cloudbuild-buildonly.yaml`, `cloudbuild.yaml`, `.agent_engine_config.json`, `test_agent.py`, `.env.example`, `.gitignore`, `.gcloudignore`, `.ae_ignore`, and `README.md`.
- **CONCISE IGNORE FILES RULE (ANTI-REPETITION MANDATE)**: Keep `.gitignore`, `.dockerignore`, `.gcloudignore`, and `.ae_ignore` strictly concise (at most 10–15 lines per file). Use a single wildcard `.env*` line (and `!.env.example` where appropriate) — NEVER enumerate individual `.env.*` suffixes (`.env.backup`, `.env.tmp`, `.env.1`, `.env.old`, etc.).

## Complete Repository File Manifest (Agent Runtime)

### MANDATORY COMPLETE REPOSITORY FILE MANIFEST:
Every response MUST create the complete project. Emitting only 1 or 2 files is strictly prohibited.
The complete repository MUST contain EVERY single one of the following files (each as its own object in the returned JSON array):
1. `agent.py`: Complete Google ADK root_agent, sub-agents, and state flow.
2. `session_store.py`: Production session store checkpointer implementations (`get_session_store`).
3. `requirements.txt`: Complete pinned runtime dependencies (including `google-adk>=2.0.0`, `google-adk[a2a]>=2.0.0` if an A2A agent is present, `google-cloud-aiplatform[adk,agent_engines]>=1.126.1`, `pydantic`, `pytest`).
4. `pyproject.toml`: Modern packaging metadata and dependencies (including `[tool.uv]\npackage = false`).
5. `Makefile`: Self-contained CLI & CI/CD automation Makefile with `install`, `dev`, `test`, `infra`, and `deploy` targets.
6. `.agent_engine_config.json`: ADK Agent Engine configuration JSON setting `GOOGLE_GENAI_USE_VERTEXAI="1"`, `GOOGLE_CLOUD_LOCATION="global"`, `GOOGLE_CLOUD_AGENT_ENGINE_ENABLE_TELEMETRY="true"`, `OTEL_SEMCONV_STABILITY_OPT_IN="gen_ai_latest_experimental"`, and `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT="EVENT_ONLY"`.
7. `Dockerfile`: Clean production container definition using python:3.11-slim. Always enforce non-root execution by creating a dedicated non-privileged user (`RUN useradd -u 8888 -m appuser && chown -R appuser:appuser /app` and `USER 8888`) running native `adk api_server --host=0.0.0.0 --port=8080 .`.
8. `.dockerignore`: Docker ignore patterns excluding `.git`, `.venv`, `__pycache__`, `*.pyc`, `.env*`, `dist`, and build artifacts.
9. `main.tf`: Complete Terraform configuration deploying google_vertex_ai_reasoning_engine with container_spec, Service Account, IAM bindings, and null_resource build_container invoking cloudbuild-buildonly.yaml (including google_secret_manager_secret, secret version, and secretAccessor IAM member when tools require OAuth / Bearer secret tokens; only generate Pub/Sub resources if a pubsub trigger node is present).
10. `cloudbuild-buildonly.yaml`: Focused Cloud Build configuration running unit tests, building the container image, and pushing to Artifact Registry for initial Day 0 Terraform setup.
11. `cloudbuild.yaml`: CI/CD Cloud Build pipeline running tests, building the container image, pushing to Artifact Registry, and updating the Reasoning Engine container.
12. `.env.example`: Template for environment variables (project ID, location, etc.).
13. `test_agent.py`: Pytest test suite covering all workflow test scenarios. When the workflow specification contains trigger nodes of type `tester` (or `triggerType == 'tester'`), you MUST inspect `config.testScenarios`, `config.testPrompts`, and `config.expectedOutput`. For EVERY defined test scenario (e.g. 'Test Case #1' with prompt 'Let\'s play a game.'), generate a dedicated pytest test function in `test_agent.py` that executes the scenario prompt against `root_agent` and asserts the expected output criteria.

    - (Detailed `test_agent.py` rules: see `python-testing`.)

14. `eval_dataset.jsonl`: Golden evaluation dataset matching all workflow test scenarios for Vertex AI Agent Evaluation. Format as JSON Lines (JSONL), where each line is a self-contained record defining the test `prompt`, expected reference ground truth (`reference`), and `expected_tool_calls` list derived from trigger node test scenarios.
15. `.gitignore`: Git ignore patterns for Python, venv, and cache.
16. `.gcloudignore`: Cloud Build / gcloud deployment ignore patterns.
17. `.ae_ignore`: ADK Agent Engine packaging ignore patterns (excluding `.venv/`, `__pycache__/`, `.git/`, `node_modules/`).
18. `README.md`: Architecture overview, local execution via `make install && make dev`, unit testing via `make test`, Terraform provisioning via `make infra` (`terraform init && terraform apply`), and standalone CLI / CI/CD deployment via `make deploy`.
19. Auxiliary files as needed:
    - `pydantic_models.py` (when structured output schemas or Pydantic models are used)
    - `tools/*.py` (when custom tools are defined)
    - `*_card.json` (when A2A agent card metadata is specified)

## Runtime File Specifications (Agent Runtime)

6. **File Structure to Generate**:
   - `agent.py`: Official Google ADK Agent definitions and execution runner: Defines `root_agent` (`Agent`, `SequentialAgent`, `ParallelAgent`, `LoopAgent`, or `Workflow`), tools, sub-agents.
      * CRITICAL: To ensure seamless importing under Vertex AI Agent Engine container execution (where `adk api_server` loads the agent as a submodule `f"{agent_name}.agent"` without adding the agent subdirectory to `sys.path`), `agent.py` MUST dynamically prepend its own directory to `sys.path` (via `Path(__file__).parent.resolve()`) before importing local modules (such as `pydantic_models` or `tools`).
   - `requirements.txt`: Dependencies needed locally and for deployment: Must include `google-adk>=2.0.0`, `google-cloud-aiplatform[adk,agent_engines]>=1.126.1`, `google-genai>=1.0.0`, `pydantic>=2.0.0`, `pytest>=8.0.0`, `pytest-asyncio>=0.23.0`, `python-dotenv>=1.0.0`. When any node in the workflow is an A2A agent (`agentKind: "a2a"`), `requirements.txt` MUST ALSO include `google-adk[a2a]>=2.0.0` and `a2a-sdk[http-server]>=0.3.4`. When any root agent or sub-agent uses a `claude-*` model, MUST include `anthropic[vertex]>=0.49.0`. When any root agent or sub-agent uses a Vertex AI Model Garden OpenMaaS model (`deepseek-ai/*`, `qwen/*`, `meta/*`, `mistralai/*`, `openai/*-maas`) or OpenAI / xAI Grok model (`openai/*`, `gpt-*`, `o3-*`, `grok-*`), MUST include `openai>=1.60.0`.
   - `Dockerfile`: Minimal, clean production container definition executing Google ADK's native API server:
     * Base Image: Use an official slim Python runtime (e.g., `python:3.11-slim`).
     * Environment & Working Directory: Establish working directory `/app` and configure environment variables `PYTHONUNBUFFERED=1` and `PORT=8080`.
     * Layer Caching: Copy `requirements.txt` and execute `pip install --no-cache-dir -r requirements.txt` prior to copying application source files.
     * Container Execution: Expose port `8080` and configure entrypoint `adk api_server --host=0.0.0.0 --port=8080 .` to launch ADK's native API server.
     * Ensure a .dockerignore file is provided to prevent copying sensitive local files (.env, .git) into build layers.

- `.agent_engine_config.json`: Native ADK Agent Engine runtime configuration JSON declaring `{"env_vars": {"GOOGLE_GENAI_USE_VERTEXAI": "1", "GOOGLE_CLOUD_LOCATION": "global", "GOOGLE_CLOUD_AGENT_ENGINE_ENABLE_TELEMETRY": "true", "OTEL_SEMCONV_STABILITY_OPT_IN": "gen_ai_latest_experimental", "OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT": "EVENT_ONLY", "ADK_CAPTURE_MESSAGE_CONTENT_IN_SPANS": "true"}}` so Cloud Console Traces, Sessions, Observability, and Security dashboards are enabled out-of-the-box and CLI deployments via `adk deploy agent_engine` or `make deploy` require zero procedural file patching.
- `pyproject.toml`: Modern Python packaging metadata declaring dependencies and `[tool.uv]\npackage = false`.
- `.env.example`: Template for environment variables (`GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION=global`, etc.).
- `.gitignore`, `.gcloudignore`, and `.ae_ignore`: Package strictly necessary agent assets, excluding virtualenvs (`.venv/`, `venv/`), `__pycache__`, `.pytest_cache`, `.agent` diagram files, and local credentials so payloads stay well under the 8 MiB Agent Engine limit.
- `README.md`: Architecture overview, unified CLI execution (`make install`, `make dev`, `make test`, `make infra`, `make deploy`), initial Day 0 Terraform setup (`terraform init && terraform apply`), and Cloud Build CI/CD deployment instructions.
- Auxiliary files as needed:
  * `pydantic_models.py`: Pydantic BaseModel schemas for structured outputs and typed input schemas (`inputSchema`) (when defined in nodes).
  * `tools/*.py`: Custom tools and functions passed to the agents. Group tools logically by category/source.
  * `*_card.json`: A2A agent card metadata JSON files (when A2A agent nodes are in the workflow).

## Webhook Trigger: agent.py Input Handling

- In `agent.py`: Include structured input handling translating incoming webhook JSON payloads into user turns for `root_agent`.

## Containerization

7. **Containerization & Cloud Build Configuration**:
   - `Dockerfile`:
     * Minimal `python:3.11-slim` image.
     * Copies `requirements.txt` and installs packages without cache.
     * Copies application source code into `/app`.
     * Exposes port 8080.
     * Runs `CMD ["adk", "api_server", "--host=0.0.0.0", "--port=8080", "."]`.

- `.gcloudignore`, `.gitignore` & `.ae_ignore`:
  * Exclude `.git`, `.github`, `.venv`, `venv`, `__pycache__`, `*.pyc`, `.pytest_cache`, `.agent`, `*.agent`, `.env`, and local caches.

# Agent Infrastructure & Terraform Deployment

## Deployment Architecture

Agent Engine deployments follow a **Terraform-first, container-based deployment** model:
1. The project includes a minimal, standard `Dockerfile` based on `python:3.11-slim` that copies dependencies, installs `requirements.txt`, and runs native `adk api_server`:
   ```dockerfile
   FROM python:3.11-slim
   WORKDIR /app
   ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PORT=8080
   COPY requirements.txt .
   RUN pip install --no-cache-dir -r requirements.txt
   COPY . .
   EXPOSE 8080
   CMD ["adk", "api_server", "--host=0.0.0.0", "--port=8080", "."]
   ```
2. Cloud Build builds the Docker image and pushes it to Google Cloud Artifact Registry (`{region}-docker.pkg.dev/{project_id}/agents/{agent_name}:{tag}`).
3. Terraform provisions all required cloud infrastructure via `google_vertex_ai_reasoning_engine` with `spec.container_spec.image_uri`, along with dedicated Service Accounts, IAM role bindings (`roles/aiplatform.user`, `roles/logging.logWriter`), and trigger resources (such as Pub/Sub topics and subscriptions for event ingestion).

> Terraform for Agent Runtime: see `terraform-agent-engine`. CI/CD: see `cicd-agent-engine`.

## State & Metadata Persistence
Deployment resource state (`deployedResourceId`, `serviceUrl`, `consoleUrl`, `deployedAt`) is stored directly in the `.agent` flow document inside the `"deployment"` block. Generated source code directories remain clean, isolated, and free of redundant sidecar JSON metadata files.

## Playground & Remote Testing

```bash
# Local mode (uses local agent instance)
agents-cli playground

# Query your deployed Agent Runtime remotely (ADK agent)
agents-cli run --url https://LOCATION-aiplatform.googleapis.com/v1/projects/PROJECT/locations/LOCATION/reasoningEngines/ID --mode adk "Hello, what can you do?"
```

`--mode` is required with `--url`: use `adk` for the ADK streaming API (`:streamQuery`) or `a2a` for the A2A protocol. Add `-v` for full JSON event payloads. Auth is auto-detected via Google Cloud credentials.

To query Agent Runtime programmatically:

```python
import agentplatform

client = agentplatform.Client(location="us-east1")
agent = client.agent_engines.get(name="projects/PROJECT/locations/LOCATION/reasoningEngines/ENGINE_ID")

async for event in agent.async_stream_query(message="Hello!", user_id="test"):
    print(event)
```

## Session & Artifact Services

Agent Runtime always uses in-memory sessions at scaffold time; at runtime `app_utils/services.py` upgrades to `VertexAiSessionService` when Agent Engine injects `GOOGLE_CLOUD_AGENT_ENGINE_ID`.

Artifacts use `GcsArtifactService` when `LOGS_BUCKET_NAME` is set, otherwise `InMemoryArtifactService`.

Environment variables set during deployment come from `agents-cli deploy` (the CLI's `deploy/agent_runtime.py`) for SDK deploys, and from `deployment/terraform/single-project/service.tf` (or the `cicd/` variant) for Terraform-managed deploys. Check those for current values.

### Memory Bank

To enable cross-session memory on Agent Runtime, configure `memory_bank_config` via `context_spec`. See the [`cross-session-memory` recipe](https://github.com/google/adk-samples/tree/main/core/python/cross-session-memory) for the full pattern.

## Networking (PSC Interface)

Agent Runtime cannot reach your VPC by default. To enable private connectivity, create a [network attachment](https://cloud.google.com/vpc/docs/create-manage-network-attachments) and deploy with `--network-attachment`. Add `--dns-peering-domain`, `--dns-peering-project`, and `--dns-peering-network` if you need private DNS resolution. PSC config is immutable after deployment — delete and redeploy to change it. See the [GCP docs](https://cloud.google.com/gemini-enterprise-agent-platform/scale/runtime/private-service-connect-interface) for prerequisites and setup.
