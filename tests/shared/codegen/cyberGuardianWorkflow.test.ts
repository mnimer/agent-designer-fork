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
import { PythonAdkGenerator } from '../../../src/shared/codegen/pythonAdkGenerator';
import { AgentWorkflowDocument } from '../../../src/shared/types';

describe('Cyber Guardian SecOps Sample Workflow (.agent)', () => {
  const samplePath = path.resolve(__dirname, '../../../resource/sample/cyber_guardian/cyber_guardian.agent');

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

  it('should generate tools.py referencing local python tool files', () => {
    const rawContent = fs.readFileSync(samplePath, 'utf-8');
    const workflow: AgentWorkflowDocument = JSON.parse(rawContent);
    const generator = new PythonAdkGenerator();

    const toolsPy = generator.generateToolsFile(workflow);

    // Verify all tool imports from local tools package
    assert.ok(toolsPy.includes('from tools.incident_tools import incident_query_tool'), 'incident_query_tool imported');
    assert.ok(toolsPy.includes('from tools.triage_tools import triage_query_tool'), 'triage_query_tool imported');
    assert.ok(toolsPy.includes('from tools.threat_intel_tools import threat_intel_query_tool'), 'threat_intel_query_tool imported');
    assert.ok(toolsPy.includes('from tools.investigation_tools import investigation_query_tool'), 'investigation_query_tool imported');
    assert.ok(toolsPy.includes('from tools.response_tools import response_query_tool'), 'response_query_tool imported');

    // Verify setup_agent_tools wiring per node
    assert.ok(toolsPy.includes('if agent_id == "node-agent-orchestrator":'));
    assert.ok(toolsPy.includes('tools.append(incident_query_tool)'));
    assert.ok(toolsPy.includes('if agent_id == "node-agent-triage":'));
    assert.ok(toolsPy.includes('tools.append(triage_query_tool)'));
    assert.ok(toolsPy.includes('if agent_id == "node-agent-threatintel":'));
    assert.ok(toolsPy.includes('tools.append(threat_intel_query_tool)'));
    assert.ok(toolsPy.includes('if agent_id == "node-agent-investigation":'));
    assert.ok(toolsPy.includes('tools.append(investigation_query_tool)'));
    assert.ok(toolsPy.includes('if agent_id == "node-agent-response":'));
    assert.ok(toolsPy.includes('tools.append(response_query_tool)'));
  });

  it('should generate agent_workflow.py with orchestrator and sub-agents', () => {
    const rawContent = fs.readFileSync(samplePath, 'utf-8');
    const workflow: AgentWorkflowDocument = JSON.parse(rawContent);
    const generator = new PythonAdkGenerator();

    const workflowPy = generator.generateWorkflowFile(workflow);

    // Verify all agents are instantiated
    assert.ok(workflowPy.includes('cyber_guardian_orchestrator = Agent('));
    assert.ok(workflowPy.includes('triage_specialist = Agent('));
    assert.ok(workflowPy.includes('threat_intel_specialist = Agent('));
    assert.ok(workflowPy.includes('investigation_specialist = Agent('));
    assert.ok(workflowPy.includes('response_specialist = Agent('));

    // Verify sub-agents are declared before parent orchestrator
    const triageIndex = workflowPy.indexOf('triage_specialist = Agent(');
    const orchestratorIndex = workflowPy.indexOf('cyber_guardian_orchestrator = Agent(');
    assert.ok(triageIndex < orchestratorIndex, 'Sub-agents must be instantiated before the coordinator orchestrator');

    // Verify sub_agents array wiring in orchestrator
    assert.ok(workflowPy.includes('sub_agents=[\n        triage_specialist,\n        threat_intel_specialist,\n        investigation_specialist,\n        response_specialist,\n    ],'));

    // Verify runner execution starts from cyber_guardian_orchestrator
    assert.ok(
      workflowPy.includes('root_agent = cyber_guardian_orchestrator') ||
      workflowPy.includes('runner = Runner(agent=cyber_guardian_orchestrator)')
    );
  });

  it('should bundle complete full project with requirements and env templates', () => {
    const rawContent = fs.readFileSync(samplePath, 'utf-8');
    const workflow: AgentWorkflowDocument = JSON.parse(rawContent);
    const generator = new PythonAdkGenerator();

    const files = generator.generateFullProject(workflow, {
      projectId: 'my-secops-project',
      location: 'global',
    });

    const fileMap = new Map(files.map((f) => [f.path, f.content]));
    assert.ok(fileMap.has('tools.py'));
    assert.ok(fileMap.has('agent_workflow.py'));
    assert.ok(fileMap.has('requirements.txt'));
    assert.ok(fileMap.has('.env.example'));
    assert.ok(fileMap.has('README.md'));

    const envContent = fileMap.get('.env.example')!;
    assert.ok(envContent.includes('GOOGLE_CLOUD_PROJECT=my-secops-project'));
    assert.ok(envContent.includes('GOOGLE_CLOUD_LOCATION=global'));

    const reqContent = fileMap.get('requirements.txt')!;
    assert.ok(reqContent.includes('google-adk>=0.1.0'));
  });
});
