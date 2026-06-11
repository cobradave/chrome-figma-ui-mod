import { describe, it, expect } from 'vitest';
import { loadFixtureWithScraper } from './helpers/loadFixture.js';
import {
  LIBRARY_NAME,
  COMPONENT_SET,
  SINGLE_COMPONENT,
  VARIANT_SELECTED,
  COMPONENT_ALL_VARIANTS,
  STYLE_DETAIL,
  VARIABLE_DETAIL,
} from './fixtures/names.js';

const cases = [
  {
    fixture: 'path-a-components-list.html',
    kind: 'components',
    depth: 'list',
    itemCount: 603,
    libraryName: LIBRARY_NAME,
  },
  {
    fixture: 'path-a-components-detail.html',
    kind: 'components',
    depth: 'detail',
    itemName: COMPONENT_SET,
    variantCount: 24,
    libraryName: LIBRARY_NAME,
  },
  {
    fixture: 'path-a-components-variant-file-usage.html',
    kind: 'components',
    depth: 'variant',
    itemName: VARIANT_SELECTED,
    libraryName: LIBRARY_NAME,
  },
  {
    fixture: 'path-a-components-detail-all-variants.html',
    kind: 'components',
    depth: 'detail',
    itemName: COMPONENT_ALL_VARIANTS,
    libraryName: LIBRARY_NAME,
  },
  {
    fixture: 'path-a-styles-list.html',
    kind: 'styles',
    depth: 'list',
    itemCount: 67,
    libraryName: LIBRARY_NAME,
  },
  {
    fixture: 'path-a-styles-list-stale-components.html',
    kind: 'styles',
    depth: 'list',
    itemCount: 67,
    libraryName: LIBRARY_NAME,
  },
  {
    fixture: 'path-a-styles-detail.html',
    kind: 'styles',
    depth: 'detail',
    itemName: STYLE_DETAIL,
    libraryName: LIBRARY_NAME,
  },
  {
    fixture: 'path-a-variables-list.html',
    kind: 'variables',
    depth: 'list',
    itemCount: 338,
    variablesSubTab: 'variables',
    libraryName: LIBRARY_NAME,
  },
  {
    fixture: 'path-a-variables-modes-list.html',
    kind: 'variables',
    depth: 'list',
    itemCount: 3,
    variablesSubTab: 'modes',
    libraryName: LIBRARY_NAME,
  },
  {
    fixture: 'path-a-variables-detail.html',
    kind: 'variables',
    depth: 'detail',
    itemName: VARIABLE_DETAIL,
    libraryName: LIBRARY_NAME,
  },
  {
    fixture: 'path-c-components-list.html',
    kind: 'components',
    depth: 'list',
    itemCount: 603,
    libraryName: LIBRARY_NAME,
    launchContext: 'libraries',
  },
  {
    fixture: 'path-c-libraries-subscription-header.html',
    kind: 'components',
    depth: 'list',
    itemCount: 603,
    libraryName: LIBRARY_NAME,
    launchContext: 'libraries',
  },
  {
    fixture: 'path-b-components-list.html',
    kind: 'components',
    depth: 'list',
    itemCount: 603,
    libraryName: LIBRARY_NAME,
    launchContext: 'inFile',
    pathname: '/design/4YLjes8hJHKjWhHuwxYwG8/Foundation-Web',
  },
];

