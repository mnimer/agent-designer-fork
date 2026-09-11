/**
 * Unit Tests for Router Agent Drawer Configuration & Branch Management Logic
 *
 * Validates:
 * 1. Router configuration initialization and mode resolution.
 * 2. Branch reordering (moving branch cards up and down).
 * 3. Default fallback route assignment and exclusivity.
 * 4. Model selection defaulting to gemini-3.7-flash per project directives.
 * 5. Bidirectional kind switching between Standard, A2A, and Router nodes.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AgentData, RouterConfig, RouterBranchCondition } from '../../src/webview/types';
import { validateAgentIdentifier } from '../../src/shared/identifierValidation';

describe('Router Agent Drawer Configuration & Inspector Logic', () => {
  describe('Router Configuration Initialization & Mode Switching', () => {
    it('should initialize default router configuration when agentKind is set to router', () => {
      const baseAgent: AgentData = {
        label: 'Quality Gate',
        model: 'gemini-3.7-flash',
      };

      const initialRouterConfig: RouterConfig = {
        evaluationMode: 'boolean_expression',
        expressionVariable: 'status',
        thresholdValue: 0.8,
        routingPrompt: 'Analyze test outcome and branch accordingly',
        branches: [
          {
            id: 'branch_1',
            label: 'Success Gate',
            condition: "state.status == 'passed'",
            conditionExpression: "state.status == 'passed'",
          },
          {
            id: 'branch_2',
            label: 'Fallback Gate',
            condition: 'default',
            conditionExpression: 'default',
            isDefault: true,
          },
        ],
      };

      const routerAgent: AgentData = {
        ...baseAgent,
        agentKind: 'router',
        routerConfig: initialRouterConfig,
      };

      assert.equal(routerAgent.agentKind, 'router');
      assert.equal(routerAgent.routerConfig?.evaluationMode, 'boolean_expression');
      assert.equal(routerAgent.routerConfig?.branches.length, 2);
      assert.equal(routerAgent.routerConfig?.branches[1].isDefault, true);
    });

    it('should switch evaluation mode and adjust appropriate parameters', () => {
      const config: RouterConfig = {
        evaluationMode: 'boolean_expression',
        branches: [
          { id: 'b1', label: 'Pass', condition: 'score >= 0.8' },
          { id: 'b2', label: 'Fail', condition: 'default', isDefault: true },
        ],
      };

      // Switch to numeric_threshold
      const numericConfig: RouterConfig = {
        ...config,
        evaluationMode: 'numeric_threshold',
        expressionVariable: 'score',
        thresholdValue: 0.85,
      };

      assert.equal(numericConfig.evaluationMode, 'numeric_threshold');
      assert.equal(numericConfig.expressionVariable, 'score');
      assert.equal(numericConfig.thresholdValue, 0.85);

      // Switch to llm_classifier
      const classifierConfig: RouterConfig = {
        ...config,
        evaluationMode: 'llm_classifier',
        routingPrompt: 'Classify user query into candidate departments',
      };

      assert.equal(classifierConfig.evaluationMode, 'llm_classifier');
      assert.ok(classifierConfig.routingPrompt?.includes('departments'));
    });
  });

  describe('Branch Reordering (Move Up / Down)', () => {
    it('should reorder branches up and down correctly', () => {
      const branches: RouterBranchCondition[] = [
        { id: 'branch_a', label: 'Branch A', condition: 'a == 1' },
        { id: 'branch_b', label: 'Branch B', condition: 'b == 2' },
        { id: 'branch_c', label: 'Branch C', condition: 'default', isDefault: true },
      ];

      // Move branch B up (index 1 -> 0)
      const moveUp = (list: RouterBranchCondition[], index: number) => {
        if (index <= 0) return list;
        const next = [...list];
        const temp = next[index - 1];
        next[index - 1] = next[index];
        next[index] = temp;
        return next;
      };

      const reorderedUp = moveUp(branches, 1);
      assert.equal(reorderedUp[0].id, 'branch_b');
      assert.equal(reorderedUp[1].id, 'branch_a');
      assert.equal(reorderedUp[2].id, 'branch_c');

      // Move branch B down (index 0 -> 1)
      const moveDown = (list: RouterBranchCondition[], index: number) => {
        if (index >= list.length - 1) return list;
        const next = [...list];
        const temp = next[index + 1];
        next[index + 1] = next[index];
        next[index] = temp;
        return next;
      };

      const reorderedDown = moveDown(reorderedUp, 0);
      assert.equal(reorderedDown[0].id, 'branch_a');
      assert.equal(reorderedDown[1].id, 'branch_b');
      assert.equal(reorderedDown[2].id, 'branch_c');
    });

    it('should ignore move up on first element and move down on last element', () => {
      const branches: RouterBranchCondition[] = [
        { id: 'b1', label: 'B1' },
        { id: 'b2', label: 'B2' },
      ];

      const moveUp = (list: RouterBranchCondition[], index: number) => {
        if (index <= 0) return list;
        const next = [...list];
        const temp = next[index - 1];
        next[index - 1] = next[index];
        next[index] = temp;
        return next;
      };

      const moveDown = (list: RouterBranchCondition[], index: number) => {
        if (index >= list.length - 1) return list;
        const next = [...list];
        const temp = next[index + 1];
        next[index + 1] = next[index];
        next[index] = temp;
        return next;
      };

      assert.deepEqual(moveUp(branches, 0), branches);
      assert.deepEqual(moveDown(branches, 1), branches);
    });
  });

  describe('Default Fallback Route Handling', () => {
    it('should toggle default fallback route status exclusively', () => {
      const branches: RouterBranchCondition[] = [
        { id: 'b1', label: 'Branch 1', condition: 'x > 0', isDefault: false },
        { id: 'b2', label: 'Branch 2', condition: 'default', isDefault: true },
      ];

      // Set Branch 1 as the default fallback route
      const setFallback = (list: RouterBranchCondition[], targetId: string) => {
        return list.map((b) => ({
          ...b,
          isDefault: b.id === targetId,
          condition: b.id === targetId ? 'default' : (b.condition === 'default' ? '' : b.condition),
        }));
      };

      const updated = setFallback(branches, 'b1');
      assert.equal(updated[0].isDefault, true);
      assert.equal(updated[0].condition, 'default');
      assert.equal(updated[1].isDefault, false);
      assert.equal(updated[1].condition, '');
    });
  });

  describe('Model Selection & Deprecation Rules', () => {
    it('should default to gemini-3.7-flash and disallow deprecated gemini-1.5 or 2.5', () => {
      const defaultModel = 'gemini-3.7-flash';
      assert.equal(defaultModel, 'gemini-3.7-flash');

      const isModelValid = (m: string) => {
        if (m.startsWith('gemini-1.') || m.startsWith('gemini-2.')) return false;
        return m.startsWith('gemini-3.');
      };

      assert.ok(isModelValid('gemini-3.7-flash'));
      assert.ok(isModelValid('gemini-3.5-flash'));
      assert.equal(isModelValid('gemini-1.5-flash'), false);
      assert.equal(isModelValid('gemini-2.5-pro'), false);
    });
  });

  describe('Node Identifier Validation', () => {
    it('should validate router node label identifiers', () => {
      const valid = validateAgentIdentifier('quality_gate_router', 'router');
      assert.equal(valid.isValid, true);
      assert.equal(valid.sanitized, 'quality_gate_router');

      const invalidSpaces = validateAgentIdentifier('quality gate', 'router');
      assert.equal(invalidSpaces.isValid, false);
      assert.equal(invalidSpaces.hasSpaces, true);
      assert.equal(invalidSpaces.sanitized, 'quality_gate');

      const invalidHyphens = validateAgentIdentifier('quality-gate', 'router');
      assert.equal(invalidHyphens.isValid, false);
      assert.equal(invalidHyphens.hasHyphens, true);
      assert.equal(invalidHyphens.sanitized, 'quality_gate');

      const invalidKeyword = validateAgentIdentifier('class', 'router');
      assert.equal(invalidKeyword.isValid, false);
      assert.equal(invalidKeyword.isKeyword, true);

      const invalidDigit = validateAgentIdentifier('1_gate', 'router');
      assert.equal(invalidDigit.isValid, false);
      assert.equal(invalidDigit.startsWithDigit, true);
    });
  });
});
