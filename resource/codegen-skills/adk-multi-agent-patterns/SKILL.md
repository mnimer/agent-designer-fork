---
name: adk-multi-agent-patterns
description: "Multi-agent communication and patterns: shared state/transfer/AgentTool, evaluator-optimizer loop, debate & consensus, review & critique triad, agent-as-a-tool, and server-hosted Managed Agents; load when subAgentPattern is loop/debate/review_critique or agent-as-tool is used."
metadata:
  usedBy: [generator]
  targets: [all]
  preloadWhen: [multi_agent_patterns]
---

## 4. Multi-Agent Systems & Communication

### Communication Methods

1.  **Shared State**: Agents read/write `session.state`. Use `output_key` for convenience.

2.  **LLM Delegation**: Agent transfers control to a sub-agent based on reasoning.
    ```python
    coordinator = Agent(
        name="coordinator",
        instruction="Route to sales_agent for sales, support_agent for help.",
        sub_agents=[sales_agent, support_agent],
    )
    ```

3.  **AgentTool**: Invoke another agent as a tool (parent stays in control).
    ```python
    from google.adk.tools import AgentTool

    root = Agent(
        name="root",
        tools=[AgentTool(specialist_agent)],
    )
    ```

4.  **Task Delegation (ADK 2.0)**: Set `mode` on a sub-agent for structured, schema-typed delegation — the coordinator gets a `request_task_{name}` tool; the sub-agent returns typed output via the auto-injected `finish_task` tool.
    ```python
    from pydantic import BaseModel

    class ResearchOutput(BaseModel):
        summary: str

    researcher = Agent(
        name="researcher",
        model="gemini-3.8-flash",
        mode="task",                        # 'chat' (default) | 'task' | 'single_turn'
        output_schema=ResearchOutput,
        description="Researches a topic.",  # required for delegation
        instruction="Research the topic, then call finish_task.",
    )
    coordinator = Agent(name="coordinator", model="gemini-3.8-flash", sub_agents=[researcher])
    ```
    Modes: `task` (multi-turn, structured I/O) · `single_turn` (autonomous, no user turn). Sub-agents need a `description`; default I/O schemas (`goal`/`background` in, `result` out) are used if none set. Disabled inside graph `Workflow`s.

---

### Evaluator-Optimizer Loop Pattern (`subAgentPattern: "loop"`)

When an agent orchestrates sub-agents with `subAgentPattern: "loop"`:
1. **Topology & Orchestration**:
   - Uses `LoopAgent(name="...", sub_agents=[generator_agent, evaluator_agent], max_iterations=N)` from `google.adk.agents`.
   - **CRITICAL LOOP STATE INITIALIZATION & `{state_key?}` RULE**: On Iteration 1 of a `LoopAgent`, the generator agent runs *before* the evaluator agent has ever executed, so `evaluation_feedback` (and other `loopStateKeys`) do not yet exist in `session.state`!
     * You MUST use optional `{evaluation_feedback?}` and `{candidate_code?}` syntax (with a trailing `?`) inside `instruction="..."` strings — NEVER write bare `{evaluation_feedback}` or `{candidate_code}` without `?`, which raises `KeyError: "Context variable not found: \`evaluation_feedback\` in agent '...'"` on Iteration 1!
     * You MUST ALSO define and attach a `before_agent_callback` (e.g. `init_loop_state`) on the generator agent that initializes all `loopStateKeys` via `callback_context.state.setdefault("evaluation_feedback", "None (initial iteration)")`, `callback_context.state.setdefault("candidate_code", "")`, `callback_context.state.setdefault("iteration_index", 0)`, and `callback_context.state.setdefault("is_solution_accepted", False)`.
   - The generator agent creates or refines code/content and writes to state (e.g. `output_key="candidate_code"` or `output_key="draft"`). If `thinkingBudget` is configured (e.g. 2048), configure `generate_content_config=genai_types.GenerateContentConfig(temperature=..., thinking_config=genai_types.ThinkingConfig(thinking_budget=2048))`.
   - The evaluator agent audits candidate code against acceptance criteria (using `code_executor=BuiltInCodeExecutor()` if `code_execution` tool is attached) and writes structured review to `output_key="evaluation_feedback"` / `output_key="critique"`.
   - **Early Termination & Escalation**: If criteria pass or benchmark threshold is met on Iteration 1 (after the generator runs once and the evaluator calls its tool once), the evaluator (or `EscalationChecker`) MUST immediately yield `Event(author=self.name, actions=EventActions(escalate=True))` to break the loop right away so it does not wastefully repeat iterations 2..N.
     * **CRITICAL**: In `EscalationChecker`, NEVER write naive `"fail" not in feedback` checks, because passing benchmark summaries routinely say `"0 failures"` or `"without failure"`! Instead check for explicit failure indicators (`not any(neg in feedback for neg in ("not passed", "passed: false", '"passed": false', "status: fail"))`) when `"pass"` or `"optimal"` is present in `feedback`. The loop is guaranteed to terminate on Iteration 1 when passed, or when `max_iterations` is reached.

