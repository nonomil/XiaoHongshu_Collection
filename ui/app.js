const linksForm = document.getElementById('links-form');
const linksText = document.getElementById('links-text');
const linksSubmit = document.getElementById('links-submit');
const linksClear = document.getElementById('links-clear');
const collectionSubmit = document.getElementById('collection-submit');
const zhihuFavoritesUrl = document.getElementById('zhihu-favorites-url');
const zhihuFavoritesTitle = document.getElementById('zhihu-favorites-title');
const zhihuFavoritesLimit = document.getElementById('zhihu-favorites-limit');
const zhihuFavoritesSubmit = document.getElementById('zhihu-favorites-submit');
const collectionSourceButtons = Array.from(document.querySelectorAll('[data-collection-source]'));
const collectionSourcePanels = Array.from(document.querySelectorAll('[data-collection-panel]'));
const refreshBrowserStatusButton = document.getElementById('refresh-browser-status');
const browserStatusSummary = document.getElementById('browser-status-summary');
const browserStatusDetail = document.getElementById('browser-status-detail');
const inboxSyncButton = document.getElementById('inbox-sync');
const inboxSyncAllTopButton = document.getElementById('inbox-sync-all-top');
const inboxSyncLatestButton = document.getElementById('inbox-sync-latest');
const inboxSyncAllButton = document.getElementById('inbox-sync-all');
const inboxSaveButton = document.getElementById('inbox-save');
const inboxSyncWindowInputs = Array.from(document.querySelectorAll('input[name="inbox-sync-window"]'));
const inboxSyncCustomValue = document.getElementById('inbox-sync-custom-value');
const inboxSyncCustomUnit = document.getElementById('inbox-sync-custom-unit');
const statusText = document.getElementById('status-text');
const resultOutput = document.getElementById('result-output');
const resultSummary = document.getElementById('result-summary');
const rawReport = document.getElementById('raw-report');
const progressList = document.getElementById('progress-list');
const taskLogPanel = document.getElementById('task-log-panel');
const taskLogList = document.getElementById('task-log-list');
const summaryRow = document.getElementById('summary-row');
const retryFailedResultsButton = document.getElementById('retry-failed-results');
const openOutputFolderButton = document.getElementById('open-output-folder');
const errorBanner = document.getElementById('error-banner');
const errorTitle = document.getElementById('error-title');
const errorMessage = document.getElementById('error-message');
const errorHints = document.getElementById('error-hints');
const errorActions = document.getElementById('error-actions');
const errorDismiss = document.getElementById('error-dismiss');

const openSettingsButton = document.getElementById('open-settings');
const closeSettingsButton = document.getElementById('close-settings');
const settingsOverlay = document.getElementById('settings-overlay');
const settingsModal = document.getElementById('settings-modal');
const workspaceNavLinks = Array.from(document.querySelectorAll('.workspace-nav-link[href^="#"]'));
const workspaceSettingsButtons = Array.from(document.querySelectorAll('[data-open-settings="true"]'));
const settingsTabButtons = Array.from(document.querySelectorAll('[data-settings-tab]'));
const settingsPanels = Array.from(document.querySelectorAll('[data-settings-panel]'));

const configForm = document.getElementById('config-form');
const configStatus = document.getElementById('config-status');
const configReload = document.getElementById('config-reload');
const configSave = document.getElementById('config-save');

const pathLinksOutput = document.getElementById('path-links-output');
const pathLinksImages = document.getElementById('path-links-images');
const pathCollectionOutput = document.getElementById('path-collection-output');
const pathCollectionRaw = document.getElementById('path-collection-raw');
const browserMode = document.getElementById('browser-mode');
const browserChannel = document.getElementById('browser-channel');
const browserUrl = document.getElementById('browser-url');
const browserHeadless = document.getElementById('browser-headless');
const openLoginBrowserButton = document.getElementById('open-login-browser');
const namingStrategy = document.getElementById('naming-strategy');
const namingMaxLength = document.getElementById('naming-max-length');
const runtimeAi = document.getElementById('runtime-ai');
const runtimeAutoClassify = document.getElementById('runtime-auto-classify');
const runtimeVision = document.getElementById('runtime-vision');
const runtimeOcrFallback = document.getElementById('runtime-ocr-fallback');
const runtimeOpenrouterBaseUrl = document.getElementById('runtime-openrouter-base-url');
const runtimeOpenrouterApiKey = document.getElementById('runtime-openrouter-api-key');
const runtimeOpenrouterModel = document.getElementById('runtime-openrouter-model');
const runtimeOpenrouterTestButton = document.getElementById('runtime-openrouter-test');
const runtimeOpenrouterTestStatus = document.getElementById('runtime-openrouter-test-status');
const runtimeOpenrouterTimeout = document.getElementById('runtime-openrouter-timeout');
const runtimeVisionTimeout = document.getElementById('runtime-vision-timeout');
const runtimeMaxImages = document.getElementById('runtime-max-images');
const pushbulletEnabled = document.getElementById('pushbullet-enabled');
const pushbulletToken = document.getElementById('pushbullet-token');
const inboxPath = document.getElementById('inbox-path');
const inboxCategories = document.getElementById('inbox-categories');
const uiShowRaw = document.getElementById('ui-show-raw');
const taskHistoryList = document.getElementById('task-history-list');
const videoNotesOpenFolderButton = document.querySelector('[data-video-notes-open-folder]');
const videoNotesStartWebButton = document.querySelector('[data-video-notes-start-web]');
const videoNotesStatus = document.getElementById('video-notes-status');

let currentConfig = null;
let progressItems = new Map();
let lastReport = null;
let lastInboxSyncReport = null;
let lastInboxSyncUrls = [];
let lastSummaryReportRef = null;
let activeResultFilter = 'all';
let activeWarningCodeFilter = '';
let activeFailureStageFilter = '';
let activeSettingsTab = '';
let activeCollectionSource = '';
let workspaceNavRefreshTimer = 0;
let resultActionStateMap = new Map();
let bulkResultActionState = null;
let activeTaskLogScope = '';

const SETTINGS_TAB_STORAGE_KEY = 'xhs-ui-settings-tab';
const COLLECTION_SOURCE_STORAGE_KEY = 'xhs-ui-collection-source';
const TASK_HISTORY_STORAGE_KEY = 'xhs-ui-task-history';
const TASK_HISTORY_LIMIT = 8;
const TASK_LOG_LIMIT = 120;
const UNCLASSIFIED_FAILURE_LABEL = '未归类失败';
const INBOX_SYNC_WINDOW_LABELS = {
  today: '今天',
  '7d': '最近 7 天',
  '30d': '最近 30 天',
  '60d': '最近 60 天',
  '2m': '最近 2 个月'
};

function resolveResultLink(item) {
  if (!item) return '';
  return [item.input, item.navigationUrl, item.canonicalUrl, item.sourceUrl, item.url]
    .map((value) => String(value || '').trim())
    .find(Boolean) || '';
}

function collectUniqueResultLinks(items = []) {
  const inputs = [];
  const seen = new Set();

  items.forEach((item) => {
    const candidate = resolveResultLink(item);
    if (!candidate || seen.has(candidate)) return;
    seen.add(candidate);
    inputs.push(candidate);
  });

  return inputs;
}

function collectRetryInputs(report = lastReport) {
  return collectRetryInputsForScope(report);
}

function collectRetryItemsForScope(report = lastReport, { visibleOnly = false, failedOnly = false } = {}) {
  const results = Array.isArray(report?.results) ? report.results : [];
  return results.filter((item) => {
    if (visibleOnly && !matchResultFilters(item, deriveResultGroupKey(item))) {
      return false;
    }
    if (failedOnly) {
      return item?.status === 'failed' && Boolean(resolveResultLink(item));
    }
    return shouldRetryVisibleResultItem(item);
  });
}

function collectRetryInputsForScope(report = lastReport, options = {}) {
  return collectUniqueResultLinks(collectRetryItemsForScope(report, options));
}

function isSameResultLinkSet(left = [], right = []) {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((item) => rightSet.has(item));
}

function readRetryButtonState(report = lastReport) {
  const hasResults = Array.isArray(report?.results) && report.results.length > 0;
  if (!hasResults) {
    return {
      enabled: false,
      label: '重试异常项',
      title: '当前没有可重试的结果',
      inputs: [],
      scope: 'none'
    };
  }

  const visibleInputs = collectRetryInputsForScope(report, { visibleOnly: true });
  const allInputs = collectRetryInputsForScope(report);
  const failedInputs = collectRetryInputsForScope(report, { failedOnly: true });

  if (hasActiveResultFilters()) {
    if (visibleInputs.length === 0) {
      return {
        enabled: false,
        label: '当前筛选暂无可重试项',
        title: '当前筛选结果里没有可继续重试的异常项',
        inputs: [],
        scope: 'visible'
      };
    }
    return {
      enabled: true,
      label: `重试当前筛选 ${visibleInputs.length} 条`,
      title: '只会重试当前筛选结果里的异常项',
      inputs: visibleInputs,
      scope: 'visible'
    };
  }

  if (allInputs.length === 0) {
    return {
      enabled: false,
      label: '当前暂无可重试项',
      title: '当前报告没有可继续重试的异常项',
      inputs: [],
      scope: 'none'
    };
  }

  const failedOnly = isSameResultLinkSet(allInputs, failedInputs);
  return {
    enabled: true,
    label: failedOnly
      ? `重试失败项 ${failedInputs.length} 条`
      : `重试异常项 ${allInputs.length} 条`,
    title: failedOnly
      ? '会重新执行当前报告中的失败结果'
      : '会重新执行失败项，以及登录门槛或评论提示项',
    inputs: allInputs,
    scope: failedOnly ? 'failed' : 'all'
  };
}

function syncOpenOutputButtonState(isBusy = false) {
  if (!openOutputFolderButton) return;
  openOutputFolderButton.disabled = isBusy || !lastReport;
}

function syncRetryFailedButtonState(isBusy = false, report = lastReport) {
  if (!retryFailedResultsButton) return;
  const state = readRetryButtonState(report);
  retryFailedResultsButton.disabled = isBusy || !state.enabled;
  retryFailedResultsButton.textContent = state.label;
  retryFailedResultsButton.title = state.title;
  retryFailedResultsButton.dataset.retryScope = state.scope;
}

function getWorkspaceNavHash(link) {
  if (!link || typeof link.getAttribute !== 'function') return '';
  return String(link.getAttribute('href') || '').trim();
}

function resolveWorkspaceNavHash(candidate = '') {
  const hashes = workspaceNavLinks
    .map((link) => getWorkspaceNavHash(link))
    .filter(Boolean);
  if (hashes.length === 0) return '';
  if (candidate && hashes.includes(candidate)) return candidate;
  return hashes[0];
}

function setActiveWorkspaceNav(hash = '') {
  const nextHash = resolveWorkspaceNavHash(hash);
  if (!nextHash) return;
  workspaceNavLinks.forEach((link) => {
    const isActive = getWorkspaceNavHash(link) === nextHash;
    link.dataset.active = isActive ? 'true' : 'false';
    if (isActive) {
      link.setAttribute('aria-current', 'location');
    } else {
      link.removeAttribute('aria-current');
    }
  });
}

function resolveWorkspaceNavHashFromViewport() {
  if (workspaceNavLinks.length === 0 || typeof window === 'undefined') {
    return '';
  }
  const focusLine = Math.max(120, Math.min(window.innerHeight * 0.28, 260));
  let selectedHash = '';
  let smallestDistance = Number.POSITIVE_INFINITY;

  workspaceNavLinks.forEach((link) => {
    const hash = getWorkspaceNavHash(link);
    if (!hash) return;
    const section = document.querySelector(hash);
    if (!section || typeof section.getBoundingClientRect !== 'function') return;
    const rect = section.getBoundingClientRect();
    const isVisible = rect.bottom > focusLine && rect.top < window.innerHeight;
    const distance = Math.abs(rect.top - focusLine);
    if (!isVisible || distance >= smallestDistance) return;
    selectedHash = hash;
    smallestDistance = distance;
  });

  if (selectedHash) return selectedHash;
  return window.location.hash || resolveWorkspaceNavHash('');
}

function refreshWorkspaceNavFromViewport() {
  workspaceNavRefreshTimer = 0;
  setActiveWorkspaceNav(resolveWorkspaceNavHashFromViewport());
}

function scheduleWorkspaceNavRefresh() {
  if (workspaceNavRefreshTimer || typeof window === 'undefined') return;
  const runner = window.requestAnimationFrame
    ? window.requestAnimationFrame.bind(window)
    : (callback) => window.setTimeout(callback, 16);
  workspaceNavRefreshTimer = runner(() => {
    refreshWorkspaceNavFromViewport();
  });
}

function setBusy(isBusy, message) {
  linksSubmit.disabled = isBusy;
  collectionSubmit.disabled = isBusy;
  if (zhihuFavoritesSubmit) zhihuFavoritesSubmit.disabled = isBusy;
  if (inboxSyncButton) inboxSyncButton.disabled = isBusy;
  if (inboxSyncAllTopButton) inboxSyncAllTopButton.disabled = isBusy;
  if (inboxSyncLatestButton) inboxSyncLatestButton.disabled = isBusy;
  if (inboxSyncAllButton) inboxSyncAllButton.disabled = isBusy;
  if (inboxSaveButton) inboxSaveButton.disabled = isBusy;
  if (openLoginBrowserButton) openLoginBrowserButton.disabled = isBusy;
  if (videoNotesOpenFolderButton) videoNotesOpenFolderButton.disabled = isBusy;
  if (videoNotesStartWebButton) videoNotesStartWebButton.disabled = isBusy;
  if (runtimeOpenrouterTestButton) runtimeOpenrouterTestButton.disabled = isBusy;
  configSave.disabled = isBusy;
  configReload.disabled = isBusy;
  syncRetryFailedButtonState(isBusy);
  syncOpenOutputButtonState(isBusy);
  statusText.textContent = message;
}

function renderText(value) {
  resultOutput.textContent = value || '暂无输出';
}

function setConfigStatus(message, tone = 'muted') {
  configStatus.textContent = message;
  configStatus.dataset.tone = tone;
}

function setRuntimeOpenrouterTestStatus(message, tone = 'muted') {
  if (!runtimeOpenrouterTestStatus) return;
  runtimeOpenrouterTestStatus.textContent = message || '';
  runtimeOpenrouterTestStatus.dataset.tone = tone;
}

function setVideoNotesStatus(message = '') {
  if (!videoNotesStatus) return;
  videoNotesStatus.textContent = message;
}

function renderUtilityResult(title = '', entries = [], payload = null) {
  lastReport = null;
  resultSummary.innerHTML = '';
  syncRetryFailedButtonState(false);
  syncOpenOutputButtonState(false);

  const normalizedEntries = Array.isArray(entries) ? entries.filter((item) => item && item.label) : [];
  if (title || normalizedEntries.length > 0) {
    const block = document.createElement('div');
    block.className = 'summary-block';
    normalizedEntries.forEach((item) => {
      const row = document.createElement('div');
      const label = document.createElement('strong');
      label.textContent = item.label;
      const value = document.createElement('span');
      value.textContent = item.value || '';
      row.appendChild(label);
      row.appendChild(value);
      block.appendChild(row);
    });
    if (title) {
      block.dataset.title = title;
    }
    resultSummary.appendChild(block);
  }

  if (payload && typeof payload === 'object') {
    renderText(JSON.stringify(payload, null, 2));
    return;
  }

  const plainText = normalizedEntries
    .map((item) => `${item.label}: ${item.value || ''}`)
    .join('\n');
  renderText(plainText || title || '操作已完成');
}

const helpers = window.XhsUiHelpers || {};

function clearErrorBanner() {
  if (errorBanner) errorBanner.hidden = true;
  if (errorTitle) errorTitle.textContent = '';
  if (errorMessage) errorMessage.textContent = '';
  if (errorHints) errorHints.innerHTML = '';
  if (errorActions) {
    errorActions.innerHTML = '';
    errorActions.hidden = true;
  }
}

function renderErrorBanner(message) {
  const display = helpers.buildErrorDisplay
    ? helpers.buildErrorDisplay(message)
    : { title: '失败', message, hints: [] };
  if (errorTitle) errorTitle.textContent = display.title || '失败';
  if (errorMessage) {
    errorMessage.textContent = display.message || '未知错误，请查看日志或稍后重试。';
  }
  if (errorHints) {
    errorHints.innerHTML = '';
    (display.hints || []).forEach((hint) => {
      const item = document.createElement('li');
      item.textContent = hint;
      errorHints.appendChild(item);
    });
  }
  if (errorActions) {
    errorActions.innerHTML = '';
    const actions = Array.isArray(display.actions) ? display.actions : [];
    actions.forEach((action) => {
      const button = document.createElement('button');
      const tone = action.tone === 'secondary' || action.tone === 'ghost'
        ? action.tone
        : 'ghost';
      button.type = 'button';
      button.className = `button ${tone}`;
      button.dataset.errorAction = action.id || '';
      button.textContent = action.label || '执行';
      errorActions.appendChild(button);
    });
    errorActions.hidden = actions.length === 0;
  }
  if (errorBanner) errorBanner.hidden = false;
}

function renderSummaryRow(config) {
  summaryRow.innerHTML = '';
  const items = helpers.buildSummaryItems ? helpers.buildSummaryItems(config) : [];
  if (items.length === 0) {
    const empty = document.createElement('span');
    empty.className = 'summary-chip';
    empty.textContent = '尚未设置';
    summaryRow.appendChild(empty);
    return;
  }
  items.forEach((item) => {
    const chip = document.createElement('span');
    chip.className = 'summary-chip';
    const label = document.createElement('strong');
    label.textContent = item.label;
    const value = document.createElement('span');
    value.textContent = item.value;
    chip.appendChild(label);
    chip.appendChild(document.createTextNode(' '));
    chip.appendChild(value);
    if (item.value) {
      chip.title = item.value;
    }
    summaryRow.appendChild(chip);
  });
}

function resolveSettingsTabKey(candidate = '') {
  const availableKeys = settingsTabButtons
    .map((button) => String(button.dataset.settingsTab || '').trim())
    .filter(Boolean);
  if (availableKeys.length === 0) return '';
  if (candidate && availableKeys.includes(candidate)) return candidate;
  if (availableKeys.includes('basic')) return 'basic';
  return availableKeys[0];
}

