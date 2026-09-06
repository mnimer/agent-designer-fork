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

export const STORAGE_TOOLS_KEY = 'ais_agent_studio_tools_v1';

export type ToolScope = { type: 'global' | 'agent'; agentId?: string } | null;

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

  // Initialize tools from localStorage with fallback to default catalog
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
      setEditingToolScope({ type: 'global' });
      setEditingTool(tool);
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
    setEditingToolScope({ type: 'global' });
    setEditingTool(newMcpTool);
    setIsToolDrawerOpen(true);
    setSelectedAgentId(null);
    setSelectedTriggerId(null);
    setIsTriggerDrawerOpen(false);
  }, [setSelectedAgentId, setSelectedTriggerId, setIsTriggerDrawerOpen]);

  /**
   * Saves tool edits either to an agent-scoped instance or the global designer catalog.
   */
  const handleSaveTool = useCallback(
    (savedTool: ToolDefinition) => {
      if (editingToolScope?.type === 'agent' && editingToolScope.agentId) {
        const targetAgentId = editingToolScope.agentId;
        // Save the modified properties into the JSON under this agent node only
        let updated = false;
        const nextNodes = nodes.map((n) => {
          if (n.id === targetAgentId && n.type === 'agentNode') {
            const agentData = n.data as AgentData;
            updated = true;
            return {
              ...n,
              data: {
                ...n.data,
                tools: (agentData.tools || []).map((t) =>
                  t.id === savedTool.id ? JSON.parse(JSON.stringify(savedTool)) : t
                ),
              },
            };
          }
          return n;
        });

        if (updated) {
          setNodes(nextNodes);
          recordSnapshot(nextNodes, edges, {
            description: `Configure ${savedTool.name} for agent`,
          });
        }
      } else {
        // Global save: update the designer state (tools template collection)
        const deepCopiedTool: ToolDefinition = JSON.parse(JSON.stringify(savedTool));
        setTools((prev) => {
          const exists = prev.some((t) => t.id === deepCopiedTool.id);
          if (exists) {
            return prev.map((t) => (t.id === deepCopiedTool.id ? deepCopiedTool : t));
          }
          return [deepCopiedTool, ...prev];
        });
      }

      setIsToolDrawerOpen(false);
      setEditingTool(null);
      setEditingToolScope(null);
    },
    [editingToolScope, nodes, edges, setNodes, setTools, recordSnapshot]
  );

  /**
   * Deletes a tool from the catalog and strips references from all agent nodes.
   */
  const handleDeleteTool = useCallback(
    (toolId: string) => {
      // 1. Remove from tools catalog
      setTools((prev) => prev.filter((t) => t.id !== toolId));

      // 2. Strip from any agent node that contains it
      const nextNodes = nodes.map((n) => {
        if (n.type === 'agentNode' && (n.data as AgentData).tools) {
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
      setIsToolDrawerOpen(false);
      setEditingTool(null);
      setEditingToolScope(null);
    },
    [nodes, edges, setNodes, recordSnapshot]
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
    handleDeleteTool,
  };
}
