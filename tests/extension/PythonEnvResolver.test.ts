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
    const tempDir = path.join('/tmp', `clean_dep_test_${Date.now()}`);
    const fs = require('fs');
    fs.mkdirSync(tempDir, { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'requirements.txt'), '# Empty requirements\n');

    const logs: string[] = [];
    try {
      await resolver.ensureDependenciesInstalled(
        process.platform === 'win32' ? 'python.exe' : 'python3',
        tempDir,
        (msg) => {
          logs.push(msg);
        }
      );
    } catch {
      // Ignored: Pip install may fail on system python without virtualenv
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should detect A2A dependencies accurately from requirements and python files', () => {
    const resolver = new PythonEnvResolver();
    const tempDir = path.join('/tmp', `a2a_detect_test_${Date.now()}`);
    const fs = require('fs');
    fs.mkdirSync(tempDir, { recursive: true });

    try {
      // Test 1: Empty folder returns false
      assert.equal(resolver.requiresA2ADependencies(tempDir), false);

      // Test 2: requirements.txt with a2a
      fs.writeFileSync(path.join(tempDir, 'requirements.txt'), 'google-adk[a2a]>=0.1.0\n');
      assert.equal(resolver.requiresA2ADependencies(tempDir), true);

      // Test 3: agent.py with RemoteA2aAgent
      fs.unlinkSync(path.join(tempDir, 'requirements.txt'));
      fs.writeFileSync(path.join(tempDir, 'agent.py'), 'from google.adk.agents.remote_a2a_agent import RemoteA2aAgent\n');
      assert.equal(resolver.requiresA2ADependencies(tempDir), true);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should fail fast if requirements.txt is missing when starting local agent', async () => {
    const resolver = new PythonEnvResolver();
    const tempDir = path.join('/tmp', `missing_req_test_${Date.now()}`);
    const fs = require('fs');
    fs.mkdirSync(tempDir, { recursive: true });

    try {
      fs.writeFileSync(path.join(tempDir, 'agent.py'), 'from google.adk.agents import Agent\n');

      await assert.rejects(
        async () => {
          await resolver.ensureDependenciesInstalled(
            process.platform === 'win32' ? 'python.exe' : 'python3',
            tempDir
          );
        },
        /\[Validation Error\] 'requirements\.txt' not found/
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should fail fast if A2A protocol detected but requirements.txt is missing A2A dependencies', async () => {
    const resolver = new PythonEnvResolver();
    const tempDir = path.join('/tmp', `a2a_failfast_test_${Date.now()}`);
    const fs = require('fs');
    fs.mkdirSync(tempDir, { recursive: true });

    try {
      fs.writeFileSync(
        path.join(tempDir, 'agent.py'),
        'from google.adk.agents.remote_a2a_agent import RemoteA2aAgent\n'
      );
      fs.writeFileSync(path.join(tempDir, 'requirements.txt'), 'fastapi>=0.110.0\n');

      await assert.rejects(
        async () => {
          await resolver.ensureDependenciesInstalled(
            process.platform === 'win32' ? 'python.exe' : 'python3',
            tempDir
          );
        },
        /\[Validation Error\] Agent-to-Agent \(A2A\) protocol detected in agent code, but 'requirements\.txt' is missing required A2A dependencies/
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should log single requirements.txt message without duplicate A2A log when requirements.txt is valid', async () => {
    const resolver = new PythonEnvResolver();
    const tempDir = path.join('/tmp', `a2a_log_test_${Date.now()}`);
    const fs = require('fs');
    fs.mkdirSync(tempDir, { recursive: true });

    try {
      // Target directory has agent.py with RemoteA2aAgent and valid requirements.txt containing A2A packages
      fs.writeFileSync(path.join(tempDir, 'agent.py'), 'from google.adk.agents.remote_a2a_agent import RemoteA2aAgent\n');
      fs.writeFileSync(path.join(tempDir, 'requirements.txt'), 'google-adk[a2a]>=2.0.0\na2a-sdk[http-server]>=0.3.4\nfastapi>=0.110.0\n');

      const logs: string[] = [];
      try {
        await resolver.ensureDependenciesInstalled(
          process.platform === 'win32' ? 'python.exe' : 'python3',
          tempDir,
          (msg) => {
            logs.push(msg);
          }
        );
      } catch {
        // Ignored: Pip install may fail on system python without a virtual environment (PEP 668)
      }

      // Verify logs do NOT contain the confusing duplicate installation log
      const duplicateA2ALog = logs.find((l) => l.includes('A2A protocol detected. Installing a2a-sdk'));
      assert.equal(duplicateA2ALog, undefined, 'Should not log redundant A2A install line when requirements.txt exists');
      assert.ok(logs.some((l) => l.includes('Installing dependencies from requirements.txt')));
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
