import { describe, it, expect } from 'vitest';
import { loadFixtureWithScraper } from './helpers/loadFixture.js';
import { loadSharedModule } from './helpers/loadShared.js';

const PanelInsights = loadSharedModule('shared/insights.js', 'PanelInsights');

describe('parseInstanceCount', () => {
  it('parses plain numbers and zero-like values', () => {
    expect(PanelInsights.parseInstanceCount('1,234')).toBe(1234);
    expect(PanelInsights.parseInstanceCount('0')).toBe(0);
    expect(PanelInsights.parseInstanceCount('-')).toBe(0);
    expect(PanelInsights.parseInstanceCount('N/A')).toBe(0);
  });

  it('parses abbreviated counts', () => {
    expect(PanelInsights.parseInstanceCount('7.8k')).toBe(7800);
  });
});

describe('buildZeroInstanceVariantsNote', () => {
  it('returns null when every variant has usage', () => {
    const note = PanelInsights.buildZeroInstanceVariantsNote([
      { name: 'Primary', totalInstances: '123' },
      { name: 'Secondary', totalInstances: '1' },
    ]);
    expect(note).toBeNull();
  });

  it('counts variants with zero total instances', () => {
    const note = PanelInsights.buildZeroInstanceVariantsNote([
      { name: 'Primary', totalInstances: '123' },
      { name: 'Unused A', totalInstances: '0' },
      { name: 'Unused B', totalInstances: '-' },
    ]);
    expect(note).toMatchObject({
      title: 'Zero instances',
      text: '2 variants with zero total instances — candidates to deprecate',
      detail: 'Based on all-time totals (not recent inserts).',
    });
  });
});

describe('buildParetoFootnote', () => {
  it('summarizes top-N share of total instances', () => {
    const items = Array.from({ length: 20 }, (_, i) => ({
      name: `Item ${i}`,
      instances: String(100 - i),
    }));
    expect(PanelInsights.buildParetoFootnote(items, { topN: 10, itemNoun: 'components' })).toMatch(
      /^Top 10 components = \d+% of total instances$/
    );
  });
});

describe('buildHighestDetachRateNote', () => {
  it('flags styles where detaches exceed inserts', () => {
    const note = PanelInsights.buildHighestDetachRateNote([
      { name: 'body/regular', instances: '100', inserts: '100', detaches: '10' },
      { name: 'body/bold', instances: '50', inserts: '100', detaches: '240' },
    ]);
    expect(note).toMatchObject({
      title: 'Highest detach rate',
      text: 'body/bold (detaches 2.4× inserts)',
    });
  });
});

describe('isStaleLastModified', () => {
  it('treats relative month and year strings as stale', () => {
    expect(PanelInsights.isStaleLastModified('6 months ago')).toBe(true);
    expect(PanelInsights.isStaleLastModified('1 year ago')).toBe(true);
    expect(PanelInsights.isStaleLastModified('11 days ago')).toBe(false);
    expect(PanelInsights.isStaleLastModified('Jan 5, 2025')).toBe(false);
  });
});

describe('buildFileUsageInsightsHtml', () => {
  it('includes top files, teams, stale note, and concentration footnote', () => {
    const html = PanelInsights.buildFileUsageInsightsHtml(
      [
        { name: 'File A', team: 'Team One', instances: '600', lastModified: '6 months ago' },
        { name: 'File B', team: 'Team One', instances: '300', lastModified: '1 day ago' },
        { name: 'File C', team: 'Team Two', instances: '100', lastModified: '2 months ago' },
        { name: 'File D', team: 'Team Three', instances: '50', lastModified: '3 months ago' },
      ],
      { title: 'File usage', text: 'Used in 4 files across 3 teams' }
    );

    expect(html).toContain('Top files');
    expect(html).toContain('Top teams');
    expect(html).toContain('Stale files');
    expect(html).toContain('Top 3 teams');
  });
});

describe('buildComponentListInsightsHtml', () => {
  it('renders top components and pareto footnote', () => {
    const html = PanelInsights.buildComponentListInsightsHtml(
      [
        { name: 'Icon/More', instances: '420' },
        { name: 'Button', instances: '100' },
        { name: 'Unused', instances: '0' },
      ],
      { title: 'Library', text: '3 library components shown' }
    );

    expect(html).toContain('Top components');
    expect(html).toContain('Icon/More');
    expect(html).toContain('1 component with zero total instances');
  });
});

