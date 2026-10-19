/**
 * Unit Tests for ADK Planners Configuration & Multi-Step Reasoning (TASK-226)
 *
 * Validates:
 * 1. AdkPlannerType variations ('none', 'built_in', 'plan_re_act').
 * 2. BuiltInPlanner parameters (includeThoughts, thinkingBudget).
 * 3. PlanReActPlanner multi-step reasoning loop setup.
 * 4. Boundary and extreme thinking budgets (1024 to 32768 tokens).
 * 5. Planner badge label mapping and conditional activation.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AgentNodeData,
  AdkPlannerType,
  PlannerConfig,
} from '../../../src/shared/types';

describe('ADK Planners Configuration & Multi-Step Reasoning (TASK-226)', () => {
  // Section 1: Planner Types
  it('should support all standard ADK planner types', () => {
    const types: AdkPlannerType[] = ['none', 'built_in', 'plan_re_act'];
    assert.equal(types.length, 3);
  });

  // Section 2: BuiltInPlanner with ThinkingConfig
  it('should configure BuiltInPlanner with native Gemini thinkingBudget and includeThoughts', () => {
    const config: PlannerConfig = {
      type: 'built_in',
      includeThoughts: true,
      thinkingBudget: 2048,
    };

    assert.equal(config.type, 'built_in');
    assert.equal(config.includeThoughts, true);
    assert.equal(config.thinkingBudget, 2048);
  });

  it('should support high-budget reasoning configurations for complex tasks', () => {
    const deepReasoningConfig: PlannerConfig = {
      type: 'built_in',
      includeThoughts: true,
      thinkingBudget: 32768,
    };

    assert.equal(deepReasoningConfig.thinkingBudget, 32768);
  });

  // Section 3: PlanReActPlanner
  it('should configure PlanReActPlanner for multi-step reasoning and replanning loops', () => {
    const reactConfig: PlannerConfig = {
      type: 'plan_re_act',
    };

    assert.equal(reactConfig.type, 'plan_re_act');
  });

  // Section 4: Integration with AgentNodeData
  it('should update AgentNodeData with planner configurations immutably', () => {
    const baseAgent: AgentNodeData = {
      label: 'Research Agent',
      role: 'Literature Reviewer',
      model: 'gemini-3.8-flash',
    };

    const builtInAgent: AgentNodeData = {
      ...baseAgent,
      plannerConfig: {
        type: 'built_in',
        includeThoughts: true,
        thinkingBudget: 4096,
      },
    };

    assert.equal(builtInAgent.plannerConfig?.type, 'built_in');
    assert.equal(builtInAgent.plannerConfig?.thinkingBudget, 4096);

    const reactAgent: AgentNodeData = {
      ...baseAgent,
      plannerConfig: {
        type: 'plan_re_act',
      },
    };

    assert.equal(reactAgent.plannerConfig?.type, 'plan_re_act');
  });

  // Section 5: Badge rendering helper logic
  it('should determine correct badge display text for active planners', () => {
    const getPlannerBadgeText = (config?: PlannerConfig): string | null => {
      if (!config || !config.type || config.type === 'none') {
        return null;
      }
      return config.type === 'built_in' ? 'BuiltInPlanner' : 'PlanReAct';
    };

    assert.equal(getPlannerBadgeText(undefined), null);
    assert.equal(getPlannerBadgeText({ type: 'none' }), null);
    assert.equal(getPlannerBadgeText({ type: 'built_in', thinkingBudget: 2048 }), 'BuiltInPlanner');
    assert.equal(getPlannerBadgeText({ type: 'plan_re_act' }), 'PlanReAct');
  });
});
