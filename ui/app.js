const linksForm = document.getElementById('links-form');
const linksText = document.getElementById('links-text');
const linksSubmit = document.getElementById('links-submit');
const linksClear = document.getElementById('links-clear');
const collectionSubmit = document.getElementById('collection-submit');
const inboxSyncButton = document.getElementById('inbox-sync');
const inboxSyncLatestButton = document.getElementById('inbox-sync-latest');
const inboxSyncAllButton = document.getElementById('inbox-sync-all');
const statusText = document.getElementById('status-text');
const resultOutput = document.getElementById('result-output');
const resultSummary = document.getElementById('result-summary');
const rawReport = document.getElementById('raw-report');
const progressList = document.getElementById('progress-list');
const summaryRow = document.getElementById('summary-row');
const errorBanner = document.getElementById('error-banner');
const errorTitle = document.getElementById('error-title');
const errorMessage = document.getElementById('error-message');
const errorHints = document.getElementById('error-hints');
const errorDismiss = document.getElementById('error-dismiss');

const openSettingsButton = document.getElementById('open-settings');
const closeSettingsButton = document.getElementById('close-settings');
const settingsOverlay = document.getElementById('settings-overlay');
const settingsModal = document.getElementById('settings-modal');

const configForm = document.getElementById('config-form');
const configStatus = document.getElementById('config-status');
const configReload = document.getElementById('config-reload');
const configSave = document.getElementById('config-save');

const pathLinksOutput = document.getElementById('path-links-output');
const pathLinksImages = document.getElementById('path-links-images');
const pathCollectionOutput = document.getElementById('path-collection-output');
const pathCollectionRaw = document.getElementById('path-collection-raw');
const namingStrategy = document.getElementById('naming-strategy');
const namingMaxLength = document.getElementById('naming-max-length');
const runtimeAi = document.getElementById('runtime-ai');
const runtimeVision = document.getElementById('runtime-vision');
const runtimeOcrFallback = document.getElementById('runtime-ocr-fallback');
const runtimeOpenrouterTimeout = document.getElementById('runtime-openrouter-timeout');
const runtimeVisionTimeout = document.getElementById('runtime-vision-timeout');
const runtimeMaxImages = document.getElementById('runtime-max-images');
const pushbulletEnabled = document.getElementById('pushbullet-enabled');
const pushbulletToken = document.getElementById('pushbullet-token');
const inboxPath = document.getElementById('inbox-path');
const uiShowRaw = document.getElementById('ui-show-raw');

let currentConfig = null;
let progressItems = new Map();

