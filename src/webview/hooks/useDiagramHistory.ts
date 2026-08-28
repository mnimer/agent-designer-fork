import { useState, useCallback, useRef, useEffect } from 'react';
import { Node, Edge } from '@xyflow/react';

export interface HistorySnapshot {
  nodes: Node<any>[];
  edges: Edge[];
  selectedAgentId?: string | null;
  selectedTriggerId?: string | null;
  description?: string;
}

interface UseDiagramHistoryOptions {
  maxHistory?: number;
  activeTabId?: string;
}

// Deep clone nodes and edges to avoid reference pollution across snapshots
function cloneSnapshot(snapshot: HistorySnapshot): HistorySnapshot {
  return {
    nodes: JSON.parse(JSON.stringify(snapshot.nodes)),
    edges: JSON.parse(JSON.stringify(snapshot.edges)),
    selectedAgentId: snapshot.selectedAgentId || null,
    selectedTriggerId: snapshot.selectedTriggerId || null,
    description: snapshot.description,
  };
}

export function useDiagramHistory(
  initialNodes: Node<any>[],
  initialEdges: Edge[],
  options: UseDiagramHistoryOptions = {}
) {
  const maxHistory = options.maxHistory || 40;
  const activeTabId = options.activeTabId || 'default';

  // Per-tab history map to keep separate undo/redo stacks per open .agent tab
  const tabHistoriesRef = useRef<
    Record<
      string,
      {
        past: HistorySnapshot[];
        future: HistorySnapshot[];
        current: HistorySnapshot;
      }
    >
  >({});

  // Initialize active tab history if missing
  if (!tabHistoriesRef.current[activeTabId]) {
    tabHistoriesRef.current[activeTabId] = {
      past: [],
      future: [],
      current: cloneSnapshot({
        nodes: initialNodes,
        edges: initialEdges,
        description: 'Initial state',
      }),
    };
  }

  // Force re-render helper to update canUndo / canRedo state in UI
  const [, setVersion] = useState(0);
  const bumpVersion = useCallback(() => setVersion((v) => v + 1), []);

  // Sync current snapshot if tab changes
  useEffect(() => {
    if (!tabHistoriesRef.current[activeTabId]) {
      tabHistoriesRef.current[activeTabId] = {
        past: [],
        future: [],
        current: cloneSnapshot({
          nodes: initialNodes,
          edges: initialEdges,
          description: 'Tab initialized',
        }),
      };
      bumpVersion();
    }
  }, [activeTabId, initialNodes, initialEdges, bumpVersion]);

  const getActiveHistory = useCallback(() => {
    if (!tabHistoriesRef.current[activeTabId]) {
      tabHistoriesRef.current[activeTabId] = {
        past: [],
        future: [],
        current: cloneSnapshot({
          nodes: initialNodes,
          edges: initialEdges,
          description: 'Tab initialized',
        }),
      };
    }
    return tabHistoriesRef.current[activeTabId];
  }, [activeTabId, initialNodes, initialEdges]);

  // Check if current graph differs significantly from last recorded snapshot
  const isDifferentFromCurrent = useCallback(
    (newNodes: Node<any>[], newEdges: Edge[]) => {
      const hist = getActiveHistory();
      if (!hist.current) return true;
      if (hist.current.nodes.length !== newNodes.length || hist.current.edges.length !== newEdges.length) {
        return true;
      }
      try {
        const curNodesJson = JSON.stringify(hist.current.nodes);
        const nextNodesJson = JSON.stringify(newNodes);
        if (curNodesJson !== nextNodesJson) return true;

        const curEdgesJson = JSON.stringify(hist.current.edges);
        const nextEdgesJson = JSON.stringify(newEdges);
        return curEdgesJson !== nextEdgesJson;
      } catch {
        return true;
      }
    },
    [getActiveHistory]
  );

  /**
   * Records a new state into the past stack.
   */
  const recordSnapshot = useCallback(
    (
      newNodes: Node<any>[],
      newEdges: Edge[],
      meta?: {
        selectedAgentId?: string | null;
        selectedTriggerId?: string | null;
        description?: string;
        force?: boolean;
      }
    ) => {
      const hist = getActiveHistory();
      if (!meta?.force && !isDifferentFromCurrent(newNodes, newEdges)) {
        return;
      }

      const nextSnapshot: HistorySnapshot = cloneSnapshot({
        nodes: newNodes,
        edges: newEdges,
        selectedAgentId: meta?.selectedAgentId,
        selectedTriggerId: meta?.selectedTriggerId,
        description: meta?.description || 'Graph updated',
      });

      // Push current into past
      if (hist.current) {
        hist.past = [...hist.past.slice(-(maxHistory - 1)), hist.current];
      }

      hist.current = nextSnapshot;
      // Clear redo branch whenever a new distinct action is taken
      hist.future = [];

      bumpVersion();
    },
    [getActiveHistory, isDifferentFromCurrent, maxHistory, bumpVersion]
  );

  /**
   * Reset / initialize history for a specific tab
   */
  const initializeTabHistory = useCallback(
    (tabId: string, nodes: Node<any>[], edges: Edge[]) => {
      tabHistoriesRef.current[tabId] = {
        past: [],
        future: [],
        current: cloneSnapshot({
          nodes,
          edges,
          description: 'Tab initialized',
        }),
      };
      bumpVersion();
    },
    [bumpVersion]
  );

  /**
   * Perform Undo
   */
  const undo = useCallback((): HistorySnapshot | null => {
    const hist = getActiveHistory();
    if (hist.past.length === 0) {
      return null;
    }

    const previous = hist.past[hist.past.length - 1];
    const newPast = hist.past.slice(0, -1);

    if (hist.current) {
      hist.future = [hist.current, ...hist.future];
    }

    hist.past = newPast;
    hist.current = previous;

    bumpVersion();
    return cloneSnapshot(previous);
  }, [getActiveHistory, bumpVersion]);

  /**
   * Perform Redo
   */
  const redo = useCallback((): HistorySnapshot | null => {
    const hist = getActiveHistory();
    if (hist.future.length === 0) {
      return null;
    }

    const next = hist.future[0];
    const newFuture = hist.future.slice(1);

    if (hist.current) {
      hist.past = [...hist.past.slice(-(maxHistory - 1)), hist.current];
    }

    hist.future = newFuture;
    hist.current = next;

    bumpVersion();
    return cloneSnapshot(next);
  }, [getActiveHistory, maxHistory, bumpVersion]);

  const activeHist = getActiveHistory();
  const canUndo = activeHist.past.length > 0;
  const canRedo = activeHist.future.length > 0;
  const pastCount = activeHist.past.length;
  const futureCount = activeHist.future.length;

  return {
    canUndo,
    canRedo,
    pastCount,
    futureCount,
    recordSnapshot,
    undo,
    redo,
    initializeTabHistory,
  };
}
