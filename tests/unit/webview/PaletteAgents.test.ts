/**
 * Unit Tests for Basic Agent Types in PaletteCard
 *
 * Validates:
 * 1. PaletteCard basic agent types catalog includes Standard, A2A, and Router nodes.
 * 2. Visual metadata (theme color, badge label, agent kind) for all 3 types.
 * 3. Drag-and-drop payload generation for all 3 basic agent types.
 * 4. createSingleAgentNode generates valid node structure for all 3 basic agent types.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { 
  createSingleAgentNode, 
  CORE_AGENT_TYPES, 
  FLOW_CONTROL_AGENT_TYPES, 
  BASIC_AGENT_TYPES, 
  PATTERN_DEFINITIONS 
} from '../../../src/webview/data/patterns';
import { AgentKind } from '../../../src/webview/types';

describe('Basic Agent Types Palette & Node Creation', () => {
  it('should partition basic agent types into Core and Flow & Control groups', () => {
    assert.equal(CORE_AGENT_TYPES.length, 2);
    assert.deepEqual(CORE_AGENT_TYPES.map(a => a.kind), ['standard', 'a2a']);

    assert.equal(FLOW_CONTROL_AGENT_TYPES.length, 5);
    assert.deepEqual(FLOW_CONTROL_AGENT_TYPES.map(a => a.kind), ['router', 'synthesizer', 'hitl', 'fallback', 'guardrail']);

    assert.equal(BASIC_AGENT_TYPES.length, 7);
  });

  it('should include active Multi-Agent Pattern definitions', () => {
    assert.equal(PATTERN_DEFINITIONS.length, 8);
    const patternTypes = PATTERN_DEFINITIONS.map(p => p.type);
    assert.deepEqual(patternTypes, [
      'sequential',
      'parallel',
      'router',
      'loop',
      'debate',
      'hierarchical_decomposition',
      'review_critique',
      'coordinator'
    ]);
  });

  it('should configure Router Agent with Branching badge and purple theme', () => {
    const routerType = BASIC_AGENT_TYPES.find((a) => a.kind === 'router');
    assert.ok(routerType);
    assert.equal(routerType?.badge, 'Branching');
    assert.equal(routerType?.colorTheme, 'purple');
    assert.ok(routerType?.description.includes('branching'));
  });

  it('should configure Synthesizer Agent with Reducer badge and emerald theme', () => {
    const synType = BASIC_AGENT_TYPES.find((a) => a.kind === 'synthesizer');
    assert.ok(synType);
    assert.equal(synType?.badge, 'Reducer');
    assert.equal(synType?.colorTheme, 'emerald');
    assert.ok(synType?.description.includes('structured JSON'));
  });

  it('should configure Approval Gate with HITL badge and amber theme', () => {
    const hitlType = BASIC_AGENT_TYPES.find((a) => a.kind === 'hitl');
    assert.ok(hitlType);
    assert.equal(hitlType?.badge, 'HITL');
    assert.equal(hitlType?.colorTheme, 'amber');
    assert.ok(hitlType?.description.includes('Human review'));
  });

  it('should configure Fallback Circuit Breaker with Resilience badge and rose theme', () => {
    const fbType = BASIC_AGENT_TYPES.find((a) => a.kind === 'fallback');
    assert.ok(fbType);
    assert.equal(fbType?.badge, 'Resilience');
    assert.equal(fbType?.colorTheme, 'rose');
    assert.ok(fbType?.description.includes('quota fallback'));
  });

  it('should configure Guardrail Shield with Shield badge and teal theme', () => {
    const grType = BASIC_AGENT_TYPES.find((a) => a.kind === 'guardrail');
    assert.ok(grType);
    assert.equal(grType?.badge, 'Shield');
    assert.equal(grType?.colorTheme, 'teal');
    assert.ok(grType?.description.includes('safety'));
  });

  it('should create valid synthesizer node on canvas with structuredOutput and no tools', () => {
    const synNode = createSingleAgentNode(100, 200, undefined, undefined, 'synthesizer');
    assert.equal(synNode.type, 'agentNode');
    assert.equal(synNode.data.agentKind, 'synthesizer');
    assert.equal(synNode.data.colorTheme, 'green');
    assert.ok(synNode.data.synthesizerConfig);
    assert.equal(synNode.data.synthesizerConfig?.reductionStrategy, 'summarize');
    assert.ok(synNode.data.structuredOutput?.enabled);
    assert.deepEqual(synNode.data.tools, []);
  });

  it('should create valid HITL approval gate node on canvas', () => {
    const hitlNode = createSingleAgentNode(100, 200, undefined, undefined, 'hitl');
    assert.equal(hitlNode.type, 'agentNode');
    assert.equal(hitlNode.data.agentKind, 'hitl');
    assert.equal(hitlNode.data.colorTheme, 'amber');
    assert.ok(hitlNode.data.hitlConfig);
    assert.equal(hitlNode.data.hitlConfig?.autoRejectOnTimeout, true);
  });

  it('should create valid fallback circuit breaker node on canvas', () => {
    const fbNode = createSingleAgentNode(100, 200, undefined, undefined, 'fallback');
    assert.equal(fbNode.type, 'agentNode');
    assert.equal(fbNode.data.agentKind, 'fallback');
    assert.equal(fbNode.data.colorTheme, 'rose');
    assert.ok(fbNode.data.fallbackConfig);
    assert.equal(fbNode.data.fallbackConfig?.maxRetries, 3);
  });

  it('should create valid guardrail shield node on canvas', () => {
    const grNode = createSingleAgentNode(100, 200, undefined, undefined, 'guardrail');
    assert.equal(grNode.type, 'agentNode');
    assert.equal(grNode.data.agentKind, 'guardrail');
    assert.equal(grNode.data.colorTheme, 'teal');
    assert.ok(grNode.data.guardrailConfig);
    assert.equal(grNode.data.guardrailConfig?.actionOnViolation, 'block');
  });

  it('should create valid standard, A2A, and router nodes on canvas', () => {
    const standardNode = createSingleAgentNode(0, 0, undefined, undefined, 'standard');
    assert.equal(standardNode.data.agentKind, 'standard');

    const a2aNode = createSingleAgentNode(50, 50, undefined, undefined, 'a2a');
    assert.equal(a2aNode.data.agentKind, 'a2a');
    assert.ok(a2aNode.data.a2aConfig);

    const routerNode = createSingleAgentNode(100, 100, undefined, undefined, 'router');
    assert.equal(routerNode.data.agentKind, 'router');
    assert.ok(routerNode.data.routerConfig);
  });
});
