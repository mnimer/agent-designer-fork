---
name: adk-a2ui
description: "A2UI rich UI generation: a2ui_components.py and a2ui_adaptor.py, the canonical v0.9.1 component catalog, tool-level surface emission, token budget, and the a2ui before_model_callback; load when any agent has a2uiConfig.enabled."
metadata:
  usedBy: [generator]
  targets: [all]
  preloadWhen: [a2ui]
---

# A2UI (Agent-to-User Interface)

### A2UI

Agents can return declarative UI via [a2ui](https://github.com/google/A2UI) (cards, forms, charts; rendered client-side over A2A) instead of plain text. Public preview; current release v0.9.1 (v1.0 release candidate). Docs: https://github.com/google/A2UI/tree/main/docs · ADK guide: https://adk.dev/integrations/a2ui/index.md

```python
# pip install a2ui-agent-sdk
from a2ui.core.schema.manager import A2uiSchemaManager
from a2ui.basic_catalog.provider import BasicCatalog
from a2ui.a2a import create_a2ui_part, parse_response_to_parts

# 1. Build the system prompt from a component catalog
manager = A2uiSchemaManager(...)        # loads catalog(s) + few-shot examples
instruction = manager.generate_system_prompt(...)

# 2. Use it as the agent instruction
root_agent = Agent(name="ui_agent", model="gemini-3.8-flash", instruction=instruction)

# 3. Validate the model's JSON output, then wrap as an A2A DataPart
#    (MIME application/a2ui+json) via a2ui.a2a before streaming to the client.
```

Runnable samples: https://github.com/google/A2UI/tree/main/samples/agent/adk

---

## A2UI Integration (`a2uiConfig`, TASK-221)

- If an agent node (root agent or any sub-agent) defines `a2uiConfig` with `enabled: true`:
  * Generate root-level `a2ui_components.py` (never create a separate `a2ui/` subfolder) with UI component definitions (`build_a2ui_surface` returning `{"messages": [{"createSurface": {"surfaceId": ..., "catalog": "gemini_enterprise_composite_v09", "title": ...}}, {"updateComponents": {"surfaceId": ..., "rootId": ..., "components": [...]}}, {"updateDataModel": {"surfaceId": ..., "data": {...}}}]}`).
  * **CANONICAL A2UI v0.9.1 COMPONENT CATALOG & JSON SCHEMA (MANDATORY)**:
    - Every component in `"components": [...]` MUST use the exact keys `{"id": "...", "component": "<WidgetName>", "properties": {...}, "children": ["child_id_1", ...]}` (use `"properties"`, NOT `"props"`).
    - **Supported Catalog Widgets**:
      1. **Layout & Containers**: `MaterialCard` (`title`, `subtitle`, `status`, `children`), `MaterialColumn` (`spacing`, `children`), `MaterialRow` (`spacing`, `children`), `MaterialGridList` (`columns`, `children`), `MaterialExpansionPanel` (`title`, `expanded`, `children`), `MaterialTabs` (`tabs: [{"id", "label"}]`, `children`), `MaterialDivider`, `MaterialDialog` (`title`, `children`).
      2. **Content & Status**: `MaterialText` (`text`, `variant`: `"h1"|"h2"|"h3"|"subtitle1"|"body1"|"body2"|"caption"|"code"`), `MaterialBadge` (`text`, `color`: `"success"|"warning"|"error"|"info"|"primary"|"neutral"`), `MaterialIcon` (`iconName`, `color`), `MaterialProgressBar` (`label`, `value`, `max`), `MaterialProgressSpinner` (`label`).
      3. **Data Display & Composite**: `MaterialTable` / `RichTable` (`title`, `columns`: `[{"field": "...", "headerName": "..."}]`, `rows`: `[{...}]`), `Stepper` (`activeStep`, `steps`: `[{"id", "title", "status"}]`), `WorkOrderList` (`title`, `items`: `[{"id", "title", "assignee", "priority"}]`), `VegaChart` (`title`, `description`, `spec`: Vega-Lite v5 JSON spec), `GoogleMap` (`title`, `center`: `{"lat", "lng"}`, `zoom`, `markers`: `[{"id", "title", "lat", "lng", "status"}]`), `MosaicCarousel` (`title`, `items`: `[{"id", "title", "subtitle", "description", "badge", "imageUrl", "actionLabel", "actionName"}]`).
      4. **Two-Way Bound Form Inputs & Actions**:
         - `MaterialInput`: `{"label": "...", "inputType": "text"|"number", "placeholder": "...", "value": {"path": "/form/fieldName"}}`
         - `MaterialSelect`: `{"label": "...", "options": [{"label": "Display Label", "value": "val"}], "value": {"path": "/form/fieldName"}}`
         - `MaterialSlider`: `{"label": "...", "min": 0, "max": 100, "step": 1, "value": {"path": "/form/fieldName"}}`
         - `MaterialCheckbox`: `{"label": "...", "checked": {"path": "/form/flagName"}}`
         - `MaterialSlideToggle`: `{"label": "...", "checked": {"path": "/form/flagName"}}`
         - `MaterialRadioButton`: `{"label": "...", "options": [{"label": "...", "value": "..."}], "value": {"path": "/form/fieldName"}}`
         - `MaterialButton`: `{"label": "...", "variant": "contained"|"outlined", "color": "primary"|"success"|"warning"|"error", "action": {"event": {"name": "action_name", "context": {"fieldName": {"path": "/form/fieldName"}}}}}`
  * **TOOL-LEVEL SURFACE EMISSION**: Whenever a tool function (in `tools/*.py`) supports an A2UI-enabled agent or sub-agent, include `"surface": build_..._surface(...)` in the dictionary returned by the tool function so the runner automatically renders the interactive A2UI surface whenever the tool is called.
  * **TOKEN BUDGET & SURFACE ATTACHMENT RULE**: Always set `max_output_tokens=8192` on all A2UI-enabled agents and sub-agents (never `1024` or `2048`, which truncate JSON mid-stream). In each agent's `instruction`, instruct the LLM to provide a clear, concise consumer-friendly markdown summary and business rationale, and NOT to manually re-type or dump the raw `"surface"` JSON dictionary from the tool output into its text response (because the runtime automatically extracts and attaches the lossless `"surface"` dict from the tool response).
  * Generate root-level `a2ui_adaptor.py` importing from `a2ui_components` and implementing UI action handlers (`A2uiAdaptor.route_user_action`) and `session.state` conversions. `A2uiAdaptor.route_user_action` MUST accept `(cls, user_action=None, session_state=None, context=None, **kwargs)` (supporting `action_name`, `action_or_prompt`, `user_action`, `prompt`, `action`, `session_state`, and `state` keyword arguments) and is synchronous. It MUST ONLY return `{"status": "handled", "surface": ..., "message": ...}` for structured `{"userAction": ...}` JSON payloads (e.g. button clicks) or exact single-word utility commands (`"help"`, `"about"`, `"show_skills"`, `"feedback"`, `"bug"`), and return `None` for normal conversational queries so the LLM agent and its tools execute normally.
  * **CRITICAL CONSUMER UI RENDERING RULE**: The Chat Runner renders interactive A2UI widgets by extracting ```` ```a2ui\n<JSON>\n``` ```` blocks from the tool response or callback response.
  * **FORBIDDEN**: NEVER instruct or allow the agent to output code tutorials, JSON schema explanations, or ASCII art representations of badges, progress bars, tables, or forms. Always render the real interactive A2UI surface from a consumer's perspective.
  * Attach `before_model_callback=a2ui_before_model_callback` on the root agent AND on every sub-agent that has `a2uiConfig.enabled == true` so incoming `{"userAction": ...}` payloads and deterministic surface commands are routed via `A2uiAdaptor.route_user_action`:
    ```python
    async def a2ui_before_model_callback(
        callback_context: CallbackContext, llm_request: LlmRequest
    ) -> Optional[LlmResponse]:
        user_prompt = ""
        if llm_request.contents:
            for part in getattr(llm_request.contents[-1], "parts", []):
                if getattr(part, "text", None):
                    user_prompt += part.text + " "
        user_prompt = user_prompt.strip()
        routed = A2uiAdaptor.route_user_action(user_prompt, session_state=callback_context.state)
        if routed and routed.get("status") == "handled" and routed.get("surface"):
            msg = routed.get("message", "Here is the interactive A2UI surface:")
            text = f"{msg}\n\n```a2ui\n{json.dumps(routed['surface'])}\n```"
            return LlmResponse(
                content=genai_types.Content(role="model", parts=[genai_types.Part.from_text(text=text)])
            )
        return None
    ```
