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

function pushUnique(items, value) {
  const text = String(value || '').trim();
  if (!text || items.includes(text)) return;
  items.push(text);
}

function readResultString(result = {}, ...keys) {
  for (const key of keys) {
    const value = String(result?.[key] || '').trim();
    if (value) return value;
  }
  return '';
}

function classifyFailure(result = {}, errorMessage = '') {
  const message = String(errorMessage || result.error || result.comment_error || result.commentError || '').trim();
  const normalized = message.toLowerCase();
  const manualActionReason = readResultString(result, 'manual_action_reason', 'manualActionReason');
  const commentWarningCode = readResultString(result, 'comment_warning_code', 'commentWarningCode');

  const isBrowserConnectionFailure = (
    /remote debugging|9222|econnrefused|devtools|调试会话|浏览器连接|未检测到可复用的 chrome|当前浏览器接管失败/i.test(message)
    || /connect.*127\.0\.0\.1|connect.*localhost/i.test(normalized)
  );
  if (isBrowserConnectionFailure) {
    return {
      stageCode: 'browser_connection',
      stageLabel: '浏览器接入',
      statusLabel: '未检测到浏览器调试会话',
      manualActionRequired: false,
      manualActionReason: ''
    };
  }

  if (manualActionReason === 'captcha' || /验证码|captcha/i.test(message)) {
    return {
      stageCode: 'login_gate',
      stageLabel: '登录门槛',
      statusLabel: '需完成验证码后继续',
      manualActionRequired: true,
      manualActionReason: 'captcha'
    };
  }

  if (manualActionReason === 'risk_control' || /300011|406|账号异常|风控|频率|限流|rate/i.test(message)) {
    return {
      stageCode: 'comment_permission',
      stageLabel: '评论接口受限',
      statusLabel: '评论接口受限或账号异常',
      manualActionRequired: true,
      manualActionReason: 'risk_control'
    };
  }

  if (
    manualActionReason === 'login_required'
    || commentWarningCode === 'comment_login_required'
    || /登录查看全部评论内容|无登录信息|未登录|请先登录|登录后查看|login required|sign in/i.test(message)
  ) {
    return {
      stageCode: 'login_gate',
      stageLabel: '登录门槛',
      statusLabel: '登录后可继续抓取评论',
      manualActionRequired: true,
      manualActionReason: 'login_required'
    };
  }

  if (
    /300031|暂时无法浏览|无法打开笔记详情页/i.test(message)
    || /current tab is not a xiaohongshu note detail page/i.test(normalized)
    || /no xiaohongshu tab found/i.test(normalized)
  ) {
    let statusLabel = '无法打开详情页';
    if (/300031|暂时无法浏览|无法打开笔记详情页/i.test(message)) {
      statusLabel = '网页端不可见，300031';
    } else if (/current tab is not a xiaohongshu note detail page/i.test(normalized)) {
      statusLabel = '当前标签不是笔记详情页';
    } else if (/no xiaohongshu tab found/i.test(normalized)) {
      statusLabel = '未找到小红书标签页';
    }
    return {
      stageCode: 'detail_page',
      stageLabel: '打开详情页',
      statusLabel,
      manualActionRequired: false,
      manualActionReason: ''
    };
  }

  if (
    commentWarningCode === 'comment_incomplete'
    || /评论可能未完整加载|评论未完整加载|页面显示共 .*当前抓取 .*条|comment.*incomplete/i.test(message)
  ) {
    return {
      stageCode: 'comment_loading',
      stageLabel: '评论加载',
      statusLabel: '评论未完整加载',
      manualActionRequired: false,
      manualActionReason: ''
    };
  }

  return {
    stageCode: 'unknown',
    stageLabel: '',
    statusLabel: message || '失败',
    manualActionRequired: false,
    manualActionReason: ''
  };
}

