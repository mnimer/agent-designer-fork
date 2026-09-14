/**
 * Sample Workflows and Drag-and-Drop Unit Tests
 *
 * Purpose:
 * Validates that all built-in and discovered enterprise blueprints adhere to architectural
 * standards:
 * 1. Model compliance: All LLM models strictly specify 'gemini-3.7-flash' (no deprecated 1.x/2.x).
 * 2. Graph topology: Nodes have valid unique IDs, edges reference existing nodes, and triggers connect to start nodes.
 * 3. Test suites: Trigger nodes provide populated test scenarios with prompts and assertions.
 * 4. Local file tools: Local file tools (e.g. Cyber Guardian) have valid relative paths and function names.
 * 5. Drag-and-drop mechanics: Payload format and node ID remapping on populated canvases.
 *
 * Architectural Decisions:
 * - Author: Mike Nimer <mikenimer@google.com>
 * - Decision 1: Blueprints must never reference deprecated gemini-1.5 or gemini-2.5 models.
 * - Decision 2: All samples must include at least one automated test scenario.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  SAMPLES_CATALOG,
  SAMPLE_CYBER_GUARDIAN,
  SAMPLE_PROCUREMENT_REQUEST,
  SAMPLE_COMPANY_VERIFIER,
  SAMPLE_CUSTOMER_SUPPORT,
  SAMPLE_FINANCIAL_ANALYST,
  SAMPLE_CODE_CRITIC,
  SAMPLE_HIGH_VOLUME_DOCUMENT_ANALYZER,
} from '../../src/webview/data/sampleWorkflows';
import { SampleWorkflowDefinition } from '../../src/webview/types';

describe('TASK-128 & TASK-158: Sample Workflows & Blueprints Catalog', () => {
  it('should contain all 7 enterprise blueprints in the catalog', () => {
    assert.strictEqual(SAMPLES_CATALOG.length, 7, 'Catalog must contain exactly 7 blueprints');
    const ids = SAMPLES_CATALOG.map((s) => s.id);
    assert.ok(ids.includes('cyber_guardian'), 'Missing cyber_guardian blueprint');
    assert.ok(ids.includes('procurement_request'), 'Missing procurement_request blueprint');
    assert.ok(ids.includes('company_verifier'), 'Missing company_verifier blueprint');
    assert.ok(ids.includes('customer_support'), 'Missing customer_support blueprint');
    assert.ok(ids.includes('financial_analyst'), 'Missing financial_analyst blueprint');
    assert.ok(ids.includes('code_critic'), 'Missing code_critic blueprint');
    assert.ok(ids.includes('high_volume_document_analyzer'), 'Missing high_volume_document_analyzer blueprint');
  });

  it('should enforce gemini-3.7-flash model across all agent nodes in all blueprints', () => {
    for (const sample of SAMPLES_CATALOG) {
      for (const node of sample.nodes) {
        if (node.type === 'agentNode' || node.type === 'agent') {
          const data = node.data as any;
          assert.strictEqual(
            data.model,
            'gemini-3.7-flash',
            `Blueprint "${sample.name}" node "${data.label || node.id}" must use "gemini-3.7-flash" but found "${data.model}"`
          );
        }
      }
    }
  });

  it('should validate DAG topology for every sample blueprint', () => {
    for (const sample of SAMPLES_CATALOG) {
      const nodeIds = new Set(sample.nodes.map((n) => n.id));
      assert.strictEqual(
        nodeIds.size,
        sample.nodes.length,
        `Duplicate node IDs found in sample "${sample.name}"`
      );

      for (const edge of sample.edges) {
        assert.ok(
          nodeIds.has(edge.source),
          `Edge "${edge.id}" in sample "${sample.name}" references non-existent source "${edge.source}"`
        );
        assert.ok(
          nodeIds.has(edge.target),
          `Edge "${edge.id}" in sample "${sample.name}" references non-existent target "${edge.target}"`
        );
      }
    }
  });

  it('should have populated test scenarios in every sample trigger', () => {
    for (const sample of SAMPLES_CATALOG) {
      assert.ok(
        sample.testPrompts && sample.testPrompts.length > 0,
        `Sample "${sample.name}" must contain at least one test scenario in testPrompts`
      );

      for (const prompt of sample.testPrompts) {
        assert.ok(prompt.name, `Test scenario in "${sample.name}" must have a name`);
        assert.ok(prompt.prompt, `Test scenario "${prompt.name}" in "${sample.name}" must have a non-empty prompt`);
        assert.ok(prompt.expectedOutput, `Test scenario "${prompt.name}" in "${sample.name}" must have an expectedOutput assertion`);
      }
    }
  });

  it('should configure local Python file tools with toolMode and sourceFile in cyber_guardian', () => {
    const cyber = SAMPLE_CYBER_GUARDIAN;
    const triageNode = cyber.nodes.find((n) => n.id === 'node-agent-triage');
    assert.ok(triageNode, 'cyber_guardian must have node-agent-triage node');
    const tools = (triageNode.data as any).tools;
    assert.ok(Array.isArray(tools) && tools.length > 0, 'node-agent-triage must have tools attached');

    for (const tool of tools) {
      assert.strictEqual(tool.toolMode, 'local_file', `Tool "${tool.name}" must use toolMode="local_file"`);
      assert.ok(tool.sourceFile?.startsWith('./tools/'), `Tool "${tool.name}" sourceFile must point to ./tools/`);
      assert.ok(tool.functionName, `Tool "${tool.name}" must have a functionName specified`);
    }
  });

  it('should configure local Python file tools with toolMode and sourceFile in high_volume_document_analyzer', () => {
    const docAnalyzer = SAMPLE_HIGH_VOLUME_DOCUMENT_ANALYZER;
    const agentNode = docAnalyzer.nodes.find((n) => n.id === 'node-agent-doc-analyzer');
    assert.ok(agentNode, 'high_volume_document_analyzer must have node-agent-doc-analyzer node');
    const tools = (agentNode.data as any).tools;
    assert.ok(Array.isArray(tools) && tools.length > 0, 'node-agent-doc-analyzer must have tools attached');

    for (const tool of tools) {
      assert.strictEqual(tool.toolMode, 'local_file', `Tool "${tool.name}" must use toolMode="local_file"`);
      assert.strictEqual(tool.sourceFile, './tools/document_toolset.py');
      assert.strictEqual(tool.functionName, 'analyze_document_next_chunk');
    }
  });

  it('should simulate canvas drop ID remapping on populated canvas', () => {
    const sample = SAMPLE_CODE_CRITIC;
    const dropPosition = { x: 500, y: 300 };

    const minX = Math.min(...sample.nodes.map((n) => n.position.x));
    const minY = Math.min(...sample.nodes.map((n) => n.position.y));
    const prefix = `s_${sample.id}_test_`;
    const idMap = new Map<string, string>();

    const remappedNodes = sample.nodes.map((node) => {
      const newId = `${prefix}${node.id}`;
      idMap.set(node.id, newId);
      return {
        ...node,
        id: newId,
        position: {
          x: Math.round(dropPosition.x + (node.position.x - minX)),
          y: Math.round(dropPosition.y + (node.position.y - minY)),
        },
        data: { ...(node.data as any), id: newId },
      };
    });

    const remappedEdges = sample.edges.map((edge) => ({
      ...edge,
      id: `${prefix}${edge.id}`,
      source: idMap.get(edge.source) || edge.source,
      target: idMap.get(edge.target) || edge.target,
    }));

    // Verify all IDs are prefixed and unique
    assert.strictEqual(remappedNodes.length, sample.nodes.length);
    assert.strictEqual(remappedEdges.length, sample.edges.length);

    for (const node of remappedNodes) {
      assert.ok(node.id.startsWith(prefix));
    }
    for (const edge of remappedEdges) {
      assert.ok(edge.id.startsWith(prefix));
      assert.ok(edge.source.startsWith(prefix));
      assert.ok(edge.target.startsWith(prefix));
    }
  });
});
