/**
 * Unit Tests: skill file parser + skill catalog (fixtures and the real bundled skills)
 *
 * Author: Mike Nimer <mikenimer@google.com>
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseSkillFile } from '../../../../src/extension/codegen/skillFile';
import { CodegenSkillCatalog, buildSkill } from '../../../../src/extension/codegen/CodegenSkillCatalog';

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const skillText = (name: string, metadata: string, body = `# ${name}\nBody.`) =>
  `---\nname: ${name}\ndescription: "${name}: skill"\nmetadata:\n${metadata}\n---\n\n${body}\n`;

describe('parseSkillFile', () => {
  it('parses name, quoted description with colons, flow lists, and body', () => {
    const parsed = parseSkillFile(skillText('adk-core', '  usedBy: [generator, reviewer]\n  targets: [all]\n  preloadWhen: []'), 'x');
    expect(parsed).toEqual({
      name: 'adk-core',
      description: 'adk-core: skill',
      metadata: { usedBy: ['generator', 'reviewer'], targets: ['all'], preloadWhen: [] },
      body: '# adk-core\nBody.',
    });
  });

  it('accepts plain (unquoted) scalars and CRLF line endings', () => {
    const parsed = parseSkillFile('---\r\nname: a\r\ndescription: plain text\r\n---\r\nbody', 'x');
    expect(parsed.description).toBe('plain text');
    expect(parsed.body).toBe('body');
  });

  it.each([
    ['no frontmatter', 'name: a', /must start with/],
    ['unclosed', '---\nname: a\ndescription: b\n', /not closed/],
    ['missing name', '---\ndescription: b\n---\n', /'name' is required/],
    ['missing description', '---\nname: a\n---\n', /'description' is required/],
    ['unsupported line', '---\nname: a\ndescription: b\n- item\n---\n', /unsupported frontmatter line/],
  ])('fails fast: %s', (_label, content, message) => {
    expect(() => parseSkillFile(content, 'skill.md')).toThrow(message);
  });
});

describe('buildSkill', () => {
  it('defaults targets to all and preloadWhen to empty', () => {
    const skill = buildSkill(skillText('a', '  usedBy: [generator]'), 'x');
    expect(skill.targets).toEqual(['all']);
    expect(skill.preloadWhen).toEqual([]);
  });

  it.each([
    ['  usedBy: []', /must list generator and\/or reviewer/],
    ['  usedBy: generator', /must be a list/],
    ['  usedBy: [writer]', /unknown value\(s\) writer/],
    ['  usedBy: [generator]\n  targets: [gke]', /unknown value\(s\) gke/],
    ['  usedBy: [generator]\n  preloadWhen: [quantum]', /unknown value\(s\) quantum/],
  ])('rejects invalid metadata %#', (metadata, message) => {
    expect(() => buildSkill(skillText('bad', metadata), 'x')).toThrow(message);
  });
});

describe('CodegenSkillCatalog (fixtures)', () => {
  let root: string;
  const write = (name: string, metadata: string) => {
    const dir = path.join(root, 'resource', 'codegen-skills', name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), skillText(name, metadata));
  };
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'codegen-catalog-'));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('selects by audience, target, and features with codegen-common first', () => {
    write('adk-mcp', '  usedBy: [generator]\n  preloadWhen: [mcp]');
    write('codegen-common', '  usedBy: [generator, reviewer]');
    write('codegen-review', '  usedBy: [reviewer]');
    write('target-cloudrun', '  usedBy: [generator, reviewer]\n  targets: [cloudrun]');
    fs.mkdirSync(path.join(root, 'resource', 'codegen-skills', 'not-a-skill'));
    const catalog = CodegenSkillCatalog.load(root);
    const names = (skills: any[]) => skills.map((s) => s.name);
    expect(names(catalog.select('generator', 'cloudrun', new Set()))).toEqual(['codegen-common', 'target-cloudrun']);
    expect(names(catalog.select('generator', 'cloudrun', new Set(['mcp'])))).toEqual(['codegen-common', 'adk-mcp', 'target-cloudrun']);
    expect(names(catalog.select('generator', 'agent-engine', new Set(['mcp'])))).toEqual(['codegen-common', 'adk-mcp']);
    expect(names(catalog.select('reviewer', 'cloudrun', new Set(['mcp'])))).toEqual(['codegen-common', 'codegen-review', 'target-cloudrun']);
  });

  it('fails when the skills directory is missing or empty, and on duplicates', () => {
    expect(() => CodegenSkillCatalog.load(root)).toThrow(/not found/);
    fs.mkdirSync(path.join(root, 'resource', 'codegen-skills'), { recursive: true });
    expect(() => CodegenSkillCatalog.load(root)).toThrow(/No code generation skills/);
    const skill = buildSkill(skillText('dup', '  usedBy: [generator]'), 'x');
    expect(() => CodegenSkillCatalog.fromSkills([skill, skill])).toThrow(/Duplicate/);
  });
});

describe('CodegenSkillCatalog (bundled resource/codegen-skills)', () => {
  const catalog = CodegenSkillCatalog.load(REPO_ROOT);

  it('loads every bundled skill with valid metadata', () => {
    expect(catalog.all().length).toBeGreaterThan(20);
  });

  it('puts codegen-common first and the matching target skill in every generator prompt', () => {
    for (const target of ['cloudrun', 'agent-engine'] as const) {
      const names = catalog.select('generator', target, new Set()).map((s) => s.name);
      expect(names[0]).toBe('codegen-common');
      expect(names).toContain(`target-${target}`);
      expect(names).not.toContain(target === 'cloudrun' ? 'target-agent-engine' : 'target-cloudrun');
      expect(names).not.toContain('codegen-review');
    }
  });

  it('gates feature-specific skills on blueprint features', () => {
    const names = (features: string[]) => catalog.select('generator', 'cloudrun', new Set(features)).map((s) => s.name);
    expect(names([])).not.toContain('adk-mcp');
    expect(names(['mcp', 'a2ui'])).toEqual(expect.arrayContaining(['adk-mcp', 'adk-a2ui']));
  });

  it('gives the reviewer the review checklist and the tool rules (adk-tools)', () => {
    const names = catalog.select('reviewer', 'agent-engine', new Set()).map((s) => s.name);
    expect(names).toEqual(expect.arrayContaining(['codegen-review', 'adk-tools']));
  });

  // Regression (2026-10-26): generated tests patched Gemini.generate_content_async with a plain
  // `async def`, which fails on google-adk 2.x ("'async for' requires __aiter__, got coroutine").
  // Suites using an async-generator `_run_async_impl` mock passed 100%.
  it('teaches only the async-generator model mocking pattern in python-testing', () => {
    const testing = catalog.all().find((s) => s.name === 'python-testing')!;
    expect(testing.body).toContain('Model Mocking Pattern (CRITICAL — google-adk 2.x)');
    expect(testing.body).toContain('patch.object(type(root_agent), "_run_async_impl", new=mock_run)');
    expect(testing.body).toMatch(/async def mock_run\(self, ctx\) -> AsyncGenerator\[Any, None\]:\n\s+yield Event/);
    expect(testing.body).not.toMatch(/patch\(\\?"google\.adk\.models\.google_llm\.Gemini\.generate_content_async\\?", new=mock_generate\)/);
  });

  // Regression (2026-10-26): a generated requirements.txt listed `vertexai>=1.71.1`, which conflicts with
  // google-cloud-aiplatform>=1.126.1 and made `pip install -r requirements.txt` fail.
  it('forbids a standalone vertexai package in generated dependencies', () => {
    const evalSkill = catalog.all().find((s) => s.name === 'vertex-eval')!;
    const review = catalog.all().find((s) => s.name === 'codegen-review')!;
    expect(evalSkill.body).toMatch(/NEVER add a separate `vertexai` package/);
    expect(review.body).toMatch(/No standalone `vertexai` package/);
  });

  it('contains no multi-agent or placeholder leftovers', () => {
    for (const skill of catalog.all()) {
      expect(skill.body, skill.name).not.toMatch(/write_file|manifest\.json|\{\{WORKFLOW_JSON\}\}|`contract` agent|owning agent/);
    }
  });
});
