import { describe, it, expect } from 'vitest';
import { loadFixtureWithScraper, loadScraper } from './helpers/loadFixture.js';
import {
  COMPONENT_SET,
  SINGLE_COMPONENT,
  VARIANT_SELECTED,
  COMPONENT_ALL_VARIANTS,
  LIST_COMPONENT_PRIMARY,
  STYLE_DETAIL,
  VARIABLE_DETAIL,
  TEAMS,
  FILES,
} from './fixtures/names.js';

const scraperUtils = loadScraper();

describe('scrapeLibraryAnalyticsFromPage', () => {
  it('extracts component name from header selector on Path A', async () => {
    const { document: doc, scraper } = loadFixtureWithScraper('path-a-components-detail.html');
    const dialog = scraper.findAnalyticsDialog(doc);
    const result = scraper.scrapeLibraryAnalyticsFromPage(dialog);
    expect(result.error).toBeUndefined();
    expect(result.componentName).toBe(COMPONENT_SET);
    expect(result.expectedCount).toBe(24);
    expect(result.variants.length).toBeGreaterThan(0);
  });

  it('classifies variant file usage when a variant is selected', () => {
    const { document: doc, scraper } = loadFixtureWithScraper('path-a-components-variant-file-usage.html');
    const dialog = scraper.findAnalyticsDialog(doc);
    const state = scraper.classifyAnalyticsState(dialog);
    expect(state.kind).toBe('components');
    expect(state.depth).toBe('variant');
    expect(state.itemName).toBe(VARIANT_SELECTED);
    expect(state.componentSetName).toBe(COMPONENT_SET);
    expect(state.usedIn).toBe('18');
    expect(state.usedBy).toBe('7');
  });

  it('scrapes variant file usage rows', async () => {
    const { document: doc, scraper } = loadFixtureWithScraper('path-a-components-variant-file-usage.html');
    const dialog = scraper.findAnalyticsDialog(doc);
    const result = await scraper.scrapeFileUsageDetailFromPage(dialog, 'components');
    expect(result.error).toBeUndefined();
    expect(result.itemName).toBe(VARIANT_SELECTED);
    expect(result.itemKind).toBe('component-variant');
    expect(result.totalInstances).toBe('7.8k');
    expect(result.files.some((f) => f.name === FILES.onboardingFlow)).toBe(true);
    expect(result.files.find((f) => f.name === FILES.onboardingFlow)?.instances).toBe('3,104');
    expect(result.files.find((f) => f.name === FILES.onboardingFlow)?.lastModified).toBe('Jan 5, 2025');
    expect(result.files.find((f) => f.name === FILES.accountSettings)?.lastModified).toBe('Feb 12, 2025');
  });

  it('classifies All variants layout without Showing N variants line', () => {
    const { document: doc, scraper } = loadFixtureWithScraper('path-a-components-detail-all-variants.html');
    const dialog = scraper.findAnalyticsDialog(doc);
    const state = scraper.classifyAnalyticsState(dialog);
    expect(state.kind).toBe('components');
    expect(state.depth).toBe('detail');
    expect(state.itemName).toBe(COMPONENT_ALL_VARIANTS);
  });

  it('scrapes All variants layout', () => {
    const { document: doc, scraper } = loadFixtureWithScraper('path-a-components-detail-all-variants.html');
    const dialog = scraper.findAnalyticsDialog(doc);
    const result = scraper.scrapeLibraryAnalyticsFromPage(dialog);
    expect(result.error).toBeUndefined();
    expect(result.componentName).toBe(COMPONENT_ALL_VARIANTS);
    expect(result.variants.length).toBeGreaterThanOrEqual(3);
    expect(result.variants.some((v) => v.name.includes(VARIANT_SELECTED))).toBe(true);
  });

  it('rejects list view', () => {
    const { document: doc, scraper } = loadFixtureWithScraper('path-a-components-list.html');
    const dialog = scraper.findAnalyticsDialog(doc);
    const result = scraper.scrapeLibraryAnalyticsFromPage(dialog);
    expect(result.error).toMatch(/Not on a component variant detail view/);
  });
});

describe('scrapeComponentListFromPage', () => {
  it('collects components from list fixture', async () => {
    const { document: doc, scraper } = loadFixtureWithScraper('path-a-components-list.html');
    const dialog = scraper.findAnalyticsDialog(doc);
    const result = await scraper.scrapeComponentListFromPage(dialog);
    expect(result.error).toBeUndefined();
    expect(result.components.length).toBeGreaterThanOrEqual(2);
    expect(result.components.some((c) => c.name === LIST_COMPONENT_PRIMARY)).toBe(true);
  });

  it('exports duplicate component names as separate rows', async () => {
    const { document: doc, scraper } = loadFixtureWithScraper('duplicate-names-components-list.html');
    const dialog = scraper.findAnalyticsDialog(doc);
    const result = await scraper.scrapeComponentListFromPage(dialog);

    expect(result.error).toBeUndefined();
    expect(result.components).toHaveLength(3);
    expect(
      result.components
        .filter((c) => c.name === 'Form wireframe/Checkbox, Radio')
        .map((c) => c.instances)
    ).toEqual(['20', '4']);
  });
});

