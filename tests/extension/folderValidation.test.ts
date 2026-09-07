/**
 * folderValidation.test.ts
 *
 * Unit tests for target folder validation and sanitization utilities.
 * Validates hyphen replacement, path preservation, prefixing, and diagnostic error reporting.
 *
 * Author: Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateTargetFolder,
  sanitizeFolderBaseName,
  sanitizeTargetFolder,
} from '../../src/shared/folderValidation';

describe('folderValidation', () => {
  describe('validateTargetFolder', () => {
    it('validates standard valid Python identifier folder names', () => {
      const result = validateTargetFolder('./scratch_flow/');
      assert.equal(result.isValid, true);
      assert.equal(result.folderBase, 'scratch_flow');
      assert.equal(result.sanitizedPath, './scratch_flow/');
      assert.equal(result.hasHyphens, false);
      assert.equal(result.error, undefined);
    });

    it('detects hyphens in folder name and provides sanitized suggestion', () => {
      const result = validateTargetFolder('./scratch-flow/');
      assert.equal(result.isValid, false);
      assert.equal(result.folderBase, 'scratch-flow');
      assert.equal(result.sanitizedPath, './scratch_flow/');
      assert.equal(result.sanitizedBase, 'scratch_flow');
      assert.equal(result.hasHyphens, true);
      assert.ok(result.error?.includes("contains hyphens ('-')"));
    });

    it('detects hyphens in deep relative paths and preserves directory prefix', () => {
      const result = validateTargetFolder('agents/scratch/my-test-agent');
      assert.equal(result.isValid, false);
      assert.equal(result.folderBase, 'my-test-agent');
      assert.equal(result.sanitizedPath, 'agents/scratch/my_test_agent');
      assert.equal(result.sanitizedBase, 'my_test_agent');
      assert.equal(result.hasHyphens, true);
    });

    it('rejects folder names starting with numbers and prefixes agent_', () => {
      const result = validateTargetFolder('./123agent/');
      assert.equal(result.isValid, false);
      assert.equal(result.folderBase, '123agent');
      assert.equal(result.sanitizedBase, 'agent_123agent');
      assert.equal(result.sanitizedPath, './agent_123agent/');
      assert.ok(result.error?.includes('cannot begin with a number'));
    });

    it('handles empty folder path gracefully', () => {
      const result = validateTargetFolder('');
      assert.equal(result.isValid, false);
      assert.equal(result.hasHyphens, false);
      assert.ok(result.error?.includes('cannot be empty'));
    });
  });

  describe('sanitizeFolderBaseName', () => {
    it('replaces hyphens with underscores', () => {
      assert.equal(sanitizeFolderBaseName('scratch-flow'), 'scratch_flow');
      assert.equal(sanitizeFolderBaseName('my-multi-word-agent'), 'my_multi_word_agent');
    });

    it('collapses multiple underscores and special characters', () => {
      assert.equal(sanitizeFolderBaseName('my--cool__agent'), 'my_cool_agent');
      assert.equal(sanitizeFolderBaseName('agent@v1!'), 'agent_v1');
    });

    it('prefixes leading digits with agent_', () => {
      assert.equal(sanitizeFolderBaseName('99_bottles'), 'agent_99_bottles');
    });

    it('defaults empty string to agent_app', () => {
      assert.equal(sanitizeFolderBaseName(''), 'agent_app');
    });
  });

  describe('sanitizeTargetFolder', () => {
    it('returns sanitized path preserving relative prefixes and trailing slashes', () => {
      assert.equal(sanitizeTargetFolder('./scratch-flow/'), './scratch_flow/');
      assert.equal(sanitizeTargetFolder('src/agents/customer-support/'), 'src/agents/customer_support/');
      assert.equal(sanitizeTargetFolder('my-agent'), 'my_agent');
    });
  });
});
