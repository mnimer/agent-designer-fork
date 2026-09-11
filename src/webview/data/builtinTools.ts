/**
 * Built-in Google ADK Tools Registry
 *
 * Defines the canonical definitions, parameter schemas, defaults, and icons
 * for all official Google ADK built-in tools:
 * 1. Google Search Grounding (`google_search`)
 * 2. Vertex AI Search Datastore Grounding (`vertex_ai_search`)
 * 3. Web Page Reader (`load_web_page`)
 * 4. Human-in-the-Loop Clarification (`request_input`)
 * 5. Preload Memory Context (`preload_memory`)
 * 6. Sandboxed Code Interpreter (`code_execution`)
 * 7. Sub-Agent as a Tool Wrapper (`agent_as_tool`)
 *
 * Architectural Decisions:
 * 1. Region Configuration: Vertex AI Search defaults to `location="global"` per project guidelines.
 * 2. Canonical Model Representation: Tools store runtime-agnostic JSON schemas ready for compilation to Python ADK or LangGraph.
 * 3. Categorization: Tools are divided into 4 primary functional categories:
 *    - Built-in Grounding (Web search & reader)
 *    - Enterprise Search (Datastores & RAG)
 *    - System Tools (Code execution, memory, interrupts, agent delegation)
 *    - Custom Tools (REST, MCP, custom code)
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { ToolDefinition, ToolCategory } from '../types';

export const BUILTIN_ADK_TOOLS: ToolDefinition[] = [
  // 1. Google Search Grounding
  {
    id: 'builtin_google_search',
    name: 'Google Search Grounding',
    type: 'search',
    category: 'grounding',
    builtinType: 'google_search',
    description: 'Dynamic real-time web retrieval and Google Search grounding with configurable domain filters and threshold scoring.',
    codePrompt: 'Ground model generations against live Google Search results. Validates facts, surfaces citation sources, and enriches responses with current real-time web content.',
    icon: 'Globe',
    parameters: {
      query: 'string - The search terms or question to look up online',
    },
    googleSearchConfig: {
      domainFilters: [],
      dynamicThreshold: 0.3,
    },
    enabled: true,
  },

  // 2. Vertex AI Search (Enterprise Datastores)
  {
    id: 'builtin_vertex_ai_search',
    name: 'Vertex AI Search',
    type: 'rag',
    category: 'enterprise_search',
    builtinType: 'vertex_ai_search',
    description: 'Grounding against enterprise Vertex AI Search datastores and unstructured/structured corpora.',
    codePrompt: 'Query the connected Vertex AI Search enterprise datastore. Retrieves authorized organizational documents, knowledge bases, and structured data with strict access controls.',
    icon: 'Database',
    parameters: {
      query: 'string - Semantic search query for enterprise datastore retrieval',
      max_results: 'number - Maximum number of document chunks to return (default 5)',
    },
    vertexAiSearchConfig: {
      dataStoreId: '',
      location: 'global',
      project: '',
      engineId: '',
      maxResults: 5,
    },
    enabled: true,
  },

  // 3. Web Page Reader
  {
    id: 'builtin_load_web_page',
    name: 'Web Page Reader',
    type: 'search',
    category: 'grounding',
    builtinType: 'load_web_page',
    description: 'Fetches web page content over HTTP and converts HTML to clean, model-friendly markdown.',
    codePrompt: 'Load public web pages by URL, stripping boilerplate markup, navigation, and script tags to return clean markdown for document inspection and summary.',
    icon: 'FileText',
    parameters: {
      url: 'string - Fully qualified HTTP or HTTPS URL to fetch',
    },
    enabled: true,
  },

  // 4. Human-in-the-Loop Clarification
  {
    id: 'builtin_request_input',
    name: 'Human Clarification (HITL)',
    type: 'custom',
    category: 'system',
    builtinType: 'request_input',
    description: 'Pauses model execution to request clarifications, confirmations, or approvals directly from the human operator.',
    codePrompt: 'Interrupt agent processing and solicit human operator clarification or confirmation before executing sensitive steps or when intent is ambiguous.',
    icon: 'HelpCircle',
    parameters: {
      prompt: 'string - Clarification question or prompt displayed to the operator',
    },
    requestInputConfig: {
      prompt: 'Please provide required input or confirm this action:',
      timeoutSeconds: 300,
    },
    enabled: true,
  },

  // 5. Preload Memory Context
  {
    id: 'builtin_preload_memory',
    name: 'Preload Memory Tool',
    type: 'custom',
    category: 'system',
    builtinType: 'preload_memory',
    description: 'Injects historical user session context, chat memories, and preferences into the prompt window before execution.',
    codePrompt: 'Load historical session facts, prior agent conclusions, and user preferences into the active conversational context for multi-turn coherence.',
    icon: 'History',
    parameters: {
      session_id: 'string - Unique conversation session identifier',
      limit: 'number - Maximum history turns to retrieve (default 10)',
    },
    enabled: true,
  },

  // 6. Code Interpreter (Sandboxed Execution)
  {
    id: 'builtin_code_execution',
    name: 'Python Code Sandbox',
    type: 'code',
    category: 'system',
    builtinType: 'code_execution',
    description: 'Sandboxed Python code execution environment with data analysis and mathematical libraries.',
    codePrompt: 'Execute Python 3 scripts in a secure ephemeral sandbox container. Computes calculations, processes dataframes, and returns execution output and errors.',
    icon: 'Terminal',
    parameters: {
      code: 'string - Valid Python source code to execute in the sandbox',
    },
    enabled: true,
  },

  // 7. Sub-Agent as a Tool
  {
    id: 'builtin_agent_as_tool',
    name: 'Sub-Agent as Tool',
    type: 'custom',
    category: 'system',
    builtinType: 'agent_as_tool',
    description: 'Wraps another configured agent as a callable tool, delegating focused sub-tasks and retrieving findings.',
    codePrompt: 'Delegate specific sub-tasks to a specialized sub-agent (e.g. researcher, evaluator, calculator) and return its synthesized conclusions.',
    icon: 'Bot',
    parameters: {
      task_description: 'string - Detailed objective and prompt instructions for the sub-agent',
    },
    agentAsToolConfig: {
      subAgentId: '',
      subAgentName: '',
      subAgentDescription: '',
    },
    enabled: true,
  },
];

/**
 * Returns a cloned copy of all built-in ADK tools to avoid accidental mutations.
 *
 * @returns Array of ToolDefinition objects
 */
