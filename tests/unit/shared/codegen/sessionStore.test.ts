/**
 * sessionStore.test.ts
 *
 * Unit tests for Python ADK Session Store code generation.
 * Validates checkpointer generation for SQLite, Firestore, Cloud SQL, Spanner, and Redis.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateSessionStorePyForWorkflow } from '../../../../src/shared/codegen/pythonAdkGenerator';
import { AgentWorkflowDocument } from '../../../../src/shared/agentSpec';

describe('Python ADK Session Store Code Generator Suite', () => {
  it('should generate base session store with all checkpointer classes', () => {
    const doc: AgentWorkflowDocument = {
      id: 'wf-stateless',
      name: 'Stateless Agent',
      nodes: [],
      edges: [],
    };

    const code = generateSessionStorePyForWorkflow(doc);
    assert.ok(code.includes('class BaseSessionStore(ABC):'));
    assert.ok(code.includes('class StatelessSessionStore(BaseSessionStore):'));
    assert.ok(code.includes('class InMemorySessionStore(BaseSessionStore):'));
    assert.ok(code.includes('class SqliteSessionStore(BaseSessionStore):'));
    assert.ok(code.includes('class FirestoreSessionStore(BaseSessionStore):'));
    assert.ok(code.includes('class CloudSqlSessionStore(BaseSessionStore):'));
    assert.ok(code.includes('class SpannerSessionStore(BaseSessionStore):'));
    assert.ok(code.includes('class RedisSessionStore(BaseSessionStore):'));
    assert.ok(code.includes('def get_session_store('));
  });

  it('should generate Cloud SQL Postgres checkpointer with auto-DDL and indexing', () => {
    const doc: AgentWorkflowDocument = {
      id: 'wf-cloud-sql',
      name: 'Cloud SQL Agent',
      nodes: [
        {
          id: 'agent-sql',
          data: {
            label: 'SQL Agent',
            memory: {
              type: 'cloud_sql',
              instanceConnectionName: 'proj:region:inst',
              databaseName: 'agent_sessions_db',
              databaseUrlSecret: 'DB_SECRET',
              tableName: 'my_custom_sessions',
            },
          },
        },
      ],
      edges: [],
    };

    const code = generateSessionStorePyForWorkflow(doc);
    assert.ok(code.includes('CREATE TABLE IF NOT EXISTS my_custom_sessions'));
    assert.ok(code.includes('CREATE INDEX IF NOT EXISTS idx_my_custom_sessions_user_id'));
    assert.ok(code.includes('psycopg2'));
    assert.ok(code.includes('proj:region:inst'));
  });

  it('should generate Cloud Spanner checkpointer with commit timestamp DDL', () => {
    const doc: AgentWorkflowDocument = {
      id: 'wf-spanner',
      name: 'Spanner Agent',
      nodes: [
        {
          id: 'agent-spanner',
          data: {
            label: 'Spanner Agent',
            memory: {
              type: 'spanner',
              instanceId: 'spanner-instance-1',
              databaseId: 'spanner-db-1',
              tableName: 'EnterpriseSessions',
            },
          },
        },
      ],
      edges: [],
    };

    const code = generateSessionStorePyForWorkflow(doc);
    assert.ok(code.includes('CREATE TABLE IF NOT EXISTS EnterpriseSessions'));
    assert.ok(code.includes('allow_commit_timestamp=true'));
    assert.ok(code.includes('google.cloud.spanner'));
    assert.ok(code.includes('spanner-instance-1'));
  });

  it('should generate Cloud Memorystore Redis checkpointer with TTL support', () => {
    const doc: AgentWorkflowDocument = {
      id: 'wf-redis',
      name: 'Redis Agent',
      nodes: [
        {
          id: 'agent-redis',
          data: {
            label: 'Redis Agent',
            memory: {
              type: 'redis',
              redisHost: '10.128.0.3',
              redisPort: 6379,
              ttlSeconds: 3600,
            },
          },
        },
      ],
      edges: [],
    };

    const code = generateSessionStorePyForWorkflow(doc);
    assert.ok(code.includes('class RedisSessionStore'));
    assert.ok(code.includes('import redis'));
    assert.ok(code.includes('self.ttl_seconds = int(ttl_seconds or 3600)'));
    assert.ok(code.includes('10.128.0.3'));
    assert.ok(code.includes('self.client.setex(key, self.ttl_seconds'));
  });

  it('should generate SQLite checkpointer with auto table creation', () => {
    const doc: AgentWorkflowDocument = {
      id: 'wf-sqlite',
      name: 'SQLite Agent',
      nodes: [
        {
          id: 'agent-sqlite',
          data: {
            label: 'SQLite Agent',
            memory: {
              type: 'sqlite',
              sqlitePath: './custom_sessions.sqlite',
              tableName: 'local_sessions',
            },
          },
        },
      ],
      edges: [],
    };

    const code = generateSessionStorePyForWorkflow(doc);
    assert.ok(code.includes('CREATE TABLE IF NOT EXISTS local_sessions'));
    assert.ok(code.includes('./custom_sessions.sqlite'));
  });
});
