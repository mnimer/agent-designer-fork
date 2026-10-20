# [TASK-203 to TASK-212] End-to-End Integration Tasks Tracker

> **Author**: Mike Nimer <mikenimer@google.com>  
> **Orchestrator**: Task Developer Manager (`nimer-task-developer-manager`)

## Objective
Implement and verify the 10 End-to-End Integration Test suites (`TASK-203` through `TASK-212`) across both **Google Agent Runtime** (`agent_engine`) and **Google Cloud Run** (`cloudrun`) deployment targets, plus unit tests in `tests/unit/evaluators/agent-spec-evaluator.test.ts` validating 100% RTM extraction for each new `.agent` specification.

## Task Queue & Status

- [x] **TASK-203**: Integration Test: Financial Fraud & Services Router (Intent Classifier + State Expressions + SQLite)
  - Files: `tests/integration/financial_router.agent`, `tests/integration/financial-router.test.ts`
- [x] **TASK-204**: Integration Test: Market Research Synthesizer Reducer (Parallel Fan-Out + Multi-Tool + Firestore)
  - Files: `tests/integration/market_research_synthesizer.agent`, `tests/integration/market-research-synthesizer.test.ts`
- [x] **TASK-205**: Integration Test: Commercial Loan HITL Approval Gate (Human-in-the-Loop + Cloud SQL PostgreSQL)
  - Files: `tests/integration/loan_approval_hitl.agent`, `tests/integration/loan-approval-hitl.test.ts`
- [x] **TASK-206**: Integration Test: Resilient Weather & Outage Fallback (Circuit Breaker + Memorystore Redis + Cron)
  - Files: `tests/integration/resilient_weather_fallback.agent`, `tests/integration/resilient-weather-fallback.test.ts`
- [x] **TASK-207**: Integration Test: Healthcare Diagnostic Guardrail Shield (Bi-directional PII Gate + Cloud Spanner)
  - Files: `tests/integration/healthcare_guardrail.agent`, `tests/integration/healthcare-guardrail.test.ts`
- [x] **TASK-208**: Integration Test: Procurement B2B A2A Protocol Agent (JSON-RPC 2.0 + Google Cloud IAM OIDC)
  - Files: `tests/integration/procurement_a2a.agent`, `tests/integration/procurement-a2a.test.ts`
- [x] **TASK-209**: Integration Test: Autonomous Code Optimizer Loop (Evaluator-Optimizer + Thinking Budget + Sandbox)
  - Files: `tests/integration/code_optimizer_loop.agent`, `tests/integration/code-optimizer-loop.test.ts`
- [x] **TASK-210**: Integration Test: Strategic Policy Multi-Agent Debate (Pro/Con Debaters + Search + Arbiter Consensus)
  - Files: `tests/integration/policy_debate.agent`, `tests/integration/policy-debate.test.ts`
- [x] **TASK-211**: Integration Test: Legal Contract Compliance Triad (Sequential Triad + Vertex AI Search + Cloud SQL)
  - Files: `tests/integration/legal_contract_triad.agent`, `tests/integration/legal-contract-triad.test.ts`
- [x] **TASK-212**: Integration Test: Enterprise Data Platform Agent-as-a-Tool (BigQuery Remote MCP + Cloud Spanner)
  - Files: `tests/integration/enterprise_data_platform.agent`, `tests/integration/enterprise-data-platform.test.ts`

## Verification Gates per Task
1. `.agent` blueprint conforms to `AgentWorkflowDocument` schema (`src/shared/agentSpec.ts`), uses 8pt-snapped coordinates (`x % 8 === 0`, `y % 8 === 0`), and follows trigger handle conventions (`tester` on left via `trigger_out_right` -> `input_left`; operational triggers above via `trigger_out_bottom` -> `input`).
2. `agent-spec-evaluator.ts` (`parseAgentWorkflowSpec` & `formatAgentSpecChecklist`) extracts 100% of specialized configs (`routerConfig`, `synthesizerConfig`, `hitlConfig`, `fallbackConfig`, `guardrailConfig`, `a2aConfig`, `debateConfig`, `inputSchema`, `thinkingBudget`, `memoryConfig`) and is verified by unit tests in `tests/unit/evaluators/agent-spec-evaluator.test.ts`.
3. Integration test (`npx tsx --test tests/integration/<name>.test.ts`) executes `runCodegenAndEvaluate()` against both `'agent_engine'` and `'cloudrun'`, passing with `hardVetoTriggered === false`, `overallScore >= 80`, `architectureScore >= 75`, `specificationScore >= 75`, `securityScore >= 80`, and `isGood === true`.
4. If any prompt remediation directive is surfaced during evaluation, update `resource/prompts/python_adk_agent-engine.prompt.txt` and `resource/prompts/python_adk_cloudrun.prompt.txt` directly (never add procedural post-processing).
