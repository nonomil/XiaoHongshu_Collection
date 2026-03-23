const linksForm = document.getElementById('links-form');
const linksText = document.getElementById('links-text');
const linksSubmit = document.getElementById('links-submit');
const linksClear = document.getElementById('links-clear');
const collectionSubmit = document.getElementById('collection-submit');
const inboxSyncButton = document.getElementById('inbox-sync');
const inboxSyncAllTopButton = document.getElementById('inbox-sync-all-top');
const inboxSyncLatestButton = document.getElementById('inbox-sync-latest');
const inboxSyncAllButton = document.getElementById('inbox-sync-all');
const inboxSaveButton = document.getElementById('inbox-save');
const inboxSyncRange = document.getElementById('inbox-sync-range');
const statusText = document.getElementById('status-text');
const resultOutput = document.getElementById('result-output');
const resultSummary = document.getElementById('result-summary');
const rawReport = document.getElementById('raw-report');
const progressList = document.getElementById('progress-list');
const summaryRow = document.getElementById('summary-row');
const retryFailedResultsButton = document.getElementById('retry-failed-results');
const openOutputFolderButton = document.getElementById('open-output-folder');
const errorBanner = document.getElementById('error-banner');
const errorTitle = document.getElementById('error-title');
const errorMessage = document.getElementById('error-message');
const errorHints = document.getElementById('error-hints');
const errorDismiss = document.getElementById('error-dismiss');

const openSettingsButton = document.getElementById('open-settings');
const closeSettingsButton = document.getElementById('close-settings');
const settingsOverlay = document.getElementById('settings-overlay');
const settingsModal = document.getElementById('settings-modal');
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
const runtimeOpenrouterTimeout = document.getElementById('runtime-openrouter-timeout');
const runtimeVisionTimeout = document.getElementById('runtime-vision-timeout');
const runtimeMaxImages = document.getElementById('runtime-max-images');
const pushbulletEnabled = document.getElementById('pushbullet-enabled');
const pushbulletToken = document.getElementById('pushbullet-token');
const inboxPath = document.getElementById('inbox-path');
const inboxCategories = document.getElementById('inbox-categories');
const uiShowRaw = document.getElementById('ui-show-raw');

let currentConfig = null;
let progressItems = new Map();
let lastReport = null;
let lastInboxSyncReport = null;
let lastInboxSyncUrls = [];
let activeResultFilter = 'all';
let activeSettingsTab = '';

const SETTINGS_TAB_STORAGE_KEY = 'xhs-ui-settings-tab';

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
  if (!report || !Array.isArray(report.results)) return [];
  return collectUniqueResultLinks(report.results.filter((item) => item?.status === 'failed'));
}

function syncOpenOutputButtonState(isBusy = false) {
  if (!openOutputFolderButton) return;
  openOutputFolderButton.disabled = isBusy || !lastReport;
}

function syncRetryFailedButtonState(isBusy = false) {
  if (!retryFailedResultsButton) return;
  retryFailedResultsButton.disabled = isBusy || collectRetryInputs().length === 0;
}

