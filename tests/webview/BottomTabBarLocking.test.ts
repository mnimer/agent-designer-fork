/**
 * BottomTabBarLocking.test.ts - Unit Tests for Test Runner and Interactive Chat Tab Locking
 *
 * Validates:
 * 1. Test Runner tab is disabled/locked when code is not generated (!hasGeneratedCode).
 * 2. Test Runner tab is disabled/locked while code is actively being generated (isGenerating).
 * 3. Interactive Chat tab is disabled/locked when code is not generated (!hasGeneratedCode).
 * 4. Interactive Chat tab is disabled/locked while code is actively being generated (isGenerating).
 * 5. Both tabs unlock when code generation completes (hasGeneratedCode && !isGenerating).
 * 6. Informative tooltips and lock badges display properly for both tabs during generation.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Bottom Tab Bar Locking Specifications (Test Runner & Interactive Chat)', () => {
  interface TabState {
    hasGeneratedCode: boolean;
    isGenerating: boolean;
    hasTestSuite: boolean;
    hasChatTrigger: boolean;
  }

  function computeTabLockState(state: TabState, tab: 'test_runner' | 'chat') {
    const isLocked = !state.hasGeneratedCode || state.isGenerating;
    const canClick = state.hasGeneratedCode && !state.isGenerating;

    let tooltip = '';
    if (isLocked) {
      if (state.isGenerating) {
        tooltip = '⚠️ Code generation in progress...';
      } else if (tab === 'test_runner') {
        tooltip = '⚠️ Code generation is required to unlock unit test runner';
      } else {
        tooltip = '⚠️ Code generation is required to unlock interactive chat';
      }
    }

    const badge = isLocked ? 'Locked' : tab === 'test_runner' ? 'tests' : 'Live';
    const iconColor = !isLocked
      ? tab === 'test_runner'
        ? 'text-pink-400'
        : 'text-emerald-400'
      : 'text-gray-500';

    return {
      isLocked,
      canClick,
      tooltip,
      badge,
      iconColor,
    };
  }

  it('should lock both Test Runner and Interactive Chat when code is not yet generated', () => {
    const state: TabState = {
      hasGeneratedCode: false,
      isGenerating: false,
      hasTestSuite: true,
      hasChatTrigger: true,
    };

    const testRunner = computeTabLockState(state, 'test_runner');
    const chat = computeTabLockState(state, 'chat');

    assert.strictEqual(testRunner.isLocked, true, 'Test runner should be locked when code is not generated');
    assert.strictEqual(testRunner.canClick, false, 'Test runner cannot be clicked');
    assert.strictEqual(testRunner.badge, 'Locked');
    assert.strictEqual(testRunner.iconColor, 'text-gray-500');
    assert.strictEqual(testRunner.tooltip, '⚠️ Code generation is required to unlock unit test runner');

    assert.strictEqual(chat.isLocked, true, 'Interactive chat should be locked when code is not generated');
    assert.strictEqual(chat.canClick, false, 'Interactive chat cannot be clicked');
    assert.strictEqual(chat.badge, 'Locked');
    assert.strictEqual(chat.iconColor, 'text-gray-500');
    assert.strictEqual(chat.tooltip, '⚠️ Code generation is required to unlock interactive chat');
  });

  it('should lock both Test Runner and Interactive Chat while code is actively generating', () => {
    const state: TabState = {
      hasGeneratedCode: true,
      isGenerating: true,
      hasTestSuite: true,
      hasChatTrigger: true,
    };

    const testRunner = computeTabLockState(state, 'test_runner');
    const chat = computeTabLockState(state, 'chat');

    assert.strictEqual(testRunner.isLocked, true, 'Test runner should be locked while generating');
    assert.strictEqual(testRunner.canClick, false, 'Test runner cannot be clicked while generating');
    assert.strictEqual(testRunner.badge, 'Locked');
    assert.strictEqual(testRunner.iconColor, 'text-gray-500');
    assert.strictEqual(testRunner.tooltip, '⚠️ Code generation in progress...');

    assert.strictEqual(chat.isLocked, true, 'Interactive chat should be locked while generating');
    assert.strictEqual(chat.canClick, false, 'Interactive chat cannot be clicked while generating');
    assert.strictEqual(chat.badge, 'Locked');
    assert.strictEqual(chat.iconColor, 'text-gray-500');
    assert.strictEqual(chat.tooltip, '⚠️ Code generation in progress...');
  });

  it('should unlock both Test Runner and Interactive Chat once code generation completes successfully', () => {
    const state: TabState = {
      hasGeneratedCode: true,
      isGenerating: false,
      hasTestSuite: true,
      hasChatTrigger: true,
    };

    const testRunner = computeTabLockState(state, 'test_runner');
    const chat = computeTabLockState(state, 'chat');

    assert.strictEqual(testRunner.isLocked, false, 'Test runner should be unlocked');
    assert.strictEqual(testRunner.canClick, true, 'Test runner can be clicked');
    assert.strictEqual(testRunner.badge, 'tests');
    assert.strictEqual(testRunner.iconColor, 'text-pink-400');
    assert.strictEqual(testRunner.tooltip, '');

    assert.strictEqual(chat.isLocked, false, 'Interactive chat should be unlocked');
    assert.strictEqual(chat.canClick, true, 'Interactive chat can be clicked');
    assert.strictEqual(chat.badge, 'Live');
    assert.strictEqual(chat.iconColor, 'text-emerald-400');
    assert.strictEqual(chat.tooltip, '');
  });
});
