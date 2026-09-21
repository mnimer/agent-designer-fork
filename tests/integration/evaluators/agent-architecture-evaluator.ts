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
import { GeneratedFileCandidate, formatFilesWithLineNumbers } from './deterministic-gate';

export const EVALUATOR_MODEL = process.env.EVALUATOR_MODEL || 'gemini-3.8-flash';

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

=== GENERATED SOURCE FILES (WITH LINE NUMBERS) ===
${formatFilesWithLineNumbers(files)}
==================================================

Audit the code against the following Agent Architecture Invariants:
1. **Multi-Agent Topology & ADK Orchestration**:
   - Are agents instantiated using official Google ADK classes (\`Agent\`, \`SequentialAgent\`, \`ParallelAgent\`, \`LoopAgent\`, \`RemoteA2aAgent\`)?
   - Is \`root_agent\` properly exported at module level in \`agent.py\`?
   - Are composite agent delegation patterns matched correctly to the workflow (e.g. \`ParallelAgent\` for concurrent subagents, \`SequentialAgent\` for sequential pipelines)?
   - Are agents instantiated directly as top-level module variables rather than subclassing \`Agent\` or overriding private framework methods?

2. **Agent Identifier & Pydantic Naming Constraints**:
   - Does EVERY \`name\` passed to \`Agent\`, \`SequentialAgent\`, \`ParallelAgent\`, etc. follow valid Python identifiers (lowercase snake_case with letters, digits, and underscores, e.g. \`animal_expert\`, \`cat_agent\`, \`fish_agent\`)?
   - Flag any agent name containing spaces or hyphens (e.g. \`name="Cat Agent"\`), as this causes fatal Pydantic \`isidentifier()\` validation failures.

3. **Inter-Agent State Flow & Data Handoff**:
   - When sub-agents output structured findings, does the parent coordinator/root agent read them via \`output_key\`, runner state, or session history?
   - In \`LoopAgent\` iterative loops, is there an explicit termination condition or max iteration bound to prevent runaway cycles?

4. **LLM Model & Global Region Configuration**:
   - Is \`gemini-3.8-flash\` or \`gemini-3.7-flash\` (or configured model) used? Are deprecated models (1.x, 2.x, \`gemini-2.5-flash\`, \`gemini-flash-latest\`) strictly avoided?
   - Is Vertex AI configured with the \`global\` location (e.g. \`os.environ["GOOGLE_CLOUD_LOCATION"] = "global"\` or \`client_kwargs={"location": "global"}\`)?

5. **Tools & Search Grounding Constraints**:
   - If Google Search Grounding is used alongside subagents or multiple tools, does it instantiate \`GoogleSearchTool(bypass_multi_tools_limit=True)\`?
   - If Google Search Grounding is used, verify it is NOT combined with \`output_schema\` on the same agent (state writing to \`output_key\` must be used instead).
   - Are custom tool functions declared with typed parameters and descriptive docstrings for ADK reflection?

6. **App & Resumability Instantiation**:
   - Is \`App\` imported directly from \`google.adk.apps\` (e.g. \`from google.adk.apps import App, ResumabilityConfig\`)?
   - Is \`App\` instantiated without forbidden extra kwargs (such as \`description=\`)?

Severity Guidelines:
- CRITICAL: Missing root_agent, invalid agent names with spaces/hyphens that break Pydantic validation, deprecated models, GoogleSearchTool without bypass_multi_tools_limit when subagents exist, combining search tool with output_schema on same agent, infinite loops without termination conditions.
- MAJOR: Missing global location configuration for Vertex AI, subclassing Agent instead of functional composition, untyped tool parameters causing ADK runtime crashes.
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
