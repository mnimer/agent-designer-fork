/**
 * schemaValidation.ts
 *
 * Universal schema validation, Pydantic v2 code generation, and JSON Schema Draft-07 mapping
 * for Strongly Typed Input Schemas.
 *
 * Job inside Application:
 * Serves as the shared domain logic for input schema validations, router condition checks,
 * and Python Pydantic codegen across both Extension Host backend and Webview SPA UI.
 *
 * Architectural Decisions:
 * 1. Single Source of Logic: Shared across Node.js backend (AgentRunnerManager) and Webview SPA
 *    (StructuredInputBuilder, RouterAgentDrawer) avoiding code duplication (DRY).
 * 2. Pydantic v2 Compatibility: Emits idiomatic Pydantic v2 code using `Field(description=..., default=...)`.
 * 3. JSON Schema Draft-07: Conforms to Draft-07 with `$schema: "http://json-schema.org/draft-07/schema#"`.
 * 4. Router Condition Static Analysis: Performs variable reference checking (`input.<field>`).
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { StructuredInputSchema, SchemaFieldType } from './agentSpec';

/**
 * Sanitizes a string into a valid Python class identifier.
 *
 * @param name Raw name string
 * @param fallback Fallback class name
 * @returns Valid Python class name
 */
export function sanitizeClassName(name?: string, fallback: string = 'AgentInput'): string {
  if (!name || !name.trim()) return fallback;
  const cleaned = name.replace(/[^a-zA-Z0-9_]/g, '');
  if (!cleaned) return fallback;
  if (/^[0-9]/.test(cleaned)) {
    return `Input_${cleaned}`;
  }
  return cleaned;
}

/**
 * Sanitizes a field name into a valid Python attribute identifier.
 *
 * @param name Raw field name string
 * @returns Valid Python field identifier
 */
export function sanitizeFieldName(name?: string): string {
  const rawName = name?.trim() || 'unnamed_field';
  let fieldName = rawName.replace(/[^a-zA-Z0-9_]/g, '_');
  if (/^[0-9]/.test(fieldName)) {
    fieldName = `field_${fieldName}`;
  }
  return fieldName;
}

/**
 * Generates Pydantic v2 BaseModel Python code conforming to the StructuredInputSchema.
 *
 * Logic Flow:
 * 1. Checks if fields exist; if empty, emits a pass BaseModel.
 * 2. Emits standard Pydantic v2 and typing imports (BaseModel, Field, Optional, List, Literal).
 * 3. Sanitizes class name and field identifiers into valid Python identifiers.
 * 4. Maps field types to Python type annotations:
 *    - string -> str
 *    - integer -> int
 *    - number -> float
 *    - boolean -> bool
 *    - array -> List[itemType]
 *    - enum -> Literal["val1", "val2"]
 *    - object -> dict
 * 5. Handles optionality (Optional[...]) and Field(default=None, description=...).
 *
 * @param schema StructuredInputSchema
 * @param agentLabel Optional agent label for fallback naming
 * @returns Formatted Python code string
 */
export function buildInputPydanticCode(schema: StructuredInputSchema, agentLabel?: string): string {
  const fallbackName = agentLabel ? `${agentLabel.replace(/[^a-zA-Z0-9]/g, '')}Input` : 'AgentInput';
  const className = sanitizeClassName(schema.name, fallbackName);

  const lines: string[] = [
    'from typing import List, Optional, Literal',
    'from pydantic import BaseModel, Field',
    '',
    `class ${className}(BaseModel):`,
  ];

  if (!schema.fields || schema.fields.length === 0) {
    lines.push('    pass');
    return lines.join('\n');
  }

  for (const f of schema.fields) {
    const fieldName = sanitizeFieldName(f.name);

    let typeStr = 'str';
    switch (f.type) {
      case 'string':
        typeStr = 'str';
        break;
      case 'integer':
        typeStr = 'int';
        break;
      case 'number':
        typeStr = 'float';
        break;
      case 'boolean':
        typeStr = 'bool';
        break;
      case 'array': {
        const itemType = f.arrayItemType === 'integer'
          ? 'int'
          : f.arrayItemType === 'number'
          ? 'float'
          : f.arrayItemType === 'boolean'
          ? 'bool'
          : f.arrayItemType === 'object'
          ? 'dict'
          : 'str';
        typeStr = `List[${itemType}]`;
        break;
      }
      case 'enum': {
        const enumVals = (f.enumValues && f.enumValues.length > 0 ? f.enumValues : ['option1', 'option2'])
          .map((v) => JSON.stringify(v))
          .join(', ');
        typeStr = `Literal[${enumVals}]`;
        break;
      }
      case 'object':
        typeStr = 'dict';
        break;
      default:
        typeStr = 'str';
    }

    const fieldArgs: string[] = [];
    if (!f.required) {
      typeStr = `Optional[${typeStr}]`;
      fieldArgs.push('default=None');
    }
    if (f.description && f.description.trim()) {
      fieldArgs.push(`description=${JSON.stringify(f.description.trim())}`);
    }

    if (fieldArgs.length > 0) {
      lines.push(`    ${fieldName}: ${typeStr} = Field(${fieldArgs.join(', ')})`);
    } else {
      lines.push(`    ${fieldName}: ${typeStr}`);
    }
  }

  return lines.join('\n');
}

/**
 * Builds a JSON Schema Draft-07 specification object from StructuredInputSchema.
 *
 * @param schema StructuredInputSchema
 * @param agentLabel Optional label for title
 * @returns JSON Schema Draft-07 conforming object
 */
