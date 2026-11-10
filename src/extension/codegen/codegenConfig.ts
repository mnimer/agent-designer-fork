/**
 * Code Generation Configuration
 *
 * Purpose: Single source of truth for skill-assembled single-prompt code generation and the optional
 * post-generation reviewer (`src/extension/codegen/*`). No module hardcodes these literals
 * (AGENTS.md: strict DRY, zero magic constants).
 *
 * Architectural decisions / notes for future sessions:
 * - 2026-10-23: the multi-agent ADK workflow was measured 2.3-2.5x slower than one Gemini call
 *   (code_reviewer: 83 s vs 190-212 s) and was removed. Code generation is ONE model call whose prompt
 *   is assembled from the topic skills in `resource/codegen-skills/` (feature-selected per blueprint).
 * - The reviewer (read-only checks + LLM review + targeted fix call) is behind a code-generator flag,
 *   OFF by default (`CODEGEN_REVIEWER_ENABLED_BY_DEFAULT`), used for testing first.
 *
 * Author: Mike Nimer <mikenimer@google.com>
 */

/** Who a skill is written for (skill frontmatter `metadata.usedBy`). */
export const CODEGEN_SKILL_AUDIENCES = {
  generator: 'generator',
  reviewer: 'reviewer',
} as const;

export type CodegenSkillAudience = (typeof CODEGEN_SKILL_AUDIENCES)[keyof typeof CODEGEN_SKILL_AUDIENCES];

/** Deployment targets used in skill `metadata.targets`. */
export const CODEGEN_TARGETS = {
  all: 'all',
  cloudrun: 'cloudrun',
  agentEngine: 'agent-engine',
} as const;

export type CodegenTarget = typeof CODEGEN_TARGETS.cloudrun | typeof CODEGEN_TARGETS.agentEngine;

/** Skill that is always placed first in the prompt (shared rules and output contract). */
export const CODEGEN_COMMON_SKILL_NAME = 'codegen-common';

/** Resource locations, relative to the extension root. */
export const CODEGEN_RESOURCE_PATHS = {
  skillsDir: ['resource', 'codegen-skills'],
  skillFileName: 'SKILL.md',
  /** Reviewer / fix prompt templates. */
  promptsDir: ['resource', 'codegen-prompts'],
  reviewerPrompt: 'reviewer.md',
  fixPrompt: 'fix.md',
} as const;

/** The reviewer pass is opt-in (testing first; may be exposed in the UI later). */
export const CODEGEN_REVIEWER_ENABLED_BY_DEFAULT = false;

/** Limits for the optional reviewer. */
export const CODEGEN_LIMITS = {
  /** Maximum review -> fix rounds; a final review reports anything left unresolved. */
  maxReviewRounds: 2,
  /** Timeout for each read-only check subprocess (ms). */
  checkTimeoutMs: 120_000,
  /** Maximum characters of check output forwarded to the reviewer per check. */
  maxCheckOutputChars: 8_000,
} as const;

/**
 * Normalizes any deployment target string from the UI/document into a code generation target.
 * Agent Runtime (Agent Engine) is the default, matching the existing deploy default.
 *
 * @param rawTarget Deployment target from the request or document metadata.
 * @returns `cloudrun` or `agent-engine`.
 */
export function normalizeCodegenTarget(rawTarget: string | undefined): CodegenTarget {
  const normalized = (rawTarget || '').toLowerCase();
  // NOTE: 'cloud_run', 'cloudrun', 'cloud-run' all map to Cloud Run; anything else is Agent Runtime.
  return normalized.includes('cloud') ? CODEGEN_TARGETS.cloudrun : CODEGEN_TARGETS.agentEngine;
}
