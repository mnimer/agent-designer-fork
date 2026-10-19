/**
 * useFileTabs.ts - Multi-Tab Workspace State and Document Buffer Hook
 *
 * Purpose:
 * Manages multiple open .agent workflow files within the visual editor, providing
 * mechanisms to create new tabs, open sample templates, switch between active tabs,
 * close tabs, and synchronize in-memory tab state with canvas graph mutations.
 *
 * Architectural Decisions:
 * - Author: Mike Nimer <mikenimer@google.com>
 * - Per-Tab Document Isolation: Each tab preserves its own independent nodes, edges,
 *   generation configuration, and selection states.
 * - Active Buffer Synchronization: Changes occurring on the active canvas (nodes, edges, config)
 *   are automatically mapped back to the active tab in `fileTabs` to avoid data loss on tab switches.
 * - Clean Fallback on Close: Closing the last open tab restores a pristine default workflow tab
 *   rather than leaving the editor in an unrendered state.
 */

import { useState, useCallback, useEffect } from 'react';
import { Node, Edge } from '@xyflow/react';
import { AgentFileTab, GenerationConfig, SampleWorkflowDefinition, GeneratedFile } from '../types';
import { INITIAL_NODES, INITIAL_EDGES } from '../data/initialGraph';
import { generateCodeForGraph } from '../components/codegen/codeGenerators';
import { resolveAgentOutputFolder, normalizeLoadedNodes, normalizeLoadedEdges } from '../utils/workflowSync';

export interface UseFileTabsOptions {
  defaultFramework?: string;
  defaultLanguage?: string;
  useStreamingByDefault?: boolean;
  fitView: (options?: { padding?: number; duration?: number }) => void;
  initializeTabHistory: (tabId: string, nodes: Node<any>[], edges: Edge[]) => void;
  setNodes: (nodes: Node<any>[]) => void;
  setEdges: (edges: Edge[]) => void;
  setConfig: React.Dispatch<React.SetStateAction<GenerationConfig>>;
  setGeneratedFiles: React.Dispatch<React.SetStateAction<GeneratedFile[]>>;
  setSelectedAgentId: (id: string | null) => void;
  setSelectedTriggerId: (id: string | null) => void;
  setIsTriggerDrawerOpen: (open: boolean) => void;
  setIsToolDrawerOpen: (open: boolean) => void;
  setToolModalAgentId: (id: string | null) => void;
  setActiveEditorTab: (tab: 'flow' | 'code' | 'settings') => void;
  onStopLocalRunner?: () => void;
}

export interface UseFileTabsResult {
  fileTabs: AgentFileTab[];
  setFileTabs: React.Dispatch<React.SetStateAction<AgentFileTab[]>>;
  activeTabId: string;
  setActiveTabId: React.Dispatch<React.SetStateAction<string>>;
  activeTab: AgentFileTab | undefined;
  handleSelectTab: (tabId: string) => void;
  handleOpenSampleInNewTab: (sample: SampleWorkflowDefinition) => void;
  handleNewTab: () => void;
  handleCloseTab: (tabId: string) => void;
}

/**
 * Custom hook to manage multi-tab documents and file buffers in the visual designer.
 */
