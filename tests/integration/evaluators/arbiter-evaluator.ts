/**
 * Lead Arbiter & Synthesizer Evaluator Agent.
 *
 * Author: Mike Nimer <mikenimer@google.com>
 *
 * Purpose:
 * Synthesizes reports from the deterministic pre-flight gate and specialized sub-agents.
 * Produces a multi-dimensional scorecard, checks hard veto rules, and generates
 * actionable Prompt Remediation Directives targeting the prompt template files in
 * `resource/prompts/` whenever an evaluation fails.
 *
 * Architectural decisions:
 * - Does NOT patch the generated code when a test fails. Integration tests validate
 *   the LLM Code Generator itself; therefore, remediation consists of formulating
 *   exact prompt rules to update the prompt templates in resource/prompts/ so the
 *   generator model avoids the defect in subsequent generations.
 * - Enforces hard vetoes on compiler syntax errors, plaintext credential leaks,
 *   or broken multi-agent root wiring.
 */

import { GoogleGenAI } from '@google/genai';
import {
    DeterministicGateResult,
    SpecialistAgentResult,
    EvaluatorFinding,
    MultiAgentEvaluationResult,
    EvaluationScorecard
} from './types';
import { EVALUATOR_MODEL } from './agent-architecture-evaluator';

/**
 * Calculates rule-based baseline scores and vetoes from findings.
 *
 * @param deterministic - Result of the deterministic pre-flight gate.
 * @param subAgentFindings - Consolidated findings from all sub-agents.
 * @returns Scorecard, veto status, and veto reasons.
 */
export function calculateBaselineScorecard(
    deterministic: DeterministicGateResult,
    subAgentFindings: EvaluatorFinding[]
): { scorecard: EvaluationScorecard; hardVetoTriggered: boolean; hardVetoReasons: string[] } {
    let architectureScore = 100;
    let specificationScore = 100;
    let securityScore = 100;
    let packagingScore = 100;
    let maintainabilityScore = 100;

    const hardVetoReasons: string[] = [];

    // Deterministic gate penalties & vetoes
    if (!deterministic.syntaxValid) {
        packagingScore = Math.max(0, packagingScore - 50);
        hardVetoReasons.push(...deterministic.syntaxErrors);
    }

    if (!deterministic.secretScanPassed) {
        securityScore = 0;
        deterministic.secretFindings.forEach(f => {
            hardVetoReasons.push(`Deterministic Secret Leak: ${f.description} (${f.file})`);
        });
    }

    // Sub-agent findings deductions
    for (const f of subAgentFindings) {
        const deduction = f.severity === 'CRITICAL' ? 35 : f.severity === 'MAJOR' ? 15 : 5;

        switch (f.category) {
            case 'ARCHITECTURE':
            case 'IDIOMATIC_ADK':
                architectureScore = Math.max(0, architectureScore - deduction);
                if (f.severity === 'CRITICAL') {
                    hardVetoReasons.push(`Critical Architecture Defect: ${f.description} (${f.file})`);
                }
                break;
            case 'SPECIFICATION':
                specificationScore = Math.max(0, specificationScore - deduction);
                if (f.severity === 'CRITICAL') {
                    hardVetoReasons.push(`Critical Specification Defect: ${f.description} (${f.file})`);
                }
                break;
            case 'SECURITY':
                securityScore = Math.max(0, securityScore - deduction);
                if (f.severity === 'CRITICAL') {
                    hardVetoReasons.push(`Critical Security Defect: ${f.description} (${f.file})`);
                }
                break;
            case 'PACKAGING':
            case 'SYNTAX':
                packagingScore = Math.max(0, packagingScore - deduction);
                if (f.severity === 'CRITICAL') {
                    hardVetoReasons.push(`Critical Packaging Defect: ${f.description} (${f.file})`);
                }
                break;
            default:
                maintainabilityScore = Math.max(0, maintainabilityScore - deduction);
        }
    }

    const overallScore = Math.round(
        architectureScore * 0.35 +
        specificationScore * 0.25 +
        securityScore * 0.20 +
        packagingScore * 0.15 +
        maintainabilityScore * 0.05
    );

    const hardVetoTriggered = hardVetoReasons.length > 0 || overallScore < 80;

    return {
        scorecard: {
            architectureScore,
            specificationScore,
            securityScore,
            packagingScore,
            maintainabilityScore,
            overallScore
        },
        hardVetoTriggered,
        hardVetoReasons
    };
}

/**
 * Runs the Lead Arbiter agent to synthesize the final evaluation and generate
 * prompt remediation directives targeting prompt templates in resource/prompts/.
 */
