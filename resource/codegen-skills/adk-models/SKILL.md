---
name: adk-models
description: "Model configuration for ADK agents: Gemini defaults, Gemini 4 rules, Anthropic Claude, Vertex AI Model Garden OpenMaaS, OpenAI/xAI Grok via OpenAILlm, and LiteLLM; load when any node uses a non-default or third-party model."
metadata:
  usedBy: [generator, reviewer]
  targets: [all]
  preloadWhen: [non_gemini_models]
---

# ADK Models Configuration

## Third-Party Model Support in `agent.py` (Summary)

* **3rd-Party Model Support in `agent.py` (Anthropic Claude & Vertex AI Model Garden / OpenAI / Grok)**:
  - **Anthropic Claude (`claude-*`)**: Google ADK (`google.adk.models.anthropic_llm.Claude`) resolves `claude-.*` models automatically when `anthropic[vertex]>=0.49.0` is installed. Whenever ANY root agent or sub-agent node uses a `claude-*` model: (1) include `anthropic[vertex]>=0.49.0` in `requirements.txt`, (2) strip any `publishers/anthropic/models/` prefix so `model="claude-opus-5-5"` is passed to `Agent(...)`, (3) never pass `temperature` in `generate_content_config` for `claude-opus-5-5` (deprecated on `claude-opus-5-5` and causes HTTP 400), and (4) keep any sub-agent that uses built-in `GoogleSearchTool` on `gemini-3.8-flash` (since `google_search` is Gemini-only).
  - **Vertex AI Model Garden OpenMaaS (`deepseek-ai/*`, `qwen/*`, `meta/*`, `mistralai/*`, `openai/*-maas`) & OpenAI / xAI Grok (`openai/*`, `gpt-*`, `o3-*`, `grok-*`)**: Whenever ANY root agent or sub-agent node uses one of these models: (1) include `openai>=1.60.0` in `requirements.txt`, (2) import `from google.adk.integrations.openai import OpenAILlm` in `agent.py`, and (3) for Vertex AI OpenMaaS models (`deepseek-ai/*`, `qwen/*`, `meta/*`, `mistralai/*`, `openai/*-maas`), pass `model=OpenAILlm(model="<model_id>", base_url=f"https://aiplatform.googleapis.com/v1beta1/projects/{os.environ.get('GOOGLE_CLOUD_PROJECT', '')}/locations/global/endpoints/openapi", api_key=_get_vertex_maas_token)` where `_get_vertex_maas_token()` returns a fresh `google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])` access token; for direct OpenAI / Grok models, pass `model=OpenAILlm(model="<bare_model_id>")` (with `base_url="https://api.x.ai/v1", api_key=os.environ.get("XAI_API_KEY")` for `grok-*`).

## Detailed Third-Party Model Rules

* **Anthropic Claude (`claude-*`) Rules**: In Google ADK (`google-adk>=2.0.0`), `Claude` (`google.adk.models.anthropic_llm.Claude`) is automatically registered in `LLMRegistry` for `claude-.*` model strings ONLY when `anthropic[vertex]>=0.49.0` is installed (if `anthropic` is missing, ADK raises `ValueError: Model claude-... not found. Claude models require the anthropic package`). Whenever ANY root agent or sub-agent node uses a `claude-*` model:
  1. MUST include `anthropic[vertex]>=0.49.0` in BOTH `requirements.txt` AND `pyproject.toml`.
  2. Ensure `os.environ["GOOGLE_CLOUD_PROJECT"]` is populated at the top of `agent.py` (falling back to `google.auth.default()[1]` when unset), because `Claude._anthropic_client` raises `ValueError` if `GOOGLE_CLOUD_PROJECT` is not in `os.environ`.
  3. Strip any `publishers/anthropic/models/` prefix so `model="claude-opus-5-5"` (or the short `claude-*` ID) is passed to `Agent(...)`.
  4. Do NOT pass `temperature` in `generate_content_config` for `claude-opus-5-5` (Anthropic deprecated `temperature` on `claude-opus-5-5` and returns HTTP 400 if `temperature` is set).
  5. Built-in `GoogleSearchTool` / `google_search` is only supported on Google Gemini models (`gemini-*`); if a sub-agent uses `google_search`, keep that sub-agent on `gemini-3.8-flash` or use custom Python tools.
