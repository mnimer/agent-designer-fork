/**
 * Integration Test: Strategic Policy Multi-Agent Debate (Pro/Con Debaters + Search + Arbiter Consensus)
 *
 * Author: Mike Nimer <mikenimer@google.com>
 *
 * Purpose:
 * Validates end-to-end code generation and multi-agent evaluation for the
 * `policy_debate.agent` workflow across both supported deployment targets:
 * 1. Google Vertex AI Agent Engine (`python_adk_agent-engine.prompt.txt`)
 * 2. Google Cloud Run (`python_adk_cloudrun.prompt.txt`)
 *
 * Workflow Topology:
 * - Moderator & Arbiter Node: `agent_debate_arbiter` (`debate_moderator_arbiter`) moderating structured
 *   debate rounds (up to 3 rounds) between Pro and Con advocates, evaluating empirical evidence citations,
 *   and scoring consensus convergence against the 0.85 threshold (`debateConfig`).
 * - Debater Nodes:
 *   * Pro Advocate: `agent_pro_advocate` (`pro_policy_advocate`) formulating affirmative arguments backed
 *     by Google Search grounding with `bypass_multi_tools_limit=True`, writing to state key `pro_arguments`.
 *   * Con Advocate: `agent_con_advocate` (`con_policy_advocate`) formulating counter-evidence and fiscal risk
 *     arguments backed by Google Search grounding with `bypass_multi_tools_limit=True`, writing to state key `con_arguments`.
 * - Consensus Resolution Node: `agent_consensus_resolution` (`consensus_resolution_synthesizer`, `agentKind === 'synthesizer'`)
 *   producing a final evidence-backed policy resolution from both arguments.
 * - Memory: In-memory session store (`InMemorySessionStore`).
 * - Triggers: Interactive Chat Trigger (`trigger_chat_debate`) and Test Suite Trigger (`trigger_tester_debate`).
 */

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import * as path from 'path';
import * as fs from 'fs';
import { runCodegenAndEvaluate } from './codegen-runner';

describe('Strategic Policy Multi-Agent Debate Integration Tests (Google ADK)', { timeout: 1500000 }, () => {
    const fixturePath = path.join(__dirname, 'policy_debate.agent');

    it('should generate valid production code and pass multi-agent evaluation targeting Vertex Agent Engine', { timeout: 600000 }, async () => {
        assert.ok(fs.existsSync(fixturePath), `Fixture file not found at ${fixturePath}`);

        const result = await runCodegenAndEvaluate(
            'policy_debate_agent_engine',
            'Strategic Policy Multi-Agent Debate (Agent Engine)',
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
            'policy_debate_cloudrun',
            'Strategic Policy Multi-Agent Debate (Cloud Run)',
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
