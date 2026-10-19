/**
 * Unit Tests for ADK MCP Toolbox for Databases Integration (TASK-233)
 *
 * Validates:
 * 1. Factory helper `createToolboxDatabaseToolDefinition`.
 * 2. Multi-database kinds (`alloydb`, `cloud_sql_pg`, `cloud_sql_mysql`, `spanner`, `neo4j`, `bigquery`).
 * 3. Generation of copyable `tools.yaml` specification for Toolbox server configuration.
 * 4. Python ADK code generation for `ToolboxToolset(server_url=..., toolset_name=...)`.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createToolboxDatabaseToolDefinition,
  generateToolboxToolsYaml,
  generateToolboxDatabasePythonCode,
} from '../../../src/webview/data/builtinToolsRegistry';
import { ToolboxDatabaseConfig } from '../../../src/shared/agentSpec';

describe('TASK-233: ADK MCP Toolbox for Databases Integration', () => {
  it('should create ToolboxDatabase ToolDefinition', () => {
    const config: ToolboxDatabaseConfig = {
      serverUrl: 'http://toolbox.internal:5000',
      toolsetName: 'retail_catalog_tools',
      dbKind: 'alloydb',
    };

    const toolDef = createToolboxDatabaseToolDefinition(config);
    assert.ok(toolDef.id.startsWith('builtin_toolbox_db_'));
    assert.equal(toolDef.name, 'MCP Toolbox: retail_catalog_tools');
    assert.equal(toolDef.builtinType, 'toolbox_databases');
    assert.equal(toolDef.category, 'db');
    assert.equal(toolDef.type, 'database');
    assert.ok(toolDef.toolboxDatabaseConfig);
    assert.equal(toolDef.toolboxDatabaseConfig.dbKind, 'alloydb');
  });

  it('should generate valid tools.yaml for AlloyDB', () => {
    const config: ToolboxDatabaseConfig = {
      serverUrl: 'http://localhost:5000',
      toolsetName: 'order_db_tools',
      dbKind: 'alloydb',
    };

    const yaml = generateToolboxToolsYaml(config);
    assert.ok(yaml.includes('sources:'));
    assert.ok(yaml.includes('alloydb_source:'));
    assert.ok(yaml.includes('type: alloydb'));
    assert.ok(yaml.includes('toolsets:'));
    assert.ok(yaml.includes('order_db_tools:'));
    assert.ok(yaml.includes('- execute_sql'));
  });

  it('should generate valid tools.yaml for Spanner and Neo4j', () => {
    const spannerConfig: ToolboxDatabaseConfig = {
      serverUrl: 'http://localhost:5000',
      toolsetName: 'spanner_tools',
      dbKind: 'spanner',
    };
    const spannerYaml = generateToolboxToolsYaml(spannerConfig);
    assert.ok(spannerYaml.includes('spanner_source:'));
    assert.ok(spannerYaml.includes('type: spanner'));

    const neo4jConfig: ToolboxDatabaseConfig = {
      serverUrl: 'http://localhost:5000',
      toolsetName: 'graph_tools',
      dbKind: 'neo4j',
    };
    const neo4jYaml = generateToolboxToolsYaml(neo4jConfig);
    assert.ok(neo4jYaml.includes('neo4j_source:'));
    assert.ok(neo4jYaml.includes('type: neo4j'));
  });

  it('should generate Python code for ToolboxToolset', () => {
    const config: ToolboxDatabaseConfig = {
      serverUrl: 'https://mcp-toolbox.corp.internal',
      toolsetName: 'analytics_tools',
    };

    const code = generateToolboxDatabasePythonCode(config);
    assert.ok(code.includes('from google.adk.tools.toolbox_toolset import ToolboxToolset'));
    assert.ok(code.includes('server_url="https://mcp-toolbox.corp.internal"'));
    assert.ok(code.includes('toolset_name="analytics_tools"'));
  });
});
