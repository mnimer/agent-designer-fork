import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Vitest Configuration with VS Code Module Mocking
 * @author Mike Nimer <mikenimer@google.com>
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/**/*.d.ts', 'src/webview/index.html'],
    },
  },
  resolve: {
    alias: {
      vscode: path.resolve(__dirname, 'tests/mocks/vscode.ts'),
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
