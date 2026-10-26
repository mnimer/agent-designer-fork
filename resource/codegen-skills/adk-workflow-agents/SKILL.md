---
name: adk-workflow-agents
description: "Hierarchical orchestration with SequentialAgent, ParallelAgent, LoopAgent and coordinators: parent subAgentPattern authority rules, leaf nodes, N-layer recursion, and react-flow .agent handle/edge interpretation; load whenever the blueprint has sub-agents."
metadata:
  usedBy: [generator, reviewer]
  targets: [all]
---

# ADK Workflow Agents & Hierarchical Orchestration

3. **Multi-Agent & Hierarchical Orchestration (Recursive Across N-Layers)**:
   - You MUST inspect ALL nodes in the provided workflow specification JSON (including all `agent` and `trigger` nodes) and all connections in `edges` (or `data.subAgents`).
   - **Hierarchical Parent Authority Rule (CRITICAL & MANDATORY)**:
     Every orchestration decision MUST be based on the PARENT agent's properties. In any agent hierarchy (whether 2, 3, 4, or 5+ layers deep):
     1. **The Parent's `subAgentPattern` Exclusively Governs Its Immediate Children**:
        * **Sequential (`subAgentPattern: "sequential"` / `"iterative_refinement"`)**:
          The parent MUST orchestrate its child sub-agents in a strict sequence:
          `SequentialAgent(name="...", sub_agents=[child_1, child_2, ..., synthesizer])`.
          **DO NOT insert an intermediate `ParallelAgent`!** Even if child nodes have `"subAgentPattern": "parallel"` or child elements have `"delegationType": "parallel"`, the parent's `subAgentPattern: "sequential"` strictly controls execution.
        * **Parallel (`subAgentPattern: "parallel"` / `"broadcast"`)**:
          The parent runs its child sub-agents concurrently:
          `SequentialAgent(sub_agents=[ParallelAgent(name="parallel_workers", sub_agents=[child_1, child_2, ...]), synthesizer])`.
        * **Loop (`subAgentPattern: "loop"` / `"evaluator_optimizer"`)**:
          The parent runs its child sub-agents iteratively in a `LoopAgent`:
          `root_agent = LoopAgent(name="...", sub_agents=[generator_agent, evaluator_agent, escalation_checker], max_iterations=4)`.
          **CRITICAL**: DO NOT use `ParallelAgent`, and DO NOT invent an extra downstream `synthesizer` / `final_synthesizer` LLM agent unless the workflow JSON explicitly contains a separate synthesizer agent node! Adding an unrequested synthesizer node adds an unnecessary extra LLM round-trip after the loop terminates.
        * **Review & Critique Triad (`subAgentPattern: "review_critique"`)**:
          The parent orchestrates a 3-agent sequential pipeline without loops:
          `SequentialAgent(name="...", sub_agents=[drafter_agent, critic_agent, reviser_agent])`.
          The drafter (e.g. `contract_drafting_author`) generates baseline content and writes to `output_key="initial_draft"`. The critic (e.g. `adversarial_compliance_critic`) analyzes the draft against compliance rubrics and writes feedback to `output_key="critique_rubric"`. The reviser/editor (e.g. `final_polish_editor`, strictly without tools to allow structured schema) consumes state keys `{initial_draft?}` and `{critique_rubric?}` to emit the finalized output conforming to `output_schema`.
        * **Coordinator (`subAgentPattern: "coordinator"` / `"hierarchical_decomposition"`)**:
          The parent acts as an LLM coordinator delegating to its sub-agents:
          `Agent(name="...", model="gemini-3.8-flash", sub_agents=[child_1, child_2, ...], output_schema=ResponseSchema)`. DO NOT use `ParallelAgent` or `SequentialAgent` as root, and NEVER instantiate an unused/orphaned `ParallelAgent` or `SequentialAgent` variable that is detached from `root_agent`. Every instantiated agent in `agent.py` must be wired into the active `root_agent` hierarchy.
     2. **Leaf Nodes are Plain Agents (Ignore their `subAgentPattern`)**:
        * If an agent node has NO sub-agents (`subAgents` is empty `[]` or omitted), its own `subAgentPattern` MUST BE COMPLETELY IGNORED. A leaf node is always a standard `Agent(...)` with its own instructions, tools, and `output_schema` / `output_key`. It is NEVER an orchestrator and MUST NOT be wrapped in a `ParallelAgent` or `SequentialAgent`.
     3. **Ignore Legacy `delegationType` in Child Objects**:
        * Always use the parent node's top-level `subAgentPattern` as the single source of truth. Any per-item `delegationType` inside child objects in `subAgents: [...]` is secondary and MUST NOT override the parent's `subAgentPattern`.
     4. **Recursive Composition Across N-Layers (2, 3, 4, 5+ Tiers Deep)**:
        * When a child agent itself has its own connected `subAgents: [...]`, that child is an intermediate parent. Its OWN `subAgentPattern` dictates how its grandchildren are orchestrated.
        * Always construct the hierarchy bottom-up: instantiate leaf `Agent`s first, compose them into intermediate layer orchestrators according to each intermediate parent's `subAgentPattern`, and finally assemble the root orchestrator as `root_agent`.
     5. **React Flow (`.agent`) Diagram Graph & Handle Interpretation**:
        * **Trigger-to-Root Connections**:
          - **Test Suite Trigger Node (`tester` / Test Suite)**: ALWAYS connects from `sourceHandle: "trigger_out_right"` (Right handle) to the Root Agent's `targetHandle: "input_left"` (Left handle). Test Suite nodes represent evaluation suites and test prompts, positioned to the left of the Root Agent.
          - **Runtime Inbound Triggers (`chat`, `webhook`, `eventarc`, `cron`, `pubsub`)**: Connect from `sourceHandle: "trigger_out_bottom"` (Bottom handle) to the Root Agent's `targetHandle: "input"` (Top handle). Triggers represent inbound invocation stimuli, not sub-agents.
        * **Agent-to-SubAgent Delegation (`output` -> `input`)**: Standard delegation flows from parent `sourceHandle: "output"` to child `targetHandle: "input"`. These edges wire the target agent into the parent agent's `sub_agents=[...]` list.
        * **Control-Flow Source Handles**:
          - Router (`agentKind: "router"`): `sourceHandle` matches branch ID (`branch_if_1`, `branch_else`). Routes to branch target agents conditionally.
          - Approval Gate / HITL (`agentKind: "hitl"`): `sourceHandle` must be `"approved"` or `"rejected"`.
          - Guardrail Shield (`agentKind: "guardrail"`): `sourceHandle` must be `"pass"` or `"block"`.
          - Fallback / Circuit Breaker (`agentKind: "fallback"`): `sourceHandle` must be `"primary"` or `"fallback"`.
        * **Semantic Edge Strokes in `.agent`**:
          - Standard Agent / Sub-Agent Delegation: Blue (`#3b82f6`)
          - Inbound Triggers: Amber (`#f59e0b`), dashed (`strokeDasharray: "5 5"`)
          - Router Conditional Branches: Purple (`#a855f7`)
          - HITL Approved / Guardrail Pass: Green / Teal (`#10b981` / `#14b8a6`)
          - HITL Rejected / Guardrail Block / Fallback Recovery: Red / Rose (`#f43f5e`)

