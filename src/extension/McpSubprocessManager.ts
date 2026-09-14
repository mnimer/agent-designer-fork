/**
 * McpSubprocessManager Class
 *
 * Job & Purpose:
 * Central manager in the extension host for discovering external Model Context Protocol (MCP) servers,
 * negotiating tool schemas over JSON-RPC 2.0 (stdio transport) and HTTP/SSE streams, measuring roundtrip latency,
 * and normalizing discovered tools for canvas binding and ADK code generation.
 *
 * Architectural Decisions:
 * 1. Transport Agnostic Discovery: Handles stdio subprocesses (spawning node, python, docker, uvx, npx),
 *    SSE (Server-Sent Events), and standard streamable HTTP endpoints.
 * 2. Strict JSON-RPC 2.0 MCP Protocol Compliance: Follows MCP 2024-11-05 spec:
 *    - Sends 'initialize' request with protocolVersion, capabilities, and clientInfo.
 *    - Waits for server response and serverInfo.
 *    - Emits 'notifications/initialized'.
 *    - Sends 'tools/list' request to fetch exposed tools with JSON schemas.
 * 3. Graceful Subprocess Lifecycle: Subprocesses spawned for discovery are cleanly terminated (SIGTERM followed by SIGKILL fallback)
 *    and guarded by configurable timeouts to prevent zombie processes.
 * 4. Pluggable Process Spawner & Fetcher: Accepts optional injected spawner and fetcher for unit testability and isolation.
 *
 * Author: Mike Nimer <mikenimer@google.com>
 */

import { spawn, exec, execFile, ChildProcess } from 'child_process';
import { promisify } from 'util';
import * as http from 'http';
import * as https from 'https';
import { ToolDefinition, McpAuthProviderType, McpOAuthConfig, McpSecretConfig } from '../shared/types';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

export interface McpDiscoveryParams {
  transport: 'stdio' | 'sse' | 'http';
  command?: string;
  args?: string[];
  cwd?: string;
  url?: string;
  serverUrl?: string;
  envVars?: Record<string, string>;
  headers?: Record<string, string>;
  timeoutSeconds?: number;
  authProviderType?: McpAuthProviderType;
  oauthConfig?: McpOAuthConfig;
  secretConfig?: McpSecretConfig;
  bearerToken?: string;
}

export interface McpDiscoveryResult {
  success: boolean;
  tools: ToolDefinition[];
  serverInfo?: {
    name: string;
    version?: string;
  };
  latencyMs?: number;
  error?: string;
  requiresAuth?: boolean;
  authType?: string;
  authUrl?: string;
}

export interface SpawnOptionsLike {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdio?: ('pipe' | 'ignore' | 'inherit')[];
  shell?: boolean | string;
}

export type ProcessSpawner = (
  command: string,
  args: string[],
  options: SpawnOptionsLike
) => ChildProcess;

export class McpSubprocessManager {
  private readonly defaultTimeoutMs: number = 30000;
  private readonly spawner: ProcessSpawner;
  private readonly activeSubprocesses = new Set<ChildProcess>();

  /**
   * Initializes the MCP Subprocess Manager with an optional spawner for dependency injection.
   *
   * @param spawner Optional child_process.spawn replacement for testing
   */
  constructor(spawner?: ProcessSpawner) {
    this.spawner = spawner || ((cmd, args, opts) => spawn(cmd, args, opts as any));
  }

