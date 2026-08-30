# Visual Studio Code Agent Flow Builder — Actionable Engineering Task List

> **Author**: Mike Nimer <mikenimer@google.com>  
> **Target Platform**: VS Code Extension (`agent-flow-builder`)  
> **Structure**: Task breakdown structured for sub-agent execution. Each task includes objective, context, target files, prompts, and verification criteria.

---

## Task Summary Matrix

## Task Summary Matrix

| Task ID | Release | Component | Task Title | Status | Dependencies |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TASK-100** | v1.0.0 | Extension Host | VS Code Extension Scaffolding & Custom Editor Provider | **Complete** | None |
| **TASK-101** | v1.0.0 | Webview Bridge | Webview RPC Message Bus & Typed Protocol | **Complete** | TASK-100 |
| **TASK-102** | v1.0.0 | Webview UI | VS Code Chrome Shell, Themes & Resizable Panels | **Complete** | TASK-100 |
| **TASK-103** | v1.0.0 | Canvas & Node | Single Agent Node, Handles & Inspector Drawer | **Complete** | TASK-102 |
| **TASK-104** | v1.0.0 | Tools | Google Search Grounding Built-in Tool | **Complete** | TASK-103 |
| **TASK-105** | v1.0.0 | Triggers | Test Suite Trigger Node & Test Prompts Editor | **Complete** | TASK-103 |
| **TASK-106** | v1.0.0 | Codegen | Gemini Prompt-Driven Python ADK Repository Generator | **Complete** | TASK-103, TASK-104, TASK-105 |
| **TASK-107** | v1.0.0 | Runner | Managed Agent Subprocess Runner & Test Execution Engine | **Not Completed (Not started)** | TASK-101, TASK-106 |
| **TASK-108** | v1.0.0 | History & Sync | Undo/Redo Engine, Auto-Layout & Document Disk Sync | **Complete** | TASK-101, TASK-103 |
| **TASK-109** | v1.0.0 | Quality | End-to-End Test Suite & 100% Coverage Suite | **In Progress** | TASK-100 to TASK-108 |
| **TASK-110** | v1.0.1 | Triggers | Chat Trigger Node & Interactive Chat Runner Panel | **Not Started** | TASK-107 |
| **TASK-111** | v1.0.1 | Deployment | Cloud Deployment & IaC Panel (Cloud Run & Agent Engine) | **Not Started** | TASK-106 |
| **TASK-112** | v1.0.2 | Canvas | Multi-Agent Wiring, Sockets & Connection Validation | **Not Started** | TASK-103 |
| **TASK-113** | v1.0.2 | Patterns | Sequential Pipeline & Parallel Fan-Out Patterns | **Not Started** | TASK-112 |
| **TASK-114** | v1.0.2 | Codegen | Multi-Agent DAG Python ADK Code Generation & Tracing | **Not Started** | TASK-113 |
| **TASK-115** | v1.0.3 | Memory | In-Memory & Cloud Firestore Checkpointer Configuration | **Not Started** | TASK-103, TASK-111 |
| **TASK-116** | v1.0.4 | A2A | Agent-to-Agent (A2A) Protocol Node & JSON-RPC Client | **Not Started** | TASK-112, TASK-115 |
| **TASK-117** | v1.0.5 | Router | Router Node & Dynamic Branching Logic | **Not Started** | TASK-112 |
| **TASK-118** | v1.0.6 | Tools | Custom REST API Tool Builder & Python Code Sandbox | **Not Started** | TASK-104 |
| **TASK-119** | v1.0.7 | Schema | Structured Output Schema Builder & Pydantic Validation | **Not Started** | TASK-103, TASK-106 |
| **TASK-120** | v1.0.8 | MCP | Model Context Protocol (MCP) Client & Handshake Test | **Not Started** | TASK-104, TASK-107 |
| **TASK-121** | v1.0.9 | Triggers & IAM | Event-Driven Triggers (Pub/Sub, Cron, Eventarc) & Enterprise IAM OIDC Auth | **Not Started** | TASK-105, TASK-111, TASK-116 |
| **TASK-122** | v1.1.0 | Framework | LangGraph Framework Support (Python StateGraph Target) | **Not Started** | TASK-106, TASK-114 |
| **TASK-123** | v1.1.1 | Runtime | TypeScript Runtime Support (@google/genai SDK & Vitest) | **Not Started** | TASK-106, TASK-122 |
| **TASK-124** | v1.1.2 | Patterns | Advanced Patterns (Debate, Loop) & Blueprints Catalog | **Not Started** | TASK-113, TASK-117 |

