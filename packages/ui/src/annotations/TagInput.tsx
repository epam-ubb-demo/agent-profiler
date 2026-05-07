/**
 * TagInput — Tag creation and display component.
 *
 * Shows existing tags as removable coloured chips and provides
 * an autocomplete text input for adding new tags.
 */

import { useState, useRef, useCallback, type KeyboardEvent, type ChangeEvent } from 'react';

import type { Tag } from './types';

/** Simple deterministic hash-to-colour for tag chips. */
function tagColour(label: string): string {
  let hash = 0;
  for (let i = 0; i < label.length; i++) {
    hash = label.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 88%)`;
}

export interface TagInputProps {
  /** Existing tags to display. */
  readonly tags: Tag[];
  /** Suggestions for autocomplete. */
  readonly suggestions?: string[];
  /** Called when a new tag is added. */
  readonly onAdd: (label: string) => void;
  /** Called when a tag chip is removed (by tag id). */
  readonly onRemove: (tagId: string) => void;
}

export function TagInput({ tags, suggestions = [], onAdd, onRemove }: TagInputProps) {
  const [inputValue, setInputValue] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredSuggestions = suggestions.filter(
    (s) =>
      s.toLowerCase().includes(inputValue.toLowerCase()) &&
      !tags.some((t) => t.label.toLowerCase() === s.toLowerCase()),
  );

  const addTag = useCallback(
    (label: string) => {
      const trimmed = label.trim();
      if (trimmed.length === 0) return;
      onAdd(trimmed);
      setInputValue('');
      setShowSuggestions(false);
    },
    [onAdd],
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag(inputValue);
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    setShowSuggestions(e.target.value.length > 0);
  };

  return (
    <div data-testid="tag-input" className="tag-input">
      <div className="tag-input__chips" role="list" aria-label="Tags">
        {tags.map((tag) => (
          <span
            key={tag.id}
            role="listitem"
            className="tag-input__chip"
            style={{ backgroundColor: tagColour(tag.label) }}
          >
            {tag.label}
            <button
              type="button"
              aria-label={`Remove tag ${tag.label}`}
              className="tag-input__chip-remove"
              onClick={() => onRemove(tag.id)}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="tag-input__input-wrapper">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowSuggestions(inputValue.length > 0)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          placeholder="Add tag…"
          aria-label="Add tag"
          data-testid="tag-input-field"
          className="tag-input__field"
        />
        {showSuggestions && filteredSuggestions.length > 0 && (
          <ul
            className="tag-input__suggestions"
            role="listbox"
            aria-label="Tag suggestions"
            data-testid="tag-suggestions"
          >
            {filteredSuggestions.map((suggestion) => (
              <li
                key={suggestion}
                role="option"
                className="tag-input__suggestion"
                onMouseDown={(e) => {
                  e.preventDefault();
                  addTag(suggestion);
                }}
              >
                {suggestion}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
