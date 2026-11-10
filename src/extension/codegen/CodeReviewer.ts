/**
 * Code Reviewer (optional post-generation pass)
 *
 * Purpose: After the single-prompt generation, optionally reviews the generated repository and fixes
 * what it finds:
 *   1. Run read-only checks (py_compile, pytest --collect-only, terraform validate) on the files.
 *   2. Ask the reviewer model for structured issues (`{ issues: [{file, problem, fix}], summary }`).
 *   3. If issues exist, ask the generator model to re-emit ONLY the affected files, merge them, and
 *      review again. Up to `CODEGEN_LIMITS.maxReviewRounds` fix rounds; a final review reports anything
 *      unresolved.
 *
 * Architectural decisions / notes for future sessions:
 * - OFF by default (`CODEGEN_REVIEWER_ENABLED_BY_DEFAULT`); enabled per request with `enableReviewer`.
 * - Never edits code procedurally (AGENTS.md): checks are read-only evidence, fixes come from the LLM.
 * - Model calls are injected (`reviewFn`, `fixFn`) so this module is provider-agnostic and unit tested.
 * - Prompt text lives in `resource/codegen-prompts/reviewer.md` and `fix.md` plus reviewer skills.
 *
 * Author: Mike Nimer <mikenimer@google.com>
 */
import * as fs from 'fs';
import * as path from 'path';
import type { CodeGenPhaseEvent, CodeGenReviewIssue, GeneratedFile } from '../../shared/codegen/types';
import { CODEGEN_LIMITS, CODEGEN_RESOURCE_PATHS, CODEGEN_SKILL_AUDIENCES, CodegenTarget } from './codegenConfig';
import type { CheckResult } from './ReadOnlyCheckRunner';
import { PROMPT_SECTION_SEPARATOR, SinglePromptBuilder, renderSkill } from './SinglePromptBuilder';

/** Structured reviewer output. */
export interface ReviewReport {
  issues: CodeGenReviewIssue[];
  summary: string;
}

/** Gemini response schema for the reviewer's structured output. */
export const REVIEW_REPORT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    issues: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          file: { type: 'STRING', description: 'Repository path that must change (or the missing file path).' },
          problem: { type: 'STRING', description: 'What is wrong, citing evidence.' },
          fix: { type: 'STRING', description: 'What must change.' },
        },
        required: ['file', 'problem', 'fix'],
      },
    },
    summary: { type: 'STRING', description: 'One-sentence review summary.' },
  },
  required: ['issues', 'summary'],
};

/** Injected collaborators. */
export interface CodeReviewerDeps {
  /** Calls the reviewer model with a prompt and returns its JSON output (object or JSON text). */
  reviewFn(prompt: string): Promise<unknown>;
  /** Calls the generator model with a fix prompt and returns the re-emitted files. */
  fixFn(prompt: string): Promise<GeneratedFile[]>;
  /** Runs read-only checks over files. */
  runChecks(files: GeneratedFile[]): Promise<CheckResult[]>;
  onPhase?(phase: CodeGenPhaseEvent): void;
}

/** Input for one review run. */
export interface ReviewRequest {
  files: GeneratedFile[];
  /** The full generation prompt (fix calls reuse it so the same skills apply). */
  generationPrompt: string;
  blueprintJson: string;
  target: CodegenTarget;
  features: ReadonlySet<string>;
}

/** Outcome of a review run. */
export interface ReviewOutcome {
  files: GeneratedFile[];
  reviewReports: ReviewReport[];
  unresolvedIssues: CodeGenReviewIssue[];
}

/**
 * Parses reviewer output, failing fast on malformed output.
 *
 * @param output Object or JSON text.
 */
export function parseReviewReport(output: unknown): ReviewReport {
  let value: any = output;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
    } catch {
      throw new Error(`Reviewer returned non-JSON output: ${value.slice(0, 200)}`);
    }
  }
  if (!value || !Array.isArray(value.issues)) {
    throw new Error('Reviewer output is missing the "issues" array.');
  }
  const issues = value.issues
    .filter((issue: any) => issue && typeof issue.file === 'string' && issue.file.trim())
    .map((issue: any) => ({ file: issue.file.trim(), problem: String(issue.problem ?? ''), fix: String(issue.fix ?? '') }));
  return { issues, summary: typeof value.summary === 'string' ? value.summary : '' };
}

/**
 * Renders files as fenced blocks (4 backticks so file content containing ``` stays intact).
 *
 * @param files Files to render.
 */
export function renderFiles(files: GeneratedFile[]): string {
  return files.map((file) => `### File: \`${file.path}\`\n\`\`\`\`\n${file.content}\n\`\`\`\``).join('\n\n');
}

/**
 * Merges re-emitted files into the repository by path (new paths are appended).
 *
 * @param files Current files.
 * @param updates Re-emitted files.
 */
