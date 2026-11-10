---
name: adk-core
description: "Core Google ADK primitives: Agent/LlmAgent definitions, class contracts and forbidden kwargs, App/resumability, structured input/output schemas with Pydantic, instructions and state interpolation, project layout, running agents, and ADK source inspection; load for any agent.py work or tests against it."
metadata:
  usedBy: [generator, reviewer]
  targets: [all]
---

# ADK Core: Agents, Contracts & Schemas

## ADK Architecture & Primitives

1. **Google Agent Development Kit (ADK) Architecture & Primitives**:
   - MANDATORY: Build agents exclusively using the Google Agent Development Kit (`google-adk>=2.0.0`). Do NOT hand-roll custom orchestration loops or direct `genai.Client()` call harnesses.
   - Core ADK imports:
     * Single Agent or Coordinator: `from google.adk.agents import Agent`
     * Graph Workflows: `from google.adk.workflow import Workflow`
     * Built-in Tools: `from google.adk.tools import google_search` (or custom Python functions)
     * Local Runner & CLI: `from google.adk.runner import Runner`
   - Agent Definition Convention:
     * Every ADK agent module must export a top-level `root_agent` object in `agent.py`.

- You MUST implement agents using the official Google ADK SDK (`from google.adk.agents import Agent, SequentialAgent, ParallelAgent, LoopAgent` and `from google.adk.agents.remote_a2a_agent import RemoteA2aAgent`).
- Standard LLM agents MUST be instantiated as top-level module variables (`agent_1 = Agent(...)`, `root_agent = SequentialAgent(...)`) without subclassing `Agent`. NOTE: `BaseAgent` subclasses (`from google.adk.agents import BaseAgent`) ARE explicitly allowed and expected for specialized control-flow and orchestration nodes (`router`, `hitl`, `fallback`, `guardrail`) as detailed in Section 5 below. DO NOT override private framework methods like `_run_impl()` or `run_node_impl()`.

- **NO Custom Agent Subclasses for Standard LLM Agents**: Standard LLM agents must be instantiated directly as top-level variables. NOTE: `BaseAgent` subclasses (`from google.adk.agents import BaseAgent`) ARE explicitly allowed and expected for specialized control-flow and orchestration nodes (`router`, `hitl`, `fallback`, `guardrail`) as detailed in the Custom Agents section below. Never override internal framework methods like `_run_impl()`.

## ADK Agent Class Contracts & Parameter Constraints

