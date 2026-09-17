import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Vitest Configuration with VS Code Module Mocking and Test Explorer Integration
 *
 * Author: Mike Nimer <mikenimer@google.com>
 *
 * Purpose:
 * Configures Vitest for unit tests in tests/unit/ and seamlessly integrates with the
 * VS Code Test Explorer panel.
 *
 * Architectural decisions:
 * - Directs unit testing to `tests/unit/**` so that fast unit tests execute in milliseconds
 *   without triggering network-bound LLM integration suites in `tests/integration/**`.
 * - Sets a 30s test timeout to accommodate asynchronous timer and subprocess lifecycle tests.
 * - Aliases 'node:test' to 'vitest' so that tests written with `node:test` run natively in Vitest.
 * - Provides VS Code extension host mocking via `tests/mocks/vscode.ts`.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
    include: ['tests/unit/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    exclude: ['tests/integration/**', '**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/**/*.d.ts', 'src/webview/index.html'],
    },
  },
  resolve: {
    alias: {
      'node:test': 'vitest',
      vscode: path.resolve(__dirname, 'tests/mocks/vscode.ts'),
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
