/**
 * SkillsSection - ADK Agent Skills Inspector Configuration Panel (TASK-223)
 *
 * Purpose:
 * Implements the official ADK Agent Skills configuration UI (https://adk.dev/skills/,
 * google.adk.tools.skill_toolset.SkillToolset) following the Progressive Disclosure model:
 * - L1: Startup Metadata (~100 tokens, name & description from SKILL.md YAML frontmatter)
 * - L2: On-Demand Instructions (Full SKILL.md markdown instructions loaded dynamically)
 * - L3: Deep References & Scripts (Supporting files in references/, scripts/, assets/)
 *
 * Also provides configuration for the Dynamic Skill Factory Mode, allowing agents
 * to author and persist new SKILL.md files at runtime.
 *
 * Architectural Decisions:
 * - 8pt grid system for spacing and responsive UI layout.
 * - Three source types: 'inline', 'workspace_dir', and 'external_repo'.
 * - Helper functions generateSkillMdContent, estimateSkillL1Tokens, and parseSkillMdFrontmatter
 *   provide deterministic SKILL.md formatting and token accounting.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import React, { useState } from 'react';
import {
  BookOpen,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  FileCode,
  Folder,
  Globe,
  Eye,
  Info,
  Sparkles,
  Zap,
  CheckCircle2,
  XCircle,
  Copy,
  Check
} from 'lucide-react';
import {
  AgentSkillDefinition,
  SkillFactoryConfig,
  SkillSourceType
} from '../../../shared/types';

/**
 * Generates a valid SKILL.md markdown document with YAML frontmatter.
 *
 * @param skill The agent skill definition to format into SKILL.md
 * @returns Formatted SKILL.md string
 */
export function generateSkillMdContent(skill: AgentSkillDefinition): string {
  const name = skill.name ? skill.name.trim() : 'unnamed-skill';
  const description = skill.description ? skill.description.trim() : '';
  const body = skill.instructionsMarkdown ? skill.instructionsMarkdown.trim() : '';

  return `---
name: ${name}
description: ${description}
---

${body}`.trim();
}

/**
 * Estimates L1 startup token footprint for an AgentSkillDefinition.
 * Follows ~ceil((name_length + desc_length + 30) / 4).
 *
 * @param skill The skill definition to estimate
 * @returns Estimated token count
 */
export function estimateSkillL1Tokens(skill: AgentSkillDefinition): number {
  const nameLen = skill.name?.length || 0;
  const descLen = skill.description?.length || 0;
  return Math.max(1, Math.ceil((nameLen + descLen + 30) / 4));
}

/**
 * Parses a SKILL.md document to extract YAML frontmatter name/description and markdown body.
 *
 * @param markdown Raw SKILL.md content
 * @returns Parsed frontmatter and markdown body
 */
export function parseSkillMdFrontmatter(markdown: string): { name?: string; description?: string; body: string } {
  if (!markdown) {
    return { body: '' };
  }

  // Regex to extract YAML frontmatter enclosed by triple hyphens
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { body: markdown.trim() };
  }

  const frontmatter = match[1];
  const body = match[2].trim();
  let name: string | undefined;
  let description: string | undefined;

  for (const line of frontmatter.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      const val = line.slice(colonIdx + 1).trim().replace(/^['"]|['"]$/g, '');
      if (key === 'name') {
        name = val;
      } else if (key === 'description') {
        description = val;
      }
    }
  }

  return { name, description, body };
}

/**
 * Props for the SkillsSection inspector component
 */
export interface SkillsSectionProps {
  skills?: AgentSkillDefinition[];
  skillFactoryConfig?: SkillFactoryConfig;
  onUpdateSkills: (skills: AgentSkillDefinition[]) => void;
  onUpdateSkillFactory?: (config: SkillFactoryConfig) => void;
}

/**
 * SkillsSection component renders inspector controls for managing ADK Agent Skills
 * and Dynamic Skill Factory configuration.
 */
