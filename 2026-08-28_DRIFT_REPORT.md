# Architecture & Design Document Drift Report (2026-08-28)

## DESIGN_DOC.md

- **File Manifest Discrepancies (Section 7.1)**:
  - `esbuild.js` is listed in the manifest as the extension host bundler script, but does not exist on disk; bundling is performed via inline npm scripts in `package.json`.
  - `.vscodeignore` is specified in the manifest for packaging the extension, but is absent from the project root.
  - `src/webview/hooks/useExtensionBridge.ts` is listed in the manifest and architecture diagrams, but the implemented hook is named `src/webview/hooks/useWebviewBridge.ts`.
  - Canvas and node component directories are specified under `src/webview/components/canvas/` and `src/webview/components/nodes/` (`PaletteCard.tsx`, `AutoLayout.ts`, `AgentNode.tsx`, `TriggerNode.tsx`), but are located at `src/webview/components/Canvas/` and `src/webview/components/Canvas/nodes/`.
  - Unit test directory structure is specified as `test/unit/` (`test/unit/extension/...`, `test/unit/webview/...`), but tests are located in `tests/extension/` and `tests/webview/`.
  - Integration and E2E test files `test/integration/codegen.integration.test.ts` (LLM codegen validation) and `test/e2e/extension.e2e.test.ts` (`@vscode/test-electron` E2E test) are specified in the manifest but absent from the codebase.

- **RPC Protocol & Data Model Inconsistencies (Section 5.3)**:
  - Webview-to-Host Messages: Design specifies `{ type: 'WEBVIEW_READY' }`, `{ type: 'DOCUMENT_UPDATED', payload: { documentJson } }`, and `{ type: 'RUN_TESTS', payload: { workflow } }`. The implementation in `src/shared/rpcProtocol.ts` uses `{ type: 'READY' }`, `{ type: 'DOCUMENT_UPDATED', payload: { document, docVersion } }`, and `{ type: 'RUN_TESTS', payload: { document, testScenarioIds } }`.
  - Host-to-Webview Messages: Design specifies discrete start/complete/failed messages (`CODE_GENERATION_STARTED`, `CODE_GENERATION_COMPLETED`, `CODE_GENERATION_FAILED`, `TEST_RUN_STARTED`, `TEST_PROGRESS_UPDATE`, `TEST_RUN_COMPLETED`). The implementation consolidates these into `{ type: 'CODE_GENERATED' }`, `{ type: 'EXECUTION_LOG' }`, `{ type: 'TEST_RESULT_UPDATE' }`, and `{ type: 'EXECUTION_COMPLETE' }`.
  - `THEME_CHANGED` Message: Design specifies payload theme `'dark' | 'light' | 'high-contrast'`; `ExtensionToWebviewMessage` in `src/shared/rpcProtocol.ts` only declares `'dark' | 'light'`.
  - `AgentWorkflowDocument` Interface: Design specifies flat `nodes: (AgentNodeData | TriggerNodeData)[]` and `framework: 'google_adk' | 'langgraph'`. `src/shared/types.ts` wraps nodes in `WorkflowNode` (`{ id, type, position, data }`) and uses kebab-case `framework: 'google-adk' | 'langgraph'`.
  - `GeneratedFile` Interface: Design specifies `{ name: string; language: 'python' | 'text' | 'terraform' | 'yaml' | 'dockerfile' | 'markdown'; description: string; content: string }`. `src/shared/codegen/types.ts` defines `{ path: string; description?: string; content: string; language?: string }`.

- **Runtime & Execution Shortcuts**:
  - `PythonEnvResolver` Auto-Provisioning: Design document states that `PythonEnvResolver` automatically provisions `.venv` in the background and runs `pip install -r requirements.txt` if dependencies are missing. In reality, `src/extension/PythonEnvResolver.ts` only resolves existing paths and versions, falling back to system PATH without provisioning virtual environments or installing packages.
  - `AgentRunnerManager` Subprocess Execution: Design specifies spawning live Python subprocesses executing session turns against generated Python code. In reality, `src/extension/AgentRunnerManager.ts` evaluates tests using synthetic mock traces and hardcoded response strings (`mockResponse`) without spawning real Python agent processes.
  - Default Model Identifier: Design specifies `gemini-3.5-flash` in sequence diagrams and architecture blueprints, but `GeminiCodeGenEngine.ts` defaults to `gemini-2.5-pro` and `App.tsx` defaults to `gemini-2.5-flash`.

---

## REQUIREMENTS.md

