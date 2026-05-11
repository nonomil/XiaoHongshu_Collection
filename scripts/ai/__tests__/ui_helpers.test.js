const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

let helpers;
try {
  helpers = require('../../../ui/ui_helpers');
} catch (error) {
  helpers = null;
}

test('buildSummaryItems returns compact tokens', () => {
  assert.ok(helpers, 'ui_helpers module should exist');
  const items = helpers.buildSummaryItems({
    paths: { saveLinksOutputRoot: 'output/single-note' },
    naming: { conflictStrategy: 'content-aware' },
    runtime: {
      autoClassifyLinksEnabled: true,
      aiSummaryEnabled: false,
      visionOcrEnabled: false,
      ocrFallbackEnabled: false,
      maxImagesPerNote: 12
    }
  });
  assert.equal(items.length >= 3, true);
});

test('buildSummaryItems includes auto classify status', () => {
  assert.ok(helpers, 'ui_helpers module should exist');
  const items = helpers.buildSummaryItems({
    runtime: {
      autoClassifyLinksEnabled: false,
      aiSummaryEnabled: true,
      visionOcrEnabled: true,
      ocrFallbackEnabled: true
    }
  });
  assert.equal(items.some((item) => /分类/.test(item.label)), true);
});

test('describePlatform maps article source types to readable labels', () => {
  assert.ok(helpers, 'ui_helpers module should exist');
  assert.equal(helpers.describePlatform({ platform: 'wechat', sourceType: 'wechat_article' }), '微信公众号');
  assert.equal(helpers.describePlatform({ platform: 'zhihu', sourceType: 'zhihu_answer' }), '知乎');
  assert.equal(helpers.describePlatform({ platform: 'csdn', sourceType: 'csdn_article' }), 'CSDN');
});

test('modal helpers toggle open state', () => {
  assert.ok(helpers, 'ui_helpers module should exist');
  const dom = new JSDOM('<div id="overlay" hidden></div><div id="modal" hidden></div>');
  const overlay = dom.window.document.getElementById('overlay');
  const modal = dom.window.document.getElementById('modal');
  helpers.openSettingsModal({ overlay, modal });
  assert.equal(overlay.hidden, false);
  assert.equal(modal.hidden, false);
  helpers.closeSettingsModal({ overlay, modal });
  assert.equal(overlay.hidden, true);
  assert.equal(modal.hidden, true);
});

test('buildErrorDisplay returns hints for login related errors', () => {
  assert.ok(helpers, 'ui_helpers module should exist');
  const result = helpers.buildErrorDisplay('login required, please sign in again');
  assert.match(result.message, /login|sign in/i);
  assert.equal(result.hints.some((hint) => /login|chrome/i.test(hint)), true);
});

test('buildErrorDisplay returns fallback message when empty', () => {
  assert.ok(helpers, 'ui_helpers module should exist');
  const result = helpers.buildErrorDisplay('');
  assert.match(result.message, /unknown|未知/i);
});

test('buildErrorDisplay returns repair actions for browser connection failures', () => {
  assert.ok(helpers, 'ui_helpers module should exist');
  const result = helpers.buildErrorDisplay('Chrome remote debugging is not available on port 9222.');
  assert.equal(Array.isArray(result.actions), true);
  assert.deepEqual(
    result.actions.map((item) => item.id),
    ['repair_browser_session', 'open_browser_settings', 'refresh_browser_status']
  );
});

test('buildErrorDisplay returns note unavailable hint for 300031-style errors', () => {
  assert.ok(helpers, 'ui_helpers module should exist');
  const result = helpers.buildErrorDisplay('error_code=300031 当前笔记暂时无法浏览');
  assert.match(result.message, /300031|无法浏览/);
  assert.equal(result.hints.some((hint) => /App|网页|稍后/i.test(hint)), true);
});

test('describeWarning maps login-gated comment warnings to short labels', () => {
  assert.ok(helpers, 'ui_helpers module should exist');
  const label = helpers.describeWarning({ code: 'comment_login_required' });
  assert.match(label, /登录|评论/);
});

