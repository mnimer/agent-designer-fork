/**
 * folderValidation.ts
 *
 * Job in Application:
 * Provides validation and sanitization utilities for agent target folder paths.
 * Vertex AI Agent Engine and Python ADK package the agent by treating the folder basename
 * as a Python package/module name (e.g. `import <folder_name>.agent`). Python requires
 * module names to be valid identifiers: letters, digits, and underscores, without hyphens,
 * spaces, or leading digits.
 *
 * Architectural Decisions:
 * 1. Shared Module: Placed in `src/shared/` so that both the webview (Deployment Tab,
 *    Code Generator) and the extension host (`AgentEngineDeployer`) can share identical
 *    validation and sanitization rules without drift.
 * 2. Path-Preserving Sanitization: Sanitizes only the leaf folder segment while preserving
 *    relative path prefixes (`./`, `../`, `src/agents/`) and trailing slashes.
 * 3. Descriptive Feedback: Returns detailed diagnostics detailing which characters are
 *    invalid (e.g., highlighting hyphens) and providing the exact sanitized alternative.
 *
 * Author: Mike Nimer <mikenimer@google.com>
 */

export interface TargetFolderValidationResult {
  /**
   * Whether the folder name satisfies Python identifier requirements for Agent Engine.
   */
  isValid: boolean;
  /**
   * The extracted base name of the target folder.
   */
  folderBase: string;
  /**
   * The suggested sanitized folder path with invalid characters replaced.
   */
  sanitizedPath: string;
  /**
   * The suggested sanitized base name.
   */
  sanitizedBase: string;
  /**
   * Human-readable explanation of why the folder name is invalid, if applicable.
   */
  error?: string;
  /**
   * Specific warning flag indicating that hyphens were detected.
   */
  hasHyphens: boolean;
}

/**
 * Validates a target folder path for compatibility with Python ADK and Vertex AI Agent Engine.
 *
 * @param folderPath - Raw folder path entered by user or loaded from document metadata.
 * @returns TargetFolderValidationResult with validity flag, diagnostics, and sanitized alternative.
 */
export function validateTargetFolder(folderPath: string): TargetFolderValidationResult {
  // NOTE: Normalize backslashes to forward slashes for cross-platform consistency
  const normalized = (folderPath || '').trim().replace(/\\/g, '/');

  // Strip trailing slashes to isolate the leaf folder name
  const stripped = normalized.replace(/\/+$/, '');
  const segments = stripped.split('/').filter(Boolean);
  const folderBase = segments.length > 0 ? segments[segments.length - 1] : '';

  if (!folderBase) {
    return {
      isValid: false,
      folderBase: '',
      sanitizedPath: './agent_app/',
      sanitizedBase: 'agent_app',
      error: 'Target folder path cannot be empty.',
      hasHyphens: false,
    };
  }

  const hasHyphens = folderBase.includes('-');
  // Python identifier regex: starts with a letter or underscore, followed by letters, digits, or underscores
  const isPythonIdentifier = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(folderBase);

  const sanitizedBase = sanitizeFolderBaseName(folderBase);
  const sanitizedPath = reconstructPath(normalized, sanitizedBase);

  if (!isPythonIdentifier) {
    let errorMsg = `Folder name '${folderBase}' is not a valid Python identifier.`;
    if (hasHyphens) {
      errorMsg = `Folder name '${folderBase}' contains hyphens ('-'). Python module names require underscores ('_').`;
    } else if (/^[0-9]/.test(folderBase)) {
      errorMsg = `Folder name '${folderBase}' cannot begin with a number.`;
    } else {
      errorMsg = `Folder name '${folderBase}' contains special characters that are not permitted in Python module names.`;
    }

    return {
      isValid: false,
      folderBase,
      sanitizedPath,
      sanitizedBase,
      error: errorMsg,
      hasHyphens,
    };
  }

  return {
    isValid: true,
    folderBase,
    sanitizedPath,
    sanitizedBase,
    hasHyphens: false,
  };
}

/**
 * Sanitizes only the leaf folder base name to conform to Python identifier rules.
 *
 * Replaces hyphens with underscores, non-alphanumeric characters with underscores,
 * and prefixes with `agent_` if starting with a digit.
 *
 * @param base - Leaf folder base name (e.g. `scratch-flow`)
 * @returns Sanitized Python identifier (e.g. `scratch_flow`)
 */
export function sanitizeFolderBaseName(base: string): string {
  if (!base) return 'agent_app';

  // 1. Replace hyphens and other non-alphanumeric characters with underscores
  let sanitized = base.replace(/[^a-zA-Z0-9_]/g, '_');

  // 2. Collapse consecutive underscores into a single underscore
  sanitized = sanitized.replace(/_+/g, '_');

  // 3. Trim leading and trailing underscores
  sanitized = sanitized.replace(/^_+|_+$/g, '');

  // 4. Ensure it doesn't start with a number
  if (/^[0-9]/.test(sanitized)) {
    sanitized = `agent_${sanitized}`;
  }

  // 5. Fallback if the string became empty
  if (!sanitized) {
    sanitized = 'agent_app';
  }

  return sanitized;
}

/**
 * Sanitizes a full target folder path, replacing hyphens with underscores in the leaf folder
 * while preserving relative path prefixes and trailing slashes.
 *
 * @param folderPath - Full target folder path (e.g. `./scratch-flow/` or `src/agents/my-agent`)
 * @returns Sanitized path (e.g. `./scratch_flow/` or `src/agents/my_agent/`)
 */
export function sanitizeTargetFolder(folderPath: string): string {
  const result = validateTargetFolder(folderPath);
  return result.sanitizedPath;
}

/**
 * Helper to reconstruct the full path replacing the leaf folder with its sanitized name,
 * preserving any leading paths (`./`, `agents/scratch/`) and trailing slash.
 */
function reconstructPath(originalPath: string, sanitizedBase: string): string {
  const hasTrailingSlash = originalPath.endsWith('/') || originalPath.endsWith('\\');
  const normalized = originalPath.replace(/\\/g, '/');
  const stripped = normalized.replace(/\/+$/, '');
  const lastSlashIndex = stripped.lastIndexOf('/');

  let prefix = '';
  if (lastSlashIndex >= 0) {
    prefix = stripped.substring(0, lastSlashIndex + 1);
  } else if (originalPath.startsWith('./')) {
    prefix = './';
  }

  const result = `${prefix}${sanitizedBase}`;
  return hasTrailingSlash ? `${result}/` : result;
}
