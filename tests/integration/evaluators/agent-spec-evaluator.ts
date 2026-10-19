/**
 * Agent Specification & Workflow Conformance Evaluator Sub-Agent.
 *
 * Author: Mike Nimer <mikenimer@google.com>
 *
 * Purpose:
 * Audits generated AI Agent code, tests, and deployment artifacts against the
 * visual Workflow Specification (.agent JSON) to ensure that ALL user-configured
 * agent nodes, trigger nodes, system prompts, tools, structured output schemas,
 * test scenarios, and deployment settings are faithfully incorporated into code.
 *
 * Architectural decisions:
 * - Parses 100% of the canonical .agent workflow JSON document into a structured
 *   Requirement Traceability Matrix (RTM) covering:
 *   1. Agent nodes, models, temperatures, and verbatim prompt constraints.
 *   2. Structured Output Schemas (Pydantic models with exact typed fields).
 *   3. Tool contracts (source files, function signatures, typed parameters, search).
 *   4. Memory backends and specialized agent configurations (HITL, Router, etc.).
 *   5. Trigger configurations and embedded test scenarios across all trigger kinds.
 *   6. Human-readable edge topology resolution.
 * - Instructs the sub-agent to verify each REQ-* item and return structured
 *   verifications with verbatim line-numbered code evidence.
 */

import { GoogleGenAI } from '@google/genai';
import { SpecialistAgentResult, RequirementVerification } from './types';
import { GeneratedFileCandidate, formatFilesWithLineNumbers } from './deterministic-gate';
import { EVALUATOR_MODEL } from './agent-architecture-evaluator';

/**
 * Parsed representation of a tool definition.
 */
export interface ParsedToolDefinition {
    id: string;
    name: string;
    type: string;
    description?: string;
    toolMode?: string;
    sourceFile?: string;
    functionName?: string;
    parameters?: Record<string, string>;
    codePrompt?: string;
    endpointUrl?: string;
    httpMethod?: string;
    mcpConfig?: any;
    vertexAiSearchConfig?: any;
}

/**
 * Parsed representation of a structured output schema.
 */
export interface ParsedStructuredOutputSchema {
    enabled: boolean;
    name?: string;
    fields: Array<{
        name: string;
        type: string;
        required?: boolean;
        arrayItemType?: string;
        description?: string;
    }>;
}

/**
 * Parsed representation of an agent node in the workflow.
 */
export interface ParsedAgentNode {
    id: string;
    name: string;
    label: string;
    role?: string;
    model?: string;
    temperature?: number;
    topP?: number;
    maxOutputTokens?: number;
    thinkingBudget?: number;
    maxIterations?: number;
    agentKind?: string;
    systemPrompt?: string;
    tools: ParsedToolDefinition[];
    subAgents: { agentId: string; name: string; delegationType?: string }[];
    subAgentPattern?: string;
    structuredOutput?: ParsedStructuredOutputSchema;
    memoryType?: string;
    memoryConfig?: Record<string, any>;
    a2aConfig?: Record<string, any>;
    routerConfig?: Record<string, any>;
    debateConfig?: Record<string, any>;
    synthesizerConfig?: Record<string, any>;
    hitlConfig?: Record<string, any>;
    fallbackConfig?: Record<string, any>;
    guardrailConfig?: Record<string, any>;
    isStartNode?: boolean;
    outputFormat?: string;
}

/**
 * Parsed representation of a trigger node in the workflow.
 */
export interface ParsedTriggerNode {
    id: string;
    label: string;
    triggerType: 'chat' | 'tester' | 'eventarc' | 'cron' | 'pubsub' | 'rest' | 'mcp' | string;
    config: Record<string, any>;
    targetRootAgentId?: string;
    testScenarios: Array<{
        id: string;
        name?: string;
        prompt?: string;
        inputQuery?: string;
        expectedOutput?: string;
        assertionType?: string;
    }>;
}

/**
 * Full parsed workflow specification.
 */
export interface ParsedAgentSpec {
    name: string;
    version?: string;
    framework: string;
    language: string;
    deploymentTarget: string;
    deploymentConfig: {
        includeDocker?: boolean;
        includeTests?: boolean;
        useStreaming?: boolean;
        [key: string]: any;
    };
    agents: ParsedAgentNode[];
    triggers: ParsedTriggerNode[];
    edges: {
        source: string;
        target: string;
        sourceName: string;
        targetName: string;
        sourceHandle?: string;
        targetHandle?: string;
    }[];
}