export function getBuiltinTools(): ToolDefinition[] {
  return BUILTIN_ADK_TOOLS.map((t) => ({
    ...t,
    parameters: t.parameters ? { ...t.parameters } : {},
    googleSearchConfig: t.googleSearchConfig ? { ...t.googleSearchConfig, domainFilters: [...(t.googleSearchConfig.domainFilters || [])] } : undefined,
    vertexAiSearchConfig: t.vertexAiSearchConfig ? { ...t.vertexAiSearchConfig } : undefined,
    requestInputConfig: t.requestInputConfig ? { ...t.requestInputConfig } : undefined,
    agentAsToolConfig: t.agentAsToolConfig ? { ...t.agentAsToolConfig } : undefined,
  }));
}

/**
 * Retrieves a single built-in tool by its unique identifier.
 *
 * @param id The tool ID (e.g. 'builtin_vertex_ai_search' or 'builtin_google_search')
 * @returns ToolDefinition or undefined if not found
 */
export function getBuiltinToolById(id: string): ToolDefinition | undefined {
  const found = BUILTIN_ADK_TOOLS.find((t) => t.id === id);
  if (!found) return undefined;
  return {
    ...found,
    parameters: found.parameters ? { ...found.parameters } : {},
    googleSearchConfig: found.googleSearchConfig ? { ...found.googleSearchConfig, domainFilters: [...(found.googleSearchConfig.domainFilters || [])] } : undefined,
    vertexAiSearchConfig: found.vertexAiSearchConfig ? { ...found.vertexAiSearchConfig } : undefined,
    requestInputConfig: found.requestInputConfig ? { ...found.requestInputConfig } : undefined,
    agentAsToolConfig: found.agentAsToolConfig ? { ...found.agentAsToolConfig } : undefined,
  };
}

/**
 * Checks whether a given tool definition originates from the ADK built-in tool catalog.
 *
 * @param tool The tool to inspect
 * @returns boolean
 */
export function isBuiltinTool(tool: ToolDefinition): boolean {
  if (!tool) return false;
  return (
    tool.id.startsWith('builtin_') || 
    tool.builtinType !== undefined ||
    tool.id === 'tool_google_search' ||
    tool.id === 'tool_code_interpreter'
  );
}

/**
 * Checks whether a given tool belongs to the official Google ADK tools suite
 * (including built-in ADK tools and native FunctionTool custom functions).
 *
 * @author Mike Nimer <mikenimer@google.com>
 * @param tool The tool to inspect
 * @returns boolean
 */
export function isNativeAdkTool(tool: ToolDefinition): boolean {
  if (!tool) return false;
  return (
    tool.builtinType !== undefined ||
    tool.id.startsWith('builtin_') ||
    tool.id === 'tool_google_search' ||
    tool.id === 'tool_code_interpreter' ||
    tool.id === 'tool_custom_function' ||
    tool.name === 'Custom Python/TS Function'
  );
}

export interface CategorizedTools {
  native_adk: ToolDefinition[];
  google_cloud_mcp: ToolDefinition[];
  mcp: ToolDefinition[];
  custom: ToolDefinition[];
  // Backwards compatibility for existing sub-category consumers & tests
  grounding: ToolDefinition[];
  enterprise_search: ToolDefinition[];
  system: ToolDefinition[];
}