---

## Detailed Task Specifications for Sub-Agent Delegation

---

### [TASK-100] VS Code Extension Scaffolding & Custom Editor Provider
* **Release**: `v1.0.0`
* **Target Package/Files**:
  - `package.json` (root)
  - `tsconfig.json` (root)
  - `src/extension/extension.ts`
  - `src/extension/AgentEditorProvider.ts`
  - `src/extension/types.ts`
* **Context**:
  Establish the root VS Code extension project. Register `agentFlow.editor` as a `vscode.CustomTextEditorProvider` associated with `*.agent` files. When an `.agent` file is opened, resolve a webview panel loading the bundled React webview script.
* **Sub-Agent Prompt**:
  ```
  Implement the VS Code Extension host entry point for Agent Flow Builder.
  1. Configure package.json with customEditors contribution for viewType 'agentFlow.editor' matching filename pattern '*.agent'.
  2. Implement AgentEditorProvider implementing vscode.CustomTextEditorProvider.
  3. Ensure webview HTML correctly configures CSP (Content Security Policy), local resource roots, and webview script/style injection.
  4. Synchronize document edits with vscode.workspace.applyEdit on webview changes.
  5. Add full TypeScript types and class documentation with Author: Mike Nimer <mikenimer@google.com>.
  ```
* **Verification**:
  - `npm run compile` succeeds with zero errors.
  - Launching VS Code Extension Development Host successfully opens `.agent` files with custom editor.

---

### [TASK-101] Webview RPC Message Bus & Typed Protocol
* **Release**: `v1.0.0`
* **Target Package/Files**:
  - `src/shared/rpcProtocol.ts`
  - `src/extension/WebviewBridge.ts`
  - `src/webview/hooks/useWebviewBridge.ts`
* **Context**:
  Create a bi-directional, type-safe RPC messaging bridge between the Extension Host and the Webview React application using `vscode.postMessage` and `window.addEventListener('message')`.
* **RPC Messages**:
  - Webview ➔ Extension: `READY`, `DOCUMENT_UPDATED`, `GENERATE_CODE`, `EXPORT_CODE`, `WRITE_FILES_TO_WORKSPACE`, `RUN_TESTS`, `CANCEL_TESTS`, `OPEN_SETTINGS`, `DISCOVER_MCP_TOOLS`.
  - Extension ➔ Webview: `LOAD_DOCUMENT`, `DOCUMENT_SAVED`, `THEME_CHANGED`, `CODE_GENERATED`, `FILES_WRITTEN`, `EXECUTION_LOG`, `TEST_RESULT_UPDATE`, `EXECUTION_COMPLETE`, `SETTINGS_SYNC`.
* **Sub-Agent Prompt**:
  ```
  Implement the typed RPC communication bridge between VS Code Extension Host and Webview React SPA.
  1. Define all RPC message types and payloads in src/shared/rpcProtocol.ts.
  2. Create WebviewBridge in extension host handling incoming webview messages with error handling and logging.
  3. Create useWebviewBridge custom React hook in webview providing clean methods to post messages and subscribe to typed events.
  4. Include unit tests validating message serialization and dispatch.
  ```
* **Verification**:
  - Run `npm test` verifying round-trip RPC dispatch and mock message handlers.

---

### [TASK-102] Webview UI Shell, Themes & Resizable Panels
* **Release**: `v1.0.0`
* **Target Package/Files**:
  - `src/webview/components/vscode/VSCodeChrome.tsx`
  - `src/webview/context/ThemeContext.tsx`
  - `src/webview/index.css`
  - `src/webview/App.tsx`
* **Context**:
  Port and enhance the VS Code Chrome shell from `mockup/`. Adhere strictly to the 8pt grid system. Support Dark (`#1e1e1e`), Light (`#ffffff`), and High Contrast (`#000000`) themes synced automatically with VS Code's active editor theme. Implement resizable workbench panels (2/3 canvas, 1/3 bottom workbench with drag divider).
