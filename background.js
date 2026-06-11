// Service worker: side panel + detector lifecycle

importScripts('shared/figma-url.js');

const injectedTabs = new Set();
let activePanelPort = null;

async function syncSidePanelForTab(tabId, url) {
  if (!tabId || !url) return;

  const isFigma = isFigmaUrl(url);
  try {
    if (isFigma) {
      await chrome.action.setPopup({ tabId, popup: '' });
      await chrome.sidePanel.setOptions({
        tabId,
        path: 'popup.html',
        enabled: true,
      });
    } else {
      await chrome.action.setPopup({ tabId, popup: 'unsupported.html' });
      await chrome.sidePanel.setOptions({
        tabId,
        enabled: false,
      });
    }
  } catch (_) {
    /* restricted pages (chrome://, etc.) may reject setPopup */
  }
}

chrome.action.onClicked.addListener((tab) => {
  if (!tab?.id || !isFigmaUrl(tab.url)) return;
  chrome.sidePanel.open({ tabId: tab.id });
});

chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (!tab.url) return;
  await syncSidePanelForTab(tabId, tab.url);
});

async function injectDetector(tabId) {
  if (!tabId || injectedTabs.has(tabId)) return;

  try {
    const [{ result: alreadyLoaded } = {}] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => Boolean(window.__figmaAnalyticsDetectorLoaded),
    });
    if (alreadyLoaded) {
      injectedTabs.add(tabId);
      return;
    }

    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['scraper.js', 'shared/export-format.js', 'content/detector.js'],
    });
    injectedTabs.add(tabId);
  } catch (err) {
    console.warn('[FigmaAnalyticsExport] inject failed:', err.message);
  }
}

async function activateDetector(tabId) {
  await injectDetector(tabId);
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        document.documentElement.dataset.figmaAnalyticsActivate = '1';
        chrome.runtime.sendMessage({ type: 'ACTIVATE_DETECTOR' });
      },
    });
  } catch (err) {
    console.warn('[FigmaAnalyticsExport] activate failed:', err.message);
  }
}

async function deactivateDetector(tabId) {
  if (!tabId) return;
  injectedTabs.delete(tabId);
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        document.documentElement.dataset.figmaAnalyticsActivate = '0';
        chrome.runtime.sendMessage({ type: 'DEACTIVATE_DETECTOR' });
      },
    });
  } catch (_) {
    /* tab may be gone */
  }
}

/** Page-context click — same as the DevTools console test that works on Figma React tabs. */
async function clickAnalyticsTabMainWorld(tabId) {
  if (!tabId) {
    return { ok: false, error: 'No tab id.' };
  }

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: () => {
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
        btn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        btn.focus({ preventScroll: true });
        btn.click();
        return { ok: true, changed: true, method: 'main-world' };
      }

      return { ok: false, error: 'Analytics tab button not found in page context.' };
    },
  });

  return results[0]?.result ?? { ok: false, error: 'No result from page script.' };
}

/** Run a scraper action in Figma's page context (React handlers need MAIN world). */
async function runScraperActionMainWorld(tabId, action, arg) {
  if (!tabId) {
    return { ok: false, error: 'No tab id.' };
  }

  // Always inject so extension reload picks up scraper changes without refreshing Figma.
  await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    files: ['scraper.js'],
  });

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    args: [action, arg],
    func: (actionName, actionArg) => {
      const S = window.FigmaAnalyticsScraper;
      if (!S) {
        return { ok: false, error: 'Scraper not available in page context.' };
      }
      const dialog = S.findAnalyticsDialog();
      switch (actionName) {
        case 'type':
          return S.setTypeKind(dialog, actionArg);
        case 'duration':
          return S.setAnalyticsDuration(dialog, actionArg);
        case 'variables-subtab':
          return S.setVariablesSubTab(dialog, actionArg);
        default:
          return { ok: false, error: `Unknown action: ${actionName}` };
      }
    },
  });

  return results[0]?.result ?? { ok: false, error: 'No result from page script.' };
}

const ANALYTICS_TYPE_LABELS = {
  components: 'Components',
  styles: 'Styles',
  variables: 'Variables',
};

const ANALYTICS_DURATION_LABELS = {
  30: '30 days',
  60: '60 days',
  90: '90 days',
  year: 'Year',
};

