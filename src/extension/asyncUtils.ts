/**
 * asyncUtils Module
 *
 * Job & Purpose:
 * Provides robust, non-blocking asynchronous process execution wrappers for the VS Code extension host.
 * This ensures that subprocesses can be executed without freezing the main IDE thread, while enforcing
 * strict timeouts and supporting cancellation via AbortSignal.
 *
 * Architectural Decisions:
 * 1. Shell-free execution: By default, child_process.execFile is executed with shell: false to avoid shell injection.
 * 2. Specialized default timeouts:
 *    - Binary probes (e.g. which, where, gcloud config/auth print-access-token): 5 seconds.
 *    - Package installation/updating (e.g. pip, npm, yarn, poetry, uv, pipx): 30 seconds.
 *    - General-purpose commands: 10 seconds.
 * 3. Guaranteed Process Reclamation: Upon timeout or AbortSignal cancellation, processes are forcefully
 *    terminated with SIGTERM, cascading to SIGKILL after a 1-second timeout fallback.
 * 4. Structured Error Hierarchy: Differentiates execution, timeout, and cancellation failures.
 *
 * Author: Mike Nimer <mikenimer@google.com>
 */

import * as child_process from 'node:child_process';
import type { ChildProcess } from 'node:child_process';

/**
 * Options configuration for execFileAsync.
 */
export interface ExecFileOptionsWithTimeout {
  /**
   * Custom timeout in milliseconds. If omitted, a context-aware default is used.
   */
  timeoutMs?: number;
  /**
   * Optional AbortSignal to trigger process cancellation.
   */
  signal?: AbortSignal;
  /**
   * Current working directory for the subprocess.
   */
  cwd?: string;
  /**
   * Custom environment variables.
   */
  env?: NodeJS.ProcessEnv;
}

/**
 * Successful subprocess execution payload.
 */
export interface ExecFileResult {
  stdout: string;
  stderr: string;
}

/**
 * Base custom error for process failures.
 */
export class ProcessError extends Error {
  public stdout: string;
  public stderr: string;

  constructor(message: string, stdout: string, stderr: string) {
    super(message);
    this.stdout = stdout;
    this.stderr = stderr;
  }
}

/**
 * Thrown when a subprocess execution exceeds its configured timeout duration.
 */
export class ProcessTimeoutError extends ProcessError {
  constructor(message: string, stdout: string, stderr: string) {
    super(message, stdout, stderr);
    this.name = 'ProcessTimeoutError';
  }
}

/**
 * Thrown when a subprocess is cancelled via its AbortSignal.
 */
export class ProcessCancellationError extends ProcessError {
  constructor(message: string, stdout: string, stderr: string) {
    super(message, stdout, stderr);
    this.name = 'ProcessCancellationError';
  }
}

/**
 * Thrown when a subprocess returns a non-zero exit code or fails to start.
 */
export class ProcessExecutionError extends ProcessError {
  public code?: string | number;
  public signal?: string;

  constructor(
    message: string,
    stdout: string,
    stderr: string,
    code?: string | number,
    signal?: string
  ) {
    super(message, stdout, stderr);
    this.name = 'ProcessExecutionError';
    this.code = code;
    this.signal = signal;
  }
}

/**
 * Infers a suitable default timeout (in milliseconds) based on the binary and arguments.
 *
 * - Binary probes: 5 seconds.
 * - Package managers and installers: 30 seconds.
 * - All other commands: 10 seconds.
 */
function getDefaultTimeoutMs(file: string, args: string[]): number {
  const fileLower = file.toLowerCase();
  const argsStr = args.join(' ').toLowerCase();

  // Package installers/managers
  if (
    fileLower.includes('pip') ||
    fileLower.includes('npm') ||
    fileLower.includes('yarn') ||
    fileLower.includes('poetry') ||
    fileLower.includes('uv') ||
    fileLower.includes('pipx') ||
    argsStr.includes('install') ||
    argsStr.includes('upgrade')
  ) {
    return 30000;
  }

  // Binary probes & fast queries
  if (
    fileLower === 'which' ||
    fileLower === 'where' ||
    argsStr.includes('get-value') ||
    argsStr.includes('print-access-token') ||
    argsStr.includes('--version') ||
    argsStr.includes('-v')
  ) {
    return 5000;
  }

  return 10000;
}