function readStoredSettingsTab() {
  try {
    return window?.localStorage?.getItem(SETTINGS_TAB_STORAGE_KEY) || '';
  } catch (_) {
    return '';
  }
}

function persistSettingsTab(tabKey) {
  try {
    window?.localStorage?.setItem(SETTINGS_TAB_STORAGE_KEY, tabKey);
  } catch (_) {
    // 忽略无存储权限的环境
  }
}

function setActiveSettingsTab(tabKey, options = {}) {
  const nextKey = resolveSettingsTabKey(tabKey);
  if (!nextKey) return;
  const shouldPersist = options.persist !== false;
  activeSettingsTab = nextKey;

  settingsTabButtons.forEach((button) => {
    const isActive = button.dataset.settingsTab === nextKey;
    button.dataset.active = isActive ? 'true' : 'false';
    button.setAttribute('aria-selected', isActive ? 'true' : 'false');
    button.tabIndex = isActive ? 0 : -1;
  });

  settingsPanels.forEach((panel) => {
    const isActive = panel.dataset.settingsPanel === nextKey;
    panel.hidden = !isActive;
    panel.dataset.active = isActive ? 'true' : 'false';
  });

  if (shouldPersist) {
    persistSettingsTab(nextKey);
  }
}

function initializeSettingsTabs() {
  if (settingsTabButtons.length === 0 || settingsPanels.length === 0) return;
  settingsTabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      setActiveSettingsTab(button.dataset.settingsTab || '');
    });
  });
  setActiveSettingsTab(readStoredSettingsTab() || activeSettingsTab || 'basic', { persist: false });
}

function resolveCollectionSource(candidate = '') {
  const sources = collectionSourceButtons
    .map((button) => String(button.dataset.collectionSource || '').trim())
    .filter(Boolean);
  if (sources.length === 0) return '';
  if (candidate && sources.includes(candidate)) return candidate;
  if (sources.includes('xiaohongshu')) return 'xiaohongshu';
  return sources[0];
}

function readStoredCollectionSource() {
  try {
    return window?.localStorage?.getItem(COLLECTION_SOURCE_STORAGE_KEY) || '';
  } catch (_) {
    return '';
  }
}

function persistCollectionSource(source) {
  try {
    window?.localStorage?.setItem(COLLECTION_SOURCE_STORAGE_KEY, source);
  } catch (_) {
    // 忽略无存储权限的环境
  }
}

function setActiveCollectionSource(source, options = {}) {
  const nextSource = resolveCollectionSource(source);
  if (!nextSource) return;

  activeCollectionSource = nextSource;
  collectionSourceButtons.forEach((button) => {
    const isActive = button.dataset.collectionSource === nextSource;
    button.dataset.active = isActive ? 'true' : 'false';
    button.setAttribute('aria-selected', isActive ? 'true' : 'false');
    button.tabIndex = isActive ? 0 : -1;
  });
  collectionSourcePanels.forEach((panel) => {
    const isActive = panel.dataset.collectionPanel === nextSource;
    panel.hidden = !isActive;
    panel.dataset.active = isActive ? 'true' : 'false';
  });

  if (options.persist !== false) {
    persistCollectionSource(nextSource);
  }
}

function initializeCollectionSourceSwitch() {
  if (collectionSourceButtons.length === 0 || collectionSourcePanels.length === 0) return;
  collectionSourceButtons.forEach((button) => {
    button.addEventListener('click', () => {
      setActiveCollectionSource(button.dataset.collectionSource || '');
    });
  });
  setActiveCollectionSource(
    readStoredCollectionSource() || activeCollectionSource || 'xiaohongshu',
    { persist: false }
  );
}

function initializeWorkspaceNavigation() {
  if (workspaceNavLinks.length === 0) return;

  setActiveWorkspaceNav(window.location.hash || '');
  workspaceNavLinks.forEach((link) => {
    link.addEventListener('click', () => {
      setActiveWorkspaceNav(getWorkspaceNavHash(link));
      scheduleWorkspaceNavRefresh();
    });
  });
  window.addEventListener('hashchange', () => {
    setActiveWorkspaceNav(window.location.hash || '');
  });

  if (typeof window.IntersectionObserver === 'function') {
    const observer = new window.IntersectionObserver(() => {
      scheduleWorkspaceNavRefresh();
    }, {
      rootMargin: '-24% 0px -48% 0px',
      threshold: [0.2, 0.45, 0.7]
    });
    workspaceNavLinks.forEach((link) => {
      const section = document.querySelector(getWorkspaceNavHash(link));
      if (section) observer.observe(section);
    });
  } else {
    window.addEventListener('scroll', scheduleWorkspaceNavRefresh, { passive: true });
  }
}

function openSettings() {
  if (helpers.openSettingsModal) {
    helpers.openSettingsModal({ overlay: settingsOverlay, modal: settingsModal });
  } else {
    settingsOverlay.hidden = false;
    settingsModal.hidden = false;
  }
  if (!activeSettingsTab) {
    setActiveSettingsTab('basic', { persist: false });
  }
}

function closeSettings() {
  if (helpers.closeSettingsModal) {
    helpers.closeSettingsModal({ overlay: settingsOverlay, modal: settingsModal });
    return;
  }
  settingsOverlay.hidden = true;
  settingsModal.hidden = true;
}

function updateRawReportVisibility(config) {
  const show = config?.ui?.showRawReport !== false;
  rawReport.hidden = !show;
}

function createBrowserStatusPill(title, value, state = 'unknown', note = '') {
  const pill = document.createElement('article');
  pill.className = 'browser-status-pill';
  pill.dataset.state = state;
  const titleNode = document.createElement('strong');
  titleNode.textContent = title;
  const valueNode = document.createElement('span');
  valueNode.textContent = value;
  pill.appendChild(titleNode);
  pill.appendChild(valueNode);
  if (note) {
    const noteNode = document.createElement('small');
    noteNode.textContent = note;
    pill.appendChild(noteNode);
  }
  return pill;
}

function renderBrowserStatus(status) {
  if (!browserStatusSummary || !browserStatusDetail) return;

  const resolvedStatus = status && typeof status === 'object'
    ? status
    : {
      connected: false,
      browserLabel: '未连接浏览器',
      browserDetail: '会检测当前配置下的 Chrome 接入、以及小红书和知乎登录态是否可复用。',
      platforms: {
        xiaohongshu: { state: 'unknown', label: '未检测' },
        zhihu: { state: 'unknown', label: '未检测' }
      },
      tabs: {}
    };
  const xiaohongshuStatus = resolvedStatus.platforms?.xiaohongshu || { state: 'unknown', label: '未检测' };
  const zhihuStatus = resolvedStatus.platforms?.zhihu || { state: 'unknown', label: '未检测' };
  const detailParts = [];
  const xiaohongshuTabNote = resolvedStatus.tabs?.xiaohongshu ? '标签页已打开' : '标签页未打开';
  const zhihuTabNote = resolvedStatus.tabs?.zhihu ? '标签页已打开' : '标签页未打开';

  browserStatusSummary.innerHTML = '';
  browserStatusSummary.appendChild(createBrowserStatusPill(
    '连接状态',
    resolvedStatus.connected
      ? (resolvedStatus.browserLabel || '浏览器已连接')
      : (resolvedStatus.browserLabel || '未连接浏览器'),
    resolvedStatus.connected ? 'ok' : 'error',
    resolvedStatus.connected ? '当前会话可直接复用' : '请先启动可复用浏览器'
  ));
  browserStatusSummary.appendChild(createBrowserStatusPill(
    '小红书',
    xiaohongshuStatus.label || '未检测',
    xiaohongshuStatus.state || 'unknown',
    xiaohongshuTabNote
  ));
  browserStatusSummary.appendChild(createBrowserStatusPill(
    '知乎',
    zhihuStatus.label || '未检测',
    zhihuStatus.state || 'unknown',
    zhihuTabNote
  ));

  if (resolvedStatus.browserDetail) {
    detailParts.push(resolvedStatus.browserDetail);
  }
  if (resolvedStatus.tabs?.xiaohongshu) {
    detailParts.push('小红书标签页已打开');
  } else {
    detailParts.push('小红书标签页未打开');
  }
  if (resolvedStatus.tabs?.zhihu) {
    detailParts.push('知乎标签页已打开');
  } else {
    detailParts.push('知乎标签页未打开');
  }
  if (
    resolvedStatus.connected
    && browserMode?.value === 'current-browser'
    && !resolvedStatus.tabs?.xiaohongshu
  ) {
    detailParts.push('当前浏览器未打开小红书标签页，链接保存会自动切换到项目浏览器继续处理。');
  }

  browserStatusDetail.textContent = detailParts.join(' · ')
    || '会检测当前配置下的 Chrome 接入、以及小红书和知乎登录态是否可复用。';
}

async function requestJson(url, options = {}) {
  const method = options.method || 'POST';
  const init = { method };
  if (method !== 'GET') {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(options.body || {});
  }
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || '请求失败');
  }
  return payload;
}

async function requestNdjson(url, body, handlers = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || '请求失败');
  }

  const contentType = response.headers.get('content-type') || '';
  if (!response.body || !contentType.includes('application/x-ndjson')) {
    const payload = await response.json().catch(() => ({}));
    return { type: 'done', report: payload.report || payload };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let lastDone = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      const message = JSON.parse(line);
      if (handlers.onEvent) handlers.onEvent(message);
      if (message.type === 'done') lastDone = message;
      if (message.type === 'error') {
        throw new Error(message.error || '请求失败');
      }
    }
  }

  if (buffer.trim()) {
    const message = JSON.parse(buffer);
    if (handlers.onEvent) handlers.onEvent(message);
    if (message.type === 'done') lastDone = message;
    if (message.type === 'error') {
      throw new Error(message.error || '请求失败');
    }
  }

  if (lastDone) return lastDone;
  throw new Error('请求未返回结果');
}

function resolveAiApiBaseUrl(uiConfig = currentConfig || {}) {
  const runtime = uiConfig?.runtime || {};
  return String(runtime.openRouterBaseUrl || currentConfig?.runtime?.openRouterBaseUrl || 'https://openrouter.ai/api/v1').trim()
    || 'https://openrouter.ai/api/v1';
}

function resolveAiApiModel(uiConfig = currentConfig || {}) {
  const runtime = uiConfig?.runtime || {};
  return String(runtime.openRouterModel || currentConfig?.runtime?.openRouterModel || 'openrouter/free').trim()
    || 'openrouter/free';
}

async function requestAiApiConnectivity(uiConfig, options = {}) {
  const config = uiConfig || readConfigFromForm();
  const baseUrl = resolveAiApiBaseUrl(config);
  const model = resolveAiApiModel(config);
  if (options.logScope) {
    beginTaskLog(options.logScope, { preserve: options.preserveLog === true });
    appendTaskLog(`开始检查 AI API 联通性：${baseUrl} · 模型 ${model}`);
  }
  if (options.updateStatus !== false) {
    setRuntimeOpenrouterTestStatus(`正在检查：${baseUrl} · ${model}`, 'muted');
  }

  try {
    const payload = await requestJson('/api/runtime/test-ai-api', {
      body: { uiConfig: config }
    });
    const successMessage = payload?.message || `AI API 联通正常：${payload?.model || model}`;
    if (options.logScope) {
      appendTaskLog(successMessage, { level: 'success' });
    }
    if (options.updateStatus !== false) {
      setRuntimeOpenrouterTestStatus(successMessage, 'ok');
    }
    return {
      ok: true,
      payload
    };
  } catch (error) {
    const message = error.message || 'AI API 检查失败';
    if (options.logScope) {
      appendTaskLog(`AI API 检查失败：${message}，请检查地址 / Key 或切换 API`, {
        level: 'failed'
      });
    }
    if (options.updateStatus !== false) {
      setRuntimeOpenrouterTestStatus(message, 'error');
    }
    return {
      ok: false,
      error
    };
  }
}

async function ensureAiApiReadyForTask({
  uiConfig,
  scope,
  taskLabel,
  preserveLog = false
}) {
  const runtime = uiConfig?.runtime || {};
  if (runtime.aiSummaryEnabled === false) {
    return { ok: true, skipped: true };
  }

  const result = await requestAiApiConnectivity(uiConfig, {
    logScope: scope,
    preserveLog,
    updateStatus: true
  });
  if (result.ok) {
    return result;
  }

  const message = result.error?.message || 'AI API 检查失败';
  statusText.textContent = `${taskLabel}已阻止：AI API 不可用`;
  renderText(message);
  renderErrorBanner(`${message}。请检查设置里的 API 地址 / Key，或切换到可用接口后重试。`);
  return result;
}

async function refreshBrowserStatus(options = {}) {
  if (!browserStatusSummary || !browserStatusDetail) return null;

  const silent = options.silent === true;
  if (refreshBrowserStatusButton) {
    refreshBrowserStatusButton.disabled = true;
  }
  if (!silent) {
    clearErrorBanner();
    statusText.textContent = '正在检测浏览器连接与登录状态...';
  }

  try {
    const payload = await requestJson('/api/browser/status', {
      body: { uiConfig: readConfigFromForm() }
    });
    const status = payload?.status || payload || null;
    renderBrowserStatus(status);
    if (!silent) {
      statusText.textContent = status?.connected
        ? '浏览器状态已刷新'
        : '浏览器连接未就绪';
    }
    return status;
  } catch (error) {
    renderBrowserStatus({
      connected: false,
      browserLabel: '未连接浏览器',
      browserDetail: error.message || '未检测到可复用的 Chrome 调试会话',
      platforms: {
        xiaohongshu: { state: 'unknown', label: '未检测' },
        zhihu: { state: 'unknown', label: '未检测' }
      },
      tabs: {}
    });
    if (!silent) {
      statusText.textContent = '浏览器状态检测失败';
      renderErrorBanner(error.message || '请求失败');
    }
    return null;
  } finally {
    if (refreshBrowserStatusButton) {
      refreshBrowserStatusButton.disabled = false;
    }
  }
}

function resetProgressList() {
  progressItems = new Map();
  progressList.innerHTML = '';
  progressList.hidden = true;
}

function resetTaskLog() {
  activeTaskLogScope = '';
  if (!taskLogList) return;
  taskLogList.innerHTML = '';
  taskLogList.hidden = true;
  if (taskLogPanel) {
    taskLogPanel.hidden = true;
  }
}

function beginTaskLog(scope, options = {}) {
  const preserve = options.preserve === true;
  if (!preserve || activeTaskLogScope !== scope) {
    resetTaskLog();
  }
  activeTaskLogScope = scope;
}

