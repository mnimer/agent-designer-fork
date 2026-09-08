# Visual Studio Code Agent Flow Builder — Phased Release Plan

> **Author**: Mike Nimer <mikenimer@google.com>  
> **Status**: Approved Blueprint  
> **Target Platform**: Visual Studio Code Extension (VS Code Desktop & Web)  
> **Core Frameworks**: Google GenAI SDK / Google ADK (Python & TypeScript), LangGraph  

---

## Executive Summary

The **Visual Studio Code Agent Flow Builder** is a visual IDE extension and canvas orchestrator designed to model, configure, test, and generate production-ready code for complex multi-agent AI systems.

To ensure fast iteration, robust test coverage, and strict quality gates, engineering is structured across **13 progressive releases**. Each release builds incrementally upon the prior version—starting with single-agent foundations, adding state persistence, inter-agent A2A protocols, decision routing, tools, structured output schemas, MCP, and culminating in multi-framework support (LangGraph & TypeScript) and advanced cognitive patterns.

```
+---------------------------------------------------------------------------------------------------------+
|                                    PROGRESSIVE RELEASE ROADMAP                                          |
+=========================================================================================================+
| [v1.0.0] Core Foundation • Single Agent • Google Search Tool • Test Suite Trigger • ADK Python Runner   |
|     ↓                                                                                                   |
| [v1.0.1] Interactive Chat Trigger • Cloud Run IaC • Native Agent Engine Container Deployment            |
|     ↓                                                                                                   |
| [v1.0.2] Multi-Agent Topologies & Delegation Patterns (Sequential Pipeline, Parallel Fan-Out)          |
|     ↓                                                                                                   |
| [v1.0.3] Memory & State Checkpointing (In-Memory Buffer, Google Cloud Firestore Checkpointer)           |
|     ↓                                                                                                   |
| [v1.0.4] Agent-to-Agent (A2A) Protocol Node (A2A Agent Card, JSON-RPC Client, Bearer/API Key Auth)     |
|     ↓                                                                                                   |
| [v1.0.5] Conditional Router Node & Dynamic Branching Logic (Boolean, LLM Classifier, Threshold)        |
|     ↓                                                                                                   |
| [v1.0.6] Extended Tools (Custom REST API Builder with Secret Manager & Python Code Sandbox)             |
|     ↓                                                                                                   |
| [v1.0.7] Structured Output Schema Builder (Typed Schema Field Editor, Pydantic & JSON Schema Preview)  |
|     ↓                                                                                                   |
| [v1.0.8] Model Context Protocol (MCP) Tool Integration (stdio subprocess, SSE, HTTP transports)         |
|     ↓                                                                                                   |
| [v1.0.9] Event-Driven Triggers (Pub/Sub, Cron, Eventarc) & Enterprise Cloud IAM OIDC Auth               |
|     ↓                                                                                                   |
| [v1.1.0] LangGraph Framework Support (Python StateGraph, TypedDict State, Conditional Edges)            |
|     ↓                                                                                                   |
| [v1.1.1] TypeScript Runtime Support (TypeScript @google/genai SDK, Node.js Repository, Vitest)          |
|     ↓                                                                                                   |
| [v1.1.2] Advanced Cognitive Patterns (Debate, Evaluator-Optimizer, Triad) & Enterprise Blueprints       |
+---------------------------------------------------------------------------------------------------------+
```

---

## Architecture & Packaging Overview

