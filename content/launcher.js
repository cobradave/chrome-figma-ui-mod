/**
 * Always-on Library Analytics launcher — injects a side-panel button in modal headers
 * (Library Analytics and the org-level Libraries browser).
 */
(function () {
  'use strict';

  if (window.__figmaAnalyticsLauncherStop) {
    window.__figmaAnalyticsLauncherStop();
  }

  const Scraper = window.FigmaAnalyticsScraper;
  if (!Scraper) {
    console.error('[FigmaAnalyticsExport] scraper.js must be injected before launcher.js');
    return;
  }

  const LAUNCHER_WRAP_CLASS = 'figma-analytics-export-launcher-wrap';
  const LAUNCHER_BTN_CLASS = 'figma-analytics-export-launcher';
  const LAUNCHER_ICON_CLASS = 'figma-analytics-export-launcher__icon';
  const LAUNCHER_LABEL_CLASS = 'figma-analytics-export-launcher__label';
  const STYLE_ID = 'figma-analytics-export-launcher-styles-v3';
  const DEBOUNCE_MS = 200;
  const POLL_MS = 1000;
  const EXTENSION_NAME = chrome.runtime.getManifest().name;
  const ICON_URL = chrome.runtime.getURL('favicon_48.png');
  const ICON_DISPLAY_PX = 16;

  let bodyObserver = null;
  let debounceTimer = null;
  let pollTimer = null;
  let isUpdating = false;

  function isVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function tabLabel(el) {
    const raw = (el?.innerText ?? el?.textContent ?? '').trim();
    return (raw.split('\n').map((line) => line.trim()).filter(Boolean)[0] || raw).trim();
  }

  function findModalShell(dialog) {
    if (!dialog) return null;
    return (
      dialog.closest('[class*="header_modal--modal--"]') ||
      dialog.closest('[class*="org_view_modal--"]') ||
      dialog.closest('[class*="dsa_file_view_modal--"]') ||
      dialog
    );
  }

  function hasOrgLibrariesModalChrome(root) {
    if (
      !root.querySelector(
        '#asset-panel-search-bar-input, [data-testid="asset-panel-search-bar-input"]'
      )
    ) {
      return false;
    }
    if (!root.querySelector('[class*="overview_stats_view--overviewStats--"]')) return false;
    if (!root.querySelector('[class*="subscription_list_workspace_rows--"]')) return false;

    const tabLabels = [...root.querySelectorAll('[role="tab"]')].map((tab) =>
      tabLabel(tab).toLowerCase()
    );
    if (tabLabels.includes('analytics')) return false;

    return tabLabels.includes('libraries') || tabLabels.length === 0;
  }

  function findOrgLibrariesModal() {
    const search = document.querySelector(
      '#asset-panel-search-bar-input, [data-testid="asset-panel-search-bar-input"]'
    );
    if (!search || !isVisible(search)) return null;

    const candidates = [
      search.closest('[role="dialog"]'),
      search.closest('[class*="org_view_modal--"]'),
    ].filter(Boolean);

    return candidates.find((candidate) => isVisible(candidate) && hasOrgLibrariesModalChrome(candidate)) || null;
  }

  function findRootWithCloseButton(start) {
    let node = start;
    while (node && node !== document.documentElement) {
      if (findCloseButton(node)) return node;
      node = node.parentElement;
    }
    return null;
  }

  function launcherRootForDialog(dialog) {
    const closeHost = findRootWithCloseButton(dialog);
    if (closeHost) return { dialog, root: closeHost };

    const shell = findModalShell(dialog);
    const root = findCloseButton(shell) && !findCloseButton(dialog) ? shell : dialog;
    return { dialog, root: root || shell || dialog };
  }

  function findLauncherTargets() {
    const targets = [];
    const seen = new Set();

    const analyticsDialog = Scraper.findAnalyticsDialog();
    if (analyticsDialog) {
      const target = launcherRootForDialog(analyticsDialog);
      targets.push({ id: 'analytics', ...target });
      seen.add(target.root);
    }

    const orgLibrariesDialog = findOrgLibrariesModal();
    if (orgLibrariesDialog) {
      const target = launcherRootForDialog(orgLibrariesDialog);
      if (!seen.has(target.root)) {
        targets.push({ id: 'org-libraries', ...target });
      }
    }

    return targets;
  }

  function findCloseButton(root) {
    if (!root) return null;

    const labeled =
      root.querySelector('[aria-label="Close"]') ||
      root.querySelector('[aria-label="close"]') ||
      root.querySelector('button[class*="close--"]');

    if (labeled) return labeled;

    return (
      [...root.querySelectorAll('button')].find((btn) => {
        if (btn.className.includes(LAUNCHER_BTN_CLASS)) return false;
        const label = (btn.getAttribute('aria-label') || btn.innerText || '').trim();
        return /^close$/i.test(label);
      }) || null
    );
  }

  function findMountAnchor(root) {
    const closeBtn = findCloseButton(root);
    if (closeBtn?.parentElement?.isConnected) {
      return { mount: closeBtn.parentElement, before: closeBtn };
    }

    const fplHeader = root.querySelector('[data-fpl-header="true"]');
    if (fplHeader?.isConnected) {
      const closeBtn = findCloseButton(fplHeader) || findCloseButton(root);
      if (closeBtn?.parentElement === fplHeader) {
        return { mount: fplHeader, before: closeBtn };
      }
      return { mount: fplHeader, before: null };
    }

    const header =
      root.querySelector('[class*="subscription_file_view_header--componentOrFileName--"]')?.parentElement ||
      root.querySelector('[class*="asset_file_view_header--"]:not([class*="--name--"])') ||
      root.querySelector('[class*="header_modal--header--"]') ||
      root.querySelector('[class*="dsa_file_view_modal--header--"]');

    if (header?.isConnected) {
      return { mount: header, before: null };
    }

    const title = root.querySelector(
      '[class*="subscription_file_view_header--componentOrFileName--"], [class*="asset_file_view_header--name--"], [class*="library_item_view--title--"], h1, h2'
    );
    if (title?.parentElement?.isConnected) {
      return { mount: title.parentElement, before: null };
    }

    return null;
  }

  function mountLauncher(wrap, anchor) {
    if (!anchor?.mount?.isConnected) return false;

    let mount = anchor.mount;
    let before = anchor.before;

    if (before) {
      if (!before.isConnected || before.parentElement !== mount) {
        const closeBtn = findCloseButton(mount) || findCloseButton(mount.closest('[role="dialog"]') || mount);
        if (closeBtn?.parentElement?.isConnected) {
          mount = closeBtn.parentElement;
          before = closeBtn;
        } else {
          before = null;
        }
      }
    }

    try {
      if (before?.isConnected && before.parentElement === mount) {
        mount.insertBefore(wrap, before);
      } else {
        mount.appendChild(wrap);
      }
      return wrap.isConnected;
    } catch (_) {
      try {
        if (wrap.isConnected) wrap.remove();
        mount.appendChild(wrap);
        return wrap.isConnected;
      } catch (_) {
        wrap.remove();
        return false;
      }
    }
  }

  function sampleNativeControlStyle(root) {
    const ref =
      root.querySelector('[role="combobox"][aria-label="Type"], [role="combobox"][aria-label="type"]') ||
      [...root.querySelectorAll('[role="combobox"]')].find((el) => el.offsetParent !== null);

    if (!ref) return null;

    const cs = getComputedStyle(ref);
    return {
      height: cs.height,
      borderRadius: cs.borderRadius,
      border: cs.border,
      backgroundColor: cs.backgroundColor,
      color: cs.color,
      fontSize: cs.fontSize,
      fontFamily: cs.fontFamily,
      fontWeight: cs.fontWeight,
      lineHeight: cs.lineHeight,
    };
  }

  function ensureStyles() {
    document.getElementById('figma-analytics-export-launcher-styles')?.remove();
    document.getElementById('figma-analytics-export-launcher-styles-v2')?.remove();
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .${LAUNCHER_WRAP_CLASS} {
        display: inline-flex;
        align-items: center;
        margin-right: 8px;
        flex-shrink: 0;
        position: relative;
        z-index: 2;
      }

      .${LAUNCHER_BTN_CLASS} {
        all: unset;
        box-sizing: border-box;
        display: inline-flex;
        align-items: stretch;
        height: 22px;
        border: 1px solid var(--color-border, #e6e6e6);
        border-radius: var(--radius-medium, .3125rem);
        overflow: hidden;
        cursor: pointer;
        white-space: nowrap;
        flex-shrink: 0;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      }

      .${LAUNCHER_BTN_CLASS}:hover .${LAUNCHER_LABEL_CLASS} {
        background: #f3f3f3;
      }

      .${LAUNCHER_BTN_CLASS}:active .${LAUNCHER_LABEL_CLASS} {
        background: #ebebeb;
      }

      .${LAUNCHER_BTN_CLASS}:focus-visible {
        outline: 2px solid #0d99ff;
        outline-offset: 1px;
      }

      .${LAUNCHER_ICON_CLASS} {
        display: flex;
        align-items: center;
        justify-content: center;
        background: #000;
        padding: 0 2px;
        flex-shrink: 0;
      }

      .${LAUNCHER_ICON_CLASS} img {
        display: block;
        width: ${ICON_DISPLAY_PX}px;
        height: ${ICON_DISPLAY_PX}px;
        flex-shrink: 0;
      }

      .${LAUNCHER_LABEL_CLASS} {
        display: flex;
        align-items: center;
        padding: 0 6px;
        background: var(--color-bg, #FFF);
        color: rgba(0, 0, 0, 0.85);
        font-size: 11px;
        font-weight: 500;
        line-height: 1;
        letter-spacing: 0.01em;
      }
    `;
    document.head.appendChild(style);
  }

  function applySampledStyle(btn, root) {
    const sampled = sampleNativeControlStyle(root);
    if (!sampled) return;

    const label = btn.querySelector(`.${LAUNCHER_LABEL_CLASS}`);
    if (sampled.height && sampled.height !== 'auto') btn.style.height = sampled.height;
    if (sampled.borderRadius) btn.style.borderRadius = sampled.borderRadius;
    if (sampled.border && sampled.border !== 'none') btn.style.border = sampled.border;
    if (label) {
      if (sampled.fontSize) label.style.fontSize = sampled.fontSize;
      if (sampled.fontFamily) label.style.fontFamily = sampled.fontFamily;
      if (sampled.fontWeight) label.style.fontWeight = sampled.fontWeight;
      if (sampled.color) label.style.color = sampled.color;
    }
  }

  function removeLauncher(activeTargetIds = null) {
    document.querySelectorAll(`.${LAUNCHER_WRAP_CLASS}`).forEach((el) => {
      if (activeTargetIds && activeTargetIds.has(el.dataset.launcherTarget)) return;
      el.remove();
    });
  }

  function openSidePanel() {
    try {
      chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' });
    } catch (_) {
      /* extension context invalidated */
    }
  }

  function createLauncherButton(root) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = LAUNCHER_BTN_CLASS;
    btn.setAttribute('aria-label', `Open ${EXTENSION_NAME} side panel`);

    const iconWrap = document.createElement('span');
    iconWrap.className = LAUNCHER_ICON_CLASS;

    const icon = document.createElement('img');
    icon.src = ICON_URL;
    icon.alt = '';
    icon.width = ICON_DISPLAY_PX;
    icon.height = ICON_DISPLAY_PX;
    icon.draggable = false;

    const label = document.createElement('span');
    label.className = LAUNCHER_LABEL_CLASS;
    label.textContent = EXTENSION_NAME;

    iconWrap.appendChild(icon);
    btn.append(iconWrap, label);
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openSidePanel();
    });

    applySampledStyle(btn, root);
    return btn;
  }

  function pauseObserver() {
    if (bodyObserver) bodyObserver.disconnect();
  }

  function resumeObserver() {
    if (!bodyObserver || !document.body) return;
    bodyObserver.observe(document.body, { childList: true, subtree: true });
  }

  function updateLauncher() {
    if (isUpdating) return;
    isUpdating = true;

    try {
      const targets = findLauncherTargets();
      const activeTargetIds = new Set(targets.map((target) => target.id));

      if (!targets.length) {
        removeLauncher();
        return;
      }

      removeLauncher(activeTargetIds);
      ensureStyles();

      for (const target of targets) {
        let wrap = document.querySelector(
          `.${LAUNCHER_WRAP_CLASS}[data-launcher-target="${target.id}"]`
        );
        if (wrap?.querySelector(`.${LAUNCHER_ICON_CLASS}`) && wrap.isConnected) continue;
        if (wrap) wrap.remove();

        const anchor = findMountAnchor(target.root);
        if (!anchor?.mount) continue;

        wrap = document.createElement('div');
        wrap.className = LAUNCHER_WRAP_CLASS;
        wrap.dataset.launcherTarget = target.id;
        wrap.appendChild(createLauncherButton(target.root));

        pauseObserver();
        try {
          mountLauncher(wrap, anchor);
        } finally {
          resumeObserver();
        }
      }
    } finally {
      isUpdating = false;
    }
  }

  function debouncedUpdate() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(updateLauncher, DEBOUNCE_MS);
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(updateLauncher, POLL_MS);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function stop() {
    clearTimeout(debounceTimer);
    stopPolling();
    pauseObserver();
    bodyObserver = null;
    removeLauncher();
    isUpdating = false;
  }

  function start() {
    stop();
    bodyObserver = new MutationObserver(debouncedUpdate);
    resumeObserver();
    updateLauncher();
    startPolling();
  }

  window.__figmaAnalyticsLauncherStop = stop;
  window.__figmaAnalyticsLauncherUpdate = updateLauncher;

  function clickAnalyticsTabPageContext() {
    const labelOf = (el) => {
      const raw = (el?.innerText ?? el?.textContent ?? '').trim();
      return (raw.split('\n').map((l) => l.trim()).filter(Boolean)[0] || raw).trim();
    };

    const tablists = [...document.querySelectorAll('[role="tablist"]')].filter((list) => {
      const labels = [...list.querySelectorAll('[role="tab"], button')].map((el) =>
        labelOf(el).toLowerCase()
      );
      return labels.includes('analytics') && (labels.includes('overview') || labels.includes('libraries'));
    });

    for (const list of tablists) {
      const btn = [...list.querySelectorAll('button[role="tab"], [role="tab"]')].find(
        (el) => labelOf(el).toLowerCase() === 'analytics'
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
    if (message.type === 'SELECT_ANALYTICS_TAB') {
      sendResponse(clickAnalyticsTabPageContext());
      return true;
    }
    return false;
  });

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
})();
