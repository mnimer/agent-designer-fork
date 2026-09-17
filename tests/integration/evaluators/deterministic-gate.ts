/**
 * Deterministic Pre-Flight Gate for AI Agent Generated Code Evaluation.
 *
 * Author: Mike Nimer <mikenimer@google.com>
 *
 * Purpose:
 * Provides fast, 100% deterministic ground-truth verification for generated files
 * before delegating to LLM evaluator agents. This prevents LLM hallucination on
 * basic syntax validity or obvious credential leaks.
 *
 * Architectural decisions:
 * - Checks Python files using the host python3 interpreter via `python3 -m py_compile`.
 *   If python3 encounters a SyntaxError, it reports the exact line and error message.
 * - Scans all generated files (agent.py, server.py, test_agent.py, Dockerfile, main.tf, etc.)
 *   against strict regex patterns for plaintext secrets (AWS keys, Google API keys,
 *   RSA private keys, hardcoded bearer tokens, database passwords).
 * - Findings from this gate are tagged with severity 'CRITICAL' to automatically trigger
 *   hard vetoes in the Arbiter.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFile } from 'child_process';
import { DeterministicGateResult, EvaluatorFinding } from './types';

export interface GeneratedFileCandidate {
    filename: string;
    content: string;
    executable?: boolean;
}

/**
 * Executes python3 -m py_compile on a python source file string.
 *
 * @param filename - Relative or display filename.
 * @param content - Python source code.
 * @returns Error string if syntax error, or null if valid.
 */
export function checkPythonSyntax(filename: string, content: string): Promise<string | null> {
    return new Promise((resolve) => {
        // NOTE: Create temporary file in os tmpdir to run py_compile safely
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-eval-py-'));
        const safeBaseName = path.basename(filename) || 'agent.py';
        const tmpFile = path.join(tmpDir, safeBaseName);

        try {
            fs.writeFileSync(tmpFile, content, 'utf-8');
            execFile('python3', ['-m', 'py_compile', tmpFile], { timeout: 10000 }, (err, _stdout, stderr) => {
                // Cleanup temp dir
                try {
                    fs.rmSync(tmpDir, { recursive: true, force: true });
                } catch {
                    // Ignore temp cleanup errors
                }

                if (err) {
                    const message = stderr.trim() || err.message;
                    resolve(`Python syntax check failed for ${filename}: ${message}`);
                } else {
                    resolve(null);
                }
            });
        } catch (writeErr: any) {
            try {
                fs.rmSync(tmpDir, { recursive: true, force: true });
            } catch {
                // Ignore temp cleanup errors
            }
            resolve(`Could not verify python syntax due to I/O error: ${writeErr.message}`);
        }
    });
}

/**
 * Scans generated files for credential leaks or plaintext secrets.
 *
 * @param files - All generated files in the payload.
 * @returns Array of security findings.
 */
export function scanForPlaintextSecrets(files: GeneratedFileCandidate[]): EvaluatorFinding[] {
    const findings: EvaluatorFinding[] = [];

    const secretPatterns: { regex: RegExp; description: string; ruleId: string }[] = [
        {
            regex: /AKIA[0-9A-Z]{16}/,
            description: 'Hardcoded AWS Access Key ID detected',
            ruleId: 'SEC-AWS-KEY'
        },
        {
            regex: /-----BEGIN\s+(?:[A-Z0-9_-]+\s+)*PRIVATE\s+KEY-----/,
            description: 'Hardcoded Private Cryptographic Key detected',
            ruleId: 'SEC-PRIV-KEY'
        },
        {
            regex: /AIzaSy[0-9A-Za-z_-]{33}/,
            description: 'Hardcoded Google API Key detected',
            ruleId: 'SEC-GCP-API-KEY'
        },
        {
            regex: /(?:password|secret|api_key|token)\s*=\s*["'](?!(\$\{|\$|%s|<|YOUR_|os\.getenv|env\[))([^\s"'`]{8,})["']/i,
            description: 'Potential hardcoded secret or token assignment detected',
            ruleId: 'SEC-HARDCODED-TOKEN'
        }
    ];

    for (const file of files) {
        // Skip .env.example or template comments
        if (file.filename.includes('.example') || file.filename.endsWith('.md')) {
            continue;
        }

        for (const pattern of secretPatterns) {
            const match = pattern.regex.exec(file.content);
            if (match) {
                findings.push({
                    id: `${pattern.ruleId}-${file.filename}`,
                    category: 'SECURITY',
                    severity: 'CRITICAL',
                    file: file.filename,
                    description: pattern.description,
                    rationale: `Found match '${match[0].substring(0, 15)}...' which indicates a plaintext secret committed into code or artifacts.`
                });
            }
        }
    }

    return findings;
}

/**
 * Runs the deterministic pre-flight gate across all generated files.
 *
 * @param files - All generated files.
 * @param language - Target language ('python' | 'typescript').
 * @returns Combined deterministic gate result.
 */
export async function runDeterministicGate(
    files: GeneratedFileCandidate[],
    language: string = 'python'
): Promise<DeterministicGateResult> {
    const syntaxErrors: string[] = [];

    if (language.toLowerCase() === 'python') {
        const pyFiles = files.filter(f => f.filename.endsWith('.py'));
        for (const pyFile of pyFiles) {
            const err = await checkPythonSyntax(pyFile.filename, pyFile.content);
            if (err) {
                syntaxErrors.push(err);
            }
        }
    }

    const secretFindings = scanForPlaintextSecrets(files);

    return {
        syntaxValid: syntaxErrors.length === 0,
        syntaxErrors,
        secretScanPassed: secretFindings.length === 0,
        secretFindings
    };
}