- **ADK AGENT CLASS CONTRACTS & PARAMETER CONSTRAINTS**:
  * **`Agent(...)` (Leaf Execution Agent)**:
    - **Purpose**: Executes LLM prompts and tools.
    - **Valid Kwargs**: `name`, `model`, `instruction`, `description`, `tools`, `sub_agents`, `output_key`, `output_schema`, `generate_content_config`, `before_agent_callback`, `after_agent_callback`.
    - **Hyperparameter & Thinking Configuration**: When workflow agent nodes specify `temperature`, `maxOutputTokens`, `thinkingBudget`, or sampling parameters, DO NOT pass `temperature` or `thinkingBudget` directly to `Agent(...)` (it causes a Pydantic `extra_forbidden` ValidationError). Instead, configure `generate_content_config=genai_types.GenerateContentConfig(...)` (importing `from google.genai import types as genai_types`) on the `Agent(...)` definition. If `thinkingBudget` is specified (e.g. `thinkingBudget: 2048`), include `thinking_config=genai_types.ThinkingConfig(thinking_budget=2048)` inside `GenerateContentConfig(temperature=..., thinking_config=genai_types.ThinkingConfig(thinking_budget=2048))`.
    - **Iteration Limits**: For agent loops, reasoning steps, or iteration limits, use the configured `maxIterations` (e.g. 4) or reasonable defaults between 1 and 4 iterations (never high values like 10, to prevent runaway agent loops).
    - **Structured Output Schema (`output_schema`)**: When an agent node in the workflow specification specifies `structuredOutput` or `structuredOutputSchema` (with `enabled: true`), always generate the corresponding Pydantic `BaseModel` class. If that agent has NO tools (`tools=[]`), wire the Pydantic model directly to that agent via `output_schema=<ModelName>` in `agent.py`. However, because Vertex AI Gemini strictly forbids combining ANY `tools` (search, function tools, REST tools, MCP tools, or code execution) with `output_schema` controlled generation on the same `Agent(...)`, if an agent node has BOTH `tools` AND `structuredOutput` / `structuredOutputSchema`, you MUST still define the Pydantic `BaseModel` class in code, omit `output_schema=` on the tool-bearing `Agent(...)`, configure `output_key="<agent_name>_output"`, and instruct the agent in its `instruction` to output JSON matching the schema.
    - **State Writing**: `output_key="<state_key>"` stores the agent's output text/schema into session state so downstream agents can reference it.
  * **`RemoteA2aAgent(...)` (A2A Protocol Gateway Agent)**:
    - **Purpose**: Proxies execution over HTTP to an external Agent-to-Agent (A2A) agent defined by an agent card.
    - **Valid Kwargs**: `name`, `description`, `agent_card`, `httpx_client`, `sub_agents`, `before_agent_callback`, `after_agent_callback`.
    - **Agent Card Path**: Reference `agent_card=str(Path(__file__).parent / f"{safe_name}_agent_card.json")`. The full canonical agent card JSON (including all public `additionalInterfaces` with `HTTP+JSON`) is automatically exported by the engine. DO NOT generate mock, partial, or truncated agent card files.
    - **Forbidden Kwargs**: `instruction`, `model`, `tools`, `output_key`, `output_schema`, `temperature`, `auth_credential`, `custom_headers`. Passing any of these causes a Pydantic `extra_forbidden` ValidationError.
    - **Authentication**: Authenticate using standard `google.auth.default()` and pass an authenticated `httpx.AsyncClient(headers=headers, timeout=600.0, limits=httpx.Limits(max_keepalive_connections=0))` to `httpx_client=`.
  * **`ParallelAgent(...)` (Concurrent Composite Agent)**:
    - **Purpose**: Executes child sub-agents concurrently in parallel.
    - **Valid Kwargs**: `name`, `description`, `sub_agents`, `before_agent_callback`, `after_agent_callback`.
    - **Forbidden Kwargs**: `instruction`, `model`, `tools`, `output_key`, `output_schema`, `temperature`. Passing `output_key` causes a Pydantic `extra_forbidden` ValidationError.
  * **`SequentialAgent(...)` (Pipeline Composite Agent)**:
    - **Purpose**: Executes child sub-agents in sequential order, passing state from step to step.
    - **Valid Kwargs**: `name`, `description`, `sub_agents`, `before_agent_callback`, `after_agent_callback`.
    - **Forbidden Kwargs**: `instruction`, `model`, `tools`, `output_key`, `output_schema`, `temperature`. Passing `output_key` causes a Pydantic `extra_forbidden` ValidationError.
  * **`LoopAgent(...)` (Iterative Composite Agent)**:
    - **Purpose**: Executes child sub-agents repeatedly up to `max_iterations`.
    - **Valid Kwargs**: `name`, `description`, `sub_agents`, `max_iterations`, `before_agent_callback`, `after_agent_callback`.
    - **Forbidden Kwargs**: `instruction`, `model`, `tools`, `output_key`, `output_schema`, `temperature`. Passing `output_key` causes a Pydantic `extra_forbidden` ValidationError.

### Compact Parameter Summary

* **Agent Class Parameter Constraints**:
   - `Agent(...)`: Leaf execution agent accepting `name`, `model`, `instruction`, `description`, `tools`, `sub_agents`, `output_key`, `output_schema`, `generate_content_config`. `output_key` stores output to session state.

* **Agent Iteration Limits**: For agent loops or iteration bounds, use the configured `maxIterations` (e.g. 4) or reasonable defaults between 1 and 4 iterations (never high values like 10, to prevent runaway loops).

- `RemoteA2aAgent(...)`: A2A protocol gateway agent accepting `name`, `description`, `agent_card`, `httpx_client`, `sub_agents`. Forbidden: `instruction`, `temperature`, `output_key`, `tools`. Passing `output_key` causes a Pydantic `extra_forbidden` ValidationError.
- `ParallelAgent(...)`, `SequentialAgent(...)`, `LoopAgent(...)`: Composite container agents accepting `name`, `description`, `sub_agents` (and `max_iterations` for Loop). Forbidden: `instruction`, `temperature`, `output_key`, `tools`. Passing `output_key` causes a Pydantic `extra_forbidden` ValidationError.

## App & Resumability Imports

- **APP & RESUMABILITY IMPORTS**:
  * `App` and `ResumabilityConfig` are standalone classes in `google.adk.apps`.
  * ALWAYS import directly: `from google.adk.apps import App, ResumabilityConfig`.
  * NEVER write `App.ResumabilityConfig`. Instantiate as `resumability_config=ResumabilityConfig(is_resumable=True)`.

## Structured Input & Output Schemas

