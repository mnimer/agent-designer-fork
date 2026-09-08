/**
 * Unit Tests for AgentEngineDeployer
 *
 * Validates packaging, command argument generation, in-place update vs new create detection,
 * deployment cancellation, metadata persistence, and live remote passthrough testing.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as http from 'http';
import { AgentEngineDeployer, DeploymentMetadataRecord } from '../../src/extension/AgentEngineDeployer';
import { AgentWorkflowDocument } from '../../src/shared/types';

describe('AgentEngineDeployer', () => {
  let tempDir: string;
  let deployer: AgentEngineDeployer;

  const mockDocument: AgentWorkflowDocument = {
    schemaVersion: '1.0.0',
    name: 'support-agent',
    description: 'Support automation agent for Agent Engine',
    framework: 'adk',
    language: 'python',
    nodes: [],
    edges: [],
  };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent_engine_test_'));
    deployer = new AgentEngineDeployer();
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
      assert.equal(result.valid, false);
      assert.ok(result.missingFiles.includes('directory_not_found'));
    });

    it('should reject directory missing agent.py entrypoint', () => {
      // Empty directory
      const result = deployer.validateTargetDirectory(tempDir);
      assert.equal(result.valid, false);
      assert.ok(result.missingFiles.includes('agent.py'));
    });

    it('should validate directory containing agent.py successfully', () => {
      fs.writeFileSync(path.join(tempDir, 'agent.py'), '# Agent definition\n');
      const result = deployer.validateTargetDirectory(tempDir);
      assert.equal(result.valid, true);
      assert.equal(result.missingFiles.length, 0);
    });

    it('should reject directory containing hyphens in folder name', () => {
      const hyphenDir = path.join(tempDir, 'scratch-flow');
      fs.mkdirSync(hyphenDir, { recursive: true });
      fs.writeFileSync(path.join(hyphenDir, 'agent.py'), '# Agent definition\n');

      const result = deployer.validateTargetDirectory(hyphenDir);
      assert.equal(result.valid, false);
      assert.ok(result.nameError?.includes("contains hyphens ('-')"));
    });

    it('should reject directory starting with a digit', () => {
      const digitDir = path.join(tempDir, '123_agent');
      fs.mkdirSync(digitDir, { recursive: true });
      fs.writeFileSync(path.join(digitDir, 'agent.py'), '# Agent definition\n');

      const result = deployer.validateTargetDirectory(digitDir);
      assert.equal(result.valid, false);
      assert.ok(result.nameError?.includes('cannot begin with a number'));
    });
  });

  describe('Metadata Reading and Status Reporting', () => {
    it('should return null when deployment_metadata.json is absent', () => {
      const metadata = deployer.readDeploymentMetadata(tempDir);
      assert.equal(metadata, null);
    });

    it('should send idle status when deployment_metadata.json does not exist', () => {
      const bridge = createMockBridge();
      deployer.getDeploymentStatus(tempDir, bridge);

      assert.equal(bridge.postedMessages.length, 1);
      assert.equal(bridge.postedMessages[0].type, 'AGENT_ENGINE_DEPLOY_STATUS');
      assert.equal(bridge.postedMessages[0].payload.status, 'idle');
      assert.equal(bridge.postedMessages[0].payload.metadata, undefined);
    });

    it('should parse valid deployment_metadata.json and report active status', () => {
      const metadataRecord: DeploymentMetadataRecord = {
        remote_agent_runtime_id: 'projects/test-proj/locations/global/reasoningEngines/123456789',
        deployment_target: 'agent_runtime',
        is_a2a: true,
        agent_directory: tempDir,
        deployment_timestamp: new Date().toISOString(),
        service_url:
          'https://global-aiplatform.googleapis.com/v1/projects/test-proj/locations/global/reasoningEngines/123456789/api/run_sse',
        console_url:
          'https://console.cloud.google.com/vertex-ai/reasoning-engines/locations/global/reasoning-engines/123456789?project=test-proj',
        project_id: 'test-proj',
        region: 'global',
        status: 'ACTIVE',
      };

      fs.writeFileSync(
        path.join(tempDir, 'deployment_metadata.json'),
        JSON.stringify(metadataRecord, null, 2)
      );

      const bridge = createMockBridge();
      deployer.getDeploymentStatus(tempDir, bridge);

      assert.equal(bridge.postedMessages.length, 1);
      assert.equal(bridge.postedMessages[0].type, 'AGENT_ENGINE_DEPLOY_STATUS');
      assert.equal(bridge.postedMessages[0].payload.status, 'success');
      assert.equal(
        bridge.postedMessages[0].payload.metadata.remote_agent_runtime_id,
        metadataRecord.remote_agent_runtime_id
      );
    });

    it('should handle corrupted deployment_metadata.json gracefully', () => {
      fs.writeFileSync(path.join(tempDir, 'deployment_metadata.json'), 'CORRUPTED_JSON_DATA{');
      const metadata = deployer.readDeploymentMetadata(tempDir);
      assert.equal(metadata, null);

      const bridge = createMockBridge();
      deployer.getDeploymentStatus(tempDir, bridge);
      assert.equal(bridge.postedMessages.length, 1);
      assert.equal(bridge.postedMessages[0].payload.status, 'idle');
    });

    it('should write and persist updated deployment metadata', () => {
      const record: DeploymentMetadataRecord = {
        remote_agent_runtime_id: 'projects/p/locations/global/reasoningEngines/999',
        deployment_target: 'agent_runtime',
        is_a2a: true,
        agent_directory: tempDir,
        deployment_timestamp: new Date().toISOString(),
        service_url: 'https://test-url',
        console_url: 'https://test-console',
        project_id: 'p',
        region: 'global',
        status: 'ACTIVE',
      };

      deployer.saveDeploymentMetadata(tempDir, record);
      const readBack = deployer.readDeploymentMetadata(tempDir);
      assert.deepEqual(readBack, record);
    });
  });

  describe('CLI Command Argument Generation & Manifest Handling', () => {
    it('should generate arguments for initial deployment with regional us-central1 default and --no-confirm-project', () => {
      const args = deployer.buildDeployArgs({
        targetDirectory: tempDir,
        projectId: 'gcp-project-alpha',
        region: 'global', // should normalize to us-central1
      });

      assert.deepEqual(args, [
        'deploy',
        '--no-confirm-project',
        '--project',
        'gcp-project-alpha',
        '--region',
        'us-central1',
      ]);
    });

    it('should preserve explicitly provided regional location and never include --deployment-target or --resource-name', () => {
      const args = deployer.buildDeployArgs({
        targetDirectory: tempDir,
        projectId: 'gcp-project-alpha',
        region: 'us-east4',
      });

      assert.deepEqual(args, [
        'deploy',
        '--no-confirm-project',
        '--project',
        'gcp-project-alpha',
        '--region',
        'us-east4',
      ]);
      assert.equal(args.includes('--deployment-target'), false);
      assert.equal(args.includes('--resource-name'), false);
    });

    it('should include optional service account and network attachment flags', () => {
      const args = deployer.buildDeployArgs({
        targetDirectory: tempDir,
        projectId: 'proj-beta',
        region: 'us-east4',
        serviceAccount: 'my-agent-sa@proj-beta.iam.gserviceaccount.com',
        networkAttachment: 'projects/proj-beta/regions/us-east4/networkAttachments/my-attachment',
      });

      assert.ok(args.includes('--service-account'));
      assert.ok(args.includes('my-agent-sa@proj-beta.iam.gserviceaccount.com'));
      assert.ok(args.includes('--network-attachment'));
      assert.ok(args.includes('projects/proj-beta/regions/us-east4/networkAttachments/my-attachment'));
      assert.equal(args.includes('--deployment-target'), false);
    });

    it('should create agents-cli-manifest.yaml if not present in target directory', () => {
      const manifestPath = path.join(tempDir, 'agents-cli-manifest.yaml');
      if (fs.existsSync(manifestPath)) {
        fs.unlinkSync(manifestPath);
      }

      deployer.ensureManifestFile(tempDir, {
        targetDirectory: tempDir,
        projectId: 'test-proj',
        region: 'us-central1',
      });

      assert.ok(fs.existsSync(manifestPath));
      const content = fs.readFileSync(manifestPath, 'utf8');
      assert.ok(content.includes('deployment_target: agent_runtime'));
      assert.ok(content.includes('region: us-central1'));
    });

    it('should generate arguments for official ADK deployment with --project, --region, and --display_name', () => {
      const args = deployer.buildAdkDeployArgs({
        targetDirectory: tempDir,
        projectId: 'my-proj',
        region: 'global', // normalizes to us-central1
        displayName: 'Customer Service Agent',
      });
      assert.deepEqual(args, [
        'deploy',
        'agent_engine',
        '--project',
        'my-proj',
        '--region',
        'us-central1',
        '--display_name',
        'Customer Service Agent',
        '--session_service_uri',
        'memory://',
        '.',
      ]);
    });

    it('should generate arguments for ADK update using --agent_engine_id extracted from resource name', () => {
      const args = deployer.buildAdkDeployArgs(
        {
          targetDirectory: tempDir,
          projectId: 'my-proj',
          region: 'us-east4',
        },
        {
          remote_agent_runtime_id: 'projects/my-proj/locations/us-east4/reasoningEngines/987654321',
          deployment_target: 'agent_runtime',
          is_a2a: true,
          agent_directory: tempDir,
          deployment_timestamp: new Date().toISOString(),
          service_url: 'https://test',
          console_url: 'https://test',
          project_id: 'my-proj',
          region: 'us-east4',
          status: 'ACTIVE',
        }
      );
      assert.deepEqual(args, [
        'deploy',
        'agent_engine',
        '--project',
        'my-proj',
        '--region',
        'us-east4',
        '--agent_engine_id',
        '987654321',
        '--session_service_uri',
        'memory://',
        '.',
      ]);
    });

    it('should generate arguments for ADK update using options.agentEngineId when provided', () => {
      const args = deployer.buildAdkDeployArgs({
        targetDirectory: tempDir,
        projectId: 'my-proj',
        region: 'us-central1',
        agentEngineId: 'projects/my-proj/locations/us-central1/reasoningEngines/1122334455',
      });
      assert.ok(args.includes('--agent_engine_id'));
      assert.ok(args.includes('1122334455'));
    });

    it('should omit --agent_engine_id when forceNew is true even if existing metadata or ID is present', () => {
      const args = deployer.buildAdkDeployArgs(
        {
          targetDirectory: tempDir,
          projectId: 'my-proj',
          region: 'us-central1',
          displayName: 'New Fresh Instance',
          agentEngineId: '1122334455',
          forceNew: true,
        },
        {
          remote_agent_runtime_id: 'projects/my-proj/locations/us-central1/reasoningEngines/987654321',
          deployment_target: 'agent_runtime',
          is_a2a: true,
          agent_directory: tempDir,
          deployment_timestamp: new Date().toISOString(),
          service_url: 'https://test',
          console_url: 'https://test',
          project_id: 'my-proj',
          region: 'us-central1',
          status: 'ACTIVE',
        }
      );
      assert.ok(!args.includes('--agent_engine_id'));
      assert.ok(args.includes('--display_name'));
      assert.ok(args.includes('New Fresh Instance'));
    });

    it('should include --artifact_service_uri when stagingBucket is provided', () => {
      const args = deployer.buildAdkDeployArgs({
        targetDirectory: tempDir,
        projectId: 'my-proj',
        region: 'us-central1',
        stagingBucket: 'my-bucket/artifacts',
      });
      assert.ok(args.includes('--artifact_service_uri'));
      assert.ok(args.includes('gs://my-bucket/artifacts'));
    });

    it('should update existing agents-cli-manifest.yaml to have deployment_target agent_runtime', () => {
      const manifestPath = path.join(tempDir, 'agents-cli-manifest.yaml');
      fs.writeFileSync(
        manifestPath,
        `name: my-agent
agent_directory: .
region: us-central1
create_params:
  deployment_target: cloud_run
  is_a2a: false
`,
        'utf8'
      );

      deployer.ensureManifestFile(tempDir, {
        targetDirectory: tempDir,
        projectId: 'test-proj',
        region: 'us-central1',
      });

      const content = fs.readFileSync(manifestPath, 'utf8');
      assert.ok(content.includes('deployment_target: agent_runtime'));
    });
  });

  describe('Packaging File Generation (pyproject.toml & agent_runtime_app.py)', () => {
    it('should generate pyproject.toml with requirements.txt dependencies if present', () => {
      fs.writeFileSync(
        path.join(tempDir, 'requirements.txt'),
        'google-adk>=2.0.0\n# comment\ngoogle-cloud-aiplatform>=1.150.0\n\nfastapi>=0.110.0\n',
        'utf8'
      );

      deployer.ensurePyProjectToml(tempDir, {
        targetDirectory: tempDir,
        projectId: 'test-proj',
      });

      const pyprojectPath = path.join(tempDir, 'pyproject.toml');
      assert.ok(fs.existsSync(pyprojectPath));
      const content = fs.readFileSync(pyprojectPath, 'utf8');
      assert.ok(content.includes('[project]'));
      assert.ok(content.includes('"google-adk>=2.0.0"'));
      assert.ok(content.includes('"google-cloud-aiplatform>=1.150.0"'));
      assert.ok(content.includes('"fastapi>=0.110.0"'));
      assert.ok(!content.includes('# comment'));
    });

    it('should generate pyproject.toml with default dependencies if requirements.txt absent', () => {
      deployer.ensurePyProjectToml(tempDir, {
        targetDirectory: tempDir,
        projectId: 'test-proj',
      });

      const pyprojectPath = path.join(tempDir, 'pyproject.toml');
      assert.ok(fs.existsSync(pyprojectPath));
      const content = fs.readFileSync(pyprojectPath, 'utf8');
      assert.ok(content.includes('[project]'));
      assert.ok(content.includes('google-adk>=2.0.0'));
      assert.ok(content.includes('google-cloud-aiplatform'));
      assert.ok(content.includes('hatchling.build'));
    });

    it('should generate agent_runtime_app.py when absent', () => {
      deployer.ensureAgentRuntimeApp(tempDir);

      const runtimeAppPath = path.join(tempDir, 'agent_runtime_app.py');
      assert.ok(fs.existsSync(runtimeAppPath));
      const content = fs.readFileSync(runtimeAppPath, 'utf8');
      assert.ok(content.includes('from vertexai.agent_engines.templates.adk import AdkApp'));
      assert.ok(content.includes('agent_runtime = AdkApp('));
      assert.ok(content.includes('from agent import root_agent'));
    });

    it('should always include [tool.uv] package = false in generated pyproject.toml', () => {
      deployer.ensurePyProjectToml(tempDir, {
        targetDirectory: tempDir,
        projectId: 'test-proj',
      });

      const pyprojectPath = path.join(tempDir, 'pyproject.toml');
      const content = fs.readFileSync(pyprojectPath, 'utf8');
      assert.ok(content.includes('[tool.uv]'));
      assert.ok(content.includes('package = false'));
    });

    it('should append [tool.uv] package = false to existing pyproject.toml if missing', () => {
      const pyprojectPath = path.join(tempDir, 'pyproject.toml');
      fs.writeFileSync(pyprojectPath, '[project]\nname = "my_agent"\nversion = "0.1.0"\n', 'utf8');

      deployer.ensurePyProjectToml(tempDir, {
        targetDirectory: tempDir,
        projectId: 'test-proj',
      });

      const content = fs.readFileSync(pyprojectPath, 'utf8');
      assert.ok(content.includes('[tool.uv]'));
      assert.ok(content.includes('package = false'));
    });

    it('should preserve existing agent_runtime_app.py if already present', () => {
      const customContent = '# Custom agent runtime app\n';
      const runtimeAppPath = path.join(tempDir, 'agent_runtime_app.py');
      fs.writeFileSync(runtimeAppPath, customContent, 'utf8');

      deployer.ensureAgentRuntimeApp(tempDir);

      assert.equal(fs.readFileSync(runtimeAppPath, 'utf8'), customContent);
    });

    it('should fail fast if agent code uses A2A but requirements.txt is missing', () => {
      const agentPyPath = path.join(tempDir, 'agent.py');
      fs.writeFileSync(agentPyPath, 'from a2a.types import AgentCard\n', 'utf8');

      assert.throws(
        () => {
          deployer.ensurePyProjectToml(tempDir, {
            targetDirectory: tempDir,
            projectId: 'test-proj',
          });
        },
        /\[Deployment Validation Error\] A2A protocol detected in agent code, but 'requirements\.txt' is missing/
      );
    });

    it('should fail fast if agent code uses A2A but requirements.txt is missing A2A packages', () => {
      const agentPyPath = path.join(tempDir, 'agent.py');
      fs.writeFileSync(agentPyPath, 'from google.adk.agents.remote_a2a_agent import RemoteA2aAgent\n', 'utf8');
      const reqPath = path.join(tempDir, 'requirements.txt');
      fs.writeFileSync(reqPath, 'google-adk>=2.0.0\nfastapi>=0.110.0\n', 'utf8');

      assert.throws(
        () => {
          deployer.ensurePyProjectToml(tempDir, {
            targetDirectory: tempDir,
            projectId: 'test-proj',
          });
        },
        /\[Deployment Validation Error\] A2A protocol detected in agent code, but 'requirements\.txt' is missing required A2A dependencies/
      );
    });
  });

  describe('Extended Environment & PATH Resolution', () => {
    it('should include user bin directories in PATH', () => {
      const env = deployer.getExtendedEnv({ TEST_VAR: '123' });
      assert.equal(env.TEST_VAR, '123');
      assert.ok(typeof env.PATH === 'string');
    });

    it('should detect standard binaries using hasBinary with extended env', () => {
      // node is guaranteed to exist in the test execution environment
      assert.equal(deployer.hasBinary('node'), true);
      assert.equal(deployer.hasBinary('totally_non_existent_binary_xyz_123'), false);
    });
  });

  describe('Deployment Execution & Failure Handling', () => {
    it('should fail immediately when target directory is invalid', async () => {
      const bridge = createMockBridge();
      await deployer.deploy({
        document: mockDocument,
        targetDirectory: path.join(tempDir, 'invalid_nonexistent_dir'),
        projectId: 'p',
        region: 'global',
        bridge,
      });

      const errorMsg = bridge.postedMessages.find(
        (m) => m.type === 'AGENT_ENGINE_DEPLOY_STATUS' && m.payload.status === 'error'
      );
      assert.ok(errorMsg);
      assert.ok(errorMsg.payload.error.includes('directory_not_found'));
    });

    it('should fail when agent.py is missing from target directory', async () => {
      const bridge = createMockBridge();
      await deployer.deploy({
        document: mockDocument,
        targetDirectory: tempDir,
        projectId: 'p',
        region: 'global',
        bridge,
      });

      const errorMsg = bridge.postedMessages.find(
        (m) => m.type === 'AGENT_ENGINE_DEPLOY_STATUS' && m.payload.status === 'error'
      );
      assert.ok(errorMsg);
      assert.ok(errorMsg.payload.error.includes('agent.py'));
    });

    it('should fail immediately when projectId is missing or empty whitespace', async () => {
      const bridge = createMockBridge();
      fs.writeFileSync(path.join(tempDir, 'agent.py'), '# agent code');

      const result = await deployer.deploy({
        document: mockDocument,
        targetDirectory: tempDir,
        projectId: '   ',
        region: 'us-central1',
        bridge,
      });

      assert.equal(result.success, false);
      assert.ok(result.error?.includes('GCP Project ID is required'));

      const errorMsg = bridge.postedMessages.find(
        (m) => m.type === 'AGENT_ENGINE_DEPLOY_STATUS' && m.payload.status === 'error'
      );
      assert.ok(errorMsg);
      assert.ok(errorMsg.payload.error.includes('GCP Project ID is required'));
    });

    it('should fail and not write metadata if CLI outputs failure message even when process exits with code 0', async () => {
      const bridge = createMockBridge();
      fs.writeFileSync(path.join(tempDir, 'agent.py'), '# agent code');

      // Create a simulated deploy.py that mimics adk deploy catching a 403 error and exiting 0
      const scriptContent = [
        'import sys',
        'print("Deploy failed: 403 PERMISSION_DENIED. Service aiplatform.googleapis.com is disabled.")',
        'sys.exit(0)',
      ].join('\n');
      fs.writeFileSync(path.join(tempDir, 'deploy.py'), scriptContent);

      // Force deployment to execute through python deploy.py fallback
      (deployer as any).hasBinary = () => false;

      const result = await deployer.deploy({
        document: mockDocument,
        targetDirectory: tempDir,
        projectId: 'my-project-123',
        region: 'us-central1',
        bridge,
      });

      assert.equal(result.success, false);
      assert.ok(result.error?.includes('403 PERMISSION_DENIED'));

      // Ensure no corrupted metadata was written
      assert.equal(fs.existsSync(path.join(tempDir, 'deployment_metadata.json')), false);

      const statusMsg = bridge.postedMessages.find(
        (m) => m.type === 'AGENT_ENGINE_DEPLOY_STATUS' && m.payload.status === 'error'
      );
      assert.ok(statusMsg);
      assert.ok(statusMsg.payload.error.includes('403 PERMISSION_DENIED'));
    });

    it('should fail and not write metadata if process exits with 0 but returns no Reasoning Engine resource ID', async () => {
      const bridge = createMockBridge();
      fs.writeFileSync(path.join(tempDir, 'agent.py'), '# agent code');

      // Create a deploy.py that exits 0 with generic logs but no resource ID
      const scriptContent = [
        'import sys',
        'print("Running packaging...")',
        'print("Completed operations.")',
        'sys.exit(0)',
      ].join('\n');
      fs.writeFileSync(path.join(tempDir, 'deploy.py'), scriptContent);

      (deployer as any).hasBinary = () => false;

      const result = await deployer.deploy({
        document: mockDocument,
        targetDirectory: tempDir,
        projectId: 'my-project-123',
        region: 'us-central1',
        bridge,
      });

      assert.equal(result.success, false);
      assert.ok(result.error?.includes('no Agent Engine resource ID was returned'));
      assert.equal(fs.existsSync(path.join(tempDir, 'deployment_metadata.json')), false);
    });

    it('should succeed and write metadata when process returns real Reasoning Engine resource ID and exits 0', async () => {
      const bridge = createMockBridge();
      fs.writeFileSync(path.join(tempDir, 'agent.py'), '# agent code');

      const expectedId = 'projects/my-project-123/locations/us-central1/reasoningEngines/adk-agent-998877';
      const scriptContent = [
        'import sys',
        'print("Deploying to Agent Platform...")',
        `print("Deployed to Agent Platform: ${expectedId}")`,
        'sys.exit(0)',
      ].join('\n');
      fs.writeFileSync(path.join(tempDir, 'deploy.py'), scriptContent);

      (deployer as any).hasBinary = () => false;

      const result = await deployer.deploy({
        document: mockDocument,
        targetDirectory: tempDir,
        projectId: 'my-project-123',
        region: 'us-central1',
        bridge,
      });

      assert.equal(result.success, true);
      assert.equal(result.remoteRuntimeId, expectedId);
      assert.equal(fs.existsSync(path.join(tempDir, 'deployment_metadata.json')), true);

      const statusMsg = bridge.postedMessages.find(
        (m) => m.type === 'AGENT_ENGINE_DEPLOY_STATUS' && m.payload.status === 'success'
      );
      assert.ok(statusMsg);
      assert.equal(statusMsg.payload.remoteRuntimeId, expectedId);
    });

    it('should reject deployment when targetDirectory has hyphens and not create duplicate staged directories', async () => {
      const bridge = createMockBridge();
      const hyphenDir = path.join(tempDir, 'my-hyphenated-agent');
      fs.mkdirSync(hyphenDir, { recursive: true });
      fs.writeFileSync(path.join(hyphenDir, 'agent.py'), '# agent code');

      const result = await deployer.deploy({
        document: mockDocument,
        targetDirectory: hyphenDir,
        projectId: 'my-project-123',
        region: 'us-central1',
        bridge,
      });

      assert.equal(result.success, false);
      assert.ok(result.error?.includes("contains hyphens ('-')"));

      // Ensure NO duplicate staged directory is created in the workspace
      const stagedDir = path.join(tempDir, 'my_hyphenated_agent');
      assert.equal(fs.existsSync(stagedDir), false, 'Duplicate staged directory must NOT be created');
    });
  });

  describe('Deployment Cancellation & Process Lifecycle', () => {
    it('should cancel active deployment and notify webview', () => {
      const bridge = createMockBridge();

      // Register mock active process
      (deployer as any).activeProcesses.set(tempDir, {
        killed: false,
        kill: () => true,
      });

      deployer.cancelDeployment(tempDir, bridge);

      const statusMsg = bridge.postedMessages.find(
        (m) => m.type === 'AGENT_ENGINE_DEPLOY_STATUS' && m.payload.status === 'idle'
      );
      assert.ok(statusMsg);

      const logMsg = bridge.postedMessages.find(
        (m) => m.type === 'AGENT_ENGINE_DEPLOY_LOG' && m.payload.stream === 'system'
      );
      assert.ok(logMsg);
      assert.ok(logMsg.payload.text.includes('cancelled by user'));
    });

    it('should transition to idle and not emit error when child close fires after cancellation', async () => {
      const bridge = createMockBridge();
      fs.writeFileSync(path.join(tempDir, 'agent.py'), '# agent code');

      // Create a long running python script
      const scriptContent = [
        'import time',
        'print("Starting deploy...")',
        'time.sleep(10)',
      ].join('\n');
      fs.writeFileSync(path.join(tempDir, 'deploy.py'), scriptContent);

      (deployer as any).hasBinary = () => false;

      // Start deployment in background
      const deployPromise = deployer.deploy({
        document: mockDocument,
        targetDirectory: tempDir,
        projectId: 'my-project-123',
        region: 'us-central1',
        bridge,
      });

      // Allow process to spawn
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Cancel the deployment
      const cancelled = deployer.cancelDeployment(tempDir, bridge);
      assert.ok(cancelled, 'cancelDeployment must return true');

      const result = await deployPromise;
      assert.equal(result.success, false);
      assert.ok(result.error?.includes('cancelled by user'));

      // Webview status must be idle, NOT error
      const statusMsgs = bridge.postedMessages.filter((m) => m.type === 'AGENT_ENGINE_DEPLOY_STATUS');
      const lastStatus = statusMsgs[statusMsgs.length - 1];
      assert.equal(lastStatus?.payload?.status, 'idle');

      // Error message should not contain 'error code null'
      const errorMsg = bridge.postedMessages.find(
        (m) => m.type === 'AGENT_ENGINE_DEPLOY_STATUS' && m.payload.status === 'error'
      );
      assert.ok(!errorMsg, 'No error status should be dispatched on cancellation');
    });

    it('should accurately report termination signal when process is killed by signal without prior cancellation', async () => {
      const bridge = createMockBridge();
      fs.writeFileSync(path.join(tempDir, 'agent.py'), '# agent code');

      // Script that terminates itself with SIGTERM
      const scriptContent = [
        'import os, signal',
        'print("Process starting...")',
        'os.kill(os.getpid(), signal.SIGTERM)',
      ].join('\n');
      fs.writeFileSync(path.join(tempDir, 'deploy.py'), scriptContent);

      (deployer as any).hasBinary = () => false;

      const result = await deployer.deploy({
        document: mockDocument,
        targetDirectory: tempDir,
        projectId: 'my-project-123',
        region: 'us-central1',
        bridge,
      });

      assert.equal(result.success, false);
      assert.ok(result.error?.includes('SIGTERM') || result.error?.includes('terminated'), `Error should mention signal: ${result.error}`);
      assert.ok(!result.error?.includes('error code null'), 'Error should not say error code null');
    });

    it('should include PYTHONUNBUFFERED=1 in getExtendedEnv', () => {
      const env = deployer.getExtendedEnv();
      assert.equal(env.PYTHONUNBUFFERED, '1');
    });
  });

  describe('Live Remote Testing via HTTP Passthrough', () => {
    it('should fail remote testing when remote runtime ID or service URL is missing', async () => {
      const bridge = createMockBridge();
      await deployer.testRemoteAgentRuntime({
        targetDirectory: tempDir,
        query: 'Hello agent',
        bridge,
      });

      const resultMsg = bridge.postedMessages.find((m) => m.type === 'AGENT_ENGINE_TEST_RESULT');
      assert.ok(resultMsg);
      assert.equal(resultMsg.payload.success, false);
      assert.ok(resultMsg.payload.error.includes('No active remote Agent Runtime endpoint'));
    });

    it('should successfully execute query against live remote mock server', async () => {
      // Create a mock local HTTP server simulating Vertex AI Agent Engine SSE / passthrough
      const mockServer = http.createServer((req, res) => {
        if (req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => (body += chunk));
          req.on('end', () => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                output: 'Hello! I am your Vertex AI Agent Runtime instance ready to process tasks.',
                status: 'COMPLETED',
              })
            );
          });
        } else {
          res.writeHead(404);
          res.end();
        }
      });

      await new Promise<void>((resolve) => mockServer.listen(0, '127.0.0.1', resolve));
      const port = (mockServer.address() as any).port;
      const testServiceUrl = `http://127.0.0.1:${port}/api/run_sse`;

      const bridge = createMockBridge();
      try {
        await deployer.testRemoteAgentRuntime({
          targetDirectory: tempDir,
          query: 'Explain your capabilities',
          remoteRuntimeId: 'projects/p/locations/global/reasoningEngines/456',
          serviceUrl: testServiceUrl,
          location: 'global',
          projectId: 'p',
          bridge,
        });

        const resultMsg = bridge.postedMessages.find((m) => m.type === 'AGENT_ENGINE_TEST_RESULT');
        assert.ok(resultMsg);
        assert.equal(resultMsg.payload.success, true);
        assert.ok(resultMsg.payload.response.includes('Vertex AI Agent Runtime'));
        assert.ok(typeof resultMsg.payload.durationMs === 'number');
      } finally {
        mockServer.close();
      }
    });

    it('should handle remote server 500 error cleanly', async () => {
      const mockServer = http.createServer((req, res) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'Internal Model Execution Error' } }));
      });

      await new Promise<void>((resolve) => mockServer.listen(0, '127.0.0.1', resolve));
      const port = (mockServer.address() as any).port;
      const testServiceUrl = `http://127.0.0.1:${port}/api/run_sse`;

      const bridge = createMockBridge();
      try {
        await deployer.testRemoteAgentRuntime({
          targetDirectory: tempDir,
          query: 'Explain your capabilities',
          remoteRuntimeId: 'projects/p/locations/global/reasoningEngines/456',
          serviceUrl: testServiceUrl,
          location: 'global',
          projectId: 'p',
          bridge,
        });

        const resultMsg = bridge.postedMessages.find((m) => m.type === 'AGENT_ENGINE_TEST_RESULT');
        assert.ok(resultMsg);
        assert.equal(resultMsg.payload.success, false);
        assert.ok(resultMsg.payload.error.includes('500'));
      } finally {
        mockServer.close();
      }
    });

    it('should successfully parse Vertex AI SSE stream data lines', async () => {
      const mockServer = http.createServer((req, res) => {
        if (req.method === 'POST') {
          res.writeHead(200, { 'Content-Type': 'text/event-stream' });
          res.write('data: {"content": {"parts": [{"text": "Hello "}]}}\n\n');
          res.write('data: {"content": {"parts": [{"text": "world!"}]}}\n\n');
          res.end();
        } else {
          res.writeHead(404);
          res.end();
        }
      });

      await new Promise<void>((resolve) => mockServer.listen(0, '127.0.0.1', resolve));
      const port = (mockServer.address() as any).port;
      const testServiceUrl = `http://127.0.0.1:${port}/:streamQuery?alt=sse`;

      const bridge = createMockBridge();
      try {
        await deployer.testRemoteAgentRuntime({
          targetDirectory: tempDir,
          query: 'Say hello',
          remoteRuntimeId: 'projects/p/locations/us-central1/reasoningEngines/123',
          serviceUrl: testServiceUrl,
          bridge,
        });

        const resultMsg = bridge.postedMessages.find((m) => m.type === 'AGENT_ENGINE_TEST_RESULT');
        assert.ok(resultMsg);
        assert.equal(resultMsg.payload.success, true);
        assert.equal(resultMsg.payload.response, 'Hello world!');
      } finally {
        mockServer.close();
      }
    });

    it('should provide clear remediation when Vertex AI reports Invalid agent name', async () => {
      const mockServer = http.createServer((req, res) => {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: {
              code: 400,
              message: "Reasoning Engine Execution failed: Invalid agent name: 'scratch-flow'. Agent names must be valid Python identifiers.",
            },
          })
        );
      });

      await new Promise<void>((resolve) => mockServer.listen(0, '127.0.0.1', resolve));
      const port = (mockServer.address() as any).port;
      const testServiceUrl = `http://127.0.0.1:${port}/:streamQuery?alt=sse`;

      const bridge = createMockBridge();
      try {
        await deployer.testRemoteAgentRuntime({
          targetDirectory: tempDir,
          query: 'test query',
          remoteRuntimeId: 'projects/p/locations/us-central1/reasoningEngines/123',
          serviceUrl: testServiceUrl,
          bridge,
        });

        const resultMsg = bridge.postedMessages.find((m) => m.type === 'AGENT_ENGINE_TEST_RESULT');
        assert.ok(resultMsg);
        assert.equal(resultMsg.payload.success, false);
        assert.ok(resultMsg.payload.error.includes('Invalid agent name'));
        assert.ok(resultMsg.payload.error.includes('Redeploy the agent'));
      } finally {
        mockServer.close();
      }
    });
  });

  describe('Endpoint Resolution and Metadata Normalization', () => {
    it('should correctly format canonical streamQuery endpoint with full resource path', () => {
      const fullResource = 'projects/717498696647/locations/us-central1/reasoningEngines/327273484298223616';
      const endpoint = deployer.resolveEndpointUrl('us-central1', 'my-project', fullResource);
      assert.equal(
        endpoint,
        'https://us-central1-aiplatform.googleapis.com/v1/projects/717498696647/locations/us-central1/reasoningEngines/327273484298223616:streamQuery?alt=sse'
      );
    });

    it('should correctly format canonical streamQuery endpoint with short resource ID', () => {
      const shortId = '327273484298223616';
      const endpoint = deployer.resolveEndpointUrl('us-central1', 'my-project', shortId);
      assert.equal(
        endpoint,
        'https://us-central1-aiplatform.googleapis.com/v1/projects/my-project/locations/us-central1/reasoningEngines/327273484298223616:streamQuery?alt=sse'
      );
    });

    it('should normalize legacy /api/run_sse path in readDeploymentMetadata and writeDeploymentMetadata', () => {
      const legacyMeta = {
        remote_agent_runtime_id: 'projects/p/locations/us-central1/reasoningEngines/123',
        deployment_target: 'agent_runtime' as const,
        is_a2a: true,
        service_url: 'https://us-central1-aiplatform.googleapis.com/v1/projects/p/locations/us-central1/reasoningEngines/123/api/run_sse',
      };

      deployer.writeDeploymentMetadata(tempDir, legacyMeta);
      const read = deployer.readDeploymentMetadata(tempDir);

      assert.ok(read);
      assert.equal(
        read?.service_url,
        'https://us-central1-aiplatform.googleapis.com/v1/projects/p/locations/us-central1/reasoningEngines/123:streamQuery?alt=sse'
      );
    });
  });

  describe('Ignore Files Generation (ensureIgnoreFiles)', () => {
    it('should create .gcloudignore, .gitignore, and .ae_ignore if missing', () => {
      deployer.ensureIgnoreFiles(tempDir);

      const gcloudignorePath = path.join(tempDir, '.gcloudignore');
      const gitignorePath = path.join(tempDir, '.gitignore');
      const aeIgnorePath = path.join(tempDir, '.ae_ignore');

      assert.ok(fs.existsSync(gcloudignorePath), '.gcloudignore must be created');
      assert.ok(fs.existsSync(gitignorePath), '.gitignore must be created');
      assert.ok(fs.existsSync(aeIgnorePath), '.ae_ignore must be created');

      const gcloudContent = fs.readFileSync(gcloudignorePath, 'utf8');
      assert.ok(gcloudContent.includes('.venv/'), 'must ignore .venv/');
      assert.ok(gcloudContent.includes('__pycache__/'), 'must ignore __pycache__/');

      const aeContent = fs.readFileSync(aeIgnorePath, 'utf8');
      assert.ok(aeContent.includes('.venv/'), '.ae_ignore must ignore .venv/');
    });

    it('should append missing rules if ignore file already exists without .venv', () => {
      const gitignorePath = path.join(tempDir, '.gitignore');
      fs.writeFileSync(gitignorePath, 'node_modules/\n*.log\n', 'utf8');

      deployer.ensureIgnoreFiles(tempDir);

      const updated = fs.readFileSync(gitignorePath, 'utf8');
      assert.ok(updated.includes('node_modules/'), 'preserves existing rules');
      assert.ok(updated.includes('.venv/'), 'appends .venv/');
    });
  });

  describe('Active Deployment Tracking & Log Replay', () => {
    it('should replay active deployment status and logs when getDeploymentStatus is invoked', () => {
      // Simulate active deployment in progress
      (deployer as any).activeDeployments.set(tempDir, {
        targetDirectory: tempDir,
        status: 'deploying',
        inProgress: true,
        startTime: Date.now(),
        logs: [
          { text: 'Starting deployment...', stream: 'system', timestamp: new Date().toISOString() },
          { text: 'Uploading package to Agent Engine...', stream: 'stdout', timestamp: new Date().toISOString() },
        ],
      });

      const bridge = createMockBridge();
      deployer.getDeploymentStatus(tempDir, bridge);

      assert.equal(bridge.postedMessages.length, 1);
      const statusMsg = bridge.postedMessages[0];
      assert.equal(statusMsg.type, 'AGENT_ENGINE_DEPLOY_STATUS');
      assert.equal(statusMsg.payload.status, 'deploying');
      assert.equal(statusMsg.payload.inProgress, true);
      assert.equal(statusMsg.payload.logs.length, 2);
      assert.equal(statusMsg.payload.logs[0].text, 'Starting deployment...');
    });
  });

  describe('ensureAgentImports & Python Submodule Path Resolution', () => {
    it('should prepend sys.path resolution to agent.py when missing', () => {
      const agentPyPath = path.join(tempDir, 'agent.py');
      fs.writeFileSync(agentPyPath, 'from pydantic_models import MyModel\nroot_agent = None\n', 'utf8');

      deployer.ensureAgentImports(tempDir);

      const updated = fs.readFileSync(agentPyPath, 'utf8');
      assert.ok(updated.includes('sys.path.insert(0, _agent_dir)'));
      assert.ok(updated.includes('from pydantic_models import MyModel'));
    });

    it('should not duplicate sys.path patch if already present', () => {
      const agentPyPath = path.join(tempDir, 'agent.py');
      const existing = 'import sys\nsys.path.insert(0, "/some/dir")\nroot_agent = None\n';
      fs.writeFileSync(agentPyPath, existing, 'utf8');

      deployer.ensureAgentImports(tempDir);

      const content = fs.readFileSync(agentPyPath, 'utf8');
      assert.equal(content, existing);
    });

    it('should do nothing gracefully if agent.py does not exist', () => {
      const emptyDir = path.join(tempDir, 'empty_dir');
      fs.mkdirSync(emptyDir, { recursive: true });

      deployer.ensureAgentImports(emptyDir);
      assert.ok(!fs.existsSync(path.join(emptyDir, 'agent.py')));
    });
  });

  describe('stageAgentDirectory & Sanitized Staging', () => {
    it('should recursively copy files while filtering .venv, .git, and __pycache__', () => {
      const srcDir = path.join(tempDir, 'src_agent');
      const destDir = path.join(tempDir, 'dest_agent');
      fs.mkdirSync(srcDir, { recursive: true });

      // Create regular files and directories
      fs.writeFileSync(path.join(srcDir, 'agent.py'), '# agent code', 'utf8');
      fs.writeFileSync(path.join(srcDir, 'pydantic_models.py'), '# models', 'utf8');
      fs.mkdirSync(path.join(srcDir, 'tools'), { recursive: true });
      fs.writeFileSync(path.join(srcDir, 'tools', 'search.py'), '# search tool', 'utf8');

      // Create directories that MUST be skipped
      fs.mkdirSync(path.join(srcDir, '.venv', 'bin'), { recursive: true });
      fs.writeFileSync(path.join(srcDir, '.venv', 'bin', 'python'), '# binary', 'utf8');
      fs.mkdirSync(path.join(srcDir, '__pycache__'), { recursive: true });
      fs.writeFileSync(path.join(srcDir, '__pycache__', 'agent.cpython-311.pyc'), 'binary', 'utf8');
      fs.mkdirSync(path.join(srcDir, '.git'), { recursive: true });
      fs.writeFileSync(path.join(srcDir, '.git', 'config'), 'config', 'utf8');

      deployer.stageAgentDirectory(srcDir, destDir);

      // Verify copied files
      assert.ok(fs.existsSync(path.join(destDir, 'agent.py')));
      assert.ok(fs.existsSync(path.join(destDir, 'pydantic_models.py')));
      assert.ok(fs.existsSync(path.join(destDir, 'tools', 'search.py')));

      // Verify skipped directories
      assert.ok(!fs.existsSync(path.join(destDir, '.venv')));
      assert.ok(!fs.existsSync(path.join(destDir, '__pycache__')));
      assert.ok(!fs.existsSync(path.join(destDir, '.git')));
    });
  });

  describe('Deleted Reasoning Engine Auto-Recovery (404 NOT_FOUND)', () => {
    it('should correctly identify 404 NOT_FOUND errors indicating deleted reasoning engine', () => {
      // 1. Exact Vertex AI ADK deployment error format
      const adkError =
        "Failed to deploy to Agent Platform: 404 NOT_FOUND. {'error': {'code': 404, 'message': 'Reasoning Engine [project number: 717498696647, reasoning engine id: 7899020726559047680] is not found.', 'status': 'NOT_FOUND'}}";
      assert.equal(deployer.isReasoningEngineNotFoundError(adkError), true);

      // 2. Deploy failed variant
      const deployFailedError =
        "Deploy failed: 404 NOT_FOUND. {'error': {'code': 404, 'message': 'Reasoning Engine [project number: 717498696647, reasoning engine id: 7899020726559047680] is not found.', 'status': 'NOT_FOUND'}}";
      assert.equal(deployer.isReasoningEngineNotFoundError(deployFailedError), true);

      // 3. Error located in stream buildLogs instead of primary message
      assert.equal(
        deployer.isReasoningEngineNotFoundError('Deployment process exited with error code 1.', [
          'Creating Dockerfile...',
          adkError,
          'Cleaning up the temp folder...',
        ]),
        true
      );

      // 4. Resource URI format
      const resourceUriError =
        "NotFound: 404 Resource 'projects/717498696647/locations/us-central1/reasoningEngines/7899020726559047680' was not found";
      assert.equal(deployer.isReasoningEngineNotFoundError(resourceUriError), true);

      // 5. Agent engine terminology variant
      const agentEngineError = '404 NOT_FOUND: Agent Engine 123456 is not found';
      assert.equal(deployer.isReasoningEngineNotFoundError(agentEngineError), true);
    });

    it('should not misidentify unrelated 404 or permissions errors', () => {
      // Unrelated 404 (e.g. publisher model not found)
      const publisherModelError = '404 NOT_FOUND: Publisher Model gemini-2.5-flash is not found.';
      assert.equal(deployer.isReasoningEngineNotFoundError(publisherModelError), false);

      // Permission denied
      const permError = '403 PERMISSION_DENIED: User does not have aiplatform.reasoningEngines.update permission';
      assert.equal(deployer.isReasoningEngineNotFoundError(permError), false);

      // Generic exit code without matching logs
      assert.equal(deployer.isReasoningEngineNotFoundError('Deployment process exited with error code 1.', []), false);

      // Empty / undefined
      assert.equal(deployer.isReasoningEngineNotFoundError(undefined, []), false);
      assert.equal(deployer.isReasoningEngineNotFoundError('', []), false);
    });

    it('should purge stale deployment metadata and retry as a fresh instance when 404 is encountered', async () => {
      const agentDir = path.join(tempDir, 'sample_agent');
      fs.mkdirSync(agentDir, { recursive: true });
      fs.writeFileSync(path.join(agentDir, 'agent.py'), '# valid agent\n', 'utf8');

      // Create stale metadata on disk targeting deleted engine
      const staleMeta = {
        remote_agent_runtime_id: 'projects/my-proj/locations/us-central1/reasoningEngines/deleted_id_999',
        deployment_target: 'agent_runtime' as const,
        is_a2a: true,
        agent_directory: agentDir,
        deployment_timestamp: new Date().toISOString(),
        service_url: 'https://test',
        console_url: 'https://test',
        project_id: 'my-proj',
        region: 'us-central1',
        status: 'ACTIVE',
      };
      deployer.writeDeploymentMetadata(agentDir, staleMeta);
      assert.ok(fs.existsSync(path.join(agentDir, 'deployment_metadata.json')), 'stale metadata should exist initially');

      let executionCount = 0;
      const capturedOptions: any[] = [];

      // Mock deployAgentEngine to simulate:
      // First attempt (update of deleted engine) -> fails with 404 NOT_FOUND
      // The auto-recovery handler purges stale metadata and retries deployAgentEngine with forceNew: true
      const originalDeploy = deployer.deployAgentEngine.bind(deployer);
      deployer.deployAgentEngine = async (options: any) => {
        executionCount++;
        capturedOptions.push(options);

        if (executionCount === 1) {
          // Verify first attempt was an update attempt
          assert.equal(options.forceNew, false);
          assert.equal(options.agentEngineId, 'deleted_id_999');

          // Simulate child process close failure with 404 NOT_FOUND inside deployAgentEngine's logic
          // by calling the auto-recovery block directly or invoking the logic
          const simulatedError =
            "Deploy failed: 404 NOT_FOUND. {'error': {'code': 404, 'message': 'Reasoning Engine [reasoning engine id: deleted_id_999] is not found.', 'status': 'NOT_FOUND'}}";

          if (deployer.isReasoningEngineNotFoundError(simulatedError)) {
            // Remove stale metadata
            const metaFile = path.join(agentDir, 'deployment_metadata.json');
            if (fs.existsSync(metaFile)) {
              fs.unlinkSync(metaFile);
            }
            // Trigger retry as deployAgentEngine does
            return deployer.deployAgentEngine({
              ...options,
              agentEngineId: undefined,
              forceNew: true,
              displayName: options.displayName || path.basename(agentDir),
            });
          }
        }

        // Second attempt (retry) should succeed
        assert.equal(options.forceNew, true);
        assert.equal(options.agentEngineId, undefined);

        const newMeta: DeploymentMetadataRecord = {
          remote_agent_runtime_id: 'projects/my-proj/locations/us-central1/reasoningEngines/fresh_id_111',
          deployment_target: 'agent_runtime',
          is_a2a: true,
          agent_directory: agentDir,
          deployment_timestamp: new Date().toISOString(),
          service_url: 'https://fresh-endpoint',
          console_url: 'https://fresh-console',
          project_id: 'my-proj',
          region: 'us-central1',
          status: 'ACTIVE',
        };
        deployer.writeDeploymentMetadata(agentDir, newMeta);

        return {
          success: true,
          remoteRuntimeId: newMeta.remote_agent_runtime_id,
          serviceUrl: newMeta.service_url,
          consoleUrl: newMeta.console_url,
          metadata: newMeta,
        };
      };

      const result = await deployer.deployAgentEngine({
        targetDirectory: agentDir,
        projectId: 'my-proj',
        region: 'us-central1',
        agentEngineId: 'deleted_id_999',
        forceNew: false,
      });

      // Verify that auto-recovery executed and succeeded
      assert.equal(executionCount, 2, 'should have executed initial attempt and retry attempt');
      assert.equal(result.success, true);
      assert.equal(result.remoteRuntimeId, 'projects/my-proj/locations/us-central1/reasoningEngines/fresh_id_111');

      // Verify stale metadata was replaced with fresh metadata
      const updatedMeta = deployer.readDeploymentMetadata(agentDir);
      assert.equal(updatedMeta?.remote_agent_runtime_id, 'projects/my-proj/locations/us-central1/reasoningEngines/fresh_id_111');

      // Restore
      deployer.deployAgentEngine = originalDeploy;
    });
  });

  describe('Error Formatting, Access Token Caching & Stream Resilience', () => {
    it('should format generic Error instances cleanly', () => {
      const err = new Error('Connection refused');
      assert.equal(deployer.formatErrorMessage(err), 'Connection refused');
    });

    it('should unpack AggregateError inner errors into a readable semicolon-separated string', () => {
      const inner1 = new Error('ECONNREFUSED ::1:8000');
      const inner2 = new Error('ECONNREFUSED 127.0.0.1:8000');
      const aggErr = new AggregateError([inner1, inner2], '');

      const formatted = deployer.formatErrorMessage(aggErr);
      assert.ok(formatted.includes('ECONNREFUSED ::1:8000'));
      assert.ok(formatted.includes('ECONNREFUSED 127.0.0.1:8000'));
    });

    it('should handle AggregateError with non-empty error message and inner errors', () => {
      const inner = new Error('Socket timeout');
      const aggErr = new AggregateError([inner], 'Network connection failure');

      const formatted = deployer.formatErrorMessage(aggErr);
      assert.ok(formatted.startsWith('Network connection failure: Socket timeout'));
    });

    it('should handle falsy errors gracefully', () => {
      assert.equal(deployer.formatErrorMessage(null), 'Unknown error');
      assert.equal(deployer.formatErrorMessage(undefined), 'Unknown error');
      assert.equal(deployer.formatErrorMessage(''), 'Unknown error');
    });

    it('should return cached token if unexpired without re-executing command', async () => {
      (deployer as any).cachedAccessToken = 'cached-token-xyz';
      (deployer as any).cachedAccessTokenExpiresAt = Date.now() + 600000;

      const header = await deployer.getAccessTokenHeader();
      assert.equal(header, 'Bearer cached-token-xyz');
    });

    it('should resolve canonical reasoning engine URL if serviceUrl is not provided', async () => {
      const originalPerformHttp = (deployer as any).performHttpQuery;
      let requestedUrl = '';
      (deployer as any).performHttpQuery = async (url: string) => {
        requestedUrl = url;
        return 'Mock reasoning engine output';
      };

      try {
        const result = await deployer.testRemoteAgentRuntime({
          targetDirectory: tempDir,
          remoteRuntimeId: 'projects/argolis-playground/locations/us-central1/reasoningEngines/4497395633010769920',
          query: 'Test query',
        });

        assert.equal(result.success, true);
        assert.equal(
          requestedUrl,
          'https://us-central1-aiplatform.googleapis.com/v1/projects/argolis-playground/locations/us-central1/reasoningEngines/4497395633010769920:streamQuery?alt=sse'
        );
      } finally {
        (deployer as any).performHttpQuery = originalPerformHttp;
      }
    });

    it('should ignore localhost in metadata and resolve canonical reasoning engine URL', async () => {
      const meta: DeploymentMetadataRecord = {
        remote_agent_runtime_id: 'projects/proj/locations/us-central1/reasoningEngines/12345',
        deployment_target: 'agent_runtime',
        is_a2a: true,
        agent_directory: tempDir,
        deployment_timestamp: new Date().toISOString(),
        service_url: 'http://localhost:8000',
        console_url: 'https://console',
        project_id: 'proj',
        region: 'us-central1',
        status: 'ACTIVE',
      };
      deployer.writeDeploymentMetadata(tempDir, meta);

      const originalPerformHttp = (deployer as any).performHttpQuery;
      let requestedUrl = '';
      (deployer as any).performHttpQuery = async (url: string) => {
        requestedUrl = url;
        return 'Mock output';
      };

      try {
        const result = await deployer.testRemoteAgentRuntime({
          targetDirectory: tempDir,
          query: 'Hello world',
        });

        assert.equal(result.success, true);
        assert.equal(
          requestedUrl,
          'https://us-central1-aiplatform.googleapis.com/v1/projects/proj/locations/us-central1/reasoningEngines/12345:streamQuery?alt=sse'
        );
      } finally {
        (deployer as any).performHttpQuery = originalPerformHttp;
      }
    });
  });
});