function buildErrorDisplay(errorMessage = '') {
  const message = String(errorMessage || '').trim();
  const normalized = message.toLowerCase();
  const hints = [];
  const actions = [];
  const issue = classifyFailure({}, message);

  if (issue.stageCode === 'browser_connection') {
    pushUnique(hints, '可直接点“一键修复”，自动切到项目隔离浏览器并打开登录窗口');
    pushUnique(hints, '如果你想继续复用当前 Chrome，请先在 chrome://inspect/#remote-debugging 打开 Remote debugging');
    actions.push(
      { id: 'repair_browser_session', label: '一键修复', tone: 'secondary' },
      { id: 'open_browser_settings', label: '浏览器设置', tone: 'ghost' },
      { id: 'refresh_browser_status', label: '重新检测', tone: 'ghost' }
    );
  }

  if (issue.stageCode === 'login_gate') {
    pushUnique(hints, '请先在当前浏览器完成登录或验证码处理，处理后再点“重新检测”或重新执行。');
    pushUnique(hints, '如果当前模式是 current-browser，请直接在你正在使用的 Chrome 标签页里处理。');
    actions.push(
      { id: 'open_login_browser', label: '一键修复', tone: 'secondary' },
      { id: 'refresh_browser_status', label: '重新检测', tone: 'ghost' },
      { id: 'open_browser_settings', label: '浏览器设置', tone: 'ghost' }
    );
  }

  if (issue.stageCode === 'comment_permission') {
    pushUnique(hints, '请先在当前浏览器处理账号状态、风控或限流，处理后再回来继续。');
    pushUnique(hints, '如果问题持续存在，可切换账号或降低抓取频率后重试。');
    actions.push(
      { id: 'open_login_browser', label: '一键修复', tone: 'secondary' },
      { id: 'refresh_browser_status', label: '重新检测', tone: 'ghost' },
      { id: 'open_browser_settings', label: '浏览器设置', tone: 'ghost' }
    );
  }

  if (issue.stageCode === 'detail_page') {
    pushUnique(hints, '这条笔记当前网页端可能不可见，可改在 App 内确认或稍后重试。');
  }

  if (issue.stageCode === 'comment_loading') {
    pushUnique(hints, '页面评论可能还没完全展开，可稍后重试，或改为降低采集频率后再试。');
  }

  if (/登录|未登录|账号|cookie|session|auth|login|sign in/.test(message)) {
    pushUnique(hints, '请在 Chrome 调试窗口重新登录后重试');
  }
  if (/频率|过快|限流|timeout|超时|too many|rate/.test(message) || /timeout/.test(normalized)) {
    pushUnique(hints, '降低采集频率，稍后重试');
  }
  if (/账号异常|异常/.test(message)) {
    pushUnique(hints, '账号异常可尝试切换账号或等待恢复');
  }
  if (hints.length === 0) {
    pushUnique(hints, '查看日志或稍后重试');
  }

  let title = '失败';
  if (issue.stageCode === 'browser_connection') {
    title = '浏览器接入失败';
  } else if (issue.stageCode === 'detail_page') {
    title = '打开详情页失败';
  } else if (issue.stageCode === 'comment_loading') {
    title = '评论加载有提示';
  } else if (issue.stageCode === 'comment_permission') {
    title = '评论接口受限';
  } else if (issue.stageCode === 'login_gate') {
    title = '登录门槛';
  }

  return {
    title,
    message: message || '未知错误，请查看日志或稍后重试。',
    hints,
    actions
  };
}

function describeCommentWarningCode(code = '') {
  const value = String(code || '').trim();
  if (value === 'comment_login_required') return '登录后才能抓全评论';
  if (value === 'comment_incomplete') return '评论未抓全';
  if (value === 'comment_warning') return '评论采集有提示';
  return value;
}

function describeManualActionReason(reason = '') {
  const value = String(reason || '').trim();
  if (value === 'login_required') return '登录后继续';
  if (value === 'captcha') return '验证码处理后继续';
  if (value === 'risk_control') return '风控或账号状态处理后继续';
  return value;
}

function describeWarning(warning = {}) {
  const code = String(warning.code || '').trim();
  const message = String(warning.message || '').trim();

  const codeLabel = describeCommentWarningCode(code);
  if (codeLabel) {
    if (code === 'comment_login_required') {
      return '评论剩余内容需登录后查看';
    }
    return codeLabel;
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

  if (status !== 'failed') {
    return status === 'success' ? '成功' : (status || '');
  }
  const issue = classifyFailure(result);
  return issue.statusLabel || readResultString(result, 'error') || '失败';
}

function describeResultFailureStage(result = {}) {
  const issue = classifyFailure(result);
  return issue.stageLabel;
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
    describeCommentWarningCode,
    describeManualActionReason,
    describePlatform,
    describeResultFailureStage,
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
    describeCommentWarningCode,
    describeManualActionReason,
    describePlatform,
    describeResultFailureStage,
    describeSavedCollection,
    describeWarning,
    describeResultStatus
  };
}
