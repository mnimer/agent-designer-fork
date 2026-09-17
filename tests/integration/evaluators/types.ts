/**
 * Type definitions and contracts for the Multi-Agent Code Evaluation Harness.
 *
 * Author: Mike Nimer <mikenimer@google.com>
 *
 * Purpose:
 * Defines domain models, sub-agent result structures, scoring rubrics, and
 * prompt remediation guidance types used during integration testing of the
 * AI Agent code generation pipeline.
 *
 * Architectural decisions:
 * - Sub-agents output structured findings with severity levels: 'CRITICAL' (hard veto),
 *   'MAJOR' (potential bug, missing property, or anti-pattern), and 'MINOR' (stylistic/cosmetic).
 * - The Lead Arbiter calculates category-specific rubric scores (0-100) and produces
 *   actionable Prompt Remediation Directives targeting the generator prompt templates
 *   (e.g., resource/prompts/python_adk_agent-engine.prompt.txt) rather than modifying
 *   the test code directly.
 */

export type FindingSeverity = 'CRITICAL' | 'MAJOR' | 'MINOR';

export interface EvaluatorFinding {
    id: string;
    category: 'ARCHITECTURE' | 'SECURITY' | 'PACKAGING' | 'SYNTAX' | 'IDIOMATIC_ADK' | 'SPECIFICATION';
    severity: FindingSeverity;
    file: string;
    description: string;
    rationale: string;
}

export interface SpecialistAgentResult {
    agentName: string;
    passed: boolean;
    findings: EvaluatorFinding[];
    summary: string;
}

export interface DeterministicGateResult {
    syntaxValid: boolean;
    syntaxErrors: string[];
    secretScanPassed: boolean;
    secretFindings: EvaluatorFinding[];
}

export interface PromptRemediationDirective {
    targetPromptFile: string;
    targetSection: string;
    recommendedRuleText: string;
    rationale: string;
}

export interface EvaluationScorecard {
    architectureScore: number;    // 0-100
    specificationScore?: number;  // 0-100 (.agent JSON specification & node/trigger conformance)
    securityScore: number;        // 0-100
    packagingScore: number;       // 0-100
    maintainabilityScore: number; // 0-100
    overallScore: number;         // 0-100
}

export interface MultiAgentEvaluationResult {
    isGood: boolean;
    scorecard: EvaluationScorecard;
    hardVetoTriggered: boolean;
    hardVetoReasons: string[];
    allFindings: EvaluatorFinding[];
    specialistResults: Record<string, SpecialistAgentResult>;
    promptRemediationDirectives: PromptRemediationDirective[];
    explanation: string;
}
