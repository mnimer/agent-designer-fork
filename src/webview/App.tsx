/**
 * App.tsx - Visual Agent Designer Root Entrypoint & Context Orchestrator
 *
 * Purpose:
 * Top-level application shell for the Visual Agent Designer webview in VS Code.
 * Sets up global context providers, manages state routers, and re-exports critical
 * workflow synchronization utilities to preserve compatibility with existing unit test suites.
 *
 * Architectural Decisions:
 * - Author: Mike Nimer <mikenimer@google.com>
 * - Ultra-thin global coordinator. All graph and layout logic is modularized into FlowCanvas and tabs.
 * - Spacing layout complies with 8pt grid system.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import React from 'react';
import { ReactFlowProvider } from '@xyflow/react';

// Context Providers
import { ThemeProvider } from './context/ThemeContext';
import { BridgeProvider } from './context/BridgeContext';
import { SettingsProvider } from './context/SettingsContext';

// Core Flow Canvas Component
import { FlowCanvas } from './components/FlowCanvas';

/**
 * Universal helper to identify trigger nodes regardless of whether type is triggerNode or trigger
 */
export const isTriggerNode = (node: { type?: string; data?: any } | null | undefined): boolean =>
  node?.type === 'triggerNode' ||
  node?.type === 'trigger' ||
  !!node?.data?.triggerType ||
  !!node?.data?.triggerKind;

// Re-export utility functions to preserve backward compatibility for existing test suites
export {
  syncAgentSubAgents,
  computeTargetFolder,
  resolveAgentOutputFolder,
} from './utils/workflowSync';

/**
 * Root exported App component. Wraps the interactive diagram canvas with global context providers.
 */
export default function App() {
  return (
    <ThemeProvider>
      <BridgeProvider>
        <SettingsProvider>
          <ReactFlowProvider>
            <FlowCanvas />
          </ReactFlowProvider>
        </SettingsProvider>
      </BridgeProvider>
    </ThemeProvider>
  );
}