* **Sub-Agent Prompt**:
  ```
  Port the VS Code UI Chrome shell to the webview project.
  1. Ensure ThemeContext syncs with VS Code's body class attributes (vscode-dark, vscode-light, vscode-high-contrast).
  2. Maintain the 8pt grid system for padding/margin (p-2, p-4, p-6, p-8, h-8, h-12).
  3. Implement drag divider between React Flow canvas and bottom workbench panel with clamp limits.
  4. Ensure title bar, tab buffer switcher, activity bar, and status bar render pixel-perfect.
  ```
* **Verification**:
  - Run `npm run build` in webview.
  - Verify dark, light, and high-contrast themes render properly.

---

### [TASK-103] Single Agent Node, Handles & Inspector Drawer
* **Release**: `v1.0.0`
* **Target Package/Files**:
  - `src/webview/components/nodes/AgentNode.tsx`
  - `src/webview/components/inspector/StandardAgentDrawer.tsx`
  - `src/webview/components/inspector/AgentDrawer.tsx`
  - `src/webview/types.ts`
* **Context**:
  Implement the Standard Agent node on the React Flow canvas and its slide-out property drawer (Width: 420px). Supports Agent Label, Role, Model selector (`gemini-flash-latest`, `gemini-3.7-flash`), Temperature slider (`0.0`-`2.0`), Max Iterations, System Prompt editor with token estimation, and color theme picker.
* **Sub-Agent Prompt**:
  ```
  Build the Standard Agent Node and Inspector Drawer.
  1. Implement AgentNode with custom top target and bottom source handles, model badge, and tool pill container.
  2. Implement StandardAgentDrawer with accordion sections: Identity, Model Parameters, System Instructions, Attached Tools.
  3. Ensure changes in the drawer immediately mutate node data and trigger document dirty states.
  4. Document classes and methods with Author: Mike Nimer <mikenimer@google.com>.
  ```
* **Verification**:
  - Clicking agent node opens inspector drawer; modifying values updates node card live.

---

### [TASK-104] Google Search Grounding Built-in Tool
* **Release**: `v1.0.0`
* **Target Package/Files**:
  - `src/webview/data/defaultTools.ts`
  - `src/webview/components/canvas/PaletteCard.tsx`
  - `src/webview/components/nodes/AgentNode.tsx`
* **Context**:
  Provide the built-in `Google Search Grounding` tool (`type: 'search'`). Users can drag it from the palette onto an agent or click "+ Attach Tool". The tool displays on the node card as a badge with an icon and quick-remove button.
* **Sub-Agent Prompt**:
  ```
  Implement Google Search Grounding tool integration.
  1. Define Google Search tool metadata in defaultTools.ts.
  2. Support dragging Google Search tool from PaletteCard onto AgentNode.
  3. Render tool pill in AgentNode with Google Search icon and inline remove button.
  4. Ensure agent tools array updates in document state.
  ```
* **Verification**:
  - Dragging search tool onto an agent attaches the tool to `agent.tools`.

---

### [TASK-105] Test Suite Trigger Node & Test Prompts Editor
* **Release**: `v1.0.0`
* **Target Package/Files**:
  - `src/webview/components/nodes/TriggerNode.tsx`
  - `src/webview/components/inspector/TriggerDrawer.tsx`
  - `src/webview/data/triggerDefinitions.ts`
* **Context**:
  Implement the Test Suite Trigger node (`triggerType: 'tester'`) and its inspector drawer. Allows adding/editing/removing test prompts, setting expected outputs, and selecting assertion rules (`contains_text`, `exact`, `json_schema`, `regex_match`). Connects via source handle to the entrypoint Agent.
* **Sub-Agent Prompt**:
  ```
  Implement Test Suite Trigger Node and Drawer.
  1. Build TriggerNode with pink border, FlaskConical icon, test case counter badge, and output socket handle.
  2. Build TriggerDrawer with test case CRUD manager (Prompt text, Expected Output, Assertion type selector).
  3. Wire connection validation so Test Suite Trigger can only connect to an Agent node.
  ```
* **Verification**:
  - Adding test prompts in drawer reflects on trigger badge and document state.

---

### [TASK-106] Gemini Prompt-Driven Python ADK Repository Generator
* **Release**: `v1.0.0`
* **Target Package/Files**:
  - `prompts/python-adk.prompt.txt`
  - `src/extension/GeminiCodeGenEngine.ts`
  - `src/webview/components/codegen/CodeGenerationPanel.tsx`
  - `src/shared/codegen/types.ts`
