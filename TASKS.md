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
| **TASK-107** | v1.0.0 | Runner | Managed Agent Subprocess Runner & Test Execution Engine | **Complete** | TASK-101, TASK-106 |
| **TASK-108** | v1.0.0 | History & Sync | Undo/Redo Engine, Auto-Layout & Document Disk Sync | **Complete** | TASK-101, TASK-103 |
| **TASK-109** | v1.0.0 | Quality | End-to-End Test Suite & 100% Coverage Suite | **Complete** | TASK-100 to TASK-108 |
| **TASK-110** | v1.0.1 | Triggers | Chat Trigger Node & Interactive Chat Runner Panel | **Complete** | TASK-107 |
| **TASK-111** | v1.0.1 | Deployment | Cloud Infrastructure IaC Panel (Cloud Run & Shared GCP Resources) | **Not Started** | TASK-106 |
| **TASK-112** | v1.0.2 | Canvas | Multi-Agent Wiring, Sockets & Connection Validation | **Complete** | TASK-103 |
| **TASK-113** | v1.0.2 | Patterns | Sequential Pipeline & Parallel Fan-Out Patterns | **Complete** | TASK-112 |
| **TASK-114** | v1.0.2 | Codegen | Multi-Agent DAG Python ADK Code Generation & Tracing | **Complete** | TASK-113 |
| **TASK-115** | v1.0.3 | Memory | In-Memory & Cloud Firestore Checkpointer Configuration | **Not Started** | TASK-103, TASK-111 |
| **TASK-116** | v1.0.4 | A2A | Agent-to-Agent (A2A) Protocol Node & JSON-RPC Client | **Complete** | TASK-112, TASK-115 |
| **TASK-117** | v1.0.5 | Router | Router Node & Dynamic Branching Logic | **Not Started** | TASK-112 |
| **TASK-118** | v1.0.6 | Tools | Custom REST API Tool Builder & Python Code Sandbox | **Not Started** | TASK-104 |
| **TASK-119** | v1.0.7 | Schema | Structured Output Schema Builder & Pydantic Validation | **Complete** | TASK-103, TASK-106 |
| **TASK-120** | v1.0.8 | MCP | Model Context Protocol (MCP) Client & Handshake Test | **Complete** | TASK-104, TASK-107 |
| **TASK-121** | v1.0.9 | Triggers & IAM | Event-Driven Triggers (Pub/Sub, Cron, Eventarc) & Enterprise IAM OIDC Auth | **Not Started** | TASK-105, TASK-111, TASK-116 |
| **TASK-122** | v1.1.0 | Framework | LangGraph Framework Support (Python StateGraph Target) | **Not Started** | TASK-106, TASK-114 |
| **TASK-123** | v1.1.1 | Runtime | TypeScript Runtime Support (@google/genai SDK & Vitest) | **Not Started** | TASK-106, TASK-122 |
| **TASK-124** | v1.1.2 | Patterns | Advanced Cognitive Patterns (Debate, Loop, Critic Triad) | **Not Started** | TASK-113, TASK-117 |
| **TASK-125** | v1.0.1 | Deployment | Native Vertex AI Agent Engine (Agent Runtime) Container Deployment & Lifecycle Management | **In Progress** | TASK-106, TASK-110 |
| **TASK-126** | v1.0.0 | Extension Host | VS Code Activity Bar Container & Sidebar Workflows Explorer | **Done** | TASK-100, TASK-108 |
| **TASK-127** | v1.0.0 | Release & CI | Automated VSIX Packaging & Tag-Triggered GitHub Actions Release Workflow | **Done** | TASK-100, TASK-109 |
| **TASK-128** | v1.0.1 | Blueprints | Visual Samples & Blueprints Gallery (Samples Tab & Palette) | **Not Started** | TASK-103, TASK-108 |
| **TASK-129** | v1.0.6 | Tools | ADK Built-in Tools Registry & Cross-Harness Tool Adapter Architecture | **Done** | TASK-104, TASK-118 |
| **TASK-130** | v1.0.8 | MCP / Tools | Google Cloud Remote MCP Servers Registry in Tools Tab | **Completed** | TASK-120, TASK-129 |
| **TASK-131** | v1.1.3 | i18n | Extension Host & Webview Internationalization (i18n / l10n) | **Not Started** | TASK-100, TASK-102 |
| **TASK-132** | v1.0.10 | Codegen / Security | [CRITICAL] Escape User Strings Emitted Into Generated Python (Code Injection) | **Not Started** | TASK-106, TASK-114 |
| **TASK-133** | v1.0.10 | Extension Host / Security | [CRITICAL] Eliminate Shell String Interpolation in Subprocess Invocation | **Not Started** | TASK-107, TASK-120, TASK-125 |
| **TASK-134** | v1.0.10 | Extension Host / Security | [CRITICAL] Contain Workspace File Writes & Validate Webview RPC Payloads | **Not Started** | TASK-101, TASK-106 |
| **TASK-135** | v1.0.10 | Security / Secrets | [CRITICAL] Migrate Gemini API Key & OAuth Tokens to VS Code SecretStorage | **Not Started** | TASK-106, TASK-120 |
| **TASK-136** | v1.0.10 | Persistence | [CRITICAL] Prevent Silent Data Loss on Malformed `.agent` Documents | **Not Started** | TASK-108 |
| **TASK-137** | v1.0.10 | Webview / Security | [MAJOR] Harden Webview CSP & Inline Bootstrap Serialization | **Not Started** | TASK-100, TASK-102 |
| **TASK-138** | v1.0.11 | Codegen / Correctness | [MAJOR] Topological Ordering, Python Keyword & Duplicate Identifier Safety | **Not Started** | TASK-114, TASK-117 |
| **TASK-139** | v1.0.11 | Extension Host / Perf | [MAJOR] Remove Blocking `execSync` & Add Network Timeouts on Host Thread | **Not Started** | TASK-106, TASK-125 |
| **TASK-140** | v1.0.11 | Runner / Concurrency | [MAJOR] Fix Runner Start Races, Unsettled Promises & Timer/Process Leaks | **Not Started** | TASK-107, TASK-120 |
| **TASK-141** | v1.0.11 | Webview / Perf | [MAJOR] Fix Canvas Re-Render Storms & Document Serialization Thrash | **Not Started** | TASK-103, TASK-112 |
| **TASK-142** | v1.0.12 | Architecture | [MAJOR] Decompose God Classes (Runner, Deployer, EditorProvider, App.tsx) | **Not Started** | TASK-132 to TASK-141 |
| **TASK-143** | v1.0.12 | Architecture / Quality | [MAJOR] Unify Duplicated Domain Types, Extract Drawer Primitives & Remove Dead Code | **Not Started** | TASK-142 |

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
  - Clicking "Run All Unit Tests" runs tests against live Python subprocess or Reasoning Engine and reports results.
  - Turn session isolation, tool call extraction, reasoning trace streaming, AbortController in-flight cancellation, and latency metrics verified with 100% unit test coverage.
* **Status**: **Complete**

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

---

### [TASK-130] Google Cloud Remote MCP Servers Registry & Tools Panel Group (COMPLETED)
* **Release**: `v1.0.8`
* **Target Package/Files**:
  - `src/shared/types.ts`
  - `src/webview/data/googleCloudMcpServers.ts`
  - `src/webview/components/Canvas/PaletteCard.tsx`
  - `src/webview/components/inspector/ToolDrawer.tsx`
  - `src/shared/codegen/toolAdapters.ts`
  - `src/extension/McpSubprocessManager.ts`
