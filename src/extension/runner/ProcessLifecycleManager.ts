/**
 * ProcessLifecycleManager
 *
 * Spawns runner subprocesses, registers active processes, listens to output streams,
 * and handles clean process-tree termination.
 *
 * Job inside Application:
 * Ensures child processes are cleanly managed and tracked. On shutdown or cancellation, it
 * guarantees no dangling runner zombie processes are left behind on the host.
 *
 * Architectural Decisions:
 * 1. Process Group Termination: Sends negative PIDs for `process.kill` on non-Windows platforms
 *    to cascade termination to all children spawned by the FastAPI server shell.
 * 2. Windows Taskkill fallback: Executes `taskkill /f /t /pid` to cleanly kill process subtrees on Windows.
 * 3. Graceful termination with timeout: Initiates SIGTERM, wait for a 2-second grace period,
 *    and escalates to SIGKILL if processes remain active.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { ChildProcess, spawn } from 'child_process';

export class ProcessLifecycleManager {
  public activeLocalRunners: Map<string, ChildProcess> = new Map();
  public activeProcesses: Map<string, ChildProcess> = new Map();
  public activeRunnerPortMap: Map<string, number> = new Map();

  /**
   * Spawns a new subprocess with the configured options.
   *
   * @param command Command or executable binary
   * @param args Command line arguments array
   * @param options Process spawning options (cwd, env, detaches, etc.)
   * @returns Spawned ChildProcess
   */
  public spawn(command: string, args: string[], options: any): ChildProcess {
    const proc = spawn(command, args, options);
    return proc;
  }

  /**
   * Register an active process in the tracker.
   *
   * @param id Unique process identifier
   * @param proc The child process to track
   * @param port Optional port number used by the process
   */
  public registerProcess(id: string, proc: ChildProcess, port?: number): void {
    this.activeLocalRunners.set(id, proc);
    this.activeProcesses.set(id, proc);
    if (port !== undefined) {
      this.activeRunnerPortMap.set(id, port);
    }
  }

  /**
   * Unregister a process from trackers.
   *
   * @param id Unique process identifier
   */
  public unregisterProcess(id: string): void {
    this.activeLocalRunners.delete(id);
    this.activeProcesses.delete(id);
    this.activeRunnerPortMap.delete(id);
  }

  /**
   * Gracefully and thoroughly terminates a process tree.
   *
   * @param proc The ChildProcess to terminate
   */
  public async killProcessTree(proc: ChildProcess): Promise<void> {
    const pid = proc.pid;
    if (!pid || pid === process.pid || pid === process.ppid) {
      return;
    }

    if (process.platform === 'win32') {
      try {
        const { exec } = require('child_process');
        exec(`taskkill /f /t /pid ${pid}`);
      } catch {
        proc.kill('SIGKILL');
      }
    } else {
      // Non-Windows: Send SIGTERM to the process group (negative pid) and direct process
      try {
        process.kill(-pid, 'SIGTERM');
      } catch {
        try {
          proc.kill('SIGTERM');
        } catch {}
      }

      const isProcessAlive = (): boolean => {
        try {
          process.kill(-pid, 0);
          return true;
        } catch {
          try {
            process.kill(pid, 0);
            return true;
          } catch {
            return false;
          }
        }
      };

      // Poll every 50ms up to 400ms for graceful exit, then escalate to SIGKILL immediately
      const maxGraceMs = 400;
      const pollIntervalMs = 50;
      let elapsed = 0;

      while (elapsed < maxGraceMs && isProcessAlive()) {
        await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, pollIntervalMs);
          t.unref();
        });
        elapsed += pollIntervalMs;
      }

      if (isProcessAlive()) {
        try {
          process.kill(-pid, 'SIGKILL');
        } catch {}
        try {
          proc.kill('SIGKILL');
        } catch {}
        await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, 50);
          t.unref();
        });
      }
    }
  }
}
