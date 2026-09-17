/**
 * SampleInfoModal Component
 *
 * Purpose:
 * Renders an accessible modal dialog displaying comprehensive architecture documentation,
 * README descriptions, feature highlights, and test scenario counts for a Sample Workflow
 * in the Palette Samples tab panel.
 *
 * Architectural Decisions:
 * - Author: Mike Nimer <mikenimer@google.com>
 * - Decision 1: Extracted from PaletteCard into a dedicated component to maintain modular React
 *   component structure and avoid monolithic files.
 * - Decision 2: Overview Priority: The Overview section is rendered at the very top of the modal
 *   body, followed by Key Architectural Highlights and detailed technical specifications.
 * - Decision 3: Rich Markdown Formatting: Uses MarkdownViewer to render formatted text, tables,
 *   fenced code blocks, bullet points, and inline tags instead of raw markup strings.
 * - Decision 4: Adheres strictly to the 8pt grid spacing system (p-4, p-6, gap-2, gap-4, etc.).
 * - Decision 5: Modal Stacking & Portal: Renders via createPortal(..., document.body) with z-[100]
 *   so the dialog is never trapped by ancestor stacking contexts, overflow clips, or sibling
 *   splitters (such as PanelDivider).
 */

import React from 'react';
import { createPortal } from 'react-dom';
import { X, Sparkles, ExternalLink, Layers, Wrench, FlaskConical, BookOpen } from 'lucide-react';
import { SampleWorkflowDefinition } from '../../types';
import { MarkdownViewer, renderInlineMarkdown } from '../common/MarkdownViewer';

export interface FormattedReadmeResult {
  title: string;
  content: string;
  overview: string;
  sections: Array<{ heading?: string; body: string }>;
}

/**
 * Parses raw README markdown text (or fallback description) into structured sections
 * and extracts the top-level Overview for display at the top of the SampleInfoModal.
 *
 * @author Mike Nimer <mikenimer@google.com>
 * @param readmeContent Raw markdown content from the sample's README.md file
 * @param fallbackDescription Short description fallback if README is missing or empty
 * @returns Structured title, full content string, top overview, and parsed markdown sections
 */
