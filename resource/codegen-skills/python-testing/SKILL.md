---
name: python-testing
description: "Rules for test_agent.py: one test per blueprint scenario, hermetic offline mocking, Pydantic-v2-safe agent mocking via InMemoryRunner, typing imports, multiline with syntax, strict assertions, and optional live tests; required by the tests agent."
metadata:
  usedBy: [generator, reviewer]
  targets: [all]
---

# Python Test Suite (`test_agent.py`)

- `test_agent.py`: Comprehensive `pytest` test suite covering all test scenarios defined in trigger nodes with assertions against `root_agent`.

- `test_agent.py`: Comprehensive `pytest` test suite executing all workflow test scenarios and assertions against `root_agent`.

## Test Scenario Coverage & Mandatory Rules

13. `test_agent.py`: Pytest test suite covering all workflow test scenarios. When the workflow specification contains trigger nodes of type `tester` (or `triggerType == 'tester'`), you MUST inspect `config.testScenarios`, `config.testPrompts`, and `config.expectedOutput`. For EVERY defined test scenario (e.g. 'Test Case #1' with prompt 'Let\'s play a game.'), generate a dedicated pytest test function in `test_agent.py` that executes the scenario prompt against `root_agent` and asserts the expected output criteria.

- **Hermetic, Offline CI Execution**: All pytest functions executed as part of CI (such as cloudbuild.yaml step `pytest test_agent.py -v`) MUST test agent structure, tool logic, and mock external Vertex AI / Gemini LLM calls using `unittest.mock` or mock Runner event generators so that automated test suites pass offline without requiring ambient Google Cloud credentials or live network calls. When custom REST API or HTTP tools are tested in `test_agent.py`, mock external network requests (such as `httpx.Client.get`, `httpx.Client.post`, `httpx.get`, or `requests.get`) using `unittest.mock.patch` to guarantee hermetic execution in air-gapped CI runners without incurring DNS or connection timeouts.
- **Guardrail Shield, Loop & Conditional Delegate Mocking (CRITICAL PYDANTIC V2 & RUNNER RULE)**: `Agent` / `LlmAgent` / `BaseAgent` are Pydantic v2 `BaseModel` classes whose `__delattr__` raises `AttributeError: 'LlmAgent' object has no attribute 'run_async'` when `unittest.mock.patch.object(agent_instance, "run_async", ...)` exits its `with` block! NEVER call `patch.object(agent_instance, "run_async", ...)` on an `Agent` or `BaseAgent` instance, and NEVER call `patch.object(type(sub_agent), "run_async", ...)` (which patches `BaseAgent.run_async` and bypasses any root `BaseAgent` router/guardrail/circuit-breaker!). Instead, mock `LlmAgent._run_async_impl` with an ASYNC GENERATOR (`with patch.object(type(sub_agent), "_run_async_impl", new=mock_run):`, where `mock_run` contains `yield`). Furthermore, ALWAYS execute `root_agent` via `InMemoryRunner(agent=root_agent, app_name="test_app")` (`session = await runner.session_service.create_session(...)`, `async for event in runner.run_async(...)`) — NEVER call `root_agent.run_async(MagicMock())` with a `MagicMock` context (which crashes with `TypeError: object MagicMock can't be used in 'await' expression` when `BaseAgent` awaits `ctx.plugin_manager.run_before_agent_callback`). If unit-testing a custom `BaseAgent` subclass in isolation with a mock `ctx`, call `custom_agent._run_async_impl(ctx)` directly.
- **Model Mocking Pattern (CRITICAL — google-adk 2.x)**: ADK consumes agent runs and model calls with `async for`, so every mock MUST be an async generator (an `async def` that `yield`s). A plain `async def` that `return`s a value produces a coroutine and fails at runtime with `TypeError: 'async for' requires an object with __aiter__ method, got coroutine`. Use exactly this pattern for every scenario test:
  ```python
  from typing import Any, AsyncGenerator
  from unittest.mock import patch
  from google.adk.events import Event
  from google.adk.runners import InMemoryRunner
  from google.genai import types as genai_types

  async def mock_run(self, ctx) -> AsyncGenerator[Any, None]:
      yield Event(author=self.name, content=genai_types.Content(role="model", parts=[genai_types.Part.from_text(text="<expected output text>")]))

  with patch.object(type(root_agent), "_run_async_impl", new=mock_run):
      runner = InMemoryRunner(agent=root_agent, app_name="test_app")
      ...  # create_session + `async for event in runner.run_async(...)`
  ```
  NEVER patch `google.adk.models.google_llm.Gemini.generate_content_async` (or any model method) with a plain `async def` or an `AsyncMock(return_value=...)`.