test('describeCommentWarningCode maps warning code to readable labels', () => {
  assert.ok(helpers, 'ui_helpers module should exist');
  assert.match(helpers.describeCommentWarningCode('comment_login_required'), /登录/);
  assert.match(helpers.describeCommentWarningCode('comment_incomplete'), /未抓全|未完整/);
});

test('describeResultStatus maps note unavailable failures to short labels', () => {
  assert.ok(helpers, 'ui_helpers module should exist');
  const label = helpers.describeResultStatus({
    status: 'failed',
    error: '无法打开笔记详情页：当前笔记暂时无法浏览（error_code=300031）。'
  });
  assert.match(label, /300031|不可见|暂时无法浏览/);
});

test('describeResultStatus maps account abnormal failures to short labels', () => {
  assert.ok(helpers, 'ui_helpers module should exist');
  const label = helpers.describeResultStatus({
    status: 'failed',
    error: '评论接口返回：当前账号存在异常，请切换账号或重新登录。'
  });
  assert.match(label, /账号|登录/);
});

test('describeResultFailureStage maps browser connection failures to layered stage', () => {
  assert.ok(helpers, 'ui_helpers module should exist');
  const label = helpers.describeResultFailureStage({
    status: 'failed',
    error: 'Chrome remote debugging is not available on port 9222.'
  });
  assert.match(label, /浏览器接入/);
});

test('describeResultFailureStage maps note detail failures to layered stage', () => {
  assert.ok(helpers, 'ui_helpers module should exist');
  const label = helpers.describeResultFailureStage({
    status: 'failed',
    error: '无法打开笔记详情页：当前笔记暂时无法浏览（error_code=300031）。'
  });
  assert.match(label, /详情页|打开详情页/);
});

test('describeResultFailureStage maps comment loading failures to layered stage', () => {
  assert.ok(helpers, 'ui_helpers module should exist');
  const label = helpers.describeResultFailureStage({
    status: 'failed',
    error: '评论可能未完整加载：页面显示共 40 条，当前抓取 3 条。'
  });
  assert.match(label, /评论加载/);
});

test('describeResultFailureStage maps comment api restriction failures to layered stage', () => {
  assert.ok(helpers, 'ui_helpers module should exist');
  const label = helpers.describeResultFailureStage({
    status: 'failed',
    error: '评论接口返回：当前账号存在异常，请切换账号后重试（code=300011）。'
  });
  assert.match(label, /评论接口受限/);
});

test('describeResultFailureStage maps login gate failures to layered stage', () => {
  assert.ok(helpers, 'ui_helpers module should exist');
  const label = helpers.describeResultFailureStage({
    status: 'failed',
    error: '当前网页端提示“登录查看全部评论内容”，请先在当前 Chrome 会话中登录后重试。'
  });
  assert.match(label, /登录门槛/);
});

test('describeManualActionReason maps manual takeover reason to readable labels', () => {
  assert.ok(helpers, 'ui_helpers module should exist');
  assert.match(helpers.describeManualActionReason('login_required'), /登录/);
  assert.match(helpers.describeManualActionReason('captcha'), /验证码/);
  assert.match(helpers.describeManualActionReason('risk_control'), /风控|账号/);
});

test('buildErrorDisplay returns manual handoff hints for login gate failures', () => {
  assert.ok(helpers, 'ui_helpers module should exist');
  const result = helpers.buildErrorDisplay('当前网页端提示“登录查看全部评论内容”，请先在当前 Chrome 会话中登录后重试。');
  assert.match(result.title, /登录门槛/);
  assert.equal(result.hints.some((hint) => /当前浏览器|处理后/.test(hint)), true);
  assert.equal(result.actions.some((action) => action.id === 'open_login_browser'), true);
  assert.equal(result.actions.some((action) => action.id === 'refresh_browser_status'), true);
});

test('describeSavedCollection derives final folder name from filepath', () => {
  assert.ok(helpers, 'ui_helpers module should exist');
  const label = helpers.describeSavedCollection({
    status: 'success',
    filepath: 'G:/output/工具/告别美工.md'
  });
  assert.equal(label, '工具');
});
