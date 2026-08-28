# Visual Agent Flow Builder — Comprehensive Technical Requirements & Specification

> **Document Purpose**: This specification provides an exhaustive, component-by-component functional and architectural breakdown of the Visual Studio Code Agent Flow Builder prototype. It details user experience elements, visual node architectures, property inspectors, editor tabs, workflow patterns, default value matrices, interaction lifecycles, and future capability gaps. This document is formatted to serve as the definitive blueprint for multi-phase release planning and standalone agent implementation tasks.

---

## Table of Contents
1. [Executive Overview & System Architecture](#1-executive-overview--system-architecture)
2. [UX Architecture, Layout, Theme & Styling](#2-ux-architecture-layout-theme--styling)
3. [Canvas Node Specifications](#3-canvas-node-specifications)
   - 3.1 [Standard Agent Node](#31-standard-agent-node)
   - 3.2 [Router / Conditional Branch Node](#32-router--conditional-branch-node)
   - 3.3 [A2A (Agent-to-Agent) Protocol Node](#33-a2a-agent-to-agent-protocol-node)
   - 3.4 [Trigger & Entrypoint Nodes](#34-trigger--entrypoint-nodes)
4. [Property Panels & Inspector Drawers](#4-property-panels--inspector-drawers)
   - 4.1 [Standard Agent Inspector](#41-standard-agent-inspector)
   - 4.2 [Router Agent Inspector](#42-router-agent-inspector)
   - 4.3 [A2A Agent Inspector](#43-a2a-agent-inspector)
   - 4.4 [Trigger Inspector Drawer](#44-trigger-inspector-drawer)
   - 4.5 [Tool Property Drawer & Registry](#45-tool-property-drawer--registry)
   - 4.6 [Structured Output Builder](#46-structured-output-builder)
5. [Editor Tabs & Bottom Panel Workspaces](#5-editor-tabs--bottom-panel-workspaces)
   - 5.1 [Visual Canvas Editor (`*.agent`)](#51-visual-canvas-editor-agent)
   - 5.2 [VS Code Extension Settings Workspace](#52-vs-code-extension-settings-workspace)
   - 5.3 [Generated Code Panel](#53-generated-code-panel)
   - 5.4 [Cloud Deployment & IaC Panel](#54-cloud-deployment--iac-panel)
   - 5.5 [Interactive Test Runner Panel](#55-interactive-test-runner-panel)
6. [Multi-Agent Design Patterns Catalog](#6-multi-agent-design-patterns-catalog)
7. [Sample Workflows & Blueprints](#7-sample-workflows--blueprints)
8. [Settings Interaction & Default Value Matrix](#8-settings-interaction--default-value-matrix)
9. [UI Events, Interaction Lifecycle & State Management](#9-ui-events-interaction-lifecycle--state-management)
10. [Audit of Missing Features & Engineering Roadmap Gaps](#10-audit-of-missing-features--engineering-roadmap-gaps)

---

## 1. Executive Overview & System Architecture

The **Visual Studio Code Agent Flow Builder** is a visual IDE extension and canvas orchestrator designed to model, configure, test, and generate production-ready code for complex multi-agent AI systems. It supports dual enterprise frameworks:
1. **Google GenAI SDK / Google Agent Development Kit (ADK)** (Targeting Cloud Run and Vertex AI Agent Engine).
2. **LangGraph (LangChain ecosystem)** (Targeting Python and TypeScript runtimes with state graph checkpointers).

### Core Capabilities
- **Visual Graph Modeling**: Drag-and-drop node graph powered by `@xyflow/react` with DAG-aware connection validation, auto-layout (`dagre`), and multi-tab file buffers.
- **Heterogeneous Node Types**: Standard LLM Agents, Dynamic Conditional Routers, Decentralized A2A Protocol Nodes, and Ingestion Triggers (Chat, Pub/Sub, Cron, Eventarc, Test Suite).
- **Extensible Tool Registry**: Built-in search/code sandboxes, custom REST endpoints with secret mapping, and **Model Context Protocol (MCP)** client configurations (`stdio`, `sse`, `http`).
- **LLM-Driven Code & IaC Generation**: When the user requests generated code, the extension invokes Gemini with framework- and language-specific prompt templates (`prompts/<framework>-<language>.prompt.txt`) injecting the React Flow `.agent` JSON topology to produce complete Python/TypeScript repositories including workflow runners, tool wrappers, pytest suites, Terraform scripts, Cloud Build pipelines, and Dockerfiles.
- **In-Editor Simulation & Verification**: Live test harness with step-by-step agent trace timings, JSON schema assertions, and deployment pipeline diagnostics.

---

## 2. UX Architecture, Layout, Theme & Styling

### 2.1 Visual Studio Code Chrome Shell
The layout strictly mirrors the native VS Code desktop UI layout using a high-density, accessible dark/light shell.

```
+-------------------------------------------------------------------------------------------------------+
| [● ● ●] workflow.agent — Visual Studio Code Agent Flow                [Theme Selector] [Advisor] [Undo/Redo] |
+---+---------------------------------------------------------------------------------------------------+
| A | [workflow.agent ×] [company_verifier.agent ×] [+] | [Settings Tab]                                |
| c +---------------------------------------------------------------------------------------------------+
| t | [Left Floating Palette]                                  | [Right Slide-out Property Inspector]    |
| i | - Agents & Patterns                                      | - General Metadata                      |
| v | - Tool Registry (Built-in, REST, MCP)                   | - Model & Sampling                      |
| i | - Triggers & Test Suites                                | - System Prompt                         |
| t | - Sample Blueprints Catalog                             | - Structured Output Schema              |
| y |                                                          | - Memory & State Checkpointing          |
|   | [Interactive Canvas: Nodes, Sockets, Dynamic Handles]   | - Tools & Sub-Agent Delegations         |
| B |                                                          |                                         |
| a +---------------------------------------------------------------------------------------------------+
| r | Bottom Panel: [Generated Code (3 Files)] [Cloud Deployment & IaC] [Interactive Test Runner (QA)]  |
+---+---------------------------------------------------------------------------------------------------+
| [✓ Ready] [UTF-8] [Python / Google ADK] [Nodes: 4 | Edges: 3] [Vertex AI: us-central1]               |
+-------------------------------------------------------------------------------------------------------+
```

### 2.2 Shell Components Breakdown
1. **Title Bar (Top 32px)**:
   - Mac-style window controls (Red, Amber, Green window dots).
   - Document breadcrumb: `<ActiveTabFileName> — Visual Studio Code Agent Flow`.
   - Action cluster: **Theme Dropdown**, **Agent Advisor Button**, **Undo/Redo Actions** (`Cmd+Z` / `Cmd+Y`), and Canvas Zoom Controls (+, -, Fit View, Layout LR/TB).
2. **Activity Bar (Left 48px)**:
   - Vertical navigation with VS Code standard icons: Explorer (`Files`), Search (`Search`), Source Control (`GitFork`), Run & Debug (`Play`), Extensions (`Boxes`), Settings (`Settings`).
   - Clicking `Settings` toggles the dedicated Settings Editor Workspace.
3. **Editor Tab Bar (Top 36px)**:
   - Multi-tab management supporting independent `.agent` file states.
   - Active tab indicator with file badge, close button (`×`), and `+` button to create a blank canvas.
   - Secondary tab toggle for **Settings Workspace**.
4. **Left Floating Palette Card (Blender/VS Code hybrid style)**:
   - Vertical tab strip docked to the left edge: `Agents`, `Tools`, `Triggers`, `Samples`.
   - Collapsible panel with search bar, category chips, and drag-and-drop grip handles.
5. **Main Canvas Viewport**:
   - Infinite pan/zoom canvas powered by React Flow with customizable dot-grid background.
   - Overlay MiniMap (bottom/top right toggleable).
   - Validation warning banner (floating top right) showing disconnected or orphan nodes.
6. **Right Slide-out Inspector Drawer (Width: 420px)**:
   - Context-aware property editor for the selected node (Standard Agent, Router, A2A Agent, Trigger, or Tool).
7. **Bottom Collapsible Workbench Panel (Height: 320px - 85vh adjustable / Maximizable)**:
   - Tab 1: **Generated Code** (Code editor with file tree, copy, and bundle export).
   - Tab 2: **Cloud Deployment & IaC** (Terraform script, Dockerfile, and Secret Manager bindings).
   - Tab 3: **Interactive Test Runner** (Pytest-like test executor with animated node trace).
8. **Status Bar (Bottom 24px)**:
   - Blue status bar displaying framework mode, language, active nodes/edges count, deployment target, and quick-status indicators.

### 2.3 Theming System (`ThemeContext`)
The application defines three CSS variable-driven themes mapped via `data-theme` attribute on the root container:

| Variable | Dark Theme (Default) | Light Theme | High Contrast Theme |
| :--- | :--- | :--- | :--- |
| `--vscode-workbench-bg` | `#1e1e1e` | `#f3f3f3` | `#000000` |
| `--vscode-canvas-bg` | `#181818` | `#ffffff` | `#000000` |
| `--vscode-sidebar-bg` | `#252526` | `#e8e8e8` | `#000000` |
| `--vscode-title-bar` | `#323233` | `#dddddd` | `#000000` |
| `--vscode-border` | `#333333` | `#cecece` | `#6fc3df` |
| `--vscode-text-primary` | `#cccccc` | `#333333` | `#ffffff` |
| `--vscode-text-secondary` | `#999999` | `#666666` | `#ffffff` |
| `--vscode-text-muted` | `#666666` | `#999999` | `#ffff00` |
| `--vscode-accent` | `#007acc` | `#007acc` | `#f38518` |

---

## 3. Canvas Node Specifications

Every canvas node renders with custom headers, SVG icons, status chips, dynamic connection sockets (handles), and action controls.

```
       [Target Socket / Input] (Top / Left)
+----------------------------------------------------+
| [Icon] Node Title / Label             [Kind Badge] |
| Subtitle / Model Identifier           [Actions: ⚙ ×] |
+----------------------------------------------------+
| Role & System Prompt Directive Preview             |
| [Memory Checkpointer Badge]                        |
+----------------------------------------------------+
| Attached Tools: [Search 🌐] [Code ⚡] [MCP: Github] |
+----------------------------------------------------+
| Sub-Agent Sockets (Delegation Sockets):            |
|   ● Worker 1 (Parallel Fan-Out)                    |
|   ● Worker 2 (Sequential Pipeline)                 |
+----------------------------------------------------+
       [Source Socket / Output] (Bottom / Right)
```

### 3.1 Standard Agent Node
- **Node Component**: `AgentNode.tsx`
- **Data Model**: `AgentData` (`agentKind === 'standard'`)
- **Visual Design**:
  - Border color mapped to `colorTheme` (`blue`, `emerald`, `purple`, `amber`, `rose`, `indigo`, `cyan`).
  - Top handle: Target handle for input invocation (left handle in LR mode).
  - Bottom handle: Source handle for sequential workflow handoff (right handle in LR mode).
  - Model Badge: Displays selected model (e.g., `gemini-flash-latest`, `claude-sonnet-latest`).
  - Indicator Tags:
    - `START` chip (green) if `isStartNode === true`.
    - `EVALUATOR` chip (purple) if `isEvaluator === true`.
  - Memory Summary Pill: Displays active checkpointer (e.g., `MemorySaver`, `Firestore`, `Redis`).
  - Tool Pills: Displays icons and names for each attached tool with an inline remove button.
  - Sub-Agent Sockets: For each sub-agent defined in `subAgents`, renders an individual sub-handle socket allowing direct visual edge wiring to child worker agents.

### 3.2 Router / Conditional Branch Node
- **Node Component**: `AgentNode.tsx` (`agentKind === 'router'`)
- **Data Model**: `RouterConfig`
- **Visual Design**:
  - Distinctive purple/violet neon border with `Split` / `GitBranch` icon.
  - Top Target Handle: Receives state/input payload from prior agent.
  - **Dynamic Multiple Source Handles**:
    - Generates dedicated right/bottom output sockets for every branch defined in `routerConfig.branches`.
    - Each branch displays its condition expression preview (e.g., `If: status == 'passed'`, `Else: Fallback`).
  - Mode Chip: Displays evaluation type (`Boolean Expression`, `LLM Intent Classifier`, `Numeric Threshold`).

### 3.3 A2A (Agent-to-Agent) Protocol Node
- **Node Component**: `AgentNode.tsx` (`agentKind === 'a2a'`)
- **Data Model**: `A2AConfig`
- **Visual Design**:
  - Cyan/sky border styling with `Globe2` / `Radio` icon.
  - Badge: `A2A • PROTOCOL`.
  - Endpoint Display: Renders truncated remote endpoint URL (e.g., `https://api.agent-network.internal/a2a/v1`).
  - Protocol Version Tag: `v1.0.0-a2a`.
  - Auth Method Pill: `Bearer`, `API-Key`, `OAuth2`, or `Google-IAM`.

### 3.4 Trigger & Entrypoint Nodes
- **Node Component**: `TriggerNode.tsx`
- **Data Model**: `TriggerData`
- **Trigger Types & Visual Badges**:
  1. **Chat Trigger (`chat`)**: Emerald border, `MessageSquare` icon. Represents interactive user session.
  2. **Cloud Pub/Sub Trigger (`pubsub`)**: Amber border, `Radio` icon. Displays topic path (e.g., `projects/ops/topics/events`).
  3. **Scheduled Cron Trigger (`scheduled`)**: Sky blue border, `Clock` icon. Displays cron expression (e.g., `0 9 * * 1-5`).
  4. **Test Suite Trigger (`tester`)**: Pink border, `FlaskConical` icon. Displays defined test cases count (e.g., `3 Test Cases Defined`).
  5. **Eventarc Trigger (`eventarc`)**: Purple border, `Zap` icon. Displays Cloud Event routing type (e.g., `STORAGE: object.finalize`).
- **Connection Handle**: Single output Source handle on right/bottom edge connecting strictly to the workflow's entrypoint Agent.

---

## 4. Property Panels & Inspector Drawers

All inspector drawers slide out from the right canvas boundary (Width: 420px), featuring smooth transitions, categorized accordion sections, live state synchronization, and validation indicators.

### 4.1 Standard Agent Inspector (`StandardAgentDrawer.tsx`)
1. **General Identity Section**:
   - `Agent Label`: Name of the agent (e.g., `Financial Research Lead`).
   - `Role Definition`: Core responsibility summary.
   - `Color Theme`: 7-swatch color picker (`blue`, `emerald`, `purple`, `amber`, `rose`, `indigo`, `cyan`).
   - `Is Evaluator / Optimizer`: Checkbox flagging node as quality judge.
2. **Model & Generation Parameters**:
   - `Model Selector`: Dropdown populated from `SUPPORTED_MODELS` with Google, Anthropic, OpenAI, and xAI options.
   - `Temperature Slider`: Range `0.0` to `2.0` (Step: `0.05`) with precision numeric readout.
   - `Max Execution Iterations`: Number input (default: `10`, range: `1` to `50`).
3. **System Prompt & Directive Editor**:
   - Multi-line textarea for instructions, behavioral constraints, and formatting rules.
   - Auto-formatting helper with token estimation counter.
4. **Structured Output Schema Builder** (`StructuredOutputBuilder.tsx`):
   - Toggle: `Enable Strict JSON Output Schema`.
   - Interactive field table allowing developers to define typed keys (`string`, `number`, `boolean`, `array`, `object`).
   - Preview switcher: **JSON Schema Preview** vs **Pydantic Model Preview**.
5. **Memory & State Persistence (Root Node Scoped)** (`memoryOptions.ts`):
   - Memory and state checkpointer configuration is restricted strictly to the **Root Agent Node** (all child sub-agents execute statelessly; state persistence is coordinated at the root).
   - Checkpointer backend options include `None (Stateless)`, `In-Memory Checkpointer (MemorySaver)`, and `Google Cloud Firestore` (Configurable `collectionName`).
6. **Attached Tools Registry**:
   - List of tools currently bound to this agent with remove buttons.
   - `+ Attach Tool` button opening `AddToolModal`.
7. **Sub-Agent Delegation Sockets**:
   - Live auto-populated child sub-agent list editor on connection.
   - Delegation Strategy selector: `sequential` and `parallel` patterns.
   - Connectors enforce bottom-to-top layout; triggers connect top/left or bottom-to-top.

### 4.2 Router Agent Inspector (`RouterAgentDrawer.tsx`)
1. **Routing Evaluation Mode**:
   - `Boolean Expression on State`: Evaluates Python/JS boolean conditions on state variables (e.g., `state.status == 'passed'`).
   - `LLM Intent / Outcome Classifier`: Uses Gemini model to categorize incoming text into branch labels.
   - `Numeric Score Threshold`: Compares `state.score` against a numeric cutoff.
2. **Variable & Directive Configuration**:
   - `State Variable Name`: e.g., `status`, `review_score`, `intent`.
   - `Classifier Evaluation Directive`: Prompt instructed to classify the query.
   - `Numeric Threshold Value`: e.g., `0.80`.
3. **Branch List Editor**:
   - Dynamic list where users can add, reorder, label, and define condition expressions for each branch.
   - Fallback checkbox: Sets default branch when no other conditions evaluate to true.

### 4.3 A2A Agent Inspector (`A2AAgentDrawer.tsx`)
1. **Protocol Specifications**:
   - `Protocol Version`: Default `1.0.0-a2a`.
   - `Remote Peer Endpoint URL`: HTTPS target endpoint.
   - `Timeout Seconds`: Number input (default: `30`s).
2. **Authentication Configuration**:
   - Auth Type Selector:
     - `Bearer Token`: Secret key environment variable name (e.g., `A2A_AUTH_TOKEN`).
     - `Custom API Key`: Header name (e.g., `x-api-key`) and secret environment variable.
     - `OAuth2 Client Credentials`: Token URL, Client ID env, and Client Secret env.
     - `Google Cloud IAM`: Target Audience URL for automatic Cloud Run service-to-service IAM authentication.
3. **Negotiated Capabilities**:
   - Multi-select chips: `task_handoff`, `schema_negotiation`, `streaming_events`, `artifact_exchange`, `bidirectional_state`.

### 4.4 Trigger Inspector Drawer (`TriggerDrawer.tsx`)
1. **Pub/Sub Configuration Form**:
   - Topic Path: `projects/{project}/topics/{topic}`.
   - Subscription ID: `sub-{workflow}-{version}`.
   - Message Format: `JSON Object`, `Raw String`, `CloudEvent Base64`.
   - Ack Deadline: `10`s to `600`s.
2. **Scheduled Cron Configuration Form**:
   - Cron Expression: e.g., `0 9 * * 1-5`.
   - Timezone Selector: `UTC`, `America/New_York`, `America/Los_Angeles`, `Europe/London`, `Asia/Tokyo`.
3. **Eventarc Configuration Form**:
   - Cloud Event Provider: Cloud Storage, Cloud PubSub, Firebase Auth, Cloud Audit Logs, Custom Webhook.
   - Service Name & Service Account email.
4. **Test Suite Trigger Configuration Form**:
   - Test Case Manager: Add, edit, remove test cases.
   - Test Prompt, Expected Output, and Assertion Type (`contains_text`, `json_schema`, `regex_match`, `custom_evaluator_llm`).

### 4.5 Tool Property Drawer & Registry (`ToolPropertyDrawer.tsx` & `defaultTools.ts`)
Supports three distinct tool categories:
1. **Built-in Grounding Tools**:
   - Google Search Grounding (`search`).
   - Sandboxed Python Code Execution (`code`).
   - Vector RAG Knowledge Base (`rag`).
   - Cloud SQL / PostgreSQL Query Engine (`db`).
2. **Custom REST API Tools (`api` / `custom`)**:
   - `Endpoint URL`: e.g., `https://api.example.com/v1/resource`.
   - `HTTP Method`: `GET`, `POST`, `PUT`, `DELETE`.
   - `Auth Secret Key Env`: Name of secret stored in Cloud Secret Manager.
   - `Parameters Dictionary`: Key-value parameter type descriptions.
   - `Code Directive`: English instruction on how the LLM should invoke the tool.
3. **Model Context Protocol (MCP) Server Tools (`mcp`)**:
   - `Transport Type`: `stdio` (local subprocess), `sse` (Server-Sent Events), or `http`.
   - `Command & Arguments` (for `stdio`): e.g., `npx` with args `['-y', '@modelcontextprotocol/server-github']`.
   - `Server Endpoint URL` (for `sse`): e.g., `http://localhost:8000/sse`.
   - `Environment Variables Mapping`: Custom key-value pairs (e.g., `GITHUB_PERSONAL_ACCESS_TOKEN`).
   - `Exposed Tools Filter`: Glob pattern or array of exposed methods (e.g., `['*']` or `['create_issue', 'search_repos']`).
   - `Auto-Approve Tools`: Patterns to bypass human approval gates (e.g., `['read_*', 'get_*']`).
   - **Interactive Ping / Handshake Test**: In-drawer button to simulate MCP protocol connection and verify tool discovery.

---

## 5. Editor Tabs & Bottom Panel Workspaces

### 5.1 Visual Canvas Editor (`*.agent`)
- Primary editor tab supporting full workflow visualization and node manipulation.
- Tab management with dirty state tracking, rename capability, and multi-buffer state preservation.

### 5.2 VS Code Extension Settings Workspace (`SettingsPage.tsx`)
A dedicated IDE settings editor matching VS Code's `workbench.action.openSettings` UI:
- **Search Bar**: Real-time filtering across settings names, descriptions, and tags.
- **Section Navigation**:
  - `API Keys & Credentials`: Gemini API Key, Anthropic API Key, OpenAI API Key, xAI Grok Key, GitHub MCP Token.
  - `Framework Defaults`: Default target (`google_adk` vs `langgraph`), Default language (`python` vs `typescript`).
  - `Agent Defaults`: Default model, default temperature, default max iterations, default memory checkpointer.
  - `Cloud & Deployment Defaults`: GCP Project ID, Deployment Region, Cloud Run Service Name, Artifacts Storage Bucket.
  - `Editor & Canvas Defaults`: Auto-save interval, show MiniMap toggle, snap-to-grid grid size, enable debug traces.
- **JSON View**: Switch to raw `settings.json` editor with JSON syntax validation and clipboard export.

### 5.3 Generated Code Panel (`CodeGenerationPanel.tsx`)
- **LLM-Driven Code Generation**: When a developer clicks "Generate Code" (or opens the Generated Code panel), the extension reads a framework-specific prompt file (e.g., `prompts/python-adk.prompt.txt` or `prompts/langgraph-python.prompt.txt`), injects the active `.agent` JSON graph, and calls Gemini (`@google/genai`).
- **Structured Multi-File Repository Parsing**: Gemini returns a structured JSON payload containing complete source code files rendered in an interactive multi-file tab viewer:

```
[Generated Files: Google ADK (Python)]
├── agent_workflow.py   # MultiAgentWorkflow class orchestrating the DAG
├── tools.py            # Built-in, REST, and MCP tool declarations
├── main.py             # CLI entrypoint and execution harness
├── test_pipeline.py    # Pytest automated test suite
├── requirements.txt    # Pinned dependencies (google-genai, mcp, pydantic)
├── main.tf             # Terraform IaC for Cloud Run / Vertex AI Agent Engine
├── cloudbuild.yaml     # Cloud Build CI/CD pipeline
├── Dockerfile          # Multi-stage production container build
└── README.md           # Quickstart and architectural documentation
```

### 5.4 Cloud Deployment & IaC Panel (`DeploymentTab.tsx`)
- **Deployment Target Selector**:
  1. **Google Cloud Run (v2 Microservice)**: Serverless container running async agent FastAPI server.
  2. **Vertex AI Agent Engine (Reasoning Engine)**: Managed ADK runtime deployed via `google_vertex_ai_reasoning_engine`.
- **Automated Secrets Extraction**: Automatically parses all nodes for referenced environment variables (`GEMINI_API_KEY`, `A2A_AUTH_TOKEN`, `DB_PASSWORD`) and generates Cloud Secret Manager bindings in `main.tf`.
- **IaC Artifacts**:
  - `main.tf`: Complete Terraform script provisioning Cloud Run, IAM policies, Secret Manager, Pub/Sub subscriptions, and Cloud Scheduler jobs.
  - `Dockerfile`: Multi-stage distroless container build for Python/TypeScript agent runtimes.
  - `cloudbuild.yaml`: Automated Cloud Build CI/CD pipeline.
  - `deploy.sh`: Pre-configured gcloud deployment script with single-click copy.

### 5.5 Interactive Test Runner Panel (`TestRunnerTab.tsx`)
- Executes test cases defined in the workflow's Test Suite trigger.
- **Features**:
  - **Run All Tests** / **Run Single Test**.
  - **Animated Multi-Agent Execution Trace**: Displays step-by-step agent hops with execution latency breakdown in milliseconds.
  - **Assertion Verifier**: Validates output text against expected constraints (`json_schema`, `contains_text`, `regex`).
  - **Payload Inspector**: Expandable JSON viewer for intermediate state artifacts.

---

## 6. Multi-Agent Design Patterns Catalog

The builder includes 8 pre-configured architectural pattern presets that can be dragged directly onto the canvas:

| # | Pattern Name | Structural Topology | Default Agents | Primary Use Case |
| :- | :--- | :--- | :--- | :--- |
| **1** | **Sequential Pipeline** *(Prompt Chaining)* | `Planner` ➔ `Executor` ➔ `Reviewer` | 3 Agents | Content generation, code generation & validation, ETL pipelines. |
| **2** | **Parallel Fan-Out** *(Fan-Out & Synthesize)* | `Orchestrator` ➔ [`Market Analyst`, `Tech Analyst`, `Risk Analyst`] ➔ `Synthesizer` | 5 Agents | Multi-perspective research, parallel web search, ensemble classification. |
| **3** | **Router** *(Classify & Route)* | `Intent Classifier` ➔ [`Billing Specialist`, `Tech Support`, `General Inquiries`] | 4 Agents | Customer service triage, domain-specific query dispatching. |
| **4** | **Evaluator-Optimizer** *(Generate & Refine Loop)* | `Generator` ⇄ `Evaluator` (Quality Threshold Loop) | 2 Agents | High-precision code generation, mathematical proofing, iterative translation. |
| **5** | **Multi-Agent Debate** *(Consensus Panel)* | `Proponent` ⇄ `Opponent` ➔ `Judge` | 3 Agents | Policy analysis, algorithmic risk assessment, bias detection. |
| **6** | **Hierarchical Delegation** *(Supervisor-Workers)* | `Executive Director` ➔ [`Lead 1`, `Lead 2`] ➔ [`Worker A`, `Worker B`, `Worker C`] | 6 Agents | Large-scale software engineering, multi-chapter report drafting. |
| **7** | **Review & Critique** *(Triad Review)* | `Author` ➔ `Adversarial Critic` ➔ `Editor` | 3 Agents | Academic publishing, legal contract auditing, compliance checking. |
| **8** | **Coordinator** *(Central State Supervisor)* | `Supervisor (Blackboard)` ⇄ [`Data Ingestion`, `Model Trainer`, `Reporter`] | 4 Agents | Long-running workflow orchestration, shared memory state machines. |

---

## 7. Sample Workflows & Blueprints

Pre-built enterprise blueprints available in the Samples palette:

### 7.1 Company Verifier & Entity Classifier (`company_verifier.agent`)
- **Category**: Enterprise Integration & Identity
- **Topology**: `Pub/Sub Trigger: Company Registrations` ➔ `Agent: Company Verifier & Classifier`
- **Integrated Tools**:
  - `Google Places API (Business Lookup)`: Searches physical address, business status, and place details.
  - `Google Search Grounding`: Fallback verification for business registry ambiguity.
- **Output Schema**: Strict JSON containing verification status (`VERIFIED`, `UNVERIFIED`, `SUSPICIOUS`), confidence score (`0.0 - 1.0`), operating status, and standardized industry taxonomy (`restaurant`, `machine shop`, `retail`, `healthcare`, `logistics`, `technology`).
- **Test Prompts**: Test cases for verifying precision CNC machine shops vs artisan restaurants.

---

## 8. Settings Interaction & Default Value Matrix

### 8.1 Default Values & Data Fallbacks

```
+---------------------------------------------------------------------------------------------------------+
| Field Scope                 | Default Value                      | Fallback / Validation Rules          |
+=============================+====================================+======================================+
| Default LLM Model           | gemini-flash-latest                | Gemini 3.7 Flash, Claude, GPT-4o     |
| Default Temperature         | 0.70 (Standard) / 0.10 (Router)    | Clamped [0.0, 2.0]                   |
| Default Max Iterations      | 10                                 | Clamped [1, 50]                      |
| Default Memory Type         | none (Stateless)                   | Checkpointer selection               |
| Default Output Format       | text                               | text, json_schema, markdown, code    |
| Default Framework Target    | google_adk                         | google_adk, langgraph                |
| Default Code Language       | python                             | python, typescript                   |
| Default Deployment Target   | cloud_run                          | cloud_run, vertex_agent_engine       |
| Default GCP Region          | us-central1                        | Any valid GCP region identifier      |
| Default Router Strategy     | first_match                        | first_match, all_matches, weighted   |
| Default Router Threshold    | 0.80                               | Clamped [0.0, 1.0]                   |
| Default A2A Protocol        | 1.0.0-a2a                          | Semantic version string              |
| Default A2A Auth Type       | bearer                             | bearer, api_key, oauth2, google_iam  |
| Default MCP Transport       | stdio                              | stdio, sse, http                     |
| Default Auto-Layout Dir     | LR (Left to Right)                 | LR, TB                               |
| Default Tab Buffer Name     | workflow.agent                     | Dynamic slugified filename           |
+---------------------------------------------------------------------------------------------------------+
```

### 8.2 Settings Context Propagation
- When a user modifies defaults in the **Settings Workspace** (e.g., changing default model to `gemini-3.7-flash` or framework to `langgraph`), all **newly created nodes, tabs, and code generations** automatically inherit these preferences.
- Pre-existing nodes retain their explicitly defined configurations unless updated via inspector drawers.

---

## 9. UI Events, Interaction Lifecycle & State Management

```
[ User Interaction ] ───► [ React Flow Event ] ───► [ State Synchronization ] ───► [ Downstream Reaction ]
       │                           │                              │                         │
  Drag Tool from            onDrop Canvas Handler          Append tool to Agent       Canvas re-renders
  Left Palette              identifies target agent        data.tools[]               Tool Badge appears
       │                           │                              │                         │
  Click Node Card           onNodeClick Handler            setSelectedAgentId()       Slide-out Inspector
       │                           │                              │                   renders with data
  Draw Edge between         isValidConnection()            setEdges() + Record        History Stack updated
  Agent and Sub-Socket      validates DAG rules            in useDiagramHistory       (Undo/Redo ready)
       │                           │                              │                         │
  Click Run All Tests       onRunAllTests Handler          executeSimulationTrace()   Nodes pulse with glow
  in Bottom Panel           triggers async loop            updates testResults state  Timings & JSON render
```

### 9.1 Connection Validation Matrix (`isValidConnection`)
To prevent invalid topologies and execution deadlocks, the canvas enforces strict edge connection rules:
1. **Trigger Out-Degree**: A Trigger node can only connect as a source to an Agent or Router node. Triggers cannot receive incoming edges.
2. **Self-Loop Protection**: Nodes cannot connect directly to themselves (except through designated feedback loops with evaluator flags).
3. **Handle Specificity**: Router branch handles only accept outgoing edges directed toward downstream candidate agents.
4. **Duplicate Edge Prevention**: Prohibits redundant edges between identical source-target socket pairs.

### 9.2 History & Undo/Redo Engine (`useDiagramHistory.ts`)
- Manages discrete past/future stacks partitioned per `activeTabId`.
- Captures snapshots on node additions, deletions, edge connections, and property modifications.
- Keyboard bindings: `Cmd+Z` / `Ctrl+Z` (Undo) and `Cmd+Y` / `Cmd+Shift+Z` (Redo).

---

## 10. Audit of Missing Features & Engineering Roadmap Gaps

This section outlines architectural additions required to transition the prototype into an enterprise-grade visual IDE:

### 10.1 Gap 1: Visual State Schema Editor & Shared Memory Blackboard
- **Current State**: Nodes pass untyped dictionary payloads (`state: dict` or `Record<string, any>`).
- **Required Requirement**: A dedicated visual Blackboard Schema Editor where developers define global workflow state keys (e.g., `user_query: str`, `research_findings: list[str]`, `code_artifact: str`, `review_score: float`). Nodes specify input keys read and output keys mutated.

### 10.2 Gap 2: Live Python Kernel / WebSocket Execution Engine
- **Current State**: Test runner uses mock simulation traces with realistic delays and synthetic outputs.
- **Required Requirement**: Embedded local WebSocket execution proxy that spawns a real Python subprocess or connects to a remote Docker sandbox to execute generated `main.py` code in real time with live streaming stdout/stderr logs.

### 10.3 Gap 3: Human-in-the-Loop (HITL) & Approval Gate Nodes
- **Current State**: Workflows execute fully autonomously without pause gates.
- **Required Requirement**: A visual `Approval Gate` node that halts execution before sensitive tool calls (e.g., database writes, emails, production deployments) and prompts the operator in VS Code with Approve / Reject / Edit payload controls.

### 10.4 Gap 4: Edge Data Transformer & Payload Mapping
- **Current State**: Edges represent control-flow transitions.
- **Required Requirement**: Interactive edge inspectors allowing developers to map output variables of Node A directly into specific input parameters of Node B (e.g., `NodeA.output.customer_id` ➔ `NodeB.input.query_id`).

### 10.5 Gap 5: Live MCP Server Subprocess Manager
- **Current State**: MCP tools configure stdio commands and SSE URLs with synthetic ping simulations.
- **Required Requirement**: Direct integration with the local Node.js / Python environment to spawn MCP stdio server processes, negotiate tools via JSON-RPC 2.0, dynamically discover tool schemas, and populate prompt documentation.

### 10.6 Gap 6: Git Version Control & Visual Diffing
- **Current State**: Workflow files are stored in browser memory/local storage.
- **Required Requirement**: Native disk read/write for `.agent` JSON files, VS Code file system watcher synchronization, and visual node diffing when comparing git branch versions.

---

*End of Requirements Specification — Prepared for Phased Release Planning & Agent Workflows.*
