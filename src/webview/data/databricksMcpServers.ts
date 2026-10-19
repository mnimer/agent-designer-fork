/**
 * Databricks Managed MCP Servers Registry
 *
 * Job / Purpose:
 * Catalog and helper routines for official Databricks Managed Model Context Protocol (MCP)
 * servers, enabling agents to securely connect to Databricks Genie spaces, Vector Search indexes,
 * Unity Catalog Functions, and Databricks SQL Warehouses.
 *
 * Architectural Decisions:
 * 1. Streamable HTTP Transport: Databricks MCP servers communicate over Streamable HTTP (POST /api/2.0/mcp/...)
 *    authenticated via Personal Access Tokens (PAT) or Databricks OAuth 2.0 bearer tokens.
 * 2. Unified Gateway & Scope Modeling: Maps each Databricks service to its Unity Catalog gateway identifier
 *    (e.g., system.ai.genie_one_mcp) and required OAuth scope.
 * 3. Dynamic Endpoint Interpolation: Computes real-time MCP server URLs based on workspace hostname,
 *    catalogs, schemas, indexes, and optional function targets.
 * 4. Zero-Friction Palette Integration: Supplies `DATABRICKS_MCP_DEFAULT_TOOLS` and detection utilities
 *    to register Databricks tools seamlessly in the canvas and tool inspector drawers.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import {
  DatabricksMcpConfig,
  DatabricksMcpServerDefinition,
  DatabricksMcpServiceType,
  ToolDefinition,
} from '../../shared/types';

/**
 * Master catalog of official Databricks Managed MCP Server definitions.
 */
export const DATABRICKS_MCP_SERVERS: DatabricksMcpServerDefinition[] = [
  // 1. Databricks Genie Space MCP
  {
    id: 'databricks_mcp_genie',
    name: 'Databricks Genie Space MCP',
    serviceName: 'Genie Space',
    serviceType: 'genie',
    unityGatewayName: 'system.ai.genie_one_mcp',
    oauthScope: 'genie',
    endpointTemplate: 'https://{workspace_hostname}/api/2.0/mcp/genie/{genie_space_id}',
    description: 'Query enterprise tabular datasets and metrics conversationally using Databricks Genie spaces and AI/BI rooms.',
    icon: 'Sparkles',
    defaultConfig: {
      workspaceHostname: '',
      serviceType: 'genie',
      genieSpaceId: '',
    },
    sampleTools: ['query_genie_space', 'get_genie_space_status'],
  },

  // 2. Databricks Vector Search MCP
  {
    id: 'databricks_mcp_vector_search',
    name: 'Databricks Vector Search MCP',
    serviceName: 'Vector Search',
    serviceType: 'vector_search',
    unityGatewayName: 'system.ai.vector_search',
    oauthScope: 'vector-search',
    endpointTemplate: 'https://{workspace_hostname}/api/2.0/mcp/vector-search/{catalog}/{schema}/{index_name}',
    description: 'Execute similarity search and hybrid lexical/vector queries against Databricks Vector Search indexes.',
    icon: 'Database',
    defaultConfig: {
      workspaceHostname: '',
      serviceType: 'vector_search',
      catalog: 'main',
      schema: 'default',
      indexName: '',
    },
    sampleTools: ['vector_search_query', 'vector_search_sync'],
  },

  // 3. Databricks Unity Catalog Functions MCP
  {
    id: 'databricks_mcp_uc_functions',
    name: 'Databricks Unity Catalog Functions MCP',
    serviceName: 'Unity Catalog Functions',
    serviceType: 'uc_functions',
    oauthScope: 'unity-catalog',
    endpointTemplate: 'https://{workspace_hostname}/api/2.0/mcp/functions/{catalog}/{schema}',
    description: 'Discover and execute governed SQL and Python UDFs and tools defined in Databricks Unity Catalog.',
    icon: 'Code',
    defaultConfig: {
      workspaceHostname: '',
      serviceType: 'uc_functions',
      catalog: 'main',
      schema: 'default',
      functionName: '',
    },
    sampleTools: ['execute_function', 'list_functions'],
  },

  // 4. Databricks SQL Warehouse MCP
  {
    id: 'databricks_mcp_dbsql',
    name: 'Databricks SQL Warehouse MCP',
    serviceName: 'Databricks SQL',
    serviceType: 'dbsql',
    unityGatewayName: 'system.ai.dbsql',
    oauthScope: 'sql',
    endpointTemplate: 'https://{workspace_hostname}/api/2.0/mcp/sql',
    description: 'Run ANSI SQL queries, explore data catalogs, and fetch results from Databricks Serverless SQL Warehouses.',
    icon: 'Terminal',
    defaultConfig: {
      workspaceHostname: '',
      serviceType: 'dbsql',
      warehouseId: '',
    },
    sampleTools: ['execute_sql_query', 'get_statement_status'],
  },
];

/**
 * Normalizes a user-supplied Databricks workspace hostname by removing protocol schemes and trailing slashes.
 *
 * Logic Flow:
 * // Section 1: Strip whitespace
 * // Section 2: Strip https:// or http:// prefixes
 * // Section 3: Strip trailing slashes and return clean hostname or fallback placeholder
 *
 * @param hostname Raw input hostname (e.g. "https://my-org.cloud.databricks.com/")
 * @returns Clean hostname without protocol or trailing slash
 */
