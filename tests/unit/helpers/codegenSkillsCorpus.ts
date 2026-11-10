/**
 * Test helper: code generation skills corpus
 *
 * Purpose: Concatenates every bundled code generation skill (SKILL.md + references) that applies to a
 * * deployment target (frontmatter `metadata.targets` of `all` or the target), plus the reviewer/fix prompts.
 * Replaces the retired monolithic `resource/prompts/python_adk_*.prompt.txt` files as the source for
 * prompt-content regression assertions ("the generator must be told X").
 *
 * Author: Mike Nimer <mikenimer@google.com>
 */
import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../..');

/**
 * Returns the full prompt corpus the code generation agents can receive for a target.
 *
 * @param target Deployment target.
 */
export function readCodegenSkills(target: 'agent-engine' | 'cloudrun'): string {
  const skillsRoot = path.join(REPO_ROOT, 'resource', 'codegen-skills');
  const briefsRoot = path.join(REPO_ROOT, 'resource', 'codegen-prompts');
  const parts: string[] = [];
  for (const dir of fs.readdirSync(skillsRoot).sort()) {
    const skillPath = path.join(skillsRoot, dir, 'SKILL.md');
    if (!fs.existsSync(skillPath)) continue;
    const text = fs.readFileSync(skillPath, 'utf-8');
    const targets = /targets:\s*\[([^\]]*)\]/.exec(text)?.[1] ?? 'all';
    if (!targets.includes('all') && !targets.includes(target)) continue;
    parts.push(text);
    const refs = path.join(skillsRoot, dir, 'references');
    if (fs.existsSync(refs)) {
      for (const ref of fs.readdirSync(refs).sort()) parts.push(fs.readFileSync(path.join(refs, ref), 'utf-8'));
    }
  }
  for (const brief of fs.readdirSync(briefsRoot).sort()) {
    parts.push(fs.readFileSync(path.join(briefsRoot, brief), 'utf-8'));
  }
  return parts.join('\n');
}
