/**
 * Unit Tests for Specialist Evaluator Sub-Agents.
 *
 * Author: Mike Nimer <mikenimer@google.com>
 *
 * Purpose:
 * Validates prompt structure, rubric verification, model invocation, and fallback handling
 * for the specialized evaluator agents:
 * - SecurityAndHardeningAgent (gemini-3.8-flash-cyber with Fairwind 403 fallback)
 * - AgentArchitectureAgent (gemini-3.8-flash with state flow & ADK topologies)
 * - PackagingAndDeployabilityAgent (gemini-3.8-flash with offline CI assertions)
 * - AgentSpecificationAgent (gemini-3.8-flash with 100% RTM traceability)
 * - Multi-Agent Orchestrator end-to-end pipeline
 */

import { describe, it, expect, vi } from 'vitest';
import {
    evaluateSecurityAndHardening,
    SECURITY_EVALUATOR_MODEL,
    SECURITY_FALLBACK_MODEL
} from '../../../tests/integration/evaluators/security-evaluator';
import { evaluateAgentArchitecture } from '../../../tests/integration/evaluators/agent-architecture-evaluator';
import { evaluatePackagingAndDeployability } from '../../../tests/integration/evaluators/packaging-evaluator';
import { evaluateAgentSpecification } from '../../../tests/integration/evaluators/agent-spec-evaluator';
import { runMultiAgentEvaluation } from '../../../tests/integration/evaluators/multi-agent-evaluator';
import { GeneratedFileCandidate } from '../../../tests/integration/evaluators/deterministic-gate';

