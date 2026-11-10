/**
 * Unit Tests: BlueprintFeatureDetector
 *
 * Author: Mike Nimer <mikenimer@google.com>
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { BLUEPRINT_FEATURES, KNOWN_BLUEPRINT_FEATURES, detectBlueprintFeatures } from '../../../../src/extension/codegen/BlueprintFeatureDetector';

const doc = (...data: any[]) => ({ nodes: data.map((d, i) => ({ id: `n${i}`, type: d.__type ?? 'agentNode', data: d })) });
const detect = (...data: any[]) => [...detectBlueprintFeatures(doc(...data))].sort();

describe('detectBlueprintFeatures', () => {
  it('detects nothing for a plain Gemini agent', () => {
    expect(detect({ agentKind: 'standard', model: 'gemini-3.8-flash', tools: [{ type: 'custom', id: 'lookup' }] })).toEqual([]);
  });

  it.each([
    [{ agentKind: 'a2a' }, 'a2a'],
    [{ agentType: 'a2a_agent' }, 'a2a'],
    [{ a2aConfig: { url: 'https://x' } }, 'a2a'],
    [{ a2uiConfig: { enabled: true } }, 'a2ui'],
    [{ tools: [{ type: 'mcp', id: 'bq' }] }, 'mcp'],
    [{ tools: [{ category: 'google_workspace_mcp' }] }, 'mcp'],
    [{ tools: ['workspace_mcp_gmail'] }, 'mcp'],
    [{ agentKind: 'guardrail' }, 'custom_agents'],
    [{ hitlConfig: { approvers: ['a'] } }, 'custom_agents'],
    [{ subAgentPattern: 'loop' }, 'multi_agent_patterns'],
    [{ debateConfig: { maxRounds: 2 } }, 'multi_agent_patterns'],
    [{ tools: [{ type: 'agent_as_tool' }] }, 'multi_agent_patterns'],
    [{ __type: 'triggerNode', triggerType: 'pubsub' }, 'event_triggers'],
    [{ __type: 'triggerNode', triggerKind: 'eventarc' }, 'event_triggers'],
    [{ callbacks: [{ hook: 'before_tool' }] }, 'callbacks_planners_skills'],
    [{ skills: [{ name: 's' }] }, 'callbacks_planners_skills'],
    [{ model: 'claude-opus-5-5' }, 'non_gemini_models'],
  ])('%j -> %s', (data, feature) => {
    expect(detect(data)).toContain(feature);
  });

  it('detects conditional routing alongside custom agents for routers', () => {
    expect(detect({ agentKind: 'router' })).toEqual(['conditional_routing', 'custom_agents']);
    expect(detect({ subAgentPattern: 'router' })).toEqual(['conditional_routing']);
  });

  it('ignores disabled or empty configuration', () => {
    expect(detect({ a2uiConfig: { enabled: false }, callbacks: [], skills: [], a2aConfig: {}, model: '  ' })).toEqual([]);
    expect(detect({ __type: 'triggerNode', triggerType: 'chat' }, { __type: 'triggerNode', triggerType: 'tester' })).toEqual([]);
  });

  it('handles missing or malformed documents and tools', () => {
    expect([...detectBlueprintFeatures({} as any)]).toEqual([]);
    expect([...detectBlueprintFeatures({ nodes: [null, { data: null }, { data: { tools: [null, 3] } }] } as any)]).toEqual([]);
  });

  it('exposes every feature id in KNOWN_BLUEPRINT_FEATURES', () => {
    expect([...KNOWN_BLUEPRINT_FEATURES].sort()).toEqual(Object.values(BLUEPRINT_FEATURES).sort());
  });

  it('detects expected features in the bundled samples', () => {
    const read = (rel: string) => JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../resource/samples', rel), 'utf-8'));
    expect([...detectBlueprintFeatures(read('sdlc/a2ui_kitchen_sink/a2ui_kitchen_sink.agent'))]).toContain('a2ui');
  });
});
