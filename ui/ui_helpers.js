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

  const browser = config.browser || {};
  if (browser.mode) {
    const modeLabel = browser.mode === 'current-browser' ? '当前浏览器' : '隔离浏览器';
    const suffix = browser.browserUrl ? ' / 显式地址' : '';
    items.push({ label: '浏览器', value: `${modeLabel}${suffix}` });
  }

  const runtime = config.runtime || {};
  const autoClassifyOn = runtime.autoClassifyLinksEnabled !== false;
  items.push({
    label: '分类',
    value: autoClassifyOn ? '自动归类' : '保留来源'
  });

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

  if (/登录|未登录|账号|cookie|session|auth|login|sign in/.test(message)) {
    hints.push('请在 Chrome 调试窗口重新登录后重试');
  }
  if (/暂时无法浏览|300031|无法打开笔记详情页/.test(message)) {
    hints.push('这条笔记当前网页端可能不可见，可改在 App 内确认或稍后重试');
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

function describeWarning(warning = {}) {
  const code = String(warning.code || '').trim();
  const message = String(warning.message || '').trim();

  if (code === 'comment_login_required') {
    return '评论剩余内容需登录后查看';
  }
  if (code === 'comment_incomplete') {
    return '评论未完整加载';
  }
  if (code === 'comment_warning') {
    return '评论采集有提示';
  }
  return message || '存在采集提示';
}

function describePlatform(result = {}) {
  const sourceType = String(result.sourceType || '').trim();
  const platform = String(result.platform || '').trim();

  if (sourceType === 'wechat_article' || platform === 'wechat') return '微信公众号';
  if (sourceType === 'zhihu_article' || sourceType === 'zhihu_answer' || platform === 'zhihu') return '知乎';
  if (sourceType === 'csdn_article' || platform === 'csdn') return 'CSDN';
  if (sourceType === 'xiaohongshu' || platform === 'xiaohongshu') return '小红书';
  return '';
}

function describeResultStatus(result = {}) {
  const status = String(result.status || '').trim();
  const error = String(result.error || '').trim();

  if (status !== 'failed') {
    return status === 'success' ? '成功' : (status || '');
  }
  if (/300031|暂时无法浏览|无法打开笔记详情页/i.test(error)) {
    return '网页端不可见，300031';
  }
  if (/账号异常|重新登录|login required|sign in/i.test(error)) {
    return '账号异常或需重新登录';
  }
  if (/Current tab is not a Xiaohongshu note detail page/i.test(error)) {
    return '当前标签不是笔记详情页';
  }
  if (/No xiaohongshu tab found/i.test(error)) {
    return '未找到小红书标签页';
  }
  return error || '失败';
}

function describeSavedCollection(result = {}) {
  const explicit = String(result.collection || result.finalCollection || '').trim();
  if (explicit) return explicit;

  const filepath = String(result.filepath || '').trim();
  if (!filepath) return '';

  const parts = filepath.split(/[/\\]+/).filter(Boolean);
  if (parts.length < 2) return '';
  return parts[parts.length - 2] || '';
}

if (typeof module !== 'undefined') {
  module.exports = {
    buildSummaryItems,
    openSettingsModal,
    closeSettingsModal,
    buildErrorDisplay,
    describePlatform,
    describeSavedCollection,
    describeWarning,
    describeResultStatus
  };
}

if (typeof window !== 'undefined') {
  window.XhsUiHelpers = {
    buildSummaryItems,
    openSettingsModal,
    closeSettingsModal,
    buildErrorDisplay,
    describePlatform,
    describeSavedCollection,
    describeWarning,
    describeResultStatus
  };
}
