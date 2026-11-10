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
  /** Called for each generated file once the response is parsed (progress UI). */
  onFileWritten?: (file: GeneratedFile & { owner: string }) => void;
  /** Called when code generation enters a new phase (generating, checks, review, fix, done). */
  onPhase?: (phase: CodeGenPhaseEvent) => void;
  /** Runs the optional post-generation reviewer (checks + review + fixes). Defaults to OFF. */
  enableReviewer?: boolean;
}

/** Progress phase emitted by multi-agent code generation. */
export type CodeGenPhaseEvent =
  | { phase: 'generating' }
  | { phase: 'checks'; round: number }
  | { phase: 'review'; round: number }
  | { phase: 'fix'; round: number; files: string[] }
  | { phase: 'done'; reviewed: boolean; clean: boolean };

/** A cross-file issue reported by the optional code generation reviewer. */
export interface CodeGenReviewIssue {
  file: string;
  problem: string;
  fix: string;
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
  /** Issues the reviewer still reported after the last fix round (empty/undefined when clean). */
  unresolvedReviewIssues?: CodeGenReviewIssue[];
}

export interface CodeExportPayload {
  document: AgentWorkflowDocument;
  targetFramework: FrameworkTarget;
  targetLanguage: LanguageTarget;
}
