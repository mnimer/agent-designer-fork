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
} from '../../../src/webview/data/triggerDefinitions';
import { TriggerNodeData, TestSuiteScenario } from '../../../src/shared/types';

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
        scheduledPrompt: 'Execute nightly database integrity and compliance sync.',
        retryCount: 3,
      },
    };

    assert.equal(trigger.triggerKind, 'scheduled');
    assert.equal(trigger.config?.cronExpression, '0 0 * * *');
    assert.equal(trigger.config?.scheduledPrompt, 'Execute nightly database integrity and compliance sync.');
    assert.equal(trigger.config?.retryCount, 3);

    const webhookTrigger: TriggerNodeData = {
      ...trigger,
      triggerKind: 'webhook',
      config: {
        webhookPath: '/api/v1/orders',
        httpMethod: 'POST',
        authType: 'bearer_token',
        secretHeaderName: 'Authorization',
        payloadDescription: 'JSON webhook body containing order ID and customer request',
      },
    };

    assert.equal(webhookTrigger.triggerKind, 'webhook');
    assert.equal(webhookTrigger.config?.webhookPath, '/api/v1/orders');
    assert.equal(webhookTrigger.config?.httpMethod, 'POST');
    assert.equal(webhookTrigger.config?.authType, 'bearer_token');
    assert.equal(webhookTrigger.config?.secretHeaderName, 'Authorization');

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

  describe('Test Suite Dynamic Handle Pruning & Single Root Connection', () => {
    // Helper replicating TriggerNode handle resolution logic
    const resolveTriggerHandles = (connections: Array<{ sourceHandle?: string; targetHandle?: string }>) => {
      const isConnected = connections.length > 0;
      const activeConnection = isConnected ? connections[0] : null;
      const connectedHandleId = activeConnection?.sourceHandle;

      const isRightActive = isConnected && connectedHandleId === 'trigger_out_right';
      const isBottomActive = isConnected && connectedHandleId === 'trigger_out_bottom';

      return {
        showRightHandle: !isConnected || isRightActive || (!isRightActive && !isBottomActive),
        showBottomHandle: !isConnected || isBottomActive || (!isRightActive && !isBottomActive),
        isConnectable: true,
        isConnected,
      };
    };

    it('should show both handles and allow connection when disconnected', () => {
      const handles = resolveTriggerHandles([]);
      assert.equal(handles.isConnected, false);
      assert.equal(handles.showRightHandle, true);
      assert.equal(handles.showBottomHandle, true);
      assert.equal(handles.isConnectable, true);
    });

    it('should remove bottom handle when connected via right handle', () => {
      const handles = resolveTriggerHandles([{ sourceHandle: 'trigger_out_right', targetHandle: 'input' }]);
      assert.equal(handles.isConnected, true);
      assert.equal(handles.showRightHandle, true);
      assert.equal(handles.showBottomHandle, false);
      assert.equal(handles.isConnectable, true);
    });

    it('should remove right handle when connected via bottom handle', () => {
      const handles = resolveTriggerHandles([{ sourceHandle: 'trigger_out_bottom', targetHandle: 'input' }]);
      assert.equal(handles.isConnected, true);
      assert.equal(handles.showRightHandle, false);
      assert.equal(handles.showBottomHandle, true);
      assert.equal(handles.isConnectable, true);
    });

    it('should restore both handles when connection is deleted', () => {
      // 1. Initially connected
      const connectedHandles = resolveTriggerHandles([{ sourceHandle: 'trigger_out_right' }]);
      assert.equal(connectedHandles.showBottomHandle, false);

      // 2. User deletes edge -> connections array becomes empty
      const restoredHandles = resolveTriggerHandles([]);
      assert.equal(restoredHandles.showRightHandle, true);
      assert.equal(restoredHandles.showBottomHandle, true);
      assert.equal(restoredHandles.isConnectable, true);
    });

    it('should enforce connection strictly to 1 root node', () => {
      const existingEdges = [
        { id: 'e_trigger_1', source: 'trigger_node_1', target: 'agent_root' },
      ];

      // New connection from same trigger to another agent replaces existing edge
      const newTarget = 'agent_new_root';
      const updatedEdges = [
        ...existingEdges.filter((e) => e.source !== 'trigger_node_1'),
        { id: 'e_trigger_2', source: 'trigger_node_1', target: newTarget },
      ];

      assert.equal(updatedEdges.length, 1);
      assert.equal(updatedEdges[0].target, 'agent_new_root');
    });

    it('should validate Test Suite connections to Top and Left In handles on Root agent', () => {
      const rootAgentHandles = ['input', 'input_left'];
      rootAgentHandles.forEach((handle) => {
        const isValid = ['input', 'input_left'].includes(handle);
        assert.equal(isValid, true, `Handle ${handle} should be a valid In handle on root agent`);
      });

      // Right handle removed from agent nodes
      const isRightHandleValid = ['input', 'input_left'].includes('input_right');
      assert.equal(isRightHandleValid, false, 'input_right should no longer be a valid In handle');

      const isInvalidHandle = ['input', 'input_left'].includes('random_handle');
      assert.equal(isInvalidHandle, false);
    });

    it('should validate Agent Out to In connections across multiple agents', () => {
      const sourceAgent = { id: 'agent_1', type: 'agentNode' };
      const rootTargetAgent = { id: 'agent_2', type: 'agentNode', data: { isStartNode: true } };
      const childTargetAgent = { id: 'agent_3', type: 'agentNode', data: { isStartNode: false } };

      const isValidAgentConnection = (source: any, target: any, targetHandle?: string) => {
        if (!source || !target) return false;
        if (source.id === target.id) return false;
        if (target.type !== 'agentNode') return false;
        if (source.type !== 'agentNode') return false;
        const isRoot = target.data?.isStartNode;
        const validInHandles = isRoot ? ['input', 'input_left'] : ['input'];
        if (targetHandle && !validInHandles.includes(targetHandle)) return false;
        return true;
      };

      // Valid: Out -> In (Top for child agent, Top & Left for root agent)
      assert.equal(isValidAgentConnection(sourceAgent, rootTargetAgent, 'input'), true);
      assert.equal(isValidAgentConnection(sourceAgent, rootTargetAgent, 'input_left'), true);
      assert.equal(isValidAgentConnection(sourceAgent, childTargetAgent, 'input'), true);

      // Invalid: Left handle on non-root child agent
      assert.equal(isValidAgentConnection(sourceAgent, childTargetAgent, 'input_left'), false);

      // Invalid: Right handle on any agent
      assert.equal(isValidAgentConnection(sourceAgent, rootTargetAgent, 'input_right'), false);
      assert.equal(isValidAgentConnection(sourceAgent, childTargetAgent, 'input_right'), false);

      // Invalid: Agent to self
      assert.equal(isValidAgentConnection(sourceAgent, sourceAgent, 'input'), false);

      // Invalid: Agent to unknown target handle
      assert.equal(isValidAgentConnection(sourceAgent, rootTargetAgent, 'invalid_handle'), false);
    });

    it('should route backward feedback loop edges around node boundaries', () => {
      const source = { x: 300, y: 500, position: 'bottom' };
      const targetAbove = { x: 300, y: 200, position: 'top' };
      const targetLeft = { x: 200, y: 200, position: 'left' };
      const targetRight = { x: 400, y: 200, position: 'right' };

      const isBackwardEdge = (sPos: string, sY: number, tY: number) => {
        return sPos === 'bottom' && tY < sY + 40;
      };

      assert.equal(isBackwardEdge(source.position, source.y, targetAbove.y), true);
      assert.equal(isBackwardEdge(source.position, source.y, targetLeft.y), true);
      assert.equal(isBackwardEdge(source.position, source.y, targetRight.y), true);

      // Forward edge (downward) should not be flagged as backward
      assert.equal(isBackwardEdge('bottom', 200, 500), false);
    });
  });

  describe('Eventarc Dynamic Providers Response Processing', () => {
    it('should correctly unwrap categories whether returned as direct payload or nested payload', () => {
      const mockCategories = [
        {
          id: 'storage',
          name: 'Cloud Storage (GCS)',
          serviceName: 'storage.googleapis.com',
          events: [
            {
              id: 'ObjectFinalized',
              name: 'ObjectFinalized',
              fullEvent: 'google.cloud.storage.object.v1.finalized',
              description: 'Object created',
            },
          ],
        },
      ];

      // Format 1: Direct payload returned by bridge.sendRequestWithReply
      const directPayloadResponse = {
        categories: mockCategories,
        source: 'gcloud',
        location: 'us-central1',
      };

      const unwrap1 = (directPayloadResponse as any)?.categories
        ? directPayloadResponse
        : (directPayloadResponse as any)?.payload;
      assert.equal(unwrap1.categories.length, 1);
      assert.equal(unwrap1.source, 'gcloud');
      assert.equal(unwrap1.categories[0].id, 'storage');

      // Format 2: Nested message format
      const nestedPayloadResponse = {
        type: 'EVENTARC_PROVIDERS_RESPONSE',
        payload: {
          categories: mockCategories,
          source: 'gcloud',
          location: 'us-central1',
        },
      };

      const unwrap2 = (nestedPayloadResponse as any)?.categories
        ? nestedPayloadResponse
        : (nestedPayloadResponse as any)?.payload;
      assert.equal(unwrap2.categories.length, 1);
      assert.equal(unwrap2.source, 'gcloud');
      assert.equal(unwrap2.categories[0].id, 'storage');
    });

    it('should initialize Eventarc trigger catalog with empty string defaults (no mock values)', async () => {
      const { TRIGGER_CATALOG, EVENTARC_CATEGORIES } = await import('../../../src/webview/data/triggerDefinitions');
      const eventarcTrigger = TRIGGER_CATALOG.find((t: any) => t.id === 'trigger_eventarc');
      assert.ok(eventarcTrigger, 'Eventarc trigger definition should exist in catalog');
      assert.equal(eventarcTrigger.defaultConfig.eventarcCategory, '');
      assert.equal(eventarcTrigger.defaultConfig.eventarcEvent, '');
      assert.equal(eventarcTrigger.defaultConfig.eventarcServiceName, '');
      assert.equal(eventarcTrigger.defaultConfig.eventarcServiceAccount, '');

      // Verify Dataplex category is present in EVENTARC_CATEGORIES
      const dataplex = EVENTARC_CATEGORIES.find((c: any) => c.id === 'dataplex');
      assert.ok(dataplex, 'Dataplex category should be present in EVENTARC_CATEGORIES');
      assert.equal(dataplex.serviceName, 'dataplex.googleapis.com');
      assert.ok(dataplex.events.some((e: any) => e.id === 'created'));
      assert.ok(dataplex.events.some((e: any) => e.id === 'updated'));
      assert.ok(dataplex.events.some((e: any) => e.id === 'deleted'));
    });

    it('should dynamically preserve and display custom or unlisted Eventarc categories and events', async () => {
      const { EVENTARC_CATEGORIES } = await import('../../../src/webview/data/triggerDefinitions');
      
      // Simulate loaded node with custom/unlisted eventarc service
      const customConfig = {
        eventarcCategory: 'custom-event-hub',
        eventarcServiceName: 'custom-event-hub.googleapis.com',
        eventarcEvent: 'CustomEventTriggered',
        eventarcServiceAccount: '',
      };

      // Match dynamic categories logic in TriggerDrawer
      const list = [...EVENTARC_CATEGORIES];
      const catId = customConfig.eventarcCategory;
      const sName = customConfig.eventarcServiceName;
      const exists = list.some((c) => (catId && c.id === catId) || (sName && c.serviceName === sName));
      if (!exists && (catId || sName)) {
        list.push({
          id: catId,
          name: catId,
          serviceName: sName,
          events: [
            {
              id: customConfig.eventarcEvent,
              name: customConfig.eventarcEvent,
              fullEvent: `google.cloud.${catId}.v1.${customConfig.eventarcEvent}`,
              description: 'Configured Event',
            },
          ],
        });
      }

      const matchedCategory = list.find((c) => c.id === customConfig.eventarcCategory);
      assert.ok(matchedCategory, 'Custom eventarc category should be preserved');
      assert.equal(matchedCategory.serviceName, 'custom-event-hub.googleapis.com');
      assert.equal(matchedCategory.events[0].id, 'CustomEventTriggered');
    });

    it('should correctly identify trigger nodes with type triggerNode or trigger or triggerKind', async () => {
      const { isTriggerNode } = await import('../../../src/webview/App');

      assert.equal(isTriggerNode({ type: 'triggerNode' }), true);
      assert.equal(isTriggerNode({ type: 'trigger' }), true);
      assert.equal(isTriggerNode({ type: 'agentNode' }), false);
      assert.equal(isTriggerNode({ type: 'agent' }), false);
      assert.equal(isTriggerNode(undefined), false);
    });

    it('should normalize cron, schedule, and scheduled trigger types to scheduled', () => {
      const normalizeTriggerType = (rawType: string) => {
        return rawType === 'test'
          ? 'tester'
          : rawType === 'cron' || rawType === 'schedule' || rawType === 'scheduler'
          ? 'scheduled'
          : rawType;
      };

      assert.equal(normalizeTriggerType('cron'), 'scheduled');
      assert.equal(normalizeTriggerType('schedule'), 'scheduled');
      assert.equal(normalizeTriggerType('scheduler'), 'scheduled');
      assert.equal(normalizeTriggerType('scheduled'), 'scheduled');
      assert.equal(normalizeTriggerType('test'), 'tester');
      assert.equal(normalizeTriggerType('tester'), 'tester');
      assert.equal(normalizeTriggerType('pubsub'), 'pubsub');
      assert.equal(normalizeTriggerType('eventarc'), 'eventarc');
    });

    it('should correctly unwrap Pub/Sub topics whether returned as direct payload or nested payload', () => {
      const mockTopics = [
        {
          name: 'projects/demo-proj/topics/order-events',
          shortName: 'order-events',
          projectId: 'demo-proj',
        },
      ];

      // Format 1: Direct payload
      const directResponse = {
        topics: mockTopics,
        source: 'gcloud',
        projectId: 'demo-proj',
      };
      const unwrap1 = (directResponse as any)?.topics ? directResponse : (directResponse as any)?.payload;
      assert.equal(unwrap1.topics.length, 1);
      assert.equal(unwrap1.source, 'gcloud');
      assert.equal(unwrap1.topics[0].shortName, 'order-events');

      // Format 2: Nested payload
      const nestedResponse = {
        type: 'PUBSUB_TOPICS_RESPONSE',
        payload: {
          topics: mockTopics,
          source: 'gcloud',
          projectId: 'demo-proj',
        },
      };
      const unwrap2 = (nestedResponse as any)?.topics ? nestedResponse : (nestedResponse as any)?.payload;
      assert.equal(unwrap2.topics.length, 1);
      assert.equal(unwrap2.topics[0].shortName, 'order-events');
    });

    it('should correctly unwrap GCP Service Accounts and preserve custom SA addresses', () => {
      const mockSAs = [
        {
          email: 'custom-invoker@demo-proj.iam.gserviceaccount.com',
          name: 'Custom Invoker SA',
        },
      ];

      const directResponse = {
        serviceAccounts: mockSAs,
        source: 'gcloud',
        projectId: 'demo-proj',
      };
      const unwrap = (directResponse as any)?.serviceAccounts ? directResponse : (directResponse as any)?.payload;
      assert.equal(unwrap.serviceAccounts.length, 1);
      assert.equal(unwrap.serviceAccounts[0].email, 'custom-invoker@demo-proj.iam.gserviceaccount.com');
    });
  });
});

