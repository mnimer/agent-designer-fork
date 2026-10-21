/**
 * Code Generation Engine Type Definitions
 *
 * Defines contracts for LLM-driven prompt interpolation, multi-file code generation
 * responses, and repository export payloads.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { AgentWorkflowDocument, FrameworkTarget, LanguageTarget } from '../types';

export interface GeneratedFile {
  path: string;
  name?: string;
  description?: string;
  content: string;
  language?: string;
}

export interface CodeGenRequest {
  document: AgentWorkflowDocument;
  framework?: FrameworkTarget;
  language?: LanguageTarget;
  deploymentTarget?: 'cloudrun' | 'agent-engine' | string;
  apiKey?: string;
  model?: string;
  signal?: AbortSignal;
}

export interface CodeGenTokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface CodeGenResult {
  success: boolean;
  files: GeneratedFile[];
  error?: string;
  cancelled?: boolean;
  modelUsed?: string;
  timestamp?: string;
  tokenUsage?: CodeGenTokenUsage;
}

export interface CodeExportPayload {
  document: AgentWorkflowDocument;
  targetFramework: FrameworkTarget;
  targetLanguage: LanguageTarget;
}
