/**
 * Lead Arbiter & Synthesizer Evaluator Agent.
 *
 * Author: Mike Nimer <mikenimer@google.com>
 *
 * Purpose:
 * Synthesizes reports from the deterministic pre-flight gate and specialist sub-agents.
 * Audits evidence against actual source code to dismiss false positives, produces
 * a verified multi-dimensional scorecard, and generates actionable Prompt Remediation
 * Directives targeting the code generation skills in `resource/codegen-skills/`.
 *
 * Architectural decisions:
 * - Solves the False-Positive Veto Trap: Sub-agents may emit false-positive findings
 *   (e.g. hallucinating missing root_agent). The Lead Arbiter inspects line-numbered
 *   code, accepts or dismisses findings (`dismissedFindingIds`), and recalculates
 *   the final baseline scorecard using ONLY confirmed findings.
 * - Eliminates Prompt Truncation: Full prompt template is provided in context so
 *   Prompt Remediation Directives can accurately cite valid section names and rules.
 * - Strict DRY: Deduplicates overlapping findings across specialist domains.
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
import { GeneratedFileCandidate, formatFilesWithLineNumbers } from './deterministic-gate';

/**
 * Deduplicates overlapping findings across multiple specialist agents.
 *
 * @param findings - Array of raw evaluator findings.
 * @returns Deduplicated findings list.
 */
export function deduplicateFindings(findings: EvaluatorFinding[]): EvaluatorFinding[] {
    const seen = new Set<string>();
    const deduplicated: EvaluatorFinding[] = [];

    for (const f of findings) {
        // Create canonical fingerprint based on file, category, and simplified description
        const simpleDesc = f.description.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 40);
        const fingerprint = `${f.file}:${f.category}:${simpleDesc}`;

        if (!seen.has(fingerprint)) {
            seen.add(fingerprint);
            deduplicated.push(f);
        }
    }

    return deduplicated;
}

/**
 * Calculates rule-based baseline scores and vetoes from findings.
 *
 * @param deterministic - Result of the deterministic pre-flight gate.
 * @param subAgentFindings - Consolidated findings from sub-agents.
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

    // 1. Deterministic gate penalties & vetoes
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

    if (deterministic.astCheckPassed === false && deterministic.astFindings) {
        for (const astFinding of deterministic.astFindings) {
            if (astFinding.severity === 'CRITICAL') {
                architectureScore = Math.max(0, architectureScore - 35);
                hardVetoReasons.push(`Deterministic AST Defect: ${astFinding.description} (${astFinding.file})`);
            } else {
                architectureScore = Math.max(0, architectureScore - 15);
            }
        }
    }

    // 2. Sub-agent findings deductions (deduplicated)
    const uniqueFindings = deduplicateFindings(subAgentFindings);

    for (const f of uniqueFindings) {
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
 * Runs the Lead Arbiter agent to synthesize the final evaluation, audit false positives,
 * and formulate actionable Prompt Remediation Directives for generator prompt templates.
 *
 * @param ai - Initialized GoogleGenAI client.
 * @param workflowJson - Original .agent workflow JSON document string.
 * @param deterministic - Result of the deterministic pre-flight gate.
 * @param specialistResults - Reports from all specialist sub-agents.
 * @param codeGenPromptTemplate - Unabridged prompt template used for generation.
 * @param files - All generated files (for ground-truth evidence verification).
 * @returns Reconciled evaluation result with verified scorecard and remediation directives.
 */
