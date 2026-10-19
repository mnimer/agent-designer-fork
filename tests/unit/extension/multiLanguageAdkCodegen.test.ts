/**
 * Unit Tests for Multi-Language ADK Code Generation Targets: Go & Java (TASK-238)
 *
 * Validates:
 * 1. GeminiCodeGenEngine.loadPromptTemplate() resolves go_adk_cloudrun.prompt.txt when language is 'go'.
 * 2. GeminiCodeGenEngine.loadPromptTemplate() resolves java_adk_cloudrun.prompt.txt when language is 'java'.
 * 3. GeminiCodeGenEngine.loadPromptTemplate() resolves python_adk_gke.prompt.txt when target is 'gke'.
 * 4. go_adk_cloudrun.prompt.txt contains required Go module, ADK packages, and Gemini 3.8 Flash model.
 * 5. java_adk_cloudrun.prompt.txt contains required Maven pom.xml, ADK Java packages, and Gemini 3.8 Flash model.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'path';
import * as fs from 'fs';
import { GeminiCodeGenEngine } from '../../../src/extension/GeminiCodeGenEngine';

describe('Multi-Language ADK Code Generation (TASK-238)', () => {
  const extensionPath = path.resolve(__dirname, '../../..');
  const engine = new GeminiCodeGenEngine(extensionPath);

  // Section: Go ADK Prompt Template Resolution
  it('should load go_adk_cloudrun.prompt.txt when language is go', () => {
    const prompt = engine.loadPromptTemplate('google-adk', 'go', 'cloud_run');
    assert.ok(prompt.length > 0);
    assert.ok(prompt.includes('{{WORKFLOW_JSON}}'));
    assert.ok(prompt.includes('google.golang.org/adk'));
    assert.ok(prompt.includes('gemini-3.8-flash'));
  });

  it('should fallback to go_adk_cloudrun.prompt.txt when target is agent_engine or default', () => {
    const prompt = engine.loadPromptTemplate('google-adk', 'go', 'agent-engine');
    assert.ok(prompt.includes('google.golang.org/adk'));
    assert.ok(prompt.includes('cmd/agent/main.go'));
  });

  // Section: Java ADK Prompt Template Resolution
  it('should load java_adk_cloudrun.prompt.txt when language is java', () => {
    const prompt = engine.loadPromptTemplate('google-adk', 'java', 'cloud_run');
    assert.ok(prompt.length > 0);
    assert.ok(prompt.includes('{{WORKFLOW_JSON}}'));
    assert.ok(prompt.includes('com.google.adk'));
    assert.ok(prompt.includes('gemini-3.8-flash'));
  });

  it('should fallback to java_adk_cloudrun.prompt.txt when target is agent_engine or default', () => {
    const prompt = engine.loadPromptTemplate('google-adk', 'java');
    assert.ok(prompt.includes('com.google.adk'));
    assert.ok(prompt.includes('pom.xml'));
  });

  // Section: GKE Python Prompt Template Resolution
  it('should load python_adk_gke.prompt.txt when target is gke and language is python', () => {
    const prompt = engine.loadPromptTemplate('google-adk', 'python', 'gke');
    assert.ok(prompt.length > 0);
    assert.ok(prompt.includes('GKE Autopilot'));
    assert.ok(prompt.includes('k8s/deployment.yaml'));
    assert.ok(prompt.includes('enable_autopilot = true'));
  });

  // Section: Prompt Template File Content Integrity
  it('should ensure go_adk_cloudrun.prompt.txt defines complete Go manifest with no deprecated models', () => {
    const promptPath = path.resolve(__dirname, '../../../resource/prompts/go_adk_cloudrun.prompt.txt');
    const content = fs.readFileSync(promptPath, 'utf8');

    assert.ok(content.includes('go.mod'));
    assert.ok(content.includes('cmd/agent/main.go'));
    assert.ok(content.includes('internal/agents/agent.go'));
    assert.ok(content.includes('internal/agents/agent_test.go'));
    assert.ok(content.includes('Dockerfile'));
    assert.ok(content.includes('gemini-3.8-flash'));
    assert.ok(!content.includes('gemini-2.5'));
  });

  it('should ensure java_adk_cloudrun.prompt.txt defines complete Java manifest with no deprecated models', () => {
    const promptPath = path.resolve(__dirname, '../../../resource/prompts/java_adk_cloudrun.prompt.txt');
    const content = fs.readFileSync(promptPath, 'utf8');

    assert.ok(content.includes('pom.xml'));
    assert.ok(content.includes('src/main/java/com/example/agent/AgentApp.java'));
    assert.ok(content.includes('src/test/java/com/example/agent/AgentAppTest.java'));
    assert.ok(content.includes('Dockerfile'));
    assert.ok(content.includes('gemini-3.8-flash'));
    assert.ok(!content.includes('gemini-2.5'));
  });
});
