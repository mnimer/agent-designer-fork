/**
 * StructuredInputBuilder Component
 *
 * Inspector accordion component for configuring strongly typed Structured Input Schemas
 * for Standard Agents and Decision Router Nodes.
 *
 * Job inside Application:
 * Provides a rich visual editor for specifying agent input contracts (Pydantic BaseModel / JSON Schema Draft-07),
 * enabling multi-agent handoffs, upstream trigger payloads, typed router condition evaluations,
 * and early schema validation in the Test Runner.
 *
 * Architectural Decisions:
 * 1. Dual Schema Previews: Provides live tabbed generation of both Pydantic v2 Python BaseModel
 *    code and JSON Schema Draft-07 specification.
 * 2. Router Condition Suggestions: Exposes variable helpers so RouterAgentDrawer can offer autocomplete
 *    and static syntax validation for `input.<field>` expressions.
 * 3. Early Test Runner Validation: Includes payload validation logic to catch schema mismatch
 *    errors before sending requests to the agent runtime.
 * 4. 8pt Grid Layout: Adheres to VS Code plugin theme styling and 8pt spacing system.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import React, { useState } from 'react';
import { 
  Braces, 
  Plus, 
  Trash2, 
  Copy, 
  Check, 
  FileJson, 
  ChevronDown, 
  ChevronUp, 
  ListTree,
  Code2
} from 'lucide-react';
import { 
  StructuredInputSchema, 
  StructuredInputField, 
  SchemaFieldType 
} from '../../types';

interface StructuredInputBuilderProps {
  schema?: StructuredInputSchema;
  agentLabel: string;
  onChange: (schema: StructuredInputSchema) => void;
  title?: string;
  description?: string;
}

const DEFAULT_INPUT_SCHEMA = (agentLabel: string): StructuredInputSchema => {
  const sanitized = agentLabel.replace(/[^a-zA-Z0-9]/g, '');
  return {
    enabled: false,
    name: `${sanitized || 'Agent'}Input`,
    fields: [
      {
        id: 'f1',
        name: '',
        type: 'string',
        required: true,
        description: '',
      },
    ],
  };
};

import {
  sanitizeClassName,
  sanitizeFieldName,
  buildInputPydanticCode,
  buildInputJsonSchemaObject,
  getInputSchemaFieldSuggestions,
  validateConditionExpression,
  validatePayloadAgainstInputSchema,
} from '../../../shared/schemaValidation';

export {
  sanitizeClassName,
  sanitizeFieldName,
  buildInputPydanticCode,
  buildInputJsonSchemaObject,
  getInputSchemaFieldSuggestions,
  validateConditionExpression,
  validatePayloadAgainstInputSchema,
};

export const StructuredInputBuilder: React.FC<StructuredInputBuilderProps> = ({
  schema: initialSchema,
  agentLabel,
  onChange,
  title = 'Input Schema',
  description = 'Define strongly typed input parameters & state schema (Pydantic v2 / JSON Schema Draft-07)',
}) => {
  const [activeTab, setActiveTab] = useState<'builder' | 'json' | 'pydantic'>('builder');
  const [copied, setCopied] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);

  const currentSchema: StructuredInputSchema = initialSchema || DEFAULT_INPUT_SCHEMA(agentLabel);

  const handleToggleEnable = () => {
    onChange({
      ...currentSchema,
      enabled: !currentSchema.enabled,
    });
  };

  const handleUpdate = (updates: Partial<StructuredInputSchema>) => {
    onChange({
      ...currentSchema,
      ...updates,
    });
  };

  const handleAddField = () => {
    const newField: StructuredInputField = {
      id: `in_field_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 3)}`,
      name: '',
      type: 'string',
      required: true,
      description: '',
    };
    handleUpdate({
      fields: [...currentSchema.fields, newField],
    });
  };

  const handleUpdateField = (fieldId: string | undefined, updates: Partial<StructuredInputField>) => {
    const updated = currentSchema.fields.map((f) => (f.id === fieldId ? { ...f, ...updates } : f));
    handleUpdate({ fields: updated });
  };

  const handleDeleteField = (fieldId: string | undefined) => {
    if (currentSchema.fields.length <= 1) return;
    const filtered = currentSchema.fields.filter((f) => f.id !== fieldId);
    handleUpdate({ fields: filtered });
  };

  const handleMoveField = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= currentSchema.fields.length) return;
    const newFields = [...currentSchema.fields];
    const [moved] = newFields.splice(index, 1);
    newFields.splice(targetIndex, 0, moved);
    handleUpdate({ fields: newFields });
  };

  const jsonSchemaObj = buildInputJsonSchemaObject(currentSchema, agentLabel);
  const jsonSchemaString = JSON.stringify(jsonSchemaObj, null, 2);
  const pydanticCodeString = buildInputPydanticCode(currentSchema, agentLabel);

  const handleCopyCode = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRawJsonChange = (rawJson: string) => {
    try {
      const parsed = JSON.parse(rawJson);
      if (parsed && typeof parsed === 'object' && parsed.properties) {
        const newFields: StructuredInputField[] = [];
        const requiredList: string[] = Array.isArray(parsed.required) ? parsed.required : [];

        Object.entries(parsed.properties).forEach(([name, prop]: [string, any]) => {
          let fieldType: SchemaFieldType = 'string';
          let itemType: SchemaFieldType | undefined = undefined;
          let enumValues: string[] | undefined = undefined;

          const rawType = (prop.type || 'string').toString().toLowerCase();
          if (rawType === 'integer') fieldType = 'integer';
          else if (rawType === 'number') fieldType = 'number';
          else if (rawType === 'boolean') fieldType = 'boolean';
          else if (rawType === 'array') {
            fieldType = 'array';
            const rawItemType = (prop.items?.type || 'string').toString().toLowerCase();
            itemType = rawItemType === 'integer' ? 'integer' : rawItemType === 'number' ? 'number' : rawItemType === 'boolean' ? 'boolean' : 'string';
          } else if (rawType === 'object') {
            fieldType = 'object';
          } else if (Array.isArray(prop.enum)) {
            fieldType = 'enum';
            enumValues = prop.enum;
          }

          newFields.push({
            id: `f_${Math.random().toString(36).substr(2, 6)}`,
            name,
            type: fieldType,
            required: requiredList.includes(name),
            description: prop.description || '',
            arrayItemType: itemType,
            enumValues,
          });
        });

        if (newFields.length > 0) {
          handleUpdate({ fields: newFields });
        }
      }
      setJsonError(null);
    } catch {
      setJsonError('Invalid JSON format');
    }
  };

  return (
    <div className="space-y-3 pt-3 border-t border-[#30363d]">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div className={`p-1 rounded-md ${currentSchema.enabled ? 'bg-blue-500/20 text-blue-300' : 'bg-[#161b22] text-gray-400'}`}>
            <Braces className="w-3.5 h-3.5" />
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-tight text-blue-300 flex items-center gap-1.5">
              <span>{title}</span>
              {currentSchema.enabled && (
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-blue-500/30 text-blue-200 font-mono font-bold border border-blue-500/40">
                  {currentSchema.fields.length} {currentSchema.fields.length === 1 ? 'field' : 'fields'}
                </span>
              )}
            </label>
          </div>
        </div>

        {/* Enable / Disable Toggle Switch */}
        <button
          type="button"
          onClick={handleToggleEnable}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer transition-all border ${
            currentSchema.enabled
              ? 'bg-blue-600/30 text-blue-200 border-blue-500/60 shadow-xs hover:bg-blue-600/40'
              : 'bg-[#161b22] text-gray-400 border-[#30363d] hover:text-gray-200 hover:border-gray-500'
          }`}
        >
          <div className={`w-2 h-2 rounded-full ${currentSchema.enabled ? 'bg-blue-400 shadow-xs shadow-blue-400' : 'bg-gray-500'}`} />
          <span>{currentSchema.enabled ? 'Enabled' : 'Freeform Input'}</span>
        </button>
      </div>

      {/* Main Container when Enabled */}
      {currentSchema.enabled ? (
        <div className="bg-[#0d1117] rounded-lg border border-blue-500/40 p-3 space-y-3 shadow-inner">
          {/* Tab Navigation: Field Builder vs JSON Schema vs Pydantic v2 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 bg-[#161b22] p-0.5 rounded-md border border-[#30363d]">
              <button
                type="button"
                onClick={() => setActiveTab('builder')}
                className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'builder'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <ListTree className="w-3 h-3" />
                <span>Field Builder ({currentSchema.fields.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('json')}
                className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'json'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <FileJson className="w-3 h-3" />
                <span>JSON Schema</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('pydantic')}
                className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'pydantic'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <Code2 className="w-3 h-3" />
                <span>Pydantic v2</span>
              </button>
            </div>

            {(activeTab === 'json' || activeTab === 'pydantic') && (
              <button
                type="button"
                onClick={() => handleCopyCode(activeTab === 'json' ? jsonSchemaString : pydanticCodeString)}
                className="flex items-center gap-1 px-2 py-1 rounded bg-[#161b22] hover:bg-[#21262d] text-blue-300 border border-blue-500/30 text-[10px] font-medium transition-colors cursor-pointer"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            )}
          </div>

          {/* TAB 1: VISUAL FIELD BUILDER */}
          {activeTab === 'builder' && (
            <div className="space-y-2.5">
              <div className="space-y-2">
                {currentSchema.fields.map((field, index) => {
                  return (
                    <div
                      key={field.id || index}
                      className="p-2.5 bg-[#161b22] rounded-md border border-[#30363d] hover:border-blue-500/50 transition-colors space-y-2 group"
                    >
                      {/* Top Row: Name, Type, Required, Reorder & Delete */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono font-bold text-gray-500 w-4 shrink-0">
                          #{index + 1}
                        </span>

                        {/* Field Name */}
                        <input
                          type="text"
                          value={field.name}
                          onChange={(e) => handleUpdateField(field.id, { name: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })}
                          placeholder="input_field"
                          className="flex-1 px-2 py-1 bg-[#0d1117] border border-[#30363d] focus:border-blue-500 rounded text-xs text-white font-mono font-bold focus:outline-none min-w-[80px]"
                        />

                        {/* Field Type */}
                        <select
                          value={field.type}
                          onChange={(e) => handleUpdateField(field.id, { type: e.target.value as SchemaFieldType })}
                          className="px-2 py-1 bg-[#0d1117] border border-[#30363d] focus:border-blue-500 rounded text-[11px] text-blue-300 font-mono focus:outline-none cursor-pointer"
                        >
                          <option value="string">string</option>
                          <option value="integer">integer</option>
                          <option value="number">number</option>
                          <option value="boolean">boolean</option>
                          <option value="array">array[]</option>
                          <option value="enum">enum</option>
                          <option value="object">object</option>
                        </select>

                        {/* Required Toggle */}
                        <button
                          type="button"
                          onClick={() => handleUpdateField(field.id, { required: !field.required })}
                          className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold transition-colors cursor-pointer border ${
                            field.required
                              ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                              : 'bg-[#0d1117] text-gray-500 border-[#30363d] hover:text-gray-300'
                          }`}
                          title={field.required ? 'Required input field' : 'Optional input field'}
                        >
                          {field.required ? 'Req' : 'Opt'}
                        </button>

                        {/* Reorder Up/Down */}
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            disabled={index === 0}
                            onClick={() => handleMoveField(index, 'up')}
                            className="p-0.5 rounded text-gray-400 hover:text-white disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed"
                            title="Move field up"
                          >
                            <ChevronUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            disabled={index === currentSchema.fields.length - 1}
                            onClick={() => handleMoveField(index, 'down')}
                            className="p-0.5 rounded text-gray-400 hover:text-white disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed"
                            title="Move field down"
                          >
                            <ChevronDown className="w-3 h-3" />
                          </button>
                        </div>

                        {/* Delete Field */}
                        {currentSchema.fields.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleDeleteField(field.id)}
                            className="p-1 rounded text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer shrink-0"
                            title="Delete Field"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      {/* Field Description */}
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={field.description || ''}
                          onChange={(e) => handleUpdateField(field.id, { description: e.target.value })}
                          placeholder="Input parameter description..."
                          className="w-full px-2 py-0.5 bg-[#0d1117] border border-[#30363d] focus:border-blue-500 rounded text-[11px] text-gray-300 focus:outline-none"
                        />
                      </div>

                      {/* Extra config for Enum & Array */}
                      {field.type === 'enum' && (
                        <div className="p-1.5 rounded bg-[#0d1117] border border-blue-500/30 space-y-1">
                          <label className="text-[9px] font-mono text-blue-300">Allowed Enum Values (comma-separated):</label>
                          <input
                            type="text"
                            value={(field.enumValues || []).join(', ')}
                            onChange={(e) =>
                              handleUpdateField(field.id, {
                                enumValues: e.target.value
                                  .split(',')
                                  .map((s) => s.trim())
                                  .filter(Boolean),
                              })
                            }
                            placeholder="e.g. low, medium, high, critical"
                            className="w-full px-2 py-0.5 bg-[#161b22] border border-[#30363d] focus:border-blue-500 rounded text-[10px] text-blue-200 font-mono focus:outline-none"
                          />
                        </div>
                      )}

                      {field.type === 'array' && (
                        <div className="flex items-center gap-2 p-1.5 rounded bg-[#0d1117] border border-blue-500/30">
                          <span className="text-[9px] font-mono text-blue-300">Array Item Type:</span>
                          <select
                            value={field.arrayItemType || 'string'}
                            onChange={(e) => handleUpdateField(field.id, { arrayItemType: e.target.value as SchemaFieldType })}
                            className="px-2 py-0.5 bg-[#161b22] border border-[#30363d] focus:border-blue-500 rounded text-[10px] text-blue-200 font-mono focus:outline-none cursor-pointer"
                          >
                            <option value="string">string</option>
                            <option value="integer">integer</option>
                            <option value="number">number</option>
                            <option value="boolean">boolean</option>
                            <option value="object">object</option>
                          </select>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Add Field Button */}
              <button
                type="button"
                onClick={handleAddField}
                className="w-full py-1.5 px-3 rounded-md bg-[#161b22] hover:bg-[#21262d] border border-dashed border-blue-500/40 hover:border-blue-400 text-blue-300 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              >
                <Plus className="w-3.5 h-3.5 text-blue-400" />
                <span>Add Input Field</span>
              </button>
            </div>
          )}

          {/* TAB 2: JSON SCHEMA VIEW / EDITOR */}
          {activeTab === 'json' && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[10px] text-gray-400">
                <span>JSON Schema Draft-07 Specification</span>
                <span className="text-[9px] font-mono text-blue-300">draft-07</span>
              </div>
              <textarea
                value={jsonSchemaString}
                onChange={(e) => handleRawJsonChange(e.target.value)}
                rows={10}
                className="w-full p-2.5 rounded bg-[#161b22] border border-[#30363d] text-[10px] font-mono text-blue-200 focus:border-blue-500 focus:outline-none leading-relaxed selection:bg-blue-900 resize-y"
              />
              {jsonError && (
                <div className="text-[10px] text-rose-400 font-mono">
                  ⚠️ {jsonError}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: PYDANTIC V2 BASEMODEL PREVIEW */}
          {activeTab === 'pydantic' && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[10px] text-gray-400">
                <span>Pydantic v2 BaseModel Python Definition</span>
                <span className="text-[9px] font-mono text-emerald-400">pydantic_models.py</span>
              </div>
              <textarea
                readOnly
                value={pydanticCodeString}
                rows={10}
                className="w-full p-2.5 rounded bg-[#161b22] border border-[#30363d] text-[10px] font-mono text-emerald-300 focus:border-blue-500 focus:outline-none leading-relaxed selection:bg-blue-900 resize-y"
              />
            </div>
          )}
        </div>
      ) : (
        /* Disabled placeholder callout */
        <div 
          onClick={handleToggleEnable}
          className="p-3 bg-[#0d1117] rounded-lg border border-dashed border-[#30363d] hover:border-blue-500/50 cursor-pointer transition-colors flex items-center justify-between group"
        >
          <div className="flex items-center gap-2">
            <FileJson className="w-4 h-4 text-gray-500 group-hover:text-blue-400 transition-colors" />
            <div>
              <div className="text-xs font-semibold text-gray-400 group-hover:text-white">
                Unstructured Input (Freeform Text / Prompt)
              </div>
              <div className="text-[10px] text-gray-500">
                {description}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="px-2 py-1 rounded bg-[#161b22] text-blue-300 border border-blue-500/30 text-[10px] font-bold group-hover:bg-blue-600 group-hover:text-white transition-colors"
          >
            + Enable Schema
          </button>
        </div>
      )}
    </div>
  );
};
