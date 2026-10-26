---
name: adk-callbacks-planners-skills
description: "Agent lifecycle callbacks, runner plugins, safety guardrails, context caching/compaction, planners, and ADK Agent Skills (SkillToolset); load when callbacks, plugins, plannerConfig, contextCacheConfig, eventsCompactionConfig, includeContents, or skills are configured."
metadata:
  usedBy: [generator]
  targets: [all]
  preloadWhen: [callbacks_planners_skills]
---

# Callbacks, Plugins, Context Management, Planners & Agent Skills

### Context Caching

Cache large context windows (system prompt + docs) to reduce latency and cost. Transparent to agent code.

```python
from google.adk.apps import App
from google.adk.agents.context_cache_config import ContextCacheConfig

app = App(
    name="my_app",
    root_agent=root_agent,
    context_cache_config=ContextCacheConfig(
        min_tokens=2048,     # only cache if context exceeds this
        ttl_seconds=1800,    # cache lifetime (default 1800)
        cache_intervals=10,  # re-cache every N invocations
    ),
)
```

### Context Compaction

Prevent context overflow on long sessions by compacting older events into summaries. Use **token-based** compaction: it triggers on actual prompt-token volume, so it handles unpredictable inputs (pasted code, large tool results) better than a fixed turn count.

```python
from google.adk.apps import App
from google.adk.apps.app import EventsCompactionConfig
from google.adk.apps.llm_event_summarizer import LlmEventSummarizer
from google.adk.models import Gemini

app = App(
    name="my_app",
    root_agent=root_agent,
    events_compaction_config=EventsCompactionConfig(
        token_threshold=32000,   # compact once prompt tokens reach this
        event_retention_size=5,  # keep the last 5 raw events un-compacted
        # Optional: custom summarizer model
        summarizer=LlmEventSummarizer(llm=Gemini(model="gemini-3.8-flash")),
    ),
)
```

## 9. Callbacks

### Callback Types

```python
from google.adk.agents.callback_context import CallbackContext
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.adk.tools import BaseTool, ToolContext
from google.genai import types as genai_types

# Callbacks are invoked by keyword — parameter names must match exactly.

# Agent lifecycle
async def before_agent_callback(callback_context: CallbackContext) -> None:
    callback_context.state["started"] = True

async def after_agent_callback(callback_context: CallbackContext) -> genai_types.Content | None:
    # Return None to continue, or Content to override
    return None

# Model interaction
async def before_model_callback(callback_context: CallbackContext, llm_request: LlmRequest) -> LlmResponse | None:
    # Return None to continue, or LlmResponse to skip model call
    return None

async def after_model_callback(callback_context: CallbackContext, llm_response: LlmResponse) -> LlmResponse | None:
    # Return None to continue, or modified LlmResponse
    return None

# Tool execution
async def before_tool_callback(tool: BaseTool, args: dict, tool_context: ToolContext) -> dict | None:
    # Return None to continue, or dict to skip tool and use as result
    return None

async def after_tool_callback(tool: BaseTool, args: dict, tool_context: ToolContext, tool_response: dict) -> dict | None:
    # Return None to continue, or modified dict
    return None
```

### Common Pattern

```python
# Initialize state before agent runs
async def init_state(callback_context: CallbackContext) -> None:
    if "preferences" not in callback_context.state:
        callback_context.state["preferences"] = {}

agent = Agent(before_agent_callback=init_state, ...)
```

---

## 10. Plugins

Global callback hooks across all agents/tools/LLMs. Use for cross-cutting concerns (logging, guardrails); use callbacks for per-agent logic.

```python
from google.adk.plugins.base_plugin import BasePlugin
from google.adk.apps import App

class MyPlugin(BasePlugin):
    async def before_model_callback(self, *, callback_context, llm_request):
        return None  # return None to observe, return value to intervene

# Register via App — plugins run BEFORE agent-level callbacks
app = App(name="my_app", root_agent=root_agent, plugins=[MyPlugin()])
runner = Runner(app=app, session_service=...)
```

Built-in plugins: `ReflectAndRetryToolPlugin` (retry failed tools), `BigQueryAgentAnalyticsPlugin` (log to BQ), `ContextFilterPlugin` (reduce context size), `GlobalInstructionPlugin` (shared system prompt), `SaveFilesAsArtifactsPlugin`, `LoggingPlugin`, `DebugLoggingPlugin`, `MultimodalToolResultsPlugin`.

Hooks: `before/after_agent_callback`, `before/after_model_callback`, `before/after_tool_callback`, `on_model_error_callback`, `on_tool_error_callback`, `on_user_message_callback`, `before/after_run_callback`, `on_event_callback`. [Full docs](https://adk.dev/plugins/index.md)

### Safety Guardrails

Use `before_model_callback` to filter input or `after_model_callback` to filter output. Return `None` to pass through, or return a modified `LlmResponse` to block/replace. Evaluate with the `safety` metric. [Full docs](https://adk.dev/safety/index.md)

---

## Agent Skills & Skill Factory (`skills` / `skillFactoryConfig`, TASK-223)

- When agent nodes contain `skills`:
  * Generate `skills/<skill_name>/SKILL.md` containing YAML frontmatter (`name`, `description`) and detailed execution instructions.
  * In `agent.py`, import `from google.adk.tools.skill_toolset import SkillToolset, Skill` and attach `SkillToolset(skills=[...])` to the agent's tools.

## Context Optimization (`contextCacheConfig`, `eventsCompactionConfig`, `includeContents`, TASK-225)

- If `contextCacheConfig.enabled == true`: configure Gemini context caching (`types.CachedContent`) for prompts exceeding `minTokens`.
- If `eventsCompactionConfig.enabled == true`: enable event compaction interval and window overlap.
- If `includeContents == "none"`: set `include_contents="none"` to omit full historical payloads in tool call context.

## Planners & Adaptive Reasoning (`plannerConfig`, TASK-226)

- If `plannerConfig.type == "built_in"`:
  * Use `from google.adk.planners import BuiltInPlanner` and configure `planner=BuiltInPlanner(thinking_config=types.ThinkingConfig(include_thoughts=True, thinking_budget=budget))`.
- If `plannerConfig.type == "plan_re_act"`:
  * Use `from google.adk.planners import PlanReActPlanner; planner=PlanReActPlanner()`.

## Custom Callbacks (`callbacks`, TASK-239)

- Generate `callbacks.py` defining lifecycle hooks (`before_agent_callback`, `after_agent_callback`, `before_model_callback`, `after_model_callback`, `before_tool_callback`, `after_tool_callback`).
- Wire callbacks directly into `Agent(..., before_agent_callback=..., after_tool_callback=...)`.

## Runner-Level Plugins (`plugins`, TASK-240)

- When plugins are enabled in workflow config:
  * Import from `google.adk.plugins`:
    `from google.adk.plugins import ReflectAndRetryToolPlugin, BigQueryAgentAnalyticsPlugin, ContextFilterPlugin, SaveFilesAsArtifactsPlugin, DebugLoggingPlugin, BasePlugin`
  * Instantiate configured plugins and pass to `Runner(..., plugins=[...])` or `App(..., plugins=[...])`.
