/**
 * Unit Tests for GitHub Actions Release Workflow & Tag Versioning
 *
 * This test suite validates that the automated GitHub Release CI/CD workflow
 * (.github/workflows/release.yml) is structured correctly to package the VSIX
 * using the git tag in the filename ('visual-agent-designer-<tag>.vsix') and
 * keep internal package.json extension versioning synchronized with the tag.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Release Workflow Configuration & Tag Packaging', () => {
  const workflowPath = path.resolve(__dirname, '../../.github/workflows/release.yml');

  /**
   * Helper function to extract semver from a git tag, mirroring the workflow logic.
   *
   * @param gitTag The raw git tag string (e.g. 'v0.1.2', 'v1.0.0-rc.1')
   * @returns Cleaned version string without leading 'v'
   */
  function extractVersionFromTag(gitTag: string): string {
    return gitTag.startsWith('v') ? gitTag.slice(1) : gitTag;
  }

  /**
   * Helper function to format the expected output VSIX filename from a tag.
   *
   * @param gitTag The git tag (e.g. 'v0.1.2')
   * @returns Expected vsix filename
   */
  function formatVsixFilename(gitTag: string): string {
    return `visual-agent-designer-${gitTag}.vsix`;
  }

  it('should have a readable release.yml workflow file', () => {
    assert.ok(fs.existsSync(workflowPath), 'release.yml must exist at .github/workflows/release.yml');
    const content = fs.readFileSync(workflowPath, 'utf-8');
    assert.ok(content.length > 0, 'release.yml should not be empty');
  });

  it('should trigger on v* tags', () => {
    const content = fs.readFileSync(workflowPath, 'utf-8');
    assert.match(content, /tags:\s*\n\s*-\s*['"]v\*['"]/, 'Workflow must trigger on tags matching v*');
  });

  it('should include a step to sync package.json version with git tag', () => {
    const content = fs.readFileSync(workflowPath, 'utf-8');
    assert.ok(
      content.includes('Sync package version with git tag'),
      'Workflow must include a step to synchronize package.json version with git tag'
    );
    assert.ok(
      content.includes('VERSION="${GITHUB_REF_NAME#v}"'),
      'Workflow must strip leading "v" from GITHUB_REF_NAME'
    );
    assert.ok(
      content.includes('npm version "$VERSION" --no-git-tag-version --allow-same-version'),
      'Workflow must run npm version with --no-git-tag-version and --allow-same-version'
    );
  });

  it('should package VSIX with custom filename matching visual-agent-designer-<tag>.vsix', () => {
    const content = fs.readFileSync(workflowPath, 'utf-8');
    assert.ok(
      content.includes('visual-agent-designer-${{ github.ref_name }}.vsix'),
      'Packaging step must output visual-agent-designer-${{ github.ref_name }}.vsix'
    );
    assert.match(
      content,
      /npx @vscode\/vsce package --no-dependencies -o ["']visual-agent-designer-\${{\s*github\.ref_name\s*}}\.vsix["']/,
      'vsce package command must include -o with tag filename'
    );
  });

  it('should upload the tag-named VSIX artifact in Publish GitHub Release', () => {
    const content = fs.readFileSync(workflowPath, 'utf-8');
    assert.ok(
      content.includes("files: 'visual-agent-designer-${{ github.ref_name }}.vsix'"),
      'action-gh-release files parameter must reference visual-agent-designer-${{ github.ref_name }}.vsix'
    );
  });

  it('should correctly transform tags into version numbers across simple, prerelease, and edge cases', () => {
    // Simple release tag
    assert.equal(extractVersionFromTag('v0.1.2'), '0.1.2');
    assert.equal(formatVsixFilename('v0.1.2'), 'visual-agent-designer-v0.1.2.vsix');

    // Minor/major release tags
    assert.equal(extractVersionFromTag('v1.0.0'), '1.0.0');
    assert.equal(formatVsixFilename('v1.0.0'), 'visual-agent-designer-v1.0.0.vsix');

    // Pre-release tags
    assert.equal(extractVersionFromTag('v2.0.0-rc.1'), '2.0.0-rc.1');
    assert.equal(formatVsixFilename('v2.0.0-rc.1'), 'visual-agent-designer-v2.0.0-rc.1.vsix');

    // Edge case: tag without leading v
    assert.equal(extractVersionFromTag('0.1.2'), '0.1.2');
    assert.equal(formatVsixFilename('0.1.2'), 'visual-agent-designer-0.1.2.vsix');
  });
});
