/**
 * Read-Only Check Runner
 *
 * Purpose: Produces real compiler / test-collection / Terraform evidence for the code generation
 * reviewer agent. Generated files are materialized into a throwaway temp directory and inspected
 * with:
 *   1. `python -m py_compile` on every `.py` file (always available when Python is installed).
 *   2. `python -m pytest --collect-only -q` on `test_*.py` (only when `pytest` and `google.adk`
 *      import in that interpreter — otherwise skipped).
 *   3. `terraform init -backend=false` + `terraform validate` (only when `terraform` is on PATH
 *      and `.tf` files exist — otherwise skipped).
 *
 * Architectural decisions / notes for future sessions:
 * - Checks NEVER modify generated code (AGENTS.md: zero procedural post-processing). Their
 *   output is evidence only; the reviewer LLM decides what to fix and the owning agent rewrites.
 * - A missing tool marks the check `skipped` (not failed) so code generation works on machines
 *   without Terraform / a prepared Python environment.
 * - The command executor is injectable so unit tests never spawn real processes.
 *
 * Author: Mike Nimer <mikenimer@google.com>
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFile } from 'child_process';
import type { GeneratedFile } from '../../shared/codegen/types';
import { CODEGEN_LIMITS } from './codegenConfig';

/** Identifiers of the supported checks. */
export const CHECK_IDS = {
  pyCompile: 'py_compile',
  pytestCollect: 'pytest_collect',
  terraformValidate: 'terraform_validate',
} as const;

export type CheckId = (typeof CHECK_IDS)[keyof typeof CHECK_IDS];

/** Outcome of one check. */
export interface CheckResult {
  check: CheckId;
  status: 'passed' | 'failed' | 'skipped';
  /** Truncated combined stdout/stderr (or skip reason). */
  output: string;
}

/** Result of running one command. */
export interface CommandOutcome {
  exitCode: number;
  stdout: string;
  stderr: string;
  /** True when the executable could not be started (e.g. ENOENT). */
  notFound?: boolean;
}

/** Executes a command; injectable for tests. */
export type CommandExecutor = (command: string, args: string[], options: { cwd: string; timeoutMs: number }) => Promise<CommandOutcome>;

/** Default executor backed by `child_process.execFile`. */
export const defaultCommandExecutor: CommandExecutor = (command, args, options) =>
  new Promise((resolve) => {
    execFile(command, args, { cwd: options.cwd, timeout: options.timeoutMs, maxBuffer: 16 * 1024 * 1024 }, (error: any, stdout, stderr) => {
      if (error?.code === 'ENOENT') {
        resolve({ exitCode: -1, stdout: '', stderr: String(error.message), notFound: true });
        return;
      }
      const exitCode = error ? (typeof error.code === 'number' ? error.code : 1) : 0;
      resolve({ exitCode, stdout: String(stdout || ''), stderr: String(stderr || error?.message || '') });
    });
  });

/** Options for the check runner. */
export interface ReadOnlyCheckRunnerOptions {
  /** Python interpreter to use (e.g. the target `.venv/bin/python`). Defaults to `python3`. */
  pythonPath?: string;
  /** Terraform executable. Defaults to `terraform`. */
  terraformPath?: string;
  /** Command executor (tests inject a fake). */
  executor?: CommandExecutor;
}

const DEFAULT_PYTHON = 'python3';
const DEFAULT_TERRAFORM = 'terraform';
const TRUNCATION_MARKER = '\n…[truncated]';

/**
 * Truncates check output to the configured limit.
 *
 * @param text Raw output.
 */
export function truncateCheckOutput(text: string): string {
  const limit = CODEGEN_LIMITS.maxCheckOutputChars;
  return text.length <= limit ? text : text.slice(0, limit) + TRUNCATION_MARKER;
}

/**
 * Runs read-only verification checks over generated files.
 */
export class ReadOnlyCheckRunner {
  private readonly pythonPath: string;
  private readonly terraformPath: string;
  private readonly executor: CommandExecutor;

  constructor(options: ReadOnlyCheckRunnerOptions = {}) {
    this.pythonPath = options.pythonPath || DEFAULT_PYTHON;
    this.terraformPath = options.terraformPath || DEFAULT_TERRAFORM;
    this.executor = options.executor || defaultCommandExecutor;
  }

