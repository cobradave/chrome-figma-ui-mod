// State
let analyticsState = {
  modalOpen: false,
  kind: 'unknown',
  depth: 'unknown',
  analyticsTabSelected: false,
};
let panelPort = null;
let activeTabId = null;
let trackedTabId = null;
let activeTabIsFigma = false;
let isDownloading = false;
let isSwitchingView = false;
let switchingViewGoal = null;
let selectedFormat = 'csv';
let includeInsightsInExport = false;

const FORMAT_STORAGE_KEY = 'exportFormat';
const INSIGHTS_STORAGE_KEY = 'includeInsightsInExport';
const FORMATS = ['csv', 'json', 'md'];

/** Type/Duration side-panel switchers */
const SHOW_TYPE_DURATION_CONTROLS = false;

// Elements
const feedbackEl = document.getElementById('feedback');
const detectionCardEl = document.getElementById('detectionCard');
const statusIconEl = document.getElementById('statusIcon');
const statusTitleEl = document.getElementById('statusTitle');
const statusDetailEl = document.getElementById('statusDetail');
const switchAnalyticsTabBtn = document.getElementById('switchAnalyticsTabBtn');
const viewIdentEl = document.getElementById('viewIdent');
const viewBreadcrumbEl = document.getElementById('viewBreadcrumb');
const viewTitleEl = document.getElementById('viewTitle');
const viewSubtitleEl = document.getElementById('viewSubtitle');
const viewVariantOfPrefixEl = document.getElementById('viewVariantOfPrefix');
const viewSubtitleTextEl = document.getElementById('viewSubtitleText');
const viewEntityLabelEl = document.getElementById('viewEntityLabel');
const typeBlockEl = document.getElementById('typeBlock');
const typeSegmentEls = [...document.querySelectorAll('#typeSegmented .format-segment')];
const durationBlockEl = document.getElementById('durationBlock');
const durationSegmentEls = [...document.querySelectorAll('#durationSegmented .format-segment')];
const variablesSubTabBlockEl = document.getElementById('variablesSubTabBlock');
const variablesSubTabSegmentEls = [...document.querySelectorAll('#variablesSubTabSegmented .format-segment')];
const formatSegmentEls = [...document.querySelectorAll('#formatSegmented .format-segment')];
const actionBlockEl = document.getElementById('actionBlock');
const actionBlockContentEl = document.getElementById('actionBlockContent');
const actionBlockSkeletonEl = document.getElementById('actionBlockSkeleton');
const downloadBtn = document.getElementById('downloadBtn');
const downloadBtnLabelEl = document.getElementById('downloadBtnLabel');
const includeInsightsBlockEl = document.getElementById('includeInsightsBlock');
const includeInsightsCheckboxEl = document.getElementById('includeInsightsCheckbox');
const panelInsightsEl = document.getElementById('panelInsights');
const panelLoaderEl = document.getElementById('panelLoader');

let panelInsightsCache = { key: null, html: null, data: null, payload: null };
let panelInsightsRenderedKey = null;
let panelInsightsRequest = 0;
let panelInsightsTimer = null;
let panelInsightsInFlight = false;
let lastInsightsScheduleKey = '';
let insightsLoading = false;
let isViewTransitioning = false;
let viewTransitionIntent = null;
let viewTransitionTimer = null;
let panelLoaderWasLoading = false;
let panelLoaderCompleteTimer = null;
let panelLoaderFadeTimer = null;
let panelInsightsTransitionToken = 0;
let panelInsightsTransitionActive = false;
let panelInsightsPendingContent = null;

const VIEW_TRANSITION_TIMEOUT_MS = 8000;
const PANEL_SKELETON_KEY = '__panel_skeleton__';
const PANEL_INSIGHTS_HEIGHT_MS = 300;
const PANEL_INSIGHTS_FADE_MS = 180;
const PANEL_INSIGHTS_CONTENT_FADE_MS = 300;

downloadBtn.addEventListener('click', downloadVisible);
includeInsightsCheckboxEl.addEventListener('change', () => {
  includeInsightsInExport = includeInsightsCheckboxEl.checked;
  chrome.storage.local.set({ [INSIGHTS_STORAGE_KEY]: includeInsightsInExport }).catch(() => {});
});
switchAnalyticsTabBtn.addEventListener('click', switchToAnalyticsTab);
formatSegmentEls.forEach((btn) => {
  btn.addEventListener('click', () => setFormat(btn.dataset.format));
});
typeSegmentEls.forEach((btn) => {
  btn.addEventListener('click', () => setAnalyticsType(btn.dataset.type));
});
durationSegmentEls.forEach((btn) => {
  btn.addEventListener('click', () => setAnalyticsDuration(btn.dataset.duration));
});
variablesSubTabSegmentEls.forEach((btn) => {
  btn.addEventListener('click', () => setVariablesSubTab(btn.dataset.subtab));
});

async function loadFormatPreference() {
  try {
    const stored = await chrome.storage.local.get([FORMAT_STORAGE_KEY, INSIGHTS_STORAGE_KEY]);
    if (FORMATS.includes(stored[FORMAT_STORAGE_KEY])) {
      selectedFormat = stored[FORMAT_STORAGE_KEY];
    }
    if (typeof stored[INSIGHTS_STORAGE_KEY] === 'boolean') {
      includeInsightsInExport = stored[INSIGHTS_STORAGE_KEY];
    }
  } catch (_) {
    /* storage unavailable */
  }
  updateFormatSegments();
}

function setFormat(format) {
  if (!FORMATS.includes(format) || format === selectedFormat) return;
  selectedFormat = format;
  updateFormatSegments();
  chrome.storage.local.set({ [FORMAT_STORAGE_KEY]: format }).catch(() => {});
}

function updateFormatSegments() {
  formatSegmentEls.forEach((btn) => {
    const isSelected = btn.dataset.format === selectedFormat;
    btn.classList.toggle('is-selected', isSelected);
    btn.setAttribute('aria-checked', isSelected ? 'true' : 'false');
  });
}

function setFormatSegmentsDisabled(disabled) {
  formatSegmentEls.forEach((btn) => {
    btn.disabled = disabled;
  });
}

const VARIABLES_SUB_TABS = ['variables', 'modes'];

const ANALYTICS_DURATIONS = ['30', '60', '90', 'year'];

const ANALYTICS_DURATION_LABELS = {
  30: '30 days',
  60: '60 days',
  90: '90 days',
  year: 'Year',
};

function updateTypeSegments() {
  const active = analyticsState.kind;
  typeSegmentEls.forEach((btn) => {
    const isSelected = btn.dataset.type === active;
    btn.classList.toggle('is-selected', isSelected);
    btn.setAttribute('aria-checked', isSelected ? 'true' : 'false');
  });
}

function setTypeSegmentsDisabled(disabled) {
  typeSegmentEls.forEach((btn) => {
    btn.disabled = disabled;
  });
}

function switchingGoalReached(state) {
  if (!switchingViewGoal) return false;

  if (switchingViewGoal.type === 'analytics-tab') {
    return state.analyticsTabSelected === true;
  }
  if (switchingViewGoal.type === 'type') {
    return state.analyticsTabSelected && state.kind === switchingViewGoal.value;
  }
  if (switchingViewGoal.type === 'duration') {
    return state.analyticsTabSelected && state.duration === switchingViewGoal.value;
  }
  if (switchingViewGoal.type === 'variables-subtab') {
    return (
      state.analyticsTabSelected &&
      state.kind === 'variables' &&
      state.depth === 'list' &&
      (state.variablesSubTab || 'variables') === switchingViewGoal.value
    );
  }
  return false;
}

function clearSwitchingView() {
  isSwitchingView = false;
  switchingViewGoal = null;
  if (!isViewTransitioning) {
    viewTransitionIntent = null;
  }
}

function beginSwitchingView(goal) {
  isSwitchingView = true;
  switchingViewGoal = goal;
  if (goal?.type === 'type') {
    viewTransitionIntent = { pendingKind: goal.value, pendingDepth: 'list' };
  } else if (goal?.type === 'variables-subtab') {
    viewTransitionIntent = {
      pendingKind: 'variables',
      pendingDepth: 'list',
      pendingVariablesSubTab: goal.value,
    };
  }
}

