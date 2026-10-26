/**
 * GeminiCodeGenEngine
 *
 * Pure LLM prompt-driven code generation engine: takes a visual Agent Workflow document, assembles ONE
 * prompt from the bundled topic skills (`resource/codegen-skills/*`, feature-selected per blueprint via
 * `SinglePromptBuilder`), and calls the selected model once to synthesize a complete production repository.
 *
 * Architectural Decisions:
 * 1. Pure LLM Generation: Code synthesis is 100% delegated to the LLM. Zero template fallbacks.
 * 2. Skill-Assembled Prompt (2026-10-23): the monolithic `resource/prompts/python_adk_*.prompt.txt` files were
 *    decomposed into topic skills; `SinglePromptBuilder` selects `codegen-common` + the blueprint + the skills for
 *    the deployment target and the blueprint's features. A multi-agent ADK workflow was prototyped and measured
 *    2.3-2.5x slower than one call (code_reviewer: 83 s vs 190-212 s), so generation stays a single call.
 * 3. Optional Reviewer (OFF by default, `enableReviewer` / `CODEGEN_REVIEWER_ENABLED_BY_DEFAULT`): read-only
 *    checks + Gemini review + targeted fix calls (`CodeReviewer`). Gemini models only.
 * 4. Multi-Credential / Multi-Provider: `GEMINI_API_KEY` (settings/env) or Google ADC; Anthropic, OpenAI,
 *    Grok, and Vertex AI Model Garden routes are unchanged.
 * 5. Automated Post-Generation Import Normalization and dependency/agent-card finalization (pre-existing).
 *    TODO: AGENTS.md forbids procedural post-processing; retire once prompts/reviewer cover these cases.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { GeneratedFile, CodeGenRequest, CodeGenResult, CodeGenTokenUsage } from '../shared/codegen/types';
import { SinglePromptBuilder } from './codegen/SinglePromptBuilder';
import { CodeReviewer, REVIEW_REPORT_SCHEMA } from './codegen/CodeReviewer';
import { ReadOnlyCheckRunner } from './codegen/ReadOnlyCheckRunner';
import { CODEGEN_REVIEWER_ENABLED_BY_DEFAULT } from './codegen/codegenConfig';

/** Owner label reported for files produced by the single generation call (progress UI). */
const GENERATOR_FILE_OWNER = 'generator';
/** Prefix of Gemini models (the reviewer's structured JSON call is Gemini-only). */
const GEMINI_MODEL_PREFIX = 'gemini-';

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
  private lastTokenUsage?: CodeGenTokenUsage;
  private readonly promptBuilder: SinglePromptBuilder;
  private readonly codeReviewer: CodeReviewer;
  private readonly checkRunner: ReadOnlyCheckRunner;

  constructor(extensionPath: string) {
    this.extensionPath = extensionPath;
    this.promptBuilder = new SinglePromptBuilder(extensionPath);
    this.codeReviewer = new CodeReviewer(extensionPath, this.promptBuilder);
    this.checkRunner = new ReadOnlyCheckRunner();
  }

  /**
   * Generates a complete project repository from an AgentWorkflowDocument using Gemini LLM.
   *
   * @param request The code generation request containing workflow document and configuration.
   * @returns Result containing the array of generated source files or error details.
   */
  public async generateCode(request: CodeGenRequest): Promise<CodeGenResult> {
    this.lastTokenUsage = undefined;
    const doc = request.document;
    const target = request.deploymentTarget || doc.metadata?.deploymentTarget || 'agent-engine';
    const model = request.model || 'gemini-3.8-flash';
    const apiKey =
      request.apiKey !== undefined
        ? request.apiKey
        : model.startsWith('gemini-')
        ? process.env.GEMINI_API_KEY || ''
        : '';

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
      // 1. Assemble the single prompt from the bundled topic skills (feature-selected for this blueprint).
      const built = this.promptBuilder.build(doc, target);

      // 2. ONE model call generates the whole repository.
      request.onPhase?.({ phase: 'generating' });
      let rawGeneratedFiles = await this.callGeminiApi(built.prompt, apiKey, model, request.signal);

      if (!rawGeneratedFiles || rawGeneratedFiles.length === 0) {
        throw new Error('Gemini returned an empty file list. Please verify the prompt and model output.');
      }

      // 2b. Optional reviewer (OFF by default): read-only checks + LLM review + targeted LLM fixes.
      let unresolvedReviewIssues: CodeGenResult['unresolvedReviewIssues'];
      const reviewerEnabled = request.enableReviewer ?? CODEGEN_REVIEWER_ENABLED_BY_DEFAULT;
      if (reviewerEnabled) {
        if (!model.startsWith(GEMINI_MODEL_PREFIX)) {
          // NOTE: The reviewer's structured JSON call is implemented for Gemini only; skip rather than fail.
          console.warn(`[GeminiCodeGenEngine] Reviewer skipped: it supports Gemini models only (selected '${model}').`);
        } else {
          const usageBeforeReview = this.lastTokenUsage;
          const outcome = await this.codeReviewer.reviewAndFix(
            { files: rawGeneratedFiles, generationPrompt: built.prompt, blueprintJson: built.blueprintJson, target: built.target, features: built.features },
            {
              reviewFn: (prompt) => this.callGeminiJson(prompt, REVIEW_REPORT_SCHEMA, apiKey, model, request.signal),
              fixFn: (prompt) => this.callGeminiApi(prompt, apiKey, model, request.signal),
              runChecks: (files) => this.checkRunner.run(files),
              onPhase: request.onPhase,
            }
          );
          rawGeneratedFiles = outcome.files;
          unresolvedReviewIssues = outcome.unresolvedIssues;
          // NOTE: Report the generation call's usage (review/fix calls overwrite lastTokenUsage).
          this.lastTokenUsage = usageBeforeReview;
        }
      }

      // 3. Post-process and sanitize generated code (e.g. normalize framework tool imports)
      const postProcessedFiles = this.postProcessGeneratedFiles(rawGeneratedFiles);

      // 4. Finalize generated files: ensure dependencies, extract agent cards, and sanitize Python source
      const finalizedFiles = this.finalizeGeneratedFiles(doc, postProcessedFiles);

      // 5. Progress: report every file, then completion.
      for (const file of finalizedFiles) {
        request.onFileWritten?.({ ...file, owner: GENERATOR_FILE_OWNER });
      }
      request.onPhase?.({ phase: 'done', reviewed: reviewerEnabled, clean: !unresolvedReviewIssues || unresolvedReviewIssues.length === 0 });

      const estimatedInputTokens = Math.max(1, Math.ceil(built.prompt.length / 4));
      const totalOutputChars = finalizedFiles.reduce((acc, f) => acc + (f.content?.length || 0), 0);
      const estimatedOutputTokens = Math.max(1, Math.ceil(totalOutputChars / 4));
      const tokenUsage: CodeGenTokenUsage = {
        inputTokens:
          this.lastTokenUsage && this.lastTokenUsage.inputTokens > 0
            ? this.lastTokenUsage.inputTokens
            : estimatedInputTokens,
        outputTokens:
          this.lastTokenUsage && this.lastTokenUsage.outputTokens > 0
            ? this.lastTokenUsage.outputTokens
            : estimatedOutputTokens,
      };

      return {
        success: true,
        files: finalizedFiles,
        modelUsed: model,
        timestamp: new Date().toISOString(),
        tokenUsage,
        ...(unresolvedReviewIssues ? { unresolvedReviewIssues } : {}),
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
   * Calls Direct Provider REST API using an API key (Gemini API, Anthropic, OpenAI, or xAI Grok).
   *
   * @param prompt Prompt string
   * @param apiKey API key
   * @param model Model name
   */
  private async callGeminiWithApiKey(prompt: string, apiKey: string, model: string, signal?: AbortSignal): Promise<GeneratedFile[]> {
    const jsonInstructionSuffix =
      '\n\nOutput format: Return ONLY a raw JSON array of file objects (starting immediately with `[` and ending with `]`, with no introductory prose, no architectural summary, and no markdown code fences), where each object has "path", "description", and "content" properties.';

    // 1. Direct Anthropic API Key
    if (model.startsWith('claude-') || apiKey.startsWith('sk-ant-')) {
      const cleanModel = model.replace(/^publishers\/anthropic\/models\//, '');
      const supportsAdaptiveThinking =
        cleanModel.includes('fable-5') ||
        cleanModel.includes('opus-5') ||
        cleanModel.includes('sonnet-5') ||
        cleanModel.includes('haiku-5') ||
        cleanModel.includes('opus-4-6') ||
        cleanModel.includes('sonnet-4-6');
      const anthropicBody: Record<string, any> = {
        model: cleanModel,
        max_tokens: 64000,
        stream: true,
        messages: [{ role: 'user', content: prompt + jsonInstructionSuffix }],
      };
      if (supportsAdaptiveThinking) {
        anthropicBody.thinking = { type: 'adaptive' };
        anthropicBody.output_config = { effort: 'low' };
      }

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(anthropicBody),
        signal,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Anthropic API error (${response.status}): ${errText}`);
      }
      const candidateText = await this.extractAnthropicResponseText(response);
      if (!candidateText) {
        throw new Error('Anthropic API returned empty content.');
      }
      return this.parseGeminiResponse(candidateText);
    }

    // 2. Direct OpenAI or xAI Grok API Key
    if (
      model.startsWith('openai/') ||
      model.startsWith('gpt-') ||
      model.startsWith('o3-') ||
      model.startsWith('grok-') ||
      apiKey.startsWith('xai-')
    ) {
      const isGrok = model.startsWith('grok-') || apiKey.startsWith('xai-');
      const endpoint = isGrok
        ? 'https://api.x.ai/v1/chat/completions'
        : 'https://api.openai.com/v1/chat/completions';
      const cleanModel = model.replace(/^openai\//, '');
      const isReasoningModel = cleanModel.startsWith('o3-') || cleanModel.startsWith('o1-');

      const requestPayload: Record<string, any> = {
        model: cleanModel,
        stream: true,
        messages: [{ role: 'user', content: prompt + jsonInstructionSuffix }],
      };
      if (!isReasoningModel) {
        requestPayload.temperature = 0.2;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestPayload),
        signal,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`${isGrok ? 'xAI Grok' : 'OpenAI'} API error (${response.status}): ${errText}`);
      }
      const candidateText = await this.extractOpenAiResponseText(response);
      if (!candidateText) {
        throw new Error(`${isGrok ? 'xAI Grok' : 'OpenAI'} API returned empty content.`);
      }
      return this.parseGeminiResponse(candidateText);
    }

    // 3. Google Gemini REST API (SSE streaming avoids Node undici 300s headersTimeout on large multi-agent repos)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

    const generationConfig: Record<string, any> = {
      temperature: 0.2,
      maxOutputTokens: 65536,
      responseMimeType: 'application/json',
      responseSchema: this.fileArraySchema,
    };
    if (model.includes('gemini-4')) {
      generationConfig.thinkingConfig = {
        thinkingLevel: 'LOW',
      };
    }

    const requestBody = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig,
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

    const candidateText = await this.extractGeminiResponseText(response);
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
   * Invokes Vertex AI endpoint using Google ADC OAuth access token.
   * Supports:
   * 1. Google Gemini Foundation Models (`publishers/google/models/{model}:generateContent`)
   * 2. Anthropic Claude Partner Models (`publishers/anthropic/models/{model}:rawPredict`)
   * 3. Vertex AI Model Garden MaaS Models (`/endpoints/openapi/chat/completions` for Qwen, DeepSeek, OpenAI OSS, Llama)
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
    const jsonInstructionSuffix =
      '\n\nOutput format: Return ONLY a raw JSON array of file objects (starting immediately with `[` and ending with `]`, with no introductory prose, no architectural summary, and no markdown code fences), where each object has "path", "description", and "content" properties.';

    // Route 1: Anthropic Claude Partner Models on Vertex AI (:streamRawPredict)
    // NOTE: On Vertex AI, :rawPredict is a unary RPC that buffers the entire response until completion
    // (exceeding Node.js undici's 300s headersTimeout on large multi-agent repositories that take ~350-400s).
    // :streamRawPredict returns HTTP 200 headers in ~1s and streams SSE events (including 30s keepalive pings)
    // continuously until all files finish generating.
    if (model.startsWith('claude-') || model.includes('publishers/anthropic/models/')) {
      const shortClaudeModel = model.replace(/^publishers\/anthropic\/models\//, '');
      const supportsAdaptiveThinking =
        shortClaudeModel.includes('fable-5') ||
        shortClaudeModel.includes('opus-5') ||
        shortClaudeModel.includes('sonnet-5') ||
        shortClaudeModel.includes('haiku-5') ||
        shortClaudeModel.includes('opus-4-6') ||
        shortClaudeModel.includes('sonnet-4-6');
      const candidateLocations = ['global', 'us-east5', 'us-central1'];
      let primaryErrorText = '';
      let primaryStatus = 404;

      for (const loc of candidateLocations) {
        const host = loc === 'global' ? 'aiplatform.googleapis.com' : `${loc}-aiplatform.googleapis.com`;
        const url = `https://${host}/v1/projects/${projectId}/locations/${loc}/publishers/anthropic/models/${shortClaudeModel}:streamRawPredict`;

        const requestPayload: Record<string, any> = {
          anthropic_version: 'vertex-2023-10-16',
          max_tokens: 64000,
          stream: true,
          messages: [
            {
              role: 'user',
              content: prompt + jsonInstructionSuffix,
            },
          ],
        };
        if (supportsAdaptiveThinking) {
          requestPayload.thinking = { type: 'adaptive' };
          requestPayload.output_config = { effort: 'low' };
        }

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Goog-User-Project': projectId,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestPayload),
          signal,
        });

        if (response.ok) {
          const candidateText = await this.extractAnthropicResponseText(response);
          if (!candidateText) {
            throw new Error(`Vertex AI Anthropic model "${shortClaudeModel}" returned empty content.`);
          }
          return this.parseGeminiResponse(candidateText);
        }

        const errText = await response.text();
        if (response.status === 400) {
          throw new Error(
            `Vertex AI Anthropic model "${shortClaudeModel}" request error (HTTP 400): ${errText}`
          );
        }
        if (!primaryErrorText || primaryStatus === 404) {
          primaryStatus = response.status;
          primaryErrorText = errText;
        }
      }

      if (
        primaryStatus === 429 ||
        primaryErrorText.includes('RESOURCE_EXHAUSTED') ||
        primaryErrorText.includes('Quota exceeded')
      ) {
        throw new Error(
          `Vertex AI Anthropic model "${shortClaudeModel}" exceeded per-minute token or request quota in GCP project "${projectId}" (HTTP 429 RESOURCE_EXHAUSTED). Wait 60 seconds and retry, request a quota increase for "online_prediction_input_tokens_per_minute_per_base_model" in Google Cloud Console (https://console.cloud.google.com/iam-admin/quotas?project=${projectId}), or switch to Gemini 3.8 Flash / Gemini 4 Argon.`
        );
      }

      if (primaryStatus === 404 || primaryStatus === 403 || primaryErrorText.includes('NOT_FOUND') || primaryErrorText.includes('PERMISSION_DENIED')) {
        throw new Error(
          `Vertex AI Partner Model "${shortClaudeModel}" (publishers/anthropic/models/${shortClaudeModel}) is not enabled in GCP project "${projectId}" (HTTP ${primaryStatus}). Partner models like Anthropic Claude must first be enabled in the Google Cloud Console Model Garden (https://console.cloud.google.com/vertex-ai/model-garden?project=${projectId}) before use, or switch to an enabled MaaS / Gemini model.`
        );
      }

      throw new Error(
        `Vertex AI Anthropic model "${shortClaudeModel}" error in GCP project "${projectId}" (HTTP ${primaryStatus}): ${primaryErrorText}`
      );
    }

    // Route 2a: Mistral AI Partner Models on Vertex AI (:streamRawPredict / :rawPredict)
    if (model.startsWith('mistralai/') || model.includes('publishers/mistralai/models/')) {
      const shortMistralModel = model
        .replace(/^publishers\/mistralai\/models\//, '')
        .replace(/^mistralai\//, '');
      const candidateLocations = ['us-central1', 'europe-west4', 'global'];
      let primaryErrorText = '';
      let primaryStatus = 404;

      for (const loc of candidateLocations) {
        const host = loc === 'global' ? 'aiplatform.googleapis.com' : `${loc}-aiplatform.googleapis.com`;
        const url = `https://${host}/v1/projects/${projectId}/locations/${loc}/publishers/mistralai/models/${shortMistralModel}:streamRawPredict`;

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Goog-User-Project': projectId,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: shortMistralModel,
            max_tokens: 32768,
            temperature: 0.2,
            stream: true,
            messages: [
              {
                role: 'user',
                content: prompt + jsonInstructionSuffix,
              },
            ],
          }),
          signal,
        });

        if (response.ok) {
          const candidateText = await this.extractOpenAiResponseText(response);
          if (!candidateText) {
            throw new Error(`Vertex AI Mistral model "${shortMistralModel}" returned empty content.`);
          }
          return this.parseGeminiResponse(candidateText);
        }

        const errText = await response.text();
        if (response.status === 400) {
          throw new Error(
            `Vertex AI Mistral model "${shortMistralModel}" request error (HTTP 400): ${errText}`
          );
        }
        if (!primaryErrorText || primaryStatus === 404) {
          primaryStatus = response.status;
          primaryErrorText = errText;
        }
      }

      throw new Error(
        `Vertex AI Model Garden model "mistralai/${shortMistralModel}" is not enabled or accessible in GCP project "${projectId}" (HTTP ${primaryStatus}): ${primaryErrorText}`
      );
    }

    // Route 2b: Vertex AI Model Garden Open-Weights / MaaS Models (Qwen, DeepSeek, OpenAI OSS, Meta Llama)
    // NOTE: OpenMaaS models (such as deepseek-ai/deepseek-v3.2-maas and deepseek-ai/deepseek-r1-0528-maas)
    // generate at ~15-25 tokens/sec (taking ~300-750s for a full 19-file repository), so `stream: true`
    // is mandatory to return HTTP 200 headers in ~2-9s and avoid Node.js undici's 300s headersTimeout.
    // We also omit an explicit `max_tokens` cap so Vertex AI Dynamic Shared Quota (DSQ) does not reject
    // ~33k-token prompts due to upfront `input_tokens + max_tokens` reservation, and pass `frequency_penalty: 0.2`
    // to prevent autoregressive token repetition loops inside `.dockerignore` / `.gitignore`.
    if (model.includes('/') || model.endsWith('-maas')) {
      const maasModelId =
        model === 'qwen/qwen-2.5-coder-32b-instruct'
          ? 'qwen/qwen3-coder-480b-a35b-instruct-maas'
          : model;
      const candidateLocations =
        maasModelId.includes('deepseek-r1') || maasModelId.startsWith('meta/')
          ? ['us-central1', 'global']
          : ['global', 'us-central1'];

      let primaryErrorText = '';
      let primaryStatus = 404;

      for (const loc of candidateLocations) {
        const host = loc === 'global' ? 'aiplatform.googleapis.com' : `${loc}-aiplatform.googleapis.com`;
        const url = `https://${host}/v1beta1/projects/${projectId}/locations/${loc}/endpoints/openapi/chat/completions`;

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Goog-User-Project': projectId,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: maasModelId,
            temperature: 0.2,
            frequency_penalty: 0.2,
            stream: true,
            messages: [
              {
                role: 'user',
                content: prompt + jsonInstructionSuffix,
              },
            ],
          }),
          signal,
        });

        if (response.ok) {
          const candidateText = await this.extractOpenAiResponseText(response);
          if (!candidateText) {
            throw new Error(`Vertex AI Model Garden MaaS model "${maasModelId}" returned empty content.`);
          }
          return this.parseGeminiResponse(candidateText);
        }

        const errText = await response.text();
        if (response.status === 400) {
          throw new Error(
            `Vertex AI Model Garden MaaS model "${maasModelId}" request error (HTTP 400): ${errText}`
          );
        }
        if (!primaryErrorText || primaryStatus === 404) {
          primaryStatus = response.status;
          primaryErrorText = errText;
        }
      }

      if (
        primaryStatus === 429 ||
        primaryErrorText.includes('RESOURCE_EXHAUSTED') ||
        primaryErrorText.includes('Resource exhausted')
      ) {
        throw new Error(
          `Vertex AI Model Garden MaaS model "${maasModelId}" encountered Dynamic Shared Quota (DSQ) exhaustion in GCP project "${projectId}" (HTTP 429 RESOURCE_EXHAUSTED). Please wait 30-60 seconds and retry, or switch to Gemini 3.8 Flash / Gemini 4 Argon.`
        );
      }

      throw new Error(
        `Vertex AI Model Garden model "${maasModelId}" is not enabled or accessible in GCP project "${projectId}" (HTTP ${primaryStatus}): ${primaryErrorText}`
      );
    }

    // Route 3: Google Gemini Foundation Models (:streamGenerateContent?alt=sse)
    // NOTE: gemini-3.8-flash, gemini-3.7-flash, and gemini-4-argon are hosted on the 'global'
    // Vertex AI endpoint and return 404 NOT_FOUND on regional endpoints like 'us-central1'.
    // Using SSE streaming (:streamGenerateContent?alt=sse) ensures initial HTTP 200 headers return
    // in ~2-4s and prevents Node.js undici's 300s headersTimeout from aborting large multi-agent generations.
    const requiresGlobalEndpoint =
      model.includes('gemini-3.8') ||
      model.includes('gemini-3.7') ||
      model.includes('gemini-4');
    const location = requiresGlobalEndpoint
      ? 'global'
      : process.env.GOOGLE_CLOUD_LOCATION ||
        process.env.GOOGLE_CLOUD_REGION ||
        process.env.CLOUD_ML_REGION ||
        'global';
    const host = location === 'global' ? 'aiplatform.googleapis.com' : `${location}-aiplatform.googleapis.com`;
    const url = `https://${host}/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:streamGenerateContent?alt=sse`;

    const generationConfig: Record<string, any> = {
      temperature: 0.2,
      maxOutputTokens: 65536,
      responseMimeType: 'application/json',
      responseSchema: this.fileArraySchema,
    };
    if (model.includes('gemini-4')) {
      generationConfig.thinkingConfig = {
        thinkingLevel: 'LOW',
      };
    }

    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig,
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

    const candidateText = await this.extractGeminiResponseText(response);
    if (!candidateText) {
      throw new Error('Vertex AI Gemini returned empty candidate content.');
    }

    return this.parseGeminiResponse(candidateText);
  }

  /**
   * Reads a raw HTTP Response body (either as a ReadableStream or via response.text()/response.json()).
   */
  private async readResponseStreamOrText(response: any): Promise<{ rawText?: string; jsonData?: any }> {
    if (response?.body && typeof response.body.getReader === 'function') {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        if (value) {
          accumulated += decoder.decode(value, { stream: true });
        }
      }
      accumulated += decoder.decode();
      return { rawText: accumulated };
    }
    if (typeof response?.text === 'function') {
      return { rawText: await response.text() };
    }
    if (typeof response?.json === 'function') {
      return { jsonData: await response.json() };
    }
    return {};
  }

  /**
   * Records token usage metadata from Google Gemini responses (`usageMetadata`).
   */
  private recordGeminiUsageMetadata(usageMetadata: any): void {
    if (!usageMetadata || typeof usageMetadata !== 'object') {
      return;
    }
    const inputTokens =
      typeof usageMetadata.promptTokenCount === 'number' && usageMetadata.promptTokenCount > 0
        ? usageMetadata.promptTokenCount
        : this.lastTokenUsage?.inputTokens ?? 0;
    const candidatesTokens =
      typeof usageMetadata.candidatesTokenCount === 'number'
        ? usageMetadata.candidatesTokenCount
        : 0;
    const thoughtsTokens =
      typeof usageMetadata.thoughtsTokenCount === 'number'
        ? usageMetadata.thoughtsTokenCount
        : 0;
    const outputTokens =
      candidatesTokens + thoughtsTokens > 0
        ? candidatesTokens + thoughtsTokens
        : typeof usageMetadata.totalTokenCount === 'number' && inputTokens > 0
        ? Math.max(0, usageMetadata.totalTokenCount - inputTokens)
        : this.lastTokenUsage?.outputTokens ?? 0;

    if (inputTokens > 0 || outputTokens > 0) {
      this.lastTokenUsage = { inputTokens, outputTokens };
    }
  }

  /**
   * Records token usage metadata from Anthropic Claude responses (`usage`).
   */
  private recordAnthropicUsage(usage: any): void {
    if (!usage || typeof usage !== 'object') {
      return;
    }
    const prevInput = this.lastTokenUsage?.inputTokens ?? 0;
    const prevOutput = this.lastTokenUsage?.outputTokens ?? 0;
    const rawInput =
      (typeof usage.input_tokens === 'number' ? usage.input_tokens : 0) +
      (typeof usage.cache_creation_input_tokens === 'number' ? usage.cache_creation_input_tokens : 0) +
      (typeof usage.cache_read_input_tokens === 'number' ? usage.cache_read_input_tokens : 0);
    const inputTokens = rawInput > 0 ? rawInput : prevInput;
    const outputTokens =
      typeof usage.output_tokens === 'number' && usage.output_tokens > 0
        ? usage.output_tokens
        : prevOutput;
    if (inputTokens > 0 || outputTokens > 0) {
      this.lastTokenUsage = { inputTokens, outputTokens };
    }
  }

  /**
   * Records token usage metadata from OpenAI-compatible responses (`usage.prompt_tokens` / `usage.completion_tokens`).
   */
  private recordOpenAiCompatibleUsage(usage: any): void {
    if (!usage || typeof usage !== 'object') {
      return;
    }
    const inputTokens =
      typeof usage.prompt_tokens === 'number'
        ? usage.prompt_tokens
        : typeof usage.input_tokens === 'number'
        ? usage.input_tokens
        : this.lastTokenUsage?.inputTokens ?? 0;
    const outputTokens =
      typeof usage.completion_tokens === 'number'
        ? usage.completion_tokens
        : typeof usage.output_tokens === 'number'
        ? usage.output_tokens
        : this.lastTokenUsage?.outputTokens ?? 0;
    if (inputTokens > 0 || outputTokens > 0) {
      this.lastTokenUsage = { inputTokens, outputTokens };
    }
  }

  /**
   * Extracts non-thought text content from either a Gemini SSE stream (:streamGenerateContent?alt=sse)
   * or a standard unary Gemini JSON response (:generateContent).
   */
  private async extractGeminiResponseText(response: any): Promise<string> {
    const { rawText, jsonData } = await this.readResponseStreamOrText(response);

    if (jsonData !== undefined) {
      this.recordGeminiUsageMetadata(jsonData?.usageMetadata);
      const parts = jsonData?.candidates?.[0]?.content?.parts;
      const textPart = Array.isArray(parts)
        ? parts.find((p: any) => typeof p?.text === 'string' && !p?.thought) || parts[0]
        : undefined;
      return textPart?.text || '';
    }

    const trimmed = (rawText || '').trim();
    if (!trimmed) {
      return '';
    }

    // 1. SSE stream format (`data: {...}`)
    if (trimmed.startsWith('data:') || trimmed.includes('\ndata:')) {
      let accumulatedText = '';
      const lines = trimmed.split(/\r?\n/);
      for (const line of lines) {
        if (!line.startsWith('data:')) {
          continue;
        }
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') {
          continue;
        }
        try {
          const chunk = JSON.parse(payload);
          if (chunk?.usageMetadata) {
            this.recordGeminiUsageMetadata(chunk.usageMetadata);
          }
          const parts = chunk?.candidates?.[0]?.content?.parts;
          if (Array.isArray(parts)) {
            for (const p of parts) {
              if (typeof p?.text === 'string' && !p?.thought) {
                accumulatedText += p.text;
              }
            }
          }
        } catch {
          // Ignore malformed SSE lines
        }
      }
      if (accumulatedText) {
        return accumulatedText;
      }
    }

    // 2. Fallback: Unary JSON object or JSON array of chunks
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        let joined = '';
        for (const item of parsed) {
          if (item?.usageMetadata) {
            this.recordGeminiUsageMetadata(item.usageMetadata);
          }
          const parts = item?.candidates?.[0]?.content?.parts;
          if (Array.isArray(parts)) {
            for (const p of parts) {
              if (typeof p?.text === 'string' && !p?.thought) {
                joined += p.text;
              }
            }
          }
        }
        return joined;
      }
      if (parsed?.usageMetadata) {
        this.recordGeminiUsageMetadata(parsed.usageMetadata);
      }
      const parts = parsed?.candidates?.[0]?.content?.parts;
      const textPart = Array.isArray(parts)
        ? parts.find((p: any) => typeof p?.text === 'string' && !p?.thought) || parts[0]
        : undefined;
      return textPart?.text || '';
    } catch {
      return '';
    }
  }

  /**
   * Extracts text content from either an Anthropic SSE stream (`stream: true` on `:rawPredict` or `/v1/messages`)
   * or a standard unary Anthropic Messages JSON response, skipping adaptive thinking blocks.
   */
  private async extractAnthropicResponseText(response: any): Promise<string> {
    const { rawText, jsonData } = await this.readResponseStreamOrText(response);

    if (jsonData !== undefined) {
      this.recordAnthropicUsage(jsonData?.usage);
      const textBlock = Array.isArray(jsonData?.content)
        ? jsonData.content.find((b: any) => b && b.type === 'text' && typeof b.text === 'string')
        : undefined;
      return textBlock?.text || jsonData?.content?.[0]?.text || '';
    }

    const trimmed = (rawText || '').trim();
    if (!trimmed) {
      return '';
    }

    // 1. SSE stream format (`event: ...\ndata: {...}`)
    if (trimmed.startsWith('event:') || trimmed.startsWith('data:') || trimmed.includes('\ndata:')) {
      let accumulatedText = '';
      const lines = trimmed.split(/\r?\n/);
      for (const line of lines) {
        if (!line.startsWith('data:')) {
          continue;
        }
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') {
          continue;
        }
        try {
          const evt = JSON.parse(payload);
          if (evt?.type === 'error') {
            throw new Error(evt?.error?.message || JSON.stringify(evt.error || evt));
          }
          if (evt?.usage) {
            this.recordAnthropicUsage(evt.usage);
          }
          if (evt?.message?.usage) {
            this.recordAnthropicUsage(evt.message.usage);
          }
          if (
            evt?.type === 'content_block_delta' &&
            evt?.delta?.type === 'text_delta' &&
            typeof evt.delta.text === 'string'
          ) {
            accumulatedText += evt.delta.text;
          } else if (
            evt?.type === 'content_block_start' &&
            evt?.content_block?.type === 'text' &&
            typeof evt.content_block.text === 'string'
          ) {
            accumulatedText += evt.content_block.text;
          }
        } catch (err: any) {
          if (err instanceof Error && !err.message.includes('Unexpected token') && !err.message.includes('JSON')) {
            throw err;
          }
        }
      }
      if (accumulatedText) {
        return accumulatedText;
      }
    }

    // 2. Fallback: Unary JSON response
    try {
      const data = JSON.parse(trimmed);
      if (data?.usage) {
        this.recordAnthropicUsage(data.usage);
      }
      const textBlock = Array.isArray(data?.content)
        ? data.content.find((b: any) => b && b.type === 'text' && typeof b.text === 'string')
        : undefined;
      return textBlock?.text || data?.content?.[0]?.text || '';
    } catch {
      return '';
    }
  }

  /**
   * Extracts text content from either an OpenAI-compatible SSE stream (`stream: true` on
   * `/endpoints/openapi/chat/completions`, `:streamRawPredict`, or `/v1/chat/completions`)
   * or a standard unary OpenAI Chat Completions JSON response (`choices[0].message.content`).
   */
  private async extractOpenAiResponseText(response: any): Promise<string> {
    const { rawText, jsonData } = await this.readResponseStreamOrText(response);

    if (jsonData !== undefined) {
      this.recordOpenAiCompatibleUsage(jsonData?.usage);
      return jsonData?.choices?.[0]?.message?.content || '';
    }

    const trimmed = (rawText || '').trim();
    if (!trimmed) {
      return '';
    }

    // 1. SSE stream format (`data: {"choices":[{"delta":{"content":"..."}}]}`)
    if (trimmed.startsWith('data:') || trimmed.includes('\ndata:')) {
      let accumulatedText = '';
      const lines = trimmed.split(/\r?\n/);
      for (const line of lines) {
        if (!line.startsWith('data:')) {
          continue;
        }
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') {
          continue;
        }
        try {
          const chunk = JSON.parse(payload);
          if (chunk?.error) {
            throw new Error(chunk.error?.message || JSON.stringify(chunk.error));
          }
          if (chunk?.usage) {
            this.recordOpenAiCompatibleUsage(chunk.usage);
          }
          const deltaContent = chunk?.choices?.[0]?.delta?.content;
          if (typeof deltaContent === 'string') {
            accumulatedText += deltaContent;
          } else {
            const messageContent = chunk?.choices?.[0]?.message?.content;
            if (typeof messageContent === 'string') {
              accumulatedText += messageContent;
            }
          }
        } catch (err: any) {
          if (err instanceof Error && !err.message.includes('Unexpected token') && !err.message.includes('JSON')) {
            throw err;
          }
        }
      }
      if (accumulatedText) {
        return accumulatedText;
      }
    }

    // 2. Fallback: Unary JSON response
    try {
      const data = JSON.parse(trimmed);
      if (data?.usage) {
        this.recordOpenAiCompatibleUsage(data.usage);
      }
      return data?.choices?.[0]?.message?.content || '';
    } catch {
      return '';
    }
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
    // Strip <think>...</think> blocks emitted by reasoning models (e.g. DeepSeek R1, Qwen)
    clean = clean.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

    if (clean.startsWith('```json')) {
      clean = clean.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (clean.startsWith('```')) {
      clean = clean.replace(/^```\s*/, '').replace(/\s*```$/, '');
    } else {
      // Use greedy match for the outer JSON array inside code fences so inner ``` inside markdown/docstrings do not truncate
      const greedyFenceMatch = clean.match(/```(?:json)?\s*(\[\s*\{[\s\S]*\}\s*\])\s*```/);
      const nonGreedyFenceMatch = !greedyFenceMatch ? clean.match(/```(?:json)?\s*([\s\S]*?)\s*```/) : null;
      const fenceMatch = greedyFenceMatch || nonGreedyFenceMatch;
      if (fenceMatch && fenceMatch[1].trim().startsWith('[')) {
        clean = fenceMatch[1].trim();
      } else if (!clean.startsWith('[') && clean.includes('[')) {
        const arrayStartMatch = clean.match(/\[\s*\{/);
        const firstBracket = arrayStartMatch?.index !== undefined ? arrayStartMatch.index : clean.indexOf('[');
        const lastBracket = clean.lastIndexOf(']');
        if (firstBracket >= 0 && lastBracket > firstBracket) {
          clean = clean.slice(firstBracket, lastBracket + 1);
        }
      }
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

  /**
   * Calls Gemini with a JSON response schema and returns the parsed object. Used by the optional
   * code reviewer (Gemini-only). API key -> Gemini Developer API; otherwise Vertex AI via ADC
   * (Gemini 3.x / 4 models on the `global` location).
   *
   * @param prompt Prompt text.
   * @param responseSchema Gemini response schema.
   * @param apiKey Optional Gemini API key.
   * @param model Gemini model id.
   * @param signal Optional abort signal.
   */
  public async callGeminiJson(prompt: string, responseSchema: object, apiKey: string, model: string, signal?: AbortSignal): Promise<unknown> {
    // 1. Shared generation config (LOW thinking where supported, deterministic JSON output).
    const generationConfig: Record<string, any> = { temperature: 0.1, responseMimeType: 'application/json', responseSchema };
    if (model.includes('gemini-4') || model.includes('gemini-3')) {
      generationConfig.thinkingConfig = { thinkingLevel: 'LOW' };
    }
    const body = JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig });

    // 2. Route: API key (Developer API) or ADC (Vertex AI).
    let url: string;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) {
      url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    } else {
      const adcToken = this.getGCloudAccessToken();
      const projectId = this.getGCloudProjectId();
      if (!adcToken || !projectId) {
        throw new Error("Gemini reviewer requires an API key or ADC credentials and a gcloud project ('gcloud auth application-default login').");
      }
      url = `https://aiplatform.googleapis.com/v1/projects/${projectId}/locations/global/publishers/google/models/${model}:generateContent`;
      headers.Authorization = `Bearer ${adcToken}`;
    }

    // 3. Call and parse.
    const response = await fetch(url, { method: 'POST', headers, body, signal });
    if (!response.ok) {
      throw new Error(`Gemini reviewer API error (${response.status}): ${await response.text()}`);
    }
    const data: any = await response.json();
    const text = (data?.candidates?.[0]?.content?.parts || [])
      .filter((part: any) => !part.thought && typeof part.text === 'string')
      .map((part: any) => part.text)
      .join('');
    if (!text) {
      throw new Error('Gemini reviewer returned empty content.');
    }
    return JSON.parse(text.trim().replace(/^```json\s*/, '').replace(/\s*```$/, ''));
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

    const requiresGlobalEndpoint =
      model.includes('gemini-3.8') ||
      model.includes('gemini-3.7') ||
      model.includes('gemini-4');
    const location = requiresGlobalEndpoint
      ? 'global'
      : process.env.GOOGLE_CLOUD_LOCATION ||
        process.env.GOOGLE_CLOUD_REGION ||
        process.env.CLOUD_ML_REGION ||
        'global';
    const host = location === 'global' ? 'aiplatform.googleapis.com' : `${location}-aiplatform.googleapis.com`;
    const url = `https://${host}/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:generateContent`;

    const generationConfig: Record<string, any> = {
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: this.assertionSchema,
    };
    if (model.includes('gemini-4')) {
      generationConfig.thinkingConfig = {
        thinkingLevel: 'LOW',
      };
    }

    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig,
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
    const parts = data.candidates?.[0]?.content?.parts;
    const textPart = Array.isArray(parts)
      ? parts.find((p: any) => typeof p?.text === 'string' && !p?.thought) || parts[0]
      : undefined;
    const candidateText = textPart?.text;
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
   * Ensures that requirements.txt and .env.example contain the necessary
   * checkpointer driver libraries and backend configuration for the selected memory backend.
   *
   * Logic Flow:
   * 1. Inspects the workflow document and nodes for session memory configuration.
   * 2. Guarantees driver packages in requirements.txt (e.g. google-cloud-firestore, psycopg2-binary, google-cloud-spanner, redis).
   * 3. Guarantees SESSION_STORE_BACKEND in .env.example.
   *
   * @param doc The workflow document
   * @param files The array of generated files
   * @returns Updated array of generated files
   */
  public ensureSessionStore(doc: any, files: GeneratedFile[]): GeneratedFile[] {
    const updatedFiles = [...files];
    const nodes = doc?.nodes || [];

    const startNode = nodes.find((n: any) => n.data?.isStartNode) || nodes[0];
    const memoryConfig = startNode?.data?.memoryConfig || doc?.metadata?.settings?.customFields?.memoryConfig;
    const memType = memoryConfig?.type || 'in_memory';

    const hasFirestore = nodes.some((n: any) => n.data?.memoryConfig?.type === 'firestore') || memType === 'firestore';
    const hasPostgres = nodes.some((n: any) => n.data?.memoryConfig?.type === 'postgres' || n.data?.memoryConfig?.type === 'cloud_sql') || memType === 'postgres' || memType === 'cloud_sql';
    const hasSpanner = nodes.some((n: any) => n.data?.memoryConfig?.type === 'spanner') || memType === 'spanner';
    const hasRedis = nodes.some((n: any) => n.data?.memoryConfig?.type === 'redis') || memType === 'redis';
    const hasClaudeModel = nodes.some(
      (n: any) =>
        typeof n.data?.model === 'string' &&
        (n.data.model.startsWith('claude-') || n.data.model.includes('anthropic'))
    );
    const hasLiteLlmModel = nodes.some(
      (n: any) =>
        typeof n.data?.model === 'string' &&
        (n.data.model.includes('/') ||
          n.data.model.startsWith('gpt-') ||
          n.data.model.startsWith('o3-') ||
          n.data.model.startsWith('grok-')) &&
        !n.data.model.includes('publishers/anthropic')
    );

    // 1. Ensure requirements.txt includes the appropriate backend driver packages
    const reqIndex = updatedFiles.findIndex(
      (f) => f.path === 'requirements.txt' || f.path.endsWith('/requirements.txt')
    );

    if (reqIndex >= 0) {
      let reqContent = updatedFiles[reqIndex].content;
      const additions: string[] = [];

      if (hasFirestore && !reqContent.includes('google-cloud-firestore')) {
        additions.push('google-cloud-firestore>=2.16.0');
      }
      if (hasPostgres) {
        if (!reqContent.includes('psycopg2')) {
          additions.push('psycopg2-binary>=2.9.9');
        }
        if (!reqContent.includes('sqlalchemy')) {
          additions.push('sqlalchemy>=2.0.0');
        }
      }
      if (hasSpanner && !reqContent.includes('google-cloud-spanner')) {
        additions.push('google-cloud-spanner>=3.40.0');
      }
      if (hasRedis && !reqContent.includes('redis')) {
        additions.push('redis>=5.0.0');
      }
      if (hasClaudeModel && !reqContent.includes('anthropic')) {
        additions.push('anthropic[vertex]>=0.49.0');
      }
      if (hasLiteLlmModel && !reqContent.includes('litellm')) {
        additions.push('litellm>=1.60.0');
      }

      if (additions.length > 0) {
        reqContent = reqContent.trimEnd() + '\n' + additions.join('\n') + '\n';
        updatedFiles[reqIndex] = {
          ...updatedFiles[reqIndex],
          content: reqContent,
        };
      }
    }

    // 3. Ensure .env.example includes SESSION_STORE_BACKEND
    const envIndex = updatedFiles.findIndex(
      (f) => f.path === '.env.example' || f.path.endsWith('/.env.example')
    );

    if (envIndex >= 0) {
      let envContent = updatedFiles[envIndex].content;
      if (!envContent.includes('SESSION_STORE_BACKEND')) {
        envContent = envContent.trimEnd() + `\n# Session Memory Checkpointer Configuration\nSESSION_STORE_BACKEND=${memType}\n`;
        updatedFiles[envIndex] = {
          ...updatedFiles[envIndex],
          content: envContent,
        };
      }
    }

    return updatedFiles;
  }

  /**
   * Finalizes the generated file repository:
   * 1. Validates that core files ('agent.py') and 'root_agent' exist
   * 2. Guarantees required runtime packages (such as A2A) in requirements.txt
   * 3. Guarantees production session store checkpointers ('session_store.py') and driver dependencies
   * 4. Extracts and writes dedicated agent card JSON files for any A2A nodes
   *
   * @param doc The workflow document
   * @param files The raw generated files from Gemini
   * @returns Final files ready for deployment and execution
   */
  public finalizeGeneratedFiles(doc: any, files: GeneratedFile[]): GeneratedFile[] {
    this.validateGeneratedFiles(doc, files);
    this.validateRequiredDependencies(doc, files);
    let result = this.ensureSessionStore(doc, files);
    result = this.ensureAgentCards(doc, result);
    return result;
  }
}



