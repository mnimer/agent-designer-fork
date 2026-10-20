/**
 * Integration Test: Healthcare Diagnostic Guardrail Shield (Bi-directional PII Gate + Cloud Spanner)
 *
 * Author: Mike Nimer <mikenimer@google.com>
 *
 * Purpose:
 * Validates end-to-end code generation and multi-agent evaluation for the
 * `healthcare_guardrail.agent` workflow across both supported deployment targets:
 * 1. Google Vertex AI Agent Engine (`python_adk_agent-engine.prompt.txt`)
 * 2. Google Cloud Run (`python_adk_cloudrun.prompt.txt`)
 *
 * Workflow Topology:
 * - Ingress Guardrail Node: `guardrail_ingress_shield` (`agentKind === 'guardrail'`, `direction: 'ingress'`)
 *   enforcing PII (SSN, MRN, DEA) and prompt injection safety policies, routing clean requests to
 *   `agent_clinical_diagnostic` and violations to `agent_security_audit`.
 * - Core Clinical Agent Node: `agent_clinical_diagnostic` querying anonymized ICD-10 medical protocols
 *   via Google Cloud Remote MCP Server (`tool_bigquery_mcp`), delegating downstream to `guardrail_egress_shield`.
 * - Security Audit Alert Agent: `agent_security_audit` logging compliance alerts and returning violation notice.
 * - Egress Guardrail Node: `guardrail_egress_shield` (`agentKind === 'guardrail'`, `direction: 'egress'`)
 *   redacting clinical PII (SSN, MRN) with `[REDACTED_PATIENT_IDENTIFIER]`.
 * - Memory: Google Cloud Spanner Enterprise checkpointer (`SpannerSessionStore` with auto-DDL).
 * - Triggers: Streaming Chat Trigger and Test Suite verifying clean queries, prompt injection blocking, and egress PII redaction.
 */

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import * as path from 'path';
import * as fs from 'fs';
import { runCodegenAndEvaluate } from './codegen-runner';

describe('Healthcare Diagnostic Guardrail Shield Integration Tests (Google ADK)', { timeout: 1500000 }, () => {
    const fixturePath = path.join(__dirname, 'healthcare_guardrail.agent');

    it('should generate valid production code and pass multi-agent evaluation targeting Vertex Agent Engine', { timeout: 600000 }, async () => {
        assert.ok(fs.existsSync(fixturePath), `Fixture file not found at ${fixturePath}`);

        const result = await runCodegenAndEvaluate(
            'healthcare_guardrail_agent_engine',
            'Healthcare Diagnostic Guardrail Shield (Agent Engine)',
            fixturePath,
            'agent_engine'
        );

        const { scorecard, hardVetoTriggered, hardVetoReasons } = result.evaluation;

        if (hardVetoTriggered) {
            console.error('[Agent Engine] Hard Veto Reasons:', hardVetoReasons);
        }

        assert.strictEqual(
            hardVetoTriggered,
            false,
            `Hard veto was triggered: ${hardVetoReasons.join('; ')}`
        );

        assert.ok(
            scorecard.overallScore >= 80,
            `Overall evaluation score (${scorecard.overallScore}/100) is below passing threshold (80/100)`
        );

        assert.ok(
            scorecard.architectureScore >= 75,
            `Architecture score (${scorecard.architectureScore}/100) is below threshold (75/100)`
        );

        if (scorecard.specificationScore !== undefined) {
            assert.ok(
                scorecard.specificationScore >= 75,
                `Specification score (${scorecard.specificationScore}/100) is below threshold (75/100)`
            );
        }

        assert.ok(
            scorecard.securityScore >= 85,
            `Security score (${scorecard.securityScore}/100) is below threshold (85/100)`
        );

        assert.ok(
            result.isGood,
            `Evaluation failed: ${result.evaluation.explanation}`
        );
    });

    it('should generate valid production code and pass multi-agent evaluation targeting Google Cloud Run', { timeout: 600000 }, async () => {
        assert.ok(fs.existsSync(fixturePath), `Fixture file not found at ${fixturePath}`);

        const result = await runCodegenAndEvaluate(
            'healthcare_guardrail_cloudrun',
            'Healthcare Diagnostic Guardrail Shield (Cloud Run)',
            fixturePath,
            'cloudrun'
        );

        const { scorecard, hardVetoTriggered, hardVetoReasons } = result.evaluation;

        if (hardVetoTriggered) {
            console.error('[Cloud Run] Hard Veto Reasons:', hardVetoReasons);
        }

        assert.strictEqual(
            hardVetoTriggered,
            false,
            `Hard veto was triggered: ${hardVetoReasons.join('; ')}`
        );

        assert.ok(
            scorecard.overallScore >= 80,
            `Overall evaluation score (${scorecard.overallScore}/100) is below passing threshold (80/100)`
        );

        assert.ok(
            scorecard.architectureScore >= 75,
            `Architecture score (${scorecard.architectureScore}/100) is below threshold (75/100)`
        );

        if (scorecard.specificationScore !== undefined) {
            assert.ok(
                scorecard.specificationScore >= 75,
                `Specification score (${scorecard.specificationScore}/100) is below threshold (75/100)`
            );
        }

        assert.ok(
            scorecard.securityScore >= 85,
            `Security score (${scorecard.securityScore}/100) is below threshold (85/100)`
        );

        assert.ok(
            result.isGood,
            `Evaluation failed: ${result.evaluation.explanation}`
        );
    });
});
