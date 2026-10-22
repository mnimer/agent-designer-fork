/**
 * Unit Tests for Autonomous Multi-Agent Code Reviewer Sample Workflow
 *
 * Validates:
 * 1. Loading and parsing of resource/samples/code_reviewer/code_reviewer.agent.
 * 2. Strict adherence to AgentWorkflowDocument schema, 8pt grid positioning, and gemini-3.7-flash models.
 * 3. Coordinator delegation to 3 specialist sub-agents (Architecture, Security, Testing).
 * 4. Dual entry points (Chat Trigger and Test Suite Node with 6 evaluation scenarios).
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AgentWorkflowDocument } from '../../../../src/shared/types';

describe('Autonomous Multi-Agent Code Reviewer Sample (.agent)', () => {
  const sampleDir = path.resolve(__dirname, '../../../../resource/samples/sdlc/code_reviewer');
  const samplePath = path.join(sampleDir, 'code_reviewer.agent');

  it('should load resource/samples/code_reviewer/code_reviewer.agent successfully as valid JSON', () => {
    assert.ok(fs.existsSync(samplePath), 'code_reviewer.agent file exists in resource/samples/code_reviewer/');
    const rawContent = fs.readFileSync(samplePath, 'utf-8');
    const workflow: AgentWorkflowDocument = JSON.parse(rawContent);

    assert.equal(workflow.version, '1.0.0');
    assert.equal(workflow.name, 'Code Reviewing Agent');
    assert.equal(workflow.framework, 'google-adk');
    assert.equal(workflow.language, 'python');
  });

  it('should verify 8pt grid alignment on all node coordinates', () => {
    const rawContent = fs.readFileSync(samplePath, 'utf-8');
    const workflow: AgentWorkflowDocument = JSON.parse(rawContent);

    for (const node of workflow.nodes || []) {
      assert.equal(
        node.position.x % 8,
        0,
        `Node ${node.id} x coordinate (${node.position.x}) must be a multiple of 8`
      );
      assert.equal(
        node.position.y % 8,
        0,
        `Node ${node.id} y coordinate (${node.position.y}) must be a multiple of 8`
      );
    }
  });

  it('should verify all agent models are gemini-3.7-flash and do not reference cyber model', () => {
    const rawContent = fs.readFileSync(samplePath, 'utf-8');
    const workflow: AgentWorkflowDocument = JSON.parse(rawContent);

    const agentNodes = (workflow.nodes || []).filter(
      (n) => n.type === 'agent' || n.type === 'agentNode'
    );
    assert.equal(agentNodes.length, 4, 'Must contain exactly 4 agent nodes (Coordinator + 3 Specialists)');

    for (const node of agentNodes) {
      const model = (node.data as any).model;
      assert.equal(model, 'gemini-3.7-flash', `Agent ${node.id} must use standard gemini-3.7-flash model`);
      assert.ok(!String(model).includes('cyber'), `Agent ${node.id} must NOT use cyber model`);
    }
  });

  it('should verify Coordinator multi-agent delegation topology', () => {
    const rawContent = fs.readFileSync(samplePath, 'utf-8');
    const workflow: AgentWorkflowDocument = JSON.parse(rawContent);

    const coordinator = (workflow.nodes || []).find((n) => n.id === 'agent_code_review_coordinator');
    assert.ok(coordinator, 'Coordinator agent must exist');
    assert.equal((coordinator.data as any).isStartNode, true);

    const subAgents = (coordinator.data as any).subAgents || [];
    assert.equal(subAgents.length, 3, 'Coordinator must delegate to 3 subagents');

    const subAgentIds = subAgents.map((sa: any) => sa.agentId).sort();
    assert.deepEqual(subAgentIds, [
      'agent_architecture_reviewer',
      'agent_packaging_reviewer',
      'agent_security_reviewer'
    ]);
  });

  it('should verify Test Suite node contains 6 realistic evaluation scenarios', () => {
    const rawContent = fs.readFileSync(samplePath, 'utf-8');
    const workflow: AgentWorkflowDocument = JSON.parse(rawContent);

    const testerNode = (workflow.nodes || []).find((n) => n.id === 'trigger_code_review_tester');
    assert.ok(testerNode, 'Tester node must exist');
    assert.equal((testerNode.data as any).triggerType, 'tester');

    const scenarios = (testerNode.data as any).config?.testScenarios || [];
    assert.equal(scenarios.length, 6, 'Test suite must contain exactly 6 scenarios');

    // Verify key test scenarios
    assert.ok(scenarios.some((s: any) => s.name.includes('SQL Injection')), 'Must have SQL Injection scenario');
    assert.ok(scenarios.some((s: any) => s.name.includes('Secret Leak')), 'Must have Secret Leak scenario');
    assert.ok(scenarios.some((s: any) => s.name.includes('Missing Dependency')), 'Must have Missing Dependency scenario');
    assert.ok(scenarios.some((s: any) => s.name.includes('God-Class')), 'Must have God-Class architecture scenario');
    assert.ok(scenarios.some((s: any) => s.name.includes('SSRF')), 'Must have SSRF scenario');
    assert.ok(scenarios.some((s: any) => s.name.includes('Clean Production PR')), 'Must have Clean Production PR scenario');
  });

  it('should have physical tools and README.md in resource/samples/code_reviewer/', () => {
    assert.ok(fs.existsSync(path.join(sampleDir, 'README.md')), 'README.md must exist in sample folder');
    assert.ok(fs.existsSync(path.join(sampleDir, 'tools', 'code_inspection_tools.py')), 'code_inspection_tools.py must exist in tools/');
    assert.ok(fs.existsSync(path.join(sampleDir, 'tools', '__init__.py')), '__init__.py must exist in tools/');
  });
});