```
+-----------------------------------------------------------------------------------------+
|                                 VS Code Extension Host                                  |
|  [extension.ts]                                                                         |
|    ├── CustomTextEditorProvider (*.agent JSON)                                          |
|    ├── AgentRunnerManager (Subprocess CLI / Session turns / stdout streamer)            |
|    ├── WorkspaceFileSystemWatcher & CodeExporter                                        |
|    └── SettingsBridge (VS Code Global & Workspace Configuration)                        |
+--------------------------------------------▲--------------------------------------------+
                                             │ Typed RPC via postMessage
+--------------------------------------------▼--------------------------------------------+
|                             Webview React Application (SPA)                             |
|  [App.tsx]                                                                              |
|    ├── VSCodeChrome Shell (Titlebar, Tabs, ActivityBar, Statusbar, 3 Themes)            |
|    ├── Floating Palette (Agents, Tools, Triggers, Samples)                              |
|    ├── React Flow Canvas (AgentNode, TriggerNode, Dynamic Sockets, Dagre Layout)        |
|    ├── Inspector Drawers (Standard, Router, A2A, Trigger, Tool, Structured Output)     |
|    └── Bottom Workbench Panel (Generated Code, Cloud Deployment IaC, Test Runner)      |
+-----------------------------------------------------------------------------------------+
```

---

## Release Milestones & Scope Breakdown

### Release 1.0.0 — Core Foundation & Single Agent Execution
**Theme**: Establish the VS Code Extension shell, custom `.agent` editor, single agent configuration, Google Search grounding, Python ADK code generation, and managed session test runner.

* **Features**:
  1. **Extension Shell & Webview Scaffold**:
     - `vscode.CustomTextEditorProvider` registered for `*.agent` files.
     - Dark, Light, and High Contrast VS Code theme synchronization.
     - Native title bar, tab buffer manager, collapsible bottom panel (2/3 canvas, 1/3 panel with smooth drag resizing).
  2. **Single Agent Canvas Modeling**:
     - Drag single agent node from palette to canvas.
     - Configure Agent Label, Role Definition, Color Theme, Model (`gemini-flash-latest`, `gemini-3.7-flash`), Temperature (`0.0` - `2.0`), Max Iterations, System Instructions.
     - Single target/source handles, delete, edit, duplicate actions.
  3. **Built-in Tool: Google Search Grounding**:
     - Attach `Google Search Grounding` tool to the agent.
     - Tool badge rendering on node card with remove action.
  4. **Trigger: Test Suite Trigger**:
     - Drag Test Suite Trigger node and wire edge to the agent node.
     - Configure Test Cases (Prompt, Expected Output, Assertion: `contains_text`, `exact`, `regex`).
  5. **Gemini Prompt-Driven Code Generation Engine (Google ADK Python)**:
     - Invokes Gemini (`@google/genai`) using dedicated framework prompt template (`prompts/python-adk.prompt.txt`) parameterized with active `.agent` JSON graph.
     - Produces complete, production-grade repository: `agent_workflow.py`, `tools.py`, `main.py`, `test_pipeline.py`, `requirements.txt`, `main.tf`, `cloudbuild.yaml`, `Dockerfile`, `README.md`.
     - In-panel multi-file syntax viewer with copy and file export to workspace.
  6. **Managed Subprocess Test Runner**:
     - Extension backend spawns Python agent runner process.
     - Executes each test case in a discrete session, streams stdout/trace logs, validates assertions, and renders step-by-step timings in the UI.
  7. **State Management & History**:
     - Undo/Redo history stack (`Cmd+Z` / `Cmd+Y`).
     - Auto-layout integration (`LR` / `TB` using Dagre).
     - Full JSON serialization/deserialization for `.agent` files.
  8. **VS Code Activity Bar & Sidebar Explorer**:
     - Official Activity Bar container (`viewsContainers.activitybar`) with custom icon.
     - Sidebar tree view scanning workspace for `*.agent` workflows with quick create/open actions.
     - Deployments status tree view for active local runners and remote Agent Engine endpoints.
  9. **VSIX Packaging & GitHub Actions Release Pipeline**:
     - Automated `@vscode/vsce` packaging script with production `.vscodeignore`.
     - GitHub Actions workflow triggered on version tags (`v*.*.*`) on `main` branch to test, build, and publish `.vsix` releases.

* **Acceptance Criteria**:
  - Opening a `.agent` file launches the custom visual editor.
  - Clicking "Generate Code" invokes Gemini with `prompts/python-adk.prompt.txt` and renders full multi-file project tabs.
  - Clicking "Run All Unit Tests" runs tests against a real Python subprocess and reports pass/fail with execution latency.
  - Pushing a git version tag builds a clean `.vsix` bundle and drafts a GitHub release.
  - 100% unit test coverage on extension backend, serialization, and prompt parser functions.

