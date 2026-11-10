/**
 * Code Generation Skill Catalog
 *
 * Purpose: Loads the bundled code generation skills (`resource/codegen-skills/<name>/SKILL.md`) and
 * selects which ones go into a prompt for a given audience (generator or reviewer), deployment target,
 * and set of blueprint features.
 *
 * Selection rule: a skill is included when
 *   1. `metadata.usedBy` contains the audience, AND
 *   2. `metadata.targets` contains `all` or the deployment target, AND
 *   3. `metadata.preloadWhen` is empty OR lists a feature the blueprint uses (`BlueprintFeatureDetector`).
 *
 * Architectural decisions / notes for future sessions:
 * - Skills are the single source of prompt content: editing a skill changes the next generation.
 * - Order is stable (alphabetical by directory) with `codegen-common` first, so prompts are
 *   deterministic and cache-friendly.
 * - Invalid metadata fails fast at load time instead of silently dropping a skill.
 *
 * Author: Mike Nimer <mikenimer@google.com>
 */
import * as fs from 'fs';
import * as path from 'path';
import { KNOWN_BLUEPRINT_FEATURES } from './BlueprintFeatureDetector';
import {
  CODEGEN_COMMON_SKILL_NAME,
  CODEGEN_RESOURCE_PATHS,
  CODEGEN_SKILL_AUDIENCES,
  CODEGEN_TARGETS,
  CodegenSkillAudience,
  CodegenTarget,
} from './codegenConfig';
import { parseSkillFile } from './skillFile';

/** A loaded skill with validated routing metadata. */
export interface CodegenSkill {
  name: string;
  description: string;
  body: string;
  usedBy: CodegenSkillAudience[];
  targets: string[];
  preloadWhen: string[];
}

const KNOWN_AUDIENCES = new Set<string>(Object.values(CODEGEN_SKILL_AUDIENCES));
const KNOWN_TARGETS = new Set<string>(Object.values(CODEGEN_TARGETS));

/**
 * Reads a list metadata field, validating entries against an allow-list.
 *
 * @param skill Skill name (errors).
 * @param metadata Parsed metadata.
 * @param field Field name.
 * @param allowed Allowed values.
 */
function readList(skill: string, metadata: Record<string, string | string[]>, field: string, allowed: ReadonlySet<string>): string[] {
  const raw = metadata[field];
  if (raw === undefined) {
    return [];
  }
  if (!Array.isArray(raw)) {
    throw new Error(`Code generation skill '${skill}': metadata.${field} must be a list, e.g. [a, b].`);
  }
  const unknown = raw.filter((value) => !allowed.has(value));
  if (unknown.length > 0) {
    throw new Error(`Code generation skill '${skill}': metadata.${field} has unknown value(s) ${unknown.join(', ')}. Allowed: ${[...allowed].join(', ')}.`);
  }
  return raw;
}

/**
 * Builds a validated skill from parsed file content.
 *
 * @param content SKILL.md content.
 * @param sourceLabel Path or label for errors.
 */
export function buildSkill(content: string, sourceLabel: string): CodegenSkill {
  const parsed = parseSkillFile(content, sourceLabel);
  const usedBy = readList(parsed.name, parsed.metadata, 'usedBy', KNOWN_AUDIENCES) as CodegenSkillAudience[];
  if (usedBy.length === 0) {
    throw new Error(`Code generation skill '${parsed.name}': metadata.usedBy must list generator and/or reviewer.`);
  }
  const targets = readList(parsed.name, parsed.metadata, 'targets', KNOWN_TARGETS);
  return {
    name: parsed.name,
    description: parsed.description,
    body: parsed.body,
    usedBy,
    targets: targets.length > 0 ? targets : [CODEGEN_TARGETS.all],
    preloadWhen: readList(parsed.name, parsed.metadata, 'preloadWhen', KNOWN_BLUEPRINT_FEATURES),
  };
}

/**
 * Catalog of bundled code generation skills.
 */
export class CodegenSkillCatalog {
  private constructor(private readonly skills: CodegenSkill[]) {}

  /**
   * Loads every `<extensionPath>/resource/codegen-skills/<dir>/SKILL.md`.
   *
   * @param extensionPath Absolute extension root.
   */
  public static load(extensionPath: string): CodegenSkillCatalog {
    const root = path.join(extensionPath, ...CODEGEN_RESOURCE_PATHS.skillsDir);
    if (!fs.existsSync(root)) {
      throw new Error(`Code generation skills directory not found: ${root}`);
    }
    const skills = fs
      .readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(root, entry.name, CODEGEN_RESOURCE_PATHS.skillFileName))
      .filter((file) => fs.existsSync(file))
      .sort()
      .map((file) => buildSkill(fs.readFileSync(file, 'utf-8'), file));
    if (skills.length === 0) {
      throw new Error(`No code generation skills found in ${root}`);
    }
    return CodegenSkillCatalog.fromSkills(skills);
  }

  /**
   * Builds a catalog from skills (tests and `load`).
   *
   * @param skills Skills.
   */
  public static fromSkills(skills: CodegenSkill[]): CodegenSkillCatalog {
    const seen = new Set<string>();
    for (const skill of skills) {
      if (seen.has(skill.name)) {
        throw new Error(`Duplicate code generation skill name '${skill.name}'.`);
      }
      seen.add(skill.name);
    }
    return new CodegenSkillCatalog(skills);
  }

  /** All skills. */
  public all(): CodegenSkill[] {
    return [...this.skills];
  }

  /**
   * Selects the skills for an audience, target, and blueprint features (`codegen-common` first).
   *
   * @param audience `generator` or `reviewer`.
   * @param target Deployment target.
   * @param features Features detected in the blueprint.
   */
  public select(audience: CodegenSkillAudience, target: CodegenTarget, features: ReadonlySet<string>): CodegenSkill[] {
    const selected = this.skills.filter(
      (skill) =>
        skill.usedBy.includes(audience) &&
        (skill.targets.includes(CODEGEN_TARGETS.all) || skill.targets.includes(target)) &&
        (skill.preloadWhen.length === 0 || skill.preloadWhen.some((feature) => features.has(feature)))
    );
    return [
      ...selected.filter((skill) => skill.name === CODEGEN_COMMON_SKILL_NAME),
      ...selected.filter((skill) => skill.name !== CODEGEN_COMMON_SKILL_NAME),
    ];
  }
}
