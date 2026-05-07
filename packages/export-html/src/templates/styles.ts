/**
 * CSS styles for standalone HTML reports.
 *
 * Covers tables, timeline lanes, cards, responsive layout, and print styles.
 * Supports light and dark themes via a `data-theme` attribute on `<html>`.
 */

export function getStyles(theme: 'light' | 'dark'): string {
  const vars =
    theme === 'dark'
      ? `
    --bg: #1a1a2e;
    --bg-card: #16213e;
    --bg-alt-row: #0f3460;
    --text: #e0e0e0;
    --text-muted: #a0a0a0;
    --border: #2a2a4a;
    --accent: #4fc3f7;
    --accent-dim: #0288d1;
    --header-bg: #0f3460;
    --success: #66bb6a;
    --failure: #ef5350;
  `
      : `
    --bg: #ffffff;
    --bg-card: #f8f9fa;
    --bg-alt-row: #f1f3f5;
    --text: #212529;
    --text-muted: #6c757d;
    --border: #dee2e6;
    --accent: #0d6efd;
    --accent-dim: #6ea8fe;
    --header-bg: #e9ecef;
    --success: #198754;
    --failure: #dc3545;
  `;

  return `
:root {
  ${vars}
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.6;
  padding: 1rem;
  max-width: 1400px;
  margin: 0 auto;
}

h1, h2, h3, h4 {
  margin-top: 1.5rem;
  margin-bottom: 0.75rem;
  color: var(--text);
}

h1 { font-size: 1.75rem; border-bottom: 2px solid var(--accent); padding-bottom: 0.5rem; }
h2 { font-size: 1.4rem; }
h3 { font-size: 1.15rem; }

/* Card/Panel styling */
.card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 1rem 1.25rem;
  margin-bottom: 1rem;
}

.card-header {
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: var(--accent);
}

/* Metadata grid */
.meta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.meta-item {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
}

.meta-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  color: var(--text-muted);
  letter-spacing: 0.05em;
}

.meta-value {
  font-size: 1.1rem;
  font-weight: 600;
}

/* Table styling */
table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 1rem;
  font-size: 0.875rem;
}

thead {
  position: sticky;
  top: 0;
  z-index: 1;
}

th {
  background: var(--header-bg);
  border: 1px solid var(--border);
  padding: 0.5rem 0.75rem;
  text-align: left;
  font-weight: 600;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}

th:hover { background: var(--accent-dim); }

td {
  border: 1px solid var(--border);
  padding: 0.4rem 0.75rem;
}

tr:nth-child(even) td { background: var(--bg-alt-row); }

/* Timeline SVG */
.timeline-container {
  overflow-x: auto;
  margin-bottom: 1rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.5rem;
  background: var(--bg-card);
}

.timeline-container svg {
  display: block;
  width: 100%;
  min-width: 600px;
}

.timeline-bar { rx: 3; }
.timeline-bar-tool { fill: var(--accent); }
.timeline-bar-assistant { fill: var(--success); }
.timeline-bar-user { fill: var(--accent-dim); }

.timeline-label {
  font-size: 11px;
  fill: var(--text-muted);
}

.timeline-tick {
  stroke: var(--border);
  stroke-width: 1;
}

/* Collapsible sections */
details {
  border: 1px solid var(--border);
  border-radius: 6px;
  margin-bottom: 0.5rem;
}

summary {
  cursor: pointer;
  padding: 0.5rem 0.75rem;
  background: var(--bg-card);
  font-weight: 500;
  border-radius: 6px;
  user-select: none;
}

summary:hover { background: var(--header-bg); }

details[open] > summary {
  border-bottom: 1px solid var(--border);
  border-radius: 6px 6px 0 0;
}

details > .detail-content {
  padding: 0.75rem;
}

/* Token bar chart */
.bar-chart {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  height: 80px;
  margin-bottom: 0.5rem;
  padding: 0.25rem;
}

.bar {
  flex: 1;
  background: var(--accent);
  border-radius: 3px 3px 0 0;
  min-width: 8px;
  position: relative;
}

.bar-label {
  font-size: 0.65rem;
  text-align: center;
  color: var(--text-muted);
  margin-top: 0.25rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Status badges */
.badge {
  display: inline-block;
  padding: 0.15rem 0.5rem;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
}

.badge-success { background: var(--success); color: #fff; }
.badge-failure { background: var(--failure); color: #fff; }
.badge-neutral { background: var(--border); color: var(--text); }

/* Responsive */
@media (max-width: 768px) {
  body { padding: 0.5rem; }
  .meta-grid { grid-template-columns: 1fr 1fr; }
  table { font-size: 0.75rem; }
  th, td { padding: 0.3rem 0.5rem; }
}

/* Print */
@media print {
  body { background: #fff; color: #000; padding: 0; max-width: none; }
  .card { border-color: #ccc; break-inside: avoid; }
  details { border-color: #ccc; }
  details[open] > summary { border-bottom-color: #ccc; }
  th { background: #f0f0f0; }
  .timeline-container { overflow: visible; }
  summary::marker { content: ''; }
}
`;
}
