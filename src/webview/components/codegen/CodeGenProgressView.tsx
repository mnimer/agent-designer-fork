/**
 * CodeGenProgressView
 *
 * Purpose: Renders live code generation progress inside the Code Preview tab while generation is
 * running: the current phase (generating -> optional review checks/review/fix rounds) and the files
 * produced.
 *
 * Architectural decisions / notes for future sessions:
 * - Presentational only: props in, no events out. State is accumulated in `FlowCanvas` with the
 *   pure `applyCodeGenProgress` reducer from `src/shared/codegen/codeGenProgress.ts`.
 * - Spacing follows the 8pt grid (Tailwind 2/4/6 = 8/16/24px); typography uses the 14px/12px scale.
 *
 * Author: Mike Nimer <mikenimer@google.com>
 */
import React from 'react';
import { RefreshCw, FileCode2 } from 'lucide-react';
import {
  CODEGEN_AGENT_LABELS,
  CodeGenProgressState,
  describeCodeGenPhase,
} from '../../../shared/codegen/codeGenProgress';

export interface CodeGenProgressViewProps {
  /** Accumulated progress for the current run. */
  progress: CodeGenProgressState;
  /** Model used for code generation (shown in the heading). */
  modelName: string;
}

export const CodeGenProgressView: React.FC<CodeGenProgressViewProps> = ({ progress, modelName }) => {
  return (
    <div className="h-full flex flex-col items-center justify-start gap-4 py-6 font-sans" data-testid="codegen-progress">
      {/* Heading: spinner, model, and the current phase */}
      <div className="flex flex-col items-center gap-2">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-400" />
        <span className="text-sm leading-5 font-semibold text-gray-200">Generating code with {modelName}…</span>
        <span className="text-xs leading-4 text-gray-400" data-testid="codegen-progress-phase">
          {describeCodeGenPhase(progress.phase)}
        </span>
      </div>

      {/* Files written so far, in arrival order */}
      {progress.files.length > 0 && (
        <ul className="w-full max-w-xl flex flex-col gap-2" data-testid="codegen-progress-files">
          {progress.files.map((file) => (
            <li key={file.path} className="flex items-center justify-between gap-2 px-2 py-2 rounded border border-[#21262d] bg-[#161b22]">
              <span className="flex items-center gap-2 min-w-0">
                <FileCode2 className="w-4 h-4 shrink-0 text-gray-400" />
                <span className="font-mono text-xs leading-4 text-gray-200 truncate">{file.path}</span>
              </span>
              <span className="flex items-center gap-2 shrink-0">
                {file.revisions > 1 && (
                  <span className="text-xs leading-4 text-amber-400" title="Rewritten during a review fix round">
                    revised ×{file.revisions - 1}
                  </span>
                )}
                <span className="text-xs leading-4 px-2 rounded border border-blue-800 text-blue-300">
                  {CODEGEN_AGENT_LABELS[file.owner] ?? file.owner}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