describe('scrapeStyleListFromPage', () => {
  it('collects styles from list fixture', async () => {
    const { document: doc, scraper } = loadFixtureWithScraper('path-a-styles-list.html');
    const dialog = scraper.findAnalyticsDialog(doc);
    const result = await scraper.scrapeStyleListFromPage(dialog);
    expect(result.error).toBeUndefined();
    expect(result.styles.length).toBeGreaterThanOrEqual(1);
    expect(result.styles.some((s) => s.name === 'body/small-regular')).toBe(true);
    const style = result.styles.find((s) => s.name === 'body/small-regular');
    expect(style.instances).toBe('344,454');
    expect(style.inserts).toBe('162,828');
    expect(style.detaches).toBe('83');
  });

  it('rejects non-list view', async () => {
    const { document: doc, scraper } = loadFixtureWithScraper('path-a-styles-detail.html');
    const dialog = scraper.findAnalyticsDialog(doc);
    const result = await scraper.scrapeStyleListFromPage(dialog);
    expect(result.error).toMatch(/Not on the styles list view/);
  });
});

describe('classifyAnalyticsState transitional type switch', () => {
  it('returns variables/unknown when combobox updates before variables panel renders', () => {
    const { document: doc, scraper } = loadFixtureWithScraper('path-a-variables-list-stale-styles.html');
    const dialog = scraper.findAnalyticsDialog(doc);
    const state = scraper.classifyAnalyticsState(dialog);

    expect(scraper.getTypeKind(dialog)).toBe('variables');
    expect(state.kind).toBe('variables');
    expect(state.depth).toBe('unknown');
    expect(state.analyticsTabSelected).toBe(true);
  });
});

describe('scrapeVariableListFromPage', () => {
  it('collects variables with full stat columns from list fixture', async () => {
    const { document: doc, scraper } = loadFixtureWithScraper('path-a-variables-list.html');
    const dialog = scraper.findAnalyticsDialog(doc);
    const result = await scraper.scrapeVariableListFromPage(dialog);
    expect(result.error).toBeUndefined();
    expect(result.variablesSubTab).toBe('variables');
    expect(result.variables.length).toBeGreaterThanOrEqual(1);
    const variable = result.variables.find((v) => v.name === 'color/text/default');
    expect(variable).toBeTruthy();
    expect(variable.collection).toBe('web_colour');
    expect(variable.instances).toBe('819,666');
    expect(variable.inserts).toBe('326,778');
    expect(variable.detaches).toBe('119');
  });

  it('collects modes with mode, collection, and instances only', async () => {
    const { document: doc, scraper } = loadFixtureWithScraper('path-a-variables-modes-list.html');
    const dialog = scraper.findAnalyticsDialog(doc);
    const result = await scraper.scrapeVariableListFromPage(dialog);
    expect(result.error).toBeUndefined();
    expect(result.variablesSubTab).toBe('modes');
    expect(result.modes.length).toBe(3);

    const product = result.modes.find((m) => m.mode === 'product');
    expect(product).toEqual({
      mode: 'product',
      collection: 'web_product',
      instances: '4,928,843',
    });
    expect(product.inserts).toBeUndefined();
    expect(product.detaches).toBeUndefined();

    const light = result.modes.find((m) => m.mode === 'light');
    expect(light?.collection).toBe('web_colour');
    expect(light?.instances).toBe('4,910,977');

    const user = result.modes.find((m) => m.mode === 'user');
    expect(user?.collection).toBe('component_avatar');
    expect(user?.instances).toBe('6,225');
  });
});

describe('getVariablesSubTab', () => {
  it('detects Variables and Modes sub-tabs', () => {
    const { document: doc, scraper } = loadFixtureWithScraper('path-a-variables-list.html');
    const dialog = scraper.findAnalyticsDialog(doc);
    expect(scraper.getVariablesSubTab(dialog)).toBe('variables');

    const modesDoc = loadFixtureWithScraper('path-a-variables-modes-list.html');
    const modesDialog = modesDoc.scraper.findAnalyticsDialog(modesDoc.document);
    expect(modesDoc.scraper.getVariablesSubTab(modesDialog)).toBe('modes');
  });
});

