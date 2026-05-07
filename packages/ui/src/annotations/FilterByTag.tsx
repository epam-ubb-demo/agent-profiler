/**
 * FilterByTag — Filter panel for viewing by tag.
 *
 * Shows all available tags as toggleable chips with item counts.
 * Selecting/deselecting tags calls onFilterChange with the current selection.
 */

export interface TagFilterOption {
  /** The tag label. */
  readonly label: string;
  /** Number of items matching this tag. */
  readonly count: number;
}

export interface FilterByTagProps {
  /** Available tags to filter by. */
  readonly tags: TagFilterOption[];
  /** Currently selected tag labels. */
  readonly selectedTags: string[];
  /** Called when the selection changes. */
  readonly onFilterChange: (selectedTags: string[]) => void;
}

export function FilterByTag({ tags, selectedTags, onFilterChange }: FilterByTagProps) {
  const handleToggle = (label: string) => {
    if (selectedTags.includes(label)) {
      onFilterChange(selectedTags.filter((t) => t !== label));
    } else {
      onFilterChange([...selectedTags, label]);
    }
  };

  const handleClearAll = () => {
    onFilterChange([]);
  };

  return (
    <div data-testid="filter-by-tag" className="filter-by-tag" role="group" aria-label="Filter by tag">
      <div className="filter-by-tag__chips">
        {tags.map((tag) => {
          const isSelected = selectedTags.includes(tag.label);
          return (
            <button
              key={tag.label}
              type="button"
              role="checkbox"
              aria-checked={isSelected}
              aria-label={`Filter by ${tag.label} (${tag.count} items)`}
              className={`filter-by-tag__chip ${isSelected ? 'filter-by-tag__chip--selected' : ''}`}
              data-testid={`filter-chip-${tag.label}`}
              onClick={() => handleToggle(tag.label)}
            >
              {tag.label} ({tag.count})
            </button>
          );
        })}
      </div>
      {selectedTags.length > 0 && (
        <button
          type="button"
          className="filter-by-tag__clear"
          data-testid="filter-clear-all"
          aria-label="Clear all tag filters"
          onClick={handleClearAll}
        >
          Clear all
        </button>
      )}
    </div>
  );
}
