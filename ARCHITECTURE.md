# Visual Agent Designer: Technical Architecture

> **Author**: Mike Nimer <mikenimer@google.com>  
> **Status**: Active / Production  
> **Repository**: `visual-agent-designer`  
> **Version**: 1.0.0  

---

## 1. System Overview

**Visual Agent Designer** is an enterprise-grade Visual Studio Code extension for visually designing, generating, locally executing, and deploying autonomous AI agent systems. 

Developers build agent graphs visually on a high-density DAG canvas, while the extension manages:
1. **Prompt-Driven LLM Code Generation**: Generates complete, idiomatic Python/TypeScript repositories tailored to specific frameworks (Google ADK, LangGraph, etc.) and deployment targets (Google Cloud Vertex AI Agent Engine, Google Cloud Run).
2. **Universal In-IDE Test Runner**: Executes interactive test suites with real-time token streaming, log capturing, and smart assertion scoring without coupling to production serving infrastructure.
3. **Google Cloud Vertex AI Agent Evaluation Integration**: Automatically produces evaluation datasets and `EvalTask` scripts for trajectory evaluation, tool accuracy validation, and cloud experiment tracking.
4. **Declarative Infrastructure as Code**: Generates minimal Terraform definitions and deployment scripts to provision required Google Cloud infrastructure.

---

## 2. High-Level Architecture

The system follows a decoupled, client-server architecture:

```mermaid
graph TB
    subgraph VSCode_Editor ["VS Code Extension Host (Node.js / TypeScript)"]
        AEP["AgentEditorProvider (*.agent Custom Editor)"]
        Bridge["WebviewBridge (Type-Safe RPC Protocol)"]
        CodeGen["GeminiCodeGenEngine (Gemini 2.5 Flash / ADC)"]
        Runner["AgentRunnerManager (Universal Test Harness)"]
        EnvResolver["PythonEnvResolver (Automated .venv & pip)"]
        PromptLoader["Prompt Template Resolver (resource/prompts/)"]

        AEP --> Bridge
        Bridge --> CodeGen
        Bridge --> Runner
        Runner --> EnvResolver
        CodeGen --> PromptLoader
    end

    subgraph Webview_SPA ["Webview UI (React 19 + Tailwind v4 + React Flow)"]
        Canvas["Visual Agent Canvas (React Flow DAG)"]
        Drawers["Inspector Drawers (Agent, Trigger, Tool, Memory)"]
        Workbench["Bottom Workbench (Code View, Test Runner, Deploy)"]
        BridgeClient["useWebviewBridge (Typed Client Hook)"]

        Canvas --> BridgeClient
        Drawers --> BridgeClient
        Workbench --> BridgeClient
    end

    subgraph Generated_Repository ["Generated Target Codebase"]
        AgentCode["agent.py / server.py (Agent Logic)"]
        EvalSuite["eval_dataset.jsonl & evaluate.py (Vertex AI EvalTask)"]
        PytestSuite["test_agent.py (CI/CD Unit Tests)"]
        DeployCode["deploy.py & main.tf (IaC & Cloud Deployment)"]
    end

    Bridge <===> |postMessage RPC| BridgeClient
    CodeGen ==> |Writes Files| Generated_Repository
    Runner ==> |Spawns & Probes /v1/chat/completions| Generated_Repository
```

---

## 3. Subsystem Breakdown

### 3.1 Webview Single Page Application (UI)
* **Canvas Engine (`WorkflowCanvas.tsx`)**: High-performance DAG rendering using `@xyflow/react`. Manages nodes (`AgentNode`, `TriggerNode`, `ToolNode`, `RouterNode`), edge routing, auto-layout (Dagre), and pan/zoom viewports.
* **Property Inspectors (`*Drawer.tsx`)**: Side drawers allowing users to configure agent instructions, model selection, temperature, memory/session persistence, structured output schemas, and trigger scenarios.
* **Bottom Workbench Tabs**:
  * **Code View Tab (`CodeGenerationPanel.tsx`)**: Multi-file preview of generated code with syntax highlighting and manual code generation triggers.
  * **Test Runner Tab (`TestRunnerTab.tsx`)**: Live test execution dashboard displaying progress bars, token streaming, step latencies, stdout/stderr logs, and assertion pass/fail badges.
  * **Deployment Tab (`DeploymentTab.tsx`)**: Cloud project selector, region configuration, service account configuration, and local runner console.