describe('selectAnalyticsTab', () => {
  function wireModalTabs(doc, scraper) {
    const dialog = scraper.findAnalyticsDialog(doc);
    const tabs = [...dialog.querySelectorAll('[role="tab"]')].filter((tab) =>
      /^(overview|analytics)$/i.test(scraper.tabLabel(tab))
    );
    for (const tab of tabs) {
      tab.addEventListener('click', () => {
        for (const candidate of tabs) {
          candidate.setAttribute('aria-selected', candidate === tab ? 'true' : 'false');
        }
      });
    }
  }

  it('clicks Analytics when Overview is selected', () => {
    const { document: doc, scraper } = loadFixtureWithScraper('path-a-overview-tab.html');
    wireModalTabs(doc, scraper);
    const dialog = scraper.findAnalyticsDialog(doc);

    expect(scraper.isAnalyticsTabSelected(dialog)).toBe(false);
    const result = scraper.selectAnalyticsTab(dialog);
    expect(result).toMatchObject({ ok: true, changed: true });
    expect(scraper.isAnalyticsTabSelected(dialog)).toBe(true);
  });

  it('clicks Analytics when tabs live on the modal shell outside role="dialog"', () => {
    const { document: doc, scraper } = loadFixtureWithScraper('path-a-overview-tab-outside-dialog.html');
    const shell = doc.querySelector('[class*="header_modal--modal--"]');
    const tabs = [...shell.querySelectorAll('[role="tab"]')].filter((tab) =>
      /^(overview|analytics)$/i.test(scraper.tabLabel(tab))
    );
    for (const tab of tabs) {
      tab.addEventListener('click', () => {
        for (const candidate of tabs) {
          candidate.setAttribute('aria-selected', candidate === tab ? 'true' : 'false');
        }
        const overviewPanel = doc.querySelector('[class*="dsa_file_view_overview--"]');
        const analyticsPanel = doc.querySelector('[class*="dsa_file_view_analytics--"]');
        if (overviewPanel) overviewPanel.style.display = scraper.tabLabel(tab) === 'Overview' ? '' : 'none';
        if (analyticsPanel) analyticsPanel.style.display = scraper.tabLabel(tab) === 'Analytics' ? '' : 'none';
      });
    }

    const dialog = scraper.findAnalyticsDialog(doc);
    expect(scraper.isAnalyticsTabSelected(dialog)).toBe(false);

    const result = scraper.selectAnalyticsTab(dialog);
    expect(result).toMatchObject({ ok: true, changed: true });
    expect(scraper.isAnalyticsTabSelected(dialog)).toBe(true);
  });

  it('returns unchanged when Analytics is already selected', () => {
    const { document: doc, scraper } = loadFixtureWithScraper('path-a-components-list.html');
    const dialog = scraper.findAnalyticsDialog(doc);
    const result = scraper.selectAnalyticsTab(dialog);
    expect(result).toEqual({ ok: true, changed: false });
  });
});

describe('getAnalyticsDuration', () => {
  it('reads duration from the Duration combobox', () => {
    const { document: doc, scraper } = loadFixtureWithScraper('path-a-components-list.html');
    const dialog = scraper.findAnalyticsDialog(doc);
    expect(scraper.getAnalyticsDuration(dialog)).toBe('30');
    const state = scraper.classifyAnalyticsState(dialog);
    expect(state.duration).toBe('30');
  });
});

describe('setAnalyticsDuration', () => {
  function wireDurationCombobox(doc, scraper) {
    const dialog = scraper.findAnalyticsDialog(doc);
    const combo = [...dialog.querySelectorAll('[role="combobox"]')].find((c) =>
      /^duration$/i.test(c.getAttribute('aria-label') || '')
    );
    if (!combo) return;

    let listbox = dialog.querySelector('[role="listbox"][data-analytics-duration-menu]');
    if (!listbox) {
      listbox = doc.createElement('div');
      listbox.setAttribute('role', 'listbox');
      listbox.setAttribute('data-analytics-duration-menu', 'true');
      listbox.hidden = true;
      for (const label of ['30 days', '60 days', '90 days', 'Year']) {
        const option = doc.createElement('div');
        option.setAttribute('role', 'option');
        option.textContent = label;
        option.addEventListener('click', () => {
          combo.textContent = label;
          listbox.hidden = true;
          combo.setAttribute('aria-expanded', 'false');
        });
        listbox.appendChild(option);
      }
      dialog.appendChild(listbox);
    }

    combo.addEventListener('click', () => {
      listbox.hidden = !listbox.hidden;
      combo.setAttribute('aria-expanded', listbox.hidden ? 'false' : 'true');
    });
  }

  it('selects 60 days by menu index when the label text is garbled', () => {
    const { document: doc, scraper } = loadFixtureWithScraper('path-a-components-list.html');
    wireDurationCombobox(doc, scraper);
    const dialog = scraper.findAnalyticsDialog(doc);
    const listbox = dialog.querySelector('[role="listbox"][data-analytics-duration-menu]');
    const options = [...listbox.querySelectorAll('[role="option"]')];
    options[1].textContent = 'Sixty';

    const result = scraper.setAnalyticsDuration(dialog, '60');
    expect(result).toEqual({ ok: true, duration: '60', changed: true });
    expect(scraper.getAnalyticsDuration(dialog)).toBe('60');
  });

  it('clicks Year when 30 days is selected', () => {
    const { document: doc, scraper } = loadFixtureWithScraper('path-a-components-list.html');
    wireDurationCombobox(doc, scraper);
    const dialog = scraper.findAnalyticsDialog(doc);

    expect(scraper.getAnalyticsDuration(dialog)).toBe('30');
    const result = scraper.setAnalyticsDuration(dialog, 'year');
    expect(result).toEqual({ ok: true, duration: 'year', changed: true });
    expect(scraper.getAnalyticsDuration(dialog)).toBe('year');
  });

  it('returns unchanged when already on the requested duration', () => {
    const { document: doc, scraper } = loadFixtureWithScraper('path-a-components-list.html');
    wireDurationCombobox(doc, scraper);
    const dialog = scraper.findAnalyticsDialog(doc);
    const result = scraper.setAnalyticsDuration(dialog, '30');
    expect(result).toEqual({ ok: true, duration: '30', changed: false });
  });

  it('reads duration when the combobox label includes extra words', () => {
    const { document: doc, scraper } = loadFixtureWithScraper('path-a-components-list.html');
    const dialog = scraper.findAnalyticsDialog(doc);
    const combo = [...dialog.querySelectorAll('[role="combobox"]')].find((c) =>
      /^duration$/i.test(c.getAttribute('aria-label') || '')
    );
    combo.textContent = 'Past 60 days';
    expect(scraper.getAnalyticsDuration(dialog)).toBe('60');
  });
});

