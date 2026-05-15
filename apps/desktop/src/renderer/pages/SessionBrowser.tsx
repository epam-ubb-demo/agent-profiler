import { calculateCost, DEFAULT_PRICING_TABLE } from '@agent-profiler/pricing';
import type { TokenUsage } from '@agent-profiler/pricing';
import { Badge, Button, FlexRow, FlexSpacer, Panel, PickerInput, RangeDatePicker, Spinner, Text, TextInput, Tooltip } from '@epam/uui';
import { useArrayDataSource } from '@epam/uui-core';
import { ArrowDownToLine, ArrowUpFromLine, Clock, DollarSign, Recycle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { SessionListItemIpc, SessionListMetricsIpc } from '../../preload/api';

import styles from './SessionBrowser.module.css';

import { CacheHitRateChart } from '@/components/CacheHitRateChart';
import { CombinedAnalyticsChart } from '@/components/CombinedAnalyticsChart';
import type { DailyAnalytics, Granularity } from '@/components/CombinedAnalyticsChart';
import { EmptyState } from '@/components/EmptyState';
import { FolderOpenIcon, SearchIcon } from '@/components/icons';
import { ModelBreakdownTable } from '@/components/ModelBreakdownTable';
import { SettingsPanel } from '@/components/SettingsPanel';

// ── Adapter display config ────────────────────────────────────────────────────

const ADAPTER_LABELS: Record<string, string> = {
  'copilot-cli': 'Copilot CLI',
  'vscode-chat': 'VS Code Chat',
  'vscode-agent': 'VS Code Agent',
  'ctb': 'CTB',
  'application-insights': 'App Insights',
};

const ADAPTER_COLOURS: Record<string, 'info' | 'success' | 'warning' | 'critical' | 'neutral'> = {
  'copilot-cli': 'info',
  'vscode-chat': 'success',
  'vscode-agent': 'warning',
  'ctb': 'neutral',
  'application-insights': 'critical',
};

const ADAPTER_OPTIONS = Object.entries(ADAPTER_LABELS).map(([id, name]) => ({ id, name }));

const LOCAL_ADAPTERS = new Set(['copilot-cli', 'vscode-chat', 'vscode-agent', 'ctb']);
const REMOTE_ADAPTERS = new Set(['application-insights']);

// ── Formatting helpers ────────────────────────────────────────────────────────

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatCost(usd: number | null, confidence: string): string {
  if (usd === null) return '—';
  const prefix = confidence === 'estimated' ? '~' : '';
  return `${prefix}$${usd.toFixed(2)}`;
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return '<1m';
}

// ── Day-grouping helpers ──────────────────────────────────────────────────────

function toLocalDateKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDayLabel(dateKey: string): string {
  const today = toLocalDateKey(new Date().toISOString());
  const yesterday = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return toLocalDateKey(d.toISOString());
  })();
  if (dateKey === today) return 'Today';
  if (dateKey === yesterday) return 'Yesterday';
  const [y, m, day] = dateKey.split('-').map(Number);
  return new Date(y!, m! - 1, day!).toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function groupByDay(
  sessions: SessionListItemIpc[],
): Array<{ dateKey: string; items: SessionListItemIpc[] }> {
  const map = new Map<string, SessionListItemIpc[]>();
  for (const s of sessions) {
    const key = toLocalDateKey(s.createdAt);
    const group = map.get(key);
    if (group) group.push(s);
    else map.set(key, [s]);
  }
  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([dateKey, items]) => ({ dateKey, items }));
}

// ── SessionCard sub-component ─────────────────────────────────────────────────

interface SessionCardProps {
  readonly session: SessionListItemIpc;
  readonly onClick: () => void;
}

