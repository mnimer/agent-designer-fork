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
import { readCodegenSkills } from '../helpers/codegenSkillsCorpus';

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

    it('should reject Makefile deploy target if it uses relative --agent_engine_config_file=.agent_engine_config.json that looks in parent folder', () => {
      fs.writeFileSync(
        path.join(tempDir, 'Makefile'),
        [
          'deploy:',
          '\t.venv/bin/adk deploy agent_engine --project=$(PROJECT_ID) --agent_engine_config_file=.agent_engine_config.json .',
        ].join('\n'),
        'utf8'
      );

      // Should return false so DeployPipeline falls back to direct `adk deploy agent_engine`
      assert.equal(runner.hasMakefileTarget(tempDir, 'deploy'), false);

      // Should return true when using $(CURDIR)/.agent_engine_config.json or omitting relative flag
      fs.writeFileSync(
        path.join(tempDir, 'Makefile'),
        [
          'deploy:',
          '\t.venv/bin/adk deploy agent_engine --project=$(PROJECT_ID) --agent_engine_config_file="$(CURDIR)/.agent_engine_config.json" .',
        ].join('\n'),
        'utf8'
      );
      assert.equal(runner.hasMakefileTarget(tempDir, 'deploy'), true);
    });

    it('should ensure the agent-engine codegen skills do not use relative --agent_engine_config_file=.agent_engine_config.json', () => {
      const promptContent = readCodegenSkills('agent-engine');
      assert.equal(
        promptContent.includes('--agent_engine_config_file=.agent_engine_config.json'),
        false,
        'Prompt must not use relative --agent_engine_config_file=.agent_engine_config.json because adk deploy chdirs to parent directory'
      );
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

  describe('Enterprise Agent Governance (TASK-217) & Gemini Enterprise Publishing (TASK-218)', () => {
    it('should always register agent in Agent Registry and apply Security Policies, and default to shared regional gateway + enterprise-baseline Model Armor', async () => {
      const logs: string[] = [];
      const res = await runner.runPostDeployGovernance({
        targetDirectory: tempDir,
        projectId: 'my-ent-project',
        region: 'us-central1',
        agentId: 'Travel Concierge Agent',
        displayName: 'Travel Concierge Agent',
        deployedResourceUri: 'projects/my-ent-project/locations/us-central1/reasoningEngines/998877',
        serviceUrl: 'https://us-central1-aiplatform.googleapis.com/v1/projects/my-ent-project/locations/us-central1/reasoningEngines/998877',
        onLog: (msg) => logs.push(msg),
      });

      assert.equal(
        res.agentRegistryResource,
        'projects/my-ent-project/locations/us-central1/agents/travel-concierge-agent'
      );
      assert.equal(
        res.securityPolicyResource,
        'projects/my-ent-project/locations/us-central1/authzPolicies/travel-concierge-agent-least-privilege'
      );
      assert.equal(
        res.agentGatewayResource,
        'projects/my-ent-project/locations/us-central1/agentGateways/default-shared-agent-gateway'
      );
      assert.equal(res.modelArmorTemplateId, 'enterprise-baseline');
      assert.equal(res.evalGateStatus, 'skipped');
      assert.equal(res.geminiEnterpriseAgentUri, undefined);
    });

    it('should mark deployment as Succeeded with Evaluation Warnings AND block Gemini Enterprise publishing when post-deploy Cloud Evaluation fails', async () => {
      const logs: string[] = [];
      const res = await runner.runPostDeployGovernance({
        targetDirectory: tempDir,
        projectId: 'my-ent-project',
        region: 'us-central1',
        agentId: 'travel_concierge_agent',
        deployedResourceUri: 'projects/my-ent-project/locations/us-central1/reasoningEngines/998877',
        serviceUrl: 'https://us-central1-aiplatform.googleapis.com/v1/projects/my-ent-project/locations/us-central1/reasoningEngines/998877',
        governance: {
          enableAgentGateway: true,
          modelArmorTemplateId: 'strict-pci-hipaa',
          runCloudEvaluation: true,
          publishToGeminiEnterprise: true,
          geminiEnterpriseAppId: 'default-enterprise-workspace',
          geminiEnterpriseLocation: 'global',
        },
        customEvalExecutor: async () => ({
          passed: false,
          warnings: ['Scenario "Refund Policy Check" groundedness score 0.42 < 0.80 threshold'],
          experimentUrl: 'https://console.cloud.google.com/vertex-ai/experiments/eval-run-123',
        }),
        onLog: (msg) => logs.push(msg),
      });

      // Verify both: deploy marked with evaluation warnings AND Gemini Enterprise publish blocked
      assert.equal(res.evalGateStatus, 'warning');
      assert.deepEqual(res.evalWarnings, [
        'Scenario "Refund Policy Check" groundedness score 0.42 < 0.80 threshold',
      ]);
      assert.equal(
        res.evalTaskExperimentUrl,
        'https://console.cloud.google.com/vertex-ai/experiments/eval-run-123'
      );
      assert.equal(res.geminiEnterpriseBlockedByEval, true);
      assert.equal(res.geminiEnterpriseAgentUri, undefined);
      assert.equal(res.geminiEnterpriseConsoleUrl, undefined);
      assert.ok(logs.some((l) => l.includes('Succeeded with Evaluation Warnings')));
      assert.ok(logs.some((l) => l.includes('Blocking automatic publish to Gemini Enterprise App')));
    });

    it('should publish to Gemini Enterprise App with shared regional Agent Gateway binding when Cloud Evaluation passes (or is skipped)', async () => {
      const res = await runner.runPostDeployGovernance({
        targetDirectory: tempDir,
        projectId: 'my-ent-project',
        region: 'us-central1',
        agentId: 'travel_concierge_agent',
        deployedResourceUri: 'projects/my-ent-project/locations/us-central1/reasoningEngines/998877',
        serviceUrl: 'https://us-central1-aiplatform.googleapis.com/v1/projects/my-ent-project/locations/us-central1/reasoningEngines/998877',
        governance: {
          enableAgentGateway: true,
          modelArmorTemplateId: 'enterprise-baseline',
          runCloudEvaluation: true,
          publishToGeminiEnterprise: true,
          geminiEnterpriseAppId: 'customer-support-agent-hub',
          geminiEnterpriseLocation: 'global',
        },
        customEvalExecutor: async () => ({
          passed: true,
          experimentUrl: 'https://console.cloud.google.com/vertex-ai/experiments/eval-run-456',
        }),
      });

      assert.equal(res.evalGateStatus, 'passed');
      assert.equal(res.geminiEnterpriseBlockedByEval, undefined);
      assert.equal(
        res.geminiEnterpriseAgentUri,
        'projects/my-ent-project/locations/global/collections/default_collection/engines/customer-support-agent-hub/assistants/default_assistant/agents/travel_concierge_agent'
      );
      assert.ok(res.geminiEnterpriseConsoleUrl?.includes('customer-support-agent-hub'));
    });

    it('should execute OnePlatform REST API calls to provision Agent Security Policies (IAP + IAM v3 UAP), Model Armor template, and Shared Regional Agent Gateway + AuthzPolicies', async () => {
      const capturedRequests: Array<{ method: string; url: string; body?: any }> = [];

      const res = await runner.runPostDeployGovernance({
        target: 'agent_engine',
        targetDirectory: tempDir,
        projectId: 'my-ent-project',
        region: 'us-central1',
        agentId: 'travel_concierge_agent',
        displayName: 'Travel Concierge Agent',
        deployedResourceUri: 'projects/my-ent-project/locations/us-central1/reasoningEngines/998877',
        serviceUrl: 'https://us-central1-aiplatform.googleapis.com/v1/projects/my-ent-project/locations/us-central1/reasoningEngines/998877',
        governance: {
          enableAgentGateway: true,
          modelArmorTemplateId: 'enterprise-baseline',
          sharedGatewayId: 'default-shared-agent-gateway',
          runCloudEvaluation: false,
          publishToGeminiEnterprise: true,
          geminiEnterpriseAppId: 'enterprise-chat-app',
          geminiEnterpriseLocation: 'global',
        },
        customHttpRequester: async (req) => {
          capturedRequests.push({ method: req.method, url: req.url, body: req.body });

          // 1. Agent Registry list
          if (req.method === 'GET' && req.url.includes('agentregistry.googleapis.com/v1alpha/')) {
            return {
              statusCode: 200,
              data: {
                agents: [
                  {
                    name: 'projects/my-ent-project/locations/us-central1/agents/agentregistry-998877',
                    displayName: 'Travel Concierge Agent',
                    attributes: {
                      'agentregistry.googleapis.com/system/RuntimeIdentity': {
                        principal: 'principal://agents.global.org-123.system.id.goog/resources/aiplatform/projects/111/locations/us-central1/reasoningEngines/998877',
                      },
                    },
                  },
                ],
              },
              rawBody: '',
            };
          }

          // 2. IAP getIamPolicy / setIamPolicy
          if (req.url.includes('iap.googleapis.com/v1/')) {
            return {
              statusCode: 200,
              data: { bindings: [], etag: 'BwX123' },
              rawBody: '',
            };
          }

          // 3. GET checks for UAP accessPolicies, policyBindings, Model Armor template, AgentGateway, AuthzExtensions, AuthzPolicies -> return 404 to trigger creation
          if (req.method === 'GET') {
            return {
              statusCode: 404,
              data: { error: { code: 404, message: 'Not found' } },
              rawBody: '',
            };
          }

          // 4. POST creations -> return 200 done: true
          return {
            statusCode: 200,
            data: { done: true, name: req.url },
            rawBody: '',
          };
        },
      });

      // Verify discovered Agent Registry resource ID is returned
      assert.equal(
        res.agentRegistryResource,
        'projects/my-ent-project/locations/us-central1/agents/agentregistry-998877'
      );

      // Verify IAP Allow Policy was set with roles/iap.egressor and RuntimeIdentity principal
      const iapSetCall = capturedRequests.find(
        (r) => r.method === 'POST' && r.url.includes('iap_web/agentRegistry:setIamPolicy')
      );
      assert.ok(iapSetCall, 'Expected IAP setIamPolicy call for /agent-platform/policies');
      assert.equal(iapSetCall.body.policy.bindings[0].role, 'roles/iap.egressor');
      assert.ok(
        iapSetCall.body.policy.bindings[0].members[0].includes('reasoningEngines/998877')
      );

      // Verify IAM v3 Unified Access Policy + PolicyBinding were created
      const uapCreateCall = capturedRequests.find(
        (r) => r.method === 'POST' && r.url.includes('iam.googleapis.com/v3/') && r.url.includes('/accessPolicies?accessPolicyId=')
      );
      assert.ok(uapCreateCall, 'Expected IAM v3 AccessPolicy creation call');
      assert.deepEqual(
        uapCreateCall.body.details.rules[0].operation.permissions,
        ['iap.googleapis.com/resources.egressViaIAP']
      );

      const uapBindCall = capturedRequests.find(
        (r) => r.method === 'POST' && r.url.includes('iam.googleapis.com/v3/') && r.url.includes('/policyBindings?policyBindingId=')
      );
      assert.ok(uapBindCall, 'Expected IAM v3 PolicyBinding creation call');

      // Verify Model Armor Template was created
      const modelArmorCreateCall = capturedRequests.find(
        (r) => r.method === 'POST' && r.url.includes('modelarmor.us-central1.rep.googleapis.com/v1/') && r.url.includes('templateId=enterprise-baseline')
      );
      assert.ok(modelArmorCreateCall, 'Expected Model Armor template creation call');

      // Verify Shared Regional Agent Gateway was created in networkservices.googleapis.com/v1alpha1
      const gatewayCreateCall = capturedRequests.find(
        (r) => r.method === 'POST' && r.url.includes('networkservices.googleapis.com/v1alpha1/') && r.url.includes('agentGatewayId=default-shared-agent-gateway')
      );
      assert.ok(gatewayCreateCall, 'Expected Agent Gateway creation call for /agent-platform/gateways');
      assert.deepEqual(gatewayCreateCall.body.registries, [
        '//agentregistry.googleapis.com/projects/my-ent-project/locations/us-central1',
      ]);

      // Verify both IAP (REQUEST_AUTHZ) and AI Security Model Armor (CONTENT_AUTHZ) AuthzPolicies were attached to the gateway
      const authzPolicyCalls = capturedRequests.filter(
        (r) => r.method === 'POST' && r.url.includes('networksecurity.googleapis.com/v1beta1/') && r.url.includes('/authzPolicies?authzPolicyId=')
      );
      assert.equal(authzPolicyCalls.length, 2, 'Expected both IAP and AI Security AuthzPolicies to be created');
      assert.ok(authzPolicyCalls.some((c) => c.body.policyProfile === 'REQUEST_AUTHZ'));
      assert.ok(authzPolicyCalls.some((c) => c.body.policyProfile === 'CONTENT_AUTHZ'));

      // Verify ReasoningEngine telemetry env patch was executed (`spec.deploymentSpec.env`)
      const telemetryPatchCall = capturedRequests.find(
        (r) =>
          r.method === 'PATCH' &&
          r.url.includes('reasoningEngines/998877?updateMask=spec.deploymentSpec.env')
      );
      assert.ok(
        telemetryPatchCall,
        'Expected ReasoningEngine PATCH call with updateMask=spec.deploymentSpec.env to enable telemetry'
      );
      const patchedEnv: Array<{ name: string; value: string }> =
        telemetryPatchCall.body.spec.deploymentSpec.env;
      assert.ok(
        patchedEnv.some(
          (e) => e.name === 'GOOGLE_CLOUD_AGENT_ENGINE_ENABLE_TELEMETRY' && e.value === 'true'
        )
      );
      assert.ok(
        patchedEnv.some(
          (e) =>
            e.name === 'OTEL_SEMCONV_STABILITY_OPT_IN' &&
            e.value === 'gen_ai_latest_experimental'
        )
      );
      assert.ok(
        patchedEnv.some(
          (e) =>
            e.name === 'OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT' &&
            e.value === 'EVENT_ONLY'
        )
      );
      assert.ok(
        patchedEnv.some(
          (e) => e.name === 'ADK_CAPTURE_MESSAGE_CONTENT_IN_SPANS' && e.value === 'true'
        )
      );
      assert.equal(res.telemetryEnabled, true);

      // Verify Discovery Engine Gemini Enterprise Agent registration
      const discoveryEngineCall = capturedRequests.find(
        (r) => r.method === 'POST' && r.url.includes('discoveryengine.googleapis.com/v1alpha/') && r.url.includes('/assistants/default_assistant/agents')
      );
      assert.ok(discoveryEngineCall, 'Expected Discovery Engine CreateAgent call');
      assert.equal(
        discoveryEngineCall.body.adkAgentDefinition.provisionedReasoningEngine.reasoningEngine,
        'projects/my-ent-project/locations/us-central1/reasoningEngines/998877'
      );
    });

    it('should automatically register eval_dataset.jsonl test prompts as Vertex AI EvaluationItems (with userScenario oneof), patch EvaluationSet with agentConfigs, create EvaluationExperiment, trigger an initial EvaluationRun, and register the agent in App Hub for the Topology tab', async () => {
      const jsonlLines = [
        JSON.stringify({
          prompt: 'Find me a 3-day itinerary in Tokyo',
          reference: 'Day 1: Shibuya & Shinjuku, Day 2: Asakusa, Day 3: Akihabara',
          expected_tool_calls: ['search_flights'],
        }),
        JSON.stringify({
          prompt: 'What is the baggage policy for economy class?',
          reference: '1 carry-on and 1 checked bag up to 23kg',
        }),
      ];
      fs.writeFileSync(path.join(tempDir, 'eval_dataset.jsonl'), jsonlLines.join('\n') + '\n', 'utf8');

      const capturedRequests: Array<{ method: string; url: string; body?: any }> = [];
      let itemCounter = 0;

      const res = await runner.runPostDeployGovernance({
        target: 'agent_engine',
        targetDirectory: tempDir,
        projectId: 'my-ent-project',
        region: 'us-central1',
        agentId: 'travel_concierge_agent',
        displayName: 'Travel Concierge Agent',
        deployedResourceUri: 'projects/my-ent-project/locations/us-central1/reasoningEngines/998877',
        serviceUrl: 'https://us-central1-aiplatform.googleapis.com/v1/projects/my-ent-project/locations/us-central1/reasoningEngines/998877',
        stagingBucket: 'gs://my-ent-project-staging',
        customHttpRequester: async (req) => {
          capturedRequests.push({ method: req.method, url: req.url, body: req.body });

          if (req.method === 'GET' && req.url.includes('apphub.googleapis.com/v1/') && req.url.endsWith('/discoveredWorkloads')) {
            return {
              statusCode: 200,
              data: {
                discoveredWorkloads: [
                  {
                    name: 'projects/my-ent-project/locations/us-central1/discoveredWorkloads/dw-998877',
                    workloadReference: {
                      uri: '//aiplatform.googleapis.com/projects/my-ent-project/locations/us-central1/reasoningEngines/998877',
                    },
                  },
                ],
              },
              rawBody: '',
            };
          }

          if (req.method === 'POST' && req.url.includes('apphub.googleapis.com/v1/') && req.url.includes('/workloads?workloadId=')) {
            return {
              statusCode: 200,
              data: {
                name: 'projects/my-ent-project/locations/us-central1/applications/agent-platform-us-central1/workloads/travel-concierge-agent-wl',
              },
              rawBody: '',
            };
          }

          if (req.method === 'POST' && req.url.endsWith('/evaluationItems')) {
            itemCounter++;
            return {
              statusCode: 200,
              data: {
                name: `projects/111/locations/us-central1/evaluationItems/item-${itemCounter}`,
              },
              rawBody: '',
            };
          }

          if (req.method === 'POST' && req.url.endsWith('/evaluationSets')) {
            return {
              statusCode: 200,
              data: {
                name: 'projects/111/locations/us-central1/evaluationSets/set-555',
              },
              rawBody: '',
            };
          }

          if (req.method === 'GET' && req.url.includes('/evaluationExperiments')) {
            return {
              statusCode: 200,
              data: { evaluationExperiments: [] },
              rawBody: '',
            };
          }

          if (req.method === 'POST' && req.url.endsWith('/evaluationExperiments')) {
            return {
              statusCode: 200,
              data: {
                name: 'projects/111/locations/us-central1/evaluationExperiments/exp-777',
              },
              rawBody: '',
            };
          }

          if (req.method === 'POST' && req.url.endsWith('/evaluationRuns')) {
            return {
              statusCode: 200,
              data: {
                name: 'projects/111/locations/us-central1/evaluationRuns/run-888',
              },
              rawBody: '',
            };
          }

          if (req.method === 'GET') {
            return { statusCode: 404, data: {}, rawBody: '' };
          }

          return { statusCode: 200, data: { done: true, name: req.url }, rawBody: '' };
        },
      });

      assert.equal(res.evaluationItemsCount, 2);
      assert.equal(
        res.evaluationSetResource,
        'projects/111/locations/us-central1/evaluationSets/set-555'
      );
      assert.equal(
        res.evaluationExperimentResource,
        'projects/111/locations/us-central1/evaluationExperiments/exp-777'
      );
      assert.equal(
        res.evaluationRunResource,
        'projects/111/locations/us-central1/evaluationRuns/run-888'
      );
      assert.equal(
        res.appHubApplicationResource,
        'projects/my-ent-project/locations/us-central1/applications/agent-platform-us-central1'
      );
      assert.equal(
        res.appHubWorkloadResource,
        'projects/my-ent-project/locations/us-central1/applications/agent-platform-us-central1/workloads/travel-concierge-agent-wl'
      );

      // Verify GCS upload for EvaluationItem sets ONLY prompt.userScenario (oneof data) and NOT prompt.text
      const gcsUploadCall = capturedRequests.find(
        (r) => r.method === 'POST' && r.url.includes('storage.googleapis.com/upload/storage/v1/b/my-ent-project-staging/o')
      );
      assert.ok(gcsUploadCall, 'Expected GCS upload for EvaluationItem payload');
      assert.ok(gcsUploadCall.body.prompt.userScenario, 'Expected prompt.userScenario in GCS EvaluationRequest');
      assert.equal(
        gcsUploadCall.body.prompt.text,
        undefined,
        'prompt.text must not be set alongside prompt.userScenario in protobuf oneof'
      );

      // Verify EvaluationSet received both EvaluationItem resource names AND was patched with agentConfigs
      const createSetCall = capturedRequests.find(
        (r) => r.method === 'POST' && r.url.endsWith('/evaluationSets')
      );
      assert.ok(createSetCall, 'Expected POST /evaluationSets call');
      assert.deepEqual(createSetCall.body.evaluationItems, [
        'projects/111/locations/us-central1/evaluationItems/item-1',
        'projects/111/locations/us-central1/evaluationItems/item-2',
      ]);

      const patchSetCall = capturedRequests.find(
        (r) =>
          r.method === 'PATCH' &&
          r.url.includes('/evaluationSets/set-555?updateMask=evaluation_items,agent_configs')
      );
      assert.ok(
        patchSetCall,
        'Expected PATCH /evaluationSets/set-555?updateMask=evaluation_items,agent_configs call'
      );
      assert.ok(
        patchSetCall.body.agentConfigs['travel_concierge_agent'],
        'Expected agentConfigs map keyed by root agent ID'
      );

      // Verify EvaluationExperiment was created with the exact Agent Engine labels (and without vertex-ai-evaluation-agent-resource-id)
      const createExpCall = capturedRequests.find(
        (r) => r.method === 'POST' && r.url.endsWith('/evaluationExperiments')
      );
      assert.ok(createExpCall, 'Expected POST /evaluationExperiments call');
      assert.equal(
        createExpCall.body.labels['vertex-ai-evaluation-set-name'],
        'projects/111/locations/us-central1/evaluationSets/set-555'
      );
      assert.equal(
        createExpCall.body.labels['vertex-ai-evaluation-agent-engine-id'],
        '998877'
      );
      assert.equal(
        createExpCall.body.labels['vertex-ai-evaluation-agent-engine-location'],
        'us-central1'
      );
      assert.equal(
        createExpCall.body.labels['vertex-ai-evaluation-agent-resource-id'],
        undefined,
        'Agent Engine experiments must not set vertex-ai-evaluation-agent-resource-id'
      );

      // Verify initial EvaluationRun was triggered with inferenceConfigs and outputConfig
      const createRunCall = capturedRequests.find(
        (r) => r.method === 'POST' && r.url.endsWith('/evaluationRuns')
      );
      assert.ok(createRunCall, 'Expected POST /evaluationRuns call');
      assert.equal(
        createRunCall.body.evaluationExperiment,
        'projects/111/locations/us-central1/evaluationExperiments/exp-777'
      );
      assert.equal(
        createRunCall.body.dataSource.evaluationSet,
        'projects/111/locations/us-central1/evaluationSets/set-555'
      );
      assert.equal(
        createRunCall.body.evaluationConfig.outputConfig.gcsDestination.outputUriPrefix,
        'gs://my-ent-project-staging/evaluation-runs/travel_concierge_agent'
      );
      assert.equal(
        createRunCall.body.inferenceConfigs['travel_concierge_agent'].agentRunConfig.agentEngine,
        'projects/my-ent-project/locations/us-central1/reasoningEngines/998877'
      );
    });

    it('should ensure the agent-engine codegen skills include telemetry env vars in .agent_engine_config.json and google-cloud-aiplatform>=1.126.1', () => {
      const promptContent = readCodegenSkills('agent-engine');
      assert.ok(
        promptContent.includes('GOOGLE_CLOUD_AGENT_ENGINE_ENABLE_TELEMETRY'),
        'Expected GOOGLE_CLOUD_AGENT_ENGINE_ENABLE_TELEMETRY in python_adk_agent-engine.prompt.txt'
      );
      assert.ok(
        promptContent.includes('OTEL_SEMCONV_STABILITY_OPT_IN'),
        'Expected OTEL_SEMCONV_STABILITY_OPT_IN in python_adk_agent-engine.prompt.txt'
      );
      assert.ok(
        promptContent.includes('ADK_CAPTURE_MESSAGE_CONTENT_IN_SPANS'),
        'Expected ADK_CAPTURE_MESSAGE_CONTENT_IN_SPANS in python_adk_agent-engine.prompt.txt'
      );
      assert.ok(
        promptContent.includes('--otel_to_cloud'),
        'Expected --otel_to_cloud in python_adk_agent-engine.prompt.txt'
      );
      assert.ok(
        promptContent.includes('google-cloud-aiplatform[adk,agent_engines]>=1.126.1'),
        'Expected google-cloud-aiplatform[adk,agent_engines]>=1.126.1 in python_adk_agent-engine.prompt.txt'
      );
    });

    it('should fall back to python3 evaluate.py when Makefile eval target references missing .venv/bin/python, ignore benign FutureWarning logs, and publish Cloud Run agent to Gemini Enterprise via a2aAgentDefinition', async () => {
      if (process.platform === 'win32') return;

      // Write a Makefile whose eval target hardcodes .venv/bin/python without `make install`
      fs.writeFileSync(
        path.join(tempDir, 'Makefile'),
        [
          'eval:',
          '\t.venv/bin/python evaluate.py --project=$(PROJECT_ID) --location=$(REGION) --dataset=eval_dataset.jsonl',
        ].join('\n'),
        'utf8'
      );

      // Write an evaluate.py that emits a benign FutureWarning to stderr and exits 0
      fs.writeFileSync(
        path.join(tempDir, 'evaluate.py'),
        [
          'import sys',
          'sys.stderr.write("FutureWarning: The vertexai.Client class is deprecated.\\n")',
          'print("Evaluation completed successfully.")',
        ].join('\n'),
        'utf8'
      );

      assert.equal(
        runner.hasMakefileTarget(tempDir, 'eval'),
        false,
        'Should return false when Makefile eval target requires missing .venv/bin/python without install'
      );

      const evalCmd = runner.buildCloudEvaluationCommand({
        targetDirectory: tempDir,
        projectId: 'argolis-playground',
        region: 'us-central1',
        deployedResourceUri: 'projects/argolis-playground/locations/us-central1/services/company-verifier',
      });
      assert.equal(evalCmd.executable, 'python3');
      assert.ok(!evalCmd.args.some((a) => a.startsWith('--agent-resource=')));

      const capturedRequests: Array<{ method: string; url: string; body?: any }> = [];
      const res = await runner.runPostDeployGovernance({
        target: 'cloud_run',
        targetDirectory: tempDir,
        projectId: 'argolis-playground',
        region: 'us-central1',
        agentId: 'company-verifier',
        displayName: 'Company Verifier',
        deployedResourceUri: 'projects/argolis-playground/locations/us-central1/services/company-verifier',
        serviceUrl: 'https://company-verifier-717498696647.us-central1.run.app',
        governance: {
          enableAgentGateway: true,
          runCloudEvaluation: true,
          publishToGeminiEnterprise: true,
          geminiEnterpriseAppId: 'agent-designer_1791823970674',
          geminiEnterpriseLocation: 'global',
        },
        customHttpRequester: async (req) => {
          capturedRequests.push({ method: req.method, url: req.url, body: req.body });
          return { statusCode: 200, data: { done: true, name: req.url }, rawBody: '' };
        },
      });

      assert.equal(res.evalGateStatus, 'passed');
      assert.equal(res.geminiEnterpriseBlockedByEval, undefined);
      assert.ok(res.geminiEnterpriseAgentUri?.includes('agent-designer_1791823970674'));

      const discoveryCall = capturedRequests.find(
        (r) =>
          r.method === 'POST' &&
          r.url.includes('discoveryengine.googleapis.com/v1alpha/') &&
          r.url.endsWith('/assistants/default_assistant/agents')
      );
      assert.ok(discoveryCall, 'Expected POST to Discovery Engine /assistants/default_assistant/agents without ?agentId=');
      assert.equal(
        discoveryCall.body.sharingConfig?.scope,
        'ALL_USERS',
        'Expected Cloud Run agent registration to set sharingConfig.scope = ALL_USERS'
      );
      assert.ok(
        discoveryCall.body.a2aAgentDefinition?.jsonAgentCard,
        'Expected Cloud Run agent to be registered with a2aAgentDefinition.jsonAgentCard'
      );
      const parsedCard = JSON.parse(discoveryCall.body.a2aAgentDefinition.jsonAgentCard);
      assert.equal(parsedCard.url, 'https://company-verifier-717498696647.us-central1.run.app');
      assert.equal(parsedCard.preferredTransport, 'JSONRPC');

      const setIamCall = capturedRequests.find(
        (r) =>
          r.method === 'POST' &&
          r.url.includes('run.googleapis.com/v2/projects/argolis-playground/locations/us-central1/services/company-verifier:setIamPolicy')
      );
      assert.ok(setIamCall, 'Expected Cloud Run setIamPolicy call to grant roles/run.invoker to Discovery Engine service agent');
      const invokerBinding = setIamCall.body?.policy?.bindings?.find(
        (b: any) => b.role === 'roles/run.invoker'
      );
      assert.ok(
        invokerBinding?.members?.includes('serviceAccount:service-717498696647@gcp-sa-discoveryengine.iam.gserviceaccount.com'),
        'Expected roles/run.invoker binding for service-717498696647@gcp-sa-discoveryengine.iam.gserviceaccount.com'
      );
    });

    it('should ensure the Cloud Run codegen skills include standalone CLI, Terraform, and Cloud Build CI/CD parity for Discovery Engine IAM and JSONRPC A2A publishing', () => {
      const promptText = readCodegenSkills('cloudrun');
      assert.ok(
        promptText.includes('discovery_engine_invoker'),
        'Expected main.tf instructions in python_adk_cloudrun.prompt.txt to provision discovery_engine_invoker IAM member'
      );
      assert.ok(
        promptText.includes('@gcp-sa-discoveryengine.iam.gserviceaccount.com'),
        'Expected python_adk_cloudrun.prompt.txt to grant roles/run.invoker to the Discovery Engine service agent'
      );
      assert.ok(
        promptText.includes('preferredTransport: "JSONRPC"'),
        'Expected Makefile publish-gemini-enterprise target in python_adk_cloudrun.prompt.txt to use JSONRPC transport'
      );
    });
  });
});



