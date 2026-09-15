/**
 * identifierValidation.ts
 *
 * Job in Application:
 * Validates and sanitizes Python identifiers for Agents, Tools, and Nodes in Google ADK.
 * Google ADK Agent and LlmAgent classes enforce that agent `name` is a valid Python
 * identifier via Pydantic (isidentifier()). Names with spaces, hyphens, or starting with
 * digits cause runtime 500 errors when importing the agent module in the local test runner.
 *
 * Architectural Decisions:
 * 1. Shared Module: Located in `src/shared/` to be shared between webview UI (inspectors, drawers, forms)
 *    and extension host (Gemini code generation engine, document normalization).
 * 2. Real-time Feedback: Provides boolean validity, human-readable diagnostics, and auto-sanitized snake_case alternative.
 * 3. Python Keyword Protection: Checks against Python reserved keywords (e.g., `import`, `def`, `class`, `from`, etc.)
 *    and appends a trailing suffix if collided.
 * 4. 8pt Grid System Compliance: Error messages and feedback structures integrate cleanly with UI styling.
 *
 * Author: Mike Nimer <mikenimer@google.com>
 */

/**
 * Standard Python 3 reserved keywords that cannot be used as valid identifiers.
 */
export const PYTHON_KEYWORDS = new Set([
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break',
  'class', 'continue', 'def', 'del', 'elif', 'else', 'except', 'finally',
  'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal',
  'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield'
]);

export interface IdentifierValidationResult {
  /**
   * Whether the input string is a valid Python identifier.
   */
  isValid: boolean;
  /**
   * The suggested sanitized Python identifier (lowercase snake_case).
   */
  sanitized: string;
  /**
   * Human-readable explanation of why the identifier is invalid, if applicable.
   */
  error?: string;
  /**
   * Whether the string contains spaces.
   */
  hasSpaces: boolean;
  /**
   * Whether the string contains hyphens.
   */
  hasHyphens: boolean;
  /**
   * Whether the string starts with a digit.
   */
  startsWithDigit: boolean;
  /**
   * Whether the string contains non-alphanumeric, non-underscore characters.
   */
  hasSpecialChars: boolean;
  /**
   * Whether the string collides with a Python reserved keyword.
   */
  isKeyword: boolean;
}

/**
 * Checks if a string is a strictly valid Python identifier.
 *
 * @param name - The identifier string to check
 * @returns True if the string is a valid Python identifier and not a reserved keyword
 */
export function isValidPythonIdentifier(name: string): boolean {
  if (!name || typeof name !== 'string') {
    return false;
  }
  // Must match [a-zA-Z_][a-zA-Z0-9_]*
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    return false;
  }
  // Cannot be a Python keyword
  if (PYTHON_KEYWORDS.has(name)) {
    return false;
  }
  return true;
}

/**
 * Validates an agent identifier and produces detailed diagnostic information.
 *
 * @param name - The identifier string to validate
 * @param fallbackPrefix - Fallback prefix for generating a sanitized alternative (defaults to 'agent')
 * @returns Detailed validation result with diagnostic flags and suggested sanitized alternative
 */
