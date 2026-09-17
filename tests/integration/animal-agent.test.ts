/**
 * Integration Test: Animal Expert Multi-Agent System
 *
 * Author: Mike Nimer <mikenimer@google.com>
 *
 * Purpose:
 * Validates end-to-end code generation and multi-agent evaluation for the
 * `animal_agent.agent` workflow across both supported deployment targets:
 * 1. Google Vertex AI Agent Engine (`python_adk_agent-engine.prompt.txt`)
 * 2. Google Cloud Run (`python_adk_cloudrun.prompt.txt`)
 *
 * Workflow Topology:
 * - Root agent: `Animal Expert` (animal_expert) delegating in parallel to `Cat Agent` and `Fish Agent`.
 * - Leaf subagents: `cat_agent` and `fish_agent` equipped with Google Search Grounding (`GoogleSearchTool(bypass_multi_tools_limit=True)`).
 * - Triggers: Chat Trigger with streaming session memory and Test Suite runner.
 *
 * Architectural decisions:
 * - Employs the Multi-Agent Code Evaluation Harness (Deterministic Gate + 4 Specialist Agents + Lead Arbiter).
 * - Records detailed scorecards and prompt remediation directives in `tests/integration/test-report.md`.
 */

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import * as path from 'path';
import * as fs from 'fs';
import { runCodegenAndEvaluate } from './codegen-runner';

describe('Animal Agent Integration Tests (Google ADK)', { timeout: 720000 }, () => {
    const localFixturePath = path.join(__dirname, 'animal_agent.agent');
    const externalFixturePath = '/Users/mikenimer/Development/projects/visual-agent-designer-pipelines/agents/basic-examples/animal_agent.agent';
    const fixturePath = fs.existsSync(localFixturePath) ? localFixturePath : externalFixturePath;

    it('should generate valid production code and pass multi-agent evaluation targeting Vertex Agent Engine', { timeout: 360000 }, async () => {
        assert.ok(fs.existsSync(fixturePath), `Fixture file not found at ${localFixturePath} or ${externalFixturePath}`);

        const result = await runCodegenAndEvaluate(
            'animal_agent_engine',
            'Animal Expert Multi-Agent System (Agent Engine)',
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
            `Architecture score (${scorecard.architectureScore}/100) is below threshold`
        );

        if (scorecard.specificationScore !== undefined) {
            assert.ok(
                scorecard.specificationScore >= 75,
                `Specification score (${scorecard.specificationScore}/100) is below threshold`
            );
        }

        assert.ok(
            scorecard.securityScore >= 80,
            `Security score (${scorecard.securityScore}/100) is below threshold`
        );

        assert.ok(
            result.isGood,
            `Evaluation failed: ${result.evaluation.explanation}`
        );
    });

    it('should generate valid production code and pass multi-agent evaluation targeting Google Cloud Run', { timeout: 360000 }, async () => {
        assert.ok(fs.existsSync(fixturePath), `Fixture file not found at ${localFixturePath} or ${externalFixturePath}`);

        const result = await runCodegenAndEvaluate(
            'animal_agent_cloudrun',
            'Animal Expert Multi-Agent System (Cloud Run)',
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
            `Architecture score (${scorecard.architectureScore}/100) is below threshold`
        );

        if (scorecard.specificationScore !== undefined) {
            assert.ok(
                scorecard.specificationScore >= 75,
                `Specification score (${scorecard.specificationScore}/100) is below threshold`
            );
        }

        assert.ok(
            scorecard.securityScore >= 80,
            `Security score (${scorecard.securityScore}/100) is below threshold`
        );

        assert.ok(
            result.isGood,
            `Evaluation failed: ${result.evaluation.explanation}`
        );
    });
});
