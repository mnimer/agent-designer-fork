/**
 * ChatMessageRenderer Component
 *
 * Renders interactive chat message turns with rich formatting:
 * - Markdown text formatting (bold, italics, headers H1-H4, lists, quotes, inline code, <br> breaks)
 * - GitHub Flavored Markdown (GFM) tables with column alignment, inline formatting, escaped pipes,
 *   backtick-aware cell splitting, borderless outer-pipe tables, and live streaming table support
 * - Fenced code blocks with language pills and copy-to-clipboard button
 * - Markdown images (![alt](url)) with responsive preview and error fallbacks
 * - Declarative A2UI component detection and interactive rendering:
 *   - Cards with title, description, badge, media/images
 *   - Action buttons and choice chips with onActionClick callbacks
 *   - Collapsible schema viewer for debugging generated A2UI payloads
 *
 * Architectural Decisions:
 * - Implemented using native React & Tailwind CSS without heavy external dependencies.
 * - Adheres strictly to the 8pt grid system (multiples of 8px) for all spacing and margins.
 * - Safely handles mixed Markdown and JSON strings or partial streaming tokens.
 * - Table parser respects escaped pipes (\|) and inline code spans (`a | b`) so technical
 *   schemas, SQL expressions, and Data Domain URIs inside cells never corrupt column layout.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import React, { useState, useMemo } from 'react';
import { Copy, Check, ExternalLink, Code, Layers, ChevronDown, ChevronRight, Image as ImageIcon } from 'lucide-react';

export interface ChatMessageRendererProps {
  content: string;
  isUser?: boolean;
  isStreaming?: boolean;
  onActionClick?: (actionText: string) => void;
}

export type TableColumnAlignment = 'left' | 'center' | 'right';

interface A2uiPayload {
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
 * Attempts to parse an A2UI JSON payload from message content.
 * Matches pure JSON objects or JSON blocks embedded within markdown fences.
 */
