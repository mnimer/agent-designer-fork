/**
 * Unit Tests for Deterministic Pre-Flight Gate.
 *
 * Author: Mike Nimer <mikenimer@google.com>
 *
 * Purpose:
 * Validates deterministic ground-truth verification of generated AI Agent code:
 * - Line numbering formatting for prompt context
 * - Deterministic JSON and Python compilation checks
 * - Credential leakage and plaintext secret scanning
 * - Static AST and cross-file import verification
 */

import { describe, it, expect } from 'vitest';
import {
    formatFilesWithLineNumbers,
    checkJsonSyntax,
    checkPythonSyntax,
    scanForPlaintextSecrets,
    checkPythonAstAndImports,
    runDeterministicGate,
    GeneratedFileCandidate
} from '../../../tests/integration/evaluators/deterministic-gate';

describe('Deterministic Pre-Flight Gate', () => {
    describe('formatFilesWithLineNumbers', () => {
        it('should return an empty string when given no files', () => {
            const formatted = formatFilesWithLineNumbers([]);
            expect(formatted).toBe('');
        });

        it('should format a single file with 1-indexed line numbers and file header', () => {
            const files: GeneratedFileCandidate[] = [
                {
                    filename: 'agent.py',
                    content: 'import os\nfrom google.adk import Agent\n\nroot_agent = Agent(name="main")'
                }
            ];
            const formatted = formatFilesWithLineNumbers(files);
            expect(formatted).toContain('--- FILE: agent.py ---');
            expect(formatted).toContain('1: import os');
            expect(formatted).toContain('2: from google.adk import Agent');
            expect(formatted).toContain('3: ');
            expect(formatted).toContain('4: root_agent = Agent(name="main")');
        });

        it('should format multiple files sequentially', () => {
            const files: GeneratedFileCandidate[] = [
                { filename: 'file1.txt', content: 'line 1\nline 2' },
                { filename: 'file2.txt', content: 'hello' }
            ];
            const formatted = formatFilesWithLineNumbers(files);
            expect(formatted).toContain('--- FILE: file1.txt ---');
            expect(formatted).toContain('--- FILE: file2.txt ---');
            expect(formatted).toContain('1: line 1');
            expect(formatted).toContain('2: line 2');
            expect(formatted).toContain('1: hello');
        });
    });

    describe('checkJsonSyntax', () => {
        it('should return null for valid JSON content', () => {
            expect(checkJsonSyntax('config.json', '{"status": "ok", "retries": 3}')).toBeNull();
            expect(checkJsonSyntax('list.json', '[1, 2, 3]')).toBeNull();
            expect(checkJsonSyntax('empty.json', '{}')).toBeNull();
        });

        it('should return an error message containing filename for malformed JSON', () => {
            const error = checkJsonSyntax('broken.json', '{"unclosed": ');
            expect(error).not.toBeNull();
            expect(error).toContain('Malformed JSON in broken.json');
        });
    });

    describe('checkPythonSyntax', () => {
        it('should return null for syntactically valid Python code', async () => {
            const validPy = 'def greet(name: str) -> str:\n    return f"Hello, {name}!"\n';
            const error = await checkPythonSyntax('valid.py', validPy);
            expect(error).toBeNull();
        });

        it('should return an error message for Python syntax errors', async () => {
            const brokenPy = 'def broken_func(:\n    pass\n';
            const error = await checkPythonSyntax('broken.py', brokenPy);
            expect(error).not.toBeNull();
            expect(error).toContain('Python syntax check failed for broken.py');
        });
    });

    describe('scanForPlaintextSecrets', () => {
        const dummyAwsKey = ['AK', 'IA1234567890ABCDEF'].join('');
        const dummyGcpKey = ['AIza', 'SyD-1234567890123456789012345678901'].join('');
        const dummyOauthSecret = ['GOC', 'SPX-abcdefghijklmnopqrstuvwx1234'].join('');
        const dummyPat = ['gh', 'p_123456789012345678901234567890123456'].join('');
        const dummyPrivKey = ['-----BEGIN ', 'RSA PRIVATE KEY-----'].join('');

        it('should detect hardcoded AWS access keys', () => {
            const files: GeneratedFileCandidate[] = [
                { filename: 'config.py', content: `AWS_KEY = "${dummyAwsKey}"` }
            ];
            const findings = scanForPlaintextSecrets(files);
            expect(findings.length).toBe(1);
            expect(findings[0].category).toBe('SECURITY');
            expect(findings[0].severity).toBe('CRITICAL');
            expect(findings[0].id).toContain('SEC-AWS-KEY');
            expect(findings[0].file).toBe('config.py');
            expect(findings[0].lineNumber).toBe(1);
        });

        it('should detect hardcoded Google API keys', () => {
            const files: GeneratedFileCandidate[] = [
                { filename: 'client.py', content: `api_key = "${dummyGcpKey}"` }
            ];
            const findings = scanForPlaintextSecrets(files);
            expect(findings.length).toBe(1);
            expect(findings[0].id).toContain('SEC-GCP-API-KEY');
        });

        it('should detect hardcoded Google OAuth client secrets', () => {
            const files: GeneratedFileCandidate[] = [
                { filename: 'auth.py', content: `client_secret = "${dummyOauthSecret}"` }
            ];
            const findings = scanForPlaintextSecrets(files);
            expect(findings.length).toBe(1);
            expect(findings[0].id).toContain('SEC-GCP-OAUTH-SECRET');
        });

        it('should detect hardcoded GitHub Personal Access Tokens', () => {
            const files: GeneratedFileCandidate[] = [
                { filename: 'ci.py', content: `pat = "${dummyPat}"` }
            ];
            const findings = scanForPlaintextSecrets(files);
            expect(findings.length).toBe(1);
            expect(findings[0].id).toContain('SEC-GITHUB-PAT');
        });

        it('should detect private cryptographic keys', () => {
            const files: GeneratedFileCandidate[] = [
                { filename: 'cert.py', content: `key = "${dummyPrivKey}\\nMIIEow..."` }
            ];
            const findings = scanForPlaintextSecrets(files);
            expect(findings.length).toBe(1);
            expect(findings[0].id).toContain('SEC-PRIV-KEY');
        });

        it('should detect plaintext token assignments using both equals and colon syntax', () => {
            const files: GeneratedFileCandidate[] = [
                {
                    filename: 'settings.py',
                    content: 'line_one = 1\npassword = "supersecretproductionpassword123"\n'
                },
                {
                    filename: 'manifest.yaml',
                    content: 'credentials:\n  token: "myunredactedtokenstring456"\n'
                }
            ];
            const findings = scanForPlaintextSecrets(files);
            expect(findings.length).toBe(2);
            expect(findings.some(f => f.file === 'settings.py' && f.lineNumber === 2)).toBe(true);
            expect(findings.some(f => f.file === 'manifest.yaml' && f.lineNumber === 2)).toBe(true);
        });

        it('should ignore template placeholders and environment variable references', () => {
            const files: GeneratedFileCandidate[] = [
                {
                    filename: 'safe.py',
                    content: [
                        'api_key = os.getenv("GEMINI_API_KEY")',
                        'token = "${MY_SECRET_TOKEN}"',
                        'secret = "YOUR_API_KEY_HERE"',
                        'password = "REPLACE_ME"',
                        'test_key = "mock_token_123456"'
                    ].join('\n')
                }
            ];
            const findings = scanForPlaintextSecrets(files);
            expect(findings.length).toBe(0);
        });

        it('should ignore test files and example files', () => {
            const files: GeneratedFileCandidate[] = [
                { filename: 'test_agent.py', content: `api_key = "${dummyAwsKey}"` },
                { filename: 'agent.test.ts', content: `token = "${dummyPat}"` },
                { filename: '.env.example', content: `API_KEY="${dummyGcpKey}"` },
                { filename: 'README.md', content: dummyOauthSecret }
            ];
            const findings = scanForPlaintextSecrets(files);
            expect(findings.length).toBe(0);
        });
    });

    describe('checkPythonAstAndImports', () => {
        it('should pass when agent.py defines root_agent and imports are valid', () => {
            const files: GeneratedFileCandidate[] = [
                {
                    filename: 'agent.py',
                    content: 'from tools.calc import add\nfrom google.adk import Agent\n\nroot_agent = Agent(name="main_agent")'
                },
                {
                    filename: 'tools/calc.py',
                    content: 'def add(a: int, b: int) -> int:\n    return a + b\n'
                },
                {
                    filename: 'requirements.txt',
                    content: 'google-adk>=0.1.0\n'
                }
            ];
            const findings = checkPythonAstAndImports(files);
            expect(findings.length).toBe(0);
        });

        it('should flag a CRITICAL finding when agent.py is missing root_agent', () => {
            const files: GeneratedFileCandidate[] = [
                {
                    filename: 'agent.py',
                    content: 'import os\n# Missing root_agent export\n'
                }
            ];
            const findings = checkPythonAstAndImports(files);
            expect(findings.some(f => f.id === 'AST-MISSING-ROOT-AGENT' && f.severity === 'CRITICAL')).toBe(true);
        });

        it('should flag a CRITICAL finding when agent name contains invalid characters (spaces or hyphens)', () => {
            const files: GeneratedFileCandidate[] = [
                {
                    filename: 'agent.py',
                    content: 'from google.adk import Agent\nroot_agent = Agent(name="my-invalid agent")'
                }
            ];
            const findings = checkPythonAstAndImports(files);
            expect(findings.some(f => f.id.includes('AST-INVALID-AGENT-NAME') && f.severity === 'CRITICAL')).toBe(true);
        });

        it('should flag a CRITICAL finding when a local module import does not resolve to any generated file', () => {
            const files: GeneratedFileCandidate[] = [
                {
                    filename: 'agent.py',
                    content: 'from tools.non_existent_tool import my_tool\nroot_agent = None\n'
                }
            ];
            const findings = checkPythonAstAndImports(files);
            expect(findings.some(f => f.id.includes('AST-BROKEN-LOCAL-IMPORT-tools.non_existent_tool'))).toBe(true);
        });

        it('should flag a MAJOR finding when third-party module is imported but omitted from requirements.txt', () => {
            const files: GeneratedFileCandidate[] = [
                {
                    filename: 'agent.py',
                    content: 'import google.cloud.bigquery\nroot_agent = True\n'
                },
                {
                    filename: 'requirements.txt',
                    content: 'google-adk\npydantic\n'
                }
            ];
            const findings = checkPythonAstAndImports(files);
            expect(findings.some(f => f.id === 'AST-MISSING-DEPENDENCY-google-cloud-bigquery' && f.severity === 'MAJOR')).toBe(true);
        });

        it('should NOT flag a missing dependency when a third-party module name is only mentioned in comments or docstrings', () => {
            const files: GeneratedFileCandidate[] = [
                {
                    filename: 'session_store.py',
                    content: '"""Supports google.cloud.spanner and google.cloud.firestore backends when configured."""\n# Optional google.cloud.spanner checkpointer\n'
                },
                {
                    filename: 'agent.py',
                    content: 'from google.adk import Agent\nroot_agent = Agent(name="clean_agent")\n'
                },
                {
                    filename: 'requirements.txt',
                    content: 'google-adk\n'
                }
            ];
            const findings = checkPythonAstAndImports(files);
            expect(findings.some(f => f.id === 'AST-MISSING-DEPENDENCY-google-cloud-spanner')).toBe(false);
            expect(findings.some(f => f.id === 'AST-MISSING-DEPENDENCY-google-cloud-firestore')).toBe(false);
        });

        it('should flag a CRITICAL finding when an output_key state variable is interpolated as bare {key} without trailing ? or state.setdefault', () => {
            const unsafeFiles: GeneratedFileCandidate[] = [
                {
                    filename: 'agent.py',
                    content: [
                        'from google.adk.agents import Agent, LoopAgent',
                        'algorithm_generator = Agent(name="algorithm_generator", instruction="Previous Feedback: {evaluation_feedback}", output_key="candidate_code")',
                        'benchmark_evaluator = Agent(name="benchmark_evaluator", instruction="Code: {candidate_code?}", output_key="evaluation_feedback")',
                        'root_agent = LoopAgent(name="loop", sub_agents=[algorithm_generator, benchmark_evaluator], max_iterations=4)'
                    ].join('\n')
                }
            ];
            const unsafeFindings = checkPythonAstAndImports(unsafeFiles);
            expect(unsafeFindings.some(f => f.id === 'AST-UNSAFE-STATE-INTERPOLATION-evaluation_feedback' && f.severity === 'CRITICAL')).toBe(true);
            expect(unsafeFindings.some(f => f.id === 'AST-UNSAFE-STATE-INTERPOLATION-candidate_code')).toBe(false);
        });

        it('should flag a CRITICAL finding when a custom BaseAgent subclass assigns self.<attr> without extra="allow" or before super().__init__()', () => {
            const missingExtraFiles: GeneratedFileCandidate[] = [
                {
                    filename: 'agent.py',
                    content: [
                        'from google.adk.agents import BaseAgent',
                        'class FinancialServicesRouter(BaseAgent):',
                        '    def __init__(self, name: str = "router", fraud_agent=None):',
                        '        super().__init__(name=name)',
                        '        self.fraud_agent = fraud_agent',
                        'root_agent = FinancialServicesRouter()'
                    ].join('\n')
                }
            ];
            const findings1 = checkPythonAstAndImports(missingExtraFiles);
            expect(findings1.some(f => f.id === 'AST-BASEAGENT-PYDANTIC-CONFIG-FinancialServicesRouter' && f.severity === 'CRITICAL')).toBe(true);

            const badOrderFiles: GeneratedFileCandidate[] = [
                {
                    filename: 'agent.py',
                    content: [
                        'from google.adk.agents import BaseAgent',
                        'from pydantic import ConfigDict',
                        'class FinancialServicesRouter(BaseAgent):',
                        '    model_config = ConfigDict(arbitrary_types_allowed=True, extra="allow")',
                        '    def __init__(self, name: str = "router", fraud_agent=None):',
                        '        self.fraud_agent = fraud_agent',
                        '        super().__init__(name=name)',
                        'root_agent = FinancialServicesRouter()'
                    ].join('\n')
                }
            ];
            const findings2 = checkPythonAstAndImports(badOrderFiles);
            expect(findings2.some(f => f.id === 'AST-BASEAGENT-SUPER-INIT-ORDER-FinancialServicesRouter' && f.severity === 'CRITICAL')).toBe(true);
        });
    });

    describe('runDeterministicGate', () => {
        it('should return all passed when files are clean and valid', async () => {
            const files: GeneratedFileCandidate[] = [
                {
                    filename: 'agent.py',
                    content: 'from google.adk import Agent\nroot_agent = Agent(name="coordinator")\n'
                },
                {
                    filename: 'manifest.json',
                    content: '{"name": "test-agent", "version": "1.0.0"}'
                },
                {
                    filename: 'requirements.txt',
                    content: 'google-adk>=0.1.0\n'
                }
            ];
            const result = await runDeterministicGate(files, 'python');
            expect(result.syntaxValid).toBe(true);
            expect(result.syntaxErrors.length).toBe(0);
            expect(result.secretScanPassed).toBe(true);
            expect(result.secretFindings.length).toBe(0);
            expect(result.astCheckPassed).toBe(true);
            expect(result.astFindings.length).toBe(0);
        });

        it('should aggregate syntax errors, secret leaks, and AST defects', async () => {
            const files: GeneratedFileCandidate[] = [
                {
                    filename: 'agent.py',
                    content: 'def broken(:\n    pass\n'
                },
                {
                    filename: 'config.json',
                    content: '{"unclosed": '
                },
                {
                    filename: 'secrets.py',
                    content: `API_KEY = "${['AK', 'IA1234567890ABCDEF'].join('')}"\n`
                }
            ];
            const result = await runDeterministicGate(files, 'python');
            expect(result.syntaxValid).toBe(false);
            expect(result.syntaxErrors.length).toBeGreaterThanOrEqual(2);
            expect(result.secretScanPassed).toBe(false);
            expect(result.secretFindings.length).toBeGreaterThanOrEqual(1);
            expect(result.astCheckPassed).toBe(false);
        });

        it('should skip python compilation when target language is typescript', async () => {
            const files: GeneratedFileCandidate[] = [
                {
                    filename: 'package.json',
                    content: '{"name": "ts-agent"}'
                }
            ];
            const result = await runDeterministicGate(files, 'typescript');
            expect(result.syntaxValid).toBe(true);
            expect(result.astCheckPassed).toBe(true);
        });
    });
});
