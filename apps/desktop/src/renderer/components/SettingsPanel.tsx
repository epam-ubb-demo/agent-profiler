import type { AppInsightsSettingsIpc, TestConnectionResultIpc } from '@agent-profiler/core';
import { CheckCircle, Loader2, Settings, XCircle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { TimeRangePicker } from '@/components/TimeRangePicker';
import type { TimeRangeValue } from '@/components/TimeRangePicker';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

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

  // Load settings when the dialog opens
  useEffect(() => {
    if (!open) return;

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
      workspaceId,
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
    try {
      await window.electronApi.settings.set(buildSettings());
      onSettingsSaved?.();
      setOpen(false);
    } catch {
      // Save failed — keep dialog open so user can retry
    } finally {
      setSaving(false);
    }
  }, [buildSettings, onSettingsSaved]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Settings">
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Application Insights Settings</DialogTitle>
          <DialogDescription>
            Connect to Azure Application Insights to browse cloud-hosted sessions.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* Workspace ID */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="workspace-id" className="text-sm font-medium">
              Workspace ID
            </label>
            <input
              id="workspace-id"
              type="text"
              value={workspaceId}
              onChange={(e) => {
                setWorkspaceId(e.target.value);
                setTestResult(null);
              }}
              placeholder="Enter your Log Analytics Workspace ID"
              className={cn(
                'rounded-md border border-input bg-background px-3 py-2 text-sm',
                'placeholder:text-muted-foreground',
                'focus:outline-none focus:ring-1 focus:ring-ring',
              )}
            />
          </div>

          {/* Time Range Picker */}
          <TimeRangePicker value={timeRange} onChange={setTimeRange} />

          {/* Test Connection */}
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleTestConnection()}
              disabled={testing || !workspaceId.trim()}
            >
              {testing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Testing…
                </>
              ) : (
                'Test Connection'
              )}
            </Button>

            {testResult && (
              <div
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm',
                  testResult.success
                    ? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300'
                    : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
                )}
              >
                {testResult.success ? (
                  <>
                    <CheckCircle className="h-4 w-4 shrink-0" />
                    <span>
                      Connected — {testResult.sessionCount ?? 0} sessions found
                    </span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 shrink-0" />
                    <span>{testResult.error ?? 'Connection failed'}</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              'Save'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
