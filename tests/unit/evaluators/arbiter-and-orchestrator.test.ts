/**
 * Unit Tests for Lead Arbiter Evaluator and Multi-Agent Orchestrator.
 *
 * Author: Mike Nimer <mikenimer@google.com>
 *
 * Purpose:
 * Validates the Lead Arbiter synthesis, deduplication, false-positive veto reconciliation,
 * retry backoff logic, and report formatting:
 * - Deduplication of findings across specialists
 * - Baseline scorecard and weighted formula calculation
 * - Lead Arbiter false-positive dismissal and veto resolution
 * - Retry logic for rate limiting (429) and transient errors
 * - Terminal report formatting
 */

import { describe, it, expect, vi } from 'vitest';
import {
    deduplicateFindings,
    calculateBaselineScorecard,
    synthesizeEvaluation
} from '../../../tests/integration/evaluators/arbiter-evaluator';
import {
    withRetry,
    formatEvaluationReport
} from '../../../tests/integration/evaluators/multi-agent-evaluator';
import {
    DeterministicGateResult,
    EvaluatorFinding,
    SpecialistAgentResult,
    MultiAgentEvaluationResult
} from '../../../tests/integration/evaluators/types';
import { GeneratedFileCandidate } from '../../../tests/integration/evaluators/deterministic-gate';