export function mergeFiles(files: GeneratedFile[], updates: GeneratedFile[]): GeneratedFile[] {
  const byPath = new Map(files.map((file) => [file.path, file]));
  for (const update of updates) {
    byPath.set(update.path, { ...byPath.get(update.path), ...update });
  }
  return [...byPath.values()];
}

/**
 * Optional reviewer: read-only checks + LLM review + targeted LLM fixes.
 */
export class CodeReviewer {
  private readonly templates = new Map<string, string>();

  /**
   * @param extensionPath Absolute extension root (prompt templates).
   * @param promptBuilder Shared builder (reviewer skill selection).
   */
  constructor(private readonly extensionPath: string, private readonly promptBuilder: SinglePromptBuilder) {}

  /**
   * Loads (and caches) a prompt template from `resource/codegen-prompts/`.
   *
   * @param fileName Template file name.
   */
  public loadTemplate(fileName: string): string {
    const cached = this.templates.get(fileName);
    if (cached !== undefined) return cached;
    const templatePath = path.join(this.extensionPath, ...CODEGEN_RESOURCE_PATHS.promptsDir, fileName);
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Code generation prompt template not found: ${templatePath}`);
    }
    const text = fs.readFileSync(templatePath, 'utf-8').trim();
    this.templates.set(fileName, text);
    return text;
  }

  /**
   * Builds the reviewer prompt.
   *
   * @param request Review request.
   * @param files Current files.
   * @param checks Read-only check results.
   */
  public buildReviewPrompt(request: ReviewRequest, files: GeneratedFile[], checks: CheckResult[]): string {
    const skills = this.promptBuilder.selectSkills(CODEGEN_SKILL_AUDIENCES.reviewer, request.target, request.features);
    const checkText = checks
      .map((result) => `### Check: ${result.check} — ${result.status.toUpperCase()}\n\`\`\`\n${result.output || '(no output)'}\n\`\`\``)
      .join('\n\n');
    return [
      this.loadTemplate(CODEGEN_RESOURCE_PATHS.reviewerPrompt),
      `## Blueprint JSON\n\`\`\`json\n${request.blueprintJson}\n\`\`\``,
      ...skills.map(renderSkill),
      `## Generated files\n\n${renderFiles(files)}`,
      `## Read-only check results\n\n${checkText || '(no checks run)'}`,
    ].join(PROMPT_SECTION_SEPARATOR);
  }

  /**
   * Builds the fix prompt: the original generation prompt + fix instructions + issues + affected files.
   *
   * @param request Review request.
   * @param files Current files.
   * @param issues Issues to fix.
   */
  public buildFixPrompt(request: ReviewRequest, files: GeneratedFile[], issues: CodeGenReviewIssue[]): string {
    const affected = new Set(issues.map((issue) => issue.file));
    const issueText = issues.map((issue, index) => `${index + 1}. \`${issue.file}\` — ${issue.problem}\n   Fix: ${issue.fix}`).join('\n');
    return [
      request.generationPrompt,
      this.loadTemplate(CODEGEN_RESOURCE_PATHS.fixPrompt),
      `## Reviewer issues\n${issueText}`,
      `## Current versions of the affected files\n\n${renderFiles(files.filter((file) => affected.has(file.path)))}`,
      `## Other files in the repository (paths only)\n${files.filter((file) => !affected.has(file.path)).map((file) => `- ${file.path}`).join('\n')}`,
    ].join(PROMPT_SECTION_SEPARATOR);
  }

  /**
   * Runs review -> fix rounds over the generated files.
   *
   * @param request Review request.
   * @param deps Injected model calls and checks.
   */
  public async reviewAndFix(request: ReviewRequest, deps: CodeReviewerDeps): Promise<ReviewOutcome> {
    let files = request.files;
    const reviewReports: ReviewReport[] = [];
    let unresolvedIssues: CodeGenReviewIssue[] = [];

    for (let round = 1; round <= CODEGEN_LIMITS.maxReviewRounds + 1; round++) {
      // 1. Evidence, then review.
      deps.onPhase?.({ phase: 'checks', round });
      const checks = await deps.runChecks(files);
      deps.onPhase?.({ phase: 'review', round });
      const report = parseReviewReport(await deps.reviewFn(this.buildReviewPrompt(request, files, checks)));
      reviewReports.push(report);
      unresolvedIssues = report.issues;

      // 2. Clean, or fix budget exhausted: stop.
      if (report.issues.length === 0 || round > CODEGEN_LIMITS.maxReviewRounds) {
        break;
      }

      // 3. Targeted fix: re-emit only the affected files and merge them.
      deps.onPhase?.({ phase: 'fix', round, files: [...new Set(report.issues.map((issue) => issue.file))] });
      const updates = await deps.fixFn(this.buildFixPrompt(request, files, report.issues));
      files = mergeFiles(files, updates);
    }

    return { files, reviewReports, unresolvedIssues };
  }
}
