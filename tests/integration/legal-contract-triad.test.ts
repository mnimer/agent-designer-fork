/**
 * Integration Test: Legal Contract Compliance Triad (Sequential Triad + Vertex AI Search + Cloud SQL)
 *
 * Author: Mike Nimer <mikenimer@google.com>
 *
 * Purpose:
 * Validates end-to-end code generation and multi-agent evaluation for the
 * `legal_contract_triad.agent` workflow across both supported deployment targets:
 * 1. Google Vertex AI Agent Engine (`python_adk_agent-engine.prompt.txt`)
 * 2. Google Cloud Run (`python_adk_cloudrun.prompt.txt`)
 *
 * Workflow Topology:
 * - Root agent / Drafting Author: `contract_drafting_author` (`agent_legal_author`) drafting commercial contract clauses
 *   grounded via `VertexAiSearchTool` (legal precedent repository), writing to state key `initial_draft`.
 * - Adversarial Critic: `adversarial_compliance_critic` (`agent_legal_critic`) auditing against GDPR, liability caps,
 *   and indemnification standards, writing structured feedback into state key `critique_rubric`.
 * - Final Polish Editor: `final_polish_editor` (`agent_legal_editor`) consuming state and producing structured output
 *   conforming to `FinalizedContractClause` (Pydantic model).
 * - Memory: Google Cloud SQL PostgreSQL checkpointer (`CloudSqlSessionStore` with auto-DDL).
 * - Triggers: Interactive Chat Trigger (`trigger_chat_legal`) and Test Suite Trigger (`trigger_tester_legal`).
 */

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import * as path from 'path';
import * as fs from 'fs';
import { runCodegenAndEvaluate } from './codegen-runner';

describe('Legal Contract Compliance Triad Integration Tests (Google ADK)', { timeout: 1500000 }, () => {
    const fixturePath = path.join(__dirname, 'legal_contract_triad.agent');

    it('should generate valid production code and pass multi-agent evaluation targeting Vertex Agent Engine', { timeout: 600000 }, async () => {
        assert.ok(fs.existsSync(fixturePath), `Fixture file not found at ${fixturePath}`);

        const result = await runCodegenAndEvaluate(
            'legal_contract_triad_agent_engine',
            'Legal Contract Compliance Triad (Agent Engine)',
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
            scorecard.securityScore >= 80,
            `Security score (${scorecard.securityScore}/100) is below threshold (80/100)`
        );

        assert.ok(
            result.isGood,
            `Evaluation failed: ${result.evaluation.explanation}`
        );
    });

    it('should generate valid production code and pass multi-agent evaluation targeting Google Cloud Run', { timeout: 600000 }, async () => {
        assert.ok(fs.existsSync(fixturePath), `Fixture file not found at ${fixturePath}`);

        const result = await runCodegenAndEvaluate(
            'legal_contract_triad_cloudrun',
            'Legal Contract Compliance Triad (Cloud Run)',
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
            scorecard.securityScore >= 80,
            `Security score (${scorecard.securityScore}/100) is below threshold (80/100)`
        );

        assert.ok(
            result.isGood,
            `Evaluation failed: ${result.evaluation.explanation}`
        );
    });
});