function formatTaskLogTime(now = new Date()) {
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

function appendTaskLog(message, options = {}) {
  if (!taskLogList || !message) return;
  const entry = document.createElement('li');
  entry.className = 'task-log-entry';
  entry.dataset.level = options.level || 'info';

  const time = document.createElement('span');
  time.className = 'task-log-time';
  time.textContent = formatTaskLogTime(options.now instanceof Date ? options.now : new Date());

  const text = document.createElement('span');
  text.className = 'task-log-text';
  text.textContent = String(message);

  entry.appendChild(time);
  entry.appendChild(text);
  taskLogList.appendChild(entry);

  while (taskLogList.children.length > TASK_LOG_LIMIT) {
    taskLogList.removeChild(taskLogList.firstChild);
  }

  taskLogList.hidden = false;
  if (taskLogPanel) {
    taskLogPanel.hidden = false;
  }
  taskLogList.scrollTop = taskLogList.scrollHeight;
}

function formatTargetLabel(target, index) {
  if (!target) return `第 ${index + 1} 条`;
  const url = target.navigationUrl || target.canonicalUrl || '';
  if (!url) return `第 ${index + 1} 条`;
  return url.length > 48 ? `${url.slice(0, 45)}...` : url;
}

function describeInboxStreamPosition(message) {
  if (!message || typeof message !== 'object') return '';
  const rawIndex = Number(message.index);
  const hasIndex = Number.isFinite(rawIndex) && rawIndex >= 0;
  const total = Number(message.total);
  const position = hasIndex
    ? `第 ${rawIndex + 1}${Number.isFinite(total) && total > 0 ? `/${total}` : ''} 条`
    : '';
  const labelSource = message.result || message.target || null;
  const label = labelSource
    ? (formatResultLabel(labelSource) || formatTargetLabel(labelSource, hasIndex ? rawIndex : 0))
    : '';
  return [position, label].filter(Boolean).join('：');
}

function describeInboxSyncStreamPosition(message) {
  if (!message || typeof message !== 'object') return '';
  if (message.type === 'page') {
    const page = Number(message.page);
    const accumulatedItems = Number(message.accumulatedItems);
    if (Number.isFinite(page) && page > 0) {
      return `第 ${page} 页${Number.isFinite(accumulatedItems) && accumulatedItems >= 0 ? `，累计候选 ${accumulatedItems} 条` : ''}`;
    }
  }
  if (message.type === 'store') {
    const total = Number(message.total);
    if (Number.isFinite(total) && total >= 0) {
      return `写入阶段，共 ${total} 条`;
    }
  }
  if (message.type === 'start') {
    return build_inbox_sync_mode_label(message) || '同步开始';
  }
  return '';
}

function renderProgressList(targets = []) {
  progressItems = new Map();
  progressList.innerHTML = '';
  if (!Array.isArray(targets) || targets.length === 0) {
    progressList.hidden = true;
    return;
  }
  targets.forEach((target, index) => {
    const item = document.createElement('div');
    item.className = 'progress-item';
    item.dataset.status = 'pending';
    item.innerHTML = `
      <div class="progress-head">
        <span class="progress-title">${formatTargetLabel(target, index)}</span>
        <span class="progress-state">等待</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill"></div>
      </div>
    `;
    progressItems.set(index, item);
    progressList.appendChild(item);
  });
  progressList.hidden = false;
}

function updateProgressItem(index, status, payload = {}) {
  const item = progressItems.get(index);
  if (!item) return;
  item.dataset.status = status;
  const state = item.querySelector('.progress-state');
  const title = item.querySelector('.progress-title');
  if (state) {
    if (status === 'running') state.textContent = '运行中';
    if (status === 'success') state.textContent = '完成';
    if (status === 'failed') state.textContent = '失败';
    if (status === 'pending') state.textContent = '等待';
  }
  if (title) {
    const label = payload.label || title.textContent;
    title.textContent = label;
  }
  if (payload.error) {
    item.title = payload.error;
  }
}

function readNumber(input, fallback) {
  if (!input) return fallback;
  const raw = String(input.value || '').trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function normalize_inbox_sync_time_window(time_window) {
  if (!time_window || typeof time_window !== 'object') return null;

  const preset = String(time_window.preset || '').trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(INBOX_SYNC_WINDOW_LABELS, preset)) {
    return { preset };
  }

  const value = Math.trunc(readNumber({ value: time_window.value }, 0));
  const unit = String(time_window.unit || '').trim().toLowerCase();
  if (value > 0 && ['day', 'month', 'year'].includes(unit)) {
    return {
      value,
      unit
    };
  }

  return null;
}

function describe_inbox_sync_time_window(time_window) {
  const normalized_time_window = normalize_inbox_sync_time_window(time_window);
  if (!normalized_time_window) return '';

  if (normalized_time_window.preset) {
    return INBOX_SYNC_WINDOW_LABELS[normalized_time_window.preset] || '';
  }
  if (normalized_time_window.unit === 'day') {
    return `最近 ${normalized_time_window.value} 天`;
  }
  if (normalized_time_window.unit === 'month') {
    return `最近 ${normalized_time_window.value} 个月`;
  }
  return `最近 ${normalized_time_window.value} 年`;
}

function build_inbox_sync_mode_label(report = {}) {
  if (report.mode === 'all') return '全部';
  if (report.mode === 'recent') return `最近 ${report.limit || '?'} 条`;
  if (report.mode === 'window') {
    return report.windowLabel || describe_inbox_sync_time_window(report.timeWindow) || '时间范围';
  }
  return '最新';
}

function build_inbox_sync_history_title(report = {}) {
  if (report.mode === 'recent' && report.limit) {
    return `收件箱同步 · 最近 ${report.limit} 条`;
  }
  if (report.mode === 'all') {
    return '收件箱同步 · 全部';
  }
  if (report.mode === 'window') {
    return `收件箱同步 · ${build_inbox_sync_mode_label(report)}`;
  }
  return '收件箱同步';
}

function read_inbox_sync_time_window() {
  const selected_input = inboxSyncWindowInputs.find((input) => input.checked);
  const selected_value = String(selected_input?.value || '7d').trim().toLowerCase();
  if (selected_value === 'custom') {
    const value = Math.max(0, Math.trunc(readNumber(inboxSyncCustomValue, 0)));
    if (value <= 0) {
      throw new Error('请先填写自定义时间范围');
    }
    const unit = String(inboxSyncCustomUnit?.value || '').trim().toLowerCase();
    const normalized_time_window = normalize_inbox_sync_time_window({ value, unit });
    if (!normalized_time_window) {
      throw new Error('自定义时间范围单位无效');
    }
    return normalized_time_window;
  }

  return normalize_inbox_sync_time_window({ preset: selected_value }) || { preset: '7d' };
}

function select_inbox_sync_window(value) {
  const target = inboxSyncWindowInputs.find((input) => input.value === value);
  if (target) {
    target.checked = true;
  }
}

function readZhihuFavoritesLimit() {
  return readNumber(zhihuFavoritesLimit, 20);
}

function maskToken(token) {
  const value = String(token || '');
  if (!value) return '';
  if (value.length <= 8) return '已保存';
  return `${value.slice(0, 4)}***${value.slice(-4)}`;
}

function readConfigFromForm() {
  const fallback = currentConfig || {};
  const tokenInput = String(pushbulletToken.value || '').trim();
  const inboxValue = String(inboxPath.value || '').trim();
  const categoriesText = String(inboxCategories?.value || '').trim();
  const openrouterApiKeyValue = String(runtimeOpenrouterApiKey?.value || '').trim();
  let inboxCategoriesValue = fallback.inbox?.categories || {};
  if (categoriesText) {
    try {
      const parsed = JSON.parse(categoriesText);
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
        throw new Error('invalid categories');
      }
      inboxCategoriesValue = parsed;
    } catch (_) {
      throw new Error('收件箱分类规则 JSON 解析失败');
    }
  }
  const pushbulletPayload = {
    enabled: pushbulletEnabled.checked,
    inboxPath: inboxValue || fallback.pushbullet?.inboxPath || ''
  };
  if (tokenInput) {
    pushbulletPayload.accessToken = tokenInput;
  }
  const config = {
    paths: {
      saveLinksOutputRoot: String(pathLinksOutput.value || '').trim(),
      saveLinksImagesRoot: String(pathLinksImages.value || '').trim(),
      collectionOutputRoot: String(pathCollectionOutput.value || '').trim(),
      collectionRawPath: String(pathCollectionRaw.value || '').trim()
    },
    browser: {
      mode: browserMode?.value || fallback.browser?.mode || 'current-browser',
      browserUrl: String(browserUrl?.value || '').trim(),
      channel: browserChannel?.value || fallback.browser?.channel || 'stable',
      headless: browserHeadless ? browserHeadless.checked : fallback.browser?.headless === true
    },
    naming: {
      conflictStrategy: namingStrategy.value || 'content-aware',
      maxTitleLength: readNumber(namingMaxLength, fallback.naming?.maxTitleLength || 80)
    },
    runtime: {
      autoClassifyLinksEnabled: runtimeAutoClassify ? runtimeAutoClassify.checked : fallback.runtime?.autoClassifyLinksEnabled !== false,
      aiSummaryEnabled: runtimeAi.checked,
      visionOcrEnabled: runtimeVision.checked,
      ocrFallbackEnabled: runtimeOcrFallback.checked,
      openRouterBaseUrl: String(runtimeOpenrouterBaseUrl?.value || '').trim(),
      openRouterModel: String(runtimeOpenrouterModel?.value || '').trim(),
      hasOpenRouterApiKey: fallback.runtime?.hasOpenRouterApiKey === true,
      openRouterTimeoutMs: readNumber(runtimeOpenrouterTimeout, fallback.runtime?.openRouterTimeoutMs || 30000),
      visionOcrTimeoutMs: readNumber(runtimeVisionTimeout, fallback.runtime?.visionOcrTimeoutMs || 60000),
      maxImagesPerNote: readNumber(runtimeMaxImages, fallback.runtime?.maxImagesPerNote || 12)
    },
    pushbullet: pushbulletPayload,
    inbox: {
      categories: inboxCategoriesValue
    },
    ui: {
      showRawReport: uiShowRaw.checked
    }
  };
  if (openrouterApiKeyValue) {
    config.runtime.openRouterApiKey = openrouterApiKeyValue;
  }
  return config;
}

function applyConfigToForm(config) {
  const cfg = config || {};
  pathLinksOutput.value = cfg.paths?.saveLinksOutputRoot || '';
  pathLinksImages.value = cfg.paths?.saveLinksImagesRoot || '';
  pathCollectionOutput.value = cfg.paths?.collectionOutputRoot || '';
  pathCollectionRaw.value = cfg.paths?.collectionRawPath || '';
  if (browserMode) browserMode.value = cfg.browser?.mode || 'current-browser';
  if (browserChannel) browserChannel.value = cfg.browser?.channel || 'stable';
  if (browserUrl) browserUrl.value = cfg.browser?.browserUrl || '';
  if (browserHeadless) browserHeadless.checked = cfg.browser?.headless === true;
  namingStrategy.value = cfg.naming?.conflictStrategy || 'content-aware';
  namingMaxLength.value = cfg.naming?.maxTitleLength ?? '';
  if (runtimeAutoClassify) runtimeAutoClassify.checked = cfg.runtime?.autoClassifyLinksEnabled !== false;
  runtimeAi.checked = cfg.runtime?.aiSummaryEnabled !== false;
  runtimeVision.checked = cfg.runtime?.visionOcrEnabled !== false;
  runtimeOcrFallback.checked = cfg.runtime?.ocrFallbackEnabled !== false;
  if (runtimeOpenrouterBaseUrl) runtimeOpenrouterBaseUrl.value = cfg.runtime?.openRouterBaseUrl || '';
  if (runtimeOpenrouterModel) runtimeOpenrouterModel.value = cfg.runtime?.openRouterModel || '';
  if (runtimeOpenrouterApiKey) {
    runtimeOpenrouterApiKey.value = '';
    runtimeOpenrouterApiKey.placeholder = cfg.runtime?.hasOpenRouterApiKey
      ? '已保存（不回显，输入新值可覆盖）'
      : '请输入 AI API Key';
  }
  setRuntimeOpenrouterTestStatus('运行前会先检查 AI API 联通性；也可以先在这里手动测试。', 'muted');
  runtimeOpenrouterTimeout.value = cfg.runtime?.openRouterTimeoutMs ?? '';
  runtimeVisionTimeout.value = cfg.runtime?.visionOcrTimeoutMs ?? '';
  runtimeMaxImages.value = cfg.runtime?.maxImagesPerNote ?? '';
  pushbulletEnabled.checked = cfg.pushbullet?.enabled === true;
  pushbulletToken.value = '';
  pushbulletToken.placeholder = cfg.pushbullet?.hasAccessToken
    ? '已保存（不回显）'
    : '在 Pushbullet 账号设置中获取';
  inboxPath.value = cfg.pushbullet?.inboxPath || cfg.inbox?.path || '';
  if (inboxCategories) {
    const categoriesValue = cfg.inbox?.categories || {};
    inboxCategories.value = JSON.stringify(categoriesValue, null, 2);
  }
  uiShowRaw.checked = cfg.ui?.showRawReport !== false;
  updateRawReportVisibility(cfg);
}

function deriveResultGroupKey(item) {
  if (!item || item.status === 'failed') return 'failure';
  const savedCollection = helpers.describeSavedCollection ? helpers.describeSavedCollection(item) : '';
  return savedCollection || '未分类';
}

function deriveResultGroupLabel(groupKey) {
  if (groupKey === 'failure') return '失败';
  return groupKey || '未分类';
}

function getResultWarningCount(item) {
  return Array.isArray(item?.warnings) ? item.warnings.length : 0;
}

function hasResultWarnings(item) {
  return getResultWarningCount(item) > 0;
}

function getResultSortLabel(item) {
  return String(
    formatResultLabel(item)
    || item?.filepath
    || item?.canonicalUrl
    || item?.navigationUrl
    || item?.noteId
    || item?.input
    || ''
  ).trim();
}

function sortGroupItems(items = [], groupKey = '') {
  const sorted = [...items];
  sorted.sort((left, right) => {
    const warningDelta = getResultWarningCount(right) - getResultWarningCount(left);
    if (groupKey !== 'failure' && warningDelta !== 0) {
      return warningDelta;
    }

    const leftLabel = getResultSortLabel(left);
    const rightLabel = getResultSortLabel(right);
    return leftLabel.localeCompare(rightLabel, 'zh-CN');
  });
  return sorted;
}

function compareResultGroups(left, right) {
  if (left.key === 'failure' && right.key !== 'failure') return -1;
  if (left.key !== 'failure' && right.key === 'failure') return 1;

  const countDelta = right.items.length - left.items.length;
  if (countDelta !== 0) return countDelta;

  return left.label.localeCompare(right.label, 'zh-CN');
}

function buildResultGroups(results = []) {
  const groups = [];
  const groupMap = new Map();

  results.forEach((item) => {
    const groupKey = deriveResultGroupKey(item);
    if (!groupMap.has(groupKey)) {
      const group = {
        key: groupKey,
        label: deriveResultGroupLabel(groupKey),
        items: []
      };
      groupMap.set(groupKey, group);
      groups.push(group);
    }
    groupMap.get(groupKey).items.push(item);
  });

  groups.forEach((group) => {
    group.items = sortGroupItems(group.items, group.key);
    group.links = collectUniqueResultLinks(group.items);
    group.warningCount = group.items.filter(hasResultWarnings).length;
  });
  groups.sort(compareResultGroups);

  return groups;
}