### Multi-Agent Debate & Consensus Pattern (`subAgentPattern: "debate"`, `debateConfig`)

When a workflow implements a debate topology:
1. **Topology & Roles**:
   - **Debater Agents (Pro & Con Advocates)**: Formulate contrasting perspectives or affirmative/counter arguments. When web search is enabled, each debater configures `GoogleSearchTool(bypass_multi_tools_limit=True)` and writes arguments to its dedicated state key (e.g. `output_key="pro_arguments"` and `output_key="con_arguments"`). Any reference to `{pro_arguments?}` or `{con_arguments?}` in `instruction` MUST include the trailing `?` optional marker.
   - **Debate Moderator & Arbiter / Consensus Judge**: Moderates multi-round structured debate turns up to `maxRounds` (e.g. 3), evaluates citations, and scores consensus convergence against `consensusThreshold` (e.g. 0.85).
   - **Consensus Resolution Synthesizer (`agentKind: "synthesizer"`)**: Reads accumulated arguments from session state (`{pro_arguments?}`, `{con_arguments?}`) and synthesizes an evidence-backed final resolution.
2. **Implementation in ADK**:
   - Orchestrate debaters and moderator in a round loop or sequential pipeline:
     ```python
     debate_stage = ParallelAgent(
         name="debate_perspectives",
         sub_agents=[pro_advocate, con_advocate]
     )
     debate_rounds_loop = LoopAgent(
         name="debate_rounds_loop",
         sub_agents=[debate_stage, debate_moderator_arbiter],
         max_iterations=3  # from debateConfig.maxRounds
     )
     root_agent = SequentialAgent(
         name="policy_debate_system",
         sub_agents=[debate_rounds_loop, consensus_resolution]
     )
     ```
     Or compose as `SequentialAgent(name="debate_system", sub_agents=[ParallelAgent(name="debate_arguments", sub_agents=[pro_advocate, con_advocate]), debate_moderator_arbiter, consensus_resolution])`.

### Review & Critique Triad Pattern (`subAgentPattern: "review_critique"`)

When a workflow implements a review & critique triad:
1. **Topology**:
   - Three-stage sequential pipeline (`SequentialAgent(sub_agents=[drafter_agent, critic_agent, reviser_agent])`):
     1. **Drafter**: Generates baseline content and writes to `output_key="initial_draft"`.
     2. **Critic**: Analyzes the draft for errors and improvements, writing to `output_key="critique"`.
     3. **Reviser / Synthesizer**: Ingests both `{initial_draft?}` and `{critique?}` from session state and produces the final polished deliverable: `output_key="final_output"`.

### Agent-as-a-Tool Pattern (`builtin_agent_as_tool` / `agent_as_tool`)

