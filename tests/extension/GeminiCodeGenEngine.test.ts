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
import { GeminiCodeGenEngine } from '../../src/extension/GeminiCodeGenEngine';
import { AgentWorkflowDocument } from '../../src/shared/types';

describe('GeminiCodeGenEngine Pure LLM Code Generation', () => {
  const extensionPath = path.resolve(__dirname, '../..');
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
    assert.ok(agentEnginePrompt.includes('deploy.py'));

    const agentEngineUnderscorePrompt = engine.loadPromptTemplate('google-adk', 'python', 'agent_engine');
    assert.ok(agentEngineUnderscorePrompt.includes('Agent Engine'));
    assert.ok(agentEngineUnderscorePrompt.includes('deploy.py'));
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
      return [{ path: 'agent.py', description: 'Test', content: 'print("ok")' }];
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
});