* **Context**:
  Add a dedicated **"Google Cloud MCP Servers"** collapsible category accordion inside the existing **Tools Tab** in `PaletteCard.tsx` (preserving the 4 existing top-level tabs: Agents, Tools, Triggers, Samples) and populate it with all released remote MCP servers documented at `https://docs.cloud.google.com/mcp/supported-products`. Unlike generic local `stdio` MCP processes, Google Cloud Remote MCP servers run on Google infrastructure, accessible via HTTP/SSE endpoints with Google Cloud Application Default Credentials (ADC) or OAuth access tokens.
  1. **"Google Cloud MCP Servers" Section inside the Tools Tab (Option A Hierarchy)**:
     - Render as a collapsible accordion category section directly inside the existing **Tools Tab** alongside *Built-in Grounding*, *Enterprise Search*, *System Tools*, and *Custom & Community Tools*.
     - Preserves the existing compact 4-tab bar layout (`Agents`, `Tools`, `Triggers`, `Samples`) without introducing any new top-level tabs.
     - **Two-Tier Lightweight Sub-Accordions**: Inside the Google Cloud MCP Servers category, organize the ~45 servers into 6 domain sub-groups:
       1. `Databases & Storage` (15 servers)
       2. `Compute & Containers` (6 servers)
       3. `AI, Search & Agent Platform` (5 servers)
       4. `Analytics, ETL & Governance` (6 servers)
       5. `Management, Observability & Security` (12 servers)
       6. `Developer & Google Workspace` (13 servers)
     - **Sub-Accordion UX & Styling**:
       * Sub-accordions are **collapsed by default**, showing only 6 clean single-line rows (with domain icon, title, and count badge), preventing infinite scrolling in the 320px palette.
       * Minimal 8pt grid indentation (`pl-2` / 8px) to maximize horizontal card width for descriptions and drag handles.
       * **Auto-Expand on Search**: Typing in the unified search bar automatically expands only the sub-groups containing matching servers.
     - Each tool card displays product name, launch stage badge (`GA`, `Preview`, `Beta`), service icon, default endpoint, and drag handle.
  2. **Complete Pre-Configured Server Catalog (`googleCloudMcpServers.ts`)**:
     - **Databases & Storage**:
       * **BigQuery**: `https://bigquery.googleapis.com/mcp`
       * **Bigtable**: `https://bigtableadmin.googleapis.com/mcp`
       * **Spanner**: `https://spanner.googleapis.com/mcp`
       * **Cloud SQL** (MySQL, PostgreSQL, SQL Server): `https://sqladmin.googleapis.com/mcp`
       * **AlloyDB for PostgreSQL**: Global `https://alloydb.googleapis.com/mcp` and Regional `https://alloydb.<REGION>.rep.googleapis.com/mcp`
       * **Firestore**: `https://firestore.googleapis.com/mcp`
       * **Memorystore** (Redis/Redis Cluster: `https://redis.googleapis.com/mcp`, Valkey: `https://memorystore.googleapis.com/mcp`)
       * **Cloud Storage**: `https://storage.googleapis.com/storage/mcp`
       * **Filestore**: `https://file.googleapis.com/mcp`
       * **Google Cloud NetApp Volumes**: `https://netapp.googleapis.com/mcp`
       * **Oracle Database@Google Cloud (Preview)**: `https://oracledatabase.googleapis.com/mcp`
       * **Database Center**: `https://databasecenter.googleapis.com/mcp`
       * **Database Insights**: `https://databaseinsights.googleapis.com/mcp`
       * **Database Migration Service (Preview)**: `https://datamigration.googleapis.com/mcp`
       * **Datastream (Preview)**: `https://datastream.googleapis.com/mcp`
     - **Analytics, ETL & Data Governance**:
       * **Dataform**: `https://dataform.googleapis.com/mcp`
       * **Managed Service for Apache Spark (Dataproc)**: `https://dataproc.googleapis.com/mcp`
       * **BigQuery Data Transfer Service (Preview)**: `https://bigquerydatatransfer.googleapis.com/mcp`
       * **BigQuery Migration Service**: `https://bigquerymigration.googleapis.com/mcp`
       * **Knowledge Catalog (Dataplex, Preview)**: `https://dataplex.googleapis.com/mcp`
       * **Data Lineage (Dataplex, Preview)**: Global `https://datalineage.googleapis.com/mcp` and Regional endpoints
     - **Compute, Containers & Messaging**:
       * **Cloud Run**: `https://run.googleapis.com/mcp`
       * **Compute Engine**: `https://compute.googleapis.com/mcp`
       * **Google Kubernetes Engine (GKE)**: `https://container.googleapis.com/mcp`
       * **Managed Service for Apache Airflow (Cloud Composer)**: Regional `https://composer.<REGION>.rep.googleapis.com/mcp`
       * **Managed Service for Apache Kafka**: `https://managedkafka.googleapis.com/mcp`
       * **Pub/Sub**: `https://pubsub.googleapis.com/mcp`
     - **AI, Agent Orchestration & Search**:
       * **Gemini Enterprise Agent Platform**: Multi-endpoint toolsets (`generate`, `predict`, `notebook`, `endpoints`, `models`, `tuning`, `retrieval`, `evaluation`, `prompts`)
       * **Agent Search**: `https://discoveryengine.googleapis.com/mcp`
       * **Agent Registry**: `https://agentregistry.googleapis.com/mcp`
       * **Customer Experience (CX) Agent Studio**: `https://ces.us.rep.googleapis.com/mcp`
       * **Gemini Cloud Assist (Preview)**: `https://geminicloudassist.googleapis.com/mcp`
     - **Management, Observability & Security**:
       * **Cloud Logging**: `https://logging.googleapis.com/mcp`
       * **Cloud Monitoring**: `https://monitoring.googleapis.com/mcp`
       * **Cloud Trace**: `https://cloudtrace.googleapis.com/mcp`
       * **Error Reporting**: `https://clouderrorreporting.googleapis.com/mcp`
       * **Personalized Service Health**: `https://servicehealth.googleapis.com/mcp`
       * **Cloud Quotas**: `https://cloudquotas.googleapis.com/mcp`
       * **Recommender**: `https://recommender.googleapis.com/mcp`
       * **Resource Manager**: `https://cloudresourcemanager.googleapis.com/mcp`
       * **Cloud Asset Inventory (Preview)**: `https://cloudasset.googleapis.com/mcp`
       * **Cloud Billing (Preview)**: `https://cloudbilling.googleapis.com/mcp`
       * **Audit Manager**: Regional `https://auditmanager.<REGION>.rep.googleapis.com/mcp`
       * **Backup and DR Service**: `https://backupdr.googleapis.com/mcp`
       * **Google Security Operations (Chronicle)**: Regional `https://chronicle.<REGION>.rep.googleapis.com/mcp`
       * **Policy Analyzer**: `https://cloudasset.googleapis.com/mcp`
       * **Policy Troubleshooter**: `https://policytroubleshooter.googleapis.com/mcp`
       * **Secure Source Manager (Preview)**: Regional endpoints (`code_review`, `pull_request`, `branch_rule`, `repository`, `instance`, `hook`)
       * **Cloud Location Finder (Preview)**: `https://cloudlocationfinder.googleapis.com/mcp`
       * **Cloud Product Registry (Preview)**: `https://cloudproductregistry.googleapis.com/mcp`
       * **Unified Maintenance (Preview)**: `https://maintenance.googleapis.com/mcp`
       * **Cloud Support API (Preview)**: `https://cloudsupport.googleapis.com/mcp`
       * **App Lifecycle Manager (Preview)**: `https://saasservicemgmt.googleapis.com/mcp`
       * **Apigee API hub**: `https://apihub.googleapis.com/mcp`
     - **Developer Tools, Google & Workspace MCP Ecosystem**:
       * **Developer Knowledge API**: `https://developerknowledge.googleapis.com/mcp`
       * **Cloud CLI Execution (Preview)**: `https://cloudcli.googleapis.com/mcp`
       * **Google Drive (Preview)**: `https://drivemcp.googleapis.com/mcp/v1`
       * **Gmail (Preview)**: `https://gmailmcp.googleapis.com/mcp/v1`
       * **Google Calendar (Preview)**: `https://calendarmcp.googleapis.com/mcp/v1`
       * **Google Chat (Preview)**: `https://chatmcp.googleapis.com/mcp/v1`
       * **People API (Preview)**: `https://people.googleapis.com/mcp/v1`
       * **Android Management API**: `https://androidmanagement.googleapis.com/mcp`
       * **Maps Grounding Lite**: `https://mapstools.googleapis.com/mcp`
       * **Maps Code Assist (Preview)**: `https://mapscodeassist.googleapis.com/mcp`
       * **Google Pay and Wallet (Preview)**: `https://paydeveloper.googleapis.com/mcp`
       * **Google Home Developer**: `https://homedevelopers.googleapis.com/mcp`
       * **Stitch (Beta)**: `https://stitch.googleapis.com/mcp`
       * **Design MCP (Preview)**: `https://design.googleapis.com/mcp`
  3. **Tool Configuration & Inspector Drawer (`ToolDrawer.tsx`)**:
     - Pre-filled endpoint with dropdown for regional endpoints where applicable (e.g. `us-central1`, `europe-west1`).
     - Toolset selector for multi-toolset services (e.g. Gemini Enterprise Agent Platform, Secure Source Manager, Memorystore).
     - Authentication configuration: Defaults to Google Cloud Application Default Credentials (ADC) with automatic token header injection (`Authorization: Bearer <token>`).
     - In-drawer "Test Connection" button invoking `McpSubprocessManager` / remote HTTP ping with `gcloud auth print-access-token`.
  4. **Code Generation (`toolAdapters.ts`)**:
     - Google ADK Python: Emits async remote MCP client using `google-auth` to automatically attach bearer tokens to SSE/HTTP requests, binding remote tools to `Agent(tools=[...])`.
     - LangGraph Python: Emits remote MCP client wrapper or LangChain adapter.
