/**
 * Default Tool Catalog Definitions
 *
 * Pre-configured tool presets available for attaching to agents, including
 * Google Search Grounding, Code Execution Sandboxes, REST API Integrations,
 * PostgreSQL database clients, and Model Context Protocol (MCP) servers.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { ToolDefinition } from '../../shared/types';

export const AVAILABLE_TOOLS: ToolDefinition[] = [
  {
    id: 'tool_google_search',
    name: 'Google Search Grounding',
    type: 'builtin',
    description: 'Grounding search engine tool for real-time web retrieval and source verification.',
    config: {
      provider: 'google_search',
    },
  },
  {
    id: 'tool_code_interpreter',
    name: 'Python Code Sandbox',
    type: 'code',
    description: 'Executes Python code in an isolated sandboxed runtime with data science libraries.',
    config: {
      runtime: 'python3',
      timeoutSeconds: 30,
    },
  },
  {
    id: 'tool_sql_query',
    name: 'SQL Database Query',
    type: 'database',
    description: 'Queries relational databases (PostgreSQL/Cloud SQL) with parameterized SQL.',
    config: {
      engine: 'postgres',
      readOnly: true,
      maxRows: 100,
    },
  },
  {
    id: 'tool_mcp_github',
    name: 'GitHub MCP Server',
    type: 'mcp',
    description: 'Model Context Protocol (MCP) server for repository inspection, issues, and PR management.',
    config: {
      serverName: 'github-mcp',
      command: 'npx -y @modelcontextprotocol/server-github',
      envVar: 'GITHUB_PERSONAL_ACCESS_TOKEN',
    },
  },
  {
    id: 'tool_mcp_filesystem',
    name: 'Filesystem MCP Server',
    type: 'mcp',
    description: 'Local filesystem access via MCP server for sandboxed directory listing and file I/O.',
    config: {
      serverName: 'filesystem-mcp',
      command: 'npx -y @modelcontextprotocol/server-filesystem ./workspace',
    },
  },
  {
    id: 'tool_rest_api',
    name: 'Generic REST API Client',
    type: 'rest',
    description: 'Makes arbitrary authenticated HTTP GET/POST/PUT requests to external APIs.',
    config: {
      method: 'POST',
      timeoutSeconds: 30,
    },
  },
  {
    id: 'tool_custom_function',
    name: 'Custom Python Function',
    type: 'custom',
    description: 'User-defined custom business logic function with type annotations.',
    config: {
      functionName: 'custom_handler',
    },
  },
];
