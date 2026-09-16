/**
 * Agent Specification & Workflow Conformance Evaluator Sub-Agent.
 *
 * Author: Mike Nimer <mikenimer@google.com>
 *
 * Purpose:
 * Audits generated AI Agent code, tests, and deployment artifacts against the
 * visual Workflow Specification (.agent JSON) to ensure that all user-configured
 * agent nodes, trigger nodes, system prompts, tools, test scenarios, and deployment
 * settings are faithfully incorporated and utilized in the generated codebase.
 *
 * Architectural decisions:
 * - Parses the JSON .agent workflow document into a structured specification checklist
 *   (agents, triggers, tools, memory, test prompts, deployment target).
 * - Instructs the sub-agent to cross-reference every defined node and property against
 *   generated files (agent.py, test_agent.py, Dockerfile, etc.), catching silently
 *   omitted agents, dropped tools, missing test cases, or fallback values.
 * - Emits structured findings with category 'SPECIFICATION'.
 */

import { GoogleGenAI } from '@google/genai';
import { SpecialistAgentResult } from './types';
import { GeneratedFileCandidate } from './deterministic-gate';
import { EVALUATOR_MODEL } from './agent-architecture-evaluator';

/**
 * Parsed representation of an agent node in the workflow.
 */
export interface ParsedAgentNode {
    id: string;
    name: string;
    label: string;
    role?: string;
    model?: string;
    systemPrompt?: string;
    tools: { id: string; name: string; type: string; description?: string }[];
    subAgents: { agentId: string; name: string; delegationType?: string }[];
    subAgentPattern?: string;
    isStartNode?: boolean;
    outputFormat?: string;
}

/**
 * Parsed representation of a trigger node in the workflow.
 */
export interface ParsedTriggerNode {
    id: string;
    label: string;
    triggerType: 'chat' | 'tester' | 'eventarc' | 'cron' | 'rest' | 'mcp' | string;
    config: Record<string, any>;
    targetRootAgentId?: string;
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
    agents: ParsedAgentNode[];
    triggers: ParsedTriggerNode[];
    edges: { source: string; target: string; sourceHandle?: string; targetHandle?: string }[];
}

/**
 * Safely parses the .agent JSON string into a structured specification model.
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

        for (const node of rawNodes) {
            const data = node.data || {};
            const isTrigger =
                node.type === 'trigger' ||
                node.type === 'triggerNode' ||
                data.triggerType !== undefined ||
                node.id?.includes('trigger') ||
                node.id?.includes('tester');

            if (isTrigger) {
                triggers.push({
                    id: String(node.id || ''),
                    label: String(data.label || 'Trigger'),
                    triggerType: String(data.triggerType || 'chat'),
                    config: typeof data.config === 'object' && data.config !== null ? data.config : {},
                    targetRootAgentId: data.targetRootAgentId
                });
            } else {
                const rawTools = Array.isArray(data.tools) ? data.tools : [];
                const tools = rawTools.map((t: any) => ({
                    id: String(t.id || ''),
                    name: String(t.name || ''),
                    type: String(t.type || ''),
                    description: t.description
                }));

                const rawSubAgents = Array.isArray(data.subAgents) ? data.subAgents : [];
                const subAgents = rawSubAgents.map((sa: any) => ({
                    agentId: String(sa.agentId || ''),
                    name: String(sa.name || ''),
                    delegationType: sa.delegationType
                }));

                agents.push({
                    id: String(node.id || ''),
                    name: String(data.name || data.label || node.id),
                    label: String(data.label || 'Unnamed Agent'),
                    role: data.role,
                    model: data.model,
                    systemPrompt: data.systemPrompt,
                    tools,
                    subAgents,
                    subAgentPattern: data.subAgentPattern,
                    isStartNode: Boolean(data.isStartNode),
                    outputFormat: data.outputFormat
                });
            }
        }

        const rawEdges = Array.isArray(parsed.edges) ? parsed.edges : [];
        const edges = rawEdges.map((e: any) => ({
            source: String(e.source || ''),
            target: String(e.target || ''),
            sourceHandle: e.sourceHandle,
            targetHandle: e.targetHandle
        }));

        const deployment = parsed.deployment || {};
        const deploymentTarget = deployment.deploymentTarget || deployment.target || 'agent_engine';

        return {
            name: String(parsed.name || 'agent_workflow'),
            version: parsed.version,
            framework: String(parsed.framework || deployment.framework || 'google-adk'),
            language: String(parsed.language || deployment.language || 'python'),
            deploymentTarget: String(deploymentTarget),
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
            agents: [],
            triggers: [],
            edges: []
        };
    }
}

/**
 * Formats a parsed agent specification into a human-readable checklist for the evaluator model.
 *
 * @param spec - Structured ParsedAgentSpec.
 * @returns Formatted checklist string.
 */
