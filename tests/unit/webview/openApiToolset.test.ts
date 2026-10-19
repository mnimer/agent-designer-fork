/**
 * Unit Tests for ADK OpenAPIToolset Integration (TASK-227)
 *
 * Validates:
 * 1. OpenAPI v3 JSON spec parsing (title, version, operations, methods, paths, operationId).
 * 2. OpenAPI v3 YAML spec parsing with fallback parser.
 * 3. Empty and invalid spec error handling.
 * 4. Factory helper `createOpenApiToolsetDefinition`.
 * 5. Python code generation for inline, file, and URL spec sources with API key & Bearer token auth.
 * 6. Selected operations filter in Python code generation.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseOpenApiSpecOperations,
  createOpenApiToolsetDefinition,
  generateOpenApiToolsetPythonCode,
} from '../../../src/webview/data/builtinToolsRegistry';
import { OpenApiToolsetConfig } from '../../../src/shared/agentSpec';

describe('TASK-227: ADK OpenAPIToolset Integration', () => {
  const sampleJsonSpec = JSON.stringify({
    openapi: '3.0.0',
    info: {
      title: 'Store Inventory API',
      version: '2.1.0',
    },
    servers: [{ url: 'https://api.store.example.com/v2' }],
    paths: {
      '/items': {
        get: {
          operationId: 'listItems',
          summary: 'List inventory items',
        },
        post: {
          operationId: 'createItem',
          summary: 'Add an inventory item',
        },
      },
      '/items/{id}': {
        get: {
          operationId: 'getItemById',
          summary: 'Fetch item details',
        },
        delete: {
          operationId: 'deleteItem',
          summary: 'Delete inventory item',
        },
      },
    },
  });

  const sampleYamlSpec = `
openapi: 3.0.0
info:
  title: PetStore Service
  version: 1.0.0
servers:
  - url: https://petstore.swagger.io/v2
paths:
  /pets:
    get:
      operationId: findPets
      summary: Finds all pets
    post:
      operationId: addPet
      summary: Add a pet
  /pets/{id}:
    get:
      operationId: getPetById
      summary: Find pet by ID
`;

  it('should parse OpenAPI JSON spec and extract all operations and server URL', () => {
    const result = parseOpenApiSpecOperations(sampleJsonSpec);
    assert.equal(result.title, 'Store Inventory API');
    assert.equal(result.version, '2.1.0');
    assert.equal(result.serverUrl, 'https://api.store.example.com/v2');
    assert.equal(result.error, undefined);
    assert.equal(result.operations.length, 4);

    const opIds = result.operations.map((o) => o.operationId);
    assert.ok(opIds.includes('listItems'));
    assert.ok(opIds.includes('createItem'));
    assert.ok(opIds.includes('getItemById'));
    assert.ok(opIds.includes('deleteItem'));

    const listOp = result.operations.find((o) => o.operationId === 'listItems')!;
    assert.equal(listOp.method, 'GET');
    assert.equal(listOp.path, '/items');
    assert.equal(listOp.summary, 'List inventory items');
  });

  it('should parse OpenAPI YAML spec and extract discovered endpoints', () => {
    const result = parseOpenApiSpecOperations(sampleYamlSpec);
    assert.equal(result.title, 'PetStore Service');
    assert.equal(result.version, '1.0.0');
    assert.equal(result.error, undefined);
    assert.ok(result.operations.length >= 3);

    const opIds = result.operations.map((o) => o.operationId);
    assert.ok(opIds.includes('findPets'));
    assert.ok(opIds.includes('addPet'));
    assert.ok(opIds.includes('getPetById'));
  });

  it('should handle empty or malformed specifications gracefully', () => {
    const emptyResult = parseOpenApiSpecOperations('');
    assert.ok(emptyResult.error);
    assert.equal(emptyResult.operations.length, 0);

    const malformedJson = '{ "openapi": 3.0.0, invalid }';
    const badJsonResult = parseOpenApiSpecOperations(malformedJson);
    assert.ok(badJsonResult.error?.includes('JSON Parse error'));
  });

  it('should create an OpenAPIToolset ToolDefinition with createOpenApiToolsetDefinition()', () => {
    const config: OpenApiToolsetConfig = {
      specSource: 'inline',
      specContentOrUri: sampleJsonSpec,
      specType: 'json',
      authSchemeType: 'api_key',
      envVar: 'STORE_API_KEY',
      headerName: 'X-Store-Key',
      selectedOperations: ['listItems', 'getItemById'],
    };

    const toolDef = createOpenApiToolsetDefinition(config, 'Store Toolset');
    assert.ok(toolDef.id.startsWith('builtin_openapi_'));
    assert.equal(toolDef.name, 'Store Toolset');
    assert.equal(toolDef.builtinType, 'openapi_toolset');
    assert.equal(toolDef.category, 'api');
    assert.equal(toolDef.type, 'api');
    assert.ok(toolDef.openApiToolsetConfig);
    assert.equal(toolDef.openApiToolsetConfig.authSchemeType, 'api_key');
    assert.deepEqual(toolDef.openApiToolsetConfig.selectedOperations, ['listItems', 'getItemById']);
  });

  it('should generate valid Python ADK initialization code for inline spec with API key auth', () => {
    const config: OpenApiToolsetConfig = {
      specSource: 'inline',
      specContentOrUri: '{"openapi": "3.0.0"}',
      specType: 'json',
      authSchemeType: 'api_key',
      envVar: 'MY_API_KEY',
      headerName: 'X-API-Key',
      selectedOperations: ['getOrders'],
    };

    const code = generateOpenApiToolsetPythonCode(config);
    assert.ok(code.includes('from google.adk.tools.openapi_tool.openapi_spec_parser.openapi_toolset import OpenAPIToolset'));
    assert.ok(code.includes('SPEC_CONTENT = """{"openapi": "3.0.0"}"""'));
    assert.ok(code.includes('api_key=os.environ.get("MY_API_KEY")'));
    assert.ok(code.includes('api_key_header="X-API-Key"'));
    assert.ok(code.includes('selected_operations=["getOrders"]'));
  });

  it('should generate valid Python ADK initialization code for file spec with Bearer token auth', () => {
    const config: OpenApiToolsetConfig = {
      specSource: 'file',
      specContentOrUri: './specs/petstore.yaml',
      specType: 'yaml',
      authSchemeType: 'bearer',
      secretName: 'petstore-bearer-token',
    };

    const code = generateOpenApiToolsetPythonCode(config);
    assert.ok(code.includes('spec_file_path="./specs/petstore.yaml"'));
    assert.ok(code.includes('bearer_token=load_secret("petstore-bearer-token")'));
  });

  it('should generate valid Python ADK initialization code for remote URL spec without auth', () => {
    const config: OpenApiToolsetConfig = {
      specSource: 'url',
      specContentOrUri: 'https://api.example.com/openapi.json',
      specType: 'json',
      authSchemeType: 'none',
    };

    const code = generateOpenApiToolsetPythonCode(config);
    assert.ok(code.includes('spec_url="https://api.example.com/openapi.json"'));
    assert.ok(!code.includes('api_key'));
    assert.ok(!code.includes('bearer_token'));
  });
});
