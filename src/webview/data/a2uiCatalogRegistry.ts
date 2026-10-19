/**
 * A2UI v0.9.1 Widget Catalog Registry & Specification Definitions
 *
 * This module defines the canonical A2UI (Agent-to-User Interface v0.9.1) catalog URIs,
 * widget specifications, generation modes, and surface templates for the Agent Flow Designer.
 * It serves as the single source of truth for runtime component catalogs in the webview.
 *
 * Architectural Decisions:
 * 1. Catalog Tiering: Catalogs are partitioned into Material 3 (enterprise standard),
 *    Gemini Enterprise Composite (high-order analytical components like VegaChart and GoogleMap),
 *    and Basic (universal OSS primitive widgets).
 * 2. Superset Resolution: The Gemini Enterprise Composite catalog inherently inherits and includes
 *    all Material v0.9 widgets so composites can nest standard layout, input, and action components.
 * 3. Two-Way Data Binding: Input widgets are explicitly flagged with `supportsTwoWayBinding: true`
 *    to drive reactive JSON pointer data model synchronization in the runner surface renderer.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import {
  A2UICatalogType,
  A2UIGenerationMode,
  A2UIWidgetDefinition,
  A2UISurfaceTemplate,
  A2UIConfig,
} from '../../shared/types';

// ============================================================================
// 1. Official A2UI v0.9.1 Catalog URIs
// ============================================================================

export const A2UI_CATALOG_URIS: Record<A2UICatalogType, string> = {
  material_v09: 'https://a2ui.org/specification/v0_9/material_catalog.json',
  gemini_enterprise_composite_v09:
    'https://www.gstatic.com/vertexaisearch/a2ui/v0_9/gemini_enterprise_composite_catalog.json',
  basic_v09: 'https://a2ui.org/specification/v0_9/basic_catalog.json',
};

export interface A2UICatalogOption {
  id: A2UICatalogType;
  label: string;
  uri: string;
  description: string;
}

export const A2UI_CATALOG_OPTIONS: A2UICatalogOption[] = [
  {
    id: 'material_v09',
    label: 'Google Material 3 Catalog (v0.9.1)',
    uri: A2UI_CATALOG_URIS.material_v09,
    description:
      'Standard Material Design 3 interactive components for enterprise agents (Cards, Forms, Tables, Dialogs).',
  },
  {
    id: 'gemini_enterprise_composite_v09',
    label: 'Gemini Enterprise Composite Catalog (v0.9.1)',
    uri: A2UI_CATALOG_URIS.gemini_enterprise_composite_v09,
    description:
      'High-order analytical and workflow components (Vega charts, Google Maps, Work Orders, Steppers, Carousel).',
  },
  {
    id: 'basic_v09',
    label: 'A2UI Open Standard Basic Catalog (v0.9.1)',
    uri: A2UI_CATALOG_URIS.basic_v09,
    description:
      'Lightweight cross-platform basic widgets for universal agent-to-user surface generation.',
  },
];

// ============================================================================
// 2. A2UI v0.9.1 Generation Modes
// ============================================================================

export interface A2UIGenerationModeOption {
  id: A2UIGenerationMode;
  label: string;
  badge?: string;
  description: string;
}

export const A2UI_GENERATION_MODES: A2UIGenerationModeOption[] = [
  {
    id: 'state_adapter',
    label: 'State-to-UI Adapter Pattern',
    badge: 'Recommended for Production',
    description:
      'Deterministic python generation via a2ui_adaptor.py from session.state. Safe, fast, zero hallucinated schemas.',
  },
  {
    id: 'dsl_template',
    label: 'Declarative DSL Template Pattern',
    description:
      'Pre-authored JSON surface templates hydrated with dynamic runtime variables and session values.',
  },
  {
    id: 'llm_toolset',
    label: 'LLM Component Toolset Pattern',
    description:
      'Dynamic on-the-fly UI construction where LLM calls granular component creation tools.',
  },
];

// ============================================================================
// 3. A2UI v0.9.1 Widget Catalog Registry
// ============================================================================

export const A2UI_WIDGET_REGISTRY: A2UIWidgetDefinition[] = [
  // --------------------------------------------------------------------------
  // Material Catalog (material_v09) - Layout
  // --------------------------------------------------------------------------
  {
    id: 'MaterialColumn',
    name: 'Material Column',
    category: 'layout',
    catalog: 'material_v09',
    description: 'Vertical layout container with 8pt spacing and alignment options',
    properties: ['alignment', 'gap', 'padding', 'children'],
  },
  {
    id: 'MaterialRow',
    name: 'Material Row',
    category: 'layout',
    catalog: 'material_v09',
    description: 'Horizontal flex container with wrapping and alignment',
    properties: ['alignment', 'gap', 'wrap', 'children'],
  },
  {
    id: 'MaterialCard',
    name: 'Material Card',
    category: 'layout',
    catalog: 'material_v09',
    description: 'Elevated or outlined content card with header, media, and body',
    properties: ['variant', 'elevation', 'title', 'subtitle', 'children'],
  },
  {
    id: 'MaterialDivider',
    name: 'Material Divider',
    category: 'layout',
    catalog: 'material_v09',
    description: 'Visual separating line with optional inset and orientation',
    properties: ['inset', 'orientation', 'thickness'],
  },
  {
    id: 'MaterialGridList',
    name: 'Material Grid List',
    category: 'layout',
    catalog: 'material_v09',
    description: 'Responsive multi-column grid list layout',
    properties: ['cols', 'rowHeight', 'gutterSize', 'children'],
  },
  {
    id: 'MaterialExpansionPanel',
    name: 'Material Expansion Panel',
    category: 'layout',
    catalog: 'material_v09',
    description: 'Collapsible accordion panel with expandable details',
    properties: ['title', 'description', 'expanded', 'children'],
  },

  // --------------------------------------------------------------------------
  // Material Catalog (material_v09) - Content
  // --------------------------------------------------------------------------
  {
    id: 'MaterialText',
    name: 'Material Text',
    category: 'content',
    catalog: 'material_v09',
    description: 'Typography element supporting headers, body text, and captions',
    properties: ['text', 'variant', 'color', 'align'],
  },
  {
    id: 'MaterialIcon',
    name: 'Material Icon',
    category: 'content',
    catalog: 'material_v09',
    description: 'Material Symbol or vector icon with color and size',
    properties: ['icon', 'size', 'color'],
  },
  {
    id: 'MaterialImage',
    name: 'Material Image',
    category: 'content',
    catalog: 'material_v09',
    description: 'Responsive media image with aspect ratio and fallback',
    properties: ['src', 'alt', 'aspectRatio', 'fit'],
  },
  {
    id: 'MaterialBadge',
    name: 'Material Badge',
    category: 'content',
    catalog: 'material_v09',
    description: 'Status pill badge or notification badge',
    properties: ['label', 'color', 'variant'],
  },

  // --------------------------------------------------------------------------
  // Material Catalog (material_v09) - Actions
  // --------------------------------------------------------------------------
  {
    id: 'MaterialButton',
    name: 'Material Button',
    category: 'actions',
    catalog: 'material_v09',
    description: 'Interactive button triggering agent actions with context payloads',
    properties: ['label', 'variant', 'action', 'disabled', 'icon'],
  },
  {
    id: 'MaterialIconButton',
    name: 'Material Icon Button',
    category: 'actions',
    catalog: 'material_v09',
    description: 'Compact icon button for toolbars and quick actions',
    properties: ['icon', 'action', 'tooltip', 'disabled'],
  },
  {
    id: 'MaterialButtonToggle',
    name: 'Material Button Toggle',
    category: 'actions',
    catalog: 'material_v09',
    description: 'Single or multi-select segmented button group',
    properties: ['options', 'value', 'multiple', 'action'],
  },
  {
    id: 'MaterialMenu',
    name: 'Material Menu',
    category: 'actions',
    catalog: 'material_v09',
    description: 'Dropdown menu with actionable list items',
    properties: ['trigger', 'items', 'action'],
  },

  // --------------------------------------------------------------------------
  // Material Catalog (material_v09) - Inputs (Two-Way Binding)
  // --------------------------------------------------------------------------
  {
    id: 'MaterialInput',
    name: 'Material Input',
    category: 'inputs',
    catalog: 'material_v09',
    description: 'Text input field with two-way data model binding',
    properties: ['label', 'value', 'placeholder', 'helperText', 'required'],
    supportsTwoWayBinding: true,
  },
  {
    id: 'MaterialCheckbox',
    name: 'Material Checkbox',
    category: 'inputs',
    catalog: 'material_v09',
    description: 'Boolean checkbox with two-way data model binding',
    properties: ['label', 'checked', 'disabled'],
    supportsTwoWayBinding: true,
  },
  {
    id: 'MaterialSlideToggle',
    name: 'Material Slide Toggle',
    category: 'inputs',
    catalog: 'material_v09',
    description: 'Switch toggle with two-way data model binding',
    properties: ['label', 'checked', 'disabled'],
    supportsTwoWayBinding: true,
  },
  {
    id: 'MaterialRadioButton',
    name: 'Material Radio Button',
    category: 'inputs',
    catalog: 'material_v09',
    description: 'Single-choice radio button group',
    properties: ['name', 'options', 'value'],
    supportsTwoWayBinding: true,
  },
  {
    id: 'MaterialSelect',
    name: 'Material Select',
    category: 'inputs',
    catalog: 'material_v09',
    description: 'Dropdown selection menu with two-way data model binding',
    properties: ['label', 'options', 'value', 'placeholder'],
    supportsTwoWayBinding: true,
  },
  {
    id: 'MaterialChips',
    name: 'Material Chips',
    category: 'inputs',
    catalog: 'material_v09',
    description: 'Interactive chips for filtering or multi-selection',
    properties: ['chips', 'selected', 'removable'],
    supportsTwoWayBinding: true,
  },
  {
    id: 'MaterialSlider',
    name: 'Material Slider',
    category: 'inputs',
    catalog: 'material_v09',
    description: 'Continuous or discrete range slider with two-way binding',
    properties: ['min', 'max', 'step', 'value'],
    supportsTwoWayBinding: true,
  },
  {
    id: 'MaterialDatepicker',
    name: 'Material Datepicker',
    category: 'inputs',
    catalog: 'material_v09',
    description: 'Calendar date selection with two-way binding',
    properties: ['label', 'value', 'minDate', 'maxDate'],
    supportsTwoWayBinding: true,
  },
  {
    id: 'MaterialTimepicker',
    name: 'Material Timepicker',
    category: 'inputs',
    catalog: 'material_v09',
    description: 'Time selection input with two-way binding',
    properties: ['label', 'value', 'format'],
    supportsTwoWayBinding: true,
  },

  // --------------------------------------------------------------------------
  // Material Catalog (material_v09) - Feedback & Overlays
  // --------------------------------------------------------------------------
  {
    id: 'MaterialProgressBar',
    name: 'Material Progress Bar',
    category: 'feedback',
    catalog: 'material_v09',
    description: 'Linear determinate or indeterminate progress bar',
    properties: ['value', 'mode', 'color'],
  },
  {
    id: 'MaterialProgressSpinner',
    name: 'Material Progress Spinner',
    category: 'feedback',
    catalog: 'material_v09',
    description: 'Circular loading spinner indicator',
    properties: ['value', 'mode', 'diameter'],
  },
  {
    id: 'MaterialDialog',
    name: 'Material Dialog',
    category: 'feedback',
    catalog: 'material_v09',
    description: 'Modal dialog overlay with title, content, and action buttons',
    properties: ['title', 'open', 'actions', 'children'],
  },

  // --------------------------------------------------------------------------
  // Material Catalog (material_v09) - Data Display
  // --------------------------------------------------------------------------
  {
    id: 'MaterialTabs',
    name: 'Material Tabs',
    category: 'data_display',
    catalog: 'material_v09',
    description: 'Tab navigation container with multiple tab panels',
    properties: ['tabs', 'selectedIndex', 'children'],
  },
  {
    id: 'MaterialTable',
    name: 'Material Table',
    category: 'data_display',
    catalog: 'material_v09',
    description: 'Tabular data display with sortable columns and pagination',
    properties: ['columns', 'rows', 'sortable', 'pagination'],
  },

  // --------------------------------------------------------------------------
  // Gemini Enterprise Composite Catalog (gemini_enterprise_composite_v09)
  // --------------------------------------------------------------------------
  {
    id: 'VegaChart',
    name: 'Vega-Lite Chart',
    category: 'composite',
    catalog: 'gemini_enterprise_composite_v09',
    description: 'Vega-Lite v5 declarative visual chart with interactive tooltips and zooming',
    properties: ['spec', 'title', 'description', 'data'],
  },
  {
    id: 'InteractiveChart',
    name: 'Interactive Chart',
    category: 'composite',
    catalog: 'gemini_enterprise_composite_v09',
    description: 'High-level business chart with drilldown actions',
    properties: ['type', 'data', 'xAxis', 'yAxis', 'actions'],
  },
  {
    id: 'RichTable',
    name: 'Rich Enterprise Table',
    category: 'data_display',
    catalog: 'gemini_enterprise_composite_v09',
    description: 'Advanced enterprise data grid with filtering, column resizing, and row selection',
    properties: ['columns', 'rows', 'selectable', 'searchable'],
  },
  {
    id: 'GoogleMap',
    name: 'Google Map Surface',
    category: 'composite',
    catalog: 'gemini_enterprise_composite_v09',
    description: 'Interactive Google Map surface with markers, polylines, and zoom controls',
    properties: ['center', 'zoom', 'markers', 'apiKey'],
  },
  {
    id: 'PlaceDetailsCompact',
    name: 'Place Details Compact',
    category: 'composite',
    catalog: 'gemini_enterprise_composite_v09',
    description: 'Google Places summary card with rating, address, and photo',
    properties: ['placeId', 'name', 'rating', 'address', 'photos'],
  },
  {
    id: 'MosaicCarousel',
    name: 'Mosaic Carousel',
    category: 'composite',
    catalog: 'gemini_enterprise_composite_v09',
    description: 'Multi-card horizontal carousel slider for product or media recommendations',
    properties: ['items', 'itemTemplate', 'autoPlay'],
  },
  {
    id: 'MosaicSlideCard',
    name: 'Mosaic Slide Card',
    category: 'composite',
    catalog: 'gemini_enterprise_composite_v09',
    description: 'Individual slide card within a MosaicCarousel container',
    properties: ['title', 'subtitle', 'image', 'action'],
  },
  {
    id: 'Stepper',
    name: 'Stepper Workflow',
    category: 'composite',
    catalog: 'gemini_enterprise_composite_v09',
    description: 'Multi-step workflow progress indicator and navigation',
    properties: ['steps', 'activeStep', 'linear'],
  },
  {
    id: 'SplitButton',
    name: 'Split Button',
    category: 'actions',
    catalog: 'gemini_enterprise_composite_v09',
    description: 'Dual-action button with primary click and dropdown secondary options',
    properties: ['primaryAction', 'menuActions'],
  },
  {
    id: 'RightPanelForm',
    name: 'Right Panel Form',
    category: 'composite',
    catalog: 'gemini_enterprise_composite_v09',
    description: 'Slide-out side panel form for detailed object editing',
    properties: ['title', 'fields', 'submitAction', 'cancelAction'],
  },
  {
    id: 'WorkOrderList',
    name: 'Work Order List',
    category: 'composite',
    catalog: 'gemini_enterprise_composite_v09',
    description: 'Operational work order queue with priority indicators and triage buttons',
    properties: ['orders', 'statusFilter', 'onTriage'],
  },
  {
    id: 'SowList',
    name: 'SOW List',
    category: 'composite',
    catalog: 'gemini_enterprise_composite_v09',
    description: 'Statement of Work contract list with milestone badges and signoff',
    properties: ['sows', 'client', 'milestones'],
  },

  // --------------------------------------------------------------------------
  // OSS Basic Catalog (basic_v09)
  // --------------------------------------------------------------------------
  {
    id: 'Text',
    name: 'Text',
    category: 'content',
    catalog: 'basic_v09',
    description: 'Standard text element',
    properties: ['text', 'style'],
  },
  {
    id: 'Image',
    name: 'Image',
    category: 'content',
    catalog: 'basic_v09',
    description: 'Basic image renderer',
    properties: ['src', 'alt', 'width', 'height'],
  },
  {
    id: 'Icon',
    name: 'Icon',
    category: 'content',
    catalog: 'basic_v09',
    description: 'Standard icon',
    properties: ['name', 'size'],
  },
  {
    id: 'Video',
    name: 'Video',
    category: 'content',
    catalog: 'basic_v09',
    description: 'HTML5 video player',
    properties: ['src', 'controls', 'autoPlay'],
  },
  {
    id: 'AudioPlayer',
    name: 'Audio Player',
    category: 'content',
    catalog: 'basic_v09',
    description: 'Audio playback player',
    properties: ['src', 'controls'],
  },
  {
    id: 'Row',
    name: 'Row',
    category: 'layout',
    catalog: 'basic_v09',
    description: 'Horizontal flex row',
    properties: ['children', 'gap', 'align'],
  },
  {
    id: 'Column',
    name: 'Column',
    category: 'layout',
    catalog: 'basic_v09',
    description: 'Vertical flex column',
    properties: ['children', 'gap', 'align'],
  },
  {
    id: 'List',
    name: 'List',
    category: 'layout',
    catalog: 'basic_v09',
    description: 'Vertical list of items',
    properties: ['items', 'renderItem'],
  },
  {
    id: 'Card',
    name: 'Card',
    category: 'layout',
    catalog: 'basic_v09',
    description: 'Generic content card',
    properties: ['title', 'children'],
  },
  {
    id: 'Tabs',
    name: 'Tabs',
    category: 'layout',
    catalog: 'basic_v09',
    description: 'Tabbed container',
    properties: ['tabs', 'children'],
  },
  {
    id: 'Modal',
    name: 'Modal',
    category: 'feedback',
    catalog: 'basic_v09',
    description: 'Modal dialog box',
    properties: ['isOpen', 'title', 'children'],
  },
  {
    id: 'Divider',
    name: 'Divider',
    category: 'layout',
    catalog: 'basic_v09',
    description: 'Visual divider line',
    properties: ['orientation'],
  },
  {
    id: 'Button',
    name: 'Button',
    category: 'actions',
    catalog: 'basic_v09',
    description: 'Interactive button',
    properties: ['label', 'action', 'disabled'],
  },
  {
    id: 'TextField',
    name: 'Text Field',
    category: 'inputs',
    catalog: 'basic_v09',
    description: 'Single-line or multiline text input',
    properties: ['value', 'placeholder'],
    supportsTwoWayBinding: true,
  },
  {
    id: 'CheckBox',
    name: 'Checkbox',
    category: 'inputs',
    catalog: 'basic_v09',
    description: 'Toggleable checkbox',
    properties: ['checked', 'label'],
    supportsTwoWayBinding: true,
  },
  {
    id: 'ChoicePicker',
    name: 'Choice Picker',
    category: 'inputs',
    catalog: 'basic_v09',
    description: 'Radio or dropdown choice selector',
    properties: ['options', 'value'],
    supportsTwoWayBinding: true,
  },
  {
    id: 'Slider',
    name: 'Slider',
    category: 'inputs',
    catalog: 'basic_v09',
    description: 'Numeric slider control',
    properties: ['value', 'min', 'max', 'step'],
    supportsTwoWayBinding: true,
  },
  {
    id: 'DateTimeInput',
    name: 'Date Time Input',
    category: 'inputs',
    catalog: 'basic_v09',
    description: 'Date and time picker',
    properties: ['value', 'mode'],
    supportsTwoWayBinding: true,
  },
];

// ============================================================================
// 4. Pre-Built Surface Templates
// ============================================================================

export const A2UI_SURFACE_TEMPLATES: A2UISurfaceTemplate[] = [
  {
    id: 'alarm_dashboard',
    name: 'Alarm Operations Dashboard',
    description: 'Industrial IoT and operations alarm summary dashboard with acknowledgment action.',
    catalog: 'material_v09',
    defaultWidgets: ['MaterialCard', 'MaterialTable', 'MaterialBadge', 'MaterialButton'],
    stateKey: 'alarms',
  },
  {
    id: 'vega_store_map',
    name: 'Store Geo-Map & Vega Analytics',
    description: 'Geographic store location map paired with Vega-Lite sales distribution chart.',
    catalog: 'gemini_enterprise_composite_v09',
    defaultWidgets: ['VegaChart', 'GoogleMap', 'RichTable'],
    stateKey: 'storeLocations',
  },
  {
    id: 'po_submission_dialog',
    name: 'PO Submission & Approval Dialog',
    description: 'Purchase order review and submission dialog with approval routing.',
    catalog: 'material_v09',
    defaultWidgets: ['MaterialDialog', 'MaterialInput', 'MaterialSelect', 'MaterialButton'],
    stateKey: 'purchaseOrder',
  },
  {
    id: 'price_adjustment_card',
    name: 'Interactive Price Adjustment Card',
    description: 'Pricing adjustment surface with interactive discount sliders and confirmation button.',
    catalog: 'material_v09',
    defaultWidgets: ['MaterialCard', 'MaterialSlider', 'MaterialInput', 'MaterialButton'],
    stateKey: 'priceAdjustment',
  },
  {
    id: 'product_description_card',
    name: 'Product Details Card',
    description: 'E-commerce product card with thumbnail, specifications, and add-to-cart action.',
    catalog: 'basic_v09',
    defaultWidgets: ['Card', 'Image', 'Text', 'Button'],
    stateKey: 'product',
  },
  {
    id: 'review_triage_card',
    name: 'Review Sentiment Triage Card',
    description: 'Customer review triage interface for fast sentiment categorization.',
    catalog: 'material_v09',
    defaultWidgets: ['MaterialCard', 'MaterialBadge', 'MaterialText', 'MaterialButtonToggle', 'MaterialButton'],
    stateKey: 'customerReview',
  },
  {
    id: 'approval_form',
    name: 'Managerial Approval Form',
    description: 'Managerial approval form for budget exceptions and access requests.',
    catalog: 'material_v09',
    defaultWidgets: ['MaterialCard', 'MaterialColumn', 'MaterialInput', 'MaterialCheckbox', 'MaterialButton'],
    stateKey: 'approvalRequest',
  },
  {
    id: 'data_table_chart',
    name: 'Dual Enterprise Grid & Vega Chart',
    description: 'Dual view analytics surface pairing an enterprise grid with Vega visual charts.',
    catalog: 'gemini_enterprise_composite_v09',
    defaultWidgets: ['RichTable', 'VegaChart', 'SplitButton'],
    stateKey: 'analyticsReport',
  },
];

// ============================================================================
// 5. Catalog Helpers & Validation
// ============================================================================

/**
 * Returns the widgets available for a given catalog.
 * Note: 'gemini_enterprise_composite_v09' is a superset that includes both
 * composite widgets and all Material v0.9 widgets.
 */
