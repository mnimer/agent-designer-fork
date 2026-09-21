/**
 * Integration Test Codegen Runner for Visual Agent Designer.
 *
 * Author: Mike Nimer <mikenimer@google.com>
 *
 * Purpose:
 * Executes the end-to-end code generation pipeline and evaluates the resulting code
 * using the Multi-Agent Code Evaluation Harness.
 *
 * Architectural decisions:
 * - Initializes the GoogleGenAI client with Vertex AI in the 'global' region
 *   (or uses GEMINI_API_KEY if explicitly set).
 * - Interpolates the raw .agent JSON workflow into the prompt template located in
 *   `resource/prompts/`.
 * - Constrains code generation using structured JSON outputs to produce a strongly-typed
 *   array of file objects.
 * - Dispatches generated files to the Multi-Agent Evaluator and records results in
 *   `test-report.md`.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { GoogleGenAI } from '@google/genai';
import { runMultiAgentEvaluation, formatEvaluationReport } from './evaluators/multi-agent-evaluator';
import { recordTestRun } from './test-reporter';
import { GeneratedFileCandidate } from './evaluators/deterministic-gate';
import { MultiAgentEvaluationResult } from './evaluators/types';

export const CODEGEN_MODEL = 'gemini-3.7-flash';

/**
 * Resolves the Google Cloud project ID from environment or gcloud CLI.
 */
export function getProjectId(): string | undefined {
    if (process.env.GOOGLE_CLOUD_PROJECT) {
        return process.env.GOOGLE_CLOUD_PROJECT;
    }
    if (process.env.GCLOUD_PROJECT) {
        return process.env.GCLOUD_PROJECT;
    }
    try {
        const out = execSync('gcloud config get-value project 2>/dev/null', { timeout: 5000 }).toString().trim();
        if (out && out !== '(unset)') {
            return out;
        }
    } catch {
        // gcloud CLI not available
    }
    return undefined;
}

/**
 * Creates an authenticated GoogleGenAI client.
 * Supports API Key or Vertex AI with global region.
 */
export function createGeminiClient(): GoogleGenAI {
    if (process.env.GEMINI_API_KEY) {
        return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    }

    const projectId = getProjectId();
    return new GoogleGenAI({
        vertexai: true,
        project: projectId,
        location: 'global'
    });
}

/**
 * Resolves the prompt template from resource/prompts/.
 *
 * @param framework - Target framework (e.g. 'google-adk').
 * @param deploymentTarget - Target deployment (e.g. 'agent_engine', 'cloudrun').
 * @param language - Target language (e.g. 'python').
 */
export function resolvePromptTemplate(
    framework: string = 'google-adk',
    deploymentTarget: string = 'agent_engine',
    language: string = 'python'
): { templateContent: string; promptFilePath: string } {
    const projectRoot = path.resolve(__dirname, '../../');
    const normalizedTarget = deploymentTarget.toLowerCase().replace(/_/g, '-');
    const filename = `${language}_adk_${normalizedTarget}.prompt.txt`;
    const promptPath = path.join(projectRoot, 'resource', 'prompts', filename);

    if (fs.existsSync(promptPath)) {
        return {
            templateContent: fs.readFileSync(promptPath, 'utf-8'),
            promptFilePath: `resource/prompts/${filename}`
        };
    }

    // Fallback to agent-engine prompt if specific target not found
    const fallbackPath = path.join(projectRoot, 'resource', 'prompts', 'python_adk_agent-engine.prompt.txt');
    if (fs.existsSync(fallbackPath)) {
        return {
            templateContent: fs.readFileSync(fallbackPath, 'utf-8'),
            promptFilePath: 'resource/prompts/python_adk_agent-engine.prompt.txt'
        };
    }

    throw new Error(`Could not find prompt template at ${promptPath} or fallback ${fallbackPath}`);
}

/**
 * Runs end-to-end code generation and multi-agent evaluation for a given .agent workflow file.
 *
 * @param testKey - Unique key identifying this test run.
 * @param testName - Human-readable test name.
 * @param agentFilePathOrJson - Path to .agent JSON file or raw JSON string.
 * @param deploymentTarget - Optional override for deployment target ('agent_engine' | 'cloudrun').
 */
