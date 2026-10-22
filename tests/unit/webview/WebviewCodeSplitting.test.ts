/**
 * Unit Tests for Webview Bundle Code-Splitting & Lazy Loading
 *
 * Validates:
 * 1. vite.config.ts enforces a strict 500 kB chunkSizeWarningLimit and outputs split chunks under assets/chunks/.
 * 2. package.json compile:webview uses Vite's code-split output without overwriting index.js with a 3.1 MB esbuild bundle.
 * 3. WebviewHtmlProvider.ts loads the entry bundle as an ES module (<script type="module" nonce="..." src="...">)
 *    so relative dynamic imports and shared chunks resolve cleanly inside the VS Code Webview sandbox.
 * 4. FlowCanvas.tsx, CanvasTab.tsx, and CodeGenerationPanel.tsx lazy-load off-screen drawers, modals, settings, and tabs
 *    via React.lazy and Suspense.
 * 5. Built JS assets in dist/webview/assets/ and dist/webview/assets/chunks/ are all strictly under 500 kB.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getHtmlForWebview } from '../../../src/extension/editor/WebviewHtmlProvider';

const ROOT_DIR = path.resolve(__dirname, '../../..');

describe('Webview Code-Splitting & Lazy Loading', () => {
  it('should configure vite.config.ts with 500 kB chunkSizeWarningLimit, assets/chunks/ output, and manualChunks', () => {
    const viteConfigPath = path.join(ROOT_DIR, 'vite.config.ts');
    const source = fs.readFileSync(viteConfigPath, 'utf-8');

    assert.ok(
      source.includes('chunkSizeWarningLimit: 500'),
      'vite.config.ts must enforce the strict 500 kB chunkSizeWarningLimit'
    );
    assert.ok(
      source.includes("chunkFileNames: 'assets/chunks/[name]-[hash].js'"),
      'vite.config.ts must emit split chunks to assets/chunks/[name]-[hash].js'
    );
    assert.ok(
      source.includes('manualChunks'),
      'vite.config.ts must configure manualChunks for vendor and feature code splitting'
    );
  });

  it('should not overwrite Vite code-split output with a monolithic esbuild bundle in package.json', () => {
    const pkgPath = path.join(ROOT_DIR, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const compileWebview: string = pkg.scripts?.['compile:webview'] || '';

    assert.ok(
      compileWebview.includes('vite build'),
      'compile:webview must run vite build'
    );
    assert.ok(
      !compileWebview.includes('esbuild src/webview/main.tsx --bundle --outfile=dist/webview/assets/index.js'),
      'compile:webview must not overwrite Vite output with a monolithic esbuild bundle'
    );
  });

  it('should render <script type="module" nonce="..." src="..."> in WebviewHtmlProvider when jsUri is available', () => {
    const mockWebview: any = {
      cspSource: 'vscode-webview://test-origin',
      asWebviewUri: (uri: any) => `vscode-webview://test-origin${uri.path || uri.fsPath || String(uri)}`,
    };
    const mockContext: any = {
      extensionPath: ROOT_DIR,
      extensionUri: { fsPath: ROOT_DIR, path: ROOT_DIR },
    };

    const html = getHtmlForWebview(mockWebview, mockContext);
    assert.match(
      html,
      /<script\s+type="module"\s+nonce="[^"]+"\s+src="vscode-webview:\/\/test-origin[^"]*\/dist\/webview\/assets\/index\.js"><\/script>/,
      'WebviewHtmlProvider must load index.js via <script type="module" nonce="..." src="..."> so ES module chunks resolve relative to index.js'
    );
  });

  it('should lazy-load off-screen drawers, modals, settings, and bottom tabs using React.lazy and Suspense', () => {
    const flowCanvasSrc = fs.readFileSync(
      path.join(ROOT_DIR, 'src/webview/components/FlowCanvas.tsx'),
      'utf-8'
    );
    const canvasTabSrc = fs.readFileSync(
      path.join(ROOT_DIR, 'src/webview/components/tabs/CanvasTab.tsx'),
      'utf-8'
    );
    const codeGenPanelSrc = fs.readFileSync(
      path.join(ROOT_DIR, 'src/webview/components/codegen/CodeGenerationPanel.tsx'),
      'utf-8'
    );

    assert.ok(
      flowCanvasSrc.includes('React.lazy') && flowCanvasSrc.includes('Suspense'),
      'FlowCanvas.tsx must use React.lazy and Suspense for off-screen modals and settings'
    );
    assert.ok(
      canvasTabSrc.includes('React.lazy') && canvasTabSrc.includes('Suspense'),
      'CanvasTab.tsx must use React.lazy and Suspense for property inspector drawers'
    );
    assert.ok(
      codeGenPanelSrc.includes('React.lazy') && codeGenPanelSrc.includes('Suspense'),
      'CodeGenerationPanel.tsx must use React.lazy and Suspense for bottom panel sub-tabs'
    );
  });

  it('should emit dist/webview/assets/index.js and split chunks under 500 kB each', () => {
    const assetsDir = path.join(ROOT_DIR, 'dist/webview/assets');
    const chunksDir = path.join(assetsDir, 'chunks');
    const entryJsPath = path.join(assetsDir, 'index.js');

    assert.ok(fs.existsSync(entryJsPath), 'dist/webview/assets/index.js must exist after build');
    assert.ok(fs.existsSync(chunksDir), 'dist/webview/assets/chunks/ directory must exist after build');

    const MAX_CHUNK_BYTES = 500 * 1024;
    const entryStats = fs.statSync(entryJsPath);
    assert.ok(
      entryStats.size < MAX_CHUNK_BYTES,
      `Entry bundle index.js (${entryStats.size} bytes) must be under 500 kB (${MAX_CHUNK_BYTES} bytes)`
    );

    const chunkFiles = fs.readdirSync(chunksDir).filter((f) => f.endsWith('.js'));
    assert.ok(
      chunkFiles.length >= 10,
      `Expected at least 10 split JS chunks in dist/webview/assets/chunks/, found ${chunkFiles.length}`
    );

    for (const file of chunkFiles) {
      const filePath = path.join(chunksDir, file);
      const stat = fs.statSync(filePath);
      assert.ok(
        stat.size < MAX_CHUNK_BYTES,
        `Chunk ${file} (${stat.size} bytes) must be strictly under 500 kB (${MAX_CHUNK_BYTES} bytes)`
      );
    }
  });
});
