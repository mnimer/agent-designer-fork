# Active Task Tracker: TASK-251 (TASK-241) & TASK-203..TASK-212

**Task**: TASK-251 / TASK-241: Google Workspace Remote MCP Servers Catalog & Gemini Enterprise User OAuth
**Milestone**: v1.5.5 / v1.2.0 (Google Workspace Remote MCP Servers Catalog)
**Status**: Completed
**Author**: Mike Nimer <mikenimer@google.com>

## Objective
Add a dedicated **Google Workspace MCP Servers** catalog section to the Tools Sidebar (`PaletteCard.tsx` and `AddToolModal.tsx`) exposing all 13 official Google Workspace Remote MCP Servers (`gmailmcp`, `drivemcp`, `docsmcp`, `sheetsmcp`, `slidesmcp`, `calendarmcp`, `chatmcp`, `meetmcp`, `tasksmcp`, `people`, `formsmcp`, `keepmcp`, `classroommcp`), a **Google Workspace MCP Setup & OAuth Scope Helper** panel in `McpToolDrawer.tsx`, Gemini Enterprise User OAuth vs. Service Account deployment controls in `GovernanceStatusCard.tsx` and `AgentGovernanceProvisioner.ts`, and prompt-driven codegen/Terraform support in `resource/prompts/*.prompt.txt`.

## Subtasks
- [x] **Subtask 1: Types, Catalog Data, Categorization & Codegen Prompts**
- [x] **Subtask 2: UI Components (`PaletteCard.tsx`, `AddToolModal.tsx`, `McpToolDrawer.tsx`, `ToolDrawerShell.tsx`) & Unit Tests**
- [x] **Subtask 3: Gemini Enterprise Authentication Mode (`service_account` vs `user_oauth`), Project Service Account Selector & Post-Deploy OAuth Redirect URI Modal**
- [x] **Subtask 4: Manager Review, Full Test Suite Verification & Documentation Sync**

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
