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

test('describeSavedCollection derives final folder name from filepath', () => {
  assert.ok(helpers, 'ui_helpers module should exist');
  const label = helpers.describeSavedCollection({
    status: 'success',
    filepath: 'G:/output/工具/告别美工.md'
  });
  assert.equal(label, '工具');
});
