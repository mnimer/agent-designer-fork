# Design Discussion Summary — Visual Studio Code Agent Flow Builder

> **Author**: Mike Nimer <mikenimer@google.com>  
> **Status**: Ready for User Review  
> **Target Platform**: Visual Studio Code Extension (`agent-flow-builder`)  
> **Primary Milestone**: Release 1.0.0 (MVP Foundation)  

---

## 1. Problem Definition & Objective

### Objective (Plain English)
Build a native Visual Studio Code extension that allows AI engineers to visually model, configure, test, and generate complete production code repositories for multi-agent systems. The extension operates as a custom editor for `*.agent` files, invokes Gemini with specialized prompt templates to generate idiomatic Google ADK Python repositories, and executes test suites locally in managed subprocess sessions.

### Scope Boundary for Release 1.0.0 (MVP)
A strictly bounded, standalone extension providing:
- VS Code Shell, Theme Sync (Dark/Light/High Contrast), 8pt grid styling, and resizable workbench panels.
- Custom Editor (`vscode.CustomTextEditorProvider`) for `*.agent` JSON files.
- Single Agent canvas modeling (Identity, Model parameters, System instructions).
- Built-in `Google Search Grounding` tool attachment.
- `Test Suite Trigger` node with prompt & assertion configuration (`contains_text`, `exact`, `regex`).
- LLM prompt-driven Python code generation via Gemini (`@google/genai` using `prompts/python-adk.prompt.txt`).
- Local Test Runner executing prompts across fresh agent sessions in a managed Python subprocess (with automatic `.venv` provisioning).
- Multi-file syntax viewer and workspace code export.

---

## 2. Limits of Current Approach & New Solution

| Dimension | How It Is Done Today | Visual Studio Code Agent Flow Builder |
| :--- | :--- | :--- |
| **Agent Orchestration** | Manual coding of complex boilerplate, brittle glue code, hand-crafted state graphs. | Visual DAG design with drag-and-drop nodes, instant parameter inspection, and dynamic handles. |
| **Code Generation** | Rigid template engines (Jinja/string templates) producing fragile, outdated, or hardcoded scripts. | LLM-driven prompt templates (`prompts/*.prompt.txt`) passing `.agent` JSON to Gemini to generate full, modern repositories. |
| **Verification & Testing** | Manual terminal scripting or ad-hoc test scripts. | Managed subprocess session runner executing isolated test turns with real-time UI trace visualization. |
| **Cloud Deployment** | Manual Dockerfile, Terraform, and Secret Manager configuration. | Automated extraction of runtime secrets and complete Terraform IaC generation for Cloud Run and Vertex AI. |

---

## 3. Critical User Journeys (CUJs) for Release 1.0.0

1. **CUJ-1: Create & Configure Single Agent**:
   - Developer opens or creates `my_agent.agent` in VS Code.
   - Drags a Standard Agent from the palette onto the canvas.
   - Opens inspector drawer to configure Agent Label ("Market Researcher"), Model (`gemini-flash-latest`), Temperature (`0.4`), and System Instructions.
2. **CUJ-2: Attach Grounding Tool**:
   - Drags `Google Search Grounding` tool onto the Agent node.
   - Node displays active tool pill badge.
3. **CUJ-3: Configure Test Suite**:
   - Drags `Test Suite Trigger` onto canvas and connects to the Agent.
   - Adds test cases in Trigger drawer (Prompt: "What were Google Q3 2024 earnings?", Assertion: `contains_text`, Value: "Alphabet").
4. **CUJ-4: Prompt-Driven Code Generation**:
   - Developer opens "Generated Code" tab and clicks "Generate Code".
   - Extension reads `prompts/python-adk.prompt.txt`, injects `.agent` JSON, calls Gemini, and populates multi-file code viewer (`agent_workflow.py`, `tools.py`, `main.py`, `test_pipeline.py`, `requirements.txt`, `main.tf`, `cloudbuild.yaml`, `Dockerfile`, `README.md`).
   - Developer clicks "Export Code to Workspace" to write files to disk.
5. **CUJ-5: Run Local Test Suite**:
   - Developer clicks "Run All Unit Tests" in the Test Runner panel.
   - Extension auto-provisions isolated `.venv` (if needed), starts agent runner subprocess, executes each test prompt in a new session, evaluates assertions, and displays pass/fail status with execution trace latencies.

