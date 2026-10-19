/**
 * Unit Tests for ADK Native SpannerToolset Integration (TASK-231)
 *
 * Validates:
 * 1. Spanner tool names catalog (`SPANNER_TOOLSET_TOOLS`).
 * 2. Factory helper `createSpannerToolsetDefinition` with read-only defaults.
 * 3. Parameterized database configuration (projectId, instanceId, databaseId).
 * 4. Python ADK code generation with `SpannerToolSettings` and `read_only`.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SPANNER_TOOLSET_TOOLS,
  createSpannerToolsetDefinition,
  generateSpannerToolsetPythonCode,
} from '../../../src/webview/data/builtinToolsRegistry';
import { SpannerToolsetConfig } from '../../../src/shared/agentSpec';

describe('TASK-231: ADK Native SpannerToolset Integration', () => {
  it('should list all 4 official Spanner sub-tools', () => {
    assert.equal(SPANNER_TOOLSET_TOOLS.length, 4);
    assert.ok(SPANNER_TOOLSET_TOOLS.includes('execute_sql'));
    assert.ok(SPANNER_TOOLSET_TOOLS.includes('list_table_names'));
    assert.ok(SPANNER_TOOLSET_TOOLS.includes('get_table_schema'));
    assert.ok(SPANNER_TOOLSET_TOOLS.includes('similarity_search'));
  });

  it('should create SpannerToolset definition with readOnly set to true by default', () => {
    const config: SpannerToolsetConfig = {
      projectId: 'gcp-core-project',
      instanceId: 'spanner-main',
      databaseId: 'accounts_db',
    };

    const toolDef = createSpannerToolsetDefinition(config);
    assert.ok(toolDef.id.startsWith('builtin_spanner_toolset_'));
    assert.equal(toolDef.name, 'Spanner: accounts_db');
    assert.equal(toolDef.builtinType, 'spanner_toolset');
    assert.equal(toolDef.category, 'db');
    assert.equal(toolDef.type, 'database');
    assert.ok(toolDef.spannerToolsetConfig);
    assert.equal(toolDef.spannerToolsetConfig.readOnly, true);
    assert.equal(toolDef.spannerToolsetConfig.enabledTools?.length, 4);
  });

  it('should generate valid Python ADK initialization code using SpannerToolSettings', () => {
    const config: SpannerToolsetConfig = {
      projectId: 'retail-prod',
      instanceId: 'prod-instance',
      databaseId: 'catalog_db',
      readOnly: true,
    };

    const code = generateSpannerToolsetPythonCode(config);
    assert.ok(code.includes('from google.adk.tools.spanner import SpannerToolset, SpannerCredentialsConfig'));
    assert.ok(code.includes('from google.adk.tools.spanner.config import SpannerToolSettings'));
    assert.ok(code.includes('project_id="retail-prod"'));
    assert.ok(code.includes('instance_id="prod-instance"'));
    assert.ok(code.includes('database_id="catalog_db"'));
    assert.ok(code.includes('read_only=True'));
  });

  it('should reflect read_only=False in generated code when mutation is permitted', () => {
    const config: SpannerToolsetConfig = {
      projectId: 'retail-prod',
      instanceId: 'prod-instance',
      databaseId: 'catalog_db',
      readOnly: false,
    };

    const code = generateSpannerToolsetPythonCode(config);
    assert.ok(code.includes('read_only=False'));
  });
});
