/**
 * Multi-Agent Evaluation Orchestrator for Visual Agent Designer.
 *
 * Author: Mike Nimer <mikenimer@google.com>
 *
 * Purpose:
 * Coordinates the full end-to-end evaluation lifecycle for AI Agent codebases:
 * 1. Runs the Deterministic Pre-Flight Gate (syntax compilation + AST + secret scan).
 * 2. Concurrently invokes 4 specialized sub-agents with rate-limit pacing and exponential backoff:
 *    - AgentArchitectureAgent (gemini-3.8-flash)
 *    - AgentSpecificationAgent (gemini-3.8-flash, 100% RTM checklist)
 *    - SecurityAndHardeningAgent (gemini-3.8-flash-cyber with Fairwind fallback)
 *    - PackagingAndDeployabilityAgent (gemini-3.8-flash)
 * 3. Dispatches results to the Lead Arbiter Agent for ground-truth verification against code,
 *    false-positive dismissal, verified scorecard synthesis, and automated Prompt Remediation
 *    Directives for generator prompt templates.
 *
 * Architectural decisions:
 * - Solves Sub-Agent Catch Corruption: Infrastructure/transport errors rethrow cleanly
 *   instead of fabricating fake code quality findings that unfairly dock scorecard points.
 * - Passes full workflowJson and line-numbered files to all evaluator sub-agents.
 */

import { GoogleGenAI } from '@google/genai';
import { GeneratedFileCandidate, runDeterministicGate } from './deterministic-gate';
import { evaluateAgentArchitecture } from './agent-architecture-evaluator';
import { evaluateAgentSpecification } from './agent-spec-evaluator';
import { evaluateSecurityAndHardening } from './security-evaluator';
import { evaluatePackagingAndDeployability } from './packaging-evaluator';
import { synthesizeEvaluation } from './arbiter-evaluator';
import { MultiAgentEvaluationResult, SpecialistAgentResult } from './types';

/**
 * Retries an asynchronous generator call on 429 rate limit or network glitch.
 */
export async function withRetry<T>(fn: () => Promise<T>, agentName: string, maxRetries = 3, initialDelayMs = 2500): Promise<T> {
    let delay = initialDelayMs;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (err: any) {
            const msg = String(err?.message || err);
            const isRetryable = msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('fetch failed') || msg.includes('503');
            if (isRetryable && attempt < maxRetries) {
                console.warn(`   [${agentName}] ⚠️ Encountered retryable error (${msg.substring(0, 60)}...). Backing off ${delay}ms (attempt ${attempt}/${maxRetries})...`);
                await new Promise(r => setTimeout(r, delay));
                delay *= 2;
            } else {
                throw err;
            }
        }
    }
    throw new Error(`${agentName} failed after ${maxRetries} retries`);
}

/**
 * Runs the comprehensive multi-agent code evaluation harness.
 *
 * @param ai - Initialized GoogleGenAI client.
 * @param workflowJson - Original .agent workflow JSON document.
 * @param codeGenPrompt - Full prompt template string used for generation.
 * @param files - All generated files.
 * @returns Complete evaluation result with scorecard and prompt recommendations.
 */
export async function runMultiAgentEvaluation(
    ai: GoogleGenAI,
    workflowJson: string,
    codeGenPrompt: string,
    files: GeneratedFileCandidate[]
): Promise<MultiAgentEvaluationResult> {
    console.log(`   [MultiAgentEvaluator] 1. Running Deterministic Pre-flight Gate...`);
    const deterministic = await runDeterministicGate(files, 'python');
    if (!deterministic.syntaxValid) {
        console.warn(`   [DeterministicGate] ⚠️ Syntax errors detected:`, deterministic.syntaxErrors);
    }
    if (!deterministic.secretScanPassed) {
        console.warn(`   [DeterministicGate] ⚠️ Secret scan failed with ${deterministic.secretFindings.length} issues`);
    }
    if (deterministic.astCheckPassed === false) {
        console.warn(`   [DeterministicGate] ⚠️ AST inspection detected issues:`, deterministic.astFindings);
    }

    console.log(`   [MultiAgentEvaluator] 2. Spawning Specialist Sub-Agents (Batch 1: Architecture & Specification)...`);
    const [agentArch, agentSpec] = await Promise.all([
        withRetry(() => evaluateAgentArchitecture(ai, workflowJson, files), 'AgentArchitectureAgent'),
        withRetry(() => evaluateAgentSpecification(ai, workflowJson, files), 'AgentSpecificationAgent')
    ]);

    // Brief cooldown between evaluation batches to avoid rate limit throttling
    await new Promise(r => setTimeout(r, 1000));

    console.log(`   [MultiAgentEvaluator] 3. Spawning Specialist Sub-Agents (Batch 2: Security & Packaging)...`);
    const [security, packaging] = await Promise.all([
        withRetry(() => evaluateSecurityAndHardening(ai, workflowJson, files), 'SecurityAndHardeningAgent'),
        withRetry(() => evaluatePackagingAndDeployability(ai, workflowJson, files), 'PackagingAndDeployabilityAgent')
    ]);

    const specialistResults: Record<string, SpecialistAgentResult> = {
        AgentArchitectureAgent: agentArch,
        AgentSpecificationAgent: agentSpec,
        SecurityAndHardeningAgent: security,
        PackagingAndDeployabilityAgent: packaging
    };

    console.log(`   [MultiAgentEvaluator] 4. Running Lead Arbiter & Synthesizer Agent...`);
    const result = await withRetry(
        () => synthesizeEvaluation(ai, workflowJson, deterministic, specialistResults, codeGenPrompt, files),
        'LeadArbiterAgent'
    );

    return result;
}