### 3.2 VS Code Extension Host (Backend)
* **`AgentEditorProvider.ts`**: Implements VS Code's `CustomTextEditorProvider` to handle `.agent` document loading, saving, dirty-state tracking, and multi-tab synchronization.
* **`WebviewBridge.ts`**: Bi-directional, type-safe RPC messaging bridge guaranteeing strictly typed message exchanges between webview and extension host.
* **`GeminiCodeGenEngine.ts`**: Loads target-specific prompt templates, injects the canvas JSON document, and invokes the Gemini API (using `GEMINI_API_KEY` or Vertex AI ADC) to generate parseable multi-file JSON codebases.
* **`PythonEnvResolver.ts`**: Discovers system Python installations, isolates a `.venv` in the target directory, and automatically installs project requirements without user intervention.
* **`AgentRunnerManager.ts`**: The execution orchestrator managing local subprocess lifecycles, ephemeral test servers, HTTP probing, and assertion evaluation.

---

## 4. Deep Dive: Universal Test Runner & Evaluation Architecture

Testing AI agents requires evaluating both **deterministic logic** (tool parameters, JSON schemas) and **probabilistic outputs** (natural language quality, hallucination prevention). Furthermore, agents can be deployed to diverse environments (containerized Cloud Run services vs serverless Vertex AI Reasoning Engines).

The **Visual Agent Designer Test Runner** solves this through a **Universal Agent Adapter Pattern** that decouples the test harness from the deployment target.

### 4.1 The Universal Agent Adapter Pattern

Depending on the deployment target selected by the user, the generated code differs:
* **Cloud Run**: Generates `server.py` (FastAPI server listening on `$PORT`).
* **Vertex AI Agent Engine**: Generates `agent.py` (`AgentReasoningEngine` class) without any HTTP server.

The Test Runner handles both targets transparently without requiring modifications to the production code:

```mermaid
sequenceDiagram
    autonumber
    actor Developer
    participant UI as TestRunnerTab (Webview)
    participant ARM as AgentRunnerManager (Extension Host)
    participant Disk as Target Codebase
    participant Proc as Ephemeral Python Subprocess

    Developer->>UI: Click "Run All Tests"
    UI->>ARM: bridge.postMessage(RUN_TESTS, { scenarioIds })
    ARM->>Disk: Inspect Target Directory for Entrypoint

    alt server.py exists (Cloud Run Target)
        ARM->>Proc: spawn("python server.py --port 8000")
    else agent.py exists (Vertex AI Agent Engine Target)
        ARM->>Disk: Write Ephemeral `_agent_test_runner.py`
        ARM->>Proc: spawn("python _agent_test_runner.py --port 8000")
        Note over Proc: Imports agent.py, calls set_up(),<br/>exposes lightweight /health & /v1/chat/completions
    end

    ARM->>Proc: Probe GET http://localhost:8000/health
    Proc-->>ARM: HTTP 200 {"status": "ok"}

    loop For Each Test Scenario
        ARM->>UI: postMessage(TEST_RESULT_UPDATE, { status: "running" })
        ARM->>Proc: POST /v1/chat/completions {"messages": [{"role": "user", "content": prompt}]}
        Proc-->>ARM: HTTP 200 {"choices": [{"message": {"content": "..."}}]}
        ARM->>ARM: Evaluate Assertions (Heuristic Match + LLM Judge)
        ARM->>UI: postMessage(TEST_RESULT_UPDATE, { status: "passed", actualOutput, latencyMs })
        ARM->>UI: postMessage(EXECUTION_LOG, { text: "Turn complete..." })
    end

    ARM->>Proc: Terminate Process
    ARM->>Disk: Clean up `_agent_test_runner.py`
    ARM->>UI: postMessage(EXECUTION_COMPLETE, { summary })
```

