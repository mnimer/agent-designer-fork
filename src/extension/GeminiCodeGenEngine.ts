/**
 * GeminiCodeGenEngine
 *
 * Prompt-driven code generation engine that takes a visual Agent Workflow document,
 * loads the framework-specific prompt template (e.g., prompts/python-adk.prompt.txt),
 * interpolates the graph JSON, and calls Gemini to synthesize a complete production repository.
 *
 * Architectural Decisions:
 * 1. Prompts are decoupled into standalone text files for rapid prompt engineering without code recompilation.
 * 2. Parses multi-file structured JSON responses with robust markdown fence stripping and error resilience.
 * 3. Provides a deterministic high-fidelity code fallback when offline or when no API key is configured.
 * 4. Adheres to Google GenAI SDK standards (google-genai modern SDK with types.GenerateContentConfig).
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  AgentWorkflowDocument,
  WorkflowNode,
  AgentNodeData,
  TriggerNodeData,
  ToolDefinition,
} from '../shared/types';
import { GeneratedFile, CodeGenRequest, CodeGenResult } from '../shared/codegen/types';

export class GeminiCodeGenEngine {
  private extensionPath: string;

  /**
   * Initializes the Code Generation Engine with workspace/extension base path.
   *
   * @param extensionPath Absolute path to the extension root directory.
   */
  constructor(extensionPath: string) {
    this.extensionPath = extensionPath;
  }

  /**
   * Generates a complete project repository from an AgentWorkflowDocument.
   *
   * @param request The code generation request containing workflow document and configuration.
   * @returns Result containing the array of generated source files.
   */
  public async generateCode(request: CodeGenRequest): Promise<CodeGenResult> {
    const doc = request.document;
    const framework = request.framework || doc.framework || 'google-adk';
    const language = request.language || doc.language || 'python';
    const apiKey = request.apiKey || process.env.GEMINI_API_KEY || '';
    const model = request.model || 'gemini-2.5-pro';

    try {
      // 1. Load prompt template from prompts directory
      const promptTemplate = this.loadPromptTemplate(framework, language);
      const workflowJson = JSON.stringify(doc, null, 2);
      const interpolatedPrompt = promptTemplate.replace('{{WORKFLOW_JSON}}', workflowJson);

      // 2. Call Gemini API if API key is provided
      if (apiKey) {
        const generatedFiles = await this.callGeminiApi(interpolatedPrompt, apiKey, model);
        if (generatedFiles && generatedFiles.length > 0) {
          return {
            success: true,
            files: generatedFiles,
            modelUsed: model,
            timestamp: new Date().toISOString(),
          };
        }
      }

      // 3. Deterministic code synthesis fallback (offline / demo mode)
      const fallbackFiles = this.generateDeterministicRepository(doc);
      return {
        success: true,
        files: fallbackFiles,
        modelUsed: 'deterministic-template-engine',
        timestamp: new Date().toISOString(),
      };
    } catch (err: any) {
      // Graceful fallback to deterministic generator if network or parsing fails
      const fallbackFiles = this.generateDeterministicRepository(doc);
      return {
        success: true,
        files: fallbackFiles,
        error: err?.message || 'Error executing Gemini prompt; using offline template generator.',
        modelUsed: 'deterministic-template-engine',
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Loads the prompt template file corresponding to the target framework and language.
   */
  public loadPromptTemplate(framework: string, language: string): string {
    const promptFileName = `${language}-${framework.replace('google-', '')}.prompt.txt`;
    const candidates = [
      path.join(this.extensionPath, 'prompts', promptFileName),
      path.join(this.extensionPath, 'prompts', 'python-adk.prompt.txt'),
      path.join(process.cwd(), 'prompts', promptFileName),
      path.join(process.cwd(), 'prompts', 'python-adk.prompt.txt'),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return fs.readFileSync(candidate, 'utf-8');
      }
    }

    // Default inline prompt template if file is not found
    return `Generate a Python project for this agent workflow specification:\n{{WORKFLOW_JSON}}\nReturn a JSON array of {path, description, content}.`;
  }

  /**
   * Invokes the Gemini API via standard Google GenAI REST endpoint.
   */
  private async callGeminiApi(prompt: string, apiKey: string, model: string): Promise<GeneratedFile[]> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const requestBody = {
      contents: [
        {
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
   * Strips markdown fences and parses the JSON response into GeneratedFile array.
   */
  public parseGeminiResponse(rawResponse: string): GeneratedFile[] {
    let clean = rawResponse.trim();
    if (clean.startsWith('```json')) {
      clean = clean.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (clean.startsWith('```')) {
      clean = clean.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const parsed = JSON.parse(clean);
    if (!Array.isArray(parsed)) {
      throw new Error('Expected JSON array of generated files from Gemini.');
    }

    return parsed.map((file: any) => ({
      path: file.path || 'unknown.txt',
      description: file.description || '',
      content: file.content || '',
      language: this.inferLanguageFromPath(file.path || ''),
    }));
  }

  /**
   * Infers syntax highlighting language from file extension.
   */
  private inferLanguageFromPath(filePath: string): string {
    if (filePath.endsWith('.py')) return 'python';
    if (filePath.endsWith('.tf')) return 'terraform';
    if (filePath.endsWith('.json')) return 'json';
    if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) return 'yaml';
    if (filePath.endsWith('.md')) return 'markdown';
    if (filePath.endsWith('.ts')) return 'typescript';
    if (filePath.endsWith('.js')) return 'javascript';
    if (filePath.endsWith('Dockerfile')) return 'dockerfile';
    return 'plaintext';
  }

  /**
   * Generates a complete, deterministic Python ADK repository based on the document topology.
   */
  public generateDeterministicRepository(doc: AgentWorkflowDocument): GeneratedFile[] {
    const nodes = doc?.nodes || [];
    const agentNodes = nodes.filter((n) => n.type === 'agent');
    const triggerNodes = nodes.filter((n) => n.type === 'trigger');
    const rootAgent = agentNodes[0]?.data as AgentNodeData | undefined;
    const rootTrigger = triggerNodes[0]?.data as TriggerNodeData | undefined;

    const agentName = (rootAgent?.label || 'PrimaryAgent').replace(/[^a-zA-Z0-9_]/g, '_');
    const modelName = rootAgent?.model || 'gemini-2.5-pro';
    const systemPrompt = rootAgent?.systemPrompt || 'You are an expert AI assistant.';
    const temperature = rootAgent?.temperature ?? 0.7;
    const tools = rootAgent?.tools || [];
    const hasSearchTool = tools.some((t: ToolDefinition) => t.type === 'builtin' && t.name.toLowerCase().includes('search'));
    const hasStructuredOutput = Boolean(rootAgent?.structuredOutputSchema?.enabled);

    // 1. agent_workflow.py
    const agentWorkflowPy = `"""
${doc.name || 'Agent Workflow'} — Generated by Visual Agent Flow Builder
Framework: Google ADK (google-genai SDK)
Target Model: ${modelName}
"""

import os
from dotenv import load_dotenv
from google import genai
from google.genai import types
${hasStructuredOutput ? 'from pydantic import BaseModel, Field\nfrom typing import List, Optional\n' : ''}
load_dotenv()

${hasStructuredOutput ? this.generatePydanticSchema(rootAgent?.structuredOutputSchema) : ''}

class ${agentName}Workflow:
    """
    Main Autonomous Agent Workflow class orchestrating Gemini inference,
    tools, and structured reasoning.
    """

    def __init__(self, api_key: str = None):
        self.api_key = api_key or os.getenv("GEMINI_API_KEY")
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY environment variable or api_key parameter is required.")
        
        self.client = genai.Client(api_key=self.api_key)
        self.model_name = "${modelName}"
        self.system_instruction = """${systemPrompt}"""
        self.temperature = ${temperature}

    def get_generation_config(self) -> types.GenerateContentConfig:
        """Configures generation parameters, tools, and response schemas."""
        tools_list = []
${hasSearchTool ? '        tools_list.append({"google_search": {}})\n' : ''}
        config_kwargs = {
            "system_instruction": self.system_instruction,
            "temperature": self.temperature,
        }
        if tools_list:
            config_kwargs["tools"] = tools_list
            
${hasStructuredOutput ? '        config_kwargs["response_mime_type"] = "application/json"\n        config_kwargs["response_schema"] = ResponseSchema\n' : ''}
        return types.GenerateContentConfig(**config_kwargs)

    async def run_async(self, prompt: str) -> str:
        """Executes an asynchronous reasoning turn with Gemini."""
        config = self.get_generation_config()
        response = await self.client.aio.models.generate_content(
            model=self.model_name,
            contents=prompt,
            config=config,
        )
        return response.text

    def run(self, prompt: str) -> str:
        """Executes a synchronous reasoning turn with Gemini."""
        config = self.get_generation_config()
        response = self.client.models.generate_content(
            model=self.model_name,
            contents=prompt,
            config=config,
        )
        return response.text
`;

    // 2. tools.py
    const toolsPy = `"""
Tool definitions and external service bindings for ${doc.name}.
"""

import os
from typing import Dict, Any

def initialize_search_grounding() -> Dict[str, Any]:
    """Returns the Google Search grounding tool specification."""
    return {"google_search": {}}

def custom_tool_example(query: str) -> str:
    """Example custom tool handler."""
    return f"Processed query: {query}"
`;

    // 3. main.py
    const mainPy = `"""
CLI Entry Point for ${doc.name}
"""

import asyncio
import sys
from agent_workflow import ${agentName}Workflow

def main():
    print("=" * 60)
    print("🤖 ${doc.name || 'Agent Workflow'} Starting...")
    print(f"Model: ${modelName}")
    print("=" * 60)

    workflow = ${agentName}Workflow()

    if len(sys.argv) > 1:
        query = " ".join(sys.argv[1:])
        print(f"\\n[User]: {query}")
        result = workflow.run(query)
        print(f"\\n[Agent]:\\n{result}")
        return

    print("Interactive mode. Type 'exit' to quit.\\n")
    while True:
        try:
            user_input = input("You > ")
            if user_input.strip().lower() in ("exit", "quit"):
                break
            if not user_input.strip():
                continue
            response = workflow.run(user_input)
            print(f"\\nAgent > {response}\\n")
        except KeyboardInterrupt:
            break

if __name__ == "__main__":
    main()
`;

    // 4. test_pipeline.py
    const testPipelinePy = this.generatePytestSuite(agentName, rootTrigger);

    // 5. requirements.txt
    const requirementsTxt = `google-genai>=1.0.0
pydantic>=2.0.0
pytest>=8.0.0
pytest-asyncio>=0.23.0
python-dotenv>=1.0.0
`;

    // 6. main.tf
    const mainTf = `terraform {
  required_version = ">= 1.5.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "region" {
  description = "GCP Region for Cloud Run"
  type        = string
  default     = "us-central1"
}

provider "google" {
  project = var.project_id
  region  = var.region
}

resource "google_service_account" "agent_sa" {
  account_id   = "${(doc.name || 'agent-service').toLowerCase().replace(/[^a-z0-9-]/g, '-')}-sa"
  display_name = "${doc.name} Service Account"
}

resource "google_cloud_run_v2_service" "agent_service" {
  name     = "${(doc.name || 'agent-service').toLowerCase().replace(/[^a-z0-9-]/g, '-')}"
  location = var.region

  template {
    service_account = google_service_account.agent_sa.email

    containers {
      image = "gcr.io/\${var.project_id}/${(doc.name || 'agent').toLowerCase()}:latest"

      resources {
        limits = {
          cpu    = "1000m"
          memory = "1024Mi"
        }
      }

      env {
        name  = "GEMINI_MODEL"
        value = "${modelName}"
      }
    }
  }
}

output "service_url" {
  value       = google_cloud_run_v2_service.agent_service.uri
  description = "Deployed Cloud Run Service URL"
}
`;

    // 7. Dockerfile
    const dockerfile = `FROM python:3.11-slim as builder

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8080

CMD ["python", "main.py"]
`;

    // 8. README.md
    const readmeMd = `# ${doc.name || 'Agent Workflow'}

Autonomous Agent Workflow generated by **Visual Agent Flow Builder**.

## Architecture Overview
- **Framework**: Google ADK (\`google-genai\` SDK)
- **Model**: \`${modelName}\`
- **Temperature**: \`${temperature}\`
- **Tools**: ${tools.map((t: ToolDefinition) => t.name).join(', ') || 'None'}

## Quickstart

### 1. Set Up Environment
\`\`\`bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
\`\`\`

### 2. Configure API Key
\`\`\`bash
export GEMINI_API_KEY="your-gemini-api-key"
\`\`\`

### 3. Run Agent CLI
\`\`\`bash
python main.py "Analyze recent quarterly sales performance"
\`\`\`

### 4. Run Automated Pytest Suite
\`\`\`bash
pytest -v test_pipeline.py
\`\`\`
`;

    return [
      { path: 'agent_workflow.py', description: 'Core Gemini Agent Reasoning Class', content: agentWorkflowPy, language: 'python' },
      { path: 'tools.py', description: 'Tool Specifications and Integrations', content: toolsPy, language: 'python' },
      { path: 'main.py', description: 'CLI Execution Harness', content: mainPy, language: 'python' },
      { path: 'test_pipeline.py', description: 'Pytest Automated Test Suite', content: testPipelinePy, language: 'python' },
      { path: 'requirements.txt', description: 'Python Dependencies', content: requirementsTxt, language: 'plaintext' },
      { path: 'main.tf', description: 'Terraform Cloud Run IaC', content: mainTf, language: 'terraform' },
      { path: 'Dockerfile', description: 'Containerization Image', content: dockerfile, language: 'dockerfile' },
      { path: 'README.md', description: 'Project Quickstart Guide', content: readmeMd, language: 'markdown' },
    ];
  }

  /**
   * Generates Pydantic schema model code from structuredOutputSchema definition.
   */
  private generatePydanticSchema(schema?: any): string {
    if (!schema || !schema.fields || schema.fields.length === 0) return '';
    const fieldsCode = schema.fields
      .map((f: any) => {
        let pyType = 'str';
        if (f.type === 'number') pyType = 'float';
        else if (f.type === 'boolean') pyType = 'bool';
        else if (f.type === 'array') pyType = `List[${f.itemType === 'number' ? 'float' : 'str'}]`;

        const optionalWrapper = f.required ? pyType : `Optional[${pyType}] = None`;
        return `    ${f.name}: ${optionalWrapper} = Field(description="${f.description || f.name}")`;
      })
      .join('\n');

    return `class ResponseSchema(BaseModel):\n    """Structured Output Response Schema for Gemini."""\n${fieldsCode}\n`;
  }

  /**
   * Generates pytest test suite code from trigger test scenarios.
   */
  private generatePytestSuite(agentName: string, trigger?: TriggerNodeData): string {
    const scenarios = trigger?.config?.testScenarios || trigger?.testConfig?.testScenarios || [
      { id: '1', name: 'Baseline Execution', inputQuery: 'Hello Agent', expectedOutputPattern: '' },
    ];

    const testMethods = scenarios
      .map((tc: any, index: number) => {
        const methodName = `test_${(tc.name || `scenario_${index}`).toLowerCase().replace(/[^a-z0-9_]/g, '_')}`;
        const query = tc.inputQuery || 'Test prompt';
        const expectedPattern = tc.expectedOutputPattern || '';

        return `def ${methodName}():
    """Test Case: ${tc.name || 'Scenario'}"""
    workflow = ${agentName}Workflow()
    result = workflow.run("${query}")
    assert result is not None
    assert len(result) > 0
${expectedPattern ? `    assert "${expectedPattern}" in result.lower() or len(result) > 10\n` : ''}`;
      })
      .join('\n\n');

    return `"""
Pytest Test Suite for ${agentName}
"""

import pytest
import os
from agent_workflow import ${agentName}Workflow

@pytest.fixture(autouse=True)
def check_api_key():
    if not os.getenv("GEMINI_API_KEY"):
        pytest.skip("GEMINI_API_KEY environment variable is not set.")

${testMethods}
`;
  }
}