---

### Release 1.0.1 — Interactive Chat & Cloud Deployment (Cloud Run & Native Agent Engine)
**Theme**: Add conversational chat trigger, interactive chat testing, automated Terraform infrastructure-as-code generation for Google Cloud Run / shared GCP foundation, and native container deployment to Vertex AI Agent Engine (Agent Runtime).

* **Features**:
  1. **Chat Trigger Node (`chat`)**:
     - Visual trigger node with emerald styling and `MessageSquare` icon.
     - Configurable welcome message and streaming flag.
  2. **Interactive In-Editor Chat Runner**:
     - New "Interactive Chat" tab in the bottom workbench panel.
     - Allows real-time streaming conversational testing with the agent workflow.
  3. **Cloud Infrastructure IaC Panel (`DeploymentTab`)**:
     - Deployment Target Selector: **Google Cloud Run (v2 Service)** vs **Shared GCP Infrastructure**.
     - Automatic extraction of runtime secrets (e.g., `GEMINI_API_KEY`).
     - Generates production-ready `main.tf` (Terraform provider `google` / `google-beta`) for Cloud Run, Artifact Registry, IAM service accounts, and optional PSC Network Attachments for private VPC connectivity.
     - One-click copy and export to `./deploy/` directory.
  4. **Native Vertex AI Agent Engine (Agent Runtime) Container Deployment**:
     - Container-based deployment following Google ADK specifications (`agents-cli deploy`).
     - Generates `cloudbuild.yaml` for automated testing and Agent Runtime deployment in GCP.
     - Generates project-root `Dockerfile`, `.gcloudignore`, and `fast_api_app.py` mounting ADK `/run_sse`, A2A routes, and reasoning engine adapter routes.
     - Manages `deployment_metadata.json` (`remote_agent_runtime_id`, `deployment_target: "agent_runtime"`, `is_a2a`, `agent_directory`, `deployment_timestamp`).
     - Real-time build and deployment log streaming via `WebviewBridge`.
     - Live testing against the deployed engine via the `/api` HTTP passthrough:
       `https://{location}-aiplatform.googleapis.com/reasoningEngines/v1/{resource}/api/run_sse`
  5. **Visual Samples & Blueprints Gallery (Samples Tab & Palette)**:
     - Dedicated interactive visual catalog in the canvas diagram's `Samples` tab and floating palette.
     - Curated production-ready enterprise blueprints (Company Verifier, Customer Support Specialist, Financial Research Analyst, Code Quality Critic Triad).
     - Visual preview cards with tags, descriptions, and one-click loading into canvas.

* **Acceptance Criteria**:
  - Wiring a Chat Trigger allows live multi-turn chat in the bottom panel.
  - Generating Cloud Run Terraform produces valid HCL with Secret Manager bindings and public/private invoker IAM policies.
  - Deploying to Agent Engine compiles the container via Cloud Build, registers the reasoning engine instance, and populates `deployment_metadata.json`.
  - Testing against a deployed Agent Engine streams chat tokens live in the interactive runner.
  - Selecting a sample from the Samples Tab loads the complete agent graph topology into the canvas.

---

### Release 1.0.2 — Multi-Agent Topologies & Delegation Patterns
**Theme**: Enable multi-agent graphs, handle connection rules, sequential pipelines, and parallel fan-out topologies.

* **Features**:
  1. **Multi-Node Canvas Wiring**:
     - Dynamic socket handles with DAG cycle validation and handle-type restrictions.
     - Visual sub-agent sockets for child delegations.
  2. **Sequential Pipeline Pattern (Prompt Chaining)**:
     - 3-agent preset: `Planner` ➔ `Executor` ➔ `Reviewer`.
     - Code generation for state handoff between sequential steps in Google ADK Python.
  3. **Parallel Fan-Out Pattern (Fan-Out & Synthesize)**:
     - 5-agent preset: `Orchestrator` ➔ [`Domain Worker 1`, `Worker 2`, `Worker 3`] ➔ `Synthesizer`.
     - Code generation for asynchronous concurrent dispatch (`asyncio.gather`) and collation.
  4. **Multi-Agent Trace Visualization**:
     - Test runner visualizes hop-by-hop execution path with individual node duration badges and intermediate payload views.

