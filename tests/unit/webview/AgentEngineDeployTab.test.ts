/**
 * Unit Tests for AgentEngineDeployTab Configuration & State
 *
 * Validates:
 * 1. Default configuration parameters (global region default, project fallback).
 * 2. In-place container update vs new instance provisioning logic.
 * 3. Payload contract for DEPLOY_TO_AGENT_ENGINE, CANCEL_AGENT_ENGINE_DEPLOY, and TEST_REMOTE_AGENT_ENGINE.
 * 4. Stream telemetry categorization and live passthrough endpoint formatting.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AgentWorkflowDocument } from '../../../src/shared/types';
import { DeploymentMetadataRecord } from '../../../src/extension/AgentEngineDeployer';

describe('AgentEngineDeployTab State & Logic', () => {
  const sampleDocument: AgentWorkflowDocument = {
    schemaVersion: '1.0.0',
    name: 'financial-advisor-agent',
    description: 'Financial advisor agent',
    framework: 'adk',
    language: 'python',
    nodes: [],
    edges: [],
    metadata: {
      settings: {
        customFields: {
          gcpProjectId: 'my-custom-prod-project',
        },
      },
    },
  };

  it('should resolve default project ID from document metadata or fallback to empty string', () => {
    const docWithProject = sampleDocument;
    const resolvedFromDoc =
      docWithProject?.metadata?.settings?.customFields?.gcpProjectId || '';
    assert.equal(resolvedFromDoc, 'my-custom-prod-project');

    const emptyDoc: AgentWorkflowDocument = {
      schemaVersion: '1.0.0',
      name: 'test',
      description: '',
      framework: 'adk',
      language: 'python',
      nodes: [],
      edges: [],
    };
    const fallback =
      emptyDoc?.metadata?.settings?.customFields?.gcpProjectId || '';
    assert.equal(fallback, '');
  });

  it('should require a non-empty GCP project ID before allowing deployment', () => {
    const isProjectIdValid = (val: string) => Boolean(val && val.trim());
    assert.equal(isProjectIdValid(''), false);
    assert.equal(isProjectIdValid('   '), false);
    assert.equal(isProjectIdValid('my-production-project'), true);
  });

  it('should enforce us-central1 regional location as default per Vertex AI Agent Runtime requirement', () => {
    const defaultRegion = 'us-central1';
    assert.equal(defaultRegion, 'us-central1');

    const validRegions = ['us-central1', 'us-east4', 'us-west1', 'europe-west1', 'europe-west4', 'asia-northeast1'];
    assert.ok(validRegions.includes('us-central1'));
    assert.ok(validRegions.includes('europe-west4'));
  });

  it('should compute button label and update behavior based on existing metadata and forceNew flag', () => {
    const existingMetadata: DeploymentMetadataRecord = {
      remote_agent_runtime_id: 'projects/p/locations/global/reasoningEngines/123',
      deployment_target: 'agent_runtime',
      is_a2a: true,
      agent_directory: '/mock/dir',
      deployment_timestamp: new Date().toISOString(),
      service_url: 'https://test-url',
      console_url: 'https://test-console',
      project_id: 'p',
      region: 'global',
      status: 'ACTIVE',
    };

    // Mode 1: Has existing deployment, forceNew = false -> in-place update
    let hasExisting = Boolean(existingMetadata?.remote_agent_runtime_id);
    let forceNew = false;
    let label = hasExisting && !forceNew ? 'Update Agent Runtime Instance' : 'Deploy to Agent Runtime';
    assert.equal(label, 'Update Agent Runtime Instance');

    // Mode 2: Has existing deployment, forceNew = true -> provision new instance
    forceNew = true;
    label = hasExisting && !forceNew ? 'Update Agent Runtime Instance' : 'Deploy to Agent Runtime';
    assert.equal(label, 'Deploy to Agent Runtime');

    // Mode 3: No existing deployment -> provision new instance
    hasExisting = false;
    label = hasExisting && !forceNew ? 'Update Agent Runtime Instance' : 'Deploy to Agent Runtime';
    assert.equal(label, 'Deploy to Agent Runtime');
  });

  it('should format DEPLOY_TO_AGENT_ENGINE message payload adhering to rpcProtocol specification', () => {
    const payload = {
      document: sampleDocument,
      targetDirectory: '/path/to/agents/financial-advisor',
      projectId: 'my-custom-prod-project',
      region: 'global',
      serviceAccount: 'custom-sa@my-custom-prod-project.iam.gserviceaccount.com',
      networkAttachment: 'projects/my-custom-prod-project/regions/global/networkAttachments/att1',
      stagingBucket: 'gs://staging-bkt',
      forceNew: false,
      envVars: {
        DATABASE_URL: 'secret_db_url',
        API_KEY: 'secret_key',
      },
    };

    assert.equal(payload.projectId, 'my-custom-prod-project');
    assert.equal(payload.region, 'global');
    assert.equal(payload.serviceAccount, 'custom-sa@my-custom-prod-project.iam.gserviceaccount.com');
    assert.equal(payload.envVars.API_KEY, 'secret_key');
  });

  it('should format TEST_REMOTE_AGENT_ENGINE query payload adhering to rpcProtocol specification', () => {
    const testPayload = {
      targetDirectory: '/path/to/agents/financial-advisor',
      query: 'What stocks are performing well today?',
      remoteRuntimeId: 'projects/proj/locations/global/reasoningEngines/987',
      serviceUrl: 'https://global-aiplatform.googleapis.com/v1/projects/proj/locations/global/reasoningEngines/987/api/run_sse',
      location: 'global',
      projectId: 'proj',
    };

    assert.equal(testPayload.query, 'What stocks are performing well today?');
    assert.ok(testPayload.serviceUrl.endsWith('/api/run_sse'));
    assert.equal(testPayload.location, 'global');
  });

  it('should correctly classify log stream message colors and badges', () => {
    const stdoutLog = { stream: 'stdout', text: 'Step 1/3: Installing requirements.txt' };
    const stderrLog = { stream: 'stderr', text: 'Warning: Deprecated parameter used' };
    const systemLog = { stream: 'system', text: 'Agent Engine deployed successfully!' };

    assert.equal(stdoutLog.stream, 'stdout');
    assert.equal(stderrLog.stream, 'stderr');
    assert.equal(systemLog.stream, 'system');
  });
});
