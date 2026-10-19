/**
 * ChatMessageRenderer Component
 *
 * Renders interactive chat message turns with rich formatting:
 * - Markdown text formatting (bold, italics, headers H1-H4, lists, quotes, inline code, <br> breaks)
 * - GitHub Flavored Markdown (GFM) tables with column alignment, inline formatting, escaped pipes,
 *   backtick-aware cell splitting, borderless outer-pipe tables, and live streaming table support
 * - Fenced code blocks with language pills and copy-to-clipboard button
 * - Markdown images (![alt](url)) with responsive preview and error fallbacks
 * - A2UI v0.9.1 Protocol Support (TASK-221):
 *   - Parses and renders interactive A2UI surfaces via A2UISurfaceRenderer
 *   - Supports two-way bound inputs and controller action routing via onUserAction
 * - PlanReAct & BuiltInPlanner Thought Trace Rendering (TASK-226):
 *   - Parses ADK PlanReAct tags (/*PLANNING*\/, /*ACTION*\/, /*REASONING*\/, /*REPLANNING*\/, /*FINAL_ANSWER*\/)
 *   - Renders collapsible Reasoning & Planning Trace accordion above final answer
 * - Backward-compatible legacy A2UI card renderer fallback
 *
 * Architectural Decisions:
 * 1. Multi-modal Extraction: Extracts both A2UI surfaces (v0.9.1) and PlanReAct traces
 *    from raw LLM output streams while keeping clean markdown separation.
 * 2. Native React & Tailwind GFM Table Parser: Respects escaped pipes (\|) and inline code spans
 *    (`a | b`) so technical schemas, SQL expressions, and Data Domain URIs inside cells never
 *    corrupt column layout, and pads ragged streaming rows cleanly.
 * 3. 8pt Grid System: All layout margins, paddings, and component gaps use standard multiples of 8px.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import React, { useState, useMemo } from 'react';
import {
  Copy,
  Check,
  ExternalLink,
  Code,
  Layers,
  ChevronDown,
  ChevronRight,
  Image as ImageIcon,
  Brain,
  GitBranch,
  Play,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import {
  A2UISurfaceRenderer,
  extractA2UIPayloads,
  A2UIUserAction,
} from '../runner/A2UISurfaceRenderer';

// ============================================================================
// 1. Types & Interfaces
// ============================================================================

export interface PlanReActTrace {
  tag: string;
  content: string;
}

export interface ChatMessageRendererProps {
  content: string;
  isUser?: boolean;
  isStreaming?: boolean;
  onActionClick?: (actionText: string) => void;
  onUserAction?: (action: A2UIUserAction) => void;
  a2uiSurfaces?: any[];
}

export type TableColumnAlignment = 'left' | 'center' | 'right';

interface LegacyA2uiPayload {
  type?: string;
  component?: string;
  title?: string;
  subtitle?: string;
  description?: string;
  text?: string;
  imageUrl?: string;
  image?: string;
  buttons?: Array<{ label?: string; text?: string; value?: string; action?: string }>;
  choices?: string[];
  options?: string[];
  fields?: Array<{ label?: string; placeholder?: string; type?: string }>;
  [key: string]: any;
}

// ============================================================================
// 2. GFM Markdown Table Utilities
// ============================================================================

/**
 * Splits a Markdown table row into individual cell strings while preserving:
 * - Pipes inside inline backtick code spans (e.g., `` `a | b` ``)
 * - Escaped pipes (`\|`), unescaping them to literal `|` in the resulting cell text
 *
 * Leading and trailing empty cells produced by outer table pipes (`| col1 | col2 |`)
 * are stripped automatically.
 */
export function splitTableRow(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed) return [];

  // Strip optional leading and trailing outer pipe characters (unless escaped \|)
  let inner = trimmed;
  if (inner.startsWith('|')) {
    inner = inner.slice(1);
  }
  if (inner.endsWith('|') && !inner.endsWith('\\|')) {
    inner = inner.slice(0, -1);
  }

  const cells: string[] = [];
  let current = '';
  let inBackticks = false;

  // Iterate character by character to respect inline code spans and escaped pipes
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];

    // Handle escaped pipe \|
    if (ch === '\\' && i + 1 < inner.length && inner[i + 1] === '|') {
      current += '|';
      i++;
      continue;
    }

    // Toggle backtick code state
    if (ch === '`') {
      inBackticks = !inBackticks;
      current += ch;
      continue;
    }

    // Split on unescaped pipe outside of inline code
    if (ch === '|' && !inBackticks) {
      cells.push(current.trim());
      current = '';
      continue;
    }

    current += ch;
  }

  cells.push(current.trim());
  return cells;
}

