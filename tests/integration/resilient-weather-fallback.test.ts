/**
 * Integration Test: Resilient Weather & Outage Fallback (Circuit Breaker + Memorystore Redis + Cron)
 *
 * Author: Mike Nimer <mikenimer@google.com>
 *
 * Purpose:
 * Validates end-to-end code generation and multi-agent evaluation for the
 * `resilient_weather_fallback.agent` workflow across both supported deployment targets:
 * 1. Google Vertex AI Agent Engine (`python_adk_agent-engine.prompt.txt`)
 * 2. Google Cloud Run (`python_adk_cloudrun.prompt.txt`)
 *
 * Workflow Topology:
 * - Root agent: `weather_circuit_breaker` (`agentKind === 'fallback'`) with retry & exponential backoff
 *   intercepting errors (`RESOURCE_EXHAUSTED`, `503`, `DEADLINE_EXCEEDED`, `QUOTA_EXCEEDED`, `UNAVAILABLE`)
 *   and failing over from:
 *   * Primary: `live_weather_agent` (Weather Telemetry REST API tool)
 *   * Fallback: `cached_radar_archive` (Vertex AI Search over climatology archive)
 *   * Graceful static degradation message if all upstream services are unavailable
 * - Memory: Cloud Memorystore Redis checkpointer (`RedisSessionStore` with TTL management)
 * - Triggers: 6-hour Cron Trigger, streaming Chat Trigger with Redis memory, and Test Suite with primary and failover scenarios
 */

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import * as path from 'path';
import * as fs from 'fs';
import { runCodegenAndEvaluate } from './codegen-runner';

describe('Resilient Weather Fallback Integration Tests (Google ADK)', { timeout: 1200000 }, () => {
    const fixturePath = path.join(__dirname, 'resilient_weather_fallback.agent');

    it('should generate valid production code and pass multi-agent evaluation targeting Vertex Agent Engine', { timeout: 480000 }, async () => {
        assert.ok(fs.existsSync(fixturePath), `Fixture file not found at ${fixturePath}`);

        const result = await runCodegenAndEvaluate(
            'resilient_weather_fallback_agent_engine',
            'Resilient Weather & Outage Fallback (Agent Engine)',
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

    it('should generate valid production code and pass multi-agent evaluation targeting Google Cloud Run', { timeout: 480000 }, async () => {
        assert.ok(fs.existsSync(fixturePath), `Fixture file not found at ${fixturePath}`);

        const result = await runCodegenAndEvaluate(
            'resilient_weather_fallback_cloudrun',
            'Resilient Weather & Outage Fallback (Cloud Run)',
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
