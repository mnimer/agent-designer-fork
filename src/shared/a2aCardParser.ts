/**
 * A2AAgentCardParser - Parser for Agent-to-Agent (A2A) Agent Card Manifests
 *
 * Purpose:
 * Parses and normalizes incoming A2A Agent Card JSON manifests from heterogeneous sources,
 * including Google Cloud Conversational Analytics (GDA / BigQuery CA), Vertex AI Agents,
 * and standard decentralized A2A protocol specifications.
 *
 * Architectural Decisions:
 * - Author: Mike Nimer <mikenimer@google.com>
 * - Endpoint Resolution: Prioritizes explicit `url`, then `endpoint`, then `additionalInterfaces[0].url`.
 * - Google Cloud Smart Auth: Automatically selects `google_iam` when endpoint contains `googleapis.com`.
 * - Capabilities Extraction: Flattens capability flags (`streaming`, `pushNotifications`) and extensions (`uri` basenames).
 * - Skills Extraction: Normalizes skills with tags and examples into strongly-typed `A2AAgentSkill[]`.
 * - Delegation Guidance: Generates recommended delegation instructions for caller orchestrators from skills and examples.
 */

import { A2AAuthType, A2AAgentSkill } from '../webview/types';

export interface ParsedA2ACard {
  name: string;
  description: string;
  endpoint: string;
  protocolVersion: string;
  transport: string;
  capabilities: string[];
  skills: A2AAgentSkill[];
  iconUrl?: string;
  authType: A2AAuthType;
  suggestedDelegationPrompt: string;
  rawCard: Record<string, any>;
}

/**
 * Extracts a concise capability slug from an extension URI.
 *
 * e.g. "https://cloud.google.com/bigquery/agent/extensions/sdui-chart/v1" -> "sdui-chart"
 *
 * @param uri Full extension URI string
 * @returns Cleaned short identifier
 */
export function extractExtensionSlug(uri: string): string {
  // NOTE: Remove trailing version tags like /v1, /v0.8, etc.
  const trimmed = uri.replace(/\/v[0-9]+(\.[0-9]+)*\/?$/, '');
  const parts = trimmed.split('/');
  return parts[parts.length - 1] || uri;
}

/**
 * Parses and normalizes an A2A Agent Card from raw JSON string or object.
 * Supports Google Conversational Analytics (GDA) specifications and standard A2A schema.
 *
 * @param input Raw JSON string or parsed JSON object
 * @returns Strongly-typed ParsedA2ACard
 */
export function parseA2AAgentCard(input: string | Record<string, any>): ParsedA2ACard {
  // NOTE: Parse JSON if string was provided
  const raw: Record<string, any> = typeof input === 'string' ? JSON.parse(input) : input;

  // 1. Resolve Name
  const name = raw.name || raw.title || raw.label || 'A2A Agent';

  // 2. Resolve Description
  const description = raw.description || raw.summary || '';

  // 3. Resolve Endpoint URL
  // Checks: direct url -> endpoint -> additionalInterfaces[0].url
  let endpoint = raw.url || raw.endpoint || '';
  if (!endpoint && Array.isArray(raw.additionalInterfaces) && raw.additionalInterfaces.length > 0) {
    endpoint = raw.additionalInterfaces[0]?.url || '';
  }

  // 4. Resolve Protocol Version
  const protocolVersion = raw.protocolVersion || raw.version || raw.protocol?.version || '1.0';

  // 5. Resolve Transport
  const transport = raw.preferredTransport || raw.protocol?.transport || 'HTTP+JSON';

  // 6. Resolve Capabilities and Extensions
  const capabilitySet = new Set<string>();

  if (Array.isArray(raw.capabilities)) {
    // Array format: ["streaming_artifacts", "task_handoff"]
    for (const cap of raw.capabilities) {
      if (typeof cap === 'string') capabilitySet.add(cap);
    }
  } else if (raw.capabilities && typeof raw.capabilities === 'object') {
    // Object format (Google Conversational Analytics): { streaming: true, extensions: [...] }
    if (raw.capabilities.streaming) {
      capabilitySet.add('streaming');
    }
    if (raw.capabilities.pushNotifications) {
      capabilitySet.add('push_notifications');
    }
    if (Array.isArray(raw.capabilities.extensions)) {
      for (const ext of raw.capabilities.extensions) {
        if (ext?.uri) {
          capabilitySet.add(extractExtensionSlug(ext.uri));
        }
      }
    }
  }

  // 7. Resolve Skills
  const skills: A2AAgentSkill[] = [];
  if (Array.isArray(raw.skills)) {
    for (const skill of raw.skills) {
      skills.push({
        id: skill.id || skill.name?.toLowerCase().replace(/\s+/g, '-') || 'custom-skill',
        name: skill.name || 'Unnamed Skill',
        description: skill.description || '',
        tags: Array.isArray(skill.tags) ? skill.tags : [],
        examples: Array.isArray(skill.examples) ? skill.examples : [],
        inputModes: Array.isArray(skill.inputModes) ? skill.inputModes : [],
        outputModes: Array.isArray(skill.outputModes) ? skill.outputModes : [],
      });
      // Add skill slug to capabilities
      capabilitySet.add(`skill:${skill.id || skill.name?.toLowerCase()}`);
    }
  }

  // 8. Resolve Icon URL (SVG or remote URL)
  const iconUrl = typeof raw.iconUrl === 'string' && raw.iconUrl.trim() ? raw.iconUrl.trim() : undefined;

  // 9. Auto-detect Authentication Scheme
  let authType: A2AAuthType = 'bearer';
  if (raw.authentication?.type) {
    authType = raw.authentication.type as A2AAuthType;
  } else if (endpoint.includes('googleapis.com')) {
    // NOTE: Google Cloud services (such as Gemini Data Analytics / BigQuery CA) require Google IAM
    authType = 'google_iam';
  }

  // 10. Generate Suggested Caller Delegation Prompt
  const promptLines: string[] = [];
  if (description) {
    promptLines.push(description);
  }
  if (skills.length > 0) {
    promptLines.push('');
    promptLines.push('Skills:');
    for (const skill of skills) {
      promptLines.push(`- ${skill.name}: ${skill.description}`);
    }

    const allExamples = skills.flatMap((s) => s.examples || []).filter(Boolean);
    if (allExamples.length > 0) {
      promptLines.push('');
      promptLines.push('Sample Queries:');
      for (const ex of allExamples.slice(0, 5)) {
        promptLines.push(`- ${ex}`);
      }
    }
  }
  const suggestedDelegationPrompt = promptLines.join('\n');

  return {
    name,
    description,
    endpoint,
    protocolVersion,
    transport,
    capabilities: Array.from(capabilitySet),
    skills,
    iconUrl,
    authType,
    suggestedDelegationPrompt,
    rawCard: raw,
  };
}
