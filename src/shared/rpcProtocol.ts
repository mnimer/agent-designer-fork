/**
 * RPC Protocol Definitions for Visual Studio Code Agent Flow Builder
 * Defines bi-directional, type-safe messaging contracts between the VS Code
 * Extension Host and the Webview React SPA.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import {
  AgentWorkflowDocument,
  FrameworkTarget,
  LanguageTarget,
  ToolDefinition,
  McpAuthProviderType,
  McpOAuthConfig,
  McpSecretConfig,
  SampleWorkflowDefinition,
  EventArcCategory,
  AgentGovernanceConfig,
  ModelArmorTemplateItem,
  GeminiEnterpriseAppItem,
  ModelCatalogItem,
} from './types';
import { GeneratedFile } from './codegen/types';

// Webview -> Extension Host Commands
export type WebviewToExtensionMessage =
  | { type: 'READY' }
  | {
      type: 'DOCUMENT_UPDATED';
      payload: {
        document: AgentWorkflowDocument;
        docVersion: number;
      };
    }
  | {
      type: 'SAVE_DOCUMENT';
      payload?: {
        document?: AgentWorkflowDocument;
        docVersion?: number;
      };
    }
  | {
      type: 'GENERATE_CODE';
      payload: {
        document: AgentWorkflowDocument;
        targetFramework?: FrameworkTarget;
        targetLanguage?: LanguageTarget;
        deploymentTarget?: string;
        outputFolder?: string;
        codeGenModel?: string;
      };
    }
  | {
      type: 'CANCEL_CODE_GENERATION';
      payload?: {
        targetDirectory?: string;
      };
    }
  | {
      type: 'EXPORT_CODE';
      payload: {
        document: AgentWorkflowDocument;
        targetFramework: FrameworkTarget;
        targetLanguage: LanguageTarget;
        outputDirectory?: string;
      };
    }
  | {
      type: 'WRITE_FILES_TO_WORKSPACE';
      payload: {
        files: GeneratedFile[];
        targetDirectory?: string;
      };
    }
  | {
      type: 'RUN_TESTS';
      payload: {
        document: AgentWorkflowDocument;
        testScenarioIds?: string[];
        targetDirectory?: string;
        port?: number;
      };
    }
  | {
      type: 'CANCEL_TESTS';
      payload: {
        runId?: string;
      };
    }
  | {
      type: 'SEND_CHAT_MESSAGE';
      payload: {
        sessionId: string;
        message: string;
        streaming?: boolean;
        history?: Array<{ role: 'user' | 'assistant'; content: string }>;
        document?: AgentWorkflowDocument;
        targetDirectory?: string;
        port?: number;
        executionTarget?: 'local' | 'remote';
        deployedResourceId?: string;
      };
    }
  | {
      type: 'RESET_CHAT_SESSION';
      payload?: {
        sessionId?: string;
      };
    }
  | {
      type: 'START_LOCAL_RUNNER';
      payload: {
        document?: AgentWorkflowDocument;
        targetDirectory?: string;
        port?: number;
        envVars?: Record<string, string>;
        useLocalSqliteMemory?: boolean;
      };
    }
  | {
      type: 'STOP_LOCAL_RUNNER';
      payload?: {
        runnerId?: string;
        port?: number;
      };
    }
  | {
      type: 'REQUEST_SETTINGS';
      payload?: Record<string, never>;
    }
  | {
      type: 'UPDATE_SETTINGS';
      payload: {
        geminiApiKey?: string;
        anthropicApiKey?: string;
        openaiApiKey?: string;
        grokApiKey?: string;
        targetFramework?: FrameworkTarget;
        targetLanguage?: LanguageTarget;
      };
    }
  | {
      type: 'OPEN_SETTINGS';
    }
  | {
      type: 'DISCOVER_MCP_TOOLS';
      payload: {
        transport: 'stdio' | 'sse' | 'http';
        command?: string;
        args?: string[];
        cwd?: string;
        url?: string;
        serverUrl?: string;
        envVars?: Record<string, string>;
        headers?: Record<string, string>;
        timeoutSeconds?: number;
        authProviderType?: McpAuthProviderType;
        oauthConfig?: McpOAuthConfig;
        secretConfig?: McpSecretConfig;
        bearerToken?: string;
      };
    }
  | {
      type: 'START_MCP_OAUTH_FLOW';
      payload: {
        authUrl: string;
        tokenUrl?: string;
        clientId?: string;
        clientSecret?: string;
        scopes?: string[];
        secretName?: string;
        envVar?: string;
        targetDirectory?: string;
        timeoutMs?: number;
      };
    }
  | {
      type: 'SAVE_MCP_SECRET';
      payload: {
        secretName: string;
        envVar?: string;
        token: string;
        targetDirectory?: string;
      };
    }
  | {
      type: 'GET_MCP_SECRET';
      payload: {
        secretName: string;
        envVar?: string;
        targetDirectory?: string;
      };
    }
  | {
      type: 'CHECK_FILES_EXIST';
      payload?: {
        targetDirectory?: string;
      };
    }
  | {
      type: 'GET_LOCAL_RUNNER_STATUS';
    }
  | {
      type: 'BOOTSTRAP_LOADED';
      payload?: { timestamp?: string | number };
    }
  | {
      type: 'WEBVIEW_LOG';
      payload: {
        level: 'info' | 'warn' | 'error' | 'debug';
        message: string;
        source?: string;
        stack?: string;
      };
    }
  | {
      type: 'WEBVIEW_STATUS';
      payload: {
        status: string;
        details?: any;
      };
    }
  | {
      type: 'DIAGNOSTIC_ERROR';
      payload: {
        message: string;
        url?: string;
        line?: number;
        col?: number;
        stack?: string;
      };
    }
  | {
      type: 'DEPLOY_TO_AGENT_ENGINE';
      payload: {
        document?: AgentWorkflowDocument;
        targetDirectory?: string;
        projectId: string;
        region?: string;
        serviceAccount?: string;
        networkAttachment?: string;
        stagingBucket?: string;
        forceNew?: boolean;
        agentEngineId?: string;
        displayName?: string;
        envVars?: Record<string, string>;
        governance?: AgentGovernanceConfig;
      };
    }
  | {
      type: 'PICK_LOCAL_PYTHON_TOOL';
      payload?: {
        currentFilePath?: string;
      };
    }
  | {
      type: 'PARSE_PYTHON_TOOL_FILE';
      payload: {
        filePath: string;
      };
    }
  | {
      type: 'OPEN_LOCAL_TOOL_FILE';
      payload: {
        filePath: string;
      };
    }
  | {
      type: 'CANCEL_AGENT_ENGINE_DEPLOY';
      payload?: {
        targetDirectory?: string;
      };
    }
  | {
      type: 'GET_AGENT_ENGINE_STATUS';
      payload?: {
        targetDirectory?: string;
      };
    }
  | {
      type: 'TEST_REMOTE_AGENT_ENGINE';
      payload: {
        targetDirectory?: string;
        query: string;
        remoteRuntimeId?: string;
        serviceUrl?: string;
        location?: string;
        projectId?: string;
      };
    }
  | {
      type: 'DEPLOY_TO_CLOUD_RUN';
      payload: {
        document?: AgentWorkflowDocument;
        targetDirectory?: string;
        projectId: string;
        region?: string;
        serviceName?: string;
        cpu?: string;
        memory?: string;
        minInstances?: number;
        maxInstances?: number;
        concurrency?: number;
        allowUnauthenticated?: boolean;
        networkAttachment?: string;
        envVars?: Record<string, string>;
        governance?: AgentGovernanceConfig;
      };
    }
  | {
      type: 'CANCEL_CLOUD_RUN_DEPLOY';
      payload?: {
        targetDirectory?: string;
      };
    }
  | {
      type: 'GET_CLOUD_RUN_STATUS';
      payload?: {
        targetDirectory?: string;
      };
    }
  | {
      type: 'TEST_REMOTE_CLOUD_RUN';
      payload: {
        targetDirectory?: string;
        query: string;
        serviceUrl?: string;
        projectId?: string;
      };
    }
  | {
      type: 'GENERATE_TERRAFORM_FILES';
      payload: {
        document?: AgentWorkflowDocument;
        targetDirectory?: string;
        projectId: string;
        region?: string;
        serviceName?: string;
        cpu?: string;
        memory?: string;
        minInstances?: number;
        maxInstances?: number;
        concurrency?: number;
        allowUnauthenticated?: boolean;
        networkAttachment?: string;
        secretValues?: Record<string, string>;
      };
    }
  | {
      type: 'SAVE_TERRAFORM_FILES';
      payload: {
        targetDirectory: string;
        files: GeneratedFile[];
      };
    }
  | {
      type: 'GET_SAMPLES';
      payload?: Record<string, never>;
    }
  | {
      type: 'FETCH_EVENTARC_PROVIDERS';
      payload?: {
        location?: string;
        forceRefresh?: boolean;
      };
    }
  | {
      type: 'FETCH_PUBSUB_TOPICS';
      payload?: {
        projectId?: string;
        forceRefresh?: boolean;
      };
    }
  | {
      type: 'FETCH_PUBSUB_SUBSCRIPTIONS';
      payload?: {
        projectId?: string;
        forceRefresh?: boolean;
      };
    }
  | {
      type: 'FETCH_GCP_SERVICE_ACCOUNTS';
      payload?: {
        projectId?: string;
        forceRefresh?: boolean;
      };
    }
  | {
      type: 'FETCH_MODEL_ARMOR_TEMPLATES';
      payload?: {
        projectId?: string;
        location?: string;
        forceRefresh?: boolean;
      };
    }
  | {
      type: 'FETCH_GEMINI_ENTERPRISE_APPS';
      payload?: {
        projectId?: string;
        location?: string;
        forceRefresh?: boolean;
      };
    }
  | {
      type: 'PUBLISH_TO_GEMINI_ENTERPRISE';
      payload: {
        targetDirectory?: string;
        projectId: string;
        region?: string;
        target: 'agent_engine' | 'cloud_run';
        agentResourceUri: string;
        displayName?: string;
        description?: string;
        geminiEnterpriseAppId: string;
        geminiEnterpriseLocation?: string;
        bindGatewayToGeminiEnterprise?: boolean;
        agentGatewayResource?: string;
      };
    }
  | {
      type: 'CREATE_FILE_FROM_SAMPLE';
      payload: {
        sampleId: string;
        sampleName?: string;
        sample?: SampleWorkflowDefinition;
      };
    }
  | {
      type: 'FETCH_MODEL_GARDEN_MODELS';
      payload?: {
        projectId?: string;
        forceRefresh?: boolean;
      };
    }
  | {
      type: 'ENABLE_MODEL_GARDEN_MODEL';
      payload: {
        modelId: string;
        publisherModel?: string;
        projectId?: string;
        enabled: boolean;
      };
    }
  | {
      type: 'OPEN_EXTERNAL_URL';
      payload: {
        url: string;
      };
    };

// Extension Host -> Webview Events
export type ExtensionToWebviewMessage =
  | {
      type: 'PARSE_ERROR';
      payload: {
        error: string;
        rawText: string;
      };
    }
  | {
      type: 'LOAD_DOCUMENT';
      payload: {
        document: AgentWorkflowDocument;
        docVersion: number;
        filePath?: string;
        readOnly?: boolean;
        generatedFiles?: GeneratedFile[];
      };
    }
  | {
      type: 'DOCUMENT_SAVED';
      payload: {
        docVersion: number;
        timestamp: string;
      };
    }
  | {
      type: 'THEME_CHANGED';
      payload: {
        theme: 'dark' | 'light';
      };
    }
  | {
      type: 'CODE_GENERATED';
      payload: {
        success: boolean;
        files: GeneratedFile[];
        targetDirectory?: string;
        modelUsed?: string;
        error?: string;
        tokenUsage?: {
          inputTokens: number;
          outputTokens: number;
        };
      };
    }
  | {
      type: 'FILES_WRITTEN';
      payload: {
        success: boolean;
        paths: string[];
        error?: string;
      };
    }
  | {
      type: 'EXECUTION_LOG';
      payload: {
        runId: string;
        scenarioId?: string;
        timestamp: string;
        level: 'info' | 'warn' | 'error';
        message: string;
        stepId?: string;
        agentId?: string;
      };
    }
  | {
      type: 'TEST_RESULT_UPDATE';
      payload: {
        runId: string;
        scenarioId: string;
        status: 'running' | 'passed' | 'failed';
        durationMs: number;
        output?: string;
        error?: string;
      };
    }
  | {
      type: 'EXECUTION_COMPLETE';
      payload: {
        runId: string;
        success: boolean;
        durationMs: number;
        summary: string;
      };
    }
  | {
      type: 'EXPORT_COMPLETE';
      payload: {
        success: boolean;
        outputDirectory?: string;
        filesWritten: string[];
        error?: string;
      };
    }
  | {
      type: 'SETTINGS_SYNC';
      payload: {
        geminiApiKeySet: boolean;
        anthropicApiKeySet?: boolean;
        openaiApiKeySet?: boolean;
        grokApiKeySet?: boolean;
        targetFramework: FrameworkTarget;
        targetLanguage: LanguageTarget;
      };
    }
  | {
      type: 'MCP_TOOLS_DISCOVERED';
      payload: {
        success: boolean;
        tools: ToolDefinition[];
        serverInfo?: {
          name: string;
          version?: string;
        };
        latencyMs?: number;
        error?: string;
        requiresAuth?: boolean;
        authType?: string;
        authUrl?: string;
      };
    }
  | {
      type: 'MCP_OAUTH_COMPLETED';
      payload: {
        success: boolean;
        bearerToken?: string;
        tokenPreview?: string;
        error?: string;
      };
    }
  | {
      type: 'MCP_SECRET_SAVED';
      payload: {
        success: boolean;
        secretName?: string;
        envVar?: string;
        tokenPreview?: string;
        error?: string;
      };
    }
  | {
      type: 'MCP_SECRET_RETRIEVED';
      payload: {
        success: boolean;
        hasToken: boolean;
        tokenPreview?: string;
        bearerToken?: string;
        error?: string;
      };
    }
  | {
      type: 'LOCAL_RUNNER_LOG';
      payload: {
        text: string;
        stream: 'stdout' | 'stderr' | 'system';
        timestamp: string;
      };
    }
  | {
      type: 'LOCAL_RUNNER_STATUS';
      payload: {
        status: 'idle' | 'starting' | 'running' | 'stopped' | 'error';
        port?: number;
        serviceUrl?: string;
        error?: string;
        logs?: string[];
      };
    }
  | {
      type: 'FILES_EXIST_RESPONSE';
      payload: {
        targetDirectory: string;
        exists: boolean;
        files?: string[];
        generatedFiles?: GeneratedFile[];
      };
    }
  | {
      type: 'CHAT_STREAM_CHUNK';
      payload: {
        sessionId: string;
        chunk: string;
        done: boolean;
        error?: string;
        trace?: Array<{
          agentName: string;
          step: string;
          durationMs: number;
        }>;
      };
    }
  | {
      type: 'AGENT_ENGINE_DEPLOY_LOG';
      payload: {
        text: string;
        stream: 'stdout' | 'stderr' | 'system';
        timestamp: string;
      };
    }
  | {
      type: 'AGENT_ENGINE_DEPLOY_STATUS';
      payload: {
        status: 'idle' | 'packaging' | 'building' | 'deploying' | 'success' | 'error';
        remoteRuntimeId?: string;
        serviceUrl?: string;
        consoleUrl?: string;
        error?: string;
        logs?: string[];
        isExistingDeployment?: boolean;
        metadata?: any;
      };
    }
  | {
      type: 'AGENT_ENGINE_TEST_RESULT';
      payload: {
        success: boolean;
        query: string;
        response?: string;
        durationMs: number;
        error?: string;
      };
    }
  | {
      type: 'CLOUD_RUN_DEPLOY_LOG';
      payload: {
        text: string;
        stream: 'stdout' | 'stderr' | 'system';
        timestamp: string;
      };
    }
  | {
      type: 'CLOUD_RUN_DEPLOY_STATUS';
      payload: {
        status: 'idle' | 'packaging' | 'building' | 'deploying' | 'success' | 'error';
        serviceUrl?: string;
        consoleUrl?: string;
        serviceName?: string;
        projectId?: string;
        region?: string;
        error?: string;
        logs?: string[];
        isExistingDeployment?: boolean;
        metadata?: any;
      };
    }
  | {
      type: 'CLOUD_RUN_TEST_RESULT';
      payload: {
        success: boolean;
        query: string;
        response?: string;
        durationMs: number;
        error?: string;
      };
    }
  | {
      type: 'TERRAFORM_FILES_GENERATED';
      payload: {
        files: GeneratedFile[];
        error?: string;
      };
    }
  | {
      type: 'TERRAFORM_FILES_SAVED';
      payload: {
        success: boolean;
        outputDirectory: string;
        filesWritten: string[];
      };
    }
  | {
      type: 'LOCAL_PYTHON_TOOL_PICKED';
      payload: {
        success: boolean;
        filePath?: string;
        relativePath?: string;
        functions?: Array<{
          name: string;
          docstring?: string;
          parameters?: Record<string, string>;
        }>;
        error?: string;
      };
    }
  | {
      type: 'PYTHON_TOOL_FILE_PARSED';
      payload: {
        success: boolean;
        filePath: string;
        relativePath?: string;
        functions: Array<{
          name: string;
          docstring?: string;
          parameters?: Record<string, string>;
        }>;
        error?: string;
      };
    }
  | {
      type: 'SAMPLES_LOADED';
      payload: {
        samples: SampleWorkflowDefinition[];
      };
    }
  | {
      type: 'EVENTARC_PROVIDERS_RESPONSE';
      payload: {
        categories: EventArcCategory[];
        source: 'gcloud' | 'fallback';
        location: string;
        error?: string;
      };
    }
  | {
      type: 'PUBSUB_TOPICS_RESPONSE';
      payload: {
        topics: Array<{
          name: string;
          shortName: string;
          projectId?: string;
        }>;
        source: 'gcloud' | 'fallback';
        projectId?: string;
        error?: string;
      };
    }
  | {
      type: 'PUBSUB_SUBSCRIPTIONS_RESPONSE';
      payload: {
        subscriptions: Array<{
          name: string;
          shortName: string;
          topic: string;
          pushEndpoint?: string;
          ackDeadlineSeconds?: number;
        }>;
        source: 'gcloud' | 'fallback';
        projectId?: string;
        error?: string;
      };
    }
  | {
      type: 'GCP_SERVICE_ACCOUNTS_RESPONSE';
      payload: {
        serviceAccounts: Array<{
          email: string;
          displayName: string;
          name?: string;
          disabled?: boolean;
        }>;
        source: 'gcloud' | 'fallback';
        projectId?: string;
        error?: string;
      };
    }
  | {
      type: 'MODEL_ARMOR_TEMPLATES_RESPONSE';
      payload: {
        templates: ModelArmorTemplateItem[];
        source: 'gcloud' | 'fallback';
        projectId?: string;
        location?: string;
        error?: string;
      };
    }
  | {
      type: 'GEMINI_ENTERPRISE_APPS_RESPONSE';
      payload: {
        apps: GeminiEnterpriseAppItem[];
        source: 'gcloud' | 'fallback';
        projectId?: string;
        location?: string;
        error?: string;
      };
    }
  | {
      type: 'GEMINI_ENTERPRISE_PUBLISHED';
      payload: {
        success: boolean;
        geminiEnterpriseAgentUri?: string;
        geminiEnterpriseConsoleUrl?: string;
        error?: string;
      };
    }
  | {
      type: 'MODEL_GARDEN_MODELS_RESPONSE';
      payload: {
        models: ModelCatalogItem[];
        source: 'gcloud' | 'fallback';
        projectId?: string;
        error?: string;
      };
    }
  | {
      type: 'MODEL_GARDEN_MODEL_ENABLED';
      payload: {
        success: boolean;
        modelId: string;
        publisherModel?: string;
        enabled: boolean;
        verified?: boolean;
        consoleUrl?: string;
        source: 'gcloud' | 'fallback';
        error?: string;
      };
    };

/**
 * Validates if an incoming object is a valid RPC message envelope.
 *
 * @param msg Any candidate object
 */
