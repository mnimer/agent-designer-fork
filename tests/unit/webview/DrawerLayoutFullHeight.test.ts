/**
 * Unit Tests for Full-Height Viewport Drawer Layout & Parity
 *
 * Validates that all Agent, Tool, and Trigger inspector sidebars
 * render with identical full-viewport overlay positioning:
 * 1. fixed inset-y-0 right-0 z-50 w-[420px]
 * 2. Complete absence of bounded absolute positioning (e.g. `absolute top-0 right-0 bottom-0`)
 * 3. Parity across both extension webview components and mockup components
 * 4. Architectural documentation compliance across all drawer components
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Full-Height Viewport Drawer Layout Parity', () => {
  const projectRoot = path.resolve(__dirname, '../../../');

  const webviewInspectorFiles = [
    'src/webview/components/inspector/StandardAgentDrawer.tsx',
    'src/webview/components/inspector/RouterAgentDrawer.tsx',
    'src/webview/components/inspector/A2AAgentDrawer.tsx',
    'src/webview/components/inspector/ApprovalDrawer.tsx',
    'src/webview/components/inspector/FallbackDrawer.tsx',
    'src/webview/components/inspector/GuardrailDrawer.tsx',
    'src/webview/components/inspector/SynthesizerDrawer.tsx',
    'src/webview/components/inspector/tools/ToolDrawerShell.tsx',
    'src/webview/components/inspector/TriggerDrawer.tsx',
  ];

  const mockupInspectorFiles = [
    'mockup/src/components/inspector/StandardAgentDrawer.tsx',
    'mockup/src/components/inspector/RouterAgentDrawer.tsx',
    'mockup/src/components/inspector/A2AAgentDrawer.tsx',
    'mockup/src/components/inspector/ToolDrawer.tsx',
    'mockup/src/components/inspector/TriggerDrawer.tsx',
  ];

  const requiredTokens = ['fixed', 'inset-y-0', 'right-0', 'z-50', 'w-[420px]'];
  const forbiddenTokens = ['absolute top-0 right-0 bottom-0', 'z-30 w-96', 'z-40 w-96'];

  for (const relPath of webviewInspectorFiles) {
    const filename = path.basename(relPath);

    it(`Webview drawer "${filename}" must use full-height fixed viewport overlay layout`, () => {
      const fullPath = path.join(projectRoot, relPath);
      assert.ok(fs.existsSync(fullPath), `File does not exist: ${relPath}`);
      const content = fs.readFileSync(fullPath, 'utf8');

      // Check required layout tokens
      for (const token of requiredTokens) {
        assert.ok(
          content.includes(token),
          `Component ${filename} is missing required layout token "${token}".`
        );
      }

      // Ensure deprecated bounded positioning is not present on the root drawer
      for (const forbidden of forbiddenTokens) {
        assert.ok(
          !content.includes(forbidden),
          `Component ${filename} contains deprecated bounded drawer styling "${forbidden}".`
        );
      }
    });

    it(`Webview drawer "${filename}" should document full-height drawer architectural decision`, () => {
      const fullPath = path.join(projectRoot, relPath);
      const content = fs.readFileSync(fullPath, 'utf8');

      assert.ok(
        content.includes('Full-Height Viewport Drawer') || content.includes('fixed inset-y-0 right-0 z-50'),
        `Component ${filename} must document Full-Height Viewport Drawer in architectural decisions.`
      );
      assert.ok(
        content.includes('Mike Nimer <mikenimer@google.com>'),
        `Component ${filename} must include Mike Nimer as Author.`
      );
    });
  }

  for (const relPath of mockupInspectorFiles) {
    const filename = path.basename(relPath);

    it(`Mockup drawer "${filename}" must match fixed full-height overlay styling`, () => {
      const fullPath = path.join(projectRoot, relPath);
      assert.ok(fs.existsSync(fullPath), `File does not exist: ${relPath}`);
      const content = fs.readFileSync(fullPath, 'utf8');

      for (const token of requiredTokens) {
        assert.ok(
          content.includes(token),
          `Mockup component ${filename} is missing required layout token "${token}".`
        );
      }

      for (const forbidden of forbiddenTokens) {
        assert.ok(
          !content.includes(forbidden),
          `Mockup component ${filename} contains deprecated bounded drawer styling "${forbidden}".`
        );
      }
    });
  }

  it('All drawer containers across webview and mockup must use standard 8pt grid border and shadow tokens', () => {
    const allFiles = [...webviewInspectorFiles, ...mockupInspectorFiles];
    for (const relPath of allFiles) {
      const fullPath = path.join(projectRoot, relPath);
      const content = fs.readFileSync(fullPath, 'utf8');

      assert.ok(
        content.includes('border-l border-[#30363d]'),
        `File ${relPath} should have border-l border-[#30363d]`
      );
      assert.ok(
        content.includes('shadow-2xl'),
        `File ${relPath} should have shadow-2xl`
      );
    }
  });
});