- **Data Model Duplication & Structural Drift**:
  - Dual Type Systems: `src/webview/types.ts` defines separate webview models (`FrameworkType = 'google_adk' | 'langgraph'`, `TriggerType = 'tester'`, `ToolDefinition.type = 'search' | 'code' | 'api' ...`) differing from `src/shared/types.ts` (`FrameworkTarget = 'google-adk' | 'langgraph'`, `TriggerKind = 'test'`, `ToolDefinition.type = 'builtin' | 'rest' ...`), requiring runtime mapping adapters (`normalizeLoadedNodes`) in `src/webview/App.tsx`.
- **Sub-Agent Delegation Sockets (Section 3.1 & 4.1)**:
  - Specification defines dedicated visual delegation handles on `AgentNode` dynamically generated for each child sub-agent in `subAgents`. In `src/webview/components/Canvas/nodes/AgentNode.tsx`, child sub-agents are listed visually but lack dedicated dynamic connection socket handles per sub-agent.
- **Premature UI Scope Implementation**:
  - Multi-agent patterns (Section 6), Router node (Section 3.2), A2A node (Section 3.3), and deployment IaC panels (Section 5.4) are documented as deferred/future capabilities, but full UI drawers (`RouterAgentDrawer.tsx`, `A2AAgentDrawer.tsx`, `DeploymentTab.tsx`) and pattern definitions (`patterns.ts`, `sampleWorkflows.ts`) already exist in `src/webview/` without backend subprocess execution support.
- **Model Context Protocol (MCP) Live Handshake (Section 4.5 & 10.5)**:
  - Specification requires live MCP protocol initialization handshakes over stdio/SSE to query dynamic tool lists. In reality, MCP tool discovery is stubbed and lacks live JSON-RPC 2.0 subprocess daemon orchestration.

---

## TASKS.md

- **Task Target File Divergences**:
  - TASK-101 targets `src/webview/hooks/useExtensionBridge.ts`, but the actual implementation is `src/webview/hooks/useWebviewBridge.ts`.
  - TASK-109 targets `test/unit/codegen/pythonAdkGenerator.test.ts`, `test/unit/runner/AgentRunnerManager.test.ts`, `test/unit/extension/AgentEditorProvider.test.ts`, and `test/unit/webview/useDiagramHistory.test.ts`. Reality: tests are located in `tests/`, and codegen tests are consolidated in `tests/extension/GeminiCodeGenEngine.test.ts`. Integration and E2E test files are missing.
- **Task Implementation Shortcuts**:
  - TASK-107 specifies managed Python subprocess execution with turn session isolation. Reality: `src/extension/AgentRunnerManager.ts` executes synthetic mock traces.
  - TASK-108 specifies Dagre auto-layout; while implemented in `src/webview/components/Canvas/AutoLayout.ts` and `src/webview/utils/layout.ts`, duplicate auto-layout utility implementations exist across both paths.
- **Phase Boundary Drift**:
  - Tasks TASK-110 through TASK-124 represent post-v1.0.0 phased releases (v1.0.1 - v1.1.2), but frontend components corresponding to these future releases (e.g., `DeploymentTab.tsx`, `RouterAgentDrawer.tsx`, `A2AAgentDrawer.tsx`, `StructuredOutputBuilder.tsx`, `patterns.ts`) are already present in the workspace.

---

## RELEASE_PLAN.md

- **Release 1.0.0 Scope Boundary Leakage**:
  - Release 1.0.0 scope is defined strictly as single-agent workflows, Google Search grounding, and Test Suite trigger. However, the codebase already includes UI drawers and data definitions for v1.0.1 (Deployment Tab, IaC), v1.0.2 (Sequential & Parallel patterns), v1.0.4 (A2A drawer), v1.0.5 (Router drawer), and v1.0.7 (Structured Output builder).
- **Release 1.0.0 Acceptance Criteria Gap**:
  - Acceptance criteria requires "Clicking 'Run All Unit Tests' runs tests against a real Python subprocess and reports pass/fail with execution latency." In the current implementation, `AgentRunnerManager` evaluates tests synthetically in-memory rather than executing live Python subprocesses.
- **Multi-Agent Trace Visualization (v1.0.2)**:
  - Although `TestRunnerTab.tsx` and `App.tsx` provide UI trace animations, backend `AgentRunnerManager.ts` only emits synthetic single-agent logs and does not orchestrate multi-agent DAG execution traces.

---

## mockup/README.md

- **Missing Configuration File**:
  - Instructions refer to setting `GEMINI_API_KEY` in `mockup/.env.local`, but `.env.local` does not exist in the repository.
- **Obsolete Deployment & Hosting References**:
  - Refers to a standalone Google AI Studio web application URL (`https://aistudio-preprod.corp.google.com/apps/b221972b-d137-406c-88cf-0461bb23eaea`), whereas the project is now structured as an integrated VS Code extension.
  - Refers to running the app via `npm run dev` in `mockup/`, which runs an outdated standalone React prototype that does not reflect the VS Code extension host architecture.
