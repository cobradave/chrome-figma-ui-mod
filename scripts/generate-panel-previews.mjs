import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PANEL_PREVIEW_STATES } from './panel-preview-states.mjs';
import { escapeHtml, renderPanelStatePage } from './panel-preview-helpers.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, '.previews');
const STATES_DIR = path.join(OUT_DIR, 'states');

/** Chrome side panel default width (matches typical first-open size). */
const SIDE_PANEL_WIDTH_PX = 360;

/** Preview gallery table-of-contents sidebar width. */
const TOC_SIDEBAR_WIDTH_PX = 280;

const PREVIEW_SHELL_CSS = `/* Generated — side panel preview shell */
body.panel-preview-shell {
  min-height: 0;
}
.panel-preview-shell {
  width: ${SIDE_PANEL_WIDTH_PX}px;
  max-width: ${SIDE_PANEL_WIDTH_PX}px;
  margin: 0 auto;
}
`;

const PREVIEW_INSIGHTS_CSS = `/* Generated — insight preview blocks (proposed UI) */
.panel-insights {
  --panel-gap: 12px;
  --panel-gap-lg: 20px;
}
.preview-scope {
  margin-bottom: 12px;
}
.preview-notes {
  margin-bottom: 12px;
}
.preview-note + .preview-note {
  margin-top: 16px;
}
.preview-note .preview-group__name {
  margin-bottom: 6px;
}
.preview-note__text {
  font-size: 12px;
  line-height: 1.35;
  color: var(--color-text);
  margin-top: 0;
}
.preview-note__detail {
  font-size: 11px;
  line-height: 1.45;
  color: var(--color-text-faint);
  margin-top: 4px;
}
.preview-note__list {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.preview-note__list-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.preview-note__list-name {
  font-size: 12px;
  line-height: 1.35;
  color: var(--color-text);
  overflow-wrap: anywhere;
}
.preview-note__list-meta {
  font-size: 11px;
  line-height: 1.35;
  color: var(--color-text-faint);
  font-variant-numeric: tabular-nums;
}
.panel-preview-shell .action-block {
  margin-top: var(--panel-gap-lg, 20px);
}
.preview {
  margin-top: 0;
}
.panel-preview-shell .preview__body.is-collapsed {
  max-height: 280px;
}
.preview-group {
  margin-bottom: 0;
}
.preview-group + .preview-group {
  margin-top: 16px;
}
.preview-group__name {
  font-size: 10px;
  font-weight: 500;
  color: var(--color-text-faint);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  margin-bottom: 6px;
}
.preview-bar-row {
  display: flex;
  align-items: center;
  font-size: 12px;
  margin: 4px 0;
  gap: 8px;
}
.preview-bar-row__label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.35;
  color: var(--color-text);
}
.preview-bar-row__track {
  flex: 0 0 72px;
  width: 72px;
  height: 8px;
  background: var(--color-segmented);
  border-radius: 4px;
  overflow: hidden;
}
.preview-bar-row__fill {
  height: 100%;
  background: var(--color-accent);
  border-radius: 4px;
  min-width: 2px;
}
.preview-bar-row__pct {
  flex: 0 0 36px;
  text-align: right;
  color: var(--color-text);
  font-size: 12px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.preview-footnote {
  color: var(--color-muted);
  font-size: 11px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--color-border-subtle);
  line-height: 1.45;
}
`;

