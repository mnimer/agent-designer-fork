/**
 * pathGuard.ts
 *
 * Security utilities to validate and enforce directory containment within the VS Code workspace.
 * Prevents directory traversal attacks, UNC path attacks, and unauthorized absolute file accesses.
 *
 * Author: Mike Nimer <mikenimer@google.com>
 */

import * as path from 'path';
import * as vscode from 'vscode';

/**
 * Checks if a target file system path is strictly inside or equal to a parent directory path.
 *
 * @param parentFsPath Absolute path of the parent directory
 * @param targetFsPath Absolute path of the target file/directory
 */
export function isPathInside(parentFsPath: string, targetFsPath: string): boolean {
  // Normalize both paths to resolve any relative differences or symlinks
  const parent = path.resolve(parentFsPath);
  const target = path.resolve(targetFsPath);

  // Exact match is considered contained (for directories or matching file)
  if (parent === target) {
    return true;
  }

  // Append path separator to make sure we match folder boundaries and avoid sibling matches (e.g., /foo matching /foo-bar)
  const parentWithSep = parent.endsWith(path.sep) ? parent : parent + path.sep;
  return target.startsWith(parentWithSep);
}

/**
 * Validates that a candidate path resides strictly within a base workspace URI.
 * Rejects directory traversal segments, absolute paths, drive letters, and UNC prefixes.
 *
 * @param baseUri Base workspace URI
 * @param candidateRelPath Candidate relative path to validate
 * @returns Resolved vscode.Uri inside the workspace
 * @throws Error if validation fails
 */
export function assertInsideWorkspace(baseUri: vscode.Uri, candidateRelPath: string): vscode.Uri {
  // Ensure we have a valid path argument
  if (!candidateRelPath) {
    throw new Error('Path argument is empty or undefined');
  }

  // 1. Reject explicit traversal ('..') segments
  if (candidateRelPath.includes('..')) {
    throw new Error(`Path contains directory traversal ('..') segments: ${candidateRelPath}`);
  }

  // 1b. Reject sensitive directories like .git to prevent tampering with git hooks/config
  const normalizedRel = candidateRelPath.replace(/\\/g, '/');
  if (normalizedRel.split('/').includes('.git')) {
    throw new Error(`Access to .git folder or its subdirectories is prohibited: ${candidateRelPath}`);
  }

  // 2. Reject UNC prefixes (starts with \\ or //)
  if (candidateRelPath.startsWith('\\\\') || candidateRelPath.startsWith('//')) {
    throw new Error(`Path contains UNC prefix: ${candidateRelPath}`);
  }

  // 3. Reject Windows drive letters (e.g. C:)
  if (/^[A-Za-z]:/.test(candidateRelPath)) {
    throw new Error(`Path contains drive letter: ${candidateRelPath}`);
  }

  // 4. Reject absolute paths
  if (path.isAbsolute(candidateRelPath) || candidateRelPath.startsWith('/') || candidateRelPath.startsWith('\\')) {
    throw new Error(`Path must be relative, absolute paths are not allowed: ${candidateRelPath}`);
  }

  // 5. Normalize and resolve the paths to ensure they reside strictly inside the baseUri
  const baseFsPath = path.resolve(baseUri.fsPath);
  const resolvedFsPath = path.resolve(baseFsPath, candidateRelPath);

  // 6. Ensure resolved path is strictly within the parent folder
  if (!isPathInside(baseFsPath, resolvedFsPath)) {
    throw new Error(`Access Denied: Path '${candidateRelPath}' resolves to outside the workspace folder '${baseFsPath}'`);
  }

  return vscode.Uri.file(resolvedFsPath);
}
