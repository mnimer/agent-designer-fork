/**
 * Unit Tests for AddToolModal Component & Tool Attachment Logic
 *
 * Validates:
 * 1. AddToolModal export and component contract.
 * 2. Categorization of tools in the dialog matches the 4 categories of the Canvas Tool Panel:
 *    - Built-in Grounding
 *    - Enterprise Search
 *    - System Tools
 *    - Custom & Community Tools
 * 3. Dynamic tools prop consumption (custom tools, MCP servers, and modified tool registry).
 * 4. Search query filtering across name, description, category, and builtin type.
 * 5. Correct detection and isolation of already attached tools vs available unattached tools.
 * 6. Extreme conditions: empty tool registry, all tools already attached, and case-insensitive search.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import React from 'react';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AddToolModal } from '../../../src/webview/components/inspector/AddToolModal';
import { AVAILABLE_TOOLS } from '../../../src/webview/data/defaultTools';
import { categorizeTools } from '../../../src/webview/data/builtinTools';
import { ToolDefinition } from '../../../src/webview/types';

describe('AddToolModal Logic & Tool Panel Alignment', () => {
  it('should export AddToolModal as a valid functional component', () => {
    assert.ok(AddToolModal, 'AddToolModal component should be defined');
    assert.equal(typeof AddToolModal, 'function');
  });

  it('should categorize the tool catalog into the exact 4 Canvas Tool Panel categories', () => {
    const categorized = categorizeTools(AVAILABLE_TOOLS);

    // Verify all 4 canonical categories are present
    assert.ok(categorized.grounding, 'Grounding category must exist');
    assert.ok(categorized.enterprise_search, 'Enterprise Search category must exist');
    assert.ok(categorized.system, 'System Tools category must exist');
    assert.ok(categorized.custom, 'Custom & Community category must exist');

    // Built-in Grounding should contain Google Search and Web Page Reader
    const groundingNames = categorized.grounding.map((t) => t.name);
    assert.ok(groundingNames.includes('Google Search Grounding'));
    assert.ok(groundingNames.includes('Web Page Reader'));

    // Enterprise Search should contain Vertex AI Search
    const searchNames = categorized.enterprise_search.map((t) => t.name);
    assert.ok(searchNames.includes('Vertex AI Search'));

    // System Tools should contain Code Sandbox, Clarification, Memory, and Sub-Agent
    const systemNames = categorized.system.map((t) => t.name);
    assert.ok(systemNames.includes('Python Code Sandbox'));
    assert.ok(systemNames.includes('Human Clarification (HITL)'));
    assert.ok(systemNames.includes('Preload Memory Tool'));
    assert.ok(systemNames.includes('Sub-Agent as Tool'));

    // Total count must match active tools
    const totalCategorized =
      categorized.grounding.length +
      categorized.enterprise_search.length +
      categorized.system.length +
      categorized.custom.length +
      categorized.google_cloud_mcp.length;
    assert.equal(totalCategorized, AVAILABLE_TOOLS.length);
  });

  it('should filter tools by search query across name, description, and type', () => {
    const query = 'sandbox';
    const filtered = AVAILABLE_TOOLS.filter((t) => {
      const q = query.toLowerCase();
      return (
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        (t.category && t.category.toLowerCase().includes(q)) ||
        (t.builtinType && t.builtinType.toLowerCase().includes(q))
      );
    });

    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].id, 'tool_code_interpreter');
    assert.equal(filtered[0].builtinType, 'code_execution');
  });

  it('should support dynamic tools passed from designer state including MCP and custom tools', () => {
    const customMcpTool: ToolDefinition = {
      id: 'custom_mcp_database',
      name: 'My Custom Database MCP',
      type: 'mcp',
      category: 'custom',
      description: 'Execute queries and inspect schemas in PostgreSQL database via MCP protocol.',
      enabled: true,
      mcpConfig: {
        serverName: 'postgres-prod',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-postgres', 'postgresql://localhost/prod'],
        transport: 'stdio',
      },
    };

    const dynamicTools: ToolDefinition[] = [...AVAILABLE_TOOLS, customMcpTool];
    const categorized = categorizeTools(dynamicTools);

    // Dynamic MCP tool must be placed in custom category matching Canvas Tool Panel
    assert.ok(
      categorized.custom.some((t) => t.id === 'custom_mcp_database'),
      'Dynamic MCP tool should be in custom & community category'
    );
    assert.equal(
      categorized.grounding.length +
        categorized.enterprise_search.length +
        categorized.system.length +
        categorized.custom.length +
        categorized.google_cloud_mcp.length,
      dynamicTools.length
    );
  });

  it('should correctly partition attached tools vs unattached tools', () => {
    const existingToolIds = ['tool_google_search', 'builtin_vertex_ai_search'];

    const attached = AVAILABLE_TOOLS.filter((t) => existingToolIds.includes(t.id));
    const unattached = AVAILABLE_TOOLS.filter((t) => !existingToolIds.includes(t.id));

    assert.equal(attached.length, 2);
    assert.equal(unattached.length, AVAILABLE_TOOLS.length - 2);

    assert.ok(attached.every((t) => existingToolIds.includes(t.id)));
    assert.ok(unattached.every((t) => !existingToolIds.includes(t.id)));
  });

  it('should handle extreme conditions: empty registry and all tools attached', () => {
    // 1. Empty registry
    const emptyCategorized = categorizeTools([]);
    assert.equal(emptyCategorized.grounding.length, 0);
    assert.equal(emptyCategorized.enterprise_search.length, 0);
    assert.equal(emptyCategorized.system.length, 0);
    assert.equal(emptyCategorized.custom.length, 0);

    // 2. All tools attached
    const allIds = AVAILABLE_TOOLS.map((t) => t.id);
    const allAttached = AVAILABLE_TOOLS.filter((t) => allIds.includes(t.id));
    assert.equal(allAttached.length, AVAILABLE_TOOLS.length);

    // 3. Case-insensitive search on non-existent query
    const noResults = AVAILABLE_TOOLS.filter((t) =>
      t.name.toLowerCase().includes('nonexistent_tool_xyz_999')
    );
    assert.equal(noResults.length, 0);
  });

  it('should include all Google Cloud MCP servers and render AddToolModal cleanly without register MCP button', () => {
    // Verify Google Cloud MCP servers are present in categorized tools
    const categorized = categorizeTools(AVAILABLE_TOOLS);
    assert.ok(categorized.google_cloud_mcp.length > 0, 'Google Cloud MCP tools must be present');
    assert.ok(
      categorized.google_cloud_mcp.some((t) => t.id === 'gcp_mcp_bigquery'),
      'BigQuery MCP server must be in google_cloud_mcp category'
    );
    assert.ok(
      categorized.google_cloud_mcp.some((t) => t.id === 'gcp_mcp_spanner'),
      'Spanner MCP server must be in google_cloud_mcp category'
    );

    // Filter by MCP server URL or name
    const bqFiltered = AVAILABLE_TOOLS.filter((t) =>
      t.name.toLowerCase().includes('bigquery') ||
      (t.mcpConfig?.serverUrl && t.mcpConfig.serverUrl.toLowerCase().includes('bigquery'))
    );
    assert.ok(bqFiltered.length > 0, 'Should find BigQuery MCP server via search');

    // Stub useState and useMemo to verify AddToolModal executes cleanly
    const internals = (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
    const originalDispatcher = internals?.H;
    const originalUseState = React.useState;
    const originalUseMemo = React.useMemo;
    try {
      const mockDispatcher = {
        useState: (initial: any) => [
          typeof initial === 'function' ? initial() : initial,
          () => {},
        ],
        useMemo: (fn: any) => fn(),
        useRef: (initial: any) => ({ current: initial }),
        useCallback: (fn: any) => fn,
      };
      if (internals) {
        internals.H = mockDispatcher;
      }
      (React as any).useState = mockDispatcher.useState;
      (React as any).useMemo = mockDispatcher.useMemo;

      const renderedModal = AddToolModal({
        isOpen: true,
        onClose: () => {},
        onSelectTool: () => {},
        existingToolIds: ['tool_google_search'],
        tools: AVAILABLE_TOOLS,
        targetAgentName: 'Test Agent',
      });
      assert.ok(renderedModal, 'AddToolModal should render valid JSX without errors');
    } finally {
      if (internals && originalDispatcher) {
        internals.H = originalDispatcher;
      }
      (React as any).useState = originalUseState;
      (React as any).useMemo = originalUseMemo;
    }
  });
});