When an agent exposes another agent as a callable function tool:
1. **ADK Implementation**:
   - Prefer direct instantiation using `google.adk.tools.agent_tool.AgentTool`:
     ```python
     from google.adk.tools.agent_tool import AgentTool
     generate_sql_query = AgentTool(agent=nl2sql_expert_agent)
     ```
   - If wrapping in a custom function tool, do NOT invoke synchronous `runner.run(question)` because Google ADK's `Runner` does not implement a synchronous `.run()` method (it will raise an `AttributeError`). Instead, declare an async tool function that awaits `runner.run_async`:
     ```python
     async def generate_sql_query(question: str) -> str:
         """Translates natural language questions into performant BigQuery SQL and explains query plan."""
         runner = Runner(agent=nl2sql_expert_agent)
         result = await runner.run_async(question)
         return str(result)
     ```
   - Wire `generate_sql_query` directly into the calling coordinator agent's `tools`:
     ```python
     coordinator_agent = Agent(
         name="coordinator_agent",
         model="gemini-3.8-flash",
         instruction="Decompose user requests and delegate specialized SQL queries using generate_sql_query.",
         tools=[generate_sql_query]
     )
     ```
   - If the calling agent also connects to a Google Cloud Remote MCP Server (e.g. BigQuery Remote MCP), instantiate `McpToolset` with `StreamableHTTPConnectionParams` and `header_provider` with `fetch_id_token(Request(), MCP_SERVER_URL)`, and include both tools:
     ```python
     tools=[bigquery_mcp, generate_sql_query]
     ```
   - In `test_agent.py`, mock `generate_sql_query` or the sub-agent's `run_async` so that test assertions evaluate offline without live database or cloud network latency.

---

## 13. Managed Agents (server-hosted, first-party)

> **Requires ADK ≥ 2.4.0.** `ManagedAgent` connects to Google's first-party, server-hosted agents (e.g. the Antigravity agent) via the Managed Agents API: reasoning, tools, and execution all run in Google's managed environment, so there's no local sandbox to provision. It's a `BaseAgent`, so a standard `Runner` runs it like any other agent.

### When to use it

- **Managed agent** — powerful out-of-the-box capabilities (server-side web search, code execution) without operating the environment yourself. Trade-off: predefined server-side toolset, no client-side tools, runs only in the managed environment.
- **`LlmAgent` (§2)** — when you need control over the model, instructions, custom/MCP tools, or where execution happens.

### Setup

Two backends — satisfy the prerequisites for whichever you use, then supply an `agent_id`:
- **Gemini API:** set `GEMINI_API_KEY`. Use an out-of-the-box id (e.g. `antigravity-preview-05-2026`) or create your own (see below).
- **Agent Platform (GEAP, formerly Vertex):** authenticate with ADC (`gcloud auth application-default login`). The Managed Agents API is served only from the `global` location, and `ManagedAgent` enforces it.

### Create & use

```python
from google import genai
from google.adk.agents import ManagedAgent
from google.adk.tools import google_search

# Create your own agent (google-genai SDK, NOT ADK — ManagedAgent has no create()).
# Get-or-create keeps it idempotent; or skip entirely and use an out-of-the-box id like "antigravity-preview-05-2026".
client = genai.Client()
if "researcher" not in {a.id for a in (client.agents.list().agents or [])}:  # id must be unique, no gemini-/google-/... prefixes
    client.agents.create(
        id="researcher", base_agent="antigravity-preview-05-2026",
        system_instruction="Answer with fresh, grounded info from the web.",
    )

# Connect + use. A ManagedAgent is a BaseAgent: set it as root_agent, drop it in a
# workflow, or wrap it as AgentTool. Only server-side tools are allowed.
managed = ManagedAgent(
    name="researcher", agent_id="researcher",
    environment={"type": "remote"},        # tools run in the managed sandbox
    tools=[google_search],                 # or types.Tool(code_execution=types.ToolCodeExecution())
)
```

### Limits

- **Client-side tools raise `NotImplementedError`:** Python functions/callables and client-side MCP (`McpToolset`). Server-side tools work — ADK built-ins, raw `types.Tool` configs, and server-side remote MCP via `RemoteMcpServer`.
- **Backends differ:** the Gemini API and GEAP behave slightly differently today — test against your target backend.

Docs: [Gemini API agents](https://ai.google.dev/gemini-api/docs/agents) · [Agent Platform managed agents](https://docs.cloud.google.com/gemini-enterprise-agent-platform/build/managed-agents) · [Interactions API](https://ai.google.dev/gemini-api/docs/interactions-overview) · [building custom agents](https://ai.google.dev/gemini-api/docs/custom-agents). Samples: [basic](https://github.com/google/adk-python/tree/main/contributing/samples/managed_agent/basic), [code execution](https://github.com/google/adk-python/tree/main/contributing/samples/managed_agent/code_execution).

---
