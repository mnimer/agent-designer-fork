---
name: adk-custom-agents
description: "Custom BaseAgent subclasses for control-flow nodes: router, synthesizer, HITL approval gate, fallback/circuit breaker, and guardrail/security shield; load when any node has agentKind router, synthesizer, hitl, fallback, or guardrail."
metadata:
  usedBy: [generator, reviewer]
  targets: [all]
  preloadWhen: [custom_agents]
---

## 5. Building Custom Agents (`BaseAgent`)

For custom orchestration logic beyond workflow agents.
- **CRITICAL PYDANTIC V2 `BaseAgent` SUBCLASS RULE**:
  `BaseAgent` in `google.adk.agents` inherits from Pydantic v2 `BaseModel` with `extra="forbid"`.
  Therefore, EVERY custom `BaseAgent` subclass (`ConditionalRouter`, `<Name>Router`, `<GateName>ApprovalGate`, `<Name>CircuitBreaker`, `<Name>GuardrailShield`) MUST:
  1. Import `from pydantic import ConfigDict` and declare `model_config = ConfigDict(arbitrary_types_allowed=True, extra="allow")` on the class body.
  2. Inside `__init__(self, ...)`, resolve any local variables first, call `super().__init__(name=name, sub_agents=...)` **FIRST**, and ONLY assign `self.<attr> = ...` **AFTER** `super().__init__(...)` has completed!
  - Setting `self.<attr> = ...` without `extra="allow"` raises `ValueError: "<Class>" object has no field "<attr>"` at startup.
  - Setting `self.<attr> = ...` *before* `super().__init__(...)` raises `AttributeError: '<Class>' object has no attribute '__pydantic_extra__'` at startup.

```python
from google.adk.agents import BaseAgent
from google.adk.agents.invocation_context import InvocationContext
from google.adk.events import Event, EventActions
from pydantic import ConfigDict
from typing import AsyncGenerator

class ConditionalRouter(BaseAgent):
    model_config = ConfigDict(arbitrary_types_allowed=True, extra="allow")

    async def _run_async_impl(
        self, ctx: InvocationContext
    ) -> AsyncGenerator[Event, None]:
        # Read state
        user_type = ctx.session.state.get("user_type", "regular")

        # Custom routing logic
        if user_type == "premium":
            agent = self.premium_agent
        else:
            agent = self.regular_agent

        # Run selected agent
        async for event in agent.run_async(ctx):
            yield event

class EscalationChecker(BaseAgent):
    """Stops a LoopAgent when condition is met."""
    model_config = ConfigDict(arbitrary_types_allowed=True, extra="allow")

    async def _run_async_impl(
        self, ctx: InvocationContext
    ) -> AsyncGenerator[Event, None]:
        result = ctx.session.state.get("evaluation")
        if result and result.get("grade") == "pass":
            yield Event(author=self.name, actions=EventActions(escalate=True))
        else:
            yield Event(author=self.name)
```

### Visual Router Agents (`agentKind: "router"`)

When a workflow node has `agentKind: "router"`, compile it into a custom `BaseAgent` subclass that implements dynamic routing across its configured branches (`routerConfig.branches`):
1. **Evaluation Modes**:
   - `boolean_expression`: Evaluates branch conditions (`conditionExpression`) against session state (e.g. `state.status == 'passed'`).
   - `numeric_threshold`: Compares a numeric metric (`routerConfig.expressionVariable`, e.g. `score`) against `thresholdValue` (e.g. `score >= 0.8`).
   - `llm_classifier`: Evaluates user query intent against branch category descriptions using `gemini-3.7-flash` or keyword classification.
2. **Dynamic Branch Dispatching & Pydantic v2 Initialization**:
   - Declare `model_config = ConfigDict(arbitrary_types_allowed=True, extra="allow")` on the router class, and inside `__init__`, filter `sub_agents = [a for a in [...] if a is not None and getattr(a, "parent_agent", None) is None]` and call `super().__init__(name=name, sub_agents=sub_agents)` BEFORE assigning `self.branches` or any `self.<branch>_agent` attributes! (Filtering `getattr(a, "parent_agent", None) is None` prevents Pydantic `ValueError: Agent already has a parent agent` if the router class is instantiated multiple times in tests.)
   - The router class maps branch IDs to target candidate agent instances: `self.branches = { "branch_id": agent_instance }`.
   - In `_run_async_impl(self, ctx: InvocationContext)`, the router evaluates the condition, looks up the target agent, and delegates execution via:
     ```python
     selected_agent = self.branches.get(selected_branch_id, self.default_agent)
     if selected_agent:
         async for event in selected_agent.run_async(ctx):
             yield event
     ```
   - Always route to the designated fallback branch (`isDefault: true`) if no explicit conditions match.
   - In custom `BaseAgent` subclass constructors (`__init__`), assign instance attributes strictly from the incoming constructor parameters rather than referencing module-level global instances (e.g., `self.wealth_agent = wealth_agent` instead of referencing the global `wealth_advisor`), enabling clean mock injection during testing.
