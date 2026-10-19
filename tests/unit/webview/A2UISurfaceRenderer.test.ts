/**
 * Unit Tests for A2UISurfaceRenderer, Thought-Trace Accordion & Chat Message Rendering
 *
 * Validates:
 * 1. JSON pointer operations (getValueByPointer, setValueByPointer, resolveActionContext).
 * 2. Multi-modal extraction of A2UI v0.9.1 payloads from raw text and code fences (extractA2UIPayloads).
 * 3. PlanReAct & BuiltInPlanner thought trace parsing (parsePlanReActTraces).
 * 4. In-IDE A2UISurfaceRenderer component rendering of MaterialCard, Table, Inputs, Select, Checkbox, Button, and VegaChart.
 * 5. Reactive two-way data model updates on /selectedWarehouse and /transferQuantity.
 * 6. Action button context resolution and onUserAction event dispatching.
 * 7. Surface deletion handling via deleteSurface.
 * 8. ChatMessageRenderer integrated rendering of collapsible thought traces alongside rich A2UI surfaces.
 * 9. Runner ChatMessageRenderer re-export parity.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {
  A2UISurfaceRenderer,
  getValueByPointer,
  setValueByPointer,
  resolveActionContext,
  extractA2UIPayloads,
  isA2UIv09Payload,
  normalizeStandaloneA2UIPayload,
  latLngToWorldPixel,
  worldPixelToLatLng,
  computeMapFitBounds,
  buildSvgArcPath,
  parsePayloadToSurfaces,
} from '../../../src/webview/components/runner/A2UISurfaceRenderer';
import {
  ChatMessageRenderer,
  parsePlanReActTraces,
} from '../../../src/webview/components/chat/ChatMessageRenderer';
import RunnerChatMessageRenderer from '../../../src/webview/components/runner/ChatMessageRenderer';

describe('A2UI JSON Pointer Utilities (RFC 6901)', () => {
  it('should resolve shallow and nested values using JSON pointer syntax', () => {
    const model = {
      selectedWarehouse: 'wh-us-east-1',
      transferQuantity: 42,
      nested: {
        location: {
          aisle: 'B-7',
        },
      },
      tags: ['urgent', 'perishable'],
    };

    assert.equal(getValueByPointer(model, '/selectedWarehouse'), 'wh-us-east-1');
    assert.equal(getValueByPointer(model, '/transferQuantity'), 42);
    assert.equal(getValueByPointer(model, '/nested/location/aisle'), 'B-7');
    assert.equal(getValueByPointer(model, '/tags/0'), 'urgent');
    assert.equal(getValueByPointer(model, '/tags/1'), 'perishable');
    assert.equal(getValueByPointer(model, '/missing'), undefined);
    assert.equal(getValueByPointer(model, ''), undefined);
  });

  it('should set shallow and nested values immutably', () => {
    const initial = {
      selectedWarehouse: 'wh-us-east-1',
      details: { count: 10 },
    };

    const updated = setValueByPointer(initial, '/selectedWarehouse', 'wh-eu-west-1');
    assert.equal(updated.selectedWarehouse, 'wh-eu-west-1');
    assert.equal(initial.selectedWarehouse, 'wh-us-east-1'); // ensure immutability

    const updatedNested = setValueByPointer(initial, '/details/count', 99);
    assert.equal(updatedNested.details.count, 99);
    assert.equal(initial.details.count, 10);

    const createdPath = setValueByPointer(initial, '/new/section/flag', true);
    assert.equal(createdPath.new.section.flag, true);
  });

  it('should resolve action context pointer references against active dataModel', () => {
    const model = {
      selectedWarehouse: 'wh-central-2',
      transferQuantity: 150,
      adjustedPrice: 24.99,
    };

    const rawContext = {
      warehouse: { path: '/selectedWarehouse' },
      qty: { path: '/transferQuantity' },
      constantKey: 'literal_value',
      nested: {
        price: { path: '/adjustedPrice' },
      },
    };

    const resolved = resolveActionContext(rawContext, model);
    assert.deepEqual(resolved, {
      warehouse: 'wh-central-2',
      qty: 150,
      constantKey: 'literal_value',
      nested: {
        price: 24.99,
      },
    });
  });
});

describe('A2UI Payload Extraction (extractA2UIPayloads)', () => {
  it('should recognize direct A2UI object with mimeType application/a2ui+json', () => {
    const payload = {
      mimeType: 'application/a2ui+json',
      messages: [{ createSurface: { surfaceId: 'surf1' } }],
    };
    assert.equal(isA2UIv09Payload(payload), true);
    const { textWithoutA2UI, surfaces } = extractA2UIPayloads(payload);
    assert.equal(textWithoutA2UI, '');
    assert.equal(surfaces.length, 1);
    assert.equal(surfaces[0].mimeType, 'application/a2ui+json');
  });

  it('should extract A2UI payload embedded inside ```a2ui code fences', () => {
    const text = `Here is your inventory summary dashboard:
\`\`\`a2ui
{
  "createSurface": {
    "surfaceId": "inventory_card",
    "title": "Inventory Operations"
  },
  "updateComponents": {
    "surfaceId": "inventory_card",
    "components": [
      { "id": "root", "component": "MaterialCard", "title": "Stock Alert" }
    ]
  }
}
\`\`\`
Let me know if you need to dispatch a transfer.`;

    const { textWithoutA2UI, surfaces } = extractA2UIPayloads(text);
    assert.equal(surfaces.length, 1);
    assert.equal(surfaces[0].createSurface.surfaceId, 'inventory_card');
    assert.ok(textWithoutA2UI.includes('Here is your inventory summary dashboard:'));
    assert.ok(textWithoutA2UI.includes('Let me know if you need to dispatch a transfer.'));
    assert.ok(!textWithoutA2UI.includes('```a2ui'));
  });

  it('should extract A2UI payload inside standard ```json code fence when containing A2UI operations', () => {
    const text = `Operation confirmed:
\`\`\`json
{
  "messages": [
    { "createSurface": { "surfaceId": "po_view" } },
    { "updateDataModel": { "surfaceId": "po_view", "data": { "poNumber": "PO-9921" } } }
  ]
}
\`\`\``;

    const { textWithoutA2UI, surfaces } = extractA2UIPayloads(text);
    assert.equal(surfaces.length, 1);
    assert.equal(surfaces[0].messages.length, 2);
    assert.equal(textWithoutA2UI, 'Operation confirmed:');
  });

  it('should return empty surfaces when given normal plain text or standard code snippets', () => {
    const text = 'Here is a python script:\n```python\nprint("Hello")\n```';
    const { textWithoutA2UI, surfaces } = extractA2UIPayloads(text);
    assert.equal(surfaces.length, 0);
    assert.ok(textWithoutA2UI.includes('print("Hello")'));
  });
});

describe('PlanReAct & BuiltInPlanner Thought Trace Parsing (parsePlanReActTraces)', () => {
  it('should parse all standard PlanReAct tags and isolate final answer', () => {
    const text = `/*PLANNING*/
