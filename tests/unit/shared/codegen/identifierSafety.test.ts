/**
 * Unit Tests for Topological Ordering, Python Keyword & Duplicate Identifier Safety (TASK-138)
 *
 * Purpose:
 * Validates identifier sanitization, duplicate variable disambiguation,
 * topological dependency sorting, cycle detection, and generator integration.
 *
 * Architectural Decisions:
 * - Author: Mike Nimer <mikenimer@google.com>
 * - Decision 1: Node.js native testing via node:test and node:assert/strict.
 * - Decision 2: Exhaustive coverage of keyword sanitization, digit prefixing, duplicate disambiguation.
 * - Decision 3: Verification of topological sorting with edge references, router targets, and agent tools.
 * - Decision 4: Asserting precise cycle diagnostic messages listing the participating node IDs.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeIdentifier, topologicalSortAgents } from '../../../../src/shared/codegen/nameSanitizer';
import { PythonAdkGenerator } from '../../../../src/shared/codegen/pythonAdkGenerator';
import { LanggraphGenerator } from '../../../../src/shared/codegen/langgraphGenerator';
import { AgentWorkflowDocument } from '../../../../src/shared/types';

describe('Topological Ordering & Identifier Safety (TASK-138)', () => {
  describe('sanitizeIdentifier', () => {
    it('should replace non-identifier characters with underscores', () => {
      const result = sanitizeIdentifier('my agent!');
      assert.strictEqual(result, 'my_agent_');
    });

    it('should prefix identifier with underscore if starting with a digit', () => {
      const result = sanitizeIdentifier('2nd_agent');
      assert.strictEqual(result, '_2nd_agent');
    });

    it('should append underscore if name matches a Python keyword', () => {
      const result = sanitizeIdentifier('for');
      assert.strictEqual(result, 'for_');
    });

    it('should append underscore if name matches a Python builtin', () => {
      const result = sanitizeIdentifier('print');
      assert.strictEqual(result, 'print_');
    });

    it('should resolve duplicates by appending counters using usedNames tracker', () => {
      const usedNames = new Set<string>();
      const first = sanitizeIdentifier('Support Agent', usedNames);
      const second = sanitizeIdentifier('Support Agent', usedNames);
      const third = sanitizeIdentifier('Support Agent', usedNames);

      assert.strictEqual(first, 'support_agent');
      assert.strictEqual(second, 'support_agent_2');
      assert.strictEqual(third, 'support_agent_3');
    });

    it('should handle keyword collision resolution with duplicate tracking', () => {
      const usedNames = new Set<string>();
      const first = sanitizeIdentifier('for', usedNames);
      const second = sanitizeIdentifier('for', usedNames);

      assert.strictEqual(first, 'for_');
      assert.strictEqual(second, 'for__2');
    });
  });

  describe('topologicalSortAgents', () => {
    it('should correctly order a deep linear delegation chain (A -> B -> C -> D)', () => {
      const agents = [
        { id: 'A', data: { agentKind: 'standard' } },
        { id: 'B', data: { agentKind: 'standard' } },
        { id: 'C', data: { agentKind: 'standard' } },
        { id: 'D', data: { agentKind: 'standard' } },
      ];
      const edges = [
        { source: 'A', target: 'B' },
        { source: 'B', target: 'C' },
        { source: 'C', target: 'D' },
      ];

      const sorted = topologicalSortAgents(agents, edges);
      const order = sorted.map((a) => a.id);

      // Dependencies first (D, C, B, A)
      assert.deepEqual(order, ['D', 'C', 'B', 'A']);
    });

    it('should sort agents correctly when router branches refer to subagents', () => {
      const agents = [
        {
          id: 'orchestrator',
          data: {
            agentKind: 'router',
            routerConfig: {
              branches: [
                { id: 'b1', targetAgentId: 'support' },
                { id: 'b2', targetAgentId: 'sales' },
              ],
            },
          },
        },
        { id: 'support', data: { agentKind: 'standard' } },
        { id: 'sales', data: { agentKind: 'standard' } },
      ];

      const sorted = topologicalSortAgents(agents, []);
      const order = sorted.map((a) => a.id);

      assert.strictEqual(order.indexOf('support') < order.indexOf('orchestrator'), true);
      assert.strictEqual(order.indexOf('sales') < order.indexOf('orchestrator'), true);
    });

    it('should sort agents correctly when standard agents reference subagents via agent_as_tool', () => {
      const agents = [
        {
          id: 'parent',
          data: {
            agentKind: 'standard',
            tools: [
              {
                id: 'builtin_agent_as_tool',
                builtinType: 'agent_as_tool',
                agentAsToolConfig: { subAgentId: 'child' },
              },
            ],
          },
        },
        { id: 'child', data: { agentKind: 'standard' } },
      ];

      const sorted = topologicalSortAgents(agents, []);
      const order = sorted.map((a) => a.id);

      assert.deepEqual(order, ['child', 'parent']);
    });

    it('should throw an error with clear diagnostic path when a direct cycle is detected', () => {
      const agents = [
        { id: 'A', data: { agentKind: 'standard' } },
        { id: 'B', data: { agentKind: 'standard' } },
      ];
      const edges = [
        { source: 'A', target: 'B' },
        { source: 'B', target: 'A' },
      ];

      assert.throws(() => {
        topologicalSortAgents(agents, edges);
      }, /Circular delegation detected: A -> B -> A/);
    });

    it('should throw an error with clear diagnostic path for multi-agent loops', () => {
      const agents = [
        { id: 'A', data: { agentKind: 'standard' } },
        { id: 'B', data: { agentKind: 'standard' } },
        { id: 'C', data: { agentKind: 'standard' } },
      ];
      const edges = [
        { source: 'A', target: 'B' },
        { source: 'B', target: 'C' },
        { source: 'C', target: 'A' },
      ];

      assert.throws(() => {
        topologicalSortAgents(agents, edges);
      }, /Circular delegation detected: A -> B -> C -> A/);
    });
  });

  describe('Generator Integrations', () => {
    const workflow: AgentWorkflowDocument = {
      id: 'wf-test',
      name: 'Safe Code Generation Workflow',
      nodes: [
        {
          id: 'coordinator-id',
          data: {
            label: 'def', // Python keyword label!
            agentKind: 'standard',
            isStartNode: true,
          },
        },
        {
          id: 'first-id',
          data: {
            label: 'Support Agent', // Duplicate label 1
            agentKind: 'standard',
          },
        },
        {
          id: 'second-id',
          data: {
            label: 'Support Agent', // Duplicate label 2
            agentKind: 'standard',
          },
        },
      ],
      edges: [
        { source: 'coordinator-id', target: 'first-id' },
        { source: 'coordinator-id', target: 'second-id' },
      ],
    };

    it('should safely compile safe identifiers, unique duplicate labels, and root agent for Python ADK', () => {
      const generator = new PythonAdkGenerator();
      const files = generator.generateFullProject(workflow);

      const workflowFile = files.find((f) => f.path === 'agent_workflow.py');
      assert.ok(workflowFile);

      // Verify keyword sanitized to def_
      assert.match(workflowFile.content, /def_ = Agent\(/);

      // Verify duplicate labels resolved to support_agent and support_agent_2
      assert.match(workflowFile.content, /support_agent = Agent\(/);
      assert.match(workflowFile.content, /support_agent_2 = Agent\(/);

      // Verify topological ordering: dependencies (support_agent, support_agent_2) declared BEFORE parent (def_)
      const defIdx = workflowFile.content.indexOf('def_ = Agent(');
      const agent1Idx = workflowFile.content.indexOf('support_agent = Agent(');
      const agent2Idx = workflowFile.content.indexOf('support_agent_2 = Agent(');

      assert.ok(agent1Idx < defIdx);
      assert.ok(agent2Idx < defIdx);

      // Verify unambiguous entrypoint
      assert.match(workflowFile.content, /root_agent = def_/);
      assert.match(workflowFile.content, /runner = Runner\(agent=root_agent\)/);
    });

    it('should safely compile safe identifiers, unique duplicate labels, and root agent for LangGraph', () => {
      const generator = new LanggraphGenerator();
      const files = generator.generateFullProject(workflow);

      const workflowFile = files.find((f) => f.path === 'agent_workflow.py');
      assert.ok(workflowFile);

      // Verify keyword sanitized to def_
      assert.match(workflowFile.content, /workflow\.add_node\("def_"/);

      // Verify duplicates
      assert.match(workflowFile.content, /workflow\.add_node\("support_agent"/);
      assert.match(workflowFile.content, /workflow\.add_node\("support_agent_2"/);

      // Verify unambiguous entrypoint
      assert.match(workflowFile.content, /root_agent = workflow\.compile\(\)/);
    });
  });
});