describe('setTypeKind', () => {
  function wireTypeCombobox(doc, scraper) {
    const dialog = scraper.findAnalyticsDialog(doc);
    const combo = [...dialog.querySelectorAll('[role="combobox"]')].find((c) =>
      /^type$/i.test(c.getAttribute('aria-label') || '')
    );
    if (!combo) return;

    let listbox = dialog.querySelector('[role="listbox"][data-analytics-type-menu]');
    if (!listbox) {
      listbox = doc.createElement('div');
      listbox.setAttribute('role', 'listbox');
      listbox.setAttribute('data-analytics-type-menu', 'true');
      listbox.hidden = true;
      for (const label of ['Components', 'Styles', 'Variables']) {
        const option = doc.createElement('div');
        option.setAttribute('role', 'option');
        option.textContent = label;
        option.addEventListener('click', () => {
          combo.textContent = label;
          listbox.hidden = true;
          combo.setAttribute('aria-expanded', 'false');
          const footer = dialog.querySelector('footer');
          if (footer) {
            const plural = label.toLowerCase();
            footer.textContent = footer.textContent.replace(
              /library (components|styles|variables) shown/i,
              `library ${plural} shown`
            );
          }
          const statsHeader = dialog.querySelector('h3');
          if (statsHeader) {
            if (/components/i.test(label)) statsHeader.textContent = 'Component statistics';
            if (/styles/i.test(label)) statsHeader.textContent = 'Style statistics';
            if (/variables/i.test(label)) statsHeader.textContent = 'Usage statistics';
          }
        });
        listbox.appendChild(option);
      }
      dialog.appendChild(listbox);
    }

    combo.addEventListener('click', () => {
      listbox.hidden = !listbox.hidden;
      combo.setAttribute('aria-expanded', listbox.hidden ? 'false' : 'true');
    });
  }

  it('selects Styles by menu index when the label text is garbled', () => {
    const { document: doc, scraper } = loadFixtureWithScraper('path-a-components-list.html');
    wireTypeCombobox(doc, scraper);
    const dialog = scraper.findAnalyticsDialog(doc);
    const listbox = dialog.querySelector('[role="listbox"][data-analytics-type-menu]');
    const options = [...listbox.querySelectorAll('[role="option"]')];
    options[1].textContent = 'Style tokens';

    const result = scraper.setTypeKind(dialog, 'styles');
    expect(result).toEqual({ ok: true, kind: 'styles', changed: true });
    expect(scraper.getTypeKind(dialog)).toBe('styles');
  });

  it('selects Styles when hidden spacer options are interleaved', () => {
    const { document: doc, scraper } = loadFixtureWithScraper('path-a-components-list.html');
    wireTypeCombobox(doc, scraper);
    const dialog = scraper.findAnalyticsDialog(doc);
    const listbox = dialog.querySelector('[role="listbox"][data-analytics-type-menu]');
    for (const option of [...listbox.querySelectorAll('[role="option"]')]) {
      const spacer = doc.createElement('div');
      spacer.setAttribute('role', 'option');
      spacer.setAttribute('aria-hidden', 'true');
      listbox.insertBefore(spacer, option);
    }

    const result = scraper.setTypeKind(dialog, 'styles');
    expect(result).toEqual({ ok: true, kind: 'styles', changed: true });
    expect(scraper.getTypeKind(dialog)).toBe('styles');
  });

  it('clicks Styles when Components is selected', () => {
    const { document: doc, scraper } = loadFixtureWithScraper('path-a-components-list.html');
    wireTypeCombobox(doc, scraper);
    const dialog = scraper.findAnalyticsDialog(doc);

    expect(scraper.getTypeKind(dialog)).toBe('components');
    const result = scraper.setTypeKind(dialog, 'styles');
    expect(result).toEqual({ ok: true, kind: 'styles', changed: true });
    expect(scraper.getTypeKind(dialog)).toBe('styles');
  });

  it('returns unchanged when already on the requested type', () => {
    const { document: doc, scraper } = loadFixtureWithScraper('path-a-styles-list.html');
    wireTypeCombobox(doc, scraper);
    const dialog = scraper.findAnalyticsDialog(doc);
    const result = scraper.setTypeKind(dialog, 'styles');
    expect(result).toEqual({ ok: true, kind: 'styles', changed: false });
  });

  it('clicks Style when Figma uses the singular menu label', () => {
    const { document: doc, scraper } = loadFixtureWithScraper('path-a-components-list.html');
    wireTypeCombobox(doc, scraper);
    const dialog = scraper.findAnalyticsDialog(doc);
    const listbox = dialog.querySelector('[role="listbox"][data-analytics-type-menu]');
    const styleOption = [...listbox.querySelectorAll('[role="option"]')].find((el) =>
      /styles?/i.test(el.textContent || '')
    );
    styleOption.textContent = 'Style';

    const result = scraper.setTypeKind(dialog, 'styles');
    expect(result).toEqual({ ok: true, kind: 'styles', changed: true });
    expect(scraper.getTypeKind(dialog)).toBe('styles');
  });

  it('matches menu options when a checkmark line precedes the label', () => {
    const { document: doc, scraper } = loadFixtureWithScraper('path-a-components-list.html');
    wireTypeCombobox(doc, scraper);
    const dialog = scraper.findAnalyticsDialog(doc);
    const listbox = dialog.querySelector('[role="listbox"][data-analytics-type-menu]');
    const styleOption = [...listbox.querySelectorAll('[role="option"]')].find((el) =>
      /styles?/i.test(el.textContent || '')
    );
    styleOption.textContent = '✓\nStyles';

    const result = scraper.setTypeKind(dialog, 'styles');
    expect(result).toEqual({ ok: true, kind: 'styles', changed: true });
    expect(scraper.getTypeKind(dialog)).toBe('styles');
  });

  it('does not treat analytics toolbar comboboxes as type menu options', () => {
    const { document: doc, scraper } = loadFixtureWithScraper('path-a-components-list.html');
    const dialog = scraper.findAnalyticsDialog(doc);
    const toolbar = doc.createElement('div');
    toolbar.setAttribute('class', 'analytics--menu--toolbar');
    toolbar.setAttribute('role', 'listbox');
    for (const [label, aria] of [
      ['Components', 'Type'],
      ['30 days', 'Duration'],
      ['None', 'Compare with'],
    ]) {
      const combo = doc.createElement('div');
      combo.setAttribute('role', 'combobox');
      combo.setAttribute('aria-label', aria);
      combo.textContent = label;
      toolbar.appendChild(combo);
    }
    dialog.insertBefore(toolbar, dialog.firstChild);

    const result = scraper.setTypeKind(dialog, 'styles');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Styles/);
    expect(result.visibleOptions || []).not.toContain('30 days');
  }, 15000);

  function wireFigmaSelectComboboxes(doc, scraper) {
    const dialog = scraper.findAnalyticsDialog(doc);
    for (const combo of dialog.querySelectorAll('[role="combobox"]')) {
      const controls = combo.getAttribute('aria-controls');
      const listbox = controls ? doc.getElementById(controls) : null;
      if (!listbox) continue;

      combo.addEventListener('click', () => {
        const opening = listbox.hidden;
        listbox.hidden = !opening;
        combo.setAttribute('aria-expanded', opening ? 'true' : 'false');
      });

      for (const option of listbox.querySelectorAll('[role="option"]')) {
        option.addEventListener('click', () => {
          combo.textContent = option.textContent;
          listbox.hidden = true;
          combo.setAttribute('aria-expanded', 'false');

          const footer = dialog.querySelector('footer');
          if (footer && /components|styles|variables/i.test(option.textContent || '')) {
            footer.textContent = footer.textContent.replace(
              /library (components|styles|variables) shown/i,
              `library ${option.textContent.toLowerCase()} shown`
            );
          }
          const statsHeader = dialog.querySelector('h3');
          if (statsHeader) {
            if (/components/i.test(option.textContent || '')) statsHeader.textContent = 'Component statistics';
            if (/styles/i.test(option.textContent || '')) statsHeader.textContent = 'Style statistics';
            if (/variables/i.test(option.textContent || '')) statsHeader.textContent = 'Usage statistics';
          }
        });
      }
    }
  }

  it('selects Styles when nested role=option nodes are duplicated', () => {
    const { document: doc, scraper } = loadFixtureWithScraper('path-a-figma-select-primitive.html');
    wireFigmaSelectComboboxes(doc, scraper);
    const dialog = scraper.findAnalyticsDialog(doc);
    const listbox = doc.getElementById(':r8d:');
    for (const li of [...listbox.querySelectorAll('li[role="option"]')]) {
      const inner = li.querySelector('div');
      if (!inner) continue;
      inner.setAttribute('role', 'option');
    }

    const result = scraper.setTypeKind(dialog, 'styles');
    expect(result).toEqual({ ok: true, kind: 'styles', changed: true });
    expect(scraper.getTypeKind(dialog)).toBe('styles');
  });

  it('clicks Styles in Figma select-primitive comboboxes with colon ids', () => {
    const { document: doc, scraper } = loadFixtureWithScraper('path-a-figma-select-primitive.html');
    wireFigmaSelectComboboxes(doc, scraper);
    const dialog = scraper.findAnalyticsDialog(doc);

    expect(scraper.getTypeKind(dialog)).toBe('components');
    const result = scraper.setTypeKind(dialog, 'styles');
    expect(result).toEqual({ ok: true, kind: 'styles', changed: true });
    expect(scraper.getTypeKind(dialog)).toBe('styles');
  });

  it('clicks 60 days and Year in Figma select-primitive comboboxes', () => {
    const { document: doc, scraper } = loadFixtureWithScraper('path-a-figma-select-primitive.html');
    wireFigmaSelectComboboxes(doc, scraper);
    const dialog = scraper.findAnalyticsDialog(doc);

    expect(scraper.getAnalyticsDuration(dialog)).toBe('30');

    const sixty = scraper.setAnalyticsDuration(dialog, '60');
    expect(sixty).toEqual({ ok: true, duration: '60', changed: true });
    expect(scraper.getAnalyticsDuration(dialog)).toBe('60');

    const year = scraper.setAnalyticsDuration(dialog, 'year');
    expect(year).toEqual({ ok: true, duration: 'year', changed: true });
    expect(scraper.getAnalyticsDuration(dialog)).toBe('year');
  }, 15000);
});

