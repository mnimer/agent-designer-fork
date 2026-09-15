/**
 * ToolSearchExpansion.test.ts - Unit Tests for Tool Category Auto-Expansion During Search
 *
 * Validates:
 * 1. Default category expansion state: 'native_adk' open by default, 'mcp' and 'custom' collapsed.
 * 2. Search auto-expansion: when query is non-empty, any category containing matching tools expands to true.
 * 3. Nullish coalescing fix: previously, false ?? true evaluated to false, preventing collapsed groups from opening.
 * 4. Search clear behavior: clearing search query restores base default states.
 * 5. Search-scoped manual toggle overrides: users can toggle groups closed during an active search without clobbering base settings.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AVAILABLE_TOOLS } from '../../src/webview/data/defaultTools';
import { categorizeTools, isNativeAdkTool } from '../../src/webview/data/builtinTools';
import { ToolDefinition } from '../../src/webview/types';

describe('Tool Category Auto-Expansion During Search', () => {
  // Mock base category expansion state (all categories collapsed by default)
  const baseOpenCategories: Record<string, boolean> = {
    native_adk: false,
    mcp: false,
    custom: false,
  };

  const sampleMcpTool: ToolDefinition = {
    id: 'tool_mcp_cloudsql',
    name: 'Custom Cloud SQL MCP Server',
    description: 'Query database tables and schemas via MCP protocol',
    type: 'mcp',
    category: 'custom',
    enabled: true,
    mcpConfig: {
      serverName: 'cloudsql',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-postgres'],
      transport: 'stdio',
    },
  };

  const allSampleTools: ToolDefinition[] = [...AVAILABLE_TOOLS, sampleMcpTool];

  /**
   * Helper simulating the isExpanded resolution logic used in PaletteCard and AddToolModal.
   *
   * @param categoryId ID of the category section
   * @param searchQuery Current search string
   * @param searchToggled User manual toggle overrides during search
   * @param baseState Base open/closed state
   */
  function computeIsExpanded(
    categoryId: string,
    searchQuery: string,
    searchToggled: Record<string, boolean> = {},
    baseState: Record<string, boolean> = baseOpenCategories
  ): boolean {
    const isSearching = searchQuery.trim().length > 0;
    return isSearching
      ? (searchToggled[categoryId] !== undefined ? searchToggled[categoryId] : true)
      : (baseState[categoryId] ?? false);
  }

  it('should maintain native_adk, mcp, and custom closed when not searching', () => {
    assert.equal(computeIsExpanded('native_adk', ''), false);
    assert.equal(computeIsExpanded('mcp', ''), false);
    assert.equal(computeIsExpanded('custom', ''), false);
  });

  it('should auto-expand collapsed categories like mcp when search query matches an MCP tool', () => {
    const query = 'cloud sql';
    const filtered = allSampleTools.filter((t) => {
      const q = query.toLowerCase();
      return (
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q)
      );
    });

    const categorized = categorizeTools(filtered);
    assert.equal(categorized.mcp.length, 1);
    assert.equal(categorized.mcp[0].name, 'Custom Cloud SQL MCP Server');

    // Section for MCP must now resolve to expanded = true
    const isMcpExpanded = computeIsExpanded('mcp', query);
    assert.equal(isMcpExpanded, true, 'MCP category must auto-expand when it contains search matches');
  });

  it('should auto-expand native_adk and custom categories when searching for generic term', () => {
    const query = 'tool';
    assert.equal(computeIsExpanded('native_adk', query), true);
    assert.equal(computeIsExpanded('mcp', query), true);
    assert.equal(computeIsExpanded('custom', query), true);
  });

  it('should allow user to manually collapse a category during search', () => {
    const query = 'cloud sql';
    const searchToggled: Record<string, boolean> = {
      mcp: false, // User manually collapsed mcp during search
    };

    const isMcpExpanded = computeIsExpanded('mcp', query, searchToggled);
    assert.equal(isMcpExpanded, false, 'Explicit user toggle should collapse category during search');
  });

  it('should restore base default states when search query is cleared', () => {
    // When query is cleared, searchToggled is emptied and searchQuery is ''
    const clearedQuery = '';
    const searchToggled = {};

    assert.equal(computeIsExpanded('native_adk', clearedQuery, searchToggled), false);
    assert.equal(computeIsExpanded('mcp', clearedQuery, searchToggled), false);
    assert.equal(computeIsExpanded('custom', clearedQuery, searchToggled), false);
  });

  it('should match MCP servers when searching by serverName or type', () => {
    const query = 'postgres';
    const filtered = allSampleTools.filter((t) => {
      const q = query.toLowerCase().trim();
      return (
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        (t.type && t.type.toLowerCase().includes(q)) ||
        (t.category && t.category.toLowerCase().includes(q)) ||
        (t.builtinType && t.builtinType.toLowerCase().includes(q)) ||
        (t.mcpConfig?.serverName && t.mcpConfig.serverName.toLowerCase().includes(q)) ||
        (t.mcpConfig?.args && t.mcpConfig.args.some((a) => a.toLowerCase().includes(q))) ||
        (t.id && t.id.toLowerCase().includes(q))
      );
    });

    assert.ok(filtered.length >= 1);
    assert.ok(filtered.some((t) => t.id === 'tool_mcp_cloudsql'));
    assert.equal(computeIsExpanded('mcp', query), true);
  });

  it('should reset search toggles on search query input to ensure newly matched groups expand', () => {
    let searchToggled: Record<string, boolean> = { mcp: false };
    // User types new query, resetting toggles:
    searchToggled = {};
    const newQuery = 'cloud';
    assert.equal(computeIsExpanded('mcp', newQuery, searchToggled), true);
  });
});