### 4.2 The Ephemeral Test Server (`_agent_test_runner.py`)

When testing a Vertex AI Agent Engine or generic library agent where no production server exists, `AgentRunnerManager` dynamically writes an ephemeral adapter script (`_agent_test_runner.py`) directly into the target directory.

* **Zero External Dependencies**: Built entirely using Python's standard library `http.server`.
* **Dynamic Inspection**: Inspects `agent.py` for standard reasoning engine classes (`AgentReasoningEngine`, `ReasoningEngine`, `AgentWorkflow`, or top-level `query()` functions).
* **Standard OpenAI Format**: Translates standard `/v1/chat/completions` HTTP requests into `agent.query(prompt)` calls and returns standard OpenAI-compatible response JSON.
* **Auto-Cleanup**: The file is tracked in-memory by `AgentRunnerManager` and deleted immediately when the test run ends or when the VS Code editor is closed.

---

### 4.3 Multi-Tier Assertion Evaluation

The Test Runner evaluates actual agent responses against expected criteria using a two-tier evaluation engine:

1. **Tier 1: Fast Heuristic Matcher**:
   - **JSON Key-Value Matching**: Checks structured outputs against field conditions (e.g. `isBusiness: true`, `category: "refund"`).
   - **Regex / Substring Matcher**: Verifies string presence or exact patterns.
2. **Tier 2: LLM-as-a-Judge Fallback**:
   - For open-ended natural language criteria (e.g. *"Response should be polite and mention the return policy"*), the engine queries Gemini to evaluate semantic adherence and returns a detailed pass/fail reason.

---

### 4.4 Google Cloud Vertex AI Agent Evaluation Integration

In addition to interactive IDE testing, every Google Cloud agent generated by Visual Agent Designer includes a native **Vertex AI Agent Evaluation Suite**:

```
Generated Repository Structure
├── agent.py               # Core Reasoning Engine / Agent logic
├── deploy.py              # Vertex AI Agent Engine deployment script
├── main.tf                # Bare-minimum Terraform linking to existing project
├── test_agent.py          # Standalone pytest suite for CI/CD pipelines
├── eval_dataset.jsonl     # Golden evaluation dataset exported from visual triggers
└── evaluate.py            # Vertex AI EvalTask script (Trajectory & Groundedness)
```

#### What `evaluate.py` Does:
Using the official `vertexai.evaluation.EvalTask` SDK:
* **Trajectory Metrics**:
  * `trajectory_exact_match`: Asserts whether the multi-step agent chose the exact sequence of tools planned in the visual workflow.
  * `trajectory_precision`: Validates tool parameter precision.
  * `response_follows_trajectory`: Ensures final agent responses logically derive from tool outputs without hallucinations.
* **Quality & Safety Metrics**:
  * `groundedness`: Verifies factual grounding against reference documents.
  * `instruction_following`: Measures adherence to system instructions.
  * `safety`: Flags safety policy violations.
* **Vertex AI Experiments Logging**:
  * Evaluation runs automatically record results, latencies, and score distributions to **Vertex AI Experiments** in the Google Cloud Console.

---

## 5. Cloud Run & Terraform Infrastructure Orchestration

For containerized microservices and web-facing deployments, Visual Agent Designer provides end-to-end Terraform Infrastructure as Code (IaC) generation and Cloud Run deployment orchestration.

### 5.1 Decoupled Container Deployment Pattern
Terraform provisions and manages immutable cloud infrastructure (IAM, Artifact Registry, Secret Manager, Cloud Run v2 service skeleton), but explicitly decouples application container image releases via:
```hcl
lifecycle {
  ignore_changes = [
    template[0].containers[0].image,
    client,
    client_version,
  ]
}
```
This ensures CI/CD builds (`gcloud builds submit` / `cloudbuild.yaml`) can safely push images and update Cloud Run revisions without causing state drift or rollbacks during subsequent Terraform runs.

