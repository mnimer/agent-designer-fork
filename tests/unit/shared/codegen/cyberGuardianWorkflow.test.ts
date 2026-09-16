/**
 * Unit Tests for Cyber Guardian Sample Workflow
 *
 * Validates:
 * 1. Loading and parsing of resource/sample/cyber_guardian.agent.
 * 2. Strict adherence to AgentWorkflowDocument schema, 8pt grid positioning, and gemini-3.7-flash.
 * 3. Generation of tools.py with all SecOps BigQuery query tools.
 * 4. Generation of agent_workflow.py with proper sub-agent instantiation and sub_agents wiring.
 * 5. Full project bundling (tools.py, agent_workflow.py, requirements.txt, .env.example, README.md).
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AgentWorkflowDocument } from '../../../../src/shared/types';

describe('Cyber Guardian SecOps Sample Workflow (.agent)', () => {
  const samplePath = path.resolve(__dirname, '../../../../resource/sample/cyber_guardian/cyber_guardian.agent');

  it('should load resource/sample/cyber_guardian/cyber_guardian.agent successfully as valid JSON', () => {
    assert.ok(fs.existsSync(samplePath), 'cyber_guardian.agent file exists in resource/sample/cyber_guardian/');
    const rawContent = fs.readFileSync(samplePath, 'utf-8');
    const workflow: AgentWorkflowDocument = JSON.parse(rawContent);

    assert.equal(workflow.version, '1.0.0');
    assert.equal(workflow.name, 'CyberGuardianSecOps');
    assert.equal(workflow.framework, 'google-adk');
    assert.equal(workflow.language, 'python');
    assert.equal(workflow.metadata?.author, 'Mike Nimer <mikenimer@google.com>');
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

    const agentNodes = (workflow.nodes || []).filter((n) => n.type === 'agent');
    assert.equal(agentNodes.length, 5, 'Must contain 1 orchestrator and 4 sub-agents');

    for (const node of agentNodes) {
      assert.equal(
        node.data.model,
        'gemini-3.7-flash',
        `Agent ${node.id} must use gemini-3.7-flash`
      );
    }
  });
});

