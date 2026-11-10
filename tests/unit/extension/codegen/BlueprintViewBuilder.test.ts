/**
 * Unit Tests: BlueprintViewBuilder
 *
 * Author: Mike Nimer <mikenimer@google.com>
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { buildBlueprintJson, buildBlueprintView } from '../../../../src/extension/codegen/BlueprintViewBuilder';

const doc = {
  schemaVersion: '1',
  name: 'Demo',
  viewport: { x: 1, y: 2, zoom: 1 },
  metadata: { deploymentTarget: 'cloudrun' },
  nodes: [
    { id: 'trigger-1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Chat Trigger', name: 'Chat Trigger' } },
    { id: 'agent-1', type: 'agent', position: { x: 8, y: 16 }, selected: true, data: { label: 'Triage Specialist', model: 'gemini-3.8-flash' } },
  ],
  edges: [
    { id: 'e1', source: 'trigger-1', target: 'agent-1', sourceHandle: 'trigger_out_bottom', targetHandle: 'input', animated: true, style: { stroke: 'red' }, data: { kind: 'flow' } },
  ],
};

describe('buildBlueprintView', () => {
  it('drops canvas-only node and edge fields but keeps graph shape', () => {
    const view = buildBlueprintView(doc);
    expect(view.nodes[1]).not.toHaveProperty('position');
    expect(view.nodes[1]).not.toHaveProperty('selected');
    expect(view.edges[0]).toEqual({ id: 'e1', source: 'trigger-1', target: 'agent-1', data: { kind: 'flow' } });
    expect(view).not.toHaveProperty('viewport');
    expect(view.metadata).toEqual({ deploymentTarget: 'cloudrun' });
  });

  it('sanitizes agent names into Python identifiers but leaves triggers alone', () => {
    const view = buildBlueprintView(doc);
    expect(view.nodes[1].data.name).toMatch(/^[a-z_][a-z0-9_]*$/);
    expect(view.nodes[0].data.name).toBe('Chat Trigger');
  });

  it('does not mutate the input document', () => {
    const copy = JSON.parse(JSON.stringify(doc));
    buildBlueprintView(doc);
    expect(doc).toEqual(copy);
  });

  it('handles documents without nodes or edges', () => {
    expect(buildBlueprintView({ name: 'Empty' })).toEqual({ name: 'Empty', nodes: [], edges: [] });
  });

  it('fails fast without a document', () => {
    expect(() => buildBlueprintView(undefined as any)).toThrow(/workflow document is missing/);
  });
});

describe('buildBlueprintJson', () => {
  it('returns minified JSON', () => {
    const json = buildBlueprintJson(doc);
    expect(json).not.toContain('\n');
    expect(JSON.parse(json).name).toBe('Demo');
  });

  it('shrinks every bundled sample blueprint', () => {
    const samplesRoot = path.resolve(__dirname, '../../../../resource/samples');
    const agentFiles: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.agent')) agentFiles.push(full);
      }
    };
    walk(samplesRoot);
    expect(agentFiles.length).toBeGreaterThan(0);
    for (const file of agentFiles) {
      const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
      expect(buildBlueprintJson(raw).length).toBeLessThan(JSON.stringify(raw, null, 2).length);
    }
  });
});