/**
 * Safely parses the .agent JSON string into an exhaustive specification model.
 *
 * @param workflowJson - Raw .agent JSON content.
 * @returns Structured ParsedAgentSpec object.
 */
export function parseAgentWorkflowSpec(workflowJson: string): ParsedAgentSpec {
    if (!workflowJson || !workflowJson.trim()) {
        return {
            name: 'unnamed',
            framework: 'google-adk',
            language: 'python',
            deploymentTarget: 'agent_engine',
            deploymentConfig: {},
            agents: [],
            triggers: [],
            edges: []
        };
    }

    try {
        const parsed = JSON.parse(workflowJson);
        const rawNodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];

        const agents: ParsedAgentNode[] = [];
        const triggers: ParsedTriggerNode[] = [];
        const nodeNameMap = new Map<string, string>();

        for (const node of rawNodes) {
            const data = node.data || {};
            const isTrigger =
                node.type === 'trigger' ||
                node.type === 'triggerNode' ||
                data.triggerType !== undefined ||
                node.id?.includes('trigger') ||
                node.id?.includes('tester');

            const displayName = String(data.name || data.label || node.id);
            nodeNameMap.set(String(node.id || ''), displayName);

            if (isTrigger) {
                const config = typeof data.config === 'object' && data.config !== null ? data.config : {};
                const rawScenarios = Array.isArray(config.testScenarios) ? config.testScenarios : [];
                const rawPrompts = Array.isArray(config.testPrompts) ? config.testPrompts : [];
                const combinedScenarios = [...rawScenarios, ...rawPrompts].map((sc: any, idx: number) => ({
                    id: String(sc.id || `scenario_${idx + 1}`),
                    name: sc.name,
                    prompt: sc.prompt,
                    inputQuery: sc.inputQuery,
                    expectedOutput: sc.expectedOutput || sc.expectedOutputPattern,
                    assertionType: sc.assertionType
                }));

                triggers.push({
                    id: String(node.id || ''),
                    label: String(data.label || 'Trigger'),
                    triggerType: String(data.triggerType || data.triggerKind || 'chat'),
                    config,
                    targetRootAgentId: data.targetRootAgentId,
                    testScenarios: combinedScenarios
                });
            } else {
                const rawTools = Array.isArray(data.tools) ? data.tools : [];
                const tools: ParsedToolDefinition[] = rawTools.map((t: any) => ({
                    id: String(t.id || ''),
                    name: String(t.name || ''),
                    type: String(t.type || ''),
                    description: t.description,
                    toolMode: t.toolMode,
                    sourceFile: t.sourceFile,
                    functionName: t.functionName,
                    parameters: t.parameters,
                    codePrompt: t.codePrompt,
                    endpointUrl: t.endpointUrl,
                    httpMethod: t.httpMethod,
                    mcpConfig: t.mcpConfig,
                    vertexAiSearchConfig: t.vertexAiSearchConfig
                }));

                const rawSubAgents = Array.isArray(data.subAgents) ? data.subAgents : [];
                const subAgents = rawSubAgents.map((sa: any) => ({
                    agentId: String(sa.agentId || ''),
                    name: String(sa.name || ''),
                    delegationType: sa.delegationType
                }));

                const rawStructured = data.structuredOutput || data.structuredOutputSchema;
                let structuredOutput: ParsedStructuredOutputSchema | undefined;
                if (rawStructured && (rawStructured.enabled || Array.isArray(rawStructured.fields))) {
                    structuredOutput = {
                        enabled: Boolean(rawStructured.enabled),
                        name: rawStructured.name,
                        fields: Array.isArray(rawStructured.fields)
                            ? rawStructured.fields.map((f: any) => ({
                                  name: String(f.name || ''),
                                  type: String(f.type || 'string'),
                                  required: Boolean(f.required),
                                  arrayItemType: f.arrayItemType,
                                  description: f.description
                              }))
                            : []
                    };
                }

                agents.push({
                    id: String(node.id || ''),
                    name: String(data.name || data.label || node.id),
                    label: String(data.label || 'Unnamed Agent'),
                    role: data.role,
                    model: data.model,
                    temperature: data.temperature,
                    topP: data.topP,
                    maxOutputTokens: data.maxOutputTokens,
                    thinkingBudget: data.thinkingBudget,
                    maxIterations: data.maxIterations,
                    agentKind: data.agentKind,
                    systemPrompt: data.systemPrompt,
                    tools,
                    subAgents,
                    subAgentPattern: data.subAgentPattern,
                    structuredOutput,
                    memoryType: data.memoryType,
                    memoryConfig: data.memoryConfig,
                    a2aConfig: data.a2aConfig,
                    routerConfig: data.routerConfig,
                    debateConfig: data.debateConfig,
                    synthesizerConfig: data.synthesizerConfig,
                    hitlConfig: data.hitlConfig,
                    fallbackConfig: data.fallbackConfig,
                    guardrailConfig: data.guardrailConfig,
                    isStartNode: Boolean(data.isStartNode),
                    outputFormat: data.outputFormat
                });
            }
        }

        const rawEdges = Array.isArray(parsed.edges) ? parsed.edges : [];
        const edges = rawEdges.map((e: any) => {
            const sourceId = String(e.source || '');
            const targetId = String(e.target || '');
            return {
                source: sourceId,
                target: targetId,
                sourceName: nodeNameMap.get(sourceId) || sourceId,
                targetName: nodeNameMap.get(targetId) || targetId,
                sourceHandle: e.sourceHandle,
                targetHandle: e.targetHandle
            };
        });

        const deployment = parsed.deployment || {};
        const deploymentTarget = deployment.deploymentTarget || deployment.target || 'agent_engine';

        return {
            name: String(parsed.name || 'agent_workflow'),
            version: parsed.version,
            framework: String(parsed.framework || deployment.framework || 'google-adk'),
            language: String(parsed.language || deployment.language || 'python'),
            deploymentTarget: String(deploymentTarget),
            deploymentConfig: {
                includeDocker: deployment.includeDocker,
                includeTests: deployment.includeTests,
                useStreaming: deployment.useStreaming
            },
            agents,
            triggers,
            edges
        };
    } catch {
        return {
            name: 'unnamed',
            framework: 'google-adk',
            language: 'python',
            deploymentTarget: 'agent_engine',
            deploymentConfig: {},
            agents: [],
            triggers: [],
            edges: []
        };
    }
}