export function isValidRpcMessage(msg: any): msg is WebviewToExtensionMessage {
  if (!msg || typeof msg !== 'object') {
    return false;
  }
  return typeof msg.type === 'string';
}

/**
 * Validates if a payload is a valid WRITE_FILES_TO_WORKSPACE payload.
 *
 * @param payload Candidate payload
 */
export function isWriteFilesPayload(payload: any): payload is { files: { path: string; content: string }[]; targetDirectory?: string } {
  if (!payload || typeof payload !== 'object') {
    return false;
  }
  if (!Array.isArray(payload.files)) {
    return false;
  }
  for (const file of payload.files) {
    if (!file || typeof file !== 'object') {
      return false;
    }
    if (typeof file.path !== 'string' || typeof file.content !== 'string') {
      return false;
    }
  }
  if ('targetDirectory' in payload && payload.targetDirectory !== undefined && typeof payload.targetDirectory !== 'string') {
    return false;
  }
  return true;
}

/**
 * Validates if a payload is a valid START_LOCAL_RUNNER payload.
 *
 * @param payload Candidate payload
 */
export function isStartRunnerPayload(payload: any): payload is { document?: any; targetDirectory?: string; port?: number; envVars?: Record<string, string>; useLocalSqliteMemory?: boolean } {
  if (!payload || typeof payload !== 'object') {
    return false;
  }
  if ('targetDirectory' in payload && payload.targetDirectory !== undefined && typeof payload.targetDirectory !== 'string') {
    return false;
  }
  if ('port' in payload && payload.port !== undefined && typeof payload.port !== 'number') {
    return false;
  }
  if ('useLocalSqliteMemory' in payload && payload.useLocalSqliteMemory !== undefined && typeof payload.useLocalSqliteMemory !== 'boolean') {
    return false;
  }
  if ('envVars' in payload && payload.envVars !== undefined) {
    if (!payload.envVars || typeof payload.envVars !== 'object' || Array.isArray(payload.envVars)) {
      return false;
    }
    for (const key of Object.keys(payload.envVars)) {
      if (typeof payload.envVars[key] !== 'string') {
        return false;
      }
    }
  }
  return true;
}

