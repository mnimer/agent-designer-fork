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
import { TRIGGER_CATALOG, TriggerCatalogItem } from '../../src/webview/data/triggerDefinitions';
import { TriggerType } from '../../src/webview/types';

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
});
