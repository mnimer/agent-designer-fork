/**
 * Unit Tests for GeminiCodeGenEngine
 *
 * Validates:
 * 1. Prompt template discovery and {{WORKFLOW_JSON}} interpolation.
 * 2. Multi-file JSON response parsing and markdown fence stripping.
 * 3. High-fidelity deterministic Python ADK repository synthesis.
 * 4. Pydantic BaseModel emission for agents with structured output schemas.
 * 5. Pytest suite code generation conforming to trigger test cases.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'path';
import { GeminiCodeGenEngine } from '../../src/extension/GeminiCodeGenEngine';
import { AgentWorkflowDocument } from '../../src/shared/types';

describe('GeminiCodeGenEngine Prompt-Driven Generation', () => {
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
          model: 'gemini-2.5-pro',
          systemPrompt: 'You are a customer support specialist.',
          temperature: 0.3,
          tools: [
            {
              id: 'tool-search',
              name: 'Google Search Grounding',
              type: 'builtin',
            },
          ],
          structuredOutputSchema: {
            enabled: true,
            name: 'TriageDecision',
            fields: [
              { id: '1', name: 'category', type: 'string', required: true },
              { id: '2', name: 'confidenceScore', type: 'number', required: true },
            ],
          },
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

  it('should load prompt template for python-adk successfully', () => {
    const prompt = engine.loadPromptTemplate('google-adk', 'python');
    assert.ok(prompt.length > 0);
    assert.ok(prompt.includes('{{WORKFLOW_JSON}}') || prompt.includes('Google GenAI SDK'));
  });

  it('should parse raw Gemini JSON response with markdown fences', () => {
    const rawFencedResponse = '```json\n[\n  {\n    "path": "test.py",\n    "description": "Test file",\n    "content": "print(123)"\n  }\n]\n```';
    const files = engine.parseGeminiResponse(rawFencedResponse);
    assert.equal(files.length, 1);
    assert.equal(files[0].path, 'test.py');
    assert.equal(files[0].language, 'python');
    assert.equal(files[0].content, 'print(123)');
  });

  it('should parse raw un-fenced Gemini JSON response', () => {
    const rawResponse = JSON.stringify([
      { path: 'main.tf', description: 'Terraform file', content: 'provider "google" {}' },
    ]);
    const files = engine.parseGeminiResponse(rawResponse);
    assert.equal(files.length, 1);
    assert.equal(files[0].path, 'main.tf');
    assert.equal(files[0].language, 'terraform');
  });

  it('should generate complete deterministic repository when offline', async () => {
    const result = await engine.generateCode({
      document: sampleDoc,
      framework: 'google-adk',
      language: 'python',
    });

    assert.equal(result.success, true);
    assert.ok(result.files.length >= 7);

    // Verify critical generated files
    const workflowFile = result.files.find((f) => f.path === 'agent_workflow.py');
    assert.ok(workflowFile);
    assert.ok(workflowFile?.content.includes('from google import genai'));
    assert.ok(workflowFile?.content.includes('from google.genai import types'));
    assert.ok(workflowFile?.content.includes('class TriageSpecialistWorkflow:'));
    assert.ok(workflowFile?.content.includes('class ResponseSchema(BaseModel):'));
    assert.ok(workflowFile?.content.includes('category: str'));
    assert.ok(workflowFile?.content.includes('confidenceScore: float'));

    const testFile = result.files.find((f) => f.path === 'test_pipeline.py');
    assert.ok(testFile);
    assert.ok(testFile?.content.includes('def test_refund_request():'));
    assert.ok(testFile?.content.includes('assert "refund" in result.lower()'));

    const reqFile = result.files.find((f) => f.path === 'requirements.txt');
    assert.ok(reqFile);
    assert.ok(reqFile?.content.includes('google-genai'));
    assert.ok(reqFile?.content.includes('pytest'));

    const tfFile = result.files.find((f) => f.path === 'main.tf');
    assert.ok(tfFile);
    assert.ok(tfFile?.content.includes('google_cloud_run_v2_service'));
  });
});
