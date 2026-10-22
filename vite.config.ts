import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

/**
 * Vite Bundler Configuration for VS Code Webview SPA
 *
 * Purpose:
 * Configures Rollup/Vite bundling, vendor/feature manual chunking, and CSS compilation
 * for the Visual Agent Designer Webview SPA so every emitted JavaScript chunk stays
 * well below the 500 kB threshold and off-screen views load on demand.
 *
 * Architectural Decisions:
 * - Emits entry bundle to `assets/index.js` and shared/dynamic chunks to `assets/chunks/[name]-[hash].js`.
 * - Separates React core, React Flow + Dagre graph layout, Lucide icons, and static MCP/tool catalogs
 *   into dedicated cacheable chunks.
 *
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
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name].[ext]',
        manualChunks(id) {
          if (id.endsWith('.css')) {
            return undefined;
          }
          if (id.includes('node_modules')) {
            if (
              /node_modules\/(react|react-dom|scheduler)\//.test(id)
            ) {
              return 'vendor-react';
            }
            if (
              /node_modules\/(@xyflow|d3-[a-z-]+|zustand|classcat|use-sync-external-store|dagre|graphlib)\//.test(id)
            ) {
              return 'vendor-reactflow';
            }
            if (id.includes('node_modules/lucide-react')) {
              return 'vendor-icons';
            }
            return 'vendor';
          }
          if (
            /src\/webview\/data\/(googleCloudMcpServers|googleWorkspaceMcpServers|databricksMcpServers|snowflakeMcpServers|builtinToolsRegistry|a2uiCatalogRegistry|defaultTools)/.test(id)
          ) {
            return 'catalog-data';
          }
          if (id.includes('src/webview/components/runner/A2UISurfaceRenderer')) {
            return 'a2ui-renderer';
          }
          if (id.includes('src/webview/components/inspector/tools/McpToolDrawer')) {
            return 'mcp-tool-drawer';
          }
          return undefined;
        },
      },
    },
  },
});