async function setAnalyticsType(kind) {
  if (!SHOW_TYPE_DURATION_CONTROLS) return;
  if (!ViewTransition.ANALYTICS_TYPES.includes(kind) || isSwitchingView) return;
  if (
    !analyticsState.modalOpen ||
    !analyticsState.analyticsTabSelected ||
    kind === analyticsState.kind
  ) {
    return;
  }

  if (!activeTabId) return;

  beginSwitchingView({ type: 'type', value: kind });
  applyUI();
  setStatus(`Switching to ${ViewTransition.ANALYTICS_TYPE_LABELS[kind]}…`, 'info');

  try {
    const tabId = (await resolveActiveTabId()) || activeTabId;
    activeTabId = tabId;

    const result = await chrome.runtime.sendMessage({
      type: 'CLICK_ANALYTICS_TYPE',
      tabId,
      kind,
    });

    if (!result) {
      setStatus('Extension could not reach the Figma tab. Reload the extension and try again.', 'error');
      return;
    }

    if (!result.ok) {
      setStatus(result?.error || 'Could not switch type in Figma.', 'error');
      return;
    }

    if (result.changed) {
      for (let attempt = 0; attempt < 8; attempt++) {
        await new Promise((r) => setTimeout(r, 150));
        if (switchingGoalReached(analyticsState)) break;
        await refreshDetectedState(true);
        if (switchingGoalReached(analyticsState)) break;
      }
    } else {
      await refreshDetectedState(true);
    }

    setStatus('', 'info');
  } catch (err) {
    setStatus('Could not switch type: ' + (err.message || 'unknown error'), 'error');
  } finally {
    clearSwitchingView();
    applyUI();
  }
}

function updateDurationSegments() {
  const active = analyticsState.duration || '30';
  durationSegmentEls.forEach((btn) => {
    const isSelected = btn.dataset.duration === active;
    btn.classList.toggle('is-selected', isSelected);
    btn.setAttribute('aria-checked', isSelected ? 'true' : 'false');
  });
}

function setDurationSegmentsDisabled(disabled) {
  durationSegmentEls.forEach((btn) => {
    btn.disabled = disabled;
  });
}

function showDurationControl(show) {
  durationBlockEl.hidden = !show;
}

async function setAnalyticsDuration(duration) {
  if (!SHOW_TYPE_DURATION_CONTROLS) return;
  if (!ANALYTICS_DURATIONS.includes(duration) || isSwitchingView) return;
  if (
    !analyticsState.modalOpen ||
    !analyticsState.analyticsTabSelected ||
    duration === (analyticsState.duration || '30')
  ) {
    return;
  }

  if (!activeTabId) return;

  beginSwitchingView({ type: 'duration', value: duration });
  applyUI();
  setStatus(`Switching to ${ANALYTICS_DURATION_LABELS[duration]}…`, 'info');

  try {
    const tabId = (await resolveActiveTabId()) || activeTabId;
    activeTabId = tabId;

    const result = await chrome.runtime.sendMessage({
      type: 'CLICK_ANALYTICS_DURATION',
      tabId,
      duration,
    });

    if (!result) {
      setStatus('Extension could not reach the Figma tab. Reload the extension and try again.', 'error');
      return;
    }

    if (!result.ok) {
      setStatus(result?.error || 'Could not switch duration in Figma.', 'error');
      return;
    }

    if (result.changed) {
      for (let attempt = 0; attempt < 8; attempt++) {
        await new Promise((r) => setTimeout(r, 150));
        if (switchingGoalReached(analyticsState)) break;
        await refreshDetectedState(true);
        if (switchingGoalReached(analyticsState)) break;
      }
    } else {
      await refreshDetectedState(true);
    }

    setStatus('', 'info');
  } catch (err) {
    setStatus('Could not switch duration: ' + (err.message || 'unknown error'), 'error');
  } finally {
    clearSwitchingView();
    applyUI();
  }
}

function updateVariablesSubTabSegments() {
  const active = analyticsState.variablesSubTab || 'variables';
  variablesSubTabSegmentEls.forEach((btn) => {
    const isSelected = btn.dataset.subtab === active;
    btn.classList.toggle('is-selected', isSelected);
    btn.setAttribute('aria-checked', isSelected ? 'true' : 'false');
  });
}

function setVariablesSubTabSegmentsDisabled(disabled) {
  variablesSubTabSegmentEls.forEach((btn) => {
    btn.disabled = disabled;
  });
}

function showVariablesSubTabControl(show) {
  variablesSubTabBlockEl.hidden = !show;
}

async function setVariablesSubTab(subTab) {
  if (!VARIABLES_SUB_TABS.includes(subTab) || isSwitchingView) return;
  if (
    analyticsState.kind !== 'variables' ||
    analyticsState.depth !== 'list' ||
    subTab === (analyticsState.variablesSubTab || 'variables')
  ) {
    return;
  }

  if (!activeTabId) return;

  beginSwitchingView({ type: 'variables-subtab', value: subTab });
  applyUI();
  setStatus(`Switching to ${subTab === 'modes' ? 'Modes' : 'Variables'}…`, 'info');

  try {
    const tabId = (await resolveActiveTabId()) || activeTabId;
    activeTabId = tabId;

    const result = await chrome.runtime.sendMessage({
      type: 'CLICK_VARIABLES_SUBTAB',
      tabId,
      subTab,
    });

    if (!result?.ok) {
      setStatus(result?.error || 'Could not switch tab in Figma.', 'error');
      return;
    }

    if (result.changed) {
      for (let attempt = 0; attempt < 8; attempt++) {
        await new Promise((r) => setTimeout(r, 150));
        if (switchingGoalReached(analyticsState)) break;
        await refreshDetectedState(true);
        if (switchingGoalReached(analyticsState)) break;
      }
    } else {
      await refreshDetectedState(true);
    }

    setStatus('', 'info');
  } catch (err) {
    setStatus('Could not switch tab: ' + (err.message || 'unknown error'), 'error');
  } finally {
    clearSwitchingView();
    applyUI();
  }
}

function showTypeControl(show) {
  typeBlockEl.hidden = !show;
}

// ──────────────────────────────────────────────
// Panel ↔ background port (activates detector)
// ──────────────────────────────────────────────
let statePollTimer = null;
let tabWatchPollTimer = null;

function handlePanelPortMessage(msg) {
  if (msg.type === 'ACTIVE_TAB_CHANGED') {
    handleActiveTabChange();
    return;
  }
  if (msg.type === 'DETECTOR_ACTIVATED') {
    if (msg.tabId) activeTabId = msg.tabId;
    refreshDetectedState();
  }
  if (msg.type === 'ANALYTICS_VIEW_TRANSITION') {
    beginViewTransition(msg.intent);
  }
  if (msg.type === 'ANALYTICS_STATE_CHANGED') {
    onAnalyticsStateChanged(msg);
  }
}

function connectPanelPort() {
  if (panelPort) {
    try {
      panelPort.disconnect();
    } catch (_) {
      /* already disconnected */
    }
    panelPort = null;
  }

  panelPort = chrome.runtime.connect({ name: 'figma-analytics-panel' });
  panelPort.onDisconnect.addListener(() => {
    panelPort = null;
  });
  panelPort.onMessage.addListener(handlePanelPortMessage);
  return panelPort;
}

function postPanelMessage(message) {
  if (!panelPort) {
    try {
      connectPanelPort();
    } catch (_) {
      return false;
    }
  }

  try {
    panelPort.postMessage(message);
    return true;
  } catch (_) {
    panelPort = null;
    try {
      connectPanelPort();
      panelPort.postMessage(message);
      return true;
    } catch (_) {
      panelPort = null;
      return false;
    }
  }
}

async function syncActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTabId = tab?.id ?? null;
  activeTabIsFigma = isFigmaUrl(tab?.url);
  return tab;
}

function resetAnalyticsState() {
  analyticsState = {
    modalOpen: false,
    kind: 'unknown',
    depth: 'unknown',
    analyticsTabSelected: false,
  };
  clearSwitchingView();
}

function startStatePolling() {
  stopStatePolling();
  if (!activeTabIsFigma) return;
  statePollTimer = setInterval(() => refreshDetectedState(), 1500);
}

function stopStatePolling() {
  if (statePollTimer) {
    clearInterval(statePollTimer);
    statePollTimer = null;
  }
}

/** Poll while showing non-Figma UI — side panel can miss tabs.onActivated when throttled. */
function startTabWatchPolling() {
  stopTabWatchPolling();
  tabWatchPollTimer = setInterval(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id && isFigmaUrl(tab?.url) && !activeTabIsFigma) {
      handleActiveTabChange();
    }
  }, 1000);
}

function stopTabWatchPolling() {
  if (tabWatchPollTimer) {
    clearInterval(tabWatchPollTimer);
    tabWatchPollTimer = null;
  }
}

async function handleActiveTabChange() {
  const previousTabId = trackedTabId;
  const wasFigma = activeTabIsFigma;
  await syncActiveTab();
  trackedTabId = activeTabId;
  clearErrorStatus();

  if (!activeTabIsFigma) {
    stopStatePolling();
    startTabWatchPolling();
    if (wasFigma && previousTabId) {
      postPanelMessage({ type: 'PANEL_CLOSED', tabId: previousTabId });
    }
    resetAnalyticsState();
    applyUI();
    return;
  }

  stopTabWatchPolling();

  const tabChanged = activeTabId !== previousTabId;
  if (tabChanged || !wasFigma) {
    if (previousTabId && previousTabId !== activeTabId) {
      postPanelMessage({ type: 'PANEL_CLOSED', tabId: previousTabId });
    }
    if (activeTabId) {
      postPanelMessage({ type: 'PANEL_OPENED', tabId: activeTabId });
    }
  }

  startStatePolling();
  await refreshDetectedState();
  applyUI();
}

