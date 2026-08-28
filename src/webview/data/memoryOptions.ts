import { AgentMemoryType, AgentMemoryConfig } from '../types';

export interface MemoryOptionDefinition {
  type: AgentMemoryType;
  name: string;
  category: 'LangGraph' | 'Database' | 'Short-Term' | 'Long-Term' | 'Stateless';
  badge: string;
  iconName: string;
  description: string;
  bestFor: string;
  defaultConfig: AgentMemoryConfig;
}

export const MEMORY_OPTIONS: MemoryOptionDefinition[] = [
  {
    type: 'langgraph_in_memory',
    name: 'LangGraph In-Memory (MemorySaver)',
    category: 'LangGraph',
    badge: 'LangGraph Checkpoint',
    iconName: 'Cpu',
    description: 'Thread checkpointing stored in runtime memory for multi-turn conversational agents.',
    bestFor: 'Rapid local development, single-instance web services, and unit testing.',
    defaultConfig: {
      type: 'langgraph_in_memory',
      threadIdKey: 'thread_id',
    },
  },
  {
    type: 'postgres',
    name: 'PostgreSQL / Cloud SQL (AsyncPostgresSaver)',
    category: 'Database',
    badge: 'ACID Relational Checkpoint',
    iconName: 'Database',
    description: 'Persistent relational checkpointer storing thread state snapshots & channel writes in PostgreSQL tables.',
    bestFor: 'Production multi-tenant apps, high availability, and Cloud SQL environments.',
    defaultConfig: {
      type: 'postgres',
      connectionEnvVar: 'DATABASE_URL',
      tableName: 'checkpoints',
      threadIdKey: 'thread_id',
    },
  },
  {
    type: 'redis',
    name: 'Redis Key-Value Store (RedisSaver)',
    category: 'Database',
    badge: 'Distributed Cache',
    iconName: 'Zap',
    description: 'Ultra low-latency thread checkpointer with automatic TTL session expiration and distributed state locking.',
    bestFor: 'High-throughput chat systems, ephemeral session states, and microservice clusters.',
    defaultConfig: {
      type: 'redis',
      connectionEnvVar: 'REDIS_URL',
      ttlSeconds: 86400,
      threadIdKey: 'session_id',
    },
  },
  {
    type: 'firestore',
    name: 'Google Cloud Firestore / Spanner (ADK)',
    category: 'Database',
    badge: 'Serverless Cloud Store',
    iconName: 'Cloud',
    description: 'Serverless cloud document session storage native to Google GenAI SDK and ADK agent workflows.',
    bestFor: 'Serverless Cloud Run apps, multi-region Google Cloud deployments, and real-time syncing.',
    defaultConfig: {
      type: 'firestore',
      collectionName: 'agent_sessions',
      connectionEnvVar: 'GOOGLE_CLOUD_PROJECT',
      threadIdKey: 'session_id',
    },
  },
  {
    type: 'sqlite',
    name: 'SQLite File Store (SqliteSaver)',
    category: 'Database',
    badge: 'Embedded Database',
    iconName: 'HardDrive',
    description: 'Lightweight local file checkpointer storing threads and state history in a single SQLite database file.',
    bestFor: 'Desktop apps, CLI agent tools, and edge deployments with zero database server setup.',
    defaultConfig: {
      type: 'sqlite',
      sqlitePath: './agent_memory.sqlite',
      tableName: 'checkpoints',
      threadIdKey: 'thread_id',
    },
  },
  {
    type: 'window_buffer',
    name: 'Sliding Window Buffer',
    category: 'Short-Term',
    badge: 'Context Window Buffer',
    iconName: 'History',
    description: 'Maintains a sliding window of the last K conversation turns or token budget inside the LLM prompt context.',
    bestFor: 'Chatbots with strict token limits and lightweight conversation continuity.',
    defaultConfig: {
      type: 'window_buffer',
      windowTurns: 10,
      maxTokens: 4000,
      threadIdKey: 'session_id',
    },
  },
  {
    type: 'summary_buffer',
    name: 'Conversation Summary Memory',
    category: 'Short-Term',
    badge: 'LLM Running Summary',
    iconName: 'FileText',
    description: 'Continuously synthesizes a running semantic summary of older conversation turns using a background LLM.',
    bestFor: 'Long-running multi-turn tasks without exceeding model context window constraints.',
    defaultConfig: {
      type: 'summary_buffer',
      summaryModel: 'gemini-flash-latest',
      maxTokens: 2000,
      threadIdKey: 'session_id',
    },
  },
  {
    type: 'vector_rag',
    name: 'Vector Store / Semantic Memory (RAG)',
    category: 'Long-Term',
    badge: 'Semantic Vector RAG',
    iconName: 'Search',
    description: 'Embeds past interactions into a vector database (pgvector, Chroma, Pinecone) for semantic similarity retrieval.',
    bestFor: 'Long-term cross-session knowledge recall, personalized assistant memory, and enterprise docs.',
    defaultConfig: {
      type: 'vector_rag',
      vectorProvider: 'pgvector',
      embeddingModel: 'text-embedding-004',
      topK: 4,
      similarityThreshold: 0.75,
      threadIdKey: 'user_id',
    },
  },
  {
    type: 'entity_fact',
    name: 'Entity & Fact Memory (Mem0 / Zep)',
    category: 'Long-Term',
    badge: 'Knowledge Graph Facts',
    iconName: 'Brain',
    description: 'Extracts and continuously updates structured user profiles, facts, preferences, and entity relationship graphs.',
    bestFor: 'Personalized AI companions, customer CRM memory, and persistent user profile tracking.',
    defaultConfig: {
      type: 'entity_fact',
      userIdKey: 'user_id',
      extractUserFacts: true,
      collectionName: 'user_entities',
    },
  },
  {
    type: 'none',
    name: 'Stateless (No Memory)',
    category: 'Stateless',
    badge: 'Stateless Execution',
    iconName: 'Ban',
    description: 'Zero memory retention across invocations. Every task executes in complete isolation.',
    bestFor: 'Pure functional workflows, deterministic pipelines, and one-off batch processors.',
    defaultConfig: {
      type: 'none',
    },
  },
];

export function getMemoryOption(type?: AgentMemoryType): MemoryOptionDefinition {
  return (
    MEMORY_OPTIONS.find((m) => m.type === type) ||
    MEMORY_OPTIONS.find((m) => m.type === 'none')!
  );
}