function SessionCard({ session, onClick }: SessionCardProps) {
  const m: SessionListMetricsIpc | null = session.metrics;
  const adapterLabel = ADAPTER_LABELS[session.adapter] ?? session.adapter;
  const adapterColour = ADAPTER_COLOURS[session.adapter] ?? 'neutral';

  return (
    <Panel
      shadow
      cx={styles.sessionCard}
      onClick={onClick}
      rawProps={{
        'data-testid': 'session-card',
        role: 'button',
        tabIndex: 0,
        'aria-label': session.name,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') onClick();
        },
      }}
    >
      <div className={styles.cardContent}>
        {/* Row 1: title + adapter badge */}
        <FlexRow spacing="6" alignItems="center">
          <Text size="18" fontWeight="600" cx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {session.name}
          </Text>
          <FlexSpacer />
          <Badge
            color={adapterColour}
            fill="outline"
            caption={adapterLabel}
            size="18"
            rawProps={{ 'data-testid': 'adapter-badge' }}
          />
        </FlexRow>

        {/* Row 2: unified metrics strip — two rows */}
        {m && (
          <div className={styles.metricsGrid} data-testid="metrics-row">
            <div className={styles.metricsSubRow}>
              <Tooltip content={`Cost confidence: ${m.costConfidence}`}>
                <div className={styles.metricPill} data-metric="cost" data-testid="cost-pill">
                  <DollarSign size={14} />
                  <span className={styles.metricLabel}>Cost</span>
                  <span className={styles.metricValue}>{formatCost(m.totalCostUsd, m.costConfidence)}</span>
                </div>
              </Tooltip>
              <Tooltip content={`Wall-clock time: ${formatDuration(m.wallTimeMs)}`}>
                <div className={styles.metricPill} data-metric="time" data-testid="duration-pill">
                  <Clock size={14} />
                  <span className={styles.metricLabel}>Time</span>
                  <span className={styles.metricValue}>{formatDuration(m.wallTimeMs)}</span>
                </div>
              </Tooltip>
            </div>
            <div className={styles.metricsSubRow}>
              <Tooltip content={`Input tokens: ${m.totalInputTokens.toLocaleString()}`}>
                <div className={styles.metricPill} data-metric="in" data-testid="token-input-pill">
                  <ArrowDownToLine size={14} />
                  <span className={styles.metricLabel}>In</span>
                  <span className={styles.metricValue}>{formatTokenCount(m.totalInputTokens)}</span>
                </div>
              </Tooltip>
              <Tooltip content={`Output tokens: ${m.totalOutputTokens.toLocaleString()}`}>
                <div className={styles.metricPill} data-metric="out" data-testid="token-output-pill">
                  <ArrowUpFromLine size={14} />
                  <span className={styles.metricLabel}>Out</span>
                  <span className={styles.metricValue}>{formatTokenCount(m.totalOutputTokens)}</span>
                </div>
              </Tooltip>
              <Tooltip content={`Cache-read tokens: ${m.totalCacheReadTokens.toLocaleString()}`}>
                <div className={styles.metricPill} data-metric="cached" data-testid="token-cache-pill">
                  <Recycle size={14} />
                  <span className={styles.metricLabel}>Cached</span>
                  <span className={styles.metricValue}>{formatTokenCount(m.totalCacheReadTokens)}</span>
                </div>
              </Tooltip>
            </div>
          </div>
        )}

        {/* Row 4: repository + date + path */}
        <div className={styles.cardMeta}>
          {m?.repository && (
            <div
              className={styles.repoText}
              data-testid="session-repository"
              title={m.repository}
            >
              {m.repository}
            </div>
          )}
          <FlexRow spacing="6" alignItems="center">
            <Text size="18" color="secondary">
              {new Date(session.createdAt).toLocaleString()}
            </Text>
          </FlexRow>
          <Tooltip content={session.path}>
            <div className={styles.pathText} title={session.path}>
              {session.path}
            </div>
          </Tooltip>
        </div>
      </div>
    </Panel>
  );
}

// ── Granularity ───────────────────────────────────────────────────────────────

/** Returns the Monday of the ISO week containing `dateStr` (YYYY-MM-DD). */
function weekStart(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y!, m! - 1, d!);
  const dow = dt.getDay(); // 0=Sun
  const diff = dow === 0 ? -6 : 1 - dow;
  dt.setDate(dt.getDate() + diff);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/** Returns the first day of the month for `dateStr`. */
function monthStart(dateStr: string): string {
  return dateStr.slice(0, 7) + '-01';
}

