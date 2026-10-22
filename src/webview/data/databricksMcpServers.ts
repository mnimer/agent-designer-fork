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
 * Collapsed into a single unified Databricks Managed MCP tool whose serviceType
 * (Genie Space, Vector Search, Unity Catalog Functions, or Databricks SQL) is selected
 * in the property drawer dropdown.
 */
export const DATABRICKS_MCP_SERVERS: DatabricksMcpServerDefinition[] = [
  {
    id: 'databricks_mcp',
    name: 'Databricks Managed MCP',
    serviceName: 'Databricks Managed MCP',
    serviceType: 'genie',
    unityGatewayName: 'system.ai.genie_one_mcp',
    oauthScope: 'genie',
    endpointTemplate: 'https://{workspace_hostname}/api/2.0/mcp/genie/{genie_space_id}',
    description: 'Connect to Databricks Genie spaces, Vector Search indexes, Unity Catalog Functions, or Databricks SQL Warehouses over Managed MCP.',
    icon: 'Sparkles',
    defaultConfig: {
      workspaceHostname: '',
      serviceType: 'genie',
      genieSpaceId: '',
      catalog: 'main',
      schema: 'default',
      indexName: '',
      functionName: '',
      warehouseId: '',
    },
    sampleTools: ['query_genie_space', 'vector_search_query', 'execute_function', 'execute_sql_query'],
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
    return toolOrId === 'databricks_mcp' || toolOrId.startsWith('databricks_mcp_');
  }
  if (toolOrId.id && (toolOrId.id === 'databricks_mcp' || toolOrId.id.startsWith('databricks_mcp_'))) {
    return true;
  }
  if (toolOrId.mcpConfig?.databricksConfig !== undefined) {
    return true;
  }
  return false;
}