- Structured Input Schemas (`inputSchema` / Pydantic v2 `BaseModel` for inputs):
  * When an agent or router node has `inputSchema` defined and enabled:
    - In `pydantic_models.py`, define a Pydantic v2 `BaseModel` for incoming input/state (e.g. `class <AgentName>Input(BaseModel): ...`).
    - Strongly type each field: `str`, `int`, `float`, `bool`, `List[...]`, `dict`, `Literal[...]`.
    - Use `Field(description=..., default=...)` for optional/required fields.
    - In execution entrypoints (`server.py` / `main.py` / agent runner), validate incoming request payloads using `<AgentName>Input.model_validate(payload)`.
    - For Router Agents (`agentKind: "router"`), condition expressions evaluate against the validated typed attributes (e.g. `input.urgency > 3`, `input.category == 'billing'`).

- In execution entrypoints (`main.py` / server harness / agent runner), validate incoming request payloads using `<AgentName>Input.model_validate(payload)`.

- `pydantic_models.py`: Pydantic BaseModel schemas for structured outputs and typed input schemas (`inputSchema`) (when defined in nodes). If `outputFormat` is `"text"` and no `inputSchema` is configured, DO NOT invent artificial Pydantic schema models or result classes.

- **Only generate Pydantic models if structured output is explicitly defined**: If an agent node specifies `outputFormat: "json"` (or explicitly defines a JSON schema), generate `pydantic_models.py` with that schema model and configure `output_schema=ResponseSchema`.
- **Plain Text Output (`outputFormat: "text"` or unconfigured)**: If `outputFormat` is `"text"` or not explicitly set to JSON schema, DO NOT generate artificial domain Pydantic models (such as inventing a custom domain result class like `StockAnalysisResult`). The agent or synthesizer MUST return plain text or markdown without `output_schema`.

- For Sequential, Parallel, and Loop with explicit schemas: Create a tool-free synthesizer `Agent` evaluating sub-agent state. If `outputFormat` is text, the synthesizer outputs text/markdown.
- For Coordinator: Place `output_schema=ResponseSchema` directly on the root `Agent` only when `outputFormat: "json"`.

## ADK Instructions (upstream agents-cli background)

> NOTE: The scaffolding steps below come from the upstream `agents-cli` ADK skill. In this multi-agent codegen workflow you cannot run commands; the generated repository itself is the scaffold, so treat them as background context.

### Prerequisites for Writing Code
Do NOT write agent code until a project is scaffolded.

1. Verify project: run `agents-cli info` (proceed if config exists).
2. New project: run `agents-cli scaffold create <name>`.
3. Existing code: run `agents-cli scaffold enhance .`.

**Product name mapping:** "Agent Engine" / "Vertex AI Agent Engine" is now **Agent Runtime**. Use `--deployment-target agent_runtime`.

**Ambient / scheduled / event-driven agents:** ADK's `trigger_sources` registers `/apps/{app}/trigger/*` endpoints on the same FastAPI app for **all** targets. On **Cloud Run** / **GKE** these are public HTTP routes you point a Pub/Sub push subscription or Eventarc trigger at; on **Agent Runtime** the same routes are reachable through the Agent Engine `/api` passthrough (e.g. `.../reasoningEngines/v1/{resource}/api/apps/{app}/trigger/pubsub`). Cloud Run remains the simplest target for unauthenticated trigger sources. See /google-agents-cli-adk-code (`references/adk-python.md`, section "12. Event-Driven / Ambient Agents") for the `trigger_sources` pattern.

**OAuth / user consent agents:** Use **Agent Runtime** with Gemini Enterprise for agents that need OAuth 2.0 user consent (e.g., accessing Google Drive, Calendar, or other user-scoped APIs). Cloud Run does not currently support managed OAuth flows. For a worked example, look up OAuth user consent in the topic index in /google-agents-cli-adk-code → `references/samples.md`.

## Quick Reference — Most Common Patterns

```python
from google.adk.agents import Agent

def get_weather(city: str) -> dict:
    """Get current weather for a city."""
    return {"city": city, "temp": "22°C", "condition": "sunny"}

root_agent = Agent(
    name="my_agent",
    model="gemini-3.8-flash",
    instruction="You are a helpful assistant that ...",
    tools=[get_weather],
)
```

#################################################
## ADK Skills Reference

# ADK Python Cheatsheet

## 1. Core Concepts & Project Structure

### Essential Primitives

