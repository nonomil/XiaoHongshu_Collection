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
