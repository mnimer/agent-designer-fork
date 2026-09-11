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
      type: 'GENERATE_CODE';
      payload: {
        document: AgentWorkflowDocument;
        targetFramework?: FrameworkTarget;
        targetLanguage?: LanguageTarget;
        deploymentTarget?: string;
        outputFolder?: string;
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
        envVars?: Record<string, string>;
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
    };

// Extension Host -> Webview Events
export type ExtensionToWebviewMessage =
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
    };