describe('setVariablesSubTab', () => {
  function wireSubTabClicks(dialog, scraper) {
    const tabs = [...dialog.querySelectorAll('[role="tab"]')].filter((t) =>
      /^(variables|modes)$/i.test(scraper.tabLabel(t))
    );
    for (const tab of tabs) {
      tab.addEventListener('click', () => {
        for (const t of tabs) {
          t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
        }
      });
    }
  }

  it('clicks Modes when Variables is selected', () => {
    const { document: doc, scraper } = loadFixtureWithScraper('path-a-variables-list.html');
    const dialog = scraper.findAnalyticsDialog(doc);
    wireSubTabClicks(dialog, scraper);

    expect(scraper.getVariablesSubTab(dialog)).toBe('variables');
    const result = scraper.setVariablesSubTab(dialog, 'modes');
    expect(result).toEqual({ ok: true, subTab: 'modes', changed: true });
    expect(scraper.getVariablesSubTab(dialog)).toBe('modes');
  });

  it('returns unchanged when already on the requested tab', () => {
    const { document: doc, scraper } = loadFixtureWithScraper('path-a-variables-modes-list.html');
    const dialog = scraper.findAnalyticsDialog(doc);
    const result = scraper.setVariablesSubTab(dialog, 'modes');
    expect(result).toEqual({ ok: true, subTab: 'modes', changed: false });
  });
});

