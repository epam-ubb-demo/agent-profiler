import type { AppInsightsSettingsIpc, TestConnectionResultIpc } from '@agent-profiler/core';
import { Button, FlexRow, ModalFooter, ModalHeader, Panel, Text, TextInput } from '@epam/uui';
import { CheckCircle, Loader2, Settings, XCircle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { TimeRangePicker } from '@/components/TimeRangePicker';
import type { TimeRangeValue } from '@/components/TimeRangePicker';

export interface SettingsPanelProps {
  /** Called after settings are saved so the parent can refresh data. */
  readonly onSettingsSaved?: (() => void) | undefined;
}

const DEFAULT_SETTINGS: AppInsightsSettingsIpc = {
  workspaceId: '',
  timeRangePreset: '7d',
};

export function SettingsPanel({ onSettingsSaved }: SettingsPanelProps) {
  const [open, setOpen] = useState(false);
  const [workspaceId, setWorkspaceId] = useState('');
  const [timeRange, setTimeRange] = useState<TimeRangeValue>({
    timeRangePreset: '7d',
  });
  const [testResult, setTestResult] = useState<TestConnectionResultIpc | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Load settings when the dialog opens
  useEffect(() => {
    if (!open) return;

    setSaveError(null);

    let cancelled = false;

    void (async () => {
      try {
        const settings = await window.electronApi.settings.get();
        if (cancelled) return;
        setWorkspaceId(settings.workspaceId);
        setTimeRange({
          timeRangePreset: settings.timeRangePreset,
          customStartDate: settings.customStartDate,
          customEndDate: settings.customEndDate,
        });
      } catch {
        if (cancelled) return;
        setWorkspaceId(DEFAULT_SETTINGS.workspaceId);
        setTimeRange({ timeRangePreset: DEFAULT_SETTINGS.timeRangePreset });
      }
      setTestResult(null);
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  const buildSettings = useCallback((): AppInsightsSettingsIpc => {
    return {
      workspaceId: workspaceId.trim(),
      timeRangePreset: timeRange.timeRangePreset,
      ...(timeRange.customStartDate ? { customStartDate: timeRange.customStartDate } : {}),
      ...(timeRange.customEndDate ? { customEndDate: timeRange.customEndDate } : {}),
    };
  }, [workspaceId, timeRange]);

  const handleTestConnection = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      // Save settings first so the main process has the latest values
      await window.electronApi.settings.set(buildSettings());
      const result = await window.electronApi.settings.testConnection();
      setTestResult(result);
    } catch (err) {
      setTestResult({
        success: false,
        error: err instanceof Error ? err.message : 'Connection test failed',
      });
    } finally {
      setTesting(false);
    }
  }, [buildSettings]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await window.electronApi.settings.set(buildSettings());
      onSettingsSaved?.();
      setOpen(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }, [buildSettings, onSettingsSaved]);

  const handleClose = useCallback(() => setOpen(false), []);

  return (
    <>
      <Button
        caption="Settings"
        icon={Settings}
        fill="none"
        color="secondary"
        size="36"
        aria-label="Settings"
        onClick={() => setOpen(true)}
      />

      {open && (
        <>
          {/* Backdrop */}
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.4)',
              zIndex: 1000,
            }}
            onClick={handleClose}
            aria-hidden="true"
          />

          {/* Dialog */}
          <Panel
            shadow
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 460,
              zIndex: 1001,
              borderRadius: 6,
              overflow: 'hidden',
            }}
            rawProps={{ role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'settings-dialog-title' }}
          >
            <ModalHeader
              title={<span id="settings-dialog-title">Application Insights Settings</span>}
              onClose={handleClose}
            />

            <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Text color="secondary" fontSize="14">
                Connect to Azure Application Insights to browse cloud-hosted sessions.
              </Text>

              {/* Workspace ID */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Text fontSize="14" fontWeight="600">
                  <label htmlFor="workspace-id">Workspace ID</label>
                </Text>
                <TextInput
                  id="workspace-id"
                  value={workspaceId}
                  onValueChange={(v) => {
                    setWorkspaceId(v ?? '');
                    setTestResult(null);
                    setSaveError(null);
                  }}
                  placeholder="Enter your Log Analytics Workspace ID"
                  size="36"
                />
              </div>

              {/* Time Range Picker */}
              <TimeRangePicker value={timeRange} onChange={setTimeRange} />

              {/* Test Connection */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Button
                  caption={
                    testing ? 'Testing…' : 'Test Connection'
                  }
                  icon={testing ? Loader2 : undefined}
                  fill="outline"
                  color="secondary"
                  size="30"
                  isDisabled={testing || !workspaceId.trim()}
                  onClick={() => void handleTestConnection()}
                />

                {testResult && (
                  <FlexRow spacing="6" alignItems="center">
                    {testResult.success ? (
                      <>
                        <CheckCircle size={16} style={{ color: 'var(--uui-success-50)', flexShrink: 0 }} />
                        <Text fontSize="13" color="success">
                          Connected — {testResult.sessionCount ?? 0} sessions found
                        </Text>
                      </>
                    ) : (
                      <>
                        <XCircle size={16} style={{ color: 'var(--uui-critical-50)', flexShrink: 0 }} />
                        <Text fontSize="13" color="critical">
                          {testResult.error ?? 'Connection failed'}
                        </Text>
                      </>
                    )}
                  </FlexRow>
                )}
              </div>
            </div>

            <ModalFooter borderTop>
              <FlexRow spacing="12" justifyContent="end">
                {saveError && (
                  <FlexRow spacing="6" alignItems="center">
                    <XCircle size={16} style={{ color: 'var(--uui-critical-50)', flexShrink: 0 }} />
                    <Text fontSize="13" color="critical">{saveError}</Text>
                  </FlexRow>
                )}
                <Button
                  caption={saving ? 'Saving…' : 'Save'}
                  icon={saving ? Loader2 : undefined}
                  color="primary"
                  size="36"
                  isDisabled={saving}
                  onClick={() => void handleSave()}
                />
              </FlexRow>
            </ModalFooter>
          </Panel>
        </>
      )}
    </>
  );
}

