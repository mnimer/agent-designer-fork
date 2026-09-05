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
| **TASK-111** | v1.0.1 | Deployment | Cloud Infrastructure IaC Panel (Cloud Run & Shared GCP Resources) | **Not Started** | TASK-106 |
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
| **TASK-124** | v1.1.2 | Patterns | Advanced Cognitive Patterns (Debate, Loop, Critic Triad) | **Not Started** | TASK-113, TASK-117 |
| **TASK-126** | v1.0.0 | Extension Host | VS Code Activity Bar Container & Sidebar Workflows Explorer | **Done** | TASK-100, TASK-108 |
| **TASK-127** | v1.0.0 | Release & CI | Automated VSIX Packaging & Tag-Triggered GitHub Actions Release Workflow | **Done** | TASK-100, TASK-109 |
| **TASK-128** | v1.0.1 | Blueprints | Visual Samples & Blueprints Gallery (Samples Tab & Palette) | **Not Started** | TASK-103, TASK-108 |
| **TASK-129** | v1.0.6 | Tools | ADK Built-in Tools Registry & Cross-Harness Tool Adapter Architecture | **Done** | TASK-104, TASK-118 |

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

### [TASK-111] Cloud Infrastructure IaC Panel (Cloud Run & Shared GCP Resources)
* **Release**: `v1.0.1`
* **Target Package/Files**:
  - `src/webview/components/deployment/DeploymentTab.tsx`
  - `src/shared/codegen/terraformGenerator.ts`
  - `src/webview/utils/runtimeSecrets.ts`
* **Context**:
  Implement Cloud Infrastructure IaC panel. Support automated Terraform generation for Google Cloud Run (v2 service) and foundational GCP infrastructure (Secret Manager for runtime keys like `GEMINI_API_KEY`, IAM Service Accounts, Artifact Registry, and VPC Network Attachments for Private Service Connect). NOTE: In accordance with official Google ADK architecture, Agent Engine (Agent Runtime) application code and container updates are decoupled from Terraform via `lifecycle.ignore_changes` and deployed through native container deployment in [TASK-125].
