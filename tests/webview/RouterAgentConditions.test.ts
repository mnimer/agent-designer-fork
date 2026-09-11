/**
 * Unit Tests for Router Condition Field Metadata & Dynamic Configuration
 *
 * Validates:
 * 1. Boolean Expression condition metadata (label, placeholder, helpText).
 * 2. LLM Intent Classifier condition metadata.
 * 3. Numeric Threshold condition metadata.
 * 4. Pattern / Regex Match condition metadata.
 * 5. Default fallback (Else) route metadata across all modes.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getConditionFieldMeta } from '../../src/webview/components/inspector/RouterAgentDrawer';

describe('Router Agent Condition Field Metadata across Strategies', () => {
  it('should return appropriate metadata for boolean expression mode', () => {
    const meta = getConditionFieldMeta('boolean_expression', false);
    assert.equal(meta.label, 'Boolean State Expression');
    assert.ok(meta.placeholder.includes('state.status'));
    assert.ok(meta.helpText.includes('session state'));
  });

  it('should return appropriate metadata for LLM intent classifier mode', () => {
    const meta = getConditionFieldMeta('llm_classifier', false);
    assert.equal(meta.label, 'Intent Category / Keywords');
    assert.ok(meta.placeholder.includes('billing_inquiry'));
    assert.ok(meta.helpText.includes('Gemini reasoning model'));
  });

  it('should return appropriate metadata for numeric threshold mode', () => {
    const meta = getConditionFieldMeta('threshold_score', false);
    assert.equal(meta.label, 'Threshold Expression (Optional)');
    assert.ok(meta.placeholder.includes('score >= 0.85'));
    assert.ok(meta.helpText.includes('Custom threshold condition'));
  });

  it('should return appropriate metadata for pattern regex match mode', () => {
    const meta = getConditionFieldMeta('pattern_match', false);
    assert.equal(meta.label, 'Regular Expression (Regex Pattern)');
    assert.ok(meta.placeholder.includes('cancel|refund'));
    assert.ok(meta.helpText.includes('regex pattern'));
  });

  it('should return fallback route metadata when branch is marked as default/fallback', () => {
    const modes = ['boolean_expression', 'llm_classifier', 'threshold_score', 'pattern_match'] as const;
    for (const mode of modes) {
      const meta = getConditionFieldMeta(mode, true);
      assert.equal(meta.label, 'Fallback Route');
      assert.equal(meta.placeholder, 'default');
      assert.ok(meta.helpText.includes('Catch-all'));
    }
  });
});
