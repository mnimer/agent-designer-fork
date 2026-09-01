/**
 * useWorkflowState Hook
 *
 * State management hook for React Flow canvas nodes, edges, and document updates.
 * Provides granular mutation handlers for adding, updating, removing, and connecting
 * workflow elements while tracking dirty state and synchronization versions.
 *
 * Architectural Decisions:
 * 1. Adheres to React Flow immutable state transformation conventions.
 * 2. Provides optimistic local state updates with dirty flag tracking for VS Code persistence.
 * 3. Enforces single entry point / trigger connection constraints.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { useState, useCallback, useRef } from 'react';
import { applyNodeChanges, applyEdgeChanges } from '@xyflow/react';
import {
  AgentWorkflowDocument,
  WorkflowNode,
  WorkflowEdge,
} from '../../shared/types';

export interface UseWorkflowStateOptions {
  initialDocument?: AgentWorkflowDocument;
  onDocumentChange?: (doc: AgentWorkflowDocument, version: number) => void;
}

export interface UseWorkflowStateReturn {
  document: AgentWorkflowDocument;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  selectedNodeId: string | null;
  isDirty: boolean;
  docVersion: number;
  setSelectedNodeId: (id: string | null) => void;
  loadWorkflow: (doc: AgentWorkflowDocument, version?: number) => void;
  onNodesChange: (changes: any[]) => void;
  onEdgesChange: (changes: any[]) => void;
  onConnect: (connection: { source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }) => void;
  addNode: (node: WorkflowNode) => void;
  setNodes: (nodes: WorkflowNode[]) => void;
  removeNode: (id: string) => void;
  updateNodeData: (id: string, partialData: Record<string, any>) => void;
  updateWorkflowMetadata: (metadata: Partial<AgentWorkflowDocument>) => void;
  markClean: () => void;
}

const DEFAULT_EMPTY_DOCUMENT: AgentWorkflowDocument = {
  version: '1.0.0',
  name: 'untitled_workflow',
  description: 'New Agent Workflow',
  framework: 'google-adk',
  language: 'python',
  nodes: [],
  edges: [],
  metadata: {
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
};

function getInitialWorkflowDocument(): AgentWorkflowDocument {
  if (typeof window !== 'undefined' && (window as any).__INITIAL_AGENT_DOCUMENT__) {
    return (window as any).__INITIAL_AGENT_DOCUMENT__;
  }
  return DEFAULT_EMPTY_DOCUMENT;
}

export function useWorkflowState(options?: UseWorkflowStateOptions): UseWorkflowStateReturn {
  const [document, setDocumentState] = useState<AgentWorkflowDocument>(
    options?.initialDocument || getInitialWorkflowDocument()
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [docVersion, setDocVersion] = useState<number>(1);

  const docRef = useRef(document);
  docRef.current = document;

  const versionRef = useRef(docVersion);
  versionRef.current = docVersion;

  /**
   * Helper to commit document changes and notify listeners.
   */
  const commitChange = useCallback(
    (newDoc: AgentWorkflowDocument) => {
      const nextVersion = versionRef.current + 1;
      setDocVersion(nextVersion);
      setDocumentState(newDoc);
      setIsDirty(true);
      options?.onDocumentChange?.(newDoc, nextVersion);
    },
    [options]
  );

  /**
   * Loads a complete workflow document from VS Code Extension Host.
   */
  const loadWorkflow = useCallback((doc: AgentWorkflowDocument, version?: number) => {
    setDocumentState(doc);
    if (version !== undefined) {
      setDocVersion(version);
    }
    setIsDirty(false);
  }, []);

  /**
   * Handles React Flow node changes (drag, selection, dimension updates).
   */
  const onNodesChange = useCallback(
    (changes: any[]) => {
      const prev = docRef.current;
      const nextNodes = applyNodeChanges(changes, prev.nodes as any) as unknown as WorkflowNode[];
      const hasSignificantChange = changes.some(
        (c) => c.type === 'position' || c.type === 'remove'
      );
      if (hasSignificantChange) {
        commitChange({
          ...prev,
          nodes: nextNodes,
          metadata: {
            ...prev.metadata,
            updatedAt: new Date().toISOString(),
          },
        });
      } else {
        setDocumentState((prevDoc) => ({ ...prevDoc, nodes: nextNodes }));
      }
    },
    [commitChange]
  );

  /**
   * Handles React Flow edge changes.
   */
  const onEdgesChange = useCallback(
    (changes: any[]) => {
      const prev = docRef.current;
      const nextEdges = applyEdgeChanges(changes, prev.edges as any) as WorkflowEdge[];
      const hasSignificantChange = changes.some((c) => c.type === 'remove');
      if (hasSignificantChange) {
        commitChange({
          ...prev,
          edges: nextEdges,
          metadata: {
            ...prev.metadata,
            updatedAt: new Date().toISOString(),
          },
        });
      } else {
        setDocumentState((prevDoc) => ({ ...prevDoc, edges: nextEdges }));
      }
    },
    [commitChange]
  );

  /**
   * Handles edge connection between nodes.
   */
  const onConnect = useCallback(
    (connection: { source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }) => {
      if (!connection.source || !connection.target) return;
      if (connection.source === connection.target) return; // Prevent self-connections

      const prev = docRef.current;
      // Prevent duplicate identical edges
      const edgeExists = prev.edges.some(
        (e) =>
          e.source === connection.source &&
          e.target === connection.target &&
          (e.sourceHandle || undefined) === (connection.sourceHandle || undefined)
      );
      if (edgeExists) return;

      const newEdge: WorkflowEdge = {
        id: `edge-${connection.source}-${connection.target}-${Date.now()}`,
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle || undefined,
        targetHandle: connection.targetHandle || undefined,
        animated: connection.sourceHandle === 'subagent',
      };

      const nextDoc: AgentWorkflowDocument = {
        ...prev,
        edges: [...prev.edges, newEdge],
        metadata: {
          ...prev.metadata,
          updatedAt: new Date().toISOString(),
        },
      };

      commitChange(nextDoc);
    },
    [commitChange]
  );

  /**
   * Adds a new node to the canvas.
   */
  const addNode = useCallback(
    (node: WorkflowNode) => {
      const prev = docRef.current;
      const nextDoc: AgentWorkflowDocument = {
        ...prev,
        nodes: [...prev.nodes, node],
        metadata: {
          ...prev.metadata,
          updatedAt: new Date().toISOString(),
        },
      };
      commitChange(nextDoc);
      setSelectedNodeId(node.id);
    },
    [commitChange]
  );

  /**
   * Removes a node and its attached edges from the canvas.
   */
  const removeNode = useCallback(
    (id: string) => {
      const prev = docRef.current;
      const nextNodes = prev.nodes.filter((n) => n.id !== id);
      const nextEdges = prev.edges.filter((e) => e.source !== id && e.target !== id);

      const nextDoc: AgentWorkflowDocument = {
        ...prev,
        nodes: nextNodes,
        edges: nextEdges,
        metadata: {
          ...prev.metadata,
          updatedAt: new Date().toISOString(),
        },
      };

      if (selectedNodeId === id) {
        setSelectedNodeId(null);
      }

      commitChange(nextDoc);
    },
    [commitChange, selectedNodeId]
  );

  /**
   * Updates custom data fields of a specific node.
   */
  const updateNodeData = useCallback(
    (id: string, partialData: Record<string, any>) => {
      const prev = docRef.current;
      const nextNodes = prev.nodes.map((node) => {
        if (node.id !== id) return node;
        return {
          ...node,
          data: {
            ...node.data,
            ...partialData,
          },
        } as WorkflowNode;
      });

      const nextDoc: AgentWorkflowDocument = {
        ...prev,
        nodes: nextNodes,
        metadata: {
          ...prev.metadata,
          updatedAt: new Date().toISOString(),
        },
      };

      commitChange(nextDoc);
    },
    [commitChange]
  );

  /**
   * Updates workflow document top-level metadata (name, description, framework, language).
   */
  const updateWorkflowMetadata = useCallback(
    (metadata: Partial<AgentWorkflowDocument>) => {
      const prev = docRef.current;
      const nextDoc: AgentWorkflowDocument = {
        ...prev,
        ...metadata,
        metadata: {
          ...prev.metadata,
          updatedAt: new Date().toISOString(),
        },
      };
      commitChange(nextDoc);
    },
    [commitChange]
  );

  /**
   * Sets entire array of nodes (e.g. after Dagre auto-layout).
   */
  const setNodes = useCallback(
    (nodes: WorkflowNode[]) => {
      const prev = docRef.current;
      const nextDoc: AgentWorkflowDocument = {
        ...prev,
        nodes,
        metadata: {
          ...prev.metadata,
          updatedAt: new Date().toISOString(),
        },
      };
      commitChange(nextDoc);
    },
    [commitChange]
  );

  /**
   * Marks document as clean after successful save acknowledge.
   */
  const markClean = useCallback(() => {
    setIsDirty(false);
  }, []);

  return {
    document,
    nodes: document.nodes,
    edges: document.edges,
    selectedNodeId,
    isDirty,
    docVersion,
    setSelectedNodeId,
    loadWorkflow,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    setNodes,
    removeNode,
    updateNodeData,
    updateWorkflowMetadata,
    markClean,
  };
}
