/**
 * Extension Host Internal Types
 * Defines interfaces for extension-level controllers, subprocess management,
 * and custom editor state tracking.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import * as vscode from 'vscode';
import { AgentWorkflowDocument } from '../shared/types';

export interface EditorSession {
  documentUri: vscode.Uri;
  webviewPanel: vscode.WebviewPanel;
  docVersion: number;
  lastSavedContent: string;
}

export interface CodeGenOptions {
  document: AgentWorkflowDocument;
  targetFramework: string;
  targetLanguage: string;
  outputDirectory: string;
  apiKey?: string;
}

export interface RunnerOptions {
  runId: string;
  document: AgentWorkflowDocument;
  workingDirectory: string;
  testScenarioIds?: string[];
  apiKey?: string;
}

export interface TestScenarioResult {
  scenarioId: string;
  status: 'passed' | 'failed' | 'running';
  durationMs: number;
  output?: string;
  error?: string;
}
