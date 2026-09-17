/**
 * Unit Tests for TASK-173: Travel Concierge Sample Workflow, Tools, Test Suite & Info Modal
 *
 * Purpose:
 * Validates the reverse-engineered `travel-concierge` ADK sample, including its React Flow
 * multi-agent topology, attached Test Suite node (>= 10 test cases), Python toolsets, README
 * discovery, and the Sample tab panel Information icon dialog.
 *
 * Architectural Decisions:
 * - Author: Mike Nimer <mikenimer@google.com>
 * - Verifies strict compliance with gemini-3.7-flash model rules.
 * - Tests simple conditions, extreme conditions (large README content, missing fields),
 *   and failure/fallback conditions.
 */

import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { createSampleNodesAndEdges } from '../../../src/webview/utils/sampleUtils';
import { AgentEditorProvider } from '../../../src/extension/AgentEditorProvider';
import { formatReadmeForModal } from '../../../src/webview/components/Canvas/SampleInfoModal';

describe('TASK-173: Travel Concierge Sample & Info Dialog Suite', () => {
  const projectRoot = path.resolve(__dirname, '../../..');

  const getDiscoveredTravelSample = () => {
    const mockContext: any = {
      extensionPath: projectRoot,
      subscriptions: [],
    };
    const provider = new AgentEditorProvider(mockContext);
    const discovered = provider.discoverResourceSamples();
    const travelSample = discovered.find(
      (s) => s.id === 'travel_concierge' || s.id === 'travel-concierge'
    );
    assert.ok(travelSample, 'discoverResourceSamples should discover travel-concierge sample from disk');
    return travelSample;
  };

  it('should discover travel_concierge dynamically from disk with gemini-3.7-flash and readmeContent', () => {
    const travelSample = getDiscoveredTravelSample();
    assert.equal(travelSample.category, 'Retail');
    assert.ok(
      travelSample.readmeContent && travelSample.readmeContent.includes('# Travel Concierge'),
      'travelSample must include readmeContent pulled dynamically from README.md'
    );

    // Verify all agent nodes use gemini-3.7-flash
    const agentNodes = travelSample.nodes.filter((n) => n.type === 'agentNode' || n.type === 'agent');
    assert.equal(agentNodes.length, 7, 'Expected 1 Root Agent + 6 Sub-Agents (7 agent nodes total)');
    for (const agent of agentNodes) {
      assert.equal(
        agent.data.model,
        'gemini-3.7-flash',
        `Agent ${agent.data.label} must use gemini-3.7-flash`
      );
    }
  });

  it('should attach a Test Suite node to the Root Agent with at least 10 test examples', () => {
    const travelSample = getDiscoveredTravelSample();
    const rootNode = travelSample.nodes.find(
      (n) => (n.type === 'agentNode' || n.type === 'agent') && n.data.isStartNode
    );
    assert.ok(rootNode, 'Root agent node with isStartNode=true must exist');

    const testerNode = travelSample.nodes.find(
      (n) =>
        (n.type === 'triggerNode' || n.type === 'trigger') &&
        (n.data.triggerType === 'tester' || n.data.triggerKind === 'tester')
    );
    assert.ok(testerNode, 'Test Suite trigger node (tester) must exist in diagram');

    // Verify edge connecting Test Suite node to Root Agent
    const testerEdge = travelSample.edges.find(
      (e) => e.source === testerNode.id && e.target === rootNode.id
    );
    assert.ok(testerEdge, 'Test Suite node must be attached to Root Agent via an edge');

    // Verify >= 10 test scenarios on the Test Suite node
    const scenarios =
      testerNode.data.config?.testScenarios || testerNode.data.config?.testPrompts || [];
    assert.ok(
      scenarios.length >= 10,
      `Expected at least 10 test examples attached to Test Suite node, got ${scenarios.length}`
    );

    // Verify sample-level testPrompts also has >= 10 examples
    assert.ok(
      travelSample.testPrompts && travelSample.testPrompts.length >= 10,
      'travelSample.testPrompts must contain at least 10 test examples'
    );
  });

  it('should have physical .agent, README.md, and Python tools files in resource/samples/travel-concierge/', () => {
    const sampleDir = path.join(projectRoot, 'resource', 'samples', 'travel-concierge');
    const agentFile = path.join(sampleDir, 'travel-concierge.agent');
    const readmeFile = path.join(sampleDir, 'README.md');
    const toolsDir = path.join(sampleDir, 'tools');

    assert.ok(fs.existsSync(agentFile), 'travel-concierge.agent file must exist on disk');
    assert.ok(fs.existsSync(readmeFile), 'README.md file must exist on disk');
    assert.ok(fs.existsSync(toolsDir), 'tools/ directory must exist on disk');

    // Validate JSON schema of .agent file
    const parsed = JSON.parse(fs.readFileSync(agentFile, 'utf-8'));
    assert.equal(parsed.name, 'TravelConcierge');
    assert.ok(Array.isArray(parsed.nodes) && parsed.nodes.length >= 8);
    assert.ok(Array.isArray(parsed.edges) && parsed.edges.length >= 7);

    // Check required Python tool files
    const expectedToolFiles = [
      '__init__.py',
      'memory_toolset.py',
      'places_toolset.py',
      'planning_toolset.py',
      'booking_toolset.py',
      'intrip_toolset.py',
    ];
    for (const tf of expectedToolFiles) {
      assert.ok(
        fs.existsSync(path.join(toolsDir, tf)),
        `Expected tool file ${tf} in resource/samples/travel-concierge/tools/`
      );
    }
  });

  it('should discover travel_concierge and populate readmeContent via AgentEditorProvider.discoverResourceSamples()', () => {
    const mockContext: any = {
      extensionPath: projectRoot,
      subscriptions: [],
    };
    const provider = new AgentEditorProvider(mockContext);
    const discovered = provider.discoverResourceSamples();
    assert.strictEqual(
      discovered.length,
      2,
      `discoverResourceSamples should discover exactly 2 samples from resource/samples on disk but found ${discovered.length}: ${discovered.map((s) => s.id).join(', ')}`
    );
    const travelSample = discovered.find(
      (s) => s.id === 'travel_concierge' || s.id === 'travel-concierge'
    );
    assert.ok(travelSample, 'discoverResourceSamples should discover travel-concierge sample');
    assert.ok(
      travelSample.readmeContent && travelSample.readmeContent.includes('Travel Concierge'),
      'discoverResourceSamples should populate readmeContent from README.md'
    );
    assert.ok(
      travelSample.testPrompts && travelSample.testPrompts.length >= 10,
      'Discovered sample should extract >= 10 testPrompts'
    );
  });

  it('should remap targetRootAgentId and all nodes/edges cleanly in createSampleNodesAndEdges', () => {
    const travelSample = getDiscoveredTravelSample();
    const { nodes, edges } = createSampleNodesAndEdges(travelSample, 120, 120, []);
    assert.equal(nodes.length, travelSample.nodes.length);
    assert.equal(edges.length, travelSample.edges.length);

    const remappedRoot = nodes.find((n) => (n.data as any).isStartNode);
    const remappedTester = nodes.find((n) => (n.data as any).triggerType === 'tester');
    assert.ok(remappedRoot && remappedTester, 'Remapped root and tester nodes should exist');
    assert.equal(
      (remappedTester.data as any).targetRootAgentId,
      remappedRoot.id,
      'Tester trigger targetRootAgentId should be remapped to new root agent ID'
    );
  });

  it('should handle simple, extreme, and fallback conditions in formatReadmeForModal', () => {
    // Simple condition: normal markdown
    const simple = formatReadmeForModal('# Title\n\nDescription text', 'Fallback desc');
    assert.ok(simple.title === 'Title' || simple.content.includes('Description text'));
    assert.ok(simple.overview.includes('Description text'), 'Overview should capture description text');

    // Overview heading extraction: # Title \n\n Intro \n\n ## Overview \n\n Overview details
    const withOverviewHeading = formatReadmeForModal(
      '# Travel App\n\nIntro paragraph.\n\n## Overview\n\nDetailed breakdown of travel experience.\n\n## Tools\n\nTool descriptions.',
      'Fallback'
    );
    assert.ok(withOverviewHeading.overview.includes('Intro paragraph.'));
    assert.ok(withOverviewHeading.overview.includes('Detailed breakdown of travel experience.'));
    assert.ok(!withOverviewHeading.sections.some((s) => s.heading?.toLowerCase() === 'overview'));

    // Extreme condition: very long README content (> 50KB)
    const hugeReadme = '# Extreme Title\n' + 'Section content line\n'.repeat(3000);
    const extreme = formatReadmeForModal(hugeReadme, 'Fallback desc');
    assert.ok(extreme.content.length > 0, 'Should handle large README content without crashing');

    // Failure/Fallback condition: undefined or empty readmeContent
    const fallback = formatReadmeForModal(undefined, 'Default sample description fallback');
    assert.equal(fallback.content, 'Default sample description fallback');
    assert.equal(fallback.overview, 'Default sample description fallback');
  });

  it('should execute all Python toolset unit tests with 100% pass rate', () => {
    const { spawnSync } = require('child_process');
    const res = spawnSync(
      'python3',
      ['-m', 'unittest', 'discover', '-s', 'resource/samples/travel-concierge/tests', '-v'],
      { cwd: projectRoot, encoding: 'utf-8' }
    );
    assert.equal(res.status, 0, 'Python unittest process should exit with status 0');
    const combined = `${res.stdout || ''}\n${res.stderr || ''}`;
    assert.ok(combined.includes('OK'), 'Python toolset unit tests must report OK');
  });

  it('should attach all 6 child sub-agents to Root Agent via output -> input handles with #3b82f6 blue stroke', () => {
    const rootId = 'node-agent-travel-root';
    const childIds = [
      'node-agent-inspiration',
      'node-agent-planning',
      'node-agent-booking',
      'node-agent-pretrip',
      'node-agent-intrip',
      'node-agent-posttrip',
    ];

    const travelSample = getDiscoveredTravelSample();
    // Check discovered sample definition
    for (const childId of childIds) {
      const edge = travelSample.edges.find(
        (e) => e.source === rootId && e.target === childId
      );
      assert.ok(edge, `Missing edge from Root Agent to ${childId} in discovered travelSample`);
      assert.equal(
        edge.sourceHandle,
        'output',
        `Edge to ${childId} must use sourceHandle 'output'`
      );
      assert.equal(edge.targetHandle, 'input', `Edge to ${childId} must use targetHandle 'input'`);
      assert.equal(
        edge.style?.stroke,
        '#3b82f6',
        `Edge to ${childId} must use canonical sub-agent delegation blue '#3b82f6'`
      );
    }

    // Check physical .agent file on disk
    const agentFile = path.join(
      projectRoot,
      'resource',
      'samples',
      'travel-concierge',
      'travel-concierge.agent'
    );
    const parsed = JSON.parse(fs.readFileSync(agentFile, 'utf-8'));
    for (const childId of childIds) {
      const edge = parsed.edges.find((e: any) => e.source === rootId && e.target === childId);
      assert.ok(edge, `Missing edge from Root Agent to ${childId} in travel-concierge.agent`);
      assert.equal(edge.sourceHandle, 'output');
      assert.equal(edge.targetHandle, 'input');
      assert.equal(edge.style?.stroke, '#3b82f6');
    }
  });
});
