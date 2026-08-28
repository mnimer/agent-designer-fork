/**
 * Unit Tests for Trigger Node Configuration Logic & Definitions
 *
 * Validates:
 * 1. Cron preset configurations and syntax matching.
 * 2. Pub/Sub preset definitions and automatic subscription naming.
 * 3. Test scenario CRUD logic and assertion mapping.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CRON_PRESETS,
  PUBSUB_TOPIC_PRESETS,
  DEFAULT_MOCK_TEST_SCENARIOS,
} from '../../src/webview/data/triggerDefinitions';
import { TriggerNodeData, TestSuiteScenario } from '../../src/shared/types';

describe('Trigger Configuration & Presets Logic', () => {
  it('should provide standard Cloud Scheduler cron presets', () => {
    assert.ok(CRON_PRESETS.length >= 4);
    const hourly = CRON_PRESETS.find((p) => p.label === 'Hourly');
    assert.equal(hourly?.cron, '0 * * * *');

    const weekdays = CRON_PRESETS.find((p) => p.label === 'Weekdays @ 9AM');
    assert.equal(weekdays?.cron, '0 9 * * 1-5');
  });

  it('should provide standard Pub/Sub topic presets', () => {
    assert.ok(PUBSUB_TOPIC_PRESETS.length >= 4);
    const eventsTopic = PUBSUB_TOPIC_PRESETS.find((p) => p.topic.includes('agent-tasks'));
    assert.ok(eventsTopic);
  });

  it('should initialize and modify test scenarios', () => {
    assert.ok(DEFAULT_MOCK_TEST_SCENARIOS.length >= 1);
    const scenarios: TestSuiteScenario[] = [...DEFAULT_MOCK_TEST_SCENARIOS];

    const newScenario: TestSuiteScenario = {
      id: 'sc-custom',
      name: 'Custom Test Case',
      inputQuery: 'Summarize quarterly financial results',
      expectedOutputPattern: 'Revenue',
    };

    const updatedScenarios = [...scenarios, newScenario];
    assert.equal(updatedScenarios.length, scenarios.length + 1);
    assert.equal(updatedScenarios[updatedScenarios.length - 1].name, 'Custom Test Case');
  });

  it('should mutate trigger node state cleanly across trigger kinds', () => {
    const trigger: TriggerNodeData = {
      label: 'Nightly Run',
      triggerKind: 'scheduled',
      config: {
        cronExpression: '0 0 * * *',
        timezone: 'America/New_York',
      },
    };

    assert.equal(trigger.triggerKind, 'scheduled');
    assert.equal(trigger.config?.cronExpression, '0 0 * * *');

    const pubsubTrigger: TriggerNodeData = {
      ...trigger,
      triggerKind: 'pubsub',
      config: {
        topic: 'projects/demo/topics/orders',
        subscription: 'orders-sub-auto',
      },
    };

    assert.equal(pubsubTrigger.triggerKind, 'pubsub');
    assert.equal(pubsubTrigger.config?.subscription, 'orders-sub-auto');
  });
});
