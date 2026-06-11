import { describe, it, expect } from 'vitest';
import { loadFixtureWithScraper } from './helpers/loadFixture.js';
import { loadSharedModule } from './helpers/loadShared.js';
import { parseCsv, csvLabelValue, csvDataRowsAfterHeader, markdownTableBodyRowCount, markdownTableContainsName } from './helpers/csv.js';
import { LIBRARY_NAME, FILES } from './fixtures/names.js';

const ExportFormat = loadSharedModule('shared/export-format.js', 'ExportFormat');

const SCRAPED_AT = '2026-06-09T12:00:00.000Z';

function variantPayload(overrides = {}) {
  return {
    componentName: 'Icon / Filter (Special)',
    libraryName: LIBRARY_NAME,
    scrapedAt: SCRAPED_AT,
    viewType: 'All Variants',
    variants: [
      { name: 'Foo/Bar variant', totalInstances: '10', inserts: '1', detaches: '0' },
      { name: 'Foo-Bar variant', totalInstances: '5', inserts: '0', detaches: '0' },
      { name: 'Size=Medium, State=Default', totalInstances: '3', inserts: '1', detaches: '0' },
    ],
    ...overrides,
  };
}

function fileUsagePayload(overrides = {}) {
  return {
    itemName: 'color/text|default',
    itemKind: 'variables',
    libraryName: LIBRARY_NAME,
    scrapedAt: SCRAPED_AT,
    files: [{ name: FILES.reportsPipeDelimited, team: 'Growth', instances: '37,104', lastModified: '11 days ago' }],
    ...overrides,
  };
}