async function initPanel() {
  EntityIcons.initSegmentIcons();
  await syncActiveTab();
  trackedTabId = activeTabId;

  connectPanelPort();
  if (activeTabIsFigma && activeTabId) {
    postPanelMessage({ type: 'PANEL_OPENED', tabId: activeTabId });
  }

  chrome.tabs.onActivated.addListener(() => {
    handleActiveTabChange();
  });
  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
    if (!(changeInfo.url || changeInfo.status === 'complete')) return;
    if (tabId === activeTabId) {
      handleActiveTabChange();
      return;
    }
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab?.id === tabId) {
      handleActiveTabChange();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      handleActiveTabChange();
    }
  });

  window.addEventListener('beforeunload', () => {
    stopStatePolling();
    stopTabWatchPolling();
    if (!panelPort) return;
    try {
      panelPort.postMessage({ type: 'PANEL_CLOSED', tabId: activeTabId });
      panelPort.disconnect();
    } catch (_) {
      /* port already disconnected */
    }
    panelPort = null;
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'ANALYTICS_VIEW_TRANSITION') {
      beginViewTransition(message.intent);
      return;
    }
    onAnalyticsStateChanged(message);
  });
  await loadFormatPreference();
  applyUI();
  if (activeTabIsFigma) {
    await refreshDetectedState();
    startStatePolling();
  } else {
    startTabWatchPolling();
  }
}

function onAnalyticsStateChanged(message) {
  if (message.type !== 'ANALYTICS_STATE_CHANGED' || !message.state) return;
  clearErrorStatus();
  const { viewChanged, scheduleKeyChanged } = commitAnalyticsState(message.state);
  if (isSwitchingView && switchingGoalReached(analyticsState)) {
    clearSwitchingView();
  }
  applyUI();
  if (viewChanged || scheduleKeyChanged) {
    schedulePanelInsightsRefresh(viewChanged ? 0 : 400);
  } else {
    ensurePanelInsightsFetch(analyticsState);
  }
}

async function refreshDetectedState(fast = false) {
  if (!activeTabId || !activeTabIsFigma) return;
  await ensureScraperInjected(activeTabId);

  const maxAttempts = fast ? 2 : 5;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: activeTabId },
        func: () => {
          const S = window.FigmaAnalyticsScraper;
          if (!S) return null;
          const dialog = S.findAnalyticsDialog();
          return S.getAnalyticsState(dialog);
        },
      });
      const state = results[0]?.result;
      if (state) {
        const { viewChanged, scheduleKeyChanged } = commitAnalyticsState(state);
        if (isSwitchingView && switchingGoalReached(analyticsState)) {
          clearSwitchingView();
        }
        applyUI();
        if (viewChanged || scheduleKeyChanged) {
          schedulePanelInsightsRefresh(viewChanged ? 0 : 400);
        } else {
          ensurePanelInsightsFetch(analyticsState);
        }
        return;
      }
    } catch (_) {
      /* injection still starting */
    }
    if (attempt + 1 < maxAttempts) {
      await new Promise((r) => setTimeout(r, fast ? 100 : 250 * (attempt + 1)));
    }
  }
}

function isExportableView(state) {
  return ViewTransition.isExportableView(state);
}

function getDownloadAction(state) {
  if (!state.modalOpen) {
    return { enabled: false, label: 'Download unavailable', mode: null };
  }

  if (!state.analyticsTabSelected) {
    return { enabled: false, label: 'Switch to Analytics', mode: null };
  }

  if (state.kind === 'components' && state.depth === 'list') {
    const count = state.itemCount;
    return {
      enabled: true,
      label: count ? `Download ${count} components` : 'Download component list',
      mode: 'list',
    };
  }

  if (state.kind === 'components' && state.depth === 'detail') {
    const count = state.variantCount;
    return {
      enabled: true,
      label: count ? `Download ${count} variants` : 'Download variants',
      mode: 'variants',
    };
  }

  if (state.kind === 'components' && state.depth === 'variant') {
    return {
      enabled: true,
      label: 'Download variant usage',
      mode: 'file-usage',
    };
  }

  if (state.kind === 'components' && state.depth === 'component') {
    return {
      enabled: true,
      label: 'Download component usage',
      mode: 'file-usage',
    };
  }

  if (state.kind === 'styles' && state.depth === 'list') {
    const count = state.itemCount;
    return {
      enabled: true,
      label: count ? `Download ${count} styles` : 'Download style list',
      mode: 'styles-list',
    };
  }

  if (state.kind === 'styles' && state.depth === 'detail') {
    return {
      enabled: true,
      label: 'Download style usage',
      mode: 'file-usage',
    };
  }

  if (state.kind === 'variables' && state.depth === 'list') {
    const count = state.itemCount;
    const subTab = state.variablesSubTab || 'variables';
    if (subTab === 'modes') {
      return {
        enabled: true,
        label: count ? `Download ${count} modes` : 'Download modes list',
        mode: 'variables-list',
      };
    }
    return {
      enabled: true,
      label: count ? `Download ${count} variables` : 'Download variables list',
      mode: 'variables-list',
    };
  }

  if (state.kind === 'variables' && state.depth === 'detail') {
    return {
      enabled: true,
      label: 'Download variable usage',
      mode: 'file-usage',
    };
  }

  return { enabled: false, label: 'Download unavailable', mode: null };
}

function guidanceCardForState(state) {
  if (!activeTabIsFigma) {
    return {
      cardClass: 'detection-unsupported',
      icon: '!',
      title: 'Figma only',
      detail: 'This extension works on figma.com. Open a Figma file, then open Library Analytics to export.',
    };
  }

  if (!state.modalOpen) {
    return {
      cardClass: 'detection-waiting',
      icon: '○',
      title: 'Looking for Library Analytics',
      detail: 'Open the analytics modal in Figma. The panel updates automatically.',
    };
  }

  if (!state.analyticsTabSelected) {
    return {
      cardClass: 'detection-info',
      icon: '→',
      title: 'Overview tab selected',
      detail: 'Export uses the Analytics tab — Components, Styles, and Variables lists.',
      action: 'switchAnalyticsTab',
    };
  }

  if (!isExportableView(state)) {
    return {
      cardClass: 'detection-info',
      icon: 'i',
      title: 'Unrecognized view',
      detail: 'Try Components, Styles, or Variables on the Analytics tab.',
    };
  }

  return null;
}

async function resolveActiveTabId() {
  if (activeTabId) {
    try {
      const tab = await chrome.tabs.get(activeTabId);
      if (isFigmaUrl(tab?.url)) return activeTabId;
    } catch (_) {
      /* tab closed */
    }
  }

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (activeTab?.id && isFigmaUrl(activeTab.url)) {
    activeTabId = activeTab.id;
    return activeTabId;
  }

  const figmaTabs = await chrome.tabs.query({
    currentWindow: true,
    url: ['https://www.figma.com/*', 'https://figma.com/*'],
  });
  if (figmaTabs[0]?.id) {
    activeTabId = figmaTabs[0].id;
    return activeTabId;
  }

  return null;
}

async function invokeSelectAnalyticsTab(tabId) {
  if (!tabId) return { ok: false, error: 'No Figma tab found.' };

  try {
    const viaBackground = await chrome.runtime.sendMessage({
      type: 'CLICK_ANALYTICS_TAB',
      tabId,
    });
    if (viaBackground?.ok) return viaBackground;
    if (viaBackground?.error) {
      /* try content-script fallback before giving up */
    }
  } catch (err) {
    /* background unavailable — try content script */
  }

  try {
    const viaContent = await chrome.tabs.sendMessage(tabId, { type: 'SELECT_ANALYTICS_TAB' });
    if (viaContent?.ok) return viaContent;
    if (viaContent?.error) return viaContent;
  } catch (_) {
    /* detector not injected */
  }

  await ensureScraperInjected(tabId);
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const S = window.FigmaAnalyticsScraper;
      const dialog = S.findAnalyticsDialog();
      return S.selectAnalyticsTab(dialog);
    },
  });
  return results[0]?.result ?? { ok: false, error: 'Isolated-world fallback returned no result.' };
}