* **Sub-Agent Prompt**:
  ```
  Implement Cloud Infrastructure & IaC generator.
  1. Extract referenced environment variables into Cloud Secret Manager resources in main.tf.
  2. Generate Terraform for Cloud Run v2 service, Artifact Registry, and IAM invoker roles.
  3. Generate optional PSC Network Attachment Terraform for private VPC routing.
  4. Provide DeploymentTab with target selector, GCP project/region inputs, and one-click code copy/export.
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

### [TASK-124] Advanced Cognitive Patterns (Debate, Loop, Critic Triad)
* **Release**: `v1.1.2`
* **Target Package/Files**:
  - `src/webview/data/patterns.ts`
  - `src/webview/components/Canvas/PaletteCard.tsx`
* **Context**:
  Implement advanced cognitive patterns for agent orchestration: Multi-Agent Debate, Evaluator-Optimizer loop, and Review & Critique Triad.
* **Sub-Agent Prompt**:
  ```
  Implement Advanced Multi-Agent Patterns:
  1. Add Debate, Evaluator-Optimizer, and Critique Triad patterns to patterns.ts.
  2. Enable canvas insertion and visual palette badges for cognitive patterns.
  ```
* **Verification**:
  - Inserting each cognitive pattern into canvas generates valid node/edge layouts and sub-agent bindings.

---

### [TASK-125] Native Vertex AI Agent Engine (Agent Runtime) Container Deployment & Lifecycle Management
* **Release**: `v1.0.1`
* **Target Package/Files**:
  - `resource/prompts/python_adk_agent-engine.prompt.txt`
  - `src/extension/AgentEngineDeployer.ts`
  - `src/webview/components/deployment/AgentEngineDeployTab.tsx`
  - `src/shared/codegen/agentEngineScaffold.ts`
  - `package.json`
* **Context**:
  Implement native container deployment and lifecycle management for Google Cloud Vertex AI Agent Engine (Agent Runtime) following the official Google ADK deployment protocol (`agents-cli deploy`).
  1. **Prompt & Scaffolding Updates**:
     - Update `resource/prompts/python_adk_agent-engine.prompt.txt` to include `cloudbuild.yaml` in the generated repository manifest:
       * Pre-configured with steps to execute unit/eval tests (`pytest tests/`) in `python:3.11-slim`.
       * Automatically runs `agents-cli deploy` (or `python deploy.py`) targeting Vertex AI Agent Runtime with substitutions (`_PROJECT_ID`, `_REGION`).
     - Project-root `Dockerfile` configured with multi-stage distroless Python runtime.
     - Project-root `.gcloudignore` and `.gitignore` to package strictly necessary agent assets.
     - `fast_api_app.py` mounting ADK HTTP routes (`/run_sse`, `/apps/...`), A2A endpoints (`/a2a/{app_name}`), and reasoning engine adapter routes (`/api/reasoning_engine`, `/api/stream_reasoning_engine`).
  2. **Deployment Flow**:
     - Packages the active agent project directory.
     - Invokes native Agent Engine deployment via CLI / Vertex AI SDK to trigger remote Cloud Build container compilation and Agent Runtime instance creation/update.
     - Persists and manages `deployment_metadata.json` (`remote_agent_runtime_id`, `deployment_target: "agent_runtime"`, `is_a2a`, `agent_directory`, `deployment_timestamp`).
     - Supports subsequent updates vs. initial creates using `deployment_metadata.json`.
     - Streams remote build and deployment operation logs to the VS Code UI in real time via `WebviewBridge`.
  3. **Live Remote Execution & Testing**:
     - Provides one-click remote query and streaming chat directly against the deployed Agent Runtime via the `/api` HTTP passthrough:
       `https://{location}-aiplatform.googleapis.com/reasoningEngines/v1/{resource}/api/run_sse`
     - Displays live deployment status, resource ID, endpoint URLs, and Cloud Console direct links in the extension workbench.
* **Sub-Agent Prompt**:
  ```
  Implement Native Vertex AI Agent Engine Deployment in extension backend, webview, and ADK prompt:
  1. Update resource/prompts/python_adk_agent-engine.prompt.txt to include cloudbuild.yaml in file manifest with test and agents-cli deploy steps.
  2. Create AgentEngineDeployer.ts to orchestrate packaging, invocation of agents-cli deploy / Vertex AI API, and reading/writing deployment_metadata.json.
  3. Stream deployment progress, Cloud Build logs, and error status through WebviewBridge.
  4. Create AgentEngineDeployTab.tsx in the webview to configure GCP Project, Location, Service Account, and Network Attachment.
  5. Enable remote testing against the deployed engine via the /api HTTP passthrough.
  ```
* **Verification**:
  - Prompt generation produces valid cloudbuild.yaml.
  - AgentEngineDeployer unit tests validate packaging, deployment_metadata.json generation, update vs create resolution, and URL format validation.

---

### [TASK-126] VS Code Activity Bar Container & Sidebar Workflows Explorer
* **Release**: `v1.0.0`
* **Target Package/Files**:
  - `src/extension/views/WorkflowExplorerTreeProvider.ts`
  - `src/extension/views/AgentEngineDeploymentsTreeProvider.ts`
  - `src/extension/extension.ts`
  - `package.json`
