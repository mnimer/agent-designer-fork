---
name: codegen-review
description: "Concise cross-file consistency checklist (file completeness, imports vs symbols, dependencies, env vars, blueprint fidelity, tests, packaging) for the optional post-generation reviewer."
metadata:
  usedBy: [reviewer]
  targets: [all]
---

# Cross-File Consistency Review Checklist

You are the code reviewer. You receive the blueprint JSON, every generated file, and read-only check results. Verify each item below; for every violation, report the file, the offending line/symbol, and the concrete fix. You never write files; each issue is routed to the agent that owns the file. Keep findings specific — no style nitpicks.

## 1. File Manifest Completeness
- [ ] Every file required by the target's complete repository file manifest (`target-cloudrun` or `target-agent-engine`) exists, plus every conditional file the blueprint requires (`pydantic_models.py`, `tools/*.py`, `a2ui_components.py` + `a2ui_adaptor.py`, `callbacks.py`, `skills/<name>/SKILL.md`, `*_card.json`, `webhook_gateway.py`).
- [ ] `agent.py` exists and defines a top-level `root_agent`; `session_store.py` exists with ALL store classes fully implemented (no `pass` / `InMemorySessionStore()` delegation stubs) and `get_session_store(backend: Optional[str] = None)`.
- [ ] No file is a stub, truncated, or contains placeholder `...` bodies; every `.py` file parses cleanly (`ast.parse`) as Python 3.11 (no mid-stream typo corrections, multiline `with` statements are parenthesized).

## 2. Imports & Symbols
- [ ] Every `from agent import ...` / `import agent` in `test_agent.py`, `server.py`, `main.py`, `evaluate.py`, `webhook_gateway.py` references a symbol that is actually defined in `agent.py` (e.g. `root_agent`, `app`, custom `BaseAgent` subclasses, tool functions).
- [ ] Every `from tools.<module> import <fn>` and `from pydantic_models import <Model>` resolves to a real definition with a matching signature.
- [ ] `test_agent.py` imports typing symbols from `typing` (never from `unittest.mock`) and imports `Any` alongside `AsyncGenerator` (or uses `from __future__ import annotations`).
- [ ] ADK imports use the exact documented paths (`from google.adk.tools import google_search` or `GoogleSearchTool` from `google.adk.tools.google_search_tool`, never `from google.adk.tools.google_search import ...`; `from google.adk.apps import App, ResumabilityConfig`, never `App.ResumabilityConfig`; `load_web_page` from `google.adk.tools.load_web_page`).
- [ ] `agent.py` prepends its own directory to `sys.path` before importing sibling modules.

## 3. Dependencies
- [ ] `requirements.txt` covers EVERY third-party import across all generated `.py` files (ADK, `google-genai`, FastAPI/uvicorn, session-store drivers, `httpx`, `anthropic[vertex]>=0.49.0` for `claude-*`, `openai>=1.60.0` for OpenMaaS/OpenAI/Grok, `google-adk[a2a]>=2.0.0` + `a2a-sdk[http-server]>=0.3.4` for A2A, `a2ui-agent-sdk` / MCP extras when used, `pytest`, `pytest-asyncio`, `python-dotenv`, `google-cloud-aiplatform[...]`).
- [ ] No standalone `vertexai` package is listed in `requirements.txt` / `pyproject.toml` (it ships inside `google-cloud-aiplatform` and causes an unresolvable pip conflict).
- [ ] `pyproject.toml` dependencies are consistent with `requirements.txt` (for Agent Runtime, model-provider packages MUST appear in BOTH, and `[tool.uv]` `package = false` is present).

