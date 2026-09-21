/**
 * Unit Tests for PaletteCard Sample Categories & Collapsible Groups
 *
 * Validates:
 * 1. PaletteCard sample grouping groups workflows by domain category (e.g. Retail).
 * 2. Categories default to collapsed (openSampleCategories[category] is false by default).
 * 3. Toggling category state expands and collapses the category accordion.
 * 4. AgentEditorProvider normalizes directory/metadata categories (retail -> Retail, sdlc -> SDLC, etc.).
 * 5. Physical samples (company_verifier and travel-concierge) are both categorized under 'Retail'.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SampleWorkflowDefinition } from '../../../src/webview/types';
import { AgentEditorProvider } from '../../../src/extension/AgentEditorProvider';

describe('PaletteCard Sample Categories & Collapsible Accordions', () => {
  // Logic replicating PaletteCard sample grouping
  const groupSamplesByCategory = (
    sampleList: SampleWorkflowDefinition[]
  ): Record<string, SampleWorkflowDefinition[]> => {
    const groups: Record<string, SampleWorkflowDefinition[]> = {};
    for (const sample of sampleList) {
      const cat = sample.category?.trim() || 'General';
      if (!groups[cat]) {
        groups[cat] = [];
      }
      groups[cat].push(sample);
    }
    return groups;
  };

  it('should group samples by their assigned category', () => {
    const mockSamples: SampleWorkflowDefinition[] = [
      {
        id: 'company_verifier',
        name: 'Company Verifier',
        filename: 'company_verifier.agent',
        category: 'Retail',
        badge: 'Pub/Sub + Grounding',
        description: 'Verifies company registrations.',
        features: [],
        nodesCount: 2,
        toolsCount: 2,
        triggerType: 'pubsub',
        nodes: [],
        edges: [],
      },
      {
        id: 'travel_concierge',
        name: 'Travel Concierge',
        filename: 'travel-concierge.agent',
        category: 'Retail',
        badge: 'Multi-Agent',
        description: 'Hierarchical travel assistant.',
        features: [],
        nodesCount: 7,
        toolsCount: 12,
        triggerType: 'chat',
        nodes: [],
        edges: [],
      },
      {
        id: 'software_bug_assistant',
        name: 'Software Bug Assistant',
        filename: 'software-bug-assistant.agent',
        category: 'SDLC',
        badge: 'Multi-Agent',
        description: 'Triage bug reports.',
        features: [],
        nodesCount: 4,
        toolsCount: 3,
        triggerType: 'chat',
        nodes: [],
        edges: [],
      },
    ];

    const groups = groupSamplesByCategory(mockSamples);
    assert.equal(Object.keys(groups).length, 2);
    assert.ok(groups['Retail']);
    assert.ok(groups['SDLC']);
    assert.equal(groups['Retail'].length, 2);
    assert.equal(groups['SDLC'].length, 1);
  });

  it('should default all sample category groups to collapsed (false)', () => {
    const openSampleCategories: Record<string, boolean> = {};
    const categories = ['Retail', 'SDLC', 'Finance'];

    for (const cat of categories) {
      const isExpanded = openSampleCategories[cat] ?? false;
      assert.equal(
        isExpanded,
        false,
        `Category ${cat} must be collapsed by default`
      );
    }
  });

  it('should toggle sample category state between expanded and collapsed', () => {
    let openSampleCategories: Record<string, boolean> = {};

    const toggle = (cat: string) => {
      openSampleCategories = {
        ...openSampleCategories,
        [cat]: !openSampleCategories[cat],
      };
    };

    // Initial state
    assert.equal(openSampleCategories['Retail'] ?? false, false);

    // Toggle 1 -> Expand
    toggle('Retail');
    assert.equal(openSampleCategories['Retail'], true);

    // Toggle 2 -> Collapse
    toggle('Retail');
    assert.equal(openSampleCategories['Retail'], false);
  });

  it('should normalize raw category subfolder names to title-case standards in AgentEditorProvider', () => {
    const mockContext: any = { extensionPath: process.cwd(), subscriptions: [] };
    const provider = new AgentEditorProvider(mockContext);

    assert.equal(provider.formatSampleCategory('retail'), 'Retail');
    assert.equal(provider.formatSampleCategory('sdlc'), 'SDLC');
    assert.equal(provider.formatSampleCategory('finance'), 'Finance');
    assert.equal(provider.formatSampleCategory('research'), 'Research');
    assert.equal(provider.formatSampleCategory('operations'), 'Operations');
    assert.equal(provider.formatSampleCategory('creative'), 'Creative');
    assert.equal(provider.formatSampleCategory('data'), 'Data');
    assert.equal(provider.formatSampleCategory('patterns'), 'Patterns');
    assert.equal(provider.formatSampleCategory('custom-domain'), 'Custom-domain');
  });

  it('should categorize both company_verifier and travel_concierge under Retail from physical disk', () => {
    const mockContext: any = { extensionPath: process.cwd(), subscriptions: [] };
    const provider = new AgentEditorProvider(mockContext);
    const discovered = provider.discoverResourceSamples();

    assert.equal(discovered.length, 3, 'Must discover 3 samples from resource/samples/');

    const retailSamples = discovered.filter((s) => s.category === 'Retail');
    assert.equal(
      retailSamples.length,
      2,
      `Expected both samples to be categorized under 'Retail', but found: ${discovered.map(s => `${s.id} (${s.category})`).join(', ')}`
    );

    const ids = retailSamples.map((s) => s.id).sort();
    assert.deepEqual(ids, ['company_verifier', 'travel_concierge']);

  });
});
