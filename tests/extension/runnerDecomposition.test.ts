/**
 * Unit Tests for Decomposed Runner Sub-modules
 *
 * Checks port validation, dynamic sanitization, TCP/HTTP health client polling,
 * process tree signaling, FastAPI template injection, and chat-session executors.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RunnerEnvironment } from '../../src/extension/runner/RunnerEnvironment';
import { HealthCheckClient } from '../../src/extension/runner/HealthCheckClient';
import { ProcessLifecycleManager } from '../../src/extension/runner/ProcessLifecycleManager';
import { getLocalRunnerScriptContent } from '../../src/extension/runner/LocalRunnerScriptProvider';
import { TestAndChatExecutor } from '../../src/extension/runner/TestAndChatExecutor';
import { ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

describe('Runner Decomposition - Unit Tests', () => {

  describe('RunnerEnvironment', () => {
    it('should sanitize execution environment and set global credentials if missing API key', async () => {
      const env = new RunnerEnvironment();
      const sanitized = await env.sanitizeExecutionEnv({
        CUSTOM_VAR: 'test-value',
        GEMINI_API_KEY: '  ',
      });

      assert.equal(sanitized.CUSTOM_VAR, 'test-value');
      assert.equal(sanitized.GEMINI_API_KEY, undefined);
      assert.equal(sanitized.GOOGLE_GENAI_USE_VERTEXAI, 'true');
      assert.equal(sanitized.GOOGLE_CLOUD_LOCATION, 'global');
    });

    it('should ignore killPort with invalid, non-positive ports', async () => {
      const env = new RunnerEnvironment();
      let logs: string[] = [];
      await env.killPort(-1, (msg) => logs.push(msg));
      await env.killPort(0, (msg) => logs.push(msg));
      await env.killPort(NaN, (msg) => logs.push(msg));

      assert.equal(logs.length, 0);
    });
  });

  describe('HealthCheckClient', () => {
    it('should correctly evaluate httpGetCheck as false for offline port', async () => {
      const client = new HealthCheckClient();
      const isAlive = await client.httpGetCheck(49999, '/health', 100);
      assert.equal(isAlive, false);
    });

    it('should timeout and reject waitForServerReady when server is permanently offline', async () => {
      const client = new HealthCheckClient();
      const ready = await client.waitForServerReady(49998, 150, () => false, () => {});
      assert.equal(ready, false);
    });
  });

  describe('ProcessLifecycleManager', () => {
    it('should register and deregister spawned processes', () => {
      const manager = new ProcessLifecycleManager();
      const mockProc = new EventEmitter() as unknown as ChildProcess;

      manager.registerProcess('test-run-1', mockProc, 8080);
      assert.equal(manager.activeLocalRunners.has('test-run-1'), true);
      assert.equal(manager.activeProcesses.get('test-run-1'), mockProc);

      manager.unregisterProcess('test-run-1');
      assert.equal(manager.activeLocalRunners.has('test-run-1'), false);
    });
  });

  describe('LocalRunnerScriptProvider', () => {
    it('should return non-empty python test runner adapter template containing root_agent', () => {
      const content = getLocalRunnerScriptContent();
      assert.ok(content.length > 100);
      assert.ok(content.includes('HTTPServer'));
      assert.ok(content.includes('root_agent'));
    });
  });

  describe('TestAndChatExecutor', () => {
    it('should format simple error messages cleanly', () => {
      const executor = new TestAndChatExecutor();
      const err = new Error('Database connection failed');
      const formatted = executor.formatErrorMessage(err);
      assert.equal(formatted, 'Database connection failed');
    });

    it('should unpack AggregateError nested array errors into a readable semicolon list', () => {
      const executor = new TestAndChatExecutor();
      const aggregateErr = {
        message: 'Multiple services failed',
        errors: [
          new Error('Auth failed'),
          new Error('Timeout encountered'),
        ],
      };
      const formatted = executor.formatErrorMessage(aggregateErr);
      assert.equal(formatted, 'Multiple services failed: Auth failed; Timeout encountered');
    });

    it('should return fallback message for empty errors', () => {
      const executor = new TestAndChatExecutor();
      assert.equal(executor.formatErrorMessage(null), 'Unknown error');
    });
  });
});
