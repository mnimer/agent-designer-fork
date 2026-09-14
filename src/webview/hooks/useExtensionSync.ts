/**
 * useExtensionSync.ts - VS Code Extension Host IPC Synchronization Hook
 *
 * Purpose:
 * Manages bidirectional document synchronization between the Webview React application
 * and the VS Code extension host over the `WebviewBridge`. Handles loading `.agent` files
 * from disk, real-time debounced updates back to the VS Code text buffer, and code generation notifications.
 *
 * Architectural Decisions:
 * - Author: Mike Nimer <mikenimer@google.com>
 * - Loopback Prevention: Uses `lastSentJsonRef` string comparison to prevent infinite echo loops
 *   between the extension host buffer and webview state updates.
 * - Initial Load Gating: Uses `isLoadedRef` to prevent firing `DOCUMENT_UPDATED` during the initial
 *   state mounting cycle before the document has arrived from the extension host.
 * - Auto-Directory Discovery: Inspects target directories via `CHECK_FILES_EXIST` whenever the output
 *   folder changes to dynamically show existing generated code.
 * - Debounced State Updates (TASK-136): Debounces document serialization and sync message dispatching by 250ms.
 * - Schema Version Preservation (TASK-136): Retains the original loaded schema version string, avoiding down-migration.
 * - Parse Error Handling UI (TASK-136): Intercepts PARSE_ERROR messages to inject a non-interactive blocking UI overlay.
 */

import { useRef, useEffect } from 'react';
import { Node, Edge } from '@xyflow/react';
import { WebviewBridge } from './useWebviewBridge';
import { normalizeLoadedNodes, normalizeLoadedEdges, computeTargetFolder, resolveAgentOutputFolder } from '../utils/workflowSync';
import { AgentFileTab, GenerationConfig, GeneratedFile } from '../types';
import { WorkflowNode, WorkflowEdge, AgentWorkflowDocument } from '../../shared/types';
import { fnv1a } from '../utils/hashUtils';

export interface UseExtensionSyncOptions {
  bridge: WebviewBridge;
  nodes: Node<any>[];
  edges: Edge[];
  config: GenerationConfig;
  fileTabs: AgentFileTab[];
  activeTabId: string;
  setNodes: (nodes: Node<any>[]) => void;
  setEdges: (edges: Edge[]) => void;
  setFileTabs?: React.Dispatch<React.SetStateAction<AgentFileTab[]>>;
  fitView?: (options?: { padding?: number; duration?: number }) => void;
  setConfig: React.Dispatch<React.SetStateAction<GenerationConfig>>;
  setGeneratedFiles: React.Dispatch<React.SetStateAction<GeneratedFile[]>>;
  setHasGeneratedCode: (hasCode: boolean) => void;
  setIsGenerating: (generating: boolean) => void;
  recordSnapshot: (nodes: Node<any>[], edges: Edge[], options?: { description?: string }) => void;
  setFileTabs?: React.Dispatch<React.SetStateAction<AgentFileTab[]>>;
}

/**
 * Custom hook to manage synchronization between the Webview and VS Code Extension Host.
 *
 * @param options Configuration options including graph state, tabs, bridge, and dispatch setters.
 */
