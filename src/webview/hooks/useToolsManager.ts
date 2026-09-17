/**
 * useToolsManager.ts - Tools Catalog Management and LocalStorage Persistence Hook
 *
 * Purpose:
 * Encapsulates the tools catalog lifecycle in the visual workflow designer, including
 * loading and saving tools to localStorage, scaffolding custom API tools and Model Context
 * Protocol (MCP) server definitions, and synchronizing tool configuration updates
 * across all canvas agent nodes that reference modified tools.
 *
 * Architectural Decisions:
 * - Author: Mike Nimer <mikenimer@google.com>
 * - Scoped Tool Configuration: Tools attached to agents maintain independent deep-copied instances
 *   in `node.data.tools`. Modifying a tool from an AgentDrawer updates only that specific agent's JSON.
 *   Modifying a tool from the global palette/Tools menu updates the global designer template without
 *   mutating existing agent-scoped tool instances.
 * - Reactive Node Propagation: When a tool is edited or deleted in the catalog, all agent nodes
 *   holding references to that tool ID are immutably updated to maintain graph consistency.
 * - LocalStorage Resilience: Storage reads and writes are safely wrapped in try/catch guards with
 *   fallback to the static `AVAILABLE_TOOLS` catalog.
 */

import { useState, useEffect, useCallback } from 'react';
import { Node, Edge } from '@xyflow/react';
import { ToolDefinition, AgentData } from '../types';
import { AVAILABLE_TOOLS } from '../data/defaultTools';
import { isDeprecatedMockTool } from '../data/builtinTools';

export const STORAGE_TOOLS_KEY = 'ais_agent_studio_tools_v1';

export type ToolScope = { type: 'global' | 'agent'; agentId?: string } | null;

/**
 * Reconciles saved tools loaded from localStorage with the latest AVAILABLE_TOOLS catalog.
 * Filters out any deprecated mock tools and ensures that all native ADK tools are available,
 * while preserving custom tools, MCP servers, and modified configurations.
 *
 * @author Mike Nimer <mikenimer@google.com>
 * @param savedTools Array of tools loaded from localStorage
 * @returns Reconciled array of ToolDefinition objects
 */
export function reconcileToolsCatalog(savedTools: ToolDefinition[]): ToolDefinition[] {
  if (!Array.isArray(savedTools)) {
    return AVAILABLE_TOOLS;
  }

  // 1. Filter out deprecated mock tools
  const activeSaved = savedTools.filter((t) => !isDeprecatedMockTool(t));

  // 2. Index and deduplicate existing tools by ID and custom function singleton
  const seenIds = new Set<string>();
  let seenCustomFunction = false;
  const dedupedSaved: ToolDefinition[] = [];

  for (const tool of activeSaved) {
    if (seenIds.has(tool.id)) continue;
    if (tool.id === 'tool_custom_function' || tool.name === 'Custom Python/TS Function') {
      if (seenCustomFunction) continue;
      seenCustomFunction = true;
    }
    seenIds.add(tool.id);
    dedupedSaved.push(tool);
  }

  const existingBuiltinTypes = new Set(
    dedupedSaved.map((t) => t.builtinType).filter(Boolean)
  );

  // 3. Merge in any missing native ADK tools from AVAILABLE_TOOLS
  const missingBuiltins = AVAILABLE_TOOLS.filter((t) => {
    // If id already exists, not missing
    if (seenIds.has(t.id)) return false;
    // If builtinType already exists, not missing (e.g., tool_google_search vs builtin_google_search)
    if (t.builtinType && existingBuiltinTypes.has(t.builtinType)) return false;
    // If custom function already exists, not missing
    if ((t.id === 'tool_custom_function' || t.name === 'Custom Python/TS Function') && seenCustomFunction) return false;
    return true;
  });

  return [...dedupedSaved, ...missingBuiltins];
}

export interface UseToolsManagerOptions {
  nodes: Node<any>[];
  edges: Edge[];
  setNodes: (nodes: Node<any>[]) => void;
  recordSnapshot: (nodes: Node<any>[], edges: Edge[], options?: { description?: string }) => void;
  setSelectedAgentId: (id: string | null) => void;
  setSelectedTriggerId: (id: string | null) => void;
  setIsTriggerDrawerOpen: (open: boolean) => void;
}

