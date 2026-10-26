/**
 * Code Generation Progress (shared host <-> webview contract)
 *
 * Purpose: Defines the `CODE_GENERATION_PROGRESS` payload streamed from the extension host while
 * code generation (and the optional reviewer) runs, plus a pure reducer and label helper the webview
 * uses to render live progress (current phase + files as each agent writes them).
 *
 * Architectural decisions / notes for future sessions:
 * - Pure functions only (no React, no VS Code APIs) so both sides can import it and it is unit
 *   tested in isolation.
 * - Files are keyed by path; a rewrite during a fix round updates the entry in place and bumps
 *   `revisions` instead of duplicating it.
 *
 * Author: Mike Nimer <mikenimer@google.com>
 */
import type { CodeGenPhaseEvent } from './types';

/** One progress message from the host. */
export type CodeGenProgressPayload =
  | { kind: 'phase'; phase: CodeGenPhaseEvent }
  | { kind: 'file'; path: string; owner: string };

/** A file written so far. */
export interface CodeGenProgressFile {
  path: string;
  owner: string;
  /** Number of times the file was written (> 1 after reviewer fix rounds). */
  revisions: number;
}

/** Accumulated progress shown while generating. */
export interface CodeGenProgressState {
  phase: CodeGenPhaseEvent | null;
  files: CodeGenProgressFile[];
}

/** Empty progress (start of a run). */
export const INITIAL_CODEGEN_PROGRESS: CodeGenProgressState = { phase: null, files: [] };

/** Human-readable labels for file owners. */
export const CODEGEN_AGENT_LABELS: Record<string, string> = {
  generator: 'Generated',
  reviewer: 'Reviewer fix',
};

/**
 * Applies one progress message to the state (pure).
 *
 * @param state Current state.
 * @param payload Progress message.
 * @returns New state.
 */
export function applyCodeGenProgress(state: CodeGenProgressState, payload: CodeGenProgressPayload): CodeGenProgressState {
  if (payload.kind === 'phase') {
    return { ...state, phase: payload.phase };
  }
  // NOTE: Rewrites (fix rounds) update the existing entry and bump its revision count.
  const existing = state.files.find((file) => file.path === payload.path);
  if (existing) {
    return {
      ...state,
      files: state.files.map((file) =>
        file.path === payload.path ? { ...file, owner: payload.owner, revisions: file.revisions + 1 } : file
      ),
    };
  }
  return { ...state, files: [...state.files, { path: payload.path, owner: payload.owner, revisions: 1 }] };
}

/**
 * Returns a short status line for a phase.
 *
 * @param phase Current phase (null before the first phase event).
 */
export function describeCodeGenPhase(phase: CodeGenPhaseEvent | null): string {
  if (!phase) {
    return 'Preparing code generation agents…';
  }
  switch (phase.phase) {
    case 'generating':
      return 'Generating the repository…';
    case 'checks':
      return `Review round ${phase.round}: running compile / test-collection / Terraform checks…`;
    case 'review':
      return `Review round ${phase.round}: reviewing cross-file consistency…`;
    case 'fix':
      return `Fix round ${phase.round}: regenerating ${phase.files.length} file(s) to address review issues…`;
    case 'done':
      if (!phase.reviewed) return 'Generation complete.';
      return phase.clean ? 'Review passed.' : 'Finished with unresolved review issues.';
  }
}
