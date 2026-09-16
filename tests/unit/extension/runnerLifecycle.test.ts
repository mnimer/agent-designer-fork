/**
 * Unit tests for Agent Runner lifecycle management, concurrency guarantees, and fast failure rejections.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { EventEmitter } from 'events';
import cp from 'child_process';
import { AgentRunnerManager } from '../../../src/extension/AgentRunnerManager';
import { McpSubprocessManager } from '../../../src/extension/McpSubprocessManager';

// Mock ChildProcess that behaves like a real spawned child
class MockChildProcess extends EventEmitter {
  public pid = 12345;
  public killed = false;
  public stdout = new EventEmitter();
  public stderr = new EventEmitter();

  constructor() {
    super();
  }

  public kill(signal = 'SIGTERM'): boolean {
    this.killed = true;
    this.emit('close', null, signal);
    return true;
  }
}

describe('Agent Runner Lifecycle and Subprocess Protections', () => {
  let originalSpawn: any;

  beforeAll(() => {
    originalSpawn = cp.spawn;
  });

  afterAll(() => {
    cp.spawn = originalSpawn;
  });

  it('should handle concurrent startRunner calls by returning the same promise and spawning exactly one child process', async () => {
    let spawnCount = 0;
    const mockChild = new MockChildProcess();

    const manager = new AgentRunnerManager('/mock/extension');

    // Mock processLifecycleManager spawn directly to trace calls and prevent real subprocess execution
    (manager as any).processManager.spawn = () => {
      spawnCount++;
      return mockChild;
    };

    // Bypass Python resolver & script resolution to test spawn directly
    (manager as any).pythonResolver = {
      ensureVirtualEnvironment: async () => ({ path: '/mock/python' }),
      ensureDependenciesInstalled: async () => {},
    };
    (manager as any).resolveRunnerScript = () => '/mock/server.py';
    (manager as any).killPort = async () => {};
    (manager as any).sanitizeExecutionEnv = async (env: any) => env;

    const mockBridge: any = {
      postMessage: async () => {},
    };

    // Trigger concurrent startRunner calls
    const promise1 = manager.startRunner({
      targetDirectory: '/mock/dir',
      port: 8000,
      bridge: mockBridge,
    });

    const promise2 = manager.startRunner({
      targetDirectory: '/mock/dir',
      port: 8000,
      bridge: mockBridge,
    });

    // Both should return the same in-flight startup promise
    assert.strictEqual(promise1, promise2);

    const runnerId1 = await promise1;
    const runnerId2 = await promise2;

    assert.strictEqual(runnerId1, runnerId2);
    assert.strictEqual(spawnCount, 1);

    // Clean up
    await manager.stopRunner();
  });

  it('should reject waitForHealthCheck immediately if the child process exits with an error code during startup', async () => {
    const mockChild = new MockChildProcess();

    const manager = new AgentRunnerManager('/mock/extension');
    (manager as any).processManager.spawn = () => mockChild;
    (manager as any).pythonResolver = {
      ensureVirtualEnvironment: async () => ({ path: '/mock/python' }),
      ensureDependenciesInstalled: async () => {},
    };
    (manager as any).resolveRunnerScript = () => '/mock/server.py';
    (manager as any).killPort = async () => {};
    (manager as any).sanitizeExecutionEnv = async (env: any) => env;

    const mockBridge: any = {
      postMessage: async () => {},
    };

    // Start local runner
    await manager.startRunner({
      targetDirectory: '/mock/dir',
      port: 8000,
      bridge: mockBridge,
    });

    // Setup active local runner mock check
    assert.ok((manager as any).activeLocalRunners.size > 0);

    // Act: start waitForHealthCheck (which uses waitForServerReady)
    const healthCheckPromise = manager.waitForHealthCheck(8000, 10000);

    // Simulate process crash/exit code 1
    mockChild.emit('close', 1);

    // The health check promise should reject or resolve to false immediately on exit
    const isReady = await healthCheckPromise;
    assert.strictEqual(isReady, false);

    // Check that timers are cleared
    assert.strictEqual((manager as any).healthCheckPollTimer, null);
    assert.strictEqual((manager as any).healthCheckTimeoutTimer, null);
  });

  it('should stop the runner, execute deep process tree termination, and clear active timers', async () => {
    let killSignalSent: string | null = null;
    const mockChild = new MockChildProcess();
    mockChild.kill = (sig) => {
      killSignalSent = sig || 'SIGTERM';
      mockChild.emit('close', null, killSignalSent);
      return true;
    };

    const manager = new AgentRunnerManager('/mock/extension');
    (manager as any).processManager.spawn = () => mockChild;
    (manager as any).pythonResolver = {
      ensureVirtualEnvironment: async () => ({ path: '/mock/python' }),
      ensureDependenciesInstalled: async () => {},
    };
    (manager as any).resolveRunnerScript = () => '/mock/server.py';
    (manager as any).killPort = async () => {};
    (manager as any).sanitizeExecutionEnv = async (env: any) => env;

    const mockBridge: any = {
      postMessage: async () => {},
    };

    await manager.startRunner({
      targetDirectory: '/mock/dir',
      port: 8000,
      bridge: mockBridge,
    });

    // Ensure it started
    assert.ok((manager as any).activeLocalRunners.size > 0);

    // Stop runner
    await manager.stopRunner();

    // Verify it terminated and active local runners was updated
    assert.strictEqual((manager as any).activeLocalRunners.size, 0);
    assert.strictEqual((manager as any).startupPollTimer, null);
    assert.strictEqual((manager as any).startupTimeoutTimer, null);
  });

  it('should cleanly dispose of runner and MCP subprocesses during provider deactivation', async () => {
    const manager = new AgentRunnerManager('/mock/extension');
    const mockRunnerChild = new MockChildProcess();
    (manager as any).processManager.spawn = () => mockRunnerChild;

    (manager as any).pythonResolver = {
      ensureVirtualEnvironment: async () => ({ path: '/mock/python' }),
      ensureDependenciesInstalled: async () => {},
    };
    (manager as any).resolveRunnerScript = () => '/mock/server.py';
    (manager as any).killPort = async () => {};
    (manager as any).sanitizeExecutionEnv = async (env: any) => env;

    const mockBridge: any = {
      postMessage: async () => {},
    };

    await manager.startRunner({
      targetDirectory: '/mock/dir',
      port: 8000,
      bridge: mockBridge,
    });

    const mcpManager = new McpSubprocessManager();
    const mockMcpChild = new MockChildProcess();
    (mcpManager as any).activeSubprocesses.add(mockMcpChild as any);

    // Verify they are initially tracked
    assert.ok((manager as any).activeLocalRunners.size > 0);
    assert.strictEqual((mcpManager as any).activeSubprocesses.size, 1);

    // Call dispose on McpSubprocessManager and AgentRunnerManager
    mcpManager.dispose();
    manager.dispose();

    // Verify processes are cleaned up
    assert.strictEqual((manager as any).activeLocalRunners.size, 0);
    assert.strictEqual((mcpManager as any).activeSubprocesses.size, 0);
  });
});