export function getWidgetsForCatalog(catalog: A2UICatalogType): A2UIWidgetDefinition[] {
  if (catalog === 'gemini_enterprise_composite_v09') {
    return A2UI_WIDGET_REGISTRY.filter(
      (w) => w.catalog === 'gemini_enterprise_composite_v09' || w.catalog === 'material_v09'
    );
  }
  return A2UI_WIDGET_REGISTRY.filter((w) => w.catalog === catalog);
}

/**
 * Creates the default configuration object for an agent's A2UI settings.
 */
export function createDefaultA2UIConfig(): A2UIConfig {
  return {
    enabled: false,
    catalog: 'material_v09',
    generationMode: 'state_adapter',
    allowedWidgets: [],
    surfaceTemplates: [],
    customSurfaceJson: '',
    actionHandlers: [],
    enableNonLlmUtilityActions: true,
    autoConfirmTools: false,
  };
}

/**
 * Validates a raw JSON string to ensure it adheres to A2UI v0.9.1 surface protocol structure.
 * Handles both message array payloads and single surface objects.
 */
export function validateA2UISurfaceJson(
  rawJson: string
): { valid: boolean; error?: string; surfaceCount?: number } {
  if (!rawJson || !rawJson.trim()) {
    return { valid: true, surfaceCount: 0 };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(rawJson.trim());
  } catch (err: any) {
    return {
      valid: false,
      error: `Invalid JSON syntax: ${err.message || 'Parsing error'}`,
    };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return {
      valid: false,
      error: 'A2UI surface JSON must be an object or an array of messages.',
    };
  }

  // Check array of messages
  if (Array.isArray(parsed)) {
    if (parsed.length === 0) {
      return { valid: true, surfaceCount: 0 };
    }
    const hasA2UIMsg = parsed.some(
      (m) =>
        m &&
        typeof m === 'object' &&
        (m.createSurface || m.updateComponents || m.updateDataModel || m.deleteSurface || m.surfaceId)
    );
    if (!hasA2UIMsg) {
      return {
        valid: false,
        error:
          'Message array does not contain valid A2UI v0.9.1 messages (expected createSurface, updateComponents, updateDataModel, etc.).',
      };
    }
    const createCount = parsed.filter((m) => m && m.createSurface).length;
    return { valid: true, surfaceCount: Math.max(1, createCount) };
  }

  // Check container object with messages array
  if (Array.isArray(parsed.messages)) {
    const createCount = parsed.messages.filter((m: any) => m && m.createSurface).length;
    return { valid: true, surfaceCount: Math.max(1, createCount) };
  }

  // Check direct surface object
  const validDirectKeys = [
    'createSurface',
    'updateComponents',
    'updateDataModel',
    'deleteSurface',
    'surfaceId',
    'components',
    'rootId',
    'dataModel',
  ];
  const keys = Object.keys(parsed);
  const matched = keys.filter((k) => validDirectKeys.includes(k));

  if (matched.length === 0) {
    return {
      valid: false,
      error:
        'JSON object does not match A2UI v0.9.1 structure. Expected at least one of: ' +
        validDirectKeys.join(', '),
    };
  }

  return { valid: true, surfaceCount: 1 };
}
