/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useNodesState,
  useEdgesState,
  Background,
  MiniMap,
  Connection,
  Edge,
  Node,
  useReactFlow,
  BackgroundVariant,
} from '@xyflow/react';

import { 
  AgentData, 
  GenerationConfig, 
  ToolDefinition, 
  TriggerData, 
  TriggerType,
  AgentKind,
  PatternType,
  AgentFileTab,
  SampleWorkflowDefinition
} from './types';
import { INITIAL_NODES, INITIAL_EDGES } from './data/initialGraph';
import { 
  createSingleAgentNode, 
  createPatternNodesAndEdges,
  createSingleTriggerNode
} from './data/patterns';
import { AVAILABLE_TOOLS } from './data/defaultTools';
import { TRIGGER_CATALOG, DEFAULT_MOCK_TEST_PROMPTS } from './data/triggerDefinitions';
import { AgentNode } from './components/Canvas/nodes/AgentNode';
import { TriggerNode } from './components/Canvas/nodes/TriggerNode';
import { PaletteCard } from './components/Canvas/PaletteCard';
import { getLayoutedElements, layoutPatternAtDropPosition } from './utils/layout';
import { CodeGenerationPanel } from './components/codegen/CodeGenerationPanel';
import { generateCodeForGraph } from './components/codegen/codeGenerators';
import { AgentDrawer } from './components/inspector/AgentDrawer';
import { TriggerDrawer } from './components/inspector/TriggerDrawer';
import { AddToolModal } from './components/inspector/AddToolModal';
import { ToolPropertyDrawer } from './components/inspector/ToolPropertyDrawer';
import { MissingFeaturesModal } from './components/insights/MissingFeaturesModal';
import { VSCodeChrome } from './components/vscode/VSCodeChrome';
import { ThemeProvider } from './context/ThemeContext';
import { SettingsProvider, usePluginSettings } from './context/SettingsContext';
import { BridgeProvider, useBridgeContext } from './context/BridgeContext';
import { SettingsPage } from './components/settings/SettingsPage';
import { SAMPLES_CATALOG } from './data/sampleWorkflows';
import { AlertTriangle, X, Bot, Sparkles, Zap, Undo2, Redo2, LayoutGrid, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { useDiagramHistory } from './hooks/useDiagramHistory';
import { AgentWorkflowDocument, WorkflowNode, WorkflowEdge } from '../shared/types';

const nodeTypes = {
  agentNode: AgentNode,
  triggerNode: TriggerNode,
};

const STORAGE_TOOLS_KEY = 'ais_agent_studio_tools_v1';

function normalizeLoadedNodes(loadedNodes: any[]): Node<any>[] {
  if (!Array.isArray(loadedNodes)) return [];
  return loadedNodes.map((n) => {
    const isTrigger = n.type === 'trigger' || n.type === 'triggerNode';
    const type = isTrigger ? 'triggerNode' : 'agentNode';

    let data = { ...(n.data || {}) };
    if (isTrigger) {
      const triggerType = data.triggerType || data.triggerKind || 'tester';
      const normalizedTriggerType = triggerType === 'test' ? 'tester' : triggerType;
      data = {
        id: n.id,
        label: data.label || (normalizedTriggerType === 'tester' ? 'Test Suite Trigger' : 'Workflow Trigger'),
        triggerType: normalizedTriggerType,
        description: data.description || 'Workflow Trigger',
        config: data.config || data.testConfig || data.chatConfig || data.pubsubConfig || data.scheduledConfig || data.eventarcConfig || {},
        ...data,
      };
    } else {
      data = {
        id: n.id,
        label: data.label || 'Agent',
        agentKind: data.agentKind || 'standard',
        model: data.model || data.standardConfig?.model || 'gemini-2.5-flash',
        description: data.description || '',
        systemPrompt: data.systemPrompt || data.standardConfig?.systemInstruction || '',
        tools: data.tools || data.standardConfig?.tools || [],
        memoryType: data.memoryType || data.standardConfig?.memory || 'none',
        ...data,
      };
    }

    return {
      id: n.id,
      type: type,
      position: n.position && typeof n.position.x === 'number' && typeof n.position.y === 'number'
        ? n.position
        : { x: 100, y: 100 },
      data: data,
    };
  });
}

function normalizeLoadedEdges(loadedEdges: any[]): Edge[] {
  if (!Array.isArray(loadedEdges)) return [];
  return loadedEdges.map((e) => ({
    id: e.id || `e_${e.source}_${e.target}`,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle || null,
    targetHandle: e.targetHandle || null,
    label: typeof e.label === 'string' ? e.label : undefined,
    animated: e.animated !== undefined ? e.animated : true,
    style: e.style || (e.source.includes('trigger') ? { stroke: '#f59e0b', strokeWidth: 2 } : { stroke: '#3b82f6', strokeWidth: 2 }),
  }));
}

function FlowCanvas() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, zoomIn, zoomOut, fitView } = useReactFlow();
  const { settings, activeEditorTab, openSettings, openFlow, setActiveEditorTab } = usePluginSettings();
  const bridge = useBridgeContext();

  useEffect(() => {
    bridge.postMessage({ type: 'READY' });
  }, [bridge]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<any>>(INITIAL_NODES);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(INITIAL_EDGES);

  // Multi-tab .agent file tabs state
  const [fileTabs, setFileTabs] = useState<AgentFileTab[]>([
    {
      id: 'tab-main-workflow',
      filename: 'workflow.agent',
      title: 'workflow.agent',
      nodes: INITIAL_NODES,
      edges: INITIAL_EDGES,
      config: {
        framework: 'google_adk',
        language: 'python',
        outputFolder: './src/agents/',
        includeTests: true,
        includeDocker: false,
        useStreaming: true,
      },
    },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>('tab-main-workflow');
  const [newTabCounter, setNewTabCounter] = useState<number>(1);

  // Undo / Redo diagram history manager (isolated per active tab)
  const {
    canUndo,
    canRedo,
    undo,
    redo,
    recordSnapshot,
    initializeTabHistory,
  } = useDiagramHistory(INITIAL_NODES, INITIAL_EDGES, {
    activeTabId,
    maxHistory: 50,
  });

  // Tools library state (customizable tools catalog)
  const [tools, setTools] = useState<ToolDefinition[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_TOOLS_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Failed to load saved tools from localStorage:', e);
    }
    return AVAILABLE_TOOLS;
  });

  // Save tools to local storage on change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_TOOLS_KEY, JSON.stringify(tools));
    } catch (e) {
      console.warn('Failed to persist tools:', e);
    }
  }, [tools]);

  // Inspector & modal states
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedTriggerId, setSelectedTriggerId] = useState<string | null>(null);
  const [isTriggerDrawerOpen, setIsTriggerDrawerOpen] = useState<boolean>(false);
  const [toolModalAgentId, setToolModalAgentId] = useState<string | null>(null);
  const [isAdvisorOpen, setIsAdvisorOpen] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [validationWarning, setValidationWarning] = useState<string | null>(null);

  // Auto-dismiss validation warning after 5 seconds
  useEffect(() => {
    if (validationWarning) {
      const timer = setTimeout(() => setValidationWarning(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [validationWarning]);

  // Tool Property Drawer state
  const [editingTool, setEditingTool] = useState<ToolDefinition | null>(null);
  const [isToolDrawerOpen, setIsToolDrawerOpen] = useState<boolean>(false);

  // Resizable bottom panel state (Divider between diagram & bottom tabs)
  // Default is null to strictly maintain the 2/3 diagram (66.66%) and 1/3 tabs (33.33%) layout
  const [bottomPanelHeight, setBottomPanelHeight] = useState<number | null>(null);
  const [isPanelMaximized, setIsPanelMaximized] = useState<boolean>(false);
  const [isDraggingDivider, setIsDraggingDivider] = useState<boolean>(false);
  const panelContainerRef = useRef<HTMLDivElement | null>(null);

  const handleToggleMaximizePanel = useCallback(() => {
    setIsPanelMaximized((prev) => !prev);
  }, []);

  // Drag handler for panel divider
  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsPanelMaximized(false);
    if (panelContainerRef.current && bottomPanelHeight === null) {
      const rect = panelContainerRef.current.getBoundingClientRect();
      setBottomPanelHeight(rect.height * (1 / 3));
    }
    setIsDraggingDivider(true);
  }, [bottomPanelHeight]);

  useEffect(() => {
    if (!isDraggingDivider) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!panelContainerRef.current) return;
      const rect = panelContainerRef.current.getBoundingClientRect();
      const newHeight = rect.bottom - e.clientY;
      // Clamp between min 100px and max (containerHeight - 120px)
      const minHeight = 100;
      const maxHeight = rect.height - 130;
      const clampedHeight = Math.max(minHeight, Math.min(maxHeight, newHeight));
      setBottomPanelHeight(clampedHeight);
    };

    const handleMouseUp = () => {
      setIsDraggingDivider(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingDivider]);

  // Code Generation state
  const [hasGeneratedCode, setHasGeneratedCode] = useState<boolean>(false);
  const [config, setConfig] = useState<GenerationConfig>({
    framework: 'google_adk',
    language: 'python',
    outputFolder: './src/agents/',
    includeTests: true,
    includeDocker: false,
    useStreaming: true,
  });

  const [generatedFiles, setGeneratedFiles] = useState(() => 
    generateCodeForGraph(INITIAL_NODES, INITIAL_EDGES, {
      framework: 'google_adk',
      language: 'python',
      outputFolder: './src/agents/',
      includeTests: true,
      includeDocker: false,
      useStreaming: true,
    })
  );

  // Synchronize active tab in fileTabs state whenever nodes, edges, or config change
  useEffect(() => {
    setFileTabs((prev) =>
      prev.map((t) => (t.id === activeTabId ? { ...t, nodes, edges, config } : t))
    );
  }, [nodes, edges, config, activeTabId]);

  // Tab switching handler
  const handleSelectTab = useCallback(
    (tabId: string) => {
      if (tabId === activeTabId) return;

      const targetTab = fileTabs.find((t) => t.id === tabId);
      if (targetTab) {
        setActiveTabId(tabId);
        setNodes(targetTab.nodes);
        setEdges(targetTab.edges);
        setConfig(targetTab.config);
        setSelectedAgentId(targetTab.selectedAgentId || null);
        setSelectedTriggerId(targetTab.selectedTriggerId || null);
        setIsTriggerDrawerOpen(false);
        setIsToolDrawerOpen(false);
        setToolModalAgentId(null);

        // Regenerate code for graph
        setGeneratedFiles(generateCodeForGraph(targetTab.nodes, targetTab.edges, targetTab.config));

        setTimeout(() => {
          fitView({ padding: 0.2, duration: 400 });
        }, 60);
      }
    },
    [activeTabId, fileTabs, setNodes, setEdges, fitView]
  );

  // Open a sample workflow in a new .agent tab
  const handleOpenSampleInNewTab = useCallback(
    (sample: SampleWorkflowDefinition) => {
      const newTabId = `tab-${sample.id}-${Date.now()}`;
      const sampleConfig: GenerationConfig = {
        framework: sample.config?.framework || 'google_adk',
        language: sample.config?.language || 'python',
        outputFolder: sample.config?.outputFolder || `./src/${sample.id}_agent/`,
        includeTests: sample.config?.includeTests ?? true,
        includeDocker: sample.config?.includeDocker ?? true,
        useStreaming: sample.config?.useStreaming ?? true,
      };

      const newTab: AgentFileTab = {
        id: newTabId,
        filename: sample.filename,
        title: sample.name,
        nodes: sample.nodes,
        edges: sample.edges,
        config: sampleConfig,
        sampleId: sample.id,
      };

      setFileTabs((prev) => [...prev, newTab]);
      setActiveTabId(newTabId);
      setNodes(sample.nodes);
      setEdges(sample.edges);
      setConfig(sampleConfig);
      setSelectedAgentId(null);
      setSelectedTriggerId(null);
      setIsTriggerDrawerOpen(false);
      setIsToolDrawerOpen(false);
      setToolModalAgentId(null);
      setActiveEditorTab('flow');

      setGeneratedFiles(generateCodeForGraph(sample.nodes, sample.edges, sampleConfig));
      initializeTabHistory(newTabId, sample.nodes, sample.edges);

      setTimeout(() => {
        fitView({ padding: 0.2, duration: 500 });
      }, 100);
    },
    [setNodes, setEdges, setActiveEditorTab, fitView, initializeTabHistory]
  );

  // Create a new completely blank .agent file tab
  const handleNewTab = useCallback(() => {
    const num = newTabCounter;
    setNewTabCounter((c) => c + 1);
    const newTabId = `tab-untitled-${Date.now()}`;
    const defaultTabConfig: GenerationConfig = {
      framework: settings.defaultFramework || 'google_adk',
      language: settings.defaultLanguage || 'python',
      outputFolder: `./src/agents/agent_${num}/`,
      includeTests: true,
      includeDocker: false,
      useStreaming: settings.useStreamingByDefault ?? true,
    };

    // Blank diagram: empty nodes and edges
    const newNodes: Node<any>[] = [];
    const newEdges: Edge[] = [];

    const newTab: AgentFileTab = {
      id: newTabId,
      filename: `untitled-${num}.agent`,
      title: `untitled-${num}.agent`,
      nodes: newNodes,
      edges: newEdges,
      config: defaultTabConfig,
    };

    setFileTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTabId);
    setNodes(newNodes);
    setEdges(newEdges);
    setConfig(defaultTabConfig);
    setSelectedAgentId(null);
    setSelectedTriggerId(null);
    setIsTriggerDrawerOpen(false);
    setIsToolDrawerOpen(false);
    setToolModalAgentId(null);
    setActiveEditorTab('flow');

    initializeTabHistory(newTabId, newNodes, newEdges);
    setGeneratedFiles(generateCodeForGraph(newNodes, newEdges, defaultTabConfig));

    setTimeout(() => {
      fitView({ padding: 0.2, duration: 400 });
    }, 100);
  }, [newTabCounter, settings, setNodes, setEdges, setActiveEditorTab, fitView, initializeTabHistory]);

  // Undo diagram state
  const handleUndo = useCallback(() => {
    const prevState = undo();
    if (prevState) {
      setNodes(prevState.nodes);
      setEdges(prevState.edges);
      setSelectedAgentId(prevState.selectedAgentId || null);
      setSelectedTriggerId(prevState.selectedTriggerId || null);
      setGeneratedFiles(generateCodeForGraph(prevState.nodes, prevState.edges, config));
    }
  }, [undo, config, setNodes, setEdges]);

  // Redo diagram state
  const handleRedo = useCallback(() => {
    const nextState = redo();
    if (nextState) {
      setNodes(nextState.nodes);
      setEdges(nextState.edges);
      setSelectedAgentId(nextState.selectedAgentId || null);
      setSelectedTriggerId(nextState.selectedTriggerId || null);
      setGeneratedFiles(generateCodeForGraph(nextState.nodes, nextState.edges, config));
    }
  }, [redo, config, setNodes, setEdges]);

  // Global keyboard shortcuts for Undo / Redo (Ctrl+Z / Cmd+Z, Ctrl+Y / Cmd+Shift+Z)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Avoid hijacking undo/redo inside input/textarea/contenteditable
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
      const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      if (isCmdOrCtrl && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if (isCmdOrCtrl && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  // Close an open tab
  const handleCloseTab = useCallback(
    (tabId: string) => {
      const index = fileTabs.findIndex((t) => t.id === tabId);
      if (index === -1) return;

      const newTabs = fileTabs.filter((t) => t.id !== tabId);

      if (tabId === activeTabId) {
        if (newTabs.length > 0) {
          const nextTab = index > 0 ? newTabs[index - 1] : newTabs[0];
          setActiveTabId(nextTab.id);
          setNodes(nextTab.nodes);
          setEdges(nextTab.edges);
          setConfig(nextTab.config);
          setSelectedAgentId(nextTab.selectedAgentId || null);
          setSelectedTriggerId(nextTab.selectedTriggerId || null);
          setGeneratedFiles(generateCodeForGraph(nextTab.nodes, nextTab.edges, nextTab.config));
        } else {
          // Reset to default fresh workflow.agent
          const defaultTab: AgentFileTab = {
            id: `tab-workflow-${Date.now()}`,
            filename: 'workflow.agent',
            title: 'workflow.agent',
            nodes: INITIAL_NODES,
            edges: INITIAL_EDGES,
            config: {
              framework: 'google_adk',
              language: 'python',
              outputFolder: './src/agents/',
              includeTests: true,
              includeDocker: false,
              useStreaming: true,
            },
          };
          newTabs.push(defaultTab);
          setActiveTabId(defaultTab.id);
          setNodes(INITIAL_NODES);
          setEdges(INITIAL_EDGES);
          setConfig(defaultTab.config);
          setGeneratedFiles(generateCodeForGraph(INITIAL_NODES, INITIAL_EDGES, defaultTab.config));
        }
      }

      setFileTabs(newTabs);
    },
    [fileTabs, activeTabId, setNodes, setEdges]
  );

  // Agent node handlers
  const handleEditAgent = useCallback((id: string) => {
    setSelectedAgentId(id);
    setSelectedTriggerId(null);
    setIsTriggerDrawerOpen(false);
    setIsToolDrawerOpen(false);
  }, []);

  const handleDeleteAgent = useCallback(
    (id: string) => {
      const nextNodes = nodes.filter((n) => n.id !== id);
      const nextEdges = edges.filter((e) => e.source !== id && e.target !== id);
      setNodes(nextNodes);
      setEdges(nextEdges);
      if (selectedAgentId === id) setSelectedAgentId(null);
      recordSnapshot(nextNodes, nextEdges, { description: 'Delete agent' });
    },
    [selectedAgentId, nodes, edges, setNodes, setEdges, recordSnapshot]
  );

  const handleOpenAddTool = useCallback((id: string) => {
    setToolModalAgentId(id);
  }, []);

  const handleAddSpecificTool = useCallback(
    (agentId: string, tool: ToolDefinition) => {
      let updated = false;
      const nextNodes = nodes.map((n) => {
        if (n.id === agentId && n.type === 'agentNode') {
          const currentTools = (n.data as AgentData).tools || [];
          if (!currentTools.some((t) => t.id === tool.id)) {
            updated = true;
            return {
              ...n,
              data: {
                ...n.data,
                tools: [...currentTools, tool],
              },
            };
          }
        }
        return n;
      });
      if (updated) {
        setNodes(nextNodes);
        recordSnapshot(nextNodes, edges, { description: `Attach ${tool.name}` });
      }
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
    (agentId: string, newOrder: any[]) => {
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
    (agentId: string, pattern: any) => {
      const nextNodes = nodes.map((n) => {
        if (n.id === agentId && n.type === 'agentNode') {
          return {
            ...n,
            data: {
              ...n.data,
              subAgentPattern: pattern,
            },
          };
        }
        return n;
      });
      setNodes(nextNodes);
      recordSnapshot(nextNodes, edges, { description: 'Update sub-agent pattern' });
    },
    [nodes, edges, setNodes, recordSnapshot]
  );

  // Trigger Node handlers
  const handleEditTrigger = useCallback((triggerId: string) => {
    setSelectedTriggerId(triggerId);
    setIsTriggerDrawerOpen(true);
    setSelectedAgentId(null);
    setIsToolDrawerOpen(false);
  }, []);

  const handleDeleteTrigger = useCallback((triggerId: string) => {
    const nextNodes = nodes.filter((n) => n.id !== triggerId);
    const nextEdges = edges.filter((e) => e.source !== triggerId && e.target !== triggerId);
    setNodes(nextNodes);
    setEdges(nextEdges);
    if (selectedTriggerId === triggerId) {
      setSelectedTriggerId(null);
      setIsTriggerDrawerOpen(false);
    }
    recordSnapshot(nextNodes, nextEdges, { description: 'Delete trigger' });
  }, [selectedTriggerId, nodes, edges, setNodes, setEdges, recordSnapshot]);

  const docVersionRef = useRef(1);
  const isLoadedRef = useRef(false);
  const lastSentJsonRef = useRef<string>('');

  // Synchronize document from extension host when file is opened
  useEffect(() => {
    const unsub = bridge.subscribe('LOAD_DOCUMENT', (payload) => {
      if (!payload?.document) return;
      console.log('[FlowCanvas] Received LOAD_DOCUMENT:', payload.document);

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

        // Record initial loaded JSON to prevent immediately sending a duplicate back
        const loadedJson = JSON.stringify({
          version: doc.version || '1.0.0',
          name: doc.name || 'agent_workflow',
          description: doc.description || 'Agent Workflow Document',
          framework: doc.framework || 'google-adk',
          language: doc.language || 'python',
          nodes: normNodes.map((n) => ({ id: n.id, type: n.type, position: { x: Math.round(n.position.x), y: Math.round(n.position.y) }, data: { ...n.data } })),
          edges: normEdges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle, type: e.type, animated: e.animated, data: e.data })),
          metadata: doc.metadata || {},
        });
        lastSentJsonRef.current = loadedJson;
      }

      if (doc.framework || doc.language) {
        setConfig((prev) => ({
          ...prev,
          framework: doc.framework === 'google-adk' ? 'google_adk' : (doc.framework as any) || prev.framework,
          language: doc.language || prev.language,
        }));
      }

      // Enable real-time document synchronization to VS Code text buffer after initial load
      setTimeout(() => {
        isLoadedRef.current = true;
      }, 100);
    });

    return () => unsub();
  }, [bridge, setNodes, setEdges, recordSnapshot]);

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

  // Keyboard shortcut listener to delete selected node(s) with Delete or Backspace
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedAgentId) {
          e.preventDefault();
          handleDeleteAgent(selectedAgentId);
        } else if (selectedTriggerId) {
          e.preventDefault();
          handleDeleteTrigger(selectedTriggerId);
        } else {
          const selectedNodes = nodes.filter((n) => n.selected);
          if (selectedNodes.length > 0) {
            e.preventDefault();
            selectedNodes.forEach((node) => {
              if (node.type === 'triggerNode') {
                handleDeleteTrigger(node.id);
              } else {
                handleDeleteAgent(node.id);
              }
            });
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedAgentId, selectedTriggerId, nodes, handleDeleteAgent, handleDeleteTrigger]);

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

  // Calculate the current single root agent ID based on existing connected triggers
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
    setNodes((nds) => {
      let hasChanges = false;
      const targetId = triggerTargetAgentId;

      const updated = nds.map((n) => {
        if (n.type === 'agentNode') {
          // If triggers are attached, only the targeted agent is start node
          // If no triggers are attached to any agent, preserve current or default first agent as start
          const shouldBeStart = targetId ? n.id === targetId : n.data.isStartNode;
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

  // React Flow Connection Validation:
  // Once a node has a trigger attached, you cannot add triggers to any other agents
  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      if (!connection.source || !connection.target) return false;
      const sourceNode = nodes.find((n) => n.id === connection.source);
      const targetNode = nodes.find((n) => n.id === connection.target);

      // If source is a trigger node
      if (sourceNode?.type === 'triggerNode') {
        // Triggers can only connect to Agent nodes
        if (targetNode?.type !== 'agentNode') return false;

        // Check if triggers are ALREADY attached to a DIFFERENT agent node
        const triggerNodes = nodes.filter((n) => n.type === 'triggerNode');
        const existingTriggerEdges = edges.filter(
          (e) => triggerNodes.some((tn) => tn.id === e.source) && e.source !== connection.source
        );
        const existingRootTargets = Array.from(new Set(existingTriggerEdges.map((e) => e.target)));

        // If another agent already has triggers, disallow connecting to this different agent
        if (existingRootTargets.length > 0 && !existingRootTargets.includes(connection.target)) {
          return false;
        }
      }

      return true;
    },
    [nodes, edges]
  );

  // Reconnect all triggers to a designated root agent
  const reconnectTriggersToRoot = useCallback((rootAgentId: string) => {
    // 1. Update all agent nodes so only rootAgentId is start node
    setNodes((nds) =>
      nds.map((n) => {
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

    // 2. Update edges: remove old trigger edges, create clean ones to new root
    setEdges((eds) => {
      // Find all current trigger node IDs
      const triggerNodes = nodes.filter((n) => n.type === 'triggerNode');
      const nonTriggerEdges = eds.filter((e) => !triggerNodes.some((tn) => tn.id === e.source));
      
      const newTriggerEdges: Edge[] = triggerNodes.map((tn) => {
        const isTester = (tn.data as TriggerData)?.triggerType === 'tester';
        return {
          id: `e_trigger_${tn.id}_${rootAgentId}`,
          source: tn.id,
          sourceHandle: isTester ? 'trigger_out_right' : 'trigger_out_bottom',
          target: rootAgentId,
          targetHandle: isTester ? 'input_left' : 'input',
          animated: true,
          label: isTester ? 'Test Suite Inbound' : 'Trigger Invocation',
          style: {
            stroke: isTester ? '#ec4899' : '#f59e0b',
            strokeWidth: 2,
            strokeDasharray: '5 5',
          },
        };
      });

      return [...nonTriggerEdges, ...newTriggerEdges];
    });
  }, [nodes, setNodes, setEdges]);

  // Bind node action callbacks
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
    handleEditTrigger,
    handleDeleteTrigger
  ]);

  // On edge connect
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

        // Validation: Check if another agent node already has triggers attached
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

        // Trigger can connect to this root agent
        const isTester = (sourceNode.data as TriggerData)?.triggerType === 'tester';
        const newTriggerEdge: Edge = {
          ...connection,
          id: `e_trigger_${connection.source}_${connection.target}`,
          source: connection.source!,
          sourceHandle: connection.sourceHandle || (isTester ? 'trigger_out_right' : 'trigger_out_bottom'),
          target: connection.target,
          targetHandle: connection.targetHandle || (isTester ? 'input_left' : 'input'),
          animated: true,
          label: isTester ? 'Test Suite Inbound' : 'Trigger Invocation',
          style: {
            stroke: isTester ? '#ec4899' : '#f59e0b',
            strokeWidth: 2,
            strokeDasharray: '5 5',
          },
        };

        const nextEdges = [...edges.filter((e) => e.source !== connection.source), newTriggerEdge];
        setEdges(nextEdges);
        recordSnapshot(nodes, nextEdges, { description: 'Connect trigger' });
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
          label: matchingBranch?.label ? `Route: ${matchingBranch.label}` : `Branch Route #${matchingBranchIdx + 1}`,
          style: { stroke: '#a855f7', strokeWidth: 2 },
          targetHandle: connection.targetHandle || 'input',
        } as Edge;

        // Replace any existing edge from this specific router branch handle
        const nextEdges = [
          ...edges.filter((e) => !(e.source === connection.source && e.sourceHandle === connection.sourceHandle)),
          newEdge,
        ];
        setEdges(nextEdges);

        // Update the router node's branch to record targetAgentId
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
        label: isSubAgentConnection ? 'Sub-Agent Link' : 'Next Step',
        style: isSubAgentConnection
          ? { stroke: '#f59e0b', strokeWidth: 2, strokeDasharray: '4 4' }
          : { stroke: '#3b82f6', strokeWidth: 2 },
      } as Edge;

      const nextEdges = addEdge(newEdge, edges);
      setEdges(nextEdges);

      let nextNodes = nodes;
      // If linking sub-agent, update parent agent's subAgents array
      if (isSubAgentConnection && connection.source && connection.target) {
        const targetNode = nodes.find((n) => n.id === connection.target);
        if (targetNode && targetNode.type === 'agentNode') {
          nextNodes = nodes.map((n) => {
            if (n.id === connection.source && n.type === 'agentNode') {
              const existing = (n.data as AgentData).subAgents || [];
              if (!existing.some((s) => s.agentId === connection.target)) {
                return {
                  ...n,
                  data: {
                    ...n.data,
                    subAgents: [
                      ...existing,
                      {
                        agentId: targetNode.id,
                        name: targetNode.data.label,
                        role: targetNode.data.role,
                        delegationType: 'parallel',
                      },
                    ],
                  },
                };
              }
            }
            return n;
          });
          setNodes(nextNodes);
        }
      }
      recordSnapshot(nextNodes, nextEdges, { description: 'Connect agents' });
    },
    [nodes, edges, setEdges, setNodes, reconnectTriggersToRoot, recordSnapshot]
  );

  // Tool Drawer Actions
  const handleOpenEditTool = useCallback((tool: ToolDefinition) => {
    setEditingTool(tool);
    setIsToolDrawerOpen(true);
    setSelectedAgentId(null);
    setSelectedTriggerId(null);
    setIsTriggerDrawerOpen(false);
  }, []);

  const handleCreateCustomTool = useCallback(() => {
    const newTool: ToolDefinition = {
      id: `tool_custom_${Date.now()}`,
      name: 'Custom API Tool',
      type: 'api',
      description: 'Custom external API integration or web service.',
      codePrompt: 'Call the Twitter/X or external API endpoint with required parameters and return parsed JSON data.',
      endpointUrl: 'https://api.example.com/v1/resource',
      authKeyEnv: 'API_SECRET_KEY',
      parameters: {
        query: 'string - search query or resource identifier',
      },
      enabled: true,
    };
    setEditingTool(newTool);
    setIsToolDrawerOpen(true);
    setSelectedAgentId(null);
    setSelectedTriggerId(null);
    setIsTriggerDrawerOpen(false);
  }, []);

  const handleCreateMcpTool = useCallback(() => {
    const newMcpTool: ToolDefinition = {
      id: `tool_mcp_${Date.now()}`,
      name: 'New MCP Server',
      type: 'mcp',
      description: 'Model Context Protocol (MCP) server providing tools and resources.',
      codePrompt: 'Connect to MCP server via stdio/sse and invoke exposed tool capabilities.',
      enabled: true,
      mcpConfig: {
        serverName: 'custom-mcp-server',
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-everything'],
        envVars: {
          MCP_AUTH_TOKEN: 'your-token-if-needed',
        },
        exposedTools: ['*'],
        autoApproveTools: ['read_*'],
      },
    };
    setEditingTool(newMcpTool);
    setIsToolDrawerOpen(true);
    setSelectedAgentId(null);
    setSelectedTriggerId(null);
    setIsTriggerDrawerOpen(false);
  }, []);

  const handleSaveTool = useCallback((savedTool: ToolDefinition) => {
    setTools((prev) => {
      const exists = prev.some((t) => t.id === savedTool.id);
      if (exists) {
        return prev.map((t) => (t.id === savedTool.id ? savedTool : t));
      }
      return [savedTool, ...prev];
    });

    // Synchronize to any agent nodes holding this tool
    setNodes((nds) =>
      nds.map((n) => {
        if (n.type === 'agentNode') {
          const agentData = n.data as AgentData;
          const hasTool = agentData.tools?.some((t) => t.id === savedTool.id);
          if (hasTool) {
            return {
              ...n,
              data: {
                ...n.data,
                tools: agentData.tools.map((t) => (t.id === savedTool.id ? savedTool : t)),
              },
            };
          }
        }
        return n;
      })
    );
  }, [setNodes]);

  const handleDeleteTool = useCallback((toolId: string) => {
    setTools((prev) => prev.filter((t) => t.id !== toolId));
    setNodes((nds) =>
      nds.map((n) => {
        if (n.type === 'agentNode') {
          const agentData = n.data as AgentData;
          return {
            ...n,
            data: {
              ...n.data,
              tools: (agentData.tools || []).filter((t) => t.id !== toolId),
            },
          };
        }
        return n;
      })
    );
  }, [setNodes]);

  // Drag & Drop onto canvas
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow/type');
      const isPattern = event.dataTransfer.getData('application/reactflow/isPattern') === 'true';
      const agentKind = event.dataTransfer.getData('application/reactflow/agentKind') as AgentKind | undefined;
      const triggerType = event.dataTransfer.getData('application/reactflow/triggerType') as TriggerType | undefined;
      const toolDataStr = event.dataTransfer.getData('application/reactflow/tool');

      // If dropped tool on canvas and an agent is selected, attach tool
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

      // Handling Trigger drop: Auto-connect to root agent
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
            label: isTester ? 'Test Suite Inbound' : 'Trigger Invocation',
            style: {
              stroke: isTester ? '#ec4899' : '#f59e0b',
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
        const newNode = createSingleAgentNode(
          position.x, 
          position.y, 
          undefined, 
          undefined, 
          agentKind || 'standard',
          {
            model: settings.defaultModel,
            temperature: settings.defaultTemperature,
            memoryType: settings.defaultMemoryType,
            subAgentPattern: settings.defaultSubAgentPattern,
          }
        );
        const nextNodes = [...nodes, newNode];
        setNodes(nextNodes);
        recordSnapshot(nextNodes, edges, { description: `Add agent` });
      }
    },
    [screenToFlowPosition, setNodes, setEdges, selectedAgentId, handleAddSpecificTool, nodes, edges, settings, recordSnapshot]
  );

  // Add Root Agent with Test Suite Trigger (no sub-agents)
  const handleAddRootWithTestSuite = useCallback(() => {
    const starterAgent = createSingleAgentNode(420, 160, 'Root Agent', undefined, 'standard', {
      model: settings.defaultModel,
      temperature: settings.defaultTemperature,
      maxIterations: settings.defaultMaxIterations,
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
      label: 'Test Suite Inbound',
      style: {
        stroke: '#ec4899',
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

  // Add agent directly from palette click
  const handleAddAgentDirect = useCallback((kind: AgentKind = 'standard') => {
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
    const nextNodes = [...nodes, newNode];
    setNodes(nextNodes);
    recordSnapshot(nextNodes, edges, { description: `Add agent` });
  }, [nodes, edges, setNodes, settings, recordSnapshot]);

  // Add pattern directly from palette click
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

  // Add trigger directly from palette click
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
          label: isTester ? 'Test Suite Inbound' : 'Trigger Invocation',
          style: {
            stroke: isTester ? '#ec4899' : '#f59e0b',
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

  // Node Drag Stop handler for undo/redo position snapshotting
  const handleNodeDragStop = useCallback(() => {
    recordSnapshot(nodes, edges, { description: 'Move element' });
  }, [nodes, edges, recordSnapshot]);

  // Auto Layout
  const handleAutoLayout = useCallback(
    (direction: 'LR' | 'TB' = 'TB') => {
      const layouted = getLayoutedElements(nodes, edges, direction);
      setNodes([...layouted.nodes]);
      setEdges([...layouted.edges]);
      recordSnapshot(layouted.nodes, layouted.edges, { description: 'Auto-layout diagram' });
      setTimeout(() => fitView({ padding: 0.2 }), 50);
    },
    [nodes, edges, setNodes, setEdges, fitView, recordSnapshot]
  );

  // Trigger Code Generation
  const handleTriggerGenerate = useCallback(() => {
    setIsGenerating(true);
    setTimeout(() => {
      const files = generateCodeForGraph(nodes, edges, config);
      setGeneratedFiles(files);
      setIsGenerating(false);
      setHasGeneratedCode(true);
    }, 350);
  }, [nodes, edges, config]);

  // Keep code in sync if framework or language changes
  const handleUpdateConfig = useCallback((newConf: Partial<GenerationConfig>) => {
    setConfig((prev) => {
      const updated = { ...prev, ...newConf };
      const files = generateCodeForGraph(nodes, edges, updated);
      setGeneratedFiles(files);
      return updated;
    });
  }, [nodes, edges]);

  // Selected agent update with root agent auto-reconnect & router branch lines sync
  const selectedAgentNode = nodes.find((n) => n.id === selectedAgentId && n.type === 'agentNode');
  const handleUpdateSelectedAgent = useCallback(
    (partialData: Partial<AgentData>) => {
      if (!selectedAgentId) return;

      let nextNodes: Node<any>[];
      if (partialData.isStartNode === true) {
        // If making this agent the root, reconnect triggers
        reconnectTriggersToRoot(selectedAgentId);
        nextNodes = nodes.map((n) => (n.id === selectedAgentId ? { ...n, data: { ...n.data, ...partialData, isStartNode: true } } : n));
      } else {
        nextNodes = nodes.map((n) => (n.id === selectedAgentId ? { ...n, data: { ...n.data, ...partialData } } : n));
      }
      setNodes(nextNodes);

      let nextEdges = edges;
      // If updating routerConfig, automatically synchronize connecting lines from router branches
      if (partialData.routerConfig) {
        const branches = partialData.routerConfig.branches || [];
        const currentSelectedId = selectedAgentId;

        // Filter out existing edges from this router node
        const preservedEdges = edges.filter((e) => e.source !== currentSelectedId);

        // Build new edges for branches with a targetAgentId
        const newBranchEdges: Edge[] = [];
        branches.forEach((b, idx) => {
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
                label: b.label ? `Route: ${b.label}` : `Branch Route #${idx + 1}`,
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

  // Selected trigger
  const selectedTriggerNode = nodes.find((n) => n.id === selectedTriggerId && n.type === 'triggerNode');
  
  // Test Suite Trigger detection & test prompts
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

  // Add tool to selected or target agent
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
            onNodeClick={(_, node) => {
              if (node.type === 'triggerNode') {
                const triggerData = node.data as TriggerData;
                if (triggerData?.triggerType === 'chat') {
                  // Chat trigger: do nothing
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
            onNodesDelete={handleNodesDelete}
            deleteKeyCode={['Backspace', 'Delete']}
            fitView
            proOptions={{ hideAttribution: true }}
            minZoom={0.2}
            maxZoom={2.5}
          >
            <Background color="#333333" gap={18} size={1.2} variant={BackgroundVariant.Dots} />
          </ReactFlow>

          {/* TOP-RIGHT CANVAS CONTROLS & MINIMAP */}
          <div className="absolute top-3 right-3 z-20 flex flex-col items-end gap-2 pointer-events-auto">
            {/* Control Button Toolbar Strip */}
            <div className="flex items-center gap-1 p-1 bg-[#161b22]/95 backdrop-blur-md border border-[#30363d] rounded-lg shadow-xl text-xs text-[#c9d1d9]">
              {/* Undo */}
              <button
                type="button"
                onClick={handleUndo}
                disabled={!canUndo}
                title="Undo (Cmd+Z)"
                className="p-1.5 rounded hover:bg-[#21262d] disabled:opacity-30 disabled:cursor-not-allowed text-gray-300 hover:text-white transition-colors cursor-pointer"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>

              {/* Redo */}
              <button
                type="button"
                onClick={handleRedo}
                disabled={!canRedo}
                title="Redo (Cmd+Shift+Z)"
                className="p-1.5 rounded hover:bg-[#21262d] disabled:opacity-30 disabled:cursor-not-allowed text-gray-300 hover:text-white transition-colors cursor-pointer"
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>

              <div className="w-px h-4 bg-[#30363d] my-auto" />

              {/* Auto Layout Left-to-Right */}
              <button
                type="button"
                onClick={() => handleAutoLayout('LR')}
                title="Auto Layout (Horizontal LR)"
                className="flex items-center gap-1 px-2 py-1 rounded hover:bg-[#21262d] text-gray-300 hover:text-white font-medium text-[11px] transition-colors cursor-pointer"
              >
                <LayoutGrid className="w-3.5 h-3.5 text-blue-400" />
                <span>Layout (L-R)</span>
              </button>

              {/* Auto Layout Top-to-Bottom */}
              <button
                type="button"
                onClick={() => handleAutoLayout('TB')}
                title="Auto Layout (Vertical TB)"
                className="flex items-center gap-1 px-2 py-1 rounded hover:bg-[#21262d] text-gray-300 hover:text-white font-medium text-[11px] transition-colors cursor-pointer"
              >
                <LayoutGrid className="w-3.5 h-3.5 text-purple-400 rotate-90" />
                <span>Layout (T-B)</span>
              </button>

              <div className="w-px h-4 bg-[#30363d] my-auto" />

              {/* Zoom In */}
              <button
                type="button"
                onClick={() => zoomIn()}
                title="Zoom In"
                className="p-1.5 rounded hover:bg-[#21262d] text-gray-300 hover:text-white transition-colors cursor-pointer"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>

              {/* Zoom Out */}
              <button
                type="button"
                onClick={() => zoomOut()}
                title="Zoom Out"
                className="p-1.5 rounded hover:bg-[#21262d] text-gray-300 hover:text-white transition-colors cursor-pointer"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>

              {/* Fit View */}
              <button
                type="button"
                onClick={() => fitView({ padding: 0.2 })}
                title="Fit View to Screen"
                className="p-1.5 rounded hover:bg-[#21262d] text-gray-300 hover:text-white transition-colors cursor-pointer"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* MiniMap Positioned Directly Under Controls */}
            {settings.showMiniMap && (
              <MiniMap
                nodeColor={(n) => {
                  if (n.type === 'triggerNode') return '#f59e0b';
                  const data = n.data as AgentData;
                  if (data?.isStartNode) return '#3b82f6';
                  if (data?.isEvaluator) return '#a855f7';
                  if (data?.agentKind === 'a2a') return '#06b6d4';
                  return '#10b981';
                }}
                nodeStrokeWidth={2}
                className="!static !m-0 !h-[110px] !w-[170px] border border-[#30363d] rounded-lg shadow-xl overflow-hidden"
                maskColor="rgba(0, 0, 0, 0.65)"
              />
            )}
          </div>

          {/* Empty Diagram State */}
          {nodes.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
              <div className="text-center p-6 rounded-2xl bg-[#1e1e1e]/80 border border-[#333333] shadow-2xl backdrop-blur-md max-w-sm pointer-events-auto">
                <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center mx-auto mb-3 text-blue-400">
                  <Bot className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-semibold text-white mb-1">Blank Agent Canvas</h3>
                <p className="text-xs text-gray-400 mb-4 leading-relaxed">
                  Start building by clicking or dragging an agent, pattern, or trigger from the palette on the left.
                </p>
                <div className="flex items-center justify-center">
                  <button
                    type="button"
                    onClick={handleAddRootWithTestSuite}
                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors shadow-sm cursor-pointer flex items-center gap-1.5"
                  >
                    <Bot className="w-4 h-4" />
                    Add Root Engine
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Validation Warning Toast */}
          {validationWarning && (
            <div className="absolute top-4 right-4 z-50 max-w-md bg-[#161b22]/95 border border-amber-500/60 text-amber-200 rounded-xl p-3.5 shadow-2xl backdrop-blur-md flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="p-1 rounded bg-amber-500/20 text-amber-400 shrink-0 mt-0.5">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold text-white mb-0.5">Diagram Validation</div>
                <div className="text-xs text-amber-200/90 leading-relaxed">{validationWarning}</div>
              </div>
              <button
                type="button"
                onClick={() => setValidationWarning(null)}
                className="text-gray-400 hover:text-white p-1 rounded-md transition-colors shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Floating Node, Tools, Triggers & Samples Palette on Left */}
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

          {/* Slide-out Tool Definition & Code Directive Property Panel */}
          <ToolPropertyDrawer
            tool={editingTool}
            isOpen={isToolDrawerOpen}
            onClose={() => setIsToolDrawerOpen(false)}
            onSaveTool={handleSaveTool}
            onDeleteTool={handleDeleteTool}
            selectedAgent={selectedAgentNode ? (selectedAgentNode.data as AgentData) : null}
            onAttachToAgent={(agentId, tool) => {
              handleAddSpecificTool(agentId, tool);
              setIsToolDrawerOpen(false);
            }}
          />
        </div>

        {/* ADJUSTABLE RESIZING DIVIDER */}
        <div
          onMouseDown={handleDividerMouseDown}
          onDoubleClick={() => {
            if (bottomPanelHeight === null) {
              if (panelContainerRef.current) {
                setBottomPanelHeight(panelContainerRef.current.getBoundingClientRect().height * 0.55);
              }
            } else {
              setBottomPanelHeight(null); // Reset back to default 1/3 (33.333%)
            }
          }}
          title="Drag to resize panel. Double-click to toggle between 1/3 default and expanded height."
          className={`h-2 relative w-full bg-[#161b22] hover:bg-blue-600 cursor-row-resize items-center justify-center transition-all z-30 group select-none shrink-0 border-t border-b border-[#30363d] ${
            isPanelMaximized ? 'hidden' : 'flex'
          } ${isDraggingDivider ? 'bg-blue-500 ring-2 ring-blue-500/50' : ''}`}
        >
          {/* Grab Handle Pill */}
          <div className="w-12 h-1 rounded-full bg-[#484f58] group-hover:bg-white group-active:bg-white transition-colors" />
          
          {/* Floating resize indicator on hover */}
          <div className="hidden group-hover:flex items-center gap-2 absolute right-3 text-[10px] font-mono text-white/90 bg-[#0d1117] px-2 py-0.5 rounded border border-[#30363d] shadow-lg pointer-events-none">
            <span>{bottomPanelHeight !== null ? `${Math.round(bottomPanelHeight)}px` : '33.3% (1/3)'}</span>
            <span className="text-gray-400">· Drag or double-click</span>
          </div>
        </div>

        {/* BOTTOM PANEL: CODE GENERATION, DEPLOYMENT & TEST RUNNER TAB INTERFACE */}
        <div 
          style={{ 
            height: isPanelMaximized 
              ? '100%' 
              : (bottomPanelHeight !== null ? `${bottomPanelHeight}px` : '33.333%') 
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
      />

      {/* Architectural Advisor & "What is missing?" Modal */}
      <MissingFeaturesModal
        isOpen={isAdvisorOpen}
        onClose={() => setIsAdvisorOpen(false)}
      />
    </div>
  );
}

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
