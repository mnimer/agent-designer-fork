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
 */

import { useRef, useEffect } from 'react';
import { Node, Edge } from '@xyflow/react';
import { WebviewBridge } from './useWebviewBridge';
import { normalizeLoadedNodes, normalizeLoadedEdges, computeTargetFolder } from '../utils/workflowSync';
import { AgentFileTab, GenerationConfig, GeneratedFile } from '../types';
import { WorkflowNode, WorkflowEdge, AgentWorkflowDocument } from '../../shared/types';

export interface UseExtensionSyncOptions {
  bridge: WebviewBridge;
  nodes: Node<any>[];
  edges: Edge[];
  config: GenerationConfig;
  fileTabs: AgentFileTab[];
  activeTabId: string;
  setNodes: (nodes: Node<any>[]) => void;
  setEdges: (edges: Edge[]) => void;
  setConfig: React.Dispatch<React.SetStateAction<GenerationConfig>>;
  setGeneratedFiles: React.Dispatch<React.SetStateAction<GeneratedFile[]>>;
  setHasGeneratedCode: (hasCode: boolean) => void;
  setIsGenerating: (generating: boolean) => void;
  recordSnapshot: (nodes: Node<any>[], edges: Edge[], options?: { description?: string }) => void;
}

/**
 * Custom hook to manage synchronization between the Webview and VS Code Extension Host.
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
    setConfig,
    setGeneratedFiles,
    setHasGeneratedCode,
    setIsGenerating,
    recordSnapshot,
  } = options;

  const docVersionRef = useRef(1);
  const isLoadedRef = useRef(false);
  const lastSentJsonRef = useRef<string>('');

  // NOTE: Listen for messages from the VS Code extension host
  useEffect(() => {
    const unsubLoadDoc = bridge.subscribe('LOAD_DOCUMENT', (payload) => {
      if (!payload?.document) return;

      const doc = payload.document;
      if (payload.docVersion) {
        docVersionRef.current = payload.docVersion;
      }

      if (Array.isArray(doc.nodes)) {
        const normNodes = normalizeLoadedNodes(doc.nodes);
        const normEdges = normalizeLoadedEdges(doc.edges || []);
        setNodes(normNodes);
        setEdges(normEdges);
        recordSnapshot(normNodes, normEdges, { description: 'Loaded document from disk' });

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
        });
        lastSentJsonRef.current = loadedJson;
      }

      const docMetadata = doc.metadata || {};
      const targetFolder =
        (docMetadata as any).outputFolder ||
        computeTargetFolder(payload.filePath || (doc.name ? doc.name + '.agent' : 'workflow.agent'));

      setConfig((prev) => ({
        ...prev,
        framework: doc.framework === 'google-adk' ? 'google_adk' : (doc.framework as any) || prev.framework,
        language: doc.language || prev.language,
        outputFolder: targetFolder,
        deploymentTarget: 'agent_engine',
      }));

      if (payload.generatedFiles && payload.generatedFiles.length > 0) {
        setGeneratedFiles(payload.generatedFiles);
        setHasGeneratedCode(true);
      }

      // Enable real-time document synchronization to VS Code text buffer after initial load completes
      setTimeout(() => {
        isLoadedRef.current = true;
      }, 100);
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
      unsubCodeGenerated();
      unsubFilesExist();
    };
  }, [bridge, setNodes, setEdges, setConfig, setGeneratedFiles, setHasGeneratedCode, setIsGenerating, recordSnapshot]);

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

    const updatedDoc: AgentWorkflowDocument = {
      version: '1.0.0',
      name: currentActiveFile?.filename ? currentActiveFile.filename.replace(/\.agent$/, '') : 'agent_workflow',
      description: 'Agent Workflow Document',
      framework: config.framework === 'google_adk' ? 'google-adk' : (config.framework as any) || 'google-adk',
      language: config.language || 'python',
      nodes: documentNodes,
      edges: documentEdges,
      metadata: {
        outputFolder: config.outputFolder,
        updatedAt: new Date().toISOString(),
      },
    };

    const jsonString = JSON.stringify(updatedDoc);
    if (jsonString === lastSentJsonRef.current) {
      return;
    }
    lastSentJsonRef.current = jsonString;

    docVersionRef.current += 1;
    bridge.postMessage({
      type: 'DOCUMENT_UPDATED',
      payload: {
        document: updatedDoc,
        docVersion: docVersionRef.current,
      },
    });
  }, [nodes, edges, config, bridge, fileTabs, activeTabId]);
}
