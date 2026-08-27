/**
 * BridgeContext & BridgeProvider
 *
 * React Context providing centralized access to the VS Code RPC WebviewBridge
 * across all canvas nodes, property drawers, and testing panels.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import React, { createContext, useContext, ReactNode } from 'react';
import { useWebviewBridge, UseWebviewBridgeReturn } from '../hooks/useWebviewBridge';

const BridgeContext = createContext<UseWebviewBridgeReturn | null>(null);

export interface BridgeProviderProps {
  children: ReactNode;
}

/**
 * Provider component wrapping the application with Webview RPC capabilities.
 */
export const BridgeProvider: React.FC<BridgeProviderProps> = ({ children }) => {
  const bridge = useWebviewBridge();
  return <BridgeContext.Provider value={bridge}>{children}</BridgeContext.Provider>;
};

/**
 * Hook to access the Webview Bridge context within any component.
 */
export function useBridgeContext(): UseWebviewBridgeReturn {
  const context = useContext(BridgeContext);
  if (!context) {
    throw new Error('useBridgeContext must be used within a BridgeProvider');
  }
  return context;
}
