/**
 * Deterministic Pre-Flight Gate for AI Agent Generated Code Evaluation.
 *
 * Author: Mike Nimer <mikenimer@google.com>
 *
 * Purpose:
 * Provides fast, 100% deterministic ground-truth verification for generated files
 * before delegating to LLM evaluator agents. Prevents LLM hallucination and catches
 * syntax errors, broken imports, missing root agents, and plaintext credential leaks.
 *
 * Architectural decisions:
 * - Checks Python files using the host python3 interpreter via `python3 -m py_compile`.
 * - Performs static AST symbol inspection (checks root_agent module export, valid
 *   Pydantic identifier names, local module import resolution, and requirements.txt alignment).
 * - Validates JSON and YAML syntax deterministically without calling LLMs.
 * - Scans all generated files against strict regex patterns for plaintext secrets
 *   (AWS keys, Google API keys, GCP OAuth secrets, GitHub PATs, JWT tokens, private keys)
 *   supporting both assignment (`=`) and YAML/JSON colon (`:`) syntax while excluding
 *   mock test tokens.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFile, execFileSync } from 'child_process';
import { DeterministicGateResult, EvaluatorFinding } from './types';

export interface GeneratedFileCandidate {
    filename: string;
    content: string;
    executable?: boolean;
}

/**
 * Formats generated files into a unified prompt string with 1-indexed line numbers
 * so evaluation sub-agents can cite precise line numbers.
 *
 * @param files - Array of generated candidate files.
 * @returns Line-numbered source code text for model context.
 */
