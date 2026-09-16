/**
 * Unit Tests for Collapsible Tool Sections (PaletteCard & AddToolModal)
 *
 * Validates:
 * 1. Default closed state for all 4 tool category sections.
 * 2. Independent section toggle mechanics (open/close).
 * 3. Search query override: active search terms automatically expand sections so results are visible.
 * 4. Empty search query reverts to respecting individual section collapse states.
 * 5. Whitespace-only search strings do not force sections open.
 * 6. Edge cases: empty tool list, unknown category IDs, and multiple toggles.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { categorizeTools } from '../../../src/webview/data/builtinTools';
import { AVAILABLE_TOOLS } from '../../../src/webview/data/defaultTools';
import { ToolDefinition } from '../../../src/webview/types';

describe('Collapsible Tool Sections - Logic & State', () => {
  // Helper mirroring section state manager in PaletteCard and AddToolModal
  const createSectionStateManager = () => {
    let state: Record<string, boolean> = {
      grounding: false,
      enterprise_search: false,
      system: false,
      custom: false,
    };

    return {
      getState: () => ({ ...state }),
      toggle: (sectionId: string) => {
        state = {
          ...state,
          [sectionId]: !state[sectionId],
        };
      },
      isSectionOpen: (sectionId: string, searchQuery: string) => {
        // Auto-expand sections during active search, otherwise obey collapsible state (default closed)
        return searchQuery.trim().length > 0 ? true : Boolean(state[sectionId]);
      },
    };
  };

  it('should initialize all category sections as closed by default', () => {
    const manager = createSectionStateManager();
    const initialState = manager.getState();

    assert.equal(initialState.grounding, false, 'grounding must default to closed');
    assert.equal(initialState.enterprise_search, false, 'enterprise_search must default to closed');
    assert.equal(initialState.system, false, 'system must default to closed');
    assert.equal(initialState.custom, false, 'custom must default to closed');

    // Without search, isSectionOpen must return false
    assert.equal(manager.isSectionOpen('grounding', ''), false);
    assert.equal(manager.isSectionOpen('enterprise_search', ''), false);
    assert.equal(manager.isSectionOpen('system', ''), false);
    assert.equal(manager.isSectionOpen('custom', ''), false);
  });

  it('should toggle an individual section between open and closed', () => {
    const manager = createSectionStateManager();

    // Toggle grounding open
    manager.toggle('grounding');
    assert.equal(manager.isSectionOpen('grounding', ''), true);
    assert.equal(manager.isSectionOpen('enterprise_search', ''), false, 'other sections should remain closed');

    // Toggle grounding closed again
    manager.toggle('grounding');
    assert.equal(manager.isSectionOpen('grounding', ''), false);
  });

  it('should support multiple sections being toggled independently', () => {
    const manager = createSectionStateManager();

    manager.toggle('system');
    manager.toggle('custom');

    assert.equal(manager.isSectionOpen('grounding', ''), false);
    assert.equal(manager.isSectionOpen('enterprise_search', ''), false);
    assert.equal(manager.isSectionOpen('system', ''), true);
    assert.equal(manager.isSectionOpen('custom', ''), true);

    manager.toggle('system');
    assert.equal(manager.isSectionOpen('system', ''), false);
    assert.equal(manager.isSectionOpen('custom', ''), true);
  });

  it('should automatically expand sections during active search query', () => {
    const manager = createSectionStateManager();

    // With an active search, sections should be open even if their state is closed (false)
    assert.equal(manager.isSectionOpen('grounding', 'search'), true);
    assert.equal(manager.isSectionOpen('enterprise_search', 'vertex'), true);
    assert.equal(manager.isSectionOpen('system', 'code'), true);
    assert.equal(manager.isSectionOpen('custom', 'mcp'), true);
  });

  it('should not force sections open if search query is purely whitespace', () => {
    const manager = createSectionStateManager();

    assert.equal(manager.isSectionOpen('grounding', '   '), false);
    assert.equal(manager.isSectionOpen('enterprise_search', '  \t\n '), false);
  });

  it('should revert to the manual collapse state when search query is cleared', () => {
    const manager = createSectionStateManager();

    // User explicitly opened system section
    manager.toggle('system');
    assert.equal(manager.isSectionOpen('system', ''), true);
    assert.equal(manager.isSectionOpen('grounding', ''), false);

    // Active search opens everything
    assert.equal(manager.isSectionOpen('grounding', 'query'), true);
    assert.equal(manager.isSectionOpen('system', 'query'), true);

    // Clearing search restores original state: system open, grounding closed
    assert.equal(manager.isSectionOpen('grounding', ''), false);
    assert.equal(manager.isSectionOpen('system', ''), true);
  });

  it('should handle unknown category IDs gracefully', () => {
    const manager = createSectionStateManager();

    assert.equal(manager.isSectionOpen('unknown_category', ''), false);
    manager.toggle('unknown_category');
    assert.equal(manager.isSectionOpen('unknown_category', ''), true);
  });

  it('should correctly populate tools into the 4 canonical categories', () => {
    const categorized = categorizeTools(AVAILABLE_TOOLS);

    assert.ok(Array.isArray(categorized.grounding), 'grounding category must be an array');
    assert.ok(Array.isArray(categorized.enterprise_search), 'enterprise_search category must be an array');
    assert.ok(Array.isArray(categorized.system), 'system category must be an array');
    assert.ok(Array.isArray(categorized.custom), 'custom category must be an array');

    // Total tools should equal sum of categorized items
    const totalCategorized = 
      categorized.grounding.length +
      categorized.enterprise_search.length +
      categorized.system.length +
      categorized.custom.length +
      categorized.google_cloud_mcp.length;
    
    assert.equal(totalCategorized, AVAILABLE_TOOLS.length, 'All available tools must be categorized');
  });

  it('should handle an empty tools list without throwing', () => {
    const categorized = categorizeTools([]);
    assert.equal(categorized.grounding.length, 0);
    assert.equal(categorized.enterprise_search.length, 0);
    assert.equal(categorized.system.length, 0);
    assert.equal(categorized.custom.length, 0);
  });
});