* **Sub-Agent Prompt**:
  ```
  Implement Google Cloud Remote MCP Servers Registry in Tools Tab:
  1. Create src/webview/data/googleCloudMcpServers.ts defining all Google Cloud and Google Workspace remote MCP servers from docs.cloud.google.com/mcp/supported-products with endpoints, doc links, and preview badges.
  2. Add 'google_cloud_mcp' category in src/shared/types.ts and update PaletteCard.tsx to render a collapsible 'Google Cloud MCP Servers' category accordion inside the existing Tools tab (keeping the 4 top-level tabs: Agents, Tools, Triggers, Samples unchanged).
  3. Update ToolDrawer.tsx to configure region overrides, multi-endpoint toolsets, and ADC authentication for Google Cloud MCP servers.
  4. Implement code generation in toolAdapters.ts emitting authenticated async HTTP/SSE MCP client connectors.
  ```
* **Verification**:
  - Unit tests verify all cataloged Google Cloud MCP servers are valid, render in PaletteCard, can be attached to Agent nodes, serialize cleanly, and emit valid authenticated Python client code.

---

### [TASK-131] Extension Host & Webview Internationalization (i18n / l10n)
* **Release**: `v1.1.3`
* **Target Package/Files**:
  - `package.json` (root)
  - `package.nls.json` (default English strings)
  - `package.nls.<lang>.json` (Spanish, Japanese, German, French, Simplified Chinese)
  - `src/extension/i18n.ts`
  - `src/shared/rpcProtocol.ts`
  - `src/extension/WebviewBridge.ts`
  - `src/webview/i18n/` (Locale provider, translation dictionary, `useTranslation` hook)
  - `src/webview/components/` (Header, PaletteCard, Inspector drawers, Test Runner, Modals)
  - `tests/extension/i18n.test.ts`
  - `tests/webview/i18n.test.ts`
* **Context**:
  Internationalize the entire Visual Agent Designer plugin across both the VS Code Extension Host and the Webview SPA to support global developers in their native languages.
  
  1. **VS Code Extension Host Localization (`vscode.l10n`)**:
     - Extract all user-facing strings in `package.json` (commands, configuration titles, view titles, menu items) into `%...%` replacement tokens backed by `package.nls.json`.
     - Provide localized bundles for:
       * English (`en`) - Default / Fallback
       * Spanish (`es`)
       * Japanese (`ja`)
       * German (`de`)
       * French (`fr`)
       * Simplified Chinese (`zh-cn`)
     - Use the official `vscode.l10n.t()` API for all runtime extension host notifications, error messages, and dialog prompts.
  2. **Webview UI Localization Engine**:
     - Implement a lightweight, type-safe webview translation engine (`useTranslation` hook / `LocaleProvider`) with zero heavy runtime overhead.
     - Automatically synchronize the active locale from VS Code's `vscode.env.language` sent across `WebviewBridge` during initialization (`LOAD_DOCUMENT` / `SETTINGS_SYNC` / `LOCALE_CHANGED`).
     - Support explicit language overrides in the extension settings (`agentDesigner.languagePreference`: `auto`, `en`, `es`, `ja`, `de`, `fr`, `zh-cn`).
  3. **UI String Extraction & Coverage**:
     - Systematically replace hardcoded user-facing strings across:
       * **Header Bar**: Project name, Undo/Redo, Code Gen, Test Runner, Export, Deploy, Settings.
       * **Palette Drawer**: Tabs (Agents, Tools, Triggers, Samples), category headers, item descriptions.
       * **Inspector Drawers**: Agent configuration, Tool parameters, Trigger settings, Schema Builder, Memory, IaC.
       * **Canvas & Context Menus**: Node action buttons, delete, duplicate, align, connection helper tooltips.
       * **Test Runner & Chat Panels**: Test scenarios, assertion results, latency, chat input placeholder, execution logs.
       * **Modals & Dialogs**: Discard changes, file overwrite confirmation, reset canvas.
  4. **Fallback & Robustness**:
     - Enforce strict graceful fallback to English (`en`) whenever a translation key is missing in a target language.
     - Include parameter interpolation for dynamic strings (e.g., `t('agent.deleted', { name: agent.name })`).
* **Sub-Agent Prompt**:
  ```
  Implement comprehensive internationalization (i18n / l10n) for the Visual Agent Designer extension:
  1. Localize package.json contributions using package.nls.json and create translation files for es, ja, de, fr, zh-cn.
  2. Implement extension-host runtime string localization using vscode.l10n.
  3. Build a React i18n provider and useTranslation hook in src/webview/i18n/ supporting parameter interpolation and en fallback.
  4. Transmit vscode.env.language via WebviewBridge on startup and when display language changes.
  5. Replace hardcoded UI strings in canvas, palette, inspector, header, and test runner with translation keys.
  6. Add unit tests for both extension and webview i18n ensuring complete key coverage and fallback resilience.
  ```