async function copyTextToClipboard(text) {
  const value = String(text || '');
  if (!value) return;

  const clipboardApi = window?.navigator?.clipboard || globalThis?.navigator?.clipboard;
  if (clipboardApi?.writeText) {
    await clipboardApi.writeText(value);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand && document.execCommand('copy');
  document.body.removeChild(textarea);
  if (!copied) {
    throw new Error('当前环境不支持复制到剪贴板');
  }
}

function deriveSuggestedOutputFolder(report = lastReport, uiConfig = currentConfig || {}) {
  const explicit = String(report?.outputFolder || '').trim();
  if (explicit) return explicit;

  const successDirs = (Array.isArray(report?.results) ? report.results : [])
    .filter((item) => item && item.status !== 'failed' && String(item.filepath || '').trim())
    .map((item) => String(item.filepath || '').trim().replace(/[/\\][^/\\]+$/, ''));
  const uniqueDirs = Array.from(new Set(successDirs.filter(Boolean)));
  if (uniqueDirs.length === 1) {
    return uniqueDirs[0];
  }

  const collectionRoot = String(uiConfig?.paths?.collectionOutputRoot || '').trim();
  const linksRoot = String(uiConfig?.paths?.saveLinksOutputRoot || '').trim();
  const looksLikeCollectionReport = Array.isArray(report?.output?.steps) && report.output.steps.length > 0;
  if (looksLikeCollectionReport && collectionRoot) {
    return collectionRoot;
  }
  return linksRoot || collectionRoot || uniqueDirs[0] || '';
}

function fillLinksInput(links = [], groupLabel = '') {
  const value = Array.isArray(links) ? links.join('\n') : '';
  if (!value) return;
  clearErrorBanner();
  linksText.value = value;
  if (typeof linksText.focus === 'function') {
    linksText.focus();
  }
  if (typeof linksText.scrollIntoView === 'function') {
    linksText.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  statusText.textContent = `已填入 ${groupLabel} ${links.length} 条链接，可直接开始保存`;
}

function closeResultGroupMenus(exceptMenu = null) {
  document.querySelectorAll('[data-group-action-menu="true"]').forEach((menu) => {
    if (exceptMenu && menu === exceptMenu) return;
    menu.hidden = true;
  });
  document.querySelectorAll('[data-group-action="toggle-more"]').forEach((toggle) => {
    const controls = toggle.getAttribute('aria-controls');
    const menu = controls ? document.getElementById(controls) : null;
    if (exceptMenu && menu === exceptMenu) return;
    toggle.setAttribute('aria-expanded', 'false');
  });
}

function closeResultGroupMenuForElement(element) {
  const wrap = element?.closest('.result-group-secondary');
  if (!wrap) return;
  const menu = wrap.querySelector('[data-group-action-menu="true"]');
  const toggle = wrap.querySelector('[data-group-action="toggle-more"]');
  if (menu) menu.hidden = true;
  if (toggle) toggle.setAttribute('aria-expanded', 'false');
}

function toggleResultGroupMenu(toggleButton, menu) {
  if (!toggleButton || !menu) return;
  const nextOpen = menu.hidden;
  closeResultGroupMenus(nextOpen ? menu : null);
  menu.hidden = !nextOpen;
  toggleButton.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
}

function normalizeActiveResultFilter(groups = []) {
  if (activeResultFilter === 'all') return;
  if (activeResultFilter === 'warnings') {
    const hasWarnings = groups.some((group) => group.warningCount > 0);
    if (!hasWarnings) {
      activeResultFilter = 'all';
    }
    return;
  }
  const exists = groups.some((group) => group.key === activeResultFilter);
  if (!exists) {
    activeResultFilter = 'all';
  }
}

function normalizeActiveWarningCodeFilter(results = []) {
  if (!activeWarningCodeFilter) return;
  const availableCodes = new Set(
    buildWarningCodeSummary(results).map((item) => item.code)
  );
  if (!availableCodes.has(activeWarningCodeFilter)) {
    activeWarningCodeFilter = '';
  }
}

function normalizeActiveFailureStageFilter(results = []) {
  if (!activeFailureStageFilter) return;
  const availableStages = new Set(
    buildFailureStageSummary(results).map((item) => item.stage)
  );
  if (!availableStages.has(activeFailureStageFilter)) {
    activeFailureStageFilter = '';
  }
}

function readResultFailureStageLabel(item, { includeUnknown = false } = {}) {
  if (!item || item.status !== 'failed') return '';
  const label = helpers.describeResultFailureStage
    ? helpers.describeResultFailureStage(item)
    : '';
  if (label) return label;
  return includeUnknown ? UNCLASSIFIED_FAILURE_LABEL : '';
}

function readResultStringField(item, snakeKey, camelKey = '') {
  const keys = [snakeKey, camelKey].filter(Boolean);
  for (const key of keys) {
    const value = String(item?.[key] || '').trim();
    if (value) return value;
  }
  return '';
}

function readResultNumberField(item, snakeKey, camelKey = '') {
  const keys = [snakeKey, camelKey].filter(Boolean);
  for (const key of keys) {
    const value = item?.[key];
    if (value === '' || value === null || typeof value === 'undefined') continue;
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) return numeric;
  }
  return null;
}

function readResultBooleanField(item, snakeKey, camelKey = '') {
  const keys = [snakeKey, camelKey].filter(Boolean);
  return keys.some((key) => item?.[key] === true);
}

function readBrowserOrchestration(item) {
  const payload = item?.browser_orchestration || item?.browserOrchestration;
  return payload && typeof payload === 'object' ? payload : null;
}

function describeBrowserOrchestrationStatus(status = '') {
  const normalized = String(status || '').trim();
  if (normalized === 'done') return '已完成';
  if (normalized === 'need_human') return '待人工';
  if (normalized === 'failed') return '失败';
  if (normalized === 'running') return '进行中';
  return normalized;
}

function readBrowserPlatformStatus(browserStatus = null, platformKey = 'xiaohongshu') {
  const platformStatus = browserStatus?.platforms?.[platformKey] || {};
  return {
    state: String(platformStatus.state || 'unknown').trim() || 'unknown',
    label: String(platformStatus.label || '未检测').trim() || '未检测'
  };
}

function resolveResultActionStateKey(item) {
  return String(
    resolveResultLink(item)
    || item?.filepath
    || item?.noteId
    || item?.canonicalUrl
    || item?.navigationUrl
    || item?.input
    || ''
  ).trim();
}

function syncResultActionStateForReport(report = null) {
  if (report === lastSummaryReportRef) return;
  resultActionStateMap = new Map();
  bulkResultActionState = null;
  lastSummaryReportRef = report || null;
}

function readResultActionState(item) {
  const stateKey = resolveResultActionStateKey(item);
  if (!stateKey) return null;
  return resultActionStateMap.get(stateKey) || null;
}

function writeResultActionState(item, state = null) {
  const stateKey = resolveResultActionStateKey(item);
  if (!stateKey) return false;
  if (state && String(state.label || '').trim()) {
    resultActionStateMap.set(stateKey, {
      label: String(state.label || '').trim(),
      tone: String(state.tone || 'info').trim() || 'info'
    });
  } else {
    resultActionStateMap.delete(stateKey);
  }
  return true;
}

function setResultActionStateEntries(entries = []) {
  let changed = false;
  entries.forEach((entry) => {
    if (!entry?.item) return;
    changed = writeResultActionState(entry.item, entry.state || null) || changed;
  });
  if (lastReport) {
    renderSummary(lastReport);
  }
}

function setResultActionStates(items = [], state = null) {
  const entries = (Array.isArray(items) ? items : [items])
    .filter(Boolean)
    .map((item) => ({ item, state }));
  setResultActionStateEntries(entries);
}

function setResultActionState(item, state = null) {
  setResultActionStates(item ? [item] : [], state);
}

function readBulkResultActionState() {
  return bulkResultActionState;
}

function setBulkResultActionState(state = null) {
  if (state && String(state.label || '').trim()) {
    bulkResultActionState = {
      label: String(state.label || '').trim(),
      tone: String(state.tone || 'info').trim() || 'info'
    };
  } else {
    bulkResultActionState = null;
  }
  if (lastReport) {
    renderSummary(lastReport);
  }
}

function createResultDiagnosticChip({ label, tone = 'neutral' } = {}) {
  if (!label) return null;
  const chip = document.createElement('span');
  chip.className = 'result-diagnostic-chip';
  chip.dataset.tone = tone;
  chip.textContent = label;
  return chip;
}

function createResultActionStatus(state = {}) {
  const label = String(state?.label || '').trim();
  if (!label) return null;
  const node = document.createElement('div');
  node.className = 'result-action-status';
  node.dataset.resultActionStatus = 'true';
  node.dataset.tone = String(state?.tone || 'info').trim() || 'info';
  node.textContent = label;
  return node;
}

function createBulkResultActionStatus(state = {}) {
  const node = createResultActionStatus(state);
  if (!node) return null;
  node.classList.add('result-bulk-action-status');
  delete node.dataset.resultActionStatus;
  node.dataset.bulkResultActionStatus = 'true';
  return node;
}

function pushUniqueText(items, value) {
  const normalized = String(value || '').trim();
  if (!normalized) return;
  if (!items.includes(normalized)) {
    items.push(normalized);
  }
}

function resolveResultGuidanceCategory(item, availability = readResultActionAvailability(item)) {
  const commentTotal = readResultNumberField(item, 'comment_total', 'commentTotal');
  let commentCollected = readResultNumberField(item, 'comment_collected', 'commentCollected');
  if (commentCollected === null && Array.isArray(item?.comments)) {
    commentCollected = item.comments.length;
  }

  if (availability.failureStage === '浏览器接入') return 'browser_connection';
  if (availability.manualActionReason === 'captcha') return 'captcha';
  if (
    availability.failureStage === '登录门槛'
    || availability.manualActionReason === 'login_required'
    || availability.commentWarningCode === 'comment_login_required'
  ) {
    return 'login_gate';
  }
  if (
    availability.failureStage === '评论接口受限'
    || availability.manualActionReason === 'risk_control'
  ) {
    return 'comment_restricted';
  }
  if (availability.failureStage === '打开详情页') return 'open_detail';
  if (
    availability.failureStage === '评论加载'
    || availability.commentWarningCode === 'comment_incomplete'
    || (
      commentTotal !== null
      && commentCollected !== null
      && commentCollected < commentTotal
    )
  ) {
    return 'comment_incomplete';
  }
  if (availability.manualActionRequired) return 'manual_handoff';
  return '';
}

function buildGuidanceStepsForCategory(category, {
  canResume = false,
  categoryCount = 0,
  analyzeLabel = '“一键分析”',
  repairLabel = '“一键修复”',
  retryLabel = '“处理后重试”'
} = {}) {
  const steps = [];
  const finishStep = canResume
    ? '处理完后优先点“继续执行”；如果当前结果没有这个按钮，再点“处理后重试”。'
    : `处理完后点${retryLabel}；如果只想先确认状态，可先点${analyzeLabel}。`;

  if (category === 'browser_connection') {
    pushUniqueText(steps, `先点${repairLabel}，切到项目隔离浏览器并重新建立连接。`);
    pushUniqueText(steps, '在项目登录浏览器里确认小红书页面已经打开、登录态可用。');
    pushUniqueText(
      steps,
      categoryCount > 1
        ? `浏览器恢复后回到这里点${retryLabel}；单条结果如果只想确认连接状态，可点“重新检测”。`
        : '浏览器恢复后先点“重新检测”确认连接；需要重跑这条结果时再点“处理后重试”。'
    );
    return steps;
  }

  if (category === 'captcha') {
    pushUniqueText(steps, `先点${repairLabel}，确保项目登录浏览器已经打开到对应页面。`);
    pushUniqueText(steps, '在项目登录浏览器里完成验证码、人机验证或确认弹窗。');
    pushUniqueText(steps, finishStep);
    return steps;
  }

  if (category === 'login_gate') {
    pushUniqueText(
      steps,
      categoryCount > 1
        ? `当前筛选里“登录门槛”有 ${categoryCount} 条，可先点${repairLabel}打开项目登录浏览器。`
        : `先点${repairLabel}，打开项目登录浏览器。`
    );
    pushUniqueText(steps, '在项目登录浏览器里完成小红书登录，必要时打开对应笔记详情页。');
    pushUniqueText(steps, finishStep);
    return steps;
  }

  if (category === 'comment_restricted') {
    pushUniqueText(
      steps,
      categoryCount > 1
        ? `当前筛选里“评论接口受限”有 ${categoryCount} 条，建议先点${analyzeLabel}复核是不是风控或账号限制。`
        : `先点${analyzeLabel}，确认当前是不是评论接口受限或账号风控。`
    );
    pushUniqueText(steps, `如果浏览器或账号状态异常，再点${repairLabel}打开项目登录浏览器并检查账号状态。`);
    pushUniqueText(steps, `确认账号恢复后再点${retryLabel}，不要连续盲目重试。`);
    return steps;
  }

  if (category === 'open_detail') {
    pushUniqueText(
      steps,
      categoryCount > 1
        ? `当前筛选里“打开详情页”异常有 ${categoryCount} 条，先在当前浏览器打开正确的笔记详情页。`
        : '先在当前浏览器打开这条笔记的详情页，确认不是首页、搜索页或登录拦截页。'
    );
    pushUniqueText(steps, '如果页面跳到了其他位置，先手动切回目标笔记详情页并保持页面打开。');
    pushUniqueText(steps, finishStep);
    return steps;
  }

  if (category === 'comment_incomplete') {
    pushUniqueText(
      steps,
      categoryCount > 1
        ? `当前筛选里“评论未抓全”有 ${categoryCount} 条，先在当前浏览器继续下拉并展开评论。`
        : '先在当前浏览器继续下拉评论区，并把“展开更多评论”一类入口点开。'
    );
    pushUniqueText(steps, `确认评论还在继续加载；如果页面看起来停住了，可先点${analyzeLabel}复核判断。`);
    pushUniqueText(steps, `评论展开后点${retryLabel}。`);
    return steps;
  }

  if (category === 'manual_handoff') {
    pushUniqueText(steps, `先点${repairLabel}，确保项目登录浏览器已经打开。`);
    pushUniqueText(steps, '在项目登录浏览器里按页面提示完成剩余人工步骤。');
    pushUniqueText(steps, finishStep);
  }

  return steps;
}

function buildResultNextSteps(item) {
  const availability = readResultActionAvailability(item);
  const category = resolveResultGuidanceCategory(item, availability);
  return buildGuidanceStepsForCategory(category, {
    canResume: availability.shouldOfferResume
  });
}

function buildBulkNextSteps(items = [], {
  analyzableCount = 0,
  repairableCount = 0,
  retryableCount = 0
} = {}) {
  const categoryOrder = [
    'browser_connection',
    'captcha',
    'login_gate',
    'comment_restricted',
    'open_detail',
    'comment_incomplete',
    'manual_handoff'
  ];
  const analyzeLabel = analyzableCount > 0 ? `“一键分析当前 ${analyzableCount} 条”` : '“一键分析”';
  const repairLabel = repairableCount > 0 ? `“一键修复当前 ${repairableCount} 条”` : '“一键修复”';
  const retryLabel = retryableCount > 0 ? `“处理后重试当前 ${retryableCount} 条”` : '“处理后重试”';
  const steps = [];
  const maxSteps = items.length > 0 ? 6 : 0;

  categoryOrder.forEach((category) => {
    if (steps.length >= maxSteps) return;
    const matchedItems = items.filter((item) => {
      const availability = readResultActionAvailability(item);
      return resolveResultGuidanceCategory(item, availability) === category;
    });
    if (matchedItems.length === 0) return;
    buildGuidanceStepsForCategory(category, {
      categoryCount: matchedItems.length,
      analyzeLabel,
      repairLabel,
      retryLabel
    }).forEach((step) => {
      if (steps.length < maxSteps) {
        pushUniqueText(steps, step);
      }
    });
  });

  if (steps.length === 0 && items.length > 0) {
    pushUniqueText(steps, `当前筛选里有 ${items.length} 条异常，建议先点${analyzeLabel}确认卡点，再按结果行按钮逐条处理。`);
  }
  return steps;
}

function createResultNextStepsBlock(steps = [], { variant = 'row' } = {}) {
  const normalizedSteps = Array.isArray(steps)
    ? steps.map((step) => String(step || '').trim()).filter(Boolean)
    : [];
  if (normalizedSteps.length === 0) return null;

  const block = document.createElement('section');
  block.className = `result-next-steps result-next-steps-${variant}`;
  block.dataset.resultNextSteps = variant;

  const title = document.createElement('strong');
  title.className = 'result-next-steps-title';
  title.textContent = variant === 'bulk' ? '当前建议路径' : '下一步建议';
  block.appendChild(title);

  const list = document.createElement('ol');
  list.className = 'result-next-steps-list';
  normalizedSteps.forEach((step) => {
    const item = document.createElement('li');
    item.className = 'result-next-steps-item';
    item.textContent = step;
    list.appendChild(item);
  });
  block.appendChild(list);
  return block;
}

function buildResultQuickAnalysis(item, browserStatus = null) {
  const failureStage = item?.status === 'failed' && helpers.describeResultFailureStage
    ? helpers.describeResultFailureStage(item)
    : '';
  const manualActionRequired = readResultBooleanField(item, 'manual_action_required', 'manualActionRequired');
  const manualActionReason = readResultStringField(item, 'manual_action_reason', 'manualActionReason');
  const commentWarningCode = readResultStringField(item, 'comment_warning_code', 'commentWarningCode');
  const xiaohongshuStatus = readBrowserPlatformStatus(browserStatus, 'xiaohongshu');
  const browserConnected = browserStatus?.connected === true;
  const hasXiaohongshuLogin = xiaohongshuStatus.state === 'alive';
  const hasXiaohongshuTab = browserStatus?.tabs?.xiaohongshu === true;

  if (failureStage === '浏览器接入') {
    if (!browserConnected) {
      return {
        label: '分析完成：当前浏览器还没连上，建议先点“一键修复”切到隔离浏览器。',
        tone: 'error'
      };
    }
    return {
      label: '分析完成：浏览器已连接，但当前接入仍不稳定，建议先点“一键修复”切到隔离浏览器。',
      tone: 'warning'
    };
  }

  if (
    failureStage === '登录门槛'
    || manualActionReason === 'login_required'
    || manualActionReason === 'captcha'
    || commentWarningCode === 'comment_login_required'
  ) {
    if (!browserConnected) {
      return {
        label: '分析完成：当前浏览器未连接，建议先点“一键修复”打开项目登录浏览器。',
        tone: 'error'
      };
    }
    if (!hasXiaohongshuLogin) {
      return {
        label: '分析完成：浏览器已连接，但小红书仍未登录，建议点“一键修复”打开项目登录浏览器后再试。',
        tone: 'warning'
      };
    }
    if (manualActionReason === 'captcha') {
      return {
        label: '分析完成：当前更像验证码或确认页未处理完，请先在当前浏览器完成验证，再点“处理后重试”。',
        tone: 'warning'
      };
    }
    return {
      label: '分析完成：浏览器已连接且小红书可用，请回到该窗口完成登录门槛处理后，再点“处理后重试”。',
      tone: 'warning'
    };
  }

  if (failureStage === '评论接口受限' || manualActionReason === 'risk_control') {
    if (!browserConnected || !hasXiaohongshuLogin) {
      return {
        label: '分析完成：当前账号状态还不可用，建议点“一键修复”打开项目登录浏览器并检查账号状态。',
        tone: 'warning'
      };
    }
    return {
      label: '分析完成：当前更像评论接口受限或账号风控，自动重试收益低，建议先处理账号状态后再试。',
      tone: 'warning'
    };
  }

  if (failureStage === '评论加载') {
    return {
      label: '分析完成：当前更像评论尚未完全展开，不必换浏览器，建议直接点“处理后重试”。',
      tone: 'success'
    };
  }

  if (failureStage === '打开详情页') {
    return {
      label: hasXiaohongshuTab
        ? '分析完成：小红书标签页已打开，但当前详情页仍不可用，请先确认打开的是笔记详情页再重试。'
        : '分析完成：当前更像详情页没打开对，请先在浏览器打开对应笔记详情页，再点“处理后重试”。',
      tone: 'warning'
    };
  }

  if (manualActionRequired) {
    return {
      label: '分析完成：当前结果需要人工处理，建议先点“一键修复”打开项目登录浏览器后，再回到这里继续。',
      tone: 'warning'
    };
  }

  return {
    label: browserConnected
      ? `分析完成：浏览器当前可用，小红书状态为“${xiaohongshuStatus.label}”，建议按当前结果提示继续处理。`
      : '分析完成：浏览器状态还不稳定，建议先重新检测或一键修复后再试。',
    tone: browserConnected ? 'success' : 'warning'
  };
}

function buildResultDiagnostics(item) {
  const warnings = Array.isArray(item?.warnings) ? item.warnings : [];
  const chips = [];
  const titleParts = [];
  const noteLines = [];
  const nextSteps = buildResultNextSteps(item);
  const failureStage = item?.status === 'failed' && helpers.describeResultFailureStage
    ? helpers.describeResultFailureStage(item)
    : '';
  const browserOrchestration = readBrowserOrchestration(item);

  if (failureStage) {
    chips.push({ label: failureStage, tone: item.status === 'failed' ? 'danger' : 'neutral' });
  }

  let commentWarningCode = readResultStringField(item, 'comment_warning_code', 'commentWarningCode');
  if (!commentWarningCode) {
    commentWarningCode = String(
      warnings.find((warning) => String(warning?.step || '').trim() === 'comments')?.code || ''
    ).trim();
  }
  const commentWarningLabel = commentWarningCode && helpers.describeCommentWarningCode
    ? helpers.describeCommentWarningCode(commentWarningCode)
    : '';
  if (commentWarningCode) {
    chips.push({
      label: commentWarningLabel
        ? `${commentWarningLabel} · ${commentWarningCode}`
        : commentWarningCode,
      tone: 'warning'
    });
  }

  const commentTotal = readResultNumberField(item, 'comment_total', 'commentTotal');
  let commentCollected = readResultNumberField(item, 'comment_collected');
  if (commentCollected === null && Array.isArray(item?.comments)) {
    commentCollected = item.comments.length;
  }
  if (commentTotal !== null || commentCollected !== null) {
    chips.push({
      label: `评论 ${commentCollected ?? '?'}/${commentTotal ?? '?'}`,
      tone: 'info'
    });
  }
  const commentDiagnostics = item?.comment_diagnostics && typeof item.comment_diagnostics === 'object'
    ? item.comment_diagnostics
    : (item?.commentDiagnostics && typeof item.commentDiagnostics === 'object' ? item.commentDiagnostics : null);
  if (commentDiagnostics) {
    const apiPagingAdded = Number(commentDiagnostics.api_paging_added || 0);
    const blockedCode = String(commentDiagnostics.api_paging_blocked_code ?? '').trim();
    if (apiPagingAdded > 0) {
      noteLines.push(`已通过评论接口补齐 ${apiPagingAdded} 条评论。`);
    }
    if (commentDiagnostics.api_paging_blocked) {
      noteLines.push(`评论分页补齐被 ${blockedCode || 'unknown'} 拦截，当前仅保留网页端可见评论。`);
    }
  }

  const manualActionRequired = readResultBooleanField(item, 'manual_action_required', 'manualActionRequired');
  const manualActionReason = readResultStringField(item, 'manual_action_reason', 'manualActionReason');
  const manualActionLabel = manualActionReason && helpers.describeManualActionReason
    ? helpers.describeManualActionReason(manualActionReason)
    : '';
  if (manualActionRequired || manualActionLabel) {
    chips.push({
      label: manualActionLabel ? `人工处理 · ${manualActionLabel}` : '需要人工处理',
      tone: 'manual'
    });
    noteLines.push(`检测到${manualActionLabel || '人工处理节点'}，请先在当前浏览器处理后，再回来继续。`);
  }

  const orchestrationStatus = String(browserOrchestration?.status || '').trim();
  const orchestrationState = String(browserOrchestration?.state || '').trim();
  const orchestrationRunId = String(browserOrchestration?.run_id || '').trim();
  const orchestrationCheckpointPath = String(browserOrchestration?.checkpoint_path || '').trim();
  const orchestrationWarnings = Array.isArray(browserOrchestration?.warnings) ? browserOrchestration.warnings : [];
  const orchestrationStatusLabel = describeBrowserOrchestrationStatus(orchestrationStatus);
  if (orchestrationStatus || orchestrationState) {
    chips.push({
      label: ['编排', orchestrationStatusLabel || orchestrationStatus, orchestrationState].filter(Boolean).join(' · '),
      tone: orchestrationStatus === 'need_human'
        ? 'manual'
        : orchestrationStatus === 'failed'
          ? 'danger'
          : 'info'
    });
  }
  if (orchestrationWarnings.length > 0) {
    chips.push({
      label: `编排告警 ${orchestrationWarnings.length}`,
      tone: 'warning'
    });
  }

  if (orchestrationRunId && (manualActionRequired || item?.status === 'failed' || warnings.length > 0 || orchestrationWarnings.length > 0)) {
    noteLines.push(`运行 ID：${orchestrationRunId}`);
  }
  if (orchestrationCheckpointPath && (manualActionRequired || item?.status === 'failed' || warnings.length > 0 || orchestrationWarnings.length > 0)) {
    noteLines.push(`检查点：${orchestrationCheckpointPath}`);
  }

  const commentError = readResultStringField(item, 'comment_error', 'commentError');
  if (commentError) {
    titleParts.push(commentError);
  }
  if (orchestrationRunId) {
    titleParts.push(`run_id: ${orchestrationRunId}`);
  }
  if (orchestrationCheckpointPath) {
    titleParts.push(`checkpoint: ${orchestrationCheckpointPath}`);
  }

  return {
    chips,
    titleParts,
    noteLines,
    nextSteps
  };
}

function readResultActionAvailability(item) {
  const manualActionRequired = readResultBooleanField(item, 'manual_action_required', 'manualActionRequired');
  const manualActionReason = readResultStringField(item, 'manual_action_reason', 'manualActionReason');
  const commentWarningCode = readResultStringField(item, 'comment_warning_code', 'commentWarningCode');
  const browserOrchestration = readBrowserOrchestration(item);
  const resumeRunId = String(browserOrchestration?.run_id || '').trim();
  const orchestrationStatus = String(browserOrchestration?.status || '').trim();
  const failureStage = item?.status === 'failed' && helpers.describeResultFailureStage
    ? helpers.describeResultFailureStage(item)
    : '';
  const shouldOfferAnalyze = item?.status === 'failed' || manualActionRequired || Boolean(commentWarningCode);
  const shouldOfferResume = orchestrationStatus === 'need_human' && Boolean(resumeRunId);
  const shouldOfferBrowserRefresh = (
    manualActionRequired
    || failureStage === '浏览器接入'
    || failureStage === '登录门槛'
    || failureStage === '评论接口受限'
  );
  const needsBrowserRepair = failureStage === '浏览器接入';
  const needsManualRepair = (
    !needsBrowserRepair
    && (
      manualActionRequired
      || failureStage === '登录门槛'
      || failureStage === '评论接口受限'
      || manualActionReason === 'login_required'
      || manualActionReason === 'captcha'
      || manualActionReason === 'risk_control'
      || commentWarningCode === 'comment_login_required'
    )
  );
  const shouldOfferRepair = needsBrowserRepair || needsManualRepair;
  const shouldOfferRetry = manualActionRequired || (
    item?.status === 'failed'
    && ['登录门槛', '评论接口受限', '评论加载', '打开详情页'].includes(failureStage)
  );

  return {
    manualActionRequired,
    manualActionReason,
    commentWarningCode,
    failureStage,
    shouldOfferAnalyze,
    shouldOfferResume,
    shouldOfferBrowserRefresh,
    shouldOfferRepair,
    shouldOfferRetry,
    resumeRunId,
    repairActionId: needsBrowserRepair
      ? 'repair_browser_session'
      : (needsManualRepair ? 'repair_manual_session' : '')
  };
}

function buildBrowserRepairResultState(browserStatus = null) {
  return browserStatus?.connected
    ? {
      label: '已切换到隔离浏览器，请在项目浏览器中继续处理登录或验证。',
      tone: 'success'
    }
    : {
      label: '已尝试切换到隔离浏览器，请先确认浏览器连接后再继续。',
      tone: 'warning'
    };
}

function buildManualRepairResultState(browserStatus = null) {
  const xiaohongshuStatus = readBrowserPlatformStatus(browserStatus, 'xiaohongshu');
  return browserStatus?.connected && xiaohongshuStatus.state === 'alive'
    ? {
      label: '已打开项目登录浏览器，并检测到小红书可用，可直接点“处理后重试”。',
      tone: 'success'
    }
    : {
      label: '已打开项目登录浏览器，请先在该窗口完成登录或验证，再点“处理后重试”。',
      tone: 'warning'
    };
}

function createAsyncResultActionButton({ actionId, label, onClick } = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button ghost result-row-action';
  button.dataset.resultAction = actionId || '';
  button.textContent = label || '执行';
  button.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    button.disabled = true;
    try {
      await onClick?.();
    } finally {
      button.disabled = false;
    }
  });
  return button;
}

