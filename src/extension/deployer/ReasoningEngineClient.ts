/**
 * ReasoningEngineClient
 *
 * Interacts directly with deployed remote Vertex AI Reasoning Engines.
 * Supports remote agent engine discovery via python probe scripts, stateful HTTP streaming
 * query tests via SSE, session auto-initialization, URL resolving, and error diagnosis.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import { GcloudDetector } from './GcloudDetector';
import { ArtifactStager } from './ArtifactStager';
import { AgentEngineTestOptions, AgentEngineTestResult } from './DeployTypes';
import { WebviewBridge } from '../WebviewBridge';

export class ReasoningEngineClient {
  constructor(
    private deployer: any,
    private gcloudDetector: GcloudDetector,
    private artifactStager: ArtifactStager,
    private pythonResolver?: { resolvePythonEnvironment(): Promise<{ path: string } | null> }
  ) {}

  /**
   * Discovers the full resource name of an existing Reasoning Engine on Vertex AI with matching display name.
   */
  public async findExistingReasoningEngine(
    projectId: string,
    region: string,
    displayName: string
  ): Promise<string | null> {
    const os = require('os');
    const fsPromises = require('fs').promises;

    const tempScriptDir = os.tmpdir();
    const tempScriptPath = path.join(
      tempScriptDir,
      `probe_engine_${Date.now()}_${Math.random().toString(36).substring(2, 10)}.py`
    );

    const scriptContent = `import sys
import vertexai

try:
    project = sys.argv[1]
    location = sys.argv[2]
    display_name = sys.argv[3]
    client = vertexai.Client(project=project, location=location)
    sys.stdout.write(next((getattr(e.api_resource, 'name', '') for e in client.agent_engines.list() if getattr(e.api_resource, 'display_name', '') == display_name), ''))
except Exception as e:
    sys.stderr.write(str(e))
    sys.exit(1)
`;

    try {
      const pipxPython = path.join(process.env.HOME || '', '.local/pipx/venvs/google-adk/bin/python');
      let pythonCmd = fs.existsSync(pipxPython) ? pipxPython : 'python3';

      if (pythonCmd === 'python3' && this.pythonResolver) {
        const resolved = await this.pythonResolver.resolvePythonEnvironment();
        if (resolved?.path) {
          pythonCmd = resolved.path;
        }
      }

      await fsPromises.writeFile(tempScriptPath, scriptContent, 'utf8');

      const { execFileAsync } = require('../asyncUtils');
      const { stdout } = await execFileAsync(pythonCmd, [tempScriptPath, projectId, region, displayName], {
        timeoutMs: 8000,
      });

      return stdout.trim() || null;
    } catch (err: any) {
      try {
        const { outputChannel } = require('../extension');
        outputChannel?.appendLine(`[ReasoningEngineClient] Error in findExistingReasoningEngine: ${err?.message || err}`);
        if (err?.stderr) {
          outputChannel?.appendLine(`[ReasoningEngineClient] Stderr: ${err.stderr.toString()}`);
        }
      } catch {
        // Ignore dynamic import / outputChannel errors in raw unit testing
      }
      console.warn(`[ReasoningEngineClient] Error in findExistingReasoningEngine:`, err);
      return null;
    } finally {
      try {
        await fsPromises.unlink(tempScriptPath);
      } catch {
        // Safe to ignore if file wasn't created or already deleted
      }
    }
  }

  /**
   * Deletes a Reasoning Engine instance from Vertex AI.
   */
  public async deleteReasoningEngine(projectId: string, region: string, resourceId: string): Promise<boolean> {
    const os = require('os');
    const fsPromises = require('fs').promises;

    const shortId = resourceId.split('/').pop() || resourceId;
    const tempScriptDir = os.tmpdir();
    const tempScriptPath = path.join(
      tempScriptDir,
      `delete_engine_${Date.now()}_${Math.random().toString(36).substring(2, 10)}.py`
    );

    const scriptContent = `import sys
import vertexai

try:
    project = sys.argv[1]
    location = sys.argv[2]
    engine_id = sys.argv[3]
    client = vertexai.Client(project=project, location=location)
    engine = client.agent_engines.get(engine_id)
    engine.delete()
    sys.stdout.write("SUCCESS")
except Exception as e:
    sys.stderr.write(str(e))
    sys.exit(1)
`;

    try {
      const pipxPython = path.join(process.env.HOME || '', '.local/pipx/venvs/google-adk/bin/python');
      let pythonCmd = fs.existsSync(pipxPython) ? pipxPython : 'python3';

      if (pythonCmd === 'python3' && this.pythonResolver) {
        const resolved = await this.pythonResolver.resolvePythonEnvironment();
        if (resolved?.path) {
          pythonCmd = resolved.path;
        }
      }

      await fsPromises.writeFile(tempScriptPath, scriptContent, 'utf8');

      const { execFileAsync } = require('../asyncUtils');
      await execFileAsync(pythonCmd, [tempScriptPath, projectId, region, shortId], {
        timeoutMs: 15000,
      });

      return true;
    } catch (err: any) {
      console.warn(`[ReasoningEngineClient] Error in deleteReasoningEngine:`, err);
      return false;
    } finally {
      try {
        await fsPromises.unlink(tempScriptPath);
      } catch {}
    }
  }

  /**
   * Executes a live test query against the deployed remote Agent Runtime via the HTTP passthrough.
   */
  public async testRemoteAgentRuntime(options: AgentEngineTestOptions): Promise<AgentEngineTestResult> {
    const { targetDirectory, query, bridge } = options;
    const startTime = Date.now();

    let serviceUrl = options.serviceUrl;
    let remoteRuntimeId = options.remoteRuntimeId;

    if ((!serviceUrl || !remoteRuntimeId) && targetDirectory) {
      const meta = this.artifactStager.readDeploymentMetadata(targetDirectory);
      if (meta) {
        if (!serviceUrl && meta.service_url && !meta.service_url.includes('localhost') && !meta.service_url.includes('127.0.0.1')) {
          serviceUrl = meta.service_url;
        }
        remoteRuntimeId = remoteRuntimeId || meta.remote_agent_runtime_id;
      }
    }

    if (!serviceUrl && remoteRuntimeId) {
      const locationMatch = remoteRuntimeId.match(/\/locations\/([^/]+)\//);
      const loc = locationMatch ? locationMatch[1] : 'us-central1';
      serviceUrl = this.resolveEndpointUrl(loc, '', remoteRuntimeId);
    }

    if (serviceUrl && serviceUrl.includes('/api/run_sse')) {
      try {
        const u = new URL(serviceUrl);
        if (u.pathname.includes('/reasoningEngines/')) {
          u.pathname = u.pathname.replace(/\/api\/run_sse\b/, ':streamQuery');
          if (!u.searchParams.has('alt')) {
            u.searchParams.set('alt', 'sse');
          }
          serviceUrl = u.toString();
        }
      } catch {}
    }

    if (!serviceUrl) {
      const err = 'No active remote Agent Runtime endpoint found. Please deploy the agent first.';
      if (bridge) {
        bridge.postMessage({
          type: 'AGENT_ENGINE_TEST_RESULT',
          payload: {
            success: false,
            query,
            durationMs: 0,
            error: err,
          },
        });
      }
      return { success: false, query, durationMs: 0, error: err };
    }

    try {
      this.logToBridge(bridge, `[Test] Sending query to ${serviceUrl}...`, 'system');

      const { response: responseText, remoteSessionId: resolvedSessionId } = await this.performHttpQuery(
        serviceUrl,
        query,
        options.abortSignal,
        options.onChunk,
        options.remoteSessionId
      );
      const durationMs = Date.now() - startTime;

      if (bridge) {
        bridge.postMessage({
          type: 'AGENT_ENGINE_TEST_RESULT',
          payload: {
            success: true,
            query,
            response: responseText,
            durationMs,
          },
        });
      }

      return {
        success: true,
        query,
        response: responseText,
        durationMs,
        remoteSessionId: resolvedSessionId,
      };
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      let errMsg = this.formatErrorMessage(err);
      if (this.isReasoningEngineNotFoundError(errMsg)) {
        errMsg = `Reasoning Engine was not found on Vertex AI (404 NOT_FOUND). The instance may have been deleted in Google Cloud Console. Please click Deploy to automatically create a new instance.`;
      }

      this.logToBridge(bridge, `[Test Error] Query failed: ${errMsg}`, 'stderr');

      if (bridge) {
        bridge.postMessage({
          type: 'AGENT_ENGINE_TEST_RESULT',
          payload: {
            success: false,
            query,
            durationMs,
            error: errMsg,
          },
        });
      }

      return {
        success: false,
        query,
        durationMs,
        error: errMsg,
      };
    }
  }

  /**
   * Helper to create an ADK session on Vertex AI Reasoning Engine before streaming query execution.
   */
  private createReasoningEngineSession(
    queryUrl: string,
    authHeader: string,
    abortSignal?: AbortSignal
  ): Promise<string | undefined> {
    return new Promise((resolve) => {
      try {
        if (abortSignal?.aborted) {
          resolve(undefined);
          return;
        }

        const urlObj = new URL(queryUrl);
        const client = urlObj.protocol === 'https:' ? https : http;
        const body = JSON.stringify({
          class_method: 'async_create_session',
          input: { user_id: 'vad_user' },
        });

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body).toString(),
        };
        if (authHeader) {
          headers['Authorization'] = authHeader;
        }

        const req = client.request(
          urlObj,
          {
            method: 'POST',
            headers,
            timeout: 10000,
          },
          (res) => {
            res.on('error', () => resolve(undefined));

            let resData = '';
            res.on('data', (c) => {
              resData += c;
            });
            res.on('end', () => {
              try {
                const parsed = JSON.parse(resData);
                const sessionObj = parsed.output || parsed;
                const id = sessionObj?.id || sessionObj?.session_id;
                resolve(id || undefined);
              } catch {
                resolve(undefined);
              }
            });
          }
        );

        req.on('error', () => resolve(undefined));
        req.on('timeout', () => {
          try {
            req.destroy();
          } catch {}
          resolve(undefined);
        });

        if (abortSignal) {
          abortSignal.addEventListener(
            'abort',
            () => {
              try {
                req.destroy();
              } catch {}
              resolve(undefined);
            },
            { once: true }
          );
        }

        req.write(body);
        req.end();
      } catch {
        resolve(undefined);
      }
    });
  }

  /**
   * Public performHttpQuery method that delegates to deployer if overridden.
   */
  public async performHttpQuery(
    serviceUrl: string,
    query: string,
    abortSignal?: AbortSignal,
    onChunk?: (chunkText: string) => void,
    existingSessionId?: string
  ): Promise<{ response: string; remoteSessionId?: string }> {
    if (this.deployer && this.deployer.performHttpQuery !== AgentEngineDeployer.prototype.performHttpQuery) {
      return this.deployer.performHttpQuery(serviceUrl, query, abortSignal, onChunk, existingSessionId);
    }
    return this.performHttpQueryInternal(serviceUrl, query, abortSignal, onChunk, existingSessionId);
  }

  /**
   * Internal helper to perform HTTP/HTTPS POST query to the reasoning engine endpoint.
   */
  public async performHttpQueryInternal(
    serviceUrl: string,
    query: string,
    abortSignal?: AbortSignal,
    onChunk?: (chunkText: string) => void,
    existingSessionId?: string
  ): Promise<{ response: string; remoteSessionId?: string }> {
    let normalizedUrl = serviceUrl;
    if (normalizedUrl.includes('/api/run_sse')) {
      try {
        const u = new URL(normalizedUrl);
        if (u.pathname.includes('/reasoningEngines/')) {
          u.pathname = u.pathname.replace(/\/api\/run_sse\b/, ':streamQuery');
          if (!u.searchParams.has('alt')) {
            u.searchParams.set('alt', 'sse');
          }
          normalizedUrl = u.toString();
        }
      } catch {}
    }

    const urlObj = new URL(normalizedUrl);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;

    const isAgentEngine =
      urlObj.hostname.includes('aiplatform.googleapis.com') ||
      (urlObj.pathname.includes('reasoningEngines') &&
        !urlObj.hostname.includes('127.0.0.1') &&
        !urlObj.hostname.includes('localhost'));

    let authHeader = '';
    try {
      authHeader = await this.gcloudDetector.getAccessTokenHeader();
    } catch {
      // Proceeding without explicit auth header
    }

    if (isAgentEngine && !authHeader) {
      throw new Error(
        `Google Cloud authentication failed: Missing required OAuth 2 access token for remote Vertex AI Reasoning Engine. Please ensure the Google Cloud SDK (gcloud) is installed and authenticated by running 'gcloud auth login' and 'gcloud auth application-default login' in your terminal.`
      );
    }

    let sessionId: string | undefined = existingSessionId;
    if (!sessionId && isAgentEngine) {
      try {
        const sessionUrl = normalizedUrl.replace(/:streamQuery.*$/, ':query');
        sessionId = await this.createReasoningEngineSession(sessionUrl, authHeader, abortSignal);
      } catch {
        // Fall back if session service is not configured
      }
    }

    const payload = JSON.stringify(
      isAgentEngine
        ? {
            class_method: 'async_stream_query',
            input: {
              user_id: 'vad_user',
              ...(sessionId ? { session_id: sessionId } : {}),
              message: query,
            },
          }
        : {
            input: {
              query,
            },
          }
    );

    return new Promise<{ response: string; remoteSessionId?: string }>((resolve, reject) => {
      try {
        if (abortSignal?.aborted) {
          reject(new Error('Remote request was cancelled by user.'));
          return;
        }

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload).toString(),
        };

        if (authHeader) {
          headers['Authorization'] = authHeader;
        }

        const req = client.request(
          urlObj,
          {
            method: 'POST',
            headers,
            timeout: 60000,
          },
          (res) => {
            res.on('error', (resErr) => {
              reject(resErr);
            });

            let body = '';
            let streamBuffer = '';

            res.on('data', (chunk) => {
              const str = chunk.toString();
              body += str;

              if (onChunk) {
                streamBuffer += str;
                const lines = streamBuffer.split('\n');
                streamBuffer = lines.pop() || '';

                for (const line of lines) {
                  const trimmed = line.trim();
                  if (trimmed.startsWith('data:')) {
                    const jsonCandidate = trimmed.slice(5).trim();
                    try {
                      const evt = JSON.parse(jsonCandidate);
                      let chunkPiece = '';
                      if (evt.content?.parts) {
                        for (const part of evt.content.parts) {
                          if (part.text) chunkPiece += part.text;
                        }
                      } else if (Array.isArray(evt.parts)) {
                        for (const part of evt.parts) {
                          if (part.text) chunkPiece += part.text;
                        }
                      } else if (evt.output && typeof evt.output === 'string') {
                        chunkPiece = evt.output;
                      }
                      if (chunkPiece) {
                        onChunk(chunkPiece);
                      }
                    } catch {}
                  }
                }
              }
            });

            res.on('end', () => {
              if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                if (!body || body.trim().length === 0) {
                  reject(
                    new Error(
                      'Remote Reasoning Engine closed the HTTP connection without returning any response content (0 bytes received). ' +
                      'This indicates a container-level session error or stream termination. ' +
                      'Please verify the container logs in Google Cloud Logging or redeploy with in-memory session service.'
                    )
                  );
                  return;
                }

                if (onChunk && streamBuffer.trim().startsWith('data:')) {
                  try {
                    const evt = JSON.parse(streamBuffer.trim().slice(5).trim());
                    let chunkPiece = '';
                    if (evt.content?.parts) {
                      for (const part of evt.content.parts) {
                        if (part.text) chunkPiece += part.text;
                      }
                    } else if (Array.isArray(evt.parts)) {
                      for (const part of evt.parts) {
                        if (part.text) chunkPiece += part.text;
                      }
                    } else if (evt.output && typeof evt.output === 'string') {
                      chunkPiece = evt.output;
                    }
                    if (chunkPiece) {
                      onChunk(chunkPiece);
                    }
                  } catch {}
                }

                try {
                  const lines = body.split('\n').filter(Boolean);
                  let accumulatedText = '';
                  let hasParsedEvents = false;

                  for (const line of lines) {
                    const trimmed = line.trim();
                    const jsonCandidate = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed;
                    try {
                      const evt = JSON.parse(jsonCandidate);
                      hasParsedEvents = true;
                      if (evt.content?.parts) {
                        for (const part of evt.content.parts) {
                          if (part.text) {
                            accumulatedText += part.text;
                          }
                        }
                      } else if (Array.isArray(evt.parts)) {
                        for (const part of evt.parts) {
                          if (part.text) {
                            accumulatedText += part.text;
                          }
                        }
                      } else if (evt.output) {
                        accumulatedText +=
                          typeof evt.output === 'string' ? evt.output : JSON.stringify(evt.output);
                      }
                    } catch {
                      // fallback raw line
                    }
                  }

                  if (hasParsedEvents && accumulatedText.trim().length > 0) {
                    resolve({ response: accumulatedText.trim(), remoteSessionId: sessionId });
                  } else {
                    const fallbackParsed = JSON.parse(body);
                    const finalOutput =
                      fallbackParsed.output ||
                      fallbackParsed.response ||
                      fallbackParsed.choices?.[0]?.message?.content ||
                      fallbackParsed.text;
                    if (finalOutput) {
                      resolve({
                        response: typeof finalOutput === 'string' ? finalOutput : JSON.stringify(finalOutput),
                        remoteSessionId: sessionId,
                      });
                    } else if (body.trim().length > 0) {
                      resolve({ response: body.trim(), remoteSessionId: sessionId });
                    } else {
                      reject(new Error('Remote Reasoning Engine returned an empty response.'));
                    }
                  }
                } catch {
                  if (body.trim().length > 0) {
                    resolve({ response: body.trim(), remoteSessionId: sessionId });
                  } else {
                    reject(new Error('Remote Reasoning Engine returned an empty response.'));
                  }
                }
              } else {
                let errorMsg = body || res.statusMessage || `HTTP ${res.statusCode}`;
                try {
                  const parsed = JSON.parse(body);
                  if (parsed.error?.message) {
                    errorMsg = parsed.error.message;
                    if (errorMsg.includes('Invalid agent name')) {
                      errorMsg += ' (Redeploy the agent to automatically apply valid Python identifier naming).';
                    }
                  }
                } catch {}
                reject(new Error(`HTTP ${res.statusCode}: ${errorMsg}`));
              }
            });
          }
        );

        let cleanupAbort: (() => void) | undefined;
        if (abortSignal) {
          const onAbort = () => {
            req.destroy(new Error('Remote request was cancelled by user.'));
            reject(new Error('Remote request was cancelled by user.'));
          };
          abortSignal.addEventListener('abort', onAbort, { once: true });
          cleanupAbort = () => abortSignal.removeEventListener('abort', onAbort);
        }

        req.on('error', (err) => {
          if (cleanupAbort) cleanupAbort();
          reject(err);
        });

        req.on('timeout', () => {
          if (cleanupAbort) cleanupAbort();
          req.destroy(new Error('Connection timed out after 60 seconds'));
        });

        req.on('close', () => {
          if (cleanupAbort) cleanupAbort();
        });

        req.write(payload);
        req.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Constructs the Google Cloud Console URL for a given Vertex AI Agent Runtime resource.
   */
  public resolveConsoleUrl(location: string, projectId: string, resourceId: string): string {
    const shortId = resourceId.split('/').pop() || resourceId;
    return `https://console.cloud.google.com/vertex-ai/reasoning-engines/locations/${location}/reasoning-engines/${shortId}?project=${projectId}`;
  }

  /**
   * Constructs the live HTTP streaming URL for invoking the deployed Agent Runtime.
   */
  public resolveEndpointUrl(location: string, projectId: string, resourceId: string): string {
    const isFullResource = resourceId.startsWith('projects/');
    const resourcePath = isFullResource
      ? resourceId
      : `projects/${projectId}/locations/${location}/reasoningEngines/${resourceId}`;
    return `https://${location}-aiplatform.googleapis.com/v1/${resourcePath}:streamQuery?alt=sse`;
  }

  /**
   * Evaluates whether a deployment failure message or build logs indicate that the targeted
   * Reasoning Engine resource was deleted in the Google Cloud Console or does not exist on Vertex AI (404 NOT_FOUND).
   */
  public isReasoningEngineNotFoundError(message?: string, logs: string[] = []): boolean {
    const combined = ((message || '') + ' ' + logs.join(' ')).toLowerCase();
    const hasNotFound = combined.includes('not found') || combined.includes('not_found');
    const has404 = combined.includes('404');
    const hasReasoningContext =
      combined.includes('reasoning engine') ||
      combined.includes('agent engine') ||
      combined.includes('reasoningengine') ||
      combined.includes('reasoningengines');

    if (combined.includes('is not found') && hasReasoningContext) {
      return true;
    }
    if (has404 && hasNotFound && hasReasoningContext) {
      return true;
    }
    if (hasNotFound && combined.includes('reasoningengines/')) {
      return true;
    }
    return false;
  }

  /**
   * Formats an error into a human-readable diagnostic string, unpacking inner errors
   * for Node.js `AggregateError` instances (such as network or connect failures).
   */
  public formatErrorMessage(err: any): string {
    if (!err) return 'Unknown error';
    if (Array.isArray(err.errors) && err.errors.length > 0) {
      const details = err.errors.map((e: any) => e?.message || String(e)).filter(Boolean).join('; ');
      return err.message && err.message.trim().length > 0 ? `${err.message}: ${details}` : details;
    }
    return err.message || String(err);
  }

  /**
   * Helper to send log messages through WebviewBridge.
   */
  private logToBridge(
    bridge: WebviewBridge | undefined,
    text: string,
    stream: 'stdout' | 'stderr' | 'system'
  ): void {
    if (!bridge) return;
    bridge.postMessage({
      type: 'AGENT_ENGINE_DEPLOY_LOG',
      payload: {
        text,
        stream,
        timestamp: new Date().toISOString(),
      },
    });
  }
}

// Forward reference import to break circular dependency typechecks
import { AgentEngineDeployer } from '../AgentEngineDeployer';
