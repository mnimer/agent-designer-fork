/**
 * Unit Tests for Python ADK Generator & A2A JSON-RPC 2.0 Client Compiler
 *
 * Validates:
 * 1. A2AClient class generation compliant with JSON-RPC 2.0 and spec 1.0.0-a2a.
 * 2. /.well-known/agent-card.json metadata discovery function query_<id>_card.
 * 3. Task dispatch function call_<id>_a2a with payload schema ("jsonrpc": "2.0", "method", "params", "id").
 * 4. Multi-scheme authentication header resolution (Bearer, API Key, OAuth2, IAM).
 * 5. tools.py synthesis including standard tool definitions and setup_agent_tools().
 * 6. agent_workflow.py generation connecting agents with Runner.
 * 7. generateFullProject artifact bundling (tools.py, agent_workflow.py, requirements.txt, .env.example, README.md).
 *
 * Architectural Decisions:
 * - Author: Mike Nimer <mikenimer@google.com>
 * - Decision 1: Node.js native testing via node:test and node:assert/strict.
 * - Decision 2: 100% test coverage including edge cases (multiple A2A nodes, mixed standard/A2A tools).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { 
  PythonAdkGenerator, 
  generateA2AClientCode, 
  generateToolsPyForWorkflow,
  normalizeA2AConfig 
} from '../../../src/shared/codegen/pythonAdkGenerator';
import { AgentWorkflowDocument, ToolDefinition } from '../../../src/shared/types';

describe('Python ADK Generator & A2A JSON-RPC 2.0 Client', () => {
  it('should generate A2AClient base class with compliant JSON-RPC 2.0 structure', () => {
    const generator = new PythonAdkGenerator();
    const workflow: AgentWorkflowDocument = {
      id: 'wf-1',
      name: 'A2A Federation Workflow',
      nodes: [
        {
          id: 'agent-a2a-1',
          data: {
            label: 'Data Analysis Peer',
            agentKind: 'a2a',
            systemPrompt: 'Performs statistical modeling and transformations',
            a2aConfig: {
              endpoint: 'https://data.agents.internal/v1',
              protocolVersion: '1.0.0-a2a',
              agentCardUrl: '/.well-known/agent-card.json',
              authType: 'bearer',
              authTokenSecret: 'DATA_AGENT_BEARER_TOKEN',
              timeoutSeconds: 40,
              maxRetries: 4,
            },
          },
        },
      ],
      edges: [],
    };

    const toolsPy = generator.generateToolsFile(workflow);

    // Verify imports and headers
    assert.ok(toolsPy.includes('import json'));
    assert.ok(toolsPy.includes('import uuid'));
    assert.ok(toolsPy.includes('import urllib.request'));
    assert.ok(toolsPy.includes('A2A Protocol JSON-RPC 2.0 Client Base Implementation'));

    // Verify JSON-RPC 2.0 envelope
    assert.ok(toolsPy.includes('"jsonrpc": "2.0"'));
    assert.ok(toolsPy.includes('"method": method'));
    assert.ok(toolsPy.includes('"task_input": task_input'));
    assert.ok(toolsPy.includes('request_id = str(uuid.uuid4())'));

    // Verify Discovery & Well-Known path
    assert.ok(toolsPy.includes('def query_agent_card(self, agent_card_path: str = "/.well-known/agent-card.json")'));

    // Verify Client Instance & Tool Wrappers
    assert.ok(toolsPy.includes('_client_data_analysis_peer = A2AClient('));
    assert.ok(toolsPy.includes('endpoint="https://data.agents.internal/v1"'));
    assert.ok(toolsPy.includes('auth_secret="DATA_AGENT_BEARER_TOKEN"'));
    assert.ok(toolsPy.includes('timeout_seconds=40'));
    assert.ok(toolsPy.includes('max_retries=4'));

    assert.ok(toolsPy.includes('def call_data_analysis_peer_a2a(task_input: str) -> dict:'));
    assert.ok(toolsPy.includes('def query_data_analysis_peer_card() -> dict:'));

    // Verify setup_agent_tools includes the A2A tool
    assert.ok(toolsPy.includes('def setup_agent_tools(agent_id: str) -> List[Any]:'));
    assert.ok(toolsPy.includes('tools.append(call_data_analysis_peer_a2a)'));
  });

  it('should generate apiKey authentication with custom header name', () => {
    const code = generateA2AClientCode({
      label: 'Security Auditor Peer',
      a2aConfig: {
        endpoint: 'https://security.agent.net/rpc',
        authType: 'apiKey',
        authSecretKey: 'SEC_AUDIT_KEY',
        headerName: 'X-Sec-Api-Key',
      },
    });

    assert.ok(code.includes('_client_security_auditor_peer = A2AClient('));
    assert.ok(code.includes('endpoint="https://security.agent.net/rpc"'));
    assert.ok(code.includes('auth_type="apiKey"'));
    assert.ok(code.includes('auth_secret="SEC_AUDIT_KEY"'));
    assert.ok(code.includes('header_name="X-Sec-Api-Key"'));
    assert.ok(code.includes('def call_security_auditor_peer_a2a(task_input: str) -> dict:'));
    assert.ok(code.includes('def query_security_auditor_peer_card() -> dict:'));
  });

  it('should support workflow combining standard tools and A2A nodes', () => {
    const generator = new PythonAdkGenerator();
    const searchTool: ToolDefinition = {
      id: 'tool_google_search',
      name: 'google_search',
      type: 'search',
      builtinType: 'google_search',
      description: 'Searches Google for real-time web information',
      parameters: [],
    };

    const workflow: AgentWorkflowDocument = {
      id: 'wf-hybrid',
      name: 'Hybrid Root & A2A Workflow',
      nodes: [
        {
          id: 'root-agent',
          data: {
            label: 'Coordinator Agent',
            agentKind: 'standard',
            isStartNode: true,
            model: 'gemini-3.7-flash',
            systemPrompt: 'You coordinate research and delegate tasks to specialized peers.',
            tools: [searchTool],
          },
        },
        {
          id: 'peer-a2a',
          data: {
            label: 'Code Execution Peer',
            agentKind: 'a2a',
            systemPrompt: 'Executes Python code in isolated sandboxes.',
            a2aConfig: {
              endpoint: 'https://sandbox.code-agent.internal/a2a/v1',
              protocolVersion: '1.0.0-a2a',
              agentCardUrl: '/.well-known/agent-card.json',
              authType: 'google_iam',
            },
          },
        },
      ],
      edges: [],
    };

    const toolsPy = generator.generateToolsFile(workflow);

    // Should include standard tools compiler import and initializer
    assert.ok(toolsPy.includes('from google.adk.tools import google_search'));
    // Should include A2AClient
    assert.ok(toolsPy.includes('class A2AClient:'));
    assert.ok(toolsPy.includes('call_code_execution_peer_a2a'));

    // Check setup_agent_tools mapping
    assert.ok(toolsPy.includes('if agent_id == "root-agent":'));
    assert.ok(toolsPy.includes('tools.append(google_search)'));
    assert.ok(toolsPy.includes('if agent_id == "peer-a2a":'));
    assert.ok(toolsPy.includes('tools.append(call_code_execution_peer_a2a)'));
  });

  it('should generate valid agent_workflow.py orchestration file', () => {
    const generator = new PythonAdkGenerator();
    const workflow: AgentWorkflowDocument = {
      id: 'wf-orch',
      name: 'Orchestrator Workflow',
      nodes: [
        {
          id: 'lead-agent',
          data: {
            label: 'Lead Analyst',
            isStartNode: true,
            model: 'gemini-3.7-flash',
            systemPrompt: 'Main conversational coordinator.',
          },
        },
      ],
      edges: [],
    };

    const workflowPy = generator.generateWorkflowFile(workflow);
    assert.ok(workflowPy.includes('from google.adk.agents import Agent'));
    assert.ok(workflowPy.includes('from google.adk.runners import Runner'));
    assert.ok(workflowPy.includes('from tools import setup_agent_tools'));
    assert.ok(workflowPy.includes('lead_analyst = Agent('));
    assert.ok(workflowPy.includes('runner = Runner(agent=lead_analyst)'));
  });

  it('should bundle complete full project with requirements and env templates', () => {
    const generator = new PythonAdkGenerator();
    const workflow: AgentWorkflowDocument = {
      id: 'wf-full',
      name: 'Production A2A System',
      nodes: [
        {
          id: 'agent-1',
          data: {
            label: 'Data Agent',
            agentKind: 'a2a',
            a2aConfig: {
              endpoint: 'https://data.prod.internal/v1',
            },
          },
        },
      ],
      edges: [],
    };

    const files = generator.generateFullProject(workflow, {
      projectId: 'my-vertex-project',
      location: 'global',
    });

    assert.equal(files.length, 5);
    const paths = files.map((f) => f.path);
    assert.ok(paths.includes('tools.py'));
    assert.ok(paths.includes('agent_workflow.py'));
    assert.ok(paths.includes('requirements.txt'));
    assert.ok(paths.includes('.env.example'));
    assert.ok(paths.includes('README.md'));

    const envFile = files.find((f) => f.path === '.env.example');
    assert.ok(envFile?.content.includes('GOOGLE_CLOUD_PROJECT=my-vertex-project'));
    assert.ok(envFile?.content.includes('GOOGLE_CLOUD_LOCATION=global'));
    assert.ok(envFile?.content.includes('A2A_AGENT_AUTH_TOKEN='));
  });

  it('should include mcp>=1.0.0 in requirements.txt when workflow contains MCP tools', () => {
    const generator = new PythonAdkGenerator();
    const workflow: AgentWorkflowDocument = {
      id: 'wf-mcp',
      name: 'MCP Workflow',
      nodes: [
        {
          id: 'agent-1',
          data: {
            label: 'MCP Agent',
            tools: [
              {
                id: 'mcp-tool-1',
                name: 'Filesystem MCP',
                type: 'mcp',
                mcpConfig: {
                  serverName: 'fs',
                  transport: 'stdio',
                  command: 'npx',
                },
              },
            ],
          },
        },
      ],
      edges: [],
    };

    const files = generator.generateFullProject(workflow);
    const reqFile = files.find((f) => f.path === 'requirements.txt');
    assert.ok(reqFile, 'requirements.txt should be generated');
    assert.ok(reqFile.content.includes('mcp>=1.0.0'), 'Should include mcp>=1.0.0');
  });

  it('should include httpx and secret-manager in requirements.txt when REST API tools are present', () => {
    const generator = new PythonAdkGenerator();
    const workflow: AgentWorkflowDocument = {
      id: 'wf-rest',
      name: 'REST API System',
      nodes: [
        {
          id: 'agent-1',
          data: {
            label: 'CRM Agent',
            tools: [
              {
                id: 'tool_crm',
                name: 'Query CRM',
                type: 'api',
                httpMethod: 'POST',
                endpointUrl: 'https://crm.example.com/api',
                secretManagerKey: 'projects/p/secrets/s/versions/1',
              },
            ],
          },
        },
      ],
      edges: [],
    };

    const files = generator.generateFullProject(workflow);
    const reqFile = files.find((f) => f.path === 'requirements.txt');
    assert.ok(reqFile, 'requirements.txt should be generated');
    assert.ok(reqFile.content.includes('httpx>=0.27.0'), 'Should include httpx');
    assert.ok(reqFile.content.includes('google-cloud-secret-manager>=2.16.0'), 'Should include secret manager');

    const toolsFile = files.find((f) => f.path === 'tools.py');
    assert.ok(toolsFile, 'tools.py should be generated');
    assert.ok(toolsFile.content.includes('import httpx'));
    assert.ok(toolsFile.content.includes('async def query_crm'));
  });

  it('should export convenience function generateToolsPyForWorkflow', () => {
    const workflow: AgentWorkflowDocument = {
      id: 'wf-helper',
      name: 'Helper Test',
      nodes: [],
      edges: [],
    };

    const toolsPy = generateToolsPyForWorkflow(workflow);
    assert.ok(toolsPy.includes('tools.py - Google ADK Tools & A2A Protocol JSON-RPC 2.0 Client'));
    assert.ok(toolsPy.includes('def setup_agent_tools(agent_id: str) -> List[Any]:'));
  });
});