* **Acceptance Criteria**:
  - Dragging Sequential or Parallel patterns places auto-layouted node clusters on canvas.
  - Python ADK generator creates typed workflow class coordinating multiple agents.
  - Test runner executes multi-agent pipeline and highlights active nodes during trace execution.

---

### Release 1.0.3 — Memory & State Checkpointing
**Theme**: Implement state persistence options, including in-memory turn buffers and Google Cloud Firestore checkpointers.

* **Features**:
  1. **Memory Inspector Configuration**:
     - Memory backend selector: `None (Stateless)`, `In-Memory Checkpointer (MemorySaver)`, `Google Cloud Firestore`.
     - Configurable thread ID key (`thread_id`), Firestore collection name (`collectionName`), and session TTL.
  2. **Firestore IaC & Python Client Integration**:
     - Code generation provisions Firestore checkpointer client (`google-cloud-firestore`).
     - Terraform script adds Firestore IAM permissions (`roles/datastore.user`) to Cloud Run service account.
  3. **Session State Testing**:
     - Test runner supports multi-turn session persistence assertions across successive test prompts.

* **Acceptance Criteria**:
  - Selecting Firestore checkpointer generates Firestore session loader in `agent_workflow.py`.
  - Deployment tab includes Firestore IAM roles in `main.tf`.

---

### Release 1.0.4 — Agent-to-Agent (A2A) Protocol Node
**Theme**: Decentralized inter-agent communication using the A2A open protocol standard and Bearer/API Key authentication.

* **Features**:
  1. **A2A Node (`agentKind === 'a2a'`)**:
     - Distinctive cyan styling, `Globe2` icon, endpoint preview badge.
  2. **A2A Inspector Drawer**:
     - Protocol version (`1.0.0-a2a`), remote peer endpoint URL, Agent Card URL (`/.well-known/agent-card.json`).
     - Auth types: `Bearer Token`, `Custom API Key`, `OAuth2 Client Credentials`.
     - Capability negotiation: `schema_negotiation`, `task_handoff`, `streaming_events`, `artifact_exchange`.
  3. **A2A Code Generation**:
     - Generates compliant JSON-RPC 2.0 / A2A communication client in `tools.py`.
     - Attaches remote agent as an invocable tool or delegate node.

* **Acceptance Criteria**:
  - A2A node generates compliant JSON-RPC 2.0 / A2A communication client in `tools.py`.
  - In-drawer connection test verifies agent card discovery.

---

### Release 1.0.5 — Conditional Router & Dynamic Branching
**Theme**: Introduce dynamic decision routing nodes with multiple condition branches.

* **Features**:
  1. **Router Node (`agentKind === 'router'`)**:
     - Distinctive violet border, `Split` icon, and dynamic per-branch output sockets.
  2. **Router Property Drawer**:
     - Evaluation modes: `Boolean Expression on State`, `LLM Intent Classifier`, `Numeric Threshold`.
     - Dynamic branch list editor: Add/reorder/remove branches, condition expressions, fallback default branch.
  3. **Router Code Generation**:
     - Generates deterministic branch evaluator functions or Gemini classifier prompts with typed enum outcomes in Python ADK.
  4. **Connection Validation**:
     - Enforces router branch handles connecting exclusively to downstream candidate agents.

* **Acceptance Criteria**:
  - Router node renders distinct handle for each configured branch.
  - Generated code accurately branches execution based on evaluation mode.

---

### Release 1.0.6 — Extended Tools (REST API & Python Sandbox)
**Theme**: Expand the tool registry with custom REST API endpoints and sandboxed code execution.

