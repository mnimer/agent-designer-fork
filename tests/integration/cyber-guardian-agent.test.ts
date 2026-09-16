/**
 * Integration Test: CyberGuardian SecOps Multi-Agent System
 *
 * Author: Mike Nimer <mikenimer@google.com>
 *
 * Purpose:
 * Validates end-to-end code generation and multi-agent evaluation for the
 * `cyber_guardian.agent` workflow across both supported deployment targets:
 * 1. Google Vertex AI Agent Engine (`python_adk_agent-engine.prompt.txt`)
 * 2. Google Cloud Run (`python_adk_cloudrun.prompt.txt`)
 *
 * Workflow Topology:
 * - Root agent: `SecOps Coordinator` (coordinator / sequential pattern)
 * - Specialized Sub-Agents:
 *   * `TriageSpecialist`: Analyzes alerts, calculates severity, extracts IOCs
 *   * `ForensicsAnalyst`: Performs endpoint artifact inspection, memory analysis, log timeline reconstruction
 *   * `ThreatIntelSpecialist`: Queries threat feeds, enriches IP/hash IOCs with MITRE ATT&CK mapping
 *   * `RemediationSpecialist`: Generates containment playbooks and patch recommendations
 * - Triggers: Eventarc Trigger (`FindingNotification` on `securitycenter.googleapis.com`) with EDR & Cloud SIEM test scenarios
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

describe('CyberGuardian SecOps Integration Tests (Google ADK)', { timeout: 720000 }, () => {
    const localFixturePath = path.join(__dirname, 'cyber_guardian.agent');
    const externalFixturePath = '/Users/mikenimer/Development/projects/visual-agent-designer-pipelines/agents/samples/cyber_guardian.agent';
    const fixturePath = fs.existsSync(localFixturePath) ? localFixturePath : externalFixturePath;

    it('should generate valid production code and pass multi-agent evaluation targeting Vertex Agent Engine', { timeout: 360000 }, async () => {
        assert.ok(fs.existsSync(fixturePath), `Fixture file not found at ${localFixturePath} or ${externalFixturePath}`);

        const result = await runCodegenAndEvaluate(
            'cyber_guardian_agent_engine',
            'CyberGuardian SecOps Multi-Agent System (Agent Engine)',
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
            'cyber_guardian_cloudrun',
            'CyberGuardian SecOps Multi-Agent System (Cloud Run)',
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