* **Context**:
  Build the LLM-driven code generation engine. When the user requests generated code:
  - Load the framework prompt template from `prompts/python-adk.prompt.txt`.
  - Inject the serialized `.agent` React Flow JSON into the prompt template.
  - Call Gemini (`gemini-3.5-flash` or configured model via `@google/genai` SDK / Vertex AI ADC).
  - Parse the structured multi-file JSON response:
    - `agent_workflow.py`: `MultiAgentWorkflow` class with Gemini model client (`google-genai`), tools, instructions, and generation configs.
    - `tools.py`: Search grounding initialization and tool function wrappers.
    - `main.py`: Interactive CLI runner and turn execution harness.
    - `test_pipeline.py`: Pytest suite running all configured test prompts with assertion checking.
    - `requirements.txt`: Pinned dependencies (`google-genai`, `pytest`, `pydantic`).
    - `main.tf`: Complete Terraform script for Cloud Run, Secret Manager, and IAM.
    - `cloudbuild.yaml`: Google Cloud Build CI/CD pipeline.
    - `Dockerfile`: Multi-stage distroless container build.
    - `README.md`: Architecture overview and local quickstart commands.
  - Render files in `CodeGenerationPanel` with syntax highlighting, copy actions, and workspace file export.
* **Sub-Agent Prompt**:
  ```
  Implement the Gemini Prompt-Driven Code Generation Engine.
  1. Create GeminiCodeGenEngine in extension host reading prompts/python-adk.prompt.txt.
  2. Inject active .agent graph JSON into {{WORKFLOW_JSON}} template parameter.
  3. Invoke @google/genai Gemini API with temperature=0.2 and parse structured multi-file JSON response.
  4. Stream/dispatch parsed files array over RPC to Webview CodeGenerationPanel.
  5. Include full unit tests with mocked Gemini responses validating schema parsing and error resilience.
  ```
* **Verification**:
  - Triggering code generation sends prompt to Gemini and renders all generated files in the tab viewer.

---

### [TASK-107] Managed Agent Subprocess Runner & Test Execution Engine
* **Release**: `v1.0.0`
* **Target Package/Files**:
  - `src/extension/AgentRunnerManager.ts`
  - `src/extension/PythonEnvResolver.ts`
  - `src/webview/components/testing/TestRunnerTab.tsx`
* **Context**:
  Implement backend process execution for running tests and local agents.
  - Discover the user's active VS Code Python environment.
  - Launch the agent runner subprocess.
  - For each test prompt, create a fresh session ID, stream the prompt to the agent, capture response & trace timings, validate assertions, and stream JSON progress to the webview TestRunnerTab.
* **Sub-Agent Prompt**:
  ```
  Build the Managed Agent Subprocess Runner and Test Runner panel.
  1. Implement PythonEnvResolver detecting active virtualenv / python interpreter in workspace.
  2. Implement AgentRunnerManager spawning subprocess, managing discrete test sessions, and capturing stdout/trace logs.
  3. Connect TestRunnerTab in webview to trigger RUN_TESTS RPC and display live animated execution traces, latency metrics, and assertion results.
  ```
* **Verification**:
  - Clicking "Run All Unit Tests" runs tests against real Python subprocess and reports results.

---

### [TASK-108] Undo/Redo Engine, Auto-Layout & Document Disk Sync
* **Release**: `v1.0.0`
* **Target Package/Files**:
  - `src/webview/hooks/useDiagramHistory.ts`
  - `src/webview/components/canvas/AutoLayout.ts`
  - `src/extension/AgentEditorProvider.ts`
* **Context**:
  Implement history management (`Cmd+Z` / `Cmd+Y`), Dagre auto-layout (`LR` and `TB`), and automatic file serialization/deserialization to `.agent` JSON files on disk.
* **Sub-Agent Prompt**:
  ```
  Implement diagram history, auto-layout, and document synchronization.
  1. Maintain undo/redo snapshot stacks per active tab buffer in useDiagramHistory.
  2. Implement AutoLayout using Dagre calculating node coordinates for Left-to-Right and Top-to-Bottom.
  3. Ensure changes in canvas serialize to valid JSON in the VS Code text document.
  ```
