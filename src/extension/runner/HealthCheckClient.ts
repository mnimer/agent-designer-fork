/**
 * HealthCheckClient
 *
 * Provides fast, reliable network client helpers to probe, request, and poll
 * local Python runner processes over HTTP/native TCP.
 *
 * Job inside Application:
 * Performs continuous polling during local runner startup to safely determine readiness, and sends
 * structured JSON POST payloads to query active agents. It supports low-level Node socket fallbacks,
 * standard content decompression, and instant abort signals.
 *
 * Architectural Decisions:
 * 1. Strict health checks: Validates HTTP 200 OK statuses specifically (other statuses like 404 do not count).
 * 2. Native socket fallback: Incorporates a pure http.request raw socket implementation to guard against
 *    situations where global fetch may fail or be missing in the extension environment.
 * 3. Immediate exit polling rejection: Aborts polling immediately if the target process crashes during
 *    the startup health check window.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import * as http from 'http';

export class HealthCheckClient {
  public healthCheckPollTimer: NodeJS.Timeout | null = null;
  public healthCheckTimeoutTimer: NodeJS.Timeout | null = null;
  public pendingHealthCheckReject: ((err: Error) => void) | null = null;

  /**
   * Fast, reliable HTTP GET check using fetch and Node.js native sockets.
   * Probes localhost and 127.0.0.1 over TCP sockets, strictly verifying HTTP 200 health status.
   *
   * @param port Target server port
   * @param pathStr Path to probe (default /health)
   * @param timeoutMs Timeout in ms (default 500ms)
   * @returns True if server returned 200 OK, false otherwise
   */
  public async httpGetCheck(port: number, pathStr = '/health', timeoutMs = 500): Promise<boolean> {
    const urls = [
      `http://localhost:${port}${pathStr}`,
      `http://127.0.0.1:${port}${pathStr}`,
    ];

    for (const url of urls) {
      try {
        if (typeof fetch === 'function') {
          const res = await fetch(url, {
            method: 'GET',
            headers: {
              'Accept': 'application/json, text/plain, */*',
            },
            signal: AbortSignal.timeout(timeoutMs),
          });
          if (res.status === 200) {
            return true;
          }
        }
      } catch {
        // Fall through to low-level socket check
      }
    }

    // Low-level socket fallback
    const hosts = ['localhost', '127.0.0.1'];
    for (const host of hosts) {
      try {
        const ok = await new Promise<boolean>((resolve) => {
          const req = http.request(
            {
              host,
              port,
              path: pathStr,
              method: 'GET',
              agent: false,
              timeout: timeoutMs,
            },
            (res) => {
              const is200 = res.statusCode === 200;
              res.resume();
              resolve(is200);
            }
          );

          req.on('timeout', () => {
            req.destroy();
            resolve(false);
          });

          req.on('error', () => {
            resolve(false);
          });

          req.end();
        });

        if (ok) return true;
      } catch {
        // Continue to next host
      }
    }

    return false;
  }

  /**
   * Fast, resilient HTTP POST to agent runner server.
   * Supports both fetch and Node native socket fallback. Tries localhost and 127.0.0.1,
   * and discards empty-body false-positives to ensure connection.
   *
   * @param port Target server port
   * @param pathStr Path to post to (e.g. /v1/chat/completions)
   * @param body JSON request payload
   * @param timeoutMs Request timeout in ms (default 60s)
   * @param externalSignal Optional abort signal to cancel in-flight requests immediately
   * @param extraHeaders Optional custom headers
   */
  public async httpPostJson(
    port: number,
    pathStr: string,
    body: any,
    timeoutMs = 180000,
    externalSignal?: AbortSignal,
    extraHeaders?: Record<string, string>
  ): Promise<{ ok: boolean; status: number; data: any; text: string }> {
    const jsonBody = JSON.stringify(body);
    const candidateUrls = [
      `http://localhost:${port}${pathStr}`,
      `http://127.0.0.1:${port}${pathStr}`,
    ];

    let lastCandidateResult: { ok: boolean; status: number; data: any; text: string } | null = null;

    if (externalSignal?.aborted) {
      throw new Error('HTTP request was aborted by user.');
    }

    // 1. Primary: Use global fetch
    for (const targetUrl of candidateUrls) {
      const timeoutSignal = AbortSignal.timeout(timeoutMs);
      try {
        if (typeof fetch === 'function') {
          const activeSignal =
            typeof (AbortSignal as any).any === 'function' && externalSignal
              ? (AbortSignal as any).any([timeoutSignal, externalSignal])
              : (externalSignal || timeoutSignal);

          const response = await fetch(targetUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json, text/plain, */*',
              'Accept-Encoding': 'identity, gzip, deflate, br',
              ...(extraHeaders || {}),
            },
            body: jsonBody,
            signal: activeSignal,
          });

          const resText = await response.text();
          let parsedData: any = null;
          try {
            parsedData = JSON.parse(resText);
          } catch {}

          const currentResult = {
            ok: response.ok,
            status: response.status,
            data: parsedData,
            text: resText,
          };

          if (resText && resText.trim().length > 0) {
            return currentResult;
          }

          lastCandidateResult = currentResult;
        }
      } catch (err: any) {
        if (externalSignal?.aborted || err?.name === 'AbortError') {
          throw new Error('HTTP request was aborted by user.');
        }
        // Fail fast on per-request timeout so we do not fire duplicate POSTs to 127.0.0.1 / socket fallback
        if (timeoutSignal.aborted || err?.name === 'TimeoutError') {
          throw new Error(`HTTP request timed out after ${timeoutMs}ms`);
        }
      }
    }

    if (lastCandidateResult && lastCandidateResult.ok) {
      return lastCandidateResult;
    }

    // 2. Secondary: Node.js native http.request socket fallback
    const hosts = ['localhost', '127.0.0.1'];
    for (const host of hosts) {
      try {
        const result = await new Promise<{ ok: boolean; status: number; data: any; text: string }>(
          (resolve, reject) => {
            const req = http.request(
              {
                host,
                port,
                path: pathStr,
                method: 'POST',
                agent: false,
                headers: {
                  'Content-Type': 'application/json',
                  'Content-Length': Buffer.byteLength(jsonBody),
                  'Accept': 'application/json, text/plain, */*',
                  'Accept-Encoding': 'identity',
                  ...(extraHeaders || {}),
                },
                timeout: timeoutMs,
              },
              (res) => {
                res.on('error', (resErr) => {
                  reject(resErr);
                });
                let resData = '';
                res.setEncoding('utf8');
                res.on('data', (chunk) => {
                  resData += chunk;
                });
                res.on('end', () => {
                  let parsed: any = null;
                  try {
                    parsed = JSON.parse(resData);
                  } catch {}
                  const isOk =
                    res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300;
                  resolve({
                    ok: isOk,
                    status: res.statusCode || 200,
                    data: parsed,
                    text: resData,
                  });
                });
              }
            );

            if (externalSignal) {
              const onAbort = () => {
                req.destroy();
                reject(new Error('HTTP request was aborted by user.'));
              };
              if (externalSignal.aborted) {
                onAbort();
                return;
              }
              externalSignal.addEventListener('abort', onAbort, { once: true });
            }

            req.on('timeout', () => {
              req.destroy();
              reject(new Error(`HTTP request timed out after ${timeoutMs}ms`));
            });

            req.on('error', (err) => {
              reject(err);
            });

            req.write(jsonBody);
            req.end();
          }
        );

        if (result.text && result.text.trim().length > 0) {
          return result;
        }
        lastCandidateResult = result;
      } catch (err) {
        if (host === hosts[hosts.length - 1] && !lastCandidateResult) {
          throw err;
        }
      }
    }

    if (lastCandidateResult) {
      return lastCandidateResult;
    }

    throw new Error(`Failed to connect to agent server on port ${port}`);
  }

  /**
   * Polls the /health endpoint until the server is ready or timeout occurs.
   * Immediately aborts polling and rejects if the target process crashes during the loop.
   *
   * @param port Target port to poll
   * @param maxWaitMs Maximum milliseconds to wait
   * @param isActiveCheck Callback checking if the process is still running/active
   * @param logCallback Callback to write diagnostic logs
   */
  public async waitForServerReady(
    port: number,
    maxWaitMs = 12000,
    isActiveCheck: () => boolean = () => true,
    logCallback: (text: string) => void = () => {}
  ): Promise<boolean> {
    const start = Date.now();

    if (this.healthCheckPollTimer) {
      clearTimeout(this.healthCheckPollTimer);
      this.healthCheckPollTimer = null;
    }
    if (this.healthCheckTimeoutTimer) {
      clearTimeout(this.healthCheckTimeoutTimer);
      this.healthCheckTimeoutTimer = null;
    }

    return new Promise<boolean>((resolve, reject) => {
      const cleanup = () => {
        if (this.healthCheckPollTimer) {
          clearTimeout(this.healthCheckPollTimer);
          this.healthCheckPollTimer = null;
        }
        if (this.healthCheckTimeoutTimer) {
          clearTimeout(this.healthCheckTimeoutTimer);
          this.healthCheckTimeoutTimer = null;
        }
        this.pendingHealthCheckReject = null;
      };

      this.pendingHealthCheckReject = (err) => {
        cleanup();
        reject(err);
      };

      const poll = async () => {
        // Stop polling and reject if the active process has stopped
        if (!isActiveCheck()) {
          cleanup();
          reject(new Error('No active local runner is running.'));
          return;
        }

        const isAlive =
          (await this.httpGetCheck(port, '/health', 300)) ||
          (await this.httpGetCheck(port, '/healthz', 300));
        if (isAlive) {
          cleanup();
          resolve(true);
          return;
        }

        if (Date.now() - start >= maxWaitMs) {
          cleanup();
          resolve(false);
          return;
        }

        this.healthCheckPollTimer = setTimeout(poll, 300);
      };

      // Start polling
      this.healthCheckPollTimer = setTimeout(poll, 100);

      // Timeout backup guard
      this.healthCheckTimeoutTimer = setTimeout(() => {
        cleanup();
        resolve(false);
      }, maxWaitMs);
    }).catch((err) => {
      logCallback(`[Local Runner] Health check aborted: ${err.message}`);
      return false;
    });
  }
}