- **External Tool & MCP Mocking**: When external tools (such as BigQuery MCP, REST APIs, or remote A2A endpoints) are invoked in `test_agent.py`, mock network calls (e.g. `patch("httpx.Client.post", ...)` or mocking the tool function directly) to ensure hermetic execution without network latency or timeout errors.
- **CRITICAL IMPORT RULE IN test_agent.py**:
  * NEVER import typing symbols (such as `AsyncGenerator`, `Generator`, `Any`, `Dict`, `List`, `Optional`, `Union`, `Callable`, `Tuple`) from `unittest.mock`! `unittest.mock` only provides `AsyncMock`, `MagicMock`, `patch`, and `Mock`.
  * ALWAYS import typing symbols directly from `typing` (`from typing import Any, AsyncGenerator, Dict, List, Optional, Union, Callable, Tuple`).
  * When using type annotations in `test_agent.py` (such as mock signatures `async def mock_run(ctx) -> AsyncGenerator[Any, None]:`), ALWAYS import `Any` alongside `AsyncGenerator` (`from typing import Any, AsyncGenerator, Dict, List, Optional`), or place `from __future__ import annotations` at the very top of `test_agent.py`. Omitting `Any` from typing imports when type annotations are evaluated causes an immediate runtime `NameError: name 'Any' is not defined` during pytest collection.
- **Python Syntax for Multiline `with` Statements**: When generating multi-context manager `with` statements in `test_agent.py` or other Python source files (such as multiple `patch.object(...)` calls), ALWAYS wrap the context expressions in enclosing parentheses: `with (\n    patch.object(...),\n    patch.object(...)\n):` or use explicit backslash line continuation (`\\`). Never emit an unparenthesized multiline `with` statement ending with a comma, as this triggers a fatal `SyntaxError: invalid syntax`.
- **Strict Test Assertions**: In `test_agent.py`, test assertions MUST strictly verify the exact `expectedOutput` or `expectedOutputPattern` specified in `testScenarios` (e.g., `assert 'LockbitC2' in final_response_text`). NEVER weaken or bypass assertions by appending fallback conditions such as `or len(final_response_text) > 0` or `or True`, which make test failures impossible.
- **Tool & Assertion Alignment (CRITICAL)**: When testing custom tools directly for a test scenario, ensure that the tool's returned dictionary explicitly contains the scenario's `expectedOutput` substring, and assert `expectedOutput in json.dumps(result)` (rather than asserting against a single dictionary key whose value might be `"ACTIVE"` instead of `"VIP"`).
- **Optional Live Integration Test (`RUN_LIVE_TESTS=1`)**: Also include a `@pytest.mark.skipif(os.getenv("RUN_LIVE_TESTS") != "1", reason="Set RUN_LIVE_TESTS=1 for live Vertex AI integration")` async test using `InMemoryRunner(app=agent.app)` to verify live end-to-end ADK execution when credentials are active.

> See also: `adk-graph-workflows` (section "10. Testing") for Workflow graph testing utilities, and the feature skills (`adk-custom-agents`, `adk-multi-agent-patterns`, `adk-a2a`, `adk-mcp`) for feature-specific mocking notes.
