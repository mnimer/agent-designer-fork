/**
 * asyncOperations Test Suite
 *
 * Job & Purpose:
 * Validates non-blocking async execution, timeouts, AbortSignal cancellations, and McpOAuthManager fetch timeouts.
 * Enforces a static guard asserting that zero blocking execSync or execFileSync calls exist in critical paths.
 *
 * Author: Mike Nimer <mikenimer@google.com>
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import {
  execFileAsync,
  ProcessTimeoutError,
  ProcessCancellationError,
  ProcessExecutionError,
} from '../../src/extension/asyncUtils';
import { McpOAuthManager } from '../../src/extension/McpOAuthManager';

describe('Asynchronous Operations Suite', () => {
  // 1. Subprocess Timeout Test
  it('should reject with ProcessTimeoutError and cleanly terminate when process hangs', async () => {
    const startTime = Date.now();
    try {
      // Execute a Node subprocess that hangs indefinitely, but with a 200ms timeout
      await execFileAsync('node', ['-e', 'setTimeout(() => {}, 10000)'], {
        timeoutMs: 200,
      });
      assert.fail('Should have timed out');
    } catch (err: any) {
      const elapsed = Date.now() - startTime;
      assert.ok(err instanceof ProcessTimeoutError);
      assert.match(err.message, /timed out after 200ms/);
      // Ensure the rejection happened swiftly around the 200ms mark
      assert.ok(elapsed >= 200 && elapsed < 2000, `Took too long: ${elapsed}ms`);
    }
  });

  // 2. Subprocess Cancellation Test
  it('should reject with ProcessCancellationError when aborted via AbortSignal', async () => {
    const controller = new AbortController();
    const promise = execFileAsync('node', ['-e', 'setTimeout(() => {}, 10000)'], {
      signal: controller.signal,
    });

    // Abort after 100ms
    setTimeout(() => controller.abort(), 100);

    try {
      await promise;
      assert.fail('Should have been cancelled');
    } catch (err: any) {
      assert.ok(err instanceof ProcessCancellationError);
      assert.match(err.message, /Process execution cancelled/);
    }
  });

  // 3. McpOAuthManager Fetch Timeout Test
  it('should timeout and reject cleanly in McpOAuthManager during token exchange when fetch hangs', async () => {
    const originalFetch = global.fetch;
    let fetchAborted = false;

    // Stub fetch to return a promise that hangs but tracks abort signals
    global.fetch = function (input: any, init: any): Promise<any> {
      return new Promise((_, reject) => {
        if (init?.signal) {
          init.signal.addEventListener('abort', () => {
            fetchAborted = true;
            reject(new DOMException('The user aborted a request.', 'AbortError'));
          });
        }
      });
    } as any;

    try {
      const mockContext: any = {
        secrets: {
          store: async () => {},
        },
      };
      const oauthManager = new McpOAuthManager(mockContext);

      // Exchange code for token with a mock URL, which will hit our hanging fetch stub
      await oauthManager.exchangeCodeForToken({
        code: 'mock-code',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        redirectUri: 'http://127.0.0.1/callback',
      });
      assert.fail('Should have timed out');
    } catch (err: any) {
      assert.match(err.message, /timed out after 15 seconds/);
      assert.ok(fetchAborted, 'Fetch should have received the abort signal');
    } finally {
      global.fetch = originalFetch;
    }
  });

  // 4. Static Guard Checks (No execSync or execFileSync in critical files)
  it('should ensure zero blocking execSync or execFileSync calls exist in critical host files', () => {
    const filesToAudit = [
      path.join(__dirname, '../../src/extension/McpSubprocessManager.ts'),
      path.join(__dirname, '../../src/extension/McpOAuthManager.ts'),
      path.join(__dirname, '../../src/extension/AgentRunnerManager.ts'),
      path.join(__dirname, '../../src/extension/AgentEngineDeployer.ts'),
    ];

    for (const filePath of filesToAudit) {
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Ensure there are no active calls like execSync(...) or execFileSync(...)
      // We look for 'execSync(' or 'execFileSync(' or 'require("child_process").execSync' or similar patterns.
      // We exclude comments by making sure it doesn't match single or multi-line comment indicators.
      const execSyncRegex = /(?<!\/\/.*)(?<!\*.*)\bexecSync\s*\(/g;
      const execFileSyncRegex = /(?<!\/\/.*)(?<!\*.*)\bexecFileSync\s*\(/g;

      const hasExecSync = execSyncRegex.test(content);
      const hasExecFileSync = execFileSyncRegex.test(content);

      assert.ok(!hasExecSync, `Found blocking execSync call in: ${filePath}`);
      assert.ok(!hasExecFileSync, `Found blocking execFileSync call in: ${filePath}`);
    }
  });
});