describe('scrapeFileUsageDetailFromPage', () => {
  it('extracts style file usage from detail fixture', async () => {
    const { document: doc, scraper } = loadFixtureWithScraper('path-a-styles-detail.html');
    const dialog = scraper.findAnalyticsDialog(doc);
    const result = await scraper.scrapeFileUsageDetailFromPage(dialog, 'styles');
    expect(result.error).toBeUndefined();
    expect(result.itemName).toBe('body/small-regular');
    expect(result.totalInstances).toBe('12k');
    expect(result.files.some((f) => f.name === FILES.publicWebsite)).toBe(true);
  });

  it('extracts variable file usage from detail fixture', async () => {
    const { document: doc, scraper } = loadFixtureWithScraper('path-a-variables-detail.html');
    const dialog = scraper.findAnalyticsDialog(doc);
    const result = await scraper.scrapeFileUsageDetailFromPage(dialog, 'variables');
    expect(result.error).toBeUndefined();
    expect(result.itemName).toBe(VARIABLE_DETAIL);
    expect(result.totalInstances).toBe('819k');
    expect(result.files.some((f) => f.name.includes('Reports'))).toBe(true);
    const reports = result.files.find((f) => f.name.includes('Reports'));
    expect(reports?.team).toBe(TEAMS.growth);
    expect(reports?.instances).toBe('37,104');
    expect(reports?.lastModified).toBe('11 days ago');
    const checkout = result.files.find((f) => f.name === FILES.checkoutExperience);
    expect(checkout?.lastModified).toBe('1 month ago');
  });

  it('extracts single-component file usage when a component has no variants', async () => {
    const { document: doc, scraper } = loadFixtureWithScraper('path-a-component-no-variants.html');
    const dialog = scraper.findAnalyticsDialog(doc);
    const result = await scraper.scrapeFileUsageDetailFromPage(dialog, 'components');
    expect(result.error).toBeUndefined();
    expect(result.itemName).toBe(SINGLE_COMPONENT);
    expect(result.itemKind).toBe('component');
    expect(result.files.map((f) => f.name)).toEqual([
      FILES.coreDesignSystem,
      FILES.productDashboard,
      FILES.internalPrototype,
    ]);
    expect(result.files[0]).toMatchObject({
      name: FILES.coreDesignSystem,
      team: TEAMS.internalTools,
      instances: '849',
      lastModified: '6 months ago',
    });
  });

  it('preserves pipe characters in file names', async () => {
    const { document: doc, scraper } = loadFixtureWithScraper('path-a-variables-detail.html');
    const dialog = scraper.findAnalyticsDialog(doc);
    const result = await scraper.scrapeFileUsageDetailFromPage(dialog, 'variables');
    const reports = result.files.find((f) => f.name.includes('Reports'));
    expect(reports?.name).toBe(FILES.reportsPipeDelimited);
  });
});

