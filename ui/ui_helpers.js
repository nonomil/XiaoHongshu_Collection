function buildSummaryItems(config = {}) {
  const items = [];
  const paths = config.paths || {};
  if (paths.saveLinksOutputRoot) {
    items.push({ label: '输出路径', value: paths.saveLinksOutputRoot });
  }

  const naming = config.naming || {};
  if (naming.conflictStrategy) {
    const label = naming.conflictStrategy === 'content-aware' ? '智能覆盖' : '直接覆盖';
    items.push({ label: '冲突策略', value: label });
  }

  const runtime = config.runtime || {};
  const aiOn = runtime.aiSummaryEnabled !== false;
  const visionOn = runtime.visionOcrEnabled !== false;
  const ocrOn = runtime.ocrFallbackEnabled !== false;
  items.push({
    label: 'AI/OCR',
    value: `${aiOn ? 'AI开' : 'AI关'} / ${visionOn ? 'Vision开' : 'Vision关'} / ${ocrOn ? 'OCR开' : 'OCR关'}`
  });

  if (runtime.maxImagesPerNote) {
    items.push({ label: 'OCR上限', value: String(runtime.maxImagesPerNote) });
  }

  return items;
}

function openSettingsModal({ overlay, modal } = {}) {
  if (overlay) overlay.hidden = false;
  if (modal) modal.hidden = false;
}

function closeSettingsModal({ overlay, modal } = {}) {
  if (overlay) overlay.hidden = true;
  if (modal) modal.hidden = true;
}

function buildErrorDisplay(errorMessage = '') {
  const message = String(errorMessage || '').trim();
  const normalized = message.toLowerCase();
  const hints = [];

  if (/登录|未登录|账号|账户|cookie|session|auth/.test(message)) {
    hints.push('请在 Chrome 调试窗口重新登录后重试');
  }
  if (/频率|过快|限流|timeout|超时|too many|rate/.test(message) || /timeout/.test(normalized)) {
    hints.push('降低采集频率，稍后重试');
  }
  if (/账号异常|异常/.test(message)) {
    hints.push('账号异常可尝试切换账号或等待恢复');
  }
  if (hints.length === 0) {
    hints.push('查看日志或稍后重试');
  }

  return {
    title: '失败',
    message: message || '未知错误，请查看日志或稍后重试。',
    hints
  };
}

if (typeof module !== 'undefined') {
  module.exports = { buildSummaryItems, openSettingsModal, closeSettingsModal, buildErrorDisplay };
}

if (typeof window !== 'undefined') {
  window.XhsUiHelpers = { buildSummaryItems, openSettingsModal, closeSettingsModal, buildErrorDisplay };
}