describe('export fidelity contract', () => {
  describe('scraper payloads preserve Figma names', () => {
    it('preserves component detail and variant names from special-chars fixture', () => {
      const { document: doc, scraper } = loadFixtureWithScraper('special-chars-names.html');
      const dialog = scraper.findAnalyticsDialog(doc);
      const result = scraper.scrapeLibraryAnalyticsFromPage(dialog);

      expect(result.componentName).toBe('Icon / Filter (Special)');
      expect(result.variants.map((v) => v.name)).toEqual(
        expect.arrayContaining(['Foo/Bar variant', 'Foo-Bar variant'])
      );
      const iconOnly = result.variants.find((v) => scraper.isIconOnlyLine(v.name));
      expect(iconOnly).toBeUndefined();
    });

    it('preserves component list names with slashes, spaces, and parentheses', async () => {
      const { document: doc, scraper } = loadFixtureWithScraper('special-chars-components-list.html');
      const dialog = scraper.findAnalyticsDialog(doc);
      const result = await scraper.scrapeComponentListFromPage(dialog);

      expect(result.error).toBeUndefined();
      expect(result.libraryName).toBe(LIBRARY_NAME);
      expect(result.components.map((c) => c.name)).toEqual(
        expect.arrayContaining(['Icon / Filter (Special)', 'List/Item'])
      );
    });

    it('preserves style list names with pipes and slashes', async () => {
      const { document: doc, scraper } = loadFixtureWithScraper('special-chars-styles-list.html');
      const dialog = scraper.findAnalyticsDialog(doc);
      const result = await scraper.scrapeStyleListFromPage(dialog);

      expect(result.error).toBeUndefined();
      expect(result.libraryName).toBe(LIBRARY_NAME);
      expect(result.styles.map((s) => s.name)).toEqual(
        expect.arrayContaining(['heading | display', 'body/small-regular'])
      );
    });

    it('preserves variable list names with pipes and bullets', async () => {
      const { document: doc, scraper } = loadFixtureWithScraper('special-chars-variables-list.html');
      const dialog = scraper.findAnalyticsDialog(doc);
      const result = await scraper.scrapeVariableListFromPage(dialog);

      expect(result.error).toBeUndefined();
      expect(result.libraryName).toBe(LIBRARY_NAME);
      expect(result.variables.map((v) => v.name)).toEqual(
        expect.arrayContaining(['color/text|default', 'spacing/layout • grid'])
      );
    });
  });

  describe('CSV exports preserve exact names', () => {
    it('keeps variant names verbatim in variant CSV', () => {
      const payload = variantPayload();
      const rows = parseCsv(ExportFormat.generateVariantCsv(payload));

      expect(csvLabelValue(rows, 'Component')).toBe('Icon / Filter (Special)');
      const variantRows = csvDataRowsAfterHeader(rows, 'Variant');
      expect(variantRows.map((row) => row[0])).toEqual([
        'Foo/Bar variant',
        'Foo-Bar variant',
        'Size=Medium, State=Default',
      ]);
    });

    it('keeps pipe-delimited file names verbatim in file usage CSV', () => {
      const payload = fileUsagePayload();
      const rows = parseCsv(ExportFormat.generateFileUsageCsv(payload));

      expect(csvLabelValue(rows, 'Variable')).toBe('color/text|default');
      expect(csvLabelValue(rows, 'Library')).toBe(LIBRARY_NAME);
      const fileRows = csvDataRowsAfterHeader(rows, 'File');
      expect(fileRows[0][0]).toBe(FILES.reportsPipeDelimited);
    });

    it('keeps style and variable list names verbatim', () => {
      const stylePayload = {
        libraryName: LIBRARY_NAME,
        styleCount: 1,
        scrapedAt: SCRAPED_AT,
        styles: [{ name: 'heading | display', instances: '1', inserts: '0', detaches: '0' }],
      };
      const styleRows = csvDataRowsAfterHeader(parseCsv(ExportFormat.generateStyleListCsv(stylePayload)), 'Style');
      expect(styleRows[0][0]).toBe('heading | display');

      const variablePayload = {
        libraryName: LIBRARY_NAME,
        entryCount: 1,
        scrapedAt: SCRAPED_AT,
        variables: [
          { name: 'color/text|default', collection: 'web_colour', instances: '1', inserts: '0', detaches: '0' },
        ],
      };
      const variableRows = csvDataRowsAfterHeader(
        parseCsv(ExportFormat.generateVariableListCsv(variablePayload)),
        'Variable'
      );
      expect(variableRows[0][0]).toBe('color/text|default');
      expect(variableRows[0][1]).toBe('web_colour');
    });
  });

  describe('JSON exports preserve exact names', () => {
    it('round-trips scraped variant payload without altering names', () => {
      const { document: doc, scraper } = loadFixtureWithScraper('special-chars-names.html');
      const dialog = scraper.findAnalyticsDialog(doc);
      const scraped = scraper.scrapeLibraryAnalyticsFromPage(dialog);
      scraped.scrapedAt = SCRAPED_AT;

      const roundTripped = JSON.parse(JSON.stringify(scraped));
      expect(roundTripped.componentName).toBe('Icon / Filter (Special)');
      expect(roundTripped.variants.map((v) => v.name)).toEqual(
        expect.arrayContaining(['Foo/Bar variant', 'Foo-Bar variant'])
      );
    });

    it('round-trips file usage payload without altering names', () => {
      const payload = fileUsagePayload();
      const roundTripped = JSON.parse(JSON.stringify(payload));
      expect(roundTripped.itemName).toBe('color/text|default');
      expect(roundTripped.files[0].name).toBe(FILES.reportsPipeDelimited);
      expect(roundTripped.libraryName).toBe(LIBRARY_NAME);
    });
  });

  describe('Markdown exports escape table pipes without altering meaning', () => {
    it('escapes pipe characters in variant and file usage tables', () => {
      const variantMd = ExportFormat.generateVariantMarkdown(variantPayload());
      expect(markdownTableContainsName(variantMd, 'Foo/Bar variant')).toBe(true);
      expect(markdownTableContainsName(variantMd, 'Size=Medium, State=Default')).toBe(true);

      const fileMd = ExportFormat.generateFileUsageMarkdown(fileUsagePayload());
      expect(markdownTableContainsName(fileMd, FILES.reportsPipeDelimited)).toBe(true);
      expect(fileMd).toContain('Reports \\| Q1 Draft');
    });

    it('escapes pipe characters in style and variable list tables', () => {
      const styleMd = ExportFormat.generateStyleListMarkdown({
        libraryName: LIBRARY_NAME,
        styleCount: 1,
        scrapedAt: SCRAPED_AT,
        styles: [{ name: 'heading | display', instances: '1', inserts: '0', detaches: '0' }],
      });
      expect(markdownTableContainsName(styleMd, 'heading | display')).toBe(true);
      expect(markdownTableBodyRowCount(styleMd, '| # | Style |')).toBe(1);

      const variableMd = ExportFormat.generateVariableListMarkdown({
        libraryName: LIBRARY_NAME,
        entryCount: 1,
        scrapedAt: SCRAPED_AT,
        variables: [
          { name: 'color/text|default', collection: 'web|colour', instances: '1', inserts: '0', detaches: '0' },
        ],
      });
      expect(markdownTableContainsName(variableMd, 'color/text|default')).toBe(true);
      expect(markdownTableContainsName(variableMd, 'web|colour')).toBe(true);
    });

    it('leaves non-table metadata unescaped', () => {
      const md = ExportFormat.generateFileUsageMarkdown(fileUsagePayload());
      expect(md).toContain(`**Library:** ${LIBRARY_NAME}`);
      expect(md).toContain('# color/text|default - Variable File Usage');
    });
  });

  describe('filenames may differ from source names', () => {
    it('sanitizes download filenames while keeping source names in CSV payload', () => {
      const source = 'Icon / Filter (Special)';
      const safeName = ExportFormat.sanitizeFilename(source);
      expect(safeName).not.toBe(source);
      expect(safeName).toMatch(/^icon-filter-special-[a-z0-9]{1,6}$/);

      const payload = variantPayload({ componentName: source });
      expect(parseCsv(ExportFormat.generateVariantCsv(payload))[0][1]).toBe(source);
    });

    it('produces distinct filenames for slash vs hyphen collisions', () => {
      const a = ExportFormat.sanitizeFilename('Foo/Bar');
      const b = ExportFormat.sanitizeFilename('Foo-Bar');
      expect(a).not.toBe(b);
    });
  });
});