function setBusy(isBusy, message) {
  linksSubmit.disabled = isBusy;
  collectionSubmit.disabled = isBusy;
  if (inboxSyncButton) inboxSyncButton.disabled = isBusy;
  if (inboxSyncAllTopButton) inboxSyncAllTopButton.disabled = isBusy;
  if (inboxSyncLatestButton) inboxSyncLatestButton.disabled = isBusy;
  if (inboxSyncAllButton) inboxSyncAllButton.disabled = isBusy;
  if (inboxSaveButton) inboxSaveButton.disabled = isBusy;
  if (openLoginBrowserButton) openLoginBrowserButton.disabled = isBusy;
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

const helpers = window.XhsUiHelpers || {};

function clearErrorBanner() {
  if (errorBanner) errorBanner.hidden = true;
  if (errorTitle) errorTitle.textContent = '';
  if (errorMessage) errorMessage.textContent = '';
  if (errorHints) errorHints.innerHTML = '';
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

function resetProgressList() {
  progressItems = new Map();
  progressList.innerHTML = '';
  progressList.hidden = true;
}

function formatTargetLabel(target, index) {
  if (!target) return `第 ${index + 1} 条`;
  const url = target.navigationUrl || target.canonicalUrl || '';
  if (!url) return `第 ${index + 1} 条`;
  return url.length > 48 ? `${url.slice(0, 45)}...` : url;
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

function readInboxSyncLimit() {
  return readNumber(inboxSyncRange, 10);
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
  return {
    paths: {
      saveLinksOutputRoot: String(pathLinksOutput.value || '').trim(),
      saveLinksImagesRoot: String(pathLinksImages.value || '').trim(),
      collectionOutputRoot: String(pathCollectionOutput.value || '').trim(),
      collectionRawPath: String(pathCollectionRaw.value || '').trim()
    },
    browser: {
      mode: browserMode?.value || fallback.browser?.mode || 'isolated',
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
}

function applyConfigToForm(config) {
  const cfg = config || {};
  pathLinksOutput.value = cfg.paths?.saveLinksOutputRoot || '';
  pathLinksImages.value = cfg.paths?.saveLinksImagesRoot || '';
  pathCollectionOutput.value = cfg.paths?.collectionOutputRoot || '';
  pathCollectionRaw.value = cfg.paths?.collectionRawPath || '';
  if (browserMode) browserMode.value = cfg.browser?.mode || 'isolated';
  if (browserChannel) browserChannel.value = cfg.browser?.channel || 'stable';
  if (browserUrl) browserUrl.value = cfg.browser?.browserUrl || '';
  if (browserHeadless) browserHeadless.checked = cfg.browser?.headless === true;
  namingStrategy.value = cfg.naming?.conflictStrategy || 'content-aware';
  namingMaxLength.value = cfg.naming?.maxTitleLength ?? '';
  if (runtimeAutoClassify) runtimeAutoClassify.checked = cfg.runtime?.autoClassifyLinksEnabled !== false;
  runtimeAi.checked = cfg.runtime?.aiSummaryEnabled !== false;
  runtimeVision.checked = cfg.runtime?.visionOcrEnabled !== false;
  runtimeOcrFallback.checked = cfg.runtime?.ocrFallbackEnabled !== false;
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

function buildResultRow(item) {
  const row = document.createElement('div');
  row.className = `result-row ${item.status || 'unknown'}`;
  const title = document.createElement('div');
  title.className = 'result-title';
  title.textContent = formatResultLabel(item) || item.filepath || item.canonicalUrl || item.navigationUrl || item.noteId || item.input || '未命名';
  const meta = document.createElement('div');
  meta.className = 'result-meta-text';

  if (item.status === 'failed') {
    meta.textContent = helpers.describeResultStatus
      ? helpers.describeResultStatus(item)
      : (item.error || '失败');
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
        .filter(Boolean)
    ].filter(Boolean);
    if (titleParts.length > 0) {
      row.title = titleParts.join('\n');
    }
  }

  row.appendChild(title);
  row.appendChild(meta);
  return row;
}

function renderResultFilters(groups = []) {
  const filterRow = document.createElement('div');
  filterRow.className = 'result-filter-row';
  const warningCount = groups.reduce((total, group) => total + (group.warningCount || 0), 0);

  const options = [
    {
      key: 'all',
      label: '全部',
      count: groups.reduce((total, group) => total + group.items.length, 0)
    },
    ...(warningCount > 0 ? [{
      key: 'warnings',
      label: '有提示',
      count: warningCount
    }] : []),
    ...groups.map((group) => ({
      key: group.key,
      label: group.label,
      count: group.items.length
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
  if (groups.length > 1 || hasWarnings) {
    renderResultFilters(groups);
  }

  groups.forEach((group, groupIndex) => {
    const visibleItems = activeResultFilter === 'warnings'
      ? group.items.filter(hasResultWarnings)
      : group.items;
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
  resultSummary.innerHTML = '';
  if (!report) return;

  if (typeof report.added === 'number') {
    const summary = document.createElement('div');
    summary.className = 'summary-block';
    const modeLabel = report.mode === 'all'
      ? '全部'
      : report.mode === 'recent'
        ? `最近 ${report.limit || '?'} 条`
        : '最新';
    const cursorLabel = report.mode !== 'recent'
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
}

function renderReport(payload) {
  const report = payload?.report || payload;
  lastReport = report || null;
  renderSummary(report);
  renderText(JSON.stringify(report, null, 2));
  syncRetryFailedButtonState(false);
  syncOpenOutputButtonState(false);
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
  setConfigStatus('配置已加载', 'ok');
}

configForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setConfigStatus('正在保存配置...', 'muted');
  try {
    const config = readConfigFromForm();
    const payload = await requestJson('/api/ui-config', { body: { config } });
    currentConfig = payload.config || config;
    applyConfigToForm(currentConfig);
    renderSummaryRow(currentConfig);
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

openSettingsButton.addEventListener('click', () => openSettings());
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

initializeSettingsTabs();

linksClear.addEventListener('click', () => {
  linksText.value = '';
});

async function runSaveLinks(textOverride = null) {
  const requestText = typeof textOverride === 'string' ? textOverride : linksText.value;
  if (typeof textOverride === 'string') {
    linksText.value = textOverride;
  }
  setBusy(true, '正在顺序保存链接...');
  renderText('任务已提交，等待返回...');
  resetProgressList();
  clearErrorBanner();

  try {
    const uiConfig = readConfigFromForm();
    const payload = await requestNdjson('/api/save-links-stream', {
      text: requestText,
      uiConfig
    }, {
      onEvent: (message) => {
        if (message.type === 'start') {
          renderProgressList(message.targets || []);
          statusText.textContent = `准备处理 ${message.total || 0} 条`;
        }
        if (message.type === 'tick') {
          updateProgressItem(message.index, 'running');
          statusText.textContent = `正在处理第 ${Number(message.index) + 1}/${message.total || 0} 条`;
        }
        if (message.type === 'progress') {
          const result = message.result || {};
          const status = result.status === 'failed' ? 'failed' : 'success';
          const label = formatResultLabel(result);
          updateProgressItem(message.index, status, {
            label: label || undefined,
            error: result.error || ''
          });
        }
      }
    });
    statusText.textContent = '链接保存完成';
    renderReport(payload);
  } catch (error) {
    statusText.textContent = '链接保存失败';
    renderText(error.message);
    renderErrorBanner(error.message || '请求失败');
  } finally {
    setBusy(false, statusText.textContent);
  }
}

linksForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  await runSaveLinks();
});

collectionSubmit.addEventListener('click', async () => {
  setBusy(true, '正在执行收藏导出...');
  renderText('任务已提交，等待返回...');
  resetProgressList();
  clearErrorBanner();

  try {
    const payload = await requestJson('/api/save-collection', {
      body: { uiConfig: readConfigFromForm() }
    });
    statusText.textContent = '收藏导出完成';
    renderReport(payload);
  } catch (error) {
    statusText.textContent = '收藏导出失败';
    renderText(error.message);
    renderErrorBanner(error.message || '请求失败');
  } finally {
    setBusy(false, statusText.textContent);
  }
});

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
  } catch (error) {
    statusText.textContent = '打开项目登录浏览器失败';
    renderErrorBanner(error.message || '请求失败');
  } finally {
    setBusy(false, statusText.textContent);
  }
}

async function runInboxSync(mode = 'latest') {
  setBusy(true, '正在同步收件箱...');
  renderText('任务已提交，等待返回...');
  resetProgressList();
  clearErrorBanner();

  try {
    const payload = await requestJson('/api/inbox/sync', {
      body: {
        uiConfig: readConfigFromForm(),
        mode,
        ...(mode === 'recent' ? { limit: readInboxSyncLimit() } : {})
      }
    });
    lastInboxSyncReport = payload?.report || null;
    lastInboxSyncUrls = Array.isArray(payload?.report?.urls) ? payload.report.urls : [];
    statusText.textContent = '收件箱同步完成';
    renderReport(payload);
  } catch (error) {
    lastInboxSyncReport = null;
    lastInboxSyncUrls = [];
    statusText.textContent = '收件箱同步失败';
    renderText(error.message);
    renderErrorBanner(error.message || '请求失败');
  } finally {
    setBusy(false, statusText.textContent);
  }
}

async function runInboxSave() {
  setBusy(true, '正在解析保存收件箱...');
  renderText('任务已提交，等待返回...');
  resetProgressList();
  clearErrorBanner();

  try {
    const payload = await requestJson('/api/inbox/save', {
      body: {
        uiConfig: readConfigFromForm(),
        ...(lastInboxSyncReport ? { syncReport: lastInboxSyncReport } : {}),
        ...(lastInboxSyncUrls.length > 0 ? { urls: lastInboxSyncUrls } : {})
      }
    });
    statusText.textContent = '收件箱解析保存完成';
    renderReport(payload);
  } catch (error) {
    statusText.textContent = '收件箱解析保存失败';
    renderText(error.message);
    renderErrorBanner(error.message || '请求失败');
  } finally {
    setBusy(false, statusText.textContent);
  }
}

if (inboxSyncButton) {
  inboxSyncButton.addEventListener('click', () => runInboxSync('recent'));
}
if (inboxSyncAllTopButton) {
  inboxSyncAllTopButton.addEventListener('click', () => runInboxSync('all'));
}
if (inboxSyncLatestButton) {
  inboxSyncLatestButton.addEventListener('click', () => runInboxSync('recent'));
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
    try {
      const payload = await requestJson('/api/open-output', {
        body: {
          report: lastReport,
          uiConfig: readConfigFromForm()
        }
      });
      statusText.textContent = `已打开输出目录：${payload.folderPath || 'output'}`;
    } catch (error) {
      statusText.textContent = '打开输出文件夹失败';
      renderErrorBanner(error.message || '请求失败');
    } finally {
      syncOpenOutputButtonState(false);
    }
  });
}
if (openLoginBrowserButton) {
  openLoginBrowserButton.addEventListener('click', async () => {
    await openLoginBrowser();
  });
}
if (retryFailedResultsButton) {
  retryFailedResultsButton.addEventListener('click', async () => {
    const retryInputs = collectRetryInputs();
    if (retryInputs.length === 0) return;
    activeResultFilter = 'all';
    await runSaveLinks(retryInputs.join('\n'));
  });
}

loadUiConfig().catch((error) => {
  setConfigStatus(error.message || '配置加载失败', 'error');
});