---

## 4. High-Level Architecture & Technical Decisions

```
+-----------------------------------------------------------------------------------------+
|                                 VS Code Extension Host                                  |
|  [src/extension]                                                                        |
|    ├── AgentEditorProvider.ts   - CustomTextEditorProvider for *.agent JSON             |
|    ├── GeminiCodeGenEngine.ts   - Reads prompts/*.prompt.txt, calls @google/genai API   |
|    ├── AgentRunnerManager.ts    - Managed subprocess runner, auto-venv & session turns  |
|    ├── PythonEnvResolver.ts     - Python interpreter discovery & venv management       |
|    └── WebviewBridge.ts         - Type-safe RPC message dispatcher                      |
+--------------------------------------------▲--------------------------------------------+
                                             │ Typed RPC via postMessage
+--------------------------------------------▼--------------------------------------------+
|                             Webview React Application (SPA)                             |
|  [src/webview]                                                                          |
|    ├── VSCodeChrome Shell       - Native title bar, tab buffer manager, status bar      |
|    ├── React Flow Canvas        - Single/Multi Agent nodes, handles, Dagre layout       |
|    ├── Inspector Drawers        - Standard Agent, Trigger, Tool property editors        |
|    └── Bottom Workbench         - Code Viewer, Deployment IaC, Test Runner Panel        |
+-----------------------------------------------------------------------------------------+
```

### Key Technical Decisions:
- **No Procedural AST Generator**: Code generation is 100% prompt-driven via Gemini using `prompts/python-adk.prompt.txt`. Improvements and fixes are made by iterating on prompt templates.
- **Explicit Generation Triggering**: Code generation is triggered explicitly when the user clicks "Generate Code" or "Export", avoiding unnecessary background token spend.
- **Auto-Provisioned Isolated Virtualenv**: The Test Runner inspects the workspace for dependencies; if missing, it automatically creates a managed `.venv` in the background and runs `pip install -r requirements.txt`.
- **Session-Per-Prompt Execution**: The managed test runner boots the agent and executes each test prompt against a fresh session ID to ensure complete isolation.

---

## 5. Risks & Mitigations

| Risk | Impact | Mitigation Strategy |
| :--- | :--- | :--- |
| **LLM Output Formatting Drift** | Code generation response fails JSON parsing. | Strict JSON schema output mode (`response_mime_type: "application/json"`) and comprehensive integration test suites validating prompt outputs. |
| **Local Python Environment Discrepancies** | Test runner fails on machines lacking Python 3.10+ or required libraries. | Extension checks Python path and auto-provisions a dedicated `.venv` with `pip install -r requirements.txt`. |
| **Subprocess Hangs / Infinite Loops** | Agent gets stuck during a test prompt turn. | Strict per-session timeout limit (e.g. 30s) in `AgentRunnerManager` with process kill and diagnostic logging. |
| **Missing API Keys** | Code generation or agent execution fails unauthorized. | Extension settings (`agentFlow.geminiApiKey`), environment variable fallback, and in-UI API key configuration prompt. |

---

## 6. Verification & Quality Matrix

We adopt a strict **3-Tier Verification Matrix**:
1. **Tier 1: Unit Tests (100% Coverage Target)**:
   - Extension Host lifecycle, custom editor document synchronization, RPC bridge handlers, prompt loader, and webview state hooks.
2. **Tier 2: LLM Codegen Integration Tests**:
   - Automated CI tests feeding test workflows to Gemini with `prompts/python-adk.prompt.txt`, validating Python syntax compilation (`py_compile`), and executing the generated `test_pipeline.py` with `pytest`.
3. **Tier 3: VS Code Extension E2E Tests**:
   - `@vscode/test-electron` suite verifying custom editor file opening, editing dirty states, saving `.agent` JSON, and webview rendering.

---

## 7. Next Steps & Progressive Rollout

- **Immediate**: Proceed to **`/egm-draft`** to create the formal, detailed architecture design document (`design_draft.md`) for Release 1.0.0.
- **Milestones**: Execute v1.0.0 through v1.1.1 sequentially per [RELEASE_PLAN.md](file:///Users/mikenimer/Development/projects/agent-designer/RELEASE_PLAN.md) and [TASKS.md](file:///Users/mikenimer/Development/projects/agent-designer/TASKS.md).