  /**
   * Materializes files into a temp directory, runs every applicable check, and cleans up.
   *
   * @param files Generated files.
   * @returns One result per check, in a stable order.
   */
  public async run(files: GeneratedFile[]): Promise<CheckResult[]> {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vad-codegen-checks-'));
    try {
      // 1. Materialize the repository snapshot.
      for (const file of files) {
        const target = path.join(workDir, file.path);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, file.content, 'utf-8');
      }

      // 2. Run checks sequentially (they share the temp dir and are cheap relative to LLM calls).
      const pythonFiles = files.map((f) => f.path).filter((p) => p.endsWith('.py'));
      const testFiles = pythonFiles.filter((p) => path.posix.basename(p).startsWith('test_'));
      const hasTerraform = files.some((f) => f.path.endsWith('.tf') && !f.path.includes('/'));

      return [
        await this.runPyCompile(workDir, pythonFiles),
        await this.runPytestCollect(workDir, testFiles),
        await this.runTerraformValidate(workDir, hasTerraform),
      ];
    } finally {
      // 3. Never leave generated code behind on disk.
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  }

  /** Byte-compiles every Python file. */
  private async runPyCompile(cwd: string, pythonFiles: string[]): Promise<CheckResult> {
    if (pythonFiles.length === 0) {
      return { check: CHECK_IDS.pyCompile, status: 'skipped', output: 'No Python files generated.' };
    }
    const outcome = await this.exec(this.pythonPath, ['-m', 'py_compile', ...pythonFiles], cwd);
    if (outcome.notFound) {
      return { check: CHECK_IDS.pyCompile, status: 'skipped', output: `Python interpreter '${this.pythonPath}' not found.` };
    }
    return this.toResult(CHECK_IDS.pyCompile, outcome);
  }

  /** Collects pytest tests when pytest and google-adk are importable. */
  private async runPytestCollect(cwd: string, testFiles: string[]): Promise<CheckResult> {
    if (testFiles.length === 0) {
      return { check: CHECK_IDS.pytestCollect, status: 'skipped', output: 'No test files generated.' };
    }
    // NOTE: Probe first so a bare interpreter without deps is a skip, not a false failure.
    const probe = await this.exec(this.pythonPath, ['-c', 'import pytest, google.adk'], cwd);
    if (probe.notFound || probe.exitCode !== 0) {
      return {
        check: CHECK_IDS.pytestCollect,
        status: 'skipped',
        output: `pytest/google-adk not importable with '${this.pythonPath}'.`,
      };
    }
    const outcome = await this.exec(this.pythonPath, ['-m', 'pytest', '--collect-only', '-q', ...testFiles], cwd);
    return this.toResult(CHECK_IDS.pytestCollect, outcome);
  }

  /** Validates Terraform configuration when terraform is installed. */
  private async runTerraformValidate(cwd: string, hasTerraform: boolean): Promise<CheckResult> {
    if (!hasTerraform) {
      return { check: CHECK_IDS.terraformValidate, status: 'skipped', output: 'No root-level .tf files generated.' };
    }
    const init = await this.exec(this.terraformPath, ['init', '-backend=false', '-input=false', '-no-color'], cwd);
    if (init.notFound) {
      return { check: CHECK_IDS.terraformValidate, status: 'skipped', output: `'${this.terraformPath}' not found on PATH.` };
    }
    if (init.exitCode !== 0) {
      return this.toResult(CHECK_IDS.terraformValidate, init);
    }
    const outcome = await this.exec(this.terraformPath, ['validate', '-no-color'], cwd);
    return this.toResult(CHECK_IDS.terraformValidate, outcome);
  }

  /** Runs one command with the configured timeout. */
  private exec(command: string, args: string[], cwd: string): Promise<CommandOutcome> {
    return this.executor(command, args, { cwd, timeoutMs: CODEGEN_LIMITS.checkTimeoutMs });
  }

  /** Maps a command outcome to a check result. */
  private toResult(check: CheckId, outcome: CommandOutcome): CheckResult {
    const output = truncateCheckOutput([outcome.stdout, outcome.stderr].filter(Boolean).join('\n').trim());
    return { check, status: outcome.exitCode === 0 ? 'passed' : 'failed', output };
  }
}
