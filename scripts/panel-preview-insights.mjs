import { loadSharedModule } from '../tests/helpers/loadShared.js';
import {
  LIBRARY_NAME,
  COMPONENT_SET,
  SINGLE_COMPONENT,
  VARIANT_SELECTED,
  LIST_COMPONENT_PRIMARY,
  LIST_COMPONENT_SECONDARY,
  STYLE_DETAIL,
  VARIABLE_DETAIL,
  TEAMS,
  FILES,
} from '../tests/fixtures/names.js';

const PanelInsights = loadSharedModule('shared/insights.js', 'PanelInsights');
const ViewLabels = loadSharedModule('shared/view-labels.js', 'ViewLabels');

/** @typedef {import('./panel-preview-states.mjs').PanelPreviewState} PanelPreviewState */

const BASE_ANALYTICS = {
  modalOpen: true,
  analyticsTabSelected: true,
  libraryName: LIBRARY_NAME,
  duration: '30',
};

/**
 * Mock scrape payloads shaped like scraper output — enriched so previews show
 * representative Tier 1–2 insight notes, not hand-authored bar percentages.
 */
export const PREVIEW_INSIGHT_CASES = {
  'components-list': {
    state: {
      ...BASE_ANALYTICS,
      kind: 'components',
      depth: 'list',
      itemCount: 603,
    },
    data: {
      components: [
        { name: SINGLE_COMPONENT, instances: '52,100' },
        { name: LIST_COMPONENT_PRIMARY, instances: '22,400' },
        { name: LIST_COMPONENT_SECONDARY, instances: '13,800' },
        { name: 'Button/Primary', instances: '9,900' },
        { name: 'Table/Cell', instances: '6,200' },
        { name: 'Input/Text', instances: '4,100' },
        { name: 'Badge/Status', instances: '3,800' },
        { name: 'Modal/Dialog', instances: '2,900' },
        { name: 'Tooltip', instances: '2,100' },
        { name: 'Checkbox', instances: '1,750' },
        { name: 'Radio/Group', instances: '1,200' },
        { name: 'Form wireframe/Checkbox, Radio', instances: '20' },
        { name: 'Form wireframe/Checkbox, Radio', instances: '4' },
        { name: 'Deprecated/Legacy', instances: '0' },
        { name: 'Unused/Placeholder', instances: '0' },
      ],
    },
  },
  'components-detail': {
    state: {
      ...BASE_ANALYTICS,
      kind: 'components',
      depth: 'detail',
      itemName: COMPONENT_SET,
      variantCount: 24,
    },
    data: {
      variants: [
        { name: 'Size=Medium (default), State=Default', totalInstances: '12,345', inserts: '1,234', detaches: '56' },
        { name: 'Size=Small, State=Default', totalInstances: '8,901', inserts: '567', detaches: '12' },
        { name: 'Size=Large, State=Default', totalInstances: '4,567', inserts: '234', detaches: '8' },
        { name: 'Size=Medium, State=Hover', totalInstances: '2,100', inserts: '180', detaches: '45' },
        { name: 'Size=Small, State=Hover', totalInstances: '890', inserts: '90', detaches: '20' },
        { name: 'Size=Small (default), State=Active', totalInstances: '120', inserts: '10', detaches: '25' },
        { name: 'Size=Large, State=Active', totalInstances: '3,400', inserts: '300', detaches: '15' },
        { name: 'Size=Small, State=Active', totalInstances: '0', inserts: '0', detaches: '0' },
        { name: 'Size=Large, State=Hover', totalInstances: '0', inserts: '0', detaches: '0' },
        { name: 'Tone=Neutral, State=Default', totalInstances: '0', inserts: '0', detaches: '0' },
        { name: 'Tone=Emphasis, State=Default', totalInstances: '0', inserts: '0', detaches: '0' },
        { name: 'Tone=Neutral, State=Hover', totalInstances: '0', inserts: '0', detaches: '0' },
      ],
    },
  },
  'components-variant-files': {
    state: {
      ...BASE_ANALYTICS,
      kind: 'components',
      depth: 'variant',
      itemName: VARIANT_SELECTED,
      componentSetName: COMPONENT_SET,
      usedIn: '18',
      usedBy: '7',
    },
    data: {
      files: [
        { name: FILES.onboardingFlow, team: TEAMS.growth, instances: '3,104', lastModified: '2 months ago' },
        { name: FILES.accountSettings, team: TEAMS.coreProduct, instances: '1,890', lastModified: '1 month ago' },
        { name: FILES.checkoutExperience, team: TEAMS.internalTools, instances: '890', lastModified: '3 weeks ago' },
        { name: FILES.archivedFlows, team: TEAMS.growth, instances: '420', lastModified: '8 months ago' },
        { name: FILES.legacyWireframes, team: TEAMS.coreProduct, instances: '180', lastModified: '1 year ago' },
      ],
    },
  },
  'components-component-files': {
    state: {
      ...BASE_ANALYTICS,
      kind: 'components',
      depth: 'component',
      itemName: SINGLE_COMPONENT,
      usedIn: '982',
      usedBy: '64',
    },
    data: {
      files: [
        { name: FILES.coreDesignSystem, team: TEAMS.internalTools, instances: '18,400', lastModified: '1 week ago' },
        { name: FILES.productDashboard, team: TEAMS.growth, instances: '6,800', lastModified: '2 months ago' },
        { name: FILES.publicWebsite, team: TEAMS.growth, instances: '4,200', lastModified: '3 weeks ago' },
        { name: FILES.applicationShell, team: TEAMS.mobile, instances: '3,100', lastModified: '4 months ago' },
        { name: FILES.legacyDesignKit, team: TEAMS.internalTools, instances: '900', lastModified: '9 months ago' },
        { name: FILES.campaignLandingPages, team: TEAMS.designSystems, instances: '650', lastModified: '11 months ago' },
        { name: FILES.retiredProductUi, team: TEAMS.coreProduct, instances: '420', lastModified: '2 years ago' },
      ],
    },
  },
  'styles-list': {
    state: {
      ...BASE_ANALYTICS,
      kind: 'styles',
      depth: 'list',
      itemCount: 67,
    },
    data: {
      styles: [
        { name: STYLE_DETAIL, instances: '344,454', inserts: '162,828', detaches: '83' },
        { name: 'body/standard-regular', instances: '254,732', inserts: '86,092', detaches: '31' },
        { name: 'heading/large', instances: '98,200', inserts: '42,000', detaches: '12' },
        { name: 'body/standard-bold', instances: '50,000', inserts: '100', detaches: '240' },
        { name: 'caption/muted', instances: '12,400', inserts: '0', detaches: '0' },
        { name: 'deprecated/body', instances: '0', inserts: '0', detaches: '0' },
      ],
    },
  },
  'styles-detail': {
    state: {
      ...BASE_ANALYTICS,
      kind: 'styles',
      depth: 'detail',
      itemName: STYLE_DETAIL,
    },
    data: {
      totalInstances: '344,454',
      usedBy: '8',
      files: [
        { name: FILES.designSystemDocs, team: TEAMS.coreProduct, instances: '152,000' },
        { name: FILES.applicationShell, team: TEAMS.coreProduct, instances: '94,000' },
        { name: FILES.mobilePatterns, team: TEAMS.growth, instances: '48,000' },
        { name: FILES.publicWebsite, team: TEAMS.designSystems, instances: '31,000' },
        { name: FILES.internalPrototype, team: TEAMS.internalTools, instances: '19,454' },
      ],
    },
  },
  'variables-list': {
    state: {
      ...BASE_ANALYTICS,
      kind: 'variables',
      depth: 'list',
      variablesSubTab: 'variables',
      itemCount: 338,
    },
    data: {
      variables: [
        { name: VARIABLE_DETAIL, collection: 'color', instances: '819,666', inserts: '326,778', detaches: '119' },
        { name: 'color/surface/raised', collection: 'color', instances: '412,000', inserts: '180,000', detaches: '45' },
        { name: 'spacing/md', collection: 'spacing', instances: '210,500', inserts: '95,000', detaches: '20' },
        { name: 'spacing/lg', collection: 'spacing', instances: '98,200', inserts: '40,000', detaches: '8' },
        { name: 'typography/body', collection: 'typography', instances: '76,400', inserts: '32,000', detaches: '5' },
        { name: 'color/legacy/muted', collection: 'color', instances: '12,000', inserts: '0', detaches: '0' },
        { name: 'spacing/unused', collection: 'spacing', instances: '0', inserts: '0', detaches: '0' },
      ],
    },
  },
  'variables-modes': {
    state: {
      ...BASE_ANALYTICS,
      kind: 'variables',
      depth: 'list',
      variablesSubTab: 'modes',
      itemCount: 3,
    },
    data: {
      modes: [
        { mode: 'Light', collection: 'color', instances: '4,910,977' },
        { mode: 'Dark', collection: 'color', instances: '2,980,400' },
        { mode: 'Default', collection: 'spacing', instances: '820,000' },
        { mode: 'Compact', collection: 'spacing', instances: '340,000' },
        { mode: 'Unused', collection: 'legacy', instances: '0' },
      ],
    },
  },
  'variables-detail': {
    state: {
      ...BASE_ANALYTICS,
      kind: 'variables',
      depth: 'detail',
      itemName: VARIABLE_DETAIL,
      usedIn: '42',
      usedBy: '6',
    },
    data: {
      files: [
        { name: FILES.applicationShell, team: TEAMS.coreProduct, instances: '385,000', lastModified: '1 week ago' },
        { name: FILES.componentFoundations, team: TEAMS.coreProduct, instances: '254,000', lastModified: '2 weeks ago' },
        { name: FILES.publicMarketingSite, team: TEAMS.designSystems, instances: '98,000', lastModified: '1 month ago' },
        { name: FILES.mobileApplication, team: TEAMS.growth, instances: '52,666', lastModified: '3 weeks ago' },
      ],
    },
  },
};

function getInsightsScope(state, data) {
  const scope = ViewLabels.getScopeLabel(state);
  if (scope) return scope;

  if (state.kind === 'styles' && state.depth === 'detail' && data) {
    const text = ViewLabels.formatInstanceScope({
      totalInstances: data.totalInstances,
      usedBy: data.usedBy,
    });
    if (text) return { title: 'Total instances', text };
  }

  return null;
}

/**
 * Build panel insights HTML the same way popup.js does for live exports.
 * @param {string} previewId
 * @returns {string}
 */
export function buildPreviewInsightsHtml(previewId) {
  const insightCase = PREVIEW_INSIGHT_CASES[previewId];
  if (!insightCase) return '';

  const { state, data } = insightCase;
  const scope = getInsightsScope(state, data);
  return PanelInsights.buildInsightsHtml(state, data, {
    scope,
    duration: state.duration || '30',
  });
}

/**
 * @param {PanelPreviewState[]} states
 * @returns {PanelPreviewState[]}
 */
export function attachPreviewInsights(states) {
  return states.map((state) => {
    const insightsHtml = buildPreviewInsightsHtml(state.id);
    return insightsHtml ? { ...state, insightsHtml } : state;
  });
}
