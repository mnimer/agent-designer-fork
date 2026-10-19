/**
 * Unit Tests for ADK Native BigQueryToolset Integration (TASK-230)
 *
 * Validates:
 * 1. BigQuery tool names catalog (`BIGQUERY_TOOLSET_TOOLS`).
 * 2. Factory helper `createBigQueryToolsetDefinition` and WriteMode safety defaults (`BLOCKED`).
 * 3. Support for `WriteMode.BLOCKED`, `WriteMode.PROTECTED`, and `WriteMode.ALLOWED`.
 * 4. Sub-tool filtering via `tool_filter` in generated Python ADK code.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BIGQUERY_TOOLSET_TOOLS,
  createBigQueryToolsetDefinition,
  generateBigQueryToolsetPythonCode,
} from '../../../src/webview/data/builtinToolsRegistry';
import { BigQueryToolsetConfig } from '../../../src/shared/agentSpec';

describe('TASK-230: ADK Native BigQueryToolset Integration', () => {
  it('should enumerate all 8 official BigQuery sub-tools', () => {
    assert.equal(BIGQUERY_TOOLSET_TOOLS.length, 8);
    assert.ok(BIGQUERY_TOOLSET_TOOLS.includes('list_dataset_ids'));
    assert.ok(BIGQUERY_TOOLSET_TOOLS.includes('get_dataset_info'));
    assert.ok(BIGQUERY_TOOLSET_TOOLS.includes('list_table_ids'));
    assert.ok(BIGQUERY_TOOLSET_TOOLS.includes('get_table_info'));
    assert.ok(BIGQUERY_TOOLSET_TOOLS.includes('execute_sql'));
    assert.ok(BIGQUERY_TOOLSET_TOOLS.includes('forecast'));
    assert.ok(BIGQUERY_TOOLSET_TOOLS.includes('analyze_contribution'));
    assert.ok(BIGQUERY_TOOLSET_TOOLS.includes('ask_data_insights'));
  });

  it('should create BigQueryToolset definition with default BLOCKED write mode', () => {
    const config: BigQueryToolsetConfig = {
      projectId: 'analytics-prod',
      location: 'US',
      writeMode: 'BLOCKED',
    };

    const toolDef = createBigQueryToolsetDefinition(config, 'Production BigQuery Toolset');
    assert.ok(toolDef.id.startsWith('builtin_bigquery_toolset_'));
    assert.equal(toolDef.name, 'Production BigQuery Toolset');
    assert.equal(toolDef.builtinType, 'bigquery_toolset');
    assert.equal(toolDef.category, 'db');
    assert.equal(toolDef.type, 'database');
    assert.ok(toolDef.bigQueryToolsetConfig);
    assert.equal(toolDef.bigQueryToolsetConfig.writeMode, 'BLOCKED');
    assert.equal(toolDef.bigQueryToolsetConfig.maxQueryResultRows, 100);
    assert.equal(toolDef.bigQueryToolsetConfig.enabledTools?.length, 8);
  });

  it('should generate Python code for read-only BLOCKED mode with tool filtering', () => {
    const config: BigQueryToolsetConfig = {
      writeMode: 'BLOCKED',
      enabledTools: ['execute_sql', 'list_table_ids'],
      maxQueryResultRows: 50,
    };

    const code = generateBigQueryToolsetPythonCode(config);
    assert.ok(code.includes('from google.adk.tools.bigquery import BigQueryToolset, BigQueryCredentialsConfig'));
    assert.ok(code.includes('from google.adk.tools.bigquery.config import BigQueryToolConfig, WriteMode'));
    assert.ok(code.includes('write_mode=WriteMode.BLOCKED'));
    assert.ok(code.includes('max_query_result_rows=50'));
    assert.ok(code.includes('tool_filter=["execute_sql","list_table_ids"]'));
  });

  it('should generate Python code for PROTECTED and ALLOWED write modes', () => {
    const protectedConfig: BigQueryToolsetConfig = {
      writeMode: 'PROTECTED',
      maxQueryResultRows: 200,
    };

    const protectedCode = generateBigQueryToolsetPythonCode(protectedConfig);
    assert.ok(protectedCode.includes('write_mode=WriteMode.PROTECTED'));

    const allowedConfig: BigQueryToolsetConfig = {
      writeMode: 'ALLOWED',
    };
    const allowedCode = generateBigQueryToolsetPythonCode(allowedConfig);
    assert.ok(allowedCode.includes('write_mode=WriteMode.ALLOWED'));
  });
});
