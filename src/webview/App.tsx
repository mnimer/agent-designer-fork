/**
 * App.tsx - Visual Agent Designer Root Canvas & Webview Entrypoint
 *
 * Purpose:
 * Top-level application shell for the Visual Agent Designer webview in VS Code.
 * Orchestrates the React Flow graph canvas, node/edge state transitions, tool configurations,
 * multi-tab document management, bottom split panel resizing, and bidirectional synchronization
 * with the VS Code extension host.
 *
 * Architectural Decisions:
 * - Author: Mike Nimer <mikenimer@google.com>
 * - Modular Decomposition: Business logic is decoupled into focused custom hooks (`useFileTabs`,
 *   `useToolsManager`, `useResizablePanel`, `useCanvasKeyboardShortcuts`, `useExtensionSync`)
 *   and modular canvas widgets (`CanvasToolbar`, `CanvasEmptyState`, `ValidationToast`, `PanelDivider`).
 * - Backwards-Compatibility Exports: Re-exports `syncAgentSubAgents` and `computeTargetFolder`
 *   to ensure existing integration and unit test suites continue passing without breakage.
 * - Scoped Tool Configuration: Tools attached to agents maintain independent deep-copied instances
 *   in `node.data.tools`. Modifying a tool from an AgentDrawer updates only that specific agent's JSON.
 *   Modifying a tool from the global palette/Tools menu updates the global designer template without
 *   mutating existing agent-scoped tool instances.
 * - Reactive "Props In, Events Up": State is centralized at the `FlowCanvas` container level and
 *   passed down to child panels and inspectors via typed callbacks.
 * - 8pt Grid System Compliance: Layout spacing, paddings, and control dimensions strictly follow
 *   multiples of 8px (Tailwind units: 1 = 4px, 2 = 8px, 4 = 16px, etc.).
 *
 * Instructions for Next Model Session:
 * - When adding new node types or edge connections, extend `nodeTypes` at the top
 *   of this file and ensure custom node components are registered in `../components/Canvas/nodes/`.
 * - To modify document synchronization or serialization formats, update `workflowSync.ts` and
 *   `useExtensionSync.ts` rather than embedding custom IPC logic directly in `App.tsx`.
 */

import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  useReactFlow,
} from '@xyflow/react';

// Context Providers
import { ThemeProvider } from './context/ThemeContext';
import { BridgeProvider, useBridgeContext } from './context/BridgeContext';
import { SettingsProvider, usePluginSettings } from './context/SettingsContext';

// Types & Data Contracts
import {
  AgentData,
  TriggerData,
  GenerationConfig,
  GeneratedFile,
  AgentKind,
  TriggerType,
  SubAgentRef,
  ToolDefinition,
  PatternType,
} from './types';
import { AgentWorkflowDocument } from '../shared/types';
import { INITIAL_NODES, INITIAL_EDGES } from './data/initialGraph';
import { DEFAULT_MOCK_TEST_PROMPTS } from './data/triggerDefinitions';

// Custom Canvas Nodes & Edges
import { AgentNode } from './components/Canvas/nodes/AgentNode';
import { TriggerNode } from './components/Canvas/nodes/TriggerNode';

// UI Panels & Drawers
import { PaletteCard } from './components/Canvas/PaletteCard';
import { AgentDrawer } from './components/inspector/AgentDrawer';
import { TriggerDrawer } from './components/inspector/TriggerDrawer';
import { ToolPropertyDrawer } from './components/inspector/ToolPropertyDrawer';
import { AddToolModal } from './components/inspector/AddToolModal';
import { MissingFeaturesModal } from './components/insights/MissingFeaturesModal';
import { CodeGenerationPanel } from './components/codegen/CodeGenerationPanel';
import { SettingsPage } from './components/settings/SettingsPage';

// Modular Canvas Widgets
import { CanvasToolbar } from './components/Canvas/CanvasToolbar';
import { CanvasEmptyState } from './components/Canvas/CanvasEmptyState';
import { ValidationToast } from './components/Canvas/ValidationToast';
import { PanelDivider } from './components/Canvas/PanelDivider';

// Custom Hooks
import { useDiagramHistory } from './hooks/useDiagramHistory';
import { useFileTabs } from './hooks/useFileTabs';
import { useToolsManager } from './hooks/useToolsManager';
import { useResizablePanel } from './hooks/useResizablePanel';
import { useCanvasKeyboardShortcuts } from './hooks/useCanvasKeyboardShortcuts';
import { useExtensionSync } from './hooks/useExtensionSync';

// Domain Utilities & Layout
import {
  syncAgentSubAgents,
  computeTargetFolder,
} from './utils/workflowSync';
import { getLayoutedElements, layoutPatternAtDropPosition } from './utils/layout';
import {
  createSingleAgentNode,
  createSingleTriggerNode,
  createPatternNodesAndEdges,
} from './data/patterns';

// Re-export utility functions for existing test suites
export { syncAgentSubAgents, computeTargetFolder } from './utils/workflowSync';

// React Flow Component Registrations
const nodeTypes = {
  agentNode: AgentNode,
  triggerNode: TriggerNode,
};

/**
 * FlowCanvas - Inner interactive graph workspace component.
 * Must be rendered inside a <ReactFlowProvider> context.
 */
