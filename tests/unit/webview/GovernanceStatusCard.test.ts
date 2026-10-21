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
import * as fs from 'fs';
import * as path from 'path';
import {
  hasChatTriggerNode,
  hasTestSuiteTriggerNode,
  createDefaultGovernanceConfig,
  DEFAULT_SHARED_GATEWAY_ID,
  DEFAULT_MODEL_ARMOR_TEMPLATE_ID,
  DEFAULT_GEMINI_ENTERPRISE_APP_ID,
  DEFAULT_GEMINI_ENTERPRISE_AUTH_MODE,
  GEMINI_ENTERPRISE_OAUTH_REDIRECT_URI,
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

  it('should default publishToGeminiEnterprise to false (hiding Gemini Enterprise fields until checked) and auth mode to service_account', () => {
    // Without Chat Trigger -> publishToGeminiEnterprise must be false
    const govWithoutChat = createDefaultGovernanceConfig(baseDoc);
    assert.equal(govWithoutChat.enableAgentGateway, true);
    assert.equal(govWithoutChat.agentGatewayId, DEFAULT_SHARED_GATEWAY_ID);
    assert.equal(govWithoutChat.modelArmorTemplateId, DEFAULT_MODEL_ARMOR_TEMPLATE_ID);
    assert.equal(govWithoutChat.runCloudEvaluation, false);
    assert.equal(govWithoutChat.publishToGeminiEnterprise, false);
    assert.equal(govWithoutChat.geminiEnterpriseAuthMode, DEFAULT_GEMINI_ENTERPRISE_AUTH_MODE);
    assert.equal(govWithoutChat.geminiEnterpriseServiceAccount, '');

    // With Chat Trigger -> publishToGeminiEnterprise defaults to false until checked by the user
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
    assert.equal(govWithChat.publishToGeminiEnterprise, false);
    assert.equal(govWithChat.geminiEnterpriseAppId, '');
    assert.equal(DEFAULT_GEMINI_ENTERPRISE_APP_ID, '');
    assert.equal(govWithChat.geminiEnterpriseLocation, 'global');
    assert.equal(govWithChat.geminiEnterpriseAuthMode, 'service_account');
    assert.equal(govWithChat.geminiEnterpriseServiceAccount, '');
    assert.equal(govWithChat.geminiEnterpriseBindGateway, true);
    assert.equal(
      GEMINI_ENTERPRISE_OAUTH_REDIRECT_URI,
      'https://vertexaisearch.cloud.google.com/oauth-redirect'
    );

    // When savedGov explicitly sets publishToGeminiEnterprise: true and user_oauth, preserve it
    const savedChatDoc: AgentWorkflowDocument = {
      ...chatDoc,
      deployment: {
        target: 'agent_engine',
        outputFolder: './agent_app/',
        framework: 'google-adk',
        language: 'python',
        governance: {
          publishToGeminiEnterprise: true,
          geminiEnterpriseAuthMode: 'user_oauth',
          geminiEnterpriseServiceAccount: 'custom-sa@my-proj.iam.gserviceaccount.com',
        },
      },
    };
    const govSaved = createDefaultGovernanceConfig(savedChatDoc);
    assert.equal(govSaved.publishToGeminiEnterprise, true);
    assert.equal(govSaved.geminiEnterpriseAuthMode, 'user_oauth');
    assert.equal(
      govSaved.geminiEnterpriseServiceAccount,
      'custom-sa@my-proj.iam.gserviceaccount.com'
    );
  });

  it('should verify GovernanceStatusCard and Deploy Tabs render Authentication Mode, Service Account dropdown, and OAuth Redirect Instructions Modal', () => {
    const govCardPath = path.resolve(
      __dirname,
      '../../../src/webview/components/deployment/GovernanceStatusCard.tsx'
    );
    const aeTabPath = path.resolve(
      __dirname,
      '../../../src/webview/components/deployment/AgentEngineDeployTab.tsx'
    );
    const crTabPath = path.resolve(
      __dirname,
      '../../../src/webview/components/deployment/CloudRunDeployTab.tsx'
    );

    const govCardContent = fs.readFileSync(govCardPath, 'utf8');
    const aeTabContent = fs.readFileSync(aeTabPath, 'utf8');
    const crTabContent = fs.readFileSync(crTabPath, 'utf8');

    assert.ok(
      govCardContent.includes('select-gemini-enterprise-auth-mode'),
      'GovernanceStatusCard must render Authentication Mode dropdown'
    );
    assert.ok(
      govCardContent.includes('select-gemini-enterprise-service-account'),
      'GovernanceStatusCard must render Project Service Account dropdown when service_account mode is selected'
    );
    assert.ok(
      govCardContent.includes('FETCH_GCP_SERVICE_ACCOUNTS'),
      'GovernanceStatusCard must fetch project service accounts via FETCH_GCP_SERVICE_ACCOUNTS'
    );
    assert.ok(
      govCardContent.includes('gemini-oauth-redirect-instructions-modal'),
      'GovernanceStatusCard must define GeminiOAuthRedirectInstructionsModal'
    );
    assert.ok(
      govCardContent.includes('https://vertexaisearch.cloud.google.com/oauth-redirect'),
      'GovernanceStatusCard must display the Discovery Engine OAuth redirect URI'
    );
    assert.ok(
      aeTabContent.includes('GeminiOAuthRedirectInstructionsModal'),
      'AgentEngineDeployTab must render GeminiOAuthRedirectInstructionsModal post-deploy when user_oauth is selected'
    );
    assert.ok(
      crTabContent.includes('GeminiOAuthRedirectInstructionsModal'),
      'CloudRunDeployTab must render GeminiOAuthRedirectInstructionsModal post-deploy when user_oauth is selected'
    );
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
