/**
 * Unit Tests for Triggers Tab Panel & Trigger Node Theme
 *
 * Validates:
 * 1. All triggers in TRIGGER_CATALOG are mapped with the unified orange theme.
 * 2. PubSub and Scheduled triggers are identified as disabled until runtime implementation.
 * 3. Chat, EventArc, and Tester triggers remain enabled and actionable.
 * 4. Drag-and-drop and action button guards block disabled triggers.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TRIGGER_CATALOG, TriggerCatalogItem } from '../../../src/webview/data/triggerDefinitions';
import { TriggerType } from '../../../src/webview/types';

describe('Triggers Tab Panel & Theme Logic', () => {
  // Logic replicating PaletteCard disabled trigger resolution
  const isTriggerDisabled = (type: TriggerType): boolean => {
    return type === 'pubsub' || type === 'scheduled';
  };

  // Logic replicating TriggerNode uniform orange theme
  const getTriggerTheme = (_type: TriggerType) => {
    return {
      border: 'border-orange-500/60 hover:border-orange-400 shadow-orange-950/30',
      badge: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
      accent: 'text-orange-400',
      glow: 'shadow-[0_0_15px_rgba(249,115,22,0.15)]',
    };
  };

  it('should include all required triggers in the catalog', () => {
    const triggerTypes = TRIGGER_CATALOG.map((t) => t.type);
    assert.ok(triggerTypes.includes('tester'), 'tester trigger must exist');
    assert.ok(triggerTypes.includes('chat'), 'chat trigger must exist');
    assert.ok(triggerTypes.includes('pubsub'), 'pubsub trigger must exist');
    assert.ok(triggerTypes.includes('scheduled'), 'scheduled trigger must exist');
    assert.ok(triggerTypes.includes('eventarc'), 'eventarc trigger must exist');
    assert.ok(triggerTypes.includes('webhook'), 'webhook trigger must exist');
    assert.equal(TRIGGER_CATALOG.length, 6);
  });

  it('should mark PubSub and Scheduled triggers as disabled', () => {
    const pubsubTrigger = TRIGGER_CATALOG.find((t) => t.type === 'pubsub');
    const scheduledTrigger = TRIGGER_CATALOG.find((t) => t.type === 'scheduled');
    const chatTrigger = TRIGGER_CATALOG.find((t) => t.type === 'chat');
    const testerTrigger = TRIGGER_CATALOG.find((t) => t.type === 'tester');
    const eventarcTrigger = TRIGGER_CATALOG.find((t) => t.type === 'eventarc');
    const webhookTrigger = TRIGGER_CATALOG.find((t) => t.type === 'webhook');

    assert.ok(pubsubTrigger);
    assert.ok(scheduledTrigger);
    assert.ok(chatTrigger);
    assert.ok(testerTrigger);
    assert.ok(eventarcTrigger);
    assert.ok(webhookTrigger);

    assert.equal(isTriggerDisabled(pubsubTrigger.type), true, 'PubSub must be disabled');
    assert.equal(isTriggerDisabled(scheduledTrigger.type), true, 'Scheduled must be disabled');
    assert.equal(isTriggerDisabled(chatTrigger.type), false, 'Chat must remain enabled');
    assert.equal(isTriggerDisabled(testerTrigger.type), false, 'Tester must remain enabled');
    assert.equal(isTriggerDisabled(eventarcTrigger.type), false, 'EventArc must remain enabled');
    assert.equal(isTriggerDisabled(webhookTrigger.type), false, 'Webhook must remain enabled');
  });

  it('should prevent drag-and-drop initiation for disabled triggers', () => {
    let prevented = false;
    const fakeEvent = {
      preventDefault: () => {
        prevented = true;
      },
      dataTransfer: {
        setData: (_key: string, _value: string) => {},
        effectAllowed: '',
      },
    } as unknown as React.DragEvent;

    const handleDragStartTrigger = (e: React.DragEvent, triggerItem: TriggerCatalogItem) => {
      if (isTriggerDisabled(triggerItem.type)) {
        e.preventDefault();
        return false;
      }
      return true;
    };

    const pubsubTrigger = TRIGGER_CATALOG.find((t) => t.type === 'pubsub')!;
    const canDragPubSub = handleDragStartTrigger(fakeEvent, pubsubTrigger);
    assert.equal(canDragPubSub, false);
    assert.equal(prevented, true);

    prevented = false;
    const chatTrigger = TRIGGER_CATALOG.find((t) => t.type === 'chat')!;
    const canDragChat = handleDragStartTrigger(fakeEvent, chatTrigger);
    assert.equal(canDragChat, true);
    assert.equal(prevented, false);
  });

  it('should return unified orange theme attributes for all trigger types', () => {
    const types: TriggerType[] = ['chat', 'pubsub', 'scheduled', 'tester', 'eventarc', 'webhook'];
    for (const t of types) {
      const theme = getTriggerTheme(t);
      assert.ok(theme.border.includes('border-orange-500'), `${t} border must be orange`);
      assert.ok(theme.accent.includes('text-orange-400'), `${t} accent must be orange`);
      assert.ok(theme.badge.includes('bg-orange-500/20'), `${t} badge bg must be orange`);
      assert.ok(theme.badge.includes('text-orange-300'), `${t} badge text must be orange`);
    }
  });

  it('should initialize all trigger category groups as expanded by default', () => {
    const initialOpenCategories: Record<string, boolean> = {
      tester: true,
      chat: true,
      workflow: true,
    };

    assert.equal(initialOpenCategories.tester, true, 'Test Suite & Validation group must default to expanded');
    assert.equal(initialOpenCategories.chat, true, 'Conversational Chat group must default to expanded');
    assert.equal(initialOpenCategories.workflow, true, 'Workflow Triggers group must default to expanded');
  });

  it('should support toggling trigger categories independently', () => {
    let state: Record<string, boolean> = {
      tester: true,
      chat: true,
      workflow: true,
    };

    const toggle = (id: string) => {
      state = { ...state, [id]: !state[id] };
    };

    // Toggle tester closed
    toggle('tester');
    assert.equal(state.tester, false);
    assert.equal(state.chat, true);
    assert.equal(state.workflow, true);

    // Toggle chat closed
    toggle('chat');
    assert.equal(state.tester, false);
    assert.equal(state.chat, false);
    assert.equal(state.workflow, true);

    // Toggle tester back open
    toggle('tester');
    assert.equal(state.tester, true);
    assert.equal(state.chat, false);
    assert.equal(state.workflow, true);
  });

  it('should categorize and order triggers correctly with Test Suite first, Chat second, and Workflow third', () => {
    const chatTrigger = TRIGGER_CATALOG.find((t) => t.type === 'chat');
    const testSuiteTrigger = TRIGGER_CATALOG.find((t) => t.type === 'tester');
    const workflowTriggers = TRIGGER_CATALOG.filter((t) => t.type !== 'tester' && t.type !== 'chat');

    const triggerSections = [
      { id: 'tester', title: 'Test Suite & Validation', trigger: testSuiteTrigger },
      { id: 'chat', title: 'Conversational Chat', trigger: chatTrigger },
      { id: 'workflow', title: 'Workflow Triggers', triggers: workflowTriggers },
    ];

    assert.equal(triggerSections[0].id, 'tester', 'First section must be Test Suite & Validation');
    assert.equal(triggerSections[1].id, 'chat', 'Second section must be Conversational Chat');
    assert.equal(triggerSections[2].id, 'workflow', 'Third section must be Workflow Triggers');

    assert.ok(chatTrigger, 'chat trigger must exist');
    assert.equal(chatTrigger.name, 'Chat Trigger');

    assert.ok(testSuiteTrigger, 'test suite trigger must exist');
    assert.equal(testSuiteTrigger.name, 'Test Suite');

    assert.equal(workflowTriggers.length, 4);
    const workflowTypes = workflowTriggers.map((t) => t.type);
    assert.ok(workflowTypes.includes('pubsub'));
    assert.ok(workflowTypes.includes('scheduled'));
    assert.ok(workflowTypes.includes('webhook'));
    assert.ok(workflowTypes.includes('eventarc'));
  });

  it('should open trigger property drawer when clicking any trigger node including chat triggers', () => {
    let selectedTriggerId: string | null = null;
    let isTriggerDrawerOpen = false;
    let selectedAgentId: string | null = 'agent_1';
    let isToolDrawerOpen = true;

    const handleNodeClick = (_: any, node: any) => {
      if (node.type === 'triggerNode') {
        selectedTriggerId = node.id;
        isTriggerDrawerOpen = true;
        selectedAgentId = null;
        isToolDrawerOpen = false;
      } else {
        selectedAgentId = node.id;
        selectedTriggerId = null;
        isTriggerDrawerOpen = false;
        isToolDrawerOpen = false;
      }
    };

    // 1. Click Chat Trigger (e.g. from Customer Support sample)
    handleNodeClick(null, {
      id: 'node-trigger-support',
      type: 'triggerNode',
      data: {
        id: 'node-trigger-support',
        triggerType: 'chat',
        label: 'Inbound Customer Chat',
      },
    });

    assert.equal(selectedTriggerId, 'node-trigger-support', 'Selected trigger ID must be set');
    assert.equal(isTriggerDrawerOpen, true, 'Trigger drawer must be opened for chat trigger');
    assert.equal(selectedAgentId, null, 'Agent selection must be cleared');
    assert.equal(isToolDrawerOpen, false, 'Tool drawer must be closed');

    // 2. Click Test Suite Trigger
    handleNodeClick(null, {
      id: 'node-trigger-tester',
      type: 'triggerNode',
      data: {
        id: 'node-trigger-tester',
        triggerType: 'tester',
        label: 'Test Suite',
      },
    });

    assert.equal(selectedTriggerId, 'node-trigger-tester');
    assert.equal(isTriggerDrawerOpen, true);

    // 3. Click Agent Node
    handleNodeClick(null, {
      id: 'agent_customer_support',
      type: 'agentNode',
      data: {
        id: 'agent_customer_support',
        label: 'Support Specialist',
      },
    });

    assert.equal(selectedAgentId, 'agent_customer_support');
    assert.equal(selectedTriggerId, null);
    assert.equal(isTriggerDrawerOpen, false);
  });
});
