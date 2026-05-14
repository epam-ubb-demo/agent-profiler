/**
 * TabSkills — content panel for the "Skills" tab.
 *
 * Shows a KPI strip, source breakdown donut chart, and a filterable +
 * sortable table of individual skill invocations with context size and
 * duration metrics.
 */

import { Text } from '@epam/uui';
import { memo, useMemo } from 'react';

import { formatDuration } from '../comparative/format';
import { TimelineTooltip } from '../timeline/TimelineTooltip';
import type { TooltipContent } from '../timeline/types';
import { useTimelineTooltip } from '../timeline/useTimelineTooltip';

import { Section } from './Section';
import styles from './session-detail.module.css';
import type { StatEntry } from './session-stats';
import type { SkillStatsResult } from './skill-stats';
import { SortableHeader } from './SortableHeader';
import { TabKpiStrip } from './TabKpiStrip';
import { TableFilter } from './TableFilter';
import { useFilterableData } from './useFilterableData';
import { useSortableData } from './useSortableData';

/* --- SVG donut constants (match TokenCompositionChart) ------------------- */

const CX = 120;
const CY = 108;
const RADIUS = 52;
const STROKE_WIDTH = 26;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const LEGEND_START_Y = 188;
const LEGEND_ROW_HEIGHT = 22;

/* --- Source colour map --------------------------------------------------- */

const SOURCE_COLOURS: Record<string, string> = {
  'personal-copilot': 'var(--uui-primary-50)',
  'project': 'var(--uui-success-50)',
  'inherited': 'var(--uui-warning-50)',
  'personal-agents': 'var(--uui-info-50)',
};

function sourceColour(source: string): string {
  return SOURCE_COLOURS[source] ?? 'var(--uui-neutral-50)';
}

function formatChars(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M ch`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K ch`;
  return `${n} ch`;
}

/* --- Constants ----------------------------------------------------------- */

const FILTER_KEYS = ['skillName', 'source'] as const;
const DEFAULT_SORT = { key: 'callCount' as const, direction: 'desc' as const };

/* --- Props --------------------------------------------------------------- */

export interface TabSkillsProps {
  readonly skillStats: SkillStatsResult;
}

/* --- Component ---------------------------------------------------------- */