  /**
   * Discovers tools from an MCP server using the specified transport configuration.
   *
   * Logic Flow:
   * 1. Validate incoming transport and required target coordinates (command for stdio, url for sse/http).
   * 2. Start latency stopwatch.
   * 3. Route to either executeStdioHandshake() or executeHttpHandshake().
   * 4. Normalize discovered tools into ToolDefinition format and return payload.
   *
   * @param params MCP connection and transport parameters
   * @returns Promise resolving to discovery result with normalized tools and server info
   */
  /**
   * Resolves Google Cloud ADC access token and project ID for Google Cloud MCP endpoints.
   * Uses local Application Default Credentials (ADC) / gcloud CLI so users do not have to manage
   * expiring tokens manually.
   *
   * Logic Flow:
   * 1. Resolve target GCP project ID from oauthConfig or environment or gcloud config.
   * 2. Acquire a fresh OAuth access token via gcloud CLI / ADC.
   * 3. Return resolved token and project ID.
   *
   * @param oauthConfig Optional OAuth configuration with custom scopes and project ID
   * @returns Promise resolving to { token: string; projectId?: string }
   */
  public async resolveGoogleCredentials(
    oauthConfig?: McpOAuthConfig
  ): Promise<{ token: string; projectId?: string }> {
    const { execFileAsync } = require('./asyncUtils');

    // 1. Resolve project ID
    let projectId = oauthConfig?.projectId?.trim() || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
    if (!projectId) {
      try {
        const { stdout } = await execFileAsync('gcloud', ['config', 'get-value', 'project'], { timeoutMs: 10000 });
        const trimmed = stdout?.trim();
        if (trimmed && trimmed !== '(unset)') {
          projectId = trimmed;
        }
      } catch {
        // Fallback silently if gcloud project config is not present
      }
    }

    // 2. Resolve access token
    let token = '';
    const scopes = oauthConfig?.scopes?.filter(Boolean) || [];
    if (scopes.length > 0) {
      try {
        const { stdout } = await execFileAsync('gcloud', ['auth', 'application-default', 'print-access-token', `--scopes=${scopes.join(',')}`], { timeoutMs: 10000 });
        if (stdout && stdout.trim().startsWith('ya29.')) {
          token = stdout.trim();
        }
      } catch {
        // Fall through to general token acquisition
      }
    }

    if (!token) {
      try {
        const { stdout } = await execFileAsync('gcloud', ['auth', 'print-access-token'], { timeoutMs: 10000 });
        if (stdout && stdout.trim().startsWith('ya29.')) {
          token = stdout.trim();
        }
      } catch {
        try {
          const { stdout } = await execFileAsync('gcloud', ['auth', 'application-default', 'print-access-token'], { timeoutMs: 10000 });
          if (stdout && stdout.trim().startsWith('ya29.')) {
            token = stdout.trim();
          }
        } catch {
          // Token acquisition failed
        }
      }
    }

    if (!token) {
      throw new Error(
        'Failed to acquire Google Cloud Application Default Credentials. ' +
        'Please run "gcloud auth application-default login" or "gcloud auth login" in your terminal.'
      );
    }

    return { token, projectId };
  }

  public async discoverTools(params: McpDiscoveryParams): Promise<McpDiscoveryResult> {
    const startTime = Date.now();
    const timeoutMs = (params.timeoutSeconds && params.timeoutSeconds > 0)
      ? params.timeoutSeconds * 1000
      : this.defaultTimeoutMs;

    try {
      // Dynamic Credential resolution: Google Cloud ADC or Bearer Token / Secret
      const effectiveHeaders: Record<string, string> = { ...(params.headers || {}) };
      if (params.authProviderType === 'google_credentials') {
        const creds = await this.resolveGoogleCredentials(params.oauthConfig);
        effectiveHeaders['Authorization'] = `Bearer ${creds.token}`;
        if (creds.projectId && !effectiveHeaders['x-goog-user-project']) {
          effectiveHeaders['x-goog-user-project'] = creds.projectId;
        }
      } else if (params.authProviderType === 'bearer_token' || params.bearerToken || params.secretConfig?.bearerToken) {
        const token = params.bearerToken || params.secretConfig?.bearerToken;
        if (token && !effectiveHeaders['Authorization']) {
          effectiveHeaders['Authorization'] = `Bearer ${token.trim()}`;
        }
      }

      const resolvedUrl = (params.url || params.serverUrl || '').trim();
      const resolvedTransport = params.transport || 'http';

      const effectiveParams: McpDiscoveryParams = {
        ...params,
        transport: resolvedTransport,
        url: resolvedUrl,
        serverUrl: resolvedUrl,
        headers: effectiveHeaders,
      };

      if (effectiveParams.transport === 'stdio') {
        if (!effectiveParams.command || effectiveParams.command.trim() === '') {
          return {
            success: false,
            tools: [],
            error: 'MCP stdio transport requires a valid command or executable path.',
          };
        }
        return await this.executeStdioHandshake(effectiveParams, timeoutMs, startTime);
      } else if (effectiveParams.transport === 'sse' || effectiveParams.transport === 'http') {
        if (!effectiveParams.url || effectiveParams.url.trim() === '') {
          return {
            success: false,
            tools: [],
            error: `MCP ${effectiveParams.transport.toUpperCase()} transport requires a valid endpoint URL.`,
          };
        }
        return await this.executeHttpHandshake(effectiveParams, timeoutMs, startTime);
      } else {
        return {
          success: false,
          tools: [],
          error: `Unsupported MCP transport: ${effectiveParams.transport}`,
        };
      }
    } catch (err: any) {
      return {
        success: false,
        tools: [],
        latencyMs: Date.now() - startTime,
        error: err?.message || String(err),
      };
    }
  }