const GALLERY_CSS = `/* Generated — preview gallery index */
* { box-sizing: border-box; }
html {
  scrollbar-gutter: stable;
}
body {
  margin: 0;
  font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 14px;
  color: #333;
  background: #f5f5f5;
}
@media (prefers-color-scheme: dark) {
  body { color: #e8e8e8; background: #1a1a1a; }
}
.gallery-layout {
  display: grid;
  grid-template-columns: ${TOC_SIDEBAR_WIDTH_PX}px minmax(0, 1fr);
  min-height: 100vh;
}
.toc {
  width: ${TOC_SIDEBAR_WIDTH_PX}px;
  min-width: ${TOC_SIDEBAR_WIDTH_PX}px;
  max-width: ${TOC_SIDEBAR_WIDTH_PX}px;
  background: #fff;
  border-right: 1px solid #e0e0e0;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  position: sticky;
  top: 0;
  align-self: start;
  max-height: 100vh;
  overflow: hidden;
}
@media (prefers-color-scheme: dark) {
  .toc { background: #252525; border-color: #3a3a3a; }
}
.toc__head {
  padding: 16px 14px 10px;
  flex-shrink: 0;
}
.toc__site-title {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.3;
  color: #1a1a1a;
  margin: 0 0 12px;
}
@media (prefers-color-scheme: dark) {
  .toc__site-title { color: #f0f0f0; }
}
.toc__visible-count {
  font-size: 11px;
  line-height: 1.35;
  color: #666;
  margin: 0;
  flex-shrink: 0;
}
.toc__visible-count[hidden] {
  display: none !important;
}
@media (prefers-color-scheme: dark) {
  .toc__visible-count { color: #999; }
}
.toc__section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 0;
  padding-top: 12px;
  border-top: 1px solid #eee;
}
@media (prefers-color-scheme: dark) {
  .toc__section-head { border-color: #3a3a3a; }
}
.toc__section-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #888;
  margin: 0;
}
.toc__head-option {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 8px;
  font-size: 12px;
  color: #333;
  cursor: pointer;
  user-select: none;
}
.toc__head-option:last-of-type {
  margin-bottom: 12px;
}
.toc__head-option input {
  margin: 0;
  flex-shrink: 0;
  width: 13px;
  height: 13px;
}
@media (prefers-color-scheme: dark) {
  .toc__head-option { color: #e8e8e8; }
}
.toc__footer {
  flex-shrink: 0;
  padding: 12px 14px 16px;
  border-top: 1px solid #eee;
}
@media (prefers-color-scheme: dark) {
  .toc__footer { border-color: #3a3a3a; }
}
.toc__footer-text {
  font-size: 10px;
  line-height: 1.45;
  color: #888;
  margin: 0;
}
.toc__footer-text code {
  font-size: 9px;
}
@media (prefers-color-scheme: dark) {
  .toc__footer-text { color: #777; }
}
.toc__scroll {
  overflow-y: auto;
  scrollbar-gutter: stable;
  flex: 1;
  min-height: 0;
  padding: 8px 0 16px;
}
.toc__list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.toc__list--root > .toc__branch:not(:last-child) {
  margin-bottom: 10px;
}
.toc__list--nested {
  padding: 2px 0 0 10px;
  margin: 0 0 0 6px;
  border-left: 1px solid #eee;
}
.toc__list--nested > .toc__branch:last-child {
  margin-bottom: 8px;
}
@media (prefers-color-scheme: dark) {
  .toc__list--nested { border-color: #3a3a3a; }
}
.toc__branch {
  list-style: none;
}
.toc__row-label {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}
.toc__parent-label {
  flex: 1;
  min-width: 0;
}
.toc__leaf-label {
  flex: 1;
  min-width: 0;
}
/* Depth 0 — top-level sections */
.toc__item--depth-0 .toc__parent-label,
.toc__item--depth-0 .toc__leaf-label {
  font-size: 12px;
  font-weight: 600;
  color: #222;
}
/* Depth 1 — major branches */
.toc__item--depth-1 .toc__parent-label,
.toc__item--depth-1 .toc__leaf-label {
  font-size: 12px;
  font-weight: 500;
  color: #333;
}
/* Depth 2 — mid-level groups */
.toc__item--depth-2 .toc__parent-label,
.toc__item--depth-2 .toc__leaf-label {
  font-size: 11px;
  font-weight: 500;
  color: #444;
}
/* Depth 3+ — nested parents */
.toc__item--depth-3 .toc__parent-label,
.toc__item--depth-3 .toc__leaf-label,
.toc__item--depth-4 .toc__parent-label,
.toc__item--depth-4 .toc__leaf-label {
  font-size: 11px;
  font-weight: 500;
  color: #555;
}
@media (prefers-color-scheme: dark) {
  .toc__item--depth-0 .toc__parent-label,
  .toc__item--depth-0 .toc__leaf-label { color: #f0f0f0; }
  .toc__item--depth-1 .toc__parent-label,
  .toc__item--depth-1 .toc__leaf-label { color: #e8e8e8; }
  .toc__item--depth-2 .toc__parent-label,
  .toc__item--depth-2 .toc__leaf-label { color: #ddd; }
  .toc__item--depth-3 .toc__parent-label,
  .toc__item--depth-3 .toc__leaf-label,
  .toc__item--depth-4 .toc__parent-label,
  .toc__item--depth-4 .toc__leaf-label { color: #ccc; }
}
.toc__child-count {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #e8e8e8;
  color: #555;
  font-size: 10px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}
@media (prefers-color-scheme: dark) {
  .toc__child-count {
    background: #3a3a3a;
    color: #bbb;
  }
}
.toc__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 14px;
  font-size: 12px;
  line-height: 1.4;
  cursor: pointer;
  user-select: none;
}
label.toc__item {
  width: 100%;
}
.toc__item:hover {
  background: rgba(0, 0, 0, 0.04);
}
@media (prefers-color-scheme: dark) {
  .toc__item:hover { background: rgba(255, 255, 255, 0.05); }
}
.toc__item input[type="checkbox"] {
  margin: 0;
  flex-shrink: 0;
  width: 13px;
  height: 13px;
  pointer-events: none;
}
.gallery-main {
  padding: 24px 32px 48px;
  min-width: 0;
}
.mermaid-wrap {
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 32px;
  max-width: 1100px;
  overflow-x: auto;
  overflow-y: visible;
}
.mermaid-wrap.is-hidden {
  display: none;
}
.mermaid-wrap svg {
  display: block;
  width: auto;
  height: auto;
  max-width: none;
}
.mermaid-wrap .node foreignObject {
  overflow: visible;
}
@media (prefers-color-scheme: dark) {
  .mermaid-wrap { background: #2a2a2a; border-color: #444; }
}
.mermaid-wrap .node.diagram-node--interactive {
  cursor: pointer;
}
.mermaid-wrap .node.diagram-node--interactive:focus,
.mermaid-wrap .node.diagram-node--interactive:focus-visible {
  outline: none;
}
.mermaid-wrap .node .label-container,
.mermaid-wrap .node > rect {
  transition: fill 0.15s ease, stroke 0.15s ease;
}
.mermaid-wrap .node.diagram-node--off .label-container,
.mermaid-wrap .node.diagram-node--off > rect {
  fill: #e4e4e4 !important;
  stroke: #b0b0b0 !important;
  stroke-width: 1.5px !important;
  stroke-dasharray: 5 3;
}
.mermaid-wrap .node.diagram-node--off .nodeLabel,
.mermaid-wrap .node.diagram-node--off .label,
.mermaid-wrap .node.diagram-node--off foreignObject,
.mermaid-wrap .node.diagram-node--off foreignObject * {
  color: #999 !important;
  fill: #999 !important;
}
.mermaid-wrap .node.diagram-node--on {
  opacity: 1;
}
.mermaid-wrap .node.diagram-node--on .label-container,
.mermaid-wrap .node.diagram-node--on > rect {
  fill: #7ec8fa !important;
  stroke: #0d8de8 !important;
  stroke-width: 2px !important;
}
.mermaid-wrap .node.diagram-node--on .nodeLabel,
.mermaid-wrap .node.diagram-node--on .label,
.mermaid-wrap .node.diagram-node--on foreignObject,
.mermaid-wrap .node.diagram-node--on foreignObject * {
  color: #044a7a !important;
  fill: #044a7a !important;
}
.mermaid-wrap .node.diagram-node--partial {
  opacity: 1;
}
.mermaid-wrap .node.diagram-node--partial .label-container,
.mermaid-wrap .node.diagram-node--partial > rect {
  fill: #b8e0fc !important;
  stroke: #18a0fb !important;
  stroke-width: 2px !important;
  stroke-dasharray: 6 3;
}
.mermaid-wrap .node.diagram-node--partial .nodeLabel,
.mermaid-wrap .node.diagram-node--partial .label,
.mermaid-wrap .node.diagram-node--partial foreignObject,
.mermaid-wrap .node.diagram-node--partial foreignObject * {
  color: #0569a0 !important;
  fill: #0569a0 !important;
}
@media (prefers-color-scheme: dark) {
  .mermaid-wrap .node.diagram-node--off .label-container,
  .mermaid-wrap .node.diagram-node--off > rect {
    fill: #1e1e1e !important;
    stroke: #666 !important;
  }
  .mermaid-wrap .node.diagram-node--off .nodeLabel,
  .mermaid-wrap .node.diagram-node--off foreignObject * {
    color: #666 !important;
    fill: #666 !important;
  }
  .mermaid-wrap .node.diagram-node--on .label-container,
  .mermaid-wrap .node.diagram-node--on > rect {
    fill: #1a5a8a !important;
    stroke: #4db8ff !important;
  }
  .mermaid-wrap .node.diagram-node--on .nodeLabel,
  .mermaid-wrap .node.diagram-node--on foreignObject * {
    color: #b8e4ff !important;
    fill: #b8e4ff !important;
  }
  .mermaid-wrap .node.diagram-node--partial .label-container,
  .mermaid-wrap .node.diagram-node--partial > rect {
    fill: #1e4060 !important;
  }
  .mermaid-wrap .node.diagram-node--partial .nodeLabel,
  .mermaid-wrap .node.diagram-node--partial foreignObject * {
    color: #8ec8f0 !important;
    fill: #8ec8f0 !important;
  }
}
.mermaid-wrap__hint {
  font-size: 12px;
  color: #888;
  margin: 0 0 8px;
}
.mermaid-wrap__legend {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  font-size: 11px;
  color: #666;
  margin: 0 0 12px;
}
.mermaid-wrap__legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.mermaid-wrap__legend-swatch {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  border: 1.5px solid #ccc;
  background: #f0f0f0;
  flex-shrink: 0;
}
.mermaid-wrap__legend-swatch--on {
  background: #7ec8fa;
  border-color: #0d8de8;
  border-width: 2px;
}
.mermaid-wrap__legend-swatch--partial {
  background: #b8e0fc;
  border-color: #18a0fb;
  border-style: dashed;
  border-width: 2px;
}
.mermaid-wrap__legend-swatch--off {
  background: #e4e4e4;
  border-color: #b0b0b0;
  border-style: dashed;
  opacity: 0.55;
}
@media (prefers-color-scheme: dark) {
  .mermaid-wrap__hint { color: #aaa; }
  .mermaid-wrap__legend { color: #999; }
  .mermaid-wrap__legend-swatch { background: #2a2a2a; border-color: #555; }
  .mermaid-wrap__legend-swatch--on { background: #1a3a5c; }
  .mermaid-wrap__legend-swatch--partial { background: #1e3348; }
}
.preview-list {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  align-items: flex-start;
  overflow-anchor: none;
}
.card {
  width: ${SIDE_PANEL_WIDTH_PX}px;
  flex: 0 0 ${SIDE_PANEL_WIDTH_PX}px;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 10px;
  overflow: hidden;
}
.card.is-hidden { display: none; }
@media (prefers-color-scheme: dark) {
  .card { background: #2a2a2a; border-color: #444; }
}
.card__head {
  padding: 12px 14px;
  border-bottom: 1px solid #eee;
}
@media (prefers-color-scheme: dark) {
  .card__head { border-color: #3a3a3a; }
}
.card__title { font-weight: 600; font-size: 13px; margin: 0 0 4px; }
.card__meta { font-size: 11px; color: #888; margin: 0 0 8px; }
.card__frame {
  display: block;
  width: ${SIDE_PANEL_WIDTH_PX}px;
  height: 120px;
  border: none;
  background: #f9f9f9;
}
@media (prefers-color-scheme: dark) {
  .card__frame { background: #1e1e1e; }
}
`;

