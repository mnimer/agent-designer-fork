/**
 * Unit Tests for Multi-Agent Cognitive Patterns (TASK-124, TASK-191 - TASK-195)
 *
 * Purpose:
 * Validates the pattern catalog definitions, raw node and edge generators,
 * auto-trigger attachments, and graph structures for all 8 multi-agent patterns.
 *
 * Architectural Decisions:
 * - Author: Mike Nimer <mikenimer@google.com>
 * - Decision 1: Test all 8 patterns (sequential, parallel, router, loop, debate, hierarchical_decomposition, review_critique, coordinator).
 * - Decision 2: Verify alias compatibility for legacy pattern type keys.
 * - Decision 3: Validate trigger node generation and Dagre layout positions in createPatternNodesAndEdges.
 * - Decision 4: Validate model defaults and subAgent hierarchy integrity.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PATTERN_DEFINITIONS,
  generateRawPattern,
  createPatternNodesAndEdges,
  PatternType,
} from '../../../src/webview/data/patterns';

describe('Multi-Agent Patterns Catalog & Generation (TASK-124, TASK-191)', () => {
  describe('PATTERN_DEFINITIONS Catalog', () => {
    it('should define all 8 multi-agent cognitive patterns', () => {
      assert.strictEqual(PATTERN_DEFINITIONS.length, 8);
      
      const patternTypes = PATTERN_DEFINITIONS.map((p) => p.type);
      assert.ok(patternTypes.includes('sequential'));
      assert.ok(patternTypes.includes('parallel'));
      assert.ok(patternTypes.includes('router'));
      assert.ok(patternTypes.includes('loop'));
      assert.ok(patternTypes.includes('debate'));
      assert.ok(patternTypes.includes('hierarchical_decomposition'));
      assert.ok(patternTypes.includes('review_critique'));
      assert.ok(patternTypes.includes('coordinator'));
    });

    it('should have complete metadata for every pattern', () => {
      for (const pattern of PATTERN_DEFINITIONS) {
        assert.ok(pattern.id, `Pattern should have id`);
        assert.ok(pattern.name, `Pattern ${pattern.id} should have name`);
        assert.ok(pattern.description, `Pattern ${pattern.id} should have description`);
        assert.ok(pattern.badge, `Pattern ${pattern.id} should have badge`);
        assert.ok(pattern.iconName, `Pattern ${pattern.id} should have iconName`);
        assert.ok(pattern.type, `Pattern ${pattern.id} should have type`);
      }
    });
  });

  describe('generateRawPattern for all pattern types', () => {
    it('should generate Sequential Pipeline pattern (Planner -> Executor -> Reviewer)', () => {
      const result = generateRawPattern('sequential', 100, 100);
      assert.strictEqual(result.nodes.length, 3);
      assert.strictEqual(result.edges.length, 2);

      const labels = result.nodes.map((n) => n.data.label);
      assert.ok(labels.includes('Research Planner'));
      assert.ok(labels.includes('Code Executor'));
      assert.ok(labels.includes('Quality Reviewer'));

      assert.strictEqual(result.nodes[0].data.isStartNode, true);
    });

    it('should generate Parallel Fan-out / Fan-in pattern (Lead + 3 domain agents)', () => {
      const result = generateRawPattern('parallel', 100, 100);
      assert.strictEqual(result.nodes.length, 4);
      assert.strictEqual(result.edges.length, 3);

      const orchestrator = result.nodes.find((n) => n.data.isOrchestrator);
      assert.ok(orchestrator);
      assert.strictEqual(orchestrator?.data.subAgents.length, 3);
    });

    it('should generate Dynamic Router pattern (Router + 3 branch experts)', () => {
      const result = generateRawPattern('router', 100, 100);
      assert.strictEqual(result.nodes.length, 4);
      assert.strictEqual(result.edges.length, 3);

      const router = result.nodes.find((n) => n.data.agentKind === 'router');
      assert.ok(router);
      assert.strictEqual(router?.data.routerConfig?.branches.length, 3);
    });

    it('should generate Evaluator-Optimizer Loop pattern (Generator <-> Evaluator)', () => {
      const result = generateRawPattern('loop', 100, 100);
      assert.strictEqual(result.nodes.length, 2);
      assert.strictEqual(result.edges.length, 2);

      const generator = result.nodes.find((n) => n.data.subAgentPattern === 'loop');
      const evaluator = result.nodes.find((n) => n.data.isEvaluator);

      assert.ok(generator, 'Generator node must exist with subAgentPattern loop');
      assert.ok(evaluator, 'Evaluator node must exist with isEvaluator flag');
      assert.strictEqual(generator?.data.isStartNode, true);
    });

    it('should generate Multi-Agent Debate pattern (Moderator + Proponent + Opponent + Judge)', () => {
      const result = generateRawPattern('debate', 100, 100);
      assert.strictEqual(result.nodes.length, 4);
      assert.strictEqual(result.edges.length, 5);

      const moderator = result.nodes.find((n) => n.data.label === 'Debate Moderator');
      const proponent = result.nodes.find((n) => n.data.label === 'Affirmative Proponent');
      const opponent = result.nodes.find((n) => n.data.label === 'Skeptical Opponent');
      const judge = result.nodes.find((n) => n.data.label === 'Consensus Judge');

      assert.ok(moderator);
      assert.ok(proponent);
      assert.ok(opponent);
      assert.ok(judge);
      assert.strictEqual(moderator?.data.subAgents.length, 3);
    });

    it('should generate Hierarchical Decomposition pattern (Master -> 2 Leads -> 4 Workers)', () => {
      const result = generateRawPattern('hierarchical_decomposition', 100, 100);
      assert.strictEqual(result.nodes.length, 7);
      assert.strictEqual(result.edges.length, 6);

      const master = result.nodes.find((n) => n.data.label === 'Chief System Architect');
      assert.ok(master);
      assert.strictEqual(master?.data.subAgents.length, 2);
      assert.strictEqual(master?.data.isStartNode, true);

      const lead1 = result.nodes.find((n) => n.data.label === 'Frontend Lead');
      const lead2 = result.nodes.find((n) => n.data.label === 'Backend Lead');
      assert.ok(lead1);
      assert.ok(lead2);
      assert.strictEqual(lead1?.data.subAgents.length, 2);
      assert.strictEqual(lead2?.data.subAgents.length, 2);
    });

    it('should generate Review & Critique Triad pattern (Author -> Critic -> Editor)', () => {
      const result = generateRawPattern('review_critique', 100, 100);
      assert.strictEqual(result.nodes.length, 3);
      assert.strictEqual(result.edges.length, 2);

      const author = result.nodes.find((n) => n.data.label === 'Content Author');
      const critic = result.nodes.find((n) => n.data.label === 'Adversarial Critic');
      const editor = result.nodes.find((n) => n.data.label === 'Synthesis Editor');

      assert.ok(author);
      assert.ok(critic);
      assert.ok(editor);
      assert.strictEqual(author?.data.isStartNode, true);
    });

    it('should generate Central Blackboard Coordinator pattern (Coordinator + 3 domain specialists)', () => {
      const result = generateRawPattern('coordinator', 100, 100);
      assert.strictEqual(result.nodes.length, 4);
      assert.strictEqual(result.edges.length, 3);

      const coord = result.nodes.find((n) => n.data.label === 'Central Coordinator');
      assert.ok(coord);
      assert.strictEqual(coord?.data.subAgents.length, 3);
    });

    it('should normalize legacy aliases correctly', () => {
      const seqAlias = generateRawPattern('multi_agent_workflow' as PatternType, 100, 100);
      assert.strictEqual(seqAlias.nodes.length, 3);

      const parAlias = generateRawPattern('parallel_agent' as PatternType, 100, 100);
      assert.strictEqual(parAlias.nodes.length, 4);

      const loopAlias = generateRawPattern('loop_agent' as PatternType, 100, 100);
      assert.strictEqual(loopAlias.nodes.length, 2);
    });
  });

  describe('createPatternNodesAndEdges layout & trigger attachment', () => {
    it('should auto-attach a chat trigger connected to the start node', () => {
      const { nodes, edges } = createPatternNodesAndEdges('sequential', 100, 100);
      
      // 3 agents + 1 trigger = 4 nodes
      assert.strictEqual(nodes.length, 4);
      // 2 agent edges + 1 trigger edge = 3 edges
      assert.strictEqual(edges.length, 3);

      const triggerNode = nodes.find((n) => n.type === 'triggerNode' || (n.data as any)?.triggerType === 'manual_chat');
      assert.ok(triggerNode, 'Must include chat trigger node');

      const triggerEdge = edges.find((e) => e.source === triggerNode?.id);
      assert.ok(triggerEdge, 'Must connect trigger to entrypoint agent');
    });

    it('should compute valid numeric layout coordinates using Dagre graph layout', () => {
      const { nodes } = createPatternNodesAndEdges('hierarchical_decomposition', 50, 50);
      for (const node of nodes) {
        assert.ok(typeof node.position.x === 'number' && !isNaN(node.position.x));
        assert.ok(typeof node.position.y === 'number' && !isNaN(node.position.y));
      }
    });
  });
});
