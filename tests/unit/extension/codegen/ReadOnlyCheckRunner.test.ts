/**
 * Unit Tests: ReadOnlyCheckRunner (fake executor; no real subprocesses)
 *
 * Author: Mike Nimer <mikenimer@google.com>
 */
import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  CHECK_IDS,
  CommandExecutor,
  ReadOnlyCheckRunner,
  defaultCommandExecutor,
  truncateCheckOutput,
} from '../../../../src/extension/codegen/ReadOnlyCheckRunner';
import { CODEGEN_LIMITS } from '../../../../src/extension/codegen/codegenConfig';

const files = [
  { path: 'agent.py', content: 'root_agent = 1' },
  { path: 'tools/x.py', content: 'def x(): pass' },
  { path: 'test_agent.py', content: 'def test_a(): pass' },
  { path: 'main.tf', content: 'terraform {}' },
];

/** Builds a fake executor from a handler keyed by "<cmd> <first arg>". */
function fakeExecutor(handler: (key: string, args: string[]) => { exitCode: number; stdout?: string; stderr?: string; notFound?: boolean }) {
  const calls: Array<{ command: string; args: string[]; cwd: string }> = [];
  const executor: CommandExecutor = async (command, args, options) => {
    calls.push({ command, args, cwd: options.cwd });
    const result = handler(`${command} ${args[0]}${args[1] ? ' ' + args[1] : ''}`, args);
    return { stdout: '', stderr: '', ...result };
  };
  return { executor, calls };
}

