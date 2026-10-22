# Active Task Tracker: Webview Code-Splitting & Lazy Loading + TASK-251

**Task**: Webview Bundle Code-Splitting, Lazy Loading & Build Optimization
**Milestone**: v1.5.5
**Status**: Completed
**Author**: Mike Nimer <mikenimer@google.com>

## Objective
1. Add always-visible `24x24px` (`+`) quick-add buttons to all Agent, Tool, and Trigger palette cards (`PaletteCard.tsx` & `CanvasTab.tsx`) — **Completed & Committed (`fd188a5`)**.
2. Split the 1.54 MB Vite / 3.1 MB esbuild webview bundle into <500 kB vendor/feature chunks (`vite.config.ts`), remove the redundant monolithic `esbuild` overwrite from `package.json`, load `assets/index.js` as an ES module (`<script type="module" nonce="..." src="...">`) in `WebviewHtmlProvider.ts`, and lazy-load off-screen drawers, modals, settings, and bottom panel sub-tabs via `React.lazy` and `Suspense` in `FlowCanvas.tsx`, `CanvasTab.tsx`, `PaletteCard.tsx`, and `CodeGenerationPanel.tsx`.

## Subtasks
- [x] **Subtask 1: Quick-Add (`+`) Button on Agent, Tool, and Trigger Cards (`fd188a5`)**
- [x] **Subtask 2: Create Isolated Failing Unit Test (`tests/unit/webview/WebviewCodeSplitting.test.ts`)**
- [x] **Subtask 3: Configure `vite.config.ts`, `package.json`, and `WebviewHtmlProvider.ts` for ES Module Chunking**
- [x] **Subtask 4: Lazy-Load Off-Screen Drawers, Modals, Settings, and Bottom Tabs (`FlowCanvas.tsx`, `CanvasTab.tsx`, `PaletteCard.tsx`, `CodeGenerationPanel.tsx`)**
- [x] **Subtask 5: Build Verification (<500 kB per chunk, zero warnings) & Unit Test Suite Verification**

---

## Previously Completed: TASK-251 (TASK-241) Google Workspace Remote MCP Servers Catalog & Gemini Enterprise User OAuth

---

## Completed E2E Integration Tasks (TASK-203 to TASK-212)
- [x] **TASK-203**: Integration Test: Financial Fraud & Services Router (Intent Classifier + State Expressions + SQLite)
- [x] **TASK-204**: Integration Test: Market Research Synthesizer Reducer (Parallel Fan-Out + Multi-Tool + Firestore)
- [x] **TASK-205**: Integration Test: Commercial Loan HITL Approval Gate (Human-in-the-Loop + Cloud SQL PostgreSQL)
- [x] **TASK-206**: Integration Test: Resilient Weather & Outage Fallback (Circuit Breaker + Memorystore Redis + Cron)
- [x] **TASK-207**: Integration Test: Healthcare Diagnostic Guardrail Shield (Bi-directional PII Gate + Cloud Spanner)
- [x] **TASK-208**: Integration Test: Procurement B2B A2A Protocol Agent (JSON-RPC 2.0 + Google Cloud IAM OIDC)
- [x] **TASK-209**: Integration Test: Autonomous Code Optimizer Loop (Evaluator-Optimizer + Thinking Budget + Sandbox)
- [x] **TASK-210**: Integration Test: Strategic Policy Multi-Agent Debate (Pro/Con Debaters + Search + Arbiter Consensus)
- [x] **TASK-211**: Integration Test: Legal Contract Compliance Triad (Sequential Triad + Vertex AI Search + Cloud SQL)
- [x] **TASK-212**: Integration Test: Enterprise Data Platform Agent-as-a-Tool (BigQuery Remote MCP + Cloud Spanner)