*   **`Agent`**: The core intelligent unit. Can be `LlmAgent` (LLM-driven) or `BaseAgent` (custom/workflow).
*   **`Tool`**: Callable function providing external capabilities (`FunctionTool`, `AgentTool`, etc.).
*   **`Session`**: A stateful conversation thread with history (`events`) and short-term memory (`state`).
*   **`State`**: Key-value dictionary within a `Session` for transient conversation data.
*   **`Runner`**: The execution engine; orchestrates agent activity and event flow.
*   **`Event`**: Atomic unit of communication; carries content and side-effect `actions`.

### Standard Project Layout

```
your_project_root/
├── <agent_name>/ or app/    # Agent code directory
│   ├── __init__.py
│   ├── agent.py            # Contains root_agent definition
│   ├── tools.py            # Custom tool functions
│   └── .env                # Environment variables
├── tests/
│   ├── eval/
│   │   ├── eval_config.yaml    # Eval criteria and thresholds
│   │   └── datasets/           # Eval datasets (JSON)
│   ├── integration/
│   └── unit/
└── pyproject.toml or requirements.txt
```

---

## 2. Agent Definitions (`LlmAgent`)

### Basic Setup

```python
from google.adk.agents import Agent

def get_weather(city: str) -> dict:
    """Returns weather for a city."""
    return {"status": "success", "weather": "sunny", "temp": 72}

my_agent = Agent(
    name="weather_agent",
    model="gemini-3.8-flash",
    instruction="You help users check the weather. Use the get_weather tool.",
    description="Provides weather information.",  # Important for multi-agent delegation
    tools=[get_weather]
)
```

### Key Configuration Options

```python
from google.genai import types as genai_types
from google.adk.agents import Agent

agent = Agent(
    name="my_agent",
    model="gemini-3.8-flash",
    instruction="Your instructions here. ALWAYS use optional {state_key?} with a trailing '?' for dynamic state injection.",
    description="Description for delegation.",

    # LLM generation parameters
    generate_content_config=genai_types.GenerateContentConfig(
        temperature=0.2,
        max_output_tokens=8192,
    ),

    # Save final output to state
    output_key="agent_response",

    # Control history sent to LLM
    include_contents='default',  # 'default' or 'none'

    # Delegation control
    disallow_transfer_to_parent=False,
    disallow_transfer_to_peers=False,

    # Sub-agents for delegation
    sub_agents=[specialist_agent],

    # Tools
    tools=[my_tool],

    # Callbacks
    before_agent_callback=my_callback,
    after_agent_callback=my_callback,
    before_model_callback=my_callback,
    after_model_callback=my_callback,
    before_tool_callback=my_callback,
    after_tool_callback=my_callback,
)
```

### Structured Output with Pydantic

> **Warning**: Using `output_schema` disables tool calling and delegation.

**CRITICAL SCHEMA REQUIREMENT RULE (Pydantic v2)**:
When generating Pydantic models (such as in `pydantic_models.py`) for structured output schemas or input schemas:
- Strictly check whether each field is marked as required (`required: true`).
- For ALL required fields—including array/list types and primitive types—declare the field without a default value or with `Field(..., description=...)` (e.g., `key_competitors: List[str] = Field(..., description="...")` or `key_competitors: List[str]`).
- NEVER use `default_factory=list`, `default=[]`, or `default=None` on required fields! In Pydantic v2, setting any default or default_factory excludes the field from `model_json_schema()["required"]`, which causes schema validation and test assertion failures.
- Only fields with `required: false` may specify default values (e.g., `default_factory=list` or `default=None`).

```python
from pydantic import BaseModel, Field
from typing import List, Literal, Optional

class Evaluation(BaseModel):
    grade: Literal["pass", "fail"] = Field(..., description="The evaluation result.")
    comment: str = Field(..., description="Explanation of the grade.")
    recommendations: List[str] = Field(..., description="Required recommendations list without default factory.")
    notes: Optional[str] = Field(default=None, description="Optional notes.")

evaluator = Agent(
    name="evaluator",
    model="gemini-3.8-flash",
    instruction="Evaluate the input and provide structured feedback.",
    output_schema=Evaluation,
    output_key="evaluation_result",
)
```

### Instruction Best Practices & Session State Interpolation (`{state_key?}`)

