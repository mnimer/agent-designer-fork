/**
 * Unit Tests for Google Cloud Remote MCP Servers Registry
 *
 * Validates:
 * 1. Master catalog containing all 68 official Google Cloud & Workspace MCP servers.
 * 2. Coverage across all 6 GCP domains:
 *    - databases_storage
 *    - compute_containers
 *    - ai_search_agent
 *    - analytics_etl_governance
 *    - management_observability_security
 *    - developer_workspace
 * 3. Schema validation: IDs, names, descriptions, launch stages (GA/Preview/Beta),
 *    streamable HTTP endpoints, regional endpoint patterns, and default OAuth scopes.
 * 4. Query helpers: getGoogleCloudMcpServers, getGoogleCloudMcpServersByDomain.
 * 5. createToolDefinitionFromGcpMcpServer with regional and toolset configurations.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  GOOGLE_CLOUD_MCP_SERVERS,
  GOOGLE_CLOUD_MCP_DOMAINS,
  STANDARD_GCP_REGIONS,
  getGoogleCloudMcpServers,
  getGoogleCloudMcpServersByDomain,
  createToolDefinitionFromGcpMcpServer,
} from '../../../src/webview/data/googleCloudMcpServers';
import { GoogleCloudMcpDomain, GoogleCloudLaunchStage } from '../../../src/shared/types';

describe('Google Cloud Remote MCP Servers Registry', () => {
  it('should register all 68 official Google Cloud MCP servers', () => {
    assert.equal(GOOGLE_CLOUD_MCP_SERVERS.length, 68);
    assert.equal(getGoogleCloudMcpServers().length, 68);
  });

  it('should contain all 6 valid GCP domains with proper labels and icons', () => {
    const expectedDomains: GoogleCloudMcpDomain[] = [
      'databases_storage',
      'compute_containers',
      'ai_search_agent',
      'analytics_etl_governance',
      'management_observability_security',
      'developer_workspace',
    ];

    assert.equal(GOOGLE_CLOUD_MCP_DOMAINS.length, 6);
    for (const domainId of expectedDomains) {
      const found = GOOGLE_CLOUD_MCP_DOMAINS.find((d) => d.id === domainId);
      assert.ok(found, `Missing domain: ${domainId}`);
      assert.ok(found.label.length > 0);
      assert.ok(found.icon.length > 0);
    }
  });

  it('should ensure each server has valid required fields and unique IDs', () => {
    const seenIds = new Set<string>();
    const validLaunchStages: GoogleCloudLaunchStage[] = ['GA', 'Preview', 'Beta'];

    for (const server of GOOGLE_CLOUD_MCP_SERVERS) {
      // Unique ID prefixed with gcp_mcp_
      assert.ok(!seenIds.has(server.id), `Duplicate server ID found: ${server.id}`);
      seenIds.add(server.id);
      assert.ok(server.id.startsWith('gcp_mcp_'), `Server ID ${server.id} must start with gcp_mcp_`);

      // Name & Description
      assert.ok(server.name.trim().length > 0, `Server ${server.id} missing name`);
      assert.ok(server.description.trim().length > 0, `Server ${server.id} missing description`);

      // Domain membership
      assert.ok(
        GOOGLE_CLOUD_MCP_DOMAINS.some((d) => d.id === server.domain),
        `Server ${server.id} has invalid domain ${server.domain}`
      );

      // Launch stage
      assert.ok(
        validLaunchStages.includes(server.launchStage),
        `Server ${server.id} has invalid launch stage ${server.launchStage}`
      );

      // Streamable HTTP endpoint
      assert.ok(
        server.defaultEndpoint.startsWith('https://'),
        `Server ${server.id} default endpoint must start with https://`
      );
      assert.ok(
        server.defaultEndpoint.includes('/mcp'),
        `Server ${server.id} default endpoint must include /mcp`
      );

      // Scopes
      assert.ok(server.defaultScopes.length > 0, `Server ${server.id} must specify defaultScopes`);
      for (const scope of server.defaultScopes) {
        assert.ok(
          scope.startsWith('https://www.googleapis.com/auth/'),
          `Server ${server.id} has invalid OAuth scope: ${scope}`
        );
      }
    }
  });

  it('should validate regional endpoint patterns when specified', () => {
    const regionalServers = GOOGLE_CLOUD_MCP_SERVERS.filter((s) => s.regionalEndpointPattern);
    assert.ok(regionalServers.length > 0, 'Expected at least one server with regional endpoint pattern');

    for (const server of regionalServers) {
      assert.ok(
        server.regionalEndpointPattern?.includes('{region}') || server.regionalEndpointPattern?.includes('<REGION>'),
        `Regional pattern for ${server.id} must contain region placeholder`
      );
      assert.ok(
        server.regionalEndpointPattern?.startsWith('https://'),
        `Regional pattern for ${server.id} must start with https://`
      );
      assert.ok(
        server.regionalEndpointPattern?.endsWith('/mcp'),
        `Regional pattern for ${server.id} must end with /mcp`
      );
    }
  });

  it('should validate toolset definitions when specified', () => {
    const serversWithToolsets = GOOGLE_CLOUD_MCP_SERVERS.filter((s) => s.toolsets && s.toolsets.length > 0);
    assert.ok(serversWithToolsets.length > 0, 'Expected servers with preconfigured toolsets');

    for (const server of serversWithToolsets) {
      for (const toolset of server.toolsets!) {
        assert.ok(typeof toolset === 'string' && toolset.length > 0, `Server ${server.id} toolset invalid`);
      }
    }
  });

  it('should correctly filter servers by domain via getGoogleCloudMcpServersByDomain', () => {
    const dbServers = getGoogleCloudMcpServersByDomain('databases_storage');
    assert.ok(dbServers.length > 0);
    assert.ok(dbServers.every((s) => s.domain === 'databases_storage'));
    assert.ok(dbServers.some((s) => s.id === 'gcp_mcp_alloydb'));
    assert.ok(dbServers.some((s) => s.id === 'gcp_mcp_bigquery'));
    assert.ok(dbServers.some((s) => s.id === 'gcp_mcp_storage'));
    assert.ok(dbServers.some((s) => s.id === 'gcp_mcp_spanner'));

    const aiServers = getGoogleCloudMcpServersByDomain('ai_search_agent');
    assert.ok(aiServers.length > 0);
    assert.ok(aiServers.every((s) => s.domain === 'ai_search_agent'));
    assert.ok(aiServers.some((s) => s.id === 'gcp_mcp_discoveryengine'));
    assert.ok(aiServers.some((s) => s.id === 'gcp_mcp_gemini_agent_platform'));

    const workspaceServers = getGoogleCloudMcpServersByDomain('developer_workspace');
    assert.ok(workspaceServers.length > 0);
    assert.ok(workspaceServers.some((s) => s.id === 'gcp_mcp_drive'));
    assert.ok(workspaceServers.some((s) => s.id === 'gcp_mcp_calendar'));
  });

  it('should create valid ToolDefinition with createToolDefinitionFromGcpMcpServer', () => {
    const alloyDbDef = GOOGLE_CLOUD_MCP_SERVERS.find((s) => s.id === 'gcp_mcp_alloydb')!;
    const tool = createToolDefinitionFromGcpMcpServer(alloyDbDef);

    assert.equal(tool.id, 'gcp_mcp_alloydb');
    assert.equal(tool.name, alloyDbDef.name);
    assert.equal(tool.type, 'mcp');
    assert.equal(tool.category, 'google_cloud_mcp');
    assert.equal(tool.enabled, true);
    assert.ok(tool.mcpConfig);
    assert.equal(tool.mcpConfig.transport, 'http');
    assert.equal(tool.mcpConfig.serverUrl, alloyDbDef.defaultEndpoint);
    assert.equal(tool.mcpConfig.authProviderType, 'google_credentials');
    assert.deepEqual(tool.mcpConfig.oauthConfig?.scopes, alloyDbDef.defaultScopes);
    assert.equal(tool.mcpConfig.launchStage, alloyDbDef.launchStage);
  });

  it('should interpolate regional endpoint when region option is supplied', () => {
    const alloyDbDef = GOOGLE_CLOUD_MCP_SERVERS.find((s) => s.id === 'gcp_mcp_alloydb')!;
    const tool = createToolDefinitionFromGcpMcpServer(alloyDbDef, {
      region: 'europe-west1',
    });

    assert.equal(tool.mcpConfig?.region, 'europe-west1');
    assert.equal(tool.mcpConfig?.serverUrl, 'https://alloydb.europe-west1.rep.googleapis.com/mcp');
  });

  it('should configure toolset and exposedTools when toolset option is supplied', () => {
    const geminiAgentDef = GOOGLE_CLOUD_MCP_SERVERS.find((s) => s.id === 'gcp_mcp_gemini_agent_platform')!;
    const tool = createToolDefinitionFromGcpMcpServer(geminiAgentDef, {
      toolset: 'predict',
    });

    assert.equal(tool.mcpConfig?.selectedToolset, 'predict');
    assert.deepEqual(tool.mcpConfig?.exposedTools, ['predict']);
  });
});
