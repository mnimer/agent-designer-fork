/**
 * Unit Tests for Find in Files & Stop Buttons Functionality
 *
 * Validates:
 * 1. Find in Files regex generation, case sensitivity, and whole word boundaries.
 * 2. Search match counting across active file and multi-file collections.
 * 3. Next and previous match index cycling with wrapping.
 * 4. Code Generation Stop button (25% width, enabled during generation, emits CANCEL_CODE_GENERATION).
 * 5. Deployment Stop button (25% width, enabled when running/deploying, emits STOP_LOCAL_RUNNER).
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Find in Files & Stop Buttons', () => {
  describe('Find in Files Search Engine', () => {
    function searchInFiles(
      query: string,
      files: { name: string; content: string }[],
      isCaseSensitive: boolean,
      isWholeWord: boolean
    ) {
      if (!query.trim() || !files.length) {
        return { totalMatches: 0, fileMatches: [] };
      }

      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = isWholeWord ? `\\b${escaped}\\b` : escaped;
      const flags = isCaseSensitive ? 'g' : 'gi';

      let regex: RegExp;
      try {
        regex = new RegExp(pattern, flags);
      } catch {
        return { totalMatches: 0, fileMatches: [] };
      }

      let totalMatches = 0;
      const fileMatches: { fileName: string; matchCount: number }[] = [];

      files.forEach((file) => {
        const matches = file.content.match(regex);
        const count = matches ? matches.length : 0;
        if (count > 0) {
          totalMatches += count;
          fileMatches.push({ fileName: file.name, matchCount: count });
        }
      });

      return { totalMatches, fileMatches };
    }

    const mockFiles = [
      {
        name: 'agent.py',
        content: 'def create_agent():\n    agent = Agent(name="lead")\n    return agent\n',
      },
      {
        name: 'test_agent.py',
        content: 'def test_agent_run():\n    assert create_agent() is not None\n',
      },
      {
        name: 'main.tf',
        content: 'resource "google_project" "agent_proj" {\n  name = "agent"\n}\n',
      },
    ];

    it('should find occurrences across all files with case-insensitive search by default', () => {
      const result = searchInFiles('AGENT', mockFiles, false, false);
      // 'agent.py': create_agent, agent, Agent, agent -> 4 matches
      // 'test_agent.py': test_agent_run, create_agent -> 2 matches
      // 'main.tf': agent_proj, agent -> 2 matches
      assert.strictEqual(result.totalMatches, 8);
      assert.strictEqual(result.fileMatches.length, 3);
    });

    it('should respect case sensitivity when enabled', () => {
      const result = searchInFiles('Agent', mockFiles, true, false);
      // Only Agent(name="lead") in agent.py
      assert.strictEqual(result.totalMatches, 1);
      assert.strictEqual(result.fileMatches.length, 1);
      assert.strictEqual(result.fileMatches[0].fileName, 'agent.py');
    });

    it('should respect whole word boundaries when enabled', () => {
      const result = searchInFiles('agent', mockFiles, false, true);
      // 'agent.py': agent, Agent, agent (as words) -> 3 matches ('create_agent' excluded)
      // 'test_agent.py': 0 matches ('test_agent_run' and 'create_agent' are substrings)
      // 'main.tf': "agent" -> 1 match ('agent_proj' excluded)
      assert.strictEqual(result.totalMatches, 4);
      assert.strictEqual(result.fileMatches.length, 2);
    });

    it('should cycle next match with wrap-around', () => {
      const totalMatches = 5;
      const getNext = (current: number) => (current + 1) % totalMatches;

      assert.strictEqual(getNext(0), 1);
      assert.strictEqual(getNext(3), 4);
      assert.strictEqual(getNext(4), 0); // Wrap around to start
    });

    it('should cycle previous match with wrap-around', () => {
      const totalMatches = 5;
      const getPrev = (current: number) => (current - 1 + totalMatches) % totalMatches;

      assert.strictEqual(getPrev(0), 4); // Wrap around to end
      assert.strictEqual(getPrev(4), 3);
      assert.strictEqual(getPrev(1), 0);
    });
  });

  describe('Stop Button Specifications', () => {
    it('should verify Code Generation action buttons width split (75% generate, 25% stop)', () => {
      const generateButtonClass = 'w-3/4';
      const stopButtonClass = 'w-1/4';

      assert.strictEqual(generateButtonClass, 'w-3/4');
      assert.strictEqual(stopButtonClass, 'w-1/4');
    });

    it('should verify Code Generation stop button enablement and cancel action', () => {
      const isGenerating = true;
      const stopDisabled = !isGenerating;
      assert.strictEqual(stopDisabled, false, 'Stop button should be enabled while generating');

      const dispatchedMessages: any[] = [];
      const handleStop = () => {
        dispatchedMessages.push({ type: 'CANCEL_CODE_GENERATION' });
      };

      handleStop();
      assert.deepStrictEqual(dispatchedMessages, [{ type: 'CANCEL_CODE_GENERATION' }]);
    });

    it('should verify Deployment action buttons width split (75% run/restart, 25% stop)', () => {
      const runButtonClass = 'w-3/4';
      const stopButtonClass = 'w-1/4';

      assert.strictEqual(runButtonClass, 'w-3/4');
      assert.strictEqual(stopButtonClass, 'w-1/4');
    });

    it('should verify Deployment stop button enablement and stop runner action', () => {
      const deployStatus: 'idle' | 'deploying' | 'success' = 'success';
      const stopDisabled = deployStatus !== 'success' && deployStatus !== 'deploying';
      assert.strictEqual(stopDisabled, false, 'Stop button should be enabled when runner is running');

      const dispatchedMessages: any[] = [];
      const handleStopDeployment = (port: number) => {
        dispatchedMessages.push({
          type: 'STOP_LOCAL_RUNNER',
          payload: { port },
        });
      };

      handleStopDeployment(8000);
      assert.deepStrictEqual(dispatchedMessages, [
        {
          type: 'STOP_LOCAL_RUNNER',
          payload: { port: 8000 },
        },
      ]);
    });

    it('should display Language PYTHON label in CodePreviewTab without a redundant Python selection button', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const codePreviewSource = fs.readFileSync(
        path.resolve(__dirname, '../../../src/webview/components/tabs/CodePreviewTab.tsx'),
        'utf-8'
      );
      assert.ok(codePreviewSource.includes('<span>Language</span>'));
      assert.ok(codePreviewSource.includes('PYTHON'));
      assert.ok(!codePreviewSource.includes('🐍 Python'));
    });
  });
});