* **Verification**:
  - `npm test` runs with 100% coverage on i18n utilities and translation key resolution.
  - Switching VS Code display language or setting `agentDesigner.languagePreference` dynamically updates all labels, menus, drawer fields, and status messages without restarting.



---

## Code Review Remediation Backlog (TASK-132 → TASK-143)

> **Source**: Principal-engineer code review of `develop` @ `894226f`, 2026-09-11.
> **Scope reviewed**: ~58k LOC across extension host, webview SPA, shared codegen, and tests.
> **Baseline**: `npm test` = 536 passing / 0 failing. All findings below were confirmed by reading the cited lines.
> **Threat model note**: A `.agent` file is **untrusted input** — users open workflow files authored by colleagues, samples, or repos. Several findings below are only exploitable under that assumption, which the product explicitly invites.

---

### [TASK-132] [CRITICAL] Escape User Strings Emitted Into Generated Python (Code Injection)
* **Release**: `v1.0.10`
* **Severity**: Critical — Remote/Arbitrary Code Execution
* **Target Package/Files**:
  - `src/shared/codegen/pythonAdkGenerator.ts` (lines 660, 663, 665, 666, 697, 567, 239-240)
  - `src/shared/codegen/toolAdapters.ts` (lines 193, 246-273)
  - `tests/shared/codegen/codegenEscaping.test.ts` (new)
* **Context**:
  The Python generator interpolates user-controlled strings directly into Python string literals. The emitted file is then **imported and executed** by the local test runner (`AgentRunnerManager`) and shipped to Vertex AI Agent Engine, so a string break-out is a full code-execution primitive.

  1. **Incomplete escaping of `systemPrompt`** — `pythonAdkGenerator.ts:660`:
     ```ts
     const prompt = (data?.systemPrompt || 'Autonomous AI Agent').replace(/\n/g, '\\n').replace(/"/g, '\\"');
     ```
     Newlines and double quotes are escaped, but **backslashes are not**, and they are not escaped *first*. An input of `\"` becomes `\\"` in the output — an escaped backslash followed by a **terminating** quote. Everything after it is executed as Python. Payload: `\", tools=[__import__('os').system('id')])#`.
  2. **Completely unescaped `label`** — `pythonAdkGenerator.ts:663`:
     ```ts
     lines.push(`    name="${data?.label || node.id}",`);
     ```
     No escaping whatsoever. Same break-out with a single `"`.
  3. **Unescaped branch IDs and regex patterns** — `pythonAdkGenerator.ts:697` emits `"${branch.id}"` raw; line 567 escapes only quotes for the `re.search` pattern.
  4. **Unescaped MCP config** — `toolAdapters.ts:193` and surrounding: `serverName`, `command`, `url`, and header values are interpolated into Python literals unescaped.
  5. **JS literals leaking into Python** — `toolAdapters.ts:253, 260, 269, 273` use `JSON.stringify(...)` for lists/dicts. This is *safe* against injection but emits JS `true` / `false` / `null`, which are `NameError`s in Python. Must map to `True` / `False` / `None`.
* **Sub-Agent Prompt**:
  ```
  Fix code injection in the Python code generator:
  1. Add a single exported helper `pyStr(value: string): string` in src/shared/codegen/pythonEscape.ts that returns a fully-quoted, safely-escaped Python string literal. Escape backslashes FIRST, then quotes, then newlines/tabs/carriage returns, and reject or escape non-printable characters. Do not hand-roll partial .replace() chains anywhere else.
  2. Add `pyLiteral(value: unknown)` that emits Python-correct literals for arrays/objects/booleans/null (True/False/None), replacing the JSON.stringify calls in toolAdapters.ts.
  3. Replace EVERY interpolation of a user-controlled string into generated Python with pyStr()/pyLiteral() across pythonAdkGenerator.ts and toolAdapters.ts, including name=, instruction=, model=, branch ids, regex patterns, MCP serverName/command/url/headers, and A2A endpoint/authType.
  4. Do not add silent fallbacks; if a value cannot be safely emitted, throw with a clear message naming the offending node.
  ```
* **Verification**:
  - New unit tests assert that agent labels/prompts containing `"`, `\`, `\"`, `'''`, `"""`, newlines, and `__import__('os').system('x')` produce Python that parses cleanly and contains the payload only as inert data.
  - A round-trip test compiles generated output with `python -m py_compile` (or `ast.parse`) and asserts no `SyntaxError` and no injected top-level statements.

---

### [TASK-133] [CRITICAL] Eliminate Shell String Interpolation in Subprocess Invocation
* **Release**: `v1.0.10`
* **Severity**: Critical — Arbitrary Command Execution
* **Target Package/Files**:
  - `src/extension/AgentEngineDeployer.ts` (lines 1026-1029, 1250-1256, 1626, 1651)
  - `src/extension/McpOAuthManager.ts` (lines 228-233)
  - `src/extension/McpSubprocessManager.ts` (lines 135-136)
  - `src/extension/AgentRunnerManager.ts` (line 710)
  - `tests/extension/subprocessInjection.test.ts` (new)
* **Context**:
  Several call sites build a **shell command string** from user/workflow-controlled values instead of passing an argv array.

  1. **Python `-c` inside a shell string** — `AgentEngineDeployer.ts:1026-1029`:
     ```ts
     const script = `import sys, vertexai; client=vertexai.Client(project='${projectId}', location='${region}'); ... == '${displayName}'), ''))`;
     const res = require('child_process').execSync(`"${pythonCmd}" -c "${script}"`, {...});
     ```
     `displayName`, `projectId`, and `region` are interpolated into a Python literal *inside* a double-quoted shell string — two nested injection contexts. A display name containing `$(...)` or a quote yields shell command execution. The surrounding `catch { return null; }` (line 1037-1039) then hides the failure entirely.
  2. **OAuth browser fallback** — `McpOAuthManager.ts:228-233`:
     ```ts
     const cmd = process.platform === 'darwin' ? `open "${finalUrl}"` : ... ;
     exec(cmd);
     ```
     `finalUrl` passes through `new URL().toString()`, which percent-encodes quotes but **does not encode `$`**. Inside a double-quoted `sh` string, `$(...)` is still evaluated — so an `authUrl` of `https://x.com/?a=$(id)` executes `id`.
  3. **gcloud scopes** — `McpSubprocessManager.ts:135-136`: `scopes.join(',')` is interpolated into an `execAsync` shell string.
  4. **`shell: true` on Windows** — `AgentEngineDeployer.ts:1256`: Node does not escape argv entries for `cmd.exe`, so `&`/`|` in `projectId` or `serviceAccount` break out.
  5. **Login shell probe** — `AgentEngineDeployer.ts:1626`: `execSync(\`${shell} -lc 'which gcloud'\`)`.
  - *Note*: `AgentRunnerManager.killPort()` (lines 983-1035) was reviewed and is **not** injectable — the port is numeric-validated and PIDs are `parseInt`-ed. It is still flagged for blocking sync I/O under TASK-139.
* **Sub-Agent Prompt**:
  ```
  Remove shell interpolation from all subprocess invocations in the extension host:
  1. Replace execSync/exec string-concatenation call sites with execFile/execFileSync/spawn using an explicit argv array and shell:false.
  2. For AgentEngineDeployer.findExistingReasoningEngine, write the probe script to a temp .py file and pass projectId/region/displayName via sys.argv rather than embedding them in source. Delete the temp file in a finally block.
  3. For the OAuth browser fallback, prefer vscode.env.openExternal only; if an OS fallback is truly required use spawn('open', [url]) with an argv array, and validate the URL is http(s) before launching.
  4. Set shell:false for gcloud/python spawns on all platforms; resolve the absolute binary path instead of relying on shell PATH resolution.
  5. Replace the `catch { return null }` in findExistingReasoningEngine with a logged, typed failure that surfaces to the user.
  ```
