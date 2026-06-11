'use strict';

const ANALYTICS_TYPES = ['components', 'styles', 'variables'];

const ANALYTICS_TYPE_LABELS = {
  components: 'Components',
  styles: 'Styles',
  variables: 'Variables',
};

function isExportableView(state) {
  if (!state?.modalOpen || !state.analyticsTabSelected) return false;

  if (state.kind === 'components') {
    return (
      state.depth === 'list' ||
      state.depth === 'detail' ||
      state.depth === 'variant' ||
      state.depth === 'component'
    );
  }
  if (state.kind === 'styles' || state.kind === 'variables') {
    return state.depth === 'list' || state.depth === 'detail';
  }
  return false;
}

function isTransitionalAnalyticsState(state) {
  return (
    state?.modalOpen &&
    state.analyticsTabSelected &&
    ANALYTICS_TYPES.includes(state.kind) &&
    state.depth === 'unknown'
  );
}

function shouldEndViewTransition(nextState) {
  if (!nextState?.modalOpen) return true;
  if (!nextState.analyticsTabSelected) return true;
  if (isExportableView(nextState)) return true;
  if (isTransitionalAnalyticsState(nextState)) return false;
  return true;
}

function shouldShowTransitionUI(state, guidance, { isViewTransitioning, isSwitchingView }) {
  if (!isViewTransitioning && !isSwitchingView) return false;
  if (!state?.modalOpen) return false;
  if (!guidance) return true;
  if (guidance.title !== 'Unrecognized view') return false;
  return state.kind !== 'unknown' && ANALYTICS_TYPES.includes(state.kind);
}

function getTransitionStatusText(intent, state) {
  if (intent?.pendingKind && ANALYTICS_TYPE_LABELS[intent.pendingKind]) {
    const typeLabel = ANALYTICS_TYPE_LABELS[intent.pendingKind];
    if (intent.pendingVariablesSubTab === 'modes') {
      return `Switching to ${typeLabel} · Modes…`;
    }
    return `Switching to ${typeLabel}…`;
  }
  if (intent?.pendingDepth === 'list') return 'Loading list…';
  if (state?.kind && ANALYTICS_TYPE_LABELS[state.kind]) {
    return `Switching to ${ANALYTICS_TYPE_LABELS[state.kind]}…`;
  }
  return 'Updating view…';
}

const viewTransitionApi = {
  ANALYTICS_TYPES,
  ANALYTICS_TYPE_LABELS,
  isExportableView,
  isTransitionalAnalyticsState,
  shouldEndViewTransition,
  shouldShowTransitionUI,
  getTransitionStatusText,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = viewTransitionApi;
}
if (typeof globalThis !== 'undefined') {
  globalThis.ViewTransition = viewTransitionApi;
}