export async function synthesizeEvaluation(
    ai: GoogleGenAI,
    workflowJson: string,
    deterministic: DeterministicGateResult,
    specialistResults: Record<string, SpecialistAgentResult>,
    codeGenPromptTemplate: string,
    files?: GeneratedFileCandidate[]
): Promise<MultiAgentEvaluationResult> {
    const rawFindings: EvaluatorFinding[] = [
        ...deterministic.secretFindings,
        ...(deterministic.astFindings || []),
        ...Object.values(specialistResults).flatMap(r => r.findings)
    ];

    const initialBaseline = calculateBaselineScorecard(deterministic, rawFindings);

    const formattedFiles = files && files.length > 0
        ? formatFilesWithLineNumbers(files)
        : '(Files not supplied directly to Arbiter)';

    const prompt = `You are the Lead Arbiter & Quality Assurance Synthesizer Agent for the Visual Agent Designer Code Generator Integration Test Suite.

Your tasks:
1. Synthesize the reports from the Deterministic Gate and the Specialist Sub-Agents:
   - AgentArchitectureAgent (ADK multi-agent topology, naming constraints, models, GoogleSearchTool bypass_multi_tools_limit)
   - AgentSpecificationAgent (.agent JSON node conformance, Pydantic models, tools, tester scenarios, deployment target)
   - SecurityAndHardeningAgent (Secret Manager / ADC, BigQuery SQL parameterization, HITL approval gates, container hardening)
   - PackagingAndDeployabilityAgent (requirements.txt, test_agent.py, offline CI mocking, deployment manifests)
2. Ground-Truth Verification:
   - Check the reported findings against the GENERATED SOURCE FILES below.
   - If a specialist sub-agent hallucinated an issue (e.g. reported root_agent missing when it is clearly defined in agent.py), mark its finding ID in \`dismissedFindingIds\` and explain why it is a false positive.
   - **MANDATORY FALSE-POSITIVE DISMISSALS**: Always add a finding ID to \`dismissedFindingIds\` if the finding complains about:
     a) Differences between modern Gemini model versions (e.g., code using \`gemini-3.8-flash\` when the \`.agent\` JSON specifies \`gemini-3.7-flash\` or vice versa). Model versions evolve continuously and MUST NEVER be a failure or deduction in any test.
     b) Omitting \`max_iterations\` on standard ADK \`Agent(...)\` or \`BaseAgent\` subclasses (only \`LoopAgent\` accepts \`max_iterations\` in Google ADK).
     c) Omitting \`output_schema\` on an \`Agent(...)\` that has \`tools=[...]\` attached (Vertex AI Gemini forbids combining \`tools\` with \`output_schema\` on the same agent; defining the Pydantic model in \`agent.py\` and writing to \`output_key\` is the required ADK pattern).
     d) Generating \`Dockerfile\` and \`.dockerignore\` on container targets (\`agent_engine\`, \`cloudrun\`) when \`includeDocker=false\` in the JSON, or using standard \`FROM python:3.11-slim\` tags without a SHA256 digest.
3. Formulate Actionable Prompt Remediation Directives:
   - When confirmed defects exist, DO NOT patch the generated code. Formulate exact prompt rules targeting the prompt template file:
   - Target files: the relevant skill under 'resource/codegen-skills/<topic>/SKILL.md' (e.g. 'resource/codegen-skills/target-agent-engine/SKILL.md', 'resource/codegen-skills/adk-tools/SKILL.md')
   - Specify the exact section and concrete instruction wording so the generator avoids this defect in future generations.

=== INPUT WORKFLOW (.agent JSON) ===
${workflowJson}

=== DETERMINISTIC PRE-FLIGHT RESULTS ===
Syntax Valid: ${deterministic.syntaxValid}
Syntax Errors: ${JSON.stringify(deterministic.syntaxErrors)}
Secret Scan Passed: ${deterministic.secretScanPassed}
Secret Findings: ${JSON.stringify(deterministic.secretFindings)}
AST Check Passed: ${deterministic.astCheckPassed !== false}
AST Findings: ${JSON.stringify(deterministic.astFindings || [])}

=== SPECIALIST SUB-AGENT REPORTS ===
${JSON.stringify(specialistResults, null, 2)}

=== GENERATED SOURCE FILES & ARTIFACTS (FOR VERIFICATION) ===
${formattedFiles}

=== CURRENT CODE GENERATION PROMPT TEMPLATE ===
${codeGenPromptTemplate}

=== INITIAL BASELINE SCORES & VETOES ===
Initial Hard Veto: ${initialBaseline.hardVetoTriggered}
Initial Veto Reasons: ${JSON.stringify(initialBaseline.hardVetoReasons)}
Initial Scorecard: ${JSON.stringify(initialBaseline.scorecard)}

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
            dismissedFindingIds: {
                type: "array",
                description: "Array of finding IDs from specialists that were audited and confirmed to be FALSE POSITIVES",
                items: { type: "string" }
            },
            dismissalReasons: {
                type: "array",
                description: "Explanations for why specific findings were dismissed as false positives",
                items: {
                    type: "object",
                    properties: {
                        findingId: { type: "string" },
                        reason: { type: "string" }
                    },
                    required: ["findingId", "reason"]
                }
            },
            promptRemediationDirectives: {
                type: "array",
                description: "Actionable directives to update code generation skills in resource/codegen-skills/ to prevent repeated failures",
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
            temperature: 0.1,
            responseMimeType: 'application/json',
            responseSchema: schema
        }
    });

    if (!response.text) {
        throw new Error('Empty response from Lead Arbiter Agent');
    }

    const parsed = JSON.parse(response.text);

    // Reconcile false positives: filter out dismissed findings before final scoring
    const dismissedIds = new Set<string>(parsed.dismissedFindingIds || []);
    const confirmedFindings = rawFindings.filter(f => !dismissedIds.has(f.id));

    // Recalculate true baseline using confirmed findings only
    const reconciledBaseline = calculateBaselineScorecard(deterministic, confirmedFindings);

    const dismissalMap: Record<string, string> = {};
    if (Array.isArray(parsed.dismissalReasons)) {
        for (const dr of parsed.dismissalReasons) {
            if (dr.findingId) {
                dismissalMap[dr.findingId] = dr.reason;
            }
        }
    }

    // Hard veto overrides model leniency
    const finalIsGood = !reconciledBaseline.hardVetoTriggered && parsed.isGood;

    return {
        isGood: finalIsGood,
        scorecard: reconciledBaseline.scorecard,
        hardVetoTriggered: reconciledBaseline.hardVetoTriggered,
        hardVetoReasons: reconciledBaseline.hardVetoReasons,
        allFindings: rawFindings,
        confirmedFindings,
        dismissedFindingIds: Array.from(dismissedIds),
        dismissalReasons: dismissalMap,
        specialistResults,
        promptRemediationDirectives: parsed.promptRemediationDirectives || [],
        explanation: parsed.explanation
    };
}
