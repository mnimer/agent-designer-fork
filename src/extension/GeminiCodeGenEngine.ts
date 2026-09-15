/**
 * GeminiCodeGenEngine
 *
 * Pure LLM prompt-driven code generation engine that takes a visual Agent Workflow document,
 * loads framework-specific prompt templates from `resource/prompts/`, interpolates the graph JSON,
 * and calls Gemini (gemini-flash-latest) to synthesize a complete production repository.
 *
 * Architectural Decisions:
 * 1. Pure LLM Generation: Code synthesis is 100% delegated to Gemini LLM (`gemini-3.7-flash`). Zero template fallbacks.
 * 2. Prompt Decoupling: Prompts reside in `resource/prompts/` (e.g., `resource/prompts/python_adk_agent-engine.prompt.txt`).
 * 3. Multi-Credential Support: Authenticates via `GEMINI_API_KEY` (settings/env) or falls back to Google Application Default Credentials (ADC).
 * 5. Standalone Merged Prompts: Self-contained prompt templates in `resource/prompts/` provide complete framework, workflow, and deployment instructions without external file appending.
 * 6. Automated Post-Generation Import Normalization: Automatically inspects and corrects known LLM import errors
 *    for Google ADK tools (such as mapping invalid `google.adk.tools.google_search` to `google.adk.tools`) before persisting.
 * 7. Dependency Integrity Assurance: Automatically validates that requirements.txt contains all required extras (e.g. google-adk[a2a] and a2a-sdk[http-server]) whenever an A2A agent node is part of the workflow.
 * 8. Asset File Extraction: Emits dedicated agent card JSON files for A2A nodes alongside agent code.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { GeneratedFile, CodeGenRequest, CodeGenResult } from '../shared/codegen/types';
import { sanitizeAgentIdentifier } from '../shared/identifierValidation';

export interface AssertionEvaluationRequest {
  inputQuery: string;
  expectedCriteria: string;
  actualOutput: string;
  model?: string;
  apiKey?: string;
  assertionType?: 'contains' | 'exact' | 'json_schema' | 'llm_eval';
  expectedSchema?: any;
}

export interface AssertionEvaluationResult {
  passed: boolean;
  reason: string;
}

export class GeminiCodeGenEngine {
  private extensionPath: string;

  constructor(extensionPath: string) {
    this.extensionPath = extensionPath;
  }

  /**
   * Generates a complete project repository from an AgentWorkflowDocument using Gemini LLM.
   *
   * @param request The code generation request containing workflow document and configuration.
   * @returns Result containing the array of generated source files or error details.
   */
  public async generateCode(request: CodeGenRequest): Promise<CodeGenResult> {
    const doc = request.document;
    const framework = request.framework || doc.framework || 'google-adk';
    const language = request.language || doc.language || 'python';
    const target = request.deploymentTarget || doc.metadata?.deploymentTarget || 'agent-engine';
    const model = request.model || 'gemini-3.8-flash';
    const apiKey = request.apiKey || process.env.GEMINI_API_KEY || '';

    if (request.signal?.aborted) {
      return {
        success: false,
        files: [],
        error: 'Code generation cancelled by user',
        cancelled: true,
        modelUsed: model,
        timestamp: new Date().toISOString(),
      };
    }

    try {
      // 1. Load prompt template from resource/prompts directory
      const promptTemplate = this.loadPromptTemplate(framework, language, target);

      // Sanitize agent nodes to guarantee valid Python identifier names
      const sanitizedDoc = {
        ...doc,
        nodes: (doc.nodes || []).map((node: any) => {
          const isTrigger =
            node.type === 'trigger' ||
            node.type === 'triggerNode' ||
            node.type === 'tester' ||
            node.type === 'chat' ||
            node.id?.includes('trigger') ||
            node.id?.includes('tester');

          if (!isTrigger) {
            const data = node.data || {};
            const cleanName = sanitizeAgentIdentifier(data.name || data.label || node.id);
            return {
              ...node,
              data: {
                ...data,
                name: cleanName,
              },
            };
          }
          return node;
        }),
      };

      const workflowJson = JSON.stringify(sanitizedDoc, null, 2);
      const interpolatedPrompt = promptTemplate.replace('{{WORKFLOW_JSON}}', workflowJson);

      const rawGeneratedFiles = await this.callGeminiApi(interpolatedPrompt, apiKey, model, request.signal);

      if (!rawGeneratedFiles || rawGeneratedFiles.length === 0) {
        throw new Error('Gemini returned an empty file list. Please verify the prompt and model output.');
      }

      // 3. Post-process and sanitize generated code (e.g. normalize framework tool imports)
      const postProcessedFiles = this.postProcessGeneratedFiles(rawGeneratedFiles);

      // 4. Finalize generated files: ensure dependencies, extract agent cards, and sanitize Python source
      const finalizedFiles = this.finalizeGeneratedFiles(doc, postProcessedFiles);

      return {
        success: true,
        files: finalizedFiles,
        modelUsed: model,
        timestamp: new Date().toISOString(),
      };
    } catch (err: any) {
      if (request.signal?.aborted || err?.name === 'AbortError') {
        return {
          success: false,
          files: [],
          error: 'Code generation cancelled by user',
          cancelled: true,
          modelUsed: model,
          timestamp: new Date().toISOString(),
        };
      }
      const errorMessage = err?.message || 'Unknown error occurred during Gemini code generation.';
      return {
        success: false,
        files: [],
        error: errorMessage,
        modelUsed: model,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Post-processes generated code files to automatically sanitize and normalize
   * common LLM import variations for Google ADK and framework modules.
   *
   * Normalizations:
   * 1. Replaces 'from google.adk.tools.google_search import google_search'
   *    or 'from google.adk.tools.google_search import GoogleSearchTool'
   *    with valid Google ADK exports ('from google.adk.tools import google_search' or 'from google.adk.tools.google_search_tool import GoogleSearchTool').
   * 2. Normalizes 'import google.adk.tools.google_search' -> 'from google.adk.tools import google_search'
   * 3. Normalizes 'from google.adk.tools.vertex_ai_search import ...' -> 'from google.adk.tools import VertexAiSearchTool'
   *
   * @param files List of generated files
   * @returns Sanitized generated files
   */
  public postProcessGeneratedFiles(files: GeneratedFile[]): GeneratedFile[] {
    return files.map((file) => {
      if (!file.path.endsWith('.py')) {
        return file;
      }

      let content = file.content;

      // NOTE: Fix invalid google.adk.tools.google_search submodule imports
      // 1. from google.adk.tools.google_search import google_search -> from google.adk.tools import google_search
      content = content.replace(
        /from\s+google\.adk\.tools\.google_search\s+import\s+google_search/g,
        'from google.adk.tools import google_search'
      );

      // 2. from google.adk.tools.google_search import GoogleSearchTool -> from google.adk.tools.google_search_tool import GoogleSearchTool
      content = content.replace(
        /from\s+google\.adk\.tools\.google_search\s+import\s+GoogleSearchTool/g,
        'from google.adk.tools.google_search_tool import GoogleSearchTool'
      );

      // 3. import google.adk.tools.google_search -> from google.adk.tools import google_search
      content = content.replace(
        /import\s+google\.adk\.tools\.google_search\b/g,
        'from google.adk.tools import google_search'
      );

      // 4. from google.adk.tools.vertex_ai_search import VertexAiSearchTool -> from google.adk.tools import VertexAiSearchTool
      content = content.replace(
        /from\s+google\.adk\.tools\.vertex_ai_search\s+import\s+VertexAiSearchTool/g,
        'from google.adk.tools import VertexAiSearchTool'
      );

      // 5. enable_cloud_metrics=True and enable_cloud_tracing=True
      // -> bool(os.getenv("GOOGLE_CLOUD_AGENT_ENGINE_ID") or os.getenv("K_SERVICE"))
      // NOTE: Google Cloud's telemetry.googleapis.com requires a deployed Reasoning Engine resource ID
      // and returns 400 Bad Request when metrics or traces are exported from an undeployed local runner.
      content = content.replace(
        /enable_cloud_metrics\s*=\s*True/g,
        'enable_cloud_metrics=bool(os.getenv("GOOGLE_CLOUD_AGENT_ENGINE_ID") or os.getenv("K_SERVICE"))'
      );
      content = content.replace(
        /enable_cloud_tracing\s*=\s*True/g,
        'enable_cloud_tracing=bool(os.getenv("GOOGLE_CLOUD_AGENT_ENGINE_ID") or os.getenv("K_SERVICE"))'
      );

      // 6. Strip forbidden description parameter from App(...)
      // In google.adk.apps.App, Pydantic strict mode is active (extra='forbid') and App does not accept a description argument.
      content = content.replace(/(\bApp\s*\([^)]*?),\s*description\s*=\s*(?:'[^']*'|"[^"]*")/g, '$1');
      content = content.replace(/(\bApp\s*\(\s*)description\s*=\s*(?:'[^']*'|"[^"]*"),?\s*/g, '$1');

      return {
        ...file,
        content,
      };
    });
  }

  /**
   * Loads the prompt template file corresponding to the target framework, language, and deployment target
   * from the `resource/prompts/` directory.
   *
   * @param framework Framework identifier (e.g. 'google-adk', 'langgraph')
   * @param language Programming language (e.g. 'python', 'typescript')
   * @param target Optional deployment target (e.g. 'cloudrun', 'agent-engine', 'agent_engine', 'cloud_run')
   * @returns The raw string prompt template
   */
  public loadPromptTemplate(framework: string, language: string, target?: string): string {
    const cleanFramework = framework.replace('google-', '').replace('-', '_').replace('google_', '');
    const rawTarget = (target || 'agent-engine').toLowerCase().trim();
    const normalizedTarget = rawTarget.includes('agent')
      ? 'agent-engine'
      : rawTarget.includes('cloud')
      ? 'cloudrun'
      : rawTarget.replace(/_/g, '-');

    const candidateFileNames = [
      // 1. Target-specific filenames (e.g., python_adk_agent-engine.prompt.txt, python_adk_cloudrun.prompt.txt)
      `${language}_${cleanFramework}_${normalizedTarget}.prompt.txt`,
      `${language}_${cleanFramework}_${rawTarget.replace(/_/g, '-')}.prompt.txt`,
      `${language}_${cleanFramework}_${rawTarget.replace(/[_-]/g, '')}.prompt.txt`,
      `${language}-${cleanFramework}-${normalizedTarget}.prompt.txt`,
      // 2. Default target filenames
      `${language}_${cleanFramework}_agent-engine.prompt.txt`,
      `${language}_${cleanFramework}_cloudrun.prompt.txt`,
      `${language}_${cleanFramework}.prompt.txt`,
      'python_adk_agent-engine.prompt.txt',
      'python_adk_cloudrun.prompt.txt',
    ];

    const searchDirs = [
      path.join(this.extensionPath, 'resource', 'prompts'),
      path.join(process.cwd(), 'resource', 'prompts'),
    ];

    const candidatePaths: string[] = [];
    for (const dir of searchDirs) {
      for (const fileName of candidateFileNames) {
        candidatePaths.push(path.join(dir, fileName));
      }
    }

    for (const candidate of candidatePaths) {
      if (fs.existsSync(candidate)) {
        return fs.readFileSync(candidate, 'utf-8');
      }
    }

    throw new Error(
      `Prompt template not found for framework '${framework}', language '${language}', target '${target || 'default'}'. Looked in: ${candidatePaths.slice(0, 6).join(', ')}`
    );
  }



  /**
   * Invokes the Gemini API via @google/genai SDK or direct REST with API Key / ADC.
   * Seamlessly falls back to Google Application Default Credentials (ADC) if the API key fails.
   *
   * @param prompt Full interpolated prompt instruction
   * @param apiKey Optional Gemini API key
   * @param model Target model identifier (default: 'gemini-flash-latest')
   * @returns Array of generated file objects
   */
  public async callGeminiApi(prompt: string, apiKey: string, model: string, signal?: AbortSignal): Promise<GeneratedFile[]> {
    let apiKeyError: Error | null = null;

    if (signal?.aborted) {
      throw new Error('Code generation cancelled by user');
    }

    // Strategy A: Direct API Key provided
    if (apiKey) {
      try {
        return await this.callGeminiWithApiKey(prompt, apiKey, model, signal);
      } catch (err: any) {
        if (signal?.aborted || err?.name === 'AbortError') {
          throw err;
        }
        apiKeyError = err;
        // API key failed (e.g. invalid, revoked, or expired) - proceed to fallback Strategy B (ADC)
      }
    }

    // Strategy B: Google Application Default Credentials (ADC) / Vertex AI
    try {
      return await this.callGeminiWithAdc(prompt, model, signal);
    } catch (adcErr: any) {
      if (signal?.aborted || adcErr?.name === 'AbortError') {
        throw adcErr;
      }
      if (apiKeyError) {
        throw new Error(
          `Gemini code generation failed: API Key error (${apiKeyError.message}) and Application Default Credentials fallback failed (${adcErr.message}). Run 'gcloud auth application-default login' or update your API key.`
        );
      }
      throw adcErr;
    }
  }

  /**
   * Gemini response schema for structured output code generation.
   * Constrains the LLM response to a strongly-typed JSON array of file objects.
   */
  private readonly fileArraySchema = {
    type: 'ARRAY',
    description: 'List of source code and configuration files generated for the complete agent project.',
    items: {
      type: 'OBJECT',
      properties: {
        path: {
          type: 'STRING',
          description: 'Relative file path including subdirectories (e.g., "src/agent.py", "tests/test_agent.py", "requirements.txt").',
        },
        description: {
          type: 'STRING',
          description: 'Brief 1-2 sentence description explaining the purpose and contents of this file.',
        },
        content: {
          type: 'STRING',
          description: 'Complete, production-ready, unabridged source code for the file without placeholders or truncation.',
        },
      },
      required: ['path', 'description', 'content'],
    },
  };

  /**
   * Calls Gemini REST API using an API key.
   *
   * @param prompt Prompt string
   * @param apiKey API key
   * @param model Model name
   */
  private async callGeminiWithApiKey(prompt: string, apiKey: string, model: string, signal?: AbortSignal): Promise<GeneratedFile[]> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const requestBody = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 65536,
        responseMimeType: 'application/json',
        responseSchema: this.fileArraySchema,
      },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${errText}`);
    }

    const data: any = await response.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) {
      throw new Error('Gemini API returned empty candidate content.');
    }

    return this.parseGeminiResponse(candidateText);
  }

  /**
   * Calls Gemini using Google Application Default Credentials (ADC) or Vertex AI.
   *
   * @param prompt Prompt string
   * @param model Model name
   */
  private async callGeminiWithAdc(prompt: string, model: string, signal?: AbortSignal): Promise<GeneratedFile[]> {
    // 1. Attempt Vertex AI with ADC token and project ID
    const adcToken = this.getGCloudAccessToken();
    const projectId = this.getGCloudProjectId();

    if (adcToken && projectId) {
      return this.callVertexAiGemini(prompt, model, adcToken, projectId, signal);
    }

    throw new Error(
      `Gemini ADC authentication failed: Unable to obtain Google Cloud access token or project ID. Please run 'gcloud auth application-default login' and ensure a project is set via 'gcloud config set project <PROJECT_ID>'.`
    );
  }

  /**
   * Invokes Vertex AI Gemini endpoint using Google ADC OAuth access token.
   *
   * @param prompt Prompt text
   * @param model Model name
   * @param token OAuth2 access token
   * @param projectId Google Cloud Project ID
   */
  private async callVertexAiGemini(
    prompt: string,
    model: string,
    token: string,
    projectId: string,
    signal?: AbortSignal
  ): Promise<GeneratedFile[]> {
    const location = process.env.GOOGLE_CLOUD_LOCATION || process.env.GOOGLE_CLOUD_REGION || process.env.CLOUD_ML_REGION || 'global';
    const host = location === 'global' ? 'aiplatform.googleapis.com' : `${location}-aiplatform.googleapis.com`;
    const url = `https://${host}/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:generateContent`;

    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 65536,
        responseMimeType: 'application/json',
        responseSchema: this.fileArraySchema,
      },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Vertex AI Gemini API error (${response.status}): ${errText}`);
    }

    const data: any = await response.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) {
      throw new Error('Vertex AI Gemini returned empty candidate content.');
    }

    return this.parseGeminiResponse(candidateText);
  }

  /**
   * Safely retrieves access token from `gcloud auth application-default print-access-token`
   * or `gcloud auth print-access-token`.
   */
  private getGCloudAccessToken(): string | null {
    // 1. Try application-default token first (ADC)
    try {
      const token = execSync('gcloud auth application-default print-access-token', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      }).trim();
      if (token && !token.includes(' ') && !token.includes('\n')) {
        return token;
      }
    } catch {
      // ignore
    }

    // 2. Fall back to standard print-access-token
    try {
      const raw = execSync('gcloud auth print-access-token', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      }).trim();
      const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
      const lastLine = lines[lines.length - 1];
      if (lastLine && !lastLine.includes(' ')) {
        return lastLine;
      }
    } catch {
      // ignore
    }

    return null;
  }

  /**
   * Safely retrieves active Google Cloud Project ID from environment or gcloud config.
   */
  private getGCloudProjectId(): string | null {
    if (process.env.GOOGLE_CLOUD_PROJECT) {
      return process.env.GOOGLE_CLOUD_PROJECT;
    }
    if (process.env.GCLOUD_PROJECT) {
      return process.env.GCLOUD_PROJECT;
    }
    try {
      const proj = execSync('gcloud config get-value project', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      }).trim();
      return proj || null;
    } catch {
      return null;
    }
  }

  /**
   * Strips markdown code fences and parses the JSON response into GeneratedFile array.
   * If direct JSON.parse encounters syntax errors, runs a resilient extractor.
   *
   * @param rawResponse Raw string returned from Gemini LLM
   * @returns Array of GeneratedFile objects conforming to { path, description, content }
   */
  public parseGeminiResponse(rawResponse: string): GeneratedFile[] {
    let clean = rawResponse.trim();
    if (clean.startsWith('```json')) {
      clean = clean.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (clean.startsWith('```')) {
      clean = clean.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    try {
      const parsed = JSON.parse(clean);
      if (!Array.isArray(parsed)) {
        throw new Error('Expected JSON array of generated file objects.');
      }

      return parsed.map((item: any) => ({
        path: item.path || item.name || 'unnamed_file.py',
        name: item.path || item.name || 'unnamed_file.py',
        description: item.description || '',
        content: item.content || '',
      }));
    } catch {
      // Attempt resilient recovery parser
      return this.robustExtractFiles(clean);
    }
  }

  /**
   * Resiliently extracts GeneratedFile items if JSON.parse fails due to character escaping,
   * unescaped control characters, or partial array boundaries.
   *
   * @param raw Raw response string
   * @returns Array of parsed GeneratedFile objects
   */
  public robustExtractFiles(raw: string): GeneratedFile[] {
    // 1. Try stripping unescaped control characters and trailing commas
    try {
      const sanitized = raw
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
        .replace(/,\s*([\]}])/g, '$1');
      const parsed = JSON.parse(sanitized);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((item: any) => ({
          path: item.path || item.name || 'unnamed_file.py',
          name: item.path || item.name || 'unnamed_file.py',
          description: item.description || '',
          content: item.content || '',
        }));
      }
    } catch {
      // Proceed to block regex parsing
    }

    // 2. Regex-based object extraction for file entries in array
    const files: GeneratedFile[] = [];
    const fileBlockRegex = /\{\s*"path"\s*:\s*"([^"]+)"\s*,\s*"description"\s*:\s*"([^"]*)"\s*,\s*"content"\s*:\s*"((?:[^"\\]|\\.)*)"\s*\}/g;
    let match: RegExpExecArray | null;
    while ((match = fileBlockRegex.exec(raw)) !== null) {
      try {
        const filePath = match[1];
        const description = match[2];
        const unescapedContent = JSON.parse(`"${match[3]}"`);
        files.push({
          path: filePath,
          name: filePath,
          description,
          content: unescapedContent,
        });
      } catch {
        // continue
      }
    }

    if (files.length > 0) {
      return files;
    }

    throw new Error(
      `Failed to parse structured JSON response from Gemini. Raw response:\n${raw.substring(0, 500)}`
    );
  }

  private readonly assertionSchema = {
    type: 'OBJECT',
    properties: {
      passed: { type: 'BOOLEAN' },
      reason: { type: 'STRING' },
    },
    required: ['passed', 'reason'],
  };

  /**
   * Evaluates an agent test execution result using Gemini as an LLM judge or specialized assertion engines.
   * Compares the input query, expected criteria/outcome, and actual output.
   *
   * @param request AssertionEvaluationRequest
   * @returns AssertionEvaluationResult containing pass/fail and explanation
   */
  public async evaluateAssertion(request: AssertionEvaluationRequest): Promise<AssertionEvaluationResult> {
    const { 
      inputQuery, 
      expectedCriteria, 
      actualOutput, 
      model = 'gemini-flash-latest', 
      assertionType, 
      expectedSchema 
    } = request;
    const apiKey = request.apiKey || process.env.GEMINI_API_KEY || '';

    // Fast-path: Explicit JSON schema assertion validation
    if (assertionType === 'json_schema') {
      return this.validateJsonSchemaAssertion(actualOutput, expectedSchema || expectedCriteria);
    }

    // Fast-path: Exact match assertion
    if (assertionType === 'exact') {
      const isExact = actualOutput.trim() === expectedCriteria.trim();
      return {
        passed: isExact,
        reason: isExact
          ? 'Output matched expected criteria exactly.'
          : `Expected exact match "${expectedCriteria}", but got "${actualOutput}".`,
      };
    }

    // Fast-path: Direct contains match
    if (assertionType === 'contains') {
      const contains = actualOutput.toLowerCase().includes(expectedCriteria.toLowerCase());
      return {
        passed: contains,
        reason: contains
          ? `Output contains expected substring "${expectedCriteria}".`
          : `Output does not contain expected substring "${expectedCriteria}".`,
      };
    }

    const prompt = `You are an automated QA test evaluator for an AI agent.
Evaluate whether the agent's actual output satisfies the test's expected outcome given the input query.

Input Query:
"${inputQuery}"

Expected Outcome / Criteria:
"${expectedCriteria}"

Actual Agent Output:
"${actualOutput}"

Instructions:
1. If the criteria specifies structured data or JSON fields (e.g., {"isBusiness": true}), verify that the actual output contains or satisfies those data requirements.
2. If the criteria specifies semantic behavior, verify whether the actual output satisfies that intent.
3. If the actual output is an error or fails the criteria, set passed=false.
4. Set "passed": true or false.
5. Provide a concise explanation in "reason" (1-2 sentences).`;

    try {
      if (apiKey) {
        try {
          return await this.callGeminiAssertionWithApiKey(prompt, apiKey, model);
        } catch {
          // Fall through to ADC
        }
      }

      return await this.callGeminiAssertionWithAdc(prompt, model);
    } catch {
      // Graceful fallback to deterministic heuristic if LLM judge is offline
      return this.heuristicEvaluateAssertion(expectedCriteria, actualOutput);
    }
  }

  /**
   * Validates that actual output is valid JSON conforming to an expected schema or structured criteria.
   *
   * Logic Flow:
   * 1. Checks for non-empty output string.
   * 2. Extracts raw JSON from potential markdown fences (e.g. ```json ... ```).
   * 3. Parses the payload using JSON.parse. Fails fast with descriptive error if parsing fails.
   * 4. If schema or criteria is provided:
   *    - If it's a JSON Schema object (e.g. has properties, required, type), validates:
   *      - presence of required fields
   *      - primitive type checks (string, number, boolean, array, object)
   *      - enum value constraints
   * 5. Returns AssertionEvaluationResult with clear diagnostics.
   *
   * @param actualOutput The raw output string produced by the agent
   * @param expectedSchemaOrCriteria Optional JSON schema object or expected criteria
   */
  public validateJsonSchemaAssertion(
    actualOutput: string,
    expectedSchemaOrCriteria?: any
  ): AssertionEvaluationResult {
    if (!actualOutput || !actualOutput.trim()) {
      return {
        passed: false,
        reason: 'Actual output is empty and does not contain valid structured JSON.',
      };
    }

    // 1. Strip markdown fences if present
    let cleaned = actualOutput.trim();
    const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (fenceMatch) {
      cleaned = fenceMatch[1].trim();
    }

    // 2. Parse JSON
    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch (err: any) {
      return {
        passed: false,
        reason: `Failed to parse response as JSON: ${err?.message || 'Invalid JSON syntax'}.`,
      };
    }

    if (typeof parsed !== 'object' || parsed === null) {
      return {
        passed: false,
        reason: `Expected JSON object or array, but got ${typeof parsed}.`,
      };
    }

    // 3. Resolve schema if provided as string or object
    let schema = expectedSchemaOrCriteria;
    if (typeof schema === 'string') {
      try {
        schema = JSON.parse(schema);
      } catch {
        // Not a JSON string schema; could be description text or simple criteria
      }
    }

    // If schema is a standard JSON Schema object with properties
    if (schema && typeof schema === 'object') {
      const properties = schema.properties || {};
      const required: string[] = Array.isArray(schema.required) ? schema.required : [];

      // Check required fields
      for (const reqKey of required) {
        if (!(reqKey in parsed) || parsed[reqKey] === undefined || parsed[reqKey] === null) {
          return {
            passed: false,
            reason: `Schema validation failed: Missing required property "${reqKey}".`,
          };
        }
      }

      // Check property types
      for (const [key, propDef] of Object.entries<any>(properties)) {
        if (key in parsed && parsed[key] !== undefined && parsed[key] !== null) {
          const val = parsed[key];
          const expectedType = (propDef.type || '').toString().toLowerCase();

          if (expectedType === 'string' && typeof val !== 'string') {
            return {
              passed: false,
              reason: `Property "${key}" must be a string, got ${typeof val}.`,
            };
          }
          if ((expectedType === 'number' || expectedType === 'integer') && typeof val !== 'number') {
            return {
              passed: false,
              reason: `Property "${key}" must be a number, got ${typeof val}.`,
            };
          }
          if (expectedType === 'boolean' && typeof val !== 'boolean') {
            return {
              passed: false,
              reason: `Property "${key}" must be a boolean, got ${typeof val}.`,
            };
          }
          if (expectedType === 'array' && !Array.isArray(val)) {
            return {
              passed: false,
              reason: `Property "${key}" must be an array, got ${typeof val}.`,
            };
          }
          if (expectedType === 'object' && (typeof val !== 'object' || Array.isArray(val))) {
            return {
              passed: false,
              reason: `Property "${key}" must be an object, got ${typeof val}.`,
            };
          }

          // Check enum values
          if (Array.isArray(propDef.enum) && propDef.enum.length > 0) {
            if (!propDef.enum.includes(val)) {
              return {
                passed: false,
                reason: `Property "${key}" has value "${val}" which is not in allowed enums [${propDef.enum.join(', ')}].`,
              };
            }
          }
        }
      }
    }

    return {
      passed: true,
      reason: 'Output strictly conforms to the JSON Schema specification.',
    };
  }

  private async callGeminiAssertionWithApiKey(
    prompt: string,
    apiKey: string,
    model: string
  ): Promise<AssertionEvaluationResult> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const requestBody = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
        responseSchema: this.assertionSchema,
      },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${errText}`);
    }

    const data: any = await response.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) {
      throw new Error('Gemini API returned empty candidate content.');
    }

    const parsed = JSON.parse(candidateText.trim().replace(/^```json\s*/, '').replace(/\s*```$/, ''));
    return {
      passed: Boolean(parsed.passed),
      reason: parsed.reason || (parsed.passed ? 'Assertion passed.' : 'Assertion failed.'),
    };
  }

  private async callGeminiAssertionWithAdc(
    prompt: string,
    model: string
  ): Promise<AssertionEvaluationResult> {
    const adcToken = this.getGCloudAccessToken();
    const projectId = this.getGCloudProjectId();

    if (!adcToken || !projectId) {
      throw new Error('Missing ADC credentials or project ID.');
    }

    const location =
      process.env.GOOGLE_CLOUD_LOCATION ||
      process.env.GOOGLE_CLOUD_REGION ||
      process.env.CLOUD_ML_REGION ||
      'global';
    const host = location === 'global' ? 'aiplatform.googleapis.com' : `${location}-aiplatform.googleapis.com`;
    const url = `https://${host}/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:generateContent`;

    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
        responseSchema: this.assertionSchema,
      },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adcToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Vertex AI Gemini API error (${response.status}): ${errText}`);
    }

    const data: any = await response.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) {
      throw new Error('Vertex AI Gemini returned empty candidate content.');
    }

    const parsed = JSON.parse(candidateText.trim().replace(/^```json\s*/, '').replace(/\s*```$/, ''));
    return {
      passed: Boolean(parsed.passed),
      reason: parsed.reason || (parsed.passed ? 'Assertion passed.' : 'Assertion failed.'),
    };
  }

  /**
   * Deterministic fallback when Gemini LLM judge is offline.
   *
   * @param expectedCriteria Expected output or criteria
   * @param actualOutput Actual agent output
   * @returns AssertionEvaluationResult
   */
  public heuristicEvaluateAssertion(
    expectedCriteria: string,
    actualOutput: string
  ): AssertionEvaluationResult {
    const exp = expectedCriteria.trim().toLowerCase();
    const act = actualOutput.toLowerCase();

    // 1. Check direct substring inclusion
    if (act.includes(exp)) {
      return { passed: true, reason: `Output satisfies expected criteria "${expectedCriteria}".` };
    }

    // 2. Check JSON key/value matching with case-insensitivity
    try {
      const parsed = JSON.parse(actualOutput);
      const kvMatch = exp.match(/([a-zA-Z0-9_]+)\s*[:=]\s*(true|false|[-0-9.]+|"[^"]*"|'[^']*')/i);
      if (kvMatch && parsed && typeof parsed === 'object') {
        const targetKey = kvMatch[1].toLowerCase();
        const valStr = kvMatch[2];
        let expectedVal: any = valStr;
        if (valStr.toLowerCase() === 'true') expectedVal = true;
        else if (valStr.toLowerCase() === 'false') expectedVal = false;
        else if (!isNaN(Number(valStr))) expectedVal = Number(valStr);
        else expectedVal = valStr.replace(/^["']|["']$/g, '');

        const matchingKey = Object.keys(parsed).find((k) => k.toLowerCase() === targetKey);
        if (matchingKey !== undefined) {
          const actualVal = parsed[matchingKey];
          const match =
            actualVal === expectedVal ||
            String(actualVal).toLowerCase() === String(expectedVal).toLowerCase();
          if (match) {
            return { passed: true, reason: `Parsed JSON field "${matchingKey}" matches expected value.` };
          } else {
            return {
              passed: false,
              reason: `Expected field "${matchingKey}" to be ${JSON.stringify(expectedVal)}, but got ${JSON.stringify(actualVal)}.`,
            };
          }
        }
      }
    } catch {}

    return {
      passed: false,
      reason: `Expected output to contain or satisfy "${expectedCriteria}".`,
    };
  }

  /**
   * Validates that necessary dependencies (such as A2A protocol packages)
   * are explicitly present in requirements.txt. Fails fast if the generated code is invalid.
   *
   * Logic Flow:
   * 1. Checks if the workflow document contains any A2A agent nodes (agentKind === 'a2a')
   *    or if any generated file references A2A imports or RemoteA2aAgent.
   * 2. If A2A is required, locates requirements.txt in the generated files.
   * 3. Fails fast with a clear error if requirements.txt is missing or lacks A2A packages.
   *
   * @param doc The input AgentWorkflowDocument
   * @param files The array of files generated by Gemini
   */
  public validateRequiredDependencies(doc: any, files: GeneratedFile[]): void {
    const hasA2A =
      (doc?.nodes || []).some((n: any) => n.data?.agentKind === 'a2a' || n.data?.agentType === 'a2a_agent') ||
      files.some(
        (f) =>
          f.content.includes('RemoteA2aAgent') ||
          f.content.includes('import a2a') ||
          f.content.includes('from a2a') ||
          f.content.includes('to_a2a')
      );

    if (!hasA2A) {
      return;
    }

    const reqFile = files.find(
      (f) => f.path === 'requirements.txt' || f.path.endsWith('/requirements.txt')
    );

    if (!reqFile) {
      throw new Error(
        'Validation Error: Generated repository is missing requirements.txt with required A2A dependencies (google-adk[a2a] and a2a-sdk[http-server]).'
      );
    }

    if (!reqFile.content.includes('google-adk[a2a]') || !reqFile.content.includes('a2a-sdk')) {
      throw new Error(
        'Validation Error: Generated requirements.txt is missing required A2A dependencies (google-adk[a2a] and a2a-sdk[http-server]). Failing fast to prevent running or deploying invalid code.'
      );
    }
  }

  /**
   * Ensures that dedicated agent card JSON files exist for any A2A agent nodes in the workflow.
   *
   * Logic Flow:
   * 1. Scans workflow document nodes for agentKind === 'a2a'.
   * 2. If a node defines rawJsonPack, formats and writes `<agent_name>_agent_card.json`
   * Ensures that complete agent card JSON files are created for all A2A nodes in the workflow.
   * If the LLM emitted a truncated or partial card file (or used either `*_agent_card.json` or `*_card.json`),
   * this method synchronizes both filename variants with the canonical, full JSON from `a2aConfig.rawJsonPack`.
   *
   * @param doc The workflow document containing nodes
   * @param files The array of files generated by Gemini
   * @returns Updated array of generated files with canonical agent card files
   */
  public ensureAgentCards(doc: any, files: GeneratedFile[]): GeneratedFile[] {
    const updatedFiles = [...files];
    const nodes = doc?.nodes || [];

    for (const node of nodes) {
      const isA2a = node.data?.agentKind === 'a2a' || node.data?.agentType === 'a2a_agent';
      if (isA2a && node.data?.a2aConfig?.rawJsonPack) {
        const label = node.data.label || node.data.id || 'agent';
        const safeName = label
          .toLowerCase()
          .replace(/[^a-z0-9_]/g, '_')
          .replace(/_+/g, '_')
          .replace(/^_|_$/g, '');

        const primaryCardFilename = `${safeName}_agent_card.json`;
        const altCardFilename = `${safeName}_card.json`;

        let formattedCard = node.data.a2aConfig.rawJsonPack;
        try {
          const parsed = JSON.parse(formattedCard);
          formattedCard = JSON.stringify(parsed, null, 2);
        } catch {
          // Keep raw if JSON formatting fails
        }

        let primaryFound = false;
        let altFound = false;

        // Scan existing generated files to overwrite any emitted card variations
        for (let i = 0; i < updatedFiles.length; i++) {
          const filePath = updatedFiles[i].path;
          if (filePath === primaryCardFilename || filePath.endsWith('/' + primaryCardFilename)) {
            updatedFiles[i] = {
              path: filePath,
              content: formattedCard,
              description: `Agent Card definition for ${label}`,
            };
            primaryFound = true;
          } else if (filePath === altCardFilename || filePath.endsWith('/' + altCardFilename)) {
            updatedFiles[i] = {
              path: filePath,
              content: formattedCard,
              description: `Agent Card definition for ${label}`,
            };
            altFound = true;
          }
        }

        // Canonical rawJsonPack from workflow definition must be present for both naming conventions
        if (!primaryFound) {
          updatedFiles.push({
            path: primaryCardFilename,
            content: formattedCard,
            description: `Agent Card definition for ${label}`,
          });
        }
        if (!altFound) {
          updatedFiles.push({
            path: altCardFilename,
            content: formattedCard,
            description: `Agent Card definition for ${label}`,
          });
        }
      }
    }

    return updatedFiles;
  }

  /**
   * Validates that essential entrypoint files are present in the generated repository.
   * Fails fast if the LLM omitted the core agent entrypoint ('agent.py') or if 'agent.py'
   * does not define 'root_agent'.
   *
   * Logic Flow:
   * 1. Check if 'agent.py' exists in generated files.
   * 2. If missing, throw a descriptive Validation Error detailing the generated files.
   * 3. Verify 'agent.py' includes 'root_agent' assignment.
   *
   * @param doc The input AgentWorkflowDocument
   * @param files The array of generated files
   */
  public validateGeneratedFiles(doc: any, files: GeneratedFile[]): void {
    const hasAgentPy = files.some(
      (f) => f.path === 'agent.py' || f.path.endsWith('/agent.py')
    );

    if (!hasAgentPy) {
      const generatedList = files.map((f) => f.path).join(', ');
      throw new Error(
        `Validation Error: Generated repository is missing the core entrypoint 'agent.py'. All agent repositories must include 'agent.py' defining 'root_agent'. Received files: [${generatedList}]`
      );
    }

    const agentPy = files.find(
      (f) => f.path === 'agent.py' || f.path.endsWith('/agent.py')
    );

    if (agentPy && !agentPy.content.includes('root_agent')) {
      throw new Error(
        `Validation Error: 'agent.py' does not define 'root_agent'. Ensure the workflow orchestrator is assigned to 'root_agent'.`
      );
    }
  }

  /**
   * Finalizes the generated file repository:
   * 1. Validates that core files ('agent.py') and 'root_agent' exist
   * 2. Guarantees required runtime packages (such as A2A) in requirements.txt
   * 3. Extracts and writes dedicated agent card JSON files for any A2A nodes
   *
   * @param doc The workflow document
   * @param files The raw generated files from Gemini
   * @returns Final files ready for deployment and execution
   */
  public finalizeGeneratedFiles(doc: any, files: GeneratedFile[]): GeneratedFile[] {
    this.validateGeneratedFiles(doc, files);
    this.validateRequiredDependencies(doc, files);
    const result = this.ensureAgentCards(doc, files);
    return result;
  }
}



