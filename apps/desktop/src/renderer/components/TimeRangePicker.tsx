import { Button, FlexRow, Text } from '@epam/uui';

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Text fontSize="14" fontWeight="600">Time Range</Text>
      <FlexRow spacing="6">
        {PRESETS.map((preset) => (
          <Button
            key={preset.value}
            caption={preset.label}
            size="30"
            color={value.timeRangePreset === preset.value ? 'primary' : 'secondary'}
            fill={value.timeRangePreset === preset.value ? 'solid' : 'outline'}
            rawProps={{ 'aria-pressed': value.timeRangePreset === preset.value }}
            onClick={() => handlePresetClick(preset.value)}
          />
        ))}
      </FlexRow>
      {value.timeRangePreset === 'custom' && (
        <FlexRow spacing="12" alignItems="top">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Text fontSize="12" color="secondary">Start</Text>
            <input
              id="custom-start-date"
              aria-label="Start"
              type="date"
              value={value.customStartDate ?? ''}
              onChange={(e) =>
                onChange({ ...value, customStartDate: e.target.value || undefined })
              }
              style={{ padding: '6px 8px', borderRadius: 4, border: '1px solid var(--uui-neutral-40)', fontSize: 14 }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Text fontSize="12" color="secondary">End</Text>
            <input
              id="custom-end-date"
              aria-label="End"
              type="date"
              value={value.customEndDate ?? ''}
              onChange={(e) =>
                onChange({ ...value, customEndDate: e.target.value || undefined })
              }
              style={{ padding: '6px 8px', borderRadius: 4, border: '1px solid var(--uui-neutral-40)', fontSize: 14 }}
            />
          </div>
        </FlexRow>
      )}
    </div>
  );
}

