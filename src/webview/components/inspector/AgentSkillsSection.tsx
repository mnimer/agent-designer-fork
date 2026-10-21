/**
 * AgentSkillsSection.tsx
 *
 * Reusable Agent Skills configuration section for the Agent Property Inspector
 * (`StandardAgentDrawer` and `A2AAgentDrawer`).
 * Allows users to:
 * 1. Select and attach any Global Skill defined in Plugin Settings (`SkillsSettingsTab`).
 * 2. Create a new skill inline inside the Agent Card. By default, inline-created skills
 *    are saved ONLY with this agent (`scope: 'agent'`), UNLESS the user checks the
 *    "Save this as a global skill" checkbox next to the Save button.
 * 3. Remove attached skills from the agent.
 *
 * Author: Mike Nimer <mikenimer@google.com>
 */

import React, { useState } from 'react';
import { BookOpen, Plus, X, Save } from 'lucide-react';
import { AgentSkillDefinition } from '../../types';
import { useOptionalPluginSettings } from '../../context/SettingsContext';
import { DEFAULT_GLOBAL_SKILLS, sanitizeSkillSlug } from '../../data/defaultSkills';

export interface AgentSkillsSectionProps {
  skills?: AgentSkillDefinition[];
  onChangeSkills: (skills: AgentSkillDefinition[]) => void;
}

