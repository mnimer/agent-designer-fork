/**
 * Unit Tests: shared code generation progress reducer & labels
 *
 * Author: Mike Nimer <mikenimer@google.com>
 */
import { describe, it, expect } from 'vitest';
import {
  INITIAL_CODEGEN_PROGRESS,
  applyCodeGenProgress,
  describeCodeGenPhase,
} from '../../../../src/shared/codegen/codeGenProgress';

describe('applyCodeGenProgress', () => {
  it('tracks the current phase', () => {
    const state = applyCodeGenProgress(INITIAL_CODEGEN_PROGRESS, { kind: 'phase', phase: { phase: 'generating' } });
    expect(state.phase).toEqual({ phase: 'generating' });
    expect(INITIAL_CODEGEN_PROGRESS.phase).toBeNull();
  });

  it('appends new files in arrival order', () => {
    let state = applyCodeGenProgress(INITIAL_CODEGEN_PROGRESS, { kind: 'file', path: 'agent.py', owner: 'core' });
    state = applyCodeGenProgress(state, { kind: 'file', path: 'README.md', owner: 'docs' });
    expect(state.files).toEqual([
      { path: 'agent.py', owner: 'core', revisions: 1 },
      { path: 'README.md', owner: 'docs', revisions: 1 },
    ]);
  });

  it('updates rewritten files in place and counts revisions', () => {
    let state = applyCodeGenProgress(INITIAL_CODEGEN_PROGRESS, { kind: 'file', path: 'main.tf', owner: 'infra' });
    state = applyCodeGenProgress(state, { kind: 'file', path: 'agent.py', owner: 'core' });
    state = applyCodeGenProgress(state, { kind: 'file', path: 'main.tf', owner: 'infra' });
    expect(state.files).toEqual([
      { path: 'main.tf', owner: 'infra', revisions: 2 },
      { path: 'agent.py', owner: 'core', revisions: 1 },
    ]);
  });

  it('does not mutate the previous state', () => {
    const before = applyCodeGenProgress(INITIAL_CODEGEN_PROGRESS, { kind: 'file', path: 'a.py', owner: 'core' });
    const snapshot = JSON.parse(JSON.stringify(before));
    applyCodeGenProgress(before, { kind: 'file', path: 'a.py', owner: 'core' });
    expect(before).toEqual(snapshot);
  });
});

describe('describeCodeGenPhase', () => {
  it.each([
    [null, /Preparing/],
    [{ phase: 'generating' }, /Generating the repository/],
    [{ phase: 'checks', round: 1 }, /Review round 1: running/],
    [{ phase: 'review', round: 2 }, /Review round 2: reviewing/],
    [{ phase: 'fix', round: 1, files: ['main.tf', 'agent.py'] }, /Fix round 1: regenerating 2 file\(s\)/],
    [{ phase: 'done', reviewed: false, clean: true }, /Generation complete/],
    [{ phase: 'done', reviewed: true, clean: true }, /Review passed/],
    [{ phase: 'done', reviewed: true, clean: false }, /unresolved/],
  ])('%j', (phase, expected) => {
    expect(describeCodeGenPhase(phase as any)).toMatch(expected);
  });
});
