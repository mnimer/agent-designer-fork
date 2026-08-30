import { AgentData, ToolDefinition } from '../types';

export interface RuntimeSecret {
  id: string;
  name: string; // e.g. "GEMINI_API_KEY", "TWITTER_BEARER_TOKEN", "REDIS_URL"
  label: string; // e.g. "Twitter API Bearer Token"
  sourceNode: string; // e.g. "Social Media Agent" or "Redis Memory"
  sourceType: 'core' | 'tool' | 'memory' | 'a2a' | 'database';
  description: string;
  placeholder?: string;
  isConfigured?: boolean;
}

export function extractRuntimeSecrets(nodes: { data: AgentData }[]): RuntimeSecret[] {
  const secretsMap = new Map<string, RuntimeSecret>();

  // 1. Core Gemini API Key (Foundation)
  secretsMap.set('GEMINI_API_KEY', {
    id: 'sec_gemini_key',
    name: 'GEMINI_API_KEY',
    label: 'Google Gemini API Key (Optional with ADC)',
    sourceNode: 'Vertex AI / Google GenAI SDK',
    sourceType: 'core',
    description: 'Optional API key. If left blank, the local runner and generated agent automatically use Google Application Default Credentials (ADC) from "gcloud auth application-default login".',
    placeholder: 'AIzaSy... (leave blank to use ADC)',
    isConfigured: false,
  });

  // 2. Scan every agent node
  nodes.forEach((node) => {
    const data = node.data;
    const agentName = data.label || 'Agent';

    // A. Tools
    (data.tools || []).forEach((tool: ToolDefinition) => {
      if (tool.authKeyEnv) {
        secretsMap.set(tool.authKeyEnv, {
          id: `sec_tool_${tool.id}`,
          name: tool.authKeyEnv,
          label: `${tool.name} Secret Key`,
          sourceNode: agentName,
          sourceType: 'tool',
          description: tool.codePrompt || tool.description || `Authentication secret for ${tool.name}`,
          placeholder: 'sk_live_... or Bearer token',
          isConfigured: false,
        });
      } else if (tool.id === 'tool_twitter_api') {
        secretsMap.set('TWITTER_BEARER_TOKEN', {
          id: 'sec_twitter_token',
          name: 'TWITTER_BEARER_TOKEN',
          label: 'Twitter / X API v2 Bearer Token',
          sourceNode: agentName,
          sourceType: 'tool',
          description: 'Bearer token for fetching tweets, timelines, and posting updates',
          placeholder: 'AAAA...',
          isConfigured: false,
        });
      } else if (tool.id === 'tool_github_api') {
        secretsMap.set('GITHUB_TOKEN', {
          id: 'sec_github_token',
          name: 'GITHUB_TOKEN',
          label: 'GitHub Personal Access Token',
          sourceNode: agentName,
          sourceType: 'tool',
          description: 'GitHub API token for repository, issue, and pull request operations',
          placeholder: 'ghp_...',
          isConfigured: false,
        });
      } else if (tool.id === 'tool_slack_webhook') {
        secretsMap.set('SLACK_WEBHOOK_URL', {
          id: 'sec_slack_webhook',
          name: 'SLACK_WEBHOOK_URL',
          label: 'Slack Incoming Webhook URL',
          sourceNode: agentName,
          sourceType: 'tool',
          description: 'Incoming webhook URL for posting alerts into Slack channels',
          placeholder: 'https://hooks.slack.com/services/...',
          isConfigured: false,
        });
      } else if (tool.id === 'tool_sql_query' || tool.type === 'db') {
        secretsMap.set('DATABASE_URL', {
          id: 'sec_db_url',
          name: 'DATABASE_URL',
          label: 'Database Connection String',
          sourceNode: agentName,
          sourceType: 'database',
          description: 'PostgreSQL/MySQL connection URI (e.g. postgres://user:pass@host:5432/db)',
          placeholder: 'postgresql://user:pass@host:5432/dbname',
          isConfigured: false,
        });
      }
    });

    // B. Agent Memory Configuration
    if (data.memoryConfig) {
      const memType = data.memoryConfig.type;
      if (memType === 'redis') {
        const envVar = data.memoryConfig.connectionEnvVar || 'REDIS_URL';
        secretsMap.set(envVar, {
          id: 'sec_redis_url',
          name: envVar,
          label: 'Redis Connection URL',
          sourceNode: `${agentName} (Memory)`,
          sourceType: 'memory',
          description: 'Redis host URI for session checkpointer and state persistence',
          placeholder: 'redis://default:password@redis-host:6379',
          isConfigured: false,
        });
      } else if (memType === 'postgres') {
        const envVar = data.memoryConfig.connectionEnvVar || 'POSTGRES_CONNECTION_STRING';
        secretsMap.set(envVar, {
          id: 'sec_postgres_conn',
          name: envVar,
          label: 'PostgreSQL Memory Connection URI',
          sourceNode: `${agentName} (Memory)`,
          sourceType: 'memory',
          description: 'PostgreSQL connection string for persistent thread checkpointers',
          placeholder: 'postgresql://postgres:secret@db.project.supabase.co:5432/postgres',
          isConfigured: false,
        });
      } else if (memType === 'vector_rag') {
        const provider = data.memoryConfig.vectorProvider || 'pinecone';
        if (provider === 'pinecone') {
          secretsMap.set('PINECONE_API_KEY', {
            id: 'sec_pinecone_key',
            name: 'PINECONE_API_KEY',
            label: 'Pinecone Vector DB API Key',
            sourceNode: `${agentName} (Memory RAG)`,
            sourceType: 'memory',
            description: 'API key for vector index semantic search retrieval',
            placeholder: 'pcsk_...',
            isConfigured: false,
          });
        } else if (provider === 'qdrant') {
          secretsMap.set('QDRANT_API_KEY', {
            id: 'sec_qdrant_key',
            name: 'QDRANT_API_KEY',
            label: 'Qdrant Vector DB API Key',
            sourceNode: `${agentName} (Memory RAG)`,
            sourceType: 'memory',
            description: 'API key for Qdrant cloud cluster vector search',
            placeholder: 'qd_...',
            isConfigured: false,
          });
        }
      }
    }

    // C. A2A Protocol Configuration
    if (data.agentKind === 'a2a' && data.a2aConfig) {
      if (data.a2aConfig.authType === 'bearer' && data.a2aConfig.authTokenSecret) {
        secretsMap.set(data.a2aConfig.authTokenSecret, {
          id: `sec_a2a_${data.a2aConfig.authTokenSecret}`,
          name: data.a2aConfig.authTokenSecret,
          label: 'A2A Peer Bearer Token',
          sourceNode: `${agentName} (A2A Protocol)`,
          sourceType: 'a2a',
          description: `Authorization Bearer Token for remote endpoint: ${data.a2aConfig.endpoint}`,
          placeholder: 'a2a_sec_...',
          isConfigured: false,
        });
      } else if (data.a2aConfig.authType === 'api_key' && data.a2aConfig.authTokenSecret) {
        secretsMap.set(data.a2aConfig.authTokenSecret, {
          id: `sec_a2a_${data.a2aConfig.authTokenSecret}`,
          name: data.a2aConfig.authTokenSecret,
          label: 'A2A Peer API Key',
          sourceNode: `${agentName} (A2A Protocol)`,
          sourceType: 'a2a',
          description: `API Key for header '${data.a2aConfig.headerName || 'x-api-key'}' targeting ${data.a2aConfig.endpoint}`,
          placeholder: 'key_...',
          isConfigured: false,
        });
      } else if (data.a2aConfig.authType === 'oauth2' && data.a2aConfig.oauth2Config?.clientSecretEnv) {
        secretsMap.set(data.a2aConfig.oauth2Config.clientSecretEnv, {
          id: `sec_a2a_oauth_${data.a2aConfig.oauth2Config.clientSecretEnv}`,
          name: data.a2aConfig.oauth2Config.clientSecretEnv,
          label: 'A2A OAuth2 Client Secret',
          sourceNode: `${agentName} (A2A OAuth2)`,
          sourceType: 'a2a',
          description: 'Client secret for machine-to-machine OAuth2 token acquisition',
          placeholder: 'sec_oauth_...',
          isConfigured: false,
        });
      }
    }
  });

  return Array.from(secretsMap.values());
}
