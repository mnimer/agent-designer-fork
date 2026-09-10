/**
 * Unit Tests for getFileColorInfo utility
 *
 * Validates:
 * 1. Semantic categorization of source files (Python, Tests, Terraform/IaC, Docker, Dependencies, Config, Docs, Scripts, Other).
 * 2. Proper badge labels ('PY', 'TEST', 'IAC', 'DOCKER', 'DEPS', etc.).
 * 3. Consistent styling, tailwind text colors, and active tab borders.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getFileColorInfo } from '../../src/webview/components/codegen/fileTypeColors';

describe('fileTypeColors utility', () => {
  it('should categorize python test files correctly', () => {
    const testCases = ['test_agent.py', 'workflow_test.py', 'agent.test.py', 'TEST_MAIN.PY'];
    for (const file of testCases) {
      const info = getFileColorInfo(file);
      assert.strictEqual(info.category, 'test', `Expected ${file} to be categorized as test`);
      assert.strictEqual(info.badgeLabel, 'TEST');
      assert.match(info.iconColor, /text-pink-400/);
    }
  });

  it('should categorize standard python files correctly', () => {
    const testCases = ['agent.py', 'main.py', 'server.py', 'subagents.py'];
    for (const file of testCases) {
      const info = getFileColorInfo(file);
      assert.strictEqual(info.category, 'python', `Expected ${file} to be categorized as python`);
      assert.strictEqual(info.badgeLabel, 'PY');
      assert.match(info.iconColor, /text-sky-400/);
    }
  });

  it('should categorize terraform / IaC files correctly', () => {
    const testCases = ['main.tf', 'variables.tf', 'terraform.tfvars'];
    for (const file of testCases) {
      const info = getFileColorInfo(file);
      assert.strictEqual(info.category, 'terraform', `Expected ${file} to be categorized as terraform`);
      assert.strictEqual(info.badgeLabel, 'IAC');
      assert.match(info.iconColor, /text-purple-400/);
    }
  });

  it('should categorize docker and container files correctly', () => {
    const testCases = ['Dockerfile', 'dockerfile', '.dockerignore', 'docker-compose.yaml'];
    for (const file of testCases) {
      const info = getFileColorInfo(file);
      assert.strictEqual(info.category, 'docker', `Expected ${file} to be categorized as docker`);
      assert.strictEqual(info.badgeLabel, 'DOCKER');
      assert.match(info.iconColor, /text-cyan-400/);
    }
  });

  it('should categorize dependency and environment files correctly', () => {
    const testCases = ['requirements.txt', 'pyproject.toml', '.env', '.env.local'];
    for (const file of testCases) {
      const info = getFileColorInfo(file);
      assert.strictEqual(info.category, 'deps', `Expected ${file} to be categorized as deps`);
      assert.strictEqual(info.badgeLabel, 'DEPS');
      assert.match(info.iconColor, /text-amber-400/);
    }
  });

  it('should categorize config files (json, yaml, yml, toml) correctly', () => {
    assert.strictEqual(getFileColorInfo('config.json').category, 'config');
    assert.strictEqual(getFileColorInfo('config.json').badgeLabel, 'JSON');

    assert.strictEqual(getFileColorInfo('deploy.yaml').category, 'config');
    assert.strictEqual(getFileColorInfo('deploy.yaml').badgeLabel, 'YAML');

    assert.strictEqual(getFileColorInfo('cloudbuild.yml').category, 'config');
    assert.strictEqual(getFileColorInfo('cloudbuild.yml').badgeLabel, 'YML');
  });

  it('should categorize markdown and documentation files correctly', () => {
    const testCases = ['README.md', 'ARCHITECTURE.md', 'docs.rst', 'LICENSE.txt'];
    for (const file of testCases) {
      const info = getFileColorInfo(file);
      assert.strictEqual(info.category, 'docs', `Expected ${file} to be categorized as docs`);
      assert.strictEqual(info.badgeLabel, 'DOC');
      assert.match(info.iconColor, /text-blue-400/);
    }
  });

  it('should categorize shell scripts correctly', () => {
    const testCases = ['run.sh', 'deploy.bash', 'setup.zsh'];
    for (const file of testCases) {
      const info = getFileColorInfo(file);
      assert.strictEqual(info.category, 'script', `Expected ${file} to be categorized as script`);
      assert.strictEqual(info.badgeLabel, 'SH');
      assert.match(info.iconColor, /text-emerald-400/);
    }
  });

  it('should provide fallback for unknown files', () => {
    const info = getFileColorInfo('unknown_binary.bin');
    assert.strictEqual(info.category, 'other');
    assert.strictEqual(info.badgeLabel, 'BIN');
    assert.match(info.iconColor, /text-gray-400/);
  });
});