export function formatAgentSpecChecklist(spec: ParsedAgentSpec): string {
    const lines: string[] = [];

    lines.push(`Workflow Name: "${spec.name}" (Framework: ${spec.framework}, Language: ${spec.language}, Deployment: ${spec.deploymentTarget})`);
    lines.push(`Total Agent Nodes: ${spec.agents.length}`);

    for (const [idx, agent] of spec.agents.entries()) {
        const startMarker = agent.isStartNode ? ' [START / ROOT NODE]' : '';
        lines.push(`\n[Agent ${idx + 1}] ID: "${agent.id}" | Name: "${agent.name}" | Label: "${agent.label}"${startMarker}`);
        if (agent.model) lines.push(`  Model: ${agent.model}`);
        if (agent.role) lines.push(`  Role: ${agent.role}`);
        if (agent.systemPrompt) lines.push(`  System Prompt: "${agent.systemPrompt}"`);
        if (agent.subAgentPattern) lines.push(`  Sub-Agent Pattern: ${agent.subAgentPattern}`);

        if (agent.tools.length > 0) {
            lines.push(`  Tools (${agent.tools.length}):`);
            for (const t of agent.tools) {
                lines.push(`    - [${t.type}] "${t.name}" (ID: ${t.id})`);
            }
        }

        if (agent.subAgents.length > 0) {
            lines.push(`  Sub-Agents (${agent.subAgents.length}):`);
            for (const sa of agent.subAgents) {
                lines.push(`    - "${sa.name}" (Agent ID: ${sa.agentId})`);
            }
        }
    }

    if (spec.triggers.length > 0) {
        lines.push(`\nTriggers (${spec.triggers.length}):`);
        for (const [idx, tr] of spec.triggers.entries()) {
            lines.push(`\n[Trigger ${idx + 1}] ID: "${tr.id}" | Type: ${tr.triggerType} | Label: "${tr.label}"`);
            if (tr.targetRootAgentId) lines.push(`  Target Root Agent ID: ${tr.targetRootAgentId}`);
            const configKeys = Object.keys(tr.config);
            if (configKeys.length > 0) {
                lines.push(`  Config:`);
                for (const key of configKeys) {
                    lines.push(`    - ${key}: ${JSON.stringify(tr.config[key])}`);
                }
            }
        }
    }

    if (spec.edges.length > 0) {
        lines.push(`\nTopology Edges (${spec.edges.length}):`);
        for (const edge of spec.edges) {
            lines.push(`  - Source "${edge.source}" -> Target "${edge.target}"`);
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
Your responsibility is auditing generated AI Agent code to verify that it FAITHFULLY IMPLEMENTS THE EXACT WORKFLOW DEFINED IN THE .AGENT JSON SPECIFICATION.
You must ensure that ALL declared agent nodes, trigger nodes, system prompts, tools, subagents, test scenarios, and deployment targets are properly incorporated and used.

=== PARSED SPECIFICATION CHECKLIST ===
${checklistText}
======================================

=== FULL INPUT WORKFLOW JSON ===
${workflowJson}
================================

=== GENERATED SOURCE FILES & ARTIFACTS ===
${files.map(f => `--- FILE: ${f.filename} ---\n${f.content}\n`).join('\n')}
=========================================

Audit the code against the following Specification Conformance Checklist:
1. **Agent Node Completeness & Configuration**:
   - Inspect every agent node in the checklist (e.g. Animal Expert, Cat Agent, Fish Agent).
   - Verify that EVERY agent node defined in the JSON is actually declared and wired in \`agent.py\`.
   - Verify that the system prompt / instructions for each agent reflect the \`systemPrompt\` from the JSON.
   - Flag any agent node that was defined in the JSON but is MISSING, SILENTLY OMITTED, or REPLACED with generic placeholders.

2. **Tools & Capabilities Conformance**:
   - Verify that tools assigned to each agent in the JSON (e.g. Google Search Grounding) are attached to the corresponding agent in code.
   - Verify that agents not configured with tools do not have random tools attached.

3. **Trigger Nodes & Test Scenarios Conformance**:
   - If a \`chat\` trigger is defined, is streaming or conversational history supported?
   - If a \`tester\` trigger is defined with \`testPrompts\` / \`testScenarios\`, are those specific test scenarios implemented as assertions or test cases in \`test_agent.py\`?

4. **Deployment Target Conformance**:
   - Does the generated deployment configuration (e.g. \`Dockerfile\`, \`main.tf\`, \`deploy_agent_engine.py\`, or Cloud Run configs) match the \`deploymentTarget\` specified in the JSON?

Severity Guidelines:
- CRITICAL: A defined agent node, system prompt, or declared tool is completely missing from code; test scenarios from tester trigger are completely omitted from test_agent.py.
- MAJOR: A configured parameter (e.g. streaming, model temperature, role) was ignored or replaced with an arbitrary fallback.
- MINOR: Minor wording differences in docstrings or non-blocking comments.`;

    const schema = {
        type: "object",
        properties: {
            passed: {
                type: "boolean",
                description: "True if all configured agent nodes, prompts, tools, and specification requirements are faithfully implemented"
            },
            summary: {
                type: "string",
                description: "Specification conformance assessment summary"
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
        findings: parsed.findings || []
    };
}