/** Re-buckets daily analytics into weekly or monthly aggregates. */
function rebucket(data: ReadonlyArray<DailyAnalytics>, granularity: Granularity): DailyAnalytics[] {
  if (granularity === 'day') return data as DailyAnalytics[];

  const bucketKey = granularity === 'week' ? weekStart : monthStart;
  const map = new Map<string, {
    cost: number | null;
    wallTimeMs: number | null;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    modelTokens: Map<string, { totalTokens: number; costUsd: number | null }>;
  }>();

  for (const d of data) {
    const key = bucketKey(d.date);
    const prev = map.get(key) ?? {
      cost: null,
      wallTimeMs: null,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      modelTokens: new Map(),
    };

    if (d.cost != null) prev.cost = (prev.cost ?? 0) + d.cost;
    if (d.wallTimeMs != null) prev.wallTimeMs = (prev.wallTimeMs ?? 0) + d.wallTimeMs;
    prev.inputTokens += d.inputTokens;
    prev.outputTokens += d.outputTokens;
    prev.cacheReadTokens += d.cacheReadTokens;
    prev.cacheWriteTokens += d.cacheWriteTokens;

    for (const mb of d.modelBreakdown) {
      const existing = prev.modelTokens.get(mb.model) ?? { totalTokens: 0, costUsd: null };
      existing.totalTokens += mb.totalTokens;
      if (mb.costUsd != null) existing.costUsd = (existing.costUsd ?? 0) + mb.costUsd;
      prev.modelTokens.set(mb.model, existing);
    }

    map.set(key, prev);
  }

  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, d]) => ({
      date,
      cost: d.cost,
      wallTimeMs: d.wallTimeMs,
      inputTokens: d.inputTokens,
      outputTokens: d.outputTokens,
      cacheReadTokens: d.cacheReadTokens,
      cacheWriteTokens: d.cacheWriteTokens,
      modelBreakdown: Array.from(d.modelTokens.entries()).map(([model, t]) => ({
        model,
        totalTokens: t.totalTokens,
        costUsd: t.costUsd,
      })),
    }));
}

// ── Main component ────────────────────────────────────────────────────────────

export interface SessionBrowserProps {
  /** Called when the user selects a session to view. */
  readonly onSelectSession: (sessionId: string) => void;
}

