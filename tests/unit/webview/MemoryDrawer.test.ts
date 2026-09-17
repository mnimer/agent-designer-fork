/**
 * MemoryDrawer.test.ts
 *
 * Unit tests for Memory Drawer options registry, default configurations, and state handling.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MEMORY_OPTIONS, getMemoryOption } from '../../../src/webview/data/memoryOptions';
import { AgentMemoryConfig } from '../../../src/shared/agentSpec';

describe('Memory Drawer & Options Registry Suite', () => {
  it('should register all memory checkpointer backends excluding sqlite', () => {
    const types = MEMORY_OPTIONS.map((opt) => opt.type);
    assert.ok(types.includes('none'));
    assert.ok(types.includes('in_memory'));
    assert.ok(types.includes('firestore'));
    assert.ok(types.includes('postgres'));
    assert.ok(types.includes('spanner'));
    assert.ok(types.includes('redis'));
    assert.equal(types.includes('sqlite'), false);
  });

  it('should provide complete default configurations for each backend', () => {
    const pgOpt = getMemoryOption('postgres');
    assert.equal(pgOpt.type, 'postgres');
    assert.equal(pgOpt.category, 'Google Cloud');
    assert.equal(pgOpt.defaultConfig.tableName, 'agent_sessions');
    assert.equal(pgOpt.defaultConfig.databaseName, 'agent_sessions_db');

    const spannerOpt = getMemoryOption('spanner');
    assert.equal(spannerOpt.type, 'spanner');
    assert.equal(spannerOpt.category, 'Google Cloud');
    assert.equal(spannerOpt.defaultConfig.tableName, 'AgentSessions');

    const redisOpt = getMemoryOption('redis');
    assert.equal(redisOpt.type, 'redis');
    assert.equal(redisOpt.category, 'Cache');
    assert.equal(redisOpt.defaultConfig.redisPort, 6379);
    assert.equal(redisOpt.defaultConfig.ttlSeconds, 86400);

    const inMemoryOpt = getMemoryOption('in_memory');
    assert.equal(inMemoryOpt.type, 'in_memory');
    assert.equal(inMemoryOpt.category, 'In-Memory');
    assert.equal(inMemoryOpt.defaultConfig.windowTurns, 10);
  });

  it('should update memory config cleanly when switching backends', () => {
    let currentConfig: AgentMemoryConfig = { type: 'none' };

    // Switch to Postgres
    const pgDefaults = getMemoryOption('postgres').defaultConfig;
    currentConfig = {
      ...currentConfig,
      ...pgDefaults,
      type: 'postgres',
    };

    assert.equal(currentConfig.type, 'postgres');
    assert.equal(currentConfig.tableName, 'agent_sessions');

    // Update instance connection name
    currentConfig = {
      ...currentConfig,
      instanceConnectionName: 'my-proj:us-central1:db-inst',
      databaseUrlSecret: 'DB_SECRET_KEY',
    };

    assert.equal(currentConfig.instanceConnectionName, 'my-proj:us-central1:db-inst');
    assert.equal(currentConfig.databaseUrlSecret, 'DB_SECRET_KEY');
  });

  it('should default all created nodes to in_memory session buffer', async () => {
    const { createSingleAgentNode } = await import('../../../src/webview/data/patterns');
    const { DEFAULT_SETTINGS } = await import('../../../src/webview/context/SettingsContext');
    const { normalizeLoadedNodes } = await import('../../../src/webview/utils/workflowSync');

    // Verify settings default
    assert.equal(DEFAULT_SETTINGS.defaultMemoryType, 'in_memory');

    // Verify standard node creation default
    const standardNode = createSingleAgentNode(100, 100, undefined, undefined, 'standard');
    assert.equal(standardNode.data.memoryType, 'in_memory');
    assert.equal(standardNode.data.memoryConfig?.type, 'in_memory');

    // Verify router node creation default
    const routerNode = createSingleAgentNode(200, 200, undefined, undefined, 'router');
    assert.equal(routerNode.data.memoryType, 'in_memory');
    assert.equal(routerNode.data.memoryConfig?.type, 'in_memory');

    // Verify A2A node creation default
    const a2aNode = createSingleAgentNode(300, 300, undefined, undefined, 'a2a');
    assert.equal(a2aNode.data.memoryType, 'in_memory');
    assert.equal(a2aNode.data.memoryConfig?.type, 'in_memory');

    // Verify node structural mapping preserves configured memory
    const rawNodes = [
      {
        id: 'raw-node-1',
        type: 'agentNode',
        data: { label: 'Agent', memoryType: 'in_memory', memoryConfig: { type: 'in_memory' } },
      },
    ];
    const normalized = normalizeLoadedNodes(rawNodes as any);
    assert.equal(normalized[0].data.memoryType, 'in_memory');
    assert.equal(normalized[0].data.memoryConfig?.type, 'in_memory');
  });
});

