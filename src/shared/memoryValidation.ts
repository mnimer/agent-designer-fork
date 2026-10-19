/**
 * memoryValidation.ts
 *
 * Pre-deployment validation logic for agent session memory and checkpointer configurations.
 * Validates mandatory connection strings, database identifiers, and secret references
 * prior to deploying to Google Cloud Run or Vertex AI Agent Engine.
 *
 * Architectural Decisions:
 * 1. Fail-fast validation gates: Prevents launching cloud deployments with missing checkpointer
 *    connection parameters that would otherwise crash at container boot time.
 * 2. Multi-backend checks: Validates Cloud SQL (PostgreSQL/MySQL), Cloud Spanner, and Cloud Memorystore Redis.
 * 3. Document tree traversal: Inspects root workflow agent, subagents, and graph nodes for memory configurations.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { AgentWorkflowDocument, AgentMemoryConfig } from './agentSpec';

export interface MemoryValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validates an individual agent memory configuration.
 *
 * @param config - The agent memory configuration to validate
 * @param agentName - Optional name of the agent owning this memory configuration
 * @returns Validation result with error messages if mandatory fields are missing
 */
export function validateMemoryConfig(
  config?: AgentMemoryConfig,
  agentName?: string
): MemoryValidationResult {
  const result: MemoryValidationResult = {
    isValid: true,
    errors: [],
    warnings: [],
  };

  // NOTE: If no memory or stateless 'none' or 'in_memory' is selected, no cloud parameters are required.
  if (!config || !config.type || config.type === 'none' || config.type === 'in_memory') {
    return result;
  }

  const prefix = agentName ? `[${agentName}] ` : '';

  // Section 1: Cloud SQL / PostgreSQL Checkpointer Validation (TASK-198)
  if (config.type === 'postgres' || config.type === 'cloud_sql') {
    if (!config.instanceConnectionName || !config.instanceConnectionName.trim()) {
      result.errors.push(
        `${prefix}Cloud SQL Memory requires an Instance Connection Name (format: project:region:instance).`
      );
    }
    if (!config.databaseName || !config.databaseName.trim()) {
      result.errors.push(`${prefix}Cloud SQL Memory requires a Database Name.`);
    }
    if (
      (!config.databaseUrlSecret || !config.databaseUrlSecret.trim()) &&
      (!config.connectionEnvVar || !config.connectionEnvVar.trim())
    ) {
      result.errors.push(
        `${prefix}Cloud SQL Memory requires a Database URL Secret Name or Connection Env Var for credentials.`
      );
    }
  }

  // Section 2: Cloud Spanner Checkpointer Validation (TASK-199)
  else if (config.type === 'spanner') {
    if (!config.instanceId || !config.instanceId.trim()) {
      result.errors.push(`${prefix}Cloud Spanner Memory requires a Spanner Instance ID.`);
    }
    if (!config.databaseId || !config.databaseId.trim()) {
      result.errors.push(`${prefix}Cloud Spanner Memory requires a Spanner Database ID.`);
    }
  }

  // Section 3: Cloud Memorystore (Redis/Valkey) Checkpointer Validation (TASK-200)
  else if (config.type === 'redis') {
    if (!config.redisHost || !config.redisHost.trim()) {
      result.errors.push(`${prefix}Cloud Memorystore Redis Memory requires a Redis Host / IP address.`);
    }
    if (config.redisPort === undefined || config.redisPort === null || Number.isNaN(config.redisPort) || config.redisPort <= 0) {
      result.errors.push(`${prefix}Cloud Memorystore Redis Memory requires a valid numeric Redis Port (default: 6379).`);
    }
    if (config.ttlSeconds !== undefined && (Number.isNaN(config.ttlSeconds) || config.ttlSeconds <= 0)) {
      result.errors.push(`${prefix}Redis session TTL must be a positive number of seconds.`);
    }
  }

  // Section 4: SQLite Checkpointer Warning for Cloud Deployments
  else if (config.type === 'sqlite') {
    result.warnings.push(
      `${prefix}SQLite memory uses a local disk file. In containerized Cloud Run / Agent Runtime deployments, data will not persist across container restarts.`
    );
  }

  result.isValid = result.errors.length === 0;
  return result;
}

/**
 * Validates all memory configurations across an entire AgentWorkflowDocument.
 *
 * @param document - The workflow document containing agents and nodes
 * @returns Combined validation result for all configured agents
 */
export function validateWorkflowMemory(
  document?: AgentWorkflowDocument
): MemoryValidationResult {
  const combined: MemoryValidationResult = {
    isValid: true,
    errors: [],
    warnings: [],
  };

  if (!document) {
    return combined;
  }

  // Check root agent / workflow level memory
  const docAny = document as any;
  if (docAny.memory) {
    const res = validateMemoryConfig(docAny.memory, document.name || 'Workflow');
    combined.errors.push(...res.errors);
    combined.warnings.push(...res.warnings);
  }

  // Check agents array
  if (document.agents && Array.isArray(document.agents)) {
    for (const agent of document.agents) {
      if (agent.memory) {
        const res = validateMemoryConfig(agent.memory, agent.name || agent.id);
        combined.errors.push(...res.errors);
        combined.warnings.push(...res.warnings);
      }
    }
  }

  // Check canvas nodes for agent nodes with memory
  if (document.nodes && Array.isArray(document.nodes)) {
    for (const node of document.nodes) {
      const data = node.data as any;
      if (data && data.memory) {
        const res = validateMemoryConfig(data.memory, data.name || data.label || node.id);
        combined.errors.push(...res.errors);
        combined.warnings.push(...res.warnings);
      }
    }
  }

  // Deduplicate errors and warnings
  combined.errors = Array.from(new Set(combined.errors));
  combined.warnings = Array.from(new Set(combined.warnings));
  combined.isValid = combined.errors.length === 0;

  return combined;
}
