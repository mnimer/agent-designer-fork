/**
 * defaultSkills.ts - Starter Global Skills Catalog & SKILL.md Formatting Utilities
 *
 * Purpose:
 * Provides initial built-in global skills for the Skills Editor page and helper
 * utilities for sanitizing skill slugs, formatting YAML frontmatter (`SKILL.md`),
 * and merging global vs. agent-scoped skills.
 *
 * Architectural Decisions:
 * - Follows Claude Desktop / Antigravity `SKILL.md` conventions with YAML frontmatter
 *   (`name`, `description`) and Markdown body instructions.
 * - Supports both Global Skills (managed in Settings -> Skills) and Agent-Scoped Skills
 *   (created inline inside an Agent Card, with optional promotion to Global Skills).
 * - Author: Mike Nimer <mikenimer@google.com>
 */

import { AgentSkillDefinition } from '../types';

/**
 * Default global skills seeded into Settings on first launch.
 */
export const DEFAULT_GLOBAL_SKILLS: AgentSkillDefinition[] = [
  {
    id: 'skill_bigquery_finops_optimizer',
    name: 'bigquery-finops-optimizer',
    title: 'BigQuery SQL & FinOps Optimizer',
    description:
      'Use when analyzing BigQuery SQL queries, slot utilization, partition pruning, or recommending clustering and materialized views.',
    instructions: `## Goal
Optimize BigQuery SQL queries for minimum bytes scanned and maximum slot efficiency.

## Guidelines
1. Always verify partition filter predicates on partitioned columns before executing queries.
2. Replace \`SELECT *\` with explicit projection columns.
3. Recommend clustering keys based on high-cardinality \`WHERE\` and \`JOIN\` clauses.
4. Estimate query cost using dry-run byte counts before running heavy aggregations.`,
    scope: 'global',
  },
  {
    id: 'skill_pydantic_schema_architect',
    name: 'pydantic-schema-architect',
    title: 'Pydantic v2 Contract & Schema Verifier',
    description:
      'Use when validating structured JSON payloads, designing strict Pydantic v2 models, or normalizing API responses.',
    instructions: `## Goal
Enforce strict, type-safe Pydantic v2 data contracts across multi-agent state handoffs.

## Guidelines
1. Define explicit \`Field(..., description="...")\` metadata on every attribute.
2. Avoid untyped \`dict\` or \`Any\` fields in output schemas.
3. Validate enum constraints and ISO-8601 timestamps before emitting downstream state keys.`,
    scope: 'global',
  },
  {
    id: 'skill_enterprise_security_auditor',
    name: 'enterprise-security-auditor',
    title: 'Cloud IAM & Least-Privilege Auditor',
    description:
      'Use when reviewing IAM roles, Service Account bindings, Secret Manager references, or Model Armor guardrail policies.',
    instructions: `## Goal
Verify all cloud resources and agent tool invocations adhere to least-privilege security posture.

## Guidelines
1. Flag any primitive roles (\`roles/owner\`, \`roles/editor\`) and replace with predefined granular roles.
2. Ensure all credentials and tokens are retrieved via Secret Manager environment bindings.
3. Redact PII and sensitive tokens from structured logs and telemetry spans.`,
    scope: 'global',
  },
];

/**
 * Converts a display title or raw name into a valid kebab-case skill identifier (`name`).
 */
export function sanitizeSkillSlug(raw: string): string {
  const cleaned = (raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned || 'custom-skill';
}

/**
 * Formats an AgentSkillDefinition into a canonical `SKILL.md` file with YAML frontmatter.
 */
export function formatSkillMarkdownWithFrontmatter(skill: AgentSkillDefinition): string {
  const slug = sanitizeSkillSlug(skill.name || skill.title);
  const desc = (skill.description || '').replace(/\r?\n/g, ' ').trim();
  const body = (skill.instructions || '').trim();

  return [
    '---',
    `name: ${slug}`,
    `description: ${desc}`,
    '---',
    '',
    `# ${skill.title || slug}`,
    '',
    body,
    '',
  ].join('\n');
}