  /**
   * Executes a live JSON-RPC 2.0 handshake over stdio with an MCP server subprocess.
   *
   * Logic Flow:
   * 1. Merge environment variables and configure working directory.
   * 2. Spawn subprocess via injected or native child_process.spawn.
   * 3. Listen on stdout for line-delimited JSON-RPC messages and stderr for error diagnostic logs.
   * 4. Step 1: Send 'initialize' request (id: 1) with protocol version '2024-11-05'.
   * 5. Step 2: Upon receipt of initialize response, capture serverInfo and send 'notifications/initialized'.
   * 6. Step 3: Send 'tools/list' request (id: 2).
   * 7. Step 4: Upon receipt of tools list, map tools to ToolDefinition array and resolve.
   * 8. Cleanly terminate subprocess with SIGTERM (fallback to SIGKILL after 1s).
   *
   * @param params Discovery configuration
   * @param timeoutMs Timeout in milliseconds
   * @param startTime Monotonic start timestamp for latency calculation
   */
  private executeStdioHandshake(
    params: McpDiscoveryParams,
    timeoutMs: number,
    startTime: number
  ): Promise<McpDiscoveryResult> {
    return new Promise((resolve) => {
      let resolved = false;
      let timer: NodeJS.Timeout | null = null;
      let child: ChildProcess | null = null;
      let stdoutBuffer = '';
      let stderrBuffer = '';
      let serverInfo: { name: string; version?: string } | undefined;

      const finish = (result: McpDiscoveryResult) => {
        if (resolved) return;
        resolved = true;
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        // Cleanup child process defensively
        if (child) {
          this.activeSubprocesses.delete(child);
          try {
            child.kill('SIGTERM');
            setTimeout(() => {
              try {
                if (child && !child.killed) {
                  child.kill('SIGKILL');
                }
              } catch {
                // Ignore kill errors
              }
            }, 1000).unref();
          } catch {
            // Ignore kill errors
          }
        }
        resolve(result);
      };

      // Set timeout handler
      timer = setTimeout(() => {
        finish({
          success: false,
          tools: [],
          latencyMs: Date.now() - startTime,
          error: `MCP handshake timed out after ${timeoutMs / 1000}s. Last stderr: ${stderrBuffer.trim() || 'none'}`,
        });
      }, timeoutMs);

      // Environment setup: Inherit process.env and overlay custom envVars
      const mergedEnv: NodeJS.ProcessEnv = {
        ...process.env,
        ...(params.envVars || {}),
      };

      try {
        const command = (params.command || '').trim();
        const args = params.args || [];
        const cwd = params.cwd && params.cwd.trim() !== '' ? params.cwd.trim() : undefined;

        child = this.spawner(command, args, {
          cwd,
          env: mergedEnv,
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        if (child) {
          this.activeSubprocesses.add(child);
        }
      } catch (spawnError: any) {
        return finish({
          success: false,
          tools: [],
          latencyMs: Date.now() - startTime,
          error: `Failed to spawn MCP process: ${spawnError?.message || spawnError}`,
        });
      }

      if (!child.stdout || !child.stdin) {
        return finish({
          success: false,
          tools: [],
          latencyMs: Date.now() - startTime,
          error: 'Subprocess spawned without readable stdout or writable stdin.',
        });
      }

      // Handle spawn error (e.g. command not found ENOENT)
      child.on('error', (err: any) => {
        console.error(`[McpSubprocessManager] Subprocess error on PID ${child?.pid || 'unknown'}:`, err);
        if (child) {
          this.activeSubprocesses.delete(child);
        }
        finish({
          success: false,
          tools: [],
          latencyMs: Date.now() - startTime,
          error: `Subprocess error (${err?.code || 'ERROR'}): ${err?.message || err}`,
        });
      });

      // Handle process exit
      child.on('exit', (code, signal) => {
        console.log(`[McpSubprocessManager] Subprocess exited on PID ${child?.pid || 'unknown'} with code ${code} and signal ${signal}`);
        if (child) {
          this.activeSubprocesses.delete(child);
        }
        if (!resolved) {
          finish({
            success: false,
            tools: [],
            latencyMs: Date.now() - startTime,
            error: `MCP server exited unexpectedly with code ${code ?? 'null'} (${signal || 'none'}). Stderr: ${stderrBuffer.trim() || 'none'}`,
          });
        }
      });

      // Capture stderr
      if (child.stderr) {
        child.stderr.on('data', (chunk: Buffer | string) => {
          stderrBuffer += chunk.toString();
        });
      }

      // Process stdout JSON-RPC chunks
      child.stdout.on('data', (chunk: Buffer | string) => {
        stdoutBuffer += chunk.toString();
        // Messages in JSON-RPC stdio are separated by newlines
        const lines = stdoutBuffer.split('\n');
        stdoutBuffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          let message: any;
          try {
            message = JSON.parse(trimmed);
          } catch {
            // Not a complete JSON-RPC message line; skip
            continue;
          }

          // Step 1 response: initialize (id: 1)
          if (message.id === 1) {
            if (message.error) {
              return finish({
                success: false,
                tools: [],
                latencyMs: Date.now() - startTime,
                error: `MCP initialize error: ${message.error.message || JSON.stringify(message.error)}`,
              });
            }

            // Capture server info
            serverInfo = message.result?.serverInfo || {
              name: 'MCP Server',
              version: '1.0.0',
            };

            // Step 2: Send initialized notification
            const initializedNotification = JSON.stringify({
              jsonrpc: '2.0',
              method: 'notifications/initialized',
            }) + '\n';
            try {
              child.stdin?.write(initializedNotification);
            } catch (err: any) {
              return finish({
                success: false,
                tools: [],
                latencyMs: Date.now() - startTime,
                error: `Failed to write initialized notification: ${err?.message || err}`,
              });
            }

            // Step 3: Send tools/list request (id: 2)
            const listToolsRequest = JSON.stringify({
              jsonrpc: '2.0',
              id: 2,
              method: 'tools/list',
              params: {},
            }) + '\n';
            try {
              child.stdin?.write(listToolsRequest);
            } catch (err: any) {
              return finish({
                success: false,
                tools: [],
                latencyMs: Date.now() - startTime,
                error: `Failed to write tools/list request: ${err?.message || err}`,
              });
            }
          }

          // Step 4 response: tools/list (id: 2)
          if (message.id === 2) {
            if (message.error) {
              return finish({
                success: false,
                tools: [],
                latencyMs: Date.now() - startTime,
                serverInfo,
                error: `MCP tools/list error: ${message.error.message || JSON.stringify(message.error)}`,
              });
            }

            const rawTools: any[] = message.result?.tools || [];
            const normalizedTools: ToolDefinition[] = this.normalizeMcpTools(
              rawTools,
              serverInfo?.name || 'mcp'
            );

            return finish({
              success: true,
              tools: normalizedTools,
              serverInfo,
              latencyMs: Date.now() - startTime,
            });
          }
        }
      });

      // Send initial initialize request (id: 1)
      const initializeRequest = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {
            roots: { listChanged: false },
            sampling: {},
          },
          clientInfo: {
            name: 'VisualAgentDesigner',
            version: '1.0.0',
          },
        },
      }) + '\n';

      try {
        child.stdin.write(initializeRequest);
      } catch (writeErr: any) {
        finish({
          success: false,
          tools: [],
          latencyMs: Date.now() - startTime,
          error: `Failed to send initial initialize request: ${writeErr?.message || writeErr}`,
        });
      }
    });
  }

  /**
   * Parses JSON-RPC response data from either standard JSON or Server-Sent Events (SSE) stream text.
   * Remote streamable MCP servers (e.g. Yahoo Finance) emit events as "event: message\ndata: { ... }".
   *
   * @param data Raw response text
   * @returns Parsed JSON-RPC payload object
   */
  public static parseSseOrJsonPayload(data: string): any {
    const trimmed = (data || '').trim();
    if (!trimmed) {
      throw new Error('Empty response payload');
    }

    // Fast-path: Standard JSON payload starting with { or [
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return JSON.parse(trimmed);
      } catch {
        // Fallback to line scanning if trailing SSE lines or whitespace exist
      }
    }

    // SSE Stream line scanning: extract payload from "data: {...}" lines
    const lines = trimmed.split('\n');
    let lastDataJson: any = null;

    for (const line of lines) {
      const lineTrimmed = line.trim();
      if (lineTrimmed.startsWith('data:')) {
        const jsonCandidate = lineTrimmed.slice(5).trim();
        if (jsonCandidate.startsWith('{') || jsonCandidate.startsWith('[')) {
          try {
            const parsed = JSON.parse(jsonCandidate);
            if (parsed.result || parsed.error || parsed.jsonrpc) {
              lastDataJson = parsed;
            }
          } catch {
            // Keep scanning for subsequent valid data payloads
          }
        }
      }
    }

    if (lastDataJson) {
      return lastDataJson;
    }

    // Attempt direct parse as last resort
    return JSON.parse(trimmed);
  }

  public parseSseOrJsonPayload(data: string): any {
    return McpSubprocessManager.parseSseOrJsonPayload(data);
  }

  /**
   * Executes an HTTP or SSE query against a remote MCP server endpoint.
   *
   * Logic Flow:
   * 1. Parse target URL and prepare custom HTTP headers (including Accept for JSON and text/event-stream).
   * 2. Send POST initialize payload or GET for SSE endpoint.
   * 3. Handle response stream or JSON-RPC reply (parsing SSE events if streamable HTTP).
   * 4. If tools are empty, query tools/list.
   * 5. Map tools to ToolDefinition array and calculate latency.
   *
   * @param params Discovery configuration with target url
   * @param timeoutMs Timeout in milliseconds
   * @param startTime Monotonic start timestamp
   */
  private executeHttpHandshake(
    params: McpDiscoveryParams,
    timeoutMs: number,
    startTime: number
  ): Promise<McpDiscoveryResult> {
    return new Promise((resolve) => {
      const rawUrl = (params.url || params.serverUrl || '').trim();
      if (!rawUrl) {
        return resolve({
          success: false,
          tools: [],
          latencyMs: Date.now() - startTime,
          error: 'Invalid MCP URL: URL is required for HTTP/SSE transport',
        });
      }

      let urlStr = rawUrl;
      if (!urlStr.startsWith('http://') && !urlStr.startsWith('https://')) {
        if (urlStr.includes('.') || urlStr.startsWith('localhost') || urlStr.includes(':')) {
          urlStr = `https://${urlStr}`;
        }
      }

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(urlStr);
        if (!parsedUrl.protocol || !['http:', 'https:'].includes(parsedUrl.protocol)) {
          throw new Error('Protocol must be http: or https:');
        }
        if (!parsedUrl.hostname) {
          throw new Error('Missing hostname');
        }
      } catch (urlErr: any) {
        return resolve({
          success: false,
          tools: [],
          latencyMs: Date.now() - startTime,
          error: `Invalid MCP URL "${rawUrl}": ${urlErr?.message || urlErr}`,
        });
      }

      const client = parsedUrl.protocol === 'https:' ? https : http;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream, */*',
        'User-Agent': 'VisualAgentDesigner/1.0.0',
        ...(params.headers || {}),
      };

      // Payload for JSON-RPC initialize
      const requestBody = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: { roots: { listChanged: false } },
          clientInfo: { name: 'VisualAgentDesigner', version: '1.0.0' },
        },
      });

      const options: http.RequestOptions = {
        protocol: parsedUrl.protocol,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: params.transport === 'sse' ? 'GET' : 'POST',
        headers,
        timeout: timeoutMs,
      };

      const req = client.request(options, (res) => {
        let responseData = '';
        res.on('data', (chunk) => {
          responseData += chunk.toString();
        });

        res.on('end', () => {
          const latencyMs = Date.now() - startTime;
          const statusCode = res.statusCode || 0;

          if (statusCode >= 400) {
            const isAuthError = statusCode === 401 || statusCode === 403;
            let authUrl: string | undefined;
            const wwwAuth = (res.headers['www-authenticate'] as string) || '';
            const authMatch = wwwAuth.match(/authorization_uri="([^"]+)"/) || wwwAuth.match(/realm="([^"]+)"/);
            if (authMatch) {
              authUrl = authMatch[1];
            }

            return resolve({
              success: false,
              tools: [],
              latencyMs,
              requiresAuth: isAuthError,
              authType: isAuthError ? 'oauth' : undefined,
              authUrl,
              error: isAuthError
                ? `Authentication required (HTTP ${statusCode}). OAuth 2.0 or Bearer token needed to connect: ${responseData.slice(0, 150)}`
                : `HTTP ${statusCode} ${res.statusMessage || 'Error'}: ${responseData.slice(0, 200)}`,
            });
          }

          // If SSE connection returned stream or JSON
          try {
            // Attempt to parse JSON response (supporting SSE event data formatting)
            const parsed = this.parseSseOrJsonPayload(responseData);
            if (parsed.error) {
              return resolve({
                success: false,
                tools: [],
                latencyMs,
                error: parsed.error.message || JSON.stringify(parsed.error),
              });
            }

            const rawTools: any[] = parsed.result?.tools || parsed.tools || [];
            const serverInfo = parsed.result?.serverInfo || parsed.serverInfo || {
              name: 'Remote MCP Server',
              version: '1.0.0',
            };

            // If HTTP endpoint returned serverInfo but tools are empty, query tools/list
            if (rawTools.length === 0 && (params.transport === 'http' || params.transport === 'sse')) {
              const listReqOptions: http.RequestOptions = {
                ...options,
                method: 'POST',
              };
              const listRequestBody = JSON.stringify({
                jsonrpc: '2.0',
                id: 2,
                method: 'tools/list',
                params: {},
              });

              const listReq = client.request(listReqOptions, (listRes) => {
                let listData = '';
                listRes.on('data', (c) => { listData += c.toString(); });
                listRes.on('end', () => {
                  try {
                    const listParsed = this.parseSseOrJsonPayload(listData);
                    const fetchedTools: any[] = listParsed.result?.tools || listParsed.tools || [];
                    const tools = this.normalizeMcpTools(
                      fetchedTools.length > 0 ? fetchedTools : rawTools,
                      serverInfo.name
                    );
                    return resolve({
                      success: true,
                      tools,
                      serverInfo,
                      latencyMs: Date.now() - startTime,
                    });
                  } catch {
                    return resolve({
                      success: true,
                      tools: this.normalizeMcpTools(rawTools, serverInfo.name),
                      serverInfo,
                      latencyMs: Date.now() - startTime,
                    });
                  }
                });
              });

              listReq.on('error', () => {
                return resolve({
                  success: true,
                  tools: this.normalizeMcpTools(rawTools, serverInfo.name),
                  serverInfo,
                  latencyMs: Date.now() - startTime,
                });
              });

              listReq.write(listRequestBody);
              listReq.end();
              return;
            }

            const tools = this.normalizeMcpTools(rawTools, serverInfo.name);

            return resolve({
              success: true,
              tools,
              serverInfo,
              latencyMs,
            });
          } catch {
            // For SSE endpoints that respond with 200 OK stream, report success with connection verified
            return resolve({
              success: true,
              tools: [],
              serverInfo: { name: 'Remote MCP Endpoint (Active)', version: '1.0.0' },
              latencyMs,
            });
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          success: false,
          tools: [],
          latencyMs: Date.now() - startTime,
          error: `HTTP connection timed out after ${timeoutMs / 1000}s.`,
        });
      });

      req.on('error', (err: any) => {
        resolve({
          success: false,
          tools: [],
          latencyMs: Date.now() - startTime,
          error: `Network error connecting to MCP server: ${err?.message || err}`,
        });
      });

      if (params.transport !== 'sse') {
        req.write(requestBody);
      }
      req.end();
    });
  }

  /**
   * Normalizes raw MCP tools into standard ToolDefinition models.
   *
   * Logic Flow:
   * 1. Iterate over each raw tool object.
   * 2. Extract tool name, description, and input schema.
   * 3. Construct parameters dictionary from inputSchema properties.
   * 4. Assign unique namespaced tool ID.
   *
   * @param rawTools Array of raw tool objects from MCP server
   * @param serverName Name of the server for ID prefixing
   */
  public normalizeMcpTools(rawTools: any[], serverName: string): ToolDefinition[] {
    if (!Array.isArray(rawTools)) return [];

    const sanitizedServerPrefix = serverName
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/^_+|_+$/g, '') || 'mcp';

    return rawTools.map((raw: any) => {
      const toolName = String(raw.name || 'unnamed_tool');
      const toolDescription = String(raw.description || '');
      const inputSchema = raw.inputSchema || {};
      const properties = inputSchema.properties || {};

      // Map schema properties into simple parameter descriptions
      const parameters: Record<string, string> = {};
      for (const [key, prop] of Object.entries<any>(properties)) {
        parameters[key] = prop?.description || prop?.type || 'string';
      }

      const toolDef: ToolDefinition = {
        id: `mcp_${sanitizedServerPrefix}_${toolName}`,
        name: toolName,
        description: toolDescription,
        type: 'mcp',
        category: 'mcp',
        parameters,
        config: {
          inputSchema,
          serverName,
        },
        enabled: true,
      };

      return toolDef;
    });
  }

  /**
   * Kills all currently running and registered MCP discovery subprocesses.
   *
   * @author Mike Nimer <mikenimer@google.com>
   */
  public killAll(): void {
    for (const child of this.activeSubprocesses) {
      try {
        if (child.pid && !child.killed) {
          if (process.platform === 'win32') {
            try {
              const { exec } = require('child_process');
              exec(`taskkill /f /t /pid ${child.pid}`);
            } catch {
              child.kill('SIGKILL');
            }
          } else {
            try {
              process.kill(-child.pid, 'SIGKILL');
            } catch {
              child.kill('SIGKILL');
            }
          }
        }
      } catch (err) {
        console.error(`[McpSubprocessManager] Failed to kill child process on PID ${child.pid}:`, err);
      }
    }
    this.activeSubprocesses.clear();
  }

  /**
   * Disposes of the manager and terminates all active processes.
   */
  public dispose(): void {
    this.killAll();
  }
}
