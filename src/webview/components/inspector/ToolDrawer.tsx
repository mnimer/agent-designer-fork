/**
 * Tool Drawer Dispatcher & Inspector Router
 *
 * Coordinates opening the appropriate specialized tool drawer based on the tool's
 * built-in type or configuration:
 * 1. McpToolDrawer - External Model Context Protocol (MCP) servers (default for custom/registered tools).
 * 2. VertexAiSearchToolDrawer - Vertex AI Search datastore configuration.
 * 3. GoogleSearchToolDrawer - Google Search live web grounding with domain filters.
 * 4. RequestInputToolDrawer - Human-in-the-Loop clarification settings.
 * 5. AgentAsToolDrawer - Sub-Agent as a Tool delegation wrapper.
 *
 * Replaces the monolithic 1,500-line drawer and removes the redundant type dropdown
 * in favor of read-only type badges in each specialized drawer.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import React from 'react';
import { ToolDefinition, AgentData, McpToolConfig } from '../../types';
import {
  McpToolDrawer,
  VertexAiSearchToolDrawer,
  GoogleSearchToolDrawer,
  RequestInputToolDrawer,
  AgentAsToolDrawer,
  CodeExecutionToolDrawer,
  CustomFunctionToolDrawer,
  WebPageReaderToolDrawer,
  PreloadMemoryToolDrawer,
  ApiToolDrawer,
  TRANSPORT_DESCRIPTIONS,
} from './tools';
import type { McpHandshakeResult } from './tools';

export {
  McpToolDrawer,
  VertexAiSearchToolDrawer,
  GoogleSearchToolDrawer,
  RequestInputToolDrawer,
  AgentAsToolDrawer,
  CodeExecutionToolDrawer,
  CustomFunctionToolDrawer,
  WebPageReaderToolDrawer,
  PreloadMemoryToolDrawer,
  ApiToolDrawer,
  TRANSPORT_DESCRIPTIONS,
};
export type { McpHandshakeResult };

export interface ToolDrawerProps {
  tool: ToolDefinition | null;
  isOpen: boolean;
  onClose: () => void;
  onSaveTool?: (updatedTool: ToolDefinition) => void;
  onUpdateTool?: (updatedTool: ToolDefinition) => void;
  onDeleteTool?: (toolId: string) => void;
  selectedAgent?: AgentData | null;
  onAttachToAgent?: (agentId: string, tool: ToolDefinition) => void;
  scope?: 'global' | 'agent';
  agentName?: string;
  targetLanguage?: string;
  onTestMcpHandshake?: (config: McpToolConfig) => Promise<McpHandshakeResult>;
  onStartOAuthFlow?: (options: {
    authUrl: string;
    tokenUrl?: string;
    clientId?: string;
    clientSecret?: string;
    scopes?: string[];
    secretName?: string;
    envVar?: string;
  }) => Promise<{ success: boolean; bearerToken?: string; tokenPreview?: string; error?: string }>;
  onSaveMcpSecret?: (secretName: string, envVar: string, token: string) => Promise<{ success: boolean; error?: string; tokenPreview?: string }>;
  onGetMcpSecret?: (secretName: string, envVar?: string) => Promise<{ success: boolean; hasToken: boolean; tokenPreview?: string; bearerToken?: string; error?: string }>;
}

export const ToolDrawer: React.FC<ToolDrawerProps> = (props) => {
  const { tool, isOpen } = props;

  if (!isOpen || !tool) {
    return null;
  }

  // 1. Vertex AI Search Datastore Drawer
  if (tool.builtinType === 'vertex_ai_search' || tool.id === 'builtin_vertex_ai_search') {
    return <VertexAiSearchToolDrawer {...props} />;
  }

  // 2. Google Search Grounding Drawer
  if (
    tool.builtinType === 'google_search' ||
    tool.id === 'builtin_google_search' ||
    tool.id === 'tool_google_search'
  ) {
    return <GoogleSearchToolDrawer {...props} />;
  }

  // 3. Human-in-the-Loop Clarification Drawer
  if (tool.builtinType === 'request_input' || tool.id === 'builtin_request_input') {
    return <RequestInputToolDrawer {...props} />;
  }

  // 4. Sub-Agent as a Tool Wrapper Drawer
  if (tool.builtinType === 'agent_as_tool' || tool.id === 'builtin_agent_as_tool') {
    return <AgentAsToolDrawer {...props} />;
  }

  // 5. Python Code Sandbox Drawer (Code Execution)
  if (
    tool.builtinType === 'code_execution' ||
    tool.type === 'code' ||
    tool.id === 'tool_code_interpreter'
  ) {
    return <CodeExecutionToolDrawer {...props} />;
  }

  // 6. Web Page Reader Drawer (load_web_page)
  if (tool.builtinType === 'load_web_page' || tool.id === 'builtin_load_web_page') {
    return <WebPageReaderToolDrawer {...props} />;
  }

  // 7. Preload Memory Drawer (preload_memory)
  if (tool.builtinType === 'preload_memory' || tool.id === 'builtin_preload_memory') {
    return <PreloadMemoryToolDrawer {...props} />;
  }

  // 8. REST API Tool Drawer
  if (tool.type === 'api') {
    return <ApiToolDrawer {...props} />;
  }

  // 9. Model Context Protocol (MCP) Server Drawer
  if (tool.type === 'mcp' || tool.mcpConfig !== undefined || tool.id.startsWith('tool_mcp_')) {
    return <McpToolDrawer {...props} />;
  }

  // 10. Custom Function Tool Drawer (Default for user-defined custom functions)
  return <CustomFunctionToolDrawer {...props} />;
};

/**
 * Backward compatibility alias for ToolPropertyDrawer
 */
export const ToolPropertyDrawer = ToolDrawer;

