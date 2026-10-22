/**
 * Unit Tests for Databricks Managed MCP Servers Registry
 *
 * Validates:
 * 1. Catalog integrity for all 4 official Databricks Managed MCP servers:
 *    - Genie Space MCP (system.ai.genie_one_mcp)
 *    - Vector Search MCP (system.ai.vector_search)
 *    - Unity Catalog Functions MCP
 *    - Databricks SQL Warehouse MCP (system.ai.dbsql)
 * 2. Hostname normalization helper (stripping protocols, trailing slashes, fallback).
 * 3. Endpoint URL builder for all service types (genie, vector_search, uc_functions, dbsql).
 * 4. OAuth URL generator for Databricks OIDC endpoints.
 * 5. ToolDefinition builder with Bearer auth, secrets, and configuration overrides.
 * 6. Databricks tool detection helper (isDatabricksMcpTool).
 * 7. Category routing via categorizeTools into 'mcp'.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it, expect } from 'vitest';
import {
  DATABRICKS_MCP_SERVERS,
  DATABRICKS_MCP_DEFAULT_TOOLS,
  normalizeDatabricksHostname,
  buildDatabricksMcpEndpoint,
  buildDatabricksOAuthUrls,
  createToolDefinitionFromDatabricksMcpServer,
  isDatabricksMcpTool,
} from '../../../src/webview/data/databricksMcpServers';
import { categorizeTools } from '../../../src/webview/data/builtinTools';
import { DatabricksMcpConfig, ToolDefinition } from '../../../src/shared/types';

describe('Databricks Managed MCP Servers Registry', () => {
  it('should register 1 unified Databricks Managed MCP server', () => {
    expect(DATABRICKS_MCP_SERVERS).toHaveLength(1);
    expect(DATABRICKS_MCP_DEFAULT_TOOLS).toHaveLength(1);

    const ids = DATABRICKS_MCP_SERVERS.map((s) => s.id);
    expect(ids).toEqual(['databricks_mcp']);
  });

  it('should ensure each server definition has valid metadata and unique IDs', () => {
    const seenIds = new Set<string>();

    for (const server of DATABRICKS_MCP_SERVERS) {
      expect(seenIds.has(server.id)).toBe(false);
      seenIds.add(server.id);

      expect(server.id === 'databricks_mcp' || server.id.startsWith('databricks_mcp_')).toBe(true);
      expect(server.name.trim().length).toBeGreaterThan(0);
      expect(server.serviceName.trim().length).toBeGreaterThan(0);
      expect(server.description.trim().length).toBeGreaterThan(0);
      expect(server.oauthScope.trim().length).toBeGreaterThan(0);
      expect(server.endpointTemplate.startsWith('https://')).toBe(true);
      expect(server.defaultConfig.serviceType).toBe(server.serviceType);
      expect(Array.isArray(server.sampleTools)).toBe(true);
      expect(server.sampleTools!.length).toBeGreaterThan(0);
    }
  });

  it('should normalize Databricks workspace hostnames cleanly', () => {
    expect(normalizeDatabricksHostname('https://dbc-12345.cloud.databricks.com/')).toBe(
      'dbc-12345.cloud.databricks.com'
    );
    expect(normalizeDatabricksHostname('http://my-workspace.databricks.com///')).toBe(
      'my-workspace.databricks.com'
    );
    expect(normalizeDatabricksHostname('  dbc-67890.cloud.databricks.com  ')).toBe(
      'dbc-67890.cloud.databricks.com'
    );
    expect(normalizeDatabricksHostname('')).toBe('<workspace-hostname>');
    expect(normalizeDatabricksHostname(undefined)).toBe('<workspace-hostname>');
    expect(normalizeDatabricksHostname('   ')).toBe('<workspace-hostname>');
  });

  describe('buildDatabricksMcpEndpoint', () => {
    it('should build Genie Space endpoint with and without space ID', () => {
      const configWithId: DatabricksMcpConfig = {
        workspaceHostname: 'dbc-abc.cloud.databricks.com',
        serviceType: 'genie',
        genieSpaceId: '01ef4b159b32',
      };
      expect(buildDatabricksMcpEndpoint(configWithId)).toBe(
        'https://dbc-abc.cloud.databricks.com/api/2.0/mcp/genie/01ef4b159b32'
      );

      const configWithoutId: DatabricksMcpConfig = {
        workspaceHostname: 'dbc-abc.cloud.databricks.com',
        serviceType: 'genie',
      };
      expect(buildDatabricksMcpEndpoint(configWithoutId)).toBe(
        'https://dbc-abc.cloud.databricks.com/api/2.0/mcp/genie/<genie-space-id>'
      );
    });

    it('should build Vector Search endpoint with custom and default parameters', () => {
      const customConfig: DatabricksMcpConfig = {
        workspaceHostname: 'dbc-abc.cloud.databricks.com',
        serviceType: 'vector_search',
        catalog: 'prod_catalog',
        schema: 'ai_schema',
        indexName: 'product_docs_index',
      };
      expect(buildDatabricksMcpEndpoint(customConfig)).toBe(
        'https://dbc-abc.cloud.databricks.com/api/2.0/mcp/vector-search/prod_catalog/ai_schema/product_docs_index'
      );

      const defaultConfig: DatabricksMcpConfig = {
        workspaceHostname: '',
        serviceType: 'vector_search',
      };
      expect(buildDatabricksMcpEndpoint(defaultConfig)).toBe(
        'https://<workspace-hostname>/api/2.0/mcp/vector-search/main/default/<index-name>'
      );
    });

    it('should build Unity Catalog Functions endpoint with and without functionName', () => {
      const configWithFunc: DatabricksMcpConfig = {
        workspaceHostname: 'dbc-abc.cloud.databricks.com',
        serviceType: 'uc_functions',
        catalog: 'finance',
        schema: 'tax',
        functionName: 'calc_sales_tax',
      };
      expect(buildDatabricksMcpEndpoint(configWithFunc)).toBe(
        'https://dbc-abc.cloud.databricks.com/api/2.0/mcp/functions/finance/tax/calc_sales_tax'
      );

      const configWithoutFunc: DatabricksMcpConfig = {
        workspaceHostname: 'dbc-abc.cloud.databricks.com',
        serviceType: 'uc_functions',
        catalog: 'finance',
        schema: 'tax',
      };
      expect(buildDatabricksMcpEndpoint(configWithoutFunc)).toBe(
        'https://dbc-abc.cloud.databricks.com/api/2.0/mcp/functions/finance/tax'
      );
    });

    it('should build Databricks SQL endpoint', () => {
      const config: DatabricksMcpConfig = {
        workspaceHostname: 'dbc-abc.cloud.databricks.com',
        serviceType: 'dbsql',
        warehouseId: 'wh-12345',
      };
      expect(buildDatabricksMcpEndpoint(config)).toBe(
        'https://dbc-abc.cloud.databricks.com/api/2.0/mcp/sql'
      );
    });
  });

  it('should build Databricks OAuth authorization and token URLs', () => {
    const urls = buildDatabricksOAuthUrls('https://dbc-abc.cloud.databricks.com/');
    expect(urls.authUrl).toBe('https://dbc-abc.cloud.databricks.com/oidc/v1/authorize');
    expect(urls.tokenUrl).toBe('https://dbc-abc.cloud.databricks.com/oidc/v1/token');
  });

  describe('createToolDefinitionFromDatabricksMcpServer', () => {
    it('should instantiate ToolDefinition with bearer auth, secrets, and overrides', () => {
      const serverDef = DATABRICKS_MCP_SERVERS.find((s) => s.id === 'databricks_mcp')!;
      const tool = createToolDefinitionFromDatabricksMcpServer(serverDef, {
        workspaceHostname: 'my-corp.cloud.databricks.com',
        genieSpaceId: 'space-999',
      });

      expect(tool.id).toBe('databricks_mcp');
      expect(tool.name).toBe('Databricks Managed MCP');
      expect(tool.type).toBe('mcp');
      expect(tool.category).toBe('mcp');
      expect(tool.authType).toBe('bearer');
      expect(tool.secretName).toBe('databricks-mcp-token');
      expect(tool.endpoint).toBe('https://my-corp.cloud.databricks.com/api/2.0/mcp/genie/space-999');

      expect(tool.mcpConfig).toBeDefined();
      expect(tool.mcpConfig!.transport).toBe('http');
      expect(tool.mcpConfig!.serverUrl).toBe('https://my-corp.cloud.databricks.com/api/2.0/mcp/genie/space-999');
      expect(tool.mcpConfig!.authProviderType).toBe('bearer_token');
      expect(tool.mcpConfig!.oauthConfig?.scopes).toEqual(['genie']);
      expect(tool.mcpConfig!.secretConfig?.secretName).toBe('databricks-mcp-token');
      expect(tool.mcpConfig!.secretConfig?.envVar).toBe('DATABRICKS_TOKEN');
      expect(tool.mcpConfig!.databricksConfig?.workspaceHostname).toBe('my-corp.cloud.databricks.com');
      expect(tool.mcpConfig!.databricksConfig?.genieSpaceId).toBe('space-999');
    });
  });

  describe('isDatabricksMcpTool', () => {
    it('should identify Databricks MCP tools by ID string or ToolDefinition', () => {
      expect(isDatabricksMcpTool('databricks_mcp')).toBe(true);
      expect(isDatabricksMcpTool('databricks_mcp_genie')).toBe(true);
      expect(isDatabricksMcpTool('databricks_mcp_vector_search')).toBe(true);
      expect(isDatabricksMcpTool('snowflake_mcp')).toBe(false);
      expect(isDatabricksMcpTool('snowflake_mcp_cortex_analyst')).toBe(false);
      expect(isDatabricksMcpTool('gcp_mcp_bigquery')).toBe(false);
      expect(isDatabricksMcpTool(null)).toBe(false);
      expect(isDatabricksMcpTool(undefined)).toBe(false);

      const toolWithId: ToolDefinition = {
        id: 'databricks_mcp',
        name: 'Custom',
        type: 'mcp',
        description: 'Test',
      };
      expect(isDatabricksMcpTool(toolWithId)).toBe(true);

      const toolWithConfig: ToolDefinition = {
        id: 'custom_mcp_id',
        name: 'Custom',
        type: 'mcp',
        description: 'Test',
        mcpConfig: {
          serverName: 'custom',
          transport: 'http',
          databricksConfig: {
            workspaceHostname: 'test.databricks.com',
            serviceType: 'dbsql',
          },
        },
      };
      expect(isDatabricksMcpTool(toolWithConfig)).toBe(true);

      const genericTool: ToolDefinition = {
        id: 'generic_tool',
        name: 'Generic',
        type: 'custom',
        description: 'Test',
      };
      expect(isDatabricksMcpTool(genericTool)).toBe(false);
    });
  });

  it('should categorize Databricks MCP tools into mcp category via categorizeTools', () => {
    const categorized = categorizeTools(DATABRICKS_MCP_DEFAULT_TOOLS);

    expect(categorized.mcp).toHaveLength(1);
    expect(categorized.google_cloud_mcp).toHaveLength(0);
    expect(categorized.native_adk).toHaveLength(0);
  });

  describe('Databricks McpToolDrawer state updates & live interpolation', () => {
    it('should update serverUrl and oauthConfig when workspaceHostname changes', () => {
      const tool = createToolDefinitionFromDatabricksMcpServer(
        DATABRICKS_MCP_SERVERS.find((s) => s.id === 'databricks_mcp')!
      );

      const updatedConfig: DatabricksMcpConfig = {
        ...tool.mcpConfig!.databricksConfig!,
        workspaceHostname: 'dbc-production.cloud.databricks.com',
        genieSpaceId: 'space-xyz-123',
      };

      const newUrl = buildDatabricksMcpEndpoint(updatedConfig);
      const newOauth = buildDatabricksOAuthUrls(updatedConfig.workspaceHostname);

      expect(newUrl).toBe(
        'https://dbc-production.cloud.databricks.com/api/2.0/mcp/genie/space-xyz-123'
      );
      expect(newOauth.authUrl).toBe(
        'https://dbc-production.cloud.databricks.com/oidc/v1/authorize'
      );
      expect(newOauth.tokenUrl).toBe(
        'https://dbc-production.cloud.databricks.com/oidc/v1/token'
      );
    });

    it('should dynamically switch endpoints across service types', () => {
      const baseConfig: DatabricksMcpConfig = {
        workspaceHostname: 'dbc-test.cloud.databricks.com',
        serviceType: 'vector_search',
        catalog: 'analytics',
        schema: 'embeddings',
        indexName: 'customer_qa_index',
      };

      expect(buildDatabricksMcpEndpoint(baseConfig)).toBe(
        'https://dbc-test.cloud.databricks.com/api/2.0/mcp/vector-search/analytics/embeddings/customer_qa_index'
      );

      const dbsqlConfig: DatabricksMcpConfig = {
        ...baseConfig,
        serviceType: 'dbsql',
        warehouseId: 'wh-abc-789',
      };

      expect(buildDatabricksMcpEndpoint(dbsqlConfig)).toBe(
        'https://dbc-test.cloud.databricks.com/api/2.0/mcp/sql'
      );
    });
  });
});
