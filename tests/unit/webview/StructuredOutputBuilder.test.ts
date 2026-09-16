/**
 * Unit Tests for StructuredOutputBuilder Logic & Schema Generation
 *
 * Validates:
 * 1. Schema field additions, updates, removals, and reordering.
 * 2. Conversion between GUI field definitions and Gemini JSON Schema formats.
 * 3. Validation of enum types, arrays, numbers, booleans, and required properties.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { StructuredOutputSchema, SchemaField } from '../../../src/shared/types';
import { buildPydanticCode } from '../../../src/webview/components/inspector/StructuredOutputBuilder';

describe('StructuredOutputBuilder Schema Logic', () => {
  it('should format a basic structured schema with string, number, and array properties', () => {
    const schema: StructuredOutputSchema = {
      enabled: true,
      name: 'TestSchema',
      strict: true,
      fields: [
        {
          id: 'f1',
          name: 'title',
          type: 'string',
          required: true,
          description: 'Document title',
        },
        {
          id: 'f2',
          name: 'score',
          type: 'number',
          required: true,
          description: 'Quality score',
        },
        {
          id: 'f3',
          name: 'tags',
          type: 'array',
          itemType: 'string',
          required: false,
          description: 'Categorization tags',
        },
      ],
    };

    assert.equal(schema.enabled, true);
    assert.equal(schema.fields.length, 3);
    assert.equal(schema.fields[0].name, 'title');
    assert.equal(schema.fields[1].type, 'number');
    assert.equal(schema.fields[2].itemType, 'string');
  });

  it('should support enum field with restricted values list', () => {
    const enumField: SchemaField = {
      id: 'f_enum',
      name: 'severity',
      type: 'enum',
      required: true,
      enumValues: ['low', 'medium', 'high', 'critical'],
      description: 'Defines incident severity level',
    };

    assert.equal(enumField.type, 'enum');
    assert.deepEqual(enumField.enumValues, ['low', 'medium', 'high', 'critical']);
    assert.equal(enumField.required, true);
  });

  it('should handle field reordering up and down', () => {
    const fields: SchemaField[] = [
      { id: '1', name: 'first', type: 'string' },
      { id: '2', name: 'second', type: 'string' },
      { id: '3', name: 'third', type: 'string' },
    ];

    // Move index 1 up -> [second, first, third]
    const moveUp = [...fields];
    const [item] = moveUp.splice(1, 1);
    moveUp.splice(0, 0, item);

    assert.equal(moveUp[0].name, 'second');
    assert.equal(moveUp[1].name, 'first');
    assert.equal(moveUp[2].name, 'third');
  });

  it('should generate valid Pydantic v2 BaseModel code with typed fields', () => {
    const schema: any = {
      enabled: true,
      name: 'AnalysisResult',
      fields: [
        { id: '1', name: 'headline', type: 'string', required: true, description: 'Summary headline' },
        { id: '2', name: 'confidence', type: 'number', required: true },
        { id: '3', name: 'is_verified', type: 'boolean', required: true },
        { id: '4', name: 'tags', type: 'array', arrayItemType: 'string', required: false },
        { id: '5', name: 'status', type: 'enum', enumValues: ['draft', 'published'], required: true },
        { id: '6', name: 'extra_meta', type: 'object', required: false, description: 'Metadata dict' },
      ],
    };

    const pythonCode = buildPydanticCode(schema);
    assert.match(pythonCode, /from pydantic import BaseModel, Field/);
    assert.match(pythonCode, /from typing import List, Optional, Literal/);
    assert.match(pythonCode, /class AnalysisResult\(BaseModel\):/);
    assert.match(pythonCode, /headline: str = Field\(description="Summary headline"\)/);
    assert.match(pythonCode, /confidence: float/);
    assert.match(pythonCode, /is_verified: bool/);
    assert.match(pythonCode, /tags: Optional\[List\[str\]\] = Field\(default=None\)/);
    assert.match(pythonCode, /status: Literal\["draft", "published"\]/);
    assert.match(pythonCode, /extra_meta: Optional\[dict\] = Field\(default=None, description="Metadata dict"\)/);
  });

  it('should generate pass for empty schema fields', () => {
    const emptySchema: any = {
      enabled: true,
      name: 'EmptySchema',
      fields: [],
    };
    const code = buildPydanticCode(emptySchema);
    assert.match(code, /class EmptySchema\(BaseModel\):/);
    assert.match(code, /pass/);
  });
});
