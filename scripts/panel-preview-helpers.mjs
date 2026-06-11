import { createRequire } from 'node:module';
import { loadSharedModule, loadSharedModules } from '../tests/helpers/loadShared.js';

const PanelInsights = loadSharedModule('shared/insights.js', 'PanelInsights');
const EntityIcons = loadSharedModules([
  'shared/entity-icon-inline.js',
  'shared/view-labels.js',
  'shared/entity-icons.js',
]).EntityIcons;

/** @typedef {{ label: string, percent: number | string }} InsightBarItem */
/** @typedef {{ name: string, items: InsightBarItem[] }} InsightGroup */
/** @typedef {{ title: string, text: string, detail?: string }} InsightNote */

export const PANEL_FOOTER_HTML = `
<footer class="panel-footer">
  <div class="panel-footer__links">
    <a href="https://github.com/NoWorries/chrome-figma-ui-mod" target="_blank" rel="noopener noreferrer" class="panel-footer__github-link">
      <svg width="14" height="14" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path fill-rule="evenodd" clip-rule="evenodd" d="M8 0C3.58 0 0 3.58 0 8C0 11.54 2.29 14.53 5.47 15.59C5.87 15.66 6.02 15.42 6.02 15.21C6.02 15.02 6.01 14.39 6.01 13.72C4 14.09 3.48 13.23 3.32 12.78C3.23 12.55 2.84 11.84 2.5 11.65C2.22 11.5 1.82 11.13 2.49 11.12C3.12 11.11 3.57 11.7 3.72 11.94C4.44 13.15 5.59 12.81 6.05 12.6C6.12 12.08 6.33 11.73 6.56 11.53C4.78 11.33 2.92 10.64 2.92 7.58C2.92 6.71 3.23 5.99 3.74 5.43C3.66 5.23 3.38 4.41 3.82 3.31C3.82 3.31 4.49 3.1 6.02 4.13C6.66 3.95 7.34 3.86 8.02 3.86C8.7 3.86 9.38 3.95 10.02 4.13C11.55 3.09 12.22 3.31 12.22 3.31C12.66 4.41 12.38 5.23 12.3 5.43C12.81 5.99 13.12 6.7 13.12 7.58C13.12 10.65 11.25 11.33 9.47 11.53C9.76 11.78 10.01 12.26 10.01 13.01C10.01 14.08 10 14.94 10 15.21C10 15.42 10.15 15.67 10.55 15.59C13.71 14.53 16 11.53 16 8C16 3.58 12.42 0 8 0Z" transform="scale(64)" fill="currentColor"/>
      </svg>
      Figma Analytics Export
    </a>
    <a href="https://github.com/NoWorries/chrome-figma-ui-mod/issues/new" target="_blank" rel="noopener noreferrer" class="panel-footer__feedback-link" title="Report a bug or request a feature on GitHub">Feedback</a>
  </div>
</footer>`;

export const escapeHtml = PanelInsights.escapeHtml;
export const renderBarRows = PanelInsights.renderBarRows;
export const renderNote = PanelInsights.renderNote;
export const renderInsightBars = PanelInsights.renderInsightBars;
export const buildInsightsHtml = PanelInsights.buildInsightsHtml;

/**
 * @param {{ insightsHtml?: string }} [section]
 */
export function renderInsightsSection(section = {}) {
  const insightsHtml = section.insightsHtml || '';
  if (!insightsHtml) return '';

  return `<div class="panel-insights">${insightsHtml}</div>`;
}

/**
 * @param {string|null|undefined} kind
 * @param {{ labelId: string }} ids
 */
function renderTagOnlyLine(kind, { labelId }) {
  return EntityIcons.renderEntityLabelHtml(kind, { labelId });
}

/**
 * @param {string} name
 * @param {{ labelId: string }} ids
 */
function renderVariantOfLine(name, { labelId }) {
  const labelHtml = EntityIcons.renderNamedEntityLabelHtml('componentSet', escapeHtml(name || ''), {
    labelId,
  });
  return `<span id="viewVariantOfPrefix" class="view-ident__variant-of">Variant of</span>
      ${labelHtml}`;
}

/**
 * @param {import('./panel-preview-states.mjs').PanelPreviewState} state
 */
export function renderViewIdentBlock(state) {
  const breadcrumb = escapeHtml(state.viewBreadcrumb || '');
  const title = escapeHtml(state.viewTitle || '');
  const subtitleLine = state.subtitleLine || null;

  if (subtitleLine === 'tag') {
    return `<div id="viewBreadcrumb" class="view-ident__breadcrumb">${breadcrumb}</div>
    <div id="viewTitle" class="view-ident__title">${title}</div>
    <div id="viewSubtitle" class="view-ident__subtitle view-ident__item-line">
      ${renderTagOnlyLine(state.entityKind, { labelId: 'viewEntityLabel' })}
    </div>`;
  }

  if (subtitleLine === 'variantOf') {
    return `<div id="viewBreadcrumb" class="view-ident__breadcrumb">${breadcrumb}</div>
    <div id="viewTitle" class="view-ident__title">${title}</div>
    <div id="viewSubtitle" class="view-ident__subtitle view-ident__item-line">
      ${renderVariantOfLine(state.variantOfName || '', { labelId: 'viewEntityLabel' })}
    </div>`;
  }

  return `<div id="viewBreadcrumb" class="view-ident__breadcrumb">${breadcrumb}</div>
    <div id="viewTitle" class="view-ident__title">${title}</div>
    <div id="viewSubtitle" class="view-ident__subtitle view-ident__item-line" hidden>
      <span id="viewVariantOfPrefix" class="view-ident__variant-of" hidden>Variant of</span>
      <span id="viewSubtitleText" hidden></span>
      <span class="view-ident__entity-label" id="viewEntityLabel" hidden></span>
    </div>`;
}