3. **Structured Input Schema Support**:
   - When `inputSchema` is enabled on the router node, parse and validate incoming session state or payload into `<RouterName>Input.model_validate(...)`.
   - Condition expressions evaluate directly against typed input fields (e.g. `input.urgency > 3`, `input.category == 'billing'`).

### Synthesizer Agents (`agentKind: "synthesizer"`)

When a workflow node has `agentKind: "synthesizer"` (or is configured with `synthesizerConfig` / `structuredOutput`):
1. **Role & Architectural Principle**:
   - Synthesizers aggregate outputs from preceding upstream agents stored in session state (`ctx.session.state`).
   - **CRITICAL ZERO-TOOLS RULE**: In Vertex AI Gemini, `tools` CANNOT be combined with controlled generation (`output_schema`) on the same agent. Therefore, Synthesizer agents MUST ALWAYS have `tools=[]` (or omit the tools argument). Upstream worker/research agents use tools and write intermediate findings to session state (`output_key="..."`); the synthesizer agent reads from state and produces the final structured schema.
2. **Pydantic v2 Schema Generation**:
   - Define a Pydantic v2 `BaseModel` class at top-level before agent instantiation:
     ```python
     from pydantic import BaseModel, Field
     from typing import List, Optional

     class <SynthesizerName>Output(BaseModel):
         summary: str = Field(..., description="Executive summary of aggregated findings")
         key_points: List[str] = Field(default_factory=list, description="Key takeaways")
         confidence_score: Optional[float] = Field(default=None, description="Confidence metric")
     ```
3. **Agent Instantiation**:
   - Instantiate directly via `Agent`:
     ```python
     synthesizer_agent = Agent(
         name="<synthesizer_identifier>",
         model="gemini-3.8-flash",
         instruction="Consolidate and synthesize upstream state outputs into the structured output schema.",
         output_schema=<SynthesizerName>Output,
         tools=[]
     )
     ```
   - Wire as the final agent in a `SequentialAgent` pipeline following parallel or sequential worker agents.

### Human-in-the-Loop (HITL) Approval Gate Agents (`agentKind: "hitl"`)

When a node has `agentKind: "hitl"` (Approval Gate):
1. **Role & Architectural Principle**:
   - Implements a human checkpoint evaluating approval state before high-stakes operations (e.g. commercial loan approval, large fund disbursement, destructive changes).
   - Evaluates `approvalCondition` from state (e.g. `state.get("loan_amount", 0) > 100000 or state.get("risk_tier") == "ELEVATED"`).
   - If human approval is required and neither `approved` in state nor an interactive response is found, pauses workflow execution and requests human intervention (`RequestInput` or `request_input` tool).
   - When human provides approval or application qualifies for auto-approval, dispatches `approved_agent` (e.g. disbursement). When rejected or timed out, dispatches `rejected_agent` (e.g. rejection notice).
2. **Implementation as `BaseAgent` Subclass**:
   ```python
   from google.adk.events.request_input import RequestInput
   from pydantic import ConfigDict

   class <GateName>ApprovalGate(BaseAgent):
       """HITL approval gate evaluating human approval before dispatching downstream agents."""
       model_config = ConfigDict(arbitrary_types_allowed=True, extra="allow")

       def __init__(
           self,
           name: str,
           approved_agent: Optional[Any] = None,
           rejected_agent: Optional[Any] = None,
           approval_condition: Optional[str] = None,
           request_prompt: Optional[str] = None,
           timeout_hours: int = 48,
           auto_reject_on_timeout: bool = True,
           approver_roles: Optional[List[str]] = None,
           tools: Optional[List[Any]] = None,
       ):
           children = [a for a in (approved_agent, rejected_agent) if a is not None]
           super().__init__(name=name, sub_agents=children)
           self.approved_agent = approved_agent
           self.rejected_agent = rejected_agent
           self.approval_condition = approval_condition
           self.request_prompt = request_prompt
           self.timeout_hours = timeout_hours
           self.auto_reject_on_timeout = auto_reject_on_timeout
           self.approver_roles = approver_roles or []
           self.tools = tools or []

       async def _run_async_impl(
           self, ctx: InvocationContext
       ) -> AsyncGenerator[Event, None]:
           state = ctx.session.state

           # Check for human resume inputs
           resume_inputs = getattr(ctx, "resume_inputs", {}) or {}
           interrupt_key = f"{self.name}_approval"
           if interrupt_key in resume_inputs:
               decision = str(resume_inputs[interrupt_key]).strip().lower()
               is_approved = decision in ("approve", "approved", "yes", "true")
               state["approved"] = is_approved
               state["hitl_status"] = "approved" if is_approved else "rejected"
           elif "approved" in state:
               is_approved = bool(state["approved"])
           elif state.get("hitl_status") in ("approved", "rejected"):
               is_approved = state.get("hitl_status") == "approved"
           else:
               # Evaluate approval condition
               requires_approval = False
               if self.approval_condition:
                   try:
                       requires_approval = bool(eval(self.approval_condition, {}, {"state": state, "input": state}))
                   except Exception:
                       requires_approval = True

               if requires_approval:
                   prompt_msg = self.request_prompt or f"Manual underwriter approval required for operation in '{self.name}'."
                   yield RequestInput(interrupt_id=interrupt_key, message=prompt_msg)
                   return
               else:
                   is_approved = True
                   state["approved"] = True
                   state["hitl_status"] = "approved"

           target = self.approved_agent if is_approved else self.rejected_agent
           if target is not None:
               async for event in target.run_async(ctx):
                   yield event
           else:
               verdict_str = "APPROVED" if is_approved else "REJECTED"
               yield Event(
                   source=self.name,
                   content=f"HITL Gate '{self.name}' resolved with {verdict_str}, proceeding with workflow."
               )
   ```