async function resumeResultItem(item, runId) {
  setResultActionState(item, {
    label: '正在继续执行当前结果...',
    tone: 'running'
  });
  resetProgressList();
  clearErrorBanner();
  renderText('任务已提交，等待返回...');
  const payload = await requestJson('/api/save-links-resume', {
    body: {
      runId,
      uiConfig: readConfigFromForm()
    }
  });
  statusText.textContent = payload?.report?.failureCount > 0
    ? '当前结果已继续执行，但仍有待处理项'
    : '当前结果继续执行完成';
  renderReport(payload, {
    taskType: 'note-save',
    historyTitle: '继续执行当前结果'
  });
  return payload;
}

function buildResultRowActions(item) {
  const actions = [];
  const {
    manualActionRequired,
    manualActionReason,
    commentWarningCode,
    failureStage,
    shouldOfferAnalyze,
    shouldOfferResume,
    shouldOfferBrowserRefresh,
    shouldOfferRepair,
    shouldOfferRetry,
    resumeRunId
  } = readResultActionAvailability(item);

  if (!shouldOfferAnalyze && !shouldOfferResume && !shouldOfferBrowserRefresh && !shouldOfferRepair && !shouldOfferRetry) {
    return [];
  }

  if (shouldOfferAnalyze) {
    actions.push(createAsyncResultActionButton({
      actionId: 'analyze_result_item',
      label: '一键分析',
      onClick: async () => {
        setResultActionState(item, {
          label: '正在分析当前结果...',
          tone: 'running'
        });
        const browserStatus = await refreshBrowserStatus({ silent: true });
        const analysis = buildResultQuickAnalysis(item, browserStatus);
        setResultActionState(item, analysis);
        statusText.textContent = analysis.label;
      }
    }));
  }

  if (shouldOfferRepair && failureStage === '浏览器接入') {
    actions.push(createAsyncResultActionButton({
      actionId: 'repair_browser_session',
      label: '一键修复',
      onClick: async () => {
        setResultActionState(item, {
          label: '正在切换到隔离浏览器，并打开项目登录浏览器...',
          tone: 'running'
        });
        const repairPayload = await repairBrowserSession();
        setResultActionState(item, repairPayload
          ? {
            label: '已切换到隔离浏览器，请在项目浏览器中继续处理登录或验证。',
            tone: 'success'
          }
          : {
            label: '隔离浏览器修复未完成，请检查浏览器设置后再试。',
            tone: 'error'
          });
      }
    }));
  }

  if (
    shouldOfferRepair
    && failureStage !== '浏览器接入'
    && (
      manualActionRequired
      || failureStage === '登录门槛'
      || failureStage === '评论接口受限'
      || manualActionReason === 'login_required'
      || manualActionReason === 'captcha'
      || manualActionReason === 'risk_control'
      || commentWarningCode === 'comment_login_required'
    )
  ) {
    actions.push(createAsyncResultActionButton({
      actionId: 'repair_manual_session',
      label: '一键修复',
      onClick: async () => {
        setResultActionState(item, {
          label: '正在打开项目登录浏览器，并检查登录状态...',
          tone: 'running'
        });
        const loginPayload = await openLoginBrowser();
        const browserStatus = await refreshBrowserStatus({ silent: true });
        const xiaohongshuStatus = readBrowserPlatformStatus(browserStatus, 'xiaohongshu');
        if (!loginPayload) {
          setResultActionState(item, {
            label: '项目登录浏览器打开失败，请检查浏览器设置后再试。',
            tone: 'error'
          });
          return;
        }
        setResultActionState(item, browserStatus?.connected && xiaohongshuStatus.state === 'alive'
          ? {
            label: '已打开项目登录浏览器，并检测到小红书可用，可直接点“处理后重试”。',
            tone: 'success'
          }
          : {
            label: '已打开项目登录浏览器，请先在该窗口完成登录或验证，再点“处理后重试”。',
            tone: 'warning'
          });
      }
    }));
  }

  if (shouldOfferBrowserRefresh) {
    actions.push(createAsyncResultActionButton({
      actionId: 'refresh_browser_status',
      label: '重新检测',
      onClick: async () => {
        setResultActionState(item, {
          label: '正在重新检测浏览器连接与登录状态...',
          tone: 'running'
        });
        const browserStatus = await refreshBrowserStatus();
        setResultActionState(item, browserStatus
          ? {
            label: browserStatus.connected
              ? '已重新检测：浏览器连接正常，可继续处理。'
              : '已重新检测：浏览器仍未连接，请先处理后再试。',
            tone: browserStatus.connected ? 'success' : 'warning'
          }
          : {
            label: '重新检测未完成，请稍后再试。',
            tone: 'error'
          });
      }
    }));
  }

  if (shouldOfferResume && resumeRunId) {
    actions.push(createAsyncResultActionButton({
      actionId: 'resume_result_item',
      label: '继续执行',
      onClick: async () => {
        try {
          await resumeResultItem(item, resumeRunId);
        } catch (error) {
          setResultActionState(item, {
            label: error.message || '继续执行失败，请稍后再试。',
            tone: 'error'
          });
          statusText.textContent = '继续执行失败';
          renderText(error.message || '继续执行失败');
          renderErrorBanner(error.message || '请求失败');
        }
      }
    }));
  }

  const retryLink = resolveResultLink(item);
  if (shouldOfferRetry && retryLink) {
    actions.push(createAsyncResultActionButton({
      actionId: 'retry_result_item',
      label: '处理后重试',
      onClick: async () => {
        fillLinksInput([retryLink], '当前结果');
        setResultActionState(item, {
          label: '已回填当前结果，正在重试...',
          tone: 'running'
        });
        const retryResult = await runSaveLinks(retryLink);
        if (retryResult?.ok === false) {
          setResultActionState(item, {
            label: '重试未完成，请先处理当前浏览器中的登录或验证后再试。',
            tone: 'error'
          });
        }
      }
    }));
  }
  return actions;
}

function collectResultWarningCodes(item) {
  const codes = new Set();
  const explicitCode = readResultStringField(item, 'comment_warning_code', 'commentWarningCode');
  if (explicitCode) {
    codes.add(explicitCode);
  }
  const warnings = Array.isArray(item?.warnings) ? item.warnings : [];
  warnings.forEach((warning) => {
    const code = String(warning?.code || '').trim();
    if (code) {
      codes.add(code);
    }
  });
  return Array.from(codes);
}

function buildWarningCodeSummary(results = []) {
  const codeMap = new Map();
  results.forEach((item) => {
    collectResultWarningCodes(item).forEach((code) => {
      codeMap.set(code, (codeMap.get(code) || 0) + 1);
    });
  });
  return Array.from(codeMap.entries())
    .map(([code, count]) => ({ code, count }))
    .sort((left, right) => right.count - left.count || left.code.localeCompare(right.code, 'en'));
}

function matchActiveWarningCodeFilter(item) {
  if (!activeWarningCodeFilter) return true;
  return collectResultWarningCodes(item).includes(activeWarningCodeFilter);
}

function buildFailureStageSummary(results = []) {
  const stageMap = new Map();
  results.forEach((item) => {
    const stageLabel = readResultFailureStageLabel(item, { includeUnknown: true });
    if (!stageLabel) return;
    stageMap.set(stageLabel, (stageMap.get(stageLabel) || 0) + 1);
  });
  return Array.from(stageMap.entries())
    .map(([stage, count]) => ({ stage, count }))
    .sort((left, right) => right.count - left.count || left.stage.localeCompare(right.stage, 'zh-CN'));
}

function matchActiveFailureStageFilter(item) {
  if (!activeFailureStageFilter) return true;
  return readResultFailureStageLabel(item, { includeUnknown: true }) === activeFailureStageFilter;
}

function matchResultFilters(item, groupKey = deriveResultGroupKey(item), overrides = {}) {
  const resultFilter = Object.prototype.hasOwnProperty.call(overrides, 'resultFilter')
    ? overrides.resultFilter
    : activeResultFilter;
  const warningCodeFilter = Object.prototype.hasOwnProperty.call(overrides, 'warningCodeFilter')
    ? overrides.warningCodeFilter
    : activeWarningCodeFilter;
  const failureStageFilter = Object.prototype.hasOwnProperty.call(overrides, 'failureStageFilter')
    ? overrides.failureStageFilter
    : activeFailureStageFilter;

  if (resultFilter === 'warnings' && !hasResultWarnings(item)) {
    return false;
  }
  if (resultFilter !== 'all' && resultFilter !== 'warnings' && resultFilter !== groupKey) {
    return false;
  }
  if (warningCodeFilter && !collectResultWarningCodes(item).includes(warningCodeFilter)) {
    return false;
  }
  if (failureStageFilter && readResultFailureStageLabel(item, { includeUnknown: true }) !== failureStageFilter) {
    return false;
  }
  return true;
}

function countVisibleResults(results = [], overrides = {}) {
  return results.filter((item) => matchResultFilters(item, deriveResultGroupKey(item), overrides)).length;
}

function collectVisibleResultItems(results = []) {
  return results.filter((item) => matchResultFilters(item, deriveResultGroupKey(item)));
}

function hasActiveResultFilters() {
  return activeResultFilter !== 'all'
    || Boolean(activeWarningCodeFilter)
    || Boolean(activeFailureStageFilter);
}

function shouldRetryVisibleResultItem(item, availability = readResultActionAvailability(item)) {
  if (!resolveResultLink(item)) return false;
  if (item?.status === 'failed') return true;
  if (availability.manualActionRequired) return true;
  return Boolean(availability.commentWarningCode);
}

function collectBulkResultActions(results = []) {
  const visibleItems = collectVisibleResultItems(results);
  const analyzableItems = [];
  const repairableItems = [];
  const browserRepairItems = [];
  const manualRepairItems = [];
  const retryableItems = [];

  visibleItems.forEach((item) => {
    const availability = readResultActionAvailability(item);
    if (availability.shouldOfferAnalyze) {
      analyzableItems.push(item);
    }
    if (availability.repairActionId === 'repair_browser_session') {
      repairableItems.push(item);
      browserRepairItems.push(item);
    } else if (availability.repairActionId === 'repair_manual_session') {
      repairableItems.push(item);
      manualRepairItems.push(item);
    }
    if (shouldRetryVisibleResultItem(item, availability)) {
      retryableItems.push(item);
    }
  });

  return {
    visibleItems,
    analyzableItems,
    repairableItems,
    browserRepairItems,
    manualRepairItems,
    retryableItems,
    retryInputs: collectUniqueResultLinks(retryableItems)
  };
}

function createAsyncBulkActionButton({ actionId, label, tone = 'ghost', onClick } = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = tone === 'secondary' ? 'button secondary result-bulk-action' : 'button ghost result-bulk-action';
  button.dataset.resultBulkAction = actionId || '';
  button.textContent = label || '执行';
  button.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    button.disabled = true;
    try {
      await onClick?.();
    } finally {
      button.disabled = false;
    }
  });
  return button;
}

