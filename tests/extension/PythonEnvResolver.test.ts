/**
 * Unit Tests for PythonEnvResolver
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'path';
import { PythonEnvResolver } from '../../src/extension/PythonEnvResolver';

describe('PythonEnvResolver', () => {
  it('should resolve python binary paths across platforms correctly', () => {
    const resolver = new PythonEnvResolver('/mock/workspace');
    const binPath = resolver.getPythonBinPath('/mock/workspace/.venv');

    if (process.platform === 'win32') {
      assert.equal(binPath, path.join('/mock/workspace/.venv', 'Scripts', 'python.exe'));
    } else {
      assert.equal(binPath, path.join('/mock/workspace/.venv', 'bin', 'python'));
    }
  });

  it('should resolve environment when fallback system python is active', async () => {
    const resolver = new PythonEnvResolver('/nonexistent/workspace/dir');
    const env = await resolver.resolveEnvironment ? await resolver.resolvePythonEnvironment() : await resolver.resolvePythonEnvironment();

    assert.ok(env.path);
    assert.ok(env.source);
    assert.equal(typeof env.isVirtualEnv, 'boolean');
  });

  it('should ensure virtual environment creation or resolution in target directory', async () => {
    const resolver = new PythonEnvResolver();
    const env = await resolver.ensureVirtualEnvironment('/tmp/nonexistent_test_dir_isolated');
    assert.ok(env);
    assert.ok(env.path);
    assert.ok(typeof env.isVirtualEnv === 'boolean');
  });

  it('should check and ensure dependencies installed cleanly without crashing', async () => {
    const resolver = new PythonEnvResolver();
    const logs: string[] = [];
    await assert.doesNotReject(async () => {
      await resolver.ensureDependenciesInstalled(
        process.platform === 'win32' ? 'python.exe' : 'python3',
        '/tmp',
        (msg) => {
          logs.push(msg);
        }
      );
    });
  });
});