/**
 * @param {'variables' | 'modes'} subtab
 * @param {boolean} selected
 */
function renderVariablesSubTabSegment(subtab, selected) {
  const iconKind = EntityIcons.VARIABLES_SUBTAB_ICONS[subtab] || 'variable';
  const label = subtab === 'modes' ? 'Modes' : 'Variables';
  const iconHtml = EntityIcons.getIconInlineHtml(iconKind);

  return `<button type="button" class="format-segment${selected ? ' is-selected' : ''}"><span class="format-segment__icon" aria-hidden="true">${iconHtml}</span><span class="format-segment__label">${label}</span></button>`;
}

/**
 * @param {string} label
 */
function renderDownloadButtonHtml(label) {
  const iconHtml = EntityIcons.getIconInlineHtml('export');
  return `<button id="downloadBtn" class="primary"><span class="download-btn__icon" aria-hidden="true">${iconHtml}</span><span class="download-btn__label">${escapeHtml(label || 'Download unavailable')}</span></button>`;
}

/**
 * @param {import('./panel-preview-states.mjs').PanelPreviewState} state
 * @param {{ cssDepth: number }} opts - 1 for states/*.html, 0 for root
 */
export function renderPanelStatePage(state, { cssDepth = 1 } = {}) {
  const prefix = cssDepth === 1 ? '../../' : '../';
  const insightsPrefix = cssDepth === 1 ? '../' : './';

  const detectionHidden = state.showDetectionCard ? '' : ' hidden';
  const viewIdentHidden = state.showViewIdent ? '' : ' hidden';
  const actionHidden = state.showActionBlock ? '' : ' hidden';
  const varsSubTabHidden = state.showVariablesSubTab ? '' : ' hidden';
  const switchBtnHidden = state.showSwitchAnalytics ? '' : ' hidden';
  const showIncludeInsights = Boolean(state.showActionBlock && state.insightsHtml);
  const includeInsightsHidden = showIncludeInsights ? '' : ' hidden';

  const varsSelected = state.variablesSubTab === 'modes' ? 'modes' : 'variables';
  const insightsInitScript = state.insightsHtml
    ? `<script src="${prefix}shared/panel-insights-expand.js"><\/script>
  <script>
    document.addEventListener('DOMContentLoaded', function () {
      var container = document.querySelector('.panel-insights');
      if (!container || !window.PanelInsightsExpand) return;
      PanelInsightsExpand.setup(container, {
        onLayoutChange: function () {
          try {
            window.parent.postMessage({ type: 'panel-preview-layout-change' }, '*');
          } catch (_err) {}
        },
      });
    });
  <\/script>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="color-scheme" content="light dark">
  <title>${escapeHtml(state.label)} — preview</title>
  <link rel="stylesheet" href="${prefix}popup.css">
  <link rel="stylesheet" href="${prefix}shared/panel-footer.css">
  <link rel="stylesheet" href="${insightsPrefix}preview-shell.css">
  <link rel="stylesheet" href="${insightsPrefix}preview-insights.css">
</head>
<body class="panel-preview-shell">
  <div id="viewIdent" class="view-ident"${viewIdentHidden}>
    ${renderViewIdentBlock(state)}
  </div>

  <div id="variablesSubTabBlock" class="view-ident__subtab-block"${varsSubTabHidden}>
    <div id="variablesSubTabSegmented" class="format-segmented view-ident__subtab-segmented" role="radiogroup" aria-label="Variables list tab">
      ${renderVariablesSubTabSegment('variables', varsSelected === 'variables')}
      ${renderVariablesSubTabSegment('modes', varsSelected === 'modes')}
    </div>
  </div>

  <div id="detectionCard" class="detection-card ${escapeHtml(state.detectionClass || 'detection-waiting')}"${detectionHidden}>
    <div id="statusIcon" class="detection-card__icon" aria-hidden="true">${escapeHtml(state.detectionIcon || '○')}</div>
    <div class="detection-card__body">
      <div id="statusTitle" class="detection-card__title">${escapeHtml(state.detectionTitle || '')}</div>
      <div id="statusDetail" class="detection-card__detail">${escapeHtml(state.detectionDetail || '')}</div>
      <button id="switchAnalyticsTabBtn" type="button" class="detection-card__action primary"${switchBtnHidden}>Switch to Analytics</button>
    </div>
  </div>

  ${renderInsightsSection({ insightsHtml: state.insightsHtml })}

  <div id="actionBlock" class="action-block"${actionHidden}>
    <div class="control-label">Export as</div>
    <div id="formatSegmented" class="format-segmented" role="radiogroup" aria-label="Export format">
      <button type="button" class="format-segment is-selected">CSV</button>
      <button type="button" class="format-segment">JSON</button>
      <button type="button" class="format-segment">Markdown</button>
    </div>
    <label id="includeInsightsBlock" class="include-insights"${includeInsightsHidden}>
      <input id="includeInsightsCheckbox" type="checkbox">
      <span>Include insights</span>
    </label>
    ${renderDownloadButtonHtml(state.downloadLabel || 'Download unavailable')}
  </div>

  ${PANEL_FOOTER_HTML}
  ${insightsInitScript}
</body>
</html>`;
}