export function useFileTabs(
  nodes: Node<any>[],
  edges: Edge[],
  config: GenerationConfig,
  options: UseFileTabsOptions
): UseFileTabsResult {
  const {
    defaultFramework,
    defaultLanguage,
    useStreamingByDefault,
    fitView,
    initializeTabHistory,
    setNodes,
    setEdges,
    setConfig,
    setGeneratedFiles,
    setSelectedAgentId,
    setSelectedTriggerId,
    setIsTriggerDrawerOpen,
    setIsToolDrawerOpen,
    setToolModalAgentId,
    setActiveEditorTab,
    onStopLocalRunner,
  } = options;

  // Pre-hydration from injected initial document
  const initialDoc =
    typeof window !== 'undefined' && (window as any).__INITIAL_AGENT_DOCUMENT__
      ? (window as any).__INITIAL_AGENT_DOCUMENT__
      : null;
  const initialFilePath =
    typeof window !== 'undefined' && (window as any).__INITIAL_AGENT_FILE_PATH__
      ? (window as any).__INITIAL_AGENT_FILE_PATH__
      : '';
  const initialFileName = initialFilePath
    ? initialFilePath.split('/').filter(Boolean).pop() || initialFilePath
    : initialDoc?.name
    ? `${initialDoc.name}.agent`
    : 'workflow.agent';
  const initialOutputFolder = resolveAgentOutputFolder(
    initialDoc?.deployment?.outputFolder || (initialDoc?.metadata as any)?.outputFolder,
    initialFileName
  );

  // Initialize tabs with default or pre-hydrated workflow document
  const [fileTabs, setFileTabs] = useState<AgentFileTab[]>([
    {
      id: 'tab-main-workflow',
      filename: initialFileName,
      title: initialFileName,
      nodes: initialDoc && Array.isArray(initialDoc.nodes) ? normalizeLoadedNodes(initialDoc.nodes) : INITIAL_NODES,
      edges: initialDoc && Array.isArray(initialDoc.edges) ? normalizeLoadedEdges(initialDoc.edges) : INITIAL_EDGES,
      config: {
        framework: (initialDoc?.deployment?.framework === 'google-adk' ? 'google_adk' : (initialDoc?.deployment?.framework || (initialDoc?.framework === 'google-adk' ? 'google_adk' : initialDoc?.framework) || defaultFramework || 'google_adk')) as any,
        language: (initialDoc?.deployment?.language || initialDoc?.language || defaultLanguage || 'python') as any,
        outputFolder: initialOutputFolder,
        deploymentTarget: (initialDoc?.deployment?.target || initialDoc?.deployment?.deploymentTarget || (initialDoc?.metadata as any)?.deploymentTarget || 'agent_engine') as any,
        includeTests: typeof initialDoc?.deployment?.includeTests === 'boolean' ? initialDoc.deployment.includeTests : true,
        includeDocker: typeof initialDoc?.deployment?.includeDocker === 'boolean' ? initialDoc.deployment.includeDocker : true,
        useStreaming: typeof initialDoc?.deployment?.useStreaming === 'boolean' ? initialDoc.deployment.useStreaming : (useStreamingByDefault ?? true),
      },
    },
  ]);

  const [activeTabId, setActiveTabId] = useState<string>('tab-main-workflow');
  const [newTabCounter, setNewTabCounter] = useState<number>(1);

  // NOTE: Automatically synchronize active tab buffer when canvas graph or config changes
  useEffect(() => {
    setFileTabs((prev) =>
      prev.map((t) => (t.id === activeTabId ? { ...t, nodes, edges, config } : t))
    );
  }, [nodes, edges, config, activeTabId]);

  const activeTab = fileTabs.find((t) => t.id === activeTabId);

  /**
   * Switches the active editor tab, restoring saved canvas nodes, edges, and configs.
   */
  const handleSelectTab = useCallback(
    (tabId: string) => {
      // NOTE: Prevent redundant reload if tab is already active
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

        // Regenerate code preview for target graph
        setGeneratedFiles(generateCodeForGraph(targetTab.nodes, targetTab.edges, targetTab.config));

        setTimeout(() => {
          fitView({ padding: 0.2, duration: 400 });
        }, 60);
      }
    },
    [
      activeTabId,
      fileTabs,
      setNodes,
      setEdges,
      setConfig,
      setSelectedAgentId,
      setSelectedTriggerId,
      setIsTriggerDrawerOpen,
      setIsToolDrawerOpen,
      setToolModalAgentId,
      setGeneratedFiles,
      fitView,
    ]
  );

  /**
   * Opens a sample template workflow inside a new dedicated tab.
   */
  const handleOpenSampleInNewTab = useCallback(
    (sample: SampleWorkflowDefinition) => {
      const newTabId = `tab-${sample.id}-${Date.now()}`;
      const sampleConfig: GenerationConfig = {
        framework: sample.config?.framework || 'google_adk',
        language: sample.config?.language || 'python',
        outputFolder: (sample.config?.outputFolder || `./${sample.id}_agent/`).replace(/^(\.\/)?src\//, './'),
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
    [
      setNodes,
      setEdges,
      setConfig,
      setSelectedAgentId,
      setSelectedTriggerId,
      setIsTriggerDrawerOpen,
      setIsToolDrawerOpen,
      setToolModalAgentId,
      setActiveEditorTab,
      setGeneratedFiles,
      initializeTabHistory,
      fitView,
    ]
  );

  /**
   * Creates a new blank .agent file tab.
   */
  const handleNewTab = useCallback(() => {
    const num = newTabCounter;
    setNewTabCounter((c) => c + 1);
    const newTabId = `tab-untitled-${Date.now()}`;
    const defaultTabConfig: GenerationConfig = {
      framework: (defaultFramework as any) || 'google_adk',
      language: (defaultLanguage as any) || 'python',
      outputFolder: `./agent_${num}/`,
      includeTests: true,
      includeDocker: true,
      useStreaming: useStreamingByDefault ?? true,
    };

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
  }, [
    newTabCounter,
    defaultFramework,
    defaultLanguage,
    useStreamingByDefault,
    setNodes,
    setEdges,
    setConfig,
    setSelectedAgentId,
    setSelectedTriggerId,
    setIsTriggerDrawerOpen,
    setIsToolDrawerOpen,
    setToolModalAgentId,
    setActiveEditorTab,
    initializeTabHistory,
    setGeneratedFiles,
    fitView,
  ]);

  /**
   * Closes an open tab by ID, stopping any active local deployment and switching to the preceding tab or default.
   */
  const handleCloseTab = useCallback(
    (tabId: string) => {
      const index = fileTabs.findIndex((t) => t.id === tabId);
      if (index === -1) return;

      // Stop any running local deployment server when closing the file tab
      onStopLocalRunner?.();

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
          // NOTE: Reset to default fresh workflow.agent if closing the last tab
          const defaultTab: AgentFileTab = {
            id: `tab-workflow-${Date.now()}`,
            filename: 'workflow.agent',
            title: 'workflow.agent',
            nodes: INITIAL_NODES,
            edges: INITIAL_EDGES,
            config: {
              framework: 'google_adk',
              language: 'python',
              outputFolder: './workflow/',
              includeTests: true,
              includeDocker: true,
              useStreaming: true,
            },
          };
          newTabs.push(defaultTab);
          setActiveTabId(defaultTab.id);
          setNodes(INITIAL_NODES);
          setEdges(INITIAL_EDGES);
          setConfig(defaultTab.config);
          setSelectedAgentId(null);
          setSelectedTriggerId(null);
          setGeneratedFiles(generateCodeForGraph(INITIAL_NODES, INITIAL_EDGES, defaultTab.config));
        }
      }

      setFileTabs(newTabs);
    },
    [
      activeTabId,
      fileTabs,
      setNodes,
      setEdges,
      setConfig,
      setSelectedAgentId,
      setSelectedTriggerId,
      setGeneratedFiles,
      onStopLocalRunner,
    ]
  );

  return {
    fileTabs,
    setFileTabs,
    activeTabId,
    setActiveTabId,
    activeTab,
    handleSelectTab,
    handleOpenSampleInNewTab,
    handleNewTab,
    handleCloseTab,
  };
}
