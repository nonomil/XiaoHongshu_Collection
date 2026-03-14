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
    paths: { saveLinksOutputRoot: 'output/单条笔记保存' },
    naming: { conflictStrategy: 'content-aware' },
    runtime: {
      aiSummaryEnabled: false,
      visionOcrEnabled: false,
      ocrFallbackEnabled: false,
      maxImagesPerNote: 12
    }
  });
  assert.equal(items.length >= 3, true);
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
  const result = helpers.buildErrorDisplay('未检测到登录账号，请在 Chrome 调试窗口登录后重试。');
  assert.match(result.title, /失败/);
  assert.match(result.message, /登录/);
  assert.equal(result.hints.some((hint) => /登录/.test(hint)), true);
});

test('buildErrorDisplay returns fallback message when empty', () => {
  assert.ok(helpers, 'ui_helpers module should exist');
  const result = helpers.buildErrorDisplay('');
  assert.match(result.message, /未知/);
});