### 5.2 Generated IaC Suite (`TerraformGenerator`)
The `TerraformGenerator` produces 5 production-ready files:
1. `main.tf`: Enables required Google Cloud APIs (`run`, `artifactregistry`, `secretmanager`, `cloudbuild`, `aiplatform`), provisions an Artifact Registry Docker repository, dedicated runtime service account (`agent_runner`) with `roles/aiplatform.user`, Secret Manager secrets & versions, and a Cloud Run v2 service with CPU, memory, auto-scaling, PSC network attachments, and public/private invoker IAM.
2. `variables.tf`: Fully typed variables with descriptions and sensitive annotations for API keys and secrets.
3. `outputs.tf`: Exports the Cloud Run service URL, console URL, service account email, and Artifact Registry repository ID.
4. `terraform.tfvars`: Pre-populated environment assignment file formatted cleanly per `terraform fmt`.
5. `cloudbuild.yaml`: Multi-step CI/CD pipeline executing unit tests, Docker build, Artifact Registry push, and Cloud Run service revision deployment.

### 5.3 Extension Deployment Orchestrator (`CloudRunDeployer`)
* **Validation**: Pre-flight checks ensuring entrypoints (`server.py`, `agent.py`, `Dockerfile`) exist before executing builds.
* **Stream Telemetry**: Real-time stdout/stderr streaming from `gcloud run deploy` to the Webview deployment terminal.
* **Remote Probing**: Live query testing with automatic Google Cloud identity token generation for authenticated endpoints.
* **Metadata Persistence**: Saves `cloud_run_deployment_metadata.json` for state restoration across IDE restarts.

### 5.4 Deployment Targets & Runtime Comparison (Cloud Run vs. Vertex AI Agent Engine)

Visual Agent Designer supports two enterprise Google Cloud deployment targets, each with distinct runtime characteristics, network routing models, and API compatibility semantics:

```mermaid
graph TB
    subgraph Clients ["Client Ecosystem"]
        OpenAIClient["OpenAI SDK / LangChain / Curl"]
        IDEChat["IDE Interactive Chat Tab"]
        GCPClients["Vertex AI SDK / gcloud"]
    end

    subgraph CloudRunTarget ["Target 1: Google Cloud Run (Containerized Microservice)"]
        CRIngress["Cloud Run Ingress (https://<service>.run.app)"]
        ServerPy["FastAPI Server (server.py)"]
        OpenAIRoutes["POST /v1/chat/completions<br/>GET /v1/models"]
        DirectRoutes["POST /<br/>POST /api/run"]
        ADKRunner1["Google ADK Runner & Session Service"]
        AgentCore1["Agent Logic (agent.py)"]

        CRIngress --> ServerPy
        ServerPy --> OpenAIRoutes
        ServerPy --> DirectRoutes
        OpenAIRoutes --> ADKRunner1
        DirectRoutes --> ADKRunner1
        ADKRunner1 --> AgentCore1
    end

    subgraph AgentEngineTarget ["Target 2: Vertex AI Agent Engine (Managed Reasoning Engine)"]
        AIGateway["Vertex AI API Gateway (aiplatform.googleapis.com)"]
        RPCQuery["POST .../reasoningEngines/<id>:query<br/>POST .../reasoningEngines/<id>:streamQuery"]
        ADKServer["Google ADK Native Container (adk api_server)"]
        AgentCore2["Agent Logic (agent.py)"]

        AIGateway --> RPCQuery
        RPCQuery --> ADKServer
        ADKServer --> AgentCore2
    end

    OpenAIClient -->|Standard OpenAI HTTP| CRIngress
    IDEChat -->|Direct POST /| CRIngress
    IDEChat -->|Vertex AI RPC query| AIGateway
    GCPClients -->|OAuth2 Bearer RPC| AIGateway
```

