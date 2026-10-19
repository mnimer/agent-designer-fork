/**
 * Unit Tests for ADK Built-in Control Flow & Memory Tools (TASK-234)
 *
 * Validates:
 * 1. Control flow tool descriptors for `exit_loop`, `transfer_to_agent`, `load_memory`, and `load_artifacts`.
 * 2. `ADK_CONTROL_FLOW_TOOLS` metadata, descriptions, and code prompts.
 * 3. `ADK_CONTROL_FLOW_TOOL_DEFINITIONS` catalog definitions.
 * 4. Python ADK import generation via `generateControlFlowToolsPythonImport`.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ADK_CONTROL_FLOW_TOOLS,
  ADK_CONTROL_FLOW_TOOL_DEFINITIONS,
  generateControlFlowToolsPythonImport,
} from '../../../src/webview/data/builtinToolsRegistry';

describe('TASK-234: ADK Built-in Control Flow & Memory Tools', () => {
  it('should describe all 4 ADK built-in control flow and memory tools', () => {
    assert.equal(ADK_CONTROL_FLOW_TOOLS.length, 4);

    const types = ADK_CONTROL_FLOW_TOOLS.map((t) => t.type);
    assert.ok(types.includes('exit_loop'));
    assert.ok(types.includes('transfer_to_agent'));
    assert.ok(types.includes('load_memory'));
    assert.ok(types.includes('load_artifacts'));

    const exitLoop = ADK_CONTROL_FLOW_TOOLS.find((t) => t.type === 'exit_loop')!;
    assert.ok(exitLoop.description.includes('escalate = True'));

    const transfer = ADK_CONTROL_FLOW_TOOLS.find((t) => t.type === 'transfer_to_agent')!;
    assert.ok(transfer.description.includes('hands off'));

    const memory = ADK_CONTROL_FLOW_TOOLS.find((t) => t.type === 'load_memory')!;
    assert.ok(memory.description.includes('BaseMemoryService'));

    const artifacts = ADK_CONTROL_FLOW_TOOLS.find((t) => t.type === 'load_artifacts')!;
    assert.ok(artifacts.description.includes('artifacts'));
  });

  it('should generate valid ToolDefinition objects in ADK_CONTROL_FLOW_TOOL_DEFINITIONS', () => {
    assert.equal(ADK_CONTROL_FLOW_TOOL_DEFINITIONS.length, 4);
    for (const def of ADK_CONTROL_FLOW_TOOL_DEFINITIONS) {
      assert.ok(def.id.startsWith('builtin_'));
      assert.equal(def.category, 'system');
      assert.equal(def.type, 'custom');
      assert.ok(def.builtinType);
      assert.equal(def.enabled, true);
    }
  });

  it('should generate Python ADK import statement for selected control flow tools', () => {
    const importStmt = generateControlFlowToolsPythonImport([
      'exit_loop',
      'transfer_to_agent',
      'load_memory',
      'load_artifacts',
    ]);

    assert.equal(
      importStmt,
      'from google.adk.tools import exit_loop, transfer_to_agent, load_memory, load_artifacts'
    );
  });

  it('should filter out non-flow tool types and return empty string if no match', () => {
    const mixed = generateControlFlowToolsPythonImport([
      'google_search',
      'vertex_ai_search',
      'exit_loop',
    ]);
    assert.equal(importStmtClean(mixed), 'from google.adk.tools import exit_loop');

    const none = generateControlFlowToolsPythonImport(['google_search']);
    assert.equal(none, '');
  });

  function importStmtClean(stmt: string) {
    return stmt.trim();
  }
});
