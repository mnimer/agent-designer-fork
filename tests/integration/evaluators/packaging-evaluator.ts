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
import { GeneratedFileCandidate, formatFilesWithLineNumbers } from './deterministic-gate';
import { EVALUATOR_MODEL } from './agent-architecture-evaluator';

/**
 * Runs the Packaging and Deployability Evaluator sub-agent.
 *
 * @param ai - Initialized GoogleGenAI client.
 * @param workflowJson - Original .agent workflow JSON document string.
 * @param files - All generated files.
 * @returns Specialist evaluation result with category 'PACKAGING'.
 */
export async function evaluatePackagingAndDeployability(
    ai: GoogleGenAI,
    workflowJson: string,
    files: GeneratedFileCandidate[]
): Promise<SpecialistAgentResult> {
    const prompt = `You are the Principal Packaging, Build & Runtime Deployability Evaluator Agent.
Your responsibility is auditing AI Agent build descriptors, dependency specifications (requirements.txt), unit tests (test_agent.py), Dockerfiles, and deployment configs for deployment readiness and CI reliability.

=== INPUT WORKFLOW SPECIFICATION (.agent JSON) ===
${workflowJson}
==================================================

=== GENERATED SOURCE FILES & ARTIFACTS (WITH LINE NUMBERS) ===
${formatFilesWithLineNumbers(files)}
=============================================================

Audit the code against the following Packaging & Deployment Checklist:
1. **Dependency Specifications (requirements.txt)**:
   - Is \`google-adk\` (or target framework) declared with valid constraints?
   - Are all third-party imported libraries (e.g. \`google-genai\`, \`pydantic\`, \`httpx\`, \`pytest\`, \`pytest-asyncio\`) included?
   - If memory backends or external services are used in the workflow (e.g. BigQuery, Firestore, Redis, Spanner), are the client SDKs declared (e.g. \`google-cloud-bigquery\`, \`google-cloud-firestore\`)?
   - If A2A agents are used, are \`google-adk[a2a]\` and \`a2a-sdk[http-server]\` present?

2. **Automated Test Suite (test_agent.py) & Offline CI Mocking**:
   - Does \`test_agent.py\` import \`root_agent\` or \`app\` from \`agent.py\`?
   - Are test cases written using \`pytest\` and \`pytest_asyncio\` to test the agent invocation flow?
   - Does \`test_agent.py\` mock external cloud APIs (Vertex AI, BigQuery, Eventarc) so that automated test suites can execute in CI without live cloud credentials?

3. **Container & Deployment Configuration**:
   - If Cloud Run is targeted: does \`server.py\` (FastAPI/Uvicorn) exist and export a web application endpoint?
   - If Vertex AI Agent Engine is targeted: does the deployment script (\`deploy_agent_engine.py\` or container config) match Agent Engine requirements?
   - Does the Dockerfile WORKDIR, COPY instructions, and entrypoint match runtime requirements?
   - If Terraform (\`main.tf\`) or Cloud Build (\`cloudbuild.yaml\`) is generated, is it valid and referencing the correct deployment artifacts?
   - **Terraform Resource Note**: \`google_vertex_ai_reasoning_engine\` IS an official, valid HashiCorp Google provider resource (supported since provider v5.38.0+). Do NOT flag \`google_vertex_ai_reasoning_engine\` as invalid, non-existent, or fictional.

Severity Guidelines:
- CRITICAL: Missing core framework dependencies in requirements.txt (e.g. missing google-adk), invalid test syntax, importing non-existent modules in test_agent.py, or missing entrypoint server.py for Cloud Run.
- MAJOR: Unmocked live cloud calls in unit tests causing CI execution failures, missing pytest dependencies.
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
