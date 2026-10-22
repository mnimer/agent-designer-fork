/**
 * Integration Test: Financial Fraud & Services Router (Intent Classifier + State Expressions + SQLite)
 *
 * Author: Mike Nimer <mikenimer@google.com>
 *
 * Purpose:
 * Validates end-to-end code generation and multi-agent evaluation for the
 * `financial_router.agent` workflow across both supported deployment targets:
 * 1. Google Vertex AI Agent Engine (`python_adk_agent-engine.prompt.txt`)
 * 2. Google Cloud Run (`python_adk_cloudrun.prompt.txt`)
 *
 * Workflow Topology:
 * - Root agent: `financial_services_router` (`agentKind === 'router'`) evaluating boolean expressions
 *   and dynamically dispatching to specialized downstream branches:
 *   * Branch 1: `Fraud Investigation` (risk_score >= 75 or (is_international and transaction_amount > 10000))
 *   * Branch 2: `Wealth Advisory` (transaction_amount >= 100000 and risk_score < 40)
 *   * Branch 3: `Card Dispute Services` (transaction_type == 'card' and risk_score >= 40)
 *   * Default Branch: `General Customer Care` (fallback)
 * - Candidate agents: `fraud_investigator`, `wealth_advisor`, `dispute_specialist`, `general_support`.
 * - Memory: SQLite ephemeral checkpointing (`./sessions.db`).
 * - Triggers: Chat Trigger with streaming session memory and Test Suite runner with 4 test scenarios.
 */

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import * as path from 'path';
import * as fs from 'fs';
import { runCodegenAndEvaluate } from './codegen-runner';

describe('Financial Services Router Integration Tests (Google ADK)', { timeout: 720000 }, () => {
    const fixturePath = path.join(__dirname, 'financial_router.agent');

    it('should generate valid production code and pass multi-agent evaluation targeting Vertex Agent Engine', { timeout: 360000 }, async () => {
        assert.ok(fs.existsSync(fixturePath), `Fixture file not found at ${fixturePath}`);

        const result = await runCodegenAndEvaluate(
            'financial_router_agent_engine',
            'Financial Fraud & Services Router (Agent Engine)',
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

    it('should generate valid production code and pass multi-agent evaluation targeting Google Cloud Run', { timeout: 360000 }, async () => {
        assert.ok(fs.existsSync(fixturePath), `Fixture file not found at ${fixturePath}`);

        const result = await runCodegenAndEvaluate(
            'financial_router_cloudrun',
            'Financial Fraud & Services Router (Cloud Run)',
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
