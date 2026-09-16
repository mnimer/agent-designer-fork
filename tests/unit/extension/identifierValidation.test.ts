/**
 * identifierValidation.test.ts
 *
 * Unit tests for Python identifier validation and sanitization for Google ADK agents and tools.
 * Validates identifier rules, space rejection, hyphen rejection, keyword collision, and snake_case sanitization.
 *
 * Author: Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidPythonIdentifier,
  validateAgentIdentifier,
  sanitizeAgentIdentifier,
  PYTHON_KEYWORDS,
} from '../../../src/shared/identifierValidation';

describe('identifierValidation', () => {
  describe('isValidPythonIdentifier', () => {
    it('accepts valid snake_case and camelCase identifiers', () => {
      assert.equal(isValidPythonIdentifier('cat_agent'), true);
      assert.equal(isValidPythonIdentifier('CatAgent'), true);
      assert.equal(isValidPythonIdentifier('_agent'), true);
      assert.equal(isValidPythonIdentifier('agent123'), true);
      assert.equal(isValidPythonIdentifier('triage_specialist_node'), true);
    });

    it('rejects identifiers with spaces', () => {
      assert.equal(isValidPythonIdentifier('Cat Agent'), false);
      assert.equal(isValidPythonIdentifier(' cat_agent'), false);
      assert.equal(isValidPythonIdentifier('cat_agent '), false);
    });

    it('rejects identifiers with hyphens or punctuation', () => {
      assert.equal(isValidPythonIdentifier('cat-agent'), false);
      assert.equal(isValidPythonIdentifier('cat.agent'), false);
      assert.equal(isValidPythonIdentifier('cat@agent!'), false);
    });

    it('rejects identifiers starting with digits', () => {
      assert.equal(isValidPythonIdentifier('1agent'), false);
      assert.equal(isValidPythonIdentifier('99_cats'), false);
    });

    it('rejects empty or non-string inputs', () => {
      assert.equal(isValidPythonIdentifier(''), false);
      assert.equal(isValidPythonIdentifier(null as any), false);
      assert.equal(isValidPythonIdentifier(undefined as any), false);
    });

    it('rejects Python reserved keywords', () => {
      assert.equal(isValidPythonIdentifier('class'), false);
      assert.equal(isValidPythonIdentifier('import'), false);
      assert.equal(isValidPythonIdentifier('def'), false);
      assert.equal(isValidPythonIdentifier('return'), false);
      assert.equal(isValidPythonIdentifier('for'), false);
      assert.equal(isValidPythonIdentifier('while'), false);
      assert.equal(isValidPythonIdentifier('None'), false);
      assert.equal(isValidPythonIdentifier('True'), false);
    });
  });

  describe('validateAgentIdentifier', () => {
    it('validates a valid identifier successfully', () => {
      const res = validateAgentIdentifier('cat_agent');
      assert.equal(res.isValid, true);
      assert.equal(res.sanitized, 'cat_agent');
      assert.equal(res.error, undefined);
      assert.equal(res.hasSpaces, false);
      assert.equal(res.hasHyphens, false);
      assert.equal(res.startsWithDigit, false);
    });

    it('identifies spaces in agent name and suggests sanitized alternative', () => {
      const res = validateAgentIdentifier('Cat Agent');
      assert.equal(res.isValid, false);
      assert.equal(res.hasSpaces, true);
      assert.equal(res.sanitized, 'cat_agent');
      assert.ok(res.error?.includes('cannot contain spaces'));
    });

    it('identifies hyphens in agent name', () => {
      const res = validateAgentIdentifier('customer-support');
      assert.equal(res.isValid, false);
      assert.equal(res.hasHyphens, true);
      assert.equal(res.sanitized, 'customer_support');
      assert.ok(res.error?.includes('cannot contain hyphens'));
    });

    it('identifies names starting with numbers', () => {
      const res = validateAgentIdentifier('3rd_agent');
      assert.equal(res.isValid, false);
      assert.equal(res.startsWithDigit, true);
      assert.equal(res.sanitized, 'agent_3rd_agent');
      assert.ok(res.error?.includes('cannot start with a number'));
    });

    it('identifies Python keywords', () => {
      const res = validateAgentIdentifier('import');
      assert.equal(res.isValid, false);
      assert.equal(res.isKeyword, true);
      assert.equal(res.sanitized, 'import_agent');
      assert.ok(res.error?.includes('reserved Python keyword'));
    });

    it('handles empty input gracefully', () => {
      const res = validateAgentIdentifier('');
      assert.equal(res.isValid, false);
      assert.equal(res.sanitized, 'agent');
      assert.ok(res.error?.includes('cannot be empty'));
    });
  });

  describe('sanitizeAgentIdentifier', () => {
    it('converts display names with spaces to lowercase snake_case', () => {
      assert.equal(sanitizeAgentIdentifier('Cat Agent'), 'cat_agent');
      assert.equal(sanitizeAgentIdentifier('Customer Support Triage Specialist'), 'customer_support_triage_specialist');
    });

    it('replaces special characters and hyphens', () => {
      assert.equal(sanitizeAgentIdentifier('My-Agent#1!'), 'my_agent_1');
      assert.equal(sanitizeAgentIdentifier('agent...name'), 'agent_name');
    });

    it('prefixes names starting with numbers with fallbackPrefix', () => {
      assert.equal(sanitizeAgentIdentifier('123agent'), 'agent_123agent');
      assert.equal(sanitizeAgentIdentifier('123agent', 'subagent'), 'subagent_123agent');
    });

    it('suffixes Python keywords with _agent', () => {
      assert.equal(sanitizeAgentIdentifier('class'), 'class_agent');
      assert.equal(sanitizeAgentIdentifier('def'), 'def_agent');
      assert.equal(sanitizeAgentIdentifier('import'), 'import_agent');
    });

    it('collapses multiple underscores and trims edge underscores', () => {
      assert.equal(sanitizeAgentIdentifier('___my___agent___'), 'my_agent');
    });

    it('returns fallback prefix for empty or invalid input', () => {
      assert.equal(sanitizeAgentIdentifier(''), 'agent');
      assert.equal(sanitizeAgentIdentifier('   '), 'agent');
      assert.equal(sanitizeAgentIdentifier('---', 'custom'), 'custom');
      assert.equal(sanitizeAgentIdentifier(null as any, 'fallback'), 'fallback');
    });
  });
});
