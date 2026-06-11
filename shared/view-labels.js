'use strict';

/**
 * Figma footer-style count label, e.g. "603 library components shown".
 * @param {object} state
 * @returns {string|null}
 */
function getFigmaShownLabel(state) {
  const count = state.itemCount;
  if (count == null) return null;

  if (state.kind === 'components' && state.depth === 'list') {
    return `${count} library components shown`;
  }

  if (state.kind === 'styles' && state.depth === 'list') {
    return `${count} library styles shown`;
  }

  if (state.kind === 'variables' && state.depth === 'list') {
    const subTab = state.variablesSubTab || 'variables';
    const noun = subTab === 'modes' ? 'modes' : 'variables';
    return `${count} library ${noun} shown`;
  }

  return null;
}

/**
 * Figma modal usage line, e.g. "Used in 18 files across 7 teams".
 * @param {{ usedIn?: string, usedBy?: string, fileCount?: number }} state
 * @returns {string|null}
 */
function formatUsageSummary(state) {
  const files = state.usedIn;
  const teams = state.usedBy;
  if (files && teams) return `Used in ${files} files across ${teams} teams`;
  if (files) return `Used in ${files} files`;
  if (teams) return `Used across ${teams} teams`;
  if (state.fileCount != null) return `${state.fileCount} files`;
  return null;
}

/**
 * File-usage scope line for panel insights, e.g. "Used in 982 files across 64 teams".
 * @param {{ usedIn?: string, usedBy?: string }} state
 * @returns {string|null}
 */
function formatFileUsageScope(state) {
  const files = state.usedIn;
  const teams = state.usedBy;
  if (files && teams) return `Used in ${files} files across ${teams} teams`;
  if (files) return `Used in ${files} files`;
  if (teams) return `Used across ${teams} teams`;
  return null;
}

/**
 * Instance-based scope line for style detail, e.g. "344,454 total instances across 8 teams".
 * @param {{ totalInstances?: string, usedBy?: string }} state
 * @returns {string|null}
 */
function formatInstanceScope(state) {
  const instances = state.totalInstances;
  const teams = state.usedBy;
  if (instances && teams) return `${instances} total instances across ${teams} teams`;
  if (instances) return `${instances} total instances`;
  if (teams) return `Used across ${teams} teams`;
  return null;
}

/**
 * Primary scope label for panel insights (titled like chart groups).
 * @param {object} state — analytics state from scraper
 * @returns {{ title: string, text: string }|null}
 */
function getScopeLabel(state) {
  if (!state.modalOpen || !state.analyticsTabSelected) return null;

  if (state.depth === 'list') {
    const text = getFigmaShownLabel(state);
    return text ? { title: 'Library', text } : null;
  }

  const isFileUsageDepth =
    (state.kind === 'components' && (state.depth === 'variant' || state.depth === 'component')) ||
    (state.kind === 'variables' && state.depth === 'detail');

  if (isFileUsageDepth) {
    const text = formatFileUsageScope(state);
    return text ? { title: 'File usage', text } : null;
  }

  if (state.kind === 'styles' && state.depth === 'detail') {
    const text = formatInstanceScope(state);
    return text ? { title: 'Total instances', text } : null;
  }

  if (state.kind === 'components' && state.depth === 'detail' && state.variantCount != null) {
    const n = Number(state.variantCount);
    if (Number.isFinite(n) && n > 0) {
      return { title: 'Variants', text: `${n} variant${n === 1 ? '' : 's'}` };
    }
  }

  return null;
}

const ENTITY_KIND_LABELS = {
  component: 'Component',
  componentSet: 'Component Set',
  variant: 'Variant',
  style: 'Style',
  variable: 'Variable',
};

/**
 * @typedef {'tag' | 'variantOf'} ViewSubtitleLine
 */

/**
 * @param {object} state — analytics state from scraper
 * @returns {{
 *   breadcrumb: string,
 *   title: string,
 *   subtitleLine: ViewSubtitleLine|null,
 *   entityKind: string|null,
 *   variantOfName: string|null,
 * }|null}
 */
function getViewContext(state) {
  const lib = state.libraryName || 'Library';
  const noTag = { subtitleLine: null, entityKind: null, variantOfName: null };

  if (!state.modalOpen) return null;

  if (!state.analyticsTabSelected) {
    return { breadcrumb: lib, title: 'Overview tab', ...noTag };
  }

  if (state.kind === 'components' && state.depth === 'list') {
    return { breadcrumb: lib, title: 'Component list', ...noTag };
  }

  if (state.kind === 'components' && state.depth === 'detail') {
    return {
      breadcrumb: lib,
      title: state.itemName || 'Component set',
      subtitleLine: 'tag',
      entityKind: 'componentSet',
      variantOfName: null,
    };
  }

  if (state.kind === 'components' && state.depth === 'variant') {
    const variantName = state.itemName || 'Variant';
    const setName = state.componentSetName;
    if (setName) {
      return {
        breadcrumb: lib,
        title: variantName,
        subtitleLine: 'variantOf',
        entityKind: null,
        variantOfName: setName,
      };
    }
    return {
      breadcrumb: lib,
      title: variantName,
      subtitleLine: 'tag',
      entityKind: 'component',
      variantOfName: null,
    };
  }

  if (state.kind === 'components' && state.depth === 'component') {
    return {
      breadcrumb: lib,
      title: state.itemName || 'Component',
      subtitleLine: 'tag',
      entityKind: 'component',
      variantOfName: null,
    };
  }

  if (state.kind === 'styles') {
    if (state.depth === 'detail' && state.itemName) {
      return {
        breadcrumb: lib,
        title: state.itemName,
        subtitleLine: 'tag',
        entityKind: 'style',
        variantOfName: null,
      };
    }

    return { breadcrumb: lib, title: 'Styles list', ...noTag };
  }

  if (state.kind === 'variables') {
    if (state.depth === 'detail' && state.itemName) {
      return {
        breadcrumb: lib,
        title: state.itemName,
        subtitleLine: 'tag',
        entityKind: 'variable',
        variantOfName: null,
      };
    }

    if (state.depth === 'list') {
      return { breadcrumb: lib, title: 'Usage statistics', ...noTag };
    }

    return { breadcrumb: lib, title: lib, ...noTag };
  }

  return { breadcrumb: lib, title: 'Unrecognized analytics view', ...noTag };
}

const viewLabelsApi = {
  getFigmaShownLabel,
  formatUsageSummary,
  formatFileUsageScope,
  formatInstanceScope,
  getScopeLabel,
  getViewContext,
  ENTITY_KIND_LABELS,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = viewLabelsApi;
}
if (typeof globalThis !== 'undefined') {
  globalThis.ViewLabels = viewLabelsApi;
}
