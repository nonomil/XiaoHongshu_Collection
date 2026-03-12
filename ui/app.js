const linksForm = document.getElementById('links-form');
const linksText = document.getElementById('links-text');
const linksSubmit = document.getElementById('links-submit');
const linksClear = document.getElementById('links-clear');
const collectionSubmit = document.getElementById('collection-submit');
const statusText = document.getElementById('status-text');
const resultOutput = document.getElementById('result-output');
const resultSummary = document.getElementById('result-summary');
const resultMeta = document.getElementById('result-meta');
const rawReport = document.getElementById('raw-report');

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
const uiShowRaw = document.getElementById('ui-show-raw');

let currentConfig = null;

function setBusy(isBusy, message) {
  linksSubmit.disabled = isBusy;
  collectionSubmit.disabled = isBusy;
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

function readNumber(input, fallback) {
  const raw = String(input.value || '').trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function readConfigFromForm() {
  const fallback = currentConfig || {};
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
  uiShowRaw.checked = cfg.ui?.showRawReport !== false;
  updateRawReportVisibility(cfg);
}

function renderMeta(config) {
  resultMeta.innerHTML = '';
  const items = [];
  if (config?.paths?.saveLinksOutputRoot) items.push(`链接输出：${config.paths.saveLinksOutputRoot}`);
  if (config?.paths?.collectionOutputRoot) items.push(`收藏输出：${config.paths.collectionOutputRoot}`);
  if (items.length === 0) return;
  items.forEach((text) => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = text;
    resultMeta.appendChild(chip);
  });
}

function renderSummary(report) {
  resultSummary.innerHTML = '';
  if (!report) return;

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

async function loadUiConfig() {
  setConfigStatus('正在加载配置...', 'muted');
  const payload = await requestJson('/api/ui-config', { method: 'GET' });
  currentConfig = payload.config || {};
  applyConfigToForm(currentConfig);
  renderMeta(currentConfig);
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
    renderMeta(currentConfig);
    setConfigStatus('配置已保存', 'ok');
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

linksClear.addEventListener('click', () => {
  linksText.value = '';
});

linksForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setBusy(true, '正在顺序保存链接...');
  renderText('任务已提交，等待返回...');

  try {
    const payload = await requestJson('/api/save-links', {
      body: {
        text: linksText.value,
        uiConfig: readConfigFromForm()
      }
    });
    statusText.textContent = '链接保存完成';
    renderReport(payload);
  } catch (error) {
    statusText.textContent = '链接保存失败';
    renderText(error.message);
  } finally {
    setBusy(false, statusText.textContent);
  }
});

collectionSubmit.addEventListener('click', async () => {
  setBusy(true, '正在执行收藏导出...');
  renderText('任务已提交，等待返回...');

  try {
    const payload = await requestJson('/api/save-collection', {
      body: { uiConfig: readConfigFromForm() }
    });
    statusText.textContent = '收藏导出完成';
    renderReport(payload);
  } catch (error) {
    statusText.textContent = '收藏导出失败';
    renderText(error.message);
  } finally {
    setBusy(false, statusText.textContent);
  }
});

loadUiConfig().catch((error) => {
  setConfigStatus(error.message || '配置加载失败', 'error');
});