**CRITICAL ADK STATE INTERPOLATION RULE (PREVENT `KeyError: Context variable not found`)**:
In Google ADK (`google.adk.flows.llm_flows.prompt._instructions_utils`), any `{var_name}` in an `Agent(instruction="...")` string where `var_name` is a valid Python identifier (`var_name.isidentifier()`) is evaluated as a **mandatory** lookup in `invocation_context.session.state[var_name]`. If `var_name` is not yet set in `session.state` (for example, on Iteration 1 of a `LoopAgent` when `algorithm_generator` runs BEFORE `benchmark_evaluator` has produced `evaluation_feedback`, or when an upstream branch was skipped), bare `{var_name}` without a trailing `?` immediately crashes the server with:
`KeyError: "Context variable not found: \`evaluation_feedback\` in agent 'algorithm_generator'."`
- **MANDATORY RULE 1**: Whenever referencing ANY session state variable in `instruction="..."`, ALWAYS include the trailing `?` optional marker: `{state_key?}` (e.g., `{evaluation_feedback?}`, `{candidate_code?}`, `{initial_draft?}`, `{critique_rubric?}`, `{summary?}`, `{data_a?}`). NEVER write bare `{evaluation_feedback}` or `{candidate_code}` without `?`!
- **MANDATORY RULE 2**: In `LoopAgent` (`subAgentPattern: "loop"` or `"debate"`) and multi-stage pipelines, ALSO attach a `before_agent_callback` on the first/generator agent that initializes all `loopStateKeys` and referenced state variables via `callback_context.state.setdefault("<key>", "")` so `session.state` is guaranteed to be populated before Iteration 1!

```python
# ALWAYS use optional {state_key?} with a trailing '?' for dynamic state injection
instruction = """
You are a {role?} assistant.
User preferences: {user_preferences?}

Rules:
- Always use tools when available
- Never make up information
"""
```

---

## App Name

The `App(name=...)` parameter **must match the agent directory name** (default: `app`). A mismatch causes "Session not found" errors during evaluation because the runner infers the app name from the directory path.

```python
# CORRECT — matches the "app" directory
app = App(name="app", root_agent=root_agent)

# WRONG — causes eval failures
app = App(name="my_custom_agent", root_agent=root_agent)
```

**CRITICAL: `App` Keyword Arguments**: In `google.adk.apps.App`, strict Pydantic validation is enabled (`extra='forbid'`). `App(...)` only accepts `name`, `root_agent`, `root_node`, and config objects (`plugins`, `resumability_config`, etc.). NEVER pass `description="..."` to `App(...)` (unlike `Agent`, `App` does NOT have a `description` field and doing so causes immediate Pydantic validation crashes).

---

## Quick Reference

### Running Agents Programmatically

```python
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

session_service = InMemorySessionService()
await session_service.create_session(app_name="app", user_id="user", session_id="s1")
runner = Runner(agent=my_agent, app_name="app", session_service=session_service)

async for event in runner.run_async(
    user_id="user", session_id="s1",
    new_message=types.Content(role="user", parts=[types.Part.from_text(text="Hello!")]),
):
    if event.is_final_response():
        print(event.content.parts[0].text)
```

### Factory Functions for Sub-agents

Use factory functions (not module-level instances) to avoid "agent already has a parent" errors. Always **call** the factory — passing the function reference fails with `ValidationError: Input should be a valid dictionary or instance of BaseAgent`.

```python
def create_researcher():
    return Agent(name="researcher", ...)

root_agent = SequentialAgent(
    sub_agents=[create_researcher(), create_analyst()],  # call the functions!
    ...
)
```

Data flows between sequential sub-agents via conversation history and `output_key` state.

### Further Reading

- [ADK Documentation](https://adk.dev/llms.txt)
- [ADK Samples](https://github.com/google/adk-samples)
- `references/samples.md` — topic index of the reference recipes, and how to clone one

---

## Inspecting ADK Source Code

When you need to look up ADK internals, inspect the installed package directly:

```bash
# Find the ADK package location (use "uv run python" if using uv)
python -c "import google.adk; print(google.adk.__path__[0])"
```

### ADK Package Directory Map

```
google/adk/
├── agents/           # Agent types (LlmAgent, BaseAgent, SequentialAgent, etc.)
├── tools/            # Tool implementations (FunctionTool, google_search, etc.)
├── sessions/         # Session services (InMemory, Database, VertexAI)
├── memory/           # Memory services
├── runners.py        # Runner and execution engine
├── events/           # Event types and actions
├── models/           # Model integrations (Gemini, LiteLLM, etc.)
├── code_executors/   # Code execution (BuiltInCodeExecutor, etc.)
├── evaluation/       # Eval framework (criteria, evaluators, etc.)
├── cli/              # ADK CLI internals (used by agents-cli playground, eval, etc.)
├── flows/            # LLM flow implementations
├── artifacts/        # Artifact services
└── auth/             # Authentication helpers
```

Use Glob/Grep/Read on the installed package to find exact implementations, method signatures, and configuration options.

For the full ADK documentation index, use `curl https://adk.dev/llms.txt`.

---
