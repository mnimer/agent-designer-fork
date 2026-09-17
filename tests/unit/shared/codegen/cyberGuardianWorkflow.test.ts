/**
 * Unit Tests for Company Verifier Sample Workflow
 *
 * Validates:
 * 1. Loading and parsing of resource/samples/company_verifier/company_verifier.agent.
 * 2. Strict adherence to AgentWorkflowDocument schema, 8pt grid positioning, and gemini-3.7-flash.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AgentWorkflowDocument } from '../../../../src/shared/types';

describe('Company Verifier Sample Workflow (.agent)', () => {
  const samplePath = path.resolve(__dirname, '../../../../resource/samples/company_verifier/company_verifier.agent');

  it('should load resource/samples/company_verifier/company_verifier.agent successfully as valid JSON', () => {
    assert.ok(fs.existsSync(samplePath), 'company_verifier.agent file exists in resource/samples/company_verifier/');
    const rawContent = fs.readFileSync(samplePath, 'utf-8');
    const workflow: AgentWorkflowDocument = JSON.parse(rawContent);

    assert.equal(workflow.version, '1.0.0');
    assert.equal(workflow.name, 'Company Verifier & Entity Classifier');
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

  it('should verify all agent models are gemini-3.7-flash (no deprecated 2.x/1.x)', () => {
    const rawContent = fs.readFileSync(samplePath, 'utf-8');
    const workflow: AgentWorkflowDocument = JSON.parse(rawContent);

    const agentNodes = (workflow.nodes || []).filter(
      (n) => n.type === 'agent' || n.type === 'agentNode'
    );
    assert.ok(agentNodes.length >= 1, 'Must contain at least 1 agent node');

    for (const node of agentNodes) {
      assert.equal(
        (node.data as any).model,
        'gemini-3.7-flash',
        `Agent ${node.id} must use gemini-3.7-flash`
      );
    }
  });
});