export async function runCodegenAndEvaluate(
    testKey: string,
    testName: string,
    agentFilePathOrJson: string,
    deploymentTarget?: string
): Promise<{
    isGood: boolean;
    evaluation: MultiAgentEvaluationResult;
    generatedFiles: GeneratedFileCandidate[];
    durationMs: number;
}> {
    const startTime = Date.now();

    // 1. Load workflow JSON
    let workflowJson: string;
    let pipelineName = 'agent_workflow';

    if (fs.existsSync(agentFilePathOrJson)) {
        workflowJson = fs.readFileSync(agentFilePathOrJson, 'utf-8');
        pipelineName = path.basename(agentFilePathOrJson, path.extname(agentFilePathOrJson));
    } else {
        workflowJson = agentFilePathOrJson;
    }

    const parsedJson = JSON.parse(workflowJson);
    if (parsedJson.name) {
        pipelineName = parsedJson.name;
    }

    const target = deploymentTarget || parsedJson.deployment?.deploymentTarget || parsedJson.deployment?.target || 'agent_engine';
    const framework = parsedJson.framework || 'google-adk';
    const language = parsedJson.language || 'python';

    // Synchronize deploymentTarget into workflowJson if an override was specified
    if (deploymentTarget && parsedJson.deployment) {
        parsedJson.deployment.deploymentTarget = target;
        parsedJson.deployment.target = target;
        workflowJson = JSON.stringify(parsedJson, null, 2);
    }

    console.log(`\n======================================================`);
    console.log(`🚀 Starting Codegen & Multi-Agent Evaluation for: ${testName}`);
    console.log(`   Pipeline: ${pipelineName} | Target: ${target} | Framework: ${framework}`);
    console.log(`======================================================`);

    // 2. Initialize GenAI client
    const ai = createGeminiClient();

    // 3. Load prompt template and interpolate
    const { templateContent, promptFilePath } = resolvePromptTemplate(framework, target, language);
    const fullPrompt = templateContent.replace('{{WORKFLOW_JSON}}', workflowJson);

    console.log(`   [Codegen] Generating code using model: ${CODEGEN_MODEL} (Prompt: ${promptFilePath})...`);

    const fileArraySchema = {
        type: 'array',
        description: 'Complete list of generated files for the AI Agent project.',
        items: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'Relative file path (e.g. agent.py, requirements.txt, Dockerfile)'
                },
                description: {
                    type: 'string',
                    description: 'Brief summary of file purpose'
                },
                content: {
                    type: 'string',
                    description: 'Complete unabridged source code for this file'
                }
            },
            required: ['path', 'description', 'content']
        }
    };

    const genResponse = await ai.models.generateContent({
        model: CODEGEN_MODEL,
        contents: fullPrompt,
        config: {
            temperature: 0.2,
            responseMimeType: 'application/json',
            responseSchema: fileArraySchema
        }
    });

    if (!genResponse.text) {
        throw new Error(`LLM code generation returned empty response for ${testName}`);
    }

    const rawFiles: { path: string; description?: string; content: string }[] = JSON.parse(genResponse.text);
    const generatedFiles: GeneratedFileCandidate[] = rawFiles.map(f => ({
        filename: f.path,
        content: f.content
    }));

    console.log(`   [Codegen] Generated ${generatedFiles.length} files: [${generatedFiles.map(f => f.filename).join(', ')}]`);

    // 4. Run Multi-Agent Evaluation Harness
    console.log(`   [MultiAgentEvaluator] Evaluating generated codebase...`);
    const evaluation = await runMultiAgentEvaluation(ai, workflowJson, templateContent, generatedFiles);

    const durationMs = Date.now() - startTime;

    // 5. Output formatted report
    console.log(formatEvaluationReport(evaluation, `${framework} -> ${target}`));

    // 6. Record in persistent test-report.md
    recordTestRun(testKey, testName, pipelineName, target, durationMs, evaluation, generatedFiles);

    return {
        isGood: evaluation.isGood,
        evaluation,
        generatedFiles,
        durationMs
    };
}
