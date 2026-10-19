/**
 * OpenApiToolsetModal.tsx - Modal for Configuring Google ADK OpenAPIToolset
 *
 * Purpose:
 * Renders an interactive modal dialog for inspecting, configuring, and parsing
 * OpenAPI v3 specifications (JSON/YAML) to generate or update OpenAPIToolset definitions:
 * 1. Spec Source: inline text, file path, or remote URL.
 * 2. Real-time Spec Parsing: Discovers operations, methods, paths, and operation IDs.
 * 3. Operation Filtering: Allows toggling specific endpoints to include in the toolset.
 * 4. Authentication Configuration: None, API Key (Header/Env), Bearer Token, OAuth2, or Service Account.
 * 5. Python Code Preview: Live preview of generated `from google.adk.tools...` instantiation.
 *
 * Architectural Decisions:
 * 1. 8pt Grid System: All padding, margins, and gaps adhere to 8px multiples.
 * 2. Fail-Safe Parsing: Gracefully displays parsing errors without crashing webview.
 * 3. Dual Mode: Works for creating new tool definitions or editing existing ones.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import React, { useState, useMemo } from 'react';
import {
  FileCode,
  Globe,
  FileText,
  Key,
  Check,
  X,
  Code,
  AlertCircle,
  Layers,
  ChevronRight,
} from 'lucide-react';
import { ToolDefinition, OpenApiToolsetConfig } from '../../types';
import {
  parseOpenApiSpecOperations,
  createOpenApiToolsetDefinition,
  generateOpenApiToolsetPythonCode,
} from '../../data/builtinToolsRegistry';

export interface OpenApiToolsetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (tool: ToolDefinition) => void;
  initialTool?: ToolDefinition | null;
}

const DEFAULT_SPEC = JSON.stringify(
  {
    openapi: '3.0.0',
    info: {
      title: 'Customer Inventory API',
      version: '1.0.0',
      description: 'API for querying store inventory and updating stock levels',
    },
    servers: [{ url: 'https://api.retail.example.com/v1' }],
    paths: {
      '/products': {
        get: {
          operationId: 'listProducts',
          summary: 'List available products in catalog',
          parameters: [
            {
              name: 'category',
              in: 'query',
              schema: { type: 'string' },
            },
          ],
        },
        post: {
          operationId: 'createProduct',
          summary: 'Add a new product to inventory',
        },
      },
      '/products/{id}': {
        get: {
          operationId: 'getProductById',
          summary: 'Retrieve product details by unique SKU or ID',
        },
      },
    },
  },
  null,
  2
);

export const OpenApiToolsetModal: React.FC<OpenApiToolsetModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialTool,
}) => {
  const existingConfig = initialTool?.openApiToolsetConfig;

  const [toolName, setToolName] = useState<string>(
    initialTool?.name || 'Inventory OpenAPI Toolset'
  );
  const [specSource, setSpecSource] = useState<'inline' | 'file' | 'url'>(
    existingConfig?.specSource || 'inline'
  );
  const [specContentOrUri, setSpecContentOrUri] = useState<string>(
    existingConfig?.specContentOrUri || DEFAULT_SPEC
  );
  const [specType, setSpecType] = useState<'json' | 'yaml'>(
    existingConfig?.specType || 'json'
  );
  const [authSchemeType, setAuthSchemeType] = useState<
    'none' | 'api_key' | 'bearer' | 'oauth2' | 'service_account'
  >(existingConfig?.authSchemeType || 'api_key');
  const [secretName, setSecretName] = useState<string>(
    existingConfig?.secretName || 'api-auth-secret'
  );
  const [envVar, setEnvVar] = useState<string>(
    existingConfig?.envVar || 'INVENTORY_API_KEY'
  );
  const [headerName, setHeaderName] = useState<string>(
    existingConfig?.headerName || 'X-API-Key'
  );
  const [selectedOperations, setSelectedOperations] = useState<string[]>(
    existingConfig?.selectedOperations || []
  );
  const [activeTab, setActiveTab] = useState<'spec' | 'auth' | 'operations' | 'preview'>('spec');

  // Parse OpenAPI spec dynamically when source is inline
  const parseResult = useMemo(() => {
    if (specSource === 'inline') {
      return parseOpenApiSpecOperations(specContentOrUri);
    }
    return { operations: [] };
  }, [specSource, specContentOrUri]);

  // Derived current configuration
  const currentConfig: OpenApiToolsetConfig = {
    specSource,
    specContentOrUri,
    specType,
    authSchemeType,
    secretName: authSchemeType !== 'none' ? secretName : undefined,
    envVar: authSchemeType !== 'none' ? envVar : undefined,
    headerName: authSchemeType === 'api_key' ? headerName : undefined,
    selectedOperations: selectedOperations.length > 0 ? selectedOperations : undefined,
  };

  const generatedPython = useMemo(() => {
    return generateOpenApiToolsetPythonCode(currentConfig);
  }, [currentConfig]);

  if (!isOpen) return null;

  const handleToggleOperation = (opId: string) => {
    if (selectedOperations.includes(opId)) {
      setSelectedOperations(selectedOperations.filter((id) => id !== opId));
    } else {
      setSelectedOperations([...selectedOperations, opId]);
    }
  };

  const handleSelectAllOperations = () => {
    setSelectedOperations(parseResult.operations.map((o) => o.operationId));
  };

  const handleClearOperations = () => {
    setSelectedOperations([]);
  };

  const handleSave = () => {
    const toolDef: ToolDefinition = initialTool
      ? {
          ...initialTool,
          name: toolName,
          builtinType: 'openapi_toolset',
          openApiToolsetConfig: currentConfig,
        }
      : createOpenApiToolsetDefinition(currentConfig, toolName);

    onSave(toolDef);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-750 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden text-slate-100">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <FileCode className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">
                {initialTool ? 'Edit OpenAPI Toolset' : 'Add Google ADK OpenAPI Toolset'}
              </h2>
              <p className="text-xs text-slate-400">
                Import OpenAPI v3 REST specifications into callable ADK tools with schema validation
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 px-6 gap-2 pt-2">
          <button
            onClick={() => setActiveTab('spec')}
            className={`px-4 py-2 text-xs font-medium rounded-t-lg transition-colors border-b-2 flex items-center gap-2 ${
              activeTab === 'spec'
                ? 'border-indigo-500 text-indigo-400 bg-slate-800/40'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            1. Specification
          </button>
          <button
            onClick={() => setActiveTab('auth')}
            className={`px-4 py-2 text-xs font-medium rounded-t-lg transition-colors border-b-2 flex items-center gap-2 ${
              activeTab === 'auth'
                ? 'border-indigo-500 text-indigo-400 bg-slate-800/40'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            2. Authentication
          </button>
          <button
            onClick={() => setActiveTab('operations')}
            className={`px-4 py-2 text-xs font-medium rounded-t-lg transition-colors border-b-2 flex items-center gap-2 ${
              activeTab === 'operations'
                ? 'border-indigo-500 text-indigo-400 bg-slate-800/40'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            3. Operations ({parseResult.operations.length})
          </button>
          <button
            onClick={() => setActiveTab('preview')}
            className={`px-4 py-2 text-xs font-medium rounded-t-lg transition-colors border-b-2 flex items-center gap-2 ${
              activeTab === 'preview'
                ? 'border-indigo-500 text-indigo-400 bg-slate-800/40'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            4. Python Code Preview
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Tool Name common field */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300">Toolset Name</label>
            <input
              type="text"
              value={toolName}
              onChange={(e) => setToolName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
              placeholder="e.g. Inventory OpenAPI Toolset"
            />
          </div>

          {/* TAB 1: SPECIFICATION */}
          {activeTab === 'spec' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300">Spec Source</label>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => setSpecSource('inline')}
                    className={`p-3 rounded-lg border text-left flex items-center gap-2 text-xs ${
                      specSource === 'inline'
                        ? 'border-indigo-500 bg-indigo-500/10 text-white'
                        : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <FileText className="w-4 h-4 text-indigo-400" />
                    <div>
                      <div className="font-semibold">Inline Spec</div>
                      <div className="text-[10px] text-slate-400">Paste JSON or YAML</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSpecSource('file')}
                    className={`p-3 rounded-lg border text-left flex items-center gap-2 text-xs ${
                      specSource === 'file'
                        ? 'border-indigo-500 bg-indigo-500/10 text-white'
                        : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <FileCode className="w-4 h-4 text-emerald-400" />
                    <div>
                      <div className="font-semibold">Local File</div>
                      <div className="text-[10px] text-slate-400">Relative repo path</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSpecSource('url')}
                    className={`p-3 rounded-lg border text-left flex items-center gap-2 text-xs ${
                      specSource === 'url'
                        ? 'border-indigo-500 bg-indigo-500/10 text-white'
                        : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <Globe className="w-4 h-4 text-sky-400" />
                    <div>
                      <div className="font-semibold">Remote URL</div>
                      <div className="text-[10px] text-slate-400">Hosted endpoint</div>
                    </div>
                  </button>
                </div>
              </div>

              {specSource === 'inline' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-300">
                      OpenAPI Specification (JSON / YAML)
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setSpecType('json')}
                        className={`px-2 py-1 text-[10px] rounded font-mono ${
                          specType === 'json'
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        JSON
                      </button>
                      <button
                        type="button"
                        onClick={() => setSpecType('yaml')}
                        className={`px-2 py-1 text-[10px] rounded font-mono ${
                          specType === 'yaml'
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        YAML
                      </button>
                    </div>
                  </div>
                  <textarea
                    rows={12}
                    value={specContentOrUri}
                    onChange={(e) => setSpecContentOrUri(e.target.value)}
                    className="w-full font-mono text-xs bg-slate-950 border border-slate-700 rounded-lg p-3 text-slate-200 focus:outline-none focus:border-indigo-500"
                    placeholder="Paste OpenAPI v3 specification..."
                  />
                  {parseResult.error && (
                    <div className="flex items-center gap-2 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 p-2 rounded-lg">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{parseResult.error}</span>
                    </div>
                  )}
                  {parseResult.title && (
                    <div className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 p-2 rounded-lg flex items-center justify-between">
                      <span>Parsed: <strong>{parseResult.title}</strong> (v{parseResult.version || '1.0'})</span>
                      <span>{parseResult.operations.length} endpoints found</span>
                    </div>
                  )}
                </div>
              )}

              {specSource === 'file' && (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300">Spec File Path</label>
                  <input
                    type="text"
                    value={specContentOrUri}
                    onChange={(e) => setSpecContentOrUri(e.target.value)}
                    className="w-full font-mono text-xs bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500"
                    placeholder="./openapi/service_spec.json"
                  />
                </div>
              )}

              {specSource === 'url' && (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300">Remote Spec URL</label>
                  <input
                    type="url"
                    value={specContentOrUri}
                    onChange={(e) => setSpecContentOrUri(e.target.value)}
                    className="w-full font-mono text-xs bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500"
                    placeholder="https://api.example.com/openapi.json"
                  />
                </div>
              )}
            </div>
          )}

          {/* TAB 2: AUTHENTICATION */}
          {activeTab === 'auth' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300">Authentication Scheme</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { id: 'none', label: 'None / Public' },
                    { id: 'api_key', label: 'API Key (Header / Query)' },
                    { id: 'bearer', label: 'Bearer Token / JWT' },
                    { id: 'oauth2', label: 'OAuth 2.0 Client' },
                    { id: 'service_account', label: 'GCP Service Account' },
                  ].map((auth) => (
                    <button
                      key={auth.id}
                      type="button"
                      onClick={() => setAuthSchemeType(auth.id as any)}
                      className={`p-3 rounded-lg border text-left text-xs font-medium ${
                        authSchemeType === auth.id
                          ? 'border-indigo-500 bg-indigo-500/10 text-white'
                          : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      {auth.label}
                    </button>
                  ))}
                </div>
              </div>

              {authSchemeType === 'api_key' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-300">Header Name</label>
                    <input
                      type="text"
                      value={headerName}
                      onChange={(e) => setHeaderName(e.target.value)}
                      className="w-full text-xs font-mono bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500"
                      placeholder="X-API-Key"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-300">Environment Variable</label>
                    <input
                      type="text"
                      value={envVar}
                      onChange={(e) => setEnvVar(e.target.value)}
                      className="w-full text-xs font-mono bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500"
                      placeholder="API_KEY_SECRET"
                    />
                  </div>
                </div>
              )}

              {authSchemeType === 'bearer' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-300">Secret Manager Name</label>
                    <input
                      type="text"
                      value={secretName}
                      onChange={(e) => setSecretName(e.target.value)}
                      className="w-full text-xs font-mono bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500"
                      placeholder="api-bearer-secret"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-300">Env Var Fallback</label>
                    <input
                      type="text"
                      value={envVar}
                      onChange={(e) => setEnvVar(e.target.value)}
                      className="w-full text-xs font-mono bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500"
                      placeholder="BEARER_TOKEN"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: OPERATIONS FILTER */}
          {activeTab === 'operations' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-slate-200">Discovered Operations</h3>
                  <p className="text-[11px] text-slate-400">
                    Select which endpoints are exposed as callable tools to the model (all included by default if none selected).
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSelectAllOperations}
                    className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={handleClearOperations}
                    className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded"
                  >
                    Include All (Default)
                  </button>
                </div>
              </div>

              {parseResult.operations.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-500 border border-dashed border-slate-800 rounded-lg">
                  No operations parsed yet. Paste an OpenAPI specification in the Specification tab.
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {parseResult.operations.map((op) => {
                    const isSelected = selectedOperations.includes(op.operationId);
                    return (
                      <div
                        key={op.operationId}
                        onClick={() => handleToggleOperation(op.operationId)}
                        className={`p-3 rounded-lg border flex items-center justify-between cursor-pointer transition-colors ${
                          isSelected
                            ? 'border-indigo-500 bg-indigo-500/10'
                            : 'border-slate-800 bg-slate-950/40 hover:border-slate-750'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`px-2 py-0.5 text-[10px] font-bold rounded font-mono ${
                              op.method === 'GET'
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : op.method === 'POST'
                                ? 'bg-sky-500/20 text-sky-400'
                                : op.method === 'PUT'
                                ? 'bg-amber-500/20 text-amber-400'
                                : 'bg-rose-500/20 text-rose-400'
                            }`}
                          >
                            {op.method}
                          </span>
                          <div>
                            <div className="text-xs font-semibold font-mono text-slate-200">
                              {op.operationId}
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono">
                              {op.path} {op.summary && `— ${op.summary}`}
                            </div>
                          </div>
                        </div>
                        <div
                          className={`w-4 h-4 rounded border flex items-center justify-center ${
                            isSelected
                              ? 'bg-indigo-600 border-indigo-600 text-white'
                              : 'border-slate-600'
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: CODE PREVIEW */}
          {activeTab === 'preview' && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300">
                Generated Google ADK Python Initialization
              </label>
              <pre className="p-4 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-indigo-300 overflow-x-auto whitespace-pre">
                {generatedPython}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/80 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            {selectedOperations.length > 0
              ? `${selectedOperations.length} of ${parseResult.operations.length} operations explicitly enabled`
              : 'All discovered operations active'}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-lg shadow-indigo-600/20 transition-colors flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              {initialTool ? 'Update Toolset' : 'Save Toolset'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
