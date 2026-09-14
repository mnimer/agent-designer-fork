/**
 * subprocessInjection.test.ts
 *
 * Security testing suite verifying immunity to shell and command injection vulnerabilities.
 * Asserts that:
 * 1. AgentEngineDeployer's probe and binary utilities pass command injection vectors safely as literal arguments.
 * 2. McpOAuthManager strictly validates URL protocols (http/https only) and rejects javascript:, file:, and other unsafe schemes.
 * 3. McpSubprocessManager resolves credentials using secure non-shell execFile arrays.
 * 4. AgentRunnerManager resolves GCP project ID safely using secure non-shell execFile arrays.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import child_process from 'child_process';
import * as vscode from 'vscode';

import { AgentEngineDeployer } from '../../src/extension/AgentEngineDeployer';
import { McpOAuthManager } from '../../src/extension/McpOAuthManager';
import { McpSubprocessManager } from '../../src/extension/McpSubprocessManager';
import { AgentRunnerManager } from '../../src/extension/AgentRunnerManager';

// Mock VS Code SecretStorage
class MockSecretStorage {
  private secrets = new Map<string, string>();
  async get(key: string): Promise<string | undefined> {
    return this.secrets.get(key);
  }
  async store(key: string, value: string): Promise<void> {
    this.secrets.set(key, value);
  }
  async delete(key: string): Promise<void> {
    this.secrets.delete(key);
  }
  onDidChange = () => ({ dispose: () => {} });
}

function createMockContext(mockSecrets: MockSecretStorage): vscode.ExtensionContext {
  return {
    secrets: mockSecrets,
    subscriptions: [],
    workspaceState: {} as any,
    globalState: {} as any,
    extensionUri: {} as any,
    extensionPath: '',
    asAbsolutePath: (p: string) => p,
    storageUri: undefined,
    storagePath: undefined,
    globalStorageUri: {} as any,
    globalStoragePath: '',
    logUri: {} as any,
    logPath: '',
    extensionMode: 1,
    environmentVariableCollection: {} as any,
  } as unknown as vscode.ExtensionContext;
}

describe('Subprocess Injection & Security Hardening (TASK-133)', () => {
  let originalExecFileSync: any;
  let originalExecFile: any;
  let originalSpawn: any;
  let lastExecFileCall: { file: string; args: string[]; options: any } | null = null;
  let lastSpawnCall: { command: string; args: string[]; options: any } | null = null;

  beforeEach(() => {
    lastExecFileCall = null;
    lastSpawnCall = null;
    originalExecFileSync = child_process.execFileSync;
    originalExecFile = child_process.execFile;
    originalSpawn = child_process.spawn;

    // Spy on child_process.execFileSync
    (child_process as any).execFileSync = (file: string, args: string[], options: any) => {
      lastExecFileCall = { file, args, options };
      return Buffer.from('mock-value');
    };

    // Spy on child_process.execFile
    (child_process as any).execFile = (file: string, args: string[], options: any, callback?: any) => {
      lastExecFileCall = { file, args, options };
      const cb = typeof options === 'function' ? options : callback;
      if (cb) {
        process.nextTick(() => cb(null, { stdout: 'ya29.mock-token\n', stderr: '' }));
      }

      // Return a stream-compatible EventEmitter to support execFileAsync streams-based tracking
      const stdoutStream = new (require('stream').Readable)({
        read() {
          // If we are checking gcloud config project, return safe-project, otherwise mock-token
          if (args && args.includes('project')) {
            this.push('safe-project\n');
          } else {
            this.push('ya29.mock-token\n');
          }
          this.push(null);
        }
      });
      const stderrStream = new (require('stream').Readable)({
        read() {
          this.push(null);
        }
      });

      const mockChild = new (require('events').EventEmitter)();
      (mockChild as any).stdout = stdoutStream;
      (mockChild as any).stderr = stderrStream;
      (mockChild as any).kill = () => {};
      (mockChild as any).killed = true;

      setTimeout(() => {
        mockChild.emit('close', 0, null);
      }, 5);

      return mockChild as any;
    };

    // Spy on child_process.spawn
    (child_process as any).spawn = (command: string, args: string[], options: any) => {
      lastSpawnCall = { command, args, options };
      return {
        on: () => {},
        stdout: { on: () => {} },
        stderr: { on: () => {} },
      } as any;
    };
  });

  afterEach(() => {
    (child_process as any).execFileSync = originalExecFileSync;
    (child_process as any).execFile = originalExecFile;
    (child_process as any).spawn = originalSpawn;
  });

  describe('McpOAuthManager - URL Protocol Safeguard', () => {
    it('should strictly reject non-http/https URL schemes in OAuth URLs', async () => {
      const mockSecrets = new MockSecretStorage();
      const context = createMockContext(mockSecrets);
      const manager = new McpOAuthManager(context);

      const invalidUrls = [
        'javascript:alert(document.cookie)',
        'file:///etc/passwd',
        'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
        'ftp://malicious-server.com',
        'gopher://unsafe-scheme.com',
      ];

      for (const unsafeUrl of invalidUrls) {
        const result = await manager.startOAuthFlow({
          authUrl: unsafeUrl,
          timeoutMs: 100, // Ephemeral fast exit
        });

        assert.strictEqual(result.success, false);
        assert.ok(result.error?.includes('Unsafe or invalid OAuth URL') || result.error?.includes('launch browser'));
      }
    });

    it('should allow valid http/https URLs and call spawn fallback if blocked', async () => {
      const mockSecrets = new MockSecretStorage();
      const context = createMockContext(mockSecrets);
      const manager = new McpOAuthManager(context);

      // Force openExternal to fail/return false to trigger OS fallback spawning
      const originalOpenExternal = vscode.env.openExternal;
      (vscode.env as any).openExternal = async () => false;

      try {
        const flowPromise = manager.startOAuthFlow({
          authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
          clientId: 'mock-client',
          scopes: ['profile'],
          timeoutMs: 100,
        });

        // Let the loopback server start and browser opener execute
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Verify the browser fallback opener was called using safe platform-specific spawn with shell: false
        assert.ok(lastSpawnCall !== null);
        assert.strictEqual(lastSpawnCall.options.shell, false);
        if (process.platform === 'darwin') {
          assert.strictEqual(lastSpawnCall.command, 'open');
        } else if (process.platform === 'win32') {
          assert.strictEqual(lastSpawnCall.command, 'cmd.exe');
          assert.deepEqual(lastSpawnCall.args[0], '/c');
        } else {
          assert.strictEqual(lastSpawnCall.command, 'xdg-open');
        }
      } finally {
        (vscode.env as any).openExternal = originalOpenExternal;
      }
    });
  });

  describe('AgentEngineDeployer - Command Injection Safeguard', () => {
    it('should pass command injection payloads as literal argv elements without shell interpretation', async () => {
      const deployer = new AgentEngineDeployer();

      const unsafeProjectId = 'my-project; touch /tmp/pwn1 #';
      const unsafeRegion = 'us-central1 & calc.exe';
      const unsafeDisplayName = 'my-agent-name $(rm -rf /)';

      await deployer.findExistingReasoningEngine(unsafeProjectId, unsafeRegion, unsafeDisplayName);

      assert.ok(lastExecFileCall !== null);
      // It must be invoking python directly
      assert.match(lastExecFileCall.file, /python/);
      assert.strictEqual(lastExecFileCall.options.shell, false);

      // Verify command line arguments passed to the python probe are intact and unmodified (no shell evaluated them)
      assert.strictEqual(lastExecFileCall.args[1], unsafeProjectId);
      assert.strictEqual(lastExecFileCall.args[2], unsafeRegion);
      assert.strictEqual(lastExecFileCall.args[3], unsafeDisplayName);
    });

    it('should check binary path securely without any subprocess execution', () => {
      const deployer = new AgentEngineDeployer();

      const unsafeBinaryName = 'gcloud; touch /tmp/pwned';
      const result = deployer.hasBinary(unsafeBinaryName);

      assert.strictEqual(result, false);
      assert.strictEqual(lastExecFileCall, null); // Asserts zero subprocesses were spawned
    });
  });

  describe('McpSubprocessManager - Credentials Safe Spawning', () => {
    it('should query gcloud config and token print-access-token using secure discrete arguments array', async () => {
      const manager = new McpSubprocessManager();

      const credentials = await manager.resolveGoogleCredentials({
        projectId: 'safe-project',
        scopes: ['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/userinfo.email'],
      });

      assert.ok(lastExecFileCall !== null);
      assert.strictEqual(lastExecFileCall.file, 'gcloud');
      assert.strictEqual(lastExecFileCall.options.shell, false);
      assert.deepEqual(lastExecFileCall.args, [
        'auth',
        'application-default',
        'print-access-token',
        '--scopes=https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/userinfo.email',
      ]);
    });
  });

  describe('AgentRunnerManager - Safe Project Discovery', () => {
    it('should query gcloud config project safely using execFile without shell', async () => {
      const manager = new AgentRunnerManager();
      const mockEnv: any = {};

      // Trigger auto-discovery
      await (manager as any).sanitizeExecutionEnv(mockEnv);

      assert.ok(lastExecFileCall !== null);
      assert.strictEqual(lastExecFileCall.file, 'gcloud');
      assert.strictEqual(lastExecFileCall.options.shell, false);
      assert.deepEqual(lastExecFileCall.args, ['config', 'get-value', 'project']);
    });
  });
});