function setBusy(isBusy, message) {
  linksSubmit.disabled = isBusy;
  collectionSubmit.disabled = isBusy;
  inboxSyncButton.disabled = isBusy;
  configSave.disabled = isBusy;
  configReload.disabled = isBusy;
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

function openSettings() {
  if (helpers.openSettingsModal) {
    helpers.openSettingsModal({ overlay: settingsOverlay, modal: settingsModal });
    return;
  }
  settingsOverlay.hidden = false;
  settingsModal.hidden = false;
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
  const raw = String(input.value || '').trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
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
  const accessToken = tokenInput || fallback.pushbullet?.accessToken || '';
  const inboxValue = String(inboxPath.value || '').trim();
  return {
    paths: {
      saveLinksOutputRoot: String(pathLinksOutput.value || '').trim(),
      saveLinksImagesRoot: String(pathLinksImages.value || '').trim(),
      collectionOutputRoot: String(pathCollectionOutput.value || '').trim(),
      collectionRawPath: String(pathCollectionRaw.value || '').trim()
    },
    naming: {
      conflictStrategy: namingStrategy.value || 'content-aware',
      maxTitleLength: readNumber(namingMaxLength, fallback.naming?.maxTitleLength || 80)
    },
    runtime: {
      aiSummaryEnabled: runtimeAi.checked,
      visionOcrEnabled: runtimeVision.checked,
      ocrFallbackEnabled: runtimeOcrFallback.checked,
      openRouterTimeoutMs: readNumber(runtimeOpenrouterTimeout, fallback.runtime?.openRouterTimeoutMs || 30000),
      visionOcrTimeoutMs: readNumber(runtimeVisionTimeout, fallback.runtime?.visionOcrTimeoutMs || 60000),
      maxImagesPerNote: readNumber(runtimeMaxImages, fallback.runtime?.maxImagesPerNote || 12)
    },
    pushbullet: {
      enabled: pushbulletEnabled.checked,
      accessToken,
      lastModified: Number(fallback.pushbullet?.lastModified || 0)
    },
    inbox: {
      path: inboxValue || fallback.inbox?.path || ''
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
  namingStrategy.value = cfg.naming?.conflictStrategy || 'content-aware';
  namingMaxLength.value = cfg.naming?.maxTitleLength ?? '';
  runtimeAi.checked = cfg.runtime?.aiSummaryEnabled !== false;
  runtimeVision.checked = cfg.runtime?.visionOcrEnabled !== false;
  runtimeOcrFallback.checked = cfg.runtime?.ocrFallbackEnabled !== false;
  runtimeOpenrouterTimeout.value = cfg.runtime?.openRouterTimeoutMs ?? '';
  runtimeVisionTimeout.value = cfg.runtime?.visionOcrTimeoutMs ?? '';
  runtimeMaxImages.value = cfg.runtime?.maxImagesPerNote ?? '';
  pushbulletEnabled.checked = cfg.pushbullet?.enabled === true;
  pushbulletToken.value = '';
  pushbulletToken.placeholder = cfg.pushbullet?.accessToken
    ? `已保存：${maskToken(cfg.pushbullet.accessToken)}`
    : '在 Pushbullet 账号设置中获取';
  inboxPath.value = cfg.inbox?.path || '';
  uiShowRaw.checked = cfg.ui?.showRawReport !== false;
  updateRawReportVisibility(cfg);
}

function renderSummary(report) {
  resultSummary.innerHTML = '';
  if (!report) return;

  if (typeof report.added === 'number') {
    const summary = document.createElement('div');
    summary.className = 'summary-block';
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
    const list = document.createElement('div');
    list.className = 'result-list';
    report.results.forEach((item) => {
      const row = document.createElement('div');
      row.className = `result-row ${item.status || 'unknown'}`;
      const title = document.createElement('div');
      title.className = 'result-title';
      title.textContent = item.filepath || item.canonicalUrl || item.navigationUrl || item.noteId || item.input || '未命名';
      const meta = document.createElement('div');
      meta.className = 'result-meta-text';
      meta.textContent = item.status === 'failed' ? (item.error || '失败') : '成功';
      row.appendChild(title);
      row.appendChild(meta);
      list.appendChild(row);
    });
    resultSummary.appendChild(list);
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
  renderSummary(report);
  renderText(JSON.stringify(report, null, 2));
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
});
if (errorDismiss) {
  errorDismiss.addEventListener('click', () => clearErrorBanner());
}

linksClear.addEventListener('click', () => {
  linksText.value = '';
});

linksForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setBusy(true, '正在顺序保存链接...');
  renderText('任务已提交，等待返回...');
  resetProgressList();
  clearErrorBanner();

  try {
    const uiConfig = readConfigFromForm();
    const payload = await requestNdjson('/api/save-links-stream', {
      text: linksText.value,
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

async function runInboxSync(mode = 'latest') {
  setBusy(true, '正在同步收件箱...');
  renderText('任务已提交，等待返回...');
  resetProgressList();

  try {
    const payload = await requestJson('/api/inbox/sync', {
      body: { uiConfig: readConfigFromForm(), mode }
    });
    statusText.textContent = '收件箱同步完成';
    renderReport(payload);
  } catch (error) {
    statusText.textContent = '收件箱同步失败';
    renderText(error.message);
  } finally {
    setBusy(false, statusText.textContent);
  }
}

inboxSyncButton.addEventListener('click', () => runInboxSync('latest'));
if (inboxSyncLatestButton) {
  inboxSyncLatestButton.addEventListener('click', () => runInboxSync('latest'));
}
if (inboxSyncAllButton) {
  inboxSyncAllButton.addEventListener('click', () => runInboxSync('all'));
}

loadUiConfig().catch((error) => {
  setConfigStatus(error.message || '配置加载失败', 'error');
});
