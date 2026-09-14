import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';

/**
 * TagListInputProps - Properties for the TagListInput primitive component
 *
 * @author Mike Nimer <mikenimer@google.com>
 */
export interface TagListInputProps {
  tags: string[];
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  placeholder?: string;
  buttonText?: string;
  className?: string;
}

/**
 * TagListInput - Reusable tags manager utilizing chip capsules and 8pt spacing.
 *
 * This component renders an input field allowing users to append tag strings, 
 * automatically parsing and sanitizing entries while guarding against duplicates.
 *
 * Architectural Decisions:
 * 1. Controlled State: Local input management with callbacks triggered for parent state updates.
 * 2. 8pt Grid Compliant: Flow wrap with gap-1.5 (6px) and padding px-2 py-0.5 (multiples of 4/8px).
 *
 * @author Mike Nimer <mikenimer@google.com>
 */
export const TagListInput: React.FC<TagListInputProps> = ({
  tags = [],
  onAddTag,
  onRemoveTag,
  placeholder = 'Add a tag...',
  buttonText = 'Add',
  className = '',
}) => {
  const [inputValue, setInputValue] = useState('');

  const handleAdd = () => {
    const cleanedTag = inputValue.trim();
    if (!cleanedTag) return;

    // Check for duplicates
    if (!tags.includes(cleanedTag)) {
      onAddTag(cleanedTag);
    }
    setInputValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className={`space-y-2.5 ${className}`}>
      {/* 1. Input Add Row */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 px-3 py-1.5 bg-[#161b22] border border-[#30363d] rounded text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-emerald-500 font-mono"
          data-testid="tag-input"
        />
        <button
          type="button"
          onClick={handleAdd}
          className="px-3 py-1.5 rounded bg-emerald-950/40 text-emerald-400 hover:bg-emerald-900/50 border border-emerald-500/25 transition-all text-xs font-semibold flex items-center gap-1 shrink-0"
          data-testid="tag-add-button"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{buttonText}</span>
        </button>
      </div>

      {/* 2. Chip Flow Wrapper */}
      {tags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5" data-testid="tag-chips-container">
          {tags.map((tag) => (
            <div
              key={tag}
              className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full bg-[#161b22] text-gray-300 border border-[#30363d] text-[10px] font-mono select-none"
              data-testid={`tag-chip-${tag}`}
            >
              <span>{tag}</span>
              <button
                type="button"
                onClick={() => onRemoveTag(tag)}
                className="p-0.5 rounded-full hover:bg-red-950/40 hover:text-red-400 text-gray-500 transition-colors"
                data-testid={`tag-remove-${tag}`}
                aria-label={`Remove tag ${tag}`}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-gray-500 italic leading-none" data-testid="no-tags-message">
          No tags added yet.
        </p>
      )}
    </div>
  );
};