## 4. Environment Variables & Configuration
- [ ] Every env var read by Python code (`os.environ[...]`, `os.getenv(...)`) appears in `.env.example` (e.g. `SESSION_STORE_BACKEND`, `DATABRICKS_TOKEN`, `SNOWFLAKE_MCP_TOKEN`, `ARTIFACT_BUCKET_NAME`, `ALLOWED_CORS_ORIGINS`, tool connection vars).
- [ ] Deployed env vars are consistent across Terraform (`main.tf` container env / Secret Manager), `Makefile` (`ENV_VARS`, `-var=` flags), `cloudbuild.yaml` substitutions, `.agent_engine_config.json` (Agent Runtime), and `Dockerfile` `ENV`.
- [ ] `GOOGLE_CLOUD_LOCATION` is `global` everywhere a Gemini model is called (`agent.py` direct assignment — never `os.environ.setdefault` — Dockerfile, Terraform, Makefile, `.agent_engine_config.json`, `evaluate.py --location` default).
- [ ] No deprecated models (`gemini-2.5-*`, `gemini-2.0-*`, `gemini-1.5-*`, `gemini-flash-latest`) appear anywhere; default model is `gemini-3.8-flash`.
- [ ] No secrets or credential-bearing default URIs are hardcoded; secrets flow through Secret Manager + `roles/secretmanager.secretAccessor`.
- [ ] Every Make variable passed to `-var=` in `make infra` is declared as a Terraform variable; `outputs.tf` references resources that exist in `main.tf`.

## 5. Blueprint Fidelity
- [ ] Every agent node in the blueprint is instantiated and wired into the `root_agent` hierarchy (no orphaned agents), following the parent's `subAgentPattern` rules; leaf nodes are plain `Agent(...)`.
- [ ] Every agent `name` is a valid Python identifier (snake_case).
- [ ] No agent combines tools (search, function, MCP, code execution) with `output_schema`; tool-bearing agents use `output_key` instead.
- [ ] Composite agents (`SequentialAgent`, `ParallelAgent`, `LoopAgent`, `RemoteA2aAgent`) receive no forbidden kwargs (`instruction`, `model`, `tools`, `output_key`, `output_schema`, `temperature`).
- [ ] `temperature` / `thinkingBudget` are passed via `generate_content_config=genai_types.GenerateContentConfig(...)`, never directly to `Agent(...)`.
- [ ] Agent instructions reflect ONLY each node's `systemPrompt` — no test prompts, expected outputs, or test entities leak into `agent.py` or `server.py`.
- [ ] Trigger-dependent artifacts exist only when the trigger exists (Pub/Sub, Eventarc, Cloud Scheduler, webhook, chat → OpenAI-compatible endpoints) and are consistent across server routes, Terraform, and IAM.

## 6. Tests & Evaluation
- [ ] `test_agent.py` has one dedicated test per blueprint test scenario, asserting the exact `expectedOutput` / `expectedOutputPattern` (no `or True` / `or len(...) > 0` weakening).
- [ ] Tests are hermetic: LLM calls and network calls are mocked; agents run via `InMemoryRunner`; no `patch.object(agent_instance, "run_async", ...)` and no `root_agent.run_async(MagicMock())`.
- [ ] Tool outputs used in assertions actually contain the `expectedOutput` tokens (deterministic local fallback data covers them).
- [ ] `eval_dataset.jsonl` has one valid JSON object per line covering every test scenario (`prompt`, `reference`, `expected_tool_calls`) and `expected_tool_calls` name tools that exist.
- [ ] Commands in `Makefile`, `cloudbuild.yaml`, and `README.md` reference files that exist (`test_agent.py`, `evaluate.py`, `eval_dataset.jsonl`, `server:app`, `cloudbuild-buildonly.yaml`).

## 7. Container & Packaging
- [ ] `Dockerfile` entrypoint matches the target (`uvicorn server:app` on port 8080 for Cloud Run; `adk api_server --host=0.0.0.0 --port=8080 .` for Agent Runtime, with `--trigger_sources` when Eventarc/Pub/Sub triggers exist) and runs as non-root user `8888`.
- [ ] `.gitignore`, `.dockerignore`, `.gcloudignore` (and `.ae_ignore`) are concise (≤ 10–15 lines) and use a single `.env*` wildcard (plus `!.env.example` where appropriate).
- [ ] `README.md` documents the real Makefile targets and file layout.