export function normalizeDatabricksHostname(hostname?: string): string {
  // Section 1: Strip whitespace
  const trimmed = (hostname || '').trim();
  if (!trimmed) {
    return '<workspace-hostname>';
  }

  // Section 2: Strip protocol prefixes
  let cleaned = trimmed.replace(/^https?:\/\//i, '');

  // Section 3: Strip trailing slashes
  cleaned = cleaned.replace(/\/+$/, '');

  return cleaned || '<workspace-hostname>';
}

/**
 * Constructs the fully qualified Streamable HTTP MCP server URL for a Databricks MCP server configuration.
 *
 * Logic Flow:
 * // Section 1: Normalize workspace hostname
 * // Section 2: Switch on serviceType to interpolate path parameters
 *
 * @param config Databricks MCP server configuration
 * @returns Fully qualified HTTPS endpoint URL
 */
export function buildDatabricksMcpEndpoint(config: DatabricksMcpConfig): string {
  // Section 1: Normalize workspace hostname
  const host = normalizeDatabricksHostname(config.workspaceHostname);

  // Section 2: Switch on serviceType to interpolate path parameters
  switch (config.serviceType) {
    case 'genie': {
      const spaceId = config.genieSpaceId?.trim() || '<genie-space-id>';
      return `https://${host}/api/2.0/mcp/genie/${spaceId}`;
    }
    case 'vector_search': {
      const catalog = config.catalog?.trim() || 'main';
      const schema = config.schema?.trim() || 'default';
      const indexName = config.indexName?.trim() || '<index-name>';
      return `https://${host}/api/2.0/mcp/vector-search/${catalog}/${schema}/${indexName}`;
    }
    case 'uc_functions': {
      const catalog = config.catalog?.trim() || 'main';
      const schema = config.schema?.trim() || 'default';
      const func = config.functionName?.trim();
      if (func) {
        return `https://${host}/api/2.0/mcp/functions/${catalog}/${schema}/${func}`;
      }
      return `https://${host}/api/2.0/mcp/functions/${catalog}/${schema}`;
    }
    case 'dbsql': {
      return `https://${host}/api/2.0/mcp/sql`;
    }
    default: {
      return `https://${host}/api/2.0/mcp`;
    }
  }
}

/**
 * Constructs the Databricks OAuth 2.0 authorization and token endpoint URLs for a given workspace.
 *
 * @param hostname Databricks workspace hostname
 * @returns Object with authUrl and tokenUrl
 */
export function buildDatabricksOAuthUrls(hostname?: string): { authUrl: string; tokenUrl: string } {
  const host = normalizeDatabricksHostname(hostname);
  return {
    authUrl: `https://${host}/oidc/v1/authorize`,
    tokenUrl: `https://${host}/oidc/v1/token`,
  };
}

/**
 * Instantiates a canvas-ready ToolDefinition from a Databricks Managed MCP server definition.
 *
 * Logic Flow:
 * // Section 1: Merge default configuration with caller overrides
 * // Section 2: Compute effective endpoint URL and OAuth endpoints
 * // Section 3: Assemble ToolDefinition with Bearer token authentication and secret configuration
 *
 * @param server Databricks MCP server definition
 * @param overrides Optional partial configuration overrides
 * @returns Ready-to-use ToolDefinition
 */
export function createToolDefinitionFromDatabricksMcpServer(
  server: DatabricksMcpServerDefinition,
  overrides?: Partial<DatabricksMcpConfig>
): ToolDefinition {
  // Section 1: Merge configuration
  const mergedConfig: DatabricksMcpConfig = {
    ...server.defaultConfig,
    ...(overrides || {}),
  };

  // Section 2: Compute endpoints
  const endpoint = buildDatabricksMcpEndpoint(mergedConfig);
  const oauthUrls = buildDatabricksOAuthUrls(mergedConfig.workspaceHostname);

  // Section 3: Assemble ToolDefinition
  return {
    id: server.id,
    name: server.name,
    description: server.description,
    type: 'mcp',
    category: 'mcp',
    icon: server.icon,
    enabled: true,
    endpoint,
    authType: 'bearer',
    secretName: 'databricks-mcp-token',
    mcpConfig: {
      serverName: server.id,
      transport: 'http',
      serverUrl: endpoint,
      timeoutSeconds: 30,
      authProviderType: 'bearer_token',
      oauthConfig: {
        ...oauthUrls,
        scopes: [server.oauthScope],
      },
      secretConfig: {
        secretName: 'databricks-mcp-token',
        envVar: 'DATABRICKS_TOKEN',
        authUrl: oauthUrls.authUrl,
        tokenUrl: oauthUrls.tokenUrl,
        scopes: [server.oauthScope],
      },
      databricksConfig: mergedConfig,
      exposedTools: server.sampleTools,
    },
  };
}

/**
 * Pre-instantiated default ToolDefinitions for all 4 Databricks Managed MCP servers.
 */
export const DATABRICKS_MCP_DEFAULT_TOOLS: ToolDefinition[] = DATABRICKS_MCP_SERVERS.map((server) =>
  createToolDefinitionFromDatabricksMcpServer(server)
);

/**
 * Checks whether a given tool or ID represents a Databricks Managed MCP server.
 *
 * @param toolOrId Tool definition, tool identifier string, or undefined
 * @returns boolean indicating if the tool is a Databricks Managed MCP tool
 */
export function isDatabricksMcpTool(toolOrId?: ToolDefinition | string | null): boolean {
  if (!toolOrId) return false;
  if (typeof toolOrId === 'string') {
    return toolOrId.startsWith('databricks_mcp_');
  }
  if (toolOrId.id && toolOrId.id.startsWith('databricks_mcp_')) {
    return true;
  }
  if (toolOrId.mcpConfig?.databricksConfig !== undefined) {
    return true;
  }
  return false;
}
