const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const path = require('node:path');

function buildDom() {
  return new JSDOM(`<!DOCTYPE html>
<html>
<body>
  <form id="links-form"></form>
  <textarea id="links-text"></textarea>
  <button id="links-submit"></button>
  <button id="links-clear"></button>
  <button id="collection-submit"></button>
  <p id="status-text"></p>
  <pre id="result-output"></pre>
  <div id="result-summary"></div>
  <details id="raw-report"></details>
  <div id="progress-list"></div>
  <section id="summary-row"></section>

  <button id="open-settings"></button>
  <button id="close-settings"></button>
  <div id="settings-overlay"></div>
  <div id="settings-modal"></div>

  <form id="config-form"></form>
  <p id="config-status"></p>
  <button id="config-reload"></button>
  <button id="config-save"></button>

  <input id="path-links-output" />
  <input id="path-links-images" />
  <input id="path-collection-output" />
  <input id="path-collection-raw" />
  <select id="naming-strategy"></select>
  <input id="naming-max-length" />
  <input id="runtime-ai" type="checkbox" />
  <input id="runtime-vision" type="checkbox" />
  <input id="runtime-ocr-fallback" type="checkbox" />
  <input id="runtime-openrouter-timeout" />
  <input id="runtime-vision-timeout" />
  <input id="runtime-max-images" />
  <input id="ui-show-raw" type="checkbox" />

  <section id="error-banner" hidden>
    <strong id="error-title"></strong>
    <p id="error-message"></p>
    <ul id="error-hints"></ul>
    <button id="error-dismiss"></button>
  </section>
</body>
</html>`, { url: 'http://localhost' });
}

test('collection error triggers error banner', async () => {
  const dom = buildDom();
  global.window = dom.window;
  global.document = dom.window.document;

  const helpersPath = path.join('G:/UserCode/XiaoHongshu_Collection/.worktrees/codex/collection-report-ui/ui/ui_helpers.js');
  const helpers = require(helpersPath);
  global.window.XhsUiHelpers = helpers;

  global.fetch = async (url, init) => {
    const isGet = !init || init.method === 'GET';
    if (String(url).includes('/api/ui-config') && isGet) {
      return {
        ok: true,
        json: async () => ({ config: { paths: {}, naming: {}, runtime: {}, ui: {} } }),
        headers: { get: () => 'application/json' }
      };
    }
    if (String(url).includes('/api/save-collection')) {
      return {
        ok: false,
        json: async () => ({ error: 'Î´¼ì²âµ½µÇÂ¼ÕËºÅ£¬ÇëÏÈµÇÂ¼ºóÖØÊÔ¡£' }),
        headers: { get: () => 'application/json' }
      };
    }
    return {
      ok: true,
      json: async () => ({}),
      headers: { get: () => 'application/json' }
    };
  };

  const appPath = path.join('G:/UserCode/XiaoHongshu_Collection/.worktrees/codex/collection-report-ui/ui/app.js');
  require(appPath);

  const button = dom.window.document.getElementById('collection-submit');
  button.click();

  await new Promise((resolve) => setTimeout(resolve, 0));

  const banner = dom.window.document.getElementById('error-banner');
  const message = dom.window.document.getElementById('error-message');
  assert.equal(banner.hidden, false);
  assert.match(message.textContent, /µÇÂ¼/);
});
