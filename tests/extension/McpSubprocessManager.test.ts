/**
 * McpSubprocessManager Unit Tests
 *
 * Verifies that McpSubprocessManager correctly handles JSON-RPC 2.0 handshake negotiation,
 * tool discovery, timeout enforcement, process lifecycle cleanup, and tool schema normalization.
 *
 * Author: Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { EventEmitter } from 'events';
import * as http from 'http';
import { McpSubprocessManager, ProcessSpawner } from '../../src/extension/McpSubprocessManager';

class MockChildProcess extends EventEmitter {
  public stdout = new EventEmitter();
  public stderr = new EventEmitter();
  public stdin = {
    write: (data: string) => {
      this.stdinWritten.push(data);
      this.handleIncomingStdin(data);
      return true;
    },
  };
  public stdinWritten: string[] = [];
  public killed = false;
  public killSignal?: string;

  public kill(signal?: string) {
    this.killed = true;
    this.killSignal = signal;
    return true;
  }

  // Simulated server logic
  public serverBehavior?: 'success' | 'init_error' | 'list_error' | 'hang';

  private handleIncomingStdin(data: string) {
    if (this.serverBehavior === 'hang') {
      return; // Simulate hanging server
    }

    const lines = data.trim().split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line.trim());
        if (msg.method === 'initialize') {
          if (this.serverBehavior === 'init_error') {
            process.nextTick(() => {
              this.stdout.emit('data', JSON.stringify({
                jsonrpc: '2.0',
                id: msg.id,
                error: { code: -32603, message: 'Simulated initialization failure' },
              }) + '\n');
            });
            return;
          }

          process.nextTick(() => {
            this.stdout.emit('data', JSON.stringify({
              jsonrpc: '2.0',
              id: msg.id,
              result: {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: {
                  name: 'test-mcp-server',
                  version: '2.1.0',
                },
              },
            }) + '\n');
          });
        } else if (msg.method === 'tools/list') {
          if (this.serverBehavior === 'list_error') {
            process.nextTick(() => {
              this.stdout.emit('data', JSON.stringify({
                jsonrpc: '2.0',
                id: msg.id,
                error: { code: -32601, message: 'Method not found' },
              }) + '\n');
            });
            return;
          }

          process.nextTick(() => {
            this.stdout.emit('data', JSON.stringify({
              jsonrpc: '2.0',
              id: msg.id,
              result: {
                tools: [
                  {
                    name: 'read_query',
                    description: 'Reads data from source',
                    inputSchema: {
                      type: 'object',
                      properties: {
                        query: { type: 'string', description: 'SQL or filter query' },
                        limit: { type: 'number', description: 'Maximum rows' },
                      },
                      required: ['query'],
                    },
                  },
                  {
                    name: 'write_record',
                    description: 'Writes a record',
                    inputSchema: {
                      type: 'object',
                      properties: {
                        record: { type: 'object' },
                      },
                    },
                  },
                ],
              },
            }) + '\n');
          });
        }
      } catch {
        // Ignore unparseable
      }
    }
  }
}

describe('McpSubprocessManager', () => {
  it('should successfully negotiate JSON-RPC 2.0 handshake and discover tools over stdio', async () => {
    let spawnedMock: MockChildProcess | null = null;
    const mockSpawner: ProcessSpawner = (cmd, args, opts) => {
      spawnedMock = new MockChildProcess();
      spawnedMock.serverBehavior = 'success';
      return spawnedMock as any;
    };

    const manager = new McpSubprocessManager(mockSpawner);
    const result = await manager.discoverTools({
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-postgres'],
      cwd: '/workspace',
      envVars: { PG_URI: 'postgresql://localhost:5432/test' },
      timeoutSeconds: 5,
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.serverInfo?.name, 'test-mcp-server');
    assert.strictEqual(result.serverInfo?.version, '2.1.0');
    assert.strictEqual(result.tools.length, 2);

    const tool1 = result.tools[0];
    assert.strictEqual(tool1.name, 'read_query');
    assert.strictEqual(tool1.id, 'mcp_test_mcp_server_read_query');
    assert.strictEqual(tool1.description, 'Reads data from source');
    assert.strictEqual(tool1.parameters?.query, 'SQL or filter query');
    assert.strictEqual(tool1.parameters?.limit, 'Maximum rows');
    assert.ok(typeof result.latencyMs === 'number' && result.latencyMs >= 0);

    // Verify child was killed cleanly
    assert.strictEqual(spawnedMock?.killed, true);
  });

  it('should reject when command is missing for stdio transport', async () => {
    const manager = new McpSubprocessManager();
    const result = await manager.discoverTools({
      transport: 'stdio',
      command: '',
    });

    assert.strictEqual(result.success, false);
    assert.match(result.error || '', /requires a valid command/);
  });

  it('should handle initialization error from server gracefully', async () => {
    const mockSpawner: ProcessSpawner = () => {
      const mock = new MockChildProcess();
      mock.serverBehavior = 'init_error';
      return mock as any;
    };

    const manager = new McpSubprocessManager(mockSpawner);
    const result = await manager.discoverTools({
      transport: 'stdio',
      command: 'uvx',
      args: ['some-broken-server'],
      timeoutSeconds: 5,
    });

    assert.strictEqual(result.success, false);
    assert.match(result.error || '', /Simulated initialization failure/);
  });

  it('should handle tools/list error from server gracefully', async () => {
    const mockSpawner: ProcessSpawner = () => {
      const mock = new MockChildProcess();
      mock.serverBehavior = 'list_error';
      return mock as any;
    };

    const manager = new McpSubprocessManager(mockSpawner);
    const result = await manager.discoverTools({
      transport: 'stdio',
      command: 'python',
      args: ['-m', 'my_server'],
      timeoutSeconds: 5,
    });

    assert.strictEqual(result.success, false);
    assert.match(result.error || '', /Method not found/);
  });

  it('should timeout and terminate process when MCP server hangs', async () => {
    let spawnedMock: MockChildProcess | null = null;
    const mockSpawner: ProcessSpawner = () => {
      spawnedMock = new MockChildProcess();
      spawnedMock.serverBehavior = 'hang';
      return spawnedMock as any;
    };

    const manager = new McpSubprocessManager(mockSpawner);
    const result = await manager.discoverTools({
      transport: 'stdio',
      command: 'node',
      args: ['hanging-server.js'],
      timeoutSeconds: 0.1, // 100ms timeout
    });

    assert.strictEqual(result.success, false);
    assert.match(result.error || '', /timed out/);
    assert.strictEqual(spawnedMock?.killed, true);
  });

  it('should handle process spawn error (e.g. ENOENT)', async () => {
    const mockSpawner: ProcessSpawner = () => {
      const mock = new MockChildProcess();
      process.nextTick(() => {
        const err: any = new Error('spawn non_existent_cmd ENOENT');
        err.code = 'ENOENT';
        mock.emit('error', err);
      });
      return mock as any;
    };

    const manager = new McpSubprocessManager(mockSpawner);
    const result = await manager.discoverTools({
      transport: 'stdio',
      command: 'non_existent_cmd',
      timeoutSeconds: 5,
    });

    assert.strictEqual(result.success, false);
    assert.match(result.error || '', /ENOENT/);
  });

  it('should handle unexpected process exit with non-zero exit code', async () => {
    const mockSpawner: ProcessSpawner = () => {
      const mock = new MockChildProcess();
      process.nextTick(() => {
        mock.stderr.emit('data', 'SyntaxError: unexpected token');
        mock.emit('exit', 1, null);
      });
      return mock as any;
    };

    const manager = new McpSubprocessManager(mockSpawner);
    const result = await manager.discoverTools({
      transport: 'stdio',
      command: 'python',
      args: ['bad_syntax.py'],
      timeoutSeconds: 5,
    });

    assert.strictEqual(result.success, false);
    assert.match(result.error || '', /exited unexpectedly with code 1/);
    assert.match(result.error || '', /SyntaxError/);
  });

  it('should reject invalid URL for HTTP transport', async () => {
    const manager = new McpSubprocessManager();
    const result = await manager.discoverTools({
      transport: 'http',
      url: 'not-a-valid-url',
    });

    assert.strictEqual(result.success, false);
    assert.match(result.error || '', /Invalid MCP URL/);
  });

  it('should normalize raw MCP tools defensively', () => {
    const manager = new McpSubprocessManager();
    const raw = [
      {
        name: 'test_tool',
        description: 'Test description',
        inputSchema: {
          properties: {
            foo: { type: 'string', description: 'Foo field' },
            bar: { type: 'number' },
          },
        },
      },
    ];

    const normalized = manager.normalizeMcpTools(raw, 'My-Server!');
    assert.strictEqual(normalized.length, 1);
    assert.strictEqual(normalized[0].id, 'mcp_my_server_test_tool');
    assert.strictEqual(normalized[0].name, 'test_tool');
    assert.strictEqual(normalized[0].parameters?.foo, 'Foo field');
    assert.strictEqual(normalized[0].parameters?.bar, 'number');

    // Test with non-array input
    assert.deepStrictEqual(manager.normalizeMcpTools(null as any, 'server'), []);
  });

  it('should discover tools over HTTP and support Google Cloud ADC authentication', async () => {
    let capturedHeaders: http.IncomingHttpHeaders = {};
    let requestCount = 0;

    const server = http.createServer((req, res) => {
      requestCount++;
      capturedHeaders = req.headers;
      let body = '';
      req.on('data', (c) => { body += c.toString(); });
      req.on('end', () => {
        const parsed = JSON.parse(body);
        if (parsed.method === 'initialize') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            id: parsed.id,
            result: {
              protocolVersion: '2024-11-05',
              serverInfo: { name: 'MockGoogleServer', version: '1.0.0' },
            },
          }));
        } else if (parsed.method === 'tools/list') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            id: parsed.id,
            result: {
              tools: [
                {
                  name: 'list_datasets',
                  description: 'List BigQuery datasets',
                  inputSchema: { type: 'object', properties: {} },
                },
              ],
            },
          }));
        }
      });
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as any).port;
    const url = `http://127.0.0.1:${port}/mcp`;

    try {
      const manager = new McpSubprocessManager();
      // Stub resolveGoogleCredentials to verify injection
      manager.resolveGoogleCredentials = async () => ({
        token: 'ya29.mock_token_abc123',
        projectId: 'mock-gcp-project',
      });

      const result = await manager.discoverTools({
        transport: 'http',
        url,
        authProviderType: 'google_credentials',
        oauthConfig: {
          scopes: ['https://www.googleapis.com/auth/cloud-platform'],
          projectId: 'mock-gcp-project',
        },
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.tools.length, 1);
      assert.strictEqual(result.tools[0].name, 'list_datasets');
      assert.strictEqual(result.serverInfo?.name, 'MockGoogleServer');
      assert.strictEqual(requestCount, 2, 'Should have issued initialize and tools/list');
      assert.strictEqual(capturedHeaders['authorization'], 'Bearer ya29.mock_token_abc123');
      assert.strictEqual(capturedHeaders['x-goog-user-project'], 'mock-gcp-project');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('should handle failure to resolve Google Cloud ADC credentials gracefully', async () => {
    const manager = new McpSubprocessManager();
    manager.resolveGoogleCredentials = async () => {
      throw new Error('Failed to acquire Google Cloud Application Default Credentials.');
    };

    const result = await manager.discoverTools({
      transport: 'http',
      url: 'http://127.0.0.1:9999/mcp',
      authProviderType: 'google_credentials',
    });

    assert.strictEqual(result.success, false);
    assert.match(result.error || '', /Application Default Credentials/);
  });

  it('should parse Server-Sent Events (SSE) streaming responses correctly', () => {
    const ssePayload = 'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"tools":[{"name":"get_stock_quote","description":"Fetches quotes"}]}}\n\n';
    const parsed = McpSubprocessManager.parseSseOrJsonPayload(ssePayload);
    assert.ok(parsed, 'Should parse SSE message event data');
    assert.strictEqual(parsed.id, 1);
    assert.strictEqual(parsed.result.tools[0].name, 'get_stock_quote');
  });

  it('should detect HTTP 401 Unauthorized and return requiresAuth: true', async () => {
    let capturedHeaders: Record<string, string | string[] | undefined> = {};
    const server = http.createServer((req, res) => {
      capturedHeaders = req.headers;
      res.writeHead(401, {
        'Content-Type': 'application/json',
        'WWW-Authenticate': 'Bearer error="invalid_token", error_description="The access token expired"',
      });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as any).port;

    try {
      const manager = new McpSubprocessManager();
      const result = await manager.discoverTools({
        transport: 'http',
        url: `http://127.0.0.1:${port}/mcp`,
        bearerToken: 'expired-token',
      });

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.requiresAuth, true);
      assert.strictEqual(result.authType, 'oauth');
      assert.match(result.error || '', /401/);
      assert.strictEqual(capturedHeaders['authorization'], 'Bearer expired-token');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('should inject Bearer token headers into Streamable HTTP MCP handshake requests', async () => {
    let capturedHeaders: Record<string, string | string[] | undefined> = {};
    const server = http.createServer((req, res) => {
      capturedHeaders = req.headers;
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const msg = JSON.parse(body);
        if (msg.method === 'initialize') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            id: msg.id,
            result: { protocolVersion: '2024-11-05', serverInfo: { name: 'SlackServer' } },
          }));
        } else if (msg.method === 'tools/list') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            id: msg.id,
            result: { tools: [{ name: 'post_slack_message' }] },
          }));
        }
      });
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as any).port;

    try {
      const manager = new McpSubprocessManager();
      const result = await manager.discoverTools({
        transport: 'http',
        url: `http://127.0.0.1:${port}/mcp`,
        bearerToken: 'xoxb-valid-slack-token',
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.tools[0].name, 'post_slack_message');
      assert.strictEqual(capturedHeaders['authorization'], 'Bearer xoxb-valid-slack-token');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
