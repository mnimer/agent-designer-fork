/**
 * Unit Tests for StructuredInputBuilder Logic, Code Generation, and Router Validation
 *
 * Validates:
 * 1. Pydantic v2 BaseModel code generation for Structured Input Schemas (string, integer, number, boolean, array, enum, object).
 * 2. JSON Schema Draft-07 generation conforming to standard Draft-07 specifications.
 * 3. Router Condition Expression variable suggestions and static syntax validation against inputSchema.
 * 4. Early payload validation against configured inputSchema for the Test Runner.
 * 5. Field reordering, mutation, and default fallback handling.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { StructuredInputSchema, StructuredInputField } from '../../../src/shared/types';
import {
  buildInputPydanticCode,
  buildInputJsonSchemaObject,
  validateConditionExpression,
  getInputSchemaFieldSuggestions,
  validatePayloadAgainstInputSchema,
} from '../../../src/webview/components/inspector/StructuredInputBuilder';

describe('StructuredInputBuilder - Pydantic v2 Code Generation', () => {
  it('should generate Pydantic v2 BaseModel with all supported types including integer', () => {
    const schema: StructuredInputSchema = {
      enabled: true,
      name: 'CustomerSupportInput',
      fields: [
        { id: '1', name: 'user_query', type: 'string', required: true, description: 'User raw query' },
        { id: '2', name: 'urgency_level', type: 'integer', required: true, description: '1-5 scale' },
        { id: '3', name: 'confidence_score', type: 'number', required: false, description: 'Classifier score' },
        { id: '4', name: 'is_authenticated', type: 'boolean', required: true },
        { id: '5', name: 'tags', type: 'array', arrayItemType: 'string', required: false },
        { id: '6', name: 'category', type: 'enum', enumValues: ['billing', 'tech_support', 'general'], required: true },
        { id: '7', name: 'metadata', type: 'object', required: false },
      ],
    };

    const code = buildInputPydanticCode(schema, 'SupportAgent');
    assert.match(code, /from pydantic import BaseModel, Field/);
    assert.match(code, /from typing import List, Optional, Literal/);
    assert.match(code, /class CustomerSupportInput\(BaseModel\):/);
    assert.match(code, /user_query: str = Field\(description="User raw query"\)/);
    assert.match(code, /urgency_level: int = Field\(description="1-5 scale"\)/);
    assert.match(code, /confidence_score: Optional\[float\] = Field\(default=None, description="Classifier score"\)/);
    assert.match(code, /is_authenticated: bool/);
    assert.match(code, /tags: Optional\[List\[str\]\] = Field\(default=None\)/);
    assert.match(code, /category: Literal\["billing", "tech_support", "general"\]/);
    assert.match(code, /metadata: Optional\[dict\] = Field\(default=None\)/);
  });

  it('should sanitize identifiers and fallback to AgentNameInput when schema name is empty', () => {
    const schema: StructuredInputSchema = {
      enabled: true,
      fields: [
        { id: '1', name: '123_invalid start', type: 'string', required: true },
      ],
    };

    const code = buildInputPydanticCode(schema, 'Order Tracker');
    assert.match(code, /class OrderTrackerInput\(BaseModel\):/);
    assert.match(code, /field_123_invalid_start: str/);
  });

  it('should emit pass for empty schema fields', () => {
    const schema: StructuredInputSchema = {
      enabled: true,
      name: 'EmptyInput',
      fields: [],
    };

    const code = buildInputPydanticCode(schema, 'Agent');
    assert.match(code, /class EmptyInput\(BaseModel\):/);
    assert.match(code, /pass/);
  });
});

describe('StructuredInputBuilder - JSON Schema Draft-07 Generation', () => {
  it('should generate compliant JSON Schema Draft-07 specification', () => {
    const schema: StructuredInputSchema = {
      enabled: true,
      name: 'AgentInputSchema',
      fields: [
        { id: '1', name: 'user_intent', type: 'string', required: true, description: 'Detected user intent' },
        { id: '2', name: 'retry_count', type: 'integer', required: true },
        { id: '3', name: 'ratio', type: 'number', required: false },
        { id: '4', name: 'active', type: 'boolean', required: false },
        { id: '5', name: 'items', type: 'array', arrayItemType: 'integer', required: true },
        { id: '6', name: 'status', type: 'enum', enumValues: ['open', 'closed'], required: true },
        { id: '7', name: 'details', type: 'object', required: false },
      ],
    };

    const jsonSchema = buildInputJsonSchemaObject(schema, 'TestAgent');
    assert.equal(jsonSchema.$schema, 'http://json-schema.org/draft-07/schema#');
    assert.equal(jsonSchema.type, 'object');
    assert.equal(jsonSchema.title, 'AgentInputSchema');
    assert.deepEqual(jsonSchema.required, ['user_intent', 'retry_count', 'items', 'status']);

    assert.deepEqual(jsonSchema.properties.user_intent, {
      type: 'string',
      description: 'Detected user intent',
    });
    assert.deepEqual(jsonSchema.properties.retry_count, { type: 'integer' });
    assert.deepEqual(jsonSchema.properties.ratio, { type: 'number' });
    assert.deepEqual(jsonSchema.properties.active, { type: 'boolean' });
    assert.deepEqual(jsonSchema.properties.items, {
      type: 'array',
      items: { type: 'integer' },
    });
    assert.deepEqual(jsonSchema.properties.status, {
      type: 'string',
      enum: ['open', 'closed'],
    });
    assert.deepEqual(jsonSchema.properties.details, { type: 'object' });
  });
});

describe('StructuredInputBuilder - Router Variable Suggestions & Static Validation', () => {
  const routerSchema: StructuredInputSchema = {
    enabled: true,
    name: 'RouterInput',
    fields: [
      { id: '1', name: 'urgency', type: 'integer', required: true },
      { id: '2', name: 'category', type: 'enum', enumValues: ['billing', 'support'], required: true },
      { id: '3', name: 'user_intent', type: 'string', required: true },
    ],
  };

  it('should generate variable suggestions matching inputSchema fields', () => {
    const suggestions = getInputSchemaFieldSuggestions(routerSchema);
    assert.deepEqual(suggestions, [
      'input.urgency',
      'input.category',
      'input.user_intent',
    ]);
  });

  it('should return empty suggestions when schema is disabled or has no fields', () => {
    assert.deepEqual(getInputSchemaFieldSuggestions(undefined), []);
    assert.deepEqual(getInputSchemaFieldSuggestions({ enabled: false, fields: [] }), []);
  });

  it('should validate valid expressions accessing known inputSchema variables', () => {
    const validation1 = validateConditionExpression('input.urgency > 3', routerSchema);
    assert.equal(validation1.valid, true);
    assert.equal(validation1.warnings.length, 0);

    const validation2 = validateConditionExpression("input.category == 'billing'", routerSchema);
    assert.equal(validation2.valid, true);
    assert.equal(validation2.warnings.length, 0);
  });

  it('should detect and warn when expression accesses undefined inputSchema properties', () => {
    const validation = validateConditionExpression('input.non_existent_field == true && input.urgency > 2', routerSchema);
    assert.equal(validation.valid, false);
    assert.equal(validation.warnings.length, 1);
    assert.match(validation.warnings[0], /non_existent_field/);
  });

  it('should not warn if inputSchema is not enabled', () => {
    const disabledSchema: StructuredInputSchema = { ...routerSchema, enabled: false };
    const validation = validateConditionExpression('input.any_field == true', disabledSchema);
    assert.equal(validation.valid, true);
    assert.equal(validation.warnings.length, 0);
  });
});

describe('StructuredInputBuilder - Early Payload Validation for Test Runner', () => {
  const inputSchema: StructuredInputSchema = {
    enabled: true,
    name: 'AgentInput',
    fields: [
      { id: '1', name: 'query', type: 'string', required: true },
      { id: '2', name: 'count', type: 'integer', required: true },
      { id: '3', name: 'rate', type: 'number', required: false },
      { id: '4', name: 'active', type: 'boolean', required: true },
      { id: '5', name: 'options', type: 'enum', enumValues: ['A', 'B'], required: false },
      { id: '6', name: 'items', type: 'array', arrayItemType: 'string', required: false },
    ],
  };

  it('should successfully validate payload matching schema', () => {
    const payload = {
      query: 'Hello world',
      count: 42,
      rate: 3.14,
      active: true,
      options: 'A',
      items: ['one', 'two'],
    };

    const res = validatePayloadAgainstInputSchema(payload, inputSchema);
    assert.equal(res.valid, true);
    assert.equal(res.errors.length, 0);
  });

  it('should report errors for missing required fields', () => {
    const payload = {
      rate: 3.14,
    };

    const res = validatePayloadAgainstInputSchema(payload, inputSchema);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes("Missing required field 'query'")));
    assert.ok(res.errors.some((e) => e.includes("Missing required field 'count'")));
    assert.ok(res.errors.some((e) => e.includes("Missing required field 'active'")));
  });

  it('should report type mismatch errors for integer and boolean', () => {
    const payload = {
      query: 'Test',
      count: 12.34, // float instead of integer
      active: 'not_a_bool',
    };

    const res = validatePayloadAgainstInputSchema(payload, inputSchema);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes("Field 'count' expected integer")));
    assert.ok(res.errors.some((e) => e.includes("Field 'active' expected boolean")));
  });

  it('should report invalid enum value', () => {
    const payload = {
      query: 'Test',
      count: 5,
      active: true,
      options: 'INVALID_OPTION',
    };

    const res = validatePayloadAgainstInputSchema(payload, inputSchema);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes("Field 'options' expected one of: A, B")));
  });
});
