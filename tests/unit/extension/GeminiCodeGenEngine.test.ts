/**
 * Unit Tests for GeminiCodeGenEngine
 *
 * Validates:
 * 1. Prompt template discovery from `resource/prompts/` and {{WORKFLOW_JSON}} interpolation.
 * 2. Multi-file JSON response parsing and markdown fence stripping.
 * 3. Default model configuration to `gemini-flash-latest`.
 * 4. Error reporting on missing credentials without template fallback.
 * 5. Successful file parsing from Gemini LLM response.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'path';
import * as fs from 'fs';
import { GeminiCodeGenEngine } from '../../../src/extension/GeminiCodeGenEngine';
import { AgentWorkflowDocument } from '../../../src/shared/types';

describe('GeminiCodeGenEngine Pure LLM Code Generation', () => {
  const extensionPath = path.resolve(__dirname, '../../..');
  const engine = new GeminiCodeGenEngine(extensionPath);

  const sampleDoc: AgentWorkflowDocument = {
    version: '1.0.0',
    name: 'CustomerSupportWorkflow',
    description: 'Autonomous customer triage agent',
    framework: 'google-adk',
    language: 'python',
    nodes: [
      {
        id: 'trig-1',
        type: 'trigger',
        position: { x: 0, y: 0 },
        data: {
          label: 'Test Cases',
          triggerKind: 'test',
          config: {
            testScenarios: [
              {
                id: 'sc-1',
                name: 'Refund Request',
                inputQuery: 'I want a refund for order #1029',
                expectedOutputPattern: 'refund',
              },
            ],
          },
        },
      },
      {
        id: 'agent-1',
        type: 'agent',
        position: { x: 300, y: 0 },
        data: {
          label: 'TriageSpecialist',
          model: 'gemini-flash-latest',
          systemPrompt: 'You are a customer support specialist.',
          temperature: 0.3,
          tools: [
            {
              id: 'tool-search',
              name: 'Google Search Grounding',
              type: 'builtin',
            },
          ],
        },
      },
    ],
    edges: [
      { id: 'e1', source: 'trig-1', target: 'agent-1' },
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
    metadata: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      author: 'Mike Nimer <mikenimer@google.com>',
    },
  };

  it('should load prompt template from resource/prompts for python-adk successfully', () => {
    const prompt = engine.loadPromptTemplate('google-adk', 'python');
    assert.ok(prompt.length > 0);
    assert.ok(prompt.includes('{{WORKFLOW_JSON}}'));
    assert.ok(prompt.includes('google-genai'));
  });

  it('should load prompt template for specific deployment targets', () => {
    const cloudrunPrompt = engine.loadPromptTemplate('google-adk', 'python', 'cloudrun');
    assert.ok(cloudrunPrompt.includes('Cloud Run'));
    assert.ok(cloudrunPrompt.includes('server.py'));

    const cloudrunUnderscorePrompt = engine.loadPromptTemplate('google-adk', 'python', 'cloud_run');
    assert.ok(cloudrunUnderscorePrompt.includes('Cloud Run'));
    assert.ok(cloudrunUnderscorePrompt.includes('server.py'));

    const agentEnginePrompt = engine.loadPromptTemplate('google-adk', 'python', 'agent-engine');
    assert.ok(agentEnginePrompt.includes('Agent Engine'));
    assert.ok(agentEnginePrompt.includes('main.tf'));
    assert.ok(agentEnginePrompt.includes('cloudbuild-buildonly.yaml'));
    assert.ok(agentEnginePrompt.includes('null_resource'));

    const agentEngineUnderscorePrompt = engine.loadPromptTemplate('google-adk', 'python', 'agent_engine');
    assert.ok(agentEngineUnderscorePrompt.includes('Agent Engine'));
    assert.ok(agentEngineUnderscorePrompt.includes('main.tf'));
    assert.ok(agentEngineUnderscorePrompt.includes('cloudbuild-buildonly.yaml'));
    assert.ok(agentEngineUnderscorePrompt.includes('null_resource'));
  });

  it('should parse raw Gemini JSON response with markdown fences', () => {
    const rawFencedResponse = '```json\n[\n  {\n    "path": "test.py",\n    "description": "Test file",\n    "content": "print(123)"\n  }\n]\n```';
    const files = engine.parseGeminiResponse(rawFencedResponse);
    assert.equal(files.length, 1);
    assert.equal(files[0].path, 'test.py');
    assert.equal(files[0].content, 'print(123)');
  });

  it('should parse raw un-fenced Gemini JSON response', () => {
    const rawResponse = JSON.stringify([
      { path: 'main.tf', description: 'Terraform file', content: 'provider "google" {}' },
      { path: 'agent_workflow.py', description: 'Agent Class', content: 'class Workflow: pass' },
    ]);
    const files = engine.parseGeminiResponse(rawResponse);
    assert.equal(files.length, 2);
    assert.equal(files[0].path, 'main.tf');
    assert.equal(files[1].path, 'agent_workflow.py');
  });

  it('should report failure with informative error when both API key and ADC credentials fail', async () => {
    // Engine without valid key and mock ADC returning null
    const testEngine = new GeminiCodeGenEngine(extensionPath);
    (testEngine as any).getGCloudAccessToken = () => null;
    (testEngine as any).getGCloudProjectId = () => null;

    const result = await testEngine.generateCode({
      document: sampleDoc,
      framework: 'google-adk',
      language: 'python',
      apiKey: 'INVALID_TEST_KEY_FORCING_FAILURE',
      model: 'gemini-flash-latest',
    });

    assert.equal(result.success, false);
    assert.equal(result.files.length, 0);
    assert.ok(result.error);
    assert.ok(result.error.includes('API Key error') || result.error.includes('Application Default Credentials'));
    assert.equal(result.modelUsed, 'gemini-flash-latest');
  });

  it('should resiliently parse JSON with trailing commas and unescaped characters', () => {
    const rawWithTrailingComma = `[
      {
        "path": "requirements.txt",
        "description": "Dependencies",
        "content": "fastapi>=0.110.0\\ngoogle-genai>=1.0.0",
      },
      {
        "path": "server.py",
        "description": "FastAPI server",
        "content": "from fastapi import FastAPI\\napp = FastAPI()",
      },
    ]`;
    const files = engine.parseGeminiResponse(rawWithTrailingComma);
    assert.equal(files.length, 2);
    assert.equal(files[0].path, 'requirements.txt');
    assert.equal(files[1].path, 'server.py');
  });

  it('should evaluate assertions using heuristic matcher for JSON fields and values', () => {
    const jsonOutput = JSON.stringify({ isBusiness: true, category: 'corporate_billing', score: 98.5 });

    const matchTrue = engine.heuristicEvaluateAssertion('isBusiness: true', jsonOutput);
    assert.equal(matchTrue.passed, true);
    assert.ok(matchTrue.reason.includes('matches expected value'));

    const matchFalse = engine.heuristicEvaluateAssertion('isBusiness: false', jsonOutput);
    assert.equal(matchFalse.passed, false);

    const matchString = engine.heuristicEvaluateAssertion('corporate_billing', jsonOutput);
    assert.equal(matchString.passed, true);

    const noMatch = engine.heuristicEvaluateAssertion('refund_processed', jsonOutput);
    assert.equal(noMatch.passed, false);
  });

  it('should evaluate assertions using evaluateAssertion with fallback handling', async () => {
    const jsonOutput = JSON.stringify({ status: 'success', isBusiness: false });
    const result = await engine.evaluateAssertion({
      inputQuery: 'Where is my tracking number?',
      expectedCriteria: 'status: "success"',
      actualOutput: jsonOutput,
    });

    assert.equal(result.passed, true);
    assert.ok(result.reason);
  });

  it('should enforce proper structured output schema with semantic field descriptions', () => {
    const schema = (engine as any).fileArraySchema;
    assert.equal(schema.type, 'ARRAY');
    assert.ok(schema.description && schema.description.length > 0);
    assert.equal(schema.items.type, 'OBJECT');
    assert.deepEqual(schema.items.required, ['path', 'description', 'content']);
    assert.equal(schema.items.properties.path.type, 'STRING');
    assert.ok(schema.items.properties.path.description.includes('Relative file path'));
    assert.equal(schema.items.properties.description.type, 'STRING');
    assert.ok(schema.items.properties.description.description.includes('description'));
    assert.equal(schema.items.properties.content.type, 'STRING');
    assert.ok(schema.items.properties.content.description.includes('Complete, production-ready'));
  });

  it('should include workflow JSON when generating code with self-contained prompt template', async () => {
    let capturedPrompt = '';
    // Temporarily spy on callGeminiApi to verify prompt passed to LLM
    const originalCall = (engine as any).callGeminiApi;
    (engine as any).callGeminiApi = async (prompt: string) => {
      capturedPrompt = prompt;
      return [{ path: 'agent.py', description: 'Test', content: 'root_agent = Agent(name="root")' }];
    };

    try {
      const result = await engine.generateCode({
        document: sampleDoc,
        framework: 'google-adk',
        language: 'python',
        deploymentTarget: 'agent-engine',
        apiKey: 'test-key',
      });

      assert.equal(result.success, true);
      assert.ok(capturedPrompt.includes('CustomerSupportWorkflow'), 'Must interpolate workflow JSON');
      assert.ok(capturedPrompt.includes('Google ADK') || capturedPrompt.includes('google-adk'), 'Must contain ADK framework instructions');
    } finally {
      (engine as any).callGeminiApi = originalCall;
    }
  });

  it('should guarantee A2A dependencies in requirements.txt when A2A node is in workflow', () => {
    const a2aDoc: AgentWorkflowDocument = {
      version: '1.0.0',
      name: 'A2AWorkflow',
      framework: 'google-adk',
      language: 'python',
      nodes: [
        {
          id: 'agent-a2a',
          type: 'agent',
          position: { x: 0, y: 0 },
          data: {
            label: 'StockAgent',
            agentKind: 'a2a',
            systemPrompt: 'You are a stock query agent.',
          },
        },
      ],
    };

    // Case 1: requirements.txt properly includes A2A dependencies -> should pass
    const validA2aFiles = [
      {
        path: 'requirements.txt',
        description: 'Deps',
        content: 'google-adk[a2a]>=2.0.0\na2a-sdk[http-server]>=0.3.4\nfastapi>=0.110.0\n',
      },
      {
        path: 'agent.py',
        description: 'Agent',
        content: 'from a2a.types import AgentCard\n',
      },
    ];
    assert.doesNotThrow(() => {
      engine.validateRequiredDependencies(a2aDoc, validA2aFiles);
    });

    // Case 2: requirements.txt omitted by LLM -> must FAIL FAST
    const filesNoReq = [
      {
        path: 'agent.py',
        description: 'Agent',
        content: 'from a2a.types import AgentCard\n',
      },
    ];
    assert.throws(
      () => engine.validateRequiredDependencies(a2aDoc, filesNoReq),
      /Validation Error: Generated repository is missing requirements\.txt/
    );

    // Case 3: requirements.txt missing A2A dependencies -> must FAIL FAST
    const filesMissingA2aDeps = [
      {
        path: 'requirements.txt',
        description: 'Deps',
        content: 'google-adk>=2.0.0\nfastapi>=0.110.0\n',
      },
      {
        path: 'agent.py',
        description: 'Agent',
        content: 'from a2a.types import AgentCard\n',
      },
    ];
    assert.throws(
      () => engine.validateRequiredDependencies(a2aDoc, filesMissingA2aDeps),
      /Validation Error: Generated requirements\.txt is missing required A2A dependencies/
    );

    // Case 4: standard agent with no A2A dependencies should pass
    const standardDoc: AgentWorkflowDocument = {
      version: '1.0.0',
      name: 'StandardWorkflow',
      framework: 'google-adk',
      language: 'python',
      nodes: [
        {
          id: 'agent-std',
          type: 'agent',
          position: { x: 0, y: 0 },
          data: {
            label: 'StdAgent',
            agentKind: 'standard',
            systemPrompt: 'Hello',
          },
        },
      ],
    };
    const standardFiles = [
      {
        path: 'requirements.txt',
        description: 'Deps',
        content: 'google-adk>=2.0.0\nfastapi>=0.110.0\n',
      },
    ];
    assert.doesNotThrow(() => {
      engine.validateRequiredDependencies(standardDoc, standardFiles);
    });
  });

  it('should ensure dedicated agent card JSON files exist for A2A nodes with rawJsonPack', () => {
    const a2aDoc: AgentWorkflowDocument = {
      version: '1.0.0',
      name: 'A2AWorkflow',
      framework: 'google-adk',
      language: 'python',
      nodes: [
        {
          id: 'stock_node',
          type: 'agentNode',
          position: { x: 0, y: 0 },
          data: {
            label: 'Stock Agent',
            agentKind: 'a2a',
            a2aConfig: {
              protocolVersion: '1.0',
              endpoint: 'https://example.com/a2a',
              rawJsonPack: '{"name":"stock_agent","protocolVersion":"1.0"}',
            },
          },
        },
      ],
    };

    const initialFiles = [
      {
        path: 'agent.py',
        description: 'Agent logic',
        content: 'from google.adk.agents.remote_a2a_agent import RemoteA2aAgent\n',
      },
    ];

    const updated = engine.ensureAgentCards(a2aDoc, initialFiles);
    const cardFile = updated.find((f) => f.path === 'stock_agent_agent_card.json');
    assert.ok(cardFile, 'stock_agent_agent_card.json should be created');
    assert.ok(cardFile.content.includes('"name": "stock_agent"'));

    const altCardFile = updated.find((f) => f.path === 'stock_agent_card.json');
    assert.ok(altCardFile, 'stock_agent_card.json should also be created for alternate reference');
    assert.ok(altCardFile.content.includes('"name": "stock_agent"'));
  });

  it('ensureAgentCards should overwrite truncated card file emitted by LLM', () => {
    const a2aDoc = {
      nodes: [
        {
          id: 'stock_1',
          type: 'agent',
          data: {
            label: 'stock agent',
            agentKind: 'a2a',
            a2aConfig: {
              rawJsonPack: JSON.stringify({
                name: 'stock_agent',
                url: 'https://example.com',
                additionalInterfaces: [{ transport: 'HTTP+JSON', url: 'https://example.com' }],
              }),
            },
          },
        },
      ],
      edges: [],
    };

    const initialFiles = [
      {
        path: 'stock_agent_card.json',
        description: 'Truncated card',
        content: '{"name": "stock_agent"}',
      },
    ];

    const updated = engine.ensureAgentCards(a2aDoc, initialFiles);
    const altCardFile = updated.find((f) => f.path === 'stock_agent_card.json');
    assert.ok(altCardFile);
    assert.ok(altCardFile.content.includes('additionalInterfaces'), 'Truncated card must be overwritten with full rawJsonPack');
  });

  it('finalizeGeneratedFiles should ensure dependencies and extract A2A agent cards', () => {
    const docWithA2A = {
      nodes: [
        {
          id: 'a2a_1',
          type: 'agent',
          data: {
            role: 'Remote Stock Agent',
            agentType: 'a2a_agent',
            a2aConfig: {
              rawJsonPack: JSON.stringify({ name: 'stock_agent', url: 'https://stock-agent.run.app' }),
            },
          },
        },
      ],
      edges: [],
    };

    const initialFiles = [
      {
        path: 'requirements.txt',
        description: 'Dependencies',
        content: 'google-adk[a2a]>=2.0.0\na2a-sdk[http-server]>=0.3.4\n',
      },
      {
        path: 'agent.py',
        description: 'Agent logic',
        content: '# agent code\nroot_agent = "dummy_root"',
      },
    ];

    const finalized = engine.finalizeGeneratedFiles(docWithA2A, initialFiles);

    const reqFile = finalized.find((f) => f.path === 'requirements.txt');
    assert.ok(reqFile, 'requirements.txt should exist');
    assert.ok(reqFile.content.includes('google-adk[a2a]'), 'requirements.txt should have google-adk[a2a]');

    const cardFile = finalized.find((f) => f.path.endsWith('_agent_card.json'));
    assert.ok(cardFile, 'agent card should be extracted and added');
  });

  it('validateGeneratedFiles must fail fast when agent.py is missing or does not define root_agent', () => {
    // Case 1: Missing agent.py
    assert.throws(
      () => {
        engine.validateGeneratedFiles({}, [
          { path: 'main.py', content: 'import os', description: 'CLI' },
        ]);
      },
      /Validation Error: Generated repository is missing the core entrypoint 'agent.py'/,
      'Should throw when agent.py is missing'
    );

    // Case 2: agent.py present but missing root_agent
    assert.throws(
      () => {
        engine.validateGeneratedFiles({}, [
          { path: 'agent.py', content: 'print("hello")', description: 'Agent' },
        ]);
      },
      /Validation Error: 'agent.py' does not define 'root_agent'/,
      'Should throw when root_agent is missing from agent.py'
    );

    // Case 3: Valid agent.py with root_agent
    assert.doesNotThrow(() => {
      engine.validateGeneratedFiles({}, [
        { path: 'agent.py', content: 'root_agent = Agent(...)', description: 'Agent' },
      ]);
    });
  });

  it('prompt templates must contain strict ADK class parameter contracts and A2A instructions', () => {
    const promptPath = path.join(
      __dirname,
      '../../../resource/prompts/python_adk_agent-engine.prompt.txt'
    );
    const promptContent = fs.readFileSync(promptPath, 'utf8');

    assert.ok(promptContent.includes('RemoteA2aAgent(...)'), 'Prompt must instruct on RemoteA2aAgent');
    assert.ok(promptContent.includes('ParallelAgent(...)'), 'Prompt must instruct on ParallelAgent');
    assert.ok(promptContent.includes('SequentialAgent(...)'), 'Prompt must instruct on SequentialAgent');
    assert.ok(promptContent.includes('LoopAgent(...)'), 'Prompt must instruct on LoopAgent');
    assert.ok(promptContent.includes('output_key'), 'Prompt must instruct on output_key rules');
    assert.ok(promptContent.includes('ResumabilityConfig'), 'Prompt must instruct on ResumabilityConfig imports');
    assert.ok(promptContent.includes('COMPLETE REPOSITORY GENERATION'), 'Prompt must mandate complete repository generation');
    assert.ok(promptContent.includes('MANDATORY COMPLETE REPOSITORY FILE MANIFEST'), 'Prompt must define mandatory file manifest');

    const cloudrunPromptPath = path.join(
      __dirname,
      '../../../resource/prompts/python_adk_cloudrun.prompt.txt'
    );
    const cloudrunPromptContent = fs.readFileSync(cloudrunPromptPath, 'utf8');
    assert.ok(cloudrunPromptContent.includes('COMPLETE REPOSITORY GENERATION'), 'Cloud Run prompt must mandate complete repository generation');
    assert.ok(cloudrunPromptContent.includes('MANDATORY COMPLETE REPOSITORY FILE MANIFEST'), 'Cloud Run prompt must define mandatory file manifest');
  });

  describe('postProcessGeneratedFiles', () => {
    it('should sanitize invalid google.adk.tools.google_search submodule imports in Python files', () => {
      const rawFiles = [
        {
          path: 'agent.py',
          description: 'Main agent',
          content: [
            'from google.adk.agents import Agent',
            'from google.adk.tools.google_search import google_search',
            'from google.adk.tools.vertex_ai_search import VertexAiSearchTool',
            'root_agent = Agent(name="root_agent", tools=[google_search])',
          ].join('\n'),
        },
        {
          path: 'config.json',
          description: 'Config',
          content: '{"import": "google.adk.tools.google_search"}',
        },
      ];

      const processed = engine.postProcessGeneratedFiles(rawFiles);
      assert.equal(processed.length, 2);

      // Verify Python file had invalid imports corrected
      const agentPy = processed[0].content;
      assert.ok(agentPy.includes('from google.adk.tools import google_search'));
      assert.ok(!agentPy.includes('from google.adk.tools.google_search import google_search'));
      assert.ok(agentPy.includes('from google.adk.tools import VertexAiSearchTool'));

      // Verify non-Python file was untouched
      assert.equal(processed[1].content, '{"import": "google.adk.tools.google_search"}');
    });

    it('should normalize GoogleSearchTool and bare import statements', () => {
      const rawFiles = [
        {
          path: 'agent.py',
          description: 'Agent file',
          content: [
            'import google.adk.tools.google_search',
            'from google.adk.tools.google_search import GoogleSearchTool',
          ].join('\n'),
        },
      ];

      const processed = engine.postProcessGeneratedFiles(rawFiles);
      const content = processed[0].content;
      assert.ok(content.includes('from google.adk.tools import google_search'));
      assert.ok(content.includes('from google.adk.tools.google_search_tool import GoogleSearchTool'));
      assert.ok(!content.includes('import google.adk.tools.google_search'));
    });

    it('should normalize enable_cloud_metrics=True and enable_cloud_tracing=True to conditional check', () => {
      const rawFiles = [
        {
          path: 'agent.py',
          description: 'Agent file',
          content: 'gcp_exporters = get_gcp_exporters(enable_cloud_tracing=True, enable_cloud_metrics=True)',
        },
      ];

      const processed = engine.postProcessGeneratedFiles(rawFiles);
      assert.ok(processed[0].content.includes('enable_cloud_metrics=bool(os.getenv("GOOGLE_CLOUD_AGENT_ENGINE_ID") or os.getenv("K_SERVICE"))'));
      assert.ok(processed[0].content.includes('enable_cloud_tracing=bool(os.getenv("GOOGLE_CLOUD_AGENT_ENGINE_ID") or os.getenv("K_SERVICE"))'));
    });

    it('should strip forbidden description parameter from App(...)', () => {
      const rawFiles = [
        {
          path: 'agent.py',
          description: 'Agent file',
          content: 'app = App(name=animal_expert.name, root_agent=animal_expert, description="Animal Expert Agent Workflow")',
        },
      ];

      const processed = engine.postProcessGeneratedFiles(rawFiles);
      assert.ok(!processed[0].content.includes('description='));
      assert.ok(processed[0].content.includes('app = App(name=animal_expert.name, root_agent=animal_expert)'));
    });
  });

  describe('Assertion Evaluation and JSON Schema Validation', () => {
    it('validateJsonSchemaAssertion should validate conformant JSON output', () => {
      const schema = {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          score: { type: 'NUMBER' },
          active: { type: 'BOOLEAN' },
          tags: { type: 'ARRAY' },
          status: { type: 'STRING', enum: ['pending', 'completed'] },
        },
        required: ['title', 'score'],
      };

      const validOutput = JSON.stringify({
        title: 'Report',
        score: 95.5,
        active: true,
        tags: ['alpha', 'beta'],
        status: 'completed',
      });

      const result = engine.validateJsonSchemaAssertion(validOutput, schema);
      assert.equal(result.passed, true);
      assert.ok(result.reason.includes('conforms') || result.reason.includes('passed'));
    });

    it('validateJsonSchemaAssertion should strip markdown code fences', () => {
      const schema = {
        type: 'OBJECT',
        properties: {
          city: { type: 'STRING' },
        },
        required: ['city'],
      };

      const markdownOutput = '```json\n{\n  "city": "San Francisco"\n}\n```';
      const result = engine.validateJsonSchemaAssertion(markdownOutput, schema);
      assert.equal(result.passed, true);
    });

    it('validateJsonSchemaAssertion should fail on malformed JSON', () => {
      const result = engine.validateJsonSchemaAssertion('{ invalid json }', { type: 'OBJECT' });
      assert.equal(result.passed, false);
      assert.ok(result.reason.includes('Failed to parse response as JSON'));
    });

    it('validateJsonSchemaAssertion should fail when required fields are missing', () => {
      const schema = {
        type: 'OBJECT',
        properties: {
          username: { type: 'STRING' },
          email: { type: 'STRING' },
        },
        required: ['username', 'email'],
      };

      const result = engine.validateJsonSchemaAssertion(JSON.stringify({ username: 'alice' }), schema);
      assert.equal(result.passed, false);
      assert.ok(result.reason.includes('Missing required property "email"'));
    });

    it('validateJsonSchemaAssertion should fail on type mismatch', () => {
      const schema = {
        type: 'OBJECT',
        properties: {
          count: { type: 'NUMBER' },
        },
      };

      const result = engine.validateJsonSchemaAssertion(JSON.stringify({ count: 'not-a-number' }), schema);
      assert.equal(result.passed, false);
      assert.ok(result.reason.includes('Property "count" must be a number'));
    });

    it('validateJsonSchemaAssertion should fail when enum value is not allowed', () => {
      const schema = {
        type: 'OBJECT',
        properties: {
          role: { type: 'STRING', enum: ['admin', 'user', 'guest'] },
        },
      };

      const result = engine.validateJsonSchemaAssertion(JSON.stringify({ role: 'superadmin' }), schema);
      assert.equal(result.passed, false);
      assert.ok(result.reason.includes('Property "role" has value "superadmin" which is not in allowed enums'));
    });

    it('evaluateAssertion should support exact match assertionType', async () => {
      const passResult = await engine.evaluateAssertion({
        inputQuery: 'Ping',
        expectedCriteria: 'pong',
        actualOutput: 'pong',
        assertionType: 'exact',
      });
      assert.equal(passResult.passed, true);

      const failResult = await engine.evaluateAssertion({
        inputQuery: 'Ping',
        expectedCriteria: 'pong',
        actualOutput: 'pong extra',
        assertionType: 'exact',
      });
      assert.equal(failResult.passed, false);
    });

    it('evaluateAssertion should support contains assertionType', async () => {
      const passResult = await engine.evaluateAssertion({
        inputQuery: 'Query',
        expectedCriteria: 'target string',
        actualOutput: 'Here is the target string inside text',
        assertionType: 'contains',
      });
      assert.equal(passResult.passed, true);

      const failResult = await engine.evaluateAssertion({
        inputQuery: 'Query',
        expectedCriteria: 'missing string',
        actualOutput: 'Here is some other text',
        assertionType: 'contains',
      });
      assert.equal(failResult.passed, false);
    });

    it('evaluateAssertion should dispatch json_schema assertionType to schema validator', async () => {
      const schema = {
        type: 'OBJECT',
        properties: { summary: { type: 'STRING' } },
        required: ['summary'],
      };

      const passResult = await engine.evaluateAssertion({
        inputQuery: 'Summarize',
        expectedCriteria: 'summary property',
        actualOutput: JSON.stringify({ summary: 'Done deal' }),
        assertionType: 'json_schema',
        expectedSchema: schema,
      });
      assert.equal(passResult.passed, true);

      const failResult = await engine.evaluateAssertion({
        inputQuery: 'Summarize',
        expectedCriteria: 'summary property',
        actualOutput: JSON.stringify({ other: 123 }),
        assertionType: 'json_schema',
        expectedSchema: schema,
      });
      assert.equal(failResult.passed, false);
      assert.ok(failResult.reason.includes('Missing required property "summary"'));
    });
  });

  describe('Session Memory & Checkpointer Dependencies (ensureSessionStore)', () => {
    it('should ensure google-cloud-firestore in requirements.txt and SESSION_STORE_BACKEND in .env.example for firestore backend', () => {
      const firestoreDoc: AgentWorkflowDocument = {
        version: '1.0.0',
        name: 'FirestoreMemoryWorkflow',
        framework: 'google-adk',
        language: 'python',
        nodes: [
          {
            id: 'agent-1',
            type: 'agent',
            position: { x: 0, y: 0 },
            data: {
              label: 'SupportAgent',
              isStartNode: true,
              memoryConfig: {
                type: 'firestore',
                collectionName: 'customer_sessions',
                databaseId: '(default)',
              },
            },
          },
        ],
        edges: [],
      };

      const initialFiles = [
        { path: 'agent.py', content: 'root_agent = Agent(name="support_agent")', language: 'python' },
        { path: 'requirements.txt', content: 'google-adk>=0.1.0\ngoogle-cloud-aiplatform>=1.70.0', language: 'text' },
        { path: '.env.example', content: 'GOOGLE_CLOUD_PROJECT=test-proj', language: 'text' },
      ];

      const finalized = engine.ensureSessionStore(firestoreDoc, initialFiles);

      const reqFile = finalized.find((f) => f.path === 'requirements.txt');
      assert.ok(reqFile, 'requirements.txt must be present');
      assert.ok(reqFile.content.includes('google-cloud-firestore>=2.16.0'));

      const envFile = finalized.find((f) => f.path === '.env.example');
      assert.ok(envFile, '.env.example must be present');
      assert.ok(envFile.content.includes('SESSION_STORE_BACKEND=firestore'));
    });

    it('should ensure psycopg2/sqlalchemy in requirements.txt for cloud_sql / postgres backend', () => {
      const sqlDoc: AgentWorkflowDocument = {
        version: '1.0.0',
        name: 'CloudSqlMemoryWorkflow',
        framework: 'google-adk',
        language: 'python',
        nodes: [
          {
            id: 'agent-1',
            type: 'agent',
            position: { x: 0, y: 0 },
            data: {
              label: 'SqlAgent',
              isStartNode: true,
              memoryConfig: {
                type: 'cloud_sql',
                instanceConnectionName: 'proj:region:sql-inst',
                databaseName: 'agent_sessions_db',
                tableName: 'custom_sql_sessions',
              },
            },
          },
        ],
        edges: [],
      };

      const initialFiles = [
        { path: 'agent.py', content: 'root_agent = Agent(name="sql_agent")', language: 'python' },
        { path: 'requirements.txt', content: 'google-adk>=0.1.0\ngoogle-cloud-aiplatform>=1.70.0', language: 'text' },
      ];

      const finalized = engine.ensureSessionStore(sqlDoc, initialFiles);

      const reqFile = finalized.find((f) => f.path === 'requirements.txt');
      assert.ok(reqFile, 'requirements.txt must be present');
      assert.ok(reqFile.content.includes('psycopg2-binary>=2.9.9'));
      assert.ok(reqFile.content.includes('sqlalchemy>=2.0.0'));
    });

    it('should ensure google-cloud-spanner in requirements.txt for spanner backend', () => {
      const spannerDoc: AgentWorkflowDocument = {
        version: '1.0.0',
        name: 'SpannerMemoryWorkflow',
        framework: 'google-adk',
        language: 'python',
        nodes: [
          {
            id: 'agent-1',
            type: 'agent',
            position: { x: 0, y: 0 },
            data: {
              label: 'SpannerAgent',
              isStartNode: true,
              memoryConfig: {
                type: 'spanner',
                instanceId: 'spanner-inst-1',
                databaseId: 'spanner-db-1',
                tableName: 'EnterpriseSessions',
              },
            },
          },
        ],
        edges: [],
      };

      const initialFiles = [
        { path: 'agent.py', content: 'root_agent = Agent(name="spanner_agent")', language: 'python' },
        { path: 'requirements.txt', content: 'google-adk>=0.1.0', language: 'text' },
      ];

      const finalized = engine.ensureSessionStore(spannerDoc, initialFiles);

      const reqFile = finalized.find((f) => f.path === 'requirements.txt');
      assert.ok(reqFile.content.includes('google-cloud-spanner>=3.40.0'));
    });

    it('should ensure redis driver in requirements.txt for redis backend', () => {
      const redisDoc: AgentWorkflowDocument = {
        version: '1.0.0',
        name: 'RedisMemoryWorkflow',
        framework: 'google-adk',
        language: 'python',
        nodes: [
          {
            id: 'agent-1',
            type: 'agent',
            position: { x: 0, y: 0 },
            data: {
              label: 'RedisAgent',
              isStartNode: true,
              memoryConfig: {
                type: 'redis',
                redisHost: '10.0.0.5',
                redisPort: 6379,
                ttlSeconds: 7200,
              },
            },
          },
        ],
        edges: [],
      };

      const initialFiles = [
        { path: 'agent.py', content: 'root_agent = Agent(name="redis_agent")', language: 'python' },
        { path: 'requirements.txt', content: 'google-adk>=0.1.0', language: 'text' },
      ];

      const finalized = engine.ensureSessionStore(redisDoc, initialFiles);

      const reqFile = finalized.find((f) => f.path === 'requirements.txt');
      assert.ok(reqFile.content.includes('redis>=5.0.0'));
    });

    it('should preserve LLM-generated session_store.py and synchronize .env.example in finalizeGeneratedFiles pipeline', () => {
      const doc: AgentWorkflowDocument = {
        version: '1.0.0',
        name: 'FinalizeWorkflow',
        framework: 'google-adk',
        language: 'python',
        nodes: [
          {
            id: 'agent-1',
            type: 'agent',
            position: { x: 0, y: 0 },
            data: {
              label: 'FinalizeAgent',
              isStartNode: true,
              memoryConfig: {
                type: 'in_memory',
                windowTurns: 20,
              },
            },
          },
        ],
        edges: [],
      };

      const rawGenerated = [
        { path: 'agent.py', content: 'root_agent = Agent(name="finalize_agent")', language: 'python' },
        { path: 'session_store.py', content: 'def get_session_store(): return InMemorySessionStore()', language: 'python' },
        { path: 'requirements.txt', content: 'google-adk>=0.1.0', language: 'text' },
        { path: '.env.example', content: 'GOOGLE_CLOUD_PROJECT=test-proj', language: 'text' },
      ];

      const finalized = engine.finalizeGeneratedFiles(doc, rawGenerated);

      const sessionStore = finalized.find((f) => f.path === 'session_store.py');
      assert.ok(sessionStore);
      assert.ok(sessionStore.content.includes('get_session_store'));

      const envFile = finalized.find((f) => f.path === '.env.example');
      assert.ok(envFile);
      assert.ok(envFile.content.includes('SESSION_STORE_BACKEND=in_memory'));
    });
  });

  describe('AbortSignal Cancellation Support', () => {
    it('should immediately return cancelled result when signal is aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      const result = await engine.generateCode({
        document: sampleDoc,
        signal: controller.signal,
      });

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.cancelled, true);
      assert.strictEqual(result.error, 'Code generation cancelled by user');
      assert.deepStrictEqual(result.files, []);
    });
  });

  describe('Pure LLM Prompt Engineering for Advanced Agent Kinds & Patterns', () => {
    const promptFiles = [
      'resource/prompts/python_adk_agent-engine.prompt.txt',
      'resource/prompts/python_adk_cloudrun.prompt.txt',
    ];

    for (const relPath of promptFiles) {
      const fullPath = path.resolve(extensionPath, relPath);

      it(`should contain exhaustive prompt rules in ${relPath}`, () => {
        assert.ok(fs.existsSync(fullPath), `${relPath} must exist`);
        const content = fs.readFileSync(fullPath, 'utf-8');

        // Synthesizer instructions
        assert.ok(content.includes('agentKind: "synthesizer"'));
        assert.ok(content.includes('CRITICAL ZERO-TOOLS RULE'));
        assert.ok(content.includes('output_schema'));

        // Approval Gate (HITL) instructions
        assert.ok(content.includes('agentKind: "hitl"'));
        assert.ok(content.includes('ApprovalGate'));
        assert.ok(content.includes('approved_agent'));
        assert.ok(content.includes('rejected_agent'));

        // Fallback Circuit Breaker instructions
        assert.ok(content.includes('agentKind: "fallback"'));
        assert.ok(content.includes('CircuitBreaker'));
        assert.ok(content.includes('primary_agent'));
        assert.ok(content.includes('fallback_agent'));

        // Guardrail Shield instructions
        assert.ok(content.includes('agentKind: "guardrail"'));
        assert.ok(content.includes('GuardrailShield'));
        assert.ok(content.includes('pass_agent'));
        assert.ok(content.includes('block_agent'));

        // Evaluator-Optimizer Loop instructions
        assert.ok(content.includes('subAgentPattern: "loop"'));
        assert.ok(content.includes('LoopAgent'));
        assert.ok(content.includes('max_iterations'));

        // Multi-Agent Debate instructions
        assert.ok(content.includes('subAgentPattern: "debate"'));
        assert.ok(content.includes('Consensus Judge'));

        // Review & Critique Triad instructions
        assert.ok(content.includes('subAgentPattern: "review_critique"'));
        assert.ok(content.includes('initial_draft'));
        assert.ok(content.includes('critique'));

        // Agent-as-a-Tool instructions
        assert.ok(content.includes('Agent-as-a-Tool Pattern'));
        assert.ok(content.includes('Runner(agent='));

        // SQLite session checkpointer
        assert.ok(content.includes("'sqlite'"));
        assert.ok(content.includes('SqliteSessionStore'));

        // Self-contained CLI & CI/CD Makefile manifest rules
        assert.ok(content.includes('Makefile'), `${relPath} must require a Makefile`);
        assert.ok(content.includes('make install'), `${relPath} must document make install`);
        assert.ok(content.includes('make test'), `${relPath} must document make test`);
        assert.ok(content.includes('make infra'), `${relPath} must document make infra`);
        assert.ok(content.includes('make deploy'), `${relPath} must document make deploy`);
      });
    }

    it('should require .agent_engine_config.json, .ae_ignore, and pyproject.toml in python_adk_agent-engine.prompt.txt', () => {
      const aePromptPath = path.resolve(extensionPath, 'resource/prompts/python_adk_agent-engine.prompt.txt');
      const aeContent = fs.readFileSync(aePromptPath, 'utf-8');
      assert.ok(aeContent.includes('.agent_engine_config.json'));
      assert.ok(aeContent.includes('.ae_ignore'));
      assert.ok(aeContent.includes('pyproject.toml'));
    });
  });
});


