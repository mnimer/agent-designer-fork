# TASK-124: Advanced Cognitive Patterns (Debate, Loop, Critic Triad)

## Goal
Implement advanced cognitive patterns for agent orchestration: Multi-Agent Debate, Evaluator-Optimizer loop, and Review & Critique Triad.
1. Ensure Debate, Evaluator-Optimizer, and Critique Triad patterns are defined in `patterns.ts` with valid node topologies, sub-agent bindings, and Dagre layouts.
2. Enable canvas insertion and visual palette badges for cognitive patterns in `PaletteCard.tsx`.
3. Provide unit test coverage verifying canvas insertion, sub-agent bindings, layout coordinates, and visual palette badge metadata.
4. Update `TASKS.md` and project documentation.

## Plan & Progress
- [x] Step 1: Analyze existing pattern definitions and palette integration.
- [x] Step 2: Update `PatternDefinition` and `patterns.ts` to associate distinct `colorTheme` with each cognitive pattern.
- [x] Step 3: Enhance `PaletteCard.tsx` with distinct visual palette badges, theme styling, and quick-add canvas insertion button.
- [x] Step 4: Write isolated unit tests in `agentPatterns.test.ts` and `PaletteAgents.test.ts` for all 3 cognitive patterns.
- [x] Step 5: Verify all unit tests pass (38/38 pattern tests pass, 803/803 total suite tests pass).
- [x] Step 6: Update `TASKS.md` and `REQUIREMENTS.md`.

## Status: COMPLETE
# TASK-196: Structured Input Schema Builder for Standard & Router Agent Nodes

## Status
- **Status**: Complete
- **Release**: v1.0.7
- **Target Files**:
  - `src/shared/agentSpec.ts`
  - `src/shared/types.ts`
  - `src/shared/schemaValidation.ts`
  - `src/webview/types.ts`
  - `src/webview/components/inspector/StructuredInputBuilder.tsx`
  - `src/webview/components/inspector/StandardAgentDrawer.tsx`
  - `src/webview/components/inspector/RouterAgentDrawer.tsx`
  - `src/extension/AgentRunnerManager.ts`
  - `src/extension/runner/TestAndChatExecutor.ts`
  - `resource/prompts/python_adk_agent-engine.prompt.txt`
  - `resource/prompts/python_adk_cloudrun.prompt.txt`
  - `tests/unit/webview/StructuredInputBuilder.test.ts`
  - `tests/unit/webview/RouterAgentConditions.test.ts`
  - `tests/unit/extension/AgentRunnerManager.test.ts`

## Tasks & Progress
- [x] 1. Type Definitions & Domain Models (`src/shared/agentSpec.ts` & `src/webview/types.ts`)
  - [x] Add `'integer'` to `SchemaFieldType`
  - [x] Add `StructuredInputField`, `StructuredInputSchema`, `RouterData`
  - [x] Add `inputSchema` to `AgentNodeData`, `AgentData`, and `RouterConfig`
  - [x] Export types in `src/webview/types.ts` and `src/shared/types.ts`
- [x] 2. Create Domain Logic & `StructuredInputBuilder.tsx` Component
  - [x] `src/shared/schemaValidation.ts` with shared Pydantic v2 code generator and JSON Schema Draft-07 generator
  - [x] Field builder UI supporting `string`, `integer`, `number`, `boolean`, `array`, `object`, `enum`
  - [x] Required toggle, field description, enum values editor, array item type
  - [x] Live dual previews: Pydantic v2 `BaseModel` (Python) and JSON Schema Draft-07
  - [x] Pydantic code generator supporting `int`, `float`, `str`, `bool`, `List[...]`, `dict`, `Literal[...]`
  - [x] JSON Schema Draft-07 generator with `$schema: "http://json-schema.org/draft-07/schema#"`
  - [x] Copy to clipboard and accordion expand/collapse
- [x] 3. Integrate into `StandardAgentDrawer.tsx`
  - [x] Add "Input Schema" accordion to `StandardAgentDrawer`
  - [x] Persist `inputSchema` updates via `onUpdateAgent`
- [x] 4. Integrate into `RouterAgentDrawer.tsx`
  - [x] Add "Input Schema" accordion to `RouterAgentDrawer`
  - [x] Persist `inputSchema` in `agent.inputSchema` and `routerConfig.inputSchema`
  - [x] Add condition variable suggestions chip list (`input.<fieldName>`)
  - [x] Static syntax validation for condition expressions against input schema fields
- [x] 5. Early Input Schema Validation in Test Runner (`AgentRunnerManager.ts` / `TestAndChatExecutor.ts`)
  - [x] Helper method to validate payload against `inputSchema` (`validateScenarioInput`)
  - [x] Emit early schema validation error logs when required fields are missing or types mismatch before runtime dispatch
- [x] 6. Update Code Generation Prompts
  - [x] `resource/prompts/python_adk_agent-engine.prompt.txt`
  - [x] `resource/prompts/python_adk_cloudrun.prompt.txt`
  - [x] Add instructions for Gemini to generate Pydantic input models (`class <Agent>Input(BaseModel)`)
  - [x] Instruct validation of incoming payload in `main.py` / `server.py` and router conditions
- [x] 7. Unit Tests & Verification
  - [x] Write tests in `tests/unit/webview/StructuredInputBuilder.test.ts` (13 tests)
  - [x] Add input validation tests in `tests/unit/extension/AgentRunnerManager.test.ts` (28 tests)
  - [x] Verify 100% test pass across all 78 test suites (809/809 passing)
  - [x] Update `TASKS.md` status to Complete
