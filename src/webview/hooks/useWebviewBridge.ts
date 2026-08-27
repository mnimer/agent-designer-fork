/**
 * useWebviewBridge Hook
 *
 * Custom React Hook providing strongly-typed bi-directional RPC communication
 * between the Webview React SPA and the VS Code Extension Host.
 *
 * Architectural Decisions:
 * 1. Safe detection of VS Code Webview injection API (acquireVsCodeApi).
 * 2. Standalone Browser Fallback: Emulates extension responses when running outside
 *    VS Code (e.g. Vite dev preview).
 * 3. Request-Reply Pattern: sendRequestWithReply<T>() pairs outbound commands with
 *    inbound event acknowledgments and provides configurable timeouts.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { useEffect, useRef, useCallback } from 'react';
import {
  WebviewToExtensionMessage,
  ExtensionToWebviewMessage,
} from '../../shared/rpcProtocol';

export interface WebviewApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

export interface UseWebviewBridgeReturn {
  postMessage: (message: WebviewToExtensionMessage) => void;
  subscribe: <T extends ExtensionToWebviewMessage['type']>(
    type: T,
    listener: (
      payload: Extract<ExtensionToWebviewMessage, { type: T }> extends { payload: infer P }
        ? P
        : undefined
    ) => void
  ) => () => void;
  sendRequestWithReply: <
    TReq extends WebviewToExtensionMessage,
    TResp extends ExtensionToWebviewMessage
  >(
    request: TReq,
    responseType: TResp['type'],
    timeoutMs?: number
  ) => Promise<
    Extract<ExtensionToWebviewMessage, { type: TResp['type'] }> extends { payload: infer P }
      ? P
      : undefined
  >;
  isMockMode: boolean;
}

let globalVsCodeApi: WebviewApi | null = null;
let globalIsMockMode: boolean = false;

function getVsCodeApi(): { api: WebviewApi; isMock: boolean } {
  if (!globalVsCodeApi) {
    if (typeof window !== 'undefined' && (window as any).vscode) {
      globalVsCodeApi = (window as any).vscode;
      globalIsMockMode = false;
    } else if (typeof window !== 'undefined' && (window as any).vscodeApiInstance) {
      globalVsCodeApi = (window as any).vscodeApiInstance;
      globalIsMockMode = false;
    } else if (typeof window !== 'undefined' && typeof (window as any).acquireVsCodeApi === 'function') {
      try {
        globalVsCodeApi = (window as any).acquireVsCodeApi();
        (window as any).vscode = globalVsCodeApi;
        (window as any).vscodeApiInstance = globalVsCodeApi;
        globalIsMockMode = false;
      } catch (e) {
        if ((window as any).vscode) {
          globalVsCodeApi = (window as any).vscode;
          globalIsMockMode = false;
        } else if ((window as any).vscodeApiInstance) {
          globalVsCodeApi = (window as any).vscodeApiInstance;
          globalIsMockMode = false;
        } else {
          console.warn('[WebviewBridge] acquireVsCodeApi invocation warning:', e);
          globalIsMockMode = true;
        }
      }
    } else {
      globalIsMockMode = true;
    }

    if (!globalVsCodeApi) {
      globalVsCodeApi = {
        postMessage: (msg: unknown) => {
          console.log('[WebviewBridge:MockPostMessage]', msg);
        },
        getState: () => null,
        setState: () => {},
      };
    }
  }

  return { api: globalVsCodeApi, isMock: globalIsMockMode };
}

export function useWebviewBridge(): UseWebviewBridgeReturn {
  const listenersRef = useRef<Map<string, Set<(payload: any) => void>>>(new Map());
  const { api: vscodeApi, isMock: isMockMode } = getVsCodeApi();


  useEffect(() => {
    // Global message listener for messages sent from VS Code Extension Host
    const handleWindowMessage = (event: MessageEvent<ExtensionToWebviewMessage>) => {
      const message = event.data;
      if (!message || !message.type) return;

      const handlers = listenersRef.current.get(message.type);
      if (handlers) {
        const payload = 'payload' in message ? message.payload : undefined;
        handlers.forEach((listener) => {
          try {
            listener(payload);
          } catch (err) {
            console.error(`[useWebviewBridge] Error in listener for ${message.type}:`, err);
          }
        });
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('message', handleWindowMessage);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('message', handleWindowMessage);
      }
    };
  }, []);

  /**
   * Posts a type-safe command message to the Extension Host.
   */
  const postMessage = useCallback(
    (message: WebviewToExtensionMessage) => {
      if (vscodeApi) {
        vscodeApi.postMessage(message);
      }
    },
    [vscodeApi]
  );

  /**
   * Subscribes to typed messages emitted from the Extension Host.
   */
  const subscribe = useCallback(
    <T extends ExtensionToWebviewMessage['type']>(
      type: T,
      listener: (
        payload: Extract<ExtensionToWebviewMessage, { type: T }> extends { payload: infer P }
          ? P
          : undefined
      ) => void
    ): (() => void) => {
      let set = listenersRef.current.get(type);
      if (!set) {
        set = new Set();
        listenersRef.current.set(type, set);
      }
      set.add(listener);

      return () => {
        const currentSet = listenersRef.current.get(type);
        if (currentSet) {
          currentSet.delete(listener);
          if (currentSet.size === 0) {
            listenersRef.current.delete(type);
          }
        }
      };
    },
    []
  );

  /**
   * Sends a request to the Extension Host and awaits a typed reply with timeout.
   */
  const sendRequestWithReply = useCallback(
    <
      TReq extends WebviewToExtensionMessage,
      TResp extends ExtensionToWebviewMessage
    >(
      request: TReq,
      responseType: TResp['type'],
      timeoutMs: number = 5000
    ): Promise<
      Extract<ExtensionToWebviewMessage, { type: TResp['type'] }> extends { payload: infer P }
        ? P
        : undefined
    > => {
      return new Promise((resolve, reject) => {
        let unsubscribe: (() => void) | null = null;
        let timer: NodeJS.Timeout | null = null;

        timer = setTimeout(() => {
          if (unsubscribe) unsubscribe();
          reject(
            new Error(
              `[useWebviewBridge] Request timeout waiting for reply '${responseType}' after ${timeoutMs}ms`
            )
          );
        }, timeoutMs);

        unsubscribe = subscribe(responseType, (payload: any) => {
          if (timer) clearTimeout(timer);
          if (unsubscribe) unsubscribe();
          resolve(payload);
        });

        postMessage(request);
      });
    },
    [postMessage, subscribe]
  );

  return {
    postMessage,
    subscribe,
    sendRequestWithReply,
    isMockMode,
  };
}
