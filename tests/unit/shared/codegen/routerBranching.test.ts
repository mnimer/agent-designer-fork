/**
 * Unit Tests for Router Agent Dynamic Branching & Code Generation
 *
 * Validates:
 * 1. Identifier conversion with toPascalCase utility.
 * 2. Router code generation for Boolean Expression evaluation mode.
 * 3. Router code generation for Numeric Threshold evaluation mode.
 * 4. Router code generation for LLM Intent Classifier evaluation mode.
 * 5. Router agent tools registration via setup_agent_tools.
 * 6. Edge and branch topology synchronization via syncAgentSubAgents.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PythonAdkGenerator,
  toPascalCase,
} from '../../../../src/shared/codegen/pythonAdkGenerator';
import { syncAgentSubAgents } from '../../../../src/webview/utils/workflowSync';
import { AgentWorkflowDocument } from '../../../../src/shared/types';
import { Node, Edge } from '@xyflow/react';

describe('Router Agent Dynamic Branching & ADK Code Generation', () => {
  describe('toPascalCase utility', () => {
    it('should format snake_case identifiers into PascalCase', () => {
      assert.equal(toPascalCase('quality_gate_router'), 'QualityGateRouter');
    });

    it('should format kebab-case identifiers into PascalCase', () => {
      assert.equal(toPascalCase('triage-intent-classifier'), 'TriageIntentClassifier');
    });

    it('should format mixed spaces and symbols into PascalCase', () => {
      assert.equal(toPascalCase('route -- payment (v1)'), 'RoutePaymentV1');
    });

    it('should fall back gracefully on empty string', () => {
      assert.equal(toPascalCase(''), 'Agent');
      assert.equal(toPascalCase('   '), 'Agent');
    });
  });

  describe('Boolean Expression Router Code Generation', () => {
    it('should generate custom BaseAgent subclass, StateProxy, and evaluator function', () => {
      const generator = new PythonAdkGenerator();
      const workflow: AgentWorkflowDocument = {
        id: 'wf-router-bool',
        name: 'Boolean Router Workflow',
        nodes: [
          {
            id: 'node-router-1',
            data: {
              label: 'Quality Gate Router',
              agentKind: 'router',
              isStartNode: true,
              routerConfig: {
                evaluationMode: 'boolean_expression',
                expressionVariable: 'status',
                branches: [
                  {
                    id: 'branch_pass',
                    name: 'Passed Gate',
                    label: 'Passed Gate',
                    condition: "state.status == 'passed'",
                    conditionExpression: "state.status == 'passed'",
                    targetAgentId: 'agent-deployer',
                  },
                  {
                    id: 'branch_fail',
                    name: 'Failed Gate',
                    label: 'Failed Gate',
                    condition: "state.status == 'failed'",
                    conditionExpression: "state.status == 'failed'",
                    targetAgentId: 'agent-debugger',
                  },
                  {
                    id: 'branch_fallback',
                    name: 'Default Fallback',
                    label: 'Default Fallback',
                    condition: 'default',
                    conditionExpression: 'default',
                    isDefault: true,
                    targetAgentId: 'agent-debugger',
                  },
                ],
              },
            },
          },
          {
            id: 'agent-deployer',
            data: {
              label: 'Deployer Agent',
              systemPrompt: 'Deploys verified builds to production',
              model: 'gemini-3.7-flash',
            },
          },
          {
            id: 'agent-debugger',
            data: {
              label: 'Debugger Agent',
              systemPrompt: 'Analyzes test logs and triage defects',
              model: 'gemini-3.7-flash',
            },
          },
        ],
        edges: [],
      };

      const workflowPy = generator.generateWorkflowFile(workflow);

      // Verify ADK BaseAgent imports
      assert.ok(workflowPy.includes('from google.adk.agents import Agent, BaseAgent'));
      assert.ok(workflowPy.includes('from google.adk.agents.invocation_context import InvocationContext'));
      assert.ok(workflowPy.includes('from google.adk.events import Event'));

      // Verify StateProxy class
      assert.ok(workflowPy.includes('class StateProxy(dict):'));
      assert.ok(workflowPy.includes('def __getattr__(self, key: str) -> Any:'));

      // Verify Evaluator function
      assert.ok(workflowPy.includes('def evaluate_quality_gate_router_route(state: Dict[str, Any], user_query: str = "") -> str:'));
      assert.ok(workflowPy.includes("if state.status == 'passed':"));
      assert.ok(workflowPy.includes('return "branch_pass"'));
      assert.ok(workflowPy.includes("if state.status == 'failed':"));
      assert.ok(workflowPy.includes('return "branch_fail"'));
      assert.ok(workflowPy.includes('return "branch_fallback"'));

      // Verify Router BaseAgent Subclass
      assert.ok(workflowPy.includes('class QualityGateRouter(BaseAgent):'));
      assert.ok(workflowPy.includes('async def _run_async_impl('));
      assert.ok(workflowPy.includes('target_branch_id = evaluate_quality_gate_router_route(state, user_query)'));
      assert.ok(workflowPy.includes('target_agent = self.branches.get(target_branch_id, self.default_agent)'));
      assert.ok(workflowPy.includes('async for event in target_agent.run_async(ctx):'));

      // Verify instantiation ordering: standard candidate agents must precede router
      const deployerIndex = workflowPy.indexOf('deployer_agent = Agent(');
      const debuggerIndex = workflowPy.indexOf('debugger_agent = Agent(');
      const routerIndex = workflowPy.indexOf('quality_gate_router = QualityGateRouter(');

      assert.ok(deployerIndex >= 0 && debuggerIndex >= 0 && routerIndex >= 0);
      assert.ok(deployerIndex < routerIndex, 'deployer_agent instantiated before router');
      assert.ok(debuggerIndex < routerIndex, 'debugger_agent instantiated before router');

      // Verify branch dictionary wiring
      assert.ok(workflowPy.includes('"branch_pass": deployer_agent'));
      assert.ok(workflowPy.includes('"branch_fail": debugger_agent'));
      assert.ok(workflowPy.includes('default_agent=debugger_agent'));

      // Verify start node runner
      assert.ok(workflowPy.includes('root_agent = quality_gate_router'));
      assert.ok(workflowPy.includes('runner = Runner(agent=root_agent)'));
    });
  });

  describe('Numeric Threshold Router Code Generation', () => {
    it('should generate metric parsing and threshold gating logic', () => {
      const generator = new PythonAdkGenerator();
      const workflow: AgentWorkflowDocument = {
        id: 'wf-router-num',
        name: 'Numeric Router Workflow',
        nodes: [
          {
            id: 'node-router-num',
            data: {
              label: 'Confidence Router',
              agentKind: 'router',
              routerConfig: {
                evaluationMode: 'numeric_threshold',
                expressionVariable: 'confidence_score',
                thresholdValue: 0.85,
                branches: [
                  {
                    id: 'branch_high',
                    label: 'High Confidence',
                    conditionExpression: 'score >= 0.85',
                    targetAgentId: 'agent-auto',
                  },
                  {
                    id: 'branch_low',
                    label: 'Low Confidence Review',
                    conditionExpression: 'default',
                    isDefault: true,
                    targetAgentId: 'agent-human',
                  },
                ],
              },
            },
          },
          {
            id: 'agent-auto',
            data: { label: 'Autonomous Agent' },
          },
          {
            id: 'agent-human',
            data: { label: 'Human Review Agent' },
          },
        ],
        edges: [],
      };

      const workflowPy = generator.generateWorkflowFile(workflow);

      assert.ok(workflowPy.includes('def evaluate_confidence_router_route('));
      assert.ok(workflowPy.includes('metric_val = float(proxy.get("confidence_score", 0.0) or 0.0)'));
      assert.ok(workflowPy.includes('threshold = 0.85'));
      assert.ok(workflowPy.includes('if score >= 0.85:'));
      assert.ok(workflowPy.includes('return "branch_high"'));
      assert.ok(workflowPy.includes('return "branch_low"'));
      assert.ok(workflowPy.includes('class ConfidenceRouter(BaseAgent):'));
    });
  });

  describe('LLM Intent Classifier Router Code Generation', () => {
    it('should generate intent token classification and fallback routing', () => {
      const generator = new PythonAdkGenerator();
      const workflow: AgentWorkflowDocument = {
        id: 'wf-router-intent',
        name: 'Intent Router Workflow',
        nodes: [
          {
            id: 'node-router-intent',
            data: {
              label: 'Triage Classifier',
              agentKind: 'router',
              routerConfig: {
                evaluationMode: 'llm_classifier',
                routingPrompt: 'Categorize customer request into billing or technical support',
                branches: [
                  {
                    id: 'branch_billing',
                    label: 'Billing Invoice Payment',
                    targetAgentId: 'agent-billing',
                  },
                  {
                    id: 'branch_tech',
                    label: 'Technical Bug Crash Error',
                    targetAgentId: 'agent-tech',
                  },
                  {
                    id: 'branch_general',
                    label: 'General Help',
                    isDefault: true,
                    targetAgentId: 'agent-general',
                  },
                ],
              },
            },
          },
          {
            id: 'agent-billing',
            data: { label: 'Billing Specialist' },
          },
          {
            id: 'agent-tech',
            data: { label: 'Technical Support' },
          },
          {
            id: 'agent-general',
            data: { label: 'General Help' },
          },
        ],
        edges: [],
      };

      const workflowPy = generator.generateWorkflowFile(workflow);

      assert.ok(workflowPy.includes('def evaluate_triage_classifier_route('));
      assert.ok(workflowPy.includes('query_text = (user_query or str(proxy.get("query", "")) or str(proxy.get("input", ""))).lower()'));
      assert.ok(workflowPy.includes('"billing invoice payment"'));
      assert.ok(workflowPy.includes('"technical bug crash error"'));
      assert.ok(workflowPy.includes('return "branch_general"'));
      assert.ok(workflowPy.includes('class TriageClassifierRouter(BaseAgent):'));
    });
  });

  describe('Pattern / Regex Match Router Code Generation', () => {
    it('should generate re.search pattern matching logic for regular expressions', () => {
      const generator = new PythonAdkGenerator();
      const workflow: AgentWorkflowDocument = {
        id: 'wf-router-regex',
        name: 'Regex Router Workflow',
        nodes: [
          {
            id: 'node-router-regex',
            data: {
              label: 'Regex Gate',
              agentKind: 'router',
              routerConfig: {
                evaluationMode: 'pattern_match',
                expressionVariable: 'query',
                branches: [
                  {
                    id: 'branch_refund',
                    label: 'Refund Pattern',
                    conditionExpression: '^(cancel|refund|return)',
                    targetAgentId: 'agent-refund',
                  },
                  {
                    id: 'branch_order',
                    label: 'Order ID Pattern',
                    conditionExpression: 'order_\\d{6}',
                    targetAgentId: 'agent-order',
                  },
                  {
                    id: 'branch_fallback',
                    label: 'Default Fallback',
                    isDefault: true,
                    targetAgentId: 'agent-fallback',
                  },
                ],
              },
            },
          },
          {
            id: 'agent-refund',
            data: { label: 'Refund Agent' },
          },
          {
            id: 'agent-order',
            data: { label: 'Order Agent' },
          },
          {
            id: 'agent-fallback',
            data: { label: 'Fallback Agent' },
          },
        ],
        edges: [],
      };

      const workflowPy = generator.generateWorkflowFile(workflow);

      assert.ok(workflowPy.includes('def evaluate_regex_gate_route('));
      assert.ok(workflowPy.includes('import re'));
      assert.ok(workflowPy.includes('target_text = str(user_query or proxy.get("query", "")'));
      assert.ok(workflowPy.includes('re.search("^(cancel|refund|return)", target_text, re.IGNORECASE)'));
      assert.ok(workflowPy.includes('re.search("order_\\\\d{6}", target_text, re.IGNORECASE)'));
      assert.ok(workflowPy.includes('return "branch_refund"'));
      assert.ok(workflowPy.includes('return "branch_order"'));
      assert.ok(workflowPy.includes('return "branch_fallback"'));
      assert.ok(workflowPy.includes('class RegexGateRouter(BaseAgent):'));
    });
  });

  describe('Router Agent Tools Integration', () => {
    it('should pass setup_agent_tools to router instance', () => {
      const generator = new PythonAdkGenerator();
      const workflow: AgentWorkflowDocument = {
        id: 'wf-router-tools',
        name: 'Router Tools Workflow',
        nodes: [
          {
            id: 'router-with-tools',
            data: {
              label: 'Enriched Router',
              agentKind: 'router',
              tools: [
                {
                  id: 'tool_custom_checker',
                  name: 'check_feature_flags',
                  type: 'custom',
                  description: 'Queries remote feature flags',
                },
              ],
              routerConfig: {
                evaluationMode: 'boolean_expression',
                branches: [
                  {
                    id: 'branch_a',
                    label: 'Branch A',
                    conditionExpression: 'flags.v2 == True',
                    targetAgentId: 'agent-a',
                  },
                ],
              },
            },
          },
          {
            id: 'agent-a',
            data: { label: 'Agent V2' },
          },
        ],
        edges: [],
      };

      const toolsPy = generator.generateToolsFile(workflow);
      const workflowPy = generator.generateWorkflowFile(workflow);

      // Verify tool registered in setup_agent_tools for the router ID
      assert.ok(toolsPy.includes('if agent_id == "router-with-tools":'));
      assert.ok(toolsPy.includes('tools.append(check_feature_flags)'));

      // Verify router instance initializes with setup_agent_tools
      assert.ok(workflowPy.includes('tools=setup_agent_tools("router-with-tools")'));
    });
  });

  describe('Router Branch Graph Synchronization (syncAgentSubAgents)', () => {
    it('should synchronize branch targetAgentId when edge is connected or severed', () => {
      const routerNode: Node<any> = {
        id: 'router-1',
        type: 'agentNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Router Node',
          agentKind: 'router',
          routerConfig: {
            evaluationMode: 'boolean_expression',
            branches: [
              { id: 'branch_1', label: 'Route 1', targetAgentId: 'agent-target-1' },
              { id: 'branch_2', label: 'Route 2', targetAgentId: 'agent-target-2' },
            ],
          },
        },
      };

      const targetNode1: Node<any> = {
        id: 'agent-target-1',
        type: 'agentNode',
        position: { x: 100, y: 200 },
        data: { label: 'Target Agent 1' },
      };

      const targetNode2: Node<any> = {
        id: 'agent-target-2',
        type: 'agentNode',
        position: { x: 300, y: 200 },
        data: { label: 'Target Agent 2' },
      };

      const nodes = [routerNode, targetNode1, targetNode2];

      // Test 1: Only branch 1 is connected via edge
      const edges1: Edge[] = [
        {
          id: 'e_router_branch_1',
          source: 'router-1',
          sourceHandle: 'branch_1',
          target: 'agent-target-1',
        },
      ];

      const syncedNodes1 = syncAgentSubAgents(nodes, edges1);
      const updatedRouter1 = syncedNodes1.find((n) => n.id === 'router-1');
      const branches1 = updatedRouter1?.data?.routerConfig?.branches;

      assert.equal(branches1[0].targetAgentId, 'agent-target-1');
      assert.equal(branches1[1].targetAgentId, undefined, 'Severed edge cleared targetAgentId');

      // Test 2: Connect branch 2 as well
      const edges2: Edge[] = [
        ...edges1,
        {
          id: 'e_router_branch_2',
          source: 'router-1',
          sourceHandle: 'branch_2',
          target: 'agent-target-2',
        },
      ];

      const syncedNodes2 = syncAgentSubAgents(syncedNodes1, edges2);
      const updatedRouter2 = syncedNodes2.find((n) => n.id === 'router-1');
      const branches2 = updatedRouter2?.data?.routerConfig?.branches;

      assert.equal(branches2[0].targetAgentId, 'agent-target-1');
      assert.equal(branches2[1].targetAgentId, 'agent-target-2');
    });
  });
});