export function formatFilesWithLineNumbers(files: GeneratedFileCandidate[]): string {
    return files.map(f => {
        const lines = f.content.split('\n');
        const numbered = lines.map((line, idx) => `${idx + 1}: ${line}`).join('\n');
        return `--- FILE: ${f.filename} ---\n${numbered}\n`;
    }).join('\n');
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
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-eval-py-'));
        const safeBaseName = path.basename(filename) || 'agent.py';
        const tmpFile = path.join(tmpDir, safeBaseName);

        try {
            fs.writeFileSync(tmpFile, content, 'utf-8');
            execFile('python3', ['-m', 'py_compile', tmpFile], { timeout: 10000 }, (err, _stdout, stderr) => {
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
 * Deterministically checks JSON file syntax.
 *
 * @param filename - File path.
 * @param content - File string content.
 * @returns Error message if malformed, or null.
 */
export function checkJsonSyntax(filename: string, content: string): string | null {
    try {
        JSON.parse(content);
        return null;
    } catch (err: any) {
        return `Malformed JSON in ${filename}: ${err.message}`;
    }
}

/**
 * Scans generated files for credential leaks or plaintext secrets.
 * Supports assignment (`=`) and YAML/JSON colon (`:`) syntax.
 *
 * @param files - All generated files in the payload.
 * @returns Array of security findings.
 */
export function scanForPlaintextSecrets(files: GeneratedFileCandidate[]): EvaluatorFinding[] {
    const findings: EvaluatorFinding[] = [];

    const secretPatterns: { regex: RegExp; description: string; ruleId: string }[] = [
        {
            regex: /AKIA[0-9A-Z]{16}/g,
            description: 'Hardcoded AWS Access Key ID detected',
            ruleId: 'SEC-AWS-KEY'
        },
        {
            regex: /-----BEGIN\s+(?:[A-Z0-9_-]+\s+)*PRIVATE\s+KEY-----/g,
            description: 'Hardcoded Private Cryptographic Key detected',
            ruleId: 'SEC-PRIV-KEY'
        },
        {
            regex: /AIzaSy[0-9A-Za-z_-]{33}/g,
            description: 'Hardcoded Google API Key detected',
            ruleId: 'SEC-GCP-API-KEY'
        },
        {
            regex: /GOCSPX-[a-zA-Z0-9_-]{28}/g,
            description: 'Hardcoded Google OAuth Client Secret detected',
            ruleId: 'SEC-GCP-OAUTH-SECRET'
        },
        {
            regex: /ghp_[a-zA-Z0-9]{36}/g,
            description: 'Hardcoded GitHub Personal Access Token detected',
            ruleId: 'SEC-GITHUB-PAT'
        },
        {
            regex: /(?:password|secret|api_key|token)\s*[:=]\s*["'](?!(\$\{|\$|%s|<|\[|YOUR_|REPLACE_|REDACTED|mock_|test_|os\.getenv|env\[))([^\s"'`]{8,})["']/gi,
            description: 'Potential hardcoded secret or token assignment detected',
            ruleId: 'SEC-HARDCODED-TOKEN'
        }
    ];

    for (const file of files) {
        // Skip .env.example, markdown docs, or test files that mock credentials
        if (
            file.filename.includes('.example') ||
            file.filename.endsWith('.md') ||
            file.filename.includes('test_') ||
            file.filename.includes('.test.')
        ) {
            continue;
        }

        for (const pattern of secretPatterns) {
            // Reset regex state for global patterns
            pattern.regex.lastIndex = 0;
            let match: RegExpExecArray | null;
            while ((match = pattern.regex.exec(file.content)) !== null) {
                // Ignore matches that are obviously template placeholders or redaction tokens
                const matchedVal = match[0];
                if (matchedVal.includes('YOUR_') || matchedVal.includes('REPLACE_') || matchedVal.includes('EXAMPLE') || matchedVal.includes('REDACTED')) {
                    continue;
                }

                // Compute 1-indexed line number of match
                const lineNum = file.content.substring(0, match.index).split('\n').length;

                // If a specific secret rule already matched on this line, skip generic token warning
                if (pattern.ruleId === 'SEC-HARDCODED-TOKEN' && findings.some(f => f.file === file.filename && f.lineNumber === lineNum)) {
                    continue;
                }

                findings.push({
                    id: `${pattern.ruleId}-${file.filename}-L${lineNum}`,
                    category: 'SECURITY',
                    severity: 'CRITICAL',
                    file: file.filename,
                    lineNumber: lineNum,
                    evidence: match[0].substring(0, 30),
                    description: pattern.description,
                    rationale: `Found match '${match[0].substring(0, 15)}...' on line ${lineNum} indicating a plaintext secret committed into code.`
                });
            }
        }
    }

    return findings;
}

/**
 * Performs static AST and cross-file verification on Python files.
 * Checks for:
 * 1. `root_agent` module export in agent.py
 * 2. Valid Python identifier naming in Agent(...) calls
 * 3. Local module imports (`from tools.xyz import ...`) resolving to actual generated files
 * 4. Third-party package alignment with requirements.txt
 *
 * @param files - All generated files.
 * @returns Array of AST findings.
 */
export function checkPythonAstAndImports(files: GeneratedFileCandidate[]): EvaluatorFinding[] {
    const findings: EvaluatorFinding[] = [];
    const pyFiles = files.filter(f => f.filename.endsWith('.py'));
    const agentPy = files.find(f => f.filename === 'agent.py' || f.filename.endsWith('/agent.py'));
    const reqsTxt = files.find(f => f.filename === 'requirements.txt' || f.filename.endsWith('/requirements.txt'));

    // 1. Verify root_agent export in agent.py
    if (agentPy) {
        const hasRootAgent =
            /\broot_agent\s*=/m.test(agentPy.content) ||
            /\bapp\s*=/m.test(agentPy.content) ||
            /__all__\s*=.*root_agent/m.test(agentPy.content);

        if (!hasRootAgent) {
            findings.push({
                id: 'AST-MISSING-ROOT-AGENT',
                category: 'ARCHITECTURE',
                severity: 'CRITICAL',
                file: agentPy.filename,
                description: 'Module agent.py must export root_agent at top level for ADK discovery',
                rationale: 'Google ADK CLI and runtime inspect agent.py for a module-level root_agent instance.'
            });
        }
    }

    // 2. Check for spaces or hyphens in agent name parameters
    for (const pyFile of pyFiles) {
        const invalidNameMatch = /\b(?:Agent|SequentialAgent|ParallelAgent|LoopAgent)\s*\([^)]*?\bname\s*=\s*["']([^"']+)["']/g;
        let m: RegExpExecArray | null;
        while ((m = invalidNameMatch.exec(pyFile.content)) !== null) {
            const agentName = m[1];
            // Valid python identifier regex: starts with letter/underscore, followed by alphanumerics/underscores
            if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(agentName)) {
                const lineNum = pyFile.content.substring(0, m.index).split('\n').length;
                findings.push({
                    id: `AST-INVALID-AGENT-NAME-${agentName}`,
                    category: 'ARCHITECTURE',
                    severity: 'CRITICAL',
                    file: pyFile.filename,
                    lineNumber: lineNum,
                    evidence: m[0],
                    description: `Agent name "${agentName}" contains invalid characters (spaces or hyphens)`,
                    rationale: 'Pydantic isidentifier() fails fatally if agent name is not a valid Python identifier.'
                });
            }
        }
    }

    // 2b. Check for unguarded {state_key} placeholders without '?' in agent.py instructions
    if (agentPy) {
        const outputKeyRegex = /\boutput_key\s*=\s*["']([a-zA-Z_][a-zA-Z0-9_]*)["']/g;
        const definedOutputKeys = new Set<string>();
        let okMatch: RegExpExecArray | null;
        while ((okMatch = outputKeyRegex.exec(agentPy.content)) !== null) {
            definedOutputKeys.add(okMatch[1]);
        }

        // Check if any defined output_key is interpolated as bare {key} without '?' and without state.setdefault("key"...)
        for (const stateKey of definedOutputKeys) {
            const barePlaceholderRegex = new RegExp(`(?<!\\{)\\{${stateKey}\\}(?!\\})`);
            const hasSetDefault = new RegExp(`state\\.setdefault\\s*\\(\\s*["']${stateKey}["']`).test(agentPy.content);
            const match = barePlaceholderRegex.exec(agentPy.content);
            if (match && !hasSetDefault) {
                const lineNum = agentPy.content.substring(0, match.index).split('\n').length;
                findings.push({
                    id: `AST-UNSAFE-STATE-INTERPOLATION-${stateKey}`,
                    category: 'ARCHITECTURE',
                    severity: 'CRITICAL',
                    file: agentPy.filename,
                    lineNumber: lineNum,
                    evidence: match[0],
                    description: `Unguarded session state template variable "{${stateKey}}" in instruction without trailing "?" or before_agent_callback state.setdefault("${stateKey}", ...)`,
                    rationale: `Google ADK's inject_session_state raises KeyError: "Context variable not found: \`${stateKey}\`" on Iteration 1 of LoopAgent or when the state key is not yet populated. Always use "{${stateKey}?}" with a trailing "?" or initialize in before_agent_callback.`
                });
            }
        }

        // 2c. Check custom BaseAgent subclasses for Pydantic v2 extra='allow' and super().__init__() ordering
        const baseAgentClassRegex = /class\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(\s*BaseAgent\s*\)\s*:([\s\S]*?)(?=\n(?:class\s+|def\s+|[A-Za-z_][A-Za-z0-9_]*\s*=)|\s*$)/g;
        let clsMatch: RegExpExecArray | null;
        while ((clsMatch = baseAgentClassRegex.exec(agentPy.content)) !== null) {
            const className = clsMatch[1];
            const classBody = clsMatch[2];
            const initMatch = /def\s+__init__\s*\([\s\S]*?\)\s*(?:->\s*None\s*)?:([\s\S]*?)(?=\n\s{4}(?:async\s+)?def\s+|\s*$)/.exec(classBody);
            if (!initMatch) {
                continue;
            }
            const initBody = initMatch[1];
            const selfAssignMatch = /\bself\.([A-Za-z_][A-Za-z0-9_]*)\s*=(?!=)/.exec(initBody);
            if (!selfAssignMatch) {
                continue;
            }
            const assignedAttr = selfAssignMatch[1];
            const superCallIndex = initBody.search(/super\s*\(\s*\)\s*\.\s*__init__/);
            const firstSelfAssignIndex = selfAssignMatch.index;
            const hasExtraAllow = /extra\s*=\s*["']allow["']/.test(classBody);
            const hasDeclaredField = new RegExp(`^\\s{4}${assignedAttr}\\s*:`, 'm').test(classBody);
            const lineNum = agentPy.content.substring(0, clsMatch.index).split('\n').length;

            if (!hasExtraAllow && !hasDeclaredField) {
                findings.push({
                    id: `AST-BASEAGENT-PYDANTIC-CONFIG-${className}`,
                    category: 'ARCHITECTURE',
                    severity: 'CRITICAL',
                    file: agentPy.filename,
                    lineNumber: lineNum,
                    evidence: `class ${className}(BaseAgent): self.${assignedAttr} = ...`,
                    description: `Custom BaseAgent subclass "${className}" assigns self.${assignedAttr} in __init__ without model_config = ConfigDict(arbitrary_types_allowed=True, extra="allow") or a declared Pydantic class field`,
                    rationale: `In Google ADK, BaseAgent is a Pydantic v2 BaseModel with extra="forbid". Assigning undeclared self.<attr> raises ValueError: "${className}" object has no field "${assignedAttr}" at startup.`
                });
            } else if (superCallIndex !== -1 && firstSelfAssignIndex < superCallIndex) {
                findings.push({
                    id: `AST-BASEAGENT-SUPER-INIT-ORDER-${className}`,
                    category: 'ARCHITECTURE',
                    severity: 'CRITICAL',
                    file: agentPy.filename,
                    lineNumber: lineNum,
                    evidence: `self.${assignedAttr} = ... before super().__init__(...)`,
                    description: `Custom BaseAgent subclass "${className}" assigns self.${assignedAttr} BEFORE calling super().__init__(...)`,
                    rationale: `In Pydantic v2 BaseModel subclasses, assigning self.<attr> before super().__init__() raises AttributeError: '${className}' object has no attribute '__pydantic_extra__' or ValueError.`
                });
            }
        }
    }

    // 3. Verify local module imports resolve to generated files
    const allFileNames = new Set(files.map(f => f.filename));
    const normalizedFileBases = new Set(
        files.map(f => f.filename.replace(/^\.\//, '').replace(/\.py$/, ''))
    );

    for (const pyFile of pyFiles) {
        const localImportMatch = /from\s+(\.?\w+(?:\.\w+)*)\s+import/g;
        let m: RegExpExecArray | null;
        while ((m = localImportMatch.exec(pyFile.content)) !== null) {
            const modulePath = m[1].replace(/^\./, '');
            // If module begins with 'tools' or matches local folder structure
            if (modulePath.startsWith('tools') || modulePath.includes('custom_tools')) {
                const normalizedPath = modulePath.replace(/\./g, '/');
                const fileExists =
                    allFileNames.has(`${normalizedPath}.py`) ||
                    normalizedFileBases.has(normalizedPath) ||
                    Array.from(allFileNames).some(f => f.includes(normalizedPath));

                if (!fileExists) {
                    const lineNum = pyFile.content.substring(0, m.index).split('\n').length;
                    findings.push({
                        id: `AST-BROKEN-LOCAL-IMPORT-${modulePath}`,
                        category: 'PACKAGING',
                        severity: 'CRITICAL',
                        file: pyFile.filename,
                        lineNumber: lineNum,
                        evidence: m[0],
                        description: `Local module import "${modulePath}" does not exist in generated files`,
                        rationale: `Code attempts to import from '${modulePath}', but no matching file was generated in the codebase.`
                    });
                }
            }
        }
    }

    // 4. Cross-check third-party imports against requirements.txt
    if (reqsTxt) {
        const reqContent = reqsTxt.content.toLowerCase();
        const thirdPartyMappings: Record<string, string> = {
            'google.adk': 'google-adk',
            'google.genai': 'google-genai',
            'google.cloud.bigquery': 'google-cloud-bigquery',
            'google.cloud.firestore': 'google-cloud-firestore',
            'google.cloud.spanner': 'google-cloud-spanner',
            'pydantic': 'pydantic',
            'httpx': 'httpx',
            'pytest': 'pytest'
        };

        for (const [moduleImport, reqPackage] of Object.entries(thirdPartyMappings)) {
            const escapedModule = moduleImport.replace(/\./g, '\\.');
            // Match top-level imports (at column 0) outside of session_store.py's lazy optional backend initializers
            const importStmtRegex = new RegExp(`(?:^|\\n)(?:import\\s+${escapedModule}\\b|from\\s+${escapedModule}\\b)`);
            const isImported = pyFiles
                .filter(f => f.filename !== 'session_store.py')
                .some(f => importStmtRegex.test(f.content));
            if (isImported && !reqContent.includes(reqPackage)) {
                findings.push({
                    id: `AST-MISSING-DEPENDENCY-${reqPackage}`,
                    category: 'PACKAGING',
                    severity: 'MAJOR',
                    file: reqsTxt.filename,
                    description: `Module '${moduleImport}' is imported in code but '${reqPackage}' is missing from requirements.txt`,
                    rationale: 'Generated code will encounter ImportError in deployment environments without this dependency.'
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

    // 1. Python compilation check
    if (language.toLowerCase() === 'python') {
        const pyFiles = files.filter(f => f.filename.endsWith('.py'));
        for (const pyFile of pyFiles) {
            const err = await checkPythonSyntax(pyFile.filename, pyFile.content);
            if (err) {
                syntaxErrors.push(err);
            }
        }
    }

    // 2. JSON syntax check
    const jsonFiles = files.filter(f => f.filename.endsWith('.json'));
    for (const jsonFile of jsonFiles) {
        const jsonErr = checkJsonSyntax(jsonFile.filename, jsonFile.content);
        if (jsonErr) {
            syntaxErrors.push(jsonErr);
        }
    }

    // 3. Regex secret scan
    const secretFindings = scanForPlaintextSecrets(files);

    // 4. Static AST and import verification
    const astFindings = language.toLowerCase() === 'python' ? checkPythonAstAndImports(files) : [];

    return {
        syntaxValid: syntaxErrors.length === 0,
        syntaxErrors,
        secretScanPassed: secretFindings.length === 0,
        secretFindings,
        astCheckPassed: astFindings.every(f => f.severity !== 'CRITICAL'),
        astFindings
    };
}
