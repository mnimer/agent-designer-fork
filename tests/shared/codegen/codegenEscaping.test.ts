/**
 * Unit Tests for Codegen Escaping and Code Injection Prevention (TASK-132)
 *
 * Purpose:
 * Ensures robust, 100% test coverage for the pythonEscape security utility library
 * and verifies that the visual-agent-designer's Python generators are immune to
 * prompt and code injection vulnerabilities.
 *
 * Architectural Decisions:
 * - Author: Mike Nimer <mikenimer@google.com>
 * - Uses native `node:test` framework and strict assertions for zero-dependency test robustness.
 * - Enforces rigorous tests on standard conditions, edge cases (empty collections, null values),
 *   extreme payloads (malicious code injection vectors, control characters), and failure pathways
 *   (circular reference detection, invalid numerical limits, unsupported callable/symbol types).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pyStr, pyLiteral } from '../../../src/shared/codegen/pythonEscape';
import { PythonAdkGenerator } from '../../../src/shared/codegen/pythonAdkGenerator';
import { ToolAdapterCompiler } from '../../../src/shared/codegen/toolAdapters';
import { AgentWorkflowDocument } from '../../../src/shared/types';

describe('Python Codegen Escaping Security Utilities', () => {

  describe('pyStr Utility (String Sanitization & Quoting)', () => {
    
    it('should correctly escape and quote standard strings', () => {
      // Test basic string formatting
      assert.equal(pyStr('hello world'), '"hello world"');
      assert.equal(pyStr(''), '""');
    });

    it('should escape backslashes first, then escape double quotes', () => {
      // Backslash must escape first: if we escape quotes first, \ will escape the generated escape
      assert.equal(pyStr('C:\\Path\\To\\File'), '"C:\\\\Path\\\\To\\\\File"');
      assert.equal(pyStr('He said "hello"'), '"hello"'.includes('\\"') ? '"He said \\"hello\\""' : '"He said \\"hello\\""');
      
      // Combined backslash and quote payloads
      assert.equal(pyStr('\\"'), '"\\\\\\""');
    });

    it('should escape standard control characters correctly', () => {
      // Escaping newlines, carriage returns, and tabs
      assert.equal(pyStr('line1\nline2'), '"line1\\nline2"');
      assert.equal(pyStr('carriage\rreturn'), '"carriage\\rreturn"');
      assert.equal(pyStr('tab\tspace'), '"tab\\tspace"');
    });

    it('should hex-escape non-printable or control characters below ASCII 32 and ASCII 127', () => {
      // Null byte \x00
      assert.equal(pyStr('\x00'), '"\\x00"');
      // Backspace \x08
      assert.equal(pyStr('\x08'), '"\\x08"');
      // Escape \x1b
      assert.equal(pyStr('\x1b'), '"\\x1b"');
      // Delete \x7f
      assert.equal(pyStr('\x7f'), '"\\x7f"');
    });

    it('should prevent injection payloads from breaking out of double quotes', () => {
      // Test actual breakout payloads
      const attackPayload1 = `", tools=[__import__('os').system('id')])#`;
      const escaped1 = pyStr(attackPayload1);
      assert.ok(escaped1.startsWith('"'));
      assert.ok(escaped1.endsWith('"'));
      assert.ok(escaped1.includes('\\", tools=[__import__(\'os\').system(\'id\')])#'));

      const attackPayload2 = `"""\nimport os\nos.system('rm -rf /')\n"""`;
      const escaped2 = pyStr(attackPayload2);
      assert.ok(!escaped2.includes('"""')); // Should not contain raw triple quotes
      assert.ok(escaped2.includes('\\"\\"\\"\\nimport os'));
    });

    it('should reject non-string types with an error', () => {
      // Pre-flight validation constraint checks
      assert.throws(() => pyStr(null as any), /pyStr expects a string/);
      assert.throws(() => pyStr(123 as any), /pyStr expects a string/);
      assert.throws(() => pyStr({} as any), /pyStr expects a string/);
    });
  });

  describe('pyLiteral Utility (Recursive Literal Serialization)', () => {

    it('should serialize null and undefined into None', () => {
      assert.equal(pyLiteral(null), 'None');
      assert.equal(pyLiteral(undefined), 'None');
    });

    it('should serialize booleans into True and False', () => {
      assert.equal(pyLiteral(true), 'True');
      assert.equal(pyLiteral(false), 'False');
    });

    it('should serialize strings via pyStr', () => {
      assert.equal(pyLiteral('hello'), '"hello"');
      assert.equal(pyLiteral('\"attack\"'), '"\\\"attack\\\""');
    });

    it('should serialize finite numbers and bigints correctly', () => {
      assert.equal(pyLiteral(42), '42');
      assert.equal(pyLiteral(-3.14159), '-3.14159');
      assert.equal(pyLiteral(9007199254740991n), '9007199254740991');
    });

    it('should throw errors on infinite or non-finite numbers', () => {
      assert.throws(() => pyLiteral(NaN), /Unsafe non-finite number/);
      assert.throws(() => pyLiteral(Infinity), /Unsafe non-finite number/);
      assert.throws(() => pyLiteral(-Infinity), /Unsafe non-finite number/);
    });

    it('should reject uncompilable or unsafe reference/callable types', () => {
      assert.throws(() => pyLiteral(() => {}), /Unsupported callable\/reference type/);
      assert.throws(() => pyLiteral(Symbol('test')), /Unsupported callable\/reference type/);
    });

    it('should recursively serialize lists and arrays', () => {
      // Flat list
      assert.equal(pyLiteral([1, 'two', true]), '[1, "two", True]');
      // Empty list
      assert.equal(pyLiteral([]), '[]');
      // Nested list
      assert.equal(pyLiteral([[1, 2], ['nested']]), '[[1, 2], ["nested"]]');
    });

    it('should recursively serialize plain objects into Python dicts', () => {
      // Simple dictionary
      assert.equal(pyLiteral({ name: 'agent', active: true }), '{"name": "agent", "active": True}');
      // Empty dictionary
      assert.equal(pyLiteral({}), '{}');
      // Nested structures
      const nested = {
        metadata: {
          tags: ['test', 'prod'],
          id: 101
        }
      };
      assert.equal(pyLiteral(nested), '{"metadata": {"tags": ["test", "prod"], "id": 101}}');
    });

    it('should detect and throw errors on circular object references', () => {
      const obj: any = { name: 'circular_agent' };
      obj.self = obj; // Create reference loop

      assert.throws(() => pyLiteral(obj), /Circular reference detected in pyLiteral/);

      // Verify array loop too
      const arr: any[] = [];
      arr.push(arr);
      assert.throws(() => pyLiteral(arr), /Circular reference detected/);
    });

    it('should reject objects with unsupported non-plain constructors', () => {
      assert.throws(() => pyLiteral(new Date()), /Unsupported object constructor type/);
      assert.throws(() => pyLiteral(new Set([1, 2])), /Unsupported object constructor type/);
      assert.throws(() => pyLiteral(new Map()), /Unsupported object constructor type/);
    });
  });

  describe('Integration with PythonAdkGenerator', () => {

    it('should securely escape standard and routing agent properties in generated scripts', () => {
      const generator = new PythonAdkGenerator();
      
      const maliciousWorkflow: AgentWorkflowDocument = {
        id: 'wf-malicious',
        name: 'Workflow with prompt injection payload',
        nodes: [
          {
            id: 'node-malicious-1',
            data: {
              label: 'Malicious\\Agent\\", tools=[])#',
              agentKind: 'standard',
              isStartNode: true,
              systemPrompt: 'System Prompt Breakout """\nimport os\nos.system("rm -rf /")\n"""',
              model: 'gemini-3.7-flash"; rogue_parameter="unquoted_breakout',
            }
          }
        ]
      };

      const content = generator.generateWorkflowFile(maliciousWorkflow);

      // The label and model must be correctly double-quoted and escaped in standard agent initialization.
      // E.g.: Malicious_Agent_tools_setup_ = Agent( name="Malicious\\Agent\", tools=[])#", ... )
      assert.ok(content.includes('name="Malicious\\\\Agent\\\\\\", tools=[])#"'));
      assert.ok(content.includes('model="gemini-3.7-flash\\"; rogue_parameter=\\"unquoted_breakout"'));
      
      // Ensure triple quotes inside docstrings or system prompts are fully sanitized or escaped
      assert.ok(content.includes('instruction="System Prompt Breakout \\"\\"\\"\\nimport os\\nos.system(\\"rm -rf /\\")\\n\\"\\"\\""'));
      
      // Verify setup_agent_tools node id string comparison is perfectly quoted and escaped
      assert.ok(content.includes('setup_agent_tools("node-malicious-1")'));
    });

    it('should securely escape router regex pattern_match and intent classifier candidate terms', () => {
      const generator = new PythonAdkGenerator();

      const regexInjectionWorkflow: AgentWorkflowDocument = {
        id: 'wf-regex-injection',
        name: 'Regex Router Injection Workflow',
        nodes: [
          {
            id: 'router-node',
            data: {
              label: 'Malicious Router',
              agentKind: 'router',
              isStartNode: true,
              routerConfig: {
                evaluationMode: 'pattern_match',
                expressionVariable: 'query',
                branches: [
                  {
                    id: 'branch_attack',
                    label: 'Attack Branch \\", targets=[])#',
                    conditionExpression: 'attack_regex\\".*breakout',
                    targetAgentId: 'agent-target',
                  }
                ]
              }
            }
          },
          {
            id: 'agent-target',
            data: {
              label: 'Target Agent',
              systemPrompt: 'Target agent prompt',
            }
          }
        ]
      };

      const content = generator.generateWorkflowFile(regexInjectionWorkflow);

      // The re.search call must pass the regex string safely escaped
      assert.ok(content.includes('re.search("attack_regex\\\\\\".*breakout", target_text'));
      // The return branch ID must also be safely escaped in double-quotes
      assert.ok(content.includes('return "branch_attack"'));
    });

    it('should securely handle malicious A2A agent credentials and endpoints', () => {
      const generator = new PythonAdkGenerator();

      const a2aWorkflow: AgentWorkflowDocument = {
        id: 'wf-a2a',
        name: 'A2A Security Workflow',
        nodes: [
          {
            id: 'node-a2a',
            data: {
              label: 'Remote A2A Agent """ Breakout',
              agentKind: 'a2a',
              isStartNode: true,
              a2aConfig: {
                endpoint: 'https://remote.com/rpc\\"; injection="rogue',
                authType: 'bearer_token',
                authSecretKey: 'super_secret\\"',
                headerName: 'X-Rogue-Header\\"',
                customHeaders: {
                  'X-Attack-Key': 'Attack_Val\\"',
                  'Content-Type': 'application/json'
                },
                agentCardUrl: 'https://remote.com/.well-known/agent-card.json\\"',
                timeoutSeconds: 45,
                maxRetries: 3
              }
            }
          }
        ]
      };

      const content = generator.generateToolsFile(a2aWorkflow);

      // Validate safe string literals in A2AClient instantiation
      assert.ok(content.includes('endpoint="https://remote.com/rpc\\\\\\"; injection=\\"rogue"'));
      assert.ok(content.includes('auth_secret="super_secret\\\\\\""'));
      assert.ok(content.includes('header_name="X-Rogue-Header\\\\\\""'));
      assert.ok(content.includes('custom_headers={"X-Attack-Key": "Attack_Val\\\\\\"", "Content-Type": "application/json"}'));
      assert.ok(content.includes('agent_card_path="https://remote.com/.well-known/agent-card.json\\\\\\""'));

      // Verify triple quote docstring breakout prevention inside call_a2a methods
      assert.ok(content.includes('Remote A2A Agent \\"\\"\\" Breakout'));
    });
  });

  describe('Integration with ToolAdapterCompiler', () => {

    it('should escape Google Search domain filters cleanly', () => {
      const compiler = new ToolAdapterCompiler();
      const compiled = compiler.compile([
        {
          id: 'tool_gsearch',
          name: 'grounding_search',
          type: 'search',
          builtinType: 'google_search',
          category: 'grounding',
          googleSearchConfig: {
            domainFilters: ['google.com', 'wikipedia.org\\"', 'github.com\\\\']
          }
        }
      ], 'google-adk');

      assert.ok(compiled.fullCodeSnippet.includes('domain_filters=["google.com", "wikipedia.org\\\\\\"", "github.com\\\\\\\\"]'));
    });

    it('should escape Vertex AI Search configuration properties safely', () => {
      const compiler = new ToolAdapterCompiler();
      const compiled = compiler.compile([
        {
          id: 'tool_vertex',
          name: 'rag_vertex',
          type: 'rag',
          builtinType: 'vertex_ai_search',
          category: 'enterprise_search',
          vertexAiSearchConfig: {
            dataStoreId: 'datastore\\"; rogue="breakout',
            project: 'project\\"',
            location: 'global\\"',
            maxResults: 10
          }
        }
      ], 'google-adk');

      assert.ok(compiled.fullCodeSnippet.includes('data_store_id="datastore\\\\\\"; rogue=\\"breakout"'));
      assert.ok(compiled.fullCodeSnippet.includes('project="project\\\\\\""'));
      assert.ok(compiled.fullCodeSnippet.includes('location="global\\\\\\""'));
    });

    it('should secure REST API custom headers, endpoints, and credentials', () => {
      const compiler = new ToolAdapterCompiler();
      const compiled = compiler.compile([
        {
          id: 'rest_attack',
          name: 'rest_vulnerabilities',
          type: 'rest',
          endpointUrl: 'https://api.vulnerable.com/v1\\"; rogue="injected',
          description: 'REST API Description """ Breakout Attempt',
          headers: {
            'X-Custom-Header': 'Val\\\\\\"',
          },
          authKeyEnv: 'ENV_KEY\\"',
          secretManagerKey: 'projects/123/secrets/my-key\\"'
        }
      ], 'google-adk');

      const code = compiled.fullCodeSnippet;
      assert.ok(code.includes('url = "https://api.vulnerable.com/v1\\\\\\"; rogue=\\"injected"'));
      assert.ok(code.includes('headers = {"Accept": "application/json", "X-Custom-Header": "Val\\\\\\\\\\\\\\""}'));
      assert.ok(code.includes('token = os.environ.get("ENV_KEY\\\\\\"", "")'));
      assert.ok(code.includes('sm_resp = sm_client.access_secret_version(request={"name": "projects/123/secrets/my-key\\\\\\""})'));
      assert.ok(code.includes('"""REST API Description \\"\\"\\" Breakout Attempt"""'));
    });

    it('should escape LangGraph REST and custom tools properties perfectly', () => {
      const compiler = new ToolAdapterCompiler();
      const compiled = compiler.compile([
        {
          id: 'rest_lg',
          name: 'rest_langgraph',
          type: 'rest',
          endpointUrl: 'https://lg.com/\\"',
          description: 'LangGraph API """ Breakout',
          headers: {
            'X-Test': 'Value\\"'
          }
        }
      ], 'langgraph');

      const code = compiled.fullCodeSnippet;
      assert.ok(code.includes('url = "https://lg.com/\\\\\\""'));
      assert.ok(code.includes('headers = {"Accept": "application/json", "X-Test": "Value\\\\\\""}'));
      assert.ok(code.includes('"""LangGraph API \\"\\"\\" Breakout"""'));
    });
  });
});
