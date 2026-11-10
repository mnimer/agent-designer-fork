# Active Task Tracker: Skill-Assembled Single-Prompt Code Generation (+ optional reviewer)

**Status**: In Progress
**Author**: Mike Nimer <mikenimer@google.com>
**Decision (2026-10-23)**: Multi-agent was 2.3-2.5x slower than the single prompt (code_reviewer: 83 s vs 190-212 s). Keep ONE Gemini call, but assemble its prompt from the topic skills (feature-selected); keep target-folder cleanup + progress UI; add a reviewer pass behind a code-generator flag (OFF by default) for testing.

## Subtasks
- [x] 1. Restore the develop single-prompt engine (provider routes, JSON-array parsing); prompt from `SinglePromptBuilder` instead of `resource/prompts/*`
- [x] 2. `src/extension/codegen/`: frontmatter parser + skill catalog (`usedBy`, `targets`, `preloadWhen`), feature detector, blueprint view, prompt builder, read-only checks, `CodeReviewer` (review -> fix loop)
- [x] 3. Skills: rewrite `codegen-common` for single-response JSON output; migrate frontmatter; reviewer/fix prompts in `resource/codegen-prompts/`
- [x] 4. Remove multi-agent orchestration + `@google/adk` (dependency, esbuild shim, engines back to ^1.85.0, lockfile)
- [x] 5. Progress UI phases (generating / checks / review / fix / done)
- [x] 6. Tests: 1295 unit tests green (2 known runner timing flakes under load); live (7 runs each): develop ~105 s mean vs skill-assembled ~127 s mean; reviewer run 208 s
- [x] 7. Docs (ARCHITECTURE.md §3.3, DESIGN_DOC.md §5.2 + §6.0)

---

# Previously Active Task Tracker: Multi-Agent Code Generation (ADK TypeScript)

**Task**: Replace the monolithic ~180 KB code-gen prompt with an in-process `@google/adk` `Workflow` (core -> 4 parallel shards -> reviewer loop) driven by topic skills
**Status**: Implemented — awaiting user verification
**Author**: Mike Nimer <mikenimer@google.com>
**Design**: approved design doc (grill session 2026-10-22) — Gemini-only, `Workflow` + `dynamicEntry`, `write_file` tool, `resource/codegen-skills/<topic>/SKILL.md`, hybrid skill loading, JSON manifest contract, reviewer LoopAgent-style re-dispatch (max 2 rounds) with read-only checks

## Subtasks
- [x] **1. Feasibility**: `@google/adk@2.3.0`, esbuild `import.meta.url` inject shim, `engines.vscode ^1.101.0`, lockfile regenerated; live spike passed
- [x] **2. Skills**: 27 topic skills in `resource/codegen-skills/` + 7 role briefs in `resource/codegen-agents/`; prompt-content regression tests retargeted to the skills corpus (`tests/unit/helpers/codegenSkillsCorpus.ts`)
- [x] **3. Core modules** (`src/extension/codegen/multiagent/`): blueprint view, feature detector, skill catalog (`preloadWhen`), manifest, ownership-enforcing `write_file` store
- [x] **4. Agent graph**: manifest-first `Workflow` (`contract` -> core/tests/runtime/infra/docs in parallel), sub-branch isolation, retry/backoff
- [x] **5. Review loop**: `ReadOnlyCheckRunner` + reviewer (`outputSchema`) + per-owner fix rounds (max 2)
- [x] **6. Wire-up**: `GeminiCodeGenEngine` delegates (Gemini-only); `CODE_GENERATION_PROGRESS` -> `CodeGenProgressView`; monolith + Go/Java/GKE prompts deleted
- [x] **7. Verification**: 1406/1406 unit tests; live company_verifier 51-68 s vs 87 s monolith, review clean, 0 cross-file import mismatches (latency analysis artifact)
- [x] **8. Docs**: `ARCHITECTURE.md` §3.3, `DESIGN_DOC.md` §5.2 + §6.0
- [ ] **9. User verification**: run in VS Code (>= 1.101) Extension Development Host on the remaining samples / both targets before merging

---

# Previously Active Task Tracker: Webview Code-Splitting & Lazy Loading + TASK-251

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
