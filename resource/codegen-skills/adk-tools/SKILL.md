---
name: adk-tools
description: "ADK tools: function tool rules (no defaults, dual-mode live/local fallback), built-in tools (google_search, Vertex AI Search, code execution) and their constraints, ToolContext, confirmation, auth, OpenAPI, and specialized toolsets; load whenever agents have tools."
metadata:
  usedBy: [generator, reviewer]
  targets: [all]
---

# ADK Tools

## Built-in Google Search Import Rule

- **CRITICAL IMPORT RULE FOR BUILT-IN TOOLS (`google_search`)**:
  * For Google Search Grounding: ALWAYS import `google_search` directly from `google.adk.tools`:
    `from google.adk.tools import google_search`
  * **FATAL ERROR TO AVOID**: NEVER import via `from google.adk.tools.google_search import google_search` or `import google.adk.tools.google_search`. There is NO module named `google_search` inside `google.adk.tools` (the tool is exported as a pre-instantiated singleton `google_search` from `google.adk.tools`). Attempting `from google.adk.tools.google_search import ...` causes a fatal `ModuleNotFoundError: No module named 'google.adk.tools.google_search'` crash at runtime!
  * Wire into agent using `tools=[google_search]`. When domain filters are required or subagents are attached, import `from google.adk.tools.google_search_tool import GoogleSearchTool` and instantiate `GoogleSearchTool(bypass_multi_tools_limit=True)`.
   * Whenever an agent uses Code Execution (`builtinType: 'code_execution'`):
     - Import syntax: `from google.adk.code_executors import BuiltInCodeExecutor`
     - Instantiation syntax: Pass `code_executor=BuiltInCodeExecutor()` into the `Agent(...)` definition.
     - DO NOT replace builtin code execution with custom simulated Python tool functions when `builtinType: 'code_execution'` is specified.
     - Note: Vertex AI Gemini DOES NOT support combining `code_executor` (or search tools) with `output_schema` on the same `Agent(...)`. Write output to `output_key` instead!

## Critical ADK & Vertex AI Search Tool Constraints

- **CRITICAL ADK & VERTEX AI SEARCH TOOL CONSTRAINTS**:
  * **Bypass Multi-Tools Limit for Search**: The Gemini API natively restricts combining built-in search grounding with function calling (including agent delegation via `sub_agents=[...]`) unless `bypass_multi_tools_limit=True` is explicitly specified.
    - Whenever an agent uses Google Search:
      * Import syntax: `from google.adk.tools.google_search_tool import GoogleSearchTool`
      * Instantiation syntax: `GoogleSearchTool(bypass_multi_tools_limit=True)`
      * DO NOT use `from google.adk.tools import google_search` or instantiate `GoogleSearchTool()` without `bypass_multi_tools_limit=True` when sub-agents or other tools are attached! Doing so raises runtime `ValueError: Agent has sub-agent transfer targets but is configured with GoogleSearchTool without bypass_multi_tools_limit=True`.
    - Whenever an agent uses Vertex AI Search:
      * Instantiation syntax: `VertexAiSearchTool(..., bypass_multi_tools_limit=True)`.
  * **Search Tool & Output Schema**: Vertex AI Gemini DOES NOT support combining Google Search tools with controlled generation (`output_schema` / response schema) on the SAME agent. If an agent uses `GoogleSearchTool`, you MUST NOT attach `output_schema` to that agent! Instead, describe the expected output format in the agent's `instruction` text, save the response to `output_key`, and let a downstream synthesizer agent (which does not use `GoogleSearchTool`) produce the final `output_schema`.

## Tool Definition & Dual-Mode Execution Pattern

- **REAL LLM INFERENCE (`agent.py`) vs. DUAL-MODE TOOL EXECUTION (`tools/*.py`)**:

