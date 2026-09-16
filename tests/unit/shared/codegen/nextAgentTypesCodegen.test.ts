/**
 * Unit Tests for Next 4 Agent Types Python ADK Code Generation
 *
 * Validates:
 * 1. Synthesizer agent emits Pydantic BaseModel schema and Agent with output_schema and no tools.
 * 2. HITL Approval Gate emits BaseAgent class evaluating approved/rejected targets.
 * 3. Fallback Circuit Breaker emits BaseAgent class handling exceptions and routing to fallback agent.
 * 4. Guardrail Shield emits BaseAgent class filtering security policies and routing to pass/block agents.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PythonAdkGenerator } from '../../../../src/shared/codegen/pythonAdkGenerator';
import { AgentWorkflowDocument } from '../../../../src/shared/types';

describe('Next 4 Agent Types Python ADK Codegen', () => {
  const generator = new PythonAdkGenerator();

  it('should generate valid Python code for Synthesizer Agent with Pydantic output_schema', () => {
    const workflow: AgentWorkflowDocument = {
      version: '1.0.0',
      name: 'Synthesizer Workflow',
      nodes: [
        {
          id: 'syn-1',
          type: 'agentNode',
          position: { x: 100, y: 100 },
          data: {
            label: 'Executive Summary Synthesizer',
            agentKind: 'synthesizer',
            model: 'gemini-3.7-flash',
            systemPrompt: 'Synthesize research data into structured executive report.',
            synthesizerConfig: {
              inputStateKeys: ['raw_research', 'financial_data'],
              reductionStrategy: 'summarize',
            },
            structuredOutput: {
              enabled: true,
              formatType: 'json_schema',
              name: 'ExecutiveReport',
              fields: [
                { id: 'f1', name: 'summary', type: 'string', required: true, description: 'Executive summary' },
                { id: 'f2', name: 'key_risks', type: 'array', arrayItemType: 'string', required: true, description: 'List of risks' },
                { id: 'f3', name: 'confidence_score', type: 'number', required: false, description: 'Confidence metric' },
              ],
            },
          },
        },
      ],
      edges: [],
    };

    const code = generator.generateWorkflowFile(workflow);

    assert.ok(code.includes('from pydantic import BaseModel, Field'));
    assert.ok(code.includes('class ExecutiveReport(BaseModel):'));
    assert.ok(code.includes('summary: str = Field('));
    assert.ok(code.includes('key_risks: List[str] = Field('));
    assert.ok(code.includes('confidence_score: Optional[float] = Field('));
    assert.ok(code.includes('output_schema=ExecutiveReport'));
    assert.ok(code.includes('tools=[]'));
  });

  it('should generate valid Python code for HITL Approval Gate Agent', () => {
    const workflow: AgentWorkflowDocument = {
      version: '1.0.0',
      name: 'HITL Workflow',
      nodes: [
        {
          id: 'hitl-1',
          type: 'agentNode',
          position: { x: 100, y: 100 },
          data: {
            label: 'Budget Gate',
            agentKind: 'hitl',
            hitlConfig: {
              approvalCondition: 'state.amount > 5000',
              approvedTargetAgentId: 'agent-approved',
              rejectedTargetAgentId: 'agent-rejected',
            },
          },
        },
        {
          id: 'agent-approved',
          type: 'agentNode',
          position: { x: 100, y: 300 },
          data: {
            label: 'Transfer Agent',
            agentKind: 'standard',
          },
        },
        {
          id: 'agent-rejected',
          type: 'agentNode',
          position: { x: 300, y: 300 },
          data: {
            label: 'Rejection Agent',
            agentKind: 'standard',
          },
        },
      ],
      edges: [],
    };

    const code = generator.generateWorkflowFile(workflow);

    assert.ok(code.includes('class BudgetGateApprovalGate(BaseAgent):'));
    assert.ok(code.includes('approved_agent: Optional[Any] = None'));
    assert.ok(code.includes('rejected_agent: Optional[Any] = None'));
    assert.ok(code.includes('budget_gate = BudgetGateApprovalGate('));
    assert.ok(code.includes('approved_agent=transfer_agent'));
    assert.ok(code.includes('rejected_agent=rejection_agent'));
  });

  it('should generate valid Python code for Fallback Circuit Breaker Agent', () => {
    const workflow: AgentWorkflowDocument = {
      version: '1.0.0',
      name: 'Fallback Workflow',
      nodes: [
        {
          id: 'fb-1',
          type: 'agentNode',
          position: { x: 100, y: 100 },
          data: {
            label: 'Model Resilience Gate',
            agentKind: 'fallback',
            fallbackConfig: {
              maxRetries: 3,
              primaryTargetAgentId: 'agent-primary',
              fallbackTargetAgentId: 'agent-backup',
            },
          },
        },
        {
          id: 'agent-primary',
          type: 'agentNode',
          position: { x: 100, y: 300 },
          data: {
            label: 'Primary Gemini Agent',
            agentKind: 'standard',
          },
        },
        {
          id: 'agent-backup',
          type: 'agentNode',
          position: { x: 300, y: 300 },
          data: {
            label: 'Backup Agent',
            agentKind: 'standard',
          },
        },
      ],
      edges: [],
    };

    const code = generator.generateWorkflowFile(workflow);

    assert.ok(code.includes('class ModelResilienceGateCircuitBreaker(BaseAgent):'));
    assert.ok(code.includes('primary_agent: Optional[Any] = None'));
    assert.ok(code.includes('fallback_agent: Optional[Any] = None'));
    assert.ok(code.includes('model_resilience_gate = ModelResilienceGateCircuitBreaker('));
    assert.ok(code.includes('primary_agent=primary_gemini_agent'));
    assert.ok(code.includes('fallback_agent=backup_agent'));
  });

  it('should generate valid Python code for Guardrail Shield Agent', () => {
    const workflow: AgentWorkflowDocument = {
      version: '1.0.0',
      name: 'Guardrail Workflow',
      nodes: [
        {
          id: 'gr-1',
          type: 'agentNode',
          position: { x: 100, y: 100 },
          data: {
            label: 'Safety Shield',
            agentKind: 'guardrail',
            guardrailConfig: {
              passTargetAgentId: 'agent-core',
              blockTargetAgentId: 'agent-blocked',
            },
          },
        },
        {
          id: 'agent-core',
          type: 'agentNode',
          position: { x: 100, y: 300 },
          data: {
            label: 'Core Assistant',
            agentKind: 'standard',
          },
        },
        {
          id: 'agent-blocked',
          type: 'agentNode',
          position: { x: 300, y: 300 },
          data: {
            label: 'Security Blocker',
            agentKind: 'standard',
          },
        },
      ],
      edges: [],
    };

    const code = generator.generateWorkflowFile(workflow);

    assert.ok(code.includes('class SafetyShieldGuardrailShield(BaseAgent):'));
    assert.ok(code.includes('pass_agent: Optional[Any] = None'));
    assert.ok(code.includes('block_agent: Optional[Any] = None'));
    assert.ok(code.includes('safety_shield = SafetyShieldGuardrailShield('));
    assert.ok(code.includes('pass_agent=core_assistant'));
    assert.ok(code.includes('block_agent=security_blocker'));
  });
});
