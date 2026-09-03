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
 * 5. Dynamic Skill Append: Appends markdown skill documents from `resource/skills/<framework>/*.md` to the end of the prompt under `## ADK Skills Reference` so Gemini has full context of the ADK API, workflows, and deployment infrastructure.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { GeneratedFile, CodeGenRequest, CodeGenResult } from '../shared/codegen/types';

export interface AssertionEvaluationRequest {
  inputQuery: string;
  expectedCriteria: string;
  actualOutput: string;
  model?: string;
  apiKey?: string;
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
    const model = request.model || 'gemini-flash-latest';
    const apiKey = request.apiKey || process.env.GEMINI_API_KEY || '';

    try {
      // 1. Load prompt template from resource/prompts directory
      const promptTemplate = this.loadPromptTemplate(framework, language, target);
      const workflowJson = JSON.stringify(doc, null, 2);
      let interpolatedPrompt = promptTemplate.replace('{{WORKFLOW_JSON}}', workflowJson);

      // 2. Append markdown skills from resource/skills/adk/*.md to the end of the prompt instructions
      interpolatedPrompt = this.appendSkillsToPrompt(interpolatedPrompt, framework);

      // 3. Invoke Gemini LLM with credentials (API Key or ADC)
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
   * Loads all markdown skill references from `resource/skills/<framework>/*.md` (or `resource/skills/adk/`)
   * in deterministic order and returns their concatenated markdown content.
   *
   * Logic Flow:
   * 1. Resolves candidate directories for skills under extensionPath and cwd.
   * 2. Scans for all `.md` files (ignoring README.md or lowercase variations).
   * 3. Sorts file paths alphabetically to ensure deterministic prompt assembly.
   * 4. Reads and concatenates file contents separated by markdown horizontal dividers.
   *
   * @param framework Framework identifier (e.g., 'google-adk', 'adk')
   * @returns Formatted markdown string containing the contents of each skill file
   */
  public loadSkillsReference(framework?: string): string {
    // Section 1: Resolve the target framework directory name
    const cleanFramework = (framework || 'adk')
      .replace('google-', '')
      .replace('-', '_')
      .replace('google_', '');

    const isAdk = cleanFramework === 'adk' || !framework;

    // Section 2: Identify candidate search directories for skill files
    const candidateDirs = [
      path.join(this.extensionPath, 'resource', 'skills', cleanFramework),
      path.join(process.cwd(), 'resource', 'skills', cleanFramework),
    ];

    if (isAdk) {
      candidateDirs.push(
        path.join(this.extensionPath, 'resource', 'skills', 'adk'),
        path.join(process.cwd(), 'resource', 'skills', 'adk')
      );
    }

    let skillsDir: string | null = null;
    for (const dir of candidateDirs) {
      if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
        skillsDir = dir;
        break;
      }
    }

    // Return empty string if no valid skills directory is located
    if (!skillsDir) {
      return '';
    }

    // Section 3: Read and sort all markdown files (excluding README.md)
    const files = fs
      .readdirSync(skillsDir)
      .filter((file) => file.endsWith('.md') && !file.toLowerCase().startsWith('readme'))
      .sort((a, b) => a.localeCompare(b));

    if (files.length === 0) {
      return '';
    }

    // Section 4: Read content for each skill file
    const skillContents: string[] = [];
    for (const file of files) {
      const filePath = path.join(skillsDir, file);
      try {
        const content = fs.readFileSync(filePath, 'utf-8').trim();
        if (content.length > 0) {
          skillContents.push(content);
        }
      } catch (readErr) {
        // NOTE: Silently skip any unreadable files to ensure robust prompt generation
      }
    }

    return skillContents.join('\n\n---\n\n');
  }

  /**
   * Appends the loaded skills markdown files to the end of the prompt instructions
   * under the block:
   * #################################################
   * ## ADK Skills Reference
   *
   * Logic Flow:
   * 1. Loads all skill markdown documents for the target framework.
   * 2. If no skills are found, returns the base prompt unchanged.
   * 3. Checks if the prompt already contains the "## ADK Skills Reference" header block.
   *    - If present, trims any trailing whitespace after the header and appends the skills content.
   *    - If absent, appends the header block delimiter followed by the skills content.
   *
   * @param basePrompt The base prompt string (already interpolated with workflow JSON)
   * @param framework Framework identifier (e.g. 'google-adk')
   * @returns The full prompt with skills appended under the ADK Skills Reference block
   */
  public appendSkillsToPrompt(basePrompt: string, framework?: string): string {
    // Section 1: Retrieve concatenated skill markdown files
    const skillsContent = this.loadSkillsReference(framework);
    if (!skillsContent) {
      return basePrompt;
    }

    const headerMarker = '## ADK Skills Reference';
    const blockHeader = '#################################################\n## ADK Skills Reference';

    // Section 2: If the template already includes the marker, append right after it
    if (basePrompt.includes(headerMarker)) {
      const markerIndex = basePrompt.indexOf(headerMarker);
      const beforeMarker = basePrompt.substring(0, markerIndex + headerMarker.length);
      return `${beforeMarker.trimEnd()}\n\n${skillsContent}\n`;
    }

    // Section 3: If marker was not present in the template, append both the header and skills content
    return `${basePrompt.trimEnd()}\n\n${blockHeader}\n\n${skillsContent}\n`;
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
  private async callGeminiWithApiKey(prompt: string, apiKey: string, model: string): Promise<GeneratedFile[]> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const requestBody = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: this.fileArraySchema,
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
    projectId: string
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
   * Evaluates an agent test execution result using Gemini as an LLM judge.
   * Compares the input query, expected criteria/outcome, and actual output.
   *
   * @param request AssertionEvaluationRequest
   * @returns AssertionEvaluationResult containing pass/fail and explanation
   */
  public async evaluateAssertion(request: AssertionEvaluationRequest): Promise<AssertionEvaluationResult> {
    const { inputQuery, expectedCriteria, actualOutput, model = 'gemini-flash-latest' } = request;
    const apiKey = request.apiKey || process.env.GEMINI_API_KEY || '';

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
}