* **Verification**:
  - Unit tests inject `"; touch /tmp/pwned #`, `$(touch /tmp/pwned)`, and `& calc` into displayName, projectId, scopes, and authUrl and assert the marker file is never created and the values arrive as literal argv entries.
  - A repo-wide lint/grep guard fails CI if `execSync(`/`exec(` is called with a template literal containing `${`.

---

### [TASK-134] [CRITICAL] Contain Workspace File Writes & Validate Webview RPC Payloads
* **Release**: `v1.0.10`
* **Severity**: Critical — Path Traversal / Arbitrary File Overwrite
* **Target Package/Files**:
  - `src/extension/AgentEditorProvider.ts` (lines 404-426, 528-538, 574-593, 358)
  - `src/shared/rpcProtocol.ts`
  - `tests/extension/rpcPayloadValidation.test.ts` (new)
* **Context**:
  1. **Unbounded file write** — `AgentEditorProvider.ts:404-426`:
     ```ts
     const targetDir = payload.targetDirectory && workspaceFolders
       ? vscode.Uri.joinPath(workspaceFolders[0].uri, payload.targetDirectory) : ...;
     for (const file of payload.files) {
       const fileUri = vscode.Uri.joinPath(targetDir, file.path);
       await vscode.workspace.fs.writeFile(fileUri, buffer);
     }
     ```
     Neither `payload.targetDirectory` nor `file.path` is validated. `Uri.joinPath` **resolves** `../`, so a path of `../../../../.zshrc` (or `.git/hooks/pre-commit`) escapes the workspace and is overwritten with **no existence check and no user confirmation**. `file.path` originates from LLM output, which is itself steered by attacker-controllable agent instructions in the `.agent` file.
  2. **Unvalidated MCP discovery** — lines 528-538: `payload.command` / `payload.args` are forwarded to `mcpManager.discoverTools` and spawned. Combined with an untrusted `.agent` file this is a direct execution path.
  3. **Unvalidated runner directory** — lines 574-593: `START_LOCAL_RUNNER` accepts an arbitrary `targetDirectory` that may resolve outside the workspace.
* **Sub-Agent Prompt**:
  ```
  Harden the extension-host RPC trust boundary:
  1. Add src/extension/security/pathGuard.ts exporting assertInsideWorkspace(baseUri, candidateRelPath) that normalizes the joined path and throws unless the resolved fsPath is strictly contained within baseUri.fsPath. Reject absolute paths, drive letters, UNC prefixes, and any '..' segment.
  2. Apply the guard to WRITE_FILES_TO_WORKSPACE (both targetDirectory and every file.path) and to START_LOCAL_RUNNER's targetDirectory.
  3. Before overwriting an existing file, collect the conflicts and require a single explicit user confirmation (vscode.window.showWarningMessage with a modal) listing how many files will be overwritten.
  4. Add runtime payload validation (a small hand-written type guard per message type, no new dependency) in rpcProtocol.ts; reject and log malformed payloads instead of destructuring them blindly.
  5. Restrict DISCOVER_MCP_TOOLS stdio commands to an allowlist (npx, uvx, python, python3, node, docker) and require explicit user confirmation before spawning any command originating from a newly-opened .agent file.
  ```
* **Verification**:
  - Tests assert `file.path` values of `../evil.txt`, `/etc/passwd`, `..\\..\\evil`, and `.git/hooks/pre-commit` are rejected and no write occurs outside the target dir.
  - Test asserts an overwrite of an existing file does not proceed without confirmation.

---

### [TASK-135] [CRITICAL] Migrate Gemini API Key & OAuth Tokens to VS Code SecretStorage
* **Release**: `v1.0.10`
* **Severity**: Critical — Credential Exposure
* **Target Package/Files**:
  - `package.json` (`agentFlow.geminiApiKey` contribution)
  - `src/extension/AgentEditorProvider.ts` (lines 286-290, 330, 454)
  - `src/extension/McpOAuthManager.ts` (lines 295-330, 388, 411)
  - `src/webview/components/settings/SettingsPage.tsx` (lines 324, 348-366)
  - `.gitignore`
* **Context**:
  1. **API key in plaintext settings** — `package.json` declares `agentFlow.geminiApiKey` as a plain `string` configuration property, and it is read via `workspace.getConfiguration('agentFlow').get<string>('geminiApiKey')` at `AgentEditorProvider.ts:286, 330, 454`. This writes the key in cleartext to `settings.json`, which is commonly committed to source control and is propagated by **VS Code Settings Sync**. `SettingsPage.tsx:324` tells the user *"API keys are securely stored in VS Code SecretStorage"* — the UI copy is currently **false**.
  2. **Tokens written to `.env` while `.gitignore` lacks `.env`** — `McpOAuthManager` persists bearer tokens to a workspace `.env` (correctly *also* using `context.secrets`). The repo `.gitignore` contains no `.env` entry, and the code that appends to `.gitignore` swallows failures in an empty `catch {}` (line 411), so a write failure silently leaves credentials committable.
  3. Empty `catch {}` at line 388 hides `.env` write failures.
* **Sub-Agent Prompt**:
  ```
  Move all credentials to secure storage:
  1. Remove agentFlow.geminiApiKey from package.json contributes.configuration. Replace it with a command 'agentFlow.setGeminiApiKey' that prompts via showInputBox({password:true}) and stores through context.secrets.store().
  2. Add a one-time migration: on activate, if the deprecated setting has a value, copy it into SecretStorage, clear the setting value, and notify the user that the key was migrated.
  3. Route all reads through a single SecretsProvider abstraction; never pass the raw key into the webview - the webview must only ever receive a boolean 'isSet' flag (AgentEditorProvider.ts:290 already does this correctly, keep that pattern).
  4. Add `.env` and `.env.*` to .gitignore. Replace the empty catch blocks in McpOAuthManager (lines 388, 411) with explicit error surfacing so a failure to protect the token is never silent.
  5. Update SettingsPage.tsx copy so it accurately describes where the key is stored, and make the input write-only (never render the stored secret back).
  ```
* **Verification**:
  - Test asserts no code path reads `geminiApiKey` from `workspace.getConfiguration`, and that the webview `SETTINGS_SYNC` payload never contains key material.
  - Test asserts the migration clears the plaintext setting, and that `.gitignore` contains `.env`.

---

### [TASK-136] [CRITICAL] Prevent Silent Data Loss on Malformed `.agent` Documents
* **Release**: `v1.0.10`
* **Severity**: Critical — Irreversible User Data Loss
* **Target Package/Files**:
  - `src/extension/AgentEditorProvider.ts` (lines 253-262, 838-854, 928-939, 311-316)
  - `src/webview/hooks/useExtensionSync.ts` (lines 178, 296-366)
  - `tests/extension/documentRecovery.test.ts` (new)
