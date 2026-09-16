/**
 * memoryValidation.test.ts
 *
 * Unit tests for session memory and checkpointer validation logic.
 * Validates Cloud SQL, Cloud Spanner, and Cloud Memorystore Redis checkpointer constraints.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateMemoryConfig, validateWorkflowMemory } from '../../src/shared/memoryValidation';
import { AgentWorkflowDocument } from '../../src/shared/agentSpec';

describe('Memory Validation Suite', () => {
  it('should pass validation when memory is none or in_memory', () => {
    const resNone = validateMemoryConfig({ type: 'none' });
    assert.equal(resNone.isValid, true);
    assert.equal(resNone.errors.length, 0);

    const resMem = validateMemoryConfig({ type: 'in_memory' });
    assert.equal(resMem.isValid, true);
    assert.equal(resMem.errors.length, 0);
  });

  describe('Cloud SQL / PostgreSQL Validation', () => {
    it('should fail when Cloud SQL is missing mandatory parameters', () => {
      const res = validateMemoryConfig({
        type: 'cloud_sql',
      });
      assert.equal(res.isValid, false);
      assert.ok(res.errors.some((e) => e.includes('Instance Connection Name')));
      assert.ok(res.errors.some((e) => e.includes('Database Name')));
      assert.ok(res.errors.some((e) => e.includes('Database URL Secret Name')));
    });

    it('should pass when Cloud SQL has all required connection parameters', () => {
      const res = validateMemoryConfig({
        type: 'cloud_sql',
        instanceConnectionName: 'my-project:us-central1:my-instance',
        databaseName: 'agent_db',
        databaseUrlSecret: 'DATABASE_URL',
      });
      assert.equal(res.isValid, true);
      assert.equal(res.errors.length, 0);
    });

    it('should pass when postgres has connectionEnvVar instead of secret', () => {
      const res = validateMemoryConfig({
        type: 'postgres',
        instanceConnectionName: 'my-project:us-central1:my-instance',
        databaseName: 'agent_db',
        connectionEnvVar: 'DB_CONNECTION_STRING',
      });
      assert.equal(res.isValid, true);
      assert.equal(res.errors.length, 0);
    });
  });

  describe('Cloud Spanner Validation', () => {
    it('should fail when Spanner is missing instanceId or databaseId', () => {
      const res = validateMemoryConfig({
        type: 'spanner',
      });
      assert.equal(res.isValid, false);
      assert.ok(res.errors.some((e) => e.includes('Spanner Instance ID')));
      assert.ok(res.errors.some((e) => e.includes('Spanner Database ID')));
    });

    it('should pass when Spanner has instanceId and databaseId', () => {
      const res = validateMemoryConfig({
        type: 'spanner',
        instanceId: 'agent-sessions-instance',
        databaseId: 'sessions-db',
      });
      assert.equal(res.isValid, true);
      assert.equal(res.errors.length, 0);
    });
  });

  describe('Cloud Memorystore Redis Validation', () => {
    it('should fail when Redis is missing host or has invalid port', () => {
      const res = validateMemoryConfig({
        type: 'redis',
        redisPort: 0,
      });
      assert.equal(res.isValid, false);
      assert.ok(res.errors.some((e) => e.includes('Redis Host')));
      assert.ok(res.errors.some((e) => e.includes('numeric Redis Port')));
    });

    it('should pass when Redis has valid host and port', () => {
      const res = validateMemoryConfig({
        type: 'redis',
        redisHost: '10.0.0.5',
        redisPort: 6379,
        ttlSeconds: 86400,
      });
      assert.equal(res.isValid, true);
      assert.equal(res.errors.length, 0);
    });

    it('should fail when Redis TTL is negative', () => {
      const res = validateMemoryConfig({
        type: 'redis',
        redisHost: '10.0.0.5',
        redisPort: 6379,
        ttlSeconds: -10,
      });
      assert.equal(res.isValid, false);
      assert.ok(res.errors.some((e) => e.includes('TTL must be a positive number')));
    });
  });

  describe('Workflow Document Tree Validation', () => {
    it('should validate memory configurations across workflow nodes and agents', () => {
      const doc: AgentWorkflowDocument = {
        id: 'wf-mem',
        name: 'Memory Test Workflow',
        nodes: [
          {
            id: 'node-1',
            data: {
              label: 'SQL Agent',
              memory: {
                type: 'cloud_sql',
                instanceConnectionName: '',
                databaseName: '',
              },
            },
          },
        ],
        edges: [],
      };

      const result = validateWorkflowMemory(doc);
      assert.equal(result.isValid, false);
      assert.ok(result.errors.length >= 2);
    });

    it('should produce warnings for SQLite in cloud workflows', () => {
      const doc: AgentWorkflowDocument = {
        id: 'wf-sqlite',
        name: 'SQLite Workflow',
        nodes: [
          {
            id: 'node-1',
            data: {
              label: 'Local SQLite Agent',
              memory: {
                type: 'sqlite',
                sqlitePath: './sessions.db',
              },
            },
          },
        ],
        edges: [],
      };

      const result = validateWorkflowMemory(doc);
      assert.equal(result.isValid, true);
      assert.equal(result.warnings.length, 1);
      assert.ok(result.warnings[0].includes('local disk file'));
    });
  });
});