* **Verification**:
  - Node movements and edits can be undone and redone; saving persists `.agent` JSON file.

---

### [TASK-109] End-to-End Test Suite & 100% Coverage Suite
* **Release**: `v1.0.0`
* **Target Package/Files**:
  - `tests/extension/AgentEditorProvider.test.ts`
  - `tests/extension/GeminiCodeGenEngine.test.ts`
  - `tests/extension/AgentRunnerManager.test.ts`
  - `tests/extension/PythonEnvResolver.test.ts`
  - `tests/webview/useDiagramHistory.test.ts`
  - `tests/webview/useWebviewBridge.test.ts`
  - `tests/webview/StandardAgentDrawer.test.ts`
  - `tests/webview/TriggerDrawer.test.ts`
* **Context**:
  Enforce comprehensive unit test coverage for all Release 1.0.0 backend classes, RPC handlers, canvas hooks, and code generators.
* **Sub-Agent Prompt**:
  ```
  Write comprehensive unit tests for all Release 1.0.0 modules.
  1. Test AgentEditorProvider lifecycle (open, edit, save, relative target directory computation).
  2. Test GeminiCodeGenEngine prompt loading, template injection, and fallback synthesis.
  3. Test AgentRunnerManager test scenario execution, latency tracking, and assertions.
  4. Test useDiagramHistory undo/redo stacks and WebviewBridge RPC message dispatching.
  ```
* **Verification**:
  - `npm test` runs all 52 tests across 14 test suites and passes with zero failures.

---

### [TASK-110] Chat Trigger Node & Interactive Chat Runner Panel
* **Release**: `v1.0.1`
* **Target Package/Files**:
  - `src/webview/components/nodes/TriggerNode.tsx`
  - `src/webview/components/chat/ChatRunnerTab.tsx`
  - `src/extension/AgentRunnerManager.ts`
* **Context**:
  Add Chat Trigger node (`triggerType: 'chat'`) with welcome message and streaming configuration. Add an "Interactive Chat" tab in the bottom workbench panel allowing developers to chat live with their running agent with streaming responses.
* **Sub-Agent Prompt**:
  ```
  Implement Chat Trigger and Interactive Chat Runner Tab.
  1. Add Chat Trigger node with emerald styling and MessageSquare icon.
  2. Implement ChatRunnerTab in bottom panel with streaming turn viewer, message input, and session reset.
  3. Update AgentRunnerManager to support interactive streaming turn sessions via RPC.
  ```
* **Verification**:
  - Chat tab sends prompts and streams agent turns in real time.

---

### [TASK-111] Cloud Deployment & IaC Panel (Cloud Run & Agent Engine)
* **Release**: `v1.0.1`
* **Target Package/Files**:
  - `src/webview/components/deployment/DeploymentTab.tsx`
  - `src/shared/codegen/terraformGenerator.ts`
  - `src/webview/utils/runtimeSecrets.ts`
* **Context**:
  Implement Cloud Deployment & IaC panel. Support Google Cloud Run (v2 service) and Vertex AI Agent Engine. Automatically extract runtime secrets (`GEMINI_API_KEY`). Generate `main.tf`, `Dockerfile`, and `deploy.sh`.
* **Sub-Agent Prompt**:
  ```
  Implement Cloud Deployment & IaC generator.
  1. Extract referenced environment variables into Cloud Secret Manager resources in main.tf.
  2. Generate Terraform for Cloud Run v2 service and Vertex AI reasoning engine.
  3. Provide DeploymentTab with deployment target selector, GCP project/region inputs, and one-click code copy/export.
  ```
* **Verification**:
  - Generated Terraform passes `terraform validate`.

---

### [TASK-112] Multi-Agent Wiring, Sockets & Connection Validation
* **Release**: `v1.0.2`
* **Target Package/Files**:
  - `src/webview/components/nodes/AgentNode.tsx`
  - `src/webview/components/canvas/ConnectionValidator.ts`
* **Context**:
  Enable multi-agent topologies. Implement dynamic handles, sub-agent delegation sockets, and DAG connection validation (prevent self-loops, trigger constraints).
