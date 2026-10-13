/**
 * AgentGovernanceProvisioner
 *
 * Executes live Google Cloud OnePlatform REST API calls during the post-deploy
 * Enterprise Agent Governance (`TASK-217`) and Gemini Enterprise App Publishing (`TASK-218`)
 * pipeline so that deployed agents, gateways, Model Armor templates, and security policies
 * are actually provisioned in Google Cloud and visible in the Google Cloud Console:
 * - Agent Registry: `/agent-platform/agents` (`agentregistry.googleapis.com/v1alpha`)
 * - Agent Gateways: `/agent-platform/gateways` (`networkservices.googleapis.com/v1alpha1`,
 *   `networkservices.googleapis.com/v1beta1` AuthzExtensions, `networksecurity.googleapis.com/v1beta1`
 *   AuthzPolicies, and `modelarmor.googleapis.com/v1` Templates)
 * - Agent Security Policies: `/agent-platform/policies` (`iap.googleapis.com/v1` `iap_web/agentRegistry`
 *   IAM allow policies with `roles/iap.egressor` and `iam.googleapis.com/v3` `accessPolicies` + `policyBindings`)
 * - Gemini Enterprise Apps: `/gen-app-builder/engines` (`discoveryengine.googleapis.com/v1alpha`)
 *
 * Architectural Decisions:
 * 1. Matches Cloud Console (`//depot/google3/cloud/console/web/agent_management/`) OnePlatform
 *    REST schemas 1:1 rather than relying on non-existent `gcloud` subcommands.
 * 2. Idempotent Get-or-Create / Patch flow: safely reuses existing shared regional gateways,
 *    Model Armor templates, AuthzExtensions, AuthzPolicies, and IAM bindings across re-deploys.
 * 3. Dependency-injectable `HttpJsonRequester` for 100% deterministic unit testing without
 *    external network calls during test runs.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { GcloudDetector } from './GcloudDetector';

/**
 * Parsed evaluation scenario record from `eval_dataset.jsonl` or workflow Tester trigger node.
 */
export interface EvalDatasetTestCase {
  testCaseTitle: string;
  startingPrompt: string;
  conversationPlan: string;
  reference?: string;
}

/**
 * HTTP request descriptor for Google Cloud OnePlatform JSON REST APIs.
 */
export interface GcpHttpJsonRequest {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  url: string;
  projectId: string;
  body?: Record<string, any>;
  timeoutMs?: number;
}

/**
 * HTTP response returned from a Google Cloud OnePlatform JSON REST API call.
 */
export interface GcpHttpJsonResponse {
  statusCode: number;
  data: any;
  rawBody: string;
}

/**
 * Injectable requester signature for executing authenticated Google Cloud REST requests.
 */
export type HttpJsonRequester = (req: GcpHttpJsonRequest) => Promise<GcpHttpJsonResponse>;

/**
 * Input options for provisioning Agent Registry, Security Policies, Shared Regional Agent Gateway,
 * Agent Engine Telemetry, and Vertex AI Evaluation Experiments.
 */
export interface GovernanceProvisionRequest {
  target: 'agent_engine' | 'cloud_run';
  targetDirectory?: string;
  projectId: string;
  region: string;
  cleanAgentId: string;
  displayName: string;
  description?: string;
  deployedResourceUri: string;
  serviceUrl: string;
  serviceAccount?: string;
  stagingBucket?: string;
  document?: any;
  enableGateway: boolean;
  sharedGatewayId: string;
  modelArmorTemplateId: string;
  onLog?: (text: string, stream: 'stdout' | 'stderr' | 'system') => void;
}

/**
 * Output summary of provisioned Google Cloud governance resources.
 */
export interface GovernanceProvisionSummary {
  agentRegistryResource: string;
  runtimeIdentityPrincipal?: string;
  securityPolicyResource: string;
  agentGatewayResource?: string;
  modelArmorTemplateId?: string;
  telemetryEnabled?: boolean;
  evaluationSetResource?: string;
  evaluationExperimentResource?: string;
  evaluationRunResource?: string;
  evaluationItemsCount?: number;
  evaluationExperimentConsoleUrl?: string;
  appHubApplicationResource?: string;
  appHubWorkloadResource?: string;
}

/**
 * Input options for publishing a deployed agent to a Gemini Enterprise App via Discovery Engine REST API.
 */
export interface GeminiEnterprisePublishRequest {
  projectId: string;
  region: string;
  cleanAgentId: string;
  displayName: string;
  description?: string;
  deployedResourceUri: string;
  serviceUrl?: string;
  agentRegistryResource?: string;
  geminiEnterpriseAppId: string;
  geminiEnterpriseLocation: string;
  onLog?: (text: string, stream: 'stdout' | 'stderr' | 'system') => void;
}

const REQUIRED_GOVERNANCE_SERVICES = [
  'agentregistry.googleapis.com',
  'apphub.googleapis.com',
  'networkservices.googleapis.com',
  'networksecurity.googleapis.com',
  'modelarmor.googleapis.com',
  'iap.googleapis.com',
];

export class AgentGovernanceProvisioner {
  private gcloudDetector: GcloudDetector;
  private customRequester?: HttpJsonRequester;

  constructor(gcloudDetector?: GcloudDetector, customRequester?: HttpJsonRequester) {
    this.gcloudDetector = gcloudDetector || new GcloudDetector();
    this.customRequester = customRequester;
  }

  /**
   * Returns true if live Google Cloud REST calls should be executed.
   * When a customRequester is injected (in unit tests), it is always executed.
   * Otherwise, in node/vitest test runners without a customRequester, live network calls are skipped.
   */
  public shouldExecuteRestCalls(): boolean {
    if (this.customRequester) {
      return true;
    }
    if (
      process.env.NODE_TEST_CONTEXT ||
      process.env.VITEST ||
      process.env.NODE_ENV === 'test'
    ) {
      return false;
    }
    return true;
  }

  /**
   * Executes an authenticated JSON HTTPS request against a Google Cloud OnePlatform API.
   */
  public async requestJson(req: GcpHttpJsonRequest): Promise<GcpHttpJsonResponse> {
    if (this.customRequester) {
      return this.customRequester(req);
    }

    const authHeader = await this.gcloudDetector.getAccessTokenHeader();
    if (!authHeader) {
      return {
        statusCode: 401,
        data: { error: { message: 'No Google Cloud OAuth access token available.' } },
        rawBody: '',
      };
    }

    const payload = req.body !== undefined ? JSON.stringify(req.body) : undefined;
    const timeoutMs = req.timeoutMs ?? 20000;

    return new Promise<GcpHttpJsonResponse>((resolve) => {
      try {
        const parsedUrl = new URL(req.url);
        const headers: Record<string, string> = {
          Authorization: authHeader,
          Accept: 'application/json',
          'x-goog-user-project': req.projectId,
        };
        if (payload !== undefined) {
          headers['Content-Type'] = 'application/json';
          headers['Content-Length'] = String(Buffer.byteLength(payload, 'utf8'));
        }

        const httpReq = https.request(
          {
            protocol: parsedUrl.protocol,
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || undefined,
            path: `${parsedUrl.pathname}${parsedUrl.search}`,
            method: req.method,
            headers,
            timeout: timeoutMs,
          },
          (res) => {
            let rawBody = '';
            res.on('data', (chunk) => {
              rawBody += chunk.toString();
            });
            res.on('end', () => {
              let data: any = null;
              if (rawBody.trim().length > 0) {
                try {
                  data = JSON.parse(rawBody);
                } catch {
                  data = { raw: rawBody };
                }
              }
              resolve({
                statusCode: res.statusCode || 500,
                data,
                rawBody,
              });
            });
          }
        );

        httpReq.on('timeout', () => {
          httpReq.destroy(new Error(`Request timed out after ${timeoutMs}ms: ${req.method} ${req.url}`));
        });

        httpReq.on('error', (err) => {
          resolve({
            statusCode: 503,
            data: { error: { message: err.message } },
            rawBody: err.message,
          });
        });

        if (payload !== undefined) {
          httpReq.write(payload);
        }
        httpReq.end();
      } catch (err: any) {
        resolve({
          statusCode: 500,
          data: { error: { message: err?.message || String(err) } },
          rawBody: err?.message || String(err),
        });
      }
    });
  }

  /**
   * Polls a Google Cloud Long-Running Operation (LRO) until `done: true` or timeout.
   */
  public async pollOperation(
    baseApiUrl: string,
    operationName: string,
    projectId: string,
    maxAttempts = 12,
    intervalMs = 1500
  ): Promise<GcpHttpJsonResponse> {
    const cleanOp = operationName.replace(/^\/+/, '');
    const opUrl = `${baseApiUrl.replace(/\/+$/, '')}/${cleanOp}`;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const res = await this.requestJson({
        method: 'GET',
        url: opUrl,
        projectId,
      });
      if (res.statusCode < 200 || res.statusCode >= 300 || res.data?.done === true) {
        return res;
      }
      if (!this.customRequester && intervalMs > 0) {
        await new Promise((r) => setTimeout(r, intervalMs));
      }
    }