describe('normalizeLineTerminators', () => {
  it('replaces Unicode LS and PS with newlines', () => {
    const ls = '\u2028';
    const ps = '\u2029';
    expect(scraperUtils.normalizeLineTerminators(`foo${ls}bar${ps}baz`)).toBe('foo\nbar\nbaz');
    expect(scraperUtils.normalizeLineTerminators('plain')).toBe('plain');
  });
});

describe('sanitizeFilename', () => {
  it('produces distinct names for slash vs hyphen collisions', () => {
    const a = scraperUtils.sanitizeFilename('Foo/Bar');
    const b = scraperUtils.sanitizeFilename('Foo-Bar');
    expect(a).not.toBe(b);
    expect(a).toMatch(/-[a-z0-9]{1,6}$/);
    expect(b).toMatch(/-[a-z0-9]{1,6}$/);
  });
});

describe('isIconOnlyLine', () => {
  it('filters icon-only lines but keeps names containing icons', () => {
    expect(scraperUtils.isIconOnlyLine('❖')).toBe(true);
    expect(scraperUtils.isIconOnlyLine('✦')).toBe(true);
    expect(scraperUtils.isIconOnlyLine('❖ Primary')).toBe(false);
    expect(scraperUtils.isIconOnlyLine('Icon / Filter')).toBe(false);
  });
});

describe('special character names', () => {
  it('preserves special chars in component name export', () => {
    const { document: doc, scraper } = loadFixtureWithScraper('special-chars-names.html');
    const dialog = scraper.findAnalyticsDialog(doc);
    const result = scraper.scrapeLibraryAnalyticsFromPage(dialog);
    expect(result.componentName).toBe('Icon / Filter (Special)');
    expect(result.variants.map((v) => v.name)).toEqual(
      expect.arrayContaining(['Foo/Bar variant', 'Foo-Bar variant'])
    );
    const iconOnly = result.variants.find((v) => scraperUtils.isIconOnlyLine(v.name));
    expect(iconOnly).toBeUndefined();
  });
});

describe('extractComponentSetName', () => {
  it('reads stale header name when viewing a variant', () => {
    const { document: doc, scraper } = loadFixtureWithScraper('path-a-components-variant-file-usage.html');
    const dialog = scraper.findAnalyticsDialog(doc);
    expect(scraper.extractComponentSetName(dialog, VARIANT_SELECTED)).toBe(COMPONENT_SET);
  });
});

