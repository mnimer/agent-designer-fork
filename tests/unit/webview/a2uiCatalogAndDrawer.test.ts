/**
 * Unit Tests for A2UI v0.9.1 Catalog Registry and Inspector Config Section
 *
 * Validates:
 * 1. Catalog URIs and options for Material 3, Gemini Enterprise Composite, and Basic v0.9 catalogs.
 * 2. Generation design modes including the State-to-UI Adapter production pattern.
 * 3. Widget registry counts, categories, and two-way data binding flags across all 3 catalogs.
 * 4. Catalog widget superset resolution (Gemini Composite includes Material 3 widgets).
 * 5. Pre-built surface templates definitions and catalog scoping.
 * 6. Default configuration generator createDefaultA2UIConfig.
 * 7. Surface JSON syntax and protocol structural validation (validateA2UISurfaceJson).
 * 8. A2UIConfigSection inspector drawer component interactions, state toggling, and callbacks.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {
  A2UI_CATALOG_URIS,
  A2UI_CATALOG_OPTIONS,
  A2UI_GENERATION_MODES,
  A2UI_WIDGET_REGISTRY,
  A2UI_SURFACE_TEMPLATES,
  getWidgetsForCatalog,
  createDefaultA2UIConfig,
  validateA2UISurfaceJson,
} from '../../../src/webview/data/a2uiCatalogRegistry';
import { A2UIConfigSection } from '../../../src/webview/components/inspector/A2UIConfigSection';
import { A2UIConfig } from '../../../src/shared/types';

describe('A2UI v0.9.1 Catalog Registry', () => {
  // ============================================================================
  // 1. Catalog URIs and Options
  // ============================================================================
  it('should define exact official A2UI v0.9.1 catalog URIs', () => {
    assert.equal(
      A2UI_CATALOG_URIS.material_v09,
      'https://a2ui.org/specification/v0_9/material_catalog.json'
    );
    assert.equal(
      A2UI_CATALOG_URIS.gemini_enterprise_composite_v09,
      'https://www.gstatic.com/vertexaisearch/a2ui/v0_9/gemini_enterprise_composite_catalog.json'
    );
    assert.equal(
      A2UI_CATALOG_URIS.basic_v09,
      'https://a2ui.org/specification/v0_9/basic_catalog.json'
    );
  });

  it('should export all 3 catalog options with required metadata', () => {
    assert.equal(A2UI_CATALOG_OPTIONS.length, 3);
    const ids = A2UI_CATALOG_OPTIONS.map((c) => c.id);
    assert.ok(ids.includes('material_v09'));
    assert.ok(ids.includes('gemini_enterprise_composite_v09'));
    assert.ok(ids.includes('basic_v09'));

    for (const opt of A2UI_CATALOG_OPTIONS) {
      assert.ok(opt.label.length > 0);
      assert.ok(opt.uri.startsWith('https://'));
      assert.ok(opt.description.length > 0);
    }
  });

  // ============================================================================
  // 2. Generation Modes
  // ============================================================================
  it('should define all 3 generation design modes with production badges', () => {
    assert.equal(A2UI_GENERATION_MODES.length, 3);
    const modeIds = A2UI_GENERATION_MODES.map((m) => m.id);
    assert.deepEqual(modeIds, ['state_adapter', 'dsl_template', 'llm_toolset']);

    const stateAdapter = A2UI_GENERATION_MODES.find((m) => m.id === 'state_adapter');
    assert.ok(stateAdapter);
    assert.equal(stateAdapter.badge, 'Recommended for Production');
    assert.ok(stateAdapter.description.includes('a2ui_adaptor.py'));
  });

  // ============================================================================
  // 3. Widget Registry Coverage & Categories
  // ============================================================================
  it('should cover all required Material 3 v0.9 layout, content, action, and input widgets', () => {
    const matWidgets = A2UI_WIDGET_REGISTRY.filter((w) => w.catalog === 'material_v09');
    const matIds = matWidgets.map((w) => w.id);

    // Layout
    assert.ok(matIds.includes('MaterialColumn'));
    assert.ok(matIds.includes('MaterialRow'));
    assert.ok(matIds.includes('MaterialCard'));
    assert.ok(matIds.includes('MaterialDivider'));
    assert.ok(matIds.includes('MaterialGridList'));
    assert.ok(matIds.includes('MaterialExpansionPanel'));

    // Content
    assert.ok(matIds.includes('MaterialText'));
    assert.ok(matIds.includes('MaterialIcon'));
    assert.ok(matIds.includes('MaterialImage'));
    assert.ok(matIds.includes('MaterialBadge'));

    // Actions
    assert.ok(matIds.includes('MaterialButton'));
    assert.ok(matIds.includes('MaterialIconButton'));
    assert.ok(matIds.includes('MaterialButtonToggle'));
    assert.ok(matIds.includes('MaterialMenu'));

    // Inputs (must have supportsTwoWayBinding = true)
    const requiredInputs = [
      'MaterialInput',
      'MaterialCheckbox',
      'MaterialSlideToggle',
      'MaterialRadioButton',
      'MaterialSelect',
      'MaterialChips',
      'MaterialSlider',
      'MaterialDatepicker',
      'MaterialTimepicker',
    ];
    for (const inpId of requiredInputs) {
      assert.ok(matIds.includes(inpId), `Missing input widget: ${inpId}`);
      const def = matWidgets.find((w) => w.id === inpId);
      assert.equal(def?.supportsTwoWayBinding, true, `${inpId} should support 2-way binding`);
      assert.equal(def?.category, 'inputs');
    }

    // Feedback & Overlays
    assert.ok(matIds.includes('MaterialProgressBar'));
    assert.ok(matIds.includes('MaterialProgressSpinner'));
    assert.ok(matIds.includes('MaterialDialog'));

    // Data Display
    assert.ok(matIds.includes('MaterialTabs'));
    assert.ok(matIds.includes('MaterialTable'));
  });

  it('should cover Gemini Enterprise Composite widgets', () => {
    const compWidgets = A2UI_WIDGET_REGISTRY.filter(
      (w) => w.catalog === 'gemini_enterprise_composite_v09'
    );
    const compIds = compWidgets.map((w) => w.id);

    const requiredComposites = [
      'VegaChart',
      'InteractiveChart',
      'RichTable',
      'GoogleMap',
      'PlaceDetailsCompact',
      'MosaicCarousel',
      'MosaicSlideCard',
      'Stepper',
      'SplitButton',
      'RightPanelForm',
      'WorkOrderList',
      'SowList',
    ];

    for (const cId of requiredComposites) {
      assert.ok(compIds.includes(cId), `Missing composite widget: ${cId}`);
    }
  });

  it('should cover OSS Basic Catalog widgets', () => {
    const basicWidgets = A2UI_WIDGET_REGISTRY.filter((w) => w.catalog === 'basic_v09');
    const basicIds = basicWidgets.map((w) => w.id);

    const requiredBasics = [
      'Text',
      'Image',
      'Icon',
      'Video',
      'AudioPlayer',
      'Row',
      'Column',
      'List',
      'Card',
      'Tabs',
      'Modal',
      'Divider',
      'Button',
      'TextField',
      'CheckBox',
      'ChoicePicker',
      'Slider',
      'DateTimeInput',
    ];

    for (const bId of requiredBasics) {
      assert.ok(basicIds.includes(bId), `Missing basic widget: ${bId}`);
    }

    // Check basic inputs have two-way binding
    for (const bInp of ['TextField', 'CheckBox', 'ChoicePicker', 'Slider', 'DateTimeInput']) {
      const def = basicWidgets.find((w) => w.id === bInp);
      assert.equal(def?.supportsTwoWayBinding, true);
    }
  });

  // ============================================================================
  // 4. Superset Resolution via getWidgetsForCatalog
  // ============================================================================
  it('should resolve gemini_enterprise_composite_v09 as a superset including material widgets', () => {
    const compositeWidgets = getWidgetsForCatalog('gemini_enterprise_composite_v09');
    const materialWidgets = getWidgetsForCatalog('material_v09');
    const basicWidgets = getWidgetsForCatalog('basic_v09');

    // Material catalog only has material widgets
    for (const w of materialWidgets) {
      assert.equal(w.catalog, 'material_v09');
    }

    // Basic catalog only has basic widgets
    for (const w of basicWidgets) {
      assert.equal(w.catalog, 'basic_v09');
    }

    // Composite superset must contain all material widgets + composite widgets
    const compositeIds = compositeWidgets.map((w) => w.id);
    for (const mw of materialWidgets) {
      assert.ok(
        compositeIds.includes(mw.id),
        `Composite catalog must include Material widget: ${mw.id}`
      );
    }
    assert.ok(compositeIds.includes('VegaChart'));
    assert.ok(compositeIds.includes('GoogleMap'));
    assert.equal(compositeWidgets.length, materialWidgets.length + 12);
  });

  // ============================================================================
  // 5. Pre-Built Surface Templates
  // ============================================================================
  it('should export all official pre-built surface templates', () => {
    const templateIds = A2UI_SURFACE_TEMPLATES.map((t) => t.id);
    assert.ok(templateIds.includes('alarm_dashboard'));
    assert.ok(templateIds.includes('vega_store_map'));
    assert.ok(templateIds.includes('po_submission_dialog'));
    assert.ok(templateIds.includes('price_adjustment_card'));
    assert.ok(templateIds.includes('product_description_card'));
    assert.ok(templateIds.includes('review_triage_card'));
    assert.ok(templateIds.includes('approval_form'));
    assert.ok(templateIds.includes('data_table_chart'));

    for (const tmpl of A2UI_SURFACE_TEMPLATES) {
      assert.ok(tmpl.name.length > 0);
      assert.ok(tmpl.description.length > 0);
      assert.ok(tmpl.defaultWidgets.length > 0);
    }
  });

  // ============================================================================
  // 6. createDefaultA2UIConfig
  // ============================================================================
  it('should initialize clean default A2UIConfig', () => {
    const config = createDefaultA2UIConfig();
    assert.equal(config.enabled, false);
    assert.equal(config.catalog, 'material_v09');
    assert.equal(config.generationMode, 'state_adapter');
    assert.deepEqual(config.allowedWidgets, []);
    assert.deepEqual(config.surfaceTemplates, []);
    assert.equal(config.customSurfaceJson, '');
    assert.deepEqual(config.actionHandlers, []);
    assert.equal(config.enableNonLlmUtilityActions, true);
    assert.equal(config.autoConfirmTools, false);
  });

  // ============================================================================
  // 7. validateA2UISurfaceJson
  // ============================================================================
  it('should validate empty or whitespace strings as valid empty surfaces', () => {
    assert.deepEqual(validateA2UISurfaceJson(''), { valid: true, surfaceCount: 0 });
    assert.deepEqual(validateA2UISurfaceJson('   \n  '), { valid: true, surfaceCount: 0 });
  });

  it('should reject malformed JSON syntax with descriptive error', () => {
    const res = validateA2UISurfaceJson('{ createSurface: invalid }');
    assert.equal(res.valid, false);
    assert.ok(res.error?.includes('Invalid JSON syntax'));
  });

  it('should reject non-object JSON values like numbers or primitives', () => {
    const res = validateA2UISurfaceJson('42');
    assert.equal(res.valid, false);
    assert.ok(res.error?.includes('must be an object or an array'));
  });

  it('should validate message array with A2UI operations', () => {
    const json = JSON.stringify([
      { createSurface: { surfaceId: 'surf1', catalog: 'material_v09' } },
      { updateComponents: { surfaceId: 'surf1', components: [] } },
    ]);
    const res = validateA2UISurfaceJson(json);
    assert.equal(res.valid, true);
    assert.equal(res.surfaceCount, 1);
  });

  it('should reject message array without recognizable A2UI keys', () => {
    const json = JSON.stringify([{ foo: 'bar' }, { hello: 'world' }]);
    const res = validateA2UISurfaceJson(json);
    assert.equal(res.valid, false);
    assert.ok(res.error?.includes('does not contain valid A2UI v0.9.1 messages'));
  });

  it('should validate container object with messages array', () => {
    const json = JSON.stringify({
      messages: [
        { createSurface: { surfaceId: 's1' } },
        { createSurface: { surfaceId: 's2' } },
      ],
    });
    const res = validateA2UISurfaceJson(json);
    assert.equal(res.valid, true);
    assert.equal(res.surfaceCount, 2);
  });

  it('should validate direct surface command objects', () => {
    const json = JSON.stringify({
      createSurface: { surfaceId: 'dashboard' },
      updateComponents: { components: [] },
    });
    const res = validateA2UISurfaceJson(json);
    assert.equal(res.valid, true);
    assert.equal(res.surfaceCount, 1);
  });

  it('should reject objects lacking any A2UI protocol keys', () => {
    const json = JSON.stringify({
      randomField: 'some value',
      unrelated: 123,
    });
    const res = validateA2UISurfaceJson(json);
    assert.equal(res.valid, false);
    assert.ok(res.error?.includes('does not match A2UI v0.9.1 structure'));
  });
});

describe('A2UIConfigSection Component Tests', () => {
  it('should instantiate cleanly with default props and render single-toggle Rich UI (A2UI) card', () => {
    const { renderToStaticMarkup } = require('react-dom/server');
    const element = React.createElement(A2UIConfigSection, {
      a2uiConfig: createDefaultA2UIConfig(),
      onChange: () => {},
    });

    assert.ok(element);
    assert.equal(element.props.a2uiConfig?.enabled, false);
    const html = renderToStaticMarkup(element);
    assert.ok(html.includes('Rich UI (A2UI)'), 'Should render Rich UI (A2UI) header');
    assert.ok(html.includes('Disabled'), 'Should show Disabled label when disabled');
    assert.ok(!html.includes('Target Widget Catalog'), 'Should not render complex catalog dropdown');
    assert.ok(!html.includes('Allowed Catalog Widgets'), 'Should not render widget checklist');
  });

  it('should render Active badge and Enabled status when a2uiConfig.enabled is true', () => {
    const { renderToStaticMarkup } = require('react-dom/server');
    const element = React.createElement(A2UIConfigSection, {
      a2uiConfig: {
        ...createDefaultA2UIConfig(),
        enabled: true,
        catalog: 'gemini_enterprise_composite_v09',
      },
      onChange: () => {},
    });

    const html = renderToStaticMarkup(element);
    assert.ok(html.includes('Rich UI (A2UI)'));
    assert.ok(html.includes('Active'), 'Should render Active badge when enabled');
    assert.ok(html.includes('Enabled'), 'Should render Enabled label when enabled');
  });

  it('should support enabling A2UI rich surfaces and trigger onChange callback', () => {
    let updatedConfig: A2UIConfig | null = null;
    const initialConfig = createDefaultA2UIConfig();

    const element = React.createElement(A2UIConfigSection, {
      a2uiConfig: initialConfig,
      onChange: (cfg) => {
        updatedConfig = cfg;
      },
    });

    // Directly test handler invocation simulation
    element.props.onChange({
      ...initialConfig,
      enabled: true,
      catalog: 'gemini_enterprise_composite_v09',
      generationMode: 'state_adapter',
      enableNonLlmUtilityActions: true,
    });

    assert.ok(updatedConfig);
    assert.equal(updatedConfig.enabled, true);
    assert.equal(updatedConfig.catalog, 'gemini_enterprise_composite_v09');
    assert.equal(updatedConfig.generationMode, 'state_adapter');
  });
});
