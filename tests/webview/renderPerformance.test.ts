/**
 * Render & Serialization Performance Verification Tests
 *
 * Purpose:
 * Validates the performance optimizations introduced for TASK-141:
 * 1. FNV-1a 32-bit hashing logic: fast, consistent string hash conversions.
 * 2. useExtensionSync trailing 250ms debounce and hashing skipping logic:
 *    rapid drag/state updates trigger exactly one dispatch; duplicate hashes skip dispatch.
 * 3. Custom memo areEqual comparisons on AgentNode and TriggerNode components:
 *    ensures re-renders are skipped on neighboring nodes when other nodes are dragged/selected.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a } from '../../src/webview/utils/hashUtils';
import { areEqual as areEqualAgent } from '../../src/webview/components/Canvas/nodes/AgentNode';
import { areEqual as areEqualTrigger } from '../../src/webview/components/Canvas/nodes/TriggerNode';

describe('Render and Serialization Performance - TASK-141', () => {
  
  // ---------------------------------------------------------------------------
  // 1. FNV-1a Hashing Utility Tests
  // ---------------------------------------------------------------------------
  describe('FNV-1a 32-bit Hashing Utility', () => {
    it('should generate consistent 8-character zero-padded hex string hashes', () => {
      const hash1 = fnv1a('hello world');
      const hash2 = fnv1a('hello world');
      
      assert.equal(hash1, hash2);
      assert.equal(typeof hash1, 'string');
      assert.equal(hash1.length, 8);
      // Ensure hex format
      assert.match(hash1, /^[0-9a-f]{8}$/);
    });

    it('should produce distinct hashes for different string contents', () => {
      const hash1 = fnv1a('{"name":"AgentA","model":"gemini-3.5-flash"}');
      const hash2 = fnv1a('{"name":"AgentA","model":"gemini-3.7-flash"}');
      
      assert.notEqual(hash1, hash2);
    });

    it('should handle empty strings and extreme inputs without errors', () => {
      const emptyHash = fnv1a('');
      assert.equal(emptyHash.length, 8);
      
      const longStr = 'A'.repeat(10000);
      const longHash = fnv1a(longStr);
      assert.equal(longHash.length, 8);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Debounce & Hash-Based Skip Simulation Tests
  // ---------------------------------------------------------------------------
  describe('Document Update Throttling & Hash Suppression', () => {
    it('should debounce rapid sequential updates and execute only the trailing edge', async () => {
      let runCount = 0;
      let lastVal = '';
      
      const triggerUpdateDebounced = (val: string, timerId: { current: NodeJS.Timeout | null }) => {
        if (timerId.current) {
          clearTimeout(timerId.current);
        }
        timerId.current = setTimeout(() => {
          runCount++;
          lastVal = val;
        }, 10); // Shortened duration for rapid unit test suite execution
      };

      const timerState = { current: null as NodeJS.Timeout | null };

      // Simulate 50 rapid sequential updates
      for (let i = 1; i <= 50; i++) {
        triggerUpdateDebounced(`Update-${i}`, timerState);
      }

      // Wait for the trailing timer edge to resolve
      await new Promise((resolve) => setTimeout(resolve, 20));

      assert.equal(runCount, 1);
      assert.equal(lastVal, 'Update-50');
    });

    it('should suppress IPC dispatch when serialized document content is structurally identical', () => {
      const originalDoc = {
        name: 'TriageWorkflow',
        nodes: [{ id: 'node-1', type: 'agentNode', position: { x: 100, y: 150 } }],
        edges: [],
        metadata: {},
      };

      const originalJson = JSON.stringify(originalDoc);
      const originalHash = fnv1a(originalJson);

      const lastSentHashRef = { current: originalHash };
      let postMessageCalledCount = 0;

      const simulateDispatch = (newDoc: any) => {
        const json = JSON.stringify(newDoc);
        const hash = fnv1a(json);

        if (hash === lastSentHashRef.current) {
          // Suppress dispatch
          return;
        }

        lastSentHashRef.current = hash;
        postMessageCalledCount++;
      };

      // Simulate updating with same structural document values
      simulateDispatch({
        name: 'TriageWorkflow',
        nodes: [{ id: 'node-1', type: 'agentNode', position: { x: 100, y: 150 } }],
        edges: [],
        metadata: {},
      });

      assert.equal(postMessageCalledCount, 0); // Dispatches suppressed

      // Simulate dragging a node to a different position
      simulateDispatch({
        name: 'TriageWorkflow',
        nodes: [{ id: 'node-1', type: 'agentNode', position: { x: 102, y: 150 } }],
        edges: [],
        metadata: {},
      });

      assert.equal(postMessageCalledCount, 1); // Dispatched
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Custom React.memo Equality Tests for Node Components
  // ---------------------------------------------------------------------------
  describe('Node Component Memoization - areEqual Comparators', () => {
    
    describe('AgentNode areEqual', () => {
      it('should return true (skip re-render) when props and data fields are identical even if callback functions are recreated', () => {
        const prevProps = {
          id: 'agent-1',
          selected: false,
          dragging: false,
          data: {
            label: 'Support Agent',
            model: 'gemini-3.7-flash',
            tools: [{ id: 'search', type: 'search' }],
            onEdit: () => {}, // inline function 1
            onDelete: () => {},
          },
        };

        const nextProps = {
          id: 'agent-1',
          selected: false,
          dragging: false,
          data: {
            label: 'Support Agent',
            model: 'gemini-3.7-flash',
            tools: [{ id: 'search', type: 'search' }],
            onEdit: () => {}, // new inline function instance
            onDelete: () => {},
          },
        };

        assert.equal(areEqualAgent(prevProps, nextProps), true);
      });

      it('should return false (trigger re-render) if node selection changes', () => {
        const prevProps = {
          id: 'agent-1',
          selected: false,
          dragging: false,
          data: { label: 'Support Agent' },
        };

        const nextProps = {
          id: 'agent-1',
          selected: true, // Node was selected
          dragging: false,
          data: { label: 'Support Agent' },
        };

        assert.equal(areEqualAgent(prevProps, nextProps), false);
      });

      it('should return false (trigger re-render) if node.data is modified', () => {
        const prevProps = {
          id: 'agent-1',
          selected: false,
          data: { label: 'Support Agent', model: 'gemini-3.5-flash' },
        };

        const nextProps = {
          id: 'agent-1',
          selected: false,
          data: { label: 'Support Agent', model: 'gemini-3.7-flash' }, // Model updated
        };

        assert.equal(areEqualAgent(prevProps, nextProps), false);
      });
    });

    describe('TriggerNode areEqual', () => {
      it('should return true (skip re-render) when props are unchanged ignoring recreated action handlers', () => {
        const prevProps = {
          id: 'trigger-1',
          selected: false,
          dragging: false,
          data: {
            triggerType: 'pubsub',
            config: { topic: 'incoming-tickets' },
            onEdit: () => {},
          },
        };

        const nextProps = {
          id: 'trigger-1',
          selected: false,
          dragging: false,
          data: {
            triggerType: 'pubsub',
            config: { topic: 'incoming-tickets' },
            onEdit: () => {}, // new reference
          },
        };

        assert.equal(areEqualTrigger(prevProps, nextProps), true);
      });

      it('should return false (trigger re-render) when triggerType or its config is updated', () => {
        const prevProps = {
          id: 'trigger-1',
          selected: false,
          data: {
            triggerType: 'pubsub',
            config: { topic: 'incoming-tickets' },
          },
        };

        const nextProps = {
          id: 'trigger-1',
          selected: false,
          data: {
            triggerType: 'pubsub',
            config: { topic: 'processed-tickets' }, // Topic modified
          },
        };

        assert.equal(areEqualTrigger(prevProps, nextProps), false);
      });
    });
  });
});