* **Context**:
  Contribute an official Activity Bar icon and dedicated Sidebar explorer views to VS Code so users can discover, manage, and inspect agent workflows and runtime deployments without having to manually open `.agent` files from the generic file explorer. (Note: Blueprint and sample workflows are housed directly in the diagram's visual Samples Tab via [TASK-128]).
  1. **Activity Bar Contribution**:
     - Register `viewsContainers.activitybar` with `id: "agentFlow"` and custom icon.
  2. **Sidebar Views (`views`)**:
     - **Workflows Explorer (`agentFlow.views.workflows`)**: Automatically detects and lists all `*.agent` files in the open workspace, showing node count, topology type, and quick actions (Open, Duplicate, Delete).
     - **Deployments & Run Targets (`agentFlow.views.deployments`)**: Lists active local runner subprocesses and known deployed Vertex AI Agent Engine / Cloud Run endpoints with status indicators and quick-test actions.
  3. **Commands**:
     - `agentFlow.sidebar.newWorkflow`, `agentFlow.sidebar.refresh`, `agentFlow.sidebar.openWorkflow`.
* **Sub-Agent Prompt**:
  ```
  Implement VS Code Activity Bar container and Sidebar TreeViews:
  1. Update package.json contributes with viewsContainers and views.
  2. Implement WorkflowExplorerTreeProvider watching workspace *.agent files with vscode.FileSystemWatcher.
  3. Implement AgentEngineDeploymentsTreeProvider listing active runners and endpoints.
  4. Register tree providers and sidebar commands in extension.ts.
  ```
* **Status**: Complete
* **Verification**:
  - Unit tests verify tree data provider children resolution, file watcher events, and command registrations (`WorkflowExplorerTreeProvider.test.ts`, `AgentEngineDeploymentsTreeProvider.test.ts`, `extension.test.ts` - 122 tests pass).
  - Clean TypeScript builds for both extension and webview.

---

### [TASK-127] Automated VSIX Packaging & Tag-Triggered GitHub Actions Release Workflow
* **Release**: `v1.0.0`
* **Target Package/Files**:
  - `.github/workflows/release.yml`
  - `.vscodeignore`
  - `package.json`
* **Context**:
  Configure automated packaging and GitHub Actions CI/CD pipeline to produce release `.vsix` binaries and GitHub Releases whenever a version tag (`v*.*.*`) is pushed off the `main` branch.
  1. **Packaging Tooling**:
     - Add `@vscode/vsce` to `devDependencies` and configure `"package": "vsce package --no-dependencies"` in `package.json`.
     - Configure `.vscodeignore` to exclude development assets, mockups, raw markdown specifications, test files, and non-production source trees.
  2. **GitHub Actions Release Pipeline (`.github/workflows/release.yml`)**:
     - Triggered on tag push: `tags: ['v*.*.*']`.
     - Runs on `ubuntu-latest`.
     - Sets up Node.js, runs `npm ci`, executes test suite (`npm test`), and builds production extension and webview (`npm run compile`).
     - Packages `.vsix` archive using `npx @vscode/vsce package`.
     - Creates official GitHub Release referencing the pushed tag, generates automated changelog notes, and attaches the `.vsix` binary as a downloadable release asset.
* **Sub-Agent Prompt**:
  ```
  Configure VSIX packaging and GitHub Actions release workflow:
  1. Add @vscode/vsce to devDependencies and package script in package.json.
  2. Create comprehensive .vscodeignore excluding non-runtime directories.
  3. Create .github/workflows/release.yml triggered on v* tags with test, compile, package, and softprops/action-gh-release steps.
  ```
* **Verification**:
  - `npm run package` successfully produces a valid `.vsix` archive locally.
  - Release workflow YAML validates against GitHub Actions schema.

---

### [TASK-128] Visual Samples & Blueprints Gallery (Samples Tab & Palette)
* **Release**: `v1.0.1`
* **Target Package/Files**:
  - `src/webview/components/Canvas/PaletteCard.tsx`
  - `src/webview/data/sampleWorkflows.ts`
  - `src/webview/types.ts`
* **Context**:
  Build a dedicated Visual Samples & Blueprints Gallery inside the canvas diagram's `Samples` tab (and palette) containing production-ready agent blueprints.
  1. **Gallery Content**:
     - Pre-built enterprise blueprints:
       * **Company Verifier & Entity Classifier**: Root sequential agent with domain research sub-agents and structured Pydantic response.
       * **Customer Support Specialist**: Interactive multi-turn conversational agent with search grounding and escalation routing.
       * **Financial Research Analyst**: Parallel fan-out agent gathering SEC filings, earnings calls, and news, synthesized into financial reports.
       * **Code Quality Critic Triad**: Multi-agent loop pattern with Generator, Reviewer, and Refiner.
  2. **Interactivity**:
     - Visual preview cards with blueprint title, description badge, complexity tag, and node count.
     - One-click "Load into Current Flow" (replaces or prompts to confirm) or "Open in New Flow".
     - Draggable sample cards onto canvas.
* **Sub-Agent Prompt**:
  ```
  Implement Visual Samples & Blueprints Gallery in PaletteCard:
  1. Define rich SampleWorkflowDefinition items in sampleWorkflows.ts with complete topologies, nodes, edges, and test cases.
  2. Implement the Samples tab in PaletteCard.tsx rendering interactive sample cards with icons, tags, and summary stats.
  3. Wire sample loading handler in App.tsx to instantiate the topology into the active canvas or create a new file buffer.
  ```
* **Verification**:
  - Unit tests verify all sample blueprints contain valid acyclic node/edge structures and load successfully into the React Flow state.

---

### [TASK-129] ADK Built-in Tools Registry & Cross-Harness Tool Adapter Architecture
* **Release**: `v1.0.6`
* **Target Package/Files**:
  - `src/webview/data/builtinTools.ts`
  - `src/webview/components/Canvas/PaletteCard.tsx`
  - `src/webview/components/inspector/ToolDrawer.tsx`
  - `src/shared/codegen/toolAdapters.ts`
  - `src/webview/types.ts`
* **Context**:
  Expand the visual designer's Tool Registry to natively support all official Google ADK built-in tools, and establish a cross-harness tool compilation architecture so tools configured visually compile cleanly whether targeting Google ADK, LangGraph, or TypeScript.
  1. **Built-in ADK Tools in PaletteCard**:
     - **Google Search Grounding (`google_search`)**: Dynamic real-time web search grounding with configurable domain filters.
     - **Vertex AI Search (`vertex_ai_search`)**: Grounding against enterprise datastores (`VertexAiSearchTool` with dataStoreId, location, project).
     - **Web Page Reader (`load_web_page`)**: HTML-to-markdown reader tool (`load_web_page`).
     - **Human-in-the-Loop Clarification (`request_input`)**: Built-in interactive model pause/clarification tool (`request_input`).
     - **Preload Memory Tool (`preload_memory`)**: Injects user session context and chat history (`PreloadMemoryTool`).
     - **Code Interpreter (`code_execution`)**: Sandboxed Python code interpreter.
     - **Sub-Agent as a Tool (`agent_as_tool`)**: Tool wrapper delegating tasks to sub-agents (`AgentTool`).
  2. **Cross-Harness Tool Adapter Architecture**:
     - Tools are stored in canonical, runtime-agnostic JSON (name, category, description, parameters schema, configuration).
     - **Codegen Compilers**:
       * **Google ADK (Python)**: Generates direct imports (`from google.adk.tools import ...`) and bindings into `Agent(tools=[...])`.
       * **LangGraph (Python)**: Generates LangGraph/LangChain equivalents (e.g. `@tool` decorators for custom functions, `langchain_community` search tools, or `langchain.interrupt()` for `request_input`).
       * **TypeScript**: Generates `@google/genai` tool declaration schemas and function callbacks.
* **Sub-Agent Prompt**:
  ```
  Implement ADK Built-in Tools Registry and Cross-Harness Tool Adapters:
  1. Populate builtinTools.ts with full metadata, parameter schemas, and icons for all ADK built-in tools.
  2. Update PaletteCard.tsx Tools tab to categorize tools into Built-in Grounding, Enterprise Search, System Tools, and Custom Tools.
  3. Create ToolDrawer.tsx configuration fields for Vertex AI search data stores and tool parameters.
  4. Implement toolAdapters.ts to compile tool definitions to target harnesses (ADK vs LangGraph).
  ```
* **Verification**:
  - Unit tests verify all built-in tools render in PaletteCard, can be attached to Agent nodes, serialize cleanly, and emit valid ADK/LangGraph code.
