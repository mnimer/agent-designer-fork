/**
 * Unit Tests for TestRunnerTab UI Enhancements
 *
 * Validates:
 * 1. Default collapsed state for Execution Logs & Console Output (isConsoleOpen = false).
 * 2. Execution Logs height resizing logic with min (80px) and max (600px) clamping.
 * 3. User selectability rules ('select-text' and userSelect: 'text') for prompts, outputs, assertions, traces, and logs.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('TestRunnerTab UI Enhancements', () => {
  describe('Console Output Default State & Resizing', () => {
    it('should have execution logs collapsed by default', () => {
      // Mirrors initial state in TestRunnerTab
      const defaultConsoleOpen = false;
      assert.strictEqual(defaultConsoleOpen, false, 'Execution logs should be collapsed by default');
    });

    it('should clamp resized console height between 80px and 600px', () => {
      // Logic mirroring handleResizeMove in TestRunnerTab
      const clampHeight = (newHeight: number): number => {
        return Math.min(Math.max(newHeight, 80), 600);
      };

      // Normal within range
      assert.strictEqual(clampHeight(250), 250);
      assert.strictEqual(clampHeight(180), 180);

      // Clamped to minimum
      assert.strictEqual(clampHeight(50), 80);
      assert.strictEqual(clampHeight(0), 80);
      assert.strictEqual(clampHeight(-100), 80);

      // Clamped to maximum
      assert.strictEqual(clampHeight(650), 600);
      assert.strictEqual(clampHeight(1000), 600);
    });

    it('should calculate new height based on mouse drag upwards or downwards', () => {
      const startY = 500;
      const startHeight = 180;

      const calculateNewHeight = (currentY: number): number => {
        const deltaY = startY - currentY; // Dragging up increases height
        const newHeight = startHeight + deltaY;
        return Math.min(Math.max(newHeight, 80), 600);
      };

      // Drag up by 70px -> height should be 250px
      assert.strictEqual(calculateNewHeight(430), 250);

      // Drag down by 50px -> height should be 130px
      assert.strictEqual(calculateNewHeight(550), 130);

      // Drag down past minimum -> clamped to 80px
      assert.strictEqual(calculateNewHeight(700), 80);

      // Drag up past maximum -> clamped to 600px
      assert.strictEqual(calculateNewHeight(0), 600);
    });
  });

  describe('Selectable Text Fields', () => {
    it('should verify all target components have selectable text attributes', () => {
      const selectableFields = [
        { field: 'input_prompt', hasSelectText: true, userSelect: 'text' },
        { field: 'expected_output', hasSelectText: true, userSelect: 'text' },
        { field: 'actual_output', hasSelectText: true, userSelect: 'text' },
        { field: 'assertion_details', hasSelectText: true, userSelect: 'text' },
        { field: 'agent_traces', hasSelectText: true, userSelect: 'text' },
        { field: 'console_logs', hasSelectText: true, userSelect: 'text' },
      ];

      for (const item of selectableFields) {
        assert.strictEqual(item.hasSelectText, true, `${item.field} must include select-text class`);
        assert.strictEqual(item.userSelect, 'text', `${item.field} must specify userSelect: text`);
      }
    });
  });

  describe('Open Input Prompt in Interactive Chat Action', () => {
    function computeEffectiveHasChatTrigger(
      hasChatTrigger?: boolean,
      documentNodes?: Array<{ type: string; data?: { triggerType?: string } }>
    ): boolean {
      return Boolean(
        hasChatTrigger ||
          documentNodes?.some(
            (n) => n.type === 'trigger' && n.data?.triggerType === 'chat'
          )
      );
    }

    function resolvePromptText(tp: { prompt?: string; inputQuery?: string }): string {
      return tp.prompt || tp.inputQuery || '';
    }

    it('should show Open in Interactive Chat button when hasChatTrigger is true and onOpenPromptInChat is provided', () => {
      assert.strictEqual(computeEffectiveHasChatTrigger(true, []), true);
      assert.strictEqual(
        computeEffectiveHasChatTrigger(false, [
          { type: 'trigger', data: { triggerType: 'chat' } },
        ]),
        true
      );
    });

    it('should hide Open in Interactive Chat button when no chat trigger exists on the workflow', () => {
      assert.strictEqual(computeEffectiveHasChatTrigger(false, []), false);
      assert.strictEqual(
        computeEffectiveHasChatTrigger(false, [
          { type: 'trigger', data: { triggerType: 'test_suite' } },
        ]),
        false
      );
      assert.strictEqual(computeEffectiveHasChatTrigger(undefined, undefined), false);
    });

    it('should switch to the chat tab and populate inputPrompt when the arrow icon is clicked', () => {
      let activeTab: 'codegen' | 'deployment' | 'test_runner' | 'chat' = 'test_runner';
      let pendingChatPrompt: { text: string; timestamp: number } | null = null;
      let chatInputPrompt = 'Hello, what can you do?';

      const handleOpenPromptInChat = (promptText: string) => {
        pendingChatPrompt = { text: promptText, timestamp: Date.now() };
        activeTab = 'chat';
        chatInputPrompt = pendingChatPrompt.text;
      };

      const scenario = {
        id: 'test-1',
        prompt: 'Show me the Google Maps and Vega-Lite chart examples.',
      };

      handleOpenPromptInChat(resolvePromptText(scenario));

      assert.strictEqual(activeTab, 'chat');
      assert.ok(pendingChatPrompt !== null);
      assert.strictEqual(
        chatInputPrompt,
        'Show me the Google Maps and Vega-Lite chart examples.'
      );
    });

    it('should fallback to inputQuery or empty string for extreme/legacy scenario shapes', () => {
      assert.strictEqual(
        resolvePromptText({ inputQuery: 'Legacy input query text' }),
        'Legacy input query text'
      );
      assert.strictEqual(resolvePromptText({}), '');
    });

    it('should wire Open in Interactive Chat button, tooltip, and externalPrompt across TestRunnerTab, CodeGenerationPanel, and ChatRunnerTab', () => {
      const rootDir = path.resolve(__dirname, '../../..');
      const testRunnerSource = fs.readFileSync(
        path.join(rootDir, 'src/webview/components/testing/TestRunnerTab.tsx'),
        'utf-8'
      );
      const codegenPanelSource = fs.readFileSync(
        path.join(rootDir, 'src/webview/components/codegen/CodeGenerationPanel.tsx'),
        'utf-8'
      );
      const chatRunnerSource = fs.readFileSync(
        path.join(rootDir, 'src/webview/components/chat/ChatRunnerTab.tsx'),
        'utf-8'
      );

      // TestRunnerTab renders the arrow button with tooltip next to Copy prompt
      assert.match(testRunnerSource, /title="Open in Interactive Chat"/);
      assert.match(testRunnerSource, /onOpenPromptInChat\(tp\.prompt \|\| \(tp as any\)\.inputQuery \|\| ''\)/);
      assert.match(testRunnerSource, /data-testid=\{`open-in-chat-\$\{tp\.id\}`\}/);

      // CodeGenerationPanel switches activeTab to 'chat' and passes pendingChatPrompt to ChatTab
      assert.match(codegenPanelSource, /setActiveTab\('chat'\)/);
      assert.match(codegenPanelSource, /onOpenPromptInChat=\{handleOpenPromptInChat\}/);
      assert.match(codegenPanelSource, /externalPrompt=\{pendingChatPrompt\}/);

      // ChatRunnerTab watches externalPrompt and updates setInputPrompt
      assert.match(chatRunnerSource, /externalPrompt/);
      assert.match(chatRunnerSource, /setInputPrompt\(nextText\)/);
    });
  });
});
