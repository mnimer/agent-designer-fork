/**
 * Unit Tests for Google Kubernetes Engine (GKE Autopilot) Deployment Target (TASK-237)
 *
 * Validates:
 * 1. UnifiedDeployRunner.buildGkeDeployCommand() generates correct `adk deploy gke` command line.
 * 2. UnifiedDeployRunner.buildKubectlApplyCommand() generates correct `kubectl apply -f k8s/` command line.
 * 3. UnifiedDeployRunner.buildMakeDeployCommand() includes GKE parameters (CLUSTER_NAME, NAMESPACE, REPLICAS).
 * 4. UnifiedDeployRunner.buildTerraformApplyCommand() includes GKE variables (-var=cluster_name, -var=namespace).
 * 5. (retired 2026-10-23) GKE prompt template integrity — code generation no longer targets GKE.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'path';
import * as fs from 'fs';
import { UnifiedDeployRunner } from '../../../src/extension/deployer/UnifiedDeployRunner';
import { GcloudDetector } from '../../../src/extension/deployer/GcloudDetector';
import { AgentGovernanceProvisioner } from '../../../src/extension/deployer/AgentGovernanceProvisioner';

describe('GKE Autopilot Deployment Target (TASK-237)', () => {
  let detector: GcloudDetector;
  let runner: UnifiedDeployRunner;

  beforeEach(() => {
    detector = new GcloudDetector();
    runner = new UnifiedDeployRunner(detector);
  });

  // Section: GKE Deploy Command Builder
  it('should construct adk deploy gke command with cluster, location, and namespace options', () => {
    const cmd = runner.buildGkeDeployCommand({
      projectId: 'my-agent-project',
      clusterName: 'agent-autopilot-cluster',
      region: 'us-central1',
      namespace: 'production-agents',
      serviceName: 'flight-service',
    });

    assert.equal(cmd.executable, 'adk');
    assert.deepEqual(cmd.args, [
      'deploy',
      'gke',
      '--project=my-agent-project',
      '--cluster=agent-autopilot-cluster',
      '--location=us-central1',
      '--namespace=production-agents',
      '--service=flight-service',
    ]);
    assert.equal(
      cmd.commandString,
      'adk deploy gke --project=my-agent-project --cluster=agent-autopilot-cluster --location=us-central1 --namespace=production-agents --service=flight-service'
    );
  });

  it('should default namespace to default when omitted in buildGkeDeployCommand', () => {
    const cmd = runner.buildGkeDeployCommand({
      projectId: 'test-project',
      clusterName: 'test-cluster',
      region: 'europe-west4',
    });

    assert.equal(cmd.executable, 'adk');
    assert.ok(cmd.args.includes('--namespace=default'));
    assert.ok(cmd.args.includes('--cluster=test-cluster'));
  });

  // Section: kubectl apply Command Builder
  it('should construct kubectl apply -f k8s/ command with specified namespace', () => {
    const cmd = runner.buildKubectlApplyCommand({
      namespace: 'staging',
      k8sDir: 'k8s/',
    });

    assert.equal(cmd.executable, 'kubectl');
    assert.deepEqual(cmd.args, ['apply', '-n', 'staging', '-f', 'k8s/']);
    assert.equal(cmd.commandString, 'kubectl apply -n staging -f k8s/');
  });

  // Section: Makefile Deploy Command with GKE Target
  it('should pass CLUSTER_NAME, NAMESPACE, and REPLICAS when target is gke in buildMakeDeployCommand', () => {
    const cmd = runner.buildMakeDeployCommand({
      target: 'gke',
      targetDirectory: '/tmp/test-agent',
      projectId: 'my-gke-project',
      region: 'us-central1',
      gkeClusterName: 'autopilot-agents-prod',
      gkeNamespace: 'agents',
      serviceName: 'travel-agent',
      gkeReplicas: 3,
      enableWorkloadIdentity: true,
    });

    assert.equal(cmd.executable, 'make');
    assert.ok(cmd.args.includes('CLUSTER_NAME=autopilot-agents-prod'));
    assert.ok(cmd.args.includes('NAMESPACE=agents'));
    assert.ok(cmd.args.includes('SERVICE_NAME=travel-agent'));
    assert.ok(cmd.args.includes('REPLICAS=3'));
    assert.ok(cmd.args.includes('ENABLE_WORKLOAD_IDENTITY=true'));
  });

  // Section: Terraform Command with GKE Target
  it('should pass -var=cluster_name and -var=namespace in buildTerraformApplyCommand for GKE', () => {
    const cmd = runner.buildTerraformApplyCommand({
      target: 'gke',
      targetDirectory: '/tmp/test-agent',
      projectId: 'my-gke-project',
      region: 'us-central1',
      gkeClusterName: 'autopilot-agents-prod',
      gkeNamespace: 'agents',
    });

    assert.equal(cmd.executable, 'terraform');
    assert.ok(cmd.args.includes('-var=cluster_name=autopilot-agents-prod'));
    assert.ok(cmd.args.includes('-var=namespace=agents'));
  });

  // NOTE (2026-10-23): The GKE prompt template was retired with the monolithic prompts; code
  // generation targets Agent Runtime and Cloud Run only (GKE deferred, TASK-237).

  // Section: Agent Governance Workload Candidate CAIS URIs
  it('should support GKE container cluster CAIS URIs in governance provisioning', async () => {
    const requestedUrls: string[] = [];
    const customRequester = async (req: any) => {
      requestedUrls.push(req.url);
      if (req.url.includes('discoveredWorkloads:lookup')) {
        return {
          statusCode: 200,
          data: {
            discoveredWorkload: {
              name: 'projects/test-proj/locations/us-central1/discoveredWorkloads/cluster-workload-1',
            },
          },
          rawBody: '{}',
        };
      }
      return { statusCode: 200, data: {}, rawBody: '{}' };
    };

    const provisioner = new AgentGovernanceProvisioner(detector, customRequester);
    const summary = await provisioner.provisionGovernanceResources({
      target: 'gke',
      projectId: 'test-proj',
      region: 'us-central1',
      cleanAgentId: 'gke-agent',
      displayName: 'GKE Agent',
      deployedResourceUri: 'projects/test-proj/locations/us-central1/clusters/agent-autopilot-cluster/k8s/namespaces/default/services/gke-agent',
      serviceUrl: 'http://35.192.1.1',
      enableGateway: false,
      sharedGatewayId: 'gw-1',
      modelArmorTemplateId: 'template-1',
    });

    assert.ok(summary.agentRegistryResource.includes('projects/test-proj/locations/us-central1/agents/gke-agent'));
    assert.ok(summary.appHubWorkloadResource?.includes('workloads/gke-agent'));
    // Verify container.googleapis.com lookup was attempted
    const foundContainerLookup = requestedUrls.some((u) => u.includes('container.googleapis.com'));
    assert.ok(foundContainerLookup, 'Should query App Hub lookup for container.googleapis.com cluster CAIS URI');
  });
});