/**
 * Asynchronously executes a file with arguments in a shell-free subprocess.
 *
 * Handles timeouts, AbortSignal cancellations, and forces child process cleanup defensively.
 *
 * @param file Path to the executable binary or command.
 * @param args Array of arguments.
 * @param options ExecFile configuration options.
 */
export function execFileAsync(
  file: string,
  args: string[],
  options?: ExecFileOptionsWithTimeout
): Promise<ExecFileResult> {
  const timeoutMs = options?.timeoutMs ?? getDefaultTimeoutMs(file, args);
  const signal = options?.signal;
  const cwd = options?.cwd;
  const env = options?.env;

  return new Promise<ExecFileResult>((resolve, reject) => {
    let resolved = false;
    let stdoutBuffer = '';
    let stderrBuffer = '';

    // Spawn child process without a shell wrapper to prevent command injection
    const child = child_process.execFile(file, args, {
      cwd,
      env,
      shell: false,
    });

    const cleanupAndKill = (reason: 'timeout' | 'cancelled') => {
      if (resolved) return;
      resolved = true;

      // Forcefully terminate child process tree safely
      try {
        child.kill('SIGTERM');
        // Unref-ed fallback timer to escalate to SIGKILL if SIGTERM fails
        setTimeout(() => {
          try {
            if (!child.killed) {
              child.kill('SIGKILL');
            }
          } catch {
            // Ignore failure to escalate kill
          }
        }, 1000).unref();
      } catch {
        // Ignore initial kill failure
      }

      if (reason === 'timeout') {
        reject(
          new ProcessTimeoutError(
            `Process execution timed out after ${timeoutMs}ms: ${file} ${args.join(' ')}`,
            stdoutBuffer,
            stderrBuffer
          )
        );
      } else {
        reject(
          new ProcessCancellationError(
            `Process execution cancelled: ${file} ${args.join(' ')}`,
            stdoutBuffer,
            stderrBuffer
          )
        );
      }
    };

    // Subprocess timeout timer
    let timer: NodeJS.Timeout | null = null;
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        timer = null;
        cleanupAndKill('timeout');
      }, timeoutMs);
    }

    // AbortSignal listener setup
    const onAbort = () => {
      cleanupAndKill('cancelled');
    };

    if (signal) {
      if (signal.aborted) {
        cleanupAndKill('cancelled');
        return;
      }
      signal.addEventListener('abort', onAbort);
    }

    // Capture standard output streams
    if (child.stdout) {
      child.stdout.on('data', (data) => {
        stdoutBuffer += data.toString();
      });
    }

    if (child.stderr) {
      child.stderr.on('data', (data) => {
        stderrBuffer += data.toString();
      });
    }

    // Process close callback
    child.on('close', (code, childSignal) => {
      if (resolved) return;
      resolved = true;

      if (timer) {
        clearTimeout(timer);
      }
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }

      if (code === 0) {
        resolve({ stdout: stdoutBuffer, stderr: stderrBuffer });
      } else {
        const errorMsg = `Command failed with exit code ${code ?? 'unknown'}${childSignal ? ` and signal ${childSignal}` : ''}: ${file} ${args.join(' ')}\nStderr: ${stderrBuffer}`;
        reject(
          new ProcessExecutionError(
            errorMsg,
            stdoutBuffer,
            stderrBuffer,
            code ?? undefined,
            childSignal ?? undefined
          )
        );
      }
    });

    // Handle process spawn/start failures
    child.on('error', (err: any) => {
      if (resolved) return;
      resolved = true;

      if (timer) {
        clearTimeout(timer);
      }
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }

      reject(
        new ProcessExecutionError(
          err?.message || String(err),
          stdoutBuffer,
          stderrBuffer,
          err?.code,
          err?.signal
        )
      );
    });
  });
}