* **Context**:
  1. **Silent reset to empty graph** — `AgentEditorProvider.ts:255-262`:
     ```ts
     try {
       parsedDoc = docText.trim().length > 0 ? JSON.parse(docText) : this.createEmptyWorkflow(document.uri);
     } catch {
       parsedDoc = this.createEmptyWorkflow(document.uri);
     }
     ```
     If the user hand-edits the `.agent` JSON and introduces a syntax error (or the file is truncated by a bad merge), the editor **silently loads an empty workflow** and pushes it to the webview. The webview then echoes state back via `DOCUMENT_UPDATED`, and the extension applies a **full-range replace** (line ~928-939), permanently destroying the user's graph. This is a one-keystroke path to total loss of work and directly violates the project's "no undocumented fallbacks — fail fast" rule.
  2. **Whole-document replace destroys cursor/selection** and floods IPC on every canvas frame (no debounce, no deep-equality check).
  3. **`isUpdatingFromWebview` echo-guard race** — line 311-316: the flag is flipped around an `await vscode.workspace.applyEdit(...)`, so overlapping messages can re-enter.
  4. **No schema version migration** — `useExtensionSync.ts:178` defaults `version` to `'1.0.0'` on save without inspecting the loaded document's version.
* **Sub-Agent Prompt**:
  ```
  Make .agent document handling loss-proof:
  1. On JSON.parse failure, do NOT substitute an empty workflow. Enter an explicit 'parse error' state: post a PARSE_ERROR message to the webview which renders a blocking error overlay showing the parser message, and refuse to emit any DOCUMENT_UPDATED until the user fixes the file or explicitly chooses 'Reset to empty workflow'.
  2. Never write to the document while in parse-error state.
  3. Debounce webview -> host document sync (~250ms) and skip the edit entirely when the serialized content is byte-identical to the current document text.
  4. Replace the full-range WorkspaceEdit with a minimal-diff TextEdit so cursor position and selection survive split-view editing.
  5. Replace the boolean isUpdatingFromWebview guard with a monotonically increasing revision/sequence number compared on both sides to make the echo-guard race-free.
  6. Read and honor doc.version on load; add an explicit migration hook and fail loudly on an unknown future version rather than silently rewriting it.
  ```
* **Verification**:
  - Regression test: load a `.agent` file with malformed JSON, assert the on-disk bytes are **unchanged** after the webview signals READY and after a simulated canvas interaction.
  - Test asserts no `applyEdit` is issued when serialized content is unchanged.

---

### [TASK-137] [MAJOR] Harden Webview CSP & Inline Bootstrap Serialization
* **Release**: `v1.0.10`
* **Severity**: Major — XSS Hardening
* **Target Package/Files**:
  - `src/extension/AgentEditorProvider.ts` (lines 1134, 1148, 1160-1161, 199-207)
* **Context**:
  1. **CSP is not strict despite the docstring claiming it is** — line 1134:
     ```
     script-src 'nonce-${nonce}' 'unsafe-eval' ${cspSource}; style-src ${cspSource} 'unsafe-inline';
     ```
     `'unsafe-eval'` materially weakens the policy. The class docstring at line 14 advertises "strict Content Security Policy" — the comment and the code disagree.
  2. **`</script>` break-out in the bootstrap** — line 1160:
     ```ts
     ${initialDoc ? `window.__INITIAL_AGENT_DOCUMENT__ = ${JSON.stringify(initialDoc)};` : ''}
     ```
     `JSON.stringify` does **not** escape `<` or `/`. A workflow whose agent name contains `</script><img src=x onerror=...>` terminates the inline script block early. The nonce-based CSP blocks the injected script from *executing*, so this is Major rather than Critical, but it corrupts the bootstrap, breaks webview load, and is one CSP regression away from full XSS.
  3. **Broad `localResourceRoots`** — lines 202-207 grant more than the compiled `dist` webview assets.
* **Sub-Agent Prompt**:
  ```
  Harden the webview HTML generation in AgentEditorProvider.getHtmlForWebview:
  1. Remove 'unsafe-eval' from script-src. Build and verify the bundle still loads; if a dependency requires eval, document precisely which one and why in a NOTE comment rather than leaving it unexplained.
  2. Replace 'unsafe-inline' in style-src with the existing nonce on the inline <style> block.
  3. Escape the inlined JSON: add a helper that runs JSON.stringify then replaces '<' with '\\u003c', '>' with '\\u003e', '&' with '\\u0026', and U+2028/U+2029. Apply it to both __INITIAL_AGENT_DOCUMENT__ and __INITIAL_AGENT_FILE_PATH__. Preferred alternative: drop the inline bootstrap entirely and deliver the initial document via webview.postMessage after READY.
  4. Narrow localResourceRoots to only the compiled dist/webview directory.
  5. Fix the class docstring so it describes the policy that is actually emitted.
  ```
* **Verification**:
  - Test asserts the generated HTML contains no `unsafe-eval` / `unsafe-inline`.
  - Test asserts a workflow named `</script><script>x=1</script>` produces HTML with no unescaped `</script>` inside the bootstrap block.

---

### [TASK-138] [MAJOR] Topological Ordering, Python Keyword & Duplicate Identifier Safety
* **Release**: `v1.0.11`
* **Severity**: Major — Generated Code Is Invalid
* **Target Package/Files**:
  - `src/shared/codegen/pythonAdkGenerator.ts` (lines 651-724)
  - `src/shared/codegen/toolAdapters.ts` (lines 37-49)
* **Context**:
  1. **No topological ordering** — agents are emitted in raw array order (line 655). A router branching to an agent defined later in the array emits a Python `NameError` at import time. Cyclic graphs are not detected at all.
  2. **Python reserved words not handled** — `sanitizePythonIdentifier` (`toolAdapters.ts:37-49`) lowercases and strips non-alphanumerics but never checks keywords. An agent named "Class" emits `class = Agent(...)` → `SyntaxError`. Same for `import`, `def`, `return`, `None`, `lambda`, etc.
  3. **No de-duplication** — "Support Agent" and "Support-Agent" both sanitize to `support_agent`; the second silently overwrites the first, so an agent vanishes from the generated system with no warning.
  - *Note*: the sanitizer **is** injection-safe (the `[^a-z0-9_]+` strip removes all metacharacters), so this is a correctness bug rather than a security bug. The security exposure lives in the string literals covered by TASK-132.
* **Sub-Agent Prompt**:
  ```
  Make generated Python structurally valid for all graphs:
  1. Add a topological sort over the agent/router graph before emission. Emit nodes in dependency order.
  2. Detect cycles explicitly and fail fast with an error naming the participating nodes; do not emit partial output.
  3. Extend sanitizePythonIdentifier to append a '_agent' suffix when the result collides with a Python keyword or builtin (use a complete keyword list).
  4. Introduce an identifier allocator that tracks assigned names per generation run and appends _2, _3 on collision, and surface a webview warning when two nodes collide so the user can rename them.
  5. Where a genuine forward reference is unavoidable (e.g. AgentTool referencing a sub-agent across modules), use lazy/late binding and emit the required import.
  ```
* **Verification**:
  - Tests cover: router→router forward reference, a 3-node cycle (must fail fast), agents named `class`/`import`/`None`, and two agents colliding on one identifier.
  - Generated output for each fixture passes `ast.parse`.

---

### [TASK-139] [MAJOR] Remove Blocking `execSync` & Add Network Timeouts on Host Thread
* **Release**: `v1.0.11`
* **Severity**: Major — UI Freeze / Hung Operations
* **Target Package/Files**:
  - `src/extension/GeminiCodeGenEngine.ts` (lines 271-282, 337, 409, 439, 452, 479, 550)
  - `src/extension/AgentEngineDeployer.ts` (lines 1626, 1651)
  - `src/extension/AgentRunnerManager.ts` (lines 710, 983-1035)
  - `src/extension/views/AgentEngineDeploymentsTreeProvider.ts` (lines 256, 292)