* **Sub-Agent Prompt**:
  ```
  Implement multi-agent connection validation and delegation sockets.
  1. Add subAgents socket list to AgentNode allowing individual child handles.
  2. Implement ConnectionValidator enforcing DAG rules and socket compatibility.
  3. Support multi-edge routing on canvas.
  ```
* **Verification**:
  - Invalid edges are rejected with visual feedback; valid edges connect cleanly.

---

### [TASK-113] Sequential Pipeline & Parallel Fan-Out Patterns
* **Release**: `v1.0.2`
* **Target Package/Files**:
  - `src/webview/data/patterns.ts`
  - `src/webview/components/canvas/PaletteCard.tsx`
* **Context**:
  Implement pre-configured drag-and-drop presets: Sequential Pipeline (Planner → Executor → Reviewer) and Parallel Fan-Out (Orchestrator → 3 Workers → Synthesizer).
* **Sub-Agent Prompt**:
  ```
  Implement Sequential and Parallel architectural pattern generators in patterns.ts.
  1. Define layouted node clusters for Sequential and Parallel topologies.
  2. Enable drag-and-drop from PaletteCard onto canvas with automatic Dagre layout positioning.
  ```
* **Verification**:
  - Dragging pattern onto canvas creates fully wired agent cluster.

---

### [TASK-114] Multi-Agent DAG Python ADK Code Generation & Tracing
* **Release**: `v1.0.2`
* **Target Package/Files**:
  - `src/shared/codegen/pythonAdkGenerator.ts`
  - `src/webview/components/testing/TestRunnerTab.tsx`
* **Context**:
  Update Python ADK generator to coordinate multi-agent DAGs (sequential handoffs, parallel `asyncio.gather` fan-outs). Update test runner to visualize multi-agent trace hops and per-node latencies.
* **Sub-Agent Prompt**:
  ```
  Update Python ADK generator and test runner for multi-agent DAG execution.
  1. Generate MultiAgentWorkflow class orchestrating parallel and sequential agent steps.
  2. Instrument agent turns with timing metrics.
  3. Update TestRunnerTab to render animated trace hops across agent nodes.
  ```
* **Verification**:
  - Multi-agent workflow executes and displays trace timeline.

---

### [TASK-115] In-Memory & Cloud Firestore Checkpointer Configuration
* **Release**: `v1.0.3`
* **Target Package/Files**:
  - `src/webview/data/memoryOptions.ts`
  - `src/webview/components/inspector/StandardAgentDrawer.tsx`
  - `src/shared/codegen/pythonAdkGenerator.ts`
  - `src/shared/codegen/terraformGenerator.ts`
* **Context**:
  Add memory configuration options: Stateless (`none`), In-Memory Turn Buffer (`MemorySaver`), and Google Cloud Firestore checkpointer (`collectionName`, `thread_id`). Generate Firestore client in Python and IAM roles in Terraform.
* **Sub-Agent Prompt**:
  ```
  Implement Memory Checkpointer configuration and code generation.
  1. Add memory selector to StandardAgentDrawer with Firestore options.
  2. Generate Firestore checkpointer loader in agent_workflow.py.
  3. Add Firestore IAM roles (roles/datastore.user) in main.tf.
  ```
* **Verification**:
  - Multi-turn state persists across sessions using Firestore checkpointer.

---

### [TASK-116] Agent-to-Agent (A2A) Protocol Node & JSON-RPC Client
* **Release**: `v1.0.4`
* **Target Package/Files**:
  - `src/webview/components/nodes/AgentNode.tsx`
  - `src/webview/components/inspector/A2AAgentDrawer.tsx`
  - `src/shared/codegen/pythonAdkGenerator.ts`
* **Context**:
  Implement A2A Node (`agentKind === 'a2a'`) with A2A drawer (endpoint, protocol version `1.0.0-a2a`, Agent Card URL `/.well-known/agent-card.json`, Bearer/API Key auth). Generate compliant JSON-RPC 2.0 / A2A client in `tools.py`.
* **Sub-Agent Prompt**:
  ```
  Implement A2A Node, A2AAgentDrawer, and Python A2A JSON-RPC client.
  1. Build A2A Node with cyan border, Globe2 icon, and endpoint status badge.
  2. Build A2AAgentDrawer configuring endpoint URL, capability negotiation, and Bearer/API Key auth.
  3. Generate A2A client in tools.py to query remote agent cards and dispatch tasks.
  ```