    return {
      statusCode: 200,
      data: { name: operationName, done: false },
      rawBody: '',
    };
  }

  /**
   * Provisions Agent Registry lookup, Agent Security Policies (IAP allow policy + IAM v3 UAP),
   * Model Armor template, Shared Regional Agent Gateway + AuthzExtensions/AuthzPolicies,
   * Agent Engine OpenTelemetry Tracing & Security Telemetry (`spec.deploymentSpec.env`),
   * and Vertex AI Evaluation Dataset & Experiment registration (`evaluationItems`, `evaluationSets`, `evaluationExperiments`).
   */
  public async provisionGovernanceResources(
    options: GovernanceProvisionRequest
  ): Promise<GovernanceProvisionSummary> {
    const {
      target,
      targetDirectory,
      projectId,
      region,
      cleanAgentId,
      displayName,
      deployedResourceUri,
      serviceAccount,
      stagingBucket,
      document,
      enableGateway,
      sharedGatewayId,
      modelArmorTemplateId,
      onLog,
    } = options;

    // Sanitize IAM v3 / NetworkSecurity / App Hub resource IDs (must start with a lowercase letter, max 63 chars)
    const basePolicySlug = cleanAgentId.replace(/^[^a-z]+/, 'a') || 'adk-agent';
    const securityPolicyId = `${basePolicySlug}-least-privilege`.slice(0, 63).replace(/-+$/, '');
    const appHubAppId = `agent-platform-${region}`
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .slice(0, 63)
      .replace(/^-+|-+$/g, '');
    const appHubWorkloadId = basePolicySlug.slice(0, 63).replace(/-+$/, '');
    const agentEngineId = deployedResourceUri.includes('/reasoningEngines/')
      ? deployedResourceUri.split('/reasoningEngines/').pop()?.split('/')[0] || cleanAgentId
      : cleanAgentId;

    const summary: GovernanceProvisionSummary = {
      agentRegistryResource: `projects/${projectId}/locations/${region}/agents/${cleanAgentId}`,
      securityPolicyResource: `projects/${projectId}/locations/${region}/authzPolicies/${securityPolicyId}`,
      telemetryEnabled: target === 'agent_engine',
      appHubApplicationResource: `projects/${projectId}/locations/${region}/applications/${appHubAppId}`,
      appHubWorkloadResource: `projects/${projectId}/locations/${region}/applications/${appHubAppId}/workloads/${appHubWorkloadId}`,
    };
    if (enableGateway) {
      summary.agentGatewayResource = `projects/${projectId}/locations/${region}/agentGateways/${sharedGatewayId}`;
      summary.modelArmorTemplateId = modelArmorTemplateId;
    }

    // Parse evaluation test cases from eval_dataset.jsonl (or workflow Tester node)
    const testCases = this.parseEvalDatasetRecords(targetDirectory, document);
    if (testCases.length > 0) {
      summary.evaluationItemsCount = testCases.length;
      summary.evaluationSetResource = `projects/${projectId}/locations/${region}/evaluationSets/${cleanAgentId}-eval-set`;
      summary.evaluationExperimentResource = `projects/${projectId}/locations/${region}/evaluationExperiments/${cleanAgentId}-eval-exp`;
      summary.evaluationExperimentConsoleUrl =
        target === 'agent_engine' && deployedResourceUri.includes('/reasoningEngines/')
          ? `https://console.cloud.google.com/vertex-ai/agents/locations/${region}/agent-engines/${agentEngineId}/evaluation?project=${projectId}`
          : `https://console.cloud.google.com/vertex-ai/experiments?project=${projectId}`;
    }

    if (!this.shouldExecuteRestCalls()) {
      return summary;
    }

    // 0. Best-effort enable required governance APIs on the target project
    await this.ensureGovernanceApisEnabled(projectId, onLog);

    // 0B. Enable Agent Engine OpenTelemetry Tracing & Security Telemetry on ReasoningEngine (`spec.deploymentSpec.env`)
    if (target === 'agent_engine' && deployedResourceUri.includes('reasoningEngines/')) {
      const telemetryOk = await this.enableAgentEngineTelemetry({
        projectId,
        region,
        deployedResourceUri,
        onLog,
      });
      summary.telemetryEnabled = telemetryOk;
    }

    // 1. Discover Agent in Agent Registry (`agentregistry.googleapis.com/v1alpha`) & RuntimeIdentity principal
    const discovered = await this.discoverAgentInRegistry({
      projectId,
      region,
      cleanAgentId,
      displayName,
      deployedResourceUri,
      onLog,
    });
    if (discovered.agentName) {
      summary.agentRegistryResource = discovered.agentName;
    }
    if (discovered.runtimeIdentityPrincipal) {
      summary.runtimeIdentityPrincipal = discovered.runtimeIdentityPrincipal;
    }

    // 1B. Register Agent Workload/Service in Google Cloud App Hub (`apphub.googleapis.com/v1`) for Topology Tab
    const appHubReg = await this.registerAgentInAppHub({
      projectId,
      region,
      cleanAgentId,
      displayName: displayName || cleanAgentId,
      deployedResourceUri,
      serviceUrl: options.serviceUrl,
      onLog,
    });
    if (appHubReg.appHubApplicationResource) {
      summary.appHubApplicationResource = appHubReg.appHubApplicationResource;
    }
    if (appHubReg.appHubWorkloadResource) {
      summary.appHubWorkloadResource = appHubReg.appHubWorkloadResource;
    }

    // 2. Provision Agent Security Policies (`/agent-platform/policies`)
    await this.provisionAgentSecurityPolicies({
      projectId,
      region,
      cleanAgentId,
      securityPolicyId,
      agentRegistryResource: summary.agentRegistryResource,
      runtimeIdentityPrincipal: discovered.runtimeIdentityPrincipal,
      serviceAccount,
      onLog,
    });

    // 3. Provision Shared Regional Agent Gateway + Model Armor + AuthzExtensions & AuthzPolicies (`/agent-platform/gateways`)
    if (enableGateway) {
      await this.provisionModelArmorTemplate({
        projectId,
        region,
        templateId: modelArmorTemplateId,
        onLog,
      });

      await this.provisionSharedAgentGatewayAndPolicies({
        projectId,
        region,
        sharedGatewayId,
        modelArmorTemplateId,
        onLog,
      });
    }

    // 4. Register eval_dataset.jsonl test cases into Vertex AI Evaluation Set, Experiment & Initial Run
    if (testCases.length > 0) {
      const evalReg = await this.registerEvaluationDatasetAndExperiment({
        projectId,
        region,
        cleanAgentId,
        displayName: displayName || cleanAgentId,
        deployedResourceUri,
        stagingBucket,
        document,
        testCases,
        onLog,
      });
      if (evalReg.evaluationSetResource) {
        summary.evaluationSetResource = evalReg.evaluationSetResource;
      }
      if (evalReg.evaluationExperimentResource) {
        summary.evaluationExperimentResource = evalReg.evaluationExperimentResource;
      }
      if (evalReg.evaluationRunResource) {
        summary.evaluationRunResource = evalReg.evaluationRunResource;
      }
      if (evalReg.evaluationItemsCount !== undefined) {
        summary.evaluationItemsCount = evalReg.evaluationItemsCount;
      }
    }

    return summary;
  }

  /**
   * Publishes the deployed agent to a Gemini Enterprise App (`discoveryengine.googleapis.com/v1alpha`).
   */
  public async publishToGeminiEnterprise(
    options: GeminiEnterprisePublishRequest
  ): Promise<{ agentUri: string; consoleUrl: string }> {
    const {
      projectId,
      region,
      cleanAgentId,
      displayName,
      description,
      deployedResourceUri,
      serviceUrl,
      geminiEnterpriseAppId,
      geminiEnterpriseLocation,
      onLog,
    } = options;

    const loc = geminiEnterpriseLocation?.trim() || 'global';
    const appId = geminiEnterpriseAppId.trim();
    const agentUri = `projects/${projectId}/locations/${loc}/collections/default_collection/engines/${appId}/assistants/default_assistant/agents/${cleanAgentId}`;
    const consoleUrl = `https://console.cloud.google.com/gen-app-builder/engines/${appId}/assistants/default_assistant/agents?project=${projectId}`;

    if (!this.shouldExecuteRestCalls()) {
      return { agentUri, consoleUrl };
    }

    const hostPrefix = loc === 'eu' || loc === 'us' ? `${loc}-` : '';
    const parentPath = `projects/${projectId}/locations/${loc}/collections/default_collection/engines/${appId}/assistants/default_assistant`;
    const baseUrl = `https://${hostPrefix}discoveryengine.googleapis.com/v1alpha/${parentPath}/agents`;

    const resolvedDisplayName = displayName || cleanAgentId;
    const resolvedDescription =
      description || `Enterprise ADK Agent (${resolvedDisplayName})`;

    const agentPayload: Record<string, any> = {
      displayName: resolvedDisplayName,
      description: resolvedDescription,
      sharingConfig: {
        scope: 'ALL_USERS',
      },
    };

    const isAgentEngine = deployedResourceUri.includes('/reasoningEngines/');
    if (isAgentEngine) {
      agentPayload.adkAgentDefinition = {
        provisionedReasoningEngine: {
          reasoningEngine: deployedResourceUri,
        },
      };
    } else {
      const resolvedHttpsUrl =
        serviceUrl && serviceUrl.startsWith('https://')
          ? serviceUrl.replace(/\/+$/, '')
          : `https://${cleanAgentId}.a.run.app`;
      // NOTE: For Cloud Run (*.run.app), Gemini Enterprise's A2A client (`a2a_agent.py` -> `_get_cloud_run_headers`)
      // signs `X-Google-GFE-Cloud-Client-Network-Project-Number` into `Sec-Authenticated-Request-Headers`
      // bound to the exact host + path of `agent_card.url` (`/`). If `preferredTransport` is `'HTTP+JSON'`,
      // `a2a-sdk` RestTransport appends `/v1/message:send`, causing GFE's AEAD verification of
      // `Sec-Authenticated-Request-Headers` to fail on the path mismatch (`/v1/message:send` != `/`) and
      // Cloud Run's Route Resolver (`CheckNetworkSettingsInternal`) to return 404 Not Found at the edge.
      // Using `'JSONRPC'` causes `JsonRpcTransport` to POST directly to `agent_card.url` (`/`), matching GFE's signature.
      agentPayload.a2aAgentDefinition = {
        jsonAgentCard: JSON.stringify({
          name: resolvedDisplayName,
          description: resolvedDescription,
          url: resolvedHttpsUrl,
          version: '1.0.0',
          protocolVersion: '0.3.0',
          preferredTransport: 'JSONRPC',
          defaultInputModes: ['text/plain', 'application/json'],
          defaultOutputModes: ['text/plain', 'application/json'],
          capabilities: {
            streaming: false,
            pushNotifications: false,
            stateTransitionHistory: false,
          },
          skills: [
            {
              id: cleanAgentId,
              name: resolvedDisplayName,
              description: resolvedDescription,
              tags: ['adk', 'cloud-run', cleanAgentId],
            },
          ],
        }),
      };
    }

    // Check if an agent with the same displayName already exists in this Gemini Enterprise App
    // so redeployments update the existing registration in-place instead of creating duplicates.
    const listRes = await this.requestJson({
      method: 'GET',
      url: baseUrl,
      projectId,
    });
    const existingAgents: Array<Record<string, any>> = Array.isArray(listRes.data?.agents)
      ? listRes.data.agents
      : [];

    if (!isAgentEngine) {
      await this.ensureCloudRunInvokerForDiscoveryEngine({
        projectId,
        region,
        cleanAgentId,
        deployedResourceUri,
        serviceUrl,
        existingAgents,
        onLog,
      });
    }

    const existingMatch = existingAgents.find(
      (a) =>
        typeof a?.name === 'string' &&
        (a.displayName === resolvedDisplayName || a.displayName === cleanAgentId)
    );

    if (existingMatch && typeof existingMatch.name === 'string') {
      const existingUrl = `https://${hostPrefix}discoveryengine.googleapis.com/v1alpha/${existingMatch.name}`;
      const patchExistingRes = await this.requestJson({
        method: 'PATCH',
        url: existingUrl,
        projectId,
        body: agentPayload,
      });
      if (patchExistingRes.statusCode >= 200 && patchExistingRes.statusCode < 300) {
        onLog?.(
          `[Gemini Enterprise] Updated existing agent registration in Gemini Enterprise App '${appId}': ${existingMatch.name}`,
          'system'
        );
        return { agentUri: existingMatch.name, consoleUrl };
      }
    }

    // CreateAgentRequest.agent_id (`?agentId=...`) is GOOGLE_INTERNAL-only in Discovery Engine v1alpha;
    // public REST calls must POST directly to `${baseUrl}` so Discovery Engine assigns the agent ID.
    const createRes = await this.requestJson({
      method: 'POST',
      url: baseUrl,
      projectId,
      body: agentPayload,
    });

    if (createRes.statusCode >= 200 && createRes.statusCode < 300) {
      const rawName = createRes.data?.name;
      const createdName =
        typeof rawName === 'string' &&
        rawName.startsWith('projects/') &&
        !rawName.includes('http')
          ? rawName
          : agentUri;
      onLog?.(
        `[Gemini Enterprise] Registered agent in Gemini Enterprise App '${appId}': ${createdName}`,
        'system'
      );
      return { agentUri: createdName, consoleUrl };
    }

    if (createRes.statusCode === 409) {
      const patchRes = await this.requestJson({
        method: 'PATCH',
        url: `${baseUrl}/${encodeURIComponent(cleanAgentId)}`,
        projectId,
        body: agentPayload,
      });
      if (patchRes.statusCode >= 200 && patchRes.statusCode < 300) {
        onLog?.(
          `[Gemini Enterprise] Updated existing agent registration in Gemini Enterprise App '${appId}'.`,
          'system'
        );
      }
    } else {
      const errMsg = createRes.data?.error?.message || `HTTP ${createRes.statusCode}`;
      onLog?.(
        `[Gemini Enterprise] Note: Discovery Engine agent registration returned ${errMsg}`,
        'system'
      );
    }

    return { agentUri, consoleUrl };
  }

  /**
   * Grants `roles/run.invoker` on the Cloud Run service to the project's Discovery Engine
   * Service Agent (`service-{projectNumber}@gcp-sa-discoveryengine.iam.gserviceaccount.com`)
   * so Gemini Enterprise can invoke the A2A Cloud Run service using `X-Serverless-Authorization`.
   */
  private async ensureCloudRunInvokerForDiscoveryEngine(options: {
    projectId: string;
    region: string;
    cleanAgentId: string;
    deployedResourceUri: string;
    serviceUrl?: string;
    existingAgents?: Array<Record<string, any>>;
    onLog?: (text: string, stream: 'stdout' | 'stderr' | 'system') => void;
  }): Promise<void> {
    const {
      projectId,
      region,
      cleanAgentId,
      deployedResourceUri,
      serviceUrl,
      existingAgents,
      onLog,
    } = options;

    // 1. Resolve numeric projectNumber from Cloud Run URL (`https://<service>-<projectNumber>.<region>.run.app`),
    // existing Discovery Engine agent resource names (`projects/<projectNumber>/...`), or Cloud Resource Manager API.
    let projectNumber: string | undefined;
    const runUrlMatch = serviceUrl?.match(/-(\d{6,20})\.[a-z0-9-]+\.run\.app/i);
    if (runUrlMatch?.[1]) {
      projectNumber = runUrlMatch[1];
    }
    if (!projectNumber && Array.isArray(existingAgents)) {
      for (const agent of existingAgents) {
        const m = typeof agent?.name === 'string' ? agent.name.match(/^projects\/(\d+)\//) : null;
        if (m?.[1]) {
          projectNumber = m[1];
          break;
        }
      }
    }
    if (!projectNumber) {
      const crmRes = await this.requestJson({
        method: 'GET',
        url: `https://cloudresourcemanager.googleapis.com/v1/projects/${encodeURIComponent(projectId)}`,
        projectId,
      });
      if (crmRes.statusCode >= 200 && crmRes.statusCode < 300 && crmRes.data?.projectNumber) {
        projectNumber = String(crmRes.data.projectNumber);
      }
    }

    if (!projectNumber) {
      return;
    }

    const serviceResource =
      deployedResourceUri.startsWith('projects/') && deployedResourceUri.includes('/services/')
        ? deployedResourceUri
        : `projects/${projectId}/locations/${region}/services/${cleanAgentId}`;
    const runIamBaseUrl = `https://run.googleapis.com/v2/${serviceResource}`;
    const discoveryEngineP4saMember = `serviceAccount:service-${projectNumber}@gcp-sa-discoveryengine.iam.gserviceaccount.com`;

    const getIamRes = await this.requestJson({
      method: 'GET',
      url: `${runIamBaseUrl}:getIamPolicy`,
      projectId,
    });
    if (getIamRes.statusCode < 200 || getIamRes.statusCode >= 300) {
      return;
    }

    const currentPolicy = getIamRes.data || {};
    const bindings: Array<{ role: string; members: string[]; condition?: any }> = Array.isArray(
      currentPolicy.bindings
    )
      ? [...currentPolicy.bindings]
      : [];

    const invokerRole = 'roles/run.invoker';
    let roleBinding = bindings.find((b) => b.role === invokerRole && !b.condition);
    if (!roleBinding) {
      roleBinding = { role: invokerRole, members: [discoveryEngineP4saMember] };
      bindings.push(roleBinding);
    } else if (!roleBinding.members.includes(discoveryEngineP4saMember)) {
      roleBinding.members = [...roleBinding.members, discoveryEngineP4saMember];
    } else {
      return;
    }

    const setIamRes = await this.requestJson({
      method: 'POST',
      url: `${runIamBaseUrl}:setIamPolicy`,
      projectId,
      body: {
        policy: {
          ...currentPolicy,
          bindings,
        },
      },
    });

    if (setIamRes.statusCode >= 200 && setIamRes.statusCode < 300) {
      onLog?.(
        `[Gemini Enterprise] Granted Cloud Run Invoker (${invokerRole}) to ${discoveryEngineP4saMember} on ${serviceResource}`,
        'system'
      );
    }
  }

  /**
   * Ensures required governance APIs are enabled via `serviceusage.googleapis.com`.
   */
  private async ensureGovernanceApisEnabled(
    projectId: string,
    onLog?: (text: string, stream: 'stdout' | 'stderr' | 'system') => void
  ): Promise<void> {
    const res = await this.requestJson({
      method: 'POST',
      url: `https://serviceusage.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/services:batchEnable`,
      projectId,
      body: {
        serviceIds: REQUIRED_GOVERNANCE_SERVICES,
      },
    });

    if (res.statusCode >= 200 && res.statusCode < 300 && res.data?.name && !res.data?.done) {
      await this.pollOperation('https://serviceusage.googleapis.com/v1', res.data.name, projectId, 6, 1000);
    } else if (res.statusCode >= 400 && res.statusCode !== 403 && res.statusCode !== 404) {
      onLog?.(
        `[Governance] Service Usage batchEnable status: HTTP ${res.statusCode}`,
        'system'
      );
    }
  }

  /**
   * Queries `agentregistry.googleapis.com/v1alpha` to find the deployed agent's Agent Registry
   * resource name and its system `RuntimeIdentity` principal.
   */
  private async discoverAgentInRegistry(options: {
    projectId: string;
    region: string;
    cleanAgentId: string;
    displayName: string;
    deployedResourceUri: string;
    onLog?: (text: string, stream: 'stdout' | 'stderr' | 'system') => void;
  }): Promise<{ agentName?: string; runtimeIdentityPrincipal?: string }> {
    const { projectId, region, cleanAgentId, displayName, deployedResourceUri, onLog } = options;
    const listUrl = `https://agentregistry.googleapis.com/v1alpha/projects/${encodeURIComponent(
      projectId
    )}/locations/${encodeURIComponent(region)}/agents?pageSize=100`;

    const res = await this.requestJson({
      method: 'GET',
      url: listUrl,
      projectId,
    });

    if (res.statusCode < 200 || res.statusCode >= 300) {
      const msg = res.data?.error?.message || `HTTP ${res.statusCode}`;
      onLog?.(
        `[Governance] Agent Registry lookup (${region}) returned ${msg}; using canonical resource path.`,
        'system'
      );
      return {};
    }

    const agents: any[] = Array.isArray(res.data?.agents) ? res.data.agents : [];
    if (agents.length === 0) {
      return {};
    }

    const runtimeIdSegment = deployedResourceUri.split('/').pop() || '';
    const normDisplay = displayName.trim().toLowerCase();

    const matched =
      agents.find((a) => runtimeIdSegment && JSON.stringify(a).includes(runtimeIdSegment)) ||
      agents.find(
        (a) =>
          String(a.displayName || '').trim().toLowerCase() === normDisplay ||
          String(a.displayName || '').trim().toLowerCase() === cleanAgentId ||
          String(a.name || '').toLowerCase().endsWith(`/${cleanAgentId}`)
      ) ||
      agents[0];

    if (!matched) {
      return {};
    }

    const agentName: string | undefined = matched.name;
    const runtimeIdentityPrincipal: string | undefined =
      matched.attributes?.['agentregistry.googleapis.com/system/RuntimeIdentity']?.principal;

    if (agentName) {
      onLog?.(
        `[Governance] Verified Agent Registry resource: ${agentName}${
          runtimeIdentityPrincipal ? ` (identity: ${runtimeIdentityPrincipal})` : ''
        }`,
        'system'
      );
    }

    return { agentName, runtimeIdentityPrincipal };
  }

  /**
   * Provisions Agent Security Policies on both:
   * 1. IAP Allow Policies (`iap.googleapis.com/v1/.../iap_web/agentRegistry:setIamPolicy`) with `roles/iap.egressor`
   * 2. Unified Access Policies (`iam.googleapis.com/v3/projects/{project}/locations/global/accessPolicies` + `policyBindings`)
   * so that the policy appears in the Cloud Console `/agent-platform/policies` page.
   */
  private async provisionAgentSecurityPolicies(options: {
    projectId: string;
    region: string;
    cleanAgentId: string;
    securityPolicyId: string;
    agentRegistryResource: string;
    runtimeIdentityPrincipal?: string;
    serviceAccount?: string;
    onLog?: (text: string, stream: 'stdout' | 'stderr' | 'system') => void;
  }): Promise<void> {
    const {
      projectId,
      region,
      cleanAgentId,
      securityPolicyId,
      runtimeIdentityPrincipal,
      serviceAccount,
      onLog,
    } = options;

    // Determine principal formats for IAM v1 (Allow Policies) and IAM v3 (Unified Access Policies)
    const iamV1Member =
      runtimeIdentityPrincipal ||
      (serviceAccount ? `serviceAccount:${serviceAccount}` : undefined);

    const uapPrincipal =
      runtimeIdentityPrincipal &&
      (runtimeIdentityPrincipal.startsWith('principal://') ||
        runtimeIdentityPrincipal.startsWith('principalSet://'))
        ? runtimeIdentityPrincipal
        : serviceAccount
        ? `principal://iam.googleapis.com/projects/-/serviceAccounts/${serviceAccount}`
        : undefined;

    // 2A. Provision IAP Agent Registry Allow Policy (`/agent-platform/policies/iam`)
    if (iamV1Member) {
      const iapResourcePath = `projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(
        region
      )}/iap_web/agentRegistry`;
      const iapBaseUrl = `https://iap.googleapis.com/v1/${iapResourcePath}`;

      const getRes = await this.requestJson({
        method: 'POST',
        url: `${iapBaseUrl}:getIamPolicy`,
        projectId,
        body: {},
      });

      if (getRes.statusCode >= 200 && getRes.statusCode < 300) {
        const currentPolicy = getRes.data || {};
        const bindings: Array<{ role: string; members: string[]; condition?: any }> = Array.isArray(
          currentPolicy.bindings
        )
          ? [...currentPolicy.bindings]
          : [];

        const egressRole = 'roles/iap.egressor';
        let roleBinding = bindings.find((b) => b.role === egressRole && !b.condition);
        if (!roleBinding) {
          roleBinding = { role: egressRole, members: [iamV1Member] };
          bindings.push(roleBinding);
        } else if (!roleBinding.members.includes(iamV1Member)) {
          roleBinding.members = [...roleBinding.members, iamV1Member];
        }

        const setRes = await this.requestJson({
          method: 'POST',
          url: `${iapBaseUrl}:setIamPolicy`,
          projectId,
          body: {
            policy: {
              ...currentPolicy,
              bindings,
            },
          },
        });

        if (setRes.statusCode >= 200 && setRes.statusCode < 300) {
          onLog?.(
            `[Governance] Applied IAP Agent Security Policy (${egressRole}) for ${iamV1Member}.`,
            'system'
          );
        }
      }
    }

    // 2B. Provision IAM v3 Unified Access Policy + PolicyBinding (`/agent-platform/policies` UAP tab)
    if (uapPrincipal) {
      const uapParent = `projects/${encodeURIComponent(projectId)}/locations/global`;
      const uapPolicyUrl = `https://iam.googleapis.com/v3/${uapParent}/accessPolicies/${encodeURIComponent(
        securityPolicyId
      )}`;

      const existingUap = await this.requestJson({
        method: 'GET',
        url: uapPolicyUrl,
        projectId,
      });

      if (existingUap.statusCode === 404) {
        const createUapRes = await this.requestJson({
          method: 'POST',
          url: `https://iam.googleapis.com/v3/${uapParent}/accessPolicies?accessPolicyId=${encodeURIComponent(
            securityPolicyId
          )}`,
          projectId,
          body: {
            displayName: `Least-privilege policy for ${cleanAgentId}`.slice(0, 63),
            details: {
              rules: [
                {
                  description: `Allow ${cleanAgentId} egress via IAP and Agent Gateway`,
                  effect: 'ALLOW',
                  principals: [uapPrincipal],
                  operation: {
                    permissions: ['iap.googleapis.com/resources.egressViaIAP'],
                  },
                },
              ],
            },
          },
        });

        if (createUapRes.statusCode >= 200 && createUapRes.statusCode < 300) {
          if (createUapRes.data?.name && !createUapRes.data?.done) {
            await this.pollOperation('https://iam.googleapis.com/v3', createUapRes.data.name, projectId);
          }
          onLog?.(
            `[Governance] Created Unified Access Policy: projects/${projectId}/locations/global/accessPolicies/${securityPolicyId}`,
            'system'
          );
        }
      }

      // Ensure PolicyBinding exists binding the AccessPolicy to the project
      const bindingId = `${securityPolicyId}-binding`.slice(0, 63).replace(/-+$/, '');
      const bindingUrl = `https://iam.googleapis.com/v3/${uapParent}/policyBindings/${encodeURIComponent(
        bindingId
      )}`;
      const existingBinding = await this.requestJson({
        method: 'GET',
        url: bindingUrl,
        projectId,
      });

      if (existingBinding.statusCode === 404) {
        const createBindingRes = await this.requestJson({
          method: 'POST',
          url: `https://iam.googleapis.com/v3/${uapParent}/policyBindings?policyBindingId=${encodeURIComponent(
            bindingId
          )}`,
          projectId,
          body: {
            displayName: `Policy binding for ${cleanAgentId}`.slice(0, 63),
            policyKind: 'ACCESS',
            policy: `projects/${projectId}/locations/global/accessPolicies/${securityPolicyId}`,
            target: {
              resource: `//cloudresourcemanager.googleapis.com/projects/${projectId}`,
            },
          },
        });

        if (createBindingRes.statusCode >= 200 && createBindingRes.statusCode < 300) {
          if (createBindingRes.data?.name && !createBindingRes.data?.done) {
            await this.pollOperation('https://iam.googleapis.com/v3', createBindingRes.data.name, projectId);
          }
          onLog?.(
            `[Governance] Bound Unified Access Policy (${bindingId}) to project ${projectId}.`,
            'system'
          );
        }
      }
    }
  }

  /**
   * Provisions the Model Armor template (`modelarmor.googleapis.com/v1`) if it does not already exist.
   */
  private async provisionModelArmorTemplate(options: {
    projectId: string;
    region: string;
    templateId: string;
    onLog?: (text: string, stream: 'stdout' | 'stderr' | 'system') => void;
  }): Promise<void> {
    const { projectId, region, templateId, onLog } = options;
    const cleanTemplateId = templateId
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'enterprise-baseline';

    const repHost = `https://modelarmor.${region}.rep.googleapis.com/v1`;
    const parentPath = `projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(region)}`;
    const getUrl = `${repHost}/${parentPath}/templates/${encodeURIComponent(cleanTemplateId)}`;

    const getRes = await this.requestJson({
      method: 'GET',
      url: getUrl,
      projectId,
    });

    if (getRes.statusCode >= 200 && getRes.statusCode < 300) {
      onLog?.(
        `[Governance] Verified existing Model Armor template: projects/${projectId}/locations/${region}/templates/${cleanTemplateId}`,
        'system'
      );
      return;
    }

    const isStrict = cleanTemplateId.includes('strict') || cleanTemplateId.includes('pci') || cleanTemplateId.includes('hipaa');
    const confidence = isStrict ? 'LOW_AND_ABOVE' : 'MEDIUM_AND_ABOVE';

    const templateBody: Record<string, any> = {
      filterConfig: {
        piAndJailbreakFilterSettings: {
          filterEnforcement: 'INSPECT_AND_BLOCK',
          confidenceLevel: 'LOW_AND_ABOVE',
        },
        maliciousUriFilterSettings: {
          filterEnforcement: 'INSPECT_AND_BLOCK',
        },
        raiSettings: {
          raiFilters: [
            { filterType: 'HATE_SPEECH', confidenceLevel: confidence },
            { filterType: 'DANGEROUS', confidenceLevel: confidence },
            { filterType: 'HARASSMENT', confidenceLevel: confidence },
            { filterType: 'SEXUALLY_EXPLICIT', confidenceLevel: confidence },
          ],
        },
      },
    };

    if (isStrict) {
      templateBody.filterConfig.sdpSettings = {
        basicConfig: {
          filterEnforcement: 'INSPECT_AND_BLOCK',
        },
      };
    }

    const createRes = await this.requestJson({
      method: 'POST',
      url: `${repHost}/${parentPath}/templates?templateId=${encodeURIComponent(cleanTemplateId)}`,
      projectId,
      body: templateBody,
    });

    if (createRes.statusCode >= 200 && createRes.statusCode < 300) {
      onLog?.(
        `[Governance] Created Model Armor template: projects/${projectId}/locations/${region}/templates/${cleanTemplateId}`,
        'system'
      );
    } else if (createRes.statusCode !== 409) {
      // Fallback to global modelarmor.googleapis.com endpoint if regional REP endpoint is unavailable in region
      const fallbackRes = await this.requestJson({
        method: 'POST',
        url: `https://modelarmor.googleapis.com/v1/${parentPath}/templates?templateId=${encodeURIComponent(
          cleanTemplateId
        )}`,
        projectId,
        body: templateBody,
      });
      if (fallbackRes.statusCode >= 200 && fallbackRes.statusCode < 300) {
        onLog?.(
          `[Governance] Created Model Armor template: projects/${projectId}/locations/${region}/templates/${cleanTemplateId}`,
          'system'
        );
      }
    }
  }

  /**
   * Provisions the Shared Regional Agent Gateway (`networkservices.googleapis.com/v1alpha1`)
   * and attaches both IAP and AI Security (Model Armor) `authzExtensions` (`networkservices.googleapis.com/v1beta1`)
   * and `authzPolicies` (`networksecurity.googleapis.com/v1beta1`), matching Cloud Console's
   * `CreateAgentGatewayAndAuthzResourcesFlow` so the gateway and its policies appear under `/agent-platform/gateways`.
   */
  private async provisionSharedAgentGatewayAndPolicies(options: {
    projectId: string;
    region: string;
    sharedGatewayId: string;
    modelArmorTemplateId: string;
    onLog?: (text: string, stream: 'stdout' | 'stderr' | 'system') => void;
  }): Promise<void> {
    const { projectId, region, sharedGatewayId, modelArmorTemplateId, onLog } = options;

    const cleanGatewayId = sharedGatewayId
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/^[^a-z]+/, 'g')
      .slice(0, 63)
      .replace(/-+$/, '') || 'default-shared-agent-gateway';

    const cleanTemplateId = modelArmorTemplateId
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'enterprise-baseline';

    const parentPath = `projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(region)}`;
    const gatewayResourceName = `projects/${projectId}/locations/${region}/agentGateways/${cleanGatewayId}`;
    const registryResourceUri = `//agentregistry.googleapis.com/projects/${projectId}/locations/${region}`;

    // 3A. Get or Create AgentGateway (`networkservices.googleapis.com/v1alpha1`)
    const gatewayUrl = `https://networkservices.googleapis.com/v1alpha1/${parentPath}/agentGateways/${encodeURIComponent(
      cleanGatewayId
    )}`;
    const existingGw = await this.requestJson({
      method: 'GET',
      url: gatewayUrl,
      projectId,
    });

    if (existingGw.statusCode === 404) {
      const createGwRes = await this.requestJson({
        method: 'POST',
        url: `https://networkservices.googleapis.com/v1alpha1/${parentPath}/agentGateways?agentGatewayId=${encodeURIComponent(
          cleanGatewayId
        )}`,
        projectId,
        body: {
          description: 'Shared Regional Agent Gateway managed by Visual Agent Designer',
          googleManaged: {
            governedAccessPath: 'AGENT_TO_ANYWHERE',
          },
          protocols: ['MCP'],
          registries: [registryResourceUri],
        },
      });

      if (createGwRes.statusCode >= 200 && createGwRes.statusCode < 300) {
        if (createGwRes.data?.name && !createGwRes.data?.done) {
          await this.pollOperation(
            'https://networkservices.googleapis.com/v1alpha1',
            createGwRes.data.name,
            projectId
          );
        }
        onLog?.(
          `[Governance] Created Shared Regional Agent Gateway: ${gatewayResourceName}`,
          'system'
        );
      } else {
        const errMsg = createGwRes.data?.error?.message || `HTTP ${createGwRes.statusCode}`;
        onLog?.(
          `[Governance] Warning creating Agent Gateway (${cleanGatewayId}): ${errMsg}`,
          'stderr'
        );
      }
    } else if (existingGw.statusCode >= 200 && existingGw.statusCode < 300) {
      const currentRegistries: string[] = Array.isArray(existingGw.data?.registries)
        ? existingGw.data.registries
        : [];
      if (!currentRegistries.includes(registryResourceUri)) {
        const patchGwRes = await this.requestJson({
          method: 'PATCH',
          url: `${gatewayUrl}?updateMask=registries`,
          projectId,
          body: {
            ...existingGw.data,
            registries: [...currentRegistries, registryResourceUri],
          },
        });
        if (patchGwRes.statusCode >= 200 && patchGwRes.statusCode < 300 && patchGwRes.data?.name) {
          await this.pollOperation(
            'https://networkservices.googleapis.com/v1alpha1',
            patchGwRes.data.name,
            projectId
          );
        }
      }
      onLog?.(
        `[Governance] Attached Agent Registry (${region}) to Shared Regional Agent Gateway: ${gatewayResourceName}`,
        'system'
      );
    }

    // 3B. Get or Create IAP AuthzExtension + AuthzPolicy (`REQUEST_AUTHZ`)
    const iapExtId = `${cleanGatewayId}-iap-authzextension`.slice(0, 63).replace(/-+$/, '');
    const iapPolicyId = `${cleanGatewayId}-iap-authzpolicy`.slice(0, 63).replace(/-+$/, '');
    const iapExtResource = `projects/${projectId}/locations/${region}/authzExtensions/${iapExtId}`;

    const getIapExt = await this.requestJson({
      method: 'GET',
      url: `https://networkservices.googleapis.com/v1beta1/${parentPath}/authzExtensions/${encodeURIComponent(
        iapExtId
      )}`,
      projectId,
    });
    if (getIapExt.statusCode === 404) {
      const createIapExt = await this.requestJson({
        method: 'POST',
        url: `https://networkservices.googleapis.com/v1beta1/${parentPath}/authzExtensions?authzExtensionId=${encodeURIComponent(
          iapExtId
        )}`,
        projectId,
        body: {
          service: 'iap.googleapis.com',
          failOpen: true,
          timeout: '10s',
          loadBalancingScheme: 'INTERNAL_MANAGED',
          metadata: {
            iapPolicyVersion: 'V2',
            iamEnforcementMode: 'ENFORCED',
          },
        },
      });
      if (createIapExt.statusCode >= 200 && createIapExt.statusCode < 300 && createIapExt.data?.name) {
        await this.pollOperation(
          'https://networkservices.googleapis.com/v1beta1',
          createIapExt.data.name,
          projectId
        );
      }
    }

    const getIapPol = await this.requestJson({
      method: 'GET',
      url: `https://networksecurity.googleapis.com/v1beta1/${parentPath}/authzPolicies/${encodeURIComponent(
        iapPolicyId
      )}`,
      projectId,
    });
    if (getIapPol.statusCode === 404) {
      const createIapPol = await this.requestJson({
        method: 'POST',
        url: `https://networksecurity.googleapis.com/v1beta1/${parentPath}/authzPolicies?authzPolicyId=${encodeURIComponent(
          iapPolicyId
        )}`,
        projectId,
        body: {
          target: {
            resources: [gatewayResourceName],
          },
          action: 'CUSTOM',
          policyProfile: 'REQUEST_AUTHZ',
          customProvider: {
            authzExtension: {
              resources: [iapExtResource],
            },
          },
        },
      });
      if (createIapPol.statusCode >= 200 && createIapPol.statusCode < 300) {
        if (createIapPol.data?.name && !createIapPol.data?.done) {
          await this.pollOperation(
            'https://networksecurity.googleapis.com/v1beta1',
            createIapPol.data.name,
            projectId
          );
        }
        onLog?.(
          `[Governance] Attached IAP Request AuthzPolicy (${iapPolicyId}) to Gateway ${cleanGatewayId}.`,
          'system'
        );
      }
    }

    // 3C. Get or Create AI Security (Model Armor) AuthzExtension + AuthzPolicy (`CONTENT_AUTHZ`)
    const aiExtId = `${cleanGatewayId}-aisecurity-authzextension`.slice(0, 63).replace(/-+$/, '');
    const aiPolicyId = `${cleanGatewayId}-aisecurity-authzpolicy`.slice(0, 63).replace(/-+$/, '');
    const aiExtResource = `projects/${projectId}/locations/${region}/authzExtensions/${aiExtId}`;
    const fullTemplatePath = `projects/${projectId}/locations/${region}/templates/${cleanTemplateId}`;

    const getAiExt = await this.requestJson({
      method: 'GET',
      url: `https://networkservices.googleapis.com/v1beta1/${parentPath}/authzExtensions/${encodeURIComponent(
        aiExtId
      )}`,
      projectId,
    });
    if (getAiExt.statusCode === 404) {
      const createAiExt = await this.requestJson({
        method: 'POST',
        url: `https://networkservices.googleapis.com/v1beta1/${parentPath}/authzExtensions?authzExtensionId=${encodeURIComponent(
          aiExtId
        )}`,
        projectId,
        body: {
          service: `modelarmor.${region}.rep.googleapis.com`,
          failOpen: true,
          timeout: '10s',
          loadBalancingScheme: 'INTERNAL_MANAGED',
          forwardHeaders: ['content-type'],
          metadata: {
            model_armor_settings: JSON.stringify([
              {
                response_template_id: fullTemplatePath,
                request_template_id: fullTemplatePath,
              },
            ]),
          },
        },
      });
      if (createAiExt.statusCode >= 200 && createAiExt.statusCode < 300 && createAiExt.data?.name) {
        await this.pollOperation(
          'https://networkservices.googleapis.com/v1beta1',
          createAiExt.data.name,
          projectId
        );
      }
    }

    const getAiPol = await this.requestJson({
      method: 'GET',
      url: `https://networksecurity.googleapis.com/v1beta1/${parentPath}/authzPolicies/${encodeURIComponent(
        aiPolicyId
      )}`,
      projectId,
    });
    if (getAiPol.statusCode === 404) {
      const createAiPol = await this.requestJson({
        method: 'POST',
        url: `https://networksecurity.googleapis.com/v1beta1/${parentPath}/authzPolicies?authzPolicyId=${encodeURIComponent(
          aiPolicyId
        )}`,
        projectId,
        body: {
          target: {
            resources: [gatewayResourceName],
          },
          action: 'CUSTOM',
          policyProfile: 'CONTENT_AUTHZ',
          customProvider: {
            authzExtension: {
              resources: [aiExtResource],
            },
          },
          httpRules: [
            {
              to: {
                operations: [
                  {
                    paths: [{ prefix: '/' }],
                  },
                ],
              },
              when:
                "request.headers['content-type'] == 'application/json' || request.headers['content-type'].startsWith('text/')",
            },
          ],
        },
      });
      if (createAiPol.statusCode >= 200 && createAiPol.statusCode < 300) {
        if (createAiPol.data?.name && !createAiPol.data?.done) {
          await this.pollOperation(
            'https://networksecurity.googleapis.com/v1beta1',
            createAiPol.data.name,
            projectId
          );
        }
        onLog?.(
          `[Governance] Attached Model Armor AI Security AuthzPolicy (${aiPolicyId}) to Gateway ${cleanGatewayId}.`,
          'system'
        );
      }
    }
  }

  /**
   * Patches `spec.deploymentSpec.env` on a deployed Vertex AI Agent Engine (`ReasoningEngine`)
   * via OnePlatform REST API (`v1beta1`) to ensure OpenTelemetry tracing and Security dashboard
   * telemetry environment variables are enabled:
   * - `GOOGLE_CLOUD_AGENT_ENGINE_ENABLE_TELEMETRY = "true"`
   * - `OTEL_SEMCONV_STABILITY_OPT_IN = "gen_ai_latest_experimental"`
   * - `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT = "EVENT_ONLY"`
   *
   * Why this is critical:
   * Cloud Console (`telemetry_status_utils.ts` & `observability_tab.ts`) inspects
   * `agentEngine.spec.deploymentSpec.env` for `GOOGLE_CLOUD_AGENT_ENGINE_ENABLE_TELEMETRY`.
   * If missing, the Traces, Observability, and Security tabs display the error banner:
   * "Outdated dependencies: Ensure your agent is using google-cloud-aiplatform >= v1.126.1 and google-adk >= v1.18.0".
   */
  public async enableAgentEngineTelemetry(options: {
    projectId: string;
    region: string;
    deployedResourceUri: string;
    onLog?: (text: string, stream: 'stdout' | 'stderr' | 'system') => void;
  }): Promise<boolean> {
    const { projectId, region, deployedResourceUri, onLog } = options;

    // Extract canonical `projects/{project}/locations/{region}/reasoningEngines/{id}` resource path
    const match = deployedResourceUri.match(
      /projects\/[^/\s]+\/locations\/[^/\s]+\/reasoningEngines\/[0-9a-zA-Z_-]+/
    );
    const engineId = deployedResourceUri.split('/').pop() || '';
    const resourcePath = match
      ? match[0]
      : `projects/${projectId}/locations/${region}/reasoningEngines/${engineId}`;

    const apiBase = `https://${region}-aiplatform.googleapis.com/v1beta1`;
    const resourceUrl = `${apiBase}/${resourcePath}`;

    const getRes = await this.requestJson({
      method: 'GET',
      url: resourceUrl,
      projectId,
    });

    const existingEnv: Array<{ name: string; value: string }> = Array.isArray(
      getRes.data?.spec?.deploymentSpec?.env
    )
      ? getRes.data.spec.deploymentSpec.env
          .filter((e: any) => e && typeof e.name === 'string')
          .map((e: any) => ({ name: String(e.name), value: String(e.value ?? '') }))
      : [];

    const envMap = new Map<string, string>();
    for (const item of existingEnv) {
      envMap.set(item.name, item.value);
    }

    const requiredTelemetryVars: Record<string, string> = {
      GOOGLE_GENAI_USE_VERTEXAI: envMap.get('GOOGLE_GENAI_USE_VERTEXAI') || '1',
      GOOGLE_CLOUD_LOCATION: envMap.get('GOOGLE_CLOUD_LOCATION') || 'global',
      GOOGLE_CLOUD_AGENT_ENGINE_ENABLE_TELEMETRY: 'true',
      OTEL_SEMCONV_STABILITY_OPT_IN: 'gen_ai_latest_experimental',
      OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT:
        envMap.get('OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT') || 'EVENT_ONLY',
      ADK_CAPTURE_MESSAGE_CONTENT_IN_SPANS: 'true',
    };

    const alreadyConfigured =
      getRes.statusCode >= 200 &&
      getRes.statusCode < 300 &&
      envMap.get('GOOGLE_CLOUD_AGENT_ENGINE_ENABLE_TELEMETRY') === 'true' &&
      envMap.get('OTEL_SEMCONV_STABILITY_OPT_IN') === 'gen_ai_latest_experimental' &&
      Boolean(envMap.get('OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT')) &&
      envMap.get('ADK_CAPTURE_MESSAGE_CONTENT_IN_SPANS') === 'true';

    if (alreadyConfigured) {
      onLog?.(
        `[Governance] Verified Agent Engine OpenTelemetry Tracing & Security Telemetry is active (${resourcePath}).`,
        'system'
      );
      return true;
    }

    for (const [key, val] of Object.entries(requiredTelemetryVars)) {
      envMap.set(key, val);
    }

    const mergedEnv = Array.from(envMap.entries()).map(([name, value]) => ({ name, value }));

    const patchRes = await this.requestJson({
      method: 'PATCH',
      url: `${resourceUrl}?updateMask=spec.deploymentSpec.env`,
      projectId,
      body: {
        spec: {
          deploymentSpec: {
            env: mergedEnv,
          },
        },
      },
    });

    if (patchRes.statusCode >= 200 && patchRes.statusCode < 300) {
      if (patchRes.data?.name && !patchRes.data?.done) {
        await this.pollOperation(apiBase, patchRes.data.name, projectId, 10, 1500);
      }
      onLog?.(
        `[Governance] Enabled Agent Engine OpenTelemetry Tracing & Security Telemetry (GOOGLE_CLOUD_AGENT_ENGINE_ENABLE_TELEMETRY=true).`,
        'system'
      );
      return true;
    }

    const errMsg = patchRes.data?.error?.message || `HTTP ${patchRes.statusCode}`;
    onLog?.(
      `[Governance] Note: ReasoningEngine telemetry env update returned ${errMsg}`,
      'system'
    );
    return false;
  }

  /**
   * Parses evaluation test cases from `eval_dataset.jsonl` in `targetDirectory`
   * (or falls back to extracting test scenarios from `tester` trigger nodes in `document`).
   */
  public parseEvalDatasetRecords(
    targetDirectory?: string,
    document?: any
  ): EvalDatasetTestCase[] {
    const records: EvalDatasetTestCase[] = [];

    if (targetDirectory) {
      const jsonlPath = path.join(path.resolve(targetDirectory), 'eval_dataset.jsonl');
      if (fs.existsSync(jsonlPath)) {
        try {
          const raw = fs.readFileSync(jsonlPath, 'utf8');
          const lines = raw.split(/\r?\n/);
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            try {
              const parsed = JSON.parse(line);
              if (!parsed || typeof parsed !== 'object') continue;
              const startingPrompt = String(
                parsed.startingPrompt ||
                  parsed.starting_prompt ||
                  parsed.prompt ||
                  parsed.query ||
                  parsed.input ||
                  parsed?.prompt?.userScenario?.startingPrompt ||
                  parsed?.prompt?.text ||
                  ''
              ).trim();
              if (!startingPrompt) continue;

              const reference = String(
                parsed.reference ||
                  parsed.expected_output ||
                  parsed.expectedOutput ||
                  parsed?.goldenResponse?.text ||
                  ''
              ).trim();

              const conversationPlan = String(
                parsed.conversationPlan ||
                  parsed.conversation_plan ||
                  parsed?.prompt?.userScenario?.conversationPlan ||
                  (reference
                    ? `Verify the agent responds accurately: ${reference}`
                    : 'Respond accurately and helpfully to the user prompt.')
              ).trim();

              const testCaseTitle = String(
                parsed.testCaseTitle ||
                  parsed.test_case_title ||
                  parsed.title ||
                  parsed.name ||
                  `Test Case #${records.length + 1}`
              ).trim();

              records.push({
                testCaseTitle,
                startingPrompt,
                conversationPlan,
                ...(reference ? { reference } : {}),
              });
            } catch {
              // Ignore malformed JSONL lines
            }
          }
        } catch {
          // Ignore file read errors
        }
      }
    }

    // Fallback: inspect `.agent` workflow document for `tester` trigger node scenarios if JSONL was empty/missing
    if (records.length === 0 && document && Array.isArray(document.nodes)) {
      for (const node of document.nodes) {
        const data = node?.data || {};
        const config = data?.config || {};
        const isTester =
          node?.type === 'triggerNode' &&
          (data.triggerType === 'tester' ||
            data.triggerKind === 'tester' ||
            config.triggerType === 'tester' ||
            Array.isArray(config.testScenarios) ||
            Array.isArray(data.testScenarios));
        if (!isTester) continue;

        const scenarios = Array.isArray(config.testScenarios)
          ? config.testScenarios
          : Array.isArray(data.testScenarios)
          ? data.testScenarios
          : [];

        for (const sc of scenarios) {
          const prompt = String(sc?.prompt || sc?.input || '').trim();
          if (!prompt) continue;
          const expected = String(sc?.expectedOutput || sc?.reference || '').trim();
          records.push({
            testCaseTitle: String(sc?.name || sc?.title || `Test Case #${records.length + 1}`).trim(),
            startingPrompt: prompt,
            conversationPlan: expected
              ? `Verify the agent responds accurately: ${expected}`
              : 'Respond accurately and helpfully to the user prompt.',
            ...(expected ? { reference: expected } : {}),
          });
        }
      }
    }

    return records;
  }

  /**
   * Registers the deployed Agent Engine or Cloud Run workload/service in Google Cloud App Hub
   * (`apphub.googleapis.com/v1`) so the Cloud Console **Agent Registry -> Topology** tab shows
   * the node as a registered application workload/service instead of displaying:
   * "This service or workload is not registered. Register it to gain a unified view of your application's performance and stability."
   */
  public async registerAgentInAppHub(options: {
    projectId: string;
    region: string;
    cleanAgentId: string;
    displayName: string;
    deployedResourceUri: string;
    serviceUrl?: string;
    onLog?: (text: string, stream: 'stdout' | 'stderr' | 'system') => void;
  }): Promise<{
    appHubApplicationResource?: string;
    appHubWorkloadResource?: string;
  }> {
    const {
      projectId,
      region,
      cleanAgentId,
      displayName,
      deployedResourceUri,
      onLog,
    } = options;

    const apiBase = 'https://apphub.googleapis.com/v1';
    const parentPath = `projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(region)}`;
    const baseSlug = cleanAgentId.replace(/^[^a-z]+/, 'a') || 'adk-agent';
    const appId = `agent-platform-${region}`
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .slice(0, 63)
      .replace(/^-+|-+$/g, '');
    const workloadId = baseSlug.slice(0, 63).replace(/-+$/, '');
    const agentEngineId = deployedResourceUri.includes('/reasoningEngines/')
      ? deployedResourceUri.split('/reasoningEngines/').pop()?.split('/')[0] || cleanAgentId
      : cleanAgentId;

    let appHubApplicationResource = `projects/${projectId}/locations/${region}/applications/${appId}`;
    let appHubWorkloadResource: string | undefined;

    // 1. Get or create the regional App Hub Application (`projects/{project}/locations/{region}/applications/{appId}`)
    const getAppRes = await this.requestJson({
      method: 'GET',
      url: `${apiBase}/${parentPath}/applications/${encodeURIComponent(appId)}`,
      projectId,
    });

    if (getAppRes.statusCode >= 200 && getAppRes.statusCode < 300 && getAppRes.data?.name) {
      appHubApplicationResource = getAppRes.data.name;
    } else if (getAppRes.statusCode === 404) {
      const createAppRes = await this.requestJson({
        method: 'POST',
        url: `${apiBase}/${parentPath}/applications?applicationId=${encodeURIComponent(appId)}`,
        projectId,
        body: {
          displayName: `Agent Platform (${region})`.slice(0, 63),
          description: `Unified App Hub Application for Google Cloud Agent Platform workloads in ${region}.`,
          scope: {
            type: 'REGIONAL',
          },
          attributes: {
            criticality: { type: 'HIGH' },
            environment: { type: 'PRODUCTION' },
          },
        },
      });

      if (createAppRes.statusCode >= 200 && createAppRes.statusCode < 300) {
        if (
          createAppRes.data?.name &&
          !createAppRes.data?.done &&
          String(createAppRes.data.name).includes('/operations/')
        ) {
          const opRes = await this.pollOperation(apiBase, createAppRes.data.name, projectId);
          if (opRes.data?.response?.name) {
            appHubApplicationResource = opRes.data.response.name;
          }
        } else if (createAppRes.data?.response?.name) {
          appHubApplicationResource = createAppRes.data.response.name;
        } else if (
          typeof createAppRes.data?.name === 'string' &&
          createAppRes.data.name.startsWith('projects/') &&
          !createAppRes.data.name.includes('/operations/')
        ) {
          appHubApplicationResource = createAppRes.data.name;
        }
        onLog?.(
          `[Governance] Created Google Cloud App Hub Application (${appHubApplicationResource}) for Agent Topology.`,
          'system'
        );
      }
    }

    // 2. Discover the underlying workload or service in App Hub (`discoveredWorkloads` / `discoveredServices`)
    const cleanResourcePath = deployedResourceUri.replace(/^\/+/, '');
    const candidateCaisUris = deployedResourceUri.includes('/reasoningEngines/')
      ? [
          `//aiplatform.googleapis.com/${cleanResourcePath}`,
          `//${region}-aiplatform.googleapis.com/${cleanResourcePath}`,
        ]
      : [
          `//run.googleapis.com/projects/${projectId}/locations/${region}/services/${cleanAgentId}`,
        ];

    let discoveredWorkloadName: string | undefined;

    for (const caisUri of candidateCaisUris) {
      const lookupRes = await this.requestJson({
        method: 'GET',
        url: `${apiBase}/${parentPath}/discoveredWorkloads:lookup?uri=${encodeURIComponent(caisUri)}`,
        projectId,
      });
      if (
        lookupRes.statusCode >= 200 &&
        lookupRes.statusCode < 300 &&
        lookupRes.data?.discoveredWorkload?.name
      ) {
        discoveredWorkloadName = lookupRes.data.discoveredWorkload.name;
        break;
      }
    }

    if (!discoveredWorkloadName) {
      const listWorkloadsRes = await this.requestJson({
        method: 'GET',
        url: `${apiBase}/${parentPath}/discoveredWorkloads`,
        projectId,
      });
      if (
        listWorkloadsRes.statusCode >= 200 &&
        listWorkloadsRes.statusCode < 300 &&
        Array.isArray(listWorkloadsRes.data?.discoveredWorkloads)
      ) {
        const match = listWorkloadsRes.data.discoveredWorkloads.find((dw: any) => {
          const refUri = String(dw?.workloadReference?.uri || '');
          return (
            refUri.includes(agentEngineId) ||
            refUri.includes(cleanAgentId) ||
            String(dw?.name || '').includes(cleanAgentId)
          );
        });
        if (match?.name) {
          discoveredWorkloadName = match.name;
        }
      }
    }

    // 3. Register DiscoveredWorkload into the App Hub Application (`applications/{appId}/workloads`)
    if (discoveredWorkloadName) {
      const createWorkloadRes = await this.requestJson({
        method: 'POST',
        url: `${apiBase}/${parentPath}/applications/${encodeURIComponent(appId)}/workloads?workloadId=${encodeURIComponent(
          workloadId
        )}`,
        projectId,
        body: {
          displayName: (displayName || cleanAgentId).slice(0, 63),
          description: `Registered Agent workload for ${displayName || cleanAgentId}`,
          discoveredWorkload: discoveredWorkloadName,
          attributes: {
            criticality: { type: 'HIGH' },
            environment: { type: 'PRODUCTION' },
          },
        },
      });

      if (createWorkloadRes.statusCode >= 200 && createWorkloadRes.statusCode < 300) {
        if (
          createWorkloadRes.data?.name &&
          !createWorkloadRes.data?.done &&
          String(createWorkloadRes.data.name).includes('/operations/')
        ) {
          const opRes = await this.pollOperation(apiBase, createWorkloadRes.data.name, projectId);
          appHubWorkloadResource =
            opRes.data?.response?.name ||
            `${appHubApplicationResource}/workloads/${workloadId}`;
        } else if (createWorkloadRes.data?.response?.name) {
          appHubWorkloadResource = createWorkloadRes.data.response.name;
        } else if (
          typeof createWorkloadRes.data?.name === 'string' &&
          createWorkloadRes.data.name.startsWith('projects/') &&
          !createWorkloadRes.data.name.includes('/operations/')
        ) {
          appHubWorkloadResource = createWorkloadRes.data.name;
        } else {
          appHubWorkloadResource = `${appHubApplicationResource}/workloads/${workloadId}`;
        }
        onLog?.(
          `[Governance] Registered agent workload in App Hub Topology (${appHubWorkloadResource}).`,
          'system'
        );
      } else if (createWorkloadRes.statusCode === 409) {
        appHubWorkloadResource = `${appHubApplicationResource}/workloads/${workloadId}`;
        onLog?.(
          `[Governance] Agent workload already registered in App Hub Topology (${appHubWorkloadResource}).`,
          'system'
        );
      }
    }

    // 4. Also check for any matching DiscoveredService (`discoveredServices`) and register it
    let discoveredServiceName: string | undefined;
    for (const caisUri of candidateCaisUris) {
      const lookupSvcRes = await this.requestJson({
        method: 'GET',
        url: `${apiBase}/${parentPath}/discoveredServices:lookup?uri=${encodeURIComponent(caisUri)}`,
        projectId,
      });
      if (
        lookupSvcRes.statusCode >= 200 &&
        lookupSvcRes.statusCode < 300 &&
        lookupSvcRes.data?.discoveredService?.name
      ) {
        discoveredServiceName = lookupSvcRes.data.discoveredService.name;
        break;
      }
    }

    if (!discoveredServiceName) {
      const listServicesRes = await this.requestJson({
        method: 'GET',
        url: `${apiBase}/${parentPath}/discoveredServices`,
        projectId,
      });
      if (
        listServicesRes.statusCode >= 200 &&
        listServicesRes.statusCode < 300 &&
        Array.isArray(listServicesRes.data?.discoveredServices)
      ) {
        const matchSvc = listServicesRes.data.discoveredServices.find((ds: any) => {
          const refUri = String(ds?.serviceReference?.uri || '');
          return (
            refUri.includes(agentEngineId) ||
            refUri.includes(cleanAgentId) ||
            String(ds?.name || '').includes(cleanAgentId)
          );
        });
        if (matchSvc?.name) {
          discoveredServiceName = matchSvc.name;
        }
      }
    }

    if (discoveredServiceName) {
      const serviceId = `${workloadId}-svc`.slice(0, 63).replace(/-+$/, '');
      const createSvcRes = await this.requestJson({
        method: 'POST',
        url: `${apiBase}/${parentPath}/applications/${encodeURIComponent(appId)}/services?serviceId=${encodeURIComponent(
          serviceId
        )}`,
        projectId,
        body: {
          displayName: `${displayName || cleanAgentId} Service`.slice(0, 63),
          description: `Registered Agent service for ${displayName || cleanAgentId}`,
          discoveredService: discoveredServiceName,
          attributes: {
            criticality: { type: 'HIGH' },
            environment: { type: 'PRODUCTION' },
          },
        },
      });
      if (createSvcRes.statusCode >= 200 && createSvcRes.statusCode < 300) {
        onLog?.(
          `[Governance] Registered agent service in App Hub Topology (${appHubApplicationResource}/services/${serviceId}).`,
          'system'
        );
      }
    }

    return {
      appHubApplicationResource,
      appHubWorkloadResource,
    };
  }

  /**
   * Builds the `GoogleCloudAiplatformV1beta1AgentConfig` map from the `.agent` workflow document
   * (or constructs a default root agent config) so the Cloud Console Evaluation page can run
   * session simulation evaluations directly without prompting for raw JSON input.
   */
  public buildEvaluationAgentConfigs(
    cleanAgentId: string,
    displayName: string,
    document?: any
  ): { rootAgentId: string; agentConfigs: Record<string, any> } {
    const sanitizeIdentifier = (raw: string): string => {
      const cleaned = raw
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/^_+/, '')
        .replace(/_+$/, '');
      if (!cleaned) return 'root_agent';
      return /^[a-z]/.test(cleaned) ? cleaned : `agent_${cleaned}`;
    };

    const defaultRootId = sanitizeIdentifier(cleanAgentId);
    const agentConfigs: Record<string, any> = {};

    const nodes: any[] = Array.isArray(document?.nodes) ? document.nodes : [];
    const edges: any[] = Array.isArray(document?.edges) ? document.edges : [];
    const agentNodes = nodes.filter(
      (n) =>
        n?.type === 'agentNode' ||
        n?.type === 'agent' ||
        n?.data?.nodeType === 'agent'
    );

    if (agentNodes.length === 0) {
      agentConfigs[defaultRootId] = {
        agentId: defaultRootId,
        agentType: 'LlmAgent',
        description: `${displayName || cleanAgentId} Agent`,
        instruction: `You are ${displayName || cleanAgentId}. Respond accurately and helpfully to user requests.`,
      };
      return { rootAgentId: defaultRootId, agentConfigs };
    }

    const nodeIdToAgentId = new Map<string, string>();
    for (const node of agentNodes) {
      const data = node?.data || {};
      const config = data?.config || {};
      const rawName = String(data.name || config.name || data.label || node.id || defaultRootId);
      nodeIdToAgentId.set(String(node.id), sanitizeIdentifier(rawName));
    }

    const incomingAgentCount = new Map<string, number>();
    for (const node of agentNodes) {
      incomingAgentCount.set(String(node.id), 0);
    }
    for (const edge of edges) {
      if (nodeIdToAgentId.has(String(edge?.source)) && nodeIdToAgentId.has(String(edge?.target))) {
        incomingAgentCount.set(
          String(edge.target),
          (incomingAgentCount.get(String(edge.target)) || 0) + 1
        );
      }
    }

    let rootAgentId = defaultRootId;
    for (const node of agentNodes) {
      const nodeId = String(node.id);
      const data = node?.data || {};
      const config = data?.config || {};
      const agentId = nodeIdToAgentId.get(nodeId) || defaultRootId;

      if (data.isStartNode || config.isStartNode || incomingAgentCount.get(nodeId) === 0) {
        if (rootAgentId === defaultRootId) {
          rootAgentId = agentId;
        }
      }

      const subAgentIds: string[] = [];
      for (const edge of edges) {
        if (String(edge?.source) === nodeId && nodeIdToAgentId.has(String(edge?.target))) {
          const childAgentId = nodeIdToAgentId.get(String(edge.target))!;
          if (!subAgentIds.includes(childAgentId)) {
            subAgentIds.push(childAgentId);
          }
        }
      }

      const pattern = String(data.subAgentPattern || config.subAgentPattern || '').toLowerCase();
      let agentType = 'LlmAgent';
      if (subAgentIds.length > 0) {
        if (pattern.includes('sequential') || pattern.includes('iterative')) {
          agentType = 'SequentialAgent';
        } else if (pattern.includes('parallel') || pattern.includes('broadcast')) {
          agentType = 'ParallelAgent';
        } else if (pattern.includes('loop') || pattern.includes('review')) {
          agentType = 'LoopAgent';
        }
      }

      const instruction = String(
        data.systemPrompt ||
          config.systemPrompt ||
          data.instruction ||
          config.instruction ||
          `You are ${data.label || displayName || agentId}.`
      ).trim();
      const description = String(
        data.description || config.description || data.label || displayName || agentId
      ).trim();

      agentConfigs[agentId] = {
        agentId,
        agentType,
        description,
        instruction,
        ...(subAgentIds.length > 0 ? { subAgents: subAgentIds } : {}),
      };
    }

    if (!agentConfigs[rootAgentId]) {
      rootAgentId = Object.keys(agentConfigs)[0] || defaultRootId;
    }

    return { rootAgentId, agentConfigs };
  }

  /**
   * Registers the test scenarios from `eval_dataset.jsonl` into Vertex AI Evaluation Management Service
   * (`v1beta1/projects/{project}/locations/{region}/evaluationItems`, `evaluationSets`, `evaluationExperiments`, and `evaluationRuns`)
   * with the exact Cloud Console labels so they appear under the Agent Engine's **Evaluation -> Experiments** tab
   * and can be viewed and executed directly in the Cloud Console:
   * - `vertex-ai-evaluation-set-name`: `evaluationSet.name`
   * - `vertex-ai-evaluation-agent-engine-id`: `agentEngineId`
   * - `vertex-ai-evaluation-agent-engine-location`: `region`
   * (Note: For Agent Engine deployments, `vertex-ai-evaluation-agent-resource-id` MUST NOT be set because
   * `agent_evaluation_experiment_table.ts` and `details_resolver.ts` treat `vertex-ai-evaluation-agent-resource-id`
   * as a GKE/Registry-only agent and disable Agent Engine session simulation.)
   */
  public async registerEvaluationDatasetAndExperiment(options: {
    projectId: string;
    region: string;
    cleanAgentId: string;
    displayName: string;
    deployedResourceUri: string;
    stagingBucket?: string;
    document?: any;
    testCases: EvalDatasetTestCase[];
    onLog?: (text: string, stream: 'stdout' | 'stderr' | 'system') => void;
  }): Promise<{
    evaluationSetResource?: string;
    evaluationExperimentResource?: string;
    evaluationRunResource?: string;
    evaluationItemsCount?: number;
  }> {
    const {
      projectId,
      region,
      cleanAgentId,
      displayName,
      deployedResourceUri,
      stagingBucket,
      document,
      testCases,
      onLog,
    } = options;

    if (!testCases || testCases.length === 0) {
      return {};
    }

    const apiBase = `https://${region}-aiplatform.googleapis.com/v1beta1`;
    const parentPath = `projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(region)}`;
    const isAgentEngine = deployedResourceUri.includes('/reasoningEngines/');
    const agentEngineId = isAgentEngine
      ? deployedResourceUri.split('/reasoningEngines/').pop()?.split('/')[0] || cleanAgentId
      : cleanAgentId;

    // 1. Resolve or create a GCS bucket for storing EvaluationItem payloads (`CustomDataFetchers.java` requires `gcsUri` for Console display)
    let resolvedBucket = stagingBucket ? stagingBucket.replace(/^gs:\/\//, '').split('/')[0] : '';
    if (!resolvedBucket) {
      const bucketsRes = await this.requestJson({
        method: 'GET',
        url: `https://storage.googleapis.com/storage/v1/b?project=${encodeURIComponent(projectId)}&maxResults=20`,
        projectId,
      });
      if (bucketsRes.statusCode >= 200 && bucketsRes.statusCode < 300 && Array.isArray(bucketsRes.data?.items)) {
        const bucketNames: string[] = bucketsRes.data.items
          .map((b: any) => String(b?.name || ''))
          .filter(Boolean);
        resolvedBucket =
          bucketNames.find((n) => n.includes('staging') || n.includes('agent') || n.includes('vertex')) ||
          bucketNames.find((n) => n.includes('cloudbuild')) ||
          bucketNames[0] ||
          '';
      }
    }

    if (!resolvedBucket) {
      const candidateBucket = `${projectId}-agent-eval-${region}`
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, '-')
        .slice(0, 63)
        .replace(/^-+|-+$/g, '');
      const createBucketRes = await this.requestJson({
        method: 'POST',
        url: `https://storage.googleapis.com/storage/v1/b?project=${encodeURIComponent(projectId)}`,
        projectId,
        body: {
          name: candidateBucket,
          location: region,
        },
      });
      if (
        (createBucketRes.statusCode >= 200 && createBucketRes.statusCode < 300) ||
        createBucketRes.statusCode === 409
      ) {
        resolvedBucket = candidateBucket;
      }
    }

    // 2. Create EvaluationItems (`POST .../v1beta1/projects/{project}/locations/{region}/evaluationItems`)
    // CRITICAL: `EvaluationPrompt.data` is a protobuf `oneof` (`text` vs `userScenario`).
    // Only set `userScenario` so `CustomDataFetchers.getGcsEvaluationRequest` (`JsonFormat.parser()`) succeeds!
    const createdItemNames: string[] = [];
    for (let i = 0; i < testCases.length; i++) {
      const tc = testCases[i];
      const evalRequestPayload: Record<string, any> = {
        prompt: {
          userScenario: {
            startingPrompt: tc.startingPrompt,
            conversationPlan: tc.conversationPlan,
          },
        },
      };
      if (tc.reference) {
        evalRequestPayload.goldenResponse = {
          text: tc.reference,
        };
      }

      let itemName: string | undefined;

      // 2A. Upload the EvaluationRequest JSON to GCS and create with `gcsUri` (required by Cloud Console GraphQL `getGcsEvaluationRequest`)
      if (resolvedBucket) {
        const objectPath = `evaluation-items/${cleanAgentId}/item-${i + 1}.json`;
        const uploadRes = await this.requestJson({
          method: 'POST',
          url: `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(
            resolvedBucket
          )}/o?uploadType=media&name=${encodeURIComponent(objectPath)}`,
          projectId,
          body: evalRequestPayload,
        });

        if (uploadRes.statusCode >= 200 && uploadRes.statusCode < 300) {
          const gcsUri = `gs://${resolvedBucket}/${objectPath}`;
          const gcsItemRes = await this.requestJson({
            method: 'POST',
            url: `${apiBase}/${parentPath}/evaluationItems`,
            projectId,
            body: {
              displayName: tc.testCaseTitle.slice(0, 63),
              evaluationItemType: 'REQUEST',
              gcsUri,
              metadata: {
                testCaseTitle: tc.testCaseTitle,
              },
            },
          });

          if (gcsItemRes.statusCode >= 200 && gcsItemRes.statusCode < 300 && gcsItemRes.data?.name) {
            itemName = gcsItemRes.data.name;
          }
        }
      }

      // 2B. Fallback to inline `evaluationRequest` if GCS bucket upload was skipped or `gcsUri` creation failed
      if (!itemName) {
        const inlineItemRes = await this.requestJson({
          method: 'POST',
          url: `${apiBase}/${parentPath}/evaluationItems`,
          projectId,
          body: {
            displayName: tc.testCaseTitle.slice(0, 63),
            evaluationItemType: 'REQUEST',
            evaluationRequest: evalRequestPayload,
            metadata: {
              testCaseTitle: tc.testCaseTitle,
            },
          },
        });

        if (inlineItemRes.statusCode >= 200 && inlineItemRes.statusCode < 300 && inlineItemRes.data?.name) {
          itemName = inlineItemRes.data.name;
        }
      }

      if (itemName) {
        createdItemNames.push(itemName);
      }
    }

    if (createdItemNames.length === 0) {
      onLog?.(
        `[Governance] Note: Could not register EvaluationItems in ${region} (verify Vertex AI Evaluation API availability in region).`,
        'system'
      );
      return {};
    }

    // 3. Create EvaluationSet (`POST .../v1beta1/projects/{project}/locations/{region}/evaluationSets`)
    const createSetRes = await this.requestJson({
      method: 'POST',
      url: `${apiBase}/${parentPath}/evaluationSets`,
      projectId,
      body: {
        displayName: `${displayName} Evaluation Set`.slice(0, 63),
        evaluationItems: createdItemNames,
      },
    });

    if (createSetRes.statusCode < 200 || createSetRes.statusCode >= 300) {
      const errMsg = createSetRes.data?.error?.message || `HTTP ${createSetRes.statusCode}`;
      onLog?.(
        `[Governance] Note: CreateEvaluationSet returned ${errMsg}`,
        'system'
      );
      return { evaluationItemsCount: createdItemNames.length };
    }

    const evaluationSetResource: string =
      createSetRes.data?.name ||
      `projects/${projectId}/locations/${region}/evaluationSets/${cleanAgentId}-eval-set`;

    // 3B. Patch `EvaluationSet` with `agentConfigs` (`UpdateEvaluationSetApiHandler.java` persists `agent_configs` on PATCH)
    const { rootAgentId, agentConfigs } = this.buildEvaluationAgentConfigs(
      cleanAgentId,
      displayName,
      document
    );
    await this.requestJson({
      method: 'PATCH',
      url: `${apiBase}/${evaluationSetResource.replace(/^\/+/, '')}?updateMask=evaluation_items,agent_configs`,
      projectId,
      body: {
        name: evaluationSetResource,
        evaluationItems: createdItemNames,
        agentConfigs,
      },
    });

    // 4. Create or Update EvaluationExperiment (`evaluationExperiments`) with Cloud Console labels
    // CRITICAL: When deployed to Agent Engine (`isAgentEngine === true`), do NOT set `vertex-ai-evaluation-agent-resource-id`
    // because the Console checks `vertex-ai-evaluation-agent-resource-id` first and treats it as a non-Agent-Engine resource.
    const experimentLabels: Record<string, string> = isAgentEngine
      ? {
          'vertex-ai-evaluation-set-name': evaluationSetResource,
          'vertex-ai-evaluation-agent-engine-id': agentEngineId,
          'vertex-ai-evaluation-agent-engine-location': region,
        }
      : {
          'vertex-ai-evaluation-set-name': evaluationSetResource,
          'vertex-ai-evaluation-agent-engine-location': region,
          'vertex-ai-evaluation-agent-resource-id': cleanAgentId,
        };

    const filterParam = encodeURIComponent(
      `labels:"vertex-ai-evaluation-agent-engine-id#${agentEngineId}"`
    );
    const listExpRes = await this.requestJson({
      method: 'GET',
      url: `${apiBase}/${parentPath}/evaluationExperiments?filter=${filterParam}`,
      projectId,
    });

    const existingExperiments: any[] = Array.isArray(listExpRes.data?.evaluationExperiments)
      ? listExpRes.data.evaluationExperiments
      : [];

    let evaluationExperimentResource: string | undefined;

    if (existingExperiments.length > 0 && existingExperiments[0]?.name) {
      const existingExp = existingExperiments[0];
      const existingName: string = existingExp.name;
      const mergedLabels: Record<string, string> = {
        ...(existingExp.labels || {}),
        ...experimentLabels,
      };
      if (isAgentEngine) {
        delete mergedLabels['vertex-ai-evaluation-agent-resource-id'];
      }
      const patchExpRes = await this.requestJson({
        method: 'PATCH',
        url: `${apiBase}/${existingName.replace(/^\/+/, '')}?updateMask=labels,display_name`,
        projectId,
        body: {
          name: existingName,
          displayName: `${displayName} Evaluation`.slice(0, 63),
          labels: mergedLabels,
        },
      });

      if (patchExpRes.statusCode >= 200 && patchExpRes.statusCode < 300) {
        evaluationExperimentResource = patchExpRes.data?.name || existingName;
        onLog?.(
          `[Governance] Updated Vertex AI Evaluation Experiment (${evaluationExperimentResource}) with ${createdItemNames.length} test scenario(s) from eval_dataset.jsonl.`,
          'system'
        );
      }
    }

    if (!evaluationExperimentResource) {
      const createExpRes = await this.requestJson({
        method: 'POST',
        url: `${apiBase}/${parentPath}/evaluationExperiments`,
        projectId,
        body: {
          displayName: `${displayName} Evaluation`.slice(0, 63),
          evaluationRuns: [],
          labels: experimentLabels,
        },
      });

      if (createExpRes.statusCode >= 200 && createExpRes.statusCode < 300) {
        if (createExpRes.data?.name && !createExpRes.data?.done && createExpRes.data?.name.includes('/operations/')) {
          const opRes = await this.pollOperation(apiBase, createExpRes.data.name, projectId);
          evaluationExperimentResource = opRes.data?.response?.name || createExpRes.data.name;
        } else {
          evaluationExperimentResource =
            createExpRes.data?.name ||
            `projects/${projectId}/locations/${region}/evaluationExperiments/${cleanAgentId}-eval-exp`;
        }
        onLog?.(
          `[Governance] Registered ${createdItemNames.length} test scenario(s) from eval_dataset.jsonl into Vertex AI Evaluation Experiment (${evaluationExperimentResource}).`,
          'system'
        );
      } else {
        const errMsg = createExpRes.data?.error?.message || `HTTP ${createExpRes.statusCode}`;
        onLog?.(
          `[Governance] Note: CreateEvaluationExperiment returned ${errMsg}`,
          'system'
        );
      }
    }

    // 5. Trigger an initial `EvaluationRun` (`POST .../v1beta1/{parent}/evaluationRuns`) linked to the experiment
    // so the Console immediately displays the configured evaluators, GCS output directory, and run status.
    let evaluationRunResource: string | undefined;
    if (isAgentEngine && evaluationExperimentResource && resolvedBucket) {
      const createRunRes = await this.requestJson({
        method: 'POST',
        url: `${apiBase}/${parentPath}/evaluationRuns`,
        projectId,
        body: {
          displayName: `${displayName} Evaluation Run`.slice(0, 63),
          evaluationExperiment: evaluationExperimentResource,
          dataSource: {
            evaluationSet: evaluationSetResource,
          },
          evaluationConfig: {
            metrics: [
              {
                metric: 'final_response_quality_v1',
                metricConfig: {
                  predefinedMetricSpec: {
                    metricSpecName: 'final_response_quality_v1',
                  },
                },
              },
              {
                metric: 'tool_use_quality_v1',
                metricConfig: {
                  predefinedMetricSpec: {
                    metricSpecName: 'tool_use_quality_v1',
                  },
                },
              },
              {
                metric: 'hallucination_v1',
                metricConfig: {
                  predefinedMetricSpec: {
                    metricSpecName: 'hallucination_v1',
                  },
                },
              },
            ],
            outputConfig: {
              gcsDestination: {
                outputUriPrefix: `gs://${resolvedBucket}/evaluation-runs/${cleanAgentId}`,
              },
            },
          },
          inferenceConfigs: {
            [rootAgentId]: {
              agentRunConfig: {
                agentEngine: deployedResourceUri,
                userSimulatorConfig: {
                  maxTurn: 5,
                },
              },
              agents: agentConfigs,
            },
          },
        },
      });

      if (createRunRes.statusCode >= 200 && createRunRes.statusCode < 300 && createRunRes.data?.name) {
        evaluationRunResource = createRunRes.data.name;
        onLog?.(
          `[Governance] Started initial Vertex AI Evaluation Run (${evaluationRunResource}) in Cloud Console.`,
          'system'
        );
      }
    }

    return {
      evaluationSetResource,
      evaluationExperimentResource,
      evaluationRunResource,
      evaluationItemsCount: createdItemNames.length,
    };
  }
}


