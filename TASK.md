# [TASK-241] Interactive Chat Markdown Table Rendering Support

## Problem Statement
When testing agents such as the **Knowledge Catalog Data Domain Builder** (`kc-data-domain-builder`) in the **Interactive Chat** tab (`ChatRunnerTab.tsx` -> `ChatMessageRenderer.tsx`), Markdown tables (e.g., DDD bounded context proposals, BigQuery dataset/table inventories, schema column definitions) are not rendered as structured HTML tables. Instead, `ChatMessageRenderer.tsx` falls back to rendering each pipe-delimited table row as a raw `<p>` paragraph line.

## Plan
1. **Write Isolated Failing Unit Tests (`tests/unit/webview/ChatMessageRenderer.test.ts`)**:
   - Test rendering standard GitHub Flavored Markdown (GFM) tables with header rows, delimiter rows (`| --- | :--- | :---: | ---: |`), and multiple body rows into `<table>`, `<thead>`, `<tbody>`, `<tr>`, `<th>`, and `<td>` elements.
   - Test inline formatting inside table cells (`**bold**`, `*italic*`, `` `inline_code` ``, `[links](url)`, `<br>` / `<br/>` line breaks, and escaped pipes `\|` / pipes inside inline code).
   - Test column alignment (`left`, `center`, `right`) parsed from GFM delimiter rows.
   - Test tables without outer leading/trailing pipes (e.g., `Col A | Col B` followed by `--- | ---`).
   - Test streaming / partial table states (header + delimiter row with 0 body rows yet, or ragged rows with fewer cells than headers, or a single unconfirmed pipe line fallback).
   - Test mixed content (headings, paragraphs, bullet lists, code blocks, and multiple tables in the same chat turn).
2. **Implement Markdown Table Parsing & Rendering in `src/webview/components/chat/ChatMessageRenderer.tsx`**:
   - Add helper functions (`splitTableRow`, `isTableDelimiterRow`, `parseColumnAlignments`, `renderInlineText` with `<br>` and nested formatting support) and table block buffering/flushing in `ChatMessageRenderer`.
   - Style tables following the 8pt grid system and dark theme (`#0d1117`, `#161b22`, `#21262d`, `#30363d`, emerald accents matching Interactive Chat).
   - Ensure `ChatRunnerTab.tsx` message container supports horizontal table scrolling cleanly (`min-w-0`).
3. **Verify & Document**:
   - Run unit tests (`ChatMessageRenderer.test.ts`, `MarkdownViewer.test.ts`) and full compilation (`npm run compile`).
   - Update `TASKS.md` and `REQUIREMENTS.md` if applicable.

## Checklist
- [x] Step 1: Write isolated failing unit tests in `tests/unit/webview/ChatMessageRenderer.test.ts`.
- [x] Step 2: Implement GFM table parsing, alignment, inline `<br>`, and escaped pipe handling in `src/webview/components/chat/ChatMessageRenderer.tsx`.
- [x] Step 3: Verify all unit tests pass and TypeScript compiles cleanly.
- [x] Step 4: Update `TASKS.md`.
