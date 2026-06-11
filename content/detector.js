/**
 * Gated analytics modal detector — injected only while the side panel is open.
 */
(function () {
  'use strict';

  if (window.__figmaAnalyticsDetectorLoaded) return;
  window.__figmaAnalyticsDetectorLoaded = true;

  const Scraper = window.FigmaAnalyticsScraper;
  const ExportFormat = window.ExportFormat;
  if (!Scraper) {
    console.error('[FigmaAnalyticsExport] scraper.js must be injected before detector.js');
    return;
  }
  if (!ExportFormat) {
    console.error('[FigmaAnalyticsExport] shared/export-format.js must be injected before detector.js');
    return;
  }

  const DEBOUNCE_MS = 100;
  const POLL_MS = 1000;
  const INLINE_BTN_CLASS = 'figma-analytics-export-inline';
  const LOG_PREFIX = '[FigmaAnalyticsExport]';

  let bodyObserver = null;
  let dialogObserver = null;
  let port = null;
  let debounceTimer = null;
  let pollTimer = null;
  let lastStateKey = '';
  let activeDialog = null;
  let clickHandler = null;

  function stateKey(state) {
    return JSON.stringify({
      modalOpen: state.modalOpen,
      kind: state.kind,
      depth: state.depth,
      libraryName: state.libraryName,
      itemName: state.itemName,
      componentSetName: state.componentSetName,
      usedIn: state.usedIn,
      usedBy: state.usedBy,
      itemCount: state.itemCount,
      variantCount: state.variantCount,
      variablesSubTab: state.variablesSubTab,
      duration: state.duration,
      analyticsTabSelected: state.analyticsTabSelected,
      dataReadiness: state.dataReadiness,
    });
  }

  function kindFromOptionLabel(val) {
    const lower = (val || '').trim().toLowerCase();
    if (lower.includes('style')) return 'styles';
    if (lower.includes('variable')) return 'variables';
    if (lower.includes('component')) return 'components';
    return null;
  }

  function clickTargetLabel(el) {
    return (el?.innerText ?? el?.textContent ?? el?.getAttribute('aria-label') ?? '').trim();
  }

  function inferNavigationIntent(target) {
    if (!target) return null;

    const option = target.closest('[role="option"], [role="menuitem"], [role="menuitemradio"]');
    if (option) {
      const kind = kindFromOptionLabel(clickTargetLabel(option));
      if (kind) return { pendingKind: kind, pendingDepth: 'list' };
    }

    const tab = target.closest('[role="tab"]');
    if (tab && activeDialog?.contains(tab)) {
      const label = Scraper.tabLabel(tab);
      if (/^variables$/i.test(label)) {
        return {
          pendingKind: 'variables',
          pendingDepth: 'list',
          pendingVariablesSubTab: 'variables',
        };
      }
      if (/^modes$/i.test(label)) {
        return {
          pendingKind: 'variables',
          pendingDepth: 'list',
          pendingVariablesSubTab: 'modes',
        };
      }
    }

    const button = target.closest('button, [role="button"]');
    if (button && activeDialog?.contains(button)) {
      const label = clickTargetLabel(button);
      if (/^back$/i.test(label)) {
        return { pendingDepth: 'list' };
      }
    }

    return null;
  }

  function emitViewTransition(intent) {
    try {
      chrome.runtime.sendMessage({
        type: 'ANALYTICS_VIEW_TRANSITION',
        intent: intent || undefined,
      });
    } catch (_) {
      /* extension context invalidated */
    }
  }

  function emitState(state) {
    const key = stateKey(state);
    if (key === lastStateKey) return;
    lastStateKey = key;

    if (location.search.includes('selftest=1')) {
      console.log(LOG_PREFIX, 'state', state);
    }

    try {
      chrome.runtime.sendMessage({ type: 'ANALYTICS_STATE_CHANGED', state });
    } catch (_) {
      /* extension context invalidated */
    }

    updateInlineButtons(state);
  }

  function classifyCurrent() {
    const dialog = Scraper.findAnalyticsDialog();
    if (!dialog) {
      return {
        modalOpen: false,
        kind: 'unknown',
        depth: 'unknown',
        analyticsTabSelected: false,
        dataReadiness: { status: 'unknown' },
      };
    }
    return Scraper.getAnalyticsState(dialog);
  }

  function syncDialogObserver() {
    const dialog = Scraper.findAnalyticsDialog();
    if (dialog !== activeDialog) {
      teardownDialogObserver();
      if (dialog) setupDialogObserver(dialog);
    }
    return dialog;
  }

  function classifyAndEmitNow() {
    syncDialogObserver();
    emitState(classifyCurrent());
  }

  function debouncedClassify() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(classifyAndEmitNow, DEBOUNCE_MS);
  }

  function isLikelyViewNavigationClick(target) {
    if (!target || !activeDialog?.contains(target)) return false;
    if (target.closest(`.${INLINE_BTN_CLASS}`)) return false;

    if (target.closest('[role="tab"], [role="combobox"], [role="row"], a')) return true;

    const button = target.closest('button, [role="button"]');
    if (!button) return false;

    const label = (
      button.innerText ||
      button.getAttribute('aria-label') ||
      button.textContent ||
      ''
    ).trim();
    if (/^back$/i.test(label)) return true;
    if (/view (component|style|variable)/i.test(label)) return true;

    return false;
  }

  function handleDialogClick(e) {
    if (isLikelyViewNavigationClick(e.target)) {
      emitViewTransition(inferNavigationIntent(e.target));
      classifyAndEmitNow();
      setTimeout(classifyAndEmitNow, 100);
      setTimeout(classifyAndEmitNow, 350);
      return;
    }

    debouncedClassify();
    if (e.target.closest('[role="tab"]')) {
      emitViewTransition(inferNavigationIntent(e.target));
      setTimeout(classifyAndEmitNow, 100);
      setTimeout(classifyAndEmitNow, 350);
    }
  }

  function pollClassify() {
    if (!window.__figmaAnalyticsDetectorActive) return;
    syncDialogObserver();
    emitState(classifyCurrent());
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(pollClassify, POLL_MS);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function setupDialogObserver(dialog) {
    activeDialog = dialog;
    // Tab switches often only flip aria-selected — attributes: true is required
    dialogObserver = new MutationObserver(debouncedClassify);
    dialogObserver.observe(dialog, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['aria-selected', 'aria-hidden', 'class', 'data-selected'],
    });

    clickHandler = (e) => handleDialogClick(e);
    dialog.addEventListener('click', clickHandler, true);
  }

  function teardownDialogObserver() {
    if (dialogObserver) {
      dialogObserver.disconnect();
      dialogObserver = null;
    }
    if (activeDialog && clickHandler) {
      activeDialog.removeEventListener('click', clickHandler, true);
    }
    activeDialog = null;
    clickHandler = null;
    removeInlineButtons();
  }

  function removeInlineButtons() {
    document.querySelectorAll(`.${INLINE_BTN_CLASS}`).forEach((el) => el.remove());
  }

  function findInlineAnchor(dialog) {
    const statsHeader = [...dialog.querySelectorAll('h3, h4, [class*="libraryAnalyticsHeader"]')].find((el) =>
      /Component statistics|Style statistics|Usage statistics/i.test(el.innerText || '')
    );
    if (statsHeader?.parentElement) return statsHeader.parentElement;

    const typeCombo = [...dialog.querySelectorAll('[role="combobox"]')].find((c) =>
      /^type$/i.test(c.getAttribute('aria-label') || '')
    );
    if (typeCombo?.parentElement) return typeCombo.parentElement;

    return dialog.querySelector('[class*="dsa_file_view_analytics"]') || dialog;
  }

  function createInlineButton(label, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = INLINE_BTN_CLASS;
    btn.textContent = label;
    btn.style.cssText =
      'margin:4px 6px 4px 0;padding:6px 10px;font-size:12px;font-weight:600;border-radius:var(--radius-medium,.3125rem);border:1px solid var(--color-border,#e6e6e6);background:var(--color-bg,#FFF);color:#0d99ff;cursor:pointer;font-family:Inter,system-ui,sans-serif;';
    btn.addEventListener('mouseenter', () => {
      btn.style.background = '#e8f4ff';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'var(--color-bg, #FFF)';
    });
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
    return btn;
  }

  function downloadInPage(content, filename, mimeType) {
    const normalized =
      typeof content === 'string' ? content.replace(/\u2028|\u2029/g, '\n') : content;
    const blob = new Blob([normalized], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function analyzePropertyUsage(variants) {
    const properties = {};
    let totalInstances = 0;
    for (const variant of variants) {
      const count = parseInt(variant.totalInstances?.replace(/,/g, '') || '0', 10);
      totalInstances += count;
      const parts = variant.name.split(',').map((p) => p.trim());
      let positionIndex = 1;
      for (const part of parts) {
        let propName, propValue;
        if (part.includes('=')) {
          [propName, propValue] = part.split('=').map((s) => s.trim());
        } else {
          propName = `Property ${positionIndex}`;
          propValue = part.replace(/\s*\(default\)/g, '').trim();
          positionIndex++;
        }
        if (!propName || !propValue) continue;
        if (!properties[propName]) properties[propName] = {};
        properties[propName][propValue] = (properties[propName][propValue] || 0) + count;
      }
    }
    const result = {};
    for (const [propName, values] of Object.entries(properties)) {
      result[propName] = Object.entries(values)
        .map(([value, count]) => ({
          value,
          count,
          percent: totalInstances > 0 ? Math.round((count / totalInstances) * 100).toString() : '0',
        }))
        .sort((a, b) => b.count - a.count);
    }
    return { properties: result, totalInstances };
  }

  function generateVariantCsv(data) {
    const rows = ExportFormat.variantCsvRows(data);
    const analysis = analyzePropertyUsage(data.variants);
    if (Object.keys(analysis.properties).length) {
      rows.push([], ['Property Analysis'], ['Property', 'Value', 'Instances', 'Percentage']);
      for (const [propName, values] of Object.entries(analysis.properties)) {
        for (const v of values) rows.push([propName, v.value, v.count, `${v.percent}%`]);
      }
    }
    return ExportFormat.csvFromRows(rows);
  }

  const generateLibraryCsv = ExportFormat.generateLibraryCsv;
  const generateLibraryMd = ExportFormat.generateLibraryMarkdown;
  const generateStyleListCsv = ExportFormat.generateStyleListCsv;
  const generateStyleListMd = ExportFormat.generateStyleListMarkdown;
  const generateVariableListCsv = ExportFormat.generateVariableListCsv;
  const generateVariableListMd = ExportFormat.generateVariableListMarkdown;
  const generateModeListCsv = ExportFormat.generateModeListCsv;
  const generateModeListMd = ExportFormat.generateModeListMarkdown;
  const generateFileUsageCsv = ExportFormat.generateFileUsageCsv;
  const generateFileUsageMd = ExportFormat.generateFileUsageMarkdown;
  const generateVariantMd = ExportFormat.generateVariantMarkdown;
  const fileUsageExportSlug = ExportFormat.fileUsageExportSlug;

  async function inlineExportList(format) {
    const dialog = Scraper.findAnalyticsDialog();
    const result = await Scraper.scrapeComponentListFromPage(dialog);
    if (result.error) {
      alert(result.error);
      return;
    }
    const timestamp = new Date().toISOString().split('T')[0];
    const payload = {
      libraryName: result.libraryName || 'Library Analytics',
      viewType: 'All Components',
      componentCount: result.components.length,
      components: result.components,
      scrapedAt: new Date().toISOString(),
    };
    const base = `library-analytics-${timestamp}`;
    if (format === 'csv') downloadInPage(generateLibraryCsv(payload), `${base}.csv`, 'text/csv;charset=utf-8;');
    else if (format === 'json') downloadInPage(JSON.stringify(payload, null, 2), `${base}.json`, 'application/json');
    else if (format === 'md') downloadInPage(generateLibraryMd(payload), `${base}.md`, 'text/markdown');
  }

  async function inlineExportStyleList(format) {
    const dialog = Scraper.findAnalyticsDialog();
    const result = await Scraper.scrapeStyleListFromPage(dialog);
    if (result.error) {
      alert(result.error);
      return;
    }
    const timestamp = new Date().toISOString().split('T')[0];
    const payload = {
      libraryName: result.libraryName || 'Library Analytics',
      viewType: 'All Styles',
      styleCount: result.styles.length,
      styles: result.styles,
      scrapedAt: new Date().toISOString(),
    };
    const base = `library-styles-${timestamp}`;
    if (format === 'csv') downloadInPage(generateStyleListCsv(payload), `${base}.csv`, 'text/csv;charset=utf-8;');
    else if (format === 'json') downloadInPage(JSON.stringify(payload, null, 2), `${base}.json`, 'application/json');
    else if (format === 'md') downloadInPage(generateStyleListMd(payload), `${base}.md`, 'text/markdown');
  }

  async function inlineExportVariableList(format) {
    const dialog = Scraper.findAnalyticsDialog();
    const result = await Scraper.scrapeVariableListFromPage(dialog);
    if (result.error) {
      alert(result.error);
      return;
    }
    const timestamp = new Date().toISOString().split('T')[0];
    const isModes = result.variablesSubTab === 'modes';
    const payload = {
      libraryName: result.libraryName || 'Library Analytics',
      viewType: isModes ? 'All Modes' : 'All Variables',
      variablesSubTab: result.variablesSubTab || 'variables',
      entryCount: result.entryCount,
      variables: result.variables,
      modes: result.modes,
      scrapedAt: new Date().toISOString(),
    };
    const base = isModes ? `library-modes-${timestamp}` : `library-variables-${timestamp}`;
    if (format === 'csv') {
      downloadInPage(
        isModes ? generateModeListCsv(payload) : generateVariableListCsv(payload),
        `${base}.csv`,
        'text/csv;charset=utf-8;'
      );
    } else if (format === 'json') {
      downloadInPage(JSON.stringify(payload, null, 2), `${base}.json`, 'application/json');
    } else if (format === 'md') {
      downloadInPage(
        isModes ? generateModeListMd(payload) : generateVariableListMd(payload),
        `${base}.md`,
        'text/markdown'
      );
    }
  }

  async function inlineExportFileUsage(format, kind) {
    const dialog = Scraper.findAnalyticsDialog();
    const result = await Scraper.scrapeFileUsageDetailFromPage(dialog, kind);
    if (result.error) {
      alert(result.error);
      return;
    }
    const timestamp = new Date().toISOString().split('T')[0];
    const safeName = ExportFormat.sanitizeFilename(result.itemName);
    const base = `${safeName}-${fileUsageExportSlug(result.itemKind)}-usage-${timestamp}`;
    if (format === 'csv') downloadInPage(generateFileUsageCsv(result), `${base}.csv`, 'text/csv;charset=utf-8;');
    else if (format === 'json') downloadInPage(JSON.stringify(result, null, 2), `${base}.json`, 'application/json');
    else if (format === 'md') downloadInPage(generateFileUsageMd(result), `${base}.md`, 'text/markdown');
  }

  async function inlineExportDetail(format) {
    const dialog = Scraper.findAnalyticsDialog();
    const result = Scraper.scrapeLibraryAnalyticsFromPage(dialog);
    if (result.error) {
      alert(result.error);
      return;
    }
    result.propertyAnalysis = analyzePropertyUsage(result.variants);
    const timestamp = new Date().toISOString().split('T')[0];
    const safeName = ExportFormat.sanitizeFilename(result.componentName);
    const base = `${safeName}-analytics-${timestamp}`;
    if (format === 'csv') downloadInPage(generateVariantCsv(result), `${base}.csv`, 'text/csv;charset=utf-8;');
    else if (format === 'json') downloadInPage(JSON.stringify(result, null, 2), `${base}.json`, 'application/json');
    else if (format === 'md') downloadInPage(generateVariantMd(result), `${base}.md`, 'text/markdown');
  }

  function formatDataReadyLabel(state) {
    const readiness = state.dataReadiness;
    if (!readiness || readiness.status !== 'ready') return '';

    if (state.depth === 'list') {
      const count = readiness.expectedCount ?? state.itemCount;
      if (count == null) return 'Data ready';
      if (state.kind === 'components') return `${count} components ready`;
      if (state.kind === 'styles') return `${count} styles ready`;
      if (state.kind === 'variables') {
        const noun = state.variablesSubTab === 'modes' ? 'modes' : 'variables';
        return `${count} ${noun} ready`;
      }
    }

    if (state.kind === 'components' && state.depth === 'detail') {
      const count = readiness.expectedCount ?? state.variantCount;
      return count != null ? `${count} variants ready` : 'Variants ready';
    }

    if (readiness.expectedCount != null) {
      return `${readiness.expectedCount} files ready`;
    }

    return 'Data ready';
  }

  function updateDataStatusBadge(bar, state) {
    const readiness = state.dataReadiness;
    let badge = bar.querySelector('.figma-analytics-export-data-status');

    if (!readiness || readiness.status === 'unknown') {
      badge?.remove();
      return;
    }

    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'figma-analytics-export-data-status';
      badge.setAttribute('role', 'status');
      badge.setAttribute('aria-live', 'polite');
      badge.style.cssText =
        'font-size:11px;font-family:Inter,system-ui,sans-serif;margin-left:8px;white-space:nowrap;';
      bar.appendChild(badge);
    }

    if (readiness.status === 'loading') {
      badge.textContent = 'Loading analytics data…';
      badge.style.color = '#888';
      return;
    }

    badge.textContent = formatDataReadyLabel(state) || 'Data ready';
    badge.style.color = '#0d7a53';
  }

  function updateInlineButtons(state) {
    removeInlineButtons();
    if (!state.modalOpen || !state.analyticsTabSelected) return;

    const dialog = Scraper.findAnalyticsDialog();
    if (!dialog) return;

    const anchor = findInlineAnchor(dialog);
    const bar = document.createElement('div');
    bar.className = INLINE_BTN_CLASS;
    bar.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;padding:8px 0;gap:4px;';
    bar.setAttribute('data-kind', state.kind);
    bar.setAttribute('data-depth', state.depth);

    const label = document.createElement('span');
    label.textContent = 'Figma Analytics Export:';
    label.style.cssText = 'font-size:11px;font-weight:600;color:#666;margin-right:4px;font-family:Inter,system-ui,sans-serif;';
    bar.appendChild(label);

    if (state.kind === 'components' && state.depth === 'list') {
      bar.appendChild(createInlineButton('CSV', () => inlineExportList('csv')));
      bar.appendChild(createInlineButton('JSON', () => inlineExportList('json')));
      bar.appendChild(createInlineButton('MD', () => inlineExportList('md')));
    } else if (state.kind === 'components' && state.depth === 'detail') {
      bar.appendChild(createInlineButton('CSV', () => inlineExportDetail('csv')));
      bar.appendChild(createInlineButton('JSON', () => inlineExportDetail('json')));
      bar.appendChild(createInlineButton('MD', () => inlineExportDetail('md')));
    } else if (state.kind === 'styles' && state.depth === 'list') {
      bar.appendChild(createInlineButton('CSV', () => inlineExportStyleList('csv')));
      bar.appendChild(createInlineButton('JSON', () => inlineExportStyleList('json')));
      bar.appendChild(createInlineButton('MD', () => inlineExportStyleList('md')));
    } else if (state.kind === 'styles' && state.depth === 'detail') {
      bar.appendChild(createInlineButton('CSV', () => inlineExportFileUsage('csv', 'styles')));
      bar.appendChild(createInlineButton('JSON', () => inlineExportFileUsage('json', 'styles')));
      bar.appendChild(createInlineButton('MD', () => inlineExportFileUsage('md', 'styles')));
    } else if (state.kind === 'components' && (state.depth === 'variant' || state.depth === 'component')) {
      bar.appendChild(createInlineButton('CSV', () => inlineExportFileUsage('csv', 'components')));
      bar.appendChild(createInlineButton('JSON', () => inlineExportFileUsage('json', 'components')));
      bar.appendChild(createInlineButton('MD', () => inlineExportFileUsage('md', 'components')));
    } else if (state.kind === 'variables' && state.depth === 'list') {
      bar.appendChild(createInlineButton('CSV', () => inlineExportVariableList('csv')));
      bar.appendChild(createInlineButton('JSON', () => inlineExportVariableList('json')));
      bar.appendChild(createInlineButton('MD', () => inlineExportVariableList('md')));
    } else if (state.kind === 'variables' && state.depth === 'detail') {
      bar.appendChild(createInlineButton('CSV', () => inlineExportFileUsage('csv', 'variables')));
      bar.appendChild(createInlineButton('JSON', () => inlineExportFileUsage('json', 'variables')));
      bar.appendChild(createInlineButton('MD', () => inlineExportFileUsage('md', 'variables')));
    } else {
      const hint = document.createElement('span');
      hint.style.cssText = 'font-size:11px;color:#888;font-family:Inter,system-ui,sans-serif;';
      hint.textContent = 'Open a list or detail view to export';
      bar.appendChild(hint);
    }

    anchor.insertAdjacentElement('afterbegin', bar);
    updateDataStatusBadge(bar, state);
  }

  function onBodyMutation(mutations) {
    for (const m of mutations) {
      if (m.addedNodes.length || m.removedNodes.length) {
        debouncedClassify();
        return;
      }
    }
  }

  function activate() {
    if (window.__figmaAnalyticsDetectorActive) return;
    window.__figmaAnalyticsDetectorActive = true;

    bodyObserver = new MutationObserver(onBodyMutation);
    bodyObserver.observe(document.body, { childList: true, subtree: true });

    syncDialogObserver();
    emitState(classifyCurrent());
    startPolling();
  }

  function deactivate() {
    window.__figmaAnalyticsDetectorActive = false;
    clearTimeout(debounceTimer);
    stopPolling();
    if (bodyObserver) {
      bodyObserver.disconnect();
      bodyObserver = null;
    }
    teardownDialogObserver();
    lastStateKey = '';
    removeInlineButtons();
    if (port) {
      try {
        port.disconnect();
      } catch (_) {}
      port = null;
    }
  }

  function clickAnalyticsTabPageContext() {
    const tabLabel = (el) => {
      const raw = (el?.innerText ?? el?.textContent ?? '').trim();
      return (raw.split('\n').map((l) => l.trim()).filter(Boolean)[0] || raw).trim();
    };

    const tablists = [...document.querySelectorAll('[role="tablist"]')].filter((list) => {
      const labels = [...list.querySelectorAll('[role="tab"], button')].map((el) =>
        tabLabel(el).toLowerCase()
      );
      return labels.includes('analytics') && (labels.includes('overview') || labels.includes('libraries'));
    });

    for (const list of tablists) {
      const btn = [...list.querySelectorAll('button[role="tab"], [role="tab"]')].find(
        (el) => tabLabel(el).toLowerCase() === 'analytics'
      );
      if (!btn) continue;

      const marker = `faex-${Date.now().toString(36)}`;
      btn.setAttribute('data-figma-analytics-export-click', marker);
      const script = document.createElement('script');
      script.textContent = `(function(){
        var el = document.querySelector('[data-figma-analytics-export-click="${marker}"]');
        if (!el) return;
        el.removeAttribute('data-figma-analytics-export-click');
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        el.focus({ preventScroll: true });
        el.click();
      })();`;
      try {
        (document.head || document.documentElement).appendChild(script);
        script.remove();
      } catch (_) {
        btn.removeAttribute('data-figma-analytics-export-click');
        return { ok: false, error: 'Could not inject page-context click.' };
      }
      btn.removeAttribute('data-figma-analytics-export-click');
      return { ok: true, changed: true, method: 'page-script' };
    }

    return { ok: false, error: 'Analytics tab button not found.' };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'ACTIVATE_DETECTOR') {
      activate();
      sendResponse({ ok: true });
      return true;
    }
    if (message.type === 'DEACTIVATE_DETECTOR') {
      deactivate();
      sendResponse({ ok: true });
      return true;
    }
    if (message.type === 'GET_ANALYTICS_STATE') {
      sendResponse({ state: classifyCurrent() });
      return true;
    }
    if (message.type === 'SELECT_ANALYTICS_TAB') {
      sendResponse(clickAnalyticsTabPageContext());
      return true;
    }
    return false;
  });

  chrome.runtime.onConnect.addListener((connectedPort) => {
    if (connectedPort.name !== 'figma-analytics-panel') return;
    port = connectedPort;
    activate();
    connectedPort.onDisconnect.addListener(() => {
      deactivate();
    });
  });

  // If panel connected before this script loaded
  if (document.documentElement.dataset.figmaAnalyticsActivate === '1') {
    activate();
  }
})();
