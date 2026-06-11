/**
 * Shared analytics scraper + classifier for page injection and tests.
 * Attaches to globalThis.FigmaAnalyticsScraper when loaded as a classic script.
 */
(function (root) {
  'use strict';

  const ITEM_NAME_SELECTOR = '[class*="asset_file_view_header--name--"]';
  const UI_BLOCKLIST = new Set([
    'filter', 'columns', 'export', 'cancel', 'save', 'done', 'close', 'search',
  ]);

  /** Figma sometimes uses Unicode LS/PS instead of \\n; normalize for parsing and export. */
  function normalizeLineTerminators(text) {
    return String(text).replace(/\u2028|\u2029/g, '\n');
  }

  function elementText(el) {
    if (!el) return '';
    return normalizeLineTerminators(el.innerText ?? el.textContent ?? '').trim();
  }

  /** Figma often duplicates tab labels, e.g. "Analytics\\nAnalytics" (Path C). */
  function tabLabel(tab) {
    const raw = elementText(tab);
    const firstLine = raw.split('\n').map((l) => l.trim()).filter(Boolean)[0];
    return (firstLine || raw).trim();
  }

  /** Figma often duplicates control labels, e.g. "Styles\\nStyles". */
  function comboLabel(combo) {
    return tabLabel(combo);
  }

  function meaningfulLines(text) {
    return String(text || '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !/^[\u2713\u2714✓✔•]$/.test(line));
  }

  function bestLabelLine(text, predicate) {
    const lines = meaningfulLines(text);
    for (const line of lines) {
      if (predicate(line)) return line;
    }
    return lines[0] || String(text || '').trim();
  }

  function hasAnalyticsStatsText(text) {
    return /Component statistics|Component insertions|Style statistics|Style insertions|Usage statistics|library (components|styles|variables) shown|Showing\s+\d+\s+variants/i.test(
      text || ''
    );
  }

  function isElementVisible(el) {
    if (!el || !el.isConnected) return false;

    let node = el;
    while (node && node.nodeType === 1) {
      if (node.getAttribute('aria-hidden') === 'true') return false;
      node = node.parentElement;
    }

    try {
      const win = el.ownerDocument.defaultView;
      const style = win && win.getComputedStyle(el);
      if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;

      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return true;
      // JSDOM returns zero-size rects for visible fixtures — treat as visible unless hidden above
      return !(style && style.display === 'none');
    } catch (_) {
      return true;
    }
  }

  function clickAtElement(el) {
    if (!el?.isConnected) return false;
    const doc = el.ownerDocument;
    const win = doc?.defaultView;
    if (!win) return false;

    el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    pauseMs(30);

    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;

    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const hit = doc.elementFromPoint(x, y);
    let target = el;
    if (hit && hit !== el && (el.contains(hit) || hit.contains(el))) {
      target = hit;
    }

    if (activateClick(target)) return true;
    return simulateClick(target);
  }

  /** Figma/React often ignores a bare .click() from extension scripts — synthesize a full press. */
  function simulateClick(el) {
    if (!el) return false;

    const doc = el.ownerDocument;
    const win = doc?.defaultView;
    if (!win) return false;

    const target =
      el.closest('[role="tab"]') ||
      el.closest('[role="radio"]') ||
      el.querySelector?.('button, [role="button"]') ||
      el;
    target.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    target.focus?.({ preventScroll: true });

    const rect = target.getBoundingClientRect();
    const clientX = rect.left + Math.max(1, rect.width / 2);
    const clientY = rect.top + Math.max(1, rect.height / 2);
    const eventInit = {
      bubbles: true,
      cancelable: true,
      view: win,
      clientX,
      clientY,
      button: 0,
      buttons: 1,
    };

    if (typeof win.PointerEvent === 'function') {
      target.dispatchEvent(new win.PointerEvent('pointerdown', { ...eventInit, pointerId: 1, pointerType: 'mouse' }));
      target.dispatchEvent(new win.PointerEvent('pointerup', { ...eventInit, pointerId: 1, pointerType: 'mouse' }));
    }
    target.dispatchEvent(new win.MouseEvent('mousedown', eventInit));
    target.dispatchEvent(new win.MouseEvent('mouseup', eventInit));
    target.dispatchEvent(new win.MouseEvent('click', eventInit));

    if (typeof win.KeyboardEvent === 'function') {
      target.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      target.dispatchEvent(new win.KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
      if (target.getAttribute('role') === 'radio') {
        target.dispatchEvent(new win.KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }));
        target.dispatchEvent(new win.KeyboardEvent('keyup', { key: ' ', code: 'Space', bubbles: true }));
      }
    }

    return true;
  }

  /** Prefer native .click() when running in page context; fall back to synthetic events. */
  function activateClick(element) {
    if (!element) return false;
    element.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    element.focus?.({ preventScroll: true });
    try {
      element.click();
      return true;
    } catch (_) {
      return simulateClick(element);
    }
  }

  function findModalHeader(root) {
    if (!root) return null;
    return (
      root.querySelector('[class*="dsa_file_view_modal--header--"]') ||
      root.querySelector('[class*="header_modal--header--"]') ||
      root.querySelector('[class*="subscription_file_view_header--componentOrFileName--"]')?.parentElement ||
      root.querySelector('[class*="asset_file_view_header--"]:not([class*="--name--"])') ||
      null
    );
  }

  function extractSubscriptionFileName(root) {
    if (!root) return '';
    const el = root.querySelector('[class*="subscription_file_view_header--componentOrFileName--"]');
    if (!el) return '';
    const span =
      el.querySelector('[class*="truncatedText--"]') ||
      el.querySelector('[class*="end_truncated_text--"]');
    return elementText(span) || elementText(el);
  }

  function clickableRank(el) {
    const role = el.getAttribute('role') || '';
    if (role === 'tab') return 0;
    if (el.tagName === 'BUTTON') return 1;
    if (role === 'radio') return 2;
    if (role === 'button') return 3;
    if (el.hasAttribute('tabindex')) return 4;
    return 10;
  }

  function findClickableByExactLabel(root, targetLabel) {
    if (!root) return null;
    const target = (targetLabel || '').toLowerCase();

    const pool = new Set();
    for (const el of root.querySelectorAll(
      'button, [role="tab"], [role="radio"], [role="button"], [tabindex], a, label, [aria-label], [class*="segmented"] *'
    )) {
      pool.add(el);
    }
    const header = findModalHeader(root);
    if (header) {
      for (const el of header.querySelectorAll('button, [role="tab"], [role="radio"]')) {
        pool.add(el);
      }
    }

    const matches = [...pool].filter((el) => {
      if (!isElementVisible(el)) return false;
      const label = tabLabel(el).toLowerCase();
      const aria = (el.getAttribute('aria-label') || '').trim().toLowerCase();
      if (label !== target && aria !== target) return false;
      // Ignore container nodes whose first text line matches but aren't the control itself
      const role = el.getAttribute('role') || '';
      if (el.tagName !== 'BUTTON' && role !== 'tab' && role !== 'radio' && role !== 'button') {
        return false;
      }
      return true;
    });

    if (!matches.length) return null;

    matches.sort((a, b) => clickableRank(a) - clickableRank(b));
    const best = matches[0];
    return best.closest('[role="tab"], [role="radio"], button, [role="button"]') || best;
  }

  function modalTabClickTargets(tab) {
    if (!tab) return [];
    if (tab.tagName === 'BUTTON' && tab.getAttribute('role') === 'tab') {
      return [tab];
    }
    const targets = new Set();
    const inner = tab.querySelector?.('button, [role="button"]');
    const outer = tab.closest?.('[role="tab"], [role="radio"], button, [role="button"]');
    if (inner) targets.add(inner);
    if (outer) targets.add(outer);
    targets.add(tab);
    return [...targets];
  }

  function activateModalLevelTab(root, targetLabel) {
    const tab =
      findModalLevelTab(root, targetLabel) || findClickableByExactLabel(root, targetLabel);
    if (!tab) return { activated: false, reason: 'not-found' };

    for (const target of modalTabClickTargets(tab)) {
      activateClick(target);
    }
    return {
      activated: true,
      tag: tab.tagName,
      role: tab.getAttribute('role') || '',
      needsMainWorld: tab.tagName === 'BUTTON',
    };
  }

  function hasAnalyticsModalChrome(dialog) {
    const tabLabels = [...dialog.querySelectorAll('[role="tab"]')].map((t) => tabLabel(t).toLowerCase());
    if (tabLabels.includes('analytics') && (tabLabels.includes('overview') || tabLabels.includes('libraries'))) {
      return true;
    }
    if (dialog.querySelector('[class*="dsa_file_view_analytics--"], [class*="dsa_file_view_overview--"], [class*="file_view_styles--"]')) {
      return true;
    }
    // Component/style drill-down (e.g. single icon with file usage, no variant table)
    if (
      dialog.querySelector(ITEM_NAME_SELECTOR) &&
      dialog.querySelector('[role="combobox"][aria-label="Type"], [role="combobox"][aria-label="type"]')
    ) {
      return true;
    }
    return hasAnalyticsStatsText(elementText(dialog));
  }

  function findAnalyticsDialog(doc = document) {
    return (
      [...doc.querySelectorAll('[role="dialog"]')].filter(isElementVisible).find(hasAnalyticsModalChrome) ||
      null
    );
  }

  function findAnalyticsModalRoot(dialog) {
    if (!dialog) return null;
    return (
      dialog.closest('[class*="header_modal--modal--"]') ||
      dialog.closest('[class*="org_view_modal--container--"]') ||
      dialog.closest('[class*="dsa_file_view_modal--"]') ||
      dialog
    );
  }

  function isModalLevelTabLabel(label) {
    const lower = (label || '').toLowerCase();
    return lower === 'overview' || lower === 'analytics' || lower === 'libraries';
  }

  function modalTablistCandidates(root) {
    if (!root) return [];
    return [
      ...root.querySelectorAll('[role="tablist"], [role="radiogroup"], [class*="segmented"]'),
    ].filter((tablist) => {
      const labels = [...tablist.querySelectorAll('[role="tab"], [role="radio"], button, [role="button"]')].map(
        (el) => tabLabel(el).toLowerCase()
      );
      const hasAnalytics = labels.includes('analytics');
      const hasOverviewLike = labels.includes('overview') || labels.includes('libraries');
      return hasAnalytics && hasOverviewLike;
    });
  }

  function modalLevelTabElements(root) {
    if (!root) return [];

    const fromTablists = modalTablistCandidates(root).flatMap((tablist) =>
      [...tablist.querySelectorAll('[role="tab"], [role="radio"], button, [role="button"]')].filter((el) =>
        isModalLevelTabLabel(tabLabel(el))
      )
    );
    if (fromTablists.length >= 2) return fromTablists;

    const fromRoot = [...root.querySelectorAll('[role="tab"], [role="radio"], button')].filter((tab) =>
      isModalLevelTabLabel(tabLabel(tab))
    );
    if (fromRoot.length >= 2) return fromRoot;

    return [];
  }

  function isModalLevelTabSelected(tab) {
    return tab.getAttribute('aria-selected') === 'true' || tab.getAttribute('aria-checked') === 'true';
  }

  function findModalLevelTab(root, targetLabel) {
    const target = (targetLabel || '').toLowerCase();
    const fromTabs = modalLevelTabElements(root).find((tab) => tabLabel(tab).toLowerCase() === target);
    if (fromTabs) return fromTabs;
    return findClickableByExactLabel(root, targetLabel);
  }

  function getAnalyticsPanel(dialog) {
    if (!dialog) return null;
    const candidates = [
      ...dialog.querySelectorAll('[class*="file_view_styles--"]'),
      ...dialog.querySelectorAll('[class*="dsa_file_view_analytics--"]'),
      ...dialog.querySelectorAll('[class*="library_item_view--"]'),
    ];
    return candidates.find(isElementVisible) || dialog;
  }

  function comboSearchRoots(dialog) {
    const roots = [];
    if (!dialog) return roots;
    const modalRoot = findAnalyticsModalRoot(dialog);
    if (modalRoot) roots.push(modalRoot);
    if (!roots.includes(dialog)) roots.push(dialog);
    return roots;
  }

  function getElementByIdSafe(doc, id) {
    if (!id || !doc) return null;
    const byId = doc.getElementById(id);
    if (byId) return byId;
    try {
      return doc.querySelector(`[id="${typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id.replace(/"/g, '\\"')}"]`);
    } catch (_) {
      return null;
    }
  }

  function gatherComboboxes(dialog) {
    const seen = new Set();
    const combos = [];
    const addAll = (root) => {
      if (!root) return;
      for (const combo of root.querySelectorAll('[role="combobox"]')) {
        if (seen.has(combo)) continue;
        seen.add(combo);
        combos.push(combo);
      }
    };
    for (const root of comboSearchRoots(dialog)) addAll(root);
    addAll(document);
    return combos;
  }

  function listboxOptionsForCombo(combo, doc = document, requireVisible = true) {
    for (const attr of ['aria-controls', 'aria-owns']) {
      const raw = combo?.getAttribute(attr);
      if (!raw) continue;
      for (const id of raw.split(/\s+/)) {
        const root = getElementByIdSafe(doc, id);
        if (!root) continue;
        const options = collectListboxOptions(root, { requireVisible });
        if (options.length) return options;
      }
    }
    return [];
  }

  function findTypeCombobox(dialog) {
    const combos = gatherComboboxes(dialog);
    const byLabel = combos.find((c) => /^type$/i.test(c.getAttribute('aria-label') || ''));
    if (byLabel) return byLabel;

    for (const combo of combos) {
      const options = listboxOptionsForCombo(combo, document, false);
      if (options.length && typeMenuFilter(options)) return combo;
    }

    return combos.find((c) => kindFromComboValue(comboLabel(c))) || null;
  }

  function kindFromComboValue(val) {
    const lower = (val || '').trim().toLowerCase();
    if (lower.includes('style')) return 'styles';
    if (lower.includes('variable')) return 'variables';
    if (lower.includes('component')) return 'components';
    return null;
  }

  function kindFromPanelText(text) {
    if (!text) return null;
    const listMatch = text.match(/(\d+)\s+library\s+(components|styles|variables)\s+shown/i);
    if (listMatch) {
      if (listMatch[2] === 'styles') return 'styles';
      if (listMatch[2] === 'variables') return 'variables';
      return 'components';
    }
    if (/Style (statistics|insertions)/i.test(text)) return 'styles';
    if (/Usage statistics/i.test(text) && /Variables/i.test(text)) return 'variables';
    if (/library variables shown/i.test(text)) return 'variables';
    if (/Component statistics/i.test(text)) return 'components';
    return null;
  }

  function getTypeKind(dialog) {
    if (!dialog) return 'unknown';

    const panel = getAnalyticsPanel(dialog);
    const panelText = elementText(panel);

    const combo = findTypeCombobox(dialog);
    const comboKind = kindFromComboValue(comboLabel(combo) || combo?.getAttribute('value') || '');
    if (comboKind) return comboKind;

    if (panel && panel.matches('[class*="file_view_styles--"]')) {
      return 'styles';
    }
    const stylesPanel = dialog.querySelector('[class*="file_view_styles--"]');
    if (stylesPanel && isElementVisible(stylesPanel)) {
      return 'styles';
    }

    const textKind = kindFromPanelText(panelText);
    if (textKind) return textKind;

    return 'unknown';
  }

  const ANALYTICS_TYPE_KINDS = ['components', 'styles', 'variables'];
  const TYPE_KIND_INDEX = { components: 0, styles: 1, variables: 2 };
  const DURATION_INDEX = { 30: 0, 60: 1, 90: 2, year: 3 };

  function typeKindLabel(kind) {
    if (kind === 'styles') return 'Styles';
    if (kind === 'variables') return 'Variables';
    if (kind === 'components') return 'Components';
    return '';
  }

  function isMenuContainerVisible(el) {
    if (!el?.isConnected) return false;
    if (el.getAttribute('aria-hidden') === 'true') return false;
    try {
      const style = el.ownerDocument.defaultView?.getComputedStyle(el);
      if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return true;
      return !(style && style.display === 'none');
    } catch (_) {
      return true;
    }
  }

  function isValidMenuOption(el) {
    if (!el?.isConnected) return false;
    if (el.getAttribute('aria-hidden') === 'true') return false;
    if (el.getAttribute('aria-disabled') === 'true') return false;
    if (el.getAttribute('role') === 'combobox') return false;
    if (el.closest('[role="combobox"]') && !el.closest('[role="listbox"], [role="menu"]')) {
      return false;
    }

    const role = el.getAttribute('role') || '';
    const optionRoles = new Set(['option', 'menuitem', 'menuitemradio', 'menuitemcheckbox']);
    const container = el.closest('[role="listbox"], [role="menu"]');

    if (optionRoles.has(role)) {
      return Boolean(container && isMenuContainerVisible(container));
    }

    if (container && isMenuContainerVisible(container)) {
      return !el.querySelector('[role="combobox"]');
    }

    return false;
  }

  function isMenuOptionVisible(el) {
    return isValidMenuOption(el);
  }

  function optionDisplayLabel(option) {
    if (!option) return '';

    const attrCandidates = [
      (option.getAttribute('aria-label') || '').trim(),
      (option.getAttribute('title') || '').trim(),
      (option.getAttribute('data-value') || '').trim(),
      (option.getAttribute('value') || '').trim(),
    ].filter(Boolean);

    for (const label of attrCandidates) {
      if (label) return label;
    }

    const fullText = elementText(option);
    const fromFull = bestLabelLine(fullText, (line) =>
      Boolean(
        kindFromComboValue(line) ||
          durationFromComboValue(line) ||
          /^(components|styles?|variables|\d+\s*days?|year)$/i.test(line)
      )
    );
    if (fromFull) return fromFull;

    for (const el of option.querySelectorAll('span, div, p, label')) {
      const text = elementText(el);
      const line = bestLabelLine(text, (candidate) =>
        Boolean(
          kindFromComboValue(candidate) ||
            durationFromComboValue(candidate) ||
            /^(components|styles?|variables|\d+\s*days?|year)$/i.test(candidate)
        )
      );
      if (line) return line;
    }

    return meaningfulLines(fullText)[0] || fullText;
  }

  function popupContainerSelectors() {
    return [
      '[data-radix-popper-content-wrapper]',
      '[data-radix-select-content]',
    ];
  }

  function collectListboxOptions(listbox, { requireVisible = true } = {}) {
    if (!listbox) return [];
    const selectors = [
      '[role="option"]',
      '[role="menuitem"]',
      '[role="menuitemradio"]',
      '[role="menuitemcheckbox"]',
      'li[role="option"]',
    ];
    const seen = new Set();
    const options = [];
    for (const selector of selectors) {
      for (const el of listbox.querySelectorAll(selector)) {
        if (seen.has(el)) continue;
        if (requireVisible) {
          if (!isValidMenuOption(el)) continue;
        } else {
          const role = el.getAttribute('role') || '';
          if (!['option', 'menuitem', 'menuitemradio', 'menuitemcheckbox'].includes(role)) continue;
        }
        seen.add(el);
        options.push(el);
      }
    }
    if (options.length === 0 && !requireVisible) {
      for (const el of listbox.children) {
        if (el.nodeType !== 1 || seen.has(el)) continue;
        seen.add(el);
        options.push(el);
      }
    }
    return dedupeNestedMenuOptions(options);
  }

  /** Prefer the innermost option node when Figma nests role="option" elements. */
  function dedupeNestedMenuOptions(options) {
    const list = [...options];
    return list.filter((el) => !list.some((other) => other !== el && el.contains(other)));
  }

  function isRecognizedTypeOption(option) {
    const label = optionDisplayLabel(option);
    if (!label || !label.trim()) return false;
    if (kindFromComboValue(label)) return true;
    return /^(components|styles?|variables)$/i.test(label.trim());
  }

  function isRecognizedDurationOption(option) {
    const label = optionDisplayLabel(option);
    if (!label || !label.trim()) return false;
    if (durationFromComboValue(label)) return true;
    return /^\d+\s*days?$/i.test(label.trim()) || /\byear\b/i.test(label);
  }

  function collectComboMenuOptions(doc = document) {
    const selectors = [
      '[role="listbox"] [role="option"]',
      '[role="menu"] [role="menuitem"]',
      '[role="menu"] [role="menuitemradio"]',
      '[role="menu"] [role="menuitemcheckbox"]',
    ];
    const seen = new Set();
    const options = [];
    for (const selector of selectors) {
      for (const el of doc.querySelectorAll(selector)) {
        if (!isValidMenuOption(el) || seen.has(el)) continue;
        seen.add(el);
        options.push(el);
      }
    }
    return options;
  }

  function popupRootsForCombobox(combo, doc = document) {
    const roots = [];

    for (const attr of ['aria-controls', 'aria-owns']) {
      const raw = combo?.getAttribute(attr);
      if (!raw) continue;
      for (const id of raw.split(/\s+/)) {
        const root = getElementByIdSafe(doc, id);
        if (root && !roots.includes(root)) roots.push(root);
      }
    }

    const labelledBy = combo?.getAttribute('aria-labelledby');
    if (labelledBy) {
      for (const id of labelledBy.split(/\s+/)) {
        const labelEl = getElementByIdSafe(doc, id);
        const popupId = labelEl?.getAttribute('aria-controls');
        if (!popupId) continue;
        const root = getElementByIdSafe(doc, popupId);
        if (root && !roots.includes(root)) roots.push(root);
      }
    }

    return roots;
  }

  function findMenuOptionsForCombobox(combo, doc = document, optionFilter = null) {
    if (!combo) return [];

    const expanded = combo.getAttribute('aria-expanded') === 'true';

    for (const root of popupRootsForCombobox(combo, doc)) {
      let options = collectListboxOptions(root, { requireVisible: true });
      if (!options.length && expanded) {
        options = collectListboxOptions(root, { requireVisible: false });
      }
      if (options.length && (!optionFilter || optionFilter(options))) return options;
    }

    for (const listbox of doc.querySelectorAll('[role="listbox"], [role="menu"]')) {
      if (!isMenuContainerVisible(listbox)) continue;
      if (listbox.contains(combo)) continue;
      const options = collectListboxOptions(listbox);
      if (!options.length) continue;
      if (optionFilter && !optionFilter(options)) continue;
      return options;
    }

    for (const selector of popupContainerSelectors()) {
      for (const container of doc.querySelectorAll(selector)) {
        if (!isMenuContainerVisible(container)) continue;
        if (container.contains(combo)) continue;
        const options = collectListboxOptions(container);
        if (!options.length) continue;
        if (optionFilter && !optionFilter(options)) continue;
        return options;
      }
    }

    const global = collectComboMenuOptions(doc);
    if (!optionFilter) return global;
    return global.filter((option) => {
      const subset = [option];
      return optionFilter(subset);
    });
  }

  function findOptionByTextNearCombo(combo, matchFn, doc = document) {
    if (!combo) return null;
    const candidates = [];

    for (const el of doc.querySelectorAll(
      '[role="listbox"] [role="option"], [role="menu"] [role="menuitem"], [role="menu"] [role="menuitemradio"], [role="menu"] [role="menuitemcheckbox"]'
    )) {
      if (!isValidMenuOption(el)) continue;
      const label = optionDisplayLabel(el);
      if (!label || !matchFn(label, el)) continue;

      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;

      const area = rect.width * rect.height;
      candidates.push({ el, area });
    }

    candidates.sort((a, b) => a.area - b.area);
    return candidates[0]?.el || null;
  }

  function waitForMenuOption(combo, matchFn, doc = document, attempts = 40, delayMs = 50, optionFilter = null) {
    for (let attempt = 0; attempt < attempts; attempt++) {
      const option =
        findMenuOptionsForCombobox(combo, doc, optionFilter).find((candidate) =>
          matchFn(optionDisplayLabel(candidate), candidate)
        ) || findOptionByTextNearCombo(combo, matchFn, doc);
      if (option) return option;
      const end = Date.now() + delayMs;
      while (Date.now() < end) {
        /* wait for React menu */
      }
    }
    return null;
  }

  function findTypeListboxOptions(doc = document, combo = null) {
    if (combo) {
      const options = findMenuOptionsForCombobox(combo, doc);
      if (options.length) return options;
    }

    for (const listbox of doc.querySelectorAll('[role="listbox"], [role="menu"]')) {
      if (!isMenuContainerVisible(listbox)) continue;
      const options = collectListboxOptions(listbox);
      const kinds = new Set(
        options.map((option) => kindFromComboValue(optionDisplayLabel(option))).filter(Boolean)
      );
      if (kinds.has('components') && kinds.has('styles') && kinds.has('variables')) {
        return options;
      }
      if (kinds.size >= 2 && [...kinds].every((k) => ANALYTICS_TYPE_KINDS.includes(k))) {
        return options;
      }
    }

    return collectComboMenuOptions(doc).filter((option) =>
      ANALYTICS_TYPE_KINDS.includes(kindFromComboValue(optionDisplayLabel(option)))
    );
  }

  function findDurationListboxOptions(doc = document, combo = null) {
    if (combo) {
      const options = findMenuOptionsForCombobox(combo, doc);
      if (options.length) return options;
    }

    for (const listbox of doc.querySelectorAll('[role="listbox"], [role="menu"]')) {
      if (!isMenuContainerVisible(listbox)) continue;
      const options = collectListboxOptions(listbox);
      const durations = new Set(
        options.map((option) => durationFromComboValue(optionDisplayLabel(option))).filter(Boolean)
      );
      if (durations.has('30') && durations.has('60') && durations.has('90') && durations.has('year')) {
        return options;
      }
    }

    return collectComboMenuOptions(doc).filter((option) =>
      ANALYTICS_DURATIONS.includes(durationFromComboValue(optionDisplayLabel(option)))
    );
  }

  function dispatchKey(target, key) {
    if (!target) return;
    const win = target.ownerDocument?.defaultView;
    if (!win || typeof win.KeyboardEvent !== 'function') return;
    const init = { key, code: key, bubbles: true, cancelable: true };
    target.dispatchEvent(new win.KeyboardEvent('keydown', init));
    target.dispatchEvent(new win.KeyboardEvent('keyup', init));
  }

  function pauseMs(ms) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      /* wait for React menu */
    }
  }

  function closeComboboxMenu(combo) {
    if (combo?.getAttribute('aria-expanded') === 'true') {
      activateClick(combo);
      pauseMs(40);
    }
  }

  function openComboboxMenu(combo) {
    if (!combo) return;
    if (combo.getAttribute('aria-expanded') === 'true') return;
    activateClick(combo);
    pauseMs(40);
  }

  function selectComboOptionByRelativeKeyboard(combo, delta) {
    if (!combo) return;
    combo.focus?.({ preventScroll: true });
    if (delta === 0) {
      dispatchKey(combo, 'Enter');
      return;
    }
    const key = delta > 0 ? 'ArrowDown' : 'ArrowUp';
    for (let step = 0; step < Math.abs(delta); step++) {
      dispatchKey(combo, key);
      pauseMs(20);
    }
    dispatchKey(combo, 'Enter');
  }

  function sortMenuOptions(options) {
    return [...options].sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      return ra.top - rb.top || ra.left - rb.left;
    });
  }

  function normalizeTypeMenuOptions(options) {
    const sorted = sortMenuOptions(dedupeNestedMenuOptions(options)).filter(isRecognizedTypeOption);

    const ordered = [];
    for (const kind of ANALYTICS_TYPE_KINDS) {
      const match = sorted.find(
        (option) =>
          kindFromComboValue(optionDisplayLabel(option)) === kind ||
          matchesTypeOption(optionDisplayLabel(option), kind)
      );
      if (match) ordered.push(match);
    }
    if (ordered.length >= 3) return ordered;

    const seen = new Set();
    const deduped = [];
    for (const option of sorted) {
      const kind = kindFromComboValue(optionDisplayLabel(option));
      if (!kind || seen.has(kind)) continue;
      seen.add(kind);
      deduped.push(option);
    }
    return deduped.length ? deduped : sorted;
  }

  function clickTargetsForOption(option) {
    if (!option) return [];
    const targets = new Set();
    const role = option.getAttribute('role') || '';
    if (['option', 'menuitem', 'menuitemradio', 'menuitemcheckbox'].includes(role)) {
      targets.add(option);
    }
    for (const el of option.querySelectorAll(
      '[role="option"], [role="menuitem"], button, [role="button"], div, span'
    )) {
      if (el.querySelector('[role="combobox"]')) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) targets.add(el);
    }
    return [...targets].sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      return ra.width * ra.height - rb.width * rb.height;
    });
  }

  function clickMenuOption(option) {
    if (!option) return false;
    for (const target of clickTargetsForOption(option)) {
      if (simulateClick(target)) return true;
      if (activateClick(target)) return true;
    }
    return false;
  }

  function selectComboOptionByKeyboard(combo, index) {
    if (!combo || index < 0) return;
    combo.focus?.({ preventScroll: true });
    dispatchKey(combo, 'Home');
    for (let step = 0; step < index; step++) {
      dispatchKey(combo, 'ArrowDown');
    }
    dispatchKey(combo, 'Enter');
  }

  function normalizeDurationMenuOptions(options) {
    const sorted = sortMenuOptions(dedupeNestedMenuOptions(options)).filter(isRecognizedDurationOption);

    const ordered = [];
    for (const duration of ANALYTICS_DURATIONS) {
      const match = sorted.find(
        (option) =>
          durationFromComboValue(optionDisplayLabel(option)) === duration ||
          matchesDurationOption(optionDisplayLabel(option), duration)
      );
      if (match) ordered.push(match);
    }
    if (ordered.length >= 4) return ordered;

    const seen = new Set();
    const deduped = [];
    for (const option of sorted) {
      const duration = durationFromComboValue(optionDisplayLabel(option));
      if (!duration || seen.has(duration)) continue;
      seen.add(duration);
      deduped.push(option);
    }
    return deduped.length ? deduped : sorted;
  }

  function waitForLinkedMenuOptions(combo, doc = document, optionFilter = null, attempts = 60, delayMs = 50) {
    for (let attempt = 0; attempt < attempts; attempt++) {
      const options = resolveMenuOptionsForCombobox(combo, doc, optionFilter);
      if (options.length && menuOptionsUsable(options) && (!optionFilter || optionFilter(options))) {
        return options;
      }
      const end = Date.now() + delayMs;
      while (Date.now() < end) {
        /* wait for React menu */
      }
    }

    const options = resolveMenuOptionsForCombobox(combo, doc, optionFilter);
    if (options.length && (!optionFilter || optionFilter(options))) {
      return options;
    }
    return [];
  }

  function buildComboMenu(combo, optionFilter, normalizeFn, currentIndex) {
    openComboboxMenu(combo);
    pauseMs(60);
    const rawOptions = waitForLinkedMenuOptions(combo, document, optionFilter);
    const options = normalizeFn(rawOptions);
    const visibleOptions = options.map((el) => optionDisplayLabel(el)).filter(Boolean);
    return { rawOptions, options, visibleOptions, currentIndex, optionFilter, normalizeFn };
  }

  function prepareComboMenuOptions(combo, optionFilter, normalizeFn, currentIndex) {
    return buildComboMenu(combo, optionFilter, normalizeFn, currentIndex);
  }

  function trySelectComboMenuOption(
    combo,
    findTargetOption,
    verifyFn,
    labelMatchFn,
    optionFilter,
    normalizeFn,
    currentIndex
  ) {
    const strategies = [];

    strategies.push((target) => clickMenuOption(target));
    strategies.push((target) => clickAtElement(target));
    strategies.push((target) => activateClick(target));
    strategies.push(() => {
      const near = findOptionByTextNearCombo(combo, labelMatchFn, document);
      if (near) clickAtElement(near);
    });
    strategies.push((_target, menu) => {
      const targetIndex = menu.options.indexOf(menu.targetOption);
      if (typeof currentIndex === 'number' && currentIndex >= 0 && targetIndex >= 0) {
        selectComboOptionByRelativeKeyboard(combo, targetIndex - currentIndex);
      }
    });
    strategies.push((_target, menu) => {
      const targetIndex = menu.options.indexOf(menu.targetOption);
      if (targetIndex >= 0) selectComboOptionByKeyboard(combo, targetIndex);
    });

    let lastVisibleOptions = [];

    for (const strategy of strategies) {
      closeComboboxMenu(combo);
      pauseMs(40);

      const menu = buildComboMenu(combo, optionFilter, normalizeFn, currentIndex);
      lastVisibleOptions = menu.visibleOptions;

      const targetOption = findTargetOption(menu.options, menu.rawOptions);
      if (!targetOption?.isConnected) continue;

      menu.targetOption = targetOption;
      openComboboxMenu(combo);
      pauseMs(60);

      strategy(targetOption, menu);

      if (waitForCondition(verifyFn, 30, 80)) {
        return { ok: true, visibleOptions: lastVisibleOptions };
      }
    }

    return {
      ok: false,
      visibleOptions: lastVisibleOptions,
      optionCount: 0,
      rawOptionCount: 0,
    };
  }

  function selectComboMenuTarget(
    combo,
    findTargetOption,
    labelMatchFn,
    notFoundLabel,
    optionFilter = null,
    currentIndex = null,
    verifyFn = null
  ) {
    const normalizeFn =
      optionFilter === typeMenuFilter
        ? normalizeTypeMenuOptions
        : optionFilter === durationMenuFilter
          ? normalizeDurationMenuOptions
          : (options) => sortMenuOptions(dedupeNestedMenuOptions(options));

    let lastFailure = null;

    for (let round = 0; round < 4; round++) {
      if (round > 0) pauseMs(150);

      const menu = buildComboMenu(combo, optionFilter, normalizeFn, currentIndex);
      const visibleOptions = menu.visibleOptions.slice(0, 16);
      const targetOption = findTargetOption(menu.options, menu.rawOptions);

      if (!targetOption) {
        lastFailure = {
          ok: false,
          error: `${notFoundLabel} Found: ${visibleOptions.join(', ') || 'none'}.`,
          visibleOptions,
          optionCount: menu.options.length,
          rawOptionCount: menu.rawOptions.length,
        };
        closeComboboxMenu(combo);
        if (menu.rawOptions.length === 0) continue;
        return lastFailure;
      }

      if (verifyFn) {
        const attempt = trySelectComboMenuOption(
          combo,
          findTargetOption,
          verifyFn,
          labelMatchFn,
          optionFilter,
          normalizeFn,
          currentIndex
        );
        closeComboboxMenu(combo);
        if (attempt.ok) {
          return { ok: true, changed: true };
        }
        lastFailure = {
          ok: false,
          error: `${notFoundLabel} Found: ${(attempt.visibleOptions || visibleOptions).join(', ') || 'none'}.`,
          visibleOptions: attempt.visibleOptions || visibleOptions,
          optionCount: menu.options.length,
          rawOptionCount: menu.rawOptions.length,
        };
        if (round < 2) continue;
        return lastFailure;
      }

      openComboboxMenu(combo);
      clickAtElement(targetOption);
      closeComboboxMenu(combo);
      return { ok: true, changed: true };
    }

    closeComboboxMenu(combo);
    return lastFailure || { ok: false, error: notFoundLabel };
  }

  function selectComboMenuOptionByIndex(
    combo,
    index,
    notFoundLabel,
    optionFilter = null,
    currentIndex = null,
    verifyFn = null
  ) {
    const normalizeFn =
      optionFilter === typeMenuFilter
        ? normalizeTypeMenuOptions
        : optionFilter === durationMenuFilter
          ? normalizeDurationMenuOptions
          : (options) => sortMenuOptions(dedupeNestedMenuOptions(options));

    const menu = prepareComboMenuOptions(combo, optionFilter, normalizeFn, currentIndex);
    const targetOption = menu.options[index];

    if (!targetOption) {
      return {
        ok: false,
        error: notFoundLabel,
        visibleOptions: menu.visibleOptions.slice(0, 16),
        selectedIndex: index,
        optionCount: menu.options.length,
        rawOptionCount: menu.rawOptions.length,
      };
    }

    if (verifyFn) {
      const attempt = trySelectComboMenuOption(
        combo,
        (_options, rawOptions) => rawOptions[index] || _options[index] || null,
        verifyFn,
        () => true,
        optionFilter,
        normalizeFn,
        currentIndex
      );
      if (!attempt.ok) {
        return {
          ok: false,
          error: notFoundLabel,
          visibleOptions: attempt.visibleOptions?.slice(0, 16) || menu.visibleOptions.slice(0, 16),
          selectedIndex: index,
          optionCount: attempt.optionCount ?? menu.options.length,
          rawOptionCount: attempt.rawOptionCount ?? menu.rawOptions.length,
        };
      }
    } else {
      openComboboxMenu(combo);
      clickMenuOption(targetOption);
    }

    return { ok: true, changed: true };
  }

  function linkedMenuOptionsForCombobox(combo, doc = document) {
    let options = listboxOptionsForCombo(combo, doc, true);
    if (!options.length) {
      options = listboxOptionsForCombo(combo, doc, false);
    }
    return sortMenuOptions(options);
  }

  function menuOptionsUsable(options) {
    if (!options.length) return false;
    return options.some((option) => {
      const rect = option.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
  }

  function menuOptionsReady(options) {
    return menuOptionsUsable(options);
  }

  function resolveMenuOptionsForCombobox(combo, doc = document, optionFilter = null) {
    const hasLinked = Boolean(combo?.getAttribute('aria-controls') || combo?.getAttribute('aria-owns'));
    let options = dedupeNestedMenuOptions(linkedMenuOptionsForCombobox(combo, doc));

    if (hasLinked && options.length && (!optionFilter || optionFilter(options))) {
      return options;
    }

    if (!options.length || (optionFilter && !optionFilter(options))) {
      const fallback = sortMenuOptions(
        dedupeNestedMenuOptions(findMenuOptionsForCombobox(combo, doc, optionFilter))
      );
      if (fallback.length) options = fallback;
    }
    return options;
  }

  function waitForLinkedMenuOptions(combo, doc = document, optionFilter = null, attempts = 40, delayMs = 50) {
    for (let attempt = 0; attempt < attempts; attempt++) {
      const options = resolveMenuOptionsForCombobox(combo, doc, optionFilter);
      if (options.length && menuOptionsReady(options) && (!optionFilter || optionFilter(options))) {
        return options;
      }
      const end = Date.now() + delayMs;
      while (Date.now() < end) {
        /* wait for React menu */
      }
    }

    const options = resolveMenuOptionsForCombobox(combo, doc, optionFilter);
    if (options.length && (!optionFilter || optionFilter(options))) {
      return options;
    }
    return [];
  }

  function waitForMenuOptionByIndex(combo, index, doc = document, attempts = 40, delayMs = 50, optionFilter = null) {
    const options = waitForLinkedMenuOptions(combo, doc, optionFilter, attempts, delayMs);
    return options[index] || null;
  }

  function selectComboMenuOption(combo, matchFn, notFoundLabel, optionFilter = null) {
    activateClick(combo);

    const option = waitForMenuOption(
      combo,
      (label) => matchFn(label),
      document,
      40,
      50,
      optionFilter
    );

    if (!option) {
      const visibleOptions = findMenuOptionsForCombobox(combo, document, optionFilter)
        .map((el) => optionDisplayLabel(el))
        .filter(Boolean);
      return {
        ok: false,
        error: notFoundLabel,
        visibleOptions: visibleOptions.slice(0, 16),
      };
    }

    clickMenuOption(option);
    return { ok: true, changed: true };
  }

  function typeMenuFilter(options) {
    if (options.length >= 3) return true;
    const kinds = new Set(
      options.map((option) => kindFromComboValue(optionDisplayLabel(option))).filter(Boolean)
    );
    return kinds.size >= 2 && [...kinds].every((k) => ANALYTICS_TYPE_KINDS.includes(k));
  }

  function durationMenuFilter(options) {
    if (options.length >= 4) return true;
    const durations = new Set(
      options.map((option) => durationFromComboValue(optionDisplayLabel(option))).filter(Boolean)
    );
    return durations.size >= 2;
  }

  function waitForCondition(checkFn, attempts = 24, delayMs = 50) {
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (checkFn()) return true;
      const end = Date.now() + delayMs;
      while (Date.now() < end) {
        /* wait for React state */
      }
    }
    return checkFn();
  }

  function setTypeKind(dialog, kind) {
    if (!dialog) {
      return { ok: false, error: 'No Library Analytics modal found.' };
    }
    if (!ANALYTICS_TYPE_KINDS.includes(kind)) {
      return { ok: false, error: 'Invalid analytics type.' };
    }

    const current = getTypeKind(dialog);
    if (current === kind) {
      return { ok: true, kind, changed: false };
    }

    const combo = findTypeCombobox(dialog);
    if (!combo) {
      return { ok: false, error: 'Type selector not found in Library Analytics.' };
    }

    const targetLabel = typeKindLabel(kind);
    const currentIndex = TYPE_KIND_INDEX[current];
    const result = selectComboMenuTarget(
      combo,
      (options, rawOptions) => {
        const byValue =
          options.find((o) => kindFromComboValue(optionDisplayLabel(o)) === kind) ||
          options.find((o) => matchesTypeOption(optionDisplayLabel(o), kind));
        if (byValue) return byValue;
        const raw = sortMenuOptions(dedupeNestedMenuOptions(rawOptions));
        return raw[TYPE_KIND_INDEX[kind]] || null;
      },
      (label) => matchesTypeOption(label, kind),
      `Could not switch to ${targetLabel}.`,
      typeMenuFilter,
      currentIndex,
      () => getTypeKind(dialog) === kind
    );
    if (!result.ok) return result;

    return { ok: true, kind, changed: true };
  }

  const ANALYTICS_DURATIONS = ['30', '60', '90', 'year'];

  function durationLabel(duration) {
    if (duration === 'year') return 'Year';
    if (duration === '30') return '30 days';
    if (duration === '60') return '60 days';
    if (duration === '90') return '90 days';
    return '';
  }

  function durationFromComboValue(val) {
    const lower = (val || '').trim().toLowerCase();
    if (/\byear\b/.test(lower)) return 'year';
    const days = lower.match(/(\d+)\s*days?/);
    if (days && ANALYTICS_DURATIONS.includes(days[1])) return days[1];
    return null;
  }

  function matchesTypeOption(label, kind) {
    if (!label || !kind) return false;
    if (kindFromComboValue(label) === kind) return true;
    const target = typeKindLabel(kind);
    if (!target) return false;
    const trimmed = label.trim();
    if (new RegExp(`^${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i').test(trimmed)) {
      return true;
    }
    if (kind === 'styles' && /^styles?$/i.test(trimmed)) return true;
    return false;
  }

  function matchesDurationOption(label, duration) {
    if (!label || !duration) return false;
    if (durationFromComboValue(label) === duration) return true;
    const target = durationLabel(duration);
    if (target && new RegExp(`^${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i').test(label.trim())) {
      return true;
    }
    if (duration === 'year' && /\byear\b/i.test(label)) return true;
    if (duration !== 'year' && new RegExp(`\\b${duration}\\s*days?\\b`, 'i').test(label)) return true;
    return false;
  }

  function findDurationCombobox(dialog) {
    const combos = gatherComboboxes(dialog);
    const byLabel = combos.find((c) => /^duration$/i.test(c.getAttribute('aria-label') || ''));
    if (byLabel) return byLabel;

    for (const combo of combos) {
      const options = listboxOptionsForCombo(combo, document, false);
      if (options.length && durationMenuFilter(options)) return combo;
    }

    return combos.find((c) => durationFromComboValue(comboLabel(c))) || null;
  }

  function getAnalyticsDuration(dialog) {
    if (!dialog) return null;
    const combo = findDurationCombobox(dialog);
    return durationFromComboValue(comboLabel(combo) || combo?.getAttribute('value') || '');
  }

  function setAnalyticsDuration(dialog, duration) {
    if (!dialog) {
      return { ok: false, error: 'No Library Analytics modal found.' };
    }
    if (!ANALYTICS_DURATIONS.includes(duration)) {
      return { ok: false, error: 'Invalid analytics duration.' };
    }

    const current = getAnalyticsDuration(dialog);
    if (current === duration) {
      return { ok: true, duration, changed: false };
    }

    const combo = findDurationCombobox(dialog);
    if (!combo) {
      return { ok: false, error: 'Duration selector not found in Library Analytics.' };
    }

    const targetLabel = durationLabel(duration);
    const currentIndex = current ? DURATION_INDEX[current] : undefined;
    const result = selectComboMenuTarget(
      combo,
      (options, rawOptions) => {
        const byValue =
          options.find((o) => durationFromComboValue(optionDisplayLabel(o)) === duration) ||
          options.find((o) => matchesDurationOption(optionDisplayLabel(o), duration));
        if (byValue) return byValue;
        const raw = sortMenuOptions(dedupeNestedMenuOptions(rawOptions));
        return raw[DURATION_INDEX[duration]] || null;
      },
      (label) => matchesDurationOption(label, duration),
      `Could not switch to ${targetLabel}.`,
      durationMenuFilter,
      currentIndex,
      () => getAnalyticsDuration(dialog) === duration
    );
    if (!result.ok) return result;

    return { ok: true, duration, changed: true };
  }

  function withAnalyticsDuration(state, dialog) {
    if (!state.analyticsTabSelected) return state;
    const duration = getAnalyticsDuration(dialog);
    return duration ? { ...state, duration } : state;
  }

  function isAnalyticsTabSelected(dialog) {
    const root = findAnalyticsModalRoot(dialog);
    const modalTabs = modalLevelTabElements(root);

    // Prefer tab selection — stale analytics panels often stay mounted under Overview.
    if (modalTabs.length >= 2) {
      const selectedLabels = modalTabs
        .filter(isModalLevelTabSelected)
        .map((tab) => tabLabel(tab).toLowerCase());
      if (selectedLabels.includes('overview')) return false;
      if (selectedLabels.includes('analytics')) return true;
      if (selectedLabels.includes('libraries')) return false;
      return false;
    }

    const overviewPanel = dialog.querySelector('[class*="dsa_file_view_overview--"]');
    const analyticsPanel = dialog.querySelector('[class*="dsa_file_view_analytics--"]');
    const stylesPanel = dialog.querySelector('[class*="file_view_styles--"]');
    const overviewVisible = overviewPanel && isElementVisible(overviewPanel);
    const analyticsVisible = analyticsPanel && isElementVisible(analyticsPanel);
    const stylesVisible = stylesPanel && isElementVisible(stylesPanel);

    if (overviewVisible && !analyticsVisible && !stylesVisible) return false;
    if ((analyticsVisible || stylesVisible) && !overviewVisible) return true;

    const tabs = [...dialog.querySelectorAll('[role="tab"]')];
    if (tabs.length === 0) return analyticsVisible || stylesVisible;

    const selectedLabels = tabs
      .filter((tab) => tab.getAttribute('aria-selected') === 'true')
      .map((tab) => tabLabel(tab).toLowerCase());

    if (selectedLabels.includes('overview') || selectedLabels.includes('libraries')) return false;

    return selectedLabels.includes('analytics');
  }

  function findAnalyticsTabElement(dialog) {
    const root = findAnalyticsModalRoot(dialog);
    return findModalLevelTab(root, 'analytics');
  }

  function selectAnalyticsTab(dialog) {
    if (!dialog) {
      return { ok: false, error: 'No Library Analytics modal found.' };
    }

    const root = findAnalyticsModalRoot(dialog);
    const overviewTab = findModalLevelTab(root, 'overview');
    const onOverviewTab =
      overviewTab &&
      (overviewTab.getAttribute('aria-selected') === 'true' ||
        overviewTab.getAttribute('aria-checked') === 'true');

    if (isAnalyticsTabSelected(dialog) && !onOverviewTab) {
      return { ok: true, changed: false };
    }

    const activation = activateModalLevelTab(root, 'analytics');
    if (!activation.activated) {
      return {
        ok: false,
        error: 'Analytics tab not found in Library Analytics.',
        debug: {
          rootClass: root?.className?.slice?.(0, 80) || '',
          modalTabCount: modalLevelTabElements(root).length,
        },
      };
    }

    return { ok: true, changed: true, activation };
  }

  function isInFigmaDesignFile() {
    try {
      return /^\/(design|file)\//.test(root.location?.pathname || '');
    } catch {
      return false;
    }
  }

  function getLaunchContext(dialog) {
    if (!dialog) return 'unknown';
    const labels = [...dialog.querySelectorAll('[role="tab"]')].map((t) => tabLabel(t).toLowerCase());
    if (labels.includes('libraries') && labels.includes('overview') && labels.includes('analytics')) {
      return 'libraries';
    }
    if (dialog.querySelector('[class*="library_item_view--"]')) return 'libraries';
    if (labels.includes('overview') && labels.includes('analytics') && !labels.includes('libraries')) {
      return isInFigmaDesignFile() ? 'inFile' : 'workspace';
    }
    if (/(?:Library|File)\s+analytics/i.test(elementText(dialog)) && isInFigmaDesignFile()) {
      return 'inFile';
    }
    return 'unknown';
  }

  function hasVariablesSubTabs(dialog) {
    const tabTexts = [...dialog.querySelectorAll('[role="tab"]')].map((t) => tabLabel(t).toLowerCase());
    return tabTexts.includes('variables') && tabTexts.includes('modes');
  }

  function findVariablesSubTabElements(dialog) {
    if (!dialog) return null;
    const tabs = [...dialog.querySelectorAll('[role="tab"]')];
    const variablesTab = tabs.find((t) => /^variables$/i.test(tabLabel(t)));
    const modesTab = tabs.find((t) => /^modes$/i.test(tabLabel(t)));
    if (!variablesTab || !modesTab) return null;
    return { variablesTab, modesTab };
  }

  function getVariablesSubTab(dialog) {
    const pair = findVariablesSubTabElements(dialog);
    if (!pair) return null;
    const { variablesTab, modesTab } = pair;
    if (modesTab.getAttribute('aria-selected') === 'true') return 'modes';
    if (variablesTab.getAttribute('aria-selected') === 'true') return 'variables';
    return 'variables';
  }

  function setVariablesSubTab(dialog, subTab) {
    if (!dialog) {
      return { ok: false, error: 'No Library Analytics modal found.' };
    }
    if (subTab !== 'variables' && subTab !== 'modes') {
      return { ok: false, error: 'Invalid variables sub-tab.' };
    }

    const pair = findVariablesSubTabElements(dialog);
    if (!pair) {
      return { ok: false, error: 'Variables and Modes tabs not found in Library Analytics.' };
    }

    const current = getVariablesSubTab(dialog);
    if (current === subTab) {
      return { ok: true, subTab, changed: false };
    }

    const targetTab = subTab === 'modes' ? pair.modesTab : pair.variablesTab;
    activateClick(targetTab);
    return { ok: true, subTab, changed: true };
  }

  function isComponentFileUsageView(text) {
    const t = text || '';
    if (/Sort by column:\s*File name/i.test(t)) return true;
    if (/\d+\s+files?\s+shown/i.test(t)) return true;
    if (/Instances\s*\(all time\)/i.test(t) && /Last modified/i.test(t)) return true;
    return false;
  }

  function looksLikeVariantName(name) {
    if (!name) return false;
    return /,/.test(name) || /=/.test(name);
  }

  function isComponentVariantFileUsageView(text, itemName, dialog) {
    if (!isComponentFileUsageView(text)) return false;
    if (looksLikeVariantName(itemName)) return true;
    if (dialog && extractComponentSetName(dialog, itemName)) return true;
    return false;
  }

  function isComponentVariantDetailView(text) {
    const t = text || '';
    if (/Showing\s+\d+\s+variants/i.test(t)) return true;
    if (/All variants/i.test(t)) return true;
    if (/Inserts\s*\(30\s*days?\)/i.test(t) && !isComponentFileUsageView(t)) return true;
    return false;
  }

  function parseVariantCountFromText(text) {
    const showing = (text || '').match(/Showing\s+(\d+)\s+variants/i);
    if (showing) return parseInt(showing[1], 10);
    return undefined;
  }

  function resolveVariantCount(dialog, viewText) {
    const fromText = parseVariantCountFromText(viewText);
    if (fromText != null) return fromText;
    const fromRows = countVisibleVariantRows(dialog);
    return fromRows > 0 ? fromRows : undefined;
  }

  function extractItemName(dialog, fallbackText) {
    if (!dialog) return 'Exported Component';
    const nameEl = dialog.querySelector(`${ITEM_NAME_SELECTOR}:not([class*="--stale"])`);
    const fromEl = elementText(nameEl);
    if (fromEl) return fromEl;

    const text = fallbackText || elementText(dialog);
    const breadcrumb = text.match(/(?:Library|File)\s+analytics\s*[/\\]\s*([^\n]+)/i);
    if (breadcrumb) return breadcrumb[1].replace(/All variants/i, '').trim();

    return 'Exported Component';
  }

  function extractComponentSetName(dialog, currentName) {
    if (!dialog || !currentName) return '';
    const stale = dialog.querySelector('[class*="asset_file_view_header--name--stale"]');
    const staleName = elementText(stale);
    if (staleName && staleName !== currentName) return staleName;
    return '';
  }

  function parseUsageStats(text) {
    const t = text || '';
    const usedInMatch = t.match(/Used in:?\s*([\d,.]+(?:k|m)?)\s*files/i);
    const teamsMatch = t.match(/Used by:?\s*([\d,.]+(?:k|m)?)\s*teams/i);
    return {
      usedIn: usedInMatch ? usedInMatch[1] : undefined,
      usedBy: teamsMatch ? teamsMatch[1] : undefined,
    };
  }

  function getLibraryName(dialog) {
    if (!dialog) return '';

    const fromSubscription = extractSubscriptionFileName(dialog);
    if (fromSubscription) return fromSubscription;

    const fromAria = dialog.getAttribute('aria-label')?.trim();
    const itemName = elementText(
      dialog.querySelector(`${ITEM_NAME_SELECTOR}:not([class*="--stale"])`)
    );

    if (fromAria && (!itemName || fromAria !== itemName)) return fromAria;

    const assetHeader = dialog.querySelector(
      '[class*="asset_file_view_header--"]:not([class*="--name--"]):not([class*="libraryPath--"])'
    );
    const fromAssetHeader = elementText(assetHeader);
    if (fromAssetHeader && (!itemName || fromAssetHeader !== itemName)) return fromAssetHeader;

    for (const heading of dialog.querySelectorAll('h1, h2')) {
      if (heading.closest('[class*="libraryPath--"]')) continue;
      const text = elementText(heading);
      if (text && (!itemName || text !== itemName)) return text;
    }

    return fromAria || fromSubscription || '';
  }

  function isComponentListView(text) {
    const t = text || '';
    if (/Component statistics/i.test(t)) return true;
    if (/(\d+)\s+library\s+components\s+shown/i.test(t)) return true;
    if (/Component insertions/i.test(t) && !/Sort by column:\s*File name/i.test(t)) return true;
    return false;
  }

  function classifyAnalyticsState(dialog) {
    if (!dialog) {
      return {
        modalOpen: false,
        kind: 'unknown',
        depth: 'unknown',
        analyticsTabSelected: false,
      };
    }

    const kind = getTypeKind(dialog);
    const panel = getAnalyticsPanel(dialog);
    const t = elementText(panel);
    const dialogText = elementText(dialog);
    const libraryName = getLibraryName(dialog);
    const analyticsTabSelected = isAnalyticsTabSelected(dialog);
    const launchContext = getLaunchContext(dialog);

    if (!analyticsTabSelected) {
      return {
        modalOpen: true,
        kind,
        depth: 'unknown',
        libraryName,
        analyticsTabSelected: false,
        launchContext,
      };
    }

    const listMatch = t.match(/(\d+)\s+library\s+(components|styles|variables)\s+shown/i);
    const activeNameEl = dialog.querySelector(`${ITEM_NAME_SELECTOR}:not([class*="--stale"])`);
    let itemName = elementText(activeNameEl);
    if (!itemName) {
      const extracted = extractItemName(dialog, dialogText);
      if (extracted && extracted !== 'Exported Component') itemName = extracted;
    }
    const isDetailByName = Boolean(itemName && itemName !== libraryName);

    if (kind === 'components') {
      const viewText = isDetailByName ? dialogText : t;
      const variantsMatch = viewText.match(/Showing\s+(\d+)\s+variants/i);
      const resolvedItemName = extractItemName(dialog, dialogText);
      const variantFileUsage =
        isDetailByName && isComponentVariantFileUsageView(viewText, resolvedItemName, dialog);
      const variantListView =
        isDetailByName &&
        !variantFileUsage &&
        !isComponentFileUsageView(viewText) &&
        (variantsMatch || isComponentVariantDetailView(viewText));

      if (variantFileUsage) {
        const componentSetName = extractComponentSetName(dialog, resolvedItemName);
        const usageStats = parseUsageStats(viewText);
        const filesMatch = viewText.match(/Used in:?\s*([\d,.]+(?:k|m)?)\s+files/i);
        return withAnalyticsDuration({
          modalOpen: true,
          kind: 'components',
          depth: 'variant',
          libraryName,
          itemName: resolvedItemName,
          componentSetName: componentSetName || undefined,
          fileCount: filesMatch ? parseInt(filesMatch[1].replace(/[^\d]/g, ''), 10) || undefined : undefined,
          usedIn: usageStats.usedIn,
          usedBy: usageStats.usedBy,
          analyticsTabSelected: true,
          launchContext,
        }, dialog);
      }
      if (variantListView) {
        return withAnalyticsDuration({
          modalOpen: true,
          kind: 'components',
          depth: 'detail',
          libraryName,
          itemName: resolvedItemName,
          variantCount: resolveVariantCount(dialog, viewText),
          analyticsTabSelected: true,
          launchContext,
        }, dialog);
      }
      if (isDetailByName && isComponentFileUsageView(viewText)) {
        const filesMatch = viewText.match(/(\d+)\s+files?\s+shown/i);
        const usageStats = parseUsageStats(viewText) || parseUsageStats(dialogText);
        return withAnalyticsDuration({
          modalOpen: true,
          kind: 'components',
          depth: 'component',
          libraryName,
          itemName: resolvedItemName,
          fileCount: filesMatch ? parseInt(filesMatch[1], 10) : undefined,
          usedIn: usageStats.usedIn,
          usedBy: usageStats.usedBy,
          analyticsTabSelected: true,
          launchContext,
        }, dialog);
      }
      if (!isDetailByName && (isComponentListView(t) || (listMatch && listMatch[2] === 'components'))) {
        const footerMatch = t.match(/(\d+)\s+library\s+components\s+shown/i);
        return withAnalyticsDuration({
          modalOpen: true,
          kind: 'components',
          depth: 'list',
          libraryName,
          itemCount: listMatch ? parseInt(listMatch[1], 10) : footerMatch ? parseInt(footerMatch[1], 10) : undefined,
          analyticsTabSelected: true,
          launchContext,
        }, dialog);
      }
      if (isDetailByName) {
        const usageStats = parseUsageStats(viewText) || parseUsageStats(dialogText);
        const filesMatch =
          viewText.match(/(\d+)\s+files?\s+shown/i) ||
          viewText.match(/Used in:?\s*([\d,.]+(?:k|m)?)\s+files/i);
        return withAnalyticsDuration({
          modalOpen: true,
          kind: 'components',
          depth: 'component',
          libraryName,
          itemName: resolvedItemName,
          fileCount: filesMatch ? parseInt(String(filesMatch[1]).replace(/[^\d]/g, ''), 10) || undefined : undefined,
          usedIn: usageStats.usedIn,
          usedBy: usageStats.usedBy,
          analyticsTabSelected: true,
          launchContext,
        }, dialog);
      }
    }

    if (kind === 'styles') {
      if (isDetailByName) {
        return withAnalyticsDuration({
          modalOpen: true,
          kind: 'styles',
          depth: 'detail',
          libraryName,
          itemName,
          analyticsTabSelected: true,
          launchContext,
        }, dialog);
      }
      if (
        /Style (statistics|insertions)/i.test(t) ||
        /library styles shown/i.test(t) ||
        (listMatch && listMatch[2] === 'styles')
      ) {
        return withAnalyticsDuration({
          modalOpen: true,
          kind: 'styles',
          depth: 'list',
          libraryName,
          itemCount: listMatch ? parseInt(listMatch[1], 10) : undefined,
          analyticsTabSelected: true,
          launchContext,
        }, dialog);
      }
    }

    if (kind === 'variables') {
      if (isDetailByName || /Sort by column:\s*File name/i.test(t)) {
        return withAnalyticsDuration({
          modalOpen: true,
          kind: 'variables',
          depth: 'detail',
          libraryName,
          itemName: extractItemName(dialog, dialogText),
          analyticsTabSelected: true,
          launchContext,
        }, dialog);
      }
      if (/library variables shown/i.test(t) || /Usage statistics/i.test(t) || hasVariablesSubTabs(dialog)) {
        const variablesSubTab = getVariablesSubTab(dialog) || 'variables';
        const footerCount = listMatch ? parseInt(listMatch[1], 10) : undefined;
        const itemCount =
          variablesSubTab === 'modes' ? countVisibleModeRows(dialog) : footerCount;
        return withAnalyticsDuration({
          modalOpen: true,
          kind: 'variables',
          depth: 'list',
          libraryName,
          itemCount,
          variablesSubTab,
          analyticsTabSelected: true,
          launchContext,
        }, dialog);
      }
    }

    return withAnalyticsDuration({
      modalOpen: true,
      kind,
      depth: 'unknown',
      libraryName,
      analyticsTabSelected,
      launchContext,
    }, dialog);
  }

  function isIconOnlyLine(text) {
    const trimmed = (text || '').trim();
    if (!trimmed) return false;
    const withoutIcons = trimmed.replace(/[❖✦]/g, '').trim();
    return withoutIcons.length === 0;
  }

  function hasAnalyticsLoadingIndicator(dialog) {
    const panel = getAnalyticsPanel(dialog);
    if (!panel) return false;
    if (panel.querySelector('[aria-busy="true"]')) return true;
    if (panel.querySelector('[role="progressbar"]')) return true;
    const text = elementText(panel);
    if (/\bloading\b/i.test(text) && !/library (components|styles|variables) shown/i.test(text)) {
      return true;
    }
    return false;
  }

  function countVisibleListRows(root, kind, variablesSubTab) {
    const seen = kind === 'components' ? new WeakSet() : new Set();
    const items = [];
    if (kind === 'components') {
      extractNameInstanceRows(root, seen, items);
    } else if (kind === 'styles') {
      extractStyleListRows(root, seen, items);
    } else if (kind === 'variables') {
      if (variablesSubTab === 'modes') {
        extractModeListRows(root, seen, items);
      } else {
        extractVariableListRows(root, seen, items);
      }
    }
    return items.length;
  }

  function countVisibleVariantRows(dialog) {
    const scopedRoot = findVariantModalContainer(dialog);
    const seenNames = new Set();
    let count = 0;
    const allElements = scopedRoot.querySelectorAll('*');

    for (const el of allElements) {
      const text = elementText(el);
      if (!text || text.length > 300 || text.length < 12) continue;
      if (el.querySelectorAll('*').length > 15) continue;

      const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
      if (lines.length < 4 || lines.length > 8) continue;

      const last3 = lines.slice(-3);
      const areStats = last3.every(
        (l) => /^[\d,]+$/.test(l) || l === '-' || l === '0' || l === 'N/A'
      );
      if (!areStats) continue;

      let variantName = lines.slice(0, lines.length - 3).join(' ');
      variantName = variantName.replace(/[\n\r\t]+/g, ' ').replace(/\s+/g, ' ').trim();

      if (isIconOnlyLine(variantName)) continue;
      if (/^[\d,\s\-]+$/.test(variantName)) continue;
      if (variantName.toLowerCase().includes('variants')) continue;
      if (variantName.length < 2) continue;
      if (seenNames.has(variantName)) continue;

      seenNames.add(variantName);
      count++;
    }

    return count;
  }

  function countVisibleFileUsageRows(root) {
    const files = [];
    extractFileUsageRows(root, new Set(), files);
    return files.length;
  }

  /**
   * Lightweight probe — no scrolling. Indicates whether Figma has rendered enough
   * of the current analytics view for export/insights to succeed.
   * @param {Element|null} dialog
   * @param {ReturnType<classifyAnalyticsState>} [state]
   * @returns {{ status: 'unknown'|'loading'|'ready', reason?: string, expectedCount?: number, visibleCount?: number }}
   */
  function probeAnalyticsDataReadiness(dialog, state) {
    if (!dialog) return { status: 'unknown' };

    const snapshot = state || classifyAnalyticsState(dialog);
    if (!snapshot.modalOpen || !snapshot.analyticsTabSelected) {
      return { status: 'unknown' };
    }

    if (hasAnalyticsLoadingIndicator(dialog)) {
      return { status: 'loading', reason: 'loading-indicator' };
    }

    if (snapshot.depth === 'list') {
      if (!['components', 'styles', 'variables'].includes(snapshot.kind)) {
        return { status: 'unknown' };
      }

      const expectedCount = snapshot.itemCount;
      if (expectedCount == null) {
        return { status: 'loading', reason: 'waiting-for-count' };
      }

      const visibleCount = countVisibleListRows(
        dialog,
        snapshot.kind,
        snapshot.variablesSubTab || 'variables'
      );
      if (visibleCount === 0) {
        return { status: 'loading', reason: 'waiting-for-rows', expectedCount };
      }

      return { status: 'ready', expectedCount, visibleCount };
    }

    if (snapshot.kind === 'components' && snapshot.depth === 'detail') {
      const visibleCount = countVisibleVariantRows(dialog);
      const expectedCount = snapshot.variantCount ?? (visibleCount > 0 ? visibleCount : undefined);
      if (expectedCount == null) {
        return { status: 'loading', reason: 'waiting-for-count' };
      }

      if (visibleCount === 0) {
        return { status: 'loading', reason: 'waiting-for-rows', expectedCount };
      }

      return { status: 'ready', expectedCount, visibleCount };
    }

    const isFileUsageDepth =
      (snapshot.kind === 'components' &&
        (snapshot.depth === 'variant' || snapshot.depth === 'component')) ||
      (snapshot.kind === 'styles' && snapshot.depth === 'detail') ||
      (snapshot.kind === 'variables' && snapshot.depth === 'detail');

    if (isFileUsageDepth) {
      if (!snapshot.itemName) {
        return { status: 'loading', reason: 'waiting-for-detail' };
      }

      const expectedCount = snapshot.fileCount;
      const visibleCount = countVisibleFileUsageRows(dialog);
      if (visibleCount === 0) {
        return {
          status: 'loading',
          reason: 'waiting-for-rows',
          expectedCount: expectedCount ?? undefined,
        };
      }

      return { status: 'ready', expectedCount, visibleCount };
    }

    return { status: 'unknown' };
  }

  function getAnalyticsState(dialog) {
    if (!dialog) {
      return {
        ...classifyAnalyticsState(null),
        dataReadiness: { status: 'unknown' },
      };
    }

    const state = classifyAnalyticsState(dialog);
    return {
      ...state,
      dataReadiness: probeAnalyticsDataReadiness(dialog, state),
    };
  }

  function sanitizeFilename(name, maxPrefix = 30) {
    const full = name || 'component';
    let hash = 0;
    for (let i = 0; i < full.length; i++) {
      hash = (hash * 31 + full.charCodeAt(i)) >>> 0;
    }
    const suffix = hash.toString(36).slice(0, 6);
    const prefix = full
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, maxPrefix) || 'export';
    return `${prefix}-${suffix}`;
  }

  function findScrollContainer(root) {
    let scrollContainer = null;
    let maxScroll = 0;
    const allElems = root.querySelectorAll('*');
    for (const el of allElems) {
      if (el.scrollHeight > el.clientHeight && el.clientHeight > 100) {
        if (el.tagName !== 'BODY' && el.tagName !== 'HTML') {
          const style = window.getComputedStyle(el);
          const isScrollable =
            style.overflowY === 'auto' ||
            style.overflowY === 'scroll' ||
            style.overflowY === 'overlay' ||
            style.overflow === 'auto' ||
            style.overflow === 'scroll';
          if (isScrollable && el.scrollHeight > maxScroll) {
            maxScroll = el.scrollHeight;
            scrollContainer = el;
          }
        }
      }
    }
    return scrollContainer;
  }

  function rowHasViewAction(row) {
    const buttons = row.querySelectorAll('button, [role="button"]');
    return [...buttons].some((b) =>
      /view (component|style|variable)/i.test(elementText(b) || b.getAttribute('aria-label') || '')
    );
  }

  const LIST_HEADER_BLOCKLIST = new Set([
    'component',
    'style',
    'variable',
    'collection',
    'total instances',
    'used by',
    'sort by',
  ]);

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function collectListWithScroll(root, extractFromRows) {
    extractFromRows();

    const scrollContainer = findScrollContainer(root);
    if (!scrollContainer) return Promise.resolve();

    const resetScrollToTop = () => {
      scrollContainer.scrollTop = 0;
    };

    scrollContainer.scrollTop = 0;

    return sleep(300)
      .then(() => {
        extractFromRows();

        let noNewCount = 0;

        function scrollStep() {
          const lastScroll = scrollContainer.scrollTop;
          scrollContainer.scrollTop += scrollContainer.clientHeight * 0.8;
          return sleep(500).then(() => {
            const newlyFound = extractFromRows();
            if (scrollContainer.scrollTop === lastScroll) return;
            if (!newlyFound) {
              noNewCount++;
              if (noNewCount > 2) return;
            } else {
              noNewCount = 0;
            }
            return scrollStep();
          });
        }

        return scrollStep();
      })
      .finally(resetScrollToTop);
  }

  const ROW_UI_LINES = /^view (component|style|variable)$/i;

  function isStatLine(line) {
    return /^[\d,]+$/.test(line) || line === '-' || line === '0' || line === 'N/A';
  }

  function normalizeStat(val) {
    return val === '-' || val === '' || val === 'N/A' ? '0' : val;
  }

  function cleanListRowLines(lines) {
    return lines.filter(
      (l) =>
        !ROW_UI_LINES.test(l) &&
        l !== '>' &&
        !/^sort by/i.test(l) &&
        !LIST_HEADER_BLOCKLIST.has(l.toLowerCase())
    );
  }

  function extractStyleListRows(root, seenNames, styles) {
    let foundNew = false;
    const rows = root.querySelectorAll('[role="row"], tr, li');
    const candidates = rows.length ? [...rows] : [...root.querySelectorAll('*')];

    for (const el of candidates) {
      const text = elementText(el);
      if (!text || text.length > 400 || text.length < 2) continue;

      if (rows.length && el.children.length > 3 && !rowHasViewAction(el)) continue;

      const lines = cleanListRowLines(text.split('\n').map((l) => l.trim()).filter(Boolean));
      if (lines.length < 2 || lines.length > 12) continue;

      const firstLine = lines[0];
      if (/^[\d,]+$/.test(firstLine) || firstLine === '-' || firstLine === 'N/A') continue;
      if (LIST_HEADER_BLOCKLIST.has(firstLine.toLowerCase()) || firstLine.toLowerCase().includes('total instances')) {
        continue;
      }

      let styleName;
      let instances;
      let inserts = '0';
      let detaches = '0';

      const last3 = lines.slice(-3);
      if (lines.length >= 4 && last3.every(isStatLine)) {
        styleName = lines.slice(0, lines.length - 3).join(' ').replace(/\s+/g, ' ').trim();
        instances = normalizeStat(last3[0]);
        inserts = normalizeStat(last3[1]);
        detaches = normalizeStat(last3[2]);
      } else {
        let numIdx = -1;
        for (let i = lines.length - 1; i >= 1; i--) {
          if (isStatLine(lines[i])) {
            numIdx = i;
            break;
          }
        }
        if (numIdx === -1) continue;
        styleName = lines.slice(0, numIdx).join(' ').replace(/\s+/g, ' ').trim();
        instances = normalizeStat(lines[numIdx]);
      }

      styleName = styleName.replace(/\s+[\d,]+$/, '').trim();
      if (styleName.length < 2 || styleName.length > 120) continue;
      if (UI_BLOCKLIST.has(styleName.toLowerCase())) continue;
      if (isIconOnlyLine(styleName)) continue;
      if (seenNames.has(styleName)) continue;

      seenNames.add(styleName);
      styles.push({ name: styleName, instances, inserts, detaches });
      foundNew = true;
    }
    return foundNew;
  }

  function extractNameInstanceRows(root, seenRows, items) {
    let foundNew = false;
    const rows = root.querySelectorAll('[role="row"], tr, li');
    const candidates = rows.length ? [...rows] : [...root.querySelectorAll('*')];

    for (const el of candidates) {
      if (seenRows.has(el)) continue;

      let text = elementText(el);
      if (!text || text.length > 400 || text.length < 2) continue;

      if (rows.length && el.children.length > 3 && !rowHasViewAction(el)) continue;

      const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
      if (lines.length < 2 || lines.length > 10) continue;

      const firstLine = lines[0];
      if (/^[\d,]+$/.test(firstLine) || firstLine === '-' || firstLine === 'N/A') continue;

      const lowerFirst = firstLine.toLowerCase();
      if (LIST_HEADER_BLOCKLIST.has(lowerFirst) || lowerFirst.includes('total instances')) continue;

      let numIdx = -1;
      for (let i = 1; i < lines.length; i++) {
        if (/^[\d,]+$/.test(lines[i]) || lines[i] === '-' || lines[i] === '0') {
          numIdx = i;
          break;
        }
      }
      if (numIdx === -1) continue;

      let itemName = firstLine.replace(/\s+[\d,]+$/, '').trim();
      if (itemName.length < 2 || itemName.length > 120) continue;
      if (UI_BLOCKLIST.has(itemName.toLowerCase())) continue;
      if (isIconOnlyLine(itemName)) continue;

      let extraText = '';
      if (numIdx > 1) extraText = lines.slice(1, numIdx).join(' ');

      const instanceStr = lines[numIdx];
      const instanceCount = instanceStr === '-' || instanceStr === '' ? '0' : instanceStr;

      seenRows.add(el);
      items.push({ name: itemName, instances: instanceCount, badge: extraText });
      foundNew = true;
    }
    return foundNew;
  }

  function stripLeadingIconLines(lines) {
    const result = [...lines];
    while (result.length && isIconOnlyLine(result[0])) {
      result.shift();
    }
    return result;
  }

  function extractVariableListRows(root, seenKeys, variables) {
    let foundNew = false;
    const rows = root.querySelectorAll('[role="row"], tr, li');
    const candidates = rows.length ? [...rows] : [...root.querySelectorAll('*')];

    for (const el of candidates) {
      const text = elementText(el);
      if (!text || text.length > 400 || text.length < 2) continue;

      if (rows.length && el.children.length > 3 && !rowHasViewAction(el)) continue;

      let lines = cleanListRowLines(text.split('\n').map((l) => l.trim()).filter(Boolean));
      lines = stripLeadingIconLines(lines);
      if (lines.length < 3 || lines.length > 12) continue;

      const firstLine = lines[0];
      if (/^[\d,]+$/.test(firstLine) || LIST_HEADER_BLOCKLIST.has(firstLine.toLowerCase())) continue;
      if (/^mode name$/i.test(firstLine)) continue;

      let varName;
      let collection;
      let instances;
      let inserts = '0';
      let detaches = '0';

      const last3 = lines.slice(-3);
      if (lines.length >= 5 && last3.every(isStatLine)) {
        collection = lines[lines.length - 4];
        varName = lines.slice(0, lines.length - 4).join(' ').replace(/\s+/g, ' ').trim();
        instances = normalizeStat(last3[0]);
        inserts = normalizeStat(last3[1]);
        detaches = normalizeStat(last3[2]);
      } else {
        let numIdx = -1;
        for (let i = lines.length - 1; i >= 1; i--) {
          if (isStatLine(lines[i])) {
            numIdx = i;
            break;
          }
        }
        if (numIdx < 2) continue;
        collection = lines[numIdx - 1];
        varName = lines.slice(0, numIdx - 1).join(' ').replace(/\s+/g, ' ').trim();
        instances = normalizeStat(lines[numIdx]);
      }

      if (!collection || collection.length > 120) continue;
      if (LIST_HEADER_BLOCKLIST.has(collection.toLowerCase())) continue;
      if (varName.length < 2 || varName.length > 120) continue;
      if (UI_BLOCKLIST.has(varName.toLowerCase())) continue;
      if (isIconOnlyLine(varName)) continue;

      const dedupeKey = `name:${varName}|${collection}`;
      if (seenKeys.has(dedupeKey)) continue;
      seenKeys.add(dedupeKey);

      variables.push({
        name: varName,
        collection,
        instances,
        inserts,
        detaches,
      });
      foundNew = true;
    }
    return foundNew;
  }

  function countVisibleModeRows(root) {
    const modes = [];
    extractModeListRows(root, new Set(), modes);
    return modes.length > 0 ? modes.length : undefined;
  }

  function extractModeListRows(root, seenKeys, modes) {
    let foundNew = false;
    const rows = root.querySelectorAll('[role="row"], tr, li');
    const candidates = rows.length ? [...rows] : [...root.querySelectorAll('*')];

    for (const el of candidates) {
      const text = elementText(el);
      if (!text || text.length > 400 || text.length < 2) continue;

      if (rows.length && el.children.length > 3 && !rowHasViewAction(el)) continue;

      let lines = cleanListRowLines(text.split('\n').map((l) => l.trim()).filter(Boolean));
      lines = stripLeadingIconLines(lines);
      if (lines.length < 3 || lines.length > 8) continue;

      const lastLine = lines[lines.length - 1];
      if (!isStatLine(lastLine)) continue;

      const collection = lines[lines.length - 2];
      const modeName = lines.slice(0, lines.length - 2).join(' ').replace(/\s+/g, ' ').trim();

      if (!collection || collection.length > 120) continue;
      if (LIST_HEADER_BLOCKLIST.has(collection.toLowerCase())) continue;
      if (/^mode name$/i.test(modeName)) continue;
      if (modeName.length < 1 || modeName.length > 120) continue;
      if (UI_BLOCKLIST.has(modeName.toLowerCase())) continue;
      if (isIconOnlyLine(modeName)) continue;

      const dedupeKey = `mode:${modeName}|${collection}`;
      if (seenKeys.has(dedupeKey)) continue;
      seenKeys.add(dedupeKey);

      modes.push({
        mode: modeName,
        collection,
        instances: normalizeStat(lastLine),
      });
      foundNew = true;
    }
    return foundNew;
  }

  function scrapeComponentListFromPage(modalRoot) {
    try {
      const root = modalRoot || findAnalyticsDialog();
      if (!root) {
        return Promise.resolve({
          error: 'No Library Analytics modal found. Open Library Analytics in Figma first.',
        });
      }

      const state = classifyAnalyticsState(root);
      if (state.kind !== 'components' || state.depth !== 'list') {
        return Promise.resolve({
          error: 'Not on the components list view. Switch Type to Components and stay on the list.',
        });
      }

      const components = [];
      const seenRows = new WeakSet();
      const extractFromRows = () => extractNameInstanceRows(root, seenRows, components);

      return collectListWithScroll(root, extractFromRows).then(() => {
        if (components.length === 0) {
          return {
            error: 'No components found. Make sure you\'re on the Library Analytics components list view.',
          };
        }

        return {
          components,
          libraryName: getLibraryName(root),
        };
      });
    } catch (err) {
      return Promise.resolve({ error: 'Error scanning: ' + err.message });
    }
  }

  function scrapeStyleListFromPage(modalRoot) {
    try {
      const root = modalRoot || findAnalyticsDialog();
      if (!root) {
        return Promise.resolve({
          error: 'No Library Analytics modal found. Open Library Analytics in Figma first.',
        });
      }

      const state = classifyAnalyticsState(root);
      if (state.kind !== 'styles' || state.depth !== 'list') {
        return Promise.resolve({
          error: 'Not on the styles list view. Switch Type to Styles and stay on the list.',
        });
      }

      const styles = [];
      const seenNames = new Set();
      const extractFromRows = () => extractStyleListRows(root, seenNames, styles);

      return collectListWithScroll(root, extractFromRows).then(() => {
        if (styles.length === 0) {
          return {
            error: 'No styles found. Make sure you\'re on the Library Analytics styles list view.',
          };
        }

        return {
          styles,
          libraryName: getLibraryName(root),
        };
      });
    } catch (err) {
      return Promise.resolve({ error: 'Error scanning: ' + err.message });
    }
  }

  function scrapeVariableListFromPage(modalRoot) {
    try {
      const root = modalRoot || findAnalyticsDialog();
      if (!root) {
        return Promise.resolve({
          error: 'No Library Analytics modal found. Open Library Analytics in Figma first.',
        });
      }

      const state = classifyAnalyticsState(root);
      if (state.kind !== 'variables' || state.depth !== 'list') {
        return Promise.resolve({
          error: 'Not on the variables list view. Switch Type to Variables and stay on the list.',
        });
      }

      const subTab = getVariablesSubTab(root) || state.variablesSubTab || 'variables';
      const entries = [];
      const seenKeys = new Set();
      const extractFromRows =
        subTab === 'modes'
          ? () => extractModeListRows(root, seenKeys, entries)
          : () => extractVariableListRows(root, seenKeys, entries);

      return collectListWithScroll(root, extractFromRows).then(() => {
        if (entries.length === 0) {
          const tabLabel = subTab === 'modes' ? 'Modes' : 'Variables';
          return {
            error: `No ${tabLabel.toLowerCase()} found. Make sure the ${tabLabel} sub-tab is selected in Library Analytics.`,
          };
        }

        return {
          variablesSubTab: subTab,
          variables: subTab === 'variables' ? entries : undefined,
          modes: subTab === 'modes' ? entries : undefined,
          entryCount: entries.length,
          libraryName: getLibraryName(root),
        };
      });
    } catch (err) {
      return Promise.resolve({ error: 'Error scanning: ' + err.message });
    }
  }

  function parseFileUsageRow(lines) {
    if (lines.length < 3) return null;

    const last = lines[lines.length - 1];
    const secondLast = lines[lines.length - 2];

    if (lines.length >= 4 && isStatLine(secondLast) && !isStatLine(last)) {
      const team = lines[lines.length - 3];
      const fileName = lines.slice(0, lines.length - 3).join(' ').trim();
      return { fileName, team, instances: normalizeStat(secondLast), lastModified: last };
    }

    if (isStatLine(last) && secondLast && !isStatLine(secondLast)) {
      const fileName = lines.slice(0, lines.length - 2).join(' ').trim();
      return { fileName, team: secondLast, instances: normalizeStat(last) };
    }

    return null;
  }

  function getFileUsageRowColumns(row) {
    const ariaCells = [...row.querySelectorAll('[role="cell"], [role="gridcell"], td, th')];
    if (ariaCells.length >= 3) {
      return ariaCells.map((el) => elementText(el).trim()).filter(Boolean);
    }

    return [...row.children]
      .map((el) => elementText(el).trim())
      .filter(Boolean);
  }

  function parseFileUsageColumns(cols) {
    if (!cols || cols.length < 3) return null;

    const first = cols[0];
    if (/^(file name|team|instances|last modified)$/i.test(first)) return null;
    if (/^sort by column/i.test(first)) return null;
    if (/^(total|used by|used in)\b/i.test(first)) return null;

    if (cols.length >= 4 && isStatLine(cols[cols.length - 2]) && !isStatLine(cols[cols.length - 1])) {
      const fileName =
        cols.length === 4 ? cols[0] : cols.slice(0, cols.length - 3).join(' ').trim();
      return {
        fileName,
        team: cols[cols.length - 3],
        instances: normalizeStat(cols[cols.length - 2]),
        lastModified: cols[cols.length - 1],
      };
    }

    if (cols.length === 3 && isStatLine(cols[2])) {
      return {
        fileName: cols[0],
        team: cols[1],
        instances: normalizeStat(cols[2]),
      };
    }

    return null;
  }

  function extractFileUsageRows(root, seenKeys, files) {
    let foundNew = false;
    const rows = root.querySelectorAll('[role="row"], tr');

    for (const row of rows) {
      if (rowHasViewAction(row)) continue;

      let parsed = parseFileUsageColumns(getFileUsageRowColumns(row));
      if (!parsed) {
        const text = elementText(row);
        if (!text || text.length > 400) continue;
        const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
        parsed = parseFileUsageRow(lines);
      }
      if (!parsed) continue;

      const { fileName, team, instances, lastModified } = parsed;
      if (fileName.length < 2 || fileName.length > 200) continue;
      if (/sort by column/i.test(fileName)) continue;

      const key = `${fileName}|${team}|${instances}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      const file = { name: fileName, team, instances };
      if (lastModified) file.lastModified = lastModified;
      files.push(file);
      foundNew = true;
    }

    return foundNew;
  }

  function scrapeFileUsageDetailFromPage(modalRoot, expectedKind) {
    try {
      const dialog = modalRoot || findAnalyticsDialog();
      if (!dialog) {
        return Promise.resolve({ error: 'No Library Analytics modal found.' });
      }

      const state = classifyAnalyticsState(dialog);
      const isComponentFileUsage = expectedKind === 'components';

      if (isComponentFileUsage) {
        if (state.kind !== 'components' || (state.depth !== 'variant' && state.depth !== 'component')) {
          return Promise.resolve({ error: 'Not on a component file usage view. Click a component first.' });
        }
      } else {
        const kindLabel = expectedKind === 'styles' ? 'style' : 'variable';
        if (state.kind !== expectedKind || state.depth !== 'detail') {
          return Promise.resolve({
            error: `Not on a ${kindLabel} detail view. Click a ${kindLabel} first.`,
          });
        }
      }

      const dialogText = elementText(dialog);
      const itemName = extractItemName(dialog, dialogText);

      let totalInstances = '';
      let usedBy = '';
      let usedIn = '';

      const statsMatch = dialogText.match(/Total:?\s*([\d,.]+(?:k|m)?)\s*instances/i);
      if (statsMatch) totalInstances = statsMatch[1];
      const teamsMatch = dialogText.match(/Used by:?\s*([\d,.]+(?:k|m)?)\s*teams/i);
      if (teamsMatch) usedBy = teamsMatch[1];
      const filesMatch = dialogText.match(/Used in:?\s*([\d,.]+(?:k|m)?)\s*files/i);
      if (filesMatch) usedIn = filesMatch[1];

      const files = [];
      const seenKeys = new Set();
      const extractFromRows = () => extractFileUsageRows(dialog, seenKeys, files);

      return collectListWithScroll(dialog, extractFromRows).then(() => {
        if (files.length === 0) {
          return { error: 'No file usage rows found on this view.' };
        }

        return {
          itemName,
          itemKind: isComponentFileUsage
            ? state.depth === 'component'
              ? 'component'
              : 'component-variant'
            : expectedKind,
          libraryName: getLibraryName(dialog),
          totalInstances,
          usedBy,
          usedIn,
          files,
          scrapedAt: new Date().toISOString(),
        };
      });
    } catch (err) {
      return Promise.resolve({ error: 'Scraping error: ' + err.message });
    }
  }

  function findVariantModalContainer(root) {
    let modalContainer = root;
    const allNodes = root.querySelectorAll('*');
    for (const el of allNodes) {
      const txt = elementText(el);
      if (
        txt?.includes('Inserts (30 days)') &&
        /\bvariants\b/i.test(txt) &&
        !/Sort by column:\s*File name/i.test(txt)
      ) {
        modalContainer = el;
      }
    }
    return modalContainer;
  }

  function scrapeLibraryAnalyticsFromPage(modalRoot) {
    try {
      const dialog = modalRoot || findAnalyticsDialog();
      if (!dialog) {
        return { error: 'No Library Analytics modal found.' };
      }

      const state = classifyAnalyticsState(dialog);
      if (state.kind !== 'components' || state.depth === 'list') {
        return { error: 'Not on a component variant detail view. Click a component first.' };
      }
      if (state.depth === 'component') {
        const name = state.itemName || 'This component';
        return {
          error: `${name} has no variants. Scrape only works on component sets with variant analytics.`,
        };
      }
      if (state.depth !== 'detail') {
        return { error: 'Not on a component variant detail view. Click a component first.' };
      }

      const scopedRoot = findVariantModalContainer(dialog);
      const dialogText = elementText(dialog);
      const scopedText = elementText(scopedRoot);
      const allText = scopedText || dialogText;

      const componentName = extractItemName(dialog, dialogText);
      const variantsMatch = dialogText.match(/Showing\s*(\d+)\s*variants/i);
      const expectedCount = variantsMatch ? parseInt(variantsMatch[1], 10) : 0;

      let totalInstances = '';
      let usedBy = '';
      let usedIn = '';

      const statsMatch = allText.match(/Total\s*([\d,.]+k?)\s*instances/i);
      if (statsMatch) totalInstances = statsMatch[1];
      const teamsMatch = allText.match(/Used by\s*([\d,.]+k?)\s*teams/i);
      if (teamsMatch) usedBy = teamsMatch[1];
      const filesMatch = allText.match(/Used in\s*([\d,.]+k?)\s*files/i);
      if (filesMatch) usedIn = filesMatch[1];

      const variants = [];
      const seenNames = new Set();
      const allElements = scopedRoot.querySelectorAll('*');

      for (const el of allElements) {
        const text = elementText(el);
        if (!text || text.length > 300 || text.length < 12) continue;
        if (el.querySelectorAll('*').length > 15) continue;

        const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
        if (lines.length < 4 || lines.length > 8) continue;

        const last3 = lines.slice(-3);
        const areStats = last3.every(
          (l) => /^[\d,]+$/.test(l) || l === '-' || l === '0' || l === 'N/A'
        );
        if (!areStats) continue;

        let variantName = lines.slice(0, lines.length - 3).join(' ');
        variantName = variantName.replace(/[\n\r\t]+/g, ' ').replace(/\s+/g, ' ').trim();

        if (isIconOnlyLine(variantName)) continue;
        if (/^[\d,\s\-]+$/.test(variantName)) continue;
        if (variantName.toLowerCase().includes('variants')) continue;
        if (variantName.length < 2) continue;
        if (seenNames.has(variantName)) continue;

        seenNames.add(variantName);
        variants.push({
          name: variantName,
          totalInstances: last3[0] === '-' || last3[0] === 'N/A' ? '0' : last3[0],
          inserts: last3[1] === '-' || last3[1] === 'N/A' ? '0' : last3[1],
          detaches: last3[2] === '-' || last3[2] === 'N/A' ? '0' : last3[2],
        });
      }

      if (expectedCount === 0 && variants.length === 0) {
        return {
          error: `${componentName} has no variants. Scrape only works on component sets with variant analytics.`,
        };
      }
      if (variants.length === 0) {
        return { error: 'No variants found. Make sure you\'re on the variant detail view for a component.' };
      }

      return {
        componentName,
        libraryName: getLibraryName(dialog),
        totalInstances,
        usedBy,
        usedIn,
        viewType: 'All Variants',
        expectedCount: expectedCount || variants.length,
        variants,
        scrapedAt: new Date().toISOString(),
      };
    } catch (err) {
      return { error: 'Scraping error: ' + err.message };
    }
  }

  const api = {
    __build: 'menu-value-v5',
    findAnalyticsDialog,
    getTypeKind,
    setTypeKind,
    tabLabel,
    isAnalyticsTabSelected,
    selectAnalyticsTab,
    getLaunchContext,
    classifyAnalyticsState,
    getAnalyticsState,
    probeAnalyticsDataReadiness,
    extractItemName,
    extractComponentSetName,
    parseUsageStats,
    getLibraryName,
    getVariablesSubTab,
    setVariablesSubTab,
    getAnalyticsDuration,
    setAnalyticsDuration,
    sanitizeFilename,
    normalizeLineTerminators,
    isIconOnlyLine,
    scrapeComponentListFromPage,
    scrapeStyleListFromPage,
    scrapeVariableListFromPage,
    scrapeFileUsageDetailFromPage,
    scrapeLibraryAnalyticsFromPage,
  };

  root.FigmaAnalyticsScraper = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