describe('probeAnalyticsDataReadiness', () => {
  it('reports ready for populated component list fixture', () => {
    const { document: doc, scraper } = loadFixtureWithScraper('path-a-components-list.html');
    const dialog = scraper.findAnalyticsDialog(doc);
    const state = scraper.classifyAnalyticsState(dialog);
    const readiness = scraper.probeAnalyticsDataReadiness(dialog, state);

    expect(readiness.status).toBe('ready');
    expect(readiness.expectedCount).toBe(603);
    expect(readiness.visibleCount).toBeGreaterThan(0);
  });

  it('reports loading when list footer count is missing', () => {
    const { document: doc, scraper } = loadFixtureWithScraper('path-a-components-list.html');
    const dialog = scraper.findAnalyticsDialog(doc);
    dialog.querySelector('footer')?.remove();
    const state = scraper.classifyAnalyticsState(dialog);
    const readiness = scraper.probeAnalyticsDataReadiness(dialog, state);

    expect(readiness.status).toBe('loading');
    expect(readiness.reason).toBe('waiting-for-count');
  });

  it('reports loading when list rows are not rendered yet', () => {
    const { document: doc, scraper } = loadFixtureWithScraper('path-a-components-list.html');
    const dialog = scraper.findAnalyticsDialog(doc);
    dialog.querySelectorAll('[role="row"]').forEach((row) => row.remove());
    const state = scraper.classifyAnalyticsState(dialog);
    const readiness = scraper.probeAnalyticsDataReadiness(dialog, state);

    expect(readiness.status).toBe('loading');
    expect(readiness.reason).toBe('waiting-for-rows');
    expect(readiness.expectedCount).toBe(603);
  });

  it('attaches dataReadiness via getAnalyticsState', () => {
    const { document: doc, scraper } = loadFixtureWithScraper('path-a-components-list.html');
    const dialog = scraper.findAnalyticsDialog(doc);
    const state = scraper.getAnalyticsState(dialog);

    expect(state.dataReadiness?.status).toBe('ready');
    expect(state.itemCount).toBe(603);
  });

  it('classifies component file usage when a stale list footer remains in the DOM', () => {
    const { document: doc, scraper } = loadFixtureWithScraper(
      'path-a-component-file-usage-stale-list-footer.html'
    );
    const dialog = scraper.findAnalyticsDialog(doc);
    const state = scraper.classifyAnalyticsState(dialog);

    expect(state.kind).toBe('components');
    expect(state.depth).toBe('component');
    expect(state.itemName).toBe('Icon/Overflow');
    expect(state.libraryName).toBe('Foundation • Web');
    expect(state.fileCount).toBe(983);
    expect(state.itemCount).toBeUndefined();
  });

  it('classifies component drill-down when a visible list analytics panel remains', () => {
    const cases = [
      {
        fixture: 'path-a-component-detail-stale-list-panel.html',
        depth: 'component',
        itemName: 'Icon/CircleCross',
        usedIn: '219',
      },
      {
        fixture: 'path-a-component-set-stale-list-panel.html',
        depth: 'detail',
        itemName: 'Cell (Advanced Table)',
      },
      {
        fixture: 'path-a-component-variant-stale-list-panel.html',
        depth: 'variant',
        itemName: 'default, isSelected=false',
        componentSetName: 'Cell (Advanced Table)',
        usedIn: '250',
      },
    ];

    for (const testCase of cases) {
      const { document: doc, scraper } = loadFixtureWithScraper(testCase.fixture);
      const dialog = scraper.findAnalyticsDialog(doc);
      const state = scraper.classifyAnalyticsState(dialog);

      expect(state.kind).toBe('components');
      expect(state.depth).toBe(testCase.depth);
      expect(state.itemName).toBe(testCase.itemName);
      expect(state.itemCount).toBeUndefined();
      if (testCase.componentSetName) {
        expect(state.componentSetName).toBe(testCase.componentSetName);
      }
      if (testCase.usedIn) {
        expect(state.usedIn).toBe(testCase.usedIn);
      }
    }
  });

  it('marks component sets with short variant names as ready', () => {
    const { document: doc, scraper } = loadFixtureWithScraper(
      'path-a-component-set-short-variant-names.html'
    );
    const dialog = scraper.findAnalyticsDialog(doc);
    const state = scraper.getAnalyticsState(dialog);

    expect(state.depth).toBe('detail');
    expect(state.itemName).toBe('helper-Form-medium-default');
    expect(state.variantCount).toBe(5);
    expect(state.dataReadiness?.status).toBe('ready');
  });

  it('classifies component-set variant file usage when the variant name is short', () => {
    const { document: doc, scraper } = loadFixtureWithScraper(
      'path-a-component-set-variant-file-usage.html'
    );
    const dialog = scraper.findAnalyticsDialog(doc);
    const state = scraper.getAnalyticsState(dialog);

    expect(state.depth).toBe('variant');
    expect(state.itemName).toBe('avatar');
    expect(state.componentSetName).toBe('helper-Form-medium-default');
    expect(state.dataReadiness?.status).toBe('ready');
  });

  it('does not treat the active component name as the library name', () => {
    const { document: doc, scraper } = loadFixtureWithScraper('path-a-component-no-variants.html');
    const dialog = scraper.findAnalyticsDialog(doc);
    expect(scraper.getLibraryName(dialog)).toBe('Foundation • Web');
  });
});