export function validateAgentIdentifier(name: string, fallbackPrefix: string = 'agent'): IdentifierValidationResult {
  const trimmed = (name || '').trim();
  const sanitized = sanitizeAgentIdentifier(name, fallbackPrefix);

  const hasSpaces = /\s/.test(name || '');
  const hasHyphens = /-/.test(name || '');
  const startsWithDigit = /^[0-9]/.test(trimmed);
  const hasSpecialChars = /[^a-zA-Z0-9_]/.test(trimmed);
  const isKeyword = PYTHON_KEYWORDS.has(trimmed);

  if (!trimmed) {
    return {
      isValid: false,
      sanitized,
      error: 'Agent identifier cannot be empty.',
      hasSpaces,
      hasHyphens,
      startsWithDigit,
      hasSpecialChars,
      isKeyword: false,
    };
  }

  if (hasSpaces) {
    return {
      isValid: false,
      sanitized,
      error: 'Agent identifier cannot contain spaces. Use underscores (e.g. cat_agent).',
      hasSpaces: true,
      hasHyphens,
      startsWithDigit,
      hasSpecialChars,
      isKeyword,
    };
  }

  if (hasHyphens) {
    return {
      isValid: false,
      sanitized,
      error: 'Agent identifier cannot contain hyphens. Use underscores (e.g. cat_agent).',
      hasSpaces,
      hasHyphens: true,
      startsWithDigit,
      hasSpecialChars,
      isKeyword,
    };
  }

  if (startsWithDigit) {
    return {
      isValid: false,
      sanitized,
      error: 'Agent identifier cannot start with a number.',
      hasSpaces,
      hasHyphens,
      startsWithDigit: true,
      hasSpecialChars,
      isKeyword,
    };
  }

  if (hasSpecialChars) {
    return {
      isValid: false,
      sanitized,
      error: 'Agent identifier can only contain letters, numbers, and underscores.',
      hasSpaces,
      hasHyphens,
      startsWithDigit,
      hasSpecialChars: true,
      isKeyword,
    };
  }

  if (isKeyword) {
    return {
      isValid: false,
      sanitized,
      error: `'${trimmed}' is a reserved Python keyword. Choose a different identifier.`,
      hasSpaces,
      hasHyphens,
      startsWithDigit,
      hasSpecialChars,
      isKeyword: true,
    };
  }

  return {
    isValid: true,
    sanitized,
    hasSpaces: false,
    hasHyphens: false,
    startsWithDigit: false,
    hasSpecialChars: false,
    isKeyword: false,
  };
}

/**
 * Sanitizes any string into a valid, lowercase snake_case Python identifier.
 *
 * Examples:
 * - "Cat Agent" -> "cat_agent"
 * - "Triage Specialist" -> "triage_specialist"
 * - "3 cats" -> "agent_3_cats"
 * - "my-agent-123!" -> "my_agent_123"
 * - "import" -> "import_agent"
 *
 * @param input - Raw input string (label, id, or name)
 * @param fallbackPrefix - Prefix if input is empty or starts with a digit
 * @returns Clean Python identifier
 */
export function sanitizeAgentIdentifier(input: string, fallbackPrefix: string = 'agent'): string {
  if (!input || typeof input !== 'string') {
    return fallbackPrefix;
  }

  // 1. Lowercase and replace non-alphanumeric chars (spaces, hyphens, punctuation) with underscores
  let cleaned = input
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  // 2. If starts with a number, prepend fallbackPrefix
  if (/^[0-9]/.test(cleaned)) {
    cleaned = `${fallbackPrefix}_${cleaned}`;
  }

  // 3. If empty after stripping, return fallbackPrefix
  if (!cleaned) {
    return fallbackPrefix;
  }

  // 4. If collides with a Python keyword, append _agent
  if (PYTHON_KEYWORDS.has(cleaned)) {
    cleaned = `${cleaned}_agent`;
  }

  return cleaned;
}

/**
 * Validates whether a resource identifier string is a valid Vertex AI Reasoning Engine / Agent Engine ID.
 * Vertex AI Reasoning Engines use system-generated 64-bit integer IDs (e.g. "6900866478677950464")
 * or fully qualified resource paths (e.g. "projects/.../locations/.../reasoningEngines/6900866478677950464").
 * Non-numeric names like "animal-agent" (typical for Cloud Run services) are NOT valid Reasoning Engine IDs
 * and cause 400 INVALID_ARGUMENT from Vertex AI when passed to adk deploy --agent_engine_id.
 *
 * @param id - Resource ID or resource name to test
 * @returns true if the identifier matches Vertex AI Reasoning Engine conventions
 */
export function isValidAgentEngineId(id?: string | null): boolean {
  if (!id || typeof id !== 'string') {
    return false;
  }
  const trimmed = id.trim();
  if (!trimmed) {
    return false;
  }
  // Pure numeric 64-bit ID
  if (/^\d+$/.test(trimmed)) {
    return true;
  }
  // Full resource path ending in numeric ID
  if (/^projects\/[^/]+\/locations\/[^/]+\/reasoningEngines\/\d+$/.test(trimmed)) {
    return true;
  }
  return false;
}