- Tool Definition & Dual-Mode Execution Pattern:
  * Implement tools as native, type-annotated Python functions with descriptive docstrings detailing parameter purposes and return schemas so Gemini's function calling engine can accurately plan tool use.
  * **No Default Parameter Values in Tool Signatures**: All tool functions in `tools/*.py` MUST use explicit primitive type annotations (`str`, `int`, `float`, `bool`) and MUST NOT declare default values in their function signatures (e.g. write `def query_inventory(sku_id: str) -> dict:`, NEVER `def query_inventory(sku_id: str = "SKU-1") -> dict:`). Vertex AI / ADK function calling rejects default parameter values.
  * **Dual-Mode Tool Pattern (Live Cloud SDK + Local Zero-Config Fallback)**: Every custom tool that integrates with an external database or backend (such as AlloyDB / PostgreSQL via `ALLOYDB_URL`, Cloud Spanner via `SPANNER_INSTANCE` & `SPANNER_DATABASE`, BigQuery via `BQ_LAKEHOUSE_DATASET`, or external REST APIs) MUST implement both modes:
    - **Live Cloud Mode**: When the connection environment variable (`ALLOYDB_URL`, `SPANNER_INSTANCE`, `BQ_LAKEHOUSE_DATASET`, etc.) is set in `os.environ`, execute the real parameterized SDK query (`psycopg2`, `google.cloud.spanner`, `google.cloud.bigquery`, `httpx`).
    - **Local Zero-Config / Seed Fallback Mode**: When running locally in the VS Code Chat Runner, `make dev`, or `pytest` without external database environment variables configured (or when `./data/<target>/*.json` local seed files exist), gracefully fall back to rich, domain-accurate deterministic records covering all workflow entities and `testScenarios` (including all `expectedOutput` tokens) instead of raising `RuntimeError("... must be set")` when env vars are absent.

* ADK automatically converts typed Python functions into tool declarations and dispatches calls during the agent loop.

- `tools/*.py`: Tool definitions (e.g., Google Search, custom functions, MCP tools). Group tools logically by category/source. Use standard `logging.getLogger(__name__)`.

## 7. Tools: The Agent's Capabilities

### Function Tool Basics

```python
from google.adk.tools import ToolContext

def search_database(
    query: str,
    limit: int,
    tool_context: ToolContext  # Optional, for state access
) -> dict:
    """Searches the database for records matching the query.

    Args:
        query: The search query string.
        limit: Maximum number of results to return.

    Returns:
        dict with 'status' and 'results' keys.
    """
    # Access state if needed
    user_id = tool_context.state.get("user_id")

    # Tool logic here
    results = db.search(query, limit=limit, user=user_id)

    return {"status": "success", "results": results}
```

**Tool Rules:**
- Use clear docstrings (sent to LLM)
- Type hints required, NO default values
- Return a dict (JSON-serializable)
- Don't mention `tool_context` in docstring

### ToolContext Capabilities

```python
async def my_tool(query: str, tool_context: ToolContext) -> dict:
    # Read/write state
    tool_context.state["key"] = "value"

    # Trigger escalation (stops LoopAgent)
    tool_context.actions.escalate = True

    # Artifacts — see Artifacts section below for full API
    await tool_context.save_artifact("file.txt", part)

    # Memory search
    results = await tool_context.search_memory("query")

    return {"status": "success"}
```

### Built-in Tools

```python
from google.adk.tools import google_search
from google.adk.tools import VertexAiSearchTool
from google.adk.tools.load_web_page import load_web_page
from google.adk.code_executors import BuiltInCodeExecutor

# Google Search grounding
agent = Agent(tools=[google_search], ...)

# Agent Platform Search grounding (your own data)
agent = Agent(tools=[VertexAiSearchTool(data_store_id="projects/P/locations/L/collections/default_collection/dataStores/DS")], ...)

# Web page loading
agent = Agent(tools=[load_web_page], ...)

# Code execution (model-internal)
agent = Agent(code_executor=BuiltInCodeExecutor(), ...)

# Managed sandbox (Vertex AI Code Interpreter). For a per-user sandbox an agent works
# in across sessions, this primitive is not it — see the topic index in references/samples.md
# from google.adk.code_executors import VertexAiCodeExecutor
# agent = Agent(code_executor=VertexAiCodeExecutor(optimize_data_file=True, stateful=True), ...)

```

