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
import { GeneratedFileCandidate, formatFilesWithLineNumbers } from './deterministic-gate';

export const SECURITY_EVALUATOR_MODEL = process.env.SECURITY_EVALUATOR_MODEL || 'gemini-3.8-flash-cyber';
export const SECURITY_FALLBACK_MODEL = process.env.EVALUATOR_MODEL || 'gemini-3.8-flash';

/**
 * Runs the Security and Hardening Evaluator sub-agent using Gemini 3.8 Flash Cyber.
 *
 * @param ai - Initialized GoogleGenAI client.
 * @param workflowJson - Original .agent workflow JSON document string.
 * @param files - All generated files.
 * @param modelOverride - Optional model identifier override.
 * @returns Specialist evaluation result with category 'SECURITY'.
 */
export async function evaluateSecurityAndHardening(
    ai: GoogleGenAI,
    workflowJson: string,
    files: GeneratedFileCandidate[],
    modelOverride?: string
): Promise<SpecialistAgentResult> {
    const prompt = `You are the Principal Security, Vulnerability & Cloud Hardening Evaluator Agent.
Your responsibility is auditing generated AI Agent code, server endpoints, Dockerfiles, Terraform manifests, and deployment scripts for security compliance, credential safety, and container hardening.

=== INPUT WORKFLOW SPECIFICATION (.agent JSON) ===
${workflowJson}
==================================================

=== GENERATED SOURCE FILES & ARTIFACTS (WITH LINE NUMBERS) ===
${formatFilesWithLineNumbers(files)}
=============================================================

Audit the code against the following Comprehensive Security & Hardening Checklist:
1. **Secret & Credential Management**:
   - Are API keys, OAuth tokens, and database credentials resolved dynamically via environment variables (\`os.getenv\`), Application Default Credentials (\`google.auth.default()\`), or Secret Manager?
   - Verify there are NO hardcoded API keys, cleartext passwords, or unredacted bearer tokens.

2. **CWE-89 (SQL / BigQuery Injection in Custom Tools)**:
   - When tools query BigQuery or SQL databases (e.g. \`triage_query_tool\`, \`incident_query_tool\`), verify they use parameterized queries (\`bigquery.ScalarQueryParameter\`, \`ArrayQueryParameter\`, or ORM parameterization).
   - Flag any raw f-string or format string concatenation (e.g. \`f"SELECT ... WHERE host = '{host}'"\`) as a CRITICAL SQL injection vulnerability.

3. **Agentic Excessive Agency & Human-in-the-Loop (HITL) Enforcement**:
   - If destructive containment or remediation actions exist in the workflow (e.g. host isolation, IP blocking, account revocation), verify they enforce human approval gates (\`requires_approval: true\` / HITL check) before execution.

4. **CWE-918 (Server-Side Request Forgery - SSRF) & Network Timeouts**:
   - In custom REST/HTTP tools or A2A clients, verify explicit request timeouts are configured (\`timeout=...\`).
   - Flag unvalidated outbound HTTP calls that could target internal network endpoints or Cloud Metadata IP (\`169.254.169.254\`).

5. **Prompt Injection & External Untrusted Input Delimitation**:
   - Verify external alert inputs, Eventarc payloads, and user messages are passed as structured parameters rather than unescaped format strings directly into system instructions.

6. **Container & Dockerfile Hardening**:
   - Does the Dockerfile create and run under a non-root user (e.g. \`USER appuser\` or non-root UID)?
   - Are sensitive build contexts and logs excluded in \`.gcloudignore\` or \`.dockerignore\`?

7. **Shell Script Quoting & Command Safety**:
   - In any shell scripts or deployment scripts, are all shell variables quoted properly (e.g. \`"\${PROJECT_ID}"\`, \`"\${REGION}"\`) to prevent shell injection or word-splitting?

8. **Terraform & Infrastructure IAM Least Privilege**:
   - If \`main.tf\` is generated, verify that IAM role bindings grant least-privilege roles (e.g. \`roles/aiplatform.user\`, \`roles/bigquery.dataViewer\`) rather than broad primitive roles (\`roles/owner\`, \`roles/editor\`).

Severity Guidelines:
- CRITICAL: Plaintext secrets/keys in code, SQL/BigQuery injection via string interpolation, executing destructive actions without HITL approval, running containers as root with broad capabilities.
- MAJOR: Missing network timeouts on external HTTP tool calls, unquoted shell variables in deployment scripts, missing .dockerignore / .gcloudignore.
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

    const targetModel = modelOverride || SECURITY_EVALUATOR_MODEL;

    let response;
    try {
        response = await ai.models.generateContent({
            model: targetModel,
            contents: prompt,
            config: {
                temperature: 0.1,
                responseMimeType: 'application/json',
                responseSchema: schema
            }
        });
    } catch (err: any) {
        // Graceful fallback if gemini-3.8-flash-cyber is not allowlisted in current GCP project
        const errMsg = String(err?.message || err);
        const isAccessDenied = errMsg.includes('403') || errMsg.includes('404') || errMsg.includes('PERMISSION_DENIED') || errMsg.includes('NOT_FOUND');
        if (isAccessDenied && targetModel === 'gemini-3.8-flash-cyber') {
            console.warn(`   [SecurityEvaluator] ⚠️ gemini-3.8-flash-cyber access restricted. Falling back to ${SECURITY_FALLBACK_MODEL}...`);
            response = await ai.models.generateContent({
                model: SECURITY_FALLBACK_MODEL,
                contents: prompt,
                config: {
                    temperature: 0.1,
                    responseMimeType: 'application/json',
                    responseSchema: schema
                }
            });
        } else {
            throw err;
        }
    }

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