describe('buildVariableListInsightsHtml', () => {
  it('groups by collection and notes zero inserts', () => {
    const html = PanelInsights.buildVariableListInsightsHtml(
      [
        { name: 'color/text', collection: 'color', instances: '100', inserts: '0', detaches: '0' },
        { name: 'spacing/md', collection: 'spacing', instances: '50', inserts: '10', detaches: '0' },
      ],
      { title: 'Library', text: '2 library variables shown' }
    );

    expect(html).toContain('By collection');
    expect(html).toContain('1 variables with zero inserts (30d)');
  });
});

describe('buildModeListInsightsHtml', () => {
  it('shows mode share per collection', () => {
    const html = PanelInsights.buildModeListInsightsHtml(
      [
        { mode: 'Light', collection: 'color', instances: '620' },
        { mode: 'Dark', collection: 'color', instances: '380' },
      ],
      { title: 'Library', text: '2 library modes shown' }
    );

    expect(html).toContain('color collection');
  });
});

describe('renderInsightBars', () => {
  it('renders scope before notes and footnote at the bottom', () => {
    const html = PanelInsights.renderInsightBars([], {
      scope: { title: 'Library', text: '603 library components shown' },
      footnote: 'Top 10 components = 68% of total instances',
    });

    const scopeIndex = html.indexOf('preview-scope');
    const footnoteIndex = html.indexOf('preview-footnote');
    expect(scopeIndex).toBeGreaterThan(-1);
    expect(footnoteIndex).toBeGreaterThan(scopeIndex);
    expect(html).toContain('Library');
    expect(html).toContain('Top 10 components = 68% of total instances');
  });
});

describe('buildVariantDetailInsightsHtml', () => {
  it('includes variant count summary and zero-instance note', () => {
    const html = PanelInsights.buildVariantDetailInsightsHtml(
      [
        { name: 'Size=Medium, State=Default', totalInstances: '100', inserts: '10', detaches: '1' },
        { name: 'Size=Small, State=Default', totalInstances: '0', inserts: '0', detaches: '0' },
      ],
      2
    );

    expect(html).toContain('preview-scope');
    expect(html).toContain('Variants');
    expect(html).toContain('2 variants');
    expect(html).toContain('1 variant with zero total instances');
    expect(html).toContain('Based on all-time totals (not recent inserts).');
  });

  it('shows scope-only html before variant rows are available', () => {
    const html = PanelInsights.buildVariantDetailInsightsHtml(null, 24);
    expect(html).toContain('preview-scope');
    expect(html).toContain('Variants');
    expect(html).toContain('24 variants');
    expect(html).not.toContain('Zero instances');
  });

  it('notes dominant property values', () => {
    const html = PanelInsights.buildVariantDetailInsightsHtml(
      [
        { name: 'State=Default', totalInstances: '80', inserts: '5', detaches: '0' },
        { name: 'State=Hover', totalInstances: '20', inserts: '5', detaches: '0' },
      ],
      2
    );

    expect(html).toContain('Skewed usage');
    expect(html).toContain('State=&quot;Default&quot; is used in 80% of instances');
  });
});

describe('insightsPayloadHasContent', () => {
  it('is false for scope-only payloads', () => {
    expect(
      PanelInsights.insightsPayloadHasContent({
        scope: { title: 'Variants', text: '24 variants' },
        groups: [],
        notes: [],
        footnote: null,
      })
    ).toBe(false);
  });

  it('is true when groups, notes, or footnotes exist', () => {
    expect(
      PanelInsights.insightsPayloadHasContent({
        groups: [{ name: 'Top components', items: [{ label: 'A', percent: 100 }] }],
        notes: [],
        footnote: null,
      })
    ).toBe(true);
  });
});