export function buildInputJsonSchemaObject(schema: StructuredInputSchema, agentLabel?: string): Record<string, any> {
  const fallbackTitle = agentLabel ? `${agentLabel.replace(/[^a-zA-Z0-9]/g, '')}Input` : 'AgentInput';
  const title = schema.name || fallbackTitle;

  const properties: Record<string, any> = {};
  const required: string[] = [];

  (schema.fields || []).forEach((f) => {
    let fieldSchema: Record<string, any> = {};

    switch (f.type) {
      case 'string':
        fieldSchema = { type: 'string' };
        break;
      case 'integer':
        fieldSchema = { type: 'integer' };
        break;
      case 'number':
        fieldSchema = { type: 'number' };
        break;
      case 'boolean':
        fieldSchema = { type: 'boolean' };
        break;
      case 'array': {
        const itemType = f.arrayItemType === 'integer'
          ? 'integer'
          : f.arrayItemType === 'number'
          ? 'number'
          : f.arrayItemType === 'boolean'
          ? 'boolean'
          : f.arrayItemType === 'object'
          ? 'object'
          : 'string';
        fieldSchema = {
          type: 'array',
          items: { type: itemType },
        };
        break;
      }
      case 'enum':
        fieldSchema = {
          type: 'string',
          enum: f.enumValues && f.enumValues.length > 0 ? f.enumValues : ['option1', 'option2'],
        };
        break;
      case 'object':
        fieldSchema = { type: 'object' };
        break;
      default:
        fieldSchema = { type: 'string' };
    }

    if (f.description) {
      fieldSchema.description = f.description;
    }

    const propName = f.name?.trim() || 'unnamed_field';
    properties[propName] = fieldSchema;

    if (f.required) {
      required.push(propName);
    }
  });

  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title,
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}

/**
 * Returns variable suggestions (e.g. `input.urgency`) matching configured fields in an inputSchema.
 *
 * @param schema StructuredInputSchema
 * @returns Array of suggestion expressions
 */
export function getInputSchemaFieldSuggestions(schema?: StructuredInputSchema): string[] {
  if (!schema || !schema.enabled || !schema.fields || schema.fields.length === 0) {
    return [];
  }
  return schema.fields
    .map((f) => f.name?.trim())
    .filter((name): name is string => Boolean(name && name.length > 0))
    .map((name) => `input.${name}`);
}

/**
 * Validates a condition expression against the inputSchema properties.
 *
 * Detects any `input.<field>` references and verifies if `<field>` exists in the configured inputSchema.
 * If the schema is disabled or has no fields, validation passes silently.
 *
 * @param expression Condition expression string
 * @param schema StructuredInputSchema
 * @returns Validation result with warning messages
 */
export function validateConditionExpression(
  expression: string,
  schema?: StructuredInputSchema
): { valid: boolean; warnings: string[] } {
  if (!schema || !schema.enabled || !schema.fields || schema.fields.length === 0 || !expression) {
    return { valid: true, warnings: [] };
  }

  const warnings: string[] = [];
  const knownFields = new Set(schema.fields.map((f) => f.name?.trim()).filter(Boolean));

  // Regex to extract input.<field> references
  const regex = /\binput\.([a-zA-Z0-9_]+)\b/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(expression)) !== null) {
    const fieldName = match[1];
    if (!knownFields.has(fieldName)) {
      warnings.push(`Property '${fieldName}' not found in Input Schema`);
    }
  }

  return {
    valid: warnings.length === 0,
    warnings,
  };
}

/**
 * Validates an incoming input payload against the defined inputSchema.
 * Used by Test Runner and AgentRunnerManager for early diagnostic checks.
 *
 * @param payload Arbitrary incoming JSON/object payload
 * @param schema StructuredInputSchema
 * @returns Validation result with array of errors
 */
export function validatePayloadAgainstInputSchema(
  payload: any,
  schema: StructuredInputSchema
): { valid: boolean; errors: string[] } {
  if (!schema || !schema.enabled) {
    return { valid: true, errors: [] };
  }

  const errors: string[] = [];

  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return { valid: false, errors: ['Payload must be a JSON object conforming to Input Schema'] };
  }

  for (const field of schema.fields || []) {
    const fieldName = field.name?.trim();
    if (!fieldName) continue;

    const value = payload[fieldName];

    if (field.required && (value === undefined || value === null)) {
      errors.push(`Missing required field '${fieldName}'`);
      continue;
    }

    if (value !== undefined && value !== null) {
      switch (field.type) {
        case 'string':
          if (typeof value !== 'string') {
            errors.push(`Field '${fieldName}' expected string, received ${typeof value}`);
          }
          break;
        case 'integer':
          if (typeof value !== 'number' || !Number.isInteger(value)) {
            errors.push(`Field '${fieldName}' expected integer, received ${typeof value}`);
          }
          break;
        case 'number':
          if (typeof value !== 'number' || isNaN(value)) {
            errors.push(`Field '${fieldName}' expected number, received ${typeof value}`);
          }
          break;
        case 'boolean':
          if (typeof value !== 'boolean') {
            errors.push(`Field '${fieldName}' expected boolean, received ${typeof value}`);
          }
          break;
        case 'array':
          if (!Array.isArray(value)) {
            errors.push(`Field '${fieldName}' expected array, received ${typeof value}`);
          }
          break;
        case 'object':
          if (typeof value !== 'object' || Array.isArray(value)) {
            errors.push(`Field '${fieldName}' expected object, received ${typeof value}`);
          }
          break;
        case 'enum':
          if (!field.enumValues || !field.enumValues.includes(String(value))) {
            errors.push(`Field '${fieldName}' expected one of: ${(field.enumValues || []).join(', ')}, received ${value}`);
          }
          break;
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
