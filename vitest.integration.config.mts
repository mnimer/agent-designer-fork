import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Vitest Configuration (Integration Tests)
 *
 * Author: Mike Nimer <mikenimer@google.com>
 *
 * Purpose:
 * Integration test configuration for live Gemini LLM generation and multi-agent
 * evaluation suites in tests/integration/.
 * Configured with 6-minute timeouts for long-running network operations.
 */
export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    exclude: ['tests/unit/**', '**/node_modules/**', '**/dist/**'],
    testTimeout: 360000, // 6 minutes timeout for Gemini LLM generation and evaluation
    hookTimeout: 60000,
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: {
      vscode: path.resolve(__dirname, 'tests/mocks/vscode.ts'),
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
