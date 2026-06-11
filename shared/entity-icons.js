'use strict';

const ENTITY_ICON_DIR = 'shared/entity-icons';
const ENTITY_ICON_SIZE = 12;

/** @type {Record<string, string>} kind → filename */
const ENTITY_KIND_ICONS = {
  component: 'icon.24.component.small.svg',
  componentSet: 'icon.24.component.set.small.svg',
  variant: 'icon.24.variant.small.svg',
  style: 'icon.24.styles.svg',
  variable: 'icon.24.variable.small.svg',
};

/** All exported Figma icons (including non-tag uses). */
const ENTITY_ICON_CATALOG = {
  ...ENTITY_KIND_ICONS,
  variableMode: 'icon.24.variable.mode.small.svg',
  figma: 'icon.24.figma.small.svg',
  export: 'icon.24.export.small.svg',
};

const ENTITY_ICON_LABELS = {
  component: 'Component',
  componentSet: 'Component Set',
  variant: 'Variant',
  style: 'Style',
  variable: 'Variable',
  variableMode: 'Variable Mode',
  figma: 'Figma',
  export: 'Export',
};

/**
 * @param {string} kind
 * @returns {string|null}
 */
function getIconFilename(kind) {
  return ENTITY_KIND_ICONS[kind] || ENTITY_ICON_CATALOG[kind] || null;
}

/**
 * @param {string} kind
 * @param {string} [basePath] — e.g. "../../shared/entity-icons/" for preview HTML
 * @returns {string|null}
 */
function getIconSrc(kind, basePath = '') {
  const file = getIconFilename(kind);
  if (!file) return null;
  if (basePath) return `${basePath}${file}`;
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    return chrome.runtime.getURL(`${ENTITY_ICON_DIR}/${file}`);
  }
  return `${ENTITY_ICON_DIR}/${file}`;
}

/**
 * @param {string|null|undefined} kind
 * @returns {string}
 */
function getIconInlineHtml(kind) {
  const inline = typeof globalThis !== 'undefined' && globalThis.ENTITY_ICON_INLINE;
  if (!kind || !inline?.[kind]) return '';
  return inline[kind];
}

/** @type {Record<string, string>} subtab → icon kind */
const VARIABLES_SUBTAB_ICONS = {
  variables: 'variable',
  modes: 'variableMode',
};

/**
 * @param {ParentNode|Document} [root]
 */
function initSegmentIcons(root = document) {
  root.querySelectorAll('[data-segment-icon]').forEach((el) => {
    el.innerHTML = getIconInlineHtml(el.dataset.segmentIcon);
  });
}

/**
 * @param {HTMLElement} el
 * @param {string|null|undefined} kind
 */
function applyEntityLabel(el, kind) {
  if (!kind) {
    el.textContent = '';
    el.hidden = true;
    el.className = 'view-ident__entity-label';
    el.replaceChildren();
    return;
  }

  const labels = typeof globalThis !== 'undefined' && globalThis.ViewLabels?.ENTITY_KIND_LABELS;
  const labelText = labels?.[kind] || ENTITY_ICON_LABELS[kind] || kind;

  el.hidden = false;
  el.className = `view-ident__entity-label view-ident__entity-label--${kind}`;

  let iconEl = el.querySelector('.view-ident__entity-label-icon');
  let textEl = el.querySelector('.view-ident__entity-label-text');

  if (!iconEl || !textEl) {
    el.replaceChildren();
    iconEl = document.createElement('span');
    iconEl.className = 'view-ident__entity-label-icon';
    textEl = document.createElement('span');
    textEl.className = 'view-ident__entity-label-text';
    el.append(iconEl, textEl);
  }

  iconEl.innerHTML = getIconInlineHtml(kind);
  textEl.textContent = labelText;
}

/**
 * @param {HTMLElement} el
 * @param {string|null|undefined} kind
 * @param {string|null|undefined} name
 */
function applyNamedEntityLabel(el, kind, name) {
  if (!kind || !name) {
    applyEntityLabel(el, null);
    return;
  }

  el.hidden = false;
  el.className = `view-ident__entity-label view-ident__entity-label--${kind} view-ident__entity-label--named`;

  let iconEl = el.querySelector('.view-ident__entity-label-icon');
  let textEl = el.querySelector('.view-ident__entity-label-text');

  if (!iconEl || !textEl) {
    el.replaceChildren();
    iconEl = document.createElement('span');
    iconEl.className = 'view-ident__entity-label-icon';
    textEl = document.createElement('span');
    textEl.className = 'view-ident__entity-label-text';
    el.append(iconEl, textEl);
  }

  iconEl.innerHTML = getIconInlineHtml(kind);
  textEl.textContent = name;
  el.title = name;
}

/**
 * @param {string|null|undefined} kind
 * @param {string} name
 * @param {{ labelId?: string }} [opts]
 * @returns {string}
 */
function renderNamedEntityLabelHtml(kind, name, { labelId = '' } = {}) {
  if (!kind || !name) {
    const idAttr = labelId ? ` id="${labelId}"` : '';
    return `<span class="view-ident__entity-label"${idAttr} hidden></span>`;
  }

  const iconHtml = getIconInlineHtml(kind);
  const idAttr = labelId ? ` id="${labelId}"` : '';

  return `<span class="view-ident__entity-label view-ident__entity-label--${kind} view-ident__entity-label--named"${idAttr}><span class="view-ident__entity-label-icon">${iconHtml}</span><span class="view-ident__entity-label-text">${name}</span></span>`;
}

/**
 * @param {string|null|undefined} kind
 * @param {{ hidden?: boolean, labelId?: string }} [opts]
 * @returns {string}
 */
function renderEntityLabelHtml(kind, { hidden = false, labelId = '' } = {}) {
  if (!kind) {
    const idAttr = labelId ? ` id="${labelId}"` : '';
    return `<span class="view-ident__entity-label"${idAttr}${hidden ? ' hidden' : ''}></span>`;
  }

  const labels = typeof globalThis !== 'undefined' && globalThis.ViewLabels?.ENTITY_KIND_LABELS;
  const labelText = labels?.[kind] || ENTITY_ICON_LABELS[kind] || kind;
  const iconHtml = getIconInlineHtml(kind);
  const hiddenAttr = hidden ? ' hidden' : '';
  const idAttr = labelId ? ` id="${labelId}"` : '';

  return `<span class="view-ident__entity-label view-ident__entity-label--${kind}"${idAttr}${hiddenAttr}><span class="view-ident__entity-label-icon">${iconHtml}</span><span class="view-ident__entity-label-text">${labelText}</span></span>`;
}

const entityIconsApi = {
  ENTITY_ICON_DIR,
  ENTITY_ICON_SIZE,
  ENTITY_KIND_ICONS,
  ENTITY_ICON_CATALOG,
  ENTITY_ICON_LABELS,
  getIconFilename,
  getIconSrc,
  getIconInlineHtml,
  initSegmentIcons,
  VARIABLES_SUBTAB_ICONS,
  applyEntityLabel,
  applyNamedEntityLabel,
  renderEntityLabelHtml,
  renderNamedEntityLabelHtml,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = entityIconsApi;
}
if (typeof globalThis !== 'undefined') {
  globalThis.EntityIcons = entityIconsApi;
}
