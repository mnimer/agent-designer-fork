/**
 * Agent Architecture Evaluator Sub-Agent.
 *
 * Author: Mike Nimer <mikenimer@google.com>
 *
 * Purpose:
 * Audits generated AI Agent code against multi-agent topology invariants, Google ADK
 * framework rules, model configuration standards, and tool delegation constraints.
 *
 * Architectural decisions:
 * - Focuses strictly on Agent topology and runtime contracts:
 *   1. Root & sub-agent wiring, delegation patterns (sequential, parallel, loop).
 *   2. Strict snake_case identifier rules for agent names (Pydantic isidentifier validation).
 *   3. Gemini 3.7 Flash model configuration with global Vertex AI location.
 *   4. GoogleSearchTool bypass_multi_tools_limit=True when subagents/tools are present.
 *   5. App and resumability instantiation without illegal parameters.
 */

import { GoogleGenAI } from '@google/genai';
import { SpecialistAgentResult } from './types';
import { GeneratedFileCandidate } from './deterministic-gate';

export const EVALUATOR_MODEL = 'gemini-3.7-flash';

/**
 * Runs the Agent Architecture Evaluator sub-agent.
 *
 * @param ai - Initialized GoogleGenAI client.
 * @param workflowJson - Original .agent workflow JSON document string.
 * @param files - All generated files.
 * @returns Specialist evaluation result with category 'ARCHITECTURE'.
 */
export async function evaluateAgentArchitecture(
    ai: GoogleGenAI,
    workflowJson: string,
    files: GeneratedFileCandidate[]
): Promise<SpecialistAgentResult> {
    const prompt = `You are the Principal Agent Architecture Evaluator Agent.
Your responsibility is auditing generated AI Agent code for strict multi-agent topology fidelity, Google ADK SDK compliance, and Vertex AI runtime best practices.

=== INPUT WORKFLOW SPECIFICATION (.agent JSON) ===
${workflowJson}
==================================================

=== GENERATED SOURCE FILES ===
${files.map(f => `--- FILE: ${f.filename} ---\n${f.content}\n`).join('\n')}
===============================

Audit the code against the following Agent Architecture Invariants:
1. **Multi-Agent Topology & ADK Orchestration**:
   - Are agents instantiated using official Google ADK classes (\`Agent\`, \`SequentialAgent\`, \`ParallelAgent\`, \`LoopAgent\`, \`RemoteA2aAgent\`)?
   - Is \`root_agent\` properly exported at module level in \`agent.py\`?
   - Are composite agent delegation patterns matched correctly to the workflow (e.g. \`ParallelAgent\` for concurrent subagents, \`SequentialAgent\` for sequential pipelines)?
   - Are agents instantiated directly as top-level module variables rather than subclassing \`Agent\` or overriding private framework methods?

2. **Agent Identifier & Pydantic Naming Constraints**:
   - Does EVERY \`name\` passed to \`Agent\`, \`SequentialAgent\`, \`ParallelAgent\`, etc. follow valid Python identifiers (lowercase snake_case with letters, digits, and underscores, e.g. \`animal_expert\`, \`cat_agent\`, \`fish_agent\`)?
   - Flag any agent name containing spaces or hyphens (e.g. \`name="Cat Agent"\`), as this causes fatal Pydantic \`isidentifier()\` validation failures.

3. **LLM Model & Global Region Configuration**:
   - Is \`gemini-3.7-flash\` (or configured model) used? Are deprecated models (1.x, 2.x, \`gemini-2.5-flash\`, \`gemini-flash-latest\`) strictly avoided?
   - Is Vertex AI configured with the \`global\` location (e.g. \`os.environ["GOOGLE_CLOUD_LOCATION"] = "global"\` or \`client_kwargs={"location": "global"}\`)?

4. **Tools & Search Grounding Constraints**:
   - If Google Search Grounding is used alongside subagents or multiple tools, does it instantiate \`GoogleSearchTool(bypass_multi_tools_limit=True)\`?
   - If Google Search Grounding is used, verify it is NOT combined with \`output_schema\` on the same agent (state writing to \`output_key\` must be used instead).

5. **App & Resumability Instantiation**:
   - Is \`App\` imported directly from \`google.adk.apps\` (e.g. \`from google.adk.apps import App, ResumabilityConfig\`)?
   - Is \`App\` instantiated without forbidden extra kwargs (such as \`description=\`)?

Severity Guidelines:
- CRITICAL: Missing root_agent, invalid agent names with spaces/hyphens that break Pydantic validation, deprecated models, GoogleSearchTool without bypass_multi_tools_limit when subagents exist, combining search tool with output_schema on same agent.
- MAJOR: Missing global location configuration for Vertex AI, subclassing Agent instead of functional composition.
- MINOR: Stylistic naming differences or non-standard comments.`;

    const schema = {
        type: "object",
        properties: {
            passed: {
                type: "boolean",
                description: "True if no CRITICAL or blocking architectural flaws are found"
            },
            summary: {
                type: "string",
                description: "Executive architectural assessment summary"
            },
            findings: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        id: { type: "string" },
                        category: { type: "string", enum: ["ARCHITECTURE", "IDIOMATIC_ADK"] },
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
        throw new Error('Empty response from AgentArchitectureAgent');
    }

    const parsed = JSON.parse(response.text);
    return {
        agentName: 'AgentArchitectureAgent',
        passed: parsed.passed,
        summary: parsed.summary,
        findings: parsed.findings || []
    };
}