async function switchToAnalyticsTab() {
  const tabId = await resolveActiveTabId();
  if (!tabId) {
    setStatus('Open a Figma tab with Library Analytics first.', 'error');
    return;
  }
  activeTabId = tabId;

  if (isSwitchingView || !analyticsState.modalOpen || analyticsState.analyticsTabSelected) return;

  beginSwitchingView({ type: 'analytics-tab' });
  applyUI();
  setStatus('Switching to Analytics…', 'info');

  try {
    const result = await invokeSelectAnalyticsTab(tabId);
    if (!result?.ok) {
      setStatus(result?.error || 'Could not switch to Analytics tab in Figma.', 'error');
      return;
    }

    if (result.changed) {
      for (let attempt = 0; attempt < 8; attempt++) {
        await new Promise((r) => setTimeout(r, 150));
        if (switchingGoalReached(analyticsState)) break;
        await refreshDetectedState(true);
        if (switchingGoalReached(analyticsState)) break;
      }
      if (!analyticsState.analyticsTabSelected) {
        setStatus('Tab did not switch — select Analytics manually in Figma.', 'error');
      }
    } else {
      await refreshDetectedState(true);
    }

    if (analyticsState.analyticsTabSelected) {
      setStatus('', 'info');
    }
  } catch (err) {
    setStatus('Could not switch tab: ' + (err.message || 'unknown error'), 'error');
  } finally {
    clearSwitchingView();
    applyUI();
  }
}

function applyViewSubtitle(view) {
  if (!view?.subtitleLine) {
    viewSubtitleEl.hidden = true;
    viewVariantOfPrefixEl.hidden = true;
    viewSubtitleTextEl.hidden = true;
    EntityIcons.applyEntityLabel(viewEntityLabelEl, null);
    return;
  }

  viewSubtitleEl.hidden = false;
  viewSubtitleTextEl.hidden = true;
  viewSubtitleTextEl.textContent = '';

  if (view.subtitleLine === 'tag') {
    viewVariantOfPrefixEl.hidden = true;
    EntityIcons.applyEntityLabel(viewEntityLabelEl, view.entityKind);
    return;
  }

  if (view.subtitleLine === 'variantOf') {
    viewVariantOfPrefixEl.hidden = false;
    EntityIcons.applyNamedEntityLabel(viewEntityLabelEl, 'componentSet', view.variantOfName);
  }
}

function applyViewIdent(view) {
  viewBreadcrumbEl.textContent = view.breadcrumb;
  viewTitleEl.textContent = view.title;
  applyViewSubtitle(view);
}

function clearViewTransitionTimer() {
  if (viewTransitionTimer) {
    clearTimeout(viewTransitionTimer);
    viewTransitionTimer = null;
  }
}

function hasLivePanelInsights() {
  return (
    !panelInsightsEl.hidden &&
    Boolean(panelInsightsEl.querySelector('.preview__body:not(.is-skeleton)'))
  );
}

function hasPanelInsightsSkeleton() {
  return (
    !panelInsightsEl.hidden &&
    Boolean(panelInsightsEl.querySelector('.preview__body.is-skeleton'))
  );
}

function shouldPreserveInsightsDuringViewTransition() {
  if (!shouldShowPanelInsights(analyticsState)) return false;
  return hasLivePanelInsights() || hasPanelInsightsSkeleton();
}

function beginViewTransition(intent) {
  if (!activeTabIsFigma || !analyticsState.modalOpen) return;

  const preserveInsights = shouldPreserveInsightsDuringViewTransition();

  isViewTransitioning = true;
  viewTransitionIntent = intent || null;
  clearViewTransitionTimer();
  viewTransitionTimer = setTimeout(() => {
    isViewTransitioning = false;
    viewTransitionIntent = null;
    viewTransitionTimer = null;
    applyUI();
  }, VIEW_TRANSITION_TIMEOUT_MS);

  panelInsightsRequest += 1;
  panelInsightsInFlight = false;
  lastInsightsScheduleKey = '';
  insightsLoading = false;
  if (panelInsightsTimer) {
    clearTimeout(panelInsightsTimer);
    panelInsightsTimer = null;
  }
  panelInsightsCache = { key: null, html: null, data: null, payload: null };

  if (preserveInsights) {
    if (hasLivePanelInsights()) {
      renderPanelInsights(buildPanelInsightsSkeletonHtml(), PANEL_SKELETON_KEY);
    } else {
      panelInsightsEl.hidden = false;
    }
  } else {
    panelInsightsRenderedKey = null;
    cancelPanelInsightsTransition();
    panelInsightsEl.innerHTML = '';
    panelInsightsEl.hidden = true;
  }

  applyUI();
}

function endViewTransition() {
  if (!isViewTransitioning) return;
  isViewTransitioning = false;
  viewTransitionIntent = null;
  clearViewTransitionTimer();
}

function applyViewTransitionUI() {
  detectionCardEl.hidden = true;
  switchAnalyticsTabBtn.hidden = true;

  viewIdentEl.hidden = false;
  viewBreadcrumbEl.textContent = analyticsState.libraryName || 'Library';
  const statusText = ViewTransition.getTransitionStatusText(viewTransitionIntent, analyticsState);
  viewTitleEl.textContent = statusText || '';
  viewSubtitleEl.hidden = true;
  viewVariantOfPrefixEl.hidden = true;
  viewSubtitleTextEl.hidden = true;
  EntityIcons.applyEntityLabel(viewEntityLabelEl, null);
  showTypeControl(false);
  showDurationControl(false);
  showVariablesSubTabControl(false);

  const showInsightsDuringTransition =
    hasPanelInsightsSkeleton() ||
    hasLivePanelInsights() ||
    panelInsightsTransitionActive;
  panelInsightsEl.hidden = !showInsightsDuringTransition;
  includeInsightsBlockEl.hidden = true;

  actionBlockEl.hidden = true;
}

function applyUI() {
  const guidance = guidanceCardForState(analyticsState);

  if (
    ViewTransition.shouldShowTransitionUI(analyticsState, guidance, {
      isViewTransitioning,
      isSwitchingView,
    })
  ) {
    applyViewTransitionUI();
    return;
  }

  const view = ViewLabels.getViewContext(analyticsState);
  const action = getDownloadAction(analyticsState);

  if (guidance) {
    detectionCardEl.hidden = false;
    detectionCardEl.className = `detection-card ${guidance.cardClass}`;
    statusIconEl.textContent = guidance.icon;
    statusTitleEl.textContent = guidance.title;
    statusDetailEl.textContent = guidance.detail;
    const showSwitchAnalyticsTab = guidance.action === 'switchAnalyticsTab';
    switchAnalyticsTabBtn.hidden = !showSwitchAnalyticsTab;
    switchAnalyticsTabBtn.disabled = isSwitchingView || isDownloading;
  } else {
    detectionCardEl.hidden = true;
    switchAnalyticsTabBtn.hidden = true;
  }

  if (view) {
    viewIdentEl.hidden = false;
    applyViewIdent(view);
    const shouldShowTypeControl =
      SHOW_TYPE_DURATION_CONTROLS &&
      analyticsState.modalOpen &&
      analyticsState.analyticsTabSelected &&
      ViewTransition.ANALYTICS_TYPES.includes(analyticsState.kind);
    showTypeControl(shouldShowTypeControl);
    if (shouldShowTypeControl) updateTypeSegments();
    const shouldShowDurationControl =
      SHOW_TYPE_DURATION_CONTROLS &&
      analyticsState.modalOpen &&
      analyticsState.analyticsTabSelected;
    showDurationControl(shouldShowDurationControl);
    if (shouldShowDurationControl) updateDurationSegments();
    const shouldShowSubTabControl =
      analyticsState.kind === 'variables' &&
      analyticsState.depth === 'list' &&
      analyticsState.analyticsTabSelected;
    showVariablesSubTabControl(shouldShowSubTabControl);
    if (shouldShowSubTabControl) updateVariablesSubTabSegments();
  } else {
    viewIdentEl.hidden = true;
    showTypeControl(false);
    showDurationControl(false);
    showVariablesSubTabControl(false);
  }

  const hideExportControls = Boolean(guidance);
  const exportReady = hasExportCache(analyticsState);
  const showPanelSkeleton =
    !hideExportControls && !isViewTransitioning && isPanelContentLoading(analyticsState);
  const showExport = !hideExportControls && exportReady && !isViewTransitioning;
  actionBlockEl.hidden = !showExport && !showPanelSkeleton;
  actionBlockContentEl.hidden = !showExport;
  actionBlockSkeletonEl.hidden = !showPanelSkeleton;

  if (showExport) {
    downloadBtnLabelEl.textContent = action.label;
    downloadBtn.disabled = !action.enabled || isDownloading || isSwitchingView;
    setFormatSegmentsDisabled(!action.enabled || isDownloading || isSwitchingView);
  }
  setTypeSegmentsDisabled(isDownloading || isSwitchingView);
  setDurationSegmentsDisabled(isDownloading || isSwitchingView);
  setVariablesSubTabSegmentsDisabled(isDownloading || isSwitchingView);
  updatePanelLoader(analyticsState);
  updatePanelInsights(analyticsState);
  updateIncludeInsightsControl();
}

function updateIncludeInsightsControl() {
  const show =
    shouldShowPanelInsights(analyticsState) && hasExportCache(analyticsState);
  includeInsightsBlockEl.hidden = !show;
  includeInsightsCheckboxEl.checked = includeInsightsInExport;

  const insightsReady = PanelInsights.insightsPayloadHasContent(panelInsightsCache.payload);
  const pending = show && !insightsReady;
  includeInsightsBlockEl.classList.toggle('is-pending', pending);
  includeInsightsCheckboxEl.disabled = isDownloading || pending;
}

