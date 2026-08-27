/**
 * Visual Agent Flow Builder — Webview Root Application
 *
 * Mounts the main IDE workbench, connects to Extension Host via BridgeContext,
 * manages workflow state with useWorkflowState, renders interactive WorkflowCanvas,
 * displays property inspector drawers for Standard Agents and Triggers,
 * and mounts CodePreviewModal for Gemini prompt-driven code synthesis.
 *
 * Architectural Decisions:
 * 1. Wraps canvas in BridgeProvider for uniform RPC messaging across components.
 * 2. Synchronizes document mutations to Extension Host via DOCUMENT_UPDATED on dirty state.
 * 3. Mounts contextual property inspector drawers (StandardAgentDrawer, TriggerDrawer) on node selection.
 * 4. Integrates CodePreviewModal for reviewing and exporting Gemini-synthesized repositories.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import React, { useEffect, useCallback, useState, useRef } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { BridgeProvider, useBridgeContext } from './context/BridgeContext';
import { useDiagramHistory } from './hooks/useDiagramHistory';
import { useWorkflowState } from './hooks/useWorkflowState';
import { WorkflowCanvas } from './components/Canvas/WorkflowCanvas';
import { StandardAgentDrawer } from './components/inspector/StandardAgentDrawer';
import { TriggerDrawer } from './components/inspector/TriggerDrawer';
import { CodePreviewModal } from './components/codegen/CodePreviewModal';
import { TestRunnerDrawer } from './components/testing/TestRunnerDrawer';
import { WorkflowNode, AgentNodeData, TriggerNodeData } from '../shared/types';
import { Sparkles, Code2, Play, Undo2, Redo2 } from 'lucide-react';

function AppContent(): React.JSX.Element {
  const bridge = useBridgeContext();
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [isCodePreviewOpen, setIsCodePreviewOpen] = useState<boolean>(false);
  const [isTestDrawerOpen, setIsTestDrawerOpen] = useState<boolean>(false);
  const pushSnapshotRef = useRef<(doc: any) => void>(() => {});

  const {
    document: workflowDoc,
    nodes,
    edges,
    selectedNodeId,
    setSelectedNodeId,
    loadWorkflow,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    setNodes,
    removeNode,
    updateNodeData,
    markClean,
  } = useWorkflowState({
    onDocumentChange: (updatedDoc, version) => {
      pushSnapshotRef.current(updatedDoc);
      bridge.postMessage({
        type: 'DOCUMENT_UPDATED',
        payload: {
          document: updatedDoc,
          docVersion: version,
        },
      });
    },
  });

  const { canUndo, canRedo, undo, redo, pushSnapshot } = useDiagramHistory(workflowDoc, {
    onRestore: (restoredDoc) => {
      loadWorkflow(restoredDoc);
    },
  });

  useEffect(() => {
    pushSnapshotRef.current = pushSnapshot;
  }, [pushSnapshot]);

  useEffect(() => {
    console.log('[Agent Flow Webview] AppContent mounted. Subscribing to Extension Host events...');

    // 1. Subscribe to Extension Host events
    const unsubLoad = bridge.subscribe('LOAD_DOCUMENT', (payload) => {
      console.log('[Agent Flow Webview] Received LOAD_DOCUMENT:', payload);
      if (payload?.document) {
        loadWorkflow(payload.document, payload.docVersion);
      }
    });

    const unsubTheme = bridge.subscribe('THEME_CHANGED', (payload) => {
      console.log('[Agent Flow Webview] Received THEME_CHANGED:', payload);
      if (payload?.theme) {
        setTheme(payload.theme);
        if (typeof window !== 'undefined' && window.document?.body) {
          window.document.body.className = payload.theme === 'light' ? 'vscode-light' : 'vscode-dark';
        }
      }
    });

    const unsubSaved = bridge.subscribe('DOCUMENT_SAVED', () => {
      console.log('[Agent Flow Webview] Received DOCUMENT_SAVED');
      markClean();
    });

    // 2. Notify Extension Host that Webview is ready
    console.log('[Agent Flow Webview] Posting READY message to Extension Host');
    bridge.postMessage({ type: 'READY' });

    return () => {
      unsubLoad();
      unsubTheme();
      unsubSaved();
    };
  }, [bridge, loadWorkflow, markClean]);

  /**
   * Quick action to add a new standard Agent node
   */
  const handleAddAgent = useCallback(() => {
    const nextIndex = nodes.filter((n) => n.type === 'agent').length + 1;
    const newNode: WorkflowNode = {
      id: `agent-${Date.now()}`,
      type: 'agent',
      position: { x: 400 + nextIndex * 40, y: 160 + nextIndex * 40 },
      data: {
        label: `Agent ${nextIndex}`,
        description: 'Autonomous reasoning assistant',
        model: 'gemini-2.5-flash',
        systemPrompt: 'You are an autonomous agent assistant.',
        temperature: 0.7,
        tools: [],
        memoryType: 'none',
        standardConfig: {
          model: 'gemini-2.5-flash',
          systemInstruction: 'You are an autonomous agent assistant.',
          temperature: 0.7,
          tools: [],
          memory: 'none',
        },
      },
    };
    addNode(newNode);
  }, [nodes, addNode]);

  /**
   * Quick action to add a new Trigger node
   */
  const handleAddTrigger = useCallback(() => {
    const nextIndex = nodes.filter((n) => n.type === 'trigger').length + 1;
    const newNode: WorkflowNode = {
      id: `trigger-${Date.now()}`,
      type: 'trigger',
      position: { x: 80, y: 160 + nextIndex * 80 },
      data: {
        label: `Trigger ${nextIndex}`,
        description: 'Inbound execution trigger',
        triggerKind: 'test',
        config: {
          testScenarios: [
            {
              id: `test-${Date.now()}`,
              name: 'Sample Scenario',
              inputQuery: 'Hello Agent',
            },
          ],
        },
      },
    };
    addNode(newNode);
  }, [nodes, addNode]);

  /**
   * Layout update callback from Dagre auto-layout
   */
  const handleLayoutChange = useCallback(
    (layoutedNodes: WorkflowNode[]) => {
      setNodes(layoutedNodes);
    },
    [setNodes]
  );

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  return (
    <div className={`h-full w-full flex flex-col font-sans ${theme === 'light' ? 'theme-light' : 'theme-dark'}`}>
      {/* Top Header Bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#30363d] bg-[#161b22] text-[#cccccc] z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span className="font-bold text-xs text-white">Agent Flow</span>
          </div>
          <span className="text-xs px-2 py-0.5 rounded bg-[#21262d] text-gray-300 font-mono border border-[#30363d]">
            {workflowDoc.name || 'workflow'}.agent
          </span>
          <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
            {workflowDoc.framework}
          </span>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Undo / Redo Controls */}
          <div className="flex items-center bg-[#0d1117] rounded border border-[#30363d] p-0.5 mr-1">
            <button
              type="button"
              disabled={!canUndo}
              onClick={() => undo()}
              className="p-1 text-gray-400 hover:text-white disabled:text-gray-600 disabled:opacity-40 rounded hover:bg-[#21262d] transition-colors cursor-pointer disabled:cursor-not-allowed"
              title="Undo (Cmd+Z / Ctrl+Z)"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={!canRedo}
              onClick={() => redo()}
              className="p-1 text-gray-400 hover:text-white disabled:text-gray-600 disabled:opacity-40 rounded hover:bg-[#21262d] transition-colors cursor-pointer disabled:cursor-not-allowed"
              title="Redo (Cmd+Shift+Z / Ctrl+Y)"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsCodePreviewOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1 rounded bg-[#21262d] hover:bg-[#30363d] text-xs text-white font-medium border border-[#30363d] transition-colors cursor-pointer"
          >
            <Code2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Generate Code</span>
          </button>

          <button
            type="button"
            onClick={() => setIsTestDrawerOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-xs text-white font-medium shadow transition-colors cursor-pointer"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Run Tests</span>
          </button>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="flex-1 relative overflow-hidden">
        <WorkflowCanvas
          nodes={nodes}
          edges={edges}
          selectedNodeId={selectedNodeId}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onSelectNode={setSelectedNodeId}
          onAddAgent={handleAddAgent}
          onAddTrigger={handleAddTrigger}
          onEditNode={(id) => setSelectedNodeId(id)}
          onDeleteNode={(id) => removeNode(id)}
          onLayoutChange={handleLayoutChange}
        />

        {/* Inspector Drawers */}
        {selectedNode && selectedNode.type === 'agent' && (
          <StandardAgentDrawer
            nodeId={selectedNode.id}
            agentData={selectedNode.data as AgentNodeData}
            isOpen={Boolean(selectedNodeId)}
            onClose={() => setSelectedNodeId(null)}
            onUpdateAgent={(id, data) => updateNodeData(id, data)}
            onDeleteAgent={(id) => removeNode(id)}
          />
        )}

        {selectedNode && selectedNode.type === 'trigger' && (
          <TriggerDrawer
            nodeId={selectedNode.id}
            triggerData={selectedNode.data as TriggerNodeData}
            isOpen={Boolean(selectedNodeId)}
            onClose={() => setSelectedNodeId(null)}
            onUpdateTrigger={(id, data) => updateNodeData(id, data)}
            onDeleteTrigger={(id) => removeNode(id)}
          />
        )}

        {/* Test Runner & Execution Panel Drawer */}
        <TestRunnerDrawer
          isOpen={isTestDrawerOpen}
          onClose={() => setIsTestDrawerOpen(false)}
          document={workflowDoc}
        />

        {/* Code Preview & Export Modal */}
        <CodePreviewModal
          isOpen={isCodePreviewOpen}
          onClose={() => setIsCodePreviewOpen(false)}
          document={workflowDoc}
        />
      </div>
    </div>
  );
}

export default function App(): React.JSX.Element {
  return (
    <BridgeProvider>
      <ReactFlowProvider>
        <AppContent />
      </ReactFlowProvider>
    </BridgeProvider>
  );
}
