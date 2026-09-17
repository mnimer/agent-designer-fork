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
} from '../../../src/webview/utils/workflowSync';
import { Node, Edge } from '@xyflow/react';
import { AgentData } from '../../../src/webview/types';

describe('workflowSync Domain Utilities', () => {
  describe('normalizeLoadedNodes', () => {
    it('should return an empty array for non-array inputs', () => {
      assert.deepEqual(normalizeLoadedNodes(null as any), []);
      assert.deepEqual(normalizeLoadedNodes(undefined as any), []);
      assert.deepEqual(normalizeLoadedNodes({} as any), []);
    });

    it('should map trigger and agent nodes preserving data and fallback positions', () => {
      const rawNodes = [
        {
          id: 'trig-1',
          type: 'trigger',
          position: { x: 80, y: 180 },
          data: {
            label: 'My Trigger',
            triggerType: 'chat',
          },
        },
        {
          id: 'agent-1',
          type: 'agentNode',
          data: {
            label: 'Custom Agent',
            name: 'custom_agent',
            model: 'gemini-3.7-flash',
          },
        },
      ];

      const normalized = normalizeLoadedNodes(rawNodes);
      assert.equal(normalized.length, 2);

      assert.equal(normalized[0].id, 'trig-1');
      assert.equal(normalized[0].type, 'triggerNode');
      assert.deepEqual(normalized[0].position, { x: 80, y: 180 });
      assert.equal(normalized[0].data.label, 'My Trigger');
      assert.equal(normalized[0].data.triggerType, 'chat');

      assert.equal(normalized[1].id, 'agent-1');
      assert.equal(normalized[1].type, 'agentNode');
      assert.deepEqual(normalized[1].position, { x: 100, y: 100 });
      assert.equal(normalized[1].data.label, 'Custom Agent');
      assert.equal(normalized[1].data.name, 'custom_agent');
      assert.equal(normalized[1].data.model, 'gemini-3.7-flash');
    });

    it('should preserve node data without mutating or injecting synthetic fields', () => {
      const rawNodes = [
        {
          id: 'agent-exact',
          type: 'agentNode',
          position: { x: 200, y: 300 },
          data: {
            label: 'Domain Specialist',
            name: 'Domain Specialist',
            tools: [{ id: 'tool_custom', name: 'Custom Tool' }],
            customField: 'preserved_as_is',
          },
        },
      ];

      const normalized = normalizeLoadedNodes(rawNodes);
      assert.equal(normalized.length, 1);
      assert.equal(normalized[0].data.label, 'Domain Specialist');
      assert.equal(normalized[0].data.name, 'Domain Specialist');
      assert.equal(normalized[0].data.tools.length, 1);
      assert.equal(normalized[0].data.tools[0].name, 'Custom Tool');
      assert.equal(normalized[0].data.customField, 'preserved_as_is');
    });
  });

  describe('normalizeLoadedEdges', () => {
    it('should return empty array for non-array inputs', () => {
      assert.deepEqual(normalizeLoadedEdges(null as any), []);
      assert.deepEqual(normalizeLoadedEdges(undefined as any), []);
    });

    it('should map raw edges preserving handles, styles, and IDs', () => {
      const rawEdges = [
        {
          id: 'e1',
          source: 'nodeA',
          target: 'nodeB',
          sourceHandle: 'output',
          targetHandle: 'input',
          style: { stroke: '#3b82f6', strokeWidth: 2 },
        },
        {
          source: 'tester-1',
          target: 'nodeA',
          sourceHandle: 'trigger_out_right',
          targetHandle: 'input_left',
          style: { stroke: '#f59e0b', strokeWidth: 2, strokeDasharray: '5 5' },
        },
      ];

      const normalized = normalizeLoadedEdges(rawEdges);
      assert.equal(normalized.length, 2);

      assert.equal(normalized[0].id, 'e1');
      assert.equal(normalized[0].style?.stroke, '#3b82f6');
      assert.equal(normalized[0].sourceHandle, 'output');
      assert.equal(normalized[0].targetHandle, 'input');

      assert.equal(normalized[1].id, 'e_tester-1_nodeA');
      assert.equal(normalized[1].style?.stroke, '#f59e0b');
      assert.equal(normalized[1].style?.strokeDasharray, '5 5');
      assert.equal(normalized[1].sourceHandle, 'trigger_out_right');
      assert.equal(normalized[1].targetHandle, 'input_left');
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
      assert.equal(resolveAgentOutputFolder('./scratch_flow/', 'scratch-flow.agent'), './scratch_flow/');
      assert.equal(resolveAgentOutputFolder('./custom_dir', 'scratch-flow.agent'), './custom_dir/');
      assert.equal(resolveAgentOutputFolder('/absolute/path/to/agent/', 'scratch-flow.agent'), '/absolute/path/to/agent/');
      assert.equal(resolveAgentOutputFolder('./game_20_questions/', 'game_20_questions.agent'), './game_20_questions/');
    });

    it('should resolve to ./<sanitized_agent_subfolder>/ when outputFolder is generic root', () => {
      assert.equal(resolveAgentOutputFolder('./', 'scratch-flow.agent'), './scratch_flow/');
      assert.equal(resolveAgentOutputFolder('.', 'scratch-flow.agent'), './scratch_flow/');
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

    it('should synchronize Router branch targetAgentIds and subAgents', () => {
      const nodes: Node<AgentData>[] = [
        {
          id: 'router-1',
          type: 'agentNode',
          position: { x: 0, y: 0 },
          data: {
            label: 'Query Router',
            agentKind: 'router',
            routerConfig: {
              routingStrategy: 'llm_classifier',
              branches: [
                { id: 'b_sales', label: 'Sales Branch', condition: 'sales' },
                { id: 'b_support', label: 'Support Branch', condition: 'support' },
              ],
            },
            subAgents: [],
          },
        },
        {
          id: 'sales-agent',
          type: 'agentNode',
          position: { x: -100, y: 200 },
          data: { label: 'Sales Agent', role: 'Deals', agentKind: 'standard' },
        },
        {
          id: 'support-agent',
          type: 'agentNode',
          position: { x: 100, y: 200 },
          data: { label: 'Support Agent', role: 'Triage', agentKind: 'standard' },
        },
      ];

      const edges: Edge[] = [
        { id: 'e_r1', source: 'router-1', target: 'sales-agent', sourceHandle: 'b_sales' },
        { id: 'e_r2', source: 'router-1', target: 'support-agent', sourceHandle: 'b_support' },
      ];

      const synced = syncAgentSubAgents(nodes, edges);
      const syncedRouter = synced.find((n) => n.id === 'router-1')!;
      assert.equal(syncedRouter.data.subAgents?.length, 2);
      assert.equal(syncedRouter.data.routerConfig?.branches?.[0].targetAgentId, 'sales-agent');
      assert.equal(syncedRouter.data.routerConfig?.branches?.[1].targetAgentId, 'support-agent');
    });

    it('should synchronize HITL Approval Gate approved and rejected targets', () => {
      const nodes: Node<AgentData>[] = [
        {
          id: 'hitl-gate',
          type: 'agentNode',
          position: { x: 0, y: 0 },
          data: {
            label: 'Approval Gate',
            agentKind: 'hitl',
            hitlConfig: {
              approvalType: 'single_approver',
              timeoutAction: 'reject',
            },
            subAgents: [],
          },
        },
        {
          id: 'approved-worker',
          type: 'agentNode',
          position: { x: -100, y: 200 },
          data: { label: 'Production Deployer', agentKind: 'standard' },
        },
        {
          id: 'rejected-worker',
          type: 'agentNode',
          position: { x: 100, y: 200 },
          data: { label: 'Revision Notifier', agentKind: 'standard' },
        },
      ];

      const edges: Edge[] = [
        { id: 'e_hitl_app', source: 'hitl-gate', target: 'approved-worker', sourceHandle: 'approved' },
        { id: 'e_hitl_rej', source: 'hitl-gate', target: 'rejected-worker', sourceHandle: 'rejected' },
      ];

      const synced = syncAgentSubAgents(nodes, edges);
      const syncedHitl = synced.find((n) => n.id === 'hitl-gate')!;
      assert.equal(syncedHitl.data.subAgents?.length, 2);
      assert.equal(syncedHitl.data.hitlConfig?.approvedTargetAgentId, 'approved-worker');
      assert.equal(syncedHitl.data.hitlConfig?.rejectedTargetAgentId, 'rejected-worker');
    });

    it('should synchronize Fallback Circuit Breaker primary and recovery targets', () => {
      const nodes: Node<AgentData>[] = [
        {
          id: 'circuit-breaker',
          type: 'agentNode',
          position: { x: 0, y: 0 },
          data: {
            label: 'LLM Circuit Breaker',
            agentKind: 'fallback',
            fallbackConfig: {
              failureThreshold: 3,
              recoveryTimeoutSec: 60,
            },
            subAgents: [],
          },
        },
        {
          id: 'gemini-pro',
          type: 'agentNode',
          position: { x: -100, y: 200 },
          data: { label: 'Gemini Pro Agent', agentKind: 'standard' },
        },
        {
          id: 'gemini-flash',
          type: 'agentNode',
          position: { x: 100, y: 200 },
          data: { label: 'Gemini Flash Agent', agentKind: 'standard' },
        },
      ];

      const edges: Edge[] = [
        { id: 'e_fb_prim', source: 'circuit-breaker', target: 'gemini-pro', sourceHandle: 'primary' },
        { id: 'e_fb_fall', source: 'circuit-breaker', target: 'gemini-flash', sourceHandle: 'fallback' },
      ];

      const synced = syncAgentSubAgents(nodes, edges);
      const syncedFallback = synced.find((n) => n.id === 'circuit-breaker')!;
      assert.equal(syncedFallback.data.subAgents?.length, 2);
      assert.equal(syncedFallback.data.fallbackConfig?.primaryTargetAgentId, 'gemini-pro');
      assert.equal(syncedFallback.data.fallbackConfig?.fallbackTargetAgentId, 'gemini-flash');
    });

    it('should synchronize Guardrail Shield pass and block targets', () => {
      const nodes: Node<AgentData>[] = [
        {
          id: 'guardrail-shield',
          type: 'agentNode',
          position: { x: 0, y: 0 },
          data: {
            label: 'Safety Guardrail',
            agentKind: 'guardrail',
            guardrailConfig: {
              strictness: 'high',
              moderationCategories: ['pii', 'toxic_content'],
            },
            subAgents: [],
          },
        },
        {
          id: 'action-agent',
          type: 'agentNode',
          position: { x: -100, y: 200 },
          data: { label: 'Safe Action Agent', agentKind: 'standard' },
        },
        {
          id: 'block-agent',
          type: 'agentNode',
          position: { x: 100, y: 200 },
          data: { label: 'Blocked Policy Handler', agentKind: 'standard' },
        },
      ];

      const edges: Edge[] = [
        { id: 'e_gr_pass', source: 'guardrail-shield', target: 'action-agent', sourceHandle: 'pass' },
        { id: 'e_gr_block', source: 'guardrail-shield', target: 'block-agent', sourceHandle: 'block' },
      ];

      const synced = syncAgentSubAgents(nodes, edges);
      const syncedGuardrail = synced.find((n) => n.id === 'guardrail-shield')!;
      assert.equal(syncedGuardrail.data.subAgents?.length, 2);
      assert.equal(syncedGuardrail.data.guardrailConfig?.passTargetAgentId, 'action-agent');
      assert.equal(syncedGuardrail.data.guardrailConfig?.blockTargetAgentId, 'block-agent');
    });
  });
});
