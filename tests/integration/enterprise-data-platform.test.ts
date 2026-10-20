/**
 * Integration Test: Enterprise Data Platform Agent-as-a-Tool (BigQuery Remote MCP + Cloud Spanner)
 *
 * Author: Mike Nimer <mikenimer@google.com>
 *
 * Purpose:
 * Validates end-to-end code generation and multi-agent evaluation for the
 * `enterprise_data_platform.agent` workflow across both supported deployment targets:
 * 1. Google Vertex AI Agent Engine (`python_adk_agent-engine.prompt.txt`)
 * 2. Google Cloud Run (`python_adk_cloudrun.prompt.txt`)
 *
 * Workflow Topology:
 * - Root agent: `executive_data_analyst` (`agent_executive_analyst`) with thinkingBudget=4096 tokens,
 *   discovering schema via BigQuery Remote MCP Server (`McpToolset` / `StreamableHTTPConnectionParams`)
 *   and delegating to `generate_sql_query` Agent-as-a-Tool wrapper.
 * - Subagent Tool: `nl2sql_expert_agent` (`agent_nl2sql_expert`) generating partitioned and clustered
 *   BigQuery Standard SQL.
 * - Memory: Google Cloud Spanner enterprise checkpointer (`SpannerSessionStore` with auto-DDL).
 * - Triggers: Eventarc Trigger (`trigger_eventarc_data`), Chat Trigger (`trigger_chat_data`),
 *   and Test Suite Trigger (`trigger_tester_data`).
 */

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import * as path from 'path';
import * as fs from 'fs';
import { runCodegenAndEvaluate } from './codegen-runner';

describe('Enterprise Data Platform Agent-as-a-Tool Integration Tests (Google ADK)', { timeout: 1500000 }, () => {
    const fixturePath = path.join(__dirname, 'enterprise_data_platform.agent');

    it('should generate valid production code and pass multi-agent evaluation targeting Vertex Agent Engine', { timeout: 600000 }, async () => {
        assert.ok(fs.existsSync(fixturePath), `Fixture file not found at ${fixturePath}`);

        const result = await runCodegenAndEvaluate(
            'enterprise_data_platform_agent_engine',
            'Enterprise Data Platform Agent-as-a-Tool (Agent Engine)',
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
            'enterprise_data_platform_cloudrun',
            'Enterprise Data Platform Agent-as-a-Tool (Cloud Run)',
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