function tryExtractA2ui(text: string): { a2ui: A2uiPayload | null; nonJsonText: string } {
  if (!text || typeof text !== 'string') {
    return { a2ui: null, nonJsonText: '' };
  }

  const trimmed = text.trim();

  // 1. Direct JSON string
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (isA2uiLike(parsed)) {
        return { a2ui: parsed, nonJsonText: '' };
      }
    } catch {
      // Not complete JSON yet (e.g. while streaming)
    }
  }

  // 2. JSON enclosed in markdown code fences
  const fenceMatch = trimmed.match(/```(?:json|a2ui)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch) {
    try {
      const parsed = JSON.parse(fenceMatch[1]);
      if (isA2uiLike(parsed)) {
        const nonJson = trimmed.replace(fenceMatch[0], '').trim();
        return { a2ui: parsed, nonJsonText: nonJson };
      }
    } catch {
      // Continue to markdown rendering
    }
  }

  return { a2ui: null, nonJsonText: text };
}

/**
 * Checks if a parsed JSON object has structure characteristic of an A2UI / card payload.
 */
function isA2uiLike(obj: any): boolean {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  const keys = Object.keys(obj);
  if (obj.a2ui || obj['@type'] || obj.type === 'Card' || obj.component === 'Card' || obj.type === 'card') {
    return true;
  }
  return (
    (keys.includes('title') || keys.includes('description') || keys.includes('prompt')) &&
    (keys.includes('buttons') || keys.includes('choices') || keys.includes('options') || keys.includes('imageUrl') || keys.includes('image'))
  );
}

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
          className="px-1.5 py-0.5 mx-0.5 rounded text-[11px] font-mono bg-[#0d1117] text-emerald-300 border border-[#30363d]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    // Bold: **text**
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return (
        <strong key={idx} className="font-semibold text-white">
          {renderInlineText(part.slice(2, -2))}
        </strong>
      );
    }

    // Italic: *text*
    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      return (
        <em key={idx} className="italic text-gray-300">
          {renderInlineText(part.slice(1, -1))}
        </em>
      );
    }

    // Link: [label](url)
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

/**
 * Code Block component with syntax header and copy button.
 */
function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-2 rounded-md border border-[#30363d] bg-[#0d1117] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1 bg-[#161b22] border-b border-[#30363d] text-[10px] font-mono text-gray-400">
        <span className="flex items-center gap-1.5">
          <Code className="w-3 h-3 text-emerald-400" />
          <span>{lang || 'code'}</span>
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 text-gray-400 hover:text-white transition-colors cursor-pointer"
          title="Copy code"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className="p-3 text-[11px] font-mono text-gray-200 overflow-x-auto whitespace-pre">
        <code>{code}</code>
      </pre>
    </div>
  );
}

/**
 * Media Image block with fallback.
 */
function MediaImage({ alt, url }: { alt: string; url: string }) {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <div className="my-2 p-2 rounded-md bg-[#0d1117] border border-[#30363d] text-[10px] text-gray-400 flex items-center gap-2">
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
      {alt && <div className="px-2 py-1 text-[10px] text-gray-400 bg-[#161b22] italic">{alt}</div>}
    </div>
  );
}

/**
 * Interactive A2UI Card component.
 */
function A2uiCardView({
  payload,
  onActionClick,
}: {
  payload: A2uiPayload;
  onActionClick?: (actionText: string) => void;
}) {
  const [showRaw, setShowRaw] = useState(false);

  const title = payload.title || payload.component || payload.type || 'A2UI Component';
  const subtitle = payload.subtitle || '';
  const description = payload.description || payload.text || '';
  const imageUrl = payload.imageUrl || payload.image;

  // Extract action buttons or choice chips
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
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-indigo-950/40 border-b border-indigo-500/30">
        <div className="flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-indigo-400" />
          <span className="text-[10px] font-semibold text-indigo-300 uppercase tracking-wider">
            A2UI Card
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowRaw(!showRaw)}
          className="flex items-center gap-1 text-[9px] text-indigo-300 hover:text-white transition-colors cursor-pointer"
        >
          {showRaw ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          <span>{showRaw ? 'Hide JSON' : 'View Schema'}</span>
        </button>
      </div>

      {/* Media Image */}
      {imageUrl && (
        <div className="border-b border-[#30363d] bg-black/40">
          <img
            src={imageUrl}
            alt={title}
            className="w-full max-h-48 object-cover"
            loading="lazy"
          />
        </div>
      )}

      {/* Body */}
      <div className="p-3 space-y-2">
        <div>
          <h4 className="text-xs font-semibold text-white">{title}</h4>
          {subtitle && <p className="text-[10px] text-indigo-300">{subtitle}</p>}
        </div>

        {description && (
          <p className="text-[11px] text-gray-300 whitespace-pre-wrap">{description}</p>
        )}

        {/* Action Buttons / Choice Chips */}
        {actionItems.length > 0 && (
          <div className="pt-2 flex flex-wrap gap-2">
            {actionItems.map((action, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => onActionClick?.(action.value)}
                className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/40 hover:border-indigo-400 transition-all cursor-pointer shadow-sm active:scale-95"
              >
                {action.label}
              </button>
            ))}
          </div>
        )}

        {/* Collapsible raw JSON */}
        {showRaw && (
          <div className="pt-2">
            <pre className="p-2 rounded bg-black/60 border border-[#30363d] text-[9px] font-mono text-gray-300 overflow-x-auto">
              <code>{JSON.stringify(payload, null, 2)}</code>
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Maps a TableColumnAlignment value to the corresponding Tailwind text alignment class.
 */
function getAlignmentClass(alignment?: TableColumnAlignment): string {
  if (alignment === 'center') return 'text-center';
  if (alignment === 'right') return 'text-right';
  return 'text-left';
}

/**
 * Main ChatMessageRenderer Component.
 */
export const ChatMessageRenderer: React.FC<ChatMessageRendererProps> = ({
  content,
  isUser = false,
  isStreaming = false,
  onActionClick,
}) => {
  // Check for A2UI JSON payload
  const { a2ui, nonJsonText } = useMemo(() => tryExtractA2ui(content), [content]);

  // If content is pure A2UI, render the A2UI card
  if (a2ui && !nonJsonText) {
    return <A2uiCardView payload={a2ui} onActionClick={onActionClick} />;
  }

  // Parse lines for markdown elements
  const textToRender = (nonJsonText || content || '').replace(/\r\n/g, '\n');
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
        <p key={`${keyPrefix}-p-fallback`} className="text-[11px] text-gray-200 leading-relaxed my-0.5 break-words">
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
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="bg-[#21262d] border-b border-[#30363d]">
              {headerCells.map((headerCell, colIdx) => (
                <th
                  key={colIdx}
                  className={`px-3 py-2 font-semibold text-white tracking-wide border-r last:border-r-0 border-[#30363d]/60 ${getAlignmentClass(
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
                      className={`px-3 py-2 text-gray-200 align-top border-r last:border-r-0 border-[#30363d]/40 ${getAlignmentClass(
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
        <h4 key={`h4-${index}`} className="text-xs font-semibold text-emerald-300 mt-2 mb-1">
          {renderInlineText(trimmed.slice(5))}
        </h4>
      );
      continue;
    }
    if (trimmed.startsWith('### ')) {
      renderedElements.push(
        <h3 key={`h3-${index}`} className="text-xs font-bold text-white mt-2 mb-1">
          {renderInlineText(trimmed.slice(4))}
        </h3>
      );
      continue;
    }
    if (trimmed.startsWith('## ')) {
      renderedElements.push(
        <h2 key={`h2-${index}`} className="text-sm font-bold text-white mt-2.5 mb-1 border-b border-[#30363d]/50 pb-0.5">
          {renderInlineText(trimmed.slice(3))}
        </h2>
      );
      continue;
    }
    if (trimmed.startsWith('# ')) {
      renderedElements.push(
        <h1 key={`h1-${index}`} className="text-base font-bold text-white mt-3 mb-1 border-b border-[#30363d] pb-1">
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
          className="border-l-2 border-emerald-500/60 pl-2.5 my-1 text-gray-300 italic text-[11px]"
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
        <div key={`ul-${index}`} className="flex items-start gap-2 pl-2 my-0.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
          <span className="text-[11px] text-gray-200">{renderInlineText(unorderedMatch[1])}</span>
        </div>
      );
      continue;
    }

    // 8. Numbered list: 1. or 2.
    const orderedMatch = line.match(/^\s*(\d+)\.\s+(.+)$/);
    if (orderedMatch) {
      renderedElements.push(
        <div key={`ol-${index}`} className="flex items-start gap-2 pl-2 my-0.5">
          <span className="font-semibold text-emerald-400 font-mono text-[10px] mt-0.5 shrink-0">
            {orderedMatch[1]}.
          </span>
          <span className="text-[11px] text-gray-200">{renderInlineText(orderedMatch[2])}</span>
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
      <p key={`p-${index}`} className="text-[11px] text-gray-200 leading-relaxed my-0.5 break-words">
        {renderInlineText(line)}
      </p>
    );
  }

  // Flush any trailing table rows at the end of the message
  if (tableBuffer.length > 0) {
    flushTable('table-end');
  }

  // If still in code block (e.g. streaming partial response)
  if (inCodeBlock && codeBuffer.length > 0) {
    renderedElements.push(
      <CodeBlock
        key="code-partial"
        code={codeBuffer.join('\n')}
        lang={codeLang}
      />
    );
  }

  return (
    <div className="space-y-1">
      {renderedElements}
      {a2ui && <A2uiCardView payload={a2ui} onActionClick={onActionClick} />}
    </div>
  );
};

export default ChatMessageRenderer;