* **Vertex AI Model Garden OpenMaaS (`deepseek-ai/*`, `qwen/*`, `meta/*`, `mistralai/*`, `openai/*-maas`) & OpenAI / xAI Grok (`openai/*`, `gpt-*`, `o3-*`, `grok-*`) Rules**: Google ADK's default `LLMRegistry` only registers `gpt-.*` and `o[134]-.*` and does NOT register `deepseek-ai/.*`, `qwen/.*`, `meta/.*`, `mistralai/.*`, `openai/.*`, or `grok-.*` by default. Whenever ANY root agent or sub-agent node uses one of these models:
  1. MUST include `openai>=1.60.0` in BOTH `requirements.txt` AND `pyproject.toml`.
  2. In `agent.py`, import `from google.adk.integrations.openai import OpenAILlm`.
  3. For Vertex AI Model Garden OpenMaaS models (`deepseek-ai/*`, `qwen/*`, `meta/*`, `mistralai/*`, `openai/*-maas`), pass an `OpenAILlm` instance to `Agent(model=OpenAILlm(...))` configured with Vertex AI's OpenAI-compatible endpoint and an ADC bearer token callable:
     ```python
     import google.auth
     import google.auth.transport.requests
     from google.adk.integrations.openai import OpenAILlm

     def _get_vertex_maas_token() -> str:
         creds, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
         if not creds.valid:
             creds.refresh(google.auth.transport.requests.Request())
         return creds.token or ""

     _maas_base_url = f"https://aiplatform.googleapis.com/v1beta1/projects/{os.environ.get('GOOGLE_CLOUD_PROJECT', '')}/locations/global/endpoints/openapi"
     # Pass model=OpenAILlm(model="deepseek-ai/deepseek-v3.2-maas", base_url=_maas_base_url, api_key=_get_vertex_maas_token)
     ```
  4. For direct OpenAI (`openai/gpt-*`, `gpt-*`, `o3-*`) or xAI Grok (`grok-*`), pass `model=OpenAILlm(model="<bare_model_id>")` (adding `base_url="https://api.x.ai/v1", api_key=os.environ.get("XAI_API_KEY")` for `grok-*`).

## 6. Models Configuration

### Google Gemini (Default)

```python
# AI Studio (dev): in the project .env, comment the GOOGLE_* lines and
# uncomment GEMINI_API_KEY (GOOGLE_API_KEY is also accepted).

# Vertex AI (prod)
# Set: GOOGLE_CLOUD_PROJECT, GOOGLE_CLOUD_LOCATION, GOOGLE_GENAI_USE_VERTEXAI=True

agent = Agent(model="gemini-3.8-flash", ...)
```

### Other Models via LiteLLM

```python
from google.adk.models.lite_llm import LiteLlm

agent = Agent(model=LiteLlm(model="openai/gpt-4o"), ...)
agent = Agent(model=LiteLlm(model="anthropic/claude-sonnet-4-20250514"), ...)
agent = Agent(model=LiteLlm(model="ollama_chat/llama3:instruct"), ...)
```

### Vertex AI Native Models

```python
from google.adk.models import Gemini

# Vertex AI hosted Gemini (set GOOGLE_GENAI_USE_VERTEXAI=True)
agent = Agent(model=Gemini(model="gemini-3.8-flash"), ...)
```

Provider guides: [Anthropic](https://adk.dev/agents/models/anthropic/index.md), [Ollama](https://adk.dev/agents/models/ollama/index.md), [vLLM](https://adk.dev/agents/models/vllm/index.md), [LiteLLM](https://adk.dev/agents/models/litellm/index.md)

---