describe('Specialist Evaluator Sub-Agents', () => {
    const mockFiles: GeneratedFileCandidate[] = [
        {
            filename: 'agent.py',
            content: 'from google.adk import Agent\nroot_agent = Agent(name="main_agent")\n'
        },
        {
            filename: 'requirements.txt',
            content: 'google-adk>=0.1.0\npydantic\n'
        }
    ];

    const sampleWorkflowJson = JSON.stringify({
        name: 'test_workflow',
        framework: 'google-adk',
        language: 'python',
        deploymentTarget: 'agent_engine',
        nodes: [
            {
                id: 'agent_1',
                data: {
                    name: 'main_agent',
                    label: 'Main Agent',
                    model: 'gemini-3.8-flash',
                    systemPrompt: 'Assist users politely.'
                }
            }
        ],
        edges: []
    });

    describe('evaluateSecurityAndHardening', () => {
        it('should call gemini-3.8-flash-cyber by default with temperature 0.1 and agentic CWE rubric', async () => {
            const mockGenerateContent = vi.fn().mockResolvedValue({
                text: JSON.stringify({
                    passed: true,
                    summary: 'No security vulnerabilities detected',
                    findings: []
                })
            });

            const mockAi: any = {
                models: {
                    generateContent: mockGenerateContent
                }
            };

            const result = await evaluateSecurityAndHardening(mockAi, sampleWorkflowJson, mockFiles);

            expect(mockGenerateContent).toHaveBeenCalledTimes(1);
            const callArgs = mockGenerateContent.mock.calls[0][0];
            expect(callArgs.model).toBe(SECURITY_EVALUATOR_MODEL);
            expect(callArgs.config.temperature).toBe(0.1);
            expect(callArgs.config.responseMimeType).toBe('application/json');

            // Verify CWE rubric and prompt elements
            const prompt = callArgs.contents;
            expect(prompt).toContain('=== INPUT WORKFLOW SPECIFICATION (.agent JSON) ===');
            expect(prompt).toContain('=== GENERATED SOURCE FILES & ARTIFACTS (WITH LINE NUMBERS) ===');
            expect(prompt).toContain('1: from google.adk import Agent');
            expect(prompt).toContain('CWE-89');
            expect(prompt).toContain('Human-in-the-Loop (HITL)');
            expect(prompt).toContain('CWE-918');
            expect(prompt).toContain('Container & Dockerfile Hardening');
            expect(prompt).toContain('Terraform & Infrastructure IAM Least Privilege');

            expect(result.agentName).toBe('SecurityAndHardeningAgent');
            expect(result.passed).toBe(true);
            expect(result.findings.length).toBe(0);
        });

        it('should gracefully fallback to gemini-3.8-flash when gemini-3.8-flash-cyber returns 403 PERMISSION_DENIED', async () => {
            const mockGenerateContent = vi.fn()
                .mockRejectedValueOnce(new Error('403 PERMISSION_DENIED: User does not have access to gemini-3.8-flash-cyber on Vertex AI.'))
                .mockResolvedValueOnce({
                    text: JSON.stringify({
                        passed: true,
                        summary: 'Passed security evaluation using fallback model',
                        findings: []
                    })
                });

            const mockAi: any = {
                models: {
                    generateContent: mockGenerateContent
                }
            };

            const result = await evaluateSecurityAndHardening(mockAi, sampleWorkflowJson, mockFiles);

            expect(mockGenerateContent).toHaveBeenCalledTimes(2);
            // First call targeted cyber model
            expect(mockGenerateContent.mock.calls[0][0].model).toBe('gemini-3.8-flash-cyber');
            // Second call targeted fallback model
            expect(mockGenerateContent.mock.calls[1][0].model).toBe(SECURITY_FALLBACK_MODEL);
            expect(result.passed).toBe(true);
            expect(result.summary).toContain('fallback model');
        });

        it('should rethrow non-permission errors without swallowing', async () => {
            const mockGenerateContent = vi.fn().mockRejectedValue(new Error('500 Internal Server Error'));
            const mockAi: any = {
                models: {
                    generateContent: mockGenerateContent
                }
            };

            await expect(evaluateSecurityAndHardening(mockAi, sampleWorkflowJson, mockFiles)).rejects.toThrow('500 Internal Server Error');
        });
    });

    describe('evaluateAgentArchitecture', () => {
        it('should invoke model with ADK architecture rubric, temperature 0.1, and line-numbered files', async () => {
            const mockGenerateContent = vi.fn().mockResolvedValue({
                text: JSON.stringify({
                    passed: true,
                    summary: 'ADK architecture is sound and idiomatic',
                    findings: []
                })
            });

            const mockAi: any = {
                models: {
                    generateContent: mockGenerateContent
                }
            };

            const result = await evaluateAgentArchitecture(mockAi, sampleWorkflowJson, mockFiles);

            expect(mockGenerateContent).toHaveBeenCalledTimes(1);
            const callArgs = mockGenerateContent.mock.calls[0][0];
            expect(callArgs.config.temperature).toBe(0.1);

            const prompt = callArgs.contents;
            expect(prompt).toContain('Agent Architecture Invariants');
            expect(prompt).toContain('1: from google.adk import Agent');
            expect(prompt).toContain('bypass_multi_tools_limit');
            expect(prompt).toContain('output_key');

            expect(result.agentName).toBe('AgentArchitectureAgent');
            expect(result.passed).toBe(true);
        });
    });

    describe('evaluatePackagingAndDeployability', () => {
        it('should evaluate requirements.txt, offline CI mocks, and deployment manifests', async () => {
            const mockGenerateContent = vi.fn().mockResolvedValue({
                text: JSON.stringify({
                    passed: true,
                    summary: 'Packaging and deployability meet requirements',
                    findings: []
                })
            });

            const mockAi: any = {
                models: {
                    generateContent: mockGenerateContent
                }
            };

            const result = await evaluatePackagingAndDeployability(mockAi, sampleWorkflowJson, mockFiles);

            expect(mockGenerateContent).toHaveBeenCalledTimes(1);
            const callArgs = mockGenerateContent.mock.calls[0][0];
            expect(callArgs.config.temperature).toBe(0.1);

            const prompt = callArgs.contents;
            expect(prompt).toContain('Packaging & Deployment Checklist');
            expect(prompt).toContain('Offline CI Mocking');
            expect(prompt).toContain('test_workflow');

            expect(result.agentName).toBe('PackagingAndDeployabilityAgent');
            expect(result.passed).toBe(true);
        });
    });

    describe('evaluateAgentSpecification', () => {
        it('should generate RTM checklist and evaluate node conformance and structured output', async () => {
            const mockGenerateContent = vi.fn().mockResolvedValue({
                text: JSON.stringify({
                    passed: true,
                    summary: 'All nodes match specification',
                    requirementVerifications: [
                        {
                            requirementId: 'REQ-AGENT-1',
                            satisfied: true,
                            codeLocation: 'agent.py:2',
                            evidence: 'root_agent = Agent(name="main_agent")'
                        }
                    ],
                    findings: []
                })
            });

            const mockAi: any = {
                models: {
                    generateContent: mockGenerateContent
                }
            };

            const result = await evaluateAgentSpecification(mockAi, sampleWorkflowJson, mockFiles);

            expect(mockGenerateContent).toHaveBeenCalledTimes(1);
            const callArgs = mockGenerateContent.mock.calls[0][0];
            expect(callArgs.config.temperature).toBe(0.1);

            const prompt = callArgs.contents;
            expect(prompt).toContain('REQUIREMENT TRACEABILITY MATRIX (RTM)');
            expect(prompt).toContain('[REQ-AGENT-1] Agent: "main_agent"');
            expect(prompt).toContain('1: from google.adk import Agent');

            expect(result.agentName).toBe('AgentSpecificationAgent');
            expect(result.passed).toBe(true);
        });
    });

    describe('runMultiAgentEvaluation (End-to-End Pipeline)', () => {
        it('should orchestrate deterministic gate, 4 specialists, and Arbiter synthesis', async () => {
            const mockGenerateContent = vi.fn().mockResolvedValue({
                text: JSON.stringify({
                    isGood: true,
                    passed: true,
                    summary: 'Evaluation completed successfully',
                    explanation: 'All requirements met and no critical issues.',
                    findings: [],
                    promptRemediationDirectives: []
                })
            });

            const mockAi: any = {
                models: {
                    generateContent: mockGenerateContent
                }
            };

            const result = await runMultiAgentEvaluation(
                mockAi,
                sampleWorkflowJson,
                'CODEGEN PROMPT TEMPLATE',
                mockFiles
            );

            // 4 specialists + 1 arbiter = 5 model calls
            expect(mockGenerateContent).toHaveBeenCalledTimes(5);
            expect(result.isGood).toBe(true);
            expect(result.scorecard.overallScore).toBe(100);
            expect(result.hardVetoTriggered).toBe(false);
            expect(result.specialistResults.AgentArchitectureAgent).toBeDefined();
            expect(result.specialistResults.AgentSpecificationAgent).toBeDefined();
            expect(result.specialistResults.SecurityAndHardeningAgent).toBeDefined();
            expect(result.specialistResults.PackagingAndDeployabilityAgent).toBeDefined();
        });
    });
});