#### Detailed Architecture & API Compatibility Matrix

| Architectural Dimension | **Google Cloud Run** | **Google Vertex AI Agent Engine** |
| :--- | :--- | :--- |
| **Runtime Model** | Serverless Knative container running user-defined `server.py` on `$PORT` (8080). Developer maintains complete ownership of HTTP routing, middleware, and serialization. | Fully managed serverless execution environment hosted inside Google's multi-tenant Vertex AI infrastructure. Container executes standard `adk api_server`. |
| **Public Endpoint Structure** | Standard HTTP/S URL: `https://<service-name>-<hash>-<region>.a.run.app` | Managed GCP RPC URL: `https://<region>-aiplatform.googleapis.com/v1/projects/<project>/locations/<region>/reasoningEngines/<id>:query` |
| **OpenAI API Compatibility (`/v1/*`)** | **Native Support**: Generates `GET /v1/models` and `POST /v1/chat/completions` (supporting SSE delta streaming chunks and complete JSON responses) whenever a Chat Trigger is present. | **No Native Support**: Neither Google ADK's `adk api_server` nor the Vertex AI API Gateway exposes OpenAI-compatible routes. Calls must use an external gateway or adapter proxy. |
| **IDE Runner / Direct Testing Routes** | Exposes direct `@app.post("/")` and `@app.post("/api/run")` accepting `{input: {query}}` or `{query}` to enable zero-configuration chat and automated deployment testing. | Handled via Vertex AI `:query` and `:streamQuery` with the `class_method: "async_stream_query"` envelope. |
| **Asynchronous Streaming Protocol** | Native Server-Sent Events (SSE) via `StreamingResponse` using OpenAI `chat.completion.chunk` delta packets terminated with `data: [DONE]`. | Server-Sent Events via Vertex AI `:streamQuery?alt=sse` emitting Google Cloud RPC event envelopes. |
| **Authentication & Access Control** | Cloud Run IAM (`roles/run.invoker`) with OIDC identity tokens, or public/unauthenticated access with custom API keys or webhook secrets. | Google Cloud OAuth2 Bearer tokens (`roles/aiplatform.user`) obtained via `gcloud auth print-access-token` or service account ADC. |
| **Event-Driven Triggers** | Direct HTTP push targets: Pub/Sub push subscriptions (`/apps/{app}/trigger/pubsub`), Eventarc webhooks (`/webhook`), or custom event endpoints. | Google Cloud Scheduler or Eventarc directly targeting the Vertex AI Reasoning Engine REST URI via service account invocation. |

---

## 6. Security & Secret Management

1. **Authentication Priority**:
   * **Explicit Key Override**: If `GEMINI_API_KEY` is supplied, it takes priority (useful for local development and CI).
   * **Application Default Credentials (ADC)**: When `GEMINI_API_KEY` is not present, the agent automatically falls back to Vertex AI with Google Cloud ADC (`gcloud auth application-default login` or Workload Identity).
2. **Ephemeral Artifact Isolation**:
   * Temporary execution scripts are constrained strictly to the active workspace directory.
   * Port collision detection ensures abandoned processes are safely terminated.
3. **Infrastructure as Code Safety**:
   * Terraform templates do not create new Google Cloud projects or hardcode sensitive credentials; they link to existing projects via variables.
   * Secret Manager is automatically used to store sensitive variables, and Cloud Run references secrets via `value_source.secret_key_ref`.

---

## 7. Future Roadmap

* **Continuous Production Monitoring (BigQuery Sink)**:
  * Stream production user conversations, tool latencies, and token counts from Cloud Run / Agent Engine to partitioned BigQuery tables.
  * Schedule daily/weekly `EvalTask` jobs over production BigQuery logs to detect drift and regressions in production.
* **Multi-Framework Generators**:
  * LangGraph and TypeScript runtime generators.
* **Model Context Protocol (MCP) Tool Integration**:
  * Visual wiring of remote and local MCP tool servers.
