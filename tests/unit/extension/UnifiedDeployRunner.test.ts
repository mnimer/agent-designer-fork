/**
 * Unit Tests for UnifiedDeployRunner
 *
 * Validates:
 * 1. Self-contained repository deployment command resolution across Makefile (`make deploy`, `make infra`),
 *    Cloud Build (`cloudbuild.yaml`), Terraform (`main.tf`), and direct CLI (`adk`, `gcloud`).
 * 2. Unified command & argument building for both Vertex AI Agent Engine and Google Cloud Run.
 * 3. Subprocess execution, real-time stdout/stderr log streaming, and process cancellation.
 * 4. Zero procedural file mutation guarantee during deployment execution.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { UnifiedDeployRunner } from '../../../src/extension/deployer/UnifiedDeployRunner';
import { GcloudDetector } from '../../../src/extension/deployer/GcloudDetector';

describe('UnifiedDeployRunner', () => {
  let tempDir: string;
  let detector: GcloudDetector;
  let runner: UnifiedDeployRunner;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'unified_deploy_test_'));
    detector = new GcloudDetector();
    runner = new UnifiedDeployRunner(detector);
  });

  afterEach(() => {
    runner.cancelAll();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  describe('Makefile & Repository Artifact Inspection', () => {
    it('should detect when Makefile exists and contains specific targets', () => {
      assert.equal(runner.hasMakefileTarget(tempDir, 'deploy'), false);

      fs.writeFileSync(
        path.join(tempDir, 'Makefile'),
        [
          '.PHONY: install dev test infra deploy',
          'install:',
          '\tpython3 -m venv .venv',
          'deploy:',
          '\t.venv/bin/adk deploy agent_engine .',
          'infra:',
          '\tterraform init && terraform apply -auto-approve',
        ].join('\n'),
        'utf8'
      );

      assert.equal(runner.hasMakefileTarget(tempDir, 'deploy'), true);
      assert.equal(runner.hasMakefileTarget(tempDir, 'infra'), true);
      assert.equal(runner.hasMakefileTarget(tempDir, 'install'), true);
      assert.equal(runner.hasMakefileTarget(tempDir, 'nonexistent'), false);
    });

    it('should detect cloudbuild.yaml and main.tf in target directory', () => {
      assert.equal(runner.hasCloudBuildConfig(tempDir), false);
      assert.equal(runner.hasTerraformConfig(tempDir), false);

      fs.writeFileSync(path.join(tempDir, 'cloudbuild.yaml'), 'steps: []\n', 'utf8');
      fs.writeFileSync(path.join(tempDir, 'main.tf'), 'terraform {}\n', 'utf8');

      assert.equal(runner.hasCloudBuildConfig(tempDir), true);
      assert.equal(runner.hasTerraformConfig(tempDir), true);
    });
  });

  describe('Standardized CLI / CI/CD Command Builders', () => {
    it('should build make deploy command with Agent Engine variables including resource and network UI options', () => {
      const cmd = runner.buildMakeDeployCommand({
        target: 'agent_engine',
        targetDirectory: tempDir,
        projectId: 'argolis-playground',
        region: 'us-central1',
        displayName: 'support_agent',
        agentEngineId: '1234567890',
        stagingBucket: 'gs://my-staging-bucket',
        serviceAccount: 'agent-sa@argolis-playground.iam.gserviceaccount.com',
        networkAttachment: 'projects/argolis-playground/regions/us-central1/networkAttachments/my-psc',
        cpu: '2',
        memory: '4Gi',
        minInstances: 1,
        maxInstances: 5,
      });

      assert.equal(cmd.executable, 'make');
      assert.ok(cmd.args.includes('deploy'));
      assert.ok(cmd.args.includes('PROJECT_ID=argolis-playground'));
      assert.ok(cmd.args.includes('REGION=us-central1'));
      assert.ok(cmd.args.includes('AGENT_ENGINE_ID=1234567890'));
      assert.ok(cmd.args.includes('STAGING_BUCKET=gs://my-staging-bucket'));
      assert.ok(cmd.args.includes('SERVICE_ACCOUNT=agent-sa@argolis-playground.iam.gserviceaccount.com'));
      assert.ok(
        cmd.args.includes(
          'NETWORK_ATTACHMENT=projects/argolis-playground/regions/us-central1/networkAttachments/my-psc'
        )
      );
      assert.ok(cmd.args.includes('CPU=2'));
      assert.ok(cmd.args.includes('MEMORY=4Gi'));
      assert.ok(cmd.args.includes('MIN_INSTANCES=1'));
      assert.ok(cmd.args.includes('MAX_INSTANCES=5'));
    });

    it('should build make deploy command with Cloud Run variables including CPU, memory, scaling, network, and envVars', () => {
      const cmd = runner.buildMakeDeployCommand({
        target: 'cloud_run',
        targetDirectory: tempDir,
        projectId: 'argolis-playground',
        region: 'us-east1',
        serviceName: 'order-agent-svc',
        cpu: '2',
        memory: '4Gi',
        minInstances: 1,
        maxInstances: 10,
        allowUnauthenticated: true,
        networkAttachment: 'projects/argolis-playground/regions/us-east1/networkAttachments/cr-psc',
        envVars: { CUSTOM_KEY: 'custom_val' },
      });

      assert.equal(cmd.executable, 'make');
      assert.ok(cmd.args.includes('deploy'));
      assert.ok(cmd.args.includes('PROJECT_ID=argolis-playground'));
      assert.ok(cmd.args.includes('REGION=us-east1'));
      assert.ok(cmd.args.includes('SERVICE_NAME=order-agent-svc'));
      assert.ok(cmd.args.includes('CPU=2'));
      assert.ok(cmd.args.includes('MEMORY=4Gi'));
      assert.ok(cmd.args.includes('MIN_INSTANCES=1'));
      assert.ok(cmd.args.includes('MAX_INSTANCES=10'));
      assert.ok(cmd.args.includes('ALLOW_UNAUTHENTICATED=true'));
      assert.ok(
        cmd.args.includes('NETWORK_ATTACHMENT=projects/argolis-playground/regions/us-east1/networkAttachments/cr-psc')
      );
      const envArg = cmd.args.find((a) => a.startsWith('ENV_VARS='));
      assert.ok(envArg, 'Expected ENV_VARS=... argument for Cloud Run make deploy');
      assert.ok(envArg.includes('CUSTOM_KEY=custom_val'));
      assert.ok(envArg.includes('GOOGLE_CLOUD_PROJECT=argolis-playground'));
    });

    it('should build Cloud Build submission command for CI/CD parity', () => {
      const cmd = runner.buildCloudBuildCommand({
        target: 'agent_engine',
        targetDirectory: tempDir,
        projectId: 'argolis-playground',
        region: 'us-central1',
        agentName: 'support_agent',
        agentEngineId: '9876543210',
      });

      assert.equal(cmd.executable, 'gcloud');
      assert.deepEqual(cmd.args.slice(0, 3), ['builds', 'submit', '--config=cloudbuild.yaml']);
      assert.ok(cmd.args.includes('--project=argolis-playground'));
      const subArg = cmd.args.find((a) => a.startsWith('--substitutions='));
      assert.ok(subArg);
      assert.ok(subArg.includes('_PROJECT_ID=argolis-playground'));
      assert.ok(subArg.includes('_REGION=us-central1'));
      assert.ok(subArg.includes('_AGENT_NAME=support_agent'));
      assert.ok(subArg.includes('_REASONING_ENGINE_ID=9876543210'));
    });

    it('should build Terraform apply command for infrastructure provisioning', () => {
      const cmd = runner.buildTerraformApplyCommand({
        target: 'cloud_run',
        targetDirectory: tempDir,
        projectId: 'argolis-playground',
        region: 'us-central1',
        serviceName: 'order-agent-svc',
      });

      assert.equal(cmd.executable, 'terraform');
      assert.ok(cmd.args.includes('apply'));
      assert.ok(cmd.args.includes('-auto-approve'));
      assert.ok(cmd.args.includes('-var=project_id=argolis-playground'));
      assert.ok(cmd.args.includes('-var=region=us-central1'));
      assert.ok(cmd.args.includes('-var=service_name=order-agent-svc'));
    });
  });

  describe('Subprocess Execution, Streaming & Cancellation', () => {
    it('should execute command, stream stdout/stderr lines, and return exit code 0 without mutating workspace files', async () => {
      if (process.platform === 'win32') return;

      const agentPyPath = path.join(tempDir, 'agent.py');
      const originalAgentPy = '# Pure generated agent.py\nroot_agent = None\n';
      fs.writeFileSync(agentPyPath, originalAgentPy, 'utf8');

      const logs: Array<{ text: string; stream: string }> = [];
      const result = await runner.executeCommand({
        targetDirectory: tempDir,
        executable: process.execPath,
        args: ['-e', 'console.log("Deployed: projects/p/locations/us-central1/reasoningEngines/12345"); console.error("Progress 100%");'],
        onLog: (text, stream) => {
          logs.push({ text, stream });
        },
      });

      assert.equal(result.exitCode, 0);
      assert.equal(result.cancelled, false);
      assert.ok(logs.some((l) => l.text.includes('reasoningEngines/12345') && l.stream === 'stdout'));
      assert.ok(logs.some((l) => l.text.includes('Progress 100%') && l.stream === 'stderr'));

      // Verify zero procedural file mutation on agent.py or directory
      assert.equal(fs.readFileSync(agentPyPath, 'utf8'), originalAgentPy);
      assert.equal(fs.existsSync(path.join(tempDir, 'agent_runtime_app.py')), false);
      assert.equal(fs.existsSync(path.join(tempDir, 'agents-cli-manifest.yaml')), false);
    });

    it('should support cancelling an active deployment subprocess cleanly', async () => {
      if (process.platform === 'win32') return;

      const execPromise = runner.executeCommand({
        targetDirectory: tempDir,
        executable: process.execPath,
        args: ['-e', 'setTimeout(() => {}, 10000);'],
      });

      await new Promise((r) => setTimeout(r, 150));
      const cancelled = runner.cancel(tempDir);
      assert.equal(cancelled, true);

      const res = await execPromise;
      assert.equal(res.cancelled, true);
    });
  });
});