/**
 * Formats a MultiAgentEvaluationResult into a readable terminal/log string.
 *
 * @param result - The evaluation result.
 * @param framework - Target framework.
 * @returns Human-readable formatted report.
 */
export function formatEvaluationReport(result: MultiAgentEvaluationResult, framework: string = 'Google ADK'): string {
    const lines: string[] = [];

    lines.push(`\n======================================================`);
    lines.push(`📊 EVALUATION SCORECARD (${framework})`);
    lines.push(`======================================================`);
    lines.push(`   Status:       ${result.isGood ? '✅ PASSED' : '❌ FAILED'}`);
    lines.push(`   Overall:      ${result.scorecard.overallScore} / 100`);
    lines.push(`   Architecture: ${result.scorecard.architectureScore} / 100`);
    if (result.scorecard.specificationScore !== undefined) {
        lines.push(`   Specification:${result.scorecard.specificationScore} / 100`);
    }
    lines.push(`   Security:     ${result.scorecard.securityScore} / 100`);
    lines.push(`   Packaging:    ${result.scorecard.packagingScore} / 100`);
    lines.push(`   Maintainability: ${result.scorecard.maintainabilityScore} / 100`);

    if (result.hardVetoTriggered) {
        lines.push(`\n🚨 HARD VETO TRIGGERED:`);
        result.hardVetoReasons.forEach(r => lines.push(`   - ${r}`));
    }

    lines.push(`\n📝 Executive Explanation:`);
    lines.push(`   ${result.explanation}`);

    if (result.dismissedFindingIds && result.dismissedFindingIds.length > 0) {
        lines.push(`\n🛡️ Dismissed False-Positive Findings (${result.dismissedFindingIds.length}):`);
        result.dismissedFindingIds.forEach(id => {
            const reason = result.dismissalReasons?.[id] || 'Verified as false positive against actual source code';
            lines.push(`   - [${id}]: ${reason}`);
        });
    }

    const activeFindings = result.confirmedFindings || result.allFindings;
    if (activeFindings.length > 0) {
        lines.push(`\n🔍 Confirmed Findings (${activeFindings.length}):`);
        activeFindings.forEach((f, idx) => {
            const icon = f.severity === 'CRITICAL' ? '🔴' : f.severity === 'MAJOR' ? '🟠' : '🟡';
            const lineInfo = f.lineNumber ? ` line ${f.lineNumber}` : '';
            lines.push(`   ${idx + 1}. [${f.category}] ${icon} ${f.severity}: ${f.description} (${f.file}${lineInfo})`);
            if (f.evidence && f.evidence !== 'OMITTED') {
                lines.push(`      Evidence: ${f.evidence.substring(0, 100)}...`);
            }
            lines.push(`      Rationale: ${f.rationale}`);
        });
    }

    if (result.promptRemediationDirectives.length > 0) {
        lines.push(`\n💡 PROMPT REMEDIATION DIRECTIVES (Targeting Generator Prompts):`);
        lines.push(`   NOTE: Integration tests test the generator prompts. Do not patch test code.`);
        lines.push(`   Update the corresponding prompt file(s) with these directives:`);
        result.promptRemediationDirectives.forEach((dir, idx) => {
            lines.push(`\n   --- Directive #${idx + 1} for ${dir.targetPromptFile} ---`);
            lines.push(`   Target Section: ${dir.targetSection}`);
            lines.push(`   Recommended Rule:`);
            lines.push(`   ${dir.recommendedRuleText.split('\n').map(l => '     ' + l).join('\n')}`);
            lines.push(`   Rationale: ${dir.rationale}`);
        });
    }

    lines.push(`======================================================\n`);
    return lines.join('\n');
}