> **`google_search` is model-internal grounding, not a regular tool.** Mixing it with FunctionTools disables Automatic Function Calling (AFC) for all tools. If you need search alongside custom tools, consider a sub-agent architecture or a custom search function — see the [deep-search sample](https://github.com/google/adk-samples/tree/main/core/python/deep-search) for a working pattern. For eval implications, see the eval guide's `builtin-tools-eval` reference.

### Tool Confirmation

```python
from google.adk.tools import FunctionTool

# Simple confirmation
sensitive_tool = FunctionTool(delete_record, require_confirmation=True)

# Conditional confirmation
def needs_approval(amount: float, **kwargs) -> bool:
    return amount > 1000

transfer_tool = FunctionTool(transfer_money, require_confirmation=needs_approval)
```

### Human-in-the-Loop (pause & resume)

Pause a run to ask the user something, then resume. This is a general runtime feature (not workflow-specific). Enable resumption at the app level:

```python
from google.adk.apps import App, ResumabilityConfig

app = App(name="my_app", root_agent=root_agent,
          resumability_config=ResumabilityConfig(is_resumable=True))
```

- **Let the model ask:** add the built-in `request_input` tool (`from google.adk.tools import request_input`) to `tools=` — the model calls it when it needs clarification.
- **Approval gate inside a tool:** `tool_context.request_confirmation(hint="Approve this transfer?")`, or `FunctionTool(fn, require_confirmation=...)` (above).
- **Custom long-running tool:** wrap a function with `LongRunningFunctionTool(fn)` to pause until an external result arrives.

The user's reply is read from `ctx.resume_inputs` (available on `ToolContext` and `CallbackContext`). Inside graph workflows the same mechanism is node-based — see `adk-workflows.md` §7.

### Tool Authentication

| Auth Type | Pattern |
|-----------|---------|
| API Key | `token_to_scheme_credential("apikey", "query", "apikey", "KEY")` → `auth_scheme, auth_credential` |
| Service Account | `service_account_dict_to_scheme_credential(config, scopes=[...])` → `auth_scheme, auth_credential` |
| OAuth2 / OIDC | `AuthCredential(auth_type=AuthCredentialTypes.OAUTH2, oauth2=OAuth2Auth(client_id=..., client_secret=...))` |
| Custom FunctionTool | `tool_context.request_credential(AuthConfig(...))` to initiate, `tool_context.get_auth_response(AuthConfig(...))` to retrieve |

Helpers: `from google.adk.tools.openapi_tool.auth.auth_helpers import token_to_scheme_credential, service_account_dict_to_scheme_credential`. Pass `auth_scheme` + `auth_credential` to `OpenAPIToolset(...)`. [Full docs](https://adk.dev/tools-custom/authentication/)

### OpenAPI Tools

```python
from google.adk.tools.openapi_tool.openapi_spec_parser.openapi_toolset import OpenAPIToolset

toolset = OpenAPIToolset(spec_str=open("openapi.json").read(), spec_str_type="json")
agent = Agent(name="api_agent", tools=[toolset], ...)
```

Pass `auth_scheme` + `auth_credential` from the auth helpers above for authenticated APIs. Tool names derive from `operationId` (snake_case, max 60 chars). [Full docs](https://adk.dev/tools-custom/openapi-tools/index.md)

### ADK Built-in Tool Imports (Precision Required)

```python
# CORRECT - imports the tool instance
from google.adk.tools.load_web_page import load_web_page

# WRONG - imports the module, not the tool
from google.adk.tools import load_web_page
```

Pass the imported tool directly to `tools=[load_web_page]`, not `tools=[load_web_page.load_web_page]`.

## Specialized ADK Toolsets (TASK-227 - TASK-234)

- `OpenAPIToolset`: `from google.adk.tools.openapi_toolset import OpenAPIToolset`
- `ApplicationIntegrationToolset`: `from google.adk.tools.application_integration_toolset import ApplicationIntegrationToolset`
- `VertexAiRagRetrieval`: `from google.adk.tools.vertex_rag_store import VertexAiRagRetrieval`
- `BigQueryToolset`: `from google.adk.tools.bigquery_toolset import BigQueryToolset, WriteMode`
- `SpannerToolset`: `from google.adk.tools.spanner_toolset import SpannerToolset`
- `ComputerUseToolset`: `from google.adk.tools.computer_use_toolset import ComputerUseToolset`
- `ToolboxToolset`: `from google.adk.tools.toolbox_toolset import ToolboxToolset`
- Control flow tools: `from google.adk.tools import exit_loop, transfer_to_agent, load_memory, load_artifacts`
