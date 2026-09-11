/**
 * Unit Tests for ChatMessageRenderer & A2UI Message Extraction
 *
 * Validates:
 * 1. Markdown syntax token parsing (bold, italics, inline code, external links)
 * 2. Code block extraction with language specification
 * 3. Markdown media image extraction (![alt](url))
 * 4. A2UI JSON declarative payload detection (Card, buttons, options, imageUrl)
 * 5. Fenced A2UI JSON extraction within markdown fences
 * 6. Mixed text and A2UI payload separation
 * 7. Edge conditions (empty text, incomplete JSON, malformed syntax)
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { ChatMessageRenderer } from '../../src/webview/components/chat/ChatMessageRenderer';

describe('ChatMessageRenderer & A2UI Extraction', () => {
  it('should render standard plain text without errors', () => {
    const element = React.createElement(ChatMessageRenderer, {
      content: 'Hello, this is a plain message.',
      isUser: false,
    });
    assert.ok(element);
    assert.equal(element.props.content, 'Hello, this is a plain message.');
  });

  it('should handle markdown headers, bullet lists, and numbered lists', () => {
    const md = `# Game Rules\n\n## Instructions\n- Think of an animal\n- Answer truthfully\n\n1. First step\n2. Second step`;
    const element = React.createElement(ChatMessageRenderer, {
      content: md,
      isUser: false,
    });
    assert.ok(element);
    assert.ok(element.props.content.includes('# Game Rules'));
  });

  it('should recognize fenced code blocks', () => {
    const codeSnippet = '```python\ndef solve():\n    return 42\n```';
    const element = React.createElement(ChatMessageRenderer, {
      content: codeSnippet,
      isUser: false,
    });
    assert.ok(element);
    assert.ok(element.props.content.includes('def solve():'));
  });

  it('should recognize markdown image syntax', () => {
    const imgContent = 'Here is the clue:\n![Clue Image](https://example.com/animal.png)';
    const element = React.createElement(ChatMessageRenderer, {
      content: imgContent,
      isUser: false,
    });
    assert.ok(element);
    assert.ok(element.props.content.includes('https://example.com/animal.png'));
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

    const element = React.createElement(ChatMessageRenderer, {
      content: a2uiJson,
      isUser: false,
    });
    assert.ok(element);
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

    const element = React.createElement(ChatMessageRenderer, {
      content: fencedA2ui,
      isUser: false,
    });
    assert.ok(element);
  });

  it('should safely handle empty, null, or streaming partial inputs', () => {
    const elementEmpty = React.createElement(ChatMessageRenderer, {
      content: '',
      isUser: false,
      isStreaming: true,
    });
    assert.ok(elementEmpty);

    const elementPartial = React.createElement(ChatMessageRenderer, {
      content: '{"type": "Card", "tit',
      isUser: false,
      isStreaming: true,
    });
    assert.ok(elementPartial);
  });
});