/**
 * Determines whether an array of parsed table cells represents a GFM delimiter row
 * (e.g., `| --- | :--- | :---: | ---: |`).
 */
export function isTableDelimiterRow(cells: string[]): boolean {
  if (!cells || cells.length === 0) return false;
  return cells.every((cell) => /^\s*:?-{2,}:?\s*$/.test(cell));
}

/**
 * Extracts column alignment directives (`left`, `center`, `right`) from a GFM delimiter row.
 */
export function parseColumnAlignments(delimiterCells: string[]): TableColumnAlignment[] {
  return delimiterCells.map((cell) => {
    const c = cell.trim();
    const startsWithColon = c.startsWith(':');
    const endsWithColon = c.endsWith(':');
    if (startsWithColon && endsWithColon) return 'center';
    if (endsWithColon) return 'right';
    return 'left';
  });
}

/**
 * Checks whether a single line looks like a candidate table row.
 * Supports standard pipe-bounded rows (`| a | b |`), partial streaming rows starting with `|`,
 * or borderless rows containing at least one unescaped `|` when part of a table block.
 */
function isCandidateTableLine(line: string, nextLine?: string, alreadyInTable = false): boolean {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.includes('|')) return false;

  // Avoid matching blockquotes or bullet lines that happen to have a pipe unless they start with |
  if (/^(?:>|[-*]\s|\d+\.\s|#)/.test(trimmed)) return false;

  if (alreadyInTable) {
    return true;
  }

  // Standard row starting and ending with pipe (with at least 2 pipes)
  if (trimmed.startsWith('|') && trimmed.indexOf('|', 1) !== -1) {
    return true;
  }

  // Borderless table header row where the very next line is a valid GFM delimiter row
  if (nextLine) {
    const nextTrimmed = nextLine.trim();
    if (nextTrimmed.includes('|') && nextTrimmed.includes('-')) {
      const nextCells = splitTableRow(nextTrimmed);
      if (nextCells.length >= 2 && isTableDelimiterRow(nextCells)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Maps a TableColumnAlignment value to the corresponding Tailwind text alignment class.
 */
function getAlignmentClass(alignment?: TableColumnAlignment): string {
  if (alignment === 'center') return 'text-center';
  if (alignment === 'right') return 'text-right';
  return 'text-left';
}

// ============================================================================
// 3. PlanReAct & BuiltInPlanner Thought Trace Parser & Accordion (TASK-226)
// ============================================================================

/**
 * Parses ADK PlanReActPlanner tags from message text:
 * /*PLANNING*\/, /*ACTION*\/, /*REASONING*\/, /*REPLANNING*\/, /*FINAL_ANSWER*\/
 * Returns structured traces and the remaining final answer.
 */
export function parsePlanReActTraces(text: string): {
  traces: PlanReActTrace[];
  finalAnswer: string;
} {
  if (!text || typeof text !== 'string') {
    return { traces: [], finalAnswer: '' };
  }

  // Regex to match /*PLANNING*/, /*ACTION*/, /*REASONING*/, /*REPLANNING*/, /*FINAL_ANSWER*/
  const tagRegex = /\/\*\s*(PLANNING|ACTION|REASONING|REPLANNING|FINAL_ANSWER)\s*\*\//gi;

  const matches: Array<{ tag: string; index: number; length: number }> = [];
  let m: RegExpExecArray | null;

  while ((m = tagRegex.exec(text)) !== null) {
    matches.push({
      tag: m[1].toUpperCase(),
      index: m.index,
      length: m[0].length,
    });
  }

  if (matches.length === 0) {
    return { traces: [], finalAnswer: text };
  }

  const traces: PlanReActTrace[] = [];
  let finalAnswer = '';

  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const next = matches[i + 1];

    const startIndex = current.index + current.length;
    const endIndex = next ? next.index : text.length;
    const rawContent = text.slice(startIndex, endIndex).trim();

    if (current.tag === 'FINAL_ANSWER') {
      finalAnswer = rawContent;
    } else {
      traces.push({
        tag: current.tag,
        content: rawContent,
      });
    }
  }

  // If there was content before the first tag, or if FINAL_ANSWER wasn't explicitly tagged
  if (!finalAnswer && matches.length > 0) {
    const lastMatch = matches[matches.length - 1];
    if (lastMatch.tag !== 'FINAL_ANSWER') {
      // Check if text starts with non-tagged content
      const prefix = text.slice(0, matches[0].index).trim();
      if (prefix) {
        finalAnswer = prefix;
      }
    }
  }

  return { traces, finalAnswer };
}

function PlanReActAccordion({ traces }: { traces: PlanReActTrace[] }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const getTagBadgeStyle = (tag: string) => {
    switch (tag) {
      case 'PLANNING':
        return {
          icon: <Brain className="w-3 h-3 text-sky-400" />,
          classes: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
        };
      case 'ACTION':
        return {
          icon: <Play className="w-3 h-3 text-amber-400" />,
          classes: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
        };
      case 'REASONING':
        return {
          icon: <Sparkles className="w-3 h-3 text-purple-400" />,
          classes: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
        };
      case 'REPLANNING':
        return {
          icon: <RotateCcw className="w-3 h-3 text-rose-400" />,
          classes: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
        };
      default:
        return {
          icon: <GitBranch className="w-3 h-3 text-gray-400" />,
          classes: 'bg-gray-800 text-gray-300 border-[#30363d]',
        };
    }
  };

  return (
    <div
      data-testid="planner-thought-trace"
      className="my-2 rounded-lg border border-purple-500/30 bg-[#161b22] overflow-hidden"
    >
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-2 bg-[#161b22] hover:bg-[#1c2128] transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-purple-400 shrink-0" />
          <span className="text-base font-semibold text-purple-200">
            Reasoning & Planning Trace (PlanReActPlanner)
          </span>
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-500/30">
            {traces.length} step{traces.length === 1 ? '' : 's'}
          </span>
        </div>
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-purple-400 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
        )}
      </button>

      {isExpanded && (
        <div className="p-4 bg-[#0d1117] border-t border-[#30363d] space-y-2">
          {traces.map((trace, idx) => {
            const badge = getTagBadgeStyle(trace.tag);
            return (
              <div
                key={idx}
                className="p-2 rounded bg-[#161b22] border border-[#30363d]/80 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono font-medium border ${badge.classes}`}
                  >
                    {badge.icon}
                    <span>{trace.tag}</span>
                  </span>
                </div>
                <div className="text-sm font-mono text-gray-200 whitespace-pre-wrap leading-relaxed pl-1">
                  {trace.content}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 4. Legacy A2UI Extraction & Card View (Backward Compatibility)
// ============================================================================

function tryExtractLegacyA2ui(
  text: string
): { a2ui: LegacyA2uiPayload | null; nonJsonText: string } {
  if (!text || typeof text !== 'string') {
    return { a2ui: null, nonJsonText: '' };
  }

  const trimmed = text.trim();

  // 1. Direct JSON string
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (isLegacyA2uiLike(parsed)) {
        return { a2ui: parsed, nonJsonText: '' };
      }
    } catch {
      // Continue
    }
  }

  // 2. JSON in code fence
  const fenceMatch = trimmed.match(/```(?:json|a2ui)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch) {
    try {
      const parsed = JSON.parse(fenceMatch[1]);
      if (isLegacyA2uiLike(parsed)) {
        const nonJson = trimmed.replace(fenceMatch[0], '').trim();
        return { a2ui: parsed, nonJsonText: nonJson };
      }
    } catch {
      // Continue
    }
  }

  return { a2ui: null, nonJsonText: text };
}

function isLegacyA2uiLike(obj: any): boolean {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  const keys = Object.keys(obj);
  if (
    obj.a2ui ||
    obj['@type'] ||
    obj.type === 'Card' ||
    obj.component === 'Card' ||
    obj.type === 'card'
  ) {
    return true;
  }
  return (
    (keys.includes('title') || keys.includes('description') || keys.includes('prompt')) &&
    (keys.includes('buttons') ||
      keys.includes('choices') ||
      keys.includes('options') ||
      keys.includes('imageUrl') ||
      keys.includes('image'))
  );
}

function LegacyA2uiCardView({
  payload,
  onActionClick,
}: {
  payload: LegacyA2uiPayload;
  onActionClick?: (actionText: string) => void;
}) {
  const [showRaw, setShowRaw] = useState(false);

  const title = payload.title || payload.component || payload.type || 'A2UI Component';
  const subtitle = payload.subtitle || '';
  const description = payload.description || payload.text || '';
  const imageUrl = payload.imageUrl || payload.image;

  const actionItems: Array<{ label: string; value: string }> = [];
  if (Array.isArray(payload.buttons)) {
    for (const b of payload.buttons) {
      const label = b.label || b.text || b.value || b.action || 'Option';
      const value = b.value || b.action || label;
      actionItems.push({ label, value });
    }
  } else if (Array.isArray(payload.choices)) {
    for (const c of payload.choices) {
      actionItems.push({ label: String(c), value: String(c) });
    }
  } else if (Array.isArray(payload.options)) {
    for (const o of payload.options) {
      actionItems.push({ label: String(o), value: String(o) });
    }
  }

  return (
    <div className="my-2 rounded-lg border border-indigo-500/40 bg-gradient-to-b from-[#161b22] to-[#0d1117] shadow-md overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-indigo-950/40 border-b border-indigo-500/30">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-indigo-400" />
          <span className="text-xs font-semibold text-indigo-300 uppercase tracking-wider">
            A2UI Card
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowRaw(!showRaw)}
          className="flex items-center gap-1 text-xs text-indigo-300 hover:text-white transition-colors cursor-pointer"
        >
          {showRaw ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          <span>{showRaw ? 'Hide JSON' : 'View Schema'}</span>
        </button>
      </div>

      {imageUrl && (
        <div className="border-b border-[#30363d] bg-black/40">
          <img src={imageUrl} alt={title} className="w-full max-h-48 object-cover" loading="lazy" />
        </div>
      )}

      <div className="p-4 space-y-2">
        <div>
          <h4 className="text-base font-semibold text-white">{title}</h4>
          {subtitle && <p className="text-sm text-indigo-300">{subtitle}</p>}
        </div>

        {description && (
          <p className="text-base text-gray-300 whitespace-pre-wrap">{description}</p>
        )}

        {actionItems.length > 0 && (
          <div className="pt-2 flex flex-wrap gap-2">
            {actionItems.map((action, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => onActionClick?.(action.value)}
                className="px-3 py-1.5 rounded-md text-sm font-medium bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/40 hover:border-indigo-400 transition-all cursor-pointer shadow-sm active:scale-95"
              >
                {action.label}
              </button>
            ))}
          </div>
        )}

        {showRaw && (
          <div className="pt-2">
            <pre className="p-2 rounded bg-black/60 border border-[#30363d] text-xs font-mono text-gray-300 overflow-x-auto">
              <code>{JSON.stringify(payload, null, 2)}</code>
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// 5. Markdown Parsing & Utilities
// ============================================================================

/**
 * Renders an inline text segment with bold, italics, inline code, links, and <br> line breaks.
 * Avoids matching intra-word underscores so snake_case identifiers (e.g., `retail_dw`, `customer_orders`)
 * in unquoted text or table cells are never mangled as italics.
 */
function renderInlineText(text: string): React.ReactNode {
  if (!text) return null;

  // Regex to split by <br> tags, inline code, bold (**), italics (*), and links
  const tokenRegex = /(<br\s*\/?>|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/gi;
  const parts = text.split(tokenRegex);

  return parts.map((part, idx) => {
    if (!part) return null;

    // HTML Line Break: <br>, <br/>, <br />
    if (/^<br\s*\/?>$/i.test(part)) {
      return <br key={idx} />;
    }

    // Inline code: `code`
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code
          key={idx}
          className="px-1.5 py-0.5 mx-0.5 rounded text-sm font-mono bg-[#0d1117] text-emerald-300 border border-[#30363d]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return (
        <strong key={idx} className="font-semibold text-white">
          {renderInlineText(part.slice(2, -2))}
        </strong>
      );
    }

    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      return (
        <em key={idx} className="italic text-gray-300">
          {renderInlineText(part.slice(1, -1))}
        </em>
      );
    }

    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      return (
        <a
          key={idx}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 text-emerald-400 hover:text-emerald-300 underline underline-offset-2 transition-colors"
        >
          <span>{linkMatch[1]}</span>
          <ExternalLink className="w-2.5 h-2.5 inline" />
        </a>
      );
    }

    return <span key={idx}>{part}</span>;
  });
}

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-2 rounded-md border border-[#30363d] bg-[#0d1117] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-[#161b22] border-b border-[#30363d] text-xs font-mono text-gray-400">
        <span className="flex items-center gap-2">
          <Code className="w-4 h-4 text-emerald-400" />
          <span>{lang || 'code'}</span>
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 text-gray-400 hover:text-white transition-colors cursor-pointer"
          title="Copy code"
        >
          {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className="p-4 text-sm font-mono text-gray-200 overflow-x-auto whitespace-pre">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function MediaImage({ alt, url }: { alt: string; url: string }) {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <div className="my-2 p-2 rounded-md bg-[#0d1117] border border-[#30363d] text-xs text-gray-400 flex items-center gap-2">
        <ImageIcon className="w-4 h-4 text-gray-500 shrink-0" />
        <span className="truncate">Image failed to load: {alt || url}</span>
      </div>
    );
  }

  return (
    <div className="my-2 rounded-md border border-[#30363d] bg-[#0d1117] overflow-hidden max-w-sm">
      <img
        src={url}
        alt={alt || 'Agent media'}
        onError={() => setHasError(true)}
        className="w-full h-auto max-h-64 object-contain bg-black/40"
        loading="lazy"
      />
      {alt && <div className="px-2 py-1 text-xs text-gray-400 bg-[#161b22] italic">{alt}</div>}
    </div>
  );
}

// ============================================================================
// 6. Main ChatMessageRenderer Component
// ============================================================================

export const ChatMessageRenderer: React.FC<ChatMessageRendererProps> = ({
  content,
  isUser = false,
  isStreaming = false,
  onActionClick,
  onUserAction,
  a2uiSurfaces,
}) => {
  // Step A: Extract A2UI v0.9.1 surface payloads
  const { textWithoutA2UI, surfaces: extractedSurfaces } = useMemo(
    () => extractA2UIPayloads(content),
    [content]
  );

  const activeSurfaces = useMemo(() => {
    const combined = [...extractedSurfaces];
    if (Array.isArray(a2uiSurfaces)) {
      combined.push(...a2uiSurfaces);
    }
    return combined;
  }, [extractedSurfaces, a2uiSurfaces]);

  // Step B: Extract PlanReAct Thought Traces (TASK-226)
  const { traces, finalAnswer } = useMemo(
    () => parsePlanReActTraces(textWithoutA2UI),
    [textWithoutA2UI]
  );

  // Step C: Check for legacy A2UI card payload (when no v0.9.1 surfaces found)
  const { a2ui: legacyA2ui, nonJsonText } = useMemo(() => {
    if (activeSurfaces.length > 0) return { a2ui: null, nonJsonText: '' };
    return tryExtractLegacyA2ui(finalAnswer || content);
  }, [activeSurfaces, finalAnswer, content]);

  // If pure legacy A2UI, render legacy card
  if (legacyA2ui && !nonJsonText && traces.length === 0 && activeSurfaces.length === 0) {
    return <LegacyA2uiCardView payload={legacyA2ui} onActionClick={onActionClick} />;
  }

  // Step D: Render Markdown lines (including GFM Tables) for final answer
  const rawTextToRender = nonJsonText || finalAnswer || (traces.length === 0 ? textWithoutA2UI : '');
  const textToRender = (rawTextToRender || '').replace(/\r\n/g, '\n');
  const lines = textToRender.split('\n');
  const renderedElements: React.ReactNode[] = [];

  let inCodeBlock = false;
  let codeBuffer: string[] = [];
  let codeLang = '';
  let tableBuffer: string[] = [];

  /**
   * Flushes accumulated Markdown table lines into a styled HTML <table> or falls back
   * to a paragraph if only a single non-table pipe line was buffered.
   */
  const flushTable = (keyPrefix: string) => {
    if (tableBuffer.length === 0) return;

    const rawLines = [...tableBuffer];
    tableBuffer = [];

    const parsedRows = rawLines.map((rowLine) => splitTableRow(rowLine));

    // A single line with pipes is not a complete table; render it as normal inline text
    if (parsedRows.length < 2) {
      renderedElements.push(
        <p key={`${keyPrefix}-p-fallback`} className="text-base text-gray-200 leading-6 my-1 break-words">
          {renderInlineText(rawLines[0])}
        </p>
      );
      return;
    }

    const headerCells = parsedRows[0];
    const hasDelimiter = isTableDelimiterRow(parsedRows[1]);
    const alignments = hasDelimiter
      ? parseColumnAlignments(parsedRows[1])
      : headerCells.map(() => 'left' as TableColumnAlignment);
    const bodyRows = hasDelimiter ? parsedRows.slice(2) : parsedRows.slice(1);
    const columnCount = Math.max(
      headerCells.length,
      ...bodyRows.map((r) => r.length)
    );

    renderedElements.push(
      <div
        key={`${keyPrefix}-table`}
        className="my-2 overflow-x-auto rounded-lg border border-[#30363d] bg-[#0d1117] shadow-sm"
      >
        <table className="w-full border-collapse text-sm leading-5">
          <thead>
            <tr className="bg-[#21262d] border-b border-[#30363d]">
              {headerCells.map((headerCell, colIdx) => (
                <th
                  key={colIdx}
                  className={`px-4 py-2 font-semibold text-white tracking-wide border-r last:border-r-0 border-[#30363d]/60 ${getAlignmentClass(
                    alignments[colIdx]
                  )}`}
                >
                  {renderInlineText(headerCell)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#30363d]/70">
            {bodyRows.map((row, rowIdx) => {
              // Pad ragged streaming rows up to the header column count so borders align cleanly
              const normalizedCells =
                row.length < headerCells.length
                  ? [...row, ...Array(headerCells.length - row.length).fill('')]
                  : row.slice(0, Math.max(columnCount, headerCells.length));

              return (
                <tr
                  key={rowIdx}
                  className="bg-[#0d1117]/80 even:bg-[#161b22]/50 hover:bg-emerald-950/20 transition-colors"
                >
                  {normalizedCells.map((cell, cellIdx) => (
                    <td
                      key={cellIdx}
                      className={`px-4 py-2 text-gray-200 align-top border-r last:border-r-0 border-[#30363d]/40 ${getAlignmentClass(
                        alignments[cellIdx]
                      )}`}
                    >
                      {renderInlineText(cell)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const trimmed = line.trim();
    const nextLine = index + 1 < lines.length ? lines[index + 1] : undefined;

    // 1. Check for fenced code block start/end
    if (trimmed.startsWith('```')) {
      flushTable(`line-${index}`);
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeLang = trimmed.slice(3).trim();
        codeBuffer = [];
      } else {
        inCodeBlock = false;
        renderedElements.push(
          <CodeBlock
            key={`code-${index}`}
            code={codeBuffer.join('\n')}
            lang={codeLang}
          />
        );
        codeBuffer = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }

    // 2. Check for GFM table rows
    if (isCandidateTableLine(line, nextLine, tableBuffer.length > 0)) {
      tableBuffer.push(line);
      continue;
    } else if (tableBuffer.length > 0) {
      flushTable(`line-${index}`);
    }

    // 3. Markdown image: ![alt](url)
    const imgMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgMatch) {
      renderedElements.push(
        <MediaImage key={`img-${index}`} alt={imgMatch[1]} url={imgMatch[2]} />
      );
      continue;
    }

    // 4. Horizontal Rule: --- or ***
    if (/^(\s*[-*_]\s*){3,}$/.test(line)) {
      renderedElements.push(
        <hr key={`hr-${index}`} className="my-2 border-t border-[#30363d]" />
      );
      continue;
    }

    // 5. Headings (H1 - H4)
    if (trimmed.startsWith('#### ')) {
      renderedElements.push(
        <h4 key={`h4-${index}`} className="text-base leading-6 font-semibold text-emerald-300 mt-2 mb-1">
          {renderInlineText(trimmed.slice(5))}
        </h4>
      );
      continue;
    }
    if (trimmed.startsWith('### ')) {
      renderedElements.push(
        <h3 key={`h3-${index}`} className="text-lg leading-7 font-bold text-white mt-2 mb-1">
          {renderInlineText(trimmed.slice(4))}
        </h3>
      );
      continue;
    }
    if (trimmed.startsWith('## ')) {
      renderedElements.push(
        <h2
          key={`h2-${index}`}
          className="text-xl leading-7 font-bold text-white mt-3 mb-1 border-b border-[#30363d]/50 pb-1"
        >
          {renderInlineText(trimmed.slice(3))}
        </h2>
      );
      continue;
    }
    if (trimmed.startsWith('# ')) {
      renderedElements.push(
        <h1
          key={`h1-${index}`}
          className="text-2xl leading-8 font-bold text-white mt-4 mb-2 border-b border-[#30363d] pb-1"
        >
          {renderInlineText(trimmed.slice(2))}
        </h1>
      );
      continue;
    }

    // 6. Blockquote: >
    if (trimmed.startsWith('> ') || trimmed === '>') {
      renderedElements.push(
        <blockquote
          key={`quote-${index}`}
          className="border-l-2 border-emerald-500/60 pl-3 my-1 text-gray-300 italic text-base leading-6"
        >
          {renderInlineText(trimmed.replace(/^>\s?/, ''))}
        </blockquote>
      );
      continue;
    }

    // 7. Unordered list: - or *
    const unorderedMatch = line.match(/^\s*[-*]\s+(.+)$/);
    if (unorderedMatch) {
      renderedElements.push(
        <div key={`ul-${index}`} className="flex items-start gap-2 pl-2 my-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-2.5 shrink-0" />
          <span className="text-base leading-6 text-gray-200">{renderInlineText(unorderedMatch[1])}</span>
        </div>
      );
      continue;
    }

    // 8. Numbered list: 1. or 2.
    const orderedMatch = line.match(/^\s*(\d+)\.\s+(.+)$/);
    if (orderedMatch) {
      renderedElements.push(
        <div key={`ol-${index}`} className="flex items-start gap-2 pl-2 my-1">
          <span className="font-semibold text-emerald-400 font-mono text-sm leading-6 shrink-0">
            {orderedMatch[1]}.
          </span>
          <span className="text-base leading-6 text-gray-200">{renderInlineText(orderedMatch[2])}</span>
        </div>
      );
      continue;
    }

    // 9. Empty line / line break
    if (!trimmed) {
      renderedElements.push(<div key={`blank-${index}`} className="h-2" />);
      continue;
    }

    // 10. Standard paragraph line
    renderedElements.push(
      <p key={`p-${index}`} className="text-base text-gray-200 leading-6 my-1 break-words">
        {renderInlineText(line)}
      </p>
    );
  }

  // Flush any trailing table rows at the end of the message
  if (tableBuffer.length > 0) {
    flushTable('table-end');
  }

  if (inCodeBlock && codeBuffer.length > 0) {
    renderedElements.push(
      <CodeBlock key="code-partial" code={codeBuffer.join('\n')} lang={codeLang} />
    );
  }

  return (
    <div className="space-y-1">
      {/* 1. PlanReAct Thought Traces Accordion (TASK-226) */}
      {traces.length > 0 && <PlanReActAccordion traces={traces} />}

      {/* 2. Final Answer / Standard Markdown */}
      {renderedElements}

      {/* 3. A2UI v0.9.1 Interactive Surfaces (TASK-221) */}
      {activeSurfaces.map((surf, idx) => (
        <A2UISurfaceRenderer
          key={surf.surfaceId || idx}
          payload={surf}
          onUserAction={
            onUserAction ||
            (onActionClick
              ? (action) => onActionClick(JSON.stringify({ userAction: action }))
              : undefined)
          }
        />
      ))}

      {/* 4. Legacy A2UI Card Fallback */}
      {legacyA2ui && <LegacyA2uiCardView payload={legacyA2ui} onActionClick={onActionClick} />}
    </div>
  );
};

export default ChatMessageRenderer;
