/**
 * Snowflake Managed & Cortex MCP Servers Registry
 *
 * Job / Purpose:
 * Central catalog, DDL generator, and helper utilities for Snowflake Managed MCP servers and
 * Cortex AI capabilities (Cortex Analyst, Cortex Search, Cortex Agent, SQL Warehouses, and Custom Stored Procedures).
 *
 * Architectural Decisions:
 * 1. Dual Deployment Modes:
 *    - `managed_http`: Snowflake-hosted native MCP server object (MCP Specification 2024-11-05 Streamable HTTP)
 *      accessed at `https://<account>/api/v2/databases/<db>/schemas/<schema>/mcp-servers/<server>`.
 *    - `stdio_labs`: Snowflake Labs local MCP adapter (`uvx snowflake-labs-mcp`) communicating over stdio.
 * 2. Snowflake SQL DDL Generation: `generateSnowflakeMcpServerDdl` produces fully formatted, copy-ready
 *    `CREATE OR REPLACE MCP SERVER ... FROM SPECIFICATION $$ ... $$;` statements matching Snowflake documentation.
 * 3. Account URL Normalization: Normalizes underscore-based Snowflake account locators (e.g. `myorg_myacc`)
 *    into DNS-compatible hyphenated hostnames (`myorg-myacc.snowflakecomputing.com`).
 * 4. Role-Scoped Bearer Auth: Automates OAuth 2.0 configuration with `session:role:<ROLE>` scopes and SecretStorage pointers.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import {
  SnowflakeMcpConfig,
  SnowflakeMcpDeploymentMode,
  SnowflakeMcpServerDefinition,
  SnowflakeMcpToolType,
  ToolDefinition,
} from '../../shared/types';

/**
 * Master catalog of official Snowflake Managed & Cortex MCP Server definitions.
 */
export const SNOWFLAKE_MCP_SERVERS: SnowflakeMcpServerDefinition[] = [
  // 1. Cortex Analyst MCP
  {
    id: 'snowflake_mcp_cortex_analyst',
    name: 'Snowflake Cortex Analyst MCP',
    serviceName: 'Cortex Analyst',
    toolType: 'CORTEX_ANALYST_MESSAGE',
    endpointTemplate: 'https://{account_url}/api/v2/databases/{database}/schemas/{schema}/mcp-servers/{mcp_server_name}',
    description: 'Natural language structured data question-answering powered by Snowflake Cortex Analyst and Semantic Models.',
    icon: 'Sparkles',
    defaultConfig: {
      deploymentMode: 'managed_http',
      accountUrl: '',
      database: '',
      schema: '',
      mcpServerName: 'cortex_analyst_server',
      toolType: 'CORTEX_ANALYST_MESSAGE',
      semanticView: '',
      warehouse: 'COMPUTE_WH',
      role: 'ANALYST',
    },
    sampleTools: ['cortex_analyst_message'],
  },

  // 2. Cortex Search MCP
  {
    id: 'snowflake_mcp_cortex_search',
    name: 'Snowflake Cortex Search MCP',
    serviceName: 'Cortex Search',
    toolType: 'CORTEX_SEARCH_SERVICE_QUERY',
    endpointTemplate: 'https://{account_url}/api/v2/databases/{database}/schemas/{schema}/mcp-servers/{mcp_server_name}',
    description: 'Vector and hybrid lexical search against enterprise document chunks indexed by Snowflake Cortex Search.',
    icon: 'Database',
    defaultConfig: {
      deploymentMode: 'managed_http',
      accountUrl: '',
      database: '',
      schema: '',
      mcpServerName: 'cortex_search_server',
      toolType: 'CORTEX_SEARCH_SERVICE_QUERY',
      searchServiceName: '',
      warehouse: 'COMPUTE_WH',
      role: 'ANALYST',
    },
    sampleTools: ['cortex_search_query'],
  },

  // 3. Cortex Agent MCP
  {
    id: 'snowflake_mcp_cortex_agent',
    name: 'Snowflake Cortex Agent MCP',
    serviceName: 'Cortex Agent',
    toolType: 'CORTEX_AGENT_RUN',
    endpointTemplate: 'https://{account_url}/api/v2/databases/{database}/schemas/{schema}/mcp-servers/{mcp_server_name}',
    description: 'Autonomous multi-step conversational agent orchestrating Cortex Search and Analyst services.',
    icon: 'Bot',
    defaultConfig: {
      deploymentMode: 'managed_http',
      accountUrl: '',
      database: '',
      schema: '',
      mcpServerName: 'cortex_agent_server',
      toolType: 'CORTEX_AGENT_RUN',
      cortexAgentName: '',
      warehouse: 'COMPUTE_WH',
      role: 'ANALYST',
    },
    sampleTools: ['cortex_agent_run'],
  },

  // 4. SQL & Custom Tools MCP
  {
    id: 'snowflake_mcp_sql_and_tools',
    name: 'Snowflake SQL & Custom Tools MCP',
    serviceName: 'SQL & Custom Procedures',
    toolType: 'SYSTEM_EXECUTE_SQL',
    endpointTemplate: 'https://{account_url}/api/v2/databases/{database}/schemas/{schema}/mcp-servers/{mcp_server_name}',
    description: 'Execute ANSI SQL statements, call stored procedures, and run user-defined functions on Snowflake.',
    icon: 'Terminal',
    defaultConfig: {
      deploymentMode: 'managed_http',
      accountUrl: '',
      database: '',
      schema: '',
      mcpServerName: 'sql_tools_server',
      toolType: 'SYSTEM_EXECUTE_SQL',
      warehouse: 'COMPUTE_WH',
      role: 'SYSADMIN',
    },
    sampleTools: ['execute_sql', 'call_procedure'],
  },
];

