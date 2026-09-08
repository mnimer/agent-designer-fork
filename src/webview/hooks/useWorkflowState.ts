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
  reorderSubAgents: (agentId: string, startIndexOrNewOrder: number | any[], endIndex?: number) => void;
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

/**
 * Synchronizes subAgents arrays for all agent nodes based on outgoing graph edges and latest node names/roles.
 * Preserves custom ordering, updates names & roles on rename, appends new connections, and prunes severed connections.
 */
export function syncWorkflowSubAgents(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[] {
  const nodeMap = new Map<string, WorkflowNode>();
  nodes.forEach((n) => nodeMap.set(n.id, n));

  return nodes.map((node) => {
    if (node.type !== 'agentNode' && node.type !== 'agent') return node;

    const currentSubAgents: any[] = (node.data as any)?.subAgents || [];

    // Find all outgoing edges where target is an existing agent node
    const outgoingAgentEdges = edges.filter(
      (e) => e.source === node.id && nodeMap.has(e.target) && (nodeMap.get(e.target)!.type === 'agentNode' || nodeMap.get(e.target)!.type === 'agent')
    );
    const connectedTargetIds = Array.from(new Set(outgoingAgentEdges.map((e) => e.target)));

    const agentData = (node.data || {}) as any;
    const parentPattern = agentData.subAgentPattern || 'parallel';

    // 1. Keep existing subAgents that are still connected, updating name, role, and delegationType
    const updatedExisting: any[] = [];
    currentSubAgents.forEach((sub) => {
      const subId = typeof sub === 'string' ? sub : sub?.agentId;
      if (subId && connectedTargetIds.includes(subId)) {
        const targetNode = nodeMap.get(subId)!;
        const targetData = (targetNode.data || {}) as any;
        if (typeof sub === 'string') {
          updatedExisting.push(sub);
        } else {
          updatedExisting.push({
            ...sub,
            name: targetData.label || sub.name || 'Agent',
            role: targetData.role !== undefined ? targetData.role : (sub.role || ''),
            // Inherit parent agent's subAgentPattern as delegationType so child never contradicts parent
            delegationType: agentData.subAgentPattern || sub.delegationType || 'parallel',
          });
        }
      }
    });

    // 2. Append newly connected targets with parent's delegation pattern
    const existingIds = new Set(updatedExisting.map((s) => (typeof s === 'string' ? s : s?.agentId)));
    const newSubAgents: any[] = [];
    connectedTargetIds.forEach((targetId) => {
      if (!existingIds.has(targetId)) {
        const targetNode = nodeMap.get(targetId)!;
        const targetData = (targetNode.data || {}) as any;
        newSubAgents.push({
          agentId: targetId,
          name: targetData.label || 'Agent',
          role: targetData.role || '',
          delegationType: parentPattern,
        });
      }
    });

    const finalSubAgents = [...updatedExisting, ...newSubAgents];

    // Check if subAgents actually changed (including delegationType)
    const isSameLength = currentSubAgents.length === finalSubAgents.length;
    const isSameContent =
      isSameLength &&
      currentSubAgents.every((sub, idx) => {
        const aId = typeof sub === 'string' ? sub : sub?.agentId;
        const bId = typeof finalSubAgents[idx] === 'string' ? finalSubAgents[idx] : finalSubAgents[idx]?.agentId;
        const aName = typeof sub === 'string' ? '' : sub?.name;
        const bName = typeof finalSubAgents[idx] === 'string' ? '' : finalSubAgents[idx]?.name;
        const aRole = typeof sub === 'string' ? '' : sub?.role;
        const bRole = typeof finalSubAgents[idx] === 'string' ? '' : finalSubAgents[idx]?.role;
        const aDel = typeof sub === 'string' ? '' : sub?.delegationType;
        const bDel = typeof finalSubAgents[idx] === 'string' ? '' : finalSubAgents[idx]?.delegationType;
        return aId === bId && aName === bName && aRole === bRole && aDel === bDel;
      });

    if (isSameContent) {
      return node;
    }

    return {
      ...node,
      data: {
        ...node.data,
        subAgents: finalSubAgents,
      },
    } as WorkflowNode;
  });
}

export function useWorkflowState(options: UseWorkflowStateOptions = {}): UseWorkflowStateReturn {
  const { initialDocument = DEFAULT_EMPTY_DOCUMENT, onDocumentChange } = options;

  const [document, setDocumentState] = useState<AgentWorkflowDocument>(initialDocument);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [docVersion, setDocVersion] = useState<number>(1);

  // Keep a ref to latest doc state to avoid race conditions in asynchronous callbacks
  const docRef = useRef<AgentWorkflowDocument>(document);
  docRef.current = document;

  /**
   * Internal helper to commit a document update, bump version, and notify listener.
   */
  const commitChange = useCallback(
    (newDoc: AgentWorkflowDocument) => {
      const nextVersion = docVersion + 1;
      setDocVersion(nextVersion);
      setIsDirty(true);
      setDocumentState(newDoc);
      onDocumentChange?.(newDoc, nextVersion);
    },
    [docVersion, onDocumentChange]
  );

  /**
   * Loads or replaces the active workflow document with an incoming document from extension host.
   */
  const loadWorkflow = useCallback(
    (incomingDoc: AgentWorkflowDocument, version?: number) => {
      setDocumentState(incomingDoc);
      docRef.current = incomingDoc;
      setIsDirty(false);
      if (typeof version === 'number') {
        setDocVersion(version);
      }
      setSelectedNodeId(null);
    },
    []
  );

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
        const syncedNodes = syncWorkflowSubAgents(prev.nodes, nextEdges);
        commitChange({
          ...prev,
          nodes: syncedNodes,
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

      const nextEdges = [...prev.edges, newEdge];
      const syncedNodes = syncWorkflowSubAgents(prev.nodes, nextEdges);

      const nextDoc: AgentWorkflowDocument = {
        ...prev,
        nodes: syncedNodes,
        edges: nextEdges,
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
      const remainingNodes = prev.nodes.filter((n) => n.id !== id);
      const nextEdges = prev.edges.filter((e) => e.source !== id && e.target !== id);
      const syncedNodes = syncWorkflowSubAgents(remainingNodes, nextEdges);

      const nextDoc: AgentWorkflowDocument = {
        ...prev,
        nodes: syncedNodes,
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
      const rawUpdatedNodes = prev.nodes.map((node) => {
        if (node.id !== id) return node;
        return {
          ...node,
          data: {
            ...node.data,
            ...partialData,
          },
        } as WorkflowNode;
      });

      const nextNodes = syncWorkflowSubAgents(rawUpdatedNodes, prev.edges);

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
   * Reorders sub-agents in a parent agent node.
   * Supports both index swapping (startIndex, endIndex) and full array assignment.
   */
  const reorderSubAgents = useCallback(
    (agentId: string, startIndexOrNewOrder: number | any[], endIndex?: number) => {
      const prev = docRef.current;
      const targetNode = prev.nodes.find((n) => n.id === agentId);
      if (!targetNode) return;

      const currentSubAgents: any[] = (targetNode.data as any)?.subAgents || [];
      let newOrder: any[];

      if (typeof startIndexOrNewOrder === 'number' && typeof endIndex === 'number') {
        if (
          startIndexOrNewOrder < 0 ||
          startIndexOrNewOrder >= currentSubAgents.length ||
          endIndex < 0 ||
          endIndex >= currentSubAgents.length
        ) {
          return;
        }
        newOrder = [...currentSubAgents];
        const [moved] = newOrder.splice(startIndexOrNewOrder, 1);
        newOrder.splice(endIndex, 0, moved);
      } else if (Array.isArray(startIndexOrNewOrder)) {
        newOrder = startIndexOrNewOrder;
      } else {
        return;
      }

      const nextNodes = prev.nodes.map((n) => {
        if (n.id === agentId) {
          return {
            ...n,
            data: {
              ...n.data,
              subAgents: newOrder,
            },
          } as WorkflowNode;
        }
        return n;
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
    reorderSubAgents,
    updateWorkflowMetadata,
    markClean,
  };
}