function hasExportCache(state) {
  return panelInsightsCache.key === getPanelInsightsKey(state) && panelInsightsCache.data != null;
}

function hasCachedInsights(state) {
  return hasExportCache(state) && Boolean(panelInsightsCache.html);
}

function getPanelInsightsKey(state) {
  return [
    state.kind,
    state.depth,
    state.itemName || '',
    state.variantCount || '',
    state.itemCount || '',
    state.variablesSubTab || '',
    state.duration || '30',
    state.fileCount || '',
    state.usedIn || '',
    state.usedBy || '',
  ].join('|');
}

function getViewIdentityKey(state) {
  return [
    state.kind,
    state.depth,
    state.itemName || '',
    state.itemCount || '',
    state.variantCount || '',
    state.fileCount || '',
    state.variablesSubTab || '',
    state.duration || '30',
  ].join('|');
}

function commitAnalyticsState(nextState) {
  const prevViewKey = getViewIdentityKey(analyticsState);
  const prevScheduleKey = getInsightsScheduleKey(analyticsState);
  const viewChanged = getViewIdentityKey(nextState) !== prevViewKey;

  analyticsState = nextState;

  if (viewChanged) {
    if (ViewTransition.shouldEndViewTransition(nextState)) {
      endViewTransition();
    }
    panelInsightsRequest += 1;
    panelInsightsInFlight = false;
    lastInsightsScheduleKey = '';
    if (panelInsightsTimer) {
      clearTimeout(panelInsightsTimer);
      panelInsightsTimer = null;
    }
    panelInsightsCache = { key: null, html: null, data: null, payload: null };
    if (
      panelInsightsRenderedKey !== PANEL_SKELETON_KEY &&
      !panelInsightsTransitionActive
    ) {
      panelInsightsRenderedKey = null;
    }
    insightsLoading = false;
  }

  return {
    viewChanged,
    scheduleKeyChanged: getInsightsScheduleKey(analyticsState) !== prevScheduleKey,
  };
}

function getInsightsScheduleKey(state) {
  return [getPanelInsightsKey(state), state?.dataReadiness?.status || ''].join('|');
}

function isPanelContentLoading(state) {
  if (!activeTabIsFigma || guidanceCardForState(state) || !isExportableView(state)) {
    return false;
  }
  if (isViewTransitioning || isSwitchingView || isDownloading) return false;
  if (state?.dataReadiness?.status === 'loading') return true;

  const key = getPanelInsightsKey(state);
  const hasData = panelInsightsCache.key === key && panelInsightsCache.data != null;
  const hasHtml = hasData && Boolean(panelInsightsCache.html);
  if (!hasData || !hasHtml) return true;
  return false;
}

function isPanelLoaderBusy(state) {
  if (isViewTransitioning || isSwitchingView || isDownloading) return true;
  if (!activeTabIsFigma || guidanceCardForState(state) || !isExportableView(state)) {
    return false;
  }
  if (state?.dataReadiness?.status === 'loading') return true;
  if (isPageDataReady(state) && shouldShowPanelInsights(state) && !hasExportCache(state)) {
    return panelInsightsInFlight || insightsLoading || Boolean(panelInsightsTimer);
  }
  return false;
}

function clearPanelLoaderTimers() {
  if (panelLoaderCompleteTimer) {
    clearTimeout(panelLoaderCompleteTimer);
    panelLoaderCompleteTimer = null;
  }
  if (panelLoaderFadeTimer) {
    clearTimeout(panelLoaderFadeTimer);
    panelLoaderFadeTimer = null;
  }
}

function showPanelLoaderLoading() {
  clearPanelLoaderTimers();
  panelLoaderWasLoading = true;
  panelLoaderEl.hidden = false;
  panelLoaderEl.classList.remove('is-complete', 'is-fading');
  panelLoaderEl.classList.add('is-loading');
}

function finishPanelLoader() {
  clearPanelLoaderTimers();
  panelLoaderEl.classList.remove('is-loading');
  panelLoaderEl.classList.add('is-complete');
  panelLoaderCompleteTimer = setTimeout(() => {
    panelLoaderEl.classList.add('is-fading');
    panelLoaderFadeTimer = setTimeout(() => {
      panelLoaderEl.hidden = true;
      panelLoaderEl.classList.remove('is-loading', 'is-complete', 'is-fading');
      panelLoaderFadeTimer = null;
    }, 450);
    panelLoaderCompleteTimer = null;
  }, 650);
}

function updatePanelLoader(state) {
  if (isPanelContentLoading(state)) {
    clearPanelLoaderTimers();
    panelLoaderWasLoading = false;
    panelLoaderEl.hidden = true;
    panelLoaderEl.classList.remove('is-loading', 'is-complete', 'is-fading');
    return;
  }

  if (isPanelLoaderBusy(state)) {
    showPanelLoaderLoading();
    return;
  }

  if (!panelLoaderWasLoading) {
    panelLoaderEl.hidden = true;
    panelLoaderEl.classList.remove('is-loading', 'is-complete', 'is-fading');
    return;
  }

  panelLoaderWasLoading = false;
  finishPanelLoader();
}

function shouldShowPanelInsights(state) {
  return activeTabIsFigma && !guidanceCardForState(state) && isExportableView(state);
}

function isPageDataReady(state) {
  if (!isExportableView(state)) return true;
  const readiness = state?.dataReadiness;
  return readiness?.status === 'ready';
}

function getInsightsScope(state, data) {
  const scope = ViewLabels.getScopeLabel(state);
  if (scope) return scope;

  if (state.kind === 'styles' && state.depth === 'detail' && data) {
    const text = ViewLabels.formatInstanceScope({
      totalInstances: data.totalInstances,
      usedBy: data.usedBy,
    });
    if (text) return { title: 'Total instances', text };
  }

  return null;
}

function buildPanelInsightsHtml(state, data) {
  const scope = getInsightsScope(state, data);
  return PanelInsights.buildInsightsHtml(state, data, {
    scope,
    duration: state.duration || '30',
  });
}

function buildPanelInsightsSkeletonInnerHtml() {
  const barRow = () =>
    `<div class="panel-skeleton__bar">
        <div class="panel-skeleton__line panel-skeleton__line--bar-label"></div>
        <div class="panel-skeleton__line panel-skeleton__line--bar-track"></div>
        <div class="panel-skeleton__line panel-skeleton__line--bar-pct"></div>
      </div>`;

  return `<div class="panel-skeleton-insights" role="status" aria-label="Loading insights">
      <div class="panel-skeleton__block">
        <div class="panel-skeleton__line panel-skeleton__line--title"></div>
        <div class="panel-skeleton__line panel-skeleton__line--subtitle"></div>
      </div>
      <div class="panel-skeleton__block">
        <div class="panel-skeleton__line panel-skeleton__line--label"></div>
        ${barRow()}
        ${barRow()}
        ${barRow()}
        ${barRow()}
      </div>
    </div>`;
}

function buildPanelInsightsSkeletonHtml() {
  return `<div class="preview">${buildPanelInsightsSkeletonInnerHtml()}</div>`;
}

function extractPreviewInnerHtml(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html.trim();
  const preview = tmp.querySelector('.preview');
  return preview ? preview.innerHTML : html;
}

function ensureInsightsPreviewFrame() {
  let preview = panelInsightsEl.querySelector(':scope > .preview');
  if (!preview) {
    panelInsightsEl.innerHTML = '<div class="preview"><div class="preview__body"></div></div>';
    preview = panelInsightsEl.querySelector(':scope > .preview');
  }

  preview.querySelector('.preview-toggle')?.remove();
  preview.querySelector('.preview__footer')?.remove();

  let body = preview.querySelector('.preview__body');
  if (!body) {
    body = document.createElement('div');
    body.className = 'preview__body';
    preview.textContent = '';
    preview.appendChild(body);
  }

  return { preview, body };
}

function clearPreviewFrameStyles(preview, body) {
  if (!preview) return;
  preview.classList.remove('is-height-animating', 'is-height-pinned', 'is-content-fading-out');
  preview.style.height = '';
  preview.style.overflow = '';
  body?.classList.remove(
    'is-skeleton',
    'is-skeleton-exiting',
    'is-content-entering',
    'is-content-exiting',
    'is-collapse-ready'
  );
  const footer = preview?.querySelector('.preview__footer');
  if (footer) footer.style.opacity = '';
  body?.querySelectorAll('[style]').forEach((el) => {
    el.style.animationDelay = '';
    el.style.opacity = '';
  });
}