const MERMAID_DIAGRAM = `flowchart TD
  env["Non-Figma tab"]
  waiting["Modal closed"]
  modal["Library Analytics modal"]
  modal --> overview["Overview tab"]
  modal --> analytics["Analytics tab"]
  analytics --> compAll["Components"]
  analytics --> styleAll["Styles"]
  analytics --> varRoot["Variables"]
  analytics --> unrecognized["Unrecognized view"]
  compAll --> compFiles["Component"]
  compAll --> compDetail["Component Set"]
  compDetail --> variantFiles["Variant"]
  styleAll --> styleFiles["Style"]
  varRoot --> modesTab["Modes"]
  varRoot --> varFiles["Variable"]`;

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

/** Sidebar tree — mirrors the flowchart; preview nodes get checkboxes, group nodes do not. */
const TOC_TREE = [
  { type: 'preview', stateId: 'unsupported', label: 'Non-Figma tab' },
  { type: 'preview', stateId: 'waiting', label: 'Modal closed' },
  {
    type: 'group',
    label: 'Library Analytics modal',
    children: [
      { type: 'preview', stateId: 'overview', label: 'Overview tab' },
      {
        type: 'group',
        label: 'Analytics tab',
        children: [
          {
            type: 'preview',
            stateId: 'components-list',
            label: 'Components',
            children: [
              {
                type: 'preview',
                stateId: 'components-component-files',
                label: 'Component',
              },
              {
                type: 'preview',
                stateId: 'components-detail',
                label: 'Component Set',
                children: [
                  { type: 'preview', stateId: 'components-variant-files', label: 'Variant' },
                ],
              },
            ],
          },
          {
            type: 'preview',
            stateId: 'styles-list',
            label: 'Styles',
            children: [{ type: 'preview', stateId: 'styles-detail', label: 'Style' }],
          },
          {
            type: 'preview',
            stateId: 'variables-list',
            label: 'Variables',
            children: [
              { type: 'preview', stateId: 'variables-modes', label: 'Modes' },
              { type: 'preview', stateId: 'variables-detail', label: 'Variable' },
            ],
          },
          { type: 'preview', stateId: 'unrecognized', label: 'Unrecognized view' },
        ],
      },
    ],
  },
];