function renderBulkResultActions(results = []) {
  const {
    visibleItems,
    analyzableItems,
    repairableItems,
    browserRepairItems,
    manualRepairItems,
    retryableItems,
    retryInputs
  } = collectBulkResultActions(results);
  const shouldRender = (
    analyzableItems.length > 1
    || repairableItems.length > 1
    || retryableItems.length > 1
    || (hasActiveResultFilters() && (analyzableItems.length > 0 || repairableItems.length > 0 || retryableItems.length > 0))
  );
  if (!shouldRender) return;

  const block = document.createElement('section');
  block.className = 'result-bulk-actions';
  block.dataset.bulkResultActions = 'true';

  const header = document.createElement('div');
  header.className = 'result-bulk-actions-header';

  const headerCopy = document.createElement('div');
  headerCopy.className = 'result-bulk-actions-copy';
  const title = document.createElement('strong');
  title.textContent = '当前异常处理';
  const meta = document.createElement('p');
  meta.className = 'result-bulk-actions-meta';
  meta.textContent = `当前结果 ${visibleItems.length} 条 · 可分析 ${analyzableItems.length} 条 · 可修复 ${repairableItems.length} 条 · 可重试 ${retryableItems.length} 条`;
  headerCopy.appendChild(title);
  headerCopy.appendChild(meta);
  header.appendChild(headerCopy);

  const nextStepsBlock = createResultNextStepsBlock(
    buildBulkNextSteps(visibleItems, {
      analyzableCount: analyzableItems.length,
      repairableCount: repairableItems.length,
      retryableCount: retryableItems.length
    }),
    { variant: 'bulk' }
  );

  const actions = document.createElement('div');
  actions.className = 'result-bulk-actions-row';

  if (analyzableItems.length > 0) {
    actions.appendChild(createAsyncBulkActionButton({
      actionId: 'analyze_visible_results',
      label: `一键分析当前 ${analyzableItems.length} 条`,
      onClick: async () => {
        const runningState = {
          label: `正在批量分析 ${analyzableItems.length} 条结果...`,
          tone: 'running'
        };
        setBulkResultActionState(runningState);
        setResultActionStates(analyzableItems, {
          label: '正在批量分析当前结果...',
          tone: 'running'
        });
        const browserStatus = await refreshBrowserStatus({ silent: true });
        setResultActionStateEntries(analyzableItems.map((item) => ({
          item,
          state: buildResultQuickAnalysis(item, browserStatus)
        })));
        const completedState = {
          label: `已完成批量分析 ${analyzableItems.length} 条结果，可直接查看每条结果下方建议。`,
          tone: 'success'
        };
        setBulkResultActionState(completedState);
        statusText.textContent = completedState.label;
      }
    }));
  }

  if (repairableItems.length > 0) {
    const needsBrowserRepair = browserRepairItems.length > 0;
    actions.appendChild(createAsyncBulkActionButton({
      actionId: 'repair_visible_results',
      label: `一键修复当前 ${repairableItems.length} 条`,
      tone: 'secondary',
      onClick: async () => {
        const runningLabel = needsBrowserRepair
          ? `正在批量修复 ${repairableItems.length} 条结果：切换隔离浏览器并打开项目登录浏览器...`
          : `正在批量修复 ${repairableItems.length} 条结果：打开项目登录浏览器并检查登录状态...`;
        setBulkResultActionState({
          label: runningLabel,
          tone: 'running'
        });
        setResultActionStates(repairableItems, {
          label: needsBrowserRepair
            ? '正在批量切换到隔离浏览器，并打开项目登录浏览器...'
            : '正在批量打开项目登录浏览器，并检查登录状态...',
          tone: 'running'
        });

        const repairPayload = needsBrowserRepair
          ? await repairBrowserSession()
          : await openLoginBrowser();
        const browserStatus = await refreshBrowserStatus({ silent: true });
        if (!repairPayload) {
          const failureState = needsBrowserRepair
            ? {
              label: '批量修复未完成，请检查浏览器设置后再试。',
              tone: 'error'
            }
            : {
              label: '项目登录浏览器打开失败，请检查浏览器设置后再试。',
              tone: 'error'
            };
          setResultActionStates(repairableItems, failureState);
          setBulkResultActionState(failureState);
          statusText.textContent = failureState.label;
          return;
        }

        setResultActionStateEntries([
          ...browserRepairItems.map((item) => ({
            item,
            state: buildBrowserRepairResultState(browserStatus)
          })),
          ...manualRepairItems.map((item) => ({
            item,
            state: buildManualRepairResultState(browserStatus)
          }))
        ]);
        const completedState = {
          label: `已完成批量修复 ${repairableItems.length} 条结果，请按每条结果提示继续。`,
          tone: browserStatus?.connected ? 'success' : 'warning'
        };
        setBulkResultActionState(completedState);
        statusText.textContent = completedState.label;
      }
    }));
  }

  if (retryInputs.length > 0) {
    actions.appendChild(createAsyncBulkActionButton({
      actionId: 'retry_visible_results',
      label: `处理后重试当前 ${retryableItems.length} 条`,
      onClick: async () => {
        const runningState = {
          label: `已回填当前筛选结果 ${retryInputs.length} 条，正在批量重试...`,
          tone: 'running'
        };
        setBulkResultActionState(runningState);
        setResultActionStates(retryableItems, {
          label: '已回填当前筛选结果，正在重试...',
          tone: 'running'
        });
        fillLinksInput(retryInputs, '当前筛选结果');
        const retryResult = await runSaveLinks(retryInputs.join('\n'));
        if (retryResult?.ok === false) {
          const failureState = {
            label: '批量重试未完成，请先处理浏览器中的登录、验证或详情页后再试。',
            tone: 'error'
          };
          setBulkResultActionState(failureState);
          setResultActionStates(retryableItems, failureState);
          statusText.textContent = failureState.label;
        }
      }
    }));
  }

  if (!actions.childNodes.length) return;

  header.appendChild(actions);
  block.appendChild(header);
  if (nextStepsBlock) {
    block.appendChild(nextStepsBlock);
  }

  if (repairableItems.length > 0) {
    const note = document.createElement('p');
    note.className = 'result-bulk-actions-note';
    note.textContent = describeBulkRepairPlan(browserRepairItems.length, manualRepairItems.length);
    block.appendChild(note);
  }

  const bulkState = createBulkResultActionStatus(readBulkResultActionState());
  if (bulkState) {
    block.appendChild(bulkState);
  }

  resultSummary.appendChild(block);
}

function describeBulkRepairPlan(browserRepairCount = 0, manualRepairCount = 0) {
  if (browserRepairCount > 0) {
    return manualRepairCount > 0
      ? '当前筛选里同时有浏览器接入问题和登录门槛，批量修复会优先切到隔离浏览器，并顺手打开项目登录浏览器。'
      : '当前筛选里主要是浏览器接入问题，批量修复会统一切到隔离浏览器并打开项目登录浏览器。';
  }
  return '当前筛选里主要是登录门槛或评论受限，批量修复会统一打开项目登录浏览器，并把处理提示回显到每条结果。';
}

function renderFailureStageSummary(results = []) {
  const items = buildFailureStageSummary(results);
  if (items.length === 0) return;

  const block = document.createElement('section');
  block.className = 'summary-block failure-stage-summary';
  block.dataset.failureStageSummary = 'true';

  const header = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = '失败层级分布';
  const total = document.createElement('span');
  total.textContent = `${items.length} 类`;
  header.appendChild(title);
  header.appendChild(total);
  block.appendChild(header);

  const list = document.createElement('div');
  list.className = 'failure-stage-list';
  items.forEach((item) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'failure-stage-item';
    row.dataset.failureStage = item.stage;
    row.dataset.active = activeFailureStageFilter === item.stage ? 'true' : 'false';
    row.addEventListener('click', () => {
      activeFailureStageFilter = activeFailureStageFilter === item.stage ? '' : item.stage;
      renderSummary(lastReport);
    });

    const label = document.createElement('span');
    label.className = 'failure-stage-label';
    label.textContent = item.stage;

    const count = document.createElement('span');
    count.className = 'failure-stage-count';
    count.textContent = String(item.count);

    row.appendChild(label);
    row.appendChild(count);
    list.appendChild(row);
  });
  block.appendChild(list);
  resultSummary.appendChild(block);
}

function renderWarningCodeSummary(results = []) {
  const items = buildWarningCodeSummary(results);
  if (items.length === 0) return;

  const block = document.createElement('section');
  block.className = 'summary-block warning-code-summary';
  block.dataset.warningCodeSummary = 'true';

  const header = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = '评论提示分布';
  const total = document.createElement('span');
  total.textContent = `${items.length} 类`;
  header.appendChild(title);
  header.appendChild(total);
  block.appendChild(header);

  const list = document.createElement('div');
  list.className = 'warning-code-list';
  items.forEach((item) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'warning-code-item';
    row.dataset.warningCode = item.code;
    row.dataset.active = activeWarningCodeFilter === item.code ? 'true' : 'false';
    row.addEventListener('click', () => {
      activeWarningCodeFilter = activeWarningCodeFilter === item.code ? '' : item.code;
      renderSummary(lastReport);
    });

    const label = document.createElement('span');
    label.className = 'warning-code-label';
    const readable = helpers.describeCommentWarningCode
      ? helpers.describeCommentWarningCode(item.code)
      : item.code;
    label.textContent = readable ? `${readable} · ${item.code}` : item.code;

    const count = document.createElement('span');
    count.className = 'warning-code-count';
    count.textContent = String(item.count);

    row.appendChild(label);
    row.appendChild(count);
    list.appendChild(row);
  });
  block.appendChild(list);
  resultSummary.appendChild(block);
}

function buildActiveFilterDescriptors(groups = []) {
  const filters = [];
  if (activeResultFilter !== 'all') {
    const label = activeResultFilter === 'warnings'
      ? '结果分组 · 有提示'
      : `结果分组 · ${groups.find((group) => group.key === activeResultFilter)?.label || activeResultFilter}`;
    filters.push({
      kind: 'group',
      label,
      clear: () => {
        activeResultFilter = 'all';
      }
    });
  }
  if (activeWarningCodeFilter) {
    const readable = helpers.describeCommentWarningCode
      ? helpers.describeCommentWarningCode(activeWarningCodeFilter)
      : '';
    filters.push({
      kind: 'warning_code',
      label: readable
        ? `评论提示 · ${readable} · ${activeWarningCodeFilter}`
        : `评论提示 · ${activeWarningCodeFilter}`,
      clear: () => {
        activeWarningCodeFilter = '';
      }
    });
  }
  if (activeFailureStageFilter) {
    filters.push({
      kind: 'failure_stage',
      label: `失败层级 · ${activeFailureStageFilter}`,
      clear: () => {
        activeFailureStageFilter = '';
      }
    });
  }
  return filters;
}

function createActiveFilterChip({ kind, label, clear } = {}) {
  if (!label) return null;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'active-filter-chip';
  button.dataset.activeFilterKind = kind || '';
  button.textContent = `${label} ×`;
  button.addEventListener('click', () => {
    clear?.();
    renderSummary(lastReport);
  });
  return button;
}

function renderAppliedFilterBar(results = [], groups = []) {
  const filters = buildActiveFilterDescriptors(groups);
  if (filters.length === 0) return;

  const block = document.createElement('section');
  block.className = 'result-active-filters';
  block.dataset.activeFilters = 'true';

  const header = document.createElement('div');
  header.className = 'result-active-filters-header';

  const title = document.createElement('strong');
  title.textContent = '当前筛选中';
  header.appendChild(title);

  const meta = document.createElement('span');
  meta.className = 'result-active-filters-meta';
  meta.textContent = `${countVisibleResults(results)} 条结果`;
  header.appendChild(meta);
  block.appendChild(header);

  const list = document.createElement('div');
  list.className = 'active-filter-list';
  filters
    .map((item) => createActiveFilterChip(item))
    .filter(Boolean)
    .forEach((chip) => list.appendChild(chip));
  block.appendChild(list);

  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.className = 'active-filter-clear';
  clearButton.dataset.activeFilterKind = 'all';
  clearButton.textContent = '清空筛选';
  clearButton.addEventListener('click', () => {
    activeResultFilter = 'all';
    activeWarningCodeFilter = '';
    activeFailureStageFilter = '';
    renderSummary(lastReport);
  });
  block.appendChild(clearButton);

  resultSummary.appendChild(block);
}

function buildResultRow(item) {
  const row = document.createElement('div');
  row.className = `result-row ${item.status || 'unknown'}`;
  const main = document.createElement('div');
  main.className = 'result-main';
  const title = document.createElement('div');
  title.className = 'result-title';
  title.textContent = formatResultLabel(item) || item.filepath || item.canonicalUrl || item.navigationUrl || item.noteId || item.input || '未命名';
  const meta = document.createElement('div');
  meta.className = 'result-meta-text';
  const diagnostics = buildResultDiagnostics(item);

  if (item.status === 'failed') {
    const statusLabel = helpers.describeResultStatus
      ? helpers.describeResultStatus(item)
      : (item.error || '失败');
    const failureStage = helpers.describeResultFailureStage
      ? helpers.describeResultFailureStage(item)
      : '';
    meta.textContent = Array.from(new Set([failureStage, statusLabel].filter(Boolean))).join(' · ');
    if (item.error) {
      row.title = item.error;
    }
  } else {
    const platformLabel = helpers.describePlatform ? helpers.describePlatform(item) : '';
    const savedCollection = helpers.describeSavedCollection ? helpers.describeSavedCollection(item) : '';
    const warnings = Array.isArray(item.warnings) ? item.warnings : [];
    const warningLabels = Array.from(new Set(
      warnings
        .map((warning) => helpers.describeWarning ? helpers.describeWarning(warning) : (warning.message || '存在采集提示'))
        .filter(Boolean)
    ));
    const successParts = [
      platformLabel,
      savedCollection ? `分类 ${savedCollection}` : '',
      '成功'
    ].filter(Boolean);
    if (warningLabels.length > 0) {
      successParts.push(warningLabels.join('；'));
    }
    meta.textContent = successParts.join(' · ');
    const titleParts = [
      item.filepath || '',
      ...warnings
        .map((warning) => warning.message || '')
        .filter(Boolean),
      ...diagnostics.titleParts
    ].filter(Boolean);
    if (titleParts.length > 0) {
      row.title = titleParts.join('\n');
    }
  }

  main.appendChild(title);
  main.appendChild(meta);
  (Array.isArray(diagnostics.noteLines) ? diagnostics.noteLines : [])
    .filter(Boolean)
    .forEach((line) => {
      const note = document.createElement('div');
      note.className = 'result-note';
      note.textContent = line;
      main.appendChild(note);
    });
  row.appendChild(main);
  const actions = buildResultRowActions(item);
  const actionState = readResultActionState(item);
  const nextStepsBlock = createResultNextStepsBlock(diagnostics.nextSteps, { variant: 'row' });
  if (diagnostics.chips.length > 0 || actions.length > 0 || actionState?.label || nextStepsBlock) {
    const secondary = document.createElement('div');
    secondary.className = 'result-secondary';
    if (diagnostics.chips.length > 0) {
      const diagnosticWrap = document.createElement('div');
      diagnosticWrap.className = 'result-diagnostics';
      diagnostics.chips
        .map((chip) => createResultDiagnosticChip(chip))
        .filter(Boolean)
        .forEach((chip) => diagnosticWrap.appendChild(chip));
      secondary.appendChild(diagnosticWrap);
    }
    if (nextStepsBlock) {
      secondary.appendChild(nextStepsBlock);
    }
    if (actions.length > 0) {
      const actionRow = document.createElement('div');
      actionRow.className = 'result-row-actions';
      actions.forEach((action) => actionRow.appendChild(action));
      secondary.appendChild(actionRow);
    }
    const actionStateNode = createResultActionStatus(actionState);
    if (actionStateNode) {
      secondary.appendChild(actionStateNode);
    }
    row.appendChild(secondary);
  }
  return row;
}

function renderResultFilters(groups = []) {
  const filterRow = document.createElement('div');
  filterRow.className = 'result-filter-row';
  const warningCount = countVisibleResults(
    groups.flatMap((group) => group.items),
    { resultFilter: 'warnings' }
  );

  const options = [
    {
      key: 'all',
      label: '全部',
      count: groups.reduce(
        (total, group) => total + group.items.filter((item) => matchResultFilters(item, group.key, { resultFilter: 'all' })).length,
        0
      )
    },
    ...(warningCount > 0 ? [{
      key: 'warnings',
      label: '有提示',
      count: warningCount
    }] : []),
    ...groups.map((group) => ({
      key: group.key,
      label: group.label,
      count: group.items.filter((item) => matchResultFilters(item, group.key, { resultFilter: group.key })).length
    }))
  ];

  options.forEach((option) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'result-filter';
    button.dataset.filterKey = option.key;
    button.dataset.active = activeResultFilter === option.key ? 'true' : 'false';
    button.textContent = `${option.label} ${option.count}`;
    button.addEventListener('click', () => {
      activeResultFilter = option.key;
      renderSummary(lastReport);
    });
    filterRow.appendChild(button);
  });

  resultSummary.appendChild(filterRow);
}

function renderResultGroups(results = []) {
  const groups = buildResultGroups(results);
  if (groups.length === 0) return;
  const hasWarnings = groups.some((group) => group.warningCount > 0);

  normalizeActiveResultFilter(groups);
  normalizeActiveWarningCodeFilter(results);
  normalizeActiveFailureStageFilter(results);
  renderAppliedFilterBar(results, groups);
  renderBulkResultActions(results);
  if (groups.length > 1 || hasWarnings) {
    renderResultFilters(groups);
  }

  groups.forEach((group, groupIndex) => {
    const visibleItems = group.items.filter((item) => matchResultFilters(item, group.key));
    const details = document.createElement('details');
    details.className = 'result-group';
    details.dataset.groupKey = group.key;
    details.hidden = visibleItems.length === 0
      || (
        activeResultFilter !== 'all'
        && activeResultFilter !== 'warnings'
        && activeResultFilter !== group.key
      );
    details.open = true;

    const summary = document.createElement('summary');
    summary.className = 'result-group-summary';
    const label = document.createElement('span');
    label.className = 'result-group-label';
    label.textContent = group.label;
    const meta = document.createElement('span');
    meta.className = 'result-group-meta';
    const count = document.createElement('span');
    count.className = 'result-group-count';
    count.textContent = `${visibleItems.length} 条`;
    summary.appendChild(label);
    meta.appendChild(count);
    if (group.warningCount > 0) {
      const warningCount = document.createElement('span');
      warningCount.className = 'result-group-warning-count';
      warningCount.textContent = `有提示 ${group.warningCount}`;
      warningCount.title = `${group.label} 中有 ${group.warningCount} 条结果包含采集提示`;
      meta.appendChild(warningCount);
    }
    const runButton = document.createElement('button');
    runButton.type = 'button';
    runButton.className = 'result-group-action is-primary';
    runButton.dataset.groupAction = 'run-links';
    runButton.textContent = '开始保存本组';
    runButton.disabled = !Array.isArray(group.links) || group.links.length === 0;
    runButton.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!Array.isArray(group.links) || group.links.length === 0) return;
      fillLinksInput(group.links, group.label);
      await runSaveLinks(group.links.join('\n'));
    });
    meta.appendChild(runButton);

    const secondaryWrap = document.createElement('span');
    secondaryWrap.className = 'result-group-secondary';
    const secondaryMenuId = `result-group-menu-${groupIndex}`;
    const moreToggle = document.createElement('button');
    moreToggle.type = 'button';
    moreToggle.className = 'result-group-action result-group-more-toggle';
    moreToggle.dataset.groupAction = 'toggle-more';
    moreToggle.textContent = '更多';
    moreToggle.disabled = !Array.isArray(group.links) || group.links.length === 0;
    moreToggle.setAttribute('aria-expanded', 'false');
    moreToggle.setAttribute('aria-controls', secondaryMenuId);
    moreToggle.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleResultGroupMenu(moreToggle, secondaryMenu);
    });
    secondaryWrap.appendChild(moreToggle);

    const secondaryMenu = document.createElement('div');
    secondaryMenu.className = 'result-group-more-menu';
    secondaryMenu.dataset.groupActionMenu = 'true';
    secondaryMenu.id = secondaryMenuId;
    secondaryMenu.hidden = true;

    const copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.className = 'result-group-action';
    copyButton.dataset.groupAction = 'copy-links';
    copyButton.textContent = '复制本组链接';
    copyButton.disabled = !Array.isArray(group.links) || group.links.length === 0;
    copyButton.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!Array.isArray(group.links) || group.links.length === 0) return;
      copyButton.disabled = true;
      clearErrorBanner();
      try {
        await copyTextToClipboard(group.links.join('\n'));
        statusText.textContent = `已复制 ${group.label} ${group.links.length} 条链接`;
      } catch (error) {
        statusText.textContent = '复制链接失败';
        renderErrorBanner(error.message || '复制失败');
      } finally {
        closeResultGroupMenuForElement(copyButton);
        copyButton.disabled = !Array.isArray(group.links) || group.links.length === 0;
      }
    });
    secondaryMenu.appendChild(copyButton);

    const fillButton = document.createElement('button');
    fillButton.type = 'button';
    fillButton.className = 'result-group-action';
    fillButton.dataset.groupAction = 'fill-links';
    fillButton.textContent = '填入输入框';
    fillButton.disabled = !Array.isArray(group.links) || group.links.length === 0;
    fillButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!Array.isArray(group.links) || group.links.length === 0) return;
      fillLinksInput(group.links, group.label);
      closeResultGroupMenuForElement(fillButton);
    });
    secondaryMenu.appendChild(fillButton);

    const exportButton = document.createElement('button');
    exportButton.type = 'button';
    exportButton.className = 'result-group-action';
    exportButton.dataset.groupAction = 'export-links';
    exportButton.textContent = '导出本组清单';
    exportButton.disabled = !Array.isArray(group.links) || group.links.length === 0;
    exportButton.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!Array.isArray(group.links) || group.links.length === 0) return;
      exportButton.disabled = true;
      clearErrorBanner();
      try {
        const payload = await requestJson('/api/export-links-list', {
          body: {
            groupKey: group.key,
            report: lastReport,
            uiConfig: readConfigFromForm()
          }
        });
        statusText.textContent = `已导出 ${group.label} ${payload.count || group.links.length} 条链接：${payload.filePath || ''}`;
      } catch (error) {
        statusText.textContent = '导出链接清单失败';
        renderErrorBanner(error.message || '请求失败');
      } finally {
        closeResultGroupMenuForElement(exportButton);
        exportButton.disabled = !Array.isArray(group.links) || group.links.length === 0;
      }
    });
    secondaryMenu.appendChild(exportButton);
    secondaryWrap.appendChild(secondaryMenu);
    meta.appendChild(secondaryWrap);
    summary.appendChild(meta);
    details.appendChild(summary);

    const list = document.createElement('div');
    list.className = 'result-list';
    visibleItems.forEach((item) => {
      list.appendChild(buildResultRow(item));
    });
    details.appendChild(list);
    resultSummary.appendChild(details);
  });
}

