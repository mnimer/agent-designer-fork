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
  ListTree
} from 'lucide-react';
import { 
  StructuredOutputSchema, 
  StructuredOutputField, 
  SchemaFieldType 
} from '../../types';

interface StructuredOutputBuilderProps {
  schema?: StructuredOutputSchema;
  agentLabel: string;
  onChange: (schema: StructuredOutputSchema) => void;
}

const DEFAULT_SCHEMA = (agentLabel: string): StructuredOutputSchema => {
  return {
    enabled: false,
    formatType: 'json_schema',
    name: 'ResponseSchema',
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

export const StructuredOutputBuilder: React.FC<StructuredOutputBuilderProps> = ({
  schema: initialSchema,
  agentLabel,
  onChange,
}) => {
  const [activeTab, setActiveTab] = useState<'builder' | 'json'>('builder');
  const [copied, setCopied] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Initialize or fallback
  const currentSchema: StructuredOutputSchema = initialSchema || DEFAULT_SCHEMA(agentLabel);

  const handleToggleEnable = () => {
    onChange({
      ...currentSchema,
      enabled: !currentSchema.enabled,
    });
  };

  const handleUpdate = (updates: Partial<StructuredOutputSchema>) => {
    onChange({
      ...currentSchema,
      ...updates,
    });
  };

  const handleAddField = () => {
    const newField: StructuredOutputField = {
      id: `field_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 3)}`,
      name: '',
      type: 'string',
      required: true,
      description: '',
    };
    handleUpdate({
      fields: [...currentSchema.fields, newField],
    });
  };

  const handleUpdateField = (fieldId: string, updates: Partial<StructuredOutputField>) => {
    const updated = currentSchema.fields.map((f) => (f.id === fieldId ? { ...f, ...updates } : f));
    handleUpdate({ fields: updated });
  };

  const handleDeleteField = (fieldId: string) => {
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

  // Helper generator for Gemini-compliant JSON Schema
  const buildJsonSchemaObject = () => {
    const properties: Record<string, any> = {};
    const required: string[] = [];

    currentSchema.fields.forEach((f) => {
      let fieldSchema: Record<string, any> = {};

      switch (f.type) {
        case 'string':
          fieldSchema = { type: 'STRING' };
          break;
        case 'number':
          fieldSchema = { type: 'NUMBER' };
          break;
        case 'boolean':
          fieldSchema = { type: 'BOOLEAN' };
          break;
        case 'array':
          fieldSchema = {
            type: 'ARRAY',
            items: { 
              type: f.arrayItemType === 'number' 
                ? 'NUMBER' 
                : f.arrayItemType === 'boolean' 
                ? 'BOOLEAN' 
                : f.arrayItemType === 'object' 
                ? 'OBJECT' 
                : 'STRING' 
            },
          };
          break;
        case 'enum':
          fieldSchema = {
            type: 'STRING',
            enum: f.enumValues && f.enumValues.length > 0 ? f.enumValues : ['option1', 'option2'],
          };
          break;
        case 'object':
          fieldSchema = { type: 'OBJECT' };
          break;
        default:
          fieldSchema = { type: 'STRING' };
      }

      if (f.description) {
        fieldSchema.description = f.description;
      }

      properties[f.name || 'unnamed_field'] = fieldSchema;

      if (f.required) {
        required.push(f.name || 'unnamed_field');
      }
    });

    return {
      type: 'OBJECT',
      properties,
      ...(required.length > 0 ? { required } : {}),
    };
  };

  const jsonSchemaString = JSON.stringify(buildJsonSchemaObject(), null, 2);

  const handleCopyCode = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRawJsonChange = (rawJson: string) => {
    try {
      const parsed = JSON.parse(rawJson);
      if (parsed && typeof parsed === 'object' && parsed.properties) {
        const newFields: StructuredOutputField[] = [];
        const requiredList: string[] = Array.isArray(parsed.required) ? parsed.required : [];

        Object.entries(parsed.properties).forEach(([name, prop]: [string, any]) => {
          let fieldType: SchemaFieldType = 'string';
          let itemType: SchemaFieldType | undefined = undefined;
          let enumValues: string[] | undefined = undefined;

          const rawType = (prop.type || 'string').toString().toLowerCase();
          if (rawType === 'number' || rawType === 'integer') fieldType = 'number';
          else if (rawType === 'boolean') fieldType = 'boolean';
          else if (rawType === 'array') {
            fieldType = 'array';
            const rawItemType = (prop.items?.type || 'string').toString().toLowerCase();
            itemType = rawItemType === 'number' ? 'number' : rawItemType === 'boolean' ? 'boolean' : 'string';
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
          <div className={`p-1 rounded-md ${currentSchema.enabled ? 'bg-purple-500/20 text-purple-300' : 'bg-[#161b22] text-gray-400'}`}>
            <Braces className="w-3.5 h-3.5" />
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-tight text-purple-300 flex items-center gap-1.5">
              <span>Structured Output</span>
              {currentSchema.enabled && (
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-500/30 text-purple-200 font-mono font-bold border border-purple-500/40">
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
              ? 'bg-purple-600/30 text-purple-200 border-purple-500/60 shadow-xs hover:bg-purple-600/40'
              : 'bg-[#161b22] text-gray-400 border-[#30363d] hover:text-gray-200 hover:border-gray-500'
          }`}
        >
          <div className={`w-2 h-2 rounded-full ${currentSchema.enabled ? 'bg-purple-400 shadow-xs shadow-purple-400' : 'bg-gray-500'}`} />
          <span>{currentSchema.enabled ? 'Enabled' : 'Freeform Text'}</span>
        </button>
      </div>

      {/* Main Container when Enabled */}
      {currentSchema.enabled ? (
        <div className="bg-[#0d1117] rounded-lg border border-purple-500/40 p-3 space-y-3 shadow-inner">
          {/* Tab Navigation: Field Builder vs JSON Schema */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 bg-[#161b22] p-0.5 rounded-md border border-[#30363d]">
              <button
                type="button"
                onClick={() => setActiveTab('builder')}
                className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'builder'
                    ? 'bg-purple-600 text-white shadow-xs'
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
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <FileJson className="w-3 h-3" />
                <span>JSON Schema</span>
              </button>
            </div>

            {activeTab === 'json' && (
              <button
                type="button"
                onClick={() => handleCopyCode(jsonSchemaString)}
                className="flex items-center gap-1 px-2 py-1 rounded bg-[#161b22] hover:bg-[#21262d] text-purple-300 border border-purple-500/30 text-[10px] font-medium transition-colors cursor-pointer"
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
                      key={field.id}
                      className="p-2.5 bg-[#161b22] rounded-md border border-[#30363d] hover:border-purple-500/50 transition-colors space-y-2 group"
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
                          placeholder="fieldName"
                          className="flex-1 px-2 py-1 bg-[#0d1117] border border-[#30363d] focus:border-purple-500 rounded text-xs text-white font-mono font-bold focus:outline-none min-w-[80px]"
                        />

                        {/* Field Type */}
                        <select
                          value={field.type}
                          onChange={(e) => handleUpdateField(field.id, { type: e.target.value as SchemaFieldType })}
                          className="px-2 py-1 bg-[#0d1117] border border-[#30363d] focus:border-purple-500 rounded text-[11px] text-purple-300 font-mono focus:outline-none cursor-pointer"
                        >
                          <option value="string">string</option>
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
                          title={field.required ? 'Required field in schema' : 'Optional field'}
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
                          placeholder="Field description directive for LLM..."
                          className="w-full px-2 py-0.5 bg-[#0d1117] border border-[#30363d] focus:border-purple-500 rounded text-[11px] text-gray-300 focus:outline-none"
                        />
                      </div>

                      {/* Extra config for Enum & Array */}
                      {field.type === 'enum' && (
                        <div className="p-1.5 rounded bg-[#0d1117] border border-purple-500/30 space-y-1">
                          <label className="text-[9px] font-mono text-purple-300">Allowed Enum Values (comma-separated):</label>
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
                            className="w-full px-2 py-0.5 bg-[#161b22] border border-[#30363d] focus:border-purple-500 rounded text-[10px] text-purple-200 font-mono focus:outline-none"
                          />
                        </div>
                      )}

                      {field.type === 'array' && (
                        <div className="flex items-center gap-2 p-1.5 rounded bg-[#0d1117] border border-purple-500/30">
                          <span className="text-[9px] font-mono text-purple-300">Array Item Type:</span>
                          <select
                            value={field.arrayItemType || 'string'}
                            onChange={(e) => handleUpdateField(field.id, { arrayItemType: e.target.value as SchemaFieldType })}
                            className="px-2 py-0.5 bg-[#161b22] border border-[#30363d] focus:border-purple-500 rounded text-[10px] text-purple-200 font-mono focus:outline-none cursor-pointer"
                          >
                            <option value="string">string</option>
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
                className="w-full py-1.5 px-3 rounded-md bg-[#161b22] hover:bg-[#21262d] border border-dashed border-purple-500/40 hover:border-purple-400 text-purple-300 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              >
                <Plus className="w-3.5 h-3.5 text-purple-400" />
                <span>Add Schema Field</span>
              </button>
            </div>
          )}

          {/* TAB 2: JSON SCHEMA VIEW / EDITOR */}
          {activeTab === 'json' && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[10px] text-gray-400">
                <span>Gemini responseSchema Specification</span>
                <span className="text-[9px] font-mono text-purple-300">OpenAPI / JSON Schema</span>
              </div>
              <textarea
                value={jsonSchemaString}
                onChange={(e) => handleRawJsonChange(e.target.value)}
                rows={10}
                className="w-full p-2.5 rounded bg-[#161b22] border border-[#30363d] text-[10px] font-mono text-purple-200 focus:border-purple-500 focus:outline-none leading-relaxed selection:bg-purple-900 resize-y"
              />
              {jsonError && (
                <div className="text-[10px] text-rose-400 font-mono">
                  ⚠️ {jsonError}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* Disabled placeholder callout */
        <div 
          onClick={handleToggleEnable}
          className="p-3 bg-[#0d1117] rounded-lg border border-dashed border-[#30363d] hover:border-purple-500/50 cursor-pointer transition-colors flex items-center justify-between group"
        >
          <div className="flex items-center gap-2">
            <FileJson className="w-4 h-4 text-gray-500 group-hover:text-purple-400 transition-colors" />
            <div>
              <div className="text-xs font-semibold text-gray-400 group-hover:text-white">
                Unstructured Output (Freeform Text / Markdown)
              </div>
              <div className="text-[10px] text-gray-500">
                Click to enforce structured JSON Schema format for Gemini responses
              </div>
            </div>
          </div>
          <button
            type="button"
            className="px-2 py-1 rounded bg-[#161b22] text-purple-300 border border-purple-500/30 text-[10px] font-bold group-hover:bg-purple-600 group-hover:text-white transition-colors"
          >
            + Enable Schema
          </button>
        </div>
      )}
    </div>
  );
};