* **Context**:
  The VS Code extension host is single-threaded; every `execSync` freezes the **entire IDE UI**.
  1. `GeminiCodeGenEngine.ts:439, 452, 479` shell out to `gcloud` synchronously during auth.
  2. `AgentRunnerManager.killPort()` (983-1035) chains up to four `execSync` calls with 2-3s timeouts each, wrapped in six nested empty `catch {}` blocks.
  3. `AgentEngineDeployer.ts:1626, 1651` run `which gcloud` / `where` synchronously.
  4. **Unbounded `fetch`** — `GeminiCodeGenEngine.ts:337, 409` call the Gemini and Vertex endpoints with no timeout; a hung connection stalls code generation forever with no cancellation.
  5. **Silent auth fallback** — lines 271-282: when an explicitly configured API key fails, the code silently falls back to ADC, masking a revoked/invalid key. Violates the fail-fast rule.
  6. **Brittle LLM response parsing** — line 550: a regex over the returned JSON risks dropping valid generated files.
  7. `findFiles('**/*.agent')` with no `maxResults` cap in the deployments tree provider.
* **Sub-Agent Prompt**:
  ```
  Unblock the extension host event loop and bound all I/O:
  1. Convert every execSync call in the extension host to promisified execFile/spawn. Keep timeouts, but make them non-blocking.
  2. Wrap all fetch calls to generativelanguage.googleapis.com and aiplatform.googleapis.com with AbortSignal.timeout(30000) and surface a cancellable vscode.window.withProgress UI.
  3. Remove the silent ADC fallback at GeminiCodeGenEngine.ts:271-282. If an API key is explicitly configured and rejected, throw with the underlying auth error. Only use ADC when no key is configured at all.
  4. Replace the empty catch blocks in killPort with debug-level logging that records which strategy failed.
  5. Parse the LLM response as JSON with a strict schema check instead of the fileBlockRegex; fail fast with the raw response attached to the output channel when parsing fails.
  6. Add a maxResults cap and a workspace-scoped exclude to the findFiles calls.
  ```
* **Verification**:
  - Test asserts no `execSync` import remains in `src/extension/` (CI grep guard).
  - Test asserts a stalled fetch rejects within the configured timeout rather than hanging.

---

### [TASK-140] [MAJOR] Fix Runner Start Races, Unsettled Promises & Timer/Process Leaks
* **Release**: `v1.0.11`
* **Severity**: Major — State Corruption / Resource Leaks
* **Target Package/Files**:
  - `src/extension/AgentRunnerManager.ts` (lines 750-776, 574, 594)
  - `src/extension/McpSubprocessManager.ts` (lines 282-291, 694-744)
  - `src/extension/McpOAuthManager.ts` (lines 84, 205-214)
  - `src/extension/PythonEnvResolver.ts` (lines 193, 271, 367)
* **Context**:
  1. **Start race** — `AgentRunnerManager.ts:750-776`: `this.runnerStatus = 'starting'` and `this.lastRunningPort = port` are global mutable fields written *before* `await pythonResolver.ensureVirtualEnvironment(...)`. Two rapid start requests interleave across that await and corrupt runner state / port bookkeeping.
  2. **Promise that never settles** — `McpSubprocessManager.ts:694-744`: the secondary `listReq` sets a `timeout` option but registers no `'timeout'` listener. In Node, the socket is *not* destroyed automatically, so the request hangs and the surrounding promise never resolves or rejects — a permanent leak of the MCP discovery flow.
  3. **SIGKILL fallback timer leak** — `McpSubprocessManager.ts:282-291`: the 1000ms escalation timer is never `clearTimeout`-ed when the child exits gracefully.
  4. **OAuth loopback socket leak** — `McpOAuthManager.ts:84`: `server.close()` stops new connections but leaves active sockets open, holding the port.
  5. **Missing OAuth CSRF/PKCE** — lines 205-214 build the authorization URL with no `state` parameter and no PKCE `code_challenge`.
  6. **Silent I/O failures** — `AgentRunnerManager.ts:574, 594` and `PythonEnvResolver.ts:193, 271, 367` swallow write/unlink/venv errors, orphaning temp scripts and hiding broken environments.
* **Sub-Agent Prompt**:
  ```
  Fix concurrency and lifecycle defects in the runtime layer:
  1. Guard startLocalRunner with an async mutex / in-flight promise keyed by runnerId so concurrent starts await the same operation instead of racing. Do not mutate shared status fields before awaits; compute locally and commit after.
  2. Add a 'timeout' listener to the listReq HTTP request in McpSubprocessManager that destroys the socket and settles the promise. Audit every new Promise((resolve,reject)=>...) in these files and assert every branch (error, close, timeout, non-2xx) settles exactly once.
  3. clearTimeout the SIGKILL escalation timer in the child's exit/close handler.
  4. Track sockets on the OAuth loopback server and destroy them in close(); bind explicitly to 127.0.0.1.
  5. Implement OAuth 2.1 correctness: generate a cryptographically random `state` and a PKCE code_verifier/code_challenge, include them in the auth URL, and verify `state` on callback before exchanging the code.
  6. Replace the empty catch blocks with logged errors; a failure to write or clean up a temp runner script must be visible in the output channel.
  ```
* **Verification**:
  - Regression test: invoking `startLocalRunner` twice concurrently yields one process and a consistent port.
  - Test asserts an unresponsive MCP endpoint rejects within the timeout instead of hanging forever.
  - Test asserts a mismatched `state` on OAuth callback is rejected.

---

### [TASK-141] [MAJOR] Fix Canvas Re-Render Storms & Document Serialization Thrash
* **Release**: `v1.0.11`
* **Severity**: Major — Interactive Performance
* **Target Package/Files**:
  - `src/webview/App.tsx` (lines 858-884, 1322-1364, 721-752, 1438-1444, 1651)
  - `src/webview/hooks/useWorkflowState.ts` (lines 170-171)
  - `src/webview/components/Canvas/nodes/AgentNode.tsx`
* **Context**:
  1. **`React.memo` fully defeated** — `App.tsx:858-884`: `enrichedNodes` rebuilds `{ ...node, data: { ...node.data, onEdit } }` for **every node on every render**. `AgentNode` *is* correctly wrapped in `memo()` (AgentNode.tsx:218), but the new `data` object reference on each frame guarantees a prop-identity miss, so panning/dragging re-renders the entire graph — O(N) per frame.
  2. **Full document serialization per frame** — `App.tsx:1322-1364`: `currentWorkflowDocument` deep-maps all nodes and edges inside a `useMemo` keyed on `nodes`, so it re-runs on every drag tick, generating heavy GC churn.
  3. **Derived-state effect loop** — `App.tsx:721-752`: an effect recomputes `isStartNode` and calls `setNodes`, causing a second render pass on every connection change.
  4. **Argument mutation** — `App.tsx:1438-1444`: `partialData` is mutated in place before being handed to a state setter.
  5. **Ref write during render** — `useWorkflowState.ts:170-171`: `docRef.current = document` executes in the render body, which is unsafe under concurrent rendering.
  6. **Inline object prop** — `App.tsx:1651` allocates a fresh object literal for the drawer's `agent` prop each render, forcing the ~1600-line drawer to re-render.