/**
 * Validates if a payload is a valid DISCOVER_MCP_TOOLS payload.
 *
 * @param payload Candidate payload
 */
export function isDiscoverMcpPayload(payload: any): payload is { transport: 'stdio' | 'sse' | 'http'; command?: string; args?: string[]; cwd?: string; url?: string; serverUrl?: string; envVars?: Record<string, string>; headers?: Record<string, string>; timeoutSeconds?: number } {
  if (!payload || typeof payload !== 'object') {
    return false;
  }
  if (payload.transport !== 'stdio' && payload.transport !== 'sse' && payload.transport !== 'http') {
    return false;
  }
  if ('command' in payload && payload.command !== undefined && typeof payload.command !== 'string') {
    return false;
  }
  if ('args' in payload && payload.args !== undefined) {
    if (!Array.isArray(payload.args)) {
      return false;
    }
    for (const arg of payload.args) {
      if (typeof arg !== 'string') {
        return false;
      }
    }
  }
  if ('cwd' in payload && payload.cwd !== undefined && typeof payload.cwd !== 'string') {
    return false;
  }
  if ('url' in payload && payload.url !== undefined && typeof payload.url !== 'string') {
    return false;
  }
  if ('serverUrl' in payload && payload.serverUrl !== undefined && typeof payload.serverUrl !== 'string') {
    return false;
  }
  if ('envVars' in payload && payload.envVars !== undefined) {
    if (!payload.envVars || typeof payload.envVars !== 'object' || Array.isArray(payload.envVars)) {
      return false;
    }
    for (const key of Object.keys(payload.envVars)) {
      if (typeof payload.envVars[key] !== 'string') {
        return false;
      }
    }
  }
  if ('headers' in payload && payload.headers !== undefined) {
    if (!payload.headers || typeof payload.headers !== 'object' || Array.isArray(payload.headers)) {
      return false;
    }
    for (const key of Object.keys(payload.headers)) {
      if (typeof payload.headers[key] !== 'string') {
        return false;
      }
    }
  }
  if ('timeoutSeconds' in payload && payload.timeoutSeconds !== undefined && typeof payload.timeoutSeconds !== 'number') {
    return false;
  }
  return true;
}

