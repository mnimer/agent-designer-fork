/**
 * Unit Tests for GovernanceStatusCard & Enterprise Governance Defaults (TASK-217 & TASK-218)
 *
 * Validates:
 * 1. Chat Trigger detection (`hasChatTriggerNode`) and Test Suite Trigger detection (`hasTestSuiteTriggerNode`).
 * 2. Default governance configuration (`createDefaultGovernanceConfig`):
 *    - Shared Regional Agent Gateway (`default-shared-agent-gateway`) + Model Armor enabled by default (`true`)
 *      with default template `enterprise-baseline`.
 *    - Post-deploy Vertex AI Cloud Evaluation disabled by default (`false`).
 *    - Publish to Gemini Enterprise App enabled by default (`true`) ONLY when a Chat Trigger node is present,
 *      and `false` when no Chat Trigger node is present.
 * 3. `GcpDiscoveryManager` transformation of raw Model Armor templates and Gemini Enterprise Apps.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  hasChatTriggerNode,
  hasTestSuiteTriggerNode,
  createDefaultGovernanceConfig,
  DEFAULT_SHARED_GATEWAY_ID,
  DEFAULT_MODEL_ARMOR_TEMPLATE_ID,
  DEFAULT_GEMINI_ENTERPRISE_APP_ID,
} from '../../../src/webview/components/deployment/GovernanceStatusCard';
import { GcpDiscoveryManager } from '../../../src/extension/GcpDiscoveryManager';
import { AgentWorkflowDocument } from '../../../src/shared/types';

describe('GovernanceStatusCard & Enterprise Governance Logic (TASK-217 & TASK-218)', () => {
  const baseDoc: AgentWorkflowDocument = {
    schemaVersion: '1.0.0',
    name: 'travel_concierge_agent',
    description: 'Travel concierge agent',
    framework: 'google-adk',
    language: 'python',
    nodes: [],
    edges: [],
  };

  it('should detect Chat Trigger node only when a chat trigger is present on the workflow', () => {
    assert.equal(hasChatTriggerNode(undefined), false);
    assert.equal(hasChatTriggerNode(baseDoc), false);

    const pubsubOnlyDoc: AgentWorkflowDocument = {
      ...baseDoc,
      nodes: [
        {
          id: 'trigger_1',
          type: 'trigger',
          position: { x: 0, y: 0 },
          data: {
            label: 'Order Events Pub/Sub',
            triggerType: 'pubsub',
          } as any,
        },
      ],
    };
    assert.equal(hasChatTriggerNode(pubsubOnlyDoc), false);

    const chatTriggerDoc: AgentWorkflowDocument = {
      ...baseDoc,
      nodes: [
        {
          id: 'trigger_chat',
          type: 'triggerNode',
          position: { x: 0, y: 0 },
          data: {
            label: 'Interactive Chat',
            triggerType: 'chat',
          } as any,
        },
      ],
    };
    assert.equal(hasChatTriggerNode(chatTriggerDoc), true);
  });

  it('should detect Test Suite Trigger node when tester or test trigger is present', () => {
    assert.equal(hasTestSuiteTriggerNode(baseDoc), false);

    const testTriggerDoc: AgentWorkflowDocument = {
      ...baseDoc,
      nodes: [
        {
          id: 'trigger_test',
          type: 'trigger',
          position: { x: 0, y: 0 },
          data: {
            label: 'QA Test Suite',
            triggerType: 'tester',
          } as any,
        },
      ],
    };
    assert.equal(hasTestSuiteTriggerNode(testTriggerDoc), true);
  });

  it('should default publishToGeminiEnterprise to true ONLY when a Chat Trigger exists, and runCloudEvaluation to false', () => {
    // Without Chat Trigger -> publishToGeminiEnterprise must be false
    const govWithoutChat = createDefaultGovernanceConfig(baseDoc);
    assert.equal(govWithoutChat.enableAgentGateway, true);
    assert.equal(govWithoutChat.agentGatewayId, DEFAULT_SHARED_GATEWAY_ID);
    assert.equal(govWithoutChat.modelArmorTemplateId, DEFAULT_MODEL_ARMOR_TEMPLATE_ID);
    assert.equal(govWithoutChat.runCloudEvaluation, false);
    assert.equal(govWithoutChat.publishToGeminiEnterprise, false);

    // With Chat Trigger -> publishToGeminiEnterprise must default to true
    const chatDoc: AgentWorkflowDocument = {
      ...baseDoc,
      nodes: [
        {
          id: 'trigger_chat',
          type: 'trigger',
          position: { x: 0, y: 0 },
          data: {
            label: 'Chat Trigger',
            triggerType: 'chat',
          } as any,
        },
      ],
    };
    const govWithChat = createDefaultGovernanceConfig(chatDoc);
    assert.equal(govWithChat.enableAgentGateway, true);
    assert.equal(govWithChat.agentGatewayId, 'default-shared-agent-gateway');
    assert.equal(govWithChat.modelArmorTemplateId, 'enterprise-baseline');
    assert.equal(govWithChat.runCloudEvaluation, false);
    assert.equal(govWithChat.publishToGeminiEnterprise, true);
    assert.equal(govWithChat.geminiEnterpriseAppId, '');
    assert.equal(DEFAULT_GEMINI_ENTERPRISE_APP_ID, '');
    assert.equal(govWithChat.geminiEnterpriseLocation, 'global');
    assert.equal(govWithChat.geminiEnterpriseBindGateway, true);
  });

  it('should transform raw Model Armor templates and ensure enterprise-baseline is always available first', () => {
    const discovery = GcpDiscoveryManager.getInstance();
    const transformed = discovery.transformRawModelArmorTemplates([
      {
        name: 'projects/my-proj/locations/us-central1/templates/custom-dlp-template',
        displayName: 'Custom DLP Guard',
        description: 'Custom enterprise DLP template',
      },
    ]);

    assert.equal(transformed.length, 2);
    assert.equal(transformed[0].templateId, 'enterprise-baseline');
    assert.equal(transformed[1].templateId, 'custom-dlp-template');
    assert.equal(transformed[1].displayName, 'Custom DLP Guard');
  });

  it('should transform raw Gemini Enterprise Apps (Discovery Engine engines) and return empty array when project has no apps', async () => {
    const discovery = GcpDiscoveryManager.getInstance();

    // Empty array or empty REST object `{}` must return `[]` (no fake apps!)
    assert.deepEqual(discovery.transformRawGeminiEnterpriseApps([], 'global'), []);
    assert.deepEqual(discovery.transformRawGeminiEnterpriseApps({} as any, 'global'), []);

    // Empty projectId must return `{ apps: [] }`
    const emptyProjRes = await discovery.getGeminiEnterpriseApps('', 'global', true);
    assert.deepEqual(emptyProjRes.apps, []);

    // REST API `{ engines: [...] }` format
    const appsFromRest = discovery.transformRawGeminiEnterpriseApps(
      {
        engines: [
          {
            name: 'projects/my-proj/locations/global/collections/default_collection/engines/hr-concierge-app',
            displayName: 'HR Employee Concierge App',
            solutionType: 'SOLUTION_TYPE_GENERATIVE_CHAT',
          },
        ],
      },
      'global'
    );

    assert.equal(appsFromRest.length, 1);
    assert.equal(appsFromRest[0].engineId, 'hr-concierge-app');
    assert.equal(appsFromRest[0].displayName, 'HR Employee Concierge App');
    assert.equal(appsFromRest[0].location, 'global');
  });
});
