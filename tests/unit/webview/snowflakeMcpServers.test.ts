/**
 * Unit Tests for Snowflake Managed & Cortex MCP Servers Registry
 *
 * Validates:
 * 1. Catalog definitions for all 4 official Snowflake Managed MCP servers:
 *    - Cortex Analyst MCP (CORTEX_ANALYST_MESSAGE)
 *    - Cortex Search MCP (CORTEX_SEARCH_SERVICE_QUERY)
 *    - Cortex Agent MCP (CORTEX_AGENT_RUN)
 *    - SQL & Custom Tools MCP (SYSTEM_EXECUTE_SQL)
 * 2. Snowflake account URL normalizer (underscore-to-hyphen conversion, domain suffixing, protocol stripping).
 * 3. Streamable HTTP endpoint URL builder for Snowflake MCP objects.
 * 4. OAuth URL builder for Snowflake OAuth endpoints.
 * 5. Snowflake SQL DDL statement generator across all 5 tool types.
 * 6. Dual deployment modes: managed_http (HTTP) vs stdio_labs (stdio with uvx).
 * 7. Snowflake tool detection helper (isSnowflakeMcpTool).
 * 8. Category routing via categorizeTools into 'mcp'.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it, expect } from 'vitest';
import {
  SNOWFLAKE_MCP_SERVERS,
  SNOWFLAKE_MCP_DEFAULT_TOOLS,
  normalizeSnowflakeAccountUrl,
  buildSnowflakeMcpEndpoint,
  buildSnowflakeOAuthUrls,
  generateSnowflakeMcpServerDdl,
  createToolDefinitionFromSnowflakeMcpServer,
  isSnowflakeMcpTool,
} from '../../../src/webview/data/snowflakeMcpServers';
import { categorizeTools } from '../../../src/webview/data/builtinTools';
import { SnowflakeMcpConfig, ToolDefinition } from '../../../src/shared/types';

describe('Snowflake Managed & Cortex MCP Servers Registry', () => {
  it('should register all 4 official Snowflake Managed MCP servers', () => {
    expect(SNOWFLAKE_MCP_SERVERS).toHaveLength(4);
    expect(SNOWFLAKE_MCP_DEFAULT_TOOLS).toHaveLength(4);

    const ids = SNOWFLAKE_MCP_SERVERS.map((s) => s.id);
    expect(ids).toEqual([
      'snowflake_mcp_cortex_analyst',
      'snowflake_mcp_cortex_search',
      'snowflake_mcp_cortex_agent',
      'snowflake_mcp_sql_and_tools',
    ]);
  });

  it('should ensure each server definition has valid metadata and unique IDs', () => {
    const seenIds = new Set<string>();

    for (const server of SNOWFLAKE_MCP_SERVERS) {
      expect(seenIds.has(server.id)).toBe(false);
      seenIds.add(server.id);

      expect(server.id.startsWith('snowflake_mcp_')).toBe(true);
      expect(server.name.trim().length).toBeGreaterThan(0);
      expect(server.serviceName.trim().length).toBeGreaterThan(0);
      expect(server.description.trim().length).toBeGreaterThan(0);
      expect(server.endpointTemplate.startsWith('https://')).toBe(true);
      expect(server.defaultConfig.toolType).toBe(server.toolType);
      expect(Array.isArray(server.sampleTools)).toBe(true);
      expect(server.sampleTools!.length).toBeGreaterThan(0);
    }
  });

  describe('normalizeSnowflakeAccountUrl', () => {
    it('should convert account identifier underscores to hyphens and append domain', () => {
      expect(normalizeSnowflakeAccountUrl('myorg_myaccount')).toBe(
        'myorg-myaccount.snowflakecomputing.com'
      );
    });

    it('should strip https://, http://, and trailing slashes while normalizing host', () => {
      expect(
        normalizeSnowflakeAccountUrl('https://myorg_myaccount.snowflakecomputing.com/')
      ).toBe('myorg-myaccount.snowflakecomputing.com');

      expect(
        normalizeSnowflakeAccountUrl('http://xy12345.us-east-1.snowflakecomputing.com///')
      ).toBe('xy12345.us-east-1.snowflakecomputing.com');
    });

    it('should fall back to placeholder when input is empty or whitespace', () => {
      expect(normalizeSnowflakeAccountUrl('')).toBe('<account-identifier>.snowflakecomputing.com');
      expect(normalizeSnowflakeAccountUrl(undefined)).toBe('<account-identifier>.snowflakecomputing.com');
      expect(normalizeSnowflakeAccountUrl('   ')).toBe('<account-identifier>.snowflakecomputing.com');
    });
  });

  describe('buildSnowflakeMcpEndpoint', () => {
    it('should build fully qualified HTTPS endpoint with URL-encoded parameters', () => {
      const config: SnowflakeMcpConfig = {
        accountUrl: 'myorg_myaccount',
        database: 'FINANCE_DB',
        schema: 'SALES_SCHEMA',
        mcpServerName: 'cortex_analyst_server',
        toolType: 'CORTEX_ANALYST_MESSAGE',
      };

      expect(buildSnowflakeMcpEndpoint(config)).toBe(
        'https://myorg-myaccount.snowflakecomputing.com/api/v2/databases/FINANCE_DB/schemas/SALES_SCHEMA/mcp-servers/cortex_analyst_server'
      );
    });

    it('should use placeholders when parameters are missing', () => {
      const emptyConfig: SnowflakeMcpConfig = {
        accountUrl: '',
        database: '',
        schema: '',
        mcpServerName: '',
        toolType: 'CORTEX_ANALYST_MESSAGE',
      };

      expect(buildSnowflakeMcpEndpoint(emptyConfig)).toBe(
        'https://<account-identifier>.snowflakecomputing.com/api/v2/databases/%3Cdatabase%3E/schemas/%3Cschema%3E/mcp-servers/%3Cmcp-server-name%3E'
      );
    });
  });

  describe('buildSnowflakeOAuthUrls', () => {
    it('should build authorize and token-request URLs with normalized host', () => {
      const urls = buildSnowflakeOAuthUrls('myorg_prod');
      expect(urls.authUrl).toBe(
        'https://myorg-prod.snowflakecomputing.com/oauth/authorize'
      );
      expect(urls.tokenUrl).toBe(
        'https://myorg-prod.snowflakecomputing.com/oauth/token-request'
      );
    });
  });

  describe('generateSnowflakeMcpServerDdl', () => {
    it('should generate DDL for CORTEX_ANALYST_MESSAGE with semantic_view', () => {
      const config: SnowflakeMcpConfig = {
        accountUrl: 'myorg-acct',
        database: 'ANALYTICS',
        schema: 'PUBLIC',
        mcpServerName: 'analyst_server',
        toolType: 'CORTEX_ANALYST_MESSAGE',
        semanticView: 'ANALYTICS.PUBLIC.REVENUE_VIEW',
        warehouse: 'XSMALL_WH',
      };

      const ddl = generateSnowflakeMcpServerDdl(config);
      expect(ddl).toContain('CREATE OR REPLACE MCP SERVER ANALYTICS.PUBLIC.analyst_server');
      expect(ddl).toContain('type: "CORTEX_ANALYST_MESSAGE"');
      expect(ddl).toContain('semantic_view: "ANALYTICS.PUBLIC.REVENUE_VIEW"');
      expect(ddl).toContain('warehouse: "XSMALL_WH"');
    });

    it('should generate DDL for CORTEX_SEARCH_SERVICE_QUERY with search_service', () => {
      const config: SnowflakeMcpConfig = {
        accountUrl: 'myorg-acct',
        database: 'DOCS_DB',
        schema: 'SEARCH',
        mcpServerName: 'doc_search_server',
        toolType: 'CORTEX_SEARCH_SERVICE_QUERY',
        searchServiceName: 'DOCS_DB.SEARCH.KB_SEARCH_SERVICE',
      };

      const ddl = generateSnowflakeMcpServerDdl(config);
      expect(ddl).toContain('type: "CORTEX_SEARCH_SERVICE_QUERY"');
      expect(ddl).toContain('search_service: "DOCS_DB.SEARCH.KB_SEARCH_SERVICE"');
      expect(ddl).toContain('warehouse: "COMPUTE_WH"');
    });

    it('should generate DDL for CORTEX_AGENT_RUN with agent_name', () => {
      const config: SnowflakeMcpConfig = {
        accountUrl: 'myorg-acct',
        database: 'AI_DB',
        schema: 'AGENTS',
        mcpServerName: 'support_agent_server',
        toolType: 'CORTEX_AGENT_RUN',
        cortexAgentName: 'customer_support_agent',
      };

      const ddl = generateSnowflakeMcpServerDdl(config);
      expect(ddl).toContain('type: "CORTEX_AGENT_RUN"');
      expect(ddl).toContain('agent_name: "customer_support_agent"');
    });

    it('should generate DDL for SYSTEM_EXECUTE_SQL', () => {
      const config: SnowflakeMcpConfig = {
        accountUrl: 'myorg-acct',
        database: 'DATA_DB',
        schema: 'PUBLIC',
        mcpServerName: 'sql_server',
        toolType: 'SYSTEM_EXECUTE_SQL',
      };

      const ddl = generateSnowflakeMcpServerDdl(config);
      expect(ddl).toContain('type: "SYSTEM_EXECUTE_SQL"');
      expect(ddl).toContain('name: "execute_sql"');
    });

    it('should generate DDL for GENERIC custom procedures with identifier', () => {
      const config: SnowflakeMcpConfig = {
        accountUrl: 'myorg-acct',
        database: 'UTILS_DB',
        schema: 'PROCS',
        mcpServerName: 'custom_proc_server',
        toolType: 'GENERIC',
        procedureName: 'UTILS_DB.PROCS.PROCESS_ORDER',
      };

      const ddl = generateSnowflakeMcpServerDdl(config);
      expect(ddl).toContain('type: "GENERIC"');
      expect(ddl).toContain('identifier: "UTILS_DB.PROCS.PROCESS_ORDER"');
    });
  });

  describe('createToolDefinitionFromSnowflakeMcpServer', () => {
    it('should instantiate ToolDefinition for managed_http mode', () => {
      const serverDef = SNOWFLAKE_MCP_SERVERS.find((s) => s.id === 'snowflake_mcp_cortex_analyst')!;
      const tool = createToolDefinitionFromSnowflakeMcpServer(serverDef, {
        accountUrl: 'myorg_sales',
        database: 'SALES_DB',
        schema: 'CORTEX',
        mcpServerName: 'sales_analyst',
        role: 'FINANCE_ROLE',
      });

      expect(tool.id).toBe('snowflake_mcp_cortex_analyst');
      expect(tool.type).toBe('mcp');
      expect(tool.authType).toBe('bearer');
      expect(tool.secretName).toBe('snowflake-mcp-token');
      expect(tool.endpoint).toBe(
        'https://myorg-sales.snowflakecomputing.com/api/v2/databases/SALES_DB/schemas/CORTEX/mcp-servers/sales_analyst'
      );
      expect(tool.mcpConfig?.transport).toBe('http');
      expect(tool.mcpConfig?.command).toBeUndefined();
      expect(tool.mcpConfig?.oauthConfig?.scopes).toEqual(['session:role:FINANCE_ROLE']);
      expect(tool.mcpConfig?.secretConfig?.secretName).toBe('snowflake-mcp-token');
      expect(tool.mcpConfig?.secretConfig?.envVar).toBe('SNOWFLAKE_MCP_TOKEN');
      expect(tool.mcpConfig?.snowflakeConfig?.role).toBe('FINANCE_ROLE');
    });

    it('should configure stdio transport for stdio_labs mode', () => {
      const serverDef = SNOWFLAKE_MCP_SERVERS.find((s) => s.id === 'snowflake_mcp_sql_and_tools')!;
      const tool = createToolDefinitionFromSnowflakeMcpServer(serverDef, {
        deploymentMode: 'stdio_labs',
      });

      expect(tool.endpoint).toBeUndefined();
      expect(tool.mcpConfig?.transport).toBe('stdio');
      expect(tool.mcpConfig?.command).toBe('uvx');
      expect(tool.mcpConfig?.args).toEqual([
        'snowflake-labs-mcp',
        '--service-config-file',
        'tools_config.yaml',
      ]);
      expect(tool.mcpConfig?.serverUrl).toBeUndefined();
    });
  });

  describe('isSnowflakeMcpTool', () => {
    it('should identify Snowflake MCP tools by ID string or ToolDefinition', () => {
      expect(isSnowflakeMcpTool('snowflake_mcp_cortex_analyst')).toBe(true);
      expect(isSnowflakeMcpTool('snowflake_mcp_cortex_search')).toBe(true);
      expect(isSnowflakeMcpTool('databricks_mcp_genie')).toBe(false);
      expect(isSnowflakeMcpTool('gcp_mcp_bigquery')).toBe(false);
      expect(isSnowflakeMcpTool(null)).toBe(false);
      expect(isSnowflakeMcpTool(undefined)).toBe(false);

      const toolWithId: ToolDefinition = {
        id: 'snowflake_mcp_custom',
        name: 'Custom',
        type: 'mcp',
        description: 'Test',
      };
      expect(isSnowflakeMcpTool(toolWithId)).toBe(true);

      const toolWithConfig: ToolDefinition = {
        id: 'custom_tool',
        name: 'Custom',
        type: 'mcp',
        description: 'Test',
        mcpConfig: {
          serverName: 'custom',
          transport: 'http',
          snowflakeConfig: {
            accountUrl: 'myorg-test',
            database: 'DB',
            schema: 'SCHEMA',
            mcpServerName: 'server',
            toolType: 'SYSTEM_EXECUTE_SQL',
          },
        },
      };
      expect(isSnowflakeMcpTool(toolWithConfig)).toBe(true);

      const genericTool: ToolDefinition = {
        id: 'generic_tool',
        name: 'Generic',
        type: 'custom',
        description: 'Test',
      };
      expect(isSnowflakeMcpTool(genericTool)).toBe(false);
    });
  });

  it('should categorize Snowflake MCP tools into mcp category via categorizeTools', () => {
    const categorized = categorizeTools(SNOWFLAKE_MCP_DEFAULT_TOOLS);

    expect(categorized.mcp).toHaveLength(4);
    expect(categorized.google_cloud_mcp).toHaveLength(0);
    expect(categorized.native_adk).toHaveLength(0);
  });

  describe('Snowflake McpToolDrawer state updates & live interpolation', () => {
    it('should update serverUrl and oauthConfig when accountUrl or role changes', () => {
      const tool = createToolDefinitionFromSnowflakeMcpServer(
        SNOWFLAKE_MCP_SERVERS.find((s) => s.id === 'snowflake_mcp_cortex_analyst')!
      );

      const updatedConfig: SnowflakeMcpConfig = {
        ...tool.mcpConfig!.snowflakeConfig!,
        accountUrl: 'acme_corp',
        database: 'PROD_DB',
        schema: 'ANALYTICS',
        mcpServerName: 'analyst_v2',
        role: 'DATA_SCIENTIST',
      };

      const newUrl = buildSnowflakeMcpEndpoint(updatedConfig);
      const newOauth = buildSnowflakeOAuthUrls(updatedConfig.accountUrl);
      const roleScope = `session:role:${updatedConfig.role}`;

      expect(newUrl).toBe(
        'https://acme-corp.snowflakecomputing.com/api/v2/databases/PROD_DB/schemas/ANALYTICS/mcp-servers/analyst_v2'
      );
      expect(newOauth.authUrl).toBe(
        'https://acme-corp.snowflakecomputing.com/oauth/authorize'
      );
      expect(roleScope).toBe('session:role:DATA_SCIENTIST');
    });

    it('should switch transport and parameters when toggling deployment mode', () => {
      const httpConfig: SnowflakeMcpConfig = {
        accountUrl: 'acme-corp',
        database: 'DB',
        schema: 'PUBLIC',
        mcpServerName: 'server',
        toolType: 'SYSTEM_EXECUTE_SQL',
        deploymentMode: 'managed_http',
      };

      const serverDef = SNOWFLAKE_MCP_SERVERS.find((s) => s.id === 'snowflake_mcp_sql_and_tools')!;
      const httpTool = createToolDefinitionFromSnowflakeMcpServer(serverDef, httpConfig);
      expect(httpTool.mcpConfig?.transport).toBe('http');
      expect(httpTool.mcpConfig?.serverUrl).toBeDefined();
      expect(httpTool.mcpConfig?.command).toBeUndefined();

      const stdioConfig: SnowflakeMcpConfig = {
        ...httpConfig,
        deploymentMode: 'stdio_labs',
      };
      const stdioTool = createToolDefinitionFromSnowflakeMcpServer(serverDef, stdioConfig);
      expect(stdioTool.mcpConfig?.transport).toBe('stdio');
      expect(stdioTool.mcpConfig?.serverUrl).toBeUndefined();
      expect(stdioTool.mcpConfig?.command).toBe('uvx');
      expect(stdioTool.mcpConfig?.args).toEqual([
        'snowflake-labs-mcp',
        '--service-config-file',
        'tools_config.yaml',
      ]);
    });

    it('should dynamically update Snowflake SQL DDL when target resources change', () => {
      const config: SnowflakeMcpConfig = {
        accountUrl: 'acme-corp',
        database: 'RETAIL_DB',
        schema: 'SALES',
        mcpServerName: 'cortex_server',
        toolType: 'CORTEX_ANALYST_MESSAGE',
        semanticView: 'RETAIL_DB.SALES.ORDERS_SEMANTIC_VIEW',
        warehouse: 'LARGE_WH',
      };

      const initialDdl = generateSnowflakeMcpServerDdl(config);
      expect(initialDdl).toContain('semantic_view: "RETAIL_DB.SALES.ORDERS_SEMANTIC_VIEW"');
      expect(initialDdl).toContain('warehouse: "LARGE_WH"');

      // Update semantic view and warehouse
      const modifiedConfig: SnowflakeMcpConfig = {
        ...config,
        semanticView: 'RETAIL_DB.SALES.CUSTOMERS_SEMANTIC_VIEW',
        warehouse: 'XLARGE_WH',
      };
      const modifiedDdl = generateSnowflakeMcpServerDdl(modifiedConfig);
      expect(modifiedDdl).toContain('semantic_view: "RETAIL_DB.SALES.CUSTOMERS_SEMANTIC_VIEW"');
      expect(modifiedDdl).toContain('warehouse: "XLARGE_WH"');
    });
  });
});