function mountInsightsSkeleton({ preserveHeight = false } = {}) {
  const { preview, body } = ensureInsightsPreviewFrame();
  const pinnedHeight = preserveHeight ? preview.offsetHeight : 0;
  clearPreviewFrameStyles(preview, body);
  body.className = 'preview__body is-skeleton';
  body.innerHTML = buildPanelInsightsSkeletonInnerHtml();

  const footer = document.createElement('div');
  footer.className = 'preview__footer panel-skeleton__footer';
  footer.setAttribute('aria-hidden', 'true');
  footer.innerHTML = '<div class="panel-skeleton__line panel-skeleton__line--show-more"></div>';
  preview.appendChild(footer);

  if (preserveHeight && pinnedHeight > 0) {
    preview.style.height = `${pinnedHeight}px`;
    preview.style.overflow = 'hidden';
    preview.classList.add('is-height-pinned');
  }

  panelInsightsEl.hidden = false;
}

function markCollapseReady(body, preview) {
  if (!body.classList.contains('is-collapsed')) return;
  requestAnimationFrame(() => {
    body.classList.add('is-collapse-ready');
    const footer = preview.querySelector('.preview__footer:not(.panel-skeleton__footer)');
    if (footer) footer.style.opacity = '1';
  });
}

function finishInsightsContentTransition(preview, body, cacheKey, token, onDone) {
  if (token !== panelInsightsTransitionToken) return;

  body.classList.remove('is-content-entering');
  PanelInsightsExpand.resync(panelInsightsEl);
  markCollapseReady(body, preview);

  const settledHeight = preview.offsetHeight;
  preview.style.height = `${settledHeight}px`;
  requestAnimationFrame(() => {
    preview.style.height = '';
    preview.style.overflow = '';
    preview.classList.remove('is-height-animating', 'is-height-pinned');
  });

  panelInsightsTransitionActive = false;
  if (cacheKey) panelInsightsRenderedKey = cacheKey;
  onDone?.();
}

function fadeInsightsContentEnter(body, preview, cacheKey, token, onDone) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (token !== panelInsightsTransitionToken) return;
      body.classList.add('is-content-entering');
    });
  });

  const complete = () => {
    finishInsightsContentTransition(preview, body, cacheKey, token, onDone);
  };

  setTimeout(complete, PANEL_INSIGHTS_CONTENT_FADE_MS + 40);
}

function mountInsightsContent(html, { animate = false, cacheKey = null } = {}) {
  const { preview, body } = ensureInsightsPreviewFrame();
  clearPreviewFrameStyles(preview, body);
  body.className = 'preview__body';
  body.innerHTML = extractPreviewInnerHtml(html);
  PanelInsightsExpand.setup(panelInsightsEl, { syncImmediately: true });

  if (animate) {
    const token = panelInsightsTransitionToken;
    fadeInsightsContentEnter(body, preview, cacheKey, token);
  } else {
    markCollapseReady(body, preview);
    if (cacheKey) panelInsightsRenderedKey = cacheKey;
  }

  panelInsightsEl.hidden = false;
}

function maybeAttachInsights(exportPayload, state, scrapedData) {
  if (!includeInsightsInExport) return exportPayload;
  const scope = getInsightsScope(state, scrapedData);
  const insights = PanelInsights.buildInsightsPayloadForState(state, scrapedData, {
    scope,
    duration: state.duration || '30',
  });
  if (PanelInsights.insightsPayloadHasContent(insights)) {
    exportPayload.insights = insights;
  }
  return exportPayload;
}

function csvFromRows(rows) {
  return ExportFormat.csvFromRows(rows);
}

function appendInsightsToCsvRows(rows, data) {
  if (!data?.insights) return rows;
  return [...rows, ...PanelInsights.insightsToCsvRows(data.insights)];
}

function appendInsightsToMarkdown(md, data) {
  if (!data?.insights) return md;
  const footer = '\n---\n\n*Exported from Figma Analytics Export*\n';
  const body = md.endsWith(footer) ? md.slice(0, -footer.length) : md;
  return body + PanelInsights.insightsToMarkdown(data.insights) + footer;
}

function cancelPanelInsightsTransition() {
  panelInsightsTransitionToken += 1;
  panelInsightsTransitionActive = false;
  panelInsightsPendingContent = null;
  panelInsightsEl.classList.remove('is-content-fading-out');
  panelInsightsEl.style.height = '';
  panelInsightsEl.style.overflow = '';
  const preview = panelInsightsEl.querySelector(':scope > .preview');
  const body = preview?.querySelector('.preview__body');
  clearPreviewFrameStyles(preview, body);
}

function measureInsightsHeight(html, width) {
  if (!html || !width) return 0;

  const measure = document.createElement('div');
  measure.className = 'panel-insights panel-insights--measure';
  measure.style.cssText =
    'position:absolute;left:-9999px;top:0;visibility:hidden;pointer-events:none;width:' +
    `${width}px`;
  measure.innerHTML = html;
  document.body.appendChild(measure);
  PanelInsightsExpand.setup(measure, { syncImmediately: true });
  const preview = measure.querySelector('.preview');
  const height = preview?.offsetHeight || measure.offsetHeight;
  measure.remove();
  return height;
}

function renderPanelInsightsImmediate(html, cacheKey) {
  cancelPanelInsightsTransition();
  if (cacheKey === PANEL_SKELETON_KEY) {
    mountInsightsSkeleton();
  } else {
    mountInsightsContent(html, { cacheKey });
  }
  panelInsightsRenderedKey = cacheKey;
}

function fadeInsightsContentToSkeleton() {
  if (panelInsightsTransitionActive) return;
  panelInsightsTransitionActive = true;

  const token = ++panelInsightsTransitionToken;
  const { preview, body } = ensureInsightsPreviewFrame();
  const footer = preview.querySelector('.preview__footer:not(.panel-skeleton__footer)');

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (token !== panelInsightsTransitionToken) return;
      body.classList.add('is-content-exiting');
      if (footer) footer.classList.add('is-content-exiting');
    });
  });

  const swap = () => {
    if (token !== panelInsightsTransitionToken) return;
    mountInsightsSkeleton({ preserveHeight: true });
    panelInsightsRenderedKey = PANEL_SKELETON_KEY;
    panelInsightsTransitionActive = false;

    const pending = panelInsightsPendingContent;
    panelInsightsPendingContent = null;
    if (pending) {
      requestAnimationFrame(() => {
        renderPanelInsights(pending.html, pending.cacheKey);
      });
    }
  };

  setTimeout(swap, PANEL_INSIGHTS_FADE_MS + 40);
}

function transitionInsightsSkeletonToContent(html, cacheKey) {
  if (panelInsightsTransitionActive) return;
  panelInsightsTransitionActive = true;

  const token = ++panelInsightsTransitionToken;
  const { preview } = ensureInsightsPreviewFrame();
  const fromHeight = preview.offsetHeight;
  const body = preview.querySelector('.preview__body');

  preview.querySelector('.panel-skeleton__footer')?.remove();
  body.className = 'preview__body';
  body.innerHTML = extractPreviewInnerHtml(html);
  body.style.opacity = '0';
  PanelInsightsExpand.setup(panelInsightsEl, {
    syncImmediately: true,
    deferLayoutSync: true,
  });

  const toHeight = preview.offsetHeight || measureInsightsHeight(html, panelInsightsEl.offsetWidth);
  if (!toHeight) {
    body.style.opacity = '';
    panelInsightsTransitionActive = false;
    mountInsightsContent(html, { cacheKey });
    return;
  }

  preview.classList.remove('is-height-pinned');
  preview.style.height = `${fromHeight}px`;
  preview.style.overflow = 'hidden';
  preview.classList.add('is-height-animating');
  panelInsightsEl.hidden = false;

  let finished = false;
  const complete = () => {
    if (finished || token !== panelInsightsTransitionToken) return;
    finished = true;
    preview.removeEventListener('transitionend', onHeightEnd);
    body.style.opacity = '';
    finishInsightsContentTransition(preview, body, cacheKey, token);
  };

  const onHeightEnd = (event) => {
    if (event.target !== preview || event.propertyName !== 'height') return;
    complete();
  };

  preview.addEventListener('transitionend', onHeightEnd);
  setTimeout(complete, PANEL_INSIGHTS_HEIGHT_MS + PANEL_INSIGHTS_CONTENT_FADE_MS + 80);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (token !== panelInsightsTransitionToken) return;
      body.style.opacity = '';
      body.classList.add('is-content-entering');
      preview.style.height = `${toHeight}px`;
    });
  });
}

