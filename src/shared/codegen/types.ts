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
}

export interface CodeGenResult {
  success: boolean;
  files: GeneratedFile[];
  error?: string;
  modelUsed?: string;
  timestamp?: string;
}

export interface CodeExportPayload {
  document: AgentWorkflowDocument;
  targetFramework: FrameworkTarget;
  targetLanguage: LanguageTarget;
}