function FlowCanvas() {
  const bridge = useBridgeContext();
  const { settings, activeEditorTab, setActiveEditorTab } = usePluginSettings();
  const { fitView, zoomOut, screenToFlowPosition } = useReactFlow();
  const reactFlowWrapper = useRef<HTMLDivElement | null>(null);

  // ---------------------------------------------------------------------------
  // 1. React Flow Graph State & History Management
  // ---------------------------------------------------------------------------
  const [nodes, setNodes, onNodesChange] = useNodesState(INITIAL_NODES);
  const [edges, setEdges, onEdgesChangeState] = useEdgesState(INITIAL_EDGES);

  const {
    canUndo,
    canRedo,
    handleUndo,
    handleRedo,
    recordSnapshot,
    initializeTabHistory,
  } = useDiagramHistory(nodes, edges, setNodes, setEdges);

  // Synchronize parent subAgents when edges are deleted
  const onEdgesChange = useCallback(
    (changes: any) => {
      onEdgesChangeState(changes);
      const isRemoval = changes.some((c: any) => c.type === 'remove');
      if (isRemoval) {
        setTimeout(() => {
          setEdges((currentEdges) => {
            setNodes((currentNodes) => syncAgentSubAgents(currentNodes, currentEdges));
            return currentEdges;
          });
        }, 10);
      }
    },
    [onEdgesChangeState, setEdges, setNodes]
  );

  // ---------------------------------------------------------------------------
  // 2. Inspector, Selection & Modal States
  // ---------------------------------------------------------------------------
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedTriggerId, setSelectedTriggerId] = useState<string | null>(null);
  const [isTriggerDrawerOpen, setIsTriggerDrawerOpen] = useState<boolean>(false);
  const [toolModalAgentId, setToolModalAgentId] = useState<string | null>(null);
  const [isAdvisorOpen, setIsAdvisorOpen] = useState<boolean>(false);
  const [validationWarning, setValidationWarning] = useState<string | null>(null);

  // Auto-dismiss validation warnings after 6 seconds
  useEffect(() => {
    if (validationWarning) {
      const timer = setTimeout(() => setValidationWarning(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [validationWarning]);

  // ---------------------------------------------------------------------------
  // 3. Code Generation & Configuration State
  // ---------------------------------------------------------------------------
  const [config, setConfig] = useState<GenerationConfig>({
    framework: (settings.defaultFramework as any) || 'google_adk',
    language: (settings.defaultLanguage as any) || 'python',
    outputFolder: './src/agents/',
    deploymentTarget: 'agent_engine',
    includeTests: true,
    includeDocker: false,
    useStreaming: settings.useStreamingByDefault ?? true,
  });

  const [generatedFiles, setGeneratedFiles] = useState<GeneratedFile[]>([]);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [hasGeneratedCode, setHasGeneratedCode] = useState<boolean>(false);

  // ---------------------------------------------------------------------------
  // 4. Custom Hooks (Tabs, Tools, Resizing, Shortcuts, Extension Sync)
  // ---------------------------------------------------------------------------
  const {
    fileTabs,
    activeTabId,
    handleOpenSampleInNewTab,
    handleCloseTab,
  } = useFileTabs(nodes, edges, config, {
    defaultFramework: settings.defaultFramework,
    defaultLanguage: settings.defaultLanguage,
    useStreamingByDefault: settings.useStreamingByDefault,
    fitView,
    initializeTabHistory,
    setNodes,
    setEdges,
    setConfig,
    setGeneratedFiles,
    setSelectedAgentId,
    setSelectedTriggerId,
    setIsTriggerDrawerOpen,
    setIsToolDrawerOpen: () => {},
    setToolModalAgentId,
    setActiveEditorTab,
  });

  const {
    tools,
    editingTool,
    editingToolScope,
    setEditingToolScope,
    isToolDrawerOpen,
    setIsToolDrawerOpen,
    handleOpenEditTool,
    handleOpenEditAgentTool,
    handleCreateCustomTool,
    handleCreateMcpTool,
    handleSaveTool,
    handleDeleteTool,
  } = useToolsManager({
    nodes,
    edges,
    setNodes,
    recordSnapshot,
    setSelectedAgentId,
    setSelectedTriggerId,
    setIsTriggerDrawerOpen,
  });

  const {
    bottomPanelHeight,
    setBottomPanelHeight,
    isPanelMaximized,
    isDraggingDivider,
    panelContainerRef,
    handleToggleMaximizePanel,
    handleDividerMouseDown,
  } = useResizablePanel();

  useExtensionSync({
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
  });

  // ---------------------------------------------------------------------------
  // 5. Node / Trigger Mutation Handlers
  // ---------------------------------------------------------------------------
  const handleEditAgent = useCallback((id: string) => {
    setSelectedAgentId(id);
    setSelectedTriggerId(null);
    setIsTriggerDrawerOpen(false);
    setIsToolDrawerOpen(false);
  }, [setIsToolDrawerOpen]);

  const handleDeleteAgent = useCallback(
    (id: string) => {
      const nextNodes = nodes.filter((n) => n.id !== id);
      const nextEdges = edges.filter((e) => e.source !== id && e.target !== id);
      const cleanedNodes = syncAgentSubAgents(nextNodes, nextEdges);

      setNodes(cleanedNodes);
      setEdges(nextEdges);
      recordSnapshot(cleanedNodes, nextEdges, { description: 'Delete agent' });

      if (selectedAgentId === id) {
        setSelectedAgentId(null);
      }
    },
    [nodes, edges, selectedAgentId, setNodes, setEdges, recordSnapshot]
  );

  const handleEditTrigger = useCallback((id: string) => {
    setSelectedTriggerId(id);
    setIsTriggerDrawerOpen(true);
    setSelectedAgentId(null);
    setIsToolDrawerOpen(false);
  }, [setIsToolDrawerOpen]);

  const handleDeleteTrigger = useCallback(
    (id: string) => {
      const nextNodes = nodes.filter((n) => n.id !== id);
      const nextEdges = edges.filter((e) => e.source !== id && e.target !== id);

      setNodes(nextNodes);
      setEdges(nextEdges);
      recordSnapshot(nextNodes, nextEdges, { description: 'Delete trigger' });

      if (selectedTriggerId === id) {
        setSelectedTriggerId(null);
        setIsTriggerDrawerOpen(false);
      }
    },
    [nodes, edges, selectedTriggerId, setNodes, setEdges, recordSnapshot]
  );

  const handleNodesDelete = useCallback(
    (nodesToDelete: Node[]) => {
      nodesToDelete.forEach((n) => {
        if (n.type === 'triggerNode') {
          handleDeleteTrigger(n.id);
        } else {
          handleDeleteAgent(n.id);
        }
      });
    },
    [handleDeleteTrigger, handleDeleteAgent]
  );

  useCanvasKeyboardShortcuts({
    onUndo: handleUndo,
    onRedo: handleRedo,
    selectedAgentId,
    selectedTriggerId,
    nodes,
    onDeleteAgent: handleDeleteAgent,
    onDeleteTrigger: handleDeleteTrigger,
  });

  const handleOpenAddTool = useCallback((agentId: string) => {
    setToolModalAgentId(agentId);
  }, []);

  const handleAddSpecificTool = useCallback(
    (agentId: string, tool: ToolDefinition) => {
      const toolInstance: ToolDefinition = JSON.parse(JSON.stringify(tool));
      const nextNodes = nodes.map((n) => {
        if (n.id === agentId && n.type === 'agentNode') {
          const currentTools: ToolDefinition[] = (n.data as AgentData).tools || [];
          if (currentTools.some((t) => t.id === toolInstance.id)) return n;
          return {
            ...n,
            data: {
              ...n.data,
              tools: [...currentTools, toolInstance],
            },
          };
        }
        return n;
      });
      setNodes(nextNodes);
      recordSnapshot(nextNodes, edges, { description: `Add tool: ${toolInstance.name}` });
    },
    [nodes, edges, setNodes, recordSnapshot]
  );

  const handleRemoveTool = useCallback(
    (agentId: string, toolId: string) => {
      const nextNodes = nodes.map((n) => {
        if (n.id === agentId && n.type === 'agentNode') {
          return {
            ...n,
            data: {
              ...n.data,
              tools: (n.data as AgentData).tools?.filter((t) => t.id !== toolId) || [],
            },
          };
        }
        return n;
      });
      setNodes(nextNodes);
      recordSnapshot(nextNodes, edges, { description: 'Remove tool' });
    },
    [nodes, edges, setNodes, recordSnapshot]
  );

  const handleReorderSubAgents = useCallback(
    (agentId: string, startIndexOrNewOrder: number | any[], endIndex?: number) => {
      const targetNode = nodes.find((n) => n.id === agentId);
      if (!targetNode || targetNode.type !== 'agentNode') return;

      const currentSubAgents: SubAgentRef[] = (targetNode.data as AgentData).subAgents || [];
      let newOrder: SubAgentRef[];

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

      const nextNodes = nodes.map((n) => {
        if (n.id === agentId && n.type === 'agentNode') {
          return {
            ...n,
            data: {
              ...n.data,
              subAgents: newOrder,
            },
          };
        }
        return n;
      });
      setNodes(nextNodes);
      recordSnapshot(nextNodes, edges, { description: 'Reorder sub-agents' });
    },
    [nodes, edges, setNodes, recordSnapshot]
  );

  const handleUpdateSubAgentPattern = useCallback(
    (agentId: string, pattern: 'sequential' | 'hierarchical' | 'parallel' | 'loop') => {
      const targetNode = nodes.find((n) => n.id === agentId);
      if (!targetNode || targetNode.type !== 'agentNode') return;

      const currentSubAgents: SubAgentRef[] = (targetNode.data as AgentData).subAgents || [];
      const updatedSubAgents = currentSubAgents.map((sub) => ({
        ...sub,
        delegationType: pattern,
      }));

      const nextNodes = nodes.map((n) => {
        if (n.id === agentId && n.type === 'agentNode') {
          return {
            ...n,
            data: {
              ...n.data,
              subAgentPattern: pattern,
              subAgents: updatedSubAgents,
              maxIterations: pattern === 'loop' ? (n.data as AgentData).maxIterations || 3 : (n.data as AgentData).maxIterations,
            },
          };
        }
        return n;
      });
      setNodes(nextNodes);
      recordSnapshot(nextNodes, edges, { description: `Update sub-agent pattern: ${pattern}` });
    },
    [nodes, edges, setNodes, recordSnapshot]
  );

  const handleUpdateMaxIterations = useCallback(
    (agentId: string, maxIterations: number) => {
      const nextNodes = nodes.map((n) => {
        if (n.id === agentId && n.type === 'agentNode') {
          return {
            ...n,
            data: {
              ...n.data,
              maxIterations,
            },
          };
        }
        return n;
      });
      setNodes(nextNodes);
      recordSnapshot(nextNodes, edges, { description: `Update loop iterations: ${maxIterations}` });
    },
    [nodes, edges, setNodes, recordSnapshot]
  );

  const handleUpdateTriggerData = useCallback((triggerId: string, partial: Partial<TriggerData>) => {
    const nextNodes = nodes.map((n) => {
      if (n.id === triggerId) {
        return {
          ...n,
          data: {
            ...n.data,
            ...partial,
          },
        };
      }
      return n;
    });
    setNodes(nextNodes);
    recordSnapshot(nextNodes, edges, { description: 'Update trigger data' });
  }, [nodes, edges, setNodes, recordSnapshot]);

  // Derive target agent ID from trigger connections
  const triggerTargetAgentId = useMemo(() => {
    const triggerNodes = nodes.filter((n) => n.type === 'triggerNode');
    const triggerEdges = edges.filter((e) => triggerNodes.some((tn) => tn.id === e.source));
    const attachedEdge = triggerEdges.find((e) => {
      const targetNode = nodes.find((n) => n.id === e.target);
      return targetNode?.type === 'agentNode';
    });
    return attachedEdge ? attachedEdge.target : null;
  }, [nodes, edges]);

  // Synchronize isStartNode on agent nodes whenever trigger connections change
  useEffect(() => {
    setNodes((nds: any[]) => {
      let hasChanges = false;
      const targetId = triggerTargetAgentId;

      const agentNodes = nds.filter((n: any) => n.type === 'agentNode');
      const hasAnyStart = agentNodes.some((n: any) => (n.data as AgentData).isStartNode);
      const defaultStartId = targetId || (hasAnyStart ? null : agentNodes[0]?.id);

      const updated = nds.map((n: any) => {
        if (n.type === 'agentNode') {
          const shouldBeStart = targetId
            ? n.id === targetId
            : (hasAnyStart ? n.data.isStartNode : n.id === defaultStartId);

          if (n.data.isStartNode !== shouldBeStart) {
            hasChanges = true;
            return {
              ...n,
              data: {
                ...n.data,
                isStartNode: shouldBeStart,
              },
            };
          }
        }
        return n;
      });

      return hasChanges ? updated : nds;
    });
  }, [triggerTargetAgentId, setNodes]);

  // ---------------------------------------------------------------------------
  // 6. Graph Connection & Validation Logic
  // ---------------------------------------------------------------------------
  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      if (!connection.source || !connection.target) return false;
      if (connection.source === connection.target) return false;

      const sourceNode = nodes.find((n) => n.id === connection.source);
      const targetNode = nodes.find((n) => n.id === connection.target);

      if (targetNode?.type === 'agentNode') {
        const validInHandles = ['input', 'input_left', 'input_right'];
        if (connection.targetHandle && !validInHandles.includes(connection.targetHandle)) {
          return false;
        }
      }

      if (sourceNode?.type === 'agentNode') {
        if (targetNode?.type !== 'agentNode') return false;
      }

      if (sourceNode?.type === 'triggerNode') {
        if (targetNode?.type !== 'agentNode') return false;

        const triggerNodes = nodes.filter((n) => n.type === 'triggerNode');
        const otherTriggerEdges = edges.filter(
          (e) => triggerNodes.some((tn) => tn.id === e.source) && e.source !== connection.source
        );
        const existingRootTargets = Array.from(new Set(otherTriggerEdges.map((e) => e.target)));

        if (existingRootTargets.length > 0 && !existingRootTargets.includes(connection.target)) {
          return false;
        }
      }

      return true;
    },
    [nodes, edges]
  );

  const reconnectTriggersToRoot = useCallback((rootAgentId: string) => {
    setNodes((nds: any[]) =>
      nds.map((n: any) => {
        if (n.type === 'agentNode') {
          return {
            ...n,
            data: {
              ...n.data,
              isStartNode: n.id === rootAgentId,
            },
          };
        }
        if (n.type === 'triggerNode') {
          return {
            ...n,
            data: {
              ...n.data,
              targetRootAgentId: rootAgentId,
            },
          };
        }
        return n;
      })
    );

    setEdges((eds: any[]) => {
      const nonTriggerEdges = eds.filter((e) => !nodes.some((n) => n.type === 'triggerNode' && n.id === e.source));
      const triggerNodes = nodes.filter((n) => n.type === 'triggerNode');

      const newTriggerEdges = triggerNodes.map((tn) => {
        const isTester = (tn.data as TriggerData)?.triggerType === 'tester';
        return {
          id: `e_trigger_${tn.id}_${rootAgentId}`,
          source: tn.id,
          sourceHandle: isTester ? 'trigger_out_right' : 'trigger_out_bottom',
          target: rootAgentId,
          targetHandle: isTester ? 'input_left' : 'input',
          animated: true,
          style: {
            stroke: isTester ? '#eab308' : '#3b82f6',
            strokeWidth: 2,
            strokeDasharray: isTester ? '5 5' : undefined,
          },
        };
      });

      return [...nonTriggerEdges, ...newTriggerEdges];
    });
  }, [nodes, setNodes, setEdges]);

  // Bind callback methods directly to node data payloads
  const enrichedNodes = useMemo(() => {
    return nodes.map((node) => {
      if (node.type === 'triggerNode') {
        return {
          ...node,
          data: {
            ...node.data,
            onEdit: handleEditTrigger,
            onDelete: handleDeleteTrigger,
          },
        };
      }
      return {
        ...node,
        data: {
          ...node.data,
          onEdit: handleEditAgent,
          onDelete: handleDeleteAgent,
          onAddTool: handleOpenAddTool,
          onAddSpecificTool: handleAddSpecificTool,
          onRemoveTool: handleRemoveTool,
          onReorderSubAgents: handleReorderSubAgents,
          onUpdateSubAgentPattern: handleUpdateSubAgentPattern,
          onUpdateMaxIterations: handleUpdateMaxIterations,
        },
      };
    });
  }, [
    nodes,
    handleEditAgent,
    handleDeleteAgent,
    handleOpenAddTool,
    handleAddSpecificTool,
    handleRemoveTool,
    handleReorderSubAgents,
    handleUpdateSubAgentPattern,
    handleUpdateMaxIterations,
    handleEditTrigger,
    handleDeleteTrigger,
  ]);

  const onConnect = useCallback(
    (connection: Connection) => {
      const sourceNode = nodes.find((n) => n.id === connection.source);
      const isTriggerSource = sourceNode?.type === 'triggerNode';
      const sourceAgentData = sourceNode?.type === 'agentNode' ? (sourceNode.data as AgentData) : null;
      const isRouterSource = sourceAgentData?.agentKind === 'router';
      const isSubAgentConnection = connection.sourceHandle === 'subagent';

      if (isTriggerSource && connection.target) {
        const targetAgent = nodes.find((n) => n.id === connection.target);
        if (!targetAgent || targetAgent.type !== 'agentNode') return;

        const triggerNodes = nodes.filter((n) => n.type === 'triggerNode');
        const otherTriggerEdges = edges.filter(
          (e) => triggerNodes.some((tn) => tn.id === e.source) && e.source !== connection.source
        );
        const existingOtherTargets = otherTriggerEdges.filter((e) => e.target !== connection.target);

        if (existingOtherTargets.length > 0) {
          const currentRootNode = nodes.find((n) => n.id === existingOtherTargets[0].target);
          const currentRootName = (currentRootNode?.data as AgentData)?.label || 'another agent';
          setValidationWarning(
            `Cannot attach trigger to "${(targetAgent.data as AgentData).label}". Triggers are already attached to root agent "${currentRootName}". A workflow diagram can only have triggers attached to a single root agent.`
          );
          return;
        }

        const isTester = (sourceNode.data as TriggerData)?.triggerType === 'tester';
        const newTriggerEdge: Edge = {
          ...connection,
          id: `e_trigger_${connection.source}_${connection.target}`,
          source: connection.source!,
          sourceHandle: connection.sourceHandle || (isTester ? 'trigger_out_right' : 'trigger_out_bottom'),
          target: connection.target,
          targetHandle: connection.targetHandle || (isTester ? 'input_left' : 'input'),
          animated: true,
          style: {
            stroke: isTester ? '#eab308' : '#3b82f6',
            strokeWidth: 2,
            strokeDasharray: isTester ? '5 5' : undefined,
          },
        };

        const nextEdges = [...edges.filter((e) => e.source !== connection.source), newTriggerEdge];
        setEdges(nextEdges);

        const nextNodes = nodes.map((n) => {
          if (n.id === connection.target && n.type === 'agentNode') {
            return {
              ...n,
              data: {
                ...n.data,
                isStartNode: true,
              },
            };
          }
          if (n.id === connection.source && n.type === 'triggerNode') {
            return {
              ...n,
              data: {
                ...n.data,
                targetRootAgentId: connection.target,
              },
            };
          }
          return n;
        });
        setNodes(nextNodes);

        recordSnapshot(nextNodes, nextEdges, { description: 'Connect trigger' });
        return;
      }

      if (isRouterSource && connection.source && connection.target && connection.sourceHandle) {
        const branches = sourceAgentData?.routerConfig?.branches || [];
        const matchingBranchIdx = branches.findIndex((b) => b.id === connection.sourceHandle);
        const matchingBranch = matchingBranchIdx >= 0 ? branches[matchingBranchIdx] : null;

        const newEdge: Edge = {
          ...connection,
          id: `e_router_${connection.source}_${connection.sourceHandle}_${connection.target}`,
          animated: true,
          style: { stroke: '#3b82f6', strokeWidth: 2 },
          targetHandle: connection.targetHandle || 'input',
        } as Edge;

        const nextEdges = [
          ...edges.filter((e) => !(e.source === connection.source && e.sourceHandle === connection.sourceHandle)),
          newEdge,
        ];
        setEdges(nextEdges);

        let nextNodes = nodes;
        if (matchingBranch) {
          const updatedBranches = branches.map((b) =>
            b.id === connection.sourceHandle ? { ...b, targetAgentId: connection.target } : b
          );
          nextNodes = nodes.map((n) => {
            if (n.id === connection.source) {
              return {
                ...n,
                data: {
                  ...n.data,
                  routerConfig: {
                    ...sourceAgentData?.routerConfig,
                    branches: updatedBranches,
                  },
                },
              };
            }
            return n;
          });
          setNodes(nextNodes);
        }
        recordSnapshot(nextNodes, nextEdges, { description: 'Connect router branch' });
        return;
      }

      const newEdge: Edge = {
        ...connection,
        id: `e_${connection.source}_${connection.target}_${Date.now()}`,
        animated: true,
        style: isSubAgentConnection
          ? { stroke: '#3b82f6', strokeWidth: 2, strokeDasharray: '4 4' }
          : { stroke: '#3b82f6', strokeWidth: 2 },
      } as Edge;

      const nextEdges = addEdge(newEdge, edges);
      setEdges(nextEdges);

      let nextNodes = nodes;
      if (sourceNode?.type === 'agentNode') {
        nextNodes = syncAgentSubAgents(nodes, nextEdges);
        setNodes(nextNodes);
      }
      recordSnapshot(nextNodes, nextEdges, { description: 'Connect agents' });
    },
    [nodes, edges, setEdges, setNodes, reconnectTriggersToRoot, recordSnapshot]
  );

  // ---------------------------------------------------------------------------
  // 7. Drag-and-Drop & Creation Handlers
  // ---------------------------------------------------------------------------
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow/type');
      const isPattern = event.dataTransfer.getData('application/reactflow/isPattern') === 'true';
      const triggerType = event.dataTransfer.getData('application/reactflow/triggerType') as TriggerType | undefined;
      const toolDataStr = event.dataTransfer.getData('application/reactflow/tool');

      if (toolDataStr) {
        try {
          const droppedTool = JSON.parse(toolDataStr) as ToolDefinition;
          if (droppedTool && selectedAgentId) {
            handleAddSpecificTool(selectedAgentId, droppedTool);
          }
        } catch (e) {
          console.error(e);
        }
        return;
      }

      if (!type) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      if (type === 'trigger') {
        const rootAgent = nodes.find((n) => n.type === 'agentNode' && (n.data as AgentData).isStartNode) ||
          nodes.find((n) => n.type === 'agentNode');

        const newTriggerNode = createSingleTriggerNode(
          position.x,
          position.y,
          triggerType || 'chat',
          rootAgent?.id
        );

        const nextNodes = [...nodes, newTriggerNode];
        let nextEdges = [...edges];

        if (rootAgent) {
          const isTester = (triggerType || 'chat') === 'tester';
          const triggerEdge: Edge = {
            id: `e_trigger_${newTriggerNode.id}_${rootAgent.id}`,
            source: newTriggerNode.id,
            sourceHandle: isTester ? 'trigger_out_right' : 'trigger_out_bottom',
            target: rootAgent.id,
            targetHandle: isTester ? 'input_left' : 'input',
            animated: true,
            style: {
              stroke: isTester ? '#eab308' : '#3b82f6',
              strokeWidth: 2,
              strokeDasharray: isTester ? '5 5' : undefined,
            },
          };
          nextEdges = [...edges, triggerEdge];
        }

        setNodes(nextNodes);
        setEdges(nextEdges);
        recordSnapshot(nextNodes, nextEdges, { description: `Add ${triggerType || 'chat'} trigger` });
        return;
      }

      if (isPattern) {
        const rawPattern = createPatternNodesAndEdges(
          type as PatternType,
          0,
          0
        );
        const { nodes: layoutedNodes, edges: layoutedEdges } = layoutPatternAtDropPosition(
          rawPattern.nodes,
          rawPattern.edges,
          position.x,
          position.y,
          nodes
        );
        const nextNodes = [...nodes, ...layoutedNodes];
        const nextEdges = [...edges, ...layoutedEdges];
        setNodes(nextNodes);
        setEdges(nextEdges);
        recordSnapshot(nextNodes, nextEdges, { description: `Add pattern ${type}` });
      } else {
        const hasStartNode = nodes.some((n) => n.type === 'agentNode' && (n.data as AgentData).isStartNode);
        const newNode = createSingleAgentNode(
          position.x,
          position.y,
          undefined,
          undefined,
          (type as AgentKind) || 'standard',
          {
            model: settings.defaultModel,
            temperature: settings.defaultTemperature,
            memoryType: settings.defaultMemoryType,
            subAgentPattern: settings.defaultSubAgentPattern,
          }
        );
        if (!hasStartNode) {
          newNode.data.isStartNode = true;
        }
        const nextNodes = [...nodes, newNode];
        setNodes(nextNodes);
        recordSnapshot(nextNodes, edges, { description: `Add ${type || 'agent'}` });
      }
    },
    [nodes, edges, settings, setNodes, setEdges, recordSnapshot, screenToFlowPosition, selectedAgentId, handleAddSpecificTool]
  );

  const handleAddRootWithTestSuite = useCallback(() => {
    const starterAgent = createSingleAgentNode(420, 140, 'Primary Agent', 'Root coordinator and task orchestrator', 'standard', {
      model: settings.defaultModel,
      temperature: settings.defaultTemperature,
      memoryType: settings.defaultMemoryType,
      colorTheme: settings.defaultAgentTheme,
      subAgents: [],
    });
    starterAgent.data.isStartNode = true;
    starterAgent.data.subAgents = [];

    const testerTrigger = createSingleTriggerNode(60, 160, 'tester', starterAgent.id);
    const testerEdge: Edge = {
      id: `e_trigger_${testerTrigger.id}_${starterAgent.id}`,
      source: testerTrigger.id,
      sourceHandle: 'trigger_out_right',
      target: starterAgent.id,
      targetHandle: 'input_left',
      animated: true,
      style: {
        stroke: '#eab308',
        strokeWidth: 2,
        strokeDasharray: '5 5',
      },
    };

    const nextNodes = [...nodes, testerTrigger, starterAgent];
    const nextEdges = [...edges, testerEdge];

    setNodes(nextNodes);
    setEdges(nextEdges);
    recordSnapshot(nextNodes, nextEdges, { description: 'Add Root Agent & Test Suite' });

    setTimeout(() => {
      fitView({ padding: 0.2, duration: 400 });
    }, 60);
  }, [nodes, edges, settings, setNodes, setEdges, recordSnapshot, fitView]);

  const handleAddAgentDirect = useCallback((kind: AgentKind = 'standard') => {
    const hasStartNode = nodes.some((n) => n.type === 'agentNode' && (n.data as AgentData).isStartNode);
    const newNode = createSingleAgentNode(
      150 + Math.random() * 200,
      150 + Math.random() * 150,
      undefined,
      undefined,
      kind,
      {
        model: settings.defaultModel,
        temperature: settings.defaultTemperature,
        memoryType: settings.defaultMemoryType,
        subAgentPattern: settings.defaultSubAgentPattern,
      }
    );
    if (!hasStartNode) {
      newNode.data.isStartNode = true;
    }
    const nextNodes = [...nodes, newNode];
    setNodes(nextNodes);
    recordSnapshot(nextNodes, edges, { description: `Add agent` });
  }, [nodes, edges, setNodes, settings, recordSnapshot]);

  const handleAddPatternDirect = useCallback(
    (patternType: PatternType) => {
      const rawPattern = createPatternNodesAndEdges(patternType, 0, 0);
      const defaultX = 140;
      const defaultY = 120;
      const { nodes: layoutedNodes, edges: layoutedEdges } = layoutPatternAtDropPosition(
        rawPattern.nodes,
        rawPattern.edges,
        defaultX,
        defaultY,
        nodes
      );
      const nextNodes = [...nodes, ...layoutedNodes];
      const nextEdges = [...edges, ...layoutedEdges];
      setNodes(nextNodes);
      setEdges(nextEdges);
      recordSnapshot(nextNodes, nextEdges, { description: `Add pattern ${patternType}` });
    },
    [nodes, edges, setNodes, setEdges, recordSnapshot]
  );

  const handleAddTriggerDirect = useCallback(
    (triggerType: TriggerType) => {
      const rootAgent = nodes.find((n) => n.type === 'agentNode' && (n.data as AgentData).isStartNode) ||
        nodes.find((n) => n.type === 'agentNode');

      const isTester = triggerType === 'tester';
      const posX = rootAgent
        ? (isTester ? rootAgent.position.x - 380 : rootAgent.position.x + 10)
        : 80;
      const posY = rootAgent
        ? (isTester ? rootAgent.position.y : Math.max(20, rootAgent.position.y - 280))
        : 40;

      const newTriggerNode = createSingleTriggerNode(posX, posY, triggerType, rootAgent?.id);
      const nextNodes = [...nodes, newTriggerNode];
      let nextEdges = [...edges];

      if (rootAgent) {
        const triggerEdge: Edge = {
          id: `e_trigger_${newTriggerNode.id}_${rootAgent.id}`,
          source: newTriggerNode.id,
          sourceHandle: isTester ? 'trigger_out_right' : 'trigger_out_bottom',
          target: rootAgent.id,
          targetHandle: isTester ? 'input_left' : 'input',
          animated: true,
          style: {
            stroke: isTester ? '#eab308' : '#3b82f6',
            strokeWidth: 2,
            strokeDasharray: isTester ? '5 5' : undefined,
          },
        };
        nextEdges = [...edges, triggerEdge];
      }
      setNodes(nextNodes);
      setEdges(nextEdges);
      recordSnapshot(nextNodes, nextEdges, { description: `Add ${triggerType} trigger` });
    },
    [nodes, edges, setNodes, setEdges, recordSnapshot]
  );

  const handleNodeDragStop = useCallback(() => {
    recordSnapshot(nodes, edges, { description: 'Move element' });
  }, [nodes, edges, recordSnapshot]);

  const handleAutoLayout = useCallback(() => {
    const layouted = getLayoutedElements(nodes, edges);
    setNodes([...layouted.nodes]);
    setEdges([...layouted.edges]);
    recordSnapshot(layouted.nodes, layouted.edges, { description: 'Auto-layout diagram' });
    setTimeout(() => {
      fitView({ padding: 0.2 });
      setTimeout(() => {
        zoomOut();
      }, 50);
    }, 50);
  }, [nodes, edges, setNodes, setEdges, fitView, zoomOut, recordSnapshot]);

  // ---------------------------------------------------------------------------
  // 8. Code Generation & Selected Agent Synchronization
  // ---------------------------------------------------------------------------
  const currentWorkflowDocument = useMemo((): AgentWorkflowDocument => {
    const currentActiveFile = fileTabs.find((t) => t.id === activeTabId) || fileTabs[0];
    return {
      version: '1.0.0',
      name: currentActiveFile?.filename ? currentActiveFile.filename.replace(/\.agent$/, '') : 'agent_workflow',
      description: 'Agent Workflow Document',
      framework: config.framework === 'google_adk' ? 'google-adk' : (config.framework as any) || 'google-adk',
      language: config.language || 'python',
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type as any,
        position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
        data: { ...n.data },
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle || undefined,
        targetHandle: e.targetHandle || undefined,
        type: e.type,
        animated: e.animated,
        data: e.data ? { ...e.data } : undefined,
      })),
      metadata: {
        outputFolder: config.outputFolder,
        deploymentTarget: config.deploymentTarget || 'agent_engine',
        updatedAt: new Date().toISOString(),
      },
    };
  }, [nodes, edges, config.framework, config.language, config.outputFolder, config.deploymentTarget, fileTabs, activeTabId]);

  const handleTriggerGenerate = useCallback(() => {
    if (!isPanelMaximized && panelContainerRef.current) {
      const containerHeight = panelContainerRef.current.getBoundingClientRect().height;
      if (containerHeight > 0) {
        const currentHeight = bottomPanelHeight !== null ? bottomPanelHeight : containerHeight * (1 / 3);
        const targetHalfHeight = containerHeight * 0.5;
        if (currentHeight < targetHalfHeight) {
          setBottomPanelHeight(targetHalfHeight);
        }
      }
    }

    setGeneratedFiles([]);
    setHasGeneratedCode(false);
    setIsGenerating(true);

    bridge.postMessage({
      type: 'GENERATE_CODE',
      payload: {
        document: currentWorkflowDocument,
        targetFramework: currentWorkflowDocument.framework,
        targetLanguage: currentWorkflowDocument.language,
        deploymentTarget: config.deploymentTarget || 'agent_engine',
        outputFolder: config.outputFolder,
      },
    });
  }, [currentWorkflowDocument, config.outputFolder, config.deploymentTarget, bridge, isPanelMaximized, bottomPanelHeight, setBottomPanelHeight, panelContainerRef]);

  const handleUpdateConfig = useCallback((newConf: Partial<GenerationConfig>) => {
    setConfig((prev) => ({ ...prev, ...newConf }));
  }, []);

  const selectedAgentNode = nodes.find((n) => n.id === selectedAgentId && n.type === 'agentNode');

  const handleUpdateSelectedAgent = useCallback(
    (partialData: Partial<AgentData>) => {
      if (!selectedAgentId) return;

      let nextEdges = edges;
      if (partialData.subAgents) {
        const remainingTargetIds = new Set((partialData.subAgents as SubAgentRef[]).map((s) => s.agentId));
        nextEdges = edges.filter((e) => !(e.source === selectedAgentId && !remainingTargetIds.has(e.target)));
        if (nextEdges.length !== edges.length) {
          setEdges(nextEdges);
        }
      }

      if (partialData.subAgentPattern) {
        const targetNode = nodes.find((n) => n.id === selectedAgentId);
        const curSubs = ((partialData.subAgents || (targetNode?.data as AgentData)?.subAgents) || []) as SubAgentRef[];
        partialData.subAgents = curSubs.map((sub) => ({
          ...sub,
          delegationType: partialData.subAgentPattern,
        }));
        if (
          partialData.subAgentPattern === 'loop' &&
          partialData.maxIterations === undefined &&
          (targetNode?.data as AgentData)?.maxIterations === undefined
        ) {
          partialData.maxIterations = 3;
        }
      }

      let nextNodes: Node<any>[];
      if (partialData.isStartNode === true) {
        reconnectTriggersToRoot(selectedAgentId);
        nextNodes = nodes.map((n) => (n.id === selectedAgentId ? { ...n, data: { ...n.data, ...partialData, isStartNode: true } } : n));
      } else {
        nextNodes = nodes.map((n) => (n.id === selectedAgentId ? { ...n, data: { ...n.data, ...partialData } } : n));
      }

      nextNodes = syncAgentSubAgents(nextNodes, nextEdges);
      setNodes(nextNodes);

      if (partialData.routerConfig) {
        const branches = partialData.routerConfig.branches || [];
        const currentSelectedId = selectedAgentId;
        const preservedEdges = nextEdges.filter((e) => e.source !== currentSelectedId);
        const newBranchEdges: Edge[] = [];

        branches.forEach((b) => {
          if (b.targetAgentId && b.targetAgentId.trim() !== '') {
            const targetNode = nextNodes.find((n) => n.id === b.targetAgentId);
            if (targetNode) {
              newBranchEdges.push({
                id: `e_router_${currentSelectedId}_${b.id}_${b.targetAgentId}`,
                source: currentSelectedId,
                sourceHandle: b.id,
                target: b.targetAgentId,
                targetHandle: 'input',
                animated: true,
                style: { stroke: '#3b82f6', strokeWidth: 2 },
              });
            }
          }
        });

        nextEdges = [...preservedEdges, ...newBranchEdges];
        setEdges(nextEdges);
      }

      recordSnapshot(nextNodes, nextEdges, { description: 'Update agent properties' });
    },
    [selectedAgentId, nodes, edges, setNodes, setEdges, reconnectTriggersToRoot, recordSnapshot]
  );

  const selectedTriggerNode = nodes.find((n) => n.id === selectedTriggerId && n.type === 'triggerNode');
  const testSuiteNode = nodes.find(
    (n) => n.type === 'triggerNode' && (n.data as TriggerData).triggerType === 'tester'
  );
  const hasTestSuite = !!testSuiteNode;

  const testPrompts = useMemo(() => {
    if (!testSuiteNode) return [];
    const cfg = (testSuiteNode.data as TriggerData).config;
    return cfg?.testPrompts && cfg.testPrompts.length > 0
      ? cfg.testPrompts
      : DEFAULT_MOCK_TEST_PROMPTS;
  }, [testSuiteNode]);

  const agentNodes = useMemo(() =>
    nodes.filter((n) => n.type === 'agentNode').map((n) => n.data as AgentData),
    [nodes]
  );

  const handleAttachTool = useCallback(
    (tool: ToolDefinition) => {
      const targetId = toolModalAgentId || selectedAgentId;
      if (!targetId) return;

      handleAddSpecificTool(targetId, tool);
      setToolModalAgentId(null);
    },
    [toolModalAgentId, selectedAgentId, handleAddSpecificTool]
  );

  const targetAgentForTool = nodes.find((n) => n.id === (toolModalAgentId || selectedAgentId));

  // ---------------------------------------------------------------------------
  // 9. Layout Render
  // ---------------------------------------------------------------------------
  return (
    <div className="h-screen w-screen flex flex-col bg-[#0d1117] text-[#c9d1d9] select-none overflow-hidden font-sans">
      {activeEditorTab === 'settings' ? (
        <SettingsPage />
      ) : (
        /* RESIZABLE SPLIT CONTAINER (Diagram Editor on Top, Tabs at Bottom) */
        <div
          ref={panelContainerRef}
          className="flex-1 flex flex-col min-h-0 w-full overflow-hidden relative"
        >
          {/* TOP: DIAGRAM EDITOR */}
          <div
            className={`relative w-full bg-[#181818] overflow-hidden transition-all ${
              isPanelMaximized ? 'h-0 min-h-0 hidden' : 'flex-1 min-h-[120px]'
            }`}
            ref={reactFlowWrapper}
          >
            <ReactFlow
              nodes={enrichedNodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeDragStop={handleNodeDragStop}
              onConnect={onConnect}
              isValidConnection={isValidConnection}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onNodeClick={(_: any, node: any) => {
                if (node.type === 'triggerNode') {
                  const triggerData = node.data as TriggerData;
                  if (triggerData?.triggerType === 'chat') {
                    setSelectedTriggerId(null);
                    setIsTriggerDrawerOpen(false);
                    return;
                  }
                  setSelectedTriggerId(node.id);
                  setIsTriggerDrawerOpen(true);
                  setSelectedAgentId(null);
                  setIsToolDrawerOpen(false);
                } else {
                  setSelectedAgentId(node.id);
                  setSelectedTriggerId(null);
                  setIsTriggerDrawerOpen(false);
                  setIsToolDrawerOpen(false);
                }
              }}
              onPaneClick={() => {
                setSelectedAgentId(null);
                setSelectedTriggerId(null);
                setIsTriggerDrawerOpen(false);
                setIsToolDrawerOpen(false);
              }}
              nodeTypes={nodeTypes}
              connectionLineStyle={{ stroke: '#eab308', strokeWidth: 2 }}
              onNodesDelete={handleNodesDelete}
              deleteKeyCode={['Backspace', 'Delete']}
              fitView
              proOptions={{ hideAttribution: true }}
              minZoom={0.2}
              maxZoom={2.5}
            >
              {/* TOP-RIGHT CANVAS CONTROLS & MINIMAP */}
              <CanvasToolbar
                canUndo={canUndo}
                canRedo={canRedo}
                onUndo={handleUndo}
                onRedo={handleRedo}
                onAutoLayout={handleAutoLayout}
                showMiniMap={settings.showMiniMap}
              />

              {/* Empty Diagram State Overlay */}
              {nodes.length === 0 && (
                <CanvasEmptyState onAddRootEngine={handleAddRootWithTestSuite} />
              )}

              {/* Validation Warning Toast */}
              <ValidationToast
                warning={validationWarning}
                onDismiss={() => setValidationWarning(null)}
              />
            </ReactFlow>

            {/* Floating Palette on Left */}
            <PaletteCard
              tools={tools}
              selectedAgent={selectedAgentNode ? (selectedAgentNode.data as AgentData) : null}
              onAddAgent={handleAddAgentDirect}
              onAddPattern={handleAddPatternDirect}
              onAddTrigger={handleAddTriggerDirect}
              onOpenAdvisor={() => setIsAdvisorOpen(true)}
              onOpenEditTool={handleOpenEditTool}
              onCreateCustomTool={handleCreateCustomTool}
              onCreateMcpTool={handleCreateMcpTool}
              onOpenSample={handleOpenSampleInNewTab}
              onAddToolToAgent={(tool) => {
                if (selectedAgentId) {
                  handleAddSpecificTool(selectedAgentId, tool);
                } else if (nodes.length > 0) {
                  const firstAgent = nodes.find((n) => n.type === 'agentNode');
                  if (firstAgent) handleAddSpecificTool(firstAgent.id, tool);
                }
              }}
            />

            {/* Slide-out Agent Inspector Drawer */}
            <AgentDrawer
              agent={selectedAgentNode ? (selectedAgentNode.data as AgentData) : null}
              allAgents={agentNodes}
              isOpen={!!selectedAgentId && !isToolDrawerOpen && !isTriggerDrawerOpen}
              onClose={() => setSelectedAgentId(null)}
              onUpdateAgent={handleUpdateSelectedAgent}
              onOpenAddTool={() => selectedAgentId && setToolModalAgentId(selectedAgentId)}
              onRemoveTool={(toolId) => selectedAgentId && handleRemoveTool(selectedAgentId, toolId)}
              onEditTool={(tool) => selectedAgentId && handleOpenEditAgentTool(selectedAgentId, tool)}
            />

            {/* Slide-out Trigger Inspector Drawer */}
            <TriggerDrawer
              trigger={selectedTriggerNode ? (selectedTriggerNode.data as TriggerData) : null}
              availableAgents={agentNodes}
              isOpen={isTriggerDrawerOpen && !!selectedTriggerNode}
              onClose={() => {
                setIsTriggerDrawerOpen(false);
                setSelectedTriggerId(null);
              }}
              onUpdateTrigger={(partial) => {
                if (selectedTriggerId) handleUpdateTriggerData(selectedTriggerId, partial);
              }}
              onDeleteTrigger={() => {
                if (selectedTriggerId) handleDeleteTrigger(selectedTriggerId);
              }}
              onReconnectToRoot={reconnectTriggersToRoot}
            />

            {/* Slide-out Tool Definition Property Panel */}
            <ToolPropertyDrawer
              tool={editingTool}
              isOpen={isToolDrawerOpen}
              onClose={() => {
                setIsToolDrawerOpen(false);
                setEditingToolScope(null);
              }}
              onSaveTool={handleSaveTool}
              onDeleteTool={handleDeleteTool}
              scope={editingToolScope?.type || 'global'}
              agentName={
                editingToolScope?.type === 'agent'
                  ? (nodes.find((n) => n.id === editingToolScope.agentId)?.data as AgentData)?.label
                  : undefined
              }
              selectedAgent={selectedAgentNode ? (selectedAgentNode.data as AgentData) : null}
              onAttachToAgent={(agentId, tool) => {
                handleAddSpecificTool(agentId, tool);
                setIsToolDrawerOpen(false);
                setEditingToolScope(null);
              }}
            />
          </div>

          {/* ADJUSTABLE RESIZING DIVIDER */}
          <PanelDivider
            isPanelMaximized={isPanelMaximized}
            isDraggingDivider={isDraggingDivider}
            bottomPanelHeight={bottomPanelHeight}
            onMouseDown={handleDividerMouseDown}
            onDoubleClick={() => {
              if (bottomPanelHeight === null) {
                if (panelContainerRef.current) {
                  setBottomPanelHeight(panelContainerRef.current.getBoundingClientRect().height * 0.55);
                }
              } else {
                setBottomPanelHeight(null);
              }
            }}
          />

          {/* BOTTOM PANEL: CODE GENERATION, DEPLOYMENT & TEST RUNNER */}
          <div
            style={{
              height: isPanelMaximized
                ? '100%'
                : (bottomPanelHeight !== null ? `${bottomPanelHeight}px` : '33.333%'),
            }}
            className={`w-full overflow-hidden flex flex-col bg-[#0d1117] transition-[height] duration-200 ${
              isPanelMaximized ? 'flex-1 h-full min-h-0' : 'shrink-0 min-h-[90px]'
            }`}
          >
            <CodeGenerationPanel
              config={config}
              onChangeConfig={handleUpdateConfig}
              onGenerateCode={handleTriggerGenerate}
              generatedFiles={generatedFiles}
              isGenerating={isGenerating}
              onOpenMissingAdvisor={() => setIsAdvisorOpen(true)}
              hasTestSuite={hasTestSuite}
              hasGeneratedCode={hasGeneratedCode}
              testPrompts={testPrompts}
              agents={agentNodes}
              isMaximized={isPanelMaximized}
              onToggleMaximize={handleToggleMaximizePanel}
              document={currentWorkflowDocument}
            />
          </div>
        </div>
      )}

      {/* Tool Attachment Modal */}
      <AddToolModal
        isOpen={!!toolModalAgentId}
        onClose={() => setToolModalAgentId(null)}
        onSelectTool={handleAttachTool}
        existingToolIds={((targetAgentForTool?.data as AgentData)?.tools || []).map((t) => t.id)}
        tools={tools}
        targetAgentName={(targetAgentForTool?.data as AgentData)?.label}
      />

      {/* Architectural Advisor Modal */}
      <MissingFeaturesModal
        isOpen={isAdvisorOpen}
        onClose={() => setIsAdvisorOpen(false)}
      />
    </div>
  );
}

/**
 * Root exported App component. Wraps the canvas with necessary context providers.
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
