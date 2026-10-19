/**
 * RunnerEnvironment
 *
 * Manages port allocations, environment variable sanitization, and TCP port clearing
 * across operating systems (macOS, Linux, Windows).
 *
 * Job inside Application:
 * Ensures the execution environment is sanitized before launching agent processes. It dynamically
 * handles candidate port selection and frees occupied ports so local servers can spin up reliably.
 *
 * Architectural Decisions:
 * 1. Port Allocation candidates: Defensively searches candidate ports (preferred, last-used, 8000, 8080)
 *    to find already active ones.
 * 2. Cross-platform Port Clearing (killPort): Safely invokes lsof (macOS/Linux) or Powershell/netstat
 *    (Windows) to terminate processes running on a specific port, protecting current/parent VS Code processes.
 * 3. Environment Sanitization: Sanitizes execution variables, handles empty GEMINI_API_KEY settings by forcing
 *    Vertex AI ADC activation, auto-discovers GCP projects, and sets the mandatory 'global' location/region.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { execFileAsync } from '../asyncUtils';

export class RunnerEnvironment {
  /**
   * Sanitizes the environment variables for process execution.
   * Auto-discovers GCP project if missing, handles empty API keys, and sets the Vertex AI region.
   *
   * @param extraVars Additional environment variable overrides
   * @returns Sanitized environment variables dictionary
   */
  public async sanitizeExecutionEnv(extraVars?: Record<string, string>): Promise<NodeJS.ProcessEnv> {
    const cleanEnv: NodeJS.ProcessEnv = {
      ...process.env,
      ...extraVars,
      PYTHONUNBUFFERED: '1',
      OTEL_SDK_DISABLED: 'true',
    };

    // If GEMINI_API_KEY is empty or not provided, remove it so google-genai activates Vertex AI / ADC
    if (!cleanEnv.GEMINI_API_KEY || !cleanEnv.GEMINI_API_KEY.trim()) {
      delete cleanEnv.GEMINI_API_KEY;
      cleanEnv.GOOGLE_GENAI_USE_VERTEXAI = 'true';
    }

    // Auto-discover GCP project if missing
    if (!cleanEnv.GOOGLE_CLOUD_PROJECT && !cleanEnv.GCP_PROJECT) {
      try {
        const { stdout } = await execFileAsync('gcloud', ['config', 'get-value', 'project'], {
          timeoutMs: 3000,
        });
        const discovered = stdout.trim();
        if (discovered && !discovered.includes('(unset)')) {
          cleanEnv.GOOGLE_CLOUD_PROJECT = discovered;
        }
      } catch {
        // Fall back gracefully if gcloud is not installed or configured
      }
    }

    // Default location to 'global' if not specified
    if (!cleanEnv.GOOGLE_CLOUD_LOCATION && !cleanEnv.GOOGLE_CLOUD_REGION && !cleanEnv.CLOUD_ML_REGION) {
      cleanEnv.GOOGLE_CLOUD_LOCATION = 'global';
      cleanEnv.GOOGLE_CLOUD_REGION = 'global';
    }
    if (cleanEnv.GOOGLE_CLOUD_LOCATION) {
      cleanEnv.GOOGLE_GENAI_LOCATION = cleanEnv.GOOGLE_CLOUD_LOCATION;
      cleanEnv.CLOUD_ML_REGION = cleanEnv.GOOGLE_CLOUD_LOCATION;
    }

    return cleanEnv;
  }

  /**
   * Fast check for an active live agent server on candidate ports.
   *
   * @param preferredPort Optional preferred port from configuration
   * @param lastRunningPort Optional port that was last recorded as running
   * @param httpGetCheck Callback function to perform HTTP status check
   * @returns Active port number if healthy, or null
   */
  public async detectLiveRunnerPort(
    preferredPort?: number,
    lastRunningPort?: number,
    httpGetCheck?: (port: number, path?: string, timeout?: number) => Promise<boolean>
  ): Promise<number | null> {
    const candidatePorts = Array.from(
      new Set(
        [preferredPort, lastRunningPort, 8000, 8080].filter(
          (p): p is number => typeof p === 'number' && p > 0
        )
      )
    );

    const check = httpGetCheck || (async (p: number) => {
      try {
        const res = await fetch(`http://localhost:${p}/health`, { signal: AbortSignal.timeout(300) });
        return res.status === 200;
      } catch {
        return false;
      }
    });

    for (const testPort of candidatePorts) {
      const isAlive = await check(testPort, '/health', 500);
      if (isAlive) {
        return testPort;
      }
    }
    return null;
  }

  /**
   * Kills any external process currently listening on the specified TCP port across OS platforms.
   * Explicitly protects the current VS Code extension host process and parent process from termination.
   *
   * @param port TCP port to clear
   * @param logCallback Optional callback to log actions or errors
   */
  public async killPort(port?: number, logCallback?: (text: string) => void): Promise<void> {
    if (!port || isNaN(port) || port <= 0) return;
    const currentPid = process.pid;
    const parentPid = process.ppid;

    try {
      if (process.platform === 'win32') {
        try {
          await execFileAsync(
            'powershell',
            [
              '-NoProfile',
              '-NonInteractive',
              '-Command',
              `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { if ($_ -ne ${currentPid} -and $_ -ne ${parentPid}) { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } }`,
            ],
            { timeoutMs: 3000 }
          );
        } catch (pwshErr: any) {
          if (logCallback) {
            logCallback(`[Local Runner] PowerShell killPort failed: ${pwshErr?.message}. Attempting netstat fallback...`);
          }
          try {
            const { stdout } = await execFileAsync('cmd.exe', ['/c', `netstat -ano | findstr :${port}`], { timeoutMs: 3000 });
            const pids = new Set<number>();
            for (const line of stdout.split('\n')) {
              if (!line.includes('LISTENING')) continue;
              const parts = line.trim().split(/\s+/);
              const pidStr = parts[parts.length - 1];
              const pid = parseInt(pidStr, 10);
              if (!isNaN(pid) && pid > 0 && pid !== currentPid && pid !== parentPid) {
                pids.add(pid);
              }
            }
            for (const pid of pids) {
              try {
                await execFileAsync('taskkill', ['/F', '/PID', String(pid)], { timeoutMs: 2000 });
              } catch (killErr: any) {
                if (logCallback) {
                  logCallback(`[Local Runner] taskkill failed for PID ${pid}: ${killErr?.message}`);
                }
              }
            }
          } catch (netstatErr: any) {
            if (logCallback) {
              logCallback(`[Local Runner] netstat fallback failed: ${netstatErr?.message}`);
            }
          }
        }
      } else {
        try {
          // Use -t (terse), -sTCP:LISTEN (only listening sockets), -P (numeric ports), -n (no DNS lookup), -iTCP:<port>
          const { stdout } = await execFileAsync(
            'lsof',
            ['-t', '-sTCP:LISTEN', '-P', '-n', `-iTCP:${port}`],
            { timeoutMs: 3000 }
          );
          const lsofOut = stdout.trim();
          if (lsofOut) {
            const pids = lsofOut.split(/\s+/).filter(Boolean);
            for (const pidStr of pids) {
              const pid = parseInt(pidStr, 10);
              if (!isNaN(pid) && pid > 1 && pid !== currentPid && pid !== parentPid) {
                try {
                  process.kill(-pid, 'SIGKILL');
                } catch {}
                try {
                  process.kill(pid, 'SIGKILL');
                } catch {
                  try {
                    await execFileAsync('kill', ['-9', String(pid)], { timeoutMs: 2000 });
                  } catch (killErr: any) {
                    if (logCallback) {
                      logCallback(`[Local Runner] kill -9 failed for PID ${pid}: ${killErr?.message}`);
                    }
                  }
                }
              }
            }
          }
        } catch (lsofErr: any) {
          // If lsof is missing or returns non-zero (no process found), fallback to fuser on Linux
          if (process.platform === 'linux') {
            try {
              await execFileAsync('fuser', ['-k', '-n', 'tcp', String(port)], { timeoutMs: 2000 });
            } catch {
              // Ignore when no process is bound to the port
            }
          } else if (logCallback) {
            logCallback(`[Local Runner] lsof check completed: ${lsofErr?.message}`);
          }
        }
      }
    } catch (globalErr: any) {
      if (logCallback) {
        logCallback(`[Local Runner] killPort failed globally: ${globalErr?.message}`);
      }
    }
  }
}
