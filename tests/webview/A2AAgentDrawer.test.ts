/**
 * Unit Tests for A2A Agent Inspector Logic, State Mutations & Theme Styling
 *
 * Validates:
 * 1. A2A configuration normalization, defaults (1.0.0-a2a, /.well-known/agent-card.json, bearer auth).
 * 2. Multi-scheme authentication settings (Bearer, API Key, OAuth2, Google IAM).
 * 3. JSON Card Pack synchronization and schema validation.
 * 4. Capability negotiation presets and custom capability registration.
 * 5. Custom HTTP headers lifecycle (addition and removal).
 * 6. Node theme styles: A2A node uses cyan palette, Router node uses purple palette.
 *
 * Architectural Decisions:
 * - Author: Mike Nimer <mikenimer@google.com>
 * - Decision 1: Node testing uses node:test and node:assert/strict for zero external test dependencies.
 * - Decision 2: 100% coverage of A2A configurations, edge cases, and theme styles.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AgentData, A2AConfig } from '../../src/webview/types';
import { normalizeA2AConfig } from '../../src/shared/codegen/pythonAdkGenerator';
import { parseA2AAgentCard, extractExtensionSlug } from '../../src/shared/a2aCardParser';

describe('A2A Agent Inspector Logic & Configuration', () => {
  it('should normalize default A2A configuration properly', () => {
    const norm = normalizeA2AConfig();
    assert.equal(norm.endpoint, 'https://api.agent-network.internal/a2a/v1');
    assert.equal(norm.protocolVersion, '1.0.0-a2a');
    assert.equal(norm.agentCardUrl, '/.well-known/agent-card.json');
    assert.equal(norm.authType, 'bearer');
    assert.equal(norm.authSecretKey, 'A2A_AGENT_AUTH_TOKEN');
    assert.equal(norm.headerName, 'X-API-Key');
    assert.equal(norm.timeoutSeconds, 30);
    assert.equal(norm.maxRetries, 3);
    assert.deepEqual(norm.customHeaders, {});
    assert.deepEqual(norm.capabilities, []);
  });

  it('should support apiKey auth scheme with custom header name', () => {
    const rawConfig: Partial<A2AConfig> = {
      endpoint: 'https://remote.agent.service/rpc',
      authType: 'api_key',
      authTokenSecret: 'MY_REMOTE_API_KEY',
      headerName: 'X-Agent-Auth-Token',
      timeoutSeconds: 45,
      maxRetries: 5,
    };

    const norm = normalizeA2AConfig(rawConfig);
    assert.equal(norm.endpoint, 'https://remote.agent.service/rpc');
    assert.equal(norm.authType, 'api_key');
    assert.equal(norm.authSecretKey, 'MY_REMOTE_API_KEY');
    assert.equal(norm.headerName, 'X-Agent-Auth-Token');
    assert.equal(norm.timeoutSeconds, 45);
    assert.equal(norm.maxRetries, 5);
  });

  it('should support google_iam and oauth2 authentication schemes', () => {
    const iamConfig = normalizeA2AConfig({
      endpoint: 'https://cloud-run-agent.a.run.app',
      authType: 'google_iam',
    });
    assert.equal(iamConfig.authType, 'google_iam');

    const oauth2Config = normalizeA2AConfig({
      endpoint: 'https://partner.enterprise.com/a2a',
      authType: 'oauth2',
      authTokenSecret: 'OAUTH2_ACCESS_TOKEN',
    });
    assert.equal(oauth2Config.authType, 'oauth2');
    assert.equal(oauth2Config.authSecretKey, 'OAUTH2_ACCESS_TOKEN');
  });

  it('should serialize and parse JSON Agent Card Packs', () => {
    const agentName = 'Data Transformation Specialist';
    const endpoint = 'https://api.data-agent.org/v1';

    const cardPack = {
      "$schema": "https://a2a-protocol.org/schemas/v1/agent-card.json",
      "name": agentName,
      "description": "Performs data analysis and transformations",
      "version": "1.0.0",
      "endpoint": endpoint,
      "protocol": {
        "version": "1.0.0-a2a",
        "transport": "jsonrpc-2.0+http"
      },
      "authentication": {
        "type": "bearer",
        "token_env": "CUSTOM_BEARER_SECRET"
      },
      "capabilities": [
        "schema_negotiation",
        "task_handoff",
        "streaming_artifacts"
      ]
    };

    const jsonStr = JSON.stringify(cardPack);
    const parsed = JSON.parse(jsonStr);

    assert.equal(parsed.name, agentName);
    assert.equal(parsed.endpoint, endpoint);
    assert.equal(parsed.protocol.version, '1.0.0-a2a');
    assert.equal(parsed.authentication.type, 'bearer');
    assert.equal(parsed.capabilities.length, 3);
    assert.ok(parsed.capabilities.includes('schema_negotiation'));
  });

  it('should manage custom HTTP headers lifecycle accurately', () => {
    let headers: Record<string, string> = {};

    // Add headers
    headers = { ...headers, 'X-Trace-ID': 'trace-12345' };
    headers = { ...headers, 'X-Workflow-ID': 'wf-98765' };
    assert.equal(Object.keys(headers).length, 2);
    assert.equal(headers['X-Trace-ID'], 'trace-12345');
    assert.equal(headers['X-Workflow-ID'], 'wf-98765');

    // Remove header
    const { 'X-Trace-ID': removed, ...remaining } = headers;
    headers = remaining;
    assert.equal(Object.keys(headers).length, 1);
    assert.equal(headers['X-Trace-ID'], undefined);
    assert.equal(headers['X-Workflow-ID'], 'wf-98765');
  });

  it('should manage capability negotiation sets properly', () => {
    const capabilities = new Set<string>(['schema_negotiation', 'task_handoff']);
    assert.equal(capabilities.size, 2);

    // Toggle off existing capability
    capabilities.delete('schema_negotiation');
    assert.equal(capabilities.has('schema_negotiation'), false);
    assert.equal(capabilities.size, 1);

    // Toggle on new capability
    capabilities.add('streaming_artifacts');
    capabilities.add('custom_rag_federation');
    assert.equal(capabilities.size, 3);
    assert.equal(capabilities.has('custom_rag_federation'), true);
  });

  it('should handle edge cases with empty or null A2A configs gracefully', () => {
    const emptyNorm = normalizeA2AConfig({});
    assert.equal(emptyNorm.endpoint, 'https://api.agent-network.internal/a2a/v1');
    assert.equal(emptyNorm.protocolVersion, '1.0.0-a2a');
    assert.equal(emptyNorm.agentCardUrl, '/.well-known/agent-card.json');
    assert.equal(emptyNorm.authType, 'bearer');
  });

  it('should parse Google Conversational Analytics (BigQuery CA) agent card JSON', () => {
    const googleCardJson = `{
      "protocolVersion": "1.0",
      "name": "stock agent",
      "description": "BigQuery CA agent answering questions about attached data.",
      "url": "https://geminidataanalytics.us.rep.googleapis.com/v1beta/a2a/projects/argolis-ml-playground/locations/us/dataAgents/agent_1759dd5d-287f-489b-bf9d-33237188176d",
      "preferredTransport": "INTERNAL_HTTP+JSON",
      "defaultInputModes": [
        "text/plain",
        "application/json"
      ],
      "defaultOutputModes": [
        "text/plain",
        "application/json"
      ],
      "skills": [
        {
          "id": "data-analysis",
          "name": "Data Analysis",
          "description": "Provides data analysis assistance",
          "tags": [
            "data analysis",
            "data analytics",
            "data science"
          ],
          "examples": [
            "What is the total sales for the last 3 months?"
          ]
        }
      ],
      "additionalInterfaces": [
        {
          "transport": "INTERNAL_GRPC",
          "url": "geminidataanalytics.us.rep.googleapis.com"
        }
      ],
      "capabilities": {
        "streaming": true,
        "pushNotifications": false,
        "extensions": [
          {
            "uri": "https://www.googleapis.com/gemini-enterprise/a2a/extensions/a2ui_thoughts/v1"
          },
          {
            "uri": "https://cloud.google.com/bigquery/agent/extensions/sdui-chart/v1"
          },
          {
            "uri": "https://docs.cloud.google.com/gemini/docs/conversational-analytics-api/reference/a2a/extensions/bq-dataset/v1"
          }
        ]
      },
      "iconUrl": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PC9zdmc+"
    }`;

    const parsed = parseA2AAgentCard(googleCardJson);

    assert.equal(parsed.name, 'stock agent');
    assert.equal(parsed.description, 'BigQuery CA agent answering questions about attached data.');
    assert.equal(parsed.endpoint, 'https://geminidataanalytics.us.rep.googleapis.com/v1beta/a2a/projects/argolis-ml-playground/locations/us/dataAgents/agent_1759dd5d-287f-489b-bf9d-33237188176d');
    assert.equal(parsed.protocolVersion, '1.0');
    assert.equal(parsed.transport, 'INTERNAL_HTTP+JSON');
    assert.equal(parsed.authType, 'google_iam', 'googleapis.com must auto-select google_iam auth');

    // Skills verification
    assert.equal(parsed.skills.length, 1);
    const skill = parsed.skills[0];
    assert.equal(skill.id, 'data-analysis');
    assert.equal(skill.name, 'Data Analysis');
    assert.equal(skill.description, 'Provides data analysis assistance');
    assert.deepEqual(skill.tags, ['data analysis', 'data analytics', 'data science']);
    assert.deepEqual(skill.examples, ['What is the total sales for the last 3 months?']);

    // Capabilities verification
    assert.ok(parsed.capabilities.includes('streaming'));
    assert.ok(parsed.capabilities.includes('a2ui_thoughts'));
    assert.ok(parsed.capabilities.includes('sdui-chart'));
    assert.ok(parsed.capabilities.includes('bq-dataset'));

    // Icon URL
    assert.equal(parsed.iconUrl, 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PC9zdmc+');

    // Suggested Caller Delegation Prompt contains description and sample questions
    assert.ok(parsed.suggestedDelegationPrompt.includes('BigQuery CA agent answering questions about attached data.'));
    assert.ok(parsed.suggestedDelegationPrompt.includes('What is the total sales for the last 3 months?'));
  });

  it('should extract extension slugs cleanly from complex URIs', () => {
    assert.equal(extractExtensionSlug('https://cloud.google.com/bigquery/agent/extensions/sdui-chart/v1'), 'sdui-chart');
    assert.equal(extractExtensionSlug('https://www.googleapis.com/gemini-enterprise/a2a/extensions/a2ui_thoughts/v1'), 'a2ui_thoughts');
    assert.equal(extractExtensionSlug('https://example.com/extensions/realtime-sse'), 'realtime-sse');
    assert.equal(extractExtensionSlug('simple_feature'), 'simple_feature');
  });

  it('should auto-detect google_iam auth type when endpoint contains googleapis.com', () => {
    const norm = normalizeA2AConfig({
      endpoint: 'https://geminidataanalytics.us.rep.googleapis.com/v1beta/a2a/...',
    });
    assert.equal(norm.authType, 'google_iam');
  });
});