* **Features**:
  1. **Custom REST API Tool Builder**:
     - Endpoint URL, HTTP Method (`GET`, `POST`, `PUT`, `DELETE`), URL parameters, query params, request body schema.
     - Cloud Secret Manager mapping for API keys and auth headers (e.g., `X-API-Key`, `Authorization: Bearer`).
  2. **Python Code Execution Tool (`code`)**:
     - Built-in tool allowing LLM to write and execute sandboxed Python code.
  3. **Tool Property Drawer & Custom Registry**:
     - Create, edit, test, and save custom tools in local catalog.
     - Drag tools from palette directly onto canvas agents.
  4. **ADK Built-in Tools Registry & Cross-Harness Tool Adapters**:
     - Complete palette of official Google ADK built-in tools (`google_search`, `vertex_ai_search`, `load_web_page`, `request_input`, `preload_memory`, `code_execution`, `agent_as_tool`).
     - Runtime-agnostic canonical JSON representation: tools compile to native ADK imports (`from google.adk.tools import ...`), LangGraph/LangChain equivalents (`@tool`, LangGraph interrupts, Google GenAI search), or TypeScript SDK declarations.

* **Acceptance Criteria**:
  - Adding a REST API tool generates an async `httpx` or `requests` tool function in `tools.py` with secret resolution.
  - Python sandbox tool generates secure code execution wrapper.

---

### Release 1.0.7 — Structured Output Schema Builder & Pydantic Validation
**Theme**: Visual JSON schema and Pydantic model designer for guaranteed structured LLM responses.

* **Features**:
  1. **Structured Output Builder Drawer (`StructuredOutputBuilder.tsx`)**:
     - Toggle strict JSON schema mode.
     - Interactive field editor: field name, type (`string`, `number`, `boolean`, `array`, `object`, `enum`), description, required flag, enum values.
  2. **Dual Code Preview**:
     - Real-time switcher between **JSON Schema (Draft 7/2020-12)** and **Pydantic v2 `BaseModel`**.
  3. **Code Generator & Test Assertion Integration**:
     - Injects `response_schema` into Gemini model configuration.
     - Test runner assertion engine validates JSON schema compliance using `jsonschema` / Pydantic validation.

* **Acceptance Criteria**:
  - Defining schema fields generates valid Pydantic models in Python code.
  - Test runner validates output payloads against structured schema definitions.

---

### Release 1.0.8 — Model Context Protocol (MCP) Integration
**Theme**: Full support for Model Context Protocol client configurations across stdio, SSE, and HTTP transports.

* **Features**:
  1. **MCP Tool Configuration Drawer**:
     - Transport types: `stdio` (local subprocess), `sse` (Server-Sent Events), `http`.
     - Stdio command & args (e.g. `npx -y @modelcontextprotocol/server-github`), environment variable bindings.
     - Tool filtering whitelist/glob and auto-approve patterns.
  2. **Live MCP Handshake Test**:
     - In-drawer button to execute MCP initialization handshake via extension backend and list exposed tools.
  3. **Python MCP Client Code Generation**:
     - Generates async `mcp` client connectors and attaches negotiated tools to Google ADK agents.

* **Acceptance Criteria**:
  - Configuring an MCP tool generates proper async MCP client lifecycle management in `tools.py`.
  - MCP handshake test discovers available tools and displays them in the inspector.

---

### Release 1.0.9 — Event-Driven Triggers & Enterprise Cloud IAM OIDC Auth
**Theme**: Enterprise event ingestion triggers with Cloud infrastructure bindings and Google Cloud IAM service-to-service authentication.

* **Features**:
  1. **Cloud Pub/Sub Trigger Node (`pubsub`)**:
     - Topic path, Subscription ID, Ack deadline, message format (`JSON`, `Raw String`, `CloudEvent`).
  2. **Scheduled Cron Trigger Node (`scheduled`)**:
     - Cron expression generator & helper, timezone selector.
  3. **Eventarc Trigger Node (`eventarc`)**:
     - Provider selection (Cloud Storage, Firebase Auth, Cloud Audit Logs, Custom Webhook).
  4. **Enterprise IAM Service-to-Service Auth for A2A & Cloud Run**:
     - Google Cloud IAM OpenID Connect (OIDC) token exchange client generation.
     - Target Audience URL configuration and service account token minting in `tools.py`.
  5. **IaC & Ingestion Boilerplate**:
     - Terraform generates `google_pubsub_topic`, `google_pubsub_subscription`, `google_cloud_scheduler_job`, and invoker IAM bindings.
     - Code generator produces FastAPI event ingestion endpoints with payload unwrapping.

