/**
 * Unit Tests for Decomposed Deployer Sub-services
 *
 * Validates GcloudDetector, ArtifactStager, ReasoningEngineClient, and DeployPipeline
 * in isolation to ensure strict functional encapsulation and coverage.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { GcloudDetector } from '../../../src/extension/deployer/GcloudDetector';
import { ArtifactStager } from '../../../src/extension/deployer/ArtifactStager';
import { ReasoningEngineClient } from '../../../src/extension/deployer/ReasoningEngineClient';
import { DeployPipeline } from '../../../src/extension/deployer/DeployPipeline';
import { AgentEngineDeployOptions, DeploymentMetadataRecord } from '../../../src/extension/deployer/DeployTypes';

describe('Decomposed Deployer Services (In Isolation)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'decomp_deploy_test_'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  describe('GcloudDetector', () => {
    it('should correctly identify home and common paths in getExtendedEnv', () => {
      const detector = new GcloudDetector();
      const env = detector.getExtendedEnv();
      assert.ok(env.PATH);
      assert.equal(env.PYTHONUNBUFFERED, '1');
    });

    it('should correctly fallback to default if gcloud is not found', async () => {
      const detector = new GcloudDetector();
      const gpath = await detector.resolveGcloudPath();
      assert.ok(gpath);
    });
  });

  describe('ArtifactStager', () => {
    it('should reject invalid folder naming starting with number', () => {
      const stager = new ArtifactStager();
      const folderPath = path.join(tempDir, '123_agent');
      fs.mkdirSync(folderPath, { recursive: true });
      fs.writeFileSync(path.join(folderPath, 'agent.py'), '# code');

      const res = stager.validateTargetDirectory(folderPath);
      assert.equal(res.valid, false);
      assert.ok(res.nameError?.includes('cannot begin with a number'));
    });

    it('should prepare and write deployment metadata correctly', () => {
      const stager = new ArtifactStager();
      const record: DeploymentMetadataRecord = {
        remote_agent_runtime_id: 'projects/p/locations/global/reasoningEngines/111',
        deployment_target: 'agent_runtime',
        is_a2a: true,
        agent_directory: tempDir,
        deployment_timestamp: new Date().toISOString(),
        service_url: 'https://test',
        console_url: 'https://test-console',
        project_id: 'p',
        region: 'global',
        status: 'ACTIVE',
      };

      stager.writeDeploymentMetadata(tempDir, record);
      const read = stager.readDeploymentMetadata(tempDir);
      assert.deepEqual(read, record);
    });

    it('should ensure ignore files are created with correct defaults', () => {
      const stager = new ArtifactStager();
      stager.ensureIgnoreFiles(tempDir);

      assert.ok(fs.existsSync(path.join(tempDir, '.gcloudignore')));
      assert.ok(fs.existsSync(path.join(tempDir, '.gitignore')));
      assert.ok(fs.existsSync(path.join(tempDir, '.ae_ignore')));
    });
  });

  describe('ReasoningEngineClient', () => {
    it('should properly format console and endpoint URLs', () => {
      const detector = new GcloudDetector();
      const stager = new ArtifactStager();
      const client = new ReasoningEngineClient(null, detector, stager);

      const consoleUrl = client.resolveConsoleUrl('us-central1', 'my-proj', '12345');
      assert.ok(consoleUrl.includes('my-proj'));
      assert.ok(consoleUrl.includes('us-central1'));
      assert.ok(consoleUrl.includes('12345'));

      const endpointUrl = client.resolveEndpointUrl('us-central1', 'my-proj', '12345');
      assert.equal(
        endpointUrl,
        'https://us-central1-aiplatform.googleapis.com/v1/projects/my-proj/locations/us-central1/reasoningEngines/12345:streamQuery?alt=sse'
      );
    });

    it('should recognize reasoning engine 404 NOT_FOUND errors', () => {
      const detector = new GcloudDetector();
      const stager = new ArtifactStager();
      const client = new ReasoningEngineClient(null, detector, stager);

      assert.equal(client.isReasoningEngineNotFoundError('ReasoningEngine is not found'), true);
      assert.equal(client.isReasoningEngineNotFoundError('404 not found error on reasoningengines'), true);
      assert.equal(client.isReasoningEngineNotFoundError('permission denied'), false);
    });
  });

  describe('DeployPipeline', () => {
    it('should construct correct deploy args', () => {
      const detector = new GcloudDetector();
      const stager = new ArtifactStager();
      const client = new ReasoningEngineClient(null, detector, stager);
      const pipeline = new DeployPipeline(detector, stager, client);

      const options: AgentEngineDeployOptions = {
        targetDirectory: tempDir,
        projectId: 'test-project',
        region: 'us-east4',
        serviceAccount: 'test-sa@iam.gserviceaccount.com',
      };

      const args = pipeline.buildDeployArgs(options);
      assert.deepEqual(args, [
        'deploy',
        '--no-confirm-project',
        '--project',
        'test-project',
        '--region',
        'us-east4',
        '--service-account',
        'test-sa@iam.gserviceaccount.com',
      ]);
    });
  });
});
