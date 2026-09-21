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

      const triggerNode = nodes.find((n) => n.type === 'triggerNode' || (n.data as any)?.triggerType === 'manual_chat' || (n.data as any)?.triggerType === 'tester');
      assert.ok(triggerNode, 'Must include trigger node');

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

  describe('Advanced Cognitive Patterns (TASK-124: Debate, Loop, Critic Triad)', () => {
    describe('Evaluator-Optimizer Loop Pattern', () => {
      it('should generate valid 2-node topology with feedback loop edge and sub-agent binding', () => {
        const result = generateRawPattern('loop', 0, 0);
        assert.strictEqual(result.nodes.length, 2);
        assert.strictEqual(result.edges.length, 2);

        const generator = result.nodes.find((n) => n.data.subAgentPattern === 'loop' && n.data.isStartNode);
        const evaluator = result.nodes.find((n) => n.data.isEvaluator);

        assert.ok(generator, 'Generator node must exist');
        assert.ok(evaluator, 'Evaluator node must exist');
        assert.strictEqual(generator?.data.label, 'Draft Generator');
        assert.strictEqual(evaluator?.data.label, 'Critic Evaluator');

        // Verify sub-agent binding from Generator to Evaluator
        assert.strictEqual(generator?.data.subAgents.length, 1);
        assert.strictEqual(generator?.data.subAgents[0].agentId, evaluator?.id);
        assert.strictEqual(generator?.data.subAgents[0].name, 'Critic Evaluator');

        // Verify forward edge
        const fwdEdge = result.edges.find((e) => e.source === generator?.id && e.target === evaluator?.id);
        assert.ok(fwdEdge, 'Forward edge must exist from Generator to Evaluator');
        assert.strictEqual(fwdEdge?.sourceHandle, 'output');
        assert.strictEqual(fwdEdge?.targetHandle, 'input');

        // Verify feedback loop edge
        const loopEdge = result.edges.find((e) => e.source === evaluator?.id && e.target === generator?.id);
        assert.ok(loopEdge, 'Feedback edge must exist from Evaluator back to Generator');
        assert.strictEqual(loopEdge?.sourceHandle, 'subagent');
        assert.strictEqual(loopEdge?.targetHandle, 'input');
        assert.strictEqual(loopEdge?.style?.strokeDasharray, '5 5');
      });

      it('should create layouted pattern with trigger attachment and valid coordinates', () => {
        const { nodes, edges } = createPatternNodesAndEdges('loop', 120, 80);
        // 2 agents + 1 test trigger
        assert.strictEqual(nodes.length, 3);
        assert.strictEqual(edges.length, 3);

        const trigger = nodes.find((n) => n.type === 'triggerNode');
        const generator = nodes.find((n) => n.data?.subAgentPattern === 'loop' && n.data?.isStartNode);
        const evaluator = nodes.find((n) => n.data?.isEvaluator);

        assert.ok(trigger);
        assert.ok(generator);
        assert.ok(evaluator);

        // Verify trigger connection to root agent
        const triggerEdge = edges.find((e) => e.source === trigger?.id && e.target === generator?.id);
        assert.ok(triggerEdge, 'Trigger must connect to Generator root node');

        // Verify layout coordinates
        for (const node of nodes) {
          assert.ok(typeof node.position.x === 'number' && !isNaN(node.position.x));
          assert.ok(typeof node.position.y === 'number' && !isNaN(node.position.y));
          assert.ok(node.position.x >= 0);
          assert.ok(node.position.y >= 0);
        }

        // Verify subAgent binding preservation
        assert.strictEqual(generator?.data.subAgents[0].agentId, evaluator?.id);
      });
    });

    describe('Multi-Agent Debate Pattern', () => {
      it('should generate valid 4-node topology with debate config, structured output, and sub-agent bindings', () => {
        const result = generateRawPattern('debate', 0, 0);
        assert.strictEqual(result.nodes.length, 4);
        assert.strictEqual(result.edges.length, 5);

        const moderator = result.nodes.find((n) => n.data.label === 'Debate Moderator');
        const proponent = result.nodes.find((n) => n.data.label === 'Affirmative Proponent');
        const opponent = result.nodes.find((n) => n.data.label === 'Skeptical Opponent');
        const judge = result.nodes.find((n) => n.data.label === 'Consensus Judge');

        assert.ok(moderator, 'Moderator must exist');
        assert.ok(proponent, 'Proponent must exist');
        assert.ok(opponent, 'Opponent must exist');
        assert.ok(judge, 'Judge must exist');

        // Verify Moderator configuration
        assert.strictEqual(moderator?.data.isStartNode, true);
        assert.strictEqual(moderator?.data.isDebateNode, true);
        assert.strictEqual(moderator?.data.subAgentPattern, 'debate');
        assert.ok(moderator?.data.debateConfig);
        assert.strictEqual(moderator?.data.debateConfig?.maxRounds, 2);
        assert.strictEqual(moderator?.data.debateConfig?.consensusThreshold, 0.85);
        assert.strictEqual(moderator?.data.debateConfig?.debateStyle, 'structured_rebuttal');

        // Verify sub-agent bindings from Moderator to all 3 debate participants
        assert.strictEqual(moderator?.data.subAgents.length, 3);
        const subAgentIds = moderator?.data.subAgents.map((s) => s.agentId);
        assert.ok(subAgentIds?.includes(proponent?.id));
        assert.ok(subAgentIds?.includes(opponent?.id));
        assert.ok(subAgentIds?.includes(judge?.id));

        // Verify Consensus Judge structured output schema
        assert.ok(judge?.data.structuredOutput?.enabled);
        assert.strictEqual(judge?.data.structuredOutput?.name, 'ConsensusVerdict');
        const fieldNames = judge?.data.structuredOutput?.fields.map((f) => f.name);
        assert.ok(fieldNames?.includes('verdict'));
        assert.ok(fieldNames?.includes('confidenceScore'));
        assert.ok(fieldNames?.includes('keyAgreements'));
        assert.ok(fieldNames?.includes('unresolvedDisputes'));
        assert.ok(fieldNames?.includes('recommendations'));

        // Verify critique edge between Proponent and Opponent
        const critiqueEdge = result.edges.find(
          (e) => e.source === proponent?.id && e.target === opponent?.id
        );
        assert.ok(critiqueEdge, 'Critique edge must exist between proponent and opponent');
        assert.strictEqual(critiqueEdge?.style?.strokeDasharray, '4 4');

        // Verify Judge convergence edges
        const propToJudge = result.edges.find((e) => e.source === proponent?.id && e.target === judge?.id);
        const oppToJudge = result.edges.find((e) => e.source === opponent?.id && e.target === judge?.id);
        assert.ok(propToJudge, 'Proponent must connect to Judge');
        assert.ok(oppToJudge, 'Opponent must connect to Judge');
      });

      it('should support consensus alias and produce identical structure', () => {
        const result = generateRawPattern('consensus' as PatternType, 50, 50);
        assert.strictEqual(result.nodes.length, 4);
        assert.strictEqual(result.edges.length, 5);
        assert.ok(result.nodes.some((n) => n.data.label === 'Debate Moderator'));
      });

      it('should create layouted pattern with trigger attachment and valid coordinates', () => {
        const { nodes, edges } = createPatternNodesAndEdges('debate', 200, 150);
        // 4 agents + 1 test trigger
        assert.strictEqual(nodes.length, 5);
        assert.strictEqual(edges.length, 6);

        const trigger = nodes.find((n) => n.type === 'triggerNode');
        const moderator = nodes.find((n) => n.data?.label === 'Debate Moderator');
        assert.ok(trigger);
        assert.ok(moderator);

        // Verify trigger connects to Moderator root node
        const triggerEdge = edges.find((e) => e.source === trigger?.id && e.target === moderator?.id);
        assert.ok(triggerEdge, 'Trigger must connect to Moderator');

        // Verify layout positions
        for (const node of nodes) {
          assert.ok(typeof node.position.x === 'number' && !isNaN(node.position.x));
          assert.ok(typeof node.position.y === 'number' && !isNaN(node.position.y));
        }
      });
    });

    describe('Review & Critique Triad Pattern', () => {
      it('should generate valid 3-node topology with author, critic, editor, and sub-agent bindings', () => {
        const result = generateRawPattern('review_critique', 0, 0);
        assert.strictEqual(result.nodes.length, 3);
        assert.strictEqual(result.edges.length, 2);

        const author = result.nodes.find((n) => n.data.label === 'Content Author');
        const critic = result.nodes.find((n) => n.data.label === 'Adversarial Critic');
        const editor = result.nodes.find((n) => n.data.label === 'Synthesis Editor');

        assert.ok(author, 'Author must exist');
        assert.ok(critic, 'Critic must exist');
        assert.ok(editor, 'Editor must exist');

        // Author configuration
        assert.strictEqual(author?.data.isStartNode, true);
        assert.strictEqual(author?.data.subAgentPattern, 'review_critique');
        assert.strictEqual(author?.data.subAgents.length, 2);
        const subAgentIds = author?.data.subAgents.map((s) => s.agentId);
        assert.ok(subAgentIds?.includes(critic?.id));
        assert.ok(subAgentIds?.includes(editor?.id));

        // Color themes
        assert.strictEqual(author?.data.colorTheme, 'blue');
        assert.strictEqual(critic?.data.colorTheme, 'rose');
        assert.strictEqual(editor?.data.colorTheme, 'emerald');

        // Sequential edges
        const authToCritic = result.edges.find((e) => e.source === author?.id && e.target === critic?.id);
        const criticToEditor = result.edges.find((e) => e.source === critic?.id && e.target === editor?.id);
        assert.ok(authToCritic, 'Edge from Author to Critic must exist');
        assert.ok(criticToEditor, 'Edge from Critic to Editor must exist');
      });

      it('should create layouted pattern with trigger attachment and valid coordinates', () => {
        const { nodes, edges } = createPatternNodesAndEdges('review_critique', 50, 100);
        // 3 agents + 1 test trigger
        assert.strictEqual(nodes.length, 4);
        assert.strictEqual(edges.length, 3);

        const trigger = nodes.find((n) => n.type === 'triggerNode');
        const author = nodes.find((n) => n.data?.label === 'Content Author');
        assert.ok(trigger);
        assert.ok(author);

        const triggerEdge = edges.find((e) => e.source === trigger?.id && e.target === author?.id);
        assert.ok(triggerEdge, 'Trigger must connect to Author');

        for (const node of nodes) {
          assert.ok(typeof node.position.x === 'number' && !isNaN(node.position.x));
          assert.ok(typeof node.position.y === 'number' && !isNaN(node.position.y));
        }
      });
    });
  });
});
