/**
 * Unit Tests for Agent Specification & Workflow Conformance Evaluator.
 *
 * Author: Mike Nimer <mikenimer@google.com>
 *
 * Purpose:
 * Validates 100% extraction of .agent workflow JSON specifications into
 * Requirement Traceability Matrices (RTM) and checklist formatting:
 * - Real sample parsing (animal_agent.agent, cyber_guardian.agent)
 * - Handling of empty, invalid, or minimal JSON workflows
 * - Extraction of Structured Output Schemas (Pydantic models)
 * - Extraction of Tool definitions, parameters, and source files
 * - Extraction of Triggers and Test Scenarios
 * - Edge topology resolution to human-readable agent names
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
    parseAgentWorkflowSpec,
    formatAgentSpecChecklist,
    ParsedAgentSpec
} from '../../../tests/integration/evaluators/agent-spec-evaluator';

describe('Agent Specification Evaluator', () => {
    const animalAgentPath = path.resolve(__dirname, '../../../tests/integration/animal_agent.agent');
    const cyberGuardianPath = path.resolve(__dirname, '../../../tests/integration/cyber_guardian.agent');

    describe('parseAgentWorkflowSpec', () => {
        it('should safely return default spec when given empty or whitespace string', () => {
            const spec = parseAgentWorkflowSpec('');
            expect(spec.name).toBe('unnamed');
            expect(spec.framework).toBe('google-adk');
            expect(spec.language).toBe('python');
            expect(spec.agents.length).toBe(0);
            expect(spec.triggers.length).toBe(0);
            expect(spec.edges.length).toBe(0);
        });

        it('should safely return default spec when given malformed JSON', () => {
            const spec = parseAgentWorkflowSpec('{"invalid": json');
            expect(spec.name).toBe('unnamed');
            expect(spec.agents.length).toBe(0);
        });

        it('should accurately parse animal_agent.agent sample workflow', () => {
            expect(fs.existsSync(animalAgentPath)).toBe(true);
            const content = fs.readFileSync(animalAgentPath, 'utf-8');
            const spec = parseAgentWorkflowSpec(content);

            expect(spec.name).toBe('animal_agent');
            expect(spec.framework).toBe('google-adk');
            expect(spec.language).toBe('python');
            expect(spec.deploymentTarget).toBe('agent_engine');
            expect(spec.agents.length).toBeGreaterThan(0);

            // Verify root expert agent
            const expert = spec.agents.find(a => a.name === 'animal_expert');
            expect(expert).toBeDefined();
            expect(expert?.isStartNode).toBe(true);
            expect(expert?.subAgents.length).toBe(2);

            // Verify subagents
            const catAgent = spec.agents.find(a => a.name === 'cat_agent');
            expect(catAgent).toBeDefined();
            expect(catAgent?.tools.length).toBeGreaterThan(0);
            expect(catAgent?.tools.some(t => t.type === 'search')).toBe(true);

            // Verify triggers
            expect(spec.triggers.length).toBeGreaterThan(0);
            const chatTrigger = spec.triggers.find(t => t.triggerType === 'chat');
            expect(chatTrigger).toBeDefined();

            // Verify edge topology resolution
            expect(spec.edges.length).toBeGreaterThan(0);
            for (const edge of spec.edges) {
                expect(edge.sourceName).toBeDefined();
                expect(edge.targetName).toBeDefined();
            }
        });

        it('should accurately parse cyber_guardian.agent multi-agent workflow', () => {
            expect(fs.existsSync(cyberGuardianPath)).toBe(true);
            const content = fs.readFileSync(cyberGuardianPath, 'utf-8');
            const spec = parseAgentWorkflowSpec(content);

            expect(spec.name).toBe('CyberGuardianSecOps');
            expect(spec.agents.length).toBeGreaterThanOrEqual(4);

            // Verify orchestrator
            const orchestrator = spec.agents.find(a => a.name === 'cyber_guardian_orchestrator');
            expect(orchestrator).toBeDefined();
            expect(orchestrator?.isStartNode).toBe(true);
            expect(orchestrator?.subAgents.length).toBe(4);

            // Verify triage specialist
            const triage = spec.agents.find(a => a.id.includes('triage') || a.name.includes('triage') || a.label.includes('Triage'));
            expect(triage).toBeDefined();

            // Verify trigger scenarios
            const trigger = spec.triggers.find(t => t.triggerType === 'eventarc' || t.id.includes('trigger'));
            expect(trigger).toBeDefined();
            expect(trigger?.testScenarios.length).toBeGreaterThan(0);
            const scenario = trigger?.testScenarios[0];
            expect(scenario?.inputQuery || scenario?.prompt).toBeDefined();
        });

        it('should accurately parse code_reviewer.agent sample workflow with dual triggers and 6 test scenarios', () => {
            const codeReviewerPath = path.resolve(__dirname, '../../../resource/samples/sdlc/code_reviewer/code_reviewer.agent');
            expect(fs.existsSync(codeReviewerPath)).toBe(true);
            const content = fs.readFileSync(codeReviewerPath, 'utf-8');
            const spec = parseAgentWorkflowSpec(content);

            expect(spec.name).toBe('Autonomous Multi-Agent Code Reviewer');
            expect(spec.framework).toBe('google-adk');
            expect(spec.language).toBe('python');
            expect(spec.agents.length).toBe(4);

            const coordinator = spec.agents.find(a => a.name === 'code_review_coordinator');
            expect(coordinator).toBeDefined();
            expect(coordinator?.isStartNode).toBe(true);
            expect(coordinator?.subAgents.length).toBe(3);

            const testerTrigger = spec.triggers.find(t => t.triggerType === 'tester');
            expect(testerTrigger).toBeDefined();
            expect(testerTrigger?.testScenarios.length).toBe(6);
        });

        it('should parse structured output schemas with Pydantic field definitions', () => {
            const workflow = {
                name: 'Structured Agent Workflow',
                nodes: [
                    {
                        id: 'agent_1',
                        type: 'agent',
                        data: {
                            name: 'ExtractorAgent',
                            label: 'Data Extractor',
                            model: 'gemini-3.8-flash',
                            structuredOutput: {
                                enabled: true,
                                name: 'EntityExtractionResult',
                                fields: [
                                    {
                                        name: 'entities',
                                        type: 'array',
                                        arrayItemType: 'string',
                                        required: true,
                                        description: 'Extracted named entities'
                                    },
                                    {
                                        name: 'confidence',
                                        type: 'number',
                                        required: true,
                                        description: 'Confidence score between 0.0 and 1.0'
                                    }
                                ]
                            }
                        }
                    }
                ],
                edges: []
            };

            const spec = parseAgentWorkflowSpec(JSON.stringify(workflow));
            expect(spec.agents.length).toBe(1);
            const agent = spec.agents[0];
            expect(agent.structuredOutput).toBeDefined();
            expect(agent.structuredOutput?.enabled).toBe(true);
            expect(agent.structuredOutput?.name).toBe('EntityExtractionResult');
            expect(agent.structuredOutput?.fields.length).toBe(2);

            const entitiesField = agent.structuredOutput?.fields[0];
            expect(entitiesField?.name).toBe('entities');
            expect(entitiesField?.type).toBe('array');
            expect(entitiesField?.arrayItemType).toBe('string');
            expect(entitiesField?.required).toBe(true);

            const confidenceField = agent.structuredOutput?.fields[1];
            expect(confidenceField?.name).toBe('confidence');
            expect(confidenceField?.type).toBe('number');
            expect(confidenceField?.required).toBe(true);
        });

        it('should extract custom tool details including function parameters and source files', () => {
            const workflow = {
                name: 'Custom Tool Workflow',
                nodes: [
                    {
                        id: 'agent_tool_user',
                        type: 'agent',
                        data: {
                            name: 'ToolAgent',
                            tools: [
                                {
                                    id: 'tool_calc',
                                    name: 'calculate_tax',
                                    type: 'custom_code',
                                    sourceFile: 'tools/tax_calc.py',
                                    functionName: 'compute_sales_tax',
                                    description: 'Computes state sales tax for items',
                                    parameters: {
                                        amount: 'float',
                                        state_code: 'str'
                                    }
                                }
                            ]
                        }
                    }
                ],
                edges: []
            };

            const spec = parseAgentWorkflowSpec(JSON.stringify(workflow));
            expect(spec.agents[0].tools.length).toBe(1);
            const tool = spec.agents[0].tools[0];
            expect(tool.name).toBe('calculate_tax');
            expect(tool.sourceFile).toBe('tools/tax_calc.py');
            expect(tool.functionName).toBe('compute_sales_tax');
            expect(tool.parameters?.amount).toBe('float');
            expect(tool.parameters?.state_code).toBe('str');
        });

        it('should resolve edge connections with human-readable node names', () => {
            const workflow = {
                name: 'Connected Workflow',
                nodes: [
                    { id: 'node_1', data: { name: 'ProducerAgent' } },
                    { id: 'node_2', data: { label: 'ConsumerAgent' } }
                ],
                edges: [
                    { source: 'node_1', target: 'node_2' }
                ]
            };

            const spec = parseAgentWorkflowSpec(JSON.stringify(workflow));
            expect(spec.edges.length).toBe(1);
            expect(spec.edges[0].sourceName).toBe('ProducerAgent');
            expect(spec.edges[0].targetName).toBe('ConsumerAgent');
        });
    });

    describe('formatAgentSpecChecklist', () => {
        it('should generate structured RTM checklist with REQ- headers and deployment info', () => {
            const spec: ParsedAgentSpec = {
                name: 'Sample System',
                framework: 'google-adk',
                language: 'python',
                deploymentTarget: 'cloudrun',
                deploymentConfig: {
                    includeDocker: true,
                    includeTests: true,
                    useStreaming: false
                },
                agents: [
                    {
                        id: 'agent_1',
                        name: 'coordinator',
                        label: 'Master Coordinator',
                        model: 'gemini-3.8-flash',
                        temperature: 0.2,
                        maxIterations: 10,
                        role: 'Coordinator',
                        systemPrompt: 'You coordinate all research tasks.',
                        tools: [
                            {
                                id: 't1',
                                name: 'search_tool',
                                type: 'google_search',
                                description: 'Performs web search'
                            }
                        ],
                        subAgents: [{ agentId: 'agent_2', name: 'worker' }],
                        structuredOutput: {
                            enabled: true,
                            name: 'ReportSchema',
                            fields: [
                                { name: 'summary', type: 'string', required: true, description: 'Executive summary' }
                            ]
                        }
                    }
                ],
                triggers: [
                    {
                        id: 'trig_1',
                        label: 'Chat Interface',
                        triggerType: 'chat',
                        config: {},
                        testScenarios: [
                            {
                                id: 'sc_1',
                                name: 'Greeting Test',
                                prompt: 'Hello agent',
                                expectedOutput: 'Hello! How can I help you?',
                                assertionType: 'contains'
                            }
                        ]
                    }
                ],
                edges: [
                    {
                        source: 'trig_1',
                        target: 'agent_1',
                        sourceName: 'Chat Interface',
                        targetName: 'Master Coordinator'
                    }
                ]
            };

            const checklist = formatAgentSpecChecklist(spec);

            // Verify Header & Flags
            expect(checklist).toContain('Workflow: "Sample System"');
            expect(checklist).toContain('Deployment Target: cloudrun');
            expect(checklist).toContain('includeDocker=true');
            expect(checklist).toContain('includeTests=true');

            // Verify Agent RTM
            expect(checklist).toContain('[REQ-AGENT-1] Agent: "coordinator" (Label: "Master Coordinator")');
            expect(checklist).toContain('Model: gemini-3.8-flash');
            expect(checklist).toContain('Temperature: 0.2');
            expect(checklist).toContain('Max Iterations: 10');
            expect(checklist).toContain('System Instructions: "You coordinate all research tasks."');

            // Verify Schema RTM
            expect(checklist).toContain('[REQ-SCHEMA-coordinator] Pydantic Model "ReportSchema":');
            expect(checklist).toContain('summary (string, required) - Executive summary');

            // Verify Tool RTM
            expect(checklist).toContain('[REQ-TOOL-coordinator-1] Tool: "search_tool" (google_search)');

            // Verify Trigger & Test RTM
            expect(checklist).toContain('[REQ-TRIGGER-1] Trigger: "Chat Interface" (Type: chat)');
            expect(checklist).toContain('[REQ-TEST-1-1] Test Scenario "Greeting Test":');
            expect(checklist).toContain('Input: "Hello agent"');
            expect(checklist).toContain('Expected: "Hello! How can I help you?" (assertion: contains)');

            // Verify Edge Topology
            expect(checklist).toContain('Topology Edges:');
            expect(checklist).toContain('"Chat Interface" -> "Master Coordinator"');
        });
    });
});
