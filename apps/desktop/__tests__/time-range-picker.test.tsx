import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TimeRangePicker, type TimeRangeValue } from '../src/renderer/components/TimeRangePicker';

afterEach(() => {
  cleanup();
});

describe('TimeRangePicker', () => {
  const defaultValue: TimeRangeValue = { timeRangePreset: '7d' };

  it('renders all preset buttons', () => {
    render(<TimeRangePicker value={defaultValue} onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: '24h' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '7d' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '30d' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Custom' })).toBeInTheDocument();
  });

  it('highlights the active preset with default variant', () => {
    render(<TimeRangePicker value={{ timeRangePreset: '30d' }} onChange={vi.fn()} />);

    const activeBtn = screen.getByRole('button', { name: '30d' });
    const inactiveBtn = screen.getByRole('button', { name: '24h' });

    // Active preset uses "default" variant → bg-primary class
    // Inactive uses "outline" variant → border-input class
    expect(activeBtn.className).toContain('bg-primary');
    expect(inactiveBtn.className).toContain('border-input');
  });

  it('calls onChange with correct preset when a preset button is clicked', () => {
    const onChange = vi.fn();

    render(<TimeRangePicker value={defaultValue} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: '24h' }));

    expect(onChange).toHaveBeenCalledWith({ timeRangePreset: '24h' });
  });

  it('shows date inputs when timeRangePreset is "custom"', () => {
    render(
      <TimeRangePicker
        value={{ timeRangePreset: 'custom', customStartDate: '2024-01-01', customEndDate: '2024-01-31' }}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Start')).toBeInTheDocument();
    expect(screen.getByLabelText('End')).toBeInTheDocument();
  });

  it('hides date inputs for non-custom presets', () => {
    render(<TimeRangePicker value={{ timeRangePreset: '7d' }} onChange={vi.fn()} />);

    expect(screen.queryByLabelText('Start')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('End')).not.toBeInTheDocument();
  });

  it('calls onChange with updated value when custom date is changed', () => {
    const onChange = vi.fn();
    const value: TimeRangeValue = {
      timeRangePreset: 'custom',
      customStartDate: '2024-01-01',
      customEndDate: '2024-01-31',
    };

    render(<TimeRangePicker value={value} onChange={onChange} />);

    const startInput = screen.getByLabelText('Start');
    fireEvent.change(startInput, { target: { value: '2024-06-15' } });

    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1]![0] as TimeRangeValue;
    expect(lastCall.timeRangePreset).toBe('custom');
    expect(lastCall.customStartDate).toBe('2024-06-15');
  });
});