export const AgentSkillsSection: React.FC<AgentSkillsSectionProps> = ({
  skills = [],
  onChangeSkills,
}) => {
  const settingsCtx = useOptionalPluginSettings();
  const globalSkills = settingsCtx?.settings.globalSkills ?? DEFAULT_GLOBAL_SKILLS;

  const [selectedGlobalSkillId, setSelectedGlobalSkillId] = useState<string>('');
  const [isCreatingInline, setIsCreatingInline] = useState(false);

  // Inline New Skill Form State
  const [newTitle, setNewTitle] = useState('');
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newInstructions, setNewInstructions] = useState('');
  const [saveAsGlobal, setSaveAsGlobal] = useState(false);

  const attachedSkillIds = new Set(skills.map((s) => s.id));
  const attachedSkillNames = new Set(skills.map((s) => s.name));
  const availableGlobalSkills = globalSkills.filter(
    (g) => !attachedSkillIds.has(g.id) && !attachedSkillNames.has(g.name)
  );

  const handleAttachGlobalSkill = () => {
    const targetId = selectedGlobalSkillId || availableGlobalSkills[0]?.id;
    if (!targetId) return;
    const found = globalSkills.find((g) => g.id === targetId);
    if (!found) return;

    onChangeSkills([
      ...skills,
      {
        ...found,
        scope: 'global',
      },
    ]);
    setSelectedGlobalSkillId('');
  };

  const handleRemoveSkill = (skillIdOrName: string) => {
    onChangeSkills(
      skills.filter((s) => s.id !== skillIdOrName && s.name !== skillIdOrName)
    );
  };

  const handleSaveInlineSkill = () => {
    const slug = sanitizeSkillSlug(newName || newTitle || 'agent-custom-skill');
    const title = newTitle.trim() || slug;
    const newSkill: AgentSkillDefinition = {
      id: `skill-${slug}-${Date.now()}`,
      name: slug,
      title,
      description: newDescription.trim() || `${title} skill instructions`,
      instructions:
        newInstructions.trim() ||
        `# ${title}\n\nFollow these domain-specific instructions when executing tasks.`,
      scope: saveAsGlobal ? 'global' : 'agent',
      updatedAt: new Date().toISOString(),
    };

    // Only persist to global settings if the user checked "Save this as a global skill"
    if (saveAsGlobal && settingsCtx?.saveGlobalSkill) {
      settingsCtx.saveGlobalSkill({
        ...newSkill,
        scope: 'global',
      });
    }

    onChangeSkills([...skills, newSkill]);

    // Reset inline form
    setNewTitle('');
    setNewName('');
    setNewDescription('');
    setNewInstructions('');
    setSaveAsGlobal(false);
    setIsCreatingInline(false);
  };

  return (
    <div className="space-y-2.5 pt-2 border-t border-[#30363d]" data-testid="agent-skills-section">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-bold uppercase tracking-tight text-gray-400 flex items-center gap-1.5">
          <BookOpen className="w-3.5 h-3.5 text-purple-400" />
          <span>Agent Skills ({skills.length})</span>
        </label>
        <button
          type="button"
          data-testid="toggle-inline-create-skill-btn"
          onClick={() => setIsCreatingInline((prev) => !prev)}
          className="flex items-center gap-1 text-[11px] text-purple-400 hover:text-purple-300 font-medium cursor-pointer"
        >
          <Plus className="w-3 h-3" />
          <span>{isCreatingInline ? 'Cancel' : 'Create Skill'}</span>
        </button>
      </div>

      {/* Global Skill Picker Row */}
      <div className="flex items-center gap-2">
        <select
          data-testid="attach-global-skill-select"
          value={selectedGlobalSkillId}
          onChange={(e) => setSelectedGlobalSkillId(e.target.value)}
          className="flex-1 px-2.5 py-1.5 bg-[#0d1117] border border-[#30363d] rounded-lg text-xs text-gray-200 focus:outline-none focus:border-purple-500 cursor-pointer"
        >
          <option value="">
            {availableGlobalSkills.length > 0
              ? 'Select a Global Skill from Settings...'
              : 'All global skills attached'}
          </option>
          {availableGlobalSkills.map((g) => (
            <option key={g.id} value={g.id}>
              {g.title} ({g.name})
            </option>
          ))}
        </select>
        <button
          type="button"
          data-testid="attach-global-skill-btn"
          disabled={availableGlobalSkills.length === 0}
          onClick={handleAttachGlobalSkill}
          className="px-3 py-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-300 text-xs font-semibold disabled:opacity-40 cursor-pointer transition-colors shrink-0"
        >
          Attach
        </button>
      </div>

      {/* Inline Create Skill Form (Saves only to this agent unless checkbox is checked) */}
      {isCreatingInline && (
        <div
          data-testid="inline-create-skill-form"
          className="p-3 rounded-lg bg-[#0d1117] border border-purple-500/40 space-y-2.5"
        >
          <div className="text-[11px] font-bold text-purple-300 flex items-center justify-between">
            <span>New Agent Skill (`SKILL.md`)</span>
            <span className="text-[9px] font-mono text-gray-400">
              {saveAsGlobal ? 'Scope: Global + Agent' : 'Scope: Agent-Only'}
            </span>
          </div>

          <input
            type="text"
            data-testid="inline-skill-title-input"
            value={newTitle}
            onChange={(e) => {
              setNewTitle(e.target.value);
              setNewName(sanitizeSkillSlug(e.target.value));
            }}
            placeholder="Skill Title (e.g. Refund Policy Checker)"
            className="w-full px-2.5 py-1.5 rounded bg-[#161b22] border border-[#30363d] text-xs text-white focus:outline-none focus:border-purple-400"
          />

          <input
            type="text"
            data-testid="inline-skill-description-input"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="When should this agent use this skill?"
            className="w-full px-2.5 py-1.5 rounded bg-[#161b22] border border-[#30363d] text-xs text-white focus:outline-none focus:border-purple-400"
          />

          <textarea
            rows={4}
            data-testid="inline-skill-instructions-input"
            value={newInstructions}
            onChange={(e) => setNewInstructions(e.target.value)}
            placeholder="# Skill Instructions (Markdown)..."
            className="w-full p-2 rounded bg-[#161b22] border border-[#30363d] text-xs font-mono text-gray-200 focus:outline-none focus:border-purple-400"
          />

          {/* Checkbox next to Save button: "Save this as a global skill" */}
          <div className="flex items-center justify-between gap-2 pt-1">
            <label className="flex items-center gap-2 text-[11px] text-gray-300 cursor-pointer select-none">
              <input
                type="checkbox"
                data-testid="save-as-global-skill-checkbox"
                checked={saveAsGlobal}
                onChange={(e) => setSaveAsGlobal(e.target.checked)}
                className="w-3.5 h-3.5 accent-purple-500 rounded cursor-pointer"
              />
              <span>Save this as a global skill</span>
            </label>

            <button
              type="button"
              data-testid="save-inline-skill-btn"
              onClick={handleSaveInlineSkill}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold cursor-pointer transition-colors shrink-0"
            >
              <Save className="w-3 h-3" />
              <span>Save Skill</span>
            </button>
          </div>
        </div>
      )}

      {/* Attached Skills List */}
      <div className="space-y-1.5" data-testid="attached-agent-skills-list">
        {skills.length > 0 ? (
          skills.map((skill) => (
            <div
              key={skill.id || skill.name}
              data-testid={`attached-skill-${skill.name}`}
              className="flex items-center justify-between p-2 rounded-lg bg-[#0d1117] border border-[#30363d]"
            >
              <div className="min-w-0 pr-2">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-gray-200 text-xs truncate">
                    {skill.title || skill.name}
                  </span>
                  <span
                    className={`text-[9px] font-mono px-1.5 py-0.2 rounded border ${
                      skill.scope === 'agent'
                        ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                        : 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                    }`}
                  >
                    {skill.scope === 'agent' ? 'Agent Only' : 'Global'}
                  </span>
                </div>
                <div className="text-[10px] font-mono text-purple-400 truncate">
                  skills/{skill.name}/SKILL.md
                </div>
              </div>

              <button
                type="button"
                data-testid={`remove-attached-skill-${skill.name}`}
                onClick={() => handleRemoveSkill(skill.id || skill.name)}
                title={`Remove ${skill.title || skill.name}`}
                className="p-1 text-gray-400 hover:text-rose-400 hover:bg-[#161b22] rounded transition-colors cursor-pointer shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        ) : (
          <div className="text-[11px] text-gray-400 italic p-2 bg-[#0d1117] rounded-lg border border-dashed border-[#30363d]">
            No skills attached. Select a global skill above or click &ldquo;Create Skill&rdquo; to add an agent-specific skill.
          </div>
        )}
      </div>
    </div>
  );
};
