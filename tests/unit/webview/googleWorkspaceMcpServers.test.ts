/**
 * Unit Tests for Google Workspace Remote MCP Servers Catalog
 *
 * Validates:
 * 1. Master catalog containing all 13 official Google Workspace Remote MCP servers:
 *    - Gmail, Drive, Docs, Sheets, Slides, Calendar, Chat, Meet, Tasks, People, Forms, Keep, Classroom.
 * 2. Scope presets (read_only least-privilege default vs read_write).
 * 3. Streamable HTTP endpoint schemas and launch stages.
 * 4. Helper utilities: getGoogleWorkspaceMcpServers, getGoogleWorkspaceMcpServerById,
 *    getWorkspaceScopesForPreset, getWorkspaceGcloudEnableCommand, getWorkspaceAdcLoginCommand.
 * 5. createToolDefinitionFromWorkspaceMcpServer factory function.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  GOOGLE_WORKSPACE_MCP_SERVERS,
  GOOGLE_WORKSPACE_MCP_DEFAULT_TOOLS,
  getGoogleWorkspaceMcpServers,
  getGoogleWorkspaceMcpServerById,
  getWorkspaceScopesForPreset,
  getWorkspaceGcloudEnableCommand,
  getWorkspaceAdcLoginCommand,
  createToolDefinitionFromWorkspaceMcpServer,
} from '../../../src/webview/data/googleWorkspaceMcpServers';
import { AVAILABLE_TOOLS } from '../../../src/webview/data/defaultTools';
import { categorizeTools } from '../../../src/webview/data/builtinTools';
import {
  AgentGovernanceProvisioner,
  GcpHttpJsonRequest,
  GcpHttpJsonResponse,
} from '../../../src/extension/deployer/AgentGovernanceProvisioner';

describe('Google Workspace Remote MCP Servers Catalog', () => {
  it('should register all 13 official Google Workspace MCP servers', () => {
    assert.equal(GOOGLE_WORKSPACE_MCP_SERVERS.length, 13);
    assert.equal(getGoogleWorkspaceMcpServers().length, 13);
    assert.equal(GOOGLE_WORKSPACE_MCP_DEFAULT_TOOLS.length, 13);
  });

  it('should validate unique IDs starting with workspace_mcp_', () => {
    const seenIds = new Set<string>();
    const expectedIds = [
      'workspace_mcp_gmail',
      'workspace_mcp_drive',
      'workspace_mcp_docs',
      'workspace_mcp_sheets',
      'workspace_mcp_slides',
      'workspace_mcp_calendar',
      'workspace_mcp_chat',
      'workspace_mcp_meet',
      'workspace_mcp_tasks',
      'workspace_mcp_people',
      'workspace_mcp_forms',
      'workspace_mcp_keep',
      'workspace_mcp_classroom',
    ];

    for (const server of GOOGLE_WORKSPACE_MCP_SERVERS) {
      assert.ok(!seenIds.has(server.id), `Duplicate ID: ${server.id}`);
      seenIds.add(server.id);
      assert.ok(server.id.startsWith('workspace_mcp_'), `Invalid ID prefix: ${server.id}`);
      assert.ok(server.name.length > 0);
      assert.ok(server.description.length > 0);
      assert.ok(server.companionRestApi.length > 0);
      assert.ok(server.mcpServiceName.length > 0);
      assert.ok(server.defaultEndpoint.startsWith('https://'));
      assert.ok(server.defaultEndpoint.endsWith('/mcp/v1'));
      assert.ok(server.readOnlyScopes.length > 0);
      assert.ok(server.readWriteScopes.length >= server.readOnlyScopes.length);
      assert.ok(server.sampleTools.length > 0);
      assert.equal(server.launchStage, 'Preview');
    }

    for (const id of expectedIds) {
      assert.ok(seenIds.has(id), `Missing expected workspace server: ${id}`);
    }
  });

  it('should retrieve a server definition by ID via getGoogleWorkspaceMcpServerById', () => {
    const gmail = getGoogleWorkspaceMcpServerById('workspace_mcp_gmail');
    assert.ok(gmail);
    assert.equal(gmail.name, 'Gmail MCP Server');
    assert.equal(gmail.companionRestApi, 'gmail.googleapis.com');
    assert.equal(gmail.mcpServiceName, 'gmailmcp.googleapis.com');
    assert.equal(gmail.defaultEndpoint, 'https://gmailmcp.googleapis.com/mcp/v1');

    const unknown = getGoogleWorkspaceMcpServerById('workspace_mcp_unknown');
    assert.equal(unknown, undefined);
  });

  it('should correctly resolve read_only vs read_write scopes via getWorkspaceScopesForPreset', () => {
    const drive = getGoogleWorkspaceMcpServerById('workspace_mcp_drive');
    assert.ok(drive);

    const roScopes = getWorkspaceScopesForPreset(drive, 'read_only');
    assert.deepEqual(roScopes, ['https://www.googleapis.com/auth/drive.readonly']);

    const rwScopes = getWorkspaceScopesForPreset(drive, 'read_write');
    assert.deepEqual(rwScopes, [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/drive',
    ]);
  });

  it('should generate gcloud services enable command with deduplication', () => {
    // When companion REST API and MCP service differ
    const gmailCmd = getWorkspaceGcloudEnableCommand('gmail.googleapis.com', 'gmailmcp.googleapis.com');
    assert.equal(gmailCmd, 'gcloud services enable gmail.googleapis.com gmailmcp.googleapis.com');

    const gmailCmdWithProject = getWorkspaceGcloudEnableCommand(
      'gmail.googleapis.com',
      'gmailmcp.googleapis.com',
      'my-test-proj'
    );
    assert.equal(
      gmailCmdWithProject,
      'gcloud services enable gmail.googleapis.com gmailmcp.googleapis.com --project=my-test-proj'
    );

    // When companion REST API and MCP service match (people.googleapis.com)
    const peopleCmd = getWorkspaceGcloudEnableCommand('people.googleapis.com', 'people.googleapis.com');
    assert.equal(peopleCmd, 'gcloud services enable people.googleapis.com');
  });

  it('should generate gcloud auth application-default login command', () => {
    const scopes = ['https://www.googleapis.com/auth/gmail.readonly'];
    const adcCmd = getWorkspaceAdcLoginCommand(scopes);
    assert.equal(
      adcCmd,
      'gcloud auth application-default login --scopes=https://www.googleapis.com/auth/gmail.readonly'
    );

    const adcCmdWithUserProject = getWorkspaceAdcLoginCommand(scopes, 'my-user-proj');
    assert.equal(
      adcCmdWithUserProject,
      'gcloud auth application-default login --scopes=https://www.googleapis.com/auth/gmail.readonly --client-id-file=client_secret.json'
    );

    const defaultCmd = getWorkspaceAdcLoginCommand([]);
    assert.equal(
      defaultCmd,
      'gcloud auth application-default login --scopes=https://www.googleapis.com/auth/cloud-platform'
    );
  });

  it('should instantiate ToolDefinition cleanly via createToolDefinitionFromWorkspaceMcpServer', () => {
    const calendar = getGoogleWorkspaceMcpServerById('workspace_mcp_calendar');
    assert.ok(calendar);

    const tool = createToolDefinitionFromWorkspaceMcpServer(calendar, 'read_only');
    assert.equal(tool.id, 'workspace_mcp_calendar');
    assert.equal(tool.name, 'Google Calendar MCP Server');
    assert.equal(tool.type, 'MCP');
    assert.equal(tool.isBuiltIn, false);
    assert.equal(tool.category, 'google_workspace_mcp');
    assert.ok(tool.mcpConfig);
    assert.equal(tool.mcpConfig.transport, 'http');
    assert.equal(tool.mcpConfig.serverUrl, 'https://calendarmcp.googleapis.com/mcp/v1');
    assert.equal(tool.mcpConfig.timeout, 30);
    assert.equal(tool.mcpConfig.authType, 'google_cloud_oauth');
    assert.equal(tool.mcpConfig.headers?.['X-Goog-User-Project'], '${GOOGLE_CLOUD_PROJECT}');
    assert.equal(tool.mcpConfig.oauthConfig?.serviceName, 'calendarmcp.googleapis.com');
    assert.equal(tool.mcpConfig.oauthConfig?.useAdc, true);
    assert.deepEqual(tool.mcpConfig.oauthConfig?.scopes, calendar.readOnlyScopes);

    assert.ok(tool.mcpConfig.workspaceConfig);
    assert.equal(tool.mcpConfig.workspaceConfig.serviceId, 'workspace_mcp_calendar');
    assert.equal(tool.mcpConfig.workspaceConfig.companionRestApi, 'calendar-json.googleapis.com');
    assert.equal(tool.mcpConfig.workspaceConfig.mcpServiceName, 'calendarmcp.googleapis.com');
    assert.equal(tool.mcpConfig.workspaceConfig.scopePreset, 'read_only');
    assert.equal(tool.mcpConfig.workspaceConfig.callerAuthMode, 'caller_oauth');
    assert.equal(tool.mcpConfig.workspaceConfig.tokenStateKey, 'user_access_token');
    assert.deepEqual(tool.mcpConfig.workspaceConfig.readOnlyScopes, calendar.readOnlyScopes);
    assert.deepEqual(tool.mcpConfig.workspaceConfig.readWriteScopes, calendar.readWriteScopes);

    // Test with read_write preset
    const rwTool = createToolDefinitionFromWorkspaceMcpServer(calendar, 'read_write');
    assert.equal(rwTool.mcpConfig?.workspaceConfig?.scopePreset, 'read_write');
    assert.deepEqual(rwTool.mcpConfig?.oauthConfig?.scopes, calendar.readWriteScopes);
  });

  it('should include all 13 workspace_mcp_* tools in AVAILABLE_TOOLS from defaultTools.ts', () => {
    const workspaceTools = AVAILABLE_TOOLS.filter((t) => t.id.startsWith('workspace_mcp_'));
    assert.equal(workspaceTools.length, 13);
    for (const server of GOOGLE_WORKSPACE_MCP_SERVERS) {
      const match = AVAILABLE_TOOLS.find((t) => t.id === server.id);
      assert.ok(match, `Missing tool in AVAILABLE_TOOLS: ${server.id}`);
      assert.equal(match.category, 'google_workspace_mcp');
      assert.equal(match.type, 'MCP');
    }
  });

  it('should categorize AVAILABLE_TOOLS correctly into google_workspace_mcp while maintaining 68 google_cloud_mcp tools', () => {
    const categorized = categorizeTools(AVAILABLE_TOOLS);
    assert.equal(categorized.google_workspace_mcp.length, 13);
    assert.equal(categorized.google_cloud_mcp.length, 68);

    // Verify all 13 are present in categorized.google_workspace_mcp
    const categorizedIds = new Set(categorized.google_workspace_mcp.map((t) => t.id));
    for (const server of GOOGLE_WORKSPACE_MCP_SERVERS) {
      assert.ok(categorizedIds.has(server.id), `Missing in categorized.google_workspace_mcp: ${server.id}`);
    }
  });

  it('should verify PaletteCard.tsx source integration for Google Workspace MCP category', () => {
    const palettePath = path.resolve(__dirname, '../../../src/webview/components/Canvas/PaletteCard.tsx');
    assert.ok(fs.existsSync(palettePath), 'PaletteCard.tsx must exist');
    const content = fs.readFileSync(palettePath, 'utf8');

    assert.ok(
      content.includes('tool-category-toggle-google_workspace_mcp'),
      'PaletteCard.tsx must include tool-category-toggle-google_workspace_mcp test ID'
    );
    assert.ok(
      content.includes('Google Workspace MCP'),
      'PaletteCard.tsx must render Google Workspace MCP category'
    );
    assert.ok(
      content.includes('workspace-mcp-tool-'),
      'PaletteCard.tsx must render workspace-mcp-tool-* item test IDs'
    );
    assert.ok(
      !content.includes('OAuth / HTTP'),
      'PaletteCard.tsx must not render the redundant OAuth / HTTP outline badge'
    );
    assert.ok(
      !content.includes("scopePreset === 'read_write' ? 'Read/Write' : 'Read-Only'"),
      'PaletteCard.tsx must not render Read-Only badge on tool cards'
    );
    assert.ok(
      content.includes('title={t.name}'),
      'PaletteCard.tsx must include title={t.name} hover tooltip on MCP tool cards'
    );
  });

  it('should verify AddToolModal.tsx source integration for Google Workspace MCP Servers category', () => {
    const modalPath = path.resolve(__dirname, '../../../src/webview/components/inspector/AddToolModal.tsx');
    assert.ok(fs.existsSync(modalPath), 'AddToolModal.tsx must exist');
    const content = fs.readFileSync(modalPath, 'utf8');

    assert.ok(
      content.includes('modal-category-google_workspace_mcp'),
      'AddToolModal.tsx must include modal-category-google_workspace_mcp test ID'
    );
    assert.ok(
      content.includes('Google Workspace MCP Servers'),
      'AddToolModal.tsx must render Google Workspace MCP Servers category'
    );
    assert.ok(
      content.includes('modal-workspace-mcp-tool-'),
      'AddToolModal.tsx must render modal-workspace-mcp-tool-* item test IDs'
    );
  });

  it('should verify McpToolDrawer.tsx source integration for Google Workspace MCP setup panel and fields', () => {
    const drawerPath = path.resolve(__dirname, '../../../src/webview/components/inspector/tools/McpToolDrawer.tsx');
    assert.ok(fs.existsSync(drawerPath), 'McpToolDrawer.tsx must exist');
    const content = fs.readFileSync(drawerPath, 'utf8');

    assert.ok(
      content.includes('google-workspace-mcp-setup-panel'),
      'McpToolDrawer.tsx must render google-workspace-mcp-setup-panel test ID'
    );
    assert.ok(
      content.includes('workspace-scope-preset-read-only'),
      'McpToolDrawer.tsx must render workspace-scope-preset-read-only test ID'
    );
    assert.ok(
      content.includes('workspace-scope-preset-read-write'),
      'McpToolDrawer.tsx must render workspace-scope-preset-read-write test ID'
    );
    assert.ok(
      content.includes('workspace-gcloud-enable-cmd'),
      'McpToolDrawer.tsx must render workspace-gcloud-enable-cmd test ID'
    );
    assert.ok(
      content.includes('workspace-user-project-input'),
      'McpToolDrawer.tsx must render workspace-user-project-input test ID'
    );
    assert.ok(
      content.includes('workspace-adc-login-cmd'),
      'McpToolDrawer.tsx must render workspace-adc-login-cmd test ID'
    );
    assert.ok(
      content.includes('workspace-oauth-client-id-input'),
      'McpToolDrawer.tsx must render workspace-oauth-client-id-input test ID'
    );
    assert.ok(
      content.includes('workspace-oauth-client-secret-input'),
      'McpToolDrawer.tsx must render workspace-oauth-client-secret-input test ID'
    );
    assert.ok(
      content.includes('workspace-caller-auth-mode'),
      'McpToolDrawer.tsx must render workspace-caller-auth-mode selector'
    );
    assert.ok(
      content.includes('workspace-token-state-key-input'),
      'McpToolDrawer.tsx must render workspace-token-state-key-input for per-caller session token key'
    );
    assert.ok(
      content.includes('workspace-oauth-client-secret-env-input'),
      'McpToolDrawer.tsx must render workspace-oauth-client-secret-env-input for 3LO OAuth'
    );
    assert.ok(
      content.includes('workspace-subject-email-input'),
      'McpToolDrawer.tsx must render workspace-subject-email-input for DWD subject impersonation'
    );
    assert.ok(
      content.includes('{!isWorkspaceMcp && ('),
      'McpToolDrawer.tsx must hide redundant generic Authentication Provider section for Google Workspace MCP tools'
    );

    // Regression check for React Error #310: Ensure no useState hooks are called after early return
    const earlyReturnIdx = content.indexOf('if (!isOpen || !formData) return null;');
    const lastUseStateIdx = content.lastIndexOf('useState(');
    assert.ok(earlyReturnIdx > 0, 'McpToolDrawer.tsx must contain early return guard');
    assert.ok(
      lastUseStateIdx < earlyReturnIdx,
      'All useState hooks in McpToolDrawer.tsx must be declared before the early return guard to prevent React Error #310'
    );
  });

  it('should verify Prompt templates include Google Workspace Remote MCP Server McpToolset and Terraform guidelines', () => {
    const agentEnginePromptPath = path.resolve(__dirname, '../../../resource/prompts/python_adk_agent-engine.prompt.txt');
    const cloudRunPromptPath = path.resolve(__dirname, '../../../resource/prompts/python_adk_cloudrun.prompt.txt');

    assert.ok(fs.existsSync(agentEnginePromptPath), 'agent-engine prompt template must exist');
    assert.ok(fs.existsSync(cloudRunPromptPath), 'cloudrun prompt template must exist');

    const agentEngineContent = fs.readFileSync(agentEnginePromptPath, 'utf8');
    const cloudRunContent = fs.readFileSync(cloudRunPromptPath, 'utf8');

    for (const [name, content] of [
      ['python_adk_agent-engine.prompt.txt', agentEngineContent],
      ['python_adk_cloudrun.prompt.txt', cloudRunContent],
    ]) {
      assert.ok(content.includes('Google Workspace Remote MCP'), `${name} must include Google Workspace Remote MCP section`);
      assert.ok(content.includes('McpToolset'), `${name} must include McpToolset`);
      assert.ok(content.includes('StreamableHTTPConnectionParams'), `${name} must include StreamableHTTPConnectionParams`);
      assert.ok(content.includes('X-Goog-User-Project'), `${name} must include X-Goog-User-Project`);
      assert.ok(content.includes('companionRestApi'), `${name} must include companionRestApi`);
      assert.ok(content.includes('mcpServiceName'), `${name} must include mcpServiceName`);
      assert.ok(content.includes('google_project_service'), `${name} must include google_project_service for Workspace APIs`);
      assert.ok(content.includes('user_access_token'), `${name} must check caller session state token user_access_token`);
      assert.ok(content.includes('temp:'), `${name} must check Gemini Enterprise AdkApp temp:<auth_id> session state token`);
      assert.ok(content.includes('with_subject'), `${name} must support Domain-Wide Delegation with_subject impersonation`);
    }
  });

  it('should automatically provision Discovery Engine serverSideOauth2 Authorization and attach toolAuthorizations when publishing a Workspace MCP agent to Gemini Enterprise', async () => {
    const requests: GcpHttpJsonRequest[] = [];
    const customRequester = async (req: GcpHttpJsonRequest): Promise<GcpHttpJsonResponse> => {
      requests.push(req);
      if (req.method === 'GET' && req.url.endsWith('/agents')) {
        return {
          statusCode: 200,
          data: { agents: [] },
          rawBody: '{"agents":[]}',
        };
      }
      if (req.method === 'POST' && req.url.includes('/authorizations?authorizationId=')) {
        return {
          statusCode: 200,
          data: {
            name: 'projects/test-proj/locations/global/authorizations/workspace-agent-workspace-oauth',
          },
          rawBody: '{}',
        };
      }
      if (req.method === 'POST' && req.url.endsWith('/agents')) {
        return {
          statusCode: 200,
          data: {
            name: 'projects/test-proj/locations/global/collections/default_collection/engines/ent-app/assistants/default_assistant/agents/agent-123',
          },
          rawBody: '{}',
        };
      }
      return { statusCode: 200, data: {}, rawBody: '{}' };
    };

    const driveServer = getGoogleWorkspaceMcpServerById('workspace_mcp_drive')!;
    const driveTool = createToolDefinitionFromWorkspaceMcpServer(driveServer, 'read_only');

    const provisioner = new AgentGovernanceProvisioner(undefined, customRequester);
    const result = await provisioner.publishToGeminiEnterprise({
      projectId: 'test-proj',
      region: 'us-central1',
      cleanAgentId: 'workspace-agent',
      displayName: 'Workspace Agent',
      deployedResourceUri: 'projects/test-proj/locations/us-central1/reasoningEngines/987654321',
      geminiEnterpriseAppId: 'ent-app',
      geminiEnterpriseLocation: 'global',
      oauthClientId: '123456-test.apps.googleusercontent.com',
      oauthClientSecret: 'GOCSPX-test-secret',
      document: {
        nodes: [
          {
            id: 'node-1',
            type: 'agentNode',
            data: {
              name: 'root_agent',
              tools: [driveTool],
            },
          },
        ],
      },
    });

    assert.equal(
      result.agentUri,
      'projects/test-proj/locations/global/collections/default_collection/engines/ent-app/assistants/default_assistant/agents/agent-123'
    );

    const authReq = requests.find(
      (r) => r.method === 'POST' && r.url.includes('/authorizations?authorizationId=')
    );
    assert.ok(authReq, 'Must POST to /authorizations to create serverSideOauth2 Authorization');
    assert.equal(
      authReq.body?.serverSideOauth2?.clientId,
      '123456-test.apps.googleusercontent.com'
    );
    assert.equal(authReq.body?.serverSideOauth2?.clientSecret, 'GOCSPX-test-secret');
    assert.equal(authReq.body?.serverSideOauth2?.tokenUri, 'https://oauth2.googleapis.com/token');
    assert.ok(
      authReq.body?.serverSideOauth2?.authorizationUri.includes(
        'redirect_uri=https%3A%2F%2Fvertexaisearch.cloud.google.com%2Foauth-redirect'
      )
    );
    assert.ok(
      authReq.body?.serverSideOauth2?.scopes.includes(
        'https://www.googleapis.com/auth/drive.readonly'
      )
    );

    const createAgentReq = requests.find(
      (r) => r.method === 'POST' && r.url.endsWith('/agents')
    );
    assert.ok(createAgentReq, 'Must POST to /agents to register the agent');
    assert.deepEqual(createAgentReq.body?.authorizationConfig, {
      toolAuthorizations: [
        'projects/test-proj/locations/global/authorizations/workspace-agent-workspace-oauth',
      ],
    });
  });

  it('should NOT provision serverSideOauth2 Authorization when authMode is service_account', async () => {
    const requests: GcpHttpJsonRequest[] = [];
    const customRequester = async (req: GcpHttpJsonRequest): Promise<GcpHttpJsonResponse> => {
      requests.push(req);
      if (req.method === 'GET' && req.url.endsWith('/agents')) {
        return {
          statusCode: 200,
          data: { agents: [] },
          rawBody: '{"agents":[]}',
        };
      }
      if (req.method === 'POST' && req.url.endsWith('/agents')) {
        return {
          statusCode: 200,
          data: {
            name: 'projects/test-proj/locations/global/collections/default_collection/engines/ent-app/assistants/default_assistant/agents/agent-sa-123',
          },
          rawBody: '{}',
        };
      }
      return { statusCode: 200, data: {}, rawBody: '{}' };
    };

    const driveServer = getGoogleWorkspaceMcpServerById('workspace_mcp_drive')!;
    const driveTool = createToolDefinitionFromWorkspaceMcpServer(driveServer, 'read_only');

    const provisioner = new AgentGovernanceProvisioner(undefined, customRequester);
    await provisioner.publishToGeminiEnterprise({
      projectId: 'test-proj',
      region: 'us-central1',
      cleanAgentId: 'workspace-agent',
      displayName: 'Workspace Agent',
      deployedResourceUri: 'projects/test-proj/locations/us-central1/reasoningEngines/987654321',
      geminiEnterpriseAppId: 'ent-app',
      geminiEnterpriseLocation: 'global',
      authMode: 'service_account',
      oauthClientId: '123456-test.apps.googleusercontent.com',
      oauthClientSecret: 'GOCSPX-test-secret',
      document: {
        nodes: [
          {
            id: 'node-1',
            type: 'agentNode',
            data: {
              name: 'root_agent',
              tools: [driveTool],
            },
          },
        ],
      },
    });

    const authReq = requests.find(
      (r) => r.method === 'POST' && r.url.includes('/authorizations?authorizationId=')
    );
    assert.equal(
      authReq,
      undefined,
      'Must NOT create serverSideOauth2 Authorization when authMode === service_account'
    );

    const createAgentReq = requests.find(
      (r) => r.method === 'POST' && r.url.endsWith('/agents')
    );
    assert.ok(createAgentReq, 'Must POST to /agents to register the agent');
    assert.deepEqual(createAgentReq.body?.authorizationConfig, {
      toolAuthorizations: [],
    });
  });
});