async function clickAnalyticsTypeMainWorld(tabId, kind) {
  if (!ANALYTICS_TYPE_LABELS[kind]) {
    return { ok: false, error: `Invalid analytics type: ${kind}` };
  }
  return runScraperActionMainWorld(tabId, 'type', kind);
}

async function clickAnalyticsDurationMainWorld(tabId, duration) {
  if (!ANALYTICS_DURATION_LABELS[duration]) {
    return { ok: false, error: `Invalid analytics duration: ${duration}` };
  }
  return runScraperActionMainWorld(tabId, 'duration', duration);
}

async function clickVariablesSubTabMainWorld(tabId, subTab) {
  if (subTab !== 'variables' && subTab !== 'modes') {
    return { ok: false, error: 'Invalid variables sub-tab.' };
  }
  return runScraperActionMainWorld(tabId, 'variables-subtab', subTab);
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'figma-analytics-panel') return;

  activePanelPort = port;
  const tabId = port.sender?.tab?.id;

  port.onMessage.addListener(async (message) => {
    if (message.type === 'PANEL_OPENED') {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const targetTabId = message.tabId || activeTab?.id;
      if (targetTabId) {
        await activateDetector(targetTabId);
        port.postMessage({ type: 'DETECTOR_ACTIVATED', tabId: targetTabId });
      }
    }
    if (message.type === 'PANEL_CLOSED') {
      const targetTabId = message.tabId || tabId;
      await deactivateDetector(targetTabId);
    }
  });

  port.onDisconnect.addListener(async () => {
    activePanelPort = null;
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab?.id) await deactivateDetector(activeTab.id);
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OPEN_SIDE_PANEL') {
    const tabId = sender.tab?.id;
    if (tabId != null && isFigmaUrl(sender.tab?.url)) {
      chrome.sidePanel.open({ tabId });
    }
    sendResponse({ ok: true });
    return true;
  }
  if (message.type === 'ANALYTICS_STATE_CHANGED') {
    if (activePanelPort) {
      try {
        activePanelPort.postMessage(message);
      } catch (_) {
        /* panel closed */
      }
    }
    sendResponse({ ok: true });
    return true;
  }
  if (message.type === 'ANALYTICS_VIEW_TRANSITION') {
    if (activePanelPort) {
      try {
        activePanelPort.postMessage(message);
      } catch (_) {
        /* panel closed */
      }
    }
    sendResponse({ ok: true });
    return true;
  }
  if (message.type === 'CLICK_ANALYTICS_TAB') {
    clickAnalyticsTabMainWorld(message.tabId)
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));
    return true;
  }
  if (message.type === 'CLICK_ANALYTICS_TYPE') {
    clickAnalyticsTypeMainWorld(message.tabId, message.kind)
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));
    return true;
  }
  if (message.type === 'CLICK_ANALYTICS_DURATION') {
    clickAnalyticsDurationMainWorld(message.tabId, message.duration)
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));
    return true;
  }
  if (message.type === 'CLICK_VARIABLES_SUBTAB') {
    clickVariablesSubTabMainWorld(message.tabId, message.subTab)
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));
    return true;
  }
  return false;
});

function notifyPanelActiveTabChanged() {
  if (!activePanelPort) return;
  try {
    activePanelPort.postMessage({ type: 'ACTIVE_TAB_CHANGED' });
  } catch (_) {
    activePanelPort = null;
  }
}

chrome.tabs.onActivated.addListener(() => {
  notifyPanelActiveTabChanged();
});

chrome.tabs.onRemoved.addListener((tabId) => {
  injectedTabs.delete(tabId);
});

chrome.runtime.onInstalled.addListener(async () => {
  const allTabs = await chrome.tabs.query({});
  for (const tab of allTabs) {
    if (tab.id && tab.url) {
      await syncSidePanelForTab(tab.id, tab.url);
    }
  }

  const tabs = await chrome.tabs.query({ url: ['https://*.figma.com/*', 'https://figma.com/*'] });
  for (const tab of tabs) {
    if (!tab.id) continue;
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          window.__figmaAnalyticsLauncherStop?.();
        },
      });
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['scraper.js', 'content/launcher.js'],
      });
    } catch (_) {
      /* tab may not permit injection */
    }
  }
});