describe('buildDuplicateComponentNamesNote', () => {
  it('flags duplicate component names with per-row instance counts', () => {
    const components = [
      { name: 'Form wireframe/Checkbox, Radio', instances: '20' },
      { name: 'Button/Primary', instances: '100' },
      { name: 'Form wireframe/Checkbox, Radio', instances: '4' },
      { name: 'Embedded Apps logo/Powered by/Minimal/Light', instances: '6' },
      { name: 'Embedded Apps logo/Powered by/Minimal/Light', instances: '3' },
    ];

    const note = PanelInsights.buildDuplicateComponentNamesNote(components);
    expect(note?.title).toBe('Duplicate names');
    expect(note?.text).toBe('');
    expect(note?.detail).toBe('Rename or consolidate duplicates in the library file.');
    expect(note?.bullets).toEqual([
      {
        name: 'Embedded Apps logo/Powered by/Minimal/Light',
        meta: '2 components · 9 total instances',
      },
      {
        name: 'Form wireframe/Checkbox, Radio',
        meta: '2 components · 24 total instances',
      },
    ]);
  });

  it('returns null when every component name is unique', () => {
    expect(
      PanelInsights.buildDuplicateComponentNamesNote([
        { name: 'A', instances: '1' },
        { name: 'B', instances: '2' },
      ])
    ).toBeNull();
  });
});

describe('buildComponentListInsightsPayload duplicate names', () => {
  it('adds a duplicate names note to component list insights', () => {
    const payload = PanelInsights.buildComponentListInsightsPayload(
      [
        { name: 'Form wireframe/Checkbox, Radio', instances: '20' },
        { name: 'Form wireframe/Checkbox, Radio', instances: '4' },
        { name: 'Button/Primary', instances: '100' },
      ],
      { title: 'Library', text: '3 library components shown' }
    );

    expect(payload.notes.some((note) => note.title === 'Duplicate names')).toBe(true);
  });

  it('renders duplicate names as a readable bullet list in panel HTML', () => {
    const note = PanelInsights.buildDuplicateComponentNamesNote([
      { name: 'Form wireframe/Checkbox, Radio', instances: '20' },
      { name: 'Form wireframe/Checkbox, Radio', instances: '4' },
    ]);

    const html = PanelInsights.renderNote(note);
    expect(html).toContain('preview-note__list');
    expect(html).toContain('Form wireframe/Checkbox, Radio');
    expect(html).toContain('2 components · 24 total instances');
    expect(html).not.toContain('preview-note__text');
  });

  it('exports duplicate names as separate insight rows in csv and markdown', () => {
    const note = PanelInsights.buildDuplicateComponentNamesNote([
      { name: 'Form wireframe/Checkbox, Radio', instances: '20' },
      { name: 'Form wireframe/Checkbox, Radio', instances: '4' },
    ]);
    const insights = PanelInsights.buildInsightsPayload(null, [], [note], null);

    const csv = PanelInsights.insightsToCsvRows(insights);
    expect(csv.some((row) => row[1] === 'Form wireframe/Checkbox, Radio' && row[2] === '2 components · 24 total instances')).toBe(true);

    const md = PanelInsights.insightsToMarkdown(insights);
    expect(md).toContain('**Form wireframe/Checkbox, Radio** — 2 components · 24 total instances');
  });
});

describe('insights export formatting', () => {
  it('adds insights sections to csv and markdown', () => {
    const insights = PanelInsights.buildComponentListInsightsPayload(
      [
        { name: 'Icon', instances: '100' },
        { name: 'Button', instances: '50' },
      ],
      { title: 'Library', text: '2 library components shown' }
    );

    const csv = PanelInsights.insightsToCsvRows(insights);
    expect(csv[0]).toEqual([]);
    expect(csv[1]).toEqual(['Insights']);
    expect(csv.some((row) => row[0] === 'Top components')).toBe(true);

    const md = PanelInsights.insightsToMarkdown(insights);
    expect(md).toContain('## Insights');
    expect(md).toContain('Top components');
  });
});

describe('buildInsightsPayloadForState', () => {
  it('returns structured payload for component list', () => {
    const payload = PanelInsights.buildInsightsPayloadForState(
      { kind: 'components', depth: 'list', variablesSubTab: 'variables' },
      { components: [{ name: 'A', instances: '10' }, { name: 'B', instances: '5' }] },
      { scope: { title: 'Library', text: '2 library components shown' } }
    );

    expect(PanelInsights.insightsPayloadHasContent(payload)).toBe(true);
    expect(payload.groups.some((group) => group.name === 'Top components')).toBe(true);
  });
});

describe('buildCombinatorialExplosionNote', () => {
  it('flags large variant matrices with many zero-use variants', () => {
    const variants = Array.from({ length: 12 }, (_, i) => ({
      name: `Variant ${i}`,
      totalInstances: i < 4 ? '10' : '0',
    }));
    const note = PanelInsights.buildCombinatorialExplosionNote(variants, 12);
    expect(note?.title).toBe('Variant matrix');
    expect(note?.text).toContain('12 variants defined');
  });
});

