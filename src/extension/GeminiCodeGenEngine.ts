/**
 * GeminiCodeGenEngine
 *
 * Pure LLM prompt-driven code generation engine that takes a visual Agent Workflow document,
 * loads framework-specific prompt templates from `resource/prompts/`, interpolates the graph JSON,
 * and calls Gemini (gemini-flash-latest) to synthesize a complete production repository.
 *
 * Architectural Decisions:
 * 1. Pure LLM Generation: Code synthesis is 100% delegated to Gemini LLM (`gemini-flash-latest`). Zero template fallbacks.
 * 2. Prompt Decoupling: Prompts reside in `resource/prompts/` (e.g., `resource/prompts/python-adk.prompt.txt`).
 * 3. Multi-Credential Support: Authenticates via `GEMINI_API_KEY` (settings/env) or falls back to Google Application Default Credentials (ADC).
 * 4. Structured Output Parsing: Robustly parses multi-file JSON arrays conforming to `{ path, description, content }`.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { GoogleGenAI } from '@google/genai';
import { GeneratedFile, CodeGenRequest, CodeGenResult } from '../shared/codegen/types';

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
    const model = request.model || 'gemini-flash-latest';
    const apiKey = request.apiKey || process.env.GEMINI_API_KEY || '';

    try {
      // 1. Load prompt template from resource/prompts directory
      const promptTemplate = this.loadPromptTemplate(framework, language);
      const workflowJson = JSON.stringify(doc, null, 2);
      const interpolatedPrompt = promptTemplate.replace('{{WORKFLOW_JSON}}', workflowJson);

      // 2. Invoke Gemini LLM with credentials (API Key or ADC)
      const generatedFiles = await this.callGeminiApi(interpolatedPrompt, apiKey, model);

      if (!generatedFiles || generatedFiles.length === 0) {
        throw new Error('Gemini returned an empty file list. Please verify the prompt and model output.');
      }

      return {
        success: true,
        files: generatedFiles,
        modelUsed: model,
        timestamp: new Date().toISOString(),
      };
    } catch (err: any) {
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
   * Loads the prompt template file corresponding to the target framework and language
   * from the `resource/prompts/` directory.
   *
   * @param framework Framework identifier (e.g. 'google-adk', 'langgraph')
   * @param language Programming language (e.g. 'python', 'typescript')
   * @returns The raw string prompt template
   */
  public loadPromptTemplate(framework: string, language: string): string {
    const cleanFramework = framework.replace('google-', '').replace('_', '-');
    const promptFileName = `${language}-${cleanFramework}.prompt.txt`;

    const candidatePaths = [
      path.join(this.extensionPath, 'resource', 'prompts', promptFileName),
      path.join(this.extensionPath, 'resource', 'prompts', 'python-adk.prompt.txt'),
      path.join(process.cwd(), 'resource', 'prompts', promptFileName),
      path.join(process.cwd(), 'resource', 'prompts', 'python-adk.prompt.txt'),
    ];

    for (const candidate of candidatePaths) {
      if (fs.existsSync(candidate)) {
        return fs.readFileSync(candidate, 'utf-8');
      }
    }

    throw new Error(
      `Prompt template not found for framework '${framework}' and language '${language}'. Looked in: ${candidatePaths.join(', ')}`
    );
  }

  /**
   * Invokes the Gemini API via @google/genai SDK or direct REST with API Key / ADC.
   *
   * @param prompt Full interpolated prompt instruction
   * @param apiKey Optional Gemini API key
   * @param model Target model identifier (default: 'gemini-flash-latest')
   * @returns Array of generated file objects
   */
  /**
   * Invokes the Gemini API via @google/genai SDK or direct REST with API Key / ADC.
   * Seamlessly falls back to Google Application Default Credentials (ADC) if the API key fails.
   *
   * @param prompt Full interpolated prompt instruction
   * @param apiKey Optional Gemini API key
   * @param model Target model identifier (default: 'gemini-flash-latest')
   * @returns Array of generated file objects
   */
  public async callGeminiApi(prompt: string, apiKey: string, model: string): Promise<GeneratedFile[]> {
    let apiKeyError: Error | null = null;

    // Strategy A: Direct API Key provided
    if (apiKey) {
      try {
        return await this.callGeminiWithApiKey(prompt, apiKey, model);
      } catch (err: any) {
        apiKeyError = err;
        // API key failed (e.g. invalid, revoked, or expired) - proceed to fallback Strategy B (ADC)
      }
    }

    // Strategy B: Google Application Default Credentials (ADC) / Vertex AI
    try {
      return await this.callGeminiWithAdc(prompt, model);
    } catch (adcErr: any) {
      if (apiKeyError) {
        throw new Error(
          `Gemini code generation failed: API Key error (${apiKeyError.message}) and Application Default Credentials fallback failed (${adcErr.message}). Run 'gcloud auth application-default login' or update your API key.`
        );
      }
      throw adcErr;
    }
  }

  /**
   * Calls Gemini REST API using an API key.
   *
   * @param prompt Prompt string
   * @param apiKey API key
   * @param model Model name
   */
  private async callGeminiWithApiKey(prompt: string, apiKey: string, model: string): Promise<GeneratedFile[]> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const requestBody = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
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

    return this.parseGeminiResponse(candidateText);
  }

  /**
   * Calls Gemini using Google Application Default Credentials (ADC) or Vertex AI.
   *
   * @param prompt Prompt string
   * @param model Model name
   */
  private async callGeminiWithAdc(prompt: string, model: string): Promise<GeneratedFile[]> {
    // 1. Attempt Vertex AI with ADC token and project ID
    const adcToken = this.getGCloudAccessToken();
    const projectId = this.getGCloudProjectId();

    if (adcToken && projectId) {
      return this.callVertexAiGemini(prompt, model, adcToken, projectId);
    }

    // 2. Try initializing GoogleGenAI with default environment
    try {
      const ai = new GoogleGenAI({});
      const response = await ai.models.generateContent({
        model: model,
        contents: prompt,
        config: {
          temperature: 0.2,
          responseMimeType: 'application/json',
        },
      });

      if (response && response.text) {
        return this.parseGeminiResponse(response.text);
      }
    } catch (sdkErr: any) {
      throw new Error(
        `Gemini ADC authentication failed: ${sdkErr?.message}. Please run 'gcloud auth application-default login' and ensure a project is set via 'gcloud config set project <PROJECT_ID>'.`
      );
    }

    throw new Error('Failed to generate code via Gemini Application Default Credentials.');
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
    projectId: string
  ): Promise<GeneratedFile[]> {
    const location = process.env.GOOGLE_CLOUD_REGION || process.env.CLOUD_ML_REGION || 'us-central1';
    // Map developer model names to Vertex AI model names
    const vertexModel = model === 'gemini-flash-latest' ? 'gemini-2.5-flash' : model;
    const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${vertexModel}:generateContent`;

    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
      },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
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
   * Strips markdown code fences (```json ... ```) and parses the JSON response into GeneratedFile array.
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
    } catch (err: any) {
      throw new Error(`Failed to parse structured JSON response from Gemini: ${err?.message}\nRaw response:\n${rawResponse.substring(0, 500)}`);
    }
  }
}