function tocGroup(state) {
  if (state.id === 'unsupported') return 'Environment';
  if (!state.kind || state.kind === '—' || state.kind === 'any' || state.kind === 'unknown') {
    return 'Guidance';
  }
  if (state.kind === 'components') return 'Components';
  if (state.kind === 'styles') return 'Styles';
  if (state.kind === 'variables') return 'Variables';
  return 'Other';
}

function stateSlug(index, state) {
  return `${String(index + 1).padStart(2, '0')}-${state.id}`;
}

function stateEntry(states, stateId) {
  const index = states.findIndex((state) => state.id === stateId);
  if (index === -1) return null;
  return { index, state: states[index], slug: stateSlug(index, states[index]) };
}

function capitalizeLabel(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function tocParentId(key) {
  return `vis-parent-${key.replace(/[^a-zA-Z0-9_-]+/g, '-')}`;
}

/** Preview panels nested under a TOC node (excludes the node’s own preview). */
function countDescendantPanels(node, states) {
  const slugs = collectSlugsFromNode(node, states);
  const hasOwnPreview = node.type === 'preview' && stateEntry(states, node.stateId);
  return slugs.length - (hasOwnPreview ? 1 : 0);
}

/** All leaf preview slugs under a TOC node (includes the node’s own preview when present). */
function collectSlugsFromNode(node, states) {
  if (node.type === 'group') {
    return node.children.flatMap((child) => collectSlugsFromNode(child, states));
  }
  const entry = stateEntry(states, node.stateId);
  if (!entry) return [];
  const slugs = [entry.slug];
  if (node.children?.length) {
    slugs.push(...node.children.flatMap((child) => collectSlugsFromNode(child, states)));
  }
  return slugs;
}

function renderParentCheckbox(key, slugs, label, panelCount, depth) {
  const slugJson = JSON.stringify(slugs);
  const countBadge =
    panelCount > 0
      ? `<span class="toc__child-count" title="${panelCount} nested preview${panelCount === 1 ? '' : 's'}">${panelCount}</span>`
      : '';
  const parentId = tocParentId(key);
  return `<label class="toc__item toc__item--parent toc__item--depth-${depth}">
      <input type="checkbox" id="${parentId}" checked data-toggle-slugs='${slugJson}' data-parent aria-label="Show ${escapeHtml(label)} (${panelCount} nested previews)">
      <span class="toc__row-label"><span class="toc__parent-label">${escapeHtml(label)}</span>${countBadge}</span>
    </label>`;
}

function renderTocNode(node, states, parentKey = 'root', depth = 0) {
  if (node.type === 'group') {
    const slugs = collectSlugsFromNode(node, states);
    const key = `${parentKey}/${node.label}`;
    const childDepth = depth + 1;
    const children = node.children
      .map((child) => renderTocNode(child, states, key, childDepth))
      .join('\n');
    return `<li class="toc__branch toc__branch--depth-${depth}">
      ${renderParentCheckbox(key, slugs, capitalizeLabel(node.label), countDescendantPanels(node, states), depth)}
      <ul class="toc__list toc__list--nested">${children}</ul>
    </li>`;
  }

  const entry = stateEntry(states, node.stateId);
  if (!entry) return '';

  const label = capitalizeLabel(node.label || entry.state.label);

  if (node.children?.length) {
    const slugs = collectSlugsFromNode(node, states);
    const key = `${parentKey}/${entry.slug}`;
    const childDepth = depth + 1;
    const children = node.children
      .map((child) => renderTocNode(child, states, key, childDepth))
      .join('\n');
    return `<li class="toc__branch toc__branch--depth-${depth}">
      ${renderParentCheckbox(key, slugs, label, countDescendantPanels(node, states), depth)}
      <ul class="toc__list toc__list--nested">${children}</ul>
    </li>`;
  }

  const leafId = `vis-${entry.slug}`;
  return `<li class="toc__branch toc__branch--depth-${depth} toc__branch--leaf">
      <label class="toc__item toc__item--leaf toc__item--depth-${depth}">
      <input type="checkbox" id="${leafId}" checked data-slug="${entry.slug}" data-leaf aria-label="Show ${escapeHtml(label)}">
      <span class="toc__leaf-label">${escapeHtml(label)}</span>
    </label></li>`;
}

function renderToc(states) {
  const items = TOC_TREE.map((node) => renderTocNode(node, states)).join('\n');
  return `<ul class="toc__list toc__list--root">${items}</ul>`;
}

/** Map diagram nodes to preview slugs; parents include all descendant previews. */
function buildDiagramSlugMap(states) {
  const slugById = Object.fromEntries(states.map((state, index) => [state.id, stateSlug(index, state)]));
  const pick = (...ids) => ids.map((id) => slugById[id]).filter(Boolean);

  return {
    env: pick('unsupported'),
    waiting: pick('waiting'),
    overview: pick('overview'),
    unrecognized: pick('unrecognized'),
    modal: pick('overview'),
    analytics: pick(
      'unrecognized',
      'components-list',
      'components-detail',
      'components-variant-files',
      'components-component-files',
      'styles-list',
      'styles-detail',
      'variables-list',
      'variables-modes',
      'variables-detail'
    ),
    compAll: pick(
      'components-list',
      'components-detail',
      'components-variant-files',
      'components-component-files'
    ),
    compDetail: pick('components-detail', 'components-variant-files'),
    variantFiles: pick('components-variant-files'),
    compFiles: pick('components-component-files'),
    styleAll: pick('styles-list', 'styles-detail'),
    styleFiles: pick('styles-detail'),
    varRoot: pick('variables-list', 'variables-modes', 'variables-detail'),
    modesTab: pick('variables-modes'),
    varFiles: pick('variables-detail'),
  };
}

function renderIndex(states) {
  const toc = renderToc(states);
  const diagramSlugMap = buildDiagramSlugMap(states);

  const cards = states
    .map((s, i) => {
      const slug = stateSlug(i, s);
      const meta = [s.kind, s.depth].filter((x) => x && x !== '—').join(' / ') || '—';
      const group = tocGroup(s);
      return `<article class="card" id="${slug}" data-group="${escapeHtml(group)}">
      <div class="card__head">
        <p class="card__title">${escapeHtml(s.label)}</p>
        <p class="card__meta">${escapeHtml(meta)}</p>
      </div>
      <iframe class="card__frame" src="states/${slug}.html" title="${escapeHtml(s.label)}"></iframe>
    </article>`;
    })
    .join('\n    ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Figma Analytics Export — panel previews</title>
  <link rel="stylesheet" href="gallery.css">
</head>
<body>
  <div class="gallery-layout">
    <nav class="toc" aria-label="Table of contents">
      <div class="toc__head">
        <h1 class="toc__site-title">Side panel previews</h1>
        <label class="toc__head-option">
          <input type="checkbox" id="showDiagramCheckbox" checked>
          <span>Show interactive diagram</span>
        </label>
        <label class="toc__head-option">
          <input type="checkbox" id="showAllCheckbox" checked>
          <span>Show all previews</span>
        </label>
        <div class="toc__section-head">
          <p class="toc__section-label">Panel previews</p>
          <p class="toc__visible-count" id="visiblePreviewCount" aria-live="polite" hidden></p>
        </div>
      </div>
      <div class="toc__scroll">
        ${toc}
      </div>
      <div class="toc__footer">
        <p class="toc__footer-text">Generated mockups at <strong>${SIDE_PANEL_WIDTH_PX}px</strong> (Chrome side panel width). Edit <code>scripts/panel-preview-states.mjs</code> and <code>scripts/panel-preview-insights.mjs</code>, then run <code>npm run previews:build</code> to refresh.</p>
      </div>
    </nav>

    <main class="gallery-main">
      <div class="mermaid-wrap">
        <p class="mermaid-wrap__hint">Click a node to show only its preview(s). Shift+click to toggle without hiding others. Parent nodes include all descendants.</p>
        <div class="mermaid-wrap__legend" aria-hidden="true">
          <span class="mermaid-wrap__legend-item">
            <span class="mermaid-wrap__legend-swatch mermaid-wrap__legend-swatch--on"></span>
            Shown
          </span>
          <span class="mermaid-wrap__legend-item">
            <span class="mermaid-wrap__legend-swatch mermaid-wrap__legend-swatch--partial"></span>
            Some shown
          </span>
          <span class="mermaid-wrap__legend-item">
            <span class="mermaid-wrap__legend-swatch mermaid-wrap__legend-swatch--off"></span>
            Hidden
          </span>
        </div>
        <pre class="mermaid">${MERMAID_DIAGRAM}</pre>
      </div>
      <script id="diagram-slug-map" type="application/json">${JSON.stringify(diagramSlugMap)}</script>

      <div class="preview-list">
        ${cards}
      </div>
    </main>
  </div>

  <script>
    const diagramSlugMap = JSON.parse(document.getElementById('diagram-slug-map').textContent);
    const TOTAL_PREVIEWS = ${states.length};
    const DIAGRAM_VISIBILITY_KEY = 'figmaPanelPreviews.showInteractiveDiagram';

    function syncDiagramVisibility() {
      const wrap = document.querySelector('.mermaid-wrap');
      const checkbox = document.getElementById('showDiagramCheckbox');
      if (!wrap || !checkbox) return;
      wrap.classList.toggle('is-hidden', !checkbox.checked);
    }

    function loadDiagramVisibilityPreference() {
      const checkbox = document.getElementById('showDiagramCheckbox');
      if (!checkbox) return;
      try {
        const stored = localStorage.getItem(DIAGRAM_VISIBILITY_KEY);
        if (stored === 'false') checkbox.checked = false;
        else checkbox.checked = true;
      } catch (_) {
        checkbox.checked = true;
      }
      syncDiagramVisibility();
    }

    function syncVisiblePreviewCount() {
      const visible = document.querySelectorAll('.preview-list .card:not(.is-hidden)').length;
      const heading = document.getElementById('visiblePreviewCount');
      if (!heading) return;
      if (visible === TOTAL_PREVIEWS) {
        heading.hidden = true;
        heading.textContent = '';
      } else {
        heading.hidden = false;
        heading.textContent = visible + ' of ' + TOTAL_PREVIEWS;
      }
      const showAll = document.getElementById('showAllCheckbox');
      if (showAll) {
        showAll.checked = visible === TOTAL_PREVIEWS;
        showAll.indeterminate = visible > 0 && visible < TOTAL_PREVIEWS;
      }
    }

    function leafCheckboxForSlug(slug) {
      return document.querySelector('.toc input[type="checkbox"][data-slug="' + slug + '"]');
    }

    function leafSlugsFromToggle(parentCb) {
      return JSON.parse(parentCb.dataset.toggleSlugs || '[]');
    }

    function isSlugVisible(slug) {
      const card = document.getElementById(slug);
      return Boolean(card && !card.classList.contains('is-hidden'));
    }

    function setCardVisible(slug, visible) {
      const card = document.getElementById(slug);
      if (card) card.classList.toggle('is-hidden', !visible);
      const cb = leafCheckboxForSlug(slug);
      if (cb) cb.checked = visible;
      schedulePreviewRowHeightSync();
    }

    function syncParentCheckboxes() {
      document.querySelectorAll('.toc input[data-parent]').forEach((parentCb) => {
        const slugs = leafSlugsFromToggle(parentCb);
        const visible = slugs.filter((slug) => isSlugVisible(slug)).length;
        parentCb.checked = visible === slugs.length;
        parentCb.indeterminate = visible > 0 && visible < slugs.length;
      });
    }

    function showOnlySlugs(slugs) {
      const slugSet = new Set(slugs);
      document.querySelectorAll('.preview-list .card').forEach((card) => {
        card.classList.toggle('is-hidden', !slugSet.has(card.id));
      });
      document.querySelectorAll('.toc input[data-leaf]').forEach((cb) => {
        cb.checked = slugSet.has(cb.dataset.slug);
      });
      syncParentCheckboxes();
      syncDiagramNodes();
      syncVisiblePreviewCount();
      schedulePreviewRowHeightSync();
    }

    function toggleSlugs(slugs) {
      if (!slugs.length) return;
      const allVisible = slugs.every((slug) => isSlugVisible(slug));
      const target = !allVisible;
      slugs.forEach((slug) => setCardVisible(slug, target));
      syncParentCheckboxes();
      syncDiagramNodes();
      syncVisiblePreviewCount();
    }

    const diagramNodeKeys = Object.keys(diagramSlugMap).sort((a, b) => b.length - a.length);

    function nodeKeyFromElement(nodeEl) {
      const id = nodeEl.id || '';
      return diagramNodeKeys.find((key) => id.includes(key)) || null;
    }

    function syncDiagramNodes() {
      document.querySelectorAll('.mermaid-wrap svg .node').forEach((nodeEl) => {
        const nodeKey = nodeKeyFromElement(nodeEl);
        const slugs = nodeKey ? diagramSlugMap[nodeKey] : null;
        if (!slugs || !slugs.length) return;

        const visible = slugs.filter((slug) => isSlugVisible(slug)).length;
        nodeEl.classList.remove('diagram-node--on', 'diagram-node--off', 'diagram-node--partial');

        if (visible === slugs.length) {
          nodeEl.classList.add('diagram-node--on');
        } else if (visible > 0) {
          nodeEl.classList.add('diagram-node--partial');
        } else {
          nodeEl.classList.add('diagram-node--off');
        }
      });
    }

    function bindDiagramInteractivity() {
      document.querySelectorAll('.mermaid-wrap svg .node').forEach((nodeEl) => {
        const nodeKey = nodeKeyFromElement(nodeEl);
        const slugs = nodeKey ? diagramSlugMap[nodeKey] : null;
        if (!slugs || !slugs.length) return;

        nodeEl.classList.add('diagram-node--interactive');
        nodeEl.setAttribute('role', 'button');
        nodeEl.setAttribute('aria-label', 'Show previews: ' + nodeKey);
        nodeEl.addEventListener('click', (event) => {
          if (event.shiftKey) toggleSlugs(slugs);
          else showOnlySlugs(slugs);
        });
      });
      syncDiagramNodes();
    }

    function onLeafChange(cb) {
      const card = document.getElementById(cb.dataset.slug);
      if (card) card.classList.toggle('is-hidden', !cb.checked);
      syncParentCheckboxes();
      syncDiagramNodes();
      syncVisiblePreviewCount();
      schedulePreviewRowHeightSync();
    }

    function onParentChange(parentCb) {
      const slugs = leafSlugsFromToggle(parentCb);
      const allVisible = slugs.every((slug) => isSlugVisible(slug));
      const target = parentCb.indeterminate || !allVisible;
      slugs.forEach((slug) => setCardVisible(slug, target));
      syncParentCheckboxes();
      syncDiagramNodes();
      syncVisiblePreviewCount();
    }

    function setAllVisible(visible) {
      document.querySelectorAll('.preview-list .card').forEach((card) => {
        card.classList.toggle('is-hidden', !visible);
      });
      document.querySelectorAll('.toc input[data-leaf]').forEach((cb) => {
        cb.checked = visible;
      });
      document.querySelectorAll('.toc input[data-parent]').forEach((cb) => {
        cb.checked = visible;
        cb.indeterminate = false;
      });
      syncDiagramNodes();
      syncVisiblePreviewCount();
      schedulePreviewRowHeightSync();
    }

    document.querySelectorAll('.toc input[data-leaf]').forEach((cb) => {
      cb.addEventListener('change', () => onLeafChange(cb));
    });
    document.querySelectorAll('.toc input[data-parent]').forEach((cb) => {
      cb.addEventListener('change', () => onParentChange(cb));
    });
    document.getElementById('showAllCheckbox')?.addEventListener('change', (event) => {
      setAllVisible(event.target.checked);
    });
    document.getElementById('showDiagramCheckbox')?.addEventListener('change', (event) => {
      try {
        localStorage.setItem(DIAGRAM_VISIBILITY_KEY, event.target.checked ? 'true' : 'false');
      } catch (_) {
        /* storage unavailable */
      }
      syncDiagramVisibility();
    });
    loadDiagramVisibilityPreference();
    syncParentCheckboxes();
    syncVisiblePreviewCount();

    let previewRowHeightSyncTimer = null;

    function measurePreviewFrame(frame) {
      try {
        const doc = frame.contentDocument;
        if (!doc) return 0;
        const root = doc.documentElement;
        const body = doc.body;
        const height = Math.max(
          root?.scrollHeight || 0,
          root?.offsetHeight || 0,
          body?.scrollHeight || 0,
          body?.offsetHeight || 0
        );
        if (height > 0) frame.dataset.naturalHeight = String(height);
        return height;
      } catch (_err) {
        return 0;
      }
    }

    function syncPreviewRowHeights() {
      const cards = [...document.querySelectorAll('.preview-list .card:not(.is-hidden)')];
      if (!cards.length) return;

      cards.forEach((card) => {
        const frame = card.querySelector('.card__frame');
        if (!frame) return;
        const natural = measurePreviewFrame(frame);
        if (natural > 0) frame.style.height = natural + 'px';
      });

      const rows = [];
      const rowTolerance = 4;
      cards.forEach((card) => {
        const top = card.offsetTop;
        let row = rows.find((entry) => Math.abs(entry.top - top) <= rowTolerance);
        if (!row) {
          row = { top, cards: [] };
          rows.push(row);
        }
        row.cards.push(card);
      });

      rows.forEach((row) => {
        let maxHeight = 0;
        row.cards.forEach((card) => {
          const frame = card.querySelector('.card__frame');
          if (!frame) return;
          const natural = Number(frame.dataset.naturalHeight) || frame.offsetHeight;
          maxHeight = Math.max(maxHeight, natural);
        });
        row.cards.forEach((card) => {
          const frame = card.querySelector('.card__frame');
          if (frame && maxHeight > 0) frame.style.height = maxHeight + 'px';
        });
      });
    }

    function schedulePreviewRowHeightSync() {
      clearTimeout(previewRowHeightSyncTimer);
      previewRowHeightSyncTimer = setTimeout(syncPreviewRowHeights, 50);
    }

    document.querySelectorAll('.card__frame').forEach((frame) => {
      frame.addEventListener('load', schedulePreviewRowHeightSync);
      if (frame.contentDocument?.readyState === 'complete') schedulePreviewRowHeightSync();
    });
    window.addEventListener('resize', schedulePreviewRowHeightSync);
    window.addEventListener('message', (event) => {
      if (event.data?.type === 'panel-preview-layout-change') schedulePreviewRowHeightSync();
    });
    schedulePreviewRowHeightSync();

    window.bindDiagramInteractivity = bindDiagramInteractivity;
  </script>
  <script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';

    mermaid.initialize({
      startOnLoad: false,
      theme: 'neutral',
      securityLevel: 'loose',
      themeVariables: {
        fontSize: '12px',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
      },
      flowchart: {
        curve: 'rounded',
        nodeSpacing: 40,
        rankSpacing: 45,
        padding: 8,
        wrappingWidth: 999,
        useMaxWidth: false,
        htmlLabels: true,
      },
    });
    const diagramEl = document.querySelector('.mermaid');
    if (diagramEl) {
      await mermaid.run({ nodes: [diagramEl] });
      window.bindDiagramInteractivity?.();
    }
  </script>
</body>
</html>`;
}

function main() {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(STATES_DIR, { recursive: true });

  writeFile(path.join(OUT_DIR, 'preview-shell.css'), PREVIEW_SHELL_CSS);
  writeFile(path.join(OUT_DIR, 'preview-insights.css'), PREVIEW_INSIGHTS_CSS);
  writeFile(path.join(OUT_DIR, 'gallery.css'), GALLERY_CSS);

  PANEL_PREVIEW_STATES.forEach((state, index) => {
    const slug = `${String(index + 1).padStart(2, '0')}-${state.id}`;
    const html = renderPanelStatePage(state, { cssDepth: 1 });
    writeFile(path.join(STATES_DIR, `${slug}.html`), html);
  });

  writeFile(path.join(OUT_DIR, 'index.html'), renderIndex(PANEL_PREVIEW_STATES));

  console.log(`Wrote ${PANEL_PREVIEW_STATES.length} panel states to ${path.relative(ROOT, OUT_DIR)}/`);
  console.log(`Open ${path.relative(ROOT, path.join(OUT_DIR, 'index.html'))}`);
}

main();