function renderPanelInsights(html, cacheKey = null) {
  if (html) {
    if (cacheKey && cacheKey === panelInsightsRenderedKey) {
      panelInsightsEl.hidden = false;
      return;
    }

    if (panelInsightsTransitionActive) {
      panelInsightsEl.hidden = false;
      return;
    }

    const isSkeleton = cacheKey === PANEL_SKELETON_KEY;
    const hadSkeleton = panelInsightsRenderedKey === PANEL_SKELETON_KEY;
    const hadContent = Boolean(panelInsightsRenderedKey && !hadSkeleton);
    const hasLivePreview = Boolean(
      panelInsightsEl.querySelector('.preview__body:not(.is-skeleton)')
    );

    if (isSkeleton) {
      if (hadContent && hasLivePreview) {
        panelInsightsPendingContent = null;
        fadeInsightsContentToSkeleton();
        return;
      }
      if (hadSkeleton && panelInsightsEl.querySelector('.preview__body.is-skeleton')) {
        panelInsightsEl.hidden = false;
        panelInsightsRenderedKey = PANEL_SKELETON_KEY;
        return;
      }
      renderPanelInsightsImmediate(html, cacheKey);
      return;
    }

    if (hadContent && hasLivePreview && cacheKey !== panelInsightsRenderedKey) {
      panelInsightsPendingContent = { html, cacheKey };
      fadeInsightsContentToSkeleton();
      return;
    }

    if (hadSkeleton && panelInsightsEl.querySelector(':scope > .preview')?.offsetHeight > 0) {
      transitionInsightsSkeletonToContent(html, cacheKey);
      return;
    }

    renderPanelInsightsImmediate(html, cacheKey);
  } else {
    cancelPanelInsightsTransition();
    panelInsightsEl.innerHTML = '';
    panelInsightsEl.hidden = true;
    panelInsightsRenderedKey = null;
  }
}

function clearPanelInsights() {
  panelInsightsRequest += 1;
  cancelPanelInsightsTransition();
  insightsLoading = false;
  panelInsightsInFlight = false;
  lastInsightsScheduleKey = '';
  if (panelInsightsTimer) {
    clearTimeout(panelInsightsTimer);
    panelInsightsTimer = null;
  }
  panelInsightsCache = { key: null, html: null, data: null, payload: null };
  panelInsightsRenderedKey = null;
  panelInsightsEl.innerHTML = '';
  panelInsightsEl.hidden = true;
  updateIncludeInsightsControl();
}

function schedulePanelInsightsRefresh(delayMs = 400, { force = false } = {}) {
  const scheduleKey = getInsightsScheduleKey(analyticsState);
  if (!force && panelInsightsTimer && scheduleKey === lastInsightsScheduleKey) {
    return;
  }
  lastInsightsScheduleKey = scheduleKey;
  if (panelInsightsTimer) clearTimeout(panelInsightsTimer);
  panelInsightsTimer = setTimeout(() => {
    panelInsightsTimer = null;
    refreshPanelInsights();
  }, delayMs);
}

function ensurePanelInsightsFetch(state) {
  if (!shouldShowPanelInsights(state) || !isPageDataReady(state)) return;
  if (hasExportCache(state)) {
    if (!panelInsightsCache.html && !insightsLoading) {
      presentInsightsFromCache(getPanelInsightsKey(state), state, panelInsightsCache.data);
    }
    return;
  }
  if (panelInsightsInFlight || panelInsightsTimer) return;

  insightsLoading = true;
  schedulePanelInsightsRefresh(0, { force: true });
}

async function scrapeInsightsData(tabId, state) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (snapshot) => {
      const S = window.FigmaAnalyticsScraper;
      const dialog = S.findAnalyticsDialog();
      if (!dialog) return { error: 'No Library Analytics modal found.' };

      if (snapshot.kind === 'components' && snapshot.depth === 'list') {
        return S.scrapeComponentListFromPage(dialog);
      }
      if (snapshot.kind === 'components' && snapshot.depth === 'detail') {
        return S.scrapeLibraryAnalyticsFromPage(dialog);
      }
      if (
        snapshot.kind === 'components' &&
        (snapshot.depth === 'variant' || snapshot.depth === 'component')
      ) {
        return S.scrapeFileUsageDetailFromPage(dialog, 'components');
      }
      if (snapshot.kind === 'styles' && snapshot.depth === 'list') {
        return S.scrapeStyleListFromPage(dialog);
      }
      if (snapshot.kind === 'styles' && snapshot.depth === 'detail') {
        return S.scrapeFileUsageDetailFromPage(dialog, 'styles');
      }
      if (snapshot.kind === 'variables' && snapshot.depth === 'list') {
        return S.scrapeVariableListFromPage(dialog);
      }
      if (snapshot.kind === 'variables' && snapshot.depth === 'detail') {
        return S.scrapeFileUsageDetailFromPage(dialog, 'variables');
      }
      return null;
    },
    args: [
      {
        kind: state.kind,
        depth: state.depth,
        variablesSubTab: state.variablesSubTab,
      },
    ],
  });

  return results[0]?.result;
}

function presentInsightsFromCache(key, state, data) {
  const scope = getInsightsScope(state, data);
  const payload = PanelInsights.buildInsightsPayloadForState(state, data, {
    scope,
    duration: state.duration || '30',
  });
  const html = PanelInsights.insightsPayloadHasContent(payload)
    ? PanelInsights.renderInsightBarsFromPayload(payload)
    : payload.scope
      ? PanelInsights.renderInsightBars([], { scope: payload.scope })
      : '';
  panelInsightsCache = { key, html, data, payload };
  insightsLoading = false;
  renderPanelInsights(html, key);
  updateIncludeInsightsControl();
}

function cacheScrapedViewData(key, state, data) {
  panelInsightsCache = { key, html: null, data, payload: null };
  insightsLoading = true;
  applyUI();

  requestAnimationFrame(() => {
    if (panelInsightsCache.key !== key || panelInsightsCache.data !== data) return;
    presentInsightsFromCache(key, state, data);
  });
}

async function refreshPanelInsights() {
  const state = analyticsState;
  if (!shouldShowPanelInsights(state)) {
    clearPanelInsights();
    return;
  }

  if (isDownloading) {
    updatePanelInsights(state);
    return;
  }

  if (!isPageDataReady(state)) {
    insightsLoading = false;
    if (isPanelContentLoading(state)) {
      renderPanelInsights(buildPanelInsightsSkeletonHtml(), PANEL_SKELETON_KEY);
    } else {
      panelInsightsRenderedKey = null;
      panelInsightsEl.innerHTML = '';
      panelInsightsEl.hidden = true;
    }
    return;
  }

  const key = getPanelInsightsKey(state);
  if (hasCachedInsights(state)) {
    insightsLoading = false;
    renderPanelInsights(panelInsightsCache.html, panelInsightsCache.key);
    return;
  }

  if (hasExportCache(state)) {
    if (panelInsightsRenderedKey !== PANEL_SKELETON_KEY) {
      renderPanelInsights(buildPanelInsightsSkeletonHtml(), PANEL_SKELETON_KEY);
    }
    presentInsightsFromCache(key, state, panelInsightsCache.data);
    return;
  }

  insightsLoading = true;
  panelInsightsInFlight = true;
  renderPanelInsights(buildPanelInsightsSkeletonHtml(), PANEL_SKELETON_KEY);

  const requestId = ++panelInsightsRequest;
  const tabId = await resolveActiveTabId();
  if (!tabId || requestId !== panelInsightsRequest) {
    panelInsightsInFlight = false;
    ensurePanelInsightsFetch(analyticsState);
    return;
  }

  try {
    await ensureScraperInjected(tabId);
    activeTabId = tabId;
    const data = await scrapeInsightsData(tabId, state);

    if (requestId !== panelInsightsRequest) return;
    if (!data || data.error) {
      insightsLoading = true;
      renderPanelInsights(buildPanelInsightsSkeletonHtml(), PANEL_SKELETON_KEY);
      schedulePanelInsightsRefresh(1200, { force: true });
      return;
    }

    cacheScrapedViewData(key, state, data);
  } catch (_) {
    if (requestId !== panelInsightsRequest) return;
    insightsLoading = true;
    renderPanelInsights(buildPanelInsightsSkeletonHtml(), PANEL_SKELETON_KEY);
    schedulePanelInsightsRefresh(1200, { force: true });
  } finally {
    if (requestId === panelInsightsRequest) {
      panelInsightsInFlight = false;
    }
  }
}

function updatePanelInsights(state) {
  if (!shouldShowPanelInsights(state)) {
    clearPanelInsights();
    return;
  }

  if (hasCachedInsights(state)) {
    insightsLoading = false;
    renderPanelInsights(panelInsightsCache.html, panelInsightsCache.key);
    return;
  }

  if (isPanelContentLoading(state)) {
    renderPanelInsights(buildPanelInsightsSkeletonHtml(), PANEL_SKELETON_KEY);
    if (isPageDataReady(state)) {
      ensurePanelInsightsFetch(state);
    }
    return;
  }

  panelInsightsRenderedKey = null;
  panelInsightsEl.innerHTML = '';
  panelInsightsEl.hidden = true;
}

initPanel();

// ──────────────────────────────────────────────
// Download what's visible (uses cached scrape — instant)
// ──────────────────────────────────────────────
function exportCachedView(action, format) {
  const data = panelInsightsCache.data;
  if (!data) throw new Error('No cached data for this view.');

  switch (action.mode) {
    case 'list':
      downloadComponentList(data.components, data.libraryName, format);
      break;
    case 'styles-list':
      downloadStyleList(data.styles, data.libraryName, format);
      break;
    case 'variables-list':
      downloadVariableList(data, format);
      break;
    case 'file-usage':
      downloadFileUsageData(data, format);
      break;
    case 'variants':
      downloadVariantData(data, format);
      break;
    default:
      throw new Error('Unsupported export mode.');
  }
}