/**
 * Set of deprecated legacy mock tools that should NEVER be displayed,
 * attached, or restored from localStorage / saved workspaces.
 */
export const DEPRECATED_MOCK_TOOL_IDS = new Set<string>([
  'tool_procurement_calc',
  'tool_financial_calc',
  'tool_google_places',
  'tool_twitter_api',
  'tool_github_api',
  'tool_slack_webhook',
  'tool_sql_query',
  'tool_rest_api',
  'tool_rag_search',
  'mcp_github',
  'mcp_github_server',
  'mcp_filesystem',
  'mcp_postgres',
  'mcp_brave_search',
  'mcp_memory_graph',
  'mcp_remote_sse',
]);

/**
 * Known deprecated tool names to guard against renamed variants.
 */
const DEPRECATED_TOOL_NAMES = new Set<string>([
  'procurement & margin calculator',
  'google places api (business lookup)',
  'google places api',
  'twitter / x api client',
  'twitter / x api',
  'github api client',
  'slack notification dispatcher',
  'sql database query',
  'generic rest api client',
  'knowledge rag vector search',
  'github mcp server',
  'filesystem mcp server',
  'postgresql mcp server',
  'brave search mcp server',
  'memory knowledge graph mcp',
  'remote sse mcp server',
]);

/**
 * Checks whether a given tool definition is a deprecated mock tool.
 */
export function isDeprecatedMockTool(tool: ToolDefinition | { id?: string; name?: string }): boolean {
  if (!tool) return false;
  if (tool.id && DEPRECATED_MOCK_TOOL_IDS.has(tool.id)) return true;
  if (tool.name && DEPRECATED_TOOL_NAMES.has(tool.name.toLowerCase().trim())) return true;
  return false;
}

/**
 * Filters out all deprecated mock tools from a tool array.
 */
export function sanitizeToolList(tools: ToolDefinition[]): ToolDefinition[] {
  if (!Array.isArray(tools)) return [];
  return tools.filter((t) => !isDeprecatedMockTool(t));
}

/**
 * Segregates an array of tools into designer categories:
 * - Native ADK Tools: Official Google ADK built-in tools and FunctionTool definitions
 * - Google Cloud MCP Servers: Official remote Google Cloud & Workspace MCP servers
 * - MCP Servers: Standard Model Context Protocol servers
 * - Custom & External: Third-party REST APIs and custom integrations
 *
 * Also maintains legacy sub-categories (grounding, enterprise_search, system, custom)
 * for backward compatibility with existing tests and sub-filtering workflows.
 *
 * @author Mike Nimer <mikenimer@google.com>
 * @param tools List of tools to categorize
 * @returns CategorizedTools object
 */
export function categorizeTools(tools: ToolDefinition[]): CategorizedTools {
  const categorized: CategorizedTools = {
    native_adk: [],
    google_cloud_mcp: [],
    mcp: [],
    custom: [],
    grounding: [],
    enterprise_search: [],
    system: [],
  };

  const cleanTools = sanitizeToolList(tools);

  for (const tool of cleanTools) {
    const isGoogleCloudMcp = tool.category === 'google_cloud_mcp' || tool.id.startsWith('gcp_mcp_');
    const isMcp = !isGoogleCloudMcp && (tool.type === 'mcp' || tool.mcpConfig !== undefined || tool.id.startsWith('tool_mcp_'));
    const isAdk = !isGoogleCloudMcp && !isMcp && isNativeAdkTool(tool);

    // 1. Group into Native ADK vs Google Cloud MCP vs generic MCP
    if (isGoogleCloudMcp) {
      categorized.google_cloud_mcp.push(tool);
    } else if (isAdk) {
      categorized.native_adk.push(tool);
    } else if (isMcp) {
      categorized.mcp.push(tool);
    }

    // 2. Populate legacy 4 categories exactly as before
    if (tool.category === 'grounding') {
      categorized.grounding.push(tool);
    } else if (tool.category === 'enterprise_search') {
      categorized.enterprise_search.push(tool);
    } else if (tool.category === 'system') {
      categorized.system.push(tool);
    } else if (tool.builtinType === 'google_search' || tool.builtinType === 'load_web_page' || tool.id === 'tool_google_search') {
      categorized.grounding.push(tool);
    } else if (tool.builtinType === 'vertex_ai_search' || tool.type === 'rag' || tool.id === 'tool_rag_retriever') {
      categorized.enterprise_search.push(tool);
    } else if (
      tool.builtinType === 'code_execution' || 
      tool.builtinType === 'request_input' || 
      tool.builtinType === 'preload_memory' || 
      tool.builtinType === 'agent_as_tool' ||
      tool.id === 'tool_code_interpreter' ||
      tool.type === 'code'
    ) {
      categorized.system.push(tool);
    } else if (!isGoogleCloudMcp) {
      categorized.custom.push(tool);
    }
  }

  return categorized;
}