export function formatReadmeForModal(
  readmeContent?: string,
  fallbackDescription: string = 'No description available.'
): FormattedReadmeResult {
  // Section 1: Handle missing or empty README content gracefully
  if (!readmeContent || readmeContent.trim().length === 0) {
    return {
      title: 'Overview',
      content: fallbackDescription,
      overview: fallbackDescription,
      sections: [{ heading: 'Overview', body: fallbackDescription }],
    };
  }

  // Section 2: Normalize line endings and extract top-level H1 title if present
  const normalized = readmeContent.replace(/\r\n/g, '\n').trim();
  const lines = normalized.split('\n');
  let mainTitle = 'Agent Documentation';
  let bodyStartIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('# ')) {
      mainTitle = trimmed.replace(/^#\s+/, '').trim();
      bodyStartIndex = i + 1;
      break;
    }
  }

  // Section 3: Segment remaining markdown by H2/H3 headings
  const remainingText = lines.slice(bodyStartIndex).join('\n').trim();
  const rawSections = remainingText.split(/(?=\n##\s+|\n###\s+)/g);
  const sections: Array<{ heading?: string; body: string }> = [];

  let introText = '';
  let explicitOverviewBody = '';

  for (const chunk of rawSections) {
    const trimmedChunk = chunk.trim();
    if (!trimmedChunk) continue;

    const firstLineEnd = trimmedChunk.indexOf('\n');
    if (trimmedChunk.startsWith('## ') || trimmedChunk.startsWith('### ')) {
      const heading = (firstLineEnd !== -1
        ? trimmedChunk.slice(0, firstLineEnd)
        : trimmedChunk
      ).replace(/^#{2,3}\s+/, '').trim();

      const body = firstLineEnd !== -1 ? trimmedChunk.slice(firstLineEnd + 1).trim() : '';

      if (heading.toLowerCase() === 'overview') {
        explicitOverviewBody = body;
      } else {
        sections.push({ heading, body });
      }
    } else {
      introText = trimmedChunk;
    }
  }

  // Section 4: Combine intro paragraph and explicit overview into top-level overview
  let overview = '';
  if (introText && explicitOverviewBody) {
    overview = `${introText}\n\n${explicitOverviewBody}`;
  } else if (introText) {
    overview = introText;
  } else if (explicitOverviewBody) {
    overview = explicitOverviewBody;
  } else {
    overview = fallbackDescription;
  }

  if (sections.length === 0) {
    sections.push({ heading: 'Overview', body: overview });
  }

  return {
    title: mainTitle,
    content: normalized,
    overview,
    sections,
  };
}

export interface SampleInfoModalProps {
  sample: SampleWorkflowDefinition | null;
  onClose: () => void;
  onOpenSample?: (sample: SampleWorkflowDefinition) => void;
}

/**
 * Modal dialog displaying a sample workflow's README documentation and metadata.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */
export const SampleInfoModal: React.FC<SampleInfoModalProps> = ({
  sample,
  onClose,
  onOpenSample,
}) => {
  // Section 1: Early exit if no sample is active
  if (!sample) return null;

  // Section 2: Format README content and compute test scenarios count
  const formatted = formatReadmeForModal(sample.readmeContent, sample.description);
  const testCount = sample.testPrompts?.length || 0;

  // Section 3: Render modal JSX tree with z-[100] high-priority stacking
  const modalContent = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-xs p-4"
      onClick={onClose}
      data-testid="sample-info-modal-backdrop"
    >
      <div
        className="relative w-full max-w-3xl max-h-[85vh] flex flex-col bg-[#161b22] border border-purple-500/40 rounded-lg shadow-2xl overflow-hidden text-gray-200"
        onClick={(e) => e.stopPropagation()}
        data-testid="sample-info-modal"
      >
        {/* Header Bar - 8pt grid padding (p-4 = 16px, gap-4 = 16px) */}
        <div className="flex items-center justify-between p-4 bg-[#0d1117] border-b border-[#30363d]">
          <div className="flex items-center gap-2 min-w-0">
            <BookOpen className="w-5 h-5 text-purple-400 shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-white truncate">{sample.name}</h2>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  {sample.badge}
                </span>
              </div>
              <p className="text-xs text-purple-300 font-mono mt-0.5">{sample.category}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close sample information dialog"
            data-testid="sample-info-modal-close"
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-[#21262d] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Metadata Summary Banner (p-4 = 16px, gap-4 = 16px) */}
        <div className="flex items-center gap-4 px-4 py-2 bg-[#21262d]/70 border-b border-[#30363d] text-xs font-mono text-gray-300 flex-wrap">
          <div className="flex items-center gap-2">
            <Layers className="w-3.5 h-3.5 text-purple-400" />
            <span>{sample.nodesCount} Nodes</span>
          </div>
          <span>•</span>
          <div className="flex items-center gap-2">
            <Wrench className="w-3.5 h-3.5 text-blue-400" />
            <span>{sample.toolsCount} Tools</span>
          </div>
          {testCount > 0 && (
            <>
              <span>•</span>
              <div className="flex items-center gap-2">
                <FlaskConical className="w-3.5 h-3.5 text-amber-400" />
                <span>{testCount} Test Scenarios</span>
              </div>
            </>
          )}
        </div>

        {/* Scrollable README Body (p-6 = 24px, space-y-4 = 16px) */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1 text-xs leading-relaxed">
          {/* 1. Overview Section (Prominently Placed at the Top) */}
          {formatted.overview && (
            <div className="p-4 bg-[#0d1117] border border-purple-500/30 rounded-lg space-y-2">
              <div className="text-xs font-semibold text-purple-300 flex items-center gap-2">
                <BookOpen className="w-3.5 h-3.5 text-purple-400" />
                <span>Overview</span>
              </div>
              <div className="text-gray-300 text-xs leading-relaxed">
                <MarkdownViewer content={formatted.overview} />
              </div>
            </div>
          )}

          {/* 2. Key Architectural Features */}
          {sample.features && sample.features.length > 0 && (
            <div className="p-4 bg-[#0d1117] border border-[#30363d] rounded-lg space-y-2">
              <div className="text-xs font-semibold text-purple-300 flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                <span>Key Architectural Highlights</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-gray-300 text-xs">
                {sample.features.map((feat, idx) => (
                  <li key={idx}>{renderInlineMarkdown(feat)}</li>
                ))}
              </ul>
            </div>
          )}

          {/* 3. Detailed README Sections */}
          {formatted.sections.map((sec, index) => {
            // Skip overview section in the loop if it was already rendered at the top
            if (sec.heading?.toLowerCase() === 'overview' && formatted.overview) {
              return null;
            }
            return (
              <div key={index} className="space-y-2">
                {sec.heading && (
                  <h3 className="text-sm font-bold text-white border-b border-[#30363d] pb-1">
                    {sec.heading}
                  </h3>
                )}
                <div className="p-4 rounded-lg bg-[#0d1117]/50 border border-[#30363d]/60 text-xs text-gray-300 leading-relaxed">
                  <MarkdownViewer content={sec.body} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Actions (p-4 = 16px, gap-2 = 8px) */}
        <div className="flex items-center justify-end gap-2 p-4 bg-[#0d1117] border-t border-[#30363d]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-[#21262d] hover:bg-[#30363d] text-gray-300 hover:text-white text-xs font-medium transition-colors cursor-pointer"
          >
            Close
          </button>
          {onOpenSample && (
            <button
              type="button"
              onClick={() => {
                onOpenSample(sample);
                onClose();
              }}
              className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Open Sample in New File</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );

  // Section 4: Portal to document.body to break out of all ancestor stacking contexts and splitters
  if (typeof document !== 'undefined' && document.body) {
    return createPortal(modalContent, document.body);
  }

  return modalContent;
};