function TabSkillsInner({ skillStats }: TabSkillsProps) {
  // All hooks must be called before any early returns (Rules of Hooks)
  const { state: tooltipState, handlers: tooltip, tooltipRef } = useTimelineTooltip();
  const { filteredData, filterText, setFilterText } = useFilterableData(
    skillStats.rows,
    FILTER_KEYS as unknown as string[],
  );
  const { sortedData, requestSort, getSortDirection } = useSortableData(filteredData, DEFAULT_SORT);

  const donutData = useMemo(() => {
    const total = skillStats.sourceBreakdown.reduce((s, r) => s + r.count, 0);
    if (total === 0) return null;

    let cumulative = 0;
    return skillStats.sourceBreakdown.map((entry) => {
      const proportion = entry.count / total;
      const dashLength = proportion * CIRCUMFERENCE;
      const dashOffset = CIRCUMFERENCE * (1 - cumulative);
      cumulative += proportion;
      const pct = Math.round(proportion * 100);
      const tooltipContent: TooltipContent = {
        header: entry.source,
        rows: [{ key: 'Invocations', value: `${entry.count} (${pct}%)` }],
      };
      return { ...entry, proportion, dashLength, dashOffset, colour: sourceColour(entry.source), pct, tooltipContent };
    });
  }, [skillStats.sourceBreakdown]);

  const kpis = useMemo<readonly StatEntry[]>(() => {
    const { totalInvocations, uniqueSkills, totalContentLength } = skillStats;
    return [
      { label: 'Total invocations', display: totalInvocations > 0 ? String(totalInvocations) : '—', value: totalInvocations },
      { label: 'Unique skills', display: uniqueSkills > 0 ? String(uniqueSkills) : '—', value: uniqueSkills },
      { label: 'Total context loaded', display: totalContentLength > 0 ? formatChars(totalContentLength) : '—', value: totalContentLength },
    ];
  }, [skillStats]);

  if (skillStats.totalInvocations === 0) {
    return (
      <div data-testid="tab-skills">
        <TabKpiStrip stats={kpis} testIdPrefix="skill-kpi" />
        <div style={{ padding: '24px 0' }}>
          <Text size="18" color="secondary">No skill invocations recorded in this session.</Text>
        </div>
      </div>
    );
  }

  const svgHeight = LEGEND_START_Y + skillStats.sourceBreakdown.length * LEGEND_ROW_HEIGHT + 12;
  const ariaLabel = `Skills by source: ${(donutData ?? []).map((d) => `${d.source} ${d.pct}%`).join(', ')}`;

  return (
    <div data-testid="tab-skills">
      <TabKpiStrip stats={kpis} testIdPrefix="skill-kpi" />

      {donutData && donutData.length > 0 && (
        <Section title="Skills by source">
          <div className={styles.contextDonutContainer}>
            <svg
              viewBox={`0 0 240 ${svgHeight}`}
              className={styles.contextDonutSvg}
              role="img"
              aria-label={ariaLabel}
            >
              <text
                x={CX}
                y={16}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill="var(--uui-text-primary)"
              >
                Skills by source
              </text>

              {/* Background track */}
              <circle
                cx={CX}
                cy={CY}
                r={RADIUS}
                fill="none"
                stroke="var(--uui-neutral-20)"
                strokeWidth={STROKE_WIDTH}
              />

              {/* Arcs, rotated so the first arc starts at 12 o'clock */}
              <g transform={`rotate(-90, ${CX}, ${CY})`}>
                {donutData.map((arc) => (
                  <circle
                    key={arc.source}
                    cx={CX}
                    cy={CY}
                    r={RADIUS}
                    fill="none"
                    stroke={arc.colour}
                    strokeWidth={STROKE_WIDTH}
                    strokeDasharray={`${arc.dashLength} ${CIRCUMFERENCE - arc.dashLength}`}
                    strokeDashoffset={arc.dashOffset}
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={(e) => { tooltip.show(arc.tooltipContent, e); }}
                    onMouseMove={tooltip.move}
                    onMouseLeave={tooltip.hide}
                  >
                    <title>{`${arc.source}: ${arc.count} (${arc.pct}%)`}</title>
                  </circle>
                ))}
              </g>

              {/* Centre: total invocations */}
              <text
                x={CX}
                y={CY - 4}
                textAnchor="middle"
                fontSize={15}
                fontWeight={700}
                fill="var(--uui-text-primary)"
              >
                {skillStats.totalInvocations}
              </text>
              <text
                x={CX}
                y={CY + 12}
                textAnchor="middle"
                fontSize={9}
                fill="var(--uui-text-secondary)"
              >
                invocations
              </text>

              {/* Legend */}
              {donutData.map((entry, index) => {
                const y = LEGEND_START_Y + index * LEGEND_ROW_HEIGHT;
                return (
                  <g key={entry.source}>
                    <circle cx={18} cy={y - 4} r={5} fill={entry.colour} />
                    <text x={30} y={y} fontSize={11} fill="var(--uui-text-primary)">
                      {entry.source}
                    </text>
                    <text x={228} y={y} fontSize={11} textAnchor="end" fill="var(--uui-text-secondary)">
                      {entry.count} ({entry.pct}%)
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
          <TimelineTooltip state={tooltipState} tooltipRef={tooltipRef} />
        </Section>
      )}

      <Section title="Skill invocations">
        <TableFilter value={filterText} onChange={setFilterText} placeholder="Filter skills\u2026" />

        <table className={styles.dataTable} role="grid">
          <thead>
            <tr>
              <SortableHeader label="Skill" sortKey="skillName" direction={getSortDirection('skillName')} onSort={requestSort} />
              <SortableHeader label="Source" sortKey="source" direction={getSortDirection('source')} onSort={requestSort} />
              <SortableHeader label="Calls" sortKey="callCount" direction={getSortDirection('callCount')} onSort={requestSort} numeric />
              <th scope="col" className={styles.barCell} />
              <SortableHeader label="Avg context" sortKey="avgContentLength" direction={getSortDirection('avgContentLength')} onSort={requestSort} numeric />
              <SortableHeader label="Avg duration" sortKey="avgDurationMs" direction={getSortDirection('avgDurationMs')} onSort={requestSort} numeric />
            </tr>
          </thead>
          <tbody>
            {sortedData.map((row) => (
              <tr key={row.skillName}>
                <td>
                  <code className={styles.codeCell}>{row.skillName}</code>
                </td>
                <td>
                  {row.source ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: sourceColour(row.source),
                          flexShrink: 0,
                        }}
                      />
                      {row.source}
                    </span>
                  ) : '—'}
                </td>
                <td className={styles.numericCell}>{row.callCount}</td>
                <td className={styles.barCell}>
                  <span
                    className={styles.proportionBar}
                    style={{ width: `${Math.round(row.proportion * 100)}%` }}
                  />
                </td>
                <td className={styles.numericCell}>
                  {row.avgContentLength != null ? formatChars(row.avgContentLength) : '—'}
                </td>
                <td className={styles.numericCell}>
                  {row.avgDurationMs != null ? formatDuration(row.avgDurationMs) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}

export const TabSkills = memo(TabSkillsInner);
TabSkills.displayName = 'TabSkills';