describe('buildUnusedPropertyValuesNote', () => {
  it('lists property values with zero instances', () => {
    const note = PanelInsights.buildUnusedPropertyValuesNote({
      properties: {
        Size: [
          { value: 'Large', count: 100, percent: '100' },
          { value: 'Small', count: 0, percent: '0' },
        ],
      },
    });
    expect(note?.title).toBe('Unused property values');
    expect(note?.text).toContain('Size=Small');
  });
});

describe('buildDefaultSkewNotes', () => {
  it('notes when a default property value has low usage', () => {
    const variants = [
      { name: 'Size=Small (default)', totalInstances: '20' },
      { name: 'Size=Large', totalInstances: '80' },
    ];
    const analysis = PanelInsights.analyzePropertyUsage(variants);
    const notes = PanelInsights.buildDefaultSkewNotes(variants, analysis);
    expect(notes.some((note) => note.title === 'Default skew')).toBe(true);
  });
});

describe('buildLegacyActivityNote', () => {
  it('flags items with high all-time use and zero recent inserts', () => {
    const note = PanelInsights.buildLegacyActivityNote(
      [{ name: 'body/bold', instances: '500', inserts: '0' }],
      { itemNoun: 'styles' }
    );
    expect(note?.title).toBe('Legacy usage');
  });
});

describe('durationInsightsFootnote', () => {
  it('returns null for the default 30-day window', () => {
    expect(PanelInsights.durationInsightsFootnote('30')).toBeNull();
  });

  it('describes non-default durations', () => {
    expect(PanelInsights.durationInsightsFootnote('90')).toContain('90 days');
  });
});

describe('buildInsightsHtml', () => {
  it('dispatches to the correct builder for each view', () => {
    const listState = {
      kind: 'components',
      depth: 'list',
      variablesSubTab: 'variables',
    };
    const listHtml = PanelInsights.buildInsightsHtml(listState, {
      components: [{ name: 'A', instances: '1' }],
    }, {
      scope: { title: 'Library', text: '1 library components shown' },
    });
    expect(listHtml).toContain('Top components');

    const modesState = {
      kind: 'variables',
      depth: 'list',
      variablesSubTab: 'modes',
    };
    const modesHtml = PanelInsights.buildInsightsHtml(modesState, {
      modes: [{ mode: 'Light', collection: 'color', instances: '1' }],
    }, {
      scope: { title: 'Library', text: '1 library modes shown' },
    });
    expect(modesHtml).toContain('color collection');
  });
});

describe('integration with scraped fixture', () => {
  it('builds insights from real variant scrape data', () => {
    const { document: doc, scraper } = loadFixtureWithScraper('path-a-components-detail.html');
    const dialog = scraper.findAnalyticsDialog(doc);
    const result = scraper.scrapeLibraryAnalyticsFromPage(dialog);

    expect(result.error).toBeUndefined();

    const html = PanelInsights.buildVariantDetailInsightsHtml(result.variants, result.expectedCount);
    expect(html).toContain(`${result.expectedCount} variants`);
  });

  it('builds component list insights from fixture', async () => {
    const { document: doc, scraper } = loadFixtureWithScraper('path-a-components-list.html');
    const dialog = scraper.findAnalyticsDialog(doc);
    const result = await scraper.scrapeComponentListFromPage(dialog);

    expect(result.error).toBeUndefined();
    const html = PanelInsights.buildComponentListInsightsHtml(result.components, {
      title: 'Library',
      text: `${result.components.length} library components shown`,
    });
    expect(html).toContain('Top components');
  });
});

describe('panel preview insights', () => {
  it('builds non-empty HTML for every exportable preview state', async () => {
    const { buildPreviewInsightsHtml, PREVIEW_INSIGHT_CASES } = await import(
      '../scripts/panel-preview-insights.mjs'
    );

    for (const id of Object.keys(PREVIEW_INSIGHT_CASES)) {
      const html = buildPreviewInsightsHtml(id);
      expect(html.length).toBeGreaterThan(100);
      expect(html).toContain('preview-scope');
      expect(html).toContain('preview-bar-row');
    }
  });
});