export function useExtensionSync(options: UseExtensionSyncOptions): void {
  const {
    bridge,
    nodes,
    edges,
    config,
    fileTabs,
    activeTabId,
    setNodes,
    setEdges,
    setFileTabs,
    fitView,
    setConfig,
    setGeneratedFiles,
    setHasGeneratedCode,
    setIsGenerating,
    recordSnapshot,
  } = options;

  const docVersionRef = useRef(1);
  const isLoadedRef = useRef(false);
  const lastSentJsonRef = useRef<string>('');
  const lastSentHashRef = useRef<string>('');
  const docNameRef = useRef<string>('');
  const docDescriptionRef = useRef<string>('');
  const docMetadataRef = useRef<Record<string, any>>({});
  const docVersionValueRef = useRef<string>('1.0.0');

  // NOTE: Signal to the VS Code extension host that the webview is mounted and ready to receive the document
  useEffect(() => {
    // Primary READY handshake signal
    bridge.postMessage({ type: 'READY' });

    // Defensive retry: if document has not loaded after 500ms, retry READY signal
    const retryTimer = setTimeout(() => {
      if (!isLoadedRef.current) {
        bridge.postMessage({ type: 'READY' });
      }
    }, 500);

    return () => {
      clearTimeout(retryTimer);
    };
  }, [bridge]);

  // NOTE: Listen for messages from the VS Code extension host
  useEffect(() => {
    const unsubLoadDoc = bridge.subscribe('LOAD_DOCUMENT', (payload) => {
      if (!payload?.document) return;

      const overlay = document.getElementById('parse-error-overlay');
      if (overlay) {
        overlay.remove();
      }

      const doc = payload.document;
      if (doc.version) {
        docVersionValueRef.current = doc.version;
      }
      if (payload.docVersion) {
        docVersionRef.current = payload.docVersion;
      }
      if (doc.name) {
        docNameRef.current = doc.name;
      }
      if (doc.description) {
        docDescriptionRef.current = doc.description;
      }
      if (doc.metadata) {
        const { outputFolder: _discardOutput, deploymentTarget: _discardTarget, ...restMetadata } = doc.metadata as any;
        docMetadataRef.current = restMetadata;
      }

      const docMetadata = doc.metadata || {};
      const deploymentCfg = doc.deployment || {};
      const targetFolder = resolveAgentOutputFolder(
        deploymentCfg.outputFolder || (docMetadata as any).outputFolder,
        payload.filePath || (doc.name ? doc.name + '.agent' : 'workflow.agent')
      );
      const restoredTarget = (deploymentCfg.target || deploymentCfg.deploymentTarget || (docMetadata as any).deploymentTarget || 'agent_engine') as 'cloud_run' | 'agent_engine';
      const restoredFramework =
        deploymentCfg.framework === 'google-adk'
          ? 'google_adk'
          : deploymentCfg.framework ||
            (doc.framework === 'google-adk' ? 'google_adk' : (doc.framework as any)) ||
            'google_adk';
      const restoredLanguage = deploymentCfg.language || doc.language || 'python';

      if (Array.isArray(doc.nodes)) {
        const normNodes = normalizeLoadedNodes(doc.nodes);
        const normEdges = normalizeLoadedEdges(doc.edges || []);
        setNodes(normNodes);
        setEdges(normEdges);
        recordSnapshot(normNodes, normEdges, { description: 'Loaded document from disk' });

        const loadedDeployment = doc.deployment || {
          target: restoredTarget,
          deploymentTarget: restoredTarget,
          outputFolder: targetFolder,
          framework: restoredFramework === 'google_adk' ? 'google-adk' : restoredFramework,
          language: restoredLanguage,
        };

        // Update active file tab with loaded document metadata
        if (setFileTabs) {
          const filename = payload.filePath
            ? payload.filePath.split(/[/\\]/).filter(Boolean).pop() || (doc.name ? `${doc.name}.agent` : 'workflow.agent')
            : (doc.name ? `${doc.name}.agent` : 'workflow.agent');
          const title = doc.name || filename;

          setFileTabs((prev) =>
            prev.map((t) =>
              t.id === activeTabId
                ? {
                    ...t,
                    filename,
                    title,
                    nodes: normNodes,
                    edges: normEdges,
                    config: {
                      ...t.config,
                      framework: doc.framework === 'google-adk' ? 'google_adk' : (doc.framework as any) || t.config.framework,
                      language: doc.language || t.config.language,
                      outputFolder: targetFolder,
                    },
                  }
                : t
            )
          );
        }

        // Center and fit canvas viewport to loaded nodes
        setTimeout(() => {
          fitView?.({ padding: 0.2, duration: 400 });
        }, 50);

        // Record initial loaded JSON to avoid immediately echoing a duplicate back
        const loadedJson = JSON.stringify({
          version: doc.version || '1.0.0',
          name: doc.name || 'agent_workflow',
          description: doc.description || 'Agent Workflow Document',
          framework: doc.framework || 'google-adk',
          language: doc.language || 'python',
          nodes: normNodes.map((n) => ({
            id: n.id,
            type: n.type,
            position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
            data: { ...n.data },
          })),
          edges: normEdges.map((e) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            sourceHandle: e.sourceHandle,
            targetHandle: e.targetHandle,
            type: e.type,
            animated: e.animated,
            data: e.data,
          })),
          metadata: doc.metadata || {},
          deployment: loadedDeployment,
        });
        lastSentJsonRef.current = loadedJson;
        lastSentHashRef.current = fnv1a(loadedJson);
      }

      setConfig((prev) => ({
        ...prev,
        framework: (restoredFramework as any) || prev.framework,
        language: (restoredLanguage as any) || prev.language,
        outputFolder: targetFolder,
        deploymentTarget: restoredTarget,
        includeTests: typeof deploymentCfg.includeTests === 'boolean' ? deploymentCfg.includeTests : prev.includeTests,
        includeDocker: typeof deploymentCfg.includeDocker === 'boolean' ? deploymentCfg.includeDocker : prev.includeDocker,
        useStreaming: typeof deploymentCfg.useStreaming === 'boolean' ? deploymentCfg.useStreaming : prev.useStreaming,
        deployedResourceId: deploymentCfg.deployedResourceId ?? prev.deployedResourceId,
        serviceUrl: deploymentCfg.serviceUrl ?? prev.serviceUrl,
        consoleUrl: deploymentCfg.consoleUrl ?? prev.consoleUrl,
        deployedAt: deploymentCfg.deployedAt ?? prev.deployedAt,
      }));

      if (setFileTabs && activeTabId) {
        const docFileName = payload.filePath
          ? payload.filePath.split('/').filter(Boolean).pop() || payload.filePath
          : (doc.name ? `${doc.name}.agent` : 'workflow.agent');
        setFileTabs((prev) =>
          prev.map((t) =>
            t.id === activeTabId
              ? {
                  ...t,
                  filename: docFileName,
                  title: docFileName,
                  config: {
                    ...t.config,
                    framework: (restoredFramework as any) || t.config.framework,
                    language: (restoredLanguage as any) || t.config.language,
                    outputFolder: targetFolder,
                    deploymentTarget: restoredTarget,
                    deployedResourceId: deploymentCfg.deployedResourceId ?? t.config.deployedResourceId,
                    serviceUrl: deploymentCfg.serviceUrl ?? t.config.serviceUrl,
                    consoleUrl: deploymentCfg.consoleUrl ?? t.config.consoleUrl,
                    deployedAt: deploymentCfg.deployedAt ?? t.config.deployedAt,
                  },
                }
              : t
          )
        );
      }

      if (payload.generatedFiles && payload.generatedFiles.length > 0) {
        setGeneratedFiles(payload.generatedFiles);
        setHasGeneratedCode(true);
      }

      // Enable real-time document synchronization to VS Code text buffer after initial load completes
      setTimeout(() => {
        isLoadedRef.current = true;
      }, 100);
    });

    const unsubParseError = bridge.subscribe('PARSE_ERROR', (payload) => {
      if (!payload) return;
      let overlay = document.getElementById('parse-error-overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'parse-error-overlay';
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100vw';
        overlay.style.height = '100vh';
        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.85)';
        overlay.style.zIndex = '99999';
        overlay.style.display = 'flex';
        overlay.style.flexDirection = 'column';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.color = '#ff6b6b';
        overlay.style.fontFamily = 'monospace';
        overlay.style.padding = '20px';
        overlay.style.textAlign = 'center';
        document.body.appendChild(overlay);
      }
      overlay.innerHTML = `
        <div style="background-color: #1e1e1e; border: 1px solid #ff6b6b; padding: 24px; border-radius: 8px; max-width: 600px; box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
          <h2 style="margin-top: 0; color: #ff6b6b;">[CRITICAL] Malformed .agent Document</h2>
          <p style="color: #cccccc; font-size: 14px; text-align: left;">The document could not be loaded because it contains invalid JSON or schema errors:</p>
          <pre style="background-color: #2d2d2d; color: #f8f8f2; padding: 12px; border-radius: 4px; text-align: left; overflow-x: auto; max-height: 200px; font-size: 12px; border: 1px solid #444; white-space: pre-wrap; word-break: break-all;">${payload.error}</pre>
          <p style="color: #888888; font-size: 12px; margin-bottom: 0;">Please correct the syntax error in the standard VS Code text editor to resume designing.</p>
        </div>
      `;
    });

    const unsubCodeGenerated = bridge.subscribe('CODE_GENERATED', (payload) => {
      setIsGenerating(false);
      if (payload.success && payload.files && payload.files.length > 0) {
        setGeneratedFiles(payload.files);
        setHasGeneratedCode(true);
      } else {
        setGeneratedFiles([]);
        setHasGeneratedCode(false);
      }
    });

    const unsubFilesExist = bridge.subscribe('FILES_EXIST_RESPONSE', (payload) => {
      if (payload?.generatedFiles && payload.generatedFiles.length > 0) {
        setGeneratedFiles(payload.generatedFiles);
        setHasGeneratedCode(true);
      }
    });

    return () => {
      unsubLoadDoc();
      unsubParseError();
      unsubCodeGenerated();
      unsubFilesExist();
    };
  }, [bridge, activeTabId, setNodes, setEdges, setFileTabs, fitView, setConfig, setGeneratedFiles, setHasGeneratedCode, setIsGenerating, recordSnapshot]);

  // Check filesystem for existing generated code when target output folder changes
  useEffect(() => {
    if (config.outputFolder) {
      bridge.postMessage({
        type: 'CHECK_FILES_EXIST',
        payload: {
          targetDirectory: config.outputFolder,
        },
      });
    }
  }, [config.outputFolder, bridge]);

  // Real-time synchronization of nodes/edges/config back to VS Code text buffer via DOCUMENT_UPDATED
  useEffect(() => {
    if (!isLoadedRef.current) return;

    const debounceTimer = setTimeout(() => {
      const documentNodes: WorkflowNode[] = nodes.map((node) => ({
        id: node.id,
        type: node.type as any,
        position: { x: Math.round(node.position.x), y: Math.round(node.position.y) },
        data: { ...node.data },
      }));

      const documentEdges: WorkflowEdge[] = edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle || undefined,
        targetHandle: edge.targetHandle || undefined,
        type: edge.type,
        animated: edge.animated,
        data: edge.data ? { ...edge.data } : undefined,
      }));

      const currentActiveFile = fileTabs.find((t) => t.id === activeTabId) || fileTabs[0];

      const docName =
        docNameRef.current ||
        (currentActiveFile?.title && currentActiveFile.title !== 'workflow.agent' && currentActiveFile.title !== 'Untitled'
          ? currentActiveFile.title
          : currentActiveFile?.filename
          ? currentActiveFile.filename.replace(/\.agent$/, '')
          : 'agent_workflow');

      const updatedDoc: AgentWorkflowDocument = {
        version: docVersionValueRef.current,
        name: docName,
        description: docDescriptionRef.current || 'Agent Workflow Document',
        framework: config.framework === 'google_adk' ? 'google-adk' : (config.framework as any) || 'google-adk',
        language: config.language || 'python',
        nodes: documentNodes,
        edges: documentEdges,
        metadata: {
          ...docMetadataRef.current,
          updatedAt: new Date().toISOString(),
        },
        deployment: {
          target: config.deploymentTarget || 'agent_engine',
          deploymentTarget: config.deploymentTarget || 'agent_engine',
          outputFolder: config.outputFolder,
          framework: config.framework === 'google_adk' ? 'google-adk' : config.framework,
          language: config.language,
          includeTests: config.includeTests,
          includeDocker: config.includeDocker,
          useStreaming: config.useStreaming,
        },
      };

      const jsonString = JSON.stringify(updatedDoc);
      const currentHash = fnv1a(jsonString);
      if (currentHash === lastSentHashRef.current) {
        return;
      }
      lastSentJsonRef.current = jsonString;
      lastSentHashRef.current = currentHash;

      docVersionRef.current += 1;
      bridge.postMessage({
        type: 'DOCUMENT_UPDATED',
        payload: {
          document: updatedDoc,
          docVersion: docVersionRef.current,
        },
      });
    }, 250);

    return () => {
      clearTimeout(debounceTimer);
    };
  }, [nodes, edges, config, bridge, fileTabs, activeTabId]);
}