export function SessionBrowser({ onSelectSession }: SessionBrowserProps) {
  const [sessions, setSessions] = useState<SessionListItemIpc[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  // Data source toggle state
  const [dataSource, setDataSource] = useState<'local' | 'remote'>('local');
  const [appInsightsConfigured, setAppInsightsConfigured] = useState(false);

  // Filter state
  const [searchText, setSearchText] = useState('');
  const [dateRange, setDateRange] = useState<{ from: string | null; to: string | null }>({ from: null, to: null });
  const [adapterFilter, setAdapterFilter] = useState<string[]>([]);
  const [repoFilter, setRepoFilter] = useState<string[]>([]);
  const [analyticsExpanded, setAnalyticsExpanded] = useState(false);
  const [granularity, setGranularity] = useState<Granularity>('day');

  const adapterDataSource = useArrayDataSource({ items: ADAPTER_OPTIONS }, []);

  // Sessions pre-filtered by selected data source
  const sourceSessions = useMemo(() => {
    const allowed = dataSource === 'local' ? LOCAL_ADAPTERS : REMOTE_ADAPTERS;
    return sessions.filter((s) => allowed.has(s.adapter));
  }, [sessions, dataSource]);

  const repoOptions = useMemo(() => {
    const repos = new Set<string>();
    for (const s of sourceSessions) {
      if (s.metrics?.repository) {
        repos.add(s.metrics.repository);
      }
    }
    return Array.from(repos)
      .sort()
      .map((r) => ({ id: r, name: r }));
  }, [sourceSessions]);

  const repoDataSource = useArrayDataSource({ items: repoOptions }, [repoOptions]);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const [list, scanningState] = await Promise.all([
        window.electronApi.session.list(),
        window.electronApi.session.getScanningState(),
      ]);
      setSessions(list);
      setScanning(scanningState);
    } catch (err) {
      console.error('Failed to load sessions:', err);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const checkAppInsightsConfigured = useCallback(async () => {
    try {
      const s = await window.electronApi.settings.get();
      setAppInsightsConfigured(s.workspaceId.trim() !== '');
    } catch {
      setAppInsightsConfigured(false);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    void checkAppInsightsConfigured();
  }, [checkAppInsightsConfigured]);

  // Subscribe to push-based session list updates
  useEffect(() => {
    const unsub = window.electronApi.session.onListUpdated((list) => {
      setSessions(list);
    });
    return unsub;
  }, []);

  // Subscribe to scanning state changes
  useEffect(() => {
    const unsub = window.electronApi.session.onScanningStateChanged(setScanning);
    return unsub;
  }, []);

  const handleOpenFolder = useCallback(async () => {
    const path = await window.electronApi.dialog.openDirectory();
    if (path) {
      const success = await window.electronApi.session.setRootDir(path);
      if (success) {
        await loadSessions();
      }
    }
  }, [loadSessions]);

  const handleSettingsSaved = useCallback(() => {
    void loadSessions();
    void checkAppInsightsConfigured();
  }, [loadSessions, checkAppInsightsConfigured]);

  const hasActiveFilters =
    searchText.trim() !== '' ||
    dateRange.from !== null ||
    dateRange.to !== null ||
    adapterFilter.length > 0 ||
    repoFilter.length > 0;

  const handleClearFilters = useCallback(() => {
    setSearchText('');
    setDateRange({ from: null, to: null });
    setAdapterFilter([]);
    setRepoFilter([]);
  }, []);

  // Filtered sessions
  const filteredSessions = useMemo(() => {
    let result = sourceSessions;

    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q) ||
          s.path.toLowerCase().includes(q) ||
          (s.metrics?.repository ?? '').toLowerCase().includes(q),
      );
    }

    if (dateRange.from) {
      const from = new Date(dateRange.from).getTime();
      result = result.filter((s) => new Date(s.createdAt).getTime() >= from);
    }

    if (dateRange.to) {
      // Include the entire "to" day by going to the end of the day
      const to = new Date(dateRange.to);
      to.setHours(23, 59, 59, 999);
      result = result.filter((s) => new Date(s.createdAt).getTime() <= to.getTime());
    }

    if (adapterFilter.length > 0) {
      result = result.filter((s) => adapterFilter.includes(s.adapter));
    }

    if (repoFilter.length > 0) {
      result = result.filter((s) => s.metrics?.repository && repoFilter.includes(s.metrics.repository));
    }

    return result;
  }, [sourceSessions, searchText, dateRange, adapterFilter, repoFilter]);

  // Sessions grouped by day
  const groupedSessions = useMemo(() => groupByDay(filteredSessions), [filteredSessions]);

  // Daily analytics for analytics panel — enriched with metrics and per-model token breakdown
  const dailyAnalytics = useMemo((): DailyAnalytics[] => {
    const pricingTable = DEFAULT_PRICING_TABLE;
    const map = new Map<string, {
      cost: number | null;
      wallTimeMs: number | null;
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens: number;
      cacheWriteTokens: number;
      modelTokens: Map<string, {
        inputTokens: number;
        outputTokens: number;
        cacheReadTokens: number;
        cacheWriteTokens: number;
      }>;
    }>();
    for (const s of filteredSessions) {
      const m = s.metrics;
      if (m) {
        const key = toLocalDateKey(s.createdAt);
        const prev = map.get(key) ?? {
          cost: null,
          wallTimeMs: null,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          modelTokens: new Map(),
        };
        if (m.totalCostUsd != null) prev.cost = (prev.cost ?? 0) + m.totalCostUsd;
        if (m.wallTimeMs != null) prev.wallTimeMs = (prev.wallTimeMs ?? 0) + m.wallTimeMs;
        prev.inputTokens += m.totalInputTokens;
        prev.outputTokens += m.totalOutputTokens;
        prev.cacheReadTokens += m.totalCacheReadTokens;
        prev.cacheWriteTokens += m.totalCacheWriteTokens;
        for (const mu of m.modelUsage ?? []) {
          const existing = prev.modelTokens.get(mu.model) ?? {
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          };
          existing.inputTokens += mu.inputTokens;
          existing.outputTokens += mu.outputTokens;
          existing.cacheReadTokens += mu.cacheReadTokens;
          existing.cacheWriteTokens += mu.cacheWriteTokens;
          prev.modelTokens.set(mu.model, existing);
        }
        map.set(key, prev);
      }
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, d]) => {
        const tokenUsage: TokenUsage = {
          modelMetrics: Array.from(d.modelTokens.entries()).map(([model, t]) => ({
            model,
            inputTokens: t.inputTokens,
            outputTokens: t.outputTokens,
            cacheReadTokens: t.cacheReadTokens,
            cacheWriteTokens: t.cacheWriteTokens,
          })),
        };
        const costBreakdown = d.modelTokens.size > 0 ? calculateCost(tokenUsage, pricingTable) : null;
        return {
          date,
          cost: d.cost,
          wallTimeMs: d.wallTimeMs,
          inputTokens: d.inputTokens,
          outputTokens: d.outputTokens,
          cacheReadTokens: d.cacheReadTokens,
          cacheWriteTokens: d.cacheWriteTokens,
          modelBreakdown: Array.from(d.modelTokens.entries()).map(([model, t]) => ({
            model,
            totalTokens: t.inputTokens + t.outputTokens,
            // Use null for models not in the pricing table (cost unknown vs. zero).
            costUsd: pricingTable[model] != null && costBreakdown != null
              ? (costBreakdown.perModel[model]?.totalCostUsd ?? null)
              : null,
          })),
        };
      });
  }, [filteredSessions]);

  // Rebucketed chart data (day/week/month)
  const chartData = useMemo(
    () => rebucket(dailyAnalytics, granularity),
    [dailyAnalytics, granularity],
  );

  // Aggregated summary for filtered sessions
  const summary = useMemo(() => {
    let totalTokens = 0;
    let totalCostUsd = 0;
    let hasCost = false;
    let totalWallMs = 0;
    let wallCount = 0;
    const models = new Set<string>();

    for (const s of filteredSessions) {
      const m = s.metrics;
      if (m) {
        totalTokens += m.totalInputTokens + m.totalOutputTokens;
        if (m.totalCostUsd !== null) {
          totalCostUsd += m.totalCostUsd;
          hasCost = true;
        }
        if (m.wallTimeMs !== null) {
          totalWallMs += m.wallTimeMs;
          wallCount++;
        }
        for (const mu of m.modelUsage ?? []) {
          models.add(mu.model);
        }
      }
    }

    return {
      count: filteredSessions.length,
      totalTokens,
      totalCostUsd: hasCost ? totalCostUsd : null,
      totalWallMs: wallCount > 0 ? totalWallMs : null,
      avgWallMs: wallCount > 0 ? totalWallMs / wallCount : null,
      modelCount: models.size,
    };
  }, [filteredSessions]);

  if (loading && sessions.length === 0) {
    return (
      <FlexRow justifyContent="center" padding="24" rawProps={{ 'data-testid': 'session-browser-loading' }}>
        <Spinner />
      </FlexRow>
    );
  }

  if (scanning && sessions.length === 0) {
    return (
      <FlexRow justifyContent="center" alignItems="center" spacing="12" padding="24" rawProps={{ 'data-testid': 'session-browser-scanning' }}>
        <Spinner />
        <Text size="18">Scanning sessions…</Text>
      </FlexRow>
    );
  }

  if (sessions.length === 0) {
    return <EmptyState onOpenFolder={handleOpenFolder} />;
  }

  return (
    <div className={styles.pageContainer} data-testid="session-browser">
      <div className={styles.headerSection}>
        {/* Header */}
        <FlexRow alignItems="center" spacing="12">
          <Text size="42" fontWeight="600">Sessions</Text>
          <Badge
            color="neutral"
            fill="outline"
            caption={String(filteredSessions.length)}
            size="24"
            rawProps={{ 'data-testid': 'session-count-badge' }}
          />
          {/* Non-blocking background refresh indicator — only shown when sessions are
              already displayed so it doesn't replace the full-page scanning spinner. */}
          {scanning && sessions.length > 0 && (
            <Spinner rawProps={{ 'data-testid': 'session-browser-refreshing' }} />
          )}
          {appInsightsConfigured && (
            <FlexRow spacing="6" rawProps={{ 'data-testid': 'data-source-toggle' }}>
              <Button
                caption="Local"
                fill={dataSource === 'local' ? 'solid' : 'outline'}
                color={dataSource === 'local' ? 'primary' : 'secondary'}
                size="30"
                onClick={() => setDataSource('local')}
                rawProps={{ 'data-testid': 'data-source-local' }}
              />
              <Button
                caption="Remote"
                fill={dataSource === 'remote' ? 'solid' : 'outline'}
                color={dataSource === 'remote' ? 'primary' : 'secondary'}
                size="30"
                onClick={() => setDataSource('remote')}
                rawProps={{ 'data-testid': 'data-source-remote' }}
              />
            </FlexRow>
          )}
          <FlexSpacer />
          <Button
            fill="outline"
            size="30"
            icon={FolderOpenIcon}
            caption="Open Folder…"
            onClick={handleOpenFolder}
          />
          <SettingsPanel onSettingsSaved={handleSettingsSaved} />
        </FlexRow>

        {/* Filter bar */}
        <Panel cx={styles.filterBar} rawProps={{ 'data-testid': 'filter-bar' }}>
          <FlexRow padding="12" spacing="12" alignItems="center" cx={styles.filterBarInner}>
            <TextInput
              value={searchText}
              onValueChange={(v) => setSearchText(v ?? '')}
              placeholder="Search by name, ID, path, or repo…"
              icon={SearchIcon}
              size="30"
              cx={styles.filterInput}
              rawProps={{ 'data-testid': 'search-input' }}
            />
            <div className={styles.filterPicker}>
              <RangeDatePicker
                value={dateRange}
                onValueChange={(v) => setDateRange(v ?? { from: null, to: null })}
                size="30"
                rawProps={{ 'data-testid': 'date-range-picker' } as Record<string, unknown>}
              />
            </div>
            <div className={styles.filterPicker}>
              <PickerInput
                dataSource={adapterDataSource}
                value={adapterFilter}
                onValueChange={(v) => setAdapterFilter((v ?? []) as string[])}
                selectionMode="multi"
                valueType="id"
                getName={(item) => item?.name ?? ''}
                placeholder="All adapters"
                size="30"
                rawProps={{ 'data-testid': 'adapter-filter' } as Record<string, unknown>}
              />
            </div>
            <div className={styles.filterPicker}>
              <PickerInput
                dataSource={repoDataSource}
                value={repoFilter}
                onValueChange={(v) => setRepoFilter((v ?? []) as string[])}
                selectionMode="multi"
                valueType="id"
                getName={(item) => item?.name ?? ''}
                placeholder="All repositories"
                size="30"
                rawProps={{ 'data-testid': 'repo-filter' } as Record<string, unknown>}
              />
            </div>
            {hasActiveFilters && (
              <Button
                fill="none"
                size="30"
                caption="Clear"
                onClick={handleClearFilters}
                rawProps={{ 'data-testid': 'clear-filters-button' }}
              />
            )}
          </FlexRow>
        </Panel>

        {/* Summary cards + analytics (collapsible) */}
        <Panel cx={styles.summaryBar} rawProps={{ 'data-testid': 'summary-bar' }}>
          {/* Clickable summary row */}
          <FlexRow
            padding="12"
            spacing="12"
            cx={styles.summaryRow}
            alignItems="center"
            onClick={() => setAnalyticsExpanded((v) => !v)}
            rawProps={{
              style: { cursor: 'pointer' },
              'data-testid': 'analytics-toggle',
              role: 'button',
              tabIndex: 0,
              'aria-expanded': analyticsExpanded,
              onKeyDown: (e: React.KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setAnalyticsExpanded((v) => !v);
                }
              },
            }}
          >
            <Text size="18" fontWeight="600">
              {analyticsExpanded ? '▾' : '▸'} Analytics
            </Text>
            <FlexSpacer />

            {/* Summary cards (inline) */}
            <div className={styles.summaryCards}>
              <div className={styles.summaryCard} data-testid="summary-sessions">
                <span className={styles.summaryCardLabel}>Sessions</span>
                <span className={styles.summaryCardValue}>{summary.count}</span>
              </div>
              <div className={styles.summaryCard} data-testid="summary-tokens">
                <span className={styles.summaryCardLabel}>Tokens</span>
                <span className={styles.summaryCardValue}>
                  {formatTokenCount(summary.totalTokens)}
                  {summary.modelCount > 0 && (
                    <span className={styles.summaryCardSub}>
                      {' '}· {summary.modelCount} model{summary.modelCount !== 1 ? 's' : ''}
                    </span>
                  )}
                </span>
              </div>
              <div className={styles.summaryCard} data-testid="summary-cost">
                <span className={styles.summaryCardLabel}>Est. cost</span>
                <span className={styles.summaryCardValue}>
                  {summary.totalCostUsd !== null ? `$${summary.totalCostUsd.toFixed(2)}` : '—'}
                </span>
              </div>
              <div className={styles.summaryCard} data-testid="summary-time">
                <span className={styles.summaryCardLabel}>Avg time</span>
                <span className={styles.summaryCardValue}>{formatDuration(summary.avgWallMs)}</span>
              </div>
            </div>
          </FlexRow>

          {/* Expanded analytics panel */}
          {analyticsExpanded && (
            <div className={styles.analyticsPanel} data-testid="analytics-panel">
              {/* Granularity toggle */}
              <div className={styles.granularityRow}>
                <Text fontSize="14" color="secondary">
                  {chartData.length} {granularity === 'day' ? 'day' : granularity === 'week' ? 'week' : 'month'}{chartData.length !== 1 ? 's' : ''}
                </Text>
                <div
                  className={styles.granularityToggle}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                  role="radiogroup"
                  aria-label="Chart granularity"
                >
                  {(['day', 'week', 'month'] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      className={`${styles.granularityBtn} ${granularity === g ? styles.granularityBtnActive : ''}`}
                      onClick={() => setGranularity(g)}
                      role="radio"
                      aria-checked={granularity === g}
                    >
                      {g.charAt(0).toUpperCase() + g.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Main chart: cost + model token areas */}
              <div className={styles.chartArea}>
                <CombinedAnalyticsChart data={chartData} granularity={granularity} />
              </div>

              {/* Cache hit rate + Model breakdown side-by-side */}
              <div className={styles.secondaryRow}>
                <div className={styles.cacheChartArea}>
                  <CacheHitRateChart data={chartData} granularity={granularity} />
                </div>
                <div className={styles.tableArea}>
                  <ModelBreakdownTable sessions={filteredSessions} />
                </div>
              </div>
            </div>
          )}
        </Panel>
      </div>

      {/* Session list or empty filter state */}
      <div className={styles.scrollableContent}>
        {filteredSessions.length === 0 ? (
          <div className={styles.emptyFilterState} data-testid="empty-filter-state">
            <Text size="30" fontWeight="600">No sessions match your filters</Text>
            <Text size="18" color="secondary">Try adjusting or clearing the filters above.</Text>
            <Button fill="outline" size="30" caption="Clear filters" onClick={handleClearFilters} />
          </div>
        ) : (
          <div data-testid="session-list">
            {groupedSessions.map(({ dateKey, items }) => {
              let dayCost: number | null = null;
              let dayIn = 0;
              let dayOut = 0;
              let dayCached = 0;
              let dayTime: number | null = null;
              for (const s of items) {
                const m = s.metrics;
                if (m) {
                  if (m.totalCostUsd != null) dayCost = (dayCost ?? 0) + m.totalCostUsd;
                  dayIn += m.totalInputTokens;
                  dayOut += m.totalOutputTokens;
                  dayCached += m.totalCacheReadTokens;
                  if (m.wallTimeMs != null) dayTime = (dayTime ?? 0) + m.wallTimeMs;
                }
              }
              return (
              <div key={dateKey} className={styles.dayGroup}>
                <div className={styles.dayHeading} data-testid="day-heading">
                  <span>{formatDayLabel(dateKey)}</span>
                  <span className={styles.daySummary}>
                    {dayCost !== null && <span>{`$${dayCost.toFixed(2)}`}</span>}
                    <span>{`In: ${formatTokenCount(dayIn)}`}</span>
                    <span>{`Out: ${formatTokenCount(dayOut)}`}</span>
                    <span>{`Cached: ${formatTokenCount(dayCached)}`}</span>
                    {dayTime !== null && <span>{`Time: ${formatDuration(dayTime)}`}</span>}
                  </span>
                </div>
                <div className={styles.cardGrid}>
                  {items.map((session) => (
                    <SessionCard
                      key={session.id}
                      session={session}
                      onClick={() => onSelectSession(session.id)}
                    />
                  ))}
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