## Single Agent, Coordinator & Graph Workflows

- Single Agent or Multi-Agent Coordinator:
  * For single agent workflows, define `root_agent = Agent(name=..., model=..., instruction=..., tools=[...])`.
  * For hierarchical delegation, instantiate child `Agent(...)` instances first, then wire them into the parent's `sub_agents=[...]`.
- Graph Workflow with Routing Edges:
  * When workflow nodes are connected via conditional or routing edges, use Google ADK's `Workflow` primitive defining explicit state transition tuples `(from_node, to_node, condition)`.

## 3. Orchestration with Workflow Agents

Workflow agents provide deterministic control flow without LLM orchestration.

> These are `BaseAgent`-family composites (`SequentialAgent`, `ParallelAgent`, `LoopAgent`). For the new graph-based Workflow API introduced in ADK 2.0, see `references/adk-workflows.md`.

### SequentialAgent

Executes sub-agents in order. State changes propagate to subsequent agents.

```python
from google.adk.agents import SequentialAgent, Agent

summarizer = Agent(
    name="summarizer",
    model="gemini-3.8-flash",
    instruction="Summarize the input.",
    output_key="summary"
)

question_gen = Agent(
    name="question_generator",
    model="gemini-3.8-flash",
    instruction="Generate questions based on: {summary?}"
)

pipeline = SequentialAgent(
    name="pipeline",
    sub_agents=[summarizer, question_gen],
)
```

### ParallelAgent

Executes sub-agents concurrently. Use distinct `output_key`s to avoid race conditions.

```python
from google.adk.agents import ParallelAgent, SequentialAgent, Agent

fetch_a = Agent(name="fetch_a", ..., output_key="data_a")
fetch_b = Agent(name="fetch_b", ..., output_key="data_b")

merger = Agent(
    name="merger",
    instruction="Combine data_a: {data_a?} and data_b: {data_b?}"
)

pipeline = SequentialAgent(
    name="full_pipeline",
    sub_agents=[
        ParallelAgent(name="fetchers", sub_agents=[fetch_a, fetch_b]),
        merger
    ]
)
```

### LoopAgent

Repeats sub-agents until `max_iterations` or an event with `escalate=True`.

```python
from google.adk.agents import LoopAgent

refinement_loop = LoopAgent(
    name="refinement_loop",
    sub_agents=[evaluator, refiner, escalation_checker],
    max_iterations=5,
)
```

For a production LoopAgent with EscalationChecker, BuiltInPlanner, and grounding citations, look it up in the topic index in `references/samples.md`.

---