/**
 * Normalizes a user-supplied Snowflake account identifier or URL into a valid Snowflake computing hostname.
 *
 * Logic Flow:
 * // Section 1: Handle empty input fallback
 * // Section 2: Strip protocol and trailing slashes
 * // Section 3: Convert underscores to hyphens in hostname part
 * // Section 4: Append default .snowflakecomputing.com domain if no domain dot present
 *
 * @param accountUrl Raw input account URL or identifier (e.g. "myorg_myaccount" or "https://xy12345.us-east-1.snowflakecomputing.com/")
 * @returns Fully qualified hostname (e.g. "myorg-myaccount.snowflakecomputing.com")
 */
export function normalizeSnowflakeAccountUrl(accountUrl?: string): string {
  // Section 1: Handle empty input fallback
  const trimmed = (accountUrl || '').trim();
  if (!trimmed) {
    return '<account-identifier>.snowflakecomputing.com';
  }

  // Section 2: Strip protocol and trailing slashes
  const cleaned = trimmed.replace(/^https?:\/\//i, '').replace(/\/+$/, '');

  // Section 3: Convert underscores to hyphens in hostname part
  const [hostPart, ...rest] = cleaned.split('/');
  let normalizedHost = hostPart.replace(/_/g, '-');

  // Section 4: Append default domain if dot is absent
  if (!normalizedHost.includes('.')) {
    normalizedHost = `${normalizedHost}.snowflakecomputing.com`;
  }

  return rest.length > 0 ? `${normalizedHost}/${rest.join('/')}` : normalizedHost;
}

/**
 * Constructs the fully qualified Streamable HTTP MCP server URL for a Snowflake Managed MCP server.
 *
 * Logic Flow:
 * // Section 1: Normalize account URL
 * // Section 2: Safely encode path parameters (database, schema, mcpServerName)
 *
 * @param config Snowflake MCP server configuration
 * @returns Fully qualified HTTPS endpoint URL
 */
export function buildSnowflakeMcpEndpoint(config: SnowflakeMcpConfig): string {
  // Section 1: Normalize account URL
  const host = normalizeSnowflakeAccountUrl(config.accountUrl);

  // Section 2: Safely encode path parameters
  const db = config.database?.trim() || '<database>';
  const schema = config.schema?.trim() || '<schema>';
  const serverName = config.mcpServerName?.trim() || '<mcp-server-name>';

  return `https://${host}/api/v2/databases/${encodeURIComponent(db)}/schemas/${encodeURIComponent(schema)}/mcp-servers/${encodeURIComponent(serverName)}`;
}

/**
 * Constructs the Snowflake OAuth 2.0 authorization and token endpoint URLs for a given account.
 *
 * @param accountUrl Snowflake account identifier or URL
 * @returns Object with authUrl and tokenUrl
 */
export function buildSnowflakeOAuthUrls(accountUrl?: string): { authUrl: string; tokenUrl: string } {
  const host = normalizeSnowflakeAccountUrl(accountUrl);
  return {
    authUrl: `https://${host}/oauth/authorize`,
    tokenUrl: `https://${host}/oauth/token-request`,
  };
}

/**
 * Generates an executable, production-ready Snowflake SQL DDL statement (`CREATE OR REPLACE MCP SERVER`).
 *
 * Logic Flow:
 * // Section 1: Resolve database, schema, server name, and warehouse defaults
 * // Section 2: Switch on toolType to emit appropriate tool specification payload
 *
 * @param config Snowflake MCP server configuration
 * @returns SQL DDL string
 */
export function generateSnowflakeMcpServerDdl(config: SnowflakeMcpConfig): string {
  // Section 1: Resolve database, schema, server name, and warehouse defaults
  const db = config.database?.trim() || '<database>';
  const schema = config.schema?.trim() || '<schema>';
  const serverName = config.mcpServerName?.trim() || '<mcp-server-name>';
  const warehouse = config.warehouse?.trim() || 'COMPUTE_WH';

  // Section 2: Switch on toolType
  switch (config.toolType) {
    case 'CORTEX_ANALYST_MESSAGE': {
      const semanticView = config.semanticView?.trim() || `${db}.${schema}.<semantic_view>`;
      return [
        `CREATE OR REPLACE MCP SERVER ${db}.${schema}.${serverName}`,
        `  FROM SPECIFICATION $$`,
        `tools:`,
        `  - name: "cortex_analyst"`,
        `    type: "CORTEX_ANALYST_MESSAGE"`,
        `    semantic_view: "${semanticView}"`,
        `    warehouse: "${warehouse}"`,
        `$$;`,
      ].join('\n');
    }
    case 'CORTEX_SEARCH_SERVICE_QUERY': {
      const searchService = config.searchServiceName?.trim() || `${db}.${schema}.<search_service>`;
      return [
        `CREATE OR REPLACE MCP SERVER ${db}.${schema}.${serverName}`,
        `  FROM SPECIFICATION $$`,
        `tools:`,
        `  - name: "cortex_search"`,
        `    type: "CORTEX_SEARCH_SERVICE_QUERY"`,
        `    search_service: "${searchService}"`,
        `    warehouse: "${warehouse}"`,
        `$$;`,
      ].join('\n');
    }
    case 'CORTEX_AGENT_RUN': {
      const agentName = config.cortexAgentName?.trim() || '<cortex_agent_name>';
      return [
        `CREATE OR REPLACE MCP SERVER ${db}.${schema}.${serverName}`,
        `  FROM SPECIFICATION $$`,
        `tools:`,
        `  - name: "cortex_agent"`,
        `    type: "CORTEX_AGENT_RUN"`,
        `    agent_name: "${agentName}"`,
        `    warehouse: "${warehouse}"`,
        `$$;`,
      ].join('\n');
    }
    case 'SYSTEM_EXECUTE_SQL': {
      return [
        `CREATE OR REPLACE MCP SERVER ${db}.${schema}.${serverName}`,
        `  FROM SPECIFICATION $$`,
        `tools:`,
        `  - name: "execute_sql"`,
        `    type: "SYSTEM_EXECUTE_SQL"`,
        `    warehouse: "${warehouse}"`,
        `$$;`,
      ].join('\n');
    }
    case 'GENERIC': {
      const identifier = config.procedureName?.trim() || `${db}.${schema}.<procedure_or_function>`;
      return [
        `CREATE OR REPLACE MCP SERVER ${db}.${schema}.${serverName}`,
        `  FROM SPECIFICATION $$`,
        `tools:`,
        `  - name: "custom_procedure"`,
        `    type: "GENERIC"`,
        `    identifier: "${identifier}"`,
        `    warehouse: "${warehouse}"`,
        `$$;`,
      ].join('\n');
    }
    default: {
      return [
        `CREATE OR REPLACE MCP SERVER ${db}.${schema}.${serverName}`,
        `  FROM SPECIFICATION $$`,
        `tools:`,
        `  - name: "execute_sql"`,
        `    type: "SYSTEM_EXECUTE_SQL"`,
        `    warehouse: "${warehouse}"`,
        `$$;`,
      ].join('\n');
    }
  }
}

/**
 * Instantiates a canvas-ready ToolDefinition from a Snowflake MCP server definition.
 *
 * Logic Flow:
 * // Section 1: Merge default configuration with caller overrides
 * // Section 2: Determine deployment mode (managed_http vs stdio_labs)
 * // Section 3: Assemble ToolDefinition with Bearer token authentication and secret configuration
 *
 * @param server Snowflake MCP server definition
 * @param overrides Optional partial configuration overrides
 * @returns Ready-to-use ToolDefinition
 */
export function createToolDefinitionFromSnowflakeMcpServer(
  server: SnowflakeMcpServerDefinition,
  overrides?: Partial<SnowflakeMcpConfig>
): ToolDefinition {
  // Section 1: Merge configuration
  const mergedConfig: SnowflakeMcpConfig = {
    ...server.defaultConfig,
    ...(overrides || {}),
  };

  // Section 2: Determine deployment mode
  const isStdio = mergedConfig.deploymentMode === 'stdio_labs';
  const endpoint = buildSnowflakeMcpEndpoint(mergedConfig);
  const oauthUrls = buildSnowflakeOAuthUrls(mergedConfig.accountUrl);
  const role = mergedConfig.role?.trim() || 'ANALYST';
  const roleScope = `session:role:${role}`;

  // Section 3: Assemble ToolDefinition
  return {
    id: server.id,
    name: server.name,
    description: server.description,
    type: 'mcp',
    category: 'mcp',
    icon: server.icon,
    enabled: true,
    endpoint: isStdio ? undefined : endpoint,
    authType: 'bearer',
    secretName: 'snowflake-mcp-token',
    mcpConfig: {
      serverName: server.id,
      transport: isStdio ? 'stdio' : 'http',
      command: isStdio ? 'uvx' : undefined,
      args: isStdio ? ['snowflake-labs-mcp', '--service-config-file', 'tools_config.yaml'] : undefined,
      serverUrl: isStdio ? undefined : endpoint,
      timeoutSeconds: 30,
      authProviderType: 'bearer_token',
      oauthConfig: {
        ...oauthUrls,
        scopes: [roleScope],
      },
      secretConfig: {
        secretName: 'snowflake-mcp-token',
        envVar: 'SNOWFLAKE_MCP_TOKEN',
        authUrl: oauthUrls.authUrl,
        tokenUrl: oauthUrls.tokenUrl,
        scopes: [roleScope],
      },
      snowflakeConfig: mergedConfig,
      exposedTools: server.sampleTools,
    },
  };
}

/**
 * Pre-instantiated default ToolDefinitions for all 4 Snowflake Managed & Cortex MCP servers.
 */
export const SNOWFLAKE_MCP_DEFAULT_TOOLS: ToolDefinition[] = SNOWFLAKE_MCP_SERVERS.map((server) =>
  createToolDefinitionFromSnowflakeMcpServer(server)
);

/**
 * Checks whether a given tool or ID represents a Snowflake Managed MCP server.
 *
 * @param toolOrId Tool definition, tool identifier string, or undefined
 * @returns boolean indicating if the tool is a Snowflake Managed MCP tool
 */
export function isSnowflakeMcpTool(toolOrId?: ToolDefinition | string | null): boolean {
  if (!toolOrId) return false;
  if (typeof toolOrId === 'string') {
    return toolOrId.startsWith('snowflake_mcp_');
  }
  if (toolOrId.id && toolOrId.id.startsWith('snowflake_mcp_')) {
    return true;
  }
  if (toolOrId.mcpConfig?.snowflakeConfig !== undefined) {
    return true;
  }
  return false;
}
