/**
 * Integration Test Reporter for Visual Agent Designer.
 *
 * Author: Mike Nimer <mikenimer@google.com>
 *
 * Purpose:
 * Records, caches, and formats integration test results into a persistent
 * markdown report (tests/integration/test-report.md) and JSON cache (.test-report.json).
 *
 * Architectural decisions:
 * - Aggregates multi-agent scorecards across test runs so engineers have a clear
 *   dashboard of LLM Code Generator performance.
 * - Highlights Prompt Remediation Directives prominently to guide prompt engineering.
 */

import * as fs from 'fs';
import * as path from 'path';
import { MultiAgentEvaluationResult } from './evaluators/types';
import { GeneratedFileCandidate } from './evaluators/deterministic-gate';

export interface TestRunEntry {
    testName: string;
    pipelineName: string;
    target: string;
    timestamp: string;
    durationMs: number;
    evaluation: MultiAgentEvaluationResult;
    generatedFiles: { filename: string; sizeBytes: number }[];
}

export interface TestSuiteReportData {
    lastUpdated: string;
    runs: Record<string, TestRunEntry>;
}

const REPORT_JSON_PATH = path.join(__dirname, '.test-report.json');
const REPORT_MD_PATH = path.join(__dirname, 'test-report.md');

/**
 * Loads cached report data from .test-report.json.
 */
export function loadReportData(): TestSuiteReportData {
    try {
        if (fs.existsSync(REPORT_JSON_PATH)) {
            const raw = fs.readFileSync(REPORT_JSON_PATH, 'utf-8');
            return JSON.parse(raw);
        }
    } catch {
        // Return fresh structure if file is corrupted
    }
    return {
        lastUpdated: new Date().toISOString(),
        runs: {}
    };
}

/**
 * Saves test run entry to the persistent cache and writes out test-report.md.
 */
export function recordTestRun(
    testKey: string,
    testName: string,
    pipelineName: string,
    target: string,
    durationMs: number,
    evaluation: MultiAgentEvaluationResult,
    files: GeneratedFileCandidate[]
): void {
    const data = loadReportData();
    data.lastUpdated = new Date().toISOString();
    data.runs[testKey] = {
        testName,
        pipelineName,
        target,
        timestamp: new Date().toISOString(),
        durationMs,
        evaluation,
        generatedFiles: files.map(f => ({ filename: f.filename, sizeBytes: Buffer.byteLength(f.content, 'utf-8') }))
    };

    try {
        fs.writeFileSync(REPORT_JSON_PATH, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err: any) {
        console.warn(`[TestReporter] Could not write .test-report.json: ${err.message}`);
    }

    renderMarkdownReport(data);
}

/**
 * Generates test-report.md markdown summary.
 */
export function renderMarkdownReport(data: TestSuiteReportData): void {
    const lines: string[] = [];
    const entries = Object.values(data.runs);

    lines.push('# Visual Agent Designer Integration Test Report');
    lines.push(`\n**Last Updated:** \`${data.lastUpdated}\`  `);
    lines.push(`**Total Test Scenarios:** ${entries.length}\n`);

    // Executive Summary Table
    lines.push('## Executive Summary\n');
    lines.push('| Test Scenario | Deployment Target | Status | Overall | Arch | Spec | Sec | Pkg | Directives | Duration |');
    lines.push('| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |');

    for (const run of entries) {
        const status = run.evaluation.isGood ? '✅ PASS' : '❌ FAIL';
        const sc = run.evaluation.scorecard;
        const specScore = sc.specificationScore !== undefined ? `${sc.specificationScore}` : '-';
        const directiveCount = run.evaluation.promptRemediationDirectives.length;
        const durSec = (run.durationMs / 1000).toFixed(1) + 's';

        lines.push(
            `| **${run.testName}** | \`${run.target}\` | ${status} | **${sc.overallScore}** | ${sc.architectureScore} | ${specScore} | ${sc.securityScore} | ${sc.packagingScore} | ${directiveCount > 0 ? `⚠️ ${directiveCount}` : '0'} | ${durSec} |`
        );
    }

    lines.push('\n---\n');

    // Detailed Breakdown
    lines.push('## Detailed Evaluation Results\n');

    for (const run of entries) {
        const ev = run.evaluation;
        const statusBadge = ev.isGood ? '✅ **PASSED**' : '❌ **FAILED**';

        lines.push(`### ${run.testName} (${run.target})\n`);
        lines.push(`- **Status**: ${statusBadge}`);
        lines.push(`- **Pipeline / Workflow**: \`${run.pipelineName}\``);
        lines.push(`- **Timestamp**: \`${run.timestamp}\``);
        lines.push(`- **Overall Score**: **${ev.scorecard.overallScore}/100**`);
        lines.push(`  - Architecture: **${ev.scorecard.architectureScore}/100**`);
        if (ev.scorecard.specificationScore !== undefined) {
            lines.push(`  - Specification: **${ev.scorecard.specificationScore}/100**`);
        }
        lines.push(`  - Security: **${ev.scorecard.securityScore}/100**`);
        lines.push(`  - Packaging: **${ev.scorecard.packagingScore}/100**`);
        lines.push(`  - Maintainability: **${ev.scorecard.maintainabilityScore}/100**`);

        if (ev.hardVetoTriggered) {
            lines.push('\n> [!CAUTION]');
            lines.push('> **Hard Veto Triggered:**');
            ev.hardVetoReasons.forEach(r => lines.push(`> - ${r}`));
        }

        lines.push(`\n**Executive Synthesis:**\n> ${ev.explanation}\n`);

        if (ev.allFindings.length > 0) {
            lines.push('#### Findings\n');
            lines.push('| Category | Severity | File | Description | Rationale |');
            lines.push('| :--- | :---: | :--- | :--- | :--- |');
            for (const f of ev.allFindings) {
                const icon = f.severity === 'CRITICAL' ? '🔴' : f.severity === 'MAJOR' ? '🟠' : '🟡';
                lines.push(`| \`${f.category}\` | ${icon} ${f.severity} | \`${f.file}\` | ${f.description} | ${f.rationale} |`);
            }
            lines.push('');
        }

        if (ev.promptRemediationDirectives.length > 0) {
            lines.push('#### 💡 Actionable Prompt Remediation Directives\n');
            lines.push('*Update the generator prompt templates in `resource/prompts/` to fix the issues identified:*');
            for (const [idx, dir] of ev.promptRemediationDirectives.entries()) {
                lines.push(`\n**Directive ${idx + 1}**: Target File: \`${dir.targetPromptFile}\` | Section: \`${dir.targetSection}\``);
                lines.push('```markdown');
                lines.push(dir.recommendedRuleText);
                lines.push('```');
                lines.push(`*Rationale*: ${dir.rationale}\n`);
            }
        }

        lines.push('\n---\n');
    }

    try {
        fs.writeFileSync(REPORT_MD_PATH, lines.join('\n'), 'utf-8');
    } catch (err: any) {
        console.warn(`[TestReporter] Could not write test-report.md: ${err.message}`);
    }
}
