/**
 * Unit Tests for Agent Patterns Code Generation (TASK-192, TASK-193, TASK-194, TASK-195)
 *
 * Purpose:
 * Validates Python Google ADK code generation for all advanced cognitive patterns:
 * - TASK-192: Evaluator-Optimizer LoopAgent generation with refinement & iteration caps
 * - TASK-193: Multi-Agent Debate & Consensus panel orchestration
 * - TASK-194: Hierarchical supervisor-leads-workers nested delegation
 * - TASK-195: Review & Critique triad sequential workflow
 *
 * Architectural Decisions:
 * - Author: Mike Nimer <mikenimer@google.com>
 * - Decision 1: Node.js test runner with strict assertions.
 * - Decision 2: Verify ADK agent class imports (Agent, LoopAgent, SequentialAgent, ParallelAgent).
 * - Decision 3: Verify topological ordering so nested sub-agents are instantiated before parent supervisors.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PythonAdkGenerator } from '../../../../src/shared/codegen/pythonAdkGenerator';
import { generateRawPattern } from '../../../../src/webview/data/patterns';
import { AgentWorkflowDocument } from '../../../../src/shared/types';

describe('Agent Patterns Code Generation (TASK-192 - TASK-195)', () => {
  const generator = new PythonAdkGenerator();

  describe('TASK-192: Evaluator-Optimizer Pattern (LoopAgent)', () => {
    it('should generate LoopAgent with max_iterations and sub_agents for loop patterns', () => {
      const raw = generateRawPattern('loop', 0, 0);
      const workflow: AgentWorkflowDocument = {
        id: 'wf-loop',
        name: 'Evaluator Optimizer Workflow',
        nodes: raw.nodes as any,
        edges: raw.edges as any,
      };

      const files = generator.generateFullProject(workflow);
      const workflowFile = files.find((f) => f.path === 'agent_workflow.py');
      assert.ok(workflowFile);

      // Verify LoopAgent import
      assert.match(workflowFile.content, /from google\.adk\.agents import .*\bLoopAgent\b/);

      // Verify Critic Evaluator is defined
      assert.match(workflowFile.content, /critic_evaluator = Agent\(/);

      // Verify Draft Generator references Critic Evaluator
      assert.match(workflowFile.content, /draft_generator = Agent\(/);
      assert.match(workflowFile.content, /sub_agents=\[\s*critic_evaluator,/);

      // Verify entrypoint assignment to Draft Generator (start node)
      assert.match(workflowFile.content, /root_agent = draft_generator/);
    });

    it('should generate dedicated LoopAgent container when agentKind is loop', () => {
      const workflow: AgentWorkflowDocument = {
        id: 'wf-dedicated-loop',
        name: 'Dedicated Loop Container',
        nodes: [
          {
            id: 'evaluator',
            data: {
              label: 'Code Evaluator',
              agentKind: 'standard',
              systemPrompt: 'Evaluate code quality and return score.',
            },
          },
          {
            id: 'generator',
            data: {
              label: 'Code Generator',
              agentKind: 'standard',
              systemPrompt: 'Generate code candidate.',
            },
          },
          {
            id: 'optimizer_loop',
            data: {
              label: 'Optimization Loop',
              agentKind: 'loop',
              maxIterations: 8,
              isStartNode: true,
              subAgents: [
                { agentId: 'generator', name: 'Code Generator' },
                { agentId: 'evaluator', name: 'Code Evaluator' },
              ],
            },
          },
        ],
        edges: [
          { source: 'optimizer_loop', target: 'generator' },
          { source: 'optimizer_loop', target: 'evaluator' },
        ],
      };

      const files = generator.generateFullProject(workflow);
      const workflowFile = files.find((f) => f.path === 'agent_workflow.py');
      assert.ok(workflowFile);

      assert.match(workflowFile.content, /from google\.adk\.agents import .*\bLoopAgent\b/);
      assert.match(workflowFile.content, /optimization_loop = LoopAgent\(/);
      assert.match(workflowFile.content, /sub_agents=\[\s*code_generator,\s*code_evaluator,\s*\]/);
      assert.match(workflowFile.content, /max_iterations=8/);
      assert.match(workflowFile.content, /root_agent = optimization_loop/);
    });
  });

  describe('TASK-193: Multi-Agent Debate & Consensus Panel Pattern', () => {
    it('should generate debate moderator, affirmative proponent, skeptical opponent, and consensus judge', () => {
      const raw = generateRawPattern('debate', 0, 0);
      const workflow: AgentWorkflowDocument = {
        id: 'wf-debate',
        name: 'Multi-Agent Debate Workflow',
        nodes: raw.nodes as any,
        edges: raw.edges as any,
      };

      const files = generator.generateFullProject(workflow);
      const workflowFile = files.find((f) => f.path === 'agent_workflow.py');
      assert.ok(workflowFile);

      // Verify all 4 agents instantiated
      assert.match(workflowFile.content, /affirmative_proponent = Agent\(/);
      assert.match(workflowFile.content, /skeptical_opponent = Agent\(/);
      assert.match(workflowFile.content, /consensus_judge = Agent\(/);
      assert.match(workflowFile.content, /debate_moderator = Agent\(/);

      // Verify debate moderator delegates to proponent, opponent, and judge
      assert.match(
        workflowFile.content,
        /debate_moderator = Agent\([\s\S]*sub_agents=\[\s*affirmative_proponent,\s*skeptical_opponent,\s*consensus_judge,/
      );

      // Verify root agent is debate moderator
      assert.match(workflowFile.content, /root_agent = debate_moderator/);
    });
  });

  describe('TASK-194: Hierarchical Supervisor-Workers Delegation Pattern', () => {
    it('should generate recursive multi-tier delegation (Master -> Domain Leads -> Leaf Workers)', () => {
      const raw = generateRawPattern('hierarchical_decomposition', 0, 0);
      const workflow: AgentWorkflowDocument = {
        id: 'wf-hierarchical',
        name: 'Hierarchical Software Agency',
        nodes: raw.nodes as any,
        edges: raw.edges as any,
      };

      const files = generator.generateFullProject(workflow);
      const workflowFile = files.find((f) => f.path === 'agent_workflow.py');
      assert.ok(workflowFile);

      // Leaf workers must be instantiated
      assert.match(workflowFile.content, /ui_components_agent = Agent\(/);
      assert.match(workflowFile.content, /client_state_agent = Agent\(/);
      assert.match(workflowFile.content, /api_services_agent = Agent\(/);
      assert.match(workflowFile.content, /database_model_agent = Agent\(/);

      // Leads must delegate to leaf workers
      assert.match(
        workflowFile.content,
        /frontend_lead = Agent\([\s\S]*sub_agents=\[\s*ui_components_agent,\s*client_state_agent,/
      );
      assert.match(
        workflowFile.content,
        /backend_lead = Agent\([\s\S]*sub_agents=\[\s*api_services_agent,\s*database_model_agent,/
      );

      // Master Architect must delegate to Leads
      assert.match(
        workflowFile.content,
        /chief_system_architect = Agent\([\s\S]*sub_agents=\[\s*frontend_lead,\s*backend_lead,/
      );

      // Root entrypoint is Chief System Architect
      assert.match(workflowFile.content, /root_agent = chief_system_architect/);
    });
  });

  describe('TASK-195: Review & Critique Triad Pattern', () => {
    it('should generate Author, Adversarial Critic, and Synthesis Editor', () => {
      const raw = generateRawPattern('review_critique', 0, 0);
      const workflow: AgentWorkflowDocument = {
        id: 'wf-review',
        name: 'Review Critique Editorial Pipeline',
        nodes: raw.nodes as any,
        edges: raw.edges as any,
      };

      const files = generator.generateFullProject(workflow);
      const workflowFile = files.find((f) => f.path === 'agent_workflow.py');
      assert.ok(workflowFile);

      assert.match(workflowFile.content, /content_author = Agent\(/);
      assert.match(workflowFile.content, /adversarial_critic = Agent\(/);
      assert.match(workflowFile.content, /synthesis_editor = Agent\(/);

      // Author delegates to critic & editor
      assert.match(
        workflowFile.content,
        /content_author = Agent\([\s\S]*sub_agents=\[\s*adversarial_critic,\s*synthesis_editor,/
      );

      assert.match(workflowFile.content, /root_agent = content_author/);
    });
  });

  describe('Sequential & Parallel Container Patterns', () => {
    it('should generate SequentialAgent when agentKind is sequential', () => {
      const workflow: AgentWorkflowDocument = {
        id: 'wf-seq',
        name: 'Sequential Container Test',
        nodes: [
          { id: 'step1', data: { label: 'Step 1', agentKind: 'standard' } },
          { id: 'step2', data: { label: 'Step 2', agentKind: 'standard' } },
          {
            id: 'pipeline',
            data: {
              label: 'Execution Pipeline',
              agentKind: 'sequential',
              isStartNode: true,
              subAgents: [
                { agentId: 'step1', name: 'Step 1' },
                { agentId: 'step2', name: 'Step 2' },
              ],
            },
          },
        ],
        edges: [
          { source: 'pipeline', target: 'step1' },
          { source: 'pipeline', target: 'step2' },
        ],
      };

      const files = generator.generateFullProject(workflow);
      const workflowFile = files.find((f) => f.path === 'agent_workflow.py');
      assert.ok(workflowFile);

      assert.match(workflowFile.content, /from google\.adk\.agents import .*\bSequentialAgent\b/);
      assert.match(workflowFile.content, /execution_pipeline = SequentialAgent\(/);
      assert.match(workflowFile.content, /sub_agents=\[\s*step_1,\s*step_2,\s*\]/);
      assert.match(workflowFile.content, /root_agent = execution_pipeline/);
    });

    it('should generate ParallelAgent when agentKind is parallel', () => {
      const workflow: AgentWorkflowDocument = {
        id: 'wf-par',
        name: 'Parallel Container Test',
        nodes: [
          { id: 'branchA', data: { label: 'Branch A', agentKind: 'standard' } },
          { id: 'branchB', data: { label: 'Branch B', agentKind: 'standard' } },
          {
            id: 'fanout',
            data: {
              label: 'Parallel Dispatcher',
              agentKind: 'parallel',
              isStartNode: true,
              subAgents: [
                { agentId: 'branchA', name: 'Branch A' },
                { agentId: 'branchB', name: 'Branch B' },
              ],
            },
          },
        ],
        edges: [
          { source: 'fanout', target: 'branchA' },
          { source: 'fanout', target: 'branchB' },
        ],
      };

      const files = generator.generateFullProject(workflow);
      const workflowFile = files.find((f) => f.path === 'agent_workflow.py');
      assert.ok(workflowFile);

      assert.match(workflowFile.content, /from google\.adk\.agents import .*\bParallelAgent\b/);
      assert.match(workflowFile.content, /parallel_dispatcher = ParallelAgent\(/);
      assert.match(workflowFile.content, /sub_agents=\[\s*branch_a,\s*branch_b,\s*\]/);
      assert.match(workflowFile.content, /root_agent = parallel_dispatcher/);
    });
  });
});
