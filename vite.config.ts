import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

/**
 * Vite Bundler Configuration for VS Code Webview SPA
 * @author Mike Nimer <mikenimer@google.com>
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: path.resolve(__dirname, 'src/webview'),
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist/webview'),
    emptyOutDir: true,
    modulePreload: false,
    cssCodeSplit: true,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
});