async function downloadVisible() {
  const action = getDownloadAction(analyticsState);
  if (!action.enabled || isDownloading || !hasExportCache(analyticsState)) return;

  isDownloading = true;
  applyUI();

  try {
    exportCachedView(action, selectedFormat);
  } catch (err) {
    console.error('Download error:', err);
    setStatus('Error: ' + err.message, 'error');
  } finally {
    isDownloading = false;
    applyUI();
  }
}

async function ensureScraperInjected(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['scraper.js'],
    });
  } catch (_) {
    /* may already be injected */
  }
}

// ──────────────────────────────────────────────
// Analysis: Property usage from variant data
// ──────────────────────────────────────────────
function analyzePropertyUsage(variants) {
  return PanelInsights.analyzePropertyUsage(variants);
}

// ──────────────────────────────────────────────
// Export helpers
// ──────────────────────────────────────────────
function getDownloadStatusMessage(mode) {
  switch (mode) {
    case 'list':
      return 'Scanning component list…';
    case 'styles-list':
      return 'Scanning style list…';
    case 'variables-list':
      return 'Scanning variable list…';
    case 'file-usage':
      return 'Scraping file usage…';
    case 'variants':
      return 'Scraping variants…';
    default:
      return 'Exporting…';
  }
}

function downloadComponentList(components, libraryName, format) {
  const timestamp = new Date().toISOString().split('T')[0];
  const scrapedData = { components, libraryName };
  const exportPayload = maybeAttachInsights(
    {
      libraryName: libraryName || analyticsState.libraryName || 'Library Analytics',
      viewType: 'All Components',
      componentCount: components.length,
      components,
      scrapedAt: new Date().toISOString(),
    },
    analyticsState,
    scrapedData
  );

  if (format === 'csv') {
    downloadFile(generateLibraryCsv(exportPayload), `library-analytics-${timestamp}.csv`, 'text/csv;charset=utf-8;');
  } else if (format === 'json') {
    downloadFile(JSON.stringify(exportPayload, null, 2), `library-analytics-${timestamp}.json`, 'application/json');
  } else if (format === 'md') {
    downloadFile(generateLibraryMarkdown(exportPayload), `library-analytics-${timestamp}.md`, 'text/markdown');
  }
}

function downloadVariantData(data, format) {
  const timestamp = new Date().toISOString().split('T')[0];
  const safeName = ExportFormat.sanitizeFilename(data.componentName);
  const exportPayload = maybeAttachInsights({ ...data }, analyticsState, data);

  if (format === 'csv') {
    downloadFile(generateCsv(exportPayload), `${safeName}-analytics-${timestamp}.csv`, 'text/csv;charset=utf-8;');
  } else if (format === 'json') {
    downloadFile(JSON.stringify(exportPayload, null, 2), `${safeName}-analytics-${timestamp}.json`, 'application/json');
  } else if (format === 'md') {
    downloadFile(generateMarkdown(exportPayload), `${safeName}-analytics-${timestamp}.md`, 'text/markdown');
  }
}

function downloadStyleList(styles, libraryName, format) {
  const timestamp = new Date().toISOString().split('T')[0];
  const scrapedData = { styles, libraryName };
  const exportPayload = maybeAttachInsights(
    {
      libraryName: libraryName || analyticsState.libraryName || 'Library Analytics',
      viewType: 'All Styles',
      styleCount: styles.length,
      styles,
      scrapedAt: new Date().toISOString(),
    },
    analyticsState,
    scrapedData
  );

  if (format === 'csv') {
    downloadFile(generateStyleListCsv(exportPayload), `library-styles-${timestamp}.csv`, 'text/csv;charset=utf-8;');
  } else if (format === 'json') {
    downloadFile(JSON.stringify(exportPayload, null, 2), `library-styles-${timestamp}.json`, 'application/json');
  } else if (format === 'md') {
    downloadFile(generateStyleListMarkdown(exportPayload), `library-styles-${timestamp}.md`, 'text/markdown');
  }
}

function downloadVariableList(data, format) {
  const timestamp = new Date().toISOString().split('T')[0];
  const isModes = data.variablesSubTab === 'modes';
  const entries = isModes ? data.modes : data.variables;
  const exportPayload = maybeAttachInsights(
    {
      libraryName: data.libraryName || analyticsState.libraryName || 'Library Analytics',
      viewType: isModes ? 'All Modes' : 'All Variables',
      variablesSubTab: data.variablesSubTab || 'variables',
      entryCount: data.entryCount || entries?.length || 0,
      variables: isModes ? undefined : entries,
      modes: isModes ? entries : undefined,
      scrapedAt: new Date().toISOString(),
    },
    analyticsState,
    data
  );
  const baseName = isModes ? `library-modes-${timestamp}` : `library-variables-${timestamp}`;

  if (format === 'csv') {
    downloadFile(
      isModes ? generateModeListCsv(exportPayload) : generateVariableListCsv(exportPayload),
      `${baseName}.csv`,
      'text/csv;charset=utf-8;'
    );
  } else if (format === 'json') {
    downloadFile(JSON.stringify(exportPayload, null, 2), `${baseName}.json`, 'application/json');
  } else if (format === 'md') {
    downloadFile(
      isModes ? generateModeListMarkdown(exportPayload) : generateVariableListMarkdown(exportPayload),
      `${baseName}.md`,
      'text/markdown'
    );
  }
}

function downloadFileUsageData(data, format) {
  const timestamp = new Date().toISOString().split('T')[0];
  const safeName = ExportFormat.sanitizeFilename(data.itemName);
  const kindLabel = ExportFormat.fileUsageExportSlug(data.itemKind);
  const exportPayload = maybeAttachInsights({ ...data }, analyticsState, data);

  if (format === 'csv') {
    downloadFile(generateFileUsageCsv(exportPayload), `${safeName}-${kindLabel}-usage-${timestamp}.csv`, 'text/csv;charset=utf-8;');
  } else if (format === 'json') {
    downloadFile(JSON.stringify(exportPayload, null, 2), `${safeName}-${kindLabel}-usage-${timestamp}.json`, 'application/json');
  } else if (format === 'md') {
    downloadFile(generateFileUsageMarkdown(exportPayload), `${safeName}-${kindLabel}-usage-${timestamp}.md`, 'text/markdown');
  }
}

function generateStyleListCsv(data) {
  return csvFromRows(appendInsightsToCsvRows(ExportFormat.styleListCsvRows(data), data));
}

function generateStyleListMarkdown(data) {
  return appendInsightsToMarkdown(ExportFormat.generateStyleListMarkdown(data), data);
}

function generateVariableListCsv(data) {
  return csvFromRows(appendInsightsToCsvRows(ExportFormat.variableListCsvRows(data), data));
}

function generateVariableListMarkdown(data) {
  return appendInsightsToMarkdown(ExportFormat.generateVariableListMarkdown(data), data);
}

function generateModeListCsv(data) {
  return csvFromRows(appendInsightsToCsvRows(ExportFormat.modeListCsvRows(data), data));
}

function generateModeListMarkdown(data) {
  return appendInsightsToMarkdown(ExportFormat.generateModeListMarkdown(data), data);
}

function generateFileUsageCsv(data) {
  return csvFromRows(appendInsightsToCsvRows(ExportFormat.fileUsageCsvRows(data), data));
}

function generateFileUsageMarkdown(data) {
  return appendInsightsToMarkdown(ExportFormat.generateFileUsageMarkdown(data), data);
}

function generateLibraryCsv(data) {
  return csvFromRows(appendInsightsToCsvRows(ExportFormat.libraryCsvRows(data), data));
}

function generateLibraryMarkdown(data) {
  return appendInsightsToMarkdown(ExportFormat.generateLibraryMarkdown(data), data);
}

function generateCsv(data) {
  return csvFromRows(appendInsightsToCsvRows(ExportFormat.variantCsvRows(data), data));
}

function generateMarkdown(data) {
  return appendInsightsToMarkdown(ExportFormat.generateVariantMarkdown(data), data);
}

function downloadFile(content, filename, mimeType) {
  const normalized =
    typeof content === 'string' ? content.replace(/\u2028|\u2029/g, '\n') : content;
  const blob = new Blob([normalized], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function clearErrorStatus() {
  if (!feedbackEl.hidden && feedbackEl.classList.contains('error')) {
    setStatus('', 'info');
  }
}

function setStatus(message, type = 'info') {
  if (!message || type !== 'error') {
    feedbackEl.hidden = true;
    feedbackEl.textContent = '';
    return;
  }
  feedbackEl.hidden = false;
  feedbackEl.textContent = message;
  feedbackEl.className = 'feedback error';
}