describe('ReadOnlyCheckRunner', () => {
  it('passes all checks and materializes files for the commands', async () => {
    let sawFiles = false;
    const { executor, calls } = fakeExecutor(() => ({ exitCode: 0, stdout: 'ok' }));
    const wrapped: CommandExecutor = async (command, args, options) => {
      sawFiles = fs.existsSync(path.join(options.cwd, 'tools', 'x.py'));
      return executor(command, args, options);
    };
    const results = await new ReadOnlyCheckRunner({ executor: wrapped }).run(files);
    expect(results.map((r) => [r.check, r.status])).toEqual([
      [CHECK_IDS.pyCompile, 'passed'],
      [CHECK_IDS.pytestCollect, 'passed'],
      [CHECK_IDS.terraformValidate, 'passed'],
    ]);
    expect(sawFiles).toBe(true);
    expect(calls[0]).toMatchObject({ command: 'python3', args: ['-m', 'py_compile', 'agent.py', 'tools/x.py', 'test_agent.py'] });
    expect(calls.some((c) => c.args.join(' ') === '-m pytest --collect-only -q test_agent.py')).toBe(true);
    // Temp dir is removed afterwards.
    expect(fs.existsSync(calls[0].cwd)).toBe(false);
  });

  it('reports failures with combined, trimmed output', async () => {
    const { executor } = fakeExecutor((key) =>
      key.startsWith('python3 -m py_compile') ? { exitCode: 1, stdout: '', stderr: 'SyntaxError: bad\n' } : { exitCode: 0 }
    );
    const [pyCompile] = await new ReadOnlyCheckRunner({ executor }).run(files);
    expect(pyCompile).toEqual({ check: 'py_compile', status: 'failed', output: 'SyntaxError: bad' });
  });

  it('skips pytest when pytest/google-adk are not importable', async () => {
    const { executor, calls } = fakeExecutor((key) => (key.startsWith('python3 -c') ? { exitCode: 1 } : { exitCode: 0 }));
    const results = await new ReadOnlyCheckRunner({ executor }).run(files);
    expect(results[1].status).toBe('skipped');
    expect(calls.some((c) => c.args.includes('--collect-only'))).toBe(false);
  });

  it('skips Python checks when the interpreter is missing', async () => {
    const { executor } = fakeExecutor((key) => (key.startsWith('python3') ? { exitCode: -1, notFound: true } : { exitCode: 0 }));
    const results = await new ReadOnlyCheckRunner({ executor }).run(files);
    expect(results[0]).toMatchObject({ status: 'skipped', output: expect.stringContaining('not found') });
    expect(results[1].status).toBe('skipped');
  });

  it('skips terraform when it is not installed and fails when init fails', async () => {
    const missing = fakeExecutor((key) => (key.startsWith('terraform') ? { exitCode: -1, notFound: true } : { exitCode: 0 }));
    expect((await new ReadOnlyCheckRunner({ executor: missing.executor }).run(files))[2].status).toBe('skipped');

    const initFails = fakeExecutor((key) => (key.startsWith('terraform init') ? { exitCode: 1, stderr: 'provider error' } : { exitCode: 0 }));
    const result = (await new ReadOnlyCheckRunner({ executor: initFails.executor }).run(files))[2];
    expect(result).toEqual({ check: 'terraform_validate', status: 'failed', output: 'provider error' });
    expect(initFails.calls.some((c) => c.args[0] === 'validate')).toBe(false);
  });

  it('skips everything when there are no relevant files', async () => {
    const { executor, calls } = fakeExecutor(() => ({ exitCode: 0 }));
    const results = await new ReadOnlyCheckRunner({ executor }).run([{ path: 'README.md', content: '# x' }]);
    expect(results.every((r) => r.status === 'skipped')).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it('ignores .tf files that are not at the repository root', async () => {
    const { executor } = fakeExecutor(() => ({ exitCode: 0 }));
    const results = await new ReadOnlyCheckRunner({ executor }).run([{ path: 'modules/net/main.tf', content: '' }]);
    expect(results[2].status).toBe('skipped');
  });

  it('uses custom python and terraform paths', async () => {
    const { executor, calls } = fakeExecutor(() => ({ exitCode: 0 }));
    await new ReadOnlyCheckRunner({ executor, pythonPath: '/venv/bin/python', terraformPath: '/opt/tf' }).run(files);
    expect(calls.map((c) => c.command)).toEqual(expect.arrayContaining(['/venv/bin/python', '/opt/tf']));
  });

  it('cleans up the temp dir even when the executor throws', async () => {
    let cwd = '';
    const executor: CommandExecutor = async (_c, _a, options) => {
      cwd = options.cwd;
      throw new Error('boom');
    };
    await expect(new ReadOnlyCheckRunner({ executor }).run(files)).rejects.toThrow('boom');
    expect(fs.existsSync(cwd)).toBe(false);
  });
});

describe('truncateCheckOutput', () => {
  it('keeps short output and truncates long output', () => {
    expect(truncateCheckOutput('short')).toBe('short');
    const long = 'x'.repeat(CODEGEN_LIMITS.maxCheckOutputChars + 10);
    const out = truncateCheckOutput(long);
    expect(out.startsWith('x'.repeat(CODEGEN_LIMITS.maxCheckOutputChars))).toBe(true);
    expect(out).toMatch(/\[truncated\]$/);
  });
});

describe('defaultCommandExecutor', () => {
  it('reports notFound for missing executables', async () => {
    const outcome = await defaultCommandExecutor('definitely-not-a-real-binary-xyz', [], { cwd: process.cwd(), timeoutMs: 5000 });
    expect(outcome.notFound).toBe(true);
  });

  it('returns exit codes and output for real commands', async () => {
    const ok = await defaultCommandExecutor(process.execPath, ['-e', 'console.log("hi")'], { cwd: process.cwd(), timeoutMs: 10000 });
    expect(ok).toMatchObject({ exitCode: 0, stdout: 'hi\n' });
    const fail = await defaultCommandExecutor(process.execPath, ['-e', 'process.stderr.write("bad"); process.exit(3)'], { cwd: process.cwd(), timeoutMs: 10000 });
    expect(fail.exitCode).toBe(3);
    expect(fail.stderr).toContain('bad');
  });
});

vi.restoreAllMocks();
