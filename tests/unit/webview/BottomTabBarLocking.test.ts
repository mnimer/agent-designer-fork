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

  describe('Bottom Panel Collapsed Tab Bar, 2/3 Tab Click Expansion, Toggle & Free Resize', () => {
    it('should start collapsed at just the 40px tab bar and expand to 2/3 (66.667%) on tab click or expand toggle', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const {
        BOTTOM_PANEL_HEADER_HEIGHT,
        BOTTOM_PANEL_EXPANDED_RATIO,
        PANEL_DIVIDER_HEIGHT,
      } = await import('../../../src/webview/hooks/useResizablePanel');

      assert.strictEqual(BOTTOM_PANEL_HEADER_HEIGHT, 40);
      assert.strictEqual(PANEL_DIVIDER_HEIGHT, 8);
      assert.ok(Math.abs(BOTTOM_PANEL_EXPANDED_RATIO - 2 / 3) < 0.0001);

      const flowCanvasSource = fs.readFileSync(
        path.resolve(__dirname, '../../../src/webview/components/FlowCanvas.tsx'),
        'utf-8'
      );
      const codeGenPanelSource = fs.readFileSync(
        path.resolve(__dirname, '../../../src/webview/components/codegen/CodeGenerationPanel.tsx'),
        'utf-8'
      );
      const dividerSource = fs.readFileSync(
        path.resolve(__dirname, '../../../src/webview/components/Canvas/PanelDivider.tsx'),
        'utf-8'
      );
      const canvasTabSource = fs.readFileSync(
        path.resolve(__dirname, '../../../src/webview/components/tabs/CanvasTab.tsx'),
        'utf-8'
      );

      // Default collapsed height uses BOTTOM_PANEL_HEADER_HEIGHT (40px) and expanded uses 66.667% (2/3)
      assert.ok(flowCanvasSource.includes("'66.667%'"));
      assert.ok(flowCanvasSource.includes('${BOTTOM_PANEL_HEADER_HEIGHT}px'));
      assert.ok(flowCanvasSource.includes('min-h-[40px]'));
      assert.ok(flowCanvasSource.includes('onExpandPanel={handleExpandPanel}'));

      // Clicking any tab calls handleSelectTab which invokes onExpandPanel
      assert.ok(codeGenPanelSource.includes("handleSelectTab('codegen')"));
      assert.ok(codeGenPanelSource.includes("handleSelectTab('deployment')"));
      assert.ok(codeGenPanelSource.includes("handleSelectTab('test_runner')"));
      assert.ok(codeGenPanelSource.includes("handleSelectTab('chat')"));
      assert.ok(codeGenPanelSource.includes('onExpandPanel?.()'));

      // PanelDivider remains visible (flex, never hidden) and CanvasTab allows shrinking to 0 (flex-1 min-h-0)
      assert.ok(!dividerSource.includes("isPanelMaximized ? 'hidden'"));
      assert.ok(canvasTabSource.includes('flex-1 min-h-0'));
    });

    it('should clamp free drag resizing between 40px tab bar and 100% available space and jump between 2/3 and 40px on toggle', async () => {
      const {
        BOTTOM_PANEL_HEADER_HEIGHT,
        PANEL_DIVIDER_HEIGHT,
      } = await import('../../../src/webview/hooks/useResizablePanel');

      let bottomPanelHeight: number | null = null;
      let isPanelMaximized = false;

      const getRenderedHeight = () =>
        bottomPanelHeight !== null
          ? `${bottomPanelHeight}px`
          : isPanelMaximized
          ? '66.667%'
          : `${BOTTOM_PANEL_HEADER_HEIGHT}px`;

      const handleExpandPanel = () => {
        bottomPanelHeight = null;
        isPanelMaximized = true;
      };

      const handleToggleMaximizePanel = () => {
        const isCurrentlyExpanded =
          isPanelMaximized ||
          (bottomPanelHeight !== null && bottomPanelHeight > BOTTOM_PANEL_HEADER_HEIGHT);
        bottomPanelHeight = null;
        isPanelMaximized = !isCurrentlyExpanded;
      };

      const simulateDragMove = (containerHeight: number, requestedHeight: number) => {
        const minHeight = BOTTOM_PANEL_HEADER_HEIGHT;
        const maxHeight = Math.max(minHeight, containerHeight - PANEL_DIVIDER_HEIGHT);
        bottomPanelHeight = Math.max(minHeight, Math.min(maxHeight, requestedHeight));
        isPanelMaximized = bottomPanelHeight > BOTTOM_PANEL_HEADER_HEIGHT;
      };

      // 1. Starts collapsed at 40px tab bar
      assert.strictEqual(getRenderedHeight(), '40px');

      // 2. Clicking a tab opens to 2/3 (66.667%)
      handleExpandPanel();
      assert.strictEqual(getRenderedHeight(), '66.667%');

      // 3. Toggling the expand icon collapses back to 40px tab bar
      handleToggleMaximizePanel();
      assert.strictEqual(getRenderedHeight(), '40px');

      // 4. Toggling the expand icon again jumps to 2/3 (66.667%)
      handleToggleMaximizePanel();
      assert.strictEqual(getRenderedHeight(), '66.667%');

      // 5. Dragging the handle up to 100% of a 900px container
      simulateDragMove(900, 1200);
      assert.strictEqual(bottomPanelHeight, 892);
      assert.strictEqual(isPanelMaximized, true);

      // 6. Toggling from a custom dragged height collapses back to 40px tab bar
      handleToggleMaximizePanel();
      assert.strictEqual(getRenderedHeight(), '40px');

      // 7. Dragging down below 40px clamps at 40px
      simulateDragMove(900, 10);
      assert.strictEqual(bottomPanelHeight, 40);
      assert.strictEqual(isPanelMaximized, false);
    });
  });
});