describe('Lead Arbiter and Multi-Agent Orchestrator', () => {
    describe('deduplicateFindings', () => {
        it('should merge duplicate findings with the same file, category, and description', () => {
            const findings: EvaluatorFinding[] = [
                {
                    id: 'F1',
                    category: 'ARCHITECTURE',
                    severity: 'MAJOR',
                    file: 'agent.py',
                    description: 'Missing error handler in agent execution',
                    rationale: 'Reason 1'
                },
                {
                    id: 'F2',
                    category: 'ARCHITECTURE',
                    severity: 'MAJOR',
                    file: 'agent.py',
                    description: 'Missing error handler in agent execution!',
                    rationale: 'Reason 2'
                }
            ];

            const deduplicated = deduplicateFindings(findings);
            expect(deduplicated.length).toBe(1);
            expect(deduplicated[0].id).toBe('F1');
        });

        it('should retain distinct findings across different files or categories', () => {
            const findings: EvaluatorFinding[] = [
                {
                    id: 'F1',
                    category: 'ARCHITECTURE',
                    severity: 'MAJOR',
                    file: 'agent.py',
                    description: 'Issue A',
                    rationale: 'R1'
                },
                {
                    id: 'F2',
                    category: 'SECURITY',
                    severity: 'MAJOR',
                    file: 'agent.py',
                    description: 'Issue A',
                    rationale: 'R2'
                },
                {
                    id: 'F3',
                    category: 'ARCHITECTURE',
                    severity: 'MAJOR',
                    file: 'server.py',
                    description: 'Issue A',
                    rationale: 'R3'
                }
            ];

            const deduplicated = deduplicateFindings(findings);
            expect(deduplicated.length).toBe(3);
        });
    });

    describe('calculateBaselineScorecard', () => {
        const cleanDeterministic: DeterministicGateResult = {
            syntaxValid: true,
            syntaxErrors: [],
            secretScanPassed: true,
            secretFindings: [],
            astCheckPassed: true,
            astFindings: []
        };

        it('should award 100 across all categories when there are no findings', () => {
            const result = calculateBaselineScorecard(cleanDeterministic, []);
            expect(result.scorecard.overallScore).toBe(100);
            expect(result.scorecard.architectureScore).toBe(100);
            expect(result.scorecard.securityScore).toBe(100);
            expect(result.scorecard.packagingScore).toBe(100);
            expect(result.scorecard.specificationScore).toBe(100);
            expect(result.scorecard.maintainabilityScore).toBe(100);
            expect(result.hardVetoTriggered).toBe(false);
            expect(result.hardVetoReasons.length).toBe(0);
        });

        it('should trigger hard veto and dock 50 points from packaging on syntax error', () => {
            const syntaxFailingGate: DeterministicGateResult = {
                ...cleanDeterministic,
                syntaxValid: false,
                syntaxErrors: ['Python syntax check failed in agent.py']
            };

            const result = calculateBaselineScorecard(syntaxFailingGate, []);
            expect(result.scorecard.packagingScore).toBe(50);
            expect(result.hardVetoTriggered).toBe(true);
            expect(result.hardVetoReasons).toContain('Python syntax check failed in agent.py');
        });

        it('should trigger hard veto and reduce security score to 0 on secret leaks', () => {
            const secretFailingGate: DeterministicGateResult = {
                ...cleanDeterministic,
                secretScanPassed: false,
                secretFindings: [
                    {
                        id: 'SEC-1',
                        category: 'SECURITY',
                        severity: 'CRITICAL',
                        file: 'agent.py',
                        description: 'Hardcoded API Key',
                        rationale: 'Plaintext secret committed'
                    }
                ]
            };

            const result = calculateBaselineScorecard(secretFailingGate, []);
            expect(result.scorecard.securityScore).toBe(0);
            expect(result.hardVetoTriggered).toBe(true);
            expect(result.hardVetoReasons.some(r => r.includes('Deterministic Secret Leak'))).toBe(true);
        });

        it('should deduct points according to finding severity: CRITICAL (-35), MAJOR (-15), MINOR (-5)', () => {
            const findings: EvaluatorFinding[] = [
                {
                    id: 'F-CRIT',
                    category: 'SPECIFICATION',
                    severity: 'CRITICAL',
                    file: 'agent.py',
                    description: 'Missing critical agent',
                    rationale: 'Required by spec'
                },
                {
                    id: 'F-MAJ',
                    category: 'ARCHITECTURE',
                    severity: 'MAJOR',
                    file: 'agent.py',
                    description: 'Missing error handler',
                    rationale: 'Recommended'
                },
                {
                    id: 'F-MIN',
                    category: 'MAINTAINABILITY',
                    severity: 'MINOR',
                    file: 'agent.py',
                    description: 'Docstring formatting',
                    rationale: 'Style'
                }
            ];

            const result = calculateBaselineScorecard(cleanDeterministic, findings);
            expect(result.scorecard.specificationScore).toBe(65); // 100 - 35
            expect(result.scorecard.architectureScore).toBe(85);   // 100 - 15
            expect(result.scorecard.maintainabilityScore).toBe(95); // 100 - 5
            expect(result.hardVetoTriggered).toBe(true); // Due to CRITICAL finding
        });

        it('should trigger hard veto if overall score drops below 80 even without CRITICAL findings', () => {
            const findings: EvaluatorFinding[] = [
                { id: 'M1', category: 'ARCHITECTURE', severity: 'MAJOR', file: 'a.py', description: 'm1', rationale: 'r' },
                { id: 'M2', category: 'ARCHITECTURE', severity: 'MAJOR', file: 'a.py', description: 'm2', rationale: 'r' },
                { id: 'M3', category: 'SPECIFICATION', severity: 'MAJOR', file: 'b.py', description: 'm3', rationale: 'r' },
                { id: 'M4', category: 'SPECIFICATION', severity: 'MAJOR', file: 'b.py', description: 'm4', rationale: 'r' },
                { id: 'M5', category: 'SECURITY', severity: 'MAJOR', file: 'c.py', description: 'm5', rationale: 'r' },
                { id: 'M6', category: 'SECURITY', severity: 'MAJOR', file: 'c.py', description: 'm6', rationale: 'r' }
            ];

            const result = calculateBaselineScorecard(cleanDeterministic, findings);
            expect(result.scorecard.overallScore).toBeLessThan(80);
            expect(result.hardVetoTriggered).toBe(true);
        });
    });

    describe('synthesizeEvaluation', () => {
        const mockDeterministic: DeterministicGateResult = {
            syntaxValid: true,
            syntaxErrors: [],
            secretScanPassed: true,
            secretFindings: [],
            astCheckPassed: true,
            astFindings: []
        };

        const mockFiles: GeneratedFileCandidate[] = [
            {
                filename: 'agent.py',
                content: 'from google.adk import Agent\nroot_agent = Agent(name="main_agent")\n'
            }
        ];

        it('should reconcile false positives by dismissing findings and recalculating baseline scorecard', async () => {
            const falsePositiveFinding: EvaluatorFinding = {
                id: 'FALSE-POS-ROOT-AGENT',
                category: 'ARCHITECTURE',
                severity: 'CRITICAL',
                file: 'agent.py',
                description: 'Module agent.py is missing root_agent',
                rationale: 'Sub-agent hallucination'
            };

            const specialistResults: Record<string, SpecialistAgentResult> = {
                AgentArchitectureAgent: {
                    agentName: 'AgentArchitectureAgent',
                    passed: false,
                    summary: 'Reported missing root_agent',
                    findings: [falsePositiveFinding]
                }
            };

            const mockGenerateContent = vi.fn().mockResolvedValue({
                text: JSON.stringify({
                    isGood: true,
                    explanation: 'The reported missing root_agent is a false positive; root_agent is clearly declared on line 2.',
                    dismissedFindingIds: ['FALSE-POS-ROOT-AGENT'],
                    dismissalReasons: [
                        {
                            findingId: 'FALSE-POS-ROOT-AGENT',
                            reason: 'Verified in agent.py line 2: root_agent = Agent(name="main_agent")'
                        }
                    ],
                    promptRemediationDirectives: []
                })
            });

            const mockAi: any = {
                models: {
                    generateContent: mockGenerateContent
                }
            };

            const result = await synthesizeEvaluation(
                mockAi,
                '{"name": "test_workflow"}',
                mockDeterministic,
                specialistResults,
                'CODEGEN PROMPT TEMPLATE CONTENT',
                mockFiles
            );

            // Verify call parameters
            expect(mockGenerateContent).toHaveBeenCalledTimes(1);
            const callArgs = mockGenerateContent.mock.calls[0][0];
            expect(callArgs.config.temperature).toBe(0.1);
            expect(callArgs.contents).toContain('--- FILE: agent.py ---');
            expect(callArgs.contents).toContain('CODEGEN PROMPT TEMPLATE CONTENT');

            // Verify False-Positive reconciliation
            expect(result.dismissedFindingIds).toContain('FALSE-POS-ROOT-AGENT');
            expect(result.dismissalReasons['FALSE-POS-ROOT-AGENT']).toContain('Verified in agent.py line 2');
            expect(result.confirmedFindings?.length).toBe(0);
            expect(result.scorecard.architectureScore).toBe(100);
            expect(result.scorecard.overallScore).toBe(100);
            expect(result.hardVetoTriggered).toBe(false);
            expect(result.isGood).toBe(true);
        });

        it('should uphold hard veto when confirmed CRITICAL findings remain', async () => {
            const confirmedFinding: EvaluatorFinding = {
                id: 'REAL-CRITICAL-VULN',
                category: 'SECURITY',
                severity: 'CRITICAL',
                file: 'tools/db.py',
                description: 'SQL Injection in BigQuery query tool',
                rationale: 'Unparameterized query string formatting'
            };

            const specialistResults: Record<string, SpecialistAgentResult> = {
                SecurityAndHardeningAgent: {
                    agentName: 'SecurityAndHardeningAgent',
                    passed: false,
                    summary: 'SQL injection detected',
                    findings: [confirmedFinding]
                }
            };

            const mockGenerateContent = vi.fn().mockResolvedValue({
                text: JSON.stringify({
                    isGood: false,
                    explanation: 'Confirmed SQL injection in BigQuery tool.',
                    dismissedFindingIds: [],
                    dismissalReasons: [],
                    promptRemediationDirectives: [
                        {
                            targetPromptFile: 'resource/prompts/python_adk_agent-engine.prompt.txt',
                            targetSection: 'Tool Rules',
                            recommendedRuleText: 'Always use ScalarQueryParameter for BigQuery SQL tools.',
                            rationale: 'Prevents SQL injection vulnerabilities.'
                        }
                    ]
                })
            });

            const mockAi: any = {
                models: {
                    generateContent: mockGenerateContent
                }
            };

            const result = await synthesizeEvaluation(
                mockAi,
                '{"name": "test_workflow"}',
                mockDeterministic,
                specialistResults,
                'PROMPT TEMPLATE',
                mockFiles
            );

            expect(result.isGood).toBe(false);
            expect(result.hardVetoTriggered).toBe(true);
            expect(result.confirmedFindings?.length).toBe(1);
            expect(result.promptRemediationDirectives.length).toBe(1);
            expect(result.promptRemediationDirectives[0].targetPromptFile).toBe('resource/prompts/python_adk_agent-engine.prompt.txt');
        });
    });

    describe('withRetry', () => {
        it('should return immediately when the function succeeds on the first attempt', async () => {
            const mockFn = vi.fn().mockResolvedValue('success');
            const result = await withRetry(mockFn, 'TestAgent', 3, 10);
            expect(result).toBe('success');
            expect(mockFn).toHaveBeenCalledTimes(1);
        });

        it('should retry on 429 RESOURCE_EXHAUSTED and succeed', async () => {
            const mockFn = vi.fn()
                .mockRejectedValueOnce(new Error('429 RESOURCE_EXHAUSTED: Rate limit exceeded'))
                .mockResolvedValue('success-on-retry');

            const result = await withRetry(mockFn, 'TestAgent', 3, 10);
            expect(result).toBe('success-on-retry');
            expect(mockFn).toHaveBeenCalledTimes(2);
        });

        it('should throw immediately without retrying on non-retryable errors', async () => {
            const mockFn = vi.fn().mockRejectedValue(new Error('400 Invalid argument'));
            await expect(withRetry(mockFn, 'TestAgent', 3, 10)).rejects.toThrow('400 Invalid argument');
            expect(mockFn).toHaveBeenCalledTimes(1);
        });

        it('should throw after exhausting maxRetries on persistent retryable errors', async () => {
            const mockFn = vi.fn().mockRejectedValue(new Error('503 Service Unavailable'));
            await expect(withRetry(mockFn, 'TestAgent', 2, 10)).rejects.toThrow('503 Service Unavailable');
            expect(mockFn).toHaveBeenCalledTimes(2);
        });
    });

    describe('formatEvaluationReport', () => {
        it('should format a comprehensive human-readable scorecard and report', () => {
            const evalResult: MultiAgentEvaluationResult = {
                isGood: true,
                scorecard: {
                    overallScore: 98,
                    architectureScore: 100,
                    specificationScore: 100,
                    securityScore: 95,
                    packagingScore: 100,
                    maintainabilityScore: 100
                },
                hardVetoTriggered: false,
                hardVetoReasons: [],
                allFindings: [],
                confirmedFindings: [
                    {
                        id: 'F1',
                        category: 'SECURITY',
                        severity: 'MINOR',
                        file: 'Dockerfile',
                        lineNumber: 5,
                        evidence: 'FROM python:3.11',
                        description: 'Non-pinned base image tag',
                        rationale: 'Pinning image digests improves reproducibility'
                    }
                ],
                dismissedFindingIds: ['FALSE_1'],
                dismissalReasons: {
                    FALSE_1: 'Audited against agent.py: symbol exists'
                },
                specialistResults: {},
                promptRemediationDirectives: [
                    {
                        targetPromptFile: 'resource/prompts/python_adk_agent-engine.prompt.txt',
                        targetSection: 'Docker Rules',
                        recommendedRuleText: 'Pin base image digest',
                        rationale: 'Reproducibility'
                    }
                ],
                explanation: 'Generated code meets all production standards.'
            };

            const report = formatEvaluationReport(evalResult, 'Google ADK');
            expect(report).toContain('📊 EVALUATION SCORECARD (Google ADK)');
            expect(report).toContain('Status:       ✅ PASSED');
            expect(report).toContain('Overall:      98 / 100');
            expect(report).toContain('Executive Explanation:');
            expect(report).toContain('🛡️ Dismissed False-Positive Findings (1):');
            expect(report).toContain('[FALSE_1]: Audited against agent.py');
            expect(report).toContain('🔍 Confirmed Findings (1):');
            expect(report).toContain('Dockerfile line 5');
            expect(report).toContain('💡 PROMPT REMEDIATION DIRECTIVES');
            expect(report).toContain('resource/prompts/python_adk_agent-engine.prompt.txt');
        });
    });
});
