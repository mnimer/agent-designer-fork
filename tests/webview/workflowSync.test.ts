/**
 * Unit Tests for workflowSync Utilities
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeLoadedNodes,
  normalizeLoadedEdges,
  syncAgentSubAgents,
  computeTargetFolder,
  resolveAgentOutputFolder,
} from '../../src/webview/utils/workflowSync';
import { Node, Edge } from '@xyflow/react';
import { AgentData } from '../../src/webview/types';

describe('workflowSync Domain Utilities', () => {
  describe('normalizeLoadedNodes', () => {
    it('should return an empty array for non-array inputs', () => {
      assert.deepEqual(normalizeLoadedNodes(null as any), []);
      assert.deepEqual(normalizeLoadedNodes(undefined as any), []);
      assert.deepEqual(normalizeLoadedNodes({} as any), []);
    });

    it('should normalize trigger nodes with fallback positions and default test configs', () => {
      const rawNodes = [
        {
          id: 'trig-1',
          type: 'trigger',
          data: {
            label: 'My Trigger',
            triggerType: 'chat',
          },
        },
        {
          id: 'trig-2',
          type: 'triggerNode',
          data: {
            triggerKind: 'test',
          },
        },
      ];

      const normalized = normalizeLoadedNodes(rawNodes);
      assert.equal(normalized.length, 2);

      assert.equal(normalized[0].id, 'trig-1');
      assert.equal(normalized[0].type, 'triggerNode');
      assert.deepEqual(normalized[0].position, { x: 100, y: 100 });
      assert.equal(normalized[0].data.label, 'My Trigger');
      assert.equal(normalized[0].data.triggerType, 'chat');

      assert.equal(normalized[1].id, 'trig-2');
      assert.equal(normalized[1].type, 'triggerNode');
      assert.equal(normalized[1].data.triggerType, 'tester');
      assert.equal(normalized[1].data.label, 'Test Suite Trigger');
    });

    it('should normalize agent nodes with fallback defaults', () => {
      const rawNodes = [
        {
          id: 'agent-1',
          type: 'agentNode',
          position: { x: 250, y: 350 },
          data: {
            label: 'Custom Agent',
            model: 'gemini-pro-latest',
          },
        },
        {
          id: 'agent-2',
          type: 'agent',
          data: {},
        },
      ];

      const normalized = normalizeLoadedNodes(rawNodes);
      assert.equal(normalized.length, 2);

      assert.equal(normalized[0].id, 'agent-1');
      assert.equal(normalized[0].type, 'agentNode');
      assert.deepEqual(normalized[0].position, { x: 250, y: 350 });
      assert.equal(normalized[0].data.label, 'Custom Agent');
      assert.equal(normalized[0].data.name, 'custom_agent');
      assert.equal(normalized[0].data.model, 'gemini-pro-latest');

      assert.equal(normalized[1].id, 'agent-2');
      assert.equal(normalized[1].type, 'agentNode');
      assert.deepEqual(normalized[1].position, { x: 100, y: 100 });
      assert.equal(normalized[1].data.label, 'Agent');
      assert.equal(normalized[1].data.name, 'agent');
      assert.equal(normalized[1].data.model, 'gemini-flash-latest');
    });

    it('should sanitize agent names with spaces into valid Python identifiers (e.g. Cat Agent -> cat_agent)', () => {
      const rawNodes = [
        {
          id: 'agent-cat',
          type: 'agentNode',
          data: {
            label: 'Cat Agent',
          },
        },
        {
          id: 'agent-support',
          type: 'agent',
          data: {
            label: 'Customer Support / Triage Specialist',
            name: 'Customer Support / Triage Specialist',
          },
        },
      ];

      const normalized = normalizeLoadedNodes(rawNodes);
      assert.equal(normalized[0].data.label, 'Cat Agent');
      assert.equal(normalized[0].data.name, 'cat_agent');
      assert.equal(normalized[1].data.name, 'customer_support_triage_specialist');
    });

    it('should sanitize deprecated mock tools when loading agent nodes', () => {
      const rawNodes = [
        {
          id: 'agent-tools',
          type: 'agentNode',
          data: {
            label: 'Tool Agent',
            tools: [
              { id: 'tool_twitter_api', name: 'Twitter / X API' },
              { id: 'custom_calc', name: 'Calculator' },
            ],
          },
        },
      ];

      const normalized = normalizeLoadedNodes(rawNodes);
      assert.equal(normalized[0].data.tools.length, 1);
      assert.equal(normalized[0].data.tools[0].name, 'Calculator');
    });
  });

  describe('normalizeLoadedEdges', () => {
    it('should return empty array for non-array inputs', () => {
      assert.deepEqual(normalizeLoadedEdges(null as any), []);
      assert.deepEqual(normalizeLoadedEdges(undefined as any), []);
    });

    it('should normalize edge ids and stroke colors', () => {
      const rawEdges = [
        {
          id: 'e1',
          source: 'nodeA',
          target: 'nodeB',
        },
        {
          source: 'tester-1',
          target: 'nodeA',
          sourceHandle: 'trigger_out_right',
          targetHandle: 'input_right',
        },
        {
          id: 'e3',
          source: 'nodeA',
          target: 'nodeC',
          style: { stroke: '#ec4899' },
        },
      ];

      const normalized = normalizeLoadedEdges(rawEdges);
      assert.equal(normalized.length, 3);

      assert.equal(normalized[0].id, 'e1');
      assert.equal(normalized[0].style?.stroke, '#3b82f6');

      assert.equal(normalized[1].id, 'e_tester-1_nodeA');
      assert.equal(normalized[1].style?.stroke, '#f59e0b');
      assert.equal(normalized[1].style?.strokeDasharray, '5 5');
      // input_right migrated to input
      assert.equal(normalized[1].targetHandle, 'input');

      // Pink color converted to amber #f59e0b
      assert.equal(normalized[2].style?.stroke, '#f59e0b');
    });

    it('should recognize trigger edges when source node id contains trigger or tester', () => {
      const rawEdges = [
        {
          id: 'edge-1',
          source: 'node-trigger-1',
          target: 'node-agent-1',
        },
        {
          id: 'edge-2',
          source: 'tester-node-99',
          target: 'node-agent-1',
        },
      ];

      const normalized = normalizeLoadedEdges(rawEdges);
      assert.equal(normalized.length, 2);
      assert.equal(normalized[0].style?.stroke, '#f59e0b');
      assert.equal(normalized[0].style?.strokeDasharray, '5 5');
      assert.equal(normalized[1].style?.stroke, '#f59e0b');
      assert.equal(normalized[1].style?.strokeDasharray, '5 5');
    });

    it('should normalize chat trigger edges to amber #f59e0b while preserving non-trigger styles', () => {
      const rawEdges = [
        {
          id: 'e_chat_root',
          source: 'chat-trigger-1',
          target: 'root-agent',
        },
        {
          id: 'e_agent_to_agent',
          source: 'agent-1',
          target: 'root-agent',
          style: { stroke: '#10b981' },
        },
        {
          id: 'e_legacy_trigger_green',
          source: 'trigger-pubsub-1',
          target: 'root-agent',
          sourceHandle: 'trigger_out_bottom',
          style: { stroke: '#10b981' },
        },
      ];

      const normalized = normalizeLoadedEdges(rawEdges);
      assert.equal(normalized.length, 3);
      assert.equal(normalized[0].style?.stroke, '#f59e0b');
      assert.equal(normalized[0].style?.strokeDasharray, '5 5');
      assert.equal(normalized[1].style?.stroke, '#10b981');
      assert.equal(normalized[1].style?.strokeDasharray, undefined);
      assert.equal(normalized[2].style?.stroke, '#f59e0b');
      assert.equal(normalized[2].style?.strokeDasharray, '5 5');
    });
  });

  describe('computeTargetFolder', () => {
    it('should compute folder paths correctly', () => {
      assert.equal(computeTargetFolder('agents/scratch/scratch-agent.agent'), './scratch_agent/');
      assert.equal(computeTargetFolder('workflow.agent'), './workflow/');
      assert.equal(computeTargetFolder(''), './workflow/');
      assert.equal(computeTargetFolder('folder\\sub\\my_bot.agent'), './my_bot/');
    });

    it('should support custom baseDir prefix', () => {
      assert.equal(computeTargetFolder('scratch-flow.agent', './src/agents/'), './src/agents/scratch_flow/');
      assert.equal(computeTargetFolder('scratch-flow.agent', './src/agents'), './src/agents/scratch_flow/');
      assert.equal(computeTargetFolder('', './src/agents/'), './src/agents/workflow/');
    });
  });

  describe('resolveAgentOutputFolder', () => {
    it('should honor explicit outputFolder when defined and not generic root', () => {
      // User scenario: document deployment node has "./scratch_flow/"
      assert.equal(resolveAgentOutputFolder('./scratch_flow/', 'scratch-flow.agent'), './scratch_flow/');
      assert.equal(resolveAgentOutputFolder('./custom_dir', 'scratch-flow.agent'), './custom_dir/');
      assert.equal(resolveAgentOutputFolder('/absolute/path/to/agent/', 'scratch-flow.agent'), '/absolute/path/to/agent/');
      assert.equal(resolveAgentOutputFolder('./game_20_questions/', 'game_20_questions.agent'), './game_20_questions/');
    });

    it('should strip legacy src/agents/ prefix from outputFolder', () => {
      assert.equal(resolveAgentOutputFolder('./src/agents/agent_20_questions_game/', 'agent_20_questions_game.agent'), './agent_20_questions_game/');
      assert.equal(resolveAgentOutputFolder('src/agents/agent_20_questions_game/', 'agent_20_questions_game.agent'), './agent_20_questions_game/');
    });

    it('should resolve to ./<sanitized_agent_subfolder>/ when outputFolder is generic root agents folder', () => {
      // User scenario: outputFolder was generic "./src/agents/" -> resolves to "./scratch_flow/"
      assert.equal(resolveAgentOutputFolder('./src/agents/', 'scratch-flow.agent'), './scratch_flow/');
      assert.equal(resolveAgentOutputFolder('./src/agents', 'scratch-flow.agent'), './scratch_flow/');
      assert.equal(resolveAgentOutputFolder('src/agents/', 'scratch-flow.agent'), './scratch_flow/');
      assert.equal(resolveAgentOutputFolder('src/agents', 'scratch-flow.agent'), './scratch_flow/');
      assert.equal(resolveAgentOutputFolder('./agents/', 'scratch-flow.agent'), './scratch_flow/');
      assert.equal(resolveAgentOutputFolder('./', 'scratch-flow.agent'), './scratch_flow/');
    });

    it('should fall back to ./<sanitized_name>/ when outputFolder is empty or undefined', () => {
      assert.equal(resolveAgentOutputFolder(undefined, 'scratch-flow.agent'), './scratch_flow/');
      assert.equal(resolveAgentOutputFolder('', 'scratch-flow.agent'), './scratch_flow/');
      assert.equal(resolveAgentOutputFolder(undefined, 'agents/scratch/scratch-agent.agent'), './scratch_agent/');
      assert.equal(resolveAgentOutputFolder(undefined, ''), './workflow/');
    });
  });

  describe('syncAgentSubAgents', () => {
    it('should synchronize connected agents and inherit parent pattern', () => {
      const nodes: Node<AgentData>[] = [
        {
          id: 'parent',
          type: 'agentNode',
          position: { x: 0, y: 0 },
          data: {
            label: 'Parent',
            agentKind: 'standard',
            subAgentPattern: 'coordinator',
            subAgents: [],
          },
        },
        {
          id: 'child1',
          type: 'agentNode',
          position: { x: 0, y: 200 },
          data: {
            label: 'Child One',
            role: 'Researcher',
            agentKind: 'standard',
          },
        },
      ];

      const edges: Edge[] = [
        { id: 'e1', source: 'parent', target: 'child1' },
      ];

      const synced = syncAgentSubAgents(nodes, edges);
      const syncedParent = synced.find((n) => n.id === 'parent')!;
      assert.equal(syncedParent.data.subAgents?.length, 1);
      assert.equal(syncedParent.data.subAgents?.[0].agentId, 'child1');
      assert.equal(syncedParent.data.subAgents?.[0].name, 'Child One');
      assert.equal(syncedParent.data.subAgents?.[0].role, 'Researcher');
      assert.equal(syncedParent.data.subAgents?.[0].delegationType, 'coordinator');
    });
  });
});
