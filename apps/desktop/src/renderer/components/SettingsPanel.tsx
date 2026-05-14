import type { AppInsightsSettingsIpc, LogAnalyticsWorkspaceIpc, SyncSettingsIpc, TestConnectionResultIpc } from '@agent-profiler/core';
import { Button, Checkbox, FlexRow, ModalFooter, ModalHeader, Panel, PickerInput, Switch, Text, TextInput } from '@epam/uui';
import { useArrayDataSource } from '@epam/uui-core';
import { CheckCircle, Loader2, Search, Settings, XCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

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

const DEFAULT_SYNC_SETTINGS: SyncSettingsIpc = {
  enabled: false,
  categories: { metadata: true, utilisation: true, compactions: true, toolResults: false },
  dceEndpoint: '',
  dcrImmutableId: '',
  dcrStreamName: '',
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
  const [workspaces, setWorkspaces] = useState<LogAnalyticsWorkspaceIpc[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [discoverError, setDiscoverError] = useState<string | null>(null);

  // Sync settings state
  const [syncEnabled, setSyncEnabled] = useState(DEFAULT_SYNC_SETTINGS.enabled);
  const [syncCategories, setSyncCategories] = useState(DEFAULT_SYNC_SETTINGS.categories);
  const [dceEndpoint, setDceEndpoint] = useState(DEFAULT_SYNC_SETTINGS.dceEndpoint);
  const [dcrImmutableId, setDcrImmutableId] = useState(DEFAULT_SYNC_SETTINGS.dcrImmutableId);
  const [dcrStreamName, setDcrStreamName] = useState(DEFAULT_SYNC_SETTINGS.dcrStreamName);
  const [syncTriggering, setSyncTriggering] = useState(false);

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

      try {
        const syncSettings = await window.electronApi.sync.getSettings();
        if (cancelled) return;
        setSyncEnabled(syncSettings.enabled);
        setSyncCategories(syncSettings.categories);
        setDceEndpoint(syncSettings.dceEndpoint);
        setDcrImmutableId(syncSettings.dcrImmutableId);
        setDcrStreamName(syncSettings.dcrStreamName);
      } catch {
        if (cancelled) return;
        setSyncEnabled(DEFAULT_SYNC_SETTINGS.enabled);
        setSyncCategories(DEFAULT_SYNC_SETTINGS.categories);
        setDceEndpoint(DEFAULT_SYNC_SETTINGS.dceEndpoint);
        setDcrImmutableId(DEFAULT_SYNC_SETTINGS.dcrImmutableId);
        setDcrStreamName(DEFAULT_SYNC_SETTINGS.dcrStreamName);
      }
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
      await window.electronApi.sync.setSettings({
        enabled: syncEnabled,
        categories: syncCategories,
        dceEndpoint: dceEndpoint.trim(),
        dcrImmutableId: dcrImmutableId.trim(),
        dcrStreamName: dcrStreamName.trim(),
      });
      onSettingsSaved?.();
      setOpen(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }, [buildSettings, onSettingsSaved, syncEnabled, syncCategories, dceEndpoint, dcrImmutableId, dcrStreamName]);

  const handleSyncNow = useCallback(async () => {
    setSyncTriggering(true);
    try {
      await window.electronApi.sync.trigger();
    } finally {
      setSyncTriggering(false);
    }
  }, []);

  const handleClose = useCallback(() => setOpen(false), []);

  const handleDiscoverWorkspaces = useCallback(async () => {
    setDiscovering(true);
    setDiscoverError(null);
    try {
      const result = await window.electronApi.settings.listWorkspaces();
      if (result.success) {
        setWorkspaces(result.workspaces);
      } else {
        setDiscoverError(result.error);
        setWorkspaces([]);
      }
    } catch (err) {
      setDiscoverError(err instanceof Error ? err.message : 'Failed to discover workspaces.');
      setWorkspaces([]);
    } finally {
      setDiscovering(false);
    }
  }, []);

  const workspaceItems = useMemo(
    () =>
      workspaces.map((w) => ({
        id: w.customerId,
        name: `${w.name} (${w.resourceGroup})`,
      })),
    [workspaces],
  );

  const workspaceDataSource = useArrayDataSource({ items: workspaceItems }, [workspaceItems]);

  return (
    <>
      <Button
        caption="Open remote session"
        icon={Settings}
        fill="none"
        color="secondary"
        size="36"
        aria-label="Open remote session"
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
              background: 'var(--uui-surface-main)',
            }}
            rawProps={{ role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'settings-dialog-title' }}
          >
            <ModalHeader
              title={<span id="settings-dialog-title">Application Insights Settings</span>}
              onClose={handleClose}
            />

            <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 16, maxHeight: 'calc(80vh - 120px)', overflowY: 'auto' }}>
              <Text color="secondary" fontSize="14">
                Connect to Azure Application Insights to browse cloud-hosted sessions.
              </Text>

              {/* Workspace ID */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <FlexRow spacing="6" alignItems="center">
                  <Text fontSize="14" fontWeight="600">
                    <label htmlFor="workspace-id">Workspace ID</label>
                  </Text>
                  <Button
                    caption={discovering ? 'Discovering…' : 'Discover'}
                    icon={discovering ? Loader2 : Search}
                    fill="outline"
                    color="secondary"
                    size="24"
                    isDisabled={discovering}
                    onClick={() => void handleDiscoverWorkspaces()}
                  />
                </FlexRow>

                {workspaceItems.length > 0 && (
                  <PickerInput
                    dataSource={workspaceDataSource}
                    value={workspaceId || null}
                    onValueChange={(v: string | null) => {
                      setWorkspaceId(v ?? '');
                      setTestResult(null);
                      setSaveError(null);
                    }}
                    selectionMode="single"
                    valueType="id"
                    placeholder="Select a workspace…"
                    size="36"
                  />
                )}

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

                {discoverError && (
                  <FlexRow spacing="6" alignItems="center">
                    <XCircle size={16} style={{ color: 'var(--uui-critical-50)', flexShrink: 0 }} />
                    <Text fontSize="13" color="critical">{discoverError}</Text>
                  </FlexRow>
                )}
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

              {/* ── Sync to remote workspace ─────────────────────────── */}
              <div
                style={{
                  borderTop: '1px solid var(--uui-neutral-40)',
                  paddingTop: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <Text fontSize="14" fontWeight="600">Sync to remote workspace</Text>
                  <Text color="secondary" fontSize="12">
                    Push local session data (utilisation, compactions, tool results) to your remote
                    workspace for complete visibility.
                  </Text>
                </div>

                <Switch
                  value={syncEnabled}
                  onValueChange={setSyncEnabled}
                  label="Enable auto-sync"
                />

                {syncEnabled && (
                  <>
                    {/* Category checkboxes */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <Text fontSize="13" fontWeight="600">Categories to sync</Text>
                      <Checkbox
                        value={syncCategories.metadata}
                        onValueChange={(v) =>
                          setSyncCategories((prev) => ({ ...prev, metadata: v }))
                        }
                        label="Metadata (copilot version, model, etc.)"
                      />
                      <Checkbox
                        value={syncCategories.utilisation}
                        onValueChange={(v) =>
                          setSyncCategories((prev) => ({ ...prev, utilisation: v }))
                        }
                        label="Utilisation data"
                      />
                      <Checkbox
                        value={syncCategories.compactions}
                        onValueChange={(v) =>
                          setSyncCategories((prev) => ({ ...prev, compactions: v }))
                        }
                        label="Compactions"
                      />
                      <Checkbox
                        value={syncCategories.toolResults}
                        onValueChange={(v) =>
                          setSyncCategories((prev) => ({ ...prev, toolResults: v }))
                        }
                        label="Tool results (may include sensitive data)"
                      />
                    </div>

                    {/* Azure configuration */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <Text fontSize="13" fontWeight="600">Azure configuration</Text>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <Text fontSize="13">
                          <label htmlFor="dce-endpoint">DCE Endpoint URL</label>
                        </Text>
                        <TextInput
                          id="dce-endpoint"
                          value={dceEndpoint}
                          onValueChange={(v) => setDceEndpoint(v ?? '')}
                          placeholder="https://my-dce.eastus-1.ingest.monitor.azure.com"
                          size="36"
                        />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <Text fontSize="13">
                          <label htmlFor="dcr-immutable-id">DCR Immutable ID</label>
                        </Text>
                        <TextInput
                          id="dcr-immutable-id"
                          value={dcrImmutableId}
                          onValueChange={(v) => setDcrImmutableId(v ?? '')}
                          placeholder="dcr-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                          size="36"
                        />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <Text fontSize="13">
                          <label htmlFor="dcr-stream-name">DCR Stream Name</label>
                        </Text>
                        <TextInput
                          id="dcr-stream-name"
                          value={dcrStreamName}
                          onValueChange={(v) => setDcrStreamName(v ?? '')}
                          placeholder="Custom-AgentProfilerEnrichment_CL"
                          size="36"
                        />
                      </div>
                    </div>
                  </>
                )}

                <Button
                  caption={syncTriggering ? 'Syncing…' : 'Sync now'}
                  {...(syncTriggering ? { icon: Loader2 } : {})}
                  fill="outline"
                  color="secondary"
                  size="30"
                  isDisabled={syncTriggering}
                  onClick={() => void handleSyncNow()}
                />
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