/**
 * Formats a parsed agent specification into a numbered Requirement Traceability Matrix (RTM).
 *
 * @param spec - Structured ParsedAgentSpec.
 * @returns Formatted checklist string.
 */
export function formatAgentSpecChecklist(spec: ParsedAgentSpec): string {
    const lines: string[] = [];

    lines.push(`Workflow: "${spec.name}" | Framework: ${spec.framework} | Language: ${spec.language} | Deployment Target: ${spec.deploymentTarget}`);
    lines.push(`Deployment Flags: includeDocker=${spec.deploymentConfig.includeDocker}, includeTests=${spec.deploymentConfig.includeTests}, useStreaming=${spec.deploymentConfig.useStreaming}`);
    lines.push(`\n=== REQUIREMENT TRACEABILITY MATRIX (RTM) ===`);

    for (const [idx, agent] of spec.agents.entries()) {
        const reqId = `REQ-AGENT-${idx + 1}`;
        const startMarker = agent.isStartNode ? ' [ROOT / START NODE]' : '';
        lines.push(`\n[${reqId}] Agent: "${agent.name}" (Label: "${agent.label}") ${startMarker}`);
        if (agent.model) lines.push(`  - Model: ${agent.model}`);
        if (agent.temperature !== undefined) lines.push(`  - Temperature: ${agent.temperature}`);
        if (agent.maxIterations !== undefined) lines.push(`  - Max Iterations: ${agent.maxIterations}`);
        if (agent.role) lines.push(`  - Role: ${agent.role}`);
        if (agent.subAgentPattern) lines.push(`  - Pattern: ${agent.subAgentPattern}`);
        if (agent.memoryType && agent.memoryType !== 'none') lines.push(`  - Memory: ${agent.memoryType}`);
        if (agent.systemPrompt) lines.push(`  - System Instructions: "${agent.systemPrompt}"`);

        // Structured Output Schemas
        if (agent.structuredOutput && agent.structuredOutput.fields.length > 0) {
            const schemaName = agent.structuredOutput.name || `${agent.name}Output`;
            lines.push(`  - [REQ-SCHEMA-${agent.name}] Pydantic Model "${schemaName}":`);
            for (const f of agent.structuredOutput.fields) {
                const req = f.required ? 'required' : 'optional';
                const typeStr = f.type === 'array' ? `array<${f.arrayItemType || 'string'}>` : f.type;
                lines.push(`      * ${f.name} (${typeStr}, ${req}) - ${f.description || ''}`);
            }
        }

        // Tools
        if (agent.tools.length > 0) {
            for (const [tIdx, t] of agent.tools.entries()) {
                const toolReqId = `REQ-TOOL-${agent.name}-${tIdx + 1}`;
                lines.push(`  - [${toolReqId}] Tool: "${t.name}" (${t.type})`);
                if (t.sourceFile) lines.push(`      File: ${t.sourceFile}`);
                if (t.functionName) lines.push(`      Function: ${t.functionName}`);
                if (t.parameters) lines.push(`      Parameters: ${JSON.stringify(t.parameters)}`);
                if (t.description) lines.push(`      Description: ${t.description}`);
            }
        }

        // Subagents
        if (agent.subAgents.length > 0) {
            lines.push(`  - Sub-Agents (${agent.subAgents.length}):`);
            for (const sa of agent.subAgents) {
                lines.push(`      * Delegated Child: "${sa.name}" (ID: ${sa.agentId})`);
            }
        }
    }

    // Triggers and Test Scenarios
    if (spec.triggers.length > 0) {
        lines.push(`\nTriggers & Test Scenarios:`);
        for (const [idx, tr] of spec.triggers.entries()) {
            const trigReqId = `REQ-TRIGGER-${idx + 1}`;
            lines.push(`\n[${trigReqId}] Trigger: "${tr.label}" (Type: ${tr.triggerType})`);
            if (tr.targetRootAgentId) lines.push(`  - Target Root Agent: ${tr.targetRootAgentId}`);
            if (Object.keys(tr.config).length > 0) {
                lines.push(`  - Config: ${JSON.stringify(tr.config)}`);
            }
            if (tr.testScenarios.length > 0) {
                for (const [sIdx, sc] of tr.testScenarios.entries()) {
                    const testReqId = `REQ-TEST-${idx + 1}-${sIdx + 1}`;
                    lines.push(`  - [${testReqId}] Test Scenario "${sc.name || sc.id}":`);
                    if (sc.prompt || sc.inputQuery) lines.push(`      Input: "${sc.prompt || sc.inputQuery}"`);
                    if (sc.expectedOutput) lines.push(`      Expected: "${sc.expectedOutput}" (assertion: ${sc.assertionType || 'contains'})`);
                }
            }
        }
    }

    // Edges
    if (spec.edges.length > 0) {
        lines.push(`\nTopology Edges:`);
        for (const edge of spec.edges) {
            lines.push(`  - Connection: "${edge.sourceName}" -> "${edge.targetName}"`);
        }
    }

    return lines.join('\n');
}

