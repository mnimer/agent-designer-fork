/**
 * Unit Tests for CloudRunDeployer
 *
 * Validates:
 * 1. Pre-deployment directory validation (server.py, agent.py, Dockerfile detection).
 * 2. IaC generation and writing to target workspace.
 * 3. Deployment metadata reading, writing, and persistence.
 * 4. Active deployment registration and cancellation.
 * 5. Remote test endpoint dispatching against local mock server.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as http from 'http';
import { CloudRunDeployer, CloudRunDeploymentMetadataRecord } from '../../../src/extension/CloudRunDeployer';
import { AgentWorkflowDocument } from '../../../src/shared/types';

describe('CloudRunDeployer', () => {
  let tempDir: string;
  let deployer: CloudRunDeployer;

  const mockDocument: AgentWorkflowDocument = {
    schemaVersion: '1.0.0',
    name: 'order-agent',
    description: 'Autonomous order processing agent',
    framework: 'adk',
    language: 'python',
    nodes: [],
    edges: [],
  };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud_run_test_'));
    deployer = new CloudRunDeployer();
  });

  afterEach(() => {
    deployer.dispose();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  // Mock bridge helper
  function createMockBridge() {
    const postedMessages: any[] = [];
    return {
      postedMessages,
      postMessage: async (msg: any) => {
        postedMessages.push(msg);
      },
    } as any;
  }

  describe('Pre-Deployment Validation', () => {
    it('should reject non-existent target directory', () => {
      const nonExistent = path.join(tempDir, 'does_not_exist');
      const result = deployer.validateTargetDirectory(nonExistent);
      assert.equal(result.isValid, false);
      assert.ok(result.error?.includes('does not exist'));
    });

    it('should reject empty directory missing entrypoint files', () => {
      const result = deployer.validateTargetDirectory(tempDir);
      assert.equal(result.isValid, false);
      assert.ok(result.error?.includes('entrypoint'));
    });

    it('should accept directory with server.py', () => {
      fs.writeFileSync(path.join(tempDir, 'server.py'), '# server entrypoint');
      const result = deployer.validateTargetDirectory(tempDir);
      assert.equal(result.isValid, true);
    });

    it('should accept directory with Dockerfile', () => {
      fs.writeFileSync(path.join(tempDir, 'Dockerfile'), 'FROM python:3.11-slim');
      const result = deployer.validateTargetDirectory(tempDir);
      assert.equal(result.isValid, true);
    });

    it('should accept directory with agent.py', () => {
      fs.writeFileSync(path.join(tempDir, 'agent.py'), '# agent code');
      const result = deployer.validateTargetDirectory(tempDir);
      assert.equal(result.isValid, true);
    });
  });

  describe('File Writing', () => {

    it('should write IaC files to disk in the target directory', () => {
      const files = [
        {
          path: 'main.tf',
          name: 'main.tf',
          description: 'Terraform configuration',
          content: '# main terraform content',
          language: 'terraform',
        },
        {
          path: 'cloudbuild.yaml',
          name: 'cloudbuild.yaml',
          description: 'Cloud Build configuration',
          content: '# cloud build yaml',
          language: 'yaml',
        },
      ];

      const written = deployer.writeIaCFiles(tempDir, files);
      assert.equal(written.length, 2);
      assert.ok(fs.existsSync(path.join(tempDir, 'main.tf')));
      assert.ok(fs.existsSync(path.join(tempDir, 'cloudbuild.yaml')));
      assert.equal(fs.readFileSync(path.join(tempDir, 'main.tf'), 'utf8'), '# main terraform content');
    });

    it('should create subdirectories if needed when writing IaC files', () => {
      const nestedDir = path.join(tempDir, 'sub', 'iac');
      const files = [
        {
          path: 'terraform/main.tf',
          name: 'main.tf',
          description: 'Terraform configuration',
          content: '# main terraform content',
          language: 'terraform',
        },
      ];

      const written = deployer.writeIaCFiles(nestedDir, files);
      assert.equal(written.length, 1);
      assert.ok(fs.existsSync(path.join(nestedDir, 'terraform', 'main.tf')));
    });
  });

  describe('Metadata Persistence', () => {
    it('should return null when reading metadata from a folder without metadata file', () => {
      const meta = deployer.readDeploymentMetadata(tempDir);
      assert.equal(meta, null);
    });

    it('should write and read back metadata record', () => {
      const record: CloudRunDeploymentMetadataRecord = {
        service_name: 'order-agent-svc',
        service_url: 'https://order-agent-svc-xyz-uc.a.run.app',
        project_id: 'demo-gcp-project',
        region: 'us-central1',
        deployed_at: new Date().toISOString(),
        console_url: 'https://console.cloud.google.com/run/detail/us-central1/order-agent-svc?project=demo-gcp-project',
        allow_unauthenticated: true,
        cpu: '1',
        memory: '2Gi',
        min_instances: 0,
        max_instances: 5,
        concurrency: 80,
      };

      deployer.writeDeploymentMetadata(tempDir, record);
      const readBack = deployer.readDeploymentMetadata(tempDir);

      assert.notEqual(readBack, null);
      assert.equal(readBack?.service_name, 'order-agent-svc');
      assert.equal(readBack?.service_url, 'https://order-agent-svc-xyz-uc.a.run.app');
      assert.equal(readBack?.project_id, 'demo-gcp-project');
      assert.equal(readBack?.region, 'us-central1');
      assert.equal(readBack?.allow_unauthenticated, true);
    });
  });

  describe('Deployment Status & Cancellation', () => {
    it('should report null status when no deployment is active', () => {
      const status = deployer.getDeploymentStatus('order-agent-svc');
      assert.equal(status, null);
    });

    it('should handle cancelDeploy gracefully when no active deployment exists', () => {
      const mockBridge = createMockBridge();
      // Should not throw
      deployer.cancelDeploy('non-existent-service', mockBridge);
      assert.equal(mockBridge.postedMessages.length, 0);
    });

    it('should generate standardized deploy command string preferring Makefile when present', () => {
      const gcloudCmd = deployer.getDeployCommandString({
        targetDirectory: tempDir,
        projectId: 'my-gcp-project',
        region: 'us-central1',
        serviceName: 'order-agent-svc',
      });
      assert.ok(gcloudCmd.includes('gcloud run deploy order-agent-svc'));

      fs.writeFileSync(
        path.join(tempDir, 'Makefile'),
        'deploy:\n\tgcloud run deploy $(SERVICE_NAME) --source . --project $(PROJECT_ID) --region $(REGION)\n',
        'utf8'
      );

      const makeCmd = deployer.getDeployCommandString({
        targetDirectory: tempDir,
        projectId: 'my-gcp-project',
        region: 'us-central1',
        serviceName: 'order-agent-svc',
      });
      assert.ok(makeCmd.startsWith('make deploy'));
      assert.ok(makeCmd.includes('PROJECT_ID=my-gcp-project'));
      assert.ok(makeCmd.includes('SERVICE_NAME=order-agent-svc'));
    });

    it('should execute make deploy directly with CPU, memory, and scaling UI options when Makefile is present', async () => {
      if (process.platform === 'win32') return;
      const mockBridge = createMockBridge();
      fs.writeFileSync(path.join(tempDir, 'server.py'), '# server entrypoint\n', 'utf8');
      fs.writeFileSync(path.join(tempDir, 'Dockerfile'), 'FROM python:3.11-slim\n', 'utf8');

      const expectedUrl = 'https://order-agent-svc-12345-uc.a.run.app';
      const makefileContent = [
        '.PHONY: deploy',
        'deploy:',
        '\t@echo "Deploying Cloud Run with PROJECT_ID=$(PROJECT_ID) REGION=$(REGION) SERVICE_NAME=$(SERVICE_NAME) CPU=$(CPU) MEMORY=$(MEMORY) MIN_INSTANCES=$(MIN_INSTANCES) MAX_INSTANCES=$(MAX_INSTANCES) ALLOW_UNAUTHENTICATED=$(ALLOW_UNAUTHENTICATED) NETWORK_ATTACHMENT=$(NETWORK_ATTACHMENT) ENV_VARS=$(ENV_VARS)"',
        `\t@echo "Service [order-agent-svc] revision [order-agent-svc-00001] has been deployed and is serving 100 percent of traffic."`,
        `\t@echo "Service URL: ${expectedUrl}"`,
      ].join('\n');
      fs.writeFileSync(path.join(tempDir, 'Makefile'), makefileContent + '\n', 'utf8');

      const result = await deployer.deploy({
        targetDirectory: tempDir,
        projectId: 'my-gcp-project',
        region: 'us-central1',
        serviceName: 'order-agent-svc',
        cpu: '4',
        memory: '8Gi',
        minInstances: 2,
        maxInstances: 20,
        allowUnauthenticated: true,
        networkAttachment: 'projects/my-gcp-project/regions/us-central1/networkAttachments/cr-psc',
        envVars: { FEATURE_FLAG: 'enabled' },
        bridge: mockBridge,
      });

      assert.equal(result.success, true, `Expected Cloud Run make deploy to succeed, got error: ${result.error}`);
      assert.equal(result.serviceUrl, expectedUrl);

      const logTexts = mockBridge.postedMessages
        .filter((m) => m.type === 'CLOUD_RUN_DEPLOY_LOG')
        .map((m) => m.payload.text)
        .join('\n');
      assert.ok(logTexts.includes('[RUN COMMAND] make deploy'), 'Should log [RUN COMMAND] make deploy');
      assert.ok(logTexts.includes('CPU=4'), 'Makefile should receive CPU=4');
      assert.ok(logTexts.includes('MEMORY=8Gi'), 'Makefile should receive MEMORY=8Gi');
      assert.ok(logTexts.includes('MIN_INSTANCES=2'), 'Makefile should receive MIN_INSTANCES=2');
      assert.ok(logTexts.includes('MAX_INSTANCES=20'), 'Makefile should receive MAX_INSTANCES=20');
      assert.ok(logTexts.includes('ALLOW_UNAUTHENTICATED=true'), 'Makefile should receive ALLOW_UNAUTHENTICATED=true');
      assert.ok(logTexts.includes('FEATURE_FLAG=enabled'), 'Makefile should receive custom envVars');
    });
  });

  describe('Remote Service Testing', () => {
    let mockServer: http.Server;
    let serverPort: number;

    beforeEach(async () => {
      await new Promise<void>((resolve) => {
        mockServer = http.createServer((req, res) => {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', () => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ response: 'Processed: ' + body, status: 'ok' }));
          });
        });
        mockServer.listen(0, '127.0.0.1', () => {
          const addr = mockServer.address() as any;
          serverPort = addr.port;
          resolve();
        });
      });
    });

    afterEach(async () => {
      await new Promise<void>((resolve) => {
        mockServer.close(() => resolve());
      });
    });

    it('should reject test if service URL is missing', async () => {
      const result = await deployer.testRemoteService({
        serviceUrl: '',
        query: 'hello',
      });

      assert.equal(result.success, false);
      assert.ok(result.error?.includes('No Cloud Run service URL'));
    });

    it('should post request and receive response from remote service', async () => {
      const result = await deployer.testRemoteService({
        serviceUrl: `http://127.0.0.1:${serverPort}`,
        query: 'What is the status of my order?',
      });

      assert.equal(result.success, true);
      assert.ok(result.response?.includes('Processed'));
      assert.ok(typeof result.durationMs === 'number');
    });
  });
});