3. **Instantiation**:
   - Instantiate with `approved_agent` and `rejected_agent` targeting candidate agents.

### Fallback & Circuit Breaker Agents (`agentKind: "fallback"`)

When a node has `agentKind: "fallback"`:
1. **Role & Resilience Strategy**:
   - Wraps a primary agent execution with automated error interception, retry with exponential backoff, and circuit breaker failover.
   - If the primary agent throws an exception (e.g. rate limits, 503, RESOURCE_EXHAUSTED, DEADLINE_EXCEEDED, UNAVAILABLE), execution automatically retries with exponential backoff up to `max_retries` before switching to a secondary fallback agent without crashing the workflow.
   - If the fallback agent is also unavailable or fails, returns a graceful static degradation response message.
2. **Implementation as `BaseAgent` Subclass**:
   ```python
   from pydantic import ConfigDict

   class <Name>CircuitBreaker(BaseAgent):
       """Circuit breaker and resilience fallback wrapper with exponential backoff."""
       model_config = ConfigDict(arbitrary_types_allowed=True, extra="allow")

       def __init__(
           self,
           name: str,
           primary_agent: Optional[Any] = None,
           fallback_agent: Optional[Any] = None,
           max_retries: int = 3,
           retry_delay_seconds: float = 2.0,
           caught_error_codes: Optional[List[str]] = None,
           static_fallback_message: Optional[str] = None,
           tools: Optional[List[Any]] = None,
       ):
           super().__init__(name=name)
           self.primary_agent = primary_agent
           self.fallback_agent = fallback_agent
           self.max_retries = max_retries
           self.retry_delay_seconds = retry_delay_seconds
           self.caught_error_codes = caught_error_codes or ["RESOURCE_EXHAUSTED", "503", "DEADLINE_EXCEEDED", "QUOTA_EXCEEDED", "UNAVAILABLE"]
           self.static_fallback_message = static_fallback_message or "Live services currently offline. Advisory generated using fallback model."
           self.tools = tools or []

       async def _run_async_impl(
           self, ctx: InvocationContext
       ) -> AsyncGenerator[Event, None]:
           for attempt in range(self.max_retries):
               try:
                   if self.primary_agent is not None:
                       async for event in self.primary_agent.run_async(ctx):
                           yield event
                       return
                   break
               except Exception as exc:
                   err_str = str(exc)
                   is_caught = any(code in err_str for code in self.caught_error_codes)
                   if is_caught and attempt < self.max_retries - 1:
                       delay = self.retry_delay_seconds * (2 ** attempt)
                       logger.warning(f"Circuit Breaker '{self.name}' attempt {attempt + 1} caught {exc}. Retrying in {delay}s...")
                       await asyncio.sleep(delay)
                       continue
                   logger.warning(f"Circuit Breaker '{self.name}' primary failure: {exc}. Switching to fallback agent.")
                   break

           if self.fallback_agent is not None:
               try:
                   async for event in self.fallback_agent.run_async(ctx):
                       yield event
                   return
               except Exception as fb_exc:
                   logger.error(f"Fallback agent execution failed: {fb_exc}")

           yield Event(
               source=self.name,
               content=self.static_fallback_message
           )
   ```

### Guardrail & Security Shield Agents (`agentKind: "guardrail"`)

