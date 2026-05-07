/**
 * Base HTML template for standalone reports.
 *
 * Produces a complete HTML document with optional embedded styles and scripts.
 */

import { getScripts } from './scripts';
import { getStyles } from './styles';

export interface BaseTemplateData {
  readonly title: string;
  readonly bodyContent: string;
  readonly theme: 'light' | 'dark';
  readonly includeStyles: boolean;
  readonly includeInteractivity: boolean;
}

export function renderBaseTemplate(data: BaseTemplateData): string {
  const { title, bodyContent, theme, includeStyles, includeInteractivity } = data;

  const styleBlock = includeStyles
    ? `<style>${getStyles(theme)}</style>`
    : '';

  const scriptBlock = includeInteractivity
    ? `<script>${getScripts()}</script>`
    : '';

  return `<!DOCTYPE html>
<html lang="en" data-theme="${escapeAttr(theme)}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
${styleBlock}
</head>
<body>
${bodyContent}
${scriptBlock}
</body>
</html>`;
}

// ─── HTML escaping utilities ──────────────────────────────────────────────────

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch] ?? ch);
}

export function escapeAttr(str: string): string {
  return escapeHtml(str);
}