* **Verification**:
  - A2A node connects to remote agent card and dispatches valid JSON-RPC requests.

---

### [TASK-117] Router Node & Dynamic Branching Logic
* **Release**: `v1.0.5`
* **Target Package/Files**:
  - `src/webview/components/nodes/AgentNode.tsx`
  - `src/webview/components/inspector/RouterAgentDrawer.tsx`
  - `src/shared/codegen/pythonAdkGenerator.ts`
* **Context**:
  Implement Router Node (`agentKind === 'router'`) with dynamic per-branch output handles. Property drawer supports Boolean Expression on state, LLM Intent Classifier, and Numeric Threshold modes. Generates branching logic in Python ADK.
* **Sub-Agent Prompt**:
  ```
  Implement Router Node, RouterAgentDrawer, and ADK branch generator.
  1. Build Router Node with neon purple styling, Split icon, and dynamic branch handles.
  2. Implement RouterAgentDrawer for managing condition expressions and fallback branches.
  3. Generate branching evaluation code in Python ADK.
  ```
* **Verification**:
  - Dynamic branch handles connect to candidate agents and branch correctly during execution.

---

### [TASK-118] Custom REST API Tool Builder & Python Code Sandbox
* **Release**: `v1.0.6`
* **Target Package/Files**:
  - `src/webview/components/inspector/ToolPropertyDrawer.tsx`
  - `src/webview/components/inspector/AddToolModal.tsx`
  - `src/shared/codegen/pythonAdkGenerator.ts`
* **Context**:
  Build custom REST API tool editor (HTTP methods, parameters, Secret Manager headers) and Python Code Sandbox tool (`code`). Generate async HTTP client functions in `tools.py`.
* **Sub-Agent Prompt**:
  ```
  Implement REST API tool editor and Python code sandbox.
  1. Build ToolPropertyDrawer for configuring REST API endpoints and secret bindings.
  2. Generate async httpx tool functions in tools.py.
  3. Add Python sandbox execution tool.
  ```
* **Verification**:
  - Custom REST tool calls endpoint and returns structured response.

---

### [TASK-119] Structured Output Schema Builder & Pydantic Validation
* **Release**: `v1.0.7`
* **Target Package/Files**:
  - `src/webview/components/inspector/StructuredOutputBuilder.tsx`
  - `src/shared/codegen/pythonAdkGenerator.ts`
  - `src/webview/components/testing/TestRunnerTab.tsx`
* **Context**:
  Implement Structured Output Schema Builder drawer with typed field editor. Dual preview for JSON Schema and Pydantic v2 `BaseModel`. Inject `response_schema` into Gemini model configurations and validate output payloads in test runner.
* **Sub-Agent Prompt**:
  ```
  Implement StructuredOutputBuilder and Pydantic model generator.
  1. Build interactive field editor in StructuredOutputBuilder.tsx.
  2. Generate Pydantic BaseModel in Python code and pass to Gemini response_schema.
  3. Add JSON schema validation assertion in TestRunnerTab.
  ```
* **Verification**:
  - Agent returns guaranteed structured JSON conforming to Pydantic schema.

---

### [TASK-120] Model Context Protocol (MCP) Client & Handshake Test
* **Release**: `v1.0.8`
* **Target Package/Files**:
  - `src/webview/components/inspector/ToolPropertyDrawer.tsx`
  - `src/extension/McpSubprocessManager.ts`
  - `src/shared/codegen/pythonAdkGenerator.ts`
* **Context**:
  Support MCP client tools across `stdio`, `sse`, and `http` transports. Provide in-drawer MCP ping/handshake test that queries local MCP servers via the extension backend. Generate async Python MCP client connectors.
* **Sub-Agent Prompt**:
  ```
  Implement Model Context Protocol (MCP) integration.
  1. Build MCP configuration drawer (command, args, env, tool filters).
  2. Implement McpSubprocessManager in extension host to run live JSON-RPC handshake and discover tools.
  3. Generate async MCP client connectors in tools.py.
  ```
* **Verification**:
  - MCP handshake test lists exposed tools; generated code connects to MCP servers.

---