function renderSummary(report) {
  syncResultActionStateForReport(report || null);
  resultSummary.innerHTML = '';
  if (!report) {
    syncRetryFailedButtonState(false, null);
    return;
  }

  if (typeof report.added === 'number') {
    const summary = document.createElement('div');
    summary.className = 'summary-block';
    const modeLabel = build_inbox_sync_mode_label(report);
    const cursorLabel = report.mode !== 'recent'
      && report.mode !== 'window'
      && typeof report.since === 'number'
      && typeof report.nextModified === 'number'
      ? `${report.since} → ${report.nextModified}`
      : '';
    summary.innerHTML = `
      <div>
        <strong>新增</strong>
        <span>${report.added}</span>
      </div>
      <div>
        <strong>跳过</strong>
        <span>${report.skipped ?? 0}</span>
      </div>
      <div>
        <strong>总数</strong>
        <span>${report.total ?? 0}</span>
      </div>
      <div>
        <strong>模式</strong>
        <span>${modeLabel}</span>
      </div>
      ${cursorLabel ? `
      <div>
        <strong>游标</strong>
        <span>${cursorLabel}</span>
      </div>` : ''}
    `;
    resultSummary.appendChild(summary);
    syncRetryFailedButtonState(false, report);
    return;
  }

  if (typeof report.total === 'number') {
    const summary = document.createElement('div');
    summary.className = 'summary-block';
    summary.innerHTML = `
      <div>
        <strong>总数</strong>
        <span>${report.total}</span>
      </div>
      <div>
        <strong>成功</strong>
        <span>${report.successCount ?? 0}</span>
      </div>
      <div>
        <strong>失败</strong>
        <span>${report.failureCount ?? 0}</span>
      </div>
    `;
    resultSummary.appendChild(summary);
  }

  if (Array.isArray(report.results) && report.results.length > 0) {
    normalizeActiveFailureStageFilter(report.results);
    renderFailureStageSummary(report.results);
    normalizeActiveWarningCodeFilter(report.results);
    renderWarningCodeSummary(report.results);
  }

  if (Array.isArray(report.results) && report.results.length > 0) {
    renderResultGroups(report.results);
  }

  if (Array.isArray(report.warnings) && report.warnings.length > 0) {
    const block = document.createElement('div');
    block.className = 'summary-block';
    const header = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = '采集提示';
    const count = document.createElement('span');
    count.textContent = String(report.warnings.length);
    header.appendChild(strong);
    header.appendChild(count);
    block.appendChild(header);

    const list = document.createElement('ul');
    report.warnings.forEach((warning) => {
      const item = document.createElement('li');
      item.textContent = helpers.describeWarning
        ? helpers.describeWarning(warning)
        : (warning.message || '存在采集提示');
      if (warning.message) {
        item.title = warning.message;
      }
      list.appendChild(item);
    });
    block.appendChild(list);
    resultSummary.appendChild(block);
  }

  if (report.output?.steps || report.output?.logs) {
    const block = document.createElement('div');
    block.className = 'summary-block';
    const steps = Array.isArray(report.output.steps) ? report.output.steps : [];
    const logs = Array.isArray(report.output.logs) ? report.output.logs : [];
    block.innerHTML = `
      <div>
        <strong>执行脚本</strong>
        <span>${steps.map((s) => s.script).join(' / ') || '未知'}</span>
      </div>
      <div>
        <strong>日志条数</strong>
        <span>${logs.length}</span>
      </div>
    `;
    resultSummary.appendChild(block);
  }

  syncRetryFailedButtonState(false, report);
}

function readTaskHistory() {
  try {
    const raw = window?.localStorage?.getItem(TASK_HISTORY_STORAGE_KEY) || '[]';
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry) => entry && typeof entry === 'object' && entry.report && typeof entry.report === 'object')
      .slice(0, TASK_HISTORY_LIMIT);
  } catch (_) {
    return [];
  }
}

function saveTaskHistory(entries) {
  try {
    const normalized = Array.isArray(entries) ? entries.slice(0, TASK_HISTORY_LIMIT) : [];
    window?.localStorage?.setItem(TASK_HISTORY_STORAGE_KEY, JSON.stringify(normalized));
  } catch (_) {
    // 忽略无存储权限的环境
  }
}

function formatTaskHistoryTime(savedAt) {
  const value = Number(savedAt || 0);
  if (!Number.isFinite(value) || value <= 0) return '';
  try {
    return new Date(value).toLocaleString('zh-CN', { hour12: false });
  } catch (_) {
    return '';
  }
}

function deriveTaskHistoryTitle(report, taskType = '', preferredTitle = '') {
  if (preferredTitle) return preferredTitle;
  if (taskType === 'collection-export') return '小红书收藏同步';
  if (taskType === 'zhihu-favorites-export') {
    return report?.collectionTitle
      ? `知乎收藏夹 · ${report.collectionTitle}`
      : '知乎收藏夹同步';
  }
  if (taskType === 'inbox-sync') {
    return build_inbox_sync_history_title(report);
  }
  if (taskType === 'inbox-save') return '收件箱解析保存';
  if (taskType === 'note-save') return '链接保存';
  if (report?.collectionTitle) return String(report.collectionTitle);
  if (report?.outputFolder) {
    const folderName = String(report.outputFolder).split(/[/\\]/).filter(Boolean).pop();
    if (folderName) return folderName;
  }
  return '最近任务';
}

function buildTaskHistoryMeta(entry) {
  const report = entry?.report || {};
  const parts = [];
  const timeLabel = formatTaskHistoryTime(entry?.savedAt);
  if (timeLabel) {
    parts.push(timeLabel);
  }
  if (typeof report.total === 'number') {
    parts.push(`总 ${report.total}`);
  }
  if (typeof report.successCount === 'number') {
    parts.push(`成功 ${report.successCount}`);
  }
  if (typeof report.added === 'number') {
    parts.push(`新增 ${report.added}`);
  }
  return parts.join(' · ') || '可恢复到结果区继续查看';
}

function restoreTaskHistoryEntry(entry) {
  if (!entry || !entry.report) return;
  if (entry.taskType === 'inbox-sync') {
    lastInboxSyncReport = entry.report;
    lastInboxSyncUrls = Array.isArray(entry.report?.urls) ? entry.report.urls : [];
  }
  clearErrorBanner();
  activeResultFilter = 'all';
  activeWarningCodeFilter = '';
  renderReport({ report: entry.report }, { skipHistory: true });
  statusText.textContent = `已恢复最近任务：${entry.title || '未命名任务'}`;
}

function renderTaskHistory() {
  if (!taskHistoryList) return;

  const entries = readTaskHistory();
  taskHistoryList.innerHTML = '';
  if (entries.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'task-history-empty';
    empty.textContent = '最近任务会显示在这里，可直接恢复到结果区继续查看。';
    taskHistoryList.appendChild(empty);
    return;
  }

  entries.forEach((entry) => {
    const item = document.createElement('section');
    item.className = 'task-history-item';

    const head = document.createElement('div');
    head.className = 'task-history-item-head';

    const title = document.createElement('strong');
    title.textContent = entry.title || '未命名任务';

    const time = document.createElement('span');
    time.className = 'task-history-item-time';
    time.textContent = formatTaskHistoryTime(entry.savedAt) || '刚刚';

    head.appendChild(title);
    head.appendChild(time);

    const meta = document.createElement('p');
    meta.className = 'task-history-item-meta';
    meta.textContent = buildTaskHistoryMeta(entry);

    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'button ghost';
    action.textContent = '恢复结果';
    action.addEventListener('click', () => {
      restoreTaskHistoryEntry(entry);
    });

    item.appendChild(head);
    item.appendChild(meta);
    item.appendChild(action);
    taskHistoryList.appendChild(item);
  });
}

function recordTaskHistory({ report, taskType = '', title = '' } = {}) {
  if (!report || typeof report !== 'object') return;

  const entry = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
    taskType: String(taskType || '').trim(),
    title: deriveTaskHistoryTitle(report, taskType, title),
    savedAt: Date.now(),
    report
  };
  const history = readTaskHistory().filter((item) => item && typeof item === 'object');
  saveTaskHistory([entry, ...history]);
  renderTaskHistory();
}

function renderReport(payload, options = {}) {
  const report = payload?.report || payload;
  const taskType = String(options.taskType || payload?.task || '').trim();
  const historyTitle = String(options.historyTitle || '').trim();
  const skipHistory = options.skipHistory === true;
  activeResultFilter = 'all';
  activeWarningCodeFilter = '';
  activeFailureStageFilter = '';
  lastReport = report || null;
  renderSummary(report);
  renderText(JSON.stringify(report, null, 2));
  syncRetryFailedButtonState(false);
  syncOpenOutputButtonState(false);
  if (!skipHistory && report && typeof report === 'object') {
    recordTaskHistory({
      report,
      taskType,
      title: historyTitle
    });
  }
}

function formatResultLabel(result) {
  if (!result) return '';
  if (result.filepath) {
    const parts = String(result.filepath).split(/[/\\\\]/);
    return parts[parts.length - 1];
  }
  return result.canonicalUrl || result.navigationUrl || result.input || '';
}

async function loadUiConfig() {
  setConfigStatus('正在加载配置...', 'muted');
  const payload = await requestJson('/api/ui-config', { method: 'GET' });
  currentConfig = payload.config || {};
  applyConfigToForm(currentConfig);
  renderSummaryRow(currentConfig);
  renderTaskHistory();
  await refreshBrowserStatus({ silent: true });
  setConfigStatus('配置已加载', 'ok');
}

async function saveUiConfigState(config, options = {}) {
  const payload = await requestJson('/api/ui-config', { body: { config } });
  currentConfig = payload.config || config;
  applyConfigToForm(currentConfig);
  renderSummaryRow(currentConfig);
  if (options.refreshBrowserStatus !== false) {
    await refreshBrowserStatus({ silent: true });
  }
  return currentConfig;
}

async function repairBrowserSession() {
  setBusy(true, '正在修复浏览器接入...');
  clearErrorBanner();

  try {
    const config = readConfigFromForm();
    const repairedConfig = {
      ...config,
      browser: {
        ...config.browser,
        mode: 'isolated',
        browserUrl: ''
      }
    };
    await saveUiConfigState(repairedConfig, { refreshBrowserStatus: false });
    setActiveSettingsTab('browser', { persist: true });
    const loginPayload = await requestJson('/api/browser/login', {
      body: {
        uiConfig: repairedConfig
      }
    });
    await refreshBrowserStatus({ silent: true });
    statusText.textContent = `已切换到隔离浏览器，并打开项目登录浏览器：${loginPayload.profileDir || loginPayload.userDataDir || ''}`;
    renderText(JSON.stringify(loginPayload, null, 2));
    return loginPayload;
  } catch (error) {
    statusText.textContent = '浏览器一键修复失败';
    renderText(error.message || '修复失败');
    renderErrorBanner(error.message || '修复失败');
    return null;
  } finally {
    setBusy(false, statusText.textContent);
  }
}

async function handleErrorAction(actionId) {
  if (actionId === 'repair_browser_session') {
    await repairBrowserSession();
    return;
  }
  if (actionId === 'open_login_browser') {
    await openLoginBrowser();
    return;
  }
  if (actionId === 'open_browser_settings') {
    openSettings();
    setActiveSettingsTab('browser', { persist: true });
    statusText.textContent = '已打开浏览器接入设置';
    return;
  }
  if (actionId === 'refresh_browser_status') {
    await refreshBrowserStatus();
  }
}

configForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setConfigStatus('正在保存配置...', 'muted');
  try {
    const config = readConfigFromForm();
    await saveUiConfigState(config);
    setConfigStatus('配置已保存', 'ok');
    closeSettings();
  } catch (error) {
    setConfigStatus(error.message || '保存失败', 'error');
  }
});

configReload.addEventListener('click', async () => {
  try {
    await loadUiConfig();
  } catch (error) {
    setConfigStatus(error.message || '加载失败', 'error');
  }
});

if (runtimeOpenrouterTestButton) {
  runtimeOpenrouterTestButton.addEventListener('click', async () => {
    if (runtimeOpenrouterTestButton.disabled) return;
    clearErrorBanner();
    const uiConfig = readConfigFromForm();
    const result = await requestAiApiConnectivity(uiConfig, {
      updateStatus: true
    });
    if (result.ok) {
      statusText.textContent = result.payload?.message || 'AI API 联通正常';
      renderText(JSON.stringify(result.payload || {}, null, 2));
      return;
    }
    statusText.textContent = 'AI API 测试失败';
    renderText(result.error?.message || 'AI API 测试失败');
    renderErrorBanner(result.error?.message || 'AI API 测试失败');
  });
}

openSettingsButton.addEventListener('click', () => openSettings());
workspaceSettingsButtons.forEach((button) => {
  button.addEventListener('click', () => openSettings());
});
closeSettingsButton.addEventListener('click', () => closeSettings());
settingsOverlay.addEventListener('click', () => closeSettings());
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !settingsModal.hidden) {
    closeSettings();
  }
  if (event.key === 'Escape') {
    closeResultGroupMenus();
  }
});
document.addEventListener('click', (event) => {
  const target = event.target;
  if (target && typeof target.closest === 'function' && target.closest('.result-group-secondary')) {
    return;
  }
  closeResultGroupMenus();
});
if (errorDismiss) {
  errorDismiss.addEventListener('click', () => clearErrorBanner());
}
if (errorActions) {
  errorActions.addEventListener('click', async (event) => {
    const target = event.target;
    if (!target || typeof target.closest !== 'function') return;
    const button = target.closest('[data-error-action]');
    if (!button) return;
    await handleErrorAction(String(button.dataset.errorAction || '').trim());
  });
}

initializeSettingsTabs();
initializeCollectionSourceSwitch();
initializeWorkspaceNavigation();

linksClear.addEventListener('click', () => {
  linksText.value = '';
});

async function runSaveLinks(textOverride = null) {
  const requestText = typeof textOverride === 'string' ? textOverride : linksText.value;
  if (typeof textOverride === 'string') {
    linksText.value = textOverride;
  }
  setBusy(true, '正在顺序保存链接...');
  renderText('正在检查 AI API 联通性...');
  resetProgressList();
  beginTaskLog('links');
  clearErrorBanner();

  try {
    const uiConfig = readConfigFromForm();
    appendTaskLog('开始链接保存');
    const aiCheck = await ensureAiApiReadyForTask({
      uiConfig,
      scope: 'links',
      taskLabel: '链接保存',
      preserveLog: true
    });
    if (!aiCheck.ok) {
      return { ok: false, error: aiCheck.error || new Error('AI API unavailable') };
    }
    renderText('任务已提交，等待返回...');
    const payload = await requestNdjson('/api/save-links-stream', {
      text: requestText,
      uiConfig
    }, {
      onEvent: (message) => {
        if (message.type === 'start') {
          renderProgressList(message.targets || []);
          statusText.textContent = `准备处理 ${message.total || 0} 条`;
          appendTaskLog(`已提交链接保存任务：共 ${Number(message.total || 0)} 条`);
        }
        if (message.type === 'tick') {
          updateProgressItem(message.index, 'running');
          statusText.textContent = `正在处理第 ${Number(message.index) + 1}/${message.total || 0} 条`;
          appendTaskLog(`开始处理第 ${Number(message.index) + 1}/${message.total || 0} 条`);
        }
        if (message.type === 'progress') {
          const result = message.result || {};
          const status = result.status === 'failed' ? 'failed' : 'success';
          const label = formatResultLabel(result);
          updateProgressItem(message.index, status, {
            label: label || undefined,
            error: result.error || ''
          });
          if (status === 'failed') {
            appendTaskLog(`第 ${Number(message.index) + 1}/${message.total || 0} 条保存失败：${result.error || '未知错误'}`, {
              level: 'failed'
            });
          } else {
            appendTaskLog(`第 ${Number(message.index) + 1}/${message.total || 0} 条保存成功`, {
              level: 'success'
            });
          }
        }
      }
    });
    statusText.textContent = '链接保存完成';
    appendTaskLog(
      `链接保存完成：成功 ${Number(payload?.report?.successCount || 0)} 条，失败 ${Number(payload?.report?.failureCount || 0)} 条`,
      { level: Number(payload?.report?.failureCount || 0) > 0 ? 'warning' : 'success' }
    );
    renderReport(payload, {
      taskType: 'note-save',
      historyTitle: '链接保存'
    });
    return { ok: true, payload };
  } catch (error) {
    statusText.textContent = '链接保存失败';
    renderText(error.message);
    appendTaskLog(`链接保存失败：${error.message || '请求失败'}`, { level: 'failed' });
    renderErrorBanner(error.message || '请求失败');
    return { ok: false, error };
  } finally {
    setBusy(false, statusText.textContent);
  }
}

linksForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  await runSaveLinks();
});

collectionSubmit.addEventListener('click', async () => {
  setBusy(true, '正在同步小红书收藏...');
  renderText('正在检查 AI API 联通性...');
  resetProgressList();
  beginTaskLog('collection');
  clearErrorBanner();

  try {
    const uiConfig = readConfigFromForm();
    appendTaskLog('开始同步小红书收藏');
    const aiCheck = await ensureAiApiReadyForTask({
      uiConfig,
      scope: 'collection',
      taskLabel: '小红书收藏同步',
      preserveLog: true
    });
    if (!aiCheck.ok) {
      return;
    }
    renderText('任务已提交，等待返回...');
    const payload = await requestJson('/api/save-collection', {
      body: { uiConfig }
    });
    statusText.textContent = '小红书收藏同步完成';
    appendTaskLog('小红书收藏同步完成', { level: 'success' });
    renderReport(payload, {
      taskType: 'collection-export',
      historyTitle: '小红书收藏同步'
    });
  } catch (error) {
    statusText.textContent = '小红书收藏同步失败';
    renderText(error.message);
    appendTaskLog(`小红书收藏同步失败：${error.message || '请求失败'}`, { level: 'failed' });
    renderErrorBanner(error.message || '请求失败');
  } finally {
    setBusy(false, statusText.textContent);
  }
});

async function runZhihuFavoritesSync() {
  const collectionUrl = String(zhihuFavoritesUrl?.value || '').trim();
  if (!collectionUrl) {
    statusText.textContent = '请输入知乎收藏夹链接';
    renderErrorBanner('请输入知乎收藏夹链接');
    if (zhihuFavoritesUrl && typeof zhihuFavoritesUrl.focus === 'function') {
      zhihuFavoritesUrl.focus();
    }
    return;
  }

  setBusy(true, '正在同步知乎收藏夹...');
  renderText('正在检查 AI API 联通性...');
  resetProgressList();
  beginTaskLog('zhihu-favorites');
  clearErrorBanner();

  try {
    const limitValue = String(zhihuFavoritesLimit?.value || '').trim();
    const uiConfig = readConfigFromForm();
    appendTaskLog(`开始同步知乎收藏夹：${collectionUrl}`);
    const aiCheck = await ensureAiApiReadyForTask({
      uiConfig,
      scope: 'zhihu-favorites',
      taskLabel: '知乎收藏夹同步',
      preserveLog: true
    });
    if (!aiCheck.ok) {
      return;
    }
    renderText('任务已提交，等待返回...');
    const payload = await requestJson('/api/save-zhihu-favorites', {
      body: {
        collectionUrl,
        title: String(zhihuFavoritesTitle?.value || '').trim(),
        ...(limitValue ? { limit: readZhihuFavoritesLimit() } : {}),
        uiConfig
      }
    });
    statusText.textContent = '知乎收藏夹同步完成';
    appendTaskLog('知乎收藏夹同步完成', { level: 'success' });
    renderReport(payload, {
      taskType: 'zhihu-favorites-export',
      historyTitle: payload?.report?.collectionTitle
        ? `知乎收藏夹 · ${payload.report.collectionTitle}`
        : '知乎收藏夹同步'
    });
  } catch (error) {
    statusText.textContent = '知乎收藏夹同步失败';
    renderText(error.message);
    appendTaskLog(`知乎收藏夹同步失败：${error.message || '请求失败'}`, { level: 'failed' });
    renderErrorBanner(error.message || '请求失败');
  } finally {
    setBusy(false, statusText.textContent);
  }
}

async function openVideoNotesFolder() {
  setBusy(true, '正在打开视频图文笔记目录...');
  clearErrorBanner();
  setVideoNotesStatus('正在打开 prj/Notes_Video_Collection 目录...');

  try {
    const payload = await requestJson('/api/video-notes/open-folder', {
      body: {}
    });
    statusText.textContent = `已打开视频图文笔记目录：${payload.folderPath || ''}`;
    setVideoNotesStatus(`已打开目录：${payload.folderPath || ''}`);
    renderUtilityResult('视频图文笔记目录', [
      { label: '目录', value: payload.folderPath || '' }
    ], payload);
  } catch (error) {
    statusText.textContent = '打开视频图文笔记目录失败';
    setVideoNotesStatus(error.message || '打开目录失败，请查看结果区提示。');
    renderText(error.message);
    renderErrorBanner(error.message || '请求失败');
  } finally {
    setBusy(false, statusText.textContent);
  }
}

async function startVideoNotesWeb() {
  setBusy(true, '正在启动视频图文笔记 Web...');
  clearErrorBanner();
  setVideoNotesStatus('正在启动 start_web_ui.bat，并等待独立 Web 就绪，请稍候...');

  try {
    const payload = await requestJson('/api/video-notes/start-web', {
      body: {}
    });
    statusText.textContent = `视频图文笔记 Web 已就绪：${payload.url || ''}`;
    setVideoNotesStatus(`独立 Web 已就绪：${payload.url || ''}`);
    renderUtilityResult('视频图文笔记 Web', [
      { label: '目录', value: payload.folderPath || '' },
      { label: '启动脚本', value: payload.scriptPath || '' },
      { label: '访问地址', value: payload.url || '' }
    ], payload);
  } catch (error) {
    statusText.textContent = '启动视频图文笔记 Web 失败';
    setVideoNotesStatus(error.message || '启动失败，请查看结果区提示。');
    renderText(error.message);
    renderErrorBanner(error.message || '请求失败');
  } finally {
    setBusy(false, statusText.textContent);
  }
}

async function openLoginBrowser() {
  setBusy(true, '正在打开项目登录浏览器...');
  clearErrorBanner();

  try {
    const payload = await requestJson('/api/browser/login', {
      body: {
        uiConfig: readConfigFromForm()
      }
    });
    renderText(JSON.stringify(payload, null, 2));
    statusText.textContent = `已打开项目登录浏览器：${payload.profileDir || payload.userDataDir || ''}`;
    return payload;
  } catch (error) {
    statusText.textContent = '打开项目登录浏览器失败';
    renderErrorBanner(error.message || '请求失败');
    return null;
  } finally {
    setBusy(false, statusText.textContent);
  }
}

async function runInboxSync(mode = 'window') {
  setBusy(true, '正在同步收件箱...');
  renderText('任务已提交，等待同步进度...');
  resetProgressList();
  beginTaskLog('inbox');
  clearErrorBanner();
  let lastNonTerminalStreamEvent = null;
  let streamErrorLogged = false;

  try {
    const requestedTimeWindow = mode === 'window'
      ? read_inbox_sync_time_window()
      : null;
    const modeLabel = mode === 'window'
      ? describe_inbox_sync_time_window(requestedTimeWindow)
      : build_inbox_sync_mode_label({ mode });
    appendTaskLog(`开始同步收件箱：${modeLabel || '默认范围'}`);
    const payload = await requestNdjson('/api/inbox/sync-stream', {
      uiConfig: readConfigFromForm(),
      mode,
      ...(requestedTimeWindow ? { timeWindow: requestedTimeWindow } : {})
    }, {
      onEvent: (message) => {
        if (message.type !== 'done' && message.type !== 'error') {
          lastNonTerminalStreamEvent = message;
        }
        if (message.type === 'start') {
          const startedLabel = build_inbox_sync_mode_label({
            ...message,
            windowLabel: message.windowLabel || describe_inbox_sync_time_window(message.timeWindow)
          });
          statusText.textContent = `开始同步收件箱：${startedLabel || '默认范围'}`;
          appendTaskLog(`已连接同步源：${startedLabel || '默认范围'}`);
        }
        if (message.type === 'page') {
          const page = Number(message.page || 0);
          const pushesCount = Number(message.pushesCount || 0);
          const accumulatedItems = Number(message.accumulatedItems || 0);
          statusText.textContent = `正在同步收件箱：第 ${page || '?'} 页，累计候选 ${accumulatedItems} 条`;
          appendTaskLog(
            `已拉取第 ${page || '?'} 页：本页 ${pushesCount} 条，累计候选 ${accumulatedItems} 条${message.nextCursor ? '，继续下一页' : ''}`
          );
        }
        if (message.type === 'store') {
          const added = Number(message.added || 0);
          const skipped = Number(message.skipped || 0);
          const total = Number(message.total || 0);
          statusText.textContent = `正在写入收件箱：新增 ${added} 条，跳过 ${skipped} 条`;
          appendTaskLog(`收件箱写入完成：新增 ${added} 条，跳过 ${skipped} 条，共 ${total} 条`);
        }
        if (message.type === 'warning') {
          appendTaskLog(`同步提示：${message.warning || '未知提示'}`, { level: 'warning' });
        }
        if (message.type === 'done') {
          const report = message.report || {};
          appendTaskLog(
            `同步完成：新增 ${Number(report.added || 0)} 条，跳过 ${Number(report.skipped || 0)} 条，共 ${Number(report.total || 0)} 条`,
            { level: Number(report.total || 0) > 0 ? 'success' : 'info' }
          );
        }
        if (message.type === 'error') {
          const latestPosition = describeInboxSyncStreamPosition(lastNonTerminalStreamEvent);
          appendTaskLog(
            `后台返回错误：${message.error || '请求失败'}${latestPosition ? `。最近处理到${latestPosition}` : ''}`,
            { level: 'failed' }
          );
          streamErrorLogged = true;
        }
      }
    });
    const historyReport = payload?.report || {
      mode,
      ...(requestedTimeWindow
        ? {
          timeWindow: requestedTimeWindow,
          windowLabel: describe_inbox_sync_time_window(requestedTimeWindow)
        }
        : {})
    };
    lastInboxSyncReport = historyReport;
    lastInboxSyncUrls = Array.isArray(historyReport.urls) ? historyReport.urls : [];
    statusText.textContent = '收件箱同步完成';
    renderReport({ report: historyReport }, {
      taskType: 'inbox-sync',
      historyTitle: build_inbox_sync_history_title(historyReport)
    });
  } catch (error) {
    lastInboxSyncReport = null;
    lastInboxSyncUrls = [];
    statusText.textContent = '收件箱同步失败';
    renderText(error.message);
    if (!streamErrorLogged) {
      const latestPosition = describeInboxSyncStreamPosition(lastNonTerminalStreamEvent);
      appendTaskLog(
        `收件箱同步失败：${error.message || '请求失败'}${latestPosition ? `。最近处理到${latestPosition}` : ''}`,
        { level: 'failed' }
      );
    }
    renderErrorBanner(error.message || '请求失败');
  } finally {
    setBusy(false, statusText.textContent);
  }
}

async function runInboxSave() {
  setBusy(true, '正在解析保存收件箱...');
  renderText('正在检查 AI API 联通性...');
  resetProgressList();
  beginTaskLog('inbox', { preserve: true });
  clearErrorBanner();
  appendTaskLog('开始收件箱解析保存');
  let lastNonTerminalStreamEvent = null;
  let streamErrorLogged = false;

  try {
    const uiConfig = readConfigFromForm();
    const aiCheck = await ensureAiApiReadyForTask({
      uiConfig,
      scope: 'inbox',
      taskLabel: '收件箱解析保存',
      preserveLog: true
    });
    if (!aiCheck.ok) {
      return;
    }
    renderText('任务已提交，等待返回...');
    const payload = await requestNdjson('/api/inbox/save-stream', {
      uiConfig,
      ...(lastInboxSyncReport ? { syncReport: lastInboxSyncReport } : {}),
      ...(lastInboxSyncUrls.length > 0 ? { urls: lastInboxSyncUrls } : {})
    }, {
      onEvent: (message) => {
        if (message.type !== 'done' && message.type !== 'error') {
          lastNonTerminalStreamEvent = message;
        }
        if (message.type === 'start') {
          renderProgressList(message.targets || []);
          statusText.textContent = `准备解析保存 ${message.total || 0} 条收件箱链接`;
          appendTaskLog(`准备解析保存 ${Number(message.total || 0)} 条收件箱链接`);
        }
        if (message.type === 'tick') {
          updateProgressItem(message.index, 'running');
          statusText.textContent = `正在解析第 ${Number(message.index) + 1}/${message.total || 0} 条`;
          appendTaskLog(`开始${describeInboxStreamPosition(message)}`);
        }
        if (message.type === 'progress') {
          const result = message.result || {};
          const status = result.status === 'failed' ? 'failed' : 'success';
          const label = formatResultLabel(result);
          updateProgressItem(message.index, status, {
            label: label || undefined,
            error: result.error || ''
          });
          const position = describeInboxStreamPosition({
            index: message.index,
            total: message.total,
            result
          });
          if (status === 'failed') {
            appendTaskLog(
              `${position || '当前条目'}解析失败：${result.error || '未知错误'}`,
              { level: 'failed' }
            );
          } else {
            appendTaskLog(`${position || '当前条目'}解析成功`, { level: 'success' });
          }
        }
        if (message.type === 'done') {
          const report = message.report || {};
          appendTaskLog(
            `解析完成：成功 ${Number(report.successCount || 0)} 条，失败 ${Number(report.failureCount || 0)} 条`,
            { level: Number(report.failureCount || 0) > 0 ? 'warning' : 'success' }
          );
        }
        if (message.type === 'error') {
          const latestPosition = describeInboxStreamPosition(lastNonTerminalStreamEvent);
          if (lastNonTerminalStreamEvent && lastNonTerminalStreamEvent.type === 'tick') {
            updateProgressItem(lastNonTerminalStreamEvent.index, 'failed', {
              error: message.error || '请求失败'
            });
          }
          appendTaskLog(
            `后台返回错误：${message.error || '请求失败'}${latestPosition ? `。最近处理到${latestPosition}` : ''}`,
            { level: 'failed' }
          );
          streamErrorLogged = true;
        }
      }
    });
    statusText.textContent = '收件箱解析保存完成';
    renderReport(payload, {
      taskType: 'inbox-save',
      historyTitle: '收件箱解析保存'
    });
  } catch (error) {
    statusText.textContent = '收件箱解析保存失败';
    renderText(error.message);
    if (!streamErrorLogged) {
      const latestPosition = describeInboxStreamPosition(lastNonTerminalStreamEvent);
      if (lastNonTerminalStreamEvent && lastNonTerminalStreamEvent.type === 'tick') {
        updateProgressItem(lastNonTerminalStreamEvent.index, 'failed', {
          error: error.message || '请求失败'
        });
      }
      appendTaskLog(
        `后台中断：${error.message || '请求失败'}${latestPosition ? `。最近处理到${latestPosition}` : ''}`,
        { level: 'failed' }
      );
    }
    renderErrorBanner(error.message || '请求失败');
  } finally {
    setBusy(false, statusText.textContent);
  }
}

if (inboxSyncCustomValue) {
  inboxSyncCustomValue.addEventListener('focus', () => select_inbox_sync_window('custom'));
  inboxSyncCustomValue.addEventListener('input', () => select_inbox_sync_window('custom'));
}
if (inboxSyncCustomUnit) {
  inboxSyncCustomUnit.addEventListener('change', () => select_inbox_sync_window('custom'));
}
if (inboxSyncButton) {
  inboxSyncButton.addEventListener('click', () => runInboxSync('window'));
}
if (inboxSyncAllTopButton) {
  inboxSyncAllTopButton.addEventListener('click', () => runInboxSync('all'));
}
if (inboxSyncLatestButton) {
  inboxSyncLatestButton.addEventListener('click', () => runInboxSync('window'));
}
if (inboxSyncAllButton) {
  inboxSyncAllButton.addEventListener('click', () => runInboxSync('all'));
}
if (inboxSaveButton) {
  inboxSaveButton.addEventListener('click', () => runInboxSave());
}
if (openOutputFolderButton) {
  openOutputFolderButton.addEventListener('click', async () => {
    if (!lastReport) return;
    openOutputFolderButton.disabled = true;
    clearErrorBanner();
    const uiConfig = readConfigFromForm();
    try {
      const payload = await requestJson('/api/open-output', {
        body: {
          report: lastReport,
          uiConfig
        }
      });
      statusText.textContent = `已打开输出目录：${payload.folderPath || 'output'}`;
    } catch (error) {
      const suggestedFolder = deriveSuggestedOutputFolder(lastReport, uiConfig);
      if (suggestedFolder) {
        try {
          await copyTextToClipboard(suggestedFolder);
          statusText.textContent = `打开输出文件夹失败，已复制输出路径：${suggestedFolder}`;
        } catch (_) {
          statusText.textContent = `打开输出文件夹失败：${suggestedFolder}`;
        }
        renderErrorBanner(`${error.message || '请求失败'}。可手动打开：${suggestedFolder}`);
      } else {
        statusText.textContent = '打开输出文件夹失败';
        renderErrorBanner(error.message || '请求失败');
      }
    } finally {
      syncOpenOutputButtonState(false);
    }
  });
}
if (videoNotesOpenFolderButton) {
  videoNotesOpenFolderButton.addEventListener('click', async () => {
    await openVideoNotesFolder();
  });
}
if (videoNotesStartWebButton) {
  videoNotesStartWebButton.addEventListener('click', async () => {
    await startVideoNotesWeb();
  });
}
if (openLoginBrowserButton) {
  openLoginBrowserButton.addEventListener('click', async () => {
    await openLoginBrowser();
  });
}
if (refreshBrowserStatusButton) {
  refreshBrowserStatusButton.addEventListener('click', async () => {
    await refreshBrowserStatus();
  });
}
if (zhihuFavoritesSubmit) {
  zhihuFavoritesSubmit.addEventListener('click', async () => {
    await runZhihuFavoritesSync();
  });
}
if (retryFailedResultsButton) {
  retryFailedResultsButton.addEventListener('click', async () => {
    const retryState = readRetryButtonState();
    if (!retryState.enabled || retryState.inputs.length === 0) return;
    activeResultFilter = 'all';
    activeWarningCodeFilter = '';
    activeFailureStageFilter = '';
    fillLinksInput(
      retryState.inputs,
      retryState.scope === 'visible' ? '当前筛选结果' : '当前异常结果'
    );
    await runSaveLinks(retryState.inputs.join('\n'));
  });
}

loadUiConfig().catch((error) => {
  setConfigStatus(error.message || '配置加载失败', 'error');
});
