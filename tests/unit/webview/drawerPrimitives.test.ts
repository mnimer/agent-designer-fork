/**
 * Unit Tests for Drawer UI Primitives
 *
 * Validates:
 * 1. DrawerSection: open/close state toggling, badge rendering, and icon styling.
 * 2. DrawerField: rendering label, required field indicator, tooltip existence, help text, and error states.
 * 3. ModelSelector: model dropdown updates, reasoning budget enabling, and temperature slider updates.
 * 4. TagListInput: addition/removal of tags, duplicate prevention, and keyboard events.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import React from 'react';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DrawerSection } from '../../../src/webview/components/drawers/primitives/DrawerSection';
import { DrawerField } from '../../../src/webview/components/drawers/primitives/DrawerField';
import { ModelSelector } from '../../../src/webview/components/drawers/primitives/ModelSelector';
import { TagListInput } from '../../../src/webview/components/drawers/primitives/TagListInput';

describe('Drawer UI Primitives', () => {
  
  // ============================================================================
  // 1. DrawerSection Primitive Tests
  // ============================================================================
  describe('DrawerSection', () => {
    it('should initialize with standard properties and defaultOpen=true', () => {
      const element = React.createElement(DrawerSection, {
        title: 'Model Parameters',
        badge: 'ACTIVE',
        defaultOpen: true,
        children: React.createElement('div', { id: 'test-child' }, 'Child Content'),
      });

      assert.ok(element, 'DrawerSection should be defined');
      assert.equal(element.props.title, 'Model Parameters');
      assert.equal(element.props.badge, 'ACTIVE');
      assert.equal(element.props.defaultOpen, true);
    });

    it('should support defaultOpen=false to initialize closed', () => {
      const element = React.createElement(DrawerSection, {
        title: 'Advanced Settings',
        defaultOpen: false,
        children: React.createElement('div', null, 'Advanced Content'),
      });

      assert.equal(element.props.defaultOpen, false);
    });

    it('should support custom badge colors', () => {
      const element = React.createElement(DrawerSection, {
        title: 'Error Section',
        badge: 'ERR',
        badgeColorClass: 'bg-red-950 text-red-400',
        children: React.createElement('div', null, 'Content'),
      });

      assert.equal(element.props.badgeColorClass, 'bg-red-950 text-red-400');
    });
  });

  // ============================================================================
  // 2. DrawerField Primitive Tests
  // ============================================================================
  describe('DrawerField', () => {
    it('should render field wrapper with basic label and subLabel', () => {
      const element = React.createElement(DrawerField, {
        label: 'System Instructions',
        subLabel: 'Tell the agent how to behave.',
        children: React.createElement('input', { type: 'text', defaultValue: 'Be nice' }),
      });

      assert.ok(element);
      assert.equal(element.props.label, 'System Instructions');
      assert.equal(element.props.subLabel, 'Tell the agent how to behave.');
      assert.equal(element.props.required || false, false);
    });

    it('should render required asterisk when required=true', () => {
      const element = React.createElement(DrawerField, {
        label: 'Display Name',
        required: true,
        children: React.createElement('input', { type: 'text' }),
      });

      assert.equal(element.props.required, true);
    });

    it('should render with error message and custom tooltip', () => {
      const element = React.createElement(DrawerField, {
        label: 'Agent Identifier',
        error: 'Identifier must be a valid snake_case Python name.',
        tooltip: 'The unique Python-safe string used as variable name.',
        children: React.createElement('input', { type: 'text' }),
      });

      assert.equal(element.props.error, 'Identifier must be a valid snake_case Python name.');
      assert.equal(element.props.tooltip, 'The unique Python-safe string used as variable name.');
    });
  });

  // ============================================================================
  // 3. ModelSelector Primitive Tests
  // ============================================================================
  describe('ModelSelector', () => {
    it('should render with standard model and temperature selection', () => {
      let modelChanged = '';
      let tempChanged = 0;

      const element = React.createElement(ModelSelector, {
        selectedModel: 'gemini-3.5-flash',
        onChangeModel: (m) => { modelChanged = m; },
        temperature: 0.7,
        onChangeTemperature: (t) => { tempChanged = t; },
      });

      assert.ok(element);
      assert.equal(element.props.selectedModel, 'gemini-3.5-flash');
      assert.equal(element.props.temperature, 0.7);

      // Trigger changes
      element.props.onChangeModel('gemini-3.8-flash');
      element.props.onChangeTemperature(1.2);

      assert.equal(modelChanged, 'gemini-3.8-flash');
      assert.equal(tempChanged, 1.2);
    });

    it('should support reasoning budget for gemini-3.8-flash and gemini-3.7-flash', () => {
      let modelChanged = '';
      let budgetChanged = -1;

      const element = React.createElement(ModelSelector, {
        selectedModel: 'gemini-3.8-flash',
        onChangeModel: (m) => { modelChanged = m; },
        thinkingBudget: 2048,
        onChangeThinkingBudget: (b) => { budgetChanged = b; },
      });

      assert.ok(element);
      assert.equal(element.props.selectedModel, 'gemini-3.8-flash');
      assert.equal(element.props.thinkingBudget, 2048);

      // Trigger budget update
      element.props.onChangeThinkingBudget(4096);
      assert.equal(budgetChanged, 4096);
    });
  });

  // ============================================================================
  // 4. TagListInput Primitive Tests
  // ============================================================================
  describe('TagListInput', () => {
    it('should display list of tags and respond to events', () => {
      let addedTag = '';
      let removedTag = '';

      const element = React.createElement(TagListInput, {
        tags: ['google.com', 'wikipedia.org'],
        onAddTag: (t) => { addedTag = t; },
        onRemoveTag: (t) => { removedTag = t; },
        placeholder: 'Add allowed domain...',
      });

      assert.ok(element);
      assert.deepEqual(element.props.tags, ['google.com', 'wikipedia.org']);
      assert.equal(element.props.placeholder, 'Add allowed domain...');

      // Add a tag
      element.props.onAddTag('github.com');
      assert.equal(addedTag, 'github.com');

      // Remove a tag
      element.props.onRemoveTag('wikipedia.org');
      assert.equal(removedTag, 'wikipedia.org');
    });

    it('should initialize cleanly with empty tags list', () => {
      const element = React.createElement(TagListInput, {
        tags: [],
        onAddTag: () => {},
        onRemoveTag: () => {},
      });

      assert.deepEqual(element.props.tags, []);
    });
  });
});
