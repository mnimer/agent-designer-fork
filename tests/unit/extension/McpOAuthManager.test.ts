/**
 * McpOAuthManager Unit Tests
 *
 * Comprehensive unit test suite verifying:
 * 1. Redacted token preview formatting (e.g. xoxb...3456).
 * 2. SecretStorage persistence and workspace .env syncing with .gitignore protection.
 * 3. Retrieval of secrets from SecretStorage and fallback to .env file.
 * 4. OAuth 2.0 loopback server callback capture and code exchange flow.
 *
 * Author: Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import { McpOAuthManager } from '../../../src/extension/McpOAuthManager';

/**
 * Mock implementation of VS Code SecretStorage
 */
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

describe('McpOAuthManager', () => {
  it('should format token previews with masked characters and preserve suffix', () => {
    const mockSecrets = new MockSecretStorage();
    const manager = new McpOAuthManager(createMockContext(mockSecrets));

    assert.strictEqual(manager.getRedactedPreview(''), '••••••••');
    assert.strictEqual(manager.getRedactedPreview('short'), '••••••••');
    assert.strictEqual(manager.getRedactedPreview('xoxb-123456789-abcdef123456'), 'xoxb...3456');
    assert.strictEqual(manager.getRedactedPreview('ya29.a0ARrdaM-secret-bearer-token-1234'), 'ya29...1234');
  });

  it('should save secret to SecretStorage and sync to workspace .env file with .gitignore protection', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oauth-test-'));
    try {
      const mockSecrets = new MockSecretStorage();
      const manager = new McpOAuthManager(createMockContext(mockSecrets));

      const secretName = 'slack-bot-token';
      const envVar = 'SLACK_BOT_TOKEN';
      const token = 'xoxb-123456789-abcdef987654';

      await manager.saveSecret(secretName, envVar, token, tempDir);

      // Verify SecretStorage
      const stored = await mockSecrets.get(`mcp_secret_${secretName}`);
      assert.strictEqual(stored, token);

      // Verify .env file
      const envPath = path.join(tempDir, '.env');
      assert.strictEqual(fs.existsSync(envPath), true);
      const envContent = fs.readFileSync(envPath, 'utf8');
      assert.match(envContent, /SLACK_BOT_TOKEN="xoxb-123456789-abcdef987654"/);

      // Verify .gitignore protection
      const gitignorePath = path.join(tempDir, '.gitignore');
      assert.strictEqual(fs.existsSync(gitignorePath), true);
      const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
      assert.match(gitignoreContent, /\.env/);

      // Verify getSecret retrieves it from SecretStorage
      const retrieved = await manager.getSecret(secretName, envVar, tempDir);
      assert.strictEqual(retrieved, token);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should retrieve secret from workspace .env file when SecretStorage is empty', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oauth-test-fallback-'));
    try {
      const mockSecrets = new MockSecretStorage();
      const manager = new McpOAuthManager(createMockContext(mockSecrets));

      const secretName = 'yahoo-finance-token';
      const envVar = 'YAHOO_FINANCE_API_KEY';
      const token = 'yf-prod-secret-key-12345';

      // Pre-write .env without SecretStorage
      const envPath = path.join(tempDir, '.env');
      fs.writeFileSync(envPath, `OTHER_VAR=123\n${envVar}="${token}"\n`);

      const retrieved = await manager.getSecret(secretName, envVar, tempDir);
      assert.strictEqual(retrieved, token);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should execute OAuth loopback workflow, capturing callback query parameters and persisting token', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oauth-loopback-'));
    try {
      const mockSecrets = new MockSecretStorage();
      const manager = new McpOAuthManager(createMockContext(mockSecrets));

      let interceptedUrl: string | null = null;
      (vscode.env as any).openExternal = async (uri: vscode.Uri) => {
        interceptedUrl = uri.toString();
        // Extract redirect_uri from auth URL
        const parsedAuth = new URL(interceptedUrl);
        const redirectUri = parsedAuth.searchParams.get('redirect_uri')!;
        const state = parsedAuth.searchParams.get('state')!;

        // Simulate browser following redirect with token parameter
        setImmediate(() => {
          const callbackUrl = `${redirectUri}?token=xoxb-mock-captured-token-123&state=${state}`;
          http.get(callbackUrl, (res) => {
            res.resume();
          });
        });
        return true;
      };

      const result = await manager.startOAuthFlow({
        authUrl: 'https://slack.com/oauth/v2/authorize',
        clientId: 'mock-slack-client-id',
        scopes: ['chat:write', 'channels:read'],
        secretName: 'slack-captured-token',
        envVar: 'SLACK_TOKEN',
        workspaceDir: tempDir,
        timeoutMs: 5000,
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.bearerToken, 'xoxb-mock-captured-token-123');
      assert.strictEqual(result.tokenPreview, 'xoxb...-123');

      // Verify SecretStorage was populated
      const savedInStorage = await mockSecrets.get('mcp_secret_slack-captured-token');
      assert.strictEqual(savedInStorage, 'xoxb-mock-captured-token-123');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should exchange authorization code for token with clientId and clientSecret via POST', async () => {
    let receivedBody = '';
    const tokenServer = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        receivedBody = body;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            access_token: 'xoxb-exchanged-slack-token-5678',
            token_type: 'bearer',
            scope: 'chat:write,channels:read',
          })
        );
      });
    });

    await new Promise<void>((resolve) => tokenServer.listen(0, '127.0.0.1', () => resolve()));
    const tokenPort = (tokenServer.address() as any).port;

    try {
      const mockSecrets = new MockSecretStorage();
      const manager = new McpOAuthManager(createMockContext(mockSecrets));

      const token = await manager.exchangeCodeForToken({
        code: 'mock-auth-code-1234',
        tokenUrl: `http://127.0.0.1:${tokenPort}/oauth/access`,
        clientId: 'test-client-id-999',
        clientSecret: 'test-client-secret-abc',
        redirectUri: 'http://127.0.0.1:54321/callback',
      });

      assert.strictEqual(token, 'xoxb-exchanged-slack-token-5678');
      const params = new URLSearchParams(receivedBody);
      assert.strictEqual(params.get('grant_type'), 'authorization_code');
      assert.strictEqual(params.get('code'), 'mock-auth-code-1234');
      assert.strictEqual(params.get('client_id'), 'test-client-id-999');
      assert.strictEqual(params.get('client_secret'), 'test-client-secret-abc');
      assert.strictEqual(params.get('redirect_uri'), 'http://127.0.0.1:54321/callback');
    } finally {
      tokenServer.close();
    }
  });
});