### [TASK-121] Event-Driven Triggers (Pub/Sub, Cron, Eventarc) & Enterprise IAM OIDC Auth
* **Release**: `v1.0.9`
* **Target Package/Files**:
  - `src/webview/components/nodes/TriggerNode.tsx`
  - `src/webview/components/inspector/TriggerDrawer.tsx`
  - `src/shared/codegen/terraformGenerator.ts`
  - `src/shared/codegen/pythonAdkGenerator.ts`
* **Context**:
  Implement Pub/Sub, Scheduled Cron, and Eventarc trigger nodes. Add Google Cloud IAM OpenID Connect (OIDC) token exchange support for service-to-service authentication. Generate FastAPI ingestion endpoints and matching Terraform infrastructure (`google_pubsub_topic`, `google_cloud_scheduler_job`, IAM invoker bindings).
* **Sub-Agent Prompt**:
  ```
  Implement Event-Driven Triggers, Enterprise IAM OIDC auth, and matching Terraform IaC.
  1. Add PubSub, Cron, and Eventarc forms in TriggerDrawer.
  2. Generate Google Auth ID Token credentials client for IAM-authenticated A2A and Cloud Run calls.
  3. Generate FastAPI event receiver routes in Python.
  4. Generate PubSub topics, subscriptions, and Cloud Scheduler jobs in main.tf.
  ```
* **Verification**:
  - Generated Terraform provisions Cloud Scheduler, Pub/Sub, and IAM roles; Python code exchanges IAM OIDC tokens.

---

### [TASK-122] LangGraph Framework Support (Python StateGraph Target)
* **Release**: `v1.1.0`
* **Target Package/Files**:
  - `prompts/python-langgraph.prompt.txt`
  - `src/extension/GeminiCodeGenEngine.ts`
  - `src/webview/components/settings/SettingsPage.tsx`
* **Context**:
  Add LangGraph framework target for Python. Create `prompts/python-langgraph.prompt.txt` to generate `StateGraph`, `TypedDict` workflow states, graph nodes, conditional edges, and `MemorySaver`.
* **Sub-Agent Prompt**:
  ```
  Implement LangGraph framework code generation.
  1. Create prompts/python-langgraph.prompt.txt with StateGraph and TypedDict schemas.
  2. Add framework selector support in GeminiCodeGenEngine and UI Settings.
  3. Validate generated LangGraph Python output compiles and executes.
  ```
* **Verification**:
  - LangGraph output compiles with py_compile and executes test cases.

---

### [TASK-123] TypeScript Runtime Support (@google/genai SDK & Vitest)
* **Release**: `v1.1.1`
* **Target Package/Files**:
  - `prompts/typescript-adk.prompt.txt`
  - `src/extension/GeminiCodeGenEngine.ts`
  - `src/webview/components/settings/SettingsPage.tsx`
* **Context**:
  Add TypeScript language target. Create `prompts/typescript-adk.prompt.txt` generating complete Node.js / TypeScript repository with `@google/genai`, `package.json`, and Vitest test suite.
* **Sub-Agent Prompt**:
  ```
  Implement TypeScript code generation target.
  1. Create prompts/typescript-adk.prompt.txt generating TypeScript GenAI SDK code.
  2. Add language selector support in GeminiCodeGenEngine and UI Settings.
  3. Validate generated TypeScript project compiles with tsc and passes Vitest.
  ```
* **Verification**:
  - Generated TypeScript repository passes strict TypeScript compilation and Vitest runner.

---

### [TASK-124] Advanced Cognitive Patterns & Blueprints Catalog
* **Release**: `v1.1.2`
* **Target Package/Files**:
  - `src/webview/data/patterns.ts`
  - `src/webview/data/sampleWorkflows.ts`
  - `src/webview/components/canvas/PaletteCard.tsx`
* **Context**:
  Implement Evaluator-Optimizer loop, Multi-Agent Debate, Review & Critique Triad, and Central Coordinator patterns. Provide pre-built enterprise blueprints (e.g. `company_verifier.agent`).
* **Sub-Agent Prompt**:
  ```
  Implement Advanced Multi-Agent Patterns and Samples Catalog.
  1. Add Debate, Evaluator-Optimizer, and Coordinator patterns to patterns.ts.
  2. Add Company Verifier blueprint to sampleWorkflows.ts.
  3. Enable one-click sample workflow loading in new .agent tab buffers.
  ```
* **Verification**:
  - Loading `company_verifier.agent` loads complete topology, tools, schemas, and tests.
