/**
 * Unit Tests for ADK Agent Skills Configuration & Progressive Disclosure (TASK-223)
 *
 * Validates:
 * 1. Progressive Disclosure L1 token estimation (~100 tokens, startup footprint).
 * 2. SKILL.md YAML frontmatter generation (generateSkillMdContent) and parsing (parseSkillMdFrontmatter).
 * 3. Dynamic Skill Factory mode configuration and runtime persistence flags.
 * 4. Progressive disclosure layers: L1 (metadata), L2 (instructions), L3 (references/scripts/assets).
 * 5. Extension host skills folder sync and inline skill file synthesis.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import {
  generateSkillMdContent,
  estimateSkillL1Tokens,
  parseSkillMdFrontmatter,
} from '../../../src/webview/components/inspector/SkillsSection';
import { AgentSkillDefinition, SkillFactoryConfig } from '../../../src/shared/types';
import { AgentEditorProvider } from '../../../src/extension/AgentEditorProvider';

describe('ADK Agent Skills & Progressive Disclosure (TASK-223)', () => {
  let tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      if (fs.existsSync(dir)) {
        try {
          fs.rmSync(dir, { recursive: true, force: true });
        } catch {
          // ignore cleanup errors
        }
      }
    }
    tempDirs = [];
  });

  // Section 1: SKILL.md Generation
  it('should generate valid SKILL.md content with YAML frontmatter and body', () => {
    const skill: AgentSkillDefinition = {
      id: 'skill_retail_pricing',
      name: 'retail_pricing',
      description: 'Calculates dynamic markdowns and elasticity curves.',
      sourceType: 'inline',
      instructionsMarkdown: '# Instructions\n\n1. Read inventory state.\n2. Apply margin floor.',
      enabled: true,
    };

    const skillMd = generateSkillMdContent(skill);
    assert.ok(skillMd.startsWith('---\nname: retail_pricing\ndescription: Calculates dynamic markdowns and elasticity curves.\n---'));
    assert.ok(skillMd.includes('# Instructions'));
    assert.ok(skillMd.includes('Apply margin floor.'));
  });

  it('should handle missing instructions gracefully in generateSkillMdContent', () => {
    const skill: AgentSkillDefinition = {
      id: 'skill_empty',
      name: 'minimal_skill',
      description: 'Minimal description',
      sourceType: 'inline',
    };

    const skillMd = generateSkillMdContent(skill);
    assert.ok(skillMd.includes('name: minimal_skill'));
    assert.ok(skillMd.includes('description: Minimal description'));
  });

  // Section 2: L1 Token Estimation
  it('should estimate L1 startup token footprint accurately', () => {
    const skill: AgentSkillDefinition = {
      id: 'skill_test',
      name: 'price_calculator',
      description: 'Calculates retail price discounts and margins.',
      sourceType: 'inline',
    };

    const tokens = estimateSkillL1Tokens(skill);
    // name length (16) + desc length (47) + 30 = 93 -> ceil(93/4) = 24 tokens
    assert.ok(tokens > 10 && tokens < 50);

    // Empty skill should return positive floor token count
    const emptySkill: AgentSkillDefinition = {
      id: 'skill_zero',
      name: '',
      description: '',
      sourceType: 'inline',
    };
    assert.ok(estimateSkillL1Tokens(emptySkill) >= 1);
  });

  // Section 3: SKILL.md Frontmatter Parsing
  it('should parse valid YAML frontmatter and separate markdown body', () => {
    const rawMd = `---
name: inventory_audit
description: Verifies shelf capacity and stock counts.
---

# Execution Steps
1. Query BigQuery table.
2. Flag discrepancies.`;

    const parsed = parseSkillMdFrontmatter(rawMd);
    assert.equal(parsed.name, 'inventory_audit');
    assert.equal(parsed.description, 'Verifies shelf capacity and stock counts.');
    assert.ok(parsed.body.includes('# Execution Steps'));
  });

  it('should parse quoted frontmatter attributes cleanly', () => {
    const rawMd = `---
name: "customer_support"
description: 'Handles returns and order status inquiry.'
---
Instructions text here.`;

    const parsed = parseSkillMdFrontmatter(rawMd);
    assert.equal(parsed.name, 'customer_support');
    assert.equal(parsed.description, 'Handles returns and order status inquiry.');
    assert.equal(parsed.body, 'Instructions text here.');
  });

  it('should fallback gracefully when no frontmatter exists', () => {
    const plainMarkdown = '# Just Markdown Body\nNo YAML header provided.';
    const parsed = parseSkillMdFrontmatter(plainMarkdown);
    assert.equal(parsed.name, undefined);
    assert.equal(parsed.description, undefined);
    assert.equal(parsed.body, plainMarkdown);
  });

  // Section 4: Progressive Disclosure Layers & Source Types
  it('should support L3 deep references, scripts, and assets in skill definition', () => {
    const skill: AgentSkillDefinition = {
      id: 'skill_complex',
      name: 'advanced_analytics',
      description: 'Performs statistical variance tests.',
      sourceType: 'inline',
      instructionsMarkdown: '# Run analysis',
      references: ['references/statistical_tables.md', 'references/schema.json'],
      scripts: ['scripts/calc_variance.py'],
      assets: ['assets/chart_template.svg'],
      enabled: true,
    };

    assert.equal(skill.references?.length, 2);
    assert.equal(skill.scripts?.length, 1);
    assert.equal(skill.assets?.length, 1);
    assert.equal(skill.sourceType, 'inline');
  });

  // Section 5: Dynamic Skill Factory Configuration
  it('should validate dynamic skill factory configuration flags', () => {
    const factoryConfig: SkillFactoryConfig = {
      enabled: true,
      outputDirectory: 'skills/runtime_generated/',
      allowRuntimePersist: true,
    };

    assert.equal(factoryConfig.enabled, true);
    assert.equal(factoryConfig.outputDirectory, 'skills/runtime_generated/');
    assert.equal(factoryConfig.allowRuntimePersist, true);
  });

  // Section 6: Extension Host Skills Folder Sync & Inline Synthesis
  it('should synthesize inline skills into skills/<skill.name>/SKILL.md upon copySampleSkillsFiles', async () => {
    const mockContext: any = {
      extensionPath: path.resolve(__dirname, '../../..'),
      subscriptions: [],
    };
    const provider = new AgentEditorProvider(mockContext);

    const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'target-skills-'));
    tempDirs.push(targetDir);

    const mockWorkflowDoc: any = {
      name: 'SkillTestWorkflow',
      nodes: [
        {
          id: 'agent_1',
          data: {
            label: 'Sales Agent',
            skills: [
              {
                id: 'skill_1',
                name: 'promo_pricing',
                description: 'Generates promotional discount packages.',
                sourceType: 'inline',
                instructionsMarkdown: '# Promo Rules\nApply 15% discount for members.',
                enabled: true,
              },
            ],
          },
        },
      ],
    };

    const copied = await provider.copySampleSkillsFiles(mockWorkflowDoc, undefined, targetDir);

    assert.ok(copied.some((f) => f.includes('promo_pricing') && f.includes('SKILL.md')));
    const expectedFile = path.join(targetDir, 'skills', 'promo_pricing', 'SKILL.md');
    assert.ok(fs.existsSync(expectedFile));
    const content = fs.readFileSync(expectedFile, 'utf-8');
    assert.ok(content.includes('name: promo_pricing'));
    assert.ok(content.includes('# Promo Rules'));
  });
});
