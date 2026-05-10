import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** The set of allowed time-range presets. */
export type TimeRangePreset = '24h' | '7d' | '30d' | 'custom';

/** Value shape for the TimeRangePicker — matches the settings schema. */
export interface TimeRangeValue {
  timeRangePreset: TimeRangePreset;
  customStartDate?: string | undefined;
  customEndDate?: string | undefined;
}

export interface TimeRangePickerProps {
  readonly value: TimeRangeValue;
  readonly onChange: (value: TimeRangeValue) => void;
}

const PRESETS: { label: string; value: TimeRangePreset }[] = [
  { label: '24h', value: '24h' },
  { label: '7d', value: '7d' },
  { label: '30d', value: '30d' },
  { label: 'Custom', value: 'custom' },
];

export function TimeRangePicker({ value, onChange }: TimeRangePickerProps) {
  const handlePresetClick = (preset: TimeRangePreset) => {
    if (preset === 'custom') {
      onChange({
        timeRangePreset: 'custom',
        customStartDate: value.customStartDate,
        customEndDate: value.customEndDate,
      });
    } else {
      onChange({ timeRangePreset: preset });
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <label className="text-sm font-medium">Time Range</label>
      <div className="flex gap-2">
        {PRESETS.map((preset) => (
          <Button
            key={preset.value}
            type="button"
            size="sm"
            variant={value.timeRangePreset === preset.value ? 'default' : 'outline'}
            aria-pressed={value.timeRangePreset === preset.value}
            onClick={() => handlePresetClick(preset.value)}
          >
            {preset.label}
          </Button>
        ))}
      </div>
      {value.timeRangePreset === 'custom' && (
        <div className="flex items-center gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="custom-start-date" className="text-xs text-muted-foreground">
              Start
            </label>
            <input
              id="custom-start-date"
              type="date"
              value={value.customStartDate ?? ''}
              onChange={(e) =>
                onChange({
                  ...value,
                  customStartDate: e.target.value || undefined,
                })
              }
              className={cn(
                'rounded-md border border-input bg-background px-3 py-1.5 text-sm',
                'focus:outline-none focus:ring-1 focus:ring-ring',
              )}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="custom-end-date" className="text-xs text-muted-foreground">
              End
            </label>
            <input
              id="custom-end-date"
              type="date"
              value={value.customEndDate ?? ''}
              onChange={(e) =>
                onChange({
                  ...value,
                  customEndDate: e.target.value || undefined,
                })
              }
              className={cn(
                'rounded-md border border-input bg-background px-3 py-1.5 text-sm',
                'focus:outline-none focus:ring-1 focus:ring-ring',
              )}
            />
          </div>
        </div>
      )}
    </div>
  );
}
