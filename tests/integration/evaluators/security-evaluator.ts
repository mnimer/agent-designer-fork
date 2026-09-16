/**
 * Security and Container Hardening Evaluator Sub-Agent.
 *
 * Author: Mike Nimer <mikenimer@google.com>
 *
 * Purpose:
 * Audits generated AI Agent code, Dockerfiles, server endpoints, and deployment
 * scripts for security vulnerabilities, credential leakage, container hardening,
 * and least-privilege best practices.
 *
 * Architectural decisions:
 * - Checks for secret leakage prevention (Application Default Credentials, Secret Manager, os.getenv).
 * - Enforces least-privilege container execution (non-root Docker users) and build context filtering.
 * - Enforces safe shell variable expansion in deployment scripts to prevent command injection.
 */

import { GoogleGenAI } from '@google/genai';
import { SpecialistAgentResult } from './types';
import { GeneratedFileCandidate } from './deterministic-gate';
import { EVALUATOR_MODEL } from './agent-architecture-evaluator';

/**
 * Runs the Security and Hardening Evaluator sub-agent.
 *
 * @param ai - Initialized GoogleGenAI client.
 * @param files - All generated files.
 * @returns Specialist evaluation result with category 'SECURITY'.
 */
export async function evaluateSecurityAndHardening(
    ai: GoogleGenAI,
    files: GeneratedFileCandidate[]
): Promise<SpecialistAgentResult> {
    const prompt = `You are the Principal Security & Container Hardening Evaluator Agent.
Your responsibility is auditing generated AI Agent code, server endpoints, Dockerfiles, and deployment scripts for security compliance, credential safety, and container hardening.

=== GENERATED SOURCE FILES & ARTIFACTS ===
${files.map(f => `--- FILE: ${f.filename} ---\n${f.content}\n`).join('\n')}
=========================================

Audit the code against the following Security Checklist:
1. **Secret & Credential Management**:
   - Are API keys, OAuth tokens, and database credentials resolved dynamically via environment variables (\`os.getenv\`), Application Default Credentials (\`google.auth.default()\`), or Secret Manager?
   - Verify there are NO hardcoded API keys, cleartext passwords, or unredacted bearer tokens.
2. **Container & Dockerfile Hardening**:
   - Does the Dockerfile create and run under a non-root user (e.g. \`USER appuser\` or non-root UID)?
   - Are sensitive build contexts and logs excluded in \`.gcloudignore\` or \`.dockerignore\`?
3. **Shell Script Quoting & Command Safety**:
   - In any shell scripts or deployment scripts, are all shell variables quoted properly (e.g. \`"\${PROJECT_ID}"\`, \`"\${REGION}"\`) to prevent shell injection or word-splitting?
4. **Tool Execution & Input Sanitization**:
   - Do custom tool functions avoid unsafe \`eval()\`, unvalidated \`exec()\`, or raw unsanitized shell commands?

Severity Guidelines:
- CRITICAL: Plaintext API keys or tokens in code/scripts, shell command injection vectors, running containers as root with broad capabilities.
- MAJOR: Unquoted shell variables in deployment scripts, missing .dockerignore / .gcloudignore.
- MINOR: Non-pinned base image tags in Dockerfile.`;

    const schema = {
        type: "object",
        properties: {
            passed: {
                type: "boolean",
                description: "True if no CRITICAL or blocking security issues are detected"
            },
            summary: {
                type: "string",
                description: "Security evaluation summary"
            },
            findings: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        id: { type: "string" },
                        category: { type: "string", enum: ["SECURITY"] },
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
        throw new Error('Empty response from SecurityAndHardeningAgent');
    }

    const parsed = JSON.parse(response.text);
    return {
        agentName: 'SecurityAndHardeningAgent',
        passed: parsed.passed,
        summary: parsed.summary,
        findings: parsed.findings || []
    };
}
