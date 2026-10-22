/**
 * SkillsSettingsTab.tsx
 *
 * Page 2 of the Plugin Settings screen: Global Skills Library & Editor.
 * Provides a Claude Desktop / Antigravity-inspired master-detail interface where
 * users can view all global skills, create new skills, edit existing skills, and
 * delete skills. Global skills saved here are available across all Agent Property
 * Inspector panels to attach to any agent.
 *
 * Author: Mike Nimer <mikenimer@google.com>
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  BookOpen,
  Plus,
  Trash2,
  Save,
  Search,
  FileCode2,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { usePluginSettings } from '../../context/SettingsContext';
import {
  sanitizeSkillSlug,
  formatSkillMarkdownWithFrontmatter,
} from '../../data/defaultSkills';
import { AgentSkillDefinition } from '../../types';

export const SkillsSettingsTab: React.FC = () => {
  const { settings, saveGlobalSkill, deleteGlobalSkill } = usePluginSettings();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(
    settings.globalSkills[0]?.id || null
  );

  // Draft form state
  const [draftId, setDraftId] = useState<string>('');
  const [draftTitle, setDraftTitle] = useState<string>('');
  const [draftName, setDraftName] = useState<string>('');
  const [draftDescription, setDraftDescription] = useState<string>('');
  const [draftInstructions, setDraftInstructions] = useState<string>('');
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const filteredSkills = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return settings.globalSkills;
    return settings.globalSkills.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q)
    );
  }, [settings.globalSkills, searchQuery]);

  // Synchronize draft state when selectedSkillId changes
  useEffect(() => {
    if (!selectedSkillId) return;
    const found = settings.globalSkills.find((s) => s.id === selectedSkillId);
    if (found) {
      setDraftId(found.id);
      setDraftTitle(found.title);
      setDraftName(found.name);
      setDraftDescription(found.description);
      setDraftInstructions(found.instructions);
    }
  }, [selectedSkillId, settings.globalSkills]);

  const handleStartNewSkill = () => {
    const newId = `skill-${Date.now()}`;
    setSelectedSkillId(null);
    setDraftId(newId);
    setDraftTitle('New Custom Skill');
    setDraftName('new-custom-skill');
    setDraftDescription('Describe when the agent should load and follow this skill...');
    setDraftInstructions(
      '# New Custom Skill\n\n## Workflow\n1. Step one...\n2. Step two...\n'
    );
  };

  const handleSaveSkill = () => {
    const slug = sanitizeSkillSlug(draftName || draftTitle || 'custom-skill');
    const title = draftTitle.trim() || slug;
    const skillToSave: AgentSkillDefinition = {
      id: draftId || `skill-${slug}`,
      name: slug,
      title,
      description: draftDescription.trim() || `${title} instructions`,
      instructions: draftInstructions,
      scope: 'global',
      updatedAt: new Date().toISOString(),
    };

    saveGlobalSkill(skillToSave);
    setSelectedSkillId(skillToSave.id);
    setDraftName(slug);
    setSavedNotice(`Saved global skill "${skillToSave.title}" (skills/${slug}/SKILL.md)`);
    setTimeout(() => setSavedNotice(null), 3000);
  };

  const handleDeleteSkill = (skillId: string) => {
    deleteGlobalSkill(skillId);
    const remaining = settings.globalSkills.filter((s) => s.id !== skillId);
    if (remaining.length > 0) {
      setSelectedSkillId(remaining[0].id);
    } else {
      handleStartNewSkill();
    }
  };

  const formattedPreview = useMemo(
    () =>
      formatSkillMarkdownWithFrontmatter({
        id: draftId || 'preview',
        name: sanitizeSkillSlug(draftName || draftTitle || 'custom-skill'),
        title: draftTitle || 'Custom Skill',
        description: draftDescription || 'Skill description',
        instructions: draftInstructions || '# Instructions',
        scope: 'global',
      }),
    [draftId, draftName, draftTitle, draftDescription, draftInstructions]
  );

  return (
    <div className="space-y-6" data-testid="skills-settings-tab">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--vscode-border)] pb-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-purple-400" />
            <span>Global Skills Library &amp; SKILL.md Editor</span>
          </h2>
          <p className="text-xs text-[var(--vscode-text-muted)] mt-1">
            Create, edit, and manage reusable agent skills (`SKILL.md`). Global skills can be attached to any Agent node from the Agent Property Inspector.
          </p>
        </div>

        <button
          type="button"
          data-testid="create-new-global-skill-btn"
          onClick={handleStartNewSkill}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-sm cursor-pointer transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>New Global Skill</span>
        </button>
      </div>

      {savedNotice && (
        <div
          data-testid="skill-saved-banner"
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{savedNotice}</span>
        </div>
      )}

      {/* Master-Detail Split View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (4 cols): Skills List & Search */}
        <div className="lg:col-span-4 rounded-xl border border-[var(--vscode-border)] bg-[var(--vscode-canvas-bg)] overflow-hidden">
          <div className="p-3 bg-[var(--vscode-activity-bar)] border-b border-[var(--vscode-border)]">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[var(--vscode-text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                data-testid="skills-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search global skills..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-[var(--vscode-workbench-bg)] border border-[var(--vscode-border)] text-xs text-[var(--vscode-text-primary)] focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div
            className="divide-y divide-[var(--vscode-border)] max-h-[540px] overflow-y-auto"
            data-testid="global-skills-list"
          >
            {filteredSkills.map((skill) => {
              const isSelected = skill.id === selectedSkillId;
              return (
                <div
                  key={skill.id}
                  data-testid={`global-skill-item-${skill.name}`}
                  onClick={() => setSelectedSkillId(skill.id)}
                  className={`p-3.5 cursor-pointer transition-colors flex items-start justify-between gap-2 ${
                    isSelected
                      ? 'bg-blue-600/15 border-l-4 border-l-blue-500'
                      : 'hover:bg-[var(--vscode-hover)]'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[var(--vscode-text-primary)] truncate">
                        {skill.title}
                      </span>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30">
                        Global
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-blue-400 mt-0.5 truncate">
                      skills/{skill.name}/SKILL.md
                    </div>
                    <p className="text-[11px] text-[var(--vscode-text-muted)] mt-1 line-clamp-2">
                      {skill.description}
                    </p>
                  </div>

                  <button
                    type="button"
                    data-testid={`delete-global-skill-${skill.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteSkill(skill.id);
                    }}
                    className="p-1.5 rounded text-[var(--vscode-text-muted)] hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer shrink-0"
                    title={`Delete ${skill.title}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}

            {filteredSkills.length === 0 && (
              <div className="p-6 text-center text-xs text-[var(--vscode-text-muted)]">
                No global skills found. Click &ldquo;New Global Skill&rdquo; to create one.
              </div>
            )}
          </div>
        </div>

        {/* Right Column (8 cols): Skill Editor Form */}
        <div className="lg:col-span-8 rounded-xl border border-[var(--vscode-border)] bg-[var(--vscode-canvas-bg)] overflow-hidden">
          <div className="px-4 py-3 bg-[var(--vscode-activity-bar)] border-b border-[var(--vscode-border)] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileCode2 className="w-4 h-4 text-purple-400" />
              <span className="text-xs font-bold">
                {selectedSkillId ? `Editing Skill: ${draftTitle}` : 'Creating New Global Skill'}
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--vscode-workbench-bg)] text-[var(--vscode-text-muted)] border border-[var(--vscode-border)]">
                skills/{sanitizeSkillSlug(draftName || draftTitle || 'custom-skill')}/SKILL.md
              </span>
            </div>

            <div className="flex items-center gap-2">
              {selectedSkillId && (
                <button
                  type="button"
                  data-testid="editor-delete-skill-btn"
                  onClick={() => handleDeleteSkill(selectedSkillId)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-xs font-medium cursor-pointer transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>
              )}
              <button
                type="button"
                data-testid="editor-save-skill-btn"
                onClick={handleSaveSkill}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold cursor-pointer transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Skill</span>
              </button>
            </div>
          </div>

          <div className="p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-semibold text-[var(--vscode-text-secondary)] mb-1">
                  Skill Display Title
                </label>
                <input
                  type="text"
                  data-testid="skill-title-input"
                  value={draftTitle}
                  onChange={(e) => {
                    setDraftTitle(e.target.value);
                    if (!selectedSkillId) {
                      setDraftName(sanitizeSkillSlug(e.target.value));
                    }
                  }}
                  placeholder="e.g. BigQuery SQL Analyst"
                  className="w-full px-3 py-2 rounded-lg bg-[var(--vscode-workbench-bg)] border border-[var(--vscode-border)] text-xs text-[var(--vscode-text-primary)] focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--vscode-text-secondary)] mb-1">
                  Skill Slug (`name` in YAML frontmatter)
                </label>
                <input
                  type="text"
                  data-testid="skill-name-input"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder="e.g. bigquery-sql-analyst"
                  className="w-full px-3 py-2 rounded-lg bg-[var(--vscode-workbench-bg)] border border-[var(--vscode-border)] text-xs font-mono text-[var(--vscode-text-primary)] focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[var(--vscode-text-secondary)] mb-1">
                Skill Trigger Description (`description` in YAML frontmatter)
              </label>
              <input
                type="text"
                data-testid="skill-description-input"
                value={draftDescription}
                onChange={(e) => setDraftDescription(e.target.value)}
                placeholder="When should the agent activate and follow this skill?"
                className="w-full px-3 py-2 rounded-lg bg-[var(--vscode-workbench-bg)] border border-[var(--vscode-border)] text-xs text-[var(--vscode-text-primary)] focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[var(--vscode-text-secondary)] mb-1">
                SKILL.md Markdown Instructions
              </label>
              <textarea
                rows={10}
                data-testid="skill-instructions-textarea"
                value={draftInstructions}
                onChange={(e) => setDraftInstructions(e.target.value)}
                placeholder="# Skill Instructions..."
                className="w-full p-3 rounded-lg bg-[var(--vscode-workbench-bg)] border border-[var(--vscode-border)] text-xs font-mono text-[var(--vscode-text-primary)] focus:outline-none focus:border-blue-500 leading-relaxed"
              />
            </div>

            {/* Live SKILL.md Frontmatter Preview */}
            <div className="rounded-lg border border-[var(--vscode-border)] bg-[var(--vscode-workbench-bg)] p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--vscode-text-muted)] flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-purple-400" />
                  Generated SKILL.md Artifact Preview
                </span>
                <span className="text-[10px] font-mono text-purple-400">
                  skills/{sanitizeSkillSlug(draftName || draftTitle || 'custom-skill')}/SKILL.md
                </span>
              </div>
              <pre
                data-testid="skill-markdown-preview"
                className="text-[11px] font-mono text-[var(--vscode-text-secondary)] whitespace-pre-wrap max-h-40 overflow-y-auto"
              >
                {formattedPreview}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