When a node has `agentKind: "guardrail"`:
1. **Role & Safety Gating**:
   - Inspects user input or agent intermediate outputs against security policies (prompt injection, PII leak, secrets, toxic content, forbidden topics) before routing to the protected core agent, redacting sensitive data, or escalating to a blocker/audit agent.
   - **Ingress Guardrails (`direction: "ingress"`)**:
     * Inspects incoming user messages or events against `blocked_keywords` (e.g. "bypass system instructions", "ignore previous prompt", "dump memory", "sudo exec") and `regex_patterns` (e.g. SSN `\b\d{3}-\d{2}-\d{4}\b`, MRN `\bMRN-[A-Z]{2}\d{6}\b`, DEA `\b[A-Z]{2}\d{7}\b`).
     * On violation: if `action_on_violation == "block"`, routes execution to `block_agent` (e.g. `security_audit_responder`) or yields an `Event` with `custom_violation_message` (e.g. "Security violation: Input contained unauthorized clinical identifiers or unsafe prompt injection instructions.").
     * If clean: routes execution to `pass_agent` (e.g. `clinical_diagnostic_assistant`).
   - **Egress Guardrails (`direction: "egress"`)**:
     * Sanitizes/redacts outgoing agent responses before returning to the caller.
     * When `action_on_violation == "redact"`, replaces all matches of `regex_patterns` with `redaction_token` (e.g. `"[REDACTED_PATIENT_IDENTIFIER]"` via `re.sub`).
2. **Implementation as `BaseAgent` Subclass**:
   ```python
   import re
   from typing import Any, AsyncGenerator, Dict, List, Optional
   from google.adk.agents import BaseAgent
   from google.adk.events import Event, EventActions
   from google.genai import types
   from pydantic import ConfigDict

   class <Name>GuardrailShield(BaseAgent):
       """Security policy filter and input/output guardrail."""
       model_config = ConfigDict(arbitrary_types_allowed=True, extra="allow")

       def __init__(
           self,
           name: str,
           direction: str = "ingress",
           pass_agent: Optional[Any] = None,
           block_agent: Optional[Any] = None,
           policy_rules: Optional[List[str]] = None,
           regex_patterns: Optional[List[Dict[str, str]]] = None,
           blocked_keywords: Optional[List[str]] = None,
           action_on_violation: str = "block",
           custom_violation_message: str = "Request blocked by security guardrail policy.",
           redaction_token: str = "[REDACTED]",
           tools: Optional[List[Any]] = None,
       ):
           super().__init__(name=name)
           self.direction = direction
           self.pass_agent = pass_agent
           self.block_agent = block_agent
           self.policy_rules = policy_rules or []
           self.regex_patterns = regex_patterns or []
           self.blocked_keywords = blocked_keywords or []
           self.action_on_violation = action_on_violation
           self.custom_violation_message = custom_violation_message
           self.redaction_token = redaction_token
           self.tools = tools or []

       def _check_text_violations(self, text: str) -> bool:
           text_lower = text.lower()
           for kw in self.blocked_keywords:
               if kw.lower() in text_lower:
                   return True
           for pat_obj in self.regex_patterns:
               pattern = pat_obj.get("pattern", "") if isinstance(pat_obj, dict) else str(pat_obj)
               if pattern and re.search(pattern, text, flags=re.IGNORECASE):
                   return True
           return False

       def _redact_text(self, text: str) -> str:
           redacted = text
           for pat_obj in self.regex_patterns:
               pattern = pat_obj.get("pattern", "") if isinstance(pat_obj, dict) else str(pat_obj)
               if pattern:
                   redacted = re.sub(pattern, self.redaction_token, redacted, flags=re.IGNORECASE)
           return redacted

       async def _run_async_impl(
           self, ctx: Any
       ) -> AsyncGenerator[Event, None]:
           # Extract input text from context or session events
           input_text = ""
           if hasattr(ctx, "session") and hasattr(ctx.session, "events"):
               for ev in reversed(ctx.session.events):
                   if hasattr(ev, "content") and ev.content:
                       input_text = str(ev.content)
                       break
           elif hasattr(ctx, "user_content"):
               input_text = str(ctx.user_content)

           if self.direction == "ingress":
               has_violation = self._check_text_violations(input_text)
               if has_violation:
                   if self.block_agent is not None:
                       async for event in self.block_agent.run_async(ctx):
                           yield event
                   else:
                       yield Event(
                           author=self.name,
                           content=types.Content(
                               role="model",
                               parts=[types.Part.from_text(text=self.custom_violation_message)]
                           )
                       )
                   return

               # Clean request: pass to protected core agent
               if self.pass_agent is not None:
                   async for event in self.pass_agent.run_async(ctx):
                       yield event
           else:
               # Egress redaction
               redacted_text = self._redact_text(input_text)
               yield Event(
                   author=self.name,
                   content=types.Content(
                       role="model",
                       parts=[types.Part.from_text(text=redacted_text)]
                   )
               )
   ```
