/**
 * Unit Tests for Agent Specification & Workflow Conformance Evaluator.
 *
 * Author: Mike Nimer <mikenimer@google.com>
 *
 * Purpose:
 * Validates 100% extraction of .agent workflow JSON specifications into
 * Requirement Traceability Matrices (RTM) and checklist formatting:
 * - Real sample parsing (animal_agent.agent, cyber_guardian.agent)
 * - Handling of empty, invalid, or minimal JSON workflows
 * - Extraction of Structured Output Schemas (Pydantic models)
 * - Extraction of Tool definitions, parameters, and source files
 * - Extraction of Triggers and Test Scenarios
 * - Edge topology resolution to human-readable agent names
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
    parseAgentWorkflowSpec,
    formatAgentSpecChecklist,
    ParsedAgentSpec
} from '../../../tests/integration/evaluators/agent-spec-evaluator';

describe('Agent Specification Evaluator', () => {
    const animalAgentPath = path.resolve(__dirname, '../../../tests/integration/animal_agent.agent');
    const cyberGuardianPath = path.resolve(__dirname, '../../../tests/integration/cyber_guardian.agent');
    const financialRouterPath = path.resolve(__dirname, '../../../tests/integration/financial_router.agent');
    const marketResearchPath = path.resolve(__dirname, '../../../tests/integration/market_research_synthesizer.agent');
    const loanApprovalPath = path.resolve(__dirname, '../../../tests/integration/loan_approval_hitl.agent');
    const resilientWeatherPath = path.resolve(__dirname, '../../../tests/integration/resilient_weather_fallback.agent');
    const healthcareGuardrailPath = path.resolve(__dirname, '../../../tests/integration/healthcare_guardrail.agent');
    const procurementA2aPath = path.resolve(__dirname, '../../../tests/integration/procurement_a2a.agent');
    const codeOptimizerLoopPath = path.resolve(__dirname, '../../../tests/integration/code_optimizer_loop.agent');
    const policyDebatePath = path.resolve(__dirname, '../../../tests/integration/policy_debate.agent');
    const legalContractTriadPath = path.resolve(__dirname, '../../../tests/integration/legal_contract_triad.agent');
    const enterpriseDataPlatformPath = path.resolve(__dirname, '../../../tests/integration/enterprise_data_platform.agent');

    describe('parseAgentWorkflowSpec', () => {
        it('should safely return default spec when given empty or whitespace string', () => {
            const spec = parseAgentWorkflowSpec('');
            expect(spec.name).toBe('unnamed');
            expect(spec.framework).toBe('google-adk');
            expect(spec.language).toBe('python');
            expect(spec.agents.length).toBe(0);
            expect(spec.triggers.length).toBe(0);
            expect(spec.edges.length).toBe(0);
        });

        it('should safely return default spec when given malformed JSON', () => {
            const spec = parseAgentWorkflowSpec('{"invalid": json');
            expect(spec.name).toBe('unnamed');
            expect(spec.agents.length).toBe(0);
        });

        it('should accurately parse animal_agent.agent sample workflow', () => {
            expect(fs.existsSync(animalAgentPath)).toBe(true);
            const content = fs.readFileSync(animalAgentPath, 'utf-8');
            const spec = parseAgentWorkflowSpec(content);

            expect(spec.name).toBe('animal_agent');
            expect(spec.framework).toBe('google-adk');
            expect(spec.language).toBe('python');
            expect(spec.deploymentTarget).toBe('agent_engine');
            expect(spec.agents.length).toBeGreaterThan(0);

            // Verify root expert agent
            const expert = spec.agents.find(a => a.name === 'animal_expert');
            expect(expert).toBeDefined();
            expect(expert?.isStartNode).toBe(true);
            expect(expert?.subAgents.length).toBe(2);

            // Verify subagents
            const catAgent = spec.agents.find(a => a.name === 'cat_agent');
            expect(catAgent).toBeDefined();
            expect(catAgent?.tools.length).toBeGreaterThan(0);
            expect(catAgent?.tools.some(t => t.type === 'search')).toBe(true);

            // Verify triggers
            expect(spec.triggers.length).toBeGreaterThan(0);
            const chatTrigger = spec.triggers.find(t => t.triggerType === 'chat');
            expect(chatTrigger).toBeDefined();

            // Verify edge topology resolution
            expect(spec.edges.length).toBeGreaterThan(0);
            for (const edge of spec.edges) {
                expect(edge.sourceName).toBeDefined();
                expect(edge.targetName).toBeDefined();
            }
        });

        it('should accurately parse cyber_guardian.agent multi-agent workflow', () => {
            expect(fs.existsSync(cyberGuardianPath)).toBe(true);
            const content = fs.readFileSync(cyberGuardianPath, 'utf-8');
            const spec = parseAgentWorkflowSpec(content);

            expect(spec.name).toBe('CyberGuardianSecOps');
            expect(spec.agents.length).toBeGreaterThanOrEqual(4);

            // Verify orchestrator
            const orchestrator = spec.agents.find(a => a.name === 'cyber_guardian_orchestrator');
            expect(orchestrator).toBeDefined();
            expect(orchestrator?.isStartNode).toBe(true);
            expect(orchestrator?.subAgents.length).toBe(4);

            // Verify triage specialist
            const triage = spec.agents.find(a => a.id.includes('triage') || a.name.includes('triage') || a.label.includes('Triage'));
            expect(triage).toBeDefined();

            // Verify trigger scenarios
            const trigger = spec.triggers.find(t => t.triggerType === 'eventarc' || t.id.includes('trigger'));
            expect(trigger).toBeDefined();
            expect(trigger?.testScenarios.length).toBeGreaterThan(0);
            const scenario = trigger?.testScenarios[0];
            expect(scenario?.inputQuery || scenario?.prompt).toBeDefined();
        });

        it('should accurately parse code_reviewer.agent sample workflow with dual triggers and 6 test scenarios', () => {
            const codeReviewerPath = path.resolve(__dirname, '../../../resource/samples/sdlc/code_reviewer/code_reviewer.agent');
            expect(fs.existsSync(codeReviewerPath)).toBe(true);
            const content = fs.readFileSync(codeReviewerPath, 'utf-8');
            const spec = parseAgentWorkflowSpec(content);

            expect(spec.name).toBe('Code Reviewing Agent');
            expect(spec.framework).toBe('google-adk');
            expect(spec.language).toBe('python');
            expect(spec.agents.length).toBe(4);

            const coordinator = spec.agents.find(a => a.name === 'code_review_coordinator');
            expect(coordinator).toBeDefined();
            expect(coordinator?.isStartNode).toBe(true);
            expect(coordinator?.subAgents.length).toBe(3);

            const testerTrigger = spec.triggers.find(t => t.triggerType === 'tester');
            expect(testerTrigger).toBeDefined();
            expect(testerTrigger?.testScenarios.length).toBe(6);
        });

        it('should accurately parse financial_router.agent workflow with router config and input schema', () => {
            expect(fs.existsSync(financialRouterPath)).toBe(true);
            const content = fs.readFileSync(financialRouterPath, 'utf-8');
            const spec = parseAgentWorkflowSpec(content);

            expect(spec.name).toBe('financial_services_router');
            expect(spec.framework).toBe('google-adk');
            expect(spec.language).toBe('python');
            expect(spec.agents.length).toBe(5);

            const router = spec.agents.find(a => a.name === 'financial_services_router');
            expect(router).toBeDefined();
            expect(router?.isStartNode).toBe(true);
            expect(router?.agentKind).toBe('router');
            expect(router?.memoryType).toBe('sqlite');
            expect(router?.memoryConfig?.sqlitePath).toBe('./sessions.db');

            // Input schema
            expect(router?.inputSchema).toBeDefined();
            expect(router?.inputSchema?.name).toBe('TransactionInput');
            expect(router?.inputSchema?.fields.length).toBe(4);
            const amountField = router?.inputSchema?.fields.find(f => f.name === 'transaction_amount');
            expect(amountField?.type).toBe('number');
            expect(amountField?.required).toBe(true);

            // Router config
            expect(router?.routerConfig).toBeDefined();
            expect(router?.routerConfig?.evaluationMode).toBe('boolean_expression');
            expect(router?.routerConfig?.routingStrategy).toBe('first_match');
            expect(router?.routerConfig?.branches.length).toBe(4);

            // Triggers
            expect(spec.triggers.length).toBe(2);
            const tester = spec.triggers.find(t => t.triggerType === 'tester');
            expect(tester?.testScenarios.length).toBe(4);

            // Checklist verification
            const checklist = formatAgentSpecChecklist(spec);
            expect(checklist).toContain('[REQ-AGENT-1] Agent: "financial_services_router"');
            expect(checklist).toContain('Agent Kind: router');
            expect(checklist).toContain('sqlitePath: "./sessions.db"');
            expect(checklist).toContain('[REQ-INPUT-SCHEMA-financial_services_router] Input Schema Model "TransactionInput":');
            expect(checklist).toContain('[REQ-ROUTER-financial_services_router] Router Configuration:');
            expect(checklist).toContain('Branch "Fraud Investigation"');
            expect(checklist).toContain('Branch "General Customer Care"');
        });

        it('should accurately parse market_research_synthesizer.agent workflow with parallel fan-out, multi-tool workers, and synthesizer output schema', () => {
            expect(fs.existsSync(marketResearchPath)).toBe(true);
            const content = fs.readFileSync(marketResearchPath, 'utf-8');
            const spec = parseAgentWorkflowSpec(content);

            expect(spec.name).toBe('market_research_synthesizer');
            expect(spec.agents.length).toBe(5);

            // Lead orchestrator
            const lead = spec.agents.find(a => a.name === 'market_research_lead');
            expect(lead).toBeDefined();
            expect(lead?.isStartNode).toBe(true);
            expect(lead?.subAgentPattern).toBe('parallel');
            expect(lead?.memoryType).toBe('firestore');
            expect(lead?.memoryConfig?.collectionName).toBe('market_research_sessions');

            // Parallel leaf workers
            const competitor = spec.agents.find(a => a.name === 'competitor_analyst');
            expect(competitor).toBeDefined();
            expect(competitor?.tools.some(t => t.type === 'search')).toBe(true);

            const sentiment = spec.agents.find(a => a.name === 'sentiment_modeler');
            expect(sentiment).toBeDefined();
            expect(sentiment?.tools.some(t => t.type === 'builtin')).toBe(true);

            const financial = spec.agents.find(a => a.name === 'financial_data_analyst');
            expect(financial).toBeDefined();
            expect(financial?.tools.some(t => t.type === 'rest')).toBe(true);

            // Synthesizer
            const synthesizer = spec.agents.find(a => a.name === 'executive_synthesizer');
            expect(synthesizer).toBeDefined();
            expect(synthesizer?.agentKind).toBe('synthesizer');
            expect(synthesizer?.tools.length).toBe(0);
            expect(synthesizer?.synthesizerConfig?.inputStateKeys).toEqual(['competitor_data', 'sentiment_data', 'financial_data']);
            expect(synthesizer?.structuredOutput?.name).toBe('ExecutiveMarketBrief');
            expect(synthesizer?.structuredOutput?.fields.length).toBe(5);

            // Checklist verification
            const checklist = formatAgentSpecChecklist(spec);
            expect(checklist).toContain('[REQ-AGENT-1] Agent: "market_research_lead"');
            expect(checklist).toContain('collectionName: "market_research_sessions"');
            expect(checklist).toContain('Agent Kind: synthesizer');
            expect(checklist).toContain('[REQ-SYNTHESIZER-executive_synthesizer] Synthesizer Configuration:');
            expect(checklist).toContain('[REQ-SCHEMA-executive_synthesizer] Pydantic Model "ExecutiveMarketBrief":');
            expect(checklist).toContain('market_outlook');
            expect(checklist).toContain('key_competitors');
        });

        it('should accurately parse loan_approval_hitl.agent workflow with HITL approval gate and Cloud SQL memory', () => {
            expect(fs.existsSync(loanApprovalPath)).toBe(true);
            const content = fs.readFileSync(loanApprovalPath, 'utf-8');
            const spec = parseAgentWorkflowSpec(content);

            expect(spec.name).toBe('commercial_loan_approval_hitl');
            expect(spec.agents.length).toBe(4);

            // Automated underwriter root agent
            const underwriter = spec.agents.find(a => a.name === 'automated_underwriter');
            expect(underwriter).toBeDefined();
            expect(underwriter?.isStartNode).toBe(true);
            expect(underwriter?.memoryType).toBe('cloud_sql');
            expect(underwriter?.memoryConfig?.instanceConnectionName).toBe('project:region:loan-pg-instance');
            expect(underwriter?.memoryConfig?.databaseName).toBe('loan_db');
            expect(underwriter?.memoryConfig?.tableName).toBe('commercial_loan_sessions');
            expect(underwriter?.inputSchema?.name).toBe('LoanApplicationInput');
            expect(underwriter?.inputSchema?.fields.length).toBe(5);

            // HITL Approval Gate
            const hitlGate = spec.agents.find(a => a.name === 'hitl_loan_officer');
            expect(hitlGate).toBeDefined();
            expect(hitlGate?.agentKind).toBe('hitl');
            expect(hitlGate?.hitlConfig).toBeDefined();
            expect(hitlGate?.hitlConfig?.approvalCondition).toContain('state.loan_amount > 100000');
            expect(hitlGate?.hitlConfig?.timeoutHours).toBe(48);
            expect(hitlGate?.hitlConfig?.autoRejectOnTimeout).toBe(true);
            expect(hitlGate?.hitlConfig?.approvedAgentId).toBe('agent_disbursement');
            expect(hitlGate?.hitlConfig?.rejectedAgentId).toBe('agent_rejection_notice');
            expect(hitlGate?.tools.some(t => t.name === 'request_input')).toBe(true);

            // Branch destination agents
            const disbursement = spec.agents.find(a => a.name === 'disbursement_specialist');
            expect(disbursement).toBeDefined();
            const rejection = spec.agents.find(a => a.name === 'rejection_notice_specialist');
            expect(rejection).toBeDefined();

            // Triggers
            expect(spec.triggers.length).toBe(2);
            const pubsub = spec.triggers.find(t => t.triggerType === 'pubsub');
            expect(pubsub).toBeDefined();
            expect(pubsub?.config?.topicName).toBe('loan-applications');
            const tester = spec.triggers.find(t => t.triggerType === 'tester');
            expect(tester?.testScenarios.length).toBe(2);

            // Checklist verification
            const checklist = formatAgentSpecChecklist(spec);
            expect(checklist).toContain('[REQ-AGENT-1] Agent: "automated_underwriter"');
            expect(checklist).toContain('instanceConnectionName: "project:region:loan-pg-instance"');
            expect(checklist).toContain('databaseName: "loan_db"');
            expect(checklist).toContain('Agent Kind: hitl');
            expect(checklist).toContain('[REQ-HITL-hitl_loan_officer] Human-in-the-Loop Configuration:');
            expect(checklist).toContain('Approval Condition: "state.loan_amount > 100000 or state.risk_tier == \'ELEVATED\'"');
            expect(checklist).toContain('Approved Target: "agent_disbursement"');
            expect(checklist).toContain('Rejected Target: "agent_rejection_notice"');
        });

        it('should accurately parse resilient_weather_fallback.agent workflow with circuit breaker, Redis memory, and Cron trigger', () => {
            expect(fs.existsSync(resilientWeatherPath)).toBe(true);
            const content = fs.readFileSync(resilientWeatherPath, 'utf-8');
            const spec = parseAgentWorkflowSpec(content);

            expect(spec.name).toBe('resilient_weather_fallback');
            expect(spec.agents.length).toBe(3);

            // Circuit breaker root agent
            const breaker = spec.agents.find(a => a.name === 'weather_circuit_breaker');
            expect(breaker).toBeDefined();
            expect(breaker?.isStartNode).toBe(true);
            expect(breaker?.agentKind).toBe('fallback');
            expect(breaker?.memoryType).toBe('redis');
            expect(breaker?.memoryConfig?.redisHost).toBe('10.0.0.45');
            expect(breaker?.memoryConfig?.redisPort).toBe(6379);
            expect(breaker?.memoryConfig?.ttlSeconds).toBe(86400);

            // Fallback config
            expect(breaker?.fallbackConfig).toBeDefined();
            expect(breaker?.fallbackConfig?.primaryTargetAgentId).toBe('agent_live_weather');
            expect(breaker?.fallbackConfig?.fallbackTargetAgentId).toBe('agent_radar_archive');
            expect(breaker?.fallbackConfig?.maxRetries).toBe(3);
            expect(breaker?.fallbackConfig?.caughtErrorCodes).toContain('RESOURCE_EXHAUSTED');

            // Leaf agents and tools
            const live = spec.agents.find(a => a.name === 'live_weather_agent');
            expect(live).toBeDefined();
            expect(live?.tools.some(t => t.type === 'rest')).toBe(true);

            const archive = spec.agents.find(a => a.name === 'cached_radar_archive');
            expect(archive).toBeDefined();
            expect(archive?.tools.some(t => t.type === 'search')).toBe(true);

            // Triggers
            expect(spec.triggers.length).toBe(3);
            const cron = spec.triggers.find(t => t.triggerType === 'cron');
            expect(cron).toBeDefined();
            expect(cron?.config?.cronExpression).toBe('0 */6 * * *');

            // Checklist verification
            const checklist = formatAgentSpecChecklist(spec);
            expect(checklist).toContain('[REQ-AGENT-1] Agent: "weather_circuit_breaker"');
            expect(checklist).toContain('Agent Kind: fallback');
            expect(checklist).toContain('redisHost: "10.0.0.45"');
            expect(checklist).toContain('ttlSeconds: 86400');
            expect(checklist).toContain('[REQ-FALLBACK-weather_circuit_breaker] Fallback Configuration:');
            expect(checklist).toContain('Max Retries: 3');
            expect(checklist).toContain('Primary Target: "agent_live_weather"');
            expect(checklist).toContain('Fallback Target: "agent_radar_archive"');
        });

        it('should accurately parse healthcare_guardrail.agent workflow with bi-directional guardrails, BigQuery MCP, and Spanner memory', () => {
            expect(fs.existsSync(healthcareGuardrailPath)).toBe(true);
            const content = fs.readFileSync(healthcareGuardrailPath, 'utf-8');
            const spec = parseAgentWorkflowSpec(content);

            expect(spec.name).toBe('healthcare_guardrail_shield');
            expect(spec.agents.length).toBe(4);

            // Ingress guardrail node
            const ingress = spec.agents.find(a => a.name === 'ingress_guardrail_shield');
            expect(ingress).toBeDefined();
            expect(ingress?.isStartNode).toBe(true);
            expect(ingress?.agentKind).toBe('guardrail');
            expect(ingress?.memoryType).toBe('spanner');
            expect(ingress?.memoryConfig?.instanceId).toBe('healthcare-spanner-inst');
            expect(ingress?.memoryConfig?.databaseId).toBe('clinical_sessions_db');
            expect(ingress?.memoryConfig?.tableName).toBe('PatientSessions');

            // Ingress guardrail config
            expect(ingress?.guardrailConfig).toBeDefined();
            expect(ingress?.guardrailConfig?.direction).toBe('ingress');
            expect(ingress?.guardrailConfig?.actionOnViolation).toBe('block');
            expect(ingress?.guardrailConfig?.safetyPolicies).toContain('pii');
            expect(ingress?.guardrailConfig?.safetyPolicies).toContain('prompt_injection');
            expect(ingress?.guardrailConfig?.regexPatterns.some((r: any) => r.name === 'SSN')).toBe(true);
            expect(ingress?.guardrailConfig?.regexPatterns.some((r: any) => r.name === 'MRN')).toBe(true);
            expect(ingress?.guardrailConfig?.passTargetAgentId).toBe('agent_clinical_diagnostic');
            expect(ingress?.guardrailConfig?.violationTargetAgentId).toBe('agent_security_audit');

            // Clinical agent with Remote BigQuery MCP tool
            const clinical = spec.agents.find(a => a.name === 'clinical_diagnostic_assistant');
            expect(clinical).toBeDefined();
            expect(clinical?.tools.length).toBe(1);
            const mcpTool = clinical?.tools[0];
            expect(mcpTool?.type).toBe('mcp');
            expect(mcpTool?.mcpConfig?.serverType).toBe('google_cloud_remote');
            expect(mcpTool?.mcpConfig?.gcpService).toBe('bigquery');
            expect(mcpTool?.mcpConfig?.transport).toBe('streamable_http');

            // Egress guardrail node
            const egress = spec.agents.find(a => a.name === 'egress_guardrail_shield');
            expect(egress).toBeDefined();
            expect(egress?.agentKind).toBe('guardrail');
            expect(egress?.guardrailConfig?.direction).toBe('egress');
            expect(egress?.guardrailConfig?.actionOnViolation).toBe('redact');
            expect(egress?.guardrailConfig?.redactionToken).toBe('[REDACTED_PATIENT_IDENTIFIER]');

            // Triggers
            expect(spec.triggers.length).toBe(2);
            const chat = spec.triggers.find(t => t.triggerType === 'chat');
            expect(chat).toBeDefined();
            expect(chat?.config?.sessionMemory).toBe('spanner');
            const tester = spec.triggers.find(t => t.triggerType === 'tester');
            expect(tester?.testScenarios.length).toBe(3);

            // Checklist verification
            const checklist = formatAgentSpecChecklist(spec);
            expect(checklist).toContain('[REQ-AGENT-1] Agent: "ingress_guardrail_shield"');
            expect(checklist).toContain('Agent Kind: guardrail');
            expect(checklist).toContain('instanceId: "healthcare-spanner-inst"');
            expect(checklist).toContain('databaseId: "clinical_sessions_db"');
            expect(checklist).toContain('[REQ-GUARDRAIL-ingress_guardrail_shield] Guardrail Configuration:');
            expect(checklist).toContain('Direction: ingress');
            expect(checklist).toContain('Action on Violation: block');
            expect(checklist).toContain('[REQ-TOOL-clinical_diagnostic_assistant-1] Tool: "BigQuery Medical Protocols MCP" (mcp)');
            expect(checklist).toContain('[REQ-GUARDRAIL-egress_guardrail_shield] Guardrail Configuration:');
            expect(checklist).toContain('Direction: egress');
            expect(checklist).toContain('Action on Violation: redact');
        });

        it('should accurately parse procurement_a2a.agent workflow with A2A node, Firestore memory, and PubSub trigger', () => {
            expect(fs.existsSync(procurementA2aPath)).toBe(true);
            const content = fs.readFileSync(procurementA2aPath, 'utf-8');
            const spec = parseAgentWorkflowSpec(content);

            expect(spec.name).toBe('procurement_b2b_a2a_orchestrator');
            expect(spec.agents.length).toBe(4);

            // Root orchestrator
            const orchestrator = spec.agents.find(a => a.name === 'procurement_orchestrator');
            expect(orchestrator).toBeDefined();
            expect(orchestrator?.isStartNode).toBe(true);
            expect(orchestrator?.subAgentPattern).toBe('sequential');
            expect(orchestrator?.memoryType).toBe('firestore');
            expect(orchestrator?.memoryConfig?.collectionName).toBe('procurement_sessions');

            // Vendor A2A node
            const a2aNode = spec.agents.find(a => a.name === 'vendor_catalog_a2a');
            expect(a2aNode).toBeDefined();
            expect(a2aNode?.agentKind).toBe('a2a');
            expect(a2aNode?.a2aConfig).toBeDefined();
            expect(a2aNode?.a2aConfig?.endpoint).toBe('https://catalog-service.vendor-corp.internal/a2a/v1');
            expect(a2aNode?.a2aConfig?.authType).toBe('google_iam');
            expect(a2aNode?.a2aConfig?.capabilities).toContain('search_sku');
            expect(a2aNode?.a2aConfig?.capabilities).toContain('place_purchase_order');

            // Inventory & confirmation sub-agents
            const inventory = spec.agents.find(a => a.name === 'inventory_agent');
            expect(inventory).toBeDefined();
            const confirmation = spec.agents.find(a => a.name === 'confirmation_dispatcher');
            expect(confirmation).toBeDefined();

            // Triggers
            expect(spec.triggers.length).toBe(2);
            const pubsub = spec.triggers.find(t => t.triggerType === 'pubsub');
            expect(pubsub).toBeDefined();
            expect(pubsub?.config?.topicName).toBe('b2b-procurement-orders');
            const tester = spec.triggers.find(t => t.triggerType === 'tester');
            expect(tester?.testScenarios.length).toBe(2);

            // Checklist verification
            const checklist = formatAgentSpecChecklist(spec);
            expect(checklist).toContain('[REQ-AGENT-1] Agent: "procurement_orchestrator"');
            expect(checklist).toContain('collectionName: "procurement_sessions"');
            expect(checklist).toContain('Agent Kind: a2a');
            expect(checklist).toContain('[REQ-A2A-vendor_catalog_a2a] Agent-to-Agent Configuration:');
            expect(checklist).toContain('Endpoint: https://catalog-service.vendor-corp.internal/a2a/v1');
            expect(checklist).toContain('Auth Type: google_iam');
        });

        it('should accurately parse code_optimizer_loop.agent workflow with Evaluator-Optimizer loop, thinkingBudget, and code execution sandbox', () => {
            expect(fs.existsSync(codeOptimizerLoopPath)).toBe(true);
            const content = fs.readFileSync(codeOptimizerLoopPath, 'utf-8');
            const spec = parseAgentWorkflowSpec(content);

            expect(spec.name).toBe('code_optimizer_loop');
            expect(spec.agents.length).toBe(2);

            // Generator Node
            const generator = spec.agents.find(a => a.name === 'algorithm_generator');
            expect(generator).toBeDefined();
            expect(generator?.isStartNode).toBe(true);
            expect(generator?.model).toBe('gemini-3.7-flash');
            expect(generator?.thinkingBudget).toBe(2048);
            expect(generator?.maxIterations).toBe(4);
            expect(generator?.subAgentPattern).toBe('loop');
            expect(generator?.memoryType).toBe('sqlite');
            expect(generator?.memoryConfig?.sqlitePath).toBe('./optimizer_sessions.db');
            expect(generator?.subAgents.length).toBe(1);

            // Evaluator Node
            const evaluator = spec.agents.find(a => a.name === 'benchmark_evaluator');
            expect(evaluator).toBeDefined();
            expect(evaluator?.tools.length).toBe(1);
            expect(evaluator?.tools[0].type).toBe('builtin');

            // Triggers & Scenarios
            expect(spec.triggers.length).toBe(1);
            const tester = spec.triggers.find(t => t.triggerType === 'tester');
            expect(tester).toBeDefined();
            expect(tester?.testScenarios.length).toBe(2);

            // Checklist verification
            const checklist = formatAgentSpecChecklist(spec);
            expect(checklist).toContain('[REQ-AGENT-1] Agent: "algorithm_generator"');
            expect(checklist).toContain('Thinking Budget: 2048');
            expect(checklist).toContain('Max Iterations: 4');
            expect(checklist).toContain('Pattern: loop');
            expect(checklist).toContain('sqlitePath: "./optimizer_sessions.db"');
            expect(checklist).toContain('Tool: "Python Code Execution Sandbox" (builtin)');
        });

        it('should accurately parse policy_debate.agent workflow with 4-node debate topology, search grounding, and arbiter consensus', () => {
            expect(fs.existsSync(policyDebatePath)).toBe(true);
            const content = fs.readFileSync(policyDebatePath, 'utf-8');
            const spec = parseAgentWorkflowSpec(content);

            expect(spec.name).toBe('policy_debate_system');
            expect(spec.agents.length).toBe(4);

            // Moderator & Arbiter Node
            const arbiter = spec.agents.find(a => a.name === 'debate_moderator_arbiter');
            expect(arbiter).toBeDefined();
            expect(arbiter?.isStartNode).toBe(true);
            expect(arbiter?.subAgentPattern).toBe('debate');
            expect(arbiter?.memoryType).toBe('in_memory');
            expect(arbiter?.debateConfig).toBeDefined();
            expect(arbiter?.debateConfig?.maxRounds).toBe(3);
            expect(arbiter?.debateConfig?.consensusThreshold).toBe(0.85);
            expect(arbiter?.debateConfig?.debateStyle).toBe('structured_rebuttal');

            // Debater sub-agents
            const pro = spec.agents.find(a => a.name === 'pro_policy_advocate');
            expect(pro).toBeDefined();
            expect(pro?.tools.length).toBe(1);
            expect(pro?.tools[0].type).toBe('search');

            const con = spec.agents.find(a => a.name === 'con_policy_advocate');
            expect(con).toBeDefined();
            expect(con?.tools.length).toBe(1);
            expect(con?.tools[0].type).toBe('search');

            // Consensus Synthesizer
            const synthesizer = spec.agents.find(a => a.name === 'consensus_resolution_synthesizer');
            expect(synthesizer).toBeDefined();
            expect(synthesizer?.agentKind).toBe('synthesizer');
            expect(synthesizer?.synthesizerConfig?.reductionStrategy).toBe('consensus_synthesis');
            expect(synthesizer?.synthesizerConfig?.inputStateKeys).toContain('pro_arguments');
            expect(synthesizer?.synthesizerConfig?.inputStateKeys).toContain('con_arguments');

            // Triggers
            expect(spec.triggers.length).toBe(2);
            const chatTrigger = spec.triggers.find(t => t.triggerType === 'chat');
            expect(chatTrigger).toBeDefined();
            const testerTrigger = spec.triggers.find(t => t.triggerType === 'tester');
            expect(testerTrigger?.testScenarios.length).toBe(2);

            // Checklist verification
            const checklist = formatAgentSpecChecklist(spec);
            expect(checklist).toContain('[REQ-AGENT-1] Agent: "debate_moderator_arbiter"');
            expect(checklist).toContain('Pattern: debate');
            expect(checklist).toContain('[REQ-DEBATE-debate_moderator_arbiter] Multi-Agent Debate Configuration:');
            expect(checklist).toContain('Max Rounds: 3');
            expect(checklist).toContain('Consensus Threshold: 0.85');
            expect(checklist).toContain('Debate Style: structured_rebuttal');
            expect(checklist).toContain('[REQ-SYNTHESIZER-consensus_resolution_synthesizer] Synthesizer Configuration:');
            expect(checklist).toContain('Reduction Strategy: consensus_synthesis');
        });

        it('should accurately parse legal_contract_triad.agent workflow with 3-node sequential review & critique triad, Vertex AI Search, Cloud SQL memory, and Pydantic schema', () => {
            expect(fs.existsSync(legalContractTriadPath)).toBe(true);
            const content = fs.readFileSync(legalContractTriadPath, 'utf-8');
            const spec = parseAgentWorkflowSpec(content);

            expect(spec.name).toBe('legal_contract_triad');
            expect(spec.agents.length).toBe(3);

            // Drafting Author Node
            const author = spec.agents.find(a => a.name === 'contract_drafting_author');
            expect(author).toBeDefined();
            expect(author?.isStartNode).toBe(true);
            expect(author?.subAgentPattern).toBe('review_critique');
            expect(author?.memoryType).toBe('cloud_sql');
            expect(author?.memoryConfig?.instanceConnectionName).toBe('corp-legal:us-central1:legal-db');
            expect(author?.memoryConfig?.databaseName).toBe('contracts_db');
            expect(author?.tools.length).toBe(1);
            expect(author?.tools[0].type).toBe('search');
            expect(author?.tools[0].vertexAiSearchConfig?.dataStoreId).toContain('legal-corpus-ds');

            // Adversarial Critic Node
            const critic = spec.agents.find(a => a.name === 'adversarial_compliance_critic');
            expect(critic).toBeDefined();
            expect(critic?.role).toBe('Adversarial Contract Compliance Specialist');
            expect(critic?.tools.length).toBe(0);

            // Polish Editor Node
            const editor = spec.agents.find(a => a.name === 'final_polish_editor');
            expect(editor).toBeDefined();
            expect(editor?.tools.length).toBe(0);
            expect(editor?.structuredOutput?.enabled).toBe(true);
            expect(editor?.structuredOutput?.name).toBe('FinalizedContractClause');
            expect(editor?.structuredOutput?.fields.length).toBe(5);

            // Triggers
            expect(spec.triggers.length).toBe(2);
            const chatTrigger = spec.triggers.find(t => t.triggerType === 'chat');
            expect(chatTrigger).toBeDefined();
            const testerTrigger = spec.triggers.find(t => t.triggerType === 'tester');
            expect(testerTrigger?.testScenarios.length).toBe(2);

            // Checklist verification
            const checklist = formatAgentSpecChecklist(spec);
            expect(checklist).toContain('[REQ-AGENT-1] Agent: "contract_drafting_author"');
            expect(checklist).toContain('Pattern: review_critique');
            expect(checklist).toContain('instanceConnectionName: "corp-legal:us-central1:legal-db"');
            expect(checklist).toContain('Tool: "Legal Precedent Knowledge Base" (search)');
            expect(checklist).toContain('[REQ-SCHEMA-final_polish_editor] Pydantic Model "FinalizedContractClause":');
            expect(checklist).toContain('clause_title (string, required)');
        });

        it('should accurately parse enterprise_data_platform.agent workflow with Agent-as-a-Tool node, BigQuery Remote MCP, thinkingBudget, and Cloud Spanner memory', () => {
            expect(fs.existsSync(enterpriseDataPlatformPath)).toBe(true);
            const content = fs.readFileSync(enterpriseDataPlatformPath, 'utf-8');
            const spec = parseAgentWorkflowSpec(content);

            expect(spec.name).toBe('enterprise_data_platform');
            expect(spec.agents.length).toBe(2);

            // Executive Analyst Node
            const analyst = spec.agents.find(a => a.name === 'executive_data_analyst');
            expect(analyst).toBeDefined();
            expect(analyst?.isStartNode).toBe(true);
            expect(analyst?.thinkingBudget).toBe(4096);
            expect(analyst?.memoryType).toBe('spanner');
            expect(analyst?.memoryConfig?.instanceId).toBe('data-platform-spanner');
            expect(analyst?.tools.length).toBe(2);

            const mcpTool = analyst?.tools.find(t => t.type === 'mcp');
            expect(mcpTool).toBeDefined();
            expect(mcpTool?.name).toBe('BigQuery Remote MCP');
            expect(mcpTool?.mcpConfig?.serverType).toBe('google_cloud_remote');

            const agentTool = analyst?.tools.find(t => t.type === 'builtin');
            expect(agentTool).toBeDefined();
            expect(agentTool?.functionName).toBe('generate_sql_query');

            // NL2SQL Sub-agent
            const subagent = spec.agents.find(a => a.name === 'nl2sql_expert_agent');
            expect(subagent).toBeDefined();
            expect(subagent?.role).toBe('BigQuery SQL Architecture Specialist');

            // Triggers
            expect(spec.triggers.length).toBe(3);
            const eventarcTrigger = spec.triggers.find(t => t.triggerType === 'eventarc');
            expect(eventarcTrigger).toBeDefined();
            const chatTrigger = spec.triggers.find(t => t.triggerType === 'chat');
            expect(chatTrigger).toBeDefined();
            const testerTrigger = spec.triggers.find(t => t.triggerType === 'tester');
            expect(testerTrigger?.testScenarios.length).toBe(2);

            // Checklist verification
            const checklist = formatAgentSpecChecklist(spec);
            expect(checklist).toContain('[REQ-AGENT-1] Agent: "executive_data_analyst"');
            expect(checklist).toContain('Thinking Budget: 4096');
            expect(checklist).toContain('instanceId: "data-platform-spanner"');
            expect(checklist).toContain('Tool: "BigQuery Remote MCP" (mcp)');
            expect(checklist).toContain('Tool: "generate_sql_query" (builtin)');
        });

        it('should parse structured output schemas with Pydantic field definitions', () => {
            const workflow = {
                name: 'Structured Agent Workflow',
                nodes: [
                    {
                        id: 'agent_1',
                        type: 'agent',
                        data: {
                            name: 'ExtractorAgent',
                            label: 'Data Extractor',
                            model: 'gemini-3.8-flash',
                            structuredOutput: {
                                enabled: true,
                                name: 'EntityExtractionResult',
                                fields: [
                                    {
                                        name: 'entities',
                                        type: 'array',
                                        arrayItemType: 'string',
                                        required: true,
                                        description: 'Extracted named entities'
                                    },
                                    {
                                        name: 'confidence',
                                        type: 'number',
                                        required: true,
                                        description: 'Confidence score between 0.0 and 1.0'
                                    }
                                ]
                            }
                        }
                    }
                ],
                edges: []
            };

            const spec = parseAgentWorkflowSpec(JSON.stringify(workflow));
            expect(spec.agents.length).toBe(1);
            const agent = spec.agents[0];
            expect(agent.structuredOutput).toBeDefined();
            expect(agent.structuredOutput?.enabled).toBe(true);
            expect(agent.structuredOutput?.name).toBe('EntityExtractionResult');
            expect(agent.structuredOutput?.fields.length).toBe(2);

            const entitiesField = agent.structuredOutput?.fields[0];
            expect(entitiesField?.name).toBe('entities');
            expect(entitiesField?.type).toBe('array');
            expect(entitiesField?.arrayItemType).toBe('string');
            expect(entitiesField?.required).toBe(true);

            const confidenceField = agent.structuredOutput?.fields[1];
            expect(confidenceField?.name).toBe('confidence');
            expect(confidenceField?.type).toBe('number');
            expect(confidenceField?.required).toBe(true);
        });

        it('should extract custom tool details including function parameters and source files', () => {
            const workflow = {
                name: 'Custom Tool Workflow',
                nodes: [
                    {
                        id: 'agent_tool_user',
                        type: 'agent',
                        data: {
                            name: 'ToolAgent',
                            tools: [
                                {
                                    id: 'tool_calc',
                                    name: 'calculate_tax',
                                    type: 'custom_code',
                                    sourceFile: 'tools/tax_calc.py',
                                    functionName: 'compute_sales_tax',
                                    description: 'Computes state sales tax for items',
                                    parameters: {
                                        amount: 'float',
                                        state_code: 'str'
                                    }
                                }
                            ]
                        }
                    }
                ],
                edges: []
            };

            const spec = parseAgentWorkflowSpec(JSON.stringify(workflow));
            expect(spec.agents[0].tools.length).toBe(1);
            const tool = spec.agents[0].tools[0];
            expect(tool.name).toBe('calculate_tax');
            expect(tool.sourceFile).toBe('tools/tax_calc.py');
            expect(tool.functionName).toBe('compute_sales_tax');
            expect(tool.parameters?.amount).toBe('float');
            expect(tool.parameters?.state_code).toBe('str');
        });

        it('should resolve edge connections with human-readable node names', () => {
            const workflow = {
                name: 'Connected Workflow',
                nodes: [
                    { id: 'node_1', data: { name: 'ProducerAgent' } },
                    { id: 'node_2', data: { label: 'ConsumerAgent' } }
                ],
                edges: [
                    { source: 'node_1', target: 'node_2' }
                ]
            };

            const spec = parseAgentWorkflowSpec(JSON.stringify(workflow));
            expect(spec.edges.length).toBe(1);
            expect(spec.edges[0].sourceName).toBe('ProducerAgent');
            expect(spec.edges[0].targetName).toBe('ConsumerAgent');
        });
    });

    describe('formatAgentSpecChecklist', () => {
        it('should generate structured RTM checklist with REQ- headers and deployment info', () => {
            const spec: ParsedAgentSpec = {
                name: 'Sample System',
                framework: 'google-adk',
                language: 'python',
                deploymentTarget: 'cloudrun',
                deploymentConfig: {
                    includeDocker: true,
                    includeTests: true,
                    useStreaming: false
                },
                agents: [
                    {
                        id: 'agent_1',
                        name: 'coordinator',
                        label: 'Master Coordinator',
                        model: 'gemini-3.8-flash',
                        temperature: 0.2,
                        maxIterations: 10,
                        role: 'Coordinator',
                        systemPrompt: 'You coordinate all research tasks.',
                        tools: [
                            {
                                id: 't1',
                                name: 'search_tool',
                                type: 'google_search',
                                description: 'Performs web search'
                            }
                        ],
                        subAgents: [{ agentId: 'agent_2', name: 'worker' }],
                        structuredOutput: {
                            enabled: true,
                            name: 'ReportSchema',
                            fields: [
                                { name: 'summary', type: 'string', required: true, description: 'Executive summary' }
                            ]
                        }
                    }
                ],
                triggers: [
                    {
                        id: 'trig_1',
                        label: 'Chat Interface',
                        triggerType: 'chat',
                        config: {},
                        testScenarios: [
                            {
                                id: 'sc_1',
                                name: 'Greeting Test',
                                prompt: 'Hello agent',
                                expectedOutput: 'Hello! How can I help you?',
                                assertionType: 'contains'
                            }
                        ]
                    }
                ],
                edges: [
                    {
                        source: 'trig_1',
                        target: 'agent_1',
                        sourceName: 'Chat Interface',
                        targetName: 'Master Coordinator'
                    }
                ]
            };

            const checklist = formatAgentSpecChecklist(spec);

            // Verify Header & Flags
            expect(checklist).toContain('Workflow: "Sample System"');
            expect(checklist).toContain('Deployment Target: cloudrun');
            expect(checklist).toContain('includeDocker=true');
            expect(checklist).toContain('includeTests=true');

            // Verify Agent RTM
            expect(checklist).toContain('[REQ-AGENT-1] Agent: "coordinator" (Label: "Master Coordinator")');
            expect(checklist).toContain('Model: gemini-3.8-flash');
            expect(checklist).toContain('Temperature: 0.2');
            expect(checklist).toContain('Max Iterations: 10');
            expect(checklist).toContain('System Instructions: "You coordinate all research tasks."');

            // Verify Schema RTM
            expect(checklist).toContain('[REQ-SCHEMA-coordinator] Pydantic Model "ReportSchema":');
            expect(checklist).toContain('summary (string, required) - Executive summary');

            // Verify Tool RTM
            expect(checklist).toContain('[REQ-TOOL-coordinator-1] Tool: "search_tool" (google_search)');

            // Verify Trigger & Test RTM
            expect(checklist).toContain('[REQ-TRIGGER-1] Trigger: "Chat Interface" (Type: chat)');
            expect(checklist).toContain('[REQ-TEST-1-1] Test Scenario "Greeting Test":');
            expect(checklist).toContain('Input: "Hello agent"');
            expect(checklist).toContain('Expected: "Hello! How can I help you?" (assertion: contains)');

            // Verify Edge Topology
            expect(checklist).toContain('Topology Edges:');
            expect(checklist).toContain('"Chat Interface" -> "Master Coordinator"');
        });
    });
});
