/**
 * memoryOptions.ts
 *
 * Registry and metadata definitions for agent session memory and production checkpointers.
 * Supports stateless execution, in-memory buffers, Cloud Firestore, Cloud SQL (PostgreSQL/MySQL),
 * Cloud Spanner, Cloud Memorystore (Redis/Valkey), and SQLite local checkpointers.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { AgentMemoryType, AgentMemoryConfig } from '../types';

export interface MemoryOptionDefinition {
  type: AgentMemoryType;
  name: string;
  category: 'Stateless' | 'In-Memory' | 'Google Cloud' | 'Database' | 'Cache';
  badge: string;
  iconName: string;
  description: string;
  bestFor: string;
  defaultConfig: AgentMemoryConfig;
}

export const MEMORY_OPTIONS: MemoryOptionDefinition[] = [
  {
    type: 'none',
    name: 'Stateless (No Memory)',
    category: 'Stateless',
    badge: 'Stateless Execution',
    iconName: 'Ban',
    description: 'Zero memory retention across invocations. Every conversation turn executes in complete isolation.',
    bestFor: 'Pure functional workflows, deterministic pipelines, and one-off batch processors.',
    defaultConfig: {
      type: 'none',
    },
  },
  {
    type: 'in_memory',
    name: 'In-Memory Turn Buffer',
    category: 'In-Memory',
    badge: 'Ephemeral Buffer',
    iconName: 'Cpu',
    description: 'Maintains conversational turn history in application memory during the active server lifecycle.',
    bestFor: 'Local rapid prototyping, single-session testing, and demo environments.',
    defaultConfig: {
      type: 'in_memory',
      windowTurns: 10,
      maxTokens: 4096,
    },
  },
  {
    type: 'firestore',
    name: 'Google Cloud Firestore',
    category: 'Google Cloud',
    badge: 'Serverless NoSQL',
    iconName: 'Flame',
    description: 'Production-grade serverless NoSQL checkpointer persisting chat sessions, turns, and state checkpoints.',
    bestFor: 'High-scale web applications, serverless Cloud Run deployments, and real-time state sync.',
    defaultConfig: {
      type: 'firestore',
      collectionName: 'agent_sessions',
      databaseId: '(default)',
      connectionEnvVar: 'GOOGLE_CLOUD_PROJECT',
    },
  },
  {
    type: 'postgres',
    name: 'Google Cloud SQL (PostgreSQL)',
    category: 'Google Cloud',
    badge: 'Relational DB',
    iconName: 'Database',
    description: 'Enterprise relational session checkpointer with auto-DDL initialization and Secret Manager connection resolution.',
    bestFor: 'Transactional multi-agent workflows, audit-heavy enterprise services, and relational architectures.',
    defaultConfig: {
      type: 'postgres',
      instanceConnectionName: '',
      databaseName: 'agent_sessions_db',
      databaseUrlSecret: 'DATABASE_URL',
      tableName: 'agent_sessions',
    },
  },
  {
    type: 'spanner',
    name: 'Google Cloud Spanner',
    category: 'Google Cloud',
    badge: 'Globally Distributed',
    iconName: 'Boxes',
    description: 'Mission-critical, globally distributed checkpointer with auto-DDL verification and unlimited horizontal scale.',
    bestFor: 'Multi-region enterprise applications, global multi-agent orchestration, and 99.999% SLA requirements.',
    defaultConfig: {
      type: 'spanner',
      instanceId: '',
      databaseId: '',
      tableName: 'AgentSessions',
    },
  },
  {
    type: 'redis',
    name: 'Cloud Memorystore (Redis / Valkey)',
    category: 'Cache',
    badge: 'Sub-millisecond Cache',
    iconName: 'Zap',
    description: 'Ultra-low latency in-memory checkpointer with automatic TTL key expiration and high throughput.',
    bestFor: 'Real-time conversational voice/chat agents, high-concurrency bot fleets, and ephemeral sessions.',
    defaultConfig: {
      type: 'redis',
      redisHost: '',
      redisPort: 6379,
      authSecretName: '',
      ttlSeconds: 86400,
    },
  },
];

/**
 * Retrieves memory option definition for a given memory type.
 *
 * @param type AgentMemoryType
 * @returns MemoryOptionDefinition
 */
export function getMemoryOption(type?: AgentMemoryType | string): MemoryOptionDefinition {
  if (!type) {
    return MEMORY_OPTIONS[0];
  }
  const matched = MEMORY_OPTIONS.find((m) => m.type === type);
  if (matched) return matched;
  if (type === 'cloud_sql') {
    return MEMORY_OPTIONS.find((m) => m.type === 'postgres') || MEMORY_OPTIONS[0];
  }
  if (type === 'langgraph_in_memory' || type === 'sqlite') {
    return MEMORY_OPTIONS.find((m) => m.type === 'in_memory') || MEMORY_OPTIONS[0];
  }
  return MEMORY_OPTIONS[0];
}
