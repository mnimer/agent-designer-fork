/**
 * Unit Tests: SinglePromptBuilder + CodeReviewer
 *
 * Author: Mike Nimer <mikenimer@google.com>
 */
import { describe, it, expect, vi } from 'vitest';
import * as path from 'path';
import { SinglePromptBuilder, PROMPT_SECTION_SEPARATOR } from '../../../../src/extension/codegen/SinglePromptBuilder';
import { CodeReviewer, mergeFiles, parseReviewReport, renderFiles, REVIEW_REPORT_SCHEMA } from '../../../../src/extension/codegen/CodeReviewer';
import { CODEGEN_LIMITS } from '../../../../src/extension/codegen/codegenConfig';
import { CodegenSkillCatalog } from '../../../../src/extension/codegen/CodegenSkillCatalog';

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const DOC = {
  name: 'Demo',
  nodes: [{ id: 'agent-1', type: 'agentNode', position: { x: 0, y: 0 }, data: { label: 'Demo Agent', model: 'gemini-3.8-flash' } }],
  edges: [],
};

describe('SinglePromptBuilder', () => {
  const builder = new SinglePromptBuilder(REPO_ROOT);

  it('orders codegen-common, blueprint, then the selected skills', () => {
    const built = builder.build(DOC, 'cloudrun');
    const sections = built.prompt.split(PROMPT_SECTION_SEPARATOR);
    expect(sections[0]).toMatch(/^# Code Generation: Common Rules/);
    // NOTE: codegen-common itself contains '---' rules, so locate sections by marker order instead.
    const common = built.prompt.indexOf('# Code Generation: Common Rules');
    const blueprint = built.prompt.indexOf('## Blueprint JSON');
    const firstSkill = built.prompt.indexOf('## Skill: ');
    expect(common).toBe(0);
    expect(blueprint).toBeGreaterThan(common);
    expect(firstSkill).toBeGreaterThan(blueprint);
    expect(built.prompt).toContain('"name":"Demo"');
    expect(built.target).toBe('cloudrun');
    expect(built.skillNames[0]).toBe('codegen-common');
    expect(built.skillNames).toContain('target-cloudrun');
  });

  it('states the JSON-array output contract and never multi-agent instructions', () => {
    const { prompt } = builder.build(DOC, 'agent-engine');
    expect(prompt).toContain('Return ONLY a raw JSON array of file objects');
    expect(prompt).toContain('FIRST FILE IN THE RETURNED JSON ARRAY');
    expect(prompt).not.toMatch(/write_file|manifest\.json|\{\{WORKFLOW_JSON\}\}/);
  });

  it('adds feature skills only when the blueprint uses the feature (smaller prompt otherwise)', () => {
    const plain = builder.build(DOC, 'cloudrun');
    const withMcp = builder.build(
      { ...DOC, nodes: [{ ...DOC.nodes[0], data: { ...DOC.nodes[0].data, tools: [{ type: 'mcp', id: 'bq' }] } }] },
      'cloudrun'
    );
    expect(plain.skillNames).not.toContain('adk-mcp');
    expect(withMcp.skillNames).toContain('adk-mcp');
    expect(withMcp.prompt.length).toBeGreaterThan(plain.prompt.length);
  });

  it('loads the catalog once and reuses it', () => {
    const loader = vi.fn((root: string) => CodegenSkillCatalog.load(root));
    const b = new SinglePromptBuilder(REPO_ROOT, loader);
    b.build(DOC, 'cloudrun');
    b.build(DOC, 'agent-engine');
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('fails fast without a document', () => {
    expect(() => builder.build(undefined as any, 'cloudrun')).toThrow(/workflow document is missing/);
  });
});

describe('parseReviewReport / renderFiles / mergeFiles', () => {
  it('parses objects, JSON strings, and fenced JSON', () => {
    expect(parseReviewReport({ issues: [], summary: 'ok' })).toEqual({ issues: [], summary: 'ok' });
    expect(parseReviewReport('```json\n{"issues":[{"file":" a.py ","problem":"p","fix":"f"}],"summary":"s"}\n```').issues).toEqual([
      { file: 'a.py', problem: 'p', fix: 'f' },
    ]);
  });

  it.each([['nope'], [{}], [null], [{ issues: 'x' }]])('rejects malformed output %#', (output) => {
    expect(() => parseReviewReport(output)).toThrow(/Reviewer/);
  });

  it('drops issues without a file', () => {
    expect(parseReviewReport({ issues: [{ file: '' }, null, { file: 'b.py' }] }).issues).toEqual([{ file: 'b.py', problem: '', fix: '' }]);
  });

  it('renders files with 4-backtick fences', () => {
    expect(renderFiles([{ path: 'README.md', content: '```\nx\n```' }])).toBe('### File: `README.md`\n````\n```\nx\n```\n````');
  });

  it('merges updates by path and appends new files', () => {
    const merged = mergeFiles(
      [{ path: 'a.py', content: 'old', description: 'A' }, { path: 'b.py', content: 'b' }],
      [{ path: 'a.py', content: 'new' }, { path: 'c.py', content: 'c' }]
    );
    expect(merged).toEqual([{ path: 'a.py', content: 'new', description: 'A' }, { path: 'b.py', content: 'b' }, { path: 'c.py', content: 'c' }]);
  });

  it('declares issues and summary as required in the schema', () => {
    expect(REVIEW_REPORT_SCHEMA.required).toEqual(['issues', 'summary']);
  });
});

describe('CodeReviewer.reviewAndFix', () => {
  const builder = new SinglePromptBuilder(REPO_ROOT);
  const reviewer = new CodeReviewer(REPO_ROOT, builder);
  const request = (files = [{ path: 'agent.py', content: 'root_agent = 1' }, { path: 'main.tf', content: 'bad' }]) => ({
    files,
    generationPrompt: 'GENERATION PROMPT',
    blueprintJson: '{"name":"Demo"}',
    target: 'cloudrun' as const,
    features: new Set<string>(),
  });
  const checks = vi.fn(async () => [{ check: 'py_compile' as const, status: 'passed' as const, output: '' }]);

  it('stops after a clean first review without calling fix', async () => {
    const fixFn = vi.fn();
    const phases: any[] = [];
    const outcome = await reviewer.reviewAndFix(request(), {
      reviewFn: async () => ({ issues: [], summary: 'clean' }),
      fixFn,
      runChecks: checks,
      onPhase: (p) => phases.push(p),
    });
    expect(fixFn).not.toHaveBeenCalled();
    expect(outcome.unresolvedIssues).toEqual([]);
    expect(phases).toEqual([{ phase: 'checks', round: 1 }, { phase: 'review', round: 1 }]);
  });

  it('fixes only the affected files, merges them, and re-reviews', async () => {
    const reviews = [
      { issues: [{ file: 'main.tf', problem: 'invalid', fix: 'repair' }], summary: 'bad' },
      { issues: [], summary: 'clean' },
    ];
    let reviewCalls = 0;
    const prompts: string[] = [];
    const outcome = await reviewer.reviewAndFix(request(), {
      reviewFn: async (prompt) => {
        prompts.push(prompt);
        return reviews[reviewCalls++];
      },
      fixFn: async (prompt) => {
        prompts.push(prompt);
        return [{ path: 'main.tf', content: 'good' }];
      },
      runChecks: checks,
    });
    expect(outcome.files.find((f) => f.path === 'main.tf')!.content).toBe('good');
    expect(outcome.files.find((f) => f.path === 'agent.py')!.content).toBe('root_agent = 1');
    expect(outcome.reviewReports).toHaveLength(2);
    // Review prompt: reviewer role, review checklist skill, files, checks.
    expect(prompts[0]).toMatch(/^# Role: Code Reviewer/);
    expect(prompts[0]).toContain('## Skill: codegen-review');
    expect(prompts[0]).toContain('### Check: py_compile — PASSED');
    // Fix prompt: full generation prompt + fix instructions + only the affected file's content.
    expect(prompts[1].startsWith('GENERATION PROMPT')).toBe(true);
    expect(prompts[1]).toContain('# Fix Request');
    expect(prompts[1]).toContain('### File: `main.tf`');
    expect(prompts[1]).not.toContain('### File: `agent.py`');
    expect(prompts[1]).toContain('- agent.py');
  });

  it('stops after the maximum fix rounds and reports unresolved issues', async () => {
    const issue = { file: 'main.tf', problem: 'still bad', fix: 'f' };
    const fixFn = vi.fn(async () => [{ path: 'main.tf', content: 'x' }]);
    const outcome = await reviewer.reviewAndFix(request(), {
      reviewFn: async () => ({ issues: [issue], summary: 'bad' }),
      fixFn,
      runChecks: checks,
    });
    expect(fixFn).toHaveBeenCalledTimes(CODEGEN_LIMITS.maxReviewRounds);
    expect(outcome.reviewReports).toHaveLength(CODEGEN_LIMITS.maxReviewRounds + 1);
    expect(outcome.unresolvedIssues).toEqual([issue]);
  });

  it('propagates reviewer failures', async () => {
    await expect(
      reviewer.reviewAndFix(request(), { reviewFn: async () => 'garbage', fixFn: vi.fn(), runChecks: checks })
    ).rejects.toThrow(/non-JSON/);
  });

  it('fails fast when a prompt template is missing', () => {
    expect(() => new CodeReviewer('/nonexistent', builder).loadTemplate('reviewer.md')).toThrow(/template not found/);
  });
});