export async function synthesizeEvaluation(
    ai: GoogleGenAI,
    workflowJson: string,
    deterministic: DeterministicGateResult,
    specialistResults: Record<string, SpecialistAgentResult>,
    codeGenPromptTemplate: string
): Promise<MultiAgentEvaluationResult> {
    const allFindings: EvaluatorFinding[] = [
        ...deterministic.secretFindings,
        ...Object.values(specialistResults).flatMap(r => r.findings)
    ];

    const baseline = calculateBaselineScorecard(deterministic, allFindings);

    const prompt = `You are the Lead Arbiter & Quality Assurance Synthesizer Agent for the Visual Agent Designer Code Generator Integration Test Suite.

Your tasks:
1. Synthesize the reports from the Deterministic Gate and the Specialist Sub-Agents:
   - AgentArchitectureAgent (ADK multi-agent topology, naming constraints, models, GoogleSearchTool bypass_multi_tools_limit)
   - AgentSpecificationAgent (.agent JSON node conformance, system prompts, tools, tester scenarios, deployment target)
   - SecurityAndHardeningAgent (Secret Manager / ADC, container hardening, shell quoting)
   - PackagingAndDeployabilityAgent (requirements.txt, test_agent.py, deployment manifests)
2. Validate findings, filter false positives, and confirm the final evaluation verdict.
3. CRITICAL: When the test fails or exhibits defects, DO NOT patch or rewrite the generated code.
   This integration test tests the LLM Code Generator itself. You must formulate actionable
   **Prompt Remediation Directives** targeting the generator prompt template in \`resource/prompts/\`:
   - Target files: 'resource/prompts/python_adk_agent-engine.prompt.txt' or 'resource/prompts/python_adk_cloudrun.prompt.txt'
   - Specify the exact section and concrete instruction wording to add or modify in the prompt template so that the generator model avoids this error in future generations.

=== INPUT WORKFLOW (.agent JSON) ===
${workflowJson}

=== DETERMINISTIC PRE-FLIGHT RESULTS ===
Syntax Valid: ${deterministic.syntaxValid}
Syntax Errors: ${JSON.stringify(deterministic.syntaxErrors)}
Secret Scan Passed: ${deterministic.secretScanPassed}
Secret Findings: ${JSON.stringify(deterministic.secretFindings)}

=== SPECIALIST SUB-AGENT REPORTS ===
${JSON.stringify(specialistResults, null, 2)}

=== CURRENT CODE GENERATION PROMPT TEMPLATE (EXCERPT) ===
${codeGenPromptTemplate.substring(0, 3000)}
...[truncated]

=== BASELINE SCORES & VETOES ===
Hard Veto Triggered: ${baseline.hardVetoTriggered}
Hard Veto Reasons: ${JSON.stringify(baseline.hardVetoReasons)}
Scorecard: ${JSON.stringify(baseline.scorecard)}

Provide your synthesis in JSON.`;

    const schema = {
        type: "object",
        properties: {
            isGood: {
                type: "boolean",
                description: "Final verdict: true only if code satisfies all requirements and has no critical defects"
            },
            explanation: {
                type: "string",
                description: "Executive synthesis summarizing why the test passed or failed"
            },
            promptRemediationDirectives: {
                type: "array",
                description: "Actionable directives to update the prompt template files in resource/prompts/ to prevent repeated failures",
                items: {
                    type: "object",
                    properties: {
                        targetPromptFile: {
                            type: "string",
                            description: "The prompt file to modify (e.g. resource/prompts/python_adk_agent-engine.prompt.txt)"
                        },
                        targetSection: {
                            type: "string",
                            description: "The prompt section to modify (e.g. Agent Class Contracts, Tool Rules, Model Constraints)"
                        },
                        recommendedRuleText: {
                            type: "string",
                            description: "Exact rule text or constraint to add to the prompt"
                        },
                        rationale: {
                            type: "string",
                            description: "Why this prompt adjustment will prevent the generator from repeating the mistake"
                        }
                    },
                    required: ["targetPromptFile", "targetSection", "recommendedRuleText", "rationale"]
                }
            }
        },
        required: ["isGood", "explanation", "promptRemediationDirectives"]
    };

    const response = await ai.models.generateContent({
        model: EVALUATOR_MODEL,
        contents: prompt,
        config: {
            responseMimeType: 'application/json',
            responseSchema: schema
        }
    });

    if (!response.text) {
        throw new Error('Empty response from Lead Arbiter Agent');
    }

    const parsed = JSON.parse(response.text);

    // Hard veto overrides model leniency
    const finalIsGood = !baseline.hardVetoTriggered && parsed.isGood;

    return {
        isGood: finalIsGood,
        scorecard: baseline.scorecard,
        hardVetoTriggered: baseline.hardVetoTriggered,
        hardVetoReasons: baseline.hardVetoReasons,
        allFindings,
        specialistResults,
        promptRemediationDirectives: parsed.promptRemediationDirectives || [],
        explanation: parsed.explanation
    };
}