* **Sub-Agent Prompt**:
  ```
  Restore canvas rendering performance in the webview:
  1. Stop injecting callbacks into node.data. Provide onEdit/onDelete/onDuplicate through a React context (GraphActionsContext) consumed inside AgentNode, so node objects keep stable identity across frames.
  2. Delete the currentWorkflowDocument useMemo; build the export payload imperatively inside the handlers that actually need it (generate, save, deploy).
  3. Compute isStartNode synchronously inside onConnect/onEdgesChange instead of in a reactive effect.
  4. Copy partialData before mutating it.
  5. Move the docRef assignment into useEffect/useLayoutEffect.
  6. Memoize the object passed as the drawer's agent prop with useMemo keyed on the selected node id and its data.
  7. Verify with the React DevTools profiler that dragging one node re-renders only that node.
  ```
* **Verification**:
  - Profiler-based assertion (or a render-counter test harness) proving a single node drag does not re-render sibling nodes.
  - No behavioral regressions in existing canvas tests.

---

### [TASK-142] [MAJOR] Decompose God Classes (Runner, Deployer, EditorProvider, App.tsx)
* **Release**: `v1.0.12`
* **Severity**: Major — Maintainability / SRP
* **Target Package/Files**:
  - `src/extension/AgentRunnerManager.ts` (2707 LOC)
  - `src/extension/AgentEngineDeployer.ts` (2438 LOC)
  - `src/extension/AgentEditorProvider.ts` (1468 LOC)
  - `src/extension/GeminiCodeGenEngine.ts` (1138 LOC)
  - `src/webview/App.tsx` (1804 LOC)
* **Context**:
  Five files carry ~9,500 LOC and mix four-plus responsibilities each. This is the single largest impediment to safely landing the fixes above, and it directly violates the AGENTS.md rule: *"Do not write large files, break the files up into components and helper classes."* Proposed splits:

  | File | LOC | Currently mixes | Proposed split |
  | :--- | :--- | :--- | :--- |
  | `AgentRunnerManager.ts` | 2707 | Python script templating (430+ line embedded template), process lifecycle, HTTP inference client, chat session state | `AgentTestRunnerScriptFactory`, `LocalProcessRunner`, `AgentScenarioExecutor`, `ChatSessionManager` |
  | `AgentEngineDeployer.ts` | 2438 | Scaffolding/fs, subprocess execution, operation polling, auth, metadata persistence | `AgentScaffolder`, `DeploymentExecutor`, `DeploymentMetadataStore` |
  | `AgentEditorProvider.ts` | 1468 | Editor lifecycle, HTML/CSP templating, 20+ RPC handlers, workspace fs I/O | `AgentRpcDispatcher`, `WebviewTemplateEngine`, `WorkspacePathResolver` |
  | `GeminiCodeGenEngine.ts` | 1138 | Prompt templating, HTTP clients, response sanitization, assertion evaluation | `GeminiApiClient`, `CodePostProcessor`, `AgentTestEvaluator` |
  | `App.tsx` | 1804 | ReactFlow state, MCP IPC, OAuth bridge, serialization, panel layout | `useMcpBridge`, `useCodeGeneration`, `useCanvasGraph`, `AppLayout` |
* **Sub-Agent Prompt**:
  ```
  Decompose the five god classes listed in the table above. Work one file at a time, in this order: AgentEditorProvider, GeminiCodeGenEngine, AgentEngineDeployer, AgentRunnerManager, App.tsx.
  Rules:
  - Pure mechanical extraction only. Do NOT change behavior in this task; the security and correctness fixes are tracked separately in TASK-132..TASK-141.
  - Run the full test suite after each extraction and keep it green (baseline: 536 passing).
  - Preserve every existing comment and docstring; add a class-level docstring to each new module per AGENTS.md, including the Author tag.
  - Extract the large embedded Python runner template into its own resource file rather than a TS string constant.
  ```
* **Verification**:
  - `npm test` remains green (>= 536 passing) after every extraction step.
  - No file in `src/` exceeds ~600 LOC afterward; each new module has a single stated responsibility.

---

### [TASK-143] [MAJOR] Unify Duplicated Domain Types, Extract Drawer Primitives & Remove Dead Code
* **Release**: `v1.0.12`
* **Severity**: Major — DRY / Drift Risk
* **Target Package/Files**:
  - `src/shared/types.ts` (393 LOC) vs `src/webview/types.ts` (551 LOC)
  - `src/webview/components/inspector/A2AAgentDrawer.tsx` (1592), `StandardAgentDrawer.tsx` (1099), `RouterAgentDrawer.tsx` (740), `tools/McpToolDrawer.tsx` (1390)
  - `src/webview/hooks/useWorkflowState.ts`
  - `src/webview/data/patterns.ts` (1379), `src/webview/data/googleCloudMcpServers.ts` (980)
* **Context**:
  1. **Duplicated domain model** — `src/shared/types.ts` and `src/webview/types.ts` independently define overlapping core types (`ToolDefinition`, `AgentKind`, `McpToolConfig`, `AgentWorkflowDocument`) with already-visible drift (e.g. `icon` exists on the webview `ToolDefinition` but not the shared one). Since these types describe the payloads crossing the extension↔webview boundary, drift produces silent serialization mismatches.
  2. **~4,800 LOC of inspector drawers** with heavy copy-paste: each re-implements label/field/section scaffolding, model dropdowns, attached-tool lists, and sub-agent reorder lists.
  3. **Dead code** — `useWorkflowState()` is referenced **only by its own test file** (`tests/webview/useWorkflowState.test.ts`); `App.tsx` does not consume the hook. Only the standalone `syncWorkflowSubAgents` export is actually exercised. This is tested dead code, which is worse than untested dead code because it looks maintained.
  4. **Data/logic mixing** — `patterns.ts` and `googleCloudMcpServers.ts` combine static catalogs with factory/transformation functions.
  5. **Zero component-level test coverage** — the `tests/webview/` suites assert static data shapes and pure helpers; none of the 40+ React components are rendered in a test. Against the AGENTS.md "100% coverage" rule this is the largest coverage gap in the repo.
* **Sub-Agent Prompt**:
  ```
  Consolidate duplication and remove dead code in the webview layer:
  1. Make src/shared/types.ts the single source of truth for every type that crosses the extension<->webview boundary. Delete the duplicates from src/webview/types.ts and re-export from shared. Keep only genuinely webview-only view-model types local, and document why each one is local.
  2. Extract shared drawer primitives into src/webview/components/inspector/common/: DrawerSection, LabeledField, ModelSelect, AttachedToolsList, SubAgentReorderList, BranchReorderList, plus a useAgentIdentifier hook. Refactor all four drawers onto them and delete the copy-pasted blocks.
  3. Either wire useWorkflowState into App.tsx as the canonical graph-state hook, or delete the hook and its test and keep only syncWorkflowSubAgents. Decide explicitly and record the decision in the file's class docstring.
  4. Split patterns.ts into patternData.ts + nodeFactory.ts, and googleCloudMcpServers.ts into mcpCatalogData.ts + mcpToolMapper.ts.
  5. Add @testing-library/react and write render-level tests for the four inspector drawers and the canvas node components, covering empty, populated, and invalid-input states.
  ```
* **Verification**:
  - No type name is declared in both `src/shared/types.ts` and `src/webview/types.ts`.
  - Combined LOC of the four drawers drops materially (target: >30% reduction) with no behavior change.
  - Component render tests exist and pass for all inspector drawers and canvas nodes.

