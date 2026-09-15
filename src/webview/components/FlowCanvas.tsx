/**
 * FlowCanvas.tsx - Webview Orchestration Canvas
 *
 * Purpose:
 * Top-level workspace coordinator for the custom visual agent builder.
 * Orchestrates react state, workspace sync, dragging handlers, and layout
 * configurations, delegating visual render blocks to dedicated tab widgets.
 *
 * Architectural Decisions:
 * - Author: Mike Nimer <mikenimer@google.com>
 * - Modular design following "Props In, Events Up" paradigm.
 * - Spacing layout complies with 8pt grid system.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import {
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  useReactFlow,
} from '@xyflow/react';

// Context Providers
import { useBridgeContext } from '../context/BridgeContext';
import { usePluginSettings } from '../context/SettingsContext';

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
  McpToolConfig,
  SampleWorkflowDefinition,
} from '../types';
import { AgentWorkflowDocument } from '../../shared/types';
import { INITIAL_NODES, INITIAL_EDGES } from '../data/initialGraph';
import { DEFAULT_MOCK_TEST_PROMPTS } from '../data/triggerDefinitions';
import {
  createSampleNodesAndEdges,
  SAMPLES_CATALOG,
} from '../data/sampleWorkflows';

// UI Tabs & Panels
import { CanvasTab } from './tabs/CanvasTab';
import { CodeGenerationPanel } from './codegen/CodeGenerationPanel';
import { AddToolModal } from './inspector/AddToolModal';
import { MissingFeaturesModal } from './insights/MissingFeaturesModal';
import { PanelDivider } from './Canvas/PanelDivider';

// Custom Hooks
import { useDiagramHistory } from '../hooks/useDiagramHistory';
import { useFileTabs } from '../hooks/useFileTabs';
import { useToolsManager } from '../hooks/useToolsManager';
import { useResizablePanel } from '../hooks/useResizablePanel';
import { useCanvasKeyboardShortcuts } from '../hooks/useCanvasKeyboardShortcuts';
import { useExtensionSync } from '../hooks/useExtensionSync';

// Domain Utilities & Layout
import {
  syncAgentSubAgents,
  resolveAgentOutputFolder,
  normalizeLoadedNodes,
  normalizeLoadedEdges,
} from '../utils/workflowSync';
import { getLayoutedElements, layoutPatternAtDropPosition } from '../utils/layout';
import {
  createSingleAgentNode,
  createSingleTriggerNode,
  createPatternNodesAndEdges,
} from '../data/patterns';

export const isTriggerNode = (node?: { type?: string; data?: any }) =>
  node?.type === 'triggerNode' ||
  node?.type === 'trigger' ||
  !!node?.data?.triggerType ||
  !!node?.data?.triggerKind;

export function FlowCanvas() {
  const bridge = useBridgeContext();
  const { settings, activeEditorTab, setActiveEditorTab } = usePluginSettings();
  const { fitView, zoomOut, screenToFlowPosition } = useReactFlow();

  // Synchronous document pre-hydration from injected window.__INITIAL_AGENT_DOCUMENT__
  const initialInjectedDoc: AgentWorkflowDocument | null =
    typeof window !== 'undefined' && (window as any).__INITIAL_AGENT_DOCUMENT__
      ? (window as any).__INITIAL_AGENT_DOCUMENT__
      : null;
  const initialInjectedFilePath: string =
    typeof window !== 'undefined' && (window as any).__INITIAL_AGENT_FILE_PATH__
      ? (window as any).__INITIAL_AGENT_FILE_PATH__
      : '';
  const initialInjectedFileName: string = initialInjectedFilePath
    ? initialInjectedFilePath.split('/').filter(Boolean).pop() || initialInjectedFilePath
    : initialInjectedDoc?.name
    ? `${initialInjectedDoc.name}.agent`
    : 'workflow.agent';

  const initialOutputFolder: string = resolveAgentOutputFolder(
    initialInjectedDoc?.deployment?.outputFolder || (initialInjectedDoc?.metadata as any)?.outputFolder,
    initialInjectedFileName
  );

  // ---------------------------------------------------------------------------
  // 1. React Flow Graph State & History Management
  // ---------------------------------------------------------------------------
  const [nodes, setNodes, onNodesChangeState] = useNodesState(
    initialInjectedDoc && Array.isArray(initialInjectedDoc.nodes)
      ? normalizeLoadedNodes(initialInjectedDoc.nodes)
      : INITIAL_NODES
  );
  const [edges, setEdges, onEdgesChangeState] = useEdgesState(
    initialInjectedDoc && Array.isArray(initialInjectedDoc.edges)
      ? normalizeLoadedEdges(initialInjectedDoc.edges)
      : INITIAL_EDGES
  );

  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  useEffect(() => {
    nodesRef.current = nodes;
    edgesRef.current = edges;
  }, [nodes, edges]);

  const onNodesChange = useCallback(
    (changes: any) => {
      onNodesChangeState(changes);
    },
    [onNodesChangeState]
  );

  const {
    canUndo,
    canRedo,
    handleUndo,
    handleRedo,
    recordSnapshot,
    initializeTabHistory,
  } = useDiagramHistory(nodes, edges, setNodes, setEdges);

  const onEdgesChange = useCallback(
    (changes: any) => {
      onEdgesChangeState(changes);
      const isRemoval = changes.some((c: any) => c.type === 'remove');
      if (isRemoval) {
        setTimeout(() => {
          setEdges((currentEdges) => {
            setNodes((currentNodes) => {
              const synced = syncAgentSubAgents(currentNodes, currentEdges);
              recordSnapshot(synced, currentEdges, { description: 'Remove connection' });
              return synced;
            });
            return currentEdges;
          });
        }, 10);
      }
    },
    [onEdgesChangeState, setEdges, setNodes, recordSnapshot]
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
    framework: (initialInjectedDoc?.deployment?.framework === 'google-adk'
      ? 'google_adk'
      : (initialInjectedDoc?.deployment?.framework || (initialInjectedDoc?.framework === 'google-adk' ? 'google_adk' : initialInjectedDoc?.framework) || settings.defaultFramework || 'google_adk')) as any,
    language: (initialInjectedDoc?.deployment?.language || initialInjectedDoc?.language || settings.defaultLanguage || 'python') as any,
    outputFolder: initialOutputFolder,
    deploymentTarget: (initialInjectedDoc?.deployment?.target || initialInjectedDoc?.deployment?.deploymentTarget || (initialInjectedDoc?.metadata as any)?.deploymentTarget || 'agent_engine') as any,
    includeTests: typeof initialInjectedDoc?.deployment?.includeTests === 'boolean' ? initialInjectedDoc.deployment.includeTests : true,
    includeDocker: typeof initialInjectedDoc?.deployment?.includeDocker === 'boolean' ? initialInjectedDoc.deployment.includeDocker : false,
    useStreaming: typeof initialInjectedDoc?.deployment?.useStreaming === 'boolean' ? initialInjectedDoc.deployment.useStreaming : (settings.useStreamingByDefault ?? true),
    deployedResourceId: initialInjectedDoc?.deployment?.deployedResourceId,
    serviceUrl: initialInjectedDoc?.deployment?.serviceUrl,
    consoleUrl: initialInjectedDoc?.deployment?.consoleUrl,
    deployedAt: initialInjectedDoc?.deployment?.deployedAt,
  });

  const [generatedFiles, setGeneratedFiles] = useState<GeneratedFile[]>([]);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [hasGeneratedCode, setHasGeneratedCode] = useState<boolean>(false);

  // ---------------------------------------------------------------------------
  // 4. Custom Hooks (Tabs, Tools, Resizing, Shortcuts, Extension Sync)
  // ---------------------------------------------------------------------------
  const {
    fileTabs,
    setFileTabs,
    activeTabId,
    handleOpenSampleInNewTab: _handleOpenSampleInInternalTab,
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

  /**
   * Dispatches CREATE_FILE_FROM_SAMPLE message to the VS Code extension host.
   * Prompts the user with a Save As dialog and opens the saved blueprint in a new editor tab.
   *
   * @author Mike Nimer <mikenimer@google.com>
   */
  const handleOpenSampleInNewTab = useCallback(
    (sample: SampleWorkflowDefinition) => {
      // NOTE: Forward sample creation to extension host to display save dialog and open new editor tab
      bridge.postMessage({
        type: 'CREATE_FILE_FROM_SAMPLE',
        payload: {
          sampleId: sample.id,
          sampleName: sample.name,
          sample: sample,
        },
      });
    },
    [bridge]
  );

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

  const handleTestMcpHandshake = useCallback(
    async (mcpConfig: McpToolConfig) => {
      const reqTimeout = ((mcpConfig.timeoutSeconds || 30) + 5) * 1000;
      try {
        const reply = await bridge.sendRequestWithReply(
          {
            type: 'DISCOVER_MCP_TOOLS',
            payload: {
              serverName: mcpConfig.serverName,
              transport: mcpConfig.transport,
              command: mcpConfig.command,
              args: mcpConfig.args,
              cwd: mcpConfig.cwd,
              url: mcpConfig.serverUrl,
              serverUrl: mcpConfig.serverUrl,
              envVars: mcpConfig.envVars,
              headers: mcpConfig.headers,
              timeoutSeconds: mcpConfig.timeoutSeconds,
              authProviderType: mcpConfig.authProviderType,
              oauthConfig: mcpConfig.oauthConfig,
              secretConfig: mcpConfig.secretConfig,
              bearerToken: mcpConfig.secretConfig?.bearerToken,
            },
          },
          'MCP_TOOLS_DISCOVERED',
          reqTimeout
        );
        return reply as any;
      } catch (err: any) {
        return {
          success: false,
          tools: [],
          error: err?.message || 'Handshake request timed out',
        };
      }
    },
    [bridge]
  );

  const handleStartOAuthFlow = useCallback(
    async (options: any) => {
      try {
        const reply = await bridge.sendRequestWithReply(
          {
            type: 'START_MCP_OAUTH_FLOW',
            payload: options,
          },
          'MCP_OAUTH_COMPLETED',
          180000
        );
        return reply as any;
      } catch (err: any) {
        return {
          success: false,
          error: err?.message || 'OAuth authorization request timed out',
        };
      }
    },
    [bridge]
  );

  const handleSaveMcpSecret = useCallback(
    async (secretName: string, envVar: string, token: string) => {
      try {
        const reply = await bridge.sendRequestWithReply(
          {
            type: 'SAVE_MCP_SECRET',
            payload: { secretName, envVar, token },
          },
          'MCP_SECRET_SAVED',
          10000
        );
        return reply as any;
      } catch (err: any) {
        return {
          success: false,
          error: err?.message || 'Saving secret timed out',
        };
      }
    },
    [bridge]
  );

  const handleGetMcpSecret = useCallback(
    async (secretName: string, envVar?: string) => {
      try {
        const reply = await bridge.sendRequestWithReply(
          {
            type: 'GET_MCP_SECRET',
            payload: { secretName, envVar },
          },
          'MCP_SECRET_RETRIEVED',
          10000
        );
        return reply as any;
      } catch (err: any) {
        return {
          success: false,
          hasToken: false,
          error: err?.message || 'Retrieving secret timed out',
        };
      }
    },
    [bridge]
  );

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
    setFileTabs,
    fitView,
    setConfig,
    setGeneratedFiles,
    setHasGeneratedCode,
    setIsGenerating,
    recordSnapshot,
  });

  // Export App instance globally to hook callbacks (e.g. within tabs)
  useEffect(() => {
    (window as any).__APP_INSTANCE__ = {
      handleUpdateSelectedAgent,
    };
    return () => {
      delete (window as any).__APP_INSTANCE__;
    };
  }, [nodes, edges, selectedAgentId]);

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
        if (isTriggerNode(n)) {
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
        if (n.id === agentId && (n.type === 'agentNode' || n.type === 'agent')) {
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
        if (n.id === agentId && (n.type === 'agentNode' || n.type === 'agent')) {
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

  const triggerTargetAgentId = useMemo(() => {
    const triggerNodes = nodes.filter(isTriggerNode);
    const triggerEdges = edges.filter((e) => triggerNodes.some((tn) => tn.id === e.source));
    const attachedEdge = triggerEdges.find((e) => {
      const targetNode = nodes.find((n) => n.id === e.target);
      return targetNode?.type === 'agentNode' || targetNode?.type === 'agent';
    });
    return attachedEdge ? attachedEdge.target : null;
  }, [nodes, edges]);

  useEffect(() => {
    setNodes((nds: any[]) => {
      let hasChanges = false;
      const targetId = triggerTargetAgentId;
      const next = nds.map((n) => {
        if (n.type === 'agentNode' || n.type === 'agent') {
          const shouldBeStart = targetId ? n.id === targetId : false;
          if (n.data?.isStartNode !== shouldBeStart) {
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
      return hasChanges ? next : nds;
    });
  }, [triggerTargetAgentId, setNodes]);

  // ---------------------------------------------------------------------------
  // 6. Connect Handlers & Validation
  // ---------------------------------------------------------------------------
  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      if (connection.source === connection.target) return false;

      const sourceNode = nodes.find((n) => n.id === connection.source);
      const targetNode = nodes.find((n) => n.id === connection.target);

      if (sourceNode?.type === 'agentNode' || sourceNode?.type === 'agent') {
        if (targetNode?.type !== 'agentNode' && targetNode?.type !== 'agent') return false;
        if (
          connection.sourceHandle &&
          connection.sourceHandle !== 'output' &&
          connection.sourceHandle !== 'subagent' &&
          !connection.sourceHandle.startsWith('branch_')
        ) {
          return false;
        }
      }

      if (isTriggerNode(sourceNode)) {
        if (targetNode?.type !== 'agentNode' && targetNode?.type !== 'agent') return false;

        const triggerNodes = nodes.filter(isTriggerNode);
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
        if (n.type === 'agentNode' || n.type === 'agent') {
          return {
            ...n,
            data: {
              ...n.data,
              isStartNode: n.id === rootAgentId,
            },
          };
        }
        if (isTriggerNode(n)) {
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
      const nonTriggerEdges = eds.filter((e) => !nodes.some((n) => isTriggerNode(n) && n.id === e.source));
      const triggerNodes = nodes.filter(isTriggerNode);

      const newTriggerEdges = triggerNodes.map((tn) => {
        const trigType = (tn.data as TriggerData)?.triggerType || (tn.data as any)?.triggerKind;
        const isTester = trigType === 'tester' || trigType === 'test';
        const isChat = trigType === 'chat';
        return {
          id: `e_trigger_${tn.id}_${rootAgentId}`,
          source: tn.id,
          sourceHandle: isTester || isChat ? 'trigger_out_right' : 'trigger_out_bottom',
          target: rootAgentId,
          targetHandle: isTester || isChat ? 'input_left' : 'input',
          animated: true,
          style: {
            stroke: '#f59e0b',
            strokeWidth: 2,
            strokeDasharray: '5 5',
          },
        };
      });

      return [...nonTriggerEdges, ...newTriggerEdges];
    });
  }, [nodes, setNodes, setEdges]);

  // Bind callback methods directly to node data payloads
  const enrichedNodes = useMemo(() => {
    return nodes.map((node) => {
      if (isTriggerNode(node)) {
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
      const currentNodes = nodesRef.current;
      const currentEdges = edgesRef.current;

      const sourceNode = currentNodes.find((n) => n.id === connection.source);
      const isTriggerSource = isTriggerNode(sourceNode);
      const sourceAgentData = (sourceNode?.type === 'agentNode' || sourceNode?.type === 'agent') ? (sourceNode.data as AgentData) : null;
      const isRouterSource = sourceAgentData?.agentKind === 'router';
      const isSubAgentConnection = connection.sourceHandle === 'subagent';

      if (isTriggerSource && connection.target) {
        const targetAgent = currentNodes.find((n) => n.id === connection.target);
        if (!targetAgent || (targetAgent.type !== 'agentNode' && targetAgent.type !== 'agent')) return;

        const triggerNodes = currentNodes.filter(isTriggerNode);
        const otherTriggerEdges = currentEdges.filter(
          (e) => triggerNodes.some((tn) => tn.id === e.source) && e.source !== connection.source
        );
        const existingOtherTargets = otherTriggerEdges.filter((e) => e.target !== connection.target);

        if (existingOtherTargets.length > 0) {
          const currentRootNode = currentNodes.find((n) => n.id === existingOtherTargets[0].target);
          const currentRootName = (currentRootNode?.data as AgentData)?.label || 'another agent';
          setValidationWarning(
            `Cannot attach trigger to "${(targetAgent.data as AgentData).label}". Triggers are already attached to root agent "${currentRootName}". A workflow diagram can only have triggers attached to a single root agent.`
          );
          return;
        }

        const trigType = (sourceNode?.data as TriggerData)?.triggerType || (sourceNode?.data as any)?.triggerKind;
        const isTester = trigType === 'tester' || trigType === 'test';
        const isChat = trigType === 'chat';
        const newTriggerEdge: Edge = {
          ...connection,
          id: `e_trigger_${connection.source}_${connection.target}`,
          source: connection.source!,
          sourceHandle: connection.sourceHandle || (isTester || isChat ? 'trigger_out_right' : 'trigger_out_bottom'),
          target: connection.target,
          targetHandle: connection.targetHandle || (isTester || isChat ? 'input_left' : 'input'),
          animated: true,
          style: {
            stroke: '#f59e0b',
            strokeWidth: 2,
            strokeDasharray: '5 5',
          },
        };

        const nextEdges = [...currentEdges.filter((e) => e.source !== connection.source), newTriggerEdge];
        setEdges(nextEdges);

        const nextNodes = currentNodes.map((n) => {
          if (n.id === connection.target && (n.type === 'agentNode' || n.type === 'agent')) {
            return {
              ...n,
              data: {
                ...n.data,
                isStartNode: true,
              },
            };
          }
          if (n.id === connection.source && isTriggerNode(n)) {
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
          style: { stroke: '#a855f7', strokeWidth: 2 },
          targetHandle: connection.targetHandle || 'input',
        } as Edge;

        const nextEdges = [
          ...currentEdges.filter((e) => !(e.source === connection.source && e.sourceHandle === connection.sourceHandle)),
          newEdge,
        ];
        setEdges(nextEdges);

        let nextNodes = currentNodes;
        if (matchingBranch) {
          const updatedBranches = branches.map((b) =>
            b.id === connection.sourceHandle ? { ...b, targetAgentId: connection.target } : b
          );
          nextNodes = currentNodes.map((n) => {
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

      const nextEdges = addEdge(newEdge, currentEdges);
      setEdges(nextEdges);

      const targetNode = currentNodes.find((n) => n.id === connection.target);
      const isAgentEdge =
        sourceNode?.type === 'agentNode' ||
        sourceNode?.type === 'agent' ||
        targetNode?.type === 'agentNode' ||
        targetNode?.type === 'agent';

      let nextNodes = currentNodes;
      if (isAgentEdge) {
        nextNodes = syncAgentSubAgents(currentNodes, nextEdges);
        setNodes(nextNodes);
      }
      recordSnapshot(nextNodes, nextEdges, { description: 'Connect agents' });
    },
    [setEdges, setNodes, reconnectTriggersToRoot, recordSnapshot]
  );

  const handleNodeClick = useCallback((_: any, node: any) => {
    if (isTriggerNode(node)) {
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
  }, []);

  const handlePaneClick = useCallback(() => {
    setSelectedAgentId(null);
    setSelectedTriggerId(null);
    setIsTriggerDrawerOpen(false);
    setIsToolDrawerOpen(false);
  }, []);

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
      const agentKindData = event.dataTransfer.getData('application/reactflow/agentKind') as AgentKind | '';
      const toolDataStr = event.dataTransfer.getData('application/reactflow/tool');
      const sampleDataStr = event.dataTransfer.getData('application/reactflow/sample');
      const sampleId = event.dataTransfer.getData('application/reactflow/sampleId');

      if (toolDataStr) {
        try {
          const droppedTool = JSON.parse(toolDataStr) as ToolDefinition;
          if (droppedTool && selectedAgentId) {
            handleAddSpecificTool(selectedAgentId, droppedTool);
          }
        } catch (e) {
          console.error('[FlowCanvas] Failed to parse dropped tool JSON', e);
        }
        return;
      }

      if (!type && !sampleDataStr && !sampleId) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      // 1. Handle Dropping an Entire Sample Workflow Blueprint
      if (type === 'sample' || sampleDataStr || sampleId) {
        let sample: SampleWorkflowDefinition | undefined;
        if (sampleDataStr) {
          try {
            sample = JSON.parse(sampleDataStr) as SampleWorkflowDefinition;
          } catch (e) {
            console.error('[FlowCanvas] Failed to parse dropped sample JSON', e);
          }
        }
        if (!sample && sampleId) {
          sample = SAMPLES_CATALOG.find((s) => s.id === sampleId);
        }

        if (sample && sample.nodes && sample.nodes.length > 0) {
          const { nodes: remappedNodes, edges: remappedEdges } = createSampleNodesAndEdges(
            sample,
            position.x,
            position.y,
            nodes
          );

          const { nodes: layoutedNodes, edges: layoutedEdges } = layoutPatternAtDropPosition(
            remappedNodes,
            remappedEdges,
            position.x,
            position.y,
            nodes
          );

          const nextNodes = [...nodes, ...layoutedNodes];
          const nextEdges = [...edges, ...layoutedEdges];
          setNodes(nextNodes);
          setEdges(nextEdges);
          recordSnapshot(nextNodes, nextEdges, { description: `Add sample ${sample.name}` });
          return;
        }
      }

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
          const effectiveTriggerType = triggerType || 'chat';
          const isTester = effectiveTriggerType === 'tester';
          const isChat = effectiveTriggerType === 'chat';
          const triggerEdge: Edge = {
            id: `e_trigger_${newTriggerNode.id}_${rootAgent.id}`,
            source: newTriggerNode.id,
            sourceHandle: isTester || isChat ? 'trigger_out_right' : 'trigger_out_bottom',
            target: rootAgent.id,
            targetHandle: isTester || isChat ? 'input_left' : 'input',
            animated: true,
            style: {
              stroke: '#f59e0b',
              strokeWidth: 2,
              strokeDasharray: '5 5',
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
        const effectiveKind: AgentKind = (agentKindData === 'a2a' || agentKindData === 'router' || agentKindData === 'standard')
          ? agentKindData
          : (type === 'a2a' || type === 'router' ? (type as AgentKind) : 'standard');
        const newNode = createSingleAgentNode(
          position.x,
          position.y,
          undefined,
          undefined,
          effectiveKind,
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
        recordSnapshot(nextNodes, edges, { description: `Add ${effectiveKind || 'agent'}` });
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
        stroke: '#f59e0b',
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
      const isChat = triggerType === 'chat';
      const posX = rootAgent
        ? (isTester || isChat ? rootAgent.position.x - 380 : rootAgent.position.x + 10)
        : 80;
      const posY = rootAgent
        ? (isTester ? rootAgent.position.y : isChat ? rootAgent.position.y - 120 : Math.max(20, rootAgent.position.y - 280))
        : 40;

      const newTriggerNode = createSingleTriggerNode(posX, posY, triggerType, rootAgent?.id);
      const nextNodes = [...nodes, newTriggerNode];
      let nextEdges = [...edges];

      if (rootAgent) {
        const triggerEdge: Edge = {
          id: `e_trigger_${newTriggerNode.id}_${rootAgent.id}`,
          source: newTriggerNode.id,
          sourceHandle: isTester || isChat ? 'trigger_out_right' : 'trigger_out_bottom',
          target: rootAgent.id,
          targetHandle: isTester || isChat ? 'input_left' : 'input',
          animated: true,
          style: {
            stroke: '#f59e0b',
            strokeWidth: 2,
            strokeDasharray: '5 5',
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
    setNodes((currentNodes) => {
      setEdges((currentEdges) => {
        recordSnapshot(currentNodes, currentEdges, { description: 'Move element' });
        return currentEdges;
      });
      return currentNodes;
    });
  }, [setNodes, setEdges, recordSnapshot]);

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
        ...(initialInjectedDoc?.metadata?.createdAt ? { createdAt: initialInjectedDoc.metadata.createdAt } : {}),
        ...(initialInjectedDoc?.metadata?.author ? { author: initialInjectedDoc.metadata.author } : {}),
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
        deployedResourceId: config.deployedResourceId,
        serviceUrl: config.serviceUrl,
        consoleUrl: config.consoleUrl,
        deployedAt: config.deployedAt,
      },
    };
  }, [
    nodes,
    edges,
    config.framework,
    config.language,
    config.outputFolder,
    config.deploymentTarget,
    config.includeTests,
    config.includeDocker,
    config.useStreaming,
    config.deployedResourceId,
    config.serviceUrl,
    config.consoleUrl,
    config.deployedAt,
    fileTabs,
    activeTabId,
  ]);

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

  const handleStopGenerate = useCallback(() => {
    setIsGenerating(false);
    bridge.postMessage({
      type: 'CANCEL_CODE_GENERATION',
    });
  }, [bridge]);

  const handleUpdateConfig = useCallback((newConf: Partial<GenerationConfig>) => {
    setConfig((prev) => ({ ...prev, ...newConf }));
  }, []);

  const selectedAgentNode = useMemo(
    () => nodes.find((n) => n.id === selectedAgentId && (n.type === 'agentNode' || n.type === 'agent')),
    [nodes, selectedAgentId]
  );

  const selectedNodeId = selectedAgentId || selectedTriggerId;

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
                style: { stroke: '#a855f7', strokeWidth: 2 },
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

  const selectedTriggerNode = useMemo(
    () => nodes.find((n) => n.id === selectedTriggerId && isTriggerNode(n)),
    [nodes, selectedTriggerId]
  );
  const testSuiteNode = useMemo(
    () =>
      nodes.find(
        (n) =>
          isTriggerNode(n) &&
          ((n.data as TriggerData)?.triggerType === 'tester' ||
            (n.data as any)?.triggerKind === 'tester' ||
            (n.data as any)?.triggerKind === 'test')
      ),
    [nodes]
  );
  const hasTestSuite = !!testSuiteNode;

  const testPrompts = useMemo(() => {
    if (!testSuiteNode) return [];
    const cfg = (testSuiteNode.data as TriggerData).config;
    return cfg?.testPrompts && cfg.testPrompts.length > 0
      ? cfg.testPrompts
      : DEFAULT_MOCK_TEST_PROMPTS;
  }, [testSuiteNode]);

  // Chat Trigger detection & configuration
  const chatTriggerNode = useMemo(
    () =>
      nodes.find(
        (n) =>
          isTriggerNode(n) &&
          ((n.data as TriggerData)?.triggerType === 'chat' ||
            (n.data as any)?.triggerKind === 'chat')
      ),
    [nodes]
  );
  const hasChatTrigger = !!chatTriggerNode;
  const chatTriggerConfig = useMemo(() => {
    if (!chatTriggerNode) return undefined;
    return (chatTriggerNode.data as TriggerData).config;
  }, [chatTriggerNode]);

  const agentNodes = useMemo(() =>
    nodes
      .filter((n) => n.type === 'agentNode' || n.type === 'agent')
      .map((n) => ({ ...n.data, id: (n.data as AgentData)?.id || n.id } as AgentData)),
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

  const targetAgentForTool = useMemo(
    () => nodes.find((n) => n.id === (toolModalAgentId || selectedAgentId)),
    [nodes, toolModalAgentId, selectedAgentId]
  );

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
          <CanvasTab
            nodes={nodes}
            edges={edges}
            enrichedNodes={enrichedNodes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeDragStop={handleNodeDragStop}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeClick={handleNodeClick}
            onPaneClick={handlePaneClick}
            onNodesDelete={handleNodesDelete}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onAutoLayout={handleAutoLayout}
            settings={settings}
            validationWarning={validationWarning}
            onDismissValidationWarning={() => setValidationWarning(null)}
            handleAddRootWithTestSuite={handleAddRootWithTestSuite}
            tools={tools}
            selectedAgentNode={selectedAgentNode}
            handleAddAgentDirect={handleAddAgentDirect}
            handleAddPatternDirect={handleAddPatternDirect}
            handleAddTriggerDirect={handleAddTriggerDirect}
            setIsAdvisorOpen={setIsAdvisorOpen}
            handleOpenSampleInNewTab={handleOpenSampleInNewTab}
            handleAddSpecificTool={handleAddSpecificTool}
            selectedAgentId={selectedAgentId}
            isToolDrawerOpen={isToolDrawerOpen}
            isTriggerDrawerOpen={isTriggerDrawerOpen}
            setSelectedAgentId={setSelectedAgentId}
            setToolModalAgentId={setToolModalAgentId}
            handleRemoveTool={handleRemoveTool}
            handleOpenEditAgentTool={handleOpenEditAgentTool}
            selectedTriggerNode={selectedTriggerNode}
            handleUpdateTriggerData={handleUpdateTriggerData}
            selectedTriggerId={selectedTriggerId}
            setSelectedTriggerId={setSelectedTriggerId}
            setIsTriggerDrawerOpen={setIsTriggerDrawerOpen}
            handleDeleteTrigger={handleDeleteTrigger}
            reconnectTriggersToRoot={reconnectTriggersToRoot}
            editingTool={editingTool}
            setEditingToolScope={setEditingToolScope}
            setIsToolDrawerOpen={setIsToolDrawerOpen}
            handleSaveTool={handleSaveTool}
            handleDeleteTool={handleDeleteTool}
            editingToolScope={editingToolScope}
            config={config}
            handleTestMcpHandshake={handleTestMcpHandshake}
            handleStartOAuthFlow={handleStartOAuthFlow}
            handleSaveMcpSecret={handleSaveMcpSecret}
            handleGetMcpSecret={handleGetMcpSecret}
            isPanelMaximized={isPanelMaximized}
            agentNodes={agentNodes}
            onUpdateAgent={handleUpdateSelectedAgent}
          />

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
              onStopGenerate={handleStopGenerate}
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
              hasChatTrigger={hasChatTrigger}
              chatConfig={chatTriggerConfig}
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
