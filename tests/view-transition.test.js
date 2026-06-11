import { describe, it, expect } from 'vitest';
import { loadSharedModule } from './helpers/loadShared.js';

const ViewTransition = loadSharedModule('shared/view-transition.js', 'ViewTransition');

describe('isTransitionalAnalyticsState', () => {
  it('detects combobox-ahead-of-panel gap for variables', () => {
    expect(
      ViewTransition.isTransitionalAnalyticsState({
        modalOpen: true,
        analyticsTabSelected: true,
        kind: 'variables',
        depth: 'unknown',
      })
    ).toBe(true);
  });

  it('does not treat exportable list views as transitional', () => {
    expect(
      ViewTransition.isTransitionalAnalyticsState({
        modalOpen: true,
        analyticsTabSelected: true,
        kind: 'variables',
        depth: 'list',
      })
    ).toBe(false);
  });
});

describe('shouldEndViewTransition', () => {
  it('stays active through variables/unknown intermediate state', () => {
    expect(
      ViewTransition.shouldEndViewTransition({
        modalOpen: true,
        analyticsTabSelected: true,
        kind: 'variables',
        depth: 'unknown',
      })
    ).toBe(false);
  });

  it('ends when variables list is ready', () => {
    expect(
      ViewTransition.shouldEndViewTransition({
        modalOpen: true,
        analyticsTabSelected: true,
        kind: 'variables',
        depth: 'list',
      })
    ).toBe(true);
  });

  it('ends when modal closes', () => {
    expect(
      ViewTransition.shouldEndViewTransition({
        modalOpen: false,
        kind: 'unknown',
        depth: 'unknown',
      })
    ).toBe(true);
  });
});

describe('shouldShowTransitionUI', () => {
  const unrecognized = {
    title: 'Unrecognized view',
    detail: 'Try Components, Styles, or Variables on the Analytics tab.',
  };

  it('shows transition UI instead of unrecognized during active transition', () => {
    expect(
      ViewTransition.shouldShowTransitionUI(
        {
          modalOpen: true,
          analyticsTabSelected: true,
          kind: 'variables',
          depth: 'unknown',
        },
        unrecognized,
        { isViewTransitioning: true, isSwitchingView: false }
      )
    ).toBe(true);
  });

  it('does not hide real blocking guidance during transition', () => {
    expect(
      ViewTransition.shouldShowTransitionUI(
        { modalOpen: true, analyticsTabSelected: false, kind: 'components', depth: 'list' },
        { title: 'Overview tab selected' },
        { isViewTransitioning: true, isSwitchingView: false }
      )
    ).toBe(false);
  });
});

describe('getTransitionStatusText', () => {
  it('uses click intent for variables', () => {
    expect(
      ViewTransition.getTransitionStatusText({ pendingKind: 'variables', pendingDepth: 'list' }, {})
    ).toBe('Switching to Variables…');
  });

  it('includes modes sub-tab in status text', () => {
    expect(
      ViewTransition.getTransitionStatusText(
        {
          pendingKind: 'variables',
          pendingDepth: 'list',
          pendingVariablesSubTab: 'modes',
        },
        {}
      )
    ).toBe('Switching to Variables · Modes…');
  });
});