export interface UseToolsManagerResult {
  tools: ToolDefinition[];
  setTools: React.Dispatch<React.SetStateAction<ToolDefinition[]>>;
  editingTool: ToolDefinition | null;
  setEditingTool: React.Dispatch<React.SetStateAction<ToolDefinition | null>>;
  editingToolScope: ToolScope;
  setEditingToolScope: React.Dispatch<React.SetStateAction<ToolScope>>;
  isToolDrawerOpen: boolean;
  setIsToolDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  handleOpenEditTool: (tool: ToolDefinition) => void;
  handleOpenEditAgentTool: (agentId: string, tool: ToolDefinition) => void;
  handleCreateCustomTool: () => void;
  handleCreateMcpTool: () => void;
  handleSaveTool: (savedTool: ToolDefinition) => void;
  handleUpdateTool: (updatedTool: ToolDefinition) => void;
  handleDeleteTool: (toolId: string) => void;
}

/**
 * Custom hook to manage tool definitions, property drawers, and agent tool bindings.
 */
export function useToolsManager(options: UseToolsManagerOptions): UseToolsManagerResult {
  const {
    nodes,
    edges,
    setNodes,
    recordSnapshot,
    setSelectedAgentId,
    setSelectedTriggerId,
    setIsTriggerDrawerOpen,
  } = options;

  // Initialize tools from localStorage with fallback to default catalog and catalog reconciliation
  const [tools, setTools] = useState<ToolDefinition[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_TOOLS_KEY);
      if (saved && saved !== 'undefined' && saved !== 'null') {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return reconcileToolsCatalog(parsed);
        }
      }
    } catch (e) {
      console.warn('Failed to load saved tools from localStorage:', e);
    }
    return AVAILABLE_TOOLS;
  });

  const [editingTool, setEditingTool] = useState<ToolDefinition | null>(null);
  const [editingToolScope, setEditingToolScope] = useState<ToolScope>(null);
  const [isToolDrawerOpen, setIsToolDrawerOpen] = useState<boolean>(false);

  // NOTE: Automatically persist tools to local storage on change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_TOOLS_KEY, JSON.stringify(tools));
    } catch (e) {
      console.warn('Failed to persist tools to localStorage:', e);
    }
  }, [tools]);

  /**
   * Opens the tool configuration drawer for a global catalog tool.
   */
  const handleOpenEditTool = useCallback(
    (tool: ToolDefinition) => {
      if (!tool) return;
      setEditingToolScope({ type: 'global' });
      setEditingTool(JSON.parse(JSON.stringify(tool)));
      setIsToolDrawerOpen(true);
      setSelectedAgentId(null);
      setSelectedTriggerId(null);
      setIsTriggerDrawerOpen(false);
    },
    [setSelectedAgentId, setSelectedTriggerId, setIsTriggerDrawerOpen]
  );

  /**
   * Opens the tool configuration drawer for an agent-scoped tool instance.
   */
  const handleOpenEditAgentTool = useCallback(
    (agentId: string, tool: ToolDefinition) => {
      if (!agentId || !tool) return;
      setEditingToolScope({ type: 'agent', agentId });
      setEditingTool(JSON.parse(JSON.stringify(tool)));
      setIsToolDrawerOpen(true);
      setSelectedTriggerId(null);
      setIsTriggerDrawerOpen(false);
    },
    [setSelectedTriggerId, setIsTriggerDrawerOpen]
  );

  /**
   * Scaffolds and opens a new Custom API Tool template.
   */
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
    setEditingToolScope({ type: 'global' });
    setEditingTool(newTool);
    setIsToolDrawerOpen(true);
    setSelectedAgentId(null);
    setSelectedTriggerId(null);
    setIsTriggerDrawerOpen(false);
  }, [setSelectedAgentId, setSelectedTriggerId, setIsTriggerDrawerOpen]);

  /**
   * Scaffolds and opens a new Model Context Protocol (MCP) Server Tool template.
   */
  const handleCreateMcpTool = useCallback(() => {
    const newMcpTool: ToolDefinition = {
      id: `tool_mcp_${Date.now()}`,
      name: 'New MCP Server',
      type: 'mcp',
      description: 'Model Context Protocol (MCP) server providing tools and resources.',
      codePrompt: 'Connect to remote MCP server via Streamable HTTP and invoke exposed tool capabilities.',
      enabled: true,
      mcpConfig: {
        serverName: 'bigquery-mcp',
        transport: 'http',
        serverUrl: 'https://bigquery.googleapis.com/mcp',
        headers: {},
        exposedTools: ['*'],
        autoApproveTools: [],
        authProviderType: 'google_credentials',
        oauthConfig: {
          scopes: [
            'https://www.googleapis.com/auth/cloud-platform',
            'https://www.googleapis.com/auth/bigquery',
          ],
          projectId: '',
        },
        timeoutSeconds: 30,
        discoveredTools: [],
      },
    };
    setEditingToolScope({ type: 'global' });
    setEditingTool(newMcpTool);
    setIsToolDrawerOpen(true);
    setSelectedAgentId(null);
    setSelectedTriggerId(null);
    setIsTriggerDrawerOpen(false);
  }, [setSelectedAgentId, setSelectedTriggerId, setIsTriggerDrawerOpen]);

  /**
   * Updates tool properties live onChange, propagating to either an agent-scoped instance
   * or the global designer catalog without closing the drawer.
   *
   * @author Mike Nimer <mikenimer@google.com>
   */
  const handleUpdateTool = useCallback(
    (updatedTool: ToolDefinition) => {
      // 1. Synchronize the active editing tool draft in local hook state
      setEditingTool(updatedTool);

      // 2. Check scope: agent instance vs. global template catalog
      if (editingToolScope?.type === 'agent' && editingToolScope.agentId) {
        const targetAgentId = editingToolScope.agentId;
        // Update the tool JSON inside the targeted agent node
        let updated = false;
        const nextNodes = nodes.map((n) => {
          if (n.id === targetAgentId && (n.type === 'agentNode' || n.type === 'agent')) {
            const agentData = n.data as AgentData;
            updated = true;
            return {
              ...n,
              data: {
                ...n.data,
                tools: (agentData.tools || []).map((t) =>
                  t.id === updatedTool.id ? JSON.parse(JSON.stringify(updatedTool)) : t
                ),
              },
            };
          }
          return n;
        });

        if (updated) {
          setNodes(nextNodes);
        }
      } else {
        // Global update: update or insert the tool in the designer template catalog
        const deepCopiedTool: ToolDefinition = JSON.parse(JSON.stringify(updatedTool));
        setTools((prev) => {
          const exists = prev.some((t) => t.id === deepCopiedTool.id);
          if (exists) {
            return prev.map((t) => (t.id === deepCopiedTool.id ? deepCopiedTool : t));
          }
          return [deepCopiedTool, ...prev];
        });
      }
    },
    [editingToolScope, nodes, setNodes, setTools]
  );

  /**
   * Alias for handleUpdateTool to preserve backwards compatibility with existing callers.
   */
  const handleSaveTool = useCallback(
    (savedTool: ToolDefinition) => {
      handleUpdateTool(savedTool);
    },
    [handleUpdateTool]
  );

  /**
   * Deletes a tool from either an agent-scoped instance or the global catalog.
   *
   * Architectural Decisions:
   * - Agent-Scoped Delete: When editing a tool attached to a specific agent node (editingToolScope?.type === 'agent'),
   *   clicking delete must ONLY remove that tool instance from the targeted agent's node.data.tools array.
   *   The tool is NOT removed from the global tools catalog or from any other agent nodes.
   * - Global Catalog Delete: When editing from the global tools catalog (editingToolScope?.type === 'global'),
   *   the tool is removed from the catalog and stripped from agent nodes referencing it.
   */
  const handleDeleteTool = useCallback(
    (toolId: string) => {
      if (editingToolScope?.type === 'agent' && editingToolScope.agentId) {
        const targetAgentId = editingToolScope.agentId;
        // Strip the tool ONLY from this specific agent node
        let updated = false;
        const nextNodes = nodes.map((n) => {
          if (n.id === targetAgentId && (n.type === 'agentNode' || n.type === 'agent')) {
            const agentData = n.data as AgentData;
            updated = true;
            return {
              ...n,
              data: {
                ...n.data,
                tools: (agentData.tools || []).filter((t) => t.id !== toolId),
              },
            };
          }
          return n;
        });

        if (updated) {
          setNodes(nextNodes);
          recordSnapshot(nextNodes, edges, {
            description: `Removed tool from agent`,
          });
        }
      } else {
        // 1. Remove from tools catalog
        setTools((prev) => prev.filter((t) => t.id !== toolId));

        // 2. Strip from any agent node that contains it
        const nextNodes = nodes.map((n) => {
          if ((n.type === 'agentNode' || n.type === 'agent') && (n.data as AgentData).tools) {
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
        recordSnapshot(nextNodes, edges, { description: 'Deleted tool from catalog' });
      }

      setIsToolDrawerOpen(false);
      setEditingTool(null);
      setEditingToolScope(null);
    },
    [editingToolScope, nodes, edges, setNodes, setTools, recordSnapshot]
  );

  return {
    tools,
    setTools,
    editingTool,
    setEditingTool,
    editingToolScope,
    setEditingToolScope,
    isToolDrawerOpen,
    setIsToolDrawerOpen,
    handleOpenEditTool,
    handleOpenEditAgentTool,
    handleCreateCustomTool,
    handleCreateMcpTool,
    handleSaveTool,
    handleUpdateTool,
    handleDeleteTool,
  };
}