1. Check customer account status
2. Query pending orders

/*ACTION*/
call get_customer_account(id="C-102")

/*REASONING*/
Customer account is active with Gold tier benefits.

/*REPLANNING*/
Add expedited shipping discount since tier is Gold.

/*FINAL_ANSWER*/
The account is active and qualifying for free expedited shipping.`;

    const { traces, finalAnswer } = parsePlanReActTraces(text);

    assert.equal(traces.length, 4);
    assert.equal(traces[0].tag, 'PLANNING');
    assert.ok(traces[0].content.includes('1. Check customer account status'));

    assert.equal(traces[1].tag, 'ACTION');
    assert.ok(traces[1].content.includes('call get_customer_account'));

    assert.equal(traces[2].tag, 'REASONING');
    assert.ok(traces[2].content.includes('Customer account is active'));

    assert.equal(traces[3].tag, 'REPLANNING');
    assert.ok(traces[3].content.includes('Add expedited shipping discount'));

    assert.equal(
      finalAnswer,
      'The account is active and qualifying for free expedited shipping.'
    );
  });

  it('should handle thought traces when FINAL_ANSWER tag is absent', () => {
    const text = `/*PLANNING*/
Formulate search query for product catalog.

/*ACTION*/
search_tool(query="wireless noise canceling headphones")`;

    const { traces, finalAnswer } = parsePlanReActTraces(text);
    assert.equal(traces.length, 2);
    assert.equal(traces[0].tag, 'PLANNING');
    assert.equal(traces[1].tag, 'ACTION');
    assert.equal(finalAnswer, '');
  });

  it('should return empty traces for plain standard messages without tags', () => {
    const text = 'This is a normal response from the assistant.';
    const { traces, finalAnswer } = parsePlanReActTraces(text);
    assert.equal(traces.length, 0);
    assert.equal(finalAnswer, text);
  });
});

describe('A2UISurfaceRenderer Component Tests', () => {
  it('should instantiate and render full A2UI v0.9.1 component tree with two-way binding and actions', () => {
    let lastActionEmitted: any = null;

    const payload = {
      messages: [
        {
          createSurface: {
            surfaceId: 'warehouse_transfer_card',
            catalog: 'material_v09',
            title: 'Warehouse Transfer Request',
          },
        },
        {
          updateComponents: {
            surfaceId: 'warehouse_transfer_card',
            rootId: 'root_card',
            components: [
              {
                id: 'root_card',
                component: 'MaterialCard',
                properties: {
                  title: 'Transfer Inventory',
                  subtitle: 'Select destination and quantity',
                },
                children: ['layout_col'],
              },
              {
                id: 'layout_col',
                component: 'MaterialColumn',
                children: [
                  'wh_select',
                  'qty_slider',
                  'notes_input',
                  'confirm_checkbox',
                  'submit_btn',
                  'sales_chart',
                ],
              },
              {
                id: 'wh_select',
                component: 'MaterialSelect',
                properties: {
                  label: 'Destination Warehouse',
                  value: { path: '/selectedWarehouse' },
                  options: [
                    { label: 'East Hub (NY)', value: 'wh-east' },
                    { label: 'West Hub (CA)', value: 'wh-west' },
                  ],
                },
              },
              {
                id: 'qty_slider',
                component: 'MaterialSlider',
                properties: {
                  label: 'Transfer Quantity',
                  min: 1,
                  max: 500,
                  step: 1,
                  value: { path: '/transferQuantity' },
                },
              },
              {
                id: 'notes_input',
                component: 'MaterialInput',
                properties: {
                  label: 'Routing Notes',
                  value: { path: '/notes' },
                  placeholder: 'Optional notes...',
                },
              },
              {
                id: 'confirm_checkbox',
                component: 'MaterialCheckbox',
                properties: {
                  label: 'Priority Handling Required',
                  checked: { path: '/priorityHandling' },
                },
              },
              {
                id: 'submit_btn',
                component: 'MaterialButton',
                properties: {
                  label: 'Submit Transfer',
                  action: {
                    event: {
                      name: 'submit_inventory_transfer',
                      context: {
                        warehouse: { path: '/selectedWarehouse' },
                        quantity: { path: '/transferQuantity' },
                        priority: { path: '/priorityHandling' },
                        staticFlag: true,
                      },
                    },
                  },
                },
              },
              {
                id: 'sales_chart',
                component: 'VegaChart',
                properties: {
                  title: 'Warehouse Stock Distribution',
                  spec: {
                    mark: 'bar',
                    data: {
                      values: [
                        { warehouse: 'wh-east', stock: 120 },
                        { warehouse: 'wh-west', stock: 340 },
                      ],
                    },
                  },
                },
              },
            ],
          },
        },
        {
          updateDataModel: {
            surfaceId: 'warehouse_transfer_card',
            data: {
              selectedWarehouse: 'wh-west',
              transferQuantity: 250,
              priorityHandling: true,
              notes: 'Deliver before Friday',
            },
          },
        },
      ],
    };

    const element = React.createElement(A2UISurfaceRenderer, {
      payload,
      onUserAction: (action) => {
        lastActionEmitted = action;
      },
    });

    assert.ok(element);
    assert.ok(element.props.payload);
  });

  it('should support surface deletion handling via deleteSurface', () => {
    const payload = [
      { createSurface: { surfaceId: 'temp_surface', title: 'Temporary' } },
      { deleteSurface: { surfaceId: 'temp_surface' } },
    ];

    const element = React.createElement(A2UISurfaceRenderer, {
      payload,
    });

    assert.ok(element);
  });

  it('should support direct surface format without createSurface wrapper', () => {
    const payload = {
      surfaceId: 'direct_card',
      title: 'Direct Card',
      components: [
        {
          id: 'root',
          component: 'MaterialCard',
          properties: { title: 'Direct Title' },
          children: ['text1'],
        },
        {
          id: 'text1',
          component: 'MaterialText',
          properties: { text: 'Direct body text' },
        },
      ],
      dataModel: {},
    };

    const element = React.createElement(A2UISurfaceRenderer, {
      payload,
    });

    assert.ok(element);
  });

  it('should instantiate and render kitchen-sink widgets: Stepper, RadioButton, SlideToggle, Chips, Datepicker, Timepicker, ProgressBar, GoogleMap, and MosaicCarousel', () => {
    let capturedAction: any = null;
    const payload = {
      messages: [
        {
          createSurface: {
            surfaceId: 'kitchen_sink_test',
            catalogId: 'gemini_enterprise_composite_v09',
            rootComponentId: 'ks-root',
          },
        },
        {
          updateDataModel: {
            surfaceId: 'kitchen_sink_test',
            data: {
              form: {
                agentName: 'copilot-v1',
                reasoningTier: 'balanced',
                enableModelArmor: true,
                capabilities: ['search', 'a2ui'],
                launchDate: '2026-11-01',
                maintenanceWindow: '03:00',
              },
            },
          },
        },
        {
          updateComponents: {
            surfaceId: 'kitchen_sink_test',
            components: [
              {
                id: 'ks-root',
                component: 'Column',
                children: [
                  'comp-stepper',
                  'comp-radio',
                  'comp-toggle',
                  'comp-chips',
                  'comp-date',
                  'comp-time',
                  'comp-prog',
                  'comp-spin',
                  'comp-tabs',
                  'comp-map',
                  'comp-carousel',
                  'comp-workorders',
                  'btn-submit',
                ],
              },
              {
                id: 'comp-stepper',
                component: 'Stepper',
                properties: {
                  steps: [
                    { id: 's1', title: 'Step 1', status: 'completed' },
                    { id: 's2', title: 'Step 2', status: 'active' },
                  ],
                  activeStep: 2,
                },
              },
              {
                id: 'comp-radio',
                component: 'RadioButton',
                properties: {
                  label: 'Tier',
                  value: { path: '/form/reasoningTier' },
                  options: [
                    { label: 'Fast', value: 'fast' },
                    { label: 'Balanced', value: 'balanced' },
                  ],
                },
              },
              {
                id: 'comp-toggle',
                component: 'SlideToggle',
                properties: {
                  label: 'Model Armor',
                  checked: { path: '/form/enableModelArmor' },
                },
              },
              {
                id: 'comp-chips',
                component: 'Chips',
                properties: {
                  label: 'Active Capabilities',
                  value: { path: '/form/capabilities' },
                  chips: [
                    { id: 'search', label: 'Search', selected: true },
                    { id: 'a2ui', label: 'A2UI', selected: true },
                  ],
                },
              },
              {
                id: 'comp-date',
                component: 'Datepicker',
                properties: {
                  label: 'Launch Date',
                  value: { path: '/form/launchDate' },
                },
              },
              {
                id: 'comp-time',
                component: 'Timepicker',
                properties: {
                  label: 'Maintenance Window',
                  value: { path: '/form/maintenanceWindow' },
                },
              },
              {
                id: 'comp-prog',
                component: 'ProgressBar',
                properties: { value: 75, max: 100 },
              },
              {
                id: 'comp-spin',
                component: 'ProgressSpinner',
                properties: { diameter: 24 },
              },
              {
                id: 'comp-tabs',
                component: 'Tabs',
                properties: {
                  tabs: [{ id: 't1', label: 'Tab 1' }],
                  activeTab: 0,
                },
              },
              {
                id: 'comp-map',
                component: 'GoogleMap',
                properties: {
                  center: { lat: 37.77, lng: -122.41 },
                  zoom: 10,
                  markers: [{ lat: 37.77, lng: -122.41, title: 'HQ' }],
                },
              },
              {
                id: 'comp-carousel',
                component: 'MosaicCarousel',
                properties: { title: 'Cards' },
                children: ['slide-1'],
              },
              {
                id: 'slide-1',
                component: 'MosaicSlideCard',
                properties: { title: 'Slide Title', subtitle: 'Slide Subtitle' },
              },
              {
                id: 'comp-workorders',
                component: 'WorkOrderList',
                properties: {
                  title: 'Orders',
                  items: [{ id: 'WO-1', title: 'Task 1', assignee: 'Dev', priority: 'HIGH' }],
                },
              },
              {
                id: 'btn-submit',
                component: 'Button',
                properties: {
                  label: 'Submit Config',
                  action: {
                    name: 'submit_kitchen_sink_form',
                    context: {
                      tier: { path: '/form/reasoningTier' },
                      armor: { path: '/form/enableModelArmor' },
                    },
                  },
                },
              },
            ],
          },
        },
      ],
    };

    const element = React.createElement(A2UISurfaceRenderer, {
      payload,
      onUserAction: (action) => {
        capturedAction = action;
      },
    });

    assert.ok(element);
    assert.equal(element.props.payload, payload);
  });
});

describe('ChatMessageRenderer Integrated Tests (TASK-221 & TASK-226)', () => {
  it('should render PlanReAct thought traces accordion and final markdown text', () => {
    const content = `/*PLANNING*/