* **Acceptance Criteria**:
  - Wiring a Pub/Sub trigger generates Cloud Pub/Sub push subscription and handler in Python.
  - A2A IAM auth generates Google Auth ID Token credentials.
  - Terraform script provisions matching GCP event infrastructure and IAM roles.

---

### Release 1.1.0 — LangGraph Framework Support
**Theme**: Expand execution framework targets to include Python LangGraph.

* **Features**:
  1. **Framework Switcher**:
     - Toggle between **Google ADK** and **LangGraph** in extension settings and code panel.
  2. **LangGraph Code Generation**:
     - Generates `StateGraph`, `TypedDict` workflow state, graph nodes, conditional edges, and `MemorySaver` checkpointer in Python.
  3. **LangGraph Prompt Template (`prompts/python-langgraph.prompt.txt`)**:
     - Dedicated LLM prompt template generating idiomatic LangGraph projects.

* **Acceptance Criteria**:
  - Switching framework to LangGraph produces valid `langgraph` Python code that passes compilation and test runs.

---

### Release 1.1.1 — TypeScript Runtime Support
**Theme**: Expand runtime targets to include TypeScript and Node.js environments.

* **Features**:
  1. **Language Switcher**:
     - Toggle between **Python** and **TypeScript**.
  2. **TypeScript Google GenAI SDK Generator**:
     - Generates complete Node.js / TypeScript repository with `@google/genai`, `package.json`, and Vitest test suite.
  3. **TypeScript Prompt Template (`prompts/typescript-adk.prompt.txt`)**:
     - Dedicated LLM prompt template generating idiomatic TypeScript code.

* **Acceptance Criteria**:
  - TypeScript target generates valid TypeScript modules with strict types and passing Vitest test harness.

---

### Release 1.1.2 — Advanced Cognitive Patterns & Blueprints Catalog
**Theme**: Complex multi-agent coordination patterns and pre-built enterprise blueprints.

* **Features**:
  1. **Advanced Architectural Patterns**:
     - **Evaluator-Optimizer Loop** (Generate ⇄ Evaluate with score cutoff).
     - **Multi-Agent Debate** (Proponent ⇄ Opponent ➔ Judge consensus panel).
     - **Review & Critique Triad** (Author ➔ Adversarial Critic ➔ Editor).
     - **Central Coordinator** (Shared Blackboard state machine).
     - **Hierarchical Delegation** (Director ➔ Domain Leads ➔ Workers).
  2. **Samples & Blueprints Catalog**:
     - Pre-built templates: `Company Verifier & Entity Classifier` (`company_verifier.agent`), `Financial Research Analyst`, `Customer Service Triage`.
     - One-click template loader opening new `.agent` tab buffers.

* **Acceptance Criteria**:
  - All 8 pattern presets drag onto canvas with fully wired nodes and edges.
  - Blueprints load completely configured graphs, tools, output schemas, and test cases.

---

## Quality & Governance Standards

1. **Coding Style**:
   - TypeScript for extension backend and webview UI.
   - Tailwind CSS for all webview styling strictly adhering to the **8pt grid system** (multiples of 8px margins, paddings, sizing).
   - Class documentation with Author: `Mike Nimer <mikenimer@google.com>` and detailed method logic explanations.
2. **Testing Coverage**:
   - 100% unit test coverage on all new backend services, parsers, and code generators.
   - Regression test suite maintained across every bug fix.
3. **Git & Commit Strategy**:
   - Conventional Commits (`feat:`, `fix:`, `docs:`, `style:`, `refactor:`, `test:`, `chore:`).
   - No automatic commits without explicit user approval.
