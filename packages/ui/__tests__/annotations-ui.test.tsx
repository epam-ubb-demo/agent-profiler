/**
 * Tests for the Annotations UI components.
 */

import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, expect, it, afterEach, vi } from 'vitest';

import { AnnotationBadge } from '../src/annotations/AnnotationBadge';
import { AnnotationPanel } from '../src/annotations/AnnotationPanel';
import { CommentInput } from '../src/annotations/CommentInput';
import { FilterByTag } from '../src/annotations/FilterByTag';
import { TagInput } from '../src/annotations/TagInput';
import type { Annotation, AnnotationCallbacks, AnnotationTarget } from '../src/annotations/types';

afterEach(cleanup);

// ---------- TagInput ----------

describe('TagInput', () => {
  const baseTags = [
    { id: 'tag-1', label: 'bug' },
    { id: 'tag-2', label: 'feature' },
  ];

  it('renders existing tags', () => {
    render(<TagInput tags={baseTags} onAdd={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByText('bug')).toBeInTheDocument();
    expect(screen.getByText('feature')).toBeInTheDocument();
  });

  it('allows adding a new tag via Enter', () => {
    const onAdd = vi.fn();
    render(<TagInput tags={[]} onAdd={onAdd} onRemove={vi.fn()} />);
    const input = screen.getByTestId('tag-input-field');
    fireEvent.change(input, { target: { value: 'new-tag' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onAdd).toHaveBeenCalledWith('new-tag');
  });

  it('calls onRemove when chip remove button is clicked', () => {
    const onRemove = vi.fn();
    render(<TagInput tags={baseTags} onAdd={vi.fn()} onRemove={onRemove} />);
    const removeBtn = screen.getByLabelText('Remove tag bug');
    fireEvent.click(removeBtn);
    expect(onRemove).toHaveBeenCalledWith('tag-1');
  });

  it('shows autocomplete suggestions when typing', () => {
    render(
      <TagInput
        tags={[]}
        suggestions={['bug', 'feature', 'docs']}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    const input = screen.getByTestId('tag-input-field');
    fireEvent.change(input, { target: { value: 'doc' } });
    fireEvent.focus(input);
    expect(screen.getByTestId('tag-suggestions')).toBeInTheDocument();
    expect(screen.getByText('docs')).toBeInTheDocument();
  });
});

// ---------- CommentInput ----------

describe('CommentInput', () => {
  const baseComments = [
    { id: 'c-1', content: 'First comment', createdAt: '2024-06-01T10:00:00Z' },
    { id: 'c-2', content: 'Second comment', createdAt: '2024-06-02T12:00:00Z' },
  ];

  it('renders existing comments', () => {
    render(<CommentInput comments={baseComments} onAdd={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByText('First comment')).toBeInTheDocument();
    expect(screen.getByText('Second comment')).toBeInTheDocument();
  });

  it('adds a comment on submit button click', () => {
    const onAdd = vi.fn();
    render(<CommentInput comments={[]} onAdd={onAdd} onRemove={vi.fn()} />);
    const textarea = screen.getByTestId('comment-textarea');
    fireEvent.change(textarea, { target: { value: 'New comment' } });
    const submitBtn = screen.getByTestId('comment-submit');
    fireEvent.click(submitBtn);
    expect(onAdd).toHaveBeenCalledWith('New comment');
  });

  it('adds a comment on Ctrl+Enter', () => {
    const onAdd = vi.fn();
    render(<CommentInput comments={[]} onAdd={onAdd} onRemove={vi.fn()} />);
    const textarea = screen.getByTestId('comment-textarea');
    fireEvent.change(textarea, { target: { value: 'Keyboard comment' } });
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });
    expect(onAdd).toHaveBeenCalledWith('Keyboard comment');
  });

  it('calls onRemove when delete button is clicked', () => {
    const onRemove = vi.fn();
    render(<CommentInput comments={baseComments} onAdd={vi.fn()} onRemove={onRemove} />);
    const deleteBtns = screen.getAllByTestId('comment-delete');
    fireEvent.click(deleteBtns[0]!);
    expect(onRemove).toHaveBeenCalledWith('c-1');
  });
});

// ---------- AnnotationPanel ----------

describe('AnnotationPanel', () => {
  const target: AnnotationTarget = { type: 'turn', id: 'turn-1', sessionId: 'sess-1' };

  const makeCallbacks = (): AnnotationCallbacks => ({
    onCreateAnnotation: vi.fn(),
    onAddTag: vi.fn(),
    onRemoveTag: vi.fn(),
    onAddComment: vi.fn(),
    onRemoveComment: vi.fn(),
    onDeleteAnnotation: vi.fn(),
  });

  const sampleAnnotation: Annotation = {
    id: 'ann-1',
    target,
    tags: [{ id: 'tag-1', label: 'important' }],
    comments: [{ id: 'c-1', content: 'A note', createdAt: '2024-06-01T10:00:00Z' }],
    createdAt: '2024-06-01T09:00:00Z',
  };

  it('shows annotations for target when expanded', () => {
    const callbacks = makeCallbacks();
    render(
      <AnnotationPanel
        target={target}
        annotations={[sampleAnnotation]}
        callbacks={callbacks}
        defaultExpanded={true}
      />,
    );
    expect(screen.getByText('important')).toBeInTheDocument();
    expect(screen.getByText('A note')).toBeInTheDocument();
  });

  it('shows "Add annotation" button when empty and expanded', () => {
    const callbacks = makeCallbacks();
    render(
      <AnnotationPanel
        target={target}
        annotations={[]}
        callbacks={callbacks}
        defaultExpanded={true}
      />,
    );
    expect(screen.getByTestId('annotation-create')).toBeInTheDocument();
  });

  it('is collapsible — body hidden by default', () => {
    const callbacks = makeCallbacks();
    render(
      <AnnotationPanel target={target} annotations={[sampleAnnotation]} callbacks={callbacks} />,
    );
    expect(screen.queryByTestId('annotation-panel-body')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('annotation-panel-toggle'));
    expect(screen.getByTestId('annotation-panel-body')).toBeInTheDocument();
  });
});

// ---------- AnnotationBadge ----------

describe('AnnotationBadge', () => {
  it('shows correct tag and comment counts', () => {
    const onClick = vi.fn();
    render(<AnnotationBadge tagCount={3} commentCount={2} onClick={onClick} />);
    expect(screen.getByTestId('badge-tag-count')).toHaveTextContent('3');
    expect(screen.getByTestId('badge-comment-count')).toHaveTextContent('2');
  });

  it('is clickable and calls onClick', () => {
    const onClick = vi.fn();
    render(<AnnotationBadge tagCount={1} commentCount={0} onClick={onClick} />);
    fireEvent.click(screen.getByTestId('annotation-badge'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when counts are zero', () => {
    const onClick = vi.fn();
    const { container } = render(<AnnotationBadge tagCount={0} commentCount={0} onClick={onClick} />);
    expect(container.innerHTML).toBe('');
  });
});

// ---------- FilterByTag ----------

describe('FilterByTag', () => {
  const tags = [
    { label: 'bug', count: 5 },
    { label: 'feature', count: 3 },
    { label: 'docs', count: 1 },
  ];

  it('renders available tags', () => {
    render(<FilterByTag tags={tags} selectedTags={[]} onFilterChange={vi.fn()} />);
    expect(screen.getByTestId('filter-chip-bug')).toBeInTheDocument();
    expect(screen.getByTestId('filter-chip-feature')).toBeInTheDocument();
    expect(screen.getByTestId('filter-chip-docs')).toBeInTheDocument();
  });

  it('toggles tag selection on click', () => {
    const onFilterChange = vi.fn();
    render(<FilterByTag tags={tags} selectedTags={[]} onFilterChange={onFilterChange} />);
    fireEvent.click(screen.getByTestId('filter-chip-bug'));
    expect(onFilterChange).toHaveBeenCalledWith(['bug']);
  });

  it('calls onFilterChange with selected tags (remove on second click)', () => {
    const onFilterChange = vi.fn();
    render(<FilterByTag tags={tags} selectedTags={['bug']} onFilterChange={onFilterChange} />);
    fireEvent.click(screen.getByTestId('filter-chip-bug'));
    expect(onFilterChange).toHaveBeenCalledWith([]);
  });

  it('"Clear all" resets selection', () => {
    const onFilterChange = vi.fn();
    render(
      <FilterByTag tags={tags} selectedTags={['bug', 'feature']} onFilterChange={onFilterChange} />,
    );
    fireEvent.click(screen.getByTestId('filter-clear-all'));
    expect(onFilterChange).toHaveBeenCalledWith([]);
  });

  it('shows item counts per tag', () => {
    render(<FilterByTag tags={tags} selectedTags={[]} onFilterChange={vi.fn()} />);
    expect(screen.getByTestId('filter-chip-bug')).toHaveTextContent('bug (5)');
    expect(screen.getByTestId('filter-chip-feature')).toHaveTextContent('feature (3)');
  });
});