export const SkillsSection: React.FC<SkillsSectionProps> = ({
  skills = [],
  skillFactoryConfig,
  onUpdateSkills,
  onUpdateSkillFactory,
}) => {
  // Section 1: Local state for UI expansion and previews
  const [expandedSkillId, setExpandedSkillId] = useState<string | null>(skills[0]?.id || null);
  const [previewSkillId, setPreviewSkillId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Section 2: Handlers for skill mutations
  const handleAddSkill = () => {
    const newId = `skill_${Date.now()}`;
    const newSkill: AgentSkillDefinition = {
      id: newId,
      name: 'new_skill',
      description: 'Provides specialized instructions for domain tasks.',
      sourceType: 'inline',
      instructionsMarkdown: '# Instructions\n\n1. Analyze input parameters\n2. Execute workflow\n',
      references: [],
      scripts: [],
      assets: [],
      enabled: true,
    };
    onUpdateSkills([...skills, newSkill]);
    setExpandedSkillId(newId);
  };

  const handleUpdateSkill = (id: string, updates: Partial<AgentSkillDefinition>) => {
    const updated = skills.map((s) => (s.id === id ? { ...s, ...updates } : s));
    onUpdateSkills(updated);
  };

  const handleRemoveSkill = (id: string) => {
    const updated = skills.filter((s) => s.id !== id);
    onUpdateSkills(updated);
    if (expandedSkillId === id) {
      setExpandedSkillId(updated[0]?.id || null);
    }
  };

  const handleCopyPreview = (skill: AgentSkillDefinition) => {
    const text = generateSkillMdContent(skill);
    navigator.clipboard?.writeText(text);
    setCopiedId(skill.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-3" data-testid="skills-section">
      {/* Header with Title and Add Button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
          <label className="text-[11px] font-bold uppercase tracking-tight text-gray-300">
            Agent Skills ({skills.length})
          </label>
        </div>
        <button
          type="button"
          onClick={handleAddSkill}
          className="flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 font-medium cursor-pointer"
          data-testid="add-skill-button"
        >
          <Plus className="w-3 h-3" />
          Add Skill
        </button>
      </div>

      <p className="text-[10px] text-gray-400 leading-normal">
        Progressive Disclosure (<code className="text-emerald-300">SkillToolset</code>): L1 metadata (~100 tokens), L2 instructions on-demand, and L3 scripts/references.
      </p>

      {/* Dynamic Skill Factory Mode Card */}
      <div className="p-2.5 rounded-lg bg-[#0d1117] border border-emerald-500/30 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[11px] font-semibold text-emerald-200">
              Dynamic Skill Factory Mode
            </span>
          </div>
          <input
            type="checkbox"
            checked={skillFactoryConfig?.enabled || false}
            onChange={(e) => {
              onUpdateSkillFactory?.({
                enabled: e.target.checked,
                outputDirectory: skillFactoryConfig?.outputDirectory || 'skills/',
                allowRuntimePersist: skillFactoryConfig?.allowRuntimePersist ?? true,
              });
            }}
            className="w-3.5 h-3.5 accent-emerald-500 rounded cursor-pointer"
            data-testid="skill-factory-enabled-toggle"
          />
        </div>

        {skillFactoryConfig?.enabled && (
          <div className="space-y-2 pt-1 border-t border-[#21262d]">
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-gray-400">Output Directory</label>
              <input
                type="text"
                value={skillFactoryConfig.outputDirectory || 'skills/'}
                onChange={(e) =>
                  onUpdateSkillFactory?.({
                    ...skillFactoryConfig,
                    outputDirectory: e.target.value,
                  })
                }
                placeholder="e.g. skills/"
                className="w-full px-2 py-1 bg-[#161b22] border border-[#30363d] focus:border-emerald-500 rounded text-xs text-white font-mono"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="allowRuntimePersistToggle"
                checked={skillFactoryConfig.allowRuntimePersist ?? true}
                onChange={(e) =>
                  onUpdateSkillFactory?.({
                    ...skillFactoryConfig,
                    allowRuntimePersist: e.target.checked,
                  })
                }
                className="w-3.5 h-3.5 accent-emerald-500 rounded cursor-pointer"
              />
              <label htmlFor="allowRuntimePersistToggle" className="text-[10px] text-gray-300 cursor-pointer">
                Allow agent to persist newly generated skills to disk at runtime
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Skill List */}
      <div className="space-y-2">
        {skills.length === 0 ? (
          <div className="text-[11px] text-gray-400 italic p-2.5 bg-[#0d1117] rounded-lg border border-dashed border-[#30363d] text-center">
            No agent skills configured. Add an inline or workspace skill to enable Progressive Disclosure.
          </div>
        ) : (
          skills.map((skill) => {
            const isExpanded = expandedSkillId === skill.id;
            const isPreviewOpen = previewSkillId === skill.id;
            const l1Tokens = estimateSkillL1Tokens(skill);

            return (
              <div
                key={skill.id}
                className="rounded-lg bg-[#0d1117] border border-[#30363d] overflow-hidden"
                data-testid={`skill-card-${skill.id}`}
              >
                {/* Skill Item Header */}
                <div
                  className="flex items-center justify-between p-2.5 cursor-pointer hover:bg-[#161b22]/50 transition-colors"
                  onClick={() => setExpandedSkillId(isExpanded ? null : skill.id)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={skill.enabled !== false}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => handleUpdateSkill(skill.id, { enabled: e.target.checked })}
                      className="w-3.5 h-3.5 accent-emerald-500 rounded cursor-pointer"
                      title="Enable / Disable Skill"
                    />
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-200 text-xs truncate flex items-center gap-1.5">
                        <span>{skill.name || 'unnamed_skill'}</span>
                        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-500/20">
                          ~{l1Tokens} L1 tokens
                        </span>
                      </div>
                      <div className="text-[10px] text-gray-400 truncate max-w-[200px]">
                        {skill.description || 'No description provided'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewSkillId(isPreviewOpen ? null : skill.id);
                      }}
                      title="Preview generated SKILL.md"
                      className="p-1 text-gray-400 hover:text-emerald-400 rounded transition-colors cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveSkill(skill.id);
                      }}
                      title="Remove Skill"
                      className="p-1 text-gray-400 hover:text-rose-400 rounded transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    {isExpanded ? (
                      <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                    )}
                  </div>
                </div>

                {/* SKILL.md Preview Panel */}
                {isPreviewOpen && (
                  <div className="p-2.5 bg-[#161b22] border-t border-[#30363d] space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] text-gray-400">
                      <span className="font-mono flex items-center gap-1">
                        <FileCode className="w-3 h-3 text-emerald-400" />
                        SKILL.md Preview
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyPreview(skill)}
                        className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 cursor-pointer"
                      >
                        {copiedId === skill.id ? (
                          <>
                            <Check className="w-3 h-3" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                    <pre className="p-2 bg-[#0d1117] rounded text-[10px] text-emerald-300 font-mono whitespace-pre-wrap max-h-48 overflow-y-auto border border-[#30363d]">
                      {generateSkillMdContent(skill)}
                    </pre>
                  </div>
                )}

                {/* Expanded Edit Form */}
                {isExpanded && (
                  <div className="p-3 border-t border-[#30363d] space-y-3 bg-[#161b22]/30">
                    {/* Skill Source Type Selector */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-tight text-gray-400">
                        Skill Source Type
                      </label>
                      <div className="grid grid-cols-3 gap-1.5">
                        {(['inline', 'workspace_dir', 'external_repo'] as SkillSourceType[]).map((src) => (
                          <button
                            key={src}
                            type="button"
                            onClick={() => handleUpdateSkill(skill.id, { sourceType: src })}
                            className={`px-2 py-1 rounded text-[10px] font-medium border transition-colors cursor-pointer text-center ${
                              skill.sourceType === src
                                ? 'bg-emerald-950/60 border-emerald-500/60 text-emerald-300 font-bold'
                                : 'bg-[#0d1117] border-[#30363d] text-gray-400 hover:text-gray-200'
                            }`}
                          >
                            {src === 'inline' ? 'Inline SKILL.md' : src === 'workspace_dir' ? 'Workspace Dir' : 'External Git'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Skill Identifier / Name */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-tight text-gray-400">
                        Skill Name (ID)
                      </label>
                      <input
                        type="text"
                        value={skill.name}
                        onChange={(e) => handleUpdateSkill(skill.id, { name: e.target.value })}
                        placeholder="e.g. retail_pricing"
                        className="w-full px-2.5 py-1.5 bg-[#0d1117] border border-[#30363d] focus:border-emerald-500 rounded text-xs text-white font-mono"
                      />
                    </div>

                    {/* Description (L1 Metadata) */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold uppercase tracking-tight text-gray-400">
                          Description (L1 Metadata)
                        </label>
                        <span className="text-[9px] text-gray-400 font-mono">
                          ~{l1Tokens} tokens
                        </span>
                      </div>
                      <textarea
                        rows={2}
                        value={skill.description}
                        onChange={(e) => handleUpdateSkill(skill.id, { description: e.target.value })}
                        placeholder="Brief summary matching user intent..."
                        className="w-full px-2.5 py-1.5 bg-[#0d1117] border border-[#30363d] focus:border-emerald-500 rounded text-xs text-gray-200 leading-normal"
                      />
                    </div>

                    {/* Source-specific configuration */}
                    {skill.sourceType === 'inline' && (
                      <div className="space-y-2">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase tracking-tight text-gray-400">
                            L2 Instructions (Markdown Body)
                          </label>
                          <textarea
                            rows={6}
                            value={skill.instructionsMarkdown || ''}
                            onChange={(e) => handleUpdateSkill(skill.id, { instructionsMarkdown: e.target.value })}
                            placeholder="# Instructions&#10;&#10;Step-by-step directives for the agent when this skill is invoked..."
                            className="w-full px-2.5 py-1.5 bg-[#0d1117] border border-[#30363d] focus:border-emerald-500 rounded text-xs text-gray-200 font-mono leading-relaxed resize-y"
                          />
                        </div>

                        {/* L3 References and Scripts list */}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-[10px] font-medium text-gray-400">
                              L3 References (csv)
                            </label>
                            <input
                              type="text"
                              value={(skill.references || []).join(', ')}
                              onChange={(e) => {
                                const refs = e.target.value
                                  .split(',')
                                  .map((r) => r.trim())
                                  .filter(Boolean);
                                handleUpdateSkill(skill.id, { references: refs });
                              }}
                              placeholder="references/spec.md"
                              className="w-full px-2 py-1 bg-[#0d1117] border border-[#30363d] focus:border-emerald-500 rounded text-xs text-white font-mono"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-medium text-gray-400">
                              L3 Scripts (csv)
                            </label>
                            <input
                              type="text"
                              value={(skill.scripts || []).join(', ')}
                              onChange={(e) => {
                                const scrs = e.target.value
                                  .split(',')
                                  .map((s) => s.trim())
                                  .filter(Boolean);
                                handleUpdateSkill(skill.id, { scripts: scrs });
                              }}
                              placeholder="scripts/compute.py"
                              className="w-full px-2 py-1 bg-[#0d1117] border border-[#30363d] focus:border-emerald-500 rounded text-xs text-white font-mono"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {skill.sourceType === 'workspace_dir' && (
                      <div className="space-y-2">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase tracking-tight text-gray-400">
                            Workspace Directory Path
                          </label>
                          <input
                            type="text"
                            value={skill.workspacePath || ''}
                            onChange={(e) => handleUpdateSkill(skill.id, { workspacePath: e.target.value })}
                            placeholder="e.g. skills/retail-pricing"
                            className="w-full px-2.5 py-1.5 bg-[#0d1117] border border-[#30363d] focus:border-emerald-500 rounded text-xs text-white font-mono"
                          />
                        </div>
                      </div>
                    )}

                    {skill.sourceType === 'external_repo' && (
                      <div className="space-y-2">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase tracking-tight text-gray-400">
                            Git Repository URL
                          </label>
                          <input
                            type="text"
                            value={skill.repoUrl || ''}
                            onChange={(e) => handleUpdateSkill(skill.id, { repoUrl: e.target.value })}
                            placeholder="https://github.com/org/skills-repo.git"
                            className="w-full px-2.5 py-1.5 bg-[#0d1117] border border-[#30363d] focus:border-emerald-500 rounded text-xs text-white font-mono"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase tracking-tight text-gray-400">
                            Repository Subpath
                          </label>
                          <input
                            type="text"
                            value={skill.workspacePath || ''}
                            onChange={(e) => handleUpdateSkill(skill.id, { workspacePath: e.target.value })}
                            placeholder="skills/pricing"
                            className="w-full px-2.5 py-1.5 bg-[#0d1117] border border-[#30363d] focus:border-emerald-500 rounded text-xs text-white font-mono"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
