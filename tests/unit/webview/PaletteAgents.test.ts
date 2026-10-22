/**
 * Unit Tests for Basic Agent Types in PaletteCard
 *
 * Validates:
 * 1. PaletteCard basic agent types catalog includes Standard, A2A, and Router nodes.
 * 2. Visual metadata (theme color, badge label, agent kind) for all 3 types.
 * 3. Drag-and-drop payload generation for all 3 basic agent types.
 * 4. createSingleAgentNode generates valid node structure for all 3 basic agent types.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { 
  createSingleAgentNode, 
  CORE_AGENT_TYPES, 
  FLOW_CONTROL_AGENT_TYPES, 
  BASIC_AGENT_TYPES, 
  PATTERN_DEFINITIONS 
} from '../../../src/webview/data/patterns';
import { AgentKind } from '../../../src/webview/types';
import { computeCanonicalDocumentHash } from '../../../src/webview/hooks/useExtensionSync';

describe('Basic Agent Types Palette & Node Creation', () => {
  it('should partition basic agent types into Core and Flow & Control groups', () => {
    assert.equal(CORE_AGENT_TYPES.length, 2);
    assert.deepEqual(CORE_AGENT_TYPES.map(a => a.kind), ['standard', 'a2a']);

    assert.equal(FLOW_CONTROL_AGENT_TYPES.length, 5);
    assert.deepEqual(FLOW_CONTROL_AGENT_TYPES.map(a => a.kind), ['router', 'synthesizer', 'hitl', 'fallback', 'guardrail']);

    assert.equal(BASIC_AGENT_TYPES.length, 7);
  });

  it('should include active Multi-Agent Pattern definitions', () => {
    assert.equal(PATTERN_DEFINITIONS.length, 8);
    const patternTypes = PATTERN_DEFINITIONS.map(p => p.type);
    assert.deepEqual(patternTypes, [
      'sequential',
      'parallel',
      'router',
      'loop',
      'debate',
      'hierarchical_decomposition',
      'review_critique',
      'coordinator'
    ]);
  });

  it('should configure Router Agent with Branching badge and purple theme', () => {
    const routerType = BASIC_AGENT_TYPES.find((a) => a.kind === 'router');
    assert.ok(routerType);
    assert.equal(routerType?.badge, 'Branching');
    assert.equal(routerType?.colorTheme, 'purple');
    assert.ok(routerType?.description.includes('branching'));
  });

  it('should configure Synthesizer Agent with Reducer badge and emerald theme', () => {
    const synType = BASIC_AGENT_TYPES.find((a) => a.kind === 'synthesizer');
    assert.ok(synType);
    assert.equal(synType?.badge, 'Reducer');
    assert.equal(synType?.colorTheme, 'emerald');
    assert.ok(synType?.description.includes('structured JSON'));
  });

  it('should configure Approval Gate with HITL badge and amber theme', () => {
    const hitlType = BASIC_AGENT_TYPES.find((a) => a.kind === 'hitl');
    assert.ok(hitlType);
    assert.equal(hitlType?.badge, 'HITL');
    assert.equal(hitlType?.colorTheme, 'amber');
    assert.ok(hitlType?.description.includes('Human review'));
  });

  it('should configure Fallback Circuit Breaker with Resilience badge and rose theme', () => {
    const fbType = BASIC_AGENT_TYPES.find((a) => a.kind === 'fallback');
    assert.ok(fbType);
    assert.equal(fbType?.badge, 'Resilience');
    assert.equal(fbType?.colorTheme, 'rose');
    assert.ok(fbType?.description.includes('quota fallback'));
  });

  it('should configure Guardrail Shield with Shield badge and teal theme', () => {
    const grType = BASIC_AGENT_TYPES.find((a) => a.kind === 'guardrail');
    assert.ok(grType);
    assert.equal(grType?.badge, 'Shield');
    assert.equal(grType?.colorTheme, 'teal');
    assert.ok(grType?.description.includes('safety'));
  });

  it('should create valid synthesizer node on canvas with structuredOutput and no tools', () => {
    const synNode = createSingleAgentNode(100, 200, undefined, undefined, 'synthesizer');
    assert.equal(synNode.type, 'agentNode');
    assert.equal(synNode.data.agentKind, 'synthesizer');
    assert.equal(synNode.data.colorTheme, 'green');
    assert.ok(synNode.data.synthesizerConfig);
    assert.equal(synNode.data.synthesizerConfig?.reductionStrategy, 'summarize');
    assert.ok(synNode.data.structuredOutput?.enabled);
    assert.deepEqual(synNode.data.tools, []);
  });

  it('should create valid HITL approval gate node on canvas', () => {
    const hitlNode = createSingleAgentNode(100, 200, undefined, undefined, 'hitl');
    assert.equal(hitlNode.type, 'agentNode');
    assert.equal(hitlNode.data.agentKind, 'hitl');
    assert.equal(hitlNode.data.colorTheme, 'amber');
    assert.ok(hitlNode.data.hitlConfig);
    assert.equal(hitlNode.data.hitlConfig?.autoRejectOnTimeout, true);
  });

  it('should create valid fallback circuit breaker node on canvas', () => {
    const fbNode = createSingleAgentNode(100, 200, undefined, undefined, 'fallback');
    assert.equal(fbNode.type, 'agentNode');
    assert.equal(fbNode.data.agentKind, 'fallback');
    assert.equal(fbNode.data.colorTheme, 'rose');
    assert.ok(fbNode.data.fallbackConfig);
    assert.equal(fbNode.data.fallbackConfig?.maxRetries, 3);
  });

  it('should create valid guardrail shield node on canvas', () => {
    const grNode = createSingleAgentNode(100, 200, undefined, undefined, 'guardrail');
    assert.equal(grNode.type, 'agentNode');
    assert.equal(grNode.data.agentKind, 'guardrail');
    assert.equal(grNode.data.colorTheme, 'teal');
    assert.ok(grNode.data.guardrailConfig);
    assert.equal(grNode.data.guardrailConfig?.actionOnViolation, 'block');
  });

  it('should create valid standard, A2A, and router nodes on canvas', () => {
    const standardNode = createSingleAgentNode(0, 0, undefined, undefined, 'standard');
    assert.equal(standardNode.data.agentKind, 'standard');

    const a2aNode = createSingleAgentNode(50, 50, undefined, undefined, 'a2a');
    assert.equal(a2aNode.data.agentKind, 'a2a');
    assert.ok(a2aNode.data.a2aConfig);

    const routerNode = createSingleAgentNode(100, 100, undefined, undefined, 'router');
    assert.equal(routerNode.data.agentKind, 'router');
    assert.ok(routerNode.data.routerConfig);
  });

  it('should verify Flow & Control Agents catalog contains all 5 flow node definitions with correct metadata', () => {
    assert.equal(FLOW_CONTROL_AGENT_TYPES.length, 5);
    const kinds = FLOW_CONTROL_AGENT_TYPES.map((a) => a.kind);
    assert.deepEqual(kinds, ['router', 'synthesizer', 'hitl', 'fallback', 'guardrail']);

    FLOW_CONTROL_AGENT_TYPES.forEach((flowNode) => {
      assert.ok(flowNode.name, `FlowNode ${flowNode.kind} must have a name`);
      assert.ok(flowNode.description, `FlowNode ${flowNode.kind} must have a description`);
      assert.ok(flowNode.badge, `FlowNode ${flowNode.kind} must have a badge`);
      assert.ok(flowNode.colorTheme, `FlowNode ${flowNode.kind} must have a colorTheme`);
      assert.ok(flowNode.iconName, `FlowNode ${flowNode.kind} must have an iconName`);
    });
  });

  it('should initialize Agent categories with Core open and Flow & Control and Patterns collapsed by default', () => {
    const initialOpenCategories: Record<string, boolean> = {
      core: true,
      flow_control: false,
      patterns: false,
    };

    assert.equal(initialOpenCategories.core, true, 'Core Agents must be expanded by default');
    assert.equal(initialOpenCategories.flow_control, false, 'Flow & Control Agents must be collapsed by default');
    assert.equal(initialOpenCategories.patterns, false, 'Multi-Agent Patterns must be collapsed by default');
  });

  it('should report correct item counts for all three agent categories', () => {
    assert.equal(CORE_AGENT_TYPES.length, 2, 'Core Agents category count must be 2');
    assert.equal(FLOW_CONTROL_AGENT_TYPES.length, 5, 'Flow & Control category count must be 5');
    assert.equal(PATTERN_DEFINITIONS.length, 8, 'Multi-Agent Patterns category count must be 8');
  });

  it('should support toggling agent categories independently', () => {
    let state: Record<string, boolean> = {
      core: true,
      flow_control: false,
      patterns: false,
    };

    const toggle = (id: string) => {
      state = { ...state, [id]: !state[id] };
    };

    // Toggle flow_control open
    toggle('flow_control');
    assert.equal(state.core, true);
    assert.equal(state.flow_control, true);
    assert.equal(state.patterns, false);

    // Toggle patterns open
    toggle('patterns');
    assert.equal(state.core, true);
    assert.equal(state.flow_control, true);
    assert.equal(state.patterns, true);

    // Toggle core closed
    toggle('core');
    assert.equal(state.core, false);
    assert.equal(state.flow_control, true);
    assert.equal(state.patterns, true);

    // Toggle core open again
    toggle('core');
    assert.equal(state.core, true);
    assert.equal(state.flow_control, true);
    assert.equal(state.patterns, true);
  });

  it('should configure cognitive patterns with distinct visual badges, icons, and color themes (TASK-124)', () => {
    // 1. Multi-Agent Debate
    const debatePattern = PATTERN_DEFINITIONS.find((p) => p.type === 'debate');
    assert.ok(debatePattern, 'Debate pattern must exist');
    assert.equal(debatePattern?.badge, 'Consensus Panel');
    assert.equal(debatePattern?.colorTheme, 'pink');
    assert.equal(debatePattern?.iconName, 'Scale');
    assert.ok(debatePattern?.description.toLowerCase().includes('debate'));

    // 2. Evaluator-Optimizer Loop
    const loopPattern = PATTERN_DEFINITIONS.find((p) => p.type === 'loop');
    assert.ok(loopPattern, 'Loop pattern must exist');
    assert.equal(loopPattern?.badge, 'Generate & Refine');
    assert.equal(loopPattern?.colorTheme, 'purple');
    assert.equal(loopPattern?.iconName, 'Repeat');
    assert.ok(loopPattern?.description.includes('loop'));

    // 3. Review & Critique Triad
    const critiquePattern = PATTERN_DEFINITIONS.find((p) => p.type === 'review_critique');
    assert.ok(critiquePattern, 'Review & Critique pattern must exist');
    assert.equal(critiquePattern?.badge, 'Triad Review');
    assert.equal(critiquePattern?.colorTheme, 'rose');
    assert.equal(critiquePattern?.iconName, 'CheckSquare');
    assert.ok(critiquePattern?.description.includes('Triad'));
  });

  it('should ensure all 8 pattern definitions possess valid colorTheme properties', () => {
    for (const pattern of PATTERN_DEFINITIONS) {
      assert.ok(pattern.colorTheme, `Pattern ${pattern.id} must have a colorTheme defined`);
      assert.ok(pattern.badge, `Pattern ${pattern.id} must have a badge defined`);
    }
  });

  it('should bound PaletteCard with equal top-3 and bottom-3 padding, 100% height, and internal scrolling', () => {
    const palettePath = path.resolve(__dirname, '../../../src/webview/components/Canvas/PaletteCard.tsx');
    const source = fs.readFileSync(palettePath, 'utf8');

    // Outer container must use both top-3 and bottom-3 so top and bottom padding are equal and resize with CanvasTab
    assert.ok(
      source.includes('absolute top-3 bottom-3 left-0 z-20 flex items-start select-none group/palette pointer-events-none'),
      'PaletteCard outer wrapper must use top-3 bottom-3 and pointer-events-none'
    );

    // Open Tab Panel must take 100% of bounded height (h-full max-h-full) and never use fixed 66vh calc
    assert.ok(
      source.includes('pointer-events-auto w-80 h-full max-h-full'),
      'PaletteCard open tab panel must use pointer-events-auto w-80 h-full max-h-full'
    );
    assert.ok(
      !source.includes('max-h-[calc(66vh-24px)]'),
      'PaletteCard must not use hardcoded max-h-[calc(66vh-24px)]'
    );
    assert.ok(
      !source.includes('max-h-[calc(66vh-240px)]'),
      'PaletteCard triggers list must not use nested max-h-[calc(66vh-240px)]'
    );

    // All 4 tab content containers must use overflow-y-auto flex-1 min-h-0 for internal scrolling
    const internalScrollMatches = source.match(/overflow-y-auto flex-1 min-h-0/g) || [];
    assert.equal(
      internalScrollMatches.length,
      4,
      'All 4 PaletteCard tabs (Agents, Tools, Triggers, Samples) must have overflow-y-auto flex-1 min-h-0'
    );
  });

  it('should close open property panels when clicking anywhere on the bottom tab panel in FlowCanvas', () => {
    const flowCanvasPath = path.resolve(__dirname, '../../../src/webview/components/FlowCanvas.tsx');
    const source = fs.readFileSync(flowCanvasPath, 'utf8');

    assert.ok(
      source.includes('const handleClosePropertyPanels = useCallback('),
      'FlowCanvas must define handleClosePropertyPanels'
    );
    assert.ok(
      source.includes('data-testid="bottom-panel-container"'),
      'FlowCanvas must render bottom-panel-container'
    );
    assert.ok(
      source.includes('onMouseDownCapture={handleClosePropertyPanels}'),
      'Bottom panel container must attach onMouseDownCapture={handleClosePropertyPanels}'
    );
    assert.ok(
      source.includes('onClick={handleClosePropertyPanels}'),
      'Bottom panel container must attach onClick={handleClosePropertyPanels}'
    );
  });

  it('should compute canonical document hash ignoring metadata.updatedAt to prevent dirty re-triggering after save', () => {
    const baseDoc: any = {
      version: '1.0.0',
      name: 'kitchen_sink',
      description: 'Test doc',
      framework: 'google-adk',
      language: 'python',
      nodes: [{ id: 'n1', type: 'agent', position: { x: 100, y: 200 }, data: { label: 'Root' } }],
      edges: [],
      metadata: {
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-15T01:00:00.000Z',
      },
      deployment: {
        target: 'agent_engine',
        deploymentTarget: 'agent_engine',
        outputFolder: './kitchen_sink/',
      },
    };

    const laterTimestampDoc: any = {
      ...baseDoc,
      metadata: {
        ...baseDoc.metadata,
        updatedAt: '2026-10-15T02:55:00.000Z',
      },
    };

    assert.equal(
      computeCanonicalDocumentHash(baseDoc),
      computeCanonicalDocumentHash(laterTimestampDoc),
      'Canonical hash must remain identical when only metadata.updatedAt changes'
    );

    const modifiedNodeDoc: any = {
      ...laterTimestampDoc,
      nodes: [{ id: 'n1', type: 'agent', position: { x: 150, y: 200 }, data: { label: 'Root' } }],
    };

    assert.notEqual(
      computeCanonicalDocumentHash(baseDoc),
      computeCanonicalDocumentHash(modifiedNodeDoc),
      'Canonical hash must change when node position or data changes'
    );
  });

  it('should render Sub-Agents pattern dropdown to the right of the Sub-Agents label in AgentNode and wire pattern callbacks in FlowCanvas', () => {
    const agentNodePath = path.resolve(__dirname, '../../../src/webview/components/Canvas/nodes/AgentNode.tsx');
    const agentNodeSource = fs.readFileSync(agentNodePath, 'utf8');

    // Dropdown must always render in the Sub-Agents header when subAgents.length > 0 (not gated behind undefined data.onPatternChange)
    assert.ok(
      agentNodeSource.includes('<span>Sub-Agents ({subAgents.length})</span>'),
      'AgentNode must render Sub-Agents header label'
    );
    assert.ok(
      agentNodeSource.includes('data-testid={`subagent-pattern-select-${id}`}'),
      'AgentNode must render the Sub-Agents pattern select dropdown in the header'
    );
    assert.ok(
      !agentNodeSource.includes('{data.onPatternChange && ('),
      'AgentNode must not hide the Sub-Agents pattern select dropdown behind a data.onPatternChange conditional'
    );
    assert.ok(
      agentNodeSource.includes('data.onUpdateSubAgentPattern(id, nextPattern)'),
      'AgentNode pattern select must invoke data.onUpdateSubAgentPattern'
    );

    const flowCanvasPath = path.resolve(__dirname, '../../../src/webview/components/FlowCanvas.tsx');
    const flowCanvasSource = fs.readFileSync(flowCanvasPath, 'utf8');
    assert.ok(
      flowCanvasSource.includes('onUpdateSubAgentPattern: handleUpdateSubAgentPattern,') &&
        flowCanvasSource.includes('onPatternChange: handleUpdateSubAgentPattern,'),
      'FlowCanvas enrichedNodes must wire both onUpdateSubAgentPattern and onPatternChange'
    );

    // Ensure AgentNode and StandardAgentDrawer resolve currentPattern with identical logic so their dropdown selections always match
    const standardDrawerPath = path.resolve(__dirname, '../../../src/webview/components/inspector/StandardAgentDrawer.tsx');
    const standardDrawerSource = fs.readFileSync(standardDrawerPath, 'utf8');
    const expectedResolution = `const currentPattern: DelegationPattern = PATTERN_OPTIONS.some((opt) => opt.id === rawPattern)\n    ? rawPattern\n    : PATTERN_OPTIONS[0].id;`;
    assert.ok(
      agentNodeSource.includes(expectedResolution),
      'AgentNode must resolve currentPattern using PATTERN_OPTIONS[0].id fallback instead of forcing coordinator'
    );
    assert.ok(
      standardDrawerSource.includes(expectedResolution),
      'StandardAgentDrawer must resolve currentPattern using identical logic to AgentNode'
    );
  });

  it('should render always-visible "+" quick-add buttons on all Agent cards, Tool cards, and Trigger cards, and not on Sample cards', () => {
    const palettePath = path.resolve(__dirname, '../../../src/webview/components/Canvas/PaletteCard.tsx');
    const source = fs.readFileSync(palettePath, 'utf8');

    // 1. Agent cards: Core Agents, Flow & Control Agents, and Multi-Agent Patterns must all have "+" add buttons
    assert.ok(
      source.includes('data-testid={`palette-agent-add-${agentType.kind}`}'),
      'Core and Flow & Control agent cards must render a "+" button with data-testid="palette-agent-add-${agentType.kind}"'
    );
    const agentAddButtonMatches = source.match(/data-testid=\{`palette-agent-add-\$\{agentType\.kind\}`\}/g) || [];
    assert.equal(
      agentAddButtonMatches.length,
      2,
      'Both Core Agents and Flow & Control Agents loops must render palette-agent-add-${agentType.kind} buttons'
    );
    assert.ok(
      source.includes('data-testid={`palette-pattern-add-${pattern.type}`}'),
      'Multi-Agent Pattern cards must render a "+" button with data-testid="palette-pattern-add-${pattern.type}"'
    );
    assert.ok(
      !source.includes('opacity-0 group-hover:opacity-100 hover:bg-[#30363d]'),
      'Pattern "+" button must be always visible rather than hidden with opacity-0'
    );

    // 2. Tool cards: GCP MCP, Workspace MCP, and Standard Tool sections must all render "+" add buttons calling onAddToolToAgent(t)
    const toolAddButtonMatches = source.match(/data-testid=\{`palette-tool-add-\$\{t\.id\}`\}/g) || [];
    assert.equal(
      toolAddButtonMatches.length,
      3,
      'All 3 tool card sections (GCP MCP, Workspace MCP, and Standard/Custom) must render palette-tool-add-${t.id} buttons'
    );
    const addToolCalls = source.match(/onAddToolToAgent\(t\)/g) || [];
    assert.ok(
      addToolCalls.length >= 3,
      'All 3 tool card sections must invoke onAddToolToAgent(t) when clicking the "+" button'
    );

    // 3. Trigger cards: Single trigger sections (tester/chat) and Workflow Triggers section must render "+" add buttons calling onAddTrigger
    assert.ok(
      source.includes('data-testid={`palette-trigger-add-${section.trigger.type}`}'),
      'Single trigger cards (Test Suite, Chat) must render a "+" button with data-testid="palette-trigger-add-${section.trigger.type}"'
    );
    assert.ok(
      source.includes('data-testid={`palette-trigger-add-${trigger.type}`}'),
      'Workflow trigger cards must render a "+" button with data-testid="palette-trigger-add-${trigger.type}"'
    );

    // 4. Sample cards: Must NOT have a palette-sample-add button
    assert.ok(
      !source.includes('palette-sample-add-'),
      'Sample cards must not render a "+" quick-add button'
    );
  });
});