describe('classifyAnalyticsState', () => {
  for (const c of cases) {
    it(`classifies ${c.fixture}`, () => {
      const { document: doc, scraper } = loadFixtureWithScraper(c.fixture, {
        url: c.url || (c.pathname ? `https://www.figma.com${c.pathname}` : undefined),
      });
      const dialog = scraper.findAnalyticsDialog(doc);
      expect(dialog).toBeTruthy();
      const state = scraper.classifyAnalyticsState(dialog);
      expect(state.modalOpen).toBe(true);
      expect(state.kind).toBe(c.kind);
      expect(state.depth).toBe(c.depth);
      expect(state.libraryName).toBe(c.libraryName);
      expect(state.analyticsTabSelected).toBe(true);
      if (c.itemCount != null) expect(state.itemCount).toBe(c.itemCount);
      if (c.itemName) expect(state.itemName).toBe(c.itemName);
      if (c.variantCount != null) expect(state.variantCount).toBe(c.variantCount);
      if (c.variablesSubTab) expect(state.variablesSubTab).toBe(c.variablesSubTab);
      if (c.launchContext) expect(state.launchContext).toBe(c.launchContext);
    });
  }

  it('does not treat Overview tab as analytics when stats text bleeds', () => {
    const { document: doc, scraper } = loadFixtureWithScraper('path-a-overview-tab.html');
    const dialog = scraper.findAnalyticsDialog(doc);
    expect(dialog).toBeTruthy();
    expect(scraper.isAnalyticsTabSelected(dialog)).toBe(false);
    const state = scraper.classifyAnalyticsState(dialog);
    expect(state.modalOpen).toBe(true);
    expect(state.analyticsTabSelected).toBe(false);
    expect(state.depth).toBe('unknown');
  });

  it('recognizes duplicated Analytics tab label (Path C)', () => {
    const { document: doc, scraper } = loadFixtureWithScraper('path-c-components-list.html');
    const dialog = scraper.findAnalyticsDialog(doc);
    const tabs = [...dialog.querySelectorAll('[role="tab"]')];
    const analyticsTab = tabs.find((t) => /analytics/i.test(scraper.tabLabel(t)));
    expect(scraper.tabLabel(analyticsTab)).toBe('Analytics');
    expect(scraper.isAnalyticsTabSelected(dialog)).toBe(true);
  });

  it('returns modalOpen false when no dialog', () => {
    const { scraper } = loadFixtureWithScraper('path-a-components-list.html');
    expect(scraper.classifyAnalyticsState(null).modalOpen).toBe(false);
  });

  it('returns modalOpen false when dialog is hidden (modal closed)', () => {
    const { document: doc, scraper } = loadFixtureWithScraper('path-a-modal-closed.html');
    expect(scraper.findAnalyticsDialog(doc)).toBeNull();
    expect(scraper.classifyAnalyticsState(scraper.findAnalyticsDialog(doc)).modalOpen).toBe(false);
  });

  it('classifies single-component file view separately from variant detail', () => {
    const { document: doc, scraper } = loadFixtureWithScraper('path-a-component-no-variants.html');
    const dialog = scraper.findAnalyticsDialog(doc);
    const state = scraper.classifyAnalyticsState(dialog);
    expect(state.kind).toBe('components');
    expect(state.depth).toBe('component');
    expect(state.itemName).toBe(SINGLE_COMPONENT);
    expect(state.fileCount).toBe(490);
    expect(state.usedIn).toBe('982');
    expect(state.usedBy).toBe('64');

    const result = scraper.scrapeLibraryAnalyticsFromPage(dialog);
    expect(result.error).toMatch(/has no variants/i);
  });

  it('disables analytics when Overview selected even if Analytics tab stays aria-selected', () => {
    const { document: doc, scraper } = loadFixtureWithScraper('path-a-overview-stale-analytics-tab.html');
    const dialog = scraper.findAnalyticsDialog(doc);
    expect(dialog).toBeTruthy();
    expect(scraper.isAnalyticsTabSelected(dialog)).toBe(false);
    const state = scraper.classifyAnalyticsState(dialog);
    expect(state.analyticsTabSelected).toBe(false);
    expect(state.depth).toBe('unknown');
  });

  it('does not treat visible stale analytics panel as selected while on Overview', () => {
    const { document: doc, scraper } = loadFixtureWithScraper('path-a-overview-stale-analytics-panel.html');
    const dialog = scraper.findAnalyticsDialog(doc);
    expect(scraper.isAnalyticsTabSelected(dialog)).toBe(false);
    const state = scraper.classifyAnalyticsState(dialog);
    expect(state.analyticsTabSelected).toBe(false);
    expect(state.depth).toBe('unknown');
  });

  it('does not treat workspace library list as component file usage when breadcrumb team name bleeds', () => {
    const { document: doc, scraper } = loadFixtureWithScraper('path-c-libraries-stale-detail-name.html');
    const dialog = scraper.findAnalyticsDialog(doc);
    const state = scraper.classifyAnalyticsState(dialog);
    expect(state.kind).toBe('components');
    expect(state.depth).toBe('list');
    expect(state.libraryName).toBe(LIBRARY_NAME);
    expect(state.itemCount).toBe(603);
  });

  it('classifies Component insertions landing as components list', () => {
    const { document: doc, scraper } = loadFixtureWithScraper('path-a-components-insertions-only.html');
    const dialog = scraper.findAnalyticsDialog(doc);
    const state = scraper.classifyAnalyticsState(dialog);
    expect(state.analyticsTabSelected).toBe(true);
    expect(state.kind).toBe('components');
    expect(state.depth).toBe('list');
    expect(state.itemCount).toBe(603);
  });
});

describe('extractItemName', () => {
  it('reads asset_file_view_header--name--', () => {
    const { document: doc, scraper } = loadFixtureWithScraper('path-a-components-detail.html');
    const dialog = scraper.findAnalyticsDialog(doc);
    expect(scraper.extractItemName(dialog)).toBe(COMPONENT_SET);
  });

  it('reads slash-path style names', () => {
    const { document: doc, scraper } = loadFixtureWithScraper('path-a-styles-detail.html');
    const dialog = scraper.findAnalyticsDialog(doc);
    expect(scraper.extractItemName(dialog)).toBe(STYLE_DETAIL);
  });
});
