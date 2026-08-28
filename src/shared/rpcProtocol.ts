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
      };
    }
  | {
      type: 'CANCEL_TESTS';
      payload: {
        runId: string;
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
        url?: string;
      };
    }
  | {
      type: 'BOOTSTRAP_LOADED';
      payload?: { timestamp: string };
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
        error?: string;
      };
    };