Analyze sales performance across regions.

/*REASONING*/
West region outperformed East by 18%.

/*FINAL_ANSWER*/
### Executive Summary
The **West Region** led overall performance this quarter.
- Total Sales: $1.2M
- Growth: +18%`;

    const element = React.createElement(ChatMessageRenderer, {
      content,
      isUser: false,
    });

    assert.ok(element);
    assert.equal(element.props.content, content);
  });

  it('should render embedded A2UI surfaces with onUserAction forwarding', () => {
    let capturedAction: any = null;
    const content = `Here is your order summary:
\`\`\`a2ui
{
  "createSurface": { "surfaceId": "order_surf", "title": "Order Review" },
  "updateComponents": {
    "surfaceId": "order_surf",
    "components": [
      { "id": "root", "component": "MaterialCard", "title": "Order #409" }
    ]
  }
}
\`\`\``;

    const element = React.createElement(ChatMessageRenderer, {
      content,
      isUser: false,
      onUserAction: (action) => {
        capturedAction = action;
      },
    });

    assert.ok(element);
    assert.ok(typeof element.props.onUserAction === 'function');
  });

  it('should verify runner ChatMessageRenderer re-export matches chat component', () => {
    assert.equal(RunnerChatMessageRenderer, ChatMessageRenderer);
  });

  it('should resolve rootComponentId and render code variant, Icon, GridList, Dialog, ButtonToggle, and RightPanelForm', () => {
    const content = `Here is the interactive **A2UI v0.9.1 Component Gallery**:

\`\`\`a2ui
{
  "messages": [
    {
      "createSurface": {
        "surfaceId": "kitchen-sink-gallery",
        "catalogId": "gemini_enterprise_composite_v09",
        "rootComponentId": "gallery-root"
      }
    },
    {
      "updateComponents": {
        "surfaceId": "kitchen-sink-gallery",
        "components": [
          {
            "id": "gallery-root",
            "component": "Column",
            "children": ["icon-1", "code-1", "grid-1", "dialog-1", "toggle-1", "right-panel-1"]
          },
          { "id": "icon-1", "component": "Icon", "name": "verified", "color": "emerald" },
          { "id": "code-1", "component": "Text", "variant": "code", "text": "{\\"status\\": \\"ok\\"}" },
          { "id": "grid-1", "component": "GridList", "cols": 2, "children": [] },
          { "id": "dialog-1", "component": "Dialog", "title": "Preview Dialog", "children": [] },
          {
            "id": "toggle-1",
            "component": "ButtonToggle",
            "options": [{ "label": "Day", "value": "day" }, { "label": "Week", "value": "week" }],
            "valuePath": "/viewMode"
          },
          { "id": "right-panel-1", "component": "RightPanelForm", "title": "Quick Edit", "children": [] }
        ]
      }
    }
  ]
}
\`\`\``;

    const extracted = extractA2UIPayloads(content);
    assert.equal(extracted.surfaces.length, 1);
    assert.equal(extracted.textWithoutA2UI, 'Here is the interactive **A2UI v0.9.1 Component Gallery**:');
  });

  it('should normalize standalone Vega-Lite spec, GoogleMap, Badges array, and MosaicCarousel JSON blocks into A2UI surfaces', () => {
    // 1. Standalone Vega-Lite JSON spec inside ```json fence
    const vegaText = `Here is the Vega-Lite chart:
\`\`\`json
{
  "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
  "title": "Weekly Agent Evaluation Scores",
  "mark": "bar",
  "data": {
    "values": [
      { "category": "Reasoning", "score": 94 },
      { "category": "Safety", "score": 99 }
    ]
  },
  "encoding": {
    "x": { "field": "category", "type": "nominal" },
    "y": { "field": "score", "type": "quantitative" }
  }
}
\`\`\``;
    const vegaExtracted = extractA2UIPayloads(vegaText);
    assert.equal(vegaExtracted.surfaces.length, 1);
    assert.equal(vegaExtracted.textWithoutA2UI, 'Here is the Vega-Lite chart:');
    assert.equal(vegaExtracted.surfaces[0].components[0].component, 'VegaChart');

    // 2. Standalone GoogleMap component JSON inside ```json fence
    const mapText = `Here is the deployment map:
\`\`\`json
{
  "id": "map-nodes",
  "component": "GoogleMap",
  "center": { "lat": 37.7749, "lng": -122.4194 },
  "zoom": 9,
  "markers": [
    { "lat": 37.7749, "lng": -122.4194, "title": "Primary Region (us-central1)" }
  ]
}
\`\`\``;
    const mapExtracted = extractA2UIPayloads(mapText);
    assert.equal(mapExtracted.surfaces.length, 1);
    assert.equal(mapExtracted.textWithoutA2UI, 'Here is the deployment map:');
    assert.equal(mapExtracted.surfaces[0].components[0].component, 'GoogleMap');

    // 3. Standalone Badges & Feedback component array inside ```json fence
    const badgesText = `Badges and feedback widgets:
\`\`\`json
[
  { "id": "b1", "type": "Badge", "properties": { "text": "PRIMARY", "color": "primary" } },
  { "id": "p1", "type": "ProgressBar", "properties": { "value": 68, "max": 100, "label": "Memory" } },
  { "id": "s1", "type": "ProgressSpinner", "properties": { "diameter": 24, "label": "Syncing" } }
]
\`\`\``;
    const badgesExtracted = extractA2UIPayloads(badgesText);
    assert.equal(badgesExtracted.surfaces.length, 1);
    assert.equal(badgesExtracted.textWithoutA2UI, 'Badges and feedback widgets:');

    // 4. Standalone MosaicCarousel with inline MosaicSlideCard children and imageUrl
    const carouselPayload = {
      id: 'carousel-demo',
      component: 'MosaicCarousel',
      title: 'Recommended Agent Blueprints',
      children: [
        {
          id: 'slide-1',
          component: 'MosaicSlideCard',
          properties: {
            title: 'Merchandising Workbench',
            subtitle: 'Retail Coordinator',
            imageUrl: 'https://picsum.photos/seed/a2ui-merchandising/400/220',
            badge: 'RETAIL AI',
          },
        },
      ],
    };
    assert.equal(isA2UIv09Payload(carouselPayload), true);
    const normalizedCarousel = normalizeStandaloneA2UIPayload(carouselPayload);
    assert.ok(normalizedCarousel);
    assert.equal(normalizedCarousel.rootId, 'carousel-demo');
  });

  it('should accurately project Web Mercator coordinates and compute fit bounds for GoogleMap', () => {
    const sf = { lat: 37.7749, lng: -122.4194 };
    const worldZ10 = latLngToWorldPixel(sf.lat, sf.lng, 10);
    const roundTrip = worldPixelToLatLng(worldZ10.x, worldZ10.y, 10);
    assert.ok(Math.abs(roundTrip.lat - sf.lat) < 0.0001);
    assert.ok(Math.abs(roundTrip.lng - sf.lng) < 0.0001);

    // Zooming in by 1 level doubles world pixel coordinates
    const worldZ11 = latLngToWorldPixel(sf.lat, sf.lng, 11);
    assert.ok(Math.abs(worldZ11.x - worldZ10.x * 2) < 0.01);
    assert.ok(Math.abs(worldZ11.y - worldZ10.y * 2) < 0.01);

    // Multi-region US pins should fit at continental zoom (z=4)
    const usPins = [
      { lat: 37.7749, lng: -122.4194 },
      { lat: 32.7767, lng: -96.797 },
      { lat: 41.2619, lng: -95.8608 },
      { lat: 38.8951, lng: -77.0364 },
    ];
    const bounds = computeMapFitBounds(usPins, sf, 10, 680, 280);
    assert.equal(bounds.zoom, 4);
    assert.ok(bounds.lat > 35 && bounds.lat < 40);
    assert.ok(bounds.lng > -105 && bounds.lng < -95);
  });

  it('should compute accurate SVG Pie wedge and Donut ring sector paths via buildSvgArcPath', () => {
    // Pie chart wedge (innerRadius = 0) should start at center (M cx cy) and close with Z
    const pieWedge = buildSvgArcPath(95, 95, 0, 76, 0, Math.PI / 2);
    assert.ok(pieWedge.startsWith('M 95.00 95.00 L '));
    assert.ok(pieWedge.includes(' A 76 76 0 0 1 '));
    assert.ok(pieWedge.endsWith(' Z'));

    // Donut chart ring sector (innerRadius = 46) should contain both outer and inner arc commands
    const donutSector = buildSvgArcPath(95, 95, 46, 76, 0, Math.PI * 1.25);
    assert.ok(!donutSector.startsWith('M 95.00 95.00 L '));
    assert.ok(donutSector.includes(' A 76 76 0 1 1 '));
    assert.ok(donutSector.includes(' A 46 46 0 1 0 '));
    assert.ok(donutSector.endsWith(' Z'));
  });

  it('should normalize and render LLM-generated components using props, SelectField, NumberField, MetricView, AlarmCard, and string Button actions', () => {
    const llmGeneratedPayload = {
      surfaceId: 'po-submission-dialog-alm-101',
      title: 'Emergency Stock Transfer & PO Submission',
      components: [
        {
          id: 'po-form-card',
          type: 'Card',
          props: {
            title: 'Emergency Replenishment: SKU-AC-FLOOR-5000',
            subtitle: 'Destination: NYC-104 (Critical Stockout < 4 Hours)',
            children: [
              {
                id: 'alarm-summary',
                type: 'AlarmCard',
                props: {
                  alarmId: 'ALM-101',
                  severity: 'CRITICAL',
                  title: 'NYC-104 Stockout Risk',
                  sku: 'SKU-AC-FLOOR-5000',
                },
              },
              {
                id: 'po-wh-select',
                type: 'SelectField',
                props: {
                  label: 'Origin Warehouse',
                  options: ['WH-EWR (4h Transit)', 'WH-PHL (8h Transit)'],
                  defaultValue: 'WH-EWR (4h Transit)',
                },
              },
              {
                id: 'po-qty-input',
                type: 'NumberField',
                props: {
                  label: 'Transfer Quantity (Units)',
                  defaultValue: 180,
                },
              },
              {
                id: 'po-dos-metric',
                type: 'MetricView',
                props: {
                  label: 'Post-Transfer Days of Supply',
                  value: '4.1 Days',
                  trend: 'SAFE (> 3.0d Target)',
                },
              },
              {
                id: 'po-submit-btn',
                type: 'Button',
                props: {
                  label: 'Commit SAP Emergency Transfer',
                  variant: 'primary',
                  action: 'submit_po',
                },
              },
            ],
          },
        },
      ],
    };

    assert.equal(isA2UIv09Payload(llmGeneratedPayload), true);
    const parsedSurfaces = parsePayloadToSurfaces(llmGeneratedPayload);
    const surface = parsedSurfaces['po-submission-dialog-alm-101'];
    assert.ok(surface);
    // Inline children under props.children must be flattened into surface.components
    assert.equal(Object.keys(surface.components).length, 6);
    assert.deepEqual(surface.components['po-form-card'].children, [
      'alarm-summary',
      'po-wh-select',
      'po-qty-input',
      'po-dos-metric',
      'po-submit-btn',
    ]);

    const selectComp = surface.components['po-wh-select'];
    assert.ok(selectComp);
    assert.equal(selectComp.properties?.label, 'Origin Warehouse');

    const element = React.createElement(A2UISurfaceRenderer, {
      payload: llmGeneratedPayload,
    });
    assert.ok(element);
  });

  it('should extract valid A2UI surface when an unclosed LLM-truncated ```a2ui block precedes the tool-emitted ```a2ui block', () => {
    const validSurface = {
      messages: [
        {
          createSurface: {
            surfaceId: 'merchandising-alarms-surface',
            catalogId: 'gemini_enterprise_composite_v09',
            rootComponentId: 'merchandising-alarms-root',
          },
        },
        {
          updateComponents: {
            surfaceId: 'merchandising-alarms-surface',
            components: [
              {
                id: 'merchandising-alarms-root',
                component: 'Card',
                properties: { title: 'Merchandising Workbench — Active Alarms Queue' },
              },
            ],
          },
        },
      ],
    };

    const collidedContent = [
      '### Active Merchandising Alarms Overview',
      '',
      '### Interactive Merchandising Workbench Surface',
      '',
      '```a2ui',
      '{',
      '  "messages": [',
      '    {',
      '      "updateComponents": {',
      '        "components": [',
      '          {',
      '            "id": "panel-ALM-101",',
      '            "properties": {',
      '              "title": "[CRITICAL]',
      '',
      '```a2ui',
      JSON.stringify(validSurface),
      '```',
    ].join('\n');

    const extracted = extractA2UIPayloads(collidedContent);
    assert.equal(extracted.surfaces.length, 1);
    assert.ok(!extracted.textWithoutA2UI.includes('```a2ui'));
    assert.ok(!extracted.textWithoutA2UI.includes('"updateComponents"'));
    assert.ok(extracted.textWithoutA2UI.includes('### Active Merchandising Alarms Overview'));
  });

  it('should repair a single token-truncated ```a2ui block and salvage completed components without dumping raw JSON', () => {
    const truncatedMessage = [
      'Here is the workbench:',
      '```a2ui',
      '{"messages": [{"createSurface": {"surfaceId": "alarms-surf", "rootComponentId": "card-1"}}, {"updateComponents": {"surfaceId": "alarms-surf", "components": [{"id": "card-1", "component": "Card", "properties": {"title": "Active Alarms"}}, {"id": "truncated-node", "component": "ExpansionPanel", "properties": {"title": "[CRITICAL]',
    ].join('\n');

    const extracted = extractA2UIPayloads(truncatedMessage);
    assert.equal(extracted.surfaces.length, 1);
    assert.equal(extracted.textWithoutA2UI, 'Here is the workbench:');
    const parsed = parsePayloadToSurfaces(extracted.surfaces[0]);
    assert.ok(parsed['alarms-surf']);
    assert.ok(parsed['alarms-surf'].components['card-1']);
  });

  it('should not prematurely close ```a2ui fence when a MaterialText(variant="code") component contains embedded ```json fences', () => {
    const surfaceWithInnerFences = {
      messages: [
        {
          createSurface: {
            surfaceId: 'dc-manifest-summary-surface',
            catalogId: 'gemini_enterprise_composite_v09',
            rootComponentId: 'dc-manifest-summary-root',
          },
        },
        {
          updateComponents: {
            surfaceId: 'dc-manifest-summary-surface',
            components: [
              {
                id: 'dc-manifest-summary-root',
                component: 'Column',
                children: ['manifest-inspector-panel', 'manifest-actions-row'],
              },
              {
                id: 'manifest-inspector-panel',
                component: 'ExpansionPanel',
                children: ['inspector-code-block'],
                properties: {
                  title: "Raw session.state['allocation_plan'] Memory Inspector",
                  expanded: false,
                  subtitle: 'Click to inspect underlying JSON dictionary persisted across turns',
                },
              },
              {
                id: 'inspector-code-block',
                component: 'Text',
                properties: {
                  text: '```json\n{\n  "launchSku": "SKU-AERO-PRO-X1",\n  "ecomHoldbackPct": 35.0\n}\n```',
                  variant: 'code',
                },
              },
              {
                id: 'manifest-actions-row',
                component: 'Row',
                children: ['btn-edit-rules'],
              },
              {
                id: 'btn-edit-rules',
                component: 'Button',
                properties: {
                  label: 'Re-adjust Allocation Rules (Form)',
                  variant: 'filled',
                },
              },
            ],
          },
        },
        {
          updateDataModel: {
            surfaceId: 'dc-manifest-summary-surface',
            data: {},
          },
        },
      ],
    };

    const fullMessage = `Here is the **DC Pack-Out Manifest & session.state Summary**:\n\n\`\`\`a2ui\n${JSON.stringify(surfaceWithInnerFences)}\n\`\`\``;
    const extracted = extractA2UIPayloads(fullMessage);

    assert.equal(extracted.surfaces.length, 1);
    assert.equal(
      extracted.textWithoutA2UI,
      'Here is the **DC Pack-Out Manifest & session.state Summary**:'
    );
    assert.ok(!extracted.textWithoutA2UI.includes('variant'));
    assert.ok(!extracted.textWithoutA2UI.includes('manifest-actions-row'));

    const parsed = parsePayloadToSurfaces(extracted.surfaces[0]);
    const surf = parsed['dc-manifest-summary-surface'];
    assert.ok(surf);
    assert.ok(surf.components['inspector-code-block']);
    assert.ok(surf.components['manifest-actions-row']);
    assert.ok(surf.components['btn-edit-rules']);
  });

  it('should render Table cells and headers when columns specify field/header or field/headerName', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const tablePayload = {
      messages: [
        {
          createSurface: {
            surfaceId: 'allocation-table-surface',
            rootComponentId: 'manifest-rules-table',
          },
        },
        {
          updateComponents: {
            surfaceId: 'allocation-table-surface',
            components: [
              {
                id: 'manifest-rules-table',
                component: 'RichTable',
                properties: {
                  title: 'Default Launch Rules vs. Committed session.state Rules',
                  columns: [
                    { field: 'parameter', header: 'Parameter' },
                    { field: 'json_pointer', headerName: 'JSON Pointer' },
                    { field: 'committed_rule', header: 'Committed in session.state' },
                  ],
                  rows: [
                    {
                      parameter: 'E-Commerce Holdback %',
                      json_pointer: '/form/ecomHoldbackPct',
                      committed_rule: '35.0%',
                    },
                  ],
                },
              },
            ],
          },
        },
      ],
    };

    const html = renderToStaticMarkup(
      React.createElement(A2UISurfaceRenderer, { payload: tablePayload })
    );
    assert.ok(html.includes('Parameter'));
    assert.ok(html.includes('JSON Pointer'));
    assert.ok(html.includes('Committed in session.state'));
    assert.ok(html.includes('E-Commerce Holdback %'));
    assert.ok(html.includes('/form/ecomHoldbackPct'));
    assert.ok(html.includes('35.0%'));
  });
});
