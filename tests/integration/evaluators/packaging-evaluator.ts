/**
 * Packaging, Dependency, and Deployability Evaluator Sub-Agent.
 *
 * Author: Mike Nimer <mikenimer@google.com>
 *
 * Purpose:
 * Audits generated dependency manifests (requirements.txt), container entrypoints,
 * test suites (test_agent.py), Terraform manifests (main.tf), and Cloud Build
 * configurations to ensure realistic deployability and packaging integrity.
 *
 * Architectural decisions:
 * - Checks dependency coherence (e.g. google-adk, google-genai, pytest, pytest-asyncio).
 * - Verifies that test_agent.py is well-formed with executable assertions.
 * - Checks that deployment target files (Dockerfile, main.tf, cloudbuild.yaml) align
 *   with the requested target.
 */

import { GoogleGenAI } from '@google/genai';
import { SpecialistAgentResult } from './types';
import { GeneratedFileCandidate } from './deterministic-gate';
import { EVALUATOR_MODEL } from './agent-architecture-evaluator';

/**
 * Runs the Packaging and Deployability Evaluator sub-agent.
 *
 * @param ai - Initialized GoogleGenAI client.
 * @param files - All generated files.
 * @returns Specialist evaluation result with category 'PACKAGING'.
 */
export async function evaluatePackagingAndDeployability(
    ai: GoogleGenAI,
    files: GeneratedFileCandidate[]
): Promise<SpecialistAgentResult> {
    const prompt = `You are the Principal Packaging & Runtime Deployability Evaluator Agent.
Your responsibility is auditing AI Agent build descriptors, dependency specifications (requirements.txt), unit tests (test_agent.py), Dockerfiles, and deployment configs for deployment readiness.

=== GENERATED SOURCE FILES & ARTIFACTS ===
${files.map(f => `--- FILE: ${f.filename} ---\n${f.content}\n`).join('\n')}
=========================================

Audit the code against the following Packaging & Deployment Checklist:
1. **Dependency Specifications (requirements.txt)**:
   - Is \`google-adk\` (or target framework) declared?
   - Are all third-party imported libraries (e.g. \`google-genai\`, \`pydantic\`, \`httpx\`, \`pytest\`, \`pytest-asyncio\`) included with realistic version constraints?
   - If A2A agents are used, are \`google-adk[a2a]\` and \`a2a-sdk[http-server]\` present?
2. **Automated Test Suite (test_agent.py)**:
   - Does \`test_agent.py\` import \`root_agent\` or \`app\` from \`agent.py\`?
   - Are test cases written using \`pytest\` and \`pytest_asyncio\` to test the agent invocation flow?
3. **Container & Deployment Configuration**:
   - Does the Dockerfile WORKDIR and entrypoint match the runtime requirements?
   - If Terraform (\`main.tf\`) or Cloud Build (\`cloudbuild.yaml\`) is generated, is it valid and referencing the correct deployment artifacts?

Severity Guidelines:
- CRITICAL: Missing core framework dependencies in requirements.txt (e.g. missing google-adk), invalid test syntax or importing non-existent modules in test_agent.py.
- MAJOR: Incomplete test scenarios, missing pytest dependencies.
- MINOR: Non-pinned minor package versions or missing docstrings in test files.`;

    const schema = {
        type: "object",
        properties: {
            passed: {
                type: "boolean",
                description: "True if packaging and dependencies are valid and deployable"
            },
            summary: {
                type: "string",
                description: "Packaging assessment summary"
            },
            findings: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        id: { type: "string" },
                        category: { type: "string", enum: ["PACKAGING", "SYNTAX"] },
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
        throw new Error('Empty response from PackagingAndDeployabilityAgent');
    }

    const parsed = JSON.parse(response.text);
    return {
        agentName: 'PackagingAndDeployabilityAgent',
        passed: parsed.passed,
        summary: parsed.summary,
        findings: parsed.findings || []
    };
}
