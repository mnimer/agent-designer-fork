/**
 * Agent Memory & Checkpoint Configuration Definitions
 *
 * Supported memory providers spanning LangGraph memory savers,
 * Google Cloud Firestore sessions, SQLite, Redis, and semantic RAG vector memory.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { MemoryType } from '../../shared/types';

export interface MemoryOptionDefinition {
  type: MemoryType;
  name: string;
  badge: string;
  description: string;
  bestFor: string;
}

export const MEMORY_OPTIONS: MemoryOptionDefinition[] = [
  {
    type: 'none',
    name: 'Stateless (No Memory)',
    badge: 'Stateless',
    description: 'Zero memory retention across invocations. Every query executes in isolation.',
    bestFor: 'Pure functional workflows, deterministic pipelines, and single-shot batch tasks.',
  },
  {
    type: 'buffer',
    name: 'Sliding Window Buffer',
    badge: 'In-Memory Window',
    description: 'Maintains recent conversation turns in memory buffer during multi-turn chats.',
    bestFor: 'Interactive chat sessions and quick conversational flows.',
  },
  {
    type: 'firestore',
    name: 'Google Cloud Firestore',
    badge: 'Serverless Cloud Store',
    description: 'Cloud Firestore document session storage native to Google GenAI and Google ADK agents.',
    bestFor: 'Serverless Cloud Run apps and persistent multi-tenant chat sessions.',
  },
  {
    type: 'postgres',
    name: 'PostgreSQL / Cloud SQL',
    badge: 'Relational Checkpointer',
    description: 'Persistent relational checkpointer storing thread state snapshots in PostgreSQL.',
    bestFor: 'Production multi-tenant apps and LangGraph enterprise checkpointers.',
  },
  {
    type: 'redis',
    name: 'Redis Cache Store',
    badge: 'Distributed Cache',
    description: 'Ultra low-latency thread checkpointer with automatic TTL session expiration.',
    bestFor: 'High-throughput chat systems and distributed agent clusters.',
  },
  {
    type: 'sqlite',
    name: 'SQLite File Store',
    badge: 'Local Embedded DB',
    description: 'Lightweight local file checkpointer storing state history in SQLite.',
    bestFor: 'Desktop apps, CLI agent tools, and single-machine edge deployments.',
  },
  {
    type: 'vector_rag',
    name: 'Vector Store / Semantic Memory',
    badge: 'Semantic Vector RAG',
    description: 'Embeds past interactions into a vector database for semantic similarity retrieval.',
    bestFor: 'Long-term cross-session knowledge recall and user preference recall.',
  },
];

export function getMemoryOption(type?: MemoryType): MemoryOptionDefinition {
  return MEMORY_OPTIONS.find((m) => m.type === type) || MEMORY_OPTIONS[0];
}