/**
 * Runs the Agent Specification & Workflow Conformance Evaluator sub-agent.
 *
 * @param ai - Initialized GoogleGenAI client.
 * @param workflowJson - Original .agent workflow JSON document string.
 * @param files - All generated files.
 * @returns Specialist evaluation result with category 'SPECIFICATION'.
 */
export async function evaluateAgentSpecification(
    ai: GoogleGenAI,
    workflowJson: string,
    files: GeneratedFileCandidate[]
): Promise<SpecialistAgentResult> {
    const spec = parseAgentWorkflowSpec(workflowJson);
    const checklistText = formatAgentSpecChecklist(spec);

    const prompt = `You are the Principal Agent Specification & Workflow Conformance Evaluator Agent.
Your responsibility is auditing generated AI Agent code to verify that it FAITHFULLY AND ACCURATELY IMPLEMENTS THE EXACT WORKFLOW DEFINED IN THE .AGENT JSON SPECIFICATION.
You must ensure that ALL declared agent nodes, Pydantic schemas, tools, subagents, test scenarios, and deployment targets are properly generated and wired.

=== REQUIREMENT TRACEABILITY MATRIX (RTM) ===
${checklistText}
=============================================

=== GENERATED SOURCE FILES & ARTIFACTS (WITH LINE NUMBERS) ===
${formatFilesWithLineNumbers(files)}
=============================================================

Audit the code against the RTM and complete the following checks:
1. **Agent Node Completeness & Instruction Fidelity**:
   - Inspect every [REQ-AGENT-*] in the RTM.
   - Verify that EVERY agent node defined in the JSON is instantiated in \`agent.py\`.
   - Verify that system prompts in code preserve all critical constraints, role instructions, and workflows from the JSON without being heavily summarized or dropped.
   - Verify configured hyperparameters (\`temperature\`, \`maxIterations\`) are passed to agent instances.

2. **Structured Output Schemas (Pydantic Models)**:
   - For every [REQ-SCHEMA-*], verify that a corresponding Pydantic \`BaseModel\` class is generated in code with exact field names and types.
   - Verify the schema is wired to the agent via \`output_schema=...\` (or handled via \`output_key\` if combined with Search tools).

3. **Tools & Function Contracts**:
   - For every [REQ-TOOL-*], verify that custom tool functions (\`sourceFile\` and \`functionName\`) exist in \`files[]\` and have typed parameters and docstrings.
   - Verify that declared tools are attached to their specified agents in \`tools=[...]\`.

4. **Triggers & Automated Test Scenarios**:
   - For every [REQ-TEST-*], verify that the test scenario input query and expected output assertions are implemented in \`test_agent.py\`.
   - Verify that the test assertion matches the configured \`assertionType\` (e.g. substring contains, schema validation).

5. **Deployment Target Conformance**:
   - Does the generated deployment configuration match \`${spec.deploymentTarget}\`?
   - Container targets (\`cloudrun\`, \`agent_engine\`) ALWAYS require Dockerfile and .dockerignore for production container builds.

Severity Guidelines:
- CRITICAL: A defined agent node, Pydantic output model, custom tool, or tester scenario is completely missing or silently omitted; code targets the wrong deployment environment.
- MAJOR: Hyperparameters (temperature, maxIterations) are omitted or defaulted; prompt constraints are severely diluted; test assertions do not verify expected outputs.
- MINOR: Minor wording differences in docstrings or comments.`;

    const schema = {
        type: "object",
        properties: {
            passed: {
                type: "boolean",
                description: "True if all configured agent nodes, schemas, prompts, tools, and specification requirements are faithfully implemented"
            },
            summary: {
                type: "string",
                description: "Specification conformance assessment summary"
            },
            requirementVerifications: {
                type: "array",
                description: "Traceability verification status for each REQ-* item in the RTM",
                items: {
                    type: "object",
                    properties: {
                        id: { type: "string", description: "Requirement ID (e.g. REQ-AGENT-1, REQ-SCHEMA-triage_specialist)" },
                        category: { type: "string", enum: ["AGENT", "TOOL", "SCHEMA", "TRIGGER", "PARAM", "TEST"] },
                        status: { type: "string", enum: ["VERIFIED", "PARTIAL", "MISSING"] },
                        evidence: { type: "string", description: "Exact line-numbered code snippet proving implementation, or 'OMITTED'" },
                        details: { type: "string", description: "Explanation of verification findings" }
                    },
                    required: ["id", "category", "status", "evidence", "details"]
                }
            },
            findings: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        id: { type: "string" },
                        category: { type: "string", enum: ["SPECIFICATION"] },
                        severity: { type: "string", enum: ["CRITICAL", "MAJOR", "MINOR"] },
                        file: { type: "string" },
                        lineNumber: { type: "integer", description: "1-indexed line number where the issue occurs" },
                        evidence: { type: "string", description: "Exact line-numbered code snippet showing the issue, or 'OMITTED'" },
                        description: { type: "string" },
                        rationale: { type: "string" }
                    },
                    required: ["id", "category", "severity", "file", "description", "rationale"]
                }
            }
        },
        required: ["passed", "summary", "findings"]
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
        throw new Error('Empty response from AgentSpecificationAgent');
    }

    const parsed = JSON.parse(response.text);
    return {
        agentName: 'AgentSpecificationAgent',
        passed: parsed.passed,
        summary: parsed.summary,
        requirementVerifications: parsed.requirementVerifications || [],
        findings: parsed.findings || []
    };
}
