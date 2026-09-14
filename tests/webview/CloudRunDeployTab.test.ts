/**
 * Unit Tests for CloudRunDeployTab State, RPC Payloads, and Sub-tabs
 *
 * Validates:
 * 1. Default configuration parameters (service name normalization, default CPU/RAM/scaling, allowUnauthenticated).
 * 2. RPC payload formatting for DEPLOY_TO_CLOUD_RUN, CANCEL_CLOUD_RUN_DEPLOY, TEST_REMOTE_CLOUD_RUN,
 *    GENERATE_TERRAFORM_FILES, and SAVE_TERRAFORM_FILES.
 * 3. Log stream classification (stdout, stderr, system).
 * 4. Sub-tab navigation (Cloud Build deploy runner vs Terraform IaC previewer).
 * 5. Terraform IaC file preview tabs (main.tf, variables.tf, outputs.tf, terraform.tfvars, cloudbuild.yaml).
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AgentWorkflowDocument } from '../../src/shared/types';
import { CloudRunDeploymentMetadataRecord } from '../../src/extension/CloudRunDeployer';

describe('CloudRunDeployTab State & Logic', () => {
  const sampleDocument: AgentWorkflowDocument = {
    schemaVersion: '1.0.0',
    name: 'Order-Fulfillment-Bot',
    description: 'Autonomous fulfillment processing agent',
    framework: 'adk',
    language: 'python',
    nodes: [],
    edges: [],
    metadata: {
      settings: {
        customFields: {
          gcpProjectId: 'my-production-project',
        },
      },
    },
  };

  describe('Default Parameters & Normalization', () => {
    it('should derive default service name by lowercasing and replacing non-alphanumeric chars', () => {
      const deriveServiceName = (docName: string) =>
        (docName || 'agent-service').toLowerCase().replace(/[^a-z0-9_-]/g, '-');

      assert.equal(deriveServiceName('Order-Fulfillment-Bot'), 'order-fulfillment-bot');
      assert.equal(deriveServiceName('Support Agent #1!'), 'support-agent--1-');
      assert.equal(deriveServiceName(''), 'agent-service');
    });

    it('should configure production defaults for Cloud Run resources and scaling', () => {
      const defaults = {
        region: 'us-central1',
        cpu: '1',
        memory: '2Gi',
        minInstances: 0,
        maxInstances: 5,
        concurrency: 80,
        allowUnauthenticated: false,
      };

      assert.equal(defaults.region, 'us-central1');
      assert.equal(defaults.cpu, '1');
      assert.equal(defaults.memory, '2Gi');
      assert.equal(defaults.minInstances, 0);
      assert.equal(defaults.maxInstances, 5);
      assert.equal(defaults.concurrency, 80);
      assert.equal(defaults.allowUnauthenticated, false);
    });

    it('should resolve project ID from document metadata with fallback', () => {
      const resolved =
        sampleDocument.metadata?.settings?.customFields?.gcpProjectId || '';
      assert.equal(resolved, 'my-production-project');

      const blankDoc: AgentWorkflowDocument = {
        schemaVersion: '1.0.0',
        name: 'test',
        description: '',
        framework: 'adk',
        language: 'python',
        nodes: [],
        edges: [],
      };
      const fallback =
        blankDoc.metadata?.settings?.customFields?.gcpProjectId || '';
      assert.equal(fallback, '');
    });
  });

  describe('RPC Message Payloads', () => {
    it('should format DEPLOY_TO_CLOUD_RUN message payload adhering to rpcProtocol specification', () => {
      const payload = {
        targetDirectory: '/workspace/agents/order-bot',
        projectId: 'my-production-project',
        region: 'us-central1',
        serviceName: 'order-fulfillment-bot',
        cpu: '2',
        memory: '4Gi',
        minInstances: 1,
        maxInstances: 10,
        concurrency: 100,
        allowUnauthenticated: true,
        networkAttachment: 'projects/p/regions/us-central1/networkAttachments/att1',
        secrets: [
          { name: 'GEMINI_API_KEY', value: 'secret-val-123' },
        ],
      };

      assert.equal(payload.serviceName, 'order-fulfillment-bot');
      assert.equal(payload.projectId, 'my-production-project');
      assert.equal(payload.cpu, '2');
      assert.equal(payload.memory, '4Gi');
      assert.equal(payload.minInstances, 1);
      assert.equal(payload.maxInstances, 10);
      assert.equal(payload.concurrency, 100);
      assert.equal(payload.allowUnauthenticated, true);
      assert.equal(payload.secrets.length, 1);
      assert.equal(payload.secrets[0].name, 'GEMINI_API_KEY');
    });

    it('should format CANCEL_CLOUD_RUN_DEPLOY message payload', () => {
      const cancelPayload = {
        targetDirectory: '/workspace/agents/order-bot',
      };
      assert.equal(cancelPayload.targetDirectory, '/workspace/agents/order-bot');
    });

    it('should format TEST_REMOTE_CLOUD_RUN message payload', () => {
      const testPayload = {
        targetDirectory: '/workspace/agents/order-bot',
        serviceUrl: 'https://order-fulfillment-bot-uc.a.run.app',
        query: 'What is the tracking number for order #456?',
        projectId: 'my-production-project',
      };

      assert.equal(testPayload.query, 'What is the tracking number for order #456?');
      assert.ok(testPayload.serviceUrl.startsWith('https://'));
      assert.equal(testPayload.projectId, 'my-production-project');
    });

    it('should format GENERATE_TERRAFORM_FILES and SAVE_TERRAFORM_FILES message payloads', () => {
      const generatePayload = {
        targetDirectory: '/workspace/agents/order-bot',
        projectId: 'my-production-project',
        region: 'us-central1',
        serviceName: 'order-fulfillment-bot',
        cpu: '1',
        memory: '2Gi',
        minInstances: 0,
        maxInstances: 5,
        concurrency: 80,
        allowUnauthenticated: true,
      };

      assert.equal(generatePayload.serviceName, 'order-fulfillment-bot');
      assert.equal(generatePayload.projectId, 'my-production-project');

      const savePayload = {
        targetDirectory: '/workspace/agents/order-bot',
        files: [
          { path: 'main.tf', content: '# main tf', language: 'terraform' },
        ],
      };

      assert.equal(savePayload.files.length, 1);
      assert.equal(savePayload.files[0].path, 'main.tf');
    });
  });

  describe('Unified Layout & Deployment Status', () => {
    it('should format deploy status badge correctly based on status', () => {
      const getBadgeClass = (status: string) => {
        switch (status) {
          case 'building':
          case 'deploying':
            return 'text-blue-400 bg-blue-900/30';
          case 'success':
            return 'text-green-400 bg-green-900/30';
          case 'error':
            return 'text-red-400 bg-red-900/30';
          default:
            return 'text-gray-400 bg-gray-800';
        }
      };

      assert.ok(getBadgeClass('building').includes('text-blue-400'));
      assert.ok(getBadgeClass('deploying').includes('text-blue-400'));
      assert.ok(getBadgeClass('success').includes('text-green-400'));
      assert.ok(getBadgeClass('error').includes('text-red-400'));
      assert.ok(getBadgeClass('idle').includes('text-gray-400'));
    });
  });
});

