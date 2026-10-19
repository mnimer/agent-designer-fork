/**
 * Unit Tests for ChatMessageRenderer & A2UI Message Extraction
 *
 * Validates:
 * 1. Markdown syntax token parsing (bold, italics, inline code, external links, <br> breaks)
 * 2. Code block extraction with language specification
 * 3. Markdown media image extraction (![alt](url))
 * 4. GitHub Flavored Markdown (GFM) table parsing:
 *    - Standard pipe tables (<table>, <thead>, <tbody>, <tr>, <th>, <td>)
 *    - Column alignment (:---, :---:, ---:)
 *    - Inline formatting, <br/> line breaks, escaped pipes (\|), and backtick pipes inside cells
 *    - Borderless outer-pipe tables (Col A | Col B)
 *    - Streaming partial tables (header + delimiter only, ragged streaming rows, single-line fallback)
 *    - Mixed content with headings, lists, and multiple tables (e.g. Data Domain Builder proposals)
 * 5. A2UI JSON declarative payload detection (Card, buttons, options, imageUrl)
 * 6. Fenced A2UI JSON extraction within markdown fences
 * 7. Edge conditions (empty text, incomplete JSON, malformed syntax)
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ChatMessageRenderer,
  splitTableRow,
  isTableDelimiterRow,
  parseColumnAlignments,
} from '../../../src/webview/components/chat/ChatMessageRenderer';

describe('ChatMessageRenderer & A2UI Extraction', () => {
  it('should render standard plain text without errors', () => {
    const html = renderToStaticMarkup(
      React.createElement(ChatMessageRenderer, {
        content: 'Hello, this is a plain message.',
        isUser: false,
      })
    );
    assert.ok(html.includes('Hello, this is a plain message.'));
  });

  it('should handle markdown headers, bullet lists, and numbered lists', () => {
    const md = `# Game Rules\n\n## Instructions\n### Sub-section\n#### Detail\n- Think of an animal\n- Answer truthfully\n\n1. First step\n2. Second step`;
    const html = renderToStaticMarkup(
      React.createElement(ChatMessageRenderer, {
        content: md,
        isUser: false,
      })
    );
    assert.ok(html.includes('<h1'));
    assert.ok(html.includes('Game Rules'));
    assert.ok(html.includes('<h2'));
    assert.ok(html.includes('<h3'));
    assert.ok(html.includes('<h4'));
    assert.ok(html.includes('Think of an animal'));
    assert.ok(html.includes('First step'));
  });

  it('should recognize fenced code blocks', () => {
    const codeSnippet = '```python\ndef solve():\n    return 42\n```';
    const html = renderToStaticMarkup(
      React.createElement(ChatMessageRenderer, {
        content: codeSnippet,
        isUser: false,
      })
    );
    assert.ok(html.includes('<pre'));
    assert.ok(html.includes('def solve():'));
    assert.ok(html.includes('python'));
  });

  it('should recognize markdown image syntax', () => {
    const imgContent = 'Here is the clue:\n![Clue Image](https://example.com/animal.png)';
    const html = renderToStaticMarkup(
      React.createElement(ChatMessageRenderer, {
        content: imgContent,
        isUser: false,
      })
    );
    assert.ok(html.includes('<img'));
    assert.ok(html.includes('https://example.com/animal.png'));
  });

  it('should detect direct A2UI Card JSON payload', () => {
    const a2uiJson = JSON.stringify({
      type: 'Card',
      title: '🎮 20 Questions Game',
      subtitle: 'Pick a game mode',
      description: 'Choose whether you guess my secret or I guess yours!',
      buttons: [
        { label: '1. I guess yours', value: '1. I guess yours' },
        { label: '2. You guess mine', value: '2. You guess mine' },
      ],
    });

    const html = renderToStaticMarkup(
      React.createElement(ChatMessageRenderer, {
        content: a2uiJson,
        isUser: false,
      })
    );
    assert.ok(html.includes('A2UI Card'));
    assert.ok(html.includes('20 Questions Game'));
  });

  it('should detect A2UI JSON enclosed in markdown fences', () => {
    const fencedA2ui = `Here is your game options:
\`\`\`json
{
  "type": "Card",
  "title": "Topic Clue",
  "description": "It is an animal that lives in the ocean.",
  "choices": ["Is it a mammal?", "Is it a fish?", "Is it an octopus?"]
}
\`\`\``;

    const html = renderToStaticMarkup(
      React.createElement(ChatMessageRenderer, {
        content: fencedA2ui,
        isUser: false,
      })
    );
    assert.ok(html.includes('Topic Clue'));
    assert.ok(html.includes('Is it an octopus?'));
  });

  it('should safely handle empty, null, or streaming partial inputs', () => {
    const htmlEmpty = renderToStaticMarkup(
      React.createElement(ChatMessageRenderer, {
        content: '',
        isUser: false,
        isStreaming: true,
      })
    );
    assert.ok(typeof htmlEmpty === 'string');

    const htmlPartial = renderToStaticMarkup(
      React.createElement(ChatMessageRenderer, {
        content: '{"type": "Card", "tit',
        isUser: false,
        isStreaming: true,
      })
    );
    assert.ok(htmlPartial.includes('{&quot;type&quot;: &quot;Card&quot;, &quot;tit'));
  });

  describe('Markdown Table Rendering in Interactive Chat', () => {
    it('should render standard GFM Data Domain proposal tables as structured HTML tables', () => {
      const dataDomainProposal = `### Proposed Data Domain Hierarchy

Here is the proposed Domain-Driven Design (DDD) structure for \`analytics-core-prod\`:

| Parent Domain | Leaf Subdomain | Bounded Context | Bound BigQuery Tables |
| :--- | :--- | :---: | ---: |
| **Retail Operations** | \`checkout\` | Source-Oriented | \`customer_orders\`, \`payments\` |
| **Retail Operations** | \`returns\` | Source-Oriented | \`return_shipments\` |
| **Enterprise Finance** | \`revenue-reporting\` | Consumer-Oriented | \`fct_quarterly_revenue\` |

Please confirm if you approve this proposal.`;

      const html = renderToStaticMarkup(
        React.createElement(ChatMessageRenderer, {
          content: dataDomainProposal,
          isUser: false,
        })
      );

      assert.ok(html.includes('<table'), 'Should render a <table> element');
      assert.ok(html.includes('<thead'), 'Should render a <thead> element');
      assert.ok(html.includes('<tbody'), 'Should render a <tbody> element');
      assert.ok(html.includes('<th'), 'Should render <th> header cells');
      assert.ok(html.includes('<td'), 'Should render <td> body cells');
      assert.ok(html.includes('Parent Domain'));
      assert.ok(html.includes('Leaf Subdomain'));
      assert.ok(html.includes('Bounded Context'));
      assert.ok(html.includes('Bound BigQuery Tables'));
      assert.ok(html.includes('<strong class="font-semibold text-white">'));
      assert.ok(html.includes('Retail Operations'));
      assert.ok(html.includes('customer_orders'));
      assert.ok(html.includes('text-center'), 'Center alignment should be applied to 3rd column');
      assert.ok(html.includes('text-right'), 'Right alignment should be applied to 4th column');
    });

    it('should preserve unquoted snake_case identifiers like retail_dw and customer_orders in table cells', () => {
      const snakeCaseTable = `| Dataset | Table | Description |
| --- | --- | --- |
| retail_dw | customer_orders | Primary order_history_fact table |`;

      const html = renderToStaticMarkup(
        React.createElement(ChatMessageRenderer, {
          content: snakeCaseTable,
          isUser: false,
        })
      );

      assert.ok(html.includes('retail_dw'));
      assert.ok(html.includes('customer_orders'));
      assert.ok(html.includes('order_history_fact'));
      assert.ok(!html.includes('<em'), 'Unquoted snake_case table identifiers should not be turned into italics');
    });

    it('should support <br>, <br/>, escaped pipes (\\|), and pipes inside inline code within table cells', () => {
      const complexTable = `| Subdomain | Expression | Tables |
| --- | --- | --- |
| \`sales\` | \`a | b\` and X \\| Y | \`orders\`<br>\`order_items\`<br />\`invoices\` |`;

      const html = renderToStaticMarkup(
        React.createElement(ChatMessageRenderer, {
          content: complexTable,
          isUser: false,
        })
      );

      assert.ok(html.includes('<table'));
      assert.ok(html.includes('a | b'), 'Pipe inside inline code should remain intact');
      assert.ok(html.includes('X | Y'), 'Escaped pipe \\| should render as literal | in the same cell');
      assert.ok(html.includes('<br/>') || html.includes('<br>'), '<br> tags inside cells should render as line breaks');
    });

    it('should render GFM tables written without leading or trailing outer pipes', () => {
      const borderlessTable = `Dataset | Table Name | Row Count
--- | :---: | ---:
retail_dw | customer_orders | 1,250,000
retail_dw | dim_customers | 84,500`;

      const html = renderToStaticMarkup(
        React.createElement(ChatMessageRenderer, {
          content: borderlessTable,
          isUser: false,
        })
      );

      assert.ok(html.includes('<table'));
      assert.ok(html.includes('Dataset'));
      assert.ok(html.includes('Table Name'));
      assert.ok(html.includes('1,250,000'));
      assert.ok(html.includes('84,500'));
    });

    it('should handle streaming partial tables gracefully (header + delimiter or incomplete trailing row)', () => {
      // Case 1: Only header and delimiter have arrived so far
      const headerAndDelimOnly = `| Domain | Subdomain | Status |\n| --- | --- | --- |`;
      const html1 = renderToStaticMarkup(
        React.createElement(ChatMessageRenderer, {
          content: headerAndDelimOnly,
          isUser: false,
          isStreaming: true,
        })
      );
      assert.ok(html1.includes('<table'), 'Header + delimiter should already render as a table while streaming');
      assert.ok(html1.includes('Domain'));

      // Case 2: Streaming a body row that has not closed its trailing pipe yet and has fewer cells
      const streamingBodyRow = `| Domain | Subdomain | Status |\n| --- | --- | --- |\n| Retail | Checkout`;
      const html2 = renderToStaticMarkup(
        React.createElement(ChatMessageRenderer, {
          content: streamingBodyRow,
          isUser: false,
          isStreaming: true,
        })
      );
      assert.ok(html2.includes('<table'));
      assert.ok(html2.includes('Retail'));
      assert.ok(html2.includes('Checkout'));

      // Case 3: Single pipe line that is not a multi-row table should not be dropped
      const singlePipeLine = `| Just a single pipe line`;
      const html3 = renderToStaticMarkup(
        React.createElement(ChatMessageRenderer, {
          content: singlePipeLine,
          isUser: false,
        })
      );
      assert.ok(html3.includes('Just a single pipe line'), 'Single pipe line must never be silently dropped');
    });

    it('should accurately split table rows, detect delimiter rows, and parse alignments via helper utilities', () => {
      const cells = splitTableRow('| `col1 | pipe` | val\\|2 | **bold** |');
      assert.deepEqual(cells, ['`col1 | pipe`', 'val|2', '**bold**']);

      assert.equal(isTableDelimiterRow(['---', ':---', ':---:', '---:']), true);
      assert.equal(isTableDelimiterRow(['Domain', 'Subdomain']), false);
      assert.equal(isTableDelimiterRow([]), false);

      const alignments = parseColumnAlignments(['---', ':---', ':---:', '---:']);
      assert.deepEqual(alignments, ['left', 'left', 'center', 'right']);
    });
  });
});
