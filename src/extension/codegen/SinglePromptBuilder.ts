/**
 * Single-Prompt Builder
 *
 * Purpose: Assembles the ONE code generation prompt from the bundled topic skills: `codegen-common`
 * (role + output contract) first, then the blueprint JSON, then every generator skill selected for the
 * deployment target and the blueprint's features. Replaces the retired monolithic
 * `resource/prompts/python_adk_*.prompt.txt` templates.
 *
 * Architectural decisions / notes for future sessions:
 * - Prompt text lives ONLY in `resource/codegen-skills/*` (AGENTS.md: fix prompts, not code). This class
 *   only selects and orders skills.
 * - Feature-gated skills (`metadata.preloadWhen`) keep the prompt smaller than the old monolith for
 *   blueprints that do not use MCP, A2A, A2UI, custom agents, etc.
 * - The skill catalog is loaded once per builder (extension lifetime) and reused.
 *
 * Author: Mike Nimer <mikenimer@google.com>
 */
import { buildBlueprintJson } from './BlueprintViewBuilder';
import { detectBlueprintFeatures } from './BlueprintFeatureDetector';
import { CodegenSkill, CodegenSkillCatalog } from './CodegenSkillCatalog';
import { CODEGEN_COMMON_SKILL_NAME, CODEGEN_SKILL_AUDIENCES, CodegenSkillAudience, CodegenTarget, normalizeCodegenTarget } from './codegenConfig';

/** Section separator between prompt parts. */
export const PROMPT_SECTION_SEPARATOR = '\n\n---\n\n';

/** Result of building a prompt. */
export interface BuiltPrompt {
  prompt: string;
  target: CodegenTarget;
  blueprintJson: string;
  features: Set<string>;
  /** Names of the skills included, in prompt order. */
  skillNames: string[];
}

/**
 * Renders a skill as a prompt section.
 *
 * @param skill Skill to render.
 */
export function renderSkill(skill: CodegenSkill): string {
  return skill.name === CODEGEN_COMMON_SKILL_NAME ? skill.body : `## Skill: ${skill.name}\n\n${skill.body}`;
}

/**
 * Builds code generation (and reviewer) prompts from skills.
 */
export class SinglePromptBuilder {
  private catalog?: CodegenSkillCatalog;

  /**
   * @param extensionPath Absolute extension root.
   * @param catalogLoader Loader override (tests).
   */
  constructor(
    private readonly extensionPath: string,
    private readonly catalogLoader: (extensionPath: string) => CodegenSkillCatalog = CodegenSkillCatalog.load
  ) {}

  /**
   * Returns the skills selected for an audience (loads the catalog on first use).
   *
   * @param audience Generator or reviewer.
   * @param target Deployment target.
   * @param features Blueprint features.
   */
  public selectSkills(audience: CodegenSkillAudience, target: CodegenTarget, features: ReadonlySet<string>): CodegenSkill[] {
    if (!this.catalog) {
      this.catalog = this.catalogLoader(this.extensionPath);
    }
    return this.catalog.select(audience, target, features);
  }

  /**
   * Builds the single code generation prompt for a blueprint.
   *
   * @param document `.agent` workflow document.
   * @param rawTarget Deployment target from the request/document.
   */
  public build(document: Record<string, any>, rawTarget: string | undefined): BuiltPrompt {
    // 1. Inputs: target, minified blueprint view, detected features.
    const target = normalizeCodegenTarget(rawTarget);
    const blueprintJson = buildBlueprintJson(document);
    const features = detectBlueprintFeatures(document);
    const skills = this.selectSkills(CODEGEN_SKILL_AUDIENCES.generator, target, features);

    // 2. Order: codegen-common (role + output contract), blueprint, then the remaining skills.
    const [first, ...rest] = skills;
    const sections: string[] = [];
    const restSkills = first?.name === CODEGEN_COMMON_SKILL_NAME ? rest : skills;
    if (first?.name === CODEGEN_COMMON_SKILL_NAME) {
      sections.push(renderSkill(first));
    }
    sections.push(`## Blueprint JSON (the user's agent design)\n\`\`\`json\n${blueprintJson}\n\`\`\``);
    sections.push(...restSkills.map(renderSkill));

    return { prompt: sections.join(PROMPT_SECTION_SEPARATOR), target, blueprintJson, features, skillNames: skills.map((s) => s.name) };
  }
}
